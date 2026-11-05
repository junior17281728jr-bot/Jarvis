// Ayuda común para las pruebas de la IA (no es un archivo *.test.js): una base lista, claves FALSAS armadas al correr
// y la búsqueda de una clave en toda la base. Nunca usa una API de verdad ni una clave de verdad.
import './ayuda.js';
import { existsSync, readFileSync } from 'node:fs';
import { configDePrueba } from './ayuda.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearPrimerAdmin, crearUsuario } from '../src/cuentas/usuarios.js';
import { espacioPropio } from '../src/cuentas/planes.js';
import { guardarSecreto, anotarPrueba } from '../src/claves/almacen.js';
import { guardarConfigIa, leerConfigIa, CLAVE_AJUSTE_IA } from '../src/ia/config.js';
import { anotarConfianza } from '../src/cuentas/confianza.js';

export const T0 = Date.parse('2026-11-10T15:00:00Z');

export const claveAnthropic = (letra = 'x') => ['sk', 'ant', 'api03', `prueba${letra.repeat(32)}`].join('-');
export const claveOpenai = (letra = 'z') => ['sk', 'proj', `prueba${letra.repeat(32)}`].join('-');

// Ronda 5 de revisión: el permiso de IA del dueño para una cuenta común (como si lo diera desde su cuenta de Tailscale).
// Va DESPUÉS de cualquier cambio de la cuenta (plan, contraseña): un cambio sin anotar le quita el permiso.
export function permitirIa(db, usuarioId, hechoPor = null) {
  return anotarConfianza(db, { usuarioId, accion: 'permitida', desdeTailnet: true, hechoPor });
}

// Una base con el administrador (su espacio), otra cuenta (plan prueba, con el permiso de IA del dueño si permitirOtro),
// una clave de Claude guardada y probada, y la IA encendida con un tope (si se pide). iaBases: adónde va el proveedor falso.
export function preparar({ encendida = true, tope = 2_000_000, ayuda = true, planes = {}, probar = true, guardar = true, iaBases = {}, ahora = T0, permitirOtro = true } = {}) {
  const config = { ...configDePrueba(), iaBases };
  const db = abrirBase(config);
  const admin = crearPrimerAdmin(db, { nombre: 'junior', claveHash: 'x' });
  const otro = crearUsuario(db, { nombre: 'maria', claveHash: 'x', creadoPor: admin });
  if (permitirOtro) permitirIa(db, otro, admin);
  const espacioAdmin = espacioPropio(db, admin).id;
  const espacioOtro = espacioPropio(db, otro).id;
  let secretoId = null;
  if (guardar) {
    secretoId = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin, ahora }).secreto.id;
    if (probar) anotarPrueba(db, { id: secretoId, motivo: 'ok', ahora });
  }
  if (tope || Object.keys(planes).length) guardarConfigIa(db, { topeGeneralMicro: tope, topesPlanMicro: planes }, { config, usuarioId: admin, ahora });
  if (encendida) guardarConfigIa(db, { encendida: true, ayudaProyectos: ayuda }, { config, usuarioId: admin, ahora });
  return { config, db, admin, otro, espacioAdmin, espacioOtro, secretoId };
}

// Escribe la configuración de IA directamente (sin las revisiones de guardarConfigIa): para armar casos raros.
export function ponerConfig(db, cambios) {
  const cfg = { ...leerConfigIa(db), ...cambios };
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`).run(CLAVE_AJUSTE_IA, JSON.stringify(cfg), new Date(T0).toISOString());
  return leerConfigIa(db);
}

export function veces(db, motivo) {
  return db.prepare('SELECT COALESCE(SUM(veces), 0) AS n FROM ia_bloqueos WHERE motivo = ?').get(motivo).n;
}

// Busca un texto (y sus formas en base64, base64url y hex) en cada columna de cada tabla y en los archivos de la base.
export function buscarEnTodo(db, config, valor) {
  const formas = [valor, Buffer.from(valor).toString('base64'), Buffer.from(valor).toString('base64url'), Buffer.from(valor).toString('hex')];
  const hallazgos = [];
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    for (const fila of db.prepare(`SELECT * FROM "${name}"`).all()) {
      for (const [columna, v] of Object.entries(fila)) {
        if (v == null) continue;
        const texto = v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : String(v);
        if (formas.some(f => texto.includes(f))) hallazgos.push(`${name}.${columna}`);
      }
    }
  }
  for (const archivo of [config.archivoBase, `${config.archivoBase}-wal`]) {
    if (!existsSync(archivo)) continue;
    const bytes = readFileSync(archivo);
    if (formas.some(f => bytes.includes(Buffer.from(f)))) hallazgos.push(archivo.endsWith('-wal') ? 'oportia.db-wal' : 'oportia.db');
  }
  return hallazgos;
}

// Captura todo lo que se escribe en la consola mientras corre fn.
export async function capturarConsola(fn) {
  const escrito = [];
  const originales = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  for (const nombre of Object.keys(originales)) console[nombre] = (...partes) => { escrito.push(partes.map(String).join(' ')); };
  try {
    await fn();
  } finally {
    Object.assign(console, originales);
  }
  return escrito.join('\n');
}
