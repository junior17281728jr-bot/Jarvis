// Un proceso hijo para test/video-mp4.test.js (no es un archivo *.test.js): con --expose-gc, sube un mp4 de 48 MB por la
// API del administrador (generado por pedazos) y lo baja entero y por partes, midiendo la memoria de búferes que queda
// VIVA (después de gc) mientras pasa. Imprime una línea JSON. Nunca usa internet (carga ./ayuda.js primero).
import './ayuda.js';
import { Readable } from 'node:stream';
import { request } from 'node:http';
import { configDePrueba, conServidor } from './ayuda.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const TOTAL = 48 * 1024 * 1024;
const CLAVE = 'una clave bien larga';
const byteEn = i => (i * 7 + 3) % 251;
const CABEZA = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(12)]);
let pico = 0;
let base0 = 0;
const medir = () => { globalThis.gc(); const m = process.memoryUsage(); pico = Math.max(pico, m.arrayBuffers - base0); };
function flujoMp4(total, trozo = 256 * 1024) {
  let hecho = 0;
  return new Readable({
    read() {
      if (hecho >= total) return this.push(null);
      const n = Math.min(trozo, total - hecho);
      const b = Buffer.alloc(n);
      for (let i = 0; i < n; i++) b[i] = byteEn(hecho + i);
      if (hecho === 0) CABEZA.copy(b, 0);
      if (Math.floor(hecho / 4_194_304) !== Math.floor((hecho + n) / 4_194_304)) medir();
      hecho += n;
      this.push(b);
    },
  });
}
const p = paqueteMuestra();
p.materias[0].video = { mp4: { archivo: 'video-materia-01.mp4', duracion_s: 20 } };
const config = configDePrueba();
const db = abrirBase(config);
const salida = {};
await conServidor(crearServidor({ db, config }), async base => {
  const pedir = async (metodo, ruta, { galleta, datos, cabeceras = {}, cuerpo } = {}) => {
    const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras }, body: datos ? JSON.stringify(datos) : cuerpo, ...(cuerpo instanceof Readable ? { duplex: 'half' } : {}) });
    const tipo = r.headers.get('content-type') || '';
    return { codigo: r.status, datos: tipo.includes('json') ? await r.json() : null, galleta: r.headers.get('set-cookie')?.split(';')[0] };
  };
  const admin = (await pedir('POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
  crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
  const ana = (await pedir('POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
  const s = await pedir('POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(p) });
  const id = s.datos.paquete.id;
  await pedir('POST', `/api/admin/academia/paquetes/${id}/figuras/${p.figuras[0].archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  await pedir('POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} });
  globalThis.gc();
  base0 = process.memoryUsage().arrayBuffers;
  // Con http.request y pipe (respeta la contrapresión, como un navegador que sube un archivo del disco).
  const r = await new Promise((ok, mal) => {
    const u = new URL(`${base}/api/admin/academia/paquetes/${id}/video/video-materia-01.mp4`);
    const pedido = request(u, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'video/mp4', 'Content-Length': String(TOTAL) } }, res => { res.resume(); res.on('end', () => ok({ codigo: res.statusCode })); });
    pedido.on('error', mal);
    flujoMp4(TOTAL).pipe(pedido);
  });
  salida.subida = r.codigo; salida.picoSubidaMb = Math.round(pico / 104857.6) / 10;
  const v = (await pedir('GET', '/api/academia/video/factores_humanos', { galleta: ana })).datos;
  const res = await fetch(`${base}${v.mp4.url}`, { headers: { 'X-Oportia': '1', Cookie: ana } });
  let visto = 0;
  let mal = 0;
  for await (const trozo of res.body) {
    for (let i = 0; i < trozo.length; i += 4099) if (visto + i >= CABEZA.length && trozo[i] !== byteEn(visto + i)) mal += 1;
    if (Math.floor(visto / 4_194_304) !== Math.floor((visto + trozo.length) / 4_194_304)) medir();
    visto += trozo.length;
  }
  Object.assign(salida, { bajada: res.status, visto, mal });
});
db.close();
salida.picoMb = Math.round((pico / 1048576) * 10) / 10;
salida.maxRssMb = Math.round(process.resourceUsage().maxRSS / 1024);
console.log(JSON.stringify(salida));
