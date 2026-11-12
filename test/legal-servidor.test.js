// Pruebas de la 0.11.0: los términos se exigen en el servidor (lo de estudiar espera la firma), el permiso de IA se
// respeta (sin él, nada va a la IA, ni en el trabajador), los menores sin autorización no piden pagos y la imagen de un
// comprobante se borra a los 30 días (el registro queda). Usa solo el paquete de MUESTRA.
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
// Lo demás que se firma (0.9.2, informe legal): privacidad, fecha de nacimiento (mayor de edad) y el permiso de IA.
const FIRMAR = { versionPrivacidad: 1, nacimiento: '2000-05-10', aceptoPrivacidad: true, aceptoIa: true };
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
  // Estas pruebas son de los términos: obligatorios, como en el servidor de verdad.
  const config = { ...configDePrueba(), terminosObligatorios: true };
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
const firmar = (base, galleta, datos = {}) => pedir(base, 'POST', '/api/yo/terminos', { galleta, datos: { version: 1, nombre: 'Ana', apellido: 'Pérez', acepto: true, firma: FIRMA, ...FIRMAR, ...datos } });
const TUTOR = { nombre: 'Rosa Pérez', relacion: 'Madre', contacto: 'rosa@example.com', acepto: true, firma: FIRMA };

test('términos en el servidor: lo de estudiar espera la firma; entrar, /api/yo, los textos y lo del administrador no', async () => {
  await conAcademia(async ({ base, admin, ana, beto }) => {
    for (const ruta of ['/api/academia/camino', '/api/academia/progreso', '/api/academia/instructor', '/api/soporte', '/api/academia/tiempo-ia']) {
      const r = await pedir(base, 'GET', ruta, { galleta: ana });
      assert.deepEqual([r.codigo, r.datos.error], [403, 'terminos_pendientes'], ruta);
    }
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos.error, 'terminos_pendientes');
    for (const ruta of ['/api/yo', '/api/yo/terminos', '/api/yo/perfil', '/api/terminos', '/api/yo/documentos']) assert.equal((await pedir(base, 'GET', ruta, { galleta: ana })).codigo, 200, ruta);
    // El administrador (sin firmar todavía) llega a lo suyo para arreglar los textos; lo de estudiar también le espera.
    for (const ruta of ['/api/admin/academia/alumnos', '/api/admin/terminos', '/api/admin/usuarios']) assert.equal((await pedir(base, 'GET', ruta, { galleta: admin })).codigo, 200, ruta);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: admin })).datos.error, 'terminos_pendientes');
    // Firma: ya estudia. Otra versión: espera otra vez.
    assert.equal((await firmar(base, ana)).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).codigo, 200);
    await pedir(base, 'POST', '/api/admin/terminos', { galleta: admin, datos: { secciones: [{ titulo: '1. Nuevo', texto: 'Otro texto.' }] } });
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.error, 'terminos_pendientes');
    assert.equal((await firmar(base, ana, { version: 2 })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: beto })).datos.error, 'terminos_pendientes', 'cada uno firma lo suyo');
    assert.equal((await pedir(base, 'POST', '/api/salir', { galleta: beto, datos: {} })).codigo, 200, 'salir no espera la firma');
  });
});

test('permiso de IA: sin él, el instructor es el básico («Activaste la academia sin IA»); se cambia en Mis datos con su fecha', async () => {
  await conAcademia(async ({ base, db, ana, beto, ids }) => {
    await firmar(base, ana, { aceptoIa: false });
    await firmar(base, beto, { nombre: 'Beto', apellido: 'Gómez', aceptoIa: true });
    const i = (await pedir(base, 'GET', '/api/academia/instructor', { galleta: ana })).datos.instructor;
    assert.deepEqual([i.modo, i.motivo], ['basico', 'sin_consentimiento']);
    assert.notEqual((await pedir(base, 'GET', '/api/academia/instructor', { galleta: beto })).datos.instructor.motivo, 'sin_consentimiento');
    assert.equal((await pedir(base, 'POST', '/api/yo/consentimiento-ia', { galleta: ana, datos: { permitido: true } })).datos.aceptoIa, true);
    assert.notEqual((await pedir(base, 'GET', '/api/academia/instructor', { galleta: ana })).datos.instructor.motivo, 'sin_consentimiento');
    await pedir(base, 'POST', '/api/yo/consentimiento-ia', { galleta: ana, datos: { permitido: false } });
    const historia = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`cuenta.consentimiento_ia_historia.${ids.ana}`).valor);
    assert.deepEqual(historia.map(x => x.permitido), [true, false]);
    assert.ok(historia.every(x => x.en));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'academia.instructor'").get().n, 0, 'nada se pidió a la IA');
  });
});

test('el trabajador tampoco llama a la IA si la persona retiró el permiso', async () => {
  const { MANEJADOR_INSTRUCTOR } = await import('../src/academia/instructor-tarea.js');
  const config = configDePrueba();
  const db = abrirBase(config);
  db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('cuenta.consentimiento_ia.7', '0', '2026-01-01')").run();
  let llamadas = 0;
  const ctx = { db, tarea: { espacioId: 1, datos: { uso: 'instructor_duda', sistema: 's', texto: 't', clave: 'k', usuarioId: 7, pedidaEn: Date.now() } }, ia: { pedir: async () => { llamadas += 1; return { usada: true }; } } };
  const r = await MANEJADOR_INSTRUCTOR.paso(ctx);
  assert.deepEqual([r.listo, r.resultado.usada, r.resultado.motivo, llamadas], [true, false, 'sin_consentimiento', 0]);
  db.close();
});

test('pagos: un menor sin la autorización de su tutor no puede pedir tiempo con IA (403 pagos_menor)', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids }) => {
    await firmar(base, ana, { nacimiento: '2012-03-01', tutor: TUTOR });
    await firmar(base, beto, { nombre: 'Beto', apellido: 'Gómez' });
    const pedirPago = galleta => pedir(base, 'POST', '/api/academia/pagos?paquete=x', { galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: FIRMA_PNG });
    const r = await pedirPago(ana);
    assert.deepEqual([r.codigo, r.datos.error], [403, 'pagos_menor']);
    assert.notEqual((await pedirPago(beto)).datos.error, 'pagos_menor', 'un mayor de edad sí llega al pago');
    await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/tutor-pagos`, { galleta: admin, datos: { autorizado: true } });
    assert.notEqual((await pedirPago(ana)).datos.error, 'pagos_menor');
  });
});

test('la imagen de un comprobante se borra 30 días después de revisarlo; el registro del pago queda', async () => {
  const { borrarRecibosVencidos } = await import('../src/academia/recibos.js');
  const { carpetaPagos } = await import('../src/academia/tiempo-ia.js');
  const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const config = configDePrueba();
  const db = abrirBase(config);
  db.prepare("INSERT INTO usuarios (nombre, clave_hash, creado_en) VALUES ('ana', 'x', '2026-01-01')").run();
  mkdirSync(carpetaPagos(config), { recursive: true });
  const ahora = Date.parse('2026-11-12T15:00:00Z');
  const filas = [['aprobado', 31], ['rechazado', 40], ['aprobado', 10], ['revision', null]].map(([estado, dias], k) => {
    const archivo = `1-${1000 + k}-${'a'.repeat(11)}${k}.png`;
    writeFileSync(join(carpetaPagos(config), archivo), FIRMA_PNG);
    const revisado = dias == null ? null : new Date(ahora - dias * 24 * 3600 * 1000).toISOString();
    const id = Number(db.prepare(`INSERT INTO academia_pagos (usuario_id, paquete, minutos, precio, archivo, tipo, bytes, estado, revisado_en, creado_en)
      VALUES (1, 'p30', 30, 'RD$100', ?, 'image/png', 10, ?, ?, '2026-09-01T00:00:00Z')`).run(archivo, estado, revisado).lastInsertRowid);
    return { id, archivo };
  });
  assert.equal(await borrarRecibosVencidos(db, config, { ahoraMs: ahora }), 2);
  const fila = id => db.prepare('SELECT * FROM academia_pagos WHERE id = ?').get(id);
  for (const k of [0, 1]) {
    assert.equal(existsSync(join(carpetaPagos(config), filas[k].archivo)), false, 'la imagen se borró');
    assert.equal(fila(filas[k].id).archivo, `borrado-${filas[k].archivo}`);
    assert.deepEqual([fila(filas[k].id).minutos, fila(filas[k].id).precio], [30, 'RD$100'], 'el registro queda');
  }
  for (const k of [2, 3]) assert.ok(existsSync(join(carpetaPagos(config), filas[k].archivo)), 'todavía no');
  assert.equal(await borrarRecibosVencidos(db, config, { ahoraMs: ahora }), 0, 'una sola vez');
  db.close();
});

test('el aviso de privacidad dice lo que la app hace: nada se borra solo salvo las imágenes de comprobantes', async () => {
  const { PRIVACIDAD_V1 } = await import('../src/cuentas/textos-legales.js');
  const plazos = PRIVACIDAD_V1.find(x => x.titulo.startsWith('6.')).texto;
  assert.match(plazos, /Nunca se borran solos/);
  assert.match(plazos, /se conserva la constancia de aceptación/);
  assert.doesNotMatch(plazos, /12 meses de inactividad/);
});
