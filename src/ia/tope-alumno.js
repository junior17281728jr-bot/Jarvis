// 0.12.8 (pedido del dueño): el tope US$ de cada mes de la cuenta de un ALUMNO, con la IA por plan.
//  - En modo «planes», el tope de su cuenta sale SOLO de lo que tiene ahora: su plan vigente (presupuesto de IA del plan:
//    IA Estándar US$4, IA Plus US$8) o, si no, el de la prueba gratis (US$1; también para quien todavía no tiene nada, así
//    puede comprar: sin plan ni prueba no se le cobra ningún uso igual). Con minutos de antes, el mayor entre ese y el tope
//    del plan de su cuenta (lo de siempre). Así nadie que pagó se queda cortado antes de sus usos.
//  - El administrador puede poner un «tope personal» (manda sobre lo de arriba) o PAUSAR la IA de ese alumno (tope 0).
//  - En modo «minutos» (el de antes), el tope de siempre (el del plan de la cuenta), salvo el tope personal o la pausa.
//  - El tope general del dueño sigue mandando siempre (src/ia/presupuesto.js lo mira antes).
// Solo LEE la base (corre también en el trabajador, dentro de la transacción de quien pregunta) y no importa nada de
// src/academia/ (los valores se leen de «ajustes» tal cual los guarda src/academia/tiempo-ia.js).
export const CLAVE_PAGOS = 'academia.pagos.config';
export const PRESUPUESTOS_POR_DEFECTO = Object.freeze({ estandar: '4', plus: '8', prueba: '1' });
export const clavePausa = id => `academia.ia.pausa.${Number(id)}`;
export const claveTopePersonal = id => `academia.ia.tope.${Number(id)}`;
const USD = /^\d{1,2}(?:\.\d{1,2})?$/;
export const TOPE_ALUMNO_MAX_MICRO = 20_000_000; // como el tope de un plan de cuenta (LIMITES_IA.topePlanMaxMicro)

const leer = (db, clave) => {
  try {
    const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? 'null');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
};
export const usdAMicro = usd => (USD.test(String(usd ?? '')) ? Math.min(TOPE_ALUMNO_MAX_MICRO, Math.round(Number(usd) * 100) * 10_000) : null);

// Los presupuestos de IA por plan, como los guarda el administrador (o los de por defecto).
export function presupuestosDe(cfgPagos) {
  const x = cfgPagos?.presupuestos ?? {};
  return Object.fromEntries(Object.entries(PRESUPUESTOS_POR_DEFECTO).map(([k, d]) => [k, USD.test(String(x[k] ?? '')) ? String(x[k]) : d]));
}

// El alumno dueño de esa cuenta (o null si la cuenta es del administrador o no tiene dueño).
function alumnoDe(db, espacioId) {
  const f = db.prepare(`SELECT u.id, u.rol FROM miembros m JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.espacio_id = ? AND m.rol = 'dueno' ORDER BY m.usuario_id LIMIT 1`).get(Number(espacioId));
  return f && f.rol !== 'admin' ? f.id : null;
}

export const pausaDe = (db, usuarioId) => leer(db, clavePausa(usuarioId))?.pausada === true;
export function topePersonalDe(db, usuarioId) {
  const v = leer(db, claveTopePersonal(usuarioId));
  return v ? usdAMicro(v.usd) : null;
}

// → { topeMicro, fuente } para la cuenta de un alumno, o null si no se cambia nada (la cuenta del administrador, o modo
// minutos sin tope personal ni pausa). cuentaMicro: el tope del plan de su cuenta (lo de siempre).
export function topeDeAlumnoMicro(db, espacioId, cuentaMicro, ahora = Date.now()) {
  const usuarioId = alumnoDe(db, espacioId);
  if (usuarioId == null) return null;
  if (pausaDe(db, usuarioId)) return { topeMicro: 0, fuente: 'pausa', usuarioId };
  const personal = topePersonalDe(db, usuarioId);
  if (personal != null) return { topeMicro: personal, fuente: 'personal', usuarioId };
  const cfg = leer(db, CLAVE_PAGOS);
  if (cfg?.modo === 'minutos') return null;
  const p = presupuestosDe(cfg);
  const plan = leer(db, `academia.ia.plan.${Number(usuarioId)}`);
  if (plan && Date.parse(plan.hasta) > ahora && Object.hasOwn(p, plan.plan) && plan.plan !== 'prueba') return { topeMicro: usdAMicro(p[plan.plan]), fuente: 'plan', usuarioId };
  const prueba = usdAMicro(p.prueba);
  const minutos = db.prepare(`SELECT COALESCE(SUM(minutos), 0) AS n FROM academia_ia_minutos WHERE usuario_id = ?
    AND motivo NOT IN ('uso_plan', 'devolucion_plan', 'uso_prueba', 'devolucion_prueba')`).get(usuarioId).n;
  if (minutos > 0) return { topeMicro: Math.max(prueba, cuentaMicro ?? 0), fuente: 'minutos', usuarioId };
  return { topeMicro: prueba, fuente: 'prueba', usuarioId };
}
