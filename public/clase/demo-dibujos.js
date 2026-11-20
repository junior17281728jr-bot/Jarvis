// 0.14.62: galería de los dibujos de aviación (demo-dibujos.html): cada tipo con 2 a 4 juegos de parámetros. Datos de
// muestra propios (sin contenido de libros). ?tema=oscuro|claro, ?idioma=en|es y ?tipo=vor para ver uno solo.
import { VISUALES_AVIACION } from './aviacion.js';

export const EJEMPLOS = {
  circuito: [
    { titulo: 'Circuito estándar: a la izquierda', pista: '27', altitud: 1000, viento: { direccion: 250, velocidad: 10 } },
    { titulo: 'A la derecha, con la base resaltada y la salida', pista: '36', lado: 'derecha', resaltar: 'base', salida: true, altitud: 1500, viento: { direccion: 330, velocidad: 18 } },
    { titulo: 'Pista 9 a la derecha: la entrada a 45°', pista: '9', lado: 'derecha', resaltar: 'entrada', viento: { direccion: 0, velocidad: 0 } },
  ],
  'pista-marcas': [
    { titulo: 'Pista de precisión (las 6 marcas)', clase: 'precision', numero: '27L', ancho: 150 },
    { titulo: 'No precisión: el punto de mira', clase: 'no_precision', numero: '9', resaltar: ['punto_mira'] },
    { titulo: 'Umbral desplazado y zona previa', clase: 'visual', numero: '36', mostrar: ['designador', 'eje', 'umbral', 'umbral_desplazado', 'zona_previa'], resaltar: ['umbral_desplazado'] },
    { titulo: 'Pista cerrada', numero: '18', mostrar: ['designador', 'eje', 'umbral', 'cerrada'] },
  ],
  letreros: [
    { titulo: 'Un conjunto de dirección con la ubicación en medio', letreros: [{ tipo: 'direccion', texto: 'B', flecha: 'arriba_izquierda' }, { tipo: 'ubicacion', texto: 'A', pegado: true }, { tipo: 'direccion', texto: 'C', flecha: 'derecha', pegado: true }, { tipo: 'ubicacion', texto: 'A' }, { tipo: 'obligatorio', texto: '15-33', pegado: true, nota: 'La pista 15 queda a la izquierda y la 33 a la derecha.' }] },
    { titulo: 'Rojo, negro y amarillo', letreros: [{ tipo: 'obligatorio', texto: 'ILS' }, { tipo: 'no_entrar' }, { tipo: 'distancia', texto: '3' }, { tipo: 'destino', texto: 'RAMP', flecha: 'derecha' }, { tipo: 'informacion', texto: 'FBO 122.95' }] },
    { titulo: 'En el suelo: esperas, límites y el hot spot', letreros: [{ tipo: 'espera_pista' }, { tipo: 'limite_pista' }, { tipo: 'espera_ils' }, { tipo: 'limite_ils' }, { tipo: 'punto_caliente', texto: 'HS 2' }] },
  ],
  vor: [
    { titulo: 'TO, 2 puntos a la derecha', curso: 360, radial: 184, rumbo: 360 },
    { titulo: 'FROM, 2 puntos a la derecha', curso: 60, radial: 56, rumbo: 60 },
    { titulo: 'De lado: OFF', curso: 90, radial: 360, rumbo: 90 },
    { titulo: 'El rumbo no cambia nada: TO y la aguja a la derecha', curso: 180, radial: 4, rumbo: 180 },
  ],
  'triangulo-viento': [
    { titulo: 'El ejemplo del PHAK', curso: 90, tas: 120, viento: { direccion: 45, velocidad: 40 } },
    { titulo: 'Viento cruzado puro desde la izquierda', curso: 360, tas: 100, viento: { direccion: 270, velocidad: 20 } },
    { titulo: 'Viento de cola desde la derecha', curso: 225, tas: 140, viento: { direccion: 60, velocidad: 25 } },
  ],
  'carta-simbolos': [
    { titulo: 'Aeropuertos', simbolos: ['aeropuerto_torre', 'aeropuerto_sin_torre', 'aeropuerto_largo', 'aeropuerto_blando', 'aeropuerto_privado'] },
    { titulo: 'Espacio aéreo', simbolos: ['clase_b', 'clase_c', 'clase_d', 'clase_e_superficie', 'clase_e_700', 'clase_e_1200', 'moa', 'restringida', 'prohibida'], resaltar: ['clase_d'] },
    { titulo: 'Radioayudas, obstáculos y MEF', simbolos: ['vor', 'vor_dme', 'vortac', 'ndb', 'obstaculo', 'obstaculo_alto', 'mef'] },
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
  const t = (clave, v = {}) => String(catalogo[clave] ?? clave)
    .replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (_, n, uno, varios) => (Number(v[n]) === 1 ? uno : varios))
    .replace(/\{(\w+)\}/g, (_, n) => (n in v ? String(v[n]) : `{${n}}`));
  const ir = (cambio) => { const u = new URL(location.href); for (const [k, v] of Object.entries(cambio)) u.searchParams.set(k, v); location.href = u.href; };
  document.querySelectorAll('.demo-tema [data-tema]').forEach(b => b.addEventListener('click', () => ir({ tema: b.dataset.tema })));
  document.querySelectorAll('.demo-tema [data-idioma]').forEach(b => b.addEventListener('click', () => ir({ idioma: b.dataset.idioma })));
  const galeria = document.getElementById('galeria');
  const solo = q.get('tipo');
  for (const [tipo, lista] of Object.entries(EJEMPLOS)) {
    if (solo && solo !== tipo) continue;
    const seccion = document.createElement('section');
    seccion.className = 'demo-seccion';
    seccion.id = tipo;
    const h2 = document.createElement('h2');
    h2.textContent = tipo;
    seccion.appendChild(h2);
    lista.forEach((p, i) => {
      const hueco = document.createElement('div');
      hueco.className = 'demo-hueco';
      hueco.dataset.pieza = `${tipo}-${i}`;
      seccion.appendChild(hueco);
      VISUALES_AVIACION[tipo](hueco, p, { modo: 'interactivo', t });
      const pre = document.createElement('pre');
      pre.className = 'demo-json';
      pre.textContent = JSON.stringify({ tipo, parametros: p });
      seccion.appendChild(pre);
    });
    galeria.appendChild(seccion);
  }
  document.body.dataset.listo = '1';
}
if (typeof document !== 'undefined' && typeof location !== 'undefined') iniciar();
