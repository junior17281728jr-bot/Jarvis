// 0.12.8 (pedido del dueño): el bot del dueño ESCUCHA comandos y le manda los contratos firmados.
//  - Comandos (src/canales/comandos.js), SOLO del chat unido del dueño: un chat privado, que no es un bot, con el mismo
//    id que el chat unido. Cualquier otro chat se ignora (nunca se le contesta: ni «no»). Se contesta siempre al chat unido.
//  - Sin webhooks: como el resto de OPORTIA, se pregunta a Telegram (getUpdates, sin esperar) cada 20 s, solo con el chat
//    unido y listo para mandar, y NUNCA mientras se une un chat (el código del dueño llega por ahí: src/canales/canales.js).
//    El cursor se guarda en «ajustes»; uno de hace más de un día no se usa (Telegram puede cambiar la numeración) y nunca
//    se contesta un mensaje de más de 10 minutos ni de antes de unir el chat (un «/contratos todos» viejo no se dispara).
//  - Topes propios (nunca gastan los de los avisos graves: estas clases no están en CLASES_QUE_CUENTAN): 30 respuestas por
//    hora; 60 archivos por hora; entre dos envíos pedidos desde la pantalla, 3 s («espera N s»).
//  - Al firmar (o volver a firmar) un alumno: la pantalla deja una marca «por mandar» en «ajustes» y este mismo bot manda
//    el documento firmado (src/cuentas/contrato-archivo.js) en su próxima pasada: nunca frena ni hace fallar la firma, y
//    llega aunque el servidor se reinicie entre medio. Una marca que no pudo salir en 7 días queda «vencida» (nada se borra).
import { enTransaccion } from '../nucleo/db.js';
import { conCredencial } from './credencial.js';
import { ADAPTADORES } from './canal.js';
import { USO, listoParaMandar, anotarEnvio, anotarProblema, marcarBien, canalPendiente, canalPorConfirmar, MARGEN_RELOJ_MS } from './canales.js';
import { frase, escaparHtml, tituloHtml, idiomaDelDueno, fechaRd, HTML_MAX } from './textos.js';
import { leerComando, textoAyuda, textoResumen, textoGastos, textoPagos, textoAlumno, contratosParaMandar } from './comandos.js';
import { archivoContrato } from '../cuentas/contrato-archivo.js';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
export const TOPES_BOT = Object.freeze({
  cadaMs: 20_000, respuestasPorHora: 30, archivosPorHora: 60, entreEnviosMs: 3000, frescuraMs: 10 * MINUTO, cursorMs: 24 * HORA,
  pendienteMs: 7 * 24 * HORA, pausaArchivosMs: 1100, porPedido: 20,
});
export const CLAVE_CURSOR = 'telegram.bot.cursor';
export const PREFIJO_PENDIENTE = 'telegram.contrato.pendiente.';
const iso = ms => new Date(ms).toISOString();
const esperar = ms => new Promise(listo => setTimeout(listo, ms));

const leer = (db, clave) => { try { const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const guardar = (db, clave, valor, ahora) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), iso(ahora));
const enviadosDe = (db, canalId, clase, desdeMs, ahora) => db.prepare(`SELECT COUNT(*) AS n FROM canal_envios WHERE canal_id = ? AND clase = ? AND resultado IN ('enviado', 'dudoso')
  AND creado_en >= ? AND creado_en <= ?`).get(canalId, clase, iso(desdeMs), iso(ahora + MARGEN_RELOJ_MS)).n;

// La firma n de ese alumno, para mandarla en la próxima pasada (la llama src/api/terminos.js al firmar). Nunca lanza.
export function marcarContratoPorMandar(db, usuarioId, n, ahora = Date.now()) {
  try { guardar(db, `${PREFIJO_PENDIENTE}${Number(usuarioId)}.${Number(n)}`, { usuarioId: Number(usuarioId), n: Number(n), en: iso(ahora) }, ahora); } catch { /* la firma ya quedó */ }
}

// ¿Se puede mandar algo al chat del dueño ahora? → { si, motivo, canal }
function listo(db, config, ahora) {
  const l = listoParaMandar(db, config, ahora);
  return l.si ? { si: true, canal: l.canal } : { si: false, motivo: l.motivo };
}

// Manda UN mensaje (texto en HTML) o UN archivo (con su leyenda en HTML) al chat del dueño y lo anota. → { motivo }
async function mandarAlDueno(db, config, { canal, adaptador, texto = null, archivo = null, clase, reloj }) {
  const r = await conCredencial(db, config, { uso: USO, secretoId: canal.secreto_id }, cred => (archivo
    ? adaptador.enviarArchivo(cred, { destino: canal.destino, nombre: archivo.nombre, datos: archivo.datos, leyenda: archivo.leyenda, html: true, silencioso: true })
    : adaptador.enviarTexto(cred, { destino: canal.destino, texto, html: true, silencioso: true })));
  const motivo = r.motivo === 'sin_clave' || r.motivo === 'credencial_cambiada' ? 'sin_token' : r.motivo;
  const momento = reloj();
  enTransaccion(db, () => {
    anotarEnvio(db, { canalId: canal.id, clase, resultado: motivo === 'ok' ? 'enviado' : 'fallido', motivo: motivo === 'ok' ? null : motivo, mensajeId: r.mensajeId ?? null, bytes: archivo?.datos?.length ?? null, ahora: momento });
    if (motivo === 'ok') marcarBien(db, canal.id, momento);
    else if (motivo !== 'sin_token') anotarProblema(db, canal, { motivo, esperarMs: r.esperarMs, ahora: momento });
  });
  return { motivo, esperarMs: r.esperarMs ?? null };
}

// La leyenda de un contrato: «📄 Contrato firmado» y nombre, @usuario, versión y fecha (cada una en su línea).
export function leyendaContrato(c, idioma) {
  return [
    tituloHtml('📄', frase(idioma, 'bot.contrato.titulo')),
    `${escaparHtml(String(c.firmado ?? '').slice(0, 80))} (@${escaparHtml(String(c.usuario ?? '—').slice(0, 40))})`,
    escaparHtml(frase(idioma, 'bot.contrato.version', { t: c.version, p: c.versionPrivacidad ?? '—' })),
    escaparHtml(fechaRd(c.en, idioma)),
    c.menor ? escaparHtml(frase(idioma, 'contratos.menor')) : null,
  ].filter(Boolean).join('\n');
}

// Manda contratos (de a uno, con su pausa) al chat del dueño. lista: [{ usuarioId, n }]. → { motivo, enviados, de }
export async function mandarContratos(db, config, { lista, adaptador = ADAPTADORES.telegram, reloj = Date.now, topes = {} } = {}) {
  const T = { ...TOPES_BOT, ...topes };
  const idioma = idiomaDelDueno(db);
  let enviados = 0;
  for (const [i, x] of (lista ?? []).slice(0, T.porPedido).entries()) {
    const ahora = reloj();
    const l = listo(db, config, ahora);
    if (!l.si) return { motivo: l.motivo, enviados, de: lista.length };
    if (enviadosDe(db, l.canal.id, 'contrato', ahora - HORA, ahora) >= T.archivosPorHora) return { motivo: 'tope_archivos', enviados, de: lista.length };
    let archivo;
    try {
      const a = archivoContrato(db, config, x.usuarioId, x.n, idioma);
      archivo = { nombre: a.nombre, datos: a.datos, leyenda: leyendaContrato(a.contrato, idioma) };
    } catch { return { motivo: 'no_existe', enviados, de: lista.length }; }
    if (i > 0) await esperar(T.pausaArchivosMs);
    const r = await mandarAlDueno(db, config, { canal: l.canal, adaptador, archivo, clase: 'contrato', reloj });
    if (r.motivo !== 'ok') return { motivo: r.motivo, esperarMs: r.esperarMs, enviados, de: lista.length };
    enviados += 1;
  }
  return { motivo: 'ok', enviados, de: lista.length };
}

// «Probar el bot» y cualquier mensaje corto (HTML ya armado y escapado) al chat del dueño. → { motivo }
export async function mandarTextoAlDueno(db, config, { texto, clase = 'comando', adaptador = ADAPTADORES.telegram, reloj = Date.now } = {}) {
  const l = listo(db, config, reloj());
  if (!l.si) return { motivo: l.motivo };
  if (String(texto).length > HTML_MAX) return { motivo: 'pedido_no_valido' };
  return mandarAlDueno(db, config, { canal: l.canal, adaptador, texto, clase, reloj });
}

// ¿Este mensaje es un comando del dueño que hay que contestar? (chat privado, no un bot, SU chat, nuevo).
export function esDelDueno(m, canal, { ahora, frescuraMs = TOPES_BOT.frescuraMs } = {}) {
  if (!m?.chat || m.chat.tipo !== 'private' || !m.de || m.de.esBot) return false;
  if (String(m.chat.id) !== String(canal.destino) || String(m.de.id) !== String(canal.destino)) return false;
  if (!Number.isSafeInteger(m.fecha)) return false;
  const ms = m.fecha * 1000;
  // La fecha de Telegram va en segundos: 1 s de margen con la hora en que se unió el chat.
  if (ms < ahora - frescuraMs || (canal.vinculado_en && ms + 1000 < Date.parse(canal.vinculado_en))) return false;
  // El «/start <código>» con que se unió el chat no es un comando.
  return typeof m.texto === 'string' && m.texto.startsWith('/') && !/^\/start(?:@\S+)?\s+\d/i.test(m.texto);
}

export function crearBot({ db, config, reloj = Date.now, adaptador = ADAPTADORES.telegram, topes = {} } = {}) {
  const T = { ...TOPES_BOT, ...topes };
  let temporizador = null;
  let enMarcha = null;
  let parado = false;

  // Lo que contesta a un comando. → { texto } o { contratos: { lista, ... } }
  function respuesta(cmd, idioma, ahora) {
    if (cmd.comando === 'resumen') return { texto: textoResumen(db, idioma, ahora) };
    if (cmd.comando === 'gastos') return { texto: textoGastos(db, idioma, ahora) };
    if (cmd.comando === 'pagos') return { texto: textoPagos(db, idioma, ahora) };
    if (cmd.comando === 'alumno') return { texto: textoAlumno(db, idioma, cmd.arg, ahora) };
    if (cmd.comando === 'contratos') {
      if (!cmd.arg) return { texto: [tituloHtml('📄', frase(idioma, 'bot.contratos.titulo')), escaparHtml(frase(idioma, 'bot.contratos.como'))].join('\n') };
      const c = contratosParaMandar(db, cmd.arg);
      if (c.error) return { texto: [tituloHtml('⚠️', frase(idioma, 'bot.alumno.no')), escaparHtml(frase(idioma, 'bot.alumno.como'))].join('\n') };
      if (!c.lista.length) return { texto: [tituloHtml('📄', frase(idioma, 'bot.contratos.titulo')), escaparHtml(frase(idioma, 'bot.contratos.ninguno'))].join('\n') };
      return { contratos: c };
    }
    return { texto: textoAyuda(idioma) };
  }

  async function contestar(canal, m, ahora) {
    if (enviadosDe(db, canal.id, 'comando', ahora - HORA, ahora) >= T.respuestasPorHora) return 'tope';
    const idioma = idiomaDelDueno(db);
    const r = respuesta(leerComando(m.texto) ?? { comando: 'ayuda', arg: '' }, idioma, ahora);
    if (r.texto) return (await mandarAlDueno(db, config, { canal, adaptador, texto: r.texto, clase: 'comando', reloj })).motivo;
    const aviso = [tituloHtml('📄', frase(idioma, 'bot.contratos.titulo')), escaparHtml(frase(idioma, 'bot.contratos.van', { n: r.contratos.lista.length, total: r.contratos.total }))].join('\n');
    const a = await mandarAlDueno(db, config, { canal, adaptador, texto: aviso, clase: 'comando', reloj });
    if (a.motivo !== 'ok') return a.motivo;
    await esperar(T.pausaArchivosMs);
    return (await mandarContratos(db, config, { lista: r.contratos.lista, adaptador, reloj, topes: T })).motivo;
  }

  // Un contrato recién firmado que espera (uno por pasada; el más viejo primero).
  async function mandarPendiente(ahora) {
    // Solo las que esperan (las enviadas y vencidas quedan para siempre, pero nunca ocupan la ventana).
    const filas = db.prepare(`SELECT clave, valor FROM ajustes WHERE clave LIKE ? AND json_valid(valor)
      AND json_extract(valor, '$.enviadoEn') IS NULL AND json_extract(valor, '$.vencido') IS NULL ORDER BY actualizado_en, clave LIMIT 50`).all(`${PREFIJO_PENDIENTE}%`);
    for (const f of filas) {
      let v = null;
      try { v = JSON.parse(f.valor); } catch { v = null; }
      if (!v || v.enviadoEn || v.vencido) continue;
      if (ahora - Date.parse(v.en) > T.pendienteMs) { guardar(db, f.clave, { ...v, vencido: true }, ahora); continue; }
      const r = await mandarContratos(db, config, { lista: [{ usuarioId: v.usuarioId, n: v.n }], adaptador, reloj, topes: T });
      if (r.motivo === 'ok') guardar(db, f.clave, { ...v, enviadoEn: iso(reloj()) }, reloj());
      else if (r.motivo === 'no_existe') guardar(db, f.clave, { ...v, vencido: true, motivo: 'no_existe' }, reloj());
      else guardar(db, f.clave, { ...v, intentos: (Number(v.intentos) || 0) + 1, ultimo: r.motivo }, reloj());
      return r.motivo === 'ok' ? 'contrato' : null;
    }
    return null;
  }

  async function pasadaDeVerdad() {
    const ahora = reloj();
    const l = listo(db, config, ahora);
    if (!l.si) return { hecho: null, motivo: l.motivo };
    const canal = l.canal;
    const mandado = await mandarPendiente(ahora);
    // Mientras se une un chat, el código del dueño llega por getUpdates: no se lee nada aquí.
    const p = canalPendiente(db, ahora);
    const c = canalPorConfirmar(db, ahora);
    if ((p && !p.vencido) || (c && !c.vencido)) return { hecho: mandado, motivo: 'uniendo' };
    const cursor = leer(db, CLAVE_CURSOR);
    const fresco = en => ahora - Date.parse(en) < T.cursorMs && Date.parse(en) <= ahora + MARGEN_RELOJ_MS;
    // Sin cursor (o vencido): desde lo que leyó la unión del chat, si fue hace poco; si no, sin cursor (y por la fecha).
    const desde = cursor && Number.isSafeInteger(cursor.desde) && fresco(cursor.en) ? cursor.desde
      : Number.isSafeInteger(canal.novedades_desde) && canal.vinculado_en && fresco(canal.vinculado_en) && !(cursor && fresco(cursor.en)) ? canal.novedades_desde : null;
    const lote = await conCredencial(db, config, { uso: USO, secretoId: canal.secreto_id }, cred => adaptador.recibir(cred, { desde, limite: 10 }));
    if (lote.motivo !== 'ok') return { hecho: mandado, motivo: lote.motivo };
    // El cursor avanza ANTES de contestar: un comando nunca se contesta dos veces.
    if (lote.siguiente != null) guardar(db, CLAVE_CURSOR, { desde: lote.siguiente, en: iso(reloj()) }, reloj());
    const momento = reloj();
    const mios = (lote.mensajes ?? []).filter(m => esDelDueno(m, canal, { ahora: momento, frescuraMs: T.frescuraMs }));
    let contestados = 0;
    for (const m of mios.slice(0, 3)) {
      const motivo = await contestar(canal, m, reloj());
      if (motivo === 'ok') contestados += 1;
      else break;
    }
    return { hecho: contestados ? 'comando' : mandado, contestados, ignorados: (lote.mensajes ?? []).length - mios.length };
  }

  async function pasada() {
    if (enMarcha) return enMarcha;
    enMarcha = (async () => {
      try { return await pasadaDeVerdad(); } catch { return { hecho: null, motivo: 'error' }; } finally { enMarcha = null; }
    })();
    return enMarcha;
  }

  return {
    pasada,
    iniciar() {
      if (temporizador || parado) return;
      temporizador = setInterval(() => { pasada(); }, T.cadaMs);
      temporizador.unref?.();
    },
    async parar() {
      parado = true;
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
      if (enMarcha) await Promise.race([enMarcha, new Promise(listo => setTimeout(listo, 3000).unref?.())]);
    },
  };
}
