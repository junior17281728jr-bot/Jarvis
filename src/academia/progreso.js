// Academia: el camino de cada alumno (temas que se abren uno tras otro), las prácticas y exámenes, la fila de repaso y
// el progreso. TODO se lee y se escribe con el id del alumno que entró (la sesión): nunca con un id que mande la
// pantalla. Las vistas de otros alumnos son solo para el administrador (src/api/academia.js, rutas { admin: true }).
// Las preguntas se muestran TAL CUAL las trae el paquete: solo cambia el ORDEN de las preguntas (nunca el de sus
// opciones: las letras y la explicación original se refieren a ellas). La respuesta correcta y las explicaciones
// nunca viajan antes de responder: la nota la pone el servidor.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste, refFigura, figuraDe, librosDe, audioDe } from './paquetes.js';
import { MODO_ORIGINAL, MODO_RETO, tieneReto, opcionesReto, claveDeLetra, letraDeClave, opcionRetoDe } from './reto.js';
import { puntosDebiles, debilDe, preguntasParaPracticar } from './memoria.js';
import { avataresDe } from '../cuentas/perfil.js';

// 0.8.0: «reto» = practicar un tema (o toda una materia, sin tema) en Modo reto; «errores» = practicar lo que más se
// falla (de un intento, de un tema, de una materia o de todo). Los dos son práctica: no aprueban temas ni exámenes
// (eso solo lo hacen «tema» y «examen», siempre con las 3 opciones originales del Test Guide).
export const TIPOS_INTENTO = Object.freeze(['tema', 'examen', 'repaso', 'reto', 'errores']);
export const modoDeTipo = tipo => (tipo === 'reto' ? MODO_RETO : MODO_ORIGINAL);
export const ESTADOS_TEMA = Object.freeze(['bloqueado', 'abierto', 'aprobado']);
export const ESTADOS_MATERIA = Object.freeze(['vacia', 'bloqueada', 'abierta', 'aprobada']);
export const NOMBRE_POR_DEFECTO = 'Academia de Aviación';
export const UMBRAL_POR_DEFECTO = 90;
export const PUNTOS_POR_ACIERTO = 10;
// Repaso espaciado (cajas): fallar la manda a la caja 1 (para hoy); acertar la sube, y vuelve a salir después de
// 1, 2, 4, 8 o 16 días. En la caja 6 ya se domina y sale de la fila.
const DIAS_POR_CAJA = [0, 1, 2, 4, 8, 16];
export const CAJA_DOMINADA = 6;
const REPASO_MAXIMO = 20;
const EN_LINEA_MS = 10 * 60 * 1000;
const DIA_MS = 24 * 3600 * 1000;

// El día en Santo Domingo (UTC-4 todo el año, sin horario de verano): la racha cuenta los días de allá.
export const diaDe = ms => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);

export function ajustesAcademia(db) {
  const nombre = leerAjuste(db, 'academia.nombre');
  const umbral = Number(leerAjuste(db, 'academia.aprobar_pct'));
  return {
    nombre: nombre && nombre.trim() ? nombre : NOMBRE_POR_DEFECTO,
    umbral: Number.isSafeInteger(umbral) && umbral >= 50 && umbral <= 100 ? umbral : UMBRAL_POR_DEFECTO,
  };
}
// 0.7.2: el panel «Grupo» que ven los alumnos (encendido salvo que el administrador lo apague). Va aparte de los
// ajustes de arriba (su forma no cambia).
export const grupoEncendido = db => leerAjuste(db, 'academia.grupo') !== '0';
export function encenderGrupo(db, encendido) {
  if (typeof encendido !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, 'academia.grupo', encendido ? '1' : '0');
  return encendido;
}
export function guardarAjustesAcademia(db, { nombre, umbral }) {
  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 60 || /[\u0000-\u001f]/.test(nombre)) throw new ErrorHttp(400, 'nombre_no_valido');
    guardarAjuste(db, 'academia.nombre', nombre.trim());
  }
  if (umbral !== undefined) {
    if (!Number.isSafeInteger(umbral) || umbral < 50 || umbral > 100) throw new ErrorHttp(400, 'umbral_no_valido');
    guardarAjuste(db, 'academia.aprobar_pct', umbral);
  }
  return ajustesAcademia(db);
}

const pct = (bien, total) => (total > 0 ? Math.floor((bien * 100) / total) : 0);
const aprueba = (aciertos, total, umbral) => total > 0 && aciertos * 100 >= umbral * total;

// Una pregunta para mostrar ANTES de responder: lo original, sin la respuesta ni las explicaciones.
// 0.8.0: en Modo reto (intento de tipo «reto»), las opciones son la correcta tal cual y las 2 del reto, mezcladas (A, B, C).
export function vistaPregunta(paquete, id, { intentoId = null, modo = MODO_ORIGINAL } = {}) {
  const q = paquete?.preguntas.get(id);
  if (!q) return { id, falta: true };
  const o = q.original;
  const lugar = paquete.deTema.get(id);
  const reto = modo === MODO_RETO ? opcionesReto(q, intentoId, id) : null;
  return {
    id, origen: q.origen, materia: lugar?.materia ?? null, tema: lugar?.tema ?? null,
    numero: o.numero ?? null, seccion: o.seccion ?? null, enunciado: o.enunciado, pagina: o.pagina ?? null,
    ...(reto ? { modo: MODO_RETO } : {}),
    opciones: reto ? reto.map(op => ({ letra: op.letra, texto: op.texto })) : o.opciones.map(op => ({ letra: op.letra, texto: op.texto })),
    figura: o.figura != null ? figuraVista(paquete, id, o.figura) : null,
    fuente: q.origen === 'poh' && q.fuente ? fuenteDe(paquete, q.fuente, paquete.dePaquete?.get(id)) : null,
  };
}
// 0.7.1: con varias versiones en uso, la figura lleva «ref» (de qué versión es); con una sola, igual que antes.
function figuraVista(paquete, id, numero) {
  const ref = refFigura(paquete, id, numero);
  return { numero, titulo: figuraDe(paquete, id, numero)?.titulo ?? null, ...(ref ? { ref } : {}) };
}
function fuenteDe(paquete, f, pid = null) {
  return { libro: librosDe(paquete, pid).get(f.libro)?.titulo ?? f.libro, capitulo: f.capitulo ?? null, seccion: f.seccion ?? null, pagina: f.pagina ?? null };
}
// Lo que se ve DESPUÉS de responder. «elegida» es la opción de verdad guardada (en Modo reto, la letra original de la
// correcta o R1/R2); lo que vuelve usa las letras que se VIERON. En Modo reto trae además por qué cada opción del reto es
// incorrecta (y la trampa que tiende).
export function retroalimentacion(paquete, id, elegida, { intentoId = null, modo = MODO_ORIGINAL } = {}) {
  const q = paquete?.preguntas.get(id);
  if (!q) return null;
  const correcta = q.original.correcta;
  const base = { explicacion: q.original.explicacion ?? null, sencilla: q.sencilla, ingles: Array.isArray(q.ingles) ? q.ingles : [] };
  const vistas = modo === MODO_RETO ? opcionesReto(q, intentoId, id) : null;
  if (vistas) {
    const mala = opcionRetoDe(q, elegida);
    return {
      // letraOriginal: la letra de la correcta en el Test Guide (las explicaciones la nombran así; aquí se vio con otra).
      ...base, modo: MODO_RETO, elegida: letraDeClave(vistas, elegida), acierto: elegida === correcta, correcta: letraDeClave(vistas, correcta), letraOriginal: correcta,
      idea: elegida !== correcta ? mala?.porque_es_incorrecta ?? null : null,
      trampa: elegida !== correcta ? mala?.trampa ?? null : null,
      reto: vistas.filter(o => o.clave !== correcta).map(o => {
        const r = opcionRetoDe(q, o.clave);
        return { letra: o.letra, texto: o.texto, porque: r?.porque_es_incorrecta ?? null, trampa: r?.trampa ?? null };
      }),
    };
  }
  return { ...base, elegida, acierto: elegida === correcta, correcta, idea: elegida !== correcta ? q.errores?.[elegida] ?? null : null };
}
const vistaSecciones = (paquete, lista, pid = null) => (lista ?? []).map(s => ({
  titulo: s.titulo, texto: s.texto ?? null, nota: s.nota ?? null, fuentes: (s.fuentes ?? []).map(f => fuenteDe(paquete, f, pid)),
  // 0.7.2: una tarjeta ya partida trae sus partes; las secciones de texto largo las parte la pantalla (public/tarjetas.js).
  ...(s.tipo === 'tarjeta' ? {
    tipo: 'tarjeta', puntos: [...s.puntos], recuerda: s.recuerda ?? null, ejemplo: s.ejemplo ?? null,
    ingles: Array.isArray(s.ingles) ? s.ingles.map(w => ({ palabra: w.palabra, pronunciacion: w.pronunciacion ?? null, significado: w.significado ?? null, ejemplo: w.ejemplo ?? null })) : [],
    visual: s.visual ? { tipo: s.visual.tipo, parametros: s.visual.parametros ?? {} } : null,
  } : {}),
}));

export function temasAprobados(db, usuarioId) {
  const filas = db.prepare(`SELECT materia, tema, MAX(aprobado) AS aprobado, MAX(CASE WHEN total > 0 THEN aciertos * 100 / total END) AS mejor
    FROM academia_intentos WHERE usuario_id = ? AND tipo = 'tema' AND terminado_en IS NOT NULL GROUP BY materia, tema`).all(usuarioId);
  return new Map(filas.map(f => [`${f.materia}/${f.tema}`, { aprobado: f.aprobado === 1, mejor: f.mejor }]));
}
export function examenes(db, usuarioId) {
  const filas = db.prepare(`SELECT materia, MAX(aprobado) AS aprobado, MAX(CASE WHEN total > 0 THEN aciertos * 100 / total END) AS mejor, COUNT(*) AS veces
    FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND terminado_en IS NOT NULL GROUP BY materia`).all(usuarioId);
  return new Map(filas.map(f => [f.materia, { aprobado: f.aprobado === 1, mejor: f.mejor, veces: f.veces }]));
}

export function puntosYRacha(db, usuarioId, ahoraMs = Date.now()) {
  const puntos = (db.prepare('SELECT COALESCE(SUM(correcta), 0) AS n FROM academia_respuestas WHERE usuario_id = ?').get(usuarioId).n) * PUNTOS_POR_ACIERTO;
  const dias = db.prepare('SELECT DISTINCT dia FROM academia_respuestas WHERE usuario_id = ? ORDER BY dia DESC LIMIT 400').all(usuarioId).map(f => f.dia);
  let racha = 0;
  let esperado = diaDe(ahoraMs);
  if (dias[0] !== esperado) esperado = diaDe(ahoraMs - DIA_MS); // si hoy todavía no estudió, la racha de ayer sigue viva
  for (const dia of dias) {
    if (dia !== esperado) break;
    racha += 1;
    esperado = new Date(Date.parse(`${esperado}T00:00:00Z`) - DIA_MS).toISOString().slice(0, 10);
  }
  return { puntos, racha, hoy: dias[0] === diaDe(ahoraMs) };
}

// 0.8.0: el repaso empieza por lo que MÁS se ha fallado (la memoria de errores), y después por lo que venció antes.
function repasoPendiente(db, usuarioId, paquete, ahoraMs) {
  if (!paquete) return [];
  return db.prepare('SELECT pregunta FROM academia_repaso WHERE usuario_id = ? AND caja < ? AND vence_en <= ? ORDER BY fallos DESC, vence_en, pregunta LIMIT 200')
    .all(usuarioId, CAJA_DOMINADA, new Date(ahoraMs).toISOString()).map(f => f.pregunta).filter(id => paquete.preguntas.has(id));
}

// El camino: las 11 materias en su orden, cada tema con su estado. Un tema se abre cuando se aprobó el anterior
// (las materias sin contenido en el paquete se saltan). El examen de una materia se abre con todos sus temas aprobados.
export function camino(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const { nombre, umbral } = ajustesAcademia(db);
  const base = { nombre, umbral, ...puntosYRacha(db, usuarioId, ahoraMs) };
  if (!paquete) return { ...base, paquete: null, materias: [], repaso: 0 };
  const aprobados = temasAprobados(db, usuarioId);
  const deExamen = examenes(db, usuarioId);
  let anteriorAprobado = true;
  const vistos = videosVistos(db, usuarioId);
  const leidos = temasLeidos(db, usuarioId);
  const memoria = puntosDebiles(db, usuarioId, paquete);
  const materias = paquete.materias.map(m => {
    const temas = m.temas.map(t => {
      const a = aprobados.get(`${m.id}/${t.id}`);
      // 0.7.2: un tema SIN preguntas se aprueba al terminar de leer su lección (si no, el camino quedaba trancado ahí).
      const aprobado = a?.aprobado === true || (!t.preguntas.length && leidos.has(`${m.id}/${t.id}`));
      const estadoTema = aprobado ? 'aprobado' : anteriorAprobado ? 'abierto' : 'bloqueado';
      anteriorAprobado = aprobado;
      return { id: t.id, titulo: t.titulo, estado: estadoTema, mejor: a?.mejor ?? null, preguntas: t.preguntas.length };
    });
    const todos = temas.length > 0 && temas.every(t => t.estado === 'aprobado');
    const estadoMateria = !temas.length ? 'vacia' : todos ? 'aprobada' : temas.some(t => t.estado !== 'bloqueado') ? 'abierta' : 'bloqueada';
    const ex = deExamen.get(m.id);
    const aprobadosN = temas.filter(t => t.estado === 'aprobado').length;
    const audio = audioDe(paquete, m.paquete, m.audio);
    const video = resumenVideo(paquete, m, vistos);
    // 0.8.0: cuántas preguntas tienen Modo reto (de los temas abiertos) y el punto débil del alumno en la materia.
    const abiertos = new Set(temas.filter(t => t.estado !== 'bloqueado').map(t => t.id));
    const retoN = m.temas.filter(t => abiertos.has(t.id)).reduce((n, t) => n + t.preguntas.filter(id => tieneReto(paquete.preguntas.get(id))).length, 0);
    const debil = debilDe(memoria, paquete, { materia: m.id });
    return {
      id: m.id, estado: estadoMateria, temas, pct: pct(aprobadosN, temas.length), ...(audio ? { audio } : {}), ...(video ? { video } : {}),
      reto: retoN, ...(debil ? { debil } : {}),
      examen: { disponible: todos, preguntas: m.temas.reduce((n, t) => n + t.preguntas.length, 0), mejor: ex?.mejor ?? null, aprobado: ex?.aprobado === true, veces: ex?.veces ?? 0 },
    };
  });
  return { ...base, paquete: { id: paquete.id, nombre: paquete.nombre, muestra: paquete.muestra }, materias, repaso: repasoPendiente(db, usuarioId, paquete, ahoraMs).length };
}

// ---------- 0.7.2: el «Video resumen» de cada materia ----------
// Lo que el camino necesita saber del video (sin las escenas): cuántas escenas, si tiene su narración y cuánto dura.
function videoDeMateria(paquete, m) {
  const v = m?.video ?? null;
  const audio = audioDe(paquete, m?.paquete, v?.audio) ?? (v ? null : audioDe(paquete, m?.paquete, m?.audio));
  const escenas = Array.isArray(v?.escenas) ? v.escenas : [];
  if (!escenas.length && !audio) return null;
  return { v, audio, escenas };
}
function resumenVideo(paquete, m, vistos = []) {
  const x = videoDeMateria(paquete, m);
  if (!x) return null;
  const duracion = x.escenas.length ? Math.round(Math.max(...x.escenas.map(e => e.fin_s))) : null;
  return { escenas: x.escenas.length, audio: Boolean(x.audio), duracion, visto: vistos.includes(m.id) };
}
// El video de una materia para el reproductor: las escenas con sus tiempos y la narración (si ya llegó el mp3).
export function videoMateria(db, usuarioId, paquete, materia) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const m = paquete.materias.find(x => x.id === materia);
  const x = m && m.temas.length ? videoDeMateria(paquete, m) : null;
  if (!x) throw new ErrorHttp(404, 'no_existe');
  return {
    materia, titulo: x.v?.titulo ?? null, audio: x.audio, visto: videosVistos(db, usuarioId).includes(materia),
    escenas: x.escenas.map((e, i) => ({
      id: `escena-${i + 1}`, inicio_s: e.inicio_s, fin_s: e.fin_s, subtitulo: e.subtitulo ?? '', texto_pantalla: e.texto_pantalla ?? '',
      texto_narracion: e.texto_narracion ?? null, visual: e.visual?.tipo ? { tipo: e.visual.tipo, parametros: e.visual.parametros ?? {} } : null,
    })),
  };
}
// Los videos que el alumno ya vio (en ajustes, sin cambio de base): el círculo del video sale dorado.
const claveVistos = usuarioId => `academia.videos_vistos.${Number(usuarioId)}`;
export function videosVistos(db, usuarioId) {
  try { const l = JSON.parse(leerAjuste(db, claveVistos(usuarioId)) ?? '[]'); return Array.isArray(l) ? l.filter(x => typeof x === 'string') : []; } catch { return []; }
}
export function marcarVideoVisto(db, usuarioId, paquete, materia) {
  videoMateria(db, usuarioId, paquete, materia); // que exista
  const vistos = videosVistos(db, usuarioId);
  if (!vistos.includes(materia)) guardarAjuste(db, claveVistos(usuarioId), JSON.stringify([...vistos, materia].slice(-20)));
  return { visto: true };
}

// ---------- 0.7.2: los temas sin preguntas se aprueban al leer la lección completa ----------
const claveLeidos = usuarioId => `academia.temas_leidos.${Number(usuarioId)}`;
export function temasLeidos(db, usuarioId) {
  try { const l = JSON.parse(leerAjuste(db, claveLeidos(usuarioId)) ?? '[]'); return new Set(Array.isArray(l) ? l.filter(x => typeof x === 'string') : []); } catch { return new Set(); }
}
export function marcarTemaLeido(db, usuarioId, paquete, materia, tema) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const { t } = buscarTema(paquete, materia, tema);
  if (estadoDelTema(db, usuarioId, paquete, materia, tema) === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
  const leidos = temasLeidos(db, usuarioId);
  const clave = `${materia}/${t.id}`;
  if (!leidos.has(clave)) guardarAjuste(db, claveLeidos(usuarioId), JSON.stringify([...leidos, clave].slice(-3000)));
  return { leido: true, estado: estadoDelTema(db, usuarioId, paquete, materia, tema) };
}

function buscarTema(paquete, materia, tema) {
  const m = paquete?.materias.find(x => x.id === materia);
  const t = m?.temas.find(x => x.id === tema);
  if (!t) throw new ErrorHttp(404, 'no_existe');
  return { m, t };
}
function estadoDelTema(db, usuarioId, paquete, materia, tema) {
  const c = camino(db, usuarioId, paquete);
  return c.materias.find(x => x.id === materia)?.temas.find(x => x.id === tema)?.estado ?? null;
}

// La lección de un tema: sus secciones con de dónde sale cada una (libro, capítulo, sección, página).
export function leccion(db, usuarioId, paquete, materia, tema) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const { t } = buscarTema(paquete, materia, tema);
  const estadoTema = estadoDelTema(db, usuarioId, paquete, materia, tema);
  if (estadoTema === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
  const audio = audioDe(paquete, t.paquete, t.audio);
  // 0.8.0: cuántas tienen Modo reto y el punto débil del alumno en este tema («Tu punto débil: …»).
  const debil = debilDe(puntosDebiles(db, usuarioId, paquete), paquete, { materia, tema: t.id });
  return {
    materia, tema: t.id, titulo: t.titulo, estado: estadoTema, secciones: vistaSecciones(paquete, t.secciones, t.paquete), preguntas: t.preguntas.length,
    reto: t.preguntas.filter(id => tieneReto(paquete.preguntas.get(id))).length, ...(audio ? { audio } : {}), ...(debil ? { debil } : {}),
  };
}

// Baraja (Fisher-Yates) con el azar que se le dé (las pruebas usan uno fijo).
function barajar(lista, azar) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function crearIntento(db, usuarioId, paquete, { tipo, materia = null, tema = null, intento: intentoBase = null }, { azar = Math.random, ahoraMs = Date.now() } = {}) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  if (!TIPOS_INTENTO.includes(tipo)) throw new ErrorHttp(400, 'datos_no_validos');
  let ids;
  if (tipo === 'tema') {
    const { t } = buscarTema(paquete, materia, tema);
    if (estadoDelTema(db, usuarioId, paquete, materia, tema) === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
    ids = t.preguntas;
  } else if (tipo === 'examen') {
    const m = paquete.materias.find(x => x.id === materia);
    if (!m || !m.temas.length) throw new ErrorHttp(404, 'no_existe');
    const c = camino(db, usuarioId, paquete, ahoraMs).materias.find(x => x.id === materia);
    if (!c.examen.disponible) throw new ErrorHttp(403, 'examen_bloqueado');
    ids = m.temas.flatMap(t => t.preguntas);
    tema = null;
  } else if (tipo === 'reto') {
    // Un tema abierto, o toda una materia (las preguntas de sus temas abiertos): solo las que traen su Modo reto.
    const m = paquete.materias.find(x => x.id === materia);
    if (!m || !m.temas.length) throw new ErrorHttp(404, 'no_existe');
    const c = camino(db, usuarioId, paquete, ahoraMs).materias.find(x => x.id === materia);
    let temas;
    if (tema) {
      const { t } = buscarTema(paquete, materia, tema);
      if (c.temas.find(x => x.id === t.id)?.estado === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
      temas = [t];
    } else {
      const abiertos = new Set(c.temas.filter(x => x.estado !== 'bloqueado').map(x => x.id));
      temas = m.temas.filter(t => abiertos.has(t.id));
      if (!temas.length) throw new ErrorHttp(403, 'tema_bloqueado');
      tema = null;
    }
    ids = temas.flatMap(t => t.preguntas).filter(id => tieneReto(paquete.preguntas.get(id)));
    if (!ids.length) throw new ErrorHttp(409, 'sin_reto');
  } else if (tipo === 'errores') {
    // «Practicar mis errores»: las falladas de un intento suyo, o lo que más falla (de un tema, una materia o todo).
    ids = preguntasParaPracticar(db, usuarioId, paquete, { intento: intentoBase, materia, tema });
    if (intentoBase != null) {
      const f = intentoDe(db, usuarioId, intentoBase);
      materia = f.materia;
      tema = f.tema;
    }
    if (!ids.length) throw new ErrorHttp(409, 'sin_errores');
  } else {
    ids = repasoPendiente(db, usuarioId, paquete, ahoraMs).slice(0, REPASO_MAXIMO);
    materia = null;
    tema = null;
  }
  if (!ids.length) throw new ErrorHttp(409, tipo === 'repaso' ? 'repaso_vacio' : 'sin_preguntas');
  // 0.8.0: el repaso y «practicar mis errores» van en orden de prioridad (lo más fallado primero), sin mezclar.
  const porPrioridad = tipo === 'repaso' || tipo === 'errores';
  let orden = porPrioridad ? [...ids] : barajar(ids, azar);
  // Las mismas preguntas, en OTRO orden que la vez anterior (el azar puede repetir uno: entonces se corre una).
  const anterior = porPrioridad ? null : db.prepare('SELECT orden FROM academia_intentos WHERE usuario_id = ? AND tipo = ? AND materia IS ? AND tema IS ? ORDER BY id DESC LIMIT 1')
    .get(usuarioId, tipo, materia, tema);
  if (anterior && orden.length > 1 && anterior.orden === JSON.stringify(orden)) orden = [...orden.slice(1), orden[0]];
  const { umbral } = ajustesAcademia(db);
  const r = db.prepare(`INSERT INTO academia_intentos (usuario_id, paquete_id, tipo, materia, tema, orden, total, umbral, empezado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, paquete.id, tipo, materia, tema, JSON.stringify(orden), orden.length, umbral, new Date(ahoraMs).toISOString());
  return verIntento(db, usuarioId, paquete, Number(r.lastInsertRowid));
}

// Un intento del alumno que entró (si es de otro: «no existe»).
function intentoDe(db, usuarioId, intentoId) {
  const id = Number(intentoId);
  const fila = Number.isSafeInteger(id) ? db.prepare('SELECT * FROM academia_intentos WHERE id = ? AND usuario_id = ?').get(id, usuarioId) : null;
  if (!fila) throw new ErrorHttp(404, 'no_existe');
  return fila;
}

export function verIntento(db, usuarioId, paquete, intentoId) {
  const fila = intentoDe(db, usuarioId, intentoId);
  const respuestas = new Map(db.prepare('SELECT pregunta, elegida FROM academia_respuestas WHERE intento_id = ?').all(fila.id).map(f => [f.pregunta, f.elegida]));
  const orden = JSON.parse(fila.orden);
  const como = { intentoId: fila.id, modo: modoDeTipo(fila.tipo) };
  return {
    id: fila.id, tipo: fila.tipo, modo: como.modo, materia: fila.materia, tema: fila.tema, total: fila.total, respondidas: fila.respondidas, aciertos: fila.aciertos,
    umbral: fila.umbral, terminado: fila.terminado_en != null,
    preguntas: orden.map(id => ({ ...vistaPregunta(paquete, id, como), respuesta: respuestas.has(id) ? retroalimentacion(paquete, id, respuestas.get(id), como) : null })),
  };
}

function anotarRepaso(db, usuarioId, q, lugar, acierto, ahoraMs) {
  const ya = db.prepare('SELECT * FROM academia_repaso WHERE usuario_id = ? AND pregunta = ?').get(usuarioId, q);
  const momento = new Date(ahoraMs).toISOString();
  if (!acierto) {
    if (ya) db.prepare('UPDATE academia_repaso SET caja = 1, vence_en = ?, fallos = fallos + 1, actualizado_en = ? WHERE usuario_id = ? AND pregunta = ?').run(momento, momento, usuarioId, q);
    else db.prepare('INSERT INTO academia_repaso (usuario_id, pregunta, materia, tema, caja, vence_en, fallos, actualizado_en) VALUES (?, ?, ?, ?, 1, ?, 1, ?)').run(usuarioId, q, lugar?.materia ?? null, lugar?.tema ?? null, momento, momento);
    return;
  }
  if (!ya) return;
  const caja = Math.min(ya.caja + 1, CAJA_DOMINADA);
  const vence = new Date(ahoraMs + (DIAS_POR_CAJA[caja] ?? 32) * DIA_MS).toISOString();
  db.prepare('UPDATE academia_repaso SET caja = ?, vence_en = ?, aciertos = aciertos + 1, actualizado_en = ? WHERE usuario_id = ? AND pregunta = ?').run(caja, vence, momento, usuarioId, q);
}

export function responder(db, usuarioId, paquete, intentoId, { pregunta, elegida }, { ahoraMs = Date.now() } = {}) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  return enTransaccion(db, () => {
    const fila = intentoDe(db, usuarioId, intentoId);
    if (typeof pregunta !== 'string' || !JSON.parse(fila.orden).includes(pregunta)) throw new ErrorHttp(400, 'pregunta_no_es_del_intento');
    const como = { intentoId: fila.id, modo: modoDeTipo(fila.tipo) };
    const ya = db.prepare('SELECT elegida FROM academia_respuestas WHERE intento_id = ? AND pregunta = ?').get(fila.id, pregunta);
    // Dos toques seguidos: la primera respuesta es la que vale.
    if (ya) return { respuesta: retroalimentacion(paquete, pregunta, ya.elegida, como), respondidas: fila.respondidas, aciertos: fila.aciertos, total: fila.total };
    if (fila.terminado_en) throw new ErrorHttp(409, 'intento_terminado');
    const q = paquete.preguntas.get(pregunta);
    if (!q) throw new ErrorHttp(409, 'pregunta_no_disponible');
    // En Modo reto llega la letra que se vio: se guarda la opción de verdad (la correcta original, R1 o R2).
    const vistas = como.modo === MODO_RETO ? opcionesReto(q, fila.id, pregunta) : null;
    if (como.modo === MODO_RETO && !vistas) throw new ErrorHttp(409, 'pregunta_no_disponible');
    if (typeof elegida !== 'string' || !(vistas ? vistas.some(o => o.letra === elegida) : q.original.opciones.some(o => o.letra === elegida))) throw new ErrorHttp(400, 'opcion_no_valida');
    if (vistas) elegida = claveDeLetra(vistas, elegida);
    const acierto = elegida === q.original.correcta;
    const lugar = paquete.deTema.get(pregunta);
    db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(fila.id, usuarioId, pregunta, lugar?.materia ?? null, lugar?.tema ?? null, elegida, acierto ? 1 : 0, diaDe(ahoraMs), new Date(ahoraMs).toISOString());
    db.prepare('UPDATE academia_intentos SET respondidas = respondidas + 1, aciertos = aciertos + ? WHERE id = ?').run(acierto ? 1 : 0, fila.id);
    anotarRepaso(db, usuarioId, pregunta, lugar, acierto, ahoraMs);
    return { respuesta: retroalimentacion(paquete, pregunta, elegida, como), respondidas: fila.respondidas + 1, aciertos: fila.aciertos + (acierto ? 1 : 0), total: fila.total };
  });
}

export function terminar(db, usuarioId, paquete, intentoId, { ahoraMs = Date.now() } = {}) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const fila = enTransaccion(db, () => {
    const f = intentoDe(db, usuarioId, intentoId);
    if (f.terminado_en) return f;
    if (f.respondidas < f.total) throw new ErrorHttp(409, 'faltan_respuestas');
    const aprobado = ['repaso', 'reto', 'errores'].includes(f.tipo) ? null : aprueba(f.aciertos, f.total, f.umbral ?? UMBRAL_POR_DEFECTO) ? 1 : 0;
    db.prepare('UPDATE academia_intentos SET terminado_en = ?, aprobado = ? WHERE id = ?').run(new Date(ahoraMs).toISOString(), aprobado, f.id);
    return db.prepare('SELECT * FROM academia_intentos WHERE id = ?').get(f.id);
  });
  const respuestas = db.prepare('SELECT pregunta, elegida, correcta FROM academia_respuestas WHERE intento_id = ? ORDER BY id').all(fila.id);
  const como = { intentoId: fila.id, modo: modoDeTipo(fila.tipo) };
  // 0.8.0: la revisión completa (cada pregunta con lo que eligió, la correcta y las explicaciones), en el orden del intento.
  const elegidas = new Map(respuestas.map(r => [r.pregunta, r.elegida]));
  const revision = JSON.parse(fila.orden).filter(id => elegidas.has(id)).map(id => ({ ...vistaPregunta(paquete, id, como), respuesta: retroalimentacion(paquete, id, elegidas.get(id), como) }));
  const falladas = revision.filter(q => q.respuesta && !q.respuesta.acierto);
  let reexplicacion = [];
  if (fila.tipo === 'tema' && fila.aprobado !== 1) {
    const t = paquete.materias.find(m => m.id === fila.materia)?.temas.find(x => x.id === fila.tema);
    reexplicacion = vistaSecciones(paquete, t?.reexplicacion, t?.paquete);
  }
  return {
    id: fila.id, tipo: fila.tipo, modo: como.modo, materia: fila.materia, tema: fila.tema, total: fila.total, aciertos: fila.aciertos, pct: pct(fila.aciertos, fila.total),
    umbral: fila.umbral, aprobado: fila.aprobado == null ? null : fila.aprobado === 1, puntos: fila.aciertos * PUNTOS_POR_ACIERTO, falladas, revision, reexplicacion,
  };
}

// Cómo va cada materia: «dominio» = preguntas cuya ÚLTIMA respuesta fue correcta, sobre todas las de la materia.
export function porMateria(db, usuarioId, paquete) {
  const ultima = new Map();
  for (const r of db.prepare('SELECT pregunta, materia, correcta FROM academia_respuestas WHERE usuario_id = ? ORDER BY id').all(usuarioId)) ultima.set(r.pregunta, r);
  const totales = new Map(db.prepare('SELECT materia, COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien FROM academia_respuestas WHERE usuario_id = ? GROUP BY materia').all(usuarioId).map(f => [f.materia, f]));
  return (paquete?.materias ?? []).filter(m => m.temas.length).map(m => {
    const ids = m.temas.flatMap(t => t.preguntas);
    const bien = ids.filter(id => ultima.get(id)?.correcta === 1).length;
    const mal = ids.filter(id => ultima.get(id)?.correcta === 0).length;
    const t = totales.get(m.id);
    return { id: m.id, preguntas: ids.length, bien, mal, sinVer: ids.length - bien - mal, pct: pct(bien, ids.length), respuestas: t?.n ?? 0, aciertos: t?.bien ?? 0, pctRespuestas: pct(t?.bien ?? 0, t?.n ?? 0) };
  });
}

function debiles(db, usuarioId, paquete, limite = 30) {
  return db.prepare('SELECT pregunta, caja, fallos, aciertos, vence_en FROM academia_repaso WHERE usuario_id = ? AND caja < ? ORDER BY fallos DESC, vence_en LIMIT ?')
    .all(usuarioId, CAJA_DOMINADA, limite).filter(f => paquete?.preguntas.has(f.pregunta))
    .map(f => ({ ...vistaPregunta(paquete, f.pregunta), caja: f.caja, fallos: f.fallos, aciertos: f.aciertos, venceEn: f.vence_en }));
}

export function progreso(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const c = camino(db, usuarioId, paquete, ahoraMs);
  return {
    nombre: c.nombre, umbral: c.umbral, puntos: c.puntos, racha: c.racha, repaso: c.repaso, paquete: c.paquete,
    materias: porMateria(db, usuarioId, paquete).map(m => ({ ...m, examen: c.materias.find(x => x.id === m.id)?.examen ?? null, temas: c.materias.find(x => x.id === m.id)?.temas.map(t => ({ id: t.id, titulo: t.titulo, estado: t.estado, mejor: t.mejor })) ?? [] })),
    debiles: debiles(db, usuarioId, paquete),
    // 0.8.0: «Mis puntos débiles» (la memoria de errores: por pregunta, por idea equivocada y por tema).
    puntosDebiles: resumenDebiles(puntosDebiles(db, usuarioId, paquete), paquete),
  };
}

// Lo que se muestra de la memoria de errores (los primeros de cada lista, con la pregunta para mostrar).
export function resumenDebiles(memoria, paquete, { limite = 10 } = {}) {
  return {
    total: memoria.respuestas, fallos: memoria.fallos,
    preguntas: memoria.preguntas.slice(0, limite).map(x => ({ ...vistaPregunta(paquete, x.pregunta), veces: x.veces, fallos: x.fallos, ultima: x.ultima, superada: x.superada })),
    ideas: memoria.ideas.slice(0, limite),
    temas: memoria.temas.slice(0, limite),
  };
}

// ---------- Solo para el administrador ----------

function ultimaActividad(db) {
  const m = new Map();
  const poner = (id, fecha) => { if (fecha && (!m.get(id) || fecha > m.get(id))) m.set(id, fecha); };
  for (const f of db.prepare('SELECT id, ultimo_acceso AS f FROM usuarios').all()) poner(f.id, f.f);
  for (const f of db.prepare('SELECT usuario_id AS id, MAX(ultimo_uso) AS f FROM sesiones GROUP BY usuario_id').all()) poner(f.id, f.f);
  for (const f of db.prepare('SELECT usuario_id AS id, MAX(creada_en) AS f FROM academia_respuestas GROUP BY usuario_id').all()) poner(f.id, f.f);
  return m;
}

export function alumnos(db, paquete, ahoraMs = Date.now()) {
  const actividad = ultimaActividad(db);
  const temasHechos = new Map(db.prepare("SELECT usuario_id AS id, COUNT(DISTINCT materia || '/' || tema) AS n FROM academia_intentos WHERE tipo = 'tema' AND aprobado = 1 GROUP BY usuario_id").all().map(f => [f.id, f.n]));
  const resp = db.prepare('SELECT usuario_id AS id, materia, COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien FROM academia_respuestas GROUP BY usuario_id, materia').all();
  const totalTemas = (paquete?.materias ?? []).reduce((n, m) => n + m.temas.length, 0);
  const avatares = avataresDe(db);
  return db.prepare('SELECT id, nombre, nombre_visible, rol, activo FROM usuarios ORDER BY rol, nombre').all().map(u => {
    const ultima = actividad.get(u.id) ?? null;
    const suyas = resp.filter(r => r.id === u.id);
    const n = suyas.reduce((s, r) => s + r.n, 0);
    const bien = suyas.reduce((s, r) => s + r.bien, 0);
    return {
      id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible, rol: u.rol, activo: u.activo === 1, avatar: avatares.get(u.id) ?? null,
      ultimaActividad: ultima, enLinea: Boolean(ultima && ahoraMs - Date.parse(ultima) <= EN_LINEA_MS),
      respuestas: n, aciertos: bien, errores: n - bien, pct: pct(bien, n), temasAprobados: temasHechos.get(u.id) ?? 0, temas: totalTemas,
      materias: suyas.filter(r => r.materia).map(r => ({ id: r.materia, respuestas: r.n, aciertos: r.bien, errores: r.n - r.bien, pct: pct(r.bien, r.n) })),
    };
  });
}

export function detalleAlumno(db, paquete, alumnoId, ahoraMs = Date.now()) {
  const id = Number(alumnoId);
  const u = Number.isSafeInteger(id) ? db.prepare('SELECT id, nombre, nombre_visible, rol, activo FROM usuarios WHERE id = ?').get(id) : null;
  if (!u) throw new ErrorHttp(404, 'no_existe');
  const fila = alumnos(db, paquete, ahoraMs).find(a => a.id === u.id);
  const falladas = db.prepare(`SELECT pregunta, COUNT(*) AS veces, SUM(1 - correcta) AS fallos, MAX(creada_en) AS ultima FROM academia_respuestas
    WHERE usuario_id = ? GROUP BY pregunta HAVING SUM(1 - correcta) > 0 ORDER BY fallos DESC, ultima DESC LIMIT 100`).all(u.id)
    .map(f => ({ ...vistaPregunta(paquete, f.pregunta), veces: f.veces, fallos: f.fallos, ultima: f.ultima }));
  const intentos = db.prepare(`SELECT id, tipo, materia, tema, total, aciertos, aprobado, terminado_en FROM academia_intentos
    WHERE usuario_id = ? AND terminado_en IS NOT NULL ORDER BY id DESC LIMIT 20`).all(u.id)
    .map(f => ({ tipo: f.tipo, materia: f.materia, tema: f.tema, total: f.total, aciertos: f.aciertos, pct: pct(f.aciertos, f.total), aprobado: f.aprobado == null ? null : f.aprobado === 1, fecha: f.terminado_en }));
  return { alumno: fila, materias: porMateria(db, u.id, paquete), falladas, intentos, ...puntosYRacha(db, u.id, ahoraMs), puntosDebiles: resumenDebiles(puntosDebiles(db, u.id, paquete), paquete) };
}

// ---------- 0.8.0: la clave completa (solo para el administrador) ----------
// Cada materia → tema → pregunta: el enunciado y las opciones TAL CUAL, la correcta, la explicación original, la sencilla,
// las ideas equivocadas de cada opción y las 2 opciones del Modo reto (con por qué son incorrectas).
export function claveDeRespuestas(paquete) {
  if (!paquete) return { paquete: null, materias: [] };
  return {
    paquete: { id: paquete.id, nombre: paquete.nombre, muestra: paquete.muestra },
    materias: paquete.materias.filter(m => m.temas.length).map(m => ({
      id: m.id,
      temas: m.temas.map(t => ({
        id: t.id, titulo: t.titulo,
        preguntas: t.preguntas.map(id => {
          const q = paquete.preguntas.get(id);
          const o = q.original;
          return {
            id, origen: q.origen, numero: o.numero ?? null, seccion: o.seccion ?? null, enunciado: o.enunciado, pagina: o.pagina ?? null,
            opciones: o.opciones.map(op => ({ letra: op.letra, texto: op.texto })), correcta: o.correcta, explicacion: o.explicacion ?? null,
            figura: o.figura != null ? figuraVista(paquete, id, o.figura) : null,
            fuente: q.origen === 'poh' && q.fuente ? fuenteDe(paquete, q.fuente, paquete.dePaquete?.get(id)) : null,
            sencilla: q.sencilla, errores: q.errores ?? {},
            reto: tieneReto(q) ? q.reto.opciones.map(r => ({ texto: r.texto, porque: r.porque_es_incorrecta, trampa: r.trampa ?? null })) : [],
          };
        }),
      })),
    })),
  };
}
