// Academia 0.14.9 (pedido del dueño: «el progreso del alumno no se actualiza y solo sale una materia»): el AVANCE de cada
// alumno para el administrador («Cómo van todos» y su ficha; rutas { admin: true }). Solo lee: sin cambio de base.
//  - Test Guide: las 11 materias en el orden de la escuela; cada tema está «hecho» (aprobó su práctica, o lo leyó entero si
//    no tiene preguntas), «empezado» (vio tarjetas, respondió algo o hizo una práctica sin aprobar) o «nuevo». El % del
//    curso = temas hechos ÷ TODOS los temas de TODAS las materias con clases (una suma tema por tema, no el % de una sola
//    materia ni un promedio de materias). Una materia sin clases todavía sale «pronto» y no entra en la cuenta.
//  - Oral: igual, por capítulo (los 9); un tema está hecho si leyó su lección o practicó todas sus preguntas. El examen
//    final (de todos los capítulos) no mueve «Ahora en» ni empieza temas.
//  - «Ahora en»: el tema de lo ÚLTIMO que hizo (tarjetas, respuestas, prácticas, exámenes); si ese tema ya está hecho, el
//    siguiente sin hacer. Sin nada con fecha (solo lecturas), el primero sin hacer.
// Pocas consultas para TODOS los alumnos a la vez (una por tabla, sin una por alumno ni por tema): 1 CPU y 512 MB.
import { MATERIAS, MATERIAS_ORAL } from './formato.js';

const pct = (a, b) => (b > 0 ? Math.floor((a * 100) / b) : 0);
const mayor = (a, b) => (!a ? b ?? null : !b ? a : a > b ? a : b);
const esObjeto = v => v != null && typeof v === 'object' && !Array.isArray(v);
const json = texto => { try { return JSON.parse(texto); } catch { return null; } };

// Lo guardado de cada alumno en «ajustes» (lecturas, tarjetas vistas y el oral), en UNA consulta.
function ajustesDe(db, ids) {
  const filas = db.prepare(`SELECT clave, valor FROM ajustes WHERE clave LIKE 'academia.temas\\_leidos.%' ESCAPE '\\'
    OR clave LIKE 'academia.tema\\_paso.%' ESCAPE '\\' OR clave LIKE 'academia.oral.%'`).all();
  const de = new Map();
  for (const f of filas) {
    const m = /^academia\.(temas_leidos|tema_paso|oral)\.(\d+)$/.exec(f.clave);
    if (!m) continue;
    const id = Number(m[2]);
    if (ids && !ids.has(id)) continue;
    if (!de.has(id)) de.set(id, { leidos: new Set(), pasos: {}, oral: { leidos: new Set(), examenes: {} } });
    const v = json(f.valor);
    const x = de.get(id);
    if (m[1] === 'temas_leidos' && Array.isArray(v)) x.leidos = new Set(v.filter(s => typeof s === 'string'));
    else if (m[1] === 'tema_paso' && esObjeto(v)) x.pasos = v;
    else if (m[1] === 'oral' && esObjeto(v)) x.oral = { leidos: new Set(Array.isArray(v.leidos) ? v.leidos.filter(s => typeof s === 'string') : []), examenes: esObjeto(v.examenes) ? v.examenes : {} };
  }
  return de;
}

// Agrupa filas por alumno: Map id → Map clave → fila.
function agrupar(filas, clave) {
  const m = new Map();
  for (const f of filas) {
    if (!m.has(f.usuario_id)) m.set(f.usuario_id, new Map());
    m.get(f.usuario_id).set(clave(f), f);
  }
  return m;
}

// Dónde está: el tema del evento más nuevo (o, si ya lo hizo, el siguiente sin hacer). bloques: [{ id, temas: [{ id, estado }] }].
// ultimo: { bloque, tema|null (null = su examen), en } | null. → { bloque: índice, tema: índice } | null
export function posicionActual(bloques, ultimo) {
  const sinHacer = (desdeB, desdeT) => {
    for (let b = desdeB; b < bloques.length; b++) {
      const temas = bloques[b].temas;
      for (let k = b === desdeB ? desdeT : 0; k < temas.length; k++) if (temas[k].estado !== 'hecho') return { bloque: b, tema: k };
    }
    return null;
  };
  if (ultimo) {
    const b = bloques.findIndex(x => x.id === ultimo.bloque);
    if (b >= 0) {
      const k = ultimo.tema == null ? 0 : Math.max(0, bloques[b].temas.findIndex(t => t.id === ultimo.tema));
      const aqui = sinHacer(b, k);
      if (aqui) return aqui;
    }
  }
  return sinHacer(0, 0);
}

function armar(bloques, ultimo) {
  const conClases = bloques.filter(b => b.temas.length);
  const total = conClases.reduce((n, b) => n + b.temas.length, 0);
  const hechos = conClases.reduce((n, b) => n + b.hechos, 0);
  const empezados = conClases.reduce((n, b) => n + b.temas.filter(t => t.estado === 'empezado').length, 0);
  const pos = posicionActual(conClases, ultimo);
  const algo = hechos > 0 || empezados > 0 || Boolean(ultimo);
  let ahora = null;
  if (pos && algo) {
    const b = conClases[pos.bloque];
    const t = b.temas[pos.tema];
    b.actual = true;
    t.actual = true;
    ahora = { id: b.id, numero: b.numero, tema: t.id, temaNumero: pos.tema + 1, temas: b.temas.length, titulo: t.titulo };
  }
  return {
    pct: pct(hechos, total), hechos, total, empezados,
    terminado: total > 0 && hechos === total, empezo: algo,
    ahora, ultima: ultimo?.en ?? null, bloques,
  };
}

// → Map usuarioId → { tg, oral, ultima }. ids: Set de alumnos (null: todos).
export function avanceDeAlumnos(db, paquete, ids = null) {
  const filtro = ids && ids.size === 1 ? ` AND usuario_id = ${Number([...ids][0])}` : '';
  const filtroR = filtro.replace('usuario_id', 'r.usuario_id');
  const ajustes = ajustesDe(db, ids);
  // Los temas: aprobado (de un intento terminado), y la fecha de lo último (intento empezado o terminado).
  const temas = agrupar(db.prepare(`SELECT usuario_id, materia, tema, MAX(CASE WHEN tipo = 'tema' AND terminado_en IS NOT NULL THEN aprobado ELSE 0 END) AS aprobado,
    MAX(COALESCE(terminado_en, empezado_en)) AS en FROM academia_intentos WHERE tipo IN ('tema', 'reto') AND tema IS NOT NULL${filtro} GROUP BY usuario_id, materia, tema`).all(), f => `${f.materia}/${f.tema}`);
  // Lo que respondió DENTRO de ese tema (su práctica o su reto): la fecha de lo último. El repaso, «Mis errores», la
  // práctica del instructor y el Repaso final mezclan temas de todo el curso: no dicen dónde va (ni empiezan un tema).
  const resp = agrupar(db.prepare(`SELECT r.usuario_id, r.materia, r.tema, MAX(r.creada_en) AS en FROM academia_respuestas r
    JOIN academia_intentos i ON i.id = r.intento_id WHERE i.tipo IN ('tema', 'reto') AND i.tema = r.tema${filtroR}
    GROUP BY r.usuario_id, r.materia, r.tema`).all(), f => `${f.materia}/${f.tema}`);
  const examenes = agrupar(db.prepare(`SELECT usuario_id, materia, MAX(CASE WHEN terminado_en IS NOT NULL THEN aprobado ELSE 0 END) AS aprobado,
    MAX(CASE WHEN terminado_en IS NOT NULL AND total > 0 THEN aciertos * 100 / total END) AS mejor, MAX(COALESCE(terminado_en, empezado_en)) AS en
    FROM academia_intentos WHERE tipo = 'examen'${filtro} GROUP BY usuario_id, materia`).all(), f => f.materia);
  const hayOral = Boolean(paquete?.oral?.hay);
  const oralResp = hayOral ? agrupar(db.prepare(`SELECT usuario_id, materia, tema, nivel, COUNT(DISTINCT pregunta) AS vistas, MAX(creada_en) AS en
    FROM academia_extra_respuestas WHERE materia LIKE 'oral\\_%' ESCAPE '\\' AND nivel <> 'oral_final'${filtro} GROUP BY usuario_id, materia, tema, nivel = 'oral_practica'`).all(),
  f => `${f.materia}/${f.tema}/${f.nivel === 'oral_practica' ? 'p' : 'e'}`) : new Map();

  const todos = ids ? [...ids] : [...new Set([...ajustes.keys(), ...temas.keys(), ...resp.keys(), ...examenes.keys(), ...oralResp.keys()])];
  const salida = new Map();
  for (const id of todos) {
    const aj = ajustes.get(id) ?? { leidos: new Set(), pasos: {}, oral: { leidos: new Set(), examenes: {} } };
    const misTemas = temas.get(id) ?? new Map();
    const misResp = resp.get(id) ?? new Map();
    const misEx = examenes.get(id) ?? new Map();
    let ultimoTg = null;
    const verFecha = (en, bloque, tema) => { if (en && (!ultimoTg || en > ultimoTg.en)) ultimoTg = { bloque, tema, en }; };
    const tg = MATERIAS.map((mid, n) => {
      const m = (paquete?.materias ?? []).find(x => x.id === mid);
      const ex = misEx.get(mid);
      if (ex) verFecha(ex.en, mid, null);
      const lista = (m?.temas ?? []).map(t => {
        const k = `${mid}/${t.id}`;
        const it = misTemas.get(k);
        const r = misResp.get(k);
        const p = esObjeto(aj.pasos[k]) ? aj.pasos[k] : null;
        const leido = aj.leidos.has(k);
        const hecho = it?.aprobado === 1 || (!t.preguntas.length && leido);
        const empezado = Boolean(it || r || leido || (p && Number(p.max) > 0));
        verFecha(mayor(mayor(it?.en, r?.en), typeof p?.en === 'string' ? p.en : null), mid, t.id);
        return { id: t.id, titulo: t.titulo, estado: hecho ? 'hecho' : empezado ? 'empezado' : 'nuevo' };
      });
      const hechos = lista.filter(t => t.estado === 'hecho').length;
      return { id: mid, numero: n + 1, pronto: !lista.length, temas: lista, hechos, pct: pct(hechos, lista.length), actual: false,
        examen: ex ? { aprobado: ex.aprobado === 1, mejor: ex.mejor ?? null } : null };
    });
    let oral = null;
    let ultimoOral = null;
    if (hayOral) {
      const verOral = (en, bloque, tema) => { if (en && (!ultimoOral || en > ultimoOral.en)) ultimoOral = { bloque, tema, en }; };
      const mios = oralResp.get(id) ?? new Map();
      const capitulos = MATERIAS_ORAL.map((cid, n) => {
        const m = paquete.oral.materias.find(x => x.id === cid);
        const e = aj.oral.examenes[cid];
        if (esObjeto(e) && typeof e.en === 'string') verOral(e.en, cid, null);
        const lista = (m?.temas ?? []).map(t => {
          const k = `${cid}/${t.id}`;
          const pr = mios.get(`${k}/p`);
          const ex = mios.get(`${k}/e`);
          const leido = aj.oral.leidos.has(k);
          const hecho = leido || (t.preguntas.length > 0 && (pr?.vistas ?? 0) >= t.preguntas.length);
          verOral(pr?.en, cid, t.id);
          if (ex) verOral(ex.en, cid, null);
          return { id: t.id, titulo: t.titulo, estado: hecho ? 'hecho' : pr || ex ? 'empezado' : 'nuevo' };
        });
        const hechos = lista.filter(t => t.estado === 'hecho').length;
        return { id: cid, numero: n + 1, pronto: !lista.length, temas: lista, hechos, pct: pct(hechos, lista.length), actual: false,
          examen: esObjeto(e) && Number(e.veces) > 0 ? { aprobado: e.aprobado === true, mejor: Number(e.mejor) || 0 } : null };
      });
      oral = armar(capitulos, ultimoOral);
    }
    const t = armar(tg, ultimoTg);
    salida.set(id, { tg: t, oral, ultima: mayor(t.ultima, oral?.ultima ?? null) });
  }
  return salida;
}

// Lo de un alumno sin nada (para quien no aparece en ninguna tabla).
export function avanceVacio(paquete) {
  return avanceDeAlumnos(db0(), paquete, new Set([0])).get(0);
}
// Una base vacía en memoria sería pesada: se arma «a mano» con las mismas reglas (sin filas).
function db0() {
  return { prepare: () => ({ all: () => [] }) };
}

// Para la ruta de un alumno y para todos los alumnos de una lista (siempre con una entrada por alumno).
export function avanceDe(db, paquete, usuarioIds) {
  const ids = new Set(usuarioIds.map(Number));
  const m = ids.size === 1 ? avanceDeAlumnos(db, paquete, ids) : avanceDeAlumnos(db, paquete, null);
  return new Map([...ids].map(id => [id, m.get(id) ?? avanceVacio(paquete)]));
}
