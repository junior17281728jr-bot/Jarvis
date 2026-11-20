// Academia 0.14.77 (pedido del dueño: «haz un apartado para ti (Claude) así ves todas las notas y dónde más fallan; si en
// un futuro te digo mejora clases e imágenes, eso es donde más falla y mal explicado»): Administrador → Avanzado →
// «Para Claude». Una página (y un Markdown para descargar o copiar) con lo que necesita quien edite el contenido:
//  1. el resumen por materia (práctica y examen) y del oral;
//  2. las 30 tarjetas o temas que más cuestan («Dónde más cuesta», con sus razones, su id, su título y su versión);
//  3. las preguntas del Test Guide que más fallan (con la mala más elegida);
//  4. las clases con «duda» o «se puede mejorar» (las opiniones);
//  5. las explicaciones con más 👎 en «¿Lo entendiste?»;
//  6. lo que funciona (lo que pasó a la clase como «Otra forma de verlo» y lo de más 👍);
//  7. lo que todavía tiene pocos datos (para no decidir con 1 o 2 alumnos).
// 0.14.85: ANTES de todo, la sección 0: los errores CONFIRMADOS por el administrador en «⚑ Reportar un error» (con sus
// ids y lo que escribieron los alumnos, sin nombres, correos ni teléfonos: src/academia/reporte-item.js) y lo que muchos
// alumnos reportaron pero era «cosa del alumno» (la explicación confunde; con la muestra mínima de alumnos distintos).
// Es lo ÚNICO escrito por alumnos que entra aquí. Un punto cuyo texto cambió (huella nueva) ya no sale.
// Siempre proporción Y muestra («8 de 10 alumnos fallaron (80 %)», «2 de 3 votaron 👎: pocos datos») y el orden por la
// cota baja de Wilson (wilsonBajo): 7 de 10 va arriba de 2 de 2.
// Solo agregados de todos los alumnos juntos, sin el administrador: ningún nombre, usuario, id de alumno, correo ni texto
// escrito por un alumno (de las opiniones van solo los números). Solo lee; los agregados van en SQL.
// Cada semana el trabajador guarda una foto (academia.claude.semana.<AAAA-Www>, una sola vez por semana, nunca se pisa)
// para comparar «antes / ahora» cuando cambia el texto de una tarjeta (su huella) o la versión del paquete.
import { fotoVigente, calcularTodo, guardarTodo, ordenCuesta, wilsonBajo, MUESTRA } from './donde-cuesta.js';
import { idTarjeta, huellaTarjeta } from './tarjeta-id.js';
import { todosLosVotos, MUESTRA_VOTOS, temaCualquiera } from './entendi.js';
import { resumenOpiniones } from './opiniones.js';
import { MATERIAS_ORAL } from './formato.js';
import { paraClaudeReportes, MUESTRA_CONFUSO } from './reporte-item.js';

export const FORMATO_PARA_CLAUDE = 'para-claude/1';
export const PRE_SEMANA = 'academia.claude.semana.';
export const TOPE = Object.freeze({ mejorar: 30, preguntas: 30, clases: 30, votos: 30, bien: 20, pocos: 20 });
const MUESTRA_OPINION = 5;
const iso = ms => new Date(ms).toISOString();
const json = t => { try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const pct = (a, b) => (b > 0 ? Math.round((a * 100) / b) : null);
const corto = (t, n = 120) => { const s = String(t ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const ALUMNOS = "usuario_id IN (SELECT id FROM usuarios WHERE rol <> 'admin')";

// La semana ISO (AAAA-Www, en UTC): siempre la misma para la misma fecha.
export function semanaIso(ms) {
  const d = new Date(ms);
  const dia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dia.getUTCDay() || 7;
  dia.setUTCDate(dia.getUTCDate() + 4 - dow);
  const inicio = Date.UTC(dia.getUTCFullYear(), 0, 1);
  const semana = Math.ceil(((dia.getTime() - inicio) / 86_400_000 + 1) / 7);
  return `${dia.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

// ---------- 1. El resumen ----------
function resumenMaterias(db, p) {
  const practica = new Map(db.prepare(`SELECT r.materia AS materia, COUNT(*) AS n, SUM(r.correcta) AS bien, COUNT(DISTINCT r.usuario_id) AS alumnos
    FROM academia_respuestas r JOIN academia_intentos i ON i.id = r.intento_id WHERE i.tipo <> 'examen' AND r.${ALUMNOS} GROUP BY r.materia`).all().map(f => [f.materia ?? '', f]));
  // El último examen terminado de cada alumno en cada materia (materia vacía = el examen oficial).
  const examen = new Map(db.prepare(`SELECT materia, COUNT(*) AS alumnos, AVG(nota) AS promedio, SUM(aprobado) AS aprobados FROM (
      SELECT COALESCE(materia, '') AS materia, (aciertos * 100.0) / total AS nota, COALESCE(aprobado, 0) AS aprobado,
        ROW_NUMBER() OVER (PARTITION BY usuario_id, COALESCE(materia, '') ORDER BY terminado_en DESC, id DESC) AS fila
      FROM academia_intentos WHERE tipo = 'examen' AND terminado_en IS NOT NULL AND total > 0 AND ${ALUMNOS})
    WHERE fila = 1 GROUP BY materia`).all().map(f => [f.materia, f]));
  const fila = id => {
    const pr = practica.get(id);
    const ex = examen.get(id);
    return {
      materia: id || 'oficial',
      practica: pr ? { pct: pct(pr.bien, pr.n), n: pr.n, alumnos: pr.alumnos } : null,
      examen: ex ? { promedio: Math.round(ex.promedio), alumnos: ex.alumnos, aprobados: ex.aprobados } : null,
    };
  };
  const ids = [...(p?.materias ?? []).filter(m => m.temas?.length).map(m => m.id)];
  for (const k of [...practica.keys(), ...examen.keys()]) if (k && !ids.includes(k)) ids.push(k);
  const out = ids.map(fila).filter(x => x.practica || x.examen || (p?.materias ?? []).some(m => m.id === x.materia && m.temas?.length));
  if (examen.has('')) out.push(fila(''));
  return out;
}
function resumenOral(db) {
  const practica = new Map(db.prepare(`SELECT materia, COUNT(*) AS n, SUM(correcta) AS bien, COUNT(DISTINCT usuario_id) AS alumnos FROM academia_extra_respuestas
    WHERE materia LIKE 'oral\\_%' ESCAPE '\\' AND nivel = 'oral_practica' AND ${ALUMNOS} GROUP BY materia`).all().map(f => [f.materia, f]));
  const admins = new Set(db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").all().map(f => f.id));
  const notas = new Map(); // capítulo → [última nota de cada alumno]
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave > 'academia.oral.' AND clave < 'academia.oral/'").all()) {
    const m = /^academia\.oral\.([1-9]\d{0,9})$/.exec(f.clave);
    if (!m || admins.has(Number(m[1]))) continue;
    const v = json(f.valor);
    for (const [cap, e] of Object.entries(v?.examenes ?? {})) {
      if (!e || !(Number(e.veces) > 0)) continue;
      const nota = Number.isFinite(Number(e.ultimo)) ? Number(e.ultimo) : Number(e.mejor) || 0;
      if (!notas.has(cap)) notas.set(cap, []);
      notas.get(cap).push({ nota, aprobado: e.aprobado === true });
    }
  }
  return [...MATERIAS_ORAL, 'final'].map(id => {
    const pr = practica.get(id);
    const l = notas.get(id) ?? [];
    return {
      materia: id,
      practica: pr ? { pct: pct(pr.bien, pr.n), n: pr.n, alumnos: pr.alumnos } : null,
      examen: l.length ? { promedio: Math.round(l.reduce((s, x) => s + x.nota, 0) / l.length), alumnos: l.length, aprobados: l.filter(x => x.aprobado).length } : null,
    };
  }).filter(x => x.practica || x.examen);
}

// ---------- 2. Lo que más cuesta ----------
function aMejorar(db, p, foto) {
  const conTarjetas = new Set((foto?.tarjetas ?? []).map(x => `${x.materia}/${x.tema}`));
  const filas = [
    ...(foto?.tarjetas ?? []).map(x => ({ ...x, tipo: 'tarjeta' })),
    ...(foto?.temas ?? []).filter(x => !conTarjetas.has(`${x.materia}/${x.tema}`)).map(x => ({ ...x, tipo: 'tema' })),
  ].sort(ordenCuesta).slice(0, TOPE.mejorar);
  return filas.map(x => {
    const t = temaCualquiera(p, x.materia, x.tema);
    const s = x.tipo === 'tarjeta' ? t?.secciones?.[x.indice] : null;
    return {
      tipo: x.tipo, id: x.tipo === 'tarjeta' ? (x.id ?? idTarjeta(x.materia, x.tema, x.titulo)) : `${x.materia}/${x.tema}`,
      materia: x.materia, tema: x.tema, indice: x.indice ?? null, titulo: corto(x.titulo, 160), temaTitulo: corto(x.temaTitulo ?? x.titulo, 160),
      paquete: t?.paquete ?? null, huella: s ? huellaTarjeta(s) : null, puntaje: x.puntaje, seguro: x.seguro ?? null, partes: partesDe(x.partes),
    };
  });
}
// Solo los números de cada parte (con su muestra).
function partesDe(pt = {}) {
  const f = pt.fallo;
  const pd = pt.pide;
  const d = pt.despues;
  const v = pt.no;
  return {
    fallo: f ? { ok: Boolean(f.ok), pct: f.pct, pctRespuestas: f.pctRespuestas ?? null, n: f.n, alumnos: f.alumnos ?? null, alumnosMal: f.alumnosMal ?? null } : null,
    no: v ? { ok: Boolean(v.ok), pct: v.pct, n: v.n, no: v.no } : null,
    pide: pd ? { ok: Boolean(pd.ok), pct: pd.pct, n: pd.n, pidieron: pd.pidieron ?? null } : null,
    despues: d ? { ok: Boolean(d.ok), pct: d.pct, n: d.n } : null,
    ...(pt.error ? { error: { ok: true, n: pt.error.n } } : {}),
    ...(pt.confuso ? { confuso: { ok: Boolean(pt.confuso.ok), n: pt.confuso.n } } : {}),
  };
}

// ---------- 3. Las preguntas que más fallan ----------
function preguntasQueFallan(db, p) {
  const filas = db.prepare(`SELECT pregunta, COUNT(*) AS alumnos, SUM(m) AS alumnosMal, SUM(n) AS n, SUM(mal) AS mal FROM (
      SELECT pregunta, usuario_id, COUNT(*) AS n, SUM(CASE WHEN correcta = 0 THEN 1 ELSE 0 END) AS mal,
        CASE WHEN SUM(CASE WHEN correcta = 0 THEN 1 ELSE 0 END) * 2 > COUNT(*) THEN 1 ELSE 0 END AS m
      FROM academia_respuestas WHERE ${ALUMNOS} GROUP BY pregunta, usuario_id)
    GROUP BY pregunta`).all().filter(f => p?.preguntas?.has(f.pregunta) && f.mal > 0);
  const ok = f => f.n >= MUESTRA.respuestas && f.alumnos >= MUESTRA.alumnos;
  const orden = (a, b) => wilsonBajo(b.alumnosMal, b.alumnos) - wilsonBajo(a.alumnosMal, a.alumnos) || b.mal * a.n - a.mal * b.n || b.n - a.n || String(a.pregunta).localeCompare(String(b.pregunta));
  const arriba = filas.filter(ok).sort(orden).slice(0, TOPE.preguntas);
  const pocos = filas.filter(f => !ok(f)).sort((a, b) => b.alumnosMal - a.alumnosMal || b.n - a.n || String(a.pregunta).localeCompare(String(b.pregunta))).slice(0, TOPE.pocos);
  const malas = new Map();
  if (arriba.length) {
    const marcas = arriba.map(() => '?').join(', ');
    for (const f of db.prepare(`SELECT pregunta, elegida, COUNT(*) AS n, COUNT(DISTINCT usuario_id) AS alumnos FROM academia_respuestas
      WHERE correcta = 0 AND ${ALUMNOS} AND pregunta IN (${marcas}) GROUP BY pregunta, elegida`).all(...arriba.map(f => f.pregunta))) {
      if (!malas.has(f.pregunta)) malas.set(f.pregunta, []);
      malas.get(f.pregunta).push(f);
    }
  }
  const vista = f => {
    const q = p.preguntas.get(f.pregunta);
    const lugar = p.deTema?.get(f.pregunta) ?? {};
    // Solo las letras de la pregunta original (en Modo reto se guarda R1/R2: esas no se cuentan aquí).
    const letras = new Map((q.original?.opciones ?? []).map(o => [o.letra, o.texto]));
    const l = (malas.get(f.pregunta) ?? []).filter(x => letras.has(x.elegida));
    const totalMal = l.reduce((s, x) => s + x.n, 0);
    const top = l.sort((a, b) => b.n - a.n || String(a.elegida).localeCompare(String(b.elegida)))[0];
    return {
      id: f.pregunta, numero: q.original?.numero ?? null, materia: lugar.materia ?? null, tema: lugar.tema ?? null, enunciado: corto(q.original?.enunciado, 140),
      n: f.n, mal: f.mal, pctMal: pct(f.mal, f.n), alumnos: f.alumnos, alumnosMal: f.alumnosMal, seguro: wilsonBajo(f.alumnosMal, f.alumnos),
      correcta: q.original?.correcta ?? null,
      // La mala más elegida, si la eligieron 2 veces o más.
      comun: top && top.n >= 2 ? { letra: top.elegida, n: top.n, alumnos: top.alumnos, pct: pct(top.n, totalMal), texto: corto(letras.get(top.elegida), 120) } : null,
    };
  };
  return { arriba: arriba.map(vista), pocos: pocos.map(f => ({ id: f.pregunta, n: f.n, mal: f.mal, alumnos: f.alumnos, alumnosMal: f.alumnosMal })) };
}

// ---------- 4. Las opiniones de cada clase (solo los números) ----------
function clasesConDudas(db, p) {
  const out = [];
  for (const m of resumenOpiniones(db, p)) {
    for (const l of m.lugares) {
      const noClara = l.duda + l.mejorar;
      if (!noClara) continue;
      out.push({ tipo: l.tipo, materia: m.materia, tema: l.tema ?? null, titulo: corto(l.titulo ?? '', 160), alumnos: l.alumnos, clara: l.clara, duda: l.duda, mejorar: l.mejorar, noClara, pct: pct(noClara, l.alumnos), ok: l.alumnos >= MUESTRA_OPINION, seguro: wilsonBajo(noClara, l.alumnos) });
    }
  }
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || b.seguro - a.seguro || b.noClara - a.noClara || `${a.materia}/${a.tema}`.localeCompare(`${b.materia}/${b.tema}`)).slice(0, TOPE.clases);
}

// ---------- 5 y 6. Los votos de «¿Lo entendiste?» y lo que funciona ----------
function referencia(x) {
  const d = x.donde ?? {};
  if (x.tipo === 'tarjeta') return { ref: `${d.materia}/${d.tema}#${(x.indice ?? 0) + 1}`, titulo: corto(d.titulo, 160), paquete: d.paquete ?? null };
  if (x.tipo === 'pregunta') return { ref: `pregunta=${d.pregunta}`, titulo: d.numero != null ? `n.º ${d.numero}` : '', paquete: null };
  if (x.tipo === 'oral') return { ref: `${d.materia}/${d.tema}#libro${(x.indice ?? 0) + 1}`, titulo: corto(d.pregunta_en, 120), paquete: d.paquete ?? null };
  return { ref: d.clave, titulo: d.otra ? `«Otra forma de verlo» de ${d.materia}/${d.tema} «${corto(d.titulo, 100)}»` : d.sub, paquete: null };
}
function votos(db, p) {
  const vig = todosLosVotos(db, p).filter(x => x.vigente && x.n > 0);
  const fila = x => ({ tipo: x.tipo, id: x.id, huella: x.h, ...referencia(x), si: x.si, no: x.no, n: x.n, pctNo: pct(x.no, x.n), ok: x.n >= MUESTRA_VOTOS });
  const nombre = (a, b) => `${a.tipo}.${a.id}`.localeCompare(`${b.tipo}.${b.id}`);
  const malos = vig.filter(x => x.n >= MUESTRA_VOTOS && x.no > 0).sort((a, b) => wilsonBajo(b.no, b.n) - wilsonBajo(a.no, a.n) || b.n - a.n || nombre(a, b)).slice(0, TOPE.votos).map(fila);
  const buenos = vig.filter(x => x.n >= MUESTRA_VOTOS && x.si * 10 >= x.n * 7).sort((a, b) => wilsonBajo(b.si, b.n) - wilsonBajo(a.si, a.n) || b.n - a.n || nombre(a, b)).slice(0, TOPE.bien).map(fila);
  const pocos = vig.filter(x => x.n < MUESTRA_VOTOS && x.no > 0).sort((a, b) => b.no - a.no || b.n - a.n || nombre(a, b)).slice(0, TOPE.pocos).map(fila);
  return { malos, buenos, pocos };
}
function promovidas(db, p) {
  const out = [];
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave > 'academia.clase.otra.' AND clave < 'academia.clase.otra/'").all()) {
    const v = json(f.valor);
    if (!v) continue;
    const t = temaCualquiera(p, v.materia, v.tema);
    const indice = (t?.secciones ?? []).findIndex(s => s.titulo === v.titulo);
    if (indice < 0 || huellaTarjeta(t.secciones[indice]) !== v.h) continue; // el texto cambió: ya no sale en la clase
    out.push({ ref: `${v.materia}/${v.tema}#${indice + 1}`, id: idTarjeta(v.materia, v.tema, v.titulo), titulo: corto(v.titulo, 160), clave: v.clave, en: v.en ?? null,
      vieron: v.medida?.vieron ?? null, sin: v.medida?.sin ?? null, votos: v.medida?.votos ?? null });
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

// ---------- Todo junto (solo lee, salvo la cuenta de «Dónde más cuesta» si no hay una reciente) ----------
export function fotoCuesta(db, p, ahora) {
  let foto = fotoVigente(db, ahora);
  if (!foto) { const todo = calcularTodo(db, p, ahora); guardarTodo(db, todo, ahora); foto = todo.foto; }
  return foto;
}
export function armarReporte(db, p, { ahora = Date.now(), foto = null } = {}) {
  const f = foto ?? (p ? fotoCuesta(db, p, ahora) : null);
  const semana = semanaIso(ahora);
  const anterior = semanaAnterior(db, semana);
  const v = p ? votos(db, p) : { malos: [], buenos: [], pocos: [] };
  const preguntas = p ? preguntasQueFallan(db, p) : { arriba: [], pocos: [] };
  const mejorar = p ? aMejorar(db, p, f) : [];
  const antes = new Map((anterior?.valor?.items ?? []).map(x => [`${x.tipo}.${x.id}`, x]));
  for (const x of mejorar) {
    const a = antes.get(`${x.tipo}.${x.id}`);
    if (a) x.antes = { semana: anterior.semana, puntaje: a.puntaje ?? null, huella: a.huella ?? null, paquete: a.paquete ?? null, textoNuevo: Boolean(a.huella && x.huella && a.huella !== x.huella), paqueteNuevo: a.paquete != null && x.paquete != null && a.paquete !== x.paquete };
  }
  // Lo que estaba en la lista la semana anterior y ya no está (mejoró, o su texto cambió): con su puntaje de ahora.
  const enLista = new Set(mejorar.map(x => `${x.tipo}.${x.id}`));
  const ahoraDe = new Map([...(f?.tarjetas ?? []).map(x => [`tarjeta.${x.id ?? idTarjeta(x.materia, x.tema, x.titulo)}`, x]), ...(f?.temas ?? []).map(x => [`tema.${x.materia}/${x.tema}`, x])]);
  const salieron = (anterior?.valor?.items ?? []).filter(x => !enLista.has(`${x.tipo}.${x.id}`)).slice(0, TOPE.pocos).map(x => {
    const y = ahoraDe.get(`${x.tipo}.${x.id}`);
    const t = temaCualquiera(p, x.materia, x.tema);
    const s = x.tipo === 'tarjeta' && x.indice != null ? t?.secciones?.[x.indice] : null;
    const huellaAhora = s ? huellaTarjeta(s) : null;
    return { tipo: x.tipo, id: x.id, ref: `${x.materia}/${x.tema}${x.indice != null ? `#${x.indice + 1}` : ''}`, antes: x.puntaje ?? null, ahora: y?.puntaje ?? null, textoNuevo: Boolean(x.huella && huellaAhora && x.huella !== huellaAhora) };
  });
  let reportes = { confirmados: [], confusos: [] };
  try { reportes = paraClaudeReportes(db, p, { tope: TOPE.mejorar }); } catch (error) { console.error('reportes en «Para Claude»:', error?.name ?? 'Error'); }
  return {
    formato: FORMATO_PARA_CLAUDE, en: iso(ahora), semana, comparadaCon: anterior?.semana ?? null, salieron,
    errores: reportes.confirmados, confusos: reportes.confusos,
    paquete: p ? { id: p.id ?? null, ids: Array.isArray(p.ids) ? [...p.ids] : [], edicion: p.edicion ?? null } : null,
    muestra: { respuestas: MUESTRA.respuestas, alumnos: MUESTRA.alumnos, votos: MUESTRA_VOTOS, opiniones: MUESTRA_OPINION, confuso: MUESTRA_CONFUSO },
    alumnos: db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol <> 'admin'").get().n,
    materias: p ? resumenMaterias(db, p) : [], oral: resumenOral(db),
    mejorar, pocosTarjetas: (f?.pocos ?? []).slice(0, TOPE.pocos).map(x => ({ ref: `${x.materia}/${x.tema}#${(x.indice ?? 0) + 1}`, id: x.id, titulo: corto(x.titulo, 160), partes: partesDe(x.partes) })),
    preguntas: preguntas.arriba, pocasPreguntas: preguntas.pocos,
    clases: p ? clasesConDudas(db, p) : [],
    votosMalos: v.malos, votosBuenos: v.buenos, pocosVotos: v.pocos,
    promovidas: p ? promovidas(db, p) : [],
  };
}

// ---------- El Markdown (formato estable: lo lee otra sesión de Claude) ----------
const celda = x => corto(x, 200).replace(/\|/g, '\\|');
const deN = (k, n) => `${k} de ${n}`;
function lineaFallo(f) {
  if (!f) return null;
  const alumnos = f.alumnosMal != null && f.alumnos != null ? `${deN(f.alumnosMal, f.alumnos)} alumnos fallaron la mayoría (${f.pct} %; ${f.pctRespuestas ?? '-'} % de ${f.n} respuestas mal)` : `fallan ${f.pct} % de ${f.n} respuestas`;
  return `fallo: ${alumnos}${f.ok ? '' : ' — pocos datos'}`;
}
function lineasPartes(pt) {
  return [
    lineaFallo(pt.fallo),
    pt.no ? `no se entendió: ${deN(pt.no.no, pt.no.n)} votaron 👎 (${pt.no.pct} %)${pt.no.ok ? '' : ' — pocos datos'}` : null,
    pt.pide ? `«Explícamelo mejor» / «Profundizar»: ${pt.pide.pidieron != null ? deN(pt.pide.pidieron, pt.pide.n) : `${pt.pide.pct} % de ${pt.pide.n}`} alumnos pidieron ayuda (${pt.pide.pct} %)${pt.pide.ok ? '' : ' — pocos datos'}` : null,
    pt.despues ? `acertó después: falló la siguiente vez ${pt.despues.pct} % de ${pt.despues.n} veces${pt.despues.ok ? '' : ' — pocos datos'}` : null,
    pt.error ? `error confirmado: ${pt.error.n} alumnos lo reportaron y el administrador les dio la razón` : null,
    pt.confuso ? `confunde: ${pt.confuso.n} alumnos lo reportaron y era «cosa del alumno»${pt.confuso.ok ? '' : ' — pocos datos'}` : null,
  ].filter(Boolean);
}
const nota = x => (x ? `${x.pct} % (de ${x.n} respuestas, ${x.alumnos} alumnos)` : '—');
const examen = x => (x ? `${x.promedio} % (${x.alumnos} alumnos, ${x.aprobados} aprobaron)` : '—');

export function markdownParaClaude(r) {
  const L = [];
  const p = (...x) => L.push(...x);
  p('# Para Claude: dónde mejorar el contenido', '',
    `formato: ${r.formato}`, `generado: ${r.en}`, `semana: ${r.semana}`, `comparada con: ${r.comparadaCon ?? 'ninguna'}`,
    `paquete: ${r.paquete ? `id=${r.paquete.id} versiones=${r.paquete.ids.join(',') || '-'} edicion=${r.paquete.edicion ?? '-'}` : 'ninguno'}`,
    `alumnos: ${r.alumnos}`,
    `muestra mínima: ${r.muestra.respuestas} respuestas de ${r.muestra.alumnos} alumnos; ${r.muestra.votos} votos; ${r.muestra.opiniones} opiniones`, '',
    '> Solo números de todos los alumnos juntos (sin el administrador). Sin nombres ni datos personales.',
    '> La sección 0 es lo único escrito por alumnos (sus porqués, sin nombres, correos ni teléfonos).',
    '> «x de n» = alumnos distintos (o votos). «pocos datos» = menos de la muestra mínima: no decidir con eso.',
    '> El orden va por la cota baja de Wilson (95 %): la proporción junto con su muestra.',
    '> Ids: tarjeta = materia/tema#n (n desde 1, en la lista «secciones» del tema) con id = sha256(materia|tema|título)[0:24];',
    '> pregunta = id del paquete; oral = materia/tema#libroN (libro_qa); ia = clave de lo guardado. huella = versión del texto medido.',
    '> Al cambiar un texto (huella nueva) empiezan de cero los votos y los pedidos de ayuda; el fallo junta TODAS las respuestas',
    '> (también de antes del cambio): para ver si una reescritura sirvió, mira los votos y «antes / ahora», no solo el fallo.', '');
  p('## 0. Errores confirmados por el administrador (arreglar primero)', '');
  if (!(r.errores ?? []).length) p('(ninguno)');
  (r.errores ?? []).forEach((x, i) => {
    p(`${i + 1}. [${x.tipo}] ${x.ref}${x.titulo ? ` «${celda(x.titulo)}»` : ''}`, `   - id=${x.id ?? '-'} paquete=${x.paquete ?? '-'} huella=${x.huella ?? '-'}`,
      `   - ${deN(x.confirmaron, x.alumnos)} alumnos que lo reportaron tienen razón (confirmado por el administrador)`);
    for (const z of x.razones ?? []) p(`   - ${z.que}: «${celda(z.texto)}»`);
  });
  if ((r.confusos ?? []).length) {
    p('', `### Confunde: ${r.muestra?.confuso ?? MUESTRA_CONFUSO} alumnos o más lo reportaron y era «cosa del alumno»`, '');
    r.confusos.forEach((x, i) => p(`${i + 1}. [${x.tipo}] ${x.ref}${x.titulo ? ` «${celda(x.titulo)}»` : ''}: ${x.confuso} alumnos — la explicación confunde (id=${x.id ?? '-'} huella=${x.huella ?? '-'})`));
  }
  p('', '## 1. Resumen por materia', '', '| materia | práctica | examen (el último de cada alumno) |', '|---|---|---|');
  for (const m of r.materias) p(`| ${celda(m.materia)} | ${nota(m.practica)} | ${examen(m.examen)} |`);
  if (!r.materias.length) p('| — | — | — |');
  p('', '### Oral', '', '| capítulo | práctica | examen (el último de cada alumno) |', '|---|---|---|');
  for (const m of r.oral) p(`| ${celda(m.materia)} | ${nota(m.practica)} | ${examen(m.examen)} |`);
  if (!r.oral.length) p('| — | — | — |');
  p('', `## 2. Las ${TOPE.mejorar} tarjetas o temas para mejorar primero`, '');
  if (!r.mejorar.length) p('(todavía sin datos suficientes)');
  r.mejorar.forEach((x, i) => {
    const ref = x.tipo === 'tarjeta' ? `${x.materia}/${x.tema}#${(x.indice ?? 0) + 1} «${x.titulo}» (tema «${x.temaTitulo}»)` : `${x.materia}/${x.tema} «${x.temaTitulo}»`;
    p(`${i + 1}. [${x.tipo}] ${ref}`, `   - id=${x.id} paquete=${x.paquete ?? '-'} huella=${x.huella ?? '-'}`, `   - cuesta ${x.puntaje}/100 (seguro ${x.seguro ?? '-'}/100)`);
    for (const l of lineasPartes(x.partes)) p(`   - ${l}`);
    if (x.antes) p(`   - antes (${x.antes.semana}): ${x.antes.puntaje ?? '-'}/100${x.antes.textoNuevo ? ' — el texto cambió desde entonces' : ' — mismo texto'}${x.antes.paqueteNuevo ? `; otra versión del paquete (antes ${x.antes.paquete})` : ''}`);
  });
  if (r.salieron?.length) {
    p('', `### Salieron de la lista desde ${r.comparadaCon}`, '');
    r.salieron.forEach((x, i) => p(`${i + 1}. [${x.tipo}] ${x.ref} id=${x.id}: antes ${x.antes ?? '-'}/100, ahora ${x.ahora ?? 'sin datos suficientes'}${x.ahora == null ? '' : '/100'}${x.textoNuevo ? ' — el texto cambió' : ''}`));
  }
  p('', '## 3. Preguntas del Test Guide que más fallan', '');
  if (!r.preguntas.length) p('(todavía sin datos suficientes)');
  r.preguntas.forEach((q, i) => {
    p(`${i + 1}. pregunta=${q.id}${q.numero != null ? ` (n.º ${q.numero})` : ''} ${q.materia ?? '-'}/${q.tema ?? '-'}: ${deN(q.alumnosMal, q.alumnos)} alumnos fallaron la mayoría (${pct(q.alumnosMal, q.alumnos)} %; ${q.pctMal} % de ${q.n} respuestas mal); correcta ${q.correcta ?? '-'}`);
    if (q.enunciado) p(`   - «${q.enunciado}»`);
    p(q.comun ? `   - la mala más elegida: ${q.comun.letra} (${q.comun.pct} % de los errores, ${q.comun.alumnos} alumnos) «${q.comun.texto}»` : '   - la mala más elegida: — (repartida o pocos datos)');
  });
  p('', '## 4. Clases con «Me quedó una duda» o «Se puede mejorar»', '');
  if (!r.clases.length) p('(ninguna)');
  r.clases.forEach((c, i) => p(`${i + 1}. [${c.tipo}] ${c.materia}${c.tema ? `/${c.tema}` : ''}${c.titulo ? ` «${c.titulo}»` : ''}: ${deN(c.noClara, c.alumnos)} alumnos (${c.pct} %): duda ${c.duda}, se puede mejorar ${c.mejorar}, clara ${c.clara}${c.ok ? '' : ' — pocos datos'}`));
  p('', '## 5. Explicaciones que no se entendieron (👎 en «¿Lo entendiste?»)', '');
  if (!r.votosMalos.length) p('(ninguna con la muestra mínima)');
  r.votosMalos.forEach((x, i) => p(`${i + 1}. [${x.tipo}] ${x.ref}${x.titulo ? ` «${x.titulo}»` : ''}: ${deN(x.no, x.n)} votaron 👎 (${x.pctNo} %) — id=${x.id} huella=${x.huella}`));
  p('', '## 6. Lo que funciona', '', '### Pasaron a la clase como «Otra forma de verlo»', '');
  if (!r.promovidas.length) p('(ninguna)');
  r.promovidas.forEach((x, i) => p(`${i + 1}. ${x.ref} «${x.titulo}»: los que la leyeron aciertan ${x.vieron?.pct ?? '-'} % (${x.vieron?.alumnos ?? '-'} alumnos), los demás ${x.sin?.pct ?? '-'} %${x.votos ? `; 👍 ${x.votos.si} / 👎 ${x.votos.no}` : ''} — clave=${x.clave}`));
  p('', '### Con más 👍', '');
  if (!r.votosBuenos.length) p('(ninguna con la muestra mínima)');
  r.votosBuenos.forEach((x, i) => p(`${i + 1}. [${x.tipo}] ${x.ref}${x.titulo ? ` «${x.titulo}»` : ''}: ${deN(x.si, x.n)} votaron 👍 (${100 - x.pctNo} %) — id=${x.id}`));
  p('', '## 7. Pocos datos (todavía no decidir)', '');
  const pocos = [
    ...r.pocosTarjetas.map(x => `tarjeta ${x.ref} «${x.titulo}»: ${lineasPartes(x.partes).join('; ')}`),
    ...r.pocasPreguntas.map(q => `pregunta=${q.id}: ${deN(q.alumnosMal, q.alumnos)} alumnos fallaron la mayoría (${q.mal} de ${q.n} respuestas) — pocos datos`),
    ...r.pocosVotos.map(x => `[${x.tipo}] ${x.ref}: ${deN(x.no, x.n)} votaron 👎 — pocos datos`),
  ];
  if (!pocos.length) p('(nada)');
  for (const l of pocos) p(`- ${l}`);
  p('', '## Cómo aplicar las mejoras', '',
    '- Arregla primero los errores confirmados de la sección 0 (lo que el administrador ya revisó); después, lo de arriba de la sección 2.',
    '- Usa las secciones 3 a 5 para saber qué parte confunde.',
    '- Mira la sección 6 para copiar lo que ya funciona (el estilo de lo que tiene más 👍).',
    '- Cambia el texto en el paquete (misma materia, tema y título si es la misma tarjeta). La huella nueva hace que sus votos empiecen de cero.',
    '- No uses lo de «pocos datos» para decidir. La semana siguiente, compara «antes / ahora» en la sección 2.', '');
  return L.join('\n');
}

// ---------- La foto de cada semana (la guarda el trabajador; una por semana, nunca se pisa) ----------
export const claveSemana = semana => `${PRE_SEMANA}${semana}`;
function semanaAnterior(db, semana) {
  const f = db.prepare('SELECT clave, valor FROM ajustes WHERE clave > ? AND clave < ? ORDER BY clave DESC LIMIT 1').get(PRE_SEMANA, claveSemana(semana));
  return f ? { semana: f.clave.slice(PRE_SEMANA.length), valor: json(f.valor) } : null;
}
export const haySemana = (db, ahora) => Boolean(db.prepare('SELECT 1 FROM ajustes WHERE clave = ?').get(claveSemana(semanaIso(ahora))));
// Solo números, ids y huellas (nada de alumnos).
export function fotoSemanal(reporte) {
  return {
    formato: reporte.formato, semana: reporte.semana, en: reporte.en, paquete: reporte.paquete,
    materias: reporte.materias, oral: reporte.oral,
    items: reporte.mejorar.map(x => ({ tipo: x.tipo, id: x.id, materia: x.materia, tema: x.tema, indice: x.indice, huella: x.huella, paquete: x.paquete, puntaje: x.puntaje, seguro: x.seguro,
      fallo: x.partes.fallo?.pct ?? null, no: x.partes.no?.pct ?? null })),
    preguntas: reporte.preguntas.map(q => ({ id: q.id, pctMal: q.pctMal, alumnos: q.alumnos, alumnosMal: q.alumnosMal })),
    votos: reporte.votosMalos.map(x => ({ tipo: x.tipo, id: x.id, huella: x.huella, si: x.si, no: x.no })),
  };
}
// Dentro de una escritura: la guarda solo si esa semana todavía no tiene (INSERT OR IGNORE: nunca pisa una).
export function guardarSemana(db, foto, ahora = Date.now()) {
  return db.prepare('INSERT OR IGNORE INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(claveSemana(foto.semana), JSON.stringify(foto), iso(ahora)).changes === 1;
}
