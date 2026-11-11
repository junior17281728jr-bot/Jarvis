// Pruebas de la Academia 0.8.0: el «Modo reto» (enunciado y correcta tal cual + 2 opciones nuevas, mezcladas; antes de
// responder nada dice cuál es la original), la revisión completa al terminar, «Practicar mis errores», la memoria de
// errores (para siempre, por pregunta, por idea equivocada y por tema; el repaso empieza por lo más fallado) y la clave
// completa «Respuestas» del administrador (403 para los alumnos). Usa solo el paquete de MUESTRA (test/academia-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { opcionesReto } from '../src/academia/reto.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
async function conAcademia(fn, { reloj = Date.now } = {}) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const alumnos = {};
    for (const nombre of ['ana', 'beto']) {
      crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } });
      alumnos[nombre] = r.galleta;
    }
    const json = JSON.stringify(paqueteMuestra());
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: json });
    assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    await fn({ base, db, admin: admin.galleta, ...alumnos });
  });
  db.close();
}
const nuevo = (base, galleta, datos) => pedir(base, 'POST', '/api/academia/intentos', { galleta, datos });
const responder = (base, galleta, intento, pregunta, elegida) => pedir(base, 'POST', `/api/academia/intentos/${intento}/responder`, { galleta, datos: { pregunta, elegida } });
// La letra (de las que se ven) de la opción correcta o de una mala, en un intento de Modo reto.
const letraReto = (intento, q, { correcta }) => {
  const original = DE(q.id).original;
  const texto = original.opciones.find(o => o.letra === original.correcta).texto;
  return q.opciones.find(o => (o.texto === texto) === correcta).letra;
};
async function responderTodoOriginal(base, galleta, intento, { bien }) {
  let n = 0;
  for (const q of intento.preguntas) {
    const c = DE(q.id).original.correcta;
    const letra = n < bien ? c : ['A', 'B', 'C'].find(l => l !== c);
    assert.equal((await responder(base, galleta, intento.id, q.id, letra)).codigo, 200);
    n += 1;
  }
  return pedir(base, 'POST', `/api/academia/intentos/${intento.id}/terminar`, { galleta, datos: {} });
}

test('formato: el Modo reto trae exactamente 2 opciones, con su porqué, distintas entre sí y de las originales', () => {
  assert.equal(revisarPaquete(paqueteMuestra()).ok, true);
  const conErrores = cambio => { const p = paqueteMuestra(); cambio(p.preguntas[0].reto, p.preguntas[0]); return revisarPaquete(p).errores.map(e => `${e.ruta}:${e.motivo}`); };
  assert.deepEqual(conErrores(r => r.opciones.pop()), ['preguntas[0].reto.opciones:reto_no_valido']);
  assert.deepEqual(conErrores(r => r.opciones.push({ texto: 'Una tercera.', porque_es_incorrecta: 'x' })), ['preguntas[0].reto.opciones:reto_no_valido']);
  assert.deepEqual(conErrores(r => { delete r.opciones[1].porque_es_incorrecta; }), ['preguntas[0].reto.opciones[1].porque_es_incorrecta:falta']);
  assert.deepEqual(conErrores(r => { r.opciones[1].texto = r.opciones[0].texto; }), ['preguntas[0].reto.opciones[1].texto:repetido']);
  assert.deepEqual(conErrores((r, q) => { r.opciones[0].texto = q.original.opciones[1].texto; }), ['preguntas[0].reto.opciones[0].texto:repetido']);
  assert.deepEqual(conErrores(r => { r.opciones[0].trampa = 5; }), ['preguntas[0].reto.opciones[0].trampa:no_es_texto']);
  assert.deepEqual(conErrores((r, q) => { q.reto = []; }), ['preguntas[0].reto:no_es_objeto']);
  // Sin «trampa» también vale (es opcional).
  assert.deepEqual(conErrores(r => { delete r.opciones[0].trampa; }), []);
  // El orden del reto sale del intento y la pregunta: el mismo siempre, y la correcta no queda siempre en el mismo lugar.
  const q = DE('muestra-h1');
  assert.deepEqual(opcionesReto(q, 5, q.id), opcionesReto(q, 5, q.id));
  const lugares = new Set(Array.from({ length: 30 }, (_, i) => opcionesReto(q, i, q.id).findIndex(o => o.clave === 'B')));
  assert.equal(lugares.size, 3);
});

test('Modo reto: enunciado y correcta tal cual + las 2 del reto mezcladas; nada delata cuál es la original; no aprueba el tema', async () => {
  await conAcademia(async ({ base, db, ana }) => {
    const r = await nuevo(base, ana, { tipo: 'reto', materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    assert.equal(r.codigo, 201, JSON.stringify(r.datos));
    const intento = r.datos;
    assert.equal(intento.modo, 'reto');
    // Solo las preguntas del tema que traen su reto (h1, h2 y h3).
    assert.deepEqual(intento.preguntas.map(q => q.id).sort(), ['muestra-h1', 'muestra-h2', 'muestra-h3']);
    for (const q of intento.preguntas) {
      const o = DE(q.id);
      assert.equal(q.enunciado, o.original.enunciado, 'el enunciado tal cual');
      assert.equal(q.numero, o.original.numero);
      assert.equal(q.modo, 'reto');
      assert.deepEqual(q.opciones.map(x => x.letra), ['A', 'B', 'C']);
      const textos = q.opciones.map(x => x.texto).sort();
      const correcta = o.original.opciones.find(x => x.letra === o.original.correcta).texto;
      assert.deepEqual(textos, [correcta, ...o.reto.opciones.map(x => x.texto)].sort(), 'la correcta tal cual y las 2 del reto');
      assert.deepEqual(Object.keys(q.opciones[0]).sort(), ['letra', 'texto'], 'antes de responder no viaja nada más');
      assert.equal(q.respuesta, null);
    }
    const crudo = JSON.stringify(intento);
    for (const palabra of ['porque', 'trampa', 'correcta', 'clave', 'R1', 'R2', 'explicacion', 'sencilla']) assert.ok(!crudo.includes(palabra), `antes de responder viaja «${palabra}»`);
    // Volver a abrir el intento: el mismo orden.
    assert.deepEqual((await pedir(base, 'GET', `/api/academia/intentos/${intento.id}`, { galleta: ana })).datos.preguntas.map(q => q.opciones), intento.preguntas.map(q => q.opciones));
    // Fallar la primera con una opción del reto: la hoja dice por qué es incorrecta cada opción del reto y cuál era la buena.
    const q0 = intento.preguntas[0];
    const mala = letraReto(intento, q0, { correcta: false });
    const x = (await responder(base, ana, intento.id, q0.id, mala)).datos.respuesta;
    assert.equal(x.acierto, false);
    assert.equal(x.modo, 'reto');
    assert.equal(x.elegida, mala, 'la letra que se vio');
    assert.equal(x.correcta, letraReto(intento, q0, { correcta: true }));
    const elegidaTexto = q0.opciones.find(o => o.letra === mala).texto;
    const opcionReto = DE(q0.id).reto.opciones.find(o => o.texto === elegidaTexto);
    assert.equal(x.idea, opcionReto.porque_es_incorrecta);
    assert.equal(x.trampa, opcionReto.trampa ?? null);
    assert.equal(x.reto.length, 2);
    for (const o of x.reto) assert.equal(o.porque, DE(q0.id).reto.opciones.find(y => y.texto === o.texto).porque_es_incorrecta);
    assert.equal(x.explicacion, DE(q0.id).original.explicacion, 'la explicación original, tal cual');
    assert.equal(x.letraOriginal, DE(q0.id).original.correcta, 'la letra del Test Guide, para avisar que las letras cambian');
    // En la base queda la opción de verdad (R1 o R2), nunca la letra que se vio.
    const guardada = db.prepare('SELECT elegida FROM academia_respuestas WHERE intento_id = ? AND pregunta = ?').get(intento.id, q0.id).elegida;
    assert.match(guardada, /^R[12]$/);
    // Una letra que no existe → 400; las otras dos, bien.
    assert.equal((await responder(base, ana, intento.id, intento.preguntas[1].id, 'D')).codigo, 400);
    for (const q of intento.preguntas.slice(1)) assert.equal((await responder(base, ana, intento.id, q.id, letraReto(intento, q, { correcta: true }))).datos.respuesta.acierto, true);
    const fin = (await pedir(base, 'POST', `/api/academia/intentos/${intento.id}/terminar`, { galleta: ana, datos: {} })).datos;
    assert.equal(fin.modo, 'reto');
    assert.equal(fin.aprobado, null, 'el Modo reto es práctica: no aprueba el tema');
    assert.equal(fin.revision.length, 3);
    assert.equal(fin.falladas.length, 1);
    const c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos;
    assert.equal(c.materias[0].temas[0].estado, 'abierto');
    assert.equal(c.materias[0].reto, 3, 'preguntas con reto en los temas abiertos');
    // Toda la materia en Modo reto: solo de los temas abiertos (el segundo está cerrado todavía).
    const m = (await nuevo(base, ana, { tipo: 'reto', materia: 'factores_humanos' })).datos;
    assert.deepEqual(m.preguntas.map(q => q.id).sort(), ['muestra-h1', 'muestra-h2', 'muestra-h3']);
    assert.equal((await nuevo(base, ana, { tipo: 'reto', materia: 'factores_humanos', tema: 'muestra-ilusiones' })).codigo, 403);
    // El examen sigue siendo Original: las 3 opciones del Test Guide, en su orden.
    for (const tema of ['muestra-hipoxia', 'muestra-ilusiones']) {
      const i = (await nuevo(base, ana, { tipo: 'tema', materia: 'factores_humanos', tema })).datos;
      assert.equal(i.modo, 'original');
      assert.equal((await responderTodoOriginal(base, ana, i, { bien: 5 })).datos.aprobado, true);
    }
    const ex = (await nuevo(base, ana, { tipo: 'examen', materia: 'factores_humanos' })).datos;
    for (const q of ex.preguntas) assert.deepEqual(q.opciones, DE(q.id).original.opciones.map(o => ({ letra: o.letra, texto: o.texto })));
    assert.ok(!JSON.stringify(ex).includes('"modo":"reto"'));
  });
});

test('al terminar: la revisión completa; «Practicar mis errores» con las falladas; la memoria de errores y los puntos débiles', async () => {
  let ahora = Date.parse('2026-11-11T15:00:00Z');
  await conAcademia(async ({ base, admin, ana, beto }) => {
    const i = (await nuevo(base, ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    const fin = (await responderTodoOriginal(base, ana, i, { bien: 3 })).datos;
    assert.equal(fin.aprobado, false);
    // La revisión: las 5, en el orden del intento, cada una con lo que eligió, la correcta, la original y la sencilla.
    assert.deepEqual(fin.revision.map(q => q.id), i.preguntas.map(q => q.id));
    for (const q of fin.revision) {
      assert.equal(q.respuesta.correcta, DE(q.id).original.correcta);
      assert.equal(q.respuesta.explicacion, DE(q.id).original.explicacion);
      assert.equal(q.respuesta.sencilla, DE(q.id).sencilla);
      assert.ok(q.respuesta.elegida);
    }
    assert.deepEqual(fin.falladas.map(q => q.id), fin.revision.filter(q => !q.respuesta.acierto).map(q => q.id));
    const falladas = fin.falladas.map(q => q.id);
    // Practicar mis errores (de ESE intento): justo las falladas.
    const e = await nuevo(base, ana, { tipo: 'errores', intento: i.id });
    assert.equal(e.codigo, 201, JSON.stringify(e.datos));
    assert.deepEqual(e.datos.preguntas.map(q => q.id).sort(), [...falladas].sort());
    assert.equal(e.datos.materia, 'factores_humanos');
    // El intento de otro: no existe. Un intento que no es un número: 400.
    assert.equal((await nuevo(base, beto, { tipo: 'errores', intento: i.id })).codigo, 404);
    assert.equal((await nuevo(base, beto, { tipo: 'errores', intento: 'x' })).codigo, 400);
    assert.equal((await nuevo(base, beto, { tipo: 'errores' })).codigo, 409, 'sin errores no hay nada que practicar');
    // Fallar otra vez la misma: es la más fallada y sale primero en el repaso, en «Mis puntos débiles» y en el camino.
    const masFallada = falladas[0];
    ahora += 60_000;
    const e1 = e.datos;
    for (const q of e1.preguntas) {
      const c = DE(q.id).original.correcta;
      await responder(base, ana, e1.id, q.id, q.id === masFallada ? ['A', 'B', 'C'].find(l => l !== c) : c);
    }
    const finE = (await pedir(base, 'POST', `/api/academia/intentos/${e1.id}/terminar`, { galleta: ana, datos: {} })).datos;
    assert.equal(finE.aprobado, null, 'practicar errores no aprueba nada');
    const p = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: ana })).datos;
    const d = p.puntosDebiles;
    assert.equal(d.preguntas[0].id, masFallada);
    assert.equal(d.preguntas[0].fallos, 2);
    assert.equal(d.preguntas[0].enunciado, DE(masFallada).original.enunciado);
    assert.ok(d.ideas.length >= 1);
    assert.equal(d.ideas[0].pregunta, masFallada);
    assert.equal(d.ideas[0].idea, DE(masFallada).errores[d.ideas[0].opcion]);
    assert.equal(d.temas[0].tema, 'muestra-hipoxia');
    assert.equal(d.total, 5 + 2);
    assert.equal(d.fallos, 3);
    const c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos;
    assert.equal(c.materias[0].debil.pregunta, masFallada);
    assert.equal(c.materias[0].debil.idea, d.ideas[0].idea);
    const l = (await pedir(base, 'GET', '/api/academia/temas/factores_humanos/muestra-hipoxia', { galleta: ana })).datos;
    assert.equal(l.debil.pregunta, masFallada);
    assert.equal(l.reto, 3);
    const rep = (await nuevo(base, ana, { tipo: 'repaso' })).datos;
    assert.equal(rep.preguntas[0].id, masFallada, 'el repaso empieza por lo más fallado');
    // El ejercicio rápido del punto débil (un tema): lo que más falla ahí.
    const rapido = (await nuevo(base, ana, { tipo: 'errores', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    assert.equal(rapido.preguntas[0].id, masFallada);
    // Beto no ve nada de Ana.
    const pb = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: beto })).datos;
    assert.equal(pb.puntosDebiles.preguntas.length, 0);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: beto })).datos.materias[0].debil, undefined);
    // El administrador ve lo mismo de Ana.
    const anaId = (await pedir(base, 'GET', '/api/admin/academia/alumnos', { galleta: admin })).datos.alumnos.find(a => a.nombre === 'ana').id;
    const det = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${anaId}`, { galleta: admin })).datos;
    assert.deepEqual(det.puntosDebiles.preguntas.map(q => q.id), d.preguntas.map(q => q.id));
    // Acertarla dos veces seguidas: queda «superada» (y deja de ser el punto débil), pero la memoria la guarda.
    for (let k = 0; k < 2; k++) {
      const x = (await nuevo(base, ana, { tipo: 'errores', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
      for (const q of x.preguntas) await responder(base, ana, x.id, q.id, DE(q.id).original.correcta);
      await pedir(base, 'POST', `/api/academia/intentos/${x.id}/terminar`, { galleta: ana, datos: {} });
    }
    const p2 = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: ana })).datos.puntosDebiles;
    const fila = p2.preguntas.find(q => q.id === masFallada);
    assert.equal(fila.fallos, 2);
    assert.equal(fila.superada, true);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.materias[0].debil, undefined);
  }, { reloj: () => ahora });
});

test('Respuestas (la clave completa): solo el administrador; los alumnos reciben 403 y sin sesión 401', async () => {
  await conAcademia(async ({ base, admin, ana }) => {
    const r = await pedir(base, 'GET', '/api/admin/academia/respuestas', { galleta: admin });
    assert.equal(r.codigo, 200);
    const temas = r.datos.materias[0].temas;
    assert.deepEqual(temas.map(t => t.id), ['muestra-hipoxia', 'muestra-ilusiones']);
    const todas = temas.flatMap(t => t.preguntas);
    assert.equal(todas.length, 10);
    for (const q of todas) {
      const o = DE(q.id);
      assert.equal(q.enunciado, o.original.enunciado);
      assert.equal(q.correcta, o.original.correcta);
      assert.equal(q.explicacion, o.original.explicacion);
      assert.equal(q.sencilla, o.sencilla);
      assert.deepEqual(q.errores, o.errores);
      assert.deepEqual(q.opciones, o.original.opciones.map(x => ({ letra: x.letra, texto: x.texto })));
      assert.equal(q.reto.length, o.reto ? 2 : 0);
      if (o.reto) assert.equal(q.reto[0].porque, o.reto.opciones[0].porque_es_incorrecta);
    }
    assert.equal(todas.find(q => q.id === 'muestra-h5').figura.numero, 'M1');
    const alumno = await pedir(base, 'GET', '/api/admin/academia/respuestas', { galleta: ana });
    assert.equal(alumno.codigo, 403);
    assert.equal(alumno.datos.error, 'solo_admin');
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/respuestas')).codigo, 401);
  });
});
