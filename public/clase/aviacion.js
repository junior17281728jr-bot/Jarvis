// 0.14.62: el registro de los dibujos de aviación (src/academia/diagramas.js revisa sus parámetros: TIPOS_DIBUJO).
// Cada uno recibe (contenedor, parametros, opciones) y opciones.t es el t() de la app para los textos.
import { montarCircuito } from './circuito.js';
import { montarPistaMarcas } from './pista-marcas.js';
import { montarLetreros } from './letreros.js';
import { montarVor } from './vor.js';
import { montarTrianguloViento } from './viento.js';
import { montarCartaSimbolos } from './carta.js';

export const VISUALES_AVIACION = {
  circuito: (c, p, o) => montarCircuito(c, p, o),
  'pista-marcas': (c, p, o) => montarPistaMarcas(c, p, o),
  letreros: (c, p, o) => montarLetreros(c, p, o),
  vor: (c, p, o) => montarVor(c, p, o),
  'triangulo-viento': (c, p, o) => montarTrianguloViento(c, p, o),
  'carta-simbolos': (c, p, o) => montarCartaSimbolos(c, p, o),
};
