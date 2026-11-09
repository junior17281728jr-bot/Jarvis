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
// El paso 2 de la parte e agrega aquí la tarea copias.hacer, el bot y los avisos (§16).
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
console.log(`ENSAYO 0.4.1 OK (${lineas.length} etapas)`);
