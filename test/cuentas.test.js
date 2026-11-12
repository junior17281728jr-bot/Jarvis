// Pruebas de cuentas (fase 1, parte a): primer administrador solo desde Tailscale, entrar, candados,
// claves temporales, administración de usuarios y protección contra pedidos falsos.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { hashClave, verificarClave, claveValida, claveTemporal, claveObvia, problemaDeClave } from '../src/cuentas/claves.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
// 0.12.3: la contraseña de otra persona pide la del administrador otra vez (por el enlace público).
const CONFIRMA = { 'X-Confirmar-Clave': Buffer.from('una clave bien larga').toString('base64') };

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
  assert.equal(claveValida('abc'), false);
  assert.equal(claveValida('sol1'), true, '0.9.2: desde 4 caracteres');
  assert.match(claveTemporal(), /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
});

test('0.9.2: contraseñas libres desde 4 caracteres; solo las peores no sirven', () => {
  for (const c of ['1234', '0000', 'abcd', 'aaaa', '4321', '123456', '111111', 'qwerty', 'password', 'contraseña', 'CONTRASEÑA', 'zzzzzzz', 'abcdef'])
    assert.equal(claveObvia(c), true, c);
  assert.equal(claveObvia('Junior', ['junior']), true, 'su propio usuario');
  assert.equal(claveObvia('Juan Pérez', ['juan.perez', 'Juan Pérez']), true);
  assert.equal(claveObvia('Gómez', ['maria.gomez', 'María Gómez']), true);
  for (const c of ['pepe', 'sol1', 'hola', 'mango', '1a2b', 'junior123', 'Casa2024!', 'tres gatos', 'teamo', 'p4ss'])
    assert.equal(problemaDeClave(c, ['junior', 'Junior Pérez']), null, c);
  assert.equal(problemaDeClave('abc'), 'clave_corta');
  assert.equal(problemaDeClave('1234'), 'clave_obvia');
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
    r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: 'abc' }, cabeceras: DESDE_TAILSCALE });
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

const DESDE_INTERNET = ip => ({ 'X-Forwarded-For': `1.2.3.4, ${ip}`, 'Tailscale-Funnel-Request': '?1' });

// 0.12.6 (pedido del dueño): nunca se bloquea ni se cierra la sesión por contraseñas malas; el servidor solo tarda más en
// contestar (5 sin espera, después 1, 2, 4, 8, 8… s). Las pruebas cambian la espera por un reloj falso (rápidas).
function conEsperas({ avanza = true } = {}) {
  const r = { t: Date.now(), esperas: [] };
  r.reloj = () => r.t;
  r.dormir = async ms => { r.esperas.push(ms); if (avanza) r.t += ms; };
  return r;
}
async function conAdminFreno(fn, falso = conEsperas()) {
  const { crearLimitesCuentas } = await import('../src/api/cuentas.js');
  const db = nuevaBase();
  await conServidor(crearServidor({ db, limites: crearLimitesCuentas({ dormir: falso.dormir, reloj: falso.reloj }) }), async base => {
    const r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.codigo, 201);
    await fn(base, r.galleta, db, falso);
  });
  db.close();
}

test('0.12.6: las contraseñas malas nunca bloquean: cada una es «credenciales», solo esperan más, y la buena entra', async () => {
  await conAdminFreno(async (base, galleta, db, falso) => {
    for (let i = 0; i < 12; i++) {
      const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: `mala-${i}-clave-larga` }, cabeceras: DESDE_INTERNET('203.0.113.7') });
      assert.deepEqual([r.codigo, r.datos.error], [401, 'credenciales'], `intento ${i + 1}`);
    }
    assert.deepEqual(falso.esperas, [1000, 2000, 4000, 8000, 8000, 8000, 8000], 'los 5 primeros sin espera, luego 1, 2, 4 y hasta 8 s');
    let r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.equal(r.codigo, 200, 'la buena entra (después de su espera)');
    falso.esperas.length = 0;
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: 'otra-mala-clave-larga' }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.equal(r.codigo, 401);
    assert.deepEqual(falso.esperas, [], 'al acertar se olvida');
    // Desde otro lugar no hay espera: un extraño no hace esperar al dueño.
    for (let i = 0; i < 6; i++) await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: `mala-${i}-clave-larga` }, cabeceras: DESDE_INTERNET('203.0.113.9') });
    falso.esperas.length = 0;
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_INTERNET('198.51.100.20') });
    assert.equal(r.codigo, 200);
    assert.deepEqual(falso.esperas, []);
    // Un usuario que no existe espera igual (la espera no dice qué cuentas hay).
    for (let i = 0; i < 6; i++) r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'nadie', clave: `mala-${i}-clave-larga` }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.equal(r.codigo, 401);
    assert.deepEqual(falso.esperas, [1000]);
    assert.ok(!JSON.stringify(r.datos).includes('quedan'));
  });
});

test('0.12.6: muchos pedidos a la vez se escalonan (no se saltan la espera), ninguno espera más de 8 s y ninguno recibe 429', async () => {
  await conAdminFreno(async (base, galleta, db, falso) => {
    const respuestas = await Promise.all(Array.from({ length: 15 }, (_, i) =>
      pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: `mala-${i}-clave-larga` }, cabeceras: DESDE_INTERNET('203.0.113.7') })));
    assert.equal(respuestas.filter(r => r.codigo === 401).length, 15);
    // Con el reloj quieto: los primeros se escalonan (1, 1+2, 1+2+4) y después todos con el tope de 8 s.
    assert.deepEqual(falso.esperas.sort((a, b) => a - b), [1000, 3000, 7000, ...Array(7).fill(8000)]);
  }, conEsperas({ avanza: false }));
});

test('una contraseña nueva (puesta por el administrador o la consola) quita la espera anterior', async () => {
  await conAdminFreno(async (base, galleta, db, falso) => {
    const { guardarClave } = await import('../src/cuentas/usuarios.js');
    for (let i = 0; i < 8; i++) await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: `mala-${i}-clave-larga` }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    guardarClave(db, 1, await hashClave('clave nueva de rescate'), { debeCambiarClave: true });
    falso.esperas.length = 0;
    const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: 'clave nueva de rescate' }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.equal(r.codigo, 200);
    assert.deepEqual(falso.esperas, []);
  });
});

test('0.12.6: con una sesión abierta, fallar la contraseña actual nunca cierra la sesión (solo espera)', async () => {
  await conAdminFreno(async (base, galleta, db, falso) => {
    for (let i = 0; i < 8; i++) {
      const r = await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: `mala-${i}-clave-larga`, nueva: 'otra clave muy larga' }, galleta });
      assert.deepEqual([r.codigo, r.datos.error], [400, 'clave_actual_incorrecta']);
    }
    assert.deepEqual(falso.esperas, [1000, 2000, 4000]);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta })).codigo, 200, 'la sesión sigue abierta');
    const r = await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: CLAVE, nueva: 'otra clave muy larga' }, galleta });
    assert.equal(r.codigo, 200);
  });
});

test('al crear el primer administrador, los errores al escribir no cuentan como intentos', async () => {
  const db = nuevaBase();
  await conServidor(crearServidor({ db }), async base => {
    for (const datos of [{ nombre: 'Júnior', clave: CLAVE }, { nombre: 'junior perez', clave: CLAVE }, { nombre: 'ju', clave: CLAVE }, { nombre: 'junior', clave: 'abc' }, { nombre: 'junior', clave: '123456' }, { nombre: 'junior', clave: 'Junior' }, { nombre: 'junior', clave: '0000' }]) {
      const r = await pedir(base, 'POST', '/api/primer-admin', { datos, cabeceras: DESDE_TAILSCALE });
      assert.equal(r.codigo, 400);
    }
    const r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.codigo, 201);
  });
  db.close();
});

test('una dirección con un código roto (%FF) responde 400 sin error del servidor', async () => {
  await conAdmin(async (base, galleta) => {
    const r = await pedir(base, 'POST', '/api/admin/usuarios/%FF/activo', { datos: { activo: false }, galleta });
    assert.equal(r.codigo, 400);
    assert.equal(r.datos.error, 'direccion_no_valida');
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

test('el nombre completo que escribe el administrador queda como nombre visible; la contraseña nueva no puede ser su nombre', async () => {
  await conAdmin(async (base, galletaAdmin) => {
    let r = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'juan.perez', nombreVisible: '  Juan   Pérez ' }, galleta: galletaAdmin });
    assert.equal(r.codigo, 201);
    assert.equal(r.datos.nombreVisible, 'Juan Pérez');
    const temporal = r.datos.claveTemporal;
    r = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'Juan.Perez', nombreVisible: 'Juan Pérez' }, galleta: galletaAdmin });
    assert.equal(r.codigo, 409);
    assert.equal(r.datos.error, 'nombre_ocupado', 'la pantalla propone juan.perez2');
    r = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'juan.perez2', nombreVisible: { x: 1 } }, galleta: galletaAdmin });
    assert.equal(r.codigo, 400, 'un nombre visible que no es texto');
    r = await pedir(base, 'GET', '/api/admin/usuarios', { galleta: galletaAdmin });
    assert.equal(r.datos.usuarios.find(u => u.nombre === 'juan.perez').nombreVisible, 'Juan Pérez');

    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'juan.perez', clave: temporal } });
    assert.equal(r.datos.usuario.nombreVisible, 'Juan Pérez');
    const galleta = r.galleta;
    for (const [nueva, error] of [['abc', 'clave_corta'], ['1234', 'clave_obvia'], ['juanperez', 'clave_obvia'], ['Juan Pérez', 'clave_obvia']]) {
      r = await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: temporal, nueva }, galleta });
      assert.equal(r.datos.error, error, nueva);
    }
    r = await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: temporal, nueva: 'sol1' }, galleta });
    assert.equal(r.codigo, 200, '0.9.2: 4 caracteres que no son de los peores sirven');
  });
});

test('reiniciar una clave cierra las sesiones de ese usuario; desactivar impide entrar y no borra nada', async () => {
  await conAdmin(async (base, galletaAdmin, db) => {
    const creado = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'pedro' }, galleta: galletaAdmin });
    const id = creado.datos.id;
    let r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'pedro', clave: creado.datos.claveTemporal } });
    const galletaPedro = r.galleta;

    r = await pedir(base, 'POST', `/api/admin/usuarios/${id}/reiniciar-clave`, { datos: {}, galleta: galletaAdmin, cabeceras: CONFIRMA });
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

test('cuando el administrador reinicia una contraseña, la persona lo ve al entrar y la lista queda en Configuración', async () => {
  await conAdmin(async (base, galletaAdmin, db) => {
    const creado = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'bob' }, galleta: galletaAdmin });
    let r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'bob', clave: creado.datos.claveTemporal } });
    assert.deepEqual(r.datos.avisos, [], 'crear la cuenta no es un reinicio');
    await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: creado.datos.claveTemporal, nueva: 'la clave de bob 2026' }, galleta: r.galleta });

    // El administrador reinicia la contraseña de Bob dos veces.
    for (let i = 0; i < 2; i++) assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${creado.datos.id}/reiniciar-clave`, { datos: {}, galleta: galletaAdmin, cabeceras: CONFIRMA })).codigo, 200);
    const temporal = (await pedir(base, 'POST', `/api/admin/usuarios/${creado.datos.id}/reiniciar-clave`, { datos: {}, galleta: galletaAdmin, cabeceras: CONFIRMA })).datos.claveTemporal;
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'bob', clave: temporal } });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.avisos.length, 3);
    assert.ok(r.datos.avisos.every(a => a.tipo === 'clave_reiniciada' && !Number.isNaN(Date.parse(a.fecha))));
    const galleta = r.galleta;
    // Mientras la pantalla no diga que ya lo mostró, el aviso sigue (también en /api/yo, aun con la clave temporal).
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta })).datos.avisos.length, 3);
    assert.equal(r.datos.reiniciosRecientes.length, 3, 'con el aviso van los reinicios recientes');
    const hasta = Math.max(...r.datos.avisos.map(a => a.id));
    // Con la contraseña temporal no se puede marcar como visto (puede ser otra persona).
    assert.equal((await pedir(base, 'POST', '/api/yo/avisos/vistos', { datos: { hasta }, galleta })).datos.error, 'debe_cambiar_clave');
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta })).datos.avisos.length, 3);
    assert.equal((await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: temporal, nueva: 'otra clave de bob 2026' }, galleta })).codigo, 200);
    assert.equal((await pedir(base, 'POST', '/api/yo/avisos/vistos', { datos: { hasta }, galleta })).codigo, 200);
    assert.deepEqual((await pedir(base, 'GET', '/api/yo', { galleta })).datos.avisos, [], 'se ve una vez');
    // La lista en Configuración se queda para siempre (nada se borra).
    r = await pedir(base, 'GET', '/api/yo/reinicios', { galleta });
    assert.equal(r.datos.reinicios.length, 3);
    assert.ok(r.datos.reinicios.every(x => x.vistoEn));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM avisos_cuenta').get().n, 3);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'clave_reiniciada'").get().n, 3);
    // Los avisos de Bob son solo de Bob.
    assert.deepEqual((await pedir(base, 'GET', '/api/yo/reinicios', { galleta: galletaAdmin })).datos.reinicios, []);
    assert.equal((await pedir(base, 'POST', '/api/yo/avisos/vistos', { datos: { hasta: 'todo' }, galleta })).datos.error, 'datos_no_validos');
    assert.equal((await pedir(base, 'GET', '/api/yo/reinicios')).codigo, 401);
  });
});

test('datos de cuentas del tipo equivocado dan 400, nunca un error del servidor', async () => {
  await conAdmin(async (base, galletaAdmin) => {
    const raro = { toString: 0 };
    for (const [ruta, datos, galleta] of [
      ['/api/entrar', { nombre: raro, clave: 'x' }], ['/api/entrar', { nombre: 'junior', clave: [CLAVE] }],
      ['/api/admin/usuarios', { nombre: raro }, galletaAdmin], ['/api/yo/clave', { actual: raro, nueva: 'otra clave larga' }, galletaAdmin],
    ]) {
      const r = await pedir(base, 'POST', ruta, { datos, galleta });
      assert.equal(r.codigo, 400, ruta);
      assert.equal(r.datos.error, 'datos_no_validos', ruta);
    }
  });
});

test('si otro entra con la contraseña reiniciada y «ve» el aviso, la dueña igual ve esa fecha al entrar la próxima vez', async () => {
  await conAdmin(async (base, galletaAdmin) => {
    const creado = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'bob' }, galleta: galletaAdmin });
    let r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'bob', clave: creado.datos.claveTemporal } });
    await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: creado.datos.claveTemporal, nueva: 'la clave de bob 2026' }, galleta: r.galleta });
    // 1. Sin que Bob lo pida, el administrador reinicia su contraseña y entra con la temporal.
    let temporal = (await pedir(base, 'POST', `/api/admin/usuarios/${creado.datos.id}/reiniciar-clave`, { datos: {}, galleta: galletaAdmin, cabeceras: CONFIRMA })).datos.claveTemporal;
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'bob', clave: temporal } });
    let galleta = r.galleta;
    const primero = r.datos.avisos[0].id;
    assert.equal((await pedir(base, 'POST', '/api/yo/avisos/vistos', { datos: { hasta: primero }, galleta })).codigo, 403);
    // 2. Pone una contraseña nueva y ahí sí marca el aviso como visto.
    assert.equal((await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: temporal, nueva: 'la clave del intruso' }, galleta })).codigo, 200);
    assert.equal((await pedir(base, 'POST', '/api/yo/avisos/vistos', { datos: { hasta: primero }, galleta })).codigo, 200);
    // 3. Bob ya no puede entrar, pide un reinicio y entra.
    temporal = (await pedir(base, 'POST', `/api/admin/usuarios/${creado.datos.id}/reiniciar-clave`, { datos: {}, galleta: galletaAdmin, cabeceras: CONFIRMA })).datos.claveTemporal;
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'bob', clave: temporal } });
    assert.equal(r.datos.avisos.length, 1, 'el aviso nuevo es solo el que pidió');
    assert.equal(r.datos.reiniciosRecientes.length, 2, 'pero la pantalla le muestra los dos reinicios, con su fecha');
    assert.ok(r.datos.reiniciosRecientes[1].vistoEn, 'el viejo ya estaba visto, y aun así aparece');
    galleta = r.galleta;
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta })).datos.reiniciosRecientes.length, 2);
  });
});
