// Academia 0.9.0: el «Instructor». Funciona SIEMPRE, sin IA y sin costo (todo sale de las respuestas que ya están en la
// base); si el dueño encendió el instructor con IA, la IA solo AGREGA (src/academia/instructor-ia.js), nunca reemplaza.
//
// 1. El modelo del alumno («cerebro educativo»), calculado cada vez desde academia_respuestas y academia_intentos (nada
//    nuevo en la base): dominio por tema y por pregunta, las ideas equivocadas que más elige (la idea del paquete para
//    esa opción), si repite la MISMA opción mala, si responde con prisa (falla en pocos segundos), a qué hora estudia,
//    cómo le va con las opciones del Test Guide contra el Modo reto, y su ritmo contra el plan.
// 2. «Tu instructor dice…»: UN siguiente paso concreto (repasar lo que vence hoy, la tarjeta que explica su error, el
//    Modo reto de un tema, el tema que sigue o el examen), con su botón.
// 3. «Explícamelo de otra forma» sin IA: la idea equivocada EXACTA de la opción que eligió, la explicación sencilla y la
//    tarjeta de la lección que mejor la explica. La pregunta y sus opciones nunca se cambian: salen del paquete tal cual.
// 4. Una duda escrita, sin IA: la tarjeta del tema que más se parece a lo que preguntó.
// Todo con el id del alumno de la sesión: nunca con uno que mande la pantalla.
import { ErrorHttp } from '../nucleo/http.js';
import { camino, diaDe } from './progreso.js';
import { planDe } from './plan.js';
import { puntosDebiles } from './memoria.js';
import { ideaDe, opcionRetoDe, MODO_RETO } from './reto.js';

// Una respuesta MALA dada en menos de esto (desde la anterior del mismo intento): «con prisa».
export const PRISA_MS = 7000;
// Desde cuántas respuestas rápidas y malas se le dice (y qué parte de sus errores tienen que ser así).
const PRISA_MINIMA = 3;
const PRISA_PARTE = 0.4;
// Lo que se mira hacia atrás para la prisa y la hora (las últimas respuestas).
const RECIENTES = 200;
export const ESTILOS = Object.freeze(['paso_a_paso', 'ejemplo', 'claro', 'tecnico']);
const FRANJAS = Object.freeze([['madrugada', 0, 6], ['manana', 6, 12], ['tarde', 12, 19], ['noche', 19, 24]]);
const horaRD = iso => new Date(Date.parse(iso) - 4 * 3600 * 1000).getUTCHours();
const pct = (bien, total) => (total > 0 ? Math.floor((bien * 100) / total) : 0);

// ---------- Palabras (para elegir la tarjeta que mejor explica algo) ----------
const VACIAS = new Set(('a al algo ante como con de del desde donde el ella en entre es esa ese eso esta este esto la las le les lo los mas más '
  + 'muy no o para pero por porque que qué se ser si sí sin sobre su sus tan un una uno unos unas usted y ya cuando cual cuál puede debe hay '
  + 'the of and or to in on for is are be by with an it its at as').split(/\s+/));
const raices = texto => new Set(String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9ñ]+/).filter(p => p.length >= 4 && !VACIAS.has(p)).map(p => p.slice(0, 5)));
const textoDeSeccion = s => [s?.titulo, s?.texto, ...(Array.isArray(s?.puntos) ? s.puntos : []), s?.recuerda, s?.ejemplo].filter(x => typeof x === 'string').join(' ');

// La sección (tarjeta) de un tema que más palabras comparte con un texto: { indice, titulo, puntos, texto, recuerda } o null.
export function tarjetaPara(tema, texto) {
  const buscadas = raices(texto);
  let mejor = null;
  (tema?.secciones ?? []).forEach((s, indice) => {
    const propias = raices(textoDeSeccion(s));
    let n = 0;
    for (const p of buscadas) if (propias.has(p)) n += 1;
    if (n > 0 && (!mejor || n > mejor.n)) mejor = { n, indice, s };
  });
  if (!mejor) return null;
  const s = mejor.s;
  return {
    indice: mejor.indice, titulo: s.titulo ?? '', puntos: Array.isArray(s.puntos) ? [...s.puntos] : [],
    texto: typeof s.texto === 'string' ? s.texto : null, recuerda: s.recuerda ?? null, coincidencias: mejor.n,
  };
}
const temaDe = (paquete, materia, tema) => paquete?.materias.find(m => m.id === materia)?.temas.find(t => t.id === tema) ?? null;

// ---------- 1. El modelo del alumno ----------
export function modeloAlumno(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const vacio = {
    respuestas: 0, aciertos: 0, pct: 0, temas: [], ideas: [], repetidas: [], prisa: { rapidasMal: 0, malas: 0, activa: false },
    hora: null, formatos: { original: { n: 0, bien: 0, pct: 0 }, reto: { n: 0, bien: 0, pct: 0 } }, repasoHoy: 0, estilo: 'claro', hoy: 0,
  };
  if (!paquete) return vacio;
  const filas = db.prepare(`SELECT r.id, r.intento_id, r.pregunta, r.elegida, r.correcta, r.creada_en, i.tipo, i.empezado_en FROM academia_respuestas r
    JOIN academia_intentos i ON i.id = r.intento_id WHERE r.usuario_id = ? ORDER BY r.id`).all(usuarioId).filter(f => paquete.preguntas.has(f.pregunta));
  if (!filas.length) return { ...vacio, repasoHoy: repasoHoy(db, usuarioId, paquete, ahoraMs) };
  const ultima = new Map();
  const formatos = { original: { n: 0, bien: 0 }, reto: { n: 0, bien: 0 } };
  const porOpcion = new Map();
  for (const f of filas) {
    ultima.set(f.pregunta, f.correcta === 1);
    const fmt = f.tipo === 'reto' ? formatos.reto : formatos.original;
    fmt.n += 1;
    fmt.bien += f.correcta;
    if (f.correcta !== 1) {
      const k = `${f.pregunta}\u0000${f.elegida}`;
      porOpcion.set(k, { pregunta: f.pregunta, opcion: f.elegida, veces: (porOpcion.get(k)?.veces ?? 0) + 1, modo: f.tipo === 'reto' ? MODO_RETO : 'original' });
    }
  }
  // La prisa: entre las últimas respuestas, las MALAS que llegaron en pocos segundos (desde la anterior del intento).
  const recientes = filas.slice(-RECIENTES);
  const sonRecientes = new Set(recientes);
  const antes = new Map();
  let rapidasMal = 0;
  let malas = 0;
  for (const f of filas) {
    const previa = antes.get(f.intento_id) ?? f.empezado_en;
    antes.set(f.intento_id, f.creada_en);
    if (!sonRecientes.has(f) || f.correcta === 1) continue;
    malas += 1;
    const ms = Date.parse(f.creada_en) - Date.parse(previa);
    if (Number.isFinite(ms) && ms >= 0 && ms < PRISA_MS) rapidasMal += 1;
  }
  const prisa = { rapidasMal, malas, activa: rapidasMal >= PRISA_MINIMA && rapidasMal >= malas * PRISA_PARTE };
  // La hora a la que más estudia (Santo Domingo) y cómo le va a esa hora.
  const franjas = new Map();
  for (const f of recientes) {
    const h = horaRD(f.creada_en);
    const fr = FRANJAS.find(([, desde, hasta]) => h >= desde && h < hasta)?.[0] ?? 'tarde';
    const x = franjas.get(fr) ?? { franja: fr, n: 0, bien: 0 };
    x.n += 1;
    x.bien += f.correcta;
    franjas.set(fr, x);
  }
  const masUsada = [...franjas.values()].sort((a, b) => b.n - a.n)[0];
  const hora = masUsada ? { franja: masUsada.franja, pct: pct(masUsada.bien, masUsada.n), n: masUsada.n } : null;
  // Dominio por tema: preguntas cuya ÚLTIMA respuesta fue buena, sobre las del tema.
  const temas = [];
  for (const m of paquete.materias) {
    for (const t of m.temas) {
      if (!t.preguntas.length) continue;
      const vistas = t.preguntas.filter(id => ultima.has(id));
      if (!vistas.length) continue;
      const bien = t.preguntas.filter(id => ultima.get(id) === true).length;
      temas.push({ materia: m.id, tema: t.id, titulo: t.titulo, preguntas: t.preguntas.length, vistas: vistas.length, bien, pct: pct(bien, t.preguntas.length) });
    }
  }
  const memoria = puntosDebiles(db, usuarioId, paquete);
  const repetidas = [...porOpcion.values()].filter(x => x.veces >= 2 && ultima.get(x.pregunta) !== true)
    .map(x => {
      const q = paquete.preguntas.get(x.pregunta);
      const lugar = paquete.deTema.get(x.pregunta);
      return { ...x, numero: q.original.numero ?? null, idea: ideaDe(q, x.opcion), texto: textoDeOpcion(q, x.opcion), materia: lugar?.materia ?? null, tema: lugar?.tema ?? null };
    })
    .sort((a, b) => b.veces - a.veces || a.pregunta.localeCompare(b.pregunta));
  const aciertos = filas.filter(f => f.correcta === 1).length;
  const total = pct(aciertos, filas.length);
  const fmt = x => ({ n: x.n, bien: x.bien, pct: pct(x.bien, x.n) });
  const modelo = {
    respuestas: filas.length, aciertos, pct: total, temas, ideas: memoria.ideas.filter(x => !x.superada).slice(0, 5), repetidas: repetidas.slice(0, 5), prisa, hora,
    formatos: { original: fmt(formatos.original), reto: fmt(formatos.reto) }, repasoHoy: repasoHoy(db, usuarioId, paquete, ahoraMs),
    hoy: filas.filter(f => diaDe(Date.parse(f.creada_en)) === diaDe(ahoraMs)).length,
  };
  modelo.estilo = estiloDe(modelo);
  return modelo;
}

// Cómo conviene explicarle (lo usa también la IA, como «estilo»): paso a paso si le cuesta o repite el mismo error, con un
// ejemplo de vuelo si va con prisa, técnico si ya domina casi todo, claro en lo demás.
export function estiloDe(m) {
  if (m.respuestas >= 20 && m.pct >= 85) return 'tecnico';
  if (m.prisa?.activa) return 'ejemplo';
  if (m.respuestas >= 5 && (m.pct < 60 || m.repetidas?.length)) return 'paso_a_paso';
  return 'claro';
}

function repasoHoy(db, usuarioId, paquete, ahoraMs) {
  return db.prepare('SELECT pregunta FROM academia_repaso WHERE usuario_id = ? AND caja < 6 AND vence_en <= ?').all(usuarioId, new Date(ahoraMs).toISOString())
    .filter(f => paquete.preguntas.has(f.pregunta)).length;
}
function textoDeOpcion(q, clave) {
  const r = opcionRetoDe(q, clave);
  if (r) return r.texto;
  return q.original.opciones.find(o => o.letra === clave)?.texto ?? null;
}

// ---------- 2. «Tu instructor dice…» ----------
// Un consejo: { clave, vars, accion, tema? }. La pantalla pone el texto (i18n «instr.c.<clave>») y el botón según la acción:
//  { tipo: 'intento', datos } (empezar una práctica), { tipo: 'tema', materia, tema } (abrir la lección), { tipo: 'examen', materia }.
// donde: { materia, tema } para el consejo al empezar un tema (solo lo de ese tema); sin donde, el de Inicio.
export function consejoInstructor(db, usuarioId, paquete, ahoraMs = Date.now(), donde = null) {
  if (!paquete) return { modelo: modeloAlumno(db, usuarioId, null, ahoraMs), consejo: null, observaciones: [] };
  const modelo = modeloAlumno(db, usuarioId, paquete, ahoraMs);
  const c = camino(db, usuarioId, paquete, ahoraMs);
  if (donde?.materia && donde?.tema) {
    const t = temaDe(paquete, donde.materia, donde.tema);
    if (!t) throw new ErrorHttp(404, 'no_existe');
    return { modelo: resumenModelo(modelo), consejo: consejoDeTema(modelo, paquete, donde.materia, t), observaciones: [] };
  }
  return { modelo: resumenModelo(modelo), consejo: consejoGeneral(db, usuarioId, modelo, paquete, c, ahoraMs), observaciones: observaciones(modelo) };
}

function siguientePaso(c) {
  for (const m of c.materias) {
    const t = m.temas.find(x => x.estado === 'abierto');
    if (t) return { tipo: 'tema', materia: m.id, tema: t.id, titulo: t.titulo };
    if (m.examen.disponible && !m.examen.aprobado) return { tipo: 'examen', materia: m.id };
  }
  return null;
}

function consejoGeneral(db, usuarioId, modelo, paquete, c, ahoraMs) {
  const sigue = siguientePaso(c);
  const irAlSiguiente = sigue?.tipo === 'tema' ? { tipo: 'tema', materia: sigue.materia, tema: sigue.tema } : sigue ? { tipo: 'examen', materia: sigue.materia } : null;
  if (!modelo.respuestas) {
    return sigue?.tipo === 'tema' ? { clave: 'empieza', vars: { tema: sigue.titulo }, accion: irAlSiguiente } : { clave: 'listo', vars: {}, accion: null };
  }
  // El mismo error, una y otra vez: la tarjeta que lo explica (y practicar ese tema).
  const r = modelo.repetidas[0];
  if (r) {
    const tarjeta = tarjetaPara(temaDe(paquete, r.materia, r.tema), [r.idea, paquete.preguntas.get(r.pregunta)?.original.explicacion].join(' '));
    return {
      clave: 'repite', vars: { veces: r.veces, numero: r.numero ?? '', opcion: r.texto ?? '', idea: r.idea ?? '', tarjeta: tarjeta?.titulo ?? '' },
      accion: { tipo: 'intento', datos: { tipo: 'errores', materia: r.materia, tema: r.tema } }, tema: { materia: r.materia, tema: r.tema },
    };
  }
  if (modelo.prisa.activa) return { clave: 'prisa', vars: { n: modelo.prisa.rapidasMal, segundos: PRISA_MS / 1000 }, accion: { tipo: 'intento', datos: { tipo: 'instructor' } } };
  if (modelo.repasoHoy > 0) return { clave: 'repaso', vars: { n: modelo.repasoHoy }, accion: { tipo: 'intento', datos: { tipo: 'instructor' } } };
  // Reconoce las frases del Test Guide pero en Modo reto se equivoca: que practique el reto (entender, no memorizar).
  const { original, reto } = modelo.formatos;
  const temaReto = c.materias.find(m => m.reto > 0 && m.estado !== 'bloqueada');
  if (temaReto && original.n >= 5 && (reto.n === 0 || (reto.n >= 5 && original.pct - reto.pct >= 15))) {
    return { clave: reto.n ? 'reto_bajo' : 'reto_nuevo', vars: { original: original.pct, reto: reto.pct }, accion: { tipo: 'intento', datos: { tipo: 'reto', materia: temaReto.id } } };
  }
  const debil = modelo.temas.filter(t => t.vistas === t.preguntas && t.pct < 90).sort((a, b) => a.pct - b.pct)[0];
  if (debil) return { clave: 'debil', vars: { tema: debil.titulo, pct: debil.pct }, accion: { tipo: 'intento', datos: { tipo: 'errores', materia: debil.materia, tema: debil.tema } }, tema: { materia: debil.materia, tema: debil.tema } };
  const plan = planDe(db, usuarioId, paquete, ahoraMs);
  if (plan.elegido && plan.ritmo === 'atrasado' && sigue) return { clave: 'atrasado', vars: { meta: plan.metaHoy }, accion: irAlSiguiente };
  if (sigue?.tipo === 'examen') return { clave: 'examen', vars: {}, accion: irAlSiguiente };
  if (sigue?.tipo === 'tema') return { clave: 'sigue', vars: { tema: sigue.titulo }, accion: irAlSiguiente };
  return { clave: 'listo', vars: {}, accion: { tipo: 'intento', datos: { tipo: 'instructor' } } };
}

function consejoDeTema(modelo, paquete, materia, t) {
  const r = modelo.repetidas.find(x => x.materia === materia && x.tema === t.id) ?? null;
  const idea = r ?? modelo.ideas.find(x => x.materia === materia && x.tema === t.id) ?? null;
  const dominio = modelo.temas.find(x => x.materia === materia && x.tema === t.id) ?? null;
  if (idea) {
    const tarjeta = tarjetaPara(t, [idea.idea, paquete.preguntas.get(idea.pregunta)?.original.explicacion].join(' '));
    return {
      clave: 'tema_error', vars: { idea: idea.idea ?? '', numero: paquete.preguntas.get(idea.pregunta)?.original.numero ?? '', tarjeta: tarjeta?.titulo ?? '' },
      accion: { tipo: 'intento', datos: { tipo: 'errores', materia, tema: t.id } }, tarjeta: tarjeta ? { indice: tarjeta.indice, titulo: tarjeta.titulo } : null,
    };
  }
  if (dominio && dominio.pct >= 90) return { clave: 'tema_dominado', vars: { pct: dominio.pct }, accion: { tipo: 'intento', datos: { tipo: 'reto', materia, tema: t.id } } };
  if (modelo.prisa.activa) return { clave: 'tema_prisa', vars: {}, accion: null };
  return { clave: dominio ? 'tema_sigue' : 'tema_nuevo', vars: { pct: dominio?.pct ?? 0 }, accion: null };
}

// Lo que el instructor «nota» (para mostrar debajo del consejo): solo cifras y claves (la pantalla pone el texto).
function observaciones(m) {
  const lista = [];
  if (m.hora && m.hora.n >= 10) lista.push({ clave: 'hora', vars: { franja: m.hora.franja, pct: m.hora.pct } });
  if (m.prisa.rapidasMal) lista.push({ clave: 'rapidas', vars: { n: m.prisa.rapidasMal } });
  if (m.formatos.reto.n >= 3) lista.push({ clave: 'formatos', vars: { original: m.formatos.original.pct, reto: m.formatos.reto.pct } });
  if (m.ideas[0]) lista.push({ clave: 'idea', vars: { idea: m.ideas[0].idea, n: m.ideas[0].fallos } });
  return lista.slice(0, 4);
}

// Lo que viaja a la pantalla del modelo (sin las listas largas).
export function resumenModelo(m) {
  return {
    respuestas: m.respuestas, aciertos: m.aciertos, pct: m.pct, estilo: m.estilo, repasoHoy: m.repasoHoy, hoy: m.hoy, prisa: m.prisa.activa,
    hora: m.hora?.franja ?? null, formatos: m.formatos,
    temas: m.temas.map(t => ({ materia: t.materia, tema: t.tema, titulo: t.titulo, pct: t.pct, vistas: t.vistas, preguntas: t.preguntas })),
  };
}

// ---------- 3. «Explícamelo de otra forma» (sin IA) ----------
// La respuesta de verdad que dio el alumno en SU intento (si no respondió esa pregunta ahí: 404). → { fila, q, elegida, modo }.
export function respuestaDelAlumno(db, usuarioId, paquete, intentoId, preguntaId) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const id = Number(intentoId);
  const intento = Number.isSafeInteger(id) ? db.prepare('SELECT id, tipo FROM academia_intentos WHERE id = ? AND usuario_id = ?').get(id, usuarioId) : null;
  if (!intento || typeof preguntaId !== 'string') throw new ErrorHttp(404, 'no_existe');
  const r = db.prepare('SELECT elegida, correcta FROM academia_respuestas WHERE intento_id = ? AND usuario_id = ? AND pregunta = ? ORDER BY id LIMIT 1').get(intento.id, usuarioId, preguntaId);
  const q = paquete.preguntas.get(preguntaId);
  if (!r || !q) throw new ErrorHttp(404, 'no_existe');
  return { intento, q, elegida: r.elegida, acierto: r.correcta === 1, modo: intento.tipo === 'reto' ? MODO_RETO : 'original' };
}

// Cuántas veces eligió esa misma opción mala en esa pregunta (en todos sus intentos).
function vecesMismaOpcion(db, usuarioId, preguntaId, elegida) {
  return db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas WHERE usuario_id = ? AND pregunta = ? AND elegida = ? AND correcta = 0').get(usuarioId, preguntaId, elegida).n;
}

// La explicación de otra forma, sin IA: lo que el paquete ya trae, elegido para SU error.
//  { estilo, idea, trampa, sencilla, tarjeta, veces, acierto } (los textos del paquete, tal cual).
export function reexplicarSinIa(db, usuarioId, paquete, { q, elegida, acierto, modo }, estilo) {
  const lugar = paquete.deTema.get(q.id);
  const reto = opcionRetoDe(q, elegida);
  const idea = acierto ? null : ideaDe(q, elegida);
  const tema = temaDe(paquete, lugar?.materia, lugar?.tema);
  const correcta = q.original.opciones.find(o => o.letra === q.original.correcta)?.texto ?? '';
  const tarjeta = tarjetaPara(tema, [idea, q.original.enunciado, correcta, q.original.explicacion].filter(Boolean).join(' '));
  return {
    estilo, modo, acierto, idea, trampa: reto?.trampa ?? null, sencilla: q.sencilla, correcta, elegidaTexto: acierto ? correcta : textoDeOpcion(q, elegida),
    tarjeta, tema: lugar ? { materia: lugar.materia, tema: lugar.tema, titulo: tema?.titulo ?? null } : null,
    veces: acierto ? 0 : vecesMismaOpcion(db, usuarioId, q.id, elegida),
  };
}

// ---------- 4. Una duda escrita, sin IA: la tarjeta del tema que más se parece ----------
export function dudaSinIa(paquete, materia, tema, texto) {
  const t = temaDe(paquete, materia, tema);
  if (!t) throw new ErrorHttp(404, 'no_existe');
  return { tarjeta: tarjetaPara(t, texto), tema: { materia, tema: t.id, titulo: t.titulo } };
}
// Las tarjetas de un tema que más se parecen a un texto (para mandarlas a la IA como el ÚNICO material), hasta maxBytes.
export function tarjetasParaDuda(paquete, materia, tema, texto, maxBytes) {
  const t = temaDe(paquete, materia, tema);
  if (!t) throw new ErrorHttp(404, 'no_existe');
  const buscadas = raices(texto);
  const puntuadas = (t.secciones ?? []).map((s, i) => {
    const propias = raices(textoDeSeccion(s));
    let n = 0;
    for (const p of buscadas) if (propias.has(p)) n += 1;
    return { i, n, s };
  }).sort((a, b) => b.n - a.n || a.i - b.i);
  const lista = [];
  let bytes = 0;
  for (const x of puntuadas) {
    const contenido = textoDeSeccion(x.s);
    const largo = Buffer.byteLength(contenido);
    if (bytes + largo > maxBytes) {
      if (!lista.length) lista.push({ titulo: x.s.titulo ?? '', texto: cortarBytes(contenido, maxBytes) });
      break;
    }
    lista.push({ titulo: x.s.titulo ?? '', texto: contenido });
    bytes += largo;
    if (lista.length >= 3) break;
  }
  return { titulo: t.titulo, tarjetas: lista };
}
export function cortarBytes(texto, maxBytes) {
  let s = String(texto ?? '');
  while (Buffer.byteLength(s) > maxBytes) s = s.slice(0, Math.max(0, Math.floor(s.length * 0.9) - 1));
  return s;
}

