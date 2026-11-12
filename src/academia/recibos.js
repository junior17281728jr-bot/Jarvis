// Academia 0.11.0: la IMAGEN de un comprobante de pago se borra 30 días después de que el administrador lo aprobó o lo
// rechazó (lo promete el Aviso de privacidad; la imagen tiene datos del banco). El REGISTRO del pago queda para siempre
// (fecha, monto, minutos, estado): solo su «archivo» pasa a «borrado-…» y la imagen deja de servirse.
// Es la ÚNICA excepción a «el programa nunca borra archivos» (test/reglas.test.js la conoce): solo toca archivos de
// academia/pagos con el nombre exacto que puso subirRecibo, y nunca el progreso de nadie.
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaPagos } from './tiempo-ia.js';

export const DIAS_RECIBO = 30;
const NOMBRE = /^[0-9]+-[0-9]+-[a-f0-9]{12}\.(?:jpg|png|webp)$/;

// → los pagos cuya imagen ya venció (hasta 200 por vuelta).
export function recibosVencidos(db, ahoraMs = Date.now()) {
  const limite = new Date(ahoraMs - DIAS_RECIBO * 24 * 3600 * 1000).toISOString();
  return db.prepare(`SELECT id, archivo FROM academia_pagos WHERE estado IN ('aprobado', 'rechazado') AND revisado_en IS NOT NULL AND revisado_en <= ?
    AND archivo NOT LIKE 'borrado-%' ORDER BY id LIMIT 200`).all(limite).filter(f => NOMBRE.test(f.archivo));
}

// Borra las imágenes vencidas y anota cada pago como «borrado-…». escribir: la forma de escribir del que llama
// (el trabajador usa ctx.escribir). → cuántas.
export async function borrarRecibosVencidos(db, config, { ahoraMs = Date.now(), escribir = fn => fn() } = {}) {
  let n = 0;
  for (const f of recibosVencidos(db, ahoraMs)) {
    try { unlinkSync(join(carpetaPagos(config), f.archivo)); } catch (error) { if (error?.code !== 'ENOENT') continue; }
    await escribir(() => db.prepare("UPDATE academia_pagos SET archivo = ? WHERE id = ? AND archivo = ?").run(`borrado-${f.archivo}`, f.id, f.archivo));
    n += 1;
  }
  return n;
}
