// Cartel animado (0.7.2): la escena de una clase cuando no hay un dibujo propio (o el paquete pide uno que la app no
// conoce). Cielo del color de la escena (amanecer, día, tarde, noche), nubes que pasan, una avioneta que cruza, un ícono
// grande y la frase clave de la escena en letras grandes. Nunca espera nada del alumno.
//
// API: montarCartel(contenedor, { antetitulo, titulo, texto, icono, variante, modo }) → { tiempo(t), modo(), poner(),
//        pausar(b), destruir() }
//   icono: 'ojo' | 'oido' | 'pulmon' | 'lista' | 'rueda' | 'cadena' | 'grafica' | 'nube' | 'motor' | 'reloj' | 'avion'
//   variante: 0..3 (el color del cielo; se puede pasar el número de la escena).

import { el, svg, idUnico, prefiereMenosMovimiento, crearBucle, f1 } from './comun.js';
import { dibujarAvion } from './escenario.js';

const ANCHO = 640, ALTO = 360;
export const CIELOS = ['amanecer', 'dia', 'tarde', 'noche'];

// Íconos de trazo (24×24), dibujados para estas clases.
export const ICONOS_CARTEL = {
  ojo: ['M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z', 'M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z'],
  oido: ['M8 9a5 5 0 1 1 9.2 2.7c-1 1.5-2.6 2.2-2.9 4.1-.3 1.8-1.4 3.2-3.3 3.2A3 3 0 0 1 8 16', 'M11 9.5a2 2 0 0 1 3.6 1.2'],
  pulmon: ['M12 4v8', 'M12 10c-1.5 0-2.5-1-3.5-2.5C7 5.5 4 7 4 11v5.5c0 1.8 1.6 2.8 3.2 2.2 2.2-.8 3.8-2.6 3.8-5.2V12', 'M12 10c1.5 0 2.5-1 3.5-2.5C17 5.5 20 7 20 11v5.5c0 1.8-1.6 2.8-3.2 2.2-2.2-.8-3.8-2.6-3.8-5.2V12'],
  lista: ['M9 6h11M9 12h11M9 18h11', 'M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2'],
  rueda: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4'],
  cadena: ['M9.5 14.5l5-5', 'M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2', 'M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2'],
  grafica: ['M12 3a9 9 0 1 0 9 9h-9z', 'M15 3.5A9 9 0 0 1 20.5 9H15z'],
  nube: ['M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z'],
  motor: ['M5 9h10v8H5z', 'M15 11h3l2-2v8l-2-2h-3', 'M8 9V6h4v3', 'M3 12v2'],
  reloj: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  avion: ['M2.5 13.5l7-1.5L14 4.5c.6-1 2.1-.6 2 .6L15.3 11l5.2 1.2c.8.2.8 1.3 0 1.5L15.3 15l.7 5.9c.1 1.2-1.4 1.6-2 .6L9.5 14z'],
};

export function montarCartel(contenedor, opciones = {}) {
  const quieto = prefiereMenosMovimiento();
  let reloj = 0, avance = 0;
  const cielo = CIELOS[Math.abs(Math.floor(Number(opciones.variante) || 0)) % CIELOS.length];
  const raiz = el('div', { class: `clase-visual clase-letrero clase-letrero-${cielo}` }, contenedor);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-lienzo', role: 'img', 'aria-label': opciones.texto || opciones.titulo || '' }, raiz);
  const defs = svg('defs', {}, lienzo);
  const idCielo = idUnico('cieloC');
  const g = svg('linearGradient', { id: idCielo, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svg('stop', { offset: 0, class: 'clase-letrero-arriba' }, g);
  svg('stop', { offset: 1, class: 'clase-letrero-abajo' }, g);
  svg('rect', { width: ANCHO, height: ALTO, fill: `url(#${idCielo})` }, lienzo);
  // Estrellas (solo se ven de noche) y nubes en tres capas.
  const estrellas = svg('g', { class: 'clase-letrero-estrellas' }, lienzo);
  for (let k = 0; k < 26; k++) svg('circle', { cx: f1((k * 97) % ANCHO), cy: f1(12 + ((k * 53) % 150)), r: k % 3 ? 1.2 : 2 }, estrellas);
  const capas = [0.2, 0.45, 0.9].map((velocidad, i) => {
    const grupo = svg('g', { class: `clase-titulo-nubes clase-titulo-nubes-${i}` }, lienzo);
    for (let k = 0; k < 4; k++) {
      const x = k * 230 + i * 70 + (k % 2) * 50, y = 50 + i * 70 + (k % 2) * 22, r = 8 + i * 7;
      for (const [dx, dy, rr] of [[0, 0, 1], [r * 1.1, -r * 0.5, 1.3], [r * 2.3, 0, 1]]) svg('circle', { cx: f1(x + dx), cy: f1(y + dy), r: f1(r * rr) }, grupo);
      svg('rect', { x: f1(x - r), y: f1(y), width: f1(r * 4.3), height: f1(r * 0.9), rx: f1(r * 0.45) }, grupo);
    }
    return { grupo, velocidad };
  });
  svg('path', { d: `M0 ${ALTO - 34}Q160 ${ALTO - 62} 320 ${ALTO - 42}T640 ${ALTO - 46}L640 ${ALTO}L0 ${ALTO}Z`, class: 'clase-letrero-tierra' }, lienzo);
  const avion = svg('g', { class: 'clase-avion-lado' }, lienzo);
  dibujarAvion(avion);

  // El ícono en una placa redonda, arriba a la derecha.
  const trazos = ICONOS_CARTEL[opciones.icono] || ICONOS_CARTEL.avion;
  const placa = svg('g', { class: 'clase-letrero-placa', transform: 'translate(548 78)' }, lienzo);
  svg('circle', { r: 52, class: 'clase-letrero-placa-halo' }, placa);
  svg('circle', { r: 40, class: 'clase-letrero-placa-fondo' }, placa);
  const dibujo = svg('g', { transform: 'translate(-24 -24) scale(2)', class: 'clase-letrero-icono' }, placa);
  for (const d of trazos) svg('path', { d }, dibujo);

  const texto = el('div', { class: 'clase-titulo-texto clase-letrero-texto' }, raiz);
  if (opciones.antetitulo) el('p', { class: 'clase-titulo-ante' }, texto, opciones.antetitulo);
  if (opciones.titulo) el('h3', { class: 'clase-letrero-titulo' }, texto, opciones.titulo);
  if (opciones.texto) el('p', { class: 'clase-letrero-frase' }, texto, opciones.texto);

  function dibujar() {
    for (const c of capas) c.grupo.setAttribute('transform', `translate(${f1(-((reloj * 30 * c.velocidad) % 230))} 0)`);
    const x = -60 + avance * 760, y = 210 - avance * 90 + Math.sin(reloj * 1.3) * 5;
    avion.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${f1(-8 + Math.sin(reloj * 0.9) * 2)}) scale(1.1)`);
    placa.setAttribute('transform', `translate(548 ${f1(78 + Math.sin(reloj * 1.6) * 4)})`);
  }
  const bucle = crearBucle(raiz, dt => { reloj += dt; dibujar(); });
  dibujar();
  if (!quieto) bucle.iniciar();
  return {
    raiz,
    tiempo(t) { avance = Math.max(0, Math.min(1, t)); if (quieto || !bucle.activo) dibujar(); },
    modo() {}, poner() {},
    pausar(si) { if (si || quieto) bucle.detener(); else bucle.iniciar(); },
    destruir() { bucle.destruir(); raiz.remove(); },
  };
}
