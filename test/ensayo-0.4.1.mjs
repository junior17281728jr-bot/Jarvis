// ENSAYO DE VUELTA ATRÁS de la parte e (diseno-1e §16). NO es parte de la suite: necesita la historia de git (el
// actualizador corre las pruebas desde una copia sin historia). Se corre a mano, en el repositorio, antes de cada commit
// de la parte e:   node --no-warnings test/ensayo-0.4.1.mjs
//
// Qué hace (como el actualizador si la 0.5.0 fallara y volviera SOLO el código de la 0.4.1 sobre una base ya en la 6):
//  1. Con el código de AHORA arma una base 6 con filas en TODAS las tablas (también las nuevas: copias_llaves, canales,
//     copias, copia_partes, canal_envios), una clave de IA guardada y una copia cifrada de verdad (en archivos).
//  2. Corre el código REAL de la 0.4.1 (git archive c6b0626) contra esa base: abrirBase (no aplica nada ni hace otra
//     copia), su trabajador se conecta (versión mínima 5), la recuperación de corridas, elegir en cada cupo, las claves,
//     los avisos, la zona de sistema. Nada debe romperse.
//  3. Vuelve la 0.5.0: abre la base sin cambios que aplicar, y la copia hecha antes de volver atrás se restaura igual.
//  4. (paso 2) Lo que deja la tarea copias.hacer en marcha: una clave activa, una copia comprobada, una copia a medias con
//     su tarea «en curso» de un trabajador muerto y otra en la fila, el token del bot, el chat unido, envíos y avisos
//     nuevos sin mandar. La 0.4.1 de verdad: abre, recupera, nunca ofrece la tarea de copias, sus claves y su zona de
//     sistema (también GET /api/admin/claves por su servidor) no se rompen; fila_atrasada puede abrirse y los motivos
//     nuevos se ven «crudos» (esperado). De vuelta en la 0.5.0, la copia termina comprobada contra el Telegram falso y
//     solo se mandan los avisos frescos.
// Nunca usa internet ni una clave de verdad (carga ./ayuda.js primero). Todo en carpetas temporales.
import './ayuda.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { carpetaTemporal } from './ayuda.js';
import { baseCompleta, hacerCopia, CLAVE_DE_PRUEBA, contenido } from './copias-base.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_ANTERIOR = 'c6b0626';
const lineas = [];
const anotar = texto => { lineas.push(texto); console.log(`  ${texto}`); };

// ---------- 0. El código de la 0.4.1, tal como se publicó ----------
const vieja = carpetaTemporal('ensayo-0.4.1');
const extraer = spawnSync('sh', ['-c', `git -C "${RAIZ}" archive ${VERSION_ANTERIOR} | tar -x -C "${vieja}"`], { encoding: 'utf8' });
if (extraer.status !== 0) {
  console.error(`No se pudo sacar la 0.4.1 con git archive (¿estás en el repositorio?): ${extraer.stderr}`);
  process.exit(2);
}
const de041 = ruta => import(pathToFileURL(join(vieja, ruta)).href);
const paquete041 = JSON.parse(spawnSync('cat', [join(vieja, 'package.json')], { encoding: 'utf8' }).stdout);
assert.equal(paquete041.version, '0.4.1');
console.log(`Ensayo de vuelta atrás: 0.5.0 → 0.4.1 (${VERSION_ANTERIOR}) → 0.5.0`);

// ---------- 1. Una base 6 con lo que deja la parte e ----------
const { abrirBase } = await import('../src/nucleo/db.js');
const { restaurarCopia } = await import('../src/copias/restaurar.js');
const b = baseCompleta();
const config = b.config;
const carpeta = carpetaTemporal('ensayo-0.4.1-copia');
const copia = await hacerCopia({ config, carpeta: join(carpeta, 'partes'), tamanoParte: 4096 });
const nuevas = ['copias_llaves', 'canales', 'copias', 'copia_partes', 'canal_envios'];
for (const t of nuevas) assert.ok(b.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n > 0, t);
const antes = contenido(b.db);
b.db.close();
const contarCopias = () => (existsSync(config.carpetaCopias) ? readdirSync(config.carpetaCopias).length : 0);
const copiasAntes = contarCopias();
anotar(`base 6 armada: ${b.tablas.length} tablas con filas (también ${nuevas.join(', ')}), una clave de IA, una copia cifrada de ${copia.partes.length} partes`);

// ---------- 2. La 0.4.1 de verdad contra esa base ----------
{
  const db041 = await de041('src/nucleo/db.js');
  const corridas041 = await de041('src/tareas/corridas.js');
  const cola041 = await de041('src/tareas/cola.js');
  const tipos041 = await de041('src/tareas/tipos.js');
  const proyectos041 = await de041('src/proyectos/proyectos.js');
  const avisos041 = await de041('src/avisos/avisos.js');
  const trabajador041 = await de041('src/tareas/trabajador.js');
  const almacen041 = await de041('src/claves/almacen.js');
  const tareasApi041 = await de041('src/api/tareas.js');
  const db = db041.abrirBase(config);
  try {
    assert.equal(db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 6, 'la 0.4.1 no toca la migración 6');
    assert.equal(contarCopias(), copiasAntes, 'ni hace otra copia antes de cambios');
    assert.equal(trabajador041.VERSION_DE_BASE_NECESARIA, 5);
    db041.conectarBase(config, { versionMinima: trabajador041.VERSION_DE_BASE_NECESARIA }).close();
    const corrida = corridas041.nuevaCorrida(db, { version: '0.4.1', codigo: 'vieja' });
    corridas041.empezarCorrida(db, { corrida, pid: process.pid, vivo: pid => pid === process.pid, registro: tipos041.TIPOS, alFallar: proyectos041.marcarConErrores });
    const tipos = cola041.tiposPermitidos({ registro: tipos041.TIPOS });
    for (const cupo of Object.keys(tipos041.CUPOS)) cola041.elegir(db, { cupo, tipos, ahora: Date.now() });
    const secretos = almacen041.listarSecretos(db, config);
    assert.ok(secretos.some(s => s.uso === 'ia_anthropic'));
    assert.ok(almacen041.estadoAlmacen(db, config));
    avisos041.avisosAbiertos(db);
    assert.ok(cola041.resumenFila(db, { ahora: Date.now() }));
    assert.ok(tareasApi041.estadoDelSistema(db, { version: '0.4.1' }));
    corridas041.terminarCorrida(db, { corrida, como: 'normal', codigo: 0 });
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    anotar('0.4.1: abre la base 6 sin aplicar nada ni copiar, su trabajador conecta (versión mínima 5), recupera corridas, elige en cada cupo; claves, avisos y la zona de sistema se leen; integridad ok');
  } finally {
    db.close();
  }
}

// ---------- 3. Vuelve la 0.5.0 ----------
{
  const db = abrirBase(config);
  try {
    assert.equal(db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 6);
    for (const t of nuevas) assert.deepEqual(contenido(db)[t], antes[t], `la 0.4.1 no tocó ${t}`);
  } finally {
    db.close();
  }
  const destino = join(carpeta, 'restaurada.db');
  const r = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [join(carpeta, 'partes')] }, destino, ajustar: false });
  const restaurada = new DatabaseSync(destino);
  assert.deepEqual(contenido(restaurada), antes);
  restaurada.close();
  anotar(`0.5.0 otra vez: nada que aplicar, las tablas nuevas como estaban, y la copia de antes se restaura igual (${r.tablas} tablas, ${r.filas} filas)`);
}
// ---------- 4. La tarea copias.hacer, el bot y los avisos (paso 2) ----------
{
  const { montar, MINUTO, HORA } = await import('./copias-tarea-base.js');
  const { abrirAviso } = await import('../src/avisos/avisos.js');
  const { encolar } = await import('../src/tareas/cola.js');
  const { crearAvisador } = await import('../src/canales/avisador.js');
  const { hashClave } = await import('../src/cuentas/claves.js');
  const m = await montar({ relleno: 8, manejador: { pasoCortoMs: -1 } });
  try {
    // Una copia buena, y otra que queda a medias (subida la parte 1) con su trabajador muerto.
    assert.equal((await m.terminar(m.pedir())).estado, 'hecha');
    m.avanzar(HORA);
    const enCurso = m.pedir();
    for (let i = 0; i < 40; i++) {
      await m.ejecutor.ciclo();
      await new Promise(l => setTimeout(l, 5));
      const c = m.copias().at(-1);
      if (m.copias().length === 2 && c.estado === 'escrita' && m.partes(c.id).some(p => p.archivo_id)) break;
    }
    // El trabajador «se muere» con la tarea en la mano: se la toma otra vez a la fuerza y no se suelta.
    m.db.prepare("UPDATE tareas SET estado = 'en_curso', dueno = 'corrida-muerta', tomas = tomas + 1, arriendo_hasta = ? WHERE id = ?").run(new Date(m.t - MINUTO).toISOString(), enCurso);
    await m.ejecutor.parar({ esperaMs: 0, devolver: false });
    const enFila = encolar(m.db, { tipo: 'copias.hacer', claveUnica: 'ensayo-en-fila', datos: { origen: 'manual' } }).id;
    const aMedias = m.copias().at(-1);
    assert.ok(['haciendo', 'escrita'].includes(aMedias.estado), aMedias.estado);
    abrirAviso(m.db, { clave: 'copia_atrasada', nivel: 'grave', ahora: m.t });
    abrirAviso(m.db, { clave: 'actualizacion_revertida:abc1234', nivel: 'grave', ahora: m.t });
    abrirAviso(m.db, { clave: 'ia_tope:general:2026-11', nivel: 'atencion', detalle: { pct: 80 }, ahora: m.t });
    abrirAviso(m.db, { clave: 'copias_disco_pronto', nivel: 'atencion', detalle: { dias: 20 }, ahora: m.t - 72 * HORA });
    m.db.prepare("UPDATE secretos SET prueba = 'bot_ocupado' WHERE uso = 'telegram_bot'").run();
    m.db.prepare('UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id = ?').run(await hashClave('una clave bien larga'), m.admin);
    // La 0.4.1 de verdad, con su propia conexión (como el servicio de antes sobre el mismo archivo).
    const db041 = await de041('src/nucleo/db.js');
    const corridas041 = await de041('src/tareas/corridas.js');
    const cola041 = await de041('src/tareas/cola.js');
    const tipos041 = await de041('src/tareas/tipos.js');
    const proyectos041 = await de041('src/proyectos/proyectos.js');
    const avisos041 = await de041('src/avisos/avisos.js');
    const almacen041 = await de041('src/claves/almacen.js');
    const tareasApi041 = await de041('src/api/tareas.js');
    const app041 = await de041('src/app.js');
    const vieja041 = db041.abrirBase(m.config);
    try {
      const corrida = corridas041.nuevaCorrida(vieja041, { version: '0.4.1', codigo: 'vieja' });
      corridas041.empezarCorrida(vieja041, { corrida, pid: process.pid, vivo: pid => pid === process.pid, registro: tipos041.TIPOS, alFallar: proyectos041.marcarConErrores });
      cola041.recuperarAbandonadas(vieja041, { yo: corrida, registro: tipos041.TIPOS, alFallar: proyectos041.marcarConErrores });
      const tipos = cola041.tiposPermitidos({ registro: tipos041.TIPOS });
      assert.ok(!tipos.includes('copias.hacer'));
      for (const cupo of Object.keys(tipos041.CUPOS)) {
        const elegida = cola041.elegir(vieja041, { cupo, tipos, ahora: Date.now() });
        assert.ok(!elegida || elegida.tipo !== 'copias.hacer', 'la 0.4.1 nunca ofrece la tarea de copias');
      }
      assert.ok(!almacen041.listarSecretos(vieja041, m.config).some(s => s.uso === 'telegram_bot'), 'el token del bot no aparece en la 0.4.1');
      assert.equal(almacen041.estadoAlmacen(vieja041, m.config).listo, true);
      const abiertos = avisos041.avisosAbiertos(vieja041).map(a => a.clave);
      for (const k of ['copia_atrasada', 'actualizacion_revertida:abc1234', 'ia_tope:general:2026-11']) assert.ok(abiertos.includes(k), `la 0.4.1 lista ${k} (crudo)`);
      assert.ok(tareasApi041.estadoDelSistema(vieja041, { version: '0.4.1' }));
      // Su servidor: GET /api/admin/claves (con la cuenta de Tailscale del dueño) responde bien.
      const servidor = app041.crearServidor({ db: vieja041, config: m.config });
      await new Promise(l => servidor.listen(0, '127.0.0.1', l));
      try {
        const base = `http://127.0.0.1:${servidor.address().port}`;
        const dueno = { 'Tailscale-User-Login': 'junior@example.com', 'X-Oportia': '1' };
        const entrar = await fetch(`${base}/api/entrar`, { method: 'POST', headers: { ...dueno, 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'junior', clave: 'una clave bien larga' }) });
        assert.equal(entrar.status, 200);
        const galleta = entrar.headers.get('set-cookie').split(';')[0];
        const claves = await fetch(`${base}/api/admin/claves`, { headers: { ...dueno, Cookie: galleta } });
        assert.equal(claves.status, 200);
        const datos = await claves.json();
        assert.deepEqual(datos.grupos.map(g => g.grupo), ['ia']);
        const sistema = await fetch(`${base}/api/admin/sistema`, { headers: { ...dueno, Cookie: galleta } });
        assert.equal(sistema.status, 200);
      } finally {
        await new Promise(l => servidor.close(l));
      }
      corridas041.terminarCorrida(vieja041, { corrida, como: 'normal', codigo: 0 });
      assert.deepEqual(vieja041.prepare('PRAGMA foreign_key_check').all(), []);
      assert.equal(vieja041.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally {
      vieja041.close();
    }
    const tareaVieja = m.tarea(enCurso);
    assert.ok(['lista', 'en_curso'].includes(tareaVieja.estado), tareaVieja.estado);
    anotar(`0.4.1 con la tarea de copias a medias: recupera (queda «${tareaVieja.estado}»), nunca la ofrece, el token del bot no aparece, los avisos nuevos se listan crudos, GET /api/admin/claves y /api/admin/sistema responden; integridad ok`);
    // De vuelta en la 0.5.0: la copia a medias termina (o empieza otra dentro de la misma tarea) y se comprueba.
    m.db.prepare("UPDATE tareas SET estado = 'lista', dueno = NULL, arriendo_hasta = NULL WHERE id = ? AND estado = 'en_curso'").run(enCurso);
    m.db.prepare('UPDATE tareas SET disponible_en = ? WHERE id IN (?, ?)').run(new Date(m.t).toISOString(), enCurso, enFila);
    m.nuevoEjecutor();
    const fin = await m.terminar(enCurso);
    assert.equal(fin.estado, 'hecha');
    const ultima = m.copias().filter(c => c.tarea_id === enCurso).at(-1);
    assert.equal(ultima.estado, 'verificada');
    const deLaFila = await m.terminar(enFila);
    assert.ok(deLaFila.estado === 'hecha');
    // Solo los avisos frescos llegan (el de hace 3 días no).
    const avisador = crearAvisador({ db: m.db, config: m.config, reloj: m.reloj });
    for (let i = 0; i < 6; i++) await avisador.pasada();
    const textos = m.falso.mensajes.filter(x => x.text).map(x => x.text);
    assert.ok(textos.some(t => /abc1234/.test(t)), 'la actualización devuelta llegó');
    assert.ok(!textos.some(t => /20 días/.test(t)), 'el aviso viejo (más de 48 h) no se manda');
    anotar(`0.5.0 otra vez: la copia a medias termina «${ultima.estado}» (${ultima.copia === aMedias.copia ? 'la misma copia' : 'otra copia en la misma tarea'}), la de la fila también, y solo los avisos frescos llegan al chat`);
  } finally {
    await m.cerrar();
  }
}
console.log(`ENSAYO 0.4.1 OK (${lineas.length} etapas)`);
