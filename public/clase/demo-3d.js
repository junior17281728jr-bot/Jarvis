// 0.14.78: galería de las escenas 3D (demo-3d.html). ?escena=espacio-aereo para ver una sola; ?paso=3 (desde 1),
// ?vista=1p|3p, ?t=12 (segundos), ?motor=2d (sin WebGL) y ?pausa=1 la dejan quieta en ese momento (para las capturas); ?tema y ?idioma.
import { montarEscena3d } from './escena3d.js';
import { escenaDesdeJson } from './e3d-json.js';
import { ESCENAS } from './escenas3d.js';
import { VISUALES } from './visuales.js';

export const EJEMPLOS = Object.keys(ESCENAS).map(escena => ({ escena }));
// Una escena hecha SOLO con datos (e3d-json.js): la base de las «consecuencias animadas». ?json=1 la muestra.
export const EJEMPLO_JSON = {
  id: 'consecuencia-clase-c', titulo: 'Consecuencia: entrar a la Clase C sin contacto', recuerda: 'Antes de la pared magenta: contacto por radio con Approach.',
  unidades: { ftH: 6076, ftV: 1000 }, exagerar: 2, texturaEscala: 0.9, escalaAvion: 0.011,
  entorno: {
    terreno: { x0: -30, z0: -30, x1: 30, z1: 30, n: 14, falda: 300 },
    aeropuertos: [{ x: 0, z: 0, rumbo: 140, largo: 1.4, ancho: 0.06 }],
    volumenes: [{ tipo: 'cilindro', clase: 'C', centro: [0, 0], radio: 5, desde: 0, hasta: 4 }, { tipo: 'anillo', clase: 'C', centro: [0, 0], radio: 5, radio2: 10, desde: 1.2, hasta: 4 }],
    etiquetas: [{ p: [0, 4.4, 0], texto: 'Clase C', clase: 'C' }],
  },
  pasos: [
    { id: 'bien', titulo: 'Lo correcto', texto: 'Antes de la pared, **llamas a Approach** y esperas oír tu matrícula.', estado: 'Fuera de la Clase C · en contacto', clase: 'ok',
      camara: { mira: [0, 2, 0], giro: 315, alto: 16, dist: 34, seguir: 0.3 }, vuelo: { ruta: [[18, 2.5, -18], [13, 2.5, -13], [11, 2.5, -9], [12, 2.5, -4], [16, 2.5, -2]], seg: 18, kt: 110 } },
    { id: 'mal', titulo: 'La consecuencia', texto: 'Sin contacto, **entras sin permiso**: es una infracción y ATC tiene que apartar a otros aviones.', estado: 'Dentro de la Clase C · sin contacto', clase: 'mal',
      camara: { mira: [0, 2, 0], giro: 315, alto: 16, dist: 34, seguir: 0.3 }, vuelo: { ruta: [[18, 2.5, -18], [12, 2.5, -12], [7, 2.5, -7], [3, 2.5, -3]], seg: 16, kt: 110 } },
    { id: 'perdida', titulo: 'Otra consecuencia', texto: 'Tirar de los mandos con poca velocidad: la nariz sube, se pasa el **ángulo crítico** y el avión **cae**.', estado: 'Pérdida', clase: 'mal',
      camara: { mira: [-22, 3, 16], giro: 20, alto: 8, dist: 6, seguir: 1 }, vuelo: { ruta: [[-26, 3, 16], [-23, 3.1, 16], [-20, 2.6, 16], [-18, 1.8, 16]], seg: 10, kt: 60 },
      estados: [{ t: 0, cabeceo: 2, alabeo: 0, kt: 70 }, { t: 4, cabeceo: 18, alabeo: 0, kt: 50 }, { t: 6, cabeceo: -12, alabeo: 15, kt: 55 }, { t: 10, cabeceo: -4, alabeo: 0, kt: 75 }] },
  ],
};

async function iniciar() {
  const q = new URLSearchParams(location.search);
  const raiz = document.documentElement;
  if (q.get('tema')) raiz.dataset.tema = q.get('tema');
  const idioma = q.get('idioma') === 'en' ? 'en' : 'es';
  raiz.lang = idioma;
  let catalogo = {};
  try { catalogo = await (await fetch(`../i18n/${idioma}.json`)).json(); } catch { catalogo = {}; }
  const t = (clave, v = {}) => String(catalogo[clave] ?? clave).replace(/\{(\w+)\}/g, (_, n) => (n in v ? String(v[n]) : `{${n}}`));
  const ir = cambio => { const u = new URL(location.href); for (const [k, v] of Object.entries(cambio)) u.searchParams.set(k, v); location.href = u.href; };
  document.querySelectorAll('.demo-tema [data-tema]').forEach(b => b.addEventListener('click', () => ir({ tema: b.dataset.tema })));
  document.querySelectorAll('.demo-tema [data-idioma]').forEach(b => b.addEventListener('click', () => ir({ idioma: b.dataset.idioma })));
  const galeria = document.getElementById('galeria');
  const sola = q.get('escena');
  const montadas = [];
  const lista = q.get('json') === '1' ? [{ escena: EJEMPLO_JSON.id, propia: escenaDesdeJson(EJEMPLO_JSON) }] : EJEMPLOS;
  for (const p of lista) {
    if (sola && sola !== p.escena && !p.propia) continue;
    const seccion = document.createElement('section');
    seccion.className = 'demo-seccion';
    seccion.id = p.escena;
    const hueco = document.createElement('div');
    hueco.className = 'demo-hueco';
    seccion.appendChild(hueco);
    // ?via=registro: por el registro de verdad (visuales.js: el hueco y el import() cuando se usa).
    const api = p.propia ? montarEscena3d(hueco, {}, { modo: 'interactivo', t, escena: p.propia, motor: q.get('motor') })
      : q.get('via') === 'registro' ? VISUALES['escena-3d'](hueco, p, { modo: 'interactivo', t }) : montarEscena3d(hueco, p, { modo: 'interactivo', t, motor: q.get('motor') });
    montadas.push(api);
    const pre = document.createElement('pre');
    pre.className = 'demo-json';
    pre.textContent = p.propia ? JSON.stringify(EJEMPLO_JSON) : JSON.stringify({ tipo: 'escena-3d', parametros: p });
    seccion.appendChild(pre);
    galeria.appendChild(seccion);
  }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (q.get('pausa') === '1' || q.get('paso') || q.get('t')) {
    const num = k => (q.get(k) != null ? Number(q.get(k)) : null);
    for (const api of montadas) {
      // ?desde=2&transicion=0.5: a mitad del viaje de la cámara desde el paso 2.
      if (q.get('desde')) api.fijar({ paso: Number(q.get('desde')) - 1 });
      api.fijar({ paso: Math.max(0, Number(q.get('paso') || 1) - 1), tiempo: num('t'), vista: q.get('vista'), mezcla: num('mezcla'), transicion: num('transicion') });
    }
  }
  // Para medir: window.__e3d tiene las escenas montadas.
  window.__e3d = montadas;
  document.body.dataset.listo = '1';
}
if (typeof document !== 'undefined' && typeof location !== 'undefined') iniciar();
