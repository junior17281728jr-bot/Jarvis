// Academia 0.9.0: la tarea 'academia.instructor' del trabajador. SOLO la carga el trabajador (src/tareas/manejadores.js).
// Un paso: manda a la IA el pedido que armó el servidor web (sistema y texto, en los datos de la tarea: el trabajador
// nunca abre el paquete) y guarda lo que respondió en «ajustes» (src/academia/instructor-ia.js), en la misma escritura
// que anota lo que costó. Lo esperado (la IA apagada, un tope, un error del proveedor, una respuesta que contradice al Test
// Guide) NUNCA lanza: la tarea termina «hecha» con { usada: false, motivo } y el alumno sigue con el instructor básico.
import { createHash } from 'node:crypto';
import { USOS_INSTRUCTOR, esquemaDe, guardarRespuesta, leerGuardado, anotarRechazo } from './instructor-ia.js';

// Nadie espera una respuesta pedida hace más de esto (el trabajador estaba ocupado, apagado o en modo seguro): se termina
// sin llamar, sin pagar.
export const CADUCA_MS = 5 * 60_000;
// 0.12.7: «Preparar tu próxima clase» nadie la espera en pantalla: vale 2 horas; y solo si estudió en las últimas 48 h.
export const CADUCA_PREPARAR_MS = 2 * 3_600_000;
export const ACTIVO_PREPARAR_MS = 48 * 3_600_000;
const leer = (db, clave) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
// Lo último que estudió (la misma regla que src/academia/preparar-clase.js; aquí sin abrir el paquete).
function ultimaActividad(db, id) {
  const r = db.prepare('SELECT MAX(creada_en) AS en FROM academia_respuestas WHERE usuario_id = ?').get(id)?.en ?? null;
  const a = db.prepare('SELECT MAX(actualizado_en) AS en FROM ajustes WHERE clave IN (?, ?)').get(`academia.tema_paso.${id}`, `academia.temas_leidos.${id}`)?.en ?? null;
  const ms = [r, a].map(x => Date.parse(x ?? '')).filter(Number.isFinite);
  return ms.length ? Math.max(...ms) : null;
}
// 0.12.7: lo que hace falta para preparar: el prefijo (guardado por su huella) y que siga siendo la preparación de hoy.
function revisarPreparar(db, d, ahora) {
  if (!Number.isSafeInteger(d.usuarioId) || typeof d.prefijo !== 'string' || !/^academia\.preparar\.prefijo\.[a-f0-9]{32}$/.test(d.prefijo)) return { motivo: 'pedido_no_valido' };
  const sistema = leer(db, d.prefijo);
  if (typeof sistema !== 'string' || createHash('sha256').update(sistema).digest('hex').slice(0, 32) !== d.prefijo.slice(-32)) return { motivo: 'pedido_no_valido' };
  let pt = null;
  try { pt = JSON.parse(leer(db, `academia.preparar.ultimo.${d.usuarioId}`) ?? 'null'); } catch { pt = null; }
  if (!pt || pt.huella !== d.huella) return { motivo: 'sin_cambios' };
  const ultima = ultimaActividad(db, d.usuarioId);
  if (ultima == null || ahora - ultima > ACTIVO_PREPARAR_MS) return { motivo: 'inactivo' };
  return { sistema };
}

async function paso(ctx) {
  const d = ctx.tarea.datos ?? {};
  const fin = (motivo, extra = {}) => ({ listo: true, resultado: { usada: false, motivo, costoMicro: 0, ...extra } });
  const ahora = Date.now();
  const pedidaEn = Number(d.pedidaEn);
  const caduca = d.uso === 'instructor_preparar' ? CADUCA_PREPARAR_MS : CADUCA_MS;
  if (!Number.isSafeInteger(pedidaEn) || ahora - pedidaEn > caduca || pedidaEn > ahora + 60_000) return fin('caducada');
  // 0.11.0: si la persona retiró el permiso de IA después de pedir, no se llama (un «no» guardado en sus ajustes).
  if (Number.isSafeInteger(d.usuarioId) && ctx.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`cuenta.consentimiento_ia.${d.usuarioId}`)?.valor === '0') return fin('sin_consentimiento');
  let sistema = d.sistema;
  if (d.uso === 'instructor_preparar') {
    const r = revisarPreparar(ctx.db, d, ahora);
    if (r.motivo) return fin(r.motivo);
    sistema = r.sistema;
  }
  if (!USOS_INSTRUCTOR.includes(d.uso) || typeof sistema !== 'string' || typeof d.texto !== 'string' || !Number.isSafeInteger(ctx.tarea.espacioId)) return fin('pedido_no_valido');
  // Otro alumno ya la pidió y quedó guardada (la misma pregunta, opción y estilo): no se paga otra vez.
  if (leerGuardado(ctx.db, d.clave)) return { listo: true, resultado: { usada: false, motivo: 'ok', guardada: true, costoMicro: 0 } };
  const r = await ctx.ia.pedir({
    proposito: d.uso, paso: 'p1', espacioId: ctx.tarea.espacioId, usuarioId: Number.isSafeInteger(d.usuarioId) ? d.usuarioId : null,
    sistema, texto: d.texto, esquema: esquemaDe(d),
    guardar: (db, json, llamada) => guardarRespuesta(db, d, json, llamada),
  });
  if (r.motivo === 'ya_cobrada') return { listo: true, resultado: { usada: Boolean(leerGuardado(ctx.db, d.clave)), motivo: leerGuardado(ctx.db, d.clave) ? 'ok' : 'interrumpida', costoMicro: r.costoMicro ?? 0 } };
  if (!r.usada) return fin(r.motivo, { costoMicro: r.costoMicro ?? 0 });
  if (!r.guardado?.ok) {
    // 0.12.4: la IA contradijo al Test Guide (o no sirvió) en ESA pregunta: 2 veces → esa pregunta queda sin IA 7 días
    // (lo básico de siempre), sin pausar la IA para nadie más.
    if (typeof d.preguntaId === 'string') {
      try { await ctx.escribir(() => anotarRechazo(ctx.db, d.preguntaId, Date.now())); } catch { /* lo básico sigue igual */ }
    }
    return fin(r.guardado?.error ?? 'no_se_pudo_guardar', { costoMicro: r.costoMicro ?? 0 });
  }
  return { listo: true, resultado: { usada: true, motivo: 'ok', costoMicro: r.costoMicro ?? 0 } };
}

export const MANEJADOR_INSTRUCTOR = Object.freeze({ paso });
