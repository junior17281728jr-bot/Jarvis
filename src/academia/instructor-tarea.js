// Academia 0.9.0: la tarea 'academia.instructor' del trabajador. SOLO la carga el trabajador (src/tareas/manejadores.js).
// Un paso: manda a la IA el pedido que armó el servidor web (sistema y texto, en los datos de la tarea: el trabajador
// nunca abre el paquete) y guarda lo que respondió en «ajustes» (src/academia/instructor-ia.js), en la misma escritura
// que anota lo que costó. Lo esperado (la IA apagada, un tope, un error del proveedor, una respuesta que contradice al Test
// Guide) NUNCA lanza: la tarea termina «hecha» con { usada: false, motivo } y el alumno sigue con el instructor básico.
import { USOS_INSTRUCTOR, esquemaDe, guardarRespuesta, leerGuardado } from './instructor-ia.js';

// Nadie espera una respuesta pedida hace más de esto (el trabajador estaba ocupado, apagado o en modo seguro): se termina
// sin llamar, sin pagar.
export const CADUCA_MS = 5 * 60_000;

async function paso(ctx) {
  const d = ctx.tarea.datos ?? {};
  const fin = (motivo, extra = {}) => ({ listo: true, resultado: { usada: false, motivo, costoMicro: 0, ...extra } });
  const ahora = Date.now();
  const pedidaEn = Number(d.pedidaEn);
  if (!Number.isSafeInteger(pedidaEn) || ahora - pedidaEn > CADUCA_MS || pedidaEn > ahora + 60_000) return fin('caducada');
  // 0.11.0: si la persona retiró el permiso de IA después de pedir, no se llama (un «no» guardado en sus ajustes).
  if (Number.isSafeInteger(d.usuarioId) && ctx.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`cuenta.consentimiento_ia.${d.usuarioId}`)?.valor === '0') return fin('sin_consentimiento');
  if (!USOS_INSTRUCTOR.includes(d.uso) || typeof d.sistema !== 'string' || typeof d.texto !== 'string' || !Number.isSafeInteger(ctx.tarea.espacioId)) return fin('pedido_no_valido');
  // Otro alumno ya la pidió y quedó guardada (la misma pregunta, opción y estilo): no se paga otra vez.
  if (leerGuardado(ctx.db, d.clave)) return { listo: true, resultado: { usada: false, motivo: 'ok', guardada: true, costoMicro: 0 } };
  const r = await ctx.ia.pedir({
    proposito: d.uso, paso: 'p1', espacioId: ctx.tarea.espacioId, usuarioId: Number.isSafeInteger(d.usuarioId) ? d.usuarioId : null,
    sistema: d.sistema, texto: d.texto, esquema: esquemaDe(d),
    guardar: (db, json, llamada) => guardarRespuesta(db, d, json, llamada),
  });
  if (r.motivo === 'ya_cobrada') return { listo: true, resultado: { usada: Boolean(leerGuardado(ctx.db, d.clave)), motivo: leerGuardado(ctx.db, d.clave) ? 'ok' : 'interrumpida', costoMicro: r.costoMicro ?? 0 } };
  if (!r.usada) return fin(r.motivo, { costoMicro: r.costoMicro ?? 0 });
  if (!r.guardado?.ok) return fin(r.guardado?.error ?? 'no_se_pudo_guardar', { costoMicro: r.costoMicro ?? 0 });
  return { listo: true, resultado: { usada: true, motivo: 'ok', costoMicro: r.costoMicro ?? 0 } };
}

export const MANEJADOR_INSTRUCTOR = Object.freeze({ paso });
