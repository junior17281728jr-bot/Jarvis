// Academia 0.14.6: «Notas» (Administrador → Alumnos → Notas). Pedido del dueño: «una parte donde vea SOLO las notas»: de cada
// alumno, la nota de cada tema de las 11 materias del Test Guide y del oral (cada capítulo y sus temas), y cómo va cada uno.
// SOLO para el administrador (ruta { admin: true }, src/api/perfil.js). Solo lee: sin cambio de base y sin escribir nada.
//
// La nota de una casilla ({ pct, fuente }):
//  - Materia del Test Guide: la MEJOR nota de su examen (fuente «examen»); sin examen, el % de aciertos de lo que respondió
//    FUERA de los exámenes (temas, prácticas, reto, repaso; fuente «practica»), igual que «Cómo van todos».
//  - Tema del Test Guide: la mejor nota de ese tema DENTRO de un examen (las preguntas de ese tema en cada examen terminado;
//    la mejor de esos intentos, fuente «examen»); sin examen, la mejor prueba del tema (como la ficha del alumno, «Por
//    materia»); sin prueba, el % de aciertos de lo que respondió de ese tema fuera de los exámenes (fuente «practica»).
//  - Oral, un capítulo: la mejor nota de su examen (examen); sin examen, el % de aciertos de su práctica (practica).
//    Un tema del oral: la mejor nota de ese tema dentro de un examen oral (cada entrega guarda sus respuestas con la misma
//    hora, así se separa cada examen); sin examen, el % de aciertos de su práctica.
//    La columna «Oral»: la mejor nota del examen final; sin final, el % de aciertos de toda la práctica oral.
//  - Sin nada: null («—», sin empezar). Un 0 es un 0 (rojo), no «sin empezar».
// Los colores: verde ≥ 70, ámbar 50–69, rojo < 50, gris sin empezar (tonoNota). Todo con piso (Math.floor), como el resto.
// La nota general de cada alumno es notaGeneralDelCurso (las 11 materias, SOLO exámenes; sin examen cuenta 0).
// El promedio del grupo de cada columna: solo de los alumnos que ya tienen nota ahí (piso).
// Pocas consultas para todos los alumnos (sin una por alumno ni por tema): así va bien en un servidor de 1 CPU y 512 MB.
import { MATERIAS, MATERIAS_ORAL } from './formato.js';
import { notaGeneralDelCurso } from './progreso.js';
import { avataresDe } from '../cuentas/perfil.js';
import { cuentasDeAlumnos } from './como-van.js';

export const UMBRALES_NOTA = Object.freeze({ bien: 70, regular: 50 });
// → 'bien' (verde), 'regular' (ámbar), 'mal' (rojo) o 'nada' (gris: sin empezar).
export function tonoNota(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return 'nada';
  const n = Number(pct);
  return n >= UMBRALES_NOTA.bien ? 'bien' : n >= UMBRALES_NOTA.regular ? 'regular' : 'mal';
}
const pct = (bien, total) => (total > 0 ? Math.floor((bien * 100) / total) : null);
const recortar = n => Math.max(0, Math.min(100, Math.floor(Number(n) || 0)));
const ORAL_EXAMEN = ['oral_examen', 'oral_final'];

// El promedio (piso) de las notas que hay; sin ninguna, null.
export function promedioDe(valores) {
  const hay = valores.filter(v => v != null && Number.isFinite(Number(v)));
  return hay.length ? Math.floor(hay.reduce((s, v) => s + Number(v), 0) / hay.length) : null;
}
const casilla = (valor, fuente, extra = {}) => (valor == null ? null : { pct: recortar(valor), fuente, ...extra });

// El estado de los exámenes orales de cada alumno (se guarda en ajustes «academia.oral.<id>»): una sola consulta para todos.
function examenesOralesDeTodos(db) {
  const m = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'academia.oral.%'").all()) {
    const id = /^academia\.oral\.(\d+)$/.exec(f.clave)?.[1];
    if (!id) continue;
    try {
      const v = JSON.parse(f.valor);
      const ex = v && typeof v === 'object' && v.examenes && typeof v.examenes === 'object' && !Array.isArray(v.examenes) ? v.examenes : {};
      m.set(Number(id), ex);
    } catch { /* un ajuste dañado: como si no hubiera exámenes */ }
  }
  return m;
}

// Todo junto. → { ahora, umbrales, materias: [11 × { id, pronto, temas: [{ id, titulo }] }], oral: { hay, capitulos: [...] },
//   alumnos: [{ id, nombre, nombreVisible, avatar, activo, general, materias: { id: casilla }, oral: casilla, capitulos: { id: casilla },
//   temas: { 'materia/tema': casilla } }], promedios: { general, materias, oral, capitulos, temas } }
export function notasDeTodos(db, paquete, ahoraMs = Date.now()) {
  const cuentas = cuentasDeAlumnos(db);
  const deAlumno = new Set(cuentas.map(u => u.id));
  const avatares = avataresDe(db);
  const materias = MATERIAS.map(id => {
    const m = (paquete?.materias ?? []).find(x => x.id === id);
    const temas = (m?.temas ?? []).map(t => ({ id: t.id, titulo: t.titulo }));
    return { id, pronto: !temas.length, temas };
  });
  const hayOral = Boolean(paquete?.oral?.hay);
  const capitulos = hayOral ? MATERIAS_ORAL.map(id => {
    const m = paquete.oral.materias.find(x => x.id === id);
    return { id, numero: MATERIAS_ORAL.indexOf(id) + 1, temas: (m?.temas ?? []).map(t => ({ id: t.id, titulo: t.titulo })) };
  }).filter(c => c.temas.length) : [];
  const temasTg = new Set(materias.flatMap(m => m.temas.map(t => `${m.id}/${t.id}`)));
  const temasOral = new Set(capitulos.flatMap(c => c.temas.map(t => `${c.id}/${t.id}`)));

  // Mapa usuario → Map(clave → fila), solo de los alumnos que se muestran.
  const agrupar = (filas, clave) => {
    const m = new Map();
    for (const f of filas) {
      if (!deAlumno.has(f.usuario_id)) continue;
      if (!m.has(f.usuario_id)) m.set(f.usuario_id, new Map());
      m.get(f.usuario_id).set(clave(f), f);
    }
    return m;
  };
  // 1. La mejor nota del examen de cada materia.
  const exMateria = agrupar(db.prepare(`SELECT usuario_id, materia, MAX(aciertos * 100 / total) AS mejor, MAX(aprobado) AS aprobado, COUNT(*) AS veces
    FROM academia_intentos WHERE tipo = 'examen' AND terminado_en IS NOT NULL AND total > 0 GROUP BY usuario_id, materia`).all(), f => f.materia);
  // 2. La mejor nota de cada tema dentro de un examen (cada intento por separado; la mejor).
  const exTema = agrupar(db.prepare(`SELECT usuario_id, materia, tema, MAX(nota) AS mejor FROM (
      SELECT r.usuario_id, r.materia, r.tema, SUM(r.correcta) * 100 / COUNT(*) AS nota
      FROM academia_respuestas r JOIN academia_intentos i ON i.id = r.intento_id
      WHERE i.tipo = 'examen' AND i.terminado_en IS NOT NULL GROUP BY r.intento_id, r.materia, r.tema)
    GROUP BY usuario_id, materia, tema`).all(), f => `${f.materia}/${f.tema}`);
  // 3. La mejor prueba de cada tema (como la ficha del alumno).
  const pruebaTema = agrupar(db.prepare(`SELECT usuario_id, materia, tema, MAX(aciertos * 100 / total) AS mejor
    FROM academia_intentos WHERE tipo = 'tema' AND terminado_en IS NOT NULL AND total > 0 GROUP BY usuario_id, materia, tema`).all(), f => `${f.materia}/${f.tema}`);
  // 4. Lo que respondió fuera de los exámenes, por tema (la materia suma sus temas).
  const fuera = agrupar(db.prepare(`SELECT r.usuario_id, r.materia, r.tema, COUNT(*) AS n, COALESCE(SUM(r.correcta), 0) AS bien
    FROM academia_respuestas r LEFT JOIN academia_intentos i ON i.id = r.intento_id
    WHERE i.tipo IS NULL OR i.tipo <> 'examen' GROUP BY r.usuario_id, r.materia, r.tema`).all(), f => `${f.materia}/${f.tema}`);
  // 5 y 6. El oral: la práctica por tema y la mejor nota de cada tema dentro de un examen oral (cada entrega, su hora).
  let oralPractica = new Map();
  let oralExamen = new Map();
  let oralExamenes = new Map();
  if (hayOral) {
    oralPractica = agrupar(db.prepare(`SELECT usuario_id, materia, tema, COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien
      FROM academia_extra_respuestas WHERE nivel = 'oral_practica' AND materia LIKE 'oral\\_%' ESCAPE '\\' GROUP BY usuario_id, materia, tema`).all(), f => `${f.materia}/${f.tema}`);
    oralExamen = agrupar(db.prepare(`SELECT usuario_id, materia, tema, MAX(nota) AS mejor FROM (
        SELECT usuario_id, materia, tema, SUM(correcta) * 100 / COUNT(*) AS nota FROM academia_extra_respuestas
        WHERE nivel IN (${ORAL_EXAMEN.map(() => '?').join(', ')}) AND materia LIKE 'oral\\_%' ESCAPE '\\' GROUP BY usuario_id, materia, tema, nivel, creada_en)
      GROUP BY usuario_id, materia, tema`).all(...ORAL_EXAMEN), f => `${f.materia}/${f.tema}`);
    oralExamenes = examenesOralesDeTodos(db);
  }

  const alumnos = cuentas.map(u => {
    const ex = exMateria.get(u.id) ?? new Map();
    const exT = exTema.get(u.id) ?? new Map();
    const prT = pruebaTema.get(u.id) ?? new Map();
    const fu = fuera.get(u.id) ?? new Map();
    const temas = {};
    const notasMateria = {};
    for (const m of materias) {
      let n = 0;
      let bien = 0;
      for (const t of m.temas) {
        const clave = `${m.id}/${t.id}`;
        const f = fu.get(clave);
        n += f?.n ?? 0;
        bien += f?.bien ?? 0;
        temas[clave] = exT.has(clave) ? casilla(exT.get(clave).mejor, 'examen')
          : prT.has(clave) ? casilla(prT.get(clave).mejor, 'practica')
            : casilla(pct(f?.bien ?? 0, f?.n ?? 0), 'practica');
      }
      const e = ex.get(m.id);
      notasMateria[m.id] = m.pronto ? null : e ? casilla(e.mejor, 'examen', { aprobado: e.aprobado === 1, veces: e.veces }) : casilla(pct(bien, n), 'practica');
    }
    const tg = [...ex].filter(([id]) => MATERIAS.includes(id)).map(([id, e]) => ({ id, mejor: e.mejor, aprobado: e.aprobado === 1 }));
    const general = { ...notaGeneralDelCurso(tg), conExamen: tg.length > 0 };
    // El oral.
    const capitulosAlumno = {};
    let oral = null;
    if (hayOral) {
      const op = oralPractica.get(u.id) ?? new Map();
      const oe = oralExamen.get(u.id) ?? new Map();
      const guardados = oralExamenes.get(u.id) ?? {};
      const examenGuardado = id => {
        const e = guardados[id];
        return e && typeof e === 'object' && Number(e.veces) > 0 ? { mejor: Number(e.mejor) || 0, aprobado: e.aprobado === true, veces: Number(e.veces) || 0 } : null;
      };
      let nTodo = 0;
      let bienTodo = 0;
      for (const c of capitulos) {
        let n = 0;
        let bien = 0;
        for (const t of c.temas) {
          const clave = `${c.id}/${t.id}`;
          const f = op.get(clave);
          n += f?.n ?? 0;
          bien += f?.bien ?? 0;
          temas[clave] = oe.has(clave) ? casilla(oe.get(clave).mejor, 'examen') : casilla(pct(f?.bien ?? 0, f?.n ?? 0), 'practica');
        }
        nTodo += n;
        bienTodo += bien;
        const e = examenGuardado(c.id);
        capitulosAlumno[c.id] = e ? casilla(e.mejor, 'examen', { aprobado: e.aprobado, veces: e.veces }) : casilla(pct(bien, n), 'practica');
      }
      const final = examenGuardado('final');
      oral = final ? casilla(final.mejor, 'examen', { aprobado: final.aprobado, veces: final.veces }) : casilla(pct(bienTodo, nTodo), 'practica');
    }
    return {
      id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible || u.nombre, avatar: avatares.get(u.id) ?? null, activo: u.activo === 1,
      general, materias: notasMateria, oral, capitulos: capitulosAlumno, temas,
    };
  });

  const datos = { materias, oral: { hay: hayOral, capitulos } };
  for (const a of alumnos) a.debil = temaMasDebil(datos, a);
  const columna = sacar => promedioDe(alumnos.map(a => sacar(a)?.pct ?? null));
  const promedios = {
    general: promedioDe(alumnos.filter(a => a.general.conExamen).map(a => a.general.pct)),
    materias: Object.fromEntries(materias.map(m => [m.id, columna(a => a.materias[m.id])])),
    oral: hayOral ? columna(a => a.oral) : null,
    capitulos: Object.fromEntries(capitulos.map(c => [c.id, columna(a => a.capitulos[c.id])])),
    temas: Object.fromEntries([...temasTg, ...temasOral].map(k => [k, columna(a => a.temas[k])])),
  };
  return {
    ahora: new Date(ahoraMs).toISOString(), umbrales: UMBRALES_NOTA,
    materias, oral: { hay: hayOral, capitulos },
    alumnos, promedios,
  };
}

// El tema más débil de un alumno (la nota más baja de un tema que ya tiene nota; empate: el primero en el orden del curso,
// el Test Guide antes que el oral). datos: lo de notasDeTodos. → { clave, materia, tema, pct } | null
export function temaMasDebil(datos, alumno) {
  let peor = null;
  const revisar = (materia, temas) => {
    for (const t of temas) {
      const c = alumno.temas[`${materia}/${t.id}`];
      if (c && (!peor || c.pct < peor.pct)) peor = { clave: `${materia}/${t.id}`, materia, tema: t.id, pct: c.pct };
    }
  };
  for (const m of datos.materias) revisar(m.id, m.temas);
  for (const c of datos.oral?.capitulos ?? []) revisar(c.id, c.temas);
  return peor;
}
