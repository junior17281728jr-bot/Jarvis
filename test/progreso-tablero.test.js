// Pruebas de la Academia 0.14.23: «Mi progreso» como tablero corto y visual (public/progreso-tablero.js).
//  - Lo puro: el estado de cada materia (lista · en curso · sin empezar · te falla), «Te falta» (máx. 2), el tiempo corto.
//  - El resumen de arriba sale de los datos (los anillos con su %, «Ahora en: M2 · <tema>», «Vas 1.º de 2 · 🔥 3 días»).
//  - Las 11 fichas de materias (las sin clases, «pronto», no se tocan) y el punto de estado cuando llega el examen.
//  - «¿Tomo el examen final?» en una tarjeta: veredicto, dos barras, «Te falta» corto y «Ver por materia».
//  - app.js: el orden del tablero y «Ver detalles» con TODO lo de antes (nada se quitó). Sin innerHTML ni style en línea.
// Un DOM de mentira (como test/consejo-ia.test.js). Contenido inventado.
import { test } from 'node:test';
import './ayuda.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estadoMateria, estadoCapitulo, faltanCortos, tiempoCorto, vistaHero, vistaTop3, botonVerTodos, vistaNumeros, vistaMaterias, vistaExamenResumen } from '../public/progreso-tablero.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

class Nodo {
  constructor(etiqueta) { this.etiqueta = etiqueta; this.hijos = []; this.atributos = {}; this.eventos = {}; this.isConnected = true; }
  append(...xs) { for (const x of xs) this.hijos.push(x instanceof Nodo ? x : String(x)); }
  replaceChildren(...xs) { this.hijos = []; this.append(...xs); }
  setAttribute(k, v) { this.atributos[k] = String(v); }
  get textContent() { return this.hijos.map(h => (typeof h === 'string' ? h : h.textContent)).join(' '); }
  set textContent(v) { this.hijos = [String(v)]; }
  todos(f, out = []) { if (f(this)) out.push(this); for (const h of this.hijos) if (h instanceof Nodo) h.todos(f, out); return out; }
  clase(c) { return this.todos(x => (x.atributos.class ?? '').split(' ').includes(c)); }
}
function ayudas() {
  const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
  const t = (clave, vars = {}) => (es[clave] ?? clave).replace(/\{(\w+)\}/g, (_, n) => (n in vars ? String(vars[n]) : `{${n}}`));
  const tn = (clave, vars = {}) => (Number(vars.n) === 1 && es[`${clave}.uno`] ? t(`${clave}.uno`, vars) : t(clave, vars));
  const el = (etiqueta, props = {}, ...hijos) => {
    const n = new Nodo(etiqueta);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.eventos[k.slice(2)] = v;
      else if (k === 'texto') n.textContent = v; else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos.flat(Infinity)) if (h != null && h !== false) n.append(h);
    return n;
  };
  const hojas = [];
  const NOMBRES = { factores_humanos: 'Factores humanos', sistemas: 'Sistemas', oral_calificaciones: 'Calificaciones' };
  return {
    el, t, tn, svgEl: el, numero: n => String(n), icono: nombre => el('svg', { 'data-icono': nombre }), pctTexto: n => `${n} %`,
    nombreMateria: id => NOMBRES[id] ?? id, partirTitulo: s => ({ es: String(s).replace(/\s*\([^)]*\)\s*$/, '') }), barraLlena: pct => el('span', { class: 'barra-relleno', 'data-pct': pct }),
    abrirHoja: x => hojas.push(x), hojas, iconoMateria: () => 'avion', claseMateria: () => 'mc-0',
  };
}

const tema = (id, estado, extra = {}) => ({ id, titulo: `Tema ${id} (topic)`, estado, ...extra });
function avance() {
  const tg = [
    { id: 'factores_humanos', numero: 1, pronto: false, temas: [tema('hipoxia', 'hecho'), tema('vision', 'hecho')], hechos: 2, pct: 100, actual: false, examen: { aprobado: true, mejor: 80 } },
    { id: 'sistemas', numero: 2, pronto: false, temas: [tema('motor', 'hecho'), tema('helice', 'empezado', { actual: true })], hechos: 1, pct: 50, actual: true, examen: null },
    { id: 'aerodinamica', numero: 3, pronto: false, temas: [tema('ala', 'nuevo')], hechos: 0, pct: 0, actual: false, examen: null },
    ...Array.from({ length: 8 }, (_, k) => ({ id: `m${k + 4}`, numero: k + 4, pronto: true, temas: [], hechos: 0, pct: 0, actual: false, examen: null })),
  ];
  return {
    tg: { pct: 42, hechos: 3, total: 5, terminado: false, ahora: { id: 'sistemas', numero: 2, tema: 'helice', temaNumero: 2, temas: 2, titulo: 'La hélice (propeller)' }, bloques: tg },
    oral: { pct: 17, hechos: 1, total: 6, terminado: false, ahora: null, bloques: [{ id: 'oral_calificaciones', numero: 1, pronto: false, temas: [tema('t1', 'hecho'), tema('t2', 'nuevo')], hechos: 1, pct: 50, actual: false, examen: null }] },
  };
}
const carrera = () => ({ oral: true, pilotos: [{ alias: 'Marta', tg: 30, oral: 0 }, { alias: 'Luis', tg: 42, oral: 17, esYo: true }], yo: { avance: avance(), datos: { racha: 3, temas: { hechos: 3, total: 5 }, notaMedia: 80, minutosSemana: 65 } } });
const examen = () => ({
  oficial: { si: false, pct: 30, acierto: 60, cobertura: 40, porques: [{ clave: 'acierto.no', vars: { valor: 60, meta: 90 } }, { clave: 'cobertura.no', vars: { valor: 40, meta: 95 } }, { clave: 'constancia.no', vars: { valor: 1, meta: 3 } }, { clave: 'fallas.no', vars: { n: 4 } }] },
  materias: [
    { materia: 'factores_humanos', si: false, pct: 60, cobertura: 100, iniciada: true, estado: 'todavia', flojos: [{ materia: 'factores_humanos', tema: 'hipoxia', titulo: 'La hipoxia (hypoxia)' }], empezar: 'hipoxia' },
    { materia: 'sistemas', si: false, pct: 75, cobertura: 50, iniciada: true, estado: 'casi', flojos: [], empezar: 'motor' },
    { materia: 'aerodinamica', si: false, pct: 0, cobertura: 0, iniciada: false, estado: 'sin_empezar', flojos: [], empezar: 'ala' },
  ],
});

test('lo puro: el estado de cada materia y capítulo, «Te falta» (máx. 2, lo que no dicen las barras primero) y el tiempo corto', () => {
  const [fh, sis, aero, pronto] = avance().tg.bloques;
  const ex = examen().materias;
  assert.equal(estadoMateria(pronto), 'pronto');
  assert.equal(estadoMateria(aero), 'sin');
  assert.equal(estadoMateria(aero, ex[2]), 'sin');
  assert.equal(estadoMateria(sis), 'curso');
  assert.equal(estadoMateria(sis, ex[1]), 'curso');
  assert.equal(estadoMateria(fh, ex[0]), 'falla', 'al 100 % pero acierta 60 %: «todavía no»');
  assert.equal(estadoMateria(sis, { ...ex[1], flojos: [{ tema: 'motor', titulo: 'Motor' }] }), 'curso', '«casi» con un tema flojo: en curso (el tema, en su hoja)');
  assert.equal(estadoMateria(fh, { ...ex[0], si: true, flojos: [] }), 'lista');
  assert.equal(estadoCapitulo({ temas: [tema('a', 'hecho')], hechos: 1 }), 'lista');
  assert.equal(estadoCapitulo({ temas: [tema('a', 'nuevo')], hechos: 0, examen: { aprobado: false } }), 'falla');
  assert.equal(estadoCapitulo({ temas: [tema('a', 'empezado'), tema('b', 'nuevo')], hechos: 0 }), 'curso');
  assert.deepEqual(faltanCortos(examen().oficial).map(x => x.id), ['constancia', 'fallas']);
  assert.deepEqual(faltanCortos({ porques: [{ clave: 'acierto.ok' }, { clave: 'cobertura.no', vars: {} }] }).map(x => x.id), ['cobertura']);
  assert.deepEqual(faltanCortos(null), []);
  const { t, numero } = ayudas();
  assert.deepEqual([tiempoCorto(45, t, numero), tiempoCorto(60, t, numero), tiempoCorto(65, t, numero), tiempoCorto(null, t, numero)], ['45 min', '1 h', '1 h 5', '0 min']);
});

test('el resumen de arriba sale de los datos: dos anillos con su %, «Ahora en: M2 · La hélice» y «Vas 1.º de 2 · 🔥 3 días»', () => {
  const h = ayudas();
  const n = vistaHero(h, carrera());
  const anillos = n.clase('tb-anillo');
  assert.deepEqual(anillos.map(x => x.atributos['data-pct']), ['42', '17']);
  assert.deepEqual(n.clase('tb-hero-anillo').map(x => x.atributos['aria-label']), ['Test Guide: 42 %', 'Oral: 17 %']);
  // El trazo del anillo, por atributo (nada de style en línea): 42 de 100.
  assert.equal(n.clase('tb-anillo-lleno')[0].atributos['stroke-dasharray'], '42 200');
  assert.equal(n.clase('tb-ahora')[0].textContent.trim(), 'Ahora en: M2 · La hélice');
  assert.equal(n.clase('tb-ahora')[0].atributos.href, '#tema/sistemas/helice');
  assert.equal(n.clase('tb-hero-linea')[0].textContent, 'Vas 1.º de 2 · 🔥 3 días');
  // Sin oral: un solo anillo; solo, sin compañeros: sin «Vas 1.º de 1»; racha 1: «1 día»; sin avance: nada.
  const solo = carrera();
  solo.pilotos = [solo.pilotos[1]];
  solo.yo.avance.oral = null;
  solo.yo.datos.racha = 1;
  const m = vistaHero(h, solo);
  assert.equal(m.clase('tb-anillo').length, 1);
  assert.equal(m.clase('tb-hero-linea')[0].textContent, '🔥 1 día');
  assert.equal(vistaHero(h, { pilotos: [], yo: null }), null);
  assert.doesNotMatch(n.textContent + m.textContent, /\bnull\b|undefined|NaN|\{[a-z_]+\}/);
});

test('mis números en 4 fichitas, el top 3 y «Ver todos»', () => {
  const h = ayudas();
  const n = vistaNumeros(h, carrera().yo.datos);
  assert.deepEqual(n.clase('tb-num-valor').map(x => x.textContent), ['3', '3/5', '80 %', '1 h 5']);
  assert.deepEqual(n.clase('tb-num-rotulo').map(x => x.textContent), ['Racha', 'Temas', 'Nota', 'Semana']);
  const top = vistaTop3(h, carrera().pilotos);
  assert.deepEqual(top.clase('tb-top-pct').map(x => x.textContent), ['42 %', '30 %']);
  assert.match(top.clase('tb-top-uno')[0].atributos.class, /\byo\b/);
  assert.equal(vistaTop3(h, [carrera().pilotos[0]]), null, 'solo: sin top');
  // «Ver todos»: la tabla de siempre (podio y filas), en una hoja, con los pilotos de AHORA.
  let datos = carrera();
  const boton = botonVerTodos(h, () => datos);
  datos = { ...datos, pilotos: [...datos.pilotos, { alias: 'Carla', tg: 90, oral: 50 }] };
  boton.eventos.click();
  assert.equal(h.hojas.at(-1).titulo, 'Tabla');
  assert.equal(h.hojas.at(-1).cuerpo.clase('tabla-fila').length, 3);
});

test('las materias: 11 fichas (las sin clases no se tocan), los capítulos del oral y, al llegar el examen, el punto de estado; al tocar, la hoja', () => {
  const h = ayudas();
  const v = vistaMaterias(h, avance());
  const fichas = v.nodo.clase('tb-ficha');
  assert.equal(fichas.filter(x => !/\boral\b/.test(x.atributos.class)).length, 11);
  assert.equal(fichas.filter(x => x.etiqueta === 'button' && !/\boral\b/.test(x.atributos.class)).length, 3, 'solo las 3 con clases se tocan');
  assert.equal(fichas.filter(x => /\boral\b/.test(x.atributos.class)).length, 1);
  const estado = id => v.nodo.todos(x => x.atributos['data-materia'] === id)[0].atributos.class.match(/\be-(\w+)/)[1];
  assert.deepEqual(['factores_humanos', 'sistemas', 'aerodinamica'].map(estado), ['curso', 'curso', 'sin']);
  v.conExamen(examen());
  assert.deepEqual(['factores_humanos', 'sistemas', 'aerodinamica'].map(estado), ['falla', 'curso', 'sin']);
  // La hoja de Factores humanos: los temas como puntos, acierto y visto, «Te falla: La hipoxia» y los 3 botones.
  v.nodo.todos(x => x.atributos['data-materia'] === 'factores_humanos')[0].eventos.click();
  const hoja = h.hojas.at(-1);
  assert.equal(hoja.titulo, 'Factores humanos');
  const c = hoja.cuerpo;
  assert.equal(c.clase('tb-punto').length, 2);
  assert.match(c.textContent, /Te falla:\s+La hipoxia/);
  assert.deepEqual(c.todos(x => x.etiqueta === 'progress').map(x => x.atributos.value), ['60', '100']);
  assert.deepEqual(c.todos(x => x.etiqueta === 'a').map(x => x.atributos.href), ['#tema/factores_humanos/hipoxia', '#tema/factores_humanos/hipoxia', '#examen/factores_humanos']);
  // La de Sistemas (está ahí): «Estudiar» va al tema de ahora; sin flojos, sin «Reforzar».
  v.nodo.todos(x => x.atributos['data-materia'] === 'sistemas')[0].eventos.click();
  assert.deepEqual(h.hojas.at(-1).cuerpo.todos(x => x.etiqueta === 'a').map(x => x.atributos.href), ['#tema/sistemas/helice', '#examen/sistemas']);
  // Un tema cerrado nunca es un enlace: «Estudiar» va al primero que puede abrir (del servidor); sin ninguno, no hay.
  const h2 = { ...ayudas(), abierto: (m, t) => !(m === 'sistemas' && t === 'helice') };
  const v2 = vistaMaterias(h2, avance());
  v2.conExamen(examen());
  v2.nodo.todos(x => x.atributos['data-materia'] === 'sistemas')[0].eventos.click();
  assert.deepEqual(h2.hojas.at(-1).cuerpo.todos(x => x.etiqueta === 'a').map(x => x.atributos.href), ['#tema/sistemas/motor', '#examen/sistemas']);
  const v3 = vistaMaterias(h2, avance());
  v3.conExamen({ ...examen(), materias: examen().materias.map(m => ({ ...m, empezar: null })) });
  v3.nodo.todos(x => x.atributos['data-materia'] === 'sistemas')[0].eventos.click();
  assert.deepEqual(h2.hojas.at(-1).cuerpo.todos(x => x.etiqueta === 'a').map(x => x.atributos.href), ['#examen/sistemas']);
  assert.equal(vistaHero(h2, carrera()).clase('tb-ahora')[0].atributos.href, '#inicio', '«Ahora en» a un tema cerrado: al Camino');
  // Un capítulo del oral: sus rutas del oral.
  v.nodo.todos(x => x.atributos['data-materia'] === 'oral_calificaciones')[0].eventos.click();
  assert.deepEqual(h.hojas.at(-1).cuerpo.todos(x => x.etiqueta === 'a').map(x => x.atributos.href), ['#oral/tema/oral_calificaciones/t2', '#oral/examen/oral_calificaciones']);
  assert.doesNotMatch(v.nodo.textContent + c.textContent, /\bnull\b|undefined|NaN|\{[a-z_]+\}/);
});

test('«¿Tomo el examen final?» en UNA tarjeta: veredicto, dos barras contra la meta, «Te falta» (2) y «Ver por materia»', () => {
  const h = ayudas();
  let abierta = 0;
  const n = vistaExamenResumen(h, examen(), { alVerMaterias: () => { abierta += 1; } });
  assert.equal(n.clase('tb-veredicto')[0].textContent, 'Todavía no');
  assert.deepEqual(n.todos(x => x.etiqueta === 'progress').map(x => [x.atributos.value, x.atributos['aria-label']]), [['60', 'Acierto 60 % (meta 90)'], ['40', 'Visto 40 % (meta 95)']]);
  assert.equal(n.clase('tb-falta')[0].textContent.replace(/\s+/g, ' ').trim(), 'Te falta: exámenes con 90 % (faltan 2) · 4 errores por repasar');
  assert.equal(n.clase('tb-materia').length, 0, 'sin la lista larga por materia');
  n.clase('tb-por-materia')[0].eventos.click();
  assert.equal(abierta, 1);
  const si = vistaExamenResumen(h, { oficial: { si: true, acierto: 95, cobertura: 97, porques: [{ clave: 'acierto.ok' }] } });
  assert.equal(si.clase('tb-veredicto')[0].textContent, '¡Listo!');
  assert.equal(si.clase('tb-falta').length, 0);
  assert.equal(vistaExamenResumen(h, null), null);
});

test('app.js: el tablero en su orden y «Ver detalles» con TODO lo de antes; sin innerHTML ni style en línea; las claves en los dos idiomas', () => {
  const app = readFileSync(join(RAIZ, 'public/app.js'), 'utf8');
  const pantalla = app.slice(app.indexOf('async function pantallaProgreso()'), app.indexOf('function detallesProgreso('));
  assert.match(pantalla, /el\('div', \{ class: 'tablero' \}, hero, carrera\?\.nodo \?\? null, numeros, materias\?\.nodo \?\? null, lugarExamen\)/);
  assert.match(pantalla, /vistaCarrera\(ayudas, datosCarrera, \{ compacta: true/);
  assert.doesNotMatch(pantalla, /tutorUi\(\)\.examen\(\)/, 'la lista larga del examen ya no va arriba');
  const detalles = app.slice(app.indexOf('function detallesProgreso('), app.indexOf('// 0.12.0: lo EXTRA va aparte'));
  for (const x of ['tabla,', "class: 'panel mi-avance'", 'examen,', 'panelCurso(', 'botonRepaso(', 'instructorUi().preparado()', 'panelRepasoResumen(', 'instructorUi().loQueHicimos()', 'panelPlan(', 'grupo,', 'panelExtra(', 'panelOral(']) assert.ok(detalles.includes(x), `«Ver detalles» sin ${x}`);
  assert.match(pantalla, /detallesProgreso\(p, ayudas, grupo, \{ tabla, miAvance, examen: lugarExamenDetalle \}\)/);
  assert.match(pantalla, /reemplazar\(lugarExamenDetalle, tutorUi\(\)\.pintarExamen\(x\.datos\)\)/);
  for (const archivo of ['public/progreso-tablero.js', 'public/carrera-vista.js']) {
    assert.doesNotMatch(readFileSync(join(RAIZ, archivo), 'utf8'), /innerHTML|outerHTML|insertAdjacentHTML|setAttribute\(\s*['"]style['"]|[{,]\s*style\s*:/, archivo);
  }
  const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
  const usadas = new Set([...readFileSync(join(RAIZ, 'public/progreso-tablero.js'), 'utf8').matchAll(/'(tablero\.[a-z_.]+)'/g)].map(m => m[1]));
  for (const k of [...usadas, ...['lista', 'curso', 'sin', 'falla', 'pronto'].map(e => `tablero.estado.${e}`), ...['constancia', 'fallas', 'clases', 'memoria', 'tiempo', 'acierto', 'cobertura'].map(e => `tablero.falta.${e}`)]) {
    assert.ok(es[k] && en[k], k);
  }
});
