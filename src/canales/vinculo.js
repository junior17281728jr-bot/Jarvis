// Las reglas PURAS del código de un uso que une un chat de Telegram (lo usan unir el chat del dueño, parte e paso 2,
// y la búsqueda del chat al restaurar en un servidor nuevo, src/copias/restaurar.js).
//  - 8 cifras al azar («4821 7730»): fáciles de escribir en el iPhone. Solo se guarda su huella (sha256).
//  - Un mensaje une el chat SOLO si: es un chat privado, no lo manda un bot, llegó después de crear el código (5 s de
//    margen) y su texto, sin un «/start» delante, sin espacios ni guiones, es exactamente el código. Lo demás se
//    ignora (y a un extraño nunca se le contesta). Un código de 8 cifras equivocado cuenta como intento (5 → vencido).
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const INTENTOS_MAXIMOS = 5;
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
