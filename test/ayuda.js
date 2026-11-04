// Ayuda común para las pruebas. Las pruebas corren en el servidor real (como administrador y con OPORTIA
// funcionando), así que: nunca usan internet, nunca tocan /var/lib/jarvis y nunca usan el puerto 8080.
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

process.env.OPORTIA_TEST = '1';

const fetchReal = globalThis.fetch;
globalThis.fetch = (url, ...resto) => {
  const destino = new URL(url instanceof Request ? url.url : String(url));
  if (destino.hostname !== '127.0.0.1') return Promise.reject(new Error(`Internet prohibido en las pruebas: ${destino.href}`));
  return fetchReal(url, ...resto);
};

export function carpetaTemporal(nombre = 'oportia') {
  return mkdtempSync(join(tmpdir(), `${nombre}-`));
}

export function configDePrueba() {
  const raiz = carpetaTemporal();
  return { archivoBase: join(raiz, 'datos', 'oportia.db'), carpetaCopias: join(raiz, 'datos', 'oportia-copias'), raiz };
}

export async function conServidor(servidor, fn) {
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await fn(base); } finally { await new Promise(ok => servidor.close(ok)); }
}

// Simula una petición que entra por otra "puerta" del servidor (por ejemplo, la IP pública).
// Por defecto viene de la misma dirección y con la IP escrita tal cual en la barra del navegador.
export function peticionSimulada(servidor, { url = '/', direccionLocal, direccionRemota = direccionLocal, host }) {
  const ip = String(direccionLocal).replace(/^::ffff:/, '');
  const nombre = host ?? (ip.includes(':') ? `[${ip}]:8080` : `${ip}:8080`);
  return new Promise(resolver => {
    const req = { url, method: 'GET', headers: { host: nombre }, socket: { localAddress: direccionLocal, remoteAddress: direccionRemota } };
    const res = {
      codigo: 0, cuerpo: '', cabeceras: {},
      writeHead(codigo, cabeceras) { this.codigo = codigo; this.cabeceras = cabeceras || {}; return this; },
      end(cuerpo = '') { this.cuerpo = String(cuerpo); resolver(this); },
    };
    servidor.emit('request', req, res);
  });
}

// ---------- Fase 1, parte c: pruebas con procesos de verdad ----------

// Espera hasta que la condición dé algo verdadero (y lo devuelve). Nunca compara contra un tiempo justo: espera
// hasta 20 s por defecto, mirando cada 50 ms, así las pruebas no fallan en una CPU lenta.
export async function esperarHasta(condicion, { ms = 20000, cada = 50, que = 'la condición' } = {}) {
  const limite = Date.now() + ms;
  let ultimoError = null;
  for (;;) {
    try {
      const valor = await condicion();
      if (valor) return valor;
    } catch (error) {
      ultimoError = error;
    }
    if (Date.now() > limite) throw new Error(`No pasó a tiempo (${ms} ms): ${que}${ultimoError ? ` (último error: ${ultimoError.message})` : ''}`);
    await new Promise(listo => setTimeout(listo, cada));
  }
}

// Huella (sha256) de cada archivo de una carpeta, para comprobar que nada cambió ni desapareció.
export function huellas(carpeta) {
  const lista = {};
  (function recorrer(dir) {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else lista[relative(carpeta, ruta)] = createHash('sha256').update(readFileSync(ruta)).digest('hex');
    }
  })(carpeta);
  return lista;
}

// ¿Ese proceso ya terminó? (no existe, o quedó como «zombi» esperando que alguien lo recoja).
export function procesoTerminado(pid) {
  const numero = Number(pid);
  if (!Number.isSafeInteger(numero) || numero <= 0) return true;
  try {
    process.kill(numero, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return true;
  }
  try {
    const estado = readFileSync(`/proc/${numero}/stat`, 'utf8');
    return estado.slice(estado.lastIndexOf(')') + 2, estado.lastIndexOf(')') + 3) === 'Z';
  } catch {
    return true;
  }
}

// Al final de cada prueba con procesos: corta los que sigan vivos (solo los que la prueba encendió).
export function matarSiVive(pid) {
  const numero = Number(pid);
  if (!Number.isSafeInteger(numero) || numero <= 1 || numero === process.pid) return;
  if (procesoTerminado(numero)) return;
  try { process.kill(numero, 'SIGKILL'); } catch { /* ya salió */ }
}
