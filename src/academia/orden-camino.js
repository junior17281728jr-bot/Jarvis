// Academia 0.14.81 (pedido del dueño: «obvio que inicia en Factores Humanos, pero que pueda saltarme e irme al tema que
// quiero; pero lo recomendable siempre ir paso a paso desde Factores Humanos»): el «Orden del camino», un ajuste del curso
// para todos (Contenido → Ajustes; solo el administrador lo cambia). Sin cambio de base: va en «ajustes».
//  - 'libre' (lo de siempre desde la 0.14.81): todos los temas con clases se abren (clase, práctica y examen del tema).
//    El orden RECOMENDADO es el oficial (las 11 materias desde Factores Humanos, y sus temas en orden): «Continuar»,
//    «Ahora en» y el tema resaltado del Camino van siempre al primer tema sin aprobar en ese orden. Lo que está más
//    adelante se ve «adelantado» (sin candado) y, al abrirlo, un aviso corto (se esconde por alumno y por tema).
//  - 'estricto' (lo de antes): un tema se abre al aprobar el anterior; el resto, con candado (403 tema_bloqueado).
// Nunca borra ni cambia lo hecho: cambiar el ajuste solo cambia qué se puede abrir desde ahora.
import { ErrorHttp } from '../nucleo/http.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';

export const ORDENES_CAMINO = Object.freeze(['libre', 'estricto']);
export const ORDEN_CAMINO_POR_DEFECTO = 'libre';
const CLAVE = 'academia.orden_camino';

export const ordenCamino = db => (leerAjuste(db, CLAVE) === 'estricto' ? 'estricto' : ORDEN_CAMINO_POR_DEFECTO);
export const caminoLibre = db => ordenCamino(db) === 'libre';
export function guardarOrdenCamino(db, orden) {
  if (!ORDENES_CAMINO.includes(orden)) throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, CLAVE, orden);
  return ordenCamino(db);
}

// El aviso «Te recomendamos ir en orden…» (con «Seguir aquí», «Ir a lo recomendado» y «Ya sé lo anterior: tomar el
// examen»). «Seguir aquí» o «Ir a lo recomendado» lo esconden en ESE tema (se recuerda por alumno y por tema), pero
// «Continuar» sigue yendo a lo recomendado. Tomar el examen no lo esconde: si lo aprueba, la materia queda convalidada
// (src/academia/saltos.js) y lo recomendado pasa adelante solo; si no, todo sigue abierto y la recomendación queda.
const claveAviso = usuarioId => `academia.aviso_orden.${Number(usuarioId)}`;
const ID = /^[a-z0-9_-]{1,80}$/;
const MAX_AVISOS = 3000;
export function avisosOrdenVistos(db, usuarioId) {
  try { const l = JSON.parse(leerAjuste(db, claveAviso(usuarioId)) ?? '[]'); return new Set(Array.isArray(l) ? l.filter(x => typeof x === 'string') : []); } catch { return new Set(); }
}
export const avisoOrdenVisto = (db, usuarioId, materia, tema) => avisosOrdenVistos(db, usuarioId).has(`${materia}/${tema}`);
// paquete: el contenido en uso (solo se guardan temas que existen).
export function marcarAvisoOrden(db, usuarioId, paquete, materia, tema) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  if (typeof materia !== 'string' || typeof tema !== 'string' || !ID.test(materia) || !ID.test(tema)) throw new ErrorHttp(400, 'datos_no_validos');
  if (!paquete.materias.some(m => m.id === materia && m.temas.some(t => t.id === tema))) throw new ErrorHttp(404, 'no_existe');
  const vistos = avisosOrdenVistos(db, usuarioId);
  const clave = `${materia}/${tema}`;
  if (!vistos.has(clave)) guardarAjuste(db, claveAviso(usuarioId), JSON.stringify([...vistos, clave].slice(-MAX_AVISOS)));
  return { visto: true, materia, tema };
}
