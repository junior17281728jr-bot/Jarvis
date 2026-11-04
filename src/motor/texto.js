// Herramientas de texto del motor propio.
// plano() y normalizar() dejan el texto en minúsculas y sin acentos con la MISMA longitud que el original:
// así, lo que se encuentra se puede recortar del original con sus acentos y su puntuación.
// tokenizar() parte el texto en palabras, números y signos, y guarda dónde empieza y termina cada uno.

// Minúsculas y sin acentos, letra por letra. Lo que no es una letra simple (emojis…) queda como espacio.
export function plano(texto) {
  const original = String(texto ?? '');
  let r = '';
  for (let i = 0; i < original.length; i++) {
    const codigo = original.charCodeAt(i);
    // Las letras simples (sin acento) van directo: es lo más común y así se ahorra trabajo.
    if (codigo < 128) { r += codigo >= 65 && codigo <= 90 ? String.fromCharCode(codigo + 32) : original[i]; continue; }
    if (codigo >= 0xd800 && codigo <= 0xdfff) { r += ' '; continue; }
    r += original[i].toLowerCase().normalize('NFD')[0] || ' ';
  }
  return r;
}

export function normalizar(texto) {
  const original = String(texto ?? '');
  const base = plano(original);
  let r = '';
  for (let i = 0; i < base.length; i++) {
    const c = base[i];
    if (/[a-z0-9$]/.test(c)) r += c;
    // La coma y el punto se guardan solo entre números (25,000 o 25.000).
    else if ((c === ',' || c === '.') && /\d/.test(base[i - 1] || '') && /\d/.test(base[i + 1] || '')) r += c;
    else if ('.;:!?\n'.includes(c)) r += '.';
    else r += ' ';
  }
  return r;
}

// Igual que normalizar(), pero además junta espacios: sirve para comparar una palabra suelta.
export function comparable(texto) {
  return normalizar(texto).replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------- Palabras sueltas ----------
const ESCRITURA_RAPIDA = new Map([
  ['q', 'que'], ['xq', 'porque'], ['pq', 'porque'], ['d', 'de'], ['pa', 'para'], ['pal', 'para'], ['tb', 'tambien'], ['tmb', 'tambien'],
  ['tbn', 'tambien'], ['dl', 'del'], ['n', 'en'], ['cn', 'con'], ['toy', 'estoy'], ['porfa', 'por favor'], ['xfa', 'por favor'], ['xfavor', 'por favor'],
  // «na de bancas», «na' de eso»: en RD «na» es «nada». «kiero» es «quiero». «x encargo», «al x mayor»: la x es «por».
  ['na', 'nada'], ['kiero', 'quiero'], ['kieres', 'quieres'], ['kiere', 'quiere'], ['x', 'por'],
]);
// Emojis que dicen «no» (❌ bancos) o «teléfono» (📞 809…).
const EMOJIS_NO = new Set([0x274c, 0x2716, 0x2717, 0x2718, 0x26d4, 0x1f6ab, 0x1f645]);
const EMOJIS_TELEFONO = new Set([0x1f4de, 0x260e, 0x1f4f1, 0x1f4f2]);
// Puntos que no terminan una frase: «Av. Duarte», «Sto. Dgo.», «No. 5».
const ABREVIATURAS = new Set(['av', 'ave', 'avda', 'sto', 'sta', 'dgo', 'stgo', 'prov', 'mun', 'sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'licda', 'ing',
  'tel', 'cel', 'aprox', 'ej', 'urb', 'res', 'esq', 'edif', 'apto', 'km', 'mr', 'mrs', 'ms', 'st', 'calle', 'c', 'num', 'arq', 'prof']);
const SIGNOS_FUERTES = new Set(['.', ';', '!', '?', '¡', '¿', '…', '\n', '\r']);
const SIGNOS_SUAVES = new Set([',', ':', '(', ')', '–', '—', '[', ']', '{', '}']);

const esLetra = c => c >= 'a' && c <= 'z';
const esDigito = c => c >= '0' && c <= '9';

// Cada token: { w, ini, fin, tipo, mayus }. tipo: 'p' palabra, 'n' número, 's' signo (w = ',', '.', '-', '/', '%'…).
// En los signos, '.' es el final de una frase y ',' una pausa. «mayus»: la palabra empieza con mayúscula.
export function tokenizar(texto) {
  const original = String(texto ?? '');
  let p = plano(original);
  // Enlaces y correos: un solo token, para que «hoteles» dentro de una dirección web no cuente.
  p = p.replace(/(?:https?:\/\/|www\.)[^\s,;]+|[^\s,;@]+@[^\s,;@]+\.[a-z]{2,}/g, m => `${'_'.repeat(m.length)}`);
  // R.D., S.D., EE.UU.: letras con punto se juntan en una sola palabra.
  p = p.replace(/(?<![a-z0-9])(?:[a-z]{1,2}\.\s?){2,}(?![a-z0-9])/g, m => {
    const letras = m.replace(/[.\s]/g, '');
    return letras.length <= 4 ? letras + ' '.repeat(m.length - letras.length) : m;
  });
  const tokens = [];
  const empujar = (w, ini, fin, tipo) => tokens.push({ w, ini, fin, tipo, mayus: tipo === 'p' && /\p{Lu}/u.test(original[ini] || '') });
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    const punto = original.codePointAt(i);
    if (EMOJIS_NO.has(punto) || EMOJIS_TELEFONO.has(punto)) {
      const largo = punto > 0xffff ? 2 : 1;
      empujar(EMOJIS_NO.has(punto) ? 'no' : 'tel', i, i + largo, 'p');
      i += largo;
      continue;
    }
    if (c === '_') {
      const ini = i;
      while (i < p.length && p[i] === '_') i++;
      empujar('enlace', ini, i, 'p');
    } else if (esLetra(c)) {
      const ini = i;
      let w = '';
      while (i < p.length && (esLetra(p[i]) || ((p[i] === "'" || original[i] === '’') && esLetra(p[i + 1] || '')))) {
        if (esLetra(p[i])) w += p[i];
        i++;
      }
      // Un apóstrofo al final («pa'») se ignora.
      if (p[i] === "'" || original[i] === '’') i++;
      const corto = ESCRITURA_RAPIDA.get(w);
      const anterior = tokens[tokens.length - 1];
      if (w === 'k' && anterior?.tipo === 'n') empujar('k', ini, i, 'p');
      else if (w === 'k') empujar('que', ini, i, 'p');
      else if (corto) for (const parte of corto.split(' ')) empujar(parte, ini, i, 'p');
      else empujar(w, ini, i, 'p');
      // «Av.», «Sto.»: el punto de una abreviatura no termina la frase.
      if (p[i] === '.' && ABREVIATURAS.has(w) && /^\s*[a-z0-9,;:)]/.test(p.slice(i + 1, i + 4))) i++;
      else if (p[i] === '.' && w === 'no' && /^\s*\d/.test(p.slice(i + 1, i + 4))) i++;
    } else if (esDigito(c)) {
      const ini = i;
      while (i < p.length && (esDigito(p[i]) || ((p[i] === ',' || p[i] === '.') && esDigito(p[i - 1]) && esDigito(p[i + 1] || '')))) i++;
      empujar(p.slice(ini, i), ini, i, 'n');
    } else if (c === '$') {
      const anterior = tokens[tokens.length - 1];
      if (anterior?.tipo === 'p' && ['rd', 'us', 'usd', 'dop'].includes(anterior.w) && i - anterior.fin <= 2) {
        anterior.w = anterior.w === 'us' || anterior.w === 'usd' ? 'us$' : 'rd$';
        anterior.fin = i + 1;
      } else empujar('$', i, i + 1, 's');
      i++;
    } else if (c === '-' || c === '–' || c === '—') {
      // El guion entre números es un rango («18k-22k», «25000-30000»); entre palabras es un espacio.
      let a = i - 1;
      while (a >= 0 && a > i - 4 && p[a] === ' ') a--;
      let d = i + 1;
      while (d < p.length && d < i + 4 && p[d] === ' ') d++;
      const antes = p[a] || '';
      const despues = p[d] || '';
      if (esDigito(despues) || esDigito(antes) || (antes === 'k' && esDigito(p[a - 1] || ''))) empujar('-', i, i + 1, 's');
      else if (c !== '-') empujar(',', i, i + 1, 's');
      i++;
    } else if (c === '&') {
      empujar('y', i, i + 1, 'p');
      i++;
    } else if (SIGNOS_FUERTES.has(c)) {
      empujar('.', i, i + 1, 's');
      i++;
    } else if (SIGNOS_SUAVES.has(c)) {
      empujar(',', i, i + 1, 's');
      i++;
    } else if ('/%+#'.includes(c)) {
      empujar(c, i, i + 1, 's');
      i++;
    } else i++;
  }
  return tokens;
}

// ¿El texto está escrito casi todo en MAYÚSCULAS? Entonces las mayúsculas no dicen nada.
export function todoEnMayusculas(texto) {
  const letras = String(texto ?? '').match(/\p{L}/gu) || [];
  if (letras.length < 8) return false;
  return letras.filter(l => /\p{Lu}/u.test(l)).length / letras.length > 0.7;
}

// ---------- Plurales y frases ----------
const PALABRAS_CORTAS = new Set(['de', 'del', 'la', 'el', 'en', 'y', 'los', 'las', 'a', 'al', 'para', 'con', 'por', 'e', 'of', 'the', 'and', 'for', 'in', 'to']);

function pluralEs(palabra) {
  if (PALABRAS_CORTAS.has(palabra) || palabra.endsWith('s') || /\d/.test(palabra)) return palabra;
  if (palabra.endsWith('z')) return `${palabra.slice(0, -1)}ces`;
  if (/[aeiou]$/.test(palabra)) return `${palabra}s`;
  return `${palabra}es`;
}

function pluralEn(palabra) {
  if (PALABRAS_CORTAS.has(palabra) || /\d/.test(palabra)) return palabra;
  if (/(s|x|ch|sh)$/.test(palabra)) return `${palabra}es`;
  if (/[^aeiou]y$/.test(palabra)) return `${palabra.slice(0, -1)}ies`;
  return `${palabra}s`;
}

// Formas de una frase: tal cual y en plural (todas las palabras, solo la primera o solo la última),
// en español (hotel → hoteles) y en inglés (coffee shop → coffee shops, factory → factories).
export function variantes(frase) {
  const palabras = comparable(frase).split(' ').filter(Boolean);
  if (!palabras.length) return [];
  const formas = new Set([palabras.join(' ')]);
  for (const plural of [pluralEs, pluralEn]) {
    formas.add(palabras.map(plural).join(' '));
    formas.add([plural(palabras[0]), ...palabras.slice(1)].join(' '));
    formas.add([...palabras.slice(0, -1), plural(palabras[palabras.length - 1])].join(' '));
  }
  return [...formas];
}

// Índice de frases para buscar en los tokens: por la primera palabra, de la frase más larga a la más corta.
// entradas: [{ frase, dato, plural }]. Con «plurales» (o «plural» en la entrada), también se busca en plural.
export function crearIndice(entradas, { plurales = false } = {}) {
  const porForma = new Map();
  for (const { frase, dato, plural } of entradas) {
    for (const forma of plurales || plural ? variantes(frase) : [comparable(frase)]) {
      if (!forma) continue;
      if (!porForma.has(forma)) porForma.set(forma, []);
      const datos = porForma.get(forma);
      if (!datos.some(d => JSON.stringify(d) === JSON.stringify(dato))) datos.push(dato);
    }
  }
  const indice = new Map();
  for (const [forma, datos] of porForma) {
    const palabras = forma.split(' ');
    if (!indice.has(palabras[0])) indice.set(palabras[0], []);
    indice.get(palabras[0]).push({ palabras, datos });
  }
  for (const lista of indice.values()) lista.sort((a, b) => b.palabras.length - a.palabras.length);
  return indice;
}

// La frase más larga del índice que empieza en el token «i» (sin cruzar signos). Devuelve { ini, fin, datos }.
export function buscarEn(tokens, i, indice) {
  const t = tokens[i];
  if (!t || t.tipo === 's') return null;
  const candidatas = indice.get(t.w);
  if (!candidatas) return null;
  for (const c of candidatas) {
    let ok = true;
    for (let k = 1; k < c.palabras.length; k++) {
      const otro = tokens[i + k];
      if (!otro || otro.tipo === 's' || otro.w !== c.palabras[k]) { ok = false; break; }
    }
    if (ok) return { ini: i, fin: i + c.palabras.length, datos: c.datos };
  }
  return null;
}

// Distancia de edición (cuántas letras cambiar) con un tope, para sugerir «¿Quisiste decir Santiago?».
export function distancia(a, b, tope = 3) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (fila[j] < menor) menor = fila[j];
    }
    if (menor > tope) return tope + 1;
    previa = fila;
  }
  return previa[b.length];
}

// ---------- Para compatibilidad: buscar frases en un texto ya normalizado ----------
const indicesSueltos = new WeakMap();

export function buscarFrases(textoNormal, entradas) {
  if (!indicesSueltos.has(entradas)) indicesSueltos.set(entradas, crearIndice(entradas, { plurales: true }));
  const indice = indicesSueltos.get(entradas);
  const tokens = tokenizar(textoNormal);
  const hallazgos = [];
  for (let i = 0; i < tokens.length;) {
    const m = buscarEn(tokens, i, indice);
    if (!m) { i++; continue; }
    for (const dato of m.datos.slice(0, 1)) hallazgos.push({ inicio: tokens[m.ini].ini, fin: tokens[m.fin - 1].fin, dato });
    i = m.fin;
  }
  return hallazgos;
}

// ¿La frase aparece entera en el texto?
export function contiene(texto, frase) {
  const buscada = comparable(frase).split(' ');
  const palabras = tokenizar(texto).map(t => t.w);
  for (let i = 0; i + buscada.length <= palabras.length; i++) {
    if (buscada.every((w, k) => palabras[i + k] === w)) return true;
  }
  return false;
}
