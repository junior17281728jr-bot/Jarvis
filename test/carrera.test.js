// Pruebas de la Academia 0.14.14: «La carrera» (arriba de Progreso) y lo que ve cada alumno de los demás.
//  - Solo con sesión (401); no-store; de los demás SOLO alias, % y «M3 · T2» (ni ids, ni usuarios, ni correos).
//  - «Mostrar nombres en la carrera» apagado: «Piloto 1, 2…» (salvo «Tú»); el «Perfil privado» siempre «Piloto».
//  - No corren: administradores, cuentas eliminadas ni bloqueadas.
//  - El puesto («Vas 2.º de 5»), los empates, el promedio y los aviones juntos («+3», nunca más de 8).
// Reloj falso y fechas escritas a mano. Contenido inventado (test/academia-muestra.js, test/oral-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { ponerNombreLegal } from '../src/cuentas/terminos.js';
import { aliasDe } from '../src/academia/carrera.js';
import { agruparAviones, puestoDe, promedioDe, ordenTabla } from '../public/carrera-vista.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';

const CLAVE = 'una clave bien larga';
const AHORA = Date.parse('2026-11-13T15:00:00Z');
const MIN = 60 * 1000;
const iso = ms => new Date(ms).toISOString();

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const o = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) o.headers.Cookie = galleta;
  if (datos !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) o.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, o);
  const c = await r.json().catch(() => ({}));
  const sc = r.headers.get('set-cookie');
  return { codigo: r.status, datos: c, galleta: sc ? sc.split(';')[0] : null, cache: r.headers.get('cache-control') };
}

function intento(db, usuario, { materia, tema, en }) {
  db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en, orden)
    VALUES (?, 'tema', ?, ?, 5, 5, 5, 1, ?, ?, '[]')`).run(usuario, materia, tema, iso(en - MIN), iso(en));
}

async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { reloj: () => AHORA } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } });
    assert.equal(admin.codigo, 201);
    for (const pq of [paqueteMuestra(), paqueteOralMuestra()]) {
      const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(pq) });
      assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
      for (const a of s.datos.faltan ?? []) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${a}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
      assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    }
    const hash = await hashClave(CLAVE);
    const nuevo = (nombre, nombreVisible = null) => crearUsuario(db, { nombre, nombreVisible, claveHash: hash, debeCambiarClave: false });
    const entrar = async nombre => (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    await fn({ base, db, admin: admin.galleta, nuevo, entrar });
  });
  db.close();
}

test('la carrera: solo con sesión, sin memoria, y de los demás solo alias + % (nunca ids, usuarios ni correos)', async () => {
  await conAcademia(async ({ base, db, admin, nuevo, entrar }) => {
    const ana = nuevo('ana.correo@example.com', 'Ana María Pérez');
    const beto = nuevo('beto77', 'Beto Gómez');
    const ciro = nuevo('ciro', 'Ciro');
    const dani = nuevo('dani', 'Dani Ruiz');
    const eva = nuevo('eva', 'Eva Sosa');
    const fito = nuevo('fito', 'Fito');
    ponerNombreLegal(db, beto, { nombre: 'Roberto', apellido: 'Gómez' }, { por: 'persona' });
    // Ciro, bloqueado; Dani, eliminado (papelera); un segundo administrador: ninguno corre.
    db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(ciro);
    db.prepare('UPDATE usuarios SET eliminado_en = ? WHERE id = ?').run(iso(AHORA), dani);
    crearUsuario(db, { nombre: 'otroadmin', nombreVisible: 'Otro Admin', claveHash: await hashClave(CLAVE), rol: 'admin', debeCambiarClave: false });
    // Eva puso «Perfil privado» (el del Grupo).
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, '1', ?)").run(`academia.grupo_oculto.${eva}`, iso(AHORA));
    const p = paqueteMuestra();
    intento(db, beto, { materia: p.materias[0].id, tema: p.materias[0].temas[0].id, en: AHORA - 10 * MIN });

    assert.equal((await pedir(base, 'GET', '/api/academia/carrera')).codigo, 401);
    const g = await entrar('ana.correo@example.com');
    const r = await pedir(base, 'GET', '/api/academia/carrera', { galleta: g });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.match(r.cache ?? '', /no-store/);
    assert.equal(r.datos.nombres, true);
    assert.equal(r.datos.oral, true);
    for (const x of r.datos.pilotos) assert.deepEqual(Object.keys(x).sort(), ['alias', 'esYo', 'oral', 'oralEn', 'tg', 'tgEn']);
    assert.deepEqual(r.datos.pilotos.map(x => [x.alias, x.esYo]), [['Ana', true], ['Roberto', false], ['Piloto 2', false], ['Fito', false]]);
    const roberto = r.datos.pilotos.find(x => x.alias === 'Roberto');
    assert.ok(roberto.tg > 0);
    assert.deepEqual(roberto.tgEn, { n: 1, t: 2 });
    // Lo de los demás: ni apellidos enteros, ni usuarios, ni correos, ni los que no corren.
    const otros = JSON.stringify(r.datos.pilotos);
    for (const nada of ['@', 'Gómez', 'beto77', 'Eva', 'Sosa', 'Ciro', 'Dani', 'Otro', 'junior', String(beto)]) assert.ok(!otros.includes(nada), nada);
    // Lo propio solo en «yo».
    assert.deepEqual(Object.keys(r.datos.yo).sort(), ['avance', 'datos']);
    assert.deepEqual(Object.keys(r.datos.yo.datos).sort(), ['examenes', 'minutosSemana', 'notaMedia', 'racha', 'temas']);
    assert.equal(r.datos.yo.avance.tg.pct, 0);

    // Apagado «Mostrar nombres»: solo «Tú» (su nombre) y «Piloto N» por orden de cuenta.
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/carrera', { galleta: g, datos: { nombres: false } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/carrera', { galleta: admin, datos: { nombres: 'no' } })).codigo, 400);
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/carrera', { galleta: admin, datos: { nombres: false } })).datos.carreraNombres, false);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia', { galleta: admin })).datos.carreraNombres, false);
    const apagado = await pedir(base, 'GET', '/api/academia/carrera', { galleta: await entrar('fito') });
    assert.deepEqual(apagado.datos.pilotos.map(x => x.alias), ['Piloto 1', 'Piloto 2', 'Piloto 3', 'Fito']);
    const texto = JSON.stringify(apagado.datos.pilotos);
    for (const nada of ['Ana', 'Roberto', 'Beto', 'Eva', '@']) assert.ok(!texto.includes(nada), nada);

    // Un administrador que mira no corre (yo = null) y no rompe nada.
    const a = await pedir(base, 'GET', '/api/academia/carrera', { galleta: admin });
    assert.equal(a.codigo, 200);
    assert.equal(a.datos.yo, null);
    assert.ok(a.datos.pilotos.every(x => !x.esYo));
  });
});

test('los alias: primer nombre, únicos (inicial del apellido, después un número), sin «@» y «Piloto N» por orden de cuenta', () => {
  const cuentas = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
  const enOrden = m => cuentas.map(u => m.get(u.id));
  const primeros = new Map([[1, { nombre: 'Ana', inicial: 'P' }], [2, { nombre: 'Ana', inicial: 'R' }], [3, null], [4, { nombre: 'Luis', inicial: '' }], [5, { nombre: 'Luis', inicial: '' }]]);
  assert.deepEqual(enOrden(aliasDe(cuentas, { primeros })), ['Ana P.', 'Ana R.', 'Piloto 3', 'Luis', 'Luis 2']);
  assert.deepEqual(enOrden(aliasDe(cuentas, { primeros, nombres: false, yoId: 2 })), ['Piloto 1', 'Ana', 'Piloto 2', 'Piloto 3', 'Piloto 4']);
  assert.deepEqual(enOrden(aliasDe(cuentas, { primeros, privados: new Set([4]) })), ['Ana P.', 'Ana R.', 'Piloto 3', 'Piloto 4', 'Luis']);
});

test('el puesto: los empatados comparten; el promedio; la tabla en orden', () => {
  const pilotos = [{ alias: 'A', tg: 60, oral: 0 }, { alias: 'B', tg: 45, oral: 10 }, { alias: 'Yo', tg: 45, oral: 5, esYo: true }, { alias: 'C', tg: 10, oral: 90 }, { alias: 'D', tg: 0, oral: 0 }];
  assert.deepEqual(puestoDe(pilotos, 'tg'), { puesto: 2, de: 5, pct: 45 });
  assert.deepEqual(puestoDe(pilotos, 'oral'), { puesto: 3, de: 5, pct: 5 });
  assert.equal(puestoDe(pilotos.filter(p => !p.esYo), 'tg'), null);
  assert.equal(promedioDe(pilotos, 'tg'), 32);
  assert.deepEqual(ordenTabla(pilotos).map(p => p.alias), ['A', 'B', 'Yo', 'C', 'D']);
  // Sin oral (null): la pista no lo cuenta.
  assert.equal(puestoDe([{ alias: 'Yo', tg: 5, oral: null, esYo: true }], 'oral'), null);
});

test('los aviones juntos: «+N», «Tú» al frente de su grupo y nunca más de 8 por pista', () => {
  const juntos = agruparAviones([{ alias: 'A', tg: 0 }, { alias: 'B', tg: 0 }, { alias: 'Yo', tg: 3, esYo: true }, { alias: 'C', tg: 2 }, { alias: 'D', tg: 50 }], 'tg', { separacion: 12 });
  assert.deepEqual(juntos.map(g => [g.alias, g.pct, g.miembros.length]), [['Yo', 3, 4], ['D', 50, 1]]);
  assert.equal(juntos[0].esYo, true);
  // Todos en 0 %: un solo avión con todos.
  const cero = agruparAviones(Array.from({ length: 6 }, (_, k) => ({ alias: `P${k}`, tg: 0 })), 'tg');
  assert.equal(cero.length, 1);
  assert.equal(cero[0].miembros.length, 6);
  // Muchos y separados: se juntan hasta 8 (los vecinos más cercanos primero).
  const muchos = Array.from({ length: 12 }, (_, k) => ({ alias: `P${k}`, tg: k * 9 }));
  const ocho = agruparAviones(muchos, 'tg', { separacion: 5, max: 8 });
  assert.equal(ocho.length, 8);
  assert.equal(ocho.reduce((n, g) => n + g.miembros.length, 0), 12);
  assert.deepEqual(ocho.map(g => g.pct), [...ocho.map(g => g.pct)].sort((a, b) => a - b));
  // El avión de un grupo sin «Tú»: el que va más adelante.
  assert.equal(agruparAviones([{ alias: 'X', tg: 20 }, { alias: 'Z', tg: 25 }], 'tg', { separacion: 12 })[0].alias, 'Z');
});

test('la pantalla: sin innerHTML ni style en línea; #claves/github abre el token y GitHub va después de la IA', () => {
  const vista = readFileSync(new URL('../public/carrera-vista.js', import.meta.url), 'utf8');
  assert.doesNotMatch(vista, /innerHTML|outerHTML|insertAdjacentHTML|setAttribute\(\s*['"]style['"]|[{,]\s*style\s*:/);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /seccion === 'claves\/github'/);
  assert.match(app, /ORDEN_GRUPOS_CLAVES = \['ia', 'codigo', 'avisos'\]/);
  assert.match(readFileSync(new URL('../public/app-mejora-vista.js', import.meta.url), 'utf8'), /href: '#claves\/github'/);
});
