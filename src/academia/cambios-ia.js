// 0.14.2: «Lo que hizo la IA» (Administrador → Contenido): el registro de cambios, del más nuevo al más viejo. Solo
// agrega (una fila de «ajustes» con las últimas 500 entradas; nada de lo publicado se borra nunca). Cada entrada:
//   { id, en, materia, tema?, que, estado?, version?, antes?, despues?, costoMicro, proveedor, modelo, revisadoPor, detalle? }
// que: 'materia_publicada' | 'materia_en_revision' | 'clase_reescrita' | 'correccion' | 'pedido_hecho' | 'revision_errores'
//      | 'dibujo' | 'publicada_por_ti'.
// Lo escriben la fábrica (armar), la pista oral, la mejora profunda, la mejora continua, los trabajos del chat y las
// publicaciones que hace el dueño. Lo lee la pantalla (solo lee). Nunca guarda una clave ni un dato de un alumno.
import { createHash } from 'node:crypto';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { GASTO_SQL } from '../ia/gasto.js';

export const AJUSTE_CAMBIOS = 'ia.cambios';
export const MAX_CAMBIOS = 500;
export const QUE_CAMBIO = Object.freeze(['materia_publicada', 'materia_en_revision', 'clase_reescrita', 'correccion', 'pedido_hecho', 'revision_errores', 'dibujo', 'publicada_por_ti']);
const iso = ms => new Date(ms).toISOString();

export function leerCambios(db) {
  try { const v = JSON.parse(leerAjuste(db, AJUSTE_CAMBIOS) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

// Lo que costó, quién escribió y si Claude revisó, de las llamadas cuyo «paso» empieza con prefijo (f:materia:, p:…).
export function costoDe(db, prefijo) {
  const filas = db.prepare(`SELECT proveedor, modelo, proposito, COUNT(*) AS n, ${GASTO_SQL} AS g FROM ia_llamadas WHERE paso LIKE ? GROUP BY proveedor, modelo, proposito`).all(`${prefijo}%`);
  const costoMicro = filas.reduce((s, f) => s + (f.g ?? 0), 0);
  const escribe = filas.filter(f => /escribir|admin|generar/.test(f.proposito)).sort((a, b) => b.n - a.n)[0] ?? null;
  const revisa = filas.filter(f => /verificar|revisar/.test(f.proposito)).sort((a, b) => b.n - a.n)[0] ?? null;
  return { costoMicro, proveedor: escribe?.proveedor ?? revisa?.proveedor ?? null, modelo: escribe?.modelo ?? revisa?.modelo ?? null, revisadoPor: revisa?.proveedor ?? null };
}

const textoCorto = (v, n = 400) => (v == null ? null : String(v).slice(0, n));
function limpio(v, n = 6) {
  if (v == null || typeof v !== 'object') return v == null ? null : textoCorto(v);
  return Object.fromEntries(Object.entries(v).slice(0, n).map(([k, x]) => [String(k).slice(0, 30), typeof x === 'number' ? x : textoCorto(x, 300)]));
}

export function anotarCambio(db, { materia = null, tema = null, que, estado = null, version = null, antes = null, despues = null, costoMicro = null, proveedor = null, modelo = null, revisadoPor = null, detalle = null, ahora = Date.now() }) {
  if (!QUE_CAMBIO.includes(que)) throw new Error(`cambio desconocido: ${que}`);
  const lista = leerCambios(db);
  const entrada = {
    id: createHash('sha256').update(`${iso(ahora)}|${materia}|${tema}|${que}|${lista.length}`).digest('hex').slice(0, 12),
    en: iso(ahora), materia: textoCorto(materia, 60), tema: textoCorto(tema, 80), que, estado: textoCorto(estado, 30), version: Number.isSafeInteger(version) ? version : null,
    antes: limpio(antes), despues: limpio(despues), costoMicro: Number.isSafeInteger(costoMicro) ? costoMicro : null,
    proveedor: textoCorto(proveedor, 20), modelo: textoCorto(modelo, 80), revisadoPor: textoCorto(revisadoPor, 20), detalle: textoCorto(detalle, 600),
  };
  lista.push(entrada);
  guardarAjuste(db, AJUSTE_CAMBIOS, JSON.stringify(lista.slice(-MAX_CAMBIOS)));
  return entrada;
}
