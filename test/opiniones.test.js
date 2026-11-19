// Pruebas de la 0.14.26: «¿Cómo te fue con esta clase?» (src/academia/opiniones.js): se guarda solo agregando, cuenta la
// última de cada alumno, entra en la Mejora continua (números y textos SIN nombres: nunca un nombre va al modelo), y el
// administrador las ve por materia y tema y las exporta para el programador.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from './ayuda.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { guardarAjuste, leerAjuste } from '../src/academia/paquetes.js';
import { guardarOpinion, todas, resumenOpiniones, evidenciaOpiniones, anonimizar, nombresParaOcultar, VOTOS } from '../src/academia/opiniones.js';
import { evidencia, SEMANA_MS } from '../src/academia/fabrica-mejora.js';
import { textoOpiniones, jsonOpiniones } from '../public/opiniones-vista.js';
import { conFabrica, textoDelPedido } from './fabrica-base.js';

const CLAVE = 'una clave bien larga';
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${base}${ruta}`, opciones);
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: setCookie ? setCookie.split(';')[0] : null };
}

test('opinar: valida, guarda solo agregando, cuenta la última de cada alumno; el administrador la ve sin nombres (401/403)', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { reloj: () => Date.parse('2026-11-12T15:00:00Z') } });
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    const ana = crearUsuario(db, { nombre: 'ana', nombreVisible: 'Ana Lucía', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const galleta = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    const opinar = datos => pedir(base, 'POST', '/api/academia/opinion', { galleta, datos });
    assert.equal((await pedir(base, 'POST', '/api/academia/opinion', { datos: { tipo: 'tema', materia: 'sistemas', tema: 't01', voto: 'clara' } })).codigo, 401);
    for (const malo of [{ tipo: 'tema', materia: 'sistemas', tema: 't01', voto: 'genial' }, { tipo: 'clase', materia: 'sistemas', tema: 't01', voto: 'clara' },
      { tipo: 'tema', materia: 'sistemas', voto: 'clara' }, { tipo: 'tema', materia: '../x', tema: 't01', voto: 'clara' }]) {
      assert.equal((await opinar(malo)).codigo, 400, JSON.stringify(malo));
    }
    assert.equal((await opinar({ tipo: 'tema', materia: 'sistemas', tema: 't01', voto: 'duda', texto: 'Soy Ana Lucía (ana@correo.com, 809-555-1234): no entendí la hélice' })).codigo, 201);
    assert.equal((await opinar({ tipo: 'tema', materia: 'sistemas', tema: 't01', voto: 'clara' })).codigo, 201, 'cambia de idea');
    assert.equal((await opinar({ tipo: 'examen', materia: 'sistemas', voto: 'mejorar', texto: 'Muy largo el examen' })).codigo, 201);
    // Solo se agrega: las tres quedan (con el id del alumno solo en el servidor).
    const lista = todas(db);
    assert.deepEqual(lista.map(o => [o.usuarioId, o.voto]), [[ana, 'duda'], [ana, 'clara'], [ana, 'mejorar']]);
    assert.equal(leerAjuste(db, 'academia.opinion.siguiente'), '3');
    // El administrador: por materia; cuenta la última de cada alumno; los textos sin nombres ni datos.
    for (const g of [null, galleta]) assert.equal((await pedir(base, 'GET', '/api/admin/opiniones', { galleta: g })).codigo, g ? 403 : 401);
    const r = (await pedir(base, 'GET', '/api/admin/opiniones', { galleta: admin })).datos;
    assert.equal(r.materias.length, 1);
    const tema = r.materias[0].lugares.find(l => l.tipo === 'tema');
    assert.deepEqual([tema.alumnos, tema.clara, tema.duda, tema.mejorar], [1, 1, 0, 0]);
    const examen = r.materias[0].lugares.find(l => l.tipo === 'examen');
    assert.deepEqual([examen.mejorar, examen.textos[0].texto], [1, 'Muy largo el examen']);
    const todo = JSON.stringify(r);
    for (const x of ['Ana', 'ana@', '809', 'usuarioId', `"${ana}"`]) assert.ok(!todo.includes(x), x);
    // Exportar para el programador: texto y JSON.
    const texto = textoOpiniones(r);
    assert.match(texto, /## sistemas \(sistemas\)/);
    assert.match(texto, /Examen de la materia · 1 alumnos · 👍 0 · 🤔 0 · 💡 1/);
    assert.match(texto, /💡 Muy largo el examen/);
    assert.deepEqual(JSON.parse(jsonOpiniones(r)).materias, r.materias);
  });
  db.close();
});

test('anonimizar quita nombres de la academia, correos, teléfonos y @usuarios', () => {
  const nombres = ['ana', 'lucía', 'rodríguez'];
  assert.equal(anonimizar('Soy Ana Lucía Rodríguez, @analu, ana@x.com, tel 809 555 1234. ¡Banana!', nombres), 'Soy [nombre] [nombre] [nombre], [usuario], [correo], tel [número]. ¡Banana!');
  assert.deepEqual(VOTOS, ['clara', 'duda', 'mejorar']);
});

test('la Mejora continua: 3 alumnos con dudas en un tema = evidencia; al modelo van números y textos SIN nombres, y no se repite', async () => {
  await conFabrica(async ({ db, correr, llamadas, admin, avanzar }) => {
    await correr();
    const n = llamadas().length;
    const nombres = ['Wilfredo', 'Xiomara', 'Yolanda', 'Zacarías'];
    const ids = nombres.map((nom, i) => crearUsuario(db, { nombre: `al${i}`, nombreVisible: `${nom} Pérez`, claveHash: 'x', creadoPor: admin }));
    guardarAjuste(db, `cuenta.nombre_legal.${ids[0]}`, JSON.stringify({ nombre: 'Wilfredo', apellido: 'Almonte' }));
    // Dos dudas: todavía no es evidencia.
    guardarOpinion(db, ids[0], { tipo: 'tema', materia: 'sistemas', tema: 't01-motor', voto: 'duda', texto: 'Soy Wilfredo Almonte y no entiendo La hélice' });
    guardarOpinion(db, ids[1], { tipo: 'tema', materia: 'sistemas', tema: 't01-motor', voto: 'mejorar', texto: 'Mi amiga Yolanda tampoco (al2)' });
    guardarOpinion(db, ids[3], { tipo: 'tema', materia: 'sistemas', tema: 't01-motor', voto: 'clara' });
    assert.equal(evidenciaOpiniones(db).length, 0);
    guardarOpinion(db, ids[2], { tipo: 'tema', materia: 'sistemas', tema: 't01-motor', voto: 'duda' });
    const ev = evidencia(db).filter(x => x.tipo === 'opinion');
    assert.equal(ev.length, 1);
    assert.deepEqual([ev[0].materia, ev[0].tema, ev[0].evidencia.alumnos, ev[0].evidencia.duda, ev[0].evidencia.mejorar, ev[0].evidencia.clara], ['sistemas', 't01-motor', 3, 2, 1, 1]);
    const enEvidencia = JSON.stringify(ev);
    for (const x of [...nombres, 'Almonte', 'Pérez', 'al2']) assert.ok(!enEvidencia.includes(x), `la evidencia nombra ${x}`);
    assert.ok(nombresParaOcultar(db).includes('almonte'));
    // La semana siguiente: reescribe la tarjeta que nombran (La hélice) con esa evidencia.
    avanzar(SEMANA_MS + 1000);
    const r = await correr();
    assert.equal(r.at(-1).resultado.mejora, 'publicada', JSON.stringify(r.at(-1)));
    const pedidos = llamadas().slice(n).map(p => textoDelPedido(p.cuerpo));
    const enteros = llamadas().slice(n).map(p => JSON.stringify(p.cuerpo));
    const escribir = pedidos.find(x => x.includes('opinaron sobre ella'));
    assert.ok(escribir, 'la reescritura lleva la opinión');
    assert.match(escribir, /3 alumnos dijeron de esta clase: 2 «me quedó una duda», 1 «se puede mejorar»/);
    assert.match(escribir, /La hélice/);
    for (const p of enteros) for (const x of [...nombres, 'Almonte', 'Pérez', '"usuarioId"']) assert.ok(!p.includes(x), `al modelo le llegó ${x}`);
    const ultima = JSON.parse(leerAjuste(db, 'fabrica.mejora.ultima'));
    assert.ok(ultima.mejorados.some(x => x.tipo === 'opinion' && x.titulo === 'La hélice'));
    // La misma evidencia no se vuelve a trabajar.
    assert.equal(evidenciaOpiniones(db).length, 0);
    assert.equal(resumenOpiniones(db)[0].lugares[0].alumnos, 4);
  });
});
