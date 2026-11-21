// Academia 0.14.95 (pedido de Junior: «tú escoges la respuesta: si bien o mal, la situación pasará en acción ahí»): las
// CONSECUENCIAS 3D de una pregunta (src/academia/consecuencias.js y public/consecuencia-vista.js). La revisión del campo
// del paquete y de la tabla del código; que solo viaje DESPUÉS de responder (nunca antes, nunca en el examen con reloj;
// en las revisiones, sí); que la letra elegida abra su consecuencia y una letra sin mapear, «Ver la correcta»; el 3D que
// se carga recién al tocar; y la cuenta de las vistas. Usa solo los paquetes de MUESTRA.
import { configDePrueba, conServidor, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { SITUACIONES_3D } from '../src/academia/diagramas.js';
import { CONSECUENCIAS_TG, revisarConsecuencia, consecuenciaDe, consecuenciaVista } from '../src/academia/consecuencias.js';
import { anotarConsecuencia, CLAVE_CONSECUENCIAS } from '../src/api/entendi.js';
import { leerAjuste } from '../src/academia/paquetes.js';
import { botonConsecuencia, consecuenciaElegida, abrirConsecuencia } from '../public/consecuencia-vista.js';
import { partesClaras } from '../public/respuesta-vista.js';
import { revisionVuelta } from '../public/repaso-final-vista.js';
import { revisionOral } from '../public/oral-vista.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8');
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const T0 = Date.parse('2026-11-20T14:00:00Z');

// La muestra con UNA pregunta con consecuencia (en el paquete): muestra-h1 (la correcta es la B).
const MUESTRA = paqueteMuestra();
const H1 = MUESTRA.preguntas.find(q => q.id === 'muestra-h1');
H1.consecuencia = { situacion: 'clase-c', opciones: { B: 'llamar', A: 'entrar' } }; // la C queda sin mapear
const ORAL = paqueteOralMuestra();
const OQ = ORAL.preguntas[0];
const OQ_MALA = ['A', 'B', 'C'].find(l => l !== OQ.original.correcta);
OQ.consecuencia = { situacion: 'densidad', opciones: { [OQ.original.correcta]: 'calcular', [OQ_MALA]: 'despegar' } };

// ---------- Un DOM de mentira (lo justo para las vistas) ----------
class Nodo {
  constructor(etiqueta) { this.etiqueta = etiqueta; this.hijos = []; this.atributos = {}; this.on = {}; this.hidden = false; this.dataset = {}; this.isConnected = true; this.padre = null;
    this.classList = { add: () => {}, remove: () => {}, toggle: () => {} }; }
  append(...xs) { for (const x of xs) { if (x instanceof Nodo) x.padre = this; this.hijos.push(x instanceof Nodo ? x : String(x)); } }
  replaceChildren(...xs) { this.hijos = []; this.append(...xs); }
  get firstChild() { return this.hijos[0] ?? null; }
  removeChild(h) { this.hijos = this.hijos.filter(x => x !== h); }
  remove() { if (this.padre) this.padre.removeChild(this); this.isConnected = false; }
  focus() {}
  setAttribute(k, v) { this.atributos[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = String(v); }
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
function ayudas(extra = {}) {
  const es = JSON.parse(leer('public/i18n/es.json'));
  const t = (clave, vars = {}) => (es[clave] ?? `¿${clave}?`).replace(/\{(\w+)\}/g, (_, n) => (n in vars ? String(vars[n]) : `{${n}}`));
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
  return { el, t, tn: t, talCual, numero: n => String(n), icono: () => el('svg'), fichaIngles: w => el('span', { texto: w.palabra }), figuraPregunta: () => null, ...extra };
}
const botonDe = nodo => nodo.conClase('boton-consecuencia')[0] ?? null;

// ---------- El servidor con la muestra ----------
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${base}${ruta}`, opciones);
  return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: (r.headers.get('set-cookie') ?? '').split(';')[0] || null };
}
function azarFijo(semilla = 7) { let s = semilla; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
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
      crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
      for (const p of [MUESTRA, ORAL]) {
        const subir = await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(r => r.json());
        assert.ok(subir.paquete, JSON.stringify(subir).slice(0, 300));
        for (const archivo of subir.faltan ?? []) await fetch(`${base}/api/admin/academia/paquetes/${subir.paquete.id}/figuras/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'image/png' }, body: figuraMuestraPng() });
        assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${subir.paquete.id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
      }
      await fn({ base, db, reloj, admin, ana });
    });
  } finally { db.close(); }
}

// ---------- 1. La revisión del campo y de la tabla ----------
test('la consecuencia se revisa: situación y consecuencias que existen; la correcta solo a la correcta; ninguna mala a la correcta', () => {
  const bien = { situacion: 'clase-c', opciones: { A: 'llamar', B: 'entrar' } };
  assert.deepEqual(revisarConsecuencia(bien, { letras: ['A', 'B', 'C'], correcta: 'A' }), []);
  assert.deepEqual(revisarConsecuencia(bien), [], 'sin saber la correcta, solo los ids');
  assert.deepEqual(revisarConsecuencia({ situacion: 'clase-z', opciones: { A: 'llamar' } }), ['situacion_desconocida']);
  assert.deepEqual(revisarConsecuencia({ situacion: 'clase-c', opciones: { A: 'volar' } }), ['opciones.A:consecuencia_desconocida']);
  assert.deepEqual(revisarConsecuencia({ situacion: 'clase-c', opciones: { A: 'entrar', B: 'llamar' } }, { letras: ['A', 'B', 'C'], correcta: 'A' }),
    ['opciones.A:correcta_no_va_a_la_correcta', 'opciones.B:mala_va_a_la_correcta']);
  assert.deepEqual(revisarConsecuencia({ situacion: 'clase-c', opciones: { B: 'entrar' } }, { letras: ['A', 'B', 'C'], correcta: 'A' }), ['sin_la_correcta']);
  assert.deepEqual(revisarConsecuencia({ situacion: 'clase-c', opciones: { D: 'llamar' } }, { letras: ['A', 'B', 'C'] }), ['opciones.D:letra']);
  assert.deepEqual(revisarConsecuencia({ situacion: 'clase-c', opciones: {} }), ['opciones']);
  assert.deepEqual(revisarConsecuencia({ situacion: 'clase-c', opciones: { A: 'llamar' }, texto: 'x' }), ['texto']);
  assert.deepEqual(revisarConsecuencia(null), ['no_es_objeto']);
  // En el paquete: el campo bien pasa; mal, el paquete no se sube.
  assert.equal(revisarPaquete(MUESTRA).ok, true, JSON.stringify(revisarPaquete(MUESTRA).errores));
  const malo = paqueteMuestra();
  malo.preguntas.find(q => q.id === 'muestra-h1').consecuencia = { situacion: 'clase-c', opciones: { B: 'entrar' } };
  const r = revisarPaquete(malo);
  assert.equal(r.ok, false);
  assert.ok(r.errores.some(e => /muestra-h1|preguntas\[0\]/.test(e.ruta) && e.ruta.endsWith('.consecuencia')), JSON.stringify(r.errores));
});

test('la tabla del código: solo ids (de preguntas y de consecuencias que existen), nunca el texto de una pregunta; el paquete manda', async () => {
  const { SITUACIONES } = await import('../public/clase/e3d-situaciones.js');
  const ids = Object.keys(CONSECUENCIAS_TG);
  assert.ok(ids.length >= 15 && ids.length <= 40, `${ids.length} preguntas`);
  for (const [id, c] of Object.entries(CONSECUENCIAS_TG)) {
    assert.match(id, /^(tg-\d+-\d+|orm-[0-9a-z-]+)$/, id);
    assert.deepEqual(revisarConsecuencia(c), [], id);
    assert.ok(SITUACIONES[c.situacion], `${id}: la situación existe en el 3D`);
    for (const [letra, o] of Object.entries(c.opciones)) {
      assert.match(letra, /^[A-C]$/);
      assert.ok(SITUACIONES[c.situacion].opciones.some(x => x.id === o), `${id}.${letra}: ${o} existe en el 3D`);
    }
    // Cada una lleva la correcta de su situación una sola vez como mucho (la letra correcta).
    assert.ok(Object.values(c.opciones).filter(o => o === SITUACIONES_3D[c.situacion].correcta).length === 1, `${id}: una sola letra a la correcta`);
  }
  // El archivo no trae enunciados ni opciones: solo ids, letras y consecuencias.
  const fuente = leer('src/academia/consecuencias.js').split('export const CONSECUENCIAS_TG')[1].split('}).map(')[0];
  for (const linea of fuente.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'))) {
    assert.match(linea.trim(), /^(= Object\.freeze\(Object\.fromEntries\(Object\.entries\(\{|'[a-z0-9-]+': \['[a-z-]+', \{( [A-C]: '[A-Za-z]+',?)+ \}\],)$/, `solo ids: ${linea}`);
  }
  // Con la tabla y con una pregunta cuya correcta no cumple la regla, no hay consecuencia.
  const q = { original: { correcta: 'A', opciones: [{ letra: 'A' }, { letra: 'B' }, { letra: 'C' }] } };
  assert.equal(consecuenciaDe('tg-4-148', q).situacion, 'clase-c');
  assert.equal(consecuenciaDe('tg-4-148', { original: { ...q.original, correcta: 'B' } }), null, 'si la correcta del paquete cambia, la tabla no se usa');
  const propia = { situacion: 'clase-b', opciones: { A: 'autorizado' } };
  assert.equal(consecuenciaDe('tg-4-148', { ...q, consecuencia: propia }), propia, 'el campo del paquete manda');
  assert.equal(consecuenciaDe('sin-tabla', q), null);
  // Modo reto: solo la correcta, con la letra que se vio.
  assert.deepEqual(consecuenciaVista('tg-4-148', q, { vistas: [{ letra: 'A', clave: 'R1' }, { letra: 'B', clave: 'A' }, { letra: 'C', clave: 'R2' }] }),
    { situacion: 'clase-c', correcta: 'llamar', opciones: { B: 'llamar' } });
});

// ---------- 2. El botón: después de responder; la letra abre su consecuencia ----------
test('el botón: la letra elegida abre su consecuencia; una letra sin mapear (o sin responder), «Ver la correcta»; nunca en el examen con reloj', () => {
  const h = ayudas();
  const c = { situacion: 'clase-c', correcta: 'llamar', opciones: { A: 'entrar', B: 'llamar' } };
  assert.equal(botonConsecuencia({ elegida: 'A' }, h), null, 'sin consecuencia, nada');
  assert.equal(botonConsecuencia(null, h), null);
  assert.equal(botonConsecuencia({ elegida: 'A', consecuencia: c }, h, { examenEnCurso: true }), null, 'nunca durante el examen con reloj');
  const mal = botonDe(botonConsecuencia({ elegida: 'A', consecuencia: c }, h));
  assert.equal(mal.dataset.opcion, 'entrar');
  assert.match(mal.textContent, /Ver qué pasaría/);
  const bien = botonDe(botonConsecuencia({ elegida: 'B', consecuencia: c }, h));
  assert.equal(bien.dataset.opcion, 'llamar');
  const sinMapa = botonDe(botonConsecuencia({ elegida: 'C', consecuencia: c }, h));
  assert.equal(sinMapa.dataset.opcion, 'llamar');
  assert.match(sinMapa.textContent, /Ver la correcta/);
  assert.deepEqual(consecuenciaElegida({ elegida: null, consecuencia: c }), { situacion: 'clase-c', opcion: 'llamar', propia: false, correcta: 'llamar' }, 'sin responder (revisión del examen): la correcta');
  assert.equal(consecuenciaElegida({ elegida: 'A', consecuencia: { situacion: 'clase-c' } }), null, 'mal formada: nada');
});

test('el 3D se carga recién al tocar: el módulo del botón no importa nada del 3D; la capa tiene «Cerrar», Escape y cuenta la vista', async () => {
  for (const archivo of ['public/consecuencia-vista.js', 'public/respuesta-vista.js', 'public/repaso-final-vista.js', 'public/oral-vista.js', 'public/mi-repaso-vista.js']) {
    assert.doesNotMatch(leer(archivo), /^import[^\n]*['"]\.\/clase\//m, `${archivo}: sin el 3D al cargar`);
  }
  assert.match(leer('public/consecuencia-vista.js'), /import\('\.\/clase\/situacion3d\.js'\)/, 'el 3D, con import() al tocar');
  assert.doesNotMatch(leer('public/consecuencia-vista.js'), /innerHTML|style=|\.style\./);
  assert.doesNotMatch(leer('public/examen-vista.js'), /botonConsecuencia|consecuencia-vista/, 'el examen con reloj no lo muestra');
  // Tocar: se carga una vez, se monta en esa consecuencia; Escape cierra y destruye.
  const body = new Nodo('body');
  const pedidos = [];
  let cargas = 0, destruido = 0, montadoCon = null;
  const cargar = async () => { cargas += 1; return { montarSituacion3d: (cuerpo, p, o) => { montadoCon = { p, o }; return { destruir: () => { destruido += 1; } }; } }; };
  const h = ayudas({ documento: { body, activeElement: null }, cargar, api: (...a) => { pedidos.push(a); return Promise.resolve({ ok: true }); } });
  const nodo = botonConsecuencia({ elegida: 'A', consecuencia: { situacion: 'clase-c', correcta: 'llamar', opciones: { A: 'entrar' } } }, h);
  assert.equal(cargas, 0, 'antes de tocar, nada del 3D');
  const x = abrirConsecuencia({ situacion: 'clase-c', opcion: 'entrar' }, h);
  await x.listo;
  assert.equal(cargas, 1);
  assert.deepEqual(montadoCon.p, { situacion: 'clase-c' });
  assert.equal(montadoCon.o.consecuencia.opcion, 'entrar');
  assert.deepEqual(pedidos, [['POST', '/api/academia/consecuencia', { situacion: 'clase-c', opcion: 'entrar' }]]);
  const capa = body.conClase('consecuencia-capa')[0];
  assert.equal(capa.getAttribute('role'), 'dialog');
  assert.equal(capa.getAttribute('aria-modal'), 'true');
  assert.ok(capa.conClase('consecuencia-cerrar').length, 'con «Cerrar»');
  capa.on.keydown({ key: 'Escape' });
  assert.equal(destruido, 1, 'al cerrar se libera el 3D (iOS tiene pocos WebGL)');
  assert.equal(body.conClase('consecuencia-capa').length, 0);
  // «Cerrar» desde la escena (alCerrar) también.
  const y = abrirConsecuencia({ situacion: 'clase-c', opcion: 'llamar' }, h);
  await y.listo;
  montadoCon.o.consecuencia.alCerrar();
  assert.equal(destruido, 2);
  assert.ok(nodo);
});

// ---------- 3. De punta a punta: práctica, revisión, examen con reloj, oral y repaso final ----------
test('práctica y revisión: antes de responder no viaja; después, la hoja trae «Ver qué pasaría» con la consecuencia de SU letra; la revisión también', async () => {
  await conAcademia(async c => {
    const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
    const antes = (await pedir(c.base, 'GET', `/api/academia/intentos/${i.id}`, { galleta: c.ana })).datos;
    for (const q of [...i.preguntas, ...antes.preguntas]) assert.doesNotMatch(JSON.stringify(q), /consecuencia|"situacion"/, `${q.id}: nada antes de responder`);
    for (const q of i.preguntas) {
      const buena = MUESTRA.preguntas.find(x => x.id === q.id).original.correcta;
      const elegida = q.id === 'muestra-h1' ? 'A' : buena;
      const r = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida } })).datos;
      const h = ayudas();
      const hoja = h.el('div', {}, partesClaras(q, r.respuesta, { enHoja: true }, h));
      if (q.id === 'muestra-h1') {
        assert.deepEqual(r.respuesta.consecuencia, { situacion: 'clase-c', correcta: 'llamar', opciones: { B: 'llamar', A: 'entrar' } });
        assert.equal(botonDe(hoja).dataset.opcion, 'entrar', 'la A (mala) abre «entrar»');
      } else {
        assert.equal(r.respuesta.consecuencia, undefined);
        assert.equal(botonDe(hoja), null, 'sin consecuencia, sin botón');
      }
    }
    const res = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: c.ana, datos: {} })).datos;
    const h1 = res.revision.find(q => q.id === 'muestra-h1');
    const h = ayudas();
    assert.equal(botonDe(h.el('div', {}, partesClaras(h1, h1.respuesta, {}, h))).dataset.opcion, 'entrar', 'en la revisión, el mismo botón');
    // La cuenta de las vistas (en ajustes, sin nombres).
    assert.equal((await pedir(c.base, 'POST', '/api/academia/consecuencia', { galleta: c.ana, datos: { situacion: 'clase-c', opcion: 'entrar' } })).datos.vistas, 1);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/consecuencia', { galleta: c.ana, datos: { situacion: 'clase-c', opcion: 'entrar' } })).datos.vistas, 2);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/consecuencia', { galleta: c.ana, datos: { situacion: 'clase-c', opcion: 'volar' } })).codigo, 400);
    assert.deepEqual(JSON.parse(leerAjuste(c.db, CLAVE_CONSECUENCIAS)), { 'clase-c.entrar': 2 });
  });
});

test('examen con reloj: mientras dura, nada de la consecuencia; al entregar, la revisión la trae (la sin responder, «Ver la correcta»)', async () => {
  await conAcademia(async c => {
    const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: { tipo: 'examen', materia: 'factores_humanos', saltar: true } })).datos;
    assert.ok(i.examen?.reloj, JSON.stringify(i).slice(0, 200));
    assert.ok(i.preguntas.some(q => q.id === 'muestra-h1'));
    const g = await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/examen`, { galleta: c.ana, datos: { pregunta: 'muestra-h1', elegida: 'A' } });
    assert.equal(g.codigo, 200, JSON.stringify(g.datos));
    assert.doesNotMatch(JSON.stringify(g.datos), /consecuencia/);
    const medio = (await pedir(c.base, 'GET', `/api/academia/intentos/${i.id}`, { galleta: c.ana })).datos;
    assert.doesNotMatch(JSON.stringify(medio), /consecuencia/, 'durante el examen, nada');
    const res = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: c.ana, datos: {} })).datos;
    const h1 = res.revision.find(q => q.id === 'muestra-h1');
    assert.equal(h1.respuesta.consecuencia.situacion, 'clase-c');
    const h = ayudas();
    assert.equal(botonDe(h.el('div', {}, partesClaras(h1, h1.respuesta, {}, h))).dataset.opcion, 'entrar');
    // Sin responder: «Ver la correcta».
    assert.equal(botonDe(h.el('div', {}, partesClaras(h1, { ...h1.respuesta, elegida: null, sinResponder: true }, {}, h))).dataset.opcion, 'llamar');
  });
});

test('oral: la práctica trae la consecuencia después de responder (con el botón en la hoja); el examen oral, solo al entregar, y su revisión el botón', async () => {
  await conAcademia(async c => {
    const r = await pedir(c.base, 'POST', '/api/academia/oral/responder', { galleta: c.ana, datos: { pregunta: OQ.id, elegida: OQ_MALA } });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.consecuencia.situacion, 'densidad');
    assert.equal(consecuenciaElegida(r.datos).opcion, 'despegar');
    const materia = ORAL.materias.find(m => m.temas.some(t => (t.preguntas ?? []).includes(OQ.id)))?.id;
    const e = (await pedir(c.base, 'POST', '/api/academia/oral/examen', { galleta: c.ana, datos: { materia } })).datos;
    assert.ok(e.examen, JSON.stringify(e).slice(0, 200));
    assert.doesNotMatch(JSON.stringify(e), /consecuencia/, 'nada antes de entregar');
    const respuestas = Object.fromEntries(e.preguntas.map(q => [q.id, q.id === OQ.id ? OQ.original.correcta : 'A']));
    const x = (await pedir(c.base, 'POST', '/api/academia/oral/examen/entregar', { galleta: c.ana, datos: { examen: e.examen, respuestas } })).datos;
    const h = { ...ayudas(), usuario: 1 };
    const nodo = revisionOral(x.revision, h);
    if (x.revision.some(q => q.id === OQ.id)) assert.ok(nodo.conClase('boton-consecuencia').some(b => b.dataset.opcion === 'calcular'), 'la correcta: el avión lo hace bien');
  });
});

test('repaso final: la revisión de la vuelta trae el botón; «otra vez» con otra letra abre la de esa letra', () => {
  const h = ayudas();
  const c = { situacion: 'clase-c', correcta: 'llamar', opciones: { B: 'llamar', A: 'entrar' } };
  const q = { id: 'muestra-h1', numero: 'M-01', enunciado: 'x', opciones: [{ letra: 'A', texto: 'a' }, { letra: 'B', texto: 'b' }, { letra: 'C', texto: 'c' }], respuesta: { elegida: 'A', correcta: 'B', acierto: false, consecuencia: c } };
  const nodo = revisionVuelta([q], h);
  assert.equal(botonDe(nodo).dataset.opcion, 'entrar');
  // La segunda vuelta arma la respuesta en la pantalla con la nueva letra: se busca por esa letra.
  assert.equal(consecuenciaElegida({ ...q.respuesta, elegida: 'B' }).opcion, 'llamar');
  // Y la cuenta no pisa algo que no entiende.
  const guardado = new Map([[CLAVE_CONSECUENCIAS, 'no es json']]);
  const db = { prepare: sql => ({ get: k => (guardado.has(k) ? { valor: guardado.get(k) } : undefined), run: (k, v) => { if (/INSERT/.test(sql)) guardado.set(k, v); } }) };
  assert.equal(anotarConsecuencia(db, 'clase-c', 'entrar'), 0);
  assert.equal(guardado.get(CLAVE_CONSECUENCIAS), 'no es json', 'nunca se borra');
});
