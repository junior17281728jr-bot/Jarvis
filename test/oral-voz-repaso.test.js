// Academia 0.14.108 (pedido del dueño: «escuchar en vez de leer»): la voz en el oral del Repaso final («Examen oral: todo
// lo que te pueden preguntar»). Lo que se prueba, sin red ni claves y con una voz de MENTIRA (relojes de mentira también):
//  - «Con voz / Sin voz» se ve junto a la tarjeta y usa la misma preferencia de Configuración (se guarda en su cuenta);
//  - con voz, la pregunta se lee al aparecer y la respuesta al tocar «Ver respuesta»; «Leer otra vez» repite;
//  - apagar la voz calla YA y nada más suena; salir de la pantalla también calla;
//  - con «Inglés original» se lee el inglés; sin claves, la voz del teléfono (speechSynthesis) lee todo;
//  - si el iPhone no deja sonar sin un toque, «Toca para escuchar» (nunca un silencio sin explicación);
//  - «Manos libres»: pregunta → 6 s con su cuenta → respuesta → 2 s → la siguiente, sin marcarla; «La sabía» en cualquier
//    momento; apagarlo (o la voz) corta la vuelta;
//  - los textos del oral (libro_qa y adicionales) están en la lista que se puede grabar y guardar para todos.
// Paquetes de MUESTRA (todo inventado: test/oral-muestra.js y test/academia-muestra.js).
import { configDePrueba, conServidor, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { tarjetasOral } from '../src/academia/repaso-final.js';
import { buscarTexto } from '../src/academia/voz-textos.js';
import { paqueteActivo } from '../src/academia/paquetes.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { rondaOralFinal, piezasPregunta, piezasRespuesta, PAUSA_PENSAR, PAUSA_SIGUIENTE } from '../public/repaso-final-vista.js';
import { crearLector, ESPERA_INICIO } from '../public/voz-lectura.js';
import { TEMAS_ALUMNO } from '../public/guia.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const vista = readFileSync(join(RAIZ, 'public/repaso-final-vista.js'), 'utf8');
const appJs = readFileSync(join(RAIZ, 'public/app.js'), 'utf8');
const nada = () => new Promise(listo => setImmediate(listo));

// ---------- Un DOM de mentira (lo justo para la vista) ----------
class Nodo {
  constructor(etiqueta) {
    this.etiqueta = etiqueta; this.hijos = []; this.atributos = {}; this.on = {}; this.hidden = false; this.disabled = false; this.dataset = {}; this.isConnected = true;
    this.classList = { add: c => this.setAttribute('class', `${this.atributos.class ?? ''} ${c}`.trim()), remove: c => this.setAttribute('class', this.clases.filter(x => x !== c).join(' ')),
      toggle: (c, si) => (si ? this.classList.add(c) : this.classList.remove(c)) };
  }
  append(...xs) { for (const x of xs) { if (x == null) throw new Error('append(null)'); this.hijos.push(x instanceof Nodo ? x : String(x)); } }
  replaceChildren(...xs) { this.hijos = []; this.append(...xs); }
  setAttribute(k, v) {
    this.atributos[k] = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = String(v);
  }
  getAttribute(k) { return this.atributos[k] ?? null; }
  addEventListener(e, f) { this.on[e] = f; }
  click() { return this.on.click?.({ currentTarget: this, preventDefault() {}, stopPropagation() {} }); }
  get clases() { return (this.atributos.class ?? '').split(/\s+/).filter(Boolean); }
  todos(f) { const r = []; const ir = n => { for (const h of n.hijos) if (h instanceof Nodo) { if (f(h)) r.push(h); ir(h); } }; ir(this); return r; }
  conClase(c) { return this.todos(n => n.clases.includes(c)); }
  get textContent() { return this.hijos.map(h => (typeof h === 'string' ? h : h.textContent)).join(' '); }
  set textContent(v) { this.hijos = [String(v)]; }
}
const visible = n => { for (let x = n; x; x = x.padre) if (x.hidden) return false; return true; };

// La ventana de mentira: hashchange/pagehide y scrollTo. La voz del teléfono de mentira cuando se pide.
function ventana() {
  const oyentes = {};
  globalThis.window = {
    scrollTo() {},
    addEventListener: (e, f) => { (oyentes[e] ??= new Set()).add(f); },
    removeEventListener: (e, f) => { oyentes[e]?.delete(f); },
    disparar: e => { for (const f of [...(oyentes[e] ?? [])]) f(); },
    oyentes,
  };
  globalThis.document = { documentElement: { dataset: {} }, querySelectorAll: () => [] };
  return globalThis.window;
}

// Relojes de mentira: avanzar(ms) corre lo que vence.
function relojes() {
  let ahora = 0; let n = 0;
  const lista = new Map();
  return {
    poner: (f, ms) => { lista.set(++n, { f, en: ahora + ms }); return n; },
    quitar: id => { lista.delete(id); },
    async avanzar(ms) {
      const fin = ahora + ms;
      for (;;) {
        const [id, x] = [...lista].filter(([, y]) => y.en <= fin).sort((a, b) => a[1].en - b[1].en)[0] ?? [];
        if (!id) break;
        lista.delete(id); ahora = x.en; x.f(); await nada();
      }
      ahora = fin;
      await nada();
    },
    pendientes: () => lista.size,
  };
}

// La voz de mentira: anota lo que se pide leer; cada leer() termina cuando la prueba quiere (o al momento).
function lectorFalso({ solo = true, resultado = true } = {}) {
  const leidos = []; const esperando = [];
  let callados = 0;
  return {
    leidos, esperando, get callados() { return callados; },
    resultado,
    leer(piezas) { leidos.push(piezas.map(p => `${p.lang}:${p.texto}`).join(' | ')); return solo ? Promise.resolve(this.resultado) : new Promise(listo => esperando.push(listo)); },
    callar() { callados += 1; },
    terminar(ok = true) { esperando.shift()?.(ok); },
  };
}

function ayudas({ lector, encendida = true, poner = null, reloj = relojes() } = {}) {
  const t = (clave, vars = {}) => (es[clave] ?? `¿${clave}?`).replace(/\{(\w+)\}/g, (_, n) => (n in vars ? String(vars[n]) : `{${n}}`));
  const tn = (clave, vars = {}) => (Number(vars.n) === 1 && es[`${clave}.uno`] ? t(`${clave}.uno`, vars) : t(clave, vars));
  const el = (etiqueta, props = {}, ...hijos) => {
    const n = new Nodo(etiqueta);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'texto') n.textContent = v;
      else if (k === 'hidden') n.hidden = true;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos.flat(Infinity)) if (h != null && h !== false) n.append(h);
    return n;
  };
  const talCual = (etiqueta, texto, clase = '') => el(etiqueta, { class: `tal-cual ${clase}`.trim(), texto: texto ?? '' });
  const api = async (metodo, ruta, datos) => { api.pedidos.push({ metodo, ruta, datos }); return { ok: true, datos: {} }; };
  api.pedidos = [];
  let guardada = encendida;
  const estado = { raiz: null, avisos: [] };
  const h = {
    el, t, tn, talCual, numero: n => String(n), icono: () => el('svg'), nombreMateria: id => id, sonar: () => {}, celebrar: () => {},
    api, avisar: (texto, tono) => estado.avisos.push([texto, tono]), textoError: x => String(x), usuario: 1,
    mostrar: r => { estado.raiz = r; },
    marcoEstudio: ({ cuerpo, pie }) => el('div', { class: 'inmersivo' }, el('main', {}, cuerpo), el('footer', {}, pie)),
    combustible: () => ({ nodo: el('div'), poner() {} }),
    botonGrande: (texto, alPulsar) => el('button', { type: 'button', class: 'boton-3d grande', onclick: alPulsar }, el('span', { texto })),
    vistaVisual: null,
    voz: { lector, encendida: () => guardada, poner: poner ?? (async si => { guardada = si; return { ok: true, datos: { voz: si } }; }) },
    reloj,
  };
  return { h, estado, reloj, api, guardada: () => guardada };
}
const CARTAS = [
  { id: 'm/t/q0', materia: 'm', capitulo: 1, tema: 't', temaTitulo: 'Tema', libro: 'Libro', n: 1, adicional: false, pagina: 3,
    pregunta_en: 'Who may a private pilot carry?', pregunta_es: '¿A quién puede llevar un piloto privado?', respuesta_en: 'Friends, never for hire.', respuesta_es: 'Amigos, nunca por pago.' },
  { id: 'm/t/q1', materia: 'm', capitulo: 1, tema: 't', temaTitulo: 'Tema', libro: 'Libro', n: 2, adicional: false, pagina: 4,
    pregunta_en: 'How often must you fly with an instructor?', pregunta_es: null, respuesta_en: 'Every 24 calendar months.', respuesta_es: null },
  { id: 'm/t/a0', materia: 'm', capitulo: 1, tema: 't', temaTitulo: 'Tema', libro: 'Libro', n: null, adicional: true, pagina: 5,
    pregunta_en: 'Describe your night minimums.', pregunta_es: 'Describe tus mínimos de noche.', respuesta_en: null, respuesta_es: null },
];
const datos = () => ({ tarjetas: CARTAS.map(x => ({ ...x })), marcas: {} });
// Los botones por su texto.
const boton = (raiz, texto) => raiz.todos(n => n.etiqueta === 'button' && n.textContent.replace(/\s+/g, ' ').trim() === texto)[0] ?? null;
const pregunta = raiz => raiz.conClase('oral-qa-pregunta').map(n => n.textContent.trim()).join(' / ');
const presionado = (raiz, valor) => raiz.todos(n => n.dataset.valor === valor)[0]?.getAttribute('aria-pressed');

test('«Con voz / Sin voz» se ve junto a la tarjeta, usa la preferencia de Configuración y se guarda; los modos solo con voz', async () => {
  ventana();
  const lector = lectorFalso();
  const a = ayudas({ lector, encendida: false });
  rondaOralFinal(datos(), null, a.h);
  const raiz = a.estado.raiz;
  const barra = raiz.conClase('rf-voz')[0];
  assert.ok(barra, 'la barra de la voz está en la pantalla');
  assert.ok(boton(raiz, 'Con voz') && boton(raiz, 'Sin voz'));
  assert.equal(presionado(raiz, 'no'), 'true', 'empieza como la tiene guardada (Sin voz)');
  assert.equal(raiz.conClase('rf-voz-modo')[0].hidden, true, '«Tú controlas / Manos libres» solo con voz');
  assert.deepEqual(lector.leidos, [], 'sin voz no suena nada');
  // Encender: suena ya (dentro del toque) y se guarda en su cuenta.
  boton(raiz, 'Con voz').click();
  await nada();
  assert.equal(a.guardada(), true, 'se guarda (la misma preferencia de Configuración)');
  assert.equal(presionado(raiz, 'si'), 'true');
  assert.equal(raiz.conClase('rf-voz-modo')[0].hidden, false);
  assert.equal(presionado(raiz, 'tu'), 'true', '«Tú controlas» es lo de siempre');
  assert.equal(raiz.conClase('rf-voz-linea')[0].textContent, es['rf.voz.tu.linea']);
  assert.deepEqual(lector.leidos, ['es:¿A quién puede llevar un piloto privado?']);
  // Otra vez en la pantalla: ya dice «Con voz».
  const b = ayudas({ lector: lectorFalso(), encendida: true });
  rondaOralFinal(datos(), null, b.h);
  assert.equal(presionado(b.estado.raiz, 'si'), 'true');
  // Si no se pudo guardar, vuelve atrás y avisa.
  const c = ayudas({ lector: lectorFalso(), encendida: false, poner: async () => ({ ok: false, datos: { error: 'sin_red' } }) });
  rondaOralFinal(datos(), null, c.h);
  boton(c.estado.raiz, 'Con voz').click();
  await nada();
  assert.equal(presionado(c.estado.raiz, 'no'), 'true');
  assert.deepEqual(c.estado.avisos, [['sin_red', 'mal']]);
});

test('con voz: la pregunta se lee al aparecer, la respuesta después de «Ver respuesta», y «Leer otra vez» repite', async () => {
  ventana();
  const lector = lectorFalso();
  const a = ayudas({ lector });
  rondaOralFinal(datos(), null, a.h);
  const raiz = a.estado.raiz;
  assert.deepEqual(lector.leidos, ['es:¿A quién puede llevar un piloto privado?'], 'la pregunta, al aparecer');
  boton(raiz, 'Ver respuesta').click();
  await nada();
  assert.deepEqual(lector.leidos.slice(1), ['es:Amigos, nunca por pago.'], 'la respuesta, después de «Ver respuesta»');
  boton(raiz, 'Leer otra vez').click();
  assert.equal(lector.leidos.at(-1), 'es:Amigos, nunca por pago.');
  // «Tú controlas»: no pasa sola.
  await a.reloj.avanzar(60_000);
  assert.equal(lector.leidos.length, 3);
  // La sabía → la siguiente (sin español: el inglés tal cual, en inglés).
  boton(raiz, 'La sabía').click();
  await nada();
  assert.equal(lector.leidos.at(-1), 'en:How often must you fly with an instructor?');
  boton(raiz, 'Ver respuesta').click();
  assert.equal(lector.leidos.at(-1), 'en:Every 24 calendar months.');
  assert.deepEqual(a.api.pedidos.map(p => p.ruta), ['/api/academia/repaso-final/oral/marcar']);
});

test('apagar la voz calla al momento y nada más suena; salir de la pantalla también calla', async () => {
  const w = ventana();
  const lector = lectorFalso({ solo: false });
  const a = ayudas({ lector });
  rondaOralFinal(datos(), null, a.h);
  const raiz = a.estado.raiz;
  assert.equal(lector.leidos.length, 1);
  const antes = lector.callados;
  boton(raiz, 'Sin voz').click();
  assert.ok(lector.callados > antes, 'se calla en el mismo toque');
  lector.terminar(true);
  await nada();
  boton(raiz, 'Ver respuesta').click();
  await a.reloj.avanzar(30_000);
  assert.equal(lector.leidos.length, 1, 'sin voz no se lee la respuesta');
  assert.equal(raiz.conClase('rf-voz-otra')[0].hidden, true, 'sin voz no hay «Leer otra vez»');
  // Salir (otra pantalla): se calla y deja de escuchar.
  const b = ayudas({ lector: lectorFalso({ solo: false }) });
  rondaOralFinal(datos(), null, b.h);
  const l2 = b.h.voz.lector;
  const c0 = l2.callados;
  w.disparar('hashchange');
  assert.ok(l2.callados > c0, 'salir calla');
  l2.terminar(true);
  await nada();
  assert.equal(l2.leidos.length, 1);
});

test('con «Inglés original» se lee el inglés; con «Español», el español (y el inglés si aún no hay traducción)', async () => {
  ventana();
  assert.deepEqual(piezasPregunta(CARTAS[0], 'en'), [{ texto: CARTAS[0].pregunta_en, lang: 'en' }]);
  assert.deepEqual(piezasPregunta(CARTAS[0], 'es'), [{ texto: CARTAS[0].pregunta_es, lang: 'es' }]);
  assert.deepEqual(piezasRespuesta(CARTAS[0], 'en'), [{ texto: CARTAS[0].respuesta_en, lang: 'en' }]);
  assert.deepEqual(piezasRespuesta(CARTAS[1], 'es'), [{ texto: CARTAS[1].respuesta_en, lang: 'en' }]);
  assert.deepEqual(piezasRespuesta(CARTAS[2], 'es', 'sin'), [{ texto: 'sin', lang: 'es' }]);
  // En la pantalla: lo que se VE (data-oral-idioma, lo mismo que esconde la otra versión).
  const lector = lectorFalso();
  const a = ayudas({ lector });
  globalThis.document.documentElement.dataset.oralIdioma = 'en';
  globalThis.localStorage = { getItem: () => 'en', setItem() {} };
  try {
    rondaOralFinal(datos(), null, a.h);
    assert.deepEqual(lector.leidos, ['en:Who may a private pilot carry?']);
    boton(a.estado.raiz, 'Ver respuesta').click();
    assert.equal(lector.leidos.at(-1), 'en:Friends, never for hire.');
  } finally { delete globalThis.localStorage; }
});

test('sin claves: la voz del teléfono lee la pregunta y la respuesta (el servidor dice «no» y nada se queda callado)', async () => {
  ventana();
  const dichos = [];
  globalThis.window.SpeechSynthesisUtterance = class { constructor(texto) { this.text = texto; } };
  globalThis.window.speechSynthesis = {
    speaking: false, pending: false, getVoices: () => [{ lang: 'es-ES' }, { lang: 'en-US' }], cancel() {},
    speak(u) { if (!u.text) return; dichos.push(`${u.lang}:${u.text}`); setImmediate(() => { u.onstart?.(); u.onend?.(); }); },
  };
  const pedidos = [];
  const apiSinClaves = async (m, ruta, d) => { pedidos.push(d.textos); return { ok: true, datos: { partes: d.textos.map(() => ({ estado: 'no' })) } }; };
  const lector = crearLector(apiSinClaves);
  const a = ayudas({ lector });
  rondaOralFinal(datos(), null, a.h);
  for (let i = 0; i < 5; i++) await nada();
  assert.deepEqual(dichos, ['es-ES:¿A quién puede llevar un piloto privado?']);
  boton(a.estado.raiz, 'Ver respuesta').click();
  for (let i = 0; i < 5; i++) await nada();
  assert.deepEqual(dichos.slice(1), ['es-ES:Amigos, nunca por pago.']);
  assert.deepEqual(pedidos, [['¿A quién puede llevar un piloto privado?'], ['Amigos, nunca por pago.']], 'cada texto tal cual del paquete (así se reconoce para grabarlo)');
  assert.equal(a.estado.raiz.conClase('rf-voz-toca').length, 0, 'sonó: sin «Toca para escuchar»');
  delete globalThis.window.speechSynthesis;
});

test('si el iPhone no deja sonar sin un toque: «Toca para escuchar», y al tocar se lee', async () => {
  ventana();
  const lector = lectorFalso({ resultado: false });
  const a = ayudas({ lector });
  rondaOralFinal(datos(), null, a.h);
  await nada();
  const toca = boton(a.estado.raiz, 'Toca para escuchar');
  assert.ok(toca, 'se ofrece el botón');
  lector.resultado = true;
  toca.click();
  await nada();
  assert.equal(lector.leidos.length, 2);
  assert.equal(lector.leidos[1], lector.leidos[0]);
  assert.equal(boton(a.estado.raiz, 'Toca para escuchar'), null);
});

// La voz del teléfono de mentira: con «permitido» en false, speak() no hace nada (como un iPhone sin un toque).
function vozTelefono() {
  const v = { permitido: false, dichos: [], cancelados: 0, ultima: null };
  globalThis.window.SpeechSynthesisUtterance = class { constructor(texto) { this.text = texto; } };
  globalThis.window.speechSynthesis = {
    speaking: false, pending: false, getVoices: () => [], cancel() { v.cancelados += 1; },
    speak(u) { if (!u.text) return; v.dichos.push(u.text); v.ultima = u; if (v.permitido) queueMicrotask(() => u.onstart?.()); },
  };
  return v;
}
const sinClaves = async (m, ruta, d) => ({ ok: true, datos: { partes: d.textos.map(() => ({ estado: 'no' })) } });

test('el iPhone de verdad: si la voz del teléfono no empieza en 4 s, la lectura dice que no sonó y aparece «Toca para escuchar»', async t => {
  ventana();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const v = vozTelefono();
    const lector = crearLector(sinClaves);
    const a = ayudas({ lector });
    rondaOralFinal(datos(), null, a.h);
    for (let i = 0; i < 5; i++) await nada();
    assert.deepEqual(v.dichos, ['¿A quién puede llevar un piloto privado?']);
    assert.equal(boton(a.estado.raiz, 'Toca para escuchar'), null, 'todavía esperando');
    t.mock.timers.tick(ESPERA_INICIO);
    for (let i = 0; i < 5; i++) await nada();
    const toca = boton(a.estado.raiz, 'Toca para escuchar');
    assert.ok(toca, 'nunca un silencio sin explicación');
    // El toque: ahora sí suena.
    v.permitido = true;
    toca.click();
    for (let i = 0; i < 5; i++) await nada();
    assert.equal(v.dichos.length, 2);
    v.ultima.onend();
    for (let i = 0; i < 5; i++) await nada();
    assert.equal(boton(a.estado.raiz, 'Toca para escuchar'), null);
  } finally { delete globalThis.window.speechSynthesis; }
});

test('el vigía de una lectura vieja no calla la nueva (la del toque sigue sonando)', async t => {
  ventana();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const v = vozTelefono();
    const lector = crearLector(sinClaves);
    const vieja = lector.leer([{ texto: 'Primera', lang: 'es' }]);
    for (let i = 0; i < 5; i++) await nada();
    v.permitido = true;
    const nueva = lector.leer([{ texto: 'Segunda', lang: 'es' }]);
    for (let i = 0; i < 5; i++) await nada();
    const cancelados = v.cancelados;
    t.mock.timers.tick(ESPERA_INICIO);
    for (let i = 0; i < 5; i++) await nada();
    assert.equal(v.cancelados, cancelados, 'el vigía viejo no cancela la voz nueva');
    assert.equal(await vieja, false);
    v.ultima.onend();
    assert.equal(await nueva, true, 'la nueva sonó entera');
  } finally { delete globalThis.window.speechSynthesis; }
});

test('«Manos libres»: pregunta → 6 s con su cuenta → respuesta → 2 s → la siguiente, sin marcarla; hasta el final', async () => {
  ventana();
  assert.equal(PAUSA_PENSAR, 6);
  assert.equal(PAUSA_SIGUIENTE, 2000);
  const lector = lectorFalso({ solo: false });
  const a = ayudas({ lector });
  rondaOralFinal(datos(), null, a.h);
  const raiz = a.estado.raiz;
  lector.terminar(); await nada();
  assert.equal(presionado(raiz, 'tu'), 'true', 'apagado al empezar');
  boton(raiz, 'Manos libres').click(); // el toque: vuelve a leer la pregunta y sigue solo
  assert.equal(raiz.conClase('rf-voz-linea')[0].textContent, es['rf.voz.libres.linea']);
  assert.deepEqual(lector.leidos, ['es:¿A quién puede llevar un piloto privado?', 'es:¿A quién puede llevar un piloto privado?']);
  assert.ok(boton(raiz, 'La sabía'), 'con manos libres se puede marcar ya en la pregunta');
  lector.terminar(); await nada();
  const cuenta = raiz.conClase('rf-voz-cuenta')[0];
  assert.equal(cuenta.hidden, false);
  assert.equal(cuenta.textContent, 'Respuesta en 6 s');
  await a.reloj.avanzar(3000);
  assert.equal(cuenta.textContent, 'Respuesta en 3 s');
  assert.equal(raiz.conClase('rf-oral-respuesta').length, 0, 'aún pensando');
  await a.reloj.avanzar(3000);
  assert.equal(raiz.conClase('rf-oral-respuesta').length, 1, 'a los 6 s, la respuesta');
  assert.equal(lector.leidos.at(-1), 'es:Amigos, nunca por pago.');
  await a.reloj.avanzar(10_000);
  assert.equal(pregunta(raiz).includes('instructor'), false, 'no pasa mientras la respuesta suena');
  lector.terminar(); await nada();
  await a.reloj.avanzar(1999);
  assert.equal(pregunta(raiz).includes('instructor'), false);
  await a.reloj.avanzar(1);
  assert.match(pregunta(raiz), /instructor/, 'a los 2 s, la siguiente');
  assert.equal(lector.leidos.at(-1), 'en:How often must you fly with an instructor?');
  assert.deepEqual(a.api.pedidos, [], 'pasar sola no marca «La sabía» ni «No la sabía»');
  // Las dos que quedan, solas; la última no trae respuesta del libro: se lee la línea que se ve.
  for (let i = 0; i < 2; i++) { lector.terminar(); await nada(); await a.reloj.avanzar(6000); lector.terminar(); await nada(); await a.reloj.avanzar(2000); }
  assert.equal(lector.leidos.at(-1), `es:${es['rf.oral.sin_respuesta']}`);
  assert.equal(raiz.conClase('rf-oral-respuesta').length, 0);
  assert.match(raiz.textContent, new RegExp(es['rf.oral.fin.vuelta']), 'al final: «Terminaste la vuelta» (no «¡Te las sabes todas!»)');
  assert.ok(boton(raiz, es['rf.oral.fin.seguir']));
  assert.equal(a.reloj.pendientes(), 0, 'nada queda esperando');
});

test('«Manos libres»: «La sabía» en la cuenta marca y pasa una sola vez; apagar Manos libres o la voz corta la vuelta', async () => {
  ventana();
  const lector = lectorFalso();
  const a = ayudas({ lector });
  rondaOralFinal(datos(), null, a.h);
  const raiz = a.estado.raiz;
  boton(raiz, 'Manos libres').click();
  await nada();
  await a.reloj.avanzar(2000); // pensando
  boton(raiz, 'La sabía').click();
  await nada(); await nada();
  assert.deepEqual(a.api.pedidos.map(p => p.datos), [{ tarjeta: 'm/t/q0', sabia: true }]);
  assert.match(pregunta(raiz), /instructor/);
  await a.reloj.avanzar(6000);
  assert.equal(raiz.conClase('rf-oral-respuesta').length, 1);
  await a.reloj.avanzar(2000);
  assert.match(pregunta(raiz), /night/, 'una tarjeta por vez (nada se saltó)');
  // Apagar «Manos libres» en la cuenta: se queda en la pregunta.
  const leidas = lector.leidos.length;
  const c0 = lector.callados;
  boton(raiz, 'Tú controlas').click();
  assert.ok(lector.callados > c0, 'se calla ya');
  await a.reloj.avanzar(60_000);
  assert.equal(raiz.conClase('rf-oral-respuesta').length, 0, 'ya no sigue sola');
  assert.equal(lector.leidos.length, leidas);
  assert.equal(a.reloj.pendientes(), 0);
  // Otra vez encendido y después «Sin voz»: igual se corta.
  boton(raiz, 'Manos libres').click();
  await nada();
  await a.reloj.avanzar(3000);
  boton(raiz, 'Sin voz').click();
  await a.reloj.avanzar(60_000);
  assert.equal(raiz.conClase('rf-oral-respuesta').length, 0);
  assert.equal(a.reloj.pendientes(), 0);
  assert.equal(raiz.conClase('rf-voz-modo')[0].hidden, true);
});

test('los textos del oral (libro_qa y adicionales) se pueden grabar y guardar; la preferencia se guarda en su cuenta; sin claves, la voz del teléfono', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { azar: () => 0.5, reloj: () => Date.parse('2026-11-23T14:00:00Z') } });
  const oral = paqueteOralMuestra();
  const t0 = oral.materias[0].temas[0];
  t0.libro_qa[0].pregunta_es = '¿A quién puede llevar un piloto privado de la muestra?';
  t0.libro_qa[0].respuesta_es = 'Un piloto privado de la muestra puede llevar amigos, pero nunca por pago.';
  t0.adicionales[0].pregunta_es = 'Describe tus propios mínimos de la muestra para un vuelo de noche.';
  try {
    await conServidor(servidor, async base => {
      const h = { 'X-Oportia': '1', 'Content-Type': 'application/json' };
      const admin = (await fetch(`${base}/api/primer-admin`, { method: 'POST', headers: { ...h, 'Tailscale-User-Login': 'junior@example.com' }, body: JSON.stringify({ nombre: 'junior', clave: 'una clave bien larga' }) })).headers.get('set-cookie').split(';')[0];
      crearUsuario(db, { nombre: 'ana', claveHash: await hashClave('una clave bien larga'), debeCambiarClave: false });
      const ana = (await fetch(`${base}/api/entrar`, { method: 'POST', headers: h, body: JSON.stringify({ nombre: 'ana', clave: 'una clave bien larga' }) })).headers.get('set-cookie').split(';')[0];
      for (const paquete of [paqueteMuestra(), oral]) {
        const r = await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { ...h, Cookie: admin }, body: JSON.stringify(paquete) }).then(x => x.json());
        assert.ok(r.paquete?.id, JSON.stringify(r));
        for (const archivo of r.faltan ?? []) await fetch(`${base}/api/admin/academia/paquetes/${r.paquete.id}/figuras/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'image/png' }, body: figuraMuestraPng() });
        assert.equal((await fetch(`${base}/api/admin/academia/paquetes/${r.paquete.id}/activar`, { method: 'POST', headers: { ...h, Cookie: admin }, body: '{}' })).status, 200);
      }
      const pedir = async (metodo, ruta, d) => {
        const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { ...h, Cookie: ana }, body: d === undefined ? undefined : JSON.stringify(d) });
        return { codigo: r.status, datos: await r.json() };
      };
      // Cada texto que la pantalla lee está en la lista de lo compartido (el servidor puede grabarlo y guardarlo).
      const p = paqueteActivo(db, config);
      const cartas = tarjetasOral(p);
      assert.ok(cartas.some(x => x.adicional) && cartas.some(x => x.pregunta_es) && cartas.some(x => x.respuesta_en));
      let n = 0;
      for (const x of cartas) {
        for (const k of ['pregunta_es', 'pregunta_en', 'respuesta_es', 'respuesta_en']) {
          if (!x[k]) continue;
          n += 1;
          assert.ok(buscarTexto(p, x[k]), `${x.id} ${k}`);
        }
        for (const idioma of ['es', 'en']) for (const pz of [...piezasPregunta(x, idioma), ...piezasRespuesta(x, idioma)]) assert.ok(buscarTexto(p, pz.texto), `${x.id} ${idioma}`);
      }
      assert.ok(n >= 6);
      // La preferencia: la misma de Configuración, guardada en su cuenta.
      assert.equal((await pedir('GET', '/api/academia/lectura')).datos.voz, false);
      assert.equal((await pedir('POST', '/api/academia/lectura/preferencia', { voz: true })).datos.voz, true);
      assert.equal((await pedir('GET', '/api/academia/lectura')).datos.voz, true, 'se recuerda');
      // Sin claves: «no» para cada texto (la voz del teléfono), y ninguna tarea para un proveedor.
      const d = (await pedir('GET', '/api/academia/repaso-final/oral')).datos;
      const textos = d.tarjetas.slice(0, 4).flatMap(x => [x.pregunta_es ?? x.pregunta_en, x.respuesta_es ?? x.respuesta_en].filter(Boolean));
      const v = await pedir('POST', '/api/academia/lectura/voz', { textos });
      assert.equal(v.codigo, 200);
      assert.deepEqual(v.datos.partes.map(x => x.estado), textos.map(() => 'no'));
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE clave_unica LIKE 'voz:%'").get().n, 0);
    });
  } finally { db.close(); }
});

test('la pantalla: sin innerHTML ni estilos escritos; textos en español y en inglés; la Ayuda del alumno lo explica; la preferencia se lee antes de pintar', () => {
  assert.doesNotMatch(vista, /innerHTML|outerHTML|insertAdjacentHTML|\.style\b|style=/);
  assert.doesNotMatch(vista, /(append|replaceChildren)\([^)]*\? [^:)]+ : null\)/);
  for (const k of ['rf.voz.grupo', 'rf.voz.modo.grupo', 'rf.voz.tu', 'rf.voz.libres', 'rf.voz.tu.linea', 'rf.voz.libres.linea', 'rf.voz.otra_vez', 'rf.voz.toca', 'rf.voz.cuenta', 'rf.voz.como',
    'rf.oral.fin.vuelta', 'rf.oral.fin.faltan', 'rf.oral.fin.faltan.uno', 'rf.oral.fin.seguir', 'ayuda.voz_oral.titulo', 'ayuda.voz_oral.texto']) assert.ok(es[k] && en[k], k);
  assert.equal(es['rf.voz.tu'], 'Tú controlas');
  assert.equal(es['rf.voz.libres'], 'Manos libres');
  assert.match(es['ayuda.voz_oral.texto'], /iPhone/);
  assert.match(en['ayuda.voz_oral.texto'], /iPhone/);
  assert.ok(TEMAS_ALUMNO.includes('voz_oral'), 'en la Ayuda del alumno');
  assert.match(appJs, /queEs\('voz_oral'\)/, '«¿Cómo funciona?» abre la explicación');
  assert.match(appJs, /repaso-final\/oral'\), import\('\.\/repaso-final-vista\.js'\), vozEncendida\(api\)\]/);
  const css = readFileSync(join(RAIZ, 'public/academia.css'), 'utf8');
  assert.match(css, /\.rf-voz-boton \{[^}]*min-height: 44px/);
});
