// 0.14.8: «Claude mejora la app» (Administrador → Contenido → «Mejorar la app con Claude»). Claude (Opus 5.5) mejora la
// PARTE VISIBLE de la app (lo que se ve, más claro y más simple, y el administrador más ordenado), seguro por diseño:
//   1. Elige UNA pantalla (solo, pantalla por pantalla: primero lo del alumno, después el administrador) o lo que pidió el
//      dueño (en esta pantalla o en el chat «Pídele a la IA»), y propone UN cambio chico como JSON (buscar → reemplazar).
//   2. El código lo revisa (src/academia/app-parche.js: SOLO public/, nunca src/, test/, claves ni pagos; nada de innerHTML,
//      estilos incrustados ni direcciones de internet). Lo que no pasa se anota y no se prueba.
//   3. El servidor web lo prueba en una COPIA de `main` con TODAS las pruebas (src/academia/app-probador.js: una a la vez,
//      con prioridad baja y tiempo máximo). Lo que no pasa se descarta y queda anotado.
//   4. Si pasa: con «subir solo si pasan todas las pruebas» (encendido por defecto, lo decidió el dueño) se sube a GitHub
//      (rama claude-app/<id>, y `main` avanza solo si nadie la movió: si no, «conflicto»). Si está apagado, espera «Aprobar».
//      Sin el token de GitHub, queda guardado para «Copiar / Descargar» y se pide el token UNA vez (pantalla y Telegram).
//   5. El actualizador del servidor lo instala después de pasar OTRA VEZ todas las pruebas (version.bad lo bloquea si no).
//      Si no se instala (o no arranca), se deshace solo con un commit nuevo hacia adelante. «Deshacer el último cambio»
//      hace lo mismo cuando lo pide el dueño. Nunca se fuerza nada en GitHub.
// Un cambio a la vez (el siguiente empieza cuando el anterior quedó instalado o descartado): así nunca hay dos pruebas
// juntas en el servidor de 1 vCPU. El gasto: su tope propio (US$20 por defecto; lo del chat, con el tope del chat), el
// tope general, y el total de las fases 1–5 (ia.todo.tope_micro, si existe). Con el saldo acabado: se detiene limpio («Pausado:
// se acabó el saldo»), todo queda guardado y sigue donde quedó cuando hay saldo (lo que Claude ya respondió nunca se paga dos
// veces: se guarda en la misma escritura que su costo). Todo en filas de «ajustes» (nada se borra).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { aplicarParche, LIMITES_PARCHE } from './app-parche.js';
import { carpetaArbol, archivoTgz, abrirTgz, lectorDeArbol, PANTALLAS, pantallaDe, contextoDePantalla, mapaDeLaApp, SHA, CONTEXTO } from './app-fuente.js';
import { datos } from './fabrica-prompts.js';
import { anotarCambio, costoDe } from './cambios-ia.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { GASTO_SQL } from '../ia/gasto.js';
import { PROPOSITOS, PROPOSITOS_APP, PROPOSITOS_CHAT, PROPOSITOS_PROFUNDA } from '../ia/propositos.js';
import { REPO, REPO_POR_DEFECTO, shaDeMain, bajarFuente, subirCambio, deshacerCambio, hayToken } from '../canales/github.js';

export const AJUSTE_CONFIG_APP = 'ia.app.config';
export const AJUSTE_PROPUESTAS = 'ia.app.propuestas';
export const AJUSTE_ESTADO_APP = 'ia.app.estado';
export const AJUSTE_FUENTE_APP = 'ia.app.fuente';
export const AJUSTE_RECORRIDO = 'ia.app.recorrido';
export const AJUSTE_IDEAS_APP = 'ia.app.ideas';
export const AJUSTE_TODO = 'ia.todo.tope_micro';
export const AJUSTE_IDEAS_FUTURO = 'ia.ideas.futuro';
export const TAREA_APP = 'MEJORAR LA APP · un cambio chico de la parte visible.';
export const TAREA_ELEGIR = 'MEJORAR LA APP · ¿dónde va lo que pidió el dueño?';
export const CONFIG_APP = Object.freeze({ activa: true, autoSubir: true, pausada: false, topeMicro: 20_000_000, repo: REPO_POR_DEFECTO });
export const LIMITES_APP = Object.freeze({ topeMaxMicro: 100_000_000, propuestas: 200, porPantalla: 2, intentosPorPantalla: 2, pedido: 1000 });
// Los estados de una propuesta. «Activos»: hay algo por hacer (o esperando) y ninguna otra empieza.
export const ESTADOS_APP = Object.freeze(['en_fila', 'pensando', 'probar', 'probando', 'paso', 'aprobado', 'esperando_aprobar', 'esperando_token', 'subido',
  'instalado', 'no_instalado', 'deshacer', 'deshecho', 'no_paso', 'rechazado', 'nada', 'fallido', 'conflicto', 'idea']);
export const ACTIVOS = Object.freeze(['pensando', 'probar', 'probando', 'paso', 'aprobado', 'esperando_aprobar', 'esperando_token', 'subido', 'no_instalado', 'deshacer']);
export const FINALES = Object.freeze(['instalado', 'deshecho', 'no_paso', 'rechazado', 'nada', 'fallido', 'conflicto', 'idea']);
// En camino de verdad (una pantalla del modo solo que todavía piensa no tapa nada: vuelve a mirar main antes de responder).
const enCamino = x => ACTIVOS.includes(x.estado) && !(x.origen === 'continuo' && x.estado === 'pensando');
const SALDO = new Set(['tope_fabrica', 'tope_general', 'tope_todo', 'sin_credito', 'limite_gasto_proveedor', 'llamada_muy_cara']);
const iso = ms => new Date(ms).toISOString();
const id12 = t => createHash('sha256').update(String(t)).digest('hex').slice(0, 12);
const leerJson = (db, clave, defecto) => { try { const v = JSON.parse(leerAjuste(db, clave) ?? 'null'); return v ?? defecto; } catch { return defecto; } };
const enLista = lista => `(${lista.map(() => '?').join(', ')})`;
const sumar = (db, lista) => db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN ${enLista(lista)}`).get(...lista).g;

// ---------- Configuración, propuestas y estado ----------
export function leerConfigApp(db) {
  const v = leerJson(db, AJUSTE_CONFIG_APP, {});
  const tope = Number.isSafeInteger(v.topeMicro) && v.topeMicro >= 0 && v.topeMicro <= LIMITES_APP.topeMaxMicro ? v.topeMicro : CONFIG_APP.topeMicro;
  return { activa: v.activa !== false, autoSubir: v.autoSubir !== false, pausada: v.pausada === true, topeMicro: tope, repo: REPO.test(String(v.repo ?? '')) ? v.repo : CONFIG_APP.repo };
}
export function guardarConfigApp(db, cambios) {
  const actual = leerConfigApp(db);
  const limpio = {};
  for (const k of ['activa', 'autoSubir', 'pausada']) if (typeof cambios?.[k] === 'boolean') limpio[k] = cambios[k];
  if (Number.isSafeInteger(cambios?.topeMicro) && cambios.topeMicro >= 0 && cambios.topeMicro <= LIMITES_APP.topeMaxMicro) limpio.topeMicro = cambios.topeMicro;
  if (typeof cambios?.repo === 'string' && REPO.test(cambios.repo)) limpio.repo = cambios.repo;
  guardarAjuste(db, AJUSTE_CONFIG_APP, JSON.stringify({ ...actual, ...limpio }));
  return leerConfigApp(db);
}
export function leerPropuestas(db) { const v = leerJson(db, AJUSTE_PROPUESTAS, []); return Array.isArray(v) ? v : []; }
function guardarPropuestas(db, lista) { guardarAjuste(db, AJUSTE_PROPUESTAS, JSON.stringify(lista.slice(-LIMITES_APP.propuestas))); }
export const leerDetalle = (db, id) => leerJson(db, `ia.app.p.${id}`, null);
const guardarDetalle = (db, id, v) => guardarAjuste(db, `ia.app.p.${id}`, JSON.stringify(v));
// Cambia UNA propuesta (dentro de la transacción de quien llama). si: solo si sigue en ese estado (o en uno de esos).
export function cambiarPropuesta(db, id, cambios, { si = null } = {}) {
  const lista = leerPropuestas(db);
  const i = lista.findIndex(x => x.id === id);
  if (i < 0) return null;
  if (si && !(Array.isArray(si) ? si : [si]).includes(lista[i].estado)) return null;
  lista[i] = { ...lista[i], ...cambios };
  guardarPropuestas(db, lista);
  return lista[i];
}
export const leerRecorrido = db => ({ pantallas: {}, terminado: false, ronda: 1, ...leerJson(db, AJUSTE_RECORRIDO, {}) });
const guardarRecorrido = (db, v) => guardarAjuste(db, AJUSTE_RECORRIDO, JSON.stringify(v));
export const leerFuente = db => leerJson(db, AJUSTE_FUENTE_APP, {});
export const guardarFuente = (db, v) => guardarAjuste(db, AJUSTE_FUENTE_APP, JSON.stringify({ ...leerFuente(db), ...v }));
export const leerIdeasApp = db => { const v = leerJson(db, AJUSTE_IDEAS_APP, []); return Array.isArray(v) ? v : []; };

export const gastoAppMicro = db => sumar(db, PROPOSITOS_APP);
export const gastoChatAppMicro = db => sumar(db, PROPOSITOS_CHAT);
// El total de las fases 1–5 (la fábrica, la mejora, la mejora profunda y esto), contra ia.todo.tope_micro si existe.
export function topeTodo(db) {
  const crudo = leerAjuste(db, AJUSTE_TODO);
  if (crudo == null || String(crudo).trim() === '') return null;
  const v = Number(crudo);
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}
export const gastoTodoMicro = db => sumar(db, [...PROPOSITOS_PROFUNDA, ...PROPOSITOS_APP]);
// La fase 5 cuenta en el tope compartido: sus propósitos van en ia.todo.propositos (lo lee la mejora profunda).
export const AJUSTE_TODO_PROPOSITOS = 'ia.todo.propositos';
export const AJUSTE_TODO_ESTADO = 'ia.todo.estado';
function anotarPropositosTodo(db) {
  let lista = [];
  try { lista = JSON.parse(leerAjuste(db, AJUSTE_TODO_PROPOSITOS) ?? '[]'); } catch { lista = []; }
  if (!Array.isArray(lista)) lista = [];
  if (!PROPOSITOS_APP.every(x => lista.includes(x))) guardarAjuste(db, AJUSTE_TODO_PROPOSITOS, JSON.stringify([...new Set([...lista, ...PROPOSITOS_APP])]));
}
// ¿Terminaron las fases 1–4 de «Mejorar todo»? (si nunca empezó, no hay nada que esperar).
function fasesTerminadas(db) {
  const v = leerJson(db, AJUSTE_TODO_ESTADO, null);
  if (!v || typeof v !== 'object' || !v.fases || typeof v.fases !== 'object') return true;
  return Object.values(v.fases).every(x => x === 'hecha');
}

// Lo que ve la pantalla «Mejorando lo visual de la app» (fase 5): { fase, estado, pct, actual, actualizado }.
export function escribirEstado(db, { estado, actual, ahora }) {
  const r = leerRecorrido(db);
  const hechas = PANTALLAS.filter(p => r.pantallas[p.id]?.hecha).length;
  const pct = r.terminado ? 100 : Math.round((100 * hechas) / PANTALLAS.length);
  const v = { fase: 'visual', estado, pct, actual: String(actual).slice(0, 200), actualizado: iso(ahora) };
  const antes = leerJson(db, AJUSTE_ESTADO_APP, {});
  if (antes.estado !== v.estado || antes.actual !== v.actual || antes.pct !== v.pct) guardarAjuste(db, AJUSTE_ESTADO_APP, JSON.stringify(v));
  return v;
}
export const leerEstadoApp = db => leerJson(db, AJUSTE_ESTADO_APP, { fase: 'visual', estado: 'falta', pct: 0, actual: 'Todavía no empezó', actualizado: null });

// ---------- Lo que hace el servidor web (sin IA) ----------
// Un pedido del dueño (pantalla «Mejorar la app» u origen 'chat'). → la propuesta nueva (en fila) o null.
export function pedirMejora(db, { texto, origen = 'dueno', mensaje = null, ahora = Date.now() }) {
  const t = String(texto ?? '').trim().slice(0, LIMITES_APP.pedido);
  if (!t) return null;
  const lista = leerPropuestas(db);
  const p = { id: id12(`${origen}|${t}|${iso(ahora)}|${lista.length}`), origen: origen === 'chat' ? 'chat' : 'dueno', pedido: t, mensaje, estado: 'en_fila', creadaEn: iso(ahora), pantalla: null, base: null };
  guardarPropuestas(db, [...lista, p]);
  return p;
}
export function aprobarPropuesta(db, { id, usuarioId = null, ahora = Date.now() }) {
  return cambiarPropuesta(db, id, { estado: 'aprobado', aprobadaPor: usuarioId, aprobadaEn: iso(ahora) }, { si: 'esperando_aprobar' });
}
export function descartarPropuesta(db, { id, ahora = Date.now() }) {
  const p = cambiarPropuesta(db, id, { estado: 'no_paso', motivo: 'descartado_por_ti', terminadaEn: iso(ahora) }, { si: ['esperando_aprobar', 'esperando_token', 'en_fila'] });
  if (p) anotarApp(db, p, 'app_descartada', ahora);
  return p;
}
// «Deshacer el último cambio»: el último instalado (si es el último que subió Claude).
export function pedirDeshacer(db, { ahora = Date.now() }) {
  const lista = leerPropuestas(db);
  if (lista.some(enCamino)) return { ok: false, motivo: 'ocupado' };
  const ultimo = [...lista].reverse().find(x => x.commit);
  if (!ultimo || ultimo.estado !== 'instalado') return { ok: false, motivo: 'nada_que_deshacer' };
  cambiarPropuesta(db, ultimo.id, { estado: 'deshacer', deshacerEn: iso(ahora) }, { si: 'instalado' });
  return { ok: true, id: ultimo.id };
}
// «Revisar todo otra vez»: una ronda nueva del recorrido (lo de antes queda en la lista).
export function otraRonda(db, { ahora = Date.now() }) {
  const r = leerRecorrido(db);
  guardarRecorrido(db, { pantallas: {}, terminado: false, ronda: (r.ronda ?? 1) + 1, empezadaEn: iso(ahora) });
  guardarConfigApp(db, { activa: true, pausada: false });
  escribirEstado(db, { estado: 'ahora', actual: 'Empezando otra vuelta por todas las pantallas', ahora });
}
// El cambio completo para el desarrollador (Copiar / Descargar): el diff y el JSON del cambio. Nunca un token.
export function parcheParaDescargar(db, id) {
  const p = leerPropuestas(db).find(x => x.id === id);
  const d = p && leerDetalle(db, id);
  if (!d?.cambio) return null;
  return { id, titulo: p.titulo ?? null, explicacion: p.explicacion ?? null, base: p.base ?? null, diff: d.diff ?? '', cambio: d.cambio };
}

export function vistaApp(db, { ahora = Date.now(), pausadaIa = false, token = null } = {}) {
  const cfg = leerConfigApp(db);
  const lista = leerPropuestas(db);
  const r = leerRecorrido(db);
  const todo = topeTodo(db);
  return {
    config: cfg, pausadaIa, token, estado: leerEstadoApp(db),
    gastoMicro: gastoAppMicro(db), todo: todo == null ? null : { topeMicro: todo, gastoMicro: gastoTodoMicro(db) },
    pantallas: PANTALLAS.map(p => ({ id: p.id, nombre: p.nombre, hecha: Boolean(r.pantallas[p.id]?.hecha), cambios: r.pantallas[p.id]?.n ?? 0 })),
    terminado: r.terminado === true, ideas: leerIdeasApp(db).slice(-30).reverse(),
    propuestas: lista.slice(-40).reverse().map(p => ({ ...p, diff: ['esperando_aprobar', 'esperando_token', 'paso', 'probar', 'probando', 'subido', 'instalado', 'aprobado', 'no_paso'].includes(p.estado) ? (leerDetalle(db, p.id)?.diff ?? null) : null })),
    puedeDeshacer: !lista.some(enCamino) && [...lista].reverse().find(x => x.commit)?.estado === 'instalado',
    ahora: iso(ahora),
  };
}
// Para el chat: el estado de las propuestas que nacieron de un mensaje (lo muestra la burbuja).
export function estadosParaChat(db) {
  return Object.fromEntries(leerPropuestas(db).filter(p => p.origen === 'chat').slice(-60).map(p => [p.id, { estado: p.estado, titulo: p.titulo ?? null, motivo: p.motivo ?? null }]));
}

// ---------- Lo que hace el trabajador ----------
export const REGLAS_APP = `Eres un diseñador de interfaces y programador web experto. Mejoras la app «Academia de Aviación» (estudio para la licencia de piloto privado, en español de República Dominicana, para alumnos y su dueño, que no es técnico).
Meta: que la app se sienta PROFESIONAL, como las mejores apps de estudio y de preparación de exámenes (ideas de diseño, nunca copiar una marca): jerarquía visual limpia, el avance siempre claro, un modo examen que se sienta como el examen real, repasar fácil, memorizar con tarjetas, buen modo oscuro y accesible (contraste, tamaños, foco del teclado, textos para lectores de pantalla).
Prioridad: 1) las clases y el examen del alumno (más visual, más fácil de memorizar, más fácil de tomar el examen); 2) el perfil y el progreso del alumno; 3) el administrador: más control y orden (listas en un orden claro, filtros, navegación fácil).
Cómo trabajas: UN cambio chico y seguro por vez, que se note. Solo puedes tocar los archivos que te muestran (de public/: .js, .css, index.html) y los textos (por «textos», en español y en inglés). Nunca: src/, pruebas, el servidor, claves, pagos, cuentas, ni el texto de las preguntas del Test Guide (eso son datos).
Reglas del código (si no, el cambio se rechaza solo): nunca innerHTML/outerHTML/insertAdjacentHTML/eval; nunca estilos incrustados (style=, .style, setAttribute('style')): usa clases y CSS; nunca direcciones de internet ni fetch nuevos; los textos que ve la persona van con t('clave') y la clave en «textos». Usa las funciones que ya ves en el archivo (por ejemplo el(...), t(...)).
Cada cambio: «archivo», «buscar» (un pedazo EXACTO del archivo que aparece UNA sola vez, copiado tal cual, con sus espacios) y «reemplazar». Para agregar CSS al final de un .css: «buscar» vacío. Cambios chicos: pocos pedazos cortos.
Si lo que hay que hacer necesita cambiar el servidor (rutas nuevas, datos nuevos), no lo hagas: escríbelo en «idea_para_desarrollador» (en español simple).
Si la pantalla ya está bien y no hay nada importante que mejorar, responde «nada_importante»: true y cambios vacíos.
«titulo» y «explicacion»: en español MUY simple, para el dueño (qué cambia y por qué ayuda), sin palabras técnicas. Responde solo con el JSON pedido.`;
export const REGLAS_ELEGIR = `Ayudas al dueño de una app de estudio de aviación. Te dice qué quiere cambiar en la app. Elige la pantalla de la lista donde va ese cambio («pantalla»: su id). Si el cambio necesita el servidor (datos nuevos, rutas nuevas) y no solo cómo se ve, «posible»: false y explica en «idea» (español simple) lo que habría que hacer. Responde solo con el JSON pedido.`;
const ESQUEMA_PARCHE = Object.freeze({
  type: 'object', additionalProperties: false, required: ['nada_importante', 'titulo', 'explicacion', 'cambios', 'textos', 'idea_para_desarrollador'],
  properties: {
    nada_importante: { type: 'boolean' }, titulo: { type: 'string' }, explicacion: { type: 'string' },
    cambios: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['archivo', 'buscar', 'reemplazar'], properties: { archivo: { type: 'string' }, buscar: { type: 'string' }, reemplazar: { type: 'string' } } } },
    textos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['clave', 'es', 'en'], properties: { clave: { type: 'string' }, es: { type: 'string' }, en: { type: 'string' } } } },
    idea_para_desarrollador: { type: ['string', 'null'] },
  },
});
const ESQUEMA_ELEGIR = Object.freeze({
  type: 'object', additionalProperties: false, required: ['pantalla', 'posible', 'idea'],
  properties: { pantalla: { type: ['string', 'null'] }, posible: { type: 'boolean' }, idea: { type: ['string', 'null'] } },
});

function anotarApp(db, p, que, ahora, extra = {}) {
  try {
    anotarCambio(db, { que, estado: p.estado, detalle: [p.titulo, p.pedido, p.motivo].filter(Boolean).join(' · ').slice(0, 600) || null, despues: { pantalla: p.pantalla, origen: p.origen, commit: p.commit ? p.commit.slice(0, 7) : null, ...extra }, ...costoDe(db, `a:${p.id}:`), ahora });
  } catch { /* el registro nunca para el trabajo */ }
}
function avisar(db, clave, detalle, ahora) { try { abrirAviso(db, { clave, nivel: 'atencion', detalle, ahora }); } catch { /* sin aviso */ } }

// Lo que dice la versión instalada (lo escribe el actualizador del servidor; aquí solo se LEE).
function leerVersion(config, nombre) {
  try { const t = readFileSync(join(config.carpetaDatos, nombre), 'utf8').trim(); return SHA.test(t) ? t : null; } catch { return null; }
}

// Una pantalla terminó (o un intento): el recorrido avanza. Todo listo → «Terminé».
function avanzarRecorrido(db, p, final, ahora) {
  if (p.origen !== 'continuo' || !p.pantalla) return;
  const r = leerRecorrido(db);
  const e = { n: 0, intentos: 0, hecha: false, ...(r.pantallas[p.pantalla] ?? {}) };
  if (final === 'nada') e.hecha = true;
  else if (final === 'instalado') { e.n += 1; if (e.n >= LIMITES_APP.porPantalla) e.hecha = true; }
  else { e.intentos += 1; if (e.intentos >= LIMITES_APP.intentosPorPantalla) e.hecha = true; }
  r.pantallas[p.pantalla] = e;
  if (PANTALLAS.every(x => r.pantallas[x.id]?.hecha) && !r.terminado) {
    r.terminado = true;
    r.terminadoEn = iso(ahora);
    avisar(db, `app_termino:r${r.ronda ?? 1}`, { ronda: r.ronda ?? 1 }, ahora);
  }
  guardarRecorrido(db, r);
}
export function terminar(db, p, estado, ahora, extra = {}, { si = null } = {}) {
  const q = cambiarPropuesta(db, p.id, { estado, terminadaEn: iso(ahora), ...extra }, { si });
  if (!q) return null;
  avanzarRecorrido(db, q, estado, ahora);
  const que = { instalado: 'app_instalada', no_paso: 'app_no_paso', rechazado: 'app_rechazada', deshecho: 'app_deshecha', nada: 'app_nada', fallido: 'app_fallida', conflicto: 'app_conflicto', idea: 'app_idea' }[estado];
  if (que) anotarApp(db, q, que, ahora);
  return q;
}

// ¿Se puede llamar? (los topes de este uso). → { ok, motivo?, esperarMs? }
function puedeApp(db, config, { p, bytes, ahora, cfgFabrica, puedeLlamar }) {
  const chat = p.origen === 'chat';
  const proposito = chat ? 'chat_app' : 'app_mejorar';
  const cfgApp = leerConfigApp(db);
  const puede = puedeLlamar(db, config, { proposito, bytes, ahora, topeMicro: chat ? cfgFabrica.chat.topeMicro : cfgApp.topeMicro, gastado: chat ? gastoChatAppMicro(db) : gastoAppMicro(db) });
  if (!puede.ok) return { ...puede, proposito };
  const todo = topeTodo(db);
  if (p.origen === 'continuo' && todo != null && gastoTodoMicro(db) + puede.reserva > todo) return { ok: false, motivo: 'tope_todo', proposito };
  return { ...puede, proposito };
}

// Prepara la copia de main para la base de la propuesta. → { listo: true, arbol } o { listo: false, seguir, motivo }
async function prepararFuente(ctx, p, ahora) {
  const { db, config } = ctx;
  const f = leerFuente(db);
  const arbol = carpetaArbol(config, p.base);
  if (f.sha === p.base && f.listo && !f.sucia && existsSync(join(arbol, 'package.json'))) return { listo: true, arbol };
  const tgz = archivoTgz(config, p.base);
  if (f.sha !== p.base || !f.bajada || !existsSync(tgz)) {
    const r = await bajarFuente(config, { repo: leerConfigApp(db).repo, commit: p.base, archivo: tgz, senal: ctx.senal });
    await ctx.escribir(() => guardarFuente(db, { sha: p.base, bajada: r.motivo === 'ok', listo: false, sucia: false, motivo: r.motivo === 'ok' ? null : r.motivo, en: iso(ahora) }));
    return { listo: false, seguir: r.motivo === 'ok', motivo: r.motivo };
  }
  let r;
  try { r = abrirTgz(readFileSync(tgz), arbol); } catch { r = { ok: false, motivo: 'fuente_rota' }; }
  await ctx.escribir(() => guardarFuente(db, { sha: p.base, listo: r.ok, sucia: false, bajada: r.ok, archivos: r.archivos ?? null, motivo: r.ok ? null : r.motivo, en: iso(ahora) }));
  return { listo: false, seguir: r.ok, motivo: r.motivo };
}

function ideasGuardadas(db) {
  const v = leerJson(db, AJUSTE_IDEAS_FUTURO, []);
  const lista = Array.isArray(v) ? v : Array.isArray(v?.ideas) ? v.ideas : [];
  return lista.slice(-12).map(x => String(typeof x === 'string' ? x : x?.texto ?? x?.idea ?? x?.titulo ?? '').slice(0, 200)).filter(Boolean);
}

async function pensar(ctx, p, { ahora, cfg, puedeLlamar }) {
  const { db, config } = ctx;
  const cfgApp = leerConfigApp(db);
  // 1. La base: main, y solo si main ya es lo instalado (nunca se encima a una actualización que espera). Mientras Claude
  // no respondió, se vuelve a mirar (otro cambio pudo subir en el medio); después, la base queda fija.
  const yaRespondio = Boolean(leerDetalle(db, p.id)?.respuesta);
  if (!p.base || !yaRespondio) {
    const m = await shaDeMain(db, config, { repo: cfgApp.repo, senal: ctx.senal });
    if (m.motivo !== 'ok') { await ctx.escribir(() => escribirEstado(db, { estado: 'ahora', actual: 'No pude leer la versión de GitHub; lo intento después', ahora })); return { trabajo: true, seguir: false, motivo: m.motivo }; }
    const instalada = leerVersion(config, 'version.txt');
    if (instalada && instalada !== m.sha) { await ctx.escribir(() => escribirEstado(db, { estado: 'ahora', actual: 'Esperando que el servidor instale la última versión', ahora })); return { trabajo: false, motivo: 'esperando_instalacion' }; }
    if (p.base !== m.sha) await ctx.escribir(() => cambiarPropuesta(db, p.id, { base: m.sha }));
    p = { ...p, base: m.sha };
  }
  const f = await prepararFuente(ctx, p, ahora);
  if (!f.listo) return f.seguir ? { trabajo: true, seguir: true } : { trabajo: true, seguir: false, motivo: f.motivo };
  const leer = lectorDeArbol(f.arbol);
  const det = leerDetalle(db, p.id) ?? {};
  // 2. Un pedido del dueño: primero dónde va (si no se sabe).
  if (!p.pantalla) {
    let elegido = det.elegir ?? null;
    if (!elegido) {
      const texto = `${TAREA_ELEGIR}\n${datos({ pedido_del_dueno: p.pedido, pantallas: mapaDeLaApp(leer) })}`;
      const bytes = Buffer.byteLength(REGLAS_ELEGIR) + Buffer.byteLength(texto) + Buffer.byteLength(JSON.stringify(ESQUEMA_ELEGIR));
      const puede = puedeApp(db, config, { p, bytes, ahora, cfgFabrica: cfg, puedeLlamar });
      if (!puede.ok) return sinSaldo(ctx, p, puede, ahora);
      const r = await ctx.ia.pedir({ proposito: puede.proposito, paso: `a:${p.id}:elegir`, sistema: REGLAS_ELEGIR, texto, esquema: ESQUEMA_ELEGIR,
        guardar: (dbx, json) => guardarDetalle(dbx, p.id, { ...(leerDetalle(dbx, p.id) ?? {}), elegir: json }) });
      if (!r.usada) return fallaIa(ctx, p, r, ahora);
      elegido = r.json;
    }
    if (!elegido.posible || !pantallaDe(elegido.pantalla)) {
      await ctx.escribir(() => {
        guardarIdea(db, { texto: elegido.idea ?? p.pedido, de: p.id, ahora });
        terminar(db, p, 'idea', ahora, { explicacion: String(elegido.idea ?? '').slice(0, 600) || null });
      });
      return { trabajo: true, seguir: true };
    }
    await ctx.escribir(() => cambiarPropuesta(db, p.id, { pantalla: elegido.pantalla }));
    p = { ...p, pantalla: elegido.pantalla };
  }
  // 3. El cambio.
  const pantalla = pantallaDe(p.pantalla);
  let json = det.respuesta ?? null;
  if (!json) {
    await ctx.escribir(() => escribirEstado(db, { estado: 'ahora', actual: `Mejorando ${pantalla.nombre}`, ahora }));
    const pide = p.origen === 'continuo' ? { revisa_esta_pantalla: pantalla.nombre, ideas_guardadas: ideasGuardadas(db) } : { pedido_del_dueno: p.pedido, pantalla: pantalla.nombre };
    const texto = `${TAREA_APP}\n${datos(pide)}`;
    // Si no cabe, se manda menos de cada archivo (nunca se deja de intentar por largo).
    let sistema = '';
    let bytes = Infinity;
    for (const f of [1, 0.75, 0.5, 0.35]) {
      const limites = Object.fromEntries(Object.entries(CONTEXTO).map(([k, v]) => [k, Math.floor(v * f)]));
      sistema = `${REGLAS_APP}\n\nPANTALLA: ${pantalla.nombre}\nLO QUE TIENE AHORA:\n${datos(contextoDePantalla(leer, pantalla, { limites }))}`;
      bytes = Buffer.byteLength(sistema) + Buffer.byteLength(texto) + Buffer.byteLength(JSON.stringify(ESQUEMA_PARCHE));
      if (bytes + 200 <= PROPOSITOS.app_mejorar.entradaMaxBytes) break;
    }
    const puede = puedeApp(db, config, { p, bytes, ahora, cfgFabrica: cfg, puedeLlamar });
    if (!puede.ok) {
      if (puede.motivo === 'demasiado_largo') { await ctx.escribir(() => terminar(db, p, 'fallido', ahora, { motivo: 'demasiado_largo' })); return { trabajo: true, seguir: true }; }
      return sinSaldo(ctx, p, puede, ahora);
    }
    const r = await ctx.ia.pedir({ proposito: puede.proposito, paso: `a:${p.id}:parche`, sistema, texto, esquema: ESQUEMA_PARCHE,
      guardar: (dbx, j) => guardarDetalle(dbx, p.id, { ...(leerDetalle(dbx, p.id) ?? {}), respuesta: j }) });
    if (!r.usada) return fallaIa(ctx, p, r, ahora);
    json = r.json;
  }
  // 4. Revisar en código (sin probar todavía).
  await ctx.escribir(() => {
    if (json.idea_para_desarrollador) guardarIdea(db, { texto: json.idea_para_desarrollador, de: p.id, ahora });
    if (json.nada_importante && !(json.cambios?.length || json.textos?.length)) return terminar(db, p, 'nada', ahora, { titulo: String(json.titulo ?? '').slice(0, LIMITES_PARCHE.titulo) || null });
    const a = aplicarParche(json, leer);
    if (!a.ok) return terminar(db, p, 'rechazado', ahora, { motivo: a.motivo, titulo: String(json.titulo ?? '').slice(0, LIMITES_PARCHE.titulo) || null });
    const cambio = { titulo: a.titulo, explicacion: a.explicacion, cambios: json.cambios ?? [], textos: json.textos ?? [] };
    guardarDetalle(db, p.id, { ...(leerDetalle(db, p.id) ?? {}), cambio, diff: a.diff, archivos: a.archivos.map(x => ({ archivo: x.archivo, huellaAntes: x.huellaAntes, huellaDespues: x.huellaDespues })) });
    cambiarPropuesta(db, p.id, { estado: 'probar', titulo: a.titulo, explicacion: a.explicacion, archivos: a.resumen });
    escribirEstado(db, { estado: 'ahora', actual: `Probando el cambio: ${a.titulo}`, ahora });
    return null;
  });
  return { trabajo: true, seguir: true };
}
function guardarIdea(db, { texto, de, ahora }) {
  const t = String(texto ?? '').trim().slice(0, 600);
  if (!t) return;
  guardarAjuste(db, AJUSTE_IDEAS_APP, JSON.stringify([...leerIdeasApp(db), { texto: t, de, en: iso(ahora) }].slice(-100)));
}
async function sinSaldo(ctx, p, puede, ahora) {
  const { db } = ctx;
  if (puede.motivo === 'demasiadas_llamadas' && puede.esperarMs) return { trabajo: true, seguir: false, esperarMs: puede.esperarMs, motivo: puede.motivo };
  const saldo = SALDO.has(puede.motivo);
  await ctx.escribir(() => {
    cambiarPropuesta(db, p.id, { espera: puede.motivo });
    escribirEstado(db, { estado: saldo ? 'pausada' : 'ahora', actual: saldo ? 'Pausado: se acabó el saldo' : 'Esperando a que la IA esté lista', ahora });
  });
  return { trabajo: true, seguir: false, motivo: puede.motivo };
}
async function fallaIa(ctx, p, r, ahora) {
  const { db } = ctx;
  if (SALDO.has(r.motivo)) return sinSaldo(ctx, p, r, ahora);
  const intentos = (p.intentos ?? 0) + 1;
  await ctx.escribir(() => {
    if (intentos >= 2) terminar(db, p, 'fallido', ahora, { motivo: r.motivo, intentos });
    else cambiarPropuesta(db, p.id, { intentos, espera: r.motivo });
  });
  return { trabajo: true, seguir: false, motivo: r.motivo };
}

// Vuelve a armar los archivos del cambio sobre la copia (que debe estar limpia) y comprueba que son los probados.
function archivosDelCambio(db, config, p) {
  const d = leerDetalle(db, p.id);
  if (!d?.cambio) return { ok: false, motivo: 'sin_cambio' };
  const a = aplicarParche(d.cambio, lectorDeArbol(carpetaArbol(config, p.base)));
  if (!a.ok) return { ok: false, motivo: a.motivo };
  const huellas = new Map((d.archivos ?? []).map(x => [x.archivo, x]));
  if (a.archivos.length !== huellas.size || a.archivos.some(x => huellas.get(x.archivo)?.huellaDespues !== x.huellaDespues)) return { ok: false, motivo: 'cambio_distinto' };
  return { ok: true, archivos: a.archivos };
}

async function subir(ctx, p, ahora) {
  const { db, config } = ctx;
  const cfgApp = leerConfigApp(db);
  if (!(await hayToken(db, config))) {
    await ctx.escribir(() => {
      cambiarPropuesta(db, p.id, { estado: 'esperando_token' }, { si: ['paso', 'aprobado'] });
      avisar(db, 'app_token:falta', {}, ahora);
      escribirEstado(db, { estado: 'pausada', actual: 'Falta el permiso de GitHub: pega el token en Claves', ahora });
    });
    return { trabajo: true, seguir: true };
  }
  const f = leerFuente(db);
  if (f.sha !== p.base || !f.listo || f.sucia) {
    const r = await prepararFuente(ctx, p, ahora);
    if (!r.listo) return r.seguir ? { trabajo: true, seguir: true } : { trabajo: true, seguir: false, motivo: r.motivo };
  }
  const a = archivosDelCambio(db, config, p);
  if (!a.ok) { await ctx.escribir(() => terminar(db, p, 'fallido', ahora, { motivo: a.motivo })); return { trabajo: true, seguir: true }; }
  await ctx.escribir(() => escribirEstado(db, { estado: 'ahora', actual: `Subiendo el cambio: ${p.titulo ?? ''}`, ahora }));
  const r = await subirCambio(db, config, { repo: cfgApp.repo, base: p.base, archivos: a.archivos.map(x => ({ archivo: x.archivo, despues: x.despues })),
    mensaje: `Claude mejora la app: ${p.titulo ?? 'un cambio'}`.slice(0, 200), rama: `claude-app/${p.id}`, marca: `[claude-app ${p.id}]`, senal: ctx.senal });
  await ctx.escribir(() => {
    try { resolverAviso(db, 'app_token:falta', ahora); } catch { /* no estaba */ }
    if (r.motivo === 'ok') {
      cambiarPropuesta(db, p.id, { estado: 'subido', commit: r.commit, rama: `claude-app/${p.id}`, subidaEn: iso(ahora) });
      anotarApp(db, { ...p, commit: r.commit }, 'app_subida', ahora);
      escribirEstado(db, { estado: 'ahora', actual: 'Esperando que el servidor lo pruebe otra vez y lo instale', ahora });
    } else if (r.motivo === 'conflicto') terminar(db, p, 'conflicto', ahora, { motivo: 'conflicto' });
    else if (['token_no_valido', 'token_sin_permiso', 'sin_clave'].includes(r.motivo)) {
      cambiarPropuesta(db, p.id, { estado: 'esperando_token', motivo: r.motivo });
      avisar(db, 'app_token:falta', { motivo: r.motivo }, ahora);
    } else cambiarPropuesta(db, p.id, { espera: r.motivo });
  });
  return { trabajo: true, seguir: r.motivo === 'ok' || r.motivo === 'conflicto' };
}

async function deshacer(ctx, p, ahora, { solo = false } = {}) {
  const { db, config } = ctx;
  const r = await deshacerCambio(db, config, { repo: leerConfigApp(db).repo, commit: p.commit, mensaje: `Deshacer: ${p.titulo ?? 'cambio de Claude'}`.slice(0, 200), marca: `[claude-app deshacer ${p.id}]`, senal: ctx.senal });
  await ctx.escribir(() => {
    if (r.motivo === 'ok') {
      terminar(db, p, 'deshecho', ahora, { deshechoCon: r.commit, solo });
      avisar(db, `app_deshecha:${p.id}`, { titulo: p.titulo ?? '' }, ahora);
    } else if (r.motivo === 'conflicto') terminar(db, p, solo ? 'no_paso' : 'instalado', ahora, { motivo: 'no_se_pudo_deshacer' });
    else cambiarPropuesta(db, p.id, { espera: r.motivo });
  });
  return { trabajo: true, seguir: r.motivo === 'ok' };
}

// UN paso. soloPedidos: no empieza una vuelta nueva del modo solo (lo que ya está en camino sí sigue).
// → { trabajo: false } (nada que hacer ahora, sin gastar) o { trabajo: true, seguir, motivo?, esperarMs? }.
export async function mejorarApp(ctx, { ahora, cfg, soloPedidos = false, puedeLlamar }) {
  const { db, config } = ctx;
  if (cfg?.pausada) return { trabajo: false };
  const cfgApp = leerConfigApp(db);
  const lista = leerPropuestas(db);
  const activos = lista.filter(x => ACTIVOS.includes(x.estado));
  // Lo que ya pasó de «pensando» (o un pedido del dueño) va primero; una pantalla del modo solo que todavía piensa nunca
  // tapa un pedido del dueño (ni con el modo solo en pausa o sin saldo).
  const p = activos.find(x => !(x.origen === 'continuo' && x.estado === 'pensando'));
  if (p) {
    switch (p.estado) {
      case 'pensando': return pensar(ctx, p, { ahora, cfg, puedeLlamar });
      case 'probar': case 'probando': return { trabajo: false };
      case 'paso':
        if (!cfgApp.autoSubir) {
          await ctx.escribir(() => {
            cambiarPropuesta(db, p.id, { estado: 'esperando_aprobar' }, { si: 'paso' });
            avisar(db, `app_lista:${p.id}`, { titulo: p.titulo ?? '' }, ahora);
            escribirEstado(db, { estado: 'ahora', actual: 'Un cambio pasó las pruebas y espera que lo apruebes', ahora });
          });
          return { trabajo: true, seguir: true };
        }
        return subir(ctx, p, ahora);
      case 'aprobado': return subir(ctx, p, ahora);
      case 'esperando_token':
        if (await hayToken(db, config)) { await ctx.escribir(() => cambiarPropuesta(db, p.id, { estado: cfgApp.autoSubir || p.aprobadaEn ? 'aprobado' : 'esperando_aprobar' }, { si: 'esperando_token' })); return { trabajo: true, seguir: true }; }
        return { trabajo: false };
      case 'esperando_aprobar': return { trabajo: false };
      case 'subido': {
        const instalada = leerVersion(config, 'version.txt');
        const mala = leerVersion(config, 'version.bad');
        if (instalada === p.commit) {
          await ctx.escribir(() => { terminar(db, p, 'instalado', ahora); avisar(db, `app_instalada:${p.id}`, { titulo: p.titulo ?? '' }, ahora); escribirEstado(db, { estado: 'ahora', actual: `Listo, ya está instalado: ${p.titulo ?? ''}`, ahora }); });
          return { trabajo: true, seguir: true };
        }
        if (mala === p.commit) {
          await ctx.escribir(() => cambiarPropuesta(db, p.id, { estado: 'no_instalado', motivo: 'el_servidor_no_lo_instalo' }, { si: 'subido' }));
          return { trabajo: true, seguir: true };
        }
        return { trabajo: false };
      }
      case 'no_instalado': return deshacer(ctx, p, ahora, { solo: true });
      case 'deshacer': return deshacer(ctx, p, ahora);
      default: return { trabajo: false };
    }
  }
  // Nada en camino: el próximo pedido del dueño, o la pantalla del modo solo (la que ya piensa, o la siguiente).
  const pedido = lista.find(x => x.estado === 'en_fila');
  if (pedido) { await ctx.escribir(() => cambiarPropuesta(db, pedido.id, { estado: 'pensando', empezadaEn: iso(ahora) }, { si: 'en_fila' })); return { trabajo: true, seguir: true }; }
  if (soloPedidos) return { trabajo: false };
  const r = leerRecorrido(db);
  const continuo = activos.find(x => x.origen === 'continuo');
  if (r.terminado && !continuo) { await ctx.escribir(() => escribirEstado(db, { estado: 'hecha', actual: 'Terminé: todo revisado y mejorado', ahora })); return { trabajo: false }; }
  if (cfgApp.pausada || !cfgApp.activa) { await ctx.escribir(() => escribirEstado(db, { estado: 'pausada', actual: 'Pausado por ti', ahora })); return { trabajo: false }; }
  if (!fasesTerminadas(db)) { await ctx.escribir(() => escribirEstado(db, { estado: 'falta', actual: 'Empieza cuando terminen las fases del contenido', ahora })); return { trabajo: false }; }
  if (continuo) return pensar(ctx, continuo, { ahora, cfg, puedeLlamar });
  const siguiente = PANTALLAS.find(x => !r.pantallas[x.id]?.hecha);
  if (!siguiente) return { trabajo: false };
  await ctx.escribir(() => {
    const todas = leerPropuestas(db);
    anotarPropositosTodo(db);
    guardarPropuestas(db, [...todas, { id: id12(`continuo|${siguiente.id}|${iso(ahora)}|${todas.length}`), origen: 'continuo', pantalla: siguiente.id, pedido: null, estado: 'pensando', creadaEn: iso(ahora), base: null }]);
    escribirEstado(db, { estado: 'ahora', actual: `Mejorando ${siguiente.nombre}`, ahora });
  });
  return { trabajo: true, seguir: true };
}
