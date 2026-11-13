// El que MANDA los avisos graves al Telegram del dueño (fase 1, parte e). Corre en el proceso WEB, no en el trabajador:
// el trabajador es justo lo que se apaga (modo seguro) o se cae, y esos avisos tienen que llegar igual.
//  - Una pasada cada 15 s, como mucho UN mensaje por pasada, nunca esperada por una pantalla; empieza después de abrir
//    el puerto; se traga sus propios errores (anota solo un código corto).
//  - Qué va y qué suena: RUTA_AVISOS (vaPorTelegram). Solo lo grave suena; lo demás llega en silencio.
//  - No repetir: avisos.enviado_en (la parte c y la d lo vacían cuando el aviso sube a grave o es una noticia nueva:
//    «reenviar»). Solo avisos de las últimas 48 h. Lo que NO es grave y va y viene se calla 6 h; lo grave nunca se calla:
//    si vuelve después de «Ya se arregló», llega como «Volvió a pasar» y suena (si vuelve 3 veces en 6 h, se juntan en un
//    mensaje cada 30 min como mucho).
//  - Topes por chat: 10 por hora y 30 por día, contando SOLO los mensajes de avisos (nunca las partes de las copias).
//    Lo grave nunca se pierde: espera. Con 3 o más pendientes, va UN mensaje que los junta.
//  - Primero se manda y después se anota (en una transacción): una caída entre medio puede repetir un mensaje, nunca
//    perderlo.
//  - También revisa, cada 5 min, si las copias se atrasaron (copia_atrasada): así un trabajador caído no esconde que
//    las copias se pararon.
//  - Lo grave nunca se pierde en silencio: si Telegram no funciona por horas o días, lo grave espera hasta 7 días (nunca
//    queda «fallido» por esperar), y lo grave que se arregló solo (o pasó de 7 días) sin llegar va en UN mensaje «No te
//    llegaron a tiempo» apenas Telegram vuelve. Lo que no es grave y pasa de 48 h queda anotado «vencido».
//  - Si el dueño pegó un token nuevo del MISMO bot y su prueba falló por algo pasajero, se prueba otra vez solo (gratis,
//    cada 5 min las primeras veces y después cada hora) hasta que pase: los avisos nunca quedan mudos por eso.
//  - Un reloj que se corrige hacia atrás no frena nada: lo «del futuro» no cuenta para los topes ni para «hace poco».
// Ronda 2 del equipo rojo:
//  - Un reloj que SALTA hacia adelante (mala hora del NTP) no vence ni marca nada: se compara con el reloj del proceso
//    (que nunca salta); mientras no cuadran, nada queda «vencido», «fallido», «perdido» ni «atrasado». Si la hora nueva
//    se queda 6 h seguidas (era la buena), se acepta.
//  - «Antes de conectar» es antes de la PRIMERA vez que se unió un chat del dueño: al unirlo OTRA vez (se perdió, otro
//    bot), lo grave que esperaba llega, y lo que se arregló mientras tanto va en «No te llegaron a tiempo».
//  - La bienvenida que no salió al unir el chat se manda en la próxima pasada (dice cuántos avisos hay abiertos).
import { enTransaccion } from '../nucleo/db.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { copiaAtrasada } from '../copias/estado.js';
import { revisarPagoServidor } from '../avisos/pago-servidor.js';
import { conCredencial } from './credencial.js';
import { ADAPTADORES } from './canal.js';
import { USO, listoParaMandar, anotarEnvio, anotarProblema, marcarBien, enviadosDesde, rangoDe, secretoDelBot, mandarBienvenida, bienvenidaPendiente, primerVinculo, MARGEN_RELOJ_MS, revisarClaveDudosa, botGuardado } from './canales.js';
import { textoDeAviso, textoCierre, textoResumen, textoPerdidos, idiomaDelDueno, baseDeClave, frase, TEXTO_MAX, comoHtml, HTML_MAX } from './textos.js';
import { probarSecreto } from '../claves/probar.js';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
export const TOPES_ENVIO = Object.freeze({
  porHora: 10, porDia: 30, frescuraMs: 48 * HORA, reenvioMinMs: 30 * MINUTO, callarMs: 6 * HORA, cierreMs: 24 * HORA,
  juntarDesde: 3, reaperturasParaJuntar: 3, fallidoMs: 24 * HORA, atrasadaCadaMs: 5 * MINUTO, cadaMs: 15_000,
  frescuraGraveMs: 7 * 24 * HORA, // lo grave espera hasta 7 días a que Telegram vuelva
  reprobarMs: Object.freeze([5 * MINUTO, 5 * MINUTO, 5 * MINUTO, HORA]), // probar otra vez un token nuevo que no pasó por algo pasajero
  reprobarMaloMs: HORA, // ronda 3: un token que quedó «no sirve» se prueba otra vez cada hora (gratis)
  saltoRelojMs: 10 * MINUTO, // la hora de la pared y la del proceso no cuadran por más que esto: el reloj saltó
  aceptarSaltoMs: 6 * HORA, // una hora nueva que se queda así de tiempo (del proceso) se acepta
  bienvenidaTrasMs: MINUTO, // la bienvenida que no salió se manda desde 1 min después de unir el chat
});
// Lo que dice la prueba de un token cuando falló por algo que se arregla solo (src/claves/probar.js).
const PRUEBAS_PASAJERAS = Object.freeze(['error_proveedor', 'sin_red', 'tiempo_agotado', 'respuesta_no_valida', 'limite_proveedor', 'error_servidor']);
// Lo que NO es un problema del canal al mandar (nunca marca un aviso «fallido»).
const SIN_CANAL = Object.freeze(['ok', 'limite', 'sin_clave', 'credencial_cambiada', 'cancelado']);
// Lo que pudo haber llegado aunque no hubo respuesta (además de lo que el adaptador marca «quizas»).
const DUDOSOS = Object.freeze(['tiempo_agotado', 'error_servidor']);

// Lo que va por Telegram (además de TODO lo grave, que va siempre y suena). Ver diseno-1e §7.2.
export const RUTA_AVISOS = Object.freeze({
  claves: Object.freeze(['trabajador_reinicios', 'disco_bajo', 'memoria_baja', 'copias_locales_pausadas', 'copias_sin_clave', 'copias_comprobar_clave',
    'copias_disco_pronto', 'copia_sin_fijar', 'copia_fallida', 'copia_atrasada', 'ia_costo_mayor', 'ia_llave', 'base_danada',
    'copias_fecha_futura', 'copias_otro_servidor', 'copia_solo_local']),
  prefijos: Object.freeze(['actualizacion_no_instalada', 'actualizacion_revertida', 'ia_tope', 'ia_proveedor',
    // 0.12.7: el resumen de un día con gasto de IA (en silencio; un día sin gasto no tiene).
    'ia_resumen',
    // 0.12.3: un cambio delicado del administrador y un comprobante de pago nuevo.
    'cambio_admin', 'pago_recibido',
    // 0.12.8: una cuenta de alumno abierta en otro dispositivo más de 3 veces en un día (quizás la comparte).
    'cuenta_compartida',
    // 0.13.0: la fábrica de materias publicó una materia, una espera revisión o la mejora continua publicó.
    'fabrica_publicada', 'fabrica_revision', 'fabrica_mejora',
    // 0.13.9: la mejora profunda de las clases publicó la versión mejorada de una materia.
    'fabrica_profunda',
    // 0.14.1: los recordatorios del pago del servidor (7 y 2 días antes y el día; con pago automático, uno 2 días antes).
    'servidor_pago',
    // 0.14.8: «Claude mejora la app».
    'app_lista', 'app_instalada', 'app_deshecha', 'app_token', 'app_termino']),
  // Nunca (solo en la pantalla), aunque estén en la lista de arriba por su nivel: el modo seguro puesto a mano es «info».
});

// → { va, suena }. Pura.
export function vaPorTelegram(aviso) {
  if (!aviso) return { va: false, suena: false };
  if (aviso.nivel === 'grave') return { va: true, suena: true };
  const base = baseDeClave(aviso.clave);
  const va = RUTA_AVISOS.claves.includes(base) || (String(aviso.clave).includes(':') && RUTA_AVISOS.prefijos.includes(base));
  return { va: va && aviso.nivel !== 'info', suena: false };
}

const iso = ms => new Date(ms).toISOString();

// monotono: el reloj del proceso (nunca salta). Por defecto, el de verdad si el reloj de pared es el de verdad; con un reloj
// de mentira (pruebas), ninguno, salvo que la prueba pase el suyo.
// pagoServidor (0.14.1): revisar cada 5 min si toca un recordatorio del pago del servidor. Solo lo enciende src/server.js
// (y las pruebas de ese recordatorio): así las demás pruebas nunca dependen del día del mes.
export function crearAvisador({ db, config, reloj = Date.now, adaptador = ADAPTADORES.telegram, registro = null, topes = {}, monotono = undefined, pagoServidor = false } = {}) {
  const T = { ...TOPES_ENVIO, ...topes };
  const mono = monotono === undefined ? (reloj === Date.now ? () => performance.now() : null) : monotono;
  let baseReloj = null; // { pared, mono } de la última pasada en que los dos relojes cuadraban
  let saltoDesde = null; // desde cuándo (reloj del proceso) no cuadran
  let temporizador = null;
  let enMarcha = null;
  let ultimaAtrasada = -Infinity;
  let ultimoPago = -Infinity;
  let reprobado = { en: -Infinity, veces: 0, secretoId: null };
  let parado = false;
  const anotar = codigo => { try { registro?.error?.(`Avisos por Telegram: ${codigo}`); } catch { /* nada */ } };

  function revisarAtrasada(ahora) {
    if (ahora - ultimaAtrasada < T.atrasadaCadaMs) return;
    ultimaAtrasada = ahora;
    const r = copiaAtrasada(db, ahora);
    enTransaccion(db, () => {
      if (r.activo) abrirAviso(db, { clave: 'copia_atrasada', nivel: 'grave', detalle: { ...r.detalle, modoSeguro: leerModoSeguro(db).activo }, ahora });
      else resolverAviso(db, 'copia_atrasada', ahora);
    });
  }

  // Marca un aviso que no se va a mandar (no va, ya estaba antes de unir el chat, callado…).
  function marcarSinMandar(canal, a, resultado, ahora) {
    enTransaccion(db, () => {
      db.prepare('UPDATE avisos SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL').run(iso(ahora), a.id);
      anotarEnvio(db, { canalId: canal.id, clase: 'aviso', avisoId: a.id, clave: a.clave, nivel: a.nivel, resultado, ahora });
    });
  }

  // El último envío de algo (nunca uno «del futuro»: un reloj corregido hacia atrás no hace creer que fue hace poco).
  const ultimoEnvioDe = (ahora, sql, ...valores) => db.prepare(`SELECT creado_en FROM canal_envios WHERE resultado IN ('enviado', 'agrupado') AND creado_en <= ?
    AND ${sql} ORDER BY creado_en DESC, id DESC LIMIT 1`).get(iso(ahora + MARGEN_RELOJ_MS), ...valores)?.creado_en ?? null;

  // ¿La hora de la pared es creíble? Se compara lo que avanzó con lo que avanzó el reloj del proceso desde la última
  // pasada en que cuadraban. Sin reloj del proceso (pruebas con reloj de mentira), siempre.
  function relojCreible(ahora) {
    if (!mono) return true;
    const m = mono();
    if (!baseReloj) { baseReloj = { pared: ahora, mono: m }; return true; }
    const diferencia = (ahora - baseReloj.pared) - (m - baseReloj.mono);
    if (Math.abs(diferencia) <= T.saltoRelojMs) { baseReloj = { pared: ahora, mono: m }; saltoDesde = null; return true; }
    if (saltoDesde == null) saltoDesde = m;
    if (m - saltoDesde >= T.aceptarSaltoMs) { baseReloj = { pared: ahora, mono: m }; saltoDesde = null; return true; }
    return false;
  }

  // ¿El token guardado es del MISMO bot del chat? (lo anotó su última prueba que pasó: telegram.bot)
  function botDelChat(canal) {
    const b = botGuardado(db);
    const s = secretoDelBot(db);
    return Boolean(b && s && b.secretoId === s.id && canal.cuenta_id && String(b.id) === String(canal.cuenta_id) && canal.secreto_id === s.id);
  }

  // Lo que no es grave y pasó de 48 h sin llegar: queda anotado «vencido» (la pantalla lo sigue mostrando).
  function vencerViejos(canal, ahora, primero) {
    const viejos = db.prepare(`SELECT * FROM avisos WHERE enviado_en IS NULL AND resuelto_en IS NULL AND nivel <> 'grave' AND ultima_vez < ?
      ORDER BY id LIMIT 20`).all(iso(ahora - T.frescuraMs));
    for (const a of viejos) {
      if (!vaPorTelegram(a).va) marcarSinMandar(canal, a, 'no_va', ahora);
      else if (primero && a.creado_en < primero) marcarSinMandar(canal, a, 'antes_de_conectar', ahora);
      else marcarSinMandar(canal, a, 'vencido', ahora);
    }
  }

  // Lo grave que nunca llegó: se arregló solo antes de poder mandarlo, o esperó más de 7 días (Telegram caído, el bot
  // bloqueado, el chat perdido hasta unirlo otra vez). Va todo junto en UN mensaje «No te llegaron a tiempo». Solo lo de
  // después de la PRIMERA vez que se unió un chat.
  function perdidos(canal, ahora, primero) {
    if (!primero) return [];
    return db.prepare(`SELECT * FROM avisos WHERE enviado_en IS NULL AND nivel = 'grave' AND creado_en >= ?
      AND ((resuelto_en IS NOT NULL AND resuelto_en >= ?) OR (resuelto_en IS NULL AND ultima_vez < ?))
      ORDER BY creado_en, id LIMIT 20`).all(primero, iso(ahora - T.frescuraGraveMs), iso(ahora - T.frescuraGraveMs));
  }

  // Lo que toca mandar ahora: [{ a, titulo, suena, veces, desde }] (lo grave primero). Lo grave espera hasta 7 días.
  // creible: false si el reloj acaba de saltar (entonces nada se vence).
  function pendientes(canal, ahora, primero, creible = true) {
    if (creible) vencerViejos(canal, ahora, primero);
    const candidatos = db.prepare(`SELECT * FROM avisos WHERE enviado_en IS NULL AND resuelto_en IS NULL
      AND (ultima_vez >= ? OR (nivel = 'grave' AND ultima_vez >= ?))
      ORDER BY CASE nivel WHEN 'grave' THEN 0 ELSE 1 END, ultima_vez, id LIMIT 20`).all(iso(ahora - T.frescuraMs), iso(ahora - T.frescuraGraveMs));
    const hastaIso = iso(ahora + MARGEN_RELOJ_MS);
    // «Hace menos de X»: nunca para algo «del futuro» (el reloj se corrigió hacia atrás).
    const hacePoco = (cuando, ms) => { const d = ahora - Date.parse(cuando); return d > -MARGEN_RELOJ_MS && d < ms; };
    const toca = [];
    for (const a of candidatos) {
      const ruta = vaPorTelegram(a);
      if (!ruta.va) { marcarSinMandar(canal, a, 'no_va', ahora); continue; }
      if (primero && a.ultima_vez < primero) { marcarSinMandar(canal, a, 'antes_de_conectar', ahora); continue; }
      // La misma fila, otra vez (subió a grave, o una noticia nueva): no antes de 30 min desde la última vez.
      const mismo = ultimoEnvioDe(ahora, 'aviso_id = ?', a.id);
      if (mismo && hacePoco(mismo, T.reenvioMinMs)) continue;
      const desde6h = iso(ahora - T.callarMs);
      if (a.nivel !== 'grave') {
        // Va y viene: otra fila de la misma clave ya se mandó en 6 h con el mismo nivel o más → se calla.
        const otras = db.prepare(`SELECT e.nivel FROM canal_envios e WHERE e.clave = ? AND e.aviso_id <> ? AND e.creado_en >= ? AND e.creado_en <= ?
          AND e.resultado IN ('enviado', 'agrupado') AND e.clase IN ('aviso', 'resumen')`).all(a.clave, a.id, desde6h, hastaIso);
        if (otras.some(o => rangoDe(o.nivel) >= rangoDe(a.nivel))) { marcarSinMandar(canal, a, 'silenciado', ahora); continue; }
        toca.push({ a, titulo: 'atencion', suena: false });
        continue;
      }
      // Lo grave nunca se calla.
      const antes = ultimoEnvioDe(ahora, "clave = ? AND aviso_id <> ? AND creado_en >= ? AND clase IN ('aviso', 'resumen')", a.clave, a.id, desde6h);
      if (!antes) { toca.push({ a, titulo: 'grave', suena: true }); continue; }
      const reaperturas = db.prepare('SELECT COUNT(*) AS n, MIN(creado_en) AS desde FROM avisos WHERE clave = ? AND creado_en >= ? AND creado_en <= ?').get(a.clave, desde6h, hastaIso);
      if (reaperturas.n >= T.reaperturasParaJuntar) {
        if (hacePoco(antes, T.reenvioMinMs)) continue; // se juntan: un mensaje cada 30 min como mucho
        toca.push({ a, titulo: 'volvio', suena: true, veces: reaperturas.n, desde: reaperturas.desde });
      } else toca.push({ a, titulo: 'volvio', suena: true });
    }
    return toca;
  }

  // Los graves que ya se mandaron (ANTES de arreglarse) y se arreglaron en las últimas 24 h, sin su «Ya se arregló». Lo
  // que llegó en «No te llegaron a tiempo» ya dice que se arregló: no lleva otro mensaje.
  function cierres(ahora) {
    return db.prepare(`SELECT a.* FROM avisos a WHERE a.nivel = 'grave' AND a.resuelto_en IS NOT NULL AND a.resuelto_en >= ?
      AND EXISTS (SELECT 1 FROM canal_envios e WHERE e.aviso_id = a.id AND e.resultado IN ('enviado', 'agrupado') AND e.clase IN ('aviso', 'resumen')
        AND e.creado_en <= a.resuelto_en)
      AND NOT EXISTS (SELECT 1 FROM canal_envios e WHERE e.aviso_id = a.id AND e.clase = 'cierre')
      ORDER BY a.resuelto_en LIMIT 5`).all(iso(ahora - T.cierreMs));
  }

  // ¿Alguno de estos avisos ya salió una vez sin saber si llegó («dudoso»)? Entonces el siguiente intento no suena.
  const yaDudoso = avisos => avisos.some(a => db.prepare("SELECT 1 FROM canal_envios WHERE aviso_id = ? AND resultado = 'dudoso' LIMIT 1").get(a.id));

  async function mandar(listo, mensaje, ahora, creible = true) {
    const { canal } = listo;
    // Ronda 3 del equipo rojo: si un intento anterior quizás llegó (se cortó la respuesta), este va en silencio y dice
    // que es otra vez: el dueño nunca recibe el mismo «URGENTE» sonando cada hora.
    const repetido = ['aviso', 'resumen', 'perdidos'].includes(mensaje.clase) && yaDudoso(mensaje.avisos);
    const plano = repetido ? `${frase(idiomaDelDueno(db), 'telegram.repetido')}\n${mensaje.texto}`.slice(0, TEXTO_MAX) : mensaje.texto;
    // 0.12.8: en HTML (todo escapado, el título en negrita). Se corta el texto PLANO; si escapado pasara del tope de
    // Telegram (nunca con 1.000 letras, salvo un nombre lleno de «&»), va plano: lo grave siempre llega.
    const html = comoHtml(mensaje.texto, { antes: repetido ? frase(idiomaDelDueno(db), 'telegram.repetido') : null });
    const conHtml = html.length <= HTML_MAX;
    const r = await conCredencial(db, config, { uso: USO, secretoId: canal.secreto_id }, cred => adaptador.enviarTexto(cred, {
      destino: canal.destino, texto: conHtml ? html : plano, html: conHtml, silencioso: repetido || !mensaje.suena,
    }));
    const momento = reloj();
    if (r.motivo === 'ok') {
      enTransaccion(db, () => {
        const juntos = mensaje.clase === 'resumen' || mensaje.clase === 'perdidos';
        for (const item of mensaje.avisos) {
          db.prepare('UPDATE avisos SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL').run(iso(momento), item.id);
          anotarEnvio(db, { canalId: canal.id, clase: juntos ? 'aviso' : mensaje.clase, avisoId: item.id, clave: item.clave, nivel: item.nivel,
            resultado: juntos ? 'agrupado' : 'enviado', mensajeId: r.mensajeId, ahora: momento });
        }
        if (juntos) anotarEnvio(db, { canalId: canal.id, clase: 'resumen', resultado: 'enviado', mensajeId: r.mensajeId, ahora: momento });
        marcarBien(db, canal.id, momento);
      });
      return { enviado: mensaje.clase, avisos: mensaje.avisos.map(a => a.id), suena: mensaje.suena };
    }
    enTransaccion(db, () => {
      if (r.motivo === 'sin_clave' || r.motivo === 'credencial_cambiada') return;
      anotarProblema(db, canal, { motivo: r.motivo, esperarMs: r.esperarMs, ahora: momento });
      // Quizás llegó: queda «dudoso» (cuenta para los topes de 10 por hora y 30 por día; el próximo intento no suena).
      if ((r.quizas || DUDOSOS.includes(r.motivo)) && ['aviso', 'resumen', 'perdidos', 'cierre'].includes(mensaje.clase)) {
        for (const item of mensaje.avisos) {
          anotarEnvio(db, { canalId: canal.id, clase: mensaje.clase === 'cierre' ? 'cierre' : 'aviso', avisoId: item.id, clave: item.clave, nivel: item.nivel, resultado: 'dudoso', motivo: r.motivo, ahora: momento });
        }
      }
      // Un aviso que NO es grave y no se pudo mandar en 24 h queda «fallido» (sigue en la pantalla). Lo grave nunca:
      // espera (hasta 7 días) a que Telegram vuelva.
      if (creible && !SIN_CANAL.includes(r.motivo) && ['aviso', 'resumen'].includes(mensaje.clase)) {
        for (const item of mensaje.avisos) {
          if (item.nivel !== 'grave' && Date.parse(item.ultima_vez) < momento - T.fallidoMs) {
            db.prepare('UPDATE avisos SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL').run(iso(momento), item.id);
            anotarEnvio(db, { canalId: canal.id, clase: 'aviso', avisoId: item.id, clave: item.clave, nivel: item.nivel, resultado: 'fallido', motivo: r.motivo, ahora: momento });
          }
        }
      }
    });
    anotar(r.motivo);
    return { enviado: null, motivo: r.motivo };
  }

  // El token se cambió por uno nuevo y su prueba gratis falló por algo pasajero (o no se hizo): se prueba otra vez solo,
  // gratis (getMe), cada 5 min las primeras 3 veces y después cada hora. Si pasa y es el mismo bot, el chat sigue con el
  // token nuevo (trasProbarToken, dentro de probarSecreto); si no pasa, telegram_falla «sin_probar» lo dice.
  // Ronda 3: un token que quedó «no sirve» (dos getMe seguidos con 401) se prueba otra vez cada hora, gratis, si es el
  // del bot del chat: un 401 de Telegram que fue un error suyo nunca deja los avisos mudos para siempre.
  async function reprobar(ahora, { lento = false } = {}) {
    const s = secretoDelBot(db);
    if (!s) return null;
    if (!lento && s.prueba && s.prueba !== 'ok' && !PRUEBAS_PASAJERAS.includes(s.prueba)) return null; // un token malo: el dueño tiene que pegar otro
    if (reprobado.secretoId !== s.id) reprobado = { en: -Infinity, veces: 0, secretoId: s.id };
    const espera = lento ? T.reprobarMaloMs : T.reprobarMs[Math.min(reprobado.veces, T.reprobarMs.length - 1)];
    if (ahora - reprobado.en < espera && ahora >= reprobado.en) return null;
    reprobado = { ...reprobado, en: ahora, veces: reprobado.veces + 1 };
    let motivo;
    try { motivo = (await probarSecreto(db, config, { id: s.id, usuarioId: null, ahora: reloj })).motivo; } catch { motivo = 'error_proveedor'; }
    if (motivo !== 'ok' && !lento) {
      enTransaccion(db, () => abrirAviso(db, { clave: 'telegram_falla', nivel: 'atencion', detalle: { motivo: 'sin_probar' }, ahora: reloj() }));
      anotar(`reprobar:${motivo}`);
    }
    return motivo;
  }

  async function pasadaDeVerdad() {
    const ahora = reloj();
    const creible = relojCreible(ahora);
    if (creible) revisarAtrasada(ahora);
    if (creible && pagoServidor && (ahora - ultimoPago >= T.atrasadaCadaMs || ahora < ultimoPago)) {
      ultimoPago = ahora;
      try { revisarPagoServidor(db, ahora); } catch (error) { anotar(`pago_servidor:${error?.code ?? error?.name ?? 'error'}`); }
    }
    // Una sospecha de token malo (un 401 suelto): getMe otra vez antes de mandar nada (ronda 3).
    await revisarClaveDudosa(db, config, { adaptador, ahora: reloj });
    let listo = listoParaMandar(db, config, ahora);
    if (!listo.si && listo.motivo === 'sin_probar') {
      const motivo = await reprobar(ahora);
      if (motivo === 'ok') listo = listoParaMandar(db, config, reloj());
    } else if (!listo.si && listo.motivo === 'clave_no_valida' && listo.canal && botDelChat(listo.canal)) {
      const motivo = await reprobar(ahora, { lento: true });
      if (motivo === 'ok') listo = listoParaMandar(db, config, reloj());
    }
    if (!listo.si) return { enviado: null, motivo: listo.motivo };
    const { canal } = listo;
    // La bienvenida que no salió al unir el chat va primero (1 min después de unirlo: la manda quien lo unió).
    if (bienvenidaPendiente(db, canal)) {
      if (ahora - Date.parse(canal.vinculado_en) < T.bienvenidaTrasMs && ahora >= Date.parse(canal.vinculado_en)) return { enviado: null, motivo: 'bienvenida_pendiente' };
      if (enviadosDesde(db, canal.id, ahora - HORA, ahora) >= T.porHora || enviadosDesde(db, canal.id, ahora - 24 * HORA, ahora) >= T.porDia) return { enviado: null, motivo: 'tope' };
      const b = await mandarBienvenida(db, config, { canalId: canal.id, adaptador, ahora: reloj() });
      if (b.motivo !== 'ok') anotar(`bienvenida:${b.motivo}`);
      return { enviado: b.motivo === 'ok' ? 'bienvenida' : null, motivo: b.motivo === 'ok' ? null : b.motivo };
    }
    const primero = primerVinculo(db);
    const toca = pendientes(canal, ahora, primero, creible);
    const sinLlegar = toca.length || !creible ? [] : perdidos(canal, ahora, primero);
    const porCerrar = toca.length || sinLlegar.length ? [] : cierres(ahora);
    if (!toca.length && !sinLlegar.length && !porCerrar.length) return { enviado: null, motivo: 'nada' };
    if (enviadosDesde(db, canal.id, ahora - HORA, ahora) >= T.porHora || enviadosDesde(db, canal.id, ahora - 24 * HORA, ahora) >= T.porDia) {
      return { enviado: null, motivo: 'tope' };
    }
    const idioma = idiomaDelDueno(db);
    let mensaje;
    if (toca.length >= T.juntarDesde) {
      mensaje = { clase: 'resumen', avisos: toca.map(x => x.a), suena: toca.some(x => x.suena), texto: textoResumen(toca.map(x => x.a), idioma) };
    } else if (toca.length) {
      const x = toca[0];
      mensaje = { clase: 'aviso', avisos: [x.a], suena: x.suena, texto: textoDeAviso(x.a, idioma, { titulo: x.titulo, veces: x.veces, desde: x.desde }) };
    } else if (sinLlegar.length) {
      mensaje = { clase: 'perdidos', avisos: sinLlegar, suena: true, texto: textoPerdidos(sinLlegar, idioma) };
    } else {
      const a = porCerrar[0];
      mensaje = { clase: 'cierre', avisos: [a], suena: false, texto: textoCierre(a, idioma) };
    }
    return mandar(listo, mensaje, ahora, creible);
  }

  // Una pasada (la usan el temporizador y las pruebas). Nunca lanza.
  async function pasada() {
    if (enMarcha) return enMarcha;
    enMarcha = (async () => {
      try {
        return await pasadaDeVerdad();
      } catch (error) {
        anotar(error?.codigo ?? error?.code ?? error?.name ?? 'error');
        return { enviado: null, motivo: 'error' };
      } finally {
        enMarcha = null;
      }
    })();
    return enMarcha;
  }

  return {
    pasada,
    iniciar() {
      if (temporizador || parado) return;
      temporizador = setInterval(() => { pasada(); }, T.cadaMs);
      temporizador.unref?.();
      const primera = setTimeout(() => { if (!parado) pasada(); }, Math.min(5000, T.cadaMs));
      primera.unref?.();
    },
    async parar() {
      parado = true;
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
      if (enMarcha) await Promise.race([enMarcha, new Promise(listo => setTimeout(listo, 3000).unref?.())]);
    },
  };
}
