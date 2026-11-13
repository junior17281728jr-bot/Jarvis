// Academia 0.7.2: el plan de estudio de cada alumno y el panel «Grupo».
//  - Plan: al entrar por primera vez el alumno elige «1 mes» (recomendado), «2 meses» o «Repaso de 15 días». El examen
//    es siempre el mismo; el plan solo marca el ritmo. La fecha estimada de fin se ADAPTA: sale de mezclar el ritmo del
//    plan con el ritmo real (temas y exámenes aprobados por día), así que quien avanza más rápido termina antes.
//  - Grupo: cada alumno ve en qué materia va cada compañero (para motivarse): materia actual, % del camino, racha y
//    medallas. NUNCA notas, errores, respuestas ni conexión (eso es solo del administrador). El administrador lo puede
//    apagar (ajuste «academia.grupo») y cada alumno se puede ocultar (los demás no lo ven).
// Todo va en «ajustes» (clave por alumno): sin cambio de base (la vuelta atrás a la 0.7.1 sigue igual).
import { ErrorHttp } from '../nucleo/http.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { MATERIAS } from './formato.js';
import { avataresDe } from '../cuentas/perfil.js';
import { nombreLegalDe } from '../cuentas/terminos.js';
import { grupoEncendido, temasAprobados, temasLeidos, examenes, puntosYRacha, porMateria, diaDe, pasosDeTemas, avanceTema } from './progreso.js';

export const PLANES_ESTUDIO = Object.freeze({ un_mes: 30, dos_meses: 60, repaso_15: 15 });
export const PLAN_RECOMENDADO = 'un_mes';
const DIA_MS = 24 * 3600 * 1000;
// Una materia que el paquete todavía no trae cuenta como el promedio de las que sí (o 8 pasos si no hay ninguna).
const PASOS_SIN_CONTENIDO = 8;

const clavePlan = id => `academia.plan.${Number(id)}`;
const claveOculto = id => `academia.grupo_oculto.${Number(id)}`;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS);
const sumarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

function leerPlan(db, usuarioId) {
  try {
    const p = JSON.parse(leerAjuste(db, clavePlan(usuarioId)) ?? 'null');
    return p && Object.hasOwn(PLANES_ESTUDIO, p.plan) && /^\d{4}-\d{2}-\d{2}$/.test(p.desde) ? p : null;
  } catch { return null; }
}

// Cuántos «pasos» tiene el camino entero (cada tema y cada examen de materia) y cuántos ya hizo el alumno.
export function pasosDelCamino(db, usuarioId, paquete) {
  const aprobados = temasAprobados(db, usuarioId);
  const leidos = temasLeidos(db, usuarioId);
  const deExamen = examenes(db, usuarioId);
  const conContenido = (paquete?.materias ?? []).filter(m => m.temas.length);
  const promedio = conContenido.length ? conContenido.reduce((n, m) => n + m.temas.length + 1, 0) / conContenido.length : PASOS_SIN_CONTENIDO;
  let total = 0;
  let hechos = 0;
  let actual = null;
  for (const id of MATERIAS) {
    const m = paquete?.materias.find(x => x.id === id);
    if (!m || !m.temas.length) { total += promedio; if (actual == null) actual = id; continue; }
    total += m.temas.length + 1;
    const temasHechos = m.temas.filter(t => aprobados.get(`${id}/${t.id}`)?.aprobado || (!t.preguntas.length && leidos.has(`${id}/${t.id}`))).length;
    const examen = deExamen.get(id)?.aprobado === true;
    hechos += temasHechos + (examen ? 1 : 0);
    if (actual == null && !(temasHechos === m.temas.length && examen)) actual = id;
  }
  return { total: Math.round(total), hechos, actual };
}

// 0.12.4: UNA sola cuenta para el último día (antes el alumno veía «12 dic» al elegir y el administrador «11 dic»): hoy
// cuenta como el día 1, así un plan de 30 días que empieza el 12 nov termina el 11 dic, y lo que falta al ritmo de hoy
// (n días de trabajo) termina el día n contando hoy.
export const ultimoDia = (desde, dias) => sumarDias(desde, Math.max(1, dias) - 1);

export function planDe(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const p = leerPlan(db, usuarioId);
  const hoy = diaDe(ahoraMs);
  const opciones = Object.entries(PLANES_ESTUDIO).map(([id, dias]) => ({ id, dias, recomendado: id === PLAN_RECOMENDADO, fin: ultimoDia(hoy, dias) }));
  if (!p) return { elegido: null, opciones };
  const dias = PLANES_ESTUDIO[p.plan];
  const { total, hechos } = pasosDelCamino(db, usuarioId, paquete);
  const pasados = Math.max(1, diasEntre(p.desde, hoy) + 1);
  const ritmoPlan = total / dias;
  // Los primeros 3 días manda el ritmo del plan; después, más el ritmo real (nunca menos de un paso cada 20 días).
  const ritmoReal = hechos / pasados;
  const ritmo = Math.max(0.05, pasados < 3 ? ritmoPlan : 0.4 * ritmoPlan + 0.6 * ritmoReal);
  const faltan = Math.max(0, total - hechos);
  const finPlan = ultimoDia(p.desde, dias);
  const fin = faltan ? ultimoDia(hoy, Math.ceil(faltan / ritmo - 1e-9)) : hoy;
  const diferencia = diasEntre(finPlan, fin);
  return {
    elegido: p.plan, dias, desde: p.desde, finPlan, fin, total, hechos, faltan,
    pct: total ? Math.min(100, Math.floor((hechos * 100) / total)) : 0,
    metaHoy: Math.max(1, Math.ceil(ritmoPlan)),
    ritmo: faltan === 0 ? 'terminado' : diferencia < -1 ? 'adelantado' : diferencia > 1 ? 'atrasado' : 'a_tiempo',
    opciones,
  };
}

export function elegirPlan(db, usuarioId, paquete, plan, ahoraMs = Date.now()) {
  if (typeof plan !== 'string' || !Object.hasOwn(PLANES_ESTUDIO, plan)) throw new ErrorHttp(400, 'plan_estudio_no_valido');
  const antes = leerPlan(db, usuarioId);
  // Cambiar de plan no borra lo hecho: el ritmo se cuenta desde el día en que empezó.
  guardarAjuste(db, clavePlan(usuarioId), JSON.stringify({ plan, desde: antes?.desde ?? diaDe(ahoraMs) }));
  return planDe(db, usuarioId, paquete, ahoraMs);
}

// ---------- Grupo ----------
export function ocultoEnGrupo(db, usuarioId) {
  return leerAjuste(db, claveOculto(usuarioId)) === '1';
}
export function ocultarEnGrupo(db, usuarioId, oculto) {
  if (typeof oculto !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, claveOculto(usuarioId), oculto ? '1' : '0');
}

// 0.12.3: si el nombre en la app es su nombre legal completo, a los compañeros solo «Nombre A.».
export function nombreParaElGrupo(legal, visible) {
  if (!legal || visible !== legal.completo) return visible;
  return `${legal.nombre} ${legal.apellido.slice(0, 1).toUpperCase()}.`;
}

// 0.12.5: la «ruta» del curso para el Grupo: las materias con contenido y sus temas (id y título), en orden.
export function mapaDelGrupo(paquete) {
  return (paquete?.materias ?? []).filter(m => m.temas.length).map(m => ({ materia: m.id, temas: m.temas.map(t => ({ id: t.id, titulo: t.titulo })) }));
}
// 0.12.5: dónde va un compañero en esa ruta, SIN notas: el tema en que está (el primero que no aprobó, como el Camino;
// null si aprobó todos) y qué temas terminó (vio la clase e hizo la práctica: morado) o dominó (aprobó: dorado).
// Solo ids «<materia>/<tema>»: ni porcentajes, ni intentos, ni respuestas.
export function rutaDeCompanero(db, usuarioId, paquete) {
  const aprobados = temasAprobados(db, usuarioId);
  const leidos = temasLeidos(db, usuarioId);
  const pasos = pasosDeTemas(db, usuarioId);
  let actual = null;
  const terminados = [];
  const dominados = [];
  for (const m of paquete?.materias ?? []) {
    for (const t of m.temas) {
      const k = `${m.id}/${t.id}`;
      const a = aprobados.get(k);
      const aprobado = a?.aprobado === true || (!t.preguntas.length && leidos.has(k));
      const nivel = avanceTema(pasos[k] ?? null, a, aprobado, !t.preguntas.length).nivel;
      if (nivel === 'dominado') dominados.push(k);
      else if (nivel === 'terminado') terminados.push(k);
      if (!aprobado && actual == null) actual = k;
    }
  }
  return { actual, terminados, dominados };
}

// Lo que ve un alumno del grupo. Solo estos campos, a propósito (test/academia-plan.test.js lo cuida).
export function grupoDe(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const grupo = grupoEncendido(db);
  const yoOculto = ocultoEnGrupo(db, usuarioId);
  if (!grupo) return { activo: false, oculto: yoOculto, materias: MATERIAS.length, companeros: [] };
  const filas = db.prepare("SELECT id, nombre, nombre_visible, rol FROM usuarios WHERE activo = 1 ORDER BY id").all();
  const companeros = [];
  const avatares = avataresDe(db);
  const legales = new Map(filas.map(u => [u.id, nombreLegalDe(db, u.id)]));
  for (const u of filas) {
    const soyYo = u.id === usuarioId;
    // Un administrador sale solo si también estudia (eligió un plan); cualquiera se puede ocultar.
    if (!soyYo && ((u.rol === 'admin' && !leerPlan(db, u.id)) || ocultoEnGrupo(db, u.id))) continue;
    const { total, hechos, actual } = pasosDelCamino(db, u.id, paquete);
    const deExamen = examenes(db, u.id);
    const perfectos = [...temasAprobados(db, u.id).values()].filter(x => x.aprobado && x.mejor === 100).length;
    companeros.push({
      tu: soyYo,
      // 0.12.3: el nombre en la app de un alumno es su Nombre y Apellido de verdad (lo confirma al firmar): a los demás
      // del grupo solo se les muestra el nombre y la inicial del apellido («Ana María P.»). Él y el administrador, todo.
      nombre: soyYo ? u.nombre_visible || u.nombre : nombreParaElGrupo(legales.get(u.id), u.nombre_visible || u.nombre),
      // 0.9.0: el avatar que eligió (o null). Su «meta» NO va aquí: es solo suya y del administrador.
      avatar: avatares.get(u.id) ?? null,
      materia: actual ?? MATERIAS[MATERIAS.length - 1],
      lugar: actual ? MATERIAS.indexOf(actual) : MATERIAS.length,
      pct: total ? Math.min(100, Math.floor((hechos * 100) / total)) : 0,
      racha: puntosYRacha(db, u.id, ahoraMs).racha,
      medallas: [...deExamen.values()].filter(x => x.aprobado).length + perfectos,
      // 0.12.5: su avión en la ruta del curso (solo el tema y qué temas terminó o dominó).
      ruta: rutaDeCompanero(db, u.id, paquete),
    });
  }
  companeros.sort((a, b) => b.pct - a.pct || a.nombre.localeCompare(b.nombre));
  return { activo: true, oculto: yoOculto, materias: MATERIAS.length, mapa: mapaDelGrupo(paquete), companeros };
}

// La preparación para el examen (estimación): preguntas cuya ÚLTIMA respuesta fue correcta, sobre todas las del
// contenido en uso. Se muestra como un medidor («altímetro»), nunca como promesa de aprobar.
export function preparacionDe(db, usuarioId, paquete) {
  const lista = porMateria(db, usuarioId, paquete);
  const total = lista.reduce((n, m) => n + m.preguntas, 0);
  const bien = lista.reduce((n, m) => n + m.bien, 0);
  return { pct: total ? Math.floor((bien * 100) / total) : 0, bien, total };
}

// Lo que se agrega al camino y al progreso del alumno (en la misma respuesta: la pantalla no pide nada más al abrir).
export function extrasAlumno(db, usuarioId, paquete, ahoraMs = Date.now()) {
  return { plan: planDe(db, usuarioId, paquete, ahoraMs), grupo: grupoDe(db, usuarioId, paquete, ahoraMs), preparacion: preparacionDe(db, usuarioId, paquete) };
}
