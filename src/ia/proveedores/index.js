// Los proveedores de IA que OPORTIA conoce. Agregar uno = un archivo aquí (mismo formato que anthropic.js), su fila
// en src/ia/precios.json, su uso en src/claves/usos.js y sus textos en es.json y en.json.
// Cada adaptador es puro (no usa la red): arma el pedido (pedido, cabeceras, prueba) y lee la respuesta (leer,
// leerPrueba). La ÚNICA llamada a la red es src/ia/llamar.js, que además solo deja ir a su dirección oficial.
import { anthropic } from './anthropic.js';
import { openai } from './openai.js';

export const PROVEEDORES = Object.freeze({ anthropic, openai });

export function adaptadorDe(id) {
  return typeof id === 'string' && Object.hasOwn(PROVEEDORES, id) ? PROVEEDORES[id] : null;
}

// La dirección a la que se llama: la oficial del adaptador; solo en las pruebas, la del proveedor falso
// (config.iaBases, que en el servidor real siempre está vacío).
export function urlDe(adaptador, config, ruta) {
  const base = config?.iaBases?.[adaptador.id] ?? adaptador.base;
  return `${base}${ruta}`;
}
