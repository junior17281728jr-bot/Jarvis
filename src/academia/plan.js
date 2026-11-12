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
import { grupoEncendido, temasAprobados, temasLeidos, examenes, puntosYRacha, porMateria, diaDe } from './progreso.js';

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
function pasosDelCamino(db, usuarioId, paquete) {
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

export function planDe(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const p = leerPlan(db, usuarioId);
  const hoy = diaDe(ahoraMs);
  const opciones = Object.entries(PLANES_ESTUDIO).map(([id, dias]) => ({ id, dias, recomendado: id === PLAN_RECOMENDADO, fin: sumarDias(hoy, dias) }));
  if (!p) return { elegido: null, opciones };
  const dias = PLANES_ESTUDIO[p.plan];
  const { total, hechos } = pasosDelCamino(db, usuarioId, paquete);
  const pasados = Math.max(1, diasEntre(p.desde, hoy) + 1);
  const ritmoPlan = total / dias;
  // Los primeros 3 días manda el ritmo del plan; después, más el ritmo real (nunca menos de un paso cada 20 días).
  const ritmoReal = hechos / pasados;
  const ritmo = Math.max(0.05, pasados < 3 ? ritmoPlan : 0.4 * ritmoPlan + 0.6 * ritmoReal);
  const faltan = Math.max(0, total - hechos);
  const finPlan = sumarDias(p.desde, dias - 1);
  const fin = faltan ? sumarDias(hoy, Math.ceil(faltan / ritmo)) : hoy;
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

// Lo que ve un alumno del grupo. Solo estos campos, a propósito (test/academia-plan.test.js lo cuida).
export function grupoDe(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const grupo = grupoEncendido(db);
  const yoOculto = ocultoEnGrupo(db, usuarioId);
  if (!grupo) return { activo: false, oculto: yoOculto, materias: MATERIAS.length, companeros: [] };
  const filas = db.prepare("SELECT id, nombre, nombre_visible, rol FROM usuarios WHERE activo = 1 ORDER BY id").all();
  const companeros = [];
  const avatares = avataresDe(db);
  for (const u of filas) {
    const soyYo = u.id === usuarioId;
    // Un administrador sale solo si también estudia (eligió un plan); cualquiera se puede ocultar.
    if (!soyYo && ((u.rol === 'admin' && !leerPlan(db, u.id)) || ocultoEnGrupo(db, u.id))) continue;
    const { total, hechos, actual } = pasosDelCamino(db, u.id, paquete);
    const deExamen = examenes(db, u.id);
    const perfectos = [...temasAprobados(db, u.id).values()].filter(x => x.aprobado && x.mejor === 100).length;
    companeros.push({
      tu: soyYo,
      nombre: u.nombre_visible || u.nombre,
      // 0.9.0: el avatar que eligió (o null). Su «meta» NO va aquí: es solo suya y del administrador.
      avatar: avatares.get(u.id) ?? null,
      materia: actual ?? MATERIAS[MATERIAS.length - 1],
      lugar: actual ? MATERIAS.indexOf(actual) : MATERIAS.length,
      pct: total ? Math.min(100, Math.floor((hechos * 100) / total)) : 0,
      racha: puntosYRacha(db, u.id, ahoraMs).racha,
      medallas: [...deExamen.values()].filter(x => x.aprobado).length + perfectos,
    });
  }
  companeros.sort((a, b) => b.pct - a.pct || a.nombre.localeCompare(b.nombre));
  return { activo: true, oculto: yoOculto, materias: MATERIAS.length, companeros };
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
