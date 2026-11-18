#!/usr/bin/env node
// Academia 0.14.43: arma los archivos de un manual de DOMINIO PÚBLICO (los de la FAA: PHAK FAA-H-8083-25, AFH
// FAA-H-8083-3, Aviation Weather Handbook FAA-H-8083-28, AIM) para la Biblioteca, desde el PDF oficial. NO se guardan en
// el repositorio: se suben SUELTOS a la carpeta «fuentes» del Drive junto con el libro en «fuentes-manifiesto-extra.json»
// («libros»: [{ id, titulo, licencia: 'dominio_publico' }]; ver src/academia/fuentes.js, unirExtra y bajarLibrosExtra).
//
// Uso (necesita «pdftotext», de poppler-utils):
//   node scripts/libros-faa.mjs <manual.pdf> <id> "<título>" <carpeta-de-salida>
//   p. ej. node scripts/libros-faa.mjs phak.pdf faa-phak "Pilot's Handbook of Aeronautical Knowledge (FAA-H-8083-25)" salida/
// Escribe libro-<id>-capNN.txt (una marca «=== p N ===» por página del PDF, N = número de página del PDF; un archivo por
// capítulo, «Chapter N», y nunca más de 900 KB: el servidor no lee archivos de más de 1 MB) e imprime el trozo de
// «libros» para el extra con el tamaño y la huella sha256 de cada archivo.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOPE_ARCHIVO = 900 * 1024;
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

// El texto de pdftotext: una página termina con «\f». → [texto de cada página] (la última vacía se quita)
export function paginasDePdftotext(texto) {
  const paginas = String(texto).split('\f');
  if (paginas.length && !paginas.at(-1).trim()) paginas.pop();
  return paginas;
}

// Una página limpia: sin caracteres de control, sin espacios al final, como mucho un renglón en blanco seguido, y sin
// renglones que parezcan una marca de página (no se confunden con las nuestras).
export function limpiarPagina(t) {
  return String(t)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n').map(l => l.replace(/\s+$/, '')).filter(l => !/^===\s*p\s+\d+\s*===$/.test(l.trim())).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ¿Empieza un capítulo en esta página? («Chapter 3» en sus primeros renglones con texto) → número | null
export function capituloDePagina(t) {
  const primeros = String(t).split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4);
  for (const l of primeros) { const m = /^Chapter\s+(\d{1,3})$/i.exec(l); if (m) return Number(m[1]); }
  return null;
}

// Las páginas → los archivos. → [{ nombre, texto }]
export function repartirCapitulos(paginas, id, { tope = TOPE_ARCHIVO } = {}) {
  if (!ID.test(id)) throw new Error('id_no_valido');
  const archivos = [];
  let actual = null;
  const abrir = () => { actual = { partes: [], bytes: 0 }; archivos.push(actual); };
  paginas.forEach((crudo, i) => {
    const texto = limpiarPagina(crudo);
    const bloque = `=== p ${i + 1} ===\n${texto}\n`;
    const largo = Buffer.byteLength(bloque);
    if (largo > tope) throw new Error(`pagina_muy_grande:${i + 1}`);
    if (!actual || (capituloDePagina(texto) != null && actual.bytes > 0) || actual.bytes + largo > tope) abrir();
    actual.partes.push(bloque);
    actual.bytes += largo;
  });
  if (archivos.length > 999) throw new Error('demasiados_archivos');
  const ancho = archivos.length > 99 ? 3 : 2;
  return archivos.map((a, k) => ({ nombre: `libro-${id}-cap${String(k + 1).padStart(ancho, '0')}.txt`, texto: a.partes.join('') }));
}

// Lo que va en «libros» del extra, y la lista de archivos con su tamaño y huella.
export function resumen(id, titulo, archivos) {
  return {
    libro: { id, titulo, licencia: 'dominio_publico' },
    archivos: archivos.map(a => { const b = Buffer.from(a.texto); return { nombre: a.nombre, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') }; }),
  };
}

function principal(argv) {
  const [pdf, id, titulo, salida] = argv;
  if (!pdf || !id || !titulo || !salida) {
    console.error('Uso: node scripts/libros-faa.mjs <manual.pdf> <id> "<título>" <carpeta-de-salida>');
    process.exit(2);
  }
  let texto;
  try { texto = execFileSync('pdftotext', ['-enc', 'UTF-8', '-eol', 'unix', pdf, '-'], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8'); } catch (e) {
    console.error(`No se pudo leer el PDF con pdftotext (¿está instalado? apt-get install poppler-utils): ${e.message}`);
    process.exit(1);
  }
  const archivos = repartirCapitulos(paginasDePdftotext(texto), id);
  mkdirSync(salida, { recursive: true });
  for (const a of archivos) writeFileSync(join(salida, a.nombre), a.texto);
  console.log(JSON.stringify(resumen(id, titulo, archivos), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal(process.argv.slice(2));
