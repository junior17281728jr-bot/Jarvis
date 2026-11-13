// Academia: el camino de cada alumno (temas que se abren uno tras otro), las prácticas y exámenes, la fila de repaso y
// el progreso. TODO se lee y se escribe con el id del alumno que entró (la sesión): nunca con un id que mande la
// pantalla. Las vistas de otros alumnos son solo para el administrador (src/api/academia.js, rutas { admin: true }).
// Las preguntas se muestran TAL CUAL las trae el paquete: solo cambia el ORDEN de las preguntas (nunca el de sus
// opciones: las letras y la explicación original se refieren a ellas). La respuesta correcta y las explicaciones
// nunca viajan antes de responder: la nota la pone el servidor.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste, refFigura, figuraDe, librosDe, audioDe, paginaDe, mp4De, clipDe, fotoDe } from './paquetes.js';
import { registrarSalto, saltoDeIntento, anotarOrden, saltosDe } from './saltos.js';
import { lineaHumor, QUEMADO_SUAVE } from './humor.js';
import { resumenVisitas } from '../cuentas/visitas.js';
import { resumenExtra } from './extra.js';
import { MODO_ORIGINAL, MODO_RETO, tieneReto, opcionesReto, claveDeLetra, letraDeClave, opcionRetoDe } from './reto.js';
import { puntosDebiles, debilDe, preguntasParaPracticar } from './memoria.js';
import { preguntasDelInstructor } from './practica.js';
import { preguntasDeConcepto, empezarRepaso, repasoDelResultado, miRepaso } from './fallas.js';
import { MATERIAS } from './formato.js';
import { avataresDe } from '../cuentas/perfil.js';
import { nombresLegales } from '../cuentas/terminos.js';

// 0.8.0: «reto» = practicar un tema (o toda una materia, sin tema) en Modo reto; «errores» = practicar lo que más se
// falla (de un intento, de un tema, de una materia o de todo). Los dos son práctica: no aprueban temas ni exámenes
// (eso solo lo hacen «tema» y «examen», siempre con las 3 opciones originales del Test Guide).
// 0.9.0: «instructor» = la Práctica del instructor (src/academia/practica.js): lo que vence en el repaso, lo que más falla
// y lo nuevo de sus temas abiertos, mezclado. También es práctica, con las 3 opciones originales.
// 0.13.7: «final» = el «Repaso final» (src/academia/repaso-final.js): TODAS las preguntas del Test Guide del paquete en uso
// (o de una materia, o solo las que la última vez falló), tal cual y sin mirar qué temas tiene abiertos. Es práctica: nunca
// aprueba un tema ni un examen.
export const TIPOS_INTENTO = Object.freeze(['tema', 'examen', 'repaso', 'reto', 'errores', 'instructor', 'final']);
// Las preguntas del Test Guide (nunca las del POH ni las «extra») de todas las materias con contenido, o de una.
export function idsTestGuide(paquete, materia = null) {
  const materias = (paquete?.materias ?? []).filter(m => m.temas.length && (materia == null || m.id === materia));
  return materias.flatMap(m => m.temas.flatMap(t => t.preguntas)).filter(id => paquete.preguntas.get(id)?.origen === 'test_guide');
}
// Las preguntas cuya ÚLTIMA respuesta (en cualquier práctica o examen) fue mala.
export function falladasTestGuide(db, usuarioId, paquete) {
  const ultima = new Map();
  for (const f of db.prepare('SELECT pregunta, correcta FROM academia_respuestas WHERE usuario_id = ? ORDER BY id').all(usuarioId)) ultima.set(f.pregunta, f.correcta);
  return new Set([...ultima].filter(([id, c]) => c === 0 && paquete?.preguntas.get(id)?.origen === 'test_guide').map(([id]) => id));
}
export const modoDeTipo = tipo => (tipo === 'reto' ? MODO_RETO : MODO_ORIGINAL);
// 0.12.0: el modo de un intento ya creado: el de su tipo, o «reto» si un tema se hizo en Modo reto (el administrador lo
// puso por defecto para las prácticas de tema; se fija al crear el intento en academia_intentos.modo).
export const modoDeFila = fila => (fila?.tipo === 'reto' || fila?.modo === MODO_RETO ? MODO_RETO : MODO_ORIGINAL);
// 0.12.0: «Modo de práctica por defecto» de los temas (los exámenes siempre van en Original).
export const MODOS_PRACTICA = Object.freeze([MODO_ORIGINAL, MODO_RETO]);
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

// 0.9.2: el examen de materia lleva reloj: tantos segundos por pregunta (lo cambia el administrador).
export const EXAMEN_SEGUNDOS_POR_DEFECTO = 90;
export const EXAMEN_SEGUNDOS_MIN = 20;
export const EXAMEN_SEGUNDOS_MAX = 600;
export function ajustesAcademia(db) {
  const nombre = leerAjuste(db, 'academia.nombre');
  const umbral = Number(leerAjuste(db, 'academia.aprobar_pct'));
  const segundos = Number(leerAjuste(db, 'academia.examen_segundos'));
  const modo = leerAjuste(db, 'academia.practica_modo');
  return {
    practicaModo: modo === MODO_RETO ? MODO_RETO : MODO_ORIGINAL,
    nombre: nombre && nombre.trim() ? nombre : NOMBRE_POR_DEFECTO,
    umbral: Number.isSafeInteger(umbral) && umbral >= 50 && umbral <= 100 ? umbral : UMBRAL_POR_DEFECTO,
    examenSegundos: Number.isSafeInteger(segundos) && segundos >= EXAMEN_SEGUNDOS_MIN && segundos <= EXAMEN_SEGUNDOS_MAX ? segundos : EXAMEN_SEGUNDOS_POR_DEFECTO,
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
export function guardarAjustesAcademia(db, { nombre, umbral, examenSegundos, practicaModo }) {
  if (practicaModo !== undefined) {
    if (!MODOS_PRACTICA.includes(practicaModo)) throw new ErrorHttp(400, 'datos_no_validos');
    guardarAjuste(db, 'academia.practica_modo', practicaModo);
  }
  if (examenSegundos !== undefined) {
    if (!Number.isSafeInteger(examenSegundos) || examenSegundos < EXAMEN_SEGUNDOS_MIN || examenSegundos > EXAMEN_SEGUNDOS_MAX) throw new ErrorHttp(400, 'examen_segundos_no_valido');
    guardarAjuste(db, 'academia.examen_segundos', examenSegundos);
  }
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
    // 0.12.0: «¿De dónde salió?»: la página real del libro (si el paquete la trae). La imagen se pide aparte
    // (GET /api/academia/paginas/:pregunta) y solo se da DESPUÉS de responder: en esa página está la respuesta.
    paginaLibro: paginaVista(paquete, id),
  };
}
function paginaVista(paquete, id) {
  const g = paginaDe(paquete, id);
  return g ? { libro: g.libroTitulo, pagina: g.pagina, imagen: g.existe } : null;
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
export const vistaSecciones = (paquete, lista, pid = null) => (lista ?? []).map(s => ({
  titulo: s.titulo, texto: s.texto ?? null, nota: s.nota ?? null, fuentes: (s.fuentes ?? []).map(f => fuenteDe(paquete, f, pid)),
  // 0.7.2: una tarjeta ya partida trae sus partes; las secciones de texto largo las parte la pantalla (public/tarjetas.js).
  ...(s.tipo === 'tarjeta' ? {
    tipo: 'tarjeta', puntos: [...s.puntos], recuerda: s.recuerda ?? null, ejemplo: s.ejemplo ?? null,
    ingles: Array.isArray(s.ingles) ? s.ingles.map(w => ({ palabra: w.palabra, pronunciacion: w.pronunciacion ?? null, significado: w.significado ?? null, ejemplo: w.ejemplo ?? null })) : [],
    visual: s.visual ? { tipo: s.visual.tipo, parametros: s.visual.parametros ?? {} } : null,
    // 0.12.1: el ejemplo en video corto (solo si ya llegó; si no, se ve el dibujo o nada).
    clip: clipDe(paquete, pid, s.clip),
    // 0.12.5: la foto del libro (solo si ya llegó; si no, la tarjeta se ve sin ella).
    imagen: fotoDe(paquete, pid, s.imagen, s.fuentes),
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

// 0.13.6: la nota general del curso: la MEJOR nota del examen de cada una de las 11 materias, sumadas y divididas entre 11
// (la materia sin examen hecho o sin contenido cuenta 0). mejores: Map o lista de { id/materia, mejor, aprobado }.
// → { pct, aprobados, total: 11 } (aprobados: los exámenes de materia aprobados). El oral no entra.
export function notaGeneralDelCurso(mejores) {
  const lista = mejores instanceof Map ? [...mejores].map(([id, x]) => ({ ...x, id })) : [...(mejores ?? [])];
  const deCada = new Map();
  for (const x of lista) {
    const id = x.id ?? x.materia;
    if (!MATERIAS.includes(id)) continue;
    const antes = deCada.get(id) ?? { mejor: 0, aprobado: false };
    deCada.set(id, { mejor: Math.max(antes.mejor, Math.max(0, Math.min(100, Number(x.mejor) || 0))), aprobado: antes.aprobado || x.aprobado === true });
  }
  const suma = [...deCada.values()].reduce((s, x) => s + x.mejor, 0);
  return { pct: Math.floor(suma / MATERIAS.length), aprobados: [...deCada.values()].filter(x => x.aprobado).length, total: MATERIAS.length };
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
  const { nombre, umbral, examenSegundos, practicaModo } = ajustesAcademia(db);
  const base = { nombre, umbral, examenSegundos, practicaModo, ...puntosYRacha(db, usuarioId, ahoraMs) };
  if (!paquete) return { ...base, paquete: null, materias: [], repaso: 0 };
  const aprobados = temasAprobados(db, usuarioId);
  const deExamen = examenes(db, usuarioId);
  let anteriorAprobado = true;
  const vistos = videosVistos(db, usuarioId);
  const leidos = temasLeidos(db, usuarioId);
  const memoria = puntosDebiles(db, usuarioId, paquete);
  const saltos = saltosDe(db, usuarioId);
  const pasos = pasosDeTemas(db, usuarioId);
  const posVideo = posiciones(db, usuarioId);
  const materias = paquete.materias.map(m => {
    const temas = m.temas.map(t => {
      const a = aprobados.get(`${m.id}/${t.id}`);
      // 0.7.2: un tema SIN preguntas se aprueba al terminar de leer su lección (si no, el camino quedaba trancado ahí).
      const aprobado = a?.aprobado === true || (!t.preguntas.length && leidos.has(`${m.id}/${t.id}`));
      const estadoTema = aprobado ? 'aprobado' : anteriorAprobado ? 'abierto' : 'bloqueado';
      anteriorAprobado = aprobado;
      // 0.12.2: el avance (anillo y color del nodo) y dónde quedó en su clase.
      const p = pasos[`${m.id}/${t.id}`] ?? null;
      return { id: t.id, titulo: t.titulo, estado: estadoTema, mejor: a?.mejor ?? null, preguntas: t.preguntas.length,
        avance: avanceTema(p, a, aprobado, !t.preguntas.length), paso: p ? { paso: p.paso, total: p.total } : null };
    });
    const todos = temas.length > 0 && temas.every(t => t.estado === 'aprobado');
    const estadoMateria = !temas.length ? 'vacia' : todos ? 'aprobada' : temas.some(t => t.estado !== 'bloqueado') ? 'abierta' : 'bloqueada';
    const ex = deExamen.get(m.id);
    const aprobadosN = temas.filter(t => t.estado === 'aprobado').length;
    const audio = audioDe(paquete, m.paquete, m.audio);
    const video = resumenVideo(paquete, m, vistos);
    // 0.12.2: el anillo del video: visto = completo; si no, hasta dónde llegó en el mp4.
    if (video) {
      const pv = posVideo[m.id];
      video.pct = video.visto ? 100 : video.duracion && Number.isFinite(pv?.s) ? Math.min(99, Math.round((pv.s * 100) / video.duracion)) : 0;
    }
    // 0.8.0: cuántas preguntas tienen Modo reto (de los temas abiertos) y el punto débil del alumno en la materia.
    const abiertos = new Set(temas.filter(t => t.estado !== 'bloqueado').map(t => t.id));
    const retoN = m.temas.filter(t => abiertos.has(t.id)).reduce((n, t) => n + t.preguntas.filter(id => tieneReto(paquete.preguntas.get(id))).length, 0);
    const debil = debilDe(memoria, paquete, { materia: m.id });
    // 0.12.2: el avance de la materia (su anillo): el promedio de sus nodos (video, temas y el examen del Test Guide).
    const exAvance = ex?.aprobado === true ? { nivel: 'dominado', pct: 100 } : ex?.veces ? { nivel: 'terminado', pct: Math.min(99, ex.mejor ?? 0) } : { nivel: 'nuevo', pct: 0 };
    const partes = [...(video ? [video.pct] : []), ...temas.map(t => t.avance.pct), exAvance.pct];
    return {
      id: m.id, estado: estadoMateria, temas, pct: pct(aprobadosN, temas.length), avance: partes.length ? Math.round(partes.reduce((a, b) => a + b, 0) / partes.length) : 0,
      ...(audio ? { audio } : {}), ...(video ? { video } : {}),
      reto: retoN, ...(debil ? { debil } : {}),
      examen: {
        avance: exAvance, disponible: todos, preguntas: m.temas.reduce((n, t) => n + t.preguntas.length, 0), mejor: ex?.mejor ?? null, aprobado: ex?.aprobado === true, veces: ex?.veces ?? 0,
        // 0.12.0: «Ir directo al examen» sin terminar los temas (con su aviso). El orden queda guardado.
        saltable: !todos && temas.length > 0, pendientes: temas.filter(t => t.estado !== 'aprobado').length,
      },
      orden: saltos.orden[m.id] ?? null, saltos: saltos.eventos.filter(e => e.materia === m.id).length,
      // 0.12.0: lo EXTRA (no es del Test Guide): cuántas tarjetas y preguntas trae; se ofrece después del examen.
      ...(m.extra?.preguntas?.length || m.extra?.tarjetas?.length ? { extra: { preguntas: m.extra.preguntas.length, tarjetas: m.extra.tarjetas.length, recomendado: ex?.aprobado === true } } : {}),
    };
  });
  // 0.12.2: «Continuar» = la última clase que abrió y todavía no aprobó (en la tarjeta donde quedó).
  const abiertos = new Set(materias.flatMap(m => m.temas.filter(t => t.estado === 'abierto').map(t => `${m.id}/${t.id}`)));
  const [ultimo] = Object.entries(pasos).filter(([k]) => abiertos.has(k)).sort((a, b) => String(b[1]?.en).localeCompare(String(a[1]?.en)));
  const continuar = ultimo ? { materia: ultimo[0].split('/')[0], tema: ultimo[0].split('/')[1], paso: ultimo[1].paso, total: ultimo[1].total } : null;
  return { ...base, paquete: { id: paquete.id, nombre: paquete.nombre, muestra: paquete.muestra }, materias, continuar, repaso: repasoPendiente(db, usuarioId, paquete, ahoraMs).length };
}

// ---------- 0.7.2: el «Video resumen» de cada materia ----------
// Lo que el camino necesita saber del video (sin las escenas): cuántas escenas, si tiene su narración y cuánto dura.
// 0.12.1: con el mp4 ya en su carpeta, el video es ese (mp4); si no, las escenas de siempre (o nada).
function videoDeMateria(paquete, m) {
  const v = m?.video ?? null;
  const audio = audioDe(paquete, m?.paquete, v?.audio) ?? (v ? null : audioDe(paquete, m?.paquete, m?.audio));
  const escenas = Array.isArray(v?.escenas) ? v.escenas : [];
  const mp4 = mp4De(paquete, m?.paquete, v?.mp4);
  if (!escenas.length && !audio && !mp4) return null;
  return { v, audio, escenas, mp4 };
}
function resumenVideo(paquete, m, vistos = []) {
  const x = videoDeMateria(paquete, m);
  if (!x) return null;
  const duracion = x.mp4 ? Math.round(x.mp4.duracion_s) : x.escenas.length ? Math.round(Math.max(...x.escenas.map(e => e.fin_s))) : null;
  return { escenas: x.escenas.length, audio: Boolean(x.audio), ...(x.mp4 ? { mp4: true } : {}), duracion, visto: vistos.includes(m.id) };
}
// El video de una materia para el reproductor: las escenas con sus tiempos y la narración (si ya llegó el mp3).
export function videoMateria(db, usuarioId, paquete, materia) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const m = paquete.materias.find(x => x.id === materia);
  const x = m && m.temas.length ? videoDeMateria(paquete, m) : null;
  if (!x) throw new ErrorHttp(404, 'no_existe');
  const { bytes, ...mp4 } = x.mp4 ?? {};
  return {
    materia, titulo: x.v?.titulo ?? null, audio: x.audio, visto: videosVistos(db, usuarioId).includes(materia),
    temas: m.temas.map(t => t.id), // 0.12.2: el orden de los temas (el tema n es el capítulo n del mp4)
    // 0.12.1: el video editado (o null) y dónde lo dejó la última vez (segundos, o null).
    mp4: x.mp4 ? mp4 : null, posicion: x.mp4 ? posicionVideo(db, usuarioId, materia, x.mp4.ref) : null,
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
// 0.12.1: dónde quedó cada alumno en el mp4 de cada materia (en ajustes, sin cambio de base): { materia: { ref, s, en } }.
// Si el mp4 cambia (otra versión), la posición de antes no vale.
const clavePosiciones = usuarioId => `academia.video_posicion.${Number(usuarioId)}`;
function posiciones(db, usuarioId) {
  try { const o = JSON.parse(leerAjuste(db, clavePosiciones(usuarioId)) ?? '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
function posicionVideo(db, usuarioId, materia, ref) {
  const p = posiciones(db, usuarioId)[materia];
  return p && p.ref === ref && Number.isFinite(p.s) ? { s: p.s, en: typeof p.en === 'string' ? p.en : null } : null;
}
export function guardarPosicionVideo(db, usuarioId, paquete, materia, segundos, ahoraMs = Date.now()) {
  const v = videoMateria(db, usuarioId, paquete, materia);
  if (!v.mp4) throw new ErrorHttp(404, 'no_existe');
  const s = Number(segundos);
  if (!Number.isFinite(s) || s < 0 || s > 36_000) throw new ErrorHttp(400, 'datos_no_validos');
  const todas = posiciones(db, usuarioId);
  todas[materia] = { ref: v.mp4.ref, s: Math.round(Math.min(s, v.mp4.duracion_s) * 10) / 10, en: new Date(ahoraMs).toISOString() };
  // Solo las materias que existen (son 11): nunca crece.
  const limpio = Object.fromEntries(Object.entries(todas).filter(([k]) => paquete.materias.some(x => x.id === k)));
  guardarAjuste(db, clavePosiciones(usuarioId), JSON.stringify(limpio));
  return { posicion: { s: todas[materia].s, en: todas[materia].en } };
}
// 0.12.2: el video de una materia se ofrece solo la PRIMERA vez que entra a ella (con «Saltar video»); visto o saltado,
// nunca más se muestra solo. Las materias donde ya se ofreció van en ajustes (sin cambio de base).
const claveOfrecidos = usuarioId => `academia.videos_ofrecidos.${Number(usuarioId)}`;
function videosOfrecidos(db, usuarioId) {
  try { const l = JSON.parse(leerAjuste(db, claveOfrecidos(usuarioId)) ?? '[]'); return Array.isArray(l) ? l.filter(x => typeof x === 'string') : []; } catch { return []; }
}
export function marcarVideoOfrecido(db, usuarioId, paquete, materia) {
  videoMateria(db, usuarioId, paquete, materia); // que exista
  const lista = videosOfrecidos(db, usuarioId);
  if (!lista.includes(materia)) guardarAjuste(db, claveOfrecidos(usuarioId), JSON.stringify([...lista, materia].slice(-20)));
  return { ofrecido: true };
}
// Lo que la clase de un tema sabe del video de su materia: si hay que ofrecerlo (la primera vez que entra a la materia:
// sin verlo, sin habérselo ofrecido y sin nada hecho en sus temas) y el capítulo del mp4 de ESE tema (capítulo 0 = la
// introducción; el tema n es el capítulo n), para «Ver la explicación en video».
function videoDeLeccion(db, usuarioId, paquete, m, t) {
  const x = videoDeMateria(paquete, m);
  if (!x) return null;
  const indice = m.temas.findIndex(y => y.id === t.id);
  const cap = x.mp4 && Array.isArray(x.v?.mp4?.capitulos) ? x.v.mp4.capitulos[indice + 1] ?? null : null;
  const pasos = pasosDeTemas(db, usuarioId);
  const hizoAlgo = m.temas.some(y => pasos[`${m.id}/${y.id}`]) || db.prepare("SELECT 1 FROM academia_intentos WHERE usuario_id = ? AND materia = ? LIMIT 1").get(usuarioId, m.id);
  const ofrecer = !videosVistos(db, usuarioId).includes(m.id) && !videosOfrecidos(db, usuarioId).includes(m.id) && !hizoAlgo;
  return { ofrecer, capitulo: cap && Number.isFinite(cap.inicio_s) ? { inicio_s: cap.inicio_s, titulo: cap.titulo ?? '' } : null };
}
export function marcarVideoVisto(db, usuarioId, paquete, materia) {
  videoMateria(db, usuarioId, paquete, materia); // que exista
  const vistos = videosVistos(db, usuarioId);
  if (!vistos.includes(materia)) guardarAjuste(db, claveVistos(usuarioId), JSON.stringify([...vistos, materia].slice(-20)));
  return { visto: true };
}

// ---------- 0.12.2: dónde quedó en cada clase (la tarjeta), para seguir ahí y para el anillo de avance del Camino ----------
// En ajustes (sin cambio de base): { "<materia>/<tema>": { paso, max, total, en } }. paso = la pantalla donde está (0 = la
// portada; total - 1 = el final), max = la más lejana que vio, total = cuántas pantallas tiene su clase.
const clavePasos = usuarioId => `academia.tema_paso.${Number(usuarioId)}`;
export function pasosDeTemas(db, usuarioId) {
  try { const o = JSON.parse(leerAjuste(db, clavePasos(usuarioId)) ?? '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
export function guardarPasoTema(db, usuarioId, paquete, materia, tema, { paso, total }, ahoraMs = Date.now()) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  buscarTema(paquete, materia, tema);
  if (estadoDelTema(db, usuarioId, paquete, materia, tema) === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
  if (!Number.isSafeInteger(total) || total < 2 || total > 1000 || !Number.isSafeInteger(paso) || paso < 0 || paso >= total) throw new ErrorHttp(400, 'datos_no_validos');
  const todos = pasosDeTemas(db, usuarioId);
  const k = `${materia}/${tema}`;
  const antes = todos[k] && todos[k].total === total ? todos[k] : null;
  todos[k] = { paso, max: Math.max(paso, Number(antes?.max) || 0), total, en: new Date(ahoraMs).toISOString() };
  // Solo los temas que existen: nunca crece de más.
  const vivos = new Set(paquete.materias.flatMap(m => m.temas.map(t => `${m.id}/${t.id}`)));
  guardarAjuste(db, clavePasos(usuarioId), JSON.stringify(Object.fromEntries(Object.entries(todos).filter(([x]) => vivos.has(x)))));
  return { paso: todos[k] };
}
// El avance de un tema para el Camino: nivel 'nuevo' | 'empezado' | 'terminado' (vio todas sus tarjetas e hizo su
// práctica) | 'dominado' (aprobó su práctica); pct = 60 % las tarjetas vistas + 40 % la práctica hecha (100 aprobado).
export function avanceTema(p, intento, aprobado, sinPreguntas) {
  if (aprobado) return { nivel: 'dominado', pct: 100 };
  const tarjetas = p && p.total > 1 ? Math.min(1, (Number(p.max) || 0) / (p.total - 1)) : 0;
  const practica = Boolean(intento) || sinPreguntas;
  const pct = Math.round(60 * tarjetas + (intento ? 40 : 0));
  const nivel = tarjetas >= 1 && practica ? 'terminado' : tarjetas > 0 || intento ? 'empezado' : 'nuevo';
  return { nivel, pct: Math.min(99, pct) };
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
    // 0.12.2: el video de su materia (ofrecerlo la primera vez; el capítulo de este tema).
    ...((v => (v ? { video: v } : {}))(videoDeLeccion(db, usuarioId, paquete, paquete.materias.find(x => x.id === materia), t))),
    // 0.12.12: cuántas tarjetas extra («Profundizar») trae este tema (0: no se ofrece «Profundizar en este tema»).
    extra: (paquete.materias.find(x => x.id === materia)?.extra?.tarjetas ?? []).filter(c => c.tema === t.id).length,
    // 0.12.2: dónde quedó la última vez (la pantalla de su clase), para seguir ahí.
    paso: (({ paso, max, total } = {}) => (total ? { paso, max, total } : null))(pasosDeTemas(db, usuarioId)[`${materia}/${t.id}`]),
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

export function crearIntento(db, usuarioId, paquete, { tipo, materia = null, tema = null, intento: intentoBase = null, saltar = false, concepto = null, soloFalladas = false }, { azar = Math.random, ahoraMs = Date.now() } = {}) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  if (!TIPOS_INTENTO.includes(tipo)) throw new ErrorHttp(400, 'datos_no_validos');
  let ids;
  let salto = null;
  if (tipo === 'tema') {
    const { t } = buscarTema(paquete, materia, tema);
    if (estadoDelTema(db, usuarioId, paquete, materia, tema) === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
    ids = t.preguntas;
  } else if (tipo === 'examen') {
    const m = paquete.materias.find(x => x.id === materia);
    if (!m || !m.temas.length) throw new ErrorHttp(404, 'no_existe');
    const c = camino(db, usuarioId, paquete, ahoraMs).materias.find(x => x.id === materia);
    // 0.12.0: sin todos los temas, solo si pidió «Ir directo al examen» (saltar: true); queda anotado como salto.
    if (!c.examen.disponible && saltar !== true) throw new ErrorHttp(403, 'examen_bloqueado');
    ids = m.temas.flatMap(t => t.preguntas);
    tema = null;
    salto = c.examen.disponible ? null : { pendientes: c.temas.filter(t => t.estado !== 'aprobado').length, total: c.temas.length };
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
    // 0.12.2: o un concepto de «Mi repaso» (concepto = su clave): sus preguntas, las falladas primero.
    if (concepto != null) {
      const x = preguntasDeConcepto(db, usuarioId, paquete, concepto);
      // Un tema cerrado, solo si ya respondió preguntas de ese concepto (p. ej. al ir directo al examen): practicar lo que
      // ya vio, como «errores» de un intento suyo; lo que nunca vio de un tema cerrado, no.
      const respondio = db.prepare(`SELECT 1 FROM academia_respuestas WHERE usuario_id = ? AND pregunta IN (${x.concepto.preguntas.map(() => '?').join(', ')}) LIMIT 1`).get(usuarioId, ...x.concepto.preguntas);
      if (!respondio && estadoDelTema(db, usuarioId, paquete, x.concepto.materia, x.concepto.tema) === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
      ids = x.ids;
      materia = x.concepto.materia;
      tema = x.concepto.tema;
    } else ids = preguntasParaPracticar(db, usuarioId, paquete, { intento: intentoBase, materia, tema });
    if (intentoBase != null && concepto == null) {
      const f = intentoDe(db, usuarioId, intentoBase);
      materia = f.materia;
      tema = f.tema;
    }
    if (!ids.length) throw new ErrorHttp(409, 'sin_errores');
  } else if (tipo === 'instructor') {
    const c = camino(db, usuarioId, paquete, ahoraMs);
    const abiertos = new Set(c.materias.flatMap(m => m.temas.filter(t => t.estado !== 'bloqueado').map(t => `${m.id}/${t.id}`)));
    // 0.10.0: con materia y tema, el refuerzo de ese tema (su plan de refuerzo: «Repasar ahora»).
    if (materia && tema && !abiertos.has(`${materia}/${tema}`)) throw new ErrorHttp(403, 'tema_bloqueado');
    ids = preguntasDelInstructor(db, usuarioId, paquete, abiertos, ahoraMs, { materia, tema });
    if (!(materia && tema)) { materia = null; tema = null; }
  } else if (tipo === 'final') {
    // 0.13.7: el Repaso final (para quien ya estudió): no mira temas cerrados.
    if (materia != null && !paquete.materias.some(m => m.id === materia && m.temas.length)) throw new ErrorHttp(404, 'no_existe');
    ids = idsTestGuide(paquete, materia);
    if (soloFalladas === true) {
      const malas = falladasTestGuide(db, usuarioId, paquete);
      ids = ids.filter(id => malas.has(id));
      if (!ids.length) throw new ErrorHttp(409, 'sin_errores');
    }
    tema = null;
  } else {
    ids = repasoPendiente(db, usuarioId, paquete, ahoraMs).slice(0, REPASO_MAXIMO);
    materia = null;
    tema = null;
  }
  if (!ids.length) throw new ErrorHttp(409, tipo === 'repaso' ? 'repaso_vacio' : 'sin_preguntas');
  // 0.8.0: el repaso y «practicar mis errores» van en orden de prioridad (lo más fallado primero), sin mezclar.
  const porPrioridad = tipo === 'repaso' || tipo === 'errores' || tipo === 'instructor';
  let orden = porPrioridad ? [...ids] : barajar(ids, azar);
  // Las mismas preguntas, en OTRO orden que la vez anterior (el azar puede repetir uno: entonces se corre una).
  const anterior = porPrioridad ? null : db.prepare('SELECT orden FROM academia_intentos WHERE usuario_id = ? AND tipo = ? AND materia IS ? AND tema IS ? ORDER BY id DESC LIMIT 1')
    .get(usuarioId, tipo, materia, tema);
  if (anterior && orden.length > 1 && anterior.orden === JSON.stringify(orden)) orden = [...orden.slice(1), orden[0]];
  const { umbral, practicaModo } = ajustesAcademia(db);
  // 0.12.0: un tema en Modo reto si el administrador lo puso por defecto (las preguntas sin reto salen en Original).
  const modo = tipo === 'tema' && practicaModo === MODO_RETO && ids.some(id => tieneReto(paquete.preguntas.get(id))) ? MODO_RETO : null;
  const r = db.prepare(`INSERT INTO academia_intentos (usuario_id, paquete_id, tipo, materia, tema, orden, total, umbral, empezado_en, modo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, paquete.id, tipo, materia, tema, JSON.stringify(orden), orden.length, umbral, new Date(ahoraMs).toISOString(), modo);
  const nuevo = Number(r.lastInsertRowid);
  if (tipo === 'errores' && concepto != null) empezarRepaso(db, usuarioId, paquete, concepto, nuevo, ahoraMs);
  if (tipo === 'examen') {
    anotarOrden(db, usuarioId, materia, salto ? 'examen_antes' : 'temas_antes');
    if (salto) registrarSalto(db, usuarioId, { materia, intento: nuevo, ...salto, en: new Date(ahoraMs).toISOString() });
  }
  return verIntento(db, usuarioId, paquete, nuevo);
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
  const como = { intentoId: fila.id, modo: modoDeFila(fila) };
  return {
    id: fila.id, tipo: fila.tipo, modo: como.modo, materia: fila.materia, tema: fila.tema, total: fila.total, respondidas: fila.respondidas, aciertos: fila.aciertos,
    umbral: fila.umbral, terminado: fila.terminado_en != null,
    preguntas: orden.map(id => ({ ...vistaPregunta(paquete, id, como), respuesta: respuestas.has(id) ? retroalimentacion(paquete, id, respuestas.get(id), como) : null })),
  };
}

export function anotarRepaso(db, usuarioId, q, lugar, acierto, ahoraMs) {
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
    const como = { intentoId: fila.id, modo: modoDeFila(fila) };
    const ya = db.prepare('SELECT elegida FROM academia_respuestas WHERE intento_id = ? AND pregunta = ?').get(fila.id, pregunta);
    // Dos toques seguidos: la primera respuesta es la que vale.
    if (ya) return { respuesta: retroalimentacion(paquete, pregunta, ya.elegida, como), respondidas: fila.respondidas, aciertos: fila.aciertos, total: fila.total };
    if (fila.terminado_en) throw new ErrorHttp(409, 'intento_terminado');
    const q = paquete.preguntas.get(pregunta);
    if (!q) throw new ErrorHttp(409, 'pregunta_no_disponible');
    // En Modo reto llega la letra que se vio: se guarda la opción de verdad (la correcta original, R1 o R2).
    const vistas = como.modo === MODO_RETO ? opcionesReto(q, fila.id, pregunta) : null;
    // (un tema en Modo reto por defecto: la pregunta sin reto se responde en Original)
    if (como.modo === MODO_RETO && !vistas && fila.tipo === 'reto') throw new ErrorHttp(409, 'pregunta_no_disponible');
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

// permitirFaltantes (0.9.2, solo el examen con reloj): se entrega aunque falten respuestas (cuentan como malas).
export function terminar(db, usuarioId, paquete, intentoId, { ahoraMs = Date.now(), permitirFaltantes = false } = {}) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  let recien = false;
  const fila = enTransaccion(db, () => {
    const f = intentoDe(db, usuarioId, intentoId);
    if (f.terminado_en) return f;
    recien = true;
    if (f.respondidas < f.total && !permitirFaltantes) throw new ErrorHttp(409, 'faltan_respuestas');
    const aprobado = ['repaso', 'reto', 'errores', 'instructor', 'final'].includes(f.tipo) ? null : aprueba(f.aciertos, f.total, f.umbral ?? UMBRAL_POR_DEFECTO) ? 1 : 0;
    db.prepare('UPDATE academia_intentos SET terminado_en = ?, aprobado = ? WHERE id = ?').run(new Date(ahoraMs).toISOString(), aprobado, f.id);
    return db.prepare('SELECT * FROM academia_intentos WHERE id = ?').get(f.id);
  });
  const respuestas = db.prepare('SELECT pregunta, elegida, correcta FROM academia_respuestas WHERE intento_id = ? ORDER BY id').all(fila.id);
  const como = { intentoId: fila.id, modo: modoDeFila(fila) };
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
    ...extrasDelResultado(db, usuarioId, paquete, fila, recien, ahoraMs),
  };
}

// 0.12.2: cuántas veces sin aprobar lo mismo ANTES de esta para que salga el humor de «te quemaste».
const INTENTOS_PARA_QUEMADO = 2;

// 0.12.0: lo que el resultado agrega: si fue un examen «directo» (saltó las clases), cuántos temas saltó, cuántos faltan
// ahora y el primero que toca; y una línea de humor si se quemó (si el humor está encendido para él).
function extrasDelResultado(db, usuarioId, paquete, fila, recien, ahoraMs) {
  const extra = {};
  const s = fila.tipo === 'examen' ? saltoDeIntento(db, usuarioId, fila.id) : null;
  if (s) {
    const c = camino(db, usuarioId, paquete, ahoraMs).materias.find(m => m.id === fila.materia);
    const pendientes = c ? c.temas.filter(t => t.estado !== 'aprobado') : [];
    const sigue = c?.temas.find(t => t.estado === 'abierto') ?? null;
    extra.salto = { saltados: s.pendientes, total: s.total, pendientes: pendientes.length, siguiente: sigue ? { tema: sigue.id, titulo: sigue.titulo } : null };
  }
  // 0.12.2: el «te quemaste» solo si se saltó las clases o ya no aprobó esto mismo 2 veces antes (una primera vez nunca).
  if (fila.aprobado === 0) {
    const antes = db.prepare('SELECT COUNT(*) AS n FROM academia_intentos WHERE usuario_id = ? AND tipo = ? AND materia IS ? AND tema IS ? AND aprobado = 0 AND id < ?')
      .get(usuarioId, fila.tipo, fila.materia, fila.tema, fila.id).n;
    // 0.12.4: lo duro solo al saltarse las clases; si no aprobó lo mismo otra vez, frases que animan sin pinchar.
    const h = s || antes >= INTENTOS_PARA_QUEMADO ? lineaHumor(db, usuarioId, s ? 'salto' : 'quemado', { recien, referencia: `i${fila.id}`, ahoraMs, solo: s ? null : QUEMADO_SUAVE }) : null;
    if (h) extra.humor = h;
  }
  // Con alguna mala (y sin la frase de arriba): ánimo, y lo que pasó con «Mi repaso».
  if (fila.aciertos < fila.total && !extra.humor) extra.animo = true;
  Object.assign(extra, repasoDelResultado(db, usuarioId, paquete, fila, ahoraMs));
  return extra;
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

// 0.12.2: el curso ENTERO (las 11 materias del programa; las que todavía no tienen clases salen «pronto»): temas aprobados,
// exámenes de etapa aprobados y preguntas del Test Guide dominadas (su última respuesta fue buena), cada número con lo que cuenta.
export function cursoCompleto(c, deMateria) {
  const porId = new Map(c.materias.map(m => [m.id, m]));
  const materias = MATERIAS.map((id, n) => {
    const m = porId.get(id);
    const d = deMateria.get(id);
    if (!m || !m.temas.length) return { id, numero: n + 1, estado: 'pronto', temas: [], temasAprobados: 0, examen: null, preguntas: 0, bien: 0, pct: 0 };
    return {
      id, numero: n + 1, estado: m.estado, temasAprobados: m.temas.filter(t => t.estado === 'aprobado').length,
      temas: m.temas.map((t, i) => ({ id: t.id, numero: i + 1, titulo: t.titulo, estado: t.estado, mejor: t.mejor, preguntas: t.preguntas })),
      examen: { aprobado: m.examen.aprobado, mejor: m.examen.mejor, veces: m.examen.veces }, preguntas: d?.preguntas ?? 0, bien: d?.bien ?? 0, pct: d?.pct ?? 0,
    };
  });
  const con = materias.filter(m => m.estado !== 'pronto');
  const suma = (lista, f) => lista.reduce((n, x) => n + f(x), 0);
  const preguntas = suma(con, m => m.preguntas);
  const bien = suma(con, m => m.bien);
  return {
    materias, programa: MATERIAS.length, conClases: con.length,
    temas: suma(con, m => m.temas.length), temasAprobados: suma(con, m => m.temasAprobados),
    examenes: con.length, examenesAprobados: con.filter(m => m.examen?.aprobado).length,
    preguntas, bien, pct: pct(bien, preguntas),
  };
}

export function progreso(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const c = camino(db, usuarioId, paquete, ahoraMs);
  const deMateria = new Map(porMateria(db, usuarioId, paquete).map(m => [m.id, m]));
  // 0.12.2: «Mi repaso» en corto (la lista entera vive en su pantalla): cuántos puntos para repasar y los primeros.
  const r = paquete ? miRepaso(db, usuarioId, paquete, ahoraMs) : null;
  const miRepasoCorto = r ? {
    paraRepasar: r.paraRepasar.length, pendientes: r.pendientes,
    puntos: (r.paraRepasar.length ? r.paraRepasar : r.errores.flatMap(t => t.conceptos.map(x => ({ ...x, materia: t.materia, temaTitulo: t.temaTitulo, temaNumero: t.temaNumero }))))
      .slice(0, 3).map(x => ({ clave: x.clave, concepto: x.concepto, materia: x.materia, temaTitulo: x.temaTitulo, temaNumero: x.temaNumero ?? null })),
  } : { paraRepasar: 0, pendientes: 0, puntos: [] };
  return {
    curso: cursoCompleto(c, deMateria), miRepaso: miRepasoCorto,
    nombre: c.nombre, umbral: c.umbral, puntos: c.puntos, racha: c.racha, repaso: c.repaso, paquete: c.paquete,
    materias: porMateria(db, usuarioId, paquete).map(m => ({ ...m, examen: c.materias.find(x => x.id === m.id)?.examen ?? null, temas: c.materias.find(x => x.id === m.id)?.temas.map(t => ({ id: t.id, titulo: t.titulo, estado: t.estado, mejor: t.mejor })) ?? [] })),
    debiles: debiles(db, usuarioId, paquete),
    // 0.8.0: «Mis puntos débiles» (la memoria de errores: por pregunta, por idea equivocada y por tema).
    puntosDebiles: resumenDebiles(puntosDebiles(db, usuarioId, paquete), paquete),
    // 0.12.0: lo EXTRA va aparte (no cuenta para nada del Test Guide).
    extra: paquete ? resumenExtra(db, usuarioId, paquete) : [],
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

export function ultimaActividad(db) {
  const m = new Map();
  const poner = (id, fecha) => { if (fecha && (!m.get(id) || fecha > m.get(id))) m.set(id, fecha); };
  for (const f of db.prepare('SELECT id, ultimo_acceso AS f FROM usuarios').all()) poner(f.id, f.f);
  for (const f of db.prepare('SELECT usuario_id AS id, MAX(ultimo_uso) AS f FROM sesiones GROUP BY usuario_id').all()) poner(f.id, f.f);
  for (const f of db.prepare('SELECT usuario_id AS id, MAX(creada_en) AS f FROM academia_respuestas GROUP BY usuario_id').all()) poner(f.id, f.f);
  // 0.9.0: al tocar «Salir» la sesión se borra; su última actividad queda en la fila «salida» de la auditoría.
  for (const f of db.prepare("SELECT usuario_id AS id, MAX(json_extract(detalle, '$.ultimoUso')) AS f FROM auditoria WHERE accion = 'salida' AND json_valid(detalle) GROUP BY usuario_id").all()) poner(f.id, f.f);
  return m;
}

export function alumnos(db, paquete, ahoraMs = Date.now()) {
  const actividad = ultimaActividad(db);
  const temasHechos = new Map(db.prepare("SELECT usuario_id AS id, COUNT(DISTINCT materia || '/' || tema) AS n FROM academia_intentos WHERE tipo = 'tema' AND aprobado = 1 GROUP BY usuario_id").all().map(f => [f.id, f.n]));
  const resp = db.prepare('SELECT usuario_id AS id, materia, COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien FROM academia_respuestas GROUP BY usuario_id, materia').all();
  const totalTemas = (paquete?.materias ?? []).reduce((n, m) => n + m.temas.length, 0);
  const avatares = avataresDe(db);
  const legales = nombresLegales(db);
  return db.prepare('SELECT id, nombre, nombre_visible, rol, activo FROM usuarios ORDER BY rol, nombre').all().map(u => {
    const ultima = actividad.get(u.id) ?? null;
    const suyas = resp.filter(r => r.id === u.id);
    const n = suyas.reduce((s, r) => s + r.n, 0);
    const bien = suyas.reduce((s, r) => s + r.bien, 0);
    return {
      id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible, rol: u.rol, activo: u.activo === 1, avatar: avatares.get(u.id) ?? null, nombreLegal: legales.get(u.id) ?? null,
      // 0.12.4: «en línea» lo dicen sus visitas (3 minutos), igual que en su ficha; sin visitas anotadas, lo de antes.
      ...(v => ({ ultimaActividad: [ultima, v?.ultima].filter(Boolean).sort().pop() ?? null, enLinea: v ? v.enLinea : Boolean(ultima && ahoraMs - Date.parse(ultima) <= EN_LINEA_MS) }))(resumenVisitas(db, u.id, ahoraMs)),
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
