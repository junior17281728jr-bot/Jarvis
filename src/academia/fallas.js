// Academia 0.10.0: las «fallas registradas» de cada alumno. SIN IA: todo sale de sus respuestas.
// 0.12.2 («Mi repaso»): la unidad es el CONCEPTO (sub-tema) de un tema: la tarjeta de la lección que explica la pregunta
//  (src/academia/conceptos.js). Las preguntas del mismo concepto son «relacionadas».
//  - Cuando el alumno falla MÁS DE 2 veces (umbral, 3 por defecto; Contenido → Pagos e instructor) preguntas de un mismo
//    concepto (sumando todos sus intentos desde la última vez que lo superó; no tiene que ser la misma pregunta), ese
//    concepto entra a «Mi repaso» (clave c:<materia>/<tema>/<tarjeta>, origen 'concepto'). Una o dos equivocaciones nunca.
//  - En «Mi repaso» se repasa con las preguntas de ese concepto (tal cual del Test Guide). Si vuelve a fallar una, antes
//    de intentarlo otra vez sale una MINI-CLASE del concepto (la tarjeta y la explicación de la que falló), siempre en
//    «Mi repaso», nunca dentro de la clase normal. Se supera con 3 aciertos seguidos de ese concepto (diasConcepto: 1 día
//    basta, para que sea claro; fallar vuelve a contar desde 0).
//  - Las fallas de antes (0.10.0–0.12.1: 'pregunta' = la misma pregunta 3 veces; 'examen' = 2 de un tema en un intento)
//    NUNCA se borran ni se reescriben: siguen contando y se superan como siempre (3 aciertos en 2 días). Ya no se crean.
//  - estado: 'activa' → 'refuerzo' (empezó a repasarla) → 'superada'. Nada se borra: una superada queda en el historial.
//  - «Lo que hicimos por ti»: cada falla con lo que se hizo, en frases (la pantalla las arma con i18n).
// Todo se calcula con el id del alumno de la sesión; las respuestas se leen una sola vez (una marca en «ajustes»).
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { ideaDe } from './reto.js';
import { tarjetaPara } from './instructor.js';
import { conceptosDe, conceptoDePregunta, concepto as conceptoPorClave, nombreConcepto, esClaveConcepto } from './conceptos.js';
import { puntosDebiles } from './memoria.js';
import { vistaSecciones, camino } from './progreso.js';

// examen: la regla vieja (2 de un tema en un intento): se sigue leyendo y guardando (una 0.12.1 que vuelva atrás la usa), pero
// la 0.12.2 ya no crea fallas con ella. umbral: cuántos errores de un mismo concepto lo ponen en «Mi repaso».
export const CONFIG_FALLAS = Object.freeze({ umbral: 3, examen: 2, aciertos: 3, dias: 2, diasConcepto: 1, extras: 5, repaso: 10 });
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

const temaNumeroDe = (paquete, materia, tema) => { const i = paquete?.materias.find(m => m.id === materia)?.temas.findIndex(t => t.id === tema) ?? -1; return i >= 0 ? i + 1 : null; };
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

// 0.12.2: un concepto entra a «Mi repaso». Sus preguntas (la que falló primero y las demás del concepto) quedan como
// «extras» del refuerzo (la Práctica del instructor también empieza por ellas). No se tocan el repaso espaciado ni la clase.
function crearConcepto(db, usuarioId, c, datos) {
  const extras = c.preguntas.filter(id => id !== datos.pregunta).slice(0, CONFIG_FALLAS.repaso);
  const refuerzo = { extras, tarjeta: c.indice >= 0 ? { indice: c.indice, titulo: c.titulo } : null, concepto: { titulo: c.titulo, indice: c.indice }, dias: datos.dias, intento: datos.intento, ronda: 0, miniclase: null };
  db.prepare(`INSERT INTO academia_fallas (usuario_id, clave, materia, tema, pregunta, opcion, idea, origen, fallos, aciertos, dias, estado, refuerzo, primera_en, ultima_en, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'concepto', ?, 0, '[]', 'activa', ?, ?, ?, ?)`)
    .run(usuarioId, c.clave, c.materia, c.tema, datos.pregunta, datos.opcion ?? null, datos.idea ?? null, datos.fallos, JSON.stringify(refuerzo), datos.primera, datos.momento, datos.momento);
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
      const c = conceptoDePregunta(paquete, f.pregunta);
      // Las fallas vivas que toca esta respuesta: la de su concepto (0.12.2) y, de antes, la de esa pregunta y la de su tema.
      const tocadas = vivas().filter(x => (c && x.clave === c.clave) || x.clave === `q:${f.pregunta}` || (x.origen === 'examen' && x.materia === lugar.materia && x.tema === lugar.tema));
      if (f.correcta === 1) {
        for (const x of tocadas) {
          const dias = [...new Set([...leerDias(x), f.dia])];
          const aciertos = x.aciertos + 1;
          const superada = aciertos >= cfg.aciertos && dias.length >= (x.origen === 'concepto' ? cfg.diasConcepto : cfg.dias);
          db.prepare('UPDATE academia_fallas SET aciertos = ?, dias = ?, estado = ?, superada_en = ?, actualizado_en = ? WHERE id = ?')
            .run(aciertos, JSON.stringify(dias), superada ? 'superada' : x.estado, superada ? f.creada_en : null, f.creada_en, x.id);
        }
        continue;
      }
      const idea = ideaDe(q, f.elegida);
      for (const x of tocadas) {
        if (x.origen === 'concepto') {
          // Falló otra vez algo de un concepto que está en «Mi repaso». Si fue EN su repaso: antes de intentarlo otra
          // vez, la mini-clase (una ronda más). Fuera del repaso solo cuenta el error.
          const r = leerRefuerzo(x) ?? {};
          const enSuRepaso = leerAjuste(db, claveIntento(f.intento_id)) === x.clave;
          // (una ronda por repaso fallado, aunque falle varias en el mismo)
          const ronda = (Number(r.ronda) || 0) + (enSuRepaso && r.miniclase?.intento !== f.intento_id ? 1 : 0);
          const refuerzo = enSuRepaso ? { ...r, ronda, miniclase: { pregunta: f.pregunta, opcion: f.elegida, intento: f.intento_id, ronda, pendiente: true } } : r;
          db.prepare("UPDATE academia_fallas SET fallos = fallos + 1, aciertos = 0, dias = '[]', ultima_en = ?, pregunta = ?, opcion = ?, idea = COALESCE(?, idea), refuerzo = ?, actualizado_en = ? WHERE id = ?")
            .run(f.creada_en, f.pregunta, f.elegida, idea, JSON.stringify(refuerzo), f.creada_en, x.id);
          continue;
        }
        db.prepare("UPDATE academia_fallas SET fallos = fallos + 1, aciertos = 0, dias = '[]', ultima_en = ?, opcion = COALESCE(?, opcion), idea = COALESCE(?, idea), actualizado_en = ? WHERE id = ?")
          .run(f.creada_en, x.origen === 'pregunta' ? f.elegida : null, x.origen === 'pregunta' ? idea : null, f.creada_en, x.id);
      }
      // ¿El concepto entra a «Mi repaso»? Los errores en sus preguntas desde la última vez que lo superó (o desde siempre).
      if (c && !tocadas.some(x => x.clave === c.clave)) {
        const desde = db.prepare('SELECT MAX(superada_en) AS s FROM academia_fallas WHERE usuario_id = ? AND clave = ?').get(usuarioId, c.clave).s ?? '';
        const marcas = c.preguntas.map(() => '?').join(', ');
        const malas = db.prepare(`SELECT COUNT(*) AS n, MIN(creada_en) AS primera, COUNT(DISTINCT dia) AS dias FROM academia_respuestas
          WHERE usuario_id = ? AND pregunta IN (${marcas}) AND correcta = 0 AND id <= ? AND creada_en > ?`).get(usuarioId, ...c.preguntas, f.id, desde);
        if (malas.n >= cfg.umbral) {
          crearConcepto(db, usuarioId, c, { pregunta: f.pregunta, opcion: f.elegida, idea, fallos: malas.n, dias: malas.dias, primera: malas.primera, momento: f.creada_en, intento: f.intento_id });
        }
      }
    }
    guardarAjuste(db, marcaDe(usuarioId), String(filas[filas.length - 1].id));
    return filas.length;
  });
}

// Las preguntas de sus fallas vivas (la fallada y sus extras), para la Práctica del instructor: primero estas.
export function preguntasDeFallas(db, usuarioId, paquete, ahoraMs = Date.now()) {
  sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const ids = [];
  for (const f of db.prepare(`SELECT pregunta, refuerzo FROM academia_fallas WHERE usuario_id = ? AND estado <> 'superada' AND ${SQL_CUENTA} ORDER BY fallos DESC, id`).all(usuarioId, leerConfigFallas(db).umbral)) {
    for (const id of [f.pregunta, ...(leerRefuerzo(f)?.extras ?? [])]) if (id && paquete.preguntas.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// 0.12.2: ¿esta falla cuenta para «Mi repaso» (su número, «¿Estás listo?», la Práctica del instructor)? Las de concepto,
// sí; las de antes, solo si llegan al umbral de ahora (una de «2 de un tema en un intento» queda en el historial: se
// sigue viendo en «Lo que hicimos por ti» y se puede superar, pero ya no se le trata como algo para repasar).
export const cuentaParaRepaso = (f, cfg = CONFIG_FALLAS) => f.origen === 'concepto' || f.fallos >= cfg.umbral;
export const SQL_CUENTA = "(origen = 'concepto' OR fallos >= ?)";

// La meta para superar una falla: los conceptos (0.12.2) piden 3 aciertos seguidos (en 1 día basta); las de antes, en 2 días.
const metaDe = (cfg, f) => ({ aciertos: cfg.aciertos, dias: f.origen === 'concepto' ? cfg.diasConcepto : cfg.dias });

// «Lo que hicimos por ti»: cada falla, la más reciente primero (las superadas también: es su historial).
export function fallasDe(db, usuarioId, paquete, ahoraMs = Date.now()) {
  if (paquete) sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const cfg = leerConfigFallas(db);
  return db.prepare('SELECT * FROM academia_fallas WHERE usuario_id = ? ORDER BY actualizado_en DESC, id DESC LIMIT 200').all(usuarioId).map(f => {
    const r = leerRefuerzo(f) ?? {};
    const t = temaDe(paquete, f.materia, f.tema);
    const meta = metaDe(cfg, f);
    const c = paquete ? conceptoDeFalla(paquete, f) : null;
    return {
      id: f.id, clave: f.clave, conceptoClave: c?.clave ?? null, cuenta: cuentaParaRepaso(f, cfg), temaNumero: temaNumeroDe(paquete, f.materia, f.tema), estado: f.estado, origen: f.origen, materia: f.materia, tema: f.tema, temaTitulo: t?.titulo ?? f.tema,
      // 0.12.2: el concepto (la tarjeta que lo explica, o el tema entero) y en cuántos días distintos lo falló.
      concepto: c ? nombreConcepto(c) : r.concepto?.titulo || r.tarjeta?.titulo || t?.titulo || f.tema, diasFallos: r.dias ?? null,
      numero: f.pregunta ? paquete?.preguntas.get(f.pregunta)?.original.numero ?? null : null, idea: f.idea, fallos: f.fallos, aciertos: f.aciertos,
      dias: leerDias(f).length, meta, tarjeta: r.tarjeta?.titulo ?? null, extras: (r.extras ?? []).length,
      primera: f.primera_en, ultima: f.ultima_en, refuerzoEn: f.refuerzo_en, superadaEn: f.superada_en, repasoEl: f.superada_en ? null : sumarDias(f.ultima_en.slice(0, 10), meta.dias),
    };
  });
}

// ---------- 0.12.2: «Mi repaso» ----------
const claveIntento = id => `academia.mirepaso.intento.${Number(id)}`;
const vivaDe = (db, usuarioId, clave) => db.prepare("SELECT * FROM academia_fallas WHERE usuario_id = ? AND clave = ? AND estado <> 'superada' ORDER BY id DESC LIMIT 1").get(usuarioId, clave);
// El concepto (clave) de una falla de antes: el de su pregunta (o el de la tarjeta de su refuerzo).
function conceptoDeFalla(paquete, f) {
  if (f.origen === 'concepto') return conceptoPorClave(paquete, f.clave);
  const deTarjeta = leerRefuerzo(f)?.tarjeta;
  const delTema = [...conceptosDe(paquete).porClave.values()].filter(c => c.materia === f.materia && c.tema === f.tema);
  return (deTarjeta ? delTema.find(c => c.indice === deTarjeta.indice) : null) ?? (f.pregunta ? conceptoDePregunta(paquete, f.pregunta) : null) ?? delTema[0] ?? null;
}

// Todo lo que el alumno ha fallado, en un solo lugar: arriba «Para repasar» (los conceptos con más de 2 errores, y las
// fallas de antes que siguen vivas); debajo «Tus errores» (cada pregunta fallada, por tema → concepto, lo más nuevo primero).
export function miRepaso(db, usuarioId, paquete, ahoraMs = Date.now()) {
  if (!paquete) return { paraRepasar: [], errores: [], pendientes: 0, superadas: 0, umbral: CONFIG_FALLAS.umbral };
  sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const cfg = leerConfigFallas(db);
  const filas = db.prepare('SELECT * FROM academia_fallas WHERE usuario_id = ? ORDER BY ultima_en DESC, id DESC').all(usuarioId);
  const paraRepasar = filas.filter(f => f.estado !== 'superada' && cuentaParaRepaso(f, cfg)).map(f => {
    const c = conceptoDeFalla(paquete, f);
    const t = temaDe(paquete, f.materia, f.tema);
    const r = leerRefuerzo(f) ?? {};
    return {
      falla: f.id, origen: f.origen, clave: c?.clave ?? null, materia: f.materia, tema: f.tema, temaTitulo: t?.titulo ?? f.tema, temaNumero: temaNumeroDe(paquete, f.materia, f.tema),
      concepto: c ? nombreConcepto(c) : (r.tarjeta?.titulo || t?.titulo || f.tema), fallos: f.fallos, aciertos: f.aciertos, meta: metaDe(cfg, f), estado: f.estado,
      dias: r.dias ?? null, ronda: Number(r.ronda) || 0, miniclase: Boolean(r.miniclase?.pendiente),
      // Repasar: un concepto, con sus preguntas; una falla de antes, con la Práctica del instructor de su tema (como siempre).
      practicar: f.origen === 'concepto' && c ? { tipo: 'errores', concepto: c.clave } : { tipo: 'instructor', materia: f.materia, tema: f.tema },
      // 0.12.9 (S): su peso en el examen = cuántas preguntas del Test Guide salen de ese concepto.
      peso: c?.preguntas?.length ?? 1,
    };
  }).filter(x => temaDe(paquete, x.materia, x.tema))
    // 0.12.9 (S): primero lo que falla y MÁS sale en el Test Guide (a igual peso, lo más reciente primero, como antes).
    .map((x, i) => ({ x, i })).sort((a, b) => b.x.peso - a.x.peso || a.i - b.i).map(({ x }) => x);
  const enRepaso = new Set(paraRepasar.map(x => x.clave).filter(Boolean));
  // «Tus errores»: la memoria de errores (cada pregunta que falló alguna vez), por tema → concepto.
  const memoria = puntosDebiles(db, usuarioId, paquete);
  const temas = new Map();
  for (const p of memoria.preguntas) {
    const c = conceptoDePregunta(paquete, p.pregunta);
    if (!c) continue;
    const q = paquete.preguntas.get(p.pregunta);
    const kt = `${c.materia}/${c.tema}`;
    const t = temas.get(kt) ?? { materia: c.materia, tema: c.tema, temaTitulo: c.temaTitulo, temaNumero: c.temaNumero, ultima: '', conceptos: new Map() };
    const x = t.conceptos.get(c.clave) ?? { clave: c.clave, concepto: nombreConcepto(c), enRepaso: enRepaso.has(c.clave), ultima: '', preguntas: [] };
    x.preguntas.push({ id: p.pregunta, numero: q?.original.numero ?? null, enunciado: q?.original.enunciado ?? '', fallos: p.fallos, veces: p.veces, ultima: p.ultima, superada: p.superada });
    if (String(p.ultima) > x.ultima) x.ultima = String(p.ultima);
    if (x.ultima > t.ultima) t.ultima = x.ultima;
    t.conceptos.set(c.clave, x);
    temas.set(kt, t);
  }
  const nuevoPrimero = (a, b) => b.ultima.localeCompare(a.ultima);
  const errores = [...temas.values()].sort(nuevoPrimero).map(t => ({
    ...t, conceptos: [...t.conceptos.values()].sort(nuevoPrimero).map(x => ({ ...x, preguntas: x.preguntas.sort((a, b) => String(b.ultima).localeCompare(String(a.ultima))) })),
  }));
  return {
    paraRepasar, errores, umbral: cfg.umbral, meta: { aciertos: cfg.aciertos, dias: cfg.diasConcepto },
    pendientes: memoria.preguntas.filter(p => !p.superada).length, superadas: filas.filter(f => f.estado === 'superada').length,
  };
}

// Las preguntas para repasar un concepto: las que falló (sin superar primero), después las demás del concepto, hasta 10.
export function preguntasDeConcepto(db, usuarioId, paquete, clave) {
  const c = esClaveConcepto(clave) ? conceptoPorClave(paquete, clave) : null;
  if (!c) throw new ErrorHttp(404, 'no_existe');
  const memoria = new Map(puntosDebiles(db, usuarioId, paquete).preguntas.map(p => [p.pregunta, p]));
  const puesto = id => { const p = memoria.get(id); return !p ? 2 : p.superada ? 1 : 0; };
  const ids = c.preguntas.filter(id => paquete.preguntas.has(id)).map((id, i) => ({ id, i })).sort((a, b) => puesto(a.id) - puesto(b.id) || a.i - b.i).map(x => x.id);
  return { concepto: c, ids: ids.slice(0, CONFIG_FALLAS.repaso) };
}

// Empezó a repasar un concepto (un intento «errores» con concepto): queda anotado el intento, la falla viva (si la hay)
// pasa a «refuerzo» y la mini-clase pendiente ya se vio (la volverá a ver si falla otra vez).
export function empezarRepaso(db, usuarioId, paquete, clave, intentoId, ahoraMs = Date.now()) {
  guardarAjuste(db, claveIntento(intentoId), clave);
  const f = vivaDe(db, usuarioId, clave);
  if (!f) return;
  const r = leerRefuerzo(f) ?? {};
  const momento = new Date(ahoraMs).toISOString();
  const refuerzo = { ...r, miniclase: r.miniclase ? { ...r.miniclase, pendiente: false } : null };
  db.prepare("UPDATE academia_fallas SET estado = CASE WHEN estado = 'activa' THEN 'refuerzo' ELSE estado END, refuerzo = ?, refuerzo_en = COALESCE(refuerzo_en, ?), actualizado_en = ? WHERE id = ?")
    .run(JSON.stringify(refuerzo), momento, momento, f.id);
}

// Lo que el resultado de un intento dice de «Mi repaso»: si era el repaso de un concepto (y cómo quedó), y qué conceptos
// entraron a «Mi repaso» con este intento (con la razón en una línea).
export function repasoDelResultado(db, usuarioId, paquete, fila, ahoraMs = Date.now()) {
  sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const extra = {};
  const clave = leerAjuste(db, claveIntento(fila.id));
  if (clave && esClaveConcepto(clave)) {
    const c = conceptoPorClave(paquete, clave);
    const ultima = db.prepare('SELECT * FROM academia_fallas WHERE usuario_id = ? AND clave = ? ORDER BY id DESC LIMIT 1').get(usuarioId, clave);
    const superada = ultima?.estado === 'superada' && String(ultima.superada_en) >= String(fila.empezado_en);
    extra.repaso = {
      clave, concepto: c ? nombreConcepto(c) : '', temaTitulo: c?.temaTitulo ?? '', temaNumero: c?.temaNumero ?? null, falladas: fila.total - fila.aciertos,
      enRepaso: Boolean(ultima && ultima.estado !== 'superada'), superada, aciertos: ultima?.aciertos ?? 0, meta: CONFIG_FALLAS.aciertos,
    };
  }
  const nuevos = db.prepare("SELECT clave, fallos, refuerzo FROM academia_fallas WHERE usuario_id = ? AND origen = 'concepto' ORDER BY id").all(usuarioId)
    .filter(f => leerRefuerzo(f)?.intento === fila.id)
    .map(f => { const c = conceptoPorClave(paquete, f.clave); const r = leerRefuerzo(f); return { clave: f.clave, concepto: c ? nombreConcepto(c) : r?.concepto?.titulo ?? '', temaTitulo: c?.temaTitulo ?? '', temaNumero: c?.temaNumero ?? null, fallos: f.fallos, dias: r?.dias ?? 1 }; });
  if (nuevos.length) extra.nuevosEnRepaso = nuevos;
  return extra;
}

// La MINI-CLASE de un concepto (en «Mi repaso», nunca en la clase normal): la tarjeta que lo explica (o, para el
// concepto general, el «más fácil» del tema), y la pregunta que falló con su explicación. Rota: desde la 2.ª ronda
// fallada, también la idea equivocada de la opción que eligió; desde la 3.ª, el «más fácil» del tema.
export function miniClase(db, usuarioId, paquete, clave, ahoraMs = Date.now()) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const c = esClaveConcepto(clave) ? conceptoPorClave(paquete, clave) : null;
  if (!c) throw new ErrorHttp(404, 'no_existe');
  sincronizarFallas(db, usuarioId, paquete, ahoraMs);
  const t = temaDe(paquete, c.materia, c.tema);
  // De un tema cerrado, solo si ya respondió preguntas de ese concepto (al ir directo al examen): como su repaso.
  const marcasC = c.preguntas.map(() => '?').join(', ');
  const respondio = db.prepare(`SELECT 1 FROM academia_respuestas WHERE usuario_id = ? AND pregunta IN (${marcasC}) LIMIT 1`).get(usuarioId, ...c.preguntas);
  if (!respondio && camino(db, usuarioId, paquete, ahoraMs).materias.find(m => m.id === c.materia)?.temas.find(x => x.id === c.tema)?.estado === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
  const viva = vivaDe(db, usuarioId, clave);
  const r = viva ? leerRefuerzo(viva) ?? {} : {};
  const ronda = Number(r.ronda) || 0;
  // La pregunta: la de la mini-clase pendiente, o la última que falló de ese concepto.
  const marcas = c.preguntas.map(() => '?').join(', ');
  const ultimaMala = db.prepare(`SELECT intento_id, pregunta, elegida FROM academia_respuestas WHERE usuario_id = ? AND correcta = 0 AND pregunta IN (${marcas}) ORDER BY id DESC LIMIT 1`).get(usuarioId, ...c.preguntas);
  const mala = r.miniclase?.pregunta ? { intento_id: r.miniclase.intento, pregunta: r.miniclase.pregunta, elegida: r.miniclase.opcion } : ultimaMala;
  const q = mala ? paquete.preguntas.get(mala.pregunta) : null;
  const correcta = q?.original.opciones.find(o => o.letra === q.original.correcta) ?? null;
  const elegida = q?.original.opciones.find(o => o.letra === mala.elegida) ?? null;
  return {
    clave, concepto: nombreConcepto(c), materia: c.materia, tema: c.tema, temaTitulo: c.temaTitulo, temaNumero: c.temaNumero, ronda,
    enRepaso: Boolean(viva), fallos: viva?.fallos ?? 0, aciertos: viva?.aciertos ?? 0, meta: CONFIG_FALLAS.aciertos,
    secciones: c.indice >= 0 && t?.secciones[c.indice] ? vistaSecciones(paquete, [t.secciones[c.indice]], t.paquete) : [],
    masFacil: c.indice < 0 || ronda >= 3 ? vistaSecciones(paquete, t?.reexplicacion ?? [], t?.paquete) : [],
    pregunta: q ? {
      id: mala.pregunta, intento: mala.intento_id, numero: q.original.numero ?? null, enunciado: q.original.enunciado,
      correcta: correcta ? { letra: correcta.letra, texto: correcta.texto } : null, elegida: elegida ? { letra: elegida.letra, texto: elegida.texto } : null,
      sencilla: q.sencilla ?? null, explicacion: q.original.explicacion ?? null,
      idea: ronda >= 2 && elegida && elegida.letra !== q.original.correcta ? ideaDe(q, elegida.letra) : null,
    } : null,
  };
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
      materia: x.materia, tema: x.tema, titulo: t?.titulo ?? x.tema, temaNumero: temaNumeroDe(paquete, x.materia, x.tema), fallos: x.preguntas.length, ideas: x.ideas.slice(0, 3),
      tarjeta: tarjeta ? { indice: tarjeta.indice, titulo: tarjeta.titulo } : null,
      // 0.12.2: el concepto de esa tarjeta (su mini-clase está en «Mi repaso»).
      concepto: (tarjeta ? [...conceptosDe(paquete).porClave.values()].find(c => c.materia === x.materia && c.tema === x.tema && c.indice === tarjeta.indice) : null)?.clave
        ?? conceptoDePregunta(paquete, x.preguntas[0])?.clave ?? null,
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
