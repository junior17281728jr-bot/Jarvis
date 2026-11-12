// 0.12.12: «la X no me funciona para salir» y «a veces se traba al cambiar de apartado» (public/navegacion.js y su uso en
// public/app.js). Cada tarjeta de la clase anota dónde va (POST …/paso) y ese POST vaciaba TODA la memoria: al tocar la X,
// Inicio esperaba al servidor con la clase a la vista y sin ninguna señal; tocar la X otra vez no hacía nada (la dirección ya
// era #inicio) y un pedido que no contestaba la dejaba así para siempre. Relojes falsos: nada espera de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queOlvida, olvidar, crearEspera, conTope, CLASE_ESPERA } from '../public/navegacion.js';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/estilos.css', import.meta.url), 'utf8');

// Un reloj falso: programar() guarda la tarea; avanzar(ms) corre las que tocan, en orden.
function relojFalso() {
  let ahora = 0;
  let siguiente = 1;
  const tareas = new Map();
  return {
    programar: (fn, ms) => { const id = siguiente++; tareas.set(id, { fn, en: ahora + ms }); return id; },
    cancelar: id => { tareas.delete(id); },
    avanzar(ms) {
      const hasta = ahora + ms;
      for (;;) {
        const [id, tarea] = [...tareas.entries()].filter(([, x]) => x.en <= hasta).sort((a, b) => a[1].en - b[1].en)[0] ?? [];
        if (!tarea) break;
        tareas.delete(id);
        ahora = tarea.en;
        tarea.fn();
      }
      ahora = hasta;
    },
    get pendientes() { return tareas.size; },
  };
}
function cuerpoFalso() {
  const clases = new Set();
  const atributos = new Map();
  return {
    classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) },
    setAttribute: (k, v) => atributos.set(k, v), removeAttribute: k => atributos.delete(k),
    clases, atributos,
  };
}

test('anotar la tarjeta de la clase ya no vacía la memoria: el camino queda para que la X dibuje Inicio enseguida', () => {
  assert.deepEqual(queOlvida('/api/academia/temas/factores_humanos/t01-vision/paso'),
    { quitar: ['/api/academia/temas/factores_humanos/t01-vision'], revisar: ['/api/academia/camino', '/api/academia/progreso'] });
  // Las señales del tutor (👍/🤔, el tiempo por tarjeta, «vio el video») no cambian nada de lo guardado.
  assert.deepEqual(queOlvida('/api/academia/tutor/senal'), { quitar: [], revisar: [] });
  assert.deepEqual(queOlvida('/api/academia/tutor/tarjeta'), { quitar: [], revisar: [] });
  // Todo lo demás (responder, terminar, leído, el plan, lo del administrador…) vacía la memoria como siempre.
  for (const ruta of ['/api/academia/intentos/4/terminar', '/api/academia/intentos/4/responder', '/api/academia/temas/m/t/leido',
    '/api/academia/plan', '/api/admin/usuarios', '/api/academia/video/m/ofrecido', '/api/academia/temas/m/t/paso/otra', '/api/salir']) {
    assert.equal(queOlvida(ruta), 'todo', ruta);
  }

  const memoria = new Map([
    ['/api/academia/camino', { respuesta: { ok: true, datos: { n: 1 } }, en: 1000, usuario: 2 }],
    ['/api/academia/progreso', { respuesta: { ok: true }, en: 1000, usuario: 2 }],
    ['/api/academia/temas/factores_humanos/t01-vision', { respuesta: { ok: true, datos: { paso: { paso: 6 } } }, en: 1000, usuario: 2 }],
    ['/api/academia/temas/factores_humanos/t02-hipoxia', { respuesta: { ok: true }, en: 1000, usuario: 2 }],
  ]);
  olvidar(memoria, '/api/academia/temas/factores_humanos/t01-vision/paso');
  // El camino sigue (se dibuja con él) pero «viejo»: en = 0 hace que se pregunte de nuevo por detrás (deMemoria).
  assert.deepEqual(memoria.get('/api/academia/camino'), { respuesta: { ok: true, datos: { n: 1 } }, en: 0, usuario: 2 });
  assert.equal(memoria.get('/api/academia/progreso').en, 0);
  // La lección guardaba en qué tarjeta iba: esa se pide otra vez (si no, al volver seguiría en la tarjeta de antes).
  assert.equal(memoria.has('/api/academia/temas/factores_humanos/t01-vision'), false);
  assert.equal(memoria.get('/api/academia/temas/factores_humanos/t02-hipoxia').en, 1000);
  olvidar(memoria, '/api/academia/tutor/senal');
  assert.equal(memoria.size, 3);
  olvidar(memoria, '/api/academia/intentos/9/terminar');
  assert.equal(memoria.size, 0);
});

test('la barra de «cargando» sale solo si la pantalla nueva tarda, se va al dibujar y tiene tope', () => {
  const reloj = relojFalso();
  const cuerpo = cuerpoFalso();
  const espera = crearEspera(cuerpo, { retrasoMs: 150, topeMs: 30_000, programar: reloj.programar, cancelar: reloj.cancelar });
  // Lo que se dibuja enseguida (desde la memoria) no hace parpadear nada.
  espera.empezar();
  reloj.avanzar(149);
  espera.terminar();
  reloj.avanzar(1000);
  assert.equal(cuerpo.clases.has(CLASE_ESPERA), false);
  assert.equal(reloj.pendientes, 0);
  // Lo que espera al servidor: la barra aparece, y se va al dibujar.
  espera.empezar();
  reloj.avanzar(150);
  assert.equal(cuerpo.clases.has(CLASE_ESPERA), true);
  assert.equal(cuerpo.atributos.get('aria-busy'), 'true');
  assert.equal(espera.esperando, true);
  espera.terminar();
  assert.equal(cuerpo.clases.has(CLASE_ESPERA), false);
  assert.equal(cuerpo.atributos.has('aria-busy'), false);
  assert.equal(espera.esperando, false);
  // Dos cambios seguidos (la X tocada dos veces): la barra sale a la hora del primero, con un solo retraso.
  espera.empezar();
  reloj.avanzar(100);
  espera.empezar();
  assert.equal(reloj.pendientes, 2); // el retraso y el tope del segundo
  reloj.avanzar(100);
  assert.equal(cuerpo.clases.has(CLASE_ESPERA), true);
  // Si nada se dibuja nunca, se quita sola al tope.
  reloj.avanzar(30_000);
  assert.equal(cuerpo.clases.has(CLASE_ESPERA), false);
  assert.equal(reloj.pendientes, 0);
});

test('una lectura que no contesta se corta a su tope; soltar() la deja seguir', () => {
  const reloj = relojFalso();
  const a = conTope(25_000, reloj);
  reloj.avanzar(24_999);
  assert.equal(a.senal.aborted, false);
  reloj.avanzar(1);
  assert.equal(a.senal.aborted, true);
  const b = conTope(25_000, reloj);
  b.soltar();
  reloj.avanzar(60_000);
  assert.equal(b.senal.aborted, false);
});

test('app.js: la X, la memoria, la barra y lo que se apaga al salir', () => {
  // «Mi repaso» y el humor también quedan en memoria (volver a esas pantallas se dibuja enseguida).
  const enMemoria = new RegExp(/^const EN_MEMORIA = \/(.*)\/;$/m.exec(app)[1]);
  for (const ruta of ['/api/academia/camino', '/api/academia/mi-repaso', '/api/academia/humor', '/api/academia/temas/m/t']) assert.ok(enMemoria.test(ruta), ruta);
  for (const ruta of ['/api/academia/intentos/3', '/api/academia/temas/m/t/paso']) assert.equal(enMemoria.test(ruta), false, ruta);
  // Los cambios pasan por olvidar() (no se vacía todo por cada tarjeta).
  assert.match(app, /if \(!guardable && metodo !== 'GET'\) olvidar\(memoria, ruta\);/);
  assert.doesNotMatch(app, /if \(!guardable && metodo !== 'GET'\) vaciarMemoria\(\);/);
  // Las lecturas tienen tope y lo sueltan siempre.
  const pedir = /async function pedirAlServidor\([\s\S]*?\n\}/.exec(app)[0];
  assert.match(pedir, /metodo === 'GET' \? conTope\(25_000\) : null/);
  assert.match(pedir, /opciones\.signal = tope\.senal/);
  assert.match(pedir, /finally \{\s*tope\?\.soltar\(\);/);
  // Cambiar de dirección enciende la espera; dibujar (mostrar) la apaga.
  assert.match(app, /window\.addEventListener\('hashchange', \(\) => \{ repintarEnFondo = false; if \(estado\.usuario\) \{ espera\.empezar\(\); dibujar\(\); \} \}\);/);
  assert.match(/function mostrar\([\s\S]*?\n\}/.exec(app)[0], /^\s*espera\.terminar\(\);/m);
  // La X de las pantallas de estudio: si la dirección ya es la de salir, la vuelve a pedir (antes: nada).
  const marco = /function marcoEstudio\([\s\S]*?\n\}/.exec(app)[0];
  assert.match(marco, /class: 'estudio-salir', href: salir/);
  assert.match(marco, /onclick: evento => \{ if \(location\.hash === salir\) \{ evento\.preventDefault\(\); espera\.empezar\(\); dibujar\(\); \} \}/);
  // La clase: al irse apaga el clip o el dibujo de la tarjeta, y deja el camino pedido.
  const tema = /async function pantallaTema\([\s\S]*?\nfunction volverAlCamino/.exec(app)[0];
  assert.match(tema, /const alSalir = \(\) => setTimeout\(\(\) => \{\s*if \(vigente\(\)\) return;\s*actual\?\.destruir\?\.\(\);/);
  assert.match(tema, /if \(!memoria\.has\('\/api\/academia\/camino'\)\) adelantar\('\/api\/academia\/camino'\);/);
  // El video (mp4) y el de escenas: «se fue» = otra pantalla empezó (vigente), no «ya no está en la página».
  assert.match(app, /if \(lugar\.isConnected && vigente\(\)\) return;\s*guardarPosicion\(true\);/);
  assert.match(app, /pantallaVideoMp4\(materia, v, \{ volver, saltar, tema: modo === 'tema' \? tema : null, vigente \}\)/);
  assert.match(app, /if \(!lugar\.isConnected \|\| !vigente\(\)\) \{ clearInterval\(reloj\); reproductor\?\.destruir\(\);/);
  // El clip en grande suelta su video al cerrar o al cambiar de pantalla.
  const grande = /function abrirClipGrande\([\s\S]*?\n\}/.exec(app)[0];
  assert.match(grande, /const soltar = \(\) => \{ grande\.pause\(\); grande\.removeAttribute\('src'\); grande\.load\(\); capa\.remove\(\); \};/);
  assert.match(grande, /window\.addEventListener\('hashchange', soltar, \{ once: true \}\);/);
  // La barra existe en el CSS (sin estilos en línea), no pisa el fondo (body::before) y respeta «reducir movimiento».
  assert.match(css, /body\.cambiando-pantalla::after \{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ body\.cambiando-pantalla::after \{ animation: none;/);
  assert.match(css, /body\.modo-estudio \.avisos-flotantes \{ bottom:/);
});
