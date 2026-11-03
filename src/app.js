// OPORTIA (fase 0): página "en construcción", base de datos propia y entrada protegida.
// Este programa NUNCA borra archivos de datos.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entradaPermitida } from './nucleo/red.js';
import { estadoBase } from './nucleo/db.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(RAIZ, 'public');

export const VERSION = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;

function json(res, codigo, datos) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(datos));
}

// opciones.db: la base abierta (null si no se pudo abrir).
export function crearServidor({ db = null } = {}) {
  const pagina = readFileSync(join(PUB, 'index.html'));
  const sw = readFileSync(join(PUB, 'sw.js'));
  return createServer((req, res) => {
    if (!entradaPermitida(req.socket.localAddress)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Entra por https://jarvis.taila693e9.ts.net');
    }
    const ruta = new URL(req.url, 'http://x').pathname;
    if (ruta === '/api/setup') {
      // Si la base no abrió, responde 503: el actualizador del servidor lo ve y vuelve a la versión anterior.
      if (!db) return json(res, 503, { app: 'oportia', estado: 'error', version: VERSION, base: 'no disponible' });
      return json(res, 200, { app: 'oportia', estado: 'en construcción', version: VERSION, base: estadoBase(db) });
    }
    if (ruta === '/sw.js') {
      // Se sigue sirviendo para que los navegadores que tenían la app vieja de JARVIS la borren.
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(sw);
    }
    if (ruta.startsWith('/api/')) return json(res, 404, { error: 'no existe' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    res.end(pagina);
  });
}


