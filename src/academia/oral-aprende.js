// 0.14.51 (pedido del dueño: «recuerda cada respuesta y así debe mejorar: por si la API se queda sin crédito, el sistema
// sepa responder o poner si está bien o mal»): lo que el sistema aprende de la IA en la «Práctica en vivo» del oral.
//  - Cada vez que la IA califica una respuesta (la primera o la de la repregunta), se guarda un EJEMPLO en
//    academia_oral_aprendido (migración 12): la pregunta (materia/tema#huella: la misma clave aunque cambie la edición),
//    la respuesta ya normalizada, el veredicto, lo que dijo bien, lo que faltó y la línea corta. SIN usuario.
//  - Como mucho APRENDE.porPregunta ejemplos por pregunta (los más nuevos); una respuesta igual a una ya guardada no ocupa
//    otro lugar (se actualiza y suma «veces»).
//  - Sin IA, calificarSistema (src/academia/oral-vivo.js) mira primero estos ejemplos: si la respuesta es casi igual a una
//    que ya calificó la IA, usa ese veredicto; si no, las palabras que la IA premió seguido se suman a las del libro.
//  - Poco trabajo: como mucho 200 filas cortas por pregunta, ya normalizadas (no se vuelve a procesar nada).
//  - 0.14.93 (lo pidió el dueño: la IA le dijo «no sube después» a una respuesta correcta y el sistema lo iba a copiar):
//    un ejemplo se puede RETIRAR (nunca se borra): al confirmar el administrador un reporte de una calificación del oral
//    («¿Tiene razón?» → «Sí, es un error»), todos los ejemplos de esa pregunta hasta ese momento; o uno por uno desde
//    «Lo que el sistema aprendió». Un ejemplo retirado ya no cuenta al calificar (ni su veredicto ni sus palabras), y
//    una respuesta igual que la IA califique después entra como ejemplo NUEVO. Se guarda en ajustes (sin migración):
//    «academia.oral.aprendido.retiro.<huella de la pregunta>» = { pregunta, hastaId, ids: { id: true|false }, historial }.
import { createHash } from 'node:crypto';
import { VEREDICTOS } from './oral-vivo-ia.js';

export const APRENDE = Object.freeze({
  porPregunta: 200, tokensMax: 80, textoMax: 300,
  // Parecida = Jaccard de las palabras ≥ umbral, con los MISMOS números y la misma negación. Con menos de minPalabras
  // palabras, tiene que ser exactamente igual.
  umbral: 0.8, minPalabras: 3,
  // Una palabra aprendida: en ≥ 60 % de las «bien» (con al menos 3 «bien») y en ≤ 20 % de las otras (casi / mal; al menos
  // una). Como mucho 10.
  minBien: 3, enBien: 0.6, enMal: 0.2, maxClaves: 10,
});
const ORDEN = { mal: 0, casi: 1, bien: 2 };

// ---------- Normalizar ----------
const plano = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Los números dichos con letras (el dictado da «tres» o «three»). «un/una/one» no: casi siempre son artículos; «once»
// tampoco (en inglés es «una vez»).
const NUMEROS = Object.freeze({
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, quince: 15,
  veinte: 20, veinticuatro: 24, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, noventa: 90, cien: 100, ciento: 100,
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, hundred: 100,
});
// La negación cambia todo («puede cobrar» ≠ «no puede cobrar»; «con instructor» ≠ «sin instructor»): siempre es un token, «~no».
const NEGACION = new Set(['no', 'not', 'sin', 'without', 'nunca', 'never', 'jamas', 'ni', 'nor', 'ningun', 'ninguno', 'ninguna', 'nadie', 'nada', 'none', 'nothing', 'cannot']);
const RELLENO = new Set(('para pero como cuando donde desde hasta sobre entre este esta estos estas that this with from have when what which your will must they them their there then than into been were also only more most such each very the and for are can may you una unos unas los las del con por que sin muy mas tiene tienen debe deben puede pueden hace hacer cada todo toda todos todas otro otra antes despues siempre solo '
  + 'mis sus tus nos les son hay fue era ser estar esto eso ese esa aqui alli asi creo pues bueno entonces tambien porque yo tu el ella ellos usted '
  + 'its our his her has had was but all any out about would could should shall does did just like well think').split(' '));
// Raíz corta («llevar / llevo / lleva» → «llev»; «landings / landed» → «land»; «aterrizajes» → «aterr»).
export function raiz(w) {
  let r = w;
  if (r.length > 4 && r.endsWith('es')) r = r.slice(0, -2);
  else if (r.length > 3 && r.endsWith('s')) r = r.slice(0, -1);
  const fin = r.match(/(iendo|ando|ado|ido|ing|ar|er|ir|ed|[aeiou])$/);
  if (fin && r.length - fin[0].length >= 4) r = r.slice(0, -fin[0].length);
  return r.slice(0, 5);
}
const numero = n => {
  let s = n;
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, ''); // 1.500 / 1,500 → 1500
  s = s.replace(',', '.');
  return `#${String(Number(s))}`;
};
// → los tokens (sin repetir, en orden): palabras como raíz, números como «#90», la negación como «~no».
export function normalizar(texto) {
  const t = plano(texto).replace(/n['’]t\b/g, ' not');
  const out = new Set();
  for (const w of t.match(/\d+(?:[.,]\d+)*|[a-zñ]+/g) ?? []) {
    if (out.size >= APRENDE.tokensMax) break;
    if (/^\d/.test(w)) out.add(numero(w));
    else if (NUMEROS[w] != null) out.add(`#${NUMEROS[w]}`);
    else if (NEGACION.has(w)) out.add('~no');
    else if (w.length >= 3 && !RELLENO.has(w)) out.add(raiz(w));
  }
  return [...out];
}
const esNumero = k => k.startsWith('#');
const palabrasDe = ts => ts.filter(k => !esNumero(k) && k !== '~no');
const numerosDe = ts => ts.filter(esNumero);
const mismos = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// ¿Qué tan parecidas? 0 si los números o la negación no son los mismos (en aviación, «90 días» ≠ «60 días»); con pocas
// palabras, 1 solo si son iguales. Si no, Jaccard de las palabras.
export function parecido(a, b) {
  if (!mismos(numerosDe(a), numerosDe(b)) || a.includes('~no') !== b.includes('~no')) return 0;
  const pa = palabrasDe(a);
  const pb = new Set(palabrasDe(b));
  if (!pa.length && !pb.size) return 1; // solo números (ya iguales)
  const comun = pa.filter(x => pb.has(x)).length;
  const s = comun / (pa.length + pb.size - comun);
  if ((pa.length < APRENDE.minPalabras || pb.size < APRENDE.minPalabras) && s < 1) return 0;
  return s;
}

// ---------- Guardar lo que calificó la IA ----------
export const claveDe = it => (it && it.m && it.t && it.h ? `${it.m}/${it.t}#${it.h}` : null);
const corto = t => String(t ?? '').trim().slice(0, APRENDE.textoMax);

// it: el ítem de la práctica ({ m, t, h }); texto: lo que dijo (con la repregunta: lo de la primera + lo de la repregunta);
// g: lo que calificó la IA. Nunca falla la calificación por esto (si algo sale mal, no aprende y ya).
export function aprenderDeIa(db, { it, edicion = null, texto, seguimiento = false, g }, ahoraMs = Date.now()) {
  try {
    const pregunta = claveDe(it);
    if (!pregunta || !g || g.sistema === true || !VEREDICTOS.includes(g.veredicto)) return false;
    const tokens = normalizar(texto);
    if (!tokens.length) return false;
    const ts = tokens.join(' ');
    const seg = seguimiento ? 1 : 0;
    const en = new Date(ahoraMs).toISOString();
    const fila = [String(edicion ?? '').slice(0, 200) || null, g.veredicto, corto(g.bienDicho), corto(g.falto), corto(g.linea), en];
    // Uno retirado no se vuelve a usar: la respuesta igual entra como ejemplo nuevo.
    const retiro = retiroDe(db, pregunta);
    const ya = db.prepare('SELECT id FROM academia_oral_aprendido WHERE pregunta = ? AND seguimiento = ? AND tokens = ? ORDER BY id DESC').all(pregunta, seg, ts).find(f => !retirado(retiro, f.id));
    if (ya) {
      db.prepare('UPDATE academia_oral_aprendido SET edicion = ?, veredicto = ?, bien_dicho = ?, falto = ?, linea = ?, creado_en = ?, veces = veces + 1 WHERE id = ?').run(...fila, ya.id);
      return true;
    }
    db.prepare('INSERT INTO academia_oral_aprendido (pregunta, seguimiento, tokens, edicion, veredicto, bien_dicho, falto, linea, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(pregunta, seg, ts, ...fila);
    // Solo los más nuevos de cada pregunta (así la base sigue chica).
    db.prepare(`DELETE FROM academia_oral_aprendido WHERE pregunta = ? AND id NOT IN
      (SELECT id FROM academia_oral_aprendido WHERE pregunta = ? ORDER BY creado_en DESC, id DESC LIMIT ?)`).run(pregunta, pregunta, APRENDE.porPregunta);
    return true;
  } catch { return false; }
}

// Los ejemplos de una pregunta (como mucho porPregunta). [] si no hay (o si la tabla no está).
export function ejemplosDe(db, it) {
  const pregunta = claveDe(it);
  if (!db || !pregunta) return [];
  try {
    const retiro = retiroDe(db, pregunta);
    return db.prepare('SELECT id, seguimiento, tokens, veredicto, bien_dicho, falto, linea FROM academia_oral_aprendido WHERE pregunta = ? ORDER BY id DESC LIMIT ?')
      .all(pregunta, APRENDE.porPregunta)
      .filter(f => VEREDICTOS.includes(f.veredicto) && !retirado(retiro, f.id))
      .map(f => ({ seguimiento: f.seguimiento === 1, tokens: f.tokens.split(' ').filter(Boolean), veredicto: f.veredicto, bienDicho: f.bien_dicho, falto: f.falto, linea: f.linea }));
  } catch { return []; }
}

// La respuesta más parecida ya calificada por la IA (de la misma parte: primera o repregunta). Si ya calificó una IGUAL,
// esa manda; si no, entre las que pasan el umbral y no dicen lo mismo, gana la más estricta. → { veredicto, ejemplo, parecido } o null.
export function buscarParecida(ejemplos, tokens, seguimiento = false) {
  let pasan = ejemplos.filter(e => e.seguimiento === seguimiento).map(e => ({ e, s: parecido(tokens, e.tokens) })).filter(x => x.s >= APRENDE.umbral);
  if (!pasan.length) return null;
  const iguales = pasan.filter(x => x.s === 1 && mismos(x.e.tokens, tokens));
  if (iguales.length) pasan = iguales;
  const veredicto = pasan.reduce((v, x) => (ORDEN[x.e.veredicto] < ORDEN[v] ? x.e.veredicto : v), 'bien');
  const mejor = pasan.filter(x => x.e.veredicto === veredicto).sort((a, b) => b.s - a.s)[0];
  return { veredicto, ejemplo: mejor.e, parecido: mejor.s };
}

// Las palabras (raíces) que la IA premió seguido en esa pregunta y casi nunca en las que no fueron «bien» (hace falta al
// menos una de esas para comparar: si no, saldrían palabras de todas, como «piloto»). Nunca las de la pregunta misma.
export function clavesAprendidas(ejemplos, pregunta = '') {
  const bien = ejemplos.filter(e => e.veredicto === 'bien');
  const mal = ejemplos.filter(e => e.veredicto !== 'bien');
  if (bien.length < APRENDE.minBien || !mal.length) return [];
  const dePregunta = new Set(normalizar(pregunta));
  const cuenta = lista => {
    const m = new Map();
    for (const e of lista) for (const k of new Set(e.tokens)) if (k !== '~no') m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const enBien = cuenta(bien);
  const enMal = cuenta(mal);
  return [...enBien.entries()]
    .filter(([k, n]) => !dePregunta.has(k) && n / bien.length >= APRENDE.enBien && (enMal.get(k) ?? 0) / mal.length <= APRENDE.enMal)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, APRENDE.maxClaves).map(([k]) => k);
}

// Los números que dijo y que el libro no dice (ni en la pregunta). → { otros: [números dichos que no están], alguno: dijo
// alguno del libro } o null si no hay nada que comparar.
export function numerosContra(tokens, textosLibro) {
  const libro = new Set(textosLibro.flatMap(normalizar).filter(esNumero));
  const dichos = numerosDe(tokens);
  if (!libro.size || !dichos.length) return null;
  const otros = dichos.filter(n => !libro.has(n));
  if (!otros.length) return null;
  return { otros: otros.map(n => n.slice(1)), alguno: dichos.some(n => libro.has(n)) };
}

// ¿Se puede repetir el texto de la IA tal cual? Solo si dijo lo MISMO (las mismas palabras) y el texto no cita nada entre
// comillas (así nunca sale lo que dijo otro alumno).
export const repetible = (ejemplo, tokens, s) => s === 1 && mismos(ejemplo.tokens, tokens)
  && ![ejemplo.linea, ejemplo.bienDicho, ejemplo.falto].some(x => /[«»"“”‘’']/.test(x ?? ''));

// Para el administrador: de cuántas respuestas calificadas por la IA aprendió (las que siguen guardadas) y de cuántas preguntas.
export function resumenAprendido(db) {
  try {
    const f = db.prepare('SELECT COALESCE(SUM(veces), 0) AS n, COUNT(DISTINCT pregunta) AS m FROM academia_oral_aprendido').get();
    return { respuestas: Number(f.n) || 0, preguntas: Number(f.m) || 0 };
  } catch { return { respuestas: 0, preguntas: 0 }; }
}

// ---------- 0.14.93: retirar lo aprendido (nunca se borra) ----------
const claveRetiro = pregunta => `academia.oral.aprendido.retiro.${createHash('sha256').update(String(pregunta)).digest('hex').slice(0, 32)}`;
const CLAVE_PREGUNTA = /^[a-z0-9_-]{1,60}\/[a-z0-9_-]{1,60}#[a-f0-9]{16}$/;
export const esClavePregunta = p => CLAVE_PREGUNTA.test(String(p ?? ''));
export function retiroDe(db, pregunta) {
  try {
    const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(claveRetiro(pregunta))?.valor ?? 'null');
    if (!v || typeof v !== 'object' || v.pregunta !== pregunta) return null;
    return { pregunta, hastaId: Number.isSafeInteger(v.hastaId) ? v.hastaId : 0, ids: v.ids && typeof v.ids === 'object' ? v.ids : {}, historial: Array.isArray(v.historial) ? v.historial : [] };
  } catch { return null; }
}
// ¿Retirado? Lo que se marcó uno por uno manda; si no, todos los de esa pregunta hasta hastaId.
export const retirado = (retiro, id) => (!retiro ? false : Object.hasOwn(retiro.ids, String(id)) ? retiro.ids[String(id)] === true : id <= retiro.hastaId);
const guardarRetiro = (db, r, en) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(claveRetiro(r.pregunta), JSON.stringify(r), en);
// Retira los ejemplos de una pregunta: todos los que hay ahora (id = null) o uno (id). Lo de antes queda en «historial».
// valor false: lo vuelve a usar (solo uno). → { pregunta, activos, retirados } o null (la pregunta no es válida).
export function retirarAprendido(db, pregunta, { id = null, valor = true, por = null, motivo = 'admin', reporte = null } = {}, ahoraMs = Date.now()) {
  if (!esClavePregunta(pregunta)) return null;
  const en = new Date(ahoraMs).toISOString();
  const r = retiroDe(db, pregunta) ?? { pregunta, hastaId: 0, ids: {}, historial: [] };
  if (id == null) {
    const max = db.prepare('SELECT MAX(id) AS m FROM academia_oral_aprendido WHERE pregunta = ?').get(pregunta)?.m ?? 0;
    r.hastaId = Math.max(r.hastaId, Number(max) || 0);
    // Los que se habían vuelto a usar uno por uno también quedan retirados.
    for (const k of Object.keys(r.ids)) if (Number(k) <= r.hastaId) r.ids[k] = true;
  } else {
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM academia_oral_aprendido WHERE id = ? AND pregunta = ?').get(id, pregunta)) return null;
    r.ids[String(id)] = valor !== false;
  }
  r.historial = [...r.historial, { en, por: Number.isSafeInteger(por) ? por : null, motivo: String(motivo).slice(0, 40), reporte: reporte == null ? null : String(reporte).slice(0, 40), ...(id == null ? { todos: true, hastaId: r.hastaId } : { id, valor: valor !== false }) }].slice(-50);
  guardarRetiro(db, r, en);
  return { pregunta, ...cuentaDe(db, pregunta) };
}
function cuentaDe(db, pregunta) {
  const retiro = retiroDe(db, pregunta);
  const ids = db.prepare('SELECT id FROM academia_oral_aprendido WHERE pregunta = ?').all(pregunta).map(f => f.id);
  const retirados = ids.filter(id => retirado(retiro, id)).length;
  return { activos: ids.length - retirados, retirados };
}
// Para el administrador: las preguntas con algo aprendido (las más nuevas primero) con cuántos ejemplos usa y cuántos retiró.
export function preguntasAprendidas(db, limite = 200) {
  try {
    return db.prepare('SELECT pregunta, COUNT(*) AS n, MAX(creado_en) AS ultimo FROM academia_oral_aprendido GROUP BY pregunta ORDER BY ultimo DESC LIMIT ?').all(limite)
      .map(f => ({ pregunta: f.pregunta, ultimo: f.ultimo, ...cuentaDe(db, f.pregunta) }));
  } catch { return []; }
}
// Los ejemplos de una pregunta para revisarlos (también los retirados). Nunca lo que dijo el alumno tal cual (solo lo
// normalizado) ni de quién fue.
export function ejemplosAdmin(db, pregunta) {
  if (!esClavePregunta(pregunta)) return [];
  const retiro = retiroDe(db, pregunta);
  try {
    return db.prepare('SELECT id, seguimiento, tokens, veredicto, bien_dicho, falto, linea, veces, creado_en FROM academia_oral_aprendido WHERE pregunta = ? ORDER BY id DESC LIMIT ?')
      .all(pregunta, APRENDE.porPregunta)
      .map(f => ({ id: f.id, seguimiento: f.seguimiento === 1, palabras: f.tokens.split(' ').filter(Boolean).slice(0, 30), veredicto: f.veredicto, bienDicho: f.bien_dicho, falto: f.falto, linea: f.linea, veces: f.veces, en: f.creado_en, retirado: retirado(retiro, f.id) }));
  } catch { return []; }
}
// El texto de la pregunta de una clave («materia/tema#huella»), del paquete activo. → { materia, tema, temaTitulo, pregunta_es, pregunta_en } o null.
export function preguntaDeClave(paquete, pregunta) {
  const m = /^([^/]+)\/([^#]+)#([a-f0-9]{16})$/.exec(String(pregunta ?? ''));
  if (!m) return null;
  const t = paquete?.oral?.materias?.find(x => x.id === m[1])?.temas?.find(x => x.id === m[2]);
  const x = (t?.libro_qa ?? []).find(q => createHash('sha256').update(String(q?.pregunta_en ?? '')).digest('hex').slice(0, 16) === m[3]);
  return x ? { materia: m[1], tema: m[2], temaTitulo: t.titulo ?? m[2], pregunta_es: x.pregunta_es ?? null, pregunta_en: x.pregunta_en } : null;
}
