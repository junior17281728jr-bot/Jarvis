// Academia: los paquetes de contenido en el disco del servidor (OPORTIA_DATOS/academia/paquetes/<id>-<huella>/).
//  - Cada paquete subido es una versión nueva en su propia carpeta: nunca se pisa ni se borra una. Subir otra vez el
//    MISMO JSON (misma huella) sigue la misma versión (por ejemplo, para terminar de subir las figuras que faltaban).
//  - Primero el JSON (se lee en memoria con su tope y se revisa ANTES de escribir nada), después cada figura por
//    separado, en su propio pedido, que se escribe por partes (sin cargarla entera en memoria) en «<archivo>.part» y
//    solo al final, revisada (tipo de imagen y huella), se renombra a su nombre: una figura terminada nunca cambia.
//  - Una versión «lista» (con todas sus figuras) se puede poner en uso; hay una sola en uso (ajustes:
//    'academia.paquete_activo') y las demás quedan guardadas.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion, revisarModoPrueba } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { revisarPaquete, indexarPaquete, LIMITES, ARCHIVO_FIGURA } from './formato.js';

const ahora = () => new Date().toISOString();
export const AJUSTE_ACTIVO = 'academia.paquete_activo';
export const ESTADOS_PAQUETE = Object.freeze(['incompleto', 'listo', 'fallido']);

export function carpetaAcademia(config) {
  const carpeta = config?.carpetaAcademia ?? join(dirname(config.archivoBase), 'academia');
  revisarModoPrueba(carpeta);
  return carpeta;
}
const carpetaDe = (config, fila) => join(carpetaAcademia(config), 'paquetes', fila.carpeta);

export function leerAjuste(db, clave) {
  return db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
}
export function guardarAjuste(db, clave, valor) {
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, String(valor), ahora());
}

// El cuerpo de un pedido en memoria, con tope (para el JSON del paquete).
export function leerCuerpo(req, limite) {
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > limite) return Promise.reject(new ErrorHttp(413, 'demasiado_grande'));
  return new Promise((ok, mal) => {
    let tamano = 0;
    const partes = [];
    req.on('data', parte => {
      tamano += parte.length;
      if (tamano > limite) { mal(new ErrorHttp(413, 'demasiado_grande')); req.destroy(); return; }
      partes.push(parte);
    });
    req.on('end', () => { if (tamano <= limite) ok(Buffer.concat(partes)); });
    req.on('error', () => mal(new ErrorHttp(400, 'datos_no_validos')));
  });
}

const vista = fila => fila && ({
  id: fila.id, nombre: fila.nombre, edicion: fila.edicion, estado: fila.estado, muestra: fila.muestra === 1, bytes: fila.bytes,
  materias: fila.materias, temas: fila.temas, preguntas: fila.preguntas, figuras: fila.figuras,
  subidoEn: fila.subido_en, listoEn: fila.listo_en, activadoEn: fila.activado_en,
});

function leerJsonDe(config, fila) {
  return JSON.parse(readFileSync(join(carpetaDe(config, fila), 'paquete.json'), 'utf8'));
}

// Las figuras que el paquete nombra y todavía no están (terminadas) en su carpeta.
export function figurasQueFaltan(config, fila, datos = leerJsonDe(config, fila)) {
  const carpeta = join(carpetaDe(config, fila), 'figuras');
  return (datos.figuras ?? []).filter(f => !existsSync(join(carpeta, f.archivo))).map(f => f.archivo);
}

export function listarPaquetes(db, config) {
  const activo = Number(leerAjuste(db, AJUSTE_ACTIVO)) || null;
  const filas = db.prepare('SELECT * FROM academia_paquetes ORDER BY id DESC LIMIT 50').all();
  return filas.map(f => {
    let faltan = [];
    if (f.estado === 'incompleto') { try { faltan = figurasQueFaltan(config, f); } catch { faltan = []; } }
    return { ...vista(f), activo: f.id === activo, faltan };
  });
}

// Sube el JSON. { codigo, datos }: 422 con la lista de errores si no está bien armado (no se escribe nada).
export function subirJson(db, config, { cuerpo, usuarioId }) {
  let datos;
  try {
    const textoJson = cuerpo.toString('utf8');
    datos = JSON.parse(textoJson.charCodeAt(0) === 0xfeff ? textoJson.slice(1) : textoJson);
  } catch {
    return { codigo: 422, datos: { error: 'json_no_valido', errores: [{ ruta: '', motivo: 'json_no_valido' }] } };
  }
  const revision = revisarPaquete(datos);
  if (!revision.ok) return { codigo: 422, datos: { error: 'paquete_no_valido', errores: revision.errores } };
  const huella = createHash('sha256').update(cuerpo).digest('hex');
  const ya = db.prepare("SELECT * FROM academia_paquetes WHERE huella = ? AND estado <> 'fallido' ORDER BY id DESC LIMIT 1").get(huella);
  if (ya) return { codigo: 200, datos: { paquete: vista(ya), repetido: true, faltan: ya.estado === 'listo' ? [] : figurasQueFaltan(config, ya) } };
  const r = revision.resumen;
  const fila = enTransaccion(db, () => {
    const n = db.prepare(`INSERT INTO academia_paquetes (huella, nombre, edicion, carpeta, estado, muestra, bytes, materias, temas, preguntas, figuras, subido_por, subido_en)
      VALUES (?, ?, ?, '', 'incompleto', ?, ?, ?, ?, ?, ?, ?, ?)`).run(huella, r.nombre.slice(0, 200), r.edicion?.slice(0, 200) ?? null, r.muestra ? 1 : 0, cuerpo.length,
      r.materias, r.temas, r.preguntas, r.figuras, usuarioId, ahora());
    const id = Number(n.lastInsertRowid);
    db.prepare('UPDATE academia_paquetes SET carpeta = ? WHERE id = ?').run(`${id}-${huella.slice(0, 12)}`, id);
    auditar(db, { usuarioId, accion: 'academia_paquete_subido', detalle: `${id} (${huella.slice(0, 12)})` });
    return db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(id);
  });
  try {
    const carpeta = carpetaDe(config, fila);
    mkdirSync(dirname(carpeta), { recursive: true });
    mkdirSync(carpeta); // nueva: si ya existiera, falla (nunca se escribe en la carpeta de otra versión)
    mkdirSync(join(carpeta, 'figuras'));
    writeFileSync(join(carpeta, 'paquete.json'), cuerpo, { flag: 'wx', mode: 0o640 });
  } catch {
    db.prepare("UPDATE academia_paquetes SET estado = 'fallido', detalle = 'no_se_pudo_guardar' WHERE id = ?").run(fila.id);
    throw new ErrorHttp(507, 'no_se_pudo_guardar');
  }
  const faltan = revision.figuras.map(f => f.archivo);
  if (!faltan.length) db.prepare("UPDATE academia_paquetes SET estado = 'listo', listo_en = ? WHERE id = ?").run(ahora(), fila.id);
  return { codigo: 201, datos: { paquete: vista(db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id)), repetido: false, faltan } };
}

const TIPOS_IMAGEN = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
export const tipoDeFigura = archivo => TIPOS_IMAGEN[String(archivo).split('.').pop().toLowerCase()] ?? null;
function esImagenDeTipo(cabeza, tipo) {
  if (tipo === 'image/png') return cabeza.length >= 8 && cabeza.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (tipo === 'image/jpeg') return cabeza.length >= 3 && cabeza[0] === 0xff && cabeza[1] === 0xd8 && cabeza[2] === 0xff;
  if (tipo === 'image/webp') return cabeza.length >= 12 && cabeza.toString('latin1', 0, 4) === 'RIFF' && cabeza.toString('latin1', 8, 12) === 'WEBP';
  return false;
}
function primerosBytes(ruta, n = 16) {
  const fd = openSync(ruta, 'r');
  try { const b = Buffer.alloc(n); const leidos = readSync(fd, b, 0, n, 0); return b.subarray(0, leidos); } finally { closeSync(fd); }
}

const subiendo = new Set();

// Sube UNA figura del paquete (cuerpo = la imagen tal cual). Solo las que el paquete nombra y faltan.
export async function subirFigura(db, config, { paqueteId, archivo, req, usuarioId }) {
  const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(Number(paqueteId));
  if (!fila || fila.estado === 'fallido') throw new ErrorHttp(404, 'no_existe');
  if (typeof archivo !== 'string' || !ARCHIVO_FIGURA.test(archivo)) throw new ErrorHttp(400, 'archivo_no_valido');
  const declarada = (leerJsonDe(config, fila).figuras ?? []).find(f => f.archivo === archivo);
  if (!declarada) throw new ErrorHttp(400, 'figura_no_esta_en_el_paquete');
  const carpeta = join(carpetaDe(config, fila), 'figuras');
  const destino = join(carpeta, archivo);
  if (existsSync(destino)) return { ya: true, faltan: figurasQueFaltan(config, fila), paquete: vista(fila) };
  const tipo = tipoDeFigura(archivo);
  const tipoPedido = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (tipoPedido !== tipo && tipoPedido !== 'application/octet-stream') throw new ErrorHttp(415, 'formato_no_valido');
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > LIMITES.figuraBytes) throw new ErrorHttp(413, 'demasiado_grande');
  const llave = `${fila.id}/${archivo}`;
  if (subiendo.has(llave)) throw new ErrorHttp(409, 'ya_hay_otra_en_marcha');
  subiendo.add(llave);
  try {
    const parcial = `${destino}.part`;
    const hash = createHash('sha256');
    let bytes = 0;
    await pipeline(req, async function* contar(fuente) {
      for await (const parte of fuente) {
        bytes += parte.length;
        if (bytes > LIMITES.figuraBytes) throw new ErrorHttp(413, 'demasiado_grande');
        hash.update(parte);
        yield parte;
      }
    }, createWriteStream(parcial, { flags: 'w', mode: 0o640 }));
    if (!bytes || !esImagenDeTipo(primerosBytes(parcial), tipo)) throw new ErrorHttp(422, 'imagen_no_valida');
    if (declarada.sha256 && hash.digest('hex') !== declarada.sha256) throw new ErrorHttp(422, 'figura_distinta');
    if (existsSync(destino)) throw new ErrorHttp(409, 'ya_hay_otra_en_marcha');
    renameSync(parcial, destino);
  } finally {
    subiendo.delete(llave);
  }
  const faltan = figurasQueFaltan(config, fila);
  if (!faltan.length && fila.estado !== 'listo') {
    db.prepare("UPDATE academia_paquetes SET estado = 'listo', listo_en = ? WHERE id = ?").run(ahora(), fila.id);
    auditar(db, { usuarioId, accion: 'academia_paquete_listo', detalle: String(fila.id) });
  }
  return { ya: false, faltan, paquete: vista(db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id)) };
}

export function activarPaquete(db, { paqueteId, usuarioId }) {
  return enTransaccion(db, () => {
    const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(Number(paqueteId));
    if (!fila) throw new ErrorHttp(404, 'no_existe');
    if (fila.estado !== 'listo') throw new ErrorHttp(409, 'paquete_incompleto');
    guardarAjuste(db, AJUSTE_ACTIVO, fila.id);
    db.prepare('UPDATE academia_paquetes SET activado_en = ? WHERE id = ?').run(ahora(), fila.id);
    auditar(db, { usuarioId, accion: 'academia_paquete_activado', detalle: String(fila.id) });
    return vista(db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id));
  });
}

// El paquete en uso, ya indexado (o null). Los archivos de una versión nunca cambian: se lee una sola vez.
const enMemoria = new Map();
export function paqueteActivo(db, config) {
  const id = Number(leerAjuste(db, AJUSTE_ACTIVO)) || null;
  if (!id) return null;
  const fila = db.prepare("SELECT * FROM academia_paquetes WHERE id = ? AND estado = 'listo'").get(id);
  if (!fila) return null;
  const carpeta = carpetaDe(config, fila);
  const clave = `${carpeta}|${fila.huella}`;
  if (!enMemoria.has(clave)) {
    let indice;
    try { indice = indexarPaquete(leerJsonDe(config, fila)); } catch { return null; }
    if (enMemoria.size >= 3) enMemoria.clear();
    enMemoria.set(clave, { id: fila.id, carpeta, ...indice });
  }
  return enMemoria.get(clave);
}

// La ruta de una figura del paquete en uso (o null).
export function rutaFigura(paquete, numero) {
  const f = paquete?.figuras.get(String(numero));
  if (!f) return null;
  const ruta = join(paquete.carpeta, 'figuras', f.archivo);
  try { return statSync(ruta).isFile() ? { ruta, tipo: tipoDeFigura(f.archivo), bytes: statSync(ruta).size } : null; } catch { return null; }
}
