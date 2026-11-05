// Pruebas de la fila de tareas 24/7 (fase 1, parte c). Todo corre en este mismo proceso, con un reloj fijo y
// tipos de prueba inyectados: sin procesos aparte, sin esperas de verdad, sin internet.
import { configDePrueba, carpetaTemporal, conServidor, esperarHasta, huellas } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { abrirBase, estadoBase, enTransaccion, conectarBase } from '../src/nucleo/db.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { marcarConErrores } from '../src/proyectos/proyectos.js';
import { TIPOS, CUPOS, PROGRAMAS_DEL_SISTEMA, ErrorTarea, esperar, definicion, tiposEjecutables } from '../src/tareas/tipos.js';
import { ranura, horarioRepartido } from '../src/tareas/tiempo.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import {
  ESTADOS_TAREA, EVENTOS, encolar, elegir, marcarTomada, guardarPaso, normalizarSalida, salidaDeError, escritorDeTarea,
  devolverLasMias, recuperarAbandonadas, recuperarVencidas, programar, programasDeProyectos, proximasEjecuciones,
  reintentar, cancelar, resumenFila, erroresRecientes, listarTareas, tareasDelEspacio, tiposPermitidos, esperaDeReintento,
} from '../src/tareas/cola.js';
import { nuevaCorrida, empezarCorrida, terminarCorrida, marcarListo, latir, salidasAnormales, COMO_TERMINA } from '../src/tareas/corridas.js';
import {
  leerModoSeguro, ponerModoSeguro, revisarAlArrancar, registrarArranque, registrarCierre, leerFrenos, frenarTipo, soltarFreno,
  crearCuentaDeFallos, SE_LEVANTAN_CON_CODIGO_NUEVO,
} from '../src/tareas/modo-seguro.js';
import { abrirAviso, resolverAviso, marcarVisto, avisosAbiertos, avisosRecientes, sincronizarAvisos } from '../src/avisos/avisos.js';
import { medirSalud, evaluarSalud, semaforo, guardarMuestra, historialSalud } from '../src/nucleo/salud.js';
import { crearEjecutor } from '../src/tareas/ejecutor.js';
import { MANEJADORES } from '../src/tareas/manejadores.js';
import { crearServidor } from '../src/app.js';
import { MANEJADORES_PRUEBA, REGISTRO_PRUEBA, CONCURRENCIA, reiniciarConcurrencia, ENVIOS } from './tareas-prueba.js';

const T0 = Date.parse('2026-11-04T10:05:00Z');
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const MITAD = () => 0.5;
const SILENCIO = { warn() {}, log() {}, error() {} };

// Tipos de prueba: solo existen en las pruebas (nunca en src/).
const REGISTRO = {
  ...TIPOS,
  'prueba.eco': {},
  'prueba.grande': { cupo: 'grande' },
  'prueba.correo': { repetible: false },
  'prueba.futuro': { fase: 2 },
};
const TIPOS_PRUEBA = tiposEjecutables(REGISTRO);
const POR_DEFECTO_REINTENTOS = definicion('prueba.eco', REGISTRO).reintentos;

function nuevaBase() {
  const config = configDePrueba();
  return { db: abrirBase(config), config };
}

function crearCuenta(db, nombre = 'cuenta') {
  return Number(db.prepare('INSERT INTO espacios (nombre, creado_en) VALUES (?, ?)').run(nombre, new Date(T0).toISOString()).lastInsertRowid);
}

function crearProyecto(db, espacioId, { estado = 'en_ejecucion', papelera = 0 } = {}) {
  const fecha = new Date(T0).toISOString();
  // Desde la 0.2.0 cada proyecto lleva su número dentro de su espacio (1, 2, 3…).
  const numero = Number(db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM proyectos WHERE espacio_id = ?').get(espacioId).n);
  return Number(db.prepare('INSERT INTO proyectos (espacio_id, numero, nombre, estado, en_papelera, creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(espacioId, numero, 'Proyecto de prueba', estado, papelera, fecha, fecha).lastInsertRowid);
}

function crearAdmin(db, nombre = 'admin') {
  return Number(db.prepare("INSERT INTO usuarios (nombre, clave_hash, rol, creado_en) VALUES (?, 'x', 'admin', ?)")
    .run(nombre, new Date(T0).toISOString()).lastInsertRowid);
}

function fila(db, id) {
  return { ...db.prepare('SELECT * FROM tareas WHERE id = ?').get(id) };
}

function eventos(db, id) {
  return db.prepare('SELECT evento FROM tarea_eventos WHERE tarea_id = ? ORDER BY id').all(id).map(e => e.evento);
}

function poner(db, tipo, extra = {}, ahora = T0) {
  return encolar(db, { tipo, ...extra }, { registro: REGISTRO, ahora }).id;
}

function tomar(db, { cupo = 'normal', tipos = TIPOS_PRUEBA, corrida = 'corrida-1', ahora = T0, ocupados = [], arriendoMs } = {}) {
  const candidata = elegir(db, { cupo, tipos, ocupados, ahora });
  return candidata ? marcarTomada(db, { candidata, corrida, ahora, ...(arriendoMs ? { arriendoMs } : {}) }) : null;
}

function guardar(db, tarea, salida, { corrida = 'corrida-1', ahora = T0, duracionMs = 10, alFallar = marcarConErrores } = {}) {
  return guardarPaso(db, { tarea, corrida, salida, duracionMs, ahora, azar: MITAD, alFallar, registro: REGISTRO });
}

// ---------- 1. Migración 4 ----------
test('migración 4: crea las tablas e índices de la fila, y abrir otra vez no repite nada', () => {
  const { db, config } = nuevaBase();
  const nombres = tipo => new Set(db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all(tipo).map(f => f.name));
  const tablas = nombres('table');
  for (const t of ['tareas', 'tarea_eventos', 'tarea_carriles', 'trabajador_corridas', 'servidor_arranques', 'salud_muestras', 'avisos']) {
    assert.ok(tablas.has(t), `falta la tabla ${t}`);
  }
  const indices = nombres('index');
  for (const i of ['tareas_por_tomar', 'tareas_terminadas', 'tareas_por_espacio', 'tareas_por_proyecto', 'tareas_por_dueno', 'tareas_una_viva_por_programa',
    'tarea_eventos_tarea', 'tarea_eventos_fecha', 'trabajador_corridas_fin', 'servidor_arranques_inicio', 'avisos_abierto_por_clave', 'avisos_fecha']) {
    assert.ok(indices.has(i), `falta el índice ${i}`);
  }
  assert.equal(estadoBase(db).version, 4);
  db.close();
  const otra = abrirBase(config);
  assert.equal(otra.prepare('SELECT COUNT(*) AS n FROM oportia_migraciones').get().n, MIGRACIONES.length);
  otra.close();
});

test('migración 4: una base que estaba en la versión 3 se pone al día, con su copia oportia-antes-m4-*.db', () => {
  const config = configDePrueba();
  const vieja = abrirBase(config, MIGRACIONES.filter(m => m.id <= 3));
  vieja.prepare('INSERT INTO auditoria (fecha, accion) VALUES (?, ?)').run('2026-11-03', 'dato de antes');
  vieja.close();
  const db = abrirBase(config);
  assert.equal(estadoBase(db).version, 4);
  assert.equal(db.prepare("SELECT accion FROM auditoria WHERE accion = 'dato de antes'").get().accion, 'dato de antes');
  db.close();
  const copias = readdirSync(config.carpetaCopias);
  assert.equal(copias.length, 1);
  assert.match(copias[0], /^oportia-antes-m4-.+\.db$/);
  const copia = new DatabaseSync(join(config.carpetaCopias, copias[0]), { readOnly: true });
  assert.equal(copia.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'tareas'").get().n, 0);
  copia.close();
});

test('conectarBase (la del trabajador) nunca crea ni cambia la base, y dice claro por qué no puede abrirla', () => {
  const config = configDePrueba();
  assert.throws(() => conectarBase(config, { versionMinima: 4 }), e => e.codigo === 'base_no_existe');
  assert.deepEqual(readdirSync(config.raiz), [], 'no debe crear nada');
  const vieja = abrirBase(config, MIGRACIONES.filter(m => m.id <= 3));
  vieja.close();
  assert.throws(() => conectarBase(config, { versionMinima: 4 }), e => e.codigo === 'base_vieja');
  abrirBase(config).close();
  const db = conectarBase(config, { versionMinima: 4 });
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  db.close();
  const raiz = carpetaTemporal();
  const ajeno = join(raiz, 'oportia.db');
  writeFileSync(ajeno, 'esto es de otra persona');
  assert.throws(() => conectarBase({ archivoBase: ajeno }), e => e.codigo === 'base_ajena');
  assert.equal(readFileSync(ajeno, 'utf8'), 'esto es de otra persona');
  const sinWal = join(carpetaTemporal(), 'oportia.db');
  const otra = new DatabaseSync(sinWal);
  otra.exec(`PRAGMA application_id = ${0x4f505254}; CREATE TABLE t (x);`);
  otra.close();
  assert.throws(() => conectarBase({ archivoBase: sinWal }), e => e.codigo === 'base_sin_wal');
  assert.throws(() => conectarBase({ archivoBase: '/var/lib/jarvis/oportia.db' }), /Modo de prueba/);
});

// ---------- 2. Encolar ----------
test('encolar: la misma clave no duplica, un programa tiene una sola tarea viva, y los tipos desconocidos o de otra fase no entran', () => {
  const { db } = nuevaBase();
  const a = encolar(db, { tipo: 'prueba.eco', claveUnica: 'ranura-1' }, { registro: REGISTRO, ahora: T0 });
  assert.equal(a.nueva, true);
  assert.deepEqual(encolar(db, { tipo: 'prueba.eco', claveUnica: 'ranura-1' }, { registro: REGISTRO, ahora: T0 }), { id: a.id, nueva: false });

  const p1 = encolar(db, { tipo: 'prueba.eco', programa: 'prog', claveUnica: 'prog@1' }, { registro: REGISTRO, ahora: T0 });
  assert.equal(p1.nueva, true);
  assert.deepEqual(encolar(db, { tipo: 'prueba.eco', programa: 'prog', claveUnica: 'prog@2' }, { registro: REGISTRO, ahora: T0 }), { id: p1.id, nueva: false });
  db.prepare("UPDATE tareas SET estado = 'hecha' WHERE id = ?").run(p1.id);
  assert.equal(encolar(db, { tipo: 'prueba.eco', programa: 'prog', claveUnica: 'prog@2' }, { registro: REGISTRO, ahora: T0 }).nueva, true);

  assert.throws(() => encolar(db, { tipo: 'prueba.no_existe' }, { registro: REGISTRO }), e => e.codigo === 'tipo_desconocido');
  assert.throws(() => encolar(db, { tipo: 'prueba.futuro' }, { registro: REGISTRO }), e => e.codigo === 'tipo_de_otra_fase');
  assert.throws(() => encolar(db, { tipo: 'prueba.eco' }), e => e.codigo === 'tipo_desconocido', 'sin registro inyectado, prueba.* no existe');

  // El CHECK del estado sigue fallando aunque la orden diga ON CONFLICT DO NOTHING.
  assert.throws(() => db.prepare(`INSERT INTO tareas (tipo, estado, disponible_en, creada_en, actualizada_en) VALUES ('prueba.eco', 'rara', ?, ?, ?)
    ON CONFLICT DO NOTHING`).run('x', 'x', 'x'), /CHECK/);

  // repetible y los carriles se copian al crear la tarea.
  const correo = poner(db, 'prueba.correo');
  assert.equal(fila(db, correo).repetible, 0);
  const cuenta = crearCuenta(db);
  const proyecto = crearProyecto(db, cuenta);
  const deProyecto = poner(db, 'prueba.eco', { proyectoId: proyecto });
  assert.equal(fila(db, deProyecto).espacio_id, cuenta);
  assert.equal(fila(db, deProyecto).carril_espacio, `e:${cuenta}`);
  assert.equal(fila(db, deProyecto).carril_proyecto, `p:${proyecto}`);
  assert.throws(() => encolar(db, { tipo: 'prueba.eco', proyectoId: proyecto, espacioId: cuenta + 1 }, { registro: REGISTRO }), e => e.codigo === 'proyecto_de_otra_cuenta');
  db.close();
});

// ---------- 3. Transacciones anidadas ----------
test('enTransaccion: lo de adentro se deshace solo, lo de afuera deshace todo, y nunca acepta trabajo asíncrono', () => {
  const { db } = nuevaBase();
  const anotar = texto => db.prepare('INSERT INTO auditoria (fecha, accion) VALUES (?, ?)').run('2026-11-04', texto);
  const hay = texto => db.prepare('SELECT COUNT(*) AS n FROM auditoria WHERE accion = ?').get(texto).n;

  enTransaccion(db, () => {
    anotar('afuera');
    assert.throws(() => enTransaccion(db, () => { anotar('adentro'); throw new Error('falla adentro'); }), /falla adentro/);
    anotar('despues');
  });
  assert.equal(hay('afuera'), 1);
  assert.equal(hay('adentro'), 0);
  assert.equal(hay('despues'), 1);

  assert.throws(() => enTransaccion(db, () => {
    anotar('todo-1');
    enTransaccion(db, () => anotar('todo-2'));
    throw new Error('falla afuera');
  }), /falla afuera/);
  assert.equal(hay('todo-1') + hay('todo-2'), 0);

  assert.throws(() => enTransaccion(db, async () => { anotar('async'); }), e => e.codigo === 'transaccion_asincrona');
  assert.throws(() => enTransaccion(db, () => { anotar('promesa'); return Promise.resolve(1); }), e => e.codigo === 'transaccion_asincrona');
  assert.throws(() => enTransaccion(db, () => { anotar('promesa-adentro'); enTransaccion(db, () => Promise.reject(new Error('no'))); }), e => e.codigo === 'transaccion_asincrona');
  assert.equal(hay('async') + hay('promesa') + hay('promesa-adentro'), 0);
  if ('isTransaction' in db) assert.equal(db.isTransaction, false);
  // No quedó ninguna transacción abierta: una nueva funciona normal.
  assert.equal(enTransaccion(db, () => { anotar('final'); return 7; }), 7);
  assert.equal(hay('final'), 1);
  db.close();
});

// ---------- 4. Elegir y tomar ----------
test('elegir/marcarTomada: respetan la hora, el cupo, los tipos permitidos, los proyectos en pausa y la cerca', () => {
  const { db } = nuevaBase();
  const luego = poner(db, 'prueba.eco', { disponibleEn: T0 + MIN });
  assert.equal(elegir(db, { cupo: 'normal', tipos: TIPOS_PRUEBA, ahora: T0 }), null);
  assert.equal(elegir(db, { cupo: 'normal', tipos: TIPOS_PRUEBA, ahora: T0 + MIN }).id, luego);
  assert.equal(elegir(db, { cupo: 'normal', tipos: ['sistema.vigilar'], ahora: T0 + MIN }), null, 'solo los tipos permitidos');
  db.prepare("UPDATE tareas SET estado = 'cancelada' WHERE id = ?").run(luego);

  const grande = poner(db, 'prueba.grande');
  assert.equal(elegir(db, { cupo: 'normal', tipos: TIPOS_PRUEBA, ahora: T0 }), null);
  assert.equal(elegir(db, { cupo: 'grande', tipos: TIPOS_PRUEBA, ahora: T0 }).id, grande);
  db.prepare("UPDATE tareas SET estado = 'cancelada' WHERE id = ?").run(grande);

  const cuenta = crearCuenta(db);
  const pausado = crearProyecto(db, cuenta, { estado: 'pausado' });
  const enPapelera = crearProyecto(db, cuenta, { papelera: 1 });
  const dePausado = poner(db, 'prueba.eco', { proyectoId: pausado });
  poner(db, 'prueba.eco', { proyectoId: enPapelera });
  assert.equal(elegir(db, { cupo: 'normal', tipos: TIPOS_PRUEBA, ahora: T0 }), null, 'proyectos en pausa o en la papelera esperan');
  assert.equal(resumenFila(db, { tipos: TIPOS_PRUEBA, ahora: T0 }).enPausa, 2);
  db.prepare("UPDATE proyectos SET estado = 'en_ejecucion' WHERE id = ?").run(pausado); // «Reanudar»
  // Si lo pausan justo entre elegir y tomar, tampoco se toma.
  const justo = elegir(db, { cupo: 'normal', tipos: TIPOS_PRUEBA, ahora: T0 });
  assert.equal(justo.id, dePausado);
  db.prepare("UPDATE proyectos SET estado = 'pausado' WHERE id = ?").run(pausado);
  assert.equal(marcarTomada(db, { candidata: justo, corrida: 'corrida-1', ahora: T0 }), null);
  db.prepare("UPDATE proyectos SET estado = 'en_ejecucion' WHERE id = ?").run(pausado);
  const t = tomar(db);
  assert.equal(t.id, dePausado);
  assert.equal(t.estado, 'en_curso');
  assert.equal(t.tomas, 1);
  assert.equal(t.dueno, 'corrida-1');

  // Un tipo que este código no conoce espera (se ve como «esperan una versión más nueva»).
  const rara = poner(db, 'prueba.eco');
  db.prepare("UPDATE tareas SET tipo = 'proyecto.de_la_fase_9' WHERE id = ?").run(rara);
  assert.equal(elegir(db, { cupo: 'normal', tipos: TIPOS_PRUEBA, ahora: T0 }), null);
  assert.equal(resumenFila(db, { tipos: TIPOS_PRUEBA, ahora: T0 }).esperanVersion, 1);

  // La cerca: una candidata vieja (otra toma de por medio) no se puede tomar.
  const eco = poner(db, 'prueba.eco');
  const candidata = elegir(db, { cupo: 'normal', tipos: TIPOS_PRUEBA, ahora: T0 });
  assert.equal(candidata.id, eco);
  db.prepare('UPDATE tareas SET tomas = tomas + 1 WHERE id = ?').run(eco);
  assert.equal(marcarTomada(db, { candidata, corrida: 'corrida-1', ahora: T0 }), null);
  const otra = elegir(db, { cupo: 'normal', tipos: TIPOS_PRUEBA, ahora: T0 });
  assert.ok(marcarTomada(db, { candidata: otra, corrida: 'corrida-1', ahora: T0 }));
  assert.equal(marcarTomada(db, { candidata: otra, corrida: 'corrida-2', ahora: T0 }), null, 'dos no toman la misma');
  db.close();
});

// ---------- 5 y 6. Turnos justos ----------
test('turnos justos por tiempo: una cuenta con pasos de 1 s y otra con dos proyectos de 0,1 s se reparten la mitad', () => {
  const { db } = nuevaBase();
  const a = crearCuenta(db, 'A');
  const b = crearCuenta(db, 'B');
  const pa = crearProyecto(db, a);
  const pb1 = crearProyecto(db, b);
  const pb2 = crearProyecto(db, b);
  for (const proyectoId of [pa, pb1, pb2]) poner(db, 'prueba.eco', { proyectoId });
  const tiempo = { [a]: 0, [b]: 0 };
  const pasos = { [pb1]: 0, [pb2]: 0 };
  let ahora = T0;
  for (let i = 0; i < 300; i++) {
    const t = tomar(db, { ahora });
    assert.ok(t, `el paso ${i} no encontró tarea`);
    const duracionMs = t.espacioId === a ? 1000 : 100;
    tiempo[t.espacioId] += duracionMs;
    if (t.espacioId === b) pasos[t.proyectoId] += 1;
    ahora += duracionMs;
    assert.equal(guardar(db, t, { tipo: 'seguir', punto: { i }, esperarMs: 0 }, { ahora, duracionMs }).aceptado, true);
  }
  const parteA = tiempo[a] / (tiempo[a] + tiempo[b]);
  assert.ok(parteA >= 0.45 && parteA <= 0.55, `la cuenta A usó ${(parteA * 100).toFixed(1)} % del tiempo`);
  const diferencia = Math.abs(pasos[pb1] - pasos[pb2]) / Math.max(pasos[pb1], pasos[pb2]);
  assert.ok(diferencia <= 0.1, `los proyectos de B: ${pasos[pb1]} y ${pasos[pb2]} pasos`);
  db.close();
});

test('tope de crédito: una cuenta que estuvo 10 h quieta adelanta como mucho 60 s, y después se turnan', () => {
  const { db } = nuevaBase();
  const a = crearCuenta(db, 'A');
  const b = crearCuenta(db, 'B');
  poner(db, 'prueba.eco', { espacioId: a });
  poner(db, 'prueba.eco', { espacioId: b });
  db.prepare("INSERT INTO tarea_carriles (carril, virtual_ms, actualizado_en) VALUES (?, ?, 'x')").run(`e:${a}`, 10 * HORA);
  const turnos = [];
  let ahora = T0;
  for (let i = 0; i < 40; i++) {
    const t = tomar(db, { ahora });
    turnos.push(t.espacioId);
    ahora += 10_000;
    guardar(db, t, { tipo: 'seguir', punto: null, esperarMs: 0 }, { ahora, duracionMs: 10_000 });
  }
  let primeros = 0;
  while (turnos[primeros] === b) primeros += 1;
  assert.ok(primeros >= 1 && primeros <= 8, `la cuenta B tuvo ${primeros} turnos seguidos al principio`);
  let racha = 1;
  for (let i = primeros + 1; i < turnos.length; i++) {
    racha = turnos[i] === turnos[i - 1] ? racha + 1 : 1;
    assert.ok(racha <= 2, `después del principio deben turnarse (turno ${i})`);
  }
  assert.ok(turnos.includes(a));
  db.close();
});

// ---------- 7. Pasos ----------
test('pasos: «seguir» guarda el punto sin contar fallo, «listo» la termina, y un resultado de más de 4000 caracteres falla', () => {
  const { db } = nuevaBase();
  const id = poner(db, 'prueba.eco');
  let t = tomar(db);
  assert.equal(guardar(db, t, normalizarSalida({ punto: { paso: 2 } })).estado, 'lista');
  let f = fila(db, id);
  assert.equal(f.pasos, 1);
  assert.equal(f.fallos_seguidos, 0);
  assert.deepEqual(JSON.parse(f.punto), { paso: 2 });
  assert.equal(f.dueno, null);
  t = tomar(db);
  assert.deepEqual(t.punto, { paso: 2 }, 'el trabajo sigue donde quedó');
  assert.equal(t.tomas, 2);
  assert.equal(guardar(db, t, normalizarSalida({ listo: true, resultado: { revisadas: 3 } })).estado, 'hecha');
  f = fila(db, id);
  assert.equal(f.estado, 'hecha');
  assert.deepEqual(JSON.parse(f.resultado), { revisadas: 3 });
  assert.equal(f.pasos, 2);
  assert.ok(f.terminada_en);
  assert.ok(f.ms_usados >= 20);

  const grande = poner(db, 'prueba.eco');
  t = tomar(db);
  assert.equal(guardar(db, t, normalizarSalida({ listo: true, resultado: 'x'.repeat(4001) })).estado, 'fallida');
  assert.equal(fila(db, grande).ultimo_error, 'resultado_muy_grande');
  assert.equal(fila(db, grande).resultado, null);
  assert.deepEqual(eventos(db, grande), ['fallida']);

  const rara = poner(db, 'prueba.eco');
  t = tomar(db);
  assert.equal(guardar(db, t, normalizarSalida('cualquier cosa')).estado, 'fallida', 'una respuesta no válida no se reintenta');
  assert.equal(fila(db, rara).ultimo_error, 'respuesta_no_valida');
  db.close();
});

// ---------- 8 y 9. Reintentos ----------
test('reintentos: 1 min y 4 min con azar 0,5; el 3.er fallo la deja fallida y el proyecto «Con errores»', () => {
  const { db } = nuevaBase();
  assert.equal(esperaDeReintento(1, POR_DEFECTO_REINTENTOS, MITAD), 60_000);
  assert.equal(esperaDeReintento(2, POR_DEFECTO_REINTENTOS, MITAD), 240_000);
  const cuenta = crearCuenta(db);
  const proyecto = crearProyecto(db, cuenta);
  const id = poner(db, 'prueba.eco', { proyectoId: proyecto });
  const fallo = salidaDeError(new ErrorTarea('sin_red'));
  let ahora = T0;
  let t = tomar(db, { ahora });
  assert.equal(guardar(db, t, fallo, { ahora }).estado, 'lista');
  assert.equal(fila(db, id).disponible_en, new Date(ahora + 60_000).toISOString());
  assert.equal(tomar(db, { ahora: ahora + 59_999 }), null, 'antes de tiempo no se toma');
  ahora += 60_000;
  t = tomar(db, { ahora });
  assert.equal(t.intento, 2);
  guardar(db, t, fallo, { ahora });
  assert.equal(fila(db, id).disponible_en, new Date(ahora + 240_000).toISOString());
  ahora += 240_000;
  t = tomar(db, { ahora });
  const r = guardar(db, t, fallo, { ahora });
  assert.equal(r.estado, 'fallida');
  assert.equal(r.fallida, true);
  assert.equal(fila(db, id).fallos_seguidos, 3);
  assert.deepEqual(eventos(db, id), ['error', 'error', 'fallida']);
  const p = db.prepare('SELECT estado, motivo_error FROM proyectos WHERE id = ?').get(proyecto);
  assert.equal(p.estado, 'con_errores');
  assert.equal(p.motivo_error, 'sin_red');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM proyecto_historial WHERE proyecto_id = ? AND accion = 'con_errores'").get(proyecto).n, 1);
  db.close();
});

test('si alFallar falla, no se guarda NADA del paso (la tarea sigue en curso)', () => {
  const { db } = nuevaBase();
  const cuenta = crearCuenta(db);
  const proyecto = crearProyecto(db, cuenta);
  const id = poner(db, 'prueba.eco', { proyectoId: proyecto });
  const t = tomar(db);
  const antes = fila(db, id);
  assert.throws(() => guardar(db, t, salidaDeError(new ErrorTarea('roto', { reintentable: false })), {
    alFallar: (base, proyectoId, motivo) => { marcarConErrores(base, proyectoId, motivo); throw new Error('alFallar se rompió'); },
  }), /alFallar se rompió/);
  assert.deepEqual(fila(db, id), antes);
  assert.deepEqual(eventos(db, id), []);
  assert.equal(db.prepare('SELECT estado FROM proyectos WHERE id = ?').get(proyecto).estado, 'en_ejecucion');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tarea_carriles').get().n, 0, 'tampoco se cobró el tiempo');
  db.close();
});

test('ErrorTarea no reintentable falla de una vez; esperar(…, «tope_ia») espera sin contar fallo', () => {
  const { db } = nuevaBase();
  const una = poner(db, 'prueba.eco');
  let t = tomar(db);
  assert.equal(guardar(db, t, salidaDeError(new ErrorTarea('clave_mala', { reintentable: false }))).estado, 'fallida');
  assert.equal(fila(db, una).fallos_seguidos, 1);

  const tope = poner(db, 'prueba.eco');
  t = tomar(db);
  const r = guardar(db, t, salidaDeError(esperar(HORA, 'tope_ia')));
  assert.equal(r.estado, 'lista');
  const f = fila(db, tope);
  assert.equal(f.motivo_espera, 'tope_ia');
  assert.equal(f.fallos_seguidos, 0);
  assert.equal(f.disponible_en, new Date(T0 + HORA).toISOString());
  assert.deepEqual(eventos(db, tope), ['espera']);

  const revisar = poner(db, 'prueba.eco');
  t = tomar(db);
  assert.equal(guardar(db, t, salidaDeError(new ErrorTarea('no_se_sabe_si_salio', { revisar: true }))).estado, 'revisar');
  assert.deepEqual(eventos(db, revisar), ['revisar']);

  const tiempo = poner(db, 'prueba.eco');
  t = tomar(db);
  const corte = Object.assign(new Error('se pasó'), { name: 'TimeoutError' });
  assert.equal(guardar(db, t, salidaDeError(corte)).estado, 'lista');
  assert.equal(fila(db, tiempo).ultimo_error, 'tiempo_agotado');
  db.close();
});

// ---------- 10. La cerca ----------
test('cerca: con otro dueño u otra toma, guardarPaso no cambia nada y ctx.escribir lanza «ya_no_es_mia»', async () => {
  const { db } = nuevaBase();
  const id = poner(db, 'prueba.eco');
  const t = tomar(db, { corrida: 'corrida-1' });
  const antes = fila(db, id);
  assert.equal(guardar(db, t, { tipo: 'listo', resultado: null }, { corrida: 'corrida-2' }).aceptado, false);
  assert.equal(guardar(db, { ...t, tomas: t.tomas + 1 }, { tipo: 'listo', resultado: null }).aceptado, false);
  assert.deepEqual(fila(db, id), antes);

  const escritor = crearEscritor(db, { dormir: async () => {}, registro: SILENCIO });
  const escribir = escritorDeTarea(escritor, db, { tarea: t, corrida: 'corrida-1' });
  assert.equal(await escribir(() => 'escrito'), 'escrito');
  db.prepare("UPDATE tareas SET dueno = 'otra-corrida' WHERE id = ?").run(id);
  let corrio = false;
  await assert.rejects(escribir(() => { corrio = true; }), e => e.clave === 'ya_no_es_mia');
  assert.equal(corrio, false);
  db.close();
});

// ---------- 11 y 12. Recuperar y devolver ----------
test('recuperar: una caída cuenta un fallo, un apagón no, y repetible=0 queda «por revisar»', () => {
  const { db } = nuevaBase();
  const cuenta = crearCuenta(db);
  const proyecto = crearProyecto(db, cuenta);
  const id = poner(db, 'prueba.eco', { proyectoId: proyecto });
  let ahora = T0;
  for (let vida = 1; vida <= 3; vida++) {
    const corrida = nuevaCorrida(db, { version: 'v', codigo: 'c', ahora });
    const t = tomar(db, { corrida, ahora });
    assert.equal(t.id, id, `vida ${vida}`);
    terminarCorrida(db, { corrida, como: 'caida', codigo: 1, ahora });
    const [r] = recuperarAbandonadas(db, { ahora, azar: MITAD, alFallar: marcarConErrores, registro: REGISTRO });
    assert.equal(r.id, id);
    if (vida < 3) {
      assert.equal(r.estado, 'lista');
      assert.equal(fila(db, id).fallos_seguidos, vida);
      ahora = Date.parse(fila(db, id).disponible_en);
    } else {
      assert.equal(r.estado, 'fallida');
    }
  }
  assert.deepEqual(eventos(db, id), ['abandonada', 'abandonada', 'fallida']);
  assert.equal(fila(db, id).ultimo_error, 'trabajador_caida');
  assert.equal(db.prepare('SELECT estado FROM proyectos WHERE id = ?').get(proyecto).estado, 'con_errores');

  // Apagón (la corrida quedó «perdida»): no cuenta fallo.
  const apagon = poner(db, 'prueba.eco');
  let corrida = nuevaCorrida(db, { version: 'v', codigo: 'c', ahora });
  tomar(db, { corrida, ahora });
  terminarCorrida(db, { corrida, como: 'perdida', ahora });
  assert.equal(recuperarAbandonadas(db, { ahora, registro: REGISTRO })[0].estado, 'lista');
  assert.equal(fila(db, apagon).fallos_seguidos, 0);
  assert.equal(fila(db, apagon).disponible_en, new Date(ahora).toISOString());
  assert.deepEqual(eventos(db, apagon), ['interrumpida']);
  db.prepare("UPDATE tareas SET estado = 'cancelada' WHERE id = ?").run(apagon);

  // Un correo (no se puede repetir) nunca vuelve solo a la fila, haya fallo o no.
  for (const como of ['caida', 'perdida']) {
    const correo = poner(db, 'prueba.correo');
    corrida = nuevaCorrida(db, { version: 'v', codigo: 'c', ahora });
    assert.equal(tomar(db, { corrida, ahora }).id, correo);
    terminarCorrida(db, { corrida, como, ahora });
    assert.equal(recuperarAbandonadas(db, { ahora, registro: REGISTRO })[0].estado, 'revisar', como);
    assert.ok(fila(db, correo).terminada_en);
  }
  db.close();
});

test('recuperar: un arriendo vencido de otro dueño cuenta un fallo; nada se toca mientras el arriendo vale', () => {
  const { db } = nuevaBase();
  const id = poner(db, 'prueba.eco');
  const otro = nuevaCorrida(db, { version: 'v', codigo: 'c', ahora: T0 });
  marcarListo(db, otro, T0);
  tomar(db, { corrida: otro, ahora: T0, arriendoMs: 120_000 });
  const yo = nuevaCorrida(db, { version: 'v', codigo: 'c', ahora: T0 });
  assert.deepEqual(recuperarAbandonadas(db, { yo, ahora: T0 + 100_000 }), [], 'su corrida sigue abierta');
  assert.deepEqual(recuperarVencidas(db, { yo, ahora: T0 + 120_000 + 30_000 }), [], 'todavía dentro del margen');
  assert.deepEqual(recuperarVencidas(db, { yo: otro, ahora: T0 + DIA }), [], 'las propias nunca se tocan aquí');
  const [r] = recuperarVencidas(db, { yo, ahora: T0 + 120_000 + 30_001, azar: MITAD, registro: REGISTRO });
  assert.equal(r.id, id);
  assert.equal(r.estado, 'lista');
  assert.equal(fila(db, id).fallos_seguidos, 1);
  assert.equal(fila(db, id).ultimo_error, 'arriendo_vencido');
  assert.deepEqual(eventos(db, id), ['abandonada']);
  // El latido del dueño viejo ya no alarga nada que no sea suyo.
  assert.equal(latir(db, { corrida: otro, ahora: T0 + 200_000 }), true);
  assert.equal(fila(db, id).dueno, null);
  db.close();
});

test('empezarCorrida: en una transacción anota el pid, da por perdidas las corridas muertas y recupera sus tareas sin fallo', () => {
  const { db } = nuevaBase();
  const id = poner(db, 'prueba.eco');
  const vieja = nuevaCorrida(db, { version: 'v', codigo: 'c', ahora: T0 });
  db.prepare('UPDATE trabajador_corridas SET pid = 999999 WHERE corrida = ?').run(vieja);
  marcarListo(db, vieja, T0);
  tomar(db, { corrida: vieja, ahora: T0 });
  const nueva = nuevaCorrida(db, { version: 'v', codigo: 'c', ahora: T0 + 1000 });
  const r = empezarCorrida(db, { corrida: nueva, pid: 4242, ahora: T0 + 2000, vivo: pid => pid === 4242, registro: REGISTRO });
  assert.deepEqual(r.perdidas, [vieja]);
  assert.equal(r.recuperadas[0].id, id);
  assert.equal(fila(db, id).estado, 'lista');
  assert.equal(fila(db, id).fallos_seguidos, 0);
  const c = db.prepare('SELECT * FROM trabajador_corridas WHERE corrida = ?').get(vieja);
  assert.equal(c.como_termino, 'perdida');
  assert.equal(db.prepare('SELECT pid FROM trabajador_corridas WHERE corrida = ?').get(nueva).pid, 4242);
  assert.throws(() => empezarCorrida(db, { corrida: 'no-existe', ahora: T0 }), e => e.codigo === 'corrida_no_valida');
  assert.equal(salidasAnormales(db, { codigo: 'c', desde: T0 - HORA }), 0);
  assert.equal(terminarCorrida(db, { corrida: nueva, como: 'caida', ahora: T0 + 3000 }), true);
  assert.equal(terminarCorrida(db, { corrida: nueva, como: 'normal', ahora: T0 + 4000 }), false, 'la primera razón no se pisa');
  assert.equal(salidasAnormales(db, { codigo: 'c', desde: T0 - HORA }), 1);
  assert.equal(salidasAnormales(db, { codigo: 'otro', desde: T0 - HORA }), 0);
  assert.throws(() => terminarCorrida(db, { corrida: vieja, como: 'inventada' }), /no válida/);
  db.close();
});

test('devolverLasMias: al apagarse no cuenta fallo; repetible=0 queda «por revisar»; por falta de memoria suma uno', () => {
  const { db } = nuevaBase();
  const eco = poner(db, 'prueba.eco');
  const correo = poner(db, 'prueba.correo');
  tomar(db);
  tomar(db);
  const r = devolverLasMias(db, { corrida: 'corrida-1', ahora: T0, registro: REGISTRO });
  assert.equal(r.length, 2);
  assert.equal(fila(db, eco).estado, 'lista');
  assert.equal(fila(db, eco).fallos_seguidos, 0);
  assert.deepEqual(eventos(db, eco), ['interrumpida']);
  assert.equal(fila(db, correo).estado, 'revisar');

  tomar(db);
  devolverLasMias(db, { corrida: 'corrida-1', conFallo: true, motivo: 'memoria', ahora: T0, azar: MITAD, registro: REGISTRO });
  assert.equal(fila(db, eco).fallos_seguidos, 1);
  assert.equal(fila(db, eco).ultimo_error, 'memoria');
  assert.equal(fila(db, eco).estado, 'lista');
  db.close();
});

// ---------- 13. Horarios ----------
test('ranuras en hora de República Dominicana (UTC−4) y horario repartido de proyectos entre 1:00 y 5:59', () => {
  const iso = ms => new Date(ms).toISOString();
  const vigilar = PROGRAMAS_DEL_SISTEMA.find(p => p.programa === 'sistema.vigilar');
  const base = PROGRAMAS_DEL_SISTEMA.find(p => p.programa === 'sistema.base');
  let r = ranura(vigilar, Date.parse('2026-11-04T10:05:00Z'));
  assert.equal(r.clave, 'sistema.vigilar@2026-11-04T05');
  assert.equal(iso(r.inicio), '2026-11-04T09:07:00.000Z');
  assert.equal(iso(r.siguiente), '2026-11-04T10:07:00.000Z');
  assert.equal(ranura(vigilar, Date.parse('2026-11-04T10:07:00Z')).clave, 'sistema.vigilar@2026-11-04T06');
  assert.equal(ranura(base, Date.parse('2026-11-04T08:09:59Z')).clave, 'sistema.base@2026-11-03');
  r = ranura(base, Date.parse('2026-11-04T08:10:00Z'));
  assert.equal(r.clave, 'sistema.base@2026-11-04');
  assert.equal(iso(r.inicio), '2026-11-04T08:10:00.000Z');
  const semanal = { programa: 'proyecto:5', cada: 'semanal', hora: 2, minuto: 0 };
  assert.equal(ranura(semanal, Date.parse('2026-11-09T05:59:00Z')).clave, 'proyecto:5@S2026-11-02');
  assert.equal(ranura(semanal, Date.parse('2026-11-09T06:00:00Z')).clave, 'proyecto:5@S2026-11-09');
  r = ranura({ programa: 'proyecto:5', cada: 'mensual', hora: 2, minuto: 0 }, Date.parse('2026-12-31T23:00:00Z'));
  assert.equal(r.clave, 'proyecto:5@M2026-12');
  assert.equal(iso(r.siguiente), '2027-01-01T06:00:00.000Z');
  assert.equal(ranura({ programa: 'proyecto:5', cada: 'mensual', hora: 2 }, Date.parse('2026-12-01T05:59:00Z')).clave, 'proyecto:5@M2026-11');
  assert.equal(ranura({ programa: 'proyecto:5', cada: 'manual' }, T0), null);
  for (let id = 0; id <= 1000; id++) {
    const { hora, minuto } = horarioRepartido(id);
    assert.ok(hora >= 1 && hora <= 5 && minuto >= 0 && minuto <= 59, `proyecto ${id}: ${hora}:${minuto}`);
  }
});

// ---------- 14. Programar ----------
test('programar: tras 3 días apagado se hace una sola vez, la misma ranura no duplica y no se encima a la anterior', () => {
  const { db } = nuevaBase();
  const vigilar = [PROGRAMAS_DEL_SISTEMA.find(p => p.programa === 'sistema.vigilar')];
  assert.deepEqual(programar(db, { programas: vigilar, ahora: T0 }), { creadas: 1, saltadas: 0 });
  assert.deepEqual(programar(db, { programas: vigilar, ahora: T0 + 1000 }), { creadas: 0, saltadas: 0 }, 'misma ranura, otra llamada');
  const recordadas = new Map();
  const saltos = new Map();
  // La anterior sigue viva en la ranura siguiente: no se crea otra y se anota una sola vez que se saltó.
  assert.deepEqual(programar(db, { programas: vigilar, ahora: T0 + HORA, recordadas, saltos }), { creadas: 0, saltadas: 1 });
  programar(db, { programas: vigilar, ahora: T0 + HORA + 30_000, recordadas, saltos });
  programar(db, { programas: vigilar, ahora: T0 + HORA + 60_000 }); // como tras un reinicio (memoria vacía)
  const primera = db.prepare("SELECT id FROM tareas WHERE programa = 'sistema.vigilar'").get().id;
  assert.deepEqual(eventos(db, primera), ['programa_saltado']);
  db.prepare("UPDATE tareas SET estado = 'hecha' WHERE id = ?").run(primera);
  assert.deepEqual(programar(db, { programas: vigilar, ahora: T0 + HORA + 90_000, recordadas, saltos }), { creadas: 1, saltadas: 0 });
  db.prepare("UPDATE tareas SET estado = 'hecha' WHERE programa = 'sistema.vigilar'").run();
  // 3 días apagado: una sola tarea, la de la ranura de ahora.
  assert.deepEqual(programar(db, { programas: vigilar, ahora: T0 + 3 * DIA }), { creadas: 1, saltadas: 0 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE programa = 'sistema.vigilar'").get().n, 3);
  // Un tipo que este código no conoce no se programa.
  assert.deepEqual(programar(db, { programas: [{ programa: 'raro', tipo: 'proyecto.de_la_fase_9', cada: 'hora' }], ahora: T0 }), { creadas: 0, saltadas: 0 });
  const proximas = proximasEjecuciones(db, { programas: vigilar, ahora: T0 + 3 * DIA });
  assert.equal(proximas[0].proximaEn, new Date(ranura(vigilar[0], T0 + 3 * DIA).siguiente).toISOString());
  assert.equal(proximas[0].ultimoEstado, 'lista');
  db.close();
});

test('programasDeProyectos: vacío en la fase 1; con tipos de la fase 2 solo entran los proyectos que de verdad corren', () => {
  const { db } = nuevaBase();
  const cuenta = crearCuenta(db);
  const conVersion = (estado, config, { papelera = 0 } = {}) => {
    const id = crearProyecto(db, cuenta, { estado, papelera });
    db.prepare("INSERT INTO proyecto_versiones (proyecto_id, numero, instrucciones, configuracion, estado, creada_en) VALUES (?, 1, 'x', ?, 'aprobada', 'x')")
      .run(id, JSON.stringify(config));
    db.prepare('UPDATE proyectos SET version_activa = 1 WHERE id = ?').run(id);
    return id;
  };
  const comercial = { tipo: 'comercial', frecuencia: 'semanal', capacidades: { investigar: true } };
  const corre = conVersion('en_ejecucion', comercial);
  conVersion('pausado', comercial);
  conVersion('en_ejecucion', comercial, { papelera: 1 });
  conVersion('en_ejecucion', { ...comercial, frecuencia: 'manual' });
  conVersion('en_ejecucion', { tipo: 'laboral', frecuencia: 'diaria', capacidades: { investigar: true } }); // laboral llega en la fase 6
  conVersion('en_ejecucion', { ...comercial, capacidades: { investigar: false, correos: true } }); // correos llega en la fase 3
  crearProyecto(db, cuenta); // sin versión aprobada
  assert.deepEqual(programasDeProyectos(db), []);
  const registro = { ...TIPOS, 'proyecto.investigar': { fase: 2 }, 'proyecto.correos': { fase: 3 } };
  const lista = programasDeProyectos(db, { registro, fase: 2 });
  assert.equal(lista.length, 1);
  assert.equal(lista[0].programa, `proyecto:${corre}`);
  assert.equal(lista[0].tipo, 'proyecto.investigar');
  assert.equal(lista[0].cada, 'semanal');
  assert.equal(lista[0].proyectoId, corre);
  assert.deepEqual({ hora: lista[0].hora, minuto: lista[0].minuto }, horarioRepartido(corre));
  db.close();
});

// ---------- 15. Modo seguro ----------
test('modo seguro a mano: activarlo y quitarlo dejan auditoría y su aviso', () => {
  const { db } = nuevaBase();
  const admin = crearAdmin(db);
  const puesto = ponerModoSeguro(db, { activo: true, origen: 'admin', usuarioId: admin, codigo: 'abc', version: '0.3.0', ahora: T0 });
  assert.equal(puesto.cambio, true);
  const m = leerModoSeguro(db);
  assert.equal(m.activo, true);
  assert.equal(m.motivo, 'admin');
  assert.equal(m.usuarioId, admin);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'modo_seguro_activado' AND usuario_id = ?").get(admin).n, 1);
  const aviso = avisosAbiertos(db).find(a => a.clave === 'modo_seguro');
  assert.equal(aviso.nivel, 'info');
  ponerModoSeguro(db, { activo: false, origen: 'admin', usuarioId: admin, ahora: T0 + MIN });
  const quitado = leerModoSeguro(db);
  assert.equal(quitado.activo, false);
  assert.equal(quitado.ultimo.por, 'admin');
  assert.equal(quitado.ultimo.motivo, 'admin');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'modo_seguro_quitado'").get().n, 1);
  assert.equal(avisosAbiertos(db).some(a => a.clave === 'modo_seguro'), false);
  assert.equal(ponerModoSeguro(db, { activo: false, origen: 'admin', ahora: T0 }).cambio, false, 'quitarlo dos veces no hace nada');
  assert.throws(() => ponerModoSeguro(db, { activo: true, origen: 'automatico', motivo: 'admin' }), /no válido/);
  db.close();
});

test('modo seguro solo: 3 arranques sin cierre limpio del MISMO código en 30 min; otro código no cuenta; un cierre limpio reinicia la cuenta', () => {
  const { db } = nuevaBase();
  for (let i = 0; i < 3; i++) assert.equal(registrarArranque(db, { version: '0.3.0', codigo: 'otro', pid: 1, ahora: T0 + i * MIN }).modoSeguro, null);
  assert.equal(registrarArranque(db, { version: '0.3.0', codigo: 'nuevo', pid: 1, ahora: T0 + 3 * MIN }).caidasRecientes, 0, 'otro código no cuenta');
  assert.equal(registrarArranque(db, { version: '0.3.0', codigo: 'nuevo', pid: 1, ahora: T0 + 4 * MIN }).caidasRecientes, 1);
  const tercero = registrarArranque(db, { version: '0.3.0', codigo: 'nuevo', pid: 1, ahora: T0 + 5 * MIN });
  assert.equal(tercero.caidasRecientes, 2);
  assert.equal(registrarCierre(db, tercero.id, T0 + 6 * MIN), true);
  assert.equal(registrarCierre(db, tercero.id, T0 + 6 * MIN), false);
  assert.equal(registrarArranque(db, { version: '0.3.0', codigo: 'nuevo', pid: 1, ahora: T0 + 7 * MIN }).caidasRecientes, 0, 'el cierre limpio reinicia la cuenta');
  registrarArranque(db, { version: '0.3.0', codigo: 'nuevo', pid: 1, ahora: T0 + 8 * MIN });
  registrarArranque(db, { version: '0.3.0', codigo: 'nuevo', pid: 1, ahora: T0 + 9 * MIN });
  assert.equal(leerModoSeguro(db).activo, false);
  const cuarto = registrarArranque(db, { version: '0.3.0', codigo: 'nuevo', pid: 1, ahora: T0 + 10 * MIN });
  assert.equal(cuarto.caidasRecientes, 3);
  const m = leerModoSeguro(db);
  assert.equal(m.activo, true);
  assert.equal(m.origen, 'automatico');
  assert.equal(m.motivo, 'servicio_inestable');
  assert.equal(m.codigo, 'nuevo');
  assert.equal(avisosAbiertos(db).find(a => a.clave === 'modo_seguro').nivel, 'grave');
  // Más de 30 minutos después ya no cuentan.
  const { db: otra } = nuevaBase();
  for (let i = 0; i < 3; i++) registrarArranque(otra, { version: 'v', codigo: 'x', ahora: T0 + i * MIN });
  assert.equal(registrarArranque(otra, { version: 'v', codigo: 'x', ahora: T0 + 31 * MIN }).caidasRecientes, 2);
  otra.close();
  db.close();
});

test('modo seguro con código nuevo: se quita UNA vez solo por las 3 causas que el código puede arreglar; nunca el manual ni la base dañada', () => {
  for (const motivo of SE_LEVANTAN_CON_CODIGO_NUEVO) {
    const { db } = nuevaBase();
    ponerModoSeguro(db, { activo: true, origen: 'automatico', motivo, codigo: 'roto', version: '0.3.0', ahora: T0 });
    assert.equal(revisarAlArrancar(db, { codigo: 'roto', ahora: T0 + MIN }).levantado, false, 'el mismo código no se quita');
    const r = revisarAlArrancar(db, { codigo: 'arreglado', ahora: T0 + 2 * MIN });
    assert.equal(r.levantado, true, motivo);
    assert.equal(leerModoSeguro(db).activo, false);
    assert.equal(leerModoSeguro(db).ultimo.por, 'codigo_nuevo');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'modo_seguro_quitado' AND detalle LIKE 'codigo_nuevo:%'").get().n, 1);
    // Si el código nuevo vuelve a fallar, vuelve con la huella nueva y ya no se quita con ese código.
    ponerModoSeguro(db, { activo: true, origen: 'automatico', motivo, codigo: 'arreglado', ahora: T0 + 3 * MIN });
    assert.equal(revisarAlArrancar(db, { codigo: 'arreglado', ahora: T0 + 4 * MIN }).levantado, false);
    db.close();
  }
  for (const caso of [{ origen: 'admin' }, { origen: 'consola' }, { origen: 'automatico', motivo: 'base_danada' }]) {
    const { db } = nuevaBase();
    ponerModoSeguro(db, { activo: true, ...caso, codigo: 'viejo', ahora: T0 });
    assert.equal(revisarAlArrancar(db, { codigo: 'nuevo', ahora: T0 + MIN }).levantado, false, JSON.stringify(caso));
    assert.equal(leerModoSeguro(db).activo, true);
    db.close();
  }
  // Una causa que no se quita sola reemplaza a una que sí, y nunca al revés.
  const { db } = nuevaBase();
  ponerModoSeguro(db, { activo: true, origen: 'automatico', motivo: 'trabajador_inestable', codigo: 'c', ahora: T0 });
  ponerModoSeguro(db, { activo: true, origen: 'automatico', motivo: 'base_danada', codigo: 'c', ahora: T0 + MIN });
  assert.equal(leerModoSeguro(db).motivo, 'base_danada');
  assert.equal(ponerModoSeguro(db, { activo: true, origen: 'automatico', motivo: 'trabajador_inestable', codigo: 'c', ahora: T0 + 2 * MIN }).cambio, false);
  assert.equal(leerModoSeguro(db).motivo, 'base_danada');
  // Quitar el modo seguro de base dañada encola enseguida una revisión de la base.
  const admin = crearAdmin(db);
  ponerModoSeguro(db, { activo: false, origen: 'admin', usuarioId: admin, ahora: T0 + 3 * MIN });
  const revision = db.prepare("SELECT * FROM tareas WHERE tipo = 'sistema.base'").all();
  assert.equal(revision.length, 1);
  assert.equal(revision[0].creada_por, admin);
  assert.equal(revision[0].estado, 'lista');
  assert.equal(revision[0].disponible_en, new Date(T0 + 3 * MIN).toISOString());
  db.close();
});

// ---------- 16. Frenos por tipo ----------
test('freno: 6 pasos fallidos en 2 tareas frenan el tipo 5 min (con su aviso); después se toma otra vez y un paso bueno resuelve el aviso', () => {
  const { db } = nuevaBase();
  const cuenta = crearCuentaDeFallos({ registro: REGISTRO });
  for (let i = 0; i < 10; i++) assert.equal(cuenta.anotar('prueba.eco', 1, true).frenar, false, 'en una sola tarea no frena');
  cuenta.anotar('prueba.eco', 1, false);
  const resultados = [1, 2, 1, 2, 1, 2].map(tarea => cuenta.anotar('prueba.eco', tarea, true).frenar);
  assert.deepEqual(resultados, [false, false, false, false, false, true]);

  const id = poner(db, 'prueba.eco');
  const freno = frenarTipo(db, { tipo: 'prueba.eco', ahora: T0 });
  assert.equal(freno.hasta, new Date(T0 + 5 * MIN).toISOString());
  assert.ok(avisosAbiertos(db).some(a => a.clave === 'freno:prueba.eco'));
  let frenos = leerFrenos(db, T0 + MIN);
  assert.deepEqual(frenos.map(f => f.tipo), ['prueba.eco']);
  let tipos = tiposPermitidos({ registro: REGISTRO, frenos });
  assert.ok(!tipos.includes('prueba.eco'));
  assert.equal(elegir(db, { cupo: 'normal', tipos, ahora: T0 + MIN }), null);
  frenos = leerFrenos(db, T0 + 5 * MIN);
  assert.deepEqual(frenos, []);
  tipos = tiposPermitidos({ registro: REGISTRO, frenos });
  const t = tomar(db, { tipos, ahora: T0 + 5 * MIN });
  assert.equal(t.id, id);
  guardar(db, t, { tipo: 'listo', resultado: null }, { ahora: T0 + 5 * MIN });
  const { soltar } = cuenta.anotar('prueba.eco', id, false);
  assert.equal(soltar, true);
  assert.equal(soltarFreno(db, { tipo: 'prueba.eco', ahora: T0 + 5 * MIN }), true);
  assert.equal(avisosAbiertos(db).some(a => a.clave === 'freno:prueba.eco'), false);
  assert.equal(soltarFreno(db, { tipo: 'prueba.eco', ahora: T0 + 6 * MIN }), false, 'si no hay nada que soltar no escribe');
  // Con la cuenta en cero, el próximo freno vuelve a ser de 5 min; sin pasos buenos de por medio, se duplica.
  assert.equal(frenarTipo(db, { tipo: 'prueba.eco', ahora: T0 + 10 * MIN }).hasta, new Date(T0 + 15 * MIN).toISOString());
  assert.equal(frenarTipo(db, { tipo: 'prueba.eco', ahora: T0 + 20 * MIN }).hasta, new Date(T0 + 30 * MIN).toISOString());
  // Con poca memoria solo corre lo que vigila.
  assert.deepEqual(tiposPermitidos({ registro: REGISTRO, frenoRecursos: 'poca_memoria' }), ['sistema.vigilar']);
  db.close();
});

// ---------- 17. Avisos ----------
test('avisos: se suman las veces, subir a grave hace que se mande otra vez, nunca baja, y al resolver queda la historia', () => {
  const { db } = nuevaBase();
  const id = abrirAviso(db, { clave: 'memoria_baja', nivel: 'atencion', detalle: { disponibleMb: 60 }, ahora: T0 });
  assert.equal(abrirAviso(db, { clave: 'memoria_baja', nivel: 'atencion', ahora: T0 + MIN }), id);
  assert.equal(db.prepare('SELECT veces FROM avisos WHERE id = ?').get(id).veces, 2);
  db.prepare('UPDATE avisos SET enviado_en = ? WHERE id = ?').run('2026-11-04T10:06:00.000Z', id);
  abrirAviso(db, { clave: 'memoria_baja', nivel: 'grave', ahora: T0 + 2 * MIN });
  let a = db.prepare('SELECT * FROM avisos WHERE id = ?').get(id);
  assert.equal(a.nivel, 'grave');
  assert.equal(a.enviado_en, null);
  assert.equal(a.veces, 3);
  db.prepare('UPDATE avisos SET enviado_en = ? WHERE id = ?').run('2026-11-04T10:08:00.000Z', id);
  abrirAviso(db, { clave: 'memoria_baja', nivel: 'atencion', ahora: T0 + 3 * MIN });
  a = db.prepare('SELECT * FROM avisos WHERE id = ?').get(id);
  assert.equal(a.nivel, 'grave', 'nunca baja');
  assert.ok(a.enviado_en, 'no se vuelve a mandar si no sube');
  assert.equal(resolverAviso(db, 'memoria_baja', T0 + 4 * MIN), true);
  assert.equal(resolverAviso(db, 'memoria_baja', T0 + 4 * MIN), false);
  const otro = abrirAviso(db, { clave: 'memoria_baja', ahora: T0 + 5 * MIN });
  assert.notEqual(otro, id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'memoria_baja'").get().n, 2, 'el resuelto sigue guardado');
  const admin = crearAdmin(db);
  assert.equal(marcarVisto(db, { id: otro, usuarioId: admin, ahora: T0 + 6 * MIN }), true);
  assert.equal(marcarVisto(db, { id: otro, usuarioId: admin, ahora: T0 + 7 * MIN }), true, 'dos veces no repite la auditoría');
  assert.equal(db.prepare('SELECT visto_por FROM avisos WHERE id = ?').get(otro).visto_por, admin);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'aviso_visto' AND usuario_id = ?").get(admin).n, 1);
  assert.equal(marcarVisto(db, { id: 9999, usuarioId: admin }), false);
  assert.equal(marcarVisto(db, { id: 'abc', usuarioId: admin }), false);
  assert.throws(() => abrirAviso(db, { clave: 'inventada' }), /no válida/);
  assert.throws(() => abrirAviso(db, { clave: 'disco_bajo', nivel: 'terrible' }), /no válido/);
  abrirAviso(db, { clave: 'freno:prueba.eco', nivel: 'atencion', ahora: T0 });
  abrirAviso(db, { clave: 'disco_bajo', nivel: 'grave', ahora: T0 });
  assert.equal(avisosAbiertos(db)[0].nivel, 'grave', 'los graves primero');
  const cambios = sincronizarAvisos(db, [{ clave: 'disco_bajo', activo: false }, { clave: 'wal_grande', nivel: 'atencion', activo: true }], T0 + 7 * MIN);
  assert.deepEqual(cambios, { abiertos: ['wal_grande'], resueltos: ['disco_bajo'] });
  assert.ok(avisosRecientes(db, { ahora: T0 + DIA }).length >= 4);
  db.close();
});

// ---------- 18. Salud ----------
test('salud: medir devuelve números y no cambia ningún archivo; los umbrales; una muestra por hora', () => {
  const { db, config } = nuevaBase();
  mkdirSync(config.carpetaCopias, { recursive: true });
  writeFileSync(join(config.carpetaCopias, 'oportia-antes-m4-prueba.db'), 'copia de prueba');
  writeFileSync(join(config.carpetaCopias, 'otro-archivo.txt'), 'no es una copia de OPORTIA');
  db.close();
  const antes = huellas(config.raiz);
  const medidas = medirSalud({ carpetaDatos: dirname(config.archivoBase), archivoBase: config.archivoBase, carpetaCopias: config.carpetaCopias, pids: { web: process.pid }, pantallasP99Ms: 6.4 });
  assert.deepEqual(huellas(config.raiz), antes, 'medir no debe cambiar ningún archivo');
  for (const [nombre, valor] of Object.entries({
    totalMb: medidas.memoria.totalMb, disponibleMb: medidas.memoria.disponibleMb, libreMb: medidas.disco.libreMb, discoTotalMb: medidas.disco.totalMb,
    archivoMb: medidas.base.archivoMb, walMb: medidas.base.walMb, carga: medidas.carga.m1,
  })) assert.equal(typeof valor, 'number', nombre);
  assert.ok(medidas.memoria.totalMb > 0);
  assert.deepEqual(medidas.copias.archivos, 1, 'solo cuenta las copias de OPORTIA');
  assert.ok(medidas.webMb === null || medidas.webMb > 0);
  assert.equal(medidas.pantallasP99Ms, 6.4);
  assert.ok(!Number.isNaN(Date.parse(medidas.encendidoDesde)));

  const caso = (cambios, reinicios24h = 0) => {
    const m = { memoria: { disponibleMb: 500 }, disco: { libreMb: 5000 }, base: { archivoMb: 1, walMb: 1 }, pantallasP99Ms: 5, ...cambios };
    return Object.fromEntries(evaluarSalud(m, { reinicios24h }).filter(a => a.activo).map(a => [a.clave, a.nivel]));
  };
  assert.deepEqual(caso({}), {});
  assert.deepEqual(caso({ memoria: { disponibleMb: 63 } }), { memoria_baja: 'atencion' });
  assert.deepEqual(caso({ memoria: { disponibleMb: 31 } }), { memoria_baja: 'grave' });
  assert.deepEqual(caso({ disco: { libreMb: 1000 } }), { disco_bajo: 'atencion' });
  assert.deepEqual(caso({ disco: { libreMb: 299 } }), { disco_bajo: 'grave' });
  assert.deepEqual(caso({ base: { archivoMb: 41, walMb: 65 } }), { base_grande: 'atencion', wal_grande: 'atencion' });
  assert.deepEqual(caso({ pantallasP99Ms: 201 }), { pantallas_lentas: 'atencion' });
  assert.deepEqual(caso({}, 3), { trabajador_reinicios: 'atencion' });
  assert.deepEqual(caso({ memoria: { disponibleMb: null }, disco: { libreMb: null }, pantallasP99Ms: null }), {}, 'lo que no se pudo medir no alarma');
  assert.equal(semaforo(evaluarSalud({ memoria: { disponibleMb: 500 }, disco: { libreMb: 5000 }, base: {} })), 'verde');
  assert.equal(semaforo(evaluarSalud({ memoria: { disponibleMb: 50 }, disco: { libreMb: 5000 }, base: {} })), 'amarillo');
  assert.equal(semaforo(evaluarSalud({ memoria: { disponibleMb: 50 }, disco: { libreMb: 100 }, base: {} })), 'rojo');

  const base = abrirBase(config);
  assert.equal(guardarMuestra(base, medidas, { listas: 1, enCurso: 0, fallidas24h: 0 }, T0), true);
  assert.equal(guardarMuestra(base, medidas, {}, T0 + 30 * MIN), false, 'la misma hora no repite');
  assert.equal(guardarMuestra(base, medidas, {}, T0 + HORA), true);
  const historial = historialSalud(base, { horas: 24 });
  assert.equal(historial.length, 2);
  assert.ok(historial[0].hora > historial[1].hora);
  assert.equal(historial[1].filaLista, 1);
  base.close();
});

// ---------- 19. Escritor ----------
test('escritor: pausa max(10 ms, 2× lo que tardó) después de cada escritura, en orden, y una que falla no traba a las demás', async () => {
  const { db } = nuevaBase();
  let reloj = 0;
  const pasos = [];
  const lentas = [];
  const escritor = crearEscritor(db, {
    reloj: () => reloj,
    dormir: async ms => { pasos.push(`pausa ${ms}`); },
    registro: { warn: texto => lentas.push(texto) },
  });
  const uno = escritor.escribir(() => { pasos.push('escribe 1'); reloj += 3; return 'a'; });
  const dos = escritor.escribir(() => { pasos.push('escribe 2'); reloj += 30; throw new Error('falla la 2'); });
  const tres = escritor.escribir(() => { pasos.push('escribe 3'); reloj += 7; return 'c'; });
  assert.equal(await uno, 'a');
  await assert.rejects(dos, /falla la 2/);
  assert.equal(await tres, 'c');
  await escritor.escribir(() => { pasos.push('escribe 4'); });
  assert.deepEqual(pasos.slice(0, 7), ['escribe 1', 'pausa 10', 'escribe 2', 'pausa 60', 'escribe 3', 'pausa 14', 'escribe 4']);
  assert.equal(lentas.length, 1, 'la de 30 ms queda anotada como lenta');
  const e = escritor.estadisticas();
  assert.equal(e.escrituras, 4);
  assert.equal(e.maxMs, 30);
  assert.equal(e.lentas, 1);

  // Cada escritura va en su transacción: si falla, no queda nada a medias.
  await assert.rejects(escritor.escribir(() => {
    db.prepare('INSERT INTO auditoria (fecha, accion) VALUES (?, ?)').run('x', 'a medias');
    throw new Error('se rompe');
  }), /se rompe/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'a medias'").get().n, 0);
  assert.equal(await escritor.escribir(() => db.prepare('PRAGMA user_version').get().user_version, { transaccion: false }), 0);
  await assert.rejects(escritor.escribir(async () => 1), /asíncrono/);
  await assert.rejects(escritor.escribir(() => Promise.resolve(1), { transaccion: false }), /asíncrono/);
  db.close();
});

// ---------- Botones del administrador (los usa la API de la parte c) ----------
test('reintentar y cancelar: solo desde los estados que tienen sentido, con evento y auditoría', () => {
  const { db } = nuevaBase();
  assert.throws(() => reintentar(db, { id: 999, usuarioId: 1 }), e => e.codigo === 404 && e.clave === 'no_existe');
  assert.throws(() => cancelar(db, { id: 'x', usuarioId: 1 }), e => e.codigo === 404);
  const id = poner(db, 'prueba.eco', { programa: 'prog', claveUnica: 'prog@1' });
  assert.throws(() => reintentar(db, { id, usuarioId: 1 }), e => e.codigo === 409 && e.clave === 'accion_no_permitida_ahora');
  assert.deepEqual(cancelar(db, { id, usuarioId: 1, ahora: T0 }), { id, estado: 'cancelada' });
  assert.throws(() => cancelar(db, { id, usuarioId: 1 }), e => e.clave === 'accion_no_permitida_ahora');
  const otra = poner(db, 'prueba.eco', { programa: 'prog', claveUnica: 'prog@2' });
  assert.throws(() => reintentar(db, { id, usuarioId: 1 }), e => e.codigo === 409 && e.clave === 'ya_hay_otra_en_marcha');
  cancelar(db, { id: otra, usuarioId: 1, ahora: T0 });
  assert.deepEqual(reintentar(db, { id, usuarioId: 1, ahora: T0 + MIN }), { id, estado: 'lista' });
  const f = fila(db, id);
  assert.equal(f.fallos_seguidos, 0);
  assert.equal(f.terminada_en, null);
  assert.deepEqual(eventos(db, id), ['cancelada', 'reintentada']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion IN ('tarea_cancelada', 'tarea_reintentada') AND usuario_id = 1").get().n, 3);
  db.close();
});

// ---------- 21. Privacidad ----------
test('privacidad: cada cuenta ve solo lo suyo, el administrador nunca ve datos ni resultados de proyectos, y un error que no es una clave sale como «error_interno»', () => {
  const { db } = nuevaBase();
  const a = crearCuenta(db, 'A');
  const b = crearCuenta(db, 'B');
  const pa = crearProyecto(db, a);
  const pb = crearProyecto(db, b);
  const ta = poner(db, 'prueba.eco', { proyectoId: pa, datos: { secreto: 'cliente de A' } });
  const tb = poner(db, 'prueba.eco', { proyectoId: pb, datos: { secreto: 'cliente de B' } });
  const ts = encolar(db, { tipo: 'sistema.vigilar', datos: { nota: 'del sistema' } }, { ahora: T0 }).id;
  // La tarea de B falla con un mensaje que trae cosas internas.
  db.prepare("UPDATE tareas SET disponible_en = ? WHERE id <> ?").run(new Date(T0 + DIA).toISOString(), tb);
  const t = tomar(db);
  assert.equal(t.id, tb);
  guardar(db, t, salidaDeError(new Error('Falló https://cliente-b.example/privado con la clave 1234')));

  assert.deepEqual(tareasDelEspacio(db, a).tareas.map(x => x.id), [ta]);
  assert.deepEqual(tareasDelEspacio(db, b).tareas.map(x => x.id), [tb]);
  assert.deepEqual(tareasDelEspacio(db, 9999).tareas, []);

  const { tareas } = listarTareas(db, { espacioAdmin: a });
  const porId = Object.fromEntries(tareas.map(x => [x.id, x]));
  for (const id of [ta, tb]) {
    for (const campo of ['datos', 'punto', 'resultado']) assert.ok(!(campo in porId[id]), `la tarea ${id} muestra ${campo}`);
  }
  assert.ok(!JSON.stringify(tareas).includes('cliente de'), 'nunca salen los datos de los proyectos');
  assert.ok(!JSON.stringify(tareas).includes('cliente-b.example'), 'nunca sale el texto del error de un proyecto');
  assert.equal(porId[tb].ultimoError, 'error_interno');
  assert.equal(porId[tb].ajena, true);
  assert.equal(porId[ta].ajena, false);
  assert.deepEqual(porId[ts].datos, { nota: 'del sistema' }, 'las del sistema sí muestran sus datos');
  const errores = erroresRecientes(db, { espacioAdmin: a });
  assert.equal(errores.length, 1);
  assert.equal(errores[0].motivo, 'error_interno');
  assert.equal(errores[0].proyecto, pb);
  assert.equal(errores[0].cuenta, b);
  assert.equal(errores[0].intento, 1);
  assert.ok(!JSON.stringify(errores).includes('cliente-b.example'));
  assert.equal(listarTareas(db, { estado: 'lista', espacioAdmin: a }).tareas.every(x => x.estado === 'lista'), true);
  assert.throws(() => listarTareas(db, { estado: 'inventado' }), e => e.codigo === 400);
  // «Ver más»: de a pocas, sin repetir.
  const pagina1 = listarTareas(db, { limite: 2 });
  assert.equal(pagina1.tareas.length, 2);
  const pagina2 = listarTareas(db, { limite: 2, antesDe: pagina1.siguiente });
  assert.deepEqual([...pagina1.tareas, ...pagina2.tareas].map(x => x.id), [ts, tb, ta]);
  assert.equal(pagina2.siguiente, null);
  db.close();
});

test('las listas de valores que se revisan en el código cuadran con lo que guarda la base', () => {
  const { db } = nuevaBase();
  programar(db, { ahora: T0 });
  for (const e of db.prepare('SELECT DISTINCT estado FROM tareas').all()) assert.ok(ESTADOS_TAREA.includes(e.estado));
  for (const e of db.prepare('SELECT DISTINCT evento FROM tarea_eventos').all()) assert.ok(EVENTOS.includes(e.evento));
  for (const c of db.prepare('SELECT DISTINCT cupo FROM tareas').all()) assert.ok(Object.hasOwn(CUPOS, c.cupo));
  for (const c of db.prepare('SELECT DISTINCT como_termino FROM trabajador_corridas WHERE como_termino IS NOT NULL').all()) assert.ok(COMO_TERMINA.includes(c.como_termino));
  assert.deepEqual([...ESTADOS_TAREA].sort(), ['cancelada', 'en_curso', 'fallida', 'hecha', 'lista', 'revisar']);
  db.close();
});

// ---------- 20. El ejecutor en este mismo proceso (tipos de test/tareas-prueba.js, tiempos cortos) ----------
const MANEJADORES_CON_PRUEBA = { ...MANEJADORES, ...MANEJADORES_PRUEBA };

function prepararEjecutor({ memoriaDisponibleMb = () => 1000, tiempos = {}, pedidos = [] } = {}) {
  const { db, config } = nuevaBase();
  const corrida = nuevaCorrida(db, { version: 'prueba', codigo: 'prueba' });
  const escritor = crearEscritor(db, { registro: SILENCIO });
  const ejecutor = crearEjecutor({
    db, config, corrida, escritor, registro: REGISTRO_PRUEBA, manejadores: MANEJADORES_CON_PRUEBA,
    tiempos: { rssMaxMb: 1e9, graciaAbortoMs: 100, ...tiempos }, programas: [], memoriaDisponibleMb, discoLibreMb: () => 100_000,
    pedirSalida: motivo => pedidos.push(motivo), log: SILENCIO,
  });
  const ponerAhora = (tipo, datos = {}) => encolar(db, { tipo, datos }, { registro: REGISTRO_PRUEBA }).id;
  const hasta = (condicion, que) => esperarHasta(async () => { await ejecutor.ciclo(); return condicion(); }, { que, cada: 20 });
  return { db, config, corrida, escritor, ejecutor, pedidos, ponerAhora, hasta };
}

test('ejecutor: una tarea de 2 pasos termina, y nunca corren más de 1 normal y 1 grande a la vez', async () => {
  const e = prepararEjecutor();
  const pasos = e.ponerAhora('prueba.pasos', { esperaMs: 0 });
  await e.hasta(() => fila(e.db, pasos).estado === 'hecha', 'prueba.pasos hecha');
  assert.equal(fila(e.db, pasos).pasos, 2);
  assert.deepEqual(JSON.parse(fila(e.db, pasos).resultado), { pasos: 2 });
  assert.equal(e.db.prepare('SELECT pasos_hechos FROM trabajador_corridas WHERE corrida = ?').get(e.corrida).pasos_hechos, 2);

  reiniciarConcurrencia();
  const ids = [];
  for (let i = 0; i < 3; i += 1) ids.push(e.ponerAhora('prueba.lenta', { ms: 60 }), e.ponerAhora('prueba.grande', { ms: 60 }));
  await e.hasta(() => ids.every(id => fila(e.db, id).estado === 'hecha'), 'las 6 tareas hechas');
  assert.equal(CONCURRENCIA.maximo.normal, 1);
  assert.equal(CONCURRENCIA.maximo.grande, 1);
  assert.equal(CONCURRENCIA.maximo.juntos, 2, 'una normal y una grande sí corren a la vez');
  await e.ejecutor.parar();
  e.db.close();
});

test('ejecutor: con poca memoria solo corre lo que vigila (freno «poca_memoria»)', async () => {
  const e = prepararEjecutor({ memoriaDisponibleMb: () => 20 });
  const eco = e.ponerAhora('prueba.eco');
  const vigilar = e.ponerAhora('sistema.vigilar');
  await e.hasta(() => fila(e.db, vigilar).estado === 'hecha', 'sistema.vigilar hecha aunque falte memoria');
  await e.ejecutor.ciclo();
  assert.equal(fila(e.db, eco).estado, 'lista', 'lo demás espera a que se libere memoria');
  assert.equal(e.ejecutor.estado().freno, 'poca_memoria');
  await e.ejecutor.parar();
  e.db.close();
});

test('ejecutor: parar a mitad de un paso devuelve la tarea a la fila sin contar fallo', async () => {
  const e = prepararEjecutor();
  const lenta = e.ponerAhora('prueba.lenta', { ms: 30_000 });
  await e.hasta(() => fila(e.db, lenta).estado === 'en_curso', 'prueba.lenta en curso');
  assert.equal(e.ejecutor.estado().enCurso.length, 1);
  const { devueltas } = await e.ejecutor.parar({ esperaMs: 30 });
  assert.equal(devueltas.length, 1);
  const f = fila(e.db, lenta);
  assert.equal(f.estado, 'lista');
  assert.equal(f.fallos_seguidos, 0);
  assert.equal(f.dueno, null);
  assert.deepEqual(eventos(e.db, lenta), ['interrumpida']);
  e.db.close();
});

test('ejecutor: un paso que no respeta la señal de parar da «tiempo_agotado» y es un zombi; con 2 zombis pide salir', async () => {
  const e = prepararEjecutor();
  const terca = e.ponerAhora('prueba.terca');
  await e.hasta(() => fila(e.db, terca).ultimo_error === 'tiempo_agotado', 'el primer corte por tiempo');
  assert.equal(fila(e.db, terca).fallos_seguidos >= 1, true);
  await e.hasta(() => e.pedidos.includes('zombis'), 'dos zombis piden salir');
  assert.equal(e.ejecutor.estado().zombis, 2);
  assert.ok(fila(e.db, terca).fallos_seguidos >= 2);
  await e.ejecutor.parar({ esperaMs: 0 });
  e.db.close();
});

test('ejecutor: un tipo que falla 6 veces seguidas en 2 tareas se frena solo, con su aviso', async () => {
  const e = prepararEjecutor();
  const a = e.ponerAhora('prueba.fallar');
  const b = e.ponerAhora('prueba.fallar');
  await e.hasta(() => fila(e.db, a).estado === 'fallida' && fila(e.db, b).estado === 'fallida', 'las dos fallidas (3 intentos cada una)');
  await esperarHasta(() => leerFrenos(e.db).some(f => f.tipo === 'prueba.fallar'), { que: 'el freno del tipo' });
  assert.ok(e.db.prepare("SELECT 1 FROM avisos WHERE clave = 'freno:prueba.fallar' AND resuelto_en IS NULL").get());
  const otra = e.ponerAhora('prueba.fallar');
  await e.ejecutor.ciclo();
  assert.equal(fila(e.db, otra).estado, 'lista', 'mientras está frenado, el tipo no se toma');
  await e.ejecutor.parar();
  e.db.close();
});

// ---------- Los trabajos del sistema (src/tareas/manejadores.js) ----------
function ctxDePrueba(db, config, { tarea = {}, dbParaLeer = db } = {}) {
  const escrituras = [];
  return {
    escrituras,
    ctx: {
      tarea: { id: 1, tipo: 'sistema.base', datos: {}, punto: null, pasos: 0, intento: 1, ...tarea },
      senal: new AbortController().signal,
      db: dbParaLeer,
      config,
      version: '0.0.0-prueba',
      codigo: 'codigo-prueba',
      escribir: (trabajo, { transaccion = true } = {}) => {
        escrituras.push(transaccion);
        // La misma conexión que usa el trabajo (ctx.db): así las transacciones de adentro se anidan bien.
        return Promise.resolve(transaccion ? enTransaccion(dbParaLeer, trabajo) : trabajo());
      },
      quedaMs: () => 60_000,
      ceder: () => Promise.resolve(),
    },
  };
}

test('sistema.base: con la base sana revisa y después ordena (2 pasos); con un problema activa el modo seguro «base_danada»', async () => {
  const { db, config } = nuevaBase();
  abrirAviso(db, { clave: 'base_danada', nivel: 'grave', ahora: T0 });
  const sano = ctxDePrueba(db, config);
  const paso1 = await MANEJADORES['sistema.base'].paso(sano.ctx);
  assert.deepEqual(paso1, { punto: { paso: 'mantener' } });
  assert.equal(avisosAbiertos(db).some(a => a.clave === 'base_danada'), false, 'una revisión buena resuelve el aviso anterior');
  const paso2 = await MANEJADORES['sistema.base'].paso({ ...sano.ctx, tarea: { ...sano.ctx.tarea, punto: paso1.punto } });
  assert.equal(paso2.listo, true);
  assert.equal(paso2.resultado.quickCheck, 'ok');
  assert.ok(paso2.resultado.paginas > 0);
  assert.ok(sano.escrituras.includes(false), 'optimize y el checkpoint van sin transacción');
  assert.equal(leerModoSeguro(db).activo, false);

  // Una base «dañada»: quick_check devuelve problemas (se simula la respuesta; nada se daña de verdad).
  const danada = new Proxy(db, {
    get(objetivo, nombre) {
      if (nombre === 'prepare') {
        return sql => (/quick_check/.test(sql) ? { all: () => [{ quick_check: '*** in database main *** Page 7: btreeInitPage() returns error code 11' }] } : objetivo.prepare(sql));
      }
      const valor = objetivo[nombre];
      return typeof valor === 'function' ? valor.bind(objetivo) : valor;
    },
  });
  const mal = ctxDePrueba(db, config, { dbParaLeer: danada });
  const r = await MANEJADORES['sistema.base'].paso(mal.ctx);
  assert.equal(r.listo, true);
  assert.equal(r.resultado.quickCheck, 'problemas');
  const m = leerModoSeguro(db);
  assert.equal(m.activo, true);
  assert.equal(m.motivo, 'base_danada');
  assert.equal(m.codigo, 'codigo-prueba');
  assert.equal(avisosAbiertos(db).find(a => a.clave === 'base_danada')?.nivel, 'grave');
  db.close();
});

test('sistema.vigilar: abre y resuelve los avisos de la fila según cómo está', async () => {
  const { db, config } = nuevaBase();
  const vigilar = async () => (await MANEJADORES['sistema.vigilar'].paso(ctxDePrueba(db, config, { tarea: { tipo: 'sistema.vigilar' } }).ctx));
  let r = await vigilar();
  assert.equal(r.listo, true);
  assert.equal(typeof r.resultado.walMb, 'number');
  assert.equal(avisosAbiertos(db).length, 0);
  const id = encolar(db, { tipo: 'prueba.correo' }, { registro: REGISTRO }).id;
  db.prepare("UPDATE tareas SET estado = 'revisar' WHERE id = ?").run(id);
  r = await vigilar();
  assert.equal(r.resultado.fila.revisar, 1);
  assert.deepEqual(avisosAbiertos(db).map(a => a.clave), ['tareas_revisar']);
  db.prepare("UPDATE tareas SET estado = 'cancelada' WHERE id = ?").run(id);
  await vigilar();
  assert.equal(avisosAbiertos(db).length, 0, 'cuando se arregla, el aviso se resuelve');
  db.close();
});

// ---------- 23. La puerta de arranque de /api/setup ----------
test('/api/setup: «arrancando» y «fallido» responden 503 arrancando al instante; «listo», «no_aplica» y sin supervisor, 200', async () => {
  const { db } = nuevaBase();
  let estado = 'arrancando';
  const supervisor = { estadoArranque: () => estado };
  await conServidor(crearServidor({ db, supervisor }), async base => {
    for (const valor of ['arrancando', 'fallido']) {
      estado = valor;
      const r = await fetch(`${base}/api/setup`);
      assert.equal(r.status, 503, valor);
      const datos = await r.json();
      assert.deepEqual(Object.keys(datos).sort(), ['app', 'error', 'estado', 'version'], 'no dice nada de la fila ni del modo seguro');
      assert.equal(datos.error, 'arrancando');
      assert.equal(datos.estado, 'arrancando');
      assert.equal(datos.app, 'oportia');
    }
    for (const valor of ['listo', 'no_aplica']) {
      estado = valor;
      const r = await fetch(`${base}/api/setup`);
      assert.equal(r.status, 200, valor);
      assert.equal((await r.json()).base.estado, 'ok');
    }
  });
  await conServidor(crearServidor({ db }), async base => {
    assert.equal((await fetch(`${base}/api/setup`)).status, 200, 'sin supervisor no hay puerta');
  });
  db.close();
});

// ---------- 22. La API del administrador (src/api/tareas.js) ----------
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE_PRUEBA = 'una clave bien larga';

async function pedirApi(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  const r = await fetch(`${base}${ruta}`, opciones);
  const cuerpo = await r.json().catch(() => ({}));
  const galletaNueva = r.headers.get('set-cookie');
  return { codigo: r.status, datos: cuerpo, galleta: galletaNueva ? galletaNueva.split(';')[0] : null };
}

// Crea a «junior» (administrador) y a «ana» (usuaria normal, con su contraseña ya cambiada).
async function adminYUsuaria(base) {
  const admin = await pedirApi(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE_PRUEBA }, cabeceras: DESDE_TAILSCALE });
  assert.equal(admin.codigo, 201);
  const creada = await pedirApi(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'ana' }, galleta: admin.galleta });
  const entrada = await pedirApi(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: creada.datos.claveTemporal } });
  assert.equal((await pedirApi(base, 'POST', '/api/yo/clave', { datos: { actual: creada.datos.claveTemporal, nueva: CLAVE_PRUEBA }, galleta: entrada.galleta })).codigo, 200);
  return { admin: admin.galleta, adminId: admin.datos.usuario.id, ana: entrada.galleta };
}

test('API del administrador: el estado del sistema, el modo seguro con auditoría, reintentar/cancelar con sus errores y los avisos', async () => {
  const { db } = nuevaBase();
  let despertado = 0;
  const supervisor = {
    estadoArranque: () => 'no_aplica',
    estado: () => ({ fase: 'esperando', pid: 4321, enCurso: [], freno: null, reinicios24h: 0 }),
    ponerModoSeguro: ({ activo, usuarioId }) => ponerModoSeguro(db, { activo, origen: 'admin', usuarioId, codigo: 'abc', version: '0.3.0' }),
    despertar: () => { despertado += 1; },
  };
  await conServidor(crearServidor({ db, supervisor }), async base => {
    const { admin, adminId, ana } = await adminYUsuaria(base);
    const pedir = (metodo, ruta, opciones = {}) => pedirApi(base, metodo, ruta, { galleta: admin, ...opciones });

    // El estado del sistema: solo el administrador.
    let r = await pedir('GET', '/api/admin/sistema');
    assert.equal(r.codigo, 200);
    for (const clave of ['fase', 'version', 'codigo', 'trabajador', 'modoSeguro', 'fila', 'frenos', 'proximas', 'errores', 'corridas', 'avisos', 'salud', 'historial']) {
      assert.ok(clave in r.datos, `falta ${clave}`);
    }
    assert.equal(r.datos.fase, 1);
    assert.equal(r.datos.trabajador.fase, 'esperando');
    assert.equal(r.datos.modoSeguro.activo, false);
    assert.ok(['verde', 'amarillo', 'rojo'].includes(r.datos.salud.semaforo));
    assert.deepEqual(r.datos.proximas.map(p => p.programa).sort(), ['sistema.base', 'sistema.vigilar']);
    assert.equal((await pedirApi(base, 'GET', '/api/admin/sistema', { galleta: ana })).codigo, 403);
    assert.equal((await pedirApi(base, 'GET', '/api/admin/sistema')).codigo, 401);

    // Modo seguro: solo true o false; cada cambio deja su auditoría con el administrador.
    assert.equal((await pedir('POST', '/api/admin/modo-seguro', { datos: { activo: 'si' } })).datos.error, 'datos_no_validos');
    assert.equal((await pedirApi(base, 'POST', '/api/admin/modo-seguro', { galleta: ana, datos: { activo: true } })).codigo, 403);
    r = await pedir('POST', '/api/admin/modo-seguro', { datos: { activo: true } });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.modoSeguro.activo, true);
    assert.equal(r.datos.modoSeguro.motivo, 'admin');
    assert.ok(!('usuarioId' in r.datos.modoSeguro), 'no muestra números internos');
    assert.equal(db.prepare("SELECT usuario_id FROM auditoria WHERE accion = 'modo_seguro_activado'").get().usuario_id, adminId);
    r = await pedir('POST', '/api/admin/modo-seguro', { datos: { activo: false } });
    assert.equal(r.datos.modoSeguro.activo, false);
    assert.equal(r.datos.modoSeguro.ultimo.por, 'admin');
    assert.equal(db.prepare("SELECT usuario_id FROM auditoria WHERE accion = 'modo_seguro_quitado'").get().usuario_id, adminId);

    // Reintentar y cancelar.
    assert.equal((await pedir('POST', '/api/admin/tareas/999/reintentar', { datos: {} })).datos.error, 'no_existe');
    assert.equal((await pedir('POST', '/api/admin/tareas/abc/cancelar', { datos: {} })).datos.error, 'no_existe');
    const primera = encolar(db, { tipo: 'sistema.vigilar', programa: 'sistema.vigilar', claveUnica: 'prueba:1' }).id;
    r = await pedir('POST', `/api/admin/tareas/${primera}/reintentar`, { datos: {} });
    assert.equal(r.codigo, 409);
    assert.equal(r.datos.error, 'accion_no_permitida_ahora', 'una tarea que espera no se reintenta');
    r = await pedir('POST', `/api/admin/tareas/${primera}/cancelar`, { datos: {} });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.estado, 'cancelada');
    assert.equal((await pedir('POST', `/api/admin/tareas/${primera}/cancelar`, { datos: {} })).datos.error, 'accion_no_permitida_ahora');
    const segunda = encolar(db, { tipo: 'sistema.vigilar', programa: 'sistema.vigilar', claveUnica: 'prueba:2' }).id;
    r = await pedir('POST', `/api/admin/tareas/${primera}/reintentar`, { datos: {} });
    assert.equal(r.codigo, 409);
    assert.equal(r.datos.error, 'ya_hay_otra_en_marcha');
    assert.equal(despertado, 0);
    assert.equal((await pedir('POST', `/api/admin/tareas/${segunda}/cancelar`, { datos: {} })).codigo, 200);
    r = await pedir('POST', `/api/admin/tareas/${primera}/reintentar`, { datos: {} });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.estado, 'lista');
    assert.equal(despertado, 1, 'reintentar despierta al trabajador');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion IN ('tarea_cancelada', 'tarea_reintentada') AND usuario_id = ?").get(adminId).n, 3);

    // La fila, con su filtro de estado.
    r = await pedir('GET', '/api/admin/tareas?estado=cancelada');
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.datos.tareas.map(x => x.id), [segunda]);
    assert.equal((await pedir('GET', '/api/admin/tareas?estado=rara')).datos.error, 'datos_no_validos');
    assert.equal((await pedir('GET', '/api/admin/tareas?antes=-1')).datos.error, 'datos_no_validos');

    // Avisos: «Entendido» los deja como vistos (no los borra ni los resuelve).
    const aviso = abrirAviso(db, { clave: 'disco_bajo', nivel: 'grave', detalle: { libreMb: 200 } });
    assert.equal((await pedir('POST', `/api/admin/avisos/${aviso}/visto`, { datos: {} })).codigo, 200);
    const fila = db.prepare('SELECT * FROM avisos WHERE id = ?').get(aviso);
    assert.equal(fila.visto_por, adminId);
    assert.equal(fila.resuelto_en, null);
    assert.equal((await pedir('POST', '/api/admin/avisos/9999/visto', { datos: {} })).datos.error, 'no_existe');
    r = await pedir('GET', '/api/admin/sistema');
    assert.equal(r.datos.avisos.abiertos.find(a => a.id === aviso).vistoEn != null, true);
  });
  db.close();
});

test('API del administrador: sin supervisor también funciona, y la acción 31 en 10 minutos responde 429', async () => {
  const { db } = nuevaBase();
  await conServidor(crearServidor({ db }), async base => {
    const { admin } = await adminYUsuaria(base);
    const pedir = (metodo, ruta, opciones = {}) => pedirApi(base, metodo, ruta, { galleta: admin, ...opciones });
    let r = await pedir('GET', '/api/admin/sistema');
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.trabajador.fase, 'sin_supervisor');
    assert.ok(r.datos.salud.base.archivoMb > 0, 'mide la base aunque no haya supervisor');
    r = await pedir('POST', '/api/admin/modo-seguro', { datos: { activo: true } });
    assert.equal(r.datos.modoSeguro.activo, true);
    assert.equal(leerModoSeguro(db).origen, 'admin');
    // Un pedido mal hecho no gasta acciones; cualquier acción, aunque responda 404, sí.
    for (let i = 0; i < 5; i += 1) assert.equal((await pedir('POST', '/api/admin/modo-seguro', { datos: {} })).codigo, 400);
    for (let i = 2; i <= 30; i += 1) assert.equal((await pedir('POST', '/api/admin/avisos/9999/visto', { datos: {} })).codigo, 404, `acción ${i}`);
    r = await pedir('POST', '/api/admin/modo-seguro', { datos: { activo: false } });
    assert.equal(r.codigo, 429);
    assert.equal(r.datos.error, 'demasiados_intentos');
    assert.equal(leerModoSeguro(db).activo, true, 'la acción 31 no cambió nada');
    assert.equal((await pedir('GET', '/api/admin/sistema')).codigo, 200, 'mirar no tiene tope');
  });
  db.close();
});

// ---------- Arreglos de la revisión de la parte 1c ----------
test('un resultado o un punto que no se puede guardar (BigInt, circular, toJSON que falla) deja la tarea «fallida» y el trabajador sigue', async () => {
  const e = prepararEjecutor();
  const ids = ['bigint', 'circular', 'tojson'].map(modo => e.ponerAhora('prueba.rara', { modo }));
  await e.hasta(() => ids.every(id => fila(e.db, id).estado === 'fallida'), 'las 3 tareas raras fallidas');
  for (const id of ids) {
    const f = fila(e.db, id);
    assert.equal(f.ultimo_error, 'respuesta_no_valida');
    assert.equal(f.fallos_seguidos, 1, 'no se reintenta: es un error del programa');
    assert.deepEqual(eventos(e.db, id), ['fallida']);
  }
  assert.deepEqual(e.pedidos, [], 'el trabajador no pidió salir');
  // Y sigue trabajando normal.
  const eco = e.ponerAhora('prueba.eco');
  await e.hasta(() => fila(e.db, eco).estado === 'hecha', 'prueba.eco hecha después');
  await e.ejecutor.parar();
  e.db.close();

  // guardarPaso también se cuida solo, aunque le llegue la salida sin pasar por normalizarSalida.
  const { db } = nuevaBase();
  const id = poner(db, 'prueba.eco');
  assert.equal(guardar(db, tomar(db), { tipo: 'listo', resultado: { n: 2n } }).estado, 'fallida');
  assert.equal(fila(db, id).ultimo_error, 'respuesta_no_valida');
  db.close();
});

test('si el paso de una tarea no se puede guardar ni la segunda vez, el trabajador sale y ESA tarea suma un fallo (no vuelve gratis)', async () => {
  const e = prepararEjecutor();
  // La base no deja terminar ninguna tarea (como si guardar fallara siempre).
  e.db.exec(`CREATE TEMP TRIGGER no_se_deja BEFORE UPDATE OF estado ON tareas WHEN NEW.estado = 'hecha'
    BEGIN SELECT RAISE(ABORT, 'no se puede guardar'); END;`);
  const eco = e.ponerAhora('prueba.eco');
  await e.hasta(() => e.pedidos.includes('caida'), 'el trabajador pide salir');
  const { devueltas } = await e.ejecutor.parar();
  assert.equal(devueltas.length, 1);
  const f = fila(e.db, eco);
  assert.equal(f.estado, 'lista');
  assert.equal(f.fallos_seguidos, 1);
  assert.equal(f.ultimo_error, 'no_se_pudo_guardar');
  assert.deepEqual(eventos(e.db, eco), ['abandonada']);
  e.db.close();

  // Con sus intentos gastados queda «fallida» (antes de que el trabajador llegue al modo seguro).
  const { db } = nuevaBase();
  const id = poner(db, 'prueba.eco');
  poner(db, 'prueba.grande');
  for (let vida = 1; vida <= 3; vida++) {
    db.prepare('UPDATE tareas SET disponible_en = ? WHERE id = ?').run(new Date(T0).toISOString(), id);
    assert.equal(tomar(db).id, id);
    const otra = tomar(db, { cupo: 'grande' });
    devolverLasMias(db, { corrida: 'corrida-1', culpables: [id], ahora: T0, azar: MITAD, registro: REGISTRO });
    assert.equal(fila(db, otra.id).fallos_seguidos, 0, 'la otra tarea en curso no tuvo la culpa');
  }
  assert.equal(fila(db, id).estado, 'fallida');
  assert.deepEqual(eventos(db, id), ['abandonada', 'abandonada', 'fallida']);
  db.close();
});

test('repetible:false: un paso cortado por tiempo o con un error cualquiera va a «por revisar» (nunca se repite solo); un ErrorTarea sí puede volver', async () => {
  const { db } = nuevaBase();
  const corte = Object.assign(new Error('se pasó'), { name: 'TimeoutError' });
  for (const [salida, esperado] of [
    [salidaDeError(corte), 'revisar'],
    [salidaDeError(new Error('se cayó la conexión')), 'revisar'],
    [{ tipo: 'listo', resultado: { n: 1n } }, 'revisar'],
    [salidaDeError(new ErrorTarea('sin_red')), 'lista'], // el trabajo SABE que no salió nada
    [salidaDeError(new ErrorTarea('clave_mala', { reintentable: false })), 'fallida'],
  ]) {
    const id = poner(db, 'prueba.correo');
    const t = tomar(db);
    assert.equal(t.id, id);
    assert.equal(guardar(db, t, salida).estado, esperado, JSON.stringify(salida.error ?? salida.tipo));
    if (esperado === 'revisar') assert.deepEqual(eventos(db, id), ['revisar']);
    db.prepare("UPDATE tareas SET estado = 'cancelada' WHERE id = ?").run(id);
  }
  // Uno que sí se puede repetir, cortado por tiempo, vuelve a la fila como siempre.
  const eco = poner(db, 'prueba.eco');
  assert.equal(guardar(db, tomar(db), salidaDeError(corte)).estado, 'lista');
  assert.equal(fila(db, eco).ultimo_error, 'tiempo_agotado');
  db.close();

  // Con el ejecutor de verdad: un «correo» que no respeta la señal se corta por tiempo, igual «sale», y no se
  // vuelve a mandar: queda por revisar.
  ENVIOS.n = 0;
  const e = prepararEjecutor();
  const correo = e.ponerAhora('prueba.correo_terco', { ms: 300 });
  await e.hasta(() => fila(e.db, correo).estado === 'revisar', 'el correo por revisar');
  assert.equal(fila(e.db, correo).ultimo_error, 'tiempo_agotado');
  await esperarHasta(() => ENVIOS.n === 1, { que: 'el envío que ya estaba en marcha' });
  for (let i = 0; i < 5; i++) await e.ejecutor.ciclo();
  await new Promise(listo => setTimeout(listo, 400));
  assert.equal(ENVIOS.n, 1, 'se mandó una sola vez');
  assert.equal(fila(e.db, correo).tomas, 1);
  await e.ejecutor.parar({ esperaMs: 0 });
  e.db.close();
});

// Cómo contaba resumenFila antes (trayendo cada fila a JavaScript): el SQL nuevo tiene que dar lo mismo.
function resumenFilaComoAntes(db, { tipos, ahora }) {
  const conocidos = new Set(tipos);
  const momento = new Date(ahora).toISOString();
  const r = { listas: 0, esperando: 0, enCurso: 0, revisar: 0, enPausa: 0, esperanVersion: 0, fallidas7d: 0, hechas24h: 0, fallidas24h: 0, canceladas24h: 0, masViejaDesde: null, atrasadaDesde: null };
  for (const t of db.prepare(`SELECT t.estado, t.tipo, t.disponible_en, t.proyecto_id, p.estado AS p_estado, p.en_papelera AS p_papelera
    FROM tareas t LEFT JOIN proyectos p ON p.id = t.proyecto_id WHERE t.estado IN ('lista', 'en_curso', 'revisar')`).all()) {
    if (t.estado === 'en_curso') r.enCurso += 1;
    else if (t.estado === 'revisar') r.revisar += 1;
    else if (!conocidos.has(t.tipo)) r.esperanVersion += 1;
    else if (t.proyecto_id != null && !(t.p_estado === 'en_ejecucion' && t.p_papelera === 0)) r.enPausa += 1;
    else if (t.disponible_en > momento) r.esperando += 1;
    else { r.listas += 1; if (r.masViejaDesde == null || t.disponible_en < r.masViejaDesde) r.masViejaDesde = t.disponible_en; }
  }
  if (r.masViejaDesde != null && r.masViejaDesde < new Date(ahora - 30 * MIN).toISOString()) r.atrasadaDesde = r.masViejaDesde;
  const hace24h = new Date(ahora - DIA).toISOString();
  for (const t of db.prepare("SELECT estado, terminada_en FROM tareas WHERE estado IN ('hecha', 'fallida', 'cancelada') AND terminada_en >= ?").all(new Date(ahora - 7 * DIA).toISOString())) {
    if (t.estado === 'fallida') r.fallidas7d += 1;
    if (t.terminada_en < hace24h) continue;
    if (t.estado === 'hecha') r.hechas24h += 1;
    else if (t.estado === 'fallida') r.fallidas24h += 1;
    else r.canceladas24h += 1;
  }
  return r;
}

test('resumenFila cuenta en SQLite y da exactamente lo mismo que antes (estados, pausas, tipos nuevos, esperas, 24 h y 7 días)', () => {
  const { db } = nuevaBase();
  const cuenta = crearCuenta(db);
  const proyectos = [crearProyecto(db, cuenta), crearProyecto(db, cuenta, { estado: 'pausado' }), crearProyecto(db, cuenta, { papelera: 1 })];
  const estados = ['lista', 'lista', 'en_curso', 'revisar', 'hecha', 'fallida', 'cancelada'];
  let semilla = 7;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
  for (let i = 0; i < 300; i++) {
    const id = poner(db, 'prueba.eco', { claveUnica: `r${i}`, ...(azar() < 0.4 ? { proyectoId: proyectos[Math.floor(azar() * 3)] } : {}) });
    const estado = estados[Math.floor(azar() * estados.length)];
    const disponible = new Date(T0 + Math.round((azar() - 0.6) * 4 * HORA)).toISOString();
    const terminada = ['hecha', 'fallida', 'cancelada'].includes(estado) ? new Date(T0 - Math.round(azar() * 9 * DIA)).toISOString() : null;
    db.prepare('UPDATE tareas SET estado = ?, disponible_en = ?, terminada_en = ?, tipo = ? WHERE id = ?')
      .run(estado, disponible, terminada, azar() < 0.1 ? 'proyecto.de_la_fase_9' : 'prueba.eco', id);
  }
  for (const ahora of [T0, T0 + HORA, T0 - 3 * HORA]) {
    const nuevo = resumenFila(db, { tipos: TIPOS_PRUEBA, ahora });
    assert.deepEqual(nuevo, resumenFilaComoAntes(db, { tipos: TIPOS_PRUEBA, ahora }));
    if (ahora === T0) assert.ok(nuevo.listas > 0 && nuevo.atrasadaDesde && nuevo.enPausa > 0 && nuevo.esperanVersion > 0 && nuevo.hechas24h > 0 && nuevo.fallidas7d > 0, JSON.stringify(nuevo));
  }
  // Con la fila vacía, todo en cero.
  const { db: vacia } = nuevaBase();
  assert.deepEqual(resumenFila(vacia, { tipos: TIPOS_PRUEBA, ahora: T0 }), resumenFilaComoAntes(vacia, { tipos: TIPOS_PRUEBA, ahora: T0 }));
  vacia.close();
  db.close();
});

test('servicio_inestable: después de que alguien lo quita, una sola caída más NO lo vuelve a poner (cuentan solo los arranques nuevos)', () => {
  const { db } = nuevaBase();
  for (let i = 0; i < 3; i++) registrarArranque(db, { version: 'v', codigo: 'c', ahora: T0 + i * MIN });
  assert.equal(registrarArranque(db, { version: 'v', codigo: 'c', ahora: T0 + 3 * MIN }).modoSeguro?.activo, true);
  ponerModoSeguro(db, { activo: false, origen: 'admin', ahora: T0 + 5 * MIN });
  // El servicio se vuelve a caer UNA vez: el arranque siguiente no lo activa.
  const quinto = registrarArranque(db, { version: 'v', codigo: 'c', ahora: T0 + 6 * MIN });
  assert.equal(quinto.caidasRecientes, 0);
  assert.equal(leerModoSeguro(db).activo, false);
  // Con 3 caídas nuevas, sí (la regla de siempre).
  registrarArranque(db, { version: 'v', codigo: 'c', ahora: T0 + 7 * MIN });
  registrarArranque(db, { version: 'v', codigo: 'c', ahora: T0 + 8 * MIN });
  assert.equal(leerModoSeguro(db).activo, false);
  assert.equal(registrarArranque(db, { version: 'v', codigo: 'c', ahora: T0 + 9 * MIN }).caidasRecientes, 3);
  assert.equal(leerModoSeguro(db).motivo, 'servicio_inestable');
  db.close();
});
