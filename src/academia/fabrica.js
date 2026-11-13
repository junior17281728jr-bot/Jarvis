// Academia 0.13.0: la «Fábrica de materias». Con la clave de Claude funcionando y las fuentes en la carpeta privada
// (src/academia/fuentes.js), el trabajador fabrica SOLO las materias 2–11 con la calidad de la Materia 1, materia por
// materia y tema por tema, y las publica como versiones normales de paquete (que siguen sirviendo sin la API).
//
// Cada paso de la tarea 'academia.fabrica' hace UNA cosa corta y la deja guardada (filas de «ajustes»; nada se borra):
//   fuentes (traer de Drive, cada hora como mucho) → por tema: [extracto] → plan → tarjetas-1..n → preguntas-1..k → cierre →
//   extra → verificar → (al terminar los temas) armar: el paquete se arma en código, el Test Guide se copia TAL CUAL de
//   tg.json (y se comprueba byte a byte), se revisa con formato.js y se guarda como versión nueva. Limpio → se publica
//   solo (y avisa por Telegram); con dudas → «Esperando revisión del admin» con la lista.
// Lo que manda: el siguiente paso sale SIEMPRE de lo guardado (el «punto» de la tarea queda vacío), así un corte de luz,
// un reinicio o una actualización siguen exactamente donde quedó. La llamada se anota por (tarea, propósito, paso) y lo
// que respondió se guarda en la MISMA escritura que su costo (guardar): nunca se paga dos veces.
// Nunca llama a la IA si: la fábrica está en pausa o terminada, no hay fuentes, la IA está apagada, la clave no sirve
// o está en pausa, el tope propio (US$20) o el general no alcanzan, o se usó su parte de las llamadas de la hora.
// Después de una respuesta que no sirvió espera 35 minutos (tres seguidas pausarían la clave para todos).
import { createHash } from 'node:crypto';
import { existsSync, linkSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { MATERIAS, revisarPaquete, LIMITES, ID_VALIDO } from './formato.js';
import { normalizar } from './reto-calidad.js';
import { guardarAjuste, leerAjuste, guardarJson, aceptarRecurso, rutaDeRecurso, activarPaquete, huellaDeArchivo, leerEnUso } from './paquetes.js';
import {
  carpetaFuentes, estadoFuentes, sincronizarFuentes, leerManifiesto, leerLecturas, textoDeLectura, preguntasDeTema, imagenesDeTema,
} from './fuentes.js';
import { REGLAS_ESCRITURA, REGLAS_VERIFICACION, ESQUEMAS, TAREAS, datos } from './fabrica-prompts.js';
import { tarjetaConVisual, revisarDiagrama, TIPOS_DIAGRAMA } from './diagramas.js';
import { abrirAviso } from '../avisos/avisos.js';
import { leerConfigIa } from '../ia/config.js';
import { elegirProveedor, modelosDe, partesPorHora } from '../ia/presupuesto.js';
import { gastoMicro, GASTO_SQL } from '../ia/gasto.js';
import { reservaMicro } from '../ia/precios.js';
import { PROPOSITOS, PROPOSITOS_FABRICA, PROPOSITOS_MEJORA } from '../ia/propositos.js';
import { mesCobro } from '../tareas/tiempo.js';
import { mejorar } from './fabrica-mejora.js';

export const AJUSTE_CONFIG = 'fabrica.config';
export const AJUSTE_GENERAL = 'fabrica.estado';
export const LIBRO_TG = Object.freeze({ id: 'test-guide', titulo: 'Test Guide (preguntas del examen)', idioma: 'es' });
export const CONFIG_FABRICA = Object.freeze({ pausada: false, topeMicro: 20_000_000, oral: false, mejora: Object.freeze({ activa: true, topeMesMicro: 2_000_000 }) });
export const LIMITES_FABRICA = Object.freeze({ topeMaxMicro: 100_000_000, mejoraMaxMicro: 20_000_000 });
export const T = Object.freeze({
  lecturaDirectaBytes: 60_000, // más que esto: primero Haiku saca los pasajes (extracto)
  verificarBytes: 170_000,
  tarjetasPorPaso: 3, preguntasPorPaso: 3, intentos: 2,
  esperaFallaMs: 35 * 60_000, esperaPasajeroMs: 10 * 60_000, sincronizarCadaMs: 3_600_000, sincronizarTerminadaMs: 6 * 3_600_000,
  margenGeneral: 0.2, // la fábrica deja siempre libre el 20 % del tope general del mes (para los alumnos)
  paqueteMaxBytes: 4 * 1024 * 1024,
});
const ESTADOS_LISTOS = new Set(['publicada', 'revision', 'ya_publicada']);
const iso = ms => new Date(ms).toISOString();
const corto = (t, n = 16) => createHash('sha256').update(String(t)).digest('hex').slice(0, n);
const leerJsonAjuste = (db, clave) => { try { const v = JSON.parse(leerAjuste(db, clave) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };

// ---------- Configuración y estado ----------
export function leerConfigFabrica(db) {
  const v = leerJsonAjuste(db, AJUSTE_CONFIG) ?? {};
  const tope = Number.isSafeInteger(v.topeMicro) && v.topeMicro >= 0 && v.topeMicro <= LIMITES_FABRICA.topeMaxMicro ? v.topeMicro : CONFIG_FABRICA.topeMicro;
  const m = v.mejora ?? {};
  return {
    pausada: v.pausada === true, topeMicro: tope, oral: v.oral === true,
    mejora: { activa: m.activa !== false, topeMesMicro: Number.isSafeInteger(m.topeMesMicro) && m.topeMesMicro >= 0 && m.topeMesMicro <= LIMITES_FABRICA.mejoraMaxMicro ? m.topeMesMicro : CONFIG_FABRICA.mejora.topeMesMicro },
  };
}
export function guardarConfigFabrica(db, cambios) {
  const actual = leerConfigFabrica(db);
  const nueva = { ...actual, ...cambios, mejora: { ...actual.mejora, ...(cambios.mejora ?? {}) } };
  guardarAjuste(db, AJUSTE_CONFIG, JSON.stringify(nueva));
  return leerConfigFabrica(db);
}
const claveMateria = materia => `fabrica.materia.${materia}`;
export function estadoMateria(db, materia) {
  const v = leerJsonAjuste(db, claveMateria(materia));
  return { gen: 1, estado: 'pendiente', version: null, dudas: [], corregidos: [], hechos: [], ...(v ?? {}) };
}
export const guardarMateria = (db, materia, valor) => guardarAjuste(db, claveMateria(materia), JSON.stringify(valor));
export const estadoGeneral = db => ({ espera: null, esperaHasta: null, ultimaSync: null, terminada: false, ...(leerJsonAjuste(db, AJUSTE_GENERAL) ?? {}) });
const guardarGeneral = (db, cambios) => guardarAjuste(db, AJUSTE_GENERAL, JSON.stringify({ ...estadoGeneral(db), ...cambios }));
const claveSalida = (materia, gen, tema, paso) => `fabrica.salida.${materia}.g${gen}.${tema}.${paso}`;
export const leerSalida = (db, materia, gen, tema, paso) => leerJsonAjuste(db, claveSalida(materia, gen, tema, paso));

// ---------- El gasto ----------
const enLista = lista => `(${lista.map(() => '?').join(', ')})`;
export function gastoFabricaMicro(db, { materia = null } = {}) {
  if (materia) return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(PROPOSITOS_FABRICA)} AND paso LIKE ?`).get(...PROPOSITOS_FABRICA, `f:${materia}:%`).g;
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(PROPOSITOS_FABRICA)}`).get(...PROPOSITOS_FABRICA).g;
}
export function gastoMejoraMesMicro(db, ahora) {
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE mes = ? AND proposito IN ${enLista(PROPOSITOS_MEJORA)}`).get(mesCobro(ahora), ...PROPOSITOS_MEJORA).g;
}
// Cuántas llamadas puede hacer la fábrica (y la mejora) en una hora: la mitad de las de la hora, y solo mientras quede
// libre un tercio para los alumnos y el dueño.
export function cuotaHora(cfgIa) {
  const p = partesPorHora(cfgIa.llamadasPorHora);
  return { propia: Math.max(1, Math.floor(p.total / 2)), libre: Math.max(1, Math.ceil(p.total / 3)), total: p.total };
}

// ¿Se puede llamar ahora? Sin red y sin escribir nada. → { ok, motivo?, esperarMs? }
export function puedeLlamar(db, config, { proposito, bytes, ahora, topeMicro, gastado }) {
  const def = PROPOSITOS[proposito];
  const cfg = leerConfigIa(db);
  if (!cfg.encendida) return { ok: false, motivo: 'ia_apagada' };
  const e = elegirProveedor(db, config, cfg, ahora, modelosDe(def, cfg));
  if (!e.ok) return { ok: false, motivo: e.motivo };
  if (e.proveedor !== 'anthropic') return { ok: false, motivo: 'proveedor_no_usado' };
  const reserva = reservaMicro(e.precio, { entradaMax: bytes + 200, salidaMax: def.salidaMax });
  if (reserva > def.maximoMicro) return { ok: false, motivo: 'demasiado_largo' };
  if (gastado + reserva > topeMicro) return { ok: false, motivo: 'tope_fabrica' };
  const usado = gastoMicro(db, { mes: mesCobro(ahora) });
  if (usado + reserva > Math.floor(cfg.topeGeneralMicro * (1 - T.margenGeneral))) return { ok: false, motivo: 'tope_general' };
  const cuota = cuotaHora(cfg);
  const desde = iso(ahora - 3_600_000);
  const todas = db.prepare('SELECT COUNT(*) AS n, MIN(creada_en) AS primera FROM ia_llamadas WHERE creada_en >= ?').get(desde);
  const propias = db.prepare(`SELECT COUNT(*) AS n, MIN(creada_en) AS primera FROM ia_llamadas WHERE creada_en >= ? AND proposito IN ${enLista([...PROPOSITOS_FABRICA, ...PROPOSITOS_MEJORA])}`)
    .get(desde, ...PROPOSITOS_FABRICA, ...PROPOSITOS_MEJORA);
  if (propias.n >= cuota.propia || todas.n >= cuota.total - cuota.libre) {
    const primera = Date.parse((propias.n >= cuota.propia ? propias.primera : todas.primera) ?? '') || ahora;
    return { ok: false, motivo: 'demasiadas_llamadas', esperarMs: Math.max(60_000, primera + 3_600_000 - ahora + 5_000) };
  }
  return { ok: true, reserva };
}

// ---------- El plan de trabajo ----------
// Lo que la fábrica tiene que hacer con estas fuentes, por pista y materia (también lo que salta porque ya está publicado).
export function planDeTrabajo(db, config) {
  const dir = carpetaFuentes(config);
  const man = leerManifiesto(dir);
  const fuentes = estadoFuentes(db);
  if (!man || !fuentes?.ok) return { fuentes: Boolean(fuentes?.ok), materias: [], oral: { hay: Boolean(fuentes?.oral), activa: false, capitulos: [] } };
  const enUso = leerEnUso(db);
  const propias = new Set();
  const materias = [...man.materias].sort((a, b) => MATERIAS.indexOf(a.id) - MATERIAS.indexOf(b.id)).map(m => {
    const e = estadoMateria(db, m.id);
    if (e.version) propias.add(e.version);
    const publicadaFuera = enUso.some(x => x.id !== e.version && !(e.versiones ?? []).includes(x.id) && (x.materias ?? []).includes(m.id));
    return { id: m.id, num: m.num, nombre: m.nombre, temas: m.temas.map(t => ({ id: t.id, titulo: t.titulo, tg: t.tg.length })), yaPublicada: publicadaFuera, estado: e };
  });
  return { fuentes: true, materias, oral: { hay: Boolean(fuentes.oral), activa: leerConfigFabrica(db).oral, capitulos: [] } };
}

// Los pasos de un tema, según lo ya guardado (el plan dice cuántas tarjetas). → [{ paso, tipo, ... }]
export function pasosDeTema(db, materia, gen, tema, { largo, preguntas }) {
  const pasos = [];
  if (largo > T.lecturaDirectaBytes) pasos.push({ paso: 'extracto', proposito: 'fabrica_verificar', tipo: 'extracto' });
  pasos.push({ paso: 'plan', proposito: 'fabrica_escribir', tipo: 'plan' });
  const plan = leerSalida(db, materia, gen, tema, 'plan');
  const n = plan?.json?.tarjetas?.length ?? 6;
  for (let i = 0; i < Math.ceil(n / T.tarjetasPorPaso); i++) pasos.push({ paso: `tarjetas-${i + 1}`, proposito: 'fabrica_escribir', tipo: 'tarjetas', desde: i * T.tarjetasPorPaso, estimado: !plan });
  for (let i = 0; i < Math.ceil(preguntas / T.preguntasPorPaso); i++) pasos.push({ paso: `preguntas-${i + 1}`, proposito: 'fabrica_escribir', tipo: 'preguntas', desde: i * T.preguntasPorPaso });
  pasos.push({ paso: 'cierre', proposito: 'fabrica_escribir', tipo: 'cierre' });
  pasos.push({ paso: 'extra', proposito: 'fabrica_escribir', tipo: 'extra' });
  pasos.push({ paso: 'verificar', proposito: 'fabrica_verificar', tipo: 'verificar' });
  return pasos;
}
// Un paso está hecho si tiene su salida buena, o si ya no se intenta más (fallido, queda como duda).
const hecho = s => Boolean(s && (s.json || s.fallido));

// ---------- Armar lo de cada paso (pedidos) ----------
function contexto(dir, man, m, t) {
  const titulos = new Map(man.libros.map(l => [l.id, l.titulo]));
  const lectura = leerLecturas(dir, t);
  const texto = textoDeLectura(lectura.partes, titulos);
  return { titulos, lectura, texto, largo: Buffer.byteLength(texto), preguntas: preguntasDeTema(dir, m.id, t.id) ?? [], imagenes: imagenesDeTema(dir, m.id, t.id) };
}
const tgParaModelo = qs => qs.map(q => ({ id: q.id, enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta, explicacion: q.explicacion }));
const fotosParaModelo = imgs => imgs.filter(x => x.libro).map(x => ({ archivo: x.archivo, libro: x.libro, pagina: x.pagina, pie: x.pie }));

function pedidoDe(db, c, materia, gen, t, p) {
  const extracto = leerSalida(db, materia, gen, t.id, 'extracto')?.json?.pasajes;
  const lectura = extracto ? extracto.map(x => `[${c.titulos.get(x.libro) ?? x.libro}, p. ${x.pagina}]\n${x.texto}`).join('\n\n') : c.texto;
  const sistema = `${REGLAS_ESCRITURA}\n\nTEMA: ${t.titulo}\n\nLECTURA DEL LIBRO (con sus páginas):\n${datos(lectura)}`;
  const plan = leerSalida(db, materia, gen, t.id, 'plan')?.json?.tarjetas ?? [];
  const tg = tgParaModelo(c.preguntas);
  switch (p.tipo) {
    case 'extracto': return { sistema: `${REGLAS_VERIFICACION}\n\nLECTURA COMPLETA:\n${datos(c.texto.slice(0, T.verificarBytes))}`, texto: `${TAREAS.extracto}\n${datos({ tema: t.titulo, test_guide: tg })}`, esquema: ESQUEMAS.extracto };
    case 'plan': return { sistema, texto: `${TAREAS.plan}\n${datos({ test_guide: tg, fotos_del_libro: fotosParaModelo(c.imagenes) })}`, esquema: ESQUEMAS.plan };
    case 'tarjetas': {
      const parte = plan.slice(p.desde, p.desde + T.tarjetasPorPaso);
      const ids = new Set(parte.flatMap(x => x.preguntas ?? []));
      return { sistema, texto: `${TAREAS.tarjetas}\n${datos({ tarjetas: parte, test_guide: tg.filter(q => ids.has(q.id)), fotos_del_libro: fotosParaModelo(c.imagenes), dibujos: TIPOS_DIAGRAMA })}`, esquema: ESQUEMAS.tarjetas };
    }
    case 'preguntas': return { sistema, texto: `${TAREAS.preguntas}\n${datos({ test_guide: tg.slice(p.desde, p.desde + T.preguntasPorPaso) })}`, esquema: ESQUEMAS.preguntas };
    case 'cierre': {
      const hechas = tarjetasDeTema(db, materia, gen, t.id).map(x => ({ titulo: x.titulo, recuerda: x.recuerda }));
      return { sistema, texto: `${TAREAS.cierre}\n${datos({ tarjetas: hechas })}`, esquema: ESQUEMAS.cierre };
    }
    case 'extra': return { sistema, texto: `${TAREAS.extra}\n${datos({ ya_en_el_tema: plan.map(x => x.titulo), test_guide: tg.map(q => q.enunciado) })}`, esquema: ESQUEMAS.extra };
    case 'verificar': {
      const contenido = contenidoParaVerificar(db, materia, gen, t.id, c.preguntas);
      return { sistema: `${REGLAS_VERIFICACION}\n\nLECTURA COMPLETA:\n${datos(c.texto.slice(0, T.verificarBytes))}`, texto: `${TAREAS.verificar}\n${datos({ clave_test_guide: tg.map(q => ({ id: q.id, correcta: q.opciones[q.correcta] })), contenido })}`, esquema: ESQUEMAS.verificar };
    }
    default: throw new Error('paso desconocido');
  }
}
function tarjetasDeTema(db, materia, gen, tema) {
  const out = [];
  for (let i = 1; i < 40; i++) {
    const s = leerSalida(db, materia, gen, tema, `tarjetas-${i}`);
    if (!s) break;
    out.push(...(s.json?.tarjetas ?? []));
  }
  return out;
}
function adicionesDeTema(db, materia, gen, tema) {
  const out = new Map();
  for (let i = 1; i < 400; i++) {
    const s = leerSalida(db, materia, gen, tema, `preguntas-${i}`);
    if (!s) break;
    for (const q of s.json?.preguntas ?? []) out.set(q.id, q);
  }
  return out;
}
function contenidoParaVerificar(db, materia, gen, tema, preguntas) {
  const ad = adicionesDeTema(db, materia, gen, tema);
  return {
    tarjetas: tarjetasDeTema(db, materia, gen, tema).map(x => ({ titulo: x.titulo, puntos: x.puntos, recuerda: x.recuerda, ejemplo: x.ejemplo, visual: x.visual?.parametros ?? null })),
    preguntas: preguntas.map(q => ({ id: q.id, correcta: q.opciones[q.correcta], ...(ad.get(q.id) ? { sencilla: ad.get(q.id).sencilla, errores: ad.get(q.id).errores, reto: ad.get(q.id).reto } : {}) })),
    extra: leerSalida(db, materia, gen, tema, 'extra')?.json ?? null,
  };
}

// ---------- Revisar lo que respondió (código, sin IA) ----------
// → { ok } o { ok: false, motivo }: lo que no está bien armado se pide otra vez (como mucho T.intentos veces).
function revisarSalida(p, json, c, plan) {
  const letrasDe = q => Object.keys(q.opciones);
  switch (p.tipo) {
    case 'extracto': return json.pasajes.length ? { ok: true } : { ok: false, motivo: 'vacio' };
    case 'plan': {
      if (json.tarjetas.length < 3 || json.tarjetas.length > 14) return { ok: false, motivo: 'tarjetas_no_validas' };
      const cubiertas = new Set(json.tarjetas.flatMap(x => x.preguntas));
      const falta = c.preguntas.find(q => !cubiertas.has(q.id));
      return falta ? { ok: false, motivo: 'pregunta_sin_tarjeta' } : { ok: true };
    }
    case 'tarjetas': {
      const esperadas = plan.slice(p.desde, p.desde + T.tarjetasPorPaso).length;
      if (json.tarjetas.length !== esperadas) return { ok: false, motivo: 'tarjetas_no_validas' };
      for (const x of json.tarjetas) {
        if (!x.puntos.length || x.puntos.length > 4) return { ok: false, motivo: 'puntos' };
        if (!tarjetaConVisual(seccionDe(x, c, null))) return { ok: false, motivo: 'sin_visual' };
      }
      return { ok: true };
    }
    case 'preguntas': {
      const pedidas = c.preguntas.slice(p.desde, p.desde + T.preguntasPorPaso);
      for (const q of pedidas) {
        const a = json.preguntas.find(x => x.id === q.id);
        if (!a || !a.sencilla.trim()) return { ok: false, motivo: 'falta_pregunta' };
        const malas = letrasDe(q).filter(l => l !== q.correcta);
        const dadas = a.errores.map(e => e.letra);
        if (dadas.length !== malas.length || malas.some(l => !dadas.includes(l))) return { ok: false, motivo: 'errores' };
        if (a.reto.length !== 2) return { ok: false, motivo: 'reto' };
        const vistos = new Set(letrasDe(q).map(l => normalizar(q.opciones[l])));
        for (const r of a.reto) { const k = normalizar(r.texto); if (!k || vistos.has(k)) return { ok: false, motivo: 'reto' }; vistos.add(k); }
      }
      return { ok: true };
    }
    case 'cierre': return json.aprender.length && json.resumen.length && json.otra_vez.trim() ? { ok: true } : { ok: false, motivo: 'vacio' };
    case 'extra': return json.tarjetas.every(x => x.puntos.length && x.puntos.length <= 4) ? { ok: true } : { ok: false, motivo: 'puntos' };
    case 'verificar': return { ok: true };
    default: return { ok: false, motivo: 'paso' };
  }
}

// ---------- De lo guardado a las piezas del paquete ----------
const sinNulos = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
function fuentesDePaginas(paginas, c) {
  const out = [];
  for (const n of [...new Set(paginas ?? [])]) {
    const parte = c.lectura.partes.find(x => x.pagina === n);
    if (parte && out.length < 6) out.push({ libro: parte.libro, pagina: `p. ${n}` });
  }
  return out;
}
function seccionDe(x, c, dudas, { extra = null } = {}) {
  const fuentes = fuentesDePaginas(x.paginas, c);
  if (!fuentes.length) {
    const l = c.lectura.partes[0];
    fuentes.push({ libro: l?.libro ?? LIBRO_TG.id, pagina: l ? `p. ${l.pagina}` : '—' });
    dudas?.push({ donde: x.titulo, problema: 'sin_pagina', gravedad: 'dudoso' });
  }
  const s = { tipo: 'tarjeta', titulo: x.titulo, puntos: x.puntos, recuerda: x.recuerda || undefined, ejemplo: x.ejemplo || undefined };
  if (extra) Object.assign(s, { subtipo: 'profundiza', origen: 'extra', tema: extra });
  if (x.ingles?.length) s.ingles = x.ingles.slice(0, 8).map(w => ({ palabra: w.palabra, pronunciacion: w.pronunciacion, significado: w.significado }));
  if (x.visual?.tipo) {
    const par = sinNulos(x.visual.parametros ?? {});
    if (Array.isArray(par.elementos)) par.elementos = par.elementos.map(sinNulos);
    if (!revisarDiagrama(x.visual.tipo, par).length) s.visual = { tipo: x.visual.tipo, parametros: par };
  }
  const img = x.imagen?.archivo ? c.imagenes.find(i => i.archivo === x.imagen.archivo && i.libro) : null;
  if (img) s.imagen = { archivo: img.archivo, alt: x.imagen.alt || x.titulo, ...(x.imagen.pie ? { pie: x.imagen.pie } : {}), pagina: String(img.pagina), libro: img.libro };
  else if (x.imagen?.archivo) dudas?.push({ donde: x.titulo, problema: 'foto_no_esta', gravedad: 'dudoso' });
  if (!s.visual && !s.imagen && x.solo_texto) s.solo_texto = x.solo_texto;
  s.fuentes = fuentes;
  return JSON.parse(JSON.stringify(s));
}
// Números de una tarjeta que no están ni en la lectura ni en el Test Guide del tema (un dato inventado se nota así).
const NUMERO = /\d+(?:[.,]\d+)*/g;
const soloDigitos = t => String(t).replace(/(\d)[.,](?=\d)/g, '$1');
function numerosRaros(textos, c) {
  const base = new Set((soloDigitos(c.texto) + ' ' + soloDigitos(JSON.stringify(tgParaModelo(c.preguntas)))).match(NUMERO) ?? []);
  const raros = [];
  for (const t of textos) for (const n of soloDigitos(t).match(NUMERO) ?? []) if (n.length > 1 && !base.has(n)) raros.push(n);
  return [...new Set(raros)];
}
const enLibro = (cita, c) => normalizar(c.texto).includes(normalizar(cita));

// Las preguntas del Test Guide TAL CUAL (nunca otro texto: lo dice tg.json, byte a byte).
export function preguntaOriginal(q, figuras) {
  const original = {
    numero: q.id, enunciado: q.enunciado,
    opciones: Object.keys(q.opciones).map(letra => ({ letra, texto: q.opciones[letra] })), correcta: q.correcta, explicacion: q.explicacion,
  };
  if (typeof q.referencia === 'string' && q.referencia.length <= LIMITES.corto && q.referencia.trim()) original.seccion = q.referencia;
  if (q.figura) { const numero = q.figura.replace(/\.[a-z]+$/i, ''); original.figura = numero; figuras.set(numero, { numero, archivo: q.figura }); }
  return original;
}
// ¿Cada pregunta del Test Guide del paquete es EXACTAMENTE la de tg.json? → [ids distintos]
export function tgAlterado(paquete, porId) {
  const mal = [];
  for (const q of paquete.preguntas ?? []) {
    if (q.origen !== 'test_guide') continue;
    const o = q.original;
    const f = porId.get(o?.numero);
    const opciones = f ? Object.keys(f.opciones) : [];
    const igual = f && q.id === `tg-${f.id}` && o.enunciado === f.enunciado && o.correcta === f.correcta && o.explicacion === f.explicacion
      && o.opciones.length === opciones.length && o.opciones.every((x, i) => x.letra === opciones[i] && x.texto === f.opciones[opciones[i]]);
    if (!igual) mal.push(q.id);
  }
  return mal;
}

// Arma el paquete de UNA materia con lo guardado. → { paquete, dudas, corregidos, porId }
export function armarPaquete(db, config, man, m, gen, ahora) {
  const dir = carpetaFuentes(config);
  const dudas = [];
  const corregidos = [];
  const figuras = new Map();
  const preguntas = [];
  const porId = new Map();
  const temas = [];
  const extra = { tarjetas: [], preguntas: [] };
  m.temas.forEach((t, it) => {
    const c = contexto(dir, man, m, t);
    for (const q of c.preguntas) porId.set(q.id, q);
    const dudasTema = [];
    const plan = leerSalida(db, m.id, gen, t.id, 'plan');
    if (!plan?.json) dudasTema.push({ donde: t.titulo, problema: 'sin_plan', gravedad: 'error' });
    const crudas = tarjetasDeTema(db, m.id, gen, t.id);
    const ad = adicionesDeTema(db, m.id, gen, t.id);
    const cierre = leerSalida(db, m.id, gen, t.id, 'cierre')?.json;
    const secciones = [];
    const primera = c.lectura.partes[0];
    const fuenteTema = [{ libro: primera?.libro ?? LIBRO_TG.id, pagina: primera ? `p. ${primera.pagina}` : '—' }];
    if (cierre) secciones.push({ tipo: 'tarjeta', titulo: 'Qué vas a aprender', puntos: cierre.aprender.slice(0, 5), visual: { tipo: 'titulo', parametros: {} }, fuentes: fuenteTema });
    for (const x of crudas) {
      const s = seccionDe(x, c, dudasTema);
      if (!tarjetaConVisual(s)) dudasTema.push({ donde: x.titulo, problema: 'sin_visual', gravedad: 'dudoso' });
      const raros = numerosRaros([...(x.puntos ?? []), x.recuerda ?? '', x.ejemplo ?? ''], c);
      if (raros.length) dudasTema.push({ donde: x.titulo, problema: `numero_no_esta:${raros.slice(0, 3).join(',')}`, gravedad: 'dudoso' });
      secciones.push(s);
    }
    // «Para el Test Guide»: «Si te preguntan… → Recuerda…», de a 5.
    const puntosTg = c.preguntas.map(q => ad.get(q.id)).filter(Boolean).map(a => `Si te preguntan… ${a.si_te_preguntan} → Recuerda… ${a.recuerda}`);
    for (let i = 0; i < puntosTg.length; i += 5) {
      secciones.push({ tipo: 'tarjeta', titulo: puntosTg.length > 5 ? `Para el Test Guide (${i / 5 + 1})` : 'Para el Test Guide', puntos: puntosTg.slice(i, i + 5),
        visual: { tipo: 'cartel', parametros: { icono: 'lista' } }, fuentes: c.preguntas.slice(i, i + 5).map(q => ({ libro: LIBRO_TG.id, pagina: `pregunta ${q.id}` })) });
    }
    if (cierre) secciones.push({ tipo: 'tarjeta', titulo: 'Resumen', puntos: cierre.resumen.slice(0, 5), visual: { tipo: 'titulo', parametros: {} }, fuentes: fuenteTema });
    const reexplicacion = cierre ? [{ titulo: 'Otra vez, más fácil', texto: cierre.otra_vez, fuentes: fuenteTema }] : [];
    // Las preguntas del Test Guide del tema: el original TAL CUAL + lo agregado.
    for (const q of c.preguntas) {
      const a = ad.get(q.id);
      if (!a) { dudasTema.push({ donde: q.id, problema: 'sin_explicacion', gravedad: 'error' }); continue; }
      preguntas.push({
        id: `tg-${q.id}`, origen: 'test_guide', original: preguntaOriginal(q, figuras), sencilla: a.sencilla,
        errores: Object.fromEntries(a.errores.map(e => [e.letra, e.idea])),
        reto: { opciones: a.reto.map(r => ({ texto: r.texto, porque_es_incorrecta: r.porque_es_incorrecta, ...(r.trampa ? { trampa: r.trampa } : {}) })) },
      });
    }
    // Lo EXTRA (Profundizar): una pregunta cuya cita no está en el libro se quita (y se anota como corregida).
    const x = leerSalida(db, m.id, gen, t.id, 'extra')?.json;
    for (const tj of x?.tarjetas ?? []) extra.tarjetas.push(seccionDe(tj, c, dudasTema, { extra: t.id }));
    (x?.preguntas ?? []).forEach((q, k) => {
      const letras = q.opciones.map(o => o.letra);
      const malas = letras.filter(l => l !== q.correcta);
      const bien = letras.includes(q.correcta) && q.porque_incorrectas.length === malas.length && malas.every(l => q.porque_incorrectas.some(p => p.letra === l))
        && q.cita_corta.trim().split(/\s+/).length <= LIMITES.citaPalabras && enLibro(q.cita_corta, c) && c.lectura.partes.some(p => p.pagina === q.pagina);
      if (!bien) { corregidos.push({ donde: `${t.titulo} · extra ${k + 1}`, problema: 'extra_quitada' }); return; }
      const parte = c.lectura.partes.find(p => p.pagina === q.pagina);
      extra.preguntas.push({
        id: `x-${String(m.num).padStart(2, '0')}-t${String(it + 1).padStart(2, '0')}-${String(k + 1).padStart(2, '0')}`, origen: 'extra', tema: t.id, nivel: q.nivel,
        enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta, explicacion: q.explicacion,
        porque_incorrectas: Object.fromEntries(q.porque_incorrectas.map(p => [p.letra, p.texto])),
        fuente: { libro: parte.libro, pagina: `p. ${q.pagina}`, cita_corta: q.cita_corta, verificado_en: 'texto' },
      });
    });
    const v = leerSalida(db, m.id, gen, t.id, 'verificar');
    for (const d of v?.json?.dudas ?? []) dudasTema.push({ donde: String(d.donde).slice(0, 200), problema: String(d.problema).slice(0, 400), gravedad: d.gravedad });
    for (const paso of ['plan', 'cierre', 'extra', 'verificar']) if (leerSalida(db, m.id, gen, t.id, paso)?.fallido) dudasTema.push({ donde: t.titulo, problema: `paso_fallido:${paso}`, gravedad: 'error' });
    dudas.push(...dudasTema.map(d => ({ ...d, tema: t.id })));
    temas.push({ id: t.id, titulo: t.titulo, secciones: secciones.length ? secciones : [{ titulo: t.titulo, texto: t.titulo, fuentes: fuenteTema }], reexplicacion, preguntas: c.preguntas.filter(q => ad.get(q.id)).map(q => `tg-${q.id}`) });
  });
  const paquete = {
    formato: 'academia-enalas', version: 1,
    nombre: `Materia ${m.num} · ${m.nombre} (fábrica)`.slice(0, LIMITES.corto),
    edicion: `fabrica-${m.id}-g${gen}-${iso(ahora).slice(0, 10)}`,
    libros: [...man.libros.map(l => ({ id: l.id, titulo: l.titulo, ...(l.idioma === 'es' || l.idioma === 'en' ? { idioma: l.idioma } : {}) })), LIBRO_TG],
    materias: [{ id: m.id, temas, ...(extra.tarjetas.length || extra.preguntas.length ? { extra } : {}) }],
    preguntas,
    figuras: [...figuras.values()],
  };
  return { paquete, dudas, corregidos, porId };
}

// Pone un archivo de las fuentes como recurso de la versión (enlace duro si se puede; si no, una copia).
export async function adjuntar(db, config, fila, clase, archivo, origen, escribir) {
  const destino = rutaDeRecurso(config, fila, clase, archivo);
  if (existsSync(destino)) return true;
  if (!existsSync(origen)) return false;
  mkdirSync(dirname(destino), { recursive: true });
  const parcial = `${destino}.fabrica.part`;
  if (!existsSync(parcial)) { try { linkSync(origen, parcial); } catch { copyFileSync(origen, parcial); } }
  try {
    await aceptarRecurso(db, config, { fila, clase, archivo, parcial, huella: huellaDeArchivo(parcial), bytes: statSync(parcial).size, escribir });
    return true;
  } catch { return false; }
}

// El paso «armar»: paquete → revisión → versión nueva → archivos → publicar o esperar revisión.
async function armar(ctx, man, m, e, ahora) {
  const { db, config } = ctx;
  const { paquete, dudas, corregidos, porId } = armarPaquete(db, config, man, m, e.gen, ahora);
  const alterado = tgAlterado(paquete, porId);
  const cuerpo = Buffer.from(JSON.stringify(paquete));
  const revision = revisarPaquete(paquete);
  const informe = { dudas: dudas.slice(0, 200), corregidos: corregidos.slice(0, 100), errores: revision.ok ? [] : revision.errores.slice(0, 20), tgAlterado: alterado.slice(0, 20), en: iso(ahora) };
  if (alterado.length || !revision.ok || cuerpo.length > T.paqueteMaxBytes) {
    await ctx.escribir(() => guardarMateria(db, m.id, { ...e, estado: 'revision', version: null, ...informe, problema: alterado.length ? 'tg_alterado' : !revision.ok ? 'paquete_no_valido' : 'paquete_muy_grande' }));
    await ctx.escribir(() => abrirAviso(db, { clave: `fabrica_revision:${m.id}:g${e.gen}`, nivel: 'atencion', detalle: { n: dudas.length }, ahora }));
    return;
  }
  const huella = createHash('sha256').update(cuerpo).digest('hex');
  const r = await guardarJson(db, config, { cuerpo, revisado: { datos: paquete, revision, huella }, origen: 'fabrica', escribir: ctx.escribir });
  const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(r.datos.paquete.id);
  const dir = carpetaFuentes(config);
  const faltan = [];
  for (const f of revision.fotos) if (!(await adjuntar(db, config, fila, 'foto', f.archivo, join(dir, f.archivo), ctx.escribir))) faltan.push(f.archivo);
  for (const f of revision.figuras) if (!(await adjuntar(db, config, fila, 'figura', f.archivo, join(dir, f.archivo), ctx.escribir))) faltan.push(f.archivo);
  for (const a of faltan) informe.dudas.push({ donde: a, problema: 'archivo_no_esta', gravedad: revision.figuras.some(f => f.archivo === a) ? 'error' : 'dudoso' });
  const lista = db.prepare('SELECT estado FROM academia_paquetes WHERE id = ?').get(fila.id);
  const limpio = informe.dudas.length === 0 && lista.estado === 'listo';
  const versiones = [...new Set([...(e.versiones ?? []), fila.id])];
  if (limpio) {
    await ctx.escribir(() => {
      activarPaquete(db, { paqueteId: fila.id, materias: [m.id] });
      guardarMateria(db, m.id, { ...e, estado: 'publicada', version: fila.id, versiones, ...informe, publicadaEn: iso(ahora) });
      abrirAviso(db, { clave: `fabrica_publicada:${m.id}:${fila.id}`, nivel: 'atencion', detalle: { temas: m.temas.length, preguntas: paquete.preguntas.length }, ahora });
    });
  } else {
    await ctx.escribir(() => {
      guardarMateria(db, m.id, { ...e, estado: 'revision', version: fila.id, versiones, ...informe });
      abrirAviso(db, { clave: `fabrica_revision:${m.id}:g${e.gen}`, nivel: 'atencion', detalle: { n: informe.dudas.length }, ahora });
    });
  }
}

// Publicar una versión que esperaba revisión (lo hace el administrador desde la pantalla).
export function publicarRevisada(db, { materia, usuarioId = null, ahora = Date.now() }) {
  const e = estadoMateria(db, materia);
  if (e.estado !== 'revision' || !e.version) return { ok: false, motivo: 'sin_version' };
  const fila = db.prepare('SELECT estado FROM academia_paquetes WHERE id = ?').get(e.version);
  if (fila?.estado !== 'listo') return { ok: false, motivo: 'paquete_incompleto' };
  activarPaquete(db, { paqueteId: e.version, materias: [materia], usuarioId });
  guardarMateria(db, materia, { ...e, estado: 'publicada', publicadaEn: iso(ahora), revisadaPor: usuarioId });
  abrirAviso(db, { clave: `fabrica_publicada:${materia}:${e.version}`, nivel: 'atencion', detalle: { revisada: 1 }, ahora });
  return { ok: true, version: e.version };
}
// Reiniciar una materia: una generación nueva (lo de antes queda guardado, nunca se borra).
export function reiniciarMateria(db, materia) {
  const e = estadoMateria(db, materia);
  guardarMateria(db, materia, { gen: e.gen + 1, estado: 'pendiente', version: null, versiones: e.versiones ?? [], dudas: [], corregidos: [], hechos: [] });
  guardarGeneral(db, { terminada: false, espera: null, esperaHasta: null });
}

// ---------- El paso de la tarea ----------
export function crearFabrica({ reloj = Date.now, sincronizar = sincronizarFuentes } = {}) {
  return async function paso(ctx) {
    const { db, config } = ctx;
    const ahora = reloj();
    const fin = resultado => ({ listo: true, resultado });
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'academia_paquetes'").get()) return fin({ saltado: 'sin_academia' });
    const cfg = leerConfigFabrica(db);
    let g = estadoGeneral(db);
    // 1. Las fuentes (Drive): como mucho cada hora (cada 6 h con todo terminado). Solo lee Drive; nunca la IA.
    const cada = g.terminada ? T.sincronizarTerminadaMs : T.sincronizarCadaMs;
    if (!ctx.tarea?.punto?.sincronizado && (!g.ultimaSync || ahora - Date.parse(g.ultimaSync) >= cada)) {
      const r = await sincronizar(db, config, { escribir: ctx.escribir, senal: ctx.senal, quedaMs: ctx.quedaMs });
      await ctx.escribir(() => guardarGeneral(db, { ultimaSync: iso(ahora), sync: { ok: r.ok, motivo: r.motivo ?? null, bajados: r.bajados ?? 0 } }));
      return { punto: { sincronizado: true }, esperarMs: 1000 };
    }
    const fuentes = estadoFuentes(db);
    const man = fuentes?.ok ? leerManifiesto(carpetaFuentes(config)) : null;
    if (!man) return fin({ motivo: 'sin_fuentes' });
    if (cfg.pausada) return fin({ motivo: 'pausada' });
    if (g.esperaHasta && Date.parse(g.esperaHasta) > ahora) return fin({ motivo: 'esperando', hasta: g.esperaHasta });
    // 2. La próxima cosa por hacer (desde lo guardado).
    const plan = planDeTrabajo(db, config);
    let trabajo = null;
    for (const pm of plan.materias) {
      const m = man.materias.find(x => x.id === pm.id);
      const e = pm.estado;
      if (ESTADOS_LISTOS.has(e.estado)) continue;
      if (pm.yaPublicada) { await ctx.escribir(() => guardarMateria(db, m.id, { ...e, estado: 'ya_publicada' })); return { punto: {}, esperarMs: 1000 }; }
      for (const t of m.temas) {
        const c = contexto(carpetaFuentes(config), man, m, t);
        if (!c.lectura.partes.length) continue;
        for (const p of pasosDeTema(db, m.id, e.gen, t.id, { largo: c.largo, preguntas: c.preguntas.length })) {
          if (!hecho(leerSalida(db, m.id, e.gen, t.id, p.paso))) { trabajo = { m, e, t, c, p }; break; }
        }
        if (trabajo) break;
      }
      if (!trabajo) { trabajo = { m, e, armar: true }; }
      break;
    }
    if (!trabajo) {
      // Todo hecho: «Terminada» (cero llamadas). Solo queda la mejora continua (una vez por semana y con evidencia).
      if (!g.terminada) await ctx.escribir(() => guardarGeneral(db, { terminada: true, terminadaEn: iso(ahora), espera: null }));
      const r = await mejorar(ctx, { ahora, cfg, man });
      return r.seguir ? { punto: {}, esperarMs: r.esperarMs ?? 1000 } : fin({ motivo: 'terminada', mejora: r.motivo });
    }
    if (g.terminada) await ctx.escribir(() => guardarGeneral(db, { terminada: false }));
    const { m, e } = trabajo;
    if (trabajo.armar) {
      await armar(ctx, man, m, e, ahora);
      return { punto: {}, esperarMs: 1000 };
    }
    // 3. UNA llamada (si se puede).
    const { t, c, p } = trabajo;
    if (e.estado === 'pendiente') await ctx.escribir(() => guardarMateria(db, m.id, { ...e, estado: 'escribiendo', iniciadaEn: iso(ahora) }));
    const planGuardado = leerSalida(db, m.id, e.gen, t.id, 'plan')?.json?.tarjetas ?? [];
    const pedido = pedidoDe(db, c, m.id, e.gen, t, p);
    const bytes = Buffer.byteLength(pedido.sistema) + Buffer.byteLength(pedido.texto) + Buffer.byteLength(JSON.stringify(pedido.esquema));
    const puede = puedeLlamar(db, config, { proposito: p.proposito, bytes, ahora, topeMicro: cfg.topeMicro, gastado: gastoFabricaMicro(db) });
    const clave = claveSalida(m.id, e.gen, t.id, p.paso);
    if (!puede.ok) {
      if (puede.motivo === 'demasiado_largo') {
        await ctx.escribir(() => guardarAjuste(db, clave, JSON.stringify({ fallido: true, motivo: 'demasiado_largo', en: iso(ahora) })));
        return { punto: {}, esperarMs: 1000 };
      }
      await ctx.escribir(() => guardarGeneral(db, { espera: { motivo: puede.motivo, en: iso(ahora) } }));
      if (puede.esperarMs && puede.esperarMs < 62 * 60_000) return { punto: {}, esperarMs: puede.esperarMs, motivo: 'fabrica_cuota' };
      return fin({ motivo: puede.motivo });
    }
    const previo = leerJsonAjuste(db, `${clave}.intentos`) ?? { n: 0 };
    // Ya se pagó este intento y su respuesta quedó guardada (la tarea se cortó justo después): se usa, sin llamar.
    const yaPagado = leerJsonAjuste(db, `${clave}.crudo`);
    const r = yaPagado?.intento === previo.n && yaPagado.json ? { usada: false, motivo: 'ya_cobrada' } : await ctx.ia.pedir({
      proposito: p.proposito, paso: `f:${m.id}:${corto(clave, 12)}:${previo.n}`, sistema: pedido.sistema, texto: pedido.texto, esquema: pedido.esquema,
      // Lo que respondió se guarda en la misma escritura que su costo (nunca se pierde ni se paga dos veces).
      guardar: (dbx, json, llamada) => guardarAjuste(dbx, `${clave}.crudo`, JSON.stringify({ json, intento: previo.n, llamadaId: llamada.id, costoMicro: llamada.costoMicro, en: iso(ahora) })),
    });
    const crudo = leerJsonAjuste(db, `${clave}.crudo`);
    const json = r.usada ? r.json : r.motivo === 'ya_cobrada' && crudo?.json && crudo.intento === previo.n ? crudo.json : null;
    if (json) {
      const rev = revisarSalida(p, json, c, planGuardado);
      if (rev.ok) {
        await ctx.escribir(() => {
          guardarAjuste(db, clave, JSON.stringify({ json, en: iso(ahora), costoMicro: r.costoMicro ?? crudo?.costoMicro ?? null }));
          const ee = estadoMateria(db, m.id);
          guardarMateria(db, m.id, { ...ee, estado: p.tipo === 'verificar' ? 'verificando' : 'escribiendo', tema: t.id, hechos: [...(ee.hechos ?? []), iso(ahora)].slice(-40) });
          guardarGeneral(db, { espera: null });
        });
        return { punto: {}, esperarMs: 1000 };
      }
      return falla(ctx, clave, previo, rev.motivo, ahora);
    }
    if (['sobrecargado', 'error_proveedor', 'sin_red', 'tiempo_agotado', 'limite_proveedor', 'base_ocupada', 'interrumpida', 'demasiadas_llamadas'].includes(r.motivo)) {
      await ctx.escribir(() => guardarGeneral(db, { espera: { motivo: r.motivo, en: iso(ahora) }, esperaHasta: iso(ahora + T.esperaPasajeroMs) }));
      return fin({ motivo: r.motivo });
    }
    if (['respuesta_no_valida', 'respuesta_incompleta', 'rechazada', 'no_se_pudo_guardar', 'ya_cobrada'].includes(r.motivo)) return falla(ctx, clave, previo, r.motivo, ahora);
    // La IA apagada, un tope, la clave que no sirve o está en pausa: se espera (sin llamar) hasta la próxima hora.
    await ctx.escribir(() => guardarGeneral(db, { espera: { motivo: r.motivo, en: iso(ahora) } }));
    return fin({ motivo: r.motivo });
  };
}
async function falla(ctx, clave, previo, motivo, ahora) {
  const n = previo.n + 1;
  await ctx.escribir(() => {
    guardarAjuste(ctx.db, `${clave}.intentos`, JSON.stringify({ n, motivo }));
    if (n >= T.intentos) guardarAjuste(ctx.db, clave, JSON.stringify({ fallido: true, motivo, en: iso(ahora) }));
    guardarGeneral(ctx.db, { espera: { motivo, en: iso(ahora) }, esperaHasta: iso(ahora + T.esperaFallaMs) });
  });
  return { listo: true, resultado: { motivo, intento: n } };
}

export const MANEJADOR_FABRICA = Object.freeze({ paso: crearFabrica() });

// ---------- Lo que ve el administrador ----------
// Por materia: estado, % hecho, gasto, tiempo estimado (por la velocidad medida y la cuota de la hora), lo que falta y el
// informe de verificación. Solo lee.
export function vistaFabrica(db, config, ahora = Date.now()) {
  const cfg = leerConfigFabrica(db);
  const g = estadoGeneral(db);
  const fuentes = estadoFuentes(db);
  const plan = planDeTrabajo(db, config);
  const man = plan.fuentes ? leerManifiesto(carpetaFuentes(config)) : null;
  const cfgIa = leerConfigIa(db);
  const cuota = cuotaHora(cfgIa);
  const llamadas = db.prepare(`SELECT COUNT(*) AS n, ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(PROPOSITOS_FABRICA)}`).get(...PROPOSITOS_FABRICA);
  const costoPaso = llamadas.n >= 3 ? Math.round(llamadas.g / llamadas.n) : 30_000;
  const materias = plan.materias.map(pm => {
    const m = man?.materias.find(x => x.id === pm.id);
    const e = pm.estado;
    let total = 0;
    let hechos = 0;
    const faltan = [];
    let temaN = 0;
    if (m && !ESTADOS_LISTOS.has(e.estado)) {
      m.temas.forEach((t, i) => {
        const c = contexto(carpetaFuentes(config), man, m, t);
        const pasos = pasosDeTema(db, m.id, e.gen, t.id, { largo: c.largo, preguntas: c.preguntas.length });
        const listos = pasos.filter(p => hecho(leerSalida(db, m.id, e.gen, t.id, p.paso))).length;
        total += pasos.length; hechos += listos;
        if (listos < pasos.length) { faltan.push({ tema: t.id, titulo: t.titulo, pasos: pasos.length - listos }); if (!temaN && listos > 0) temaN = i + 1; }
      });
      total += 1;
    }
    const pct = ESTADOS_LISTOS.has(e.estado) ? 100 : total ? Math.floor((hechos * 100) / total) : 0;
    const restantes = Math.max(0, total - hechos);
    const marcas = (e.hechos ?? []).map(Date.parse).filter(Number.isFinite);
    const medido = marcas.length >= 3 ? (marcas.at(-1) - marcas[0]) / (marcas.length - 1) : null;
    const ritmo = Math.max(medido ?? 0, 3_600_000 / cuota.propia);
    return {
      id: pm.id, num: pm.num, nombre: pm.nombre, estado: e.estado, gen: e.gen, temas: pm.temas.length, tema: e.tema ?? null, temaN: temaN || null,
      pct, gastoMicro: gastoFabricaMicro(db, { materia: pm.id }), etaMs: restantes ? restantes * ritmo : 0, faltaMicro: restantes * costoPaso,
      faltan: faltan.slice(0, 40), version: e.version ?? null, dudas: (e.dudas ?? []).length, corregidos: (e.corregidos ?? []).length, problema: e.problema ?? null,
    };
  });
  const etaMs = materias.reduce((s, x) => s + x.etaMs, 0);
  return {
    config: cfg, general: g, cuota, fuentes: fuentes ? { ok: fuentes.ok, errores: (fuentes.errores ?? []).slice(0, 10), faltan: fuentes.faltan ?? [], en: fuentes.en ?? null, oral: Boolean(fuentes.oral) } : null,
    gastoMicro: gastoFabricaMicro(db), materias, etaMs, faltaMicro: materias.reduce((s, x) => s + x.faltaMicro, 0),
    estado: !plan.fuentes ? 'sin_fuentes' : cfg.pausada ? 'pausada' : g.terminada ? (materias.some(x => x.estado === 'revision') ? 'esperando_revision' : 'terminada') : g.espera ? 'esperando' : 'trabajando',
    oral: plan.oral, mejora: leerJsonAjuste(db, 'fabrica.mejora.ultima'), mejoraGastoMicro: gastoMejoraMesMicro(db, ahora),
  };
}
export function informeMateria(db, materia) {
  if (!MATERIAS.includes(materia) || !ID_VALIDO.test(materia)) return null;
  const e = estadoMateria(db, materia);
  return { materia, estado: e.estado, version: e.version ?? null, dudas: e.dudas ?? [], corregidos: e.corregidos ?? [], errores: e.errores ?? [], tgAlterado: e.tgAlterado ?? [], en: e.en ?? null, problema: e.problema ?? null };
}
