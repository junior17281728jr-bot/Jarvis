// El ala por dentro: corte del perfil en 2,5D (con profundidad), líneas de corriente animadas, cuerda, viento
// relativo, flechas de sustentación y resistencia, y la pérdida (stall) al pasar el ángulo crítico.
// Las líneas de corriente salen de un flujo potencial real (perfil de Joukowski con la condición de Kutta): el
// dibujo es fiel a cómo se curva el aire. Pasado el ángulo crítico, el aire de arriba se separa (remolinos).
//
// API: montarAla(contenedor, opciones) → { tiempo(t), poner({alfa, resalta}), modo(m), pausar(b), destruir() }
//   opciones: { modo: 'interactivo' | 'explicacion', alfa: 4, angulo_critico: 16, claves: [{t, alfa, resalta}],
//               textos: {…} }
// Lógica pura (para las pruebas): estadoAla(alfa, {angulo_critico}), coeficientes(alfa, critico).

import { el, svg, limitar, mezclar, suave, rad, idUnico, interpolarClaves, prefiereMenosMovimiento, crearBucle,
  deslizador, flecha, f1, conTextos } from './comun.js';

export const TEXTOS_ALA = {
  titulo: 'El ala y el aire',
  viento: 'Viento relativo',
  cuerda: 'Línea de la cuerda',
  sustentacion: 'Sustentación',
  resistencia: 'Resistencia',
  angulo: 'Ángulo de ataque',
  mover: 'Cambia el ángulo de ataque',
  zona: 'Aire separado',
  perdida: 'PÉRDIDA (STALL)',
  normal: 'Flujo pegado al ala',
  cerca: 'Cerca del ángulo crítico',
  separado: 'El aire se separa del ala',
  bajaPresion: 'Menor presión arriba',
  altaPresion: 'Mayor presión abajo',
  critico: 'Ángulo crítico',
  etiqueta: 'Corte de un ala con el aire que pasa alrededor',
};

export const ANGULO_CRITICO = 16;

// Coeficientes de sustentación y resistencia de un ala genérica (modelo de enseñanza, no de un avión concreto):
// la sustentación crece en línea recta con el ángulo hasta el crítico; pasado el crítico cae de golpe.
export function coeficientes(alfa, critico = ANGULO_CRITICO) {
  const pendiente = 0.1, alfaCero = -2;
  const clMax = pendiente * (critico - alfaCero);
  let cl;
  if (alfa <= critico) cl = pendiente * (alfa - alfaCero);
  else {
    const pasado = limitar((alfa - critico) / 5, 0, 1);
    cl = clMax * (1 - 0.45 * suave(pasado)) - 0.01 * Math.max(0, alfa - critico - 5);
  }
  let cd = 0.025 + 0.045 * cl * cl;
  if (alfa > critico) cd += 0.035 * (alfa - critico);
  return { cl, cd, clMax };
}

// El estado que se enseña: ¿hay pérdida?, ¿cuánto falta?, ¿cuánto queda de sustentación (0..1 del máximo)?
export function estadoAla(alfa, { angulo_critico = ANGULO_CRITICO } = {}) {
  const critico = Number(angulo_critico);
  const { cl, cd, clMax } = coeficientes(alfa, critico);
  const perdida = alfa > critico;
  const margen = critico - alfa;
  const cerca = !perdida && margen <= 2;
  // Qué parte del extradós (de atrás hacia adelante) tiene el aire separado: 0 sin pérdida, hasta 0,65.
  const separacion = perdida ? 0.12 + 0.53 * suave(limitar((alfa - critico) / 6, 0, 1)) : 0;
  return { alfa, critico, cl, cd, clMax, perdida, cerca, margen, separacion,
    sustentacionRelativa: limitar(cl / clMax, 0, 1.2), estado: perdida ? 'perdida' : cerca ? 'cerca' : 'normal' };
}

// ---------- Flujo de Joukowski (plano del círculo z → perfil ζ = z + 1/z) ----------
const EPS = 0.11, CAMBER = 0.07;
const MU = [-EPS, CAMBER];
const R = Math.hypot(1 + EPS, CAMBER);
const BETA = Math.asin(CAMBER / R);

const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cexp = t => [Math.cos(t), Math.sin(t)];
const joukowski = z => { const inv = cdiv([1, 0], z); return [z[0] + inv[0], z[1] + inv[1]]; };

function campo(alfaFlujo) {
  const gamma = 4 * Math.PI * R * Math.sin(alfaFlujo + BETA);
  const ea = cexp(-alfaFlujo), eb = cexp(alfaFlujo);
  // dw/dz = e^{-iα} − R² e^{iα}/(z−μ)² + iΓ/(2π(z−μ)); la velocidad es su conjugado.
  const velocidad = z => {
    const w = [z[0] - MU[0], z[1] - MU[1]];
    const w2 = cmul(w, w);
    const t2 = cdiv([R * R * eb[0], R * R * eb[1]], w2);
    const t3 = cdiv([0, gamma / (2 * Math.PI)], w);
    const d = [ea[0] - t2[0] + t3[0], ea[1] - t2[1] + t3[1]];
    return [d[0], -d[1]];
  };
  const psi = z => {
    const w = [z[0] - MU[0], z[1] - MU[1]];
    const a = cmul(w, ea);
    const b = cdiv([R * R * eb[0], R * R * eb[1]], w);
    return a[1] + b[1] + (gamma / (2 * Math.PI)) * Math.log(Math.hypot(w[0], w[1]));
  };
  return { velocidad, psi };
}

function contornoPerfil(n = 120) {
  const puntos = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 2 * Math.PI - BETA; // empieza en el borde de salida (z = 1)
    puntos.push(joukowski([MU[0] + R * Math.cos(th), MU[1] + R * Math.sin(th)]));
  }
  return puntos;
}
const PERFIL = contornoPerfil();
const BS = [2, 0];
const BA = PERFIL.reduce((m, p) => (p[0] < m[0] ? p : m), PERFIL[0]);
const INCLINACION_CUERDA = Math.atan2(BS[1] - BA[1], BS[0] - BA[0]);

// Las líneas de corriente para un ángulo de ataque (grados), en coordenadas ζ ya giradas (viento horizontal).
export function lineasDeCorriente(alfaGrados, cantidad = 17) {
  const alfaFlujo = rad(alfaGrados) + INCLINACION_CUERDA;
  const { velocidad, psi } = campo(alfaFlujo);
  const viento = cexp(alfaFlujo), normal = [-viento[1], viento[0]];
  const D = 6, paso = 0.035;
  const psiBorde = psi([1.0001, 0]);
  const giro = cexp(-alfaFlujo);
  const lineas = [];
  for (let k = 0; k < cantidad; k++) {
    const s = mezclar(-2.9, 3.3, k / (cantidad - 1)) + 0.013;
    let z = [MU[0] - D * viento[0] + s * normal[0], MU[1] - D * viento[1] + s * normal[1]];
    const arriba = psi(z) > psiBorde;
    const puntos = [];
    let rapidez = 0, cuentaRapidez = 0;
    for (let i = 0; i < 900; i++) {
      if (i % 3 === 0) {
        const zeta = joukowski(z);
        const p = cmul(zeta, giro);
        puntos.push(p);
        if (Math.abs(p[0]) < 2.2) {
          const v = velocidad(z);
          const dz = [1 - cdiv([1, 0], cmul(z, z))[0], -cdiv([1, 0], cmul(z, z))[1]];
          rapidez += Math.hypot(v[0], v[1]) / Math.max(0.2, Math.hypot(dz[0], dz[1])); cuentaRapidez++;
        }
        if (p[0] > 6) break;
      }
      // Runge-Kutta de 2.º orden con paso fijo a lo largo de la línea.
      const v1 = velocidad(z), n1 = Math.hypot(v1[0], v1[1]) || 1;
      const zm = [z[0] + (v1[0] / n1) * paso * 0.5, z[1] + (v1[1] / n1) * paso * 0.5];
      const v2 = velocidad(zm), n2 = Math.hypot(v2[0], v2[1]) || 1;
      z = [z[0] + (v2[0] / n2) * paso, z[1] + (v2[1] / n2) * paso];
      const dentro = [z[0] - MU[0], z[1] - MU[1]], r = Math.hypot(dentro[0], dentro[1]);
      if (r < R * 1.002) z = [MU[0] + (dentro[0] / r) * R * 1.002, MU[1] + (dentro[1] / r) * R * 1.002];
    }
    lineas.push({ puntos, arriba, psi: psi([MU[0] - D * viento[0] + s * normal[0], MU[1] - D * viento[1] + s * normal[1]]),
      rapidez: cuentaRapidez ? rapidez / cuentaRapidez : 1 });
  }
  const perfil = PERFIL.map(p => cmul(p, giro));
  return { lineas, perfil, ba: cmul(BA, giro), bs: cmul(BS, giro) };
}

// ---------- Dibujo ----------
const ANCHO = 640, ALTO = 400, CX = 316, CY = 232, ESCALA = 72;
const PROF = [46, -30]; // hacia dónde se va la envergadura (la profundidad del 2,5D)
const aPantalla = p => [CX + ESCALA * p[0], CY - ESCALA * p[1]];

export function montarAla(contenedor, opciones = {}) {
  const T = conTextos(TEXTOS_ALA, opciones.textos);
  const critico = Number(opciones.angulo_critico ?? ANGULO_CRITICO);
  const quieto = prefiereMenosMovimiento();
  let modo = opciones.modo === 'explicacion' ? 'explicacion' : 'interactivo';
  let alfa = Number(opciones.alfa ?? 4);
  let resalta = null;
  let pausado = false;

  const raiz = el('div', { class: 'clase-visual clase-ala' }, contenedor);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-lienzo', role: 'img', 'aria-label': T.etiqueta }, raiz);
  const defs = svg('defs', {}, lienzo);
  const idCielo = idUnico('cielo'), idCara = idUnico('cara'), idBaja = idUnico('baja'), idAlta = idUnico('alta'), idLado = idUnico('lado'), idZona = idUnico('zona');
  const gradiente = (id, tipo, attrs, paradas) => {
    const g = svg(tipo, { id, ...attrs }, defs);
    for (const [o, clase] of paradas) svg('stop', { offset: o, class: clase }, g);
  };
  gradiente(idCielo, 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'clase-cielo-arriba'], [1, 'clase-cielo-abajo']]);
  gradiente(idCara, 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'clase-ala-luz'], [0.55, 'clase-ala-medio'], [1, 'clase-ala-sombra']]);
  gradiente(idLado, 'linearGradient', { x1: 0, y1: 1, x2: 1, y2: 0 }, [[0, 'clase-ala-lado-1'], [1, 'clase-ala-lado-2']]);
  gradiente(idZona, 'linearGradient', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, 'clase-zona-1'], [0.6, 'clase-zona-2'], [1, 'clase-zona-3']]);
  gradiente(idBaja, 'radialGradient', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, 'clase-presion-baja'], [1, 'clase-presion-nada']]);
  gradiente(idAlta, 'radialGradient', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, 'clase-presion-alta'], [1, 'clase-presion-nada']]);

  svg('rect', { x: 0, y: 0, width: ANCHO, height: ALTO, fill: `url(#${idCielo})` }, lienzo);
  // Rejilla muy suave de fondo: da la sensación de túnel de viento.
  const rejilla = svg('g', { class: 'clase-rejilla' }, lienzo);
  for (let x = 40; x < ANCHO; x += 40) svg('line', { x1: x, y1: 0, x2: x, y2: ALTO }, rejilla);
  for (let y = 40; y < ALTO; y += 40) svg('line', { x1: 0, y1: y, x2: ANCHO, y2: y }, rejilla);

  const presionBaja = svg('ellipse', { fill: `url(#${idBaja})`, class: 'clase-presion' }, lienzo);
  const presionAlta = svg('ellipse', { fill: `url(#${idAlta})`, class: 'clase-presion' }, lienzo);
  const capasAla = svg('g', { class: 'clase-ala-cuerpo' }, lienzo);
  const grupoLineas = svg('g', { class: 'clase-corriente' }, lienzo);
  const zonaSeparada = svg('path', { class: 'clase-zona-separada', fill: `url(#${idZona})` }, lienzo);
  const grupoRemolinos = svg('g', { class: 'clase-remolinos' }, lienzo);
  const caraAla = svg('path', { fill: `url(#${idCara})`, class: 'clase-ala-cara' }, lienzo);
  const brillo = svg('path', { class: 'clase-ala-brillo' }, lienzo);

  const gCuerda = svg('g', { class: 'clase-cuerda' }, lienzo);
  const lineaCuerda = svg('line', {}, gCuerda);
  const lineaReferencia = svg('line', { class: 'clase-referencia' }, gCuerda);
  const arco = svg('path', { class: 'clase-arco' }, gCuerda);
  const textoAlfa = svg('text', { class: 'clase-texto-alfa', 'text-anchor': 'end' }, gCuerda);
  const textoCuerda = svg('text', { class: 'clase-etiqueta-svg' }, gCuerda, T.cuerda);

  const gViento = svg('g', { class: 'clase-viento' }, lienzo);
  const flechaViento = flecha(gViento, 'clase-flecha clase-flecha-viento', 16);
  flechaViento.mover(22, 76, 150, 76);
  svg('text', { x: 22, y: 60, class: 'clase-etiqueta-svg' }, gViento, T.viento);

  const flechaSust = flecha(lienzo, 'clase-flecha clase-flecha-sust', 18);
  const textoSust = svg('text', { class: 'clase-etiqueta-svg clase-etiqueta-sust' }, lienzo, T.sustentacion);
  const flechaRes = flecha(lienzo, 'clase-flecha clase-flecha-res', 14);
  const textoRes = svg('text', { class: 'clase-etiqueta-svg clase-etiqueta-res' }, lienzo, T.resistencia);

  const cartel = svg('g', { class: 'clase-cartel-perdida', opacity: 0, 'aria-hidden': 'true' }, lienzo);
  svg('rect', { x: ANCHO / 2 - 128, y: 14, width: 256, height: 44, rx: 22 }, cartel);
  svg('text', { x: ANCHO / 2, y: 44, 'text-anchor': 'middle' }, cartel, T.perdida);

  // Panel de abajo (HTML: se lee bien en el teléfono): estado, barra de sustentación y control.
  const panel = el('div', { class: 'clase-panel' }, raiz);
  const fila = el('div', { class: 'clase-lecturas' }, panel);
  const lecturaAlfa = el('div', { class: 'clase-lectura' }, fila);
  el('span', { class: 'clase-lectura-nombre' }, lecturaAlfa, T.angulo);
  const valorAlfa = el('strong', { class: 'clase-lectura-valor' }, lecturaAlfa);
  const lecturaSust = el('div', { class: 'clase-lectura clase-lectura-barra' }, fila);
  el('span', { class: 'clase-lectura-nombre' }, lecturaSust, T.sustentacion);
  const barra = el('div', { class: 'clase-barra', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': T.sustentacion }, lecturaSust);
  const barraRelleno = el('div', { class: 'clase-barra-relleno' }, barra);
  const chip = el('div', { class: 'clase-chip', role: 'status', 'aria-live': 'polite' }, fila);
  const control = deslizador(panel, {
    etiqueta: T.mover, min: -4, max: 24, paso: 0.5, valor: alfa,
    formato: v => `${v.toFixed(1).replace('.', ',')}°`,
    alCambiar: v => { alfa = v; actualizar(); },
  });
  const marcaCritico = el('div', { class: 'clase-marca-critico' }, control.fila);
  marcaCritico.style.left = `${((critico + 4) / 28) * 100}%`;
  el('span', {}, marcaCritico, `${T.critico} ${critico}°`);

  // ---------- Geometría que depende del ángulo (se recalcula solo cuando cambia) ----------
  let lineasDibujadas = [], remolinos = [], ultimoAlfa = null, estado = estadoAla(alfa, { angulo_critico: critico });
  let fase = 0;

  function dibujarGeometria() {
    const geo = lineasDeCorriente(alfa);
    const perfil = geo.perfil.map(aPantalla);
    const ba = aPantalla(geo.ba), bs = aPantalla(geo.bs);
    // Extrusión: copias del perfil hacia el fondo, más oscuras atrás (efecto de profundidad).
    while (capasAla.firstChild) capasAla.removeChild(capasAla.firstChild);
    const capas = 12;
    for (let i = capas; i >= 1; i--) {
      const f = i / capas, esc = 1 - 0.1 * f;
      const pts = perfil.map(([x, y]) => [CX + (x - CX) * esc + PROF[0] * f, CY + (y - CY) * esc + PROF[1] * f]);
      svg('path', { d: poligono(pts), fill: `url(#${idLado})`, class: 'clase-ala-capa' }, capasAla);
    }
    caraAla.setAttribute('d', poligono(perfil));
    // Brillo del extradós: la mitad superior del contorno, un poco hacia adentro.
    const mitad = perfil.slice(Math.floor(perfil.length * 0.08), Math.floor(perfil.length * 0.46));
    brillo.setAttribute('d', 'M' + mitad.map(([x, y]) => `${f1(x)} ${f1(y + 3)}`).join('L'));

    // Cuerda, referencia del viento y el arco del ángulo.
    const dx = bs[0] - ba[0], dy = bs[1] - ba[1], largo = Math.hypot(dx, dy);
    const ux = dx / largo, uy = dy / largo;
    lineaCuerda.setAttribute('x1', f1(ba[0] - ux * 120)); lineaCuerda.setAttribute('y1', f1(ba[1] - uy * 120));
    lineaCuerda.setAttribute('x2', f1(bs[0] + ux * 50)); lineaCuerda.setAttribute('y2', f1(bs[1] + uy * 50));
    lineaReferencia.setAttribute('x1', f1(ba[0] - 130)); lineaReferencia.setAttribute('y1', f1(ba[1]));
    lineaReferencia.setAttribute('x2', f1(ba[0])); lineaReferencia.setAttribute('y2', f1(ba[1]));
    const radio = 96, ang = Math.atan2(uy, ux);
    const px = ba[0] - Math.cos(ang) * radio, py = ba[1] - Math.sin(ang) * radio;
    arco.setAttribute('d', `M${f1(ba[0] - radio)} ${f1(ba[1])}A${radio} ${radio} 0 0 ${alfa >= 0 ? 1 : 0} ${f1(px)} ${f1(py)}`);
    textoAlfa.setAttribute('x', f1(ba[0] - radio - 8)); textoAlfa.setAttribute('y', f1(ba[1] + (alfa >= 0 ? 34 : -14)));
    textoAlfa.textContent = `α ${Math.round(alfa)}°`;
    textoCuerda.setAttribute('x', f1(bs[0] + ux * 12 - 30)); textoCuerda.setAttribute('y', f1(bs[1] + uy * 12 + 32));

    // Zonas de presión: arriba (menor) y abajo (mayor), más fuertes cuanto más sustentación.
    const centro = [(ba[0] + bs[0]) / 2, (ba[1] + bs[1]) / 2];
    presionBaja.setAttribute('cx', f1(centro[0] - 10)); presionBaja.setAttribute('cy', f1(centro[1] - 46));
    presionBaja.setAttribute('rx', 200); presionBaja.setAttribute('ry', 80);
    presionAlta.setAttribute('cx', f1(centro[0])); presionAlta.setAttribute('cy', f1(centro[1] + 42));
    presionAlta.setAttribute('rx', 170); presionAlta.setAttribute('ry', 56);

    // Líneas de corriente.
    while (grupoLineas.firstChild) grupoLineas.removeChild(grupoLineas.firstChild);
    const arriba = geo.lineas.filter(l => l.arriba).sort((a, b) => a.psi - b.psi);
    lineasDibujadas = geo.lineas.map(l => {
      const pts = l.puntos.map(aPantalla).filter(([x, y]) => x > -40 && x < ANCHO + 40 && y > -60 && y < ALTO + 60);
      const rango = l.arriba ? arriba.indexOf(l) : -1;
      const base = svg('path', { class: 'clase-linea-base' }, grupoLineas);
      const guiones = svg('path', { class: `clase-linea-guion${l.arriba ? ' clase-linea-arriba' : ''}` }, grupoLineas);
      return { pts, rango, base, guiones, rapidez: l.rapidez, desplazamiento: Math.random() * 40 };
    });
    // Datos de la separación (en pantalla): desde un punto del extradós hacia atrás, el aire ya no sigue al ala.
    const extrados = perfil.slice(0, Math.floor(perfil.length / 2)); // del borde de salida al de ataque, por arriba
    const sep = estado.separacion;
    let puntoSep = bs;
    if (sep > 0) {
      const objetivoX = bs[0] - (bs[0] - ba[0]) * sep;
      puntoSep = extrados.reduce((m, p) => (Math.abs(p[0] - objetivoX) < Math.abs(m[0] - objetivoX) ? p : m), extrados[0]);
    }
    geometria = { ba, bs, ux, uy, puntoSep, extrados };
    // Remolinos en la zona separada.
    while (grupoRemolinos.firstChild) grupoRemolinos.removeChild(grupoRemolinos.firstChild);
    remolinos = [];
    if (estado.perdida) {
      for (let i = 0; i < 4; i++) {
        const g = svg('g', {}, grupoRemolinos);
        svg('path', { d: espiral(16 + i * 2), class: 'clase-remolino' }, g);
        remolinos.push({ g, avance: i / 4, giro: Math.random() * 360 });
      }
    }
    ultimoAlfa = alfa;
  }
  let geometria = null;

  // Altura del extradós (en pantalla) para una x dada.
  function alturaExtrados(x) {
    const e = geometria.extrados;
    for (let i = 0; i < e.length - 1; i++) {
      const [x1, y1] = e[i], [x2, y2] = e[i + 1];
      if ((x <= x1 && x >= x2) || (x >= x1 && x <= x2)) return y1 + ((y2 - y1) * (x - x1)) / ((x2 - x1) || 1);
    }
    return geometria.bs[1];
  }

  function trazarLineas() {
    const enPerdida = estado.perdida;
    const { puntoSep, bs } = geometria;
    // La capa que se despega: sale del punto de separación casi en la dirección del viento.
    const corte = x => puntoSep[1] - 8 - Math.max(0, x - puntoSep[0]) * 0.1;
    for (const linea of lineasDibujadas) {
      let pts = linea.pts;
      if (enPerdida && linea.rango >= 0 && linea.rango < 8) {
        const hueco = 4 + linea.rango * 17;
        pts = pts.map(([x, y]) => {
          if (x < puntoSep[0] - 40) return [x, y];
          const avance = Math.max(0, x - puntoSep[0]);
          const mezcla = suave(limitar((x - puntoSep[0] + 40) / 60, 0, 1));
          const agitado = Math.sin(x * 0.06 - fase * 5 + linea.rango * 1.3) * Math.min(10, avance * 0.06) * (1 - linea.rango / 9);
          return [x, mezclar(y, Math.min(y, corte(x) - hueco), mezcla) + agitado];
        });
      }
      const d = pts.length ? 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') : '';
      linea.base.setAttribute('d', d);
      linea.guiones.setAttribute('d', d);
    }
    if (!enPerdida) { zonaSeparada.setAttribute('d', ''); return; }
    // Zona de aire separado (remolinos) entre el extradós y la capa que se despegó.
    const fin = bs[0] + 150;
    const arribaZona = [];
    for (let x = puntoSep[0]; x <= fin; x += 12) arribaZona.push([x, corte(x) + Math.sin(x * 0.05 - fase * 4) * 3]);
    const abajoZona = [];
    for (let x = fin; x >= puntoSep[0]; x -= 12) abajoZona.push([x, x > bs[0] ? bs[1] + (x - bs[0]) * 0.12 : alturaExtrados(x)]);
    zonaSeparada.setAttribute('d', poligono([...arribaZona, ...abajoZona]));
    // Remolinos: nacen en el punto de separación y se van hacia atrás girando.
    const largoZona = fin - puntoSep[0];
    for (const r of remolinos) {
      const x = puntoSep[0] + 10 + r.avance * (largoZona - 20);
      const abajo = x > bs[0] ? bs[1] + (x - bs[0]) * 0.12 : alturaExtrados(x);
      const y = (corte(x) + abajo) / 2;
      const esc = limitar((abajo - corte(x)) / 44, 0.35, 1.4);
      r.g.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${f1(r.giro)}) scale(${f1(esc)})`);
      r.g.setAttribute('opacity', f1(Math.sin(Math.PI * r.avance) * 0.95));
    }
  }

  function actualizar() {
    estado = estadoAla(alfa, { angulo_critico: critico });
    if (ultimoAlfa === null || Math.abs(alfa - ultimoAlfa) > 0.01) dibujarGeometria();
    trazarLineas();
    const { ba, bs, ux, uy } = geometria;
    // Centro de presión ≈ un cuarto de la cuerda; sustentación perpendicular al viento, resistencia paralela.
    const cp = [ba[0] + (bs[0] - ba[0]) * 0.3, ba[1] + (bs[1] - ba[1]) * 0.3];
    const largoSust = 30 + 150 * limitar(estado.cl / 1.8, 0, 1.2);
    flechaSust.mover(cp[0], cp[1], cp[0], cp[1] - largoSust);
    textoSust.setAttribute('x', f1(cp[0] + 14)); textoSust.setAttribute('y', f1(cp[1] - largoSust + 18));
    const largoRes = 24 + 520 * limitar(estado.cd, 0, 0.4);
    const inicioRes = [bs[0] + 8, cp[1] + (bs[1] - cp[1]) * 0.4];
    flechaRes.mover(inicioRes[0], inicioRes[1], inicioRes[0] + largoRes, inicioRes[1]);
    textoRes.setAttribute('x', f1(Math.min(ANCHO - 120, inicioRes[0] + 4))); textoRes.setAttribute('y', f1(inicioRes[1] - 14));
    void ux; void uy;
    const fuerza = limitar(estado.cl / 1.8, 0, 1);
    presionBaja.setAttribute('opacity', f1((estado.perdida ? 0.35 : 0.95) * fuerza));
    presionAlta.setAttribute('opacity', f1(0.8 * fuerza));
    cartel.setAttribute('opacity', estado.perdida ? '1' : '0');
    raiz.classList.toggle('clase-en-perdida', estado.perdida);
    raiz.classList.toggle('clase-cerca-perdida', estado.cerca);
    valorAlfa.textContent = `${alfa.toFixed(1).replace('.', ',')}°`;
    const pct = Math.round(limitar(estado.sustentacionRelativa, 0, 1) * 100);
    barraRelleno.style.width = `${pct}%`;
    barra.setAttribute('aria-valuenow', String(pct));
    chip.textContent = estado.perdida ? T.perdida : estado.cerca ? T.cerca : T.normal;
    chip.className = `clase-chip clase-chip-${estado.estado}`;
    for (const [nombre, nodo] of [['cuerda', gCuerda], ['viento', gViento], ['sustentacion', flechaSust.g], ['resistencia', flechaRes.g]]) {
      nodo.classList.toggle('clase-resaltado', resalta === nombre);
    }
    lienzo.setAttribute('aria-label', `${T.etiqueta}. ${T.angulo}: ${Math.round(alfa)}°. ${chip.textContent}.`);
  }

  // Animación: los guiones avanzan (el aire corre), los remolinos giran. Sin movimiento si así lo pide el equipo.
  const bucle = crearBucle(raiz, dt => {
    fase += dt;
    for (const l of lineasDibujadas) {
      l.desplazamiento -= dt * 70 * limitar(l.rapidez, 0.6, 1.8);
      l.guiones.setAttribute('stroke-dashoffset', f1(l.desplazamiento));
    }
    for (const r of remolinos) {
      r.avance += dt * 0.28; if (r.avance > 1) r.avance -= 1;
      r.giro += dt * 220;
    }
    if (estado.perdida) trazarLineas();
  });

  function aplicarModo() {
    raiz.classList.toggle('clase-modo-explicacion', modo === 'explicacion');
    control.fila.hidden = modo === 'explicacion';
  }

  actualizar();
  aplicarModo();
  if (!quieto) bucle.iniciar();

  return {
    raiz,
    tiempo(t) {
      if (!opciones.claves) return;
      const v = interpolarClaves(opciones.claves, t);
      if (typeof v.alfa === 'number') { alfa = v.alfa; control.poner(alfa); }
      resalta = v.resalta ?? null;
      actualizar();
    },
    poner(valores = {}) {
      if (typeof valores.alfa === 'number') { alfa = limitar(valores.alfa, -4, 24); control.poner(alfa); }
      if ('resalta' in valores) resalta = valores.resalta;
      actualizar();
    },
    get estado() { return estado; },
    modo(m) { modo = m === 'explicacion' ? 'explicacion' : 'interactivo'; aplicarModo(); },
    pausar(si) { pausado = Boolean(si); if (pausado || quieto) bucle.detener(); else bucle.iniciar(); },
    destruir() { bucle.destruir(); raiz.remove(); },
  };
}

function poligono(pts) {
  return 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + 'Z';
}

function espiral(r) {
  let d = '';
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI * 3.2, rr = r * (0.15 + 0.85 * (i / 26));
    d += `${i ? 'L' : 'M'}${f1(Math.cos(a) * rr)} ${f1(Math.sin(a) * rr)}`;
  }
  return d;
}
