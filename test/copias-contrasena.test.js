// 0.14.2 (pedido del dueño: «quita eso, pon una contraseña normal»): la CONTRASEÑA DE COPIAS en vez de la clave de 28
// símbolos. Crear (reglas), hacer una copia → recuperarla con la contraseña (con y sin índice, desde los archivos y desde
// Telegram), una clave de 28 símbolos de antes sigue abriendo sus copias, una contraseña mala lo dice claro, cambiarla (las
// copias de antes siguen con la de antes), «Comprobar» (el recordatorio de 90 días) y que nada secreto quede en el disco,
// en la base ni en la consola. scrypt chico (N=2^10) por la opción que se inyecta; reloj de mentira; Telegram FALSO.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carpetaTemporal, conServidor } from './ayuda.js';
import { montar, ponerClave, CHAT, HORA, MINUTO } from './copias-tarea-base.js';
import { capturarConsola } from './ia-base.js';
import { contenido } from './copias-base.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { ErrorCopias, pareceIndice } from '../src/copias/formato.js';
import { problemaDeContrasena, leerKdf, nuevoKdf, normalizarContrasena, derivarDeContrasena, KDF } from '../src/copias/clave.js';
import { crearContrasenaCopias, comprobarContrasena, estadoCopias, resumenCopias, kdfDeLlave, llaveActiva } from '../src/copias/estado.js';
import { restaurarCopia } from '../src/copias/restaurar.js';
import { estadoLlave } from '../src/claves/cifrado.js';
import { vigilarCopias } from '../src/copias/vigilar.js';
import { problemaContrasena, reglasContrasena, vistaCopias, vistaAzulejoCopias, avisoSinCopias } from '../public/copias-vista.js';

const CHICO = Object.freeze({ kdf: 'scrypt', N: 1024, r: 8, p: 1 });
const P1 = 'Avion de papel 2026';
const P2 = 'Cessna172 con ñandú';
const sinCopias = c => Object.fromEntries(Object.entries(c).filter(([k]) => !/^(?:copias|copia_partes|canal_envios|tareas|tarea_eventos|tarea_carriles|trabajador_corridas|canales)$/.test(k)));

function archivosEn(carpeta) {
  const salida = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosEn(ruta)); else salida.push(ruta);
  }
  return salida;
}

async function conContrasena(b, contrasena, { repetida = contrasena } = {}) {
  return crearContrasenaCopias(b.db, { config: b.config, contrasena, repetida, usuarioId: b.admin, ahora: b.t, base: CHICO });
}

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
function consolaRestaurar(argumentos, entrada) {
  return new Promise(listo => {
    const hijo = spawn(process.execPath, ['--no-warnings', 'deploy/oportia-restaurar.mjs', ...argumentos], {
      cwd: RAIZ, env: { PATH: process.env.PATH, OPORTIA_TEST: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    hijo.stdout.on('data', d => { stdout += d; });
    hijo.stderr.on('data', d => { stderr += d; });
    const reloj = setTimeout(() => hijo.kill('SIGKILL'), 60_000);
    hijo.on('close', status => { clearTimeout(reloj); listo({ status, stdout, stderr }); });
    hijo.stdin.end(entrada);
  });
}

async function rechaza(promesa, clave) {
  await assert.rejects(promesa, e => e instanceof ErrorCopias && e.clave === clave, clave);
}

test('0.14.2 las reglas de la contraseña (servidor y página iguales), su normalización y el kdf que se acepta al leer', async () => {
  const casos = [
    ['corta1', undefined, 'contrasena_corta'], ['  abc12345 ', undefined, 'contrasena_corta'], ['solo letras sin numero', undefined, 'contrasena_sin_numero'],
    ['1234567890', undefined, 'contrasena_sin_letra'], ['a1'.repeat(101), undefined, 'contrasena_larga'], [P1, 'Avion de papel 2025', 'contrasenas_distintas'],
    [P1, P1, null], [` ${P1}\n`, P1, null], ['ñandúes 2026', 'ñandúes 2026', null], ['ÁRBOL1234x', undefined, null],
  ];
  for (const [c, rep, esperado] of casos) {
    assert.equal(problemaDeContrasena(c, rep), esperado, `servidor: ${c}`);
    assert.equal(problemaContrasena(c, rep), esperado, `página: ${c}`);
  }
  assert.deepEqual(reglasContrasena('abc'), { largo: false, letra: true, numero: false });
  assert.deepEqual(reglasContrasena(P1), { largo: true, letra: true, numero: true });
  // La misma «ñ» compuesta o descompuesta (iPhone y terminal de la Mac) da la MISMA llave.
  const k = nuevoKdf(CHICO);
  const a = await derivarDeContrasena('ñandú 2026 avión', k);
  const b = await derivarDeContrasena('  ñandú 2026 avión ', k);
  assert.equal(a.huella, b.huella);
  assert.equal(normalizarContrasena(' x '), 'x');
  // Otra sal, otra llave.
  assert.notEqual((await derivarDeContrasena('ñandú 2026 avión', nuevoKdf(CHICO))).huella, a.huella);
  // El de verdad: N=2^15, r=8, p=1 (32 MB; medido a mano: ~0,1 s en un núcleo). Funciona con su tope de memoria.
  assert.deepEqual([KDF.N, KDF.r, KDF.p], [32768, 8, 1]);
  assert.match((await derivarDeContrasena(P1, nuevoKdf())).huella, /^[0-9A-Z]{4}$/);
  // Lo que viene de una copia (antes de saber si es auténtica) tiene topes: nunca un N enorme.
  const sal = k.sal;
  for (const malo of [null, {}, { ...k, kdf: 'pbkdf2' }, { ...k, N: 1 << 20 }, { ...k, N: 3000 }, { ...k, N: 512 }, { ...k, r: 16 }, { ...k, p: 2 }, { ...k, sal: 'corta' }, { ...k, sal: `${sal}AA` }]) {
    assert.equal(leerKdf(malo), null, JSON.stringify(malo));
  }
  assert.deepEqual(leerKdf({ ...k, extra: 1 }), { kdf: 'scrypt', N: 1024, r: 8, p: 1, sal });
  await rechaza(derivarDeContrasena(P1, { ...k, N: 1 << 20 }), 'kdf_no_valido');
  await rechaza(derivarDeContrasena('   ', k), 'contrasena_formato');
});

test('0.14.2 sin contraseña no se hace ninguna copia: Copias y el Resumen lo dicen en rojo, con el botón', async () => {
  const b = await montar({ telegram: false, clave: false, relleno: 2 });
  try {
    const fin = await b.terminar(b.pedir());
    assert.deepEqual(fin.resultado, { saltada: 'sin_clave' });
    assert.equal(b.copias().length, 0, 'ninguna copia, ni aquí ni en Telegram');
    const resumen = resumenCopias(b.db, { ahora: b.t });
    assert.deepEqual([resumen.motivo, resumen.tono], ['sin_clave', 'mal']);
    assert.equal(vistaAzulejoCopias(resumen).tono, 'mal');
    assert.deepEqual(avisoSinCopias(resumen), { titulo: 'copias.no_se_guardan', linea: 'copias.no_se_guardan.linea', boton: 'copias.contrasena.crear', href: '#copias' });
    const e = estadoCopias(b.db, { ahora: b.t, libreMb: 100_000 });
    const v = vistaCopias({ ...e, puede: { ...e.puede, crearClave: true } });
    assert.deepEqual([v.tono, v.titulo, v.accion], ['mal', 'copias.estado.sin_clave', 'crear_clave']);
    // Con la contraseña: ya no hay aviso rojo.
    await conContrasena(b, P1);
    assert.equal(avisoSinCopias(resumenCopias(b.db, { ahora: b.t })), null);
  } finally {
    await b.cerrar();
  }
});

test('0.14.2 crear → copia → recuperar con la contraseña (archivos con y sin índice, y Telegram); mala → contrasena_no_abre', async () => {
  const b = await montar({ relleno: 6, clave: false });
  try {
    await rechaza(conContrasena(b, 'corta1'), 'contrasena_corta');
    await rechaza(conContrasena(b, P1, { repetida: `${P1}x` }), 'contrasenas_distintas');
    assert.equal(llaveActiva(b.db), null, 'nada guardado con una contraseña que no sirve');
    const creada = await conContrasena(b, P1);
    assert.equal(creada.antes, null);
    const llave = llaveActiva(b.db);
    assert.equal(llave.formato, 2);
    assert.equal(llave.huella, creada.huella);
    assert.deepEqual(Object.keys(kdfDeLlave(b.db, llave)), ['kdf', 'N', 'r', 'p', 'sal']);
    assert.equal(estadoCopias(b.db, { ahora: b.t, huellaLlave: estadoLlave(b.config).huella }).clave.contrasena, true);
    b.avanzar(MINUTO);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const [c] = b.copias();
    assert.equal(c.estado, 'verificada');
    // La sal va en el índice y en la cabecera del flujo (la parte 1).
    const carpeta = join(b.config.carpetaCopias, 'cifradas');
    const archivos = archivosEn(carpeta);
    const indice = archivos.find(a => a.endsWith('-indice.txt'));
    assert.deepEqual(pareceIndice(readFileSync(indice, 'utf8')).kdf, kdfDeLlave(b.db, llave));
    // Nada de la contraseña va a Telegram (ni en un mensaje, ni en una leyenda, ni dentro de un archivo).
    const bytesP1 = Buffer.from(P1, 'utf8');
    assert.ok(b.falso.documentos.length > 0);
    for (const d of b.falso.documentos) assert.ok(!d.datos.includes(bytesP1) && !String(d.leyenda ?? '').includes(P1), d.nombre);
    assert.ok(!JSON.stringify(b.falso.mensajes).includes(P1), 'los mensajes');
    const original = contenido(b.db);
    // Archivos (con índice) y Telegram (el índice fijado).
    for (const fuente of [{ tipo: 'archivos', archivos: [carpeta] }, { tipo: 'telegram', token: b.token, chatId: String(CHAT) }]) {
      const lugar = carpetaTemporal('contrasena');
      const destino = join(lugar, 'nueva.db');
      const r = await restaurarCopia({ clave: `  ${P1} `, fuente, destino, carpetaTrabajo: join(lugar, 'partes'), ajustar: false, base: b.falso.url });
      assert.deepEqual([r.copia, r.autentica, r.con, r.receptor], [c.copia, 'indice+flujo', 'contrasena', llave.huella], fuente.tipo);
      const db2 = abrirBase({ archivoBase: destino, carpetaCopias: join(lugar, 'copias') });
      assert.deepEqual(sinCopias(contenido(db2)), sinCopias(original), fuente.tipo);
      db2.close();
    }
    // Sin el índice (solo las partes guardadas desde Telegram Desktop): la sal sale de la cabecera de la parte 1.
    const soloPartes = carpetaTemporal('solo-partes');
    for (const a of archivos.filter(x => x.endsWith('.opc'))) cpSync(a, join(soloPartes, a.split('/').at(-1)));
    const sin = await restaurarCopia({ clave: P1, fuente: { tipo: 'archivos', archivos: [soloPartes] }, destino: null, ajustar: false });
    assert.deepEqual([sin.copia, sin.autentica, sin.con], [c.copia, 'flujo', 'contrasena']);
    // Una contraseña mala: un error claro (nunca una copia abierta, nunca un error raro).
    for (const fuente of [{ tipo: 'archivos', archivos: [carpeta] }, { tipo: 'archivos', archivos: [soloPartes] }]) {
      await rechaza(restaurarCopia({ clave: 'Avion de papel 2027', fuente, destino: null, ajustar: false }), 'contrasena_no_abre');
    }
    await rechaza(restaurarCopia({ clave: P1.toLowerCase(), fuente: { tipo: 'telegram', token: b.token, chatId: String(CHAT) }, carpetaTrabajo: carpetaTemporal('mala'), destino: null, ajustar: false, base: b.falso.url }), 'contrasena_no_abre');
    await rechaza(restaurarCopia({ clave: '   ', fuente: { tipo: 'archivos', archivos: [carpeta] }, destino: null }), 'clave_formato');
    // La consola (deploy/oportia-restaurar.mjs): la contraseña por la entrada; una mala → salida 3 con su frase.
    const bien = await consolaRestaurar([`--archivos=${carpeta}`, '--comprobar'], `${P1}\n`);
    assert.equal(bien.status, 0, bien.stderr);
    assert.match(bien.stdout, /Escribe tu contraseña de copias o tu clave de recuperación/);
    assert.match(bien.stdout, /La contraseña corresponde/);
    const mal = await consolaRestaurar([`--archivos=${carpeta}`, '--comprobar'], 'Avion de papel 2027\n');
    assert.equal(mal.status, 3);
    assert.match(mal.stderr, /Esa contraseña no abre tus copias.*\(contrasena_no_abre\)/);
    for (const r of [bien, mal]) assert.ok(!r.stdout.includes(P1) && !r.stderr.includes(P1), 'la contraseña nunca se muestra');
  } finally {
    await b.cerrar();
  }
});

test('0.14.2 la clave de 28 símbolos de antes sigue abriendo sus copias (y sus copias no cambian: sin kdf)', async () => {
  const b = await montar({ relleno: 4, telegram: false });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const vieja = b.copias()[0];
    const carpeta = join(b.config.carpetaCopias, 'cifradas');
    const indiceViejo = archivosEn(carpeta).find(a => a.endsWith('-indice.txt'));
    assert.equal('kdf' in pareceIndice(readFileSync(indiceViejo, 'utf8')), false, 'el índice de siempre');
    // Con una clave de 28 símbolos y sin ningún kdf, una contraseña da el error de la clave de siempre.
    await rechaza(restaurarCopia({ clave: P1, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino: null }), 'clave_formato');
    // El dueño pasa a una contraseña: la copia nueva va con ella; la vieja, con la clave.
    b.avanzar(HORA);
    const r = await conContrasena(b, P1);
    assert.equal(r.antes, vieja.receptor);
    const e = estadoCopias(b.db, { ahora: b.t, huellaLlave: estadoLlave(b.config).huella });
    assert.deepEqual([e.clave.contrasena, e.clave.anteriores.map(x => x.contrasena)], [true, [false]]);
    b.avanzar(MINUTO);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const nueva = b.copias().at(-1);
    const conClave = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino: null, ajustar: false });
    assert.deepEqual([conClave.copia, conClave.con], [vieja.copia, 'clave']);
    const conContra = await restaurarCopia({ clave: P1, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino: null, ajustar: false });
    assert.deepEqual([conContra.copia, conContra.con], [nueva.copia, 'contrasena']);
    // «Comprobar» con la clave de antes sigue por su camino (el verificador): es la anterior.
    const { comprobarClave } = await import('../src/copias/estado.js');
    const { verificadorDe } = await import('./copias-tarea-base.js');
    assert.equal(comprobarClave(b.db, { verificador: verificadorDe(b.claveTexto), ahora: b.t }).resultado, 'anterior');
  } finally {
    await b.cerrar();
  }
});

test('0.14.2 cambiar la contraseña: las copias de antes necesitan la de antes; la misma otra vez (sal nueva) abre todo; «Comprobar» y el recordatorio de 90 días', async () => {
  const b = await montar({ relleno: 4, telegram: false, clave: false });
  try {
    const carpeta = join(b.config.carpetaCopias, 'cifradas');
    const hacer = async () => { b.avanzar(HORA); assert.equal((await b.terminar(b.pedir())).estado, 'hecha'); return b.copias().at(-1); };
    const h1 = (await conContrasena(b, P1)).huella;
    const a = await hacer();
    b.avanzar(HORA);
    const cambio = await conContrasena(b, P2);
    assert.equal(cambio.antes, h1);
    const bCopia = await hacer();
    const abre = async clave => (await restaurarCopia({ clave, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino: null, ajustar: false })).copia;
    assert.equal(await abre(P1), a.copia, 'la de antes abre la copia de antes');
    assert.equal(await abre(P2), bCopia.copia, 'la nueva abre la copia nueva');
    // Comprobar: la de ahora, la de antes, ninguna.
    assert.equal((await comprobarContrasena(b.db, { contrasena: P2, ahora: b.t })).resultado, 'actual');
    const antes = await comprobarContrasena(b.db, { contrasena: P1, ahora: b.t });
    assert.deepEqual([antes.resultado, antes.huella], ['anterior', h1]);
    assert.equal((await comprobarContrasena(b.db, { contrasena: 'No es ninguna 99', ahora: b.t })).resultado, 'no_es');
    // La MISMA contraseña de antes otra vez (por ejemplo tras recuperar): sal nueva, llave nueva; abre lo de antes y lo nuevo.
    b.avanzar(HORA);
    const otraVez = await conContrasena(b, P1);
    assert.notEqual(otraVez.huella, h1);
    const c = await hacer();
    assert.equal(await abre(P1), c.copia, 'la más nueva de esa contraseña');
    assert.equal(await abre(P2), bCopia.copia);
    const soloA = carpetaTemporal('solo-a');
    for (const f of archivosEn(carpeta).filter(x => x.includes(a.copia.replace(/-/g, '').slice(0, 8)))) cpSync(f, join(soloA, f.split('/').at(-1)));
    assert.equal((await restaurarCopia({ clave: P1, fuente: { tipo: 'archivos', archivos: [soloA] }, destino: null, ajustar: false })).copia, a.copia);
    // El recordatorio de cada 90 días se abre y «Comprobar» con la contraseña lo cierra.
    b.avanzar(91 * 24 * HORA);
    vigilarCopias(b.db, b.config, { ahora: b.t, libreMb: 100_000 });
    assert.ok(b.aviso('copias_comprobar_clave'), 'el recordatorio');
    assert.equal((await comprobarContrasena(b.db, { contrasena: P1, ahora: b.t })).resultado, 'actual');
    assert.equal(b.aviso('copias_comprobar_clave'), null, 'comprobada: se cierra');
    assert.equal(llaveActiva(b.db).comprobada_en, new Date(b.t).toISOString());
    vigilarCopias(b.db, b.config, { ahora: b.t + HORA, libreMb: 100_000 });
    assert.equal(b.aviso('copias_comprobar_clave'), null);
  } finally {
    await b.cerrar();
  }
});

test('0.14.2 las rutas: solo { contrasena, repetida }, piden la contraseña de entrar, no-store, avisan si es la misma; nada secreto en la base, el disco ni la consola', async () => {
  const b = await montar({ telegram: false, clave: false, relleno: 2 });
  const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
  const ENTRAR = 'Mi clave de entrar 1';
  try {
    const servidor = crearServidor({ db: b.db, config: b.config, copias: { medirDisco: () => 100_000, kdf: CHICO } });
    const consola = await capturarConsola(async () => {
      await conServidor(servidor, async base => {
        const respuestas = [];
        const pedir = async (metodo, ruta, { datos, galleta, cabeceras = {} } = {}) => {
          const r = await fetch(`${base}${ruta}`, {
            method: metodo,
            headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos !== undefined ? { 'Content-Type': 'application/json' } : {}), ...cabeceras },
            body: datos !== undefined ? JSON.stringify(datos) : undefined,
          });
          const texto = await r.text();
          respuestas.push(texto);
          let cuerpo = {};
          try { cuerpo = JSON.parse(texto); } catch { cuerpo = {}; }
          return { codigo: r.status, datos: cuerpo, cache: r.headers.get('cache-control'), galleta: r.headers.get('set-cookie')?.split(';')[0] ?? null };
        };
        const { hashClave } = await import('../src/cuentas/claves.js');
        b.db.prepare('UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id = ?').run(await hashClave(ENTRAR), b.admin);
        const admin = (await pedir('POST', '/api/entrar', { datos: { nombre: 'junior', clave: ENTRAR }, cabeceras: DUENO })).galleta;
        const comoDueno = (metodo, ruta, opciones = {}) => pedir(metodo, ruta, { galleta: admin, ...opciones, cabeceras: { ...DUENO, ...(opciones.cabeceras ?? {}) } });
        await comoDueno('GET', '/api/admin/claves');
        // Por el enlace público pide la contraseña de entrar otra vez.
        const funnel = await pedir('POST', '/api/admin/copias/contrasena', { galleta: admin, cabeceras: { 'Tailscale-Funnel-Request': '?1' }, datos: { contrasena: P1, repetida: P1 } });
        assert.deepEqual([funnel.codigo, funnel.datos.error], [403, 'confirmar_clave']);
        // Solo esos dos campos, de texto.
        for (const datos of [{ contrasena: P1 }, { contrasena: P1, repetida: P1, clave: 'x' }, { contrasena: 1, repetida: 1 }, {}]) {
          assert.deepEqual((await comoDueno('POST', '/api/admin/copias/contrasena', { datos })).datos.error, 'contrasena_formato', JSON.stringify(Object.keys(datos)));
        }
        assert.deepEqual((await comoDueno('POST', '/api/admin/copias/contrasena', { datos: { contrasena: 'corta1', repetida: 'corta1' } })).datos.error, 'contrasena_corta');
        assert.deepEqual((await comoDueno('POST', '/api/admin/copias/contrasena', { datos: { contrasena: P1, repetida: P2 } })).datos.error, 'contrasenas_distintas');
        const ok = await comoDueno('POST', '/api/admin/copias/contrasena', { datos: { contrasena: P1, repetida: P1 } });
        assert.equal(ok.codigo, 201);
        assert.equal(ok.cache, 'no-store');
        assert.equal(ok.datos.igualQueEntrar, false);
        assert.match(ok.datos.activa.huella, /^[0-9A-Z]{4}$/);
        const estado = (await comoDueno('GET', '/api/admin/copias')).datos;
        assert.deepEqual([estado.clave.activa, estado.clave.contrasena, estado.puede.motivoNoAhora], [true, true, null]);
        // La misma que la de entrar: se acepta, y se avisa (nunca se obliga).
        const igual = await comoDueno('POST', '/api/admin/copias/contrasena', { datos: { contrasena: ENTRAR, repetida: ENTRAR } });
        assert.deepEqual([igual.codigo, igual.datos.igualQueEntrar, igual.datos.antes], [201, true, ok.datos.activa.huella]);
        // Comprobar.
        const comprobar = await comoDueno('POST', '/api/admin/copias/contrasena/comprobar', { datos: { contrasena: P1 } });
        assert.deepEqual([comprobar.codigo, comprobar.cache, comprobar.datos.resultado], [200, 'no-store', 'anterior']);
        assert.equal((await comoDueno('POST', '/api/admin/copias/contrasena/comprobar', { datos: { contrasena: ENTRAR } })).datos.resultado, 'actual');
        assert.equal((await comoDueno('POST', '/api/admin/copias/contrasena/comprobar', { datos: { contrasena: P1, otra: 'x' } })).datos.error, 'contrasena_formato');
        for (const texto of respuestas) for (const secreto of [P1, P2, ENTRAR]) assert.ok(!texto.includes(secreto), 'ninguna respuesta trae la contraseña');
      });
    });
    // Una copia con la contraseña de ahora.
    b.avanzar(MINUTO);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    b.db.exec('PRAGMA wal_checkpoint(PASSIVE)');
    // Nada secreto: ni en la base (con su -wal), ni en la carpeta de los datos o de las copias, ni en la consola.
    const carpetas = [...new Set([dirname(b.config.archivoBase), b.config.carpetaCopias])];
    const todos = carpetas.flatMap(c => { try { return archivosEn(c); } catch { return []; } });
    assert.ok(todos.some(f => f === b.config.archivoBase));
    for (const secreto of [P1, P2, ENTRAR]) {
      const bytes = Buffer.from(secreto, 'utf8');
      for (const f of todos) assert.ok(!readFileSync(f).includes(bytes), `${f.split('/').at(-1)} tiene una contraseña`);
      assert.ok(!consola.includes(secreto), 'la consola');
      for (const tabla of ['auditoria', 'avisos', 'ajustes', 'copias_llaves']) assert.ok(!JSON.stringify(b.db.prepare(`SELECT * FROM ${tabla}`).all()).includes(secreto), tabla);
    }
  } finally {
    await b.cerrar();
  }
});

test('0.14.2 la clave de 28 símbolos se crea todavía por la API de antes (compatibilidad) y convive con una contraseña', async () => {
  const b = await montar({ telegram: false, clave: false, relleno: 1 });
  try {
    await conContrasena(b, P1);
    b.avanzar(MINUTO);
    const texto = ponerClave(b.db, { config: b.config, usuarioId: b.admin, ahora: b.t });
    assert.match(texto, /^[0-9A-Z]{4}(?:-[0-9A-Z]{4}){6}$/);
    const e = estadoCopias(b.db, { ahora: b.t, huellaLlave: estadoLlave(b.config).huella });
    assert.deepEqual([e.clave.contrasena, e.clave.anteriores.map(x => x.contrasena)], [false, [true]]);
    assert.equal((await comprobarContrasena(b.db, { contrasena: P1, ahora: b.t })).resultado, 'anterior');
  } finally {
    await b.cerrar();
  }
});
