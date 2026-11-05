// Los precios de la IA: lee src/ia/precios.json (solo datos), lo revisa y hace las cuentas de dinero.
//  - El dinero va en millonésimas de dólar (µUSD), siempre en números enteros: con decimales, 23 × 0,1 + 70 × 0,01
//    da 3,0000000000000004 y al redondear hacia arriba saldría 4 en vez de 3.
//  - Los precios (dólares por millón de tokens, con hasta 3 decimales) se pasan a nano-dólares por token: «0.125» → 125.
//  - Siempre se redondea HACIA ARRIBA: OPORTIA nunca cuenta menos de lo que cobra el proveedor.
//  - Si el archivo tiene algo mal, la tabla queda VACÍA: ningún uso pagado puede pasar (precio_sin_confirmar). Nunca
//    tumba el arranque del servidor.
import { readFileSync } from 'node:fs';

const ARCHIVO = new URL('./precios.json', import.meta.url);
const PRECIO = /^(?:0|[1-9]\d{0,4})(?:\.\d{1,3})?$/;
const FECHA = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const NOMBRE = /^[a-z][a-z0-9._-]{1,60}$/;
const GEO = /^[a-z]{2,20}$/;
const HOSTS_DE_FUENTE = Object.freeze(['platform.claude.com', 'developers.openai.com', 'platform.openai.com']);
export const TIPOS_DE_TOKEN = Object.freeze(['entrada', 'cacheLectura', 'cacheEscritura', 'salida']);
// La reserva aparta un 5 % más de lo máximo calculado (y 1 µUSD), por si el proveedor redondea distinto.
const MARGEN_POR_CIENTO = 105n;

const aNano = texto => Math.round(Number(texto) * 1000);

function fuenteValida(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS_DE_FUENTE.includes(u.hostname) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

// Revisa el contenido de precios.json y devuelve las filas listas para hacer cuentas (congeladas). Si algo está mal,
// lanza un error que dice qué (nunca se adivina un precio).
export function validarPrecios(datos) {
  const mal = texto => { throw new Error(`precios.json: ${texto}`); };
  if (!datos || typeof datos !== 'object' || datos.version !== 1 || !Array.isArray(datos.modelos)) mal('formato desconocido');
  const vistos = new Set();
  const filas = datos.modelos.map((m, i) => {
    const donde = `modelo ${i + 1}`;
    if (!m || typeof m !== 'object') mal(`${donde}: no es un objeto`);
    if (!NOMBRE.test(String(m.proveedor)) || !NOMBRE.test(String(m.modelo))) mal(`${donde}: proveedor o modelo no válido`);
    const clave = `${m.proveedor}/${m.modelo}`;
    if (vistos.has(clave)) mal(`${clave} está dos veces`);
    vistos.add(clave);
    if (typeof m.nombre !== 'string' || !m.nombre.trim() || m.nombre.length > 60) mal(`${clave}: falta el nombre`);
    if (typeof m.confirmado !== 'boolean') mal(`${clave}: confirmado debe ser true o false`);
    if (!fuenteValida(m.fuente)) mal(`${clave}: la fuente debe ser una página https oficial`);
    if (m.fuenteGeo != null && !fuenteValida(m.fuenteGeo)) mal(`${clave}: fuenteGeo debe ser una página https oficial`);
    if (typeof m.revisadoEl !== 'string' || !FECHA.test(m.revisadoEl)) mal(`${clave}: revisadoEl debe ser AAAA-MM-DD`);
    const geos = m.multiplicadoresGeo;
    if (!geos || typeof geos !== 'object' || Array.isArray(geos) || !Object.hasOwn(geos, 'global')) mal(`${clave}: multiplicadoresGeo necesita «global»`);
    const geoMil = {};
    for (const [geo, valor] of Object.entries(geos)) {
      if (!GEO.test(geo) || typeof valor !== 'string' || !PRECIO.test(valor) || Number(valor) < 1) mal(`${clave}: multiplicador ${geo} no válido (texto, 1 o más, hasta 3 decimales)`);
      geoMil[geo] = aNano(valor);
    }
    if (!Array.isArray(m.tramos) || m.tramos.length === 0 || m.tramos.length > 5) mal(`${clave}: faltan los tramos`);
    let anterior = null;
    const tramos = m.tramos.map((t, j) => {
      const ultimo = j === m.tramos.length - 1;
      if (ultimo ? t.hastaEntrada !== null : !(Number.isSafeInteger(t.hastaEntrada) && t.hastaEntrada > 0)) mal(`${clave}: el último tramo termina en null y los demás en un número`);
      if (anterior && !(t.hastaEntrada === null || t.hastaEntrada > anterior.hastaEntrada)) mal(`${clave}: los tramos deben ir de menor a mayor`);
      const nano = {};
      for (const tipo of TIPOS_DE_TOKEN) {
        if (typeof t[tipo] !== 'string' || !PRECIO.test(t[tipo])) mal(`${clave}: el precio ${tipo} debe ser un texto con hasta 3 decimales`);
        nano[tipo] = aNano(t[tipo]);
        // Un tramo más largo nunca es más barato (así una reserva hecha con el tramo más largo nunca se queda corta).
        if (anterior && nano[tipo] < anterior.nano[tipo]) mal(`${clave}: un tramo más largo no puede ser más barato`);
      }
      const tramo = { hastaEntrada: t.hastaEntrada, nano, usd: Object.fromEntries(TIPOS_DE_TOKEN.map(tipo => [tipo, t[tipo]])) };
      anterior = tramo;
      return tramo;
    });
    const nanoMax = Math.max(...tramos.flatMap(t => TIPOS_DE_TOKEN.map(tipo => t.nano[tipo])));
    return congelar({
      proveedor: m.proveedor, modelo: m.modelo, nombre: m.nombre.trim(), confirmado: m.confirmado, fuente: m.fuente,
      revisadoEl: m.revisadoEl, geoMil, geoMilMax: Math.max(...Object.values(geoMil)), tramos, nanoMax,
    });
  });
  return Object.freeze(filas);
}

function congelar(objeto) {
  for (const valor of Object.values(objeto)) if (valor && typeof valor === 'object') congelar(valor);
  return Object.freeze(objeto);
}

// Lee el texto de precios.json. Nunca lanza: si algo está mal, la tabla queda vacía y error dice por qué.
export function cargarPrecios(texto) {
  try {
    return { filas: validarPrecios(JSON.parse(texto)), error: null };
  } catch (error) {
    return { filas: Object.freeze([]), error: String(error?.message ?? 'precios.json no se pudo leer').slice(0, 200) };
  }
}

let TABLA = { filas: Object.freeze([]), error: 'precios.json no se pudo leer' };
try { TABLA = cargarPrecios(readFileSync(ARCHIVO, 'utf8')); } catch { /* queda vacía: ningún uso pagado */ }

export function estadoPrecios() {
  return { valido: TABLA.error == null, modelos: TABLA.filas.length, error: TABLA.error };
}

// Cualquier fila (para las pantallas), confirmada o no. null si no existe.
export function filaDe(proveedor, modelo, filas = TABLA.filas) {
  return filas.find(f => f.proveedor === proveedor && f.modelo === modelo) ?? null;
}

// La fila para GASTAR: solo si su precio está confirmado. null si no hay (y entonces no se gasta).
export function precioDe(proveedor, modelo, filas = TABLA.filas) {
  const fila = filaDe(proveedor, modelo, filas);
  return fila?.confirmado === true ? fila : null;
}

// ---------- Cuentas (sirven con una fila de la tabla o con la copia guardada en ia_llamadas.precio) ----------

function entero(n) {
  const v = Number(n ?? 0);
  if (!Number.isSafeInteger(v) || v < 0) throw new Error('cantidad de tokens no válida');
  return v;
}

function filaUtil(fila) {
  if (!fila || !Array.isArray(fila.tramos) || !fila.tramos.length || !fila.geoMil || typeof fila.geoMil !== 'object') throw new Error('fila de precio no válida');
  return fila;
}

const divArriba = (a, b) => (a + b - 1n) / b;

// El tramo que corresponde a un pedido: el primero cuyo «hasta» alcanza toda la entrada (con la de caché).
export function tramoDe(fila, entradaTotal) {
  const total = entero(entradaTotal);
  const tramos = filaUtil(fila).tramos;
  return tramos.find(t => t.hastaEntrada == null || total <= t.hastaEntrada) ?? tramos[tramos.length - 1];
}

// El multiplicador (en milésimas: 1100 = ×1,1) del lugar donde corrió el modelo. Si no se sabe o no se conoce, el
// más alto de la fila: nunca se cuenta de menos.
export function geoMilDe(fila, geo) {
  const g = filaUtil(fila).geoMil;
  const maximo = Math.max(...Object.values(g).map(Number).filter(Number.isFinite), 1000);
  return typeof geo === 'string' && Object.hasOwn(g, geo) && Number.isSafeInteger(g[geo]) && g[geo] >= 1000 ? g[geo] : maximo;
}

function geoMilMaximo(fila) {
  return geoMilDe(fila, null);
}

const entradaDe = uso => entero(uso.entrada) + entero(uso.cacheLectura) + entero(uso.cacheEscritura);

// Lo que costó una llamada, en µUSD (entero, hacia arriba). uso = { entrada, salida, cacheLectura, cacheEscritura, geo }.
export function costoMicro(fila, uso) {
  const t = tramoDe(fila, entradaDe(uso));
  let nano = 0n;
  for (const tipo of TIPOS_DE_TOKEN) nano += BigInt(entero(uso[tipo])) * BigInt(entero(t.nano[tipo]));
  return Number(divArriba(nano * BigInt(geoMilDe(fila, uso.geo)), 1_000_000n));
}

// Lo que se aparta ANTES de llamar: lo peor que puede costar. Cada token de entrada al precio más caro de entrada
// (escribir en caché), toda la salida permitida, el lugar más caro, un 5 % más y 1 µUSD.
export function reservaMicro(fila, { entradaMax, salidaMax }) {
  const t = tramoDe(fila, entradaMax);
  const nanoEntrada = BigInt(Math.max(entero(t.nano.entrada), entero(t.nano.cacheEscritura)));
  const nano = BigInt(entero(entradaMax)) * nanoEntrada + BigInt(entero(salidaMax)) * BigInt(entero(t.nano.salida));
  return Number(divArriba(nano * MARGEN_POR_CIENTO * BigInt(geoMilMaximo(fila)), 100_000_000n)) + 1;
}

// Cuando el proveedor dice que gastó algo que OPORTIA no conoce (uso.raro): lo conocido, más cada cosa desconocida al
// precio más alto de la fila y del lugar más caro; nunca menos que lo apartado.
export function cotaMicro(fila, uso, reservadoMicro) {
  const conocido = costoMicro(fila, uso);
  const nanoMax = BigInt(entero(fila.nanoMax ?? Math.max(...fila.tramos.flatMap(t => TIPOS_DE_TOKEN.map(tipo => t.nano[tipo])))));
  const extra = Number(divArriba(BigInt(entero(uso.desconocidos)) * nanoMax * BigInt(geoMilMaximo(fila)), 1_000_000n));
  return Math.max(entero(reservadoMicro), conocido + extra);
}

// La copia del precio que se guarda con cada llamada (ia_llamadas.precio): solo lo que hace falta para las cuentas,
// así una fila vieja sigue bien aunque el precio cambie después, y el libro de gastos crece poco (nada se borra).
export function instantaneaPrecio(fila) {
  return {
    proveedor: fila.proveedor, modelo: fila.modelo, revisadoEl: fila.revisadoEl, geoMil: fila.geoMil, nanoMax: fila.nanoMax,
    tramos: fila.tramos.map(t => ({ hastaEntrada: t.hastaEntrada, nano: t.nano })),
  };
}

// Lo que ven las pantallas de un precio (el primer tramo), sin nada interno.
export function precioPublico(fila) {
  if (!fila) return null;
  const t = fila.tramos[0];
  return { nombre: fila.nombre, entradaUsd: t.usd.entrada, salidaUsd: t.usd.salida, revisadoEl: fila.revisadoEl, confirmado: fila.confirmado, fuente: fila.fuente };
}
