// 0.9.0: la historia de entradas y salidas de cada cuenta (solo para el administrador). SIN cambio de base:
//  - una sesión abierta (o vencida sin salir) es su fila de «sesiones»: entró en creada_en, su última actividad es
//    ultimo_uso (se anota cada 5 minutos como mucho);
//  - una sesión cerrada dejó su fila «salida» en la auditoría (src/cuentas/sesiones.js): cuándo entró, su última
//    actividad, cuándo salió y por qué;
//  - «última entrada» es usuarios.ultimo_acceso (cada vez que entra con su contraseña).
// Una sesión que nunca tocó «Salir» no tiene hora de salida: se muestra su última actividad (y si ya venció).
import { MOTIVOS_SALIDA } from './sesiones.js';

export const EN_LINEA_MS = 10 * 60 * 1000;
export const ESTADOS_SESION = Object.freeze(['en_linea', 'abierta', 'vencida', 'cerrada']);

const leerDetalle = texto => {
  try {
    const d = JSON.parse(texto ?? 'null');
    return d && typeof d === 'object' ? d : {};
  } catch { return {}; }
};
// Un navegador en pocas palabras («iPhone · Safari»): nunca la cadena entera.
export function equipoDe(navegador) {
  const n = String(navegador ?? '');
  if (!n) return null;
  const equipo = /iPhone/.test(n) ? 'iPhone' : /iPad/.test(n) ? 'iPad' : /Android/.test(n) ? 'Android' : /Macintosh|Mac OS/.test(n) ? 'Mac' : /Windows/.test(n) ? 'Windows' : /Linux/.test(n) ? 'Linux' : null;
  const programa = /Edg\//.test(n) ? 'Edge' : /CriOS|Chrome\//.test(n) ? 'Chrome' : /FxiOS|Firefox\//.test(n) ? 'Firefox' : /Safari\//.test(n) ? 'Safari' : null;
  return [equipo, programa].filter(Boolean).join(' · ') || null;
}

export function sesionesDe(db, usuarioId, ahoraMs = Date.now(), { limite = 40 } = {}) {
  const id = Number(usuarioId);
  const ahoraIso = new Date(ahoraMs).toISOString();
  const abiertas = db.prepare('SELECT creada_en, vence_en, ultimo_uso, navegador FROM sesiones WHERE usuario_id = ? ORDER BY creada_en DESC LIMIT ?').all(id, limite)
    .map(s => {
      const ultima = s.ultimo_uso ?? s.creada_en;
      const vencida = s.vence_en <= ahoraIso;
      return {
        entrada: s.creada_en, ultimaActividad: ultima, salida: null, motivo: null, equipo: equipoDe(s.navegador),
        estado: vencida ? 'vencida' : ahoraMs - Date.parse(ultima) <= EN_LINEA_MS ? 'en_linea' : 'abierta',
      };
    });
  const cerradas = db.prepare("SELECT fecha, detalle FROM auditoria WHERE usuario_id = ? AND accion = 'salida' ORDER BY id DESC LIMIT ?").all(id, limite)
    .map(f => {
      const d = leerDetalle(f.detalle);
      return {
        entrada: typeof d.entrada === 'string' ? d.entrada : null, ultimaActividad: typeof d.ultimoUso === 'string' ? d.ultimoUso : f.fecha,
        salida: f.fecha, motivo: MOTIVOS_SALIDA.includes(d.motivo) ? d.motivo : 'salir', equipo: equipoDe(d.nav), estado: 'cerrada',
      };
    });
  return [...abiertas, ...cerradas].sort((a, b) => String(b.entrada ?? b.salida).localeCompare(String(a.entrada ?? a.salida))).slice(0, limite);
}

// Lo que se ve arriba de «Actividad»: última entrada, última salida (tocó «Salir» o se cerró), última actividad.
export function actividadDe(db, usuarioId, ahoraMs = Date.now(), ultimaActividad = null) {
  const id = Number(usuarioId);
  const u = db.prepare('SELECT ultimo_acceso FROM usuarios WHERE id = ?').get(id);
  const salida = db.prepare("SELECT fecha FROM auditoria WHERE usuario_id = ? AND accion = 'salida' ORDER BY id DESC LIMIT 1").get(id);
  const sesiones = sesionesDe(db, id, ahoraMs);
  const entradas = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE usuario_id = ? AND accion IN ('entrada', 'primer_admin_creado')").get(id).n;
  const ultima = ultimaActividad ?? sesiones.map(s => s.ultimaActividad).filter(Boolean).sort().pop() ?? null;
  return {
    ultimaEntrada: u?.ultimo_acceso ?? null,
    ultimaSalida: salida?.fecha ?? null,
    ultimaActividad: ultima,
    enLinea: Boolean(ultima && ahoraMs - Date.parse(ultima) <= EN_LINEA_MS),
    abiertas: sesiones.filter(s => s.estado === 'en_linea' || s.estado === 'abierta').length,
    entradas,
    sesiones,
  };
}
