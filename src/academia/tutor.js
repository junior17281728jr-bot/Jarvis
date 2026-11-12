// Academia 0.12.9: el «tutor» del alumno SIN IA (lo barato y seguro; lo que la IA usa encima de esto).
// Puro (sin red): lo usa el servidor web (src/api/tutor.js y src/api/instructor.js). Nada de aquí llama a la IA.
//  - L/R «Análisis del Test Guide» por tema: TODAS las preguntas del Test Guide del tema, la tarjeta de la clase que la
//    explica (por los conceptos de src/academia/conceptos.js), las trampas típicas (las ideas equivocadas del paquete) y
//    la dificultad (lo que fallan todos). Se calcula UNA vez por versión del paquete (en memoria) y es igual para todos.
//    Nunca lleva la respuesta del Test Guide: lo que va a la IA o a la pantalla de una pregunta no respondida es su número.
//  - S el peso en el examen: cuántas preguntas del Test Guide salen de cada concepto (lo usa «Mi repaso» para ordenar).
//  - T «Memoria del tutor»: una fila por clase o intento terminado (aditiva: nunca se borra ni se recorta), con lo que
//    hizo, la nota, los conceptos y las preguntas del Test Guide (solo números) bien y mal, el tiempo y una conclusión
//    de una línea (una clave de texto con sus datos: se lee en el idioma del alumno).
//  - U «¿Tomo el examen final?»: SÍ / TODAVÍA NO + % (de src/academia/preparado.js) + 2–4 porqués cortos.
//  - I las señales de estilo (números, nunca texto): 👍/🤔, «Explícamelo mejor», «Profundizar», tiempo en tarjetas…
//  - F/G lo que pasó de verdad («hoy reforzamos…», «preparé tu próxima clase…») y el primer mensaje del Profesor.
// Ninguna función pone el nombre del alumno: el «Hola, piloto Juan» lo arma la pantalla alrededor del texto.
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { conceptosDe, conceptoDePregunta, nombreConcepto } from './conceptos.js';
import { camino, diaDe } from './progreso.js';
import { miRepaso } from './fallas.js';
import { veredicto } from './preparado.js';
import { busquedaYoutube, videosDeTema } from './profesor.js';

const cacheAnalisis = new WeakMap();
const temaDe = (p, materia, tema) => p?.materias.find(m => m.id === materia)?.temas.find(t => t.id === tema) ?? null;
const numeroDe = q => String(q?.original?.numero ?? q?.id ?? '');

// ---------- L / R: el análisis del Test Guide (por versión del paquete, en memoria, sin IA) ----------
// → { temas: Map('materia/tema' → analisisTema), materias: Map(materia → { preguntas, cubiertas, faltan: [números] }) }.
// analisisTema = { materia, tema, titulo, numero, preguntas: [{ id, numero, tarjeta (índice; -1 = ninguna), tarjetaTitulo,
// concepto (clave), trampas: [ideas del paquete] }], porTarjeta: Map(índice → [ids]) }.
export function analisisPaquete(p) {
  if (!p) return { temas: new Map(), materias: new Map() };
  const ya = cacheAnalisis.get(p);
  if (ya) return ya;
  const conceptos = conceptosDe(p);
  const temas = new Map();
  const materias = new Map();
  for (const m of p.materias) {
    const mm = { preguntas: 0, cubiertas: 0, faltan: [] };
    m.temas.forEach((t, n) => {
      const porTarjeta = new Map();
      const preguntas = (t.preguntas ?? []).map(id => p.preguntas.get(id)).filter(Boolean).map(q => {
        const c = conceptos.porPregunta.get(q.id) ?? null;
        const indice = c ? c.indice : -1;
        if (indice >= 0) porTarjeta.set(indice, [...(porTarjeta.get(indice) ?? []), q.id]);
        mm.preguntas += 1;
        if (indice >= 0) mm.cubiertas += 1; else mm.faltan.push(numeroDe(q));
        return {
          id: q.id, numero: numeroDe(q), tarjeta: indice, tarjetaTitulo: indice >= 0 ? String(t.secciones?.[indice]?.titulo ?? '') : '', concepto: c?.clave ?? null,
          trampas: [...new Set(Object.values(q.errores ?? {}).filter(x => typeof x === 'string' && x.trim()))].slice(0, 3),
        };
      });
      temas.set(`${m.id}/${t.id}`, { materia: m.id, tema: t.id, titulo: t.titulo, numero: n + 1, preguntas, porTarjeta });
    });
    materias.set(m.id, mm);
  }
  const r = { temas, materias };
  cacheAnalisis.set(p, r);
  return r;
}
export const analisisTema = (p, materia, tema) => analisisPaquete(p).temas.get(`${materia}/${tema}`) ?? null;
// Cuántas preguntas del Test Guide tiene una materia (la «N» de «analicé las N preguntas de esta materia»).
export const preguntasDeMateria = (p, materia) => analisisPaquete(p).materias.get(materia)?.preguntas ?? 0;

// R: la cobertura (para el administrador): «32/32 preguntas del Test Guide cubiertas» y cuáles faltan, por materia.
export function coberturaTestGuide(p) {
  const a = analisisPaquete(p);
  const materias = [...a.materias.entries()].map(([materia, x]) => ({ materia, preguntas: x.preguntas, cubiertas: x.cubiertas, faltan: x.faltan.slice(0, 40) }));
  return { preguntas: materias.reduce((n, x) => n + x.preguntas, 0), cubiertas: materias.reduce((n, x) => n + x.cubiertas, 0), materias };
}

// La dificultad de cada pregunta (lo que fallan TODOS los alumnos, sin nombres): Map(id → { n, malPct }).
export function dificultades(db, ids) {
  const lista = [...new Set(ids)].filter(x => typeof x === 'string');
  if (!lista.length) return new Map();
  const filas = db.prepare(`SELECT pregunta, COUNT(*) AS n, SUM(CASE WHEN correcta = 0 THEN 1 ELSE 0 END) AS mal FROM academia_respuestas
    WHERE pregunta IN (${lista.map(() => '?').join(', ')}) GROUP BY pregunta`).all(...lista);
  return new Map(filas.map(f => [f.pregunta, { n: f.n, malPct: f.n ? Math.round((f.mal * 100) / f.n) : 0 }]));
}

// K: «Para el examen» al pie de una explicación de una tarjeta (lo pone la APP, nunca la IA): de las preguntas del Test
// Guide que esa tarjeta explica, las que el alumno YA respondió van citadas tal cual (enunciado y respuesta del Test
// Guide); de las demás, solo el número. indice: el de la tarjeta (0, 1…); null = todo el tema.
export function paraElExamen(db, usuarioId, p, materia, tema, indice = null) {
  const a = analisisTema(p, materia, tema);
  if (!a) return null;
  const ids = indice == null ? a.preguntas.map(x => x.id) : a.porTarjeta.get(indice) ?? [];
  if (!ids.length) return { respondidas: [], otras: [], tema: a.titulo, numeroTema: a.numero };
  const vistas = new Set(db.prepare(`SELECT DISTINCT pregunta FROM academia_respuestas WHERE usuario_id = ? AND pregunta IN (${ids.map(() => '?').join(', ')})`).all(usuarioId, ...ids).map(f => f.pregunta));
  const respondidas = [];
  const otras = [];
  for (const id of ids) {
    const q = p.preguntas.get(id);
    if (!q) continue;
    if (vistas.has(id)) respondidas.push({ numero: numeroDe(q), enunciado: q.original.enunciado, respuesta: q.original.opciones.find(o => o.letra === q.original.correcta)?.texto ?? '' });
    else otras.push(numeroDe(q));
  }
  return { respondidas: respondidas.slice(0, 3), otras: otras.slice(0, 12), tema: a.titulo, numeroTema: a.numero };
}

// ---------- S: el peso de cada concepto en el examen ----------
// Cuántas preguntas del Test Guide salen de un concepto (su tarjeta). Lo usa «Mi repaso» (src/academia/fallas.js) para
// poner primero lo que falla y más sale; con eso también la preparación y el plan de hoy.
export const pesoConcepto = (p, clave) => conceptosDe(p).porClave.get(clave)?.preguntas?.length ?? 1;
// Lo primero que conviene repasar (o null): { concepto, n (preguntas del Test Guide), materia, tema, temaTitulo, temaNumero, practicar }.
export function prioridad(db, usuarioId, p, ahora = Date.now()) {
  const x = miRepaso(db, usuarioId, p, ahora).paraRepasar?.[0];
  if (!x) return null;
  return { concepto: x.concepto, n: x.peso ?? (x.clave ? pesoConcepto(p, x.clave) : 1), materia: x.materia, tema: x.tema, temaTitulo: x.temaTitulo, temaNumero: x.temaNumero, practicar: x.practicar, clave: x.clave };
}

// ---------- T: la memoria del tutor (una fila por clase o intento: nunca se borra) ----------
const PREFIJO_MEMORIA = id => `academia.tutor.memoria.${Number(id)}.`;
const entre = prefijo => [prefijo, `${prefijo}~`];
function leerFilas(db, prefijo, limite) {
  return db.prepare('SELECT clave, valor, actualizado_en AS en FROM ajustes WHERE clave > ? AND clave < ? ORDER BY actualizado_en DESC, clave DESC LIMIT ?').all(...entre(prefijo), limite)
    .map(f => { try { return { clave: f.clave, ...JSON.parse(f.valor) }; } catch { return null; } }).filter(Boolean);
}
function insertarUnaVez(db, clave, valor, en) {
  db.prepare('INSERT OR IGNORE INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(clave, JSON.stringify(valor), en);
}
const tipoMemoria = tipo => (tipo === 'examen' ? 'examen' : tipo === 'tema' ? 'tema' : 'practica');
const nombres = (lista, n = 3) => [...new Set(lista.filter(Boolean))].slice(0, n);

// Después de terminar un intento (una práctica, el examen de un tema, el examen de una materia). Una sola vez por intento.
export function anotarIntento(db, usuarioId, p, intentoId, ahora = Date.now()) {
  if (!p) return null;
  const f = db.prepare('SELECT * FROM academia_intentos WHERE id = ? AND usuario_id = ? AND terminado_en IS NOT NULL').get(Number(intentoId), usuarioId);
  if (!f) return null;
  const filas = db.prepare('SELECT pregunta, correcta FROM academia_respuestas WHERE intento_id = ? AND usuario_id = ? ORDER BY id').all(f.id, usuarioId).filter(x => p.preguntas.has(x.pregunta));
  const bien = filas.filter(x => x.correcta === 1);
  const mal = filas.filter(x => x.correcta !== 1);
  const concepto = id => nombreConcepto(conceptoDePregunta(p, id));
  // Un concepto «bien» solo si en este intento no falló ninguna de sus preguntas.
  const malC = nombres(mal.map(x => concepto(x.pregunta)), 4);
  const bienC = nombres(bien.map(x => concepto(x.pregunta)).filter(c => !malC.includes(c)), 4);
  const t = temaDe(p, f.materia, f.tema);
  const pct = f.total ? Math.floor((f.aciertos * 100) / f.total) : 0;
  const minutos = Math.max(0, Math.round((Date.parse(f.terminado_en) - Date.parse(f.empezado_en)) / 60_000));
  const tipo = tipoMemoria(f.tipo);
  const conclusion = malC.length
    ? { clave: tipo === 'examen' && f.aprobado !== 1 ? 'examen_no' : 'reforzar', vars: { mal: malC.slice(0, 2).join(', '), pct } }
    : { clave: tipo === 'examen' ? 'examen_bien' : 'todo_bien', vars: { pct, bien: bienC.slice(0, 2).join(', ') } };
  const valor = {
    tipo, intento: f.id, materia: f.materia ?? null, tema: f.tema ?? null, temaTitulo: t?.titulo ?? null, pct, aprobado: f.aprobado == null ? null : f.aprobado === 1,
    bien: bienC, mal: malC, tgBien: bien.map(x => numeroDe(p.preguntas.get(x.pregunta))).slice(0, 8), tgMal: mal.map(x => numeroDe(p.preguntas.get(x.pregunta))).slice(0, 8),
    minutos, conclusion, en: f.terminado_en,
  };
  insertarUnaVez(db, `${PREFIJO_MEMORIA(usuarioId)}i${f.id}`, valor, f.terminado_en);
  return valor;
}
// Después de leer una clase entera (una lección sin preguntas, o «Seguir» al final).
export function anotarClase(db, usuarioId, p, materia, tema, ahora = Date.now()) {
  const t = temaDe(p, materia, tema);
  if (!t) return null;
  const en = new Date(ahora).toISOString();
  const valor = { tipo: 'clase', materia, tema, temaTitulo: t.titulo, tarjetas: (t.secciones ?? []).length, conclusion: { clave: 'clase', vars: { tema: t.titulo } }, en };
  insertarUnaVez(db, `${PREFIJO_MEMORIA(usuarioId)}c${ahora}`, valor, en);
  return valor;
}
// Lo que el tutor recuerda (lo más nuevo primero).
export const memoriaTutor = (db, usuarioId, { limite = 30 } = {}) => leerFilas(db, PREFIJO_MEMORIA(usuarioId), Math.min(200, Math.max(1, limite)));
// Las últimas entradas, compactas, para los pedidos a la IA (sin nombre, sin fechas exactas: solo cuántos días hace).
export function memoriaParaIa(db, usuarioId, n = 4, ahora = Date.now()) {
  return memoriaTutor(db, usuarioId, { limite: n }).map(x => ({
    hace_dias: Math.max(0, Math.floor((ahora - Date.parse(x.en)) / 86_400_000)), que: x.tipo, tema: x.temaTitulo ?? null, nota: x.pct ?? null,
    bien: x.bien ?? [], mal: x.mal ?? [], test_guide_mal: x.tgMal ?? [], minutos: x.minutos ?? null,
  }));
}

// ---------- I: las señales de estilo (solo números) ----------
export const SENALES = Object.freeze(['entendi', 'duda', 'mejor', 'profundizar', 'visual', 'ejemplo', 'regla', 'tiempo']);
const claveSenales = id => `academia.tutor.senales.${Number(id)}`;
export function leerSenales(db, usuarioId) {
  try { const v = JSON.parse(leerAjuste(db, claveSenales(usuarioId)) ?? 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
// tiempo: ms de lectura de una tarjeta (se guarda un promedio móvil, entre 1 s y 10 min).
export function anotarSenal(db, usuarioId, tipo, ms = null) {
  if (!SENALES.includes(tipo)) return leerSenales(db, usuarioId);
  const s = leerSenales(db, usuarioId);
  if (tipo === 'tiempo') {
    const v = Math.min(600_000, Math.max(1_000, Number(ms) || 0));
    s.msTarjeta = s.msTarjeta ? Math.round(s.msTarjeta * 0.8 + v * 0.2) : v;
    s.tiempos = (Number(s.tiempos) || 0) + 1;
  } else s[tipo] = (Number(s[tipo]) || 0) + 1;
  guardarAjuste(db, claveSenales(usuarioId), JSON.stringify(s));
  return s;
}
// Lo que se infiere (o null en cada cosa si todavía no hay suficientes señales).
export function preferencias(s) {
  const n = k => Number(s?.[k]) || 0;
  const largo = n('profundizar') + n('mejor') >= 3 || (n('tiempos') >= 5 && s.msTarjeta > 60_000) ? 'largo' : n('tiempos') >= 5 && s.msTarjeta < 15_000 ? 'corto' : null;
  const modo = n('ejemplo') > n('regla') + 1 ? 'ejemplos' : n('regla') > n('ejemplo') + 1 ? 'reglas' : null;
  const total = n('entendi') + n('duda');
  return { largo, modo, visual: n('visual') >= 3, entiende: total >= 3 ? Math.round((n('entendi') * 100) / total) : null };
}
// El estilo para lo que se guarda compartido (tarjeta + estilo + idioma): el de su modelo, salvo una señal clara.
export function estiloConSenales(estilo, s) {
  const pr = preferencias(s);
  if (pr.modo === 'ejemplos') return 'ejemplo';
  if (pr.modo === 'reglas') return 'tecnico';
  if (pr.entiende != null && pr.entiende < 40) return 'paso_a_paso';
  return estilo;
}

// ---------- Lo que hizo el tutor (eventos reales: «profundizamos en…») ----------
const PREFIJO_EVENTO = id => `academia.tutor.evento.${Number(id)}.`;
export function anotarEvento(db, usuarioId, valor, ahora = Date.now()) {
  const en = new Date(ahora).toISOString();
  insertarUnaVez(db, `${PREFIJO_EVENTO(usuarioId)}${ahora}`, { ...valor, en }, en);
}
export const eventosTutor = (db, usuarioId, limite = 20) => leerFilas(db, PREFIJO_EVENTO(usuarioId), limite);

// ---------- U: «¿Tomo el examen final?» (sin IA) ----------
const pctDe = (a, b) => (b > 0 ? Math.floor((a * 100) / b) : 0);
// → { oficial: { si, pct, porques }, materias: [{ materia, si, pct, porques }] }. porques: [{ clave, vars }] (2–4).
export function tomoExamen(db, usuarioId, p, ahora = Date.now()) {
  const v = veredicto(db, usuarioId, p, ahora);
  const memoria = memoriaTutor(db, usuarioId, { limite: 10 });
  const porRegla = r => ({ clave: `${r.id}.${r.ok ? 'ok' : 'no'}`, vars: { valor: r.valor, meta: r.meta, n: r.n } });
  const malas = v.reglas.filter(r => !r.ok && r.id !== 'materias');
  const buenas = v.reglas.filter(r => r.ok);
  const oficial = {
    si: v.nivel === 'listo', pct: v.probabilidad,
    porques: [...malas.slice(0, 3), ...buenas.slice(0, Math.max(0, 2 - malas.length))].slice(0, 4).map(porRegla),
  };
  const materias = (v.porMateria ?? []).map(m => {
    const porques = [];
    porques.push({ clave: m.pct >= 90 ? 'acierto.ok' : 'acierto.no', vars: { valor: m.pct, meta: 90 } });
    if (m.cobertura < 95) porques.push({ clave: 'cobertura.no', vars: { valor: m.cobertura, meta: 95 } });
    if (m.fallas > 0) porques.push({ clave: 'fallas.no', vars: { n: m.fallas } });
    if (m.clases > 0) porques.push({ clave: 'clases.no', vars: { n: m.clases } });
    const ultima = memoria.find(x => x.materia === m.materia && (x.mal ?? []).length);
    if (ultima && porques.length < 4) porques.push({ clave: 'memoria.mal', vars: { mal: ultima.mal.slice(0, 2).join(', ') } });
    if (porques.length < 2) porques.push({ clave: m.aprobado ? 'examen.ok' : 'examen.no', vars: { valor: m.examen ?? 0 } });
    const si = m.pct >= 90 && m.cobertura >= 95 && m.fallas === 0 && m.clases === 0;
    return { materia: m.materia, si, pct: m.pct, porques: porques.slice(0, 4) };
  });
  return { oficial, materias };
}

// ---------- F / G: lo que pasó de verdad, y el primer mensaje del Profesor ----------
// novedades: [{ tipo, vars, href }] (como mucho 4), solo cosas que pasaron: lo que reforzó hoy, la clase que se preparó
// (o se está preparando), lo que profundizó, sus preguntas personalizadas.
export function novedadesTutor(db, usuarioId, p, { preparado = null, ahora = Date.now() } = {}) {
  const lista = [];
  const hoy = diaDe(ahora);
  const deHoy = memoriaTutor(db, usuarioId, { limite: 10 }).filter(x => diaDe(Date.parse(x.en)) === hoy && x.tipo !== 'clase');
  const reforzados = nombres(deHoy.flatMap(x => [...(x.mal ?? []), ...(x.bien ?? [])]), 2);
  if (reforzados.length) lista.push({ tipo: 'reforzamos', vars: { que: reforzados.join(', ') }, href: '#mi-repaso' });
  if (preparado?.tema) {
    const [m, t] = preparado.tema.split('/');
    const tt = temaDe(p, m, t);
    if (tt) lista.push({ tipo: preparado.listo ? 'preparada' : 'preparando', vars: { tema: tt.titulo }, href: `#tema/${m}/${t}` });
  }
  for (const e of eventosTutor(db, usuarioId, 6)) {
    if (lista.length >= 4) break;
    const tt = temaDe(p, e.materia, e.tema);
    if (!tt) continue;
    const tipo = e.tipo === 'personalizadas' ? 'personalizadas' : e.tipo === 'mejor' ? 'explicamos' : 'profundizamos';
    if (lista.some(x => x.tipo === tipo && x.vars.que === (e.titulo || tt.titulo))) continue;
    lista.push({ tipo, vars: { que: e.titulo || tt.titulo }, href: e.tipo === 'personalizadas' ? `#tutor/preguntas/${e.materia}/${e.tema}` : `#tema/${e.materia}/${e.tema}/${Number(e.tarjeta) || 1}` });
  }
  return lista.slice(0, 4);
}

// G/M/S: el primer mensaje del Profesor y la tarjeta del tutor, armado SIN IA (de «Mi repaso» y del Camino; ninguna
// llamada extra). → { fallaste: [conceptos], tema: { materia, tema, titulo, numero } | null, preguntasMateria, prioridad,
// practicar (datos de un intento) | null, videos, buscar }.
export function aperturaTutor(db, usuarioId, p, ahora = Date.now()) {
  if (!p) return null;
  const rep = miRepaso(db, usuarioId, p, ahora).paraRepasar ?? [];
  const primero = rep[0] ?? null;
  let tema = null;
  let fallaste = [];
  if (primero) {
    fallaste = nombres(rep.filter(x => x.materia === primero.materia && x.tema === primero.tema).map(x => x.concepto), 2);
    const a = analisisTema(p, primero.materia, primero.tema);
    tema = { materia: primero.materia, tema: primero.tema, titulo: primero.temaTitulo, numero: a?.numero ?? primero.temaNumero ?? null };
  } else {
    for (const m of camino(db, usuarioId, p, ahora).materias) {
      const t = m.temas.find(x => x.estado === 'abierto');
      if (t) { tema = { materia: m.id, tema: t.id, titulo: t.titulo, numero: analisisTema(p, m.id, t.id)?.numero ?? null }; break; }
    }
  }
  const videos = tema ? videosDeTema(db, tema.materia, tema.tema).map(v => ({ titulo: v.titulo, url: v.url })) : [];
  return {
    fallaste, tema, preguntasMateria: tema ? preguntasDeMateria(p, tema.materia) : 0,
    prioridad: primero ? { concepto: primero.concepto, n: primero.peso ?? 1, temaTitulo: primero.temaTitulo } : null,
    practicar: primero?.practicar ?? null, videos, buscar: tema ? { texto: tema.titulo, url: busquedaYoutube(tema.titulo) } : null,
  };
}
