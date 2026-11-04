// El «ejecutor»: lo que hace el trabajador en cada vuelta (cada 5 s, o enseguida cuando lo despiertan).
//  1. Si se activó el modo seguro, pide salir.
//  2. Si el propio trabajador usa demasiada memoria, pide salir ANTES de que Node lo tumbe (sale con 75 y el
//     servidor web lo vuelve a encender).
//  3. Cada 60 s recupera tareas que quedaron abandonadas; cada 30 s programa los trabajos que se repiten.
//  4. Toma tareas mientras haya cupo (1 normal y 1 grande a la vez) y corre cada paso SIN esperarlo.
// Cada paso tiene su tiempo máximo: si se pasa, se corta (AbortSignal) y cuenta como 'tiempo_agotado'. Un paso
// que ni así termina es un «zombi»; con 2 zombis el trabajador pide salir y vuelve a empezar limpio.
// Si falta memoria o disco en el servidor, solo corre lo que vigila (para que el aviso pueda salir).
//
// Corre dentro del trabajador (src/tareas/trabajador.js). En las pruebas también corre dentro del mismo
// proceso, con tipos y tiempos de prueba.
import { performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { dirname } from 'node:path';
import { TIPOS, CUPOS, PROGRAMAS_DEL_SISTEMA, ErrorTarea, definicion, tiposEjecutables } from './tipos.js';
import {
  elegir, marcarTomada, guardarPaso, normalizarSalida, salidaDeError, escritorDeTarea, devolverLasMias,
  recuperarAbandonadas, recuperarVencidas, programar, programasDeProyectos, tiposPermitidos,
} from './cola.js';
import { marcarPerdidas, contarPaso } from './corridas.js';
import { ranura } from './tiempo.js';
import { leerModoSeguro, leerFrenos, frenarTipo, soltarFreno, crearCuentaDeFallos } from './modo-seguro.js';
import { MANEJADORES } from './manejadores.js';
import { marcarConErrores } from '../proyectos/proyectos.js';
import { memoriaDisponibleMb as memoriaDelServidor, discoLibreMb as discoDelServidor } from '../nucleo/salud.js';

export const TIEMPOS_TRABAJADOR = Object.freeze({
  cicloMs: 5000, // una vuelta cada 5 s (o antes, si lo despiertan)
  latidoMs: 15000, // cada 15 s avisa que sigue vivo (y alarga el arriendo de sus tareas)
  arriendoMs: 120000, // una tarea tomada es suya por 2 min; cada latido lo renueva
  recuperarCadaMs: 60000,
  programarCadaMs: 30000,
  graciaParadaMs: 3000, // al apagarse, espera hasta 3 s a que terminen los pasos en marcha
  graciaAbortoMs: 5000, // un paso cortado que no termina en 5 s es un zombi
  salidaDuraMs: 5000, // al apagarse, sale sí o sí a los 5 s
  maxZombis: 2,
  heapMaxFraccion: 0.85,
  rssMaxMb: 120,
  memoriaMinimaMb: Object.freeze({ normal: 80, grande: 100 }), // memoria libre del servidor para tomar trabajo
  discoMinimoMb: 300,
  discoCadaMs: 60000, // el disco libre se mide como mucho una vez por minuto
});

export const FRENOS_DE_RECURSOS = Object.freeze(['poca_memoria', 'poco_disco']);

const MB = 1024 * 1024;
const iso = ms => new Date(ms).toISOString();
const dormirDeVerdad = ms => new Promise(listo => setTimeout(listo, ms));

// Se usa para cortar los pasos cuando el trabajador se apaga: un paso cortado así NO cuenta como fallo
// (la tarea vuelve a la fila tal cual, con devolverLasMias).
class Parada extends Error {
  constructor() {
    super('apagado');
    this.name = 'Parada';
  }
}

function memoriaPropia() {
  const heap = getHeapStatistics();
  return { heapUsado: heap.used_heap_size, heapLimite: heap.heap_size_limit, rssMb: process.memoryUsage.rss() / MB };
}

function conTope(promesa, ms) {
  let temporizador;
  return Promise.race([promesa, new Promise(listo => { temporizador = setTimeout(listo, Math.max(0, ms)); })])
    .finally(() => clearTimeout(temporizador));
}

export function crearEjecutor({
  db, config = {}, corrida, escritor, registro = TIPOS, manejadores = MANEJADORES, cupos = CUPOS, tiempos = {},
  alFallar = marcarConErrores, memoriaDisponibleMb = memoriaDelServidor, discoLibreMb = null, medirMemoria = memoriaPropia,
  pedirSalida = () => {}, log = console, programas = null, version = null, codigo = null,
  reloj = Date.now, azar = Math.random, dormir = dormirDeVerdad,
}) {
  if (!db || !corrida || !escritor) throw new Error('crearEjecutor necesita db, corrida y escritor');
  const T = { ...TIEMPOS_TRABAJADOR, ...tiempos };
  const carpetaDatos = config.carpetaDatos ?? (config.archivoBase ? dirname(config.archivoBase) : null);
  const medirDisco = discoLibreMb ?? (() => discoDelServidor(carpetaDatos));
  // Solo se toman tareas de tipos que este código sabe hacer de verdad (con su manejador).
  const conManejador = new Set(tiposEjecutables(registro).filter(t => typeof manejadores?.[t]?.paso === 'function'));
  const cuenta = crearCuentaDeFallos({ registro });
  const enCurso = new Map();
  const recordadas = new Map();
  const saltos = new Map();
  let ultimaRecuperacion = reloj(); // al arrancar ya recuperó (empezarCorrida)
  let ultimaProgramacion = -Infinity;
  let disco = { valor: null, en: -Infinity };
  let freno = null;
  let zombis = 0;
  let parando = false;
  let pedido = null;
  let enMarcha = null;
  let otraVez = false;

  const detenido = () => parando || pedido != null;

  function pedir(motivo) {
    if (pedido != null || parando) return;
    pedido = motivo;
    try { pedirSalida(motivo); } catch (error) { log.error?.('No se pudo pedir la salida del trabajador:', error); }
  }

  function discoLibre() {
    const ahora = reloj();
    if (ahora - disco.en >= T.discoCadaMs) {
      let valor = null;
      try { valor = medirDisco(); } catch { valor = null; }
      disco = { valor, en: ahora };
    }
    return disco.valor;
  }

  // Freno por recursos para un cupo: 'poca_memoria', 'poco_disco' o null. Una medida que no se pudo leer
  // (null) nunca frena.
  function frenoPara(cupo, memoria) {
    const minimo = T.memoriaMinimaMb?.[cupo] ?? T.memoriaMinimaMb?.normal ?? 0;
    if (memoria != null && memoria < minimo) return 'poca_memoria';
    const libre = discoLibre();
    if (libre != null && libre < T.discoMinimoMb) return 'poco_disco';
    return null;
  }

  const ocupadosEn = cupo => [...enCurso.values()].filter(e => e.cupo === cupo).length;
  const carrilesOcupados = () => [...new Set([...enCurso.values()].map(e => e.carrilProyecto))];

  async function recuperar() {
    ultimaRecuperacion = reloj();
    // Solo se toma el permiso de escribir si hay algo que mirar.
    const hayAlgo = db.prepare('SELECT 1 FROM trabajador_corridas WHERE termino_en IS NULL AND corrida <> ? LIMIT 1').get(corrida)
      || db.prepare("SELECT 1 FROM tareas WHERE estado = 'en_curso' AND dueno IS NOT ? LIMIT 1").get(corrida);
    if (!hayAlgo) return null;
    return escritor.escribir(() => {
      const ahora = reloj();
      const perdidas = marcarPerdidas(db, { yo: corrida, ahora });
      const abandonadas = recuperarAbandonadas(db, { yo: corrida, ahora, azar, alFallar, registro });
      const vencidas = recuperarVencidas(db, { yo: corrida, ahora, azar, alFallar, registro });
      return { perdidas, abandonadas, vencidas };
    });
  }

  async function programarAhora() {
    const ahora = reloj();
    ultimaProgramacion = ahora;
    const lista = programas ?? [...PROGRAMAS_DEL_SISTEMA, ...programasDeProyectos(db, { registro })];
    const tipos = [...conManejador];
    // Si todas las ranuras de ahora ya están hechas, no se toca la base.
    const pendientes = lista.filter(plan => {
      if (!conManejador.has(plan.tipo)) return false;
      const r = ranura(plan, ahora);
      return r && recordadas.get(plan.programa) !== r.clave;
    });
    if (!pendientes.length) return { creadas: 0, saltadas: 0 };
    return escritor.escribir(() => programar(db, { programas: pendientes, tipos, ahora, recordadas, saltos, registro }));
  }

  // Un paso de una tarea, de principio a fin: correr el manejador con su tiempo máximo y guardar lo que pasó.
  async function correrPaso(tarea, entrada) {
    const def = definicion(tarea.tipo, registro);
    const manejador = manejadores?.[tarea.tipo];
    const limite = Math.max(1, Number(def?.tiempoPorPasoMs) || 60_000);
    const { controlador } = entrada;
    const inicio = performance.now();
    const ctx = Object.freeze({
      tarea: Object.freeze({
        id: tarea.id, tipo: tarea.tipo, datos: tarea.datos, punto: tarea.punto, pasos: tarea.pasos,
        espacioId: tarea.espacioId, proyectoId: tarea.proyectoId, intento: tarea.intento,
      }),
      senal: controlador.signal,
      db,
      config,
      version,
      codigo,
      escribir: escritorDeTarea(escritor, db, { tarea, corrida }),
      quedaMs: () => Math.max(0, limite - (performance.now() - inicio)),
      ceder: () => new Promise(listo => setImmediate(listo)),
    });

    const temporizador = setTimeout(() => {
      controlador.abort(new DOMException(`El paso pasó de ${limite} ms`, 'TimeoutError'));
    }, limite);
    const abortado = new Promise((_, rechazar) => {
      const alAbortar = () => rechazar(controlador.signal.reason);
      if (controlador.signal.aborted) alAbortar();
      else controlador.signal.addEventListener('abort', alAbortar, { once: true });
    });
    abortado.catch(() => {});
    let asentado = false;
    const paso = typeof manejador?.paso === 'function'
      ? (async () => manejador.paso(ctx))()
      : Promise.reject(new ErrorTarea('sin_manejador', { reintentable: false }));
    paso.then(() => { asentado = true; }, () => { asentado = true; });

    let salida;
    try {
      salida = normalizarSalida(await Promise.race([paso, abortado]));
    } catch (error) {
      if (error instanceof Parada) return; // se apaga: devolverLasMias la deja en la fila sin fallo
      salida = salidaDeError(error);
    } finally {
      clearTimeout(temporizador);
    }

    // Cortado por tiempo y el manejador sigue sin terminar: si en 5 s tampoco termina, es un zombi.
    if (controlador.signal.aborted && !asentado) {
      const vigia = setTimeout(() => {
        if (asentado || parando) return;
        zombis += 1;
        log.warn?.(`Paso zombi de ${tarea.tipo} (tarea ${tarea.id}): no respeta la señal de parar (${zombis} de ${T.maxZombis})`);
        if (zombis >= T.maxZombis) pedir('zombis');
      }, T.graciaAbortoMs);
      vigia.unref?.();
    }

    const duracionMs = performance.now() - inicio;
    const esEspera = salida.tipo === 'error' && salida.error?.noEsFallo === true;
    const conError = salida.tipo === 'error' && !esEspera;
    const guardar = () => escritor.escribir(() => {
      const r = guardarPaso(db, { tarea, corrida, salida, duracionMs, ahora: reloj(), azar, alFallar, registro });
      if (r.aceptado) contarPaso(db, corrida, conError);
      return r;
    });
    let r;
    try {
      r = await guardar();
    } catch (error) {
      log.error?.(`No se pudo guardar el paso de la tarea ${tarea.id} (se prueba otra vez):`, error);
      await dormir(1000);
      try {
        r = await guardar();
      } catch (otro) {
        // La base no deja guardar: es mejor salir y que el servidor web recupere la tarea.
        log.error?.(`Tampoco se pudo la segunda vez (tarea ${tarea.id}):`, otro);
        pedir('caida');
        return;
      }
    }
    if (!r?.aceptado) {
      log.warn?.(`El paso de la tarea ${tarea.id} no se guardó: ${r?.motivo ?? 'ya_no_es_mia'}`);
      return;
    }
    if (esEspera) return;
    // Freno por tipo: 6 pasos fallidos seguidos (de 2 tareas o más) lo frenan un rato; un paso bueno lo suelta.
    try {
      const { frenar, soltar } = cuenta.anotar(tarea.tipo, tarea.id, conError);
      if (frenar) await escritor.escribir(() => frenarTipo(db, { tipo: tarea.tipo, ahora: reloj() }));
      else if (soltar) await escritor.escribir(() => soltarFreno(db, { tipo: tarea.tipo, ahora: reloj() }));
    } catch (error) {
      log.error?.('No se pudo anotar el freno del tipo:', error);
    }
  }

  function lanzar(tarea, cupo) {
    const entrada = {
      id: tarea.id, tipo: tarea.tipo, cupo, desde: iso(reloj()), carrilProyecto: tarea.carrilProyecto, controlador: new AbortController(),
    };
    enCurso.set(tarea.id, entrada);
    entrada.promesa = correrPaso(tarea, entrada)
      .catch(error => log.error?.(`Error inesperado en el paso de la tarea ${tarea.id}:`, error))
      .finally(() => {
        enCurso.delete(tarea.id);
        if (!detenido()) setImmediate(() => { ciclo(); });
      });
  }

  async function tomar() {
    const frenos = leerFrenos(db, reloj());
    let memoria = null;
    try { memoria = memoriaDisponibleMb(); } catch { memoria = null; }
    freno = frenoPara('normal', memoria);
    for (const cupo of ['grande', 'normal']) {
      const frenoCupo = frenoPara(cupo, memoria);
      const tipos = tiposPermitidos({ registro, frenos, frenoRecursos: frenoCupo }).filter(t => conManejador.has(t));
      if (!tipos.length) continue;
      let perdidas = 0;
      while (!detenido() && ocupadosEn(cupo) < (cupos[cupo] ?? 0) && perdidas < 3) {
        const candidata = elegir(db, { cupo, tipos, ocupados: carrilesOcupados(), ahora: reloj() });
        if (!candidata) break;
        const tarea = await escritor.escribir(() => marcarTomada(db, { candidata, corrida, arriendoMs: T.arriendoMs, ahora: reloj() }));
        if (!tarea) { perdidas += 1; continue; } // otro la tomó primero: se elige otra vez
        perdidas = 0;
        if (parando) break; // se apaga: devolverLasMias la deja en la fila
        lanzar(tarea, cupo);
      }
    }
  }

  async function vuelta() {
    if (leerModoSeguro(db).activo) return pedir('modo_seguro');
    const memoria = medirMemoria();
    if (memoria.heapUsado > T.heapMaxFraccion * memoria.heapLimite || memoria.rssMb > T.rssMaxMb) {
      log.warn?.(`El trabajador usa mucha memoria (${Math.round(memoria.rssMb)} MB): sale para volver a empezar limpio`);
      return pedir('memoria');
    }
    if (reloj() - ultimaRecuperacion >= T.recuperarCadaMs) await recuperar();
    if (detenido()) return;
    if (reloj() - ultimaProgramacion >= T.programarCadaMs) await programarAhora();
    if (detenido()) return;
    await tomar();
  }

  // Una sola vuelta a la vez: si la llaman mientras corre otra, se da una vuelta más al terminar.
  function ciclo() {
    if (detenido()) return Promise.resolve();
    if (enMarcha) {
      otraVez = true;
      return enMarcha;
    }
    enMarcha = (async () => {
      try {
        do {
          otraVez = false;
          await vuelta();
        } while (otraVez && !detenido());
      } catch (error) {
        log.error?.('Error en una vuelta del trabajador (sigue):', error);
      } finally {
        enMarcha = null;
      }
    })();
    return enMarcha;
  }

  // Al apagarse: deja de tomar, espera un poco a los pasos en marcha, corta los demás y devuelve sus tareas
  // a la fila (sin fallo, salvo conFallo: salió por falta de memoria y la tarea pudo ser la culpable).
  async function parar({ esperaMs = T.graciaParadaMs, conFallo = false, motivo = 'apagado', devolver = true } = {}) {
    parando = true;
    if (enMarcha) await conTope(enMarcha, Math.max(esperaMs, 1000));
    const pasos = () => [...enCurso.values()].map(e => e.promesa);
    if (enCurso.size && esperaMs > 0) await conTope(Promise.allSettled(pasos()), esperaMs);
    for (const e of enCurso.values()) e.controlador.abort(new Parada());
    if (enCurso.size) await conTope(Promise.allSettled(pasos()), 1000);
    if (!devolver) return { devueltas: [] };
    const devueltas = await escritor.escribir(() => devolverLasMias(db, { corrida, conFallo, motivo, ahora: reloj(), azar, alFallar, registro }));
    return { devueltas };
  }

  function estado() {
    return {
      enCurso: [...enCurso.values()].map(e => ({ id: e.id, tipo: e.tipo, cupo: e.cupo, desde: e.desde })),
      freno,
      zombis,
    };
  }

  return { ciclo, programar: programarAhora, recuperar, parar, estado };
}
