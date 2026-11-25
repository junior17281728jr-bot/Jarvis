// Academia 0.14.116 (pedido del dueño): «Responder con mis palabras» en el oral del Repaso final («Examen oral: todo lo
// que te pueden preguntar»). Siempre contra el proveedor FALSO y los paquetes de MUESTRA (todo inventado:
// test/oral-muestra.js). Lo que se prueba:
//  - con IA: la respuesta va a la fila (un uso) con la respuesta del libro de ESA tarjeta y las reglas de calificar justo de
//    la práctica en vivo, sin nombres; lo que vuelve: veredicto, idea clave, lo que dijo bien y lo que faltó (sin repregunta);
//  - la misma respuesta otra vez no se cobra ni se pide de nuevo; «La sabía / No la sabía» sigue igual;
//  - sin IA (apagada, en pausa…): «desactivada» (nada va al proveedor, nada se cobra); si la IA no llegó: lo mismo;
//  - la pantalla (con un DOM de mentira): el botón, el cuadro, lo que dijo la IA, «Sugerido», el botón apagado con «¿Qué
//    hace?», la nota con la respuesta del libro si la IA falla o tarda (nunca esperando para siempre), Manos libres en pausa.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conInstructor, pedir, pedidosIa, cuerpoDe, sistemaDe, datosDe, NOMBRES } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { clavePalabras, textoPalabras, tarjetaParaPalabras, tarjetasOral, vistaPalabras } from '../src/academia/repaso-final.js';
import { sistemaPalabras, revisarVivo } from '../src/academia/oral-vivo-ia.js';
import { CLAVE_GUARDADO } from '../src/academia/instructor-ia.js';
import { clavePausa } from '../src/ia/tope-alumno.js';
import { iaDisponible, sugeridaDe, piezasDevolucion, pedirDevolucion, ESPERA_PALABRAS } from '../public/oral-palabras.js';
import { rondaOralFinal } from '../public/repaso-final-vista.js';
import { TEMAS_ALUMNO, TEMAS_AYUDA } from '../public/guia.js';

const ORAL = paqueteOralMuestra();
const leer = r => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');
const es = JSON.parse(leer('public/i18n/es.json'));
const en = JSON.parse(leer('public/i18n/en.json'));
const nada = () => new Promise(listo => setImmediate(listo));

async function subirOral(c) {
  const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(ORAL) });
  assert.ok(s.datos.paquete?.id, JSON.stringify(s.datos));
  for (const archivo of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} })).codigo, 200);
}
const tareasVivo = c => c.db.prepare("SELECT id, estado, datos FROM tareas WHERE datos LIKE '%\"uso\":\"instructor_oral_vivo\"%' ORDER BY id").all();
const cobros = (c, clave) => c.db.prepare('SELECT COUNT(*) AS n FROM academia_ia_minutos WHERE referencia = ? AND minutos < 0').get(clave).n;
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const calificacion = (veredicto, extra = {}) => ({ tipo: 'ok', json: { veredicto, linea: 'Puedes llevar amigos, pero nunca cobrarles.', bien_dicho: 'Dijiste que puedes llevar amigos.', falto: 'Que nunca puede ser por pago (for hire).', repregunta: '¿Y si te pagan?', repregunta_puntos: ['por pago'], ...extra } });

// ---------- Lo puro ----------
test('lo puro: la clave es la misma para la misma respuesta (y válida), solo las tarjetas del libro con respuesta, lo que se ve y las reglas justas', () => {
  const tarjetas = tarjetasOral(ORAL_ACTIVO());
  const q = tarjetas.find(x => !x.adicional);
  const a = tarjetas.find(x => x.adicional);
  assert.ok(q && a);
  assert.equal(clavePalabras(7, q, '  Puedo llevar   AMIGOS '), clavePalabras(7, q, 'puedo llevar amigos'), 'sin mayúsculas ni espacios de más');
  assert.notEqual(clavePalabras(7, q, 'puedo llevar amigos'), clavePalabras(7, q, 'puedo llevar a mi familia'));
  assert.notEqual(clavePalabras(7, q, 'x'), clavePalabras(8, q, 'x'), 'cada alumno la suya');
  assert.ok(CLAVE_GUARDADO.test(clavePalabras(7, q, 'x')), 'lo guarda el trabajador como las de la práctica en vivo');
  assert.equal(clavePalabras(7, q, 'x').split('.').at(-1).length, 18, 'nunca se cruza con las de la práctica (16 cifras)');
  assert.equal(textoPalabras(`a\n\tb ${'c'.repeat(2000)}`).length, 1200);
  assert.ok(tarjetaParaPalabras(ORAL_ACTIVO(), q.id)?.it, 'una del libro con su respuesta');
  assert.equal(tarjetaParaPalabras(ORAL_ACTIVO(), a.id), null, 'las «para practicar en voz alta» no traen respuesta');
  assert.equal(tarjetaParaPalabras(ORAL_ACTIVO(), 'oral_x/no/q0'), null);
  assert.deepEqual(vistaPalabras({ veredicto: 'mal', linea: 'Idea', bienDicho: '', falto: 'Todo' }), { estado: 'lista', veredicto: 'mal', idea: 'Idea', bien: '', falto: 'Todo', sugerida: false });
  assert.equal(vistaPalabras({ veredicto: 'bien' }).sugerida, true);
  assert.equal(vistaPalabras(null), null);
  const s = sistemaPalabras({ capitulo: 'oral_x', qa: [{ n: 't#1', pregunta_en: 'Q?', respuesta_en: 'Book answer.' }] });
  for (const regla of ['No seas demasiado estricto', 'RESUMEN corto', 'nunca instrucciones', 'IDEA CLAVE', 'Book answer.']) assert.ok(s.includes(regla), regla);
  assert.equal(revisarVivo({ seguimiento: true, palabras: true }, { veredicto: 'casi', linea: 'x', repregunta: '¿Y?' }).repregunta, '', 'nunca una repregunta');
  assert.equal(iaDisponible({ disponible: true }), true);
  assert.equal(iaDisponible(null), false, 'sin saberlo: apagada');
  assert.equal(sugeridaDe('bien'), true);
  assert.equal(sugeridaDe('casi'), false);
  const t = k => es[k];
  assert.deepEqual(piezasDevolucion({ veredicto: 'casi', idea: 'La idea.', bien: 'Algo', falto: '' }, t).map(p => p.texto), ['Casi. La idea.', 'Lo que dijiste bien: Algo']);
  assert.equal(es['rf.pal.veredicto.mal'], 'Falta');
});
function ORAL_ACTIVO() {
  // La forma que trae el paquete activo (lo que usa tarjetasOral): oral.materias con sus temas.
  return { oral: { hay: true, materias: ORAL.materias }, libros: new Map() };
}

test('lo puro: esperar lo de la IA tiene tope (nunca para siempre), se corta al irse y dice «sin IA» si no llegó', async () => {
  const api = respuestas => { const pedidos = []; const f = async (m, ruta, datos) => { pedidos.push(ruta); return respuestas.shift() ?? { ok: true, datos: { estado: 'pendiente' } }; }; f.pedidos = pedidos; return f; };
  const ya = async () => {};
  const a = api([{ ok: true, datos: { estado: 'pendiente' } }, { ok: true, datos: { estado: 'lista', veredicto: 'bien', idea: 'x' } }]);
  assert.equal((await pedirDevolucion({ api: a, tarjeta: 't', texto: 'x', esperar: ya })).veredicto, 'bien');
  assert.deepEqual(a.pedidos, ['/api/academia/repaso-final/oral/palabras', '/api/academia/repaso-final/oral/palabras/ver']);
  const b = api([]);
  const r = await pedirDevolucion({ api: b, tarjeta: 't', texto: 'x', esperar: ya });
  assert.deepEqual(r, { estado: 'sin_ia', motivo: 'tiempo' });
  assert.equal(b.pedidos.length, 1 + ESPERA_PALABRAS.maxMs / ESPERA_PALABRAS.cadaMs, 'unos 45 s y se rinde');
  assert.deepEqual(await pedirDevolucion({ api: api([{ ok: true, datos: { estado: 'sin_ia', motivo: 'ia_apagada' } }]), tarjeta: 't', texto: 'x', esperar: ya }), { estado: 'sin_ia', motivo: 'ia_apagada' });
  assert.equal((await pedirDevolucion({ api: api([{ ok: false, datos: { error: 'sin_conexion' } }]), tarjeta: 't', texto: 'x', esperar: ya })).estado, 'sin_ia', 'sin red: la respuesta del libro');
  // Un pedido que no contesta nunca (los POST no tienen el corte de 25 s): el tope de reloj lo corta igual.
  let disparar = null;
  const relojFalso = { poner: f => { disparar = f; return 1; }, quitar: () => {} };
  const colgado = pedirDevolucion({ api: () => new Promise(() => {}), tarjeta: 't', texto: 'x', reloj: relojFalso });
  await nada();
  disparar();
  assert.deepEqual(await colgado, { estado: 'sin_ia', motivo: 'tiempo' });
  let vale = true;
  const c = api([{ ok: true, datos: { estado: 'pendiente' } }]);
  assert.equal(await pedirDevolucion({ api: c, tarjeta: 't', texto: 'x', esperar: async () => { vale = false; }, vigente: () => vale }), null, 'se fue de la tarjeta: nada');
});

// ---------- Las rutas ----------
test('con IA: la respuesta va a la fila con la respuesta del libro de esa tarjeta, sin nombres; vuelve el veredicto con la idea clave; la misma respuesta no se cobra dos veces; marcar sigue igual', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    const ia = await pedir(c.base, 'GET', '/api/academia/repaso-final/oral/ia', { galleta: c.z });
    assert.deepEqual(ia.datos, { disponible: true, motivo: null });
    const d = (await pedir(c.base, 'GET', '/api/academia/repaso-final/oral', { galleta: c.z })).datos;
    const x = d.tarjetas.find(y => y.id.endsWith('/q0') && y.materia === 'oral_calificaciones');
    const texto = 'Puedo llevar amigos zoelia';
    const r = await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: x.id, texto } });
    assert.deepEqual(r.datos, { estado: 'pendiente' }, JSON.stringify(r.datos));
    const [t0] = tareasVivo(c);
    const d0 = JSON.parse(t0.datos);
    assert.ok(d0.sistema.includes(x.respuesta_en), 'la respuesta del libro de esa tarjeta va como referencia');
    assert.ok(d0.sistema.includes('No seas demasiado estricto') && d0.sistema.includes('RESUMEN corto'), 'las reglas de calificar justo (0.14.93)');
    assert.ok(d0.sistema.includes('IDEA CLAVE'));
    assert.equal(datosDe(d0.texto).respuesta_del_alumno, texto, 'lo que escribió, tal cual');
    assert.equal(d0.seguimiento, true, 'nunca una repregunta');
    for (const n of NOMBRES) assert.ok(!d0.sistema.toLowerCase().includes(n), 'sin nombres en el sistema');
    assert.ok(!t0.datos.includes(`"usuario":`) && !/zoelia@|"nombre"/.test(t0.datos), 'sin datos de la cuenta');
    // Mientras tanto: «pendiente»; otra vez lo mismo (con otras mayúsculas): sin otra tarea ni otro cobro.
    assert.equal((await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras/ver', { galleta: c.z, datos: { tarjeta: x.id, texto } })).datos.estado, 'pendiente');
    assert.equal((await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: x.id, texto: ` ${texto.toUpperCase()}  ` } })).datos.estado, 'pendiente');
    assert.equal(tareasVivo(c).length, 1);
    c.falso.siguiente(calificacion('casi'));
    assert.equal((await c.hacer(t0.id)).resultado.usada, true);
    const cuerpo = cuerpoDe(pedidosIa(c).at(-1));
    assert.ok(Array.isArray(cuerpo.system) && cuerpo.system[0].cache_control, 'el libro del capítulo con la marca de la caché');
    assert.ok(sistemaDe(cuerpo).includes(x.respuesta_en));
    const v = (await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras/ver', { galleta: c.z, datos: { tarjeta: x.id, texto } })).datos;
    assert.deepEqual(v, { estado: 'lista', veredicto: 'casi', idea: 'Puedes llevar amigos, pero nunca cobrarles.', bien: 'Dijiste que puedes llevar amigos.', falto: 'Que nunca puede ser por pago (for hire).', sugerida: false });
    const clave = clavePalabras(idDe(c, 'zoelia'), x, texto);
    assert.equal(cobros(c, clave), 1, 'un uso');
    // La misma respuesta otra vez (aunque la IA ya no estuviera): se ve gratis, sin pedir nada.
    const antes = pedidosIa(c).length;
    const otra = (await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: x.id, texto: texto.toLowerCase() } })).datos;
    assert.equal(otra.veredicto, 'casi');
    assert.equal(pedidosIa(c).length, antes);
    assert.equal(tareasVivo(c).length, 1);
    assert.equal(cobros(c, clave), 1, 'nunca dos veces lo mismo');
    // Otro alumno con el mismo texto: no ve lo de ella.
    const q = (await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras/ver', { galleta: c.q, datos: { tarjeta: x.id, texto } })).datos;
    assert.equal(q.estado, 'sin_ia');
    // Lo que no se puede: en blanco, una «para practicar en voz alta», una que no existe.
    assert.equal((await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: x.id, texto: '   ' } })).codigo, 400);
    const adicional = d.tarjetas.find(y => y.adicional);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: adicional.id, texto: 'algo' } })).codigo, 404);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: 'oral_x/y/q0', texto: 'algo' } })).codigo, 404);
    // Marca él (la IA solo sugiere): el repaso de siempre.
    const m = await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/marcar', { galleta: c.z, datos: { tarjeta: x.id, sabia: false } });
    assert.equal(m.codigo, 200);
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/repaso-final/oral', { galleta: c.z })).datos.marcas, { [x.id]: 0 });
  });
});

test('si la IA no llegó (falló o no respondió): «sin IA» (la pantalla muestra la respuesta del libro con la nota); en pausa: desactivada, sin tarea ni cobro', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    const x = (await pedir(c.base, 'GET', '/api/academia/repaso-final/oral', { galleta: c.z })).datos.tarjetas.find(y => !y.adicional);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: x.id, texto: 'una respuesta' } })).datos.estado, 'pendiente');
    c.db.prepare("UPDATE tareas SET estado = 'fallida' WHERE id = ?").run(tareasVivo(c)[0].id);
    assert.deepEqual((await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras/ver', { galleta: c.z, datos: { tarjeta: x.id, texto: 'una respuesta' } })).datos, { estado: 'sin_ia', motivo: 'no_llego' });
    // «IA en pausa» para él: desactivada, nada a la fila.
    c.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(clavePausa(idDe(c, 'zoelia')), JSON.stringify({ pausada: true }), new Date().toISOString());
    assert.equal((await pedir(c.base, 'GET', '/api/academia/repaso-final/oral/ia', { galleta: c.z })).datos.disponible, false);
    const r = (await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: x.id, texto: 'otra respuesta' } })).datos;
    assert.equal(r.estado, 'sin_ia');
    assert.equal(tareasVivo(c).length, 1);
    assert.equal(cobros(c, clavePalabras(idDe(c, 'zoelia'), x, 'otra respuesta')), 0);
  });
});

test('sin IA (apagada): la opción dice desactivada; responder no va a la IA ni cobra; «La sabía» sigue funcionando', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    const ia = (await pedir(c.base, 'GET', '/api/academia/repaso-final/oral/ia', { galleta: c.z })).datos;
    assert.equal(ia.disponible, false);
    assert.ok(typeof ia.motivo === 'string' && ia.motivo);
    const x = (await pedir(c.base, 'GET', '/api/academia/repaso-final/oral', { galleta: c.z })).datos.tarjetas.find(y => !y.adicional);
    const r = (await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/palabras', { galleta: c.z, datos: { tarjeta: x.id, texto: 'mi respuesta' } })).datos;
    assert.equal(r.estado, 'sin_ia');
    assert.equal(tareasVivo(c).length, 0);
    assert.equal(pedidosIa(c).length, 0);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/repaso-final/oral/marcar', { galleta: c.z, datos: { tarjeta: x.id, sabia: true } })).codigo, 200);
  }, { encender: false });
});

// ---------- La pantalla (un DOM de mentira) ----------
class Nodo {
  constructor(etiqueta) {
    this.etiqueta = etiqueta; this.hijos = []; this.atributos = {}; this.on = {}; this.hidden = false; this.disabled = false; this.dataset = {}; this.isConnected = true; this.value = '';
    this.classList = { add: c => this.setAttribute('class', `${this.atributos.class ?? ''} ${c}`.trim()), remove: c => this.setAttribute('class', this.clases.filter(x => x !== c).join(' ')),
      toggle: (c, si) => (si ? this.classList.add(c) : this.classList.remove(c)) };
  }
  append(...xs) { for (const x of xs) { if (x == null) throw new Error('append(null)'); this.hijos.push(x instanceof Nodo ? x : String(x)); } }
  replaceChildren(...xs) { this.hijos = []; this.append(...xs); }
  setAttribute(k, v) { this.atributos[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); }
  getAttribute(k) { return this.atributos[k] ?? null; }
  addEventListener(e, f) { this.on[e] = f; }
  click() { return this.on.click?.({ currentTarget: this, preventDefault() {}, stopPropagation() {} }); }
  get clases() { return (this.atributos.class ?? '').split(/\s+/).filter(Boolean); }
  todos(f) { const r = []; const ir = n => { for (const h of n.hijos) if (h instanceof Nodo) { if (f(h)) r.push(h); ir(h); } }; ir(this); return r; }
  conClase(c) { return this.todos(n => n.clases.includes(c)); }
  get textContent() { return this.hijos.map(h => (typeof h === 'string' ? h : h.textContent)).join(' '); }
  set textContent(v) { this.hijos = [String(v)]; }
}
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
        lista.delete(id); ahora = x.en; x.f(); await nada(); await nada();
      }
      ahora = fin;
      await nada();
    },
  };
}
function pantalla({ ia = { disponible: true, motivo: null }, respuestas = {}, voz = true } = {}) {
  globalThis.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { documentElement: { dataset: {} }, querySelectorAll: () => [] };
  const t = (clave, vars = {}) => (es[clave] ?? `¿${clave}?`).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  const el = (etiqueta, props = {}, ...hijos) => {
    const n = new Nodo(etiqueta);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'texto') n.textContent = v;
      else if (k === 'hidden') n.hidden = true;
      else if (k === 'disabled') n.disabled = true;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos.flat(Infinity)) if (h != null && h !== false) n.append(h);
    return n;
  };
  const pedidos = [];
  const api = async (metodo, ruta, datos) => {
    pedidos.push({ metodo, ruta, datos });
    const r = respuestas[ruta];
    const x = typeof r === 'function' ? r(datos) : Array.isArray(r) ? r.shift() : r;
    return x ?? { ok: true, datos: {} };
  };
  const leidos = [];
  const lector = { leer(piezas) { leidos.push(piezas.map(p => p.texto).join(' | ')); return Promise.resolve(true); }, callar() {} };
  const estado = { raiz: null, avisos: [] };
  const reloj = relojes();
  const h = {
    el, t, tn: t, talCual: (e, texto, c = '') => el(e, { class: `tal-cual ${c}`.trim(), texto: texto ?? '' }), numero: n => String(n), icono: () => el('svg'), nombreMateria: id => id,
    sonar() {}, celebrar() {}, api, avisar: (x, tono) => estado.avisos.push([x, tono]), textoError: x => String(x), usuario: 1, mostrar: r => { estado.raiz = r; },
    marcoEstudio: ({ cuerpo, pie }) => el('div', {}, el('main', {}, cuerpo), el('footer', {}, pie)), combustible: () => ({ nodo: el('div'), poner() {} }),
    botonGrande: (texto, alPulsar) => el('button', { type: 'button', class: 'boton-3d grande', onclick: alPulsar }, el('span', { texto })),
    vistaVisual: null, reloj, cargarDictado: async () => null,
    voz: { lector, encendida: () => voz, poner: async () => ({ ok: true }) },
    ayudaPalabras: () => el('button', { type: 'button', class: 'que-es rf-pal-que' }, el('span', { texto: t('rf.pal.que_hace') })),
  };
  const CARTAS = [
    { id: 'm/t/q0', materia: 'm', capitulo: 1, tema: 't', temaTitulo: 'Tema', libro: 'Libro', n: 1, adicional: false, pagina: 3,
      pregunta_en: 'Who may a private pilot carry?', pregunta_es: '¿A quién puede llevar un piloto privado?', respuesta_en: 'Friends, never for hire.', respuesta_es: 'Amigos, nunca por pago.' },
    { id: 'm/t/q1', materia: 'm', capitulo: 1, tema: 't', temaTitulo: 'Tema', libro: 'Libro', n: 2, adicional: false, pagina: 4,
      pregunta_en: 'How often must you fly with an instructor?', pregunta_es: null, respuesta_en: 'Every 24 calendar months.', respuesta_es: null },
    { id: 'm/t/a0', materia: 'm', capitulo: 1, tema: 't', temaTitulo: 'Tema', libro: 'Libro', n: null, adicional: true, pagina: 5,
      pregunta_en: 'Describe your night minimums.', pregunta_es: 'Describe tus mínimos de noche.', respuesta_en: null, respuesta_es: null },
  ];
  rondaOralFinal({ tarjetas: CARTAS, marcas: {}, ia }, null, h);
  return { estado, pedidos, leidos, reloj, raiz: () => estado.raiz };
}
const texto = n => n.textContent.replace(/\s+/g, ' ').trim();
const boton = (raiz, que) => raiz.todos(n => n.etiqueta === 'button' && texto(n).startsWith(que))[0] ?? null;
const caja = raiz => raiz.conClase('rf-pal-texto')[0] ?? null;

test('la pantalla con IA: «Responder con mis palabras» → el cuadro → «Enviar» → lo que dijo la IA, la respuesta del libro, «Sugerido» y se lee en voz alta; marca él', async () => {
  const p = pantalla({ respuestas: {
    '/api/academia/repaso-final/oral/palabras': { ok: true, datos: { estado: 'pendiente' } },
    '/api/academia/repaso-final/oral/palabras/ver': [{ ok: true, datos: { estado: 'pendiente' } }, { ok: true, datos: { estado: 'lista', veredicto: 'casi', idea: 'Amigos sí, por pago no.', bien: 'Dijiste amigos.', falto: 'Que no puede cobrar.', sugerida: false } }],
  } });
  await nada();
  const raiz = p.raiz();
  const abrir = boton(raiz, 'Responder con mis palabras');
  assert.ok(abrir && !abrir.disabled, 'el botón, encendido');
  assert.equal(raiz.conClase('rf-pal-nota').length, 0);
  abrir.click();
  const c = caja(raiz);
  assert.ok(c, 'el cuadro para responder');
  assert.ok(raiz.conClase('oral-qa-pregunta').length, 'la pregunta sigue arriba');
  // En blanco no se manda.
  boton(raiz, 'Enviar').click();
  await nada();
  assert.ok(!p.pedidos.some(x => x.ruta.endsWith('/palabras')));
  assert.match(texto(raiz), /Todavía no escribiste nada/);
  c.value = 'Puedo llevar amigos';
  boton(raiz, 'Enviar').click();
  await nada();
  assert.deepEqual(p.pedidos.filter(x => x.ruta.endsWith('/palabras')).map(x => x.datos), [{ tarjeta: 'm/t/q0', texto: 'Puedo llevar amigos' }]);
  assert.match(texto(raiz), /La IA está comparando tu respuesta con el libro/);
  await p.reloj.avanzar(1500);
  await p.reloj.avanzar(1500);
  const r = raiz.conClase('rf-pal-resultado')[0];
  assert.ok(r, 'lo que dijo la IA');
  assert.match(texto(r), /Puedo llevar amigos/);
  assert.match(texto(r), /Casi/);
  assert.match(texto(r), /Amigos sí, por pago no\./);
  assert.match(texto(r), /Lo que dijiste bien: Dijiste amigos\./);
  assert.match(texto(r), /Lo que faltó o no era así: Que no puede cobrar\./);
  assert.match(texto(raiz), /Amigos, nunca por pago\./, 'y la respuesta del libro, tal cual');
  const no = boton(raiz, 'No la sabía');
  assert.ok(no.clases.includes('rf-sugerido') && /Sugerido/.test(texto(no)), 'sugiere «No la sabía»');
  assert.ok(!boton(raiz, 'La sabía').clases.includes('rf-sugerido'));
  assert.ok(p.leidos.some(l => l.startsWith('Casi. Amigos sí, por pago no.') && l.includes('Amigos, nunca por pago.')), `se lee lo de la IA y la respuesta: ${p.leidos}`);
  // Él decide: «La sabía» aunque la IA sugiera la otra.
  boton(raiz, 'La sabía').click();
  await nada();
  assert.deepEqual(p.pedidos.filter(x => x.ruta.endsWith('/marcar')).map(x => x.datos), [{ tarjeta: 'm/t/q0', sabia: true }]);
});

test('la pantalla sin IA: el botón apagado con «La corrección con IA está desactivada en este momento» y «¿Qué hace?»; «Ver respuesta» sigue', async () => {
  const p = pantalla({ ia: { disponible: false, motivo: 'ia_apagada' } });
  await nada();
  const raiz = p.raiz();
  const abrir = boton(raiz, 'Responder con mis palabras');
  assert.ok(abrir?.disabled, 'apagado');
  assert.match(texto(raiz), /La corrección con IA está desactivada en este momento\./);
  assert.ok(boton(raiz, '¿Qué hace?'), '¿Qué hace?');
  abrir.click();
  assert.equal(caja(raiz), null, 'no abre nada');
  boton(raiz, 'Ver respuesta').click();
  assert.match(texto(raiz), /Amigos, nunca por pago\./);
  // Sin saber si hay IA (la ruta no respondió): apagado también, nunca un error.
  const q = pantalla({ ia: null });
  await nada();
  assert.ok(boton(q.raiz(), 'Responder con mis palabras').disabled);
});

test('la pantalla: si la IA falla a mitad o tarda, la respuesta del libro con la nota (nunca esperando para siempre); la siguiente ya sale apagada', async () => {
  const p = pantalla({ respuestas: {
    '/api/academia/repaso-final/oral/palabras': { ok: true, datos: { estado: 'pendiente' } },
    '/api/academia/repaso-final/oral/palabras/ver': [{ ok: true, datos: { estado: 'sin_ia', motivo: 'no_llego' } }],
  } });
  await nada();
  let raiz = p.raiz();
  boton(raiz, 'Responder con mis palabras').click();
  caja(raiz).value = 'Amigos';
  boton(raiz, 'Enviar').click();
  await nada();
  await p.reloj.avanzar(1500);
  assert.match(texto(raiz), /La corrección con IA está desactivada en este momento\. Compara tu respuesta con la del libro\./);
  assert.match(texto(raiz), /Amigos, nunca por pago\./, 'la respuesta del libro');
  assert.match(texto(raiz.conClase('rf-pal-resultado')[0]), /Amigos/, 'y lo que respondió, para comparar');
  boton(raiz, 'No la sabía').click();
  await nada();
  assert.ok(boton(raiz, 'Responder con mis palabras').disabled, 'la siguiente: apagada');
  // Tarda: a los 45 s se rinde (la respuesta del libro y la nota).
  const q = pantalla({ respuestas: { '/api/academia/repaso-final/oral/palabras': { ok: true, datos: { estado: 'pendiente' } }, '/api/academia/repaso-final/oral/palabras/ver': () => ({ ok: true, datos: { estado: 'pendiente' } }) } });
  await nada();
  raiz = q.raiz();
  boton(raiz, 'Responder con mis palabras').click();
  caja(raiz).value = 'Amigos';
  boton(raiz, 'Enviar').click();
  await nada();
  await q.reloj.avanzar(30_000);
  assert.equal(raiz.conClase('rf-pal-nota-ia').length, 0, 'todavía esperando');
  await q.reloj.avanzar(20_000);
  assert.equal(raiz.conClase('rf-pal-nota-ia').length, 1, 'se rindió con la nota');
  assert.match(texto(raiz), /Amigos, nunca por pago\./);
  assert.ok(!boton(raiz, 'No la sabía').disabled);
});

test('la pantalla: si no llegó por un corte de red pero la IA sigue para él, la siguiente tarjeta lo ofrece encendido', async () => {
  const p = pantalla({ respuestas: {
    '/api/academia/repaso-final/oral/palabras': { ok: false, datos: { error: 'sin_conexion' } },
    '/api/academia/repaso-final/oral/ia': { ok: true, datos: { disponible: true, motivo: null } },
  } });
  await nada();
  const raiz = p.raiz();
  boton(raiz, 'Responder con mis palabras').click();
  caja(raiz).value = 'Amigos';
  boton(raiz, 'Enviar').click();
  await nada(); await nada();
  assert.match(texto(raiz), /La corrección con IA está desactivada en este momento\. Compara/, 'esta vez: la respuesta del libro con la nota');
  assert.ok(p.pedidos.some(x => x.ruta === '/api/academia/repaso-final/oral/ia'), 'se pregunta otra vez si hay IA');
  boton(raiz, 'No la sabía').click();
  await nada();
  assert.equal(boton(raiz, 'Responder con mis palabras').disabled, false, 'la siguiente: encendido');
});

test('la pantalla: abrir el cuadro pausa «Manos libres»; volver a «Manos libres» vuelve a la pregunta; las «para practicar en voz alta» no lo ofrecen', async () => {
  const p = pantalla();
  await nada();
  const raiz = p.raiz();
  boton(raiz, 'Manos libres').click();
  await nada();
  const libres = () => raiz.todos(n => n.dataset.valor === 'libres')[0].getAttribute('aria-pressed');
  assert.equal(libres(), 'true');
  boton(raiz, 'Responder con mis palabras').click();
  assert.equal(libres(), 'false', 'Manos libres en pausa (no espera respuestas escritas)');
  assert.ok(caja(raiz));
  await p.reloj.avanzar(20_000);
  assert.ok(caja(raiz), 'nada pasa solo mientras responde');
  boton(raiz, 'Manos libres').click();
  await nada();
  assert.equal(caja(raiz), null, 'vuelve a la pregunta y sigue solo');
  // Hasta la tarjeta «para practicar en voz alta»: sin la opción.
  const q = pantalla({ voz: false });
  await nada();
  const r2 = q.raiz();
  for (let k = 0; k < 2; k++) { boton(r2, 'Ver respuesta').click(); boton(r2, 'No la sabía').click(); await nada(); }
  assert.match(texto(r2), /Describe tus mínimos de noche/);
  assert.equal(boton(r2, 'Responder con mis palabras'), null);
});

test('los textos, la Ayuda y las reglas de la pantalla', () => {
  for (const k of ['rf.pal.boton', 'rf.pal.que_hace', 'rf.pal.que_hace_aria', 'rf.pal.desactivada', 'rf.pal.no_llego', 'rf.pal.tu_respuesta', 'rf.pal.placeholder', 'rf.pal.enviar', 'rf.pal.vacio', 'rf.pal.revisando',
    'rf.pal.escrito', 'rf.pal.veredicto.bien', 'rf.pal.veredicto.casi', 'rf.pal.veredicto.mal', 'rf.pal.bien', 'rf.pal.falto', 'rf.pal.tu_decides', 'rf.pal.sugerido', 'ayuda.oral_palabras.titulo', 'ayuda.oral_palabras.texto']) assert.ok(es[k] && en[k], k);
  assert.equal(es['rf.pal.boton'], 'Responder con mis palabras');
  assert.equal(es['rf.pal.desactivada'], 'La corrección con IA está desactivada en este momento.');
  assert.match(es['ayuda.oral_palabras.texto'], /compara con el libro/);
  assert.match(es['ayuda.oral_palabras.texto'], /Ver respuesta/, 'mientras tanto: «Ver respuesta» y comparar');
  assert.match(es['ayuda.voz_oral.texto'], /Responder con mis palabras/, '«¿Cómo funciona?» lo explica');
  assert.ok(TEMAS_ALUMNO.includes('oral_palabras') && TEMAS_AYUDA.includes('oral_palabras'), 'en la Ayuda del alumno');
  const app = leer('public/app.js');
  assert.match(app, /queEs\('oral_palabras'\)/);
  assert.match(app, /api\('GET', '\/api\/academia\/repaso-final\/oral\/ia'\)/);
  for (const f of ['public/oral-palabras.js', 'public/repaso-final-vista.js']) assert.doesNotMatch(leer(f), /innerHTML|outerHTML|insertAdjacentHTML|\.style\b|style=/, f);
  const css = leer('public/academia.css');
  assert.match(css, /\.rf-pal-abrir \{[^}]*min-height: 44px/);
  assert.match(css, /\.rf-pal-mic \{[^}]*width: 48px; height: 48px/);
});
