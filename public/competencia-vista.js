// Academia 0.14.38: «Competencia» (#competencia, #competencia/<ronda>, #competencia/<ronda>/certificados,
// #competencia/admin). Seis rondas de 20 preguntas, UN intento cada una (lo cuida el servidor), una pregunta a la vez
// con su dibujo, el resultado enseguida con un chiste y la explicación, las tablas con medallas, el certificado de
// recuerdo de cada ronda y la galería de certificados de todos (con reacciones y comentarios).
//  - Los dibujos son SVG propios hechos aquí (createElementNS; colores como atributos o clases, nunca style=).
//  - Nada se arma como código: todo con el() y textContent.
// Las piezas llegan de app.js en «h».
import { dibujoCertificado, descargarPng, imprimir, fraseCompe, textosCompe, fechaLarga } from './certificado-vista.js';

const SVG = 'http://www.w3.org/2000/svg';
export const EMOJIS = Object.freeze(['👏', '😂', '🔥', '✈️']);
const LETRAS = ['A', 'B', 'C'];

function s(etiqueta, atributos = {}, ...hijos) {
  const n = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v != null) n.setAttribute(k, String(v));
  for (const x of hijos.flat()) if (x != null) n.append(x);
  return n;
}
const poner = (nodo, ...hijos) => { nodo.replaceChildren(...hijos.flat(Infinity).filter(x => x != null && x !== false)); return nodo; };

// ---------- Los dibujos (viewBox 0 0 200 110; «c» = color principal, «d» = detalle) ----------
const c = { class: 'dib-c' };
const d = { class: 'dib-d' };
const l = { class: 'dib-l', fill: 'none' };
function cielo() { return [s('circle', { cx: 170, cy: 20, r: 9, class: 'dib-sol' }), s('path', { d: 'M18 30q8-8 16 0q6-5 12 1h-28z', class: 'dib-nube-chica' })]; }
const DIBUJOS = {
  // Vista de arriba: un jet de cuatro motores, alas en flecha.
  jumbo: () => [s('path', { ...c, d: 'M100 8c5 0 7 8 7 18v24l60 22v8l-60-12v26l16 10v6l-23-6-23 6v-6l16-10V68L33 80v-8l60-22V26c0-10 2-18 7-18z' }),
    ...[52, 72, 128, 148].map(x => s('rect', { ...d, x: x - 4, y: x < 100 ? 74 - (x - 40) / 5 : 74 - (160 - x) / 5, width: 8, height: 13, rx: 3 })), s('path', { ...d, d: 'M96 20h8v6h-8z' })],
  bimotor: () => [s('path', { ...c, d: 'M100 10c4 0 6 7 6 16v26l52 18v7l-52-10v24l14 9v5l-20-5-20 5v-5l14-9V67l-52 10v-7l52-18V26c0-9 2-16 6-16z' }),
    s('rect', { ...d, x: 66, y: 64, width: 8, height: 14, rx: 3 }), s('rect', { ...d, x: 126, y: 64, width: 8, height: 14, rx: 3 })],
  gigante: () => [s('path', { ...c, d: 'M100 4c6 0 9 9 9 20v26l78 20v8l-78-10v26l20 10v6l-29-6-29 6v-6l20-10V68L13 78v-8l78-20V24c0-11 3-20 9-20z' }),
    ...[34, 50, 66, 134, 150, 166].map(x => s('rect', { ...d, x: x - 4, y: 72 - Math.abs(100 - x) / 7, width: 8, height: 12, rx: 3 })), s('path', { ...d, d: 'M80 96l20-4 20 4' })],
  supersonico: () => [s('path', { ...c, d: 'M100 2l5 30 50 66v8l-55-12-55 12v-8l50-66z' }), s('path', { ...d, d: 'M100 2l2 14h-4z' }), s('path', { ...d, d: 'M88 86h24l-2 10h-20z' })],
  avioneta: () => [s('path', { ...c, d: 'M30 62q0-8 14-9l70-3 40-14h10l-6 20 14 2v8l-14 3H48q-18 0-18-7z' }), s('path', { ...d, d: 'M60 42h70v6H60z' }),
    s('path', { ...l, d: 'M78 48l10 14M112 48l-6 14' }), s('circle', { ...d, cx: 70, cy: 82, r: 6 }), s('circle', { ...d, cx: 112, cy: 82, r: 6 }), s('path', { ...l, d: 'M70 76l4-8M112 76l-2-8' }),
    s('path', { ...d, d: 'M24 46h4v34h-4z' }), s('path', { ...d, d: 'M84 56h22l-4 6h-18z', class: 'dib-ventana' })],
  biplano: () => [s('path', { ...c, d: 'M40 30h120v7H40zM40 70h120v7H40z' }), s('path', { ...l, d: 'M60 37v33M90 37v33M110 37v33M140 37v33M60 37l30 33M140 37l-30 33' }),
    s('path', { ...d, d: 'M95 48h40l20-6v10l-20 6H95z' }), s('circle', { ...d, cx: 70, cy: 92, r: 6 }), s('circle', { ...d, cx: 130, cy: 92, r: 6 }), s('path', { ...d, d: 'M30 50h6v20h-6z' })],
  helicoptero: () => [s('path', { ...c, d: 'M50 58q0-22 26-22h20q18 0 22 18l46 2v8l-46 4q-4 14-24 14H74q-24 0-24-24z' }), s('path', { ...d, d: 'M58 54q2-12 18-12h8v18H60z', class: 'dib-ventana' }),
    s('path', { ...d, d: 'M30 30h110v4H30z' }), s('path', { ...d, d: 'M83 34h4v4h-4z' }), s('circle', { ...l, cx: 166, cy: 58, r: 10 }), s('path', { ...l, d: 'M60 96h60M70 82l-4 14M110 82l4 14' })],
  globo: () => [s('path', { ...c, d: 'M100 6c26 0 42 18 42 38 0 20-24 34-32 46H90C82 78 58 64 58 44 58 24 74 6 100 6z' }), s('path', { ...d, d: 'M100 6c-10 12-14 26-12 40s2 30 2 44h20c0-14 0-30 2-44S110 18 100 6z' }),
    s('path', { ...l, d: 'M90 90l2 8M110 90l-2 8' }), s('rect', { ...d, x: 90, y: 97, width: 20, height: 11, rx: 2 }), ...cielo()],
  planeador: () => [s('path', { ...c, d: 'M4 52l96-6 96 6v5l-96-3-96 3z' }), s('path', { ...c, d: 'M96 30c3 0 4 6 4 14v40l14 6v4H86v-4l14-6' }), s('path', { ...c, d: 'M97 30h6l-1 58h-4z' }), s('path', { ...l, d: 'M30 90q10-12 20 0M150 92q8-10 16 0' })],
  hidroavion: () => [s('path', { ...c, d: 'M30 52q0-8 14-9l70-3 40-14h10l-6 20 14 2v8l-14 3H48q-18 0-18-7z' }), s('path', { ...d, d: 'M60 32h76v6H60z' }), s('path', { ...l, d: 'M80 38v12M118 38v12M70 62l-6 18M118 62l6 18' }),
    s('path', { ...d, d: 'M44 80h50l8 6H52zM100 80h48l8 6h-48z' }), s('path', { ...l, d: 'M10 98q15-6 30 0t30 0 30 0 30 0 30 0 30 0', class: 'dib-agua' })],
  dirigible: () => [s('ellipse', { ...c, cx: 96, cy: 44, rx: 76, ry: 26 }), s('path', { ...d, d: 'M160 30l26-12v52l-26-12z' }), s('path', { ...d, d: 'M82 70h30l-4 12H86z' }), s('path', { ...l, d: 'M40 44h112' }), ...cielo()],
  cohete: () => [s('path', { ...c, d: 'M100 4c14 14 18 34 18 56v26H82V60c0-22 4-42 18-56z' }), s('circle', { ...d, cx: 100, cy: 42, r: 8, class: 'dib-ventana' }), s('path', { ...d, d: 'M82 66l-16 22h16zM118 66l16 22h-16z' }),
    s('path', { class: 'dib-fuego', d: 'M88 88q12 30 24 0z' })],
  torre: () => [s('path', { ...c, d: 'M88 104V50h24v54z' }), s('path', { ...c, d: 'M70 30h60l-8 20H78z' }), s('path', { ...d, d: 'M78 34h44l-4 12H82z', class: 'dib-ventana' }), s('path', { ...d, d: 'M98 18h4v12h-4z' }),
    s('circle', { class: 'dib-luz', cx: 100, cy: 16, r: 4 }), s('path', { ...l, d: 'M120 24q12-8 24 0M124 18q16-10 32 0' }), s('path', { ...d, d: 'M10 104h180v4H10z' })],
  instrumento: () => [s('circle', { ...c, cx: 100, cy: 56, r: 48 }), s('circle', { class: 'dib-esfera', cx: 100, cy: 56, r: 42 }),
    s('path', { class: 'dib-arco-blanco', fill: 'none', d: 'M66 82A42 42 0 0 1 62 44' }), s('path', { class: 'dib-arco-verde', fill: 'none', d: 'M64 50A38 38 0 0 1 128 30' }),
    s('path', { class: 'dib-arco-amarillo', fill: 'none', d: 'M128 30A38 38 0 0 1 138 62' }), s('path', { class: 'dib-arco-rojo', fill: 'none', d: 'M138 64l-1 6' }),
    s('path', { ...d, d: 'M100 56l30-26 3 3z' }), s('circle', { ...d, cx: 100, cy: 56, r: 5 })],
  pista: () => [s('path', { ...c, d: 'M70 108L92 6h16l22 102z' }), s('path', { class: 'dib-raya', d: 'M98 14h4v10h-4zM97 34h6v12h-6zM96 58h8v14h-8z' }),
    s('text', { x: 100, y: 100, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, class: 'dib-numero' }, '27'), s('path', { ...l, d: 'M10 108h180' })],
  nube: () => [s('path', { ...c, d: 'M40 70q-14 0-14-12t16-12q2-16 20-16 8-14 26-14t26 14q22-2 26 14 16 0 16 14t-16 12z' }), s('path', { ...c, d: 'M60 30h90l-20-14H80z' }),
    s('path', { class: 'dib-rayo', d: 'M96 72l-10 18h10l-6 16 18-24h-10l6-10z' }), s('path', { ...l, d: 'M60 78l-4 10M130 78l-4 10M150 78l-4 10' })],
  brujula: () => [s('circle', { ...c, cx: 100, cy: 56, r: 48 }), s('circle', { class: 'dib-esfera', cx: 100, cy: 56, r: 40 }), s('path', { class: 'dib-norte', d: 'M100 18l9 38h-18z' }), s('path', { ...d, d: 'M100 94l9-38h-18z' }),
    s('path', { ...d, d: 'M62 56l38-6v12zM138 56l-38-6v12z' }), s('text', { x: 100, y: 15, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, class: 'dib-numero' }, 'N')],
};
export const CLAVES_DIBUJOS = Object.freeze(Object.keys(DIBUJOS));
export function dibujo(clave, t) {
  if (!DIBUJOS[clave]) return null;
  return s('svg', { viewBox: '0 0 200 110', class: `compe-dibujo dib-${clave}`, role: 'img', 'aria-label': t(`compe.dibujo.${clave}`) }, DIBUJOS[clave]());
}

// ---------- 0.14.41: las fotos reales (Wikimedia Commons), con su crédito; si no cargan, el dibujo de siempre ----------
// foto: { src, ancho, alto, autor, licencia } (+ titulo, fuente después de responder: ahí el crédito enlaza a Commons).
// La caja guarda el alto de la foto desde el principio (ancho/alto y aspect-ratio en el CSS): nada salta bajo el dedo.
export function figuraFoto(foto, clave, h, { chica = false } = {}) {
  const { el, t } = h;
  const caja = el('figure', { class: `compe-foto${chica ? ' chica' : ''}` });
  const img = el('img', { class: 'compe-foto-img', src: foto.src, width: foto.ancho, height: foto.alto, decoding: 'async',
    alt: foto.titulo ? t('compe.foto.alt', { titulo: foto.titulo }) : t('compe.foto.alt_pregunta') });
  img.addEventListener('error', () => {
    caja.classList.add('sin-foto');
    poner(caja, clave ? dibujo(clave, t) : null);
  }, { once: true });
  const commons = foto.fuente
    ? el('a', { href: foto.fuente, target: '_blank', rel: 'noopener noreferrer', texto: t('compe.foto.commons') })
    : el('span', { texto: t('compe.foto.commons') });
  const credito = el('figcaption', { class: 'compe-foto-credito' }, el('span', { texto: t('compe.foto.credito', { autor: foto.autor, licencia: foto.licencia }) }), el('span', { texto: ' · ' }), commons);
  return poner(caja, img, credito);
}
// La imagen de una pregunta: la foto si hay; si no, el dibujo.
function imagen(foto, clave, h, opciones) {
  if (foto?.src) return figuraFoto(foto, clave, h, opciones);
  return clave ? dibujo(clave, h.t) : null;
}

// ---------- Piezas ----------
const MEDALLA = { oro: '🥇', plata: '🥈', bronce: '🥉' };
function tabla(filas, h, { rondas = false } = {}) {
  const { el, t, numero } = h;
  if (!filas.length) return el('p', { class: 'suave', texto: t('compe.tabla.vacia') });
  return el('ol', { class: 'compe-tabla' }, filas.map(f => el('li', { class: `compe-fila${f.esYo ? ' es-yo' : ''}${f.medalla ? ` medalla-${f.medalla}` : ''}` },
    el('span', { class: 'compe-puesto', texto: f.medalla ? MEDALLA[f.medalla] : `${numero(f.puesto)}.` }),
    el('span', { class: 'compe-nombre', texto: f.esYo ? t('compe.tabla.tu', { nombre: f.nombre ?? '' }) : f.nombre }),
    el('span', { class: 'compe-puntos', texto: rondas ? t('compe.tabla.puntos_rondas', { aciertos: numero(f.aciertos), total: numero(f.total), rondas: numero(f.rondas) }) : t('compe.tabla.puntos', { aciertos: numero(f.aciertos), total: numero(f.total) }) }))));
}
// La fecha y la hora de un comentario (hora de República Dominicana).
function fechaHora(isoTexto, idioma = 'es') {
  try { return new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo' }).format(new Date(isoTexto)); } catch { return fechaLarga(isoTexto, idioma); }
}

// ---------- #competencia: la portada ----------
export function pantallaCompetencia(datos, certs, h) {
  const { el, t, numero, icono } = h;
  const tarjeta = r => {
    const estado = r.estado === 'terminada'
      ? el('p', { class: 'compe-estado fuerte', texto: t('compe.portada.hecha', { aciertos: numero(r.resultado.aciertos), total: numero(r.resultado.total) }) })
      : r.estado === 'jugando' ? el('p', { class: 'compe-estado tono-atencion', texto: t('compe.portada.jugando', { n: numero(r.numero), total: numero(r.total) }) })
        : el('p', { class: 'compe-estado suave', texto: t('compe.portada.nueva') });
    return el('li', { class: `compe-ronda estado-${r.estado}` },
      el('a', { href: `#competencia/${r.ronda}`, class: 'compe-ronda-enlace' },
        el('span', { class: 'compe-ronda-numero', texto: numero(r.ronda) }),
        el('span', { class: 'compe-ronda-texto' }, el('strong', { texto: r.titulo }), el('span', { class: 'suave chica', texto: r.lema }), estado,
          r.puesto ? el('span', { class: 'chica', texto: t('compe.portada.puesto', { n: numero(r.puesto), de: numero(r.jugadores) }) }) : null)),
      r.estado === 'terminada' ? el('a', { class: 'boton-texto chica', href: `#competencia/${r.ronda}/certificados` }, el('span', { texto: t('compe.galeria.ver') })) : null);
  };
  return [
    el('section', { class: 'tarjeta compe-cabeza' },
      dibujo('jumbo', t),
      el('h1', { class: 'titulo-pantalla', texto: t('compe.titulo') }),
      el('p', { class: 'entrada', texto: t('compe.linea') }),
      el('ul', { class: 'compe-reglas chica' }, ['uno', 'mismas', 'reloj', 'repaso'].map(k => el('li', { texto: k === 'reloj' ? (datos.reloj ? t('compe.regla.reloj', { s: numero(datos.reloj) }) : t('compe.regla.sin_reloj')) : t(`compe.regla.${k}`) })))),
    el('section', { class: 'tarjeta' }, el('h2', { class: 'con-icono' }, icono('avion'), el('span', { texto: t('compe.rondas') })), el('ol', { class: 'compe-rondas' }, datos.rondas.map(tarjeta))),
    el('section', { class: 'tarjeta' }, el('h2', { class: 'con-icono' }, icono('trofeo'), el('span', { texto: t('compe.general') })), el('p', { class: 'suave chica', texto: t('compe.general.linea') }), tabla(datos.general, h, { rondas: true })),
    certs?.length ? el('section', { class: 'tarjeta' }, el('h2', { class: 'con-icono' }, icono('medalla'), el('span', { texto: t('compe.mis_certificados') })),
      el('ul', { class: 'compe-mis-cert' }, certs.map(x => el('li', {}, el('a', { href: `#competencia/${x.ronda}`, texto: t('compe.cert.linea', { ronda: x.ronda, titulo: x.titulo, aciertos: numero(x.aciertos), total: numero(x.total) }) }))))) : null,
    el('p', {}, el('a', { class: 'boton-texto con-icono', href: '#competencia/fotos' }, icono('ojo', 'icono chico'), el('span', { texto: t('compe.fotos.titulo') }))),
    h.esAdmin ? el('p', {}, el('a', { class: 'boton-3d blanco chico', href: '#competencia/admin' }, el('span', { texto: t('compe.admin.ir') }))) : null,
  ];
}

// ---------- 0.14.41: #competencia/fotos: «Créditos de las fotos» (autor, licencia y la página de cada una en Commons) ----------
export function pantallaFotos(datos, h) {
  const { el, t, numero, icono } = h;
  const fila = f => el('li', { class: 'compe-credito' },
    el('img', { class: 'compe-credito-img', src: f.src, width: f.ancho, height: f.alto, alt: t('compe.foto.alt', { titulo: f.titulo }), loading: 'lazy', decoding: 'async' }),
    el('div', {},
      el('p', { class: 'fuerte', texto: f.titulo }),
      el('p', { class: 'chica', texto: t('compe.fotos.autor', { autor: f.autor }) }),
      el('p', { class: 'chica' }, f.licenciaUrl ? el('a', { href: f.licenciaUrl, target: '_blank', rel: 'noopener noreferrer', texto: f.licencia }) : el('span', { texto: f.licencia }),
        el('span', { texto: ' · ' }), el('a', { href: f.fuente, target: '_blank', rel: 'noopener noreferrer', texto: t('compe.fotos.ver') }))));
  return [
    el('a', { class: 'volver con-icono', href: '#competencia' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('compe.titulo') })),
    el('h1', { class: 'titulo-pantalla', texto: t('compe.fotos.titulo') }),
    el('p', { class: 'entrada', texto: t('compe.fotos.linea', { n: numero(datos.fotos.length) }) }),
    el('p', { class: 'suave chica', texto: t('compe.fotos.cambios') }),
    el('section', { class: 'tarjeta' }, el('ul', { class: 'compe-creditos' }, datos.fotos.map(fila))),
  ];
}

// ---------- #competencia/<n>: jugar ----------
export function pantallaRonda(datos, h) {
  const { el, t, numero, icono, api, textoError, confirmar } = h;
  const zona = el('div', { class: 'compe-zona', 'aria-live': 'polite' });
  const n = datos.ronda;
  const volver = el('a', { class: 'volver con-icono', href: '#competencia' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('compe.titulo') }));
  const error = r => poner(zona, el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos?.error) }),
    el('a', { class: 'boton-3d blanco', href: '#competencia' }, el('span', { texto: t('compe.volver') }))));
  let reloj = null;
  const pararReloj = () => { if (reloj) { clearInterval(reloj); reloj = null; } };

  function intro(d) {
    const empezar = el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: async e => {
      const boton = e.currentTarget;
      if (confirmar && !(await confirmar(t('compe.empezar.seguro')))) return;
      boton.disabled = true;
      const r = await api('POST', `/api/academia/competencia/${n}/empezar`, {});
      if (!r.ok) return error(r);
      seguir(r.datos);
    } }, el('span', { texto: t('compe.empezar') }));
    poner(zona, el('section', { class: 'tarjeta compe-intro' },
      el('p', { class: 'antetitulo', texto: t('compe.ronda.n', { n }) }), el('h1', { class: 'titulo-pantalla', texto: d.titulo }), el('p', { class: 'entrada', texto: d.lema }),
      el('ul', { class: 'compe-reglas' }, el('li', { texto: t('compe.intro.veinte', { n: numero(d.total) }) }), el('li', { class: 'fuerte', texto: t('compe.intro.una') }),
        el('li', { texto: d.reloj ? t('compe.intro.reloj', { s: numero(d.reloj) }) : t('compe.regla.sin_reloj') }), el('li', { texto: t('compe.intro.chiste') })),
      el('div', { class: 'botones' }, empezar)));
  }

  function pregunta(d) {
    pararReloj();
    const q = d.actual;
    const barra = el('progress', { class: 'compe-reloj', max: 1000, value: 1000, 'aria-label': t('compe.reloj') });
    const quedan = el('span', { class: 'compe-quedan chica' });
    const botones = LETRAS.map(letra => el('button', { type: 'button', class: 'compe-opcion', 'data-letra': letra, onclick: () => responder(letra) },
      el('span', { class: 'compe-letra', texto: letra }), el('span', { texto: q.opciones[letra] })));
    let enviado = false;
    async function responder(letra) {
      if (enviado) return;
      enviado = true;
      pararReloj();
      for (const b of botones) b.disabled = true;
      const r = await api('POST', `/api/academia/competencia/${n}/responder`, { pregunta: q.id, elegida: letra });
      if (!r.ok) {
        // Ya contestada en otra pestaña o el servidor siguió: se vuelve a mirar dónde va.
        if (r.datos?.error === 'pregunta_no_es_la_actual' || r.datos?.error === 'ronda_terminada') return recargar();
        enviado = false;
        for (const b of botones) b.disabled = false;
        return h.avisar?.(textoError(r.datos?.error), 'mal');
      }
      resultado(r.datos, q, botones);
    }
    if (q.quedanMs != null) {
      const fin = Date.now() + q.quedanMs;
      const total = (d.reloj || 45) * 1000;
      const tic = () => {
        const ms = Math.max(0, fin - Date.now());
        barra.value = Math.round((ms / total) * 1000);
        barra.classList.toggle('poco', ms < 10_000);
        quedan.textContent = t('compe.quedan', { s: numero(Math.ceil(ms / 1000)) });
        if (!zona.isConnected) return pararReloj();
        if (ms <= 0) { pararReloj(); responder(null); }
      };
      tic();
      reloj = setInterval(tic, 250);
    }
    poner(zona, el('section', { class: 'tarjeta compe-pregunta' },
      el('div', { class: 'compe-arriba' }, el('span', { class: 'antetitulo', texto: t('compe.pregunta_n', { n: numero(q.numero), total: numero(q.total) }) }),
        el('span', { class: 'insignia', texto: t('compe.aciertos', { n: numero(d.aciertos ?? 0) }) })),
      q.quedanMs != null ? el('div', { class: 'compe-reloj-caja' }, barra, quedan) : null,
      q.foto || q.dibujo ? el('div', { class: q.foto ? 'compe-dibujo-caja con-foto' : 'compe-dibujo-caja' }, imagen(q.foto, q.dibujo, h, { chica: true })) : null,
      el('h2', { class: 'compe-enunciado', texto: q.pregunta }),
      el('div', { class: 'compe-opciones' }, botones),
      el('div', { class: 'compe-respuesta' })));
  }

  function resultado(r, q, botones) {
    for (const b of botones) {
      const letra = b.getAttribute('data-letra');
      if (letra === r.buena) b.classList.add('buena');
      else if (letra === r.elegida) b.classList.add('mala');
    }
    h.sonar?.(r.correcta ? 'bien' : 'mal');
    const lugar = zona.querySelector('.compe-respuesta');
    const siguiente = el('button', { type: 'button', class: 'boton-3d grande', onclick: () => recargar() }, el('span', { texto: r.terminada ? t('compe.ver_resultado') : t('compe.siguiente') }));
    poner(lugar, el('div', { class: `compe-veredicto ${r.correcta ? 'tono-bien' : 'tono-atencion'}` },
      el('p', { class: 'compe-titular', texto: r.correcta ? t('compe.bien') : r.aTiempo ? t('compe.mal', { buena: r.buena }) : t('compe.tarde', { buena: r.buena }) }),
      el('p', { class: 'compe-chiste', texto: r.humor }),
      // 0.14.41: la foto grande con la explicación (también la que, antes de responder, habría delatado la respuesta).
      r.foto ? el('div', { class: 'compe-foto-resultado' }, figuraFoto(r.foto, r.dibujo ?? q.dibujo, h)) : null,
      el('p', { class: 'compe-explica', texto: r.explicacion }),
      el('div', { class: 'botones' }, siguiente)));
    siguiente.focus?.();
    if (r.terminada && r.aciertos === r.total) h.celebrar?.(zona);
  }

  async function terminada(d) {
    const res = d.resultado;
    const certR = await api('GET', '/api/academia/competencia/certificados');
    const cert = certR.ok ? certR.datos.certificados.find(x => x.ronda === n) : null;
    poner(zona,
      el('section', { class: 'tarjeta compe-fin' },
        el('p', { class: 'antetitulo', texto: t('compe.ronda.n', { n }) }), el('h1', { class: 'titulo-pantalla', texto: d.titulo }),
        el('p', { class: 'compe-gran-nota', texto: t('compe.tabla.puntos', { aciertos: numero(res.aciertos), total: numero(res.total) }) }),
        // 0.14.41: la frase del certificado, bien grande, y el certificado enseguida (con «Descargar»), antes de la tabla.
        cert ? el('p', { class: 'compe-fin-frase', texto: fraseCompe(cert, t) }) : null,
        el('p', { class: 'suave chica', texto: t('compe.fin.una_vez') }),
        res.malas ? el('p', {}, el('a', { class: 'boton-texto con-icono', href: '#mi-repaso' }, icono('actualizar', 'icono chico'), el('span', { texto: t('compe.fin.repaso', { n: numero(res.malas) }) }))) : null),
      cert ? tarjetaCertificado(cert, h) : null,
      el('section', { class: 'tarjeta' }, el('h2', { class: 'con-icono' }, icono('trofeo'), el('span', { texto: t('compe.tabla.ronda') })), tabla(d.tabla ?? [], h)),
      el('p', {}, el('a', { class: 'boton-3d blanco', href: `#competencia/${n}/certificados` }, el('span', { texto: t('compe.galeria.ver') }))));
  }

  async function recargar() {
    const r = await api('GET', `/api/academia/competencia/${n}`, undefined, { fresco: true });
    if (!r.ok) return error(r);
    seguir(r.datos);
  }
  function seguir(d) {
    if (d.estado === 'nueva') return intro(d);
    if (d.estado === 'jugando') return pregunta(d);
    return terminada(d);
  }
  seguir(datos);
  return [volver, zona];
}

// El certificado de una ronda (el mismo dibujo de los certificados de recuerdo), con «Descargar» y «PDF».
// 0.14.72: titulo (el administrador, en los de un alumno: «Competencia de aviación · Ronda N» en vez de «Tu certificado…»).
export function tarjetaCertificado(cert, h, { compacto = false, titulo = null } = {}) {
  const { el, t } = h;
  const marco = el('div', { class: 'cert-marco' });
  marco.append(dibujoCertificado(cert, cert.nombre, h, { papel: 'a4' }));
  const mensaje = h.caja ? h.caja() : el('div');
  const bajar = h.botonAccion ? h.botonAccion(t('cert.descargar'), '', mensaje, async () => {
    try { await descargarPng(marco.firstElementChild, cert); } catch { throw new Error(t('cert.descargar.error')); }
  }, 'flecha') : null;
  const pdf = el('button', { type: 'button', class: 'secundario con-icono', onclick: () => imprimir(marco.firstElementChild, 'a4') }, h.icono('manual'), el('span', { texto: t('cert.pdf') }));
  const tc = textosCompe(cert, t);
  return el('section', { class: `tarjeta cert-tarjeta${compacto ? ' compacto' : ''}` },
    compacto ? null : el('h2', { class: 'con-icono' }, h.icono('medalla'), el('span', { texto: titulo ?? t('compe.cert.titulo') })),
    marco,
    el('details', { class: 'cert-leer' }, el('summary', { texto: t('cert.leer') }), el('p', { class: 'cert-titular', texto: tc.titular }), el('p', { texto: tc.cuerpo }), el('p', { class: 'suave chica', texto: t('cert.aviso') })),
    compacto ? null : el('div', { class: 'botones' }, bajar, pdf),
    compacto ? null : el('p', { class: 'suave chica', texto: `${t('cert.codigo')}: ${cert.codigo}` }),
    mensaje);
}

// ---------- #competencia/<n>/certificados: la galería (una tras otra, bajando sola) ----------
export function pantallaGaleria(datos, h, { admin = false, recargar } = {}) {
  const { el, t, numero, icono, api, textoError } = h;
  const n = datos.ronda;
  const base = `/api/academia/competencia/${n}/certificados`;
  const feed = el('div', { class: 'compe-feed', tabindex: 0, 'aria-label': t('compe.galeria.titulo', { n }) });
  const tarjeta = cert => {
    const lista = el('ul', { class: 'compe-comentarios' }, cert.comentarios.map(x => el('li', {},
      el('span', { class: 'fuerte', texto: x.esYo ? t('compe.tabla.tu', { nombre: x.nombre ?? '' }) : x.nombre }),
      el('span', { class: 'suave chica', texto: ` · ${fechaHora(x.en, h.idioma)}` }),
      el('p', { texto: x.texto }),
      admin || x.esYo ? el('button', { type: 'button', class: 'boton-texto chica', onclick: async () => {
        if (h.confirmar && !(await h.confirmar(t('compe.comentario.borrar.confirmar'), { si: t('compe.comentario.borrar'), peligro: true }))) return;
        const r = await api('POST', `/api/academia/competencia/comentarios/${x.id}/borrar`, {});
        if (!r.ok) return h.avisar?.(textoError(r.datos?.error), 'mal');
        recargar?.();
      } }, el('span', { texto: t('compe.comentario.borrar') })) : null,
      admin && x.usuarioId ? el('button', { type: 'button', class: 'boton-texto chica', onclick: async () => {
        const r = await api('POST', '/api/admin/academia/competencia/silenciar', { usuarioId: x.usuarioId, silenciado: !x.silenciado });
        if (!r.ok) return h.avisar?.(textoError(r.datos?.error), 'mal');
        recargar?.();
      } }, el('span', { texto: x.silenciado ? t('compe.admin.quitar_silencio') : t('compe.admin.silenciar') })) : null)));
    const reacciones = el('div', { class: 'compe-reacciones' }, EMOJIS.map(e => el('button', {
      type: 'button', class: `compe-reaccion${cert.mias.includes(e) ? ' puesta' : ''}`, 'aria-pressed': cert.mias.includes(e) ? 'true' : 'false', 'aria-label': t('compe.reaccion', { emoji: e }),
      onclick: async ev => {
        const b = ev.currentTarget;
        b.disabled = true;
        const r = await api('POST', `${base}/${encodeURIComponent(cert.codigo)}/reaccion`, { emoji: e });
        b.disabled = false;
        if (!r.ok) return h.avisar?.(textoError(r.datos?.error), 'mal');
        const cuenta = b.querySelector('.compe-reaccion-n');
        const v = Number(cuenta.textContent || 0) + (r.datos.puesta ? 1 : -1);
        cuenta.textContent = String(Math.max(0, v));
        b.classList.toggle('puesta', r.datos.puesta);
        b.setAttribute('aria-pressed', r.datos.puesta ? 'true' : 'false');
      },
    }, el('span', { texto: e }), el('span', { class: 'compe-reaccion-n', texto: String(cert.reacciones[e] ?? 0) }))));
    const entrada = el('input', { type: 'text', maxlength: 200, class: 'compe-comentar', placeholder: t('compe.comentario.placeholder'), 'aria-label': t('compe.comentario.placeholder') });
    const enviar = el('button', { type: 'submit', class: 'boton-3d chico' }, el('span', { texto: t('compe.comentario.enviar') }));
    const form = el('form', { class: 'compe-form', onsubmit: async ev => {
      ev.preventDefault();
      const texto = entrada.value.trim();
      if (!texto) return;
      enviar.disabled = true;
      const r = await api('POST', `${base}/${encodeURIComponent(cert.codigo)}/comentario`, { texto });
      enviar.disabled = false;
      if (!r.ok) return h.avisar?.(textoError(r.datos?.error), 'mal');
      entrada.value = '';
      recargar?.();
    } }, entrada, enviar);
    return el('article', { class: 'compe-post' },
      el('p', { class: 'compe-post-quien' }, el('strong', { texto: cert.esYo ? t('compe.tabla.tu', { nombre: cert.nombre ?? '' }) : cert.nombre }),
        el('span', { class: 'suave chica', texto: ` · ${t('compe.tabla.puntos', { aciertos: numero(cert.aciertos), total: numero(cert.total) })}` })),
      tarjetaCertificado(cert, h, { compacto: true }),
      reacciones, lista, datos.silenciado ? el('p', { class: 'suave chica', texto: t('compe.silenciado') }) : form);
  };
  poner(feed, datos.certificados.length ? datos.certificados.map(tarjeta) : el('p', { class: 'suave', texto: t('compe.galeria.vacia') }));
  auto(feed);
  return [
    el('a', { class: 'volver con-icono', href: `#competencia/${n}` }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('compe.ronda.titulo', { n, titulo: datos.titulo }) })),
    el('h1', { class: 'titulo-pantalla', texto: t('compe.galeria.titulo', { n }) }),
    el('p', { class: 'entrada', texto: t('compe.galeria.linea') }),
    feed,
  ];
}
// Baja sola, despacio. Se para al tocar, al pasar el ratón o al escribir; sigue a los 4 s. Con «reducir movimiento», no se mueve.
function auto(feed) {
  let quieta = false;
  try { quieta = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { quieta = false; }
  if (quieta) { feed.classList.add('sin-movimiento'); return; }
  let pausa = Date.now() + 2500;
  const parar = (ms = 4000) => { pausa = Date.now() + ms; };
  for (const ev of ['pointerdown', 'touchstart', 'wheel', 'focusin', 'keydown', 'mouseenter', 'mousemove']) feed.addEventListener(ev, () => parar(), { passive: true });
  let resto = 0;
  const id = setInterval(() => {
    if (!feed.isConnected) return clearInterval(id);
    if (Date.now() < pausa || document.hidden) return;
    if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 2) { parar(3500); feed.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    resto += 0.6;
    const paso = Math.floor(resto);
    resto -= paso;
    if (paso) feed.scrollTop += paso;
  }, 30);
}

// ---------- «Mi repaso»: lo que falló en la competencia ----------
export function seccionFalladas(lista, h) {
  const { el, t, numero, icono } = h;
  return el('section', { class: 'panel compe-falladas', 'aria-labelledby': 'compe-falladas-titulo' },
    el('h2', { id: 'compe-falladas-titulo', class: 'con-icono' }, icono('trofeo'), el('span', { texto: t('compe.repaso.titulo') })),
    el('p', { class: 'suave', texto: t('compe.repaso.linea', { n: numero(lista.length) }) }),
    el('ul', { class: 'compe-falladas-lista' }, lista.map(x => el('li', {},
      x.foto || x.dibujo ? el('div', { class: 'compe-dibujo-mini' }, imagen(x.foto, x.dibujo, h, { chica: true })) : null,
      el('p', { class: 'antetitulo', texto: t('compe.ronda.n', { n: x.ronda }) }),
      el('p', { class: 'fuerte', texto: x.pregunta }),
      el('p', { class: 'chica tono-bien', texto: t('compe.repaso.buena', { letra: x.buena, texto: x.opciones[x.buena] }) }),
      el('p', { class: 'chica suave', texto: x.elegida ? t('compe.repaso.tuya', { letra: x.elegida, texto: x.opciones[x.elegida] }) : t('compe.repaso.sin_tiempo') }),
      el('p', { class: 'chica', texto: x.explicacion })))));
}

// ---------- #competencia/admin ----------
export function pantallaAdmin(datos, h, { recargar } = {}) {
  const { el, t, numero, icono, api, textoError } = h;
  const reloj = el('select', { id: 'compe-reloj' }, [0, 30, 45, 60, 90].map(sg => el('option', { value: sg, selected: datos.reloj === sg ? true : null, texto: sg ? t('compe.admin.reloj_s', { s: numero(sg) }) : t('compe.admin.sin_reloj') })));
  const mensaje = h.caja();
  const guardar = h.botonAccion(t('compe.admin.guardar'), 'secundario', mensaje, async () => {
    const r = await api('POST', '/api/admin/academia/competencia/ajustes', { reloj: Number(reloj.value) });
    if (!r.ok) throw new Error(textoError(r.datos?.error));
    h.avisar?.(t('compe.admin.guardado'));
  });
  const ronda = r => {
    const m = h.caja();
    const mejorar = r.jugada ? null : h.botonAccion(t('compe.admin.mejorar'), 'secundario', m, async () => {
      // 0.14.54: gasta IA: primero se pregunta (el diálogo de la app).
      if (h.confirmar && !(await h.confirmar(t('compe.admin.mejorar.confirmar'), { si: t('compe.admin.mejorar') }))) return;
      const x = await api('POST', `/api/admin/academia/competencia/${r.ronda}/mejorar`, {});
      if (!x.ok) throw new Error(textoError(x.datos?.error));
      h.avisar?.(t('compe.admin.mejorar.pedido'));
    }, 'chispa');
    const s = r.sugerencia;
    const sug = s && s.estado === 'lista' ? el('div', { class: 'compe-sugerencia' },
      el('p', { class: 'fuerte', texto: t('compe.admin.sugerencia', { n: numero(s.cambios.length) }) }),
      el('ul', {}, s.cambios.map(x => el('li', {}, el('p', { class: 'antetitulo', texto: x.id }),
        ['pregunta', 'explicacion', 'bien', 'mal'].filter(k => x[k]).map(k => el('p', { class: 'chica' }, el('span', { class: 'suave', texto: `${t(`compe.admin.campo.${k}`)}: ${x.antes?.[k] ?? ''} → ` }), el('strong', { texto: x[k] })))))),
      r.jugada ? el('p', { class: 'suave chica', texto: t('compe.admin.ya_jugada') }) : el('div', { class: 'botones' },
        h.botonAccion(t('compe.admin.aprobar'), '', m, async () => {
          const x = await api('POST', `/api/admin/academia/competencia/${r.ronda}/aprobar`, {});
          if (!x.ok) throw new Error(textoError(x.datos?.error));
          recargar?.();
        }),
        h.botonAccion(t('compe.admin.descartar'), 'secundario', m, async () => {
          if (h.confirmar && !(await h.confirmar(t('compe.admin.descartar.confirmar'), { si: t('compe.admin.descartar'), peligro: true }))) return;
          const x = await api('POST', `/api/admin/academia/competencia/${r.ronda}/descartar`, {});
          if (!x.ok) throw new Error(textoError(x.datos?.error));
          recargar?.();
        }))) : null;
    return el('section', { class: 'tarjeta' },
      el('h2', { texto: t('compe.ronda.titulo', { n: r.ronda, titulo: r.titulo }) }),
      el('p', { class: 'suave chica', texto: t('compe.admin.estado', { jugadores: numero(r.jugadores), terminados: numero(r.terminados) }) }),
      r.jugada ? el('p', { class: 'chica', texto: t('compe.admin.congelada') }) : el('p', { class: 'chica', texto: t('compe.admin.libre') }),
      el('div', { class: 'botones' }, mejorar, el('a', { class: 'boton-3d blanco chico', href: `#competencia/${r.ronda}/certificados` }, el('span', { texto: t('compe.galeria.ver') }))),
      // 0.14.38: el último pedido a la IA: «esperando» o por qué no llegó (la ronda sigue igual, sin IA).
      r.pedido?.estado === 'pendiente' ? el('p', { class: 'suave chica', texto: t('compe.admin.ia_esperando') }) : null,
      r.pedido?.estado === 'no' ? el('p', { class: 'aviso tono-atencion chica', texto: t('compe.admin.ia_no', { motivo: h.motivoIa ? h.motivoIa(r.pedido.motivo) : r.pedido.motivo }) }) : null,
      sug, m, tabla(r.tabla, h));
  };
  return [
    el('a', { class: 'volver con-icono', href: '#competencia' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('compe.titulo') })),
    el('h1', { class: 'titulo-pantalla', texto: t('compe.admin.titulo') }),
    el('p', { class: 'entrada', texto: t('compe.admin.linea') }),
    el('section', { class: 'tarjeta' }, el('label', { for: 'compe-reloj', texto: t('compe.admin.reloj') }), reloj, el('div', { class: 'botones' }, guardar), mensaje),
    el('section', { class: 'tarjeta' }, el('h2', { class: 'con-icono' }, icono('trofeo'), el('span', { texto: t('compe.general') })), tabla(datos.general, h, { rondas: true })),
    datos.rondas.map(ronda),
  ];
}
