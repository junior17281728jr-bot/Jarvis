// Academia 0.14.29 (pedido del dueño): la «Práctica en vivo» del examen oral — como el checkride de verdad: el examinador
// hace UNA pregunta del libro a la vez (en español si está traducida; se puede leer en voz alta), el alumno responde
// hablando o escribiendo, y al momento solo oye un veredicto cortito («Bien / Casi / Mal»). Todo lo demás (qué dijo bien,
// qué le faltó, la respuesta del libro, «Aprobado / No aprobado», qué reforzar y si está listo para el examen real) va en
// el repaso del FINAL, como en el examen final.
//  - Las preguntas salen de libro_qa de los temas orales (las que traen su respuesta del libro). La respuesta del libro
//    NUNCA viaja antes del repaso final (ni en la práctica ni en los veredictos).
//  - Con IA (la del instructor, con sus usos y topes de siempre; «IA en pausa» = sin IA): cada respuesta la califica la IA
//    (src/academia/oral-vivo-ia.js). Sin IA (o si una calificación no llegó): en el repaso final se ve la respuesta del
//    libro y el alumno se califica solo (Bien / Casi / Mal).
//  - Nota: bien = 1, casi = ½, mal o sin responder = 0; aprueba con la nota de aprobar de la academia (umbral).
//  - Se guarda APARTE (ajuste «academia.oral.vivo.<id>»: la práctica abierta y el historial de las últimas, con lo de
//    cada tema): no toca los exámenes del oral, ni «Listo para el oral», ni las respuestas de práctica. El historial sirve
//    para comparar con las veces anteriores (compararTemas) y lo ve el administrador en la ficha del alumno.
//  - Nunca se borra lo que hizo: el historial guarda las últimas 100 (lo anterior se queda en «veces» y «mejor») y una
//    práctica que dejó a medias pasa a «sinTerminar» (las últimas 20) al empezar otra.
import { randomBytes, createHash } from 'node:crypto';
import { ErrorHttp } from '../nucleo/http.js';
import { MATERIAS_ORAL } from './formato.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { ajustesAcademia } from './progreso.js';
import { hayOral } from './oral.js';
import { VEREDICTOS } from './oral-vivo-ia.js';
import { ejemplosDe, normalizar, buscarParecida, clavesAprendidas, numerosContra, repetible } from './oral-aprende.js';

// porDefecto 7: con las llamadas por hora de siempre (30 → 10 por cuenta), 7 preguntas + hasta 2 repreguntas + el cierre
// caben en una hora; más preguntas también se pueden (las que no quepan, se califica él al final).
export const VIVO = Object.freeze({ porDefecto: 7, repreguntas: 2, minimo: 3, maximo: 15, historial: 100, sinTerminar: 20, entradaMax: 14_000,
  // 0.14.93: lo que se deja para el texto (la respuesta de hasta 1200 letras y, en una repregunta, ella, sus puntos y el alcance).
  margenTexto: 3_000 });
export const PUNTOS = Object.freeze({ bien: 1, casi: 0.5, mal: 0 });
const clave = id => `academia.oral.vivo.${Number(id)}`;
const esObjeto = v => v != null && typeof v === 'object' && !Array.isArray(v);
const huella = t => createHash('sha256').update(String(t ?? '')).digest('hex').slice(0, 16);
const pct = (a, b) => (b > 0 ? Math.floor((a * 100) / b) : 0);

export function leerVivo(db, usuarioId) {
  let v = null;
  try { v = JSON.parse(leerAjuste(db, clave(usuarioId)) ?? 'null'); } catch { v = null; }
  v = esObjeto(v) ? v : {};
  return {
    abierta: esObjeto(v.abierta) ? v.abierta : null,
    historial: Array.isArray(v.historial) ? v.historial.filter(esObjeto).slice(-VIVO.historial) : [],
    sinTerminar: Array.isArray(v.sinTerminar) ? v.sinTerminar.filter(esObjeto).slice(-VIVO.sinTerminar) : [],
    veces: Number(v.veces) || 0, mejor: Number.isFinite(Number(v.mejor)) ? Number(v.mejor) : null, aprobado: v.aprobado === true,
  };
}
const guardarVivo = (db, usuarioId, v) => guardarAjuste(db, clave(usuarioId), JSON.stringify(v));

// Las preguntas del libro de un tema que sirven (con su respuesta del libro).
const qaDe = t => (t.libro_qa ?? []).map((x, i) => ({ x, i })).filter(({ x }) => typeof x.pregunta_en === 'string' && typeof x.respuesta_en === 'string' && x.respuesta_en.trim());
const materiasVivo = paquete => (paquete?.oral?.materias ?? []).filter(m => m.temas.some(t => qaDe(t).length));
function itemDe(paquete, it) {
  const m = paquete.oral.materias.find(x => x.id === it.m);
  const t = m?.temas.find(x => x.id === it.t);
  const x = t?.libro_qa?.[it.i];
  if (!x || huella(x.pregunta_en) !== it.h) return null; // el contenido cambió: esa pregunta ya no está
  return { m, t, x };
}
// 0.14.116: la pregunta del libro de una tarjeta del Repaso final, como la de una práctica en vivo ({ m, t, i, h }): así
// «Responder con mis palabras» se califica con lo mismo (materialCalificar). null si no tiene respuesta del libro.
export function itemDeTarjeta(paquete, materia, tema, i) {
  const t = paquete?.oral?.materias?.find(x => x.id === materia)?.temas.find(x => x.id === tema);
  const x = t?.libro_qa?.[i];
  if (!x || !qaDe(t).some(y => y.i === i)) return null;
  return { m: materia, t: tema, i, h: huella(x.pregunta_en) };
}
// Lo que se ve al preguntar: SOLO la pregunta (nunca su respuesta, su explicación ni sus puntos clave).
const vistaPregunta = (paquete, it, i) => {
  const d = itemDe(paquete, it);
  return d ? { i, materia: it.m, tema: it.t, temaTitulo: d.t.titulo, pregunta_es: d.x.pregunta_es ?? null, pregunta_en: d.x.pregunta_en } : { i, materia: it.m, tema: it.t, temaTitulo: it.t, pregunta_es: null, pregunta_en: null, fuera: true };
};

// Lo de la portada: los capítulos con preguntas, cuántas por defecto, la nota para aprobar y cómo le fue antes.
export function portadaVivo(db, usuarioId, paquete) {
  if (!hayOral(paquete)) return { hay: false };
  const yo = leerVivo(db, usuarioId);
  const materias = materiasVivo(paquete).map(m => ({ id: m.id, numero: MATERIAS_ORAL.indexOf(m.id) + 1, preguntas: m.temas.reduce((n, t) => n + qaDe(t).length, 0) }));
  const total = materias.reduce((n, m) => n + m.preguntas, 0);
  const ultima = yo.historial.at(-1) ?? null;
  return {
    hay: total > 0, materias, total, n: Math.min(VIVO.porDefecto, total), maximo: Math.min(VIVO.maximo, total), umbral: ajustesAcademia(db).umbral,
    antes: yo.veces ? { veces: yo.veces, mejor: yo.mejor, aprobado: yo.aprobado, ultima: ultima ? { pct: ultima.pct, aprobado: ultima.aprobado, listo: ultima.listo === true, en: ultima.en } : null } : null,
    abierta: yo.abierta && !yo.abierta.cerrada ? { sesion: yo.abierta.id, total: yo.abierta.items.length, respondidas: Object.keys(yo.abierta.resp ?? {}).length, terminada: yo.abierta.terminada === true } : null,
  };
}

// Una práctica nueva: N preguntas de un capítulo o de todos (repartidas entre capítulos), en orden de capítulo (así el
// sistema de calificar, que es el del capítulo, se repite seguido y la caché del proveedor sirve).
export function crearVivo(db, usuarioId, paquete, { materia = null, n = VIVO.porDefecto } = {}, { azar = Math.random, ahoraMs = Date.now() } = {}) {
  if (!hayOral(paquete)) throw new ErrorHttp(409, 'sin_paquete');
  const cuantas = Math.max(VIVO.minimo, Math.min(VIVO.maximo, Number.isSafeInteger(n) ? n : VIVO.porDefecto));
  let materias = materiasVivo(paquete);
  if (materia != null) {
    if (!MATERIAS_ORAL.includes(materia)) throw new ErrorHttp(404, 'no_existe');
    materias = materias.filter(m => m.id === materia);
  }
  // Primero los temas que la última vez salieron flojos (para comparar), después los que nunca salieron, después los demás;
  // mezclados dentro de cada grupo.
  const yo0 = leerVivo(db, usuarioId);
  const { umbral } = ajustesAcademia(db);
  const ultimaDe = id => [...yo0.historial].reverse().find(h => esObjeto(h?.temas?.[id]))?.temas[id] ?? null;
  const grupo = id => { const u = ultimaDe(id); return !u ? 1 : (Number(u.pct) || 0) < umbral ? 0 : 2; };
  const mezclar = l => l.map(x => ({ x, g: grupo(`${x.m}/${x.t}`), r: azar() })).sort((a, b) => a.g - b.g || a.r - b.r).map(x => x.x);
  const listas = materias.map(m => mezclar(m.temas.flatMap(t => qaDe(t).map(({ x, i }) => ({ m: m.id, t: t.id, i, h: huella(x.pregunta_en) })))));
  const elegidas = [];
  for (let vuelta = 0; elegidas.length < cuantas && listas.some(l => l.length > vuelta); vuelta++) for (const l of listas) if (l[vuelta] && elegidas.length < cuantas) elegidas.push(l[vuelta]);
  if (!elegidas.length) throw new ErrorHttp(409, 'sin_preguntas');
  elegidas.sort((a, b) => MATERIAS_ORAL.indexOf(a.m) - MATERIAS_ORAL.indexOf(b.m));
  const yo = leerVivo(db, usuarioId);
  const abierta = { id: randomBytes(9).toString('base64url'), materia, items: elegidas, resp: {}, creada: new Date(ahoraMs).toISOString() };
  // Una que dejó a medias (con algo respondido) no se pierde: queda en «sinTerminar» (nunca cuenta en la nota).
  const dejada = yo.abierta && !yo.abierta.cerrada && Object.keys(yo.abierta.resp ?? {}).length ? [yo.abierta] : [];
  guardarVivo(db, usuarioId, { ...yo, abierta, sinTerminar: [...yo.sinTerminar, ...dejada].slice(-VIVO.sinTerminar) });
  return { sesion: abierta.id, materia, total: elegidas.length, preguntas: elegidas.map((it, i) => vistaPregunta(paquete, it, i)) };
}
export function abiertaDe(db, usuarioId, sesion) {
  const yo = leerVivo(db, usuarioId);
  if (!yo.abierta || typeof sesion !== 'string' || yo.abierta.id !== sesion) throw new ErrorHttp(404, 'no_existe');
  return yo;
}
export function vistaAbierta(db, usuarioId, paquete, sesion) {
  const yo = abiertaDe(db, usuarioId, sesion);
  const a = yo.abierta;
  if (a.cerrada) throw new ErrorHttp(409, 'ya_cerrada');
  return { sesion: a.id, materia: a.materia ?? null, total: a.items.length, preguntas: a.items.map((it, i) => vistaPregunta(paquete, it, i)), respondidas: Object.keys(a.resp ?? {}).map(Number), terminada: a.terminada === true };
}

// El pedido de calificar: el sistema del capítulo (reglas + sus preguntas del libro) si cabe; si no, el del tema; si no,
// solo esa pregunta. Igual para todos los alumnos (la caché del proveedor).
export function materialCalificar(paquete, it, armar) {
  const d = itemDe(paquete, it);
  if (!d) throw new ErrorHttp(409, 'pregunta_cambio');
  const fila = (t, x, i) => ({ n: `${t.id}#${i + 1}`, pregunta_en: x.pregunta_en, respuesta_en: x.respuesta_en, pregunta_es: x.pregunta_es ?? null, respuesta_es: x.respuesta_es ?? null });
  const n = `${d.t.id}#${it.i + 1}`;
  const opciones = [
    d.m.temas.flatMap(t => qaDe(t).map(({ x, i }) => fila(t, x, i))),
    qaDe(d.t).map(({ x, i }) => fila(d.t, x, i)),
    [fila(d.t, d.x, it.i)],
  ];
  for (const qa of opciones) {
    const sistema = armar({ capitulo: d.m.id, qa });
    if (Buffer.byteLength(sistema) <= VIVO.entradaMax - VIVO.margenTexto) return { sistema, n, d };
  }
  return { sistema: armar({ capitulo: d.m.id, qa: opciones[2] }), n, d };
}

// Anota lo que dijo (el texto, nunca el audio). intento 1 = la pregunta; 2 = la repregunta (solo después de un «casi»).
export function anotarRespuesta(db, usuarioId, sesion, i, { texto, seguimiento = false, clave: claveIa = null, tarea = null }, ahoraMs = Date.now()) {
  const yo = abiertaDe(db, usuarioId, sesion);
  const a = yo.abierta;
  if (a.cerrada || a.terminada) throw new ErrorHttp(409, 'ya_cerrada');
  if (!Number.isSafeInteger(i) || i < 0 || i >= a.items.length) throw new ErrorHttp(404, 'no_existe');
  const r = { ...(a.resp?.[i] ?? {}) };
  if (seguimiento) {
    if (!r.primera || r.primera.veredicto !== 'casi' || !r.primera.repregunta || r.seguimiento) throw new ErrorHttp(409, 'sin_repregunta');
    r.seguimiento = { texto, clave: claveIa, tarea, en: new Date(ahoraMs).toISOString() };
  } else {
    if (r.primera) throw new ErrorHttp(409, 'ya_respondida');
    r.primera = { texto, clave: claveIa, tarea, en: new Date(ahoraMs).toISOString() };
  }
  guardarVivo(db, usuarioId, { ...yo, abierta: { ...a, resp: { ...a.resp, [i]: r } } });
  return r;
}
// Pone lo que calificó la IA (lo lee el servidor de lo guardado: nunca de la pantalla).
export function ponerCalificacion(db, usuarioId, sesion, i, seguimiento, g) {
  const yo = abiertaDe(db, usuarioId, sesion);
  const a = yo.abierta;
  const r = { ...(a.resp?.[i] ?? {}) };
  const parte = seguimiento ? 'seguimiento' : 'primera';
  if (!r[parte]) return r;
  r[parte] = g ? { ...r[parte], veredicto: g.veredicto, linea: g.linea, bienDicho: g.bienDicho, falto: g.falto, ...(seguimiento ? {} : { repregunta: g.repregunta || '', repreguntaPuntos: g.repregunta && Array.isArray(g.repreguntaPuntos) ? g.repreguntaPuntos.slice(0, 4) : [] }), ...(g.sistema === true ? { ia: false, sistema: true, ...(g.aprendido === true ? { aprendido: true } : {}) } : { ia: true }) }
    : { ...r[parte], sinIa: true };
  guardarVivo(db, usuarioId, { ...yo, abierta: { ...a, resp: { ...a.resp, [i]: r } } });
  return r;
}

// El veredicto de una pregunta: el de la IA (con la repregunta: si la contestó bien, «bien»), o el que se puso él.
export function veredictoDe(r) {
  if (!r?.primera) return null;
  if (VEREDICTOS.includes(r.auto)) return r.auto;
  const v = r.primera.veredicto;
  if (!VEREDICTOS.includes(v)) return null;
  if (v === 'casi' && r.seguimiento?.veredicto === 'bien') return 'bien';
  return v;
}

// ---------- El final ----------
// Por tema: bien / casi / mal y su nota.
export function porTema(items, veredictos, titulos = {}) {
  const m = new Map();
  items.forEach((it, i) => {
    const id = `${it.m}/${it.t}`;
    if (!m.has(id)) m.set(id, { id, materia: it.m, tema: it.t, titulo: titulos[id] ?? it.t, bien: 0, casi: 0, mal: 0, total: 0 });
    const x = m.get(id);
    x[veredictos[i] ?? 'mal'] += 1;
    x.total += 1;
  });
  return [...m.values()].map(x => ({ ...x, pct: pct((x.bien + x.casi * PUNTOS.casi) * 100, x.total * 100) }));
}
// La comparación con las prácticas anteriores, tema por tema (lo hace el código; la IA solo lo dice bonito).
// historial: [{ temas: { 'm/t': { pct } } }] (de la más vieja a la más nueva). Cada tema de hoy:
//  'nuevo' (nunca salió antes), 'mejoro' (antes flojo, hoy bien), 'sigue_flojo', 'nuevo_flojo' (antes bien, hoy flojo),
//  'sigue_bien'. Flojo = su nota < umbral. antes = la nota de ese tema la última vez que salió.
export function compararTemas(temas, historial, umbral) {
  return temas.map(x => {
    const previa = [...historial].reverse().find(h => esObjeto(h?.temas) && esObjeto(h.temas[x.id]));
    if (!previa) return { ...x, comparacion: 'nuevo', antes: null };
    const antes = Number(previa.temas[x.id].pct) || 0;
    const flojoAntes = antes < umbral;
    const flojoHoy = x.pct < umbral;
    return { ...x, antes, comparacion: flojoAntes ? (flojoHoy ? 'sigue_flojo' : 'mejoro') : flojoHoy ? 'nuevo_flojo' : 'sigue_bien' };
  });
}
// ¿Listo para el examen real? Aprobó, ningún tema flojo hoy, y nada «sigue flojo» de antes. → { listo, razon, temas }
export function listoExamenReal({ aprobado, temas }) {
  const flojos = temas.filter(x => x.flojo === true || x.comparacion === 'sigue_flojo');
  if (!aprobado) return { listo: false, razon: 'no_aprobo', temas: flojos.map(x => x.id) };
  if (flojos.length) return { listo: false, razon: flojos.some(x => x.comparacion === 'sigue_flojo') ? 'sigue_flojo' : 'temas_flojos', temas: flojos.map(x => x.id) };
  return { listo: true, razon: 'todo_bien', temas: [] };
}

// Cierra la práctica (o la deja esperando la autocalificación de las que no calificó la IA). auto: { i: 'bien'|'casi'|'mal' }.
// → { cerrada, pendientes: [i], revision, resumen? }. La revisión ya trae la respuesta del libro (es el repaso final).
export function cerrarVivo(db, usuarioId, paquete, sesion, { auto = {} } = {}, { ahoraMs = Date.now() } = {}) {
  const yo = abiertaDe(db, usuarioId, sesion);
  const a = yo.abierta;
  const umbral = ajustesAcademia(db).umbral;
  const resp = { ...(a.resp ?? {}) };
  // Lo que se calificó solo (solo donde la IA no calificó; nunca cambia un veredicto de la IA).
  if (!a.cerrada && esObjeto(auto)) {
    for (const [k, v] of Object.entries(auto)) {
      const i = Number(k);
      if (!Number.isSafeInteger(i) || !resp[i]?.primera || !VEREDICTOS.includes(v)) continue;
      if (VEREDICTOS.includes(resp[i].primera.veredicto)) continue;
      resp[i] = { ...resp[i], auto: v };
    }
  }
  const titulos = {};
  const revision = a.items.map((it, i) => {
    const d = itemDe(paquete, it);
    if (d) titulos[`${it.m}/${it.t}`] = d.t.titulo;
    const r = resp[i] ?? null;
    return {
      i, materia: it.m, tema: it.t, temaTitulo: d?.t.titulo ?? it.t, pregunta_es: d?.x.pregunta_es ?? null, pregunta_en: d?.x.pregunta_en ?? null,
      respuesta_es: d?.x.respuesta_es ?? null, respuesta_en: d?.x.respuesta_en ?? null, pagina: d?.x.pagina ?? null,
      dijo: r?.primera?.texto ?? null, repregunta: r?.primera?.repregunta || null, dijoSeguimiento: r?.seguimiento?.texto ?? null,
      veredicto: veredictoDe(r), ia: r?.primera?.ia === true, sistema: r?.primera?.sistema === true, ...(r?.primera?.aprendido === true ? { aprendido: true } : {}), linea: r?.primera?.linea ?? null, bienDicho: r?.primera?.bienDicho ?? null,
      falto: (r?.seguimiento?.veredicto === 'bien' ? '' : r?.seguimiento?.falto || r?.primera?.falto) || null,
      autoPendiente: Boolean(r?.primera) && !VEREDICTOS.includes(r?.primera?.veredicto) && !VEREDICTOS.includes(r?.auto),
      auto: VEREDICTOS.includes(r?.auto) ? r.auto : null,
      // Sin la IA: lo que sugiere la app (las palabras clave del libro que dijo); él decide.
      sugerida: r?.primera && r.primera.ia !== true && d ? sugerencia([r.primera.texto, r.seguimiento?.texto].filter(Boolean).join(' '), d.x) : null,
    };
  });
  const pendientes = revision.filter(x => x.autoPendiente).map(x => x.i);
  if (a.cerrada) return { cerrada: true, pendientes: [], revision, resumen: a.resumen ?? null };
  if (pendientes.length) {
    // Terminada: ya vio las respuestas del libro, así que no se puede responder ninguna más (las que faltan son «mal»).
    guardarVivo(db, usuarioId, { ...yo, abierta: { ...a, resp, terminada: true } });
    return { cerrada: false, pendientes, revision, umbral };
  }
  const veredictos = revision.map(x => x.veredicto ?? 'mal');
  const puntos = veredictos.reduce((n, v) => n + PUNTOS[v], 0);
  const nota = pct(puntos * 100, a.items.length * 100);
  const aprobado = a.items.length > 0 && puntos * 100 >= umbral * a.items.length;
  const temas = compararTemas(porTema(a.items, veredictos, titulos), yo.historial, umbral).map(x => ({ ...x, flojo: x.pct < umbral }));
  const listo = listoExamenReal({ aprobado, temas });
  const reforzar = temas.filter(x => x.flojo || x.casi > 0 || x.mal > 0).sort((x, y) => x.pct - y.pct).slice(0, 5).map(x => ({ materia: x.materia, tema: x.tema, titulo: x.titulo, pct: x.pct }));
  const resumen = {
    pct: nota, aprobado, umbral, total: a.items.length,
    bien: veredictos.filter(v => v === 'bien').length, casi: veredictos.filter(v => v === 'casi').length, mal: veredictos.filter(v => v === 'mal').length,
    temas: temas.map(({ id, materia, tema, titulo, bien, casi, mal, total, pct: p, comparacion, antes }) => ({ id, materia, tema, titulo, bien, casi, mal, total, pct: p, comparacion, antes })),
    reforzar, listo: listo.listo, listoRazon: listo.razon, antes: yo.veces ? { veces: yo.veces, mejor: yo.mejor, ultima: yo.historial.at(-1)?.pct ?? null } : null,
    en: new Date(ahoraMs).toISOString(),
  };
  const fila = { sesion: a.id, en: resumen.en, pct: nota, aprobado, listo: listo.listo, total: a.items.length, materia: a.materia ?? null, temas: Object.fromEntries(temas.map(x => [x.id, { pct: x.pct, bien: x.bien, casi: x.casi, mal: x.mal }])) };
  guardarVivo(db, usuarioId, {
    ...yo, abierta: { ...a, resp, cerrada: true, resumen },
    historial: [...yo.historial, fila].slice(-VIVO.historial), veces: yo.veces + 1, mejor: Math.max(yo.mejor ?? 0, nota), aprobado: yo.aprobado || aprobado,
  });
  return { cerrada: true, pendientes: [], revision, resumen };
}
// Pone el mensaje del cierre de la IA (lo que guardó el trabajador) en la práctica cerrada.
export function ponerCierre(db, usuarioId, sesion, datos) {
  const yo = abiertaDe(db, usuarioId, sesion);
  const a = yo.abierta;
  if (!a.cerrada || !a.resumen) return null;
  guardarVivo(db, usuarioId, { ...yo, abierta: { ...a, resumen: { ...a.resumen, cierre: datos } } });
  return datos;
}
// Lo que va al modelo para el cierre: solo cifras, títulos de temas y lo que le faltó (sin nombres). Los temas con
// letras (A, B, …) en lugar de ids.
export function datosCierre(resumen, revision) {
  const letras = new Map(resumen.temas.map((x, k) => [x.id, String.fromCharCode(65 + (k % 26))]));
  return {
    letras,
    resumen: {
      nota: resumen.pct, nota_para_aprobar: resumen.umbral, aprobado: resumen.aprobado, listo: resumen.listo, por_que_listo: resumen.listoRazon,
      veces_antes: resumen.antes?.veces ?? 0, nota_ultima_vez: resumen.antes?.ultima ?? null,
      temas: resumen.temas.map(x => ({
        id: letras.get(x.id), titulo: x.titulo, bien: x.bien, casi: x.casi, mal: x.mal, nota: x.pct, comparacion: x.comparacion, nota_antes: x.antes,
        falto: revision.filter(r => `${r.materia}/${r.tema}` === x.id && r.falto).map(r => r.falto).slice(0, 3),
      })),
    },
  };
}

// Para Progreso y la ficha del administrador: { id: 'vivo', mejor, ultima, aprobado, veces, en, listo } o null.
export function vivoDe(db, usuarioId) {
  const yo = leerVivo(db, usuarioId);
  if (!yo.veces) return null;
  const u = yo.historial.at(-1) ?? null;
  return { id: 'vivo', mejor: yo.mejor ?? 0, ultima: u ? Number(u.pct) || 0 : yo.mejor ?? 0, aprobado: yo.aprobado, veces: yo.veces, en: u?.en ?? null, listo: u?.listo === true };
}

// ---------- Sin IA: la sugerencia de la app (las palabras clave del libro que dijo) ----------
// Solo una SUGERENCIA para que el alumno se califique en el repaso final (él decide). Las palabras clave salen de los
// puntos clave del libro (si los trae) o de la respuesta del libro (en español y en inglés): palabras de 4+ letras que no
// son de relleno, y todos los números. → { veredicto, dijo: [palabras], faltan: [palabras] } o null.
const RELLENO = new Set(('para pero como cuando donde desde hasta sobre entre este esta estos estas that this with from have when what which your will must they them their there then than into been were also only more most such each very the and for are can may not you una unos unas los las del con por que sin muy mas tiene tienen debe deben puede pueden hace hacer cada todo toda todos todas otro otra antes despues siempre nunca solo').split(' '));
const plano = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palabras = t => plano(t).split(/[^a-z0-9ñ]+/).filter(w => w && (/^\d+$/.test(w) || (w.length >= 4 && !RELLENO.has(w))));
// 0.14.51: extra = las palabras (raíces) que el sistema aprendió de la IA para esa pregunta (src/academia/oral-aprende.js):
// si dijo alguna (que no sea ya del libro), cuenta como UNA palabra clave más dicha (nunca baja la nota: no se suman al
// total); en «dijo» va la palabra como la dijo él, y nunca van en «faltan». Sin extra, exactamente lo de antes.
// 0.14.93: las palabras de dirección (sube / baja), en español y en inglés (4+ letras: las que cuentan como palabras).
const DIRECCION = Object.freeze(Object.fromEntries([
  ...'sube suben subir subiendo subio aumenta aumentan aumentar asciende ascienden ascender incrementa incrementan rise rises rising rose increase increases increasing'.split(' ').map(w => [w, 'sube']),
  ...'baja bajan bajar bajando disminuye disminuyen disminuir desciende descienden descender caen caer cayendo drop drops dropping dropped fall falls falling fell decrease decreases decreasing'.split(' ').map(w => [w, 'baja']),
]));
// Una palabra cuenta si dijo la misma o una que empieza igual (5 letras: «oxígeno» / «oxigenación»).
// 0.14.93: una palabra de dirección («bajan», «sube», «drop», «rise») cuenta con cualquiera de la MISMA dirección
// («baja», «bajar», «disminuye»…). Decir además la otra dirección (el antes y el después, «baja antes del frente y sube
// después») nunca resta: solo se cuentan las palabras del libro que dijo.
function dijoPalabra(texto) {
  const dichas = new Set(palabras(texto));
  const dirDichas = new Set([...dichas].map(d => DIRECCION[d]).filter(Boolean));
  return w => dichas.has(w) || (DIRECCION[w] != null && dirDichas.has(DIRECCION[w])) || (w.length >= 6 && [...dichas].some(d => d.length >= 5 && (d.startsWith(w.slice(0, 5)) || w.startsWith(d.slice(0, 5)))));
}
// 0.14.93: la de una REPREGUNTA, por IDEAS (cada punto de lo que pide): una idea cuenta si dijo alguna de sus palabras
// clave; «faltan» son las ideas que no dijo, tal cual (nunca algo de fuera de la repregunta). Las palabras de la
// repregunta y de la pregunta misma («temperatura», «presión») no cuentan: repetir la pregunta no es responderla (si a
// una idea no le queda ninguna, se queda con las suyas). → como sugerencia.
export function sugerenciaIdeas(texto, ideas, deLaPregunta = '') {
  const repite = dijoPalabra(deLaPregunta);
  const lista = ideas.map(t => {
    const todas = [...new Set(palabras(t))];
    const propias = todas.filter(w => !(repite(w) && DIRECCION[w] == null));
    return { t: String(t).trim(), clave: propias.length ? propias : todas };
  }).filter(x => x.clave.length);
  if (!lista.length) return null;
  const esta = dijoPalabra(texto);
  const dichas = lista.filter(x => x.clave.some(esta));
  const parte = dichas.length / lista.length;
  return {
    veredicto: parte >= 0.5 ? 'bien' : parte >= 0.25 ? 'casi' : 'mal',
    dijo: [...new Set(dichas.flatMap(x => x.clave.filter(esta)))].slice(0, 8),
    faltan: lista.filter(x => !dichas.includes(x)).map(x => x.t.slice(0, 120)).slice(0, 4),
  };
}
export function sugerencia(texto, x, extra = []) {
  const fuente = Array.isArray(x?.puntos_clave) && x.puntos_clave.length ? x.puntos_clave.join(' ') : [x?.respuesta_es, x?.respuesta_en].filter(Boolean).join(' ');
  const clave = [...new Set(palabras(fuente))].slice(0, 30);
  if (!clave.length) return null;
  const esta = dijoPalabra(texto);
  const dijo = clave.filter(esta);
  let dichas2 = dijo.length;
  if (extra.length) {
    const delLibro = new Set(normalizar(clave.join(' ')));
    const nuevas = extra.filter(k => !delLibro.has(k));
    // Lo que dijo él, como lo dijo (la primera palabra suya con esa raíz).
    const suyas = new Map();
    for (const w of plano(texto).match(/\d+(?:[.,]\d+)*|[a-zñ]+/g) ?? []) {
      const k = normalizar(w)[0];
      if (k && !suyas.has(k)) suyas.set(k, w);
    }
    const suyasDichas = nuevas.filter(k => suyas.has(k)).map(k => suyas.get(k));
    if (suyasDichas.length) dichas2 += 1;
    dijo.push(...suyasDichas);
  }
  const parte = Math.min(1, dichas2 / clave.length);
  return { veredicto: parte >= 0.5 ? 'bien' : parte >= 0.25 ? 'casi' : 'mal', dijo: dijo.slice(0, 8), faltan: clave.filter(w => !esta(w)).slice(0, 8) };
}

// 0.14.43 (lo pidió el dueño: «¿y la explicación y el porqué?»): la explicación de UNA pregunta ya calificada (sin repregunta
// pendiente): lo que dijo bien, lo que le faltó y la respuesta del libro. → { bienDicho, falto, respuesta_es, respuesta_en, pagina } o null.
export function porqueDe(paquete, it, r) {
  const g = r?.seguimiento?.veredicto ? r.seguimiento : r?.primera;
  if (!g?.veredicto) return null;
  if (!r.seguimiento && g.veredicto === 'casi' && g.repregunta) return null; // todavía le toca la repregunta
  const d = paquete && it ? itemDe(paquete, it) : null;
  return { veredicto: g.veredicto, bienDicho: g.bienDicho || '', falto: g.falto || '', respuesta_es: d?.x.respuesta_es ?? null, respuesta_en: d?.x.respuesta_en ?? null, pagina: d?.x.pagina ?? null };
}

// 0.14.42 (lo pidió el dueño): sin IA, la app CALIFICA sola con las ideas clave del libro (ya no «califícate tú»).
// → { veredicto, linea, bienDicho, falto, repregunta: '', sistema: true } o null (si la pregunta ya no está).
// 0.14.51: con { db }, primero lo que aprendió de la IA en esa pregunta (src/academia/oral-aprende.js):
//  1. si la respuesta es casi igual a una que ya calificó la IA (misma parte: la primera o la de la repregunta, con
//     previo = lo que dijo en la primera), ese veredicto; el texto de la IA solo si dijo lo mismo (nunca lo de otro alumno);
//  2. si no, las palabras clave del libro MÁS las que la IA premió seguido;
//  3. y si dijo números que el libro no dice: «bien» baja a «casi», y sin ningún número del libro, «mal».
// Sin nada aprendido en esa pregunta (o sin db), exactamente lo de antes. → además aprendido: true si usó lo aprendido.
const lineaDe = (veredicto, dijo, faltan) => (veredicto === 'bien' ? `Mencionaste las ideas clave${dijo ? ` (${dijo})` : ''}.`
  : veredicto === 'casi' ? `Vas bien${dijo ? ` (${dijo})` : ''}, pero te faltó: ${faltan || 'un punto clave'}.`
    : `No mencionaste las ideas clave${faltan ? `: ${faltan}` : ''}.`);
// 0.14.93 (lo pidió el dueño: en la repregunta «¿Qué nubes… y qué le pasa a la temperatura y la presión?» le pidieron
// también la visibilidad y los vientos): una REPREGUNTA se califica solo contra lo que ella pide. Las ideas clave son:
//  - los puntos que dio la IA al hacerla (repregunta_puntos), si los hay;
//  - si no (una de antes, o la IA no los dio), los pedacitos del libro (puntos clave y respuesta, cortados en comas y
//    puntos) que nombran algo que la repregunta pregunta y la pregunta original no (las palabras de la pregunta misma,
//    como «tipo», «durante» o «paso», no cuentan);
//  - si no se encuentra ninguno, el libro entero (lo de antes).
// → la pregunta del libro con esas ideas clave como puntos_clave (lo demás igual).
const RELLENO_PREGUNTA = new Set(normalizar('tipo tipos clase forma forman formar pasa pasan pasar ocurre ocurren sucede suceden durante paso pasada cual cuales cuanto cuanta explica describe dime menciona what which type kind form forms happen happens during passage tell explain describe'));
export function focoRepregunta(x, { repregunta = '', puntos = [] } = {}) {
  const dados = (Array.isArray(puntos) ? puntos : []).filter(p => typeof p === 'string' && p.trim()).slice(0, 4);
  if (dados.length) return { ...x, puntos_clave: dados };
  if (!repregunta) return x;
  const original = new Set(normalizar([x.pregunta_es, x.pregunta_en].filter(Boolean).join(' ')));
  const dichaRep = normalizar(repregunta).filter(k => !RELLENO_PREGUNTA.has(k) && !k.startsWith('#') && k !== '~no');
  const pide = new Set(dichaRep.filter(k => !original.has(k)));
  if (!pide.size) return x;
  // De qué habla (las palabras que la repregunta toma de la pregunta original: «frente frío»): solo las líneas del libro
  // que más las nombran («Frente frío: …», no «Frente caliente: …»).
  const tema = new Set(dichaRep.filter(k => original.has(k)));
  const fuente = [...(Array.isArray(x.puntos_clave) ? x.puntos_clave : []), x.respuesta_es, x.respuesta_en].filter(t => typeof t === 'string');
  let lineas = [...new Set(fuente.flatMap(t => t.split(/\n+/)).map(t => t.trim()).filter(Boolean))];
  if (tema.size) {
    const cuantas = l => new Set(normalizar(l).filter(k => tema.has(k))).size;
    const mas = Math.max(...lineas.map(cuantas));
    if (mas > 0) lineas = lineas.filter(l => cuantas(l) === mas);
  }
  const nombra = t => { const ks = normalizar(t); return ks.some(k => pide.has(k)) || (pide.has(NUBE) && ks.some(k => NUBES.has(k))); };
  const elegidos = [...new Set(lineas.flatMap(l => l.split(/[,;.:()]+/)).map(t => t.trim()).filter(t => t.length >= 3))].filter(nombra);
  return elegidos.length ? { ...x, puntos_clave: elegidos.slice(0, 12) } : x;
}
// Los nombres de las nubes («¿qué nubes…?» → «cumulonimbos», «estratiformes»…).
const NUBE = normalizar('nubes')[0];
const NUBES = new Set(normalizar('cumulonimbos cumulonimbus cumulos cumulus estratos estratiformes stratus stratiform nimbostratus altostratus cirros cirrus towering'));
export function calificarSistema(paquete, it, texto, { db = null, seguimiento = false, previo = '', repregunta = '', puntos = [] } = {}) {
  const d0 = paquete && it ? itemDe(paquete, it) : null;
  if (!d0) return null;
  const enfocada = seguimiento ? focoRepregunta(d0.x, { repregunta, puntos }) : d0.x;
  const ideas = enfocada !== d0.x ? enfocada.puntos_clave : null;
  const d = { ...d0, x: enfocada };
  const ejemplos = db ? ejemplosDe(db, it) : [];
  // 0.14.52 (lo pidió el dueño: «enséñale al sistema»): los números del libro se revisan en TODAS las preguntas, aunque
  // la IA todavía no haya calificado ninguna («3 aterrizajes en 60 días» cuando el libro dice 90 ya no sale «bien»).
  // 0.14.93: los números se comparan con el libro entero (d0), las ideas clave con lo que pide la repregunta (d).
  const aprendido = calificarAprendido(d.x, texto, ejemplos, { seguimiento, previo, todo: d0.x, ideas, deLaPregunta: preguntaDe(d0.x, repregunta) });
  if (aprendido) return aprendido;
  const s = ideas ? sugerenciaIdeas(texto, ideas, preguntaDe(d0.x, repregunta)) : sugerencia(texto, d.x);
  if (!s) return null;
  const dijo = s.dijo.slice(0, 4).join(', ');
  const faltan = s.faltan.slice(0, 4).join(ideas ? '; ' : ', ');
  const linea = lineaDe(s.veredicto, dijo, faltan);
  return { veredicto: s.veredicto, linea: linea.slice(0, 140), bienDicho: dijo, falto: faltan, repregunta: '', sistema: true };
}
const LINEA_APRENDIDA = Object.freeze({
  bien: 'Eso es: una respuesta así ya la calificó bien la IA.',
  casi: 'Vas bien, pero falta algo: una respuesta así la IA la calificó como casi.',
  mal: 'No es lo que pide la pregunta: una respuesta así la IA la calificó mal.',
});
const preguntaDe = (x, repregunta) => [repregunta, x.pregunta_es, x.pregunta_en].filter(Boolean).join(' ');
function calificarAprendido(x, texto, ejemplos, { seguimiento, previo, todo = x, ideas = null, deLaPregunta = '' }) {
  const tokens = normalizar(texto);
  const parecida = buscarParecida(ejemplos, seguimiento ? normalizar([previo, texto].filter(Boolean).join(' ')) : tokens, seguimiento);
  const extra = clavesAprendidas(ejemplos, [x.pregunta_en, x.pregunta_es].filter(Boolean).join(' '));
  const s = ideas ? sugerenciaIdeas(texto, ideas, deLaPregunta) : sugerencia(texto, x, extra);
  if (!s && !parecida) return null;
  let veredicto = parecida?.veredicto ?? s.veredicto;
  const contra = numerosContra(tokens, [todo.pregunta_en, todo.pregunta_es, todo.respuesta_en, todo.respuesta_es, ...(Array.isArray(todo.puntos_clave) ? todo.puntos_clave : []), ...(x !== todo && Array.isArray(x.puntos_clave) ? x.puntos_clave : [])].filter(Boolean));
  // Con una parecida no: ya tiene los mismos números que vio la IA.
  if (contra && !parecida && veredicto !== 'mal') veredicto = contra.alguno ? (veredicto === 'bien' ? 'casi' : veredicto) : 'mal';
  const usoAprendido = Boolean(parecida) || extra.length > 0;
  if (!usoAprendido && !contra) return null; // nada aprendido que sirva aquí: lo de antes
  const dijo = (s?.dijo ?? []).slice(0, 4).join(', ');
  const faltan = (s?.faltan ?? []).slice(0, 4).join(ideas ? '; ' : ', ');
  // El texto de la IA tal cual, solo si dijo lo mismo y el veredicto no cambió por los números.
  if (parecida && veredicto === parecida.veredicto && repetible(parecida.ejemplo, seguimiento ? normalizar([previo, texto].filter(Boolean).join(' ')) : tokens, parecida.parecido)) {
    const e = parecida.ejemplo;
    // En una repregunta que no fue «bien», nada del texto viejo de la IA (pudo pedir lo de fuera de ella): las palabras de ahora.
    const nuevo = seguimiento && veredicto !== 'bien';
    return { veredicto, linea: (nuevo ? lineaDe(veredicto, dijo, faltan) : e.linea || lineaDe(veredicto, dijo, faltan)).slice(0, 140), bienDicho: nuevo ? dijo : e.bienDicho || dijo,
      // 0.14.93: en una repregunta, lo que falta sale de lo que ELLA pide (nunca un «te faltó» viejo de fuera de ella).
      falto: seguimiento ? (veredicto === 'bien' ? '' : faltan) : veredicto === 'bien' ? e.falto || '' : e.falto || faltan, repregunta: '', sistema: true, aprendido: true };
  }
  // Si el veredicto aprendido no es el de las palabras clave, una línea neutra (las palabras clave no son el porqué).
  if (parecida && veredicto !== s?.veredicto) {
    return { veredicto, linea: LINEA_APRENDIDA[veredicto], bienDicho: veredicto === 'mal' ? '' : dijo, falto: veredicto === 'bien' ? '' : faltan, repregunta: '', sistema: true, aprendido: true };
  }
  const numeros = contra && !parecida ? `Revisa los números: ${contra.otros.slice(0, 3).join(', ')} no es lo que dice el libro.` : '';
  const linea = numeros && veredicto !== s?.veredicto ? numeros : lineaDe(veredicto, dijo, faltan);
  return { veredicto, linea: linea.slice(0, 140), bienDicho: dijo, falto: [numeros, veredicto === 'bien' ? '' : faltan].filter(Boolean).join(' ').slice(0, 300), repregunta: '', sistema: true, ...(usoAprendido ? { aprendido: true } : {}) };
}

// 0.14.29: el texto que se lee en voz alta de una pregunta (el español si está; con «Inglés original», el inglés).
export function textoPreguntaVivo(paquete, it, idioma = 'es') {
  const d = itemDe(paquete, it);
  if (!d) return null;
  return idioma === 'en' || !d.x.pregunta_es ? d.x.pregunta_en : d.x.pregunta_es;
}
