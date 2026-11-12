// Pruebas de la 0.12.5: el Grupo, tema por tema. Cada compañero trae su «ruta» (el tema donde va y los temas que terminó
// o dominó) y el grupo trae el «mapa» (materias y temas, en orden). Nada de notas: ni porcentajes, ni intentos, ni
// respuestas. Quien tiene «Perfil privado» no aparece para los demás. Datos inventados (la muestra).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const CLAVE = 'una clave bien larga';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
async function pedir(base, metodo, ruta, { galleta, datos, cabeceras = {}, cuerpo } = {}) {
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras }, body: datos ? JSON.stringify(datos) : cuerpo });
  return { codigo: r.status, datos: await r.json().catch(() => null), galleta: r.headers.get('set-cookie')?.split(';')[0] };
}
const HIPOXIA = 'factores_humanos/muestra-hipoxia';
const ILUSIONES = 'factores_humanos/muestra-ilusiones';

test('grupo 0.12.5: la ruta de cada compañero (tema actual, terminados y dominados), sin notas y sin los privados', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    const ids = {};
    const g = {};
    for (const nombre of ['ana', 'beto', 'caro']) {
      ids[nombre] = crearUsuario(db, { nombre, nombreVisible: nombre[0].toUpperCase() + nombre.slice(1), claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      g[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    const p = paqueteMuestra();
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(p) });
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${p.figuras[0].archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} });
    // Ana aprobó la hipoxia (dominada) y va en ilusiones; Caro vio toda la clase de la hipoxia e hizo su práctica sin
    // aprobarla (terminada) y sigue ahí; Beto no empezó.
    const intento = (u, aciertos, aprobado) => db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en)
      VALUES (?, 'tema', 'factores_humanos', 'muestra-hipoxia', 5, 5, ?, ?, '2026-11-10T10:00:00Z', '2026-11-10T10:10:00Z')`).run(u, aciertos, aprobado);
    intento(ids.ana, 5, 1);
    intento(ids.caro, 2, 0);
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-11-10')").run(`academia.tema_paso.${ids.caro}`, JSON.stringify({ [HIPOXIA]: { paso: 5, max: 5, total: 6, en: '2026-11-10T10:00:00Z' } }));

    const grupoDe = async galleta => (await pedir(base, 'GET', '/api/academia/progreso', { galleta })).datos.grupo;
    let grupo = await grupoDe(g.caro);
    // El mapa: solo materias con contenido y sus temas (id y título), en orden.
    assert.deepEqual(grupo.mapa, [{ materia: 'factores_humanos', temas: p.materias[0].temas.map(t => ({ id: t.id, titulo: t.titulo })) }]);
    const de = nombre => grupo.companeros.find(x => x.nombre.startsWith(nombre));
    assert.deepEqual(de('Ana').ruta, { actual: ILUSIONES, terminados: [], dominados: [HIPOXIA] });
    assert.deepEqual(de('Caro').ruta, { actual: HIPOXIA, terminados: [HIPOXIA], dominados: [] });
    assert.deepEqual(de('Beto').ruta, { actual: HIPOXIA, terminados: [], dominados: [] });
    // Sin notas: la ruta tiene exactamente esas tres cosas, y todo son ids de temas del mapa.
    const validos = new Set(grupo.mapa.flatMap(m => m.temas.map(t => `${m.materia}/${t.id}`)));
    for (const x of grupo.companeros) {
      assert.deepEqual(Object.keys(x.ruta).sort(), ['actual', 'dominados', 'terminados']);
      for (const k of [x.ruta.actual, ...x.ruta.terminados, ...x.ruta.dominados]) assert.ok(k === null || validos.has(k), k);
      assert.doesNotMatch(JSON.stringify(x.ruta), /aciertos|mejor|pct|nota|intento|respuesta|\d/);
    }
    assert.doesNotMatch(JSON.stringify(grupo.mapa), /preguntas|secciones|tg-|correcta/);
    // Beto se pone «Perfil privado»: Caro ya no lo ve (ni su ruta); él se sigue viendo.
    assert.equal((await pedir(base, 'POST', '/api/academia/grupo', { galleta: g.beto, datos: { oculto: true } })).codigo, 200);
    grupo = await grupoDe(g.caro);
    assert.deepEqual(grupo.companeros.map(x => x.nombre).sort(), ['Ana', 'Caro']);
    assert.ok((await grupoDe(g.beto)).companeros.some(x => x.tu));
    // Ana terminó todo: sin tema actual (avioneta al final).
    db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en)
      VALUES (?, 'tema', 'factores_humanos', 'muestra-ilusiones', 5, 5, 5, 1, '2026-11-11T10:00:00Z', '2026-11-11T10:10:00Z')`).run(ids.ana);
    grupo = await grupoDe(g.caro);
    assert.deepEqual(grupo.companeros.find(x => x.nombre.startsWith('Ana')).ruta, { actual: null, terminados: [], dominados: [HIPOXIA, ILUSIONES] });
  });
  db.close();
});

test('grupo 0.12.5: en la pantalla, una ruta por materia con una avioneta por compañero y los puntos morado/dorado', () => {
  const app = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  const vista = app.slice(app.indexOf('function rutasDeTemas('), app.indexOf('function filaCompanero('));
  for (const x of ['avionSvg()', "setProperty('--x'", "'dominado'", "'terminado'", 'leyenda-punto morado', 'leyenda-punto dorado', "svgEl('circle'"]) assert.ok(vista.includes(x), x);
  assert.doesNotMatch(vista, /\.pct|racha|medallas|mejor/, 'la ruta no muestra notas');
  assert.match(app, /rutasDeTemas\(g\),/);
});
