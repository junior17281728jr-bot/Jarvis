// 0.14.8: «Claude mejora la app». Lo PURO: qué archivos puede tocar un cambio, cómo se aplica y qué se rechaza. Sin red,
// sin base y sin disco (quien llama pasa leer(ruta) → texto o null). Lo usan los dos procesos.
// El cambio que propone Claude es JSON: { titulo, explicacion, cambios: [{ archivo, buscar, reemplazar }], textos: [{ clave,
// es, en }] }. Se rechaza en CÓDIGO (antes de probar nada) todo lo que no sea:
//  - SOLO la parte visible de la app: public/**/*.js, public/**/*.css y public/index.html (archivos que YA existen), y los
//    textos de public/i18n/es.json y en.json (por «textos», nunca a mano). Nunca src/, test/, deploy/, package.json, las
//    claves, los pagos, la clave de recuperación ni el sw.js. Una ruta rara (.., \, //, mayúsculas, puntos al principio)
//    se rechaza antes de mirar el disco.
//  - Cada «buscar» aparece UNA sola vez en el archivo (si no, no se sabe dónde va). «buscar» vacío solo en un .css: agrega
//    las reglas al final.
//  - Lo nuevo nunca agrega algo peligroso: innerHTML (ni outerHTML, insertAdjacentHTML, document.write, eval, new
//    Function), estilos incrustados (style=, setAttribute('style'), cssText), direcciones de internet, fetch, cookies o
//    almacenamiento del navegador, scripts o eventos en el HTML, @import o url() de afuera en el CSS. Se cuenta en lo que
//    se agrega y otra vez en el archivo entero que queda.
//  - Los textos: claves [a-z0-9._], en los dos idiomas, sin código; una clave que ya existe conserva sus {marcas}; los dos
//    archivos quedan con el mismo juego de claves y sin claves repetidas.
import { createHash } from 'node:crypto';

export const LIMITES_PARCHE = Object.freeze({ cambios: 8, textos: 16, buscar: 4_000, reemplazar: 8_000, agregadoBytes: 16_000, texto: 500, titulo: 120, explicacion: 1_200, clave: 80 });
export const I18N = Object.freeze(['public/i18n/es.json', 'public/i18n/en.json']);
const RUTA = /^public\/(?:[a-z0-9][a-z0-9_-]{0,40}\/){0,3}[a-z0-9][a-z0-9_-]{0,60}\.(?:js|css)$/;
const FUERA = /(?:^|\/)(?:sw\.js|clave-recuperacion\.js)$|pago|clave|contrasen|recibo|cuenta|sesion|login/;
const CLAVE_TEXTO = /^[a-z0-9_]{1,30}(?:\.[a-z0-9_]{1,40}){1,6}$/;
// Lo que un cambio nunca puede agregar (cuenta de veces: lo nuevo no puede tener más que lo que reemplaza).
export const PELIGROS = Object.freeze([
  ['html_crudo', /innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser|srcdoc/g],
  ['codigo_texto', /\beval\s*\(|new\s+Function\b|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]|\bimport\s*\(/g],
  ['estilo_incrustado', /\sstyle\s*=|['"`]style\s*=|setAttribute\(\s*['"`]style|\.style\.cssText|<style/gi],
  ['internet', /https?:\/\/|wss?:\/\/|\/\/[a-z0-9-]+\.[a-z]{2,}/gi],
  ['red', /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|navigator\.serviceWorker/g],
  ['datos_navegador', /localStorage|sessionStorage|indexedDB|document\.cookie/g],
  ['script', /<script|<iframe|<object|<embed|javascript:|\son[a-z]+\s*=/gi],
  ['css_afuera', /@import|url\(\s*['"]?\s*(?:https?:|\/\/|data:)/gi],
]);
const veces = (texto, re) => (String(texto).match(new RegExp(re.source, re.flags)) ?? []).length;
const huella = t => createHash('sha256').update(String(t)).digest('hex');
export { huella as huellaTexto };

// ¿Esta ruta se puede tocar? (sin mirar el disco) → null o el motivo.
export function motivoRuta(archivo) {
  const r = String(archivo ?? '');
  if (!r || r.length > 160) return 'ruta_no_valida';
  if (/\.\.|\\|\/\/|\0|^\/|\s|%/.test(r)) return 'ruta_no_valida';
  if (I18N.includes(r)) return 'textos_aparte';
  if (r !== 'public/index.html' && !RUTA.test(r)) return 'fuera_de_lo_permitido';
  if (FUERA.test(r)) return 'fuera_de_lo_permitido';
  return null;
}
export const rutaPermitida = archivo => motivoRuta(archivo) == null;

function peligroNuevo(antes, despues) {
  for (const [nombre, re] of PELIGROS) if (veces(despues, re) > veces(antes, re)) return nombre;
  return null;
}
const marcas = t => [...String(t).matchAll(/\{[a-z_]{1,30}\}/gi)].map(m => m[0]).sort().join(' ');

// Cambia (o agrega) UNA clave en el texto de un archivo de idioma, sin rehacer el archivo entero (así el cambio es chico).
function ponerTexto(texto, clave, valor) {
  const linea = `  ${JSON.stringify(clave)}: ${JSON.stringify(valor)}`;
  const re = new RegExp(`^  ${JSON.stringify(clave).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ".*?"(,?)$`, 'm');
  if (re.test(texto)) return texto.replace(re, (_, coma) => `${linea}${coma}`);
  const fin = texto.lastIndexOf('\n}');
  if (fin < 0) return null;
  return `${texto.slice(0, fin)},\n${linea}${texto.slice(fin)}`;
}
// Las claves de un archivo de idioma y si alguna está repetida (JSON.parse se queda con la última, en silencio).
export function clavesDeIdioma(texto) {
  const lista = [...String(texto).matchAll(/^ {2}("(?:[^"\\]|\\.)*"):/gm)].map(m => JSON.parse(m[1]));
  return { lista, repetidas: lista.filter((k, i) => lista.indexOf(k) !== i) };
}

// Revisa y aplica un cambio. leer(ruta) → texto o null. → { ok: false, motivo, detalle? } o { ok: true, archivos: [{ archivo,
// antes, despues, huellaAntes, huellaDespues }], titulo, explicacion, diff, resumen }.
export function aplicarParche(propuesta, leer) {
  const no = (motivo, detalle = null) => ({ ok: false, motivo, detalle });
  if (!propuesta || typeof propuesta !== 'object' || Array.isArray(propuesta)) return no('sin_cambio');
  const cambios = Array.isArray(propuesta.cambios) ? propuesta.cambios : [];
  const textos = Array.isArray(propuesta.textos) ? propuesta.textos : [];
  if (!cambios.length && !textos.length) return no('sin_cambio');
  if (cambios.length > LIMITES_PARCHE.cambios || textos.length > LIMITES_PARCHE.textos) return no('demasiado_grande');
  const titulo = String(propuesta.titulo ?? '').trim().slice(0, LIMITES_PARCHE.titulo);
  const explicacion = String(propuesta.explicacion ?? '').trim().slice(0, LIMITES_PARCHE.explicacion);
  if (!titulo) return no('sin_explicacion');
  const actual = new Map();
  const original = new Map();
  const leerActual = archivo => {
    if (!actual.has(archivo)) {
      const t = leer(archivo);
      if (typeof t !== 'string') return null;
      actual.set(archivo, t);
      original.set(archivo, t);
    }
    return actual.get(archivo);
  };
  let agregado = 0;
  for (const [i, c] of cambios.entries()) {
    if (!c || typeof c !== 'object') return no('cambio_no_valido', { i });
    const archivo = String(c.archivo ?? '');
    const motivo = motivoRuta(archivo);
    if (motivo) return no(motivo, { archivo: archivo.slice(0, 160) });
    const buscar = typeof c.buscar === 'string' ? c.buscar : null;
    const reemplazar = typeof c.reemplazar === 'string' ? c.reemplazar : null;
    if (buscar == null || reemplazar == null) return no('cambio_no_valido', { i });
    if (buscar.length > LIMITES_PARCHE.buscar || reemplazar.length > LIMITES_PARCHE.reemplazar) return no('demasiado_grande', { i });
    if (buscar === reemplazar) return no('sin_cambio', { i });
    const texto = leerActual(archivo);
    if (texto == null) return no('archivo_no_existe', { archivo });
    let nuevo;
    if (buscar === '') {
      if (!archivo.endsWith('.css')) return no('buscar_vacio', { archivo });
      nuevo = `${texto.replace(/\n*$/, '\n')}${reemplazar.replace(/\n*$/, '\n')}`;
    } else {
      const primero = texto.indexOf(buscar);
      if (primero < 0) return no('buscar_no_esta', { archivo, i });
      if (texto.indexOf(buscar, primero + 1) >= 0) return no('buscar_repetido', { archivo, i });
      nuevo = texto.slice(0, primero) + reemplazar + texto.slice(primero + buscar.length);
    }
    const peligro = peligroNuevo(buscar, reemplazar);
    if (peligro) return no(`peligro:${peligro}`, { archivo, i });
    agregado += Math.max(0, Buffer.byteLength(reemplazar) - Buffer.byteLength(buscar));
    actual.set(archivo, nuevo);
  }
  if (textos.length) {
    const [es, en] = I18N.map(leerActual);
    if (es == null || en == null) return no('archivo_no_existe', { archivo: 'public/i18n' });
    let nes = es;
    let nen = en;
    const viejo = { es: JSON.parse(es), en: JSON.parse(en) };
    for (const [i, x] of textos.entries()) {
      const clave = String(x?.clave ?? '');
      if (!CLAVE_TEXTO.test(clave) || clave.length > LIMITES_PARCHE.clave) return no('clave_no_valida', { i });
      for (const idioma of ['es', 'en']) {
        const v = x?.[idioma];
        if (typeof v !== 'string' || !v.trim() || v.length > LIMITES_PARCHE.texto || /[\u0000-\u001f]/.test(v) || /<|>|javascript:|https?:\/\//i.test(v)) return no('texto_no_valido', { i, idioma });
        if (Object.hasOwn(viejo[idioma], clave) && marcas(viejo[idioma][clave]) !== marcas(v)) return no('marcas_cambiadas', { clave, idioma });
      }
      nes = ponerTexto(nes, clave, x.es);
      nen = ponerTexto(nen, clave, x.en);
      if (nes == null || nen == null) return no('texto_no_valido', { i });
      agregado += Buffer.byteLength(x.es) + Buffer.byteLength(x.en);
    }
    for (const [archivo, t] of [[I18N[0], nes], [I18N[1], nen]]) {
      try { JSON.parse(t); } catch { return no('idioma_roto', { archivo }); }
      if (clavesDeIdioma(t).repetidas.length) return no('clave_repetida', { archivo });
      actual.set(archivo, t);
    }
    const a = new Set(Object.keys(JSON.parse(nes)));
    const b = Object.keys(JSON.parse(nen));
    if (a.size !== b.length || b.some(k => !a.has(k))) return no('idiomas_distintos');
  }
  if (agregado > LIMITES_PARCHE.agregadoBytes) return no('demasiado_grande');
  const archivos = [];
  for (const [archivo, despues] of actual) {
    const antes = original.get(archivo);
    if (antes === despues) continue;
    // Otra vez, en el archivo entero (un cambio no puede armar algo peligroso juntando dos pedazos).
    if (!I18N.includes(archivo)) {
      const peligro = peligroNuevo(antes, despues);
      if (peligro) return no(`peligro:${peligro}`, { archivo });
    }
    archivos.push({ archivo, antes, despues, huellaAntes: huella(antes), huellaDespues: huella(despues) });
  }
  if (!archivos.length) return no('sin_cambio');
  archivos.sort((x, y) => x.archivo.localeCompare(y.archivo));
  return { ok: true, archivos, titulo, explicacion, diff: diferencias(archivos), resumen: archivos.map(x => x.archivo) };
}

// Un «diff» simple para la pantalla: por archivo, las líneas que salen (-) y las que entran (+) con dos de contexto.
export function diferencias(archivos, { maxLineas = 400 } = {}) {
  const out = [];
  for (const { archivo, antes, despues } of archivos) {
    const a = antes.split('\n');
    const b = despues.split('\n');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    let fa = a.length - 1;
    let fb = b.length - 1;
    while (fa >= i && fb >= i && a[fa] === b[fb]) { fa--; fb--; }
    out.push(`--- ${archivo}`, `+++ ${archivo}`, `@@ línea ${i + 1} @@`);
    for (let k = Math.max(0, i - 2); k < i; k++) out.push(` ${a[k]}`);
    for (let k = i; k <= fa; k++) out.push(`-${a[k]}`);
    for (let k = i; k <= fb; k++) out.push(`+${b[k]}`);
    for (let k = fa + 1; k < Math.min(a.length, fa + 3); k++) out.push(` ${a[k]}`);
    if (out.length > maxLineas) break;
  }
  return out.slice(0, maxLineas).map(l => (l.length > 300 ? `${l.slice(0, 300)}…` : l)).join('\n');
}
