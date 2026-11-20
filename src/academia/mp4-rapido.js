// Academia (0.14.61): un mp4 que «empieza enseguida» (faststart), sin nada de afuera (ni ffmpeg).
// En un mp4, la caja «moov» dice dónde está cada pedazo del video (dentro de «mdat»). Si «moov» va AL FINAL, el
// navegador tiene que ir a buscarla allá antes de mostrar nada (un viaje más, y en el iPhone a veces baja casi todo).
// Aquí se escribe una copia AL LADO del original con «moov» antes de «mdat» y los lugares de los pedazos (las cajas
// stco y co64) corridos lo que mide moov. El original nunca se toca (su sha256 sigue siendo el del paquete).
//  - Si moov ya va antes de mdat: no se hace nada (casi todos los videos ya vienen así).
//  - Lo raro no se toca: un mp4 por fragmentos (moof), un moov comprimido (cmov), un lugar que ya no cabe en 32 bits,
//    o un moov de más de 64 MB. Entonces se sirve el original, como siempre.
//  - Nunca se lee el video entero en memoria: solo moov; lo demás se copia del disco al disco por pedazos.
import { openSync, readSync, closeSync, fstatSync, statSync, createReadStream, createWriteStream, renameSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export const SUFIJO_RAPIDO = '.rapido';
const MOOV_MAXIMO = 64 * 1024 * 1024;
const CONTENEDORES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'mvex']);
const DOS_A_LA_32 = 2 ** 32;

// Las cajas de arriba del archivo: [{ tipo, inicio, largo }] (o null si el archivo no se entiende).
export function cajasDeArriba(fd, tamano) {
  const lista = [];
  const cabeza = Buffer.alloc(16);
  let i = 0;
  while (i < tamano) {
    if (i + 8 > tamano) return null;
    const leido = readSync(fd, cabeza, 0, 16, i);
    if (leido < 8) return null;
    let largo = cabeza.readUInt32BE(0);
    const tipo = cabeza.toString('latin1', 4, 8);
    if (largo === 1) {
      if (leido < 16) return null;
      largo = Number(cabeza.readBigUInt64BE(8));
    } else if (largo === 0) largo = tamano - i;
    if (largo < 8 || i + largo > tamano) return null;
    lista.push({ tipo, inicio: i, largo });
    i += largo;
  }
  return lista;
}

// Recorre las cajas de b entre inicio y fin (los contenedores, por dentro). fn(tipo, cuerpo, fin, cabeza).
function recorrer(b, inicio, fin, fn) {
  let i = inicio;
  while (i + 8 <= fin) {
    let largo = b.readUInt32BE(i);
    const tipo = b.toString('latin1', i + 4, i + 8);
    let cabeza = 8;
    if (largo === 1) {
      if (i + 16 > fin) return false;
      largo = Number(b.readBigUInt64BE(i + 8));
      cabeza = 16;
    } else if (largo === 0) largo = fin - i;
    if (largo < cabeza || i + largo > fin) return false;
    if (fn(tipo, i + cabeza, i + largo) === false) return false;
    if (CONTENEDORES.has(tipo) && recorrer(b, i + cabeza, i + largo, fn) === false) return false;
    i += largo;
  }
  return true;
}

// Corre los lugares (stco: 32 bits, co64: 64 bits) de un moov ya en memoria: los que caen en [desde, hasta) suman
// «corrimiento». Cambia moov en su lugar. Devuelve el motivo si no se puede ('cmov', 'no_cabe', 'roto') o null.
export function correrLugares(moov, { desde, hasta, corrimiento }) {
  let motivo = null;
  const correr = o => (o >= desde && o < hasta ? o + corrimiento : o);
  const bien = recorrer(moov, 8, moov.length, (tipo, cuerpo, fin) => {
    if (tipo === 'cmov') { motivo = 'cmov'; return false; }
    if (tipo !== 'stco' && tipo !== 'co64') return true;
    if (cuerpo + 8 > fin) { motivo = 'roto'; return false; }
    const n = moov.readUInt32BE(cuerpo + 4);
    const ancho = tipo === 'stco' ? 4 : 8;
    if (cuerpo + 8 + n * ancho > fin) { motivo = 'roto'; return false; }
    for (let k = 0; k < n; k++) {
      const p = cuerpo + 8 + k * ancho;
      if (tipo === 'stco') {
        const nuevo = correr(moov.readUInt32BE(p));
        if (nuevo >= DOS_A_LA_32) { motivo = 'no_cabe'; return false; }
        moov.writeUInt32BE(nuevo, p);
      } else {
        moov.writeBigUInt64BE(BigInt(correr(Number(moov.readBigUInt64BE(p)))), p);
      }
    }
    return true;
  });
  return motivo ?? (bien ? null : 'roto');
}

// ¿Qué hay que hacer con este mp4? { hacer: false, motivo } o { hacer: true, cajas, moov, mdat }.
export function planRapido(ruta) {
  let fd;
  try {
    fd = openSync(ruta, 'r');
    const tamano = fstatSync(fd).size;
    const cajas = cajasDeArriba(fd, tamano);
    if (!cajas || cajas[0]?.tipo !== 'ftyp') return { hacer: false, motivo: 'no_es_mp4' };
    if (cajas.some(c => c.tipo === 'moof')) return { hacer: false, motivo: 'fragmentado' };
    const moovs = cajas.filter(c => c.tipo === 'moov');
    const mdat = cajas.find(c => c.tipo === 'mdat');
    if (moovs.length !== 1 || !mdat) return { hacer: false, motivo: 'no_es_mp4' };
    const moov = moovs[0];
    if (moov.inicio < mdat.inicio) return { hacer: false, motivo: 'ya_rapido' };
    if (moov.largo > MOOV_MAXIMO) return { hacer: false, motivo: 'moov_grande' };
    return { hacer: true, cajas, moov, mdat, tamano };
  } catch {
    return { hacer: false, motivo: 'no_se_lee' };
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* ya cerrado */ }
  }
}

// Escribe «destino» con moov antes del primer mdat. → { hecho: true } o { hecho: false, motivo }. Nunca lanza.
// espacio(bytes): opcional; si devuelve un texto, no se escribe (no hay lugar en el disco).
export async function hacerRapido(origen, destino, { espacio = null } = {}) {
  const plan = planRapido(origen);
  if (!plan.hacer) return { hecho: false, motivo: plan.motivo };
  const { cajas, moov, mdat, tamano } = plan;
  if (espacio) { const no = espacio(tamano); if (no) return { hecho: false, motivo: no }; }
  // moov en memoria (es chico: el índice, no el video).
  const buf = Buffer.alloc(moov.largo);
  let fd;
  try {
    fd = openSync(origen, 'r');
    if (readSync(fd, buf, 0, moov.largo, moov.inicio) !== moov.largo) return { hecho: false, motivo: 'no_se_lee' };
  } catch { return { hecho: false, motivo: 'no_se_lee' }; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* ya cerrado */ } }
  // Lo que estaba entre el primer mdat y moov se corre lo que mide moov; lo que estaba después de moov queda igual.
  const motivo = correrLugares(buf, { desde: mdat.inicio, hasta: moov.inicio, corrimiento: moov.largo });
  if (motivo) return { hecho: false, motivo };
  const parcial = `${destino}.part`;
  try {
    const salida = createWriteStream(parcial, { mode: 0o640 });
    async function* partes() {
      for (const c of cajas) {
        if (c === moov) continue;
        if (c === mdat) yield buf;
        for await (const trozo of createReadStream(origen, { start: c.inicio, end: c.inicio + c.largo - 1, highWaterMark: 256 * 1024 })) yield trozo;
      }
    }
    await pipeline(partes, salida);
    if (statSync(parcial).size !== tamano) throw new Error('largo distinto');
    renameSync(parcial, destino);
    return { hecho: true };
  } catch {
    // El «.part» a medias queda (el programa nunca borra archivos, test/reglas.test.js): la próxima vez se escribe encima,
    // nunca se sirve y el almacén no lo cuenta.
    return { hecho: false, motivo: 'no_se_escribe' };
  }
}

// La copia rápida de un mp4, si existe y es del mismo largo (si no, el original). → { ruta, st }.
export function versionParaServir(ruta, st = statSync(ruta)) {
  if (!/\.mp4$/i.test(ruta)) return { ruta, st };
  try {
    const r = statSync(ruta + SUFIJO_RAPIDO);
    if (r.isFile() && r.size === st.size) return { ruta: ruta + SUFIJO_RAPIDO, st: r };
  } catch { /* no hay copia: el original */ }
  return { ruta, st };
}
