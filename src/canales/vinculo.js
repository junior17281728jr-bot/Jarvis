// Las reglas PURAS del código de un uso que une un chat de Telegram (lo usan unir el chat del dueño, parte e paso 2,
// y la búsqueda del chat al restaurar en un servidor nuevo, src/copias/restaurar.js).
//  - 8 cifras al azar («4821 7730»): fáciles de escribir en el iPhone. Solo se guarda su huella (sha256).
//  - Un mensaje une el chat SOLO si: es un chat privado, no lo manda un bot, llegó después de crear el código (5 s de
//    margen) y su texto, sin un «/start» delante, sin espacios ni guiones, es exactamente el código. Lo demás se
//    ignora (y a un extraño nunca se le contesta). Un código de 8 cifras equivocado cuenta como intento.
//  - Ronda 2 del equipo rojo: los intentos se cuentan POR CHAT (5 por chat: después, ese chat se ignora, aunque mande el
//    código bueno) y en total (50 por código: con 10^8 códigos, adivinar sigue siendo imposible). Así un extraño que conoce
//    el @usuario del bot nunca deja al dueño sin poder unir su chat (ni sin restaurar). El código vence a los 10 min, al
//    pedir otro, o al llegar a los 50.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const INTENTOS_MAXIMOS = 5; // por chat
export const INTENTOS_TOTALES = 50; // por código, de todos los chats juntos
export const VIGENCIA_MS = 10 * 60_000;

export function crearCodigo() {
  return String(randomInt(0, 100_000_000)).padStart(8, '0');
}

export function huellaCodigo(codigo) {
  return createHash('sha256').update(`oportia-vinculo-v1|${codigo}`).digest('hex');
}

export const codigoParaMostrar = codigo => `${codigo.slice(0, 4)} ${codigo.slice(4)}`;

// El texto de un mensaje → 8 cifras, o null.
export function cifrasDelTexto(texto) {
  if (typeof texto !== 'string') return null;
  const limpio = texto.trim().replace(/^\/start(?:@[A-Za-z0-9_]{1,64})?/i, '').replace(/[\s-]/g, '');
  return /^\d{8}$/.test(limpio) ? limpio : null;
}

// m: un mensaje como lo entrega el adaptador (recibir). → 'coincide' | 'intento' (8 cifras equivocadas) | 'ignorar'
export function mensajeConCodigo(m, { huella, desdeMs }) {
  if (!m || !m.chat || m.chat.tipo !== 'private' || !m.de || m.de.esBot) return 'ignorar';
  if (!Number.isSafeInteger(m.fecha) || m.fecha * 1000 < desdeMs - 5000) return 'ignorar';
  const cifras = cifrasDelTexto(m.texto);
  if (!cifras) return 'ignorar';
  const a = Buffer.from(huellaCodigo(cifras), 'hex');
  const b = Buffer.from(String(huella ?? ''), 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? 'coincide' : 'intento';
}

// Revisa un lote de mensajes contra el código, contando los intentos por chat y en total. Pura (no cambia «cuenta»).
// cuenta: { total, porChat: { [chat]: n } } (lo de antes). → { encontrado, cuenta (la nueva), vencido }
export function revisarLote(mensajes, { huella, desdeMs, cuenta = { total: 0, porChat: {} } }) {
  const porChat = { ...(cuenta?.porChat ?? {}) };
  let total = Number(cuenta?.total) || 0;
  for (const m of mensajes ?? []) {
    if (total >= INTENTOS_TOTALES) break;
    const v = mensajeConCodigo(m, { huella, desdeMs });
    if (v === 'ignorar') continue;
    const chat = String(m.chat.id);
    if ((porChat[chat] ?? 0) >= INTENTOS_MAXIMOS) continue; // ese chat ya gastó sus intentos: se ignora
    if (v === 'coincide') return { encontrado: m, cuenta: { total, porChat }, vencido: false };
    porChat[chat] = (porChat[chat] ?? 0) + 1;
    total += 1;
  }
  return { encontrado: null, cuenta: { total, porChat }, vencido: total >= INTENTOS_TOTALES };
}

// La cuenta guardada (canales.codigo_intentos_chats, JSON) → { total, porChat }. Nunca lanza.
export function leerCuenta(total, texto) {
  let porChat = {};
  try {
    const v = JSON.parse(texto ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, n] of Object.entries(v).slice(0, 200)) if (/^-?\d{1,20}$/.test(k) && Number.isSafeInteger(n) && n > 0) porChat[k] = Math.min(n, INTENTOS_MAXIMOS);
    }
  } catch { porChat = {}; }
  return { total: Number(total) || 0, porChat };
}

// Lo que se guarda: solo los chats con intentos (como mucho 200: el total de 50 ya pone el tope).
export function textoCuenta(cuenta) {
  return JSON.stringify(Object.fromEntries(Object.entries(cuenta?.porChat ?? {}).slice(0, 200)));
}
