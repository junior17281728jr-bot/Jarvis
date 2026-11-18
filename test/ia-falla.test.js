// 0.14.38: la app sigue funcionando si el proveedor de IA falla o se acaba el crédito. Con el proveedor FALSO respondiendo
// 500, 401 (clave no válida) o «sin crédito», cada cosa con IA (explicar, la duda, el consejo, el Profesor virtual, la
// práctica en vivo del oral, la frase del certificado de la Competencia, «Mejorar preguntas con IA» y la mejora profunda
// de la fábrica) termina en lo de siempre sin IA (el instructor automático, «califícate tú», la frase fija), con un motivo
// que se puede decir en los dos idiomas, y nunca en una pantalla vacía ni en un error del servidor.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conInstructor, pedir, unaMala, explicar, NOMBRES } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { darProfesor } from '../src/academia/profesor.js';
import { SEMILLA, LETRAS } from '../src/academia/competencia.js';
import { conFabrica } from './fabrica-base.js';
import { guardarConfigFabrica } from '../src/academia/fabrica.js';
import { estadoProfunda } from '../src/academia/fabrica-profunda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ES = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const EN = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
// Las tres fallas del proveedor: un error suyo, la clave que ya no sirve y el crédito que se acabó.
const FALLAS = [['500', { tipo: 'status', status: 500 }], ['401', { tipo: 'status', status: 401 }], ['sin_credito', 'sin_credito_400']];
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
// Lo que dice la pantalla con el motivo: tiene que existir (instr.motivo.* o ia.motivo.*), en los dos idiomas.
const sePuedeDecir = motivo => ['instr.motivo.', 'ia.motivo.'].some(p => ES[`${p}${motivo}`] && EN[`${p}${motivo}`]);

async function subirOral(c) {
  const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(paqueteOralMuestra()) });
  for (const archivo of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} })).codigo, 200);
}
// La última tarea de la IA puesta en la fila, hecha (con el proveedor fallando).
async function hacerUltima(c, uso) {
  const t = c.db.prepare(`SELECT id FROM tareas WHERE tipo = 'academia.instructor' AND datos LIKE ? ORDER BY id DESC`).get(`%"uso":"${uso}"%`);
  assert.ok(t, `no se pidió ${uso}`);
  const hecha = await c.hacer(t.id);
  assert.equal(hecha.estado, 'hecha', `${uso}: la tarea termina «hecha» (nunca fallida): ${JSON.stringify(hecha.resultado)}`);
  assert.equal(hecha.resultado.usada, false);
  return { id: t.id, motivo: hecha.resultado.motivo };
}
const poll = (c, galleta, id) => pedir(c.base, 'GET', `/api/academia/instructor/tareas/${id}`, { galleta });

for (const [nombre, escena] of FALLAS) {
  test(`con el proveedor fallando (${nombre}): cada cosa con IA termina en lo de siempre sin IA, con un motivo que se dice`, async () => {
    await conInstructor(async c => {
      // Muchas veces la misma falla: cualquier llamada que se haga, falla.
      c.falso.siguiente(...Array(40).fill(escena));
      // 1. «Explícamelo de otra forma»: la explicación del instructor automático llega YA; la de la IA dice «no».
      const x = await unaMala(c, c.z);
      const e = (await explicar(c, c.z, x)).datos;
      assert.ok(e.basica?.idea, 'la explicación automática llega enseguida');
      assert.equal(e.ia.estado, 'pendiente');
      const he = await c.hacer(e.ia.tarea);
      assert.equal(he.estado, 'hecha');
      const pe = (await poll(c, c.z, e.ia.tarea)).datos;
      assert.equal(pe.estado, 'no');
      assert.ok(sePuedeDecir(pe.motivo), `explicar: motivo «${pe.motivo}» sin texto`);
      // Después de la falla (la clave en pausa o no), lo siguiente igual responde con lo básico, sin 500.
      const y = await unaMala(c, c.q);
      const e2 = await explicar(c, c.q, y);
      assert.equal(e2.codigo, 200);
      assert.ok(e2.datos.basica?.idea);
      if (e2.datos.ia?.estado === 'pendiente') await c.hacer(e2.datos.ia.tarea);
      // 2. La duda escrita: la respuesta automática llega y la IA dice «no» (o «en espera»).
      const d = await pedir(c.base, 'POST', '/api/academia/instructor/duda', { galleta: c.z, datos: { materia: 'factores_humanos', tema: 'muestra-hipoxia', texto: '¿Qué es la hipoxia?' } });
      assert.equal(d.codigo, 200);
      assert.ok(d.datos.basica, 'la duda tiene su respuesta automática');
      if (d.datos.ia?.estado === 'pendiente') {
        await c.hacer(d.datos.ia.tarea);
        assert.equal((await poll(c, c.z, d.datos.ia.tarea)).datos.estado, 'no');
      } else assert.ok(d.datos.ia === null || d.datos.ia.estado === 'no');
      // 3. El consejo: el consejo automático está siempre.
      const k = await pedir(c.base, 'POST', '/api/academia/instructor/consejo', { galleta: c.z, datos: {} });
      assert.equal(k.codigo, 200);
      assert.ok(k.datos.consejo, 'el consejo automático');
      if (k.datos.ia?.estado === 'pendiente') {
        await c.hacer(k.datos.ia.tarea);
        assert.equal((await poll(c, c.z, k.datos.ia.tarea)).datos.estado, 'no');
      }
      // 4. El Profesor virtual: si la IA no responde, el mensaje queda respondido por el instructor automático.
      darProfesor(c.db, idDe(c, 'zoelia'), true);
      const pr = await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: '¿Qué estudio hoy?' } });
      assert.equal(pr.codigo, 200);
      if (pr.datos.ia?.estado === 'pendiente') await c.hacer(pr.datos.ia.tarea);
      const hist = (await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.z })).datos.historial.at(-1);
      assert.ok(['no', 'basico'].includes(hist.estado), hist.estado);
      if (hist.estado === 'no') assert.ok(hist.basica, '0.14.38: la respuesta básica también cuando la IA no llegó');
      assert.ok(hist.basica || hist.profe?.lineas?.length, 'el Profesor nunca queda en blanco: lo básico o lo que leyó de su historia');
      // 5. La práctica en vivo del oral: la IA no califica → 0.14.42: califica el sistema (ideas clave del libro), sin adelantar el libro.
      await subirOral(c);
      const s = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.q, datos: { n: 2 } })).datos;
      assert.ok(s.sesion, JSON.stringify(s));
      const r0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: s.sesion, i: 0, texto: 'Mi respuesta con mis palabras' } })).datos;
      if (r0.estado === 'pendiente') await hacerUltima(c, 'instructor_oral_vivo');
      const v0 = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/0`, { galleta: c.q })).datos;
      assert.equal(v0.estado, 'lista', 'sin IA: califica el sistema (nunca se queda esperando)');
      assert.equal(v0.sistema, true);
      assert.ok(['bien', 'casi', 'mal'].includes(v0.veredicto), JSON.stringify(v0));
      assert.ok(!/respuesta_(es|en)/.test(JSON.stringify([r0, v0])), 'la respuesta del libro no viaja antes del final');
      await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: s.sesion, i: 1, texto: '' } });
      const f = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.q, datos: { sesion: s.sesion } })).datos;
      assert.deepEqual(f.pendientes, [], 'nada que calificarse: lo calificó el sistema');
      assert.equal(f.cerrada, true);
      assert.equal(f.revision[0].veredicto, v0.veredicto);
      assert.ok(f.revision[0].respuesta_en, 'al final: la respuesta del libro');
      assert.ok(f.resumen && Number.isFinite(f.resumen.pct));
      // 6. La Competencia: funciona igual; la frase del certificado queda la fija.
      for (let i = 0; i < 20; i++) {
        const v = (await pedir(c.base, 'GET', '/api/academia/competencia/1', { galleta: c.z })).datos;
        const q = v.actual ?? (await pedir(c.base, 'POST', '/api/academia/competencia/1/empezar', { galleta: c.z, datos: {} })).datos.actual;
        const buena = SEMILLA[1].preguntas.find(p => p.id === q.id).correcta;
        assert.equal((await pedir(c.base, 'POST', '/api/academia/competencia/1/responder', { galleta: c.z, datos: { pregunta: q.id, elegida: i < 3 ? buena : LETRAS.find(l => l !== buena) } })).codigo, 200);
      }
      const certs = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.z })).datos.certificados;
      assert.equal(certs.length, 1);
      const pedida = c.db.prepare(`SELECT id FROM tareas WHERE datos LIKE '%"uso":"compe_frase"%'`).get();
      if (pedida) await c.hacer(pedida.id);
      const otra = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.z })).datos.certificados[0];
      assert.equal(otra.frase, null, 'sin la frase de la IA: la pantalla usa la fija de su banda');
      assert.equal(otra.banda, 'muy_bajo');
      assert.ok(ES[`compe.frase.muy_bajo.${otra.variante}`]);
      // 7. «Mejorar preguntas con IA»: si llegó a pedirse, la pantalla dice por qué no llegó y la ronda 2 queda igual.
      const m = await pedir(c.base, 'POST', '/api/admin/academia/competencia/2/mejorar', { galleta: c.admin, datos: {} });
      assert.ok([202, 409].includes(m.codigo), JSON.stringify(m.datos));
      if (m.codigo === 202) {
        await c.hacer(m.datos.tarea.id);
        const adm = (await pedir(c.base, 'GET', '/api/admin/academia/competencia', { galleta: c.admin })).datos.rondas[1];
        assert.equal(adm.pedido.estado, 'no');
        assert.ok(sePuedeDecir(adm.pedido.motivo), adm.pedido.motivo);
        assert.equal(adm.sugerencia, null);
      } else assert.equal(m.datos.error, 'ia_no_disponible');
      const r2 = await pedir(c.base, 'POST', '/api/academia/competencia/2/empezar', { galleta: c.q, datos: {} });
      assert.equal(r2.datos.actual.pregunta, SEMILLA[2].preguntas[0].pregunta);
      // Ninguna pantalla principal da error después de todo esto.
      for (const ruta of ['/api/academia/camino', '/api/academia/progreso', '/api/academia/instructor', '/api/academia/mi-repaso', '/api/academia/instructor/resumen', '/api/academia/oral/vivo', '/api/academia/competencia']) {
        const r = await pedir(c.base, 'GET', ruta, { galleta: c.z });
        assert.equal(r.codigo, 200, `${ruta}: ${JSON.stringify(r.datos)}`);
      }
      // Nada de lo enviado al proveedor llevaba el nombre de un alumno.
      for (const p of c.falso.peticiones) for (const n of NOMBRES) assert.ok(!JSON.stringify(p.cuerpo).toLowerCase().includes(n));
    }, { modelo: 'claude-haiku-5-5' });
  });
}

for (const [nombre, escena] of FALLAS) {
  test(`el Profesor virtual con la IA pedida y el proveedor fallando (${nombre}): el mensaje queda con la respuesta básica`, async () => {
    await conInstructor(async c => {
      darProfesor(c.db, idDe(c, 'zoelia'), true);
      await unaMala(c, c.z);
      c.falso.siguiente(escena);
      const pr = (await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: '¿Qué estudio hoy?' } })).datos;
      assert.equal(pr.ia.estado, 'pendiente');
      await c.hacer(pr.ia.tarea);
      const hist = (await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.z })).datos.historial.at(-1);
      assert.equal(hist.estado, 'no');
      assert.ok(hist.basica?.clave && ES[`instr.c.${hist.basica.clave}`], `la respuesta básica (${JSON.stringify(hist.basica)})`);
    }, { modelo: 'claude-haiku-5-5' });
  });
}

test('la mejora profunda de la fábrica con el proveedor fallando: no publica nada a medias, no se traba y la clase sigue como estaba', async () => {
  await conFabrica(async ({ db, falso, correr, llamadas }) => {
    const primera = await correr();
    assert.equal(primera.at(-1).resultado.motivo, 'terminada');
    guardarConfigFabrica(db, { profunda: { activa: true } });
    falso.siguiente(...Array(30).fill({ tipo: 'status', status: 500 }));
    const antes = llamadas().length;
    const r = await correr({ max: 30 });
    assert.ok(llamadas().length > antes, 'la mejora profunda sí llamó (y falló)');
    // Cada paso termina o pide esperar (nunca lanza); la clase publicada no cambió.
    assert.ok(r.length > 0);
    for (const x of r) assert.ok(x.listo === true || typeof x.punto !== 'undefined' || x.esperarMs >= 0, JSON.stringify(x));
    assert.notEqual(estadoProfunda(db, 'sistemas').estado, 'publicada', 'sin IA no se publica una clase nueva');
  });
});

// ---------- La IA de la Competencia, de punta a punta (con el proveedor falso respondiendo bien) ----------
async function jugarRonda(c, galleta, n, buenas) {
  await pedir(c.base, 'POST', `/api/academia/competencia/${n}/empezar`, { galleta, datos: {} });
  for (let i = 0; i < 20; i++) {
    const q = (await pedir(c.base, 'GET', `/api/academia/competencia/${n}`, { galleta })).datos.actual;
    const buena = SEMILLA[n].preguntas.find(p => p.id === q.id).correcta;
    assert.equal((await pedir(c.base, 'POST', `/api/academia/competencia/${n}/responder`, { galleta, datos: { pregunta: q.id, elegida: i < buenas ? buena : LETRAS.find(l => l !== buena) } })).codigo, 200);
  }
}

test('Competencia con IA: la frase personal del certificado llega por el trabajador; «Mejorar preguntas» deja una sugerencia que se aprueba', async () => {
  await conInstructor(async c => {
    // La frase: al mirar sus certificados se pide una vez (sin su nombre) y queda guardada en el certificado.
    await jugarRonda(c, c.z, 3, 6);
    const antes = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.z })).datos.certificados[0];
    assert.equal(antes.frase, null);
    const t = c.db.prepare(`SELECT id, datos FROM tareas WHERE datos LIKE '%"uso":"compe_frase"%'`).get();
    assert.ok(t, 'la frase se pidió a la IA');
    for (const n of NOMBRES) assert.ok(!t.datos.toLowerCase().includes(n), 'sin el nombre del alumno');
    c.falso.siguiente({ tipo: 'ok', json: { frase: 'Con 6 de 20, la torre te manda un cafecito y un repaso 😂' } });
    const h = await c.hacer(t.id);
    assert.deepEqual([h.estado, h.resultado.usada], ['hecha', true]);
    const despues = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.z })).datos.certificados[0];
    assert.equal(despues.frase, 'Con 6 de 20, la torre te manda un cafecito y un repaso 😂');
    assert.equal(despues.codigo, antes.codigo);
    // Mirarlos otra vez no la pide de nuevo.
    await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.z });
    assert.equal(c.db.prepare(`SELECT COUNT(*) AS n FROM tareas WHERE datos LIKE '%"uso":"compe_frase"%'`).get().n, 1);
    // «Mejorar preguntas con IA» (el administrador): la sugerencia llega, se ve con el «antes» y se aprueba.
    const m = await pedir(c.base, 'POST', '/api/admin/academia/competencia/5/mejorar', { galleta: c.admin, datos: {} });
    assert.equal(m.codigo, 202, JSON.stringify(m.datos));
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/competencia', { galleta: c.admin })).datos.rondas[4].pedido.estado, 'pendiente');
    c.falso.siguiente({ tipo: 'ok', json: { cambios: [{ id: 'r5-01', pregunta: '¿Qué nube trae las tormentas eléctricas?', explicacion: 'El cumulonimbo: rayos, granizo y turbulencia fuerte.', bien: '¡Esa la clavaste!', mal: 'Esa nube no era, mi pana.' }] } });
    const hm = await c.hacer(m.datos.tarea.id);
    assert.deepEqual([hm.estado, hm.resultado.usada], ['hecha', true], JSON.stringify(hm.resultado));
    const adm = (await pedir(c.base, 'GET', '/api/admin/academia/competencia', { galleta: c.admin })).datos.rondas[4];
    assert.equal(adm.pedido, null);
    assert.equal(adm.sugerencia.cambios[0].pregunta, '¿Qué nube trae las tormentas eléctricas?');
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/competencia/5/aprobar', { galleta: c.admin, datos: {} })).datos.aplicados, 1);
    const e = (await pedir(c.base, 'POST', '/api/academia/competencia/5/empezar', { galleta: c.q, datos: {} })).datos;
    assert.equal(e.actual.pregunta, '¿Qué nube trae las tormentas eléctricas?');
  }, { modelo: 'claude-haiku-5-5' });
});

test('Competencia con la IA fallando: «Mejorar preguntas» dice por qué no llegó y la frase queda la fija', async () => {
  await conInstructor(async c => {
    const m = await pedir(c.base, 'POST', '/api/admin/academia/competencia/6/mejorar', { galleta: c.admin, datos: {} });
    assert.equal(m.codigo, 202);
    c.falso.siguiente('sin_credito_400');
    await c.hacer(m.datos.tarea.id);
    const adm = (await pedir(c.base, 'GET', '/api/admin/academia/competencia', { galleta: c.admin })).datos.rondas[5];
    assert.equal(adm.pedido.estado, 'no');
    assert.ok(sePuedeDecir(adm.pedido.motivo), adm.pedido.motivo);
    assert.equal(adm.sugerencia, null);
  }, { modelo: 'claude-haiku-5-5' });
  await conInstructor(async c => {
    await jugarRonda(c, c.z, 4, 2);
    await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.z });
    const t = c.db.prepare(`SELECT id FROM tareas WHERE datos LIKE '%"uso":"compe_frase"%'`).get();
    assert.ok(t);
    c.falso.siguiente({ tipo: 'status', status: 500 });
    assert.equal((await c.hacer(t.id)).resultado.usada, false);
    const cert = (await pedir(c.base, 'GET', '/api/academia/competencia/certificados', { galleta: c.z })).datos.certificados[0];
    assert.equal(cert.frase, null);
    assert.ok(ES[`compe.frase.${cert.banda}.${cert.variante}`]);
  }, { modelo: 'claude-haiku-5-5' });
});

test('la práctica en vivo del oral con la calificación de la IA pedida y el proveedor fallando: «pendiente» y después califica el sistema', async () => {
  for (const [, escena] of FALLAS) {
    await conInstructor(async c => {
      await subirOral(c);
      const s = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 2 } })).datos;
      c.falso.siguiente(escena);
      const r0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 0, texto: 'Mi respuesta con mis palabras' } })).datos;
      assert.equal(r0.estado, 'pendiente');
      assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/0`, { galleta: c.z })).datos.estado, 'pendiente');
      await hacerUltima(c, 'instructor_oral_vivo');
      const v0 = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/0`, { galleta: c.z })).datos;
      assert.equal(v0.estado, 'lista', JSON.stringify(v0));
      assert.equal(v0.sistema, true);
      assert.ok(['bien', 'casi', 'mal'].includes(v0.veredicto));
      assert.ok(!/respuesta_(es|en)/.test(JSON.stringify(v0)));
      const f = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.z, datos: { sesion: s.sesion } })).datos;
      assert.ok(!f.pendientes.includes(0) && f.revision[0].respuesta_en && f.revision[0].veredicto === v0.veredicto);
    }, { modelo: 'claude-haiku-5-5' });
  }
});

test('verificar el código de un certificado de la galería no descubre el nombre de quien tiene «Perfil privado»', async () => {
  await conInstructor(async c => {
    const zid = idDe(c, 'zoelia');
    c.db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, '1', ?)").run(`academia.grupo_oculto.${zid}`, new Date().toISOString());
    await jugarRonda(c, c.z, 2, 10);
    const g = (await pedir(c.base, 'GET', '/api/academia/competencia/2/certificados', { galleta: c.q })).datos.certificados[0];
    assert.match(g.nombre, /^Piloto \d+$/);
    const v = (await pedir(c.base, 'GET', `/api/certificados/verificar/${g.codigo}`, { galleta: c.q })).datos;
    assert.equal(v.valido, true);
    assert.equal(v.nombre, g.nombre, 'el mismo alias que en la galería');
    assert.doesNotMatch(JSON.stringify(v), /zoelia/i);
    // Su dueña y el administrador sí ven el nombre.
    assert.match((await pedir(c.base, 'GET', `/api/certificados/verificar/${g.codigo}`, { galleta: c.z })).datos.nombre, /zoelia/i);
    assert.match((await pedir(c.base, 'GET', `/api/certificados/verificar/${g.codigo}`, { galleta: c.admin })).datos.nombre, /zoelia/i);
  });
});
