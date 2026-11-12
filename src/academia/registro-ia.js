// Academia 0.12.9: los DATOS para el «Registro de la IA» del administrador (la pantalla la hace otra rama: aquí solo las
// funciones, puras y sin red; nada de esto llama a la IA). Todo se lee de «ajustes» (sin cambio de base) y nada se borra:
//
//   generadoPara(db, usuarioId)          → [{ clave, tipo, fecha, texto, costoMicro, modelo, oculto }]  todo lo generado
//                                          SOLO para ese alumno (preparación, consejo, plan de hoy, dudas, chat), lo más nuevo primero.
//   preparacionesDe(db, usuarioId)       → [{ clave, fecha, tema, intro, plan, examen, conclusion, costoMicro }]
//   memoriaDe(db, usuarioId, { limite }) → la «Memoria del tutor» (src/academia/tutor.js, memoriaTutor): [{ tipo, tema,
//                                          temaTitulo, pct, bien, mal, tgBien, tgMal, minutos, conclusion: { clave, vars }, en }].
//                                          conclusion.clave → texto «tutor.memoria.<clave>» de public/i18n.
//   metaDe(db, usuarioId, paquete)       → { meta, foco, proximaClase } (la meta de la IA con él, su foco y lo preparado).
//   biblioteca(db, { tipo, buscar, limite, desde }) → { items: [{ clave, tipo, fecha, texto, reusos, costoMicro,
//                                          ahorroMicro, modelo, oculto }], total }   lo COMPARTIDO (explicación, mini-clase,
//                                          explícamelo mejor, profundizar, pregunta personalizada), con veces reutilizado y
//                                          ahorro (= reusos × costo). tipo: uno de TIPOS_COMPARTIDOS o null (todos).
//   ocultar(db, clave, oculto = true)    → { clave, oculto }   «ocultar» uno malo: se MARCA (academia.ia_oculto.<…> = su
//                                          fecha); leerGuardado deja de mostrarlo a los alumnos. Nunca se borra.
//   contarReuso(db, clave)               → las veces que lo guardado sirvió a otro pedido (lo llama el instructor).
//   analisisTestGuide(db, paquete, materia, tema) → el «Análisis del Test Guide» de un tema (sin IA): [{ numero, tarjeta,
//                                          tarjetaTitulo, trampas, dificultad: { n, malPct } | null }] (dificultad = lo que
//                                          fallan TODOS los alumnos en su primera y demás respuestas, sin nombres).
//
// Los textos son lo que escribió la IA ya revisado (nunca lo que se le preguntó ni el nombre del alumno).
import { CLAVE_GUARDADO } from './instructor-ia.js';
import { memoriaTutor, prioridad, preguntasDeMateria, analisisTema, dificultades } from './tutor.js';
import { leerPuntero, proximoTema } from './preparar-clase.js';

export const TIPOS_COMPARTIDOS = Object.freeze({ explica: 'explicacion', miniclase: 'miniclase', tarjeta: 'explicar_mejor', profundiza: 'profundizar', personal: 'pregunta_personalizada' });
export const TIPOS_DEL_ALUMNO = Object.freeze({ preparado: 'preparacion', consejo: 'consejo', plandia: 'plan_de_hoy', duda: 'duda', chat: 'profesor' });
const sufijo = clave => String(clave).slice('academia.ia.'.length);
const claveReuso = clave => `academia.ia_reuso.${sufijo(clave)}`;
const claveOculto = clave => `academia.ia_oculto.${sufijo(clave)}`;
const leer = (db, clave) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
const json = t => { try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const corto = (t, n = 220) => (typeof t === 'string' ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : '');

// El texto que se muestra de cada tipo (lo principal de lo que escribió).
export function textoDe(tipo, v) {
  if (!v) return '';
  if (tipo === 'explicacion') return v.explicacion ?? '';
  if (tipo === 'miniclase') return v.concepto ?? '';
  if (tipo === 'explicar_mejor') return v.explicacion ?? '';
  if (tipo === 'profundizar') return [v.porQue, v.trampa].filter(Boolean).join(' · ');
  if (tipo === 'pregunta_personalizada') return (v.preguntas ?? []).map(x => x.enunciado).join(' · ');
  if (tipo === 'preparacion') return v.intro ?? '';
  if (tipo === 'consejo') return v.consejo ?? '';
  if (tipo === 'plan_de_hoy') return (v.pasos ?? []).map(x => x.porque).filter(Boolean).join(' · ') || v.titulo || '';
  return v.respuesta ?? '';
}
const tipoDeClave = clave => {
  const k = sufijo(clave).split('.')[0];
  return TIPOS_COMPARTIDOS[k] ?? TIPOS_DEL_ALUMNO[k] ?? null;
};

export function contarReuso(db, clave) {
  if (typeof clave !== 'string' || !CLAVE_GUARDADO.test(clave)) return 0;
  const n = (Number(leer(db, claveReuso(clave))) || 0) + 1;
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(claveReuso(clave), String(n), new Date().toISOString());
  return n;
}
export const reusosDe = (db, clave) => Number(leer(db, claveReuso(clave))) || 0;

export function ocultar(db, clave, oculto = true) {
  if (typeof clave !== 'string' || !CLAVE_GUARDADO.test(clave)) return null;
  const v = json(leer(db, clave));
  if (!v) return null;
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(claveOculto(clave), oculto ? String(v.en ?? '') : '', new Date().toISOString());
  return { clave, oculto: Boolean(oculto) };
}
const estaOculto = (db, clave, v) => { const o = leer(db, claveOculto(clave)); return Boolean(o) && o === String(v?.en ?? ''); };

function fila(db, f) {
  const v = json(f.valor);
  if (!v || !CLAVE_GUARDADO.test(f.clave)) return null;
  const tipo = tipoDeClave(f.clave);
  const reusos = reusosDe(db, f.clave);
  const costoMicro = Number.isSafeInteger(v.costoMicro) ? v.costoMicro : null;
  return { clave: f.clave, tipo, fecha: v.en ?? f.en, texto: corto(textoDe(tipo, v)), textoCompleto: textoDe(tipo, v), reusos, costoMicro, ahorroMicro: costoMicro != null ? reusos * costoMicro : null, modelo: v.modelo ?? null, oculto: estaOculto(db, f.clave, v), valor: v };
}

export function biblioteca(db, { tipo = null, buscar = '', limite = 100, desde = 0 } = {}) {
  const prefijos = Object.entries(TIPOS_COMPARTIDOS).filter(([, t]) => !tipo || t === tipo).map(([k]) => `academia.ia.${k}.`);
  const b = String(buscar ?? '').trim().toLowerCase();
  let items = [];
  for (const pre of prefijos) {
    for (const f of db.prepare('SELECT clave, valor, actualizado_en AS en FROM ajustes WHERE clave > ? AND clave < ?').all(pre, `${pre}~`)) {
      const x = fila(db, f);
      if (x && (!b || x.textoCompleto.toLowerCase().includes(b))) items.push(x);
    }
  }
  items.sort((a, z) => z.reusos - a.reusos || String(z.fecha).localeCompare(String(a.fecha)));
  const total = items.length;
  items = items.slice(Math.max(0, desde), Math.max(0, desde) + Math.min(500, Math.max(1, limite))).map(({ valor, ...resto }) => resto);
  return { items, total };
}

export function generadoPara(db, usuarioId, { limite = 100 } = {}) {
  const id = Number(usuarioId);
  const lista = [];
  for (const k of Object.keys(TIPOS_DEL_ALUMNO)) {
    const pre = `academia.ia.${k}.${id}.`;
    for (const f of db.prepare('SELECT clave, valor, actualizado_en AS en FROM ajustes WHERE clave > ? AND clave < ?').all(pre, `${pre}~`)) {
      const x = fila(db, f);
      if (x) { const { valor, textoCompleto, ...resto } = x; lista.push(resto); }
    }
  }
  return lista.sort((a, z) => String(z.fecha).localeCompare(String(a.fecha))).slice(0, limite);
}

export function preparacionesDe(db, usuarioId) {
  const pre = `academia.ia.preparado.${Number(usuarioId)}.`;
  return db.prepare('SELECT clave, valor, actualizado_en AS en FROM ajustes WHERE clave > ? AND clave < ?').all(pre, `${pre}~`)
    .map(f => ({ clave: f.clave, v: json(f.valor) })).filter(x => x.v)
    .map(({ clave, v }) => ({ clave, fecha: v.en, tema: v.tema ?? null, intro: v.intro ?? '', plan: v.plan ?? [], examen: v.examen ?? null, conclusion: v.conclusion ?? null, costoMicro: v.costoMicro ?? null }))
    .sort((a, z) => String(z.fecha).localeCompare(String(a.fecha)));
}

export const memoriaDe = (db, usuarioId, { limite = 30 } = {}) => memoriaTutor(db, usuarioId, { limite });

// La meta de la IA con él (siempre la misma, como en cada pedido), su foco (lo que más pesa y falla) y su próxima clase.
export function metaDe(db, usuarioId, paquete, ahora = Date.now()) {
  const sigue = paquete ? proximoTema(db, usuarioId, paquete, ahora) : null;
  const pt = leerPuntero(db, usuarioId);
  return {
    meta: 'tutor.meta.texto', foco: paquete ? prioridad(db, usuarioId, paquete, ahora) : null,
    proximaClase: sigue ? { ...sigue, preguntasMateria: preguntasDeMateria(paquete, sigue.materia), preparada: pt?.tema === `${sigue.materia}/${sigue.tema}` ? { dia: pt.dia, clave: pt.clave } : null } : null,
  };
}

export function analisisTestGuide(db, paquete, materia, tema) {
  const a = analisisTema(paquete, materia, tema);
  if (!a) return null;
  const dif = dificultades(db, a.preguntas.map(x => x.id));
  return { materia, tema, titulo: a.titulo, numero: a.numero, preguntas: a.preguntas.map(x => ({ numero: x.numero, tarjeta: x.tarjeta, tarjetaTitulo: x.tarjetaTitulo, trampas: x.trampas, dificultad: dif.get(x.id) ?? null })) };
}
