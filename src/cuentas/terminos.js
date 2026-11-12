// Academia 0.9.2: «Términos de uso y aviso» y el nombre legal de cada persona. Sin cambio de base (todo en «ajustes»).
//  - El texto va por versiones (academia.terminos.v<N>, nunca se pisa una; academia.terminos.version dice cuál está en
//    uso). Sin nada guardado, las versiones son las del código (src/cuentas/textos-legales.js) y la que está en uso es la
//    última de ellas. Publicar uno nuevo crea la versión siguiente y todos tienen que aceptarlo otra vez.
//  - 0.12.3: el Aviso de privacidad trae su versión 2 en el código (los comprobantes ya no se borran a los 30 días). La 1
//    sigue igual, para las firmas que la aceptaron. Si el administrador ya había publicado textos suyos, mandan esos
//    (nada se pisa): la versión del código solo se usa donde no hay nada guardado.
//  - Antes de aceptar, la persona escribe su Nombre y Apellido de verdad (cuenta.nombre_legal.<id>). Si el administrador
//    ya lo puso, se le muestra para confirmar. Una vez que la persona lo confirmó, solo el administrador lo cambia.
//    0.12.3: al confirmarlo la primera vez, un alumno queda con ese nombre también en la app (nombre_visible); desde ahí
//    tampoco lo cambia él en Configuración (solo el administrador: Usuarios o la ficha del alumno).
//  - Cada aceptación queda como una firma (cuenta.terminos.<id>: versión, nombre tal como firmó, fecha y hora) y en la
//    auditoría («terminos_aceptados»).
// El texto no nombra ninguna escuela, autoridad, editorial ni empresa (pedido de Junior).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from './usuarios.js';

import { TERMINOS_V1, TERMINOS_V2, PRIVACIDAD_V1, PRIVACIDAD_V2, REEMBOLSO } from './textos-legales.js';

export { TERMINOS_V1, TERMINOS_V2, PRIVACIDAD_V1, PRIVACIDAD_V2, REEMBOLSO };

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

// ---------- Los textos (por versiones) ----------
// 'terminos' (Términos de uso y aviso) y 'privacidad' (Aviso de privacidad). Cada uno con su versión; firmar acepta los
// dos en sus versiones de ese momento.
// defectos: las versiones que trae el código (la 1, la 2…), nunca cambian una vez publicadas.
// cambios (0.12.4): «Qué cambió» de cada versión que trae el código: la clave de su frase en public/i18n (null = la primera).
const DOCS = {
  // 0.12.7: la versión 2 de los Términos (el punto 8: la IA por plan mensual, con 5 días de prueba gratis).
  terminos: { clave: 'academia.terminos', defectos: [TERMINOS_V1, TERMINOS_V2], cambios: [null, 'terminos.cambio.terminos_v2'] },
  privacidad: { clave: 'academia.privacidad', defectos: [PRIVACIDAD_V1, PRIVACIDAD_V2], cambios: [null, 'terminos.cambio.privacidad_v2'] },
};
export const DOCUMENTOS = Object.freeze(Object.keys(DOCS));
const docDe = doc => { if (!DOCS[doc]) throw new ErrorHttp(400, 'terminos_no_validos'); return DOCS[doc]; };
export function versionDoc(db, doc) {
  const d = docDe(doc);
  const v = Number(leer(db, `${d.clave}.version`));
  return Number.isSafeInteger(v) && v >= 1 ? v : d.defectos.length;
}
export function docVersion(db, doc, version) {
  const d = docDe(doc);
  const t = json(leer(db, `${d.clave}.v${Number(version)}`));
  if (t && Array.isArray(t.secciones)) return { doc, version: Number(version), secciones: t.secciones, publicadoEn: t.publicadoEn ?? null, cambios: typeof t.cambios === 'string' && t.cambios ? t.cambios : null };
  const n = Number(version);
  return Number.isSafeInteger(n) && n >= 1 && n <= d.defectos.length ? { doc, version: n, secciones: d.defectos[n - 1].map(x => ({ ...x })), publicadoEn: null, cambios: null, cambiosClave: d.cambios?.[n - 1] ?? null } : null;
}
export const docActual = (db, doc) => docVersion(db, doc, versionDoc(db, doc));
export const versionTerminos = db => versionDoc(db, 'terminos');
export const terminosVersion = (db, version) => docVersion(db, 'terminos', version);
export const terminosActuales = db => docActual(db, 'terminos');
const huellaSecciones = d => sha256(JSON.stringify(d.secciones.map(x => [x.titulo, x.texto])));

// El administrador publica un texto nuevo: [{ titulo, texto }] (1 a 40 partes). Crea la versión siguiente.
// cambios (0.12.4, opcional): «Qué cambió», en pocas palabras, para los que ya firmaron la versión anterior.
export function publicarDoc(db, doc, secciones, { hechoPor, cambios = null }) {
  const resumen = typeof cambios === 'string' ? cambios.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 600) : '';
  const d = docDe(doc);
  if (!Array.isArray(secciones) || !secciones.length || secciones.length > 40) throw new ErrorHttp(400, 'terminos_no_validos');
  const limpias = secciones.map(x => {
    if (!x || typeof x.titulo !== 'string' || typeof x.texto !== 'string') throw new ErrorHttp(400, 'terminos_no_validos');
    const titulo = x.titulo.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160);
    const texto = x.texto.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 6000);
    if (!titulo || !texto) throw new ErrorHttp(400, 'terminos_no_validos');
    return { titulo, texto };
  });
  return enTransaccion(db, () => {
    const version = versionDoc(db, doc) + 1;
    escribir(db, `${d.clave}.v${version}`, JSON.stringify({ secciones: limpias, publicadoEn: ahora(), por: hechoPor, ...(resumen ? { cambios: resumen } : {}) }));
    escribir(db, `${d.clave}.version`, String(version));
    auditar(db, { usuarioId: hechoPor, accion: `${doc}_publicados`, detalle: `v${version}` });
    return docActual(db, doc);
  });
}
export const publicarTerminos = (db, secciones, opciones) => publicarDoc(db, 'terminos', secciones, opciones);

// 0.12.4: «Qué cambió» para quien ya firmó una versión anterior: la nota de cada versión nueva (si el administrador la
// escribió) y qué partes son nuevas, cambiaron o ya no están (por su título). null si no firmó antes o no cambió nada.
export function queCambio(db, doc, desdeVersion) {
  const actual = docActual(db, doc);
  const desde = Number(desdeVersion);
  if (!Number.isSafeInteger(desde) || desde < 1 || desde >= actual.version) return null;
  const antes = docVersion(db, doc, desde);
  const notas = [];
  for (let v = desde + 1; v <= actual.version; v++) { const x = docVersion(db, doc, v); if (x?.cambios) notas.push({ version: v, texto: x.cambios }); else if (x?.cambiosClave) notas.push({ version: v, clave: x.cambiosClave }); }
  const viejas = new Map((antes?.secciones ?? []).map(s => [s.titulo, s.texto]));
  const nuevas = new Set(actual.secciones.map(s => s.titulo));
  return {
    desde, version: actual.version, notas,
    nuevas: actual.secciones.filter(s => !viejas.has(s.titulo)).map(s => s.titulo),
    cambiadas: actual.secciones.filter(s => viejas.has(s.titulo) && viejas.get(s.titulo) !== s.texto).map(s => s.titulo),
    quitadas: [...viejas.keys()].filter(titulo => !nuevas.has(titulo)),
  };
}

// ---------- El nombre legal y la fecha de nacimiento ----------
const PARTE = /^[\p{L}](?:[\p{L}\p{M}' -]*[\p{L}\p{M}])?$/u;
function parteDe(valor, { maximo = 60, error = 'nombre_legal_no_valido' } = {}) {
  if (typeof valor !== 'string') throw new ErrorHttp(400, error);
  const limpio = valor.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (limpio.length < 2 || limpio.length > maximo || !PARTE.test(limpio)) throw new ErrorHttp(400, error);
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
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const hoySD = ms => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);
export function edadEn(nacimiento, hoy) {
  const [a, m, d] = nacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
function nacimientoDe(valor, ahoraMs) {
  if (typeof valor !== 'string' || !DIA_ISO.test(valor) || new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) !== valor) throw new ErrorHttp(400, 'nacimiento_no_valido');
  const edad = edadEn(valor, hoySD(ahoraMs));
  if (edad < 5 || edad > 110) throw new ErrorHttp(400, 'nacimiento_no_valido');
  return { nacimiento: valor, edad, menor: edad < 18 };
}
export const nacimientoGuardado = (db, id) => leer(db, `cuenta.nacimiento.${Number(id)}`);
// El administrador corrige la fecha de nacimiento (y con ella si es menor).
export function ponerNacimiento(db, id, valor, { hechoPor, ahoraMs = Date.now() }) {
  const nac = nacimientoDe(valor, ahoraMs);
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(Number(id))) throw new ErrorHttp(404, 'no_existe');
  escribir(db, `cuenta.nacimiento.${Number(id)}`, nac.nacimiento);
  escribir(db, `cuenta.menor.${Number(id)}`, nac.menor ? '1' : '0');
  auditar(db, { usuarioId: hechoPor, accion: 'nacimiento_corregido', detalle: `${id}: ${nac.nacimiento}` });
  return nac;
}

// ---------- Consentimientos que leen otras partes de la app ----------
// IA: si aceptó enviar sus datos de estudio (sin nombre) al proveedor de IA en el extranjero. Sin aceptar: la app
// funciona igual, sin las funciones de IA.
export const consienteIa = (db, id) => leer(db, `cuenta.consentimiento_ia.${Number(id)}`) === '1';
// ¿Se puede usar la IA con esta cuenta? Con los términos obligatorios (el servidor de verdad), solo con el «sí»
// firmado; las pruebas sin términos solo frenan un «no» explícito.
export const iaPermitida = (db, id, { estricto = true } = {}) => (estricto ? consienteIa(db, id) : leer(db, `cuenta.consentimiento_ia.${Number(id)}`) !== '0');
export function ponerConsentimientoIa(db, id, permitido) {
  if (typeof permitido !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  if (!firmasDe(db, id).length) throw new ErrorHttp(409, 'terminos_pendientes');
  escribir(db, `cuenta.consentimiento_ia.${Number(id)}`, permitido ? '1' : '0');
  // Queda anotado con su fecha (y en la auditoría): el último cambio es el que vale.
  const historia = json(leer(db, `cuenta.consentimiento_ia_historia.${Number(id)}`)) ?? [];
  historia.push({ permitido, en: ahora() });
  escribir(db, `cuenta.consentimiento_ia_historia.${Number(id)}`, JSON.stringify(historia.slice(-100)));
  auditar(db, { usuarioId: Number(id), accion: permitido ? 'ia_consentida' : 'ia_retirada' });
  return permitido;
}
// Menor de edad: firmó con su padre, madre o tutor. Sus pagos solo si el administrador marcó «el tutor autorizó pagos».
export const esMenor = (db, id) => leer(db, `cuenta.menor.${Number(id)}`) === '1';
export const tutorAutorizoPagos = (db, id) => leer(db, `cuenta.tutor_pagos.${Number(id)}`) === '1';
export const pagosPermitidos = (db, id) => !esMenor(db, id) || tutorAutorizoPagos(db, id);
export function ponerTutorPagos(db, id, autorizado, { hechoPor }) {
  if (typeof autorizado !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  escribir(db, `cuenta.tutor_pagos.${Number(id)}`, autorizado ? '1' : '0');
  auditar(db, { usuarioId: hechoPor, accion: 'tutor_pagos', detalle: `${id}: ${autorizado ? 'sí' : 'no'}` });
  return autorizado;
}
// «Cómo verifiqué su identidad» (nota del administrador; sale en el contrato).
export function verificacionDe(db, id) {
  const v = json(leer(db, `cuenta.verificacion.${Number(id)}`));
  return v && typeof v.nota === 'string' ? v : null;
}
export function ponerVerificacion(db, id, nota, { hechoPor }) {
  if (typeof nota !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
  const limpio = nota.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(Number(id))) throw new ErrorHttp(404, 'no_existe');
  const v = { nota: limpio, por: hechoPor, en: ahora() };
  escribir(db, `cuenta.verificacion.${Number(id)}`, JSON.stringify(v));
  auditar(db, { usuarioId: hechoPor, accion: 'identidad_verificada', detalle: `${id}: ${limpio.slice(0, 80)}` });
  return v;
}

// ---------- Aceptar (= firmar) ----------
export function firmasDe(db, usuarioId) {
  const l = json(leer(db, `cuenta.terminos.${Number(usuarioId)}`));
  return Array.isArray(l) ? l.filter(f => f && Number.isSafeInteger(f.version) && typeof f.en === 'string').map((f, k) => ({ ...f, n: f.n ?? k + 1 })) : [];
}
export function estadoTerminos(db, usuarioId) {
  const version = versionDoc(db, 'terminos');
  const versionPrivacidad = versionDoc(db, 'privacidad');
  const firmas = firmasDe(db, usuarioId);
  const ultima = firmas.at(-1) ?? null;
  const alDia = firmas.some(f => f.version === version && (f.versionPrivacidad ?? 1) === versionPrivacidad);
  return {
    version, versionPrivacidad, pendiente: !alDia, ultima: ultima ? { n: ultima.n, version: ultima.version, versionPrivacidad: ultima.versionPrivacidad ?? null, firmado: ultima.firmado, en: ultima.en } : null,
    nombreLegal: nombreLegalDe(db, usuarioId), nacimiento: nacimientoGuardado(db, usuarioId), menor: esMenor(db, usuarioId), aceptoIa: consienteIa(db, usuarioId),
  };
}
function guardarPng(db, config, png, archivo, claveCopia) {
  const carpeta = carpetaFirmas(config);
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  if (!existsSync(join(carpeta, archivo))) writeFileSync(join(carpeta, archivo), png, { flag: 'wx', mode: 0o600 });
  escribir(db, claveCopia, png.toString('base64'));
}
// datos: { version, versionPrivacidad, nombre, apellido, nacimiento, acepto, aceptoPrivacidad, aceptoIa, firma,
//          tutor?: { nombre, relacion, contacto, acepto, firma } } (el tutor, solo si es menor de 18).
export function aceptarTerminos(db, usuarioId, datos, { config, ip = null, navegador = null, ahoraMs = Date.now() } = {}) {
  const { version, versionPrivacidad = 1, nombre, apellido, nacimiento, acepto, aceptoPrivacidad, aceptoIa, firma, tutor } = datos ?? {};
  if (acepto !== true) throw new ErrorHttp(400, 'terminos_sin_aceptar');
  if (aceptoPrivacidad !== true) throw new ErrorHttp(400, 'privacidad_sin_aceptar');
  if (typeof aceptoIa !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  const nac = nacimientoDe(nacimiento, ahoraMs);
  const png = firmaDe(firma);
  let tutorDatos = null;
  let pngTutor = null;
  if (nac.menor) {
    if (!tutor || typeof tutor !== 'object') throw new ErrorHttp(400, 'tutor_falta');
    if (tutor.acepto !== true) throw new ErrorHttp(400, 'tutor_falta');
    tutorDatos = {
      nombre: parteDe(tutor.nombre, { maximo: 120, error: 'tutor_falta' }),
      relacion: parteDe(tutor.relacion, { maximo: 40, error: 'tutor_falta' }),
      contacto: (() => { const c = String(tutor.contacto ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); if (c.length < 5 || c.length > 120) throw new ErrorHttp(400, 'tutor_falta'); return c; })(),
    };
    pngTutor = firmaDe(tutor.firma);
  }
  const id = Number(usuarioId);
  return enTransaccion(db, () => {
    const actual = versionDoc(db, 'terminos');
    const actualPrivacidad = versionDoc(db, 'privacidad');
    if (version !== actual || versionPrivacidad !== actualPrivacidad) throw new ErrorHttp(409, 'terminos_cambiaron');
    const antes = nombreLegalDe(db, id);
    let legal;
    if (antes?.confirmado) {
      // Ya lo confirmó una vez: firma con ese (solo el administrador lo cambia).
      if (parteDe(nombre) !== antes.nombre || parteDe(apellido) !== antes.apellido) throw new ErrorHttp(409, 'nombre_legal_fijo');
      legal = antes;
    } else {
      legal = ponerNombreLegal(db, id, { nombre, apellido }, { por: 'persona' });
      // 0.12.3: la primera vez que un alumno confirma su Nombre y Apellido, ese es también su nombre en la app (el que ve
      // el administrador en Usuarios, su ficha y los reportes). Desde ahí solo el administrador lo cambia.
      const cuenta = db.prepare('SELECT rol, nombre_visible FROM usuarios WHERE id = ?').get(id);
      if (cuenta?.rol === 'usuario' && cuenta.nombre_visible !== legal.completo) {
        db.prepare('UPDATE usuarios SET nombre_visible = ? WHERE id = ?').run(legal.completo, id);
        auditar(db, { usuarioId: id, accion: 'nombre_visible_cambiado', detalle: legal.completo });
      }
    }
    // La fecha de nacimiento firmada no cambia sola (si está mal, la corrige el administrador).
    const nacAntes = nacimientoGuardado(db, id);
    if (nacAntes && nacAntes !== nac.nacimiento) throw new ErrorHttp(409, 'nacimiento_fijo');
    const firmas = firmasDe(db, id);
    if (!firmas.some(f => f.version === actual && (f.versionPrivacidad ?? 1) === actualPrivacidad)) {
      escribir(db, `cuenta.nacimiento.${id}`, nac.nacimiento);
      escribir(db, `cuenta.menor.${id}`, nac.menor ? '1' : '0');
      escribir(db, `cuenta.consentimiento_ia.${id}`, aceptoIa ? '1' : '0');
      const u = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(id);
      const n = (firmas.at(-1)?.n ?? 0) + 1;
      const huellaFirma = sha256(png);
      // El PNG: en la carpeta privada (nunca se pisa ni se borra) y una copia en la base (va en las copias cifradas).
      const archivo = `${id}-f${n}-${huellaFirma.slice(0, 16)}.png`;
      guardarPng(db, config, png, archivo, `cuenta.firma.${id}.${n}`);
      let tutorFirma = null;
      if (tutorDatos) {
        const h = sha256(pngTutor);
        const a = `${id}-f${n}-tutor-${h.slice(0, 16)}.png`;
        guardarPng(db, config, pngTutor, a, `cuenta.firma_tutor.${id}.${n}`);
        tutorFirma = { ...tutorDatos, firmaSha256: h, archivo: a };
      }
      firmas.push({
        n, version: actual, versionPrivacidad: actualPrivacidad, firmado: legal.completo, en: ahora(), usuario: u?.nombre ?? null, usuarioId: id,
        nacimiento: nac.nacimiento, menor: nac.menor, aceptoIa,
        textoSha256: huellaTexto(docVersion(db, 'terminos', actual)), privacidadSha256: huellaSecciones(docVersion(db, 'privacidad', actualPrivacidad)),
        firmaSha256: huellaFirma, archivo, tutor: tutorFirma,
        ip: ip ? String(ip).slice(0, 80) : null, navegador: navegador ? String(navegador).slice(0, 300) : null,
      });
      escribir(db, `cuenta.terminos.${id}`, JSON.stringify(firmas));
      auditar(db, { usuarioId: id, accion: 'terminos_aceptados', detalle: `v${actual}/p${actualPrivacidad}: ${legal.completo} (firma ${huellaFirma.slice(0, 12)})${nac.menor ? ' con tutor' : ''}` });
    }
    return estadoTerminos(db, id);
  });
}

// ---------- Los contratos firmados ----------
// Cada firma queda para siempre (aunque la cuenta se bloquee o el texto cambie). n = el número de firma de esa persona.
export function contratos(db) {
  const lista = [];
  for (const f of db.prepare("SELECT clave FROM ajustes WHERE clave LIKE 'cuenta.terminos.%'").all()) {
    const usuarioId = Number(f.clave.slice('cuenta.terminos.'.length));
    if (!Number.isSafeInteger(usuarioId)) continue;
    const u = db.prepare('SELECT nombre, activo FROM usuarios WHERE id = ?').get(usuarioId);
    for (const x of firmasDe(db, usuarioId)) {
      lista.push({ usuarioId, n: x.n, version: x.version, versionPrivacidad: x.versionPrivacidad ?? null, firmado: x.firmado, usuario: u?.nombre ?? x.usuario ?? null,
        bloqueado: u ? u.activo !== 1 : null, en: x.en, conFirma: Boolean(x.firmaSha256), menor: x.menor === true });
    }
  }
  return lista.sort((a, b) => b.en.localeCompare(a.en));
}
export function pngDeFirma(db, config, usuarioId, n, { tutor = false } = {}) {
  const x = firmasDe(db, usuarioId).find(f => f.n === Number(n));
  const datos = tutor ? x?.tutor : x;
  if (!datos?.firmaSha256) return null;
  let png = null;
  try { if (datos.archivo && /^[0-9]+-[fv][0-9]+-(?:tutor-)?[0-9a-f]{16}\.png$/.test(datos.archivo)) png = readFileSync(join(carpetaFirmas(config), datos.archivo)); } catch { png = null; }
  if (!png || sha256(png) !== datos.firmaSha256) {
    const copia = leer(db, `cuenta.${tutor ? 'firma_tutor' : 'firma'}.${Number(usuarioId)}.${Number(n)}`) ?? (tutor ? null : leer(db, `cuenta.firma.${Number(usuarioId)}.v${x.version}`));
    png = copia ? Buffer.from(copia, 'base64') : null;
  }
  return png && sha256(png) === datos.firmaSha256 ? png : null;
}
export function contrato(db, config, usuarioId, n) {
  const x = firmasDe(db, usuarioId).find(f => f.n === Number(n));
  if (!x) throw new ErrorHttp(404, 'no_existe');
  const terminos = docVersion(db, 'terminos', x.version);
  const privacidad = x.versionPrivacidad ? docVersion(db, 'privacidad', x.versionPrivacidad) : null;
  const u = db.prepare('SELECT nombre, activo FROM usuarios WHERE id = ?').get(Number(usuarioId));
  return {
    usuarioId: Number(usuarioId), n: x.n, usuario: u?.nombre ?? x.usuario ?? null, bloqueado: u ? u.activo !== 1 : null,
    version: x.version, versionPrivacidad: x.versionPrivacidad ?? null, firmado: x.firmado, en: x.en, ip: x.ip ?? null, navegador: x.navegador ?? null,
    nacimiento: x.nacimiento ?? null, menor: x.menor === true, aceptoIa: x.aceptoIa ?? null,
    textoSha256: x.textoSha256 ?? null, privacidadSha256: x.privacidadSha256 ?? null, firmaSha256: x.firmaSha256 ?? null,
    textoVerificado: x.textoSha256 ? huellaTexto(terminos) === x.textoSha256 : null,
    privacidadVerificada: x.privacidadSha256 && privacidad ? huellaSecciones(privacidad) === x.privacidadSha256 : null,
    firmaVerificada: x.firmaSha256 ? Boolean(pngDeFirma(db, config, usuarioId, x.n)) : null,
    tutor: x.tutor ? { nombre: x.tutor.nombre, relacion: x.tutor.relacion, contacto: x.tutor.contacto, firmaSha256: x.tutor.firmaSha256, firmaVerificada: Boolean(pngDeFirma(db, config, usuarioId, x.n, { tutor: true })) } : null,
    verificacion: verificacionDe(db, usuarioId),
    terminos, privacidad, declaracion: DECLARACION,
  };
}
