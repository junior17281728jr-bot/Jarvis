// Pruebas de la 0.14.72: TODOS los certificados ya hechos para el administrador (GET /api/admin/academia/certificados,
// src/academia/certificados-todos.js) y la pantalla (#certificados/todos, public/certificado-vista.js): el verificador por
// código ya no sale en lo del administrador, y en «Mis certificados» va plegado al final. Sin internet; datos fijos.
import { configDePrueba, conServidor, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { paqueteActivo, guardarAjuste } from '../src/academia/paquetes.js';
import { FORMATO_CODIGO, certificadosDe } from '../src/academia/certificados.js';
import { todosLosCertificados } from '../src/academia/certificados-todos.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { REDIRECCIONES_ADMIN } from '../public/navegacion.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8');
const ES = JSON.parse(leer('public/i18n/es.json'));
const EN = JSON.parse(leer('public/i18n/en.json'));
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}

async function conAcademia(fn) {
  const reloj = { ahora: Date.parse('2026-11-20T15:00:00Z') };
  const config = configDePrueba();
  const db = abrirBase(config);
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { reloj: () => reloj.ahora } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const ids = { junior: db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id };
    for (const nombre of ['ana', 'beto', 'carla']) ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const muestra = paqueteMuestra();
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(muestra) });
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    await fn({ base, db, config, admin: admin.galleta, ana, ids, reloj });
  });
  db.close();
}
function examen(db, usuarioId, materia, en) {
  db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, umbral, aprobado, empezado_en, terminado_en)
    VALUES (?, 'examen', ?, NULL, 10, 10, 9, 70, 1, ?, ?)`).run(usuarioId, materia, en, en);
}
const terminarTg = (db, config, id, dia) => paqueteActivo(db, config).materias.filter(m => m.temas.length).forEach(m => examen(db, id, m.id, `2026-11-${dia}T15:00:00Z`));
const terminarOral = (db, id, en) => guardarAjuste(db, `academia.oral.${id}`, JSON.stringify({ examenes: { final: { aprobado: true, veces: 1, en } } }));
function terminarRonda(db, id, ronda, en) {
  db.prepare(`INSERT INTO academia_compe_intentos (usuario_id, ronda, huella, total, actual, aciertos, empezado_en, terminado_en) VALUES (?, ?, 'x', 20, 20, 15, ?, ?)`).run(id, ronda, en, en);
}
const cuantasClaves = db => db.prepare("SELECT COUNT(*) AS n FROM ajustes WHERE clave LIKE 'academia.certificado%'").get().n;

test('la lista de todos: TG, oral y Competencia, los que faltaban se emiten una sola vez, y solo el administrador', async () => {
  await conAcademia(async ({ base, db, config, admin, ana, ids }) => {
    const ruta = '/api/admin/academia/certificados';
    assert.equal((await pedir(base, 'GET', ruta)).codigo, 401);
    assert.equal((await pedir(base, 'GET', ruta, { galleta: ana })).codigo, 403);
    // Nadie terminó nada: vacío (y no se guarda nada).
    let r = await pedir(base, 'GET', ruta, { galleta: admin });
    assert.equal(r.codigo, 200);
    assert.deepEqual([r.datos.certificados, r.datos.cuantos], [[], { tg: 0, oral: 0, compe: 0 }]);
    assert.equal(cuantasClaves(db), 0);
    // Ana: el Test Guide y lo abrió (ya tiene el suyo). Beto: la ronda 2, sin abrir nunca nada. Carla: nada.
    terminarTg(db, config, ids.ana, '10');
    const suyo = (await pedir(base, 'GET', '/api/academia/certificados', { galleta: ana })).datos.cursos.find(c => c.curso === 'tg');
    assert.equal(suyo.disponible, true);
    terminarRonda(db, ids.beto, 2, '2026-11-18T12:00:00Z');
    const antes = cuantasClaves(db);
    r = (await pedir(base, 'GET', ruta, { galleta: admin })).datos;
    assert.deepEqual(r.certificados.map(c => [c.nombre, c.curso, c.ronda ?? null]), [['beto', 'compe', 2], ['ana', 'tg', null]], 'los más nuevos primero');
    assert.deepEqual(r.cuantos, { tg: 1, oral: 0, compe: 1 });
    assert.equal(r.certificados[1].codigo, suyo.codigo, 'el de Ana es el mismo que ella ya vio');
    assert.equal(r.certificados[0].fecha, '2026-11-18T12:00:00Z');
    assert.equal(cuantasClaves(db), antes + 2, 'el de Beto (certificado + código)');
    for (const c of r.certificados) { assert.match(c.codigo, FORMATO_CODIGO); assert.equal(c.href, `#certificados/alumno/${c.usuarioId}`); }
    // Otra vez: nada nuevo (los mismos códigos, ni una clave más).
    assert.deepEqual((await pedir(base, 'GET', ruta, { galleta: admin })).datos.certificados.map(c => c.codigo), r.certificados.map(c => c.codigo));
    assert.equal(cuantasClaves(db), antes + 2);
    // El de un alumno (la pantalla a la que lleva cada fila) trae también los de la Competencia, con el mismo código.
    const a = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.beto}/certificados`, { galleta: admin })).datos;
    assert.deepEqual(a.compe.map(c => [c.ronda, c.codigo]), [[2, r.certificados[0].codigo]]);
    assert.equal(cuantasClaves(db), antes + 2);
  });
});

test('el oral sin abrir también se emite (una vez); el administrador solo si también estudia; un bloqueado no recibe nuevos', async () => {
  await conAcademia(async ({ db, config, ids }) => {
    const p = { ...paqueteActivo(db, config), oral: { materias: [{ id: 'oral_a', temas: [{ id: 't1', preguntas: ['x'] }] }] } };
    const opciones = { ahoraMs: Date.parse('2026-11-20T15:00:00Z') };
    terminarTg(db, config, ids.ana, '10');
    terminarOral(db, ids.beto, '2026-11-15T20:00:00.000Z');
    terminarRonda(db, ids.beto, 3, '2026-11-17T09:00:00Z');
    terminarOral(db, ids.junior, '2026-11-16T20:00:00.000Z');
    // Carla, a medias: un examen aprobado de otra materia (no las del curso) y el oral sin el final: nada.
    examen(db, ids.carla, 'zzz', '2026-11-12T10:00:00Z');
    guardarAjuste(db, `academia.oral.${ids.carla}`, JSON.stringify({ examenes: { final: { aprobado: false, veces: 1 } } }));
    let r = todosLosCertificados(db, p, opciones);
    // Los tres cursos en una sola lista, los más nuevos primero.
    assert.deepEqual(r.certificados.map(c => [c.nombre, c.curso]), [['beto', 'compe'], ['beto', 'oral'], ['ana', 'tg']]);
    assert.deepEqual(r.cuantos, { tg: 1, oral: 1, compe: 1 });
    assert.match(r.certificados[1].codigo, /^AA-OR-/);
    assert.ok(r.certificados.filter(c => c.curso !== 'compe').every(c => c.variante));
    const n = cuantasClaves(db);
    assert.equal(n, 6);
    // Las veces que sea: el mismo código y nada más guardado; y Beto, al abrir los suyos, ve ese mismo.
    assert.deepEqual(todosLosCertificados(db, p, opciones).certificados, r.certificados);
    assert.equal(cuantasClaves(db), n);
    assert.equal(certificadosDe(db, ids.beto, p, opciones).cursos[1].codigo, r.certificados[1].codigo);
    // El administrador que solo administra no entra; si también estudia (un intento), el suyo sí.
    examen(db, ids.junior, 'zzz', '2026-11-01T10:00:00Z');
    r = todosLosCertificados(db, p, opciones);
    assert.deepEqual(r.certificados.map(c => [c.usuarioId, c.curso]), [[ids.beto, 'compe'], [ids.junior, 'oral'], [ids.beto, 'oral'], [ids.ana, 'tg']]);
    assert.deepEqual(r.cuantos, { tg: 1, oral: 2, compe: 1 });
    // Un alumno bloqueado: no se le emite nada nuevo, pero el que ya tenía sigue en la lista (nunca se borra nada).
    db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(ids.ana);
    terminarRonda(db, ids.ana, 1, '2026-11-19T12:00:00Z');
    r = todosLosCertificados(db, p, opciones);
    assert.ok(r.certificados.some(c => c.usuarioId === ids.ana && c.curso === 'tg'));
    assert.ok(!r.certificados.some(c => c.usuarioId === ids.ana && c.curso === 'compe'));
  });
});

// ---------- La pantalla, con un documento de mentira ----------
function nodo(etiqueta) {
  const n = {
    etiqueta, atributos: {}, hijos: [], textContent: '', escuchas: {},
    setAttribute(k, v) { this.atributos[k] = String(v); },
    getAttribute(k) { return this.atributos[k] ?? null; },
    append(...h) {
      for (const x of h) assert.ok(x != null && x !== false, `append(${x}) en <${etiqueta}>`);
      this.hijos.push(...h.map(x => (typeof x === 'string' ? { etiqueta: '#texto', textContent: x, hijos: [], atributos: {} } : x)));
    },
    replaceChildren(...h) { this.hijos = []; this.append(...h); },
    addEventListener(ev, fn) { (this.escuchas[ev] ??= []).push(fn); },
  };
  return n;
}
function el(etiqueta, propiedades = {}, ...hijos) {
  const n = nodo(etiqueta);
  for (const [k, v] of Object.entries(propiedades)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'texto') n.textContent = v;
    else n.setAttribute(k, v);
  }
  n.append(...hijos.flat(Infinity).filter(x => x != null && x !== false));
  return n;
}
const t = (k, v = {}) => (ES[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const textos = n => [n.textContent, ...(n.hijos ?? []).flatMap(textos)].filter(Boolean).join(' ');
const buscar = (n, f) => (f(n) ? [n] : []).concat(...(n.hijos ?? []).map(h => buscar(h, f)));
const raiz = lista => { assert.ok(lista.every(x => x != null && x !== false), 'sin null en la lista'); return el('main', {}, ...lista); };
const conId = id => n => n.atributos?.id === id;
function piezas() {
  const prev = globalThis.document;
  globalThis.document = { createElement: nodo, createElementNS: (_, e) => nodo(e) };
  return { prev, h: { el, t, numero: n => String(n), icono: nombre => el('svg', { 'data-icono': nombre }), caja: () => el('div'), botonAccion: texto => el('button', { texto }), api: async () => ({ ok: true, datos: {} }), textoError: x => x, idioma: 'es', vacio: (i, texto) => el('p', { class: 'vacio', texto }), tarjetaCompe: c => el('section', { class: 'compe-de-prueba', texto: c.codigo }) } };
}

test('la pantalla: el administrador no ve el verificador; el alumno lo tiene plegado (cerrado) al final', async () => {
  const { prev, h } = piezas();
  try {
    const { vistaCertificados, vistaTodos } = await import('../public/certificado-vista.js');
    const cursos = [{ curso: 'tg', hay: true, disponible: true, codigo: 'AA-TG-ABCD-EFGH', fecha: '2026-11-10T15:00:00Z', variante: 'normal' }, { curso: 'oral', hay: true, disponible: false, avance: { hechos: 0, total: 1 } }];
    // El alumno: el suyo se ve directo (con su código) y el verificador va en un <details> cerrado, el último.
    const mio = raiz(vistaCertificados({ nombre: 'Ana', cursos }, h));
    const [entrada] = buscar(mio, conId('cert-verificar'));
    assert.ok(entrada);
    const [plegado] = buscar(mio, n => n.etiqueta === 'details' && buscar(n, conId('cert-verificar')).length);
    assert.equal(plegado.atributos.open, undefined);
    assert.equal(mio.hijos.at(-1), plegado);
    assert.match(textos(buscar(plegado, n => n.etiqueta === 'summary')[0]), /¿Verificar el certificado de otra persona\?/);
    assert.ok(buscar(mio, n => n.atributos?.class === 'cert-marco').length === 1);
    // El administrador (los de un alumno): sin verificador, con los de la Competencia y el enlace a todos.
    const deAlumno = raiz(vistaCertificados({ nombre: 'Ana', cursos, alumnoId: 7, compe: [{ codigo: 'AA-C2-ABCD-EFGH', ronda: 2 }] }, h));
    assert.equal(buscar(deAlumno, conId('cert-verificar')).length, 0);
    assert.equal(buscar(deAlumno, n => n.atributos?.class === 'compe-de-prueba').length, 1);
    assert.ok(buscar(deAlumno, n => n.atributos?.href === '#certificados/todos').length);
    // Todos: por curso, con su cuenta, cada fila al alumno; sin verificador.
    const lista = [
      { usuarioId: 3, nombre: 'Beto', curso: 'compe', ronda: 2, fecha: '2026-11-18T12:00:00Z', codigo: 'AA-C2-BBBB-CCCC', href: '#certificados/alumno/3' },
      { usuarioId: 3, nombre: 'Beto', curso: 'oral', fecha: '2026-11-15T20:00:00Z', codigo: 'AA-OR-BBBB-CCCC', href: '#certificados/alumno/3' },
      { usuarioId: 2, nombre: 'Ana', curso: 'tg', fecha: '2026-11-10T15:00:00Z', codigo: 'AA-TG-ABCD-EFGH', href: '#certificados/alumno/2' },
    ];
    const todos = raiz(vistaTodos({ certificados: lista, cuantos: { tg: 1, oral: 1, compe: 1 } }, h));
    assert.equal(buscar(todos, conId('cert-verificar')).length, 0);
    const grupos = buscar(todos, n => n.atributos?.['data-curso']);
    assert.deepEqual(grupos.map(g => g.atributos['data-curso']), ['tg', 'oral', 'compe']);
    for (const g of grupos) assert.match(textos(g), /\b1\b/);
    const filas = buscar(todos, n => n.etiqueta === 'a' && /^#certificados\/alumno\//.test(n.atributos.href ?? ''));
    assert.deepEqual(filas.map(f => f.atributos.href), ['#certificados/alumno/2', '#certificados/alumno/3', '#certificados/alumno/3']);
    assert.match(textos(filas[0]), /Ana.*AA-TG-ABCD-EFGH/);
    // Vacío: un aviso simple, sin grupos.
    const vacio = raiz(vistaTodos({ certificados: [], cuantos: { tg: 0, oral: 0, compe: 0 } }, h));
    assert.equal(buscar(vacio, n => n.atributos?.['data-curso']).length, 0);
    assert.match(textos(vacio), new RegExp(ES['cert.todos.vacio'].slice(0, 20)));
  } finally {
    globalThis.document = prev;
  }
});

test('el botón en Alumnos, la dirección y los textos en los dos idiomas', () => {
  const app = leer('public/app.js');
  assert.match(leer('public/admin-alumnos.js'), /href: '#certificados\/todos'/);
  assert.match(app, /seccion === 'certificados\/todos' && esAdmin\) return pantallaCertificadosTodos\(\)/);
  // Con la cabecera de Alumnos (dibujarDeAlumnos: la entrada «Alumnos» queda marcada) y sale del Modo estudiante.
  assert.match(app, /async function pantallaCertificadosTodos\(\) \{[\s\S]{0,400}dibujarDeAlumnos\(r, s, /);
  assert.match(app, /'contratos\/todos', 'certificados\/todos'/);
  assert.equal(REDIRECCIONES_ADMIN['admin/certificados'], '#certificados/todos');
  for (const k of ['cert.verificar.otra', 'cert.todos.boton', 'cert.todos.ver', 'cert.todos.titulo', 'cert.todos.linea', 'cert.todos.total', 'cert.todos.ronda', 'cert.todos.ninguno', 'cert.todos.vacio']) {
    assert.ok(ES[k] && EN[k], k);
  }
  assert.equal(ES['cert.verificar.otra'], '¿Verificar el certificado de otra persona?');
  const vista = leer('public/certificado-vista.js');
  assert.doesNotMatch(vista, /innerHTML|[{,]\s*style:|\.style\b/);
});
