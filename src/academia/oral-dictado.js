// Academia 0.14.50: el «dictado» de la Práctica en vivo del oral. El dictado del navegador (Web Speech) no escribía nada en
// el Mac ni en el iPhone del dueño; ahora el navegador GRABA lo que dice el alumno (MediaRecorder) y ChatGPT
// (gpt-4o-mini-transcribe) lo pasa a texto, con la clave de ChatGPT que la app ya tiene.
//  - El audio NUNCA se guarda (ni en la base ni en el disco): el servidor web lo recibe (src/api/oral-vivo.js), lo pasa al
//    trabajador por su canal (en memoria: src/tareas/supervisor.js → src/tareas/trabajador.js) y el trabajador lo manda a
//    OpenAI (src/academia/instructor-tarea.js, uso 'oral_dictado') y lo olvida. Solo el TEXTO vuelve, y se borra en cuanto
//    la pantalla lo lee (o a los 10 minutos).
//  - En la fila va solo una marca (el id al azar de la grabación), nunca el audio.
import { randomBytes } from 'node:crypto';

export const DICTADO = Object.freeze({
  bytesMax: 4 * 1024 * 1024, // 90 s en el iPhone (AAC) son ~1,5 MB; en Chrome (Opus), ~0,5 MB
  bytesMin: 1_000, // menos que esto no es una grabación de verdad (no se gasta en ella)
  segundosMax: 90,
  pistaMax: 800, // la pista para la IA: el texto de la pregunta (ayuda con las palabras de aviación)
  memoriaMs: 60_000, // lo que espera la grabación en la memoria del trabajador
  enMemoriaMax: 6, // grabaciones a la vez en la memoria del trabajador
  textoMs: 10 * 60_000, // lo que espera el texto a que la pantalla lo lea
  caducaMs: 45_000, // nadie espera un dictado pedido hace más de esto: se termina sin llamar, sin pagar
});
export const ID_DICTADO = /^[a-f0-9]{24}$/;
export const nuevoIdDictado = () => randomBytes(12).toString('hex');
export const claveTexto = (usuarioId, id) => `academia.dictado.${Number(usuarioId) || 0}.${id}`;

// ¿Qué grabó el navegador? Por sus primeros bytes (nunca por lo que diga la cabecera): WebM (Chrome, Firefox), MP4 (Safari,
// iPhone), Ogg, WAV o MP3. → el tipo que se le dice a OpenAI, o null (no se gasta en algo que no es audio).
export function tipoDeAudio(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'audio/mp4';
  if (b.toString('latin1', 0, 4) === 'OggS') return 'audio/ogg';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return 'audio/wav';
  if ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  return null;
}

// ---------- En la memoria del trabajador (nunca en la base ni en el disco) ----------
const grabaciones = new Map(); // id → { bytes: Buffer, hasta }
function barrer(ahora) {
  for (const [id, g] of grabaciones) if (g.hasta <= ahora) grabaciones.delete(id);
}
// El mensaje del servidor web: { tipo: 'audio_dictado', id, base64 }. → true si se guardó.
export function recibirAudio(mensaje, ahora = Date.now()) {
  barrer(ahora);
  if (!mensaje || !ID_DICTADO.test(String(mensaje.id)) || typeof mensaje.base64 !== 'string') return false;
  if (mensaje.base64.length > Math.ceil(DICTADO.bytesMax / 3) * 4 + 8) return false;
  const bytes = Buffer.from(mensaje.base64, 'base64');
  if (bytes.length < DICTADO.bytesMin || !tipoDeAudio(bytes)) return false;
  while (grabaciones.size >= DICTADO.enMemoriaMax) grabaciones.delete(grabaciones.keys().next().value);
  grabaciones.set(mensaje.id, { bytes, hasta: ahora + DICTADO.memoriaMs });
  return true;
}
// La grabación, UNA vez (después ya no está). → Buffer o null.
export function tomarAudio(id, ahora = Date.now()) {
  barrer(ahora);
  const g = grabaciones.get(String(id));
  grabaciones.delete(String(id));
  return g ? g.bytes : null;
}
export const grabacionesEnMemoria = () => grabaciones.size;

// ---------- El texto (en «ajustes», hasta que la pantalla lo lee) ----------
const iso = ms => new Date(ms).toISOString();
// Lo guarda el trabajador (en la misma escritura que anota lo que costó). texto: lo que dijo, ya en texto.
export function guardarTexto(db, { usuarioId, id, texto, ahora = Date.now() }) {
  if (!ID_DICTADO.test(String(id))) { const e = new Error('pedido_no_valido'); e.clave = 'pedido_no_valido'; throw e; }
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(claveTexto(usuarioId, id), JSON.stringify({ texto: limpio }), iso(ahora));
  return { bytes: Buffer.byteLength(limpio) };
}
// Lo lee el servidor web y lo borra. → { texto } o null (todavía no).
export function tomarTexto(db, { usuarioId, id }) {
  const clave = claveTexto(usuarioId, id);
  const f = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  if (!f) return null;
  db.prepare('DELETE FROM ajustes WHERE clave = ?').run(clave);
  try { const v = JSON.parse(f.valor); return { texto: typeof v?.texto === 'string' ? v.texto : '' }; } catch { return { texto: '' }; }
}
// Los textos que nadie leyó (la pantalla se cerró): se borran a los 10 minutos.
export function barrerTextos(db, ahora = Date.now()) {
  return db.prepare("DELETE FROM ajustes WHERE clave LIKE 'academia.dictado.%' AND actualizado_en < ?").run(iso(ahora - DICTADO.textoMs)).changes;
}
