// Recuperar una copia cifrada de OPORTIA (fase 1, parte e) en un archivo NUEVO. La parte 1f pone la pantalla y el
// instalador encima de esto; mientras tanto, Claude lo usa desde la Consola del servidor.
//
// Uso (como el usuario «jarvis», nunca como root):
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --archivos=<carpeta> --destino=<archivo nuevo>
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --telegram --destino=<archivo nuevo>
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --telegram --indice=<archivo> --destino=<archivo nuevo>
//   Opciones:
//     --indice=<archivo>  con --telegram: el índice («…-indice.txt») que guardaste de tu chat; las partes se bajan con
//                   tu bot. Sirve cuando la copia fijada en el chat no es la última (no hace falta el código del chat).
//     --comprobar   descifra y revisa todo, sin escribir la base (solo guarda las partes cifradas que baja)
//     --anterior    si a la copia más nueva le faltan partes o tiene una dañada, usar la más nueva BUENA (igual pregunta)
//     --trabajo=<carpeta>  dónde se guardan las partes que baja de Telegram (por defecto, junto al destino)
//     --json        la última línea es el resultado en JSON
//
// La clave de recuperación (y el token del bot, con --telegram) se escriben cuando los pide, sin que se vean en la
// pantalla. NUNCA van en la línea de la orden (cualquiera los vería con «ps») ni en variables del entorno.
// Con --telegram muestra un código de 8 cifras: escríbeselo a tu bot desde tu chat privado. Los mensajes de otras
// personas al bot se ignoran. Después pregunta si el chat que encontró es el tuyo.
// Una copia de hace más de 30 horas, si hay una más nueva, si la copia fijada en el chat es de hace más de 26 horas, si su
// fecha es del futuro (reloj adelantado) o si hay otra copia que también parece la última, nunca se abre sin un «sí» tuyo.
// Después de restaurar desde Telegram: revoca el token del bot en @BotFather (/revoke) y pega el nuevo en Claves, así
// un servidor viejo que siga vivo ya no puede mandar copias a tu chat.
//
// Nunca pisa un archivo: si el destino ya existe, no hace nada. Nunca toca el archivo de la llave de las claves: después
// de recuperar, pega otra vez tus claves (las de la IA y el token del bot) en Administrador → Claves.
//
// Códigos de salida: 0 bien · 2 uso · 3 clave · 4 copia incompleta, dañada o no auténtica · 5 el destino existe ·
// 6 Telegram o la red · 7 formato nuevo (usa una versión más nueva de OPORTIA) · 8 cancelada por el dueño.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { configDeCanales } from '../src/nucleo/config.js';
import { restaurarCopia, empezarBusquedaDeChat } from '../src/copias/restaurar.js';
import { ErrorCopias } from '../src/copias/formato.js';

export const SALIDAS = Object.freeze({ ok: 0, uso: 2, clave: 3, copia: 4, destino: 5, telegram: 6, formato: 7, cancelada: 8 });
const DE_ERROR = Object.freeze({
  clave_formato: 'clave', clave_control: 'clave', clave_no_es_de_esta_copia: 'clave',
  destino_existe: 'destino',
  demasiados_archivos: 'uso',
  telegram: 'telegram', sin_red: 'telegram', codigo_vencido: 'telegram', otro_bot: 'telegram',
  formato_nuevo: 'formato',
  cancelada_por_dueno: 'cancelada', cancelada: 'cancelada',
});
const TEXTO_ERROR = Object.freeze({
  clave_formato: 'Esa no es una clave válida: revisa letra por letra (la O y el 0 valen igual).',
  clave_control: 'La clave tiene un error: revisa letra por letra.',
  clave_no_es_de_esta_copia: 'Esa clave no abre esta copia (quizás es de una clave anterior).',
  destino_existe: 'El archivo de destino ya existe: no se tocó. Elige otro nombre.',
  sin_indice: 'No encontré un índice que sirva. Guarda de tu chat el archivo «…-indice.txt» más nuevo y usa --indice=<ese archivo>, o guarda todos los archivos de una noche y usa --archivos.',
  indice_no_autentico: 'El índice no es de tu clave (o alguien lo cambió): no se usa. Quita ese archivo de la carpeta, o usa otro índice con --indice.',
  indice_danado: 'El índice está dañado. Usa otro índice con --indice, o --archivos con las partes.',
  demasiados_archivos: 'Hay demasiados archivos en esa carpeta. Usa la carpeta de un solo mes (por ejemplo …/oportia-copias/cifradas/2027-12).',
  otro_bot: 'Esa copia se mandó con otro bot: usa el token de ese bot.',
  falta_parte: 'Le falta una parte a la copia más nueva (prueba con --anterior).',
  parte_danada: 'Una parte está dañada y no hay otra igual buena (prueba con --anterior para usar la copia de antes).',
  parte_de_otra_copia: 'Una parte es de otra copia.',
  copia_cortada: 'La copia está cortada: le falta el final (prueba con --anterior para usar la copia de antes).',
  copia_danada: 'La copia está dañada.',
  copia_no_autentica: 'La copia no es auténtica: no se abrió.',
  volcado_danado: 'Lo que hay adentro de la copia está dañado.',
  volcado_no_soportado: 'La copia tiene algo que esta versión no sabe abrir.',
  formato_nuevo: 'Esta copia es de un formato más nuevo: usa una versión más nueva de OPORTIA. Si nunca actualizaste OPORTIA, puede ser un archivo que puso otra persona: usa --indice o --archivos con los archivos de tu chat.',
  telegram: 'Telegram no dejó seguir (revisa el token del bot).',
  sin_red: 'No hay conexión con Telegram. Prueba otra vez en un momento.',
  codigo_vencido: 'El código venció. Vuelve a empezar.',
  cancelada_por_dueno: 'Cancelado: no se escribió nada.',
  cancelada: 'Cancelado.',
  base_no_valida: 'La base recuperada no pasó la revisión: no se marcó como de OPORTIA.',
});

const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaRd(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso ?? '');
  const d = new Date(ms - 4 * 3_600_000);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${meses[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
const haceTexto = horas => (horas < 1 ? 'hace menos de una hora' : horas < 48 ? `hace ${Math.round(horas)} horas` : `hace ${Math.round(horas / 24)} días`);
const megas = bytes => `${Math.max(1, Math.round((Number(bytes) || 0) / (1024 * 1024)))} MB`;

// Lee la entrada línea por línea (las respuestas, la clave y el token). En una terminal, lo oculto no se muestra.
// UN solo lector para todo el programa (ronda 2: antes, una pregunta oculta quitaba el lector y la siguiente pregunta
// se quedaba esperando para siempre). En una terminal en modo crudo cada tecla llega sola: el mismo lector la junta; en
// lo oculto no la repite en la pantalla, en lo visible sí. Lo que llega después del Enter queda para la próxima pregunta.
export function crearLector(entrada = process.stdin, salida = process.stdout) {
  let pendiente = '';
  const lineas = [];
  const esperando = [];
  let fin = false;
  let crudo = null; // { oculto } mientras una pregunta usa el modo crudo de la terminal
  const entregar = () => {
    while (esperando.length && (lineas.length || fin)) esperando.shift()(lineas.length ? lineas.shift() : null);
  };
  const alDato = pedazo => {
    const texto = String(pedazo);
    if (!crudo) {
      pendiente += texto;
      let i;
      while ((i = pendiente.search(/\r?\n|\r/)) >= 0) {
        lineas.push(pendiente.slice(0, i));
        pendiente = pendiente.slice(i + (pendiente[i] === '\r' && pendiente[i + 1] === '\n' ? 2 : 1));
      }
      entregar();
      return;
    }
    // Modo crudo: tecla por tecla (Enter, Ctrl+C, borrar). Lo que sigue al Enter se guarda para después.
    for (let k = 0; k < texto.length; k++) {
      const c = texto[k];
      if (c === '\r' || c === '\n') {
        const linea = pendiente;
        pendiente = '';
        let resto = texto.slice(k + 1);
        if (c === '\r' && resto[0] === '\n') resto = resto.slice(1);
        salida.write('\n');
        lineas.push(linea);
        crudo = null;
        entregar();
        if (resto) alDato(resto);
        return;
      }
      if (c === '\u0003') { pendiente = ''; crudo = null; fin = true; salida.write('\n'); entregar(); return; }
      if (c === '\u007f' || c === '\b') {
        if (pendiente) { pendiente = pendiente.slice(0, -1); if (!crudo.oculto) salida.write('\b \b'); }
        continue;
      }
      if (c < ' ') continue; // otras teclas de control (flechas…): nada
      pendiente += c;
      if (!crudo.oculto) salida.write(c);
    }
  };
  entrada.setEncoding?.('utf8');
  entrada.on('data', alDato);
  entrada.on('end', () => { if (pendiente) lineas.push(pendiente); pendiente = ''; fin = true; entregar(); });
  entrada.on('error', () => { fin = true; entregar(); });
  return {
    async preguntar(texto, { oculto = false } = {}) {
      if (lineas.length || fin) {
        salida.write(texto);
        return new Promise(listo => { esperando.push(listo); entregar(); });
      }
      const tty = entrada.isTTY && typeof entrada.setRawMode === 'function';
      // En una terminal, lo oculto va en modo crudo (sin eco), puesto ANTES de mostrar la pregunta: así nada de lo que se
      // escriba después de verla sale en la pantalla. Lo visible, con la línea normal de la terminal.
      if (tty && oculto) { entrada.setRawMode(true); crudo = { oculto: true }; }
      salida.write(texto);
      try {
        return await new Promise(listo => { esperando.push(listo); entregar(); });
      } finally {
        crudo = null;
        if (tty && oculto) entrada.setRawMode(false);
      }
    },
    cerrar() { try { entrada.off?.('data', alDato); entrada.pause?.(); entrada.destroy?.(); } catch { /* ya cerrada */ } },
  };
}

const si = texto => /^\s*(s[ií]|si|yes|y|s)\s*$/i.test(String(texto ?? ''));

function leerOpciones(argv) {
  const o = { archivos: null, telegram: false, indice: null, destino: null, comprobar: false, anterior: false, json: false, trabajo: null, error: null };
  for (const a of argv) {
    let m;
    if ((m = /^--archivos=(.+)$/.exec(a))) o.archivos = m[1];
    else if (a === '--telegram') o.telegram = true;
    else if ((m = /^--indice=(.+)$/.exec(a))) o.indice = m[1];
    else if ((m = /^--destino=(.+)$/.exec(a))) o.destino = m[1];
    else if ((m = /^--trabajo=(.+)$/.exec(a))) o.trabajo = m[1];
    else if (a === '--comprobar') o.comprobar = true;
    else if (a === '--anterior') o.anterior = true;
    else if (a === '--json') o.json = true;
    else if (/^--(?:clave|token|key)\b/i.test(a)) o.error = 'La clave y el token NUNCA van en la orden (cualquiera los vería). Escríbelos cuando te los pida.';
    else o.error = `Opción no válida: ${a.startsWith('--') ? a.split('=')[0] : 'un texto suelto'}.`;
  }
  if (!o.error && Boolean(o.archivos) === o.telegram) o.error = 'Usa --archivos=<carpeta> o --telegram (uno de los dos).';
  if (!o.error && o.indice && !o.telegram) o.error = '--indice va con --telegram (con --archivos, pon el índice dentro de la carpeta).';
  if (!o.error && !o.comprobar && !o.destino) o.error = 'Falta --destino=<archivo nuevo> (o usa --comprobar para solo revisar).';
  if (!o.error && o.comprobar && o.destino) o.error = 'Con --comprobar no se escribe ninguna base: quita --destino.';
  return o;
}

export async function principal({ argv = process.argv.slice(2), entrada = process.stdin, salida = process.stdout, errores = process.stderr } = {}) {
  process.umask(0o027);
  const config = configDeCanales();
  const decir = texto => salida.write(`${texto}\n`);
  if (process.getuid?.() === 0 && !config.modoPrueba) {
    errores.write('No lo ejecutes como root. Usa: sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs …\n');
    return SALIDAS.uso;
  }
  const o = leerOpciones(argv);
  if (o.error) {
    errores.write(`${o.error}\n`);
    return SALIDAS.uso;
  }
  const destino = o.destino ? resolve(o.destino) : null;
  if (destino && (existsSync(destino) || existsSync(`${destino}-wal`))) {
    errores.write(`${TEXTO_ERROR.destino_existe}\n`);
    return SALIDAS.destino;
  }
  const lector = crearLector(entrada, salida);
  let resultado = null;
  let codigo = SALIDAS.ok;
  try {
    let fuente;
    let carpetaTrabajo = o.trabajo ? resolve(o.trabajo) : null;
    const base = config.canalesBases?.telegram ?? null;
    if (o.telegram) {
      // Con --indice: el índice que el dueño guardó de su chat (pequeño: como mucho 1 MB). Las partes se bajan por su id.
      let indiceTexto = null;
      if (o.indice) {
        const ruta = resolve(o.indice);
        let tam = -1;
        try { tam = statSync(ruta).size; } catch { tam = -1; }
        if (tam < 0) throw new ErrorCopias('sin_indice');
        if (tam > 1_000_000) throw new ErrorCopias('indice_danado');
        indiceTexto = readFileSync(ruta, 'utf8');
      }
      const token = await lector.preguntar('Pega el token de tu bot (no se muestra): ', { oculto: true });
      if (!token) throw new ErrorCopias('cancelada_por_dueno');
      if (indiceTexto != null) {
        fuente = { tipo: 'telegram', token, chatId: null, indiceTexto };
      } else {
        const busqueda = await empezarBusquedaDeChat({ token, base });
        decir(`Escríbele a tu bot (@${busqueda.bot?.usuario ?? 'tu bot'}) este código: ${busqueda.paraMostrar}`);
        decir('Esperando tu mensaje (10 minutos)…');
        const chat = await busqueda.esperar({});
        const respuesta = await lector.preguntar(`Encontré el chat de ${chat.nombre ?? 'alguien'}. ¿Es el tuyo? (sí/no): `);
        if (!si(respuesta)) throw new ErrorCopias('cancelada_por_dueno');
        fuente = { tipo: 'telegram', token, chatId: chat.chatId, indiceArchivoId: null };
      }
      if (!carpetaTrabajo) carpetaTrabajo = destino ? `${destino}-partes` : mkdtempSync(join(tmpdir(), 'oportia-restaurar-'));
      mkdirSync(carpetaTrabajo, { recursive: true, mode: 0o750 });
    } else {
      fuente = { tipo: 'archivos', archivos: [resolve(o.archivos)] };
    }
    const clave = await lector.preguntar('Escribe tu clave de recuperación (no se muestra): ', { oculto: true });
    if (!clave) throw new ErrorCopias('cancelada_por_dueno');
    resultado = await restaurarCopia({
      clave, fuente, destino, carpetaTrabajo, aceptarAnterior: o.anterior, base,
      alElegir: async e => {
        decir(e.futura
          ? `Copia del ${fechaRd(e.creada)}: esa fecha es del FUTURO (el reloj del servidor que la hizo iba adelantado).`
          : `Copia del ${fechaRd(e.creada)} (${haceTexto(e.edadHoras)}).`);
        if (e.servidor) decir(`  La hizo el servidor «${String(e.servidor).slice(0, 8)}».`);
        if (e.hayMasNueva) decir(`⚠ Hay una copia más nueva (del ${fechaRd(e.hayMasNueva.creada)}) que no está completa.`);
        if (e.antigua) decir(`⚠ Esta copia es de ${haceTexto(e.edadHoras)}.`);
        if (e.fijadaVieja) {
          decir(`⚠ La copia fijada en tu chat es de ${haceTexto(e.edadHoras)}: quizás la de la última noche no quedó fijada.`);
          decir('  Si en tu chat ves un archivo «…-indice.txt» más nuevo, guárdalo, di «no» y usa --indice=<ese archivo>.');
        }
        if (e.otraCandidata) {
          const o = e.otraCandidata;
          decir(o.motivo === 'otra_punta'
            ? `⚠ Hay OTRA copia que también parece la última: del ${fechaRd(o.creada)}, hecha por el servidor «${String(o.servidor ?? '?').slice(0, 8)}». Quizás dos servidores mandaron copias con el mismo bot.`
            : `⚠ Hay otra copia con fecha del ${fechaRd(o.creada)}${o.futura ? ' (fecha del futuro: reloj adelantado)' : ''}. Revisa cuál tiene tus datos más nuevos.`);
          decir('  Si quieres la otra, di «no» y deja en la carpeta solo los archivos de esa noche (o usa --indice=<su índice>).');
        }
        if (!e.antigua && !e.hayMasNueva && !e.fijadaVieja && !e.futura && !e.otraCandidata) return true;
        return si(await lector.preguntar('¿Es esa la que quieres? (sí/no): '));
      },
      alAvanzar: a => { if (a?.paso === 'partes_listas') decir(`Partes: ${a.partes} de ${a.partes}, todas bien.`); },
    });
    decir(`La clave corresponde (${resultado.receptor}).`);
    if (destino) decir(`Base recuperada: ${megas(resultado.bytes)}, ${resultado.tablas} tablas, revisada: bien. Está en ${basename(destino)} (en ${dirname(destino)}).`);
    else decir(`Copia comprobada: ${megas(resultado.bytes)}, ${resultado.tablas} tablas, todo bien. No se escribió ninguna base.`);
    const pegar = [...(resultado.claves?.deIa ?? []).map(u => (u === 'ia_anthropic' ? 'clave de Claude' : u === 'ia_openai' ? 'clave de ChatGPT' : u)), ...(resultado.claves?.telegram ? ['token del bot'] : [])];
    if (pegar.length) decir(`Tienes que pegar otra vez: ${pegar.join(', ')} (por seguridad nunca viajan en las copias).`);
    if (o.telegram || resultado.claves?.telegram) {
      // Ronda 2: si el servidor viejo sigue vivo (o vuelve de una foto del droplet), seguiría mandando sus copias viejas
      // a tu chat con el mismo bot, y una próxima restauración podría tomar esas. Revocar el token lo apaga.
      decir('IMPORTANTE: en Telegram, abre @BotFather, escribe /revoke y elige tu bot. Te da un token NUEVO: pégalo en');
      decir('  Administrador → Claves del servidor nuevo. Así el servidor viejo (si sigue vivo) ya no puede mandar copias.');
    }
  } catch (error) {
    const clave = error instanceof ErrorCopias ? error.clave : 'error';
    codigo = SALIDAS[DE_ERROR[clave] ?? (error instanceof ErrorCopias ? 'copia' : 'copia')];
    errores.write(`${TEXTO_ERROR[clave] ?? 'No se pudo recuperar la copia.'} (${clave})\n`);
    resultado = { ok: false, error: clave };
  } finally {
    lector.cerrar();
  }
  if (o.json) {
    const r = resultado?.ok
      ? { ok: true, copia: resultado.copia, creada: resultado.creada, edadHoras: resultado.edadHoras, tablas: resultado.tablas, filas: resultado.filas, bytes: resultado.bytes, autentica: resultado.autentica, receptor: resultado.receptor, archivo: resultado.archivo, claves: resultado.claves }
      : resultado;
    decir(JSON.stringify(r));
  }
  return codigo;
}

// Corre solo cuando es el programa (las pruebas importan crearLector sin correrlo).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().then(codigo => { process.exitCode = codigo; }).catch(error => {
    process.stderr.write(`No se pudo completar (${error?.name ?? 'error'}).\n`);
    process.exitCode = 1;
  });
}
