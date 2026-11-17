// 0.14.33: lo pidió el dueño («déjalo todo funcionando sin tener que hacer nada»): UNA sola vez, al instalar esta versión,
// «Mejorar todo con Claude» queda con tope US$300 y el tope general del mes con US$375 (la fábrica deja libre el 20 % del
// mes para los alumnos: 375 × 0,8 = 300). Solo SUBE (nunca baja lo que el dueño ya puso más alto) y nunca se repite: una
// marca en «ajustes» lo recuerda, así que si después el dueño lo cambia en la pantalla, se respeta.
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { leerConfigFabrica, guardarConfigFabrica } from './fabrica.js';
import { topeTodoMicro, AJUSTE_TODO_TOPE } from './fabrica-profunda.js';
import { leerConfigIa, guardarConfigIa } from '../ia/config.js';

export const MARCA_TOPES = 'ajuste.una_vez.topes_300';
export const TOPE_PROFUNDA_MICRO = 300_000_000;
export const TOPE_MES_MICRO = 375_000_000;

export function topesUnaVez(db, { config, ahora = Date.now() } = {}) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ajustes'").get()) return { hecho: false, motivo: 'sin_ajustes' };
  if (leerAjuste(db, MARCA_TOPES)) return { hecho: false, motivo: 'ya' };
  const cambios = {};
  try {
    const ia = leerConfigIa(db);
    if ((ia.topeGeneralMicro ?? 0) < TOPE_MES_MICRO) {
      guardarConfigIa(db, { topeGeneralMicro: TOPE_MES_MICRO }, { config, origen: 'automatico', ahora });
      cambios.mes = TOPE_MES_MICRO;
    }
  } catch (e) {
    // Si la IA todavía no está lista para guardar (falta algo), se intenta en la próxima vuelta: sin marca.
    return { hecho: false, motivo: e?.clave ?? 'no_se_pudo' };
  }
  const fab = leerConfigFabrica(db);
  if ((fab.profunda?.topeMicro ?? 0) < TOPE_PROFUNDA_MICRO) {
    guardarConfigFabrica(db, { profunda: { topeMicro: TOPE_PROFUNDA_MICRO } });
    cambios.profunda = TOPE_PROFUNDA_MICRO;
  }
  const todo = topeTodoMicro(db);
  if (todo != null && todo < TOPE_PROFUNDA_MICRO) {
    guardarAjuste(db, AJUSTE_TODO_TOPE, String(TOPE_PROFUNDA_MICRO));
    cambios.todo = TOPE_PROFUNDA_MICRO;
  }
  guardarAjuste(db, MARCA_TOPES, JSON.stringify({ en: new Date(ahora).toISOString(), cambios }));
  return { hecho: true, cambios };
}
