// Recuperar una copia cifrada de OPORTIA (fase 1, parte e) en un archivo NUEVO. La parte 1f pone la pantalla y el
// instalador encima de esto; mientras tanto, Claude lo usa desde la Consola del servidor.
//
// Uso (como el usuario «jarvis», nunca como root):
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --archivos=<carpeta> --destino=<archivo nuevo>
//   sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --telegram --destino=<archivo nuevo>
//   Opciones:
//     --comprobar   descifra y revisa todo, sin escribir la base (solo guarda las partes cifradas que baja)
//     --anterior    si a la copia más nueva le faltan partes, usar la más nueva COMPLETA (igual pregunta)
//     --trabajo=<carpeta>  dónde se guardan las partes que baja de Telegram (por defecto, junto al destino)
//     --json        la última línea es el resultado en JSON
//
// La clave de recuperación (y el token del bot, con --telegram) se escriben cuando los pide, sin que se vean en la
// pantalla. NUNCA van en la línea de la orden (cualquiera los vería con «ps») ni en variables del entorno.
// Con --telegram muestra un código de 8 cifras: escríbeselo a tu bot desde tu chat privado. Los mensajes de otras
// personas al bot se ignoran. Después pregunta si el chat que encontró es el tuyo.
// Una copia de hace más de 30 horas, o si hay una más nueva, nunca se abre sin un «sí» tuyo.
//
// Nunca pisa un archivo: si el destino ya existe, no hace nada. Nunca toca el archivo de la llave de las claves: después
// de recuperar, pega otra vez tus claves (las de la IA y el token del bot) en Administrador → Claves.
//
// Códigos de salida: 0 bien · 2 uso · 3 clave · 4 copia incompleta, dañada o no auténtica · 5 el destino existe ·
// 6 Telegram o la red · 7 formato nuevo (usa una versión más nueva de OPORTIA) · 8 cancelada por el dueño.
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { configDeCanales } from '../src/nucleo/config.js';
import { restaurarCopia, empezarBusquedaDeChat } from '../src/copias/restaurar.js';
import { ErrorCopias } from '../src/copias/formato.js';

export const SALIDAS = Object.freeze({ ok: 0, uso: 2, clave: 3, copia: 4, destino: 5, telegram: 6, formato: 7, cancelada: 8 });
const DE_ERROR = Object.freeze({
  clave_formato: 'clave', clave_control: 'clave', clave_no_es_de_esta_copia: 'clave',
  destino_existe: 'destino',
  telegram: 'telegram', sin_red: 'telegram', codigo_vencido: 'telegram', otro_bot: 'telegram',
  formato_nuevo: 'formato',
  cancelada_por_dueno: 'cancelada', cancelada: 'cancelada',
});
const TEXTO_ERROR = Object.freeze({
  clave_formato: 'Esa no es una clave válida: revisa letra por letra (la O y el 0 valen igual).',
  clave_control: 'La clave tiene un error: revisa letra por letra.',
  clave_no_es_de_esta_copia: 'Esa clave no abre esta copia (quizás es de una clave anterior).',
  destino_existe: 'El archivo de destino ya existe: no se tocó. Elige otro nombre.',
  sin_indice: 'No encontré el índice de la copia. Reenvíale a tu bot el mensaje del índice, o usa --archivos.',
  indice_no_autentico: 'El índice no es de tu clave: no se usa.',
  indice_danado: 'El índice está dañado.',
  otro_bot: 'Esa copia se mandó con otro bot: usa el token de ese bot.',
  falta_parte: 'Le falta una parte a la copia más nueva (prueba con --anterior).',
  parte_danada: 'Una parte está dañada.',
  parte_de_otra_copia: 'Una parte es de otra copia.',
  copia_cortada: 'La copia está cortada (le falta el final).',
  copia_danada: 'La copia está dañada.',
  copia_no_autentica: 'La copia no es auténtica: no se abrió.',
  volcado_danado: 'Lo que hay adentro de la copia está dañado.',
  volcado_no_soportado: 'La copia tiene algo que esta versión no sabe abrir.',
  formato_nuevo: 'Usa una versión más nueva de OPORTIA para abrir esta copia: no está dañada.',
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
function crearLector(entrada = process.stdin, salida = process.stdout) {
  let pendiente = '';
  const lineas = [];
  const esperando = [];
  let fin = false;
  const entregar = () => {
    while (esperando.length && (lineas.length || fin)) esperando.shift()(lineas.length ? lineas.shift() : null);
  };
  entrada.setEncoding?.('utf8');
  entrada.on('data', pedazo => {
    pendiente += pedazo;
    let i;
    while ((i = pendiente.search(/\r?\n|\r/)) >= 0) {
      lineas.push(pendiente.slice(0, i));
      pendiente = pendiente.slice(i + (pendiente[i] === '\r' && pendiente[i + 1] === '\n' ? 2 : 1));
    }
    entregar();
  });
  entrada.on('end', () => { if (pendiente) lineas.push(pendiente); pendiente = ''; fin = true; entregar(); });
  entrada.on('error', () => { fin = true; entregar(); });
  return {
    async preguntar(texto, { oculto = false } = {}) {
      salida.write(texto);
      const tty = oculto && entrada.isTTY && typeof entrada.setRawMode === 'function';
      if (tty) entrada.setRawMode(true);
      try {
        if (!tty) return await new Promise(listo => { esperando.push(listo); entregar(); });
        return await new Promise(listo => {
          let escrito = '';
          const alTecla = tecla => {
            for (const c of String(tecla)) {
              if (c === '\r' || c === '\n') { entrada.off('data', alTecla); salida.write('\n'); listo(escrito); return; }
              if (c === '\u0003') { entrada.off('data', alTecla); listo(null); return; }
              if (c === '\u007f' || c === '\b') escrito = escrito.slice(0, -1);
              else escrito += c;
            }
          };
          entrada.removeAllListeners('data');
          entrada.on('data', alTecla);
        });
      } finally {
        if (tty) entrada.setRawMode(false);
      }
    },
    cerrar() { try { entrada.pause?.(); entrada.destroy?.(); } catch { /* ya cerrada */ } },
  };
}

const si = texto => /^\s*(s[ií]|si|yes|y|s)\s*$/i.test(String(texto ?? ''));

function leerOpciones(argv) {
  const o = { archivos: null, telegram: false, destino: null, comprobar: false, anterior: false, json: false, trabajo: null, error: null };
  for (const a of argv) {
    let m;
    if ((m = /^--archivos=(.+)$/.exec(a))) o.archivos = m[1];
    else if (a === '--telegram') o.telegram = true;
    else if ((m = /^--destino=(.+)$/.exec(a))) o.destino = m[1];
    else if ((m = /^--trabajo=(.+)$/.exec(a))) o.trabajo = m[1];
    else if (a === '--comprobar') o.comprobar = true;
    else if (a === '--anterior') o.anterior = true;
    else if (a === '--json') o.json = true;
    else if (/^--(?:clave|token|key)\b/i.test(a)) o.error = 'La clave y el token NUNCA van en la orden (cualquiera los vería). Escríbelos cuando te los pida.';
    else o.error = `Opción no válida: ${a.startsWith('--') ? a.split('=')[0] : 'un texto suelto'}.`;
  }
  if (!o.error && Boolean(o.archivos) === o.telegram) o.error = 'Usa --archivos=<carpeta> o --telegram (uno de los dos).';
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
      const token = await lector.preguntar('Pega el token de tu bot (no se muestra): ', { oculto: true });
      if (!token) throw new ErrorCopias('cancelada_por_dueno');
      const busqueda = await empezarBusquedaDeChat({ token, base });
      decir(`Escríbele a tu bot (@${busqueda.bot?.usuario ?? 'tu bot'}) este código: ${busqueda.paraMostrar}`);
      decir('Esperando tu mensaje (10 minutos)…');
      const chat = await busqueda.esperar({});
      const respuesta = await lector.preguntar(`Encontré el chat de ${chat.nombre ?? 'alguien'}. ¿Es el tuyo? (sí/no): `);
      if (!si(respuesta)) throw new ErrorCopias('cancelada_por_dueno');
      fuente = { tipo: 'telegram', token, chatId: chat.chatId, indiceArchivoId: null };
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
        decir(`Copia del ${fechaRd(e.creada)} (${haceTexto(e.edadHoras)}).`);
        if (e.hayMasNueva) decir(`⚠ Hay una copia más nueva (del ${fechaRd(e.hayMasNueva.creada)}) que no está completa.`);
        if (e.antigua) decir(`⚠ Esta copia es de ${haceTexto(e.edadHoras)}.`);
        if (!e.antigua && !e.hayMasNueva) return true;
        return si(await lector.preguntar('¿Es esa la que quieres? (sí/no): '));
      },
      alAvanzar: a => { if (a?.paso === 'partes_listas') decir(`Partes: ${a.partes} de ${a.partes}, todas bien.`); },
    });
    decir(`La clave corresponde (${resultado.receptor}).`);
    if (destino) decir(`Base recuperada: ${megas(resultado.bytes)}, ${resultado.tablas} tablas, revisada: bien. Está en ${basename(destino)} (en ${dirname(destino)}).`);
    else decir(`Copia comprobada: ${megas(resultado.bytes)}, ${resultado.tablas} tablas, todo bien. No se escribió ninguna base.`);
    const pegar = [...(resultado.claves?.deIa ?? []).map(u => (u === 'ia_anthropic' ? 'clave de Claude' : u === 'ia_openai' ? 'clave de ChatGPT' : u)), ...(resultado.claves?.telegram ? ['token del bot'] : [])];
    if (pegar.length) decir(`Tienes que pegar otra vez: ${pegar.join(', ')} (por seguridad nunca viajan en las copias).`);
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

principal().then(codigo => { process.exitCode = codigo; }).catch(error => {
  process.stderr.write(`No se pudo completar (${error?.name ?? 'error'}).\n`);
  process.exitCode = 1;
});
