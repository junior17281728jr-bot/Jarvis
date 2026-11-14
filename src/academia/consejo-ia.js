// Academia 0.14.15 (pedido del dueño: «el consejo del instructor IA es un muro de texto»): el DIAGNÓSTICO del consejo
// se calcula aquí, en código (sin IA ni red), y la IA solo lo dice con sus palabras, corto:
//  - qué temas falla (con sus números de verdad: «2/6» = bien de los que respondió), la idea equivocada que repite;
//  - el ALCANCE: si los errores se juntan en UN tema (los demás de esa materia van bien) → ese tema; si son varios temas
//    de la MISMA materia → un repaso de la materia entera; si están en varias materias → los 1–2 que más pesan.
//    Con su evidencia («Fallaste 4 de 6 en Hipoxia, pero vas bien en lo demás de Factores humanos»);
//  - UN video que ya existe en la app (la lista de YouTube del administrador, el video de la materia en el capítulo del
//    tema, o el clip de una tarjeta), elegido por cuántos de sus temas flojos cubre;
//  - los repasos que le tocan hoy.
// La respuesta guardada solo tiene textos cortos por id (src/academia/instructor-ia.js): los botones y los números se
// arman al LEER, con lo que hay ahora (un video que ya no está o un tema que ya domina, no deja un botón muerto).
import { createHash } from 'node:crypto';
import { modeloAlumno, tarjetaPara } from './instructor.js';
import { camino, videoDeMateria } from './progreso.js';
import { leerVideos } from './profesor.js';

// Un tema es flojo si falló alguna de las que respondió y acierta menos del 70 %.
export const FLOJO = 0.7;
const MAX_TEMAS = 3;
const huella = texto => createHash('sha256').update(String(texto)).digest('hex').slice(0, 12);

// → { alcance: 'tema' | 'materia' | 'varias' | null, evidencia, temas: [...], video, repaso: { n }, guia }
export function diagnostico(db, usuarioId, paquete, ahoraMs = Date.now(), { examenId = null } = {}) {
  const vacio = { alcance: null, evidencia: null, temas: [], video: null, repaso: { n: 0 }, guia: null };
  if (!paquete) return vacio;
  const m = modeloAlumno(db, usuarioId, paquete, ahoraMs);
  vacio.repaso.n = m.repasoHoy ?? 0;
  const c = camino(db, usuarioId, paquete, ahoraMs);
  const abiertos = new Set(c.materias.flatMap(x => x.temas.filter(t => t.estado !== 'bloqueado').map(t => `${x.id}/${t.id}`)));
  // Los errores de un examen (si el consejo es de un examen) pesan además.
  const delExamen = new Map();
  if (Number.isSafeInteger(examenId)) {
    for (const f of db.prepare('SELECT r.tema, i.materia, COUNT(*) AS n FROM academia_respuestas r JOIN academia_intentos i ON i.id = r.intento_id WHERE r.intento_id = ? AND r.usuario_id = ? AND r.correcta = 0 GROUP BY r.tema').all(examenId, usuarioId)) {
      delExamen.set(`${f.materia}/${f.tema}`, f.n);
    }
  }
  const vistos = m.temas.filter(t => t.vistas > 0 && abiertos.has(`${t.materia}/${t.tema}`)).map(t => {
    const id = `${t.materia}/${t.tema}`;
    const fallos = t.vistas - t.bien;
    return { id, materia: t.materia, tema: t.tema, titulo: t.titulo, bien: t.bien, de: t.vistas, fallos, peso: fallos + (delExamen.get(id) ?? 0) };
  });
  const decision = decidirAlcance(vistos, delExamen);
  if (!decision) return vacio;
  const { alcance, elegidos, evidencia } = decision;
  const temas = elegidos.map(t => {
    const obj = paquete.materias.find(x => x.id === t.materia)?.temas.find(x => x.id === t.tema) ?? null;
    const ideas = [...new Set([...m.ideas.filter(x => x.materia === t.materia && x.tema === t.tema).map(x => x.idea),
      ...m.repetidas.filter(x => x.materia === t.materia && x.tema === t.tema).map(x => x.idea)].filter(x => typeof x === 'string' && x))].slice(0, 2);
    const tarjeta = obj ? tarjetaPara(obj, ideas.join(' ') || t.titulo) : null;
    const { peso, fallos, ...resto } = t;
    return { ...resto, ideas, tarjeta: tarjeta ? tarjeta.indice + 1 : null };
  });
  let videos = [];
  try { videos = leerVideos(db); } catch { videos = []; }
  return { alcance, evidencia, temas, video: elegirVideo(paquete, alcance, temas, videos), repaso: { n: m.repasoHoy ?? 0 }, guia: { materia: temas[0].materia, tema: temas[0].tema, tarjeta: temas[0].tarjeta } };
}

// El ALCANCE (en código, no en el prompt). vistos: [{ id, materia, titulo, bien, de, fallos, peso }] de los temas que
// respondió. → null (nada flojo) o { alcance, elegidos, evidencia }:
//  - 2 o más temas flojos de la MISMA materia (la del que más pesa) → 'materia' (un repaso general, hasta 3 temas);
//  - un solo tema flojo en su materia → 'tema' (solo ese; «bien_otros» = cuántos de esa materia van bien);
//  - flojos en varias materias, uno en cada una → 'varias' (los 2 que más pesan).
const flojo = t => t.fallos > 0 && t.bien / t.de < FLOJO;
export function decidirAlcance(vistos, delExamen = new Map()) {
  const debiles = vistos.filter(t => flojo(t) || delExamen.has(t.id)).sort((a, b) => b.peso - a.peso || a.bien / a.de - b.bien / b.de || a.id.localeCompare(b.id));
  if (!debiles.length) return null;
  const top = debiles[0];
  const mismaMateria = debiles.filter(t => t.materia === top.materia);
  if (mismaMateria.length >= 2) return { alcance: 'materia', elegidos: mismaMateria.slice(0, MAX_TEMAS), evidencia: { materia: top.materia, n: mismaMateria.length } };
  if (debiles.length === 1) {
    return { alcance: 'tema', elegidos: [top], evidencia: { materia: top.materia, tema: top.titulo, fallos: top.fallos, de: top.de, bien_otros: vistos.filter(t => t.materia === top.materia && t.id !== top.id && !flojo(t)).length } };
  }
  const elegidos = debiles.slice(0, 2);
  return { alcance: 'varias', elegidos, evidencia: { materias: new Set(debiles.map(t => t.materia)).size, temas: elegidos.map(t => t.titulo) } };
}

// UN video que existe: para una materia entera, el de la materia (o uno de YouTube de la materia); para un tema, uno de
// ese tema (YouTube), el capítulo del video de la materia, o el clip de una de sus tarjetas. Si no hay, null.
export function elegirVideo(paquete, alcance, temas, videos = []) {
  if (!temas.length) return null;
  const materia = temas[0].materia;
  const m = paquete.materias.find(x => x.id === materia);
  const ids = new Set(temas.map(t => t.tema));
  const lista = videos.filter(v => v.materia === materia);
  const youtube = v => ({ id: `yt-${huella(v.url)}`, tipo: 'youtube', titulo: v.titulo, url: v.url, materia, tema: v.tema || null });
  const deMateria = m && videoDeMateria(paquete, m) ? { id: `mat-${materia}`, tipo: 'materia', titulo: m.video?.titulo ?? null, materia, tema: null } : null;
  if (alcance === 'materia') {
    if (deMateria) return deMateria;
    // De YouTube: el que cubre más de sus temas flojos (uno sin tema cubre la materia entera).
    const cubre = v => (!v.tema ? ids.size + 0.5 : ids.has(v.tema) ? 1 : 0);
    const mejor = [...lista].sort((a, b) => cubre(b) - cubre(a))[0];
    return mejor && cubre(mejor) > 0 ? youtube(mejor) : null;
  }
  const t = temas[0];
  const exacto = lista.find(v => v.tema === t.tema);
  if (exacto) return youtube(exacto);
  if (deMateria) return { ...deMateria, id: `mat-${materia}-${t.tema}`, tema: t.tema };
  const obj = m?.temas.find(x => x.id === t.tema);
  const conClip = (obj?.secciones ?? []).map((s, i) => ({ s, i })).filter(x => x.s?.clip?.archivo);
  if (conClip.length) {
    const x = conClip.find(y => y.i + 1 === t.tarjeta) ?? conClip[0];
    return { id: `clip-${materia}-${t.tema}-${x.i + 1}`, tipo: 'clip', titulo: x.s.titulo ?? null, materia, tema: t.tema, tarjeta: x.i + 1 };
  }
  const general = lista.find(v => !v.tema);
  return general ? youtube(general) : null;
}

// Lo que va a la IA (sin nombre ni usuario: solo cifras y textos del paquete).
export function cifrasConsejo(d, { examen = null } = {}) {
  return {
    alcance: d.alcance, evidencia: d.evidencia,
    temas: d.temas.map(t => ({ id: t.id, tema: t.titulo, bien: t.bien, de: t.de, ideas_equivocadas: t.ideas })),
    video: d.video ? { tipo: d.video.tipo, titulo: d.video.titulo ?? null } : null,
    repasos_pendientes: d.repaso.n, ...(examen ? { examen } : {}),
  };
}

// Lo que ve la pantalla: lo guardado (textos por id) + el diagnóstico de AHORA. Lo de antes (forma vieja) va tal cual.
export function consejoParaVer(guardado, d) {
  if (!guardado || guardado.forma !== 2) return guardado;
  const conf = guardado.confusiones && typeof guardado.confusiones === 'object' ? guardado.confusiones : {};
  return {
    forma: 2, saludo: guardado.saludo ?? '', porque: guardado.porque ?? '', alcance: d.alcance, evidencia: d.evidencia,
    temas: d.temas.map(({ ideas, ...t }) => ({ ...t, confusion: typeof conf[t.id] === 'string' ? conf[t.id] : '' })),
    video: d.video ? { ...d.video, porque: guardado.videoId === d.video.id ? guardado.videoPorque ?? '' : '' } : null,
    repaso: d.repaso, guia: d.guia, modelo: guardado.modelo ?? null, en: guardado.en ?? null,
  };
}
