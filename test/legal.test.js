// Pruebas de la 0.9.2 (informe legal): aviso de privacidad aparte, tres casillas sin marcar (la de IA se puede negar),
// fecha de nacimiento y firma del padre, madre o tutor para menores, «Mis documentos», «Mis datos» (pedido con plazo de
// 10 días hábiles), la nota de verificación de identidad y los pagos de menores. Usa solo el paquete de MUESTRA.
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
const firmar = (base, galleta, datos = {}) => pedir(base, 'POST', '/api/yo/terminos', { galleta, datos: { version: 1, nombre: 'Ana', apellido: 'Pérez', acepto: true, firma: FIRMA, ...FIRMAR, ...datos } });
const TUTOR = { nombre: 'Rosa Pérez', relacion: 'Madre', contacto: 'rosa@example.com', acepto: true, firma: FIRMA };

test('privacidad y las tres casillas: términos y privacidad obligatorias, IA opcional (sin ella la app sigue); se puede retirar', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids }) => {
    const textos = (await pedir(base, 'GET', '/api/terminos')).datos;
    assert.equal(textos.terminos.version, 1);
    assert.equal(textos.privacidad.version, 1);
    assert.ok(textos.privacidad.secciones.length >= 8);
    assert.match(textos.reembolso, /7 días/);
    assert.doesNotMatch(JSON.stringify(textos), /ENALAS|IDAC|Jeppesen|Anthropic|OpenAI|Banco Popular|\[correo|\[nombre/i);
    assert.equal((await firmar(base, ana, { aceptoPrivacidad: false })).datos.error, 'privacidad_sin_aceptar');
    assert.equal((await firmar(base, ana, { aceptoIa: 'si' })).datos.error, 'datos_no_validos');
    assert.equal((await firmar(base, ana, { nacimiento: '2030-01-01' })).datos.error, 'nacimiento_no_valido');
    assert.equal((await firmar(base, ana, { nacimiento: '2000-02-30' })).datos.error, 'nacimiento_no_valido');
    assert.equal((await firmar(base, ana, { versionPrivacidad: 2 })).datos.error, 'terminos_cambiaron');
    const r = await firmar(base, ana, { aceptoIa: false });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.deepEqual([r.datos.estado.pendiente, r.datos.estado.aceptoIa, r.datos.estado.menor, r.datos.estado.nacimiento], [false, false, false, '2000-05-10']);
    const { consienteIa, pagosPermitidos } = await import('../src/cuentas/terminos.js');
    assert.equal(consienteIa(db, ids.ana), false);
    assert.equal(pagosPermitidos(db, ids.ana), true, 'mayor de edad: puede pagar');
    assert.equal((await pedir(base, 'POST', '/api/yo/consentimiento-ia', { galleta: ana, datos: { permitido: true } })).datos.aceptoIa, true);
    assert.equal(consienteIa(db, ids.ana), true);
    assert.equal((await pedir(base, 'POST', '/api/yo/consentimiento-ia', { datos: { permitido: true } })).codigo, 401);
    // Otra versión del aviso de privacidad: todos firman otra vez.
    assert.equal((await pedir(base, 'POST', '/api/admin/terminos', { galleta: admin, datos: { doc: 'privacidad', secciones: [{ titulo: '1. Nuevo', texto: 'Texto.' }] } })).datos.privacidad.version, 2);
    assert.equal((await pedir(base, 'POST', '/api/admin/terminos', { galleta: admin, datos: { doc: 'otro', secciones: [{ titulo: '1', texto: 'x' }] } })).codigo, 400);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).datos.terminos.pendiente, true);
    assert.equal((await firmar(base, ana, { versionPrivacidad: 2 })).datos.estado.pendiente, false);
    assert.equal((await pedir(base, 'GET', '/api/admin/contratos', { galleta: admin })).datos.contratos.length, 2);
    // Beto no firmó: sigue pendiente.
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: beto })).datos.terminos.pendiente, true);
  });
});

test('menores de 18: firma también el padre, madre o tutor; la cuenta queda marcada y sus pagos esperan la autorización', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids, reloj }) => {
    const nacimiento = '2012-03-01'; // 14 años el 12 de noviembre de 2026
    assert.equal((await firmar(base, ana, { nacimiento })).datos.error, 'tutor_falta');
    assert.equal((await firmar(base, ana, { nacimiento, tutor: { ...TUTOR, acepto: false } })).datos.error, 'tutor_falta');
    assert.equal((await firmar(base, ana, { nacimiento, tutor: { ...TUTOR, contacto: 'x' } })).datos.error, 'tutor_falta');
    assert.equal((await firmar(base, ana, { nacimiento, tutor: { ...TUTOR, firma: undefined } })).datos.error, 'firma_falta');
    const r = await firmar(base, ana, { nacimiento, tutor: TUTOR });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.estado.menor, true);
    const { pagosPermitidos } = await import('../src/cuentas/terminos.js');
    assert.equal(pagosPermitidos(db, ids.ana), false, 'menor: pagos bloqueados');
    const c = (await pedir(base, 'GET', `/api/admin/contratos/${ids.ana}/1`, { galleta: admin })).datos.contrato;
    assert.deepEqual([c.menor, c.tutor.nombre, c.tutor.relacion, c.tutor.firmaVerificada], [true, 'Rosa Pérez', 'Madre', true]);
    const img = await fetch(`${base}/api/admin/contratos/${ids.ana}/1/firma-tutor`, { headers: { Cookie: admin } });
    assert.equal(img.status, 200);
    assert.equal((await pedir(base, 'GET', `/api/admin/contratos/${ids.ana}/1/firma-tutor`, { galleta: beto })).codigo, 403);
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos.alumno;
    assert.deepEqual([f.terminos.menor, f.tutorPagos], [true, false]);
    // El administrador marca «el tutor autorizó pagos» y anota cómo verificó la identidad.
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/tutor-pagos`, { galleta: beto, datos: { autorizado: true } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/tutor-pagos`, { datos: { autorizado: true } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/tutor-pagos`, { galleta: admin, datos: { autorizado: true } })).datos.autorizado, true);
    assert.equal(pagosPermitidos(db, ids.ana), true);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/verificacion`, { galleta: beto, datos: { nota: 'x' } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/verificacion`, { galleta: admin, datos: { nota: 'La conozco en persona; vi la cédula de su madre.' } })).codigo, 200);
    assert.match((await pedir(base, 'GET', `/api/admin/contratos/${ids.ana}/1`, { galleta: admin })).datos.contrato.verificacion.nota, /cédula de su madre/);
  });
});

test('«Mis documentos»: cada persona ve y baja SOLO su copia (sin la nota interna); «Mis datos» crea un pedido con plazo', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids, reloj }) => {
    await firmar(base, ana);
    await firmar(base, beto, { nombre: 'Beto', apellido: 'Gómez' });
    await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/verificacion`, { galleta: admin, datos: { nota: 'nota interna' } });
    const lista = (await pedir(base, 'GET', '/api/yo/documentos', { galleta: ana })).datos.documentos;
    assert.deepEqual(lista.map(d => [d.n, d.firmado]), [[1, 'Ana Pérez']]);
    const doc = (await pedir(base, 'GET', '/api/yo/documentos/1', { galleta: ana })).datos.contrato;
    assert.equal(doc.firmado, 'Ana Pérez');
    assert.equal(doc.verificacion, undefined, 'la nota del administrador no va en su copia');
    assert.ok(doc.terminos.secciones.length && doc.privacidad.secciones.length);
    const img = await fetch(`${base}/api/yo/documentos/1/firma`, { headers: { Cookie: ana } });
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(FIRMA_PNG));
    assert.equal((await pedir(base, 'GET', '/api/yo/documentos/2', { galleta: ana })).codigo, 404);
    assert.equal((await pedir(base, 'GET', '/api/yo/documentos/1', { galleta: beto })).datos.contrato.firmado, 'Beto Gómez', 'el n.º 1 de Beto es el suyo');
    assert.equal((await pedir(base, 'GET', '/api/yo/documentos')).codigo, 401);
    // «Mis datos»: un pedido de borrado → mensaje de ayuda «Datos personales» con su plazo (10 días hábiles).
    assert.equal((await pedir(base, 'POST', '/api/yo/datos', { galleta: ana, datos: { pedido: 'raro' } })).codigo, 400);
    const p = (await pedir(base, 'POST', '/api/yo/datos', { galleta: ana, datos: { pedido: 'supresion', texto: 'Quiero que se borren mis datos.' } })).datos.ticket;
    assert.deepEqual([p.categoria, p.pedido, p.vence], ['datos', 'supresion', '2026-11-26']);
    const adm = (await pedir(base, 'GET', '/api/admin/soporte', { galleta: admin })).datos.tickets.find(x => x.id === p.id);
    assert.equal(adm.vence, '2026-11-26');
    assert.deepEqual((await pedir(base, 'GET', '/api/soporte', { galleta: beto })).datos.tickets, []);
  });
});

test('días hábiles: se saltan sábados y domingos', async () => {
  const { diasHabiles } = await import('../src/cuentas/soporte.js');
  assert.equal(diasHabiles(Date.parse('2026-11-12T15:00:00Z'), 10), '2026-11-26');
  assert.equal(diasHabiles(Date.parse('2026-11-14T15:00:00Z'), 1), '2026-11-16', 'del sábado al lunes');
});

test('arreglos: un administrador nunca sin contraseña; la fecha de nacimiento firmada no se cambia sola; IA solo con firma', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids }) => {
    // Un administrador sin contraseña: no (lo tomaría cualquiera); y crear-clave nunca toma un administrador.
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' }, datos: { nombre: 'admin2', rol: 'admin', sinClave: true } })).datos.error, 'admin_sin_clave');
    db.prepare("UPDATE usuarios SET clave_hash = 'pendiente$abc' WHERE id = 1").run();
    assert.equal((await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'junior', nueva: 'sol1' } })).datos.error, 'ya_tiene_clave');
    // IA: sin firma no se puede dar el permiso.
    assert.equal((await pedir(base, 'POST', '/api/yo/consentimiento-ia', { galleta: ana, datos: { permitido: true } })).datos.error, 'terminos_pendientes');
    // Una menor firma con su tutor; volver a «firmar» con otra fecha no la hace mayor.
    const { pagosPermitidos, esMenor } = await import('../src/cuentas/terminos.js');
    assert.equal((await firmar(base, ana, { nacimiento: '2012-03-01', tutor: TUTOR })).codigo, 200);
    assert.equal((await firmar(base, ana, { nacimiento: '1990-01-01' })).datos.error, 'nacimiento_fijo');
    assert.equal((await firmar(base, ana, { nacimiento: '2012-03-01', tutor: TUTOR })).codigo, 200, 'otra vez lo mismo: nada cambia');
    assert.deepEqual([esMenor(db, ids.ana), pagosPermitidos(db, ids.ana)], [true, false]);
    assert.equal((await pedir(base, 'GET', '/api/admin/contratos', { galleta: admin })).datos.contratos.length, 1);
    // El administrador la corrige.
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/nombre-legal`, { galleta: beto, datos: { nacimiento: '1990-01-01' } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/nombre-legal`, { galleta: admin, datos: { nacimiento: '1990-01-01' } })).datos.nacimiento.menor, false);
    assert.equal(esMenor(db, ids.ana), false);
  });
});
