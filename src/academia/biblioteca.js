// Academia 0.14.20: la «Biblioteca» (leer los libros de las fuentes dentro de la app, página por página, con índice y
// búsqueda) y «Ver en el Test Guide» (la pregunta oficial TAL CUAL, con su número, capítulo, referencia y figura).
//
// De dónde sale: SOLO de las fuentes privadas instaladas en el servidor (academia/fabrica/fuentes/, ver
// src/academia/fuentes.js): libro-<id>-capNN.txt con marcas «=== p N ===», el manifiesto (títulos de los libros y temas)
// e imagenes.json con los img-*.webp. Nada de esto vive en el repositorio ni se sirve sin sesión.
//
// DERECHOS DE AUTOR (pedido del dueño): solo se publican libros que son publicaciones del gobierno de dominio público
// (los manuales de la FAA y el Reglamento Aeronáutico Dominicano, RAD). Cada libro tiene su interruptor (el
// administrador), con este punto de partida:
//  - «publico» (encendido): el manifiesto dice licencia «dominio_publico», o el id/título es de la FAA o del RAD.
//  - «comercial» (apagado y SIN interruptor: «libro comercial: no se puede publicar completo»): el manifiesto dice
//    licencia «comercial», el id/título es de una editorial o de la Guía del examen oral, o el texto del libro nombra a
//    una editorial (Jeppesen, GFDPPM…). Aunque alguien escriba el ajuste a mano, se rechaza igual (lo decide
//    libroLegible, que usan TODAS las rutas).
//  - «dudoso» (apagado; el administrador lo puede encender): todo lo demás.
//
// Memoria (servidor de 512 MB): nunca un libro entero por pedido. Un índice chico por libro (página → archivo y bytes)
// se arma una vez y se guarda mientras los archivos no cambien (tamaño y fecha); una página se lee por sus bytes; la
// búsqueda va línea por línea (readline) y para al llegar al tope.
import { openSync, readSync, closeSync, statSync, readFileSync, readdirSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { ErrorHttp } from '../nucleo/http.js';
import { carpetaFuentes, leerManifiesto, preguntasDeTema, ARCHIVO_MANIFIESTO, ARCHIVO_TG, ARCHIVO_IMAGENES, IMAGEN_LIBRO, TOPES_FUENTES, ID_TG } from './fuentes.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';

export const AJUSTE_BIBLIOTECA = 'academia.biblioteca.libros';
export const TOPES_BIBLIOTECA = Object.freeze({ consultaMin: 3, consultaMax: 80, resultados: 30, porPagina: 3, fragmento: 180, paginaBytes: 256 * 1024 });
export const CLASES = Object.freeze(['publico', 'dudoso', 'comercial']);

// ---------- Clasificar un libro (puro) ----------
const NOMBRE_COMERCIAL = /jeppesen|\bgfd|guided flight|oral|exam guide|gleim|\basa\b|king schools|sporty/i;
const TEXTO_COMERCIAL = /jeppesen|gfdppm|guided flight discovery|all rights reserved|todos los derechos reservados/i;
const NOMBRE_FAA = /\bfaa\b|faa-h-|handbook|\bphak\b|\bafh\b|aeronautical information manual/i;
const NOMBRE_RAD = /reglamento aeron[aá]utico|\brad\b/i;
// libro: { id, titulo, licencia? }; textoComercial: si su texto nombra a una editorial. → 'publico' | 'dudoso' | 'comercial'
export function clasificarLibro(libro, { textoComercial = false, oral = false } = {}) {
  const id = String(libro?.id ?? '');
  const titulo = String(libro?.titulo ?? '');
  if (oral || libro?.licencia === 'comercial' || /^oral(?:-|$)/.test(id) || NOMBRE_COMERCIAL.test(id) || NOMBRE_COMERCIAL.test(titulo) || textoComercial) return 'comercial';
  if (libro?.licencia === 'dominio_publico' || /^(?:faa|rad)(?:-|$)/.test(id) || NOMBRE_FAA.test(titulo) || NOMBRE_RAD.test(titulo)) return 'publico';
  return 'dudoso';
}

// ---------- Las páginas de un capítulo, por bytes (sin guardar el texto) ----------
// buffer: el archivo. → { paginas: [{ pagina, inicio, fin }], titulo, comercial }
const MARCA = /^===\s*p\s+(\d{1,5})\s*===\s*$/;
export function indiceDeCapitulo(buffer) {
  const paginas = [];
  let actual = null;
  let comercial = false;
  const primeras = [];
  let titulado = false; // el título: los renglones del primer párrafo de la primera página (hasta 3)
  let desde = 0;
  while (desde < buffer.length) {
    let fin = buffer.indexOf(10, desde);
    if (fin < 0) fin = buffer.length;
    const linea = buffer.toString('utf8', desde, fin).replace(/\r$/, '');
    const m = MARCA.exec(linea);
    if (m) {
      if (actual) actual.fin = desde;
      actual = { pagina: Number(m[1]), inicio: Math.min(fin + 1, buffer.length), fin: buffer.length };
      paginas.push(actual);
    } else {
      if (!comercial && TEXTO_COMERCIAL.test(linea)) comercial = true;
      const limpia = linea.trim();
      if (paginas.length === 1 && !titulado) {
        if (!limpia) titulado = primeras.length > 0;
        else if (!/^\[[^\]]{1,40}\]$/.test(limpia)) { primeras.push(limpia); titulado = primeras.length >= 3; }
      }
    }
    desde = fin + 1;
  }
  const titulo = primeras.join(' · ').slice(0, 90) || null;
  return { paginas, titulo, comercial };
}

// ---------- El índice de las fuentes (en memoria, mientras no cambien) ----------
const cache = new Map(); // dir → { firma, datos }
const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firmaDe = (dir, nombres) => nombres.map(n => { try { const s = statSync(join(dir, n)); return `${n}:${s.size}:${s.mtimeMs}`; } catch { return `${n}:-`; } }).join('|');

export function indiceBiblioteca(dir) {
  let nombres;
  try { nombres = readdirSync(dir).filter(n => /^libro-.+\.txt$/.test(n) || n === ARCHIVO_MANIFIESTO || n === ARCHIVO_IMAGENES).sort(); } catch { return { libros: [] }; }
  const oralJson = join(dir, 'oral', 'oral.json');
  const firma = `${firmaDe(dir, nombres)}|oral:${existsSync(oralJson)}`;
  const guardado = cache.get(dir);
  if (guardado?.firma === firma) return guardado.datos;
  const datos = armarIndice(dir, nombres);
  cache.set(dir, { firma, datos });
  return datos;
}

function armarIndice(dir, nombres) {
  const manifiesto = leerManifiesto(dir);
  const libros = [];
  let imagenes = [];
  try { if (statSync(join(dir, ARCHIVO_IMAGENES)).size <= TOPES_FUENTES.jsonBytes) imagenes = JSON.parse(readFileSync(join(dir, ARCHIVO_IMAGENES), 'utf8')); } catch { imagenes = []; }
  if (!Array.isArray(imagenes)) imagenes = [];
  for (const l of Array.isArray(manifiesto?.libros) ? manifiesto.libros : []) {
    if (!l || typeof l.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(l.id)) continue;
    const patron = new RegExp(`^libro-${escapar(l.id)}-cap(\\d{2,3})\\.txt$`);
    const capitulos = [];
    const paginas = new Map();
    let textoComercial = false;
    for (const n of nombres) {
      const m = patron.exec(n);
      if (!m) continue;
      let buffer;
      try { if (statSync(join(dir, n)).size > TOPES_FUENTES.txtBytes) continue; buffer = readFileSync(join(dir, n)); } catch { continue; }
      const ind = indiceDeCapitulo(buffer);
      buffer = null;
      if (ind.comercial) textoComercial = true;
      if (!ind.paginas.length) continue;
      for (const p of ind.paginas) if (!paginas.has(p.pagina)) paginas.set(p.pagina, { archivo: n, inicio: p.inicio, fin: p.fin });
      const nums = ind.paginas.map(p => p.pagina);
      capitulos.push({ archivo: n, n: Number(m[1]), titulo: ind.titulo, desde: Math.min(...nums), hasta: Math.max(...nums) });
    }
    capitulos.sort((a, b) => a.desde - b.desde);
    const orden = [...paginas.keys()].sort((a, b) => a - b);
    const fotos = new Map();
    for (const x of imagenes) {
      if (!x || x.libro !== l.id || typeof x.archivo !== 'string' || !IMAGEN_LIBRO.test(x.archivo) || !Number.isSafeInteger(x.pagina)) continue;
      if (!existsSync(join(dir, x.archivo))) continue;
      if (!fotos.has(x.pagina)) fotos.set(x.pagina, []);
      fotos.get(x.pagina).push({ archivo: x.archivo, pie: typeof x.pie === 'string' ? x.pie.slice(0, 400) : null, ancho: Number(x.ancho) || null, alto: Number(x.alto) || null });
    }
    const temas = [];
    for (const mat of Array.isArray(manifiesto?.materias) ? manifiesto.materias : []) for (const t of mat?.temas ?? []) {
      const desde = (t?.lecturas ?? []).filter(x => x?.libro === l.id && Number.isSafeInteger(x.desde)).map(x => x.desde);
      if (desde.length && typeof t.titulo === 'string') temas.push({ titulo: t.titulo, materia: typeof mat.nombre === 'string' ? mat.nombre : mat.id, pagina: Math.min(...desde) });
    }
    temas.sort((a, b) => a.pagina - b.pagina);
    libros.push({
      id: l.id, titulo: typeof l.titulo === 'string' ? l.titulo : l.id, licencia: l.licencia ?? null,
      clase: clasificarLibro(l, { textoComercial }), capitulos, paginas, orden, fotos, temas,
    });
  }
  // La Guía del examen oral (oral/oral.json) es comercial: sale en la lista del administrador, nunca se lee aquí.
  try {
    const st = statSync(join(dir, 'oral', 'oral.json'));
    if (st.size <= TOPES_FUENTES.jsonBytes) {
      const o = JSON.parse(readFileSync(join(dir, 'oral', 'oral.json'), 'utf8'));
      const id = typeof o?.libro?.id === 'string' ? o.libro.id : 'oral';
      if (!libros.some(x => x.id === id)) libros.push({ id, titulo: typeof o?.libro?.titulo === 'string' ? o.libro.titulo : id, licencia: 'comercial', clase: 'comercial', capitulos: [], paginas: new Map(), orden: [], fotos: new Map(), temas: [], oral: true });
    }
  } catch { /* sin oral */ }
  return { libros };
}

// ---------- El interruptor de cada libro ----------
function ajustesDe(db) {
  try { const v = JSON.parse(leerAjuste(db, AJUSTE_BIBLIOTECA) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
// Lo único que decide si un libro se puede leer: nunca uno comercial, aunque el ajuste diga que sí.
export function estaPermitido(libro, ajustes) {
  if (!libro || libro.clase === 'comercial' || libro.oral || !libro.orden.length) return false;
  const v = ajustes[libro.id];
  return typeof v === 'boolean' ? v : libro.clase === 'publico';
}
const resumenLibro = l => ({ id: l.id, titulo: l.titulo, paginas: l.orden.length, desde: l.orden[0] ?? null, hasta: l.orden.at(-1) ?? null });

// Para el administrador: todos, con su clase y si se puede cambiar.
export function librosParaAdmin(db, config) {
  const ind = indiceBiblioteca(carpetaFuentes(config));
  const ajustes = ajustesDe(db);
  return ind.libros.map(l => ({ ...resumenLibro(l), clase: l.clase, permitido: estaPermitido(l, ajustes), bloqueado: l.clase === 'comercial', porDefecto: l.clase === 'publico' }));
}
export function cambiarLibro(db, config, id, permitido) {
  if (typeof permitido !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  const l = indiceBiblioteca(carpetaFuentes(config)).libros.find(x => x.id === id);
  if (!l) throw new ErrorHttp(404, 'no_existe');
  if (l.clase === 'comercial') throw new ErrorHttp(400, 'libro_comercial');
  const ajustes = ajustesDe(db);
  ajustes[id] = permitido;
  guardarAjuste(db, AJUSTE_BIBLIOTECA, JSON.stringify(ajustes));
  return librosParaAdmin(db, config);
}

// Para el alumno: solo los que se pueden leer.
export function librosLegibles(db, config) {
  const ajustes = ajustesDe(db);
  return indiceBiblioteca(carpetaFuentes(config)).libros.filter(l => estaPermitido(l, ajustes));
}
export function libroLegible(db, config, id) {
  const l = librosLegibles(db, config).find(x => x.id === id);
  if (!l) throw new ErrorHttp(404, 'libro_no_disponible');
  return l;
}
export const listaBiblioteca = (db, config) => ({ libros: librosLegibles(db, config).map(resumenLibro) });

// El índice de un libro: capítulos (con sus páginas) y los temas del curso que se leen en él.
export function indiceDeLibro(db, config, id) {
  const l = libroLegible(db, config, id);
  return { ...resumenLibro(l), capitulos: l.capitulos.map(c => ({ n: c.n, titulo: c.titulo, desde: c.desde, hasta: c.hasta })), temas: l.temas };
}

// Una página (o la siguiente que exista, si esa no está). → { libro, titulo, pagina, texto, anterior, siguiente, capitulo, imagenes }
export function paginaDeLibro(db, config, id, n) {
  const l = libroLegible(db, config, id);
  const pedida = Number(n);
  if (!Number.isSafeInteger(pedida) || pedida < 0) throw new ErrorHttp(400, 'pagina_no_valida');
  let i = l.orden.findIndex(p => p >= pedida);
  if (i < 0) i = l.orden.length - 1;
  const pagina = l.orden[i];
  const donde = l.paginas.get(pagina);
  const largo = Math.min(Math.max(0, donde.fin - donde.inicio), TOPES_BIBLIOTECA.paginaBytes);
  const buffer = Buffer.alloc(largo);
  if (largo) {
    const fd = openSync(join(carpetaFuentes(config), donde.archivo), 'r');
    try { readSync(fd, buffer, 0, largo, donde.inicio); } finally { closeSync(fd); }
  }
  const cap = l.capitulos.find(c => c.archivo === donde.archivo);
  return {
    libro: l.id, titulo: l.titulo, pagina, pedida, texto: buffer.toString('utf8').trim(),
    anterior: i > 0 ? l.orden[i - 1] : null, siguiente: i < l.orden.length - 1 ? l.orden[i + 1] : null,
    posicion: i + 1, total: l.orden.length,
    capitulo: cap ? { n: cap.n, titulo: cap.titulo, desde: cap.desde, hasta: cap.hasta } : null,
    imagenes: (l.fotos.get(pagina) ?? []).map(x => ({ ...x })),
  };
}

// Una imagen de un libro legible: solo por su nombre en imagenes.json (nunca una ruta armada con lo que llega).
export function imagenDeLibro(db, config, id, archivo) {
  const l = libroLegible(db, config, id);
  for (const lista of l.fotos.values()) {
    const x = lista.find(f => f.archivo === archivo);
    if (!x) continue;
    const ruta = join(carpetaFuentes(config), x.archivo);
    const st = statSync(ruta);
    if (!st.isFile() || st.size > TOPES_FUENTES.imagenBytes * 4) break;
    const ext = x.archivo.toLowerCase().split('.').pop();
    return { ruta, bytes: st.size, tipo: ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg' };
  }
  throw new ErrorHttp(404, 'no_existe');
}

// ---------- Buscar (línea por línea, con tope) ----------
export const normalizar = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
export async function buscarEnLibro(db, config, id, consulta) {
  const l = libroLegible(db, config, id);
  const q = normalizar(String(consulta ?? '')).trim();
  if (q.length < TOPES_BIBLIOTECA.consultaMin || q.length > TOPES_BIBLIOTECA.consultaMax) throw new ErrorHttp(400, 'busqueda_no_valida');
  const resultados = [];
  const porPagina = new Map();
  let mas = false;
  const dir = carpetaFuentes(config);
  for (const c of l.capitulos) {
    if (mas) break;
    const flujo = createReadStream(join(dir, c.archivo), { encoding: 'utf8', highWaterMark: 64 * 1024 });
    const lineas = createInterface({ input: flujo, crlfDelay: Infinity });
    let pagina = null;
    try {
      for await (const linea of lineas) {
        const m = MARCA.exec(linea);
        if (m) { pagina = Number(m[1]); continue; }
        if (pagina == null) continue;
        const nl = normalizar(linea);
        const donde = nl.indexOf(q);
        if (donde < 0) continue;
        const ya = porPagina.get(pagina) ?? 0;
        if (ya >= TOPES_BIBLIOTECA.porPagina) continue;
        if (resultados.length >= TOPES_BIBLIOTECA.resultados) { mas = true; break; }
        porPagina.set(pagina, ya + 1);
        resultados.push({ pagina, fragmento: fragmento(linea.trim(), donde / Math.max(1, nl.length)) });
      }
    } finally { lineas.close(); flujo.destroy(); }
  }
  return { libro: l.id, consulta: String(consulta).trim(), resultados, mas };
}
function fragmento(linea, posicion) {
  const max = TOPES_BIBLIOTECA.fragmento;
  if (linea.length <= max) return linea;
  const centro = Math.round(posicion * linea.length);
  const inicio = Math.max(0, Math.min(linea.length - max, centro - Math.floor(max / 3)));
  return `${inicio > 0 ? '…' : ''}${linea.slice(inicio, inicio + max)}${inicio + max < linea.length ? '…' : ''}`;
}

// ---------- «Ver en el Test Guide» ----------
// La pregunta del Test Guide TAL CUAL desde las fuentes instaladas (tg/<materia>/<tema>.json, o tg.json si no): la
// app la copia byte a byte, pero si alguna vez difieren manda el Test Guide. null si no está en las fuentes.
export function preguntaDelTestGuide(config, idTg, lugar = null) {
  if (typeof idTg !== 'string' || !ID_TG.test(idTg)) return null;
  const dir = carpetaFuentes(config);
  if (lugar?.materia && lugar?.tema) {
    const q = (preguntasDeTema(dir, lugar.materia, lugar.tema) ?? []).find(x => x?.id === idTg);
    if (q) return q;
  }
  try {
    if (statSync(join(dir, ARCHIVO_TG)).size > TOPES_FUENTES.jsonBytes) return null;
    return (JSON.parse(readFileSync(join(dir, ARCHIVO_TG), 'utf8')).preguntas ?? []).find(x => x?.id === idTg) ?? null;
  } catch { return null; }
}
