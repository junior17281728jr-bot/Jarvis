// Academia 0.13.5: «Cómo van todos» (Administrador → Alumnos). SOLO para las rutas { admin: true } (src/api/perfil.js):
// un alumno nunca ve esto. Una fila por alumno (las cuentas de administrador no salen) con, por separado:
//  - En línea: lo dicen sus visitas (actividad en los últimos 3 minutos, src/cuentas/visitas.js); sin visitas anotadas,
//    su última actividad (sesiones, respuestas) en esos mismos 3 minutos. Una respuesta de hace menos de 3 minutos también.
//  - Exámenes: SOLO las notas de los exámenes: el de cada materia (Test Guide) y los del oral (cada capítulo y el final):
//    la mejor y la última nota, cuántas veces y si aprobó.
//  - Clases: temas aprobados de cada materia y el % de aciertos de lo que respondió FUERA de los exámenes.
//  - Plan, avance del curso entero (los pasos del camino: src/academia/plan.js) y tiempo estudiando (aprox., sale de sus
//    respuestas: src/academia/fichas.js → tiempoDeEstudio).
// Solo lee lo que ya se guarda (sin cambio de base). No cierra exámenes vencidos ni escribe nada: se pide cada 30 s.
import { ultimaActividad } from './progreso.js';
import { resumenVisitas, EN_LINEA_MS } from '../cuentas/visitas.js';
import { avataresDe } from '../cuentas/perfil.js';
import { planDe, pasosDelCamino } from './plan.js';
import { tiempoDeEstudio } from './fichas.js';
import { examenesOralDe, hayOral } from './oral.js';

const pct = (bien, total) => (total > 0 ? Math.floor((bien * 100) / total) : 0);
const SEMANA_MS = 7 * 24 * 3600 * 1000;
export const ORDENES = Object.freeze(['en_linea', 'nota', 'avance']);

function cuentasDeAlumnos(db) {
  return db.prepare("SELECT id, nombre, nombre_visible, activo FROM usuarios WHERE rol <> 'admin' ORDER BY COALESCE(nombre_visible, nombre), id").all();
}

// En línea (y la última actividad) de cada alumno. respuestas: Map id → la fecha de su última respuesta.
export function enLineaDe(db, cuentas, ahoraMs, ultimas = null) {
  const actividad = ultimaActividad(db);
  const respuestas = ultimas ?? new Map(db.prepare('SELECT usuario_id AS id, MAX(creada_en) AS f FROM academia_respuestas GROUP BY usuario_id').all().map(f => [f.id, f.f]));
  return new Map(cuentas.map(u => {
    const v = resumenVisitas(db, u.id, ahoraMs);
    const ultima = [actividad.get(u.id), v?.ultima].filter(Boolean).sort().pop() ?? null;
    const reciente = f => Boolean(f) && ahoraMs - Date.parse(f) >= 0 && ahoraMs - Date.parse(f) <= EN_LINEA_MS;
    const enLinea = (v ? v.enLinea : reciente(ultima)) || reciente(respuestas.get(u.id));
    return [u.id, { enLinea, ultimaActividad: ultima }];
  }));
}

// Lo liviano que se pide cada 30 s: { ahora, enLinea, alumnos: [{ id, enLinea, ultimaActividad }] }.
export function enLineaTodos(db, ahoraMs = Date.now()) {
  const cuentas = cuentasDeAlumnos(db);
  const estado = enLineaDe(db, cuentas, ahoraMs);
  const alumnos = cuentas.map(u => ({ id: u.id, ...estado.get(u.id) }));
  return { ahora: new Date(ahoraMs).toISOString(), enLinea: alumnos.filter(a => a.enLinea).length, alumnos };
}

// filas: los exámenes terminados de UN alumno, del más nuevo al más viejo. orden: los ids de materia del contenido.
// → [{ id, intentos, mejor, ultima, aprobado }] (solo las materias con algún examen, en el orden del contenido).
export function examenesPorMateria(filas, orden = []) {
  const grupos = new Map();
  for (const f of filas) {
    if (!grupos.has(f.materia)) grupos.set(f.materia, []);
    grupos.get(f.materia).push(f);
  }
  const posicion = id => (orden.includes(id) ? orden.indexOf(id) : orden.length);
  return [...grupos].sort(([a], [b]) => posicion(a) - posicion(b)).map(([id, lista]) => ({
    id,
    intentos: lista.length,
    mejor: Math.max(...lista.map(x => x.pct)),
    ultima: lista[0].pct,
    aprobado: lista.some(x => x.aprobado),
  }));
}

// Para ordenar en la pantalla (y en las pruebas): «en_linea» (en línea primero, después lo más reciente), «nota» (el
// promedio de sus mejores notas de examen; sin exámenes, al final) y «avance» (el % del curso). Empate: por nombre.
export function ordenarAlumnos(lista, orden = 'en_linea') {
  const nombre = a => String(a.nombreVisible || a.nombre || '').toLocaleLowerCase('es');
  const porNombre = (a, b) => nombre(a).localeCompare(nombre(b), 'es') || a.id - b.id;
  const comparar = {
    en_linea: (a, b) => Number(b.enLinea) - Number(a.enLinea) || String(b.ultimaActividad ?? '').localeCompare(String(a.ultimaActividad ?? '')) || porNombre(a, b),
    nota: (a, b) => (b.examenes.promedio ?? -1) - (a.examenes.promedio ?? -1) || porNombre(a, b),
    avance: (a, b) => b.avance.pct - a.avance.pct || b.clases.pctAcierto - a.clases.pctAcierto || porNombre(a, b),
  }[ORDENES.includes(orden) ? orden : 'en_linea'];
  return [...lista].sort(comparar);
}

export function comoVanTodos(db, paquete, ahoraMs = Date.now()) {
  const cuentas = cuentasDeAlumnos(db);
  const materias = (paquete?.materias ?? []).filter(m => m.temas.length);
  const orden = materias.map(m => m.id);
  const temasDe = new Map(materias.map(m => [m.id, new Set(m.temas.map(t => t.id))]));
  const avatares = avataresDe(db);

  // Todo de una vez (pocas consultas para todos), y se reparte por alumno.
  const porAlumno = (filas, clave = 'usuario_id') => {
    const m = new Map();
    for (const f of filas) { if (!m.has(f[clave])) m.set(f[clave], []); m.get(f[clave]).push(f); }
    return m;
  };
  const examenes = porAlumno(db.prepare(`SELECT usuario_id, materia, total, aciertos, aprobado FROM academia_intentos
    WHERE tipo = 'examen' AND terminado_en IS NOT NULL ORDER BY terminado_en DESC, id DESC`).all()
    .map(f => ({ usuario_id: f.usuario_id, materia: f.materia, pct: pct(f.aciertos, f.total), aprobado: f.aprobado === 1 })));
  const temasAprobados = porAlumno(db.prepare(`SELECT DISTINCT usuario_id, materia, tema FROM academia_intentos
    WHERE tipo = 'tema' AND aprobado = 1 AND terminado_en IS NOT NULL`).all());
  // Las clases «como tal»: lo que respondió fuera de los exámenes (temas, prácticas, reto, repaso).
  const respuestas = porAlumno(db.prepare(`SELECT r.usuario_id, r.materia, COUNT(*) AS n, COALESCE(SUM(r.correcta), 0) AS bien
    FROM academia_respuestas r LEFT JOIN academia_intentos i ON i.id = r.intento_id
    WHERE i.tipo IS NULL OR i.tipo <> 'examen' GROUP BY r.usuario_id, r.materia`).all());
  const fechas = porAlumno(db.prepare('SELECT usuario_id, creada_en, dia FROM academia_respuestas ORDER BY usuario_id, creada_en').all());
  const ultimas = new Map([...fechas].map(([id, l]) => [id, l.at(-1).creada_en]));
  const linea = enLineaDe(db, cuentas, ahoraMs, ultimas);
  const conOral = hayOral(paquete);

  const alumnos = cuentas.map(u => {
    const tg = examenesPorMateria(examenes.get(u.id) ?? [], orden);
    const oral = conOral ? examenesOralDe(db, u.id, paquete) : [];
    const todas = [...tg, ...oral];
    const aprobadosDe = new Map();
    for (const f of temasAprobados.get(u.id) ?? []) {
      if (!temasDe.get(f.materia)?.has(f.tema)) continue; // solo los temas que siguen en el contenido en uso
      aprobadosDe.set(f.materia, (aprobadosDe.get(f.materia) ?? 0) + 1);
    }
    const resp = new Map((respuestas.get(u.id) ?? []).map(f => [f.materia, f]));
    const clasesMaterias = materias.map(m => {
      const r = resp.get(m.id);
      const hechos = aprobadosDe.get(m.id) ?? 0;
      return { id: m.id, temasAprobados: hechos, temas: m.temas.length, pct: pct(hechos, m.temas.length), respuestas: r?.n ?? 0, aciertos: r?.bien ?? 0, pctAcierto: pct(r?.bien ?? 0, r?.n ?? 0) };
    });
    const nResp = [...resp.values()].reduce((s, f) => s + f.n, 0);
    const nBien = [...resp.values()].reduce((s, f) => s + f.bien, 0);
    const misFechas = (fechas.get(u.id) ?? []);
    const plan = planDe(db, u.id, paquete, ahoraMs);
    const pasos = plan.elegido ? { total: plan.total, hechos: plan.hechos } : pasosDelCamino(db, u.id, paquete);
    const total = Math.round(pasos.total);
    return {
      id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible || u.nombre, activo: u.activo === 1, avatar: avatares.get(u.id) ?? null,
      ...linea.get(u.id),
      plan: plan.elegido ? { elegido: plan.elegido, pct: plan.pct, fin: plan.fin, finPlan: plan.finPlan, ritmo: plan.ritmo, desde: plan.desde } : null,
      avance: { pct: pasos.total ? Math.min(100, Math.floor((pasos.hechos * 100) / pasos.total)) : 0, hechos: pasos.hechos, total },
      tiempo: {
        minutos: tiempoDeEstudio(misFechas.map(f => f.creada_en)),
        semana: tiempoDeEstudio(misFechas.filter(f => { const t = Date.parse(f.creada_en); return t <= ahoraMs && ahoraMs - t < SEMANA_MS; }).map(f => f.creada_en)),
        dias: new Set(misFechas.map(f => f.dia)).size,
      },
      examenes: {
        materias: tg, oral,
        hechos: todas.length, aprobados: todas.filter(x => x.aprobado).length,
        promedio: todas.length ? Math.round(todas.reduce((s, x) => s + x.mejor, 0) / todas.length) : null,
      },
      clases: {
        temasAprobados: clasesMaterias.reduce((s, m) => s + m.temasAprobados, 0), temas: clasesMaterias.reduce((s, m) => s + m.temas, 0),
        respuestas: nResp, aciertos: nBien, pctAcierto: pct(nBien, nResp), materias: clasesMaterias,
      },
    };
  });
  return {
    ahora: new Date(ahoraMs).toISOString(),
    total: alumnos.length, enLinea: alumnos.filter(a => a.enLinea).length,
    materias: orden, oral: conOral,
    alumnos: ordenarAlumnos(alumnos, 'en_linea'),
  };
}

// ---------- 0.13.5: «Comparar un examen» (el de una materia): quién sacó cuánto y qué pregunta falló cada uno ----------
// Cada alumno: cuántas veces, la mejor y la última nota. Cada pregunta: su ÚLTIMA respuesta en ese examen (de cada
// alumno), quiénes la fallaron y qué eligieron; ordenadas por cuántos la fallaron. Y por tema: cuántas fallas.
// El enunciado y las opciones van TAL CUAL (solo el administrador lo ve: ruta { admin: true }).
export function compararExamen(db, paquete, materia) {
  const m = (paquete?.materias ?? []).find(x => x.id === materia && x.temas.length);
  if (!m) return null;
  const titulos = new Map(m.temas.map(t => [t.id, t.titulo]));
  const cuentas = new Map(cuentasDeAlumnos(db).map(u => [u.id, u]));
  const nombre = id => { const u = cuentas.get(id); return u.nombre_visible || u.nombre; };
  const intentos = db.prepare(`SELECT id, usuario_id, total, aciertos, aprobado, terminado_en FROM academia_intentos
    WHERE tipo = 'examen' AND materia = ? AND terminado_en IS NOT NULL ORDER BY terminado_en DESC, id DESC`).all(materia).filter(f => cuentas.has(f.usuario_id));
  const deCada = new Map();
  for (const f of intentos) {
    if (!deCada.has(f.usuario_id)) deCada.set(f.usuario_id, []);
    deCada.get(f.usuario_id).push({ intento: f.id, pct: pct(f.aciertos, f.total), aprobado: f.aprobado === 1, fecha: f.terminado_en });
  }
  const alumnos = [...deCada].map(([id, l]) => ({
    id, nombre: nombre(id), intentos: l.length, mejor: Math.max(...l.map(x => x.pct)), ultima: l[0].pct, aprobado: l.some(x => x.aprobado),
    ultimoIntento: l[0].intento, fecha: l[0].fecha,
  })).sort((a, b) => b.mejor - a.mejor || a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id);
  // La última respuesta de cada alumno a cada pregunta de ese examen.
  const ultima = new Map();
  for (const r of db.prepare(`SELECT r.usuario_id, r.pregunta, r.elegida, r.correcta, r.intento_id FROM academia_respuestas r JOIN academia_intentos i ON i.id = r.intento_id
    WHERE i.tipo = 'examen' AND i.materia = ? AND i.terminado_en IS NOT NULL ORDER BY r.id`).all(materia)) {
    if (cuentas.has(r.usuario_id)) ultima.set(`${r.usuario_id}|${r.pregunta}`, r);
  }
  const porPregunta = new Map();
  for (const r of ultima.values()) {
    if (!porPregunta.has(r.pregunta)) porPregunta.set(r.pregunta, []);
    porPregunta.get(r.pregunta).push(r);
  }
  const preguntas = [...porPregunta].map(([id, lista]) => {
    const q = paquete.preguntas.get(id);
    const lugar = paquete.deTema.get(id);
    const fallaron = lista.filter(r => r.correcta !== 1).map(r => ({ id: r.usuario_id, nombre: nombre(r.usuario_id), elegida: r.elegida, intento: r.intento_id }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id);
    return {
      id, falta: !q, numero: q?.original.numero ?? null, enunciado: q?.original.enunciado ?? null,
      opciones: q ? q.original.opciones.map(o => ({ letra: o.letra, texto: o.texto })) : [], correcta: q?.original.correcta ?? null,
      tema: lugar?.tema ?? null, temaTitulo: lugar?.tema ? titulos.get(lugar.tema) ?? null : null,
      respondieron: lista.length, fallaron,
    };
  }).sort((a, b) => b.fallaron.length - a.fallaron.length || b.respondieron - a.respondieron || String(a.numero ?? a.id).localeCompare(String(b.numero ?? b.id), 'es', { numeric: true }));
  const temas = m.temas.map(t => {
    const suyas = preguntas.filter(q => q.tema === t.id);
    const quienes = new Set(suyas.flatMap(q => q.fallaron.map(f => f.id)));
    return { id: t.id, titulo: t.titulo, preguntas: suyas.length, respuestas: suyas.reduce((s, q) => s + q.respondieron, 0), fallos: suyas.reduce((s, q) => s + q.fallaron.length, 0), alumnos: quienes.size };
  }).filter(t => t.respuestas > 0).sort((a, b) => b.fallos - a.fallos || a.titulo.localeCompare(b.titulo, 'es'));
  return { materia, alumnos, preguntas, temas };
}
