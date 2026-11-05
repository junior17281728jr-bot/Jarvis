// El almacén de claves secretas (lo usan los dos procesos). Compartido: claves de IA ahora; el token del bot de
// Telegram en la parte e.
//  - Cada clave se guarda CIFRADA (src/claves/cifrado.js). En la base solo quedan el texto cifrado y sus últimos 4
//    caracteres (para que el dueño la reconozca). Nunca sale en una respuesta, un registro, un error ni un aviso.
//  - Nunca se borra una clave: cambiarla deja la vieja «reemplazada» y desactivarla la deja «desactivada» (se puede
//    activar otra vez). Hay una sola activa por uso (y por cuenta, para la fase 6).
//  - Solo tres archivos pueden leer una clave descifrada (leerSecreto): este, src/claves/probar.js (la prueba gratis)
//    y src/ia/cliente.js (el uso pagado). Lo comprueba test/reglas.test.js.
//  - Una clave en pausa (el proveedor dijo «sin saldo», «clave no válida», «espera»…) no se usa hasta que se le pasa
//    la pausa corta o el dueño la reanuda (pausa_hasta vacío = hasta que el dueño toque «Probar y reanudar»).
import { randomUUID } from 'node:crypto';
import { enTransaccion } from '../nucleo/db.js';
import { ErrorHttp } from '../nucleo/http.js';
import { auditar } from '../cuentas/usuarios.js';
import { MOTIVOS } from '../ia/propositos.js';
import { USOS, LARGO, ESTADOS_SECRETO, ORIGENES_SECRETO, definicionUso } from './usos.js';
import { ErrorClaves, asegurarLlave, leerLlave, estadoLlave, cifrar, descifrar, permisoLlaveNueva, ESQUEMA_CIFRADO, LLAVE_FALTA } from './cifrado.js';

const iso = ms => new Date(ms).toISOString();
const IMPRIMIBLE = /^[\x21-\x7e]+$/;
// Si la última prueba gratis dijo esto, la clave no sirve (hasta que el dueño la pruebe otra vez y pase).
export const PRUEBAS_QUE_INUTILIZAN = Object.freeze(['clave_no_valida', 'sin_permiso']);

// Revisa una clave pegada y la devuelve sin espacios alrededor. Los errores NUNCA llevan la clave.
//  400 uso_no_valido · clave_admin · clave_suscripcion · clave_otro_proveedor · clave_formato
export function validarValor(uso, valor) {
  const def = definicionUso(uso);
  if (!def) throw new ErrorHttp(400, 'uso_no_valido');
  if (typeof valor !== 'string') throw new ErrorHttp(400, 'clave_formato');
  const v = valor.trim();
  for (const [prefijo, motivo] of def.rechazar ?? []) if (v.startsWith(prefijo)) throw new ErrorHttp(400, motivo);
  if (v.length < LARGO.min || v.length > LARGO.max || !IMPRIMIBLE.test(v)) throw new ErrorHttp(400, 'clave_formato');
  if (def.prefijo && !v.startsWith(def.prefijo)) throw new ErrorHttp(400, 'clave_formato');
  if (def.formato && !def.formato.test(v)) throw new ErrorHttp(400, 'clave_formato');
  return v;
}

function exigirMotivo(motivo) {
  if (!MOTIVOS.includes(motivo)) throw new Error(`motivo no válido: ${String(motivo).slice(0, 40)}`);
  return motivo;
}

function numero(id) {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ¿La pausa de esta fila sigue vigente? (pausa_hasta vacío = hasta que el dueño la reanude.)
export function pausaVigente(fila, ahoraMs = Date.now()) {
  if (!fila?.pausa_motivo) return null;
  if (fila.pausa_hasta != null && Date.parse(fila.pausa_hasta) <= ahoraMs) return null;
  return { motivo: fila.pausa_motivo, desde: fila.pausa_desde, hasta: fila.pausa_hasta, admin: fila.pausa_hasta == null };
}

// Lo que las pantallas pueden ver de una clave: nunca su valor. huellaActual: la de la llave de ahora (o null).
export function secretoPublico(f, { huellaActual = null, ahora = Date.now() } = {}) {
  const pausa = pausaVigente(f, ahora);
  return {
    id: f.id,
    uso: f.uso,
    estado: f.estado,
    final: f.final,
    legible: huellaActual != null && f.llave_huella === huellaActual,
    creadoEn: f.creado_en,
    cambiadoEn: f.cambiado_en,
    probadoEn: f.probado_en,
    prueba: f.prueba,
    usadoEn: f.usado_en,
    pausa: pausa ? { motivo: pausa.motivo, desde: pausa.desde, hasta: pausa.hasta } : null,
  };
}

// Las huellas de las claves guardadas y cuándo se guardó la más nueva (para permisoLlaveNueva).
export function clavesGuardadas(db) {
  const f = db.prepare('SELECT MAX(creado_en) AS ultima FROM secretos').get();
  return { huellas: db.prepare('SELECT DISTINCT llave_huella AS h FROM secretos').all().map(x => x.h), ultimaMs: f?.ultima ? Date.parse(f.ultima) : null };
}

// Cómo está el almacén para la pantalla Claves: { listo, motivo }. Que el archivo de la llave todavía no exista es lo
// normal antes de la primera clave (se crea al guardarla). Ronda 2 de revisión: si ya hay claves guardadas, que falte
// es 'llave_falta' (no listo: no se puede pegar hasta que la consola la recupere o se decida empezar de nuevo).
export function estadoAlmacen(db, config) {
  const e = estadoLlave(config);
  if (e.listo) return { listo: true, motivo: null };
  if (e.motivo !== 'llave_no_existe') return { listo: false, motivo: e.motivo };
  return permisoLlaveNueva(config, clavesGuardadas(db)).si ? { listo: true, motivo: 'llave_no_existe' } : { listo: false, motivo: LLAVE_FALTA };
}

function huellaDeAhora(config) {
  const e = estadoLlave(config);
  return e.listo ? e.huella : null;
}

function activaDe(db, uso, espacioId) {
  return db.prepare("SELECT * FROM secretos WHERE uso = ? AND espacio_id IS ? AND estado = 'activa' ORDER BY id DESC").all(uso, espacioId);
}

// Guarda una clave nueva (cifrada). La que estaba activa para ese uso queda «reemplazada» (no se borra).
// Devuelve lo público de la nueva. trasCambio(db, { uso, espacioId }) corre dentro de la misma transacción (la ruta de
// la IA lo usa para apagar la IA si ya no queda una clave probada) y lo que devuelve va en «efecto».
export function guardarSecreto(db, config, { uso, valor, usuarioId = null, espacioId = null, origen = 'pegada', ahora = Date.now(), trasCambio = null }) {
  const v = validarValor(uso, valor);
  if (!ORIGENES_SECRETO.includes(origen)) throw new ErrorHttp(400, 'datos_no_validos');
  if (espacioId != null && numero(espacioId) == null) throw new ErrorHttp(400, 'datos_no_validos');
  let llave;
  try {
    // Si falta el archivo de la llave y ya hay claves guardadas con ella, nunca se crea otra en silencio (503).
    llave = asegurarLlave(config, { guardadas: clavesGuardadas(db) });
  } catch (error) {
    if (error instanceof ErrorClaves) throw new ErrorHttp(503, 'almacen_no_disponible');
    throw error;
  }
  const ref = randomUUID();
  // Se cifra ANTES de tomar la base: la transacción es corta y no hace nada lento. La llave se borra de la memoria
  // enseguida (solo queda su huella).
  let partes;
  try {
    partes = cifrar(llave.llave, v, { ref, uso });
  } finally {
    llave.llave.fill(0);
  }
  const final = v.slice(-4);
  const largo = v.length;
  return enTransaccion(db, () => {
    const momento = iso(ahora);
    const antes = activaDe(db, uso, espacioId);
    for (const vieja of antes) {
      db.prepare("UPDATE secretos SET estado = 'reemplazada', cambiado_por = ?, cambiado_en = ? WHERE id = ? AND estado = 'activa'").run(usuarioId, momento, vieja.id);
    }
    const r = db.prepare(`INSERT INTO secretos (ref, uso, espacio_id, estado, origen, cifrado, iv, sello, llave_huella, esquema, final, largo,
        reemplaza_a, creado_por, creado_en)
      VALUES (?, ?, ?, 'activa', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(ref, uso, espacioId, origen, partes.cifrado, partes.iv, partes.sello, llave.huella, ESQUEMA_CIFRADO, final, largo,
        antes[0]?.id ?? null, usuarioId, momento);
    const id = Number(r.lastInsertRowid);
    auditar(db, { usuarioId, accion: 'clave_guardada', detalle: `${uso} …${final}${antes.length ? ` (reemplaza a n.º ${antes.map(a => a.id).join(', ')})` : ''}` });
    const efecto = trasCambio ? trasCambio(db, { uso, espacioId }) : null;
    const fila = db.prepare('SELECT * FROM secretos WHERE id = ?').get(id);
    return { secreto: secretoPublico(fila, { huellaActual: llave.huella, ahora }), efecto };
  });
}

// La clave descifrada (texto) o null si no hay, no está activa, la llave cambió o no se puede abrir.
// SOLO para src/claves/almacen.js, src/claves/probar.js y src/ia/cliente.js. Nunca se guarda en ningún lado.
export function leerSecreto(db, config, { id }) {
  const n = numero(id);
  if (n == null) return null;
  const f = db.prepare("SELECT * FROM secretos WHERE id = ? AND estado = 'activa'").get(n);
  if (!f || f.esquema !== ESQUEMA_CIFRADO) return null;
  let llave;
  try { llave = leerLlave(config); } catch { return null; }
  try {
    if (llave.huella !== f.llave_huella) return null;
    return descifrar(llave.llave, { iv: f.iv, sello: f.sello, cifrado: f.cifrado }, { ref: f.ref, uso: f.uso });
  } catch {
    return null;
  } finally {
    llave.llave.fill(0); // la llave nunca queda en la memoria del proceso
  }
}

// Para la pantalla Claves: por cada uso, la activa y las anteriores (solo lo público, las más nuevas primero).
export function listarSecretos(db, config, { espacioId = null, ahora = Date.now() } = {}) {
  const huellaActual = huellaDeAhora(config);
  return Object.entries(USOS).map(([uso, def]) => {
    const filas = db.prepare('SELECT * FROM secretos WHERE uso = ? AND espacio_id IS ? ORDER BY id DESC LIMIT 50').all(uso, espacioId);
    const activa = filas.find(f => f.estado === 'activa') ?? null;
    return {
      uso,
      grupo: def.grupo,
      proveedor: def.proveedor ?? null,
      activa: activa ? secretoPublico(activa, { huellaActual, ahora }) : null,
      anteriores: filas.filter(f => f !== activa).map(f => secretoPublico(f, { huellaActual, ahora })),
    };
  });
}

function filaParaCambiar(db, id) {
  const n = numero(id);
  const f = n == null ? null : db.prepare('SELECT * FROM secretos WHERE id = ?').get(n);
  if (!f || !ESTADOS_SECRETO.includes(f.estado)) throw new ErrorHttp(404, 'no_existe');
  return f;
}

// Activa una clave anterior: la que estaba activa para ese uso queda «desactivada». Devuelve { secreto, efecto }.
export function activarSecreto(db, config, { id, usuarioId = null, ahora = Date.now(), trasCambio = null }) {
  return enTransaccion(db, () => {
    const f = filaParaCambiar(db, id);
    const momento = iso(ahora);
    if (f.estado !== 'activa') {
      for (const otra of activaDe(db, f.uso, f.espacio_id)) {
        db.prepare("UPDATE secretos SET estado = 'desactivada', cambiado_por = ?, cambiado_en = ? WHERE id = ?").run(usuarioId, momento, otra.id);
        auditar(db, { usuarioId, accion: 'clave_desactivada', detalle: `${otra.uso} …${otra.final} (n.º ${otra.id}, al activar otra)` });
      }
      db.prepare("UPDATE secretos SET estado = 'activa', cambiado_por = ?, cambiado_en = ? WHERE id = ?").run(usuarioId, momento, f.id);
      auditar(db, { usuarioId, accion: 'clave_activada', detalle: `${f.uso} …${f.final} (n.º ${f.id})` });
    }
    const efecto = trasCambio ? trasCambio(db, { uso: f.uso, espacioId: f.espacio_id }) : null;
    return { secreto: secretoPublico(db.prepare('SELECT * FROM secretos WHERE id = ?').get(f.id), { huellaActual: huellaDeAhora(config), ahora }), efecto };
  });
}

// Desactiva una clave (no se borra: se puede activar otra vez). Devuelve { secreto, efecto }.
export function desactivarSecreto(db, config, { id, usuarioId = null, ahora = Date.now(), trasCambio = null }) {
  return enTransaccion(db, () => {
    const f = filaParaCambiar(db, id);
    if (f.estado === 'activa') {
      db.prepare("UPDATE secretos SET estado = 'desactivada', cambiado_por = ?, cambiado_en = ? WHERE id = ?").run(usuarioId, iso(ahora), f.id);
      auditar(db, { usuarioId, accion: 'clave_desactivada', detalle: `${f.uso} …${f.final} (n.º ${f.id})` });
    }
    const efecto = trasCambio ? trasCambio(db, { uso: f.uso, espacioId: f.espacio_id }) : null;
    return { secreto: secretoPublico(db.prepare('SELECT * FROM secretos WHERE id = ?').get(f.id), { huellaActual: huellaDeAhora(config), ahora }), efecto };
  });
}

// Lo que dijo la última prueba gratis de la clave (un motivo de MOTIVOS: 'ok', 'clave_no_valida'…).
export function anotarPrueba(db, { id, motivo, ahora = Date.now() }) {
  exigirMotivo(motivo);
  return db.prepare('UPDATE secretos SET probado_en = ?, prueba = ? WHERE id = ?').run(iso(ahora), motivo, numero(id)).changes > 0;
}

// La última vez que el proveedor respondió a un uso pagado con esta clave.
export function anotarUso(db, { id, ahora = Date.now() }) {
  return db.prepare('UPDATE secretos SET usado_en = ? WHERE id = ?').run(iso(ahora), numero(id)).changes > 0;
}

// Pone la clave en pausa. hastaMs = null: hasta que el dueño la reanude («pausa del dueño»); con un número: se pasa
// sola a esa hora («pausa corta»). Nunca baja una pausa del dueño a una corta, y una corta solo se alarga.
export function pausarSecreto(db, { id, motivo, hastaMs = null, ahora = Date.now() }) {
  exigirMotivo(motivo);
  return enTransaccion(db, () => {
    const f = db.prepare('SELECT * FROM secretos WHERE id = ?').get(numero(id));
    if (!f) return false;
    const vigente = pausaVigente(f, ahora);
    const momento = iso(ahora);
    if (hastaMs == null) {
      if (vigente?.admin) return false; // ya está en pausa del dueño: se queda el primer motivo
      db.prepare('UPDATE secretos SET pausa_motivo = ?, pausa_desde = ?, pausa_hasta = NULL WHERE id = ?').run(motivo, momento, f.id);
      return true;
    }
    if (vigente?.admin) return false;
    const hasta = Math.max(Number(hastaMs), vigente?.hasta ? Date.parse(vigente.hasta) : 0);
    db.prepare('UPDATE secretos SET pausa_motivo = ?, pausa_desde = ?, pausa_hasta = ? WHERE id = ?')
      .run(vigente ? f.pausa_motivo : motivo, vigente ? f.pausa_desde : momento, iso(hasta), f.id);
    return true;
  });
}

// Quita una pausa CORTA (el proveedor volvió a responder bien). Una pausa del dueño solo la quita el dueño.
export function quitarPausaCorta(db, { id }) {
  return db.prepare('UPDATE secretos SET pausa_motivo = NULL, pausa_desde = NULL, pausa_hasta = NULL WHERE id = ? AND pausa_hasta IS NOT NULL')
    .run(numero(id)).changes > 0;
}

// El dueño la reanuda («Probar y reanudar», después de que la prueba gratis pasó). Queda en la auditoría.
export function reanudarSecreto(db, { id, usuarioId = null }) {
  return enTransaccion(db, () => {
    const f = db.prepare('SELECT * FROM secretos WHERE id = ?').get(numero(id));
    if (!f?.pausa_motivo) return false;
    db.prepare('UPDATE secretos SET pausa_motivo = NULL, pausa_desde = NULL, pausa_hasta = NULL WHERE id = ?').run(f.id);
    auditar(db, { usuarioId, accion: 'clave_reanudada', detalle: `${f.uso} …${f.final} (n.º ${f.id}, estaba en pausa: ${f.pausa_motivo})` });
    return true;
  });
}

// ¿Se puede usar esta fila ahora? { si, motivo }. huellaActual: la de la llave de ahora (null = no se puede leer).
export function secretoUsable(fila, ahoraMs = Date.now(), huellaActual = null) {
  if (!fila || fila.estado !== 'activa') return { si: false, motivo: 'sin_clave' };
  if (huellaActual == null) return { si: false, motivo: 'llave_no_disponible' };
  if (fila.llave_huella !== huellaActual || fila.esquema !== ESQUEMA_CIFRADO) return { si: false, motivo: 'clave_ilegible' };
  if (PRUEBAS_QUE_INUTILIZAN.includes(fila.prueba)) return { si: false, motivo: fila.prueba };
  if (pausaVigente(fila, ahoraMs)) return { si: false, motivo: 'proveedor_en_pausa' };
  return { si: true, motivo: null };
}
