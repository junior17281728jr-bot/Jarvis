// Pruebas de la 0.14.26: «Reportar un problema» (un mensaje de ayuda 'error' de src/cuentas/soporte.js con su captura
// en la base, el aviso para el dueño y Administrador → Reportes). Sin internet; las imágenes se arman aquí.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { textoDeAviso } from '../src/canales/textos.js';
import { claveDeAvisoValida } from '../src/avisos/avisos.js';
import { vaPorTelegram } from '../src/canales/avisador.js';
import { CAPTURA_MAXIMA, ESTADOS_REPORTE } from '../src/cuentas/soporte.js';
import { medidasCaptura, contextoReporte, textoParaProgramador, CAPTURA_LADO, ESTADOS_REPORTE as ESTADOS_PANTALLA } from '../public/soporte-vista.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]), Buffer.alloc(3000, 7), Buffer.from([0xff, 0xd9])]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]);

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
async function conServidorDePrueba(fn) {
  const reloj = { ahora: Date.parse('2026-11-12T15:00:00Z') };
  const config = configDePrueba();
  const db = abrirBase(config);
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { reloj: () => reloj.ahora } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    const ids = {};
    for (const nombre of ['ana', 'beto']) ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    const beto = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'beto', clave: CLAVE } })).galleta;
    await fn({ base, db, config, reloj, admin: admin.galleta, ana, beto, ids });
  });
  db.close();
}
const subirCaptura = (base, galleta, id, cuerpo, tipo = 'image/jpeg') => pedir(base, 'POST', `/api/soporte/${id}/captura`, { galleta, cabeceras: { 'Content-Type': tipo }, cuerpo });

test('reportar: el texto, el contexto (solo lo permitido) y una captura JPG de 500 KB o menos, guardada en la base', async () => {
  await conServidorDePrueba(async ({ base, db, config, reloj, ana, beto }) => {
    assert.equal((await pedir(base, 'POST', '/api/soporte/reporte', { datos: { texto: 'falla' } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', '/api/soporte/reporte', { galleta: ana, datos: { texto: ' ' } })).datos.error, 'soporte_texto');
    const contexto = { pantalla: '#examen/meteorologia?token=abc123', version: '0.14.26', navegador: 'Mozilla/5.0 (iPhone)', tamano: '390x844', idioma: 'es', clave: 'MiClaveSecreta1', contrasena: 'otra', pregunta: null };
    const c = await pedir(base, 'POST', '/api/soporte/reporte', { galleta: ana, datos: { texto: 'Toqué Entregar y se quedó cargando', contexto } });
    assert.equal(c.codigo, 201);
    const t = c.datos.ticket;
    assert.equal(t.categoria, 'error');
    assert.deepEqual(t.reporte, { estado: 'nuevo', captura: false });
    assert.equal(t.contexto.pantalla, '#examen/meteorologia');
    assert.deepEqual([t.contexto.version, t.contexto.navegador, t.contexto.tamano, t.contexto.idioma], ['0.14.26', 'Mozilla/5.0 (iPhone)', '390x844', 'es']);
    assert.equal(t.contexto.hora, new Date(reloj.ahora).toISOString());
    // Nada de lo que no está permitido llega a la base.
    const guardado = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`soporte.ticket.${t.id}`).valor;
    for (const secreto of ['MiClaveSecreta1', 'otra', 'abc123', 'contrasena']) assert.ok(!guardado.includes(secreto), secreto);
    // La captura: JPG de verdad (por sus bytes), 500 KB o menos, una sola, solo la persona dueña.
    assert.equal((await subirCaptura(base, ana, t.id, PNG, 'image/jpeg')).datos.error, 'soporte_imagen_tipo');
    assert.equal((await subirCaptura(base, ana, t.id, Buffer.from('no soy una imagen pero digo que sí'))).datos.error, 'soporte_imagen_tipo');
    assert.equal((await subirCaptura(base, ana, t.id, Buffer.concat([JPG, Buffer.alloc(CAPTURA_MAXIMA)]))).codigo, 413);
    assert.equal((await subirCaptura(base, beto, t.id, JPG)).codigo, 404, 'Beto no sube al reporte de Ana');
    assert.equal((await subirCaptura(base, ana, t.id, JPG)).codigo, 201);
    assert.equal((await subirCaptura(base, ana, t.id, JPG)).datos.error, 'soporte_imagenes');
    const img = await fetch(`${base}/api/soporte/${t.id}/captura`, { headers: { Cookie: ana } });
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(JPG));
    assert.equal((await pedir(base, 'GET', `/api/soporte/${t.id}/captura`, { galleta: beto })).codigo, 404);
    // En la base (entra en las copias), nunca en la carpeta de datos.
    const fila = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`soporte.captura.${t.id}`).valor);
    assert.deepEqual([fila.tipo, fila.bytes, Buffer.from(fila.base64, 'base64').equals(JPG)], ['image/jpeg', JPG.length, true]);
    assert.equal(existsSync(join(config.raiz, 'datos', 'soporte', String(t.id))), false);
    // Un mensaje de ayuda normal no acepta captura de reporte; a los 30 minutos ya no se sube.
    const normal = (await pedir(base, 'POST', '/api/soporte', { galleta: ana, datos: { categoria: 'app', texto: 'hola hola' } })).datos.ticket;
    assert.equal((await subirCaptura(base, ana, normal.id, JPG)).codigo, 404);
    const otro = (await pedir(base, 'POST', '/api/soporte/reporte', { galleta: ana, datos: { texto: 'Otro problema' } })).datos.ticket;
    reloj.ahora += 31 * 60_000;
    assert.equal((await subirCaptura(base, ana, otro.id, JPG)).datos.error, 'soporte_imagenes');
    // La persona lo ve entre sus mensajes (con su estado de reporte).
    const mios = (await pedir(base, 'GET', '/api/soporte', { galleta: ana })).datos.tickets;
    assert.ok(mios.some(x => x.id === t.id && x.categoria === 'error' && x.reporte.captura === true));
  });
});

test('reportes: aviso para el dueño (Telegram), la lista del administrador, el estado, las notas privadas y 401/403', async () => {
  await conServidorDePrueba(async ({ base, db, admin, ana, beto }) => {
    const t = (await pedir(base, 'POST', '/api/soporte/reporte', { galleta: ana, datos: { texto: 'La pantalla del examen se ve en blanco', contexto: { pantalla: '#examen/x', version: '0.14.26' } } })).datos.ticket;
    // El aviso: abierto y sin mandar todavía (el que manda avisos lo lleva al Telegram).
    const aviso = db.prepare('SELECT * FROM avisos WHERE clave = ?').get(`reporte_error:${t.id}`);
    assert.ok(aviso && aviso.resuelto_en == null && aviso.enviado_en == null);
    assert.equal(claveDeAvisoValida(`reporte_error:${t.id}`), true);
    assert.deepEqual(vaPorTelegram(aviso), { va: true, suena: false }, 'el aviso va por Telegram');
    const tg = textoDeAviso({ ...aviso, ultimaVez: aviso.ultima_vez }, 'es');
    assert.match(tg, /🐞 Reporte de un problema/);
    assert.match(tg, /Reporte #\d+ de ana \(pantalla #examen\/x\): «La pantalla del examen se ve en blanco»/);
    // Lo del administrador: 401 sin sesión, 403 para los alumnos.
    for (const ruta of ['/api/admin/reportes', `/api/admin/reportes/${t.id}`, `/api/admin/reportes/${t.id}/captura`]) {
      assert.equal((await pedir(base, 'GET', ruta)).codigo, 401, ruta);
      assert.equal((await pedir(base, 'GET', ruta, { galleta: ana })).codigo, 403, ruta);
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/reportes/${t.id}`, { galleta: beto, datos: { estado: 'arreglado' } })).codigo, 403);
    let lista = (await pedir(base, 'GET', '/api/admin/reportes', { galleta: admin })).datos;
    assert.deepEqual([lista.nuevos, lista.reportes.length, lista.reportes[0].id, lista.reportes[0].usuario], [1, 1, t.id, 'ana']);
    // Un mensaje de ayuda normal no es un reporte.
    const normal = (await pedir(base, 'POST', '/api/soporte', { galleta: ana, datos: { categoria: 'app', texto: 'hola hola' } })).datos.ticket;
    assert.equal((await pedir(base, 'GET', `/api/admin/reportes/${normal.id}`, { galleta: admin })).codigo, 404);
    assert.equal((await pedir(base, 'GET', '/api/admin/reportes', { galleta: admin })).datos.reportes.length, 1);
    // Estado y notas.
    assert.equal((await pedir(base, 'POST', `/api/admin/reportes/${t.id}`, { galleta: admin, datos: { estado: 'raro' } })).codigo, 400);
    let r = (await pedir(base, 'POST', `/api/admin/reportes/${t.id}`, { galleta: admin, datos: { estado: 'visto', notas: 'Pasa solo en Safari: revisar el botón' } })).datos.reporte;
    assert.deepEqual([r.reporte.estado, r.estado, r.reporte.notas], ['visto', 'revision', 'Pasa solo en Safari: revisar el botón']);
    assert.ok(db.prepare('SELECT resuelto_en FROM avisos WHERE clave = ?').get(`reporte_error:${t.id}`).resuelto_en, 'al verlo, el aviso se cierra');
    // Las notas nunca le llegan a la persona.
    const suyo = await pedir(base, 'GET', `/api/soporte/${t.id}`, { galleta: ana });
    assert.equal(suyo.datos.ticket.reporte.estado, 'visto');
    assert.ok(!JSON.stringify(suyo.datos).includes('Safari'));
    assert.ok(!JSON.stringify((await pedir(base, 'GET', '/api/soporte', { galleta: ana })).datos).includes('Safari'));
    r = (await pedir(base, 'POST', `/api/admin/reportes/${t.id}`, { galleta: admin, datos: { estado: 'arreglado' } })).datos.reporte;
    assert.deepEqual([r.reporte.estado, r.estado, r.reporte.notas], ['arreglado', 'resuelto', 'Pasa solo en Safari: revisar el botón']);
    r = (await pedir(base, 'POST', `/api/admin/reportes/${t.id}`, { galleta: admin, datos: { estado: 'no_error' } })).datos.reporte;
    assert.equal(r.estado, 'resuelto');
    lista = (await pedir(base, 'GET', '/api/admin/reportes', { galleta: admin })).datos;
    assert.equal(lista.nuevos, 0);
    assert.deepEqual(ESTADOS_REPORTE, ['nuevo', 'visto', 'arreglado', 'no_error']);
    assert.deepEqual([...ESTADOS_PANTALLA], [...ESTADOS_REPORTE]);
    // «Copiar para el programador»: todo lo que hace falta, en texto.
    const completo = (await pedir(base, 'GET', `/api/admin/reportes/${t.id}`, { galleta: admin })).datos.reporte;
    const texto = textoParaProgramador(completo);
    for (const parte of [`Reporte #${t.id} · no_error`, 'Quién: ana (@ana)', 'Pantalla: #examen/x', 'Versión de la app: 0.14.26', 'La pantalla del examen se ve en blanco', 'Notas del administrador:', 'Captura: no']) {
      assert.ok(texto.includes(parte), parte);
    }
  });
});

test('la app achica la captura (1600 px como mucho, nunca la agranda) y arma el contexto sin nada privado', () => {
  assert.equal(CAPTURA_LADO, 1600);
  assert.deepEqual(medidasCaptura(4032, 3024), { ancho: 1600, alto: 1200 });
  assert.deepEqual(medidasCaptura(1170, 2532), { ancho: 739, alto: 1600 });
  assert.deepEqual(medidasCaptura(800, 600), { ancho: 800, alto: 600 });
  assert.deepEqual(medidasCaptura(0, 0), { ancho: 1, alto: 1 });
  const c = contextoReporte({ pantalla: '#tema/a/b?clave=123&x=1', version: '0.14.26', navegador: 'UA', ancho: 390.4, alto: 844, idioma: 'en' });
  assert.deepEqual(c, { pantalla: '#tema/a/b', version: '0.14.26', navegador: 'UA', tamano: '390x844', idioma: 'en' });
  assert.deepEqual(Object.keys(contextoReporte({})).sort(), ['idioma', 'navegador', 'pantalla', 'tamano', 'version']);
  const texto = textoParaProgramador({ id: 4, usuario: 'ana', nombreVisible: 'Ana', contexto: { pantalla: '#x', hora: 'h' }, mensajes: [{ de: 'alumno', texto: 'Falla' }, { de: 'admin', texto: '¿Cuándo?' }], reporte: { estado: 'nuevo', captura: true, notas: '' } }, { fecha: () => 'ayer' });
  assert.match(texto, /Cuándo: ayer/);
  assert.match(texto, /Captura: sí/);
  assert.match(texto, /- Administrador: ¿Cuándo\?/);
  assert.doesNotMatch(texto, /Notas del administrador/);
});
