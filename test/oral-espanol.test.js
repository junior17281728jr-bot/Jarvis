// 0.14.3 (pedido del dueño): el examen oral en ESPAÑOL. Los paquetes orales pueden traer, opcionales, la pregunta y la
// respuesta del libro en español (libro_qa: pregunta_es / respuesta_es, y un dibujo «visual»; adicionales: pregunta_es) y,
// en las de opción múltiple (ya en español), su versión en inglés (enunciado_en / opciones_en). El inglés del libro sigue
// TAL CUAL. Aquí: el formato los acepta y rechaza bien, el servidor los manda (la clase, practicar, los exámenes, el
// «Repaso final») sin mostrar nunca una respuesta antes de tiempo, y la pantalla del idioma sigue las reglas de siempre.
// Paquetes de MUESTRA (todo inventado: test/oral-muestra.js y test/academia-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { tarjetasOral } from '../src/academia/repaso-final.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';

const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';

// La muestra con español (inventado) en el primer tema: las 2 preguntas del libro, su pregunta para practicar en voz alta
// y la versión en inglés de la primera pregunta de opción múltiple. La segunda pregunta del libro queda sin respuesta en
// español (se ve en inglés con «Aún sin traducir»).
function muestraEnEspanol() {
  const p = paqueteOralMuestra();
  const t = p.materias[0].temas[0];
  t.libro_qa[0].pregunta_es = '¿A quién puede llevar un piloto privado de la muestra?';
  t.libro_qa[0].respuesta_es = 'Un piloto privado de la muestra puede llevar amigos, pero nunca por pago.';
  t.libro_qa[0].visual = { tipo: 'diagrama-pasos', parametros: { elementos: [{ nombre: 'Amigos' }, { nombre: 'Sin pago' }] } };
  t.libro_qa[1].pregunta_es = '¿Cada cuánto debe volar con un instructor un piloto de la muestra?';
  t.adicionales[0].pregunta_es = 'Describe tus propios mínimos de la muestra para un vuelo de noche.';
  const q = p.preguntas.find(x => t.preguntas[0] === x.id);
  q.enunciado_en = 'In the sample, who may a private pilot carry?';
  q.opciones_en = q.original.opciones.map(o => ({ letra: o.letra, texto: `Sample option ${o.letra}` }));
  return p;
}
const copia = x => JSON.parse(JSON.stringify(x));

test('formato: el español del oral (y el inglés de las de opción múltiple) es opcional; si viene, tiene que venir bien', () => {
  assert.equal(revisarPaquete(paqueteOralMuestra()).ok, true, 'un paquete viejo, sin español, sigue valiendo');
  const bueno = muestraEnEspanol();
  const r = revisarPaquete(bueno);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  // El inglés del libro no se toca.
  assert.deepEqual(bueno.materias[0].temas[0].libro_qa.map(x => x.pregunta_en), paqueteOralMuestra().materias[0].temas[0].libro_qa.map(x => x.pregunta_en));
  const qa = 'materias[0].temas[0].libro_qa[0]';
  const i = bueno.preguntas.findIndex(x => x.enunciado_en);
  const casos = [
    [x => { x.materias[0].temas[0].libro_qa[0].pregunta_es = 7; }, `${qa}.pregunta_es`, 'no_es_texto'],
    [x => { x.materias[0].temas[0].libro_qa[0].pregunta_es = '   '; }, `${qa}.pregunta_es`, 'vacio'],
    [x => { x.materias[0].temas[0].libro_qa[0].respuesta_es = 'x'.repeat(60_001); }, `${qa}.respuesta_es`, 'muy_largo'],
    [x => { delete x.materias[0].temas[0].libro_qa[0].respuesta_en; }, `${qa}.respuesta_es`, 'sin_original'],
    [x => { x.materias[0].temas[0].libro_qa[0].visual = { tipo: 'NO VALE' }; }, `${qa}.visual.tipo`, 'tipo_desconocido'],
    [x => { x.materias[0].temas[0].libro_qa[0].visual = 'dibujo'; }, `${qa}.visual`, 'no_es_objeto'],
    [x => { x.materias[0].temas[0].adicionales[0].pregunta_es = ''; }, 'materias[0].temas[0].adicionales[0].pregunta_es', 'vacio'],
    [x => { x.preguntas[i].enunciado_en = ['x']; }, `preguntas[${i}].enunciado_en`, 'no_es_texto'],
    [x => { x.preguntas[i].opciones_en.pop(); }, `preguntas[${i}].opciones_en`, 'opciones_no_validas'],
    [x => { x.preguntas[i].opciones_en[0].letra = 'Z'; }, `preguntas[${i}].opciones_en[0].letra`, 'letra_no_valida'],
    [x => { x.preguntas[i].opciones_en[1].texto = ''; }, `preguntas[${i}].opciones_en[1].texto`, 'vacio'],
  ];
  for (const [cambiar, ruta, motivo] of casos) {
    const x = copia(bueno);
    cambiar(x);
    const e = revisarPaquete(x).errores;
    assert.ok(e.some(y => y.ruta === ruta && y.motivo === motivo), `${ruta} ${motivo}: ${JSON.stringify(e)}`);
  }
  // El inglés de una pregunta de opción múltiple es solo del oral (las del Test Guide ya vienen tal cual en inglés).
  const tg = paqueteMuestra();
  tg.preguntas[0].enunciado_en = 'x';
  assert.ok(revisarPaquete(tg).errores.some(y => y.ruta === 'preguntas[0].enunciado_en' && y.motivo === 'solo_oral'));
});

async function conOral(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { azar: () => 0.5, reloj: () => Date.parse('2026-11-13T14:00:00Z') } });
  try {
    await conServidor(servidor, async base => {
      const h = { 'X-Oportia': '1', 'Content-Type': 'application/json' };
      const admin = (await fetch(`${base}/api/primer-admin`, { method: 'POST', headers: { ...h, ...DUENO }, body: JSON.stringify({ nombre: 'junior', clave: CLAVE }) })).headers.get('set-cookie').split(';')[0];
      crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      const ana = (await fetch(`${base}/api/entrar`, { method: 'POST', headers: h, body: JSON.stringify({ nombre: 'ana', clave: CLAVE }) })).headers.get('set-cookie').split(';')[0];
      for (const paquete of [paqueteMuestra(), muestraEnEspanol()]) {
        const r = await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { ...h, Cookie: admin }, body: JSON.stringify(paquete) }).then(x => x.json());
        assert.ok(r.paquete?.id, JSON.stringify(r));
        for (const archivo of r.faltan ?? []) await fetch(`${base}/api/admin/academia/paquetes/${r.paquete.id}/figuras/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'image/png' }, body: figuraMuestraPng() });
        const a = await fetch(`${base}/api/admin/academia/paquetes/${r.paquete.id}/activar`, { method: 'POST', headers: { ...h, Cookie: admin }, body: '{}' });
        assert.equal(a.status, 200);
      }
      const pedir = async (metodo, ruta, datos) => {
        const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { ...h, Cookie: ana }, body: datos === undefined ? undefined : JSON.stringify(datos) });
        return { codigo: r.status, datos: await r.json() };
      };
      await fn({ pedir });
    });
  } finally { db.close(); }
}

test('servidor: la clase, practicar y los exámenes mandan el español; el inglés va tal cual y la respuesta nunca antes de responder', async () => {
  const p = muestraEnEspanol();
  const t = p.materias[0].temas[0];
  await conOral(async ({ pedir }) => {
    const l = (await pedir('GET', '/api/academia/oral/temas/oral_calificaciones/t01-a')).datos;
    assert.deepEqual(l.libro_qa.map(x => [x.pregunta_en, x.respuesta_en]), t.libro_qa.map(x => [x.pregunta_en, x.respuesta_en]), 'el inglés tal cual');
    assert.equal(l.libro_qa[0].pregunta_es, t.libro_qa[0].pregunta_es);
    assert.equal(l.libro_qa[0].respuesta_es, t.libro_qa[0].respuesta_es);
    assert.deepEqual(l.libro_qa[0].visual, t.libro_qa[0].visual);
    assert.equal(l.libro_qa[1].pregunta_es, t.libro_qa[1].pregunta_es);
    assert.equal(l.libro_qa[1].respuesta_es, null, 'sin traducir: la pantalla muestra el inglés con «Aún sin traducir»');
    assert.equal(l.libro_qa[1].visual, null);
    assert.equal(l.adicionales[0].pregunta_es, t.adicionales[0].pregunta_es);
    assert.equal(l.adicionales[0].pregunta_en, t.adicionales[0].pregunta_en);
    // Otro tema sin español: igual que antes.
    const otro = (await pedir('GET', '/api/academia/oral/temas/oral_calificaciones/t02-b')).datos;
    assert.equal(otro.libro_qa[0].pregunta_es, null);

    // Practicar: el inglés de la pregunta (el del paquete, o la pregunta del libro), nunca la respuesta.
    const r = (await pedir('POST', '/api/academia/oral/ronda', { materia: 'oral_calificaciones', tema: 't01-a' })).datos;
    const texto = JSON.stringify(r);
    for (const x of t.libro_qa) assert.ok(!texto.includes(x.respuesta_en) && !(x.respuesta_es && texto.includes(x.respuesta_es)), 'ninguna respuesta antes de responder');
    assert.ok(!texto.includes('correcta'));
    const q0 = r.preguntas.find(q => q.id === t.preguntas[0]);
    const q1 = r.preguntas.find(q => q.id === t.preguntas[1]);
    assert.equal(q0.enunciado_en, 'In the sample, who may a private pilot carry?');
    assert.deepEqual(q0.opciones_en.map(o => o.letra), q0.opciones.map(o => o.letra));
    assert.equal(q1.enunciado_en, null);
    assert.equal(q1.opciones_en, null);
    assert.equal(q1.pregunta_libro_en, t.libro_qa[1].pregunta_en, 'la pregunta del libro tal cual');
    assert.ok(q0.enunciado.startsWith('En la muestra'), 'la de opción múltiple sigue en español');
    const x = (await pedir('POST', '/api/academia/oral/responder', { pregunta: q0.id, elegida: 'A' })).datos;
    assert.equal(x.acierto, true);
    assert.equal(x.origen.pregunta_en, t.libro_qa[0].pregunta_en);
    assert.equal(x.origen.respuesta_en, t.libro_qa[0].respuesta_en);
    assert.equal(x.origen.pregunta_es, t.libro_qa[0].pregunta_es);
    assert.equal(x.origen.respuesta_es, t.libro_qa[0].respuesta_es);

    // El examen del capítulo: el inglés de la pregunta sí, la respuesta no; la nota no cambia por el idioma.
    const e = (await pedir('POST', '/api/academia/oral/examen', { materia: 'oral_calificaciones' })).datos;
    const te = JSON.stringify(e);
    for (const y of t.libro_qa) assert.ok(!te.includes(y.respuesta_en) && !(y.respuesta_es && te.includes(y.respuesta_es)));
    assert.ok(e.preguntas.some(q => q.enunciado_en));
    const respuestas = Object.fromEntries(e.preguntas.map(q => [q.id, 'A']));
    const n = (await pedir('POST', '/api/academia/oral/examen/entregar', { examen: e.examen, respuestas })).datos;
    assert.equal(n.bien, n.total);
    const rev = n.revision.find(q => q.id === t.preguntas[0]);
    assert.equal(rev.origen.respuesta_es, t.libro_qa[0].respuesta_es);
    assert.equal(rev.enunciado_en, 'In the sample, who may a private pilot carry?');
  });
});

test('Repaso final (oral): cada tarjeta trae su español, su dibujo y el inglés tal cual', async () => {
  const p = muestraEnEspanol();
  const t = p.materias[0].temas[0];
  await conOral(async ({ pedir }) => {
    const d = (await pedir('GET', '/api/academia/repaso-final/oral')).datos;
    const q0 = d.tarjetas.find(x => x.id === 'oral_calificaciones/t01-a/q0');
    assert.equal(q0.pregunta_en, t.libro_qa[0].pregunta_en);
    assert.equal(q0.respuesta_en, t.libro_qa[0].respuesta_en);
    assert.equal(q0.pregunta_es, t.libro_qa[0].pregunta_es);
    assert.equal(q0.respuesta_es, t.libro_qa[0].respuesta_es);
    assert.deepEqual(q0.visual, t.libro_qa[0].visual);
    const a0 = d.tarjetas.find(x => x.id === 'oral_calificaciones/t01-a/a0');
    assert.equal(a0.pregunta_es, t.adicionales[0].pregunta_es);
    assert.equal(a0.respuesta_es, null);
    const sin = d.tarjetas.find(x => x.id === 'oral_calificaciones/t02-b/q0');
    assert.equal(sin.pregunta_es, null);
    assert.equal(sin.respuesta_es, null);
  });
  // Sin oral, nada.
  assert.deepEqual(tarjetasOral(null), []);
});

test('la pantalla del idioma: sin innerHTML ni estilos escritos; los textos en español y en inglés; el CSS esconde la otra versión', () => {
  const js = readFileSync(new URL('../public/oral-idioma.js', import.meta.url), 'utf8');
  for (const f of ['oral-idioma.js', 'oral-vista.js', 'repaso-final-vista.js']) {
    const x = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(x, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.style\b|style=|setAttribute\(\s*['"]style/, f);
  }
  assert.match(js, /try \{ return localStorage\.getItem/);
  const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  for (const k of ['oral.idioma.grupo', 'oral.idioma.es', 'oral.idioma.en', 'oral.sin_traducir', 'oral.pregunta_es', 'oral.respuesta_es', 'oral.enunciado_libro', 'oral.opciones_es', 'oral.explicacion']) {
    assert.ok(es[k] && en[k], k);
  }
  assert.equal(es['oral.idioma.en'], 'Inglés original');
  assert.equal(es['oral.sin_traducir'], 'Aún sin traducir');
  // Sin claves repetidas en los dos archivos.
  for (const f of ['es.json', 'en.json']) {
    const crudo = readFileSync(new URL(`../public/i18n/${f}`, import.meta.url), 'utf8');
    const claves = [...crudo.matchAll(/^\s*"([^"]+)":/gm)].map(m => m[1]);
    assert.equal(new Set(claves).size, claves.length, `${f}: claves repetidas`);
  }
  const css = readFileSync(new URL('../public/academia.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-oral-idioma="en"\] \.oral-solo-es, :root:not\(\[data-oral-idioma="en"\]\) \.oral-solo-en \{ display: none !important; \}/);
  assert.match(css, /\.idioma-oral-boton \{ min-height: 44px; min-width: 44px;/);
});
