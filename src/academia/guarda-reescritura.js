// Academia 0.14.94: la guarda en CÓDIGO (sin IA) de lo que reescribe la IA de la fábrica («Mejora continua», «Mejorar todo»
// y la revisión final): una reescritura cambia las palabras, NUNCA los datos. Se compara el texto de antes con el nuevo
// (una tarjeta con su dibujo, o un tema entero) y se rechaza (no se publica; queda lo de antes) si:
//  - aparece un número que no estaba, o falta uno que estaba («10,000» y «10000» son el mismo);
//  - un número con su unidad («3 millas», «500 pies», «122.8 MHz») ya no está con ESA unidad (así se ve «3 millones»);
//  - una unidad que estaba (millas, milla, pies, nudos, MHz, NM, AGL, MSL…) ya no aparece en ninguna de sus formas de antes;
//  - una palabra técnica clave (mínimo/mínima/mínimos/mínimas, máximo…, VFR, IFR, obligatorio…) deja de estar en esa forma;
//  - aparece una palabra que nunca va en una clase de aviación si no estaba antes ni en el libro: «millón/millones» (por
//    «milla/millas») y «mía/mío/míos/mías» (por «mínima/mínimo…»). Lo vio el dueño en producción el 2026-11-20.
// Puro: sin base, sin disco, sin red. → { ok, motivos: [texto corto] }
const LETRA = '\\p{L}\\p{N}';
const palabra = fuente => new RegExp(`(?<![${LETRA}])(?:${fuente})(?![${LETRA}])`, 'giu');
// Las unidades (nombre → expresión de sus formas). El orden importa para los pares número + unidad: la primera que calza.
export const UNIDADES = Object.freeze([
  ['milla', 'millas?'], ['pie', 'pies|pie|ft'], ['nudo', 'nudos?|kts?|KIAS|KTAS'], ['MHz', 'MHz'], ['kHz', 'kHz'],
  ['NM', 'NM'], ['rpm', 'rpm|RPM'], ['SM', 'SM'], ['AGL', 'AGL'], ['MSL', 'MSL'], ['galón', 'galones|galón|gal'], ['libra', 'libras?|lbs?'],
  ['grado', 'grados?|°'], ['pulgada', 'pulgadas?|inHg'], ['hPa', 'hPa|mb'], ['minuto', 'minutos?|min'],
  ['hora', 'horas?'], ['segundo', 'segundos?'], ['por ciento', '%|por ciento'], ['metro', 'metros?'], ['kilómetro', 'kilómetros?|km'],
]);
// Las palabras técnicas que una reescritura nunca puede perder (cada FORMA que estaba tiene que seguir).
export const CLAVES = Object.freeze(['mínimo', 'mínima', 'mínimos', 'mínimas', 'máximo', 'máxima', 'máximos', 'máximas',
  'VFR', 'IFR', 'obligatorio', 'obligatoria', 'prohibido', 'prohibida', 'autorización', 'transpondedor']);
// Las que nunca aparecen nuevas (si no estaban antes ni en el libro): así se ven «millas → millones» y «mínima → mía».
export const SOSPECHOSAS = Object.freeze(['millón', 'millones', 'mía', 'mío', 'míos', 'mías']);

// Todo el texto de una tarjeta (o de lo que sea): las cadenas, sin las claves ni los archivos.
const NO_TEXTO = new Set(['archivo', 'libro', 'pagina', 'tipo', 'fuentes', 'imagen', 'clip', 'audio', 'video', 'id', 'de']);
export function textoDe(x) {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'number') return String(x);
  if (Array.isArray(x)) return x.map(textoDe).join('\n');
  if (typeof x === 'object') return Object.entries(x).filter(([k]) => !NO_TEXTO.has(k)).map(([, v]) => textoDe(v)).join('\n');
  return '';
}
const NUM = '\\d+(?:[.,]\\d+)*';
const limpioNum = n => String(n).replace(/(\d)[,](?=\d{3}(?!\d))/g, '$1').replace(/\.0+$/, '');
const numeros = t => (String(t).match(new RegExp(`(?<![${LETRA}])${NUM}`, 'gu')) ?? []).map(limpioNum);
const cuenta = (t, re) => String(t).match(re) ?? [];
// Los pares «número unidad» de un texto (con la unidad en su nombre común): «3 millas» → «3 milla».
function pares(t) {
  const out = new Set();
  const re = new RegExp(`(${NUM})\\s?(${UNIDADES.map(([, f]) => f).join('|')})(?![${LETRA}])`, 'gu');
  for (const m of String(t).matchAll(re)) {
    const u = UNIDADES.find(([, f]) => new RegExp(`^(?:${f})$`, 'u').test(m[2]));
    if (u) out.add(`${limpioNum(m[1])} ${u[0]}`);
  }
  return out;
}
// Las formas de una unidad que aparecen en un texto (en minúsculas salvo las siglas).
const formas = (t, fuente) => new Set(cuenta(t, palabra(fuente)).map(x => x.toLowerCase()));

// antes / despues: texto o cualquier objeto (tarjeta, tema). base: más texto donde una palabra «sospechosa» o un número
// nuevo pueden estar (el libro del tema). { quitados: false } deja que falte un número (nunca que aparezca uno nuevo).
export function revisarReescritura(antes, despues, { base = '', quitados = true } = {}) {
  const a = textoDe(antes);
  const d = textoDe(despues);
  const b = textoDe(base);
  const motivos = [];
  const na = new Set(numeros(a));
  const nd = new Set(numeros(d));
  const nb = new Set(numeros(b));
  for (const n of nd) if (!na.has(n) && !nb.has(n)) motivos.push(`numero_nuevo:${n}`);
  if (quitados) for (const n of na) if (!nd.has(n)) motivos.push(`numero_quitado:${n}`);
  const pd = pares(d);
  for (const p of pares(a)) if (!pd.has(p)) motivos.push(`unidad_cambiada:${p}`);
  for (const [nombre, fuente] of UNIDADES) {
    const fa = formas(a, fuente);
    if (!fa.size) continue;
    const fd = formas(d, fuente);
    for (const f of fa) if (!fd.has(f)) motivos.push(`unidad_perdida:${nombre}:${f}`);
  }
  for (const c of CLAVES) {
    const re = palabra(c);
    if (re.test(a) && !palabra(c).test(d)) motivos.push(`palabra_clave_perdida:${c}`);
  }
  const conBase = `${a}\n${b}`.toLowerCase();
  for (const s of SOSPECHOSAS) if (palabra(s).test(d) && !palabra(s).test(conBase)) motivos.push(`palabra_sospechosa:${s}`);
  return { ok: !motivos.length, motivos: [...new Set(motivos)] };
}
