// Pruebas de cuentas (fase 1, parte a): primer administrador solo desde Tailscale, entrar, candados,
// claves temporales, administración de usuarios y protección contra pedidos falsos.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { hashClave, verificarClave, claveValida, claveTemporal } from '../src/cuentas/claves.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';

function nuevaBase() {
  return abrirBase(configDePrueba());
}

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  const r = await fetch(`${base}${ruta}`, opciones);
  const cuerpo = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: cuerpo, galleta: setCookie ? setCookie.split(';')[0] : null, setCookie };
}

async function conAdmin(fn) {
  const db = nuevaBase();
  await conServidor(crearServidor({ db }), async base => {
    const r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.codigo, 201);
    await fn(base, r.galleta, db);
  });
  db.close();
}

test('contraseñas: se guardan con scrypt y solo la correcta coincide', async () => {
  const guardado = await hashClave(CLAVE);
  assert.match(guardado, /^scrypt\$16384\$8\$1\$/);
  assert.ok(!guardado.includes(CLAVE));
  assert.equal(await verificarClave(CLAVE, guardado), true);
  assert.equal(await verificarClave('otra clave distinta', guardado), false);
  assert.equal(await verificarClave(CLAVE, 'basura'), false);
  assert.equal(await verificarClave(CLAVE), false, 'sin usuario nunca coincide');
  assert.equal(claveValida('corta'), false);
  assert.match(claveTemporal(), /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
});

test('sin administrador, /api/setup lo dice, y solo se puede crear desde Tailscale', async () => {
  const db = nuevaBase();
  await conServidor(crearServidor({ db }), async base => {
    let r = await pedir(base, 'GET', '/api/setup');
    assert.equal(r.datos.necesitaAdmin, true);
    assert.equal(r.datos.puedeCrearAdmin, false, 'sin cabecera de Tailscale no puede');
    r = await pedir(base, 'GET', '/api/setup', { cabeceras: DESDE_TAILSCALE });
    assert.equal(r.datos.puedeCrearAdmin, true);

    r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE } });
    assert.equal(r.codigo, 403, 'desde internet (sin Tailscale) no');
    r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { ...DESDE_TAILSCALE, 'Tailscale-Funnel-Request': '?1' } });
    assert.equal(r.codigo, 403, 'un visitante de Funnel no');
    r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: 'corta' }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.datos.error, 'clave_corta');

    r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.codigo, 201);
    assert.match(r.setCookie, /HttpOnly/);
    assert.match(r.setCookie, /SameSite=Lax/);
    assert.equal(r.datos.usuario.rol, 'admin');

    r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'otro', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.codigo, 409, 'ya no se puede crear otro primer administrador');
    r = await pedir(base, 'GET', '/api/setup', { cabeceras: DESDE_TAILSCALE });
    assert.equal(r.datos.necesitaAdmin, false);
    assert.equal(r.datos.puedeCrearAdmin, false);
  });
  db.close();
});

test('dos pedidos a la vez crean un solo administrador', async () => {
  const db = nuevaBase();
  await conServidor(crearServidor({ db }), async base => {
    const resultados = await Promise.all(['uno', 'dos', 'tres'].map(nombre =>
      pedir(base, 'POST', '/api/primer-admin', { datos: { nombre, clave: CLAVE }, cabeceras: DESDE_TAILSCALE })));
    assert.equal(resultados.filter(r => r.codigo === 201).length, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin'").get().n, 1);
  });
  db.close();
});

test('entrar, ver quién soy y salir', async () => {
  await conAdmin(async base => {
    let r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'Junior', clave: CLAVE } });
    assert.equal(r.codigo, 200, 'el nombre no distingue mayúsculas');
    const galleta = r.galleta;
    r = await pedir(base, 'GET', '/api/yo', { galleta });
    assert.equal(r.datos.usuario.nombre, 'junior');
    r = await pedir(base, 'GET', '/api/yo');
    assert.equal(r.codigo, 401, 'sin sesión no');
    r = await pedir(base, 'POST', '/api/salir', { datos: {}, galleta });
    assert.equal(r.codigo, 200);
    r = await pedir(base, 'GET', '/api/yo', { galleta });
    assert.equal(r.codigo, 401, 'la sesión cerrada ya no sirve');
  });
});

test('5 contraseñas malas bloquean la cuenta un rato, aunque luego pongan la buena', async () => {
  await conAdmin(async base => {
    for (let i = 0; i < 5; i++) {
      const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: `mala-${i}-clave-larga` } });
      assert.equal(r.codigo, 401);
      assert.equal(r.datos.error, 'credenciales');
    }
    const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } });
    assert.equal(r.codigo, 429);
    assert.equal(r.datos.error, 'cuenta_bloqueada_un_rato');
  });
});

test('un usuario que no existe da el mismo error que una contraseña mala', async () => {
  await conAdmin(async base => {
    const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'nadie', clave: CLAVE } });
    assert.equal(r.codigo, 401);
    assert.equal(r.datos.error, 'credenciales');
  });
});

test('pedidos falsos desde otra página se rechazan', async () => {
  await conAdmin(async (base, galleta) => {
    let r = await fetch(`${base}/api/salir`, { method: 'POST', headers: { Cookie: galleta, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403, 'sin la cabecera de la app');
    r = await fetch(`${base}/api/salir`, { method: 'POST', headers: { Cookie: galleta, 'Content-Type': 'application/json', 'X-Oportia': '1', Origin: 'https://sitio-malo.example' }, body: '{}' });
    assert.equal(r.status, 403, 'desde otro sitio');
    r = await fetch(`${base}/api/yo/idioma`, { method: 'POST', headers: { Cookie: galleta, 'Content-Type': 'text/plain', 'X-Oportia': '1' }, body: '{"idioma":"en"}' });
    assert.equal(r.status, 415, 'solo datos JSON');
  });
});

test('el administrador crea un usuario con clave temporal, y ese usuario debe cambiarla antes de seguir', async () => {
  await conAdmin(async (base, galletaAdmin) => {
    let r = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'maria', rol: 'usuario' }, galleta: galletaAdmin });
    assert.equal(r.codigo, 201);
    const temporal = r.datos.claveTemporal;
    r = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'MARIA' }, galleta: galletaAdmin });
    assert.equal(r.datos.error, 'nombre_ocupado');

    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'maria', clave: temporal } });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.usuario.debeCambiarClave, true);
    const galletaMaria = r.galleta;
    r = await pedir(base, 'GET', '/api/admin/usuarios', { galleta: galletaMaria });
    assert.equal(r.datos.error, 'debe_cambiar_clave');
    r = await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: temporal, nueva: 'la clave de maria 2026' }, galleta: galletaMaria });
    assert.equal(r.codigo, 200);
    r = await pedir(base, 'GET', '/api/admin/usuarios', { galleta: galletaMaria });
    assert.equal(r.codigo, 403);
    assert.equal(r.datos.error, 'solo_admin', 'un usuario normal no administra');
  });
});

test('reiniciar una clave cierra las sesiones de ese usuario; desactivar impide entrar y no borra nada', async () => {
  await conAdmin(async (base, galletaAdmin, db) => {
    const creado = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'pedro' }, galleta: galletaAdmin });
    const id = creado.datos.id;
    let r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'pedro', clave: creado.datos.claveTemporal } });
    const galletaPedro = r.galleta;

    r = await pedir(base, 'POST', `/api/admin/usuarios/${id}/reiniciar-clave`, { datos: {}, galleta: galletaAdmin });
    assert.equal(r.codigo, 200);
    r = await pedir(base, 'GET', '/api/yo', { galleta: galletaPedro });
    assert.equal(r.codigo, 401, 'su sesión vieja se cerró');

    r = await pedir(base, 'POST', `/api/admin/usuarios/${id}/activo`, { datos: { activo: false }, galleta: galletaAdmin });
    assert.equal(r.codigo, 200);
    assert.ok(db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id), 'el usuario sigue existiendo');
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'pedro', clave: 'lo que sea largo' } });
    assert.equal(r.codigo, 401);

    const yo = db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
    r = await pedir(base, 'POST', `/api/admin/usuarios/${yo}/activo`, { datos: { activo: false }, galleta: galletaAdmin });
    assert.equal(r.datos.error, 'no_puedes_desactivarte');
  });
});

test('cambiar la clave pide la actual y cierra las otras sesiones', async () => {
  await conAdmin(async (base, galleta1) => {
    const otra = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } });
    let r = await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: 'equivocada larga', nueva: 'nueva clave larga 1' }, galleta: galleta1 });
    assert.equal(r.datos.error, 'clave_actual_incorrecta');
    r = await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: CLAVE, nueva: 'nueva clave larga 1' }, galleta: galleta1 });
    assert.equal(r.codigo, 200);
    r = await pedir(base, 'GET', '/api/yo', { galleta: galleta1 });
    assert.equal(r.codigo, 200, 'la sesión actual sigue');
    r = await pedir(base, 'GET', '/api/yo', { galleta: otra.galleta });
    assert.equal(r.codigo, 401, 'la otra sesión se cerró');
  });
});

test('la galleta lleva Secure cuando se entra por el enlace https', async () => {
  await conAdmin(async base => {
    const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'X-Forwarded-Proto': 'https' } });
    assert.match(r.setCookie, /; Secure/);
  });
});
