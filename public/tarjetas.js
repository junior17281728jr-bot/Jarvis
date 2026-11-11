// Academia 0.7.2: la lección de un tema en TARJETAS (una idea por pantalla, como Duolingo). Lógica pura, sin pantalla
// (test/tarjetas.test.js). NUNCA se pierde texto: si un patrón no se reconoce, la sección sale como tarjeta normal.
//  - Una sección { tipo: 'tarjeta', puntos, recuerda?, ejemplo?, ingles?, visual? } ya viene partida: sale tal cual.
//  - «Si te preguntan: … / Recuerda: …» → tarjetas para girar (pregunta → respuesta).
//  - «Escenario N: … A) … → …» → una situación de vuelo para elegir (PRÁCTICA, no cuenta para la nota).
//  - «• Palabra (pronunciación): significado. Ejemplo: …» en una sección de inglés → tarjetas de vocabulario.
//  - Cualquier otro texto largo se parte por párrafos, viñetas y frases: 3 frases o ~320 letras por tarjeta como máximo.
// Las preguntas del Test Guide NUNCA pasan por aquí: se muestran tal cual en la práctica.

const MAX_FRASES = 3;
const MAX_LETRAS = 360;
const MAX_PALABRAS_POR_TARJETA = 4;

// Abreviaturas que terminan en punto pero no cierran la frase.
const ABREVIATURAS = ['EE. UU.', 'EE.UU.', 'aprox.', 'Aprox.', 'pág.', 'págs.', 'p. ej.', 'etc.', 'Sr.', 'Sra.', 'Dr.', 'núm.', 'No.', 'cap.', 'Cap.', 'fig.', 'Fig.', 'a. m.', 'p. m.', 'vs.', 'máx.', 'mín.', 'Ej.', 'ej.'];
const MARCA = '\u0001';

export function dividirEnFrases(texto) {
  let t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  for (const a of ABREVIATURAS) t = t.split(a).join(a.replaceAll('.', MARCA));
  // Un número decimal o una hora (1.5, 10.000) no corta: solo un punto seguido de espacio y mayúscula, número o signo.
  const partes = t.split(/(?<=[.!?…])\s+(?=[«"¿¡(A-ZÁÉÍÓÚÑ0-9])/u);
  return partes.map(p => p.replaceAll(MARCA, '.').trim()).filter(Boolean);
}

const esVineta = linea => /^\s*(?:[•·▪◦\-–*]|\d{1,2}[.)])\s+/.test(linea);
const sinVineta = linea => linea.replace(/^\s*(?:[•·▪◦\-–*]|\d{1,2}[.)])\s+/, '').trim();
const IDEA_CLAVE = /\b(evita|evitar|siempre|nunca|debe|debes|deben|por lo menos|al menos|no más de|regla|se recomienda|recomienda|lo más importante|clave)\b/i;

// Los «puntos» de un texto: cada viñeta es un punto; un párrafo sin viñetas se parte en frases.
export function puntosDe(texto) {
  const puntos = [];
  for (const parrafo of String(texto ?? '').split(/\n\s*\n/)) {
    const lineas = parrafo.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lineas.length) continue;
    if (lineas.some(esVineta)) {
      let actual = null;
      for (const l of lineas) {
        if (esVineta(l)) { if (actual) puntos.push(actual); actual = { texto: sinVineta(l), vineta: true }; }
        else if (actual) actual.texto += ` ${l}`;
        else puntos.push({ texto: l, vineta: false });
      }
      if (actual) puntos.push(actual);
    } else {
      for (const f of dividirEnFrases(lineas.join(' '))) puntos.push({ texto: f, vineta: false });
    }
  }
  return puntos;
}

// Agrupa puntos en tarjetas (≤ 3 puntos y ~320 letras cada una; un punto largo va solo).
export function agrupar(puntos, { maxPuntos = MAX_FRASES, maxLetras = MAX_LETRAS } = {}) {
  const grupos = [];
  let actual = [];
  let letras = 0;
  for (const p of puntos) {
    const n = p.texto.length;
    if (actual.length && (actual.length >= maxPuntos || letras + n > maxLetras)) { grupos.push(actual); actual = []; letras = 0; }
    actual.push(p);
    letras += n;
  }
  if (actual.length) grupos.push(actual);
  // Una última tarjeta con un solo punto corto se junta con la anterior (si cabe un poco más).
  if (grupos.length > 1) {
    const ultimo = grupos[grupos.length - 1];
    const penultimo = grupos[grupos.length - 2];
    const largo = g => g.reduce((s, p) => s + p.texto.length, 0);
    if (ultimo.length === 1 && largo(ultimo) < 90 && penultimo.length < maxPuntos + 1 && largo(penultimo) + largo(ultimo) <= maxLetras * 1.25) {
      grupos.splice(grupos.length - 2, 2, [...penultimo, ...ultimo]);
    }
  }
  return grupos;
}

// ---- Patrones del contenido ----
export function leerPreguntasClave(texto) {
  const t = String(texto ?? '');
  if (!/Si te preguntan\s*:/i.test(t)) return null;
  const tarjetas = [];
  const bloques = t.split(/(?=Si te preguntan\s*:)/i).map(b => b.trim()).filter(Boolean);
  let resto = '';
  for (const b of bloques) {
    const m = /^Si te preguntan\s*:\s*([\s\S]*?)\s*(?:\n|\s)Recuerda\s*:\s*([\s\S]*)$/i.exec(b);
    if (m) tarjetas.push({ pregunta: m[1].trim(), respuesta: m[2].trim() });
    else resto += `${b}\n\n`;
  }
  if (!tarjetas.length) return null;
  return { tarjetas, resto: resto.trim() };
}

export function leerEscenarios(texto) {
  const t = String(texto ?? '');
  if (!/Escenario\s+\d+\s*:/i.test(t)) return null;
  const bloques = t.split(/(?=^\s*Escenario\s+\d+\s*:)/im).map(b => b.trim()).filter(Boolean);
  const escenarios = [];
  let resto = '';
  for (const b of bloques) {
    const cabeza = /^Escenario\s+(\d+)\s*:\s*/i.exec(b);
    if (!cabeza) { resto += `${b}\n\n`; continue; }
    const lineas = b.slice(cabeza[0].length).split('\n');
    const situacion = [];
    const opciones = [];
    let recuerda = null;
    for (const linea of lineas) {
      const op = /^\s*([A-F])\)\s*(.+)$/.exec(linea);
      const rec = /^\s*Recuerda\s*:\s*(.+)$/i.exec(linea);
      if (op) {
        const flecha = op[2].indexOf('→');
        const textoOp = (flecha >= 0 ? op[2].slice(0, flecha) : op[2]).trim();
        const consecuencia = flecha >= 0 ? op[2].slice(flecha + 1).trim() : '';
        opciones.push({ letra: op[1], texto: textoOp, consecuencia, correcta: /^correct[oa]\b/i.test(consecuencia) });
      } else if (rec) recuerda = rec[1].trim();
      else if (linea.trim() && !opciones.length) situacion.push(linea.trim());
      else if (linea.trim() && opciones.length) {
        const ultima = opciones[opciones.length - 1];
        if (recuerda != null) recuerda += ` ${linea.trim()}`;
        else ultima.consecuencia = `${ultima.consecuencia} ${linea.trim()}`.trim();
      }
    }
    if (opciones.length >= 2 && opciones.filter(o => o.correcta).length === 1 && situacion.length) {
      escenarios.push({ numero: Number(cabeza[1]), situacion: situacion.join(' '), opciones, recuerda });
    } else resto += `${b}\n\n`;
  }
  if (!escenarios.length) return null;
  return { escenarios, resto: resto.trim() };
}

// «• Rods (rods): Bastones: células… Ejemplo: Rods are…»
export function leerPalabras(texto) {
  const palabras = [];
  let resto = '';
  for (const linea of String(texto ?? '').split('\n')) {
    const l = linea.trim();
    if (!l) continue;
    const m = /^(?:[•·\-–*]\s*)?([^()\n]{1,60}?)\s*\(([^()\n]{1,60})\)\s*:\s*(.+)$/.exec(l);
    if (!m) { resto += `${l}\n`; continue; }
    const corte = m[3].search(/\s*\bEjemplo\s*:/i);
    const significado = (corte >= 0 ? m[3].slice(0, corte) : m[3]).trim();
    const ejemplo = corte >= 0 ? m[3].slice(corte).replace(/^\s*Ejemplo\s*:\s*/i, '').trim() : null;
    palabras.push({ palabra: m[1].trim(), pronunciacion: m[2].trim(), significado, ejemplo });
  }
  if (palabras.length < 2) return null;
  return { palabras, resto: resto.trim() };
}

// ---- Resaltar dentro de un texto: términos en inglés entre paréntesis y cifras con su unidad ----
const UNIDADES = '(?:%|°|grados?|minutos?|min|segundos?|s|horas?|h|d[ií]as?|pies|ft|nudos?|kt|millas?|NM|metros?|m|km|mph|pulgadas?|inHg|hPa|mb|litros?|galones?|libras?|lb|veces)';
const PATRON_RESALTE = new RegExp(`(\\((?=[^()]*[A-Za-z])[A-Za-z][A-Za-z0-9 ,'’/.\\-]{1,60}\\))|(\\b\\d+(?:[.,]\\d+)*(?:\\s?(?:a|-|–)\\s?\\d+(?:[.,]\\d+)*)?\\s?${UNIDADES}(?![A-Za-zÁÉÍÓÚáéíóúñ]))`, 'g');
const PALABRAS_ES = /\b(el|la|los|las|de|del|que|y|e|o|u|en|por|con|para|una?|unos|unas|como|sin|más|menos|se|es|no|ni|al|lo|su|sus|muy|pero|otro|otra)\b/i;
// ¿Parece un término en inglés? Letras sin tildes, ninguna palabra común del español, ninguna terminación típica del
// español, y alguna señal del inglés (th, sh, ck, ght, tion, -ing, ee, oo, ea, ou, w, k, y final…). Ante la duda, NO:
// un término en español nunca debe salir como ficha de inglés (las siglas como FAR o NTSB tampoco).
const TERMINACION_ES = /(dad|cion|ciones|mente|ando|iendo|ado|ada|ados|adas|osis|encia|ores|ismo|[^e]os|[^e]as)\b/i;
const SENAL_EN = /(th|sh|ck|wh|ght|tion|ing\b|ee|oo|ea|ou|w|k|y(?![aeiou]))/i;
export function pareceIngles(termino, { titulo = false } = {}) {
  const t = String(termino ?? '').trim();
  if (!t || t.length > (titulo ? 200 : 60) || /[áéíóúñ¿¡]/i.test(t) || !/[a-z]/.test(t)) return false;
  if (PALABRAS_ES.test(t) || TERMINACION_ES.test(t)) return false;
  // En un título «Español (english)» el paréntesis es siempre la traducción: basta con que no parezca español.
  return titulo || SENAL_EN.test(t);
}

// Devuelve trozos [{ texto }, { texto, ingles: true }, { texto, cifra: true }]; juntos dicen EXACTAMENTE el texto.
export function resaltar(texto) {
  const t = String(texto ?? '');
  const trozos = [];
  let desde = 0;
  for (const m of t.matchAll(PATRON_RESALTE)) {
    const inicio = m.index;
    let clase = null;
    if (m[1]) {
      if (pareceIngles(m[1].slice(1, -1))) clase = 'ingles';
    } else if (m[2]) clase = 'cifra';
    if (!clase) continue;
    if (inicio > desde) trozos.push({ texto: t.slice(desde, inicio) });
    trozos.push({ texto: m[0], [clase]: true });
    desde = inicio + m[0].length;
  }
  if (desde < t.length) trozos.push({ texto: t.slice(desde) });
  return trozos;
}

// Las palabras de inglés que aparecen en un texto, de un vocabulario (para ponerlas como fichas en la tarjeta).
export function palabrasEn(texto, vocabulario) {
  const t = String(texto ?? '').toLowerCase();
  return (vocabulario ?? []).filter(w => {
    const p = String(w.palabra ?? '').toLowerCase().trim();
    return p.length > 2 && new RegExp(`(^|[^a-z])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t);
  }).slice(0, 3);
}

const tituloComo = (titulo, re) => re.test(String(titulo ?? ''));

// La lección entera → la lista de pantallas.
export function partirLeccion(secciones) {
  const lista = Array.isArray(secciones) ? secciones : [];
  // El vocabulario del tema (para las fichas de inglés de las otras tarjetas).
  const vocabulario = [];
  for (const s of lista) {
    if (s?.tipo === 'tarjeta' && Array.isArray(s.ingles)) vocabulario.push(...s.ingles);
    else if (tituloComo(s?.titulo, /ingl[eé]s/i)) vocabulario.push(...(leerPalabras(s?.texto)?.palabras ?? []));
  }
  const pantallas = [];
  const generica = (s, texto, extra = {}) => {
    const grupos = agrupar(puntosDe(texto));
    grupos.forEach((g, i) => {
      // La idea clave va en el recuadro «Recuerda» si es el ÚLTIMO punto de la tarjeta (así el orden de lectura no cambia).
      let recuerda = null;
      let puntos = g;
      if (!extra.sinRecuerda && IDEA_CLAVE.test(g[g.length - 1].texto)) {
        recuerda = g[g.length - 1].texto;
        puntos = g.slice(0, -1);
      }
      const todo = g.map(p => p.texto).join(' ');
      pantallas.push({
        tipo: 'tarjeta', estilo: extra.estilo ?? 'normal', titulo: s.titulo, parte: grupos.length > 1 ? i + 1 : null, partes: grupos.length > 1 ? grupos.length : null,
        puntos: puntos.map(p => p.texto), recuerda, ejemplo: null, ingles: palabrasEn(todo, vocabulario), visual: null,
        nota: i === grupos.length - 1 ? s.nota ?? null : null, fuentes: s.fuentes ?? [],
      });
    });
  };
  for (const s of lista) {
    if (!s || typeof s !== 'object') continue;
    if (s.tipo === 'tarjeta') {
      pantallas.push({
        tipo: 'tarjeta', estilo: 'normal', titulo: s.titulo, parte: null, partes: null, puntos: [...(s.puntos ?? [])],
        recuerda: s.recuerda ?? null, ejemplo: s.ejemplo ?? null, ingles: s.ingles ?? [], visual: s.visual ?? null,
        texto: s.texto ?? null, nota: s.nota ?? null, fuentes: s.fuentes ?? [],
      });
      continue;
    }
    const texto = s.texto ?? '';
    const claves = leerPreguntasClave(texto);
    if (claves) {
      claves.tarjetas.forEach((c, i) => pantallas.push({ tipo: 'girar', titulo: s.titulo, indice: i + 1, total: claves.tarjetas.length, pregunta: c.pregunta, respuesta: c.respuesta, fuentes: s.fuentes ?? [] }));
      if (claves.resto) generica(s, claves.resto);
      continue;
    }
    const escenas = leerEscenarios(texto);
    if (escenas) {
      escenas.escenarios.forEach((e, i) => pantallas.push({ tipo: 'situacion', titulo: s.titulo, indice: i + 1, total: escenas.escenarios.length, ...e, fuentes: s.fuentes ?? [] }));
      if (escenas.resto) generica(s, escenas.resto);
      continue;
    }
    if (tituloComo(s.titulo, /ingl[eé]s/i)) {
      const v = leerPalabras(texto);
      if (v) {
        const grupos = [];
        for (let i = 0; i < v.palabras.length; i += MAX_PALABRAS_POR_TARJETA) grupos.push(v.palabras.slice(i, i + MAX_PALABRAS_POR_TARJETA));
        grupos.forEach((g, i) => pantallas.push({ tipo: 'vocabulario', titulo: s.titulo, parte: grupos.length > 1 ? i + 1 : null, partes: grupos.length > 1 ? grupos.length : null, palabras: g, fuentes: s.fuentes ?? [] }));
        if (v.resto) generica(s, v.resto);
        continue;
      }
    }
    if (tituloComo(s.titulo, /^resumen\b/i)) { generica(s, texto, { estilo: 'resumen', sinRecuerda: true }); continue; }
    if (tituloComo(s.titulo, /analog/i)) { generica(s, texto, { estilo: 'analogia', sinRecuerda: true }); continue; }
    generica(s, texto);
  }
  return pantallas;
}

// Todo el texto de las pantallas, junto (para las pruebas: nada se pierde al partir).
export function textoDePantallas(pantallas) {
  return pantallas.map(p => [p.titulo, ...(p.puntos ?? []), p.recuerda, p.pregunta, p.respuesta, p.situacion,
    ...(p.opciones ?? []).flatMap(o => [o.texto, o.consecuencia]), ...(p.palabras ?? []).flatMap(w => [w.palabra, w.pronunciacion, w.significado, w.ejemplo])]
    .filter(Boolean).join(' ')).join(' ');
}
