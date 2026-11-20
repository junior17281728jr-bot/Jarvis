// Academia 0.14.71: «Notas por materia» (Administrador → Alumnos). Pedido del dueño: «una plantilla del total de cada
// clase, cada estudiante junto, solo para el admin… solo el total de cada materia y si la completó, su nota general de
// cada una de las 11 materias y la última del oral, y cuánto completó».
// SOLO para el administrador (ruta { admin: true }, src/api/perfil.js). Solo lee: sin cambio de base y sin escribir nada.
// Junta lo que ya se calcula para todos a la vez (sin una consulta por alumno ni por tema):
//  - la nota (src/academia/notas.js → notasDeTodos): la MEJOR nota del examen de la materia; sin examen, el % de aciertos
//    de su práctica (fuente «practica»). El oral: la mejor del examen final; sin final, el % de su práctica oral.
//  - cuánto hizo (src/academia/avance-alumno.js → avanceDe): temas hechos de cuántos; «Convalidada por examen» cuenta
//    todos sus temas.
//  - si fue directo al examen (src/academia/saltos.js, «academia.saltos.<alumno>», una consulta para todos).
// Una casilla: { pronto, nota: { pct, fuente, aprobado } | null, examen: 'hecho' | 'a_medias' | null, hechos, temas,
//   completa, salto: null | { tipo: 'convalidada' | 'quemado' | 'directo', pct? } }
//  - completa: todos sus temas hechos Y su examen aprobado (convalidada = las dos cosas).
//  - salto «quemado»: fue directo al examen, lo entregó, NO lo aprobó y todavía le faltan temas.
//  - salto «directo»: fue directo al examen y todavía no lo aprueba ni lo entregó (o lo aprobó antes de la 0.14.19, sin
//    convalidar) y le faltan temas.
// 0.14.79 (pedido del dueño: «la tabla no solo es del Test Guide, también el oral; no cuentes solo 1»): el oral ya no es
// UNA columna: una por cada capítulo que el paquete oral en uso tiene con temas (los mismos de «Notas»: O1 Requisitos del
// piloto… O9 Preguntas de escenario), cada una igual que una materia (su examen de capítulo o el % de práctica con «P», y
// «✓ completa» o «N de M temas»). Después, «Oral total»: los temas del oral hechos de cuántos y la nota del oral (el examen
// final si lo dio; si no, el % de toda la práctica oral). El total cuenta cada capítulo como una materia más.
// El total de cada alumno: los temas hechos de TODO el curso (Test Guide y oral juntos, tema por tema), cuántas materias
// completó y la nota general del curso (notaGeneralDelCurso: las 11 materias, solo exámenes).
// El color lo pone la pantalla con la nota de aprobar de «Ajustes del curso» (umbral, va en la respuesta).
import { MATERIAS } from './formato.js';
import { notasDeTodos } from './notas.js';
import { avanceDe } from './avance-alumno.js';
import { ajustesAcademia } from './progreso.js';

const pct = (a, b) => (b > 0 ? Math.floor((a * 100) / b) : 0);

// Las materias a las que cada alumno fue «directo al examen» (los eventos de saltos.js), en UNA consulta.
// → Map id → Set(materia)
export function saltosDeTodos(db) {
  const m = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'academia.saltos.%'").all()) {
    const id = /^academia\.saltos\.(\d+)$/.exec(f.clave)?.[1];
    if (!id) continue;
    try {
      const v = JSON.parse(f.valor);
      const materias = new Set();
      for (const e of Array.isArray(v?.eventos) ? v.eventos : []) if (typeof e?.materia === 'string') materias.add(e.materia);
      for (const [mat, o] of Object.entries(v?.orden && typeof v.orden === 'object' ? v.orden : {})) if (o === 'examen_antes') materias.add(mat);
      m.set(Number(id), materias);
    } catch { /* un ajuste dañado: como si nunca hubiera saltado */ }
  }
  return m;
}

// Una casilla (sin base: se prueba sola). nota: lo de notasDeTodos (casilla o null); examen: su resumen de examen (o
// null); bloque: lo de avanceDe (hechos, temas, convalidada); salto: fue directo al examen.
export function celdaMateria({ pronto = false, nota = null, examen = null, bloque = null, salto = false }) {
  if (pronto) return { pronto: true, nota: null, examen: null, hechos: 0, temas: 0, completa: false, salto: null };
  const temas = bloque?.temas?.length ?? 0;
  const hechos = bloque?.hechos ?? 0;
  const aprobado = examen?.estado === 'hecho' ? examen.aprobado === true : nota?.fuente === 'examen' ? nota.aprobado === true : false;
  const conv = bloque?.convalidada ?? null;
  const faltan = hechos < temas;
  let s = null;
  if (conv) s = { tipo: 'convalidada', pct: conv.pct };
  else if (salto && faltan && examen?.estado === 'hecho' && !aprobado) s = { tipo: 'quemado', pct: examen.mejor };
  else if (salto && faltan) s = { tipo: 'directo' };
  return {
    pronto: false,
    nota: nota ? { pct: nota.pct, fuente: nota.fuente, aprobado: nota.fuente === 'examen' ? aprobado : false } : null,
    examen: examen?.estado ?? null,
    hechos, temas, completa: temas > 0 && !faltan && aprobado, salto: s,
  };
}

// El total de un alumno. → { hechos, temas, pct, completas, conClases, general: { pct, aprobados, total, conExamen } }
export function totalAlumno(celdas, general) {
  const con = celdas.filter(c => c && !c.pronto && c.temas > 0);
  const hechos = con.reduce((n, c) => n + c.hechos, 0);
  const temas = con.reduce((n, c) => n + c.temas, 0);
  return { hechos, temas, pct: pct(hechos, temas), completas: con.filter(c => c.completa).length, conClases: con.length, general };
}

export function resumenPorMateria(db, paquete, ahoraMs = Date.now()) {
  const notas = notasDeTodos(db, paquete, ahoraMs);
  const ids = notas.alumnos.map(a => a.id);
  const avance = ids.length ? avanceDe(db, paquete, ids) : new Map();
  const saltos = saltosDeTodos(db);
  const { umbral } = ajustesAcademia(db);
  const hayOral = notas.oral.hay;
  const materias = notas.materias.map(m => ({ id: m.id, numero: MATERIAS.indexOf(m.id) + 1, pronto: m.pronto, temas: m.temas.length }));
  const temasOral = notas.oral.capitulos.reduce((n, c) => n + c.temas.length, 0);
  const capitulos = notas.oral.capitulos.map(c => ({ id: c.id, numero: c.numero, temas: c.temas.length }));
  const alumnos = notas.alumnos.map(a => {
    const av = avance.get(a.id);
    const bloques = new Map((av?.tg?.bloques ?? []).map(b => [b.id, b]));
    const susSaltos = saltos.get(a.id) ?? new Set();
    const celdas = {};
    for (const m of materias) {
      celdas[m.id] = celdaMateria({ pronto: m.pronto, nota: a.materias[m.id] ?? null, examen: a.examenes?.[m.id] ?? null, bloque: bloques.get(m.id), salto: susSaltos.has(m.id) });
    }
    let oral = null;
    const deCapitulo = {};
    if (hayOral) {
      const bloquesOral = new Map((av?.oral?.bloques ?? []).map(b => [b.id, b]));
      for (const c of capitulos) {
        const b = bloquesOral.get(c.id);
        deCapitulo[c.id] = celdaMateria({ nota: a.capitulos?.[c.id] ?? null, examen: a.examenes?.[c.id] ?? null, bloque: b ?? { temas: { length: c.temas }, hechos: 0 } });
      }
      const conTemas = (av?.oral?.bloques ?? []).filter(b => b.temas.length);
      const convalidados = conTemas.filter(b => b.convalidada).length;
      const hechos = av?.oral?.hechos ?? 0;
      const temas = av?.oral?.total ?? 0;
      const base = celdaMateria({ nota: a.oral, examen: a.examenes?.oral ?? null, bloque: { temas: { length: temas }, hechos } });
      oral = {
        ...base, capitulos: conTemas.length, pct: pct(hechos, temas), completos: Object.values(deCapitulo).filter(x => x.completa).length,
        ...(convalidados ? { salto: { tipo: 'convalidada', capitulos: convalidados } } : {}),
      };
    }
    return {
      id: a.id, nombre: a.nombre, nombreVisible: a.nombreVisible, activo: a.activo,
      materias: celdas, capitulos: deCapitulo, oral, total: totalAlumno([...Object.values(celdas), ...Object.values(deCapitulo)], a.general),
    };
  });
  return { ahora: notas.ahora, umbral, materias, oral: { hay: hayOral, temas: temasOral, capitulos }, alumnos };
}
