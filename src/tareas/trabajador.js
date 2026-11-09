// El TRABAJADOR: el programa aparte que hace las tareas de la fila, día y noche. Lo enciende SOLO el servidor
// web (src/tareas/supervisor.js), con menos prioridad que las pantallas (nice 10) y con poca memoria permitida.
// Si se traba o se cae, las pantallas siguen funcionando y el servidor web lo vuelve a encender.
//
// Lo que hace al arrancar:
//  1. Se marca como el primero que el sistema debe cortar si falta memoria (oom_score_adj 500), y baja su
//     prioridad si nadie lo hizo.
//  2. Comprueba que cada tipo de tarea tiene su manejador (si no, sale con 1).
//  3. Abre la base que YA existe (conectarBase: nunca la crea, ni la cambia, ni la copia). Si no puede, sale
//     con 4 y el servidor web lo dice en Administrador.
//  4. Anota su pid en su «corrida» y recupera las tareas de corridas anteriores que ya no viven.
//  5. Si el modo seguro está activo, sale sin hacer nada.
//  6. Programa los trabajos que se repiten, avisa «listo» y empieza: un latido cada 15 s y una vuelta cada 5 s.
//
// Cómo sale (código de salida): 0 normal · 1 se cayó · 3 otro tomó su lugar · 4 no pudo abrir la base ·
// 75 usaba demasiada memoria · 76 tenía pasos zombis. Al salir devuelve a la fila lo que tenía en las manos.
//
// Nunca importa node:http, src/app.js ni src/api (lo comprueba test/reglas.test.js): no abre puertos.
import { writeFileSync, realpathSync } from 'node:fs';
import { getPriority, setPriority } from 'node:os';
import { getHeapStatistics } from 'node:v8';
import { pathToFileURL } from 'node:url';
import { leerConfig } from '../nucleo/config.js';
import { conectarBase } from '../nucleo/db.js';
import { memoriaPropiaMb } from '../nucleo/salud.js';
import { marcarConErrores } from '../proyectos/proyectos.js';
import { TIPOS } from './tipos.js';
import { crearEscritor } from './escritor.js';
import { empezarCorrida, marcarListo, latir, terminarCorrida } from './corridas.js';
import { leerModoSeguro } from './modo-seguro.js';
import { MANEJADORES } from './manejadores.js';
import { crearEjecutor, TIEMPOS_TRABAJADOR } from './ejecutor.js';

export { TIEMPOS_TRABAJADOR };

export const SALIDA = Object.freeze({ normal: 0, caida: 1, reemplazada: 3, base_no_compatible: 4, memoria: 75, zombis: 76 });
// 5: la parte d (la IA opcional: claves cifradas y el libro de gastos). La versión 0.3.2 pide 4 y abre igual una base 5.
export const VERSION_DE_BASE_NECESARIA = 6; // fase 1, parte e: las tablas de las copias y los canales (migración 6)

// Por qué sale → cómo queda anotada la corrida y con qué código.
const SALIDAS = Object.freeze({
  normal: { como: 'normal', codigo: SALIDA.normal },
  senal: { como: 'senal', codigo: SALIDA.normal },
  sin_padre: { como: 'sin_padre', codigo: SALIDA.normal },
  modo_seguro: { como: 'modo_seguro', codigo: SALIDA.normal },
  memoria: { como: 'memoria', codigo: SALIDA.memoria },
  zombis: { como: 'zombis', codigo: SALIDA.zombis },
  reemplazada: { como: 'reemplazada', codigo: SALIDA.reemplazada },
  caida: { como: 'caida', codigo: SALIDA.caida },
});

const MB = 1024 * 1024;

// ¿Este archivo es el programa que se ejecutó (y no un import)? Funciona también cuando lo lanza `nice`.
export function esElPrincipal(url) {
  try {
    return Boolean(process.argv[1]) && url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

function bajarPrioridad() {
  // El sistema corta primero al trabajador, nunca a las pantallas, si falta memoria.
  try { writeFileSync('/proc/self/oom_score_adj', '500'); } catch { /* no se puede en este sistema: sigue igual */ }
  // Normalmente ya viene con nice 10 (lo lanza /usr/bin/nice). Si no existía nice, se baja aquí.
  try { if (getPriority() < 10) setPriority(10); } catch { /* sigue igual */ }
}

// Tiempos más cortos SOLO para las pruebas (OPORTIA_TEST=1).
function leerTiempos(env) {
  if (env.OPORTIA_TEST !== '1' || !env.OPORTIA_TAREAS_TIEMPOS) return {};
  try {
    const valor = JSON.parse(env.OPORTIA_TAREAS_TIEMPOS);
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  } catch {
    return {};
  }
}

// Manda un mensaje al servidor web. Devuelve una promesa que se cumple cuando salió (o a los 500 ms).
function enviar(mensaje) {
  return new Promise(listo => {
    const tope = setTimeout(listo, 500);
    try {
      if (!process.connected || typeof process.send !== 'function') throw new Error('sin canal');
      process.send(mensaje, () => { clearTimeout(tope); listo(); });
    } catch {
      clearTimeout(tope);
      listo();
    }
  });
}

export async function principal({ registro = TIPOS, manejadores = MANEJADORES, env = process.env } = {}) {
  // Si el servidor web murió, escribir en su tubería rota no puede tumbar al trabajador.
  process.stdout.on?.('error', () => {});
  process.stderr.on?.('error', () => {});
  bajarPrioridad();

  // Señales y mensajes se atienden desde el principio: si llegan mientras arranca, sale ordenado igual.
  let pararDeVerdad = null;
  let saliendo = null;
  let db = null;
  let corridaEmpezada = false;
  const corrida = env.OPORTIA_CORRIDA;
  async function salirAlArrancar(motivo) {
    if (saliendo) return;
    const salida = SALIDAS[motivo] ?? SALIDAS.caida;
    saliendo = salida.como;
    setTimeout(() => process.exit(salida.codigo), TIEMPOS_TRABAJADOR.salidaDuraMs); // sale sí o sí
    await enviar({ tipo: 'saliendo', motivo: salida.como });
    if (db && corridaEmpezada) {
      try { terminarCorrida(db, { corrida, como: salida.como, codigo: salida.codigo }); } catch { /* la anota el servidor web */ }
    }
    try { db?.close(); } catch { /* ya cerrada */ }
    process.exit(salida.codigo);
  }
  const pedirParada = motivo => (pararDeVerdad ? pararDeVerdad(motivo) : salirAlArrancar(motivo));
  let ejecutor = null;
  process.on('SIGTERM', () => { pedirParada('senal'); });
  process.on('SIGINT', () => { pedirParada('senal'); });
  process.on('disconnect', () => { pedirParada('sin_padre'); });
  process.on('message', mensaje => {
    if (!mensaje || typeof mensaje !== 'object') return;
    if (mensaje.tipo === 'despertar') ejecutor?.ciclo();
    else if (mensaje.tipo === 'parar') pedirParada(mensaje.motivo === 'modo_seguro' ? 'modo_seguro' : 'normal');
  });

  // Solo lo enciende el servidor web, con su canal. Si el canal ya se cerró mientras cargaba (el servidor web
  // murió en ese rato), el aviso 'disconnect' ya pasó y no vuelve: sale ahora mismo.
  if (typeof process.send !== 'function') {
    console.error('Al trabajador solo lo enciende el servidor web (no tiene canal con él).');
    process.exit(SALIDA.caida);
  }
  if (!process.connected) return salirAlArrancar('sin_padre');

  const faltan = Object.keys(registro).filter(tipo => typeof manejadores?.[tipo]?.paso !== 'function');
  if (faltan.length) {
    console.error(`Faltan los manejadores de: ${faltan.join(', ')}`);
    process.exit(SALIDA.caida);
  }
  if (!corrida) {
    console.error('Al trabajador solo lo enciende el servidor web (falta OPORTIA_CORRIDA).');
    process.exit(SALIDA.caida);
  }
  const T = { ...TIEMPOS_TRABAJADOR, ...leerTiempos(env) };

  let config;
  try {
    config = leerConfig(env);
    db = conectarBase(config, { versionMinima: VERSION_DE_BASE_NECESARIA });
  } catch (error) {
    console.error(`El trabajador no pudo abrir la base (${error.codigo ?? 'error'}): ${error.message}`);
    process.exit(SALIDA.base_no_compatible);
  }

  const escritor = crearEscritor(db);
  let datos;
  try {
    await escritor.escribir(() => empezarCorrida(db, { corrida, pid: process.pid, alFallar: marcarConErrores, registro }));
    corridaEmpezada = true;
    datos = db.prepare('SELECT version, codigo FROM trabajador_corridas WHERE corrida = ?').get(corrida);
  } catch (error) {
    if (saliendo) return; // llegó una señal mientras empezaba: ya está saliendo ordenado
    console.error('El trabajador no pudo empezar su corrida:', error.message);
    try { db.close(); } catch { /* ya cerrada */ }
    process.exit(error.codigo === 'corrida_no_valida' ? SALIDA.reemplazada : SALIDA.caida);
  }
  const version = datos?.version ?? '';
  const codigo = datos?.codigo ?? '';

  // Falla rápido: un error que nadie atendió deja anotada la caída y sale (el servidor web lo vuelve a encender
  // y recupera sus tareas).
  let cayendo = false;
  const caer = error => {
    if (cayendo) return;
    cayendo = true;
    try { console.error('Error inesperado del trabajador:', error); } catch { /* sin salida */ }
    try { terminarCorrida(db, { corrida, como: 'caida', codigo: SALIDA.caida, detalle: String(error?.message ?? error) }); } catch { /* la base no deja */ }
    process.exit(SALIDA.caida);
  };
  process.on('uncaughtException', caer);
  process.on('unhandledRejection', caer);

  if (saliendo) return;
  if (leerModoSeguro(db).activo) {
    console.log('trabajador en pausa: el modo seguro está activo');
    return salirAlArrancar('modo_seguro');
  }

  let temporizadores = [];
  ejecutor = crearEjecutor({
    db, config, corrida, escritor, registro, manejadores, tiempos: T, alFallar: marcarConErrores, version, codigo,
    pedirSalida: motivo => { parar(motivo); },
  });
  pararDeVerdad = parar;

  // Sale ordenado: avisa primero, deja de tomar, espera un poco a lo que está en marcha, devuelve sus tareas,
  // anota cómo terminó y cierra la base. Sale sí o sí a los 5 s.
  async function parar(motivo) {
    if (saliendo) return;
    const salida = SALIDAS[motivo] ?? SALIDAS.caida;
    saliendo = salida.como;
    for (const t of temporizadores) clearInterval(t);
    temporizadores = [];
    setTimeout(() => process.exit(salida.codigo), T.salidaDuraMs);
    await enviar({ tipo: 'saliendo', motivo: salida.como });
    // Si otro tomó su lugar, no escribe nada más: sus tareas ya son de otro.
    const devolver = motivo !== 'reemplazada';
    try {
      await ejecutor.parar({ esperaMs: devolver ? T.graciaParadaMs : 0, conFallo: motivo === 'memoria', motivo: motivo === 'memoria' ? 'memoria' : 'apagado', devolver });
    } catch (error) {
      console.error('No se pudieron devolver las tareas al salir:', error.message);
    }
    if (devolver) {
      const memoriaMb = memoriaPropiaMb(process.pid) ?? Math.round(process.memoryUsage.rss() / MB);
      try { await escritor.escribir(() => terminarCorrida(db, { corrida, como: salida.como, codigo: salida.codigo, memoriaMb })); } catch { /* la anota el servidor web */ }
    }
    try { db.close(); } catch { /* ya cerrada */ }
    process.exit(salida.codigo);
  }

  async function latido() {
    if (saliendo) return;
    const memoriaMb = memoriaPropiaMb(process.pid) ?? Math.round(process.memoryUsage.rss() / MB);
    let vivo;
    try {
      vivo = await escritor.escribir(() => latir(db, { corrida, memoriaMb, arriendoMs: T.arriendoMs }));
    } catch (error) {
      console.error('No se pudo anotar el latido (sigue):', error.message);
      return;
    }
    if (!vivo) return parar('reemplazada');
    const heap = getHeapStatistics();
    const { enCurso, freno } = ejecutor.estado();
    await enviar({ tipo: 'latido', memoriaMb, heapPct: Math.round((heap.used_heap_size / heap.heap_size_limit) * 100), enCurso, freno });
  }

  try {
    await ejecutor.programar();
    await escritor.escribir(() => marcarListo(db, corrida));
  } catch (error) {
    console.error('El trabajador no pudo quedar listo:', error.message);
    return parar('caida');
  }
  if (saliendo) return;
  await enviar({ tipo: 'listo', corrida, pid: process.pid, version });
  console.log(`trabajador ${version} listo (pid ${process.pid})`);
  if (saliendo) return;
  temporizadores.push(setInterval(() => { latido(); }, T.latidoMs));
  temporizadores.push(setInterval(() => { ejecutor.ciclo(); }, T.cicloMs));
  ejecutor.ciclo();
}

if (esElPrincipal(import.meta.url)) {
  principal().catch(error => {
    console.error('El trabajador no pudo arrancar:', error);
    process.exit(SALIDA.caida);
  });
}
