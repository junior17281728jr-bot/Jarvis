// Los topes de gasto de IA que valen para cada «ámbito» (solo lecturas de la base, en la misma transacción de quien
// pregunta):
//  - general: el tope del mes de todo OPORTIA (ia.config.topeGeneralMicro). Un tope de 0 bloquea siempre.
//  - e<cuenta>: el tope del plan de esa cuenta (prueba, pago, empresarial). La cuenta del administrador solo usa el
//    general.
//  - p<proyecto>: fase 2. El tope de la versión APROBADA del proyecto (configuracion.ia). Una versión que espera
//    aprobación nunca cuenta: el permiso de IA de un proyecto solo vale cuando una persona aprobó esa versión.
import { PLANES } from '../cuentas/planes.js';
import { topeDeAlumnoMicro } from './tope-alumno.js';

const TOPE_PROYECTO_MAXIMO_MICRO = 100_000_000;

// ¿El dueño de ese espacio es administrador? (la misma pregunta que hacía limiteActual de los proyectos de OPORTIA, quitados en la 0.8.0)
export function esEspacioAdmin(db, espacioId) {
  const fila = db.prepare(`SELECT (SELECT u.rol FROM miembros d JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.espacio_id = e.id AND d.rol = 'dueno' ORDER BY d.usuario_id LIMIT 1) AS rol_dueno
    FROM espacios e WHERE e.id = ?`).get(Number(espacioId));
  return fila?.rol_dueno === 'admin';
}

// { admin, plan, topeMicro, fuente? } de un espacio. Un plan desconocido cuenta con tope 0.
// 0.12.8: la cuenta de un alumno con la IA por plan tiene el tope que sale de su plan de IA, su prueba, su tope personal
// o su pausa (src/ia/tope-alumno.js; fuente dice de dónde salió), con el instructor con IA encendido. El tope general
// sigue mandando.
export function topeEspacioMicro(db, cfg, espacioId, ahora = Date.now()) {
  const fila = db.prepare('SELECT plan FROM espacios WHERE id = ?').get(Number(espacioId));
  if (!fila) return { admin: false, plan: null, topeMicro: 0 };
  if (esEspacioAdmin(db, espacioId)) return { admin: true, plan: fila.plan, topeMicro: cfg.topeGeneralMicro };
  const plan = PLANES.includes(fila.plan) ? fila.plan : null;
  const deCuenta = plan ? (cfg.topesPlanMicro?.[plan] ?? 0) : 0;
  // Solo con el instructor con IA encendido (la IA de los alumnos es la suya; sin él, el tope de siempre).
  const alumno = cfg?.instructorIa ? topeDeAlumnoMicro(db, espacioId, deCuenta, ahora) : null;
  return alumno ? { admin: false, plan, topeMicro: alumno.topeMicro, fuente: alumno.fuente } : { admin: false, plan, topeMicro: deCuenta };
}

// Lo que dice la versión APROBADA de un proyecto sobre la IA. { activo, permitida, topeMicro, espacioId }.
// activo: el proyecto está en marcha (en_ejecucion) y no está en la papelera.
export function iaDeVersionActiva(db, { proyectoId }) {
  const p = db.prepare('SELECT id, espacio_id, estado, version_activa, en_papelera FROM proyectos WHERE id = ?').get(Number(proyectoId));
  if (!p) return { activo: false, permitida: false, topeMicro: 0, espacioId: null };
  const activo = p.estado === 'en_ejecucion' && p.en_papelera === 0 && p.version_activa != null;
  let ia = null;
  if (p.version_activa != null) {
    const v = db.prepare("SELECT configuracion FROM proyecto_versiones WHERE proyecto_id = ? AND numero = ? AND estado = 'aprobada'").get(p.id, p.version_activa);
    try { ia = v ? JSON.parse(v.configuracion)?.ia ?? null : null; } catch { ia = null; }
  }
  const permitida = ia?.permitida === true;
  const usd = Number(ia?.topeMensualUsd);
  const topeMicro = permitida && Number.isFinite(usd) && usd > 0 ? Math.min(TOPE_PROYECTO_MAXIMO_MICRO, Math.floor(usd * 1_000_000)) : 0;
  return { activo, permitida, topeMicro, espacioId: p.espacio_id };
}

// El tope (µUSD) de un ámbito, o null si ese ámbito no tiene un tope propio que vigilar (la cuenta del administrador).
export function topeDeAmbito(db, cfg, ambito) {
  if (ambito === 'general') return cfg.topeGeneralMicro;
  const m = /^([ep])([1-9]\d{0,9})$/.exec(String(ambito));
  if (!m) return null;
  if (m[1] === 'e') {
    const t = topeEspacioMicro(db, cfg, Number(m[2]));
    return t.admin ? null : t.topeMicro;
  }
  return iaDeVersionActiva(db, { proyectoId: Number(m[2]) }).topeMicro;
}
