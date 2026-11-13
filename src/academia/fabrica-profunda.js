// Academia 0.13.9: la «Mejora profunda de las clases» de la fábrica. APAGADA por defecto (Administrador → Contenido →
// Fábrica de materias, con el costo y el tiempo estimados antes de encenderla). Cuando la fábrica ya no tiene materias por
// fabricar, recorre lo YA PUBLICADO (la Materia 1 y los capítulos orales hechos a mano, y después todo lo que la fábrica
// publique), materia por materia y tema por tema, y reescribe las tarjetas con el patrón de enseñanza mejorado:
//   «¿Qué es y por qué importa?» → bloques de 3 tarjetas (una idea cada una: cada término definido la primera vez, en
//   español con el inglés, un ejemplo concreto, «Recuerda», «Truco para recordar») seguidos de «¿Te acuerdas?» (preguntas
//   de recuerdo, tarjetas para girar) → «Para el Test Guide» (igual que antes) → en el oral, «Lo que te puede preguntar el
//   examinador» (en inglés, como lo diría, con una respuesta modelo) → «Resumen» y «Otra vez, más fácil».
// Todo dato sale SOLO de las fuentes de la fábrica (la lectura del libro del tema, con su página). Después, otro modelo
// verifica (datos contra el libro, nada contradice la clave). Limpio → versión nueva publicada (y aviso por Telegram);
// con dudas → «Esperando revisión del admin» con la lista.
// Lo que NUNCA cambia (lo comprueba el código antes de guardar; si no, no se guarda nada): el Test Guide TAL CUAL
// (enunciado, opciones, clave, su explicación original), el inglés de «libro_qa» (pregunta_en, respuesta_en), «adicionales»,
// las preguntas del oral, los ids y el orden de los temas y sus preguntas (el avance de los alumnos sigue igual), y cada
// foto, clip y dibujo que ya estaba (el modelo nunca escribe un archivo: dice «de» = qué tarjeta de antes reescribe, y el
// código le pasa su foto, su clip y su dibujo).
// El gasto: sus propios propósitos (profunda_*), su tope propio (US$40 por defecto) y el tope general (deja libre el 20 %
// para los alumnos), con la misma cuota de la hora que la fábrica. Cada paso se guarda; nunca se paga dos veces.
//
// 0.14.7 («Mejorar todo con Claude, lo mejor»):
//  - El modelo lo elige el dueño: «opus» (lo mejor, por defecto: Opus 5.5 escribe y OTRA llamada de Opus 5.5, independiente,
//    verifica) o «sonnet» (más barato: Sonnet 5.5 escribe, Haiku 5.5 verifica). Los pasajes de una lectura muy larga los
//    saca Haiku (copia tal cual). El tamaño de la lectura sale del propósito (lecturaMaxDe): hasta 95 000 bytes directo.
//  - El orden: las materias del Test Guide con MÁS preguntas primero, después los capítulos orales; una materia que no
//    cabe en lo que queda del tope (con su revisión final) queda «fuera» y se dice (se vuelve a mirar si sube el tope).
//  - Además de las tarjetas: las explicaciones del Test Guide («sencilla» y «errores», nunca la clave) y, en el oral, la
//    explicación y el español de cada pregunta del libro (pregunta_es / respuesta_es, solo si el verificador confirma que
//    traduce FIEL el inglés). Cada uno se aplica solo si el verificador lo aprueba UNO POR UNO y pasa las reglas del código.
//  - Etapas de una ronda de «Mejorar todo» (cfg.profunda.etapas): a) reescribir cada tema (con un dibujo en cada tarjeta
//    donde ayude: es la etapa b, dentro de la a, sin quitar nunca una foto, clip o dibujo); c) la «revisión muy profunda»:
//    otra pasada independiente sobre cada tema PUBLICADO contra el libro y la clave → un informe, y lo que salió «error» se
//    arregla con la misma tubería (escribir → verificar → publicar solo si está limpio). Al final, «Quedan US$X».
//  - Rondas (cfg.profunda.ronda): una ronda nueva empieza cuando la de ahora ya no tiene nada por hacer. Sus estados, sus
//    pasos y su gasto van con su número (lo de antes queda guardado, nunca se borra).
import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MATERIAS, MATERIAS_ORAL, LIMITES, LIMITES_ORAL, revisarPaquete } from './formato.js';
import { normalizar } from './reto-calidad.js';
import { carpetaAcademia, leerAjuste, guardarAjuste, leerEnUso, guardarJson, activarPaquete, rutaDeRecurso, RECURSOS } from './paquetes.js';
import { carpetaFuentes, leerLecturas, textoDeLectura, imagenesDeTema, leerManifiesto } from './fuentes.js';
import { leerFuenteOral, contextoOral } from './fabrica-oral.js';
import { REGLAS_PROFUNDA, GUIA_ENSENANZA, REGLAS_VERIFICACION, REGLAS_VERIFICACION_PROFUNDA, ESQUEMAS, ESQUEMAS_PROFUNDA, TAREAS, TAREAS_PROFUNDA, datos } from './fabrica-prompts.js';
import { tarjetaConVisual, revisarDiagrama, TIPOS_DIAGRAMA } from './diagramas.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { GASTO_SQL } from '../ia/gasto.js';
import { PROPOSITOS, PROPOSITOS_PROFUNDA } from '../ia/propositos.js';
import { precioDe, costoMicro } from '../ia/precios.js';
import { leerConfigIa } from '../ia/config.js';
import { gastoMicro, mesCobro, elegirProveedor, modelosDe } from '../ia/presupuesto.js';
import { puedeLlamar, adjuntar, estadoMateria, guardarGeneral, leerConfigFabrica, cuotaHora, T } from './fabrica.js';
import { anotarCambio, costoDe } from './cambios-ia.js';

export const P = Object.freeze({
  tarjetasPorPaso: 3, intentos: 2, explicacionesTg: 4, explicacionesOral: 3,
  // Lo que ocupa en un pedido lo que no es la lectura (reglas, tarea, datos del paso y esquema): la lectura directa es
  // lo que cabe en el propósito menos esto (lecturaMaxDe). Si la lectura es más larga, primero se sacan sus pasajes.
  margenEscribirBytes: 30_000, margenVerificarBytes: 20_000, lecturaOralMaxBytes: 170_000,
  // Para el estimado: ~3 bytes por token (español con tildes), lo que va en el mensaje de cada paso y lo que escribe el
  // modelo (con lo que piensa). Mientras no haya 3 llamadas medidas de un propósito.
  bytesPorToken: 3, tokensMensaje: 4_000, tokensPasajes: 4_000,
  salida: Object.freeze({ opus: Object.freeze({ escribir: 3_500, verificar: 2_500 }), sonnet: Object.freeze({ escribir: 2_500, verificar: 1_200 }) }),
  // Lo que se calcula que necesita arreglar la revisión final: 1 de cada 4 temas (con la tubería entera).
  arreglarFraccion: 0.25,
  // 0.13.9 (para «Pídele a la IA» sin modelo): lo típico de un paso.
  costoEscribirMicro: 40_000, costoVerificarMicro: 5_000,
});
// Los propósitos de cada modelo (rol del paso → propósito).
export const MODOS = Object.freeze({
  opus: Object.freeze({ escribir: 'profunda_escribir_opus', verificar: 'profunda_verificar_opus', extracto: 'profunda_extracto' }),
  sonnet: Object.freeze({ escribir: 'profunda_escribir', verificar: 'profunda_verificar', extracto: 'profunda_extracto' }),
});
export const MODOS_CHAT = Object.freeze({
  opus: Object.freeze({ escribir: 'chat_escribir_opus', verificar: 'chat_verificar_opus', extracto: 'chat_verificar' }),
  sonnet: Object.freeze({ escribir: 'chat_escribir', verificar: 'chat_verificar', extracto: 'chat_verificar' }),
});
export const lecturaMaxDe = props => PROPOSITOS[props.escribir].entradaMaxBytes - P.margenEscribirBytes;
export const verificarMaxDe = props => PROPOSITOS[props.verificar].entradaMaxBytes - P.margenVerificarBytes;
const extractoMaxDe = props => PROPOSITOS[props.extracto].entradaMaxBytes - P.margenVerificarBytes;
// «Terminadas» en la etapa a: publicada, esperando revisión o sin nada que cambiar. «fuera»: no cabía en el tope.
const HECHOS = new Set(['publicada', 'revision', 'saltada']);
const iso = ms => new Date(ms).toISOString();
const corto = (t, n = 16) => createHash('sha256').update(String(t)).digest('hex').slice(0, n);
const clon = v => JSON.parse(JSON.stringify(v));
const leerJson = (db, clave) => { try { const v = JSON.parse(leerAjuste(db, clave) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const sinNulos = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
const enLista = lista => `(${lista.map(() => '?').join(', ')})`;
const hecho = s => Boolean(s && (s.json || s.fallido));
const rondaActual = db => leerConfigFabrica(db).profunda.ronda;

// ---------- Estado (filas de «ajustes»; nada se borra) ----------
const sufijo = ronda => (ronda > 1 ? `.r${ronda}` : '');
const claveMateria = (materia, ronda) => `fabrica.profunda${sufijo(ronda)}.m.${materia}`;
const AJUSTE_ESPERA = 'fabrica.profunda.espera';
const AJUSTE_ESPERA_PROFUNDA = AJUSTE_ESPERA;
export function estadoProfunda(db, materia, ronda = rondaActual(db)) {
  return { estado: 'pendiente', base: null, version: null, dudas: [], corregidos: [], saltados: [], hechos: [], ...(leerJson(db, claveMateria(materia, ronda)) ?? {}) };
}
export const guardarProfunda = (db, materia, valor, ronda = rondaActual(db)) => guardarAjuste(db, claveMateria(materia, ronda), JSON.stringify(valor));
const guardarProfundaReal = guardarProfunda;
const claveSalida = (materia, base, tema, paso, ronda) => `fabrica.profunda${sufijo(ronda)}.salida.${materia}.v${base}.${tema}.${paso}`;
export const prefijoPaso = (materia, ronda) => (ronda > 1 ? `p${ronda}:${materia}:` : `p:${materia}:`);
// Lo gastado en una ronda (y en una materia de esa ronda): las llamadas cuyo «paso» empieza con su prefijo.
export function gastoProfundaMicro(db, { materia = null, ronda = rondaActual(db) } = {}) {
  const patron = materia ? `${prefijoPaso(materia, ronda)}%` : ronda > 1 ? `p${ronda}:%` : 'p:%';
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(PROPOSITOS_PROFUNDA)} AND paso LIKE ?`).get(...PROPOSITOS_PROFUNDA, patron).g;
}
export const propsDe = cfg => MODOS[cfg?.profunda?.modelo] ?? MODOS.opus;

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
// 0.14.7: primero las del Test Guide con MÁS preguntas (lo que más pesa en el examen; empate: su orden de siempre),
// después los capítulos orales (en su orden). Solo lo publicado y con fuentes; lo que la fábrica todavía tiene esperando
// tu revisión, después. La 11 (SMS) sin fuentes queda «sin_fuentes» (nunca gasta).
export function ordenMaterias(man) {
  const tg = id => (man?.materias?.find(m => m.id === id)?.temas ?? []).reduce((n, t) => n + (t.tg?.length ?? 0), 0);
  return [...[...MATERIAS].sort((a, b) => tg(b) - tg(a) || MATERIAS.indexOf(a) - MATERIAS.indexOf(b)), ...MATERIAS_ORAL];
}
export function planProfundo(db, config, { man = null, fuenteOral = null, lector = crearLector(config), ronda = rondaActual(db) } = {}) {
  return ordenMaterias(man).map(id => {
    const oral = MATERIAS_ORAL.includes(id);
    const cap = oral ? fuenteOral?.capitulos?.find(c => c.id === id) ?? null : null;
    const mm = oral ? null : man?.materias?.find(m => m.id === id) ?? null;
    const rec = estadoProfunda(db, id, ronda);
    const fab = estadoMateria(db, id).estado;
    const preguntasTg = (mm?.temas ?? []).reduce((n, t) => n + (t.tg?.length ?? 0), 0);
    const base = { id, oral, num: mm?.num ?? cap?.num ?? null, nombre: mm?.nombre ?? cap?.nombre ?? null, rec, fab, preguntasTg, ronda };
    if (HECHOS.has(rec.estado)) return { ...base, estado: rec.estado, pendiente: false, cap, mm };
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
    const c = contextoOral(dir, fuenteOral, item.cap, tt, { maxBytes: P.lecturaOralMaxBytes });
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
  ejemplo: s.ejemplo ? String(s.ejemplo).slice(0, 200) : null, tiene_foto: s.imagen || s.clip ? true : null, tiene_dibujo: s.visual && s.visual.tipo !== 'titulo' ? true : null,
});
// Las preguntas del examen del tema (como datos: nunca se reescriben). 0.14.7: la respuesta del libro ENTERA.
export function examenDe(t, pub, c) {
  if (c.oral) return { preguntas_del_libro: (t.libro_qa ?? []).map(x => ({ n: x.n, pagina: Number(x.pagina) || null, pregunta_en: x.pregunta_en, respuesta_en: String(x.respuesta_en ?? '') })) };
  return { test_guide: (t.preguntas ?? []).map(id => pub.preguntas.get(id)).filter(q => q?.origen === 'test_guide' && q.original)
    .map(q => ({ id: q.id, enunciado: q.original.enunciado, correcta: q.original.opciones?.find(o => o.letra === q.original.correcta)?.texto ?? '' })) };
}
// 0.14.7: lo que se explica mejor: las preguntas del Test Guide del tema (Test Guide) o las del libro (oral), con un id fijo.
export function explicablesDe(t, pub, c) {
  if (c.oral) return (t.libro_qa ?? []).map((x, k) => ({ id: `qa-${k + 1}`, k, x }));
  return (t.preguntas ?? []).map(id => pub.preguntas.get(id)).filter(q => q?.origen === 'test_guide' && q.original).map(q => ({ id: q.id, q }));
}
const estimadas = viejas => Math.min(12, Math.max(3, viejas.filter(({ s }) => s.tipo === 'tarjeta' && !FIJA(s) && !RELLENO(s)).length));
// rol: 'escribir' | 'verificar' | 'extracto' (el propósito lo pone el modo: Opus, Sonnet o los del chat).
export function pasosProfundos(leer, c, viejas, props = MODOS.opus, { explicables = [] } = {}) {
  const pasos = [];
  if (c.largo > lecturaMaxDe(props)) pasos.push({ paso: 'extracto', rol: 'extracto', tipo: 'extracto' });
  pasos.push({ paso: 'plan', rol: 'escribir', tipo: 'plan' });
  const plan = leer('plan');
  if (plan?.fallido) return pasos.map(p => ({ ...p, proposito: props[p.rol] }));
  const n = plan?.json?.tarjetas?.length ?? estimadas(viejas);
  for (let i = 0; i < Math.ceil(n / P.tarjetasPorPaso); i++) pasos.push({ paso: `tarjetas-${i + 1}`, rol: 'escribir', tipo: 'tarjetas', desde: i * P.tarjetasPorPaso });
  pasos.push({ paso: 'cierre', rol: 'escribir', tipo: 'cierre' });
  const lote = c.oral ? P.explicacionesOral : P.explicacionesTg;
  const lotes = Math.ceil(explicables.length / lote);
  for (let i = 0; i < lotes; i++) pasos.push({ paso: `explicaciones-${i + 1}`, rol: 'escribir', tipo: 'explicaciones', desde: i * lote, hasta: (i + 1) * lote });
  pasos.push({ paso: 'verificar', rol: 'verificar', tipo: 'verificar' });
  for (let i = 0; i < lotes; i++) pasos.push({ paso: `verificar-explicaciones-${i + 1}`, rol: 'verificar', tipo: 'verificar_explicaciones', desde: i * lote, hasta: (i + 1) * lote, de: `explicaciones-${i + 1}` });
  return pasos.map(p => ({ ...p, proposito: props[p.rol] }));
}
const bloquesDe = leer => {
  const out = [];
  for (let i = 1; i < 40; i++) { const s = leer(`tarjetas-${i}`); if (!s) break; out.push(s); }
  return out;
};

// ---------- Los pedidos ----------
function pedidoProfundo(leer, c, t, p, pub, viejas, props, instruccion = null) {
  const r = pedidoProfundoBase(leer, c, t, p, pub, viejas, props);
  // 0.14.2: un trabajo de «Pídele a la IA»: lo que pidió el dueño (solo contenido) va al final de cada paso de escribir.
  // Va entre la tarea y sus datos (los datos siguen siendo lo último del mensaje), sin «<» ni «>».
  if (instruccion && ['plan', 'tarjetas', 'cierre', 'explicaciones'].includes(p.tipo)) {
    const pedido = String(instruccion).slice(0, 600).replace(/[<>]/g, ' ');
    r.texto = r.texto.replace('\n<datos>', `\nPEDIDO DEL DUEÑO (solo sobre cómo se enseña; nunca cambies las preguntas, sus opciones, sus respuestas ni lo que dice el libro): «${pedido}»\n<datos>`);
  }
  return r;
}
// El «sistema» de verificar: IGUAL para el verificar del tema, sus explicaciones y la revisión final (caché).
const sistemaVerificar = (c, props) => `${REGLAS_VERIFICACION_PROFUNDA}\n\nLECTURA COMPLETA:\n${datos(c.texto.slice(0, verificarMaxDe(props)))}`;
const datosExplicable = (e, c) => (c.oral
  ? { id: e.id, n: e.x.n ?? null, pagina: e.x.pagina, pregunta_en: e.x.pregunta_en, respuesta_en: e.x.respuesta_en ?? null, pregunta_es_de_ahora: e.x.pregunta_es ?? null, respuesta_es_de_ahora: e.x.respuesta_es ?? null, explicacion_es_de_ahora: e.x.explicacion_es ?? null, puntos_clave_de_ahora: e.x.puntos_clave ?? null }
  : { id: e.id, enunciado: e.q.original.enunciado, opciones: e.q.original.opciones.map(o => ({ letra: o.letra, texto: o.texto })), correcta: e.q.original.correcta,
    correcta_texto: e.q.original.opciones.find(o => o.letra === e.q.original.correcta)?.texto ?? '', explicacion_test_guide: e.q.original.explicacion ?? null, sencilla_de_ahora: e.q.sencilla ?? null, errores_de_ahora: e.q.errores ?? null });
function pedidoProfundoBase(leer, c, t, p, pub, viejas, props) {
  const extracto = leer('extracto')?.json?.pasajes;
  const titulo = (id, n) => (c.titulos?.get(id) ?? id) + (n != null ? `, p. ${n}` : '');
  const lectura = extracto ? extracto.map(x => `[${titulo(x.libro, x.pagina)}]\n${x.texto}`).join('\n\n') : c.texto;
  // IGUAL en todos los pasos de escritura del tema (caché de 5 minutos).
  const sistema = `${REGLAS_PROFUNDA}\n\n${GUIA_ENSENANZA}\n\nTEMA: ${t.titulo}${c.oral ? ' (EXAMEN ORAL)' : ''}\n\nLECTURA DEL LIBRO (con sus páginas):\n${datos(lectura)}`;
  const examen = examenDe(t, pub, c);
  const plan = leer('plan')?.json ?? { contexto: [], tarjetas: [] };
  const fotos = (c.imagenes ?? []).filter(x => x.libro).map(x => ({ archivo: x.archivo, pagina: x.pagina, pie: x.pie ?? null }));
  const explicables = explicablesDe(t, pub, c);
  switch (p.tipo) {
    case 'extracto': return { sistema: `${REGLAS_VERIFICACION}\n\nLECTURA COMPLETA:\n${datos(c.texto.slice(0, extractoMaxDe(props)))}`, texto: `${TAREAS.extracto}\n${datos({ tema: t.titulo, ...examen })}`, esquema: ESQUEMAS.extracto };
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
    case 'explicaciones': {
      const lote = explicables.slice(p.desde, p.hasta).map(e => datosExplicable(e, c));
      return c.oral
        ? { sistema, texto: `${TAREAS_PROFUNDA.explicaciones_oral}\n${datos({ preguntas_del_libro: lote })}`, esquema: ESQUEMAS_PROFUNDA.explicaciones_oral }
        : { sistema, texto: `${TAREAS_PROFUNDA.explicaciones_tg}\n${datos({ preguntas: lote })}`, esquema: ESQUEMAS_PROFUNDA.explicaciones_tg };
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
      return { sistema: sistemaVerificar(c, props), texto: `${TAREAS_PROFUNDA.verificar}\n${datos({ clave, contenido })}`, esquema: ESQUEMAS.verificar };
    }
    case 'verificar_explicaciones': {
      const escrito = new Map((c.oral ? leer(p.de)?.json?.items : leer(p.de)?.json?.preguntas)?.map(x => [String(x.id), x]) ?? []);
      const items = explicables.slice(p.desde, p.hasta).filter(e => escrito.has(e.id)).map(e => ({ original: datosExplicable(e, c), nuevo: escrito.get(e.id) }));
      return { sistema: sistemaVerificar(c, props), texto: `${TAREAS_PROFUNDA.verificar_explicaciones}\n${datos({ items })}`, esquema: ESQUEMAS_PROFUNDA.verificar_explicaciones };
    }
    default: throw new Error('paso desconocido');
  }
}

// ---------- Reglas del código para lo que se reescribe (sin IA) ----------
const NUMERO = /\d+(?:[.,]\d+)*/g;
const soloDigitos = s => String(s).replace(/(\d)[.,](?=\d)/g, '$1');
const numerosDe = s => new Set(soloDigitos(s ?? '').match(NUMERO) ?? []);
function numerosFuera(textos, ...bases) {
  const base = new Set(bases.flatMap(b => [...numerosDe(b)]));
  const fuera = new Set();
  for (const x of textos) for (const n of numerosDe(x)) if (n.length > 1 && !base.has(n)) fuera.add(n);
  return [...fuera];
}
function numerosRaros(textos, c, viejas) {
  return numerosFuera(textos, c.texto, JSON.stringify(viejas.map(v => v.s)));
}
// 0.14.7: la lista numerada para recordar («1. … · 2. … · 3. …»): cuántos puntos seguidos desde el 1 (0 si no hay al
// menos 2) y si van separados por «·». Lo que la traía la sigue trayendo igual (si no, se queda lo de antes).
export function numeracion(texto) {
  const t = String(texto ?? '');
  const re = /(?:^|[\s·(])(\d{1,2})[.)](?=\s)/g;
  let n = 0;
  for (let m = re.exec(t); m; m = re.exec(t)) if (Number(m[1]) === n + 1) n += 1;
  return n >= 2 ? n : 0;
}
const conPuntoMedio = t => /\d[.)]\s[^·]*·\s*\d[.)]\s/.test(String(t ?? ''));
export function mismaForma(viejo, nuevo) {
  const n = numeracion(viejo);
  if (!n) return true;
  return numeracion(nuevo) === n && (!conPuntoMedio(viejo) || conPuntoMedio(nuevo));
}
const plano = s => String(s ?? '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').replace(/[\s.;:!?¡¿]+$/u, '').trim();
const ETIQUETAS = Object.freeze(['Por qué:', 'Piensa así:', 'Truco para recordar:']);
// Una explicación del Test Guide: empieza con «✔», nombra la opción correcta TAL CUAL en su primera línea, «errores» solo
// de opciones incorrectas (las mismas que antes, si había), las etiquetas y la lista numerada de antes, y ningún número
// que no esté en el libro, la pregunta o lo de antes. → { ok, motivo?, valor? }
export function explicacionTgValida(q, x, textoLibro = '') {
  const o = q.original;
  const correcta = o.opciones.find(op => op.letra === o.correcta)?.texto ?? '';
  const sencilla = String(x?.sencilla ?? '').trim();
  if (sencilla.length < 10 || sencilla.length > 2000) return { ok: false, motivo: 'sencilla_largo' };
  if (!sencilla.startsWith('✔')) return { ok: false, motivo: 'sin_correcta' };
  if (!plano(sencilla.split('\n')[0]).includes(plano(correcta))) return { ok: false, motivo: 'no_nombra_la_correcta' };
  for (const e of ETIQUETAS) if (String(q.sencilla ?? '').includes(e) && !sencilla.includes(e)) return { ok: false, motivo: 'formato' };
  if (!mismaForma(q.sencilla, sencilla)) return { ok: false, motivo: 'numeracion' };
  const malas = o.opciones.map(op => op.letra).filter(l => l !== o.correcta);
  const errores = {};
  for (const e of Array.isArray(x?.errores) ? x.errores : []) {
    const idea = String(e?.idea ?? '').trim();
    if (!malas.includes(e?.letra) || errores[e.letra] || !idea || idea.length > 1000) return { ok: false, motivo: 'errores' };
    errores[e.letra] = idea;
  }
  const antes = Object.keys(q.errores ?? {}).sort();
  if (antes.length ? JSON.stringify(Object.keys(errores).sort()) !== JSON.stringify(antes) : !Object.keys(errores).length) return { ok: false, motivo: 'errores' };
  const fuera = numerosFuera([sencilla, ...Object.values(errores)], textoLibro, JSON.stringify(o), q.sencilla, JSON.stringify(q.errores ?? {}));
  if (fuera.length) return { ok: false, motivo: `numero_no_esta:${fuera.slice(0, 3).join(',')}` };
  return { ok: true, valor: { sencilla, errores } };
}
// Una pregunta del libro del oral: el inglés nunca se toca; el español nuevo trae los mismos números y la misma lista
// numerada que el original; sin «respuesta_en», nunca «respuesta_es». Lo que no pasa se queda como estaba (campo por campo).
// → { valor: { …solo los campos nuevos que pasan }, rechazados: [campo] }
export function explicacionOralValida(x0, y, textoLibro = '') {
  const valor = {};
  const rechazados = [];
  const base = [textoLibro, x0.pregunta_en, x0.respuesta_en, x0.pregunta_es, x0.respuesta_es, x0.explicacion_es, JSON.stringify(x0.puntos_clave ?? [])];
  const exp = String(y?.explicacion_es ?? '').trim();
  if (exp) { if (exp.length <= 4000 && !numerosFuera([exp], ...base).length && mismaForma(x0.explicacion_es, exp)) valor.explicacion_es = exp; else rechazados.push('explicacion_es'); }
  const puntos = Array.isArray(y?.puntos_clave) ? y.puntos_clave.map(p => String(p ?? '').trim()).filter(Boolean) : [];
  if (puntos.length) { if (puntos.length <= LIMITES_ORAL.puntosClave && puntos.every(p => p.length <= 2000) && !numerosFuera(puntos, ...base).length) valor.puntos_clave = puntos; else rechazados.push('puntos_clave'); }
  const traduce = (campo, en) => {
    const nuevo = y?.[campo] == null ? '' : String(y[campo]).trim();
    if (!nuevo) return;
    const ok = en != null && nuevo.length <= 8000 && [...numerosDe(en)].every(n => numerosDe(nuevo).has(n)) && !numerosFuera([nuevo], en, x0[campo]).length && mismaForma(x0[campo] ?? en, nuevo);
    if (ok) valor[campo] = nuevo; else rechazados.push(campo);
  };
  traduce('pregunta_es', x0.pregunta_en);
  traduce('respuesta_es', x0.respuesta_en ?? null);
  return { valor, rechazados };
}
// Las explicaciones que pasan: el verificador dijo «ok» de ESE elemento y las reglas del código. → { tg: Map, qa: Map, corregidos }
function explicacionesAprobadas(leer, c, t, pub, pasos) {
  const tg = new Map();
  const qa = new Map();
  const corregidos = [];
  const explicables = explicablesDe(t, pub, c);
  for (const p of pasos.filter(x => x.tipo === 'verificar_explicaciones')) {
    const escrito = c.oral ? leer(p.de)?.json?.items : leer(p.de)?.json?.preguntas;
    const veredicto = new Map((leer(p.paso)?.json?.items ?? []).map(v => [String(v.id), v]));
    for (const e of explicables.slice(p.desde, p.hasta)) {
      const y = (escrito ?? []).find(z => String(z.id) === e.id);
      if (!y) continue;
      const v = veredicto.get(e.id);
      if (v?.ok !== true) { corregidos.push({ donde: e.id, problema: `explicacion_no_confirmada${v?.problema ? `:${String(v.problema).slice(0, 200)}` : ''}` }); continue; }
      if (c.oral) {
        const r = explicacionOralValida(e.x, y, c.texto);
        for (const campo of r.rechazados) corregidos.push({ donde: e.id, problema: `regla_${campo}` });
        if (Object.keys(r.valor).length) qa.set(e.k, r.valor);
      } else {
        const r = explicacionTgValida(e.q, y, c.texto);
        if (r.ok) tg.set(e.id, r.valor); else corregidos.push({ donde: e.id, problema: `regla:${r.motivo}` });
      }
    }
  }
  return { tg, qa, corregidos };
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
  // 0.14.7: el «recuerda» de antes con su lista numerada («1. … · 2. …») se queda si el nuevo la perdió.
  if (vieja?.recuerda && !mismaForma(vieja.recuerda, s.recuerda)) s.recuerda = vieja.recuerda;
  if (x.ingles?.length) s.ingles = x.ingles.slice(0, 8).map(w => ({ palabra: String(w.palabra).slice(0, LIMITES.corto), pronunciacion: w.pronunciacion, significado: w.significado }));
  // 0.14.7: el dibujo de antes GANA (ya fue revisado); el del modelo solo va donde no había ninguno.
  if (vieja?.visual) s.visual = clon(vieja.visual);
  else if (x.visual?.tipo) {
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
    case 'explicaciones': {
      const ids = new Set(explicablesDe(t, pub, c).slice(p.desde, p.hasta).map(e => e.id));
      const lista = c.oral ? json.items : json.preguntas;
      return lista.length && lista.every(x => ids.has(String(x.id))) ? { ok: true } : { ok: false, motivo: 'ids' };
    }
    case 'verificar': case 'verificar_explicaciones': return { ok: true };
    default: return { ok: false, motivo: 'paso' };
  }
}

// ---------- Armar un tema (en código) ----------
const preguntasGirar = lista => lista.map(q => `Si te preguntan: ${q.pregunta}\nRecuerda: ${q.respuesta}`).join('\n\n');
const visualesDe = secciones => secciones.filter(s => s.visual && s.visual.tipo !== 'titulo').map(s => JSON.stringify(s.visual));
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
  // 0.14.7: cada dibujo de antes también sigue: si su tarjeta no se reescribió, va a la más cercana cuyo dibujo hizo el
  // modelo ahora (nunca encima de otro dibujo de antes). Si no hay dónde, es un error (espera tu revisión).
  const deAntes = new Set(viejas.filter(v => v.s.visual).map(v => JSON.stringify(v.s.visual)));
  const hayVisual = new Set(visualesDe(secciones));
  for (const { n, s } of viejas) {
    if (!s.visual || s.visual.tipo === 'titulo' || FIJA(s) || hayVisual.has(JSON.stringify(s.visual))) continue;
    const libres = secciones.map((x, i) => i).filter(i => tarjeta(i) && !deAntes.has(JSON.stringify(secciones[i].visual ?? null)));
    const cerca = libres.filter(i => de[i] != null && de[i] <= n).at(-1) ?? libres[0];
    if (cerca == null) { dudas.push({ donde: s.titulo, problema: 'visual_perdido', gravedad: 'error' }); continue; }
    secciones[cerca].visual = clon(s.visual);
    delete secciones[cerca].solo_texto;
    hayVisual.add(JSON.stringify(s.visual));
  }
  const conMedios = (t.reexplicacion ?? []).filter(x => x.imagen || x.clip || (x.visual && x.visual.tipo !== 'titulo')).map(clon);
  const tema = { ...clon(t), secciones, reexplicacion: [{ titulo: 'Otra vez, más fácil', texto: String(cierre.otra_vez).slice(0, 4000), fuentes: fuenteTema }, ...conMedios] };
  for (const d of leer('verificar')?.json?.dudas ?? []) dudas.push({ donde: String(d.donde).slice(0, 200), problema: String(d.problema).slice(0, 400), gravedad: d.gravedad });
  if (leer('verificar')?.fallido) dudas.push({ donde: t.titulo, problema: 'paso_fallido:verificar', gravedad: 'error' });
  return { tema, dudas, corregidos: [], cambiado: true };
}

// ---------- Lo que nunca cambia (si algo cambió, no se guarda) ----------
const medios = temas => new Set(temas.flatMap(t => [...(t.secciones ?? []), ...(t.reexplicacion ?? [])]).flatMap(s => [s.imagen?.archivo, s.clip?.archivo]).filter(Boolean));
const visualesTema = t => [...visualesDe([...(t.secciones ?? []), ...(t.reexplicacion ?? [])]), ...(t.libro_qa ?? []).filter(x => x.visual).map(x => JSON.stringify(x.visual))];
// 0.14.7: lo único que puede cambiar en una pregunta del libro (el inglés y todo lo demás, TAL CUAL).
export const EDITABLES_QA = Object.freeze(['explicacion_es', 'puntos_clave', 'pregunta_es', 'respuesta_es']);
const sinCampos = (o, campos) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !campos.includes(k)));
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
    for (const campo of ['titulo', 'preguntas', 'adicionales', 'titulo_en']) {
      if (JSON.stringify(n[campo] ?? null) !== JSON.stringify(t[campo] ?? null)) mal.push({ donde: t.id, problema: `${campo}_cambio` });
    }
    // libro_qa: las mismas, en el mismo orden; el inglés (y todo lo que no es su español) TAL CUAL.
    const a = t.libro_qa ?? null;
    const b = n.libro_qa ?? null;
    if ((a == null) !== (b == null) || (a && (a.length !== b.length || a.some((x, k) => JSON.stringify(sinCampos(x, EDITABLES_QA)) !== JSON.stringify(sinCampos(b[k], EDITABLES_QA))
      || (b[k].respuesta_es != null && x.respuesta_en == null))))) mal.push({ donde: t.id, problema: 'libro_qa_cambio' });
    const vis = new Set(visualesTema(n));
    if (visualesTema(t).some(v => !vis.has(v))) mal.push({ donde: t.id, problema: 'visual_perdido' });
  }
  const ids = new Set(viejos.flatMap(t => t.preguntas ?? []));
  const puestas = new Map((nuevo.preguntas ?? []).map(q => [q.id, q]));
  for (const id of ids) {
    const antes = pub.preguntas.get(id);
    if (!antes) continue;
    const ahora = puestas.get(id) ?? null;
    // 0.14.7: solo la explicación («sencilla», «errores») de una del Test Guide puede cambiar, y nunca contra la clave.
    const igual = JSON.stringify(ahora) === JSON.stringify(antes);
    const soloExplicacion = ahora && antes.origen === 'test_guide' && JSON.stringify(sinCampos(ahora, ['sencilla', 'errores'])) === JSON.stringify(sinCampos(antes, ['sencilla', 'errores']))
      && explicacionTgValida({ ...antes, sencilla: antes.sencilla, errores: antes.errores }, { sencilla: ahora.sencilla, errores: Object.entries(ahora.errores ?? {}).map(([letra, idea]) => ({ letra, idea })) }, '\u0000' + JSON.stringify(ahora)).ok;
    if (!igual && !soloExplicacion) mal.push({ donde: id, problema: 'pregunta_cambio' });
  }
  const nuevos = medios(mn.temas);
  for (const a of medios(viejos)) if (!nuevos.has(a)) mal.push({ donde: a, problema: 'archivo_perdido' });
  return mal;
}

// ---------- Armar la materia: versión nueva → publicar o esperar revisión ----------
async function armarProfunda(ctx, item, info, ahora, op = null) {
  const { db, config } = ctx;
  const { pub } = item;
  const ronda = op?.ronda ?? item.ronda ?? 1;
  const guardarEstado = op?.guardarEstado ?? ((dbx, valor) => guardarProfunda(dbx, item.id, { ...estadoProfunda(dbx, item.id, ronda), ...valor }, ronda));
  const dudas = [];
  const corregidos = [];
  const saltados = [];
  const explicacionesTg = new Map();
  let cambiados = 0;
  let explicadas = 0;
  const temas = pub.orden.map(t => {
    const x = info.get(t.id);
    if (op?.soloTemas && !op.soloTemas.has(t.id)) return clon(t);
    if (!x?.c) { saltados.push(t.id); return clon(t); }
    const r = temaProfundo(x.leer, x.c, t, x.viejas);
    dudas.push(...r.dudas.map(d => ({ ...d, tema: t.id })));
    corregidos.push(...r.corregidos.map(d => ({ ...d, tema: t.id })));
    // 0.14.7: las explicaciones aprobadas (una por una).
    const ex = explicacionesAprobadas(x.leer, x.c, t, pub, x.pasos);
    corregidos.push(...ex.corregidos.map(d => ({ ...d, tema: t.id })));
    for (const [id, v] of ex.tg) explicacionesTg.set(id, v);
    if (ex.qa.size) r.tema.libro_qa = (t.libro_qa ?? []).map((q, k) => (ex.qa.has(k) ? { ...clon(q), ...ex.qa.get(k) } : clon(q)));
    explicadas += ex.tg.size + ex.qa.size;
    if (r.cambiado || ex.tg.size || ex.qa.size) cambiados += 1;
    return r.tema;
  });
  const fin = async (valor, aviso = null) => {
    await ctx.escribir(() => {
      guardarEstado(db, { ...valor, saltados, corregidos: corregidos.slice(0, 100), en: iso(ahora) });
      if (aviso) abrirAviso(db, { ...aviso, ahora });
      // 0.14.7: las «Ideas para el futuro» que dejó el cierre de cada tema.
      for (const [id, x] of info) if (x.leer) anotarIdeasFuturo(db, x.leer('cierre')?.json?.ideas_futuro, { fase: 'explicar', materia: item.id, tema: id, ahora });
      // 0.14.2: «Lo que hizo la IA»: cada clase reescrita (publicada o esperando revisión) queda en el registro.
      if (valor.estado === 'publicada' || valor.estado === 'revision') {
        anotarCambio(db, { materia: item.id, que: op?.que ?? 'clase_reescrita', estado: valor.estado, version: valor.version ?? null, antes: { version: pub.base }, despues: { temas: valor.temasMejorados ?? 0, explicaciones: explicadas, dudas: (valor.dudas ?? []).length }, ...costoDe(db, op?.pasoPrefijo ?? prefijoPaso(item.id, ronda)), detalle: op?.detalle ?? null, ahora });
      }
    });
    return { trabajo: true, seguir: true };
  };
  // 0.14.7: «Mejorar todo» (automático): un tema con dudas del verificador se queda COMO ESTABA (nada a medias) y se
  // lista; lo demás se publica solo. La revisión final lo intenta otra vez; si vuelve a fallar, queda en la lista.
  const omitidos = [];
  if (op?.auto) {
    for (let i = 0; i < temas.length; i++) {
      const t = pub.orden[i];
      const suyas = dudas.filter(d => d.tema === t.id);
      if (!suyas.length) continue;
      temas[i] = clon(t);
      for (const id of t.preguntas ?? []) explicacionesTg.delete(id);
      omitidos.push({ tema: t.id, titulo: t.titulo, dudas: suyas.slice(0, 20) });
      cambiados -= 1;
    }
    for (let i = dudas.length - 1; i >= 0; i--) if (omitidos.some(o => o.tema === dudas[i].tema)) dudas.splice(i, 1);
  }
  const finConOmitidos = (valor, aviso) => fin({ ...valor, omitidos }, aviso);
  if (cambiados <= 0) return finConOmitidos({ estado: 'saltada', motivo: omitidos.length ? 'omitidos' : 'sin_cambios', dudas: [] });
  const mn = { ...clon(pub.materia), temas };
  const preguntas = [];
  const vistas = new Set();
  for (const t of temas) for (const id of t.preguntas ?? []) {
    if (vistas.has(id) || !pub.preguntas.has(id)) continue;
    vistas.add(id);
    const q = clon(pub.preguntas.get(id));
    const e = explicacionesTg.get(id);
    if (e) { q.sencilla = e.sencilla; q.errores = e.errores; }
    preguntas.push(q);
  }
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
    return finConOmitidos({ estado: 'revision', version: null, problema: problemas.length ? 'no_se_conservo' : !revision.ok ? 'paquete_no_valido' : 'paquete_muy_grande',
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
    return finConOmitidos({ estado: 'publicada', version: nf.id, dudas: [], publicadaEn: iso(ahora), temasMejorados: cambiados, explicaciones: explicadas },
      { clave: `fabrica_profunda:${item.id}:${nf.id}`, nivel: 'atencion', detalle: { temas: cambiados } });
  }
  return finConOmitidos({ estado: 'revision', version: nf.id, dudas: dudas.slice(0, 200), temasMejorados: cambiados, explicaciones: explicadas, problema: listo ? null : 'paquete_incompleto' },
    { clave: `fabrica_revision:${item.id}:m${nf.id}`, nivel: 'atencion', detalle: { n: dudas.length } });
}

// ---------- UNA llamada (como la fábrica: lo que respondió se guarda con su costo; nunca se paga dos veces) ----------
async function llamar(ctx, { item, clave, p, pedido, revisar, cfg, ahora, op = null, temaId = null }) {
  const { db, config } = ctx;
  const ronda = op?.ronda ?? item.ronda ?? 1;
  const bytes = Buffer.byteLength(pedido.sistema) + Buffer.byteLength(pedido.texto) + Buffer.byteLength(JSON.stringify(pedido.esquema));
  const proposito = p.proposito;
  const AJUSTE_ESPERA = op?.ajusteEspera ?? AJUSTE_ESPERA_PROFUNDA;
  const guardarProfunda = op?.anotarPaso ? (dbx, _id, valor) => op.anotarPaso(dbx, valor) : (dbx, id, valor) => guardarProfundaReal(dbx, id, valor, ronda);
  const puede = puedeLlamar(db, config, { proposito, bytes, ahora, topeMicro: op?.topeMicro ?? cfg.profunda.topeMicro, gastado: op?.gastado ? op.gastado(db) : gastadoRonda(db, cfg, ronda) });
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
    proposito, paso: `${op?.pasoPrefijo ?? prefijoPaso(item.id, ronda)}${corto(clave, 12)}:${previo.n}`, sistema: pedido.sistema, texto: pedido.texto, esquema: pedido.esquema,
    guardar: (dbx, json, llamada) => guardarAjuste(dbx, `${clave}.crudo`, JSON.stringify({ json, intento: previo.n, llamadaId: llamada.id, costoMicro: llamada.costoMicro, en: iso(ahora) })),
  });
  const crudo = leerJson(db, `${clave}.crudo`);
  const json = r.usada ? r.json : r.motivo === 'ya_cobrada' && crudo?.json && crudo.intento === previo.n ? crudo.json : null;
  if (json) {
    const rev = revisar(json);
    if (rev.ok) {
      await ctx.escribir(() => {
        guardarAjuste(db, clave, JSON.stringify({ json, en: iso(ahora) }));
        const e = estadoProfunda(db, item.id, ronda);
        guardarProfunda(db, item.id, { ...e, estado: p.tipo === 'verificar' || p.tipo === 'verificar_explicaciones' ? 'verificando' : 'mejorando', ...(temaId ? { tema: temaId } : {}), hechos: [...(e.hechos ?? []), iso(ahora)].slice(-40) });
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

// Los temas de una materia con su lectura, sus tarjetas de antes, sus pasos y su «leer» (lo guardado de sus pasos).
function temasDe(db, dir, item, man, fuenteOral, props, op = null) {
  const base = item.rec?.base ?? item.pub.base;
  const ronda = op?.ronda ?? item.ronda ?? 1;
  const out = new Map();
  for (const t of item.pub.orden) {
    if (op?.soloTemas && !op.soloTemas.has(t.id)) continue;
    const c = contextoTema(dir, item, t, man, fuenteOral);
    const clave = op?.prefijo ? paso => `${op.prefijo}.${t.id}.${paso}` : paso => claveSalida(item.id, base, t.id, paso, ronda);
    const leer = paso => leerJson(db, clave(paso));
    const viejas = viejasDe(t);
    const pasos = c ? pasosProfundos(leer, c, viejas, props, { explicables: explicablesDe(t, item.pub, c) }) : [];
    out.set(t.id, { t, c, viejas, leer, clave, pasos });
  }
  out.man = man;
  out.fuenteOral = fuenteOral;
  return out;
}
// El próximo paso de los temas (o null si ya están todos).
async function siguientePaso(ctx, { item, info, props, cfg, ahora, op = null, instruccion = null }) {
  for (const x of info.values()) {
    if (!x.c) continue;
    for (const p of x.pasos) {
      if (hecho(x.leer(p.paso))) continue;
      // Un paso de verificar explicaciones sin lo escrito (falló): no hay nada que verificar.
      if (p.tipo === 'verificar_explicaciones' && !x.leer(p.de)?.json) {
        await ctx.escribir(() => guardarAjuste(ctx.db, x.clave(p.paso), JSON.stringify({ fallido: true, motivo: 'sin_escrito', en: iso(ahora) })));
        return { trabajo: true, seguir: true };
      }
      const pedido = pedidoProfundo(x.leer, x.c, x.t, p, item.pub, x.viejas, props, instruccion);
      const planGuardado = x.leer('plan')?.json ?? { contexto: [], tarjetas: [] };
      return llamar(ctx, { item, clave: x.clave(p.paso), p, pedido, revisar: json => revisarProfunda(p, json, x.c, x.t, item.pub, x.viejas, planGuardado), cfg, ahora, op, temaId: x.t.id });
    }
  }
  return null;
}
function fuentesDe(config) {
  const dir = carpetaFuentes(config);
  const fo = leerFuenteOral(dir);
  let man = null;
  try { man = leerManifiesto(dir); } catch { man = null; }
  return { dir, fuenteOral: fo.hay && fo.ok ? fo : null, man };
}

// ---------- El estimado (cuánto cuesta y cuánto tarda; sin IA) ----------
// Por tema: cada paso con su tamaño de verdad (la lectura del tema) y el precio del modelo. Escribir: el primer paso
// escribe la lectura en la caché y los demás la leen de la caché; verificar: igual con su «sistema». Lo que el modelo
// escribe (con lo que piensa) sale de P.salida. Si un propósito ya tiene 3 o más llamadas medidas, se usa su promedio.
function costoPaso(proposito, { sistemaTok, cache, salidaTok }, medidas) {
  const m = medidas.get(proposito);
  if (m && m.n >= 3) return Math.round(m.g / m.n);
  const fila = precioDe('anthropic', PROPOSITOS[proposito].modelo);
  if (!fila) return PROPOSITOS[proposito].tipicoMicro;
  const uso = cache === 'escribe' ? { entrada: P.tokensMensaje, cacheEscritura: sistemaTok, cacheLectura: 0 } : cache === 'lee' ? { entrada: P.tokensMensaje, cacheEscritura: 0, cacheLectura: sistemaTok } : { entrada: P.tokensMensaje + sistemaTok, cacheEscritura: 0, cacheLectura: 0 };
  return costoMicro(fila, { ...uso, salida: salidaTok, geo: 'global' });
}
export function estimarTema(x, props, medidas, { hechoPaso = () => false } = {}) {
  const modo = props.escribir.endsWith('_opus') ? 'opus' : 'sonnet';
  const tok = b => Math.ceil(b / P.bytesPorToken);
  const extracto = x.pasos.some(p => p.tipo === 'extracto');
  const sistemaEscribir = tok((extracto ? P.tokensPasajes * P.bytesPorToken : x.c.largo) + 4_000);
  const sistemaVer = tok(Math.min(x.c.largo, verificarMaxDe(props)) + 2_000);
  let micro = 0;
  let escribir = 0;
  let verificar = 0;
  let primeroE = true;
  let primeroV = true;
  for (const p of x.pasos) {
    const listo = hechoPaso(p);
    if (p.rol === 'extracto') { if (!listo) { micro += costoPaso(p.proposito, { sistemaTok: tok(Math.min(x.c.largo, extractoMaxDe(props))), cache: 'no', salidaTok: P.tokensPasajes }, medidas); verificar += 1; } continue; }
    if (p.rol === 'escribir') {
      if (!listo) { micro += costoPaso(p.proposito, { sistemaTok: sistemaEscribir, cache: primeroE ? 'escribe' : 'lee', salidaTok: P.salida[modo].escribir }, medidas); escribir += 1; }
      primeroE = false;
    } else {
      if (!listo) { micro += costoPaso(p.proposito, { sistemaTok: sistemaVer, cache: primeroV ? 'escribe' : 'lee', salidaTok: P.salida[modo].verificar }, medidas); verificar += 1; }
      primeroV = false;
    }
  }
  // La revisión final (etapa c): una verificación del tema publicado y, para 1 de cada 4 temas, arreglarlo.
  const revision = costoPaso(props.verificar, { sistemaTok: sistemaVer, cache: 'escribe', salidaTok: P.salida[modo].verificar }, medidas);
  const arreglo = Math.round(P.arreglarFraccion * x.pasos.reduce((s, p) => s + (p.rol === 'extracto' ? 0 : costoPaso(p.proposito, { sistemaTok: p.rol === 'escribir' ? sistemaEscribir : sistemaVer, cache: 'lee', salidaTok: P.salida[modo][p.rol] }, medidas)), 0));
  return { micro, escribir, verificar, revisionMicro: revision + arreglo };
}
const medidasDe = db => new Map(db.prepare(`SELECT proposito, COUNT(*) AS n, ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(PROPOSITOS_PROFUNDA)} AND estado = 'hecha' GROUP BY proposito`).all(...PROPOSITOS_PROFUNDA).map(m => [m.proposito, m]));
// El estimado de una ronda entera (la de ahora, o una nueva), con los dos modelos, por etapa y por materia, y qué entra en
// el tope (en el orden: más preguntas del Test Guide primero, después el oral). → { modelo, topeMicro, gastoMicro, … }
export function estimadoProfundo(db, config, { modelo = null, topeMicro = null, ronda = null, ahora = Date.now() } = {}) {
  const cfg = leerConfigFabrica(db);
  const r = ronda ?? cfg.profunda.ronda;
  const { dir, fuenteOral, man } = fuentesDe(config);
  const plan = planProfundo(db, config, { man, fuenteOral, ronda: r });
  const medidas = medidasDe(db);
  const tope = topeMicro ?? cfg.profunda.topeMicro;
  const gastado = r === cfg.profunda.ronda ? gastadoRonda(db, cfg, r) : 0;
  const cuota = cuotaHora(leerConfigIa(db));
  const porModo = {};
  for (const m of ['opus', 'sonnet']) {
    const props = MODOS[m];
    let disponible = Math.max(0, tope - gastado);
    const materias = [];
    let a = 0;
    let c = 0;
    let pasos = 0;
    for (const item of plan) {
      const fila = { id: item.id, oral: item.oral, num: item.num, nombre: item.nombre, estado: item.estado, preguntasTg: item.preguntasTg, temas: 0, aMicro: 0, cMicro: 0, pasos: 0 };
      if (item.pendiente) {
        for (const x of temasDe(db, dir, item, man, fuenteOral, props).values()) {
          if (!x.c) continue;
          const e = estimarTema(x, props, medidas, { hechoPaso: p => hecho(x.leer(p.paso)) });
          fila.temas += 1; fila.aMicro += e.micro; fila.cMicro += e.revisionMicro; fila.pasos += e.escribir + e.verificar + 1;
        }
        fila.entra = fila.aMicro + fila.cMicro <= disponible;
        if (fila.entra) { disponible -= fila.aMicro + fila.cMicro; a += fila.aMicro; c += fila.cMicro; pasos += fila.pasos; }
      }
      materias.push(fila);
    }
    const total = a + c;
    porModo[m] = {
      etapas: { a: a, b: 0, c }, totalMicro: total, pasos, etaMs: Math.round(pasos * (3_600_000 / Math.max(1, cuota.propia))),
      dentro: materias.filter(x => x.entra).map(x => x.id), fuera: materias.filter(x => x.entra === false).map(x => ({ id: x.id, nombre: x.nombre, oral: x.oral, micro: x.aMicro + x.cMicro })),
      quedanMicro: Math.max(0, tope - gastado - total), materias,
    };
  }
  const cfgIa = leerConfigIa(db);
  const libreGeneral = Math.max(0, Math.floor(cfgIa.topeGeneralMicro * (1 - T.margenGeneral)) - gastoMicro(db, { mes: mesCobro(ahora) }));
  return { modelo: modelo ?? cfg.profunda.modelo, ronda: r, topeMicro: tope, gastoMicro: gastado, porModo, libreGeneralMicro: libreGeneral, cuota: cuota.propia };
}
// ¿Cabe esta materia (su etapa a y su revisión final) en lo que queda del tope? (sin IA; solo con «etapas»)
function cabeEnTope(db, item, info, props, cfg, ronda) {
  const medidas = medidasDe(db);
  let micro = 0;
  for (const x of info.values()) if (x.c) { const e = estimarTema(x, props, medidas, { hechoPaso: p => hecho(x.leer(p.paso)) }); micro += e.micro + e.revisionMicro; }
  return { cabe: gastadoRonda(db, cfg, ronda) + micro <= cfg.profunda.topeMicro, micro };
}

// ---------- Un paso de la mejora profunda ----------
// → { trabajo: false, motivo } (apagada o ya no falta nada: no gasta) o { trabajo: true, seguir, motivo?, esperarMs? }.
const SIN_SALDO = new Set(['tope_profunda', 'tope_general', 'sin_credito', 'limite_gasto_proveedor']);
export async function profundizar(ctx, { ahora, cfg, man }) {
  const r = await profundizarPaso(ctx, { ahora, cfg, man });
  // 0.14.7: los avisos de «Mejorar todo» (pocos): «se acabó el saldo» (una vez; se cierra al seguir).
  if (cfg.profunda?.activa && cfg.profunda.etapas) {
    const ronda = cfg.profunda.ronda;
    if (r.trabajo && !r.seguir && SIN_SALDO.has(r.motivo)) await ctx.escribir(() => avisoTodo(ctx.db, cfg, ronda, 'saldo', ahora));
    else if (r.trabajo && r.seguir) await ctx.escribir(() => resolverAviso(ctx.db, `ia_todo:r${ronda}:saldo`, ahora));
  }
  return r;
}
async function profundizarPaso(ctx, { ahora, cfg, man }) {
  const { db, config } = ctx;
  if (!cfg.profunda?.activa) return { trabajo: false, motivo: 'apagada' };
  const ronda = cfg.profunda.ronda;
  const props = propsDe(cfg);
  const { dir, fuenteOral } = fuentesDe(config);
  const plan = planProfundo(db, config, { man, fuenteOral, ronda });
  // Etapa a (y b): la materia en curso o la siguiente que cabe en el tope.
  for (const item of plan.filter(x => x.pendiente)) {
    if (['pendiente', 'fuera'].includes(item.rec.estado) || item.rec.base == null) {
      if (cfg.profunda.etapas) {
        const info = temasDe(db, dir, { ...item, rec: { base: item.pub.base } }, man, fuenteOral, props);
        const cabe = cabeEnTope(db, item, info, props, cfg, ronda);
        if (!cabe.cabe) {
          if (item.rec.estado !== 'fuera') await ctx.escribir(() => guardarProfunda(db, item.id, { ...item.rec, estado: 'fuera', estimadoMicro: cabe.micro, en: iso(ahora) }, ronda));
          continue;
        }
      }
      await ctx.escribir(() => guardarProfunda(db, item.id, { ...item.rec, estado: 'mejorando', base: item.pub.base, iniciadaEn: iso(ahora) }, ronda));
      return { trabajo: true, seguir: true, motivo: 'empieza' };
    }
    const info = temasDe(db, dir, item, man, fuenteOral, props);
    const r = await siguientePaso(ctx, { item, info, props, cfg, ahora });
    if (r) return r;
    return armarProfunda(ctx, item, info, ahora, cfg.profunda.etapas ? { ronda, auto: true } : null);
  }
  // Etapa c: la «revisión muy profunda» de lo publicado (solo en una ronda de «Mejorar todo»).
  if (cfg.profunda.etapas && !plan.some(x => x.pendiente && x.rec.estado !== 'fuera')) {
    if (plan.some(x => HECHOS.has(x.rec.estado)) && !avisoDado(db, ronda, 'a_fin')) { await ctx.escribir(() => avisoTodo(db, cfg, ronda, 'a_fin', ahora)); return { trabajo: true, seguir: true }; }
    const r = await revisionFinal(ctx, { ahora, cfg, man, fuenteOral, dir, plan, props, ronda });
    if (r) return r;
    // Todo hecho (o lo que queda no cabe en el tope): se para, avisa una vez y deja el estado para la fase 5.
    if (!avisoDado(db, ronda, 'fin')) {
      await ctx.escribir(() => {
        avisoTodo(db, cfg, ronda, 'fin', ahora);
        guardarAjuste(db, AJUSTE_TODO_ESTADO, JSON.stringify({ ronda, fases: { leer: 'hecha', explicar: 'hecha', dibujos: 'hecha', revision: 'hecha' }, fuera: plan.filter(x => x.rec.estado === 'fuera').map(x => x.id), gastadoMicro: gastadoRonda(db, cfg, ronda), topeMicro: cfg.profunda.topeMicro, en: iso(ahora) }));
      });
    }
  }
  return { trabajo: false, motivo: 'hecha' };
}

// ---------- 0.14.7: «Mejorar todo con Claude» (las 5 fases, el tope compartido y los avisos) ----------
// El tope de TODO el trabajo (fases 1 a 5) es UN valor en «ajustes» que también lee la fase 5 («Mejorar la app con Claude»,
// otra parte de la app): ia.todo.tope_micro. Lo que gasta la fase 5 cuenta aquí si anota sus propósitos en
// ia.todo.propositos (una lista JSON). El estado de las fases 1–4 queda en ia.todo.estado; el de la fase 5, en ia.app.estado.
export const AJUSTE_TODO_TOPE = 'ia.todo.tope_micro';
export const AJUSTE_TODO_AUTO = 'ia.todo.auto';
export const AJUSTE_TODO_PROPOSITOS = 'ia.todo.propositos';
export const AJUSTE_TODO_ESTADO = 'ia.todo.estado';
export const AJUSTE_APP_ESTADO = 'ia.app.estado';
export const TODO_TOPE_MICRO = 90_000_000;
const AJUSTE_TODO_AVISOS = 'ia.todo.avisos';
export function topeTodoMicro(db) {
  const v = Number(leerAjuste(db, AJUSTE_TODO_TOPE));
  return leerAjuste(db, AJUSTE_TODO_TOPE) != null && Number.isSafeInteger(v) && v >= 0 ? v : null;
}
function gastoOtrosTodo(db) {
  let lista = [];
  try { lista = JSON.parse(leerAjuste(db, AJUSTE_TODO_PROPOSITOS) ?? '[]'); } catch { lista = []; }
  const props = (Array.isArray(lista) ? lista : []).filter(x => typeof x === 'string' && /^[a-z_]{2,40}$/.test(x) && !PROPOSITOS_PROFUNDA.includes(x)).slice(0, 20);
  if (!props.length) return 0;
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(props)}`).get(...props).g ?? 0;
}
// Lo gastado contra el tope de la mejora: la ronda y, con «Mejorar todo» (tope compartido), también la fase 5.
export function gastadoRonda(db, cfg, ronda) {
  const propio = gastoProfundaMicro(db, { ronda });
  return cfg?.profunda?.etapas && topeTodoMicro(db) != null ? propio + gastoOtrosTodo(db) : propio;
}
// «Ideas para el futuro» (lo que el modelo propone mejorar después: dibujos, explicaciones, cómo practicar, lo que el
// dueño podría controlar). Una fila de «ajustes» que solo agrega (las últimas 300); la lee la fase 5 y la ve el admin.
export const AJUSTE_IDEAS_FUTURO = 'ia.ideas.futuro';
export function leerIdeasFuturo(db) { try { const v = JSON.parse(leerAjuste(db, AJUSTE_IDEAS_FUTURO) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function anotarIdeasFuturo(db, ideas, { fase, materia = null, tema = null, ahora = Date.now() }) {
  const lista = leerIdeasFuturo(db);
  const vistas = new Set(lista.map(x => plano(x.texto)));
  let n = 0;
  for (const idea of (Array.isArray(ideas) ? ideas : []).slice(0, 3)) {
    const texto = String(idea ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
    if (texto.length < 8 || vistas.has(plano(texto))) continue;
    vistas.add(plano(texto));
    lista.push({ texto, fase, materia, tema, en: iso(ahora) });
    n += 1;
  }
  if (n) guardarAjuste(db, AJUSTE_IDEAS_FUTURO, JSON.stringify(lista.slice(-300)));
  return n;
}
function leerAvisosTodo(db) { try { return JSON.parse(leerAjuste(db, AJUSTE_TODO_AVISOS) ?? '{}') ?? {}; } catch { return {}; } }
const avisoDado = (db, ronda, evento) => Boolean(leerAvisosTodo(db)[`r${ronda}:${evento}`]);
export function avisoTodo(db, cfg, ronda, evento, ahora = Date.now()) {
  const usado = gastadoRonda(db, cfg, ronda);
  const tope = cfg.profunda.topeMicro;
  const vistos = leerAvisosTodo(db);
  if (evento !== 'saldo') { if (vistos[`r${ronda}:${evento}`]) return; vistos[`r${ronda}:${evento}`] = iso(ahora); guardarAjuste(db, AJUSTE_TODO_AVISOS, JSON.stringify(vistos)); }
  abrirAviso(db, { clave: `ia_todo:r${ronda}:${evento}`, nivel: 'atencion', detalle: { usadoMicro: usado, topeMicro: tope, quedanMicro: Math.max(0, tope - usado) }, ahora });
}
// ¿Claude puede hacer «lo mejor» ahora? (sin red; la prueba gratis con Opus es aparte). → { listo, motivo }
export function claudeListo(db, config, ahora = Date.now()) {
  const cfgIa = leerConfigIa(db);
  if (!cfgIa.encendida) return { listo: false, motivo: 'ia_apagada' };
  const fila = db.prepare("SELECT prueba, pausa_motivo FROM secretos WHERE uso = 'ia_anthropic' AND espacio_id IS NULL AND estado = 'activa' ORDER BY id DESC LIMIT 1").get();
  if (!fila) return { listo: false, motivo: 'sin_clave' };
  if (fila.prueba === 'verificacion_identidad' || fila.pausa_motivo === 'verificacion_identidad') return { listo: false, motivo: 'verificacion_identidad' };
  if (fila.prueba && fila.prueba !== 'ok') return { listo: false, motivo: 'clave_no_pasa', detalle: fila.prueba };
  if (!fila.prueba) return { listo: false, motivo: 'sin_probar' };
  const def = PROPOSITOS.profunda_escribir_opus;
  const e = elegirProveedor(db, config, cfgIa, ahora, modelosDe(def, cfgIa), def);
  if (!e.ok) return { listo: false, motivo: e.motivo === 'proveedor_no_usado' ? 'claude_no_usado' : e.motivo };
  if (leerConfigFabrica(db).pausada) return { listo: false, motivo: 'fabrica_pausada' };
  return { listo: true, motivo: null };
}
// Lo que pidió el dueño: con esta versión instalada y la prueba de la clave de Claude pasada, empieza SOLO (una sola vez:
// nunca vuelve a empezar si después lo pausa). Opus y US$90 para todo. → la config nueva, o null si no tocaba.
export function autoEmpezarTodo(db, config, { ahora = Date.now(), guardarConfig }) {
  if (leerAjuste(db, AJUSTE_TODO_AUTO) != null) return null;
  if (!claudeListo(db, config, ahora).listo) return null;
  const tope = topeTodoMicro(db) ?? TODO_TOPE_MICRO;
  const cfg = empezarProfunda(db, config, { modelo: 'opus', topeMicro: tope, guardarConfig, ahora });
  guardarAjuste(db, AJUSTE_TODO_AUTO, JSON.stringify({ en: iso(ahora), ronda: cfg.profunda.ronda }));
  return cfg;
}

// ---------- Etapa c: la «revisión muy profunda» (otra pasada independiente sobre lo PUBLICADO) ----------
const claveFinal = (ronda, materia, base, tema) => `fabrica.profunda${sufijo(ronda)}.final.${materia}.v${base}.${tema}`;
function contenidoPublicado(t, pub, c) {
  const tarjetas = viejasDe(t).map(({ s }) => sinNulos({ titulo: s.titulo, puntos: s.puntos ?? null, texto: s.tipo === 'tarjeta' ? null : s.texto ?? null, recuerda: s.recuerda ?? null, ejemplo: s.ejemplo ?? null, nota: s.nota ?? null, visual: s.visual?.parametros && s.visual.tipo !== 'titulo' ? s.visual.parametros : null }));
  const preguntas = c.oral
    ? (t.libro_qa ?? []).map((x, k) => sinNulos({ id: `libro ${k + 1}`, pregunta_en: x.pregunta_en, respuesta_en: x.respuesta_en ?? null, pregunta_es: x.pregunta_es ?? null, respuesta_es: x.respuesta_es ?? null, explicacion_es: x.explicacion_es ?? null, puntos_clave: x.puntos_clave ?? null }))
    : (t.preguntas ?? []).map(id => pub.preguntas.get(id)).filter(q => q?.original).map(q => sinNulos({ id: q.id, enunciado: q.original.enunciado, correcta: q.original.opciones?.find(o => o.letra === q.original.correcta)?.texto ?? null, sencilla: q.sencilla ?? null, errores: q.errores ?? null }));
  return { tarjetas, preguntas };
}
async function revisionFinal(ctx, { ahora, cfg, man, fuenteOral, dir, plan, props, ronda }) {
  const { db, config } = ctx;
  for (const item0 of plan) {
    if (!['publicada', 'saltada'].includes(item0.rec.estado)) continue;
    const rec = item0.rec;
    if (rec.final?.estado === 'hecha') continue;
    const pub = publicado(db, config, item0.id);
    if (!pub) continue;
    const item = { ...item0, pub, cap: item0.cap ?? (item0.oral ? fuenteOral?.capitulos?.find(c => c.id === item0.id) ?? null : null), mm: item0.mm ?? (item0.oral ? null : man?.materias?.find(m => m.id === item0.id) ?? null) };
    const base = rec.final?.base ?? pub.base;
    const guardarFinal = valor => guardarProfunda(db, item.id, { ...estadoProfunda(db, item.id, ronda), final: { ...(estadoProfunda(db, item.id, ronda).final ?? {}), base, ...valor } }, ronda);
    if (!rec.final) { await ctx.escribir(() => guardarFinal({ estado: 'revisando', temas: {} })); return { trabajo: true, seguir: true }; }
    // 1. Revisar cada tema publicado (una llamada cada uno), con la versión con la que empezó.
    for (const t of pub.orden) {
      const c = contextoTema(dir, item, t, man, fuenteOral);
      if (!c) continue;
      const clave = claveFinal(ronda, item.id, base, t.id);
      if (hecho(leerJson(db, clave))) continue;
      if (rec.final.estado !== 'revisando') break;
      const examen = examenDe(t, pub, c);
      const claveRespuestas = c.oral ? examen.preguntas_del_libro.map(x => ({ n: x.n, respuesta_en: x.respuesta_en })) : examen.test_guide.map(q => ({ id: q.id, correcta: q.correcta }));
      const pedido = { sistema: sistemaVerificar(c, props), texto: `${TAREAS_PROFUNDA.revision_final}\n${datos({ tema: t.titulo, clave: claveRespuestas, contenido: contenidoPublicado(t, pub, c) })}`, esquema: ESQUEMAS_PROFUNDA.revision_final };
      const p = { paso: 'final', rol: 'verificar', tipo: 'verificar', proposito: props.verificar };
      return llamar(ctx, { item: { ...item, ronda }, clave, p, pedido, revisar: () => ({ ok: true }), cfg, ahora, temaId: t.id, op: { ronda, anotarPaso: dbx => guardarProfunda(dbx, item.id, { ...estadoProfunda(dbx, item.id, ronda), tema: t.id }, ronda) } });
    }
    // 2. El informe; lo que salió «error» se arregla (tema por tema) con la misma tubería, que vuelve a verificar.
    const informe = pub.orden.map(t => {
      const x = leerJson(db, claveFinal(ronda, item.id, base, t.id));
      const dudas = (x?.json?.dudas ?? []).slice(0, 40).map(d => ({ donde: String(d.donde).slice(0, 200), problema: String(d.problema).slice(0, 400), gravedad: d.gravedad }));
      return { tema: t.id, titulo: t.titulo, dudas, fallido: Boolean(x?.fallido), sinFuentes: !x };
    });
    if (rec.final.estado === 'revisando') {
      await ctx.escribir(() => {
        guardarFinal({ estado: 'arreglando', informe, revisadaEn: iso(ahora), arreglos: {} });
        for (const t of pub.orden) anotarIdeasFuturo(db, leerJson(db, claveFinal(ronda, item.id, base, t.id))?.json?.ideas_futuro, { fase: 'revision', materia: item.id, tema: t.id, ahora });
        const dudas = informe.flatMap(x => x.dudas);
        anotarCambio(db, { materia: item.id, que: 'revision_final', estado: 'hecho', despues: { temas: informe.length, dudas: dudas.length, errores: dudas.filter(d => d.gravedad === 'error').length }, ...costoDe(db, prefijoPaso(item.id, ronda)), ahora });
      });
      return { trabajo: true, seguir: true };
    }
    const arreglos = rec.final.arreglos ?? {};
    const omitidos = (rec.omitidos ?? []).map(o => ({ tema: o.tema, titulo: o.titulo, dudas: o.dudas.map(d => ({ ...d, gravedad: 'error' })) }));
    const conError = [...omitidos, ...(rec.final.informe ?? informe).filter(x => !omitidos.some(o => o.tema === x.tema))]
      .filter(x => x.dudas.some(d => d.gravedad === 'error') && !arreglos[x.tema]);
    if (conError.length) {
      const x = conError[0];
      const instruccion = `Corrige SOLO estos problemas que encontró la revisión contra el libro (nada más): ${x.dudas.filter(d => d.gravedad === 'error').map(d => `${d.donde}: ${d.problema}`).join(' | ')}`.slice(0, 600);
      const opArreglo = {
        ronda, prefijo: `fabrica.profunda${sufijo(ronda)}.arreglo.${item.id}`, topeMicro: cfg.profunda.topeMicro, gastado: dbx => gastadoRonda(dbx, cfg, ronda),
        pasoPrefijo: `${prefijoPaso(item.id, ronda)}a:`, que: 'revision_arreglo', edicion: 'revision', detalle: instruccion, props, auto: true,
        anotarPaso: dbx => guardarProfunda(dbx, item.id, { ...estadoProfunda(dbx, item.id, ronda), tema: x.tema }, ronda),
        guardarEstado: (dbx, valor) => {
          const e = estadoProfunda(dbx, item.id, ronda);
          guardarProfunda(dbx, item.id, { ...e, final: { ...e.final, arreglos: { ...(e.final?.arreglos ?? {}), [x.tema]: { estado: valor.estado, version: valor.version ?? null, dudas: (valor.dudas ?? []).slice(0, 30), en: iso(ahora) } } } }, ronda);
        },
      };
      const r = await trabajoDeTemas(ctx, { materia: item.id, temas: [x.tema], instruccion, ahora, cfg, op: opArreglo });
      if (!r.trabajo) { await ctx.escribir(() => opArreglo.guardarEstado(db, { estado: 'no_se_pudo', motivo: r.motivo })); return { trabajo: true, seguir: true }; }
      return r;
    }
    await ctx.escribir(() => guardarFinal({ estado: 'hecha', terminadaEn: iso(ahora) }));
    return { trabajo: true, seguir: true };
  }
  return null;
}

// ---------- 0.14.2: un trabajo de «Pídele a la IA» (reescribir UN tema con lo que pidió el dueño) ----------
// La MISMA tubería que la mejora profunda (escribir → verificar contra el libro → versión nueva publicada o «Esperando
// revisión»), solo para los temas pedidos, con sus propios pasos guardados (op.prefijo), sus propósitos (op.props: los
// del chat con el modelo que eligió el dueño) y su tope (op.topeMicro). También la usa el arreglo de la revisión final.
// → { trabajo, seguir, motivo?, listo? }
export async function trabajoDeTemas(ctx, { materia, temas, instruccion, ahora, cfg, op }) {
  const { db, config } = ctx;
  const { dir, fuenteOral, man } = fuentesDe(config);
  const pub = publicado(db, config, materia);
  if (!pub) return { trabajo: false, motivo: 'sin_publicar' };
  const oral = MATERIAS_ORAL.includes(materia);
  const item = { id: materia, oral, pub, ronda: op.ronda ?? 1, rec: { base: op.base ?? pub.base }, cap: oral ? fuenteOral?.capitulos?.find(c => c.id === materia) ?? null : null, mm: oral ? null : man?.materias?.find(m => m.id === materia) ?? null };
  if (op.base != null && op.base !== pub.base) return { trabajo: false, motivo: 'version_cambio' };
  const props = op.props ?? MODOS_CHAT[cfg?.profunda?.modelo] ?? MODOS_CHAT.opus;
  const conOp = { ...op, soloTemas: new Set(temas) };
  const info = temasDe(db, dir, item, man, fuenteOral, props, conOp);
  if (![...info.values()].some(x => x.c)) return { trabajo: false, motivo: 'sin_fuentes' };
  const r = await siguientePaso(ctx, { item, info, props, cfg, ahora, op: conOp, instruccion });
  if (r) return r;
  await armarProfunda(ctx, item, info, ahora, conOp);
  return { trabajo: true, seguir: true, listo: true };
}
// El contexto de UN tema publicado (para «Revisar errores»): su lectura del libro, sus tarjetas y la clave.
export function temaPublicado(db, config, materia, temaId) {
  const { dir, fuenteOral, man } = fuentesDe(config);
  const pub = publicado(db, config, materia);
  if (!pub) return null;
  const oral = MATERIAS_ORAL.includes(materia);
  const item = { id: materia, oral, pub, cap: oral ? fuenteOral?.capitulos?.find(c => c.id === materia) ?? null : null, mm: oral ? null : man?.materias?.find(m => m.id === materia) ?? null };
  const t = pub.orden.find(x => x.id === temaId);
  if (!t) return null;
  return { pub, t, c: contextoTema(dir, item, t, man, fuenteOral), viejas: viejasDe(t), contenido: null };
}
export { contenidoPublicado, sistemaVerificar };

// ---------- Lo que ve el administrador (solo lee) ----------
export function vistaProfunda(db, config, { ahora = Date.now(), cuota, man = null, fuenteOral = null } = {}) {
  const cfg = leerConfigFabrica(db);
  const { activa, topeMicro, modelo, ronda, etapas } = cfg.profunda;
  const props = propsDe(cfg);
  const dir = carpetaFuentes(config);
  const plan = planProfundo(db, config, { man, fuenteOral, ronda });
  const medidas = medidasDe(db);
  const falta = { temas: 0, pasos: 0, escribir: 0, verificar: 0, micro: 0, etaMs: 0, porModelo: { opus: 0, sonnet: 0 } };
  const materias = plan.map(item => {
    const fila = { id: item.id, oral: item.oral, num: item.num, nombre: item.nombre, estado: item.estado, temas: 0, saltados: 0, pasos: 0, hechos: 0, pct: HECHOS.has(item.estado) ? 100 : 0,
      gastoMicro: gastoProfundaMicro(db, { materia: item.id, ronda }), omitidos: (item.rec.omitidos ?? []).length, dudas: (item.rec.dudas ?? []).length, version: item.rec.version ?? null, problema: item.rec.problema ?? null, temasMejorados: item.rec.temasMejorados ?? null,
      tema: item.rec.tema ?? null, final: item.rec.final ? { estado: item.rec.final.estado, temas: (item.rec.final.informe ?? []).length, errores: (item.rec.final.informe ?? []).reduce((n, x) => n + x.dudas.filter(d => d.gravedad === 'error').length, 0) } : null };
    if (!item.pendiente) return fila;
    const info = temasDe(db, dir, { ...item }, man, fuenteOral, props);
    for (const x of info.values()) {
      fila.temas += 1;
      if (!x.c) { fila.saltados += 1; continue; }
      const listos = x.pasos.filter(p => hecho(x.leer(p.paso)));
      fila.pasos += x.pasos.length; fila.hechos += listos.length;
      if (listos.length < x.pasos.length) falta.temas += 1;
      for (const p of x.pasos) if (!listos.includes(p)) { if (p.rol === 'escribir') falta.escribir += 1; else falta.verificar += 1; }
      falta.micro += estimarTema(x, props, medidas, { hechoPaso: p => hecho(x.leer(p.paso)) }).micro;
      for (const m of ['opus', 'sonnet']) {
        const otro = m === modelo ? x : { ...x, pasos: pasosProfundos(x.leer, x.c, x.viejas, MODOS[m], { explicables: explicablesDe(x.t, item.pub, x.c) }) };
        falta.porModelo[m] += estimarTema(otro, MODOS[m], medidas, { hechoPaso: p => hecho(x.leer(p.paso)) }).micro;
      }
    }
    fila.pct = fila.pasos ? Math.floor((fila.hechos * 100) / (fila.pasos + 1)) : 0;
    return fila;
  });
  falta.pasos = falta.escribir + falta.verificar;
  falta.etaMs = cuota ? Math.round(falta.pasos * (3_600_000 / Math.max(1, cuota.propia))) : 0;
  const gasto = gastoProfundaMicro(db, { ronda });
  return { activa, topeMicro, modelo, ronda, etapas: etapas === true, gastoMicro: gasto, quedanMicro: Math.max(0, topeMicro - gasto), espera: leerJson(db, AJUSTE_ESPERA), materias, falta };
}

// 0.14.7: lo corto para el Resumen (sin leer los paquetes ni el libro: solo los estados guardados).
export function resumenProfunda(db) {
  const cfg = leerConfigFabrica(db);
  const { activa, topeMicro, modelo, ronda, etapas } = cfg.profunda;
  const materias = [...MATERIAS, ...MATERIAS_ORAL].map(id => {
    const e = estadoProfunda(db, id, ronda);
    return { id, oral: MATERIAS_ORAL.includes(id), estado: e.estado, tema: e.tema ?? null, final: e.final?.estado ?? null, version: e.version ?? null };
  });
  const gasto = gastadoRonda(db, cfg, ronda);
  const cuenta = f => materias.filter(f).length;
  const trabajando = materias.find(m => ['mejorando', 'verificando'].includes(m.estado)) ?? materias.find(m => ['revisando', 'arreglando'].includes(m.final)) ?? null;
  const empezo = materias.some(m => m.estado !== 'pendiente');
  const terminada = empezo && !materias.some(m => ['mejorando', 'verificando'].includes(m.estado)) && (!etapas || !materias.some(m => ['publicada', 'saltada'].includes(m.estado) && m.final !== 'hecha'));
  return {
    activa, modelo, ronda, etapas: etapas === true, topeMicro, gastoMicro: gasto, quedanMicro: Math.max(0, topeMicro - gasto), espera: leerJson(db, AJUSTE_ESPERA),
    conteo: { publicadas: cuenta(m => m.estado === 'publicada'), revision: cuenta(m => m.estado === 'revision'), fuera: cuenta(m => m.estado === 'fuera'), sinCambios: cuenta(m => m.estado === 'saltada'), revisadas: cuenta(m => m.final === 'hecha') },
    trabajando, empezo, terminada, materias,
  };
}

// 0.14.7: «Mejorar todo con Claude»: enciende la mejora con el modelo y el tope elegidos y con sus etapas (a, b y c).
// Si la ronda de ahora ya no tiene nada por hacer, empieza una nueva (lo de antes queda guardado). → la config nueva.
export function empezarProfunda(db, config, { modelo = 'opus', topeMicro = null, guardarConfig, ahora = Date.now() }) {
  const cfg = leerConfigFabrica(db);
  const r = resumenProfunda(db);
  const nueva = r.empezo && r.terminada && !r.materias.some(m => m.estado === 'fuera');
  const ronda = nueva ? cfg.profunda.ronda + 1 : cfg.profunda.ronda;
  const tope = topeMicro ?? topeTodoMicro(db) ?? cfg.profunda.topeMicro;
  const nuevaCfg = guardarConfig(db, { pausada: false, profunda: { activa: true, modelo, etapas: true, ronda, topeMicro: tope } });
  guardarAjuste(db, AJUSTE_TODO_TOPE, String(tope));
  avisoTodo(db, nuevaCfg, ronda, 'empieza', ahora);
  return nuevaCfg;
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
  return { materia, estado: e.estado, version: e.version ?? null, dudas: e.dudas ?? [], corregidos: e.corregidos ?? [], errores: e.errores ?? [], tgAlterado: [], saltados: e.saltados ?? [], en: e.en ?? null, problema: e.problema ?? null,
    final: e.final ? { estado: e.final.estado, informe: e.final.informe ?? [], arreglos: e.final.arreglos ?? {} } : null };
}

// ---------- 0.14.7: «Qué está haciendo Claude ahora»: las 5 fases (solo lee; la pantalla lo pide cada pocos segundos) ----------
//  1 «Leyendo los libros» (el plan de cada tema, con su lectura entera) · 2 «Mejorando las explicaciones» (tarjetas,
//  explicaciones del Test Guide y del oral, verificadas) · 3 «Agregando dibujos y visuales» (llegan con cada materia
//  publicada) · 4 «Revisión profunda» (la etapa c) · 5 «Mejorando lo visual de la app» (otra parte: ia.app.estado).
// → { estado: 'apagada'|'trabajando'|'sin_saldo'|'pausada'|'terminada'|'esperando', fases: [{ id, estado: 'hecha'|'ahora'|'falta'|'pronto', pct, actual }], … }
const FASES = Object.freeze(['leer', 'explicar', 'dibujos', 'revision', 'app']);
let memoFases = null;
export function fasesTodo(db, config, { ahora = Date.now(), memoMs = 0 } = {}) {
  if (memoMs && memoFases && memoFases.db === db && ahora - memoFases.en < memoMs && memoFases.ahora <= ahora) return memoFases.valor;
  const cfg = leerConfigFabrica(db);
  const { activa, ronda, etapas, topeMicro } = cfg.profunda;
  const props = propsDe(cfg);
  const { dir, fuenteOral, man } = fuentesDe(config);
  const plan = planProfundo(db, config, { man, fuenteOral, ronda });
  const elegibles = plan.filter(x => x.pendiente || HECHOS.has(x.estado) || x.estado === 'fuera');
  const total = Math.max(1, elegibles.length);
  const hechas = elegibles.filter(x => HECHOS.has(x.estado)).length;
  const actual = plan.find(x => x.pendiente && ['mejorando', 'verificando'].includes(x.rec.estado)) ?? null;
  let f1 = 0;
  let f2 = 0;
  let temaActual = null;
  if (actual) {
    const info = temasDe(db, dir, actual, man, fuenteOral, props);
    const temas = [...info.values()].filter(x => x.c);
    const n = Math.max(1, temas.length);
    f1 = temas.filter(x => hecho(x.leer('plan'))).length / n;
    f2 = temas.filter(x => x.pasos.filter(p => p.rol === 'escribir').every(p => hecho(x.leer(p.paso)))).length / n;
    temaActual = info.get(actual.rec.tema)?.t?.titulo ?? temas.find(x => x.pasos.some(p => !hecho(x.leer(p.paso))))?.t?.titulo ?? null;
  }
  const nombre = x => (x ? { id: x.id, nombre: x.nombre ?? null, oral: x.oral, num: x.num } : null);
  const paraRevisar = elegibles.filter(x => ['publicada', 'saltada'].includes(x.estado));
  const revisadas = paraRevisar.filter(x => x.rec.final?.estado === 'hecha').length;
  const enRevision = paraRevisar.find(x => x.rec.final && x.rec.final.estado !== 'hecha') ?? null;
  const etapaA = elegibles.some(x => x.pendiente && x.rec.estado !== 'fuera');
  const pct = x => Math.max(0, Math.min(100, Math.floor(x * 100)));
  const fases = [
    { id: 'leer', pct: pct((hechas + f1) / total) },
    { id: 'explicar', pct: pct((hechas + f2) / total) },
    { id: 'dibujos', pct: pct(hechas / total) },
    { id: 'revision', pct: etapas ? pct(paraRevisar.length ? revisadas / paraRevisar.length : 0) : 0 },
  ].map((f, i) => ({ ...f, estado: f.pct >= 100 && (i < 3 ? !etapaA : true) ? 'hecha' : (i < 3 ? etapaA && activa : !etapaA && activa && etapas) ? 'ahora' : 'falta',
    actual: i < 3 ? (actual ? { materia: nombre(actual), tema: temaActual } : null) : enRevision ? { materia: nombre(enRevision), tema: null } : null }));
  let app = null;
  try { app = JSON.parse(leerAjuste(db, AJUSTE_APP_ESTADO) ?? 'null'); } catch { app = null; }
  fases.push({ id: 'app', estado: ['hecha', 'ahora', 'falta'].includes(app?.estado) ? app.estado : 'pronto', pct: Number.isFinite(app?.pct) ? Math.max(0, Math.min(100, Math.floor(app.pct))) : 0, actual: typeof app?.actual === 'string' ? { texto: app.actual.slice(0, 200) } : null });
  const espera = leerJson(db, AJUSTE_ESPERA);
  const gasto = gastadoRonda(db, cfg, ronda);
  const r = resumenProfunda(db);
  const ultima = plan.filter(x => x.rec.en || x.rec.tema).sort((a, b) => String(b.rec.en ?? '').localeCompare(String(a.rec.en ?? '')))[0] ?? null;
  const estado = !activa ? (r.empezo ? 'pausada' : 'apagada')
    : etapas && r.terminada && !etapaA && !enRevision ? 'terminada'
      : espera && SIN_SALDO.has(espera.motivo) ? 'sin_saldo' : actual || enRevision ? 'trabajando' : 'esperando';
  const valor = {
    estado, ronda, etapas: etapas === true, modelo: cfg.profunda.modelo, topeMicro, gastoMicro: gasto, quedanMicro: Math.max(0, topeMicro - gasto), espera,
    hasta: actual ? { materia: nombre(actual), tema: temaActual } : ultima ? { materia: nombre(ultima), tema: null } : null,
    fuera: plan.filter(x => x.rec.estado === 'fuera').map(nombre), conteo: r.conteo, fases,
  };
  memoFases = { db, en: ahora, ahora, valor };
  return valor;
}
export { FASES };
