// Academia 0.12.4: «sin la API (clave de IA) no quiero más errores». Sin clave, sin la IA encendida, sin el permiso del
// alumno (o retirado) o sin presupuesto: ninguna ruta del instructor devuelve un «no pudo» (ia = null, solo lo básico), el
// Profesor virtual guarda el mensaje y la respuesta básica, y las pantallas no tienen append(null) ni style en línea.
// Usa solo el paquete de MUESTRA (test/academia-muestra.js) y datos sintéticos.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { darProfesor } from '../src/academia/profesor.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const mala = id => DE(id).original.opciones.find(o => o.letra !== DE(id).original.correcta).letra;

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
export async function conAcademia(fn, { extra = {} } = {}) {
  const config = { ...configDePrueba(), ...extra };
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config });
  try {
    await conServidor(servidor, async base => {
      const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
      assert.equal(admin.codigo, 201);
      const alumnos = {};
      for (const nombre of ['ana', 'beto']) {
        crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
        alumnos[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
      }
      const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
      assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
      for (const archivo of s.datos.faltan) {
        await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
      }
      assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
      await fn({ base, db, config, admin: admin.galleta, pedir: (m, r, o = {}) => pedir(base, m, r, o), ...alumnos });
    });
  } finally {
    db.close();
  }
}
const idDe = (db, nombre) => db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
// Una pregunta mala respondida (para «Explícamelo»).
async function unaMala(c, galleta) {
  const i = (await c.pedir('POST', '/api/academia/intentos', { galleta, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
  const q = i.preguntas[0];
  await c.pedir('POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: mala(q.id) } });
  await c.pedir('POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} });
  return { intento: i, pregunta: q };
}
// Ninguna respuesta del instructor dice «no pudo» cuando la IA no está para él por algo que no se pasa solo.
const sinNoPudo = (datos, que) => {
  assert.equal(datos.ia, null, `${que}: ia = null (sin «no pudo»): ${JSON.stringify(datos.ia)}`);
};

test('sin clave de IA: explicar, consejo, duda y Profesor responden solo lo básico (ia = null), y el Profesor guarda los mensajes', async () => {
  await conAcademia(async c => {
    const x = await unaMala(c, c.ana);
    const e = await c.pedir('POST', '/api/academia/instructor/explicar', { galleta: c.ana, datos: { intento: x.intento.id, pregunta: x.pregunta.id, ia: true } });
    assert.equal(e.codigo, 200);
    sinNoPudo(e.datos, 'explicar');
    assert.ok(e.datos.basica.correcta, 'la explicación básica siempre está');
    assert.equal(e.datos.instructor.modo, 'basico');
    const k = await c.pedir('POST', '/api/academia/instructor/consejo', { galleta: c.ana, datos: {} });
    assert.equal(k.codigo, 200);
    sinNoPudo(k.datos, 'consejo');
    const d = await c.pedir('POST', '/api/academia/instructor/duda', { galleta: c.ana, datos: { materia: 'factores_humanos', tema: 'muestra-hipoxia', texto: '¿Qué hago si noto la hipoxia?' } });
    assert.equal(d.codigo, 200);
    sinNoPudo(d.datos, 'duda');
    // El Profesor virtual (dado por el administrador): la respuesta básica, y los dos mensajes quedan al recargar.
    darProfesor(c.db, idDe(c.db, 'ana'), true);
    const p = await c.pedir('POST', '/api/academia/profesor', { galleta: c.ana, datos: { mensaje: '¿Qué estudio hoy?' } });
    assert.equal(p.codigo, 200);
    assert.equal(p.datos.ia, null);
    assert.ok(p.datos.basica?.clave, 'lo básico le dice qué estudiar');
    const h = (await c.pedir('GET', '/api/academia/profesor', { galleta: c.ana })).datos;
    assert.equal(h.historial.length, 1, 'el mensaje no se pierde al recargar');
    assert.equal(h.historial[0].pregunta, '¿Qué estudio hoy?');
    assert.equal(h.historial[0].estado, 'basico');
    assert.equal(h.historial[0].basica.clave, p.datos.basica.clave);
    assert.equal(h.instructor.modo, 'basico', 'la pantalla sabe que no hay IA (no ofrece el chat)');
    // El administrador «como estudiante»: igual.
    const pa = await c.pedir('POST', '/api/academia/profesor', { galleta: c.admin, datos: { mensaje: 'Hola profesor' } });
    assert.equal(pa.datos.ia, null);
    assert.equal((await c.pedir('GET', '/api/academia/profesor', { galleta: c.admin })).datos.historial.at(-1).estado, 'basico');
    // La ficha del alumno (administrador) ve el historial básico.
    assert.equal((await c.pedir('GET', `/api/admin/academia/alumnos/${idDe(c.db, 'ana')}/profesor`, { galleta: c.admin })).datos.historial[0].estado, 'basico');
    assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'academia.instructor'").get().n, 0, 'nada a la IA');
  });
});

test('sin el permiso de IA del alumno (o retirado): lo básico, sin «no pudo»', async () => {
  await conAcademia(async c => {
    c.db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, '0', ?)").run(`cuenta.consentimiento_ia.${idDe(c.db, 'beto')}`, new Date().toISOString());
    const x = await unaMala(c, c.beto);
    const e = await c.pedir('POST', '/api/academia/instructor/explicar', { galleta: c.beto, datos: { intento: x.intento.id, pregunta: x.pregunta.id, ia: true } });
    assert.equal(e.datos.instructor.motivo, 'sin_consentimiento');
    sinNoPudo(e.datos, 'explicar sin permiso');
    sinNoPudo((await c.pedir('POST', '/api/academia/instructor/duda', { galleta: c.beto, datos: { materia: 'factores_humanos', tema: 'muestra-hipoxia', texto: 'una duda de la hipoxia' } })).datos, 'duda sin permiso');
  });
});

// ---------- Lo que se ve: ningún append(null) ni style en línea (la CSP lo bloquea) ----------
// pagos.js lo cambia otro trabajo (0.12.4): su caso (Profesor sin «basica») queda anotado allá; aquí se salta.
const SALTAR = new Set([]);
function archivosJs(carpeta) {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? archivosJs(join(carpeta, e.name)) : e.name.endsWith('.js') ? [join(carpeta, e.name)] : []));
}
// Los argumentos de primer nivel de cada .append( / .replaceChildren( / .prepend( (sin mirar dentro de el(...)).
function argumentosDeAppend(texto) {
  const hallados = [];
  const re = /\.(append|replaceChildren|prepend)\(/g;
  let m;
  while ((m = re.exec(texto))) {
    let i = m.index + m[0].length;
    let hondo = 1;
    let comilla = null;
    let arriba = '';
    for (; i < texto.length && hondo > 0; i++) {
      const ch = texto[i];
      if (comilla) { if (ch === '\\') { i += 1; continue; } if (ch === comilla) comilla = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { comilla = ch; continue; }
      if ('([{'.includes(ch)) { hondo += 1; continue; }
      if (')]}'.includes(ch)) { hondo -= 1; continue; }
      if (hondo === 1) arriba += ch;
    }
    hallados.push({ linea: texto.slice(0, m.index).split('\n').length, arriba });
  }
  return hallados;
}
test('ninguna pantalla pasa un «cond ? x : null» (ni «?? null», ni «&&») directo a append/replaceChildren', () => {
  const malos = [];
  for (const archivo of archivosJs(join(RAIZ, 'public'))) {
    if (SALTAR.has(archivo.split('/').pop())) continue;
    for (const a of argumentosDeAppend(readFileSync(archivo, 'utf8'))) {
      if (/:\s*null\b|\?\?\s*null\b|&&/.test(a.arriba)) malos.push(`${archivo.slice(RAIZ.length + 1)}:${a.linea}`);
    }
  }
  assert.deepEqual(malos, [], 'usa anexar()/reemplazar() (o el(...)), que filtran los null');
  // El detector sí encuentra el caso de verdad.
  assert.equal(argumentosDeAppend("x.append(a, b ? el('p') : null);").filter(a => /:\s*null\b/.test(a.arriba)).length, 1);
});
test('ningún style en línea en las pantallas (la CSP style-src \'self\' lo bloquea): el estilo va por clase o por CSSOM', () => {
  const malos = [];
  for (const archivo of [...archivosJs(join(RAIZ, 'public')), join(RAIZ, 'public', 'index.html')]) {
    readFileSync(archivo, 'utf8').split('\n').forEach((l, i) => {
      if (/[{,]\s*style\s*:|setAttribute\(\s*['"]style['"]|\sstyle\s*=\s*["']/.test(l)) malos.push(`${archivo.slice(RAIZ.length + 1)}:${i + 1}`);
    });
  }
  assert.deepEqual(malos, []);
});

// ---------- 17. Las visitas: «Última entrada», «Última salida (cómo)», «En línea» y «Abrió la app N veces» ----------
import { anotarActividad, anotarFin, resumenVisitas, HUECO_MS } from '../src/cuentas/visitas.js';
import { actividadDe } from '../src/cuentas/historial.js';
test('visitas: empiezan al entrar o tras 15 min sin nada, cerrar la app un momento sigue la misma, y la ficha lo dice', () => {
  const db = abrirBase(configDePrueba());
  try {
    crearUsuario(db, { nombre: 'vera', claveHash: 'x', debeCambiarClave: false });
    const id = idDe(db, 'vera');
    const T = Date.parse('2026-11-11T18:23:00Z');
    const MIN = 60_000;
    assert.equal(resumenVisitas(db, id, T), null, 'sin visitas: nada (la ficha usa lo de antes)');
    assert.equal(anotarActividad(db, id, T, { entrada: true }), 'nueva');
    assert.equal(anotarActividad(db, id, T + 30_000), null, 'menos de un minuto: ni escribe');
    assert.equal(anotarActividad(db, id, T + 2 * MIN), 'sigue');
    let r = resumenVisitas(db, id, T + 3 * MIN);
    assert.deepEqual([r.enLinea, r.visitas, r.salida], [true, 1, null], 'en línea, primera visita, sin salida todavía');
    // Cierra la app y vuelve a los 5 minutos: la misma visita.
    assert.equal(anotarFin(db, id, 'cerro', T + 4 * MIN), true);
    assert.equal(anotarFin(db, id, 'cerro', T + 4 * MIN + 1000), false, 'un aviso cada 30 s como mucho');
    r = resumenVisitas(db, id, T + 5 * MIN);
    assert.deepEqual([r.enLinea, r.salida, r.salidaComo], [false, new Date(T + 4 * MIN).toISOString(), 'cerro']);
    anotarActividad(db, id, T + 9 * MIN);
    r = resumenVisitas(db, id, T + 9 * MIN);
    assert.deepEqual([r.enLinea, r.visitas], [true, 1], 'volvió antes de 15 min: la misma visita');
    // Se va sin cerrar nada; vuelve al día siguiente: visita nueva, y la salida de la anterior es su última actividad.
    const manana = T + 9 * MIN + HUECO_MS + 16 * 3600_000;
    assert.equal(anotarActividad(db, id, manana), 'nueva');
    r = resumenVisitas(db, id, manana + MIN);
    assert.deepEqual([r.entrada, r.salida, r.salidaComo, r.visitas, r.enLinea], [new Date(manana).toISOString(), new Date(T + 9 * MIN).toISOString(), 'inactiva', 2, true]);
    // Sin actividad 3 minutos: ya no «en línea»; su salida es la de ESTA visita.
    r = resumenVisitas(db, id, manana + 4 * MIN);
    assert.deepEqual([r.enLinea, r.salida, r.salidaComo], [false, new Date(manana).toISOString(), 'inactiva']);
    anotarFin(db, id, 'salir', manana + 5 * MIN);
    assert.equal(resumenVisitas(db, id, manana + 6 * MIN).salidaComo, 'salir');
    const a = actividadDe(db, id, manana + 6 * MIN);
    assert.deepEqual([a.ultimaEntrada, a.salidaComo, a.visitas, a.enLinea], [new Date(manana).toISOString(), 'salir', 2, false]);
    assert.equal(a.entradas, 0, 'las entradas con contraseña siguen aparte');
  } finally {
    db.close();
  }
});
test('visitas por la red: entrar empieza una, el aviso de «cerró la app» la termina y no cuenta como actividad', async () => {
  await conAcademia(async c => {
    const id = idDe(c.db, 'ana');
    assert.equal(resumenVisitas(c.db, id).visitas, 1, 'entrar con la contraseña empezó una visita');
    assert.equal((await c.pedir('POST', '/api/yo/visita/fin', { galleta: c.ana, datos: {} })).codigo, 200);
    const r = resumenVisitas(c.db, id);
    assert.deepEqual([r.salidaComo, r.enLinea], ['cerro', false]);
    assert.equal((await c.pedir('POST', '/api/yo/visita/fin', { datos: {} })).codigo, 401, 'solo con sesión');
    const ficha = (await c.pedir('GET', `/api/admin/academia/alumnos/${id}/ficha`, { galleta: c.admin })).datos;
    assert.equal(ficha.actividad.salidaComo, 'cerro');
  });
});

// ---------- 16e. El banco de regresión de la IA (casos sintéticos), contra el proveedor falso ----------
import { spawnSync } from 'node:child_process';
test('el banco de regresión de la IA corre contra el proveedor falso (sin red, sin costo) y sus reglas detectan lo malo', async () => {
  const banco = JSON.parse(readFileSync(join(RAIZ, 'test', 'ia-regresion-banco.json'), 'utf8'));
  assert.ok(banco.casos.length >= 10 && banco.casos.every(c => c.opciones.length === 3 && c.opciones.some(o => o.letra === c.correcta)));
  const r = spawnSync(process.execPath, ['--no-warnings', join(RAIZ, 'scripts', 'regresion-ia.mjs'), '--falso', '--json'], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const salida = JSON.parse(r.stdout);
  assert.equal(salida.pasan, banco.casos.length);
  const { revisarCaso } = await import('../scripts/regresion-ia.mjs');
  const pedido = { correcta: '2', esquema: { type: 'object' } };
  assert.deepEqual(revisarCaso(pedido, { opcion_correcta: '1', explicacion: 'La opción A es la buena.', por_que_no: '', recuerda: '', terminos: [] }).sort(), ['contradice_test_guide', 'nombra_letra_o_numero', 'sin_terminos']);
});

// ---------- 18. La «Vista de prueba de la IA»: solo el administrador, sin IA, sin costo, sin guardar nada ----------
test('la vista de prueba de la IA: solo el administrador; no llama a la IA, no pone tareas, no cobra ni guarda nada de los alumnos', async () => {
  await conAcademia(async c => {
    const x = await unaMala(c, c.ana);
    assert.ok(x);
    const contar = () => ({
      llamadas: c.db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n,
      tareas: c.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'academia.instructor'").get().n,
      respuestas: c.db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas').get().n,
      intentos: c.db.prepare('SELECT COUNT(*) AS n FROM academia_intentos').get().n,
      ia: c.db.prepare("SELECT COUNT(*) AS n FROM ajustes WHERE clave LIKE 'academia.ia.%' OR clave LIKE 'academia.profesor.%' OR clave LIKE 'academia.ia_minutos%'").get().n,
      minutos: c.db.prepare('SELECT COUNT(*) AS n FROM academia_ia_minutos').get().n,
      fallasAlumnos: c.db.prepare("SELECT COUNT(*) AS n FROM academia_fallas WHERE usuario_id IN (SELECT id FROM usuarios WHERE rol <> 'admin')").get().n,
    });
    const antes = contar();
    assert.equal((await c.pedir('GET', '/api/admin/academia/ia-demo', { galleta: c.ana })).codigo, 403, 'un alumno nunca la ve');
    const r = await c.pedir('GET', '/api/admin/academia/ia-demo', { galleta: c.admin });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.demo, true);
    assert.ok(r.datos.pregunta.enunciado && r.datos.pregunta.correctaTexto && r.datos.basica.correcta);
    assert.ok(Array.isArray(r.datos.acciones));
    assert.deepEqual(contar(), antes, 'nada nuevo en la base');
    // El enlace solo se le ofrece al administrador.
    assert.equal((await c.pedir('GET', '/api/academia/instructor', { galleta: c.admin })).datos.demoIa, true);
    assert.equal((await c.pedir('GET', '/api/academia/instructor', { galleta: c.ana })).datos.demoIa, false);
  });
});

// ---------- 6. Los plurales: nada de «(s)», y «{n|día|días}» elige bien en los dos idiomas ----------
import { runInNewContext } from 'node:vm';
test('textos sin «(s)» ni «1 días»: el plural lo elige t() con «{n|uno|varios}», igual en español y en inglés', () => {
  const app = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  const fuente = ['const CIFRA_PLURAL', 'const esUno', 'function t('].map(inicio => app.slice(app.indexOf(inicio)).split('\n').slice(0, inicio.startsWith('function') ? 4 : 1).join('\n')).join('\n');
  for (const idioma of ['es', 'en']) {
    const catalogo = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', `${idioma}.json`), 'utf8'));
    for (const [clave, valor] of Object.entries(catalogo)) {
      assert.doesNotMatch(valor, /\w\((?:s|es)\)/, `${idioma} ${clave}: «(s)» (usa {n|…|…})`);
    }
    const t = runInNewContext(`const catalogos = { es: ${JSON.stringify(idioma === 'es' ? catalogo : {})}, en: ${JSON.stringify(catalogo)} }; const idioma = ${JSON.stringify(idioma)};\n${fuente}\nt;`);
    if (idioma === 'es') {
      assert.equal(t('mirepaso.entro', { n: '3', concepto: 'X', d: '1' }), 'Fallaste 3 veces cosas de «X» (en 1 día): lo vamos a reforzar en «Mi repaso».');
      assert.match(t('mirepaso.entro', { n: '3', concepto: 'X', d: '2' }), /en 2 días\)/);
      assert.equal(t('ficha.tiempo.linea', { n: '1' }), 'en 1 día distinto');
      assert.equal(t('instr.o.rapidas', { n: '1' }), '1 respuesta mala fue muy rápida.');
      assert.equal(t('aprendizaje.linea', { alumnos: '1', n: '1,000', minimo: '10' }), '1 alumno, 1,000 respuestas. Con menos de 10 datos, un número dice «pocos datos».');
      assert.match(t('listo.regla.tiempo', { valor: '1', meta: '7', n: '1', dias: '5' }), /^1 día desde que empezaste \(meta 7\) · 1 día de estudio/);
    } else {
      assert.equal(t('ficha.tiempo.linea', { n: '1' }), 'on 1 different day');
      assert.match(t('listo.suerte.fallas', { n: '2' }), /2 active mistakes/);
    }
  }
});

// ---------- 11. La fecha de fin del plan: la misma para el alumno (al elegir) y para el administrador ----------
import { planDe, elegirPlan } from '../src/academia/plan.js';
test('el plan termina el mismo día para el alumno al elegirlo y para el administrador (hoy es el día 1)', () => {
  const db = abrirBase(configDePrueba());
  try {
    crearUsuario(db, { nombre: 'pia', claveHash: 'x', debeCambiarClave: false });
    const id = idDe(db, 'pia');
    const T = Date.parse('2026-11-12T15:00:00Z');
    const opcion = planDe(db, id, null, T).opciones.find(o => o.id === 'un_mes');
    assert.equal(opcion.fin, '2026-12-11', 'un plan de 30 días que empieza el 12 nov termina el 11 dic');
    const p = elegirPlan(db, id, null, 'un_mes', T);
    assert.equal(p.finPlan, opcion.fin, 'lo que vio al elegir = lo que ve el administrador');
    assert.equal(p.fin, p.finPlan, 'el primer día, el estimado es el mismo');
    assert.equal(p.ritmo, 'a_tiempo');
  } finally {
    db.close();
  }
});

// ---------- 7. El humor: lo duro solo al saltarse las clases ----------
import { lineaHumor, QUEMADO_SUAVE } from '../src/academia/humor.js';
test('las frases duras («te quemaste») solo salen al saltarse las clases; si no aprobó otra vez, solo las que animan', () => {
  const db = abrirBase(configDePrueba());
  try {
    crearUsuario(db, { nombre: 'hugo', claveHash: 'x', debeCambiarClave: false });
    const id = idDe(db, 'hugo');
    const es = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'es.json'), 'utf8'));
    for (let k = 0; k < 20; k++) {
      const h = lineaHumor(db, id, 'quemado', { solo: QUEMADO_SUAVE });
      assert.ok(QUEMADO_SUAVE.includes(Number(h.clave.split('.').pop())), h.clave);
      assert.doesNotMatch(es[h.clave], /quemaste|te pas[oó] por encima|más baja/i, h.clave);
    }
    for (const n of QUEMADO_SUAVE) assert.doesNotMatch(es[`humor.quemado.${n}`], /quemaste/i);
  } finally {
    db.close();
  }
  const app = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  assert.match(app, /if \(res\.aprobado !== false && llego\) celebrar\(zona\);/, 'una práctica sin nota solo se celebra si llegó a la nota para aprobar');
});

// ---------- 8. Términos nuevos: «Qué cambió» ----------
import { publicarDoc, queCambio } from '../src/cuentas/terminos.js';
test('una versión nueva de los términos dice qué cambió (la nota del administrador y las partes nuevas o cambiadas)', () => {
  const db = abrirBase(configDePrueba());
  try {
    crearUsuario(db, { nombre: 'admin2', claveHash: 'x', debeCambiarClave: false });
    const quien = idDe(db, 'admin2');
    publicarDoc(db, 'terminos', [{ titulo: 'Uno', texto: 'Texto uno' }, { titulo: 'Dos', texto: 'Texto dos' }], { hechoPor: quien });
    publicarDoc(db, 'terminos', [{ titulo: 'Uno', texto: 'Texto uno cambiado' }, { titulo: 'Tres', texto: 'Nuevo' }], { hechoPor: quien, cambios: 'Aclaramos la parte uno.' });
    // 0.12.7: el código ya trae la versión 2 de los términos, así que estas son la 3 y la 4.
    const c = queCambio(db, 'terminos', 3);
    assert.deepEqual([c.desde, c.version, c.notas.map(n => n.texto), c.nuevas, c.cambiadas, c.quitadas], [3, 4, ['Aclaramos la parte uno.'], ['Tres'], ['Uno'], ['Dos']]);
    assert.equal(queCambio(db, 'terminos', 4), null, 'al día: nada');
    // La versión 2 del aviso de privacidad que trae el código tiene su «Qué cambió» (en los dos idiomas).
    const p = queCambio(db, 'privacidad', 1);
    assert.deepEqual([p.notas[0]?.clave, p.cambiadas.length], ['terminos.cambio.privacidad_v2', 1]);
    const sinNota = queCambio(db, 'terminos', 1);
    assert.deepEqual(sinNota.notas.map(n => n.clave ?? n.texto), ['terminos.cambio.terminos_v2', 'Aclaramos la parte uno.'], 'las notas de las versiones que no firmó (0.12.7: también la de la v2 del código)');
  } finally {
    db.close();
  }
  const vista = readFileSync(join(RAIZ, 'public', 'terminos-vista.js'), 'utf8');
  assert.match(vista, /cajaCambios\(h, datos\.novedades\)/);
});

// ---------- 12. Bloquear y publicar con la hoja propia de la app (no confirm()/prompt() del navegador) ----------
test('bloquear un alumno y publicar términos usan la hoja propia de la app, no confirm() ni prompt()', () => {
  for (const archivo of ['admin-alumnos.js', 'terminos-vista.js', 'pagos.js']) {
    assert.doesNotMatch(readFileSync(join(RAIZ, 'public', archivo), 'utf8'), /(?<![.\w])(?:confirm|prompt)\(/, archivo);
  }
  const app = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  assert.match(app, /^function confirmar\(texto, \{/m);
  // Quedan solo los dos del modo seguro y cancelar una tarea (devuelven su resultado a quien los llama).
  assert.equal([...app.matchAll(/(?<![.\w])confirm\(/g)].length, 2);
  // El Profesor virtual (pagos.js) entiende «básico» y las citas, y nunca lee ia.estado de un ia = null.
  const pagos = readFileSync(join(RAIZ, 'public', 'pagos.js'), 'utf8');
  assert.match(pagos, /m\.estado === 'basico'/);
  assert.match(pagos, /respuesta\.citas/);
  assert.doesNotMatch(pagos, /x\.datos\.ia\.estado/);
});

test('ninguna clave de texto repetida en es.json ni en en.json (la última pisaría a la primera)', () => {
  for (const idioma of ['es', 'en']) {
    const claves = [...readFileSync(join(RAIZ, 'public', 'i18n', `${idioma}.json`), 'utf8').matchAll(/^ {2}"([^"]+)": /gm)].map(m => m[1]);
    assert.deepEqual(claves.filter((k, i) => claves.indexOf(k) !== i), [], idioma);
  }
});
