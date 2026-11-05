// Recuperar el acceso de administrador de OPORTIA desde la Consola de DigitalOcean.
//
// Uso (pégalo en la Consola del servidor):
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs          -> recupera el primer administrador
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs junior   -> recupera (o crea) el administrador «junior»
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --modo-seguro=si   -> pone en pausa el trabajo automático
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --modo-seguro=no   -> lo vuelve a encender
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --ia=no            -> apaga la IA (no gasta nada más)
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --claves=revisar   -> explica cómo está el archivo que protege las claves (no cambia nada)
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --claves=apartar-llave-danada -> si ese archivo está dañado, le cambia el nombre (no lo borra)
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --tailscale=reanotar [nombre] -> olvida la cuenta de Tailscale del administrador (la próxima entrada anota la nueva)
//
// Para encender la IA no hay opción de consola, a propósito: gastar dinero se decide en la pantalla, con su aviso.
//
// El modo seguro sirve cuando las pantallas no abren: el servicio que está corriendo lo aplica en menos de
// 30 segundos, sin reiniciar. Las pantallas siguen funcionando y no se pierde nada (lo que está en la fila espera).
//
// La contraseña nueva también quita cualquier bloqueo por intentos fallidos que tuviera la cuenta.
//
// Qué hace: genera una contraseña temporal, cierra las sesiones abiertas de esa cuenta y te pide
// cambiarla al entrar. No borra nada. Se ejecuta como el usuario «jarvis» (nunca como root) para que
// los archivos de la base sigan siendo de quien debe.
import { readFileSync, existsSync } from 'node:fs';
import { leerConfig } from '../src/nucleo/config.js';
import { abrirBase, conectarBase } from '../src/nucleo/db.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { hashClave, claveTemporal } from '../src/cuentas/claves.js';
import { cerrarTodas } from '../src/cuentas/sesiones.js';
import { NOMBRE_VALIDO, auditar, buscarPorNombre, crearUsuario, guardarClave, ponerActivo } from '../src/cuentas/usuarios.js';
import { ponerModoSeguro } from '../src/tareas/modo-seguro.js';
import { guardarConfigIa, leerConfigIa } from '../src/ia/config.js';
import { estadoLlave, apartarLlaveDanada, diagnosticoLlave } from '../src/claves/cifrado.js';
import { reanotarTailscale } from '../src/cuentas/tailscale.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function leerEnv(archivo) {
  const env = {};
  if (!existsSync(archivo)) return env;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

async function principal() {
  process.umask(0o027);
  if (process.getuid?.() === 0 && process.env.OPORTIA_TEST !== '1') {
    console.error('No lo ejecutes como root. Usa: sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs');
    return 2;
  }
  const archivoEnv = process.env.OPORTIA_ENV_FILE || '/opt/jarvis/.env';
  const config = leerConfig({ ...leerEnv(archivoEnv), ...process.env });
  const pedido = (process.argv[2] || '').trim();
  // Un nombre de usuario nunca empieza con «-», así que esto no se confunde con recuperar a alguien.
  let modoSeguro = null;
  if (pedido.startsWith('-')) {
    if (pedido === '--ia=no') return conBase(config, { abrirSiFalta: true }, db => apagarIa(db, config));
    if (pedido === '--claves=revisar') return revisarClaves(config);
    if (pedido === '--claves=apartar-llave-danada') return apartarLlave(config);
    if (pedido === '--tailscale=reanotar') return conBase(config, { abrirSiFalta: false }, db => reanotar(db, (process.argv[3] || '').trim()));
    const m = pedido.match(/^--modo-seguro=(si|no)$/);
    if (!m) {
      console.error('Opción no válida. Usa --modo-seguro=si (pausar el trabajo automático), --modo-seguro=no (encenderlo otra vez), --ia=no (apagar la IA), --claves=revisar, --claves=apartar-llave-danada o --tailscale=reanotar.');
      return 2;
    }
    modoSeguro = m[1] === 'si';
  }
  // El modo seguro se pone con el servicio ENCENDIDO: la base se abre sin cambiarla ni ordenarla (conectarBase),
  // porque el «ordenar al abrir» de abrirBase espera a que terminen las lecturas en marcha y, mientras tanto,
  // las pantallas no pueden guardar nada (hasta 5 s). Solo si la base todavía no existe o no está al día (el
  // servicio no ha arrancado con esta versión) se abre como siempre.
  const db = modoSeguro != null ? abrirParaModoSeguro(config) : abrirBase(config);
  try {
    if (modoSeguro != null) return cambiarModoSeguro(db, modoSeguro);
    let admin;
    if (pedido) {
      if (!NOMBRE_VALIDO.test(pedido)) {
        console.error('Nombre no válido: de 3 a 40 caracteres, sin espacios (letras sin tilde ni ñ, números, punto, guion o guion bajo).');
        return 2;
      }
      admin = buscarPorNombre(db, pedido);
      if (admin && admin.rol !== 'admin') {
        console.error(`«${pedido}» existe pero no es administrador. Elige otro nombre.`);
        return 2;
      }
    } else {
      admin = db.prepare("SELECT * FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1").get();
    }
    const temporal = claveTemporal();
    const claveHash = await hashClave(temporal);
    let nombre;
    if (admin) {
      guardarClave(db, admin.id, claveHash, { debeCambiarClave: true });
      ponerActivo(db, admin.id, true);
      cerrarTodas(db, admin.id);
      auditar(db, { usuarioId: admin.id, accion: 'acceso_recuperado_consola' });
      nombre = admin.nombre;
    } else {
      nombre = pedido || 'admin';
      const id = crearUsuario(db, { nombre, claveHash, rol: 'admin', debeCambiarClave: true });
      auditar(db, { usuarioId: id, accion: 'admin_creado_consola' });
    }
    console.log('Listo. Entra a https://jarvis.taila693e9.ts.net con:');
    console.log(`  Usuario: ${nombre}`);
    console.log(`  Contraseña temporal: ${temporal}`);
    console.log('Al entrar, OPORTIA te pedirá elegir una contraseña nueva.');
    return 0;
  } finally {
    db.close();
  }
}

function abrirParaModoSeguro(config) {
  const versionMinima = Math.max(...MIGRACIONES.map(m => m.id));
  try {
    return conectarBase(config, { versionMinima });
  } catch (error) {
    if (['base_no_existe', 'base_vieja', 'base_sin_wal'].includes(error.codigo)) return abrirBase(config);
    throw error;
  }
}

// Abre la base sin ordenarla (como el modo seguro: el servicio puede estar encendido), corre fn y la cierra.
// abrirSiFalta: si la base todavía no existe o no está al día, se abre como siempre (como hace el servicio).
async function conBase(config, { abrirSiFalta }, fn) {
  let db;
  try {
    db = abrirSiFalta ? abrirParaModoSeguro(config) : conectarBase(config, { versionMinima: Math.max(...MIGRACIONES.map(m => m.id)) });
  } catch (error) {
    console.error(`No se pudo abrir la base (${error.codigo ?? 'error'}). No se cambió nada.`);
    return 1;
  }
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

// --ia=no: la IA queda apagada (con su auditoría «consola»). Lo que ya estaba en camino termina y se anota; lo próximo
// ya la encuentra apagada. No toca la ayuda en proyectos, los topes ni las claves.
function apagarIa(db, config) {
  const antes = leerConfigIa(db);
  guardarConfigIa(db, { encendida: false }, { config, origen: 'consola' });
  console.log(antes.encendida ? 'Listo: la IA quedó APAGADA desde la consola.' : 'La IA ya estaba apagada: no cambió nada.');
  console.log('OPORTIA sigue trabajando con su motor propio, sin costo. Para encenderla otra vez: Administrador → Inteligencia artificial (desde Tailscale).');
  console.log(`Estado ahora: IA ${leerConfigIa(db).encendida ? 'encendida' : 'apagada'}.`);
  return 0;
}

// --claves=revisar: explica en palabras simples cómo está el archivo que protege las claves. No cambia nada.
function revisarClaves(config) {
  let db = null;
  try {
    db = conectarBase(config, { versionMinima: 5 });
  } catch {
    db = null; // sin base (o vieja): se revisa solo el archivo
  }
  try {
    for (const linea of diagnosticoLlave(config, { db })) console.log(linea);
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
  return 0;
}

// --claves=apartar-llave-danada: SOLO si el archivo está dañado, le cambia el nombre (nunca lo borra). La próxima clave
// que pegues crea un archivo nuevo; las claves viejas quedan guardadas, sin poder leerse.
function apartarLlave(config) {
  const estado = estadoLlave(config);
  if (estado.motivo !== 'llave_danada') {
    const porQue = estado.listo ? 'está bien' : estado.motivo === 'llave_no_existe' ? 'todavía no existe'
      : estado.motivo === 'llave_version_nueva' ? 'lo escribió una versión más nueva de OPORTIA (no está dañado)' : 'no se puede leer por permisos';
    console.log(`No se apartó nada: el archivo que protege las claves ${porQue}. No se cambió nada.`);
    return 0;
  }
  const r = apartarLlaveDanada(config);
  if (!r.apartada) {
    console.error('No se pudo apartar: ya existe un archivo con ese nombre. Espera un segundo y vuelve a probar. No se cambió nada.');
    return 1;
  }
  let db = null;
  try {
    db = conectarBase(config, { versionMinima: 5 });
    auditar(db, { usuarioId: null, accion: 'llave_apartada', detalle: JSON.stringify({ archivo: r.archivo, origen: 'consola' }) });
  } catch {
    // sin base: el cambio de nombre igual queda (y se ve en --claves=revisar)
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
  console.log(`Listo: el archivo dañado quedó guardado como ${r.archivo} (no se borró).`);
  console.log('Ahora pega tus claves otra vez en Administrador → Claves (desde Tailscale): la primera crea un archivo nuevo.');
  return 0;
}

// --tailscale=reanotar [nombre]: olvida la cuenta de Tailscale guardada del administrador (el primero, o el del nombre).
// La próxima vez que entre a Claves o a los ajustes de la IA por el enlace https, se anota la cuenta con la que entra.
function reanotar(db, nombre) {
  if (nombre && !NOMBRE_VALIDO.test(nombre)) {
    console.error('Nombre no válido.');
    return 2;
  }
  const admin = nombre ? buscarPorNombre(db, nombre) : db.prepare("SELECT * FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1").get();
  if (!admin || admin.rol !== 'admin') {
    console.error(nombre ? `«${nombre}» no es un administrador.` : 'Todavía no hay administrador.');
    return 2;
  }
  const antes = reanotarTailscale(db, { usuarioId: admin.id, origen: 'consola' });
  if (antes == null) console.log(`«${admin.nombre}» no tenía una cuenta de Tailscale guardada: no cambió nada.`);
  else console.log(`Listo: se olvidó la cuenta de Tailscale de «${admin.nombre}» (queda en la auditoría). La próxima vez que entre a Claves desde su iPhone o Mac, por el enlace https, se anota la nueva.`);
  return 0;
}

// Escribe el modo seguro en la base (con su auditoría y su aviso). El servicio lo lee cada 30 segundos.
function cambiarModoSeguro(db, activo) {
  const r = ponerModoSeguro(db, { activo, origen: 'consola', version: VERSION });
  if (activo) {
    console.log(r.cambio ? 'Listo: modo seguro ACTIVADO desde la consola.' : 'El modo seguro ya estaba activado: no cambió nada.');
    console.log('El trabajo automático se apaga en menos de 30 segundos, sin reiniciar. Las pantallas siguen funcionando y no se pierde nada.');
    console.log('Para quitarlo: sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --modo-seguro=no');
  } else {
    console.log(r.cambio ? 'Listo: modo seguro QUITADO desde la consola.' : 'El modo seguro ya estaba quitado: no cambió nada.');
    if (r.cambio) console.log('El trabajo automático se vuelve a encender en menos de 30 segundos y sigue con lo que estaba en la fila.');
    if (r.cambio && r.ultimo?.motivo === 'base_danada') console.log('Como estaba activado por un problema en la base, la base se revisa otra vez enseguida.');
  }
  console.log(`Estado ahora: modo seguro ${r.activo ? 'activado' : 'quitado'}.`);
  return 0;
}

principal().then(codigo => { process.exitCode = codigo; }).catch(error => {
  console.error('No se pudo completar:', error.message);
  process.exitCode = 1;
});
