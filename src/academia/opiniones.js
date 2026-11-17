// Academia 0.14.26 (pedido del dueño): «¿Cómo te fue con esta clase?» al terminar cada tema y cada examen:
// 👍 Clara / 🤔 Me quedó una duda / 💡 Se puede mejorar, con un texto corto opcional.
// SIN cambio de base y solo agregando (nunca se cambia ni se borra una opinión):
//  - academia.opinion.<n>: { usuarioId, tipo: 'tema'|'examen', materia, tema, voto, texto, en } (el id del alumno solo
//    vive aquí, en el servidor); academia.opinion.siguiente da el número.
//  - Cuenta la ÚLTIMA opinión de cada alumno en cada lugar (si cambia de idea, cuenta la nueva).
// Lo usan:
//  - la «Mejora continua» (src/academia/fabrica-mejora.js): un tema con 3 alumnos o más que dicen «duda» o «se puede
//    mejorar» es evidencia; va al modelo SOLO con números y los textos sin nombres (anonimizar), nunca un id ni un nombre;
//  - Administrador → «Opiniones de los alumnos» (por materia y tema, con «Exportar para el programador»).
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { nombresLegales } from '../cuentas/terminos.js';

export const VOTOS = Object.freeze(['clara', 'duda', 'mejorar']);
export const TIPOS_OPINION = Object.freeze(['tema', 'examen']);
export const TEXTO_OPINION = 300;
export const OPINIONES_POR_DIA = 40;
export const UMBRAL_EVIDENCIA = 3;
const ID = /^[a-z0-9_-]{1,60}$/;
const json = t => { try { return JSON.parse(t ?? 'null'); } catch { return null; } };
const unaLinea = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const claveConsumida = (materia, tema) => `fabrica.evidencia.o.${materia}.${tema}`;

export function guardarOpinion(db, usuarioId, { tipo, materia, tema, voto, texto }, { ahoraMs = Date.now() } = {}) {
  if (!TIPOS_OPINION.includes(tipo) || !VOTOS.includes(voto) || !ID.test(String(materia ?? ''))) throw new ErrorHttp(400, 'datos_no_validos');
  if (tipo === 'tema' && !ID.test(String(tema ?? ''))) throw new ErrorHttp(400, 'datos_no_validos');
  const en = new Date(ahoraMs).toISOString();
  return enTransaccion(db, () => {
    const desde = new Date(ahoraMs - 86_400_000).toISOString();
    const hoy = todas(db).filter(o => o.usuarioId === Number(usuarioId) && o.en >= desde).length;
    if (hoy >= OPINIONES_POR_DIA) throw new ErrorHttp(429, 'demasiados_intentos');
    const n = (Number(leerAjuste(db, 'academia.opinion.siguiente')) || 0) + 1;
    guardarAjuste(db, 'academia.opinion.siguiente', String(n));
    const o = { usuarioId: Number(usuarioId), tipo, materia, tema: tipo === 'tema' ? tema : null, voto, texto: unaLinea(texto, TEXTO_OPINION), en };
    guardarAjuste(db, `academia.opinion.${n}`, JSON.stringify(o));
    return { guardada: true, voto };
  });
}

export function todas(db) {
  return db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'academia.opinion.%' AND clave <> 'academia.opinion.siguiente'").all()
    .map(f => ({ n: Number(f.clave.slice('academia.opinion.'.length)), ...json(f.valor) }))
    .filter(o => Number.isSafeInteger(o.n) && Number.isSafeInteger(o.usuarioId) && VOTOS.includes(o.voto) && TIPOS_OPINION.includes(o.tipo))
    .sort((a, b) => a.n - b.n);
}

// Los nombres que nunca deben salir en un texto que va al modelo o al programador: usuarios, nombres para mostrar y
// nombres legales (cada palabra de 3 letras o más).
export function nombresParaOcultar(db) {
  const palabras = new Set();
  const poner = t => { for (const p of String(t ?? '').split(/[\s._-]+/)) if (p.length >= 3) palabras.add(p.toLowerCase()); };
  for (const u of db.prepare('SELECT nombre, nombre_visible FROM usuarios').all()) { poner(u.nombre); poner(u.nombre_visible); }
  for (const n of nombresLegales(db).values()) poner(n);
  return [...palabras];
}
const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Sin correos, teléfonos, @usuarios ni nombres de la academia.
export function anonimizar(texto, nombres = []) {
  let t = unaLinea(texto, TEXTO_OPINION);
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo]').replace(/@\w+/g, '[usuario]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[número]');
  for (const n of [...nombres].sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(n)}(?=$|[^\\p{L}\\p{N}])`, 'giu'), '$1[nombre]');
  }
  return t;
}

// La última opinión de cada alumno en cada lugar. → Map(lugar → [opinión]).
function ultimasPorLugar(lista) {
  const ultima = new Map();
  for (const o of lista) ultima.set(`${o.tipo}|${o.materia}|${o.tema ?? ''}|${o.usuarioId}`, o);
  const lugares = new Map();
  for (const o of ultima.values()) {
    const k = `${o.tipo}|${o.materia}|${o.tema ?? ''}`;
    if (!lugares.has(k)) lugares.set(k, []);
    lugares.get(k).push(o);
  }
  return lugares;
}

// Para el administrador y el programador: por materia y lugar, los conteos y los textos (sin nombres, sin ids).
export function resumenOpiniones(db, paquete = null) {
  const titulo = (m, t) => paquete?.materias?.find(x => x.id === m)?.temas?.find(x => x.id === t)?.titulo ?? null;
  const nombres = nombresParaOcultar(db);
  const materias = new Map();
  for (const [, lista] of ultimasPorLugar(todas(db))) {
    const { tipo, materia, tema } = lista[0];
    const cuenta = { clara: 0, duda: 0, mejorar: 0 };
    for (const o of lista) cuenta[o.voto] += 1;
    const textos = lista.filter(o => o.texto).sort((a, b) => b.en.localeCompare(a.en)).slice(0, 50).map(o => ({ voto: o.voto, texto: anonimizar(o.texto, nombres), en: o.en }));
    if (!materias.has(materia)) materias.set(materia, []);
    materias.get(materia).push({ tipo, tema, titulo: tema ? titulo(materia, tema) : null, alumnos: lista.length, ...cuenta, textos, ultima: lista.map(o => o.en).sort().at(-1) });
  }
  return [...materias].sort(([a], [b]) => a.localeCompare(b)).map(([materia, lugares]) => ({
    materia,
    lugares: lugares.sort((a, b) => (b.duda + b.mejorar) - (a.duda + a.mejorar) || String(a.tema).localeCompare(String(b.tema))),
  }));
}

// La evidencia para la Mejora continua (solo temas): 3 alumnos o más con «duda» o «se puede mejorar», y 3 nuevos desde
// la última vez que se trabajó. Nunca un id ni un nombre: números y hasta 5 textos sin nombres.
export function evidenciaOpiniones(db) {
  const nombres = nombresParaOcultar(db);
  const out = [];
  for (const [, lista] of ultimasPorLugar(todas(db).filter(o => o.tipo === 'tema'))) {
    const { materia, tema } = lista[0];
    const malas = lista.filter(o => o.voto !== 'clara');
    const consumida = Number(json(leerAjuste(db, claveConsumida(materia, tema)))?.consumida) || 0;
    if (malas.length < UMBRAL_EVIDENCIA || malas.length - consumida < UMBRAL_EVIDENCIA) continue;
    const textos = malas.filter(o => o.texto).sort((a, b) => b.en.localeCompare(a.en)).slice(0, 5).map(o => anonimizar(o.texto, nombres).slice(0, 200));
    out.push({
      tipo: 'opinion', materia, tema, clave: claveConsumida(materia, tema),
      evidencia: { alumnos: malas.length, clara: lista.length - malas.length, duda: malas.filter(o => o.voto === 'duda').length, mejorar: malas.filter(o => o.voto === 'mejorar').length, textos },
      peso: malas.length * 10,
    });
  }
  return out;
}
