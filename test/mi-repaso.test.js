// Academia 0.12.2: «Mi repaso». Las fallas son por CONCEPTO (la tarjeta que explica la pregunta): más de 2 errores en
// preguntas de un mismo concepto (sumando intentos) lo ponen en «Mi repaso»; 1 o 2 nunca. Allí se repasa con sus preguntas
// (tal cual del Test Guide); si falla, la mini-clase del concepto (nunca en la clase normal); 3 aciertos seguidos lo
// superan. Las fallas de antes (0.10.0–0.12.1) se leen y se superan como siempre, sin borrar ni reescribir nada. Y lo que
// la pantalla arma con esos datos nunca dice «null» ni «undefined». Paquete de MUESTRA (en la muestra, h1, h2 y h4 son del
// concepto «¿Qué es?», h3 de «Cómo se nota» y h5 del concepto general del tema).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { leerConfigFallas } from '../src/academia/fallas.js';
import { crearInstructor } from '../public/instructor.js';
import { panelCurso, panelRepasoResumen } from '../public/progreso-vista.js';
import { pantallaMiRepaso, pantallaMiniClase, panelesRepaso } from '../public/mi-repaso-vista.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const FUNNEL = { 'Tailscale-Funnel-Request': '?1' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const T0 = Date.parse('2026-11-12T14:00:00Z');
const DIA = 86_400_000;
const QUE_ES = 'c:factores_humanos/muestra-hipoxia/que-es';

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
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
    const alumnos = {};
    const ids = {};
    for (const nombre of ['ana', 'beto']) {
      ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      alumnos[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    const subir = await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify(MUESTRA) }).then(r => r.json());
    for (const archivo of subir.faltan) await fetch(`${base}/api/admin/academia/paquetes/${subir.paquete.id}/figuras/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'image/png' }, body: figuraMuestraPng() });
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${subir.paquete.id}/activar`, { galleta: admin, datos: {} });
    await fn({ base, db, config, reloj, admin, ids, ...alumnos });
  });
  db.close();
}
const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);
// Un intento: cada pregunta mal si está en «malas», bien si no. Devuelve el resultado (y el intento).
async function hacer(c, galleta, datos, malas = []) {
  const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta, datos })).datos;
  assert.ok(i.id, JSON.stringify(i));
  for (const q of i.preguntas) {
    c.reloj.avanzar(30_000);
    await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: malas.includes(q.id) ? mala(q.id) : DE(q.id).original.correcta } });
  }
  const res = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} })).datos;
  return { ...res, preguntas: i.preguntas.map(q => q.id) };
}
const TEMA1 = { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' };
const repaso = (c, galleta) => pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta }).then(r => r.datos);
const fallas = (c, galleta) => pedir(c.base, 'GET', '/api/academia/instructor/fallas', { galleta }).then(r => r.datos.fallas);

test('el caso del dueño: 2 malas en el primer examen del tema 1 no crean ninguna falla; ánimo, sin «te quemaste», y todo en «Tus errores»', async () => {
  await conAcademia(async c => {
    const res = await hacer(c, c.ana, TEMA1, ['muestra-h2', 'muestra-h4']);
    assert.deepEqual([res.aprobado, res.humor, res.animo, res.nuevosEnRepaso], [false, undefined, true, undefined]);
    assert.deepEqual(await fallas(c, c.ana), []);
    const r = await repaso(c, c.ana);
    assert.deepEqual(r.paraRepasar, []);
    assert.equal(r.pendientes, 2);
    assert.equal(r.errores.length, 1);
    assert.deepEqual([r.errores[0].temaTitulo, r.errores[0].temaNumero], ['La hipoxia (muestra)', 1]);
    assert.deepEqual(r.errores[0].conceptos.map(x => [x.clave, x.concepto, x.enRepaso]), [[QUE_ES, '¿Qué es?', false]]);
    assert.deepEqual(r.errores[0].conceptos[0].preguntas.map(q => q.id).sort(), ['muestra-h2', 'muestra-h4']);
    // La clase sigue normal: ninguna tarjeta de refuerzo, ni «te confunde esto» por una sola equivocación.
    const tema = (await pedir(c.base, 'GET', '/api/academia/instructor/tema/factores_humanos/muestra-hipoxia', { galleta: c.ana })).datos;
    assert.equal(tema.refuerzo, null);
    assert.notEqual(tema.consejo?.clave, 'tema_error');
    // «¿Estás listo?»: ninguna falla.
    assert.ok((await pedir(c.base, 'GET', '/api/academia/preparado', { galleta: c.ana })).datos.reglas.find(x => x.id === 'fallas').ok);
  });
});

test('regla: 3 errores en preguntas RELACIONADAS (el mismo concepto, varios intentos) lo ponen en «Mi repaso»; 2, o en conceptos distintos, no', async () => {
  await conAcademia(async c => {
    await hacer(c, c.ana, TEMA1, ['muestra-h2', 'muestra-h3']);
    await hacer(c, c.ana, TEMA1, ['muestra-h2', 'muestra-h5']);
    assert.deepEqual(await fallas(c, c.ana), [], '2 de «¿Qué es?», 1 de «Cómo se nota» y 1 general: todavía no');
    const res = await hacer(c, c.ana, TEMA1, ['muestra-h1']);
    assert.deepEqual(res.nuevosEnRepaso, [{ clave: QUE_ES, concepto: '¿Qué es?', temaTitulo: 'La hipoxia (muestra)', temaNumero: 1, fallos: 3, dias: 1 }]);
    const [f] = await fallas(c, c.ana);
    assert.deepEqual([f.origen, f.clave, f.estado, f.fallos, f.concepto, f.conceptoClave, f.temaNumero], ['concepto', QUE_ES, 'activa', 3, '¿Qué es?', QUE_ES, 1]);
    assert.deepEqual(f.meta, { aciertos: 3, dias: 1 });
    const r = await repaso(c, c.ana);
    assert.equal(r.paraRepasar.length, 1);
    assert.deepEqual([r.paraRepasar[0].clave, r.paraRepasar[0].practicar, r.paraRepasar[0].miniclase], [QUE_ES, { tipo: 'errores', concepto: QUE_ES }, false]);
    // Solo para Ana; el umbral lo cambia solo el dueño (y se sigue leyendo la configuración guardada de antes).
    assert.deepEqual(await fallas(c, c.beto), []);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/fallas/ajustes', { galleta: c.admin, cabeceras: { ...DUENO, ...FUNNEL }, datos: { umbral: 4 } })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/fallas/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { umbral: 1 } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/fallas/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { umbral: 4 } })).datos.fallas.umbral, 4);
    guardarAjuste(c.db, 'academia.fallas.config', JSON.stringify({ umbral: 3, examen: 2 }));
    assert.deepEqual([leerConfigFallas(c.db).umbral, leerConfigFallas(c.db).examen], [3, 2]);
  });
});

test('repaso: sus preguntas tal cual; si falla, la mini-clase (la tarjeta y su explicación, rota a la idea equivocada); 3 seguidas lo superan', async () => {
  await conAcademia(async c => {
    for (const malas of [['muestra-h2'], ['muestra-h2'], ['muestra-h1']]) await hacer(c, c.ana, TEMA1, malas);
    // Abrir la clase normal no la toca (sigue «activa») ni mete nada delante.
    await pedir(c.base, 'GET', '/api/academia/instructor/tema/factores_humanos/muestra-hipoxia', { galleta: c.ana });
    assert.equal((await fallas(c, c.ana))[0].estado, 'activa');
    // Repasar: las 3 preguntas del concepto, las falladas primero, con sus opciones del Test Guide.
    const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: { tipo: 'errores', concepto: QUE_ES } })).datos;
    assert.deepEqual(i.preguntas.map(q => q.id).slice(0, 2).sort(), ['muestra-h1', 'muestra-h2']);
    assert.deepEqual(i.preguntas.map(q => q.id).sort(), ['muestra-h1', 'muestra-h2', 'muestra-h4']);
    for (const q of i.preguntas) assert.deepEqual([...q.opciones].sort((a, b) => a.letra.localeCompare(b.letra)), DE(q.id).original.opciones.map(o => ({ letra: o.letra, texto: o.texto })));
    assert.equal((await fallas(c, c.ana))[0].estado, 'refuerzo');
    for (const q of i.preguntas) await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida: q.id === 'muestra-h1' ? mala(q.id) : DE(q.id).original.correcta } });
    const res = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: c.ana, datos: {} })).datos;
    assert.deepEqual([res.repaso.clave, res.repaso.falladas, res.repaso.enRepaso, res.repaso.superada], [QUE_ES, 1, true, false]);
    assert.equal((await repaso(c, c.ana)).paraRepasar[0].miniclase, true, 'antes de intentarlo otra vez: la mini-clase');
    // La mini-clase: la tarjeta del concepto y la pregunta que falló, con su explicación; sin IA, sin botón de IA.
    let m = (await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(QUE_ES)}`, { galleta: c.ana })).datos;
    assert.deepEqual([m.concepto, m.secciones.length, m.secciones[0].titulo, m.ronda, m.ia, m.enRepaso], ['¿Qué es?', 1, '¿Qué es?', 1, false, true]);
    assert.deepEqual([m.pregunta.id, m.pregunta.elegida.letra, m.pregunta.correcta.letra, m.pregunta.sencilla, m.pregunta.idea], ['muestra-h1', mala('muestra-h1'), 'B', DE('muestra-h1').sencilla, null]);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/mi-repaso/clase?concepto=c%3Aotra%2Fcosa%2Fx', { galleta: c.ana })).codigo, 404);
    // Otra vuelta: al empezarla, la mini-clase ya se vio; si falla otra vez, la mini-clase también trae la idea equivocada.
    // (las falladas salen primero: la primera que responde es mala, así que no llega a 3 seguidas antes)
    const res2 = await hacer(c, c.ana, { tipo: 'errores', concepto: QUE_ES }, ['muestra-h1', 'muestra-h2']);
    assert.deepEqual([res2.repaso.falladas, res2.repaso.enRepaso], [2, true]);
    const ultima = res2.preguntas.filter(id => id !== 'muestra-h4').at(-1);
    m = (await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(QUE_ES)}`, { galleta: c.ana })).datos;
    assert.deepEqual([m.ronda >= 2, m.pregunta.id, m.pregunta.idea], [true, ultima, DE(ultima).errores[mala(ultima)]]);
    // 3 seguidas (las 3 del concepto): superado. Queda en el historial; «Para repasar» se vacía.
    const res3 = await hacer(c, c.ana, { tipo: 'errores', concepto: QUE_ES });
    assert.deepEqual([res3.repaso.superada, res3.repaso.enRepaso], [true, false]);
    const r = await repaso(c, c.ana);
    assert.deepEqual([r.paraRepasar.length, r.superadas], [0, 1]);
    assert.deepEqual((await fallas(c, c.ana)).map(f => f.estado), ['superada']);
  });
});

test('las fallas de antes (0.10.0–0.12.1) se leen, salen en «Mi repaso» y se superan como siempre; nada se borra ni se reescribe; ya no se crean', async () => {
  await conAcademia(async c => {
    const viejo = '2026-11-01T15:00:00.000Z';
    const poner = (clave, origen, pregunta, fallos) => c.db.prepare(`INSERT INTO academia_fallas (usuario_id, clave, materia, tema, pregunta, opcion, idea, origen, fallos, aciertos, dias, estado, refuerzo, primera_en, ultima_en, actualizado_en)
      VALUES (?, ?, 'factores_humanos', 'muestra-hipoxia', ?, NULL, 'una idea vieja', ?, ?, 0, '[]', 'activa', ?, ?, ?, ?)`).run(c.ids.ana, clave, pregunta, origen, fallos, JSON.stringify({ extras: ['muestra-h1'], tarjeta: { indice: 0, titulo: '¿Qué es?' } }), viejo, viejo, viejo);
    poner('q:muestra-h2', 'pregunta', 'muestra-h2', 3);
    poner('t:factores_humanos/muestra-hipoxia', 'examen', 'muestra-h2', 2);
    const antes = await fallas(c, c.ana);
    assert.deepEqual(antes.map(f => f.origen).sort(), ['examen', 'pregunta']);
    assert.ok(antes.every(f => f.meta.dias === 2 && f.conceptoClave === QUE_ES && f.concepto === '¿Qué es?'));
    // La de «2 de un tema en un intento» (2 fallos, debajo del umbral de ahora) queda en el historial: no es «para repasar»,
    // no suma en «¿Estás listo?» ni en el número de Inicio. La de la misma pregunta 3 veces, sí.
    assert.deepEqual(antes.map(f => [f.origen, f.cuenta]).sort(), [['examen', false], ['pregunta', true]]);
    const r = await repaso(c, c.ana);
    assert.deepEqual(r.paraRepasar.map(x => [x.origen, x.practicar]), [['pregunta', { tipo: 'instructor', materia: 'factores_humanos', tema: 'muestra-hipoxia' }]]);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.ana })).datos.plan.length, 1);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/preparado', { galleta: c.ana })).datos.reglas.find(x => x.id === 'fallas').valor, 1);
    // Todo bien un día y otro día: las dos se superan (3 aciertos en 2 días distintos, como antes).
    await hacer(c, c.ana, TEMA1);
    await hacer(c, c.ana, TEMA1);
    assert.ok((await fallas(c, c.ana)).every(f => f.estado !== 'superada'), 'un solo día no alcanza (regla de antes)');
    c.reloj.avanzar(DIA);
    await hacer(c, c.ana, TEMA1);
    const despues = c.db.prepare('SELECT clave, origen, estado, primera_en, idea FROM academia_fallas WHERE usuario_id = ? ORDER BY id').all(c.ids.ana);
    assert.deepEqual(despues.map(f => [f.clave, f.origen, f.estado, f.primera_en, f.idea]), [
      ['q:muestra-h2', 'pregunta', 'superada', viejo, 'una idea vieja'], ['t:factores_humanos/muestra-hipoxia', 'examen', 'superada', viejo, 'una idea vieja']]);
    // Un examen con 2 malas del mismo tema ya no crea la falla vieja de tema.
    await hacer(c, c.ana, TEMA1, ['muestra-h3', 'muestra-h5']);
    assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM academia_fallas WHERE usuario_id = ? AND estado <> 'superada'").get(c.ids.ana).n, 0);
  });
});

// ---------- Lo que la pantalla arma con esos datos (un DOM de mentira: append() escribe «null» como el de verdad) ----------
class Nodo {
  constructor(etiqueta) { this.etiqueta = etiqueta; this.hijos = []; this.atributos = {}; this.isConnected = true; this.style = {}; }
  append(...xs) { for (const x of xs) this.hijos.push(x instanceof Nodo ? x : String(x)); }
  prepend(...xs) { this.hijos.unshift(...xs.map(x => (x instanceof Nodo ? x : String(x)))); }
  replaceChildren(...xs) { this.hijos = []; this.append(...xs); }
  replaceWith() {}
  remove() {}
  setAttribute(k, v) { this.atributos[k] = String(v); }
  addEventListener() {}
  querySelector() { return null; }
  get textContent() { return this.hijos.map(h => (typeof h === 'string' ? h : h.textContent)).join(' '); }
  set textContent(v) { this.hijos = [String(v)]; }
  get todo() { return [this.textContent, ...Object.values(this.atributos)].join(' '); }
}
function ayudas() {
  const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
  const t = (clave, vars = {}) => (es[clave] ?? clave).replace(/\{(\w+)\}/g, (_, n) => (n in vars ? String(vars[n]) : `{${n}}`));
  const tn = (clave, vars = {}) => (Number(vars.n) === 1 && es[`${clave}.uno`] ? t(`${clave}.uno`, vars) : t(clave, vars));
  const el = (etiqueta, props = {}, ...hijos) => {
    const n = new Nodo(etiqueta);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) continue;
      if (k === 'texto') n.textContent = v; else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos.flat(Infinity)) if (h != null && h !== false) n.append(h);
    return n;
  };
  const talCual = (etiqueta, texto, clase = '') => el(etiqueta, { class: `tal-cual ${clase}`.trim(), texto: texto ?? '' });
  return { el, t, tn, talCual, numero: n => String(n), icono: () => el('svg'), nombreMateria: id => id, medidor: p => el('div', { texto: `${p} %` }), barraLlena: p => el('span', { texto: `${p}` }),
    insignia: (_, texto) => el('span', { texto }), vacio: (_, texto) => el('p', { texto }), sonar: () => {}, empezarIntento: () => {}, textoError: x => x, avisar: () => {} };
}
const sinHuecos = (texto, que) => {
  assert.doesNotMatch(texto, /\bnull\b|\bundefined\b|NaN|\[object Object\]/, `${que}: ${texto.match(/.{0,60}(null|undefined|NaN|\[object Object\]).{0,30}/)?.[0]}`);
  assert.doesNotMatch(texto, /\{[a-z_]+\}/i, `${que}: una variable sin poner`);
};

test('pantallas: Progreso (curso entero, «Mi repaso» en corto, «¿Estás listo?», «Lo que hicimos por ti»), «Mi repaso» y la mini-clase nunca dicen «null» ni «undefined»', async () => {
  await conAcademia(async c => {
    for (const malas of [['muestra-h2', 'muestra-h3'], ['muestra-h2'], ['muestra-h1']]) await hacer(c, c.ana, TEMA1, malas);
    await hacer(c, c.ana, { tipo: 'errores', concepto: QUE_ES }, ['muestra-h4']);
    const h = ayudas();
    const prog = (await pedir(c.base, 'GET', '/api/academia/progreso', { galleta: c.ana })).datos;
    assert.equal(prog.curso.programa, 11);
    assert.equal(prog.curso.materias.filter(m => m.estado === 'pronto').length, 10, 'las materias sin clases salen «pronto»');
    assert.deepEqual([prog.curso.temas, prog.curso.preguntas, prog.miRepaso.paraRepasar], [2, 10, 1]);
    sinHuecos(panelCurso(prog.curso, h).todo, 'curso');
    sinHuecos(panelRepasoResumen(prog.miRepaso, h).todo, 'Mi repaso en corto');
    assert.match(panelRepasoResumen(prog.miRepaso, h).textContent, /Repasa: ¿Qué es\? · Tema 1 La hipoxia \(muestra\)/);
    // Lo que llega por la API, con el instructor de verdad (el «null» junto a «HACERLO AHORA» salía de un append(null)).
    const promesas = [];
    const api = (metodo, ruta) => { const p = pedir(c.base, metodo, ruta, { galleta: c.ana }).then(r => ({ ok: r.codigo < 300, datos: r.datos })); promesas.push(p); return p; };
    const ins = crearInstructor({ ...h, api });
    const nodos = [ins.preparado(), ins.loQueHicimos()];
    const i = c.db.prepare("SELECT id FROM academia_intentos WHERE usuario_id = ? AND tipo = 'tema' ORDER BY id LIMIT 1").get(c.ids.ana).id;
    nodos.push(ins.planParaPasar({ id: i }));
    await Promise.all(promesas);
    await new Promise(r => setTimeout(r, 20));
    for (const [n, que] of nodos.map((n, k) => [n, ['preparado', 'lo que hicimos', 'plan para pasar'][k]])) {
      assert.ok(n.textContent.length > 40, `${que} se dibujó`);
      sinHuecos(n.todo, que);
    }
    assert.match(nodos[1].textContent, /Repasa: ¿Qué es\? · Tema 1/, 'lo principal: qué repasar');
    // «Mi repaso» y la mini-clase.
    let pantalla = null;
    const mostrar = (...x) => { pantalla = h.el('main', {}, ...x); };
    pantallaMiRepaso(await repaso(c, c.ana), { ...h, mostrar, marco: (_, ...x) => h.el('div', {}, ...x), volverAlCamino: () => h.el('a') });
    sinHuecos(pantalla.todo, 'Mi repaso');
    assert.match(pantalla.textContent, /Para repasar/);
    const m = (await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(QUE_ES)}`, { galleta: c.ana })).datos;
    pantallaMiniClase(m, { ...h, mostrar, marco: (_, ...x) => h.el('div', {}, ...x), partirLeccion: s => s, vistaTarjeta: p => ({ nodo: h.el('article', { texto: p.titulo }) }), botonGrande: texto => h.el('button', { texto }), instructorUi: () => ins });
    sinHuecos(pantalla.todo, 'mini-clase');
    // El resultado de un tema con 2 malas: ánimo y «Ir a Mi repaso».
    const res = await hacer(c, c.beto, TEMA1, ['muestra-h2', 'muestra-h4']);
    const lineas = panelesRepaso(res, h).map(n => n.textContent).join(' ');
    assert.match(lineas, /Normal, a todos les pasa: vamos a practicarlo\./);
    assert.doesNotMatch(lineas, /quemaste/i);
  });
});

test('ir directo al examen: lo que falló de temas cerrados se puede repasar en «Mi repaso» (sin botones muertos); lo que nunca vio, no', async () => {
  await conAcademia(async c => {
    const ex = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: { tipo: 'examen', materia: 'factores_humanos', saltar: true } })).datos;
    assert.ok(ex.id, JSON.stringify(ex));
    for (const q of ex.preguntas) await pedir(c.base, 'POST', `/api/academia/intentos/${ex.id}/examen`, { galleta: c.ana, datos: { pregunta: q.id, elegida: ['muestra-v1', 'muestra-v3', 'muestra-v4'].includes(q.id) ? mala(q.id) : DE(q.id).original.correcta } });
    await pedir(c.base, 'POST', `/api/academia/intentos/${ex.id}/terminar`, { galleta: c.ana, datos: {} });
    const r = await repaso(c, c.ana);
    const ojos = 'c:factores_humanos/muestra-ilusiones/los-ojos-se-enganan';
    assert.deepEqual(r.paraRepasar.map(x => x.clave), [ojos], 'v1, v3 y v4 son del mismo concepto: entra');
    // El tema 2 está cerrado (no hizo el tema 1), pero esas preguntas ya las respondió: «Repasar» y la mini-clase funcionan.
    const i = await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.ana, datos: { tipo: 'errores', concepto: ojos } });
    assert.equal(i.codigo, 201, JSON.stringify(i.datos));
    assert.equal((await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(ojos)}`, { galleta: c.ana })).codigo, 200);
    // Beto no respondió nada de ese tema cerrado: no.
    assert.equal((await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.beto, datos: { tipo: 'errores', concepto: ojos } })).codigo, 403);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(ojos)}`, { galleta: c.beto })).codigo, 403);
  });
});
