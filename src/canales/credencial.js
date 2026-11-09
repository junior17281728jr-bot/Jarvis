// La credencial de un canal (hoy: el token del bot de Telegram), leída del almacén de claves de la parte d. Es el
// ÚNICO archivo de src/canales/ que lee una clave descifrada (leerSecreto; test/reglas.test.js).
//  - conCredencial(db, config, { uso, secretoId }, fn): lee la clave ACTIVA de ese uso, llama a fn(cred) y la suelta.
//    Con secretoId: exactamente esa fila; si ya no es la activa → { motivo: 'credencial_cambiada' } sin llamar a fn
//    (una copia queda atada a UN bot: sus archivos de Telegram se bajan con ese mismo token).
//  - cred lleva el token como propiedad NO enumerable y se muestra siempre como «[credencial]»: un JSON.stringify, un
//    registro en la consola o un error que la arrastre nunca saca el token.
import { inspect } from 'node:util';
import { leerSecreto, secretoUsable } from '../claves/almacen.js';
import { estadoLlave } from '../claves/cifrado.js';

export function crearCredencial({ token, base = null, secretoId = null }) {
  const cred = {};
  Object.defineProperty(cred, 'token', { value: token, enumerable: false });
  Object.defineProperty(cred, 'base', { value: base, enumerable: false });
  Object.defineProperty(cred, 'secretoId', { value: secretoId, enumerable: true });
  Object.defineProperty(cred, 'toJSON', { value: () => '[credencial]', enumerable: false });
  Object.defineProperty(cred, inspect.custom, { value: () => '[credencial]', enumerable: false });
  Object.defineProperty(cred, 'toString', { value: () => '[credencial]', enumerable: false });
  return Object.freeze(cred);
}

export async function conCredencial(db, config, { uso, secretoId = null, tipo = 'telegram', ahora = Date.now() }, fn) {
  const fila = db.prepare("SELECT * FROM secretos WHERE uso = ? AND espacio_id IS NULL AND estado = 'activa' ORDER BY id DESC LIMIT 1").get(String(uso));
  if (!fila) return { motivo: secretoId != null ? 'credencial_cambiada' : 'sin_clave' };
  if (secretoId != null && fila.id !== Number(secretoId)) return { motivo: 'credencial_cambiada' };
  const llave = estadoLlave(config);
  const usable = secretoUsable(fila, ahora, llave.listo ? llave.huella : null);
  if (!usable.si && usable.motivo !== 'proveedor_en_pausa') return { motivo: usable.motivo === 'clave_no_valida' ? 'clave_no_valida' : 'sin_clave' };
  const token = leerSecreto(db, config, { id: fila.id });
  if (!token) return { motivo: 'sin_clave' };
  const cred = crearCredencial({ token, base: config?.canalesBases?.[tipo] ?? null, secretoId: fila.id });
  return await fn(cred);
}
