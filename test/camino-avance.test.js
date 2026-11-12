// Academia 0.12.2: el Camino. El video de la materia es opcional (nunca es «lo que toca» y solo se ofrece la PRIMERA vez
// que entra a la materia, con «Saltar video»); cada tema tiene su capítulo del mp4 («Ver la explicación en video»); la
// clase sigue en la tarjeta donde quedó («Continuar»); y cada nodo dice su avance (anillo) y su color: morado = terminada
// (vio sus tarjetas e hizo su práctica), dorado = dominada (aprobó). Paquete de MUESTRA con un mp4 de mentira.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'una clave bien larga';
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const T0 = Date.parse('2026-11-12T14:00:00Z');

function paqueteConVideo() {
  const p = paqueteMuestra();
  p.edicion = 'muestra-camino';
  p.materias[0].video = {
    titulo: 'Factores humanos (muestra)', escenas: [{ inicio_s: 0, fin_s: 12, subtitulo: 'Empieza' }],
    mp4: { archivo: 'video-materia-01.mp4', duracion_s: 20, capitulos: [{ inicio_s: 0, titulo: 'Introducción' }, { inicio_s: 8, titulo: 'La hipoxia' }, { inicio_s: 15, titulo: 'Las ilusiones' }] },
  };
  return p;
}
function mp4(n = 4000) {
  const b = Buffer.alloc(n, 5);
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(12)]).copy(b, 0);
  return b;
}
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: (r.headers.get('set-cookie') ?? '').split(';')[0] || null };
}
async function conCamino(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  let ahora = T0;
  const reloj = () => ahora;
  reloj.avanzar = ms => { ahora += ms; };
  await conServidor(crearServidor({ db, config, academia: { reloj } }), async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
    crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    const p = paqueteConVideo();
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(p) });
    assert.equal(s.codigo, 201, JSON.stringify(s.datos));
    const id = s.datos.paquete.id;
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/${p.figuras[0].archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/video/video-materia-01.mp4`, { galleta: admin, cabeceras: { 'Content-Type': 'video/mp4' }, cuerpo: mp4() })).codigo, 201);
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    await fn({ base, db, reloj, ana });
  });
  db.close();
}
const LECCION = '/api/academia/temas/factores_humanos/muestra-hipoxia';
const camino = (c, galleta) => pedir(c.base, 'GET', '/api/academia/camino', { galleta }).then(r => r.datos);
async function hacerTema(c, galleta, malas = []) {
  const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
  const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);
  for (const q of i.preguntas) await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: malas.includes(q.id) ? mala(q.id) : DE(q.id).original.correcta } });
  return (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} })).datos;
}

test('video: «lo que toca» nunca es el video (aunque no lo haya visto): es el tema donde va', () => {
  const app = readFileSync(join(RAIZ, 'public/app.js'), 'utf8');
  const fuente = /^function pasoQueToca\(c\) \{\n[\s\S]*?\n\}$/m.exec(app)?.[0];
  assert.ok(fuente, 'falta pasoQueToca');
  const pasoQueToca = runInNewContext(`${fuente}\npasoQueToca;`);
  const materia = (temas, video) => ({ id: 'factores_humanos', estado: 'abierta', video, temas, examen: { disponible: false, aprobado: false } });
  // Sin ver el video y sin ningún tema aprobado (el caso que mandaba otra vez al video).
  assert.deepEqual({ ...pasoQueToca({ materias: [materia([{ id: 't1', estado: 'abierto' }], { visto: false })] }) }, { tipo: 'tema', materia: 'factores_humanos', tema: 't1' });
  assert.deepEqual({ ...pasoQueToca({ materias: [materia([{ id: 't1', estado: 'aprobado' }, { id: 't2', estado: 'abierto' }], { visto: false })] }) }, { tipo: 'tema', materia: 'factores_humanos', tema: 't2' });
  // Tocar un nodo abre ESE nodo: cada nodo lleva su propia dirección (el tema, el video o el examen).
  assert.match(app, /href: `#tema\/\$\{encodeURIComponent\(m\.id\)\}\/\$\{encodeURIComponent\(tema\.id\)\}`/);
  assert.match(app, /href: `#video\/\$\{encodeURIComponent\(m\.id\)\}`/);
});

test('video: se ofrece solo la primera vez que entra a la materia (visto o saltado, nunca más); cada tema tiene su capítulo', async () => {
  await conCamino(async c => {
    let l = (await pedir(c.base, 'GET', LECCION, { galleta: c.ana })).datos;
    assert.deepEqual(l.video, { ofrecer: true, capitulo: { inicio_s: 8, titulo: 'La hipoxia' } }, 'el tema 1 es el capítulo 1 (el 0 es la introducción)');
    // «Saltar video»: ya se ofreció.
    assert.equal((await pedir(c.base, 'POST', '/api/academia/video/factores_humanos/ofrecido', { galleta: c.ana, datos: {} })).codigo, 200);
    l = (await pedir(c.base, 'GET', LECCION, { galleta: c.ana })).datos;
    assert.equal(l.video.ofrecer, false);
    const v = (await pedir(c.base, 'GET', '/api/academia/video/factores_humanos', { galleta: c.ana })).datos;
    assert.deepEqual(v.temas, ['muestra-hipoxia', 'muestra-ilusiones']);
    assert.equal(v.visto, false, 'saltarlo no es verlo');
    // Lo que el Camino dice del video: sin verlo, su anillo en 0.
    assert.equal((await camino(c, c.ana)).materias[0].video.pct, 0);
  });
});

test('clase: sigue en la tarjeta donde quedó («Continuar»), y el avance de cada nodo: empezado → terminado (morado) → dominado (dorado)', async () => {
  await conCamino(async c => {
    await pedir(c.base, 'POST', '/api/academia/video/factores_humanos/ofrecido', { galleta: c.ana, datos: {} });
    let m = (await camino(c, c.ana)).materias[0];
    assert.deepEqual([m.temas[0].avance, m.temas[0].paso, m.examen.avance], [{ nivel: 'nuevo', pct: 0 }, null, { nivel: 'nuevo', pct: 0 }]);
    assert.equal((await camino(c, c.ana)).continuar, null);
    // Va por la pantalla 2 de 5 (la portada, 3 tarjetas y el final).
    const paso = (await pedir(c.base, 'POST', `${LECCION}/paso`, { galleta: c.ana, datos: { paso: 2, total: 5 } }));
    assert.equal(paso.codigo, 200);
    assert.deepEqual((await pedir(c.base, 'GET', LECCION, { galleta: c.ana })).datos.paso, { paso: 2, max: 2, total: 5 });
    let cam = await camino(c, c.ana);
    assert.deepEqual(cam.continuar, { materia: 'factores_humanos', tema: 'muestra-hipoxia', paso: 2, total: 5 });
    assert.deepEqual(cam.materias[0].temas[0].avance, { nivel: 'empezado', pct: 30 });
    // Volver atrás no baja lo que ya vio (max).
    await pedir(c.base, 'POST', `${LECCION}/paso`, { galleta: c.ana, datos: { paso: 1, total: 5 } });
    assert.deepEqual((await pedir(c.base, 'GET', LECCION, { galleta: c.ana })).datos.paso, { paso: 1, max: 2, total: 5 });
    // Datos malos y temas cerrados, no.
    assert.equal((await pedir(c.base, 'POST', `${LECCION}/paso`, { galleta: c.ana, datos: { paso: 5, total: 5 } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/temas/factores_humanos/muestra-ilusiones/paso', { galleta: c.ana, datos: { paso: 1, total: 4 } })).codigo, 403);
    // Ve todas sus tarjetas y hace la práctica sin aprobar: terminado (morado).
    await pedir(c.base, 'POST', `${LECCION}/paso`, { galleta: c.ana, datos: { paso: 4, total: 5 } });
    await hacerTema(c, c.ana, ['muestra-h1', 'muestra-h2']);
    m = (await camino(c, c.ana)).materias[0];
    assert.deepEqual(m.temas[0].avance, { nivel: 'terminado', pct: 99 });
    // La aprueba: dominado (dorado); la materia suma el avance de sus nodos (video 0, tema 1 100, tema 2 0, examen 0).
    await hacerTema(c, c.ana);
    m = (await camino(c, c.ana)).materias[0];
    assert.deepEqual(m.temas[0].avance, { nivel: 'dominado', pct: 100 });
    assert.equal(m.avance, 25);
    assert.equal((await camino(c, c.ana)).continuar, null, 'el tema aprobado ya no es «donde quedó»');
  });
});
