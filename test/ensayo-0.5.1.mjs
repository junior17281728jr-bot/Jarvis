// ENSAYO DE VUELTA ATRÁS de la Academia (0.7.0 ↔ 0.5.1). NO es parte de la suite: necesita la historia de git (el
// actualizador corre las pruebas desde una copia sin historia). Se corre a mano, en el repositorio:
//   node --no-warnings test/ensayo-0.5.1.mjs
// Qué hace (como el actualizador si la 0.7.0 fallara y volviera SOLO el código de la 0.5.1 sobre una base ya en la 7):
//  1. Con el código de AHORA: una base 7 con filas en TODAS las tablas (también las de la academia), una clave de IA,
//     el paquete de muestra subido y en uso, respuestas de un alumno, y una copia cifrada de verdad (en archivos).
//  2. El código REAL de la 0.5.1 (git archive 54b9bb9) contra esa base: abre sin aplicar nada ni copiar, su trabajador
//     conecta (versión mínima 6), recupera corridas, elige en cada cupo; claves, avisos, zona de sistema; su servidor
//     responde (/api/setup, entrar, /api/admin/sistema, /api/proyectos); su copia cifrada vuelca también las tablas
//     nuevas; y su programa de restaurar recupera la copia hecha con la 0.7.0, igual.
//  3. Vuelve la 0.7.0: nada que aplicar, las filas de la academia como estaban, y el alumno sigue su camino.
// Nunca usa internet ni una clave de verdad (carga ./ayuda.js primero). Todo en carpetas temporales.
import './ayuda.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { carpetaTemporal, conServidor } from './ayuda.js';
import { baseCompleta, hacerCopia, CLAVE_DE_PRUEBA, contenido, llavesDePrueba, llenarTodas } from './copias-base.js';
import { configDePrueba } from './ayuda.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_ANTERIOR = '54b9bb9';
const CLAVE = 'una clave bien larga';
const DUENO = { 'Tailscale-User-Login': 'junior@example.com', 'X-Oportia': '1' };
const lineas = [];
const anotar = texto => { lineas.push(texto); console.log(`  ${texto}`); };

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const h = { ...DUENO, ...cabeceras };
  if (galleta) h.Cookie = galleta;
  if (datos !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers: h, body: datos !== undefined ? JSON.stringify(datos) : cuerpo });
  const c = r.headers.get('set-cookie');
  return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: c ? c.split(';')[0] : null };
}

// ---------- 0. El código de la 0.5.1, tal como está en producción ----------
const vieja = carpetaTemporal('ensayo-0.5.1');
const extraer = spawnSync('sh', ['-c', `git -C "${RAIZ}" archive ${VERSION_ANTERIOR} | tar -x -C "${vieja}"`], { encoding: 'utf8' });
if (extraer.status !== 0) {
  console.error(`No se pudo sacar la 0.5.1 con git archive (¿estás en el repositorio?): ${extraer.stderr}`);
  process.exit(2);
}
const de051 = ruta => import(pathToFileURL(join(vieja, ruta)).href);
assert.equal(JSON.parse(readFileSync(join(vieja, 'package.json'), 'utf8')).version, '0.5.1');
console.log(`Ensayo de vuelta atrás: 0.7.0 → 0.5.1 (${VERSION_ANTERIOR}) → 0.7.0`);

// ---------- 0. Lo que pasa hoy en el servidor: una base 6 de la 0.5.1, con datos, se abre con la 0.7.0 ----------
{
  const { abrirBase: abrir070 } = await import('../src/nucleo/db.js');
  const db051 = await de051('src/nucleo/db.js');
  const usuarios051 = await de051('src/cuentas/usuarios.js');
  const c = configDePrueba();
  const vieja6 = db051.abrirBase(c);
  usuarios051.crearPrimerAdmin(vieja6, { nombre: 'junior', claveHash: 'x' });
  llenarTodas(vieja6, { filasPorTabla: 2 });
  const antes6 = contenido(vieja6);
  assert.equal(vieja6.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 6);
  vieja6.close();
  const nueva = abrir070(c);
  try {
    assert.equal(nueva.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 7);
    const copias = readdirSync(c.carpetaCopias).filter(n => /^oportia-antes-m7-/.test(n));
    assert.equal(copias.length, 1, 'copia completa antes del cambio 7');
    const despues = contenido(nueva);
    for (const [clave, valor] of Object.entries(antes6)) if (clave !== 'oportia_migraciones') assert.deepEqual(despues[clave], valor, clave);
    for (const t of ['academia_paquetes', 'academia_intentos', 'academia_respuestas', 'academia_repaso']) assert.ok(`esquema:${t}` in despues, t);
    assert.equal(nueva.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { nueva.close(); }
  anotar('0.5.1 → 0.7.0: una base 6 con filas en todas sus tablas pasa a la 7 con su copia «antes-m7», todo lo de antes igual y las 4 tablas nuevas');
}

// ---------- 1. Una base 7 con lo de la academia ----------
const { abrirBase } = await import('../src/nucleo/db.js');
const { crearServidor } = await import('../src/app.js');
const { hashClave } = await import('../src/cuentas/claves.js');
const { crearUsuario } = await import('../src/cuentas/usuarios.js');
const b = baseCompleta();
const config = b.config;
b.db.prepare('UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id = ?').run(await hashClave(CLAVE), b.admin);
crearUsuario(b.db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
const nuevas = ['academia_paquetes', 'academia_intentos', 'academia_respuestas', 'academia_repaso'];
await conServidor(crearServidor({ db: b.db, config }), async base => {
  const admin = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } })).galleta;
  const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
  const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(paqueteMuestra()) });
  assert.equal(s.codigo, 201, JSON.stringify(s.datos));
  assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/figura-m1.png`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() })).codigo, 201);
  assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
  const i = (await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } })).datos;
  for (const q of i.preguntas.slice(0, 3)) assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: ana, datos: { pregunta: q.id, elegida: 'A' } })).codigo, 200);
});
for (const t of nuevas) assert.ok(b.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n > 0, t);
const carpeta = carpetaTemporal('ensayo-0.5.1-copia');
const copia = await hacerCopia({ config, carpeta: join(carpeta, 'partes'), tamanoParte: 4096 });
const antes = contenido(b.db);
b.db.close();
const contarCopias = () => (existsSync(config.carpetaCopias) ? readdirSync(config.carpetaCopias).length : 0);
const copiasAntes = contarCopias();
anotar(`base 7 armada: ${b.tablas.length} tablas con filas (también ${nuevas.join(', ')}), el paquete de muestra en uso, respuestas de un alumno y una copia cifrada de ${copia.partes.length} partes`);

// ---------- 2. La 0.5.1 de verdad contra esa base ----------
{
  const db051 = await de051('src/nucleo/db.js');
  const corridas051 = await de051('src/tareas/corridas.js');
  const cola051 = await de051('src/tareas/cola.js');
  const tipos051 = await de051('src/tareas/tipos.js');
  const proyectos051 = await de051('src/proyectos/proyectos.js');
  const avisos051 = await de051('src/avisos/avisos.js');
  const trabajador051 = await de051('src/tareas/trabajador.js');
  const almacen051 = await de051('src/claves/almacen.js');
  const tareasApi051 = await de051('src/api/tareas.js');
  const app051 = await de051('src/app.js');
  const generar051 = await de051('src/copias/generar.js');
  const restaurar051 = await de051('src/copias/restaurar.js');
  const db = db051.abrirBase(config);
  try {
    assert.equal(db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 7, 'la 0.5.1 no toca la migración 7');
    assert.equal(contarCopias(), copiasAntes, 'ni hace otra copia antes de cambios');
    assert.equal(trabajador051.VERSION_DE_BASE_NECESARIA, 6);
    db051.conectarBase(config, { versionMinima: trabajador051.VERSION_DE_BASE_NECESARIA }).close();
    const corrida = corridas051.nuevaCorrida(db, { version: '0.5.1', codigo: 'vieja' });
    corridas051.empezarCorrida(db, { corrida, pid: process.pid, vivo: pid => pid === process.pid, registro: tipos051.TIPOS, alFallar: proyectos051.marcarConErrores });
    cola051.recuperarAbandonadas(db, { yo: corrida, registro: tipos051.TIPOS, alFallar: proyectos051.marcarConErrores });
    const tipos = cola051.tiposPermitidos({ registro: tipos051.TIPOS });
    for (const cupo of Object.keys(tipos051.CUPOS)) cola051.elegir(db, { cupo, tipos, ahora: Date.now() });
    assert.ok(almacen051.listarSecretos(db, config).some(s => s.uso === 'ia_anthropic'));
    avisos051.avisosAbiertos(db);
    assert.ok(tareasApi051.estadoDelSistema(db, { version: '0.5.1' }));
    // Su servidor.
    const servidor = app051.crearServidor({ db, config });
    await conServidor(servidor, async base => {
      const setup = await pedir(base, 'GET', '/api/setup');
      assert.equal(setup.codigo, 200);
      assert.equal(setup.datos.version, '0.5.1');
      assert.equal(setup.datos.base.version, 7);
      const entrar = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } });
      assert.equal(entrar.codigo, 200);
      for (const ruta of ['/api/admin/sistema', '/api/admin/usuarios', '/api/proyectos', '/api/admin/claves', '/api/admin/copias']) {
        assert.equal((await pedir(base, 'GET', ruta, { galleta: entrar.galleta })).codigo, 200, ruta);
      }
      assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: entrar.galleta })).codigo, 404, 'la 0.5.1 no conoce la academia');
    });
    // Su copia cifrada vuelca también las tablas de la academia.
    const foto = db051.abrirFotoDeLectura(config);
    let r051;
    const llaves = llavesDePrueba();
    try {
      r051 = await generar051.generarCopia({ foto: foto.db, publica: llaves.publica, sello: llaves.sello, servidor: 'ensayo', version: '0.5.1', tamanoParte: 65_536, alParte: async () => {} });
    } finally { foto.cerrar(); }
    for (const t of nuevas) assert.ok(r051.porTabla[t] > 0, `la copia de la 0.5.1 lleva ${t}`);
    assert.equal(r051.migracion, 7);
    corridas051.terminarCorrida(db, { corrida, como: 'normal', codigo: 0 });
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    // Su programa de restaurar recupera la copia de la 0.7.0, igual.
    const destino = join(carpeta, 'restaurada-051.db');
    const rr = await restaurar051.restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [join(carpeta, 'partes')] }, destino, ajustar: false });
    const restaurada = new DatabaseSync(destino);
    assert.deepEqual(contenido(restaurada), antes);
    restaurada.close();
    anotar(`0.5.1: abre la base 7 sin aplicar nada ni copiar, su trabajador conecta (mínima 6), recupera y elige; su servidor responde (setup, entrar, sistema, usuarios, proyectos, claves, copias); su copia vuelca ${r051.tablas} tablas (con las 4 de la academia); restaura la copia de la 0.7.0 igual (${rr.tablas} tablas, ${rr.filas} filas); integridad ok`);
  } finally {
    db.close();
  }
}

// ---------- 3. Vuelve la 0.7.0 ----------
{
  const db = abrirBase(config);
  try {
    assert.equal(db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 7);
    assert.equal(contarCopias(), copiasAntes, 'nada que aplicar: ninguna copia nueva');
    const ahora = contenido(db);
    for (const t of [...nuevas, 'ajustes']) assert.deepEqual(ahora[t], antes[t], `la 0.5.1 no tocó ${t}`);
    await conServidor(crearServidor({ db, config }), async base => {
      const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
      const c = await pedir(base, 'GET', '/api/academia/camino', { galleta: ana });
      assert.equal(c.codigo, 200);
      assert.equal(c.datos.paquete.muestra, true);
      const abiertos = c.datos.materias[0].temas.map(t => t.estado);
      assert.deepEqual(abiertos, ['abierto', 'bloqueado']);
      // El intento a medias sigue: se termina de responder.
      const intento = db.prepare("SELECT id FROM academia_intentos WHERE usuario_id = (SELECT id FROM usuarios WHERE nombre = 'ana') AND terminado_en IS NULL ORDER BY id DESC").get();
      const v = await pedir(base, 'GET', `/api/academia/intentos/${intento.id}`, { galleta: ana });
      assert.equal(v.datos.respondidas, 3);
      for (const q of v.datos.preguntas.filter(x => !x.respuesta)) assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${intento.id}/responder`, { galleta: ana, datos: { pregunta: q.id, elegida: 'B' } })).codigo, 200);
      assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${intento.id}/terminar`, { galleta: ana, datos: {} })).codigo, 200);
      assert.equal((await pedir(base, 'GET', '/api/academia/figuras/M1', { galleta: ana })).codigo, 200);
    });
    anotar('0.7.0 otra vez: nada que aplicar, la academia (paquete, intentos, respuestas, repaso y ajustes) como estaba, y el alumno termina su práctica a medias');
  } finally {
    db.close();
  }
}
console.log(`ENSAYO 0.5.1 OK (${lineas.length} etapas)`);
