// OPORTIA (parte 1f): una mirada de SOLO LECTURA a una base, para los programas del servidor (deploy/oportia-servidor.sh
// y deploy/oportia-recuperar.sh). Corre como el usuario «jarvis», nunca como root. No cambia, crea ni borra nada.
//
//   node --no-warnings oportia-base.mjs <archivo.db>
//       → una línea: «base <usuarios> <proyectos> <último cambio de base>»
//   node --no-warnings oportia-base.mjs --llave <archivo.db>
//       → «llave sirve|sin_claves|ajena|sin_llave» y, debajo, «archivo <ruta>» por cada archivo de la llave de las
//         claves que hay en la carpeta de datos de ESTE servidor (la llave y sus otros nombres).
//         sirve: la llave de este servidor abre las claves guardadas en esa base · sin_claves: esa base no trae
//         ninguna clave guardada · ajena: la llave es de otra base · sin_llave: este servidor no tiene archivo de llave.
//
// Salidas: 0 bien · 2 uso · 1 no se pudo leer.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { leerConfig } from '../src/nucleo/config.js';
import { estadoLlave, esArchivoDeLlave } from '../src/claves/cifrado.js';
import { huellaDeEnvuelto } from '../src/claves/almacen.js';

function leerEnv(archivo) {
  const env = {};
  if (!existsSync(archivo)) return env;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function abrir(archivo) {
  const ruta = resolve(archivo);
  if (!statSync(ruta).isFile()) throw new Error('no es un archivo');
  return new DatabaseSync(ruta, { readOnly: true });
}

const hayTabla = (db, nombre) => Boolean(db.prepare("SELECT 1 AS si FROM sqlite_schema WHERE type = 'table' AND name = ?").get(nombre));
const contar = (db, tabla) => (hayTabla(db, tabla) ? Number(db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n) : 0);

function contarBase(archivo) {
  const db = abrir(archivo);
  try {
    const migracion = hayTabla(db, 'oportia_migraciones') ? Number(db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v ?? 0) : 0;
    process.stdout.write(`base ${contar(db, 'usuarios')} ${contar(db, 'proyectos')} ${migracion}\n`);
  } finally {
    db.close();
  }
  return 0;
}

// Las huellas de las llaves con que se guardó algo en esa base: las claves (tabla secretos) y los datos envueltos.
function huellasDe(db) {
  const huellas = new Set();
  if (hayTabla(db, 'secretos')) for (const f of db.prepare('SELECT DISTINCT llave_huella AS h FROM secretos').all()) if (f.h) huellas.add(String(f.h));
  if (hayTabla(db, 'ajustes')) {
    for (const f of db.prepare("SELECT valor FROM ajustes WHERE valor LIKE '%env1.%'").all()) {
      for (const m of String(f.valor).matchAll(/env1\.[0-9a-f]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g)) {
        const h = huellaDeEnvuelto(m[0]);
        if (h) huellas.add(h);
      }
    }
  }
  return huellas;
}

function revisarLlave(archivo, config) {
  let nombres = [];
  try { nombres = readdirSync(config.carpetaDatos).filter(n => esArchivoDeLlave(n)).sort(); } catch { nombres = []; }
  const db = abrir(archivo);
  let huellas;
  try { huellas = huellasDe(db); } finally { db.close(); }
  let veredicto;
  if (!nombres.length) veredicto = 'sin_llave';
  else if (!huellas.size) veredicto = 'sin_claves';
  else {
    const llave = estadoLlave(config);
    veredicto = llave.listo && huellas.has(llave.huella) ? 'sirve' : 'ajena';
  }
  process.stdout.write(`llave ${veredicto}\n`);
  for (const n of nombres) process.stdout.write(`archivo ${join(config.carpetaDatos, n)}\n`);
  return 0;
}

function principal() {
  if (process.getuid?.() === 0 && process.env.OPORTIA_TEST !== '1') {
    process.stderr.write('No lo ejecutes como root (corre como el usuario jarvis).\n');
    return 2;
  }
  const argumentos = process.argv.slice(2);
  const conLlave = argumentos[0] === '--llave';
  const archivo = conLlave ? argumentos[1] : argumentos[0];
  if (!archivo || archivo.startsWith('--') || argumentos.length !== (conLlave ? 2 : 1)) {
    process.stderr.write('Uso: oportia-base.mjs <archivo.db>  |  oportia-base.mjs --llave <archivo.db>\n');
    return 2;
  }
  try {
    if (!conLlave) return contarBase(archivo);
    const config = leerConfig({ ...leerEnv(process.env.OPORTIA_ENV_FILE || '/opt/jarvis/.env'), ...process.env });
    return revisarLlave(archivo, config);
  } catch {
    process.stderr.write('No se pudo leer esa base.\n');
    return 1;
  }
}

process.exitCode = principal();
