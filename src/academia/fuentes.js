// Academia 0.13.0: las FUENTES de la «Fábrica de materias» (src/academia/fabrica.js). Viven SOLO en la carpeta privada de
// datos del servidor (academia/fabrica/fuentes/): nunca en el repositorio, nunca servidas a un alumno (ninguna ruta lee
// esa carpeta). Llegan de la subcarpeta «fuentes» de la carpeta de Google Drive del dueño (la misma de los paquetes).
//
// Archivos (nombres exactos; ver README «Lo nuevo de la 0.13.0»):
//  - fuentes-manifiesto.json: libros, materias → temas (preguntas del Test Guide y lecturas por páginas), excluidas, movidas.
//  - tg.json: las preguntas del Test Guide TAL CUAL (nunca se cambian: la fábrica las copia byte a byte al paquete).
//  - libro-<libro>-capNN.txt: el texto de un capítulo, con marcas de página «=== p 123 ===» (≤ 1 MB cada uno).
//  - imagenes.json y los .webp (img-… del libro, fig-… del Test Guide).
//  - oral/oral.json, oral/oral-capNN.txt y oral/img-… (la pista «Preparándote para el examen oral»; la fabrica
//    src/academia/fabrica-oral.js y la ve el alumno por src/academia/oral.js).
// Todo es puro aquí salvo sincronizarFuentes (la red, por src/academia/drive.js) y las lecturas de archivos. La memoria se
// cuida: un capítulo se lee entero (≤ 1 MB) solo para sacar sus páginas; tg.json se parte por tema una vez al sincronizar.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, createReadStream, openSync, writeSync, closeSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { MATERIAS, ID_VALIDO, ARCHIVO_FIGURA } from './formato.js';
import { carpetaAcademia, leerAjuste, guardarAjuste, huellaDeArchivo } from './paquetes.js';
import { listarCarpeta, bajarArchivo, basesDrive } from './drive.js';
import { carpetaDrive } from './drive-estado.js';
import { espacioLibre } from './espacio.js';

export const FORMATO_FUENTES = 'fuentes-academia';
export const ARCHIVO_MANIFIESTO = 'fuentes-manifiesto.json';
export const ARCHIVO_TG = 'tg.json';
export const ARCHIVO_IMAGENES = 'imagenes.json';
export const CARPETA_EN_DRIVE = 'fuentes';
export const AJUSTE_FUENTES = 'fabrica.fuentes';
export const LIBRO_TXT = /^libro-[a-z0-9][a-z0-9-]{0,40}-cap\d{2,3}\.txt$/;
export const ORAL_TXT = /^oral-cap\d{2,3}\.txt$/;
export const ID_TG = /^\d{1,2}-\d{1,4}[a-z]?$/;
export const FIGURA_TG = /^fig-[a-z0-9][a-z0-9._-]{0,70}\.(?:webp|png|jpg|jpeg)$/i;
export const IMAGEN_LIBRO = /^img-[a-z0-9][a-z0-9._-]{0,70}\.(?:webp|png|jpg|jpeg)$/i;
export const TOPES_FUENTES = Object.freeze({
  txtBytes: 1024 * 1024, jsonBytes: 4 * 1024 * 1024, imagenBytes: 1024 * 1024, figuraBytes: 4 * 1024 * 1024, archivos: 3000, carpetas: 12,
  // 0.13.0: el paquete de fuentes en partes (fuentes-vN.tar.gz.partNN, ≤ 9,5 MB cada una; Drive no deja subir más de 10 MB).
  parteBytes: 10 * 1024 * 1024, partes: 60, indiceBytes: 64 * 1024, totalTarBytes: 400 * 1024 * 1024, entradasTar: 6000,
  paginasPorLectura: 400, lecturasPorTema: 12, temas: 400,
});
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
const esObjeto = v => v != null && typeof v === 'object' && !Array.isArray(v);
const textoOk = (v, max = 400) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\u0000');
export const carpetaFuentes = config => join(carpetaAcademia(config), 'fabrica', 'fuentes');
export const huellaTexto = t => createHash('sha256').update(String(t)).digest('hex');

// ---------- El manifiesto (puro) ----------
// → { ok, errores: [{ ruta, motivo }], materias: [ids] }.
export function revisarManifiesto(m) {
  const errores = [];
  const mal = (ruta, motivo) => { if (errores.length < 50) errores.push({ ruta, motivo }); };
  if (!esObjeto(m)) return { ok: false, errores: [{ ruta: '', motivo: 'no_es_objeto' }], materias: [] };
  if (m.formato !== FORMATO_FUENTES) mal('formato', 'formato_desconocido');
  if (m.version !== 1) mal('version', 'version_desconocida');
  if (m.tg !== ARCHIVO_TG) mal('tg', 'archivo_no_valido');
  if (m.imagenes != null && m.imagenes !== ARCHIVO_IMAGENES) mal('imagenes', 'archivo_no_valido');
  const libros = new Set();
  if (!Array.isArray(m.libros) || !m.libros.length) mal('libros', 'falta');
  else m.libros.forEach((l, i) => {
    if (!esObjeto(l) || typeof l.id !== 'string' || !ID_VALIDO.test(l.id)) return mal(`libros[${i}].id`, 'id_no_valido');
    if (libros.has(l.id)) mal(`libros[${i}].id`, 'repetido');
    if (!textoOk(l.titulo)) mal(`libros[${i}].titulo`, 'falta');
    libros.add(l.id);
  });
  const tgVistos = new Set();
  const materias = [];
  let temas = 0;
  if (!Array.isArray(m.materias) || !m.materias.length) mal('materias', 'falta');
  else m.materias.forEach((x, i) => {
    const r = `materias[${i}]`;
    if (!esObjeto(x)) return mal(r, 'no_es_objeto');
    if (!MATERIAS.includes(x.id)) return mal(`${r}.id`, 'materia_desconocida');
    if (materias.includes(x.id)) return mal(`${r}.id`, 'repetido');
    materias.push(x.id);
    if (!Number.isSafeInteger(x.num) || x.num < 1 || x.num > 11) mal(`${r}.num`, 'no_valido');
    if (!textoOk(x.nombre)) mal(`${r}.nombre`, 'falta');
    if (!Array.isArray(x.temas) || !x.temas.length) return mal(`${r}.temas`, 'falta');
    const ids = new Set();
    x.temas.forEach((t, j) => {
      const rt = `${r}.temas[${j}]`;
      temas += 1;
      if (!esObjeto(t) || typeof t.id !== 'string' || !ID_VALIDO.test(t.id)) return mal(`${rt}.id`, 'id_no_valido');
      if (ids.has(t.id)) mal(`${rt}.id`, 'repetido');
      ids.add(t.id);
      if (!textoOk(t.titulo)) mal(`${rt}.titulo`, 'falta');
      if (!Array.isArray(t.tg)) mal(`${rt}.tg`, 'falta');
      else t.tg.forEach((q, k) => {
        if (typeof q !== 'string' || !ID_TG.test(q)) return mal(`${rt}.tg[${k}]`, 'id_no_valido');
        if (tgVistos.has(q)) mal(`${rt}.tg[${k}]`, 'pregunta_en_dos_temas');
        tgVistos.add(q);
      });
      if (!Array.isArray(t.lecturas) || !t.lecturas.length || t.lecturas.length > TOPES_FUENTES.lecturasPorTema) return mal(`${rt}.lecturas`, 'falta');
      t.lecturas.forEach((l, k) => {
        const rl = `${rt}.lecturas[${k}]`;
        if (!esObjeto(l)) return mal(rl, 'no_es_objeto');
        if (!libros.has(l.libro)) mal(`${rl}.libro`, 'libro_desconocido');
        if (typeof l.archivo !== 'string' || !LIBRO_TXT.test(l.archivo)) mal(`${rl}.archivo`, 'archivo_no_valido');
        else if (!l.archivo.startsWith(`libro-${l.libro}-cap`)) mal(`${rl}.archivo`, 'archivo_de_otro_libro');
        if (!Number.isSafeInteger(l.desde) || l.desde < 1 || !Number.isSafeInteger(l.hasta) || l.hasta < l.desde || l.hasta - l.desde > TOPES_FUENTES.paginasPorLectura) mal(`${rl}.desde`, 'paginas_no_validas');
      });
    });
  });
  if (temas > TOPES_FUENTES.temas) mal('materias', 'demasiados_temas');
  for (const [campo, claves] of [['excluidas', ['id', 'motivo']], ['movidas', ['id', 'de', 'a']]]) {
    if (m[campo] == null) continue;
    if (!Array.isArray(m[campo])) { mal(campo, 'no_es_lista'); continue; }
    m[campo].forEach((x, i) => {
      if (!esObjeto(x) || claves.some(c => !textoOk(x[c]))) return mal(`${campo}[${i}]`, 'no_valido');
      if (!ID_TG.test(x.id)) mal(`${campo}[${i}].id`, 'id_no_valido');
      if (campo === 'excluidas' && tgVistos.has(x.id)) mal(`${campo}[${i}].id`, 'excluida_en_un_tema');
      if (campo === 'movidas' && !MATERIAS.includes(x.a)) mal(`${campo}[${i}].a`, 'materia_desconocida');
    });
  }
  return { ok: errores.length === 0, errores, materias };
}

// ---------- tg.json (puro): cada pregunta tal cual, y que todo cuadre con el manifiesto ----------
export function revisarTg(tg, manifiesto) {
  const errores = [];
  const mal = (ruta, motivo) => { if (errores.length < 50) errores.push({ ruta, motivo }); };
  if (!esObjeto(tg) || !Array.isArray(tg.preguntas)) return { ok: false, errores: [{ ruta: 'tg', motivo: 'falta' }], porId: new Map() };
  const porId = new Map();
  tg.preguntas.forEach((q, i) => {
    const r = `tg.preguntas[${i}]`;
    if (!esObjeto(q) || typeof q.id !== 'string' || !ID_TG.test(q.id)) return mal(`${r}.id`, 'id_no_valido');
    if (porId.has(q.id)) return mal(`${r}.id`, 'repetido');
    if (typeof q.enunciado !== 'string' || !q.enunciado.trim()) mal(`${r}.enunciado`, 'falta');
    // 0.14.15: algunas preguntas del Test Guide no traen explicación (vienen así en el libro): vacía o sin ella vale.
    if (q.explicacion != null && typeof q.explicacion !== 'string') mal(`${r}.explicacion`, 'no_valida');
    const letras = esObjeto(q.opciones) ? Object.keys(q.opciones) : [];
    if (letras.length < 2 || letras.length > 6 || letras.some((l, k) => l !== LETRAS[k]) || letras.some(l => typeof q.opciones[l] !== 'string' || !q.opciones[l].trim())) mal(`${r}.opciones`, 'opciones_no_validas');
    if (!letras.includes(q.correcta)) mal(`${r}.correcta`, 'correcta_no_es_opcion');
    if (q.figura != null && (typeof q.figura !== 'string' || !FIGURA_TG.test(q.figura))) mal(`${r}.figura`, 'archivo_no_valido');
    porId.set(q.id, q);
  });
  if (manifiesto) {
    const excluidas = new Set((manifiesto.excluidas ?? []).map(x => x.id));
    const movidas = new Map((manifiesto.movidas ?? []).map(x => [x.id, x.a]));
    const enTema = new Set();
    for (const m of manifiesto.materias ?? []) for (const t of m.temas ?? []) for (const id of t.tg ?? []) {
      enTema.add(id);
      const q = porId.get(id);
      if (!q) mal(`${m.id}.${t.id}`, `pregunta_no_esta:${id}`);
      else if ((movidas.get(id) ?? q.materia) !== m.id) mal(`${m.id}.${t.id}`, `pregunta_de_otra_materia:${id}`);
    }
    const fabricadas = new Set((manifiesto.materias ?? []).map(m => m.id));
    for (const q of porId.values()) {
      const materia = movidas.get(q.id) ?? q.materia;
      if (fabricadas.has(materia) && !enTema.has(q.id) && !excluidas.has(q.id)) mal(`tg.${q.id}`, 'pregunta_sin_tema');
    }
  }
  return { ok: errores.length === 0, errores, porId };
}

// imagenes.json (puro): solo las que tienen nombre y página bien. → { ok, errores, lista }
export function revisarImagenes(lista, libros) {
  const errores = [];
  if (lista == null) return { ok: true, errores, lista: [] };
  if (!Array.isArray(lista)) return { ok: false, errores: [{ ruta: 'imagenes', motivo: 'no_es_lista' }], lista: [] };
  const buenas = [];
  const vistos = new Set();
  lista.forEach((x, i) => {
    // 0.13.1: las de la Guía del examen oral («oral/img-…») las lee la pista oral (src/academia/fabrica-oral.js).
    if (esObjeto(x) && typeof x.archivo === 'string' && x.archivo.startsWith('oral/')) return;
    const malo = !esObjeto(x) || typeof x.archivo !== 'string' || !(IMAGEN_LIBRO.test(x.archivo) || FIGURA_TG.test(x.archivo)) || !ARCHIVO_FIGURA.test(x.archivo)
      || vistos.has(x.archivo) || (IMAGEN_LIBRO.test(x.archivo) && (!libros.has(x.libro) || !Number.isSafeInteger(x.pagina)));
    if (malo) { if (errores.length < 20) errores.push({ ruta: `imagenes[${i}]`, motivo: 'no_valida' }); return; }
    vistos.add(x.archivo);
    buenas.push({ archivo: x.archivo, libro: x.libro ?? null, pagina: x.pagina ?? null, pie: textoOk(x.pie, 400) ? x.pie : null, ancho: Number(x.ancho) || null, alto: Number(x.alto) || null });
  });
  return { ok: errores.length === 0, errores, lista: buenas };
}

// ---------- Las páginas de un capítulo ----------
// «=== p 123 ===» abre la página 123. → Map(página → texto).
export function paginasDeTexto(texto) {
  const paginas = new Map();
  const marca = /^===\s*p\s+(\d{1,5})\s*===\s*$/gm;
  let actual = null;
  let desde = 0;
  for (const m of texto.matchAll(marca)) {
    if (actual != null) paginas.set(actual, (paginas.get(actual) ?? '') + texto.slice(desde, m.index));
    actual = Number(m[1]);
    desde = m.index + m[0].length;
  }
  if (actual != null) paginas.set(actual, (paginas.get(actual) ?? '') + texto.slice(desde));
  for (const [p, t] of paginas) paginas.set(p, t.trim());
  return paginas;
}

// La lectura de un tema: [{ libro, archivo, pagina, texto }] en orden. Un archivo que falta o pasa de 1 MB se informa.
export function leerLecturas(dir, tema) {
  const partes = [];
  const faltan = [];
  for (const l of tema.lecturas ?? []) {
    const ruta = join(dir, l.archivo);
    let texto;
    try {
      if (statSync(ruta).size > TOPES_FUENTES.txtBytes) { faltan.push(l.archivo); continue; }
      texto = readFileSync(ruta, 'utf8');
    } catch { faltan.push(l.archivo); continue; }
    const paginas = paginasDeTexto(texto);
    texto = null;
    for (let p = l.desde; p <= l.hasta; p++) if (paginas.get(p)) partes.push({ libro: l.libro, archivo: l.archivo, pagina: p, texto: paginas.get(p) });
  }
  return { partes, faltan };
}

// El texto que ve el modelo: «[<libro> p. N]» antes de cada página.
export const textoDeLectura = (partes, titulos) => partes.map(x => `[${titulos.get(x.libro) ?? x.libro}, p. ${x.pagina}]\n${x.texto}`).join('\n\n');

// ---------- Lo que la fábrica usa ya preparado ----------
// Al sincronizar se parte tg.json por tema (tg/<materia>/<tema>.json, TAL CUAL) y las imágenes por tema (por página).
export function prepararPorTema(dir, manifiesto, tgPorId, imagenes) {
  for (const m of manifiesto.materias) {
    mkdirSync(join(dir, 'tg', m.id), { recursive: true });
    for (const t of m.temas) {
      const qs = t.tg.map(id => tgPorId.get(id)).filter(Boolean);
      escribirSiCambia(join(dir, 'tg', m.id, `${t.id}.json`), JSON.stringify({ preguntas: qs }));
      const enRango = imagenes.filter(x => (x.libro && t.lecturas.some(l => l.libro === x.libro && x.pagina >= l.desde && x.pagina <= l.hasta))
        || qs.some(q => q.figura === x.archivo));
      escribirSiCambia(join(dir, 'tg', m.id, `${t.id}.imagenes.json`), JSON.stringify(enRango));
    }
  }
}
function escribirSiCambia(ruta, texto) {
  try { if (readFileSync(ruta, 'utf8') === texto) return; } catch { /* nuevo */ }
  writeFileSync(`${ruta}.part`, texto, { mode: 0o640 });
  renameSync(`${ruta}.part`, ruta);
}
export function preguntasDeTema(dir, materia, tema) {
  try { return JSON.parse(readFileSync(join(dir, 'tg', materia, `${tema}.json`), 'utf8')).preguntas ?? []; } catch { return null; }
}
export function imagenesDeTema(dir, materia, tema) {
  try { const l = JSON.parse(readFileSync(join(dir, 'tg', materia, `${tema}.imagenes.json`), 'utf8')); return Array.isArray(l) ? l : []; } catch { return []; }
}
// 0.14.15: una materia SIN temas (p. ej. SMS, que no tiene material en los libros) no es un error: se deja fuera de las
// fuentes (la fábrica y la mejora profunda la saltan). Antes una sola materia vacía rechazaba TODAS las fuentes.
export function limpiarManifiesto(m) {
  if (!esObjeto(m) || !Array.isArray(m.materias)) return m;
  return { ...m, materias: m.materias.filter(x => !(esObjeto(x) && Array.isArray(x.temas) && x.temas.length === 0)) };
}
export function leerManifiesto(dir) {
  try { return limpiarManifiesto(JSON.parse(readFileSync(join(dir, ARCHIVO_MANIFIESTO), 'utf8'))); } catch { return null; }
}

// El estado de las fuentes (lo que vio la última sincronización): { ok, errores, materias, huella, en, faltan, archivos }.
export function estadoFuentes(db) {
  try { const v = JSON.parse(leerAjuste(db, AJUSTE_FUENTES) ?? 'null'); return esObjeto(v) ? v : null; } catch { return null; }
}

// 0.14.13: lo que la pantalla dice de las fuentes, en una línea. → { estado: 'listas'|'bajando'|'fallo'|'nunca'|'con_errores',
// hechas, total, motivo }. «motivo» es una clave (fuentes.motivo.<motivo> en public/i18n).
// «sync» es lo que dijo la última sincronización (fabrica.general.sync), para cuando ni se llegó a guardar el estado.
export function resumenFuentes(f, sync = null) {
  const fallo = esObjeto(sync) && !sync.ok && typeof sync.motivo === 'string' ? sync.motivo : null;
  if (!esObjeto(f)) return fallo ? { estado: 'fallo', hechas: 0, total: 0, motivo: fallo } : { estado: 'nunca', hechas: 0, total: 0, motivo: null };
  const d = esObjeto(f.descarga) ? f.descarga : null;
  const hechas = Number.isSafeInteger(d?.hechas) ? d.hechas : 0;
  const total = Number.isSafeInteger(d?.total) ? d.total : 0;
  if (f.ok) return { estado: 'listas', hechas, total, motivo: null };
  if (d?.estado === 'bajando') return { estado: 'bajando', hechas, total, motivo: d.motivo ?? null };
  if (d?.estado === 'fallo') return { estado: 'fallo', hechas, total, motivo: d.motivo ?? f.archivo?.motivo ?? null };
  if (fallo) return { estado: 'fallo', hechas, total, motivo: fallo };
  const e = Array.isArray(f.errores) ? f.errores[0] : null;
  return { estado: 'con_errores', hechas, total, motivo: e?.ruta === ARCHIVO_MANIFIESTO && e?.motivo === 'falta' ? 'sin_manifiesto' : 'con_errores' };
}

// Revisa lo que hay en la carpeta (sin red) y deja todo preparado. → el estado (también se guarda con escribir).
export function revisarCarpetaFuentes(dir) {
  const estado = { ok: false, errores: [], materias: [], huella: null, faltan: [], oral: false };
  const ruta = join(dir, ARCHIVO_MANIFIESTO);
  if (!existsSync(ruta)) return { ...estado, errores: [{ ruta: ARCHIVO_MANIFIESTO, motivo: 'falta' }] };
  let manifiesto;
  try { manifiesto = limpiarManifiesto(JSON.parse(readFileSync(ruta, 'utf8'))); } catch { return { ...estado, errores: [{ ruta: ARCHIVO_MANIFIESTO, motivo: 'json_no_valido' }] }; }
  const rm = revisarManifiesto(manifiesto);
  if (!rm.ok) return { ...estado, errores: rm.errores };
  let tg;
  try { if (statSync(join(dir, ARCHIVO_TG)).size > TOPES_FUENTES.jsonBytes) throw new Error('grande'); tg = JSON.parse(readFileSync(join(dir, ARCHIVO_TG), 'utf8')); } catch { return { ...estado, errores: [{ ruta: ARCHIVO_TG, motivo: 'falta' }] }; }
  const rt = revisarTg(tg, manifiesto);
  if (!rt.ok) return { ...estado, errores: rt.errores };
  let imagenes = [];
  try { imagenes = JSON.parse(readFileSync(join(dir, ARCHIVO_IMAGENES), 'utf8')); } catch { imagenes = []; }
  const ri = revisarImagenes(imagenes, new Set(manifiesto.libros.map(l => l.id)));
  const faltan = new Set();
  for (const m of manifiesto.materias) for (const t of m.temas) for (const l of t.lecturas) if (!existsSync(join(dir, l.archivo))) faltan.add(l.archivo);
  for (const q of rt.porId.values()) if (q.figura && !existsSync(join(dir, q.figura))) faltan.add(q.figura);
  prepararPorTema(dir, manifiesto, rt.porId, ri.lista.filter(x => existsSync(join(dir, x.archivo))));
  return {
    ok: true, errores: ri.errores, materias: rm.materias, huella: huellaTexto(readFileSync(ruta)) .slice(0, 32),
    faltan: [...faltan].slice(0, 50), oral: existsSync(join(dir, 'oral', 'oral.json')),
  };
}

// ---------- Traer la subcarpeta «fuentes» de Drive ----------
// Busca la carpeta «fuentes» (hasta 3 niveles bajo la carpeta del dueño), la lista con sus subcarpetas (una, «oral» u
// otras) y baja lo que cambió (por la fecha que muestra Drive). Nunca borra nada; un archivo nuevo pisa al de antes del
// mismo nombre solo cuando terminó de bajar bien. → { ok, motivo?, bajados, errores }.
const NOMBRE_PERMITIDO = n => n === ARCHIVO_MANIFIESTO || n === ARCHIVO_TG || n === ARCHIVO_IMAGENES || n === 'oral.json'
  || LIBRO_TXT.test(n) || ORAL_TXT.test(n) || IMAGEN_LIBRO.test(n) || FIGURA_TG.test(n);
const topeDeNombre = n => (n.endsWith('.txt') ? TOPES_FUENTES.txtBytes : n.endsWith('.json') ? TOPES_FUENTES.jsonBytes : FIGURA_TG.test(n) ? TOPES_FUENTES.figuraBytes : TOPES_FUENTES.imagenBytes);
export const INDICE_PARTES = /^fuentes-v(\d{1,4})\.json$/;
export const PARTE = /^fuentes-v\d{1,4}\.tar\.gz\.part\d{2,3}$/;
// Por pedazos de 1 MB (una parte de 9,5 MB nunca entera en memoria).
const huellaArchivo = ruta => huellaDeArchivo(ruta);

// ---------- El paquete de fuentes en partes ----------
// fuentes-vN.json = { version, partes: [{ archivo, sha256, bytes }], sha256_total, bytes_total }. → { ok, indice } o { ok: false, motivo }
export function revisarIndice(x) {
  const SHA = /^[a-f0-9]{64}$/;
  if (!esObjeto(x) || !Number.isSafeInteger(x.version) || !Array.isArray(x.partes) || !x.partes.length || x.partes.length > TOPES_FUENTES.partes) return { ok: false, motivo: 'indice_no_valido' };
  const vistos = new Set();
  for (const p of x.partes) {
    if (!esObjeto(p) || typeof p.archivo !== 'string' || !PARTE.test(p.archivo) || vistos.has(p.archivo) || !SHA.test(String(p.sha256)) || !Number.isSafeInteger(p.bytes) || p.bytes < 1 || p.bytes > TOPES_FUENTES.parteBytes) return { ok: false, motivo: 'parte_no_valida' };
    vistos.add(p.archivo);
  }
  const suma = x.partes.reduce((a, p) => a + p.bytes, 0);
  if (!SHA.test(String(x.sha256_total)) || x.bytes_total !== suma) return { ok: false, motivo: 'total_no_valido' };
  return { ok: true, indice: x };
}
// El nombre de una entrada del tar: relativo, sin «..», sin barra invertida, y de los que la fábrica conoce.
// → { ruta, tope } | { saltar: true } (no es de las fuentes) | { mal: true } (rechaza el paquete entero)
export function nombreDeEntrada(nombre) {
  const n = String(nombre).replace(/^\.\//, '');
  if (!n || n.startsWith('/') || n.includes('\\') || n.includes('\u0000') || /^[A-Za-z]:/.test(n) || n.split('/').some(x => x === '..')) return { mal: true };
  const partes = n.split('/').filter(x => x && x !== '.');
  if (partes.length === 1 && NOMBRE_PERMITIDO(partes[0]) && !ORAL_TXT.test(partes[0]) && partes[0] !== 'oral.json') return { ruta: partes[0], tope: topeDeNombre(partes[0]) };
  if (partes.length === 2 && partes[0] === 'oral' && (partes[1] === 'oral.json' || ORAL_TXT.test(partes[1]) || IMAGEN_LIBRO.test(partes[1]) || FIGURA_TG.test(partes[1]))) return { ruta: `oral/${partes[1]}`, tope: topeDeNombre(partes[1]) };
  return { saltar: true };
}
const sinCeros = t => t.split('\0')[0];
const octal = (b, desde, largo) => { const t = sinCeros(b.toString('latin1', desde, desde + largo)).trim(); return t ? parseInt(t, 8) : 0; };

// Lee un tar (ustar) por pedazos y escribe sus archivos en «destino» (una carpeta nueva). Solo archivos comunes: un
// enlace, un dispositivo, una ruta absoluta o con «..», o un archivo más grande que su tope rechazan TODO. Lo que no es de
// las fuentes se salta. → { ok, archivos } o { ok: false, motivo }
export async function extraerTar(trozos, destino) {
  mkdirSync(destino, { recursive: true });
  let pendiente = Buffer.alloc(0);
  let actual = null;
  let nombreLargo = null;
  let entradas = 0;
  let total = 0;
  let escritos = 0;
  const archivos = [];
  const cerrar = () => { if (actual?.fd != null) { closeSync(actual.fd); actual.fd = null; } };
  try {
    for await (const trozo of trozos) {
      total += trozo.length;
      if (total > TOPES_FUENTES.totalTarBytes) return { ok: false, motivo: 'demasiado_grande' };
      pendiente = pendiente.length ? Buffer.concat([pendiente, trozo]) : trozo;
      let i = 0;
      for (;;) {
        if (actual) {
          const n = Math.min(actual.restante, pendiente.length - i);
          if (n > 0) {
            if (actual.fd != null) writeSync(actual.fd, pendiente, i, n);
            // Lo ya escrito se suelta de a ~1 MB (como en bajarArchivo): con poca memoria Node no lo recoge solo a tiempo.
            if (Math.floor(escritos / 1_048_576) !== Math.floor((escritos + n) / 1_048_576)) globalThis.gc?.();
            escritos += n;
            if (actual.texto) actual.texto.push(Buffer.from(pendiente.subarray(i, i + n)));
            actual.restante -= n;
            i += n;
          }
          if (actual.restante > 0) break;
          const r = Math.min(actual.relleno, pendiente.length - i);
          actual.relleno -= r;
          i += r;
          if (actual.relleno > 0) break;
          cerrar();
          if (actual.texto) nombreLargo = sinCeros(Buffer.concat(actual.texto).toString('utf8'));
          if (actual.ruta) archivos.push(actual.ruta);
          actual = null;
          continue;
        }
        if (pendiente.length - i < 512) break;
        const h = pendiente.subarray(i, i + 512);
        i += 512;
        if (h.every(b => b === 0)) continue;
        if (++entradas > TOPES_FUENTES.entradasTar) return { ok: false, motivo: 'demasiadas_entradas' };
        const tipo = String.fromCharCode(h[156] || 48);
        const tam = octal(h, 124, 12);
        const prefijo = sinCeros(h.toString('utf8', 345, 500));
        const nombre = nombreLargo ?? `${prefijo ? `${prefijo}/` : ''}${sinCeros(h.toString('utf8', 0, 100))}`;
        nombreLargo = null;
        const relleno = (512 - (tam % 512)) % 512;
        if (tipo === 'L') { if (tam > 4096) return { ok: false, motivo: 'nombre_largo' }; actual = { restante: tam, relleno, texto: [] }; continue; }
        if (tipo === 'x' || tipo === 'g') { if (tam > 1024 * 1024) return { ok: false, motivo: 'cabecera_grande' }; actual = { restante: tam, relleno }; continue; }
        if (tipo === '5') { if (nombreDeEntrada(`${nombre.replace(/\/$/, '')}/x`).mal) return { ok: false, motivo: 'ruta_no_permitida' }; continue; }
        if (tipo !== '0' && tipo !== '7') return { ok: false, motivo: 'tipo_no_permitido' };
        const e = nombreDeEntrada(nombre);
        if (e.mal) return { ok: false, motivo: 'ruta_no_permitida' };
        if (e.saltar) { actual = { restante: tam, relleno }; continue; }
        if (tam > e.tope) return { ok: false, motivo: 'archivo_muy_grande' };
        const ruta = join(destino, e.ruta);
        mkdirSync(dirname(ruta), { recursive: true });
        actual = { restante: tam, relleno, fd: openSync(ruta, 'w', 0o640), ruta: e.ruta };
      }
      pendiente = i < pendiente.length ? Buffer.from(pendiente.subarray(i)) : Buffer.alloc(0);
    }
    if (actual) return { ok: false, motivo: 'tar_cortado' };
    return { ok: true, archivos };
  } catch {
    return { ok: false, motivo: 'tar_no_valido' };
  } finally {
    cerrar();
  }
}

// Las partes ya bajadas y revisadas → juntas (por pedazos, nunca enteras en memoria) → gunzip → tar → una carpeta nueva
// → cada archivo a su lugar (solo si todo salió bien y la huella total coincide). → { ok, archivos } o { ok: false, motivo }
export async function instalarPartes(dir, indice) {
  const carpeta = join(dir, 'partes');
  const hash = createHash('sha256');
  let bytes = 0;
  async function* juntas() {
    for (const p of indice.partes) {
      for await (const trozo of createReadStream(join(carpeta, p.archivo), { highWaterMark: 256 * 1024 })) { hash.update(trozo); bytes += trozo.length; yield trozo; }
    }
  }
  const destino = join(dir, 'entrante', indice.sha256_total.slice(0, 16));
  const gunzip = createGunzip({ chunkSize: 64 * 1024 });
  let fallo = null;
  const fuente = Readable.from(juntas());
  fuente.on('error', () => { fallo ??= 'parte_ilegible'; gunzip.destroy(); });
  fuente.pipe(gunzip);
  async function* descomprimido() {
    try { for await (const t of gunzip) yield t; } catch { fallo ??= 'gzip_no_valido'; }
  }
  const r = await extraerTar(descomprimido(), destino);
  if (fallo) return { ok: false, motivo: fallo };
  if (!r.ok) { fuente.destroy(); return r; }
  if (bytes !== indice.bytes_total || hash.digest('hex') !== indice.sha256_total) return { ok: false, motivo: 'total_distinto' };
  for (const a of r.archivos) { mkdirSync(dirname(join(dir, a)), { recursive: true }); renameSync(join(destino, a), join(dir, a)); }
  return { ok: true, archivos: r.archivos.length };
}

// Baja el paquete en partes (si hace falta) y lo instala. → lo mismo que sincronizarFuentes.
// 0.14.13: las partes ya bajadas y revisadas se quedan en partes/ y se siguen en el paso siguiente (la fábrica vuelve a
// sincronizar en seguida mientras quede alguna: ver src/academia/fabrica.js). El avance queda en «descarga» ({ estado:
// 'bajando'|'fallo'|'instalada', hechas, total, motivo }) para que la pantalla diga «Bajando los libros: 12 de 27» o el
// motivo exacto. La instalación (80 MB por pedazos) solo empieza con tiempo de sobra en el paso.
export const RESERVA_INSTALAR_MS = 90_000;
export const MOTIVOS_PASAJEROS = new Set(['tiempo_agotado', 'sin_red', 'cancelado', 'no_responde', 'muchos_pedidos', 'no_disponible']);
async function sincronizarPartes(db, dir, archivos, { bases, senal, quedaMs, escribir, anterior }) {
  const indices = archivos.filter(a => INDICE_PARTES.test(a.nombre)).sort((a, b) => Number(INDICE_PARTES.exec(b.nombre)[1]) - Number(INDICE_PARTES.exec(a.nombre)[1]));
  mkdirSync(join(dir, 'partes'), { recursive: true });
  const ri = join(dir, 'partes', indices[0].nombre);
  let total = 0;
  let hechas = 0;
  const guardar = async (archivo, estado = anterior, descarga = null) => {
    const nuevo = { ...estado, archivo: { indice: indices[0].nombre, ...archivo }, descarga: descarga ?? { estado: archivo.ok ? 'instalada' : 'fallo', motivo: archivo.motivo ?? null, hechas, total }, en: new Date().toISOString() };
    await escribir(() => guardarAjuste(db, AJUSTE_FUENTES, JSON.stringify(nuevo)));
    return nuevo;
  };
  const mal = async (motivo, extra = {}) => { await guardar({ ok: false, motivo, ...extra }); return { ok: false, motivo, bajados: 0, errores: [] }; };
  const parcial = async (bajados, motivo = 'parcial') => {
    await guardar({ ok: false, motivo }, anterior, { estado: 'bajando', motivo, hechas, total });
    return { ok: true, bajados, errores: [{ archivo: '', motivo }], parcial: true, hechas, total };
  };
  const bi = await bajarArchivo(indices[0].id, { bases, ruta: `${ri}.drive.part`, tope: TOPES_FUENTES.indiceBytes, senal });
  if (!bi.ok) return mal(bi.motivo);
  let r;
  try { r = revisarIndice(JSON.parse(readFileSync(`${ri}.drive.part`, 'utf8'))); } catch { r = { ok: false, motivo: 'indice_no_valido' }; }
  if (!r.ok) return mal(r.motivo);
  const indice = r.indice;
  total = indice.partes.length;
  if (anterior.archivo?.instalado === indice.sha256_total) {
    if (anterior.ok) return { ok: true, bajados: 0, errores: [], estado: anterior };
    // Instalado pero la revisión no dio bien (o el estado se perdió): se revisa otra vez lo que ya está en la carpeta.
    hechas = total;
    const estado = await guardar({ ok: true, instalado: indice.sha256_total, archivos: anterior.archivo.archivos ?? null }, { ...revisarCarpetaFuentes(dir), archivos: anterior.archivos ?? {} });
    return { ok: true, bajados: 0, errores: [], estado };
  }
  let bajados = 0;
  const faltan = [];
  for (const p of indice.partes) {
    const ruta = join(dir, 'partes', p.archivo);
    if (existsSync(ruta) && statSync(ruta).size === p.bytes && huellaArchivo(ruta) === p.sha256) hechas += 1;
    else faltan.push(p);
  }
  const libre = espacioLibre(dir);
  // Lo que falta bajar + el paquete abierto (más o menos lo mismo otra vez, y un margen).
  if (libre != null && libre < faltan.reduce((s, p) => s + p.bytes, 0) + indice.bytes_total * 3) return mal('sin_espacio');
  for (const p of faltan) {
    if (senal?.aborted || quedaMs() < 45_000) return parcial(bajados);
    const a = archivos.find(x => x.nombre === p.archivo);
    if (!a) return mal('falta_parte', { parte: p.archivo });
    const ruta = join(dir, 'partes', p.archivo);
    const b = await bajarArchivo(a.id, { bases, ruta: `${ruta}.drive.part`, tope: TOPES_FUENTES.parteBytes, senal });
    // Un corte de la red o el tiempo del paso: lo bajado se queda; se sigue en el paso siguiente.
    if (!b.ok && MOTIVOS_PASAJEROS.has(b.motivo)) return parcial(bajados, b.motivo);
    if (!b.ok || b.huella !== p.sha256 || b.bytes !== p.bytes) return mal('parte_distinta', { parte: p.archivo });
    renameSync(`${ruta}.drive.part`, ruta);
    bajados += 1;
    hechas += 1;
  }
  if (senal?.aborted || quedaMs() < RESERVA_INSTALAR_MS) return parcial(bajados, 'instalando');
  const inst = await instalarPartes(dir, indice);
  if (!inst.ok) return mal(inst.motivo);
  const estado = await guardar({ ok: true, instalado: indice.sha256_total, archivos: inst.archivos }, { ...revisarCarpetaFuentes(dir), archivos: anterior.archivos ?? {} });
  return { ok: true, bajados, errores: [], estado };
}
export async function sincronizarFuentes(db, config, { escribir, senal = null, quedaMs = () => Infinity } = {}) {
  const raiz = carpetaDrive(db);
  if (!raiz) return { ok: false, motivo: 'sin_carpeta', bajados: 0, errores: [] };
  const bases = basesDrive(config);
  const dir = carpetaFuentes(config);
  mkdirSync(join(dir, 'oral'), { recursive: true });
  // 1. Dónde está «fuentes» (hasta 2 niveles abajo); de paso se anotan los archivos de cada carpeta leída (el paquete
  // en partes puede estar en cualquiera de ellas).
  const pendientes = [{ id: raiz, nivel: 0 }];
  const vistos = [];
  let fuentes = null;
  let leidas = 0;
  while (pendientes.length && leidas < TOPES_FUENTES.carpetas) {
    const c = pendientes.shift();
    leidas += 1;
    const l = await listarCarpeta(c.id, { bases, senal });
    if (!l.ok) { if (c.nivel === 0) return { ok: false, motivo: l.motivo, bajados: 0, errores: [] }; continue; }
    for (const e of l.entradas) {
      if (!e.carpeta) { vistos.push({ ...e, sub: '' }); continue; }
      if (!fuentes && e.nombre.trim().toLowerCase() === CARPETA_EN_DRIVE) fuentes = e.id;
      else if (c.nivel < 2) pendientes.push({ id: e.id, nivel: c.nivel + 1 });
    }
  }
  // 2. Los archivos de «fuentes» (y de sus subcarpetas: «oral» va a oral/).
  const archivos = [];
  if (fuentes) {
    const l = await listarCarpeta(fuentes, { bases, senal });
    if (!l.ok) return { ok: false, motivo: l.motivo, bajados: 0, errores: [] };
    for (const e of l.entradas) {
      if (!e.carpeta) { archivos.push({ ...e, sub: '' }); continue; }
      const sub = await listarCarpeta(e.id, { bases, senal });
      const nombre = e.nombre.trim().toLowerCase() === 'oral' ? 'oral' : '';
      if (sub.ok) for (const x of sub.entradas) if (!x.carpeta) archivos.push({ ...x, sub: nombre });
    }
  }
  // 2b. El paquete en partes (fuentes-vN.json + fuentes-vN.tar.gz.partNN), en «fuentes» o en cualquier carpeta leída.
  const conPartes = [...archivos, ...vistos.filter(v => !archivos.some(a => a.id === v.id))];
  if (conPartes.some(a => INDICE_PARTES.test(a.nombre))) return sincronizarPartes(db, dir, conPartes, { bases, senal, quedaMs, escribir, anterior: estadoFuentes(db) ?? {} });
  if (!fuentes) return { ok: false, motivo: 'sin_fuentes', bajados: 0, errores: [] };
  // 3. Bajar lo nuevo.
  const anterior = estadoFuentes(db) ?? {};
  const memoria = esObjeto(anterior.archivos) ? { ...anterior.archivos } : {};
  const errores = [];
  let bajados = 0;
  for (const a of archivos.slice(0, TOPES_FUENTES.archivos)) {
    if (senal?.aborted || quedaMs() < 30_000) { errores.push({ archivo: '', motivo: 'parcial' }); break; }
    if (!NOMBRE_PERMITIDO(a.nombre)) continue;
    const enOral = a.sub === 'oral' || a.nombre === 'oral.json' || ORAL_TXT.test(a.nombre);
    const destino = join(dir, enOral ? 'oral' : '', a.nombre);
    const clave = `${enOral ? 'oral/' : ''}${a.nombre}`;
    if (memoria[clave]?.m && memoria[clave].m === a.modificado && existsSync(destino)) continue;
    const b = await bajarArchivo(a.id, { bases, ruta: `${destino}.drive.part`, tope: topeDeNombre(a.nombre), senal });
    if (!b.ok) { if (errores.length < 30) errores.push({ archivo: a.nombre, motivo: b.motivo }); continue; }
    renameSync(`${destino}.drive.part`, destino);
    memoria[clave] = { m: a.modificado ?? null, h: b.huella.slice(0, 32) };
    bajados += 1;
  }
  const revisado = revisarCarpetaFuentes(dir);
  const estado = { ...revisado, archivos: memoria, en: new Date().toISOString(), erroresDrive: errores };
  await escribir(() => guardarAjuste(db, AJUSTE_FUENTES, JSON.stringify(estado)));
  return { ok: true, bajados, errores, estado };
}
