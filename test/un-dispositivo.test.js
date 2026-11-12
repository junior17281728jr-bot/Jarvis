// 0.12.8 (pedido del dueño, punto Z): una cuenta de alumno, un dispositivo a la vez. Determinista: las veces por día se
// prueban con un reloj de mentira; la parte del servidor no compara horas.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { sesionesDe } from '../src/cuentas/historial.js';
import { cerrarOtrosEquipos, cerradaPorOtroEquipo, unDispositivoActivo, ponerUnDispositivo } from '../src/cuentas/un-dispositivo.js';
import { claveDeAvisoValida } from '../src/avisos/avisos.js';
import { vaPorTelegram } from '../src/canales/avisador.js';
import { textoDeAviso } from '../src/canales/textos.js';

const CLAVE = 'una clave bien larga';
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const h = { 'X-Oportia': '1', ...cabeceras, ...(galleta ? { Cookie: galleta } : {}), ...(datos !== undefined ? { 'Content-Type': 'application/json' } : {}) };
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers: h, body: datos !== undefined ? JSON.stringify(datos) : undefined });
  const sc = r.headers.get('set-cookie');
  return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: sc ? sc.split(';')[0] : null };
}

test('al entrar en otro dispositivo, las otras sesiones del alumno se cierran (sin borrarse) y el viejo lo sabe; el administrador no', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  try {
    await conServidor(crearServidor({ db, config }), async base => {
      const admin1 = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      const adminId = db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
      const id = crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false, creadoPor: adminId });
      const entrar = (nombre, equipo) => pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE }, cabeceras: { 'User-Agent': equipo } });
      const a = (await entrar('ana', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')).galleta;
      assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: a })).codigo, 200);
      const b = (await entrar('ana', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0 Safari/537.36')).galleta;
      const viejo = await pedir(base, 'GET', '/api/yo', { galleta: a });
      assert.deepEqual([viejo.codigo, viejo.datos.error], [401, 'sesion_otro_equipo'], 'el viejo sabe por qué');
      assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: b })).codigo, 200, 'el nuevo sigue');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sesiones WHERE usuario_id = ?').get(id).n, 2, 'nunca se borra la sesión');
      assert.ok(cerradaPorOtroEquipo(db, decodeURIComponent(a.split('=')[1])));
      // La Actividad de su ficha lo muestra.
      const s = sesionesDe(db, id).find(x => x.motivo === 'otro_equipo');
      assert.ok(s, JSON.stringify(sesionesDe(db, id)));
      assert.equal(s.estado, 'cerrada');
      // El administrador: dos dispositivos a la vez, sin problema.
      const admin2 = (await entrar('junior', 'Safari')).galleta;
      assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: admin1 })).codigo, 200);
      assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: admin2 })).codigo, 200);
      // Apagado (solo el administrador): el alumno puede tener varias.
      assert.equal(unDispositivoActivo(db), true, 'encendido por defecto');
      assert.equal((await pedir(base, 'POST', '/api/admin/cuentas/un-dispositivo', { galleta: b, datos: { activo: false } })).codigo, 403);
      assert.equal((await pedir(base, 'POST', '/api/admin/cuentas/un-dispositivo', { galleta: admin1, datos: { activo: false } })).datos.activo, false);
      const c = (await entrar('ana', 'Firefox')).galleta;
      assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: b })).codigo, 200);
      assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: c })).codigo, 200);
      assert.equal((await pedir(base, 'GET', '/api/admin/cuentas/un-dispositivo', { galleta: admin1 })).datos.activo, false);
      // Un token que nunca existió sigue siendo «no has entrado».
      assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: 'op_sesion=nada' })).datos.error, 'no_has_entrado');
    });
  } finally { db.close(); }
});

test('más de 3 veces en un día (hora de RD) para el mismo alumno: un aviso (pantalla y Telegram); al otro día empieza de cero', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  try {
    const id = crearUsuario(db, { nombre: 'luis', nombreVisible: 'Luis Gómez', claveHash: 'x', debeCambiarClave: false });
    const T0 = Date.parse('2026-11-12T14:00:00.000Z'); // 10:00 a. m. en RD
    let n = 0;
    const sesion = ahora => {
      const token = `token-${n++}`;
      db.prepare('INSERT INTO sesiones (token_hash, usuario_id, creada_en, vence_en, ultimo_uso, navegador) VALUES (?, ?, ?, ?, ?, ?)')
        .run(createHash('sha256').update(token).digest('hex'), id, new Date(ahora).toISOString(), new Date(ahora + 30 * 86_400_000).toISOString(), null, 'x');
      return token;
    };
    const avisos = () => db.prepare("SELECT clave, detalle FROM avisos WHERE clave LIKE 'cuenta_compartida:%'").all();
    let viejo = sesion(T0);
    for (let i = 1; i <= 3; i++) {
      const nuevo = sesion(T0 + i * 60_000);
      assert.equal(cerrarOtrosEquipos(db, id, nuevo, T0 + i * 60_000), 1);
      viejo = nuevo;
    }
    assert.equal(avisos().length, 0, '3 veces: sin aviso');
    const cuarto = sesion(T0 + 5 * 60_000);
    cerrarOtrosEquipos(db, id, cuarto, T0 + 5 * 60_000);
    const [a] = avisos();
    assert.equal(a.clave, `cuenta_compartida:${id}:2026-11-12`);
    assert.equal(JSON.parse(a.detalle).veces, 4);
    assert.ok(claveDeAvisoValida(a.clave));
    assert.deepEqual(vaPorTelegram({ clave: a.clave, nivel: 'atencion' }), { va: true, suena: false });
    assert.match(textoDeAviso({ ...a, nivel: 'atencion', ultima_vez: new Date(T0).toISOString() }, 'es'), /Luis Gómez.*4 veces hoy/);
    // Al otro día (hora de RD) la cuenta empieza otra vez.
    const manana = T0 + 86_400_000;
    cerrarOtrosEquipos(db, id, sesion(manana), manana);
    assert.equal(JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`cuenta.otro_equipo.${id}`).valor).veces, 1);
    assert.equal(avisos().length, 1);
    // Apagado: no cierra nada.
    ponerUnDispositivo(db, false, { ahora: manana });
    assert.equal(cerrarOtrosEquipos(db, id, sesion(manana + 1000), manana + 1000), 0);
    assert.ok(viejo);
  } finally { db.close(); }
});
