// Los proveedores de IA que OPORTIA conoce. Agregar uno = un archivo aquí (mismo formato que anthropic.js), su fila
// en src/ia/precios.json, su uso en src/claves/usos.js y sus textos en es.json y en.json.
// Cada adaptador es puro (no usa la red): arma el pedido (pedido, cabeceras, prueba) y lee la respuesta (leer,
// leerPrueba). La ÚNICA llamada a la red es src/ia/llamar.js, que además solo deja ir a su dirección oficial.
import { anthropic } from './anthropic.js';
import { openai } from './openai.js';
import { propia } from './propia.js';

// 0.14.2: «propia» = una API compatible con OpenAI del dueño (su dirección sale de la configuración, no de aquí).
export const PROVEEDORES = Object.freeze({ anthropic, openai, propia });

export function adaptadorDe(id) {
  return typeof id === 'string' && Object.hasOwn(PROVEEDORES, id) ? PROVEEDORES[id] : null;
}

// La dirección a la que se llama: la oficial del adaptador; solo en las pruebas, la del proveedor falso
// (config.iaBases, que en el servidor real siempre está vacío).
// cfgIa: la configuración de la IA (solo hace falta para la API propia, cuya dirección elige el dueño).
export function urlDe(adaptador, config, ruta, cfgIa = null) {
  const base = config?.iaBases?.[adaptador.id] ?? (typeof adaptador.baseDe === 'function' ? adaptador.baseDe(cfgIa) : adaptador.base);
  return base ? `${base}${ruta}` : null;
}
// El ÚNICO servidor al que puede ir ese proveedor (src/ia/llamar.js no deja ir a otro).
export function hostDe(adaptador, cfgIa = null) {
  return typeof adaptador.hostDe === 'function' ? adaptador.hostDe(cfgIa) : adaptador.host;
}
