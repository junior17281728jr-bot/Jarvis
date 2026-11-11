// Qué dibujo corresponde a cada «visual.tipo» de una escena. El reproductor busca aquí.
import { montarAla } from './ala.js';
import { montarMotor } from './motor.js';
import { montarInstrumentos } from './instrumentos.js';
import { montarEscenario } from './escenario.js';
import { montarMeteo } from './meteo.js';
import { montarTitulo } from './titulo.js';

export const VISUALES = {
  titulo: (c, p, o) => montarTitulo(c, { ...p, ...o }),
  ala: (c, p, o) => montarAla(c, { ...p, ...o }),
  motor: (c, p, o) => montarMotor(c, { ...p, ...o }),
  instrumentos: (c, p, o) => montarInstrumentos(c, { ...p, ...o }),
  meteo: (c, p, o) => montarMeteo(c, { ...p, ...o }),
  // El escenario recibe los datos del escenario en parametros y espera la respuesta del alumno.
  escenario: (c, p, o) => montarEscenario(c, p, o),
};
