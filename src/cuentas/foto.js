// 0.14.24 (pedido del dueño): la FOTO de perfil de cada persona, elegida de la galería del teléfono (o de la cámara), además
// de los avatares de aviación (src/cuentas/perfil.js). La pantalla la recorta cuadrada, la achica a 256 × 256 y la guarda
// como JPEG (sin los datos de la cámara: el lienzo no los copia). Aquí:
//  - Se revisa por DENTRO (los primeros bytes, nunca el nombre ni el tipo que dice el navegador): solo JPEG, PNG o WEBP,
//    hasta 200 KB y de 16 a 512 px por lado. Una que no sirve nunca llega al disco.
//  - Vive en la carpeta privada de datos (OPORTIA_DATOS/fotos/<id>.foto), nunca en el repositorio ni en public/. Un archivo
//    por persona: la foto nueva REEMPLAZA a la suya de antes (se escribe aparte y se cambia de nombre encima: nunca queda a
//    medias). Nunca se borra un archivo (test/reglas.test.js): «Quitar foto» solo quita la referencia.
//  - La referencia va en «ajustes» (cuenta.foto.<id>: { token, tipo, bytes, ancho, alto, en }): sin cambio de base. El
//    token es al azar y cambia con cada foto: es lo único que viaja a las pantallas (nunca el id de la cuenta: la carrera
//    lo promete) y sirve también para que el navegador sepa que es otra foto.
//  - Quién la ve (GET /api/fotos/<token>, se revisa en CADA pedido, así un token visto antes no sirve después):
//    la persona y el administrador, siempre; los demás alumnos solo si la persona NO puso «Perfil privado» y hay dónde
//    verla (el Grupo encendido o «Mostrar nombres en la carrera» encendido). Si no, 404 (la pantalla dibuja el avatar).
//  - El administrador puede quitar la foto de alguien (moderación): queda en la auditoría y la persona ve un aviso.
import { mkdirSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ErrorHttp } from '../nucleo/http.js';
import { auditar, avisarCuenta } from './usuarios.js';

export const FOTO_MAX_BYTES = 200 * 1024;
export const FOTO_LADO_MAX = 512;
export const FOTO_LADO_MIN = 16;
const TOKEN = /^[a-f0-9]{32}$/;
const clave = id => `cuenta.foto.${Number(id)}`;
export const carpetaFotos = config => join(config.carpetaDatos ?? dirname(config.archivoBase), 'fotos');
const archivoDe = (config, id) => join(carpetaFotos(config), `${Number(id)}.foto`);

function guardar(db, id, valor) {
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave(id), JSON.stringify(valor), new Date().toISOString());
}
function leer(db, id) {
  try {
    const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave(id))?.valor ?? 'null');
    return v && TOKEN.test(v.token ?? '') ? v : null;
  } catch { return null; }
}

// El token de la foto de una persona (o null).
export const fotoDe = (db, id) => leer(db, id)?.token ?? null;

// Las fotos de todas las cuentas de una vez (para listas): id → token.
export function fotosDe(db) {
  const m = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'cuenta.foto.%'").all()) {
    const id = Number(f.clave.slice('cuenta.foto.'.length));
    try {
      const v = JSON.parse(f.valor);
      if (Number.isSafeInteger(id) && TOKEN.test(v?.token ?? '')) m.set(id, v.token);
    } catch { /* un valor raro no rompe la lista */ }
  }
  return m;
}

// ¿Qué imagen es (por sus bytes) y de qué tamaño? → { tipo, ancho, alto } o null.
export function medirImagen(b) {
  if (!Buffer.isBuffer(b) || b.length < 24) return null;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (b.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { tipo: 'image/png', ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xd9 || m === 0xda) return null; // terminó (o empiezan los datos) sin decir su tamaño
      const largo = b.readUInt16BE(i + 2);
      if (largo < 2) return null;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { tipo: 'image/jpeg', alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
      i += 2 + largo;
    }
    return null;
  }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' && b.length >= 30) {
    const trozo = b.toString('latin1', 12, 16);
    if (trozo === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { tipo: 'image/webp', ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
    if (trozo === 'VP8L' && b[20] === 0x2f) return { tipo: 'image/webp', ancho: 1 + (b[21] | ((b[22] & 0x3f) << 8)), alto: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
    if (trozo === 'VP8X') return { tipo: 'image/webp', ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3) };
    return null;
  }
  return null;
}

const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Revisa una foto ya leída (en memoria). → { tipo, ancho, alto } o lanza 400/413/415.
export function revisarFoto(contenido, tipoDicho) {
  if (!TIPOS.has(tipoDicho)) throw new ErrorHttp(415, 'imagen_no_valida');
  if (!contenido?.length) throw new ErrorHttp(400, 'imagen_no_valida');
  if (contenido.length > FOTO_MAX_BYTES) throw new ErrorHttp(413, 'demasiado_grande');
  const m = medirImagen(contenido);
  if (!m) throw new ErrorHttp(400, 'imagen_no_valida');
  if (m.ancho < FOTO_LADO_MIN || m.alto < FOTO_LADO_MIN || m.ancho > FOTO_LADO_MAX || m.alto > FOTO_LADO_MAX) throw new ErrorHttp(400, 'foto_tamano');
  return m;
}

// Sube (o reemplaza) la foto de una persona: el cuerpo del pedido es la imagen tal cual. → el token nuevo.
export async function subirFoto(db, config, { usuarioId, req }) {
  const tipoDicho = String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
  if (!TIPOS.has(tipoDicho)) throw new ErrorHttp(415, 'imagen_no_valida');
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > FOTO_MAX_BYTES) throw new ErrorHttp(413, 'demasiado_grande');
  const partes = [];
  let bytes = 0;
  try {
    for await (const trozo of req) {
      bytes += trozo.length;
      if (bytes > FOTO_MAX_BYTES) throw new ErrorHttp(413, 'demasiado_grande');
      partes.push(trozo);
    }
  } catch (error) {
    if (error instanceof ErrorHttp) throw error;
    throw new ErrorHttp(400, 'imagen_no_valida');
  }
  const contenido = Buffer.concat(partes);
  const m = revisarFoto(contenido, tipoDicho);
  const id = Number(usuarioId);
  const carpeta = carpetaFotos(config);
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  // Aparte y después encima de la suya de antes: nunca queda una foto a medias.
  const aparte = join(carpeta, `${id}.nueva-${randomBytes(6).toString('hex')}`);
  writeFileSync(aparte, contenido, { flag: 'wx', mode: 0o600 });
  renameSync(aparte, archivoDe(config, id));
  const token = randomBytes(16).toString('hex');
  guardar(db, id, { token, tipo: m.tipo, bytes: contenido.length, ancho: m.ancho, alto: m.alto, en: new Date().toISOString() });
  auditar(db, { usuarioId: id, accion: 'foto_perfil_cambiada', detalle: `${m.tipo} ${m.ancho}x${m.alto} ${contenido.length} B` });
  return token;
}

// «Quitar foto»: vuelve al avatar. hechoPor: el administrador que la quitó (moderación): auditoría y aviso a la persona.
// El archivo se queda (nunca se borra nada); sin referencia, nadie lo puede ver.
export function quitarFoto(db, usuarioId, { hechoPor = null } = {}) {
  const id = Number(usuarioId);
  const antes = leer(db, id);
  if (!antes) return false;
  const porOtro = hechoPor != null && hechoPor !== id;
  guardar(db, id, { token: null, quitadaEn: new Date().toISOString(), ...(porOtro ? { quitadaPor: hechoPor } : {}) });
  auditar(db, { usuarioId: porOtro ? hechoPor : id, accion: 'foto_perfil_quitada', detalle: porOtro ? `cuenta ${id} (por el administrador)` : null });
  if (porOtro) avisarCuenta(db, id, 'foto_quitada');
  return true;
}

const json = t => { try { return JSON.parse(t); } catch { return null; } };
const valorAjuste = (db, c) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(c)?.valor ?? null;

// La foto de un token, para quien la pide (usuario: { id, rol }). → { ruta, tipo, bytes, token } o 404.
export function fotoParaVer(db, config, token, usuario) {
  if (!TOKEN.test(String(token ?? ''))) throw new ErrorHttp(404, 'no_existe');
  const fila = db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'cuenta.foto.%' AND valor LIKE ?").get(`%"token":"${token}"%`);
  const v = fila ? json(fila.valor) : null;
  const duenoId = fila ? Number(fila.clave.slice('cuenta.foto.'.length)) : NaN;
  if (!v || v.token !== token || !Number.isSafeInteger(duenoId)) throw new ErrorHttp(404, 'no_existe');
  if (usuario.id !== duenoId && usuario.rol !== 'admin') {
    const dueno = db.prepare('SELECT activo, eliminado_en FROM usuarios WHERE id = ?').get(duenoId);
    if (!dueno || dueno.activo !== 1 || dueno.eliminado_en != null) throw new ErrorHttp(404, 'no_existe');
    // «Perfil privado» (el mismo de «ocultarme» del Grupo): los demás nunca ven su foto.
    if (valorAjuste(db, `academia.grupo_oculto.${duenoId}`) === '1') throw new ErrorHttp(404, 'no_existe');
    // Sin Grupo y sin nombres en la carrera, no hay dónde ver la foto de otro.
    const grupo = valorAjuste(db, 'academia.grupo') !== '0';
    const nombresCarrera = valorAjuste(db, 'academia.carrera_nombres') !== '0';
    if (!grupo && !nombresCarrera) throw new ErrorHttp(404, 'no_existe');
  }
  const ruta = archivoDe(config, duenoId);
  if (!existsSync(ruta)) throw new ErrorHttp(404, 'no_existe');
  return { ruta, tipo: TIPOS.has(v.tipo) ? v.tipo : 'image/jpeg', bytes: statSync(ruta).size, token };
}
