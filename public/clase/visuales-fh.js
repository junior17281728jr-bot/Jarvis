// Escenas de Factores Humanos (materia 1) para el reproductor de clase: un mapa «visual.tipo» → montar, igual que
// VISUALES en visuales.js. Cada escena es una ilustración animada por tiempo(t) con su título y rótulos cortos.
//
// Cómo se usa (sin tocar visuales.js):
//   importar VISUALES_FH de visuales-fh.js (junto al reproductor) y pasarlo en las opciones:
//   montarReproductor(contenedor, leccion, { visuales: VISUALES_FH });   // el reproductor ya junta opciones.visuales
// o, para que estén siempre, al unir la rama:  export const VISUALES = { ...VISUALES_BASE, ...VISUALES_FH };
// Los estilos están en clase-fh.css: se enlazan solos la primera vez que se monta una escena fh-* (CSP: es 'self'),
// o se pone <link rel="stylesheet" href="clase/clase-fh.css"> junto a clase.css para evitar el primer cuadro sin color.
// En cada escena, parametros: { duracion_s (largo de la escena, para los ritmos), antetitulo, titulo, pasos?, textos?,
// rotulos? }. Los textos de pantalla son rótulos cortos; los de la lección llegan por parametros.

import { montarFhPortada } from './fh-portada.js';
import { montarFhAguila } from './fh-aguila.js';
import { montarFhCadena } from './fh-cadena.js';
import { montarFhOjo } from './fh-ojo.js';
import { montarFhIlusiones } from './fh-ilusiones.js';
import { montarFhOido } from './fh-oido.js';
import { montarFhHipoxia } from './fh-hipoxia.js';
import { montarFhMonoxido } from './fh-monoxido.js';
import { montarFhRespirar } from './fh-respirar.js';
import { montarFhImsafe } from './fh-imsafe.js';
import { montarFhDecide } from './fh-decide.js';
import { montarFhActitudes } from './fh-actitudes.js';
import { montarFhRomper } from './fh-romper.js';

export function cargarEstilosFH() {
  if (typeof document === 'undefined' || document.querySelector('link[data-clase-fh]')) return;
  if ([...document.styleSheets].some(h => /clase-fh\.css/.test(h.href || ''))) return;
  const enlace = document.createElement('link');
  enlace.rel = 'stylesheet';
  enlace.href = new URL('./clase-fh.css', import.meta.url).href;
  enlace.setAttribute('data-clase-fh', '');
  document.head.appendChild(enlace);
}

// El reproductor llama montar(contenedor, parametros, { modo, alResolver }); las escenas fh no usan el modo interactivo.
const con = montar => (c, p = {}, o = {}) => { cargarEstilosFH(); return montar(c, { ...p, quieto: o.quieto ?? p.quieto }); };

export const VISUALES_FH = {
  'fh-portada': con(montarFhPortada),
  'fh-aguila': con(montarFhAguila),
  'fh-cadena': con(montarFhCadena),
  'fh-ojo': con(montarFhOjo),
  'fh-ilusiones': con(montarFhIlusiones),
  'fh-oido': con(montarFhOido),
  'fh-hipoxia': con(montarFhHipoxia),
  'fh-monoxido': con(montarFhMonoxido),
  'fh-respirar': con(montarFhRespirar),
  'fh-imsafe': con(montarFhImsafe),
  'fh-decide': con(montarFhDecide),
  'fh-actitudes': con(montarFhActitudes),
  'fh-romper': con(montarFhRomper),
};
