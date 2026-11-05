// Piezas básicas del servidor web: rutas, lectura de datos enviados, respuestas y archivos de las pantallas.
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, sep, extname, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { brotliCompress, brotliCompressSync, gzip, gzipSync, constants as ZLIB } from 'node:zlib';

export const CABECERAS_SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  // Solo se cargan archivos de OPORTIA; nada de código incrustado ni de otros sitios.
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
};

export class ErrorHttp extends Error {
  constructor(codigo, clave, detalle = null) {
    super(clave);
    this.codigo = codigo;
    this.clave = clave;
    this.detalle = detalle;
  }
}

// Qué compresión acepta el navegador (cabecera Accept-Encoding): 'br', 'gzip' o null (sin comprimir).
// Cualquier otra (zstd, deflate…) o una cabecera rara se responde sin comprimir.
export function elegirCodificacion(aceptadas) {
  const q = new Map();
  for (const parte of String(aceptadas ?? '').toLowerCase().split(',')) {
    const [nombre, ...parametros] = parte.trim().split(';').map(x => x.trim());
    if (!nombre) continue;
    const valor = parametros.find(x => x.startsWith('q='));
    const numero = valor ? Number(valor.slice(2)) : 1;
    q.set(nombre, Number.isFinite(numero) ? numero : 0);
  }
  const de = nombre => q.get(nombre) ?? q.get('*') ?? 0;
  const br = de('br');
  const gz = Math.max(de('gzip'), q.get('x-gzip') ?? 0);
  if (br > 0 && br >= gz) return 'br';
  return gz > 0 ? 'gzip' : null;
}

const MINIMO_PARA_COMPRIMIR = 1024;
// Ventana de brotli a la medida del texto (como mucho 16 MB, como poco 64 KB): con la de siempre (4 MB) cada
// compresión pide mucha más memoria de la que hace falta para archivos de 1 a 200 KB.
const opcionesBrotli = (largo, calidad) => ({ params: {
  [ZLIB.BROTLI_PARAM_QUALITY]: calidad,
  [ZLIB.BROTLI_PARAM_SIZE_HINT]: largo,
  [ZLIB.BROTLI_PARAM_LGWIN]: Math.min(24, Math.max(16, Math.ceil(Math.log2(largo + 1)))),
} });

// opciones.comprimir: la ruta está en la lista de respuestas que se pueden comprimir (src/app.js). Solo se
// comprimen respuestas GET correctas de 1 KB o más y sin galleta (Set-Cookie). Seguridad (ataque «BREACH»):
// ninguna de esas lleva secretos (la sesión va en una galleta HttpOnly, no hay códigos anti-falsificación en
// las respuestas y las contraseñas temporales solo salen en respuestas POST, que nunca se comprimen).
export function enviarJson(res, codigo, datos, extra = {}, { comprimir = false } = {}) {
  const texto = JSON.stringify(datos);
  const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CABECERAS_SEGURIDAD, ...extra };
  const req = res.req;
  const conGalleta = Object.keys(extra).some(k => k.toLowerCase() === 'set-cookie');
  if (comprimir && codigo === 200 && req?.method === 'GET' && !conGalleta && Buffer.byteLength(texto) >= MINIMO_PARA_COMPRIMIR) {
    cabeceras.Vary = 'Accept-Encoding';
    const codificacion = elegirCodificacion(req.headers?.['accept-encoding']);
    if (codificacion) {
      // Compresión rápida (alrededor de 1 ms para 30 KB): el servidor tiene un solo procesador.
      const cuerpo = codificacion === 'br' ? brotliCompressSync(texto, opcionesBrotli(Buffer.byteLength(texto), 5)) : gzipSync(texto, { level: 6 });
      res.writeHead(codigo, { ...cabeceras, 'Content-Encoding': codificacion, 'Content-Length': cuerpo.length });
      res.end(cuerpo);
      return;
    }
  }
  res.writeHead(codigo, cabeceras);
  res.end(texto);
}

export function leerJson(req, limite = 64 * 1024) {
  return new Promise((ok, mal) => {
    const tipo = String(req.headers['content-type'] || '').toLowerCase();
    if (!tipo.startsWith('application/json')) return mal(new ErrorHttp(415, 'formato_no_valido'));
    let tamano = 0;
    const partes = [];
    req.on('data', parte => {
      tamano += parte.length;
      if (tamano > limite) {
        mal(new ErrorHttp(413, 'demasiado_grande'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => {
      if (tamano > limite) return;
      try {
        const texto = Buffer.concat(partes).toString('utf8');
        const datos = texto ? JSON.parse(texto) : {};
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return mal(new ErrorHttp(400, 'datos_no_validos'));
        ok(datos);
      } catch {
        mal(new ErrorHttp(400, 'datos_no_validos'));
      }
    });
    req.on('error', () => mal(new ErrorHttp(400, 'datos_no_validos')));
  });
}

// Un dato de texto de un pedido: si no vino es '', si es texto se devuelve tal cual, y si es otra cosa
// (un objeto, una lista, un número) el pedido no es válido: 400, nunca un error del servidor.
export function textoDe(datos, campo) {
  const valor = datos && typeof datos === 'object' && Object.hasOwn(datos, campo) ? datos[campo] : undefined;
  if (valor === undefined || valor === null) return '';
  if (typeof valor !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
  return valor;
}

// Rutas con partes variables, por ejemplo '/api/admin/usuarios/:id/clave'.
export function crearRuteador() {
  const rutas = [];
  return {
    agregar(metodo, patron, manejador, opciones = {}) {
      const nombres = [];
      const expresion = new RegExp('^' + patron.replace(/:[a-z]+/gi, m => { nombres.push(m.slice(1)); return '([^/]+)'; }) + '$');
      rutas.push({ metodo, patron, expresion, nombres, manejador, opciones });
    },
    buscar(metodo, ruta) {
      let metodoNoPermitido = false;
      for (const r of rutas) {
        const m = ruta.match(r.expresion);
        if (!m) continue;
        if (r.metodo !== metodo) { metodoNoPermitido = true; continue; }
        const parametros = {};
        try {
          r.nombres.forEach((nombre, i) => { parametros[nombre] = decodeURIComponent(m[i + 1]); });
        } catch {
          return { direccionNoValida: true }; // por ejemplo %FF: se responde 400, sin error del servidor
        }
        return { ...r, parametros };
      }
      return metodoNoPermitido ? { metodoNoPermitido: true } : null;
    },
  };
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

// ---------- Archivos de las pantallas (public/) ----------
// Por Funnel y la red del teléfono cada viaje de ida y vuelta cuesta 150-400 ms y cada KB cuenta: lo lento era
// bajar todo otra vez en cada visita (unos 320 KB sin comprimir) y esperar los archivos uno tras otro. Por eso:
//  - Cada archivo se lee una sola vez y queda en memoria (en total menos de 1 MB) con su huella (sha256) y ya
//    comprimido en brotli y gzip. Si el archivo cambia en el disco, se vuelve a leer solo.
//  - ETag (la huella): el navegador pregunta «¿cambió?» y, si no cambió, recibe un 304 sin cuerpo.
//  - index.html pide cada archivo con su huella en la dirección (/app.js?v=…), igual que app.js a los módulos
//    que importa, y avisa de esos módulos desde el principio (modulepreload), así no se esperan uno tras otro.
//  - Una dirección con la huella vigente se guarda un año (immutable): nunca cambia, porque si el archivo cambia
//    cambia la huella y con ella la dirección. Todo lo demás (index.html, los idiomas, una huella vieja) va con
//    «no-cache»: se revisa cada vez, así que después de una actualización se ven los archivos nuevos al instante.
const COMPRIMIBLES = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest']);
const UN_ANO = 'max-age=31536000, immutable';
const enMemoria = new Map(); // ruta completa -> entrada (ver leerEntrada)

const huellaDe = contenido => createHash('sha256').update(contenido).digest('base64url').slice(0, 22);
// Cambia con cualquier escritura del archivo (ctime no se puede copiar ni volver atrás).
const firmaDe = st => `${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.ino}`;
const direccionDe = (carpeta, completa) => `/${relative(carpeta, completa).split(sep).join('/')}`;

function dentroDe(carpeta, completa) {
  return completa.startsWith(carpeta + sep);
}

// Los módulos que importa un archivo .js (con from, con import solo o con un import dinámico; la dirección empieza
// con ./ o ../ y termina en .js) llevan su huella en la dirección. Devuelve el texto nuevo y los módulos que importa.
function versionarImportaciones(texto, completa, carpeta, enCamino, usa) {
  const modulos = [];
  const nuevo = texto.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"?#\s]+\.js)\2/g, (todo, antes, comilla, especificador) => {
    const destino = normalize(join(dirname(completa), especificador));
    if (!dentroDe(carpeta, destino) || enCamino.has(destino)) return todo; // un ciclo de módulos se deja como está
    const entrada = leerEntrada(carpeta, destino, enCamino);
    if (!entrada) return todo;
    usa.push([destino, entrada.huella]);
    modulos.push(destino);
    return `${antes}${comilla}${especificador}?v=${entrada.huella}${comilla}`;
  });
  return { nuevo, modulos };
}

// index.html: cada src="/…" y href="/…" de un archivo de public/ lleva su huella, y después de cada
// <script type="module"> se avisan todos los módulos que va a importar (modulepreload).
function versionarPagina(texto, completa, carpeta, enCamino, usa) {
  const conHuellas = texto.replace(/\b(src|href)="(\/[^"?#]+)"/g, (todo, atributo, direccion) => {
    const destino = normalize(join(carpeta, direccion));
    if (!dentroDe(carpeta, destino) || enCamino.has(destino)) return todo;
    const entrada = leerEntrada(carpeta, destino, enCamino);
    if (!entrada) return todo;
    usa.push([destino, entrada.huella]);
    return `${atributo}="${direccion}?v=${entrada.huella}"`;
  });
  return conHuellas.replace(/<script type="module" src="(\/[^"?#]+)\?v=[^"]+"><\/script>/g, (etiqueta, direccion) => {
    const vistos = new Set();
    const pendientes = [...(enMemoria.get(normalize(join(carpeta, direccion)))?.modulos ?? [])];
    while (pendientes.length) {
      const modulo = pendientes.shift();
      if (vistos.has(modulo)) continue;
      vistos.add(modulo);
      pendientes.push(...(enMemoria.get(modulo)?.modulos ?? []));
    }
    const avisos = [...vistos].map(modulo => {
      const entrada = enMemoria.get(modulo);
      usa.push([modulo, entrada.huella]);
      return `\n  <link rel="modulepreload" href="${direccionDe(carpeta, modulo)}?v=${entrada.huella}">`;
    });
    return etiqueta + avisos.join('');
  });
}

// La entrada en memoria de un archivo de public/ (o null si no existe o no es de un tipo que se sirve).
// Vale mientras el archivo y todos los que nombra (con su huella) sigan iguales.
function leerEntrada(carpeta, completa, enCamino = new Set()) {
  let st;
  try { st = statSync(completa); } catch { return null; }
  const tipo = TIPOS[extname(completa)];
  if (!tipo || !st.isFile()) return null;
  const firma = firmaDe(st);
  const vieja = enMemoria.get(completa);
  if (vieja && vieja.firma === firma && vieja.usa.every(([ruta, huella]) => leerEntrada(carpeta, ruta, enCamino)?.huella === huella)) return vieja;
  let contenido;
  try { contenido = readFileSync(completa); } catch { return null; }
  const usa = [];
  let modulos = [];
  enCamino.add(completa);
  try {
    if (extname(completa) === '.js') {
      const r = versionarImportaciones(contenido.toString('utf8'), completa, carpeta, enCamino, usa);
      contenido = Buffer.from(r.nuevo, 'utf8');
      modulos = r.modulos;
    } else if (extname(completa) === '.html') {
      contenido = Buffer.from(versionarPagina(contenido.toString('utf8'), completa, carpeta, enCamino, usa), 'utf8');
    }
  } finally {
    enCamino.delete(completa);
  }
  const entrada = { firma, tipo, cuerpo: contenido, huella: huellaDe(contenido), usa, modulos, comprimible: COMPRIMIBLES.has(extname(completa)), comprimidos: {} };
  enMemoria.set(completa, entrada);
  // Se comprime enseguida, fuera del hilo principal (brotli al máximo: se hace una sola vez por archivo).
  if (entrada.comprimible) for (const codificacion of ['br', 'gzip']) comprimido(entrada, codificacion);
  return entrada;
}

// El cuerpo comprimido (Buffer), o una promesa mientras se comprime. null = comprimido no sale más chico.
function comprimido(entrada, codificacion) {
  if (entrada.comprimidos[codificacion] !== undefined) return entrada.comprimidos[codificacion];
  const promesa = new Promise(listo => {
    const fin = (error, cuerpo) => {
      const valor = !error && cuerpo.length < entrada.cuerpo.length ? cuerpo : null;
      entrada.comprimidos[codificacion] = valor;
      listo(valor);
    };
    if (codificacion === 'br') {
      brotliCompress(entrada.cuerpo, opcionesBrotli(entrada.cuerpo.length, 11), fin);
    } else {
      gzip(entrada.cuerpo, { level: 9 }, fin);
    }
  });
  entrada.comprimidos[codificacion] = promesa;
  return promesa;
}

// If-None-Match: «"a", W/"b"» o «*». Se comparan las huellas sin el W/ (comparación débil, como pide HTTP).
function yaLoTiene(cabecera, etag) {
  if (!cabecera) return false;
  if (String(cabecera).trim() === '*') return true;
  return String(cabecera).split(',').some(x => x.trim().replace(/^W\//, '') === etag);
}

function versionPedida(url) {
  try { return new URL(String(url ?? '/'), 'http://x').searchParams.get('v'); } catch { return null; }
}

// Sirve un archivo de la carpeta public/ sin dejar salir de ella (nada de '../'). Devuelve false si no existe.
// req: el pedido (para la compresión, el ETag y la huella de la dirección); sin él se responde sin comprimir.
export function servirArchivo(res, carpetaPublica, ruta, req = res.req) {
  const relativa = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '');
  if (relativa.includes('\0')) return false;
  const completa = normalize(join(carpetaPublica, relativa));
  if (!dentroDe(carpetaPublica, completa)) return false;
  const entrada = leerEntrada(carpetaPublica, completa);
  if (!entrada) return false;
  const pedido = req?.headers ?? {};
  const cache = versionPedida(req?.url) === entrada.huella ? UN_ANO : 'no-cache';
  const codificacion = entrada.comprimible ? elegirCodificacion(pedido['accept-encoding']) : null;
  const responder = cuerpoComprimido => {
    const usada = cuerpoComprimido ? codificacion : null;
    // Cada forma (sin comprimir, brotli, gzip) tiene su propio ETag.
    const etag = `"${entrada.huella}${usada === 'br' ? '-br' : usada === 'gzip' ? '-gz' : ''}"`;
    const cabeceras = { 'Content-Type': entrada.tipo, 'Cache-Control': cache, ETag: etag, ...(entrada.comprimible ? { Vary: 'Accept-Encoding' } : {}), ...CABECERAS_SEGURIDAD };
    if (yaLoTiene(pedido['if-none-match'], etag)) {
      res.writeHead(304, cabeceras);
      res.end();
      return;
    }
    const cuerpo = cuerpoComprimido ?? entrada.cuerpo;
    res.writeHead(200, { ...cabeceras, ...(usada ? { 'Content-Encoding': usada } : {}), 'Content-Length': cuerpo.length });
    res.end(cuerpo);
  };
  const listo = codificacion ? comprimido(entrada, codificacion) : null;
  if (listo instanceof Promise) listo.then(responder);
  else responder(listo);
  return true;
}
