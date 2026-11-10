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
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --claves=recuperar-llave -> si falta ese archivo y queda otro nombre con la llave de tus claves, se lo vuelve a poner
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --claves=empezar-de-nuevo -> si falta ese archivo y no se puede recuperar, crea uno nuevo (las claves de antes quedan sin poder leerse; nada se borra)
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --tailscale=reanotar     -> olvida la cuenta de Tailscale del dueño (el primer administrador; la próxima entrada anota la nueva)
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --copias=estado         -> cómo están las copias de seguridad (no cambia nada)
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --copias=ahora          -> pide una copia ahora (la hace el trabajo automático)
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --copias=antes-de-cambio -> una copia completa de la base en el servidor, en un archivo NUEVO (la pide «sudo oportia pasar» antes de cambiar nada)
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --telegram=desvincular  -> deja de usar el chat de Telegram unido (no borra nada)
//   Para recuperar una copia: deploy/oportia-restaurar.mjs (explica su uso al principio del archivo).
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
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { leerConfig } from '../src/nucleo/config.js';
import { abrirBase, conectarBase, revisarModoPrueba } from '../src/nucleo/db.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { hashClave, claveTemporal } from '../src/cuentas/claves.js';
import { cerrarTodas } from '../src/cuentas/sesiones.js';
import { NOMBRE_VALIDO, auditar, buscarPorNombre, crearUsuario, guardarClave, ponerActivo } from '../src/cuentas/usuarios.js';
import { ponerModoSeguro } from '../src/tareas/modo-seguro.js';
import { guardarConfigIa, leerConfigIa } from '../src/ia/config.js';
import { estadoLlave, apartarLlaveDanada, diagnosticoLlave, recuperarLlave, empezarLlaveNueva } from '../src/claves/cifrado.js';
import { clavesGuardadas } from '../src/claves/almacen.js';
import { reanotarTailscale, idDelDueno } from '../src/cuentas/tailscale.js';
import { estadoCopias, tareaDeCopiaViva, llaveActiva } from '../src/copias/estado.js';
import { estadoTelegram, desvincular } from '../src/canales/canales.js';
import { discoLibreMb, discoDeCopias } from '../src/nucleo/salud.js';
import { encolar } from '../src/tareas/cola.js';
import { leerModoSeguro } from '../src/tareas/modo-seguro.js';

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
    if (pedido === '--claves=recuperar-llave') return recuperarLaLlave(config);
    if (pedido === '--claves=empezar-de-nuevo') return empezarDeNuevo(config);
    if (pedido === '--tailscale=reanotar') return conBase(config, { abrirSiFalta: false }, db => reanotar(db, (process.argv[3] || '').trim()));
    if (pedido === '--copias=estado') return conBase(config, { abrirSiFalta: false }, db => estadoDeCopias(db, config));
    if (pedido === '--copias=ahora') return conBase(config, { abrirSiFalta: false }, db => copiaAhora(db));
    if (pedido === '--copias=antes-de-cambio') return conBase(config, { abrirSiFalta: false }, db => copiaAntesDeCambio(db, config));
    if (pedido === '--telegram=desvincular') return conBase(config, { abrirSiFalta: false }, db => dejarTelegram(db));
    const m = pedido.match(/^--modo-seguro=(si|no)$/);
    if (!m) {
      console.error('Opción no válida. Usa --modo-seguro=si (pausar el trabajo automático), --modo-seguro=no (encenderlo otra vez), --ia=no (apagar la IA), --claves=revisar, --claves=apartar-llave-danada, --claves=recuperar-llave, --claves=empezar-de-nuevo --tailscale=reanotar, --copias=estado, --copias=ahora o --telegram=desvincular.');
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

// --claves=recuperar-llave: SOLO si falta el archivo de la llave y queda otro nombre (.nueva-…) con la llave con la
// que se guardaron las claves, le vuelve a poner su nombre (link: no borra ni pisa nada). Queda en la auditoría.
function recuperarLaLlave(config) {
  let db;
  try {
    db = conectarBase(config, { versionMinima: 5 });
  } catch (error) {
    console.error(`No se pudo abrir la base (${error.codigo ?? 'error'}): sin ella no se sabe cuál llave es la de tus claves. No se cambió nada.`);
    return 1;
  }
  try {
    const huellas = db.prepare("SELECT llave_huella AS h, SUM(estado = 'activa') AS activas, COUNT(*) AS n FROM secretos GROUP BY llave_huella ORDER BY activas DESC, n DESC").all().map(f => f.h);
    const r = recuperarLlave(config, { huellas });
    if (!r.recuperada) {
      const porQue = {
        llave_sana: 'el archivo de la llave existe y está bien',
        llave_danada: 'el archivo de la llave existe pero está dañado (primero --claves=apartar-llave-danada)',
        llave_version_nueva: 'el archivo de la llave lo escribió una versión más nueva de OPORTIA',
        llave_sin_permiso: 'no se puede leer por permisos (corre esto como sudo -u jarvis …)',
        sin_llave_que_sirva: 'no queda ningún otro nombre con la llave de tus claves (--claves=revisar lo explica)',
        ya_existe: 'otro proceso acaba de crear el archivo de la llave',
      }[r.motivo] ?? 'no se pudo';
      console.log(`No se recuperó nada: ${porQue}. No se cambió nada.`);
      return r.motivo === 'llave_sana' ? 0 : 2;
    }
    auditar(db, { usuarioId: null, accion: 'llave_recuperada', detalle: JSON.stringify({ archivo: r.archivo, origen: 'consola' }) });
    console.log(`Listo: la llave volvió a su nombre desde ${r.archivo} (no se borró nada). Tus claves guardadas se pueden leer otra vez.`);
    return 0;
  } finally {
    db.close();
  }
}

// --claves=empezar-de-nuevo: SOLO si falta el archivo de la llave y ningún otro nombre tiene la llave de tus claves
// (si alguno la tiene, --claves=recuperar-llave). Crea una llave nueva: las claves de antes quedan guardadas, sin
// poder leerse, y se pegan otra vez en Administrador → Claves. Nada se borra. Queda en la auditoría.
function empezarDeNuevo(config) {
  let db;
  try {
    db = conectarBase(config, { versionMinima: 5 });
  } catch (error) {
    console.error(`No se pudo abrir la base (${error.codigo ?? 'error'}): sin ella no se sabe si tus claves se pueden recuperar. No se cambió nada.`);
    return 1;
  }
  try {
    const r = empezarLlaveNueva(config, clavesGuardadas(db));
    if (!r.creada) {
      const porQue = {
        llave_sana: 'el archivo de la llave existe y está bien',
        llave_danada: 'el archivo de la llave existe pero está dañado (usa --claves=apartar-llave-danada)',
        llave_version_nueva: 'el archivo de la llave lo escribió una versión más nueva de OPORTIA',
        llave_sin_permiso: 'no se puede leer por permisos (corre esto como sudo -u jarvis …)',
        recuperable: 'todavía queda otro nombre con la llave de tus claves: usa --claves=recuperar-llave',
      }[r.motivo] ?? 'no se pudo';
      console.log(`No se creó nada: ${porQue}. No se cambió nada.`);
      return r.motivo === 'llave_sana' ? 0 : 2;
    }
    auditar(db, { usuarioId: null, accion: 'llave_nueva', detalle: JSON.stringify({ origen: 'consola' }) });
    console.log('Listo: se creó una llave nueva (no se borró nada). Las claves de antes quedan guardadas, sin poder leerse.');
    console.log('Ahora pega tus claves otra vez en Administrador → Claves (desde Tailscale).');
    return 0;
  } finally {
    db.close();
  }
}

// --tailscale=reanotar [nombre]: olvida la cuenta de Tailscale guardada del DUEÑO (el primer administrador: el único
// que ve las claves y cambia la IA). La próxima vez que el dueño entre a Claves o a los ajustes de la IA por el enlace
// https, se anota la cuenta con la que entra. [nombre], si se da, tiene que ser el del dueño.
function reanotar(db, nombre) {
  if (nombre && !NOMBRE_VALIDO.test(nombre)) {
    console.error('Nombre no válido.');
    return 2;
  }
  const id = idDelDueno(db);
  const admin = id == null ? null : db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!admin) {
    console.error('Todavía no hay administrador.');
    return 2;
  }
  if (nombre && buscarPorNombre(db, nombre)?.id !== admin.id) {
    console.error(`«${nombre}» no es el dueño. Solo la cuenta del dueño («${admin.nombre}», el primer administrador) usa la cuenta de Tailscale guardada: no cambió nada.`);
    return 2;
  }
  const antes = reanotarTailscale(db, { usuarioId: admin.id, origen: 'consola' });
  if (antes == null) console.log(`«${admin.nombre}» no tenía una cuenta de Tailscale guardada: no cambió nada.`);
  else console.log(`Listo: se olvidó la cuenta de Tailscale de «${admin.nombre}» (queda en la auditoría). La próxima vez que entre a Claves desde su iPhone o Mac, por el enlace https, se anota la nueva.`);
  return 0;
}

const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaRd(iso) {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms - 4 * 3_600_000);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${meses[d.getUTCMonth()]}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
const megas = bytes => `${Math.max(0, Math.round(((Number(bytes) || 0) / (1024 * 1024)) * 10) / 10)} MB`;

// --copias=antes-de-cambio (parte 1f): una copia COMPLETA de la base, en el servidor, en un archivo nuevo de la carpeta
// de las copias (oportia-antes-de-1f-<fecha>.db). La pide «sudo oportia pasar» antes de cambiar el actualizador (los
// datos no se tocan en ese cambio; la copia es por si acaso). Nunca pisa un archivo: si el nombre existe, no hace nada.
// Exige disco libre de sobra (2 veces la base + 300 MB). Salidas: 0 hecha · 4 poco disco · 5 el archivo ya existe · 1 otra cosa.
function copiaAntesDeCambio(db, config) {
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = join(config.carpetaCopias, `oportia-antes-de-1f-${sello}.db`);
  revisarModoPrueba(destino);
  if (existsSync(destino)) {
    console.error(`Ya existe ${destino}: no se tocó. Prueba otra vez en un momento.`);
    return 5;
  }
  const tamano = ruta => { try { return statSync(ruta).size; } catch { return 0; } };
  const baseMb = (tamano(config.archivoBase) + tamano(`${config.archivoBase}-wal`)) / (1024 * 1024);
  let libreMb = null;
  try { libreMb = discoDeCopias(config.carpetaCopias, config.carpetaDatos).libreMb; } catch { libreMb = null; }
  if (libreMb == null) { try { libreMb = discoLibreMb(config.carpetaDatos); } catch { libreMb = null; } }
  if (libreMb != null && libreMb < 2 * baseMb + 300) {
    console.error(`No hay disco libre de sobra para la copia (hay ${Math.round(libreMb)} MB; hacen falta ${Math.round(2 * baseMb + 300)} MB). No se cambió nada.`);
    return 4;
  }
  mkdirSync(config.carpetaCopias, { recursive: true });
  try {
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } catch {
    console.error('No se pudo hacer la copia de la base. No se cambió nada.');
    return 1;
  }
  console.log(`Copia de la base hecha: ${destino} (${megas(tamano(destino))}).`);
  return 0;
}

// --copias=estado: cómo están las copias, en palabras simples. No cambia nada.
function estadoDeCopias(db, config) {
  let libreMb = null;
  try { libreMb = discoLibreMb(config.carpetaDatos); } catch { libreMb = null; }
  let dc = { libreMb: null, mismoDisco: null };
  try { dc = discoDeCopias(config.carpetaCopias, config.carpetaDatos); } catch { dc = { libreMb: null, mismoDisco: null }; }
  const t = estadoTelegram(db, config);
  const e = estadoCopias(db, { libreMb, libreCopiasMb: dc.libreMb, mismoDisco: dc.mismoDisco !== false, telegram: t, modoSeguro: leerModoSeguro(db).activo });
  console.log(e.clave.activa ? `Clave de recuperación: ${e.clave.huella} (desde el ${fechaRd(e.clave.desde)}).` : 'Clave de recuperación: FALTA (créala en Administrador → Copias, desde Tailscale). Sin ella no hay copias.');
  console.log(t.chat ? `Telegram: chat de ${t.chat.nombre ?? '—'} (${t.chat.estado}).${t.listo ? '' : ` No llegan mensajes ahora (${t.motivo}).`}` : `Telegram: sin chat unido${t.token ? '' : ' (falta el token del bot)'}.`);
  console.log(e.ultimaFuera ? `Última copia fuera del servidor: la foto del ${fechaRd(e.ultimaFuera.fecha)}, ${megas(e.ultimaFuera.bytes)}, ${e.ultimaFuera.partes} partes, comprobada${e.ultimaFuera.comprobada ? ` el ${fechaRd(e.ultimaFuera.comprobada)}` : ''}.` : 'Última copia fuera del servidor: ninguna todavía.');
  if (e.ultima) console.log(`Última copia (cualquiera): ${fechaRd(e.ultima.fecha)} — ${e.ultima.estado}${e.ultima.motivo ? ` (${e.ultima.motivo})` : ''}.`);
  if (e.enCurso) console.log(`Ahora mismo: haciendo una copia (paso «${e.enCurso.paso}»).`);
  console.log(`Próxima copia: ${fechaRd(e.proxima)}.`);
  const l = e.locales;
  console.log(`En este servidor: ${l.copias} copias, ${l.mb} MB${l.libreMb != null ? `, ${Math.round(l.libreMb)} MB libres en el disco` : ''}${l.diasRestantes != null ? ` (alcanza para unos ${l.diasRestantes} días)` : ''}.`);
  if (l.anterior) console.log(`Copias del servidor anterior (sus archivos NO están aquí; solo quedan sus filas): ${l.anterior.copias} copias, ${l.anterior.mb} MB.`);
  if (l.pausadas) console.log('Disco casi lleno: dejé de guardar copias en el servidor. Las de Telegram siguen. Nada se borró.');
  if (l.frenoDisco) console.log('Disco lleno: las copias están en pausa hasta que haya espacio. Nada se borró.');
  console.log('Nunca se borra ninguna copia.');
  return 0;
}

// --copias=ahora: la pone en la fila (la hace el trabajo automático, en menos de un minuto si está encendido).
function copiaAhora(db) {
  if (!llaveActiva(db)) {
    console.log('Primero crea la clave de recuperación (Administrador → Copias, desde Tailscale). No se pidió nada.');
    return 2;
  }
  if (tareaDeCopiaViva(db)) {
    console.log('Ya hay una copia en la fila o haciéndose. No se pidió otra.');
    return 0;
  }
  const ahora = Date.now();
  const r = encolar(db, { tipo: 'copias.hacer', programa: 'copias.hacer', claveUnica: `copias.hacer@manual-${ahora}`, datos: { origen: 'manual' } }, { ahora });
  if (!r.nueva) {
    console.log('Ya hay una copia en la fila o haciéndose. No se pidió otra.');
    return 0;
  }
  auditar(db, { usuarioId: null, accion: 'copia_pedida', detalle: 'consola' });
  console.log(`Listo: la copia quedó en la fila (tarea n.º ${r.id}).${leerModoSeguro(db).activo ? ' OJO: el modo seguro está activado, así que no se hará hasta quitarlo.' : ' El trabajo automático la hace en menos de un minuto.'}`);
  console.log('Para ver cómo va: sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --copias=estado');
  return 0;
}

// --telegram=desvincular: el chat unido queda «desvinculado» (la fila queda: nada se borra). Para unir otro, Claves.
function dejarTelegram(db) {
  const r = desvincular(db, { origen: 'consola' });
  console.log(r.cambiados ? 'Listo: OPORTIA dejó de usar ese chat de Telegram (no se borró nada). Para unir otro: Administrador → Claves.' : 'No había ningún chat de Telegram unido: no cambió nada.');
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
