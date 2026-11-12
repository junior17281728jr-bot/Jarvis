// Academia 0.12.0: el «vacilón» del instructor. Frases cortas, entre panas, para cuando se quema (no aprueba), cuando se
// salta las clases y se quema, cuando pierde la racha y cuando vuelve después de días sin estudiar. Suaves y para
// motivar: nunca sobre raza, religión, sexo, cuerpo ni familia, y sin malas palabras fuertes (test/ronda-012.test.js
// lo revisa en los dos idiomas). Los textos están en public/i18n (humor.<tipo>.<n>); aquí solo se elige cuál.
//  - Cada alumno tiene su «bolsa» por tipo: salen todas, sin repetir, antes de volver a empezar (y nunca la misma dos
//    veces seguidas). Va en «ajustes» (academia.humor.bolsa.<alumno>), sin cambio de base.
//  - Encendido por defecto. El administrador lo apaga para todos (academia.humor = '0') y cada alumno para sí en
//    Configuración (academia.humor.alumno.<id> = '0').
//  - Con la IA encendida, el consejo de la IA puede venir en este mismo tono y con las mismas reglas (REGLAS_IA).
import { ErrorHttp } from '../nucleo/http.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';

// El día en Santo Domingo (igual que src/academia/progreso.js; aquí aparte para no importarse en círculo).
const diaDe = ms => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);

export const TIPOS_HUMOR = Object.freeze({ quemado: 12, salto: 10, racha: 9, regreso: 9 });
export const TOTAL_HUMOR = Object.values(TIPOS_HUMOR).reduce((a, b) => a + b, 0);
const MAX_REFERENCIAS = 40;
const DIA = 86_400_000;

export const REGLAS_IA = 'Tono: con humor entre panas («vacilón» suave, como un instructor dominicano que bromea con cariño) para motivar, en una sola frase corta al principio. Nunca te burles de la raza, la religión, el sexo, el cuerpo ni la familia de nadie, nunca insultes y no uses malas palabras. El humor es sobre la situación (se quemó, se saltó las clases, perdió la racha), nunca sobre la persona; después, el consejo serio.';

const claveBolsa = id => `academia.humor.bolsa.${Number(id)}`;
const clavePersonal = id => `academia.humor.alumno.${Number(id)}`;

export const humorDelAdmin = db => leerAjuste(db, 'academia.humor') !== '0';
export const humorDelAlumno = (db, usuarioId) => leerAjuste(db, clavePersonal(usuarioId)) !== '0';
export const humorActivo = (db, usuarioId) => humorDelAdmin(db) && humorDelAlumno(db, usuarioId);

export function encenderHumorAdmin(db, encendido) {
  if (typeof encendido !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, 'academia.humor', encendido ? '1' : '0');
  return encendido;
}
export function encenderHumorAlumno(db, usuarioId, encendido) {
  if (typeof encendido !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, clavePersonal(usuarioId), encendido ? '1' : '0');
  return encendido;
}

function leerBolsa(db, usuarioId) {
  try {
    const v = JSON.parse(leerAjuste(db, claveBolsa(usuarioId)) ?? 'null');
    return { bolsas: v?.bolsas && typeof v.bolsas === 'object' ? v.bolsas : {}, ultima: v?.ultima && typeof v.ultima === 'object' ? v.ultima : {}, refs: Array.isArray(v?.refs) ? v.refs : [] };
  } catch { return { bolsas: {}, ultima: {}, refs: [] }; }
}

// La frase que toca de un tipo: { tipo, clave } (o null si el humor está apagado). «referencia» la ata a algo (un
// intento, un día): volver a mirar ese resultado da la misma frase; «recien» = false no saca una nueva.
export function lineaHumor(db, usuarioId, tipo, { recien = true, referencia = null, azar = Math.random } = {}) {
  const n = TIPOS_HUMOR[tipo];
  if (!n || !humorActivo(db, usuarioId)) return null;
  const b = leerBolsa(db, usuarioId);
  const ya = referencia ? b.refs.find(r => r?.ref === referencia && r?.tipo === tipo) : null;
  if (ya && Number.isSafeInteger(ya.n) && ya.n >= 1 && ya.n <= n) return { tipo, clave: `humor.${tipo}.${ya.n}` };
  if (!recien) return null;
  let bolsa = (Array.isArray(b.bolsas[tipo]) ? b.bolsas[tipo] : []).filter(x => Number.isSafeInteger(x) && x >= 1 && x <= n);
  if (!bolsa.length) {
    bolsa = Array.from({ length: n }, (_, i) => i + 1);
    if (bolsa.length > 1) bolsa = bolsa.filter(x => x !== b.ultima[tipo]); // nunca la misma dos veces seguidas
  }
  const k = Math.min(bolsa.length - 1, Math.floor(azar() * bolsa.length));
  const elegida = bolsa.splice(k, 1)[0];
  b.bolsas[tipo] = bolsa;
  b.ultima[tipo] = elegida;
  if (referencia) b.refs = [...b.refs.filter(r => r?.ref !== referencia), { ref: referencia, tipo, n: elegida }].slice(-MAX_REFERENCIAS);
  guardarAjuste(db, claveBolsa(usuarioId), JSON.stringify(b));
  return { tipo, clave: `humor.${tipo}.${elegida}` };
}

// La racha perdida o el regreso, para Inicio (una frase por día, la misma todo el día):
//  - «regreso»: hoy ya respondió algo y antes llevaba 3 días o más sin estudiar;
//  - «racha»: no estudió ni hoy ni ayer, y la última racha era de 2 días o más.
export function estadoRacha(db, usuarioId, ahoraMs = Date.now()) {
  const dias = db.prepare('SELECT DISTINCT dia FROM academia_respuestas WHERE usuario_id = ? ORDER BY dia DESC LIMIT 60').all(usuarioId).map(f => f.dia);
  if (!dias.length) return null;
  const hoy = diaDe(ahoraMs);
  const ayer = diaDe(ahoraMs - DIA);
  const entre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);
  if (dias[0] === hoy) return dias[1] && entre(dias[1], hoy) >= 3 ? { tipo: 'regreso', dias: entre(dias[1], hoy) } : null;
  if (dias[0] === ayer) return null;
  let racha = 1;
  for (let i = 1; i < dias.length && entre(dias[i], dias[i - 1]) === 1; i++) racha += 1;
  return racha >= 2 ? { tipo: 'racha', racha } : null;
}
export function humorDelDia(db, usuarioId, ahoraMs = Date.now()) {
  const e = estadoRacha(db, usuarioId, ahoraMs);
  if (!e) return null;
  const h = lineaHumor(db, usuarioId, e.tipo, { referencia: `dia:${diaDe(ahoraMs)}` });
  return h ? { ...h, ...e } : null;
}
