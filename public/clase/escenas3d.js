// 0.14.78: el registro de las escenas 3D (tipo de dibujo «escena-3d») y todos sus textos. Cada escena: sus pasos (id,
// cámara, vuelo), lo fijo (construir), lo de cada paso (armarPaso) y lo de cada cuadro (cuadro). Las claves de los
// textos son «clase.e3d.<clave>» en public/i18n/es.json y en.json. src/academia/diagramas.js (ESCENAS_3D) tiene la misma
// lista de escenas y de pasos (una prueba lo revisa).
import { ESCENA as ESPACIO } from './e3d-espacio.js';
import { ESCENA as MINIMOS } from './e3d-minimos.js';
import { ESCENA as CIRCUITO } from './e3d-circuito.js';
import { ESCENA as FRENTES } from './e3d-frentes.js';
import { ESCENA as PERDIDA } from './e3d-perdida.js';
import { ESCENA as VOR } from './e3d-vor.js';

export const ESCENAS = Object.freeze(Object.fromEntries([ESPACIO, MINIMOS, CIRCUITO, FRENTES, PERDIDA, VOR].map(e => [e.id, e])));

export const TEXTOS_CONTROLES = {
  'ctl.siguiente': 'Siguiente', 'ctl.anterior': 'Anterior', 'ctl.empezar': 'Empezar de nuevo',
  'ctl.pausa': 'Pausa', 'ctl.seguir': 'Reproducir', 'ctl.vista1': 'Vista 1ª persona', 'ctl.vista3': 'Vista 3ª persona',
  'ctl.repetir': 'Repetir', 'ctl.paso': 'Paso {n} de {total}', 'ctl.verMas': 'Ver más', 'ctl.recuerda': 'Recuerda',
  'ctl.ayuda': 'Arrastra para girar · pellizca o usa la rueda para acercar',
  'ctl.teclado': 'Con el teclado: flechas para girar la cámara; + y − para acercar o alejar.',
  'ctl.controles': 'Controles de la escena', 'ctl.pasos': 'Pasos', 'ctl.irA': 'Ir al paso {n}: {titulo}',
  'ctl.cargando': 'Cargando la escena 3D…', 'ctl.sinLienzo': 'Este navegador no puede mostrar la escena 3D; el texto de cada paso sigue aquí.',
  'ctl.cabina.kt': 'KT', 'ctl.cabina.ft': 'FT',
};
// Todos los textos, con su clave completa sin el prefijo «clase.e3d.».
export const TEXTOS_E3D = Object.freeze({
  ...TEXTOS_CONTROLES,
  ...Object.fromEntries(Object.values(ESCENAS).flatMap(e => Object.entries(e.TEXTOS).map(([k, v]) => [`${e.id}.${k}`, v]))),
});
// Los textos de un paso: título, texto (con **negrita**) y «Ver más».
export const clavesPaso = (escena, paso) => ['titulo', 'texto', 'mas'].map(k => `${escena}.${paso}.${k}`);
