// 0.14.70: la «voz natural» de la academia con DOS proveedores (ElevenLabs y ChatGPT) y los audios guardados para siempre.
// Lo usan los dos procesos (solo lee y escribe «ajustes» y la carpeta de la voz; nunca la red: la llamada a ElevenLabs es
// src/academia/voz-eleven.js, solo del trabajador).
//  - Cada audio hecho se guarda en la carpeta de la voz (academia/voz-oral, la misma de la 0.14.29) por la huella de
//    proveedor + modelo + voz + ajustes + texto. Una vez hecho, lo oyen gratis todos los alumnos, para siempre: aunque se
//    acabe el crédito de ElevenLabs, se quite su clave o se cambie la voz (cada voz usada queda anotada en «variantes»).
//  - El orden (el mismo en todas partes): 1) uno ya guardado (la voz elegida de ElevenLabs, otra voz de ElevenLabs que se
//    usó antes, o el de ChatGPT); 2) uno nuevo con ElevenLabs (clave lista, con crédito y con lugar en su tope del mes);
//    3) uno nuevo con ChatGPT (si el alumno tiene IA y cabe en sus topes); 4) la voz del teléfono (siempre funciona). El
//    dueño puede poner ChatGPT antes que ElevenLabs («primero»).
//  - El tope de ElevenLabs es de LETRAS por mes (lo que ElevenLabs cobra): antes de cada llamada se APARTAN sus letras en
//    la misma escritura que mira el tope, así nunca se pasa (aunque haya dos trabajos a la vez). Si el proveedor dijo que
//    no (un error claro, sin leer), las letras se devuelven; si no se sabe (se cortó), quedan contadas.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enTransaccion } from '../nucleo/db.js';
import { mesCobro } from '../tareas/tiempo.js';
import { estadoLlave } from '../claves/cifrado.js';
import { secretoUsable, pausaVigente } from '../claves/almacen.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { carpetaVoz, archivoVoz, esMp3, ARCHIVO_VOZ } from './oral-voz.js';
import { VOCES_ELEVENLABS, MODELOS_ELEVENLABS, AJUSTES_VOZ, FORMATO_ELEVENLABS, ID_VOZ } from '../ia/proveedores/elevenlabs.js';

export const USO_ELEVENLABS = 'voz_elevenlabs';
export const AVISO_ELEVENLABS = 'ia_proveedor:elevenlabs';
const AJUSTE = Object.freeze({ config: 'vozn.config', variantes: 'vozn.variantes', credito: 'vozn.credito', total: 'vozn.total', mes: m => `vozn.mes.${m}` });
// Llega lista para cuando el dueño pegue su clave: George, multilingüe, 10 000 letras al mes (lo del plan gratis).
export const CONFIG_VOZ_POR_DEFECTO = Object.freeze({ usar: true, vozId: VOCES_ELEVENLABS[0].id, modelo: MODELOS_ELEVENLABS[0], topeMes: 10_000, primero: 'elevenlabs' });
export const TOPE_MES_MAX = 100_000_000;
// La foto del crédito de ElevenLabs se pide como mucho una vez por hora.
export const CREDITO_CADA_MS = 3_600_000;
const iso = ms => new Date(ms).toISOString();
const leerJson = (db, clave) => { try { return JSON.parse(leerAjuste(db, clave) ?? 'null'); } catch { return null; } };

export function leerConfigVoz(db) {
  const g = leerJson(db, AJUSTE.config) ?? {};
  return {
    usar: typeof g.usar === 'boolean' ? g.usar : CONFIG_VOZ_POR_DEFECTO.usar,
    vozId: ID_VOZ.test(String(g.vozId ?? '')) ? g.vozId : CONFIG_VOZ_POR_DEFECTO.vozId,
    modelo: MODELOS_ELEVENLABS.includes(g.modelo) ? g.modelo : CONFIG_VOZ_POR_DEFECTO.modelo,
    topeMes: Number.isSafeInteger(g.topeMes) && g.topeMes >= 0 && g.topeMes <= TOPE_MES_MAX ? g.topeMes : CONFIG_VOZ_POR_DEFECTO.topeMes,
    primero: g.primero === 'chatgpt' ? 'chatgpt' : 'elevenlabs',
  };
}
// Lo cambia el dueño (Claves e IA → ElevenLabs). Lanza { clave: 'datos_no_validos' } si algo no sirve.
export function guardarConfigVoz(db, cambios) {
  const actual = leerConfigVoz(db);
  const nuevo = { ...actual };
  const mal = () => { const e = new Error('datos_no_validos'); e.clave = 'datos_no_validos'; e.codigo = 400; throw e; };
  if (cambios.usar !== undefined) { if (typeof cambios.usar !== 'boolean') mal(); nuevo.usar = cambios.usar; }
  if (cambios.vozId !== undefined) { if (!ID_VOZ.test(String(cambios.vozId))) mal(); nuevo.vozId = String(cambios.vozId); }
  if (cambios.modelo !== undefined) { if (!MODELOS_ELEVENLABS.includes(cambios.modelo)) mal(); nuevo.modelo = cambios.modelo; }
  if (cambios.topeMes !== undefined) { if (!Number.isSafeInteger(cambios.topeMes) || cambios.topeMes < 0 || cambios.topeMes > TOPE_MES_MAX) mal(); nuevo.topeMes = cambios.topeMes; }
  if (cambios.primero !== undefined) { if (!['elevenlabs', 'chatgpt'].includes(cambios.primero)) mal(); nuevo.primero = cambios.primero; }
  enTransaccion(db, () => {
    guardarAjuste(db, AJUSTE.config, JSON.stringify(nuevo));
    anotarVariante(db, varianteDe(nuevo));
  });
  return nuevo;
}

// ---------- Los archivos ----------
// La «variante» de ElevenLabs: todo lo que cambia el sonido (va en el nombre del archivo).
const huellaAjustes = createHash('sha256').update(JSON.stringify(AJUSTES_VOZ)).digest('hex').slice(0, 8);
export const varianteDe = cfg => `elevenlabs|${cfg.modelo}|${cfg.vozId}|${huellaAjustes}|${FORMATO_ELEVENLABS}`;
export const archivoEleven = (variante, texto) => `${createHash('sha256').update(`${variante}|${String(texto ?? '')}`).digest('hex').slice(0, 32)}.mp3`;
export function variantesUsadas(db) {
  const v = leerJson(db, AJUSTE.variantes);
  return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.startsWith('elevenlabs|') && x.length < 200) : [];
}
// Nunca se borra una: así un audio hecho con otra voz se sigue encontrando.
export function anotarVariante(db, variante) {
  const v = variantesUsadas(db);
  if (v.includes(variante)) return false;
  guardarAjuste(db, AJUSTE.variantes, JSON.stringify([...v, variante].slice(-200)));
  return true;
}
const hay = (config, archivo) => ARCHIVO_VOZ.test(archivo) && existsSync(join(carpetaVoz(config), archivo));

// El audio ya guardado para este texto (el de cualquier proveedor), en el orden de arriba. crudo: el texto como venía
// antes de limpiarlo (los audios de ChatGPT de la 0.14.29 se guardaron con él). → { archivo, proveedor } o null.
export function buscarGuardada(db, config, { texto, crudo = null }) {
  const cfg = leerConfigVoz(db);
  const actual = varianteDe(cfg);
  const eleven = [actual, ...variantesUsadas(db).filter(v => v !== actual).reverse()].map(v => ({ archivo: archivoEleven(v, texto), proveedor: 'elevenlabs' }));
  const chatgpt = [...new Set([archivoVoz(texto), ...(crudo && crudo !== texto ? [archivoVoz(crudo)] : [])])].map(archivo => ({ archivo, proveedor: 'openai' }));
  const orden = cfg.primero === 'chatgpt' ? [...chatgpt, ...eleven] : [eleven[0], ...chatgpt, ...eleven.slice(1)];
  return orden.find(x => hay(config, x.archivo)) ?? null;
}

// Lo mismo que buscarGuardada, para MUCHOS textos de una vez (la estimación y «Preparar»): lee la carpeta una vez.
export function crearBuscador(db, config) {
  const cfg = leerConfigVoz(db);
  const actual = varianteDe(cfg);
  const variantes = [actual, ...variantesUsadas(db).filter(v => v !== actual).reverse()];
  let hay = new Set();
  try { hay = new Set(readdirSync(carpetaVoz(config)).filter(n => ARCHIVO_VOZ.test(n))); } catch { /* todavía no hay carpeta */ }
  return texto => {
    if (hay.has(archivoVoz(texto))) return true;
    return variantes.some(v => hay.has(archivoEleven(v, texto)));
  };
}

// Guarda un mp3 (escribe «.part» y lo renombra: un archivo a medias nunca se ve). Si ya existe, no lo pisa.
export function guardarAudio(config, archivo, buf) {
  if (!ARCHIVO_VOZ.test(archivo) || !esMp3(buf)) { const e = new Error('no_se_pudo_guardar'); e.clave = 'no_se_pudo_guardar'; throw e; }
  const carpeta = carpetaVoz(config);
  mkdirSync(carpeta, { recursive: true });
  const final = join(carpeta, archivo);
  if (existsSync(final)) return { archivo, bytes: statSync(final).size, ya: true };
  const parcial = join(carpeta, `${archivo}.part`);
  writeFileSync(parcial, buf);
  renameSync(parcial, final);
  return { archivo, bytes: buf.length, ya: false };
}

// «Voces guardadas: N, X MB» (se cuenta como mucho una vez por minuto).
let cuenta = { en: 0, carpeta: null, valor: null };
export function vocesGuardadas(config, { ahora = Date.now() } = {}) {
  const carpeta = carpetaVoz(config);
  if (cuenta.carpeta === carpeta && cuenta.valor && ahora - cuenta.en < 60_000) return cuenta.valor;
  let n = 0;
  let bytes = 0;
  try {
    for (const nombre of readdirSync(carpeta)) {
      if (!ARCHIVO_VOZ.test(nombre)) continue;
      try { bytes += statSync(join(carpeta, nombre)).size; n += 1; } catch { /* se movió */ }
    }
  } catch { /* todavía no hay carpeta */ }
  cuenta = { en: ahora, carpeta, valor: { n, bytes } };
  return cuenta.valor;
}
export function olvidarCuenta() { cuenta = { en: 0, carpeta: null, valor: null }; }

// ---------- El tope de letras ----------
export function gastoVoz(db, { ahora = Date.now() } = {}) {
  const g = leerJson(db, AJUSTE.mes(mesCobro(ahora)));
  return { mes: mesCobro(ahora), usados: Number.isSafeInteger(g?.usados) && g.usados >= 0 ? g.usados : 0, audios: Number.isSafeInteger(g?.audios) ? g.audios : 0 };
}
const totalVoz = db => { const t = leerJson(db, AJUSTE.total); return Number.isSafeInteger(t?.letras) && t.letras >= 0 ? t.letras : 0; };

// La foto del crédito: { usados, limite, reinicio, en, nuestras } (nuestras: las letras que ya llevábamos al tomarla).
export function leerCredito(db) {
  const c = leerJson(db, AJUSTE.credito);
  return c && typeof c === 'object' ? c : null;
}
export function guardarCredito(db, credito, { ahora = Date.now() } = {}) {
  const c = credito && Number.isSafeInteger(credito.usados) && Number.isSafeInteger(credito.limite)
    ? { usados: credito.usados, limite: credito.limite, reinicio: credito.reinicio ?? null, conocido: true }
    : { conocido: false };
  guardarAjuste(db, AJUSTE.credito, JSON.stringify({ ...c, en: iso(ahora), nuestras: totalVoz(db) }));
}
// Lo que le queda de crédito (lo de la foto menos lo que gastamos desde entonces), o null si no se sabe. Una foto de
// antes de que ElevenLabs renueve las letras, o de hace más de 6 horas, ya no dice nada: decide la llamada de verdad
// (así una foto vieja «sin crédito» nunca deja a ElevenLabs parado para siempre).
export const CREDITO_VALE_MS = 6 * 3_600_000;
export function creditoQueQueda(db, { ahora = Date.now() } = {}) {
  const c = leerCredito(db);
  if (!c?.conocido) return null;
  if (c.reinicio && Date.parse(c.reinicio) <= ahora) return null;
  if (!c.en || !(ahora - Date.parse(c.en) < CREDITO_VALE_MS)) return null;
  const desde = Math.max(0, totalVoz(db) - (Number.isSafeInteger(c.nuestras) ? c.nuestras : 0));
  return Math.max(0, c.limite - c.usados - desde);
}

// Aparta las letras de UNA llamada (en una transacción: mirar y apartar van juntos). → { ok, motivo? }
export function apartarLetras(db, { letras, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const cfg = leerConfigVoz(db);
    const g = gastoVoz(db, { ahora });
    if (!(Number.isSafeInteger(letras) && letras > 0)) return { ok: false, motivo: 'pedido_no_valido' };
    if (g.usados + letras > cfg.topeMes) return { ok: false, motivo: 'tope_voz' };
    const queda = creditoQueQueda(db, { ahora });
    if (queda != null && queda < letras) return { ok: false, motivo: 'sin_credito' };
    guardarAjuste(db, AJUSTE.mes(g.mes), JSON.stringify({ usados: g.usados + letras, audios: g.audios + 1 }));
    guardarAjuste(db, AJUSTE.total, JSON.stringify({ letras: totalVoz(db) + letras }));
    return { ok: true, mes: g.mes };
  });
}
// Un error claro (el proveedor no las leyó): se devuelven. Nunca baja de 0.
export function devolverLetras(db, { letras, mes }) {
  return enTransaccion(db, () => {
    const g = leerJson(db, AJUSTE.mes(mes));
    const usados = Number.isSafeInteger(g?.usados) ? g.usados : 0;
    const audios = Number.isSafeInteger(g?.audios) ? g.audios : 0;
    guardarAjuste(db, AJUSTE.mes(mes), JSON.stringify({ usados: Math.max(0, usados - letras), audios: Math.max(0, audios - 1) }));
    guardarAjuste(db, AJUSTE.total, JSON.stringify({ letras: Math.max(0, totalVoz(db) - letras) }));
  });
}

// ---------- El estado de ElevenLabs ----------
export function filaEleven(db) {
  return db.prepare("SELECT * FROM secretos WHERE uso = ? AND espacio_id IS NULL AND estado = 'activa' ORDER BY id DESC LIMIT 1").get(USO_ELEVENLABS) ?? null;
}
// → { estado: 'sin_clave' | 'lista' | 'sin_credito' | 'en_pausa' | 'apagada' | 'tope_lleno', motivo, hasta }
export function estadoEleven(db, config, { ahora = Date.now() } = {}) {
  const fila = filaEleven(db);
  if (!fila) return { estado: 'sin_clave', motivo: 'sin_clave', hasta: null };
  const cfg = leerConfigVoz(db);
  const llave = config ? estadoLlave(config) : { listo: false };
  const u = secretoUsable(fila, ahora, llave.listo ? llave.huella : null);
  if (!u.si) {
    const pausa = pausaVigente(fila, ahora);
    if (pausa?.motivo === 'sin_credito') return { estado: 'sin_credito', motivo: 'sin_credito', hasta: pausa.hasta ?? null };
    if (pausa) return { estado: 'en_pausa', motivo: pausa.motivo, hasta: pausa.hasta ?? null };
    return { estado: u.motivo === 'sin_clave' ? 'sin_clave' : 'en_pausa', motivo: u.motivo, hasta: null };
  }
  if (!cfg.usar) return { estado: 'apagada', motivo: 'proveedor_no_usado', hasta: null };
  const queda = creditoQueQueda(db, { ahora });
  if (queda === 0) return { estado: 'sin_credito', motivo: 'sin_credito', hasta: null };
  if (gastoVoz(db, { ahora }).usados >= cfg.topeMes) return { estado: 'tope_lleno', motivo: 'tope_voz', hasta: null };
  return { estado: 'lista', motivo: null, hasta: null };
}
// ¿Se puede pedir uno nuevo de estas letras a ElevenLabs ahora? (sin escribir nada)
export function elevenPuede(db, config, { letras, ahora = Date.now() }) {
  if (estadoEleven(db, config, { ahora }).estado !== 'lista') return false;
  const queda = creditoQueQueda(db, { ahora });
  return gastoVoz(db, { ahora }).usados + letras <= leerConfigVoz(db).topeMes && (queda == null || queda >= letras);
}

// Lo que ve el dueño (nunca la clave).
export function vistaVozAdmin(db, config, { ahora = Date.now() } = {}) {
  const cfg = leerConfigVoz(db);
  const g = gastoVoz(db, { ahora });
  const c = leerCredito(db);
  return {
    config: cfg, estado: estadoEleven(db, config, { ahora }), mes: { mes: g.mes, usados: g.usados, audios: g.audios, tope: cfg.topeMes },
    credito: c?.conocido && creditoQueQueda(db, { ahora }) != null ? { usados: c.usados, limite: c.limite, queda: creditoQueQueda(db, { ahora }), reinicio: c.reinicio ?? null, en: c.en ?? null } : { desconocido: true, en: c?.en ?? null },
    guardadas: vocesGuardadas(config, { ahora }), voces: VOCES_ELEVENLABS, modelos: MODELOS_ELEVENLABS,
  };
}

// La preferencia del alumno: «Con voz / Sin voz» (se guarda en el servidor, como el humor). Por defecto, sin voz.
const claveAlumno = id => `vozn.alumno.${Number(id)}`;
export const vozDelAlumno = (db, usuarioId) => leerAjuste(db, claveAlumno(usuarioId)) === '1';
export function ponerVozDelAlumno(db, usuarioId, si) {
  if (typeof si !== 'boolean') { const e = new Error('datos_no_validos'); e.clave = 'datos_no_validos'; throw e; }
  guardarAjuste(db, claveAlumno(usuarioId), si ? '1' : '0');
  return si;
}
