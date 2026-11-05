// Fase 1, parte d: la IA opcional con topes. Migración 5, precios, configuración (apagada por defecto), reservas, topes
// (nunca se pasan, ni con 4 procesos a la vez), cierre de reservas huérfanas, liquidación, avisos al 50/80/100 % y la
// vigilancia de cada hora. Nada de esto usa la red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { configDePrueba, carpetaTemporal, esperarHasta } from './ayuda.js';
import { T0, claveAnthropic, preparar, ponerConfig, veces } from './ia-base.js';
import { abrirBase, conectarBase, estadoBase } from '../src/nucleo/db.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { ErrorHttp } from '../src/nucleo/http.js';
import { abrirAviso, avisosAbiertos, claveDeAvisoValida } from '../src/avisos/avisos.js';
import { mesCobro, inicioMesSiguienteCobro } from '../src/tareas/tiempo.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import { escritorDeTarea } from '../src/tareas/cola.js';
import { rutaLlave } from '../src/claves/cifrado.js';
import { guardarSecreto, desactivarSecreto, anotarPrueba, pausarSecreto } from '../src/claves/almacen.js';
import { PROPOSITOS, MOTIVOS, ESTADOS_LLAMADA, AMBITO } from '../src/ia/propositos.js';
import { POLITICA, MOTIVOS_CON_POLITICA, finDePausa, politicaDe } from '../src/ia/politica.js';
import {
  cargarPrecios, estadoPrecios, precioDe, filaDe, costoMicro, reservaMicro, cotaMicro, tramoDe, geoMilDe,
} from '../src/ia/precios.js';
import {
  CONFIG_POR_DEFECTO, leerConfigIa, guardarConfigIa, faltaParaEncender, usdAMicro, apagarSiNoQuedaProveedor, normalizarConfig,
} from '../src/ia/config.js';
import { gastoMicro, apartadoMicro } from '../src/ia/gasto.js';
import { reservar, liquidar, vigilarIA, disponibilidad, barrerViejas, tipicoMicro, VIEJA_MS } from '../src/ia/presupuesto.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 60_000;
const textoPrecios = readFileSync(join(RAIZ, 'src', 'ia', 'precios.json'), 'utf8');

const reservarUno = (b, extra = {}) => reservar(b.db, { config: b.config, proposito: 'interpretar', espacioId: b.espacioAdmin, entradaMax: 6900, ahora: T0, ...extra });
const usoDe = (entrada, salida, extra = {}) => ({ entrada, salida, cacheLectura: 0, cacheEscritura: 0, geo: 'global', raro: false, desconocidos: 0, ...extra });
const bien = (uso, extra = {}) => ({ motivo: 'ok', estado: 'hecha', uso, http: 200, ...extra });
const fila = (db, id) => db.prepare('SELECT * FROM ia_llamadas WHERE id = ?').get(id);
const avisoDe = (db, clave) => db.prepare('SELECT * FROM avisos WHERE clave = ? AND resuelto_en IS NULL').get(clave);

// ---------- 1. Migración 5 ----------

test('migración 5: crea las tablas e índices de la IA, sin CHECK, y abrir otra vez no repite nada', () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const nombres = tipo => new Set(db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all(tipo).map(f => f.name));
  for (const t of ['secretos', 'ia_llamadas', 'ia_bloqueos']) assert.ok(nombres('table').has(t), `falta la tabla ${t}`);
  for (const i of ['secretos_por_uso', 'ia_llamadas_mes', 'ia_llamadas_espacio', 'ia_llamadas_proyecto', 'ia_llamadas_tarea', 'ia_llamadas_fecha', 'ia_llamadas_reservadas']) {
    assert.ok(nombres('index').has(i), `falta el índice ${i}`);
  }
  assert.equal(estadoBase(db).version, 5);
  const m5 = MIGRACIONES.find(m => m.id === 5);
  assert.equal((m5.sql.match(/\bCHECK\b/gi) || []).length, 0, 'un CHECK nunca se puede ampliar');
  assert.doesNotMatch(m5.sql, /CREATE\s+UNIQUE\s+INDEX/i, 'un índice único nunca se puede quitar');
  // Las cuentas del gasto usan sus índices.
  const plan = (sql, ...p) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...p).map(f => f.detail).join(' | ');
  assert.match(plan("SELECT SUM(reservado_micro) FROM ia_llamadas WHERE mes = ?", '2026-11'), /ia_llamadas_mes/);
  assert.match(plan('SELECT SUM(reservado_micro) FROM ia_llamadas WHERE mes = ? AND espacio_id = ?', '2026-11', 1), /ia_llamadas_espacio/);
  assert.match(plan('SELECT SUM(reservado_micro) FROM ia_llamadas WHERE mes = ? AND proyecto_id = ? AND cuenta_proyecto = 1', '2026-11', 1), /ia_llamadas_proyecto/);
  assert.match(plan("SELECT id FROM ia_llamadas WHERE estado = 'reservada' AND creada_en < ?", 'x'), /ia_llamadas_reservadas/);
  assert.match(plan('SELECT COUNT(*) FROM ia_llamadas WHERE creada_en >= ?', 'x'), /ia_llamadas_fecha/);
  db.close();
  const otra = abrirBase(config);
  assert.equal(otra.prepare('SELECT COUNT(*) AS n FROM oportia_migraciones').get().n, MIGRACIONES.length);
  otra.close();
});

test('migración 5: una base en la versión 4 se pone al día con su copia oportia-antes-m5-*.db, y la 0.3.2 la sigue abriendo', () => {
  const config = configDePrueba();
  const vieja = abrirBase(config, MIGRACIONES.filter(m => m.id <= 4));
  vieja.prepare('INSERT INTO auditoria (fecha, accion) VALUES (?, ?)').run('2026-11-04', 'dato de 0.3.2');
  vieja.close();
  const db = abrirBase(config);
  assert.equal(estadoBase(db).version, 5);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'dato de 0.3.2'").get().n, 1);
  db.prepare("INSERT INTO ia_bloqueos (mes, ambito, motivo, proposito, veces, primera_vez, ultima_vez) VALUES ('2026-11', 'general', 'ia_apagada', 'interpretar', 1, 'x', 'x')").run();
  db.close();
  const copias = readdirSync(config.carpetaCopias);
  assert.equal(copias.length, 1);
  assert.match(copias[0], /^oportia-antes-m5-.+\.db$/);
  const copia = new DatabaseSync(join(config.carpetaCopias, copias[0]), { readOnly: true });
  assert.equal(copia.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'ia_llamadas'").get().n, 0);
  copia.close();
  // Si el actualizador vuelve a 0.3.2 (solo el código): sus migraciones 1–4 abren la base v5 sin tocar nada, y su
  // trabajador (versión mínima 4) se conecta.
  const de032 = abrirBase(config, MIGRACIONES.filter(m => m.id <= 4));
  assert.equal(estadoBase(de032).version, 5);
  assert.equal(de032.prepare('SELECT COUNT(*) AS n FROM ia_bloqueos').get().n, 1, 'las filas nuevas siguen ahí');
  de032.close();
  assert.equal(readdirSync(config.carpetaCopias).length, 1, 'abrirla con 0.3.2 no hizo otra copia');
  const trabajador032 = conectarBase(config, { versionMinima: 4 });
  trabajador032.close();
});

// ---------- 6. Precios ----------

test('precios: el archivo es válido, Claude Haiku 5.5 está confirmado y ChatGPT todavía no gasta', () => {
  assert.deepEqual(estadoPrecios(), { valido: true, modelos: 4, error: null });
  assert.ok(precioDe('anthropic', CONFIG_POR_DEFECTO.proveedores.anthropic.modelo));
  assert.equal(precioDe('openai', 'gpt-6-luna'), null, 'confirmado:false nunca gasta');
  assert.equal(filaDe('openai', 'gpt-6-luna').confirmado, false);
  assert.equal(precioDe('anthropic', 'claude-inventado'), null);
});

test('precios: cualquier cosa mal en el archivo deja la tabla vacía (nada se puede gastar) y nunca lanza', () => {
  const base = JSON.parse(textoPrecios);
  const con = cambio => { const copia = structuredClone(base); cambio(copia); return JSON.stringify(copia); };
  const malos = [
    'esto no es json',
    con(d => { d.version = 2; }),
    con(d => { d.modelos[0].tramos[0].entrada = '0.1234'; }),
    con(d => { d.modelos[0].tramos[0].salida = 0.5; }),
    con(d => { delete d.modelos[0].fuente; }),
    con(d => { d.modelos[0].fuente = 'https://otro-sitio.com/precios'; }),
    con(d => { d.modelos[0].fuente = 'http://platform.claude.com/docs'; }),
    con(d => { d.modelos[0].revisadoEl = '5/11/2026'; }),
    con(d => { d.modelos[0].confirmado = 'si'; }),
    con(d => { d.modelos[0].tramos.reverse(); }),
    con(d => { d.modelos[0].tramos[1].hastaEntrada = 50; }),
    con(d => { d.modelos[0].tramos[1].entrada = '0.05'; }),
    con(d => { d.modelos[0].multiplicadoresGeo = { us: '1.1' }; }),
    con(d => { d.modelos[0].multiplicadoresGeo.us = '0.9'; }),
    con(d => { d.modelos[0].multiplicadoresGeo.us = 1.1; }),
    con(d => { d.modelos.push(structuredClone(d.modelos[0])); }),
  ];
  for (const texto of malos) {
    const r = cargarPrecios(texto);
    assert.equal(r.filas.length, 0, texto.slice(0, 60));
    assert.ok(r.error);
    assert.equal(precioDe('anthropic', 'claude-haiku-5-5', r.filas), null);
  }
  assert.equal(cargarPrecios(textoPrecios).filas.length, 4);
});

test('precios: cuentas exactas en enteros, siempre hacia arriba, con el lugar (×1,1 en EE. UU.) y el tramo largo', () => {
  const h = precioDe('anthropic', 'claude-haiku-5-5');
  // 23 tokens a US$0,10/MTok + 70 a US$0,01/MTok = 0,000003 dólares exactos. Con decimales saldría 4.
  assert.equal(costoMicro(h, { entrada: 23, salida: 0, cacheLectura: 70, cacheEscritura: 0, geo: 'global' }), 3);
  assert.equal(costoMicro(h, { entrada: 23, salida: 0, cacheLectura: 70, cacheEscritura: 0, geo: 'us' }), 4);
  assert.equal(costoMicro(h, { entrada: 23, salida: 0, cacheLectura: 70, cacheEscritura: 0, geo: null }), 4, 'sin lugar: el más caro');
  assert.equal(costoMicro(h, { entrada: 23, salida: 0, cacheLectura: 70, cacheEscritura: 0, geo: 'marte' }), 4);
  assert.equal(costoMicro(h, usoDe(1, 0)), 1, 'una fracción de µUSD se cobra entera');
  assert.equal(costoMicro(h, usoDe(2000, 500)), 450);
  assert.equal(costoMicro(h, usoDe(2000, 500, { geo: 'us' })), 495);
  // El tramo de más de 100.000 tokens cuenta también los de caché.
  assert.equal(tramoDe(h, 100_000).hastaEntrada, 100_000);
  assert.equal(tramoDe(h, 100_001).hastaEntrada, null);
  assert.equal(costoMicro(h, { entrada: 60_000, cacheLectura: 30_000, cacheEscritura: 10_001, salida: 0, geo: 'global' }), Math.ceil((60_000 * 500 + 30_000 * 50 + 10_001 * 625) / 1000));
  assert.equal(costoMicro(h, { entrada: 200_000, salida: 1000, cacheLectura: 0, cacheEscritura: 0, geo: 'us' }), Math.ceil(((200_000 * 500 + 1000 * 2500) * 1100) / 1_000_000));
  assert.equal(geoMilDe(h, 'us'), 1100);
  assert.equal(geoMilDe(h, 'global'), 1000);
  // Las reservas del diseño: unos US$0,0022 para una instrucción típica, nunca más de US$0,005.
  assert.equal(reservaMicro(h, { entradaMax: 6900, salidaMax: 2048 }), 2180);
  assert.equal(reservaMicro(h, { entradaMax: 24_200, salidaMax: 2048 }), 4678);
  assert.ok(reservaMicro(h, { entradaMax: 24_200, salidaMax: 2048 }) <= PROPOSITOS.interpretar.maximoMicro);
  // Lo desconocido se cobra al precio más alto de la fila y del lugar más caro; nunca menos que lo apartado.
  assert.equal(cotaMicro(h, usoDe(10, 10, { desconocidos: 1000 }), 5), Math.ceil((10 * 100 + 10 * 500) / 1000) + (1000 * 2500 * 1100) / 1_000_000);
  assert.equal(cotaMicro(h, usoDe(10, 10, { desconocidos: 0 }), 999), 999);
  assert.throws(() => costoMicro(h, usoDe(-1, 0)), /tokens/);
});

test('precios: la reserva nunca es menor que el costo real de cualquier uso dentro de sus límites (cualquier modelo y lugar)', () => {
  let semilla = 7;
  const azar = n => { semilla = (semilla * 1_103_515_245 + 12_345) % 2_147_483_648; return semilla % (n + 1); };
  const filas = cargarPrecios(textoPrecios).filas;
  for (const fila of filas) {
    for (let i = 0; i < 1500; i++) {
      const entradaMax = 1 + azar(300_000);
      const salidaMax = 1 + azar(4096);
      const cacheLectura = azar(entradaMax);
      const cacheEscritura = azar(entradaMax - cacheLectura);
      const entrada = azar(entradaMax - cacheLectura - cacheEscritura);
      const uso = { entrada, cacheLectura, cacheEscritura, salida: azar(salidaMax), geo: ['global', 'us', null, 'eu'][azar(3)] };
      assert.ok(reservaMicro(fila, { entradaMax, salidaMax }) >= costoMicro(fila, uso), `${fila.modelo} ${JSON.stringify(uso)}`);
    }
  }
});

// ---------- Configuración: apagada por defecto ----------

test('configuración: la IA llega apagada, con tope US$0 en todo, y un valor dañado se lee como apagada', () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const cfg = leerConfigIa(db);
  assert.equal(cfg.encendida, false);
  assert.equal(cfg.topeGeneralMicro, 0);
  assert.deepEqual(cfg.topesPlanMicro, { prueba: 0, pago: 0, empresarial: 0 });
  assert.equal(cfg.ayudaProyectos, false);
  assert.equal(cfg.proveedores.openai.usar, false);
  assert.equal(cfg.proveedores.anthropic.modelo, 'claude-haiku-5-5');
  db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('ia.config', '{no es json', 'x')").run();
  assert.equal(leerConfigIa(db).encendida, false);
  const raro = normalizarConfig({ version: 1, encendida: 'si', topeGeneralMicro: 123, topesPlanMicro: { prueba: 999_999_999 }, llamadasPorHora: 10_000, orden: ['openai'], ayudaProyectos: 1 });
  assert.equal(raro.encendida, false);
  assert.equal(raro.topeGeneralMicro, 0, 'un tope que no es de centavos enteros no vale');
  assert.equal(raro.topesPlanMicro.prueba, 0);
  assert.equal(raro.llamadasPorHora, 30);
  assert.deepEqual(raro.orden, ['anthropic', 'openai']);
  assert.equal(raro.ayudaProyectos, false);
  assert.equal(normalizarConfig({ version: 2, encendida: true }).encendida, false, 'una versión desconocida se lee como apagada');
  db.close();
});

test('configuración: encender necesita clave probada, tope y precio; la ayuda necesita la IA; apagar no toca la ayuda', () => {
  const b = preparar({ encendida: false, tope: 0, probar: false });
  const { db, config, admin } = b;
  const intentar = (cambios, faltan) => assert.throws(() => guardarConfigIa(db, cambios, { config, usuarioId: admin }), e => {
    assert.ok(e instanceof ErrorHttp);
    assert.equal(e.codigo, 409);
    assert.equal(e.clave, 'ia_falta');
    assert.deepEqual(e.detalle, { faltan });
    return true;
  });
  intentar({ encendida: true }, ['clave', 'tope']);
  anotarPrueba(db, { id: b.secretoId, motivo: 'ok' });
  intentar({ encendida: true }, ['tope']);
  guardarConfigIa(db, { topeGeneralMicro: usdAMicro('2.50', 100_000_000) }, { config, usuarioId: admin });
  intentar({ ayudaProyectos: true }, ['encendida']);
  intentar({ usar: { openai: true } }, ['precio']);
  // Una clave en pausa del dueño no sirve para encender.
  pausarSecreto(db, { id: b.secretoId, motivo: 'sin_credito', hastaMs: null });
  intentar({ encendida: true }, ['clave']);
  db.prepare('UPDATE secretos SET pausa_motivo = NULL, pausa_hasta = NULL, pausa_desde = NULL').run();
  assert.deepEqual(faltaParaEncender(db, config), []);
  guardarConfigIa(db, { encendida: true, ayudaProyectos: true }, { config, usuarioId: admin });
  assert.equal(leerConfigIa(db).encendida, true);
  guardarConfigIa(db, { encendida: false }, { config, origen: 'consola' });
  const apagada = leerConfigIa(db);
  assert.equal(apagada.encendida, false);
  assert.equal(apagada.ayudaProyectos, true, 'apagar deja «Ayuda en proyectos» como estaba');
  assert.equal(apagada.origen, 'consola');
  // Topes: hasta US$100 el general, US$20 cada plan, con hasta 2 decimales.
  for (const malo of ['100.01', '-1', '1.234', 'diez', '', '1e3']) assert.throws(() => usdAMicro(malo, 100_000_000), e => e.clave === 'tope_no_valido');
  assert.equal(usdAMicro('100', 100_000_000), 100_000_000);
  assert.equal(usdAMicro(0.5, 20_000_000), 500_000);
  assert.throws(() => usdAMicro('20.01', 20_000_000), e => e.clave === 'tope_no_valido');
  assert.throws(() => guardarConfigIa(db, { topeGeneralMicro: 1 }, { config }), e => e.clave === 'tope_no_valido');
  assert.throws(() => guardarConfigIa(db, { topesPlanMicro: { inventado: 0 } }, { config }), e => e.clave === 'tope_no_valido');
  assert.throws(() => guardarConfigIa(db, { otraCosa: true }, { config }), e => e.clave === 'datos_no_validos');
  // Cada cambio queda en la auditoría con lo de antes y lo de después (corto, sin claves).
  const filas = db.prepare("SELECT detalle FROM auditoria WHERE accion = 'ia_config' ORDER BY id").all().map(f => JSON.parse(f.detalle));
  assert.deepEqual(filas.at(-1), { antes: { encendida: true }, despues: { encendida: false }, origen: 'consola' });
  assert.ok(filas.some(f => f.despues.topeGeneralMicro === 2_500_000 && f.antes.topeGeneralMicro === 0));
  db.close();
});

test('configuración: si ya no queda una clave probada con la IA encendida, la IA se apaga sola (y una clave nueva no la enciende)', () => {
  const b = preparar();
  const { db, config, admin } = b;
  assert.equal(apagarSiNoQuedaProveedor(db, config, { usuarioId: admin }), false);
  desactivarSecreto(db, config, { id: b.secretoId, usuarioId: admin, trasCambio: d => ({ iaApagada: apagarSiNoQuedaProveedor(d, config, { usuarioId: admin }) }) });
  assert.equal(leerConfigIa(db).encendida, false);
  assert.equal(leerConfigIa(db).origen, 'automatico');
  const nueva = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('n'), usuarioId: admin });
  anotarPrueba(db, { id: nueva.secreto.id, motivo: 'ok' });
  assert.equal(leerConfigIa(db).encendida, false, 'una clave nueva nunca vuelve a gastar sin un «Encender» nuevo');
  db.close();
});

// ---------- 7. Reservas: cada bloqueo sin red, contado en ia_bloqueos ----------

test('reservar: sin la IA encendida, sin la ayuda, sin proveedor, sin clave o sin llave no aparta nada y lo cuenta', () => {
  const casos = [
    ['ia_apagada', () => preparar({ encendida: false })],
    ['ayuda_no_activada', () => preparar({ ayuda: false })],
    ['proveedor_no_usado', () => { const b = preparar(); ponerConfig(b.db, { proveedores: { anthropic: { usar: false, modelo: 'claude-haiku-5-5' }, openai: { usar: false, modelo: 'gpt-6-luna' } } }); return b; }],
    ['sin_clave', () => { const b = preparar(); b.db.prepare("UPDATE secretos SET estado = 'desactivada'").run(); return b; }],
    ['clave_ilegible', () => { const b = preparar(); b.db.prepare("UPDATE secretos SET llave_huella = '0000000000000000'").run(); return b; }],
    ['llave_no_disponible', () => { const b = preparar(); const r = rutaLlave(b.config); renameSync(r, `${r}.movida`); return b; }],
    ['precio_sin_confirmar', () => { const b = preparar(); ponerConfig(b.db, { orden: ['openai', 'anthropic'], proveedores: { anthropic: { usar: false, modelo: 'claude-haiku-5-5' }, openai: { usar: true, modelo: 'gpt-6-luna' } } }); return b; }],
    ['proveedor_en_pausa', () => { const b = preparar(); pausarSecreto(b.db, { id: b.secretoId, motivo: 'sin_credito', hastaMs: null }); return b; }],
    ['clave_no_valida', () => { const b = preparar(); anotarPrueba(b.db, { id: b.secretoId, motivo: 'clave_no_valida' }); return b; }],
    ['tope_general', () => { const b = preparar(); ponerConfig(b.db, { topeGeneralMicro: 0 }); return b; }],
  ];
  for (const [motivo, armar] of casos) {
    const b = armar();
    const r = reservarUno(b);
    assert.deepEqual(r, { ok: false, motivo, ambito: 'general' }, motivo);
    assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n, 0, `${motivo}: no se apartó nada`);
    assert.equal(veces(b.db, motivo), 1, `${motivo}: se contó una vez`);
    reservarUno(b);
    assert.equal(veces(b.db, motivo), 2, 'repetir solo suma (una fila por mes, ámbito, motivo y propósito)');
    assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM ia_bloqueos').get().n, 1);
    b.db.close();
  }
});

test('reservar: una pausa corta se pasa sola a su hora; una del dueño no', () => {
  const b = preparar();
  pausarSecreto(b.db, { id: b.secretoId, motivo: 'sobrecargado', hastaMs: T0 + 2 * MIN, ahora: T0 });
  assert.equal(reservarUno(b, { ahora: T0 + MIN }).motivo, 'proveedor_en_pausa');
  assert.equal(reservarUno(b, { ahora: T0 + 2 * MIN }).ok, true);
  pausarSecreto(b.db, { id: b.secretoId, motivo: 'sin_credito', hastaMs: null, ahora: T0 });
  assert.equal(reservarUno(b, { ahora: T0 + 40 * 86_400_000 }).motivo, 'proveedor_en_pausa');
  b.db.close();
});

test('reservar: demasiado cara, precio cambiado, demasiadas por hora y topes (la cuenta del administrador solo usa el general)', () => {
  const b = preparar({ tope: 100_000, planes: { prueba: 10_000 } });
  const { db } = b;
  // Más cara de lo permitido para una vez (entrada enorme).
  assert.equal(reservarUno(b, { entradaMax: 40_000 }).motivo, 'llamada_muy_cara');
  // La persona aceptó pagar menos de lo que costaría ahora.
  assert.equal(reservarUno(b, { maximoConfirmadoMicro: 2179 }).motivo, 'precio_cambio');
  assert.equal(reservarUno(b, { maximoConfirmadoMicro: 2180 }).ok, true);
  // Demasiadas en una hora.
  ponerConfig(db, { llamadasPorHora: 2 });
  assert.equal(reservarUno(b, { ahora: T0 + 1000 }).ok, true);
  assert.equal(reservarUno(b, { ahora: T0 + 2000 }).motivo, 'demasiadas_llamadas');
  assert.equal(reservarUno(b, { ahora: T0 + 61 * MIN }).ok, true, 'a la hora siguiente vuelve');
  ponerConfig(db, { llamadasPorHora: 600 });
  // La otra cuenta (plan prueba, tope US$0,01): la segunda ya no cabe.
  const otra = extra => reservarUno(b, { espacioId: b.espacioOtro, ...extra });
  assert.equal(otra({ ahora: T0 + 62 * MIN }).ok, true);
  assert.equal(otra({ ahora: T0 + 62 * MIN }).ok, true);
  assert.equal(otra({ ahora: T0 + 62 * MIN }).ok, true);
  assert.equal(otra({ ahora: T0 + 62 * MIN }).ok, true);
  assert.deepEqual(otra({ ahora: T0 + 62 * MIN }), { ok: false, motivo: 'tope_espacio', ambito: `e${b.espacioOtro}` });
  assert.ok(gastoMicro(db, { mes: '2026-11', espacioId: b.espacioOtro }) <= 10_000);
  // Con los planes en 0, la otra cuenta no usa IA nunca; la del administrador sí (con el general).
  guardarConfigIa(db, { topesPlanMicro: { prueba: 0 } }, { config: b.config });
  assert.equal(otra({ ahora: T0 + 63 * MIN }).motivo, 'tope_espacio');
  assert.equal(reservarUno(b, { ahora: T0 + 63 * MIN }).ok, true);
  // El general se llena: nadie más reserva.
  let n = 0;
  while (reservarUno(b, { ahora: T0 + 64 * MIN }).ok) n += 1;
  assert.ok(n > 0);
  assert.ok(gastoMicro(db, { mes: '2026-11' }) <= 100_000);
  assert.equal(reservarUno(b, { ahora: T0 + 64 * MIN }).motivo, 'tope_general');
  assert.ok(veces(db, 'tope_general') >= 1);
  db.close();
});

test('reservar: el tope de un proyecto sale SOLO de su versión aprobada (fase 2); una pendiente que permite IA no cuenta', () => {
  const b = preparar({ tope: 1_000_000, planes: { prueba: 1_000_000 } });
  const { db } = b;
  const ahora = new Date(T0).toISOString();
  const propositos = { de_proyecto: { ...PROPOSITOS.interpretar, ambito: 'proyecto', cuentaProyecto: true, ajuste: null } };
  const proyecto = (estado, versiones, papelera = 0) => {
    const id = Number(db.prepare(`INSERT INTO proyectos (espacio_id, numero, nombre, estado, version_activa, en_papelera, creado_en, actualizado_en)
      VALUES (?, (SELECT COALESCE(MAX(numero), 0) + 1 FROM proyectos WHERE espacio_id = ?), 'p', ?, ?, ?, ?, ?)`)
      .run(b.espacioOtro, b.espacioOtro, estado, versiones.find(v => v.estado === 'aprobada')?.numero ?? null, papelera, ahora, ahora).lastInsertRowid);
    for (const v of versiones) {
      db.prepare("INSERT INTO proyecto_versiones (proyecto_id, numero, instrucciones, configuracion, estado, creada_en) VALUES (?, ?, 'x', ?, ?, ?)")
        .run(id, v.numero, JSON.stringify({ ia: v.ia }), v.estado, ahora);
    }
    return id;
  };
  const usar = (proyectoId, extra = {}) => reservar(db, { config: b.config, proposito: 'de_proyecto', espacioId: b.espacioOtro, proyectoId, entradaMax: 6900, ahora: T0, propositos, ...extra });
  const permitida = usd => ({ permitida: true, topeMensualUsd: usd });
  const noPermitida = proyecto('en_ejecucion', [{ numero: 1, estado: 'aprobada', ia: { permitida: false, topeMensualUsd: 0 } }, { numero: 2, estado: 'pendiente', ia: permitida(5) }]);
  assert.equal(usar(noPermitida).motivo, 'no_permitida_en_proyecto', 'la pendiente que permite IA no vale');
  const sinIa = proyecto('en_ejecucion', [{ numero: 1, estado: 'aprobada', ia: null }]);
  assert.equal(usar(sinIa).motivo, 'no_permitida_en_proyecto');
  assert.equal(usar(proyecto('pausado', [{ numero: 1, estado: 'aprobada', ia: permitida(5) }])).motivo, 'proyecto_inactivo');
  assert.equal(usar(proyecto('en_ejecucion', [{ numero: 1, estado: 'aprobada', ia: permitida(5) }], 1)).motivo, 'proyecto_inactivo');
  assert.equal(usar(proyecto('pendiente', [{ numero: 1, estado: 'pendiente', ia: permitida(5) }])).motivo, 'proyecto_inactivo');
  const conTope = proyecto('en_ejecucion', [{ numero: 1, estado: 'aprobada', ia: permitida(0.005) }]);
  const r = usar(conTope);
  assert.equal(r.ok, true);
  assert.equal(fila(db, r.llamada.id).cuenta_proyecto, 1);
  assert.equal(usar(conTope).ok, true);
  assert.deepEqual(usar(conTope), { ok: false, motivo: 'tope_proyecto', ambito: `p${conTope}` });
  assert.ok(gastoMicro(db, { mes: '2026-11', proyectoId: conTope }) <= 5000);
  assert.equal(db.prepare("SELECT veces FROM ia_bloqueos WHERE ambito = ?").get(`p${conTope}`).veces, 1);
  db.close();
});

// ---------- 8. Carrera: 4 procesos × 300 reservas ----------

test('carrera: 4 procesos reservando a la vez (300 cada uno) nunca pasan el tope general ni el de ninguna cuenta', async () => {
  const b = preparar({ tope: 600_000, planes: { prueba: 120_000, pago: 160_000 } });
  const { db } = b;
  ponerConfig(db, { llamadasPorHora: 600 });
  // Una tercera cuenta con plan «pago».
  const { crearUsuario } = await import('../src/cuentas/usuarios.js');
  const { espacioPropio } = await import('../src/cuentas/planes.js');
  const tercera = espacioPropio(db, crearUsuario(db, { nombre: 'pedro', claveHash: 'x' })).id;
  db.prepare("UPDATE espacios SET plan = 'pago' WHERE id = ?").run(tercera);
  const espacios = [b.espacioAdmin, b.espacioOtro, tercera];
  const barrera = carpetaTemporal('carrera');
  const hijo = semilla => new Promise((listo, mal) => {
    const p = spawn(process.execPath, ['--no-warnings', join(RAIZ, 'test', 'ia-hijo.js'), b.config.archivoBase, '300', String(semilla), barrera, ...espacios.map(String)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    let error = '';
    p.stdout.on('data', d => { salida += d; });
    p.stderr.on('data', d => { error += d; });
    p.on('exit', codigo => (codigo === 0 ? listo(JSON.parse(salida)) : mal(new Error(`el hijo salió con ${codigo}: ${error.slice(0, 400)}`))));
  });
  const corriendo = [1, 2, 3, 4].map(hijo);
  // Los cuatro arrancan juntos: cuando todos están listos, «vamos» (y «vamos» siempre, para que ninguno se quede esperando).
  try {
    await esperarHasta(() => [1, 2, 3, 4].every(n => existsSync(join(barrera, `listo-${n}`))), { ms: 60_000, que: 'los 4 hijos listos' });
  } finally {
    writeFileSync(join(barrera, 'vamos'), '');
  }
  const resultados = await Promise.all(corriendo);
  const mes = mesCobro(Date.now());
  const general = gastoMicro(db, { mes });
  assert.ok(general <= 600_000, `general ${general} > 600000`);
  assert.ok(gastoMicro(db, { mes, espacioId: b.espacioOtro }) <= 200_000);
  assert.ok(gastoMicro(db, { mes, espacioId: tercera }) <= 300_000);
  const ok = resultados.reduce((s, r) => s + r.ok, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n, ok);
  const motivos = new Set(resultados.flatMap(r => Object.keys(r.no)));
  assert.ok(motivos.has('tope_general') && motivos.has('tope_espacio'), `se alcanzaron los dos topes: ${[...motivos]}`);
  assert.ok(resultados.filter(r => r.ok > 0).length >= 2, `de verdad reservaron a la vez: ${JSON.stringify(resultados.map(r => r.ok))}`);
  // Lo que de verdad se gastó (las terminadas) siempre es menos que lo apartado.
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM ia_llamadas WHERE estado = 'hecha' AND costo_micro > reservado_micro").get().n === 0);
  db.close();
});

test('una reserva que pasa por la cerca de una tarea que ya no es suya no aparta nada (ni cuenta un bloqueo)', async () => {
  const b = preparar();
  const escribir = escritorDeTarea(crearEscritor(b.db, { pausaMinMs: 0 }), b.db, { tarea: { id: 999, tomas: 1 }, corrida: 'otra' });
  await assert.rejects(escribir(() => reservarUno(b)), e => e.clave === 'ya_no_es_mia');
  assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n, 0);
  assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM ia_bloqueos').get().n, 0);
  b.db.close();
});

// ---------- 9. Reservas huérfanas ----------

test('una reserva de más de 10 minutos se cierra como «desconocida» contando lo apartado; una respuesta tardía anota lo real', () => {
  const b = preparar();
  const vieja = reservarUno(b, { ahora: T0 }).llamada;
  const nueva = reservarUno(b, { ahora: T0 + 10 * MIN }).llamada;
  assert.equal(barrerViejas(b.db, { ahora: T0 + VIEJA_MS + 1 }), 1);
  assert.equal(barrerViejas(b.db, { ahora: T0 + VIEJA_MS + 2 }), 0);
  const f = fila(b.db, vieja.id);
  assert.equal(f.estado, 'desconocida');
  assert.equal(f.resultado, 'interrumpida');
  assert.equal(f.costo_micro, vieja.reservadoMicro);
  assert.equal(fila(b.db, nueva.id).estado, 'reservada', 'la de 1 minuto no se toca');
  assert.equal(gastoMicro(b.db, { mes: '2026-11' }), vieja.reservadoMicro + nueva.reservadoMicro, 'cada una cuenta una sola vez');
  // Llega tarde la respuesta de la vieja, con lo que gastó: se anota lo real.
  const l = liquidar(b.db, { llamadaId: vieja.id, resultado: bien(usoDe(2000, 500)), ahora: T0 + 12 * MIN });
  assert.equal(l.cambio, true);
  assert.equal(fila(b.db, vieja.id).estado, 'hecha');
  assert.equal(fila(b.db, vieja.id).costo_micro, 450);
  // Una respuesta tardía sin lo gastado no cambia nada.
  const otra = reservarUno(b, { ahora: T0 + 13 * MIN }).llamada;
  barrerViejas(b.db, { ahora: T0 + 30 * MIN });
  assert.equal(liquidar(b.db, { llamadaId: otra.id, resultado: { motivo: 'tiempo_agotado', estado: 'desconocida' }, ahora: T0 + 31 * MIN }).cambio, false);
  assert.equal(fila(b.db, otra.id).costo_micro, otra.reservadoMicro);
  b.db.close();
});

// ---------- 10. Liquidar ----------

test('liquidar: anota tokens, costo, resultado y duración; un error claro cuesta 0; una fila cerrada no se toca dos veces', () => {
  const b = preparar();
  const r = reservarUno(b).llamada;
  assert.equal(apartadoMicro(b.db, { mes: '2026-11' }), r.reservadoMicro);
  const l = liquidar(b.db, { llamadaId: r.id, resultado: bien(usoDe(2000, 500, { geo: 'us' }), { idPeticion: 'req_123', detalle: { stop: 'end_turn', otro: 'Un mensaje largo con espacios' } }), duracionMs: 812.4, ahora: T0 + 1000 });
  assert.deepEqual(l, { cambio: true, costoMicro: 495, mayorQueReserva: false, estado: 'hecha', motivo: 'ok' });
  const f = fila(b.db, r.id);
  assert.equal(f.tokens_entrada, 2000);
  assert.equal(f.tokens_salida, 500);
  assert.equal(f.duracion_ms, 812);
  assert.equal(f.id_peticion, 'req_123');
  assert.deepEqual(JSON.parse(f.detalle), { stop: 'end_turn', geo: 'us' }, 'solo códigos cortos: nunca un mensaje');
  assert.equal(JSON.parse(f.precio).modelo, 'claude-haiku-5-5', 'guarda el precio que usó');
  assert.ok(f.precio.length < 400, `la copia del precio es corta (${f.precio.length} bytes): el libro de gastos nunca se borra`);
  assert.equal(costoMicro(JSON.parse(f.precio), usoDe(2000, 500, { geo: 'us' })), 495, 'las cuentas salen de la copia guardada');
  assert.ok(b.db.prepare('SELECT usado_en FROM secretos WHERE id = ?').get(b.secretoId).usado_en);
  assert.equal(liquidar(b.db, { llamadaId: r.id, resultado: bien(usoDe(1, 1)) }).cambio, false, 'una fila cerrada no cambia');
  assert.equal(liquidar(b.db, { llamadaId: 9999, resultado: bien(usoDe(1, 1)) }).cambio, false);
  const r2 = reservarUno(b).llamada;
  const l2 = liquidar(b.db, { llamadaId: r2.id, resultado: { motivo: 'error_proveedor', estado: 'fallida', http: 500 }, ahora: T0 + 2000 });
  assert.equal(l2.costoMicro, 0);
  assert.equal(fila(b.db, r2.id).estado, 'fallida');
  // Un 200 sin lo gastado: cuenta lo apartado (nunca menos).
  const r3 = reservarUno(b, { ahora: T0 + 10 * MIN }).llamada;
  const l3 = liquidar(b.db, { llamadaId: r3.id, resultado: { motivo: 'ok', estado: 'hecha', uso: null, http: 200 }, ahora: T0 + 10 * MIN });
  assert.equal(l3.estado, 'desconocida');
  assert.equal(l3.costoMicro, r3.reservadoMicro);
  // Un motivo que no existe nunca cuenta de menos.
  const r4 = reservarUno(b, { ahora: T0 + 11 * MIN }).llamada;
  assert.equal(liquidar(b.db, { llamadaId: r4.id, resultado: { motivo: 'inventado' }, ahora: T0 + 11 * MIN }).costoMicro, r4.reservadoMicro);
  b.db.close();
});

test('liquidar: si costó más de lo apartado, se anota lo real, se avisa grave y esa clave queda en pausa del dueño', () => {
  const b = preparar();
  const r = reservarUno(b).llamada;
  const l = liquidar(b.db, { llamadaId: r.id, resultado: bien(usoDe(30_000, 2000)), ahora: T0 + 1000 });
  assert.equal(l.mayorQueReserva, true);
  assert.equal(l.costoMicro, Math.ceil((30_000 * 100 + 2000 * 500) / 1000));
  assert.ok(l.costoMicro > r.reservadoMicro);
  const aviso = avisoDe(b.db, 'ia_costo_mayor');
  assert.equal(aviso.nivel, 'grave');
  assert.deepEqual(JSON.parse(aviso.detalle), { proveedor: 'anthropic', llamadaId: r.id, realMicro: l.costoMicro, reservadoMicro: r.reservadoMicro, motivo: 'costo_mayor' });
  assert.equal(b.db.prepare('SELECT pausa_motivo, pausa_hasta FROM secretos WHERE id = ?').get(b.secretoId).pausa_motivo, 'costo_mayor');
  assert.equal(reservarUno(b, { ahora: T0 + 2000 }).motivo, 'proveedor_en_pausa');
  // Un gasto desconocido (por ejemplo, caché de 1 hora): se cuenta la cota y pasa lo mismo.
  const c = preparar();
  const rc = reservarUno(c).llamada;
  const lc = liquidar(c.db, { llamadaId: rc.id, resultado: bien(usoDe(2000, 500, { raro: true, desconocidos: 50 })), ahora: T0 });
  assert.equal(lc.mayorQueReserva, true);
  assert.ok(lc.costoMicro >= rc.reservadoMicro);
  assert.equal(JSON.parse(fila(c.db, rc.id).detalle).motivoInterno, 'uso_desconocido');
  assert.equal(c.db.prepare('SELECT pausa_motivo FROM secretos').get().pausa_motivo, 'costo_mayor');
  b.db.close();
  c.db.close();
});

test('política: cada motivo con política existe y tiene su estado; las pausas cortas duran lo que deben', () => {
  assert.deepEqual(MOTIVOS_CON_POLITICA, Object.keys(POLITICA));
  assert.equal(new Set(MOTIVOS).size, MOTIVOS.length);
  for (const m of MOTIVOS) assert.match(m, /^[a-z_]+$/);
  for (const p of Object.values(POLITICA)) assert.ok(['hecha', 'fallida', 'desconocida'].includes(p.estado));
  assert.equal(finDePausa(POLITICA.limite_proveedor, { reintentarMs: 30_000, ahora: 0 }), MIN, 'retry-after de 30 s: al menos 1 minuto');
  assert.equal(finDePausa(POLITICA.limite_proveedor, { reintentarMs: 3_600_000, ahora: 0 }), 15 * MIN, 'y como mucho 15');
  assert.equal(finDePausa(POLITICA.limite_proveedor, { reintentarMs: null, ahora: 0 }), MIN);
  assert.equal(finDePausa(POLITICA.sobrecargado, { ahora: 0 }), 2 * MIN);
  assert.equal(finDePausa(POLITICA.sin_credito, { ahora: 0 }), null);
  assert.equal(politicaDe('inventado').estado, 'desconocida');
});

// ---------- 11. Avisos al 50 / 80 / 100 % ----------

test('avisos de tope: UNA fila por tope y mes, sube 50 → 80 → 100 (lleno), cada subida se vuelve a mandar; repetir no escribe', () => {
  const b = preparar({ tope: 10_000 });
  const { db } = b;
  const clave = 'ia_tope:general:2026-11';
  const gastar = (n, ahora = T0) => {
    for (let i = 0; i < n; i++) {
      const r = reservarUno(b, { ahora });
      assert.equal(r.ok, true);
      liquidar(db, { llamadaId: r.llamada.id, resultado: bien(usoDe(0, 2000)), ahora }); // 1.000 µUSD cada uno
    }
  };
  gastar(4);
  assert.equal(avisoDe(db, clave), undefined, 'al 40 % todavía no');
  gastar(1);
  let a = avisoDe(db, clave);
  assert.equal(a.nivel, 'info');
  assert.equal(JSON.parse(a.detalle).umbral, 50);
  assert.equal(JSON.parse(a.detalle).vuelveEl, '2026-12-01T00:00:00.000Z');
  db.prepare('UPDATE avisos SET enviado_en = ?, visto_en = ?, visto_por = ? WHERE id = ?').run('mandado', 'visto', b.admin, a.id);
  gastar(1);
  const igual = avisoDe(db, clave);
  assert.equal(igual.veces, 1, 'al 60 % no se escribe nada');
  assert.equal(igual.enviado_en, 'mandado');
  gastar(2);
  a = avisoDe(db, clave);
  assert.equal(a.id, igual.id, 'la misma fila');
  assert.equal(a.nivel, 'atencion');
  assert.equal(JSON.parse(a.detalle).umbral, 80);
  assert.equal(a.enviado_en, null, 'subió: se vuelve a mandar');
  assert.equal(a.visto_en, null, 'y la pantalla lo muestra como nuevo');
  // 8.000 gastados: la próxima reserva (2.180) ya no cabe.
  assert.equal(reservarUno(b).motivo, 'tope_general');
  a = avisoDe(db, clave);
  assert.equal(a.nivel, 'grave');
  assert.equal(JSON.parse(a.detalle).umbral, 100, 'un uso frenado por el tope cuenta como lleno');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave LIKE 'ia_tope:%'").get().n, 1, 'una sola fila en todo el mes');
  // Subir el tope cierra el «lleno» (queda en la historia) y vuelve a mirar: 8.000 de 20.000 = 40 %, nada abierto.
  guardarConfigIa(db, { topeGeneralMicro: 20_000 }, { config: b.config, ahora: T0 + 1000 });
  assert.equal(avisoDe(db, clave), undefined);
  assert.ok(db.prepare('SELECT resuelto_en FROM avisos WHERE id = ?').get(a.id).resuelto_en);
  // Bajarlo abre uno nuevo (otra fila).
  guardarConfigIa(db, { topeGeneralMicro: 10_000 }, { config: b.config, ahora: T0 + 2000 });
  assert.equal(JSON.parse(avisoDe(db, clave).detalle).umbral, 80);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM avisos WHERE clave = ?').get(clave).n, 2);
  // Un mes de cobro nuevo empieza limpio, y la vigilancia cierra los del mes pasado.
  const diciembre = Date.parse('2026-12-02T12:00:00Z');
  gastar(5, diciembre);
  assert.equal(JSON.parse(avisoDe(db, 'ia_tope:general:2026-12').detalle).umbral, 50);
  vigilarIA(db, { config: b.config, ahora: diciembre });
  assert.equal(avisoDe(db, clave), undefined);
  assert.ok(avisoDe(db, 'ia_tope:general:2026-12'));
  for (const x of avisosAbiertos(db)) assert.ok(claveDeAvisoValida(x.clave));
  db.close();
});

test('avisos de tope de una cuenta: tienen su propia fila y al 100 % quedan en «atención» (el grave es solo el general)', () => {
  const b = preparar({ tope: 1_000_000, planes: { prueba: 10_000 } });
  const { db } = b;
  for (let i = 0; i < 4; i++) {
    const r = reservarUno(b, { espacioId: b.espacioOtro });
    liquidar(db, { llamadaId: r.llamada.id, resultado: bien(usoDe(0, 4000)), ahora: T0 });
  }
  assert.equal(reservarUno(b, { espacioId: b.espacioOtro }).motivo, 'tope_espacio');
  const a = avisoDe(db, `ia_tope:e${b.espacioOtro}:2026-11`);
  assert.equal(a.nivel, 'atencion');
  assert.equal(JSON.parse(a.detalle).umbral, 100);
  assert.equal(avisoDe(db, 'ia_tope:general:2026-11'), undefined, 'el general va por el 0,8 %');
  assert.equal(avisoDe(db, `ia_tope:e${b.espacioAdmin}:2026-11`), undefined, 'la cuenta del administrador no tiene tope propio');
  db.close();
});

test('el mes de la IA es el del proveedor (UTC): 19:30 en RD del último día cuenta en ese mes; 20:30 ya en el siguiente', () => {
  const b = preparar({ tope: 1_000_000 });
  const antes = Date.parse('2026-11-30T23:30:00Z'); // 7:30 p. m. en RD
  const despues = Date.parse('2026-12-01T00:30:00Z'); // 8:30 p. m. en RD, todavía 30 de noviembre allá
  assert.equal(mesCobro(antes), '2026-11');
  assert.equal(mesCobro(despues), '2026-12');
  const r1 = reservarUno(b, { ahora: antes }).llamada;
  const r2 = reservarUno(b, { ahora: despues }).llamada;
  assert.equal(r1.mes, '2026-11');
  assert.equal(r2.mes, '2026-12');
  const reinicio = inicioMesSiguienteCobro(antes);
  assert.equal(new Date(reinicio).toISOString(), '2026-12-01T00:00:00.000Z');
  const enRd = new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false }).format(reinicio);
  assert.match(enRd, /30\/11.*20:00/, `se reinicia el 30 de noviembre a las 8:00 p. m. en RD (${enRd})`);
  assert.equal(disponibilidad(b.db, { config: b.config, espacioId: b.espacioAdmin, proposito: 'interpretar', entradaMax: 6900, ahora: antes }).vuelveEl, '2026-12-01T00:00:00.000Z');
  b.db.close();
});

test('abrirAviso con reenviar: vuelve a mandarse y a mostrarse; sin reenviar queda como estaba', () => {
  const b = preparar({ encendida: false });
  const { db } = b;
  const id = abrirAviso(db, { clave: 'ia_proveedor:anthropic', nivel: 'info', detalle: { a: 1 } });
  db.prepare('UPDATE avisos SET enviado_en = ?, visto_en = ?, visto_por = ? WHERE id = ?').run('x', 'y', b.admin, id);
  abrirAviso(db, { clave: 'ia_proveedor:anthropic', nivel: 'info', detalle: { a: 2 } });
  let a = db.prepare('SELECT * FROM avisos WHERE id = ?').get(id);
  assert.deepEqual([a.enviado_en, a.visto_en, a.visto_por], ['x', 'y', b.admin]);
  abrirAviso(db, { clave: 'ia_proveedor:anthropic', nivel: 'info', detalle: { a: 3 }, reenviar: true });
  a = db.prepare('SELECT * FROM avisos WHERE id = ?').get(id);
  assert.deepEqual([a.enviado_en, a.visto_en, a.visto_por, a.veces], [null, null, null, 3]);
  for (const mala of ['ia_tope:general:2026-13', 'ia_tope:x1:2026-11', 'ia_tope:e0:2026-11', 'ia_proveedor:', 'ia_proveedor:Anthropic']) {
    assert.equal(claveDeAvisoValida(mala), false, mala);
  }
  for (const buena of ['ia_tope:general:2026-11', 'ia_tope:e12:2026-01', 'ia_tope:p3:2027-12', 'ia_proveedor:anthropic', 'ia_costo_mayor', 'ia_llave']) {
    assert.equal(claveDeAvisoValida(buena), true, buena);
  }
  db.close();
});

// ---------- vigilarIA y disponibilidad ----------

test('vigilarIA: cierra reservas huérfanas y avisa (grave) si la llave de las claves no se puede leer; cuando vuelve, lo cierra', () => {
  const b = preparar();
  const { db, config } = b;
  const r = reservarUno(b).llamada;
  const ruta = rutaLlave(config);
  renameSync(ruta, `${ruta}.movida`);
  const v = vigilarIA(db, { config, ahora: T0 + 11 * MIN });
  assert.equal(v.barridas, 1);
  assert.equal(fila(db, r.id).estado, 'desconocida');
  assert.equal(v.llave, 'llave_no_existe');
  assert.equal(avisoDe(db, 'ia_llave').nivel, 'grave');
  renameSync(`${ruta}.movida`, ruta);
  assert.equal(vigilarIA(db, { config, ahora: T0 + 12 * MIN }).llave, 'bien');
  assert.equal(avisoDe(db, 'ia_llave'), undefined);
  // Una clave guardada con otra llave también es un problema de la llave.
  db.prepare("UPDATE secretos SET llave_huella = 'ffffffffffffffff'").run();
  assert.equal(vigilarIA(db, { config, ahora: T0 + 13 * MIN }).llave, 'clave_ilegible');
  db.close();
});

test('disponibilidad: solo lee, y su máximo es exactamente lo que reservar apartaría; el costo típico es de la propia cuenta', () => {
  const b = preparar({ tope: 1_000_000, planes: { prueba: 1_000_000 } });
  const { db, config } = b;
  const contar = () => ['ia_llamadas', 'ia_bloqueos', 'avisos'].map(t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n).join(',');
  for (const [entradaMax, salida] of [[1000, 100], [6900, 690], [24_000, 2000]]) {
    const antes = contar();
    const d = disponibilidad(db, { config, espacioId: b.espacioAdmin, proposito: 'interpretar', entradaMax, ahora: T0 });
    assert.equal(contar(), antes, 'disponibilidad no escribe');
    const r = reservarUno(b, { entradaMax });
    assert.equal(d.maximoMicro, r.llamada.reservadoMicro);
    assert.equal(d.proveedor, 'anthropic');
    assert.equal(d.modelo, 'claude-haiku-5-5');
    liquidar(db, { llamadaId: r.llamada.id, resultado: bien(usoDe(1000, salida)), ahora: T0 });
  }
  assert.equal(tipicoMicro(db, { proposito: 'interpretar', espacioId: b.espacioOtro }), PROPOSITOS.interpretar.tipicoMicro, 'la otra cuenta no ve los usos del administrador');
  assert.equal(tipicoMicro(db, { proposito: 'interpretar', espacioId: b.espacioAdmin }), costoMicro(precioDe('anthropic', 'claude-haiku-5-5'), usoDe(1000, 690)));
  const otra = disponibilidad(db, { config, espacioId: b.espacioOtro, proposito: 'interpretar', entradaMax: 6900, ahora: T0 });
  assert.equal(otra.topeMicro, 1_000_000, 'la otra cuenta ve su propio tope');
  assert.equal(otra.usadoMicro, 0);
  ponerConfig(db, { encendida: false });
  const apagada = disponibilidad(db, { config, espacioId: b.espacioAdmin, proposito: 'interpretar', entradaMax: 6900, ahora: T0 });
  assert.equal(apagada.disponible, false);
  assert.equal(apagada.motivo, 'ia_apagada');
  assert.equal(apagada.maximoMicro, null);
  db.close();
});

test('lo que queda en la base sale siempre de las listas del código (estados, motivos, propósitos, ámbitos)', () => {
  const b = preparar({ tope: 20_000, planes: { prueba: 10_000 } });
  const { db } = b;
  const r = reservarUno(b).llamada;
  liquidar(db, { llamadaId: r.id, resultado: { motivo: 'sin_credito', estado: 'fallida', http: 400 }, ahora: T0 });
  reservarUno(b);
  reservarUno(b, { espacioId: b.espacioOtro });
  ponerConfig(db, { encendida: false });
  reservarUno(b);
  for (const f of db.prepare('SELECT DISTINCT estado, resultado, proposito, proveedor FROM ia_llamadas').all()) {
    assert.ok(ESTADOS_LLAMADA.includes(f.estado), f.estado);
    if (f.resultado != null) assert.ok(MOTIVOS.includes(f.resultado), f.resultado);
    assert.ok(Object.hasOwn(PROPOSITOS, f.proposito));
    assert.ok(['anthropic', 'openai'].includes(f.proveedor));
  }
  for (const f of db.prepare('SELECT DISTINCT motivo, ambito, proposito, mes FROM ia_bloqueos').all()) {
    assert.ok(MOTIVOS.includes(f.motivo), f.motivo);
    assert.match(f.ambito, AMBITO);
    assert.ok(Object.hasOwn(PROPOSITOS, f.proposito));
    assert.match(f.mes, /^\d{4}-(0[1-9]|1[0-2])$/);
  }
  for (const a of db.prepare('SELECT clave FROM avisos').all()) assert.ok(claveDeAvisoValida(a.clave), a.clave);
  db.close();
});
