// 0.14.91 («dale último chequeo que funcione sin API si se llegara a caer todo»): con TODOS los servicios de afuera
// muertos a la vez (Claude, ChatGPT, ElevenLabs, Google Drive y los archivos del dictado), de dos formas (el puerto
// cerrado: ECONNREFUSED; y uno que acepta y corta la conexión), cada pantalla del alumno y del administrador responde sin
// error del servidor, lo del alumno llega con lo básico, cada cosa con IA termina en «no» con un motivo que se dice en los
// dos idiomas (nunca «pendiente» para siempre), el trabajador no vuelve a llamar a un servicio caído en cada pedido (la
// clave queda en pausa) y el administrador ve UN aviso por servicio, no uno por cada falla.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conInstructor, pedir, unaMala, explicar, DUENO } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { claveOpenai } from './ia-base.js';
import { guardarSecreto, anotarPrueba } from '../src/claves/almacen.js';
import { probarSecreto } from '../src/claves/probar.js';
import { guardarConfigIa } from '../src/ia/config.js';
import { guardarConfigVoz } from '../src/academia/voz-natural.js';
import { guardarCarpetaDrive } from '../src/academia/drive-estado.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ES = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const EN = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const sePuedeDecir = motivo => ['instr.motivo.', 'ia.motivo.'].some(p => ES[`${p}${motivo}`] && EN[`${p}${motivo}`]);
const CARPETA = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

// Todas las rutas GET sin parámetros de src/api (las pantallas las piden al abrir).
function rutasGet() {
  const rutas = new Set();
  for (const f of readdirSync(join(RAIZ, 'src/api'))) {
    for (const m of readFileSync(join(RAIZ, 'src/api', f), 'utf8').matchAll(/rutas\.agregar\('GET', '([^':]+)'/g)) rutas.add(m[1]);
  }
  return [...rutas];
}

// Un servicio de afuera con un interruptor: 'pasar' (al proveedor falso, para probar la clave como el día que se pegó),
// 'cerrado' (nadie escucha) o 'corta' (acepta y corta). Cuenta las conexiones que le llegan.
async function crearServicio(arriba) {
  let modo = 'pasar';
  let conexiones = 0;
  const srv = createServer((req, res) => {
    const u = new URL(arriba);
    const p = request({ host: u.hostname, port: u.port, method: req.method, path: req.url, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', () => res.destroy());
    req.pipe(p);
  });
  srv.on('connection', s => { conexiones += 1; if (modo === 'corta') s.destroy(); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const puerto = srv.address().port;
  return {
    url: `http://127.0.0.1:${puerto}`,
    get conexiones() { return conexiones; },
    async poner(m) {
      srv.closeAllConnections(); // también las que quedaron abiertas (keep-alive) de cuando funcionaba
      if (m === 'cerrado' && modo !== 'cerrado') { srv.closeAllConnections(); await new Promise(ok => srv.close(ok)); }
      if (m !== 'cerrado' && modo === 'cerrado') await new Promise(ok => srv.listen(puerto, '127.0.0.1', ok));
      modo = m;
    },
    async cerrar() { if (modo !== 'cerrado') { srv.closeAllConnections(); await new Promise(ok => srv.close(ok)); } },
  };
}

for (const muerte of ['cerrado', 'corta']) {
  test(`todo caído a la vez (${muerte}): el alumno y el administrador siguen, sin 5xx, sin esperas sin fin y con un aviso por servicio`, async () => {
    const { crearProveedorFalso } = await import('./proveedor-falso.js');
    const otro = await crearProveedorFalso();
    const ia = await crearServicio(otro.base);
    const fuera = await crearServicio(otro.base); // ElevenLabs y Drive: nunca respondieron bien en esta prueba
    try {
      await conInstructor(async c => {
        // Las claves de todos, como el día que se pegaron (ChatGPT probada de verdad contra el falso).
        const so = guardarSecreto(c.db, c.config, { uso: 'ia_openai', valor: claveOpenai(), usuarioId: c.adminId }).secreto.id;
        assert.equal((await probarSecreto(c.db, c.config, { id: so, usuarioId: c.adminId })).motivo, 'ok');
        guardarConfigIa(c.db, { usar: { anthropic: true, openai: true } }, { config: c.config, usuarioId: c.adminId });
        const se = guardarSecreto(c.db, c.config, { uso: 'voz_elevenlabs', valor: ['sk', 'f0'.repeat(24)].join('_'), usuarioId: c.adminId }).secreto.id;
        anotarPrueba(c.db, { id: se, motivo: 'ok' });
        guardarConfigVoz(c.db, { usar: true });
        guardarCarpetaDrive(c.db, CARPETA);
        const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(paqueteOralMuestra()) });
        for (const a of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${a}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
        assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} })).codigo, 200);

        // Se cae todo.
        await ia.poner(muerte);
        await fuera.poner(muerte);
        const t0 = Date.now();

        // 1. Explicar: lo básico enseguida; la IA termina en «no» con un motivo que se dice.
        const motivos = [];
        for (const galleta of [c.z, c.q, c.z]) {
          const x = await unaMala(c, galleta);
          const e = await explicar(c, galleta, x);
          assert.equal(e.codigo, 200);
          assert.ok(e.datos.basica, 'la explicación básica llega siempre');
          if (e.datos.ia?.estado === 'pendiente') {
            const h = await c.hacer(e.datos.ia.tarea);
            assert.equal(h.estado, 'hecha', JSON.stringify(h.resultado));
            const p = (await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${e.datos.ia.tarea}`, { galleta })).datos;
            assert.equal(p.estado, 'no');
            motivos.push(p.motivo);
          } else if (e.datos.ia) {
            assert.equal(e.datos.ia.estado, 'no');
            motivos.push(e.datos.ia.motivo);
          }
        }
        for (const mo of motivos) assert.ok(sePuedeDecir(mo), `motivo «${mo}» sin texto para el alumno`);
        const conexionesIa = ia.conexiones;
        // 2. Más pedidos después de la falla: la clave quedó en pausa y nadie vuelve a tocar la red en cada pedido.
        for (let i = 0; i < 4; i++) {
          const x = await unaMala(c, i % 2 ? c.q : c.z);
          const e = await explicar(c, i % 2 ? c.q : c.z, x);
          assert.equal(e.codigo, 200);
          if (e.datos.ia?.estado === 'pendiente') await c.hacer(e.datos.ia.tarea);
        }
        assert.ok(ia.conexiones - conexionesIa <= 1, `después de fallar no se martilla al proveedor caído (${ia.conexiones - conexionesIa} conexiones más)`);

        // 3. El oral en vivo: califica el sistema; la voz natural dice «no» (la pantalla usa la del teléfono).
        const v = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.q, datos: { n: 1 } })).datos;
        const r0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: v.sesion, i: 0, texto: 'Puede llevar amigos, nunca por paga.' } })).datos;
        if (r0.estado === 'pendiente') {
          const t = c.db.prepare("SELECT id FROM tareas WHERE tipo = 'academia.instructor' ORDER BY id DESC").get();
          await c.hacer(t.id);
        }
        const v0 = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${v.sesion}/0`, { galleta: c.q })).datos;
        assert.equal(v0.estado, 'lista');
        assert.ok(['bien', 'casi', 'mal'].includes(v0.veredicto));
        let voz = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.q, datos: { sesion: v.sesion, i: 0, idioma: 'es' } })).datos;
        for (let k = 0; k < 10 && voz.estado === 'pendiente'; k++) {
          const t = c.db.prepare("SELECT id FROM tareas WHERE estado IN ('lista', 'trabajando', 'esperando') ORDER BY id DESC").get();
          if (t) await c.hacer(t.id);
          voz = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.q, datos: { sesion: v.sesion, i: 0, idioma: 'es' } })).datos;
        }
        assert.equal(voz.estado, 'no', `la voz natural termina en «no» (y suena la del teléfono): ${JSON.stringify(voz)}`);
        // «Escuchar» de las clases: lo mismo.
        let lv = (await pedir(c.base, 'POST', '/api/academia/lectura/voz', { galleta: c.z, datos: { textos: ['La presión baja con la altura.'] } })).datos;
        for (let k = 0; k < 10 && lv.partes?.[0]?.estado === 'pendiente'; k++) {
          const t = c.db.prepare("SELECT id FROM tareas WHERE estado IN ('lista', 'trabajando', 'esperando') ORDER BY id DESC").get();
          if (t) await c.hacer(t.id);
          lv = (await pedir(c.base, 'POST', '/api/academia/lectura/voz', { galleta: c.z, datos: { textos: ['La presión baja con la altura.'] } })).datos;
        }
        assert.ok(['no', undefined].includes(lv.partes?.[0]?.estado) || lv.partes == null, JSON.stringify(lv));
        // El dictado en el equipo: los archivos no se pueden bajar → «no» (la pantalla usa el otro dictado).
        let ve = (await pedir(c.base, 'GET', '/api/academia/voz/estado', { galleta: c.z })).datos;
        for (let k = 0; k < 50 && ve.estado === 'bajando'; k++) { await new Promise(ok => setTimeout(ok, 20)); ve = (await pedir(c.base, 'GET', '/api/academia/voz/estado', { galleta: c.z })).datos; }
        assert.equal(ve.estado, 'no');

        // 4. Drive «Probar»: responde enseguida con un motivo (sin colgar la pantalla).
        const dp = await pedir(c.base, 'POST', '/api/admin/academia/drive/probar', { galleta: c.admin, datos: { enlace: `https://drive.google.com/drive/folders/${CARPETA}` } });
        assert.equal(dp.codigo, 200);
        assert.equal(dp.datos.ok, false);
        assert.ok(ES[`academia.drive.motivo.${dp.datos.motivo}`] || ES[`drive.motivo.${dp.datos.motivo}`] || dp.datos.motivo === 'sin_red', dp.datos.motivo);

        // 5. Cada pantalla (cada GET sin parámetros), del alumno y del administrador: nunca un error del servidor.
        for (const ruta of rutasGet()) {
          for (const [quien, galleta] of [['alumno', c.z], ['admin', c.admin]]) {
            const r = await pedir(c.base, 'GET', ruta, { galleta, cabeceras: quien === 'admin' ? DUENO : {} });
            assert.ok(r.codigo < 500, `${quien} ${ruta}: ${r.codigo} ${JSON.stringify(r.datos).slice(0, 200)}`);
          }
        }

        // 6. Pasa la pausa corta (2 min) y el proveedor SIGUE caído: la siguiente llamada falla otra vez, la pausa crece
        // (5 min) y ahora sí se avisa al dueño (0.14.91: antes, sin red nunca avisaba).
        assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave LIKE 'ia_proveedor:%' AND resuelto_en IS NULL").get().n, 0, 'un solo tropiezo no se avisa');
        for (let vuelta = 0; vuelta < 2; vuelta++) {
          c.db.prepare('UPDATE secretos SET pausa_hasta = ? WHERE pausa_hasta IS NOT NULL').run(new Date(Date.now() - 1000).toISOString());
          for (const galleta of [c.z, c.q]) {
            const e = await explicar(c, galleta, await unaMala(c, galleta));
            assert.ok(e.datos.basica);
            if (e.datos.ia?.estado === 'pendiente') await c.hacer(e.datos.ia.tarea);
          }
        }
        const pausas = c.db.prepare("SELECT pausa_desde, pausa_hasta FROM secretos WHERE uso IN ('ia_anthropic', 'ia_openai')").all();
        for (const p of pausas) assert.ok(Date.parse(p.pausa_hasta) - Date.now() > 4 * 60_000, `la pausa crece (2 → 5 → 15 min): ${JSON.stringify(p)}`);

        // 7. El administrador: UN aviso por servicio (las fallas se suman en «veces», no en filas nuevas).
        const avisos = c.db.prepare('SELECT clave, COUNT(*) AS n FROM avisos WHERE resuelto_en IS NULL GROUP BY clave').all();
        for (const a of avisos) assert.equal(a.n, 1, `aviso repetido: ${a.clave} × ${a.n}`);
        assert.ok(avisos.some(a => a.clave === 'ia_proveedor:anthropic') && avisos.some(a => a.clave === 'ia_proveedor:openai'), `el administrador sabe que la IA no responde: ${JSON.stringify(avisos)}`);
        const sistema = await pedir(c.base, 'GET', '/api/admin/sistema', { galleta: c.admin });
        assert.equal(sistema.codigo, 200);
        assert.ok(Date.now() - t0 < 60_000, 'nada de esto espera a un servicio caído');
      }, { bases: { anthropic: ia.url, openai: ia.url, elevenlabs: fuera.url }, extra: { driveBases: Object.freeze({ lista: fuera.url, bajar: fuera.url }) } });
    } finally {
      await ia.cerrar();
      await fuera.cerrar();
      await otro.cerrar?.();
    }
  });
}

// Escenario C: la IA está encendida y su clave todavía no está en pausa; el alumno pide y JUSTO se acaba el crédito (o se
// cae el proveedor). Antes veía solo «no se pudo» aunque la IA ya hubiera escrito eso mismo para otro alumno (0.14.57).
// Ahora, al terminar la tarea sin IA, recibe lo guardado (gratis): la explicación de un error, «Explícamelo mejor» de una
// tarjeta y la mini-clase de «Mi repaso».
test('0.14.91: el crédito se acaba a mitad del pedido: llega lo que la IA ya había escrito (no solo «no se pudo»)', async () => {
  const { explicacionFalsa, DE } = await import('./instructor-ia-base.js');
  const correctaNum = id => String(DE(id).original.opciones.findIndex(o => o.letra === DE(id).original.correcta) + 1);
  const TEMA = { materia: 'factores_humanos', tema: 'muestra-hipoxia' };
  const sinPausa = c => c.db.prepare('UPDATE secretos SET pausa_motivo = NULL, pausa_desde = NULL, pausa_hasta = NULL').run();
  await conInstructor(async c => {
    guardarConfigIa(c.db, { prepararClase: false }, { config: c.config, usuarioId: c.adminId });
    for (const g of [c.z, c.q]) for (let k = 0; k < 3; k++) await unaMala(c, g, 'muestra-h1');
    // Zoelia (español) con la IA viva: la explicación, «Explícamelo mejor» de la tarjeta 1 y la mini-clase.
    const x = await unaMala(c, c.z, 'muestra-h1');
    c.falso.siguiente(explicacionFalsa(correctaNum('muestra-h1')));
    const e = (await explicar(c, c.z, x)).datos;
    assert.equal((await c.hacer(e.ia.tarea)).estado, 'hecha');
    c.falso.siguiente({ tipo: 'ok', json: { explicacion: 'Arriba el aire está menos apretado: cada respiración trae menos oxígeno.', ejemplo: 'Subiendo a 12 000 pies.', recuerda: 'Más alto, menos oxígeno.', terminos: [] } });
    const t = (await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.z, datos: { ...TEMA, tarjeta: 1, tipo: 'mejor', ia: true } })).datos;
    assert.equal((await c.hacer(t.ia.tarea)).estado, 'hecha');
    const concepto = (await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.z })).datos.paraRepasar.find(r => r.clave).clave;
    const clase = (await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(concepto)}`, { galleta: c.z })).datos;
    c.falso.siguiente({ tipo: 'ok', json: { opcion_correcta: correctaNum(clase.pregunta.id), concepto: 'Arriba la presión baja y entra menos oxígeno.', ejemplo: 'A 12 000 pies.', trampa: 'Fíjate en «suficiente».', recuerda: 'Menos presión.', terminos: [] } });
    const mz = (await pedir(c.base, 'POST', '/api/academia/mi-repaso/clase/ia', { galleta: c.z, datos: { concepto } })).datos;
    assert.equal((await c.hacer(mz.ia.tarea)).estado, 'hecha');

    // Quirino estudia en inglés (su pedido es OTRO: no está guardado tal cual) y se acaba el crédito justo al pedir.
    c.db.prepare("UPDATE usuarios SET idioma = 'en' WHERE nombre = 'quirino'").run();
    const conCredito = async (pedirlo, que) => {
      sinPausa(c);
      c.falso.siguiente(...Array(6).fill('sin_credito_400'));
      const r = await pedirlo();
      assert.equal(r.ia?.estado, 'pendiente', `${que}: la clave aún no estaba en pausa: se pide (${JSON.stringify(r.ia)})`);
      const h = await c.hacer(r.ia.tarea);
      assert.equal(h.estado, 'hecha');
      assert.equal(h.resultado.usada, false, `${que}: la IA no llegó`);
      const p = (await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${r.ia.tarea}`, { galleta: c.q })).datos;
      assert.deepEqual([p.estado, p.guardada], ['lista', true], `${que}: lo guardado, no «no se pudo»: ${JSON.stringify(p).slice(0, 200)}`);
      return p;
    };
    const y = await unaMala(c, c.q, 'muestra-h1');
    const pe = await conCredito(async () => (await explicar(c, c.q, y)).datos, 'explicar');
    assert.match(pe.explicacion, /oxígeno/);
    const pt = await conCredito(async () => (await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.q, datos: { ...TEMA, tarjeta: 1, tipo: 'mejor', ia: true } })).datos, 'tarjeta');
    assert.equal(pt.tipo, 'mejor');
    assert.match(pt.explicacion, /menos apretado/);
    const cq = (await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.q })).datos.paraRepasar.find(r => r.clave).clave;
    assert.equal(cq, concepto);
    const pm = await conCredito(async () => (await pedir(c.base, 'POST', '/api/academia/mi-repaso/clase/ia', { galleta: c.q, datos: { concepto } })).datos, 'mini-clase');
    assert.match(pm.concepto, /presión baja/);
    // Sin nada guardado (otra pregunta), sigue el «no» de siempre con su motivo.
    const otra = await unaMala(c, c.q, 'muestra-h2');
    sinPausa(c);
    c.falso.siguiente(...Array(6).fill('sin_credito_400'));
    const eo = (await explicar(c, c.q, otra)).datos;
    if (eo.ia?.estado === 'pendiente') {
      await c.hacer(eo.ia.tarea);
      const po = (await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${eo.ia.tarea}`, { galleta: c.q })).datos;
      assert.equal(po.estado, 'no');
      assert.ok(sePuedeDecir(po.motivo), po.motivo);
    }
  });
});
