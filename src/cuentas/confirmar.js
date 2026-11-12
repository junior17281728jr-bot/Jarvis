// 0.12.3: el administrador hace TODO desde el enlace público (sin Tailscale), con su sesión de administrador. Lo delicado
// (los datos del banco y los paquetes, las claves de la IA, el token del bot y unir el chat de Telegram, la contraseña de
// otra persona, crear o tocar a otro administrador, la clave de recuperación de las copias) pide además, EN ESE PEDIDO,
// su propia contraseña otra vez (cabecera X-Confirmar-Clave, en base64 de UTF-8; nunca se guarda ni se anota).
//  - Desde la cuenta de Tailscale del dueño (la del enlace https de su red) no se le pide: Tailscale ya dijo quién es.
//  - 0.12.6 (pedido del dueño): una contraseña mala NUNCA cierra la sesión ni bloquea: se puede probar las veces que
//    quiera. Contra un programa que adivina, el servidor tarda en contestar (Freno, src/nucleo/limites.js: 5 sin espera,
//    después 1, 2, 4… hasta 8 s, por cuenta y lugar) y, con 20 contraseñas malas de un administrador en una hora (al
//    entrar, al cambiar la suya o aquí), queda UN aviso «Muchos intentos de contraseña fallidos en tu cuenta».
//  - Cada cambio delicado deja una línea en la auditoría («cambio_admin», con la hora y QUÉ cambió, nunca el valor de un
//    secreto) y un aviso para el administrador (en la pantalla y, si está unido, por Telegram).
// Crear el PRIMER administrador sigue siendo solo desde la red de Tailscale (src/api/cuentas.js).
import { ErrorHttp } from '../nucleo/http.js';
import { Freno, Limitador } from '../nucleo/limites.js';
import { verificarClave } from './claves.js';
import { auditar, buscarPorId } from './usuarios.js';
import { duenoDeTailscale } from './tailscale.js';
import { abrirAviso } from '../avisos/avisos.js';

export const CABECERA_CLAVE = 'x-confirmar-clave';
// 0.12.6: con tantas contraseñas malas de un administrador en una hora, un aviso (nunca un bloqueo).
export const FALLOS_PARA_AVISO = 20;
// Lo que puede decir un aviso o la auditoría de un cambio (la pantalla y Telegram tienen una frase para cada uno).
export const ACCIONES_ADMIN = Object.freeze([
  'datos_pago', 'clave_ia', 'clave_ia_activa', 'token_telegram', 'telegram_unir', 'telegram_dejar', 'clave_otro',
  'admin_creado', 'admin_activo', 'admin_nombre', 'clave_copias', 'clave_bloqueada', 'claves_fallidas',
  'codigo_respaldo', 'codigo_respaldo_usado',
]);
// ('clave_bloqueada' ya no se anota desde la 0.12.6, pero queda: la historia de antes la muestra.)

// freno: la espera antes de contestar (por administrador y lugar). alerta: las contraseñas malas de cada administrador en
// una hora (la comparten entrar y cambiar la suya, src/api/cuentas.js). dormir/reloj: solo para las pruebas.
export function crearLimitesConfirmar({ dormir, reloj } = {}) {
  return {
    freno: new Freno({ dormir, reloj }),
    alerta: new Limitador({ maximo: FALLOS_PARA_AVISO, ventanaMs: 60 * 60 * 1000 }),
  };
}

// Una contraseña mala de un administrador: al llegar a FALLOS_PARA_AVISO en la hora, un aviso (una sola vez por hora).
export function anotarFalloAdmin(db, alerta, usuario, ahora = Date.now()) {
  if (!alerta || !usuario || usuario.rol !== 'admin') return;
  alerta.permitir(String(usuario.id), ahora);
  if (alerta.registro.get(String(usuario.id))?.cuenta === FALLOS_PARA_AVISO) anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'claves_fallidas', ahora });
}

function claveDeCabecera(req) {
  const v = req.headers?.[CABECERA_CLAVE];
  if (typeof v !== 'string' || !v || v.length > 1400 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return null;
  const texto = Buffer.from(v, 'base64').toString('utf8');
  return texto || null;
}

// Anota un cambio delicado: una fila de la auditoría (hora, quién, qué) y un aviso abierto con su propia clave
// («cambio_admin:<acción>:<n.º de la auditoría>»). detalle: solo datos simples que no son secretos (nombres de campos,
// el uso de una clave, el usuario tocado).
export function anotarCambioAdmin(db, { usuarioId = null, accion, detalle = {}, como = null, ahora = Date.now() }) {
  if (!ACCIONES_ADMIN.includes(accion)) throw new Error(`Acción no válida: ${accion}`);
  const datos = JSON.stringify({ accion, ...detalle, ...(como ? { como } : {}) }).slice(0, 500);
  const r = db.prepare('INSERT INTO auditoria (fecha, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)')
    .run(new Date(ahora).toISOString(), usuarioId, 'cambio_admin', datos);
  abrirAviso(db, { clave: `cambio_admin:${accion}:${Number(r.lastInsertRowid)}`, nivel: 'atencion', detalle: { accion, ...detalle }, ahora });
  return Number(r.lastInsertRowid);
}

// Lanza ErrorHttp si falta la contraseña o no es la suya. → { como: 'tailscale' | 'clave' }.
export async function confirmarClave({ db, req, usuario, cliente = '-', limites }) {
  if (!usuario || usuario.rol !== 'admin') throw new ErrorHttp(403, 'solo_admin');
  if (duenoDeTailscale(db, req, usuario, { anotar: true }).si) return { como: 'tailscale' };
  const clave = claveDeCabecera(req);
  if (!clave) throw new ErrorHttp(403, 'confirmar_clave');
  const llave = `${usuario.id}|${cliente}`;
  // El turno se aparta ANTES de calcular la contraseña (muchos pedidos a la vez se escalonan; ninguno espera más de 8 s).
  await limites.freno.esperarTurno(llave);
  const fila = buscarPorId(db, usuario.id);
  if (!(await verificarClave(clave, fila?.clave_hash))) {
    auditar(db, { usuarioId: usuario.id, accion: 'clave_confirmar_fallida' });
    anotarFalloAdmin(db, limites.alerta, usuario);
    throw new ErrorHttp(403, 'clave_confirmar_incorrecta');
  }
  limites.freno.olvidar(llave);
  return { como: 'clave' };
}

// Para la pantalla: los últimos cambios delicados (lo de la auditoría, sin secretos).
export function historialAdmin(db, { limite = 50 } = {}) {
  return db.prepare(`SELECT a.id, a.fecha, a.detalle, u.nombre FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.accion = 'cambio_admin' ORDER BY a.id DESC LIMIT ?`).all(Math.max(1, Math.min(200, limite))).map(f => {
    let d = {};
    try { d = JSON.parse(f.detalle) ?? {}; } catch { d = {}; }
    const limpio = {};
    for (const [k, v] of Object.entries(d)) if (/^[a-zA-Z]{1,30}$/.test(k) && (typeof v === 'string' || Number.isSafeInteger(v) || (Array.isArray(v) && v.every(x => typeof x === 'string')))) limpio[k] = v;
    return { id: f.id, fecha: f.fecha, por: f.nombre ?? null, ...limpio };
  });
}
