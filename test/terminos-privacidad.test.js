// Pruebas de la 0.9.2: «Términos de uso y aviso» (nombre legal, firma por versión, publicar otra versión), el perfil
// privado (no aparece para los otros alumnos; el administrador ve todo) y el Reporte del administrador. Usa solo el
// paquete de MUESTRA.
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
async function hacerTema(base, galleta, bien) {
  const i = (await pedir(base, 'POST', '/api/academia/intentos', { galleta, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
  let n = 0;
  for (const q of i.preguntas) await pedir(base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: n++ < bien ? DE(q.id).original.correcta : mala(q.id) } });
  await pedir(base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} });
}

test('términos: sin aceptar, /api/yo lo dice; se firma con Nombre y Apellido de verdad; otra versión pide aceptar otra vez', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids }) => {
    const publico = await pedir(base, 'GET', '/api/terminos');
    assert.equal(publico.codigo, 200, 'se leen sin entrar (el enlace del pie)');
    assert.equal(publico.datos.terminos.version, 1);
    assert.equal(publico.datos.terminos.secciones.length, TERMINOS_V1.length);
    assert.doesNotMatch(JSON.stringify(publico.datos), /ENALAS|IDAC|Jeppesen|Anthropic|OpenAI|Banco/i, 'no nombra ninguna organización');
    const yo = (await pedir(base, 'GET', '/api/yo', { galleta: ana })).datos;
    assert.deepEqual([yo.terminos.version, yo.terminos.pendiente, yo.terminos.nombreLegal], [1, true, null]);
    assert.equal((await pedir(base, 'GET', '/api/yo/terminos')).codigo, 401);
    const aceptar = (galleta, datos) => pedir(base, 'POST', '/api/yo/terminos', { galleta, datos });
    assert.equal((await aceptar(ana, { version: 1, nombre: 'Ana', apellido: 'Pérez', acepto: false, firma: FIRMA })).datos.error, 'terminos_sin_aceptar');
    for (const [nombre, apellido] of [['A', 'Pérez'], ['Ana', ''], ['Ana1', 'Pérez'], ['Ana', '<b>'], ['x'.repeat(61), 'Pérez']]) {
      assert.equal((await aceptar(ana, { version: 1, nombre, apellido, acepto: true, firma: FIRMA })).datos.error, 'nombre_legal_no_valido', `${nombre} ${apellido}`);
    }
    assert.equal((await aceptar(ana, { version: 2, nombre: 'Ana', apellido: 'Pérez', acepto: true, firma: FIRMA })).datos.error, 'terminos_cambiaron');
    const ok = await aceptar(ana, { version: 1, nombre: '  Ana  María ', apellido: 'Pérez-Gómez', acepto: true, firma: FIRMA });
    assert.equal(ok.codigo, 200);
    assert.equal(ok.datos.estado.pendiente, false);
    assert.equal(ok.datos.estado.ultima.firmado, 'Ana María Pérez-Gómez');
    assert.equal(ok.datos.estado.ultima.version, 1);
    assert.ok(ok.datos.estado.ultima.en);
    assert.match(db.prepare("SELECT detalle FROM auditoria WHERE accion = 'terminos_aceptados'").get().detalle, /^v1: Ana María Pérez-Gómez \(firma [0-9a-f]{12}\)$/);
    // Ya confirmado: la persona no lo cambia (solo el administrador).
    // El administrador lo ve en la ficha y en las listas.
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos.alumno;
    assert.equal(f.nombreLegal.completo, 'Ana María Pérez-Gómez');
    assert.equal(f.terminos.ultima.version, 1);
    assert.equal((await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin })).datos.usuarios.find(u => u.id === ids.ana).nombreLegal, 'Ana María Pérez-Gómez');
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/alumnos', { galleta: admin })).datos.alumnos.find(u => u.id === ids.ana).nombreLegal, 'Ana María Pérez-Gómez');
    // Beto no ve el nombre legal de Ana en nada suyo.
    assert.doesNotMatch(JSON.stringify((await pedir(base, 'GET', '/api/academia/progreso', { galleta: beto })).datos), /Pérez-Gómez/);
    // Publicar otra versión: solo el administrador; todos aceptan otra vez, firmando con el mismo nombre.
    const nueva = [{ titulo: '1. Uno', texto: 'Texto uno.' }, { titulo: '2. Dos', texto: 'Texto dos.' }];
    assert.equal((await pedir(base, 'POST', '/api/admin/terminos', { galleta: ana, datos: { secciones: nueva } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/admin/terminos', { datos: { secciones: nueva } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', '/api/admin/terminos', { galleta: admin, datos: { secciones: [{ titulo: '', texto: 'x' }] } })).datos.error, 'terminos_no_validos');
    assert.equal((await pedir(base, 'POST', '/api/admin/terminos', { galleta: admin, datos: { secciones: nueva } })).datos.terminos.version, 2);
    const yo2 = (await pedir(base, 'GET', '/api/yo', { galleta: ana })).datos.terminos;
    assert.deepEqual([yo2.version, yo2.pendiente, yo2.ultima.version], [2, true, 1]);
    assert.equal((await aceptar(ana, { version: 2, nombre: 'Otra', apellido: 'Persona', acepto: true, firma: FIRMA })).datos.error, 'nombre_legal_fijo');
    assert.equal((await aceptar(ana, { version: 2, nombre: 'Ana María', apellido: 'Pérez-Gómez', acepto: true, firma: FIRMA })).datos.estado.pendiente, false);
    const adm = (await pedir(base, 'GET', '/api/admin/terminos', { galleta: admin })).datos;
    assert.deepEqual([adm.terminos.version, adm.versiones.length, adm.aceptaron], [2, 2, 1]);
    assert.equal((await pedir(base, 'GET', '/api/admin/terminos', { galleta: beto })).codigo, 403);
    // La versión 1 sigue guardada tal cual.
    assert.equal((await pedir(base, 'GET', '/api/terminos')).datos.terminos.secciones[0].titulo, '1. Uno');
    // El administrador corrige el nombre legal (y puede ponerlo al crear la cuenta: la persona lo confirma).
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/nombre-legal`, { galleta: beto, datos: { nombre: 'X y', apellido: 'Zz' } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/nombre-legal`, { galleta: admin, datos: { nombre: 'Ana', apellido: 'Pérez' } })).datos.nombreLegal.completo, 'Ana Pérez');
    await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'carla', clave: 'sol1', nombreLegal: { nombre: 'Carla', apellido: 'Ruiz' } } });
    const carla = (await entrar(base, 'carla', 'sol1')).datos;
    assert.deepEqual([carla.terminos.pendiente, carla.terminos.nombreLegal.completo, carla.terminos.nombreLegal.confirmado], [true, 'Carla Ruiz', false]);
  });
});

test('perfil privado: no aparece para los otros alumnos (Grupo); el administrador ve todo; nada de otro llega a un alumno', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids }) => {
    await hacerTema(base, ana, 4);
    await hacerTema(base, beto, 2);
    for (const g of [ana, beto]) await pedir(base, 'POST', '/api/academia/plan', { galleta: g, datos: { plan: 'un_mes' } });
    const grupoDeBeto = async () => (await pedir(base, 'GET', '/api/academia/progreso', { galleta: beto })).datos.grupo.companeros.map(x => x.nombre);
    assert.ok((await grupoDeBeto()).includes('ana'));
    assert.equal((await pedir(base, 'GET', '/api/yo/perfil', { galleta: ana })).datos.perfil.privado, false);
    assert.equal((await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { privado: 'si' } })).codigo, 400);
    assert.equal((await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { privado: true } })).datos.perfil.privado, true);
    assert.ok(!(await grupoDeBeto()).includes('ana'), 'privada: Beto no la ve');
    const propio = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: ana })).datos.grupo;
    assert.equal(propio.oculto, true, 'es el mismo interruptor que «ocultarme»');
    // El administrador ve todo de ella.
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    assert.equal(f.resumen.respuestas, 5);
    // Ninguna ruta del alumno devuelve notas, errores ni respuestas de otro.
    const deBeto = [];
    for (const ruta of ['/api/academia/camino', '/api/academia/progreso', '/api/yo', '/api/yo/perfil', '/api/yo/terminos', '/api/academia/temas/factores_humanos/muestra-hipoxia']) {
      const r = await pedir(base, 'GET', ruta, { galleta: beto });
      assert.equal(r.codigo, 200, ruta);
      deBeto.push(r.datos);
    }
    const texto = JSON.stringify(deBeto);
    assert.doesNotMatch(texto, /"ana"|Ana/, 'nada de Ana');
    // Sin privado, del compañero solo llegan los campos del Grupo (nunca notas ni errores).
    await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { privado: false } });
    const comp = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: beto })).datos.grupo.companeros.find(x => x.nombre === 'ana');
    assert.deepEqual(Object.keys(comp).sort(), ['avatar', 'lugar', 'materia', 'medallas', 'nombre', 'pct', 'racha', 'tu']);
  });
});

test('los nombres de verdad: de 2 a 60, letras, espacios, tildes y guiones', () => {
  for (const bueno of ['Ana', 'José Luis', 'Pérez-Gómez', 'O\'Neil', 'Ñuñez']) assert.ok(parteValida(bueno), bueno);
  for (const malo of ['A', '', '1234', 'Ana2', 'x'.repeat(61), '-Ana', '<b>']) assert.equal(parteValida(malo), null, malo);
});

test('reporte: solo el administrador; ranking por puntaje, por alumno, grupo y comparar; filtros; se recuerda la elección; los privados salen', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids }) => {
    await hacerTema(base, ana, 5);
    await hacerTema(base, beto, 2);
    await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { privado: true } });
    const ruta = '/api/admin/academia/reporte?secciones=ranking,alumnos,grupo,comparar';
    for (const r of [ruta, '/api/admin/academia/reporte/opciones']) {
      assert.equal((await pedir(base, 'GET', r)).codigo, 401, r);
      assert.equal((await pedir(base, 'GET', r, { galleta: ana })).codigo, 403, r);
    }
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/reporte/opciones', { galleta: beto, datos: { secciones: ['ranking'] } })).codigo, 403);
    const d = (await pedir(base, 'GET', ruta, { galleta: admin })).datos;
    assert.deepEqual(d.ranking.map(x => x.id), [ids.ana, ids.beto], 'Ana (privada) sale y va primero');
    assert.ok(d.ranking[0].puntaje > d.ranking[1].puntaje);
    const a = d.alumnos.find(x => x.id === ids.ana);
    assert.equal(a.preparacion, 50);
    assert.equal(a.pctAcierto, 100);
    assert.equal(a.puntaje, Math.round(0.6 * 50 + 0.25 * 100 + 0.15 * 100));
    assert.ok(d.alumnos.find(x => x.id === ids.beto).reforzar.temas.length >= 1);
    assert.equal(d.grupo.alumnos, 2);
    assert.equal(d.grupo.dificiles[0].tema, 'muestra-hipoxia');
    assert.deepEqual(d.comparar, [ids.ana, ids.beto]);
    // Solo lo que se pide.
    const solo = (await pedir(base, 'GET', '/api/admin/academia/reporte?secciones=grupo', { galleta: admin })).datos;
    assert.deepEqual([solo.ranking, solo.alumnos, solo.comparar], [null, null, null]);
    assert.ok(solo.grupo);
    // Fechas: un período sin respuestas no cuenta respuestas (la preparación es la de hoy).
    const viejo = (await pedir(base, 'GET', '/api/admin/academia/reporte?secciones=alumnos&desde=2020-01-01&hasta=2020-01-31', { galleta: admin })).datos;
    assert.equal(viejo.alumnos.find(x => x.id === ids.ana).respuestas, 0);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/reporte?secciones=nada', { galleta: admin })).datos.error, 'reporte_no_valido');
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/reporte?secciones=grupo&desde=2026-02-01&hasta=2026-01-01', { galleta: admin })).codigo, 400);
    // Bloqueados: fuera salvo que se pidan.
    await pedir(base, 'POST', `/api/admin/usuarios/${ids.beto}/activo`, { galleta: admin, datos: { activo: false } });
    assert.deepEqual((await pedir(base, 'GET', '/api/admin/academia/reporte?secciones=ranking', { galleta: admin })).datos.ranking.map(x => x.id), [ids.ana]);
    assert.deepEqual((await pedir(base, 'GET', '/api/admin/academia/reporte?secciones=ranking&bloqueados=1', { galleta: admin })).datos.ranking.map(x => x.id), [ids.ana, ids.beto]);
    // Comparar a quienes elija.
    assert.deepEqual((await pedir(base, 'GET', `/api/admin/academia/reporte?secciones=comparar&bloqueados=1&comparar=${ids.beto}`, { galleta: admin })).datos.comparar, [ids.beto]);
    // La última elección, por administrador.
    const opciones = { secciones: ['ranking', 'comparar'], bloqueados: true, comparar: [ids.ana], desde: '2026-11-01', hasta: null };
    assert.deepEqual((await pedir(base, 'POST', '/api/admin/academia/reporte/opciones', { galleta: admin, datos: opciones })).datos.opciones, opciones);
    assert.deepEqual((await pedir(base, 'GET', '/api/admin/academia/reporte/opciones', { galleta: admin })).datos.opciones, opciones);
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/reporte/opciones', { galleta: admin, datos: { secciones: ['x'] } })).codigo, 400);
    assert.ok(db.prepare("SELECT 1 FROM ajustes WHERE clave = 'academia.reporte.1'").get());
    // El CSV lleva las mismas partes.
    const t = (clave, v = {}) => `${clave}${Object.keys(v).length ? JSON.stringify(v) : ''}`;
    const csv = csvDe(d, t, id => id);
    assert.ok(csv.startsWith('\ufeff'));
    assert.match(csv, /reporte\.seccion\.ranking/);
    assert.match(csv, /reporte\.seccion\.comparar/);
    assert.match(csv, /\r\n1;ana;ana;\d+\r\n/);
    assert.doesNotMatch(csvDe(solo, t, id => id), /reporte\.seccion\.ranking/);
  });
});

test('firma dibujada: obligatoria (un PNG de 50 KB o menos); queda con fecha, versión, huellas, IP y navegador; los contratos nunca se borran', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids, config }) => {
    const aceptar = (galleta, datos, cabeceras = {}) => pedir(base, 'POST', '/api/yo/terminos', { galleta, datos: { version: 1, nombre: 'Ana', apellido: 'Pérez', acepto: true, ...datos }, cabeceras });
    assert.equal((await aceptar(ana, { firma: undefined })).datos.error, 'firma_falta');
    assert.equal((await aceptar(ana, { firma: 'data:image/png;base64,AAAA' })).datos.error, 'firma_falta');
    assert.equal((await aceptar(ana, { firma: `data:image/jpeg;base64,${FIRMA_PNG.toString('base64')}` })).datos.error, 'firma_falta');
    assert.equal((await aceptar(ana, { firma: `data:image/png;base64,${png(20, 10).toString('base64')}` })).datos.error, 'firma_falta', 'demasiado chica');
    const grande = png(200, 80, { ruido: true });
    assert.ok(grande.length > 50 * 1024);
    assert.equal((await aceptar(ana, { firma: `data:image/png;base64,${grande.toString('base64')}` })).datos.error, 'firma_muy_grande');
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).datos.terminos.pendiente, true, 'sin firma no se acepta');
    const ok = await aceptar(ana, { firma: FIRMA }, { 'User-Agent': 'Prueba/1.0 (iPhone)' });
    assert.equal(ok.codigo, 200, JSON.stringify(ok.datos));
    // El PNG en la carpeta privada, con su huella.
    const archivos = readdirSync(carpetaFirmas(config));
    assert.equal(archivos.length, 1);
    const huella = createHash('sha256').update(FIRMA_PNG).digest('hex');
    assert.ok(readFileSync(join(carpetaFirmas(config), archivos[0])).equals(FIRMA_PNG));
    // Los contratos: solo el administrador.
    for (const ruta of ['/api/admin/contratos', `/api/admin/contratos/${ids.ana}/1`, `/api/admin/contratos/${ids.ana}/1/firma`]) {
      assert.equal((await pedir(base, 'GET', ruta)).codigo, 401, ruta);
      assert.equal((await pedir(base, 'GET', ruta, { galleta: ana })).codigo, 403, ruta);
      assert.equal((await pedir(base, 'GET', ruta, { galleta: beto })).codigo, 403, ruta);
    }
    const lista = (await pedir(base, 'GET', '/api/admin/contratos', { galleta: admin })).datos.contratos;
    assert.deepEqual(lista.map(c => [c.usuarioId, c.version, c.firmado]), [[ids.ana, 1, 'Ana Pérez']]);
    const c = (await pedir(base, 'GET', `/api/admin/contratos/${ids.ana}/1`, { galleta: admin })).datos.contrato;
    assert.equal(c.usuario, 'ana');
    assert.equal(c.firmaSha256, huella);
    assert.equal(c.firmaVerificada, true);
    assert.equal(c.textoVerificado, true);
    assert.match(c.textoSha256, /^[0-9a-f]{64}$/);
    assert.equal(c.navegador, 'Prueba/1.0 (iPhone)');
    assert.ok(c.ip);
    assert.equal(c.terminos.secciones.length, TERMINOS_V1.length);
    assert.match(c.declaracion, /esta firma es mía/);
    const imagen = await fetch(`${base}/api/admin/contratos/${ids.ana}/1/firma`, { headers: { Cookie: admin, 'X-Oportia': '1' } });
    assert.equal(imagen.headers.get('content-type'), 'image/png');
    assert.ok(Buffer.from(await imagen.arrayBuffer()).equals(FIRMA_PNG));
    assert.equal((await pedir(base, 'GET', `/api/admin/contratos/${ids.beto}/1`, { galleta: admin })).codigo, 404);
    // Nunca se borran: otra versión, bloquear la cuenta, y aunque falte el archivo (queda la copia en la base).
    await pedir(base, 'POST', '/api/admin/terminos', { galleta: admin, datos: { secciones: [{ titulo: '1. Nuevo', texto: 'Otro texto.' }] } });
    const otra = png(260, 90);
    assert.equal((await pedir(base, 'POST', '/api/yo/terminos', { galleta: ana, datos: { version: 2, nombre: 'Ana', apellido: 'Pérez', acepto: true, firma: `data:image/png;base64,${otra.toString('base64')}` } })).codigo, 200);
    await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/activo`, { galleta: admin, datos: { activo: false } });
    const despues = (await pedir(base, 'GET', '/api/admin/contratos', { galleta: admin })).datos.contratos;
    assert.deepEqual(despues.map(x => x.version).sort(), [1, 2]);
    assert.ok(despues.every(x => x.bloqueado === true));
    const v1 = (await pedir(base, 'GET', `/api/admin/contratos/${ids.ana}/1`, { galleta: admin })).datos.contrato;
    assert.equal(v1.terminos.secciones.length, TERMINOS_V1.length, 'el texto de la v1 tal como se firmó');
    assert.equal(v1.textoVerificado, true);
    for (const f of readdirSync(carpetaFirmas(config))) unlinkSync(join(carpetaFirmas(config), f));
    const sinArchivo = await fetch(`${base}/api/admin/contratos/${ids.ana}/1/firma`, { headers: { Cookie: admin, 'X-Oportia': '1' } });
    assert.ok(Buffer.from(await sinArchivo.arrayBuffer()).equals(FIRMA_PNG), 'la copia de la base');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'terminos_aceptados'").get().n, 2);
  });
});
