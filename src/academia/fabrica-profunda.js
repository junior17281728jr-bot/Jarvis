// Academia 0.13.9: la «Mejora profunda de las clases» de la fábrica. APAGADA por defecto (Administrador → Contenido →
// Fábrica de materias, con el costo y el tiempo estimados antes de encenderla). Cuando la fábrica ya no tiene materias por
// fabricar, recorre lo YA PUBLICADO (la Materia 1 y los capítulos orales hechos a mano, y después todo lo que la fábrica
// publique), materia por materia y tema por tema, y reescribe las tarjetas con el patrón de enseñanza mejorado:
//   «¿Qué es y por qué importa?» → bloques de 3 tarjetas (una idea cada una: cada término definido la primera vez, en
//   español con el inglés, un ejemplo concreto, «Recuerda», «Truco para recordar») seguidos de «¿Te acuerdas?» (preguntas
//   de recuerdo, tarjetas para girar) → «Para el Test Guide» (igual que antes) → en el oral, «Lo que te puede preguntar el
//   examinador» (en inglés, como lo diría, con una respuesta modelo) → «Resumen» y «Otra vez, más fácil».
// Todo dato sale SOLO de las fuentes de la fábrica (la lectura del libro del tema, con su página). Después, Claude Haiku
// verifica (datos contra el libro, nada contradice la clave). Limpio → versión nueva publicada (y aviso por Telegram);
// con dudas → «Esperando revisión del admin» con la lista.
// Lo que NUNCA cambia (lo comprueba el código antes de guardar; si no, no se guarda nada): las preguntas (el Test Guide
// TAL CUAL, sus explicaciones, las del oral), «libro_qa» y «adicionales» del oral, los ids y el orden de los temas y sus
// preguntas (el avance de los alumnos sigue igual), y cada foto y clip que ya estaba (el modelo nunca escribe un archivo:
// dice «de» = qué tarjeta de antes reescribe, y el código le pasa su foto, su clip y su dibujo).
// El gasto: sus propios propósitos (profunda_*), su tope propio (US$40 por defecto) y el tope general (deja libre el 20 %
// para los alumnos), con la misma cuota de la hora que la fábrica. Cada paso se guarda; nunca se paga dos veces.
import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MATERIAS, MATERIAS_ORAL, LIMITES, revisarPaquete } from './formato.js';
import { normalizar } from './reto-calidad.js';
import { carpetaAcademia, leerAjuste, guardarAjuste, leerEnUso, guardarJson, activarPaquete, rutaDeRecurso, RECURSOS } from './paquetes.js';
import { carpetaFuentes, leerLecturas, textoDeLectura, imagenesDeTema, leerManifiesto } from './fuentes.js';
import { leerFuenteOral, contextoOral } from './fabrica-oral.js';
import { REGLAS_PROFUNDA, GUIA_ENSENANZA, REGLAS_VERIFICACION, ESQUEMAS, ESQUEMAS_PROFUNDA, TAREAS, TAREAS_PROFUNDA, datos } from './fabrica-prompts.js';
import { tarjetaConVisual, revisarDiagrama, TIPOS_DIAGRAMA } from './diagramas.js';
import { abrirAviso } from '../avisos/avisos.js';
import { GASTO_SQL } from '../ia/gasto.js';
import { PROPOSITOS_PROFUNDA } from '../ia/propositos.js';
import { puedeLlamar, adjuntar, estadoMateria, guardarGeneral, leerConfigFabrica, T } from './fabrica.js';
import { anotarCambio, costoDe } from './cambios-ia.js';

export const P = Object.freeze({
  tarjetasPorPaso: 3, lecturaMaxBytes: 50_000, intentos: 2,
  // Lo que se calcula que cuesta un paso mientras no hay al menos 3 medidos (Sonnet con la caché del libro; Haiku).
  costoEscribirMicro: 40_000, costoVerificarMicro: 5_000,
});
const HECHOS = new Set(['publicada', 'revision', 'saltada']);
const iso = ms => new Date(ms).toISOString();
const corto = (t, n = 16) => createHash('sha256').update(String(t)).digest('hex').slice(0, n);
const clon = v => JSON.parse(JSON.stringify(v));
const leerJson = (db, clave) => { try { const v = JSON.parse(leerAjuste(db, clave) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const sinNulos = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
const enLista = lista => `(${lista.map(() => '?').join(', ')})`;
const hecho = s => Boolean(s && (s.json || s.fallido));

// ---------- Estado (filas de «ajustes»; nada se borra) ----------
const claveMateria = materia => `fabrica.profunda.m.${materia}`;
const AJUSTE_ESPERA = 'fabrica.profunda.espera';
const AJUSTE_ESPERA_PROFUNDA = AJUSTE_ESPERA;
export function estadoProfunda(db, materia) {
  return { estado: 'pendiente', base: null, version: null, dudas: [], corregidos: [], saltados: [], hechos: [], ...(leerJson(db, claveMateria(materia)) ?? {}) };
}
export const guardarProfunda = (db, materia, valor) => guardarAjuste(db, claveMateria(materia), JSON.stringify(valor));
const guardarProfundaReal = guardarProfunda;
const claveSalida = (materia, base, tema, paso) => `fabrica.profunda.salida.${materia}.v${base}.${tema}.${paso}`;
export function gastoProfundaMicro(db, { materia = null } = {}) {
  if (materia) return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(PROPOSITOS_PROFUNDA)} AND paso LIKE ?`).get(...PROPOSITOS_PROFUNDA, `p:${materia}:%`).g;
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(PROPOSITOS_PROFUNDA)}`).get(...PROPOSITOS_PROFUNDA).g;
}

// ---------- Lo publicado de una materia ----------
// Lee cada versión una sola vez por pasada (los archivos de una versión nunca cambian).
export function crearLector(config) {
  const vistos = new Map();
  return fila => {
    if (vistos.has(fila.id)) return vistos.get(fila.id);
    let p = null;
    try {
      const ruta = join(carpetaAcademia(config), 'paquetes', fila.carpeta, 'paquete.json');
      if (statSync(ruta).size <= LIMITES.jsonBytes) p = JSON.parse(readFileSync(ruta, 'utf8'));
    } catch { p = null; }
    vistos.set(fila.id, p);
    return p;
  };
}
// Lo que ven los alumnos de esa materia: en el Test Guide, la versión en uso más nueva que la trae; en el oral, tema por
// tema (los hechos a mano y los de la fábrica viven juntos: gana la más nueva, como en paquetes.js). → null si no hay.
export function publicado(db, config, materia, lector = crearLector(config)) {
  const oral = MATERIAS_ORAL.includes(materia);
  let pub = null;
  for (const e of [...leerEnUso(db)].reverse()) {
    if (e.materias && !e.materias.includes(materia)) continue;
    const fila = db.prepare("SELECT * FROM academia_paquetes WHERE id = ? AND estado = 'listo'").get(e.id);
    const p = fila ? lector(fila) : null;
    const m = p?.materias?.find(x => x.id === materia);
    if (!m) continue;
    if (!pub) pub = { base: fila.id, pista: p.pista ?? null, cabeza: { formato: p.formato, version: p.version, ...(p.pista ? { pista: p.pista } : {}), nombre: p.nombre }, materia: m, temas: new Map(), preguntas: new Map(), libros: new Map(), figuras: new Map(), paginas: new Map(), filas: [] };
    pub.filas.push(fila);
    for (const l of p.libros ?? []) if (!pub.libros.has(l.id)) pub.libros.set(l.id, l);
    for (const f of p.figuras ?? []) if (!pub.figuras.has(f.numero)) pub.figuras.set(f.numero, f);
    for (const g of p.paginas ?? []) if (!pub.paginas.has(g.archivo)) pub.paginas.set(g.archivo, g);
    for (const q of p.preguntas ?? []) if (!pub.preguntas.has(q.id)) pub.preguntas.set(q.id, q);
    for (const t of m.temas ?? []) if (!pub.temas.has(t.id)) pub.temas.set(t.id, t);
    if (!oral) break;
  }
  if (!pub) return null;
  pub.orden = oral ? [...pub.temas.values()].sort((a, b) => a.id.localeCompare(b.id)) : [...pub.materia.temas];
  return pub;
}

// ---------- El plan: qué materias y en qué orden ----------
// Primero las 11 del Test Guide (en su orden), después los capítulos orales. Solo lo publicado y con fuentes; lo que la
// fábrica todavía tiene esperando tu revisión, después.
export function planProfundo(db, config, { man = null, fuenteOral = null, lector = crearLector(config) } = {}) {
  return [...MATERIAS, ...MATERIAS_ORAL].map(id => {
    const oral = MATERIAS_ORAL.includes(id);
    const cap = oral ? fuenteOral?.capitulos?.find(c => c.id === id) ?? null : null;
    const mm = oral ? null : man?.materias?.find(m => m.id === id) ?? null;
    const rec = estadoProfunda(db, id);
    const fab = estadoMateria(db, id).estado;
    const base = { id, oral, num: mm?.num ?? cap?.num ?? null, nombre: mm?.nombre ?? cap?.nombre ?? null, rec, fab };
    if (HECHOS.has(rec.estado)) return { ...base, estado: rec.estado, pendiente: false };
    if (!(oral ? cap : mm)) return { ...base, estado: 'sin_fuentes', pendiente: false };
    if (fab === 'revision') return { ...base, estado: 'esperando_fabrica', pendiente: false };
    const pub = publicado(db, config, id, lector);
    if (!pub) return { ...base, estado: 'sin_publicar', pendiente: false };
    return { ...base, estado: rec.estado, pendiente: true, pub, cap, mm };
  });
}

// ---------- Un tema: su lectura del libro, sus tarjetas de antes y sus pasos ----------
// Las páginas que cita una tarjeta, buscadas en las lecturas del manifiesto (para un tema hecho a mano con otro id).
function lecturasDeCitas(man, t) {
  const out = new Map();
  const todas = (man?.materias ?? []).flatMap(m => m.temas.flatMap(x => x.lecturas ?? []));
  for (const s of t.secciones ?? []) for (const f of s.fuentes ?? []) {
    const n = Number(/(\d+)/.exec(String(f.pagina ?? ''))?.[1]);
    if (!Number.isSafeInteger(n)) continue;
    const l = todas.find(x => x.libro === f.libro && x.desde <= n && n <= x.hasta);
    if (l && out.size < 10) out.set(`${l.archivo}:${n}`, { libro: l.libro, archivo: l.archivo, desde: Math.max(l.desde, n - 1), hasta: Math.min(l.hasta, n + 1) });
  }
  return [...out.values()];
}
export function contextoTema(dir, item, t, man, fuenteOral) {
  if (item.oral) {
    const tt = item.cap?.temas.find(x => x.id === t.id);
    if (!tt) return null;
    const c = contextoOral(dir, fuenteOral, item.cap, tt);
    return c.lectura.partes.length ? { ...c, oral: true } : null;
  }
  const mt = item.mm?.temas.find(x => x.id === t.id) ?? item.mm?.temas.find(x => normalizar(x.titulo) === normalizar(t.titulo)) ?? null;
  const lecturas = mt?.lecturas?.length ? mt.lecturas : lecturasDeCitas(man, t);
  if (!lecturas.length) return null;
  const titulos = new Map((man?.libros ?? []).map(l => [l.id, l.titulo]));
  const lectura = leerLecturas(dir, { lecturas });
  if (!lectura.partes.length) return null;
  const texto = textoDeLectura(lectura.partes, titulos);
  return { titulos, lectura, texto, largo: Buffer.byteLength(texto), imagenes: mt ? imagenesDeTema(dir, item.id, mt.id) : [], oral: false };
}
// Las tarjetas de antes, numeradas desde 1 (las que el modelo nombra con «de»).
export const viejasDe = t => (t.secciones ?? []).map((s, i) => ({ n: i + 1, s }));
const FIJA = s => /^Para el Test Guide/i.test(String(s.titulo ?? '')) || (s.tipo !== 'tarjeta' && /Escenario\s+\d+\s*:/i.test(String(s.texto ?? '')));
const RELLENO = s => /^(Qué vas a aprender|Resumen|¿Qué es y por qué importa\?|¿De qué va)/i.test(String(s.titulo ?? ''));
export const compacta = ({ n, s }) => sinNulos({
  n, titulo: s.titulo, puntos: s.tipo === 'tarjeta' ? (s.puntos ?? []).slice(0, 5).map(p => String(p).slice(0, 220)) : null,
  texto: s.tipo === 'tarjeta' ? null : String(s.texto ?? '').slice(0, 400), recuerda: s.recuerda ? String(s.recuerda).slice(0, 200) : null,
  ejemplo: s.ejemplo ? String(s.ejemplo).slice(0, 200) : null, tiene_foto: s.imagen || s.clip ? true : null,
});
// Las preguntas del examen del tema (como datos: nunca se reescriben).
export function examenDe(t, pub, c) {
  if (c.oral) return { preguntas_del_libro: (t.libro_qa ?? []).map(x => ({ n: x.n, pagina: Number(x.pagina) || null, pregunta_en: x.pregunta_en, respuesta_en: String(x.respuesta_en ?? '').slice(0, 700) })) };
  return { test_guide: (t.preguntas ?? []).map(id => pub.preguntas.get(id)).filter(q => q?.origen === 'test_guide' && q.original)
    .map(q => ({ id: q.id, enunciado: q.original.enunciado, correcta: q.original.opciones?.find(o => o.letra === q.original.correcta)?.texto ?? '' })) };
}
const estimadas = viejas => Math.min(12, Math.max(3, viejas.filter(({ s }) => s.tipo === 'tarjeta' && !FIJA(s) && !RELLENO(s)).length));
export function pasosProfundos(leer, c, viejas) {
  const pasos = [];
  if (c.largo > P.lecturaMaxBytes) pasos.push({ paso: 'extracto', proposito: 'profunda_verificar', tipo: 'extracto' });
  pasos.push({ paso: 'plan', proposito: 'profunda_escribir', tipo: 'plan' });
  const plan = leer('plan');
  if (plan?.fallido) return pasos;
  const n = plan?.json?.tarjetas?.length ?? estimadas(viejas);
  for (let i = 0; i < Math.ceil(n / P.tarjetasPorPaso); i++) pasos.push({ paso: `tarjetas-${i + 1}`, proposito: 'profunda_escribir', tipo: 'tarjetas', desde: i * P.tarjetasPorPaso });
  pasos.push({ paso: 'cierre', proposito: 'profunda_escribir', tipo: 'cierre' });
  pasos.push({ paso: 'verificar', proposito: 'profunda_verificar', tipo: 'verificar' });
  return pasos;
}
const bloquesDe = leer => {
  const out = [];
  for (let i = 1; i < 40; i++) { const s = leer(`tarjetas-${i}`); if (!s) break; out.push(s); }
  return out;
};

// ---------- Los pedidos ----------
function pedidoProfundo(leer, c, t, p, pub, viejas, instruccion = null) {
  const r = pedidoProfundoBase(leer, c, t, p, pub, viejas);
  // 0.14.2: un trabajo de «Pídele a la IA»: lo que pidió el dueño (solo contenido) va al final de cada paso de escribir.
  // Va entre la tarea y sus datos (los datos siguen siendo lo último del mensaje), sin «<» ni «>».
  if (instruccion && ['plan', 'tarjetas', 'cierre'].includes(p.tipo)) {
    const pedido = String(instruccion).slice(0, 600).replace(/[<>]/g, ' ');
    r.texto = r.texto.replace('\n<datos>', `\nPEDIDO DEL DUEÑO (solo sobre cómo se enseña; nunca cambies las preguntas, sus opciones, sus respuestas ni lo que dice el libro): «${pedido}»\n<datos>`);
  }
  return r;
}
function pedidoProfundoBase(leer, c, t, p, pub, viejas) {
  const extracto = leer('extracto')?.json?.pasajes;
  const titulo = (id, n) => (c.titulos?.get(id) ?? id) + (n != null ? `, p. ${n}` : '');
  const lectura = extracto ? extracto.map(x => `[${titulo(x.libro, x.pagina)}]\n${x.texto}`).join('\n\n') : c.texto;
  // IGUAL en todos los pasos de escritura del tema (caché de 5 minutos).
  const sistema = `${REGLAS_PROFUNDA}\n\n${GUIA_ENSENANZA}\n\nTEMA: ${t.titulo}${c.oral ? ' (EXAMEN ORAL)' : ''}\n\nLECTURA DEL LIBRO (con sus páginas):\n${datos(lectura)}`;
  const examen = examenDe(t, pub, c);
  const plan = leer('plan')?.json ?? { contexto: [], tarjetas: [] };
  const fotos = (c.imagenes ?? []).filter(x => x.libro).map(x => ({ archivo: x.archivo, pagina: x.pagina, pie: x.pie ?? null }));
  const verificarSistema = `${REGLAS_VERIFICACION}\n\nLECTURA COMPLETA:\n${datos(c.texto.slice(0, T.verificarBytes))}`;
  switch (p.tipo) {
    case 'extracto': return { sistema: verificarSistema, texto: `${TAREAS.extracto}\n${datos({ tema: t.titulo, ...examen })}`, esquema: ESQUEMAS.extracto };
    case 'plan': return { sistema, texto: `${TAREAS_PROFUNDA.plan}\n${datos({ tarjetas_de_ahora: viejas.map(compacta), ...examen, fotos_del_libro: fotos })}`, esquema: ESQUEMAS_PROFUNDA.plan };
    case 'tarjetas': {
      const parte = plan.tarjetas.slice(p.desde, p.desde + P.tarjetasPorPaso);
      const ns = new Set(parte.map(x => x.de).filter(Number.isSafeInteger));
      const ids = new Set(parte.flatMap(x => x.preguntas ?? []).map(String));
      const ex = c.oral ? { preguntas_del_libro: examen.preguntas_del_libro.filter(x => ids.has(String(x.n))) } : { test_guide: examen.test_guide.filter(q => ids.has(q.id) || ids.has(q.id.replace(/^tg-/, ''))) };
      return { sistema, texto: `${TAREAS_PROFUNDA.tarjetas}\n${datos({ tarjetas: parte, tarjetas_de_ahora: viejas.filter(v => ns.has(v.n)).map(compacta), ...ex, fotos_del_libro: fotos, dibujos: TIPOS_DIAGRAMA })}`, esquema: ESQUEMAS_PROFUNDA.tarjetas };
    }
    case 'cierre': {
      const nuevas = bloquesDe(leer).flatMap(b => b.json?.tarjetas ?? []).map(x => ({ titulo: x.titulo, recuerda: x.recuerda }));
      return { sistema, texto: `${TAREAS_PROFUNDA.cierre}\n${datos({ examen_oral: c.oral, tarjetas: nuevas, ...(c.oral ? { preguntas_del_libro: examen.preguntas_del_libro.map(x => ({ n: x.n, pregunta_en: x.pregunta_en })) } : {}) })}`, esquema: ESQUEMAS_PROFUNDA.cierre };
    }
    case 'verificar': {
      const bloques = bloquesDe(leer).map(b => b.json).filter(Boolean);
      const cierre = leer('cierre')?.json ?? null;
      const contenido = {
        contexto: plan.contexto,
        tarjetas: bloques.flatMap(b => b.tarjetas).map(x => ({ titulo: x.titulo, puntos: x.puntos, recuerda: x.recuerda, ejemplo: x.ejemplo, truco: x.truco, visual: x.visual?.parametros ?? null })),
        te_acuerdas: bloques.flatMap(b => b.te_acuerdas), examinador: cierre?.examinador ?? [], resumen: cierre?.resumen ?? [],
      };
      const clave = c.oral ? examen.preguntas_del_libro.map(x => ({ n: x.n, respuesta_en: x.respuesta_en })) : examen.test_guide.map(q => ({ id: q.id, correcta: q.correcta }));
      return { sistema: verificarSistema, texto: `${TAREAS_PROFUNDA.verificar}\n${datos({ clave, contenido })}`, esquema: ESQUEMAS.verificar };
    }
    default: throw new Error('paso desconocido');
  }
}

// ---------- Una tarjeta nueva (en código: la foto, el clip y el dibujo de antes pasan solos) ----------
function seccionProfunda(x, c, viejas, dudas) {
  const fmt = n => (c.oral ? String(n) : `p. ${n}`);
  const vieja = Number.isSafeInteger(x.de) ? viejas[x.de - 1]?.s ?? null : null;
  const paginas = [...new Set(x.paginas ?? [])].filter(n => c.lectura.partes.some(p => p.pagina === n)).slice(0, 6);
  let fuentes = paginas.map(n => ({ libro: c.lectura.partes.find(p => p.pagina === n).libro, pagina: fmt(n) }));
  if (!fuentes.length && vieja?.fuentes?.length) fuentes = clon(vieja.fuentes);
  if (!fuentes.length) {
    const l = c.lectura.partes[0];
    fuentes = [{ libro: l.libro, pagina: fmt(l.pagina) }];
    dudas?.push({ donde: x.titulo, problema: 'sin_pagina', gravedad: 'dudoso' });
  }
  const s = {
    tipo: 'tarjeta', titulo: String(x.titulo).slice(0, LIMITES.corto), puntos: x.puntos.slice(0, 5).map(p => String(p).slice(0, 2000)),
    recuerda: x.recuerda ? String(x.recuerda).slice(0, 2000) : undefined, ejemplo: x.ejemplo ? String(x.ejemplo).slice(0, 2000) : undefined,
    nota: x.truco?.trim() ? `Truco para recordar: ${x.truco.trim()}`.slice(0, 2000) : undefined,
  };
  if (x.ingles?.length) s.ingles = x.ingles.slice(0, 8).map(w => ({ palabra: String(w.palabra).slice(0, LIMITES.corto), pronunciacion: w.pronunciacion, significado: w.significado }));
  if (x.visual?.tipo) {
    const par = sinNulos(x.visual.parametros ?? {});
    if (Array.isArray(par.elementos)) par.elementos = par.elementos.map(sinNulos);
    if (!revisarDiagrama(x.visual.tipo, par).length) s.visual = { tipo: x.visual.tipo, parametros: par };
  }
  if (vieja?.imagen) s.imagen = clon(vieja.imagen);
  else if (x.imagen?.archivo) {
    const img = (c.imagenes ?? []).find(i => i.archivo === x.imagen.archivo && i.libro);
    if (img) s.imagen = { archivo: img.archivo, alt: String(x.imagen.alt || x.titulo).slice(0, LIMITES.corto), ...(x.imagen.pie ? { pie: String(x.imagen.pie).slice(0, LIMITES.corto) } : {}), pagina: String(img.pagina), libro: img.libro };
    else dudas?.push({ donde: x.titulo, problema: 'foto_no_esta', gravedad: 'dudoso' });
  }
  if (vieja?.clip) s.clip = clon(vieja.clip);
  if (!s.visual && vieja?.visual) s.visual = clon(vieja.visual);
  if (!s.visual && !s.imagen && !s.clip && x.solo_texto) s.solo_texto = x.solo_texto;
  s.fuentes = fuentes;
  return JSON.parse(JSON.stringify(s));
}

// ---------- Revisar lo que respondió (código, sin IA) ----------
function revisarProfunda(p, json, c, t, pub, viejas, plan) {
  switch (p.tipo) {
    case 'extracto': return json.pasajes.length ? { ok: true } : { ok: false, motivo: 'vacio' };
    case 'plan': {
      if (!json.contexto.length || json.tarjetas.length < 3 || json.tarjetas.length > 14) return { ok: false, motivo: 'tarjetas_no_validas' };
      if (json.tarjetas.some(x => x.de != null && !(Number.isSafeInteger(x.de) && x.de >= 1 && x.de <= viejas.length))) return { ok: false, motivo: 'de_no_valido' };
      if (!c.oral) {
        const cubiertas = new Set(json.tarjetas.flatMap(x => x.preguntas.map(id => String(id).replace(/^tg-/, ''))));
        const falta = examenDe(t, pub, c).test_guide.find(q => !cubiertas.has(q.id.replace(/^tg-/, '')));
        if (falta) return { ok: false, motivo: 'pregunta_sin_tarjeta' };
      }
      return { ok: true };
    }
    case 'tarjetas': {
      if (json.tarjetas.length !== plan.tarjetas.slice(p.desde, p.desde + P.tarjetasPorPaso).length || !json.te_acuerdas.length) return { ok: false, motivo: 'tarjetas_no_validas' };
      for (const x of json.tarjetas) {
        if (!x.puntos.length || x.puntos.length > 5) return { ok: false, motivo: 'puntos' };
        if (!tarjetaConVisual(seccionProfunda(x, c, viejas, null))) return { ok: false, motivo: 'sin_visual' };
      }
      return json.te_acuerdas.every(q => q.pregunta.trim() && q.respuesta.trim()) ? { ok: true } : { ok: false, motivo: 'vacio' };
    }
    case 'cierre': {
      if (!json.resumen.length || !json.otra_vez.trim()) return { ok: false, motivo: 'vacio' };
      if (c.oral && (json.examinador.length < 2 || json.examinador.some(e => !e.pregunta_en.trim() || !e.respuesta.trim()))) return { ok: false, motivo: 'examinador' };
      return { ok: true };
    }
    case 'verificar': return { ok: true };
    default: return { ok: false, motivo: 'paso' };
  }
}

// ---------- Armar un tema (en código) ----------
const NUMERO = /\d+(?:[.,]\d+)*/g;
const soloDigitos = s => String(s).replace(/(\d)[.,](?=\d)/g, '$1');
function numerosRaros(textos, c, viejas) {
  const base = new Set((soloDigitos(c.texto) + ' ' + soloDigitos(JSON.stringify(viejas.map(v => v.s)))).match(NUMERO) ?? []);
  const raros = new Set();
  for (const x of textos) for (const n of soloDigitos(x ?? '').match(NUMERO) ?? []) if (n.length > 1 && !base.has(n)) raros.add(n);
  return [...raros];
}
const preguntasGirar = lista => lista.map(q => `Si te preguntan: ${q.pregunta}\nRecuerda: ${q.respuesta}`).join('\n\n');
// → { tema, dudas, corregidos, cambiado }
export function temaProfundo(leer, c, t, viejas) {
  const dudas = [];
  const sinCambios = problema => ({ tema: clon(t), dudas: [], corregidos: [{ donde: t.titulo, problema }], cambiado: false });
  const plan = leer('plan')?.json;
  const cierre = leer('cierre')?.json;
  const bloques = bloquesDe(leer);
  if (!plan) return sinCambios('tema_sin_cambios:plan');
  if (bloques.some(b => !b.json) || !cierre) return sinCambios('tema_sin_cambios:paso_fallido');
  if (bloques.flatMap(b => b.json.tarjetas).length !== plan.tarjetas.length) return sinCambios('tema_sin_cambios:faltan_tarjetas');
  const fmt = n => (c.oral ? String(n) : `p. ${n}`);
  const l0 = c.lectura.partes[0];
  const fuenteTema = [{ libro: l0.libro, pagina: fmt(l0.pagina) }];
  const secciones = [{ tipo: 'tarjeta', titulo: '¿Qué es y por qué importa?', puntos: plan.contexto.slice(0, 4).map(x => String(x).slice(0, 2000)), visual: { tipo: 'titulo', parametros: {} }, fuentes: fuenteTema }];
  const de = []; // por cada sección nueva: de qué tarjeta de antes viene (o null)
  de.push(null);
  for (const b of bloques) {
    let fuentesBloque = null;
    for (const x of b.json.tarjetas) {
      const s = seccionProfunda(x, c, viejas, dudas);
      fuentesBloque ??= s.fuentes;
      if (!tarjetaConVisual(s)) dudas.push({ donde: x.titulo, problema: 'sin_visual', gravedad: 'dudoso' });
      const raros = numerosRaros([...x.puntos, x.recuerda, x.ejemplo, x.truco], c, viejas);
      if (raros.length) dudas.push({ donde: x.titulo, problema: `numero_no_esta:${raros.slice(0, 3).join(',')}`, gravedad: 'dudoso' });
      secciones.push(s);
      de.push(Number.isSafeInteger(x.de) ? x.de : null);
    }
    const qs = b.json.te_acuerdas.slice(0, 4).map(q => ({ pregunta: String(q.pregunta).slice(0, 600), respuesta: String(q.respuesta).slice(0, 600) }));
    if (qs.length) { secciones.push({ titulo: '¿Te acuerdas?', texto: preguntasGirar(qs), fuentes: clon(fuentesBloque ?? fuenteTema) }); de.push(null); }
  }
  // Lo que se queda TAL CUAL: «Para el Test Guide» (sale de las explicaciones de las preguntas) y los escenarios.
  for (const { s } of viejas) if (FIJA(s)) { secciones.push(clon(s)); de.push(null); }
  if (c.oral && cierre.examinador.length) {
    const ex = cierre.examinador.slice(0, 8);
    const paginas = [...new Set(ex.flatMap(e => e.paginas ?? []))].filter(n => c.lectura.partes.some(p => p.pagina === n)).slice(0, 6);
    secciones.push({ titulo: 'Lo que te puede preguntar el examinador', texto: preguntasGirar(ex.map(e => ({ pregunta: `«${e.pregunta_en}» (${e.pregunta_es})`, respuesta: e.respuesta }))),
      fuentes: paginas.length ? paginas.map(n => ({ libro: c.lectura.partes.find(p => p.pagina === n).libro, pagina: fmt(n) })) : fuenteTema });
    de.push(null);
    const raros = numerosRaros(ex.flatMap(e => [e.respuesta]), c, viejas);
    if (raros.length) dudas.push({ donde: 'examinador', problema: `numero_no_esta:${raros.slice(0, 3).join(',')}`, gravedad: 'dudoso' });
  }
  secciones.push({ tipo: 'tarjeta', titulo: 'Resumen', puntos: cierre.resumen.slice(0, 5).map(x => String(x).slice(0, 2000)), visual: { tipo: 'titulo', parametros: {} }, fuentes: fuenteTema });
  de.push(null);
  // Cada foto y clip de antes sigue en alguna tarjeta: si su tarjeta no se reescribió con «de», va a la más cercana.
  const tarjeta = i => secciones[i].tipo === 'tarjeta' && i > 0 && i < secciones.length - 1 && de[i] !== undefined && !FIJA(secciones[i]);
  for (const campo of ['imagen', 'clip']) {
    const hay = new Set(secciones.map(s => s[campo]?.archivo).filter(Boolean));
    for (const { n, s } of viejas) {
      if (!s[campo]?.archivo || hay.has(s[campo].archivo) || FIJA(s)) continue;
      const libres = secciones.map((x, i) => i).filter(i => tarjeta(i) && !secciones[i][campo]);
      const cerca = libres.filter(i => de[i] != null && de[i] <= n).at(-1) ?? libres[0];
      if (cerca == null) { dudas.push({ donde: s.titulo, problema: `${campo}_perdida`, gravedad: 'error' }); continue; }
      secciones[cerca][campo] = clon(s[campo]);
      hay.add(s[campo].archivo);
    }
  }
  const conMedios = (t.reexplicacion ?? []).filter(x => x.imagen || x.clip).map(clon);
  const tema = { ...clon(t), secciones, reexplicacion: [{ titulo: 'Otra vez, más fácil', texto: String(cierre.otra_vez).slice(0, 4000), fuentes: fuenteTema }, ...conMedios] };
  for (const d of leer('verificar')?.json?.dudas ?? []) dudas.push({ donde: String(d.donde).slice(0, 200), problema: String(d.problema).slice(0, 400), gravedad: d.gravedad });
  if (leer('verificar')?.fallido) dudas.push({ donde: t.titulo, problema: 'paso_fallido:verificar', gravedad: 'error' });
  return { tema, dudas, corregidos: [], cambiado: true };
}

// ---------- Lo que nunca cambia (si algo cambió, no se guarda) ----------
const medios = temas => new Set(temas.flatMap(t => [...(t.secciones ?? []), ...(t.reexplicacion ?? [])]).flatMap(s => [s.imagen?.archivo, s.clip?.archivo]).filter(Boolean));
// → [{ donde, problema }] (vacía = todo igual)
export function invariantesProfunda(pub, nuevo, materia) {
  const mal = [];
  const mn = nuevo.materias?.find(m => m.id === materia);
  if (!mn || nuevo.materias.length !== 1) return [{ donde: materia, problema: 'materia' }];
  const viejos = pub.orden;
  if (JSON.stringify(mn.temas.map(t => t.id)) !== JSON.stringify(viejos.map(t => t.id))) mal.push({ donde: materia, problema: 'ids_de_temas' });
  for (const t of viejos) {
    const n = mn.temas.find(x => x.id === t.id);
    if (!n) continue;
    for (const campo of ['titulo', 'preguntas', 'libro_qa', 'adicionales', 'titulo_en']) {
      if (JSON.stringify(n[campo] ?? null) !== JSON.stringify(t[campo] ?? null)) mal.push({ donde: t.id, problema: `${campo}_cambio` });
    }
  }
  const ids = new Set(viejos.flatMap(t => t.preguntas ?? []));
  const puestas = new Map((nuevo.preguntas ?? []).map(q => [q.id, q]));
  for (const id of ids) {
    const antes = pub.preguntas.get(id);
    if (!antes) continue;
    if (JSON.stringify(puestas.get(id) ?? null) !== JSON.stringify(antes)) mal.push({ donde: id, problema: 'pregunta_cambio' });
  }
  const nuevos = medios(mn.temas);
  for (const a of medios(viejos)) if (!nuevos.has(a)) mal.push({ donde: a, problema: 'archivo_perdido' });
  return mal;
}

// ---------- Armar la materia: versión nueva → publicar o esperar revisión ----------
async function armarProfunda(ctx, item, info, ahora, op = null) {
  const { db, config } = ctx;
  const { pub, rec } = item;
  const guardarEstado = op?.guardarEstado ?? ((dbx, valor) => guardarProfunda(dbx, item.id, { ...estadoProfunda(dbx, item.id), ...valor }));
  const dudas = [];
  const corregidos = [];
  const saltados = [];
  let cambiados = 0;
  const temas = pub.orden.map(t => {
    const x = info.get(t.id);
    if (op?.soloTemas && !op.soloTemas.has(t.id)) return clon(t);
    if (!x?.c) { saltados.push(t.id); return clon(t); }
    const r = temaProfundo(x.leer, x.c, t, x.viejas);
    dudas.push(...r.dudas.map(d => ({ ...d, tema: t.id })));
    corregidos.push(...r.corregidos.map(d => ({ ...d, tema: t.id })));
    if (r.cambiado) cambiados += 1;
    return r.tema;
  });
  const fin = async (valor, aviso = null) => {
    await ctx.escribir(() => {
      guardarEstado(db, { ...valor, saltados, corregidos: corregidos.slice(0, 100), en: iso(ahora) });
      if (aviso) abrirAviso(db, { ...aviso, ahora });
      // 0.14.2: «Lo que hizo la IA»: cada clase reescrita (publicada o esperando revisión) queda en el registro.
      if (valor.estado === 'publicada' || valor.estado === 'revision') {
        anotarCambio(db, { materia: item.id, que: op?.que ?? 'clase_reescrita', estado: valor.estado, version: valor.version ?? null, antes: { version: pub.base }, despues: { temas: valor.temasMejorados ?? 0, dudas: (valor.dudas ?? []).length }, ...costoDe(db, op?.pasoPrefijo ?? `p:${item.id}:`), ahora });
      }
    });
    return { trabajo: true, seguir: true };
  };
  if (!cambiados) return fin({ estado: 'saltada', motivo: 'sin_cambios', dudas: [] });
  const mn = { ...clon(pub.materia), temas };
  const preguntas = [];
  const vistas = new Set();
  for (const t of temas) for (const id of t.preguntas ?? []) if (!vistas.has(id) && pub.preguntas.has(id)) { vistas.add(id); preguntas.push(clon(pub.preguntas.get(id))); }
  const figurasUsadas = new Set(preguntas.map(q => q.original?.figura).filter(Boolean));
  const paginasUsadas = new Set(preguntas.map(q => q.original?.pagina_imagen?.toLowerCase()).filter(Boolean));
  const libros = new Map(pub.libros);
  for (const l of [...(info.man?.libros ?? []), ...(info.fuenteOral?.libro ? [info.fuenteOral.libro] : [])]) {
    if (!libros.has(l.id)) libros.set(l.id, { id: l.id, titulo: l.titulo, ...(l.idioma === 'es' || l.idioma === 'en' ? { idioma: l.idioma } : item.oral ? { idioma: 'en' } : {}) });
  }
  const paginas = [...pub.paginas.values()].filter(g => paginasUsadas.has(String(g.archivo).toLowerCase()));
  const nuevo = {
    ...clon(pub.cabeza), edicion: `${op?.edicion ?? 'profunda'}-${item.id}-${iso(ahora).slice(0, 10)}`, libros: [...libros.values()],
    materias: [mn], preguntas, figuras: [...pub.figuras.values()].filter(f => figurasUsadas.has(f.numero)), ...(paginas.length ? { paginas } : {}),
  };
  const problemas = invariantesProfunda(pub, nuevo, item.id);
  const revision = revisarPaquete(nuevo);
  const cuerpo = Buffer.from(JSON.stringify(nuevo));
  if (problemas.length || !revision.ok || cuerpo.length > LIMITES.jsonBytes) {
    return fin({ estado: 'revision', version: null, problema: problemas.length ? 'no_se_conservo' : !revision.ok ? 'paquete_no_valido' : 'paquete_muy_grande',
      dudas: [...problemas.map(p => ({ ...p, gravedad: 'error' })), ...dudas].slice(0, 200), errores: revision.ok ? [] : revision.errores.slice(0, 20) },
    { clave: `fabrica_revision:${item.id}:m${pub.base}`, nivel: 'atencion', detalle: { n: problemas.length + dudas.length } });
  }
  const huella = createHash('sha256').update(cuerpo).digest('hex');
  const g = await guardarJson(db, config, { cuerpo, revisado: { datos: nuevo, revision, huella }, origen: 'fabrica', escribir: ctx.escribir });
  const nf = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(g.datos.paquete.id);
  // Los archivos (fotos, clips, figuras, páginas, audio, video) se pasan de la versión de antes que los tiene.
  for (const [clase, r] of Object.entries(RECURSOS)) {
    let lista = [];
    try { lista = r.declarados(nuevo) ?? []; } catch { lista = []; }
    for (const x of lista) {
      const archivo = typeof x === 'string' ? x : x?.archivo;
      if (!archivo) continue;
      const desde = pub.filas.find(f => existsSync(rutaDeRecurso(config, f, clase, archivo)));
      const ok = desde ? await adjuntar(db, config, nf, clase, archivo, rutaDeRecurso(config, desde, clase, archivo), ctx.escribir) : false;
      if (!ok && ['figura', 'foto', 'clip'].includes(clase)) dudas.push({ donde: archivo, problema: 'archivo_no_esta', gravedad: clase === 'figura' ? 'error' : 'dudoso' });
    }
  }
  const listo = db.prepare('SELECT estado FROM academia_paquetes WHERE id = ?').get(nf.id).estado === 'listo';
  if (listo && !dudas.length) {
    await ctx.escribir(() => activarPaquete(db, { paqueteId: nf.id, materias: [item.id] }));
    return fin({ estado: 'publicada', version: nf.id, dudas: [], publicadaEn: iso(ahora), temasMejorados: cambiados },
      { clave: `fabrica_profunda:${item.id}:${nf.id}`, nivel: 'atencion', detalle: { temas: cambiados } });
  }
  return fin({ estado: 'revision', version: nf.id, dudas: dudas.slice(0, 200), temasMejorados: cambiados, problema: listo ? null : 'paquete_incompleto' },
    { clave: `fabrica_revision:${item.id}:m${nf.id}`, nivel: 'atencion', detalle: { n: dudas.length } });
}

// ---------- UNA llamada (como la fábrica: lo que respondió se guarda con su costo; nunca se paga dos veces) ----------
async function llamar(ctx, { item, clave, p, pedido, revisar, cfg, ahora, op = null }) {
  const { db, config } = ctx;
  const bytes = Buffer.byteLength(pedido.sistema) + Buffer.byteLength(pedido.texto) + Buffer.byteLength(JSON.stringify(pedido.esquema));
  const proposito = op?.propositos?.[p.proposito] ?? p.proposito;
  const AJUSTE_ESPERA = op?.ajusteEspera ?? AJUSTE_ESPERA_PROFUNDA;
  const guardarProfunda = op?.anotarPaso ? (dbx, _id, valor) => op.anotarPaso(dbx, valor) : guardarProfundaReal;
  const puede = puedeLlamar(db, config, { proposito, bytes, ahora, topeMicro: op?.topeMicro ?? cfg.profunda.topeMicro, gastado: op?.gastado ? op.gastado(db) : gastoProfundaMicro(db) });
  if (!puede.ok) {
    if (puede.motivo === 'demasiado_largo') {
      await ctx.escribir(() => guardarAjuste(db, clave, JSON.stringify({ fallido: true, motivo: 'demasiado_largo', en: iso(ahora) })));
      return { trabajo: true, seguir: true };
    }
    const motivo = puede.motivo === 'tope_fabrica' ? 'tope_profunda' : puede.motivo;
    await ctx.escribir(() => guardarAjuste(db, AJUSTE_ESPERA, JSON.stringify({ motivo, en: iso(ahora) })));
    return { trabajo: true, seguir: false, motivo, ...(puede.esperarMs && puede.esperarMs < 62 * 60_000 ? { esperarMs: puede.esperarMs } : {}) };
  }
  const previo = leerJson(db, `${clave}.intentos`) ?? { n: 0 };
  if (previo.n > 0 && previo.motivo) pedido.texto += `\n\nEl intento anterior no sirvió (${previo.motivo}): corrígelo.`;
  const yaPagado = leerJson(db, `${clave}.crudo`);
  const r = yaPagado?.intento === previo.n && yaPagado.json ? { usada: false, motivo: 'ya_cobrada' } : await ctx.ia.pedir({
    proposito, paso: `${op?.pasoPrefijo ?? `p:${item.id}:`}${corto(clave, 12)}:${previo.n}`, sistema: pedido.sistema, texto: pedido.texto, esquema: pedido.esquema,
    guardar: (dbx, json, llamada) => guardarAjuste(dbx, `${clave}.crudo`, JSON.stringify({ json, intento: previo.n, llamadaId: llamada.id, costoMicro: llamada.costoMicro, en: iso(ahora) })),
  });
  const crudo = leerJson(db, `${clave}.crudo`);
  const json = r.usada ? r.json : r.motivo === 'ya_cobrada' && crudo?.json && crudo.intento === previo.n ? crudo.json : null;
  if (json) {
    const rev = revisar(json);
    if (rev.ok) {
      await ctx.escribir(() => {
        guardarAjuste(db, clave, JSON.stringify({ json, en: iso(ahora) }));
        const e = estadoProfunda(db, item.id);
        guardarProfunda(db, item.id, { ...e, estado: p.tipo === 'verificar' ? 'verificando' : 'mejorando', hechos: [...(e.hechos ?? []), iso(ahora)].slice(-40) });
        guardarAjuste(db, AJUSTE_ESPERA, 'null');
      });
      return { trabajo: true, seguir: true };
    }
    return falla(ctx, clave, previo, rev.motivo, ahora, 5 * 60_000, AJUSTE_ESPERA);
  }
  if (['sobrecargado', 'error_proveedor', 'sin_red', 'tiempo_agotado', 'limite_proveedor', 'base_ocupada', 'interrumpida', 'demasiadas_llamadas'].includes(r.motivo)) {
    await ctx.escribir(() => { guardarAjuste(db, AJUSTE_ESPERA, JSON.stringify({ motivo: r.motivo, en: iso(ahora) })); guardarGeneral(db, { esperaHasta: iso(ahora + T.esperaPasajeroMs) }); });
    return { trabajo: true, seguir: false, motivo: r.motivo };
  }
  if (['respuesta_no_valida', 'respuesta_incompleta', 'rechazada', 'no_se_pudo_guardar', 'ya_cobrada'].includes(r.motivo)) return falla(ctx, clave, previo, r.motivo, ahora, T.esperaFallaMs, AJUSTE_ESPERA);
  await ctx.escribir(() => guardarAjuste(db, AJUSTE_ESPERA, JSON.stringify({ motivo: r.motivo, en: iso(ahora) })));
  return { trabajo: true, seguir: false, motivo: r.motivo };
}
async function falla(ctx, clave, previo, motivo, ahora, esperaMs, ajusteEspera = AJUSTE_ESPERA_PROFUNDA) {
  const n = previo.n + 1;
  await ctx.escribir(() => {
    guardarAjuste(ctx.db, `${clave}.intentos`, JSON.stringify({ n, motivo }));
    if (n >= P.intentos) guardarAjuste(ctx.db, clave, JSON.stringify({ fallido: true, motivo, en: iso(ahora) }));
    guardarAjuste(ctx.db, ajusteEspera, JSON.stringify({ motivo, en: iso(ahora) }));
    guardarGeneral(ctx.db, { esperaHasta: iso(ahora + esperaMs) });
  });
  return { trabajo: true, seguir: false, motivo };
}

// Los temas de una materia con su lectura, sus tarjetas de antes y su «leer» (lo guardado de sus pasos).
function temasDe(db, dir, item, man, fuenteOral, op = null) {
  const base = item.rec.base ?? item.pub.base;
  const out = new Map();
  for (const t of item.pub.orden) {
    if (op?.soloTemas && !op.soloTemas.has(t.id)) continue;
    const c = contextoTema(dir, item, t, man, fuenteOral);
    const clave = op?.prefijo ? paso => `${op.prefijo}.${t.id}.${paso}` : paso => claveSalida(item.id, base, t.id, paso);
    const leer = paso => leerJson(db, clave(paso));
    out.set(t.id, { t, c, viejas: viejasDe(t), leer, clave });
  }
  out.man = man;
  out.fuenteOral = fuenteOral;
  return out;
}

// ---------- Un paso de la mejora profunda ----------
// → { trabajo: false, motivo } (apagada o ya no falta nada: no gasta) o { trabajo: true, seguir, motivo?, esperarMs? }.
export async function profundizar(ctx, { ahora, cfg, man }) {
  const { db, config } = ctx;
  if (!cfg.profunda?.activa) return { trabajo: false, motivo: 'apagada' };
  const dir = carpetaFuentes(config);
  const fo = leerFuenteOral(dir);
  const fuenteOral = fo.hay && fo.ok ? fo : null;
  const plan = planProfundo(db, config, { man, fuenteOral });
  const item = plan.find(x => x.pendiente);
  if (!item) return { trabajo: false, motivo: 'hecha' };
  if (item.rec.estado === 'pendiente' || item.rec.base == null) {
    await ctx.escribir(() => guardarProfunda(db, item.id, { ...item.rec, estado: 'mejorando', base: item.pub.base, iniciadaEn: iso(ahora) }));
    return { trabajo: true, seguir: true, motivo: 'empieza' };
  }
  const info = temasDe(db, dir, item, man, fuenteOral);
  for (const x of info.values()) {
    if (!x.c) continue;
    for (const p of pasosProfundos(x.leer, x.c, x.viejas)) {
      if (hecho(x.leer(p.paso))) continue;
      const pedido = pedidoProfundo(x.leer, x.c, x.t, p, item.pub, x.viejas);
      const planGuardado = x.leer('plan')?.json ?? { contexto: [], tarjetas: [] };
      return llamar(ctx, { item, clave: x.clave(p.paso), p, pedido, revisar: json => revisarProfunda(p, json, x.c, x.t, item.pub, x.viejas, planGuardado), cfg, ahora });
    }
  }
  return armarProfunda(ctx, item, info, ahora);
}

// ---------- 0.14.2: un trabajo de «Pídele a la IA» (reescribir UN tema con lo que pidió el dueño) ----------
// La MISMA tubería que la mejora profunda (escribir → verificar contra el libro → versión nueva publicada o «Esperando
// revisión»), solo para los temas pedidos, con sus propios pasos guardados (op.prefijo), sus propósitos (chat_*) y su
// tope (op.topeMicro). → { trabajo, seguir, motivo?, listo? }
export async function trabajoDeTemas(ctx, { materia, temas, instruccion, ahora, cfg, op }) {
  const { db, config } = ctx;
  const dir = carpetaFuentes(config);
  const fo = leerFuenteOral(dir);
  const fuenteOral = fo.hay && fo.ok ? fo : null;
  let man = null;
  try { man = leerManifiesto(dir); } catch { man = null; }
  const pub = publicado(db, config, materia);
  if (!pub) return { trabajo: false, motivo: 'sin_publicar' };
  const oral = MATERIAS_ORAL.includes(materia);
  const item = { id: materia, oral, pub, rec: { base: op.base ?? pub.base }, cap: oral ? fuenteOral?.capitulos?.find(c => c.id === materia) ?? null : null, mm: oral ? null : man?.materias?.find(m => m.id === materia) ?? null };
  if (op.base != null && op.base !== pub.base) return { trabajo: false, motivo: 'version_cambio' };
  const conOp = { ...op, soloTemas: new Set(temas) };
  const info = temasDe(db, dir, item, man, fuenteOral, conOp);
  if (![...info.values()].some(x => x.c)) return { trabajo: false, motivo: 'sin_fuentes' };
  for (const x of info.values()) {
    if (!x.c) continue;
    for (const p of pasosProfundos(x.leer, x.c, x.viejas)) {
      if (hecho(x.leer(p.paso))) continue;
      const pedido = pedidoProfundo(x.leer, x.c, x.t, p, item.pub, x.viejas, instruccion);
      const planGuardado = x.leer('plan')?.json ?? { contexto: [], tarjetas: [] };
      return llamar(ctx, { item, clave: x.clave(p.paso), p, pedido, revisar: json => revisarProfunda(p, json, x.c, x.t, item.pub, x.viejas, planGuardado), cfg, ahora, op: conOp });
    }
  }
  info.man = man;
  info.fuenteOral = fuenteOral;
  await armarProfunda(ctx, item, info, ahora, conOp);
  return { trabajo: true, seguir: true, listo: true };
}
// El contexto de UN tema publicado (para «Revisar errores»): su lectura del libro, sus tarjetas y la clave.
export function temaPublicado(db, config, materia, temaId) {
  const dir = carpetaFuentes(config);
  const fo = leerFuenteOral(dir);
  const fuenteOral = fo.hay && fo.ok ? fo : null;
  let man = null;
  try { man = leerManifiesto(dir); } catch { man = null; }
  const pub = publicado(db, config, materia);
  if (!pub) return null;
  const oral = MATERIAS_ORAL.includes(materia);
  const item = { id: materia, oral, pub, cap: oral ? fuenteOral?.capitulos?.find(c => c.id === materia) ?? null : null, mm: oral ? null : man?.materias?.find(m => m.id === materia) ?? null };
  const t = pub.orden.find(x => x.id === temaId);
  if (!t) return null;
  return { pub, t, c: contextoTema(dir, item, t, man, fuenteOral), viejas: viejasDe(t) };
}

// ---------- Lo que ve el administrador (solo lee) ----------
export function vistaProfunda(db, config, { ahora = Date.now(), cuota, man = null, fuenteOral = null } = {}) {
  const { activa, topeMicro } = leerConfigFabrica(db).profunda;
  const dir = carpetaFuentes(config);
  const plan = planProfundo(db, config, { man, fuenteOral });
  const medidas = db.prepare(`SELECT proposito, COUNT(*) AS n, ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(PROPOSITOS_PROFUNDA)} GROUP BY proposito`).all(...PROPOSITOS_PROFUNDA);
  const costo = prop => { const m = medidas.find(x => x.proposito === prop); return m && m.n >= 3 ? Math.round(m.g / m.n) : prop === 'profunda_escribir' ? P.costoEscribirMicro : P.costoVerificarMicro; };
  const falta = { temas: 0, pasos: 0, escribir: 0, verificar: 0, micro: 0, etaMs: 0 };
  const materias = plan.map(item => {
    const fila = { id: item.id, oral: item.oral, num: item.num, nombre: item.nombre, estado: item.estado, temas: 0, saltados: 0, pasos: 0, hechos: 0, pct: HECHOS.has(item.estado) ? 100 : 0,
      gastoMicro: gastoProfundaMicro(db, { materia: item.id }), dudas: (item.rec.dudas ?? []).length, version: item.rec.version ?? null, problema: item.rec.problema ?? null, temasMejorados: item.rec.temasMejorados ?? null };
    if (!item.pendiente) return fila;
    const info = temasDe(db, dir, { ...item }, man, fuenteOral);
    for (const x of info.values()) {
      fila.temas += 1;
      if (!x.c) { fila.saltados += 1; continue; }
      const pasos = pasosProfundos(x.leer, x.c, x.viejas);
      const listos = pasos.filter(p => hecho(x.leer(p.paso)));
      fila.pasos += pasos.length; fila.hechos += listos.length;
      if (listos.length < pasos.length) falta.temas += 1;
      for (const p of pasos) if (!listos.includes(p)) { if (p.proposito === 'profunda_escribir') falta.escribir += 1; else falta.verificar += 1; }
    }
    fila.pct = fila.pasos ? Math.floor((fila.hechos * 100) / (fila.pasos + 1)) : 0;
    return fila;
  });
  falta.pasos = falta.escribir + falta.verificar;
  falta.micro = falta.escribir * costo('profunda_escribir') + falta.verificar * costo('profunda_verificar');
  falta.etaMs = cuota ? Math.round(falta.pasos * (3_600_000 / Math.max(1, cuota.propia))) : 0;
  return { activa, topeMicro, gastoMicro: gastoProfundaMicro(db), espera: leerJson(db, AJUSTE_ESPERA), materias, falta, costoPasoMicro: { escribir: costo('profunda_escribir'), verificar: costo('profunda_verificar') } };
}

// Publicar lo que esperaba revisión (lo hace el administrador desde la pantalla).
export function publicarProfundaRevisada(db, { materia, usuarioId = null, ahora = Date.now() }) {
  const e = estadoProfunda(db, materia);
  if (e.estado !== 'revision' || !e.version) return { ok: false, motivo: 'sin_version' };
  const fila = db.prepare('SELECT estado FROM academia_paquetes WHERE id = ?').get(e.version);
  if (fila?.estado !== 'listo') return { ok: false, motivo: 'paquete_incompleto' };
  activarPaquete(db, { paqueteId: e.version, materias: [materia], usuarioId });
  guardarProfunda(db, materia, { ...e, estado: 'publicada', publicadaEn: iso(ahora), revisadaPor: usuarioId });
  anotarCambio(db, { materia, que: 'publicada_por_ti', estado: 'publicada', version: e.version, despues: { temas: e.temasMejorados ?? 0 }, ahora });
  abrirAviso(db, { clave: `fabrica_profunda:${materia}:${e.version}`, nivel: 'atencion', detalle: { revisada: 1 }, ahora });
  return { ok: true, version: e.version };
}
export function informeProfunda(db, materia) {
  if (!(MATERIAS.includes(materia) || MATERIAS_ORAL.includes(materia))) return null;
  const e = estadoProfunda(db, materia);
  return { materia, estado: e.estado, version: e.version ?? null, dudas: e.dudas ?? [], corregidos: e.corregidos ?? [], errores: e.errores ?? [], tgAlterado: [], saltados: e.saltados ?? [], en: e.en ?? null, problema: e.problema ?? null };
}
