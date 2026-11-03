// Herramientas de texto del motor propio.
// normalizar() deja el texto en minúsculas, sin acentos y con la MISMA longitud que el original:
// así, lo que se encuentra en el texto normalizado se puede recortar del original con sus acentos.

export function normalizar(texto) {
  const original = String(texto ?? '');
  let r = '';
  for (let i = 0; i < original.length; i++) {
    const c = original[i];
    const base = c.toLowerCase().normalize('NFD')[0] || ' ';
    if (/[a-z0-9$]/.test(base)) r += base;
    // La coma y el punto se guardan solo entre números (25,000 o 25.000).
    else if ((c === ',' || c === '.') && /\d/.test(original[i - 1] || '') && /\d/.test(original[i + 1] || '')) r += c;
    else if ('.;:!?\n'.includes(c)) r += '.';
    else r += ' ';
  }
  return r;
}

// Igual que normalizar(), pero además junta espacios: sirve para comparar una palabra suelta.
export function comparable(texto) {
  return normalizar(texto).replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
}

const PALABRAS_CORTAS = new Set(['de', 'del', 'la', 'el', 'en', 'y', 'los', 'las', 'a', 'para', 'con', 'of', 'the', 'and', 'for']);

function pluralEs(palabra) {
  if (PALABRAS_CORTAS.has(palabra) || palabra.endsWith('s')) return palabra;
  if (palabra.endsWith('z')) return `${palabra.slice(0, -1)}ces`;
  if (/[aeiou]$/.test(palabra)) return `${palabra}s`;
  return `${palabra}es`;
}

// Formas de una frase: tal cual, en plural español (todas las palabras o solo la primera) y con «s» (inglés).
export function variantes(frase) {
  const palabras = comparable(frase).split(' ');
  const formas = new Set([palabras.join(' ')]);
  formas.add(palabras.map(pluralEs).join(' '));
  formas.add([pluralEs(palabras[0]), ...palabras.slice(1)].join(' '));
  formas.add(palabras.map(p => (PALABRAS_CORTAS.has(p) || p.endsWith('s') ? p : `${p}s`)).join(' '));
  formas.add([palabras[0].endsWith('s') ? palabras[0] : `${palabras[0]}s`, ...palabras.slice(1)].join(' '));
  return [...formas].filter(Boolean);
}

// Busca frases enteras (no pedazos de palabras) en un texto normalizado.
// entradas: [{ frase, dato }]. Gana la frase más larga y ninguna se monta sobre otra.
const preparadas = new WeakMap();

// Las frases de un diccionario se preparan una sola vez (de la más larga a la más corta).
function preparar(entradas) {
  if (preparadas.has(entradas)) return preparadas.get(entradas);
  const vistas = new Set();
  const lista = entradas
    .flatMap(e => variantes(e.frase).map(forma => ({ dato: e.dato, forma })))
    .filter(e => {
      const clave = `${e.forma}|${JSON.stringify(e.dato)}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .sort((a, b) => b.forma.length - a.forma.length)
    // La frase se busca palabra por palabra, aunque el texto tenga varios espacios entre ellas.
    .map(e => ({ dato: e.dato, patron: new RegExp(`(?<![a-z0-9$])${e.forma.split(' ').map(escapar).join('\\s+')}(?![a-z0-9$])`, 'g') }));
  preparadas.set(entradas, lista);
  return lista;
}

export function buscarFrases(textoNormal, entradas) {
  const ocupado = new Uint8Array(textoNormal.length);
  const hallazgos = [];
  for (const entrada of preparar(entradas)) {
    const patron = entrada.patron;
    patron.lastIndex = 0;
    for (const m of textoNormal.matchAll(patron)) {
      const inicio = m.index;
      const fin = inicio + m[0].length;
      let libre = true;
      for (let i = inicio; i < fin; i++) if (ocupado[i]) { libre = false; break; }
      if (!libre) continue;
      ocupado.fill(1, inicio, fin);
      hallazgos.push({ inicio, fin, dato: entrada.dato });
    }
  }
  return hallazgos.sort((a, b) => a.inicio - b.inicio);
}

function escapar(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ¿La frase aparece entera en el texto normalizado?
export function contiene(textoNormal, frase) {
  return new RegExp(`(?<![a-z0-9$])${comparable(frase).split(' ').map(escapar).join('\\s+')}(?![a-z0-9$])`).test(textoNormal);
}

