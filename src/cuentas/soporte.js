// Academia 0.9.2: «Ayuda / Soporte»: la persona le escribe al administrador (categoría, mensaje y hasta 3 capturas) y
// conversan en un hilo. SIN cambio de base:
//  - cada mensaje de ayuda (ticket) es una fila de «ajustes» (soporte.ticket.<n>, JSON; soporte.siguiente da el número);
//  - las capturas van a la carpeta privada de datos (OPORTIA_DATOS/soporte/<n>/<k>.<ext>), revisadas por sus primeros
//    bytes (PNG, JPG o WEBP de verdad), de 5 MB o menos;
//  - cuando el administrador responde, la persona ve un aviso al entrar (avisos_cuenta 'soporte_respondido').
// Cada persona solo ve los suyos; el administrador, todos.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { avisarCuenta, auditar } from './usuarios.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { QUE_REPORTE, QUE_CONTENIDO, TEXTO_QUE, PORQUE } from '../academia/reporte-que.js';

// 0.14.26: 'error' = «Reportar un problema» (con su estado de reporte, notas del administrador y una captura en la base).
export const CATEGORIAS_SOPORTE = Object.freeze(['app', 'pregunta', 'cuenta', 'pagos', 'datos', 'otro', 'error']);
// 0.9.2: «Mis datos» (acceso, corrección o borrado): se responde en 10 días hábiles o menos (Ley 172-13).
export const PEDIDOS_DATOS = Object.freeze(['acceso', 'correccion', 'supresion', 'oposicion']);
export function diasHabiles(desdeMs, n) {
  let d = new Date(desdeMs - 4 * 3600 * 1000);
  let faltan = n;
  while (faltan > 0) {
    d = new Date(d.getTime() + 24 * 3600 * 1000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) faltan -= 1;
  }
  return d.toISOString().slice(0, 10);
}
export const ESTADOS_SOPORTE = Object.freeze(['nuevo', 'revision', 'resuelto']);
export const IMAGENES_MAXIMAS = 3;
export const IMAGEN_MAXIMA = 5 * 1024 * 1024;
export const TICKETS_POR_DIA = 10;
// 0.14.85: los reportes («⚑ Reportar un error») tienen su propio tope (no gastan el de Ayuda): por hora y por día.
export const REPORTES_POR_HORA = 6;
export const REPORTES_POR_DIA = 30;
const TEXTO_MAXIMO = 4000;
const MENSAJES_MAXIMOS = 200;
const MINUTOS_PARA_CAPTURAS = 30;

const leer = (db, clave) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
const escribir = (db, clave, valor) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, valor, new Date().toISOString());
const ahora = ms => new Date(ms ?? Date.now()).toISOString();
const json = texto => { try { return JSON.parse(texto ?? 'null'); } catch { return null; } };
export const carpetaSoporte = config => join(config.carpetaDatos ?? dirname(config.archivoBase), 'soporte');
const unaLinea = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const textoLargo = v => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, TEXTO_MAXIMO);

function ticketDe(db, id) {
  const n = Number(id);
  const t = Number.isSafeInteger(n) && n > 0 ? json(leer(db, `soporte.ticket.${n}`)) : null;
  return t && Number.isSafeInteger(t.usuarioId) ? t : null;
}
const guardar = (db, t) => escribir(db, `soporte.ticket.${t.id}`, JSON.stringify(t));
function todos(db) {
  return db.prepare("SELECT valor FROM ajustes WHERE clave LIKE 'soporte.ticket.%'").all().map(f => json(f.valor)).filter(t => t && Number.isSafeInteger(t.id));
}
// El de la persona (o «no existe» si es de otro).
function propio(db, usuarioId, id) {
  const t = ticketDe(db, id);
  if (!t || t.usuarioId !== Number(usuarioId)) throw new ErrorHttp(404, 'no_existe');
  return t;
}

// Lo que se muestra: sin rutas de archivos, con cuántas imágenes tiene cada mensaje.
export function vistaTicket(db, t, { conHilo = true } = {}) {
  const u = db.prepare('SELECT nombre, nombre_visible FROM usuarios WHERE id = ?').get(t.usuarioId);
  const ultimo = t.mensajes.at(-1);
  return {
    id: t.id, usuarioId: t.usuarioId, usuario: u?.nombre ?? null, nombreVisible: u?.nombre_visible || u?.nombre || null,
    categoria: t.categoria, pedido: t.pedido ?? null, vence: t.vence ?? null, estado: t.estado, creado: t.creado, actualizado: t.actualizado, contexto: t.contexto,
    resumen: t.mensajes[0]?.texto.slice(0, 140) ?? '', mensajes: conHilo ? t.mensajes.map((m, k) => ({ k, de: m.de, texto: m.texto, en: m.en, imagenes: (m.imagenes ?? []).map((_, i) => i) })) : undefined,
    respuestas: t.mensajes.filter(m => m.de === 'admin').length, ultimoDe: ultimo?.de ?? null,
    sinLeerAlumno: Boolean(ultimo && ultimo.de === 'admin' && (Number(t.vistosAlumno) || 0) < t.mensajes.length),
    pendiente: t.estado !== 'resuelto' && ultimo?.de === 'alumno',
    // 0.14.26: un reporte de problema: su estado y si trae captura (las notas del administrador NUNCA van aquí).
    // 0.14.85: y, si el administrador ya lo revisó, SOLO su veredicto («Sí, es un error» / «No…» / «Dudoso»): nunca quién
    // lo decidió, la opinión de la IA, ni lo que reportaron otros alumnos.
    reporte: t.reporte ? { estado: t.reporte.estado, captura: Boolean(t.reporte.captura), ...(t.reporte.veredicto?.valor ? { veredicto: t.reporte.veredicto.valor } : {}) } : null,
  };
}

// contexto: { pantalla, version, navegador, pregunta } (lo pone la app sola). La hora la pone el servidor.
export function crearTicket(db, usuarioId, { categoria, texto, contexto, pedido = null }, { ahoraMs = Date.now() } = {}) {
  if (categoria === 'datos' && !PEDIDOS_DATOS.includes(pedido)) throw new ErrorHttp(400, 'soporte_categoria');
  if (!CATEGORIAS_SOPORTE.includes(categoria)) throw new ErrorHttp(400, 'soporte_categoria');
  const limpio = textoLargo(texto);
  if (limpio.length < 3) throw new ErrorHttp(400, 'soporte_texto');
  const c = contexto && typeof contexto === 'object' ? contexto : {};
  return enTransaccion(db, () => {
    const desde = ahora(ahoraMs - 24 * 3600 * 1000);
    const esError = categoria === 'error';
    const hoy = todos(db).filter(t => t.usuarioId === Number(usuarioId) && t.creado >= desde && (t.categoria === 'error') === esError).length;
    if (hoy >= (esError ? REPORTES_POR_DIA : TICKETS_POR_DIA)) throw new ErrorHttp(429, 'soporte_muchos');
    const id = (Number(leer(db, 'soporte.siguiente')) || 0) + 1;
    escribir(db, 'soporte.siguiente', String(id));
    const en = ahora(ahoraMs);
    const t = {
      id, usuarioId: Number(usuarioId), categoria, estado: 'nuevo', creado: en, actualizado: en,
      contexto: { pantalla: unaLinea(String(c.pantalla ?? '').split(/[?&]/)[0], 120) || null, version: unaLinea(c.version, 20) || null, navegador: unaLinea(c.navegador, 300) || null, pregunta: unaLinea(c.pregunta, 60) || null,
        tamano: /^\d{2,5}x\d{2,5}$/.test(String(c.tamano ?? '')) ? c.tamano : null, idioma: ['es', 'en'].includes(c.idioma) ? c.idioma : null, hora: en,
        // 0.14.85: claro u oscuro, y los últimos errores de la página (hasta 5, solo su mensaje y dónde: nunca datos).
        ...(['claro', 'oscuro'].includes(c.tema) ? { tema: c.tema } : {}),
        ...(Array.isArray(c.errores) && c.errores.length ? { errores: c.errores.slice(-5).map(e => ({ mensaje: unaLinea(e?.mensaje, 200), donde: unaLinea(String(e?.donde ?? '').split(/[?#]/)[0], 160) || null, en: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(String(e?.en ?? '')) ? e.en : null })).filter(e => e.mensaje) } : {}) },
      mensajes: [{ de: 'alumno', autorId: Number(usuarioId), texto: limpio, en, imagenes: [] }],
      ...(categoria === 'datos' ? { pedido, vence: diasHabiles(ahoraMs, 10) } : {}),
      vistoAlumno: en, vistosAlumno: 1, vistoAdmin: null,
    };
    guardar(db, t);
    auditar(db, { usuarioId: Number(usuarioId), accion: 'soporte_nuevo', detalle: `${id} (${categoria})` });
    return vistaTicket(db, t);
  });
}

// Tipo de imagen por sus primeros bytes (nunca por lo que diga el pedido).
export function tipoImagen(cabeza) {
  if (cabeza.length >= 8 && cabeza.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', tipo: 'image/png' };
  if (cabeza.length >= 3 && cabeza[0] === 0xff && cabeza[1] === 0xd8 && cabeza[2] === 0xff) return { ext: 'jpg', tipo: 'image/jpeg' };
  if (cabeza.length >= 12 && cabeza.toString('latin1', 0, 4) === 'RIFF' && cabeza.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', tipo: 'image/webp' };
  return null;
}

// Una captura del primer mensaje (hasta 3, en los primeros 30 minutos). El cuerpo es la imagen tal cual, por partes.
export async function subirImagen(db, config, usuarioId, id, req, { ahoraMs = Date.now() } = {}) {
  const t = propio(db, usuarioId, id);
  const primero = t.mensajes[0];
  if ((primero.imagenes ?? []).length >= IMAGENES_MAXIMAS) throw new ErrorHttp(409, 'soporte_imagenes');
  if (ahoraMs - Date.parse(t.creado) > MINUTOS_PARA_CAPTURAS * 60 * 1000) throw new ErrorHttp(409, 'soporte_imagenes');
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > IMAGEN_MAXIMA) throw new ErrorHttp(413, 'demasiado_grande');
  // Se lee entera en memoria (5 MB como mucho) y solo se escribe si es una imagen de verdad: nunca queda basura.
  const partes = [];
  let bytes = 0;
  await new Promise((ok, mal) => {
    let fallo = false;
    req.on('data', parte => {
      if (fallo) return;
      bytes += parte.length;
      if (bytes > IMAGEN_MAXIMA) { fallo = true; req.destroy(); return mal(new ErrorHttp(413, 'demasiado_grande')); }
      partes.push(parte);
    });
    req.on('end', () => { if (!fallo) ok(); });
    req.on('error', e => { if (!fallo) { fallo = true; mal(e); } });
  });
  const datos = Buffer.concat(partes);
  const tipo = tipoImagen(datos.subarray(0, 16));
  if (!tipo || datos.length < 16) throw new ErrorHttp(415, 'soporte_imagen_tipo');
  const carpeta = join(carpetaSoporte(config), String(t.id));
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  return enTransaccion(db, () => {
    const actual = propio(db, usuarioId, id);
    const lista = actual.mensajes[0].imagenes ?? [];
    const archivo = `${lista.length}.${tipo.ext}`;
    if (lista.length >= IMAGENES_MAXIMAS || existsSync(join(carpeta, archivo))) throw new ErrorHttp(409, 'soporte_imagenes');
    writeFileSync(join(carpeta, archivo), datos, { flag: 'wx', mode: 0o600 });
    lista.push({ archivo, tipo: tipo.tipo, bytes: datos.length, sha256: createHash('sha256').update(datos).digest('hex') });
    actual.mensajes[0].imagenes = lista;
    guardar(db, actual);
    return { imagenes: lista.length };
  });
}

export function imagenDe(db, config, id, mensaje, indice, { usuarioId = null } = {}) {
  const t = usuarioId == null ? ticketDe(db, id) : propio(db, usuarioId, id);
  if (!t) throw new ErrorHttp(404, 'no_existe');
  const img = t.mensajes[Number(mensaje)]?.imagenes?.[Number(indice)];
  if (!img || !/^[0-9]\.(png|jpg|webp)$/.test(img.archivo)) throw new ErrorHttp(404, 'no_existe');
  const ruta = join(carpetaSoporte(config), String(t.id), img.archivo);
  if (!existsSync(ruta)) throw new ErrorHttp(404, 'no_existe');
  return { ruta, tipo: img.tipo, bytes: statSync(ruta).size };
}

export function ticketsDe(db, usuarioId) {
  return todos(db).filter(t => t.usuarioId === Number(usuarioId)).sort((a, b) => b.actualizado.localeCompare(a.actualizado)).map(t => vistaTicket(db, t, { conHilo: false }));
}
export function verTicket(db, usuarioId, id, { ahoraMs = Date.now() } = {}) {
  const t = propio(db, usuarioId, id);
  t.vistoAlumno = ahora(ahoraMs);
  t.vistosAlumno = t.mensajes.length;
  guardar(db, t);
  return vistaTicket(db, t);
}
export function responderAlumno(db, usuarioId, id, texto, { ahoraMs = Date.now() } = {}) {
  const limpio = textoLargo(texto);
  if (limpio.length < 1) throw new ErrorHttp(400, 'soporte_texto');
  return enTransaccion(db, () => {
    const t = propio(db, usuarioId, id);
    if (t.mensajes.length >= MENSAJES_MAXIMOS) throw new ErrorHttp(409, 'soporte_largo');
    const en = ahora(ahoraMs);
    t.mensajes.push({ de: 'alumno', autorId: Number(usuarioId), texto: limpio, en, imagenes: [] });
    if (t.estado === 'resuelto') t.estado = 'revision';
    t.actualizado = en;
    t.vistoAlumno = en;
    t.vistosAlumno = t.mensajes.length;
    guardar(db, t);
    return vistaTicket(db, t);
  });
}

// ---------- El administrador ----------
// 0.14.54: los «Reportar un problema» (categoría 'error') viven en «Reportes»: ni en la lista de Ayuda ni en su número
// (antes un reporte contaba dos veces: en Reportes y en «Ayuda (n)»).
const esReporte = t => t.categoria === 'error';
export const pendientesSoporte = db => todos(db).filter(t => !esReporte(t) && t.estado !== 'resuelto' && t.mensajes.at(-1)?.de === 'alumno').length;
export function ticketsAdmin(db) {
  return todos(db).filter(t => !esReporte(t)).sort((a, b) => b.actualizado.localeCompare(a.actualizado)).map(t => vistaTicket(db, t, { conHilo: false }));
}
export function verTicketAdmin(db, id, { ahoraMs = Date.now() } = {}) {
  const t = ticketDe(db, id);
  if (!t) throw new ErrorHttp(404, 'no_existe');
  t.vistoAdmin = ahora(ahoraMs);
  if (t.estado === 'nuevo') t.estado = 'revision';
  guardar(db, t);
  return vistaTicket(db, t);
}
export function responderAdmin(db, adminId, id, { texto, estado }, { ahoraMs = Date.now() } = {}) {
  return enTransaccion(db, () => {
    const t = ticketDe(db, id);
    if (!t) throw new ErrorHttp(404, 'no_existe');
    const en = ahora(ahoraMs);
    if (texto !== undefined && texto !== null && texto !== '') {
      const limpio = textoLargo(texto);
      if (!limpio) throw new ErrorHttp(400, 'soporte_texto');
      if (t.mensajes.length >= MENSAJES_MAXIMOS) throw new ErrorHttp(409, 'soporte_largo');
      t.mensajes.push({ de: 'admin', autorId: Number(adminId), texto: limpio, en, imagenes: [] });
      avisarCuenta(db, t.usuarioId, 'soporte_respondido');
    }
    if (estado !== undefined) {
      if (!ESTADOS_SOPORTE.includes(estado)) throw new ErrorHttp(400, 'datos_no_validos');
      t.estado = estado;
    } else if (texto && t.estado === 'nuevo') t.estado = 'revision';
    t.actualizado = en;
    t.vistoAdmin = en;
    guardar(db, t);
    auditar(db, { usuarioId: Number(adminId), accion: 'soporte_respuesta', detalle: `${t.id} → ${t.estado}` });
    return vistaTicket(db, t);
  });
}

// ---------- 0.14.26: «Reportar un problema» ----------
// Es un mensaje de ayuda más (categoría 'error'), con lo propio del reporte en t.reporte: { estado, notas, captura }.
//  - estado: nuevo | visto | arreglado | no_error (el del mensaje se mueve con él: visto → en revisión; arreglado o «no
//    es error» → resuelto).
//  - notas: SOLO del administrador (la persona nunca las ve).
//  - la captura (una, opcional) va EN LA BASE (ajustes 'soporte.captura.<n>', en base64) y no en la carpeta de datos: así
//    entra en las copias de cada noche. JPG de verdad (por sus primeros bytes), de 500 KB o menos (la app la achica a
//    1600 px antes de subirla). Se sube en los primeros 30 minutos, como las capturas de siempre.
//  - al llegar uno nuevo, un aviso para el dueño (pantalla y Telegram): 'reporte_error:<n>'.
export const ESTADOS_REPORTE = Object.freeze(['nuevo', 'visto', 'arreglado', 'no_error']);
export const CAPTURA_MAXIMA = 500 * 1024;
const ESTADO_TICKET_DE_REPORTE = { nuevo: 'nuevo', visto: 'revision', arreglado: 'resuelto', no_error: 'resuelto' };
const claveCaptura = id => `soporte.captura.${Number(id)}`;
const esJpeg = b => b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

// 0.14.85: «⚑ Reportar un error» en todo lo que el alumno lee o responde. Además del texto de antes:
//  - que: lo que eligió («La respuesta está mal»…, src/academia/reporte-item.js) y porque (10–1000 letras si es de
//    contenido). El primer mensaje es «<lo que eligió>: <su porqué>».
//  - item: el PUNTO ya resuelto por el servidor (src/academia/reporte-item.js: el texto tal cual lo vio, su huella, sus
//    fuentes y la versión del paquete). Sin item es un reporte de la app (como antes).
// Topes: REPORTES_POR_HORA por alumno (contados aquí, con la hora del servidor) y el mismo punto una sola vez por alumno
// (de la app: mientras el de esa pantalla siga abierto). Un aviso para el dueño por PUNTO (no por reporte): si el punto
// ya tiene uno nuevo abierto, el reporte se suma a ese.
const reportesDe = db => todos(db).filter(t => t.categoria === 'error' && t.reporte);
const abierto = t => ['nuevo', 'visto'].includes(t.reporte?.estado) && !t.reporte?.veredicto;
export function crearReporte(db, usuarioId, { texto, contexto, que, porque, item = null }, { ahoraMs = Date.now() } = {}) {
  const nuevo = que !== undefined && que !== null;
  if (nuevo) {
    if (!QUE_REPORTE.includes(que)) throw new ErrorHttp(400, 'reporte_que');
    const p = textoLargo(porque);
    if (p.length > PORQUE.maximo || (QUE_CONTENIDO.includes(que) && p.length < PORQUE.minimo)) throw new ErrorHttp(400, 'reporte_porque');
  }
  return enTransaccion(db, () => {
    const u = Number(usuarioId);
    const mios = reportesDe(db).filter(t => t.usuarioId === u);
    const haceUnaHora = ahora(ahoraMs - 3600 * 1000);
    if (mios.filter(t => t.creado >= haceUnaHora).length >= REPORTES_POR_HORA) throw new ErrorHttp(429, 'reporte_muchos');
    if (item?.clave && mios.some(t => t.reporte.item?.clave === item.clave && (item.tipo !== 'app' || abierto(t)))) throw new ErrorHttp(409, 'reporte_repetido');
    const limpio = nuevo ? textoLargo(porque) : '';
    const primero = nuevo ? (limpio ? `${TEXTO_QUE[que]}: ${limpio}` : TEXTO_QUE[que]) : texto;
    const vista = crearTicket(db, usuarioId, { categoria: 'error', texto: primero, contexto }, { ahoraMs });
    const t = ticketDe(db, vista.id);
    t.reporte = { estado: 'nuevo', notas: '', captura: null, ...(nuevo ? { que, porque: limpio } : {}), ...(item?.clave ? { item: { tipo: item.tipo, clave: item.clave, ref: item.ref, vista: item.vista, fuentes: item.fuentes ?? [], paquete: item.paquete ?? null } } : {}) };
    guardar(db, t);
    const yaAvisado = item?.clave && reportesDe(db).some(x => x.id !== t.id && x.reporte.item?.clave === item.clave && x.reporte.estado === 'nuevo' && !x.reporte.veredicto);
    if (!yaAvisado) {
      const quien = db.prepare('SELECT nombre, nombre_visible FROM usuarios WHERE id = ?').get(u);
      abrirAviso(db, { clave: `reporte_error:${t.id}`, nivel: 'atencion', detalle: { ticket: t.id, alumno: quien?.nombre_visible || quien?.nombre || '?', resumen: unaLinea(t.mensajes[0].texto, 120), pantalla: t.contexto.pantalla ?? '' }, ahora: ahoraMs });
    }
    return vistaTicket(db, t);
  });
}

// El cuerpo es la imagen tal cual (image/jpeg), por partes.
export async function subirCaptura(db, usuarioId, id, req, { ahoraMs = Date.now() } = {}) {
  const t = propio(db, usuarioId, id);
  if (!t.reporte) throw new ErrorHttp(404, 'no_existe');
  if (t.reporte.captura || ahoraMs - Date.parse(t.creado) > MINUTOS_PARA_CAPTURAS * 60 * 1000) throw new ErrorHttp(409, 'soporte_imagenes');
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > CAPTURA_MAXIMA) throw new ErrorHttp(413, 'demasiado_grande');
  const partes = [];
  let bytes = 0;
  await new Promise((ok, mal) => {
    let fallo = false;
    req.on('data', parte => {
      if (fallo) return;
      bytes += parte.length;
      if (bytes > CAPTURA_MAXIMA) { fallo = true; req.destroy(); return mal(new ErrorHttp(413, 'demasiado_grande')); }
      partes.push(parte);
    });
    req.on('end', () => { if (!fallo) ok(); });
    req.on('error', e => { if (!fallo) { fallo = true; mal(e); } });
  });
  const datos = Buffer.concat(partes);
  if (datos.length < 16 || !esJpeg(datos)) throw new ErrorHttp(415, 'soporte_imagen_tipo');
  return enTransaccion(db, () => {
    const actual = propio(db, usuarioId, id);
    if (actual.reporte?.captura) throw new ErrorHttp(409, 'soporte_imagenes');
    const sha256 = createHash('sha256').update(datos).digest('hex');
    escribir(db, claveCaptura(actual.id), JSON.stringify({ tipo: 'image/jpeg', bytes: datos.length, sha256, base64: datos.toString('base64') }));
    actual.reporte.captura = { bytes: datos.length, sha256 };
    guardar(db, actual);
    return { captura: true, bytes: datos.length };
  });
}

// → { tipo, datos (Buffer) }. Con usuarioId: solo la suya.
export function capturaDe(db, id, { usuarioId = null } = {}) {
  const t = usuarioId == null ? ticketDe(db, id) : propio(db, usuarioId, id);
  if (!t?.reporte?.captura) throw new ErrorHttp(404, 'no_existe');
  const c = json(leer(db, claveCaptura(t.id)));
  const datos = typeof c?.base64 === 'string' ? Buffer.from(c.base64, 'base64') : null;
  if (!datos || !esJpeg(datos)) throw new ErrorHttp(404, 'no_existe');
  return { tipo: 'image/jpeg', datos };
}

// 0.14.85: con lo que eligió, su porqué, el punto (tal cual lo vio) y el veredicto (quién y cuándo). Solo el administrador.
const vistaReporte = (db, t, conHilo) => ({ ...vistaTicket(db, t, { conHilo }), reporte: { estado: t.reporte.estado, notas: t.reporte.notas ?? '', captura: Boolean(t.reporte.captura), bytes: t.reporte.captura?.bytes ?? null,
  que: t.reporte.que ?? null, porque: t.reporte.porque ?? null, item: t.reporte.item ?? null, veredicto: t.reporte.veredicto ?? null, clave: claveDe(t) } });
// Un reporte sin punto (de antes, o de la app sin pantalla) es su propio punto.
const claveDe = t => t.reporte?.item?.clave ?? `reporte.${t.id}`;
const adminsDe = db => new Set(db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").all().map(f => f.id));
const nombreDe = (db, id) => { const u = db.prepare('SELECT nombre, nombre_visible FROM usuarios WHERE id = ?').get(Number(id)); return u ? { usuario: u.nombre, nombreVisible: u.nombre_visible || u.nombre } : { usuario: null, nombreVisible: null }; };
const esNuevo = t => t.reporte.estado === 'nuevo' && !t.reporte.veredicto;
// Los reportes juntos por punto: cuántos alumnos DISTINTOS (sin el administrador), cuántos nuevos y qué eligieron.
export function gruposReportes(db) {
  const admins = adminsDe(db);
  const grupos = new Map();
  for (const t of reportesDe(db).sort((a, b) => b.creado.localeCompare(a.creado) || b.id - a.id)) {
    const k = claveDe(t);
    const g = grupos.get(k) ?? { clave: k, tipo: t.reporte.item?.tipo ?? 'app', titulo: t.reporte.item?.vista?.titulo ?? t.reporte.item?.vista?.enunciado?.slice(0, 160) ?? null, pantalla: t.contexto?.pantalla ?? null,
      ultimo: t.id, en: t.creado, reportes: 0, nuevos: 0, alumnos: new Set(), porQue: {} };
    g.reportes += 1;
    if (esNuevo(t)) g.nuevos += 1;
    if (!admins.has(t.usuarioId)) g.alumnos.add(t.usuarioId);
    if (t.reporte.que) g.porQue[t.reporte.que] = (g.porQue[t.reporte.que] ?? 0) + 1;
    grupos.set(k, g);
  }
  return [...grupos.values()].map(g => ({ ...g, alumnos: g.alumnos.size }));
}
// «Para hoy»: una fila por PUNTO con reportes nuevos (los de más alumnos primero).
export function puntosNuevos(db) {
  return gruposReportes(db).filter(g => g.nuevos > 0).sort((a, b) => b.alumnos - a.alumnos || b.nuevos - a.nuevos || String(b.en).localeCompare(String(a.en)))
    .map(g => ({ id: g.ultimo, tipo: g.tipo, titulo: g.titulo, pantalla: g.pantalla, alumnos: g.alumnos, nuevos: g.nuevos }));
}
export function reportesAdmin(db) {
  const lista = reportesDe(db).sort((a, b) => b.creado.localeCompare(a.creado)).map(t => vistaReporte(db, t, false));
  const grupos = gruposReportes(db);
  return { reportes: lista, nuevos: lista.filter(r => r.reporte.estado === 'nuevo').length, grupos, nuevosPuntos: grupos.filter(g => g.nuevos > 0).length };
}
export function verReporteAdmin(db, id) {
  const t = ticketDe(db, id);
  if (!t?.reporte) throw new ErrorHttp(404, 'no_existe');
  // Todos los reportes del mismo punto, con quién (el administrador sí lo ve) y lo que dijo cada uno.
  const k = claveDe(t);
  const admins = adminsDe(db);
  const mismos = reportesDe(db).filter(x => claveDe(x) === k).sort((a, b) => a.creado.localeCompare(b.creado) || a.id - b.id);
  const grupo = {
    clave: k, alumnos: new Set(mismos.filter(x => !admins.has(x.usuarioId)).map(x => x.usuarioId)).size,
    reportes: mismos.map(x => ({ id: x.id, usuarioId: x.usuarioId, ...nombreDe(db, x.usuarioId), que: x.reporte.que ?? null, porque: x.reporte.porque ?? x.mensajes[0]?.texto ?? '', en: x.creado, estado: x.reporte.estado, veredicto: x.reporte.veredicto ?? null })),
    porQue: mismos.reduce((a, x) => (x.reporte.que ? { ...a, [x.reporte.que]: (a[x.reporte.que] ?? 0) + 1 } : a), {}),
  };
  return { ...vistaReporte(db, t, true), grupo };
}

// «¿Tiene razón?»: si (es un error) | no (es cosa del alumno) | dudoso. Queda quién y cuándo. todos: true lo pone a
// TODOS los reportes de ese punto que todavía no tienen veredicto. «No» cierra el reporte (no_error); los demás lo dejan
// «visto». El aviso del dueño se cierra.
export const VEREDICTOS = Object.freeze(['si', 'no', 'dudoso']);
export function ponerVeredicto(db, adminId, id, valor, { todos: aTodos = false, ahoraMs = Date.now() } = {}) {
  if (!VEREDICTOS.includes(valor)) throw new ErrorHttp(400, 'datos_no_validos');
  return enTransaccion(db, () => {
    const t = ticketDe(db, id);
    if (!t?.reporte) throw new ErrorHttp(404, 'no_existe');
    const k = claveDe(t);
    const lista = aTodos ? reportesDe(db).filter(x => claveDe(x) === k && (x.id === t.id || !x.reporte.veredicto)) : [t];
    const en = ahora(ahoraMs);
    const quien = nombreDe(db, adminId);
    for (const x of lista) {
      x.reporte.veredicto = { valor, por: Number(adminId), porNombre: quien.nombreVisible, en };
      if (valor === 'no') { x.reporte.estado = 'no_error'; x.estado = 'resuelto'; }
      else if (x.reporte.estado === 'nuevo') { x.reporte.estado = 'visto'; x.estado = 'revision'; }
      x.actualizado = en;
      x.vistoAdmin = en;
      guardar(db, x);
      resolverAviso(db, `reporte_error:${x.id}`, ahoraMs);
    }
    auditar(db, { usuarioId: Number(adminId), accion: 'reporte_veredicto', detalle: `${lista.map(x => x.id).join(',')} → ${valor}` });
    return verReporteAdmin(db, t.id);
  });
}
// 0.14.85: la opinión de la IA («Pedir opinión a la IA»), guardada por punto: es una SUGERENCIA, el administrador decide.
export const claveOpinionIa = clave => `academia.reporte.ia.${createHash('sha256').update(String(clave)).digest('hex').slice(0, 32)}`;
export function opinionIaDe(db, clave) { return json(leer(db, claveOpinionIa(clave))); }
export function actualizarReporte(db, adminId, id, { estado, notas }, { ahoraMs = Date.now() } = {}) {
  return enTransaccion(db, () => {
    const t = ticketDe(db, id);
    if (!t?.reporte) throw new ErrorHttp(404, 'no_existe');
    if (estado !== undefined) {
      if (!ESTADOS_REPORTE.includes(estado)) throw new ErrorHttp(400, 'datos_no_validos');
      t.reporte.estado = estado;
      t.estado = ESTADO_TICKET_DE_REPORTE[estado];
      if (estado !== 'nuevo') resolverAviso(db, `reporte_error:${t.id}`, ahoraMs);
    }
    if (notas !== undefined) t.reporte.notas = textoLargo(notas);
    t.actualizado = ahora(ahoraMs);
    t.vistoAdmin = t.actualizado;
    guardar(db, t);
    auditar(db, { usuarioId: Number(adminId), accion: 'reporte_estado', detalle: `${t.id} → ${t.reporte.estado}` });
    return vistaReporte(db, t, true);
  });
}
