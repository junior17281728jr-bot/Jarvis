// Pruebas de la 0.12.1: firmar por pasos («1 Tus datos → 2 Lee → 3 Firma → 4 Listo»). La lógica pura de la pantalla
// (public/terminos-vista.js) y que cada texto de los pasos, del resumen y del documento exista en los dos idiomas. Lo del
// servidor (POST /api/yo/terminos, los contratos) no cambia: lo prueban test/legal*.test.js y test/terminos-privacidad.test.js.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASOS_FIRMA, RESUMEN_FIRMA, FIRMA_BYTES, indiceDe, progresoLectura, lecturaCompleta, parteValida, edad } from '../public/terminos-vista.js';
import { TERMINOS_V1, PRIVACIDAD_V1, FIRMA_MAXIMA } from '../src/cuentas/terminos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const idioma = l => JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', `${l}.json`), 'utf8'));

test('firma 0.12.1: cuatro pasos en orden, cada uno con su nombre, su título, qué pasa ahora y qué viene (es y en)', () => {
  assert.deepEqual(PASOS_FIRMA, ['datos', 'lee', 'firma', 'listo']);
  for (const l of ['es', 'en']) {
    const d = idioma(l);
    for (const p of PASOS_FIRMA) {
      for (const k of [`firma.paso.${p}`, `firma.${p}.titulo`, `firma.${p}.linea`, ...(p === 'listo' ? [] : [`firma.${p}.despues`])]) assert.ok(d[k], `${l}: falta ${k}`);
    }
    assert.match(d['firma.paso.de'], /\{n\}.*\{total\}/);
    assert.match(d['firma.firma.yo'], /\{nombre\}/);
    assert.ok(d['firma.listo.copia'] && d['lee.bajar'] && d['lee.indice'] && d['firma.deshacer'] && d['firma.aqui']);
  }
});

test('firma 0.12.1: «Lo importante en 1 minuto» tiene 6 a 8 puntos y dice lo que le afecta (no oficial, errores, pagos, datos, firma, menores)', () => {
  assert.ok(RESUMEN_FIRMA.length >= 6 && RESUMEN_FIRMA.length <= 8);
  for (const k of ['que_es', 'no_oficial', 'errores', 'pagos', 'datos', 'quien_ve', 'firma', 'menores']) assert.ok(RESUMEN_FIRMA.includes(k), k);
  for (const l of ['es', 'en']) {
    const d = idioma(l);
    for (const k of RESUMEN_FIRMA) {
      assert.ok(d[`lee.resumen.${k}`] && d[`lee.resumen.${k}.texto`], `${l}: ${k}`);
      assert.ok(d[`lee.resumen.${k}.texto`].length <= 160, `${l}: ${k} es corto`);
    }
  }
  const es = idioma('es');
  assert.match(es['lee.resumen.no_oficial.texto'], /no te garantiza aprobar/);
  assert.match(es['lee.resumen.pagos.texto'], /gratis/);
  assert.match(es['lee.resumen.pagos.texto'], /inteligencia artificial/);
  assert.match(es['lee.resumen.menores.texto'], /tutor/);
  assert.match(es['lee.resumen.nota'], /texto completo/, 'el resumen no reemplaza al texto');
});

test('firma 0.12.1: el índice tiene un ancla por parte de los dos textos (los de verdad), sin repetir', () => {
  const i = indiceDe([{ doc: 'terminos', texto: { secciones: TERMINOS_V1 } }, { doc: 'privacidad', texto: { secciones: PRIVACIDAD_V1 } }]);
  assert.equal(i.length, TERMINOS_V1.length + PRIVACIDAD_V1.length);
  assert.equal(new Set(i.map(x => x.id)).size, i.length);
  assert.deepEqual(i[0], { doc: 'terminos', i: 0, id: 'lee-terminos-1', titulo: TERMINOS_V1[0].titulo });
  assert.equal(i.at(-1).id, `lee-privacidad-${PRIVACIDAD_V1.length}`);
  assert.deepEqual(indiceDe([{ doc: 'x', texto: null }]), []);
});

test('firma 0.12.1: la barra de lectura y cuándo se pueden marcar las casillas', () => {
  assert.equal(progresoLectura({ arriba: 800, alto: 4000, ventana: 800 }), 0, 'todavía no empieza');
  assert.equal(progresoLectura({ arriba: -1200, alto: 4000, ventana: 800 }), 0.5);
  assert.equal(progresoLectura({ arriba: -5000, alto: 4000, ventana: 800 }), 1);
  assert.equal(progresoLectura({ arriba: 0, alto: 0, ventana: 800 }), 1);
  assert.equal(lecturaCompleta(), false);
  assert.equal(lecturaCompleta({ alFinal: true }), true);
  assert.equal(lecturaCompleta({ abiertas: 15, total: 16 }), false);
  assert.equal(lecturaCompleta({ abiertas: 16, total: 16 }), true);
  assert.equal(lecturaCompleta({ abiertas: 0, total: 0 }), false);
});

test('firma 0.12.1: la pantalla manda al servidor lo mismo de siempre y solo deja marcar después de leer', () => {
  const codigo = readFileSync(join(RAIZ, 'public', 'terminos-vista.js'), 'utf8');
  const enviar = codigo.slice(codigo.indexOf("h.api('POST', '/api/yo/terminos'"), codigo.indexOf('paso4(r.datos.estado)'));
  for (const campo of ['version: datos.terminos.version', 'versionPrivacidad: datos.privacidad.version', 'nombre: s.nombre', 'apellido: s.apellido', 'nacimiento: s.nacimiento',
    'acepto: c1.c.checked', 'aceptoPrivacidad: c2.c.checked', 'aceptoIa: c3.c.checked', 'firma: pad.png()', 'tutor: {']) assert.ok(enviar.includes(campo), campo);
  // Las casillas empiezan apagadas hasta llegar al final (o abrir cada parte); «Seguir a firmar» pide las dos obligatorias.
  assert.match(codigo, /x\.c\.disabled = !leido/);
  assert.match(codigo, /seguir\.disabled = !\(leido && c1\.c\.checked && c2\.c\.checked\)/);
  // El renglón y «Firma aquí» no se dibujan en el lienzo (no salen en la imagen que se guarda).
  const pad = codigo.slice(codigo.indexOf('export function padFirma'), codigo.indexOf('export function edad'));
  assert.doesNotMatch(pad, /fillText|firma\.aqui'\)\s*\)/);
  assert.match(pad, /trazos\.pop\(\)/, 'Deshacer quita el último trazo');
  // La firma grande (720 × 240) siempre cabe en el tope del servidor: si pesa más, se guarda más chica.
  assert.ok(FIRMA_BYTES < FIRMA_MAXIMA);
  assert.match(codigo, /png: \(\) => pngChico\(lienzo\)/);
  assert.match(codigo, /for \(const ancho of \[480, 360, 240\]\)/);
  assert.doesNotMatch(codigo, /innerHTML/);
  // Lo de siempre sigue igual.
  assert.equal(parteValida('  Ana   María '), 'Ana María');
  assert.equal(edad('2010-06-15', '2026-06-14'), 15);
});
