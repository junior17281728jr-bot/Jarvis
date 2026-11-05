// La configuración de la IA (tabla ajustes, clave 'ia.config'). La IA llega APAGADA y con tope US$0: no gasta ni un
// centavo hasta que el dueño la enciende y pone un tope. Un valor que falta o no se entiende se lee como apagada.
//  - Cada cambio deja una fila en la auditoría con lo que cambió (antes y después; nunca una clave).
//  - Encender necesita: una clave probada que funcione, un tope mayor que 0 y el precio oficial confirmado del modelo.
//  - «Ayuda en proyectos» (ayudaProyectos) es el «sí» del dueño a la ayuda de la fase 1 y necesita la IA encendida.
//  - Apagar se puede siempre (también desde la consola: oportia-admin.mjs --ia=no) y no toca ayudaProyectos.
//  - Si ya no queda ninguna clave probada mientras la IA está encendida, la IA se apaga sola: una clave nueva nunca
//    vuelve a gastar sin un «Encender» nuevo del dueño.
//  - Ronda 4 de revisión: una clave probada que está EN PAUSA (por ejemplo, sin crédito) no apaga la IA al cambiar el
//    tope o un proveedor: la IA sigue «En espera» y vuelve sola cuando el dueño toca «Probar y reanudar». Cuando un
//    cambio sí la apaga, se dice por qué (informe.apagadaPor) y la pantalla lo muestra.
import { enTransaccion } from '../nucleo/db.js';
import { ErrorHttp } from '../nucleo/http.js';
import { auditar } from '../cuentas/usuarios.js';
import { PLANES } from '../cuentas/planes.js';
import { mesCobro } from '../tareas/tiempo.js';
import { estadoLlave } from '../claves/cifrado.js';
import { pausaVigente } from '../claves/almacen.js';
import { precioDe } from './precios.js';
import { PROVEEDORES } from './proveedores/index.js';
import { revisarUmbrales, resolverAvisosDeTope } from './gasto.js';
import { esEspacioAdmin, topeEspacioMicro } from './topes.js';

export { esEspacioAdmin, topeEspacioMicro };

export const CLAVE_AJUSTE_IA = 'ia.config';
export const LIMITES_IA = Object.freeze({
  topeGeneralMaxMicro: 100_000_000, // US$100 al mes
  topePlanMaxMicro: 20_000_000, // US$20 al mes por cuenta
  centavoMicro: 10_000, // los topes van con hasta 2 decimales
  llamadasPorHoraMin: 1,
  llamadasPorHoraMax: 600,
});
export const ORIGENES_CAMBIO = Object.freeze(['pantalla', 'consola', 'automatico']);

export const CONFIG_POR_DEFECTO = Object.freeze({
  version: 1,
  encendida: false,
  topeGeneralMicro: 0,
  topesPlanMicro: Object.freeze(Object.fromEntries(PLANES.map(p => [p, 0]))),
  proveedores: Object.freeze({
    anthropic: Object.freeze({ usar: true, modelo: 'claude-haiku-5-5' }),
    openai: Object.freeze({ usar: false, modelo: 'gpt-6-luna' }),
  }),
  orden: Object.freeze(['anthropic', 'openai']),
  llamadasPorHora: 30,
  ayudaProyectos: false,
  cambiadoEn: null,
  cambiadoPor: null,
  origen: null,
});

const MODELO = /^[a-z][a-z0-9._-]{1,60}$/;
const topeValido = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max && n % LIMITES_IA.centavoMicro === 0;

// Siempre devuelve una configuración válida: lo que no se entiende vuelve a su valor por defecto (apagada, tope 0).
export function normalizarConfig(valor) {
  const d = CONFIG_POR_DEFECTO;
  const v = valor && typeof valor === 'object' && !Array.isArray(valor) && valor.version === 1 ? valor : {};
  const topesPlanMicro = {};
  for (const plan of PLANES) {
    const n = v.topesPlanMicro?.[plan];
    topesPlanMicro[plan] = topeValido(n, LIMITES_IA.topePlanMaxMicro) ? n : 0;
  }
  const proveedores = {};
  for (const [id, defecto] of Object.entries(d.proveedores)) {
    const p = v.proveedores?.[id];
    proveedores[id] = {
      usar: typeof p?.usar === 'boolean' ? p.usar : defecto.usar,
      modelo: typeof p?.modelo === 'string' && MODELO.test(p.modelo) ? p.modelo : defecto.modelo,
    };
  }
  const orden = Array.isArray(v.orden) && v.orden.length === Object.keys(PROVEEDORES).length && new Set(v.orden).size === v.orden.length
    && v.orden.every(id => Object.hasOwn(PROVEEDORES, id)) ? [...v.orden] : [...d.orden];
  const llamadas = v.llamadasPorHora;
  return {
    version: 1,
    encendida: v.encendida === true,
    topeGeneralMicro: topeValido(v.topeGeneralMicro, LIMITES_IA.topeGeneralMaxMicro) ? v.topeGeneralMicro : 0,
    topesPlanMicro,
    proveedores,
    orden,
    llamadasPorHora: Number.isSafeInteger(llamadas) && llamadas >= LIMITES_IA.llamadasPorHoraMin && llamadas <= LIMITES_IA.llamadasPorHoraMax ? llamadas : d.llamadasPorHora,
    ayudaProyectos: v.ayudaProyectos === true,
    cambiadoEn: typeof v.cambiadoEn === 'string' ? v.cambiadoEn.slice(0, 40) : null,
    cambiadoPor: Number.isSafeInteger(v.cambiadoPor) ? v.cambiadoPor : null,
    origen: ORIGENES_CAMBIO.includes(v.origen) ? v.origen : null,
  };
}

// ¿Alguna cuenta (que no es la del administrador) puede gastar IA? Sí, si algún plan tiene un tope mayor que 0. Mientras
// sea así, lo que da acceso a ese dinero (crear cuentas, cambiar planes, reiniciar o volver a activar una cuenta) solo se
// hace desde la red de Tailscale (src/api/cuentas.js).
export function algunTopeDePlan(cfg) {
  return PLANES.some(plan => (cfg?.topesPlanMicro?.[plan] ?? 0) > 0);
}

export function leerConfigIa(db) {
  let fila = null;
  try { fila = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_AJUSTE_IA); } catch { fila = null; }
  if (!fila) return normalizarConfig(null);
  try { return normalizarConfig(JSON.parse(fila.valor)); } catch { return normalizarConfig(null); }
}

// Dólares (texto o número, hasta 2 decimales) → µUSD. Fuera de 0…max: 400 tope_no_valido.
export function usdAMicro(valor, maxMicro) {
  const texto = typeof valor === 'number' && Number.isFinite(valor) ? String(valor) : typeof valor === 'string' ? valor.trim() : '';
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(texto)) throw new ErrorHttp(400, 'tope_no_valido');
  const [enteros, decimales = ''] = texto.split('.');
  const micro = Number(enteros) * 1_000_000 + Number(decimales.padEnd(2, '0')) * LIMITES_IA.centavoMicro;
  if (!topeValido(micro, maxMicro)) throw new ErrorHttp(400, 'tope_no_valido');
  return micro;
}

// Cómo está cada proveedor para ENCENDER la IA (versión estricta: la clave pasó su prueba gratis y no está en pausa del
// dueño). seguir: para una IA que YA está encendida, una pausa no cuenta (la IA queda «En espera», no se apaga).
//   { id, usar, modelo, precio, clave, listo }
export function proveedoresParaEncender(db, config, cfg = leerConfigIa(db), ahora = Date.now(), { seguir = false } = {}) {
  const llave = estadoLlave(config);
  return cfg.orden.map(id => {
    const p = cfg.proveedores[id];
    const adaptador = PROVEEDORES[id];
    const precio = precioDe(id, p.modelo) != null;
    const fila = db.prepare("SELECT * FROM secretos WHERE uso = ? AND espacio_id IS NULL AND estado = 'activa' ORDER BY id DESC LIMIT 1").get(adaptador.uso);
    const pausa = pausaVigente(fila, ahora);
    const clave = Boolean(fila && llave.listo && fila.llave_huella === llave.huella && fila.prueba === 'ok' && (seguir || !pausa?.admin));
    return { id, usar: p.usar, modelo: p.modelo, precio, clave, listo: p.usar && precio && clave };
  });
}

// Qué falta para encender: [] si nada. 'proveedor' (ningún proveedor tiene «Usar …» encendido: entonces no se habla de
// clave ni de precio, que sí están) | 'clave' | 'tope' | 'precio'. seguir: ver proveedoresParaEncender.
export function faltaParaEncender(db, config, cfg = leerConfigIa(db), ahora = Date.now(), { seguir = false } = {}) {
  const faltan = [];
  const lista = proveedoresParaEncender(db, config, cfg, ahora, { seguir }).filter(p => p.usar);
  if (!lista.length) faltan.push('proveedor');
  else if (!lista.some(p => p.listo)) {
    if (!lista.some(p => p.clave)) faltan.push('clave');
    if (!lista.some(p => p.precio)) faltan.push('precio');
    if (!faltan.length) faltan.push('clave'); // hay clave y hay precio, pero no del mismo proveedor
  }
  if (cfg.topeGeneralMicro <= 0) faltan.push('tope');
  return faltan;
}

function cambiosValidados(cfg, cambios) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) throw new ErrorHttp(400, 'datos_no_validos');
  const nueva = structuredClone(cfg);
  if ('encendida' in cambios) {
    if (typeof cambios.encendida !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    nueva.encendida = cambios.encendida;
  }
  if ('ayudaProyectos' in cambios) {
    if (typeof cambios.ayudaProyectos !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    nueva.ayudaProyectos = cambios.ayudaProyectos;
  }
  if ('topeGeneralMicro' in cambios) {
    if (!topeValido(cambios.topeGeneralMicro, LIMITES_IA.topeGeneralMaxMicro)) throw new ErrorHttp(400, 'tope_no_valido');
    nueva.topeGeneralMicro = cambios.topeGeneralMicro;
  }
  if ('topesPlanMicro' in cambios) {
    const t = cambios.topesPlanMicro;
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new ErrorHttp(400, 'tope_no_valido');
    for (const [plan, n] of Object.entries(t)) {
      if (!PLANES.includes(plan) || !topeValido(n, LIMITES_IA.topePlanMaxMicro)) throw new ErrorHttp(400, 'tope_no_valido');
      nueva.topesPlanMicro[plan] = n;
    }
  }
  if ('usar' in cambios) {
    const u = cambios.usar;
    if (!u || typeof u !== 'object' || Array.isArray(u)) throw new ErrorHttp(400, 'datos_no_validos');
    for (const [id, valor] of Object.entries(u)) {
      if (!Object.hasOwn(nueva.proveedores, id) || typeof valor !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
      nueva.proveedores[id].usar = valor;
    }
  }
  const otras = Object.keys(cambios).filter(k => !['encendida', 'ayudaProyectos', 'topeGeneralMicro', 'topesPlanMicro', 'usar'].includes(k));
  if (otras.length) throw new ErrorHttp(400, 'datos_no_validos');
  return nueva;
}

// Lo que cambió, campo por campo (para la auditoría: corto y sin claves).
function diferencias(antes, despues) {
  const a = {};
  const d = {};
  for (const campo of ['encendida', 'ayudaProyectos', 'topeGeneralMicro', 'llamadasPorHora']) {
    if (antes[campo] !== despues[campo]) { a[campo] = antes[campo]; d[campo] = despues[campo]; }
  }
  for (const plan of PLANES) {
    if (antes.topesPlanMicro[plan] !== despues.topesPlanMicro[plan]) { a[`tope_${plan}`] = antes.topesPlanMicro[plan]; d[`tope_${plan}`] = despues.topesPlanMicro[plan]; }
  }
  for (const id of Object.keys(despues.proveedores)) {
    if (antes.proveedores[id]?.usar !== despues.proveedores[id].usar) { a[`usar_${id}`] = antes.proveedores[id]?.usar; d[`usar_${id}`] = despues.proveedores[id].usar; }
  }
  return { antes: a, despues: d, hay: Object.keys(d).length > 0 };
}

// Guarda cambios de la configuración. cambios: { encendida?, ayudaProyectos?, topeGeneralMicro?, topesPlanMicro?,
// usar?: { anthropic?, openai? } } (topes en µUSD; las rutas pasan los dólares por usdAMicro).
// 400 datos_no_validos / tope_no_valido · 409 ia_falta (detalle: { faltan }). Devuelve la configuración nueva.
// informe (opcional): si el cambio apagó la IA sin pedirlo, queda informe.apagadaPor = [lo que falta] (para la pantalla).
export function guardarConfigIa(db, cambios, { config, usuarioId = null, origen = 'pantalla', ahora = Date.now(), informe = null } = {}) {
  if (!ORIGENES_CAMBIO.includes(origen)) throw new Error(`origen no válido: ${origen}`);
  if (informe && typeof informe === 'object') informe.apagadaPor = null;
  return enTransaccion(db, () => {
    const antes = leerConfigIa(db);
    const nueva = cambiosValidados(antes, cambios);
    const falta = faltan => { throw new ErrorHttp(409, 'ia_falta', { faltan }); };
    // Activar un proveedor para gastar: solo con su precio oficial confirmado.
    for (const [id, p] of Object.entries(nueva.proveedores)) {
      if (p.usar && !antes.proveedores[id].usar && precioDe(id, p.modelo) == null) falta(['precio']);
    }
    // Encender (o seguir encendida tras un cambio): todo lo necesario tiene que estar.
    // Si ya estaba encendida, una clave en pausa no cuenta como «falta» (sigue «En espera»): solo se apaga si de verdad
    // queda sin proveedor, sin clave probada, sin precio o con tope 0, y entonces se dice por qué.
    let apagadaPor = null;
    if (nueva.encendida && (!antes.encendida || 'usar' in cambios || 'topeGeneralMicro' in cambios)) {
      const faltan = faltaParaEncender(db, config, nueva, ahora, { seguir: antes.encendida });
      if (faltan.length) {
        if (antes.encendida && !('encendida' in cambios)) { nueva.encendida = false; apagadaPor = faltan; } // un cambio que la deja sin nada: se apaga
        else falta(faltan);
      }
    }
    if (nueva.ayudaProyectos && !antes.ayudaProyectos && !nueva.encendida) falta(['encendida']);
    const cambio = diferencias(antes, nueva);
    if (!cambio.hay) return antes;
    nueva.cambiadoEn = new Date(ahora).toISOString();
    nueva.cambiadoPor = Number.isSafeInteger(usuarioId) ? usuarioId : null;
    nueva.origen = origen;
    db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
      ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`)
      .run(CLAVE_AJUSTE_IA, JSON.stringify(nueva), nueva.cambiadoEn);
    auditar(db, { usuarioId, accion: 'ia_config', detalle: JSON.stringify({ antes: cambio.antes, despues: cambio.despues, origen, ...(apagadaPor ? { apagadaPor } : {}) }) });
    if (apagadaPor && informe && typeof informe === 'object') informe.apagadaPor = [...apagadaPor];
    // Un tope que cambió: se cierra el aviso de este mes de ese tope y se mira otra vez (subir el tope cierra el
    // «tope lleno»; la historia queda: si vuelve, es un aviso nuevo).
    const mes = mesCobro(ahora);
    const cambioGeneral = antes.topeGeneralMicro !== nueva.topeGeneralMicro;
    const cambioPlanes = PLANES.some(p => antes.topesPlanMicro[p] !== nueva.topesPlanMicro[p]);
    if (cambioGeneral || cambioPlanes) {
      const cerrados = resolverAvisosDeTope(db, { mes, ahora, filtro: a => (a === 'general' ? cambioGeneral : a.startsWith('e') && cambioPlanes) });
      const ambitos = new Set(cerrados);
      if (cambioGeneral) ambitos.add('general');
      if (cambioPlanes) {
        for (const f of db.prepare('SELECT DISTINCT espacio_id FROM ia_llamadas WHERE mes = ? AND espacio_id IS NOT NULL').all(mes)) {
          if (!esEspacioAdmin(db, f.espacio_id)) ambitos.add(`e${f.espacio_id}`);
        }
      }
      revisarUmbrales(db, { mes, ambitos: [...ambitos], ahora, cfg: nueva });
    }
    return nueva;
  });
}

// Después de desactivar o cambiar una clave: si la IA está encendida y ya no queda un proveedor listo (clave probada y
// precio confirmado), se apaga (queda en la auditoría). Devuelve true si la apagó.
export function apagarSiNoQuedaProveedor(db, config, { usuarioId = null, ahora = Date.now() } = {}) {
  return enTransaccion(db, () => {
    const cfg = leerConfigIa(db);
    if (!cfg.encendida) return false;
    // Una clave probada en pausa no la apaga (la IA queda «En espera»); una clave nueva sin probar, sí.
    const faltan = faltaParaEncender(db, config, cfg, ahora, { seguir: true }).filter(f => f !== 'tope');
    if (!faltan.length) return false;
    guardarConfigIa(db, { encendida: false }, { config, usuarioId, origen: 'automatico', ahora });
    return true;
  });
}
