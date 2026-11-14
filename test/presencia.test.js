// Pruebas de la Academia 0.14.9: «en línea» más rápido. Con un reloj y un documento FALSOS (nada espera):
//  - el latido del alumno cada 15 s y lo que pide el administrador (en línea cada 5 s, el avance cada 30 s) SOLO con la
//    app a la vista: pausa al esconderla, y al volver pide enseguida y sigue;
//  - la ventana de «en línea»: 45 s (a los 46 s sin nada, ya no); un latido la renueva; cerrar la app la corta;
//  - POST /api/yo/visita/latido: solo con sesión, cuenta como actividad.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repetirMientrasVisible, LATIDO_ALUMNO_MS, EN_LINEA_ADMIN_MS, AVANCE_ADMIN_MS } from '../public/presencia.js';
import { EN_LINEA_MS, LATIDO_MS, anotarActividad, anotarFin, resumenVisitas } from '../src/cuentas/visitas.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';

// Deja correr lo que quedó pendiente (promesas ya resueltas), sin esperar tiempo de verdad.
const vaciar = () => new Promise(r => setImmediate(r));
// Un reloj falso: avanzar(ms) corre los intervalos que tocan, en orden.
function relojFalso() {
  let ahora = 0;
  let siguienteId = 1;
  const intervalos = new Map();
  return {
    setInterval(fn, ms) { const id = siguienteId++; intervalos.set(id, { fn, ms, proximo: ahora + ms }); return id; },
    clearInterval(id) { intervalos.delete(id); },
    async avanzar(ms) {
      const fin = ahora + ms;
      for (;;) {
        const [id, x] = [...intervalos].sort((a, b) => a[1].proximo - b[1].proximo)[0] ?? [];
        if (!x || x.proximo > fin) break;
        ahora = x.proximo;
        x.proximo += x.ms;
        if (intervalos.has(id)) { x.fn(); await vaciar(); }
      }
      ahora = fin;
    },
    get activos() { return intervalos.size; },
  };
}
function documentoFalso(hidden = false) {
  const oyentes = new Set();
  return {
    hidden,
    addEventListener: (tipo, fn) => { if (tipo === 'visibilitychange') oyentes.add(fn); },
    removeEventListener: (tipo, fn) => { if (tipo === 'visibilitychange') oyentes.delete(fn); },
    async cambiar(h) { this.hidden = h; for (const fn of [...oyentes]) fn(); await vaciar(); },
    get oyentes() { return oyentes.size; },
  };
}

test('los intervalos: latido 15 s, en línea del administrador 5 s, avance 30 s; «en línea» = 45 s', () => {
  assert.equal(LATIDO_ALUMNO_MS, 15_000);
  assert.equal(LATIDO_MS, LATIDO_ALUMNO_MS, 'el servidor y la pantalla dicen lo mismo');
  assert.equal(EN_LINEA_ADMIN_MS, 5_000);
  assert.equal(AVANCE_ADMIN_MS, 30_000);
  assert.equal(EN_LINEA_MS, 45_000);
  assert.ok(EN_LINEA_MS >= 3 * LATIDO_ALUMNO_MS, 'perder un latido no lo saca de «en línea»');
});

test('repetirMientrasVisible: cada N ms con la app a la vista; escondida, nada; al volver, enseguida', async () => {
  const reloj = relojFalso();
  const doc = documentoFalso(false);
  let veces = 0;
  const parar = repetirMientrasVisible({ doc, cadaMs: EN_LINEA_ADMIN_MS, reloj, hacer: () => { veces += 1; } });
  assert.equal(veces, 0, 'al empezar no pide (la pantalla ya trae lo de ahora)');
  await reloj.avanzar(5_000);
  assert.equal(veces, 1);
  await reloj.avanzar(10_000);
  assert.equal(veces, 3);
  await doc.cambiar(true);
  assert.equal(reloj.activos, 0, 'escondida: sin reloj');
  await reloj.avanzar(60_000);
  assert.equal(veces, 3, 'escondida: no pide nada');
  await doc.cambiar(false);
  assert.equal(veces, 4, 'al volver: enseguida');
  await reloj.avanzar(5_000);
  assert.equal(veces, 5);
  parar();
  assert.equal(reloj.activos, 0);
  assert.equal(doc.oyentes, 0);
  await doc.cambiar(true); await doc.cambiar(false);
  await reloj.avanzar(60_000);
  assert.equal(veces, 5, 'parado: nunca más');
});

test('repetirMientrasVisible: el latido cada 15 s; no se pisa con uno que no terminó; se para solo (parar)', async () => {
  const reloj = relojFalso();
  const doc = documentoFalso(true);
  const latidos = [];
  let soltar = null;
  repetirMientrasVisible({ doc, cadaMs: LATIDO_ALUMNO_MS, reloj, hacer: () => { latidos.push('l'); return new Promise(r => { soltar = r; }); } });
  assert.equal(reloj.activos, 0, 'empezó escondida: nada');
  await doc.cambiar(false);
  assert.equal(latidos.length, 1);
  await reloj.avanzar(45_000);
  assert.equal(latidos.length, 1, 'el anterior no terminó (sin red): no se amontonan');
  soltar();
  await vaciar();
  await reloj.avanzar(15_000);
  assert.equal(latidos.length, 2);
  // hacer(parar): la pantalla se fue → para.
  const reloj2 = relojFalso();
  const doc2 = documentoFalso(false);
  let n = 0;
  repetirMientrasVisible({ doc: doc2, cadaMs: 30_000, reloj: reloj2, hacer: parar => { n += 1; if (n === 2) parar(); } });
  await reloj2.avanzar(120_000);
  assert.equal(n, 2);
  assert.equal(reloj2.activos, 0);
});

test('«en línea»: 45 s desde lo último; un latido cada 15 s lo mantiene; cerrar la app lo corta', () => {
  const db = abrirBase(configDePrueba());
  try {
    const id = crearUsuario(db, { nombre: 'vera', claveHash: 'x', debeCambiarClave: false });
    const T = Date.parse('2026-11-13T15:00:00Z');
    anotarActividad(db, id, T, { entrada: true });
    assert.equal(resumenVisitas(db, id, T + 45_000).enLinea, true);
    assert.equal(resumenVisitas(db, id, T + 46_000).enLinea, false, 'cerró de golpe: a los 46 s, desconectado');
    // Con latidos cada 15 s sigue en línea (cada uno se anota: la visita se escribe hasta cada 10 s).
    for (let k = 1; k <= 8; k++) {
      assert.equal(anotarActividad(db, id, T + 60_000 + k * LATIDO_ALUMNO_MS), 'sigue');
      assert.equal(resumenVisitas(db, id, T + 60_000 + k * LATIDO_ALUMNO_MS + 44_000).enLinea, true);
    }
    const ultimo = T + 60_000 + 8 * LATIDO_ALUMNO_MS;
    anotarFin(db, id, 'cerro', ultimo + 1_000);
    assert.equal(resumenVisitas(db, id, ultimo + 2_000).enLinea, false, 'escondió o cerró la app: enseguida');
  } finally { db.close(); }
});

test('POST /api/yo/visita/latido: con sesión cuenta como actividad (en línea); sin sesión, 401', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config });
  try {
    await conServidor(servidor, async base => {
      const pedir = (ruta, galleta) => fetch(`${base}${ruta}`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json', ...(galleta ? { Cookie: galleta } : {}) }, body: '{}' });
      const admin = await fetch(`${base}/api/primer-admin`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json', 'Tailscale-User-Login': 'junior@example.com' }, body: JSON.stringify({ nombre: 'junior', clave: 'una clave bien larga' }) });
      assert.equal(admin.status, 201);
      const id = crearUsuario(db, { nombre: 'ana', claveHash: await hashClave('una clave bien larga'), debeCambiarClave: false });
      assert.equal((await pedir('/api/yo/visita/latido')).status, 401);
      const entrar = await fetch(`${base}/api/entrar`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'ana', clave: 'una clave bien larga' }) });
      const galleta = entrar.headers.get('set-cookie').split(';')[0];
      // Se fue hace rato (la visita quedó vieja): un latido la vuelve a poner en línea.
      db.prepare("UPDATE ajustes SET valor = json_set(valor, '$.actual.ultimo', '2026-01-01T00:00:00.000Z', '$.actual.inicio', '2026-01-01T00:00:00.000Z') WHERE clave = ?").run(`cuenta.visitas.${id}`);
      assert.equal(resumenVisitas(db, id).enLinea, false);
      const r = await pedir('/api/yo/visita/latido', galleta);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true });
      assert.equal(resumenVisitas(db, id).enLinea, true);
    });
  } finally { db.close(); }
});
