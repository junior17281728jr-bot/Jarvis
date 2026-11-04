// El SUPERVISOR: vive en el servidor web y cuida al trabajador (el proceso aparte que hace las tareas).
// Es el ÚNICO archivo que puede encender otros procesos (lo comprueba test/reglas.test.js).
//  - Enciende UN trabajador, con /usr/bin/nice -n 10 (todos sus hilos con menos prioridad que las pantallas) y
//    con poca memoria permitida. Lo anota en trabajador_corridas ANTES de encenderlo.
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
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { ANORMALES, nuevaCorrida, terminarCorrida, salidasAnormales, reiniciosDesde } from './corridas.js';
import { recuperarAbandonadas, resumenFila } from './cola.js';
import { leerModoSeguro, ponerModoSeguro, revisarAlArrancar } from './modo-seguro.js';
import { sincronizarAvisos } from '../avisos/avisos.js';
import { medirSalud, evaluarSalud, guardarMuestra } from '../nucleo/salud.js';
import { marcarConErrores } from '../proyectos/proyectos.js';

export const RUTA_TRABAJADOR = fileURLToPath(new URL('./trabajador.js', import.meta.url));
export const BANDERAS_TRABAJADOR = Object.freeze(['--no-warnings', '--max-old-space-size=64', '--max-semi-space-size=2']);
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
  paradaMs: 5000,
  reintentoSenalMs: 2000,
  saludCadaMs: 60000,
});
export const FASES_TRABAJADOR = Object.freeze(['arrancando', 'esperando', 'trabajando', 'reiniciando', 'sin_respuesta', 'modo_seguro', 'parando']);
export const ESTADOS_ARRANQUE = Object.freeze(['arrancando', 'listo', 'fallido', 'no_aplica']);

// El primer `nice` que exista (con ruta completa: funciona aunque el entorno venga vacío).
const RESOLUCION_RETRASO_MS = 20;
const NICE = ['/usr/bin/nice', '/bin/nice'].find(ruta => existsSync(ruta)) ?? null;
const iso = ms => new Date(ms).toISOString();
// Salidas que NO cuentan como fallo al arrancar (no son culpa del código nuevo).
const NO_SON_FALLO = new Set(['normal', 'senal', 'sin_padre', 'modo_seguro']);

export function lanzarTrabajador({ ruta = RUTA_TRABAJADOR, env }) {
  const argumentos = [...BANDERAS_TRABAJADOR, ruta];
  // El hijo nunca va aparte (detached): queda en el mismo grupo de procesos y en el mismo servicio de systemd.
  const opciones = { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json', env };
  return NICE ? spawn(NICE, ['-n', '10', process.execPath, ...argumentos], opciones) : spawn(process.execPath, argumentos, opciones);
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
  tiemposTrabajador = null, entorno = {}, registro = console, reloj = Date.now,
}) {
  if (!db) throw new Error('crearSupervisor necesita la base');
  const T = { ...TIEMPOS_SUPERVISOR, ...tiempos };
  const log = (...partes) => { try { registro.log?.(...partes); } catch { /* sin registro */ } };
  const error = (...partes) => { try { registro.error?.(...partes); } catch { /* sin registro */ } };
  const retraso = monitorEventLoopDelay({ resolution: RESOLUCION_RETRASO_MS });

  let fase = 'arrancando';
  let hijo = null;
  let iniciadoEn = null;
  let parando = false;
  let paradaEnMarcha = null;
  let temporizadorReinicio = null;
  let proximoIntento = null;
  let reinicios = 0;
  let salidasEnVentana = 0;
  let ultimaSalida = null;
  let ultimoModoSeguro = null;
  let ultimaHoraMuestra = null;
  const temporizadores = [];
  // La puerta de arranque (ver estadoArranque).
  const puerta = { aplica: true, listo: false, fallos: 0 };

  function estadoArranque() {
    if (!puerta.aplica) return 'no_aplica';
    if (puerta.listo) return 'listo';
    if (iniciadoEn == null) return 'arrancando';
    if (reloj() - iniciadoEn >= T.ventanaArranqueMs) return 'no_aplica';
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

  // Le pide al trabajador que salga ordenado (por el canal; si no se puede, con SIGTERM).
  function pedirQueSalga(h, motivo) {
    if (!h || h.terminado || h.pidioSalir) return;
    h.pidioSalir = motivo;
    fase = 'parando';
    if (!enviarA(h, { tipo: 'parar', motivo })) {
      try { h.proceso.kill('SIGTERM'); } catch { /* ya salió */ }
    }
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
  function revisarInestable() {
    if (enVentana() || parando) return false;
    let n = 0;
    try { n = salidasAnormales(db, { codigo, desde: reloj() - T.ventanaCaidasMs }); } catch { return false; }
    if (n < T.caidasParaModoSeguro) return false;
    let yaActivo = false;
    try { yaActivo = leerModoSeguro(db).activo; } catch { /* se intenta igual */ }
    return yaActivo || activarModoSeguro('trabajador_inestable');
  }

  function quedarEnModoSeguro() {
    cancelarReinicio();
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
      corrida, pid: null, proceso: null, desde: reloj(), listo: false, ultimoLatido: null, memoriaMb: null, heapPct: null,
      enCurso: [], freno: null, saliendo: null, pidioSalir: null, matadoPor: null, terminado: false, esperas: [],
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
    const ahora = reloj();
    if (mensaje.tipo === 'listo') {
      h.listo = true;
      h.ultimoLatido = ahora;
      puerta.listo = true; // para siempre: la puerta ya no cierra hasta el próximo reinicio del servicio
      if (!h.pidioSalir) fase = 'esperando';
    } else if (mensaje.tipo === 'latido') {
      h.ultimoLatido = ahora;
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
    if (h && reloj() - h.desde > T.vidaEstableMs) reinicios = 0;
    if (como === 'senal' || como === 'zombis') espera = T.reintentoSenalMs;
    else if (enVentana()) {
      salidasEnVentana += 1;
      espera = (T.reinicioBaseMs / 2) * Math.min(3, salidasEnVentana); // 0,5 s, 1 s y 1,5 s
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
    const ahora = reloj();
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

  function iniciar() {
    if (iniciadoEn != null) return;
    iniciadoEn = reloj();
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
      desde: h ? iso(h.desde) : null,
      ultimoLatido: h?.ultimoLatido ? iso(h.ultimoLatido) : null,
      segundosDesdeLatido: h?.ultimoLatido ? Math.round((ahora - h.ultimoLatido) / 1000) : null,
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
