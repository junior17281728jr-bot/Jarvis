// OPORTIA (fase 0): página temporal "en construcción".
// Importante: este programa NO borra nada al arrancar. La limpieza que dejó la página
// temporal anterior se quitó para que los datos de OPORTIA nunca se pierdan.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(RAIZ, 'public');

export const VERSION = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;

export function crearServidor() {
  const pagina = readFileSync(join(PUB, 'index.html'));
  const sw = readFileSync(join(PUB, 'sw.js'));
  return createServer((req, res) => {
    let ruta;
    try {
      ruta = new URL(req.url, 'http://x').pathname;
    } catch {
      // Una dirección mal formada no puede tumbar el servidor: se responde 400 y se sigue.
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Dirección no válida');
    }
    if (ruta === '/api/setup') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ app: 'oportia', estado: 'en construcción', version: VERSION }));
    }
    if (ruta === '/sw.js') {
      // Se sigue sirviendo para que los navegadores que tenían la app vieja de JARVIS la borren.
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(sw);
    }
    if (ruta.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ error: 'no existe' }));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(pagina);
  });
}
