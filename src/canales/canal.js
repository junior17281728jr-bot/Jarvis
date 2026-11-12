// Los CANALES: por dónde OPORTIA habla con una persona. Hoy uno solo: el chat privado del dueño con su bot de
// Telegram (avisos graves y copias de cada noche). Genérico a propósito: la fase 3 agrega WhatsApp o Gmail como otro
// adaptador (un archivo como src/canales/telegram.js registrado aquí) sin cambiar a quien los usa.
//
// Un adaptador es un objeto con { id, nombre, hostOficial, limites: { textoMax, leyendaMax, subirMaxBytes,
// bajarMaxBytes, pausaArchivosMs } } y estos métodos. Cada uno RESUELVE siempre (nunca lanza por la red) con
// { motivo, esperarMs?, …datos }; motivo es uno de MOTIVOS_CANAL.
//   probar(cred)                                                        → { motivo, cuenta: { id, usuario, nombre } }
//   enviarTexto(cred, { destino, texto, silencioso })                  → { motivo, mensajeId, quizas? } (quizas: quizás llegó)
//   enviarArchivo(cred, { destino, nombre, datos: Blob|Buffer, leyenda, silencioso })
//                                                                       → { motivo, mensajeId, archivo: { id, idUnico, bytes } }
//   fijar(cred, { destino, mensajeId })                                 → { motivo }
//   archivo(cred, { archivoId })                                        → { motivo, ruta, bytes }
//   bajar(cred, { ruta, topeBytes, alTrozo })                           → { motivo, bytes }        (por pedazos)
//   recibir(cred, { desde, limite, esperaS = 0 })                       → { motivo, mensajes: [{ updateId, fecha, chat: { id, tipo },
//                                                                          de: { id, esBot, nombre }, texto, documento }], siguiente }
//   fijado(cred, { destino })                                           → { motivo, mensajeId, documento }
// cred sale SOLO de src/canales/credencial.js (conCredencial): el token nunca entra en un resultado, un registro, un
// error, un aviso ni una fila de la base.
import { TELEGRAM } from './telegram.js';

export const MOTIVOS_CANAL = Object.freeze(['ok', 'clave_no_valida', 'bloqueado', 'chat_no_existe', 'demasiado_grande',
  'limite', 'conflicto', 'bot_ocupado', 'pedido_no_valido', 'error_servidor', 'sin_red', 'tiempo_agotado',
  'respuesta_no_valida', 'rechazado', 'cancelado', 'error_local', 'sin_clave', 'credencial_cambiada']);

export const ADAPTADORES = Object.freeze({ telegram: TELEGRAM });

// Los valores que se guardan en la base (migración 6 no tiene CHECK: se revisan aquí, y una prueba revisa la base).
export const TIPOS_CANAL = Object.freeze(['telegram']);
export const PROPOSITOS_CANAL = Object.freeze(['avisos_dueno']);
// 'por_confirmar' (ronda 3): el código llegó desde un chat; falta escribir en la pantalla el segundo código que el bot le
// mandó a ese chat.
export const ESTADOS_CANAL = Object.freeze(['pendiente', 'por_confirmar', 'vencido', 'activo', 'bloqueado', 'perdido', 'desvinculado']);
// 0.12.8: 'comando' (lo que el bot contesta al dueño, y «Probar el bot») y 'contrato' (un contrato firmado como archivo):
// con sus propios topes (src/canales/bot.js), nunca en los de los avisos.
export const CLASES_ENVIO = Object.freeze(['aviso', 'cierre', 'resumen', 'prueba', 'bienvenida', 'copia_parte', 'copia_indice', 'comando', 'contrato']);
// 'dudoso' (ronda 3): salió y no se sabe si llegó (se cortó la respuesta): cuenta para los topes como uno enviado.
export const RESULTADOS_ENVIO = Object.freeze(['enviado', 'agrupado', 'silenciado', 'no_va', 'antes_de_conectar', 'fallido', 'vencido', 'dudoso']);
// Qué uso de clave (src/claves/usos.js, parte e paso 2) guarda el token de cada tipo de canal.
export const USO_DE_CANAL = Object.freeze({ telegram: 'telegram_bot' });

export function adaptador(tipo) {
  return Object.hasOwn(ADAPTADORES, tipo) ? ADAPTADORES[tipo] : null;
}

// ¿Se puede volver a intentar más tarde? (la red, el servidor del canal o «espera un poco»).
export function esPasajero(motivo) {
  return ['limite', 'sin_red', 'tiempo_agotado', 'error_servidor', 'respuesta_no_valida'].includes(motivo);
}
