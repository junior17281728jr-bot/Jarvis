// Qué dibujo corresponde a cada «visual.tipo» de una escena. El reproductor busca aquí.
import { montarAla } from './ala.js';
import { montarMotor } from './motor.js';
import { montarInstrumentos } from './instrumentos.js';
import { montarEscenario } from './escenario.js';
import { montarMeteo } from './meteo.js';
import { montarTitulo } from './titulo.js';
import { montarCartel } from './cartel.js';
// Las escenas del video de la materia 1 (Factores humanos): tipos «fh-…».
import { VISUALES_FH } from './visuales-fh.js';

export const VISUALES = {
  titulo: (c, p, o) => montarTitulo(c, { ...p, ...o }),
  // 0.7.2: la escena sin dibujo propio (y la que usa el reproductor para un tipo que no conoce).
  cartel: (c, p, o) => montarCartel(c, { variante: o?.indice, ...p, ...o }),
  ala: (c, p, o) => montarAla(c, { ...p, ...o }),
  motor: (c, p, o) => montarMotor(c, { ...p, ...o }),
  instrumentos: (c, p, o) => montarInstrumentos(c, { ...p, ...o }),
  meteo: (c, p, o) => montarMeteo(c, { ...p, ...o }),
  // El escenario recibe los datos del escenario en parametros y espera la respuesta del alumno.
  escenario: (c, p, o) => montarEscenario(c, p, o),
  ...VISUALES_FH,
};
