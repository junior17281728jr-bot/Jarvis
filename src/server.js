// Servidor temporal: JARVIS fue retirado y aquí se construirá NEXUS.
// Al arrancar borra los datos que dejó JARVIS (ver limpieza.js) y muestra una página "en construcción".
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { limpiar } from './limpieza.js';

const dbPath = process.env.DB_PATH || '/var/lib/jarvis/jarvis.db';
for (const dir of new Set([dirname(dbPath), process.env.BACKUP_DIR ? dirname(process.env.BACKUP_DIR) : null].filter(Boolean))) {
  try { const r = limpiar(dir); console.log(r.omitido ? `Limpieza omitida en ${r.dir}` : `JARVIS retirado: borrados ${r.borrados.length} elementos de ${r.dir}`); } catch (e) { console.error('Limpieza:', e.message); }
}

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const page = readFileSync(join(PUB, 'index.html'));
const sw = readFileSync(join(PUB, 'sw.js'));
createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/setup') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ app: 'nexus', estado: 'en construcción' })); }
  if (url.pathname === '/sw.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }); return res.end(sw); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(page);
}).listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () => console.log('NEXUS (en construcción) escuchando'));
