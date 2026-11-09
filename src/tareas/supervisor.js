// El SUPERVISOR: vive en el servidor web y cuida al trabajador (el proceso aparte que hace las tareas).
// Es el ÚNICO archivo que puede encender otros procesos (lo comprueba test/reglas.test.js).
//  - Enciende UN trabajador, con /usr/bin/nice -n 10 (todos sus hilos con menos prioridad que las pantallas),
//    con poca memoria permitida y sin archivos «core» (prlimit --core=0: si se cae por falta de memoria, no deja
//    en el disco una copia de su memoria, que podría tener una clave de IA descifrada). Lo anota en
//    trabajador_corridas ANTES de encenderlo.
//  - Lo vigila: si no queda listo en 30 s, o deja de latir 90 s, lo corta. Cuando sale, anota cómo terminó,
//    devuelve a la fila las tareas que tenía en las manos (ninguna queda «en curso» de mentira) y lo vuelve a
//    encender, esperando cada vez un poco más si se sigue cayendo.
//  - Modo seguro: si se cae 5 veces en 15 minutos con el mismo código (o no puede abrir la base) lo deja apagado
//    y abre un aviso grave. Lee el modo seguro cada 30 s (por si se cambió desde la consola).
//  - Puerta de arranque: los primeros 90 s después de encender el servicio, /api/setup responde «arrancando»
//    hasta que el trabajador avisa «listo» (o falla 3 veces). Así el actualizador vuelve solo a la versión
//    anterior si una versión nueva trae un trabajador que no arranca. Se vuelve atrás el CÓDIGO, nunca los datos.
//  - Toma una muestra de salud por hora (también en modo seguro) y abre o resuelve sus avisos.
// Nada de esto hace esperar a las pantallas: todo es corto y en segundo plano.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { ANORMALES, nuevaCorrida, terminarCorrida, salidasAnormales, reiniciosDesde, marcarPerdidas } from './corridas.js';
import { recuperarAbandonadas, resumenFila } from './cola.js';
import { leerModoSeguro, ponerModoSeguro, revisarAlArrancar } from './modo-seguro.js';
import { sincronizarAvisos } from '../avisos/avisos.js';
import { medirSalud, evaluarSalud, guardarMuestra } from '../nucleo/salud.js';
import { enTransaccion } from '../nucleo/db.js';
import { marcarConErrores } from '../proyectos/proyectos.js';

export const RUTA_TRABAJADOR = fileURLToPath(new URL('./trabajador.js', import.meta.url));
// --expose-gc (fase 1, parte e): la copia de cada noche llama a gc() después de cada parte que sube a Telegram (medido:
// sin eso la memoria del trabajador crece 50-70 MB en 12 partes; con eso, 20-30 MB).
export const BANDERAS_TRABAJADOR = Object.freeze(['--no-warnings', '--expose-gc', '--max-old-space-size=64', '--max-semi-space-size=2']);
export const TIEMPOS_SUPERVISOR = Object.freeze({
  listoMaxMs: 30000, // si no avisa «listo» en 30 s, se corta
  vigiaMs: 90000, // si no late en 90 s, se corta (está colgado)
  revisarCadaMs: 10000,
  modoSeguroCadaMs: 30000,
  ventanaArranqueMs: 90000,
  fallosArranque: 3,
  reinicioBaseMs: 1000, // 1 s, 2 s, 4 s… hasta 5 min
  reinicioMaxMs: 300000,
  vidaEstableMs: 600000, // si vivió más de 10 min, la cuenta de reinicios vuelve a cero
  ventanaCaidasMs: 900000,
  caidasParaModoSeguro: 5,
  paradaMs: 5000, // al apagar: si en 5 s no salió, se corta con SIGKILL
  senalTrasMs: 1000, // si en 1 s no contestó al pedido de salir (por ejemplo, todavía cargaba), recibe SIGTERM
  reintentoSenalMs: 2000,
  ventanaZombisMs: 600000, // dos salidas por zombis en 10 min: la segunda ya espera cada vez más
  saludCadaMs: 60000,
});
export const FASES_TRABAJADOR = Object.freeze(['arrancando', 'esperando', 'trabajando', 'reiniciando', 'sin_respuesta', 'modo_seguro', 'parando']);
export const ESTADOS_ARRANQUE = Object.freeze(['arrancando', 'listo', 'fallido', 'no_aplica']);

// El primer `nice` y el primer `prlimit` que existan (con ruta completa: funciona aunque el entorno venga vacío).
// Los dos «se convierten» en el programa que encienden (exec), así el número del proceso sigue siendo el del
// trabajador.
const RESOLUCION_RETRASO_MS = 20;
const NICE = ['/usr/bin/nice', '/bin/nice'].find(ruta => existsSync(ruta)) ?? null;
const PRLIMIT = ['/usr/bin/prlimit', '/bin/prlimit'].find(ruta => existsSync(ruta)) ?? null;
const iso = ms => new Date(ms).toISOString();
// Salidas que NO cuentan como fallo al arrancar (no son culpa del código nuevo).
const NO_SON_FALLO = new Set(['normal', 'senal', 'sin_padre', 'modo_seguro']);

export function lanzarTrabajador({ ruta = RUTA_TRABAJADOR, env }) {
  const argumentos = [...BANDERAS_TRABAJADOR, ruta];
  // El hijo nunca va aparte (detached): queda en el mismo grupo de procesos y en el mismo servicio de systemd.
  const opciones = { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json', env };
  const orden = [...(NICE ? [NICE, '-n', '10'] : []), process.execPath, ...argumentos];
  // Sin archivos «core»: el límite 0 vale para el trabajador y para todo lo que él encienda.
  const completa = PRLIMIT ? [PRLIMIT, '--core=0', '--', ...orden] : orden;
  return spawn(completa[0], completa.slice(1), opciones);
}

// Ronda 2 de revisión: el servidor web también tiene en memoria, por un momento, una clave descifrada (la prueba gratis
// de Claves y «Probar y reanudar»), así que tampoco puede dejar un archivo «core» si se cae: se baja a sí mismo ese
// límite a 0 al arrancar, con el mismo prlimit (bajar el propio límite no necesita root, ni depende del archivo del
// servicio, que el actualizador no vuelve a instalar). Devuelve true si quedó en 0; nunca lanza.
export function quitarArchivosCore({ pid = process.pid } = {}) {
  if (!PRLIMIT || !Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    execFileSync(PRLIMIT, ['--pid', String(pid), '--core=0'], { stdio: 'ignore', timeout: 5000, env: {} });
    return true;
  } catch {
    return false;
  }
}

// Pasa la salida del trabajador al registro del servicio, línea por línea, con «[tareas]» delante.
function reemitir(flujo, escribir) {
  if (!flujo) return;
  let resto = '';
  flujo.setEncoding('utf8');
  flujo.on('data', trozo => {
    resto += trozo;
    const lineas = resto.split('\n');
    resto = lineas.pop();
    for (const linea of lineas) escribir(`[tareas] ${linea}`);
    if (resto.length > 8000) {
      escribir(`[tareas] ${resto}`);
      resto = '';
    }
  });
  flujo.on('end', () => { if (resto) escribir(`[tareas] ${resto}`); });
  flujo.on('error', () => {});
}

export function crearSupervisor({
  db, config = {}, version = '', codigo = '', ruta = RUTA_TRABAJADOR, lanzar = lanzarTrabajador, tiempos = {},
  tiemposTrabajador = null, entorno = {}, registro = console, reloj = Date.now, monotono = null,
}) {
  if (!db) throw new Error('crearSupervisor necesita la base');
  const T = { ...TIEMPOS_SUPERVISOR, ...tiempos };
  // Dos relojes: «reloj» da la fecha y hora (lo que se guarda en la base y se muestra); «mono» solo mide cuánto
  // tiempo pasó, y nunca salta aunque el servidor corrija su hora (NTP). Si el reloj del sistema salta 2 minutos
  // hacia adelante, eso no corta a un trabajador sano por «colgado», ni deja /api/setup en 503 si salta atrás.
  // Las pruebas que pasan su propio «reloj» lo usan también para medir.
  const mono = monotono ?? (reloj === Date.now ? () => performance.now() : reloj);
  const log = (...partes) => { try { registro.log?.(...partes); } catch { /* sin registro */ } };
  const error = (...partes) => { try { registro.error?.(...partes); } catch { /* sin registro */ } };
  const retraso = monitorEventLoopDelay({ resolution: RESOLUCION_RETRASO_MS });

  let fase = 'arrancando';
  let hijo = null;
  const creadoEn = mono();
  let iniciadoEn = null;
  let parando = false;
  let paradaEnMarcha = null;
  let temporizadorReinicio = null;
  let proximoIntento = null;
  let reinicios = 0;
  let ultimaZombis = null;
  let salidasEnVentana = 0;
  let ultimaSalida = null;
  let ultimoModoSeguro = null;
  let ultimaHoraMuestra = null;
  const temporizadores = [];
  // La puerta de arranque (ver estadoArranque).
  const puerta = { aplica: true, listo: false, fallos: 0 };

  // La ventana se cuenta desde iniciar(); si por un error nunca se llamó, desde que se creó el supervisor: así
  // /api/setup nunca queda en 503 para siempre.
  function estadoArranque() {
    if (!puerta.aplica) return 'no_aplica';
    if (puerta.listo) return 'listo';
    if (mono() - (iniciadoEn ?? creadoEn) >= T.ventanaArranqueMs) return 'no_aplica';
    if (puerta.fallos >= T.fallosArranque) return 'fallido';
    return 'arrancando';
  }
  const enVentana = () => {
    const e = estadoArranque();
    return e === 'arrancando' || e === 'fallido';
  };

  function cancelarReinicio() {
    if (temporizadorReinicio) clearTimeout(temporizadorReinicio);
    temporizadorReinicio = null;
    proximoIntento = null;
  }

  function enviarA(h, mensaje) {
    try {
      if (!h?.proceso?.connected) return false;
      h.proceso.send(mensaje);
      return true;
    } catch {
      return false;
    }
  }

  // Le pide al trabajador que salga ordenado, por el canal (así anota «normal» o «modo_seguro»). Si no se
  // puede, o si en 1 s no contestó «saliendo» (por ejemplo, porque todavía estaba cargando y el mensaje se
  // perdió), recibe SIGTERM: sale igual de ordenado, anotado como «senal».
  function pedirQueSalga(h, motivo) {
    if (!h || h.terminado || h.pidioSalir) return;
    h.pidioSalir = motivo;
    fase = 'parando';
    const senal = () => { if (!h.terminado && !h.saliendo) { try { h.proceso.kill('SIGTERM'); } catch { /* ya salió */ } } };
    if (!enviarA(h, { tipo: 'parar', motivo })) return senal();
    h.temporizadorSenal = setTimeout(senal, T.senalTrasMs);
    h.temporizadorSenal.unref?.();
  }

  function matar(h, como) {
    if (!h || h.terminado || h.matadoPor) return;
    h.matadoPor = como;
    fase = 'sin_respuesta';
    error(`El trabajador (pid ${h.pid}) ${como === 'colgado' ? 'dejó de responder' : 'no arrancó a tiempo'}: se corta`);
    try { h.proceso.kill('SIGKILL'); } catch { /* ya salió */ }
  }

  function activarModoSeguro(motivo) {
    try {
      ponerModoSeguro(db, { activo: true, origen: 'automatico', motivo, codigo, version });
      ultimoModoSeguro = true;
      error(`Modo seguro activado (${motivo}): el trabajo automático queda en pausa; las pantallas siguen funcionando`);
      return true;
    } catch (e) {
      error('No se pudo activar el modo seguro:', e);
      return false;
    }
  }

  // 5 salidas anormales del MISMO código en 15 min → modo seguro (solo fuera de la ventana de arranque, para
  // no tapar el «arrancando» que hace volver a la versión anterior).
  // Si alguien quitó el modo seguro hace poco, solo cuentan las caídas de DESPUÉS: el trabajador tiene otras 5
  // oportunidades (si no, la primera caída lo volvería a poner en modo seguro enseguida).
  function revisarInestable() {
    if (enVentana() || parando) return false;
    let n = 0;
    try {
      const quitadoEn = Date.parse(leerModoSeguro(db).ultimo?.hasta ?? '');
      const desde = Math.max(reloj() - T.ventanaCaidasMs, Number.isFinite(quitadoEn) ? quitadoEn : -Infinity);
      n = salidasAnormales(db, { codigo, desde });
    } catch { return false; }
    if (n < T.caidasParaModoSeguro) return false;
    let yaActivo = false;
    try { yaActivo = leerModoSeguro(db).activo; } catch { /* se intenta igual */ }
    return yaActivo || activarModoSeguro('trabajador_inestable');
  }

  // En modo seguro no hay trabajador: la puerta de arranque ya no aplica (si no, /api/setup diría «arrancando»
  // 90 s y el actualizador volvería atrás una versión que está bien).
  function quedarEnModoSeguro() {
    cancelarReinicio();
    puerta.aplica = false;
    fase = 'modo_seguro';
  }

  function modoSeguroActivo() {
    try { return leerModoSeguro(db).activo; } catch { return false; }
  }

  function encender() {
    if (parando || hijo) return;
    cancelarReinicio();
    if (modoSeguroActivo()) return quedarEnModoSeguro();
    let corrida;
    try {
      corrida = nuevaCorrida(db, { version, codigo });
    } catch (e) {
      error('No se pudo anotar la corrida del trabajador (se intenta otra vez):', e.message);
      return programarReinicio(null, 'no_arranco');
    }
    const h = {
      corrida, pid: null, proceso: null, desde: mono(), desdeEn: reloj(), listo: false, ultimoLatido: null, ultimoLatidoEn: null, memoriaMb: null, heapPct: null,
      enCurso: [], freno: null, saliendo: null, pidioSalir: null, temporizadorSenal: null, matadoPor: null, terminado: false,
      esperas: [],
    };
    hijo = h;
    fase = 'arrancando';
    const env = {
      ...process.env,
      ...entorno,
      OPORTIA_DB: config.archivoBase,
      OPORTIA_COPIAS: config.carpetaCopias,
      OPORTIA_DATOS: config.carpetaDatos ?? dirname(config.archivoBase),
      OPORTIA_PROCESO: 'tareas',
      OPORTIA_CORRIDA: corrida,
      ...(tiemposTrabajador ? { OPORTIA_TAREAS_TIEMPOS: JSON.stringify(tiemposTrabajador) } : {}),
    };
    let proceso;
    try {
      proceso = lanzar({ ruta, env });
    } catch (e) {
      // No se pudo ni encender (falta memoria, demasiados procesos…): cuenta como que no arrancó.
      error('No se pudo encender el trabajador:', e.message);
      return alSalir(h, null, null, e);
    }
    h.proceso = proceso;
    h.pid = proceso.pid ?? null;
    reemitir(proceso.stdout, linea => log(linea));
    reemitir(proceso.stderr, linea => error(linea));
    proceso.on('message', mensaje => alMensaje(h, mensaje));
    proceso.on('exit', (codigoSalida, senal) => alSalir(h, codigoSalida, senal));
    proceso.on('error', e => {
      if (h.pid == null) {
        error('No se pudo encender el trabajador:', e.message);
        alSalir(h, null, null, e);
      }
    });
  }

  function alMensaje(h, mensaje) {
    if (!mensaje || typeof mensaje !== 'object' || h.terminado) return;
    const ahora = mono();
    if (mensaje.tipo === 'listo') {
      h.listo = true;
      h.ultimoLatido = ahora;
      h.ultimoLatidoEn = reloj();
      puerta.listo = true; // para siempre: la puerta ya no cierra hasta el próximo reinicio del servicio
      if (!h.pidioSalir) fase = 'esperando';
    } else if (mensaje.tipo === 'latido') {
      h.ultimoLatido = ahora;
      h.ultimoLatidoEn = reloj();
      h.memoriaMb = Number.isFinite(mensaje.memoriaMb) ? mensaje.memoriaMb : null;
      h.heapPct = Number.isFinite(mensaje.heapPct) ? mensaje.heapPct : null;
      h.enCurso = Array.isArray(mensaje.enCurso) ? mensaje.enCurso.slice(0, 10) : [];
      h.freno = typeof mensaje.freno === 'string' ? mensaje.freno : null;
      if (!h.pidioSalir && !h.saliendo && !h.matadoPor) fase = h.enCurso.length ? 'trabajando' : 'esperando';
    } else if (mensaje.tipo === 'saliendo') {
      h.saliendo = typeof mensaje.motivo === 'string' ? mensaje.motivo : 'normal';
      fase = 'parando';
    }
  }

  // Cómo terminó, según lo que sabe el servidor web. Si el trabajador alcanzó a anotar su propio motivo (más
  // preciso), ese gana: terminarCorrida solo escribe si la corrida sigue abierta.
  function comoPropuesto(h, codigoSalida) {
    if (parando) return 'normal';
    if (h.matadoPor) return h.matadoPor;
    if (codigoSalida === 76) return 'zombis';
    if (codigoSalida === 75) return 'memoria';
    if (codigoSalida === 3) return 'reemplazada';
    if (codigoSalida === 4) return 'base_no_compatible';
    if (codigoSalida === 0 && h.saliendo && NO_SON_FALLO.has(h.saliendo)) return h.saliendo;
    return h.listo ? 'caida' : 'no_arranco';
  }

  function alSalir(h, codigoSalida, senal, fallo = null) {
    if (h.terminado) return;
    h.terminado = true;
    clearTimeout(h.temporizadorSenal);
    if (hijo === h) hijo = null;
    const ahora = reloj();
    let como = comoPropuesto(h, codigoSalida);
    try {
      terminarCorrida(db, {
        corrida: h.corrida, como, codigo: codigoSalida, senal,
        detalle: fallo ? String(fallo.message ?? fallo).slice(0, 200) : h.matadoPor ? `cortado por el servidor web: ${h.matadoPor}` : null,
      });
      const guardado = db.prepare('SELECT como_termino FROM trabajador_corridas WHERE corrida = ?').get(h.corrida)?.como_termino;
      if (guardado && !parando) como = guardado;
    } catch (e) {
      error('No se pudo anotar cómo terminó el trabajador:', e.message);
    }
    // Lo que tenía en las manos vuelve a la fila YA (sin esperar al próximo trabajador). Si se cayó, la tarea
    // suma un fallo (pudo ser la culpable); si fue un apagado normal, no.
    try {
      recuperarAbandonadas(db, { corridas: [h.corrida], alFallar: marcarConErrores });
    } catch (e) {
      error('No se pudieron recuperar las tareas del trabajador:', e.message);
    }
    ultimaSalida = { en: iso(ahora), como, codigo: codigoSalida ?? null, senal: senal ?? null };
    if (ANORMALES.includes(como)) error(`El trabajador terminó mal (${como}${codigoSalida != null ? `, código ${codigoSalida}` : ''}${senal ? `, ${senal}` : ''})`);

    try {
      decidir(h, como, codigoSalida, senal);
    } finally {
      for (const listo of h.esperas.splice(0)) listo();
    }
  }

  // Qué hacer después de una salida.
  function decidir(h, como, codigoSalida, senal) {
    if (parando) {
      fase = 'parando';
      return;
    }
    if (modoSeguroActivo()) return quedarEnModoSeguro();
    // Salió por el modo seguro, pero alguien ya lo quitó mientras salía: se vuelve a encender enseguida.
    if (como === 'modo_seguro') return programarReinicio(h, 'senal');
    // Puerta de arranque: no arrancar cuenta como fallo, salvo que lo haya cortado alguien de afuera (por
    // ejemplo el sistema por falta de memoria): eso no es culpa del código nuevo.
    const dentro = enVentana();
    if (dentro && !h.listo && !NO_SON_FALLO.has(como) && (h.matadoPor || senal == null)) puerta.fallos += 1;
    if (!dentro) {
      if (como === 'base_no_compatible' && activarModoSeguro('base_no_compatible')) return quedarEnModoSeguro();
      if (ANORMALES.includes(como) && revisarInestable()) return quedarEnModoSeguro();
    }
    programarReinicio(h, como);
  }

  function programarReinicio(h, como) {
    if (parando) return;
    let espera;
    if (h && mono() - h.desde > T.vidaEstableMs) reinicios = 0;
    // Zombis: la primera vez vuelve en 2 s (los pasos zombis ya contaron su fallo). Si vuelve a pasar en
    // 10 min, cada vez espera más (como una caída), para que un tipo que se traba no tenga al trabajador
    // reiniciándose sin parar mientras queden tareas de ese tipo. No cuenta para el modo seguro.
    const zombisSeguidos = como === 'zombis' && ultimaZombis != null && mono() - ultimaZombis < T.ventanaZombisMs;
    if (como === 'zombis') ultimaZombis = mono();
    if (zombisSeguidos) {
      reinicios += 1;
      espera = Math.max(T.reintentoSenalMs, Math.min(T.reinicioMaxMs, T.reinicioBaseMs * 2 ** (reinicios - 1)));
    } else if (como === 'senal' || como === 'zombis') espera = T.reintentoSenalMs;
    else if (estadoArranque() === 'arrancando') {
      // Al arrancar se reintenta enseguida (0,5 s, 1 s y 1,5 s). Ya «fallido», se espera cada vez más, como
      // siempre: no sirve de nada encenderlo cada segundo mientras el actualizador vuelve atrás.
      salidasEnVentana += 1;
      espera = (T.reinicioBaseMs / 2) * Math.min(3, salidasEnVentana);
    } else {
      reinicios += 1;
      espera = Math.min(T.reinicioMaxMs, T.reinicioBaseMs * 2 ** (reinicios - 1));
    }
    fase = 'reiniciando';
    cancelarReinicio();
    proximoIntento = reloj() + espera;
    temporizadorReinicio = setTimeout(() => {
      temporizadorReinicio = null;
      proximoIntento = null;
      try { encender(); } catch (e) { error('No se pudo volver a encender el trabajador:', e); }
    }, espera);
    temporizadorReinicio.unref?.();
  }

  // Cada 10 s: ¿quedó listo a tiempo? ¿sigue latiendo?
  function vigilar() {
    const h = hijo;
    if (!h || h.terminado || h.matadoPor) return;
    const ahora = mono();
    if (!h.listo) {
      if (ahora - h.desde > T.listoMaxMs) matar(h, 'no_arranco');
      return;
    }
    const sinLatido = ahora - (h.ultimoLatido ?? h.desde);
    if (sinLatido > T.vigiaMs) matar(h, 'colgado');
    else if (sinLatido > T.vigiaMs / 2 && !h.pidioSalir && !h.saliendo) fase = 'sin_respuesta';
  }

  function aplicarModoSeguro(activo) {
    if (parando) return;
    if (activo) {
      cancelarReinicio();
      if (hijo && !hijo.terminado) pedirQueSalga(hijo, 'modo_seguro');
      else fase = 'modo_seguro';
    } else if (!hijo && (fase === 'modo_seguro' || temporizadorReinicio == null)) {
      reinicios = 0;
      ultimaZombis = null;
      encender();
    }
  }

  // Cada 30 s: ¿alguien cambió el modo seguro (por ejemplo desde la consola)?
  function revisarModoSeguro() {
    let m;
    try { m = leerModoSeguro(db); } catch { return; }
    if (ultimoModoSeguro != null && m.activo !== ultimoModoSeguro) puerta.aplica = false;
    ultimoModoSeguro = m.activo;
    if (m.activo && (hijo || fase !== 'modo_seguro')) aplicarModoSeguro(true);
    else if (!m.activo && fase === 'modo_seguro' && !hijo) aplicarModoSeguro(false);
  }

  // El peor 1 % de la espera de las pantallas en la última hora, en ms. Node mide el tiempo entre dos vueltas
  // de su reloj de 20 ms: se le resta esa resolución para quedarse solo con el retraso.
  function pantallasP99Ms() {
    try {
      if (!retraso.count) return null;
      return Math.round(Math.max(0, retraso.percentile(99) / 1e6 - RESOLUCION_RETRASO_MS) * 10) / 10;
    } catch {
      return null;
    }
  }

  function medirAhora() {
    return medirSalud({
      carpetaDatos: config.carpetaDatos ?? (config.archivoBase ? dirname(config.archivoBase) : null),
      archivoBase: config.archivoBase,
      carpetaCopias: config.carpetaCopias,
      pids: { web: process.pid, trabajador: hijo?.pid ?? null },
      pantallasP99Ms: pantallasP99Ms(),
    });
  }

  // Cada 60 s: como mucho una muestra por hora (UTC), y con ella se abren o resuelven los avisos de salud.
  function vigiaSalud() {
    const ahora = reloj();
    const hora = iso(ahora).slice(0, 13);
    if (hora === ultimaHoraMuestra) return;
    ultimaHoraMuestra = hora;
    const medidas = medirAhora();
    const guardada = guardarMuestra(db, medidas, resumenFila(db, { ahora }), ahora);
    retraso.reset();
    if (!guardada) return; // ya había una muestra de esta hora (el servicio se reinició)
    const reinicios24h = reiniciosDesde(db, ahora - 86_400_000);
    sincronizarAvisos(db, evaluarSalud(medidas, { reinicios24h }), ahora);
  }

  function seguro(nombre, funcion) {
    return () => {
      try { funcion(); } catch (e) { error(`Error en ${nombre} (sigue):`, e); }
    };
  }

  // Cuando el servicio entero se cayó (apagón, falta de memoria) nadie devolvió las tareas que el trabajador
  // tenía en las manos: eso lo hace el próximo trabajador al empezar. Si el servicio arranca en modo seguro, no
  // hay próximo trabajador: lo hace el servidor web una vez, igual que lo haría el trabajador (corridas que ya
  // no viven → «perdida», y sus tareas vuelven a la fila sin contar fallo). Así nada queda «en curso» de mentira.
  function recuperarSinTrabajador() {
    try {
      const r = enTransaccion(db, () => {
        const ahora = reloj();
        const perdidas = marcarPerdidas(db, { ahora });
        const recuperadas = recuperarAbandonadas(db, { ahora, alFallar: marcarConErrores });
        return { perdidas, recuperadas };
      });
      if (r.recuperadas.length) log(`En modo seguro: ${r.recuperadas.length} tarea(s) de una vida anterior volvieron a la fila`);
    } catch (e) {
      error('No se pudieron recuperar las tareas de una vida anterior del trabajador:', e.message);
    }
  }

  function iniciar() {
    if (iniciadoEn != null || parando) return;
    iniciadoEn = mono();
    try { retraso.enable(); } catch { /* sin medida */ }
    let m = null;
    try {
      m = revisarAlArrancar(db, { codigo, version });
      if (m.levantado) log('El modo seguro automático se quitó solo: hay código nuevo (si vuelve a fallar, se activa otra vez)');
    } catch (e) {
      error('No se pudo revisar el modo seguro al arrancar:', e);
    }
    const programar = (funcion, cada) => {
      const t = setInterval(funcion, Math.max(10, cada));
      t.unref?.();
      temporizadores.push(t);
    };
    programar(seguro('la vigilancia del trabajador', vigilar), T.revisarCadaMs);
    programar(seguro('la revisión del modo seguro', revisarModoSeguro), T.modoSeguroCadaMs);
    programar(seguro('la muestra de salud', vigiaSalud), T.saludCadaMs);
    // Cuando se cierra la ventana de arranque, se revisa una vez si el trabajador está inestable.
    const fin = setTimeout(seguro('el cierre de la ventana de arranque', () => {
      if (!hijo && fase !== 'modo_seguro' && revisarInestable()) quedarEnModoSeguro();
    }), T.ventanaArranqueMs + 50);
    fin.unref?.();
    temporizadores.push(fin);

    const activo = m ? m.activo : modoSeguroActivo();
    ultimoModoSeguro = activo;
    if (activo) {
      puerta.aplica = false;
      fase = 'modo_seguro';
      log('Modo seguro activo: el trabajo automático no se enciende (las pantallas funcionan normal)');
      recuperarSinTrabajador();
      return;
    }
    encender();
  }

  function parar() {
    if (paradaEnMarcha) return paradaEnMarcha;
    parando = true;
    fase = 'parando';
    cancelarReinicio();
    for (const t of temporizadores.splice(0)) { clearInterval(t); clearTimeout(t); }
    try { retraso.disable(); } catch { /* ya apagado */ }
    const h = hijo;
    if (!h || h.terminado) {
      paradaEnMarcha = Promise.resolve();
      return paradaEnMarcha;
    }
    paradaEnMarcha = new Promise(listo => {
      let matarTarde = null;
      let rendirse = null;
      h.esperas.push(() => { clearTimeout(matarTarde); clearTimeout(rendirse); listo(); });
      pedirQueSalga(h, 'normal');
      matarTarde = setTimeout(() => { try { h.proceso.kill('SIGKILL'); } catch { /* ya salió */ } }, T.paradaMs);
      rendirse = setTimeout(listo, T.paradaMs + 2000);
    });
    return paradaEnMarcha;
  }

  function despertar() {
    if (hijo?.listo && !hijo.terminado) enviarA(hijo, { tipo: 'despertar' });
  }

  function estado() {
    const h = hijo;
    const ahora = reloj();
    let reinicios24h = null;
    try { reinicios24h = reiniciosDesde(db, ahora - 86_400_000); } catch { reinicios24h = null; }
    return {
      fase,
      pid: h?.pid ?? null,
      corrida: h?.corrida ?? null,
      desde: h ? iso(h.desdeEn) : null,
      ultimoLatido: h?.ultimoLatidoEn ? iso(h.ultimoLatidoEn) : null,
      segundosDesdeLatido: h?.ultimoLatido != null ? Math.round((mono() - h.ultimoLatido) / 1000) : null,
      memoriaMb: h?.memoriaMb ?? null,
      heapPct: h?.heapPct ?? null,
      enCurso: h?.enCurso ?? [],
      freno: h?.freno ?? null,
      proximoIntento: proximoIntento ? iso(proximoIntento) : null,
      ultimaSalida,
      reinicios24h,
      arranque: estadoArranque(),
    };
  }

  // Desde la pantalla de Administrador. El cambio vale enseguida (no espera la revisión de cada 30 s).
  function ponerModoSeguroAdmin({ activo, usuarioId = null }) {
    const r = ponerModoSeguro(db, { activo: activo === true, origen: 'admin', usuarioId, codigo, version });
    puerta.aplica = false;
    ultimoModoSeguro = r.activo;
    aplicarModoSeguro(r.activo);
    return r;
  }

  return {
    iniciar, parar, despertar, estado, estadoArranque, ponerModoSeguro: ponerModoSeguroAdmin, medirAhora, pantallasP99Ms,
  };
}
