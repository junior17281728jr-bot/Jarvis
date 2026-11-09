// Formato de las copias cifradas de OPORTIA, versión 1 (fase 1, parte e). CONGELADO: un cambio es un número de
// formato nuevo, nunca una edición (test/copia-v1.json es una copia hecha una vez que debe abrirse para siempre).
// Capas: volcado (src/copias/volcado.js) → gzip → flujo cifrado (src/copias/cifrar.js) → PARTES (este archivo) + un
// ÍNDICE firmado (este archivo).
//  - Cada parte se describe sola (cabecera de 74 bytes): Telegram puede cambiar el nombre de un archivo, y una copia
//    guardada a mano desde Telegram Desktop se arma con cualquier nombre y en cualquier orden.
//  - Telegram: un bot sube hasta 50 MB por archivo y BAJA hasta 20 MB. Las partes son de 2 MiB: se pueden
//    bajar otra vez para comprobarlas y para restaurar. El formato acepta cualquier tamaño hasta 20 MB.
//  - El índice no lleva datos de nadie: fechas, tamaños, hashes e identificadores. Su firma (HMAC con el «sello», que
//    sale de la clave de recuperación) impide que alguien con el token del bot meta una copia falsa.
//  - rutaSegura(ruta) es la ÚNICA puerta de src/copias/ hacia un archivo: nunca deja abrir la llave de las claves
//    (src/claves/cifrado.js, esArchivoDeLlave) — esa llave nunca va a ninguna copia (test/reglas.test.js).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { esArchivoDeLlave } from '../claves/cifrado.js';

export const FORMATO = 1;
export const MAGIA_FLUJO = 'OPCFLUJO';
export const MAGIA_PARTE = 'OPCPARTE';
export const TROZO = 65_536;                        // bytes de gzip por registro cifrado
// Carga de cada parte: 2 MiB (las pruebas pasan otro valor como parámetro). El diseño empezó con 4 MiB; la medida del
// paso 2 (test/medir-copia.mjs, base de 200 MB, trabajador de verdad) dio un pico de 115 MB con copia en el servidor y
// la salida del trabajador por memoria (120 MB) directo a Telegram: con 2 MiB el pico baja (decisión §6.6). El formato no
// cambia: quien lee acepta cualquier tamaño hasta 20 MB.
export const TAMANO_PARTE = 2 * 1024 * 1024;
export const CABECERA_PARTE = 74;
export const CABECERA_FLUJO_MAX = 4096;
export const PARTE_MAXIMA = 20_000_000;              // lo más que un bot puede bajar de Telegram
export const INDICE_MAXIMO = 1_000_000;
export const LINEA_MAX = 8 * 1024 * 1024;            // una línea del volcado nunca es más larga
export const SELLO_INDICE = 'OPORTIA-SELLO-1';
// En «ajustes»: el id de este servidor (va en cada copia) y los ids que tuvo antes (tras restaurar, el viejo queda aquí).
export const CLAVE_SERVIDOR = 'servidor.id';
export const CLAVE_ORIGENES = 'servidor.origenes';

// Los estados de una fila de «copias» (el trabajador los usa desde el paso 2; una prueba revisa la lista).
export const ESTADOS_COPIA = Object.freeze(['haciendo', 'escrita', 'subida', 'verificada', 'solo_local', 'fallida', 'interrumpida', 'saltada']);
export const ORIGENES_COPIA = Object.freeze(['noche', 'manual']);

// Un error de las copias: solo un código corto (y datos seguros: números, la huella de una clave). Nunca la clave de
// recuperación, nunca un token, nunca un dato de la base.
export class ErrorCopias extends Error {
  constructor(clave, datos = {}) {
    super(String(clave));
    this.name = 'ErrorCopias';
    this.clave = String(clave);
    this.datos = datos;
  }
}

// La ÚNICA forma de nombrar un archivo para abrirlo desde src/copias/: nunca la llave de las claves.
export function rutaSegura(ruta) {
  const texto = String(ruta ?? '');
  if (!texto || esArchivoDeLlave(texto)) throw new ErrorCopias('archivo_de_llave');
  return texto;
}

export const sha256 = datos => createHash('sha256').update(datos).digest();
export const sha256Hex = datos => createHash('sha256').update(datos).digest('hex');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function esUuid(texto) { return typeof texto === 'string' && UUID.test(texto); }

export function uuidABytes(uuid) {
  if (!esUuid(uuid)) throw new ErrorCopias('copia_danada');
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

export function bytesAUuid(b) {
  const h = Buffer.from(b).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ---------- Partes ----------
//  0 8 magia · 8 2 formato · 10 16 copia · 26 4 n (desde 1) · 30 8 desde · 38 4 largo · 42 32 sha256(carga) · 74 carga
export function escribirCabeceraParte(destino, { copia, n, desde, largo, hashCarga }) {
  destino.write(MAGIA_PARTE, 0, 'latin1');
  destino.writeUInt16BE(FORMATO, 8);
  uuidABytes(copia).copy(destino, 10);
  destino.writeUInt32BE(n, 26);
  destino.writeBigUInt64BE(BigInt(desde), 30);
  destino.writeUInt32BE(largo, 38);
  Buffer.from(hashCarga).copy(destino, 42);
  return destino;
}

export function leerCabeceraParte(b) {
  if (!b || b.length < CABECERA_PARTE || b.toString('latin1', 0, 8) !== MAGIA_PARTE) throw new ErrorCopias('parte_danada');
  const formato = b.readUInt16BE(8);
  if (formato > FORMATO) throw new ErrorCopias('formato_nuevo', { formato });
  if (formato < 1) throw new ErrorCopias('parte_danada');
  const n = b.readUInt32BE(26);
  const desde = b.readBigUInt64BE(30);
  const largo = b.readUInt32BE(38);
  if (n < 1 || largo < 1 || largo > PARTE_MAXIMA || desde > BigInt(Number.MAX_SAFE_INTEGER)) throw new ErrorCopias('parte_danada', { n });
  return { formato, copia: bytesAUuid(b.subarray(10, 26)), n, desde: Number(desde), largo, hashCarga: Buffer.from(b.subarray(42, 74)) };
}

// Parte el flujo cifrado en partes. Usa UN solo búfer (tamanoParte + 74 bytes) para todas: alParte recibe una vista de
// ese búfer y debe terminar con ella (await) antes de que llegue la siguiente. asignar existe para que una prueba cuente
// cuántas veces se pide memoria (debe ser una).
//   alParte({ n, desde, largo, archivo /* cabecera + carga */, sha256 /* hex del archivo entero */ })
export function crearPartidor({ copia, tamanoParte = TAMANO_PARTE, alParte, asignar = largo => Buffer.allocUnsafe(largo) }) {
  if (!Number.isSafeInteger(tamanoParte) || tamanoParte < 1024 || tamanoParte > PARTE_MAXIMA - CABECERA_PARTE) throw new ErrorCopias('tamano_no_valido');
  uuidABytes(copia);
  const bufer = asignar(tamanoParte + CABECERA_PARTE);
  let lleno = 0;
  let n = 0;
  let desde = 0;
  const cerrarParte = async () => {
    n += 1;
    const carga = bufer.subarray(CABECERA_PARTE, CABECERA_PARTE + lleno);
    escribirCabeceraParte(bufer, { copia, n, desde, largo: lleno, hashCarga: sha256(carga) });
    const archivo = bufer.subarray(0, CABECERA_PARTE + lleno);
    const largo = lleno;
    await alParte({ n, desde, largo, archivo, sha256: sha256Hex(archivo) });
    desde += largo;
    lleno = 0;
  };
  return {
    async escribir(datos) {
      let i = 0;
      while (i < datos.length) {
        if (lleno === tamanoParte) await cerrarParte();
        const cuanto = Math.min(datos.length - i, tamanoParte - lleno);
        Buffer.from(datos.buffer, datos.byteOffset + i, cuanto).copy(bufer, CABECERA_PARTE + lleno);
        lleno += cuanto;
        i += cuanto;
      }
    },
    async terminar() {
      if (lleno > 0) await cerrarParte();
      return { partes: n, bytes: desde };
    },
    get partes() { return n; },
  };
}

// ---------- Nombres (hora de República Dominicana: UTC−4 todo el año) ----------
function enRd(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new ErrorCopias('fecha_no_valida');
  return new Date(ms - 4 * 3_600_000).toISOString();
}

function raizNombre(copia, creada) {
  const rd = enRd(creada);
  return `oportia-copia-${rd.slice(0, 4)}${rd.slice(5, 7)}${rd.slice(8, 10)}-${rd.slice(11, 13)}${rd.slice(14, 16)}-${String(copia).replace(/-/g, '').slice(0, 8)}`;
}

export const nombreParte = (copia, creada, n) => `${raizNombre(copia, creada)}-p${String(n).padStart(3, '0')}.opc`;
export const nombreIndice = (copia, creada) => `${raizNombre(copia, creada)}-indice.txt`;
// Una carpeta por mes (cifradas/AAAA-MM): ninguna carpeta crece sin fin.
export const carpetaDelMes = creada => enRd(creada).slice(0, 7);

// ---------- Índice ----------
// Línea 1: un JSON en una línea (sus bytes exactos se firman). Línea 2: OPORTIA-SELLO-1 <hex HMAC-SHA256(sello, línea 1)>.
export function armarIndice(d, sello) {
  const parte = p => ({
    n: p.n, nombre: p.nombre, bytes: p.bytes, sha256: p.sha256,
    telegram: p.telegram ? { mensaje: p.telegram.mensaje, archivo: p.telegram.archivo, unico: p.telegram.unico } : null,
  });
  const datos = {
    oportia: 'indice-copia', formato: FORMATO, copia: d.copia, creada: d.creada, servidor: d.servidor ?? null,
    version: d.version ?? null, migracion: d.migracion ?? null, receptor: d.receptor, publica: d.publica, bot: d.bot ?? null,
    anterior: d.anterior ? { copia: d.anterior.copia, creada: d.anterior.creada } : null,
    flujo: { bytes: d.flujo.bytes, sha256: d.flujo.sha256 },
    partes: d.partes.map(parte),
    sellado: d.sellado,
  };
  const linea = JSON.stringify(datos);
  const firma = createHmac('sha256', sello).update(linea, 'utf8').digest('hex');
  return `${linea}\n${SELLO_INDICE} ${firma}\n`;
}

// ¿Este texto parece un índice? (sin revisar la firma) → sus datos, o null.
export function pareceIndice(texto) {
  const linea = String(texto).split('\n', 1)[0];
  try {
    const d = JSON.parse(linea);
    return d && typeof d === 'object' && d.oportia === 'indice-copia' ? d : null;
  } catch {
    return null;
  }
}

// Lee un índice. Con sello: revisa la firma (indice_no_autentico). Siempre revisa la forma (indice_danado).
export function leerIndice(texto, { sello = null } = {}) {
  const crudo = Buffer.isBuffer(texto) ? texto.toString('utf8') : String(texto);
  if (crudo.length > INDICE_MAXIMO) throw new ErrorCopias('indice_danado');
  const lineas = crudo.split('\n');
  const d = pareceIndice(lineas[0]);
  if (!d) throw new ErrorCopias('indice_danado');
  if (!Number.isSafeInteger(d.formato) || d.formato < 1) throw new ErrorCopias('indice_danado');
  if (d.formato > FORMATO) throw new ErrorCopias('formato_nuevo', { formato: d.formato });
  const firma = /^OPORTIA-SELLO-1 ([0-9a-f]{64})$/.exec(lineas[1] ?? '');
  const partesOk = Array.isArray(d.partes) && d.partes.length >= 1 && d.partes.every((p, i) => p && p.n === i + 1
    && Number.isSafeInteger(p.bytes) && p.bytes > CABECERA_PARTE && p.bytes <= PARTE_MAXIMA && /^[0-9a-f]{64}$/.test(String(p.sha256))
    && (p.telegram == null || (typeof p.telegram.archivo === 'string' && p.telegram.archivo.length > 0 && p.telegram.archivo.length <= 512)));
  if (!esUuid(d.copia) || !Number.isFinite(Date.parse(d.creada)) || typeof d.publica !== 'string' || typeof d.receptor !== 'string'
    || !partesOk || !d.flujo || !Number.isSafeInteger(d.flujo.bytes) || !/^[0-9a-f]{64}$/.test(String(d.flujo.sha256))
    || typeof d.sellado !== 'string') {
    throw new ErrorCopias('indice_danado');
  }
  if (sello) {
    if (!firma) throw new ErrorCopias('indice_no_autentico');
    const esperada = createHmac('sha256', sello).update(lineas[0], 'utf8').digest();
    if (!timingSafeEqual(esperada, Buffer.from(firma[1], 'hex'))) throw new ErrorCopias('indice_no_autentico');
  }
  return d;
}
