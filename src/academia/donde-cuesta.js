// Academia 0.14.59 (pedido del dueño: «las clases las puede mejorar la IA, y más las usan, mejor la clase, y el sistema
// aprende de eso»): «Dónde más cuesta», por tema y por tarjeta; la mejora de la IA empieza por ahí; y la mejor
// «Explícamelo mejor» de una tarjeta pasa a la clase de todos como «Otra forma de verlo» (gratis).
//
// Lo que YA se medía antes de esta versión (y qué mide cada cosa):
//  - academia_respuestas: cada respuesta (correcta 0/1) de cada pregunta del Test Guide. Aprendizaje y la «Mejora
//    continua» (fabrica-mejora.js) la usan por pregunta (fallo ≥ 50 % de 5 alumnos o más).
//  - fabrica.evidencia.t.<hash>: los alumnos distintos que pidieron «Explícamelo mejor» en una tarjeta (solo «mejor»,
//    nunca «Profundizar»), con «consumida» para no repetir la mejora. No se toca aquí.
//  - academia.explicado.<alumno>: cada «Explícamelo de otra forma» de una PREGUNTA (no de una tarjeta); Aprendizaje mira
//    si acertó la siguiente vez («acertó después»).
//  - academia.tutor.senales.<alumno>: cuántas veces pidió «mejor» / «Profundizar» EN TOTAL y el tiempo PROMEDIO por
//    tarjeta (msTarjeta). No dice en qué tarjeta: el tiempo por tarjeta NO se mide, así que no entra en la cuenta.
//  - academia.tutor.evento.<alumno>.<ms>: lo que hizo el tutor (con la tarjeta), solo cuando la IA respondió.
//  - academia.ia_saber.servidas.<mes>: cuántas veces sirvió lo guardado (sin decir de qué tarjeta).
//
// Lo nuevo (una fila de «ajustes» por tarjeta; sin migración):
//  - academia.cuesta.t.<id>: por tarjeta (id = hash de materia|tema|título), quién pidió ayuda en ELLA («mejor» o
//    «Profundizar») y cuándo, y quién vio cuál «Explícamelo mejor» guardado y cuándo. Solo el id interno del alumno
//    (para contar distintos), nunca un nombre; hasta TOPE_ALUMNOS. Va con la huella del texto de la tarjeta: si la clase
//    cambia, la cuenta empieza otra vez (lo de antes queda resumido en «previo»).
//  - academia.cuesta.foto: la última cuenta (la hace el trabajador cada hora, en sistema.vigilar), con solo números.
//  - academia.clase.otra.<id>: la «Otra forma de verlo» de una tarjeta: un PUNTERO a lo guardado (su clave), la huella
//    del texto de la tarjeta y su idioma; nunca una copia ni nada de un alumno. Se lee con leerGuardado (lo que el
//    administrador «oculta» deja de salir) y solo si la huella sigue igual (si la clase cambió, no sale; nada se borra).
//
// El puntaje (0–100, más = cuesta más) junta lo que tenga datos suficientes (MUESTRA):
//   fallo   = % de respuestas malas de sus preguntas (≥ 10 respuestas de ≥ 3 alumnos)              peso 0,5
//   pide    = % de alumnos del tema que pidieron ayuda en ella (≥ 5 alumnos)                       peso 0,3
//   despues = % que FALLÓ la siguiente vez después de pedir ayuda o una reexplicación (≥ 5 casos)  peso 0,2
// Sin ninguna parte con datos suficientes: null (no entra en la lista). Con 1 o 2 respuestas nunca se dice nada.
// Todo con agregados de SQL (los índices de la migración 13) y lecturas por clave: nada carga todas las respuestas.
import { createHash } from 'node:crypto';
import { analisisPaquete } from './tutor.js';
import { leerGuardado } from './instructor-ia.js';
import { leerCambios } from './cambios-ia.js';

export const MUESTRA = Object.freeze({ respuestas: 10, alumnos: 3, pide: 5, despues: 5 });
export const PESOS = Object.freeze({ fallo: 0.5, pide: 0.3, despues: 0.2 });
// Pasa a la clase si los que la vieron aciertan después al menos «ventaja» puntos más que los que no la vieron.
export const PROMOVER = Object.freeze({ vieron: 5, respuestasVieron: 10, sinAlumnos: 3, respuestasSin: 10, ventaja: 10 });
export const TOPE_ALUMNOS = 300;
export const FOTO_CADA_MS = 3_600_000;
const CLAVES_MAX = 8;
const EXPLICADOS_MAX = 100; // por alumno, los últimos
export const CLAVE_FOTO = 'academia.cuesta.foto';
const PRE_USO = 'academia.cuesta.t.';
const PRE_PROMO = 'academia.clase.otra.';
const CLAVE_TARJETA = /^academia\.ia\.tarjeta\.[a-f0-9]{32}$/;

const sha = t => createHash('sha256').update(String(t)).digest('hex');
const iso = ms => new Date(ms).toISOString();
const json = t => { try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const leer = (db, clave) => json(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? 'null');
const guardar = (db, clave, valor, ahora) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), iso(ahora));
const pct = (a, b) => (b > 0 ? Math.round((a * 100) / b) : null);

export const idTarjeta = (materia, tema, titulo) => sha(`${materia}|${tema}|${titulo}`).slice(0, 24);
// La huella del texto de una tarjeta (lo que ve el alumno): si cambia, lo medido y lo promovido ya no valen.
export const huellaTarjeta = s => sha(JSON.stringify([s?.titulo ?? '', s?.texto ?? '', Array.isArray(s?.puntos) ? s.puntos : [], s?.recuerda ?? '', s?.ejemplo ?? ''])).slice(0, 16);
const temaDe = (p, materia, tema) => p?.materias?.find(m => m.id === materia)?.temas?.find(t => t.id === tema) ?? null;

// ---------- Lo que anota el servidor web al pedir ayuda en una tarjeta ----------
// tipo: 'mejor' | 'profundizar'. clave: la «Explícamelo mejor» guardada que se le mostró (o que se le está escribiendo).
export function anotarUsoTarjeta(db, { materia, tema, seccion, usuarioId, tipo = 'mejor', clave = null, idioma = 'es', ahora = Date.now() }) {
  if (typeof materia !== 'string' || typeof tema !== 'string' || !seccion || typeof seccion.titulo !== 'string' || !Number.isSafeInteger(usuarioId)) return null;
  const id = idTarjeta(materia, tema, seccion.titulo);
  const h = huellaTarjeta(seccion);
  let v = leer(db, PRE_USO + id);
  if (!v || v.h !== h) {
    const previo = v ? { h: v.h, alumnos: Object.keys(v.u ?? {}).length, hasta: iso(ahora) } : null;
    v = { materia, tema, titulo: seccion.titulo.slice(0, 200), h, u: {}, claves: [], ...(previo ? { previo } : {}) };
  }
  const k = String(usuarioId);
  if (!v.u[k] && Object.keys(v.u).length >= TOPE_ALUMNOS) return v; // ya hay bastantes para medir
  const x = v.u[k] ?? { p: iso(ahora) };
  if (tipo === 'profundizar') x.f = 1; else x.m = 1;
  if (tipo === 'mejor' && typeof clave === 'string' && CLAVE_TARJETA.test(clave)) {
    let i = v.claves.findIndex(c => c.clave === clave);
    if (i < 0 && v.claves.length < CLAVES_MAX) { v.claves.push({ clave, idioma: idioma === 'en' ? 'en' : 'es' }); i = v.claves.length - 1; }
    if (i >= 0 && x.v == null) { x.v = iso(ahora); x.c = i; }
  }
  v.u[k] = x;
  guardar(db, PRE_USO + id, v, ahora);
  return v;
}

// ---------- El puntaje ----------
// partes: { fallo: { n, mal, alumnos }, pide: { pidieron, alumnos }, despues: { n, bien } } (cualquiera puede faltar).
export function puntaje(partes = {}) {
  const f = partes.fallo;
  const pd = partes.pide;
  const d = partes.despues;
  const fallo = f ? { pct: pct(f.mal, f.n), n: f.n, alumnos: f.alumnos, ok: f.n >= MUESTRA.respuestas && f.alumnos >= MUESTRA.alumnos } : null;
  const base = pd ? Math.max(pd.alumnos ?? 0, pd.pidieron ?? 0) : 0;
  const pide = pd ? { pct: pct(pd.pidieron, base), n: base, pidieron: pd.pidieron, ok: base >= MUESTRA.pide } : null;
  const despues = d ? { pct: d.n ? pct(d.n - d.bien, d.n) : null, n: d.n, ok: d.n >= MUESTRA.despues } : null;
  let suma = 0;
  let pesos = 0;
  for (const [k, x] of [['fallo', fallo], ['pide', pide], ['despues', despues]]) if (x?.ok && x.pct != null) { suma += PESOS[k] * x.pct; pesos += PESOS[k]; }
  return { puntaje: pesos ? Math.round(suma / pesos) : null, partes: { fallo, pide, despues } };
}
const muestraDe = x => (x.partes.fallo?.n ?? 0) + (x.partes.pide?.n ?? 0) + (x.partes.despues?.n ?? 0);
// El orden: el que más cuesta primero; empate: más datos; después por su nombre (siempre el mismo orden).
export const ordenCuesta = (a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1) || muestraDe(b) - muestraDe(a) || `${a.materia}/${a.tema}/${a.indice ?? ''}`.localeCompare(`${b.materia}/${b.tema}/${b.indice ?? ''}`);

// Las filas «academia.cuesta.t.*» que siguen valiendo (la tarjeta existe y su texto no cambió): Map(materia/tema/índice → { v, s }).
function usosVigentes(db, p) {
  const out = new Map();
  for (const f of db.prepare('SELECT valor FROM ajustes WHERE clave > ? AND clave < ?').all(PRE_USO, `${PRE_USO}~`)) {
    const v = json(f.valor);
    if (!v?.u) continue;
    const t = temaDe(p, v.materia, v.tema);
    const indice = (t?.secciones ?? []).findIndex(s => s.titulo === v.titulo);
    if (indice < 0 || huellaTarjeta(t.secciones[indice]) !== v.h) continue;
    out.set(`${v.materia}/${v.tema}/${indice}`, { v, s: t.secciones[indice], indice });
  }
  return out;
}

// La siguiente respuesta de un alumno a una pregunta después de un momento (índice usuario_id, pregunta). → 0/1 o null.
const siguiente = (db, u, pregunta, desde) => db.prepare('SELECT correcta FROM academia_respuestas WHERE usuario_id = ? AND pregunta = ? AND creada_en > ? ORDER BY creada_en, id LIMIT 1').get(u, pregunta, desde)?.correcta ?? null;

// ---------- La cuenta entera (solo lee) ----------
// → { en, temas: [...], tarjetas: [...] }, cada lista ordenada (lo que más cuesta primero), solo lo que tiene puntaje.
export function calcularCuesta(db, p, { ahora = Date.now() } = {}) {
  const a = analisisPaquete(p);
  const dePregunta = new Map();
  for (const at of a.temas.values()) for (const q of at.preguntas) dePregunta.set(q.id, { materia: at.materia, tema: at.tema, indice: q.tarjeta });
  // 1. El fallo de cada pregunta y los alumnos de cada tema (sin el administrador).
  const alumnosSql = "usuario_id IN (SELECT id FROM usuarios WHERE rol <> 'admin')";
  const porPregunta = new Map(db.prepare(`SELECT pregunta, COUNT(*) AS n, SUM(CASE WHEN correcta = 0 THEN 1 ELSE 0 END) AS mal, COUNT(DISTINCT usuario_id) AS alumnos
    FROM academia_respuestas WHERE ${alumnosSql} GROUP BY pregunta`).all().map(f => [f.pregunta, f]));
  const alumnosTema = new Map(db.prepare(`SELECT materia, tema, COUNT(DISTINCT usuario_id) AS n FROM academia_respuestas WHERE ${alumnosSql} GROUP BY materia, tema`).all().map(f => [`${f.materia}/${f.tema}`, f.n]));
  // 2. Quién pidió ayuda en cada tarjeta y si acertó la siguiente vez.
  const usos = usosVigentes(db, p);
  const despues = new Map(); // materia/tema/índice (y materia/tema) → { n, bien }
  const sumar = (k, c) => { if (c == null) return; const x = despues.get(k) ?? { n: 0, bien: 0 }; x.n += 1; x.bien += c; despues.set(k, x); };
  const pidieronTema = new Map();
  for (const [k, { v, indice }] of usos) {
    const [materia, tema] = k.split('/');
    const ids = a.temas.get(`${materia}/${tema}`)?.porTarjeta.get(indice) ?? [];
    const set = pidieronTema.get(`${materia}/${tema}`) ?? new Set();
    for (const [u, x] of Object.entries(v.u)) {
      if (!x.m && !x.f) continue;
      set.add(u);
      for (const q of ids) { const c = siguiente(db, Number(u), q, x.p); sumar(k, c); sumar(`${materia}/${tema}`, c); }
    }
    pidieronTema.set(`${materia}/${tema}`, set);
  }
  // 3. Lo de Aprendizaje: después de «Explícamelo de otra forma» de una pregunta, ¿acertó la siguiente vez?
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave > 'academia.explicado.' AND clave < 'academia.explicado/'").all()) {
    const u = Number(f.clave.slice('academia.explicado.'.length));
    let l = null;
    try { l = JSON.parse(f.valor); } catch { l = null; }
    if (!Number.isSafeInteger(u) || !Array.isArray(l)) continue;
    for (const e of l.slice(-EXPLICADOS_MAX)) {
      const d = dePregunta.get(e?.p);
      if (!d || typeof e.en !== 'string') continue;
      const c = siguiente(db, u, e.p, e.en);
      sumar(`${d.materia}/${d.tema}`, c);
      if (d.indice >= 0) sumar(`${d.materia}/${d.tema}/${d.indice}`, c);
    }
  }
  // 4. Las filas.
  const temas = [];
  const tarjetas = [];
  for (const at of a.temas.values()) {
    const kt = `${at.materia}/${at.tema}`;
    const t = temaDe(p, at.materia, at.tema);
    const alumnos = alumnosTema.get(kt) ?? 0;
    const fallo = ids => {
      const fs = ids.map(id => porPregunta.get(id)).filter(Boolean);
      return fs.length ? { n: fs.reduce((s, f) => s + f.n, 0), mal: fs.reduce((s, f) => s + f.mal, 0), alumnos: Math.max(...fs.map(f => f.alumnos)) } : null;
    };
    const pidieron = pidieronTema.get(kt)?.size ?? 0;
    const ft = fallo(at.preguntas.map(q => q.id));
    if (ft && alumnos) ft.alumnos = alumnos;
    const rt = puntaje({ fallo: ft, pide: pidieron ? { pidieron, alumnos } : null, despues: despues.get(kt) ?? null });
    if (rt.puntaje != null) temas.push({ materia: at.materia, tema: at.tema, titulo: at.titulo, numero: at.numero, ...rt });
    const indices = new Set([...at.porTarjeta.keys(), ...[...usos.values()].filter(x => x.v.materia === at.materia && x.v.tema === at.tema).map(x => x.indice)]);
    for (const i of indices) {
      const s = t?.secciones?.[i];
      if (!s) continue;
      const uso = usos.get(`${kt}/${i}`);
      const pid = uso ? Object.values(uso.v.u).filter(x => x.m || x.f).length : 0;
      const r = puntaje({ fallo: fallo(at.porTarjeta.get(i) ?? []), pide: pid ? { pidieron: pid, alumnos } : null, despues: despues.get(`${kt}/${i}`) ?? null });
      if (r.puntaje == null) continue;
      tarjetas.push({ materia: at.materia, tema: at.tema, temaTitulo: at.titulo, indice: i, titulo: String(s.titulo ?? ''), id: idTarjeta(at.materia, at.tema, s.titulo ?? ''), ...r });
    }
  }
  return { en: iso(ahora), temas: temas.sort(ordenCuesta), tarjetas: tarjetas.sort(ordenCuesta) };
}

// ---------- «Otra forma de verlo»: qué pasa a la clase ----------
// Pura (para las pruebas): vieron = [{ n, bien }] por alumno que la vio (sus respuestas DESPUÉS de verla), sin = lo mismo
// de los que nunca la vieron. → { sirve, vieron: { alumnos, n, pct }, sin: { alumnos, n, pct } }.
export function criterioPromover(vieron, sin) {
  const junta = l => { const c = l.filter(x => x.n > 0); const n = c.reduce((s, x) => s + x.n, 0); return { alumnos: c.length, n, bien: c.reduce((s, x) => s + x.bien, 0), pct: pct(c.reduce((s, x) => s + x.bien, 0), n) }; };
  const a = junta(vieron);
  const b = junta(sin);
  const muestra = a.alumnos >= PROMOVER.vieron && a.n >= PROMOVER.respuestasVieron && b.alumnos >= PROMOVER.sinAlumnos && b.n >= PROMOVER.respuestasSin;
  return { sirve: muestra && a.pct - b.pct >= PROMOVER.ventaja, muestra, vieron: a, sin: b };
}

// Las decisiones (solo lee): [{ id, clave, valor }] para guardar. Una tarjeta ya promovida con la MISMA huella no se
// vuelve a medir (desde entonces la ven todos). Las tarjetas del oral no tienen preguntas del Test Guide: nunca.
export function decidirPromociones(db, p, { ahora = Date.now() } = {}) {
  const a = analisisPaquete(p);
  const out = [];
  for (const [k, { v, indice }] of usosVigentes(db, p)) {
    const [materia, tema] = k.split('/');
    const ids = a.temas.get(`${materia}/${tema}`)?.porTarjeta.get(indice) ?? [];
    if (!ids.length || !v.claves?.length) continue;
    const id = idTarjeta(materia, tema, v.titulo);
    const ya = leer(db, PRE_PROMO + id);
    if (ya?.h === v.h) continue;
    const vistos = Object.entries(v.u).filter(([, x]) => typeof x.v === 'string' && Number.isInteger(x.c));
    if (vistos.length < PROMOVER.vieron) continue;
    const marcas = ids.map(() => '?').join(', ');
    const vieron = vistos.map(([u, x]) => db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien FROM academia_respuestas WHERE usuario_id = ? AND pregunta IN (${marcas}) AND creada_en > ?`).get(Number(u), ...ids, x.v));
    const quienes = new Set(vistos.map(([u]) => Number(u)));
    const sin = db.prepare(`SELECT usuario_id AS u, COUNT(*) AS n, SUM(correcta) AS bien FROM academia_respuestas WHERE pregunta IN (${marcas})
      AND usuario_id IN (SELECT id FROM usuarios WHERE rol <> 'admin') GROUP BY usuario_id`).all(...ids).filter(f => !quienes.has(f.u));
    // Cada explicación guardada se mide SOLA: sus alumnos que la vieron contra los que no vieron ninguna. Pasa la que
    // cumple con su propia muestra y tiene más ventaja (empate: más alumnos; después, la primera que se vio).
    const buenas = v.claves.map((x, i) => {
      if (!CLAVE_TARJETA.test(x.clave) || !leerGuardado(db, x.clave)) return null;
      const c = criterioPromover(vistos.map(([, y], j) => (y.c === i ? vieron[j] : null)).filter(Boolean), sin);
      return c.sirve ? { x, i, c } : null;
    }).filter(Boolean).sort((a, b) => (b.c.vieron.pct - b.c.sin.pct) - (a.c.vieron.pct - a.c.sin.pct) || b.c.vieron.alumnos - a.c.vieron.alumnos || a.i - b.i);
    if (!buenas.length) continue;
    const { x: elegida, c } = buenas[0];
    out.push({ id, valor: {
      materia, tema, titulo: v.titulo, h: v.h, clave: elegida.clave, idioma: elegida.idioma === 'en' ? 'en' : 'es', en: iso(ahora),
      medida: { vieron: { alumnos: c.vieron.alumnos, n: c.vieron.n, pct: c.vieron.pct }, sin: { alumnos: c.sin.alumnos, n: c.sin.n, pct: c.sin.pct } },
      ...(ya ? { previa: { h: ya.h, clave: ya.clave, en: ya.en } } : {}),
    } });
  }
  return out;
}

// Lo que ve el alumno en la tarjeta (por índice), o null. Gratis: solo lee (ni la IA, ni minutos, ni topes).
export function otraFormaDe(db, s, { materia, tema, idioma = 'es' }) {
  if (!s || typeof s.titulo !== 'string') return null;
  const v = leer(db, PRE_PROMO + idTarjeta(materia, tema, s.titulo));
  if (!v || v.h !== huellaTarjeta(s) || typeof v.clave !== 'string' || !CLAVE_TARJETA.test(v.clave)) return null;
  // Nunca uno en inglés a quien estudia en español.
  if (v.idioma === 'en' && idioma !== 'en') return null;
  const g = leerGuardado(db, v.clave);
  if (!g || typeof g.explicacion !== 'string' || !g.explicacion.trim()) return null;
  const texto = x => (typeof x === 'string' && x.trim() ? x : null);
  return { explicacion: g.explicacion, ejemplo: texto(g.ejemplo), recuerda: texto(g.recuerda) };
}
// La lección con «Otra forma de verlo» en las tarjetas que la tienen (sin tocar lo demás).
export function conOtraForma(db, p, leccion, idioma = 'es') {
  const t = temaDe(p, leccion?.materia, leccion?.tema);
  if (!t || !Array.isArray(leccion.secciones)) return leccion;
  const secciones = leccion.secciones.map((x, i) => {
    const o = otraFormaDe(db, t.secciones?.[i], { materia: leccion.materia, tema: leccion.tema, idioma });
    return o ? { ...x, otraForma: o } : x;
  });
  return { ...leccion, secciones };
}

// ---------- La foto (cada hora, en el trabajador) ----------
// calcular (solo lee) y guardar (una escritura corta). Nunca llama a la IA.
export function calcularTodo(db, p, ahora = Date.now()) {
  const c = calcularCuesta(db, p, { ahora });
  return { foto: { en: c.en, temas: c.temas.slice(0, 30), tarjetas: c.tarjetas.slice(0, 60) }, promociones: decidirPromociones(db, p, { ahora }) };
}
export function guardarTodo(db, { foto, promociones }, ahora = Date.now()) {
  for (const x of promociones) guardar(db, PRE_PROMO + x.id, x.valor, ahora);
  guardar(db, CLAVE_FOTO, foto, ahora);
}
export function leerFoto(db) { return leer(db, CLAVE_FOTO); }
// La foto si es de la última hora y media; si no, null (quien la usa calcula otra).
export function fotoVigente(db, ahora = Date.now()) {
  const f = leerFoto(db);
  return f?.en && ahora - Date.parse(f.en) < FOTO_CADA_MS * 1.5 ? f : null;
}

// ---------- Para la mejora de la IA: el orden ----------
// foto → { tarjeta: Map(materia/tema/título → puntaje), tema: Map(materia/tema → puntaje) }.
export function prioridades(foto) {
  return {
    tarjeta: new Map((foto?.tarjetas ?? []).map(x => [`${x.materia}/${x.tema}/${x.titulo}`, x.puntaje])),
    tema: new Map((foto?.temas ?? []).map(x => [`${x.materia}/${x.tema}`, x.puntaje])),
  };
}
// La evidencia de la mejora continua, reordenada: primero lo que más cuesta (la tarjeta; si no, su tema), después el
// orden de antes (estable). No agrega ni quita nada: solo el orden.
export function ordenarPorCuesta(items, prio) {
  const valor = x => {
    const t = x.titulo != null ? prio.tarjeta.get(`${x.materia}/${x.tema}/${x.titulo}`) : undefined;
    return t ?? prio.tema.get(`${x.materia}/${x.tema}`) ?? -1;
  };
  return items.map((x, i) => ({ x, i, v: valor(x) })).sort((a, b) => b.v - a.v || a.i - b.i).map(({ x, v }) => (v >= 0 ? { ...x, cuesta: v } : x));
}

// ---------- Para el administrador: «Dónde más les cuesta» (los 10 primeros) ----------
// Tarjetas primero; un tema sale solo si ninguna de sus tarjetas tiene puntaje. Con lo que hizo la IA (lo último del
// registro «Lo que hizo la IA» para esa tarjeta o ese tema) y lo que pasó a la clase. Solo números y títulos.
export function listaAdmin(db, p, foto, { limite = 10 } = {}) {
  const cambios = leerCambios(db);
  const hizo = (materia, tema, titulo = null) => {
    const c = [...cambios].reverse().find(x => x.materia === materia && x.tema === tema && (titulo == null || x.que === 'clase_reescrita' || x.antes?.que === titulo));
    return c ? { que: c.que, estado: c.estado ?? null, en: c.en } : null;
  };
  const conTarjetas = new Set((foto?.tarjetas ?? []).map(x => `${x.materia}/${x.tema}`));
  const filas = [
    ...(foto?.tarjetas ?? []).map(x => ({ ...x, tipo: 'tarjeta' })),
    ...(foto?.temas ?? []).filter(x => !conTarjetas.has(`${x.materia}/${x.tema}`)).map(x => ({ ...x, tipo: 'tema' })),
  ].sort(ordenCuesta).slice(0, limite);
  return filas.map(x => {
    const t = temaDe(p, x.materia, x.tema);
    const s = x.tipo === 'tarjeta' ? t?.secciones?.[x.indice] : null;
    const promo = s ? leer(db, PRE_PROMO + idTarjeta(x.materia, x.tema, s.titulo)) : null;
    const vigente = Boolean(promo && promo.h === huellaTarjeta(s));
    return {
      tipo: x.tipo, materia: x.materia, tema: x.tema, temaTitulo: x.temaTitulo ?? x.titulo, titulo: x.titulo, indice: x.indice ?? null, puntaje: x.puntaje,
      fallo: x.partes.fallo?.ok ? { pct: x.partes.fallo.pct, n: x.partes.fallo.n } : null,
      pide: x.partes.pide?.ok ? { pct: x.partes.pide.pct, n: x.partes.pide.n } : null,
      despues: x.partes.despues?.ok ? { pct: x.partes.despues.pct, n: x.partes.despues.n } : null,
      hizo: hizo(x.materia, x.tema, x.tipo === 'tarjeta' ? x.titulo : null),
      promovida: vigente ? { clave: promo.clave, oculta: !leerGuardado(db, promo.clave), en: promo.en, vieron: promo.medida?.vieron?.pct ?? null, sin: promo.medida?.sin?.pct ?? null } : null,
    };
  });
}
