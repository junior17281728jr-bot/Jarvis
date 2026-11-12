// Academia (0.12.1): leer de un mp4 CHICO (el clip de una tarjeta, ≤ 600 KB, ya en el disco) cuánto dura y su tamaño en
// pantalla y si trae sonido, sin nada de afuera: «moov» → «mvhd» (duración), «trak» → «tkhd» (ancho y alto) y «mdia» →
// «hdlr» («soun»: una pista de sonido). Nunca
// lanza: lo que no se entiende es null.
const CONTENEDORES = new Set(['moov', 'trak', 'mdia']);

function cajas(b, inicio, fin, fn) {
  let i = inicio;
  while (i + 8 <= fin) {
    let largo = b.readUInt32BE(i);
    const tipo = b.toString('latin1', i + 4, i + 8);
    let cabeza = 8;
    if (largo === 1) {
      if (i + 16 > fin) return;
      largo = Number(b.readBigUInt64BE(i + 8));
      cabeza = 16;
    } else if (largo === 0) largo = fin - i;
    if (largo < cabeza || i + largo > fin) return;
    fn(tipo, i + cabeza, i + largo);
    i += largo;
  }
}

export function datosMp4(b) {
  try {
    if (!Buffer.isBuffer(b) || b.length < 16 || b.toString('latin1', 4, 8) !== 'ftyp') return null;
    let duracion = null;
    let ancho = 0;
    let alto = 0;
    let audio = false;
    const mirar = (tipo, ini, fin) => {
      if (CONTENEDORES.has(tipo)) return cajas(b, ini, fin, mirar);
      if (tipo === 'mvhd' && fin - ini >= 20) {
        const version = b[ini];
        const escala = version === 1 ? b.readUInt32BE(ini + 20) : b.readUInt32BE(ini + 12);
        const dura = version === 1 ? Number(b.readBigUInt64BE(ini + 24)) : b.readUInt32BE(ini + 16);
        if (escala > 0) duracion = dura / escala;
      }
      // El manejador de cada pista: «soun» = trae sonido.
      if (tipo === 'hdlr' && fin - ini >= 12 && b.toString('latin1', ini + 8, ini + 12) === 'soun') audio = true;
      if (tipo === 'tkhd' && fin - ini >= 84) {
        const version = b[ini];
        const base = ini + (version === 1 ? 88 : 76);
        if (base + 8 <= fin) {
          const w = b.readUInt32BE(base) / 65536;
          const h = b.readUInt32BE(base + 4) / 65536;
          if (w > ancho) { ancho = w; alto = h; }
        }
      }
    };
    cajas(b, 0, b.length, mirar);
    return duracion == null ? null : { duracion_s: Math.round(duracion * 100) / 100, ancho: Math.round(ancho), alto: Math.round(alto), audio };
  } catch { return null; }
}
