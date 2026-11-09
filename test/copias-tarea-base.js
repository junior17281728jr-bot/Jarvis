// Ayuda común para las pruebas de la parte e, paso 2 (no es un archivo *.test.js): una base con su dueño, una clave de
// recuperación de verdad (al azar, confirmada como lo hace la página), el Telegram FALSO con el bot y el chat del dueño
// unidos por el camino de verdad (código de un uso), y el ejecutor de tareas en este mismo proceso con un reloj de mentira.
// Nunca usa internet ni un token de verdad (los tokens se arman al correr).
import './ayuda.js';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { configDePrueba, esperarHasta } from './ayuda.js';
import { crearTelegramFalso, tokenDePrueba } from './telegram-falso.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearPrimerAdmin } from '../src/cuentas/usuarios.js';
import { guardarSecreto } from '../src/claves/almacen.js';
import { probarSecreto } from '../src/claves/probar.js';
import { crearClavePendiente, confirmarClave } from '../src/copias/estado.js';
import { leerClave, derivar } from '../src/copias/clave.js';
import { empezarVinculo, revisarVinculo, confirmarVinculo } from '../src/canales/canales.js';
import { crearEjecutor } from '../src/tareas/ejecutor.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import { nuevaCorrida } from '../src/tareas/corridas.js';
import { MANEJADORES } from '../src/tareas/manejadores.js';
import { encolar } from '../src/tareas/cola.js';
import { crearManejadorCopias } from '../src/copias/hacer.js';

export const SILENCIO = Object.freeze({ log() {}, error() {}, warn() {}, info() {} });
export const BOT = Object.freeze({ id: 7_000_001, usuario: 'oportia_junior_bot' });
export const BOT2 = Object.freeze({ id: 7_000_002, usuario: 'oportia_nuevo_bot' });
export const CHAT = 5_550_001;
export const EXTRANO = 5_550_999;
export const GRUPO = -1_005_550_002;
export const MINUTO = 60_000;
export const HORA = 60 * MINUTO;

// El verificador que calcula la página para una clave escrita (aquí, con el servidor: test 1.2 prueba que dan lo mismo).
export function verificadorDe(texto) {
  const semilla = leerClave(texto);
  const d = derivar(semilla);
  try { return d.verificador.toString('hex'); } finally { semilla.fill(0); d.sello.fill(0); d.verificador.fill(0); }
}

// Crea y confirma una clave de recuperación de verdad. → su texto (para restaurar en la prueba)
export function ponerClave(db, { config, ahora = Date.now(), usuarioId = null } = {}) {
  const r = crearClavePendiente(db, { config, usuarioId, ahora });
  confirmarClave(db, { verificador: verificadorDe(r.clave), usuarioId, ahora });
  return r.clave;
}

// Llena la tabla «ajustes» con datos al azar (no se comprimen): con 16 KiB por fila, unas 4 partes de 64 KiB cada 16 filas.
export function llenarAlAzar(db, { filas = 16, bytes = 16 * 1024, prefijo = 'prueba.relleno' } = {}) {
  const poner = db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)');
  for (let i = 0; i < filas; i++) poner.run(`${prefijo}.${i}.${randomBytes(3).toString('hex')}`, JSON.stringify(randomBytes(bytes).toString('base64')), new Date().toISOString());
}

// El segundo código (ronda 3) que el bot le mandó a un chat (el último), o null.
export function segundoCodigo(falso, chat = CHAT) {
  const m = falso.mensajes.filter(x => x.chatId === String(chat) && typeof x.text === 'string' && x.text.startsWith('🔐')).at(-1);
  const c = m ? /(\d{3}) (\d{3})/.exec(m.text) : null;
  return c ? `${c[1]}${c[2]}` : null;
}

// Termina de unir un chat que quedó «por confirmar»: escribe en la «pantalla» el segundo código que el bot le mandó.
export async function confirmarChat(b, { chat = CHAT } = {}) {
  return confirmarVinculo(b.db, b.config, { codigo: segundoCodigo(b.falso, chat) });
}

// Pregunta como la pantalla (revisarVinculo) y, si quedó «por confirmar», escribe el segundo código (como el dueño).
export async function revisarYConfirmar(b, { chat = CHAT, ...opciones } = {}) {
  const r = await revisarVinculo(b.db, b.config, { cadaMs: 0, ...opciones });
  return r.estado === 'confirmar' ? confirmarChat(b, { chat }) : r;
}

// Une el chat del dueño con el bot por el camino de verdad: código de un uso, «/start <código>» desde su chat privado,
// y el segundo código que el bot le manda a ese chat, escrito en la pantalla (ronda 3).
export async function unirChat(b, { chat = CHAT, nombre = 'Junior' } = {}) {
  const v = await empezarVinculo(b.db, b.config, {});
  b.falso.escribir({ chat, texto: `/start ${v.codigo}` });
  const r = await revisarVinculo(b.db, b.config, { cadaMs: 0 });
  if (r.estado !== 'confirmar') throw new Error(`no se unió el chat: ${JSON.stringify(r)}`);
  const c = await confirmarChat(b, { chat });
  if (c.estado !== 'vinculado') throw new Error(`no se confirmó el chat: ${JSON.stringify(c)}`);
  return { ...v, nombre };
}

// Guarda el token del bot (como la pantalla Claves) y lo prueba gratis contra el Telegram falso.
export async function ponerToken(b, { token = b.token } = {}) {
  const s = guardarSecreto(b.db, b.config, { uso: 'telegram_bot', valor: token, usuarioId: b.admin });
  const p = await probarSecreto(b.db, b.config, { id: s.secreto.id, usuarioId: b.admin });
  return { id: s.secreto.id, motivo: p.motivo };
}

// Todo junto. opciones: telegram (bot + chat unidos), clave, relleno (filas al azar), disco (MB libres), manejador
// (opciones de crearManejadorCopias), adaptador (para envolver el de Telegram en una prueba).
export async function montar({ telegram = true, clave = true, relleno = 16, disco = 100_000, manejador = {}, adaptador = null } = {}) {
  const token = tokenDePrueba(1);
  const token2 = tokenDePrueba(2, 'C');
  const falso = await crearTelegramFalso({
    bots: [{ token, id: BOT.id, usuario: BOT.usuario }, { token: token2, id: BOT2.id, usuario: BOT2.usuario }],
    chats: [{ id: CHAT, nombre: 'Junior' }, { id: EXTRANO, nombre: 'Extraño' }, { id: GRUPO, tipo: 'group', nombre: 'Un grupo' }],
  });
  const base = configDePrueba();
  const config = { ...base, carpetaDatos: dirname(base.archivoBase), canalesBases: Object.freeze({ telegram: falso.url }) };
  const db = abrirBase(config);
  const admin = crearPrimerAdmin(db, { nombre: 'junior', claveHash: 'x' });
  if (relleno) llenarAlAzar(db, { filas: relleno });
  const b = { falso, config, db, admin, token, token2, claveTexto: null, disco: { libre: disco, wal: null }, t: Date.now() };
  b.reloj = () => b.t;
  b.avanzar = ms => { b.t += ms; };
  if (clave) b.claveTexto = ponerClave(db, { config, usuarioId: admin, ahora: b.t });
  if (telegram) {
    b.secretoId = (await ponerToken(b)).id;
    await unirChat(b);
  }
  b.t = Math.max(b.t, Date.now()) + 1000; // el reloj de mentira empieza después de unir el chat (que usa la hora de verdad)
  b.opcionesManejador = {
    tamanoParte: 64 * 1024, pausaArchivosMs: 0, dormir: async () => {}, reloj: b.reloj,
    discoLibreMb: () => b.disco.libre, ...(adaptador ? { adaptador } : {}), ...manejador,
  };
  b.nuevoEjecutor = (extra = {}) => {
    const corrida = nuevaCorrida(db, { version: '0.5.0', codigo: 'prueba', ahora: b.t });
    const escritor = crearEscritor(db, { registro: SILENCIO, dormir: async () => {} });
    const copias = crearManejadorCopias({ ...b.opcionesManejador, ...(extra.manejador ?? {}) });
    b.ejecutor = crearEjecutor({
      db, config, corrida, escritor, manejadores: { ...MANEJADORES, 'copias.hacer': copias }, tiempos: { rssMaxMb: 1e9, graciaAbortoMs: 200, ...(extra.tiempos ?? {}) },
      programas: extra.programas ?? [], memoriaDisponibleMb: () => 1000, discoLibreMb: () => b.disco.libre, pedirSalida: () => {}, log: SILENCIO,
      reloj: b.reloj, version: '0.5.0', codigo: 'prueba',
    });
    return b.ejecutor;
  };
  b.nuevoEjecutor();
  b.tarea = id => db.prepare('SELECT * FROM tareas WHERE id = ?').get(id);
  b.copias = () => db.prepare('SELECT * FROM copias ORDER BY id').all();
  b.partes = copiaId => db.prepare('SELECT * FROM copia_partes WHERE copia_id = ? ORDER BY n, id').all(copiaId);
  b.aviso = clave => db.prepare('SELECT * FROM avisos WHERE clave = ? AND resuelto_en IS NULL').get(clave) ?? null;
  b.pedir = (datos = { origen: 'manual' }) => encolar(db, { tipo: 'copias.hacer', programa: 'copias.hacer', claveUnica: `copias.hacer@prueba-${b.t}-${Math.random()}`, datos }, { ahora: b.t }).id;
  // Da vueltas al ejecutor hasta que la tarea termine; si espera (disponible_en en el futuro), adelanta el reloj.
  b.terminar = async (id, { vueltas = 400 } = {}) => {
    for (let i = 0; i < vueltas; i++) {
      await b.ejecutor.ciclo();
      await esperarHasta(() => !b.ejecutor.estado().enCurso.length, { que: 'el paso terminado', cada: 5, ms: 60_000 });
      const f = b.tarea(id);
      if (['hecha', 'fallida', 'revisar', 'cancelada'].includes(f.estado)) return { ...f, resultado: JSON.parse(f.resultado ?? 'null') };
      if (f.estado === 'lista' && Date.parse(f.disponible_en) > b.t) b.t = Date.parse(f.disponible_en) + 1;
    }
    throw new Error(`la tarea ${id} no terminó: ${JSON.stringify(b.tarea(id))}`);
  };
  b.cerrar = async () => {
    try { await b.ejecutor?.parar({ esperaMs: 0 }); } catch { /* ya parado */ }
    try { db.close(); } catch { /* ya cerrada */ }
    await falso.cerrar();
  };
  return b;
}
