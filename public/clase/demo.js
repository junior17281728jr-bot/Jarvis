// Galería de prueba de las clases visuales (demo.html). Datos de muestra genéricos, sin contenido de libros.
import { montarReproductor } from './reproductor.js';
import { montarAla } from './ala.js';
import { montarMotor } from './motor.js';
import { montarInstrumentos } from './instrumentos.js';
import { montarEscenario } from './escenario.js';
import { montarMeteo } from './meteo.js';

const piezas = {};
window.demoClase = piezas; // para las capturas de prueba

const hueco = nombre => document.querySelector(`[data-pieza="${nombre}"]`);

function temas() {
  const botones = document.querySelectorAll('.demo-tema [data-tema]');
  const marcar = () => botones.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === document.documentElement.dataset.tema)));
  botones.forEach(b => b.addEventListener('click', () => { document.documentElement.dataset.tema = b.dataset.tema; marcar(); }));
  marcar();
}

export const ESCENARIO_DEMO = {
  titulo: 'Nubes bajas en la ruta',
  situacion: 'Vuelas de día con reglas visuales. Adelante, las nubes bajan y empiezan a tapar los cerros. Detrás, el cielo sigue despejado.',
  concepto: 'Si el tiempo empeora adelante, decide temprano: dar la vuelta hacia donde el cielo está bueno es una decisión de buen piloto.',
  opciones: [
    { texto: 'Sigo bajo las nubes, bajando para no perder de vista el suelo.', correcta: false, animacion: 'nube', consecuencia: 'Las nubes siguen bajando y el avión termina dentro de ellas, sin referencias afuera. Es una situación muy peligrosa.' },
    { texto: 'Doy la vuelta hacia la zona despejada y busco otra ruta.', correcta: true, animacion: 'virar', consecuencia: 'Vuelves a tener el horizonte a la vista y tiempo para pensar con calma qué hacer.' },
    { texto: 'Subo por encima de las nubes y sigo adelante.', correcta: false, animacion: 'subir', consecuencia: 'Al cruzar la capa quedas sin ver el suelo, y luego puedes no encontrar un hueco para bajar.' },
  ],
};

export const LECCION_DEMO = {
  id: 'demo-vuelo',
  titulo: 'Cómo vuela un avión (muestra)',
  escenas: [
    { id: 'inicio', subtitulo: 'Bienvenido a bordo', texto_narracion: 'Hoy vamos a ver, paso a paso, qué pasa con el aire, el motor y los instrumentos cuando un avión vuela.', visual: { tipo: 'titulo', parametros: { antetitulo: 'Clase de muestra', titulo: 'Cómo vuela un avión' } } },
    { id: 'ala', subtitulo: 'El ala y el aire', texto_narracion: 'El aire choca con el ala y se divide. Mira la línea de la cuerda y el viento relativo: el ángulo entre los dos es el ángulo de ataque. Al subirlo un poco, aparece más sustentación.', duracion_s: 14, visual: { tipo: 'ala', parametros: { claves: [{ t: 0, alfa: 2, resalta: 'viento' }, { t: 0.35, alfa: 4, resalta: 'cuerda' }, { t: 1, alfa: 11, resalta: 'sustentacion' }] } } },
    { id: 'perdida', subtitulo: 'La pérdida', texto_narracion: 'Si seguimos subiendo el ángulo, llega un punto crítico. Ahí el aire de arriba se despega del ala, se forman remolinos y la sustentación cae.', duracion_s: 12, visual: { tipo: 'ala', parametros: { claves: [{ t: 0, alfa: 11 }, { t: 0.55, alfa: 16 }, { t: 1, alfa: 21, resalta: 'sustentacion' }] } } },
    { id: 'motor', subtitulo: 'El motor por dentro', texto_narracion: 'El motor repite cuatro tiempos: admisión, compresión, explosión y escape. Dos vueltas del cigüeñal hacen un ciclo completo.', duracion_s: 14, visual: { tipo: 'motor', parametros: { claves: [{ t: 0, theta: 0 }, { t: 1, theta: 1440 }] } } },
    { id: 'instrumentos', subtitulo: 'Los instrumentos', texto_narracion: 'En un viraje en ascenso, el horizonte se inclina, el rumbo cambia, el altímetro sube y el variómetro marca que subimos.', duracion_s: 13, visual: { tipo: 'instrumentos', parametros: { claves: [{ t: 0, velocidad: 95, cabeceo: 0, alabeo: 0, vs: 0, rumbo: 360, altitud: 3000 }, { t: 0.25, velocidad: 85, cabeceo: 6, alabeo: 15, vs: 500, rumbo: 10, altitud: 3020 }, { t: 1, velocidad: 80, cabeceo: 6, alabeo: 15, vs: 500, rumbo: 110, altitud: 3100 }] } } },
    { id: 'nube', subtitulo: 'Cómo nace una nube', texto_narracion: 'El sol calienta el suelo. El aire caliente sube, se enfría y, a cierta altura, forma una nube.', duracion_s: 12, visual: { tipo: 'meteo', parametros: { escena: 'conveccion' } } },
    { id: 'decision', subtitulo: 'Tu decisión', texto_narracion: 'Ahora te toca a ti. Lee la situación y elige qué harías.', visual: { tipo: 'escenario', parametros: ESCENARIO_DEMO } },
  ],
};

function guardado() {
  try { return JSON.parse(localStorage.getItem('demo-clase-progreso') || 'null'); } catch { return null; }
}

temas();
const estadoProgreso = document.createElement('p');
estadoProgreso.className = 'demo-progreso';
const inicio = guardado();
piezas.reproductor = montarReproductor(hueco('reproductor'), LECCION_DEMO, {
  inicio: inicio && !inicio.completado ? inicio : undefined,
  onProgreso: p => {
    try { localStorage.setItem('demo-clase-progreso', JSON.stringify(p)); } catch { /* sin almacenamiento */ }
    estadoProgreso.textContent = `Progreso guardado: escena ${p.indice + 1}, ${Math.round(p.porcentaje)} %${p.completado ? ' (terminada)' : ''}.`;
  },
});
hueco('reproductor').appendChild(estadoProgreso);
piezas.ala = montarAla(hueco('ala'), { alfa: 6, angulo_critico: 16 });
piezas.motor = montarMotor(hueco('motor'), {});
piezas.instrumentos = montarInstrumentos(hueco('instrumentos'), { demo: true });
piezas.escenario = montarEscenario(hueco('escenario'), ESCENARIO_DEMO);
piezas.meteo = montarMeteo(hueco('meteo'), { escena: 'conveccion' });
