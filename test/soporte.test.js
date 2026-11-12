// Pruebas de la 0.9.2: «Ayuda / Soporte» (mensajes al administrador con capturas, hilo, estados, aviso al responder).
// Cada persona solo ve los suyos; lo del administrador da 401/403. Usa solo el paquete de MUESTRA.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { TERMINOS_V1, carpetaFirmas } from '../src/cuentas/terminos.js';
import { deflateSync, crc32 } from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parteValida } from '../public/terminos-vista.js';
import { csvDe } from '../public/reporte-vista.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
// Una «firma» PNG de verdad (rayas negras sobre transparente), o con ruido para que pese mucho.
function png(ancho = 240, alto = 80, { ruido = false } = {}) {
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([largo, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 6;
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const fila = ruido ? randomBytes(ancho * 4) : Buffer.alloc(ancho * 4);
    if (!ruido && y % 9 === 0) for (let x = 10; x < ancho - 10; x++) fila[x * 4 + 3] = 255;
    filas.push(Buffer.from([0]), fila);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}
const FIRMA_PNG = png();
const FIRMA = `data:image/png;base64,${FIRMA_PNG.toString('base64')}`;
const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const entrar = async (base, nombre, clave = CLAVE) => (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave } }));
async function conAcademia(fn) {
  const reloj = { ahora: Date.parse('2026-11-12T15:00:00Z') };
  const config = configDePrueba();
  const db = abrirBase(config);
  // Muchas entradas seguidas desde el mismo lugar (las pruebas): sin el freno por lugar (el de cada cuenta sigue).
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { azar: azarFijo(), reloj: () => reloj.ahora } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const ids = {};
    for (const nombre of ['ana', 'beto']) ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const ana = (await entrar(base, 'ana')).galleta;
    const beto = (await entrar(base, 'beto')).galleta;
    await fn({ base, db, admin: admin.galleta, ana, beto, ids, reloj, config });
  });
  db.close();
}
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const subir = (base, galleta, id, cuerpo, tipo = 'image/png') => pedir(base, 'POST', `/api/soporte/${id}/imagenes`, { galleta, cabeceras: { 'Content-Type': tipo }, cuerpo });

test('ayuda: la persona escribe con capturas y contexto; el administrador responde y cambia el estado; la persona ve el aviso', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids, config }) => {
    assert.equal((await pedir(base, 'POST', '/api/soporte', { datos: { categoria: 'app', texto: 'hola' } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', '/api/soporte', { galleta: ana, datos: { categoria: 'raro', texto: 'Algo pasa' } })).datos.error, 'soporte_categoria');
    assert.equal((await pedir(base, 'POST', '/api/soporte', { galleta: ana, datos: { categoria: 'app', texto: ' ' } })).datos.error, 'soporte_texto');
    const c = await pedir(base, 'POST', '/api/soporte', { galleta: ana, datos: { categoria: 'pregunta', texto: 'La opción B parece correcta', contexto: { pantalla: 'practica/3', version: '0.9.2', navegador: 'iPhone', pregunta: 'muestra-h1' } } });
    assert.equal(c.codigo, 201);
    const id = c.datos.ticket.id;
    assert.equal(c.datos.ticket.contexto.pregunta, 'muestra-h1');
    assert.ok(c.datos.ticket.contexto.hora);
    // Capturas: solo imágenes de verdad, hasta 3, de 5 MB o menos.
    assert.equal((await subir(base, ana, id, Buffer.from('esto no es una imagen pero dice serlo'))).datos.error, 'soporte_imagen_tipo');
    assert.equal((await subir(base, ana, id, Buffer.alloc(5 * 1024 * 1024 + 10, 1))).codigo, 413);
    assert.equal((await subir(base, ana, id, FIRMA_PNG)).codigo, 201);
    assert.equal((await subir(base, ana, id, JPG, 'image/jpeg')).codigo, 201);
    assert.equal((await subir(base, ana, id, FIRMA_PNG)).codigo, 201);
    assert.equal((await subir(base, ana, id, FIRMA_PNG)).datos.error, 'soporte_imagenes');
    assert.equal((await subir(base, beto, id, FIRMA_PNG)).codigo, 404, 'Beto no sube a lo de Ana');
    const img = await fetch(`${base}/api/soporte/${id}/imagenes/0/1`, { headers: { Cookie: ana } });
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(JPG));
    assert.equal(readdirSync(join(config.raiz, 'datos', 'soporte', String(id))).length, 3);
    // Beto no ve nada de Ana.
    assert.equal((await pedir(base, 'GET', `/api/soporte/${id}`, { galleta: beto })).codigo, 404);
    assert.equal((await pedir(base, 'GET', `/api/soporte/${id}/imagenes/0/0`, { galleta: beto })).codigo, 404);
    assert.equal((await pedir(base, 'POST', `/api/soporte/${id}/mensajes`, { galleta: beto, datos: { texto: 'hola' } })).codigo, 404);
    assert.deepEqual((await pedir(base, 'GET', '/api/soporte', { galleta: beto })).datos.tickets, []);
    assert.equal((await pedir(base, 'GET', '/api/soporte', { galleta: ana })).datos.tickets.length, 1);
    // Lo del administrador: 401/403.
    for (const ruta of ['/api/admin/soporte', `/api/admin/soporte/${id}`, `/api/admin/soporte/${id}/imagenes/0/0`]) {
      assert.equal((await pedir(base, 'GET', ruta)).codigo, 401, ruta);
      assert.equal((await pedir(base, 'GET', ruta, { galleta: ana })).codigo, 403, ruta);
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/soporte/${id}`, { galleta: ana, datos: { texto: 'x' } })).codigo, 403);
    // El administrador: la lista con cuántos esperan, el hilo, responder y cambiar el estado.
    const lista = (await pedir(base, 'GET', '/api/admin/soporte', { galleta: admin })).datos;
    assert.equal(lista.pendientes, 1);
    assert.equal((await pedir(base, 'GET', '/api/admin/sistema', { galleta: admin })).datos.soporte.pendientes, 1);
    const visto = (await pedir(base, 'GET', `/api/admin/soporte/${id}`, { galleta: admin })).datos.ticket;
    assert.equal(visto.estado, 'revision');
    assert.deepEqual(visto.mensajes[0].imagenes, [0, 1, 2]);
    assert.equal((await pedir(base, 'POST', `/api/admin/soporte/${id}`, { galleta: admin, datos: { estado: 'raro' } })).codigo, 400);
    const r = (await pedir(base, 'POST', `/api/admin/soporte/${id}`, { galleta: admin, datos: { texto: 'Gracias, lo reviso.', estado: 'resuelto' } })).datos.ticket;
    assert.deepEqual([r.estado, r.mensajes.length, r.mensajes[1].de], ['resuelto', 2, 'admin']);
    assert.equal((await pedir(base, 'GET', '/api/admin/soporte', { galleta: admin })).datos.pendientes, 0);
    // Ana ve el aviso y la respuesta; si responde, vuelve a «en revisión».
    const yo = (await pedir(base, 'GET', '/api/yo', { galleta: ana })).datos;
    assert.ok(yo.avisos.some(a => a.tipo === 'soporte_respondido'));
    assert.equal((await pedir(base, 'GET', '/api/soporte', { galleta: ana })).datos.tickets[0].sinLeerAlumno, true);
    assert.equal((await pedir(base, 'GET', `/api/soporte/${id}`, { galleta: ana })).datos.ticket.mensajes[1].texto, 'Gracias, lo reviso.');
    assert.equal((await pedir(base, 'GET', '/api/soporte', { galleta: ana })).datos.tickets[0].sinLeerAlumno, false);
    assert.equal((await pedir(base, 'POST', `/api/soporte/${id}/mensajes`, { galleta: ana, datos: { texto: 'Gracias' } })).datos.ticket.estado, 'revision');
    // Un tope: 10 por día.
    for (let k = 0; k < 9; k++) assert.equal((await pedir(base, 'POST', '/api/soporte', { galleta: beto, datos: { categoria: 'otro', texto: `mensaje ${k}` } })).codigo, 201);
    assert.equal((await pedir(base, 'POST', '/api/soporte', { galleta: beto, datos: { categoria: 'otro', texto: 'uno más' } })).codigo, 201);
    assert.equal((await pedir(base, 'POST', '/api/soporte', { galleta: beto, datos: { categoria: 'otro', texto: 'once' } })).datos.error, 'soporte_muchos');
  });
});
