// Ayuda común para las pruebas. Las pruebas corren en el servidor real (como administrador y con OPORTIA
// funcionando), así que: nunca usan internet, nunca tocan /var/lib/jarvis y nunca usan el puerto 8080.
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.OPORTIA_TEST = '1';

const fetchReal = globalThis.fetch;
globalThis.fetch = (url, ...resto) => {
  const destino = new URL(typeof url === 'string' ? url : url.url);
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
export function peticionSimulada(servidor, { url = '/', direccionLocal }) {
  return new Promise(resolver => {
    const req = { url, method: 'GET', headers: {}, socket: { localAddress: direccionLocal } };
    const res = {
      codigo: 0, cuerpo: '', cabeceras: {},
      writeHead(codigo, cabeceras) { this.codigo = codigo; this.cabeceras = cabeceras || {}; return this; },
      end(cuerpo = '') { this.cuerpo = String(cuerpo); resolver(this); },
    };
    servidor.emit('request', req, res);
  });
}
