// Piezas básicas del servidor web: rutas, lectura de datos enviados, respuestas y archivos de las pantallas.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, sep, extname } from 'node:path';

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

export function enviarJson(res, codigo, datos, extra = {}) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CABECERAS_SEGURIDAD, ...extra });
  res.end(JSON.stringify(datos));
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

// Rutas con partes variables, por ejemplo '/api/admin/usuarios/:id/clave'.
export function crearRuteador() {
  const rutas = [];
  return {
    agregar(metodo, patron, manejador, opciones = {}) {
      const nombres = [];
      const expresion = new RegExp('^' + patron.replace(/:[a-z]+/gi, m => { nombres.push(m.slice(1)); return '([^/]+)'; }) + '$');
      rutas.push({ metodo, expresion, nombres, manejador, opciones });
    },
    buscar(metodo, ruta) {
      let metodoNoPermitido = false;
      for (const r of rutas) {
        const m = ruta.match(r.expresion);
        if (!m) continue;
        if (r.metodo !== metodo) { metodoNoPermitido = true; continue; }
        const parametros = {};
        r.nombres.forEach((nombre, i) => { parametros[nombre] = decodeURIComponent(m[i + 1]); });
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

// Sirve un archivo de la carpeta public/ sin dejar salir de ella (nada de '../').
export function servirArchivo(res, carpetaPublica, ruta) {
  const relativa = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '');
  if (relativa.includes('\0')) return false;
  const completa = normalize(join(carpetaPublica, relativa));
  if (!completa.startsWith(carpetaPublica + sep)) return false;
  const tipo = TIPOS[extname(completa)];
  if (!tipo || !existsSync(completa) || !statSync(completa).isFile()) return false;
  res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache', ...CABECERAS_SEGURIDAD });
  res.end(readFileSync(completa));
  return true;
}
