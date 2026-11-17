// Academia 0.14.29: la «voz natural» de la Práctica en vivo del oral: ChatGPT (gpt-4o-mini-tts) lee en voz alta UNA pregunta
// del libro y el mp3 se guarda en disco por la huella de su texto (y del modelo y la voz): cada pregunta se paga UNA vez (en
// el tope de la cuenta que la pidió primero, sin cobrarle un uso) y la oyen todos los alumnos. Solo ChatGPT tiene voz (Claude no); sin ChatGPT, con un tope lleno o con la IA en pausa, la
// pantalla usa la voz del teléfono. Lo pide el servidor web (src/api/oral-vivo.js) y lo hace el trabajador
// (src/academia/instructor-tarea.js, uso 'oral_voz'); nada de esto lleva datos del alumno: solo el texto de la pregunta.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaAcademia } from './paquetes.js';
import { MODELO_VOZ } from '../ia/presupuesto.js';

// textoMax: una pregunta de hasta 500 letras (~35 s de audio: su respuesta, en base64 y como eventos, cabe en 512 KB).
export const VOZ = Object.freeze({ textoMax: 500, bytesMax: 400_000 });
export const INSTRUCCIONES_VOZ = 'Habla en español neutro, como un examinador de piloto amable y claro, a ritmo pausado. Si el texto está en inglés, léelo en inglés claro.';
export const carpetaVoz = config => join(carpetaAcademia(config), 'voz-oral');
export const archivoVoz = texto => `${createHash('sha256').update(`${MODELO_VOZ}|coral|${String(texto ?? '')}`).digest('hex').slice(0, 32)}.mp3`;
export const ARCHIVO_VOZ = /^[a-f0-9]{32}\.mp3$/;
export const rutaVoz = (config, archivo) => (ARCHIVO_VOZ.test(String(archivo)) ? join(carpetaVoz(config), archivo) : null);
export const hayVoz = (config, archivo) => { const r = rutaVoz(config, archivo); return Boolean(r && existsSync(r)); };

// ¿Parece un mp3? (con etiqueta ID3 o empieza con una trama MPEG).
export const esMp3 = b => Buffer.isBuffer(b) && b.length >= 64 && b.length <= VOZ.bytesMax && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));

// Lo guarda el trabajador, dentro de la escritura que anota lo que costó (un archivo a medias nunca se ve).
export function guardarVoz(config, archivo, base64) {
  const buf = Buffer.from(String(base64 ?? ''), 'base64');
  if (!ARCHIVO_VOZ.test(archivo) || !esMp3(buf)) { const e = new Error('no_se_pudo_guardar'); e.clave = 'no_se_pudo_guardar'; throw e; }
  mkdirSync(carpetaVoz(config), { recursive: true });
  const parcial = join(carpetaVoz(config), `${archivo}.part`);
  writeFileSync(parcial, buf);
  renameSync(parcial, join(carpetaVoz(config), archivo));
  return { archivo, bytes: buf.length };
}
