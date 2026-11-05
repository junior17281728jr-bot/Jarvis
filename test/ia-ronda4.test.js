// Fase 1, parte d: los arreglos de la ronda 4 de revisión (pantallas y textos), cada uno con su prueba.
//  1. Cambiar el tope con la clave en pausa (sin crédito) no apaga la IA: sigue «En espera» y vuelve al reanudar.
//     Si un cambio sí la apaga (tope en US$0, el último «Usar …»), la respuesta dice por qué (apagadaPor).
//  2. Sin ningún proveedor encendido, lo que falta es «un proveedor» (no la clave ni el precio, que están bien).
//  3. «Probar y reanudar» con la IA apagada lo dice (iaEncendida: false); cambiar la clave dice que la nueva funciona.
//  4. Los textos: la ayuda sirve para cualquier versión que espera aprobación; Inicio no le dice a cada cuenta «tú».
//  5. Inicio y la barra del gasto dicen el mismo estado que la tarjeta (en espera, tope lleno en rojo).
//  6. La línea de la ayuda en un proyecto: «la IA está apagada» cuando es la IA; otro administrador no recibe «enciéndela».
// Todo contra el proveedor FALSO (test/proveedor-falso.js) en 127.0.0.1: nunca una API de verdad ni una clave de verdad.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T0, claveAnthropic, preparar } from './ia-base.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { pausarSecreto, reanudarSecreto } from '../src/claves/almacen.js';
import { leerConfigIa, guardarConfigIa, faltaParaEncender, apagarSiNoQuedaProveedor } from '../src/ia/config.js';
import { estadoIA } from '../src/ia/consumo.js';
import { POLITICA } from '../src/ia/politica.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { vistaAyudaIa, partesBarraGasto, lineaIaInicio, cosasParaEncender, apagarProveedorApagaIa } from '../public/ia-vista.js';

const RAIZ = join(import.meta.dirname, '..');
const leer = archivo => readFileSync(join(RAIZ, archivo), 'utf8');
const ES = JSON.parse(leer('public/i18n/es.json'));
const EN = JSON.parse(leer('public/i18n/en.json'));
const appJs = leer('public/app.js');
const ultimaAuditoria = db => JSON.parse(db.prepare("SELECT detalle FROM auditoria WHERE accion = 'ia_config' ORDER BY id DESC LIMIT 1").get().detalle);

// ---------- 1 y 2. La configuración ----------

test('ronda 4 (1): con la clave en pausa por falta de saldo, cambiar el tope NO apaga la IA (sigue «En espera») y al reanudar vuelve', () => {
  const b = preparar({ ahora: T0 });
  try {
    assert.equal(POLITICA.sin_credito.pausa, 'admin', 'sin crédito es una pausa del dueño');
    pausarSecreto(b.db, { id: b.secretoId, motivo: 'sin_credito', hastaMs: null, ahora: T0 });
    assert.equal(estadoIA(b.db, { config: b.config, esDueno: true, ahora: T0 }).estado, 'sin_uso');
    const informe = {};
    const nueva = guardarConfigIa(b.db, { topeGeneralMicro: 5_000_000 }, { config: b.config, usuarioId: b.admin, origen: 'pantalla', ahora: T0, informe });
    assert.deepEqual([nueva.encendida, nueva.topeGeneralMicro, informe.apagadaPor], [true, 5_000_000, null]);
    assert.deepEqual(ultimaAuditoria(b.db), { antes: { topeGeneralMicro: 2_000_000 }, despues: { topeGeneralMicro: 5_000_000 }, origen: 'pantalla' });
    assert.equal(estadoIA(b.db, { config: b.config, esDueno: true, ahora: T0 }).estado, 'sin_uso', 'sigue «En espera»');
    // Cambiar o desactivar OTRA cosa de las claves tampoco la apaga por la pausa.
    assert.equal(apagarSiNoQuedaProveedor(b.db, b.config, { usuarioId: b.admin, ahora: T0 }), false);
    // Apagar el proveedor sí la apaga (y dice por qué); volver a ENCENDER con la clave en pausa no se puede.
    reanudarSecreto(b.db, { id: b.secretoId, usuarioId: b.admin });
    const e = estadoIA(b.db, { config: b.config, esDueno: true, ahora: T0 });
    assert.deepEqual([e.encendida, e.estado], [true, 'encendida'], 'reanudada: vuelve sola');
    pausarSecreto(b.db, { id: b.secretoId, motivo: 'sin_credito', hastaMs: null, ahora: T0 });
    guardarConfigIa(b.db, { encendida: false }, { config: b.config, ahora: T0 });
    assert.deepEqual(faltaParaEncender(b.db, b.config, leerConfigIa(b.db), T0), ['clave'], 'encender exige una clave sin pausa');
    assert.throws(() => guardarConfigIa(b.db, { encendida: true }, { config: b.config, ahora: T0 }), x => x.clave === 'ia_falta' && x.detalle?.faltan?.[0] === 'clave');
  } finally {
    b.db.close();
  }
});

test('ronda 4 (1 y 2): el tope en US$0 o el último «Usar …» apagan la IA y lo dicen; sin proveedor lo que falta es «proveedor»', () => {
  const b = preparar({ ahora: T0 });
  try {
    let informe = {};
    let cfg = guardarConfigIa(b.db, { usar: { anthropic: false } }, { config: b.config, usuarioId: b.admin, ahora: T0, informe });
    assert.deepEqual([cfg.encendida, informe.apagadaPor], [false, ['proveedor']]);
    assert.deepEqual(ultimaAuditoria(b.db).apagadaPor, ['proveedor']);
    assert.deepEqual(faltaParaEncender(b.db, b.config, leerConfigIa(b.db), T0), ['proveedor'], 'ni «clave» ni «precio»: están bien');
    assert.deepEqual(cosasParaEncender(['proveedor']), ['proveedor', 'tope']);
    assert.deepEqual(cosasParaEncender(['clave']), ['clave', 'tope', 'precio']);
    cfg = guardarConfigIa(b.db, { usar: { anthropic: true } }, { config: b.config, ahora: T0 });
    assert.deepEqual([cfg.encendida, faltaParaEncender(b.db, b.config, cfg, T0)], [false, []], 'encender otra vez es una decisión del dueño');
    guardarConfigIa(b.db, { encendida: true }, { config: b.config, ahora: T0 });
    informe = {};
    cfg = guardarConfigIa(b.db, { topeGeneralMicro: 0 }, { config: b.config, ahora: T0, informe });
    assert.deepEqual([cfg.encendida, informe.apagadaPor], [false, ['tope']]);
    // Sin informe, todo igual (la consola y las otras llamadas no cambian).
    guardarConfigIa(b.db, { topeGeneralMicro: 2_000_000 }, { config: b.config, ahora: T0 });
    assert.equal(guardarConfigIa(b.db, { encendida: true }, { config: b.config, ahora: T0 }).encendida, true);
  } finally {
    b.db.close();
  }
});

// ---------- 1, 3 y 6. Por las rutas ----------

async function pedirHttp(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  const r = await fetch(`${base}${ruta}`, opciones);
  const texto = await r.text();
  let cuerpo = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = {}; }
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: cuerpo, galleta: setCookie ? setCookie.split(';')[0] : null, texto };
}

test('ronda 4 (1, 3 y 6): por las rutas, apagadaPor, iaEncendida al reanudar, y la línea de la ayuda para el dueño y para otro administrador', async () => {
  const falso = await crearProveedorFalso();
  const config = { ...configDePrueba(), iaBases: { anthropic: falso.base } };
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, supervisor: { despertar() {} } });
  const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
  const AYUDANTE = { 'Tailscale-User-Login': 'ayudante@example.com' };
  const FUNNEL = { 'Tailscale-Funnel-Request': '?1' };
  const CLAVE = 'una clave bien larga';
  try {
    await conServidor(servidor, async base => {
      const pedir = (metodo, ruta, opciones) => pedirHttp(base, metodo, ruta, opciones);
      const admin = (await pedir('POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      const comoDueno = (metodo, ruta, opciones = {}) => pedir(metodo, ruta, { galleta: admin, ...opciones, cabeceras: DUENO });
      const clave = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic() } });
      assert.deepEqual([clave.codigo, clave.datos.prueba.motivo], [201, 'ok']);
      const secretoId = clave.datos.secreto.id;
      assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topeGeneralUsd: '2' } })).datos.apagadaPor, null);
      let r = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true, ayudaProyectos: true } });
      assert.deepEqual([r.datos.encendida, r.datos.apagadaPor], [true, null]);
      // Antes de apagar el último proveedor, la pantalla pregunta (con lo que respondió el servidor).
      assert.equal(apagarProveedorApagaIa(r.datos, 'anthropic'), true);
      assert.equal(apagarProveedorApagaIa({ ...r.datos, encendida: false }, 'anthropic'), false);
      r = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { usar: { anthropic: false } } });
      assert.deepEqual([r.codigo, r.datos.encendida, r.datos.apagadaPor, r.datos.faltan], [200, false, ['proveedor'], ['proveedor']]);
      await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { usar: { anthropic: true } } });
      await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true } });
      // La clave queda en pausa por falta de saldo: subir el tope no apaga la IA.
      pausarSecreto(db, { id: secretoId, motivo: 'sin_credito', hastaMs: null });
      r = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topeGeneralUsd: '5' } });
      assert.deepEqual([r.datos.encendida, r.datos.estado, r.datos.apagadaPor, r.datos.topeGeneralMicro], [true, 'sin_uso', null, 5_000_000]);
      assert.deepEqual(lineaIaInicio(r.datos), { clave: 'inicio.ia_espera', tono: 'atencion', lleno: false }, 'Inicio dice «en espera»');
      // Reanudar con la IA encendida: iaEncendida true. Con la IA apagada: lo dice.
      let p = await comoDueno('POST', `/api/admin/claves/${secretoId}/probar`, { datos: { reanudar: true } });
      assert.deepEqual([p.datos.prueba.motivo, p.datos.reanudada, p.datos.iaEncendida], ['ok', true, true]);
      pausarSecreto(db, { id: secretoId, motivo: 'sin_credito', hastaMs: null });
      assert.equal((await pedir('POST', '/api/admin/ia/apagar', { galleta: admin, cabeceras: FUNNEL })).datos.encendida, false);
      p = await comoDueno('POST', `/api/admin/claves/${secretoId}/probar`, { datos: { reanudar: true } });
      assert.deepEqual([p.datos.reanudada, p.datos.iaEncendida], [true, false]);
      assert.equal(JSON.stringify(p.datos).includes(claveAnthropic()), false);
      // La ayuda en un proyecto, con la IA apagada (y «Ayuda en proyectos» encendida).
      assert.equal((await comoDueno('POST', '/api/proyectos', { datos: { instrucciones: 'Busco clientes para mi taller de bicicletas en Santiago' } })).codigo, 201);
      let g = await comoDueno('GET', '/api/proyectos/1/ayuda-ia');
      assert.deepEqual([g.datos.motivo, g.datos.esAdmin, g.datos.esDueno], ['ia_apagada', true, true]);
      assert.equal(vistaAyudaIa(g.datos).vista, 'ia_apagada_admin');
      // Por el enlace público, con la IA apagada: eso es lo que se dice (no «se pide desde Tailscale»).
      g = await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: admin, cabeceras: FUNNEL });
      assert.deepEqual([g.datos.disponible, g.datos.motivo, g.datos.esAdmin, g.datos.esDueno, 'maximoMicro' in g.datos], [false, 'ia_apagada', true, null, false]);
      assert.equal(vistaAyudaIa(g.datos).vista, 'ia_apagada_admin');
      // Otro administrador (un ayudante): no se le manda a un interruptor que no tiene.
      const creado = await comoDueno('POST', '/api/admin/usuarios', { datos: { nombre: 'ayudante', rol: 'admin' } });
      const entrada = await pedir('POST', '/api/entrar', { datos: { nombre: 'ayudante', clave: creado.datos.claveTemporal } });
      assert.equal((await pedir('POST', '/api/yo/clave', { datos: { actual: creado.datos.claveTemporal, nueva: CLAVE }, galleta: entrada.galleta })).codigo, 200);
      const ayudante = (metodo, ruta, opciones = {}) => pedir(metodo, ruta, { galleta: entrada.galleta, ...opciones, cabeceras: AYUDANTE });
      assert.equal((await ayudante('POST', '/api/proyectos', { datos: { instrucciones: 'Vendo paneles solares a hoteles en Punta Cana' } })).codigo, 201);
      g = await ayudante('GET', '/api/proyectos/1/ayuda-ia');
      assert.deepEqual([g.datos.motivo, g.datos.esAdmin, g.datos.esDueno], ['ia_apagada', true, false]);
      assert.equal(vistaAyudaIa(g.datos).vista, 'apagada_otro');
      // Con la IA encendida y la ayuda apagada, por el enlace público: «Ayuda en proyectos» apagada.
      await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true } });
      await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { ayudaProyectos: false } });
      g = await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: admin, cabeceras: FUNNEL });
      assert.equal(g.datos.motivo, 'ayuda_no_activada');
      assert.equal(vistaAyudaIa(g.datos).vista, 'apagada_admin');
      // Con todo encendido, por el enlace público sigue «solo desde Tailscale» (prueba 19).
      await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { ayudaProyectos: true } });
      g = await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: admin, cabeceras: FUNNEL });
      assert.equal(g.datos.motivo, 'solo_tailnet');
      // Cambiar la clave con la IA encendida: la apaga por seguridad, la prueba de la nueva pasa (la pantalla lo dice así).
      const nueva = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic('w') } });
      assert.deepEqual([nueva.datos.iaApagada, nueva.datos.prueba.motivo], [true, 'ok']);
    });
  } finally {
    db.close();
    await falso.cerrar();
  }
});

// ---------- 3, 4 y 5. Las pantallas y los textos ----------

test('ronda 4 (5): la barra y el número del gasto son rojos con «Tope lleno» aunque no sea el 100 %; Inicio dice el estado', () => {
  assert.equal(partesBarraGasto({ usadoMicro: 8400, topeMicro: 10_000 }).tono, 'atencion');
  assert.equal(partesBarraGasto({ usadoMicro: 8400, topeMicro: 10_000, lleno: true }).tono, 'mal');
  assert.equal(partesBarraGasto({ usadoMicro: 1_998_000, topeMicro: 2_000_000, lleno: true }).tono, 'mal');
  assert.equal(lineaIaInicio({ encendida: false, estado: 'apagada' }), null);
  assert.deepEqual(lineaIaInicio({ encendida: true, estado: 'tope_lleno', usadoMicro: 8400, topeGeneralMicro: 10_000 }), { clave: 'inicio.ia_tope_lleno', tono: 'mal', lleno: true });
  assert.deepEqual(lineaIaInicio({ encendida: true, estado: 'sin_uso', motivo: 'proveedor_en_pausa' }), { clave: 'inicio.ia_espera', tono: 'atencion', lleno: false });
  assert.deepEqual(lineaIaInicio({ encendida: true, estado: 'encendida', usadoMicro: 0, topeGeneralMicro: 2_000_000 }), { clave: 'inicio.ia_encendida', tono: 'bien', lleno: false });
  // En la pantalla: Inicio usa la línea con estado, y #ia, Servicios e Inicio pasan «lleno» a la barra.
  assert.match(appJs, /function lineaIa\(ia\) \{\s+const l = lineaIaInicio\(ia\);/);
  assert.doesNotMatch(appJs, /ia\?\.encendida \? el\('a', \{ class: 'linea-ia'/);
  assert.match(appJs, /topeMicro: s\.topeGeneralMicro, lleno: s\.estado === 'tope_lleno' \}/);
  assert.match(appJs, /topeMicro: s\.topeGeneralMicro, lleno \}\)/);
  assert.match(appJs, /topeMicro: ia\.topeGeneralMicro, lleno: l\.lleno \}/);
});

test('ronda 4 (1, 2 y 3): las pantallas dicen por qué se apagó la IA y ofrecen volver a encenderla', () => {
  for (const clave of ['ia.apagada_por', 'ia.apagada_por.proveedor', 'ia.apagada_por.tope', 'ia.apagada_por.clave', 'ia.apagada_por.precio', 'ia.falta.proveedor',
    'ia.proveedor.apagar_ia.confirmar', 'ia.abrir', 'claves.reanudada_ia_apagada', 'claves.ia_apagada_cambio', 'inicio.ia_espera', 'inicio.ia_tope_lleno',
    'ayuda_ia.ia_apagada_admin', 'ayuda_ia.apagada_otro']) {
    assert.ok(ES[clave] && EN[clave], clave);
    assert.match(appJs, new RegExp(`t\\('${clave.replaceAll('.', '\\.')}'`), `${clave} se usa en la pantalla`);
  }
  // El aviso de la IA apagada sale de lo que respondió el servidor, no en silencio.
  assert.match(appJs, /const apagadaPor = Array\.isArray\(x\.datos\.apagadaPor\) \? x\.datos\.apagadaPor : \[\];/);
  // La clave nueva funciona: no se dice «ya no queda una clave que funcione».
  assert.match(appJs, /if \(x\.datos\.iaApagada && m === 'ok'\) return recargar\(\{ texto: `\$\{guardadaTexto\} \$\{t\('claves\.ia_apagada_cambio'\)\}`, clase: 'aviso', enlace: abrirIa \}\);/);
  // Reanudada con la IA apagada: se dice, con el atajo.
  assert.match(appJs, /x\.datos\.reanudada && x\.datos\.iaEncendida === false\) return recargar\(\{ texto: t\('claves\.reanudada_ia_apagada'\), clase: 'aviso', enlace: abrirIa \}\)/);
  // Apagar el último proveedor pregunta antes.
  assert.match(appJs, /if \(apagarProveedorApagaIa\(s, c\.id\) && !confirm\(t\('ia\.proveedor\.apagar_ia\.confirmar'/);
  assert.match(appJs, /cosasParaEncender\(faltan\)\.map/);
});

test('ronda 4 (4): la ayuda sirve para cualquier versión que espera aprobación; Inicio no dice «tú la enciendes» a cada cuenta; la versión con IA', () => {
  assert.doesNotMatch(ES['ia.ayuda.confirmar'], /todavía no tienen una versión aprobada/);
  assert.match(ES['ia.ayuda.confirmar'], /un cambio a uno que ya funciona/);
  assert.match(ES['ia.ayuda.confirmar'], /trabajo automático/);
  assert.doesNotMatch(EN['ia.ayuda.confirmar'], /no approved version yet/);
  assert.match(EN['ia.ayuda.confirmar'], /a change to one that already runs/);
  assert.match(EN['ia.ayuda.confirmar'], /automatic work/);
  assert.doesNotMatch(ES['inicio.funciona.6'], /tú/);
  assert.doesNotMatch(EN['inicio.funciona.6'], /\byou\b/i);
  // En «Ver en palabras» de una versión hecha con IA, las filas de IA dicen que son del trabajo automático.
  assert.match(ES['campo.ia'], /trabajo automático/);
  assert.match(ES['campo.costo'], /trabajo automático/);
  assert.match(EN['campo.ia'], /automatic work/);
  assert.match(EN['campo.costo'], /automatic work/);
  assert.match(leer('README.md'), /Sirve para cualquier versión que espera aprobación: un proyecto nuevo o un cambio a uno que ya funciona/);
});

test('ronda 4 (6): la línea de la ayuda dice qué está apagado y a quién le toca', () => {
  const base = { disponible: false, esAdmin: true, tarea: null };
  assert.equal(vistaAyudaIa({ ...base, motivo: 'ia_apagada' }).vista, 'ia_apagada_admin');
  assert.equal(vistaAyudaIa({ ...base, motivo: 'ia_apagada', esDueno: true }).vista, 'ia_apagada_admin');
  assert.equal(vistaAyudaIa({ ...base, motivo: 'ayuda_no_activada', esDueno: true }).vista, 'apagada_admin');
  assert.equal(vistaAyudaIa({ ...base, motivo: 'ia_apagada', esDueno: false }).vista, 'apagada_otro');
  assert.equal(vistaAyudaIa({ ...base, motivo: 'ayuda_no_activada', esDueno: false }).vista, 'apagada_otro');
  assert.equal(vistaAyudaIa({ ...base, motivo: 'ia_apagada', esDueno: null }).vista, 'ia_apagada_admin', 'por el enlace público no se sabe: la línea del dueño');
  assert.match(ES['ayuda_ia.ia_apagada_admin'], /Administrador → Inteligencia artificial\./);
  assert.doesNotMatch(ES['ayuda_ia.ia_apagada_admin'], /Ayuda en proyectos/);
  assert.match(ES['ayuda_ia.apagada_otro'], /dueño/);
  assert.match(EN['ayuda_ia.apagada_otro'], /owner/);
});
