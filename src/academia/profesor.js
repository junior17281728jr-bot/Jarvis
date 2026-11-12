// Academia 0.10.0: el «Profesor virtual»: un chat con IA para los alumnos que pagaron tiempo con IA (o a los que el
// administrador se lo dio). Usa sus minutos (cada mensaje es un uso) y, sin minutos, sigue el instructor básico.
//  - Lo que se manda a la IA: su modelo (cifras, fallas, ideas equivocadas: NUNCA su nombre ni su usuario), las tarjetas
//    del tema que más se parece a lo que preguntó y las preguntas del Test Guide que YA respondió que se parecen (tal
//    cual, con la respuesta del Test Guide: así nunca le da la respuesta de una que todavía no respondió).
//  - Videos: la IA NUNCA pone un enlace. Primero los videos de YouTube que el administrador eligió para ese tema; después
//    un enlace a la BÚSQUEDA de YouTube armado aquí con palabras (las de la IA o el título del tema).
//  - El historial (los últimos 30 mensajes) es de cada alumno: solo él y el administrador lo leen.
import { ErrorHttp } from '../nucleo/http.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { leerGuardado } from './instructor-ia.js';
import { cortarBytes } from './instructor.js';

const claveHistorial = id => `academia.profesor.historial.${Number(id)}`;
const clavePermiso = id => `academia.profesor.permitido.${Number(id)}`;
export const CLAVE_VIDEOS = 'academia.videos';
export const HISTORIAL_MAXIMO = 30;
// Solo enlaces de YouTube de verdad (un video), nunca otra dirección.
export const ENLACE_YOUTUBE = /^https:\/\/(?:www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,20}|youtu\.be\/[A-Za-z0-9_-]{6,20})(?:[&?][A-Za-z0-9_=&%-]{0,60})?$/;

export function busquedaYoutube(texto) {
  const palabras = String(texto ?? '').replace(/[^\p{L}\p{N} -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return palabras ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${palabras} piloto privado`)}` : null;
}

// ¿Puede usar el Profesor virtual? El administrador sí; un alumno si pagó (un pago aprobado) o si el administrador se lo dio.
export function permisoProfesor(db, usuarioId, { admin = false } = {}) {
  if (admin) return { permitido: true, por: 'admin' };
  if (leerAjuste(db, clavePermiso(usuarioId)) === '1') return { permitido: true, por: 'regalo' };
  if (leerAjuste(db, clavePermiso(usuarioId)) === '0') return { permitido: false, por: 'quitado' };
  const pago = db.prepare("SELECT 1 FROM academia_pagos WHERE usuario_id = ? AND estado = 'aprobado' LIMIT 1").get(usuarioId);
  return pago ? { permitido: true, por: 'pago' } : { permitido: false, por: null };
}
// El administrador lo da (true), lo quita (false) o lo deja como diga su pago (null).
export function darProfesor(db, usuarioId, permitido) {
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(usuarioId)) throw new ErrorHttp(404, 'no_existe');
  if (permitido !== true && permitido !== false && permitido !== null) throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, clavePermiso(usuarioId), permitido === null ? '' : permitido ? '1' : '0');
  return permisoProfesor(db, usuarioId);
}

// ---------- Los videos que eligió el administrador ----------
export function leerVideos(db) {
  try {
    const l = JSON.parse(leerAjuste(db, CLAVE_VIDEOS) ?? '[]');
    return (Array.isArray(l) ? l : []).filter(v => typeof v?.url === 'string' && ENLACE_YOUTUBE.test(v.url) && typeof v.titulo === 'string');
  } catch { return []; }
}
export function guardarVideos(db, lista) {
  if (!Array.isArray(lista) || lista.length > 300) throw new ErrorHttp(400, 'datos_no_validos');
  const limpia = lista.map(v => ({ materia: String(v?.materia ?? ''), tema: String(v?.tema ?? ''), titulo: String(v?.titulo ?? '').trim().slice(0, 120), url: String(v?.url ?? '').trim() }));
  if (limpia.some(v => !/^[a-z0-9_-]{1,64}$/.test(v.materia) || !/^[a-z0-9_-]{0,64}$/.test(v.tema) || !v.titulo || !ENLACE_YOUTUBE.test(v.url))) throw new ErrorHttp(400, 'video_no_valido');
  guardarAjuste(db, CLAVE_VIDEOS, JSON.stringify(limpia));
  return limpia;
}
export const videosDeTema = (db, materia, tema) => leerVideos(db).filter(v => v.materia === materia && (!v.tema || v.tema === tema)).slice(0, 3);

// ---------- El historial ----------
export function leerHistorial(db, usuarioId) {
  try { const l = JSON.parse(leerAjuste(db, claveHistorial(usuarioId)) ?? '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
export function anotarMensaje(db, usuarioId, entrada) {
  guardarAjuste(db, claveHistorial(usuarioId), JSON.stringify([...leerHistorial(db, usuarioId), entrada].slice(-HISTORIAL_MAXIMO)));
}
// El historial para la pantalla: cada mensaje con su respuesta (si ya llegó) y sus videos.
export function historialParaVer(db, usuarioId) {
  return leerHistorial(db, usuarioId).map(m => {
    const r = m.clave ? leerGuardado(db, m.clave) : null;
    // Sin respuesta: si su tarea ya terminó (la IA no respondió), «no»; si no, todavía «pendiente».
    const t = !r && m.tarea ? db.prepare('SELECT estado FROM tareas WHERE id = ?').get(m.tarea) : null;
    const estado = r ? 'lista' : t && !['lista', 'en_curso'].includes(t.estado) ? 'no' : 'pendiente';
    return {
      pregunta: m.pregunta, en: m.en, tarea: m.tarea ?? null, estado, tema: m.tema ?? null,
      respuesta: r ? { respuesta: r.respuesta, control: r.control, estudiar: r.estudiar, terminos: r.terminos } : null,
      videos: m.videos ?? [], buscar: [...(r?.buscar ?? []).map(x => ({ texto: x, url: busquedaYoutube(x) })), ...(m.buscar ?? [])].filter(x => x.url).slice(0, 3),
    };
  });
}

// ---------- Lo que se le manda a la IA ----------
const raices = texto => new Set(String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter(p => p.length >= 4).map(p => p.slice(0, 5)));
function parecido(a, b) { let n = 0; for (const x of a) if (b.has(x)) n += 1; return n; }

// El tema abierto que más se parece al mensaje (o el de su falla más grande), y las preguntas que ya respondió parecidas.
export function contextoChat(db, usuarioId, paquete, mensaje, abiertos, fallas) {
  const buscadas = raices(mensaje);
  let mejor = null;
  for (const m of paquete.materias) {
    for (const t of m.temas) {
      if (!abiertos.has(`${m.id}/${t.id}`)) continue;
      const n = parecido(buscadas, raices([t.titulo, ...(t.secciones ?? []).map(s => [s.titulo, s.texto, ...(s.puntos ?? [])].join(' '))].join(' ')));
      if (n > 0 && (!mejor || n > mejor.n)) mejor = { n, materia: m.id, tema: t.id, t };
    }
  }
  if (!mejor && fallas[0]) {
    const t = paquete.materias.find(m => m.id === fallas[0].materia)?.temas.find(x => x.id === fallas[0].tema);
    if (t) mejor = { n: 0, materia: fallas[0].materia, tema: t.id, t };
  }
  const material = mejor ? {
    tema: mejor.t.titulo,
    tarjetas: (mejor.t.secciones ?? []).map(s => ({ titulo: s.titulo ?? '', texto: [s.texto, ...(s.puntos ?? []), s.recuerda].filter(Boolean).join('\n') }))
      .map(x => ({ ...x, n: parecido(buscadas, raices(`${x.titulo} ${x.texto}`)) })).sort((a, b) => b.n - a.n).slice(0, 2)
      .map(x => ({ titulo: x.titulo, texto: cortarBytes(x.texto, 1200) })),
  } : null;
  const respondidas = db.prepare('SELECT DISTINCT pregunta FROM academia_respuestas WHERE usuario_id = ?').all(usuarioId).map(f => f.pregunta).filter(id => paquete.preguntas.has(id));
  const preguntas = respondidas.map(id => ({ id, n: parecido(buscadas, raices(paquete.preguntas.get(id).original.enunciado)) })).filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n).slice(0, 2).map(x => {
      const o = paquete.preguntas.get(x.id).original;
      return { numero: o.numero ?? null, enunciado: o.enunciado, opciones: o.opciones.map(op => op.texto), respuesta_del_test_guide: o.opciones.find(op => op.letra === o.correcta)?.texto ?? '' };
    });
  return { material, preguntas, materia: mejor?.materia ?? null, tema: mejor?.tema ?? null, temaTitulo: mejor?.t.titulo ?? null };
}
