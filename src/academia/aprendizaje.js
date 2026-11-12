// Academia 0.10.0: Administrador → «Aprendizaje»: ¿los alumnos aprenden de verdad y la adaptación funciona? Solo LEE
// la base (respuestas, intentos, fallas, explicaciones pedidas). Cada número lleva su «n» (de cuántos sale) y, con menos
// de MINIMO, se marca «aún sin datos suficientes»: nunca se presenta como seguro algo que sale de muy pocos datos.
// Con usuarioId: lo mismo de UN alumno (su ficha).
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { videosVistos, puntosYRacha } from './progreso.js';
import { planDe } from './plan.js';
import { ideaDe } from './reto.js';

export const MINIMO = 10;
const DIA = 86_400_000;
const pct = (a, b) => (b > 0 ? Math.round((a * 100) / b) : null);
const medida = (a, b) => ({ pct: pct(a, b), n: b, pocos: b < MINIMO });
const diasEntre = (a, b) => (Date.parse(b) - Date.parse(a)) / DIA;

// Cada «Explícamelo de otra forma» (para saber si sirvió: ¿acertó la siguiente vez?). Por alumno, los últimos 500.
const claveExplicado = id => `academia.explicado.${Number(id)}`;
export function anotarExplicado(db, usuarioId, { pregunta, ia, ahora = Date.now() }) {
  let l = [];
  try { l = JSON.parse(leerAjuste(db, claveExplicado(usuarioId)) ?? '[]'); } catch { l = []; }
  if (!Array.isArray(l)) l = [];
  guardarAjuste(db, claveExplicado(usuarioId), JSON.stringify([...l, { p: pregunta, en: new Date(ahora).toISOString(), ia: ia === true }].slice(-500)));
}
function explicados(db, usuarioId) {
  try { const l = JSON.parse(leerAjuste(db, claveExplicado(usuarioId)) ?? '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}

export function estadisticas(db, paquete, { usuarioId = null, ahoraMs = Date.now() } = {}) {
  const alumnos = usuarioId != null ? [usuarioId] : db.prepare("SELECT id FROM usuarios WHERE rol <> 'admin' AND activo = 1").all().map(u => u.id);
  const enLista = new Set(alumnos);
  const filas = db.prepare(`SELECT r.id, r.usuario_id AS u, r.pregunta, r.materia, r.tema, r.elegida, r.correcta, r.creada_en, i.tipo FROM academia_respuestas r
    JOIN academia_intentos i ON i.id = r.intento_id ORDER BY r.id`).all().filter(f => enLista.has(f.u) && paquete?.preguntas.has(f.pregunta));
  // ---- Aprendizaje real ----
  const porPar = new Map(); // u|pregunta → respuestas en orden
  const inicio = new Map(); // u → primera fecha
  for (const f of filas) {
    const k = `${f.u}|${f.pregunta}`;
    if (!porPar.has(k)) porPar.set(k, []);
    porPar.get(k).push(f);
    if (!inicio.has(f.u)) inicio.set(f.u, f.creada_en);
  }
  let primeraN = 0; let primeraBien = 0; let despuesN = 0; let despuesBien = 0;
  let ret2N = 0; let ret2Bien = 0; let ret7N = 0; let ret7Bien = 0;
  let falladas = 0; let dominadas = 0;
  for (const lista of porPar.values()) {
    primeraN += 1;
    primeraBien += lista[0].correcta;
    for (const f of lista.slice(1)) { despuesN += 1; despuesBien += f.correcta; }
    // Retención: después de un acierto, la siguiente respuesta 2 (o 7) días después o más.
    for (let i = 1; i < lista.length; i++) {
      if (lista[i - 1].correcta !== 1) continue;
      const d = diasEntre(lista[i - 1].creada_en, lista[i].creada_en);
      if (d >= 2) { ret2N += 1; ret2Bien += lista[i].correcta; }
      if (d >= 7) { ret7N += 1; ret7Bien += lista[i].correcta; }
    }
    if (lista.some(f => f.correcta === 0)) {
      falladas += 1;
      const ult = lista.slice(-2);
      if (ult.length === 2 && ult.every(f => f.correcta === 1)) dominadas += 1;
    }
  }
  // La curva: acierto por semana desde que empezó cada alumno.
  const semanas = new Map();
  for (const f of filas) {
    const s = Math.floor(diasEntre(inicio.get(f.u), f.creada_en) / 7);
    const x = semanas.get(s) ?? { semana: s + 1, n: 0, bien: 0 };
    x.n += 1; x.bien += f.correcta;
    semanas.set(s, x);
  }
  const curva = [...semanas.values()].sort((a, b) => a.semana - b.semana).slice(0, 26).map(x => ({ semana: x.semana, ...medida(x.bien, x.n) }));

  // ---- ¿Funcionan las clases? Primer intento de cada tema: con el video visto antes o sin verlo ----
  const vistos = new Map(alumnos.map(u => [u, new Set(videosVistos(db, u))]));
  const porTema = new Map();
  for (const lista of porPar.values()) {
    const f = lista[0];
    const k = `${f.materia}/${f.tema}`;
    const t = porTema.get(k) ?? { materia: f.materia, tema: f.tema, conN: 0, conBien: 0, sinN: 0, sinBien: 0 };
    if (vistos.get(f.u)?.has(f.materia)) { t.conN += 1; t.conBien += f.correcta; } else { t.sinN += 1; t.sinBien += f.correcta; }
    porTema.set(k, t);
  }
  const titulo = (m, t) => paquete?.materias.find(x => x.id === m)?.temas.find(x => x.id === t)?.titulo ?? t;
  const clases = [...porTema.values()].map(t => ({
    materia: t.materia, tema: t.tema, titulo: titulo(t.materia, t.tema), conVideo: medida(t.conBien, t.conN), sinVideo: medida(t.sinBien, t.sinN), total: medida(t.conBien + t.sinBien, t.conN + t.sinN),
  })).sort((a, b) => (a.total.pct ?? 101) - (b.total.pct ?? 101));
  const paraMejorar = clases.filter(c => !c.total.pocos && c.total.pct < 60);

  // ---- ¿Funciona la adaptación? ----
  const fallas = db.prepare('SELECT * FROM academia_fallas').all().filter(f => enLista.has(f.usuario_id));
  const superadas = fallas.filter(f => f.estado === 'superada');
  const diasSuperar = superadas.map(f => diasEntre(f.primera_en, f.superada_en)).sort((a, b) => a - b);
  const mediana = diasSuperar.length ? Math.round(diasSuperar[Math.floor(diasSuperar.length / 2)] * 10) / 10 : null;
  let antesN = 0; let antesBien = 0; let trasN = 0; let trasBien = 0;
  for (const f of fallas.filter(x => x.refuerzo_en && x.pregunta)) {
    for (const r of porPar.get(`${f.usuario_id}|${f.pregunta}`) ?? []) {
      if (r.creada_en < f.refuerzo_en) { antesN += 1; antesBien += r.correcta; } else { trasN += 1; trasBien += r.correcta; }
    }
  }
  // Re-explicación: ¿acertó la siguiente vez que respondió esa pregunta? Con IA y sin IA.
  const reexp = { ia: { n: 0, bien: 0 }, basica: { n: 0, bien: 0 } };
  for (const u of alumnos) {
    for (const e of explicados(db, u)) {
      const siguiente = (porPar.get(`${u}|${e.p}`) ?? []).find(r => r.creada_en > e.en);
      if (!siguiente) continue;
      const x = e.ia ? reexp.ia : reexp.basica;
      x.n += 1; x.bien += siguiente.correcta;
    }
  }

  // ---- Las preguntas más difíciles (entre todos) y la opción mala que más eligen ----
  const porPregunta = new Map();
  for (const f of filas) {
    const x = porPregunta.get(f.pregunta) ?? { n: 0, mal: 0, opciones: new Map() };
    x.n += 1;
    if (f.correcta === 0) { x.mal += 1; x.opciones.set(f.elegida, (x.opciones.get(f.elegida) ?? 0) + 1); }
    porPregunta.set(f.pregunta, x);
  }
  const dificiles = [...porPregunta.entries()].filter(([, x]) => x.n >= 3 && x.mal > 0)
    .map(([id, x]) => {
      const q = paquete.preguntas.get(id);
      const [opcion, veces] = [...x.opciones.entries()].sort((a, b) => b[1] - a[1])[0];
      return { pregunta: id, numero: q.original.numero ?? null, enunciado: q.original.enunciado, fallos: medida(x.mal, x.n), opcion, veces, idea: ideaDe(q, opcion) };
    }).sort((a, b) => b.fallos.pct - a.fallos.pct || b.fallos.n - a.fallos.n).slice(0, 15);

  // ---- Actividad: minutos de estudio por día (los ratos entre respuestas de menos de 5 minutos), rachas y plan ----
  const minutos = new Map();
  const ultimaDe = new Map();
  for (const f of filas) {
    const antes = ultimaDe.get(f.u);
    ultimaDe.set(f.u, f.creada_en);
    if (!antes) continue;
    const ms = Date.parse(f.creada_en) - Date.parse(antes);
    if (ms > 0 && ms < 5 * 60_000) { const dia = f.creada_en.slice(0, 10); minutos.set(dia, (minutos.get(dia) ?? 0) + ms / 60_000); }
  }
  const porDia = [...minutos.entries()].sort().slice(-30).map(([dia, m]) => ({ dia, minutos: Math.round(m) }));
  const ritmos = { adelantado: 0, a_tiempo: 0, atrasado: 0, terminado: 0, sin_plan: 0 };
  let rachas = 0;
  for (const u of alumnos) {
    const p = planDe(db, u, paquete, ahoraMs);
    ritmos[p.elegido ? p.ritmo : 'sin_plan'] += 1;
    rachas += puntosYRacha(db, u, ahoraMs).racha;
  }
  return {
    alumnos: alumnos.length, respuestas: filas.length, minimo: MINIMO,
    aprendizaje: { primera: medida(primeraBien, primeraN), despues: medida(despuesBien, despuesN), retencion2: medida(ret2Bien, ret2N), retencion7: medida(ret7Bien, ret7N), dominadas: medida(dominadas, falladas), curva },
    clases: { temas: clases, paraMejorar },
    adaptacion: {
      fallas: fallas.length, superadas: medida(superadas.length, fallas.length), medianaDias: mediana,
      antes: medida(antesBien, antesN), despues: medida(trasBien, trasN),
      reexplicacionIa: medida(reexp.ia.bien, reexp.ia.n), reexplicacionBasica: medida(reexp.basica.bien, reexp.basica.n),
    },
    dificiles,
    actividad: { porDia, rachaPromedio: alumnos.length ? Math.round((rachas / alumnos.length) * 10) / 10 : 0, plan: ritmos },
  };
}
