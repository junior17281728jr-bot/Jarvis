// Academia 0.9.1: la tarjeta de la lección, más visual. Toma la tarjeta ya armada por app.js (vistaTarjeta) y le agrega,
// sin cambiar ni quitar ningún texto:
//  - un ícono por punto (según de qué habla: el ojo, la luz, el oído, la altura, el avión, un peligro, el tiempo…;
//    si no se reconoce, un punto de ruta de las cartas de navegación), y el orden para que los puntos entren uno tras otro (public/interfaz.css);
//  - en cada ficha de inglés, las marcas EN y ES (la palabra en español sale del significado, «Córnea: …») y la
//    abreviatura solo si el paquete la trae entre paréntesis (no se inventa ninguna).
// Nada toca document/window al importar (las pruebas importan este módulo sin navegador).

import { el, svg } from './comun.js';

const sinTildes = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Los dibujos (24 × 24, de línea, como los íconos de la app). Cada uno: [etiqueta, atributos].
const DIBUJOS = {
  ojo: [['path', { d: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z' }], ['circle', { cx: 12, cy: 12, r: 3.2 }]],
  luz: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8' }]],
  noche: [['path', { d: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' }]],
  oido: [['path', { d: 'M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6' }], ['path', { d: 'M10 9.5a2 2 0 0 1 4 0c0 1.2-1 1.6-1.5 2.4' }]],
  altura: [['path', { d: 'M3 20l6.5-11 4 6.5 2.5-4L21 20z' }], ['path', { d: 'M8 6.5l1.5-2.5 1.5 2.5' }]],
  aire: [['path', { d: 'M3 9h11a3 3 0 1 0-3-3' }], ['path', { d: 'M3 15h15a3 3 0 1 1-3 3' }], ['path', { d: 'M3 12h7' }]],
  avion: [['path', { d: 'M21 15.5l-8-4.5V5a1.5 1.5 0 0 0-3 0v6l-8 4.5V17l8-2.5V19l-2.5 1.8V22l4-1 4 1v-1.2L13 19v-4.5l8 2.5z' }]],
  alerta: [['path', { d: 'M12 3.5l9.5 16.5h-19z' }], ['path', { d: 'M12 10v4.5M12 17.2v.3' }]],
  reloj: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 7.5V12l3 2' }]],
  cerebro: [['path', { d: 'M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 4.5 3 3 0 0 0 5 1V5.5A2.5 2.5 0 0 0 9 4.5z' }], ['path', { d: 'M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 4.5 3 3 0 0 1-5 1' }]],
  salud: [['path', { d: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z' }], ['path', { d: 'M9 12.5h1.8l1-2 1.6 4 1-2H17' }]],
  bateria: [['rect', { x: 3, y: 8, width: 16, height: 9, rx: 2 }], ['path', { d: 'M21 11v3M6.5 11v3' }]],
  decidir: [['path', { d: 'M12 21v-7l-5-5M12 14l5-5' }], ['path', { d: 'M4 6.5V9h2.5M20 6.5V9h-2.5' }]],
  radio: [['rect', { x: 4, y: 9, width: 16, height: 11, rx: 2 }], ['path', { d: 'M8 9l8-5M8 14.5h4' }], ['circle', { cx: 16, cy: 14.5, r: 1.6 }]],
  nube: [['path', { d: 'M7 18h10.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 7.3 9.6 4.2 4.2 0 0 0 7 18z' }]],
  // Un punto de notificación de las cartas de navegación (para lo que no tiene un tema reconocible).
  ruta: [['path', { d: 'M12 3.5l2.4 6.1 6.1 2.4-6.1 2.4L12 20.5l-2.4-6.1L3.5 12l6.1-2.4z' }], ['circle', { cx: 12, cy: 12, r: 1.4 }]],
};

// De qué habla un punto (el primero que coincide gana). Palabras en español y en inglés, sin tildes.
const TEMAS = [
  ['alerta', /\b(peligr|riesg|nunca|evit|cuidado|alerta|emergencia|accident|mortal|danger|warning|never)/],
  ['ojo', /\b(ojo|ojos|vista|vision|visual|mira|ver |ves |retina|cono|conos|baston|pupila|eye|scan)/],
  ['noche', /\b(noche|nocturn|oscur|dark|night)/],
  ['luz', /\b(luz|luces|sol |brillo|deslumbr|light)/],
  ['oido', /\b(oido|oidos|oreja|sonido|ruido|vestibul|equilibrio|ear|noise)/],
  ['aire', /\b(oxigeno|hipoxia|respir|hiperventil|aire|monoxido|co\b|oxygen|breath)/],
  ['altura', /\b(altitud|altura|pies|presion|cabina presur|montan|altitude|pressure)/],
  ['reloj', /\b(minuto|hora|segundo|tiempo|dias|reloj|time|hours)/],
  ['salud', /\b(alcohol|medicament|droga|enferm|salud|corazon|sangre|resfri|medic|imsafe)/],
  ['bateria', /\b(estres|fatiga|cansanc|sueno|dormir|descans|stress|fatigue)/],
  ['decidir', /\b(decid|decision|eleg|opcion|juicio|actitud|decide|judgment)/],
  ['radio', /\b(radio|comunica|torre|frecuencia|atc|control de transito)/],
  ['nube', /\b(nube|niebla|neblina|lluvia|tiempo meteor|clima|cloud|haze|fog)/],
  ['avion', /\b(avion|aeronave|vuelo|volar|piloto|despeg|aterriz|pista|cabina|aircraft|pilot|flight)/],
  ['cerebro', /\b(mente|cerebro|pensar|memoria|atencion|ilusion|desorient|percep|brain)/],
];

export function temaDePunto(texto) {
  const t = ` ${sinTildes(texto)} `;
  for (const [nombre, patron] of TEMAS) if (patron.test(t)) return nombre;
  return null;
}

function dibujo(nombre) {
  const raiz = svg('svg', { viewBox: '0 0 24 24', class: 'punto-dibujo', 'aria-hidden': 'true', focusable: 'false' });
  for (const [etiqueta, atributos] of DIBUJOS[nombre] ?? []) svg(etiqueta, atributos, raiz);
  return raiz;
}

// La palabra en español de una ficha: lo que va antes de «:» en el significado, si es corto («Córnea: por donde…»).
export function terminoEspanol(significado) {
  const s = String(significado ?? '').trim();
  const dos = s.indexOf(':');
  if (dos <= 0) return null;
  const termino = s.slice(0, dos).trim();
  return termino.length <= 40 && !/[.!?]/.test(termino) ? termino : null;
}
// La abreviatura, solo si viene en el paquete: «Very High Frequency (VHF)», o «(VHF)» en el significado.
export function abreviaturaDe(w) {
  for (const texto of [w?.palabra, w?.significado]) {
    const m = /\(([A-Z][A-Z0-9]{1,6})\)/.exec(String(texto ?? ''));
    if (m) return m[1];
  }
  return null;
}

export function realzarTarjeta(nodo, p) {
  if (!nodo) return nodo;
  nodo.classList.add('tarjeta-realzada');
  const puntos = [...nodo.querySelectorAll(':scope > .tarjeta-puntos > li')];
  puntos.forEach((li, k) => {
    const tema = temaDePunto(li.textContent) ?? 'ruta';
    const marca = el('span', { class: `punto-marca punto-${tema}`, 'aria-hidden': 'true' });
    marca.append(dibujo(tema));
    li.classList.add('punto-realzado');
    li.style.setProperty('--i', String(k));
    li.prepend(marca);
  });
  nodo.style.setProperty('--n-puntos', String(puntos.length));
  // Las fichas de inglés: EN · palabra · pronunciación | ES · término | abreviatura.
  const fichas = [...nodo.querySelectorAll(':scope > .tarjeta-fichas > .ficha-ingles')];
  fichas.forEach((ficha, k) => {
    const w = p?.ingles?.[k];
    if (!w) return;
    ficha.classList.add('ficha-realzada');
    ficha.prepend(el('span', { class: 'ficha-idioma', 'aria-hidden': 'true' }, null, 'EN'));
    const es = terminoEspanol(w.significado);
    const oir = ficha.querySelector('.ficha-oir');
    const extra = [];
    if (es) {
      const caja = el('span', { class: 'ficha-es', lang: 'es' });
      el('span', { class: 'ficha-idioma es', 'aria-hidden': 'true' }, caja, 'ES');
      el('span', { class: 'ficha-es-texto' }, caja, es);
      extra.push(caja);
    }
    const abrev = abreviaturaDe(w);
    if (abrev && !String(w.palabra).includes(`(${abrev})`)) extra.push(el('abbr', { class: 'ficha-abrev' }, null, abrev));
    for (const x of extra) ficha.insertBefore(x, oir);
  });
  return nodo;
}

// La figura a pantalla completa: tocarla la acerca (2×) o la vuelve a encajar en la pantalla.
export function figuraAmpliable(img) {
  if (!img) return img;
  img.classList.add('figura-encaja');
  img.addEventListener('click', () => {
    const cerca = img.classList.toggle('figura-cerca');
    img.classList.toggle('figura-encaja', !cerca);
    // El foco sigue dentro de la ventana (así Escape la cierra).
    img.closest('[role="dialog"]')?.querySelector('button')?.focus({ preventScroll: true });
  });
  return img;
}
