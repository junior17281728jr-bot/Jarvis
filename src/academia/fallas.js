// Academia 0.10.0: las «fallas registradas» de cada alumno. SIN IA: todo sale de sus respuestas.
//  - Una pregunta que falla N veces (Contenido → Pagos e instructor; 3 por defecto) queda como una FALLA que tiene que
//    estudiar; en un examen, fallar 2 (por defecto) del mismo tema también. Cada falla dice dónde (materia, tema, la
//    pregunta) y la idea equivocada que la explica (la del paquete para esa opción).
//  - estado: 'activa' → 'refuerzo' (ya se le reforzó: la tarjeta que lo explica salió primero en su clase) → 'superada'
//    (3 aciertos seguidos en 2 días distintos o más). Fallar otra vez antes de superarla vuelve a contar desde 0.
//    Nada se borra: una superada queda en el historial; si después vuelve a fallar esa pregunta, es una falla nueva.
//  - El refuerzo de verdad: al crearse, sus preguntas (la fallada y las que más se le parecen del mismo tema, TAL CUAL del
//    Test Guide) entran al repaso de hoy y la Práctica del instructor empieza por ellas; al abrir el tema, la tarjeta que
//    la explica sale primero, marcada «Refuerzo para ti».
//  - «Lo que hicimos por ti»: cada falla con lo que se hizo, en frases (la pantalla las arma con i18n).
// Todo se calcula con el id del alumno de la sesión; las respuestas se leen una sola vez (una marca en «ajustes»).
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { ideaDe } from './reto.js';
import { tarjetaPara } from './instructor.js';

export const CONFIG_FALLAS = Object.freeze({ umbral: 3, examen: 2, aciertos: 3, dias: 2, extras: 5 });
export const ESTADOS_FALLA = Object.freeze(['activa', 'refuerzo', 'superada']);
const CLAVE_CONFIG = 'academia.fallas.config';
const marcaDe = id => `academia.fallas.marca.${Number(id)}`;
const LOTE = 5000;

export function leerConfigFallas(db) {
  let v = null;
  try { v = JSON.parse(leerAjuste(db, CLAVE_CONFIG) ?? 'null'); } catch { v = null; }
  const entre = (n, min, max, d) => (Number.isSafeInteger(n) && n >= min && n <= max ? n : d);
  return { ...CONFIG_FALLAS, umbral: entre(v?.umbral, 2, 10, CONFIG_FALLAS.umbral), examen: entre(v?.examen, 1, 10, CONFIG_FALLAS.examen) };
}
export function guardarConfigFallas(db, { umbral, examen }) {
  const actual = leerConfigFallas(db);
  const nueva = { umbral: umbral ?? actual.umbral, examen: examen ?? actual.examen };
  if (!Number.isSafeInteger(nueva.umbral) || nueva.umbral < 2 || nueva.umbral > 10) throw new ErrorHttp(400, 'datos_no_validos');
  if (!Number.isSafeInteger(nueva.examen) || nueva.examen < 1 || nueva.examen > 10) throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, CLAVE_CONFIG, JSON.stringify(nueva));
  return leerConfigFallas(db);
}

const temaDe = (paquete, materia, tema) => paquete?.materias.find(m => m.id === materia)?.temas.find(t => t.id === tema) ?? null;
const sumarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const leerDias = f => { try { const l = JSON.parse(f.dias); return Array.isArray(l) ? l : []; } catch { return []; } };
const leerRefuerzo = f => { try { return f.refuerzo ? JSON.parse(f.refuerzo) : null; } catch { return null; } };

// Las preguntas del mismo tema que más se parecen a una (las palabras de su enunciado, opciones y explicación).
function parecidas(paquete, materia, tema, preguntaId, cuantas) {
  const t = temaDe(paquete, materia, tema);
  if (!t) return [];
  const palabras = q => new Set([q?.original?.enunciado, ...(q?.original?.opciones ?? []).map(o => o.texto), q?.original?.explicacion].join(' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter(p => p.length >= 5).map(p => p.slice(0, 5)));
  const base = preguntaId ? palabras(paquete.preguntas.get(preguntaId)) : new Set();
  return t.preguntas.filter(id => id !== preguntaId && paquete.preguntas.has(id))
    .map((id, i) => { const p = palabras(paquete.preguntas.get(id)); let n = 0; for (const x of base) if (p.has(x)) n += 1; return { id, n, i }; })
    .sort((a, b) => b.n - a.n || a.i - b.i).slice(0, cuantas).map(x => x.id);
}

// Pone preguntas en el repaso de HOY (sin bajar las que ya están dominadas más lejos: solo adelanta su fecha).
function alRepasoDeHoy(db, usuarioId, paquete, ids, ahoraMs) {
  const momento = new Date(ahoraMs).toISOString();
  for (const id of ids) {
    const lugar = paquete.deTema.get(id);
    const ya = db.prepare('SELECT caja FROM academia_repaso WHERE usuario_id = ? AND pregunta = ?').get(usuarioId, id);
    if (ya) db.prepare('UPDATE academia_repaso SET vence_en = MIN(vence_en, ?), caja = MIN(caja, 5), actualizado_en = ? WHERE usuario_id = ? AND pregunta = ?').run(momento, momento, usuarioId, id);
    else db.prepare('INSERT INTO academia_repaso (usuario_id, pregunta, materia, tema, caja, vence_en, fallos, actualizado_en) VALUES (?, ?, ?, ?, 1, ?, 0, ?)').run(usuarioId, id, lugar?.materia ?? null, lugar?.tema ?? null, momento, momento);
  }
}

function crearFalla(db, usuarioId, paquete, datos, ahoraMs) {
  const momento = new Date(ahoraMs).toISOString();
  const cfg = CONFIG_FALLAS;
  // En un examen: primero las otras que falló de ese tema; después las que más se parecen.
  const otras = (datos.otras ?? []).filter(id => id !== datos.pregunta);
  const extras = [...new Set([...otras, ...parecidas(paquete, datos.materia, datos.tema, datos.pregunta, cfg.extras)])].filter(id => id !== datos.pregunta).slice(0, Math.max(cfg.extras, otras.length));
  const deRepaso = [...(datos.pregunta ? [datos.pregunta] : []), ...extras];
  alRepasoDeHoy(db, usuarioId, paquete, deRepaso, ahoraMs);
  db.prepare(`INSERT INTO academia_fallas (usuario_id, clave, materia, tema, pregunta, opcion, idea, origen, fallos, aciertos, dias, estado, refuerzo, primera_en, ultima_en, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', 'activa', ?, ?, ?, ?)`)
    .run(usuarioId, datos.clave, datos.materia, datos.tema, datos.pregunta ?? null, datos.opcion ?? null, datos.idea ?? null, datos.origen, datos.fallos,
      JSON.stringify({ extras, tarjeta: null }), datos.primera ?? momento, momento, momento);
}

// Lee las respuestas nuevas del alumno (desde la última vez) y crea o actualiza sus fallas. Devuelve cuántas leyó.
export function sincronizarFallas(db, usuarioId, paquete, ahoraMs = Date.now()) {
  if (!paquete) return 0;
  const cfg = leerConfigFallas(db);
  return enTransaccion(db, () => {
    const marca = Number(leerAjuste(db, marcaDe(usuarioId))) || 0;
    const filas = db.prepare(`SELECT r.id, r.intento_id, r.pregunta, r.materia, r.tema, r.elegida, r.correcta, r.dia, r.creada_en, i.tipo FROM academia_respuestas r
      JOIN academia_intentos i ON i.id = r.intento_id WHERE r.usuario_id = ? AND r.id > ? ORDER BY r.id LIMIT ?`).all(usuarioId, marca, LOTE);
    if (!filas.length) return 0;
    const vivas = () => db.prepare("SELECT * FROM academia_fallas WHERE usuario_id = ? AND estado <> 'superada'").all(usuarioId);
    for (const f of filas) {
      const q = paquete.preguntas.get(f.pregunta);
      if (!q) continue;
      const lugar = paquete.deTema.get(f.pregunta) ?? { materia: f.materia, tema: f.tema };
      // Las fallas vivas que toca esta respuesta: la de esa pregunta, y la de su tema (de un examen).
      const tocadas = vivas().filter(x => x.clave === `q:${f.pregunta}` || (x.origen === 'examen' && x.materia === lugar.materia && x.tema === lugar.tema));
      if (f.correcta === 1) {
        for (const x of tocadas) {
          const dias = [...new Set([...leerDias(x), f.dia])];
          const aciertos = x.aciertos + 1;
          const superada = aciertos >= cfg.aciertos && dias.length >= cfg.dias;
          db.prepare('UPDATE academia_fallas SET aciertos = ?, dias = ?, estado = ?, superada_en = ?, actualizado_en = ? WHERE id = ?')
            .run(aciertos, JSON.stringify(dias), superada ? 'superada' : x.estado, superada ? f.creada_en : null, f.creada_en, x.id);
        }
        continue;
      }
      const idea = ideaDe(q, f.elegida);
      for (const x of tocadas) {
        db.prepare("UPDATE academia_fallas SET fallos = fallos + 1, aciertos = 0, dias = '[]', ultima_en = ?, opcion = COALESCE(?, opcion), idea = COALESCE(?, idea), actualizado_en = ? WHERE id = ?")
          .run(f.creada_en, x.origen === 'pregunta' ? f.elegida : null, x.origen === 'pregunta' ? idea : null, f.creada_en, x.id);
      }
      // ¿Una falla nueva de esa pregunta? Las veces que la falló desde la última superada (o desde siempre).
      if (!tocadas.some(x => x.clave === `q:${f.pregunta}`)) {
        const desde = db.prepare("SELECT MAX(superada_en) AS s FROM academia_fallas WHERE usuario_id = ? AND clave = ?").get(usuarioId, `q:${f.pregunta}`).s ?? '';
        const malas = db.prepare('SELECT COUNT(*) AS n, MIN(creada_en) AS primera FROM academia_respuestas WHERE usuario_id = ? AND pregunta = ? AND correcta = 0 AND id <= ? AND creada_en > ?')
          .get(usuarioId, f.pregunta, f.id, desde);
        if (malas.n >= cfg.umbral) {
          crearFalla(db, usuarioId, paquete, { clave: `q:${f.pregunta}`, materia: lugar.materia, tema: lugar.tema, pregunta: f.pregunta, opcion: f.elegida, idea, origen: 'pregunta', fallos: malas.n, primera: malas.primera }, Date.parse(f.creada_en));
        }
      }
      // En un examen (o el examen de un tema): varias falladas del mismo tema.
      if ((f.tipo === 'examen' || f.tipo === 'tema') && !tocadas.some(x => x.origen === 'examen')) {
        const delTema = db.prepare('SELECT pregunta, elegida, creada_en FROM academia_respuestas WHERE intento_id = ? AND usuario_id = ? AND materia IS ? AND tema IS ? AND correcta = 0 AND id <= ? ORDER BY id')
          .all(f.intento_id, usuarioId, lugar.materia, lugar.tema, f.id);
        if (delTema.length >= cfg.examen) {
          const ideas = delTema.map(x => ideaDe(paquete.preguntas.get(x.pregunta), x.elegida)).filter(Boolean);
          crearFalla(db, usuarioId, paquete, { clave: `t:${lugar.materia}/${lugar.tema}`, materia: lugar.materia, tema: lugar.tema, pregunta: delTema[0].pregunta, otras: delTema.map(x => x.pregunta), opcion: null, idea: ideas[0] ?? null, origen: 'examen', fallos: delTema.length, primera: delTema[0].creada_en }, Date.parse(f.creada_en));
        }
      }
    }
    guardarAjuste(db, marcaDe(usuarioId), String(filas[filas.length - 1].id));
    return filas.length;
  });
}

// El refuerzo de un tema que el alumno abre: la falla viva de ese tema con más fallos, la tarjeta que la explica (sale
// primero en la clase) y sus preguntas extra. Anota que se reforzó ('refuerzo'). null si no tiene fallas ahí.
export function refuerzoDeTema(db, usuarioId, paquete, materia, tema, ahoraMs = Date.now()) {
  sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const f = db.prepare("SELECT * FROM academia_fallas WHERE usuario_id = ? AND materia = ? AND tema = ? AND estado <> 'superada' ORDER BY fallos DESC, id LIMIT 1").get(usuarioId, materia, tema);
  if (!f) return null;
  const t = temaDe(paquete, materia, tema);
  const q = f.pregunta ? paquete.preguntas.get(f.pregunta) : null;
  const tarjeta = tarjetaPara(t, [f.idea, q?.original.enunciado, q?.original.explicacion].filter(Boolean).join(' '));
  const antes = leerRefuerzo(f) ?? {};
  const refuerzo = { ...antes, tarjeta: tarjeta ? { indice: tarjeta.indice, titulo: tarjeta.titulo } : null };
  const momento = new Date(ahoraMs).toISOString();
  db.prepare("UPDATE academia_fallas SET estado = CASE WHEN estado = 'activa' THEN 'refuerzo' ELSE estado END, refuerzo = ?, refuerzo_en = COALESCE(refuerzo_en, ?), actualizado_en = ? WHERE id = ?")
    .run(JSON.stringify(refuerzo), momento, momento, f.id);
  return { falla: f.id, idea: f.idea, fallos: f.fallos, tarjeta: refuerzo.tarjeta, extras: (antes.extras ?? []).length };
}

// Las preguntas de sus fallas vivas (la fallada y sus extras), para la Práctica del instructor: primero estas.
export function preguntasDeFallas(db, usuarioId, paquete, ahoraMs = Date.now()) {
  sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const ids = [];
  for (const f of db.prepare("SELECT pregunta, refuerzo FROM academia_fallas WHERE usuario_id = ? AND estado <> 'superada' ORDER BY fallos DESC, id").all(usuarioId)) {
    for (const id of [f.pregunta, ...(leerRefuerzo(f)?.extras ?? [])]) if (id && paquete.preguntas.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// «Lo que hicimos por ti»: cada falla, la más reciente primero (las superadas también: es su historial).
export function fallasDe(db, usuarioId, paquete, ahoraMs = Date.now()) {
  if (paquete) sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const cfg = leerConfigFallas(db);
  return db.prepare('SELECT * FROM academia_fallas WHERE usuario_id = ? ORDER BY actualizado_en DESC, id DESC LIMIT 200').all(usuarioId).map(f => {
    const r = leerRefuerzo(f) ?? {};
    const t = temaDe(paquete, f.materia, f.tema);
    return {
      id: f.id, estado: f.estado, origen: f.origen, materia: f.materia, tema: f.tema, temaTitulo: t?.titulo ?? f.tema,
      numero: f.pregunta ? paquete?.preguntas.get(f.pregunta)?.original.numero ?? null : null, idea: f.idea, fallos: f.fallos, aciertos: f.aciertos,
      dias: leerDias(f).length, meta: { aciertos: cfg.aciertos, dias: cfg.dias }, tarjeta: r.tarjeta?.titulo ?? null, extras: (r.extras ?? []).length,
      primera: f.primera_en, ultima: f.ultima_en, refuerzoEn: f.refuerzo_en, superadaEn: f.superada_en, repasoEl: f.superada_en ? null : sumarDias(f.ultima_en.slice(0, 10), cfg.dias),
    };
  });
}

// ---------- «Plan para pasar la próxima vez» (al no aprobar un tema o un examen) ----------
// Todo orientado a las preguntas del Test Guide: en qué falló (por tema, con la idea equivocada de lo que eligió), qué
// releer (la tarjeta que mejor lo explica), qué practicar (sus falladas y las parecidas del mismo tema, tal cual) y
// cuándo volver a tomarlo (después de hacer el refuerzo de esos temas; si ya lo hizo, ya).
export function planParaPasar(db, usuarioId, paquete, intentoId, ahoraMs = Date.now()) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const n = Number(intentoId);
  const i = Number.isSafeInteger(n) ? db.prepare('SELECT * FROM academia_intentos WHERE id = ? AND usuario_id = ?').get(n, usuarioId) : null;
  if (!i || !i.terminado_en) throw new ErrorHttp(404, 'no_existe');
  sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const malas = db.prepare('SELECT pregunta, elegida, materia, tema FROM academia_respuestas WHERE intento_id = ? AND usuario_id = ? AND correcta = 0 ORDER BY id').all(i.id, usuarioId)
    .filter(r => paquete.preguntas.has(r.pregunta));
  const porTema = new Map();
  for (const r of malas) {
    const lugar = paquete.deTema.get(r.pregunta) ?? { materia: r.materia, tema: r.tema };
    const k = `${lugar.materia}/${lugar.tema}`;
    const x = porTema.get(k) ?? { materia: lugar.materia, tema: lugar.tema, preguntas: [], ideas: [] };
    x.preguntas.push(r.pregunta);
    const idea = ideaDe(paquete.preguntas.get(r.pregunta), r.elegida);
    if (idea && !x.ideas.includes(idea)) x.ideas.push(idea);
    porTema.set(k, x);
  }
  const temas = [...porTema.values()].sort((a, b) => b.preguntas.length - a.preguntas.length).map(x => {
    const t = temaDe(paquete, x.materia, x.tema);
    const tarjeta = tarjetaPara(t, [...x.ideas, ...x.preguntas.map(id => paquete.preguntas.get(id)?.original.explicacion)].filter(Boolean).join(' '));
    const extras = parecidas(paquete, x.materia, x.tema, x.preguntas[0], 3).filter(id => !x.preguntas.includes(id));
    // ¿Ya hizo el refuerzo de ese tema después de este intento? (una práctica del instructor o de errores, terminada)
    const hecho = db.prepare(`SELECT 1 FROM academia_intentos WHERE usuario_id = ? AND id > ? AND terminado_en IS NOT NULL AND tipo IN ('instructor', 'errores')
      AND (materia IS NULL OR (materia = ? AND (tema IS NULL OR tema = ?))) LIMIT 1`).get(usuarioId, i.id, x.materia, x.tema);
    return {
      materia: x.materia, tema: x.tema, titulo: t?.titulo ?? x.tema, fallos: x.preguntas.length, ideas: x.ideas.slice(0, 3),
      tarjeta: tarjeta ? { indice: tarjeta.indice, titulo: tarjeta.titulo } : null,
      preguntas: [...x.preguntas, ...extras].map(id => ({ id, numero: paquete.preguntas.get(id)?.original.numero ?? null, enunciado: paquete.preguntas.get(id)?.original.enunciado ?? '' })),
      refuerzoHecho: Boolean(hecho),
    };
  });
  const listo = temas.every(x => x.refuerzoHecho);
  return {
    intento: { id: i.id, tipo: i.tipo, materia: i.materia, tema: i.tema, aciertos: i.aciertos, total: i.total, aprobado: i.aprobado == null ? null : i.aprobado === 1 },
    temas, otraVez: { listo, cuando: listo ? 'ya' : 'tras_refuerzo', dia: sumarDias(new Date(ahoraMs - 4 * 3600 * 1000).toISOString().slice(0, 10), 1) },
  };
}
