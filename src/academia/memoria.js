// Academia (0.8.0): la «memoria de errores» de cada alumno. Cada respuesta queda para siempre en academia_respuestas (la
// pregunta, la opción que eligió, si acertó, cuándo) y su intento dice en qué modo fue (Original o Modo reto). Nada se
// borra nunca: de ahí se calcula, cada vez, lo que más le cuesta:
//  - por pregunta: cuántas veces la respondió y cuántas la falló; «superada» si sus 2 últimas respuestas fueron buenas;
//  - por idea equivocada: la opción mala que eligió (la idea del paquete para esa opción, o la trampa del Modo reto);
//  - por tema: cuántas respuestas y cuántos fallos.
// Siempre con el id del alumno de la sesión (o, para el administrador, el del alumno que mira).
import { ErrorHttp } from '../nucleo/http.js';
import { ideaDe, MODO_RETO, MODO_ORIGINAL } from './reto.js';

const PRACTICA_MAXIMA = 10;

export function puntosDebiles(db, usuarioId, paquete) {
  const vacio = { respuestas: 0, fallos: 0, preguntas: [], ideas: [], temas: [] };
  if (!paquete) return vacio;
  const filas = db.prepare(`SELECT r.pregunta, r.elegida, r.correcta, r.creada_en, i.tipo, i.modo FROM academia_respuestas r
    JOIN academia_intentos i ON i.id = r.intento_id WHERE r.usuario_id = ? ORDER BY r.id`).all(usuarioId);
  const porPregunta = new Map();
  const ideas = new Map();
  const temas = new Map();
  let respuestas = 0;
  let fallos = 0;
  for (const f of filas) {
    const q = paquete.preguntas.get(f.pregunta);
    if (!q) continue;
    respuestas += 1;
    const lugar = paquete.deTema.get(f.pregunta);
    const p = porPregunta.get(f.pregunta) ?? { pregunta: f.pregunta, materia: lugar?.materia ?? null, tema: lugar?.tema ?? null, veces: 0, fallos: 0, ultima: null, ultimas: [] };
    p.veces += 1;
    p.ultimas = [...p.ultimas.slice(-1), f.correcta === 1];
    const kt = `${lugar?.materia}/${lugar?.tema}`;
    const t = temas.get(kt) ?? { materia: lugar?.materia ?? null, tema: lugar?.tema ?? null, respuestas: 0, fallos: 0 };
    t.respuestas += 1;
    if (f.correcta !== 1) {
      fallos += 1;
      p.fallos += 1;
      p.ultima = f.creada_en;
      t.fallos += 1;
      const idea = ideaDe(q, f.elegida);
      if (idea) {
        const ki = `${f.pregunta}\u0000${f.elegida}`;
        const x = ideas.get(ki) ?? { pregunta: f.pregunta, opcion: f.elegida, modo: f.tipo === 'reto' || f.modo === MODO_RETO ? MODO_RETO : MODO_ORIGINAL, idea, materia: lugar?.materia ?? null, tema: lugar?.tema ?? null, numero: q.original.numero ?? null, fallos: 0, ultima: null };
        x.fallos += 1;
        x.ultima = f.creada_en;
        ideas.set(ki, x);
      }
    }
    porPregunta.set(f.pregunta, p);
    temas.set(kt, t);
  }
  const lista = [...porPregunta.values()].filter(p => p.fallos > 0).map(p => {
    const superada = p.ultimas.length === 2 && p.ultimas.every(Boolean);
    const resto = { ...p };
    delete resto.ultimas;
    return { ...resto, superada };
  });
  const orden = (a, b) => Number(a.superada) - Number(b.superada) || b.fallos - a.fallos || String(b.ultima).localeCompare(String(a.ultima)) || a.pregunta.localeCompare(b.pregunta);
  lista.sort(orden);
  const superadas = new Set(lista.filter(p => p.superada).map(p => p.pregunta));
  const listaIdeas = [...ideas.values()].map(x => ({ ...x, superada: superadas.has(x.pregunta) })).sort(orden);
  const titulos = new Map(paquete.materias.flatMap(m => m.temas.map(t => [`${m.id}/${t.id}`, t.titulo])));
  const listaTemas = [...temas.entries()].filter(([, t]) => t.fallos > 0)
    .map(([k, t]) => ({ ...t, titulo: titulos.get(k) ?? t.tema, pct: Math.floor((t.fallos * 100) / t.respuestas) }))
    .sort((a, b) => b.fallos - a.fallos || b.pct - a.pct || String(a.tema).localeCompare(String(b.tema)));
  return { respuestas, fallos, preguntas: lista, ideas: listaIdeas, temas: listaTemas };
}

// El punto débil de una materia o de un tema («Tu punto débil: …»): la pregunta que más falla (sin superar) y, si la hay,
// la idea equivocada que más eligió en ella. null si no hay nada que mejorar ahí.
export function debilDe(memoria, paquete, { materia, tema = null }) {
  const enLugar = x => x.materia === materia && (tema == null || x.tema === tema);
  const p = memoria.preguntas.find(x => enLugar(x) && !x.superada);
  if (!p) return null;
  const idea = memoria.ideas.find(x => x.pregunta === p.pregunta);
  const q = paquete.preguntas.get(p.pregunta);
  const pendientes = memoria.preguntas.filter(x => enLugar(x) && !x.superada).length;
  return { pregunta: p.pregunta, numero: q?.original.numero ?? null, enunciado: q?.original.enunciado ?? '', idea: idea?.idea ?? null, fallos: p.fallos, tema: p.tema, pendientes };
}

// Las preguntas para «Practicar mis errores»: las falladas de un intento suyo (en su orden), o las que más falla de un
// tema, de una materia o de todo (primero las no superadas), hasta 10.
export function preguntasParaPracticar(db, usuarioId, paquete, { intento = null, materia = null, tema = null } = {}) {
  if (intento != null) {
    const id = Number(intento);
    const f = Number.isSafeInteger(id) ? db.prepare('SELECT id FROM academia_intentos WHERE id = ? AND usuario_id = ?').get(id, usuarioId) : null;
    if (!f) throw new ErrorHttp(404, 'no_existe');
    const malas = db.prepare('SELECT pregunta FROM academia_respuestas WHERE intento_id = ? AND usuario_id = ? AND correcta = 0 ORDER BY id').all(f.id, usuarioId).map(r => r.pregunta);
    return [...new Set(malas)].filter(q => paquete.preguntas.has(q));
  }
  const memoria = puntosDebiles(db, usuarioId, paquete);
  return memoria.preguntas.filter(x => (materia == null || x.materia === materia) && (tema == null || x.tema === tema)).slice(0, PRACTICA_MAXIMA).map(x => x.pregunta);
}
