// Academia: el camino de cada alumno (temas que se abren uno tras otro), las prácticas y exámenes, la fila de repaso y
// el progreso. TODO se lee y se escribe con el id del alumno que entró (la sesión): nunca con un id que mande la
// pantalla. Las vistas de otros alumnos son solo para el administrador (src/api/academia.js, rutas { admin: true }).
// Las preguntas se muestran TAL CUAL las trae el paquete: solo cambia el ORDEN de las preguntas (nunca el de sus
// opciones: las letras y la explicación original se refieren a ellas). La respuesta correcta y las explicaciones
// nunca viajan antes de responder: la nota la pone el servidor.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';

export const TIPOS_INTENTO = Object.freeze(['tema', 'examen', 'repaso']);
export const ESTADOS_TEMA = Object.freeze(['bloqueado', 'abierto', 'aprobado']);
export const ESTADOS_MATERIA = Object.freeze(['vacia', 'bloqueada', 'abierta', 'aprobada']);
export const NOMBRE_POR_DEFECTO = 'Academia ENALAS';
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
export function vistaPregunta(paquete, id) {
  const q = paquete?.preguntas.get(id);
  if (!q) return { id, falta: true };
  const o = q.original;
  const lugar = paquete.deTema.get(id);
  return {
    id, origen: q.origen, materia: lugar?.materia ?? null, tema: lugar?.tema ?? null,
    numero: o.numero ?? null, seccion: o.seccion ?? null, enunciado: o.enunciado, pagina: o.pagina ?? null,
    opciones: o.opciones.map(op => ({ letra: op.letra, texto: op.texto })),
    figura: o.figura != null ? { numero: o.figura, titulo: paquete.figuras.get(o.figura)?.titulo ?? null } : null,
    fuente: q.origen === 'poh' && q.fuente ? fuenteDe(paquete, q.fuente) : null,
  };
}
function fuenteDe(paquete, f) {
  return { libro: paquete.libros.get(f.libro)?.titulo ?? f.libro, capitulo: f.capitulo ?? null, seccion: f.seccion ?? null, pagina: f.pagina ?? null };
}
// Lo que se ve DESPUÉS de responder.
export function retroalimentacion(paquete, id, elegida) {
  const q = paquete?.preguntas.get(id);
  if (!q) return null;
  const correcta = q.original.correcta;
  return {
    elegida, acierto: elegida === correcta, correcta,
    explicacion: q.original.explicacion ?? null,
    sencilla: q.sencilla,
    idea: elegida !== correcta ? q.errores?.[elegida] ?? null : null,
    ingles: Array.isArray(q.ingles) ? q.ingles : [],
  };
}
const vistaSecciones = (paquete, lista) => (lista ?? []).map(s => ({
  titulo: s.titulo, texto: s.texto, nota: s.nota ?? null, fuentes: (s.fuentes ?? []).map(f => fuenteDe(paquete, f)),
}));

function temasAprobados(db, usuarioId) {
  const filas = db.prepare(`SELECT materia, tema, MAX(aprobado) AS aprobado, MAX(CASE WHEN total > 0 THEN aciertos * 100 / total END) AS mejor
    FROM academia_intentos WHERE usuario_id = ? AND tipo = 'tema' AND terminado_en IS NOT NULL GROUP BY materia, tema`).all(usuarioId);
  return new Map(filas.map(f => [`${f.materia}/${f.tema}`, { aprobado: f.aprobado === 1, mejor: f.mejor }]));
}
function examenes(db, usuarioId) {
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

function repasoPendiente(db, usuarioId, paquete, ahoraMs) {
  if (!paquete) return [];
  return db.prepare('SELECT pregunta FROM academia_repaso WHERE usuario_id = ? AND caja < ? AND vence_en <= ? ORDER BY vence_en, pregunta LIMIT 200')
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
  const materias = paquete.materias.map(m => {
    const temas = m.temas.map(t => {
      const a = aprobados.get(`${m.id}/${t.id}`);
      const aprobado = a?.aprobado === true;
      const estadoTema = aprobado ? 'aprobado' : anteriorAprobado ? 'abierto' : 'bloqueado';
      anteriorAprobado = aprobado;
      return { id: t.id, titulo: t.titulo, estado: estadoTema, mejor: a?.mejor ?? null, preguntas: t.preguntas.length };
    });
    const todos = temas.length > 0 && temas.every(t => t.estado === 'aprobado');
    const estadoMateria = !temas.length ? 'vacia' : todos ? 'aprobada' : temas.some(t => t.estado !== 'bloqueado') ? 'abierta' : 'bloqueada';
    const ex = deExamen.get(m.id);
    const aprobadosN = temas.filter(t => t.estado === 'aprobado').length;
    return {
      id: m.id, estado: estadoMateria, temas, pct: pct(aprobadosN, temas.length),
      examen: { disponible: todos, preguntas: m.temas.reduce((n, t) => n + t.preguntas.length, 0), mejor: ex?.mejor ?? null, aprobado: ex?.aprobado === true, veces: ex?.veces ?? 0 },
    };
  });
  return { ...base, paquete: { id: paquete.id, nombre: paquete.nombre, muestra: paquete.muestra }, materias, repaso: repasoPendiente(db, usuarioId, paquete, ahoraMs).length };
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
  return { materia, tema: t.id, titulo: t.titulo, estado: estadoTema, secciones: vistaSecciones(paquete, t.secciones), preguntas: t.preguntas.length };
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

export function crearIntento(db, usuarioId, paquete, { tipo, materia = null, tema = null }, { azar = Math.random, ahoraMs = Date.now() } = {}) {
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
  } else {
    ids = repasoPendiente(db, usuarioId, paquete, ahoraMs).slice(0, REPASO_MAXIMO);
    materia = null;
    tema = null;
  }
  if (!ids.length) throw new ErrorHttp(409, tipo === 'repaso' ? 'repaso_vacio' : 'sin_preguntas');
  let orden = barajar(ids, azar);
  // Las mismas preguntas, en OTRO orden que la vez anterior (el azar puede repetir uno: entonces se corre una).
  const anterior = db.prepare('SELECT orden FROM academia_intentos WHERE usuario_id = ? AND tipo = ? AND materia IS ? AND tema IS ? ORDER BY id DESC LIMIT 1')
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
  return {
    id: fila.id, tipo: fila.tipo, materia: fila.materia, tema: fila.tema, total: fila.total, respondidas: fila.respondidas, aciertos: fila.aciertos,
    umbral: fila.umbral, terminado: fila.terminado_en != null,
    preguntas: orden.map(id => ({ ...vistaPregunta(paquete, id), respuesta: respuestas.has(id) ? retroalimentacion(paquete, id, respuestas.get(id)) : null })),
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
    const ya = db.prepare('SELECT elegida FROM academia_respuestas WHERE intento_id = ? AND pregunta = ?').get(fila.id, pregunta);
    // Dos toques seguidos: la primera respuesta es la que vale.
    if (ya) return { respuesta: retroalimentacion(paquete, pregunta, ya.elegida), respondidas: fila.respondidas, aciertos: fila.aciertos, total: fila.total };
    if (fila.terminado_en) throw new ErrorHttp(409, 'intento_terminado');
    const q = paquete.preguntas.get(pregunta);
    if (!q) throw new ErrorHttp(409, 'pregunta_no_disponible');
    if (typeof elegida !== 'string' || !q.original.opciones.some(o => o.letra === elegida)) throw new ErrorHttp(400, 'opcion_no_valida');
    const acierto = elegida === q.original.correcta;
    const lugar = paquete.deTema.get(pregunta);
    db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(fila.id, usuarioId, pregunta, lugar?.materia ?? null, lugar?.tema ?? null, elegida, acierto ? 1 : 0, diaDe(ahoraMs), new Date(ahoraMs).toISOString());
    db.prepare('UPDATE academia_intentos SET respondidas = respondidas + 1, aciertos = aciertos + ? WHERE id = ?').run(acierto ? 1 : 0, fila.id);
    anotarRepaso(db, usuarioId, pregunta, lugar, acierto, ahoraMs);
    return { respuesta: retroalimentacion(paquete, pregunta, elegida), respondidas: fila.respondidas + 1, aciertos: fila.aciertos + (acierto ? 1 : 0), total: fila.total };
  });
}

export function terminar(db, usuarioId, paquete, intentoId, { ahoraMs = Date.now() } = {}) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const fila = enTransaccion(db, () => {
    const f = intentoDe(db, usuarioId, intentoId);
    if (f.terminado_en) return f;
    if (f.respondidas < f.total) throw new ErrorHttp(409, 'faltan_respuestas');
    const aprobado = f.tipo === 'repaso' ? null : aprueba(f.aciertos, f.total, f.umbral ?? UMBRAL_POR_DEFECTO) ? 1 : 0;
    db.prepare('UPDATE academia_intentos SET terminado_en = ?, aprobado = ? WHERE id = ?').run(new Date(ahoraMs).toISOString(), aprobado, f.id);
    return db.prepare('SELECT * FROM academia_intentos WHERE id = ?').get(f.id);
  });
  const respuestas = db.prepare('SELECT pregunta, elegida, correcta FROM academia_respuestas WHERE intento_id = ? ORDER BY id').all(fila.id);
  const falladas = respuestas.filter(r => r.correcta !== 1).map(r => ({ ...vistaPregunta(paquete, r.pregunta), respuesta: retroalimentacion(paquete, r.pregunta, r.elegida) }));
  let reexplicacion = [];
  if (fila.tipo === 'tema' && fila.aprobado !== 1) {
    const t = paquete.materias.find(m => m.id === fila.materia)?.temas.find(x => x.id === fila.tema);
    reexplicacion = vistaSecciones(paquete, t?.reexplicacion);
  }
  return {
    id: fila.id, tipo: fila.tipo, materia: fila.materia, tema: fila.tema, total: fila.total, aciertos: fila.aciertos, pct: pct(fila.aciertos, fila.total),
    umbral: fila.umbral, aprobado: fila.aprobado == null ? null : fila.aprobado === 1, puntos: fila.aciertos * PUNTOS_POR_ACIERTO, falladas, reexplicacion,
  };
}

// Cómo va cada materia: «dominio» = preguntas cuya ÚLTIMA respuesta fue correcta, sobre todas las de la materia.
function porMateria(db, usuarioId, paquete) {
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
  return db.prepare('SELECT id, nombre, nombre_visible, rol, activo FROM usuarios ORDER BY rol, nombre').all().map(u => {
    const ultima = actividad.get(u.id) ?? null;
    const suyas = resp.filter(r => r.id === u.id);
    const n = suyas.reduce((s, r) => s + r.n, 0);
    const bien = suyas.reduce((s, r) => s + r.bien, 0);
    return {
      id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible, rol: u.rol, activo: u.activo === 1,
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
  return { alumno: fila, materias: porMateria(db, u.id, paquete), falladas, intentos, ...puntosYRacha(db, u.id, ahoraMs) };
}
