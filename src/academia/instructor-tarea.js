// Academia 0.9.0: la tarea 'academia.instructor' del trabajador. SOLO la carga el trabajador (src/tareas/manejadores.js).
// Un paso: manda a la IA el pedido que armó el servidor web (sistema y texto, en los datos de la tarea: el trabajador
// nunca abre el paquete) y guarda lo que respondió en «ajustes» (src/academia/instructor-ia.js), en la misma escritura
// que anota lo que costó. Lo esperado (la IA apagada, un tope, un error del proveedor, una respuesta que contradice al Test
// Guide) NUNCA lanza: la tarea termina «hecha» con { usada: false, motivo } y el alumno sigue con el instructor básico.
import { createHash } from 'node:crypto';
import { USOS_INSTRUCTOR, esquemaDe, guardarRespuesta, leerGuardado, anotarRechazo } from './instructor-ia.js';
import { VOZ, ARCHIVO_VOZ, INSTRUCCIONES_VOZ, archivoVoz, hayVoz, guardarVoz } from './oral-voz.js';
import { buscarGuardada, leerConfigVoz, varianteDe, archivoEleven } from './voz-natural.js';
import { grabarEleven } from './voz-eleven.js';
import { USOS_COMPE, esquemaCompe, guardarFrase, guardarSugerencia } from './competencia-ia.js';
import { USOS_REPORTE, ESQUEMA_REVISION, guardarRevision } from './reporte-ia.js';
import { DICTADO, ID_DICTADO, tomarAudio, tipoDeAudio, guardarTexto } from './oral-dictado.js';

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
  // 0.14.50: un dictado lo espera el alumno con el micrófono en la mano: vale 45 s.
  const caduca = d.uso === 'instructor_preparar' || d.uso === 'compe_mejorar' || d.uso === 'compe_frase' || d.uso === 'reporte_revisar' ? CADUCA_PREPARAR_MS : d.uso === 'oral_dictado' ? DICTADO.caducaMs : CADUCA_MS;
  // La grabación se saca de la memoria SIEMPRE (también si caducó o no hay permiso): nunca queda esperando.
  const grabacion = d.uso === 'oral_dictado' && ID_DICTADO.test(String(d.audio)) ? tomarAudio(d.audio) : null;
  if (!Number.isSafeInteger(pedidaEn) || ahora - pedidaEn > caduca || pedidaEn > ahora + 60_000) return fin('caducada');
  // 0.11.0: si la persona retiró el permiso de IA después de pedir, no se llama (un «no» guardado en sus ajustes).
  // 0.14.70: la voz de un texto compartido no lleva nada del alumno: sin su permiso de IA no se usa ChatGPT (d.chatgpt lo
  // dice el servidor web), pero la voz de ElevenLabs y la ya guardada sí.
  const esVoz = d.uso === 'oral_voz' || d.uso === 'lectura_voz';
  const sinPermisoIa = Number.isSafeInteger(d.usuarioId) && ctx.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`cuenta.consentimiento_ia.${d.usuarioId}`)?.valor === '0';
  if (!esVoz && sinPermisoIa) return fin('sin_consentimiento');
  // 0.14.29: la voz natural de una pregunta del oral (solo ChatGPT; en el tope de su cuenta, sin cobrarle un uso): un mp3
  // por texto, una sola vez para todos.
  // 0.14.50: el dictado de la Práctica en vivo (solo ChatGPT; en el tope de su cuenta, sin cobrarle un uso): la grabación
  // (que vino en memoria, nunca de la base) a texto. El texto queda para su pantalla; el audio se olvida aquí.
  if (d.uso === 'oral_dictado') {
    if (!Number.isSafeInteger(d.usuarioId) || !ID_DICTADO.test(String(d.audio)) || !Number.isSafeInteger(ctx.tarea.espacioId)) return fin('pedido_no_valido');
    if (!grabacion) return fin('sin_pendiente');
    const pista = typeof d.pista === 'string' ? d.pista.slice(0, DICTADO.pistaMax) : '';
    const r = await ctx.ia.pedir({
      proposito: 'oral_dictado', paso: 'p1', espacioId: ctx.tarea.espacioId, usuarioId: d.usuarioId, sistema: '', texto: pista,
      audio: { bytes: grabacion, tipo: tipoDeAudio(grabacion), idioma: d.idioma === 'en' ? 'en' : 'es' },
      guardar: (db, json) => guardarTexto(db, { usuarioId: d.usuarioId, id: d.audio, texto: json?.texto, ahora: Date.now() }),
    });
    if (!r.usada) return fin(r.motivo, { costoMicro: r.costoMicro ?? 0 });
    if (!r.guardado?.ok) return fin(r.guardado?.error ?? 'no_se_pudo_guardar', { costoMicro: r.costoMicro ?? 0 });
    return { listo: true, resultado: { usada: true, motivo: 'ok', costoMicro: r.costoMicro ?? 0 } };
  }
  // 0.14.70: la voz natural de un texto COMPARTIDO (la pregunta del oral, 'oral_voz'; una tarjeta de una clase o una
  // pregunta de práctica, 'lectura_voz'): uno ya guardado (de cualquier proveedor) no se paga otra vez; si no, ElevenLabs
  // y después ChatGPT (o al revés, si el dueño lo pidió). ChatGPT solo si el servidor web vio que el alumno tiene IA
  // (d.chatgpt; las tareas de antes no lo traen: sí). Nada de esto lleva datos del alumno: solo el texto.
  if (d.uso === 'oral_voz' || d.uso === 'lectura_voz') {
    if (typeof d.texto !== 'string' || !d.texto.trim() || d.texto.length > VOZ.textoMax || !ARCHIVO_VOZ.test(String(d.archivo)) || archivoVoz(d.texto) !== d.archivo) return fin('pedido_no_valido');
    const crudo = typeof d.crudo === 'string' && d.crudo.length <= VOZ.textoMax ? d.crudo : null;
    // La muestra de una voz (Claves e IA) solo vale con ESA voz de ElevenLabs.
    const ya = d.muestra === true ? hayVoz(ctx.config, archivoEleven(varianteDe(leerConfigVoz(ctx.db)), d.texto)) : hayVoz(ctx.config, d.archivo) || buscarGuardada(ctx.db, ctx.config, { texto: d.texto, crudo });
    if (ya) return { listo: true, resultado: { usada: false, motivo: 'ok', guardada: true, costoMicro: 0 } };
    const orden = leerConfigVoz(ctx.db).primero === 'chatgpt' ? ['openai', 'elevenlabs'] : ['elevenlabs', 'openai'];
    let motivo = 'sin_clave';
    let costoMicro = 0;
    for (const proveedor of orden) {
      if (proveedor === 'elevenlabs') {
        const r = await grabarEleven(ctx, { texto: d.texto, idioma: d.idioma === 'en' ? 'en' : d.idioma === 'es' ? 'es' : null });
        if (r.motivo === 'ok') return { listo: true, resultado: { usada: true, motivo: 'ok', proveedor: 'elevenlabs', letras: r.letras, costoMicro } };
        motivo = r.motivo;
      } else if (d.chatgpt !== false && !sinPermisoIa) {
        const r = await ctx.ia.pedir({
          proposito: 'oral_voz', paso: 'p1', espacioId: ctx.tarea.espacioId, usuarioId: Number.isSafeInteger(d.usuarioId) ? d.usuarioId : null, sistema: INSTRUCCIONES_VOZ, texto: d.texto,
          guardar: (_db, json) => guardarVoz(ctx.config, d.archivo, json?.audio),
        });
        costoMicro += r.costoMicro ?? 0;
        if (r.usada && r.guardado?.ok) return { listo: true, resultado: { usada: true, motivo: 'ok', proveedor: 'openai', costoMicro } };
        motivo = r.usada ? (r.guardado?.error ?? 'no_se_pudo_guardar') : r.motivo;
      }
    }
    return fin(motivo, { costoMicro });
  }
  // 0.14.38: la Competencia (src/academia/competencia-ia.js): la frase del certificado y «Mejorar preguntas con IA». Si la
  // IA no responde, no pasa nada: el certificado lleva su frase fija y la ronda sigue igual.
  // 0.14.85: la opinión de la IA sobre un reporte (src/academia/reporte-ia.js). Si no responde, el administrador decide igual.
  if (USOS_REPORTE.includes(d.uso)) {
    if (typeof d.sistema !== 'string' || typeof d.texto !== 'string' || !Number.isSafeInteger(ctx.tarea.espacioId)) return fin('pedido_no_valido');
    const r = await ctx.ia.pedir({
      proposito: d.uso, paso: 'p1', espacioId: ctx.tarea.espacioId, usuarioId: Number.isSafeInteger(d.usuarioId) ? d.usuarioId : null,
      sistema: d.sistema, texto: d.texto, esquema: ESQUEMA_REVISION,
      guardar: (db, json) => guardarRevision(db, d, json),
    });
    if (!r.usada) return fin(r.motivo, { costoMicro: r.costoMicro ?? 0 });
    if (!r.guardado?.ok) return fin(r.guardado?.error ?? 'no_se_pudo_guardar', { costoMicro: r.costoMicro ?? 0 });
    return { listo: true, resultado: { usada: true, motivo: 'ok', costoMicro: r.costoMicro ?? 0 } };
  }
  if (USOS_COMPE.includes(d.uso)) {
    if (typeof d.sistema !== 'string' || typeof d.texto !== 'string' || !Number.isSafeInteger(ctx.tarea.espacioId)) return fin('pedido_no_valido');
    const r = await ctx.ia.pedir({
      proposito: d.uso, paso: 'p1', espacioId: ctx.tarea.espacioId, usuarioId: Number.isSafeInteger(d.usuarioId) ? d.usuarioId : null,
      sistema: d.sistema, texto: d.texto, esquema: esquemaCompe(d.uso),
      guardar: (db, json) => (d.uso === 'compe_frase' ? guardarFrase(db, d, json) : guardarSugerencia(db, d, json)),
    });
    if (!r.usada) return fin(r.motivo, { costoMicro: r.costoMicro ?? 0 });
    if (!r.guardado?.ok) return fin(r.guardado?.error ?? 'no_se_pudo_guardar', { costoMicro: r.costoMicro ?? 0 });
    return { listo: true, resultado: { usada: true, motivo: 'ok', costoMicro: r.costoMicro ?? 0 } };
  }
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
