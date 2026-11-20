// Academia 0.14.84 (pedido de Junior): en toda revisión de una pregunta ya respondida se ven TODAS sus opciones, en su
// orden y con su texto tal cual: la correcta en verde (✓ «Correcta»), la que eligió si es mala en rojo (✗ «Tu respuesta»;
// «Su respuesta» en lo del administrador), las demás sin color; si acertó, «Tu respuesta · Correcta». En Modo reto, las
// opciones que se vieron. El filtro «Solo las que falló / Todas». Y nada de eso viaja antes de responder.
// Usa solo los paquetes de MUESTRA (test/academia-muestra.js, test/oral-muestra.js).
import { configDePrueba, conServidor, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { estadoOpcion, estadosOpciones, opcionesRevisadas, filtroFallas, aplicarFiltro } from '../public/opciones-revision.js';
import { partesClaras } from '../public/respuesta-vista.js';
import { pantallaMiRepaso, pantallaMiniClase } from '../public/mi-repaso-vista.js';
import { revisionVuelta } from '../public/repaso-final-vista.js';
import { revisionOral } from '../public/oral-vista.js';
import { vistaIntento, vistaCompararExamen } from '../public/admin-alumnos.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const ORAL = paqueteOralMuestra();
const DE_ORAL = id => ORAL.preguntas.find(q => q.id === id);
const T0 = Date.parse('2026-11-12T14:00:00Z');
const TEMA1 = { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' };
const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);

// ---------- Un DOM de mentira (lo justo para las vistas) ----------
class Nodo {
  constructor(etiqueta) { this.etiqueta = etiqueta; this.hijos = []; this.atributos = {}; this.on = {}; this.hidden = false; this.dataset = {}; this.style = {}; this.isConnected = true;
    this.classList = { add: c => this.setAttribute('class', `${this.atributos.class ?? ''} ${c}`.trim()), remove: () => {}, toggle: () => {} }; }
  append(...xs) { for (const x of xs) this.hijos.push(x instanceof Nodo ? x : String(x)); }
  prepend(...xs) { this.hijos.unshift(...xs.map(x => (x instanceof Nodo ? x : String(x)))); }
  replaceChildren(...xs) { this.hijos = []; this.append(...xs); }
  replaceWith() {}
  remove() {}
  setAttribute(k, v) {
    this.atributos[k] = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = String(v);
  }
  getAttribute(k) { return this.atributos[k] ?? null; }
  addEventListener(e, f) { this.on[e] = f; }
  get clases() { return (this.atributos.class ?? '').split(/\s+/).filter(Boolean); }
  todos(f) { const r = []; const ir = n => { for (const h of n.hijos) if (h instanceof Nodo) { if (f(h)) r.push(h); ir(h); } }; ir(this); return r; }
  conClase(c) { return this.todos(n => n.clases.includes(c)); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get textContent() { return this.hijos.map(h => (typeof h === 'string' ? h : h.textContent)).join(' '); }
  set textContent(v) { this.hijos = [String(v)]; }
}
globalThis.document ??= { documentElement: { dataset: {} }, querySelectorAll: () => [] };
function ayudas() {
  const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
  const t = (clave, vars = {}) => (es[clave] ?? `¿${clave}?`).replace(/\{(\w+)\}/g, (_, n) => (n in vars ? String(vars[n]) : `{${n}}`));
  const tn = (clave, vars = {}) => (Number(vars.n) === 1 && es[`${clave}.uno`] ? t(`${clave}.uno`, vars) : t(clave, vars));
  const el = (etiqueta, props = {}, ...hijos) => {
    const n = new Nodo(etiqueta);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'texto') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos.flat(Infinity)) if (h != null && h !== false) n.append(h);
    return n;
  };
  const talCual = (etiqueta, texto, clase = '') => el(etiqueta, { class: `tal-cual ${clase}`.trim(), texto: texto ?? '' });
  return { el, t, tn, talCual, numero: n => String(n), icono: () => el('svg'), nombreMateria: id => id, insignia: (_, texto) => el('span', { texto }), vacio: (_, texto) => el('p', { texto }),
    sonar: () => {}, empezarIntento: () => {}, fichaIngles: w => el('span', { texto: w.palabra }), figuraPregunta: () => null, partirTitulo: x => ({ es: String(x ?? '') }),
    fecha: x => String(x), cuando: x => String(x), pctTexto: p => `${p} %`, tarjetaPregunta: q => talCual('p', q.enunciado), verMas: (lista, hijos) => { lista.append(...hijos); return lista; } };
}
// Las opciones dibujadas: [{ letra, estado, clases, texto, sello }] (el sello: lo que dice al lado, o null).
function leer(nodo) {
  return nodo.conClase('op-rev').map(li => ({
    letra: li.dataset.letra, estado: li.dataset.estado, clases: li.clases,
    texto: li.conClase('opcion-texto')[0]?.textContent ?? '', sello: li.conClase('op-rev-sello')[0]?.textContent.replace(/\s+/g, ' ').trim() ?? null,
  }));
}

// ---------- El servidor con la muestra del Test Guide y la del oral ----------
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${base}${ruta}`, opciones);
  return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: (r.headers.get('set-cookie') ?? '').split(';')[0] || null };
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  let ahora = T0;
  const reloj = () => ahora;
  reloj.avanzar = ms => { ahora += ms; };
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  try {
    await conServidor(servidor, async base => {
      const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      const ids = {};
      const alumnos = {};
      for (const nombre of ['ana', 'beto']) {
        ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
        alumnos[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
      }
      for (const p of [MUESTRA, ORAL]) {
        const subir = await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(r => r.json());
        assert.ok(subir.paquete, JSON.stringify(subir).slice(0, 300));
        for (const archivo of subir.faltan ?? []) await fetch(`${base}/api/admin/academia/paquetes/${subir.paquete.id}/figuras/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'image/png' }, body: figuraMuestraPng() });
        assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${subir.paquete.id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
      }
      await fn({ base, db, reloj, admin, ids, ...alumnos });
    });
  } finally { db.close(); }
}
// Un intento: mal las de «malas» (con la letra de «letraMala», o la primera mala), bien las demás.
async function hacer(c, galleta, datos, malas = [], { terminar = true } = {}) {
  const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta, datos })).datos;
  assert.ok(i.id, JSON.stringify(i));
  for (const q of i.preguntas) {
    c.reloj.avanzar(30_000);
    const r = await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: malas.includes(q.id) ? mala(q.id) : DE(q.id).original.correcta } });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
  }
  if (!terminar) return { intento: i };
  const res = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} })).datos;
  return { intento: i, res };
}
const textosDe = id => DE(id).original.opciones.map(o => [o.letra, o.texto]);

// ---------- 1. Las clases: correcta / la suya / neutra ----------
test('el estado de cada opción: con un error, la correcta, la suya (mala) y la de más sin color; con un acierto, la suya en verde y las demás sin color; sin responder, solo la correcta', () => {
  const opciones = [{ letra: 'A', texto: 'Uno' }, { letra: 'B', texto: 'Dos' }, { letra: 'C', texto: 'Tres' }];
  assert.deepEqual(estadosOpciones(opciones, { correcta: 'A', elegida: 'B' }).map(o => o.estado), ['correcta', 'mala', 'neutra']);
  assert.deepEqual(estadosOpciones(opciones, { correcta: 'C', elegida: 'C' }).map(o => o.estado), ['neutra', 'neutra', 'bien']);
  assert.deepEqual(estadosOpciones(opciones, { correcta: 'B', elegida: null }).map(o => o.estado), ['neutra', 'correcta', 'neutra']);
  // Sin la correcta (una pregunta sin responder en un intento a medias): ninguna con color.
  assert.deepEqual(estadosOpciones(opciones, {}).map(o => o.estado), ['neutra', 'neutra', 'neutra']);
  assert.equal(estadoOpcion('A', { correcta: 'A', elegida: 'A' }), 'bien');

  const h = ayudas();
  const mal = leer(opcionesRevisadas(opciones, { correcta: 'A', elegida: 'B' }, h));
  assert.deepEqual(mal.map(o => [o.letra, o.texto]), [['A', 'Uno'], ['B', 'Dos'], ['C', 'Tres']], 'todas, en su orden y con su texto');
  assert.deepEqual(mal.map(o => o.clases), [['op-rev', 'op-correcta'], ['op-rev', 'op-mala'], ['op-rev', 'op-neutra']]);
  assert.deepEqual(mal.map(o => o.sello), ['✓ Correcta', '✗ Tu respuesta', null], 'nunca solo el color: la marca y el rótulo; la de más, sin nada');
  const bien = leer(opcionesRevisadas(opciones, { correcta: 'C', elegida: 'C' }, h));
  assert.deepEqual(bien.map(o => o.clases.at(-1)), ['op-neutra', 'op-neutra', 'op-bien']);
  assert.deepEqual(bien.map(o => o.sello), [null, null, '✓ Tu respuesta · Correcta']);
  const su = leer(opcionesRevisadas(opciones, { correcta: 'A', elegida: 'B' }, h, { quien: 'su' }));
  assert.deepEqual(su.map(o => o.sello), ['✓ Correcta', '✗ Su respuesta', null]);
  assert.deepEqual(leer(opcionesRevisadas(opciones, { correcta: 'B', elegida: 'B' }, h, { quien: 'su' })).map(o => o.sello), [null, '✓ Su respuesta · Correcta', null]);
});

// ---------- 2. El filtro ----------
test('el filtro «Solo las que falló / Todas»: al alumno, «Solo las que falló» primero; sin falladas, «Todas»; al administrador, «Todas»', () => {
  const h = ayudas();
  const fila = bien => h.el('li', { 'data-bien': bien ? '1' : '0' });
  const filas = [fila(true), fila(false), fila(true), fila(false)];
  const f = filtroFallas(h, { malas: 2, total: 4, alCambiar: solo => aplicarFiltro(filas, solo) });
  aplicarFiltro(filas, f.solo());
  const [fallas, todas] = f.nodo.hijos;
  assert.equal(f.solo(), true);
  assert.deepEqual([fallas.textContent, todas.textContent], ['Solo las que fallé (2)', 'Todas (4)'], 'primero «Solo las que fallé», después «Todas»');
  assert.deepEqual([fallas.atributos['aria-pressed'], todas.atributos['aria-pressed']], ['true', 'false']);
  assert.deepEqual(filas.map(x => x.hidden), [true, false, true, false]);
  todas.on.click();
  assert.equal(f.solo(), false);
  assert.deepEqual(filas.map(x => x.hidden), [false, false, false, false]);
  assert.deepEqual([fallas.atributos['aria-pressed'], todas.atributos['aria-pressed']], ['false', 'true']);
  fallas.on.click();
  assert.deepEqual(filas.map(x => x.hidden), [true, false, true, false]);
  // Sin falladas: «Todas», y «Solo las que fallé (0)» apagado.
  const cero = filtroFallas(h, { malas: 0, total: 3 });
  assert.equal(cero.solo(), false);
  assert.equal('disabled' in cero.nodo.hijos[0].atributos, true);
  // El administrador: «Solo las que falló», con «Todas» elegido al abrir.
  const admin = filtroFallas(h, { malas: 1, total: 5, quien: 'su', inicial: false });
  assert.equal(admin.solo(), false);
  assert.equal(admin.nodo.hijos[0].textContent, 'Solo las que falló (1)');
  assert.equal(admin.nodo.hijos[1].atributos['aria-pressed'], 'true');
});

// ---------- 3. La práctica y la revisión de un tema: todas las opciones, y nada antes de responder ----------
test('práctica y revisión del tema: antes de responder, ni la correcta ni la elegida; después, la hoja y la revisión traen todas las opciones tal cual, con la correcta, la suya y la de más', async () => {
  await conAcademia(async c => {
    const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: TEMA1 })).datos;
    // Antes de responder: las opciones sí (hay que elegir), la correcta y la elegida no.
    const antes = (await pedir(c.base, 'GET', `/api/academia/intentos/${i.id}`, { galleta: c.ana })).datos;
    for (const q of [...i.preguntas, ...antes.preguntas]) {
      assert.equal(q.respuesta ?? null, null);
      assert.equal(q.opciones.length, 3);
      for (const o of q.opciones) assert.deepEqual(Object.keys(o).sort(), ['letra', 'texto'], 'la opción solo trae su letra y su texto');
      assert.doesNotMatch(JSON.stringify(q), /"correcta"|"elegida"|"acierto"/, `${q.id}: nada de la respuesta antes de responder`);
    }
    // Mal la primera, bien las demás.
    const primera = i.preguntas[0].id;
    for (const q of i.preguntas) {
      const elegida = q.id === primera ? mala(q.id) : DE(q.id).original.correcta;
      const r = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida } })).datos;
      // La hoja de abajo: todas las opciones (en vez de «La correcta» y «Tu respuesta» aparte).
      const h = ayudas();
      const hoja = h.el('div', {}, partesClaras(q, r.respuesta, { enHoja: true }, h));
      const vistas = leer(hoja);
      assert.deepEqual(vistas.map(o => [o.letra, o.texto]), textosDe(q.id), 'todas, en su orden, tal cual');
      const correcta = DE(q.id).original.correcta;
      assert.deepEqual(vistas.map(o => o.estado), ['A', 'B', 'C'].map(l => (l === correcta ? (l === elegida ? 'bien' : 'correcta') : l === elegida ? 'mala' : 'neutra')));
      assert.equal(hoja.conClase('resp-correcta').length, 0, 'ya no «La correcta» aparte');
    }
    const res = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: c.ana, datos: {} })).datos;
    assert.equal(res.revision.length, i.preguntas.length);
    for (const q of res.revision) {
      assert.deepEqual(q.opciones.map(o => [o.letra, o.texto]), textosDe(q.id), `${q.id}: la revisión trae todas las opciones tal cual`);
      assert.equal(q.respuesta.correcta, DE(q.id).original.correcta);
      assert.ok(['A', 'B', 'C'].includes(q.respuesta.elegida));
    }
    const h = ayudas();
    const fallada = leer(opcionesRevisadas(res.revision[0].opciones, res.revision[0].respuesta, h));
    assert.deepEqual(fallada.map(o => o.estado).sort(), ['correcta', 'mala', 'neutra']);
    assert.equal(fallada.find(o => o.estado === 'mala').letra, mala(primera));
    const acertada = leer(opcionesRevisadas(res.revision[1].opciones, res.revision[1].respuesta, h));
    assert.deepEqual(acertada.map(o => o.estado).sort(), ['bien', 'neutra', 'neutra']);
  });
});

// ---------- 4. Modo reto: las opciones que se vieron ----------
test('Modo reto: la revisión muestra las opciones que vio (la correcta tal cual y las 2 nuevas), con la suya en rojo y la correcta en verde', async () => {
  await conAcademia(async c => {
    const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: { tipo: 'reto', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
    assert.ok(i.id, JSON.stringify(i));
    const elegidas = new Map();
    for (const [k, q] of i.preguntas.entries()) {
      assert.equal(q.modo, 'reto');
      const o = DE(q.id).original;
      const buena = q.opciones.find(x => x.texto === o.opciones.find(y => y.letra === o.correcta).texto).letra;
      const letra = k === 0 ? q.opciones.find(x => x.letra !== buena).letra : buena;
      elegidas.set(q.id, { letra, buena });
      const r = await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida: letra } });
      assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    }
    const res = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: c.ana, datos: {} })).datos;
    const h = ayudas();
    for (const q of res.revision) {
      const vio = i.preguntas.find(x => x.id === q.id).opciones;
      assert.deepEqual(q.opciones, vio, `${q.id}: las opciones que vio, en el orden en que las vio`);
      assert.notDeepEqual(q.opciones.map(o => o.texto), DE(q.id).original.opciones.map(o => o.texto), 'no las originales');
      const { letra, buena } = elegidas.get(q.id);
      assert.deepEqual([q.respuesta.elegida, q.respuesta.correcta], [letra, buena]);
      const vistas = leer(opcionesRevisadas(q.opciones, q.respuesta, h));
      assert.deepEqual(vistas.map(o => o.estado), q.opciones.map(o => (o.letra === buena ? (o.letra === letra ? 'bien' : 'correcta') : o.letra === letra ? 'mala' : 'neutra')));
      assert.deepEqual(vistas.map(o => o.texto), vio.map(o => o.texto));
    }
    // La hoja de abajo, igual (con las del reto).
    const q0 = i.preguntas[0];
    const hoja = h.el('div', {}, partesClaras(q0, res.revision[0].respuesta, { enHoja: true }, h));
    assert.deepEqual(leer(hoja).map(o => o.texto), q0.opciones.map(o => o.texto));
    assert.equal(leer(hoja).find(o => o.estado === 'mala').letra, elegidas.get(q0.id).letra);
    // «Mi repaso» de esa pregunta (fallada en Modo reto): las opciones que vio y la letra que vio.
    const d = (await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.ana })).datos;
    const enRepaso = d.errores.flatMap(t => t.conceptos.flatMap(x => x.preguntas)).find(x => x.id === q0.id);
    assert.ok(enRepaso, 'la fallada en Modo reto está en «Mi repaso»');
    assert.deepEqual(enRepaso.opciones, q0.opciones);
    assert.equal(enRepaso.modo, 'reto');
    assert.deepEqual([enRepaso.respuesta.elegida, enRepaso.respuesta.correcta], [elegidas.get(q0.id).letra, elegidas.get(q0.id).buena]);
  });
});

test('«Lo que fallaste en la competencia» (en Mi repaso): todas las opciones, la buena en verde y la suya en rojo; sin tiempo, solo la buena', async () => {
  const { seccionFalladas } = await import('../public/competencia-vista.js');
  const h = ayudas();
  const x = { ronda: 1, id: 'c1', pregunta: '¿Cuál?', opciones: { B: 'Dos', A: 'Uno', C: 'Tres' }, buena: 'A', elegida: 'C', explicacion: 'Porque sí.' };
  const nodo = seccionFalladas([x, { ...x, id: 'c2', elegida: null }], h);
  const [conTuya, sinTiempo] = nodo.conClase('opciones-revisadas').map(leer);
  assert.deepEqual(conTuya.map(o => [o.letra, o.texto, o.estado]), [['A', 'Uno', 'correcta'], ['B', 'Dos', 'neutra'], ['C', 'Tres', 'mala']]);
  assert.deepEqual(sinTiempo.map(o => o.estado), ['correcta', 'neutra', 'neutra']);
});

// ---------- 5. Mi repaso y la mini-clase ----------
test('Mi repaso: cada pregunta fallada con todas sus opciones (la última vez que la falló), la correcta y la suya; nada de las que no respondió; la mini-clase también', async () => {
  await conAcademia(async c => {
    await hacer(c, c.ana, TEMA1, ['muestra-h1', 'muestra-h2', 'muestra-h4']);
    // Un intento empezado y sin responder: sus preguntas no dicen nada.
    const abierto = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.beto, datos: TEMA1 })).datos;
    assert.ok(abierto.id);
    const d = (await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.ana })).datos;
    const preguntas = d.errores.flatMap(t => t.conceptos.flatMap(x => x.preguntas));
    assert.deepEqual(preguntas.map(q => q.id).sort(), ['muestra-h1', 'muestra-h2', 'muestra-h4']);
    for (const q of preguntas) {
      assert.deepEqual(q.opciones.map(o => [o.letra, o.texto]), textosDe(q.id), `${q.id}: todas, tal cual`);
      assert.deepEqual([q.respuesta.elegida, q.respuesta.correcta, q.respuesta.acierto], [mala(q.id), DE(q.id).original.correcta, false]);
    }
    const deBeto = (await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.beto })).datos;
    assert.deepEqual(deBeto.errores, [], 'sin responder, nada');
    assert.doesNotMatch(JSON.stringify(deBeto), /"correcta"|"elegida"/);
    // La pantalla: al abrir una pregunta, sus opciones con la correcta en verde y la suya en rojo.
    const h = ayudas();
    let pantalla = null;
    pantallaMiRepaso(d, { ...h, mostrar: x => { pantalla = x; }, marco: (_, ...x) => h.el('div', {}, ...x), volverAlCamino: () => h.el('a') });
    const listas = pantalla.conClase('opciones-revisadas');
    assert.equal(listas.length, 3);
    for (const l of listas) assert.deepEqual(leer(l).map(o => o.estado).sort(), ['correcta', 'mala', 'neutra']);
    assert.match(pantalla.textContent, /✗ Tu respuesta/);
    // La mini-clase de ese concepto: todas las opciones de la que falló.
    const clave = d.errores[0].conceptos.find(x => x.preguntas.length)?.clave;
    const m = (await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(clave)}`, { galleta: c.ana })).datos;
    assert.equal(m.pregunta.opciones.length, 3);
    assert.deepEqual(m.pregunta.respuesta, { elegida: mala(m.pregunta.id), correcta: DE(m.pregunta.id).original.correcta });
    let mini = null;
    pantallaMiniClase(m, { ...h, mostrar: x => { mini = x; }, marco: (_, ...x) => h.el('div', {}, ...x), partirLeccion: s => s, vistaTarjeta: p => ({ nodo: h.el('article', { texto: p.titulo }) }),
      botonGrande: texto => h.el('button', { texto }), instructorUi: () => ({ explicar: () => null, miniClaseIa: () => null }) });
    assert.deepEqual(leer(mini.conClase('opciones-revisadas')[0]).map(o => o.estado).sort(), ['correcta', 'mala', 'neutra']);
  });
});

// ---------- 6. El oral ----------
test('oral: el examen no trae la respuesta antes de entregar; la revisión trae todas las opciones con la correcta, la suya y la de más, y el filtro', async () => {
  await conAcademia(async c => {
    const e = (await pedir(c.base, 'POST', '/api/academia/oral/examen', { galleta: c.ana, datos: { materia: 'oral_calificaciones' } })).datos;
    assert.ok(e.examen, JSON.stringify(e).slice(0, 300));
    for (const q of e.preguntas) assert.doesNotMatch(JSON.stringify(q), /"correcta"|"elegida"|"acierto"|"explicacion"/, 'nada de la respuesta antes de entregar');
    const respuestas = {};
    e.preguntas.forEach((q, k) => {
      const buena = DE_ORAL(q.id).original.correcta;
      respuestas[q.id] = k === 0 ? ['A', 'B', 'C'].find(l => l !== buena) : buena;
    });
    const x = (await pedir(c.base, 'POST', '/api/academia/oral/examen/entregar', { galleta: c.ana, datos: { examen: e.examen, respuestas } })).datos;
    for (const q of x.revision) {
      assert.deepEqual(q.opciones.map(o => [o.letra, o.texto]), DE_ORAL(q.id).original.opciones.map(o => [o.letra, o.texto]));
      assert.equal(q.elegida, respuestas[q.id]);
    }
    const h = { ...ayudas(), usuario: 1 };
    const nodo = revisionOral(x.revision, h, [q => h.talCual('p', q.explicacion)]);
    const filas = nodo.todos(n => n.etiqueta === 'li' && n.dataset.bien != null);
    assert.equal(filas.length, x.revision.length);
    const estados = filas.map(f => leer(f).map(o => o.estado).sort().join(','));
    assert.equal(estados[0], 'correcta,mala,neutra');
    for (const s of estados.slice(1)) assert.equal(s, 'bien,neutra,neutra');
    if (x.revision.length > 1) {
      assert.deepEqual(filas.map(f => f.hidden), filas.map((_, k) => k !== 0), '«Solo las que fallé» primero');
    }
  });
});

// ---------- 7. Repaso final ----------
test('Repaso final: al terminar la vuelta, la revisión con todas las opciones de cada pregunta (la primera respuesta) y «Solo las que fallé» primero', async () => {
  await conAcademia(async c => {
    const r = (await pedir(c.base, 'POST', '/api/academia/repaso-final/ronda', { galleta: c.ana, datos: {} })).datos;
    assert.ok(r.id, JSON.stringify(r).slice(0, 300));
    for (const q of r.preguntas) assert.doesNotMatch(JSON.stringify(q), /"correcta"|"elegida"/);
    const malas = new Set(r.preguntas.slice(0, 2).map(q => q.id));
    for (const q of r.preguntas) {
      const x = await pedir(c.base, 'POST', `/api/academia/repaso-final/ronda/${r.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida: malas.has(q.id) ? mala(q.id) : DE(q.id).original.correcta } });
      assert.equal(x.codigo, 200, JSON.stringify(x.datos));
    }
    const v = (await pedir(c.base, 'GET', `/api/academia/repaso-final/ronda/${r.id}`, { galleta: c.ana })).datos;
    const nodo = revisionVuelta(v.preguntas, ayudas());
    const filas = nodo.conClase('rf-revision-fila');
    assert.equal(filas.length, r.preguntas.length);
    for (const [k, f] of filas.entries()) {
      const q = v.preguntas[k];
      assert.deepEqual(leer(f).map(o => [o.letra, o.texto]), textosDe(q.id));
      assert.equal(leer(f).map(o => o.estado).sort().join(','), malas.has(q.id) ? 'correcta,mala,neutra' : 'bien,neutra,neutra');
      assert.equal(f.hidden, !malas.has(q.id));
    }
  });
});

// ---------- 8. Lo del administrador ----------
test('administrador: la revisión de un examen del alumno trae todas las opciones con «Su respuesta» y la correcta; sin responder, ninguna con color; «Comparar un examen» marca las malas que eligieron', async () => {
  await conAcademia(async c => {
    const { intento } = await hacer(c, c.ana, TEMA1, ['muestra-h1']);
    const v = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/intentos/${intento.id}`, { galleta: c.admin })).datos;
    assert.ok(v.preguntas?.length, JSON.stringify(v).slice(0, 300));
    for (const q of v.preguntas) assert.deepEqual(q.opciones.map(o => [o.letra, o.texto]), textosDe(q.id));
    const h = ayudas();
    const nodos = h.el('div', {}, vistaIntento(v, h));
    const listas = nodos.conClase('opciones-revisadas');
    assert.equal(listas.length, v.preguntas.length);
    const h1 = v.preguntas.findIndex(q => q.id === 'muestra-h1');
    assert.deepEqual(leer(listas[h1]).filter(o => o.sello).map(o => [o.letra, o.sello]).sort(),
      [[DE('muestra-h1').original.correcta, '✓ Correcta'], [mala('muestra-h1'), '✗ Su respuesta']].sort());
    assert.equal(leer(listas[h1 === 0 ? 1 : 0]).filter(o => o.sello).length, 1, 'acertada: una sola con sello («Su respuesta · Correcta»)');
    assert.match(nodos.textContent, /Su respuesta · Correcta/);
    assert.ok(nodos.conClase('filtro-fallas').length, 'con el filtro «Solo las que falló / Todas»');
    // Un intento a medias: las sin responder sin color (la respuesta no se adelanta).
    const medias = (await hacer(c, c.beto, TEMA1, [], { terminar: false })).intento;
    const vm = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.beto}/intentos/${medias.id}`, { galleta: c.admin })).datos;
    const nm = h.el('div', {}, vistaIntento({ ...vm, preguntas: vm.preguntas.map((q, k) => (k === 0 ? { ...q, respuesta: null } : q)) }, h));
    assert.deepEqual(leer(nm.conClase('opciones-revisadas')[0]).map(o => o.estado), ['neutra', 'neutra', 'neutra']);
    // «Comparar un examen»: la correcta en verde, las malas que alguien eligió en rojo (con cuántos), la de más sin color.
    const d = { materia: 'factores_humanos', alumnos: [], temas: [], preguntas: [{ id: 'muestra-h1', numero: '1', enunciado: DE('muestra-h1').original.enunciado, temaTitulo: 'Tema',
      opciones: DE('muestra-h1').original.opciones.map(o => ({ letra: o.letra, texto: o.texto })), correcta: 'A', respondieron: 3,
      fallaron: [{ id: 1, intento: 1, nombre: 'Ana', elegida: 'B' }, { id: 2, intento: 2, nombre: 'Beto', elegida: 'B' }] }] };
    const cmp = h.el('div', {}, vistaCompararExamen(d, h, { filtro: null }));
    const ops = leer(cmp.conClase('opciones-revisadas')[0]);
    assert.deepEqual(ops.map(o => [o.letra, o.estado, o.sello]), [['A', 'correcta', '✓ Correcta'], ['B', 'mala', '✗ La eligieron 2'], ['C', 'neutra', null]]);
  });
});
