// 0.14.70: «Preparar todas las voces» (Claves e IA → ElevenLabs): deja hechos, con ElevenLabs, los audios de todas las
// preguntas del examinador del oral ('oral') o además de todas las tarjetas de las clases ('clases'). Así, después, todo
// se oye con la voz de ElevenLabs aunque ya no haya crédito.
//  - El servidor web arma la lista (solo lo que todavía no tiene audio de nadie) y la guarda en «ajustes», en bloques de
//    100 (el trabajador nunca abre un paquete). El dueño ve antes cuántas letras son y lo confirma.
//  - El trabajador (tarea 'academia.voces', cupo «grande»: nunca ocupa el lugar de los alumnos) la recorre DESPACIO:
//    unos pocos audios por paso, una pausa de 2 s entre pasos, y cada audio aparta sus letras en el tope del mes
//    (apartarLetras): nunca lo pasa. Lo hecho se anota después de cada audio: tras un reinicio sigue donde iba, y un audio
//    que ya existe nunca se paga otra vez.
//  - Si se llena el tope del mes, se acaba el crédito o ElevenLabs queda en pausa: se detiene («en pausa», con el motivo)
//    y el dueño toca «Seguir» cuando quiera. Una pausa corta (ElevenLabs pidió esperar): espera sola y sigue.
import { enTransaccion } from '../nucleo/db.js';
import { encolar } from '../tareas/cola.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { partesDeAlcance } from './voz-textos.js';
import { buscarGuardada, estadoEleven, crearBuscador } from './voz-natural.js';

export const BLOQUE = 100;
export const PREPARAR = Object.freeze({ porPaso: 12, pasoMs: 45_000, esperaMs: 2_000 });
// La frase para probar una voz (se guarda como cualquier otra).
export const MUESTRA_VOZ = Object.freeze({
  es: 'Hola, soy tu examinador. ¿Qué documentos tienen que estar a bordo del avión antes de volar?',
  en: 'Hello, I am your examiner. What documents must be on board the airplane before flight?',
});
const CLAVE = 'vozn.preparar';
const claveBloque = (id, k) => `vozn.preparar.lista.${id}.${k}`;
const iso = ms => new Date(ms).toISOString();
const leerJson = (db, clave) => { try { return JSON.parse(leerAjuste(db, clave) ?? 'null'); } catch { return null; } };

export function leerPreparar(db) {
  const p = leerJson(db, CLAVE);
  if (!p || typeof p !== 'object' || !Number.isSafeInteger(p.id)) return null;
  return {
    id: p.id, alcance: p.alcance, estado: p.estado, motivo: p.motivo ?? null, total: p.total, letras: p.letras, hechos: p.hechos ?? 0,
    letrasHechas: p.letrasHechas ?? 0, pagados: p.pagados ?? 0, saltados: p.saltados ?? 0, empezo: p.empezo ?? null, termino: p.termino ?? null, vuelta: p.vuelta ?? 1,
  };
}
const guardar = (db, p) => guardarAjuste(db, CLAVE, JSON.stringify(p));

// Lo que costaría cada alcance (para decirlo ANTES de empezar). En memoria un minuto por paquete.
let memo = { paquete: null, en: 0, valor: null };
export function estimarPreparar(db, config, paquete, { ahora = Date.now() } = {}) {
  if (memo.paquete === paquete && memo.valor && ahora - memo.en < 60_000) return memo.valor;
  const valor = {};
  const ya = crearBuscador(db, config);
  for (const alcance of ['oral', 'clases']) {
    const partes = partesDeAlcance(paquete, alcance);
    const faltan = partes.filter(x => !ya(x.texto));
    valor[alcance] = { partes: partes.length, letras: partes.reduce((n, x) => n + x.texto.length, 0), faltan: faltan.length, letrasFaltan: faltan.reduce((n, x) => n + x.texto.length, 0) };
  }
  memo = { paquete, en: ahora, valor };
  return valor;
}

function encolarPaso(db, p, ahora) {
  encolar(db, { tipo: 'academia.voces', claveUnica: `vozn.preparar.${p.id}.${p.vuelta}`, datos: { id: p.id }, creadaPor: null }, { ahora });
}

// Empieza (el servidor web). Lanza 409 si ya hay una en curso o si no hay nada que hacer.
export function empezarPreparar(db, config, paquete, { alcance, ahora = Date.now(), usuarioId = null }) {
  const yaVa = leerPreparar(db);
  if (yaVa?.estado === 'en_curso') { const e = new Error('ya_en_curso'); e.codigo = 409; e.clave = 'ya_en_curso'; throw e; }
  const ya = crearBuscador(db, config);
  const lista = partesDeAlcance(paquete, alcance).filter(x => !ya(x.texto));
  const id = (yaVa?.id ?? 0) + 1;
  const p = { id, alcance, estado: lista.length ? 'en_curso' : 'lista', motivo: null, total: lista.length, letras: lista.reduce((n, x) => n + x.texto.length, 0), hechos: 0, letrasHechas: 0, pagados: 0, saltados: 0, empezo: iso(ahora), termino: lista.length ? null : iso(ahora), vuelta: 1, por: usuarioId };
  enTransaccion(db, () => {
    for (let k = 0; k * BLOQUE < lista.length; k++) guardarAjuste(db, claveBloque(id, k), JSON.stringify(lista.slice(k * BLOQUE, (k + 1) * BLOQUE).map(x => [x.texto, x.idioma])));
    guardar(db, p);
    if (lista.length) encolarPaso(db, p, ahora);
  });
  memo = { paquete: null, en: 0, valor: null };
  return leerPreparar(db);
}
export function seguirPreparar(db, { ahora = Date.now() } = {}) {
  return enTransaccion(db, () => {
    const p = leerJson(db, CLAVE);
    if (!p || !['en_pausa', 'parada'].includes(p.estado)) return leerPreparar(db);
    const n = { ...p, estado: 'en_curso', motivo: null, vuelta: (p.vuelta ?? 1) + 1 };
    guardar(db, n);
    encolarPaso(db, n, ahora);
    return leerPreparar(db);
  });
}
export function pararPreparar(db, { ahora = Date.now() } = {}) {
  return enTransaccion(db, () => {
    const p = leerJson(db, CLAVE);
    if (p?.estado === 'en_curso') guardar(db, { ...p, estado: 'parada', motivo: 'parada', termino: iso(ahora) });
    return leerPreparar(db);
  });
}

// Lo que no se arregla repitiendo (este texto, nada más): se salta y sigue con el siguiente.
const SALTAR = Object.freeze(['pedido_no_valido', 'respuesta_no_valida', 'no_se_pudo_guardar']);

// El paso del trabajador. grabar: la llamada a ElevenLabs (src/academia/voz-eleven.js; las pruebas pasan otra).
export function crearManejadorPreparar({ grabar }) {
  async function paso(ctx) {
    const { db, config } = ctx;
    const id = Number(ctx.tarea.datos?.id);
    const p0 = leerJson(db, CLAVE);
    if (!p0 || p0.id !== id || p0.estado !== 'en_curso') return { listo: true, resultado: { motivo: 'sin_pendiente' } };
    const inicio = Date.now();
    let p = { ...p0 };
    let bloque = null;
    let k = -1;
    let hechosEnPaso = 0;
    const anotar = cambios => { p = { ...p, ...cambios }; return ctx.escribir(() => { const ahora = leerJson(db, CLAVE); if (ahora?.id === id && ahora.estado === 'en_curso') guardar(db, p); }); };
    while (p.hechos < p.total) {
      if (ctx.senal?.aborted || hechosEnPaso >= PREPARAR.porPaso || Date.now() - inicio > PREPARAR.pasoMs) return { punto: { hechos: p.hechos }, esperarMs: PREPARAR.esperaMs };
      // ¿El dueño la paró mientras tanto?
      if (leerJson(db, CLAVE)?.estado !== 'en_curso') return { listo: true, resultado: { motivo: 'parada' } };
      const kk = Math.floor(p.hechos / BLOQUE);
      if (kk !== k) { k = kk; bloque = leerJson(db, claveBloque(id, k)); }
      const item = Array.isArray(bloque) ? bloque[p.hechos % BLOQUE] : null;
      if (!Array.isArray(item) || typeof item[0] !== 'string') { await anotar({ hechos: p.hechos + 1, saltados: p.saltados + 1 }); continue; }
      const [texto, idioma] = item;
      if (buscarGuardada(db, config, { texto })) { await anotar({ hechos: p.hechos + 1 }); continue; }
      const r = await grabar(ctx, { texto, idioma });
      hechosEnPaso += 1;
      if (r.motivo === 'ok') { await anotar({ hechos: p.hechos + 1, pagados: p.pagados + 1, letrasHechas: p.letrasHechas + (r.letras ?? texto.length) }); continue; }
      if (SALTAR.includes(r.motivo)) { await anotar({ hechos: p.hechos + 1, saltados: p.saltados + 1 }); continue; }
      // Una pausa corta de ElevenLabs: se espera lo que dure (como mucho 15 min) y sigue sola.
      const e = estadoEleven(db, config);
      if (r.motivo === 'proveedor_en_pausa' && e.hasta && Date.parse(e.hasta) > Date.now()) return { punto: { hechos: p.hechos }, esperarMs: Math.min(15 * 60_000, Date.parse(e.hasta) - Date.now() + 1000) };
      if (['limite_proveedor', 'error_proveedor', 'sin_red', 'tiempo_agotado'].includes(r.motivo)) return { punto: { hechos: p.hechos }, esperarMs: 2 * 60_000 };
      // Tope lleno, sin crédito, sin clave, en pausa del dueño: se detiene (el dueño toca «Seguir»).
      await anotar({ estado: 'en_pausa', motivo: r.motivo });
      return { listo: true, resultado: { motivo: r.motivo } };
    }
    await anotar({ estado: 'lista', termino: new Date().toISOString() });
    return { listo: true, resultado: { motivo: 'ok', hechos: p.hechos } };
  }
  return Object.freeze({ paso });
}
