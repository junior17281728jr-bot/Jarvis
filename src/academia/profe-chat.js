// Academia 0.14.22 (pedido del dueño): el «Profesor virtual» conoce la historia del alumno y actúa como un profesor de
// verdad, en TODAS las clases (las materias del Test Guide y el oral). Puro (sin red ni IA): lo usa src/api/instructor.js.
//  - historialEstudio: por materia y tema, lo que hizo (clase leída, prácticas, test del tema, examen de la materia), el
//    oral, los repasos que le tocan, cuántos días hace de su última actividad y el diagnóstico del consejo
//    (src/academia/consejo-ia.js). El EXAMEN es la señal que más pesa (PESO_EXAMEN veces una práctica).
//  - contradicciones: lo que no cuadra («fallaste en las prácticas de Hipoxia, pero en el examen te fue bien»), en las
//    dos direcciones y solo con suficientes respuestas.
//  - botones: los pasos que se pueden dar AHORA (la clase, practicar lo fallado, el test del tema, el examen de la
//    materia, la práctica del oral, el repaso). Cada uno se revisa aquí (tema abierto, examen que existe, errores que
//    existen, repaso > 0, tema oral que existe) y otra vez al leer el historial: nunca un botón muerto.
//  - respuestaSinIa: sin IA (o con la IA en pausa, sin minutos…), la misma lectura en 2–4 líneas (claves de texto con
//    sus datos: se leen en el idioma del alumno) y los mismos botones.
//  - cifrasProfe: lo que va a la IA. Sin nombre, sin usuario y SIN ids internos: solo títulos y números.
import { readFileSync } from 'node:fs';
import { camino, temasLeidos } from './progreso.js';
import { diagnostico } from './consejo-ia.js';
import { caminoOral, repasoOral, examenesOralDe, hayOral } from './oral.js';

export const PESO_EXAMEN = 3;
// Lo mínimo de cada lado para hablar de una contradicción (con 1 respuesta no se acusa a nadie).
export const MINIMO = 2;
const BIEN = 80;
const MAL = 70;
const MAX_BOTONES = 4;
const DIA = 86_400_000;
const pct = (a, b) => (b > 0 ? Math.round((a * 100) / b) : null);
const ID = /^[a-z0-9_-]{1,64}$/;
export const TIPOS_BOTON = Object.freeze(['clase', 'practicar', 'test', 'examen', 'oral', 'repaso']);

// Los nombres de las materias (para la IA: nunca su id). Del mismo archivo de textos de la pantalla.
let nombres = null;
function nombreMateria(id, idioma = 'es') {
  if (!nombres) {
    nombres = {};
    for (const l of ['es', 'en']) {
      try { nombres[l] = JSON.parse(readFileSync(new URL(`../../public/i18n/${l}.json`, import.meta.url), 'utf8')); } catch { nombres[l] = {}; }
    }
  }
  const x = nombres[idioma === 'en' ? 'en' : 'es']?.[`acad.materia.${id}`];
  return typeof x === 'string' ? x : null;
}

// ---------- La historia (por materia y tema) ----------
export function historialEstudio(db, usuarioId, paquete, ahoraMs = Date.now()) {
  if (!paquete) return null;
  const c = camino(db, usuarioId, paquete, ahoraMs);
  const leidos = temasLeidos(db, usuarioId);
  // La ÚLTIMA respuesta a cada pregunta en cada lugar (práctica, test del tema, examen): repetir no infla nada.
  const ultima = { practica: new Map(), test: new Map(), examen: new Map() };
  const filas = db.prepare('SELECT r.pregunta, r.correcta, i.tipo FROM academia_respuestas r JOIN academia_intentos i ON i.id = r.intento_id WHERE r.usuario_id = ? ORDER BY r.id').all(usuarioId);
  for (const f of filas) {
    if (!paquete.preguntas.has(f.pregunta)) continue;
    ultima[f.tipo === 'examen' ? 'examen' : f.tipo === 'tema' ? 'test' : 'practica'].set(f.pregunta, f.correcta === 1);
  }
  const cuenta = (mapa, ids) => {
    const vistas = ids.filter(id => mapa.has(id));
    return { bien: vistas.filter(id => mapa.get(id)).length, de: vistas.length };
  };
  const intentos = db.prepare("SELECT tipo, materia, tema, total, aciertos, aprobado, terminado_en FROM academia_intentos WHERE usuario_id = ? AND terminado_en IS NOT NULL AND tipo IN ('tema', 'examen') ORDER BY id").all(usuarioId);
  const resumen = lista => (lista.length ? {
    veces: lista.length, mejor: Math.max(...lista.map(i => pct(i.aciertos, i.total) ?? 0)), ultimo: pct(lista.at(-1).aciertos, lista.at(-1).total) ?? 0,
    aprobado: lista.some(i => i.aprobado === 1),
  } : null);
  const materias = paquete.materias.map(m => {
    const cm = c.materias.find(x => x.id === m.id);
    const temas = m.temas.map(t => {
      const estado = cm?.temas.find(x => x.id === t.id)?.estado ?? 'bloqueado';
      const practica = cuenta(ultima.practica, t.preguntas);
      const test = cuenta(ultima.test, t.preguntas);
      const examen = cuenta(ultima.examen, t.preguntas);
      const estudio = { bien: practica.bien + test.bien, de: practica.de + test.de };
      // El examen pesa más: cada respuesta del examen cuenta PESO_EXAMEN veces.
      const dePeso = PESO_EXAMEN * examen.de + estudio.de;
      return {
        materia: m.id, tema: t.id, titulo: t.titulo, estado, clase: leidos.has(`${m.id}/${t.id}`) || estado === 'aprobado',
        practica, test: { ...test, ...(resumen(intentos.filter(i => i.tipo === 'tema' && i.materia === m.id && i.tema === t.id)) ?? { veces: 0 }) }, examen, estudio,
        dominio: dePeso ? pct(PESO_EXAMEN * examen.bien + estudio.bien, dePeso) : null,
      };
    });
    return { materia: m.id, examen: resumen(intentos.filter(i => i.tipo === 'examen' && i.materia === m.id)), disponible: Boolean(cm?.examen?.disponible || cm?.examen?.saltable), temas };
  });
  // El oral (aparte del Test Guide).
  let oral = null;
  if (hayOral(paquete)) {
    const co = caminoOral(db, usuarioId, paquete);
    const rep = repasoOral(db, usuarioId, paquete);
    oral = {
      materias: co.materias.map(x => ({ materia: x.id, pct: x.pct, bien: x.bien, preguntas: x.preguntas, examen: x.examen })),
      errores: rep?.errores ?? 0, flojos: (rep?.temas ?? []).slice(0, 3), examenes: examenesOralDe(db, usuarioId, paquete), listo: co.listo ?? null,
    };
  }
  // La última actividad (un intento terminado o una respuesta del oral), en días.
  const ultimaEn = [
    db.prepare('SELECT MAX(terminado_en) AS en FROM academia_intentos WHERE usuario_id = ?').get(usuarioId)?.en,
    db.prepare("SELECT MAX(creada_en) AS en FROM academia_extra_respuestas WHERE usuario_id = ? AND materia LIKE 'oral\\_%' ESCAPE '\\'").get(usuarioId)?.en,
  ].filter(Boolean).map(x => Date.parse(x)).filter(Number.isFinite);
  const d = diagnostico(db, usuarioId, paquete, ahoraMs);
  return {
    materias, oral, repasos: d.repaso?.n ?? 0, haceDias: ultimaEn.length ? Math.max(0, Math.floor((ahoraMs - Math.max(...ultimaEn)) / DIA)) : null,
    diagnostico: d, abiertos: new Set(c.materias.flatMap(x => x.temas.filter(t => t.estado !== 'bloqueado').map(t => `${x.id}/${t.id}`))),
  };
}

// ---------- Lo que no cuadra ----------
// → [{ tipo: 'practica_mal_examen_bien' | 'practica_bien_examen_mal', materia, tema, titulo, estudio, examen }] (hasta 3).
export function contradicciones(h) {
  const lista = [];
  for (const m of h?.materias ?? []) {
    for (const t of m.temas) {
      if (t.estudio.de < MINIMO || t.examen.de < MINIMO) continue;
      const e = pct(t.examen.bien, t.examen.de);
      const s = pct(t.estudio.bien, t.estudio.de);
      const tipo = s < MAL && e >= BIEN ? 'practica_mal_examen_bien' : s >= BIEN && e < MAL ? 'practica_bien_examen_mal' : null;
      if (tipo) lista.push({ tipo, materia: t.materia, tema: t.tema, titulo: t.titulo, estudio: { ...t.estudio }, examen: { ...t.examen }, distancia: Math.abs(e - s) });
    }
  }
  return lista.sort((a, b) => b.distancia - a.distancia || b.examen.de - a.examen.de).slice(0, 3).map(({ distancia, ...x }) => x);
}

// ---------- Los botones (revisados) ----------
const temaDe = (paquete, materia, tema) => paquete?.materias.find(m => m.id === materia)?.temas.find(t => t.id === tema) ?? null;
const temaOral = (paquete, materia, tema) => paquete?.oral?.materias?.find(m => m.id === materia)?.temas?.find(t => t.id === tema) ?? null;
// Un botón vale si apunta a algo que existe y se puede abrir AHORA. → el botón limpio (solo campos conocidos) o null.
export function validarBoton(b, paquete, h) {
  if (!b || typeof b !== 'object' || !TIPOS_BOTON.includes(b.tipo)) return null;
  if (b.tipo === 'repaso') return h?.repasos > 0 ? { tipo: 'repaso', n: h.repasos } : null;
  if (b.tipo === 'oral') {
    if (!h?.oral) return null;
    if (b.errores === true) return h.oral.errores > 0 ? { tipo: 'oral', errores: true, n: h.oral.errores } : null;
    if (!ID.test(String(b.materia)) || !ID.test(String(b.tema))) return null;
    const t = temaOral(paquete, b.materia, b.tema);
    return t ? { tipo: 'oral', materia: b.materia, tema: b.tema, titulo: t.titulo } : null;
  }
  if (!ID.test(String(b.materia))) return null;
  if (b.tipo === 'examen') {
    const m = h?.materias?.find(x => x.materia === b.materia);
    return m?.disponible ? { tipo: 'examen', materia: b.materia } : null;
  }
  if (!ID.test(String(b.tema)) || !h?.abiertos?.has(`${b.materia}/${b.tema}`)) return null;
  const t = temaDe(paquete, b.materia, b.tema);
  if (!t) return null;
  const base = { tipo: b.tipo, materia: b.materia, tema: b.tema, titulo: t.titulo };
  if (b.tipo === 'clase') {
    const n = Number(b.tarjeta);
    return { ...base, ...(Number.isSafeInteger(n) && n >= 1 && n <= (t.secciones ?? []).length ? { tarjeta: n } : {}) };
  }
  if (b.tipo === 'test') return t.preguntas.length ? base : null;
  return t.preguntas.length ? base : null; // practicar: lo fallado (o, si ya no queda, la práctica del instructor de ese tema)
}
export function validarBotones(lista, paquete, h) {
  const vistos = new Set();
  const out = [];
  for (const b of Array.isArray(lista) ? lista : []) {
    const v = validarBoton(b, paquete, h);
    if (!v) continue;
    const clave = [v.tipo, v.materia, v.tema, v.errores].join('|');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(v);
    if (out.length >= MAX_BOTONES) break;
  }
  return out;
}

// Los pasos que propone (en orden de importancia), ya revisados.
export function botonesProfe(h, contras, paquete) {
  if (!h) return [];
  const p = [];
  const d = h.diagnostico;
  const c = contras[0];
  if (c?.tipo === 'practica_mal_examen_bien') p.push({ tipo: 'practicar', materia: c.materia, tema: c.tema }, { tipo: 'test', materia: c.materia, tema: c.tema });
  if (c?.tipo === 'practica_bien_examen_mal') {
    const g = d?.guia?.materia === c.materia && d?.guia?.tema === c.tema ? d.guia.tarjeta : null;
    p.push({ tipo: 'clase', materia: c.materia, tema: c.tema, tarjeta: g }, { tipo: 'practicar', materia: c.materia, tema: c.tema });
  }
  if (d?.guia) p.push({ tipo: 'clase', materia: d.guia.materia, tema: d.guia.tema, tarjeta: d.guia.tarjeta }, { tipo: 'practicar', materia: d.guia.materia, tema: d.guia.tema });
  if (h.repasos > 0) p.push({ tipo: 'repaso' });
  // El examen de una materia que ya domina (con todo lo visto ≥ 85 % y sin haberlo aprobado).
  for (const m of h.materias) {
    const vistos = m.temas.filter(t => t.dominio != null);
    if (!m.examen?.aprobado && m.disponible && vistos.length === m.temas.length && vistos.every(t => t.dominio >= 85)) p.push({ tipo: 'examen', materia: m.materia });
  }
  // Sin nada flojo: la siguiente clase abierta.
  if (!d?.guia && !c) {
    const siguiente = h.materias.flatMap(m => m.temas).find(t => t.estado === 'abierto');
    if (siguiente) p.push({ tipo: 'clase', materia: siguiente.materia, tema: siguiente.tema });
  }
  if (h.oral?.errores > 0) p.push(h.oral.flojos[0] ? { tipo: 'oral', materia: h.oral.flojos[0].materia, tema: h.oral.flojos[0].tema } : { tipo: 'oral', errores: true });
  return validarBotones(p, paquete, h);
}

// ---------- Sin IA: la misma lectura, en pocas líneas ----------
// → [{ clave, vars }] (2–4). Las claves viven en public/i18n («profe.*»).
export function respuestaSinIa(h, contras) {
  if (!h) return [{ clave: 'profe.sin_datos', vars: {} }];
  const lineas = [];
  const c = contras[0];
  if (c) lineas.push({ clave: `profe.contra.${c.tipo}`, vars: { tema: c.titulo, sbien: c.estudio.bien, sde: c.estudio.de, ebien: c.examen.bien, ede: c.examen.de } });
  const d = h.diagnostico;
  const t0 = d?.temas?.[0];
  if (d?.alcance === 'tema' && t0 && !(c && c.tema === t0.tema)) lineas.push({ clave: 'profe.diag.tema', vars: { tema: t0.titulo, bien: t0.bien, de: t0.de } });
  else if (d?.alcance === 'materia') lineas.push({ clave: 'profe.diag.materia', vars: { materia: d.evidencia?.materia ?? '', n: d.temas.length } });
  else if (d?.alcance === 'varias') lineas.push({ clave: 'profe.diag.varias', vars: { temas: d.temas.map(t => t.titulo).join(' · ') } });
  // Un examen de materia que no pasó (pesa más que todo lo demás).
  const caido = h.materias.find(m => m.examen && !m.examen.aprobado);
  if (caido && lineas.length < 3) lineas.push({ clave: 'profe.examen.no', vars: { materia: caido.materia, pct: caido.examen.ultimo } });
  if (!lineas.length) lineas.push({ clave: h.materias.some(m => m.temas.some(t => t.dominio != null)) ? 'profe.bien' : 'profe.empezar', vars: {} });
  if (h.oral?.errores > 0 && lineas.length < 3) lineas.push({ clave: 'profe.oral.errores', vars: { n: h.oral.errores } });
  if (h.repasos > 0 && lineas.length < 4) lineas.push({ clave: 'profe.repaso', vars: { n: h.repasos } });
  if (h.haceDias != null && h.haceDias >= 4 && lineas.length < 4) lineas.unshift({ clave: 'profe.volviste', vars: { n: h.haceDias } });
  return lineas.slice(0, 4);
}

// Todo junto, para la ruta: { lineas, botones, contradicciones, historial }.
export function profe(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const h = historialEstudio(db, usuarioId, paquete, ahoraMs);
  const contras = contradicciones(h);
  return { historial: h, contradicciones: contras, lineas: respuestaSinIa(h, contras), botones: botonesProfe(h, contras, paquete) };
}

// ---------- Lo que va a la IA (sin nombres ni ids) ----------
const QUE_BOTON = Object.freeze({ clase: 'abrir la clase', practicar: 'practicar las que falló', test: 'el test del tema', examen: 'el examen de la materia', oral: 'practicar el oral', repaso: 'el repaso de hoy' });
export function cifrasProfe(x, { idioma = 'es', maxTemas = 8 } = {}) {
  const h = x?.historial;
  if (!h) return null;
  const nm = id => nombreMateria(id, idioma) ?? `materia ${h.materias.findIndex(m => m.materia === id) + 1}`;
  const temas = h.materias.flatMap(m => m.temas.filter(t => t.estudio.de || t.examen.de || t.clase).map(t => ({
    materia: nm(m.materia), tema: t.titulo, clase_leida: t.clase, practica: t.practica, test_tema: { bien: t.test.bien, de: t.test.de, veces: t.test.veces ?? 0, aprobado: t.test.aprobado ?? false },
    examen_materia: t.examen, dominio_pct: t.dominio,
  }))).sort((a, b) => (a.dominio_pct ?? 101) - (b.dominio_pct ?? 101)).slice(0, maxTemas);
  const nombreOral = id => nombreMateria(id, idioma) ?? 'oral';
  return {
    peso_examen: PESO_EXAMEN,
    examenes_de_materia: h.materias.filter(m => m.examen).map(m => ({ materia: nm(m.materia), veces: m.examen.veces, mejor_pct: m.examen.mejor, ultimo_pct: m.examen.ultimo, aprobado: m.examen.aprobado })),
    temas,
    contradicciones: x.contradicciones.map(c => ({ tipo: c.tipo, tema: c.titulo, practica_y_tests: c.estudio, examen: c.examen })),
    diagnostico: h.diagnostico?.alcance ? { alcance: h.diagnostico.alcance, temas: h.diagnostico.temas.map(t => ({ tema: t.titulo, bien: t.bien, de: t.de, ideas_equivocadas: t.ideas ?? [] })) } : null,
    oral: h.oral ? { capitulos: h.oral.materias.filter(m => m.bien || m.examen?.veces).map(m => ({ capitulo: nombreOral(m.materia), pct: m.pct, examen_aprobado: m.examen?.aprobado ?? false })), errores_pendientes: h.oral.errores, temas_flojos: h.oral.flojos.map(t => t.titulo) } : null,
    repasos_pendientes: h.repasos, dias_sin_estudiar: h.haceDias,
    botones_que_pone_la_app: x.botones.map(b => ({ que: QUE_BOTON[b.tipo], tema: b.titulo ?? (b.tipo === 'examen' ? nm(b.materia) : null) })),
  };
}
