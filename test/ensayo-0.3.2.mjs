// ENSAYO DE VUELTA ATRÁS (fase 1, parte d, n.º 30 del diseño). NO es parte de la suite: necesita la historia de git
// (el actualizador corre las pruebas desde una copia sin historia). Se corre a mano, en el repositorio, antes de cada
// commit de la parte d:   node --no-warnings test/ensayo-0.3.2.mjs
//
// Qué hace (como el actualizador si la 0.4.0 fallara y volviera SOLO el código de la 0.3.2 sobre una base ya en la 5):
//  1. Con el código de AHORA arma una base 5 con lo que la parte d deja: una versión hecha con IA, dos ayudas
//     'ia.interpretar' (una «en curso» de un trabajador que murió y otra en la fila), una reserva «en curso» de hace
//     20 minutos, una llamada «desconocida» y dos avisos nuevos (ia_tope:… e ia_proveedor:…).
//  2. Corre el código REAL de la 0.3.2 (git archive 39408ba) contra esa base: abrirBase, la recuperación de su
//     trabajador, elegir en cada cupo, el proyecto y sus versiones, los avisos. Nada debe romperse; la 0.3.2 nunca toma
//     una ayuda (no conoce el tipo) y devuelve a la fila la que estaba «en curso».
//  3. Vuelve la 0.4.0: su trabajador (en este proceso, con los manejadores de verdad y el proveedor FALSO) termina las
//     dos ayudas como 'caducada' sin un solo pedido, y la vigilancia cierra la reserva huérfana contando lo apartado:
//     nada se cobra dos veces.
// Nunca usa internet ni una clave de verdad (carga ./ayuda.js primero). Todo en carpetas temporales.
import './ayuda.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { carpetaTemporal, esperarHasta } from './ayuda.js';
import { preparar } from './ia-base.js';
import { crearProveedorFalso } from './proveedor-falso.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_ANTERIOR = '39408ba';
const MIN = 60_000;
const SILENCIO = { log() {}, error() {}, warn() {}, info() {} };
const lineas = [];
const anotar = texto => { lineas.push(texto); console.log(`  ${texto}`); };

// ---------- 0. El código de la 0.3.2, tal como se publicó ----------
const vieja = carpetaTemporal('ensayo-0.3.2');
const extraer = spawnSync('sh', ['-c', `git -C "${RAIZ}" archive ${VERSION_ANTERIOR} | tar -x -C "${vieja}"`], { encoding: 'utf8' });
if (extraer.status !== 0) {
  console.error(`No se pudo sacar la 0.3.2 con git archive (¿estás en el repositorio?): ${extraer.stderr}`);
  process.exit(2);
}
const de032 = ruta => import(pathToFileURL(join(vieja, ruta)).href);
const paquete032 = JSON.parse(spawnSync('cat', [join(vieja, 'package.json')], { encoding: 'utf8' }).stdout);
assert.equal(paquete032.version, '0.3.2');
console.log(`Ensayo de vuelta atrás: 0.4.0 → 0.3.2 (${VERSION_ANTERIOR}) → 0.4.0`);

// ---------- 1. Una base 5 con lo que deja la parte d ----------
const { TIPOS } = await import('../src/tareas/tipos.js');
const { MANEJADORES } = await import('../src/tareas/manejadores.js');
const { crearEjecutor } = await import('../src/tareas/ejecutor.js');
const { crearEscritor } = await import('../src/tareas/escritor.js');
const { encolar } = await import('../src/tareas/cola.js');
const { nuevaCorrida, empezarCorrida } = await import('../src/tareas/corridas.js');
const { espacioDe, crearProyecto } = await import('../src/proyectos/proyectos.js');
const { abrirAviso } = await import('../src/avisos/avisos.js');
const { gastoMicro, mesCobro } = await import('../src/ia/presupuesto.js');
const { abrirBase } = await import('../src/nucleo/db.js');
const { programaDeAyuda } = await import('../src/api/ia.js');

const falso = await crearProveedorFalso();
const b = preparar({ iaBases: { anthropic: falso.base } });
const config = b.config;
const usuario = { id: b.admin, rol: 'admin' };
const espacio = espacioDe(b.db, usuario);
const idDe = numero => b.db.prepare('SELECT id FROM proyectos WHERE espacio_id = ? AND numero = ?').get(espacio.id, numero).id;
const pedirAyuda = (numero, { pedidaEn = Date.now(), version = 1 } = {}) => encolar(b.db, {
  tipo: 'ia.interpretar', espacioId: espacio.id, proyectoId: null, programa: programaDeAyuda(idDe(numero)),
  claveUnica: `${programaDeAyuda(idDe(numero))}:v${version}:${pedidaEn}:${randomUUID()}`,
  datos: { proyecto: numero, version, usuarioId: b.admin, idioma: 'es', pedidaEn, maximoMicro: 5000 }, creadaPor: b.admin,
}).id;
function correr(db, ids, { manejadores = MANEJADORES } = {}) {
  const corrida = nuevaCorrida(db, { version: '0.4.0', codigo: 'ensayo' });
  const escritor = crearEscritor(db, { registro: SILENCIO, dormir: async () => {} });
  const ejecutor = crearEjecutor({
    db, config, corrida, escritor, registro: TIPOS, manejadores, tiempos: { rssMaxMb: 1e9 }, programas: [],
    memoriaDisponibleMb: () => 1000, discoLibreMb: () => 100_000, pedirSalida: () => {}, log: SILENCIO,
  });
  return { corrida, ejecutor, terminar: async () => {
    await esperarHasta(async () => { await ejecutor.ciclo(); return ids().every(id => db.prepare('SELECT estado FROM tareas WHERE id = ?').get(id).estado === 'hecha'); }, { que: 'las tareas hechas', cada: 10 });
    await ejecutor.parar({ esperaMs: 0 });
  } };
}

// Una versión hecha con IA (la ayuda de verdad, contra el proveedor falso).
crearProyecto(b.db, { espacio, usuarioId: b.admin, instrucciones: 'Busco clientes para mi taller de bicicletas en Los Minaslandia' });
falso.siguiente({ tipo: 'ok', json: { tipo: 'comercial', producto: 'reparación de bicicletas', sectores: 'Talleres mecánicos', zonas: 'Santiago', paisCompleto: false, exclusiones: '', tamanos: [], prioridades: '', salarioMinimo: null, salarioMaximo: null, moneda: 'DOP', experienciaNoRequerida: false, dudasResueltas: [0] } });
const primera = pedirAyuda(1);
const r1 = correr(b.db, () => [primera]);
await r1.terminar();
assert.equal(JSON.parse(b.db.prepare('SELECT resultado FROM tareas WHERE id = ?').get(primera).resultado).numero, 2);
// Dos ayudas pedidas hace 20 minutos: una «en curso» de un trabajador que ya no vive, otra en la fila.
crearProyecto(b.db, { espacio, usuarioId: b.admin, instrucciones: 'Vendo paneles solares a hoteles en Punta Cana' });
crearProyecto(b.db, { espacio, usuarioId: b.admin, instrucciones: 'Vendo agua purificada a colmados en La Vega' });
const hace20 = Date.now() - 20 * MIN;
const enCurso = pedirAyuda(2, { pedidaEn: hace20 });
const enFila = pedirAyuda(3, { pedidaEn: hace20 });
const muerta = nuevaCorrida(b.db, { version: '0.4.0', codigo: 'muerta', ahora: hace20 });
b.db.prepare('UPDATE trabajador_corridas SET pid = 999999 WHERE corrida = ?').run(muerta);
b.db.prepare("UPDATE tareas SET estado = 'en_curso', dueno = ?, tomas = 1, empezada_en = ?, arriendo_hasta = ? WHERE id = ?")
  .run(muerta, new Date(hace20).toISOString(), new Date(hace20 + 2 * MIN).toISOString(), enCurso);
const mes = mesCobro(Date.now());
b.db.prepare(`INSERT INTO ia_llamadas (mes, estado, proposito, proveedor, modelo, espacio_id, reservado_micro, creada_en)
  VALUES (?, 'reservada', 'interpretar', 'anthropic', 'claude-haiku-5-5', ?, 2180, ?)`).run(mes, espacio.id, new Date(hace20).toISOString());
b.db.prepare(`INSERT INTO ia_llamadas (mes, estado, resultado, proposito, proveedor, modelo, espacio_id, reservado_micro, costo_micro, creada_en, terminada_en)
  VALUES (?, 'desconocida', 'tiempo_agotado', 'interpretar', 'anthropic', 'claude-haiku-5-5', ?, 2180, 2180, ?, ?)`).run(mes, espacio.id, new Date(hace20).toISOString(), new Date(hace20).toISOString());
abrirAviso(b.db, { clave: `ia_tope:general:${mes}`, nivel: 'info', detalle: { ambito: 'general', mes, umbral: 50, pct: 50, usadoMicro: 1, topeMicro: 2 }, reenviar: true });
abrirAviso(b.db, { clave: 'ia_proveedor:anthropic', nivel: 'grave', detalle: { proveedor: 'anthropic', motivo: 'sin_credito', pausa: 'admin', hasta: null } });
const gastoAntes = gastoMicro(b.db, { mes });
const pedidosAntes = falso.peticiones.length;
b.db.close();
anotar(`base 5 armada: 1 versión hecha con IA, 2 ayudas viejas (en curso + en fila), 1 reserva huérfana, 1 «desconocida», 2 avisos nuevos; gasto ${gastoAntes} µUSD`);

// ---------- 2. La 0.3.2 de verdad contra esa base ----------
{
  const db032 = await de032('src/nucleo/db.js');
  const corridas032 = await de032('src/tareas/corridas.js');
  const cola032 = await de032('src/tareas/cola.js');
  const tipos032 = await de032('src/tareas/tipos.js');
  const proyectos032 = await de032('src/proyectos/proyectos.js');
  const avisos032 = await de032('src/avisos/avisos.js');
  const trabajador032 = await de032('src/tareas/trabajador.js');
  const db = db032.abrirBase(config);
  try {
    assert.equal(db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 5, 'la 0.3.2 no toca la migración 5');
    const conectada = db032.conectarBase(config, { versionMinima: trabajador032.VERSION_DE_BASE_NECESARIA });
    conectada.close();
    assert.equal(trabajador032.VERSION_DE_BASE_NECESARIA, 4);
    const corrida = corridas032.nuevaCorrida(db, { version: '0.3.2', codigo: 'vieja' });
    const r = corridas032.empezarCorrida(db, { corrida, pid: process.pid, vivo: pid => pid === process.pid, registro: tipos032.TIPOS, alFallar: proyectos032.marcarConErrores });
    assert.equal(db.prepare('SELECT estado FROM tareas WHERE id = ?').get(enCurso).estado, 'lista', 'su recuperación devuelve a la fila la ayuda en curso');
    assert.equal(db.prepare('SELECT fallos_seguidos FROM tareas WHERE id = ?').get(enCurso).fallos_seguidos, 0, 'sin contar un fallo');
    const tipos = cola032.tiposPermitidos({ registro: tipos032.TIPOS });
    assert.ok(!tipos.includes('ia.interpretar'));
    for (const cupo of Object.keys(tipos032.CUPOS)) {
      const c = cola032.elegir(db, { cupo, tipos, ahora: Date.now() });
      assert.ok(c == null || c.tipo !== 'ia.interpretar', `la 0.3.2 nunca toma una ayuda (cupo ${cupo})`);
    }
    const detalle = proyectos032.detalleProyecto(db, espacio.id, 1, 'es');
    assert.deepEqual(detalle.versiones.map(v => [v.numero, v.estado, v.origen]), [[2, 'pendiente', 'campos'], [1, 'descartada', 'instrucciones']]);
    assert.equal(detalle.pendiente.numero, 2);
    assert.ok(detalle.historial.some(h => h.accion === 'version_nueva' && h.detalle?.numero === 2), 'el historial la muestra como una versión más');
    const claves = avisos032.avisosAbiertos(db).map(a => a.clave);
    assert.ok(claves.includes(`ia_tope:general:${mes}`) && claves.includes('ia_proveedor:anthropic'), 'los avisos nuevos se listan (la pantalla usa su texto de respaldo)');
    const fila = cola032.resumenFila(db, { ahora: Date.now() });
    assert.ok(fila, 'la zona de sistema se arma');
    corridas032.terminarCorrida(db, { corrida, como: 'normal', codigo: 0 });
    anotar(`0.3.2: abre la base 5, su trabajador conecta (versión mínima 4), recupera ${r.recuperadas?.length ?? 0} tarea(s) sin fallo, nunca toma una ayuda; el proyecto, sus versiones y los avisos se leen`);
  } finally {
    db.close();
  }
}

// ---------- 3. Vuelve la 0.4.0 ----------
{
  const db = abrirBase(config);
  try {
    const vigilar = encolar(db, { tipo: 'sistema.vigilar' }).id;
    const r = correr(db, () => [enCurso, enFila, vigilar]);
    empezarCorrida(db, { corrida: r.corrida, pid: process.pid, vivo: pid => pid === process.pid, registro: TIPOS });
    await r.terminar();
    for (const id of [enCurso, enFila]) {
      const t = JSON.parse(db.prepare('SELECT resultado FROM tareas WHERE id = ?').get(id).resultado);
      assert.deepEqual([t.usada, t.motivo, t.costoMicro], [false, 'caducada', 0]);
    }
    assert.equal(falso.peticiones.length, pedidosAntes, 'ni un pedido a la IA');
    const filas = db.prepare("SELECT estado, resultado, costo_micro FROM ia_llamadas WHERE creada_en < ? ORDER BY id").all(new Date(Date.now() - 10 * MIN).toISOString());
    assert.deepEqual(filas.map(f => [f.estado, f.resultado, f.costo_micro]), [['desconocida', 'interrumpida', 2180], ['desconocida', 'tiempo_agotado', 2180]]);
    assert.equal(gastoMicro(db, { mes }), gastoAntes, 'nada se cobra dos veces');
    anotar(`0.4.0 otra vez: 0 pedidos, las 2 ayudas viejas «caducada», la reserva huérfana cerrada con lo apartado (2180 µUSD), gasto igual (${gastoAntes} µUSD)`);
  } finally {
    db.close();
  }
}
await falso.cerrar();
console.log(`ENSAYO 0.3.2 OK (${lineas.length} etapas)`);
