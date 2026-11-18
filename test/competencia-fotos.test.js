// Pruebas de la 0.14.41: las FOTOS REALES de la Competencia (Wikimedia Commons) en vez de los dibujos.
//  - Cada foto que nombra src/academia/competencia-fotos.json existe en public/competencia/fotos/, es un JPEG de 800 px
//    de ancho como máximo, pesa poco y tiene su crédito (autor, licencia permitida, página de Commons) en creditos.json.
//  - La que delataría la respuesta («revela») llega SOLO con el resultado; la otra también con la pregunta.
//  - La pantalla muestra el crédito y, si la foto no carga, vuelve al dibujo.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMILLA, RONDAS, DIBUJOS, FOTOS, fotoDe, creditosFotos, LICENCIAS_FOTOS } from '../src/academia/competencia.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = join(RAIZ, 'public', 'competencia', 'fotos');
const PREGUNTAS = new Map(RONDAS.flatMap(n => SEMILLA[n].preguntas.map(q => [q.id, { ...q, ronda: n }])));
const TOPE_FOTO = 130 * 1024;
const TOPE_TOTAL = 8 * 1024 * 1024;

// El ancho y el alto de un JPEG (el primer marcador SOF).
function medidasJpeg(b) {
  assert.ok(b[0] === 0xff && b[1] === 0xd8, 'no es un JPEG');
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('JPEG sin medidas');
}

test('al menos 60 preguntas tienen foto real; cada una existe, es chica, de 800 px como máximo y con su crédito permitido', () => {
  const mapa = Object.entries(FOTOS.mapa);
  assert.ok(mapa.length >= 60, `solo ${mapa.length} preguntas con foto`);
  for (const [id, m] of mapa) {
    assert.ok(PREGUNTAS.has(id), `${id}: no es una pregunta de la Competencia`);
    assert.deepEqual(Object.keys(m).sort(), ['foto', 'revela']);
    assert.equal(typeof m.revela, 'boolean', id);
    assert.ok(FOTOS.creditos[m.foto], `${id}: ${m.foto} sin crédito`);
  }
  const archivos = readdirSync(CARPETA).filter(n => n !== 'creditos.json').sort();
  // Ninguna foto sin crédito ni crédito sin foto; ninguna foto que no use nadie.
  assert.deepEqual(archivos, Object.keys(FOTOS.creditos).sort());
  const usadas = new Set(mapa.map(([, m]) => m.foto));
  for (const a of archivos) assert.ok(usadas.has(a), `${a} no la usa ninguna pregunta`);
  let total = 0;
  for (const [archivo, c] of Object.entries(FOTOS.creditos)) {
    assert.match(archivo, /^[a-z0-9-]+\.jpg$/);
    const b = readFileSync(join(CARPETA, archivo));
    total += b.length;
    assert.ok(b.length <= TOPE_FOTO, `${archivo} pesa ${b.length} bytes`);
    assert.ok(b.length >= 15 * 1024, `${archivo} demasiado chica (${b.length} bytes)`);
    const { ancho, alto } = medidasJpeg(b);
    assert.ok(ancho <= 800, `${archivo}: ${ancho} px de ancho`);
    assert.deepEqual({ ancho, alto }, { ancho: c.ancho, alto: c.alto }, `${archivo}: medidas distintas en creditos.json`);
    // Crédito completo y con una licencia que permite redistribuir con atribución (nunca NC ni ND).
    assert.match(c.licencia, LICENCIAS_FOTOS, `${archivo}: licencia ${c.licencia}`);
    assert.doesNotMatch(c.licencia, /NC|ND/);
    assert.ok(c.autor && c.autor.length <= 120 && !/[<>]/.test(c.autor), `${archivo}: autor`);
    assert.ok(c.titulo && c.titulo.length <= 90, `${archivo}: título`);
    assert.match(c.fuente, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s]+$/, `${archivo}: fuente`);
    if (c.licencia !== 'Public domain') assert.match(c.licenciaUrl ?? '', /^https:\/\/creativecommons\.org\//, `${archivo}: enlace de la licencia`);
  }
  assert.ok(total <= TOPE_TOTAL, `las fotos pesan ${total} bytes`);
  assert.ok(statSync(join(CARPETA, 'creditos.json')).size < 64 * 1024);
});

test('creditos.json es público: solo dice archivo, autor, licencia y página, nunca la pregunta ni si revela', () => {
  const texto = readFileSync(join(CARPETA, 'creditos.json'), 'utf8');
  assert.doesNotMatch(texto, /\br[1-6]-\d\d\b|revela|correcta/);
  const j = JSON.parse(texto);
  for (const c of Object.values(j.fotos)) assert.deepEqual(Object.keys(c).sort(), ['alto', 'ancho', 'autor', 'fuente', 'licencia', 'licenciaUrl', 'titulo'].filter(k => k in c).sort());
  // La página de créditos las lista todas.
  assert.equal(creditosFotos().length, Object.keys(j.fotos).length);
});

test('la foto que revela la respuesta llega solo después de responder; la otra también con la pregunta (sin título ni enlace)', () => {
  let antes = 0;
  let despues = 0;
  for (const [id, m] of Object.entries(FOTOS.mapa)) {
    const pregunta = fotoDe(id);
    const resultado = fotoDe(id, { despues: true });
    assert.ok(resultado, id);
    assert.equal(resultado.src, `/competencia/fotos/${m.foto}`);
    assert.ok(resultado.titulo && resultado.fuente && resultado.autor && resultado.licencia);
    if (m.revela) { assert.equal(pregunta, null, `${id}: la foto delata la respuesta y se manda con la pregunta`); despues++; } else {
      assert.deepEqual(Object.keys(pregunta).sort(), ['alto', 'ancho', 'autor', 'licencia', 'src']);
      antes++;
    }
  }
  assert.ok(antes >= 15 && despues >= 30, `${antes} con la pregunta, ${despues} solo después`);
  // Una pregunta sin foto sigue con su dibujo.
  const sinFoto = [...PREGUNTAS.keys()].filter(id => !FOTOS.mapa[id]);
  for (const id of sinFoto) { assert.equal(fotoDe(id, { despues: true }), null); assert.ok(DIBUJOS.includes(PREGUNTAS.get(id).dibujo)); }
  // El nombre del archivo que se ve con la pregunta no trae la respuesta.
  for (const [id, m] of Object.entries(FOTOS.mapa)) {
    if (m.revela) continue;
    const q = PREGUNTAS.get(id);
    const buena = q.opciones[q.correcta].toLowerCase();
    assert.ok(!buena.includes(m.foto.replace(/\.jpg$/, '').replace(/-/g, ' ')), `${id}: ${m.foto}`);
  }
});

// ---------- La pantalla, con un documento de mentira ----------
function nodo(etiqueta) {
  const n = {
    etiqueta, atributos: {}, hijos: [], textContent: '', escuchas: {}, clases: new Set(),
    setAttribute(k, v) { this.atributos[k] = String(v); if (k === 'class') this.clases = new Set(String(v).split(/\s+/)); },
    getAttribute(k) { return this.atributos[k] ?? null; },
    append(...h) { this.hijos.push(...h.map(x => (typeof x === 'string' ? { etiqueta: '#texto', textContent: x, hijos: [] } : x))); },
    replaceChildren(...h) { this.hijos = []; this.append(...h); },
    addEventListener(ev, fn) { (this.escuchas[ev] ??= []).push(fn); },
    get classList() { return { add: c => n.clases.add(c), contains: c => n.clases.has(c), toggle() {} }; },
  };
  return n;
}
globalThis.document = { createElement: nodo, createElementNS: (_, e) => nodo(e) };
const { figuraFoto } = await import('../public/competencia-vista.js');
function el(etiqueta, propiedades = {}, ...hijos) {
  const n = nodo(etiqueta);
  for (const [k, v] of Object.entries(propiedades)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'texto') n.textContent = v;
    else n.setAttribute(k, v);
  }
  n.append(...hijos.flat(Infinity).filter(x => x != null && x !== false));
  return n;
}
const ES = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const t = (k, v = {}) => (ES[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const textos = n => [n.textContent, ...(n.hijos ?? []).flatMap(textos)].filter(Boolean).join('');
const buscar = (n, etiqueta) => (n.etiqueta === etiqueta ? [n] : []).concat(...(n.hijos ?? []).map(h => buscar(h, etiqueta)));

test('la pantalla: la foto con su crédito «Foto: Autor · Licencia · Wikimedia Commons» y, si no carga, el dibujo', () => {
  const [id] = Object.entries(FOTOS.mapa).find(([, m]) => m.revela);
  const foto = fotoDe(id, { despues: true });
  const caja = figuraFoto(foto, PREGUNTAS.get(id).dibujo, { el, t });
  const [img] = buscar(caja, 'img');
  assert.equal(img.atributos.src, foto.src);
  assert.equal(img.atributos.width, String(foto.ancho));
  assert.equal(img.atributos.height, String(foto.alto));
  assert.equal(img.atributos.alt, `Foto: ${foto.titulo}`);
  const [credito] = buscar(caja, 'figcaption');
  assert.equal(textos(credito), `Foto: ${foto.autor} · ${foto.licencia} · Wikimedia Commons`);
  const [enlace] = buscar(credito, 'a');
  assert.equal(enlace.atributos.href, foto.fuente);
  assert.equal(enlace.atributos.rel, 'noopener noreferrer');
  // Con la pregunta: sin título (el alt no dice qué es) ni enlace.
  const [idAntes] = Object.entries(FOTOS.mapa).find(([, m]) => !m.revela);
  const chica = figuraFoto(fotoDe(idAntes), PREGUNTAS.get(idAntes).dibujo, { el, t }, { chica: true });
  assert.ok(chica.clases.has('chica'));
  assert.equal(buscar(chica, 'img')[0].atributos.alt, 'Foto de la pregunta');
  assert.equal(buscar(chica, 'a').length, 0);
  assert.match(textos(buscar(chica, 'figcaption')[0]), /^Foto: .+ · .+ · Wikimedia Commons$/);
  // La foto no carga: queda el dibujo (y no un crédito suelto).
  for (const fn of img.escuchas.error) fn();
  assert.ok(caja.clases.has('sin-foto'));
  assert.equal(buscar(caja, 'img').length, 0);
  assert.equal(buscar(caja, 'figcaption').length, 0);
  assert.equal(buscar(caja, 'svg').length, 1);
});

test('el código de la pantalla de la Competencia: foto en la pregunta y en el resultado, créditos, y el certificado arriba al terminar', () => {
  const vista = readFileSync(join(RAIZ, 'public', 'competencia-vista.js'), 'utf8');
  assert.match(vista, /imagen\(q\.foto, q\.dibujo, h, \{ chica: true \}\)/);
  assert.match(vista, /r\.foto \? el\('div', \{ class: 'compe-foto-resultado' \}, figuraFoto\(r\.foto/);
  assert.match(vista, /export function pantallaFotos/);
  // Al terminar: la frase grande y el certificado (con «Descargar») antes de la tabla.
  const fin = vista.slice(vista.indexOf('async function terminada'), vista.indexOf('async function recargar'));
  assert.ok(fin.indexOf('compe-fin-frase') > 0 && fin.indexOf('tarjetaCertificado(cert, h)') < fin.indexOf("t('compe.tabla.ronda')"));
  assert.match(vista, /h\.botonAccion\(t\('cert\.descargar'\)/);
  const app = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  const piezas = app.match(/const piezasCompe = vigente => \(\{([^}]*)\}\)/)[1];
  assert.match(piezas, /\bbotonAccion\b/);
  assert.match(piezas, /\bcaja\b/);
  assert.match(app, /if \(seccion === 'competencia\/fotos'\) return pantallaFotosCompe\(\);/);
  for (const k of ['compe.foto.credito', 'compe.foto.commons', 'compe.foto.alt', 'compe.foto.alt_pregunta', 'compe.fotos.titulo', 'compe.fotos.linea', 'compe.fotos.cambios', 'compe.fotos.autor', 'compe.fotos.ver']) {
    for (const idioma of ['es', 'en']) assert.ok(JSON.parse(readFileSync(join(RAIZ, `public/i18n/${idioma}.json`), 'utf8'))[k], `${idioma}: ${k}`);
  }
});
