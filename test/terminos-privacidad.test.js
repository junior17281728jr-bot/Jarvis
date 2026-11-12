// Pruebas de la 0.9.2: «Términos de uso y aviso» (nombre legal, firma por versión, publicar otra versión) y el perfil
// privado (no aparece para los otros alumnos; el administrador ve todo). Usa solo el paquete de MUESTRA.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { TERMINOS_V1 } from '../src/cuentas/terminos.js';
import { parteValida } from '../public/terminos-vista.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
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
    await fn({ base, db, admin: admin.galleta, ana, beto, ids, reloj });
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
    assert.equal((await aceptar(ana, { version: 1, nombre: 'Ana', apellido: 'Pérez', acepto: false })).datos.error, 'terminos_sin_aceptar');
    for (const [nombre, apellido] of [['A', 'Pérez'], ['Ana', ''], ['Ana1', 'Pérez'], ['Ana', '<b>'], ['x'.repeat(61), 'Pérez']]) {
      assert.equal((await aceptar(ana, { version: 1, nombre, apellido, acepto: true })).datos.error, 'nombre_legal_no_valido', `${nombre} ${apellido}`);
    }
    assert.equal((await aceptar(ana, { version: 2, nombre: 'Ana', apellido: 'Pérez', acepto: true })).datos.error, 'terminos_cambiaron');
    const ok = await aceptar(ana, { version: 1, nombre: '  Ana  María ', apellido: 'Pérez-Gómez', acepto: true });
    assert.equal(ok.codigo, 200);
    assert.equal(ok.datos.estado.pendiente, false);
    assert.equal(ok.datos.estado.ultima.firmado, 'Ana María Pérez-Gómez');
    assert.equal(ok.datos.estado.ultima.version, 1);
    assert.ok(ok.datos.estado.ultima.en);
    assert.match(db.prepare("SELECT detalle FROM auditoria WHERE accion = 'terminos_aceptados'").get().detalle, /^v1: Ana María Pérez-Gómez$/);
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
    assert.equal((await aceptar(ana, { version: 2, nombre: 'Otra', apellido: 'Persona', acepto: true })).datos.error, 'nombre_legal_fijo');
    assert.equal((await aceptar(ana, { version: 2, nombre: 'Ana María', apellido: 'Pérez-Gómez', acepto: true })).datos.estado.pendiente, false);
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
