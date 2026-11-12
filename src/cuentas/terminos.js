// Academia 0.9.2: «Términos de uso y aviso» y el nombre legal de cada persona. Sin cambio de base (todo en «ajustes»).
//  - El texto va por versiones (academia.terminos.v<N>, nunca se pisa una; academia.terminos.version dice cuál está en
//    uso). Sin nada guardado, la versión 1 es el texto de abajo. Publicar uno nuevo crea la versión siguiente y todos
//    tienen que aceptarlo otra vez.
//  - Antes de aceptar, la persona escribe su Nombre y Apellido de verdad (cuenta.nombre_legal.<id>). Si el administrador
//    ya lo puso, se le muestra para confirmar. Una vez que la persona lo confirmó, solo el administrador lo cambia.
//  - Cada aceptación queda como una firma (cuenta.terminos.<id>: versión, nombre tal como firmó, fecha y hora) y en la
//    auditoría («terminos_aceptados»).
// El texto no nombra ninguna escuela, autoridad, editorial ni empresa (pedido de Junior).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from './usuarios.js';

export const TERMINOS_V1 = Object.freeze([
  { titulo: '1. Fin educativo', texto: 'Esta academia es una herramienta de estudio privada, hecha para fines de estudio por y para estudiantes. No es un producto comercial y no se vende el contenido.' },
  { titulo: '2. No es material oficial', texto: 'No pertenece ni está aprobada por ninguna escuela, autoridad de aviación ni editorial. No reemplaza tus clases, a tu instructor, los libros originales, el manual del avión ni las regulaciones vigentes. Siempre estudia el material oficial.' },
  { titulo: '3. Exactitud', texto: 'El contenido se tomó de los libros con cuidado, pero puede tener errores: ante cualquier duda manda el libro original y tu instructor. Las explicaciones de la inteligencia artificial pueden equivocarse. Nada aquí es instrucción de vuelo ni sirve para operar una aeronave.' },
  { titulo: '4. Pagos', texto: 'La academia ya funciona completa y gratis con su propio instructor (el sistema que sigue tu estudio, te refuerza y te prepara). Lo que se paga es opcional: tiempo con un instructor de inteligencia artificial más personalizado, que se adapta a tus problemas y a tu forma de aprender. No se paga por las preguntas ni por el contenido de los libros. Lo que se paga ayuda a mantener el sistema funcionando para ti y para futuros estudiantes.' },
  { titulo: '5. Contenido de terceros', texto: 'Los libros y materiales de estudio pertenecen a sus autores. Son solo para tu estudio personal: está prohibido copiar, descargar en masa o compartir el contenido fuera de la academia.' },
  { titulo: '6. Privacidad', texto: 'Guardamos tu usuario, tu progreso y tus respuestas para seguir tu estudio; solo tú y el administrador los ven. Los comprobantes de pago solo los ve el administrador. A la inteligencia artificial no se envía tu nombre.' },
  { titulo: '7. Responsabilidad', texto: 'Usas la academia bajo tu propia responsabilidad. El creador no se hace responsable por resultados de exámenes ni por decisiones de vuelo.' },
  { titulo: '8. Reglas', texto: 'El administrador puede bloquear las cuentas que no cumplan estas reglas.' },
]);

// 0.9.2: la declaración que va justo antes de «Leí y acepto» (es parte de lo que se firma).
export const DECLARACION = 'Declaro que los datos que escribí son verdaderos y que esta firma es mía. Si uso un nombre o una firma que no son míos, la responsabilidad es solo mía y el administrador puede bloquear mi cuenta.';
export const FIRMA_MAXIMA = 50 * 1024;
const sha256 = datos => createHash('sha256').update(datos).digest('hex');
// La huella del texto EXACTO que se firmó (las partes de esa versión y la declaración).
export const huellaTexto = terminos => sha256(JSON.stringify({ secciones: terminos.secciones.map(s => [s.titulo, s.texto]), declaracion: DECLARACION }));
// La carpeta privada de las firmas (en la carpeta de datos, junto a la base; nunca en el repositorio).
export const carpetaFirmas = config => join(config.carpetaDatos ?? dirname(config.archivoBase), 'firmas');
// Una firma dibujada: «data:image/png;base64,…», un PNG de verdad de 50 KB o menos.
export function firmaDe(texto) {
  const m = typeof texto === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(texto) : null;
  if (!m) throw new ErrorHttp(400, 'firma_falta');
  const png = Buffer.from(m[1], 'base64');
  if (png.length > FIRMA_MAXIMA) throw new ErrorHttp(400, 'firma_muy_grande');
  const cabeza = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 60 || !png.subarray(0, 8).equals(cabeza) || png.toString('latin1', 12, 16) !== 'IHDR') throw new ErrorHttp(400, 'firma_falta');
  const ancho = png.readUInt32BE(16);
  const alto = png.readUInt32BE(20);
  if (ancho < 50 || alto < 30 || ancho > 2000 || alto > 1000) throw new ErrorHttp(400, 'firma_falta');
  return png;
}

const leer = (db, clave) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
const escribir = (db, clave, valor) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, valor, new Date().toISOString());
const json = texto => { try { return JSON.parse(texto ?? 'null'); } catch { return null; } };
const ahora = () => new Date().toISOString();

export function versionTerminos(db) {
  const v = Number(leer(db, 'academia.terminos.version'));
  return Number.isSafeInteger(v) && v >= 1 ? v : 1;
}
export function terminosVersion(db, version) {
  const t = json(leer(db, `academia.terminos.v${Number(version)}`));
  if (t && Array.isArray(t.secciones)) return { version: Number(version), secciones: t.secciones, publicadoEn: t.publicadoEn ?? null };
  return Number(version) === 1 ? { version: 1, secciones: TERMINOS_V1.map(s => ({ ...s })), publicadoEn: null } : null;
}
export const terminosActuales = db => terminosVersion(db, versionTerminos(db));

// El administrador publica un texto nuevo: [{ titulo, texto }] (1 a 30 partes). Crea la versión siguiente.
export function publicarTerminos(db, secciones, { hechoPor }) {
  if (!Array.isArray(secciones) || !secciones.length || secciones.length > 30) throw new ErrorHttp(400, 'terminos_no_validos');
  const limpias = secciones.map(s => {
    if (!s || typeof s.titulo !== 'string' || typeof s.texto !== 'string') throw new ErrorHttp(400, 'terminos_no_validos');
    const titulo = s.titulo.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
    const texto = s.texto.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 4000);
    if (!titulo || !texto) throw new ErrorHttp(400, 'terminos_no_validos');
    return { titulo, texto };
  });
  return enTransaccion(db, () => {
    const version = versionTerminos(db) + 1;
    escribir(db, `academia.terminos.v${version}`, JSON.stringify({ secciones: limpias, publicadoEn: ahora(), por: hechoPor }));
    escribir(db, 'academia.terminos.version', String(version));
    auditar(db, { usuarioId: hechoPor, accion: 'terminos_publicados', detalle: `v${version}` });
    return terminosActuales(db);
  });
}

// ---------- El nombre legal ----------
const PARTE = /^[\p{L}](?:[\p{L}\p{M}' -]*[\p{L}\p{M}])?$/u;
function parteDe(valor) {
  if (typeof valor !== 'string') throw new ErrorHttp(400, 'nombre_legal_no_valido');
  const limpio = valor.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (limpio.length < 2 || limpio.length > 60 || !PARTE.test(limpio)) throw new ErrorHttp(400, 'nombre_legal_no_valido');
  return limpio;
}
export function nombreLegalDe(db, usuarioId) {
  const n = json(leer(db, `cuenta.nombre_legal.${Number(usuarioId)}`));
  return n && typeof n.nombre === 'string' && typeof n.apellido === 'string'
    ? { nombre: n.nombre, apellido: n.apellido, completo: `${n.nombre} ${n.apellido}`, confirmado: n.confirmado === true, en: n.en ?? null } : null;
}
export function nombresLegales(db) {
  const m = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'cuenta.nombre_legal.%'").all()) {
    const n = json(f.valor);
    if (n && typeof n.nombre === 'string' && typeof n.apellido === 'string') m.set(Number(f.clave.slice('cuenta.nombre_legal.'.length)), `${n.nombre} ${n.apellido}`);
  }
  return m;
}
// por: 'admin' (lo puso o lo corrigió el administrador) | 'persona' (lo confirmó al aceptar los términos).
export function ponerNombreLegal(db, usuarioId, { nombre, apellido }, { por, hechoPor = null }) {
  const n = parteDe(nombre);
  const a = parteDe(apellido);
  const id = Number(usuarioId);
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
  const antes = nombreLegalDe(db, id);
  escribir(db, `cuenta.nombre_legal.${id}`, JSON.stringify({ nombre: n, apellido: a, confirmado: por === 'persona' || (antes?.confirmado === true), por, en: ahora() }));
  if (por === 'admin') auditar(db, { usuarioId: hechoPor, accion: 'nombre_legal_puesto', detalle: `${id}: ${n} ${a}` });
  return nombreLegalDe(db, id);
}

// ---------- Aceptar ----------
export function firmasDe(db, usuarioId) {
  const l = json(leer(db, `cuenta.terminos.${Number(usuarioId)}`));
  return Array.isArray(l) ? l.filter(f => f && Number.isSafeInteger(f.version) && typeof f.en === 'string') : [];
}
export function estadoTerminos(db, usuarioId) {
  const version = versionTerminos(db);
  const firmas = firmasDe(db, usuarioId);
  const ultima = firmas.at(-1) ?? null;
  return { version, pendiente: !firmas.some(f => f.version === version), ultima, nombreLegal: nombreLegalDe(db, usuarioId) };
}
// firma: el PNG (ya revisado con firmaDe); config: dónde guardarlo; ip y navegador: de dónde se firmó.
export function aceptarTerminos(db, usuarioId, { version, nombre, apellido, acepto, firma }, { config, ip = null, navegador = null } = {}) {
  if (acepto !== true) throw new ErrorHttp(400, 'terminos_sin_aceptar');
  const png = firmaDe(firma);
  const id = Number(usuarioId);
  return enTransaccion(db, () => {
    const actual = versionTerminos(db);
    if (version !== actual) throw new ErrorHttp(409, 'terminos_cambiaron');
    const antes = nombreLegalDe(db, id);
    let legal;
    if (antes?.confirmado) {
      // Ya lo confirmó una vez: firma con ese (solo el administrador lo cambia).
      if (parteDe(nombre) !== antes.nombre || parteDe(apellido) !== antes.apellido) throw new ErrorHttp(409, 'nombre_legal_fijo');
      legal = antes;
    } else {
      legal = ponerNombreLegal(db, id, { nombre, apellido }, { por: 'persona' });
    }
    const firmas = firmasDe(db, id);
    if (!firmas.some(f => f.version === actual)) {
      const u = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(id);
      const huellaFirma = sha256(png);
      const en = ahora();
      // El PNG: en la carpeta privada (nunca se pisa ni se borra) y una copia en la base (va en las copias cifradas).
      const archivo = `${id}-v${actual}-${huellaFirma.slice(0, 16)}.png`;
      const carpeta = carpetaFirmas(config);
      mkdirSync(carpeta, { recursive: true, mode: 0o700 });
      if (!existsSync(join(carpeta, archivo))) writeFileSync(join(carpeta, archivo), png, { flag: 'wx', mode: 0o600 });
      escribir(db, `cuenta.firma.${id}.v${actual}`, png.toString('base64'));
      firmas.push({
        version: actual, firmado: legal.completo, en, usuario: u?.nombre ?? null, usuarioId: id,
        textoSha256: huellaTexto(terminosVersion(db, actual)), firmaSha256: huellaFirma, archivo,
        ip: ip ? String(ip).slice(0, 80) : null, navegador: navegador ? String(navegador).slice(0, 300) : null,
      });
      escribir(db, `cuenta.terminos.${id}`, JSON.stringify(firmas));
      auditar(db, { usuarioId: id, accion: 'terminos_aceptados', detalle: `v${actual}: ${legal.completo} (firma ${huellaFirma.slice(0, 12)})` });
    }
    return estadoTerminos(db, id);
  });
}

// ---------- Los contratos firmados (solo el administrador) ----------
// Cada firma de cada versión queda para siempre (aunque la cuenta se bloquee o el texto cambie).
export function contratos(db) {
  const lista = [];
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'cuenta.terminos.%'").all()) {
    const usuarioId = Number(f.clave.slice('cuenta.terminos.'.length));
    if (!Number.isSafeInteger(usuarioId)) continue;
    const u = db.prepare('SELECT nombre, activo FROM usuarios WHERE id = ?').get(usuarioId);
    for (const x of firmasDe(db, usuarioId)) {
      lista.push({ usuarioId, version: x.version, firmado: x.firmado, usuario: u?.nombre ?? x.usuario ?? null, bloqueado: u ? u.activo !== 1 : null, en: x.en, conFirma: Boolean(x.firmaSha256) });
    }
  }
  return lista.sort((a, b) => b.en.localeCompare(a.en));
}
export function pngDeFirma(db, config, usuarioId, version) {
  const x = firmasDe(db, usuarioId).find(f => f.version === Number(version));
  if (!x?.firmaSha256) return null;
  let png = null;
  try { if (x.archivo && /^[0-9]+-v[0-9]+-[0-9a-f]{16}\.png$/.test(x.archivo)) png = readFileSync(join(carpetaFirmas(config), x.archivo)); } catch { png = null; }
  if (!png || sha256(png) !== x.firmaSha256) {
    const copia = leer(db, `cuenta.firma.${Number(usuarioId)}.v${Number(version)}`);
    png = copia ? Buffer.from(copia, 'base64') : null;
  }
  return png && sha256(png) === x.firmaSha256 ? png : null;
}
export function contrato(db, config, usuarioId, version) {
  const x = firmasDe(db, usuarioId).find(f => f.version === Number(version));
  if (!x) throw new ErrorHttp(404, 'no_existe');
  const terminos = terminosVersion(db, x.version);
  const u = db.prepare('SELECT nombre, activo FROM usuarios WHERE id = ?').get(Number(usuarioId));
  const textoAlDia = x.textoSha256 ? huellaTexto(terminos) === x.textoSha256 : null;
  return {
    usuarioId: Number(usuarioId), usuario: u?.nombre ?? x.usuario ?? null, bloqueado: u ? u.activo !== 1 : null,
    version: x.version, firmado: x.firmado, en: x.en, ip: x.ip ?? null, navegador: x.navegador ?? null,
    textoSha256: x.textoSha256 ?? null, firmaSha256: x.firmaSha256 ?? null, textoVerificado: textoAlDia,
    firmaVerificada: x.firmaSha256 ? Boolean(pngDeFirma(db, config, usuarioId, x.version)) : null,
    terminos, declaracion: DECLARACION,
  };
}
