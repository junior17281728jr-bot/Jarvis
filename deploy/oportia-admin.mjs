// Recuperar el acceso de administrador de OPORTIA desde la Consola de DigitalOcean.
//
// Uso (pégalo en la Consola del servidor):
//   sudo -u jarvis node /opt/jarvis/deploy/oportia-admin.mjs            -> recupera el primer administrador
//   sudo -u jarvis node /opt/jarvis/deploy/oportia-admin.mjs junior     -> recupera (o crea) el administrador «junior»
//
// Qué hace: genera una contraseña temporal, cierra las sesiones abiertas de esa cuenta y te pide
// cambiarla al entrar. No borra nada. Se ejecuta como el usuario «jarvis» (nunca como root) para que
// los archivos de la base sigan siendo de quien debe.
import { readFileSync, existsSync } from 'node:fs';
import { leerConfig } from '../src/nucleo/config.js';
import { abrirBase } from '../src/nucleo/db.js';
import { hashClave, claveTemporal } from '../src/cuentas/claves.js';
import { cerrarTodas } from '../src/cuentas/sesiones.js';
import { NOMBRE_VALIDO, auditar, buscarPorNombre, crearUsuario, guardarClave, ponerActivo } from '../src/cuentas/usuarios.js';

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
  if (process.getuid?.() === 0 && process.env.OPORTIA_TEST !== '1') {
    console.error('No lo ejecutes como root. Usa: sudo -u jarvis node /opt/jarvis/deploy/oportia-admin.mjs');
    return 2;
  }
  const archivoEnv = process.env.OPORTIA_ENV_FILE || '/opt/jarvis/.env';
  const config = leerConfig({ ...leerEnv(archivoEnv), ...process.env });
  const db = abrirBase(config);
  try {
    const pedido = (process.argv[2] || '').trim();
    let admin;
    if (pedido) {
      if (!NOMBRE_VALIDO.test(pedido)) {
        console.error('Nombre no válido: de 3 a 40 letras o números, sin espacios.');
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

principal().then(codigo => { process.exitCode = codigo; }).catch(error => {
  console.error('No se pudo completar:', error.message);
  process.exitCode = 1;
});
