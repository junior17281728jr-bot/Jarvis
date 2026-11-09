// El FLUJO cifrado de las copias (formato 1, congelado). Es el único archivo de src/copias/ que cifra o descifra.
//  - Por cada copia, una llave X25519 «efímera» nueva: con la llave PÚBLICA del dueño sale un secreto compartido →
//    HKDF-SHA256 → la llave AES-256-GCM de esa copia. El servidor no puede abrir sus propias copias: solo la clave de
//    recuperación del dueño (src/copias/clave.js) da la llave privada.
//  - Cabecera: 'OPCFLUJO' · formato u16 · L u32 · JSON de L bytes (1…4096).
//  - Registros de 64 KiB: H (u32: bit «último» + largo) · cifrado · etiqueta GCM de 16 bytes. La AAD de cada registro es
//    sha256(cabecera) ‖ H y el nonce es el número de registro: cortar, cambiar el orden, pegar registros de otra copia
//    o tocar la cabecera se nota siempre. Cada etiqueta se revisa ANTES de entregar un solo byte descifrado.
//  - «efimera» fija (para el vector congelado test/copia-v1.json) solo la acepta crearCifrador; ningún otro archivo
//    de src/ la pasa (test/reglas.test.js).
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { ErrorCopias, FORMATO, MAGIA_FLUJO, TROZO, CABECERA_FLUJO_MAX, esUuid } from './formato.js';
import { huellaDe, publicaDe } from './clave.js';

export const CIFRADO = 'x25519-hkdf-sha256-aes-256-gcm';
const INFO_LLAVE = 'oportia-copia-v1/aes-256-gcm';
const ETIQUETA = 16;
const ULTIMO = 0x80000000;

function llaveDeX(publica) {
  return createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(publica).toString('base64url') }, format: 'jwk' });
}

function nonce(i) {
  const b = Buffer.alloc(12);
  b.writeBigUInt64BE(BigInt(i), 4);
  return b;
}

function derivarLlave(compartido, efPub, publica) {
  if (compartido.every(x => x === 0)) throw new ErrorCopias('copia_danada');
  return Buffer.from(hkdfSync('sha256', compartido, Buffer.concat([efPub, publica]), INFO_LLAVE, 32));
}

// Arma la cabecera del flujo. extra: { copia, creada, servidor, compresion, contenido }.
function armarCabecera(datos) {
  const json = Buffer.from(JSON.stringify(datos), 'utf8');
  if (json.length < 1 || json.length > CABECERA_FLUJO_MAX) throw new ErrorCopias('copia_danada');
  const b = Buffer.alloc(14 + json.length);
  b.write(MAGIA_FLUJO, 0, 'latin1');
  b.writeUInt16BE(FORMATO, 8);
  b.writeUInt32BE(json.length, 10);
  json.copy(b, 14);
  return b;
}

// Un cifrador de UNA copia. trozo(datos, ultimo) cifra un registro (≤ 64 KiB). llaveDeCopia queda en memoria solo para la
// revisión en el mismo paso (crearDescifrador({ llaveDeCopia, hashCabecera })); cerrar() la llena de ceros.
export function crearCifrador({ publica, copia = randomUUID(), creada = new Date().toISOString(), servidor = null, compresion = 'gzip', contenido = 'oportia-volcado-v1', efimera = null }) {
  const pub = Buffer.from(publica);
  if (pub.length !== 32) throw new ErrorCopias('clave_no_valida');
  if (!esUuid(copia)) throw new ErrorCopias('copia_danada');
  const par = efimera
    ? { privateKey: createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(efimera)]), format: 'der', type: 'pkcs8' }) }
    : generateKeyPairSync('x25519');
  const efPub = publicaDe(par.privateKey);
  const compartido = diffieHellman({ privateKey: par.privateKey, publicKey: llaveDeX(pub) });
  let llave;
  try { llave = derivarLlave(compartido, efPub, pub); } finally { compartido.fill(0); }
  const cabecera = armarCabecera({
    formato: FORMATO, app: 'oportia', copia, creada, cifrado: CIFRADO, efimera: efPub.toString('base64url'),
    receptor: huellaDe(pub), trozo: TROZO, compresion, contenido, servidor,
  });
  const hashCabecera = createHash('sha256').update(cabecera).digest();
  let i = 0;
  let terminado = false;
  return {
    cabecera, hashCabecera, copia, creada, llaveDeCopia: llave,
    trozo(datos, ultimo) {
      if (terminado) throw new ErrorCopias('copia_danada');
      const n = datos.length;
      if (n < 1 || n > TROZO || (!ultimo && n !== TROZO)) throw new ErrorCopias('copia_danada');
      const h = Buffer.alloc(4);
      h.writeUInt32BE((ultimo ? ULTIMO : 0) + n);
      const c = createCipheriv('aes-256-gcm', llave, nonce(i));
      c.setAAD(Buffer.concat([hashCabecera, h]));
      const salida = Buffer.concat([h, c.update(datos), c.final(), c.getAuthTag()]);
      i += 1;
      if (ultimo) terminado = true;
      return salida;
    },
    cerrar() { llave.fill(0); },
  };
}

// Un Transform que recibe bytes (gzip) y entrega el flujo cifrado: primero la cabecera y después registros de 64 KiB.
// Guarda un registro de más para saber cuál es el último (nada se manda hasta saberlo).
export function transformarCifrado(cifrador) {
  const pendiente = Buffer.alloc(TROZO);
  let lleno = 0;
  let cabeceraMandada = false;
  return new Transform({
    transform(datos, _cod, listo) {
      try {
        if (!cabeceraMandada) { this.push(cifrador.cabecera); cabeceraMandada = true; }
        let j = 0;
        while (j < datos.length) {
          if (lleno === TROZO) { this.push(cifrador.trozo(pendiente, false)); lleno = 0; }
          const cuanto = Math.min(datos.length - j, TROZO - lleno);
          datos.copy(pendiente, lleno, j, j + cuanto);
          lleno += cuanto;
          j += cuanto;
        }
        listo();
      } catch (error) { listo(error); }
    },
    flush(listo) {
      try {
        if (!cabeceraMandada || lleno === 0) throw new ErrorCopias('copia_danada');
        this.push(cifrador.trozo(pendiente.subarray(0, lleno), true));
        pendiente.fill(0);
        listo();
      } catch (error) { listo(error); }
    },
  });
}

// Una cola de búferes de la que se sacan bytes exactos (sin copiar todo lo que llega cada vez).
class Cola {
  constructor() { this.partes = []; this.largo = 0; }
  meter(b) { if (b.length) { this.partes.push(b); this.largo += b.length; } }
  sacar(n) {
    const salida = Buffer.allocUnsafe(n);
    let hecho = 0;
    while (hecho < n) {
      const p = this.partes[0];
      const cuanto = Math.min(p.length, n - hecho);
      p.copy(salida, hecho, 0, cuanto);
      hecho += cuanto;
      if (cuanto === p.length) this.partes.shift();
      else this.partes[0] = p.subarray(cuanto);
    }
    this.largo -= n;
    return salida;
  }
  mirar(n) {
    const salida = this.sacar(n);
    this.partes.unshift(salida);
    this.largo += n;
    return salida;
  }
}

// Lee y revisa la cabecera de un flujo (los primeros 14 + L bytes). → { datos, bytes }
export function leerCabeceraFlujo(b) {
  if (b.toString('latin1', 0, 8) !== MAGIA_FLUJO) throw new ErrorCopias('copia_danada');
  const formato = b.readUInt16BE(8);
  if (formato > FORMATO) throw new ErrorCopias('formato_nuevo', { formato });
  if (formato < 1) throw new ErrorCopias('copia_danada');
  const largo = b.readUInt32BE(10);
  if (largo < 1 || largo > CABECERA_FLUJO_MAX) throw new ErrorCopias('copia_danada');
  return largo;
}

function revisarDatosCabecera(texto) {
  let d;
  try { d = JSON.parse(texto); } catch { throw new ErrorCopias('copia_danada'); }
  if (!d || typeof d !== 'object') throw new ErrorCopias('copia_danada');
  if (!Number.isSafeInteger(d.formato) || d.formato < 1) throw new ErrorCopias('copia_danada');
  if (d.formato > FORMATO) throw new ErrorCopias('formato_nuevo', { formato: d.formato });
  const ef = typeof d.efimera === 'string' ? Buffer.from(d.efimera, 'base64url') : null;
  if (d.app !== 'oportia' || d.cifrado !== CIFRADO || d.trozo !== TROZO || !ef || ef.length !== 32 || !esUuid(d.copia)
    || !['gzip', 'ninguna'].includes(d.compresion) || typeof d.receptor !== 'string') {
    throw new ErrorCopias('copia_danada');
  }
  return { ...d, efimeraBytes: ef };
}

// El Transform que descifra un flujo. Dos formas:
//  - { privada } (restaurar): la llave privada que sale de la clave de recuperación (X25519 de verdad);
//  - { llaveDeCopia, hashCabecera } (la revisión en el mismo paso de la copia): la llave del registro, en memoria.
// Ambas usan el MISMO lector de registros. alCabecera(datos) se llama al leer la cabecera (antes de descifrar nada).
// Errores: copia_danada · copia_cortada · formato_nuevo · clave_no_es_de_esta_copia { receptor }.
export function crearDescifrador({ privada = null, llaveDeCopia = null, hashCabecera = null, alCabecera = null }) {
  const cola = new Cola();
  let llave = null;
  let hashCab = null;
  let i = 0;
  let largoCabecera = null;
  let fin = false;
  let errorFijo = null;
  const tomarLlave = (datos, bytesCabecera) => {
    hashCab = createHash('sha256').update(bytesCabecera).digest();
    if (llaveDeCopia) {
      if (!hashCabecera || !Buffer.from(hashCabecera).equals(hashCab)) throw new ErrorCopias('copia_danada');
      llave = Buffer.from(llaveDeCopia);
      return;
    }
    const publica = publicaDe(privada);
    if (datos.receptor !== huellaDe(publica)) throw new ErrorCopias('clave_no_es_de_esta_copia', { receptor: String(datos.receptor).slice(0, 8) });
    let compartido;
    try {
      compartido = diffieHellman({ privateKey: privada, publicKey: llaveDeX(datos.efimeraBytes) });
    } catch {
      throw new ErrorCopias('copia_danada');
    }
    try { llave = derivarLlave(compartido, datos.efimeraBytes, publica); } finally { compartido.fill(0); }
  };
  const procesar = empuje => {
    for (;;) {
      if (largoCabecera === null) {
        if (cola.largo < 14) return;
        largoCabecera = leerCabeceraFlujo(cola.mirar(14));
      }
      if (llave === null) {
        if (cola.largo < 14 + largoCabecera) return;
        const bytes = cola.sacar(14 + largoCabecera);
        const datos = revisarDatosCabecera(bytes.subarray(14).toString('utf8'));
        tomarLlave(datos, bytes);
        if (alCabecera) alCabecera(datos, hashCab);
        continue;
      }
      if (cola.largo === 0) return;
      if (fin) throw new ErrorCopias('copia_danada'); // nada puede venir después del último registro
      if (cola.largo < 4) return;
      const h = cola.mirar(4).readUInt32BE(0);
      const ultimo = (h & ULTIMO) !== 0;
      const n = h & 0x7fffffff;
      if (n < 1 || n > TROZO || (!ultimo && n !== TROZO)) throw new ErrorCopias('copia_danada');
      if (cola.largo < 4 + n + ETIQUETA) return;
      const registro = cola.sacar(4 + n + ETIQUETA);
      const d = createDecipheriv('aes-256-gcm', llave, nonce(i));
      d.setAAD(Buffer.concat([hashCab, registro.subarray(0, 4)]));
      d.setAuthTag(registro.subarray(4 + n));
      let claro;
      try {
        claro = Buffer.concat([d.update(registro.subarray(4, 4 + n)), d.final()]);
      } catch {
        throw new ErrorCopias('copia_danada');
      }
      i += 1;
      if (ultimo) fin = true;
      empuje(claro);
    }
  };
  return new Transform({
    transform(datos, _cod, listo) {
      if (errorFijo) return listo(errorFijo);
      try {
        cola.meter(Buffer.from(datos));
        procesar(b => this.push(b));
        listo();
      } catch (error) {
        errorFijo = error;
        listo(error);
      }
    },
    flush(listo) {
      try {
        if (errorFijo) throw errorFijo;
        if (cola.largo > 0) procesar(b => this.push(b));
        if (cola.largo > 0) throw new ErrorCopias(fin ? 'copia_danada' : 'copia_cortada');
        if (!fin) throw new ErrorCopias('copia_cortada');
        listo();
      } catch (error) {
        listo(error);
      } finally {
        if (llave) llave.fill(0);
      }
    },
    destroy(error, listo) {
      if (llave) llave.fill(0);
      listo(error);
    },
  });
}

// ---------- El resumen sellado del índice (el mismo formato de flujo, sin gzip) ----------
async function recogerTransform(t, entrada) {
  const salida = [];
  return await new Promise((ok, mal) => {
    t.on('data', b => salida.push(b));
    t.on('error', mal);
    t.on('end', () => ok(Buffer.concat(salida)));
    t.end(entrada);
  });
}

// texto (JSON) → base64url de un flujo cifrado a la llave pública (solo la clave de recuperación lo abre).
export function sellar(texto, publica, { copia, creada, servidor = null } = {}) {
  const cifrador = crearCifrador({ publica, copia, creada, servidor, compresion: 'ninguna', contenido: 'oportia-resumen-v1' });
  try {
    const datos = Buffer.from(texto, 'utf8');
    const registros = [cifrador.cabecera];
    for (let j = 0; j < datos.length || j === 0; j += TROZO) {
      const pedazo = datos.subarray(j, j + TROZO);
      registros.push(cifrador.trozo(pedazo, j + TROZO >= datos.length));
    }
    return Buffer.concat(registros).toString('base64url');
  } finally {
    cifrador.cerrar();
  }
}

// base64url de un flujo sellado → el texto, con la llave privada. Errores como crearDescifrador.
export async function abrirSellado(sellado, privada) {
  const bytes = Buffer.from(String(sellado ?? ''), 'base64url');
  if (bytes.length < 14 || bytes.length > 1_000_000) throw new ErrorCopias('indice_danado');
  let cabecera = null;
  const t = crearDescifrador({ privada, alCabecera: d => { cabecera = d; } });
  const claro = await recogerTransform(t, bytes);
  if (cabecera?.contenido !== 'oportia-resumen-v1' || cabecera?.compresion !== 'ninguna') throw new ErrorCopias('indice_danado');
  return { texto: claro.toString('utf8'), cabecera };
}
