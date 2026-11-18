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
      // 5. La práctica en vivo del oral: la IA no califica → «califícate tú» con la respuesta del libro, al final.
      await subirOral(c);
      const s = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.q, datos: { n: 2 } })).datos;
      assert.ok(s.sesion, JSON.stringify(s));
      const r0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: s.sesion, i: 0, texto: 'Mi respuesta con mis palabras' } })).datos;
      if (r0.estado === 'pendiente') await hacerUltima(c, 'instructor_oral_vivo');
      const v0 = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/0`, { galleta: c.q })).datos;
      assert.equal(v0.estado, 'sin_ia', 'sin IA: se califica él (nunca se queda esperando)');
      await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: s.sesion, i: 1, texto: '' } });
      const f = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.q, datos: { sesion: s.sesion } })).datos;
      assert.deepEqual(f.pendientes, [0]);
      assert.ok(f.revision[0].respuesta_en, 'para calificarse: la respuesta del libro');
      const f2 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.q, datos: { sesion: s.sesion, auto: { 0: 'bien' } } })).datos;
      assert.equal(f2.cerrada, true);
      assert.ok(f2.resumen && Number.isFinite(f2.resumen.pct));
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
