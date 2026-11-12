// Academia 0.9.2: el examen de materia como el de ENALAS: con reloj, sin ver si acertó hasta entregar.
//  - Al empezar se fija su límite (preguntas × segundos por pregunta, de los ajustes): cambiar el ajuste después no mueve
//    un examen que ya corre. El servidor manda siempre los milisegundos que faltan (la pantalla nunca usa su reloj).
//  - Mientras corre, cada respuesta se guarda en «ajustes» (academia.examen.<intento>): la letra elegida (se puede cambiar),
//    cuándo, las marcadas «revisar después» y los segundos que pasó en cada pregunta. NADA va a academia_respuestas
//    hasta entregar: así los puntos, el repaso, la memoria de errores y el % no dicen nada antes de tiempo.
//  - Al entregar (o al acabarse el tiempo) se escriben todas juntas, con la hora en que se eligió cada una. Las que
//    quedaron sin responder cuentan como malas (el total no cambia).
//  - Un examen que se quedó abierto y ya venció se entrega solo la próxima vez que se mira (alumno o administrador).
//  - Los exámenes empezados antes de la 0.9.2 (sin su fila en ajustes) siguen como antes.
// Sin cambio de base.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { crearIntento, verIntento, terminar, anotarRepaso, ajustesAcademia, vistaPregunta, retroalimentacion, diaDe } from './progreso.js';

export const GRACIA_MS = 30 * 1000; // la red del teléfono puede tardar: unos segundos de más para guardar la última
const MAXIMO_SEGUNDOS_POR_GUARDADO = 15 * 60;
const clave = id => `academia.examen.${Number(id)}`;

export function leerExamen(db, intentoId) {
  try {
    const e = JSON.parse(leerAjuste(db, clave(intentoId)) ?? 'null');
    if (!e || !Number.isSafeInteger(e.limiteMs) || e.limiteMs <= 0) return null;
    return { limiteMs: e.limiteMs, respuestas: e.respuestas && typeof e.respuestas === 'object' ? e.respuestas : {}, marcadas: Array.isArray(e.marcadas) ? e.marcadas : [], tiempos: e.tiempos && typeof e.tiempos === 'object' ? e.tiempos : {} };
  } catch { return null; }
}
const escribir = (db, id, e) => guardarAjuste(db, clave(id), JSON.stringify(e));
const filaDe = (db, usuarioId, intentoId) => {
  const id = Number(intentoId);
  const f = Number.isSafeInteger(id) ? db.prepare('SELECT * FROM academia_intentos WHERE id = ? AND usuario_id = ?').get(id, usuarioId) : null;
  if (!f) throw new ErrorHttp(404, 'no_existe');
  return f;
};
export const finDe = (fila, e) => Date.parse(fila.empezado_en) + e.limiteMs;
// ¿Es un examen con reloj (0.9.2)? → su registro, o null.
export function examenDe(db, fila) {
  return fila?.tipo === 'examen' ? leerExamen(db, fila.id) : null;
}

// «Empezar examen»: si ya hay uno abierto de esa materia con tiempo, sigue ese (no se empieza otro reloj).
export function crearExamen(db, usuarioId, paquete, materia, { azar, ahoraMs = Date.now() } = {}) {
  cerrarVencidos(db, usuarioId, paquete, ahoraMs);
  const abiertos = db.prepare("SELECT * FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND materia IS ? AND terminado_en IS NULL ORDER BY id DESC").all(usuarioId, materia);
  for (const f of abiertos) {
    const e = leerExamen(db, f.id);
    if (e && ahoraMs < finDe(f, e)) return { codigo: 200, datos: vistaExamen(db, usuarioId, paquete, f.id, { ahoraMs }) };
  }
  return enTransaccion(db, () => {
    const i = crearIntento(db, usuarioId, paquete, { tipo: 'examen', materia }, { azar, ahoraMs });
    const { examenSegundos } = ajustesAcademia(db);
    escribir(db, i.id, { v: 1, limiteMs: i.total * examenSegundos * 1000, respuestas: {}, marcadas: [], tiempos: {} });
    return { codigo: 201, datos: vistaExamen(db, usuarioId, paquete, i.id, { ahoraMs }) };
  });
}

// Lo que ve el alumno. Mientras corre: las preguntas sin nada que diga cuál es la correcta, sus letras elegidas, las
// marcadas, los segundos y lo que falta. Entregado: igual que cualquier intento terminado, más los tiempos.
export function vistaExamen(db, usuarioId, paquete, intentoId, { ahoraMs = Date.now() } = {}) {
  const fila = filaDe(db, usuarioId, intentoId);
  const e = leerExamen(db, fila.id);
  const v = verIntento(db, usuarioId, paquete, fila.id);
  if (!e) return v;
  const fin = finDe(fila, e);
  const examen = {
    reloj: true, limiteSegundos: Math.round(e.limiteMs / 1000), tiempos: redondear(e.tiempos), marcadas: e.marcadas.filter(q => typeof q === 'string'),
  };
  if (fila.terminado_en) {
    return { ...v, examen: { ...examen, tiempoUsado: Math.max(0, Math.round((Date.parse(fila.terminado_en) - Date.parse(fila.empezado_en)) / 1000)) } };
  }
  return {
    ...v,
    preguntas: v.preguntas.map(q => ({ ...q, respuesta: null })),
    respondidas: Object.keys(e.respuestas).length,
    aciertos: null,
    examen: { ...examen, restanteMs: Math.max(0, fin - ahoraMs), respuestas: Object.fromEntries(Object.entries(e.respuestas).map(([q, r]) => [q, r.letra])) },
  };
}
const redondear = tiempos => Object.fromEntries(Object.entries(tiempos).filter(([, s]) => Number.isFinite(s)).map(([q, s]) => [q, Math.round(s)]));

// Guardar (o cambiar, o borrar con elegida = null) una respuesta, marcar «revisar después» y sumar los segundos que
// pasó en una pregunta. Todo opcional menos «pregunta».
export function guardarEnExamen(db, usuarioId, paquete, intentoId, { pregunta, elegida, marcada, segundos }, { ahoraMs = Date.now() } = {}) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  return enTransaccion(db, () => {
    const fila = filaDe(db, usuarioId, intentoId);
    const e = examenDe(db, fila);
    if (!e) throw new ErrorHttp(409, 'no_es_examen');
    if (fila.terminado_en) throw new ErrorHttp(409, 'intento_terminado');
    if (ahoraMs > finDe(fila, e) + GRACIA_MS) throw new ErrorHttp(409, 'tiempo_agotado');
    const orden = JSON.parse(fila.orden);
    if (typeof pregunta !== 'string' || !orden.includes(pregunta)) throw new ErrorHttp(400, 'pregunta_no_es_del_intento');
    const q = paquete.preguntas.get(pregunta);
    if (!q) throw new ErrorHttp(409, 'pregunta_no_disponible');
    if (elegida !== undefined) {
      if (elegida === null) delete e.respuestas[pregunta];
      else if (typeof elegida === 'string' && q.original.opciones.some(o => o.letra === elegida)) e.respuestas[pregunta] = { letra: elegida, en: new Date(ahoraMs).toISOString() };
      else throw new ErrorHttp(400, 'opcion_no_valida');
    }
    if (marcada !== undefined) {
      if (typeof marcada !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
      e.marcadas = e.marcadas.filter(x => x !== pregunta);
      if (marcada) e.marcadas.push(pregunta);
    }
    if (segundos !== undefined) {
      if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos < 0) throw new ErrorHttp(400, 'datos_no_validos');
      const tope = e.limiteMs / 1000;
      e.tiempos[pregunta] = Math.min(tope, (Number(e.tiempos[pregunta]) || 0) + Math.min(segundos, MAXIMO_SEGUNDOS_POR_GUARDADO));
    }
    escribir(db, fila.id, e);
    return { respondidas: Object.keys(e.respuestas).length, total: fila.total, restanteMs: Math.max(0, finDe(fila, e) - ahoraMs), marcadas: e.marcadas };
  });
}

// Entregar: las respuestas guardadas pasan a academia_respuestas (con su hora), se anota el repaso y se pone la nota.
// Las sin responder cuentan como malas. Se puede llamar otra vez (devuelve el mismo resultado).
export function entregarExamen(db, usuarioId, paquete, intentoId, { ahoraMs = Date.now() } = {}) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const fila0 = filaDe(db, usuarioId, intentoId);
  const e = examenDe(db, fila0);
  if (!e) throw new ErrorHttp(409, 'no_es_examen');
  const momento = Math.min(ahoraMs, finDe(fila0, e));
  const res = enTransaccion(db, () => {
    const fila = filaDe(db, usuarioId, intentoId);
    if (!fila.terminado_en) {
      let respondidas = 0;
      let aciertos = 0;
      for (const id of JSON.parse(fila.orden)) {
        const r = e.respuestas[id];
        const q = paquete.preguntas.get(id);
        if (!r || !q) continue;
        const ya = db.prepare('SELECT 1 FROM academia_respuestas WHERE intento_id = ? AND pregunta = ?').get(fila.id, id);
        if (ya) continue;
        const acierto = r.letra === q.original.correcta;
        const cuando = Number.isFinite(Date.parse(r.en)) ? Math.min(Date.parse(r.en), momento) : momento;
        const lugar = paquete.deTema.get(id);
        db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(fila.id, usuarioId, id, lugar?.materia ?? null, lugar?.tema ?? null, r.letra, acierto ? 1 : 0, diaDe(cuando), new Date(cuando).toISOString());
        anotarRepaso(db, usuarioId, id, lugar, acierto, cuando);
        respondidas += 1;
        if (acierto) aciertos += 1;
      }
      db.prepare('UPDATE academia_intentos SET respondidas = respondidas + ?, aciertos = aciertos + ? WHERE id = ?').run(respondidas, aciertos, fila.id);
    }
    return terminar(db, usuarioId, paquete, fila.id, { ahoraMs: momento, permitirFaltantes: true });
  });
  const fila = filaDe(db, usuarioId, intentoId);
  // La revisión con TODAS las preguntas: las sin responder también (elegida: null), y los segundos de cada una.
  const vistas = new Map(res.revision.map(q => [q.id, q]));
  const revision = JSON.parse(fila.orden).map(id => {
    const q = vistas.get(id) ?? (() => {
      const r = retroalimentacion(paquete, id, '');
      return { ...vistaPregunta(paquete, id), respuesta: r ? { ...r, elegida: null, acierto: false, idea: null, sinResponder: true } : null };
    })();
    return { ...q, segundos: Math.round(Number(e.tiempos[id]) || 0) };
  });
  return {
    ...res, revision,
    examen: {
      reloj: true, limiteSegundos: Math.round(e.limiteMs / 1000), tiempos: redondear(e.tiempos),
      tiempoUsado: Math.max(0, Math.round((Date.parse(fila.terminado_en) - Date.parse(fila.empezado_en)) / 1000)),
      sinResponder: revision.filter(q => q.respuesta?.sinResponder).length,
      vencido: ahoraMs >= finDe(fila, e),
    },
  };
}

// Los exámenes con reloj de ese alumno que quedaron abiertos y ya vencieron se entregan solos.
export function cerrarVencidos(db, usuarioId, paquete, ahoraMs = Date.now()) {
  if (!paquete) return 0;
  let n = 0;
  for (const f of db.prepare("SELECT * FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND terminado_en IS NULL").all(usuarioId)) {
    const e = leerExamen(db, f.id);
    if (e && ahoraMs > finDe(f, e) + GRACIA_MS) {
      try { entregarExamen(db, usuarioId, paquete, f.id, { ahoraMs }); n += 1; } catch { /* se intenta otra vez la próxima */ }
    }
  }
  return n;
}

// Para el administrador: los tiempos de un intento (o null si no es examen con reloj).
export function tiemposDe(db, fila) {
  const e = examenDe(db, fila);
  if (!e) return null;
  return {
    limiteSegundos: Math.round(e.limiteMs / 1000), tiempos: redondear(e.tiempos), marcadas: e.marcadas,
    tiempoUsado: fila.terminado_en ? Math.max(0, Math.round((Date.parse(fila.terminado_en) - Date.parse(fila.empezado_en)) / 1000)) : null,
  };
}
