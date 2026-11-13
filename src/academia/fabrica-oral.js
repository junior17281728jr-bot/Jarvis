// Academia 0.13.1: la pista «Preparándote para el examen oral» en la «Fábrica de materias» (src/academia/fabrica.js hace
// el trabajo, el gasto, los topes y la publicación; aquí solo lo propio de la pista oral, puro salvo la lectura de las
// fuentes). SOLO con el contenido de la Guía del examen oral (fuentes oral/oral.json, oral/oral-capNN.txt e imágenes).
//
// Cada capítulo del libro es una materia oral_* (MATERIAS_ORAL[num - 1]; el capítulo 9 —escenarios— es oral_escenarios)
// y cada sección (A, B, C…) un tema. Por tema: plan → tarjetas-1..n → libro-1..k (de a 4 preguntas del libro: la
// explicación en español, los puntos clave y UNA pregunta de opción múltiple hecha con la respuesta del libro) → cierre →
// verificar (Claude Haiku 5.5: cada punto y cada pregunta, contra la página citada de ESTE libro). Lo del libro (la pregunta
// y la respuesta en inglés) NUNCA lo escribe el modelo: el código lo copia TAL CUAL de oral.json (el modelo solo dice el
// número). Un tema que ya está en una versión oral en uso (por ejemplo, los capítulos 1–2 hechos a mano) se salta.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { MATERIAS_ORAL, ID_VALIDO, ARCHIVO_FIGURA, LIMITES, LIMITES_ORAL } from './formato.js';
import { normalizar } from './reto-calidad.js';
import { paginasDeTexto, IMAGEN_LIBRO, ARCHIVO_IMAGENES } from './fuentes.js';
import { REGLAS_VERIFICACION, ESQUEMAS, datos, TAREAS } from './fabrica-prompts.js';
import { tarjetaConVisual, revisarDiagrama, TIPOS_DIAGRAMA } from './diagramas.js';

export const ORAL_POR_PASO = Object.freeze({ tarjetas: 3, libro: 4, lecturaMaxBytes: 60_000, verificarBytes: 170_000 });
export const TEMA_ESCENARIOS = 't01-escenarios';
const LETRAS = ['A', 'B', 'C'];
const esObjeto = v => v != null && typeof v === 'object' && !Array.isArray(v);
const textoOk = (v, max = 20_000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\u0000');

// ---------- Las fuentes de la pista oral ----------
// oral.json: { libro: { id, titulo }, materias: [{ num, nombre, nombre_en?, temas: [{ id, titulo, titulo_en?, preguntas:
// [{ n, pregunta_en, respuesta_en, pagina, referencia? }], adicionales: [{ n, pregunta_en, pagina }] }] }], escenarios:
// [{ n, texto_en, pagina }] }. → { ok, errores, libro, capitulos } (los escenarios, como el capítulo 9 con un tema).
export function revisarOral(o) {
  const errores = [];
  const mal = (ruta, motivo) => { if (errores.length < 30) errores.push({ ruta, motivo }); };
  if (!esObjeto(o)) return { ok: false, errores: [{ ruta: 'oral', motivo: 'no_es_objeto' }], libro: null, capitulos: [] };
  if (!esObjeto(o.libro) || typeof o.libro.id !== 'string' || !ID_VALIDO.test(o.libro.id) || !textoOk(o.libro.titulo, 400)) mal('oral.libro', 'falta');
  if (!Array.isArray(o.materias) || !o.materias.length) mal('oral.materias', 'falta');
  const capitulos = [];
  const vistos = new Set();
  (Array.isArray(o.materias) ? o.materias : []).forEach((m, i) => {
    const r = `oral.materias[${i}]`;
    if (!esObjeto(m) || !Number.isSafeInteger(m.num) || m.num < 1 || m.num > 8) return mal(`${r}.num`, 'no_valido');
    if (vistos.has(m.num)) return mal(`${r}.num`, 'repetido');
    vistos.add(m.num);
    if (!textoOk(m.nombre, 400)) mal(`${r}.nombre`, 'falta');
    if (!Array.isArray(m.temas) || !m.temas.length) return mal(`${r}.temas`, 'falta');
    const temas = [];
    m.temas.forEach((t, j) => {
      const rt = `${r}.temas[${j}]`;
      if (!esObjeto(t) || typeof t.id !== 'string' || !ID_VALIDO.test(t.id) || !textoOk(t.titulo, 400)) return mal(`${rt}.id`, 'id_no_valido');
      const qa = (Array.isArray(t.preguntas) ? t.preguntas : []).filter((q, k) => {
        const ok = esObjeto(q) && Number.isSafeInteger(q.n) && textoOk(q.pregunta_en) && Number.isSafeInteger(q.pagina);
        if (!ok) mal(`${rt}.preguntas[${k}]`, 'no_valida');
        return ok;
      }).slice(0, LIMITES_ORAL.libroQa).map(q => ({ n: q.n, pregunta_en: q.pregunta_en, respuesta_en: textoOk(q.respuesta_en) ? q.respuesta_en : null, pagina: q.pagina }));
      const adicionales = (Array.isArray(t.adicionales) ? t.adicionales : []).filter(q => esObjeto(q) && Number.isSafeInteger(q.n) && textoOk(q.pregunta_en) && Number.isSafeInteger(q.pagina))
        .slice(0, LIMITES_ORAL.adicionales).map(q => ({ n: q.n, pregunta_en: q.pregunta_en, pagina: q.pagina }));
      if (!qa.length) return mal(`${rt}.preguntas`, 'falta');
      temas.push({ id: t.id, titulo: t.titulo, titulo_en: textoOk(t.titulo_en, 400) ? t.titulo_en : null, qa, adicionales });
    });
    capitulos.push({ id: MATERIAS_ORAL[m.num - 1], num: m.num, nombre: m.nombre, nombre_en: textoOk(m.nombre_en, 400) ? m.nombre_en : null, archivo: `oral-cap${String(m.num).padStart(2, '0')}.txt`, temas });
  });
  // Los escenarios (capítulo 9): la pregunta y su respuesta vienen juntas en texto_en (se separan después, tal cual).
  const esc = (Array.isArray(o.escenarios) ? o.escenarios : []).filter(x => esObjeto(x) && Number.isSafeInteger(x.n) && textoOk(x.texto_en) && Number.isSafeInteger(x.pagina)).slice(0, LIMITES_ORAL.libroQa);
  if (esc.length) {
    capitulos.push({
      id: 'oral_escenarios', num: 9, nombre: 'Preguntas de escenario', nombre_en: 'Scenario-Based Questions', archivo: 'oral-cap09.txt',
      temas: [{ id: TEMA_ESCENARIOS, titulo: 'Preguntas de escenario', titulo_en: 'Scenario-Based Questions', escenarios: true, qa: esc.map(x => ({ n: x.n, texto_en: x.texto_en, pagina: x.pagina })), adicionales: [] }],
    });
  }
  capitulos.sort((a, b) => a.num - b.num);
  return { ok: errores.length === 0 && capitulos.length > 0, errores, libro: esObjeto(o.libro) ? { id: o.libro.id, titulo: o.libro.titulo } : null, capitulos };
}

// Leer oral/oral.json (una vez por versión del archivo) y sus imágenes (de imagenes.json: «oral/img-…» del libro oral).
let enMemoria = { clave: null, valor: null };
export function leerFuenteOral(dir) {
  const ruta = join(dir, 'oral', 'oral.json');
  let st;
  try { st = statSync(ruta); } catch { return { hay: false, ok: false, errores: [], capitulos: [], imagenes: [] }; }
  const clave = `${ruta}|${st.size}|${st.mtimeMs}`;
  if (enMemoria.clave === clave) return enMemoria.valor;
  let valor;
  try {
    if (st.size > 4 * 1024 * 1024) throw new Error('grande');
    const r = revisarOral(JSON.parse(readFileSync(ruta, 'utf8')));
    let lista = [];
    try { lista = JSON.parse(readFileSync(join(dir, ARCHIVO_IMAGENES), 'utf8')); } catch { lista = []; }
    const imagenes = (Array.isArray(lista) ? lista : []).filter(x => esObjeto(x) && typeof x.archivo === 'string' && x.archivo.startsWith('oral/') && r.libro && x.libro === r.libro.id && Number.isSafeInteger(x.pagina))
      .map(x => ({ archivo: basename(x.archivo), ruta: join(dir, 'oral', basename(x.archivo)), libro: x.libro, pagina: x.pagina, pie: textoOk(x.pie, 400) ? x.pie : null }))
      .filter(x => IMAGEN_LIBRO.test(x.archivo) && ARCHIVO_FIGURA.test(x.archivo) && existsSync(x.ruta));
    valor = { hay: true, ...r, imagenes };
  } catch { valor = { hay: true, ok: false, errores: [{ ruta: 'oral/oral.json', motivo: 'json_no_valido' }], capitulos: [], imagenes: [] }; }
  enMemoria = { clave, valor };
  return valor;
}

// Las páginas que lee un tema: de la primera pregunta a la última (+1: una respuesta sigue en la página de al lado).
// 0.14.7: maxBytes: la mejora profunda pide la lectura entera (hasta 170 000; si pasa de lo que cabe, saca pasajes).
export function contextoOral(dir, fuente, cap, t, { maxBytes = ORAL_POR_PASO.lecturaMaxBytes } = {}) {
  const titulos = new Map([[fuente.libro.id, fuente.libro.titulo]]);
  const paginas = [...t.qa.map(x => x.pagina), ...t.adicionales.map(x => x.pagina)];
  const desde = Math.min(...paginas);
  const hasta = Math.max(...paginas) + 1;
  let porPagina = new Map();
  try { const ruta = join(dir, 'oral', cap.archivo); if (statSync(ruta).size <= 1024 * 1024) porPagina = paginasDeTexto(readFileSync(ruta, 'utf8')); } catch { porPagina = new Map(); }
  const partes = [];
  for (let p = desde; p <= hasta; p++) if (porPagina.get(p)) partes.push({ libro: fuente.libro.id, archivo: cap.archivo, pagina: p, texto: porPagina.get(p) });
  const texto = partes.map(x => `[${fuente.libro.titulo}, p. ${x.pagina}]\n${x.texto}`).join('\n\n').slice(0, maxBytes);
  const imagenes = fuente.imagenes.filter(x => x.pagina >= desde && x.pagina <= hasta);
  return { titulos, lectura: { partes }, texto, largo: Buffer.byteLength(texto), qa: t.qa, imagenes, preguntas: [], oral: true };
}

// La pregunta y la respuesta del libro de un escenario: corta texto_en donde termina la pregunta (las últimas palabras
// que dijo el modelo, si están TAL CUAL; si no, en la primera línea que termina en «?»). Las dos partes son trozos exactos.
export function partirEscenario(texto, termina = null) {
  const probar = i => {
    const pregunta = texto.slice(0, i).trim();
    const respuesta = texto.slice(i).trim();
    return pregunta && respuesta ? { pregunta_en: pregunta, respuesta_en: respuesta } : null;
  };
  // Sin mirar los espacios ni los saltos de línea (el libro corta las líneas): las palabras, en orden, con \s+ entre ellas.
  const palabras = typeof termina === 'string' ? termina.trim().split(/\s+/).filter(Boolean) : [];
  if (palabras.length >= 2 && termina.trim().length >= 8) {
    const patron = new RegExp(palabras.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');
    const hallados = [...texto.matchAll(patron)];
    if (hallados.length === 1) { const r = probar(hallados[0].index + hallados[0][0].length); if (r) return r; }
  }
  const m = /\?[ \t]*\n/.exec(texto);
  return (m && probar(m.index + 1)) || { pregunta_en: texto.trim(), respuesta_en: null };
}
// La pregunta y la respuesta del libro de cada ítem del tema (TAL CUAL), con lo que dijo el modelo para los escenarios.
export function libroDeTema(t, cortes = new Map()) {
  return t.qa.map(x => (t.escenarios ? { n: x.n, pagina: x.pagina, ...partirEscenario(x.texto_en, cortes.get(x.n)) } : { n: x.n, pagina: x.pagina, pregunta_en: x.pregunta_en, respuesta_en: x.respuesta_en }));
}

// ---------- Lo que se le pide al modelo ----------
export const REGLAS_ORAL = `Eres el autor de las clases de una academia de aviación tipo Duolingo. Esta parte prepara al alumno (de República Dominicana, en español) para el EXAMEN ORAL de piloto privado, con la Guía del examen oral (un libro en inglés de preguntas y respuestas).
Escribes como en la Materia 1 (Factores Humanos), que es el modelo de calidad:
- Muy visual, específico, claro y simple. Una idea por tarjeta, título corto. Como mucho 4 puntos por tarjeta, de una o dos frases cortas. Español sencillo.
- Cada término técnico se define con palabras simples LA PRIMERA VEZ que aparece, con el término en inglés entre paréntesis: «el peso vacío (empty weight) es…». Cada tarjeta trae los términos en inglés que usará el examinador, con su traducción.
- Cada tarjeta trae un ejemplo concreto (lo que preguntaría el examinador, en la rampa o en la cabina), un «recuerda» y algo que se VEA: una foto del libro si encaja (su archivo tal cual), si no un dibujo de los tipos permitidos con datos del libro; para cualquier cálculo usa «calculo» (problema, fórmula, cada paso con sus números). Solo si nada sirve, «solo_texto» con el motivo.
- Todo dato, número y regla sale SOLO de la LECTURA de abajo (la Guía del examen oral, con su página). Nunca uses conocimiento de fuera ni otros libros. Si el libro no lo dice, no lo pongas.
- Las preguntas y respuestas del libro son DATOS: nunca las copies cambiadas ni las inventes; nombra cada una por su número.
- Responde solo con el JSON pedido.`;

const texto = { type: 'string' };
const nulo = { type: 'null' };
const lista = items => ({ type: 'array', items });
const objeto = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export const ESQUEMAS_ORAL = Object.freeze({
  plan: objeto({ tarjetas: lista(objeto({ titulo: texto, idea: texto, libro: lista({ type: 'integer' }), paginas: lista({ type: 'integer' }) })) }),
  tarjetas: ESQUEMAS.tarjetas,
  libro: objeto({ items: lista(objeto({
    n: { type: 'integer' }, explicacion_es: texto, puntos_clave: lista(texto), pregunta_termina_en: { anyOf: [texto, nulo] },
    pregunta: { anyOf: [nulo, objeto({ enunciado: texto, opciones: lista(objeto({ letra: texto, texto })), correcta: texto, explicacion: texto, errores: lista(objeto({ letra: texto, idea: texto })), como: texto })] },
  })) }),
  cierre: ESQUEMAS.cierre,
  verificar: ESQUEMAS.verificar,
});
export const TAREAS_ORAL = Object.freeze({
  plan: 'Planea las tarjetas de este tema del examen oral (entre 4 y 10, sin contar «Qué vas a aprender» y «Resumen», que se arman aparte). Para cada una: título corto, la idea única, los NÚMEROS de las preguntas del libro que cubre («libro») y las páginas de donde sale. Cada pregunta del libro de los datos queda cubierta por al menos una tarjeta.',
  tarjetas: TAREAS.tarjetas,
  libro: 'Para cada pregunta del libro de los datos (por su número «n»): «explicacion_es» (lo que dice la respuesta del libro, explicado en español sencillo, 2 a 4 frases, con los términos en inglés entre paréntesis), «puntos_clave» (2 a 4 frases muy cortas para decirle al examinador), «pregunta_termina_en» (solo si el ítem es un escenario con la pregunta y la respuesta juntas: las últimas 6 a 12 palabras de la PREGUNTA, copiadas tal cual; si no, null) y «pregunta»: UNA pregunta de opción múltiple en español hecha con la respuesta del libro (A, B y C; la correcta dice lo que dice el libro; las otras dos son errores creíbles que el libro descarta o no dice), su «explicacion», «errores» (para cada opción incorrecta, la idea equivocada) y «como» (una línea: cómo se convirtió la pregunta del libro en esta). Si la respuesta del libro no da para una pregunta de opción múltiple, «pregunta»: null.',
  cierre: TAREAS.cierre,
  verificar: 'Revisa este contenido del examen oral contra la LECTURA (la Guía del examen oral, con sus páginas). Cada punto de las tarjetas, cada explicación y cada pregunta de opción múltiple (su respuesta correcta y que las otras sean de verdad incorrectas) tiene que estar respaldado por la página citada de ESTE libro. Di «donde» con el título de la tarjeta o «libro N» (el número de la pregunta del libro).',
});

// Los pasos de un tema oral (el plan dice cuántas tarjetas).
export function pasosDeTemaOral(leer, t) {
  const pasos = [{ paso: 'plan', proposito: 'fabrica_escribir', tipo: 'plan' }];
  const plan = leer('plan');
  const n = plan?.fallido ? 0 : plan?.json?.tarjetas?.length ?? 5;
  for (let i = 0; i < Math.ceil(n / ORAL_POR_PASO.tarjetas); i++) pasos.push({ paso: `tarjetas-${i + 1}`, proposito: 'fabrica_escribir', tipo: 'tarjetas', desde: i * ORAL_POR_PASO.tarjetas, estimado: !plan });
  for (let i = 0; i < Math.ceil(t.qa.length / ORAL_POR_PASO.libro); i++) pasos.push({ paso: `libro-${i + 1}`, proposito: 'fabrica_escribir', tipo: 'libro', desde: i * ORAL_POR_PASO.libro });
  pasos.push({ paso: 'cierre', proposito: 'fabrica_escribir', tipo: 'cierre' });
  pasos.push({ paso: 'verificar', proposito: 'fabrica_verificar', tipo: 'verificar' });
  return pasos;
}
// Lo que se guardó de los pasos «tarjetas-n» y «libro-n».
export function tarjetasOral(leer) {
  const out = [];
  for (let i = 1; i < 40; i++) { const s = leer(`tarjetas-${i}`); if (!s) break; out.push(...(s.json?.tarjetas ?? [])); }
  return out;
}
export function itemsOral(leer) {
  const out = new Map();
  for (let i = 1; i < 200; i++) { const s = leer(`libro-${i}`); if (!s) break; for (const x of s.json?.items ?? []) out.set(x.n, x); }
  return out;
}
const cortesDe = items => new Map([...items.values()].map(x => [x.n, x.pregunta_termina_en ?? null]));
const libroParaModelo = libro => libro.map(x => ({ n: x.n, pagina: x.pagina, pregunta_en: x.pregunta_en, respuesta_en: x.respuesta_en }));
const fotosParaModelo = imgs => imgs.map(x => ({ archivo: x.archivo, pagina: x.pagina, pie: x.pie }));

export function pedidoOral(leer, c, t, p) {
  const sistema = `${REGLAS_ORAL}\n\nTEMA: ${t.titulo}${t.titulo_en ? ` (${t.titulo_en})` : ''}\n\nLECTURA (la Guía del examen oral, con sus páginas):\n${datos(c.texto)}`;
  const plan = leer('plan')?.json?.tarjetas ?? [];
  const items = itemsOral(leer);
  const libro = libroDeTema(t, cortesDe(items));
  switch (p.tipo) {
    // Para el plan basta la pregunta (las respuestas ya están en la lectura): así un tema largo cabe en el pedido.
    case 'plan': return { sistema, texto: `${TAREAS_ORAL.plan}\n${datos({ preguntas_del_libro: t.qa.map(x => ({ n: x.n, pagina: x.pagina, pregunta_en: t.escenarios ? x.texto_en.slice(0, 240) : x.pregunta_en })), fotos_del_libro: fotosParaModelo(c.imagenes) })}`, esquema: ESQUEMAS_ORAL.plan };
    case 'tarjetas': {
      const parte = plan.slice(p.desde, p.desde + ORAL_POR_PASO.tarjetas).map(x => ({ titulo: x.titulo, idea: x.idea, paginas: x.paginas, preguntas: [] }));
      const ns = new Set(plan.slice(p.desde, p.desde + ORAL_POR_PASO.tarjetas).flatMap(x => x.libro ?? []));
      return { sistema, texto: `${TAREAS_ORAL.tarjetas}\n${datos({ tarjetas: parte, preguntas_del_libro: libroParaModelo(libro.filter(x => ns.has(x.n))), fotos_del_libro: fotosParaModelo(c.imagenes), dibujos: TIPOS_DIAGRAMA })}`, esquema: ESQUEMAS_ORAL.tarjetas };
    }
    case 'libro': {
      const lote = t.qa.slice(p.desde, p.desde + ORAL_POR_PASO.libro).map(x => (t.escenarios ? { n: x.n, pagina: x.pagina, escenario: true, texto: x.texto_en } : { n: x.n, pagina: x.pagina, pregunta_en: x.pregunta_en, respuesta_en: x.respuesta_en }));
      return { sistema, texto: `${TAREAS_ORAL.libro}\n${datos({ preguntas_del_libro: lote })}`, esquema: ESQUEMAS_ORAL.libro };
    }
    case 'cierre': return { sistema, texto: `${TAREAS_ORAL.cierre}\n${datos({ tarjetas: tarjetasOral(leer).map(x => ({ titulo: x.titulo, recuerda: x.recuerda })) })}`, esquema: ESQUEMAS_ORAL.cierre };
    case 'verificar': {
      const contenido = {
        tarjetas: tarjetasOral(leer).map(x => ({ titulo: x.titulo, puntos: x.puntos, recuerda: x.recuerda, ejemplo: x.ejemplo, paginas: x.paginas, visual: x.visual?.parametros ?? null })),
        libro: [...items.values()].map(x => ({ n: x.n, pagina: t.qa.find(q => q.n === x.n)?.pagina ?? null, explicacion_es: x.explicacion_es, puntos_clave: x.puntos_clave, pregunta: x.pregunta })),
      };
      return { sistema: `${REGLAS_VERIFICACION}\n\nLECTURA COMPLETA (la Guía del examen oral):\n${datos(c.texto.slice(0, ORAL_POR_PASO.verificarBytes))}`, texto: `${TAREAS_ORAL.verificar}\n${datos({ contenido })}`, esquema: ESQUEMAS_ORAL.verificar };
    }
    default: throw new Error('paso desconocido');
  }
}

// Una pregunta de opción múltiple bien armada: A, B y C distintas, la correcta una de ellas, un error por cada incorrecta.
export function preguntaBien(q) {
  if (!esObjeto(q) || !textoOk(q.enunciado, 2000) || !textoOk(q.explicacion) || !textoOk(q.como, 1000)) return false;
  if (!Array.isArray(q.opciones) || q.opciones.length !== 3 || q.opciones.some((o, i) => o?.letra !== LETRAS[i] || !textoOk(o?.texto, 2000))) return false;
  if (new Set(q.opciones.map(o => normalizar(o.texto))).size !== 3 || !LETRAS.includes(q.correcta)) return false;
  const malas = LETRAS.filter(l => l !== q.correcta);
  const dadas = (q.errores ?? []).map(e => e?.letra);
  return dadas.length === malas.length && malas.every(l => dadas.includes(l)) && q.errores.every(e => textoOk(e.idea, 2000));
}

// Lo que respondió el modelo, revisado en código (lo que no está bien armado se pide otra vez).
export function revisarSalidaOral(p, json, c, t, plan, seccionDe) {
  switch (p.tipo) {
    case 'plan': {
      if (json.tarjetas.length < 3 || json.tarjetas.length > 12) return { ok: false, motivo: 'tarjetas_no_validas' };
      const cubiertas = new Set(json.tarjetas.flatMap(x => x.libro));
      return t.qa.every(x => cubiertas.has(x.n)) ? { ok: true } : { ok: false, motivo: 'pregunta_sin_tarjeta' };
    }
    case 'tarjetas': {
      if (json.tarjetas.length !== plan.slice(p.desde, p.desde + ORAL_POR_PASO.tarjetas).length) return { ok: false, motivo: 'tarjetas_no_validas' };
      for (const x of json.tarjetas) {
        if (!x.puntos.length || x.puntos.length > 4) return { ok: false, motivo: 'puntos' };
        if (!tarjetaConVisual(seccionDe(x, c, null))) return { ok: false, motivo: 'sin_visual' };
      }
      return { ok: true };
    }
    case 'libro': {
      for (const x of t.qa.slice(p.desde, p.desde + ORAL_POR_PASO.libro)) {
        const a = json.items.find(y => y.n === x.n);
        if (!a || !textoOk(a.explicacion_es) || !a.puntos_clave.length || a.puntos_clave.length > 4) return { ok: false, motivo: 'falta_pregunta' };
        if (a.pregunta != null && !preguntaBien(a.pregunta)) return { ok: false, motivo: 'pregunta_mal_armada' };
      }
      return { ok: true };
    }
    case 'cierre': return json.aprender.length && json.resumen.length && json.otra_vez.trim() ? { ok: true } : { ok: false, motivo: 'vacio' };
    case 'verificar': return { ok: true };
    default: return { ok: false, motivo: 'paso' };
  }
}

// ---------- Armar los temas de un capítulo (en código) ----------
const NUMERO = /\d+(?:[.,]\d+)*/g;
const soloDigitos = s => String(s).replace(/(\d)[.,](?=\d)/g, '$1');
const sinNulos = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
// ¿La respuesta del libro está en su página (o en la de al lado: una respuesta sigue en la siguiente)? Sin IA.
export function respuestaEnPagina(item, c) {
  if (!item.respuesta_en) return true;
  const paginas = c.lectura.partes.filter(x => x.pagina === item.pagina || x.pagina === item.pagina + 1).map(x => normalizar(x.texto)).join(' ');
  const inicio = normalizar(item.respuesta_en).slice(0, 60);
  return Boolean(inicio) && paginas.includes(inicio);
}
export function seccionOral(x, c, dudas) {
  const paginas = [...new Set(x.paginas ?? [])].filter(n => c.lectura.partes.some(p => p.pagina === n)).slice(0, 6);
  if (!paginas.length) { paginas.push(c.lectura.partes[0]?.pagina ?? c.qa[0]?.pagina ?? 1); dudas?.push({ donde: x.titulo, problema: 'sin_pagina', gravedad: 'dudoso' }); }
  const libro = c.titulos.keys().next().value;
  const s = { tipo: 'tarjeta', titulo: x.titulo, puntos: x.puntos, recuerda: x.recuerda || undefined, ejemplo: x.ejemplo || undefined };
  if (x.ingles?.length) s.ingles = x.ingles.slice(0, 8).map(w => ({ palabra: w.palabra, pronunciacion: w.pronunciacion, significado: w.significado }));
  if (x.visual?.tipo) {
    const par = sinNulos(x.visual.parametros ?? {});
    if (Array.isArray(par.elementos)) par.elementos = par.elementos.map(sinNulos);
    if (!revisarDiagrama(x.visual.tipo, par).length) s.visual = { tipo: x.visual.tipo, parametros: par };
  }
  const img = x.imagen?.archivo ? c.imagenes.find(i => i.archivo === x.imagen.archivo) : null;
  if (img) s.imagen = { archivo: img.archivo, alt: x.imagen.alt || x.titulo, ...(x.imagen.pie ? { pie: x.imagen.pie } : {}), pagina: String(img.pagina), libro: img.libro };
  else if (x.imagen?.archivo) dudas?.push({ donde: x.titulo, problema: 'foto_no_esta', gravedad: 'dudoso' });
  if (!s.visual && !s.imagen && x.solo_texto) s.solo_texto = x.solo_texto;
  s.fuentes = paginas.map(n => ({ libro, pagina: String(n) }));
  return JSON.parse(JSON.stringify(s));
}
const numerosRaros = (textos, c) => {
  const base = new Set(soloDigitos(c.texto).match(NUMERO) ?? []);
  const raros = new Set();
  for (const t of textos) for (const n of soloDigitos(t).match(NUMERO) ?? []) if (n.length > 1 && !base.has(n)) raros.add(n);
  return [...raros];
};
export const idPreguntaOral = (cap, t, n) => `or-${String(cap.num).padStart(2, '0')}-${t.id}-${String(n).padStart(3, '0')}`.slice(0, 64);

// Un tema ya armado (lo que va al paquete) y sus preguntas. → { tema, preguntas, dudas }
export function armarTemaOral(leer, c, cap, t, fuente) {
  const dudas = [];
  const items = itemsOral(leer);
  const libro = libroDeTema(t, cortesDe(items));
  const cierre = leer('cierre')?.json;
  if (!leer('plan')?.json) dudas.push({ donde: t.titulo, problema: 'sin_plan', gravedad: 'error' });
  const pag = String(t.qa[0].pagina);
  const fuenteTema = [{ libro: fuente.libro.id, pagina: pag }];
  const secciones = [];
  if (cierre) secciones.push({ tipo: 'tarjeta', titulo: 'Qué vas a aprender', puntos: cierre.aprender.slice(0, 5), visual: { tipo: 'titulo', parametros: {} }, fuentes: fuenteTema });
  for (const x of tarjetasOral(leer)) {
    const s = seccionOral(x, c, dudas);
    if (!tarjetaConVisual(s)) dudas.push({ donde: x.titulo, problema: 'sin_visual', gravedad: 'dudoso' });
    const raros = numerosRaros([...(x.puntos ?? []), x.recuerda ?? '', x.ejemplo ?? ''], c);
    if (raros.length) dudas.push({ donde: x.titulo, problema: `numero_no_esta:${raros.slice(0, 3).join(',')}`, gravedad: 'dudoso' });
    secciones.push(s);
  }
  if (cierre) secciones.push({ tipo: 'tarjeta', titulo: 'Resumen', puntos: cierre.resumen.slice(0, 5), visual: { tipo: 'titulo', parametros: {} }, fuentes: fuenteTema });
  const libroQa = [];
  const preguntas = [];
  for (const b of libro) {
    const a = items.get(b.n);
    if (!respuestaEnPagina(b, c)) dudas.push({ donde: `libro ${b.n}`, problema: 'respuesta_no_esta_en_pagina', gravedad: 'dudoso' });
    if (t.escenarios && !b.respuesta_en) dudas.push({ donde: `libro ${b.n}`, problema: 'escenario_sin_corte', gravedad: 'dudoso' });
    if (!a) dudas.push({ donde: `libro ${b.n}`, problema: 'sin_explicacion', gravedad: 'error' });
    libroQa.push({ n: b.n, pregunta_en: b.pregunta_en, ...(b.respuesta_en ? { respuesta_en: b.respuesta_en } : {}), pagina: String(b.pagina),
      ...(a ? { explicacion_es: a.explicacion_es, puntos_clave: a.puntos_clave.slice(0, LIMITES_ORAL.puntosClave) } : {}) });
    if (!a?.pregunta || !b.respuesta_en || !preguntaBien(a.pregunta)) continue;
    const q = a.pregunta;
    const raros = numerosRaros([q.enunciado, ...q.opciones.map(o => o.texto), q.explicacion, a.explicacion_es], c);
    if (raros.length) dudas.push({ donde: `libro ${b.n}`, problema: `numero_no_esta:${raros.slice(0, 3).join(',')}`, gravedad: 'dudoso' });
    preguntas.push({
      id: idPreguntaOral(cap, t, b.n), origen: 'oral',
      original: { enunciado: q.enunciado, opciones: q.opciones.map(o => ({ letra: o.letra, texto: o.texto })), correcta: q.correcta, explicacion: q.explicacion, pagina: String(b.pagina) },
      sencilla: a.explicacion_es, errores: Object.fromEntries(q.errores.map(e => [e.letra, e.idea])),
      // TAL CUAL del libro (lo copia el código, nunca el modelo).
      fuente_pregunta: { libro: fuente.libro.id, pagina: String(b.pagina), n: b.n, pregunta_en: b.pregunta_en, respuesta_en: b.respuesta_en, como: q.como },
    });
  }
  const v = leer('verificar');
  for (const d of v?.json?.dudas ?? []) dudas.push({ donde: String(d.donde).slice(0, 200), problema: String(d.problema).slice(0, 400), gravedad: d.gravedad });
  for (const paso of ['plan', 'cierre', 'verificar']) if (leer(paso)?.fallido) dudas.push({ donde: t.titulo, problema: `paso_fallido:${paso}`, gravedad: 'error' });
  const tema = {
    id: t.id, titulo: t.titulo.slice(0, LIMITES.corto), ...(t.titulo_en ? { titulo_en: t.titulo_en.slice(0, LIMITES.corto) } : {}),
    secciones: secciones.length ? secciones : [{ titulo: t.titulo, texto: t.titulo, fuentes: fuenteTema }],
    reexplicacion: cierre ? [{ titulo: 'Otra vez, más fácil', texto: cierre.otra_vez, fuentes: fuenteTema }] : [],
    libro_qa: libroQa,
    ...(t.adicionales.length ? { adicionales: t.adicionales.map(x => ({ n: x.n, pregunta_en: x.pregunta_en, pagina: String(x.pagina) })) } : {}),
    preguntas: preguntas.map(q => q.id),
  };
  return { tema, preguntas, dudas: dudas.map(d => ({ ...d, tema: t.id })) };
}
