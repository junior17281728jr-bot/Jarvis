// 0.14.2: «Pídele a la IA» (Administrador → Contenido, solo el administrador). El dueño escribe en español simple
// («explica mejor el tema de hipoxia», «agrega un dibujo al tema X», «revisa si hay errores en la materia 1»). La IA
// (Claude, ChatGPT o la API propia: la que trabaje) contesta en el chat y propone un PLAN concreto con su costo estimado;
// SOLO cuando el dueño toca «Hazlo» queda en la fila como un trabajo de la fábrica (la misma tubería: escribir →
// verificar contra el libro → versión nueva publicada o «Esperando revisión»).
// Lo que puede hacer: SOLO contenido (clases, explicaciones, dibujos, orden de las tarjetas) y «Revisar errores» (un
// informe: cada tema contra el libro y la clave). Lo que NUNCA hace: cambiar el código, los precios, las cuentas, ni el
// texto del Test Guide ni el «libro_qa» del oral (TAL CUAL). Se rechaza en código ANTES de llamar (gratis) y otra vez
// después: el plan es JSON con un tipo de una lista cerrada y materia/tema que existen; lo demás no se guarda.
// Cada mensaje cuesta: la pantalla muestra lo que cuesta uno; los topes valen (el del chat, US$10 por defecto, y el
// general); el contexto va corto (un resumen + los últimos mensajes). Con la IA «en pausa» no se llama a nada.
// Todo queda guardado en «ajustes» (nunca se borra: la charla guarda los últimos 200 mensajes).
// Este archivo no importa el camino pagado: las llamadas las hace el trabajador (ctx.ia), dentro de la tarea de la fábrica.
import { createHash } from 'node:crypto';
import { MATERIAS, MATERIAS_ORAL } from './formato.js';
import { leerAjuste, guardarAjuste, activarPaquete } from './paquetes.js';
import { carpetaFuentes, leerManifiesto } from './fuentes.js';
import { REGLAS_VERIFICACION, ESQUEMAS, TAREAS, datos } from './fabrica-prompts.js';
import { crearLector, publicado, trabajoDeTemas, temaPublicado, examenDe, MODOS_CHAT, verificarMaxDe, P } from './fabrica-profunda.js';
import { puedeLlamar, T } from './fabrica.js';
import { anotarCambio, costoDe } from './cambios-ia.js';
import { GASTO_SQL } from '../ia/gasto.js';
import { PROPOSITOS, PROPOSITOS_CHAT } from '../ia/propositos.js';
import { leerConfigIa } from '../ia/config.js';
import { elegirProveedor, modelosDe } from '../ia/presupuesto.js';
import { costoMicro } from '../ia/precios.js';

export const AJUSTE_CHAT = 'ia.chat';
export const AJUSTE_TRABAJOS = 'ia.chat.trabajos';
export const TAREA_CHAT = 'PÍDELE A LA IA · responde al dueño.';
export const TIPOS_TRABAJO = Object.freeze(['reescribir_tema', 'revisar_errores']);
export const RECHAZOS = Object.freeze(['codigo', 'dinero', 'usuarios', 'test_guide', 'otro']);
export const LIMITES_CHAT = Object.freeze({ texto: 1000, mensajes: 200, contexto: 6, instruccion: 600, materiasBytes: 9_000 });
const iso = ms => new Date(ms).toISOString();
const id12 = t => createHash('sha256').update(String(t)).digest('hex').slice(0, 12);
const leerJson = (db, clave, defecto) => { try { const v = JSON.parse(leerAjuste(db, clave) ?? 'null'); return v ?? defecto; } catch { return defecto; } };

// ---------- Lo que NUNCA se hace (en código, sin IA) ----------
const VERBO = '(?:cambi|modific|reescrib|corrig|edit|borr|quit|elimin|arregl|actualiz|instal|program|sub|baj|pon|cre|bloque|reinici|desactiv|traduc|mueve|mover)\\w*\\b.{0,60}';
const PROHIBIDO = Object.freeze([
  ['codigo', new RegExp(`${VERBO}\\b(?:el c[oó]digo(?! del transponder| de (?:la )?(?:frecuencia|aeropuerto|radio))|c[oó]digo (?:de la app|del programa|fuente)|la app\\b|la aplicaci[oó]n|el programa\\b|el servidor|la base de datos|javascript|html|css|github|(?:los?|el) bot[oó]n(?:es)?|la interfaz|la pantalla de (?:la app|administrador|inicio))`, 'i')],
  ['dinero', new RegExp(`${VERBO}\\b(?:los? precios?|el precio|las? tarifas?|los? cobros?|los? pagos?|los planes|la suscripci[oó]n|el tope (?:de|del) (?:gasto|dinero|la ia|la f[aá]brica|mes)|el presupuesto)|\\bapi ?key\\b|clave de (?:la )?api`, 'i')],
  ['usuarios', new RegExp(`${VERBO}\\b(?:(?:el|los|un|una|al|a los|las?) usuari\\w*|(?:la|las|su|sus) contraseñ\\w*|(?:la|las) cuentas? (?:de|del)|al alumno|a los alumnos|a un alumno|los permisos (?:de|del))`, 'i')],
  ['test_guide', /(cambi|modific|reescrib|corrig|edit|borr|quit|elimin|traduc)\w*\b.{0,60}\b(test guide|tg\b|enunciados?|opci[oó]n(?:es)? de (?:la|las) preguntas?|respuestas? correctas?|clave de respuestas|libro_qa|preguntas? del (?:test|examen|libro)|respuestas? del libro)/i],
]);
export function rechazoDe(texto) {
  const t = String(texto ?? '');
  for (const [motivo, re] of PROHIBIDO) if (re.test(t)) return motivo;
  return null;
}

// ---------- Guardar y leer ----------
export function leerChat(db) {
  const v = leerJson(db, AJUSTE_CHAT, {});
  return { mensajes: Array.isArray(v.mensajes) ? v.mensajes : [], resumen: typeof v.resumen === 'string' ? v.resumen : '' };
}
function guardarChat(db, chat) {
  guardarAjuste(db, AJUSTE_CHAT, JSON.stringify({ mensajes: chat.mensajes.slice(-LIMITES_CHAT.mensajes), resumen: String(chat.resumen ?? '').slice(0, 1500) }));
}
export function leerTrabajos(db) {
  const v = leerJson(db, AJUSTE_TRABAJOS, []);
  return Array.isArray(v) ? v : [];
}
function guardarTrabajos(db, lista) {
  guardarAjuste(db, AJUSTE_TRABAJOS, JSON.stringify(lista.slice(-100)));
}
function cambiarTrabajo(db, id, cambios) {
  const lista = leerTrabajos(db);
  const i = lista.findIndex(x => x.id === id);
  if (i < 0) return null;
  // Cancelado es final: lo que todavía estaba en camino no lo vuelve a poner «trabajando».
  if (lista[i].estado === 'cancelado' && cambios.estado !== 'cancelado') return lista[i];
  lista[i] = { ...lista[i], ...cambios };
  guardarTrabajos(db, lista);
  return lista[i];
}
export function gastoChatMicro(db) {
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN (${PROPOSITOS_CHAT.map(() => '?').join(', ')})`).get(...PROPOSITOS_CHAT).g;
}

// Lo que cuesta UN mensaje (para la pantalla): lo medido (3 o más) o, si no, uno típico (6 000 tokens de entrada, 800
// de salida) con el precio del proveedor que contestaría ahora.
export function estimadoMensaje(db, config, ahora = Date.now()) {
  const m = db.prepare(`SELECT COUNT(*) AS n, ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito = 'chat_admin'`).get();
  const cfg = leerConfigIa(db);
  const def = PROPOSITOS.chat_admin;
  const e = elegirProveedor(db, config, cfg, ahora, modelosDe(def, cfg), def);
  const micro = m.n >= 3 ? Math.round(m.g / m.n) : e.ok ? costoMicro(e.precio, { entrada: 6000, salida: 800, cacheLectura: 0, cacheEscritura: 0 }) : def.tipicoMicro;
  return { micro, proveedor: e.ok ? e.proveedor : null, modelo: e.ok ? e.modelo : null, motivo: e.ok ? null : e.motivo };
}

// ---------- Lo que la IA puede tocar: las materias y temas publicados ----------
export function materiasParaChat(db, config) {
  let man = null;
  try { man = leerManifiesto(carpetaFuentes(config)); } catch { man = null; }
  const lector = crearLector(config);
  const out = [];
  for (const id of [...MATERIAS, ...MATERIAS_ORAL]) {
    const pub = publicado(db, config, id, lector);
    if (!pub) continue;
    const nombre = man?.materias?.find(m => m.id === id)?.nombre ?? pub.cabeza?.nombre ?? id;
    out.push({ id, nombre: String(nombre).slice(0, 80), temas: pub.orden.map(t => ({ id: t.id, titulo: String(t.titulo ?? '').slice(0, 80) })) });
  }
  return out;
}

// El costo estimado de un plan (con lo que suele costar cada paso).
// 0.14.7: con el modelo que eligió el dueño para la mejora profunda (Opus por defecto): lo típico de cada paso.
// Si Claude no se puede usar ahora (por ejemplo, con solo ChatGPT), los trabajos del chat siguen con el modelo «barato»
// (que puede escribir ChatGPT, con la revisión cruzada de siempre): el chat nunca se queda esperando a Opus.
function propsChat(cfg, db = null, config = null, ahora = Date.now()) {
  const props = MODOS_CHAT[cfg?.profunda?.modelo] ?? MODOS_CHAT.opus;
  if (props !== MODOS_CHAT.opus || !db) return props;
  const cfgIa = leerConfigIa(db);
  return elegirProveedor(db, config, cfgIa, ahora, modelosDe(PROPOSITOS[props.escribir], cfgIa), PROPOSITOS[props.escribir]).ok ? props : MODOS_CHAT.sonnet;
}
function estimarPlan(db, config, plan, props = MODOS_CHAT.opus) {
  const escribirMicro = PROPOSITOS[props.escribir].tipicoMicro;
  const verificarMicro = PROPOSITOS[props.verificar].tipicoMicro;
  if (plan.tipo === 'revisar_errores') {
    const pub = publicado(db, config, plan.materia);
    const n = plan.tema ? 1 : pub?.orden.length ?? 1;
    return { pasos: n, micro: n * verificarMicro };
  }
  const tp = temaPublicado(db, config, plan.materia, plan.tema);
  const tarjetas = Math.min(12, Math.max(3, (tp?.t?.secciones ?? []).length));
  const escribir = 2 + Math.ceil(tarjetas / P.tarjetasPorPaso);
  return { pasos: escribir + 2, micro: escribir * escribirMicro + 2 * verificarMicro };
}

// ¿El plan que propuso la IA es uno que se puede hacer? (tipo de la lista, materia y tema que existen, nada prohibido)
export function revisarPlan(db, config, plan, materias = materiasParaChat(db, config)) {
  if (!plan || typeof plan !== 'object') return { ok: false, motivo: 'sin_plan' };
  if (!TIPOS_TRABAJO.includes(plan.tipo)) return { ok: false, motivo: 'tipo' };
  const m = materias.find(x => x.id === plan.materia);
  if (!m) return { ok: false, motivo: 'materia' };
  if (plan.tipo === 'reescribir_tema' && !m.temas.some(t => t.id === plan.tema)) return { ok: false, motivo: 'tema' };
  if (plan.tipo === 'revisar_errores' && plan.tema != null && !m.temas.some(t => t.id === plan.tema)) return { ok: false, motivo: 'tema' };
  const instruccion = String(plan.instruccion ?? '').trim();
  if (!instruccion || instruccion.length > LIMITES_CHAT.instruccion) return { ok: false, motivo: 'instruccion' };
  const prohibido = rechazoDe(instruccion);
  if (prohibido) return { ok: false, motivo: `prohibido:${prohibido}` };
  return { ok: true, plan: { tipo: plan.tipo, materia: m.id, materiaNombre: m.nombre, tema: plan.tema ?? null, temaTitulo: m.temas.find(t => t.id === plan.tema)?.titulo ?? null, instruccion, pasos: (plan.pasos ?? []).slice(0, 8).map(x => String(x).slice(0, 200)) } };
}

// ---------- Lo que hace el servidor web (sin IA) ----------
// El dueño escribe. → { mensaje, rechazado? }. 409 'ia_en_pausa' si la IA está en pausa (eso lo dice la ruta).
export function escribirMensaje(db, { texto, ahora = Date.now() }) {
  const t = String(texto ?? '').trim().slice(0, LIMITES_CHAT.texto);
  if (!t) return null;
  const chat = leerChat(db);
  if (chat.mensajes.some(x => x.de === 'dueno' && x.estado === 'pendiente')) return { ocupado: true };
  const mio = { id: id12(`${iso(ahora)}|${t}|${chat.mensajes.length}`), de: 'dueno', texto: t, en: iso(ahora), estado: 'pendiente' };
  const motivo = rechazoDe(t);
  if (motivo) {
    // Se rechaza en código, gratis: ni se llama a la IA.
    mio.estado = 'rechazado';
    chat.mensajes.push(mio, { id: id12(`${mio.id}r`), de: 'ia', en: iso(ahora), texto: null, rechazo: motivo, costoMicro: 0 });
  } else chat.mensajes.push(mio);
  guardarChat(db, chat);
  return { mensaje: mio, rechazado: motivo };
}

// «Hazlo»: el plan propuesto pasa a la fila. «Cancelar»: deja de hacerse (lo ya hecho queda guardado).
export function hazlo(db, { id, ahora = Date.now() }) {
  const j = leerTrabajos(db).find(x => x.id === id);
  if (!j || j.estado !== 'propuesto') return null;
  return cambiarTrabajo(db, id, { estado: 'en_cola', aprobadoEn: iso(ahora) });
}
export function cancelarTrabajo(db, { id, ahora = Date.now() }) {
  const j = leerTrabajos(db).find(x => x.id === id);
  if (!j || !['propuesto', 'en_cola', 'trabajando'].includes(j.estado)) return null;
  return cambiarTrabajo(db, id, { estado: 'cancelado', terminadoEn: iso(ahora) });
}
// Publicar lo que un trabajo dejó «Esperando revisión».
export function publicarTrabajo(db, { id, usuarioId = null, ahora = Date.now() }) {
  const j = leerTrabajos(db).find(x => x.id === id);
  if (!j || j.estado !== 'revision' || !j.version) return null;
  const fila = db.prepare('SELECT estado FROM academia_paquetes WHERE id = ?').get(j.version);
  if (fila?.estado !== 'listo') return null;
  activarPaquete(db, { paqueteId: j.version, materias: [j.materia], usuarioId });
  anotarCambio(db, { materia: j.materia, tema: j.tema, que: 'publicada_por_ti', estado: 'publicada', version: j.version, detalle: j.instruccion, ahora });
  return cambiarTrabajo(db, id, { estado: 'hecho', publicadoEn: iso(ahora) });
}

export function vistaChat(db, config, { ahora = Date.now(), pausada = false } = {}) {
  const chat = leerChat(db);
  return {
    mensajes: chat.mensajes.slice(-60), trabajos: leerTrabajos(db).slice(-30).reverse(), pausada,
    estimado: estimadoMensaje(db, config, ahora), gastoMicro: gastoChatMicro(db),
    pendiente: chat.mensajes.some(x => x.de === 'dueno' && x.estado === 'pendiente') || leerTrabajos(db).some(x => ['en_cola', 'trabajando'].includes(x.estado)),
  };
}

// ---------- Lo que hace el trabajador (dentro del paso de la fábrica) ----------
const ESQUEMA_CHAT = Object.freeze({
  type: 'object', additionalProperties: false, required: ['respuesta', 'rechazo', 'plan', 'resumen'],
  properties: {
    respuesta: { type: 'string' },
    rechazo: { type: ['string', 'null'], enum: [...RECHAZOS, null] },
    plan: { anyOf: [{ type: 'null' }, {
      type: 'object', additionalProperties: false, required: ['tipo', 'materia', 'tema', 'instruccion', 'pasos'],
      properties: { tipo: { type: 'string', enum: [...TIPOS_TRABAJO] }, materia: { type: 'string' }, tema: { type: ['string', 'null'] }, instruccion: { type: 'string' }, pasos: { type: 'array', items: { type: 'string' } } },
    }] },
    resumen: { type: 'string' },
  },
});
export const REGLAS_CHAT = `Eres el asistente del dueño de una academia de aviación (piloto privado, en español de República Dominicana). Hablas simple, corto y amable.
Solo puedes proponer trabajos de CONTENIDO de las clases ya publicadas:
- «reescribir_tema»: explicar mejor un tema, cambiar el orden de sus tarjetas, agregar ejemplos o un dibujo (un diagrama simple) — con los datos del libro, verificado después contra el libro.
- «revisar_errores»: revisar una materia (o un tema) contra el libro y la clave de respuestas, y dar un informe.
NUNCA: cambiar el código o la app, precios, pagos, topes, usuarios, contraseñas, ni el texto del Test Guide (enunciados, opciones, respuestas) ni las preguntas y respuestas del libro del oral (van TAL CUAL). Si te lo piden, explica con cariño que eso no lo puedes hacer (rechazo: codigo, dinero, usuarios, test_guide u otro) y plan = null.
Usa SOLO los ids de materia y tema de la lista de los datos. Si no está claro qué tema, pregunta (plan = null).
«respuesta»: lo que le dices al dueño (máximo 6 frases), con el plan en palabras simples si hay uno, y que toque «Hazlo» para empezar.
«resumen»: un resumen MUY corto de toda la charla hasta ahora (para recordarla después). Responde solo con el JSON pedido.`;

async function responderMensaje(ctx, { ahora, cfg, chat, mio }) {
  const { db, config } = ctx;
  const materias = materiasParaChat(db, config);
  let lista = JSON.stringify(materias);
  while (Buffer.byteLength(lista) > LIMITES_CHAT.materiasBytes && materias.length) { materias.forEach(m => { m.temas = m.temas.slice(0, Math.max(1, m.temas.length - 2)); }); lista = JSON.stringify(materias); if (materias.every(m => m.temas.length <= 1)) break; }
  const recientes = chat.mensajes.filter(x => x.id !== mio.id).slice(-LIMITES_CHAT.contexto).map(x => ({ de: x.de, texto: String(x.texto ?? x.rechazo ?? '').slice(0, 300) }));
  const texto = `${TAREA_CHAT}\n${datos({ resumen_de_antes: chat.resumen || null, ultimos_mensajes: recientes, materias, pide_ahora: mio.texto })}`;
  const bytes = Buffer.byteLength(REGLAS_CHAT) + Buffer.byteLength(texto) + Buffer.byteLength(JSON.stringify(ESQUEMA_CHAT));
  const marcar = async valor => ctx.escribir(() => {
    const c = leerChat(db);
    const i = c.mensajes.findIndex(x => x.id === mio.id);
    if (i >= 0) c.mensajes[i] = { ...c.mensajes[i], estado: valor.estadoMio };
    if (valor.respuesta) c.mensajes.push(valor.respuesta);
    if (valor.resumen != null) c.resumen = valor.resumen;
    guardarChat(db, c);
    if (valor.trabajo) guardarTrabajos(db, [...leerTrabajos(db), valor.trabajo]);
  });
  const puede = puedeLlamar(db, config, { proposito: 'chat_admin', bytes, ahora, topeMicro: cfg.chat.topeMicro, gastado: gastoChatMicro(db) });
  if (!puede.ok) {
    await marcar({ estadoMio: 'error', respuesta: { id: id12(`${mio.id}e`), de: 'ia', en: iso(ahora), texto: null, error: puede.motivo, costoMicro: 0 } });
    return { trabajo: true, seguir: false, motivo: puede.motivo };
  }
  const r = await ctx.ia.pedir({ proposito: 'chat_admin', paso: `c:${mio.id}`, sistema: REGLAS_CHAT, texto, esquema: ESQUEMA_CHAT });
  if (!r.usada) {
    await marcar({ estadoMio: 'error', respuesta: { id: id12(`${mio.id}e`), de: 'ia', en: iso(ahora), texto: null, error: r.motivo, costoMicro: r.costoMicro ?? 0 } });
    return { trabajo: true, seguir: false, motivo: r.motivo };
  }
  const j = r.json;
  let trabajo = null;
  let rechazo = RECHAZOS.includes(j.rechazo) ? j.rechazo : null;
  let nota = null;
  if (!rechazo && j.plan) {
    const rev = revisarPlan(db, config, j.plan, materiasParaChat(db, config));
    if (rev.ok) {
      const est = estimarPlan(db, config, rev.plan, propsChat(cfg, db, config, ahora));
      const pub = publicado(db, config, rev.plan.materia);
      trabajo = { id: id12(`t|${mio.id}|${iso(ahora)}`), ...rev.plan, estado: 'propuesto', estimadoMicro: est.micro, pasosEstimados: est.pasos, base: pub?.base ?? null, mensaje: mio.id, creadoEn: iso(ahora), hechos: 0 };
    } else if (rev.motivo.startsWith('prohibido:')) rechazo = rev.motivo.slice('prohibido:'.length);
    else nota = rev.motivo; // un plan con una materia o un tema que no existe: no se ofrece «Hazlo»
  }
  await marcar({
    estadoMio: rechazo ? 'rechazado' : 'respondido', resumen: String(j.resumen ?? '').slice(0, 1500),
    respuesta: { id: id12(`${mio.id}r`), de: 'ia', en: iso(ahora), texto: String(j.respuesta ?? '').slice(0, 2000), rechazo, planNoValido: nota, trabajo: trabajo?.id ?? null, costoMicro: r.costoMicro, proveedor: r.proveedor, modelo: r.modelo },
    trabajo: rechazo ? null : trabajo,
  });
  return { trabajo: true, seguir: true };
}

// «Revisar errores»: cada tema (o el pedido), UNA verificación contra el libro y la clave. El informe queda en el trabajo.
async function pasoRevisar(ctx, { ahora, cfg, j }) {
  const { db, config } = ctx;
  const pub = publicado(db, config, j.materia);
  if (!pub) { await ctx.escribir(() => cambiarTrabajo(db, j.id, { estado: 'fallido', motivo: 'sin_publicar', terminadoEn: iso(ahora) })); return { trabajo: true, seguir: true }; }
  const temas = j.tema ? pub.orden.filter(t => t.id === j.tema) : pub.orden;
  const informe = j.informe ?? [];
  const pendiente = temas.find(t => !informe.some(x => x.tema === t.id));
  if (!pendiente) {
    const dudas = informe.flatMap(x => x.dudas ?? []);
    await ctx.escribir(() => {
      cambiarTrabajo(db, j.id, { estado: 'hecho', terminadoEn: iso(ahora) });
      anotarCambio(db, { materia: j.materia, tema: j.tema, que: 'revision_errores', estado: 'hecho', despues: { temas: temas.length, dudas: dudas.length, errores: dudas.filter(d => d.gravedad === 'error').length }, ...costoDe(db, `c:${j.id}:`), detalle: j.instruccion, ahora });
    });
    return { trabajo: true, seguir: true };
  }
  const tp = temaPublicado(db, config, j.materia, pendiente.id);
  if (!tp?.c) {
    await ctx.escribir(() => cambiarTrabajo(db, j.id, { estado: 'trabajando', informe: [...informe, { tema: pendiente.id, titulo: pendiente.titulo, sinFuentes: true, dudas: [] }] }));
    return { trabajo: true, seguir: true };
  }
  const examen = examenDe(tp.t, tp.pub, tp.c);
  const clave = tp.c.oral ? examen.preguntas_del_libro.map(x => ({ n: x.n, respuesta_en: x.respuesta_en })) : examen.test_guide.map(q => ({ id: q.id, correcta: q.correcta }));
  const props = propsChat(cfg, db, config, ahora);
  const sistema = `${REGLAS_VERIFICACION}\n\nLECTURA COMPLETA:\n${datos(tp.c.texto.slice(0, verificarMaxDe(props)))}`;
  const preguntas = tp.c.oral
    ? (tp.t.libro_qa ?? []).map(x => ({ n: x.n, explicacion_es: x.explicacion_es ?? null, puntos_clave: x.puntos_clave ?? null }))
    : (tp.t.preguntas ?? []).map(id => tp.pub.preguntas.get(id)).filter(Boolean).map(q => ({
      id: q.id, correcta: q.original?.opciones?.find(o => o.letra === q.original.correcta)?.texto ?? null, sencilla: q.sencilla ?? null, errores: q.errores ?? null, reto: q.reto ?? null,
    }));
  const tarjetas = tp.viejas.map(({ s }) => ({ titulo: s.titulo, puntos: s.puntos ?? null, texto: s.tipo === 'tarjeta' ? null : s.texto ?? null, recuerda: s.recuerda ?? null, ejemplo: s.ejemplo ?? null, visual: s.visual?.parametros ?? null }));
  const texto = `${TAREAS.verificar}\n${datos({ pedido_del_dueno: j.instruccion, clave_test_guide: clave, contenido: { tarjetas, preguntas } })}`;
  const bytes = Buffer.byteLength(sistema) + Buffer.byteLength(texto) + Buffer.byteLength(JSON.stringify(ESQUEMAS.verificar));
  const puede = puedeLlamar(db, config, { proposito: props.verificar, bytes, ahora, topeMicro: cfg.chat.topeMicro, gastado: gastoChatMicro(db) });
  if (!puede.ok) {
    if (puede.motivo === 'demasiado_largo') { await ctx.escribir(() => cambiarTrabajo(db, j.id, { estado: 'trabajando', informe: [...informe, { tema: pendiente.id, titulo: pendiente.titulo, demasiadoLargo: true, dudas: [] }] })); return { trabajo: true, seguir: true }; }
    await ctx.escribir(() => cambiarTrabajo(db, j.id, { espera: puede.motivo }));
    return { trabajo: true, seguir: false, motivo: puede.motivo };
  }
  const r = await ctx.ia.pedir({ proposito: props.verificar, paso: `c:${j.id}:${id12(pendiente.id)}`, sistema, texto, esquema: ESQUEMAS.verificar });
  if (!r.usada && r.motivo !== 'ya_cobrada') { await ctx.escribir(() => cambiarTrabajo(db, j.id, { espera: r.motivo })); return { trabajo: true, seguir: false, motivo: r.motivo }; }
  const dudas = (r.json?.dudas ?? []).slice(0, 40).map(d => ({ donde: String(d.donde).slice(0, 200), problema: String(d.problema).slice(0, 400), gravedad: d.gravedad }));
  await ctx.escribir(() => cambiarTrabajo(db, j.id, { estado: 'trabajando', espera: null, hechos: (j.hechos ?? 0) + 1, informe: [...informe, { tema: pendiente.id, titulo: pendiente.titulo, dudas, proveedor: r.proveedor ?? null }] }));
  return { trabajo: true, seguir: true };
}

async function pasoReescribir(ctx, { ahora, cfg, j }) {
  const { db } = ctx;
  const op = {
    prefijo: `chat.t.${j.id}`, props: propsChat(cfg, db, ctx.config, ahora),
    topeMicro: cfg.chat.topeMicro, gastado: gastoChatMicro, pasoPrefijo: `c:${j.id}:`, ajusteEspera: `chat.t.${j.id}.espera`, base: j.base, que: 'pedido_hecho', edicion: 'pedido',
    anotarPaso: dbx => { const x = leerTrabajos(dbx).find(y => y.id === j.id); cambiarTrabajo(dbx, j.id, { estado: 'trabajando', espera: null, hechos: (x?.hechos ?? 0) + 1 }); },
    guardarEstado: (dbx, valor) => cambiarTrabajo(dbx, j.id, {
      estado: valor.estado === 'publicada' ? 'hecho' : valor.estado === 'revision' ? 'revision' : 'sin_cambios', version: valor.version ?? null,
      dudas: (valor.dudas ?? []).slice(0, 50), problema: valor.problema ?? null, terminadoEn: iso(ahora),
    }),
  };
  const r = await trabajoDeTemas(ctx, { materia: j.materia, temas: [j.tema], instruccion: j.instruccion, ahora, cfg, op });
  if (!r.trabajo) { await ctx.escribir(() => cambiarTrabajo(db, j.id, { estado: 'fallido', motivo: r.motivo, terminadoEn: iso(ahora) })); return { trabajo: true, seguir: true }; }
  if (!r.seguir && r.motivo) await ctx.escribir(() => cambiarTrabajo(db, j.id, { espera: r.motivo }));
  return r;
}

// UN paso: el mensaje que espera respuesta y, si no hay, el próximo paso del trabajo aprobado más viejo.
// → { trabajo: false } (nada que hacer, sin gastar) o { trabajo: true, seguir, motivo? }.
export async function atenderChat(ctx, { ahora, cfg }) {
  const { db } = ctx;
  const chat = leerChat(db);
  const mio = chat.mensajes.find(x => x.de === 'dueno' && x.estado === 'pendiente');
  if (mio) return responderMensaje(ctx, { ahora, cfg, chat, mio });
  const j = leerTrabajos(db).find(x => ['en_cola', 'trabajando'].includes(x.estado));
  if (!j) return { trabajo: false };
  if (j.estado === 'en_cola') await ctx.escribir(() => cambiarTrabajo(db, j.id, { estado: 'trabajando', empezadoEn: iso(ahora) }));
  return j.tipo === 'revisar_errores' ? pasoRevisar(ctx, { ahora, cfg, j }) : pasoReescribir(ctx, { ahora, cfg, j });
}
