// Academia 0.14.56: el mapa nuevo del administrador (6 entradas) y «Para hoy». Sin navegador, deterministas:
//  - toda pantalla de antes sigue en su dirección y en alguna entrada (nada se pierde);
//  - las direcciones viejas (grupos, pestañas bajo #admin/…) llevan a una pantalla que existe, sin saltos en cadena;
//  - «Para hoy»: solo lo que pide algo, cada cosa con su botón, lo rojo primero; vacío = «Todo en orden».
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
import { filasBandeja } from '../public/soporte-vista.js';
import { AREAS_ADMIN, AVANZADO_ADMIN, REDIRECCIONES_ADMIN, areaAdmin, itemAvanzado, paraHoy, MINIMO_RESPUESTAS_HOY } from '../public/navegacion.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = archivo => readFileSync(join(RAIZ, archivo), 'utf8');
const app = leer('public/app.js');
const es = JSON.parse(leer('public/i18n/es.json'));
const en = JSON.parse(leer('public/i18n/en.json'));

// Lo que dibujar() sabe abrir (las direcciones exactas y las de #admin/…).
const exactas = new Set([...app.matchAll(/seccion === '([a-z0-9/-]+)'/g)].map(m => m[1]));
// «Notas» va por su expresión (RUTA_NOTAS: #notas, #notas/<materia>…).
assert.match(app, /RUTA_NOTAS\.test\(seccion\) && esAdmin\) return pantallaNotas/);
exactas.add('notas');
// «Registro de la IA» también (#ia-registro y #ia-registro/<alumno>).
assert.match(app, /seccion\.match\(\/\^ia-registro/);
exactas.add('ia-registro');
const PESTANAS = ['estado', 'usuarios', 'trabajo', 'servidor', 'cambios'];
const existe = hash => {
  const s = hash.replace(/^#/, '');
  if (s === 'admin') return true;
  const m = /^admin\/([a-z]+)$/.exec(s);
  if (m) return PESTANAS.includes(m[1]);
  return exactas.has(s);
};

test('6 entradas visibles y pocas sub-pestañas: unas 12 cosas a la vista (antes 28 pestañas en 4 grupos)', () => {
  assert.deepEqual(AREAS_ADMIN.map(a => a.id), ['inicio', 'alumnos', 'mensajes', 'dinero', 'contenido', 'avanzado']);
  for (const a of AREAS_ADMIN) {
    assert.ok(a.sub.length <= 6, `${a.id}: demasiadas sub-pestañas`);
    assert.ok(existe(a.href), `${a.id}: ${a.href} no abre nada`);
    for (const x of a.sub) assert.ok(existe(x.href), `${a.id} → ${x.href} no abre nada`);
  }
  for (const g of AVANZADO_ADMIN) for (const x of g.items) assert.ok(existe(x.href), `Avanzado → ${x.href} no abre nada`);
});

test('ninguna pantalla de antes se pierde: cada una está en una entrada (o en Avanzado)', () => {
  const antes = ['#alumnos', '#como-van', '#notas', '#admin/usuarios', '#respuestas', '#aprendizaje', '#soporte', '#reportes', '#opiniones',
    '#contenido', '#contenido/terminos', '#contenido/videos', '#contenido/fabrica', '#contenido/ia-hizo', '#contenido/pidele', '#contenido/app',
    '#claves', '#pagos', '#ia', '#ia-demo', '#ia-alumnos', '#ia-registro', '#admin/trabajo', '#admin/servidor', '#pago-servidor', '#copias', '#admin/cambios',
    '#competencia/admin', '#reporte', '#contratos'];
  const visibles = new Set([...AREAS_ADMIN.flatMap(a => [a.href, ...a.sub.map(x => x.href)]), ...AVANZADO_ADMIN.flatMap(g => g.items.map(x => x.href))]);
  for (const h of antes) {
    assert.ok(existe(h), `${h} ya no abre`);
    // #reporte y #contratos son botones de la lista de Alumnos (como antes).
    if (!['#reporte', '#contratos'].includes(h)) assert.ok(visibles.has(h), `${h} no está en ninguna entrada`);
  }
  // El Resumen de antes sigue, en Avanzado → «Estado del sistema».
  assert.equal(itemAvanzado('estado').href, '#admin/estado');
});

test('las direcciones viejas llevan a una pantalla que existe, de una vez (sin saltos en cadena)', () => {
  for (const [vieja, nueva] of Object.entries(REDIRECCIONES_ADMIN)) {
    assert.ok(existe(nueva), `#${vieja} → ${nueva}, que no abre nada`);
    assert.ok(!Object.hasOwn(REDIRECCIONES_ADMIN, nueva.slice(1)), `#${vieja} → ${nueva} se vuelve a redirigir`);
    assert.ok(!existe(`#${vieja}`) || vieja.startsWith('admin/'), `#${vieja} es una pantalla de verdad: no se redirige`);
  }
  // Las de los 4 grupos de la 0.12.5 y las de la 0.14.54.
  assert.equal(REDIRECCIONES_ADMIN['admin/dinero'], '#dinero');
  assert.equal(REDIRECCIONES_ADMIN['admin/sistema'], '#avanzado');
  assert.equal(REDIRECCIONES_ADMIN['admin/resumen'], '#admin');
  assert.equal(REDIRECCIONES_ADMIN['admin/telegram'], '#claves');
  assert.equal(REDIRECCIONES_ADMIN['admin/pago'], '#pago-servidor');
  // dibujar() las usa antes que nada (y las importa de navegacion.js, no una copia).
  assert.match(app, /import \{[^}]*REDIRECCIONES_ADMIN[^}]*\} from '\.\/navegacion\.js'/);
  assert.match(app, /Object\.hasOwn\(REDIRECCIONES_ADMIN, seccion\)\) \{ location\.replace\(REDIRECCIONES_ADMIN\[seccion\]\)/);
});

test('cada pantalla marca su entrada (la ficha y el Reporte en Alumnos; Fábrica, Claves y Trabajo en Avanzado)', () => {
  const casos = { inicio: 'inicio', resumen: 'inicio', alumnos: 'alumnos', 'como-van': 'alumnos', notas: 'alumnos', reporte: 'alumnos', contratos: 'alumnos',
    mensajes: 'mensajes', soporte: 'mensajes', reportes: 'mensajes', opiniones: 'mensajes', dinero: 'dinero', pagos: 'dinero', 'pago-servidor': 'dinero',
    contenido: 'contenido', ajustes: 'contenido', terminos: 'contenido', videos: 'contenido', competencia: 'contenido', respuestas: 'contenido',
    avanzado: 'avanzado', estado: 'avanzado', claves: 'avanzado', ia: 'avanzado', fabrica: 'avanzado', trabajo: 'avanzado', copias: 'avanzado', usuarios: 'alumnos', 'ia-alumnos': 'avanzado' };
  for (const [pantalla, area] of Object.entries(casos)) assert.equal(areaAdmin(pantalla).id, area, pantalla);
});

test('los textos del mapa y de «Para hoy» están en los dos idiomas', () => {
  const claves = [...AREAS_ADMIN.flatMap(a => [a.clave, ...a.sub.map(x => x.clave)]), ...AVANZADO_ADMIN.flatMap(g => [`avanzado.grupo.${g.grupo}`, ...g.items.flatMap(x => [x.clave, `avanzado.linea.${x.id.replace(/-/g, '_')}`])])];
  for (const id of ['ayuda', 'reportes', 'pagos', 'copias', 'pago_servidor', 'dinero', 'sin_estudiar', 'les_cuesta', 'modo_seguro']) claves.push(`hoy.ir.${id}`);
  for (const k of claves) { assert.ok(es[k], `es: falta ${k}`); assert.ok(en[k], `en: falta ${k}`); }
});

const AHORA = Date.parse('2026-11-19T15:00:00Z');
test('«Para hoy» vacío cuando nada pide nada', () => {
  assert.deepEqual(paraHoy({ ahora: AHORA }), []);
  assert.deepEqual(paraHoy({ sistema: { soporte: { pendientes: 0, reportes: 0 }, salud: { semaforo: 'verde' }, avisos: { abiertos: [] } }, copiasTono: 'bien', pagosPendientes: 0,
    pagoServidor: { pago: { configurado: true }, proximo: { tono: 'bien', dias: 20 } }, dinero: { topes: [{ id: 'general', topeMicro: 10_000_000, pct: 10 }] }, alumnos: [], ahora: AHORA }), []);
});

test('«Para hoy»: cada cosa con su botón, lo rojo primero, y nada repetido', () => {
  const lista = paraHoy({
    sistema: { soporte: { pendientes: 2, reportes: 1 }, salud: { semaforo: 'rojo' },
      avisos: { abiertos: [{ id: 7, clave: 'reporte_error:3', nivel: 'atencion' }, { id: 8, clave: 'ia_tope:general', nivel: 'grave' }, { id: 9, clave: 'x', nivel: 'info', vistoEn: '2026-11-18' }] } },
    copiasTono: 'mal', pagosPendientes: 3, pagoServidor: { pago: { configurado: true }, proximo: { tono: 'atencion', dias: 2 } },
    dinero: { topes: [{ id: 'general', topeMicro: 10_000_000, pct: 85 }] },
    alumnos: [{ id: 4, nombre: 'ana', rol: 'usuario', ultimaActividad: '2026-11-01T10:00:00Z', respuestas: 3, pct: 10 },
      { id: 5, nombre: 'beto', nombreVisible: 'Beto', rol: 'usuario', ultimaActividad: '2026-11-19T10:00:00Z', respuestas: MINIMO_RESPUESTAS_HOY, pct: 40 },
      { id: 1, nombre: 'junior', rol: 'admin', ultimaActividad: '2026-10-01T10:00:00Z', respuestas: 50, pct: 10 }],
    ahora: AHORA,
  });
  const ids = lista.map(x => x.id);
  assert.deepEqual(ids.slice(0, 3), ['copias', 'servidor', 'aviso-8'], 'lo rojo primero');
  // El aviso que solo informa (el visto ya no cuenta) no se lista: no hay ninguno aquí.
  assert.ok(!ids.includes('avisos-mas'));
  for (const id of ['ayuda', 'reportes', 'pagos', 'pago-servidor', 'dinero', 'sin-estudiar', 'les-cuesta']) assert.ok(ids.includes(id), id);
  // El aviso del reporte no se repite (ya está «1 reporte nuevo»); el visto no sale; el admin no es un alumno.
  assert.ok(!ids.includes('aviso-7'));
  assert.ok(!ids.includes('aviso-9'));
  const porId = Object.fromEntries(lista.map(x => [x.id, x]));
  assert.equal(porId.ayuda.n, 2);
  assert.equal(porId.ayuda.href, '#mensajes');
  assert.equal(porId.pagos.href, '#pagos');
  assert.equal(porId.copias.href, '#copias');
  assert.equal(porId['pago-servidor'].n, 2);
  assert.equal(porId.dinero.href, '#dinero');
  // Uno solo: su ficha directamente.
  assert.equal(porId['sin-estudiar'].href, '#alumno/4');
  assert.equal(porId['les-cuesta'].href, '#alumno/5');
  assert.equal(porId['les-cuesta'].vars.nombre, 'Beto');
  // Cada cosa lleva a una pantalla que existe, y su texto está en los dos idiomas.
  for (const x of lista) {
    if (x.aviso) continue;
    assert.ok(existe(x.href.replace(/^#alumno\/\d+$/, '#alumnos')), x.href);
    assert.ok(es[x.clave] && en[x.clave], x.clave);
  }
});

test('el tope del mes se cambia en un solo lugar (Dinero) y la IA de un alumno, en su ficha', () => {
  const dinero = leer('public/dinero-ia-vista.js');
  assert.equal([...app.matchAll(/topeGeneralUsd/g)].length, 0, 'Avanzado → IA y gastos ya no cambia el tope del mes');
  assert.equal([...dinero.matchAll(/topeGeneralUsd/g)].length, 1);
  assert.doesNotMatch(app, /pantallaClaves[\s\S]{0,400}tarjetaDinero/, 'Claves e IA ya no repite «Dinero de la IA»');
  // Usuarios ya no maneja la IA (solo lleva a la ficha); la ficha tiene «Cuenta» e «IA».
  assert.match(app, /href: `#alumno\/\$\{u\.id\}\/ia`/);
  assert.match(leer('public/admin-alumnos.js'), /PESTANAS_FICHA = Object\.freeze\(\[[^\]]*'cuenta', 'ia'\]\)/);
  // «Mejorar todo» solo en Fábrica (el Estado del sistema lo pide sin él).
  assert.match(app, /irAlFormulario: irAClaveClaude \}, \{ conTodo: false \}\)/);
});

test('«Para hoy»: los avisos que solo informan van en una línea, y el pago del servidor de hoy dice «hoy»', () => {
  const abiertos = [1, 2, 3, 4].map(id => ({ id, clave: `ia_resumen:${id}`, nivel: 'info' }));
  const lista = paraHoy({ sistema: { avisos: { abiertos } }, pagoServidor: { pago: { configurado: true }, proximo: { tono: 'mal', dias: 0 } }, ahora: AHORA });
  assert.deepEqual(lista.map(x => x.id), ['pago-servidor', 'avisos-mas']);
  assert.equal(lista[0].clave, 'hoy.servidor_pago_hoy');
  assert.equal(lista[0].n, undefined);
  assert.deepEqual([lista[1].n, lista[1].href], [4, '#admin/estado']);
  for (const k of ['hoy.servidor_pago_hoy', 'hoy.avisos_mas', 'hoy.avisos_mas.uno', 'hoy.ir.avisos_mas']) assert.ok(es[k] && en[k], k);
});

test('ningún texto manda a los grupos de antes («Dinero e IA», «Sistema →», «→ Usuarios»)', () => {
  for (const [k, v] of Object.entries(es)) if (k !== 'admin.grupo.dinero' && k !== 'admin.grupo.sistema') assert.doesNotMatch(v, /Dinero e IA|Sistema →|→ Usuarios/, k);
  for (const [k, v] of Object.entries(en)) if (!k.startsWith('admin.grupo.')) assert.doesNotMatch(v, /Money (?:and|&) AI|System →|→ Users/, k);
});

test('el número de Mensajes (en la entrada) es el mismo que el de «Por responder» en la bandeja', async () => {
  const CLAVE = 'una clave bien larga';
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { reloj: () => AHORA } });
  const pedir = async (base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) => {
    const o = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
    if (galleta) o.headers.Cookie = galleta;
    if (datos !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(datos); }
    const r = await fetch(`${base}${ruta}`, o);
    const sc = r.headers.get('set-cookie');
    return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: sc ? sc.split(';')[0] : null };
  };
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    const cuenta = async () => {
      const [sis, sop, rep] = await Promise.all(['/api/admin/sistema', '/api/admin/soporte', '/api/admin/reportes'].map(r => pedir(base, 'GET', r, { galleta: admin })));
      const entrada = (sis.datos.soporte?.pendientes ?? 0) + (sis.datos.soporte?.reportes ?? 0);
      return [entrada, filasBandeja(sop.datos, rep.datos).porResponder.length];
    };
    const t1 = await pedir(base, 'POST', '/api/soporte', { galleta: ana, datos: { categoria: 'pregunta', texto: 'No entiendo la hipoxia' } });
    await pedir(base, 'POST', '/api/soporte', { galleta: ana, datos: { categoria: 'cuenta', texto: 'Olvidé algo' } });
    const r1 = await pedir(base, 'POST', '/api/soporte/reporte', { galleta: ana, datos: { texto: 'El botón no responde', contexto: { pantalla: '#inicio' } } });
    assert.equal(r1.codigo, 201);
    assert.deepEqual(await cuenta(), [3, 3]);
    // El administrador responde uno y marca el reporte como visto: los dos números bajan juntos.
    assert.equal((await pedir(base, 'POST', `/api/admin/soporte/${t1.datos.ticket.id}`, { galleta: admin, datos: { texto: 'Te explico' } })).codigo, 200);
    const idRep = (await pedir(base, 'GET', '/api/admin/reportes', { galleta: admin })).datos.reportes[0].id;
    await pedir(base, 'POST', `/api/admin/reportes/${idRep}`, { galleta: admin, datos: { estado: 'visto' } });
    const [entrada, bandeja] = await cuenta();
    assert.equal(entrada, bandeja);
    assert.equal(bandeja, 1);
  });
  db.close();
});
