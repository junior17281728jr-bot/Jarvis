// Página de prueba de las escenas de Factores Humanos (demo-fh.html) y modo de captura para grabar el video.
// ?captura=1[&tema=oscuro|claro] deja solo el cuadro 16:9 y expone window.demoFh.ponerTiempo(segundos) para dibujar
// el instante exacto de la película completa (portada + 12 escenas + cierre). Rótulos de muestra escritos aquí.
import { montarReproductor } from './reproductor.js';
import { VISUALES_FH } from './visuales-fh.js';
import { el } from './comun.js';

// Cortes de las 12 escenas sobre el audio de la clase inicial (segundos), y lo que dura la portada y el cierre.
export const CORTES = [0, 44.07, 70.91, 117.65, 140.88, 178.64, 202.01, 227.51, 266.52, 288.53, 312.45, 343.07, 378.04];
export const PORTADA_S = 4, CIERRE_S = 6, FUNDIDO_S = 0.6;

const ESCENAS = [
  ['fh-aguila', 'El pájaro y el piloto', 'Clase inicial · 1'],
  ['fh-cadena', 'El factor humano', 'Clase inicial · 2'],
  ['fh-ojo', 'Tus ojos en el cielo', 'Visión · 3'],
  ['fh-ilusiones', 'Cuando los ojos te engañan', 'Ilusiones · 4'],
  ['fh-oido', 'El oído interno', 'Equilibrio · 5'],
  ['fh-hipoxia', 'El aire se hace delgado', 'Altitud · 6'],
  ['fh-monoxido', 'El enemigo invisible', 'Cabina · 7'],
  ['fh-respirar', 'Respirar demasiado', 'Respiración · 8'],
  ['fh-imsafe', 'Revísate antes de volar', 'Aptitud · 9'],
  ['fh-decide', 'Decidir como piloto', 'Decisiones · 10'],
  ['fh-actitudes', 'Cinco actitudes peligrosas', 'Actitudes · 11'],
  ['fh-romper', 'Romper la cadena', 'Clase inicial · 12'],
];

export function leccionFH() {
  const escenas = [{ id: 'portada', subtitulo: 'Factores Humanos', texto_narracion: 'Materia 1: Factores Humanos y Toma de Decisiones.', duracion_s: PORTADA_S,
    visual: { tipo: 'fh-portada', parametros: { duracion_s: PORTADA_S, academia: 'Academia de Aviación', antetitulo: 'Materia 1 · Factores Humanos', titulo: 'Factores Humanos', subtitulo: 'y Toma de Decisiones' } } }];
  ESCENAS.forEach(([tipo, titulo, antetitulo], i) => {
    const duracion_s = Math.round((CORTES[i + 1] - CORTES[i]) * 100) / 100;
    escenas.push({ id: `esc${String(i + 1).padStart(2, '0')}`, subtitulo: titulo, texto_narracion: `${titulo}.`, duracion_s, visual: { tipo, parametros: { duracion_s, titulo, antetitulo } } });
  });
  escenas.push({ id: 'cierre', subtitulo: 'Fin de la clase inicial', texto_narracion: 'Fin de la clase inicial.', duracion_s: CIERRE_S,
    visual: { tipo: 'fh-portada', parametros: { duracion_s: CIERRE_S, variante: 'cierre', academia: 'Academia de Aviación', antetitulo: 'Materia 1 · Factores Humanos', titulo: 'Fin de la clase inicial', subtitulo: 'Siguiente: Visión en vuelo' } } });
  return { id: 'materia-01-inicial', titulo: 'Factores Humanos y Toma de Decisiones', escenas };
}

// Línea de tiempo de la película: inicio y fin de cada escena en segundos globales.
export function lineaDeTiempo(leccion) {
  let t = 0;
  return leccion.escenas.map(e => { const d = e.duracion_s; const tramo = { inicio: t, fin: t + d }; t += d; return tramo; });
}

// Qué escenas se ven en el segundo T: la actual y, durante el fundido, la anterior debajo.
export function enPantalla(tramos, T, fundido = FUNDIDO_S) {
  let i = tramos.findIndex(x => T >= x.inicio && T < x.fin);
  if (i < 0) i = T < 0 ? 0 : tramos.length - 1;
  const x = tramos[i];
  const t = Math.min(1, Math.max(0, (T - x.inicio) / (x.fin - x.inicio)));
  const mezcla = i > 0 ? Math.min(1, (T - x.inicio) / fundido) : 1;
  return { i, t, mezcla, anterior: mezcla < 1 ? i - 1 : -1 };
}

function temas() {
  const botones = document.querySelectorAll('.demo-tema [data-tema]');
  const marcar = () => botones.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === document.documentElement.dataset.tema)));
  botones.forEach(b => b.addEventListener('click', () => { document.documentElement.dataset.tema = b.dataset.tema; marcar(); }));
  marcar();
}

function modoCaptura(leccion) {
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.tema = q.get('tema') || 'oscuro';
  document.documentElement.classList.add('demo-fh-captura');
  document.body.className = '';
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const escenario = el('div', { class: 'demo-fh-escenario' }, document.body);
  const barra = el('div', { class: 'demo-fh-barra' }, escenario);
  const llena = el('div', { class: 'demo-fh-barra-llena' }, barra);
  const tramos = lineaDeTiempo(leccion);
  const total = tramos[tramos.length - 1].fin;
  const montadas = new Map();
  const montar = i => {
    if (montadas.has(i)) return montadas.get(i);
    const e = leccion.escenas[i];
    const capa = el('div', { class: 'demo-fh-capa' }, escenario);
    escenario.insertBefore(capa, barra);
    const v = VISUALES_FH[e.visual.tipo](capa, e.visual.parametros, { quieto: false }); // un error aquí corta la grabación
    const m = { capa, v };
    montadas.set(i, m);
    return m;
  };
  window.demoFh = {
    total,
    tramos,
    ponerTiempo(T) {
      const p = enPantalla(tramos, T);
      for (const [k, m] of montadas) if (k !== p.i && k !== p.anterior) { m.v.destruir(); m.capa.remove(); montadas.delete(k); }
      if (p.anterior >= 0) { const a = montar(p.anterior); a.v.tiempo(1); a.capa.style.opacity = '1'; a.capa.style.zIndex = '0'; }
      const m = montar(p.i);
      m.v.tiempo(p.t);
      m.capa.style.opacity = String(Math.round(p.mezcla * 1000) / 1000);
      m.capa.style.zIndex = '1';
      llena.style.transform = `scaleX(${(T / total).toFixed(4)})`;
      return p;
    },
  };
  window.demoFh.ponerTiempo(0);
}

function galeria(leccion) {
  temas();
  window.demoFh = { reproductor: montarReproductor(document.querySelector('[data-pieza="reproductor"]'), leccion, { visuales: VISUALES_FH }) };
  const hueco = document.querySelector('[data-pieza="escenas"]');
  leccion.escenas.forEach((e, i) => {
    const caja = el('figure', { class: 'demo-fh-figura' }, hueco);
    const marco = el('div', { class: 'demo-fh-escenario' }, caja);
    const capa = el('div', { class: 'demo-fh-capa' }, marco);
    const v = VISUALES_FH[e.visual.tipo](capa, e.visual.parametros, {});
    const control = el('input', { type: 'range', min: 0, max: 1000, value: 600, 'aria-label': `Recorrer la escena ${i + 1}: ${e.subtitulo}` }, caja);
    el('figcaption', {}, caja, `${i + 1}. ${e.subtitulo}`);
    const poner = () => v.tiempo(Number(control.value) / 1000);
    control.addEventListener('input', poner);
    poner();
  });
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  const leccion = leccionFH();
  if (new URLSearchParams(location.search).has('captura')) modoCaptura(leccion); else galeria(leccion);
}
