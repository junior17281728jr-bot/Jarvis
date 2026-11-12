// 0.12.12: los arreglos de la revisión visual (QA de la 0.12.7): «null» bajo los botones del examen, la clave sin traducir
// del Profesor en la ficha del alumno, el concepto «Para el Test Guide», textos del alumno en Pagos del administrador, etc.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tarjetaPara, TARJETA_DE_REPASO } from '../src/academia/instructor.js';
import { PERMISOS_PROFESOR } from '../public/instructor.js';

const leer = ruta => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const es = JSON.parse(leer('public/i18n/es.json'));
const en = JSON.parse(leer('public/i18n/en.json'));

test('examen: en la última pregunta el pie no escribe «null» (entregarYa es null)', () => {
  const examen = leer('public/examen-vista.js');
  assert.match(examen, /pie\.replaceChildren\(\.\.\.\[el\('div', \{ class: 'examen-nav' \}, anterior, siguiente\), entregarYa\]\.filter\(Boolean\)\);/);
  assert.doesNotMatch(examen, /pie\.replaceChildren\(el\('div', \{ class: 'examen-nav' \}, anterior, siguiente\), entregarYa\);/);
});

test('ficha del alumno: cada «por qué tiene el Profesor» que da el servidor tiene su texto; otro valor → «Lo tiene.»', () => {
  const profesor = leer('src/academia/profesor.js');
  const porServidor = [...profesor.matchAll(/permitido: true, por: '([a-z]+)'/g)].map(m => m[1]);
  assert.ok(porServidor.length >= 5);
  for (const por of porServidor) assert.ok(PERMISOS_PROFESOR.includes(por), `falta «${por}» en PERMISOS_PROFESOR`);
  for (const por of [...PERMISOS_PROFESOR, 'otro']) {
    assert.ok(es[`profesor.admin.si.${por}`], `es: profesor.admin.si.${por}`);
    assert.ok(en[`profesor.admin.si.${por}`], `en: profesor.admin.si.${por}`);
  }
  assert.match(leer('public/instructor.js'), /PERMISOS_PROFESOR\.includes\(r\.datos\.permiso\.por\) \? `profesor\.admin\.si\.\$\{r\.datos\.permiso\.por\}` : 'profesor\.admin\.si\.otro'/);
});

test('el concepto de una pregunta nunca es una tarjeta de repaso («Para el Test Guide», «Resumen»…)', () => {
  for (const t of ['Para el Test Guide (1)', 'Para el Test Guide (2)', 'Trampas del Test Guide', 'Resumen', 'Qué vas a aprender', 'Que vas a aprender']) assert.ok(TARJETA_DE_REPASO.test(t), t);
  for (const t of ['Luces de otros aviones', 'Resumir', 'El ojo es como una cámara', 'Qué es la hipoxia']) assert.equal(TARJETA_DE_REPASO.test(t), false, t);
  const tema = {
    secciones: [
      { tipo: 'tarjeta', titulo: 'Qué vas a aprender', puntos: ['Las luces de posición de un avión de noche: roja, verde y blanca.'] },
      { tipo: 'tarjeta', titulo: 'Luces de otros aviones', puntos: ['La luz roja va en el ala izquierda y la verde en la derecha.'] },
      { tipo: 'tarjeta', titulo: 'Para el Test Guide (1)', puntos: ['De noche ves una luz roja y una verde fijas a la vez: el avión viene de frente hacia ti, luz roja verde.'] },
      { tipo: 'tarjeta', titulo: 'Resumen', puntos: ['Roja izquierda, verde derecha, blanca en la cola: luces de posición de noche.'] },
    ],
  };
  const r = tarjetaPara(tema, 'De noche ves una luz roja y una luz verde fijas: ¿hacia dónde va el avión? Viene de frente hacia ti.');
  assert.equal(r.titulo, 'Luces de otros aviones');
  // Si solo se parecen las de repaso: ninguna (queda el concepto general del tema, con el título del tema).
  assert.equal(tarjetaPara({ secciones: [tema.secciones[2], tema.secciones[3]] }, 'luz roja verde de noche'), null);
});

test('Pagos del administrador: el estado del plan de cada alumno en tercera persona, y «Minutos» con su nombre', () => {
  const instructor = leer('public/instructor.js');
  const pagos = leer('public/pagos.js');
  assert.match(pagos, /textoPlan\(\{ \.\.\.a\.derecho, modo: 'planes', minutos: a\.minutos \}, \{ admin: true \}\)/);
  assert.match(instructor, /const k = clave => \(admin \? clave\.replace\(\/\^plan\\\.\/, 'plan\.admin\.'\) : clave\);/);
  // Toda clave plan.* que usa textoPlan tiene su versión plan.admin.* (es y en), sin «Tienes/Tu/te».
  const cuerpo = /function textoPlan\([\s\S]*?\n  \}/.exec(instructor)[0];
  const claves = [...new Set([...cuerpo.matchAll(/'(plan\.[a-z_]+\.?[a-z_]+)'/g)].map(m => m[1]).filter(k => !k.startsWith('plan.admin')))];
  assert.ok(claves.length >= 7, claves.join(','));
  for (const k of claves) {
    const a = k.replace(/^plan\./, 'plan.admin.');
    assert.ok(es[a] && en[a], a);
    assert.doesNotMatch(es[a], /\b(Tienes|Tu |te quedan|usaste)\b/, a);
  }
  assert.match(pagos, /el\('label', \{ class: 'minutos-fila' \}, el\('span', \{ class: 'chica', texto: tx\('pagos\.minutos_campo'\) \}\), n,/);
  assert.ok(es['pagos.minutos_campo'] && en['pagos.minutos_campo']);
  assert.match(leer('public/instructor.css'), /\.minutos-fila \{ display: inline-flex;/);
  // La pestaña Pagos con su línea de «para qué sirve», como las demás.
  assert.match(leer('public/app.js'), /pagos: \(\) => t\('admin\.linea\.pagos'\)/);
  assert.ok(es['admin.linea.pagos'] && en['admin.linea.pagos']);
});

test('el gasto de IA dice el día del corte en UTC («1 de diciembre»), no la hora en RD del día anterior', () => {
  const app = leer('public/app.js');
  assert.match(app, /t\('ia\.gasto\.reinicia', \{ fecha: diaDeCobro\(s\.vuelveEl\) \}\)/);
  const fuente = /function diaDeCobro\(iso\) \{[\s\S]*?\n\}/.exec(app)[0];
  const diaDeCobro = new Function('formatoLocal', `${fuente}; return diaDeCobro;`)(() => 'es-DO');
  assert.equal(diaDeCobro('2026-12-01T00:00:00.000Z'), '1 de diciembre');
  assert.equal(diaDeCobro(null), '');
});

test('Grupo, Comparar, video, toques y contraste (CSS y textos)', () => {
  const academia = leer('public/academia.css');
  const alumnos = leer('public/alumnos.css');
  const app = leer('public/app.js');
  // El avioncito del Grupo se ve en oscuro (y en automático de noche).
  assert.match(academia, /:root\[data-tema="oscuro"\] \.cadena-avion \{ fill: var\(--texto\); \}/);
  assert.match(academia, /@media \(prefers-color-scheme: dark\) \{ :root\[data-tema="auto"\] \.cadena-avion \{ fill: var\(--texto\); \} \}/);
  // El % de cada piloto dice de qué es.
  assert.match(app, /el\('span', \{ class: 'companero-pct-de', texto: t\('acad\.grupo\.pct_curso'\) \}\)/);
  for (const k of ['acad.grupo.pct_de', 'acad.grupo.pct_curso']) assert.ok(es[k] && en[k], k);
  // Comparar en el teléfono: el nombre en su línea.
  assert.match(alumnos, /@media \(max-width: 480px\) \{\n  \.comparar-fila \{ grid-template-columns: 1fr auto;/);
  // El video resumen en la pantalla ancha usa más ancho.
  assert.match(academia, /body\.modo-estudio:has\(\.video-mp4\) #app \{ max-width: 1180px; \}/);
  // Toques de 44 px.
  assert.match(academia, /min-height: 44px; padding: 6px 10px; border-radius: 12px; \/\* 0\.12\.12/);
  assert.match(academia, /\.ficha-oir::after \{ content: ''; position: absolute; inset: -6px; \}/);
  assert.match(alumnos, /\.reportar-error \{ display: inline-flex; align-items: center; min-height: 44px;/);
  assert.match(alumnos, /\.contrato-indice a \{ color: inherit; display: block; padding: 10px 0; \}/);
  // CONTINUAR con el nombre del tema entero; letras de las opciones respondidas legibles.
  assert.doesNotMatch(academia, /\.boton-continuar span \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  assert.match(academia, /\.opcion-carta\.es-correcta \.opcion-letra \{[^}]*color: #0f1720; \}/);
  assert.match(academia, /\.opcion-carta\.es-mala \.opcion-letra \{[^}]*color: #0f1720; \}/);
  // «Bajar al final» no tapa lo último del texto.
  assert.match(alumnos, /\.lee \{ display: grid; gap: 14px; padding-bottom: 64px; \}/);
  // Sin claves repetidas en los idiomas y los dos con las mismas claves.
  for (const archivo of ['public/i18n/es.json', 'public/i18n/en.json']) {
    const claves = [...leer(archivo).matchAll(/^\s{2}"([^"]+)":/gm)].map(m => m[1]);
    assert.equal(new Set(claves).size, claves.length, `${archivo}: claves repetidas`);
  }
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
});
