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
// 0.14.25 (pedido del dueño): cada alumno trae también «examenes»: { <materia | 'oral' | capítulo>: { estado: 'hecho' |
// 'a_medias', mejor, aprobado, intentos, terminados, lista } }. 'a_medias': lo empezó y nunca lo terminó (sin nota). La
// lista: cada intento del Test Guide en orden (1.º, 2.º…), con su nota y si aprobó (los a medias, sin nota). Del oral solo
// se guardan la mejor, la última y las veces (lista vacía); el examen oral abierto sin entregar cuenta como «A medias».
// El «Repaso final» (tipo «final») es práctica: nunca aprueba ni cuenta como examen.
import { MATERIAS, MATERIAS_ORAL } from './formato.js';
import { notaGeneralDelCurso } from './progreso.js';
import { avataresDe } from '../cuentas/perfil.js';
import { fotosDe } from '../cuentas/foto.js';
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
// 0.14.25: también el examen oral que quedó abierto sin entregar (su alcance: un capítulo o «final»).
function examenesOralesDeTodos(db) {
  const m = new Map();
  const abiertos = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'academia.oral.%'").all()) {
    const id = /^academia\.oral\.(\d+)$/.exec(f.clave)?.[1];
    if (!id) continue;
    try {
      const v = JSON.parse(f.valor);
      const ex = v && typeof v === 'object' && v.examenes && typeof v.examenes === 'object' && !Array.isArray(v.examenes) ? v.examenes : {};
      m.set(Number(id), ex);
      const alcance = v && typeof v === 'object' && v.abierto && typeof v.abierto === 'object' ? v.abierto.alcance : null;
      if (typeof alcance === 'string') abiertos.set(Number(id), alcance);
    } catch { /* un ajuste dañado: como si no hubiera exámenes */ }
  }
  return { examenes: m, abiertos };
}

// 0.14.25 (pedido del dueño: «ver cada intento del examen»). Las filas de academia_intentos (tipo «examen», en orden) →
//  exMateria: usuario → Map(materia → { mejor, aprobado, veces }) con SOLO los terminados (como antes: la mejor nota, si
//    aprobó alguna vez y cuántas veces lo terminó);
//  intentosMateria: usuario → Map(materia → [{ n, completo, pct, aprobado, umbral, en }]) con TODOS, numerados 1, 2, 3…
//    Uno sin terminar («A medias») no lleva nota ni % (pct null, aprobado null).
export function examenesDeTodos(filas) {
  const exMateria = new Map();
  const intentosMateria = new Map();
  const de = (mapa, u) => mapa.get(u) ?? mapa.set(u, new Map()).get(u);
  for (const f of filas) {
    const completo = f.terminado_en != null && f.total > 0;
    const lista = de(intentosMateria, f.usuario_id).get(f.materia) ?? de(intentosMateria, f.usuario_id).set(f.materia, []).get(f.materia);
    const nota = completo ? Math.floor((f.aciertos * 100) / f.total) : null;
    lista.push({
      n: lista.length + 1, completo, pct: nota,
      aprobado: completo ? (f.aprobado == null ? (f.umbral != null ? nota >= f.umbral : null) : f.aprobado === 1) : null,
      umbral: f.umbral ?? null, en: f.terminado_en ?? f.empezado_en,
    });
    if (!completo) continue;
    const m = de(exMateria, f.usuario_id);
    const e = m.get(f.materia) ?? { mejor: nota, aprobado: 0, veces: 0 };
    e.mejor = Math.max(e.mejor, nota);
    if (f.aprobado === 1) e.aprobado = 1;
    e.veces += 1;
    m.set(f.materia, e);
  }
  return { exMateria, intentosMateria };
}
// El estado del examen de una materia, de su lista de intentos. → { estado: 'hecho' | 'a_medias', mejor, aprobado,
// intentos (todos, contando los «A medias»), terminados, lista }. 'hecho': terminó al menos uno (se ve su mejor nota con
// ✅/❌); 'a_medias': lo empezó y nunca lo terminó (sin número ni %).
export function resumenExamen(lista) {
  const hechos = lista.filter(x => x.completo);
  const mejor = hechos.length ? hechos.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  return {
    estado: hechos.length ? 'hecho' : 'a_medias',
    mejor: mejor ? mejor.pct : null,
    aprobado: hechos.length ? hechos.some(x => x.aprobado === true) : null,
    intentos: lista.length, terminados: hechos.length, lista,
  };
}
// Lo mismo de un examen oral (guardado: { mejor, aprobado, veces } o null; crudo: lo guardado tal cual, por «ultimo» y
// «en»; abierto: tiene ese examen abierto sin entregar). Del oral no se guarda cada intento: lista vacía, con la última nota.
function resumenOral(guardado, crudo, abierto) {
  if (!guardado && !abierto) return null;
  const veces = guardado?.veces ?? 0;
  const ultimo = guardado && Number.isFinite(Number(crudo?.ultimo)) ? recortar(crudo.ultimo) : null;
  return {
    estado: guardado ? 'hecho' : 'a_medias', mejor: guardado ? recortar(guardado.mejor) : null, aprobado: guardado ? guardado.aprobado : null,
    intentos: veces + (abierto ? 1 : 0), terminados: veces, lista: [], oral: true, ultimo,
    en: typeof crudo?.en === 'string' ? crudo.en : null, abierto: abierto === true,
  };
}

// Todo junto. → { ahora, umbrales, materias: [11 × { id, pronto, temas: [{ id, titulo }] }], oral: { hay, capitulos: [...] },
//   alumnos: [{ id, nombre, nombreVisible, avatar, activo, general, materias: { id: casilla }, oral: casilla, capitulos: { id: casilla },
//   temas: { 'materia/tema': casilla } }], promedios: { general, materias, oral, capitulos, temas } }
export function notasDeTodos(db, paquete, ahoraMs = Date.now()) {
  const cuentas = cuentasDeAlumnos(db);
  const deAlumno = new Set(cuentas.map(u => u.id));
  const avatares = avataresDe(db);
  const fotos = fotosDe(db);
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
  // 1. Cada examen de cada materia, en orden (terminado o a medias; 0.14.25): de aquí salen la mejor nota, si aprobó, las
  //    veces y la lista de intentos («1.ª vez 57 % ❌ · 2.ª vez A medias…»). Una sola consulta para todos.
  const { exMateria, intentosMateria } = examenesDeTodos(db.prepare(`SELECT id, usuario_id, materia, total, aciertos, umbral, aprobado, empezado_en, terminado_en
    FROM academia_intentos WHERE tipo = 'examen' AND materia IS NOT NULL ORDER BY usuario_id, materia, empezado_en, id`).all().filter(f => deAlumno.has(f.usuario_id)));
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
  let oralAbiertos = new Map();
  if (hayOral) {
    oralPractica = agrupar(db.prepare(`SELECT usuario_id, materia, tema, COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien
      FROM academia_extra_respuestas WHERE nivel = 'oral_practica' AND materia LIKE 'oral\\_%' ESCAPE '\\' GROUP BY usuario_id, materia, tema`).all(), f => `${f.materia}/${f.tema}`);
    oralExamen = agrupar(db.prepare(`SELECT usuario_id, materia, tema, MAX(nota) AS mejor FROM (
        SELECT usuario_id, materia, tema, SUM(correcta) * 100 / COUNT(*) AS nota FROM academia_extra_respuestas
        WHERE nivel IN (${ORAL_EXAMEN.map(() => '?').join(', ')}) AND materia LIKE 'oral\\_%' ESCAPE '\\' GROUP BY usuario_id, materia, tema, nivel, creada_en)
      GROUP BY usuario_id, materia, tema`).all(...ORAL_EXAMEN), f => `${f.materia}/${f.tema}`);
    ({ examenes: oralExamenes, abiertos: oralAbiertos } = examenesOralesDeTodos(db));
  }

  const alumnos = cuentas.map(u => {
    const ex = exMateria.get(u.id) ?? new Map();
    const exT = exTema.get(u.id) ?? new Map();
    const prT = pruebaTema.get(u.id) ?? new Map();
    const fu = fuera.get(u.id) ?? new Map();
    const temas = {};
    const notasMateria = {};
    const examenes = {};
    const susIntentos = intentosMateria.get(u.id) ?? new Map();
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
      const lista = susIntentos.get(m.id);
      if (!m.pronto && lista?.length) examenes[m.id] = resumenExamen(lista);
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
      // 0.14.25: el estado de cada examen oral (el final y cada capítulo). Del oral solo se guardan la mejor, la última y
      // las veces (no cada intento); el que quedó abierto sin entregar es «A medias».
      const abierto = oralAbiertos.get(u.id) ?? null;
      for (const id of ['final', ...capitulos.map(c => c.id)]) {
        const e = examenGuardado(id);
        const r = resumenOral(e, guardados[id], abierto === id);
        if (r) examenes[id === 'final' ? 'oral' : id] = r;
      }
    }
    return {
      id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible || u.nombre, avatar: avatares.get(u.id) ?? null, foto: fotos.get(u.id) ?? null, activo: u.activo === 1,
      general, materias: notasMateria, oral, capitulos: capitulosAlumno, temas, examenes,
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
