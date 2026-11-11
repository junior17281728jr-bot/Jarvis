// El motor de pistón de cuatro tiempos por dentro: cilindro, pistón, biela, cigüeñal, válvulas y bujía.
// Admisión → compresión → explosión → escape (un ciclo = dos vueltas del cigüeñal = 720°). Se puede tocar cada
// pieza para ver su nombre, ir tiempo por tiempo y ver el encendido en cámara lenta.
//
// API: montarMotor(contenedor, opciones) → { tiempo(t), poner({theta, resalta}), modo(m), pausar(b), destruir() }
//   opciones: { modo: 'interactivo' | 'explicacion', rpm_demo: 0.35 (ciclos por segundo), ciclos: 1,
//               claves: [{t, theta, resalta}], textos: {…} }
// Lógica pura (para las pruebas): estadoMotor(theta), TIEMPOS, siguienteTiempo(theta), posicionPiston(theta).

import { el, svg, limitar, rad, idUnico, interpolarClaves, prefiereMenosMovimiento, crearBucle, deslizador,
  boton, tocable, f1, conTextos } from './comun.js';

export const TIEMPOS = ['admision', 'compresion', 'explosion', 'escape'];

export const TEXTOS_MOTOR = {
  etiqueta: 'Corte de un motor de pistón de cuatro tiempos',
  admision: 'Admisión', compresion: 'Compresión', explosion: 'Explosión', escape: 'Escape',
  d_admision: 'El pistón baja y la válvula de admisión abierta deja entrar la mezcla de aire y combustible.',
  d_compresion: 'Las dos válvulas cierran y el pistón sube apretando la mezcla en un espacio pequeño.',
  d_explosion: 'La bujía da la chispa: la mezcla se quema, la presión sube y empuja el pistón hacia abajo.',
  d_escape: 'El pistón sube otra vez y saca los gases quemados por la válvula de escape.',
  reproducir: 'Reproducir', pausar: 'Pausar', siguiente: 'Siguiente tiempo', encendido: 'Ver el encendido',
  velocidad: 'Velocidad', lenta: 'Lenta', rapida: 'Rápida', toca: 'Toca una pieza del motor para ver su nombre.',
  vuelta: 'Cigüeñal',
  p_cilindro: 'Cilindro', i_cilindro: 'El tubo donde sube y baja el pistón.',
  p_piston: 'Pistón', i_piston: 'Recibe el empuje de los gases y lo pasa a la biela.',
  p_biela: 'Biela', i_biela: 'Une el pistón con el cigüeñal.',
  p_ciguenal: 'Cigüeñal', i_ciguenal: 'Convierte el sube y baja del pistón en giro (el que mueve la hélice).',
  p_admision: 'Válvula de admisión', i_admision: 'Se abre para dejar entrar la mezcla.',
  p_escape: 'Válvula de escape', i_escape: 'Se abre para dejar salir los gases quemados.',
  p_bujia: 'Bujía', i_bujia: 'Da la chispa que enciende la mezcla.',
  p_culata: 'Culata', i_culata: 'La tapa del cilindro: allí van las válvulas y la bujía.',
  e1: '1. La mezcla está apretada arriba del pistón.',
  e2: '2. La bujía salta la chispa.',
  e3: '3. La llama se extiende y la presión sube de golpe.',
  e4: '4. La presión empuja el pistón hacia abajo: el cigüeñal gira.',
};

// Geometría de enseñanza (en unidades del dibujo).
const RADIO_MANIVELA = 70, LARGO_BIELA = 170;

const norm720 = th => ((th % 720) + 720) % 720;

// Distancia del eje del cigüeñal al perno del pistón (mecanismo biela-manivela). θ = 0 es el punto muerto superior.
export function posicionPiston(theta, r = RADIO_MANIVELA, l = LARGO_BIELA) {
  const a = rad(theta);
  return r * Math.cos(a) + Math.sqrt(l * l - (r * Math.sin(a)) ** 2);
}

// Todo lo que se dibuja sale de aquí: el tiempo del ciclo, la apertura de cada válvula (0..1), la chispa…
export function estadoMotor(theta) {
  const th = norm720(theta);
  const indice = Math.min(3, Math.floor(th / 180));
  const progreso = (th - indice * 180) / 180;
  const tiempo = TIEMPOS[indice];
  const levante = p => Math.sin(Math.PI * p) ** 0.7;
  const valvulaAdmision = tiempo === 'admision' ? levante(progreso) : 0;
  const valvulaEscape = tiempo === 'escape' ? levante(progreso) : 0;
  const chispa = th >= 350 && th <= 368;
  const llama = th >= 352 && th < 440 ? limitar((th - 352) / 88, 0, 1) : 0;
  const arriba = posicionPiston(0), abajo = posicionPiston(180);
  const bajada = (arriba - posicionPiston(th)) / (arriba - abajo); // 0 arriba (PMS), 1 abajo (PMI)
  return { theta: th, indice, tiempo, progreso, valvulaAdmision, valvulaEscape, chispa, llama, bajada,
    pistonBaja: tiempo === 'admision' || tiempo === 'explosion' };
}

// El ángulo donde empieza el tiempo que sigue (para «Siguiente tiempo»).
export function siguienteTiempo(theta) {
  const th = norm720(theta);
  return (Math.floor(th / 180) + 1) * 180;
}

// ---------- Dibujo ----------
const ANCHO = 520, ALTO = 580, EJE_X = 260, EJE_Y = 452, CAMARA = 140;
const PIN_A_CABEZA = 34, ALTO_PISTON = 84, MEDIO_ANCHO = 98;

export function montarMotor(contenedor, opciones = {}) {
  const T = conTextos(TEXTOS_MOTOR, opciones.textos);
  const quieto = prefiereMenosMovimiento();
  let modo = opciones.modo === 'explicacion' ? 'explicacion' : 'interactivo';
  let theta = Number(opciones.theta ?? 40);
  let velocidad = Number(opciones.rpm_demo ?? 0.35);
  let andando = !quieto && modo === 'interactivo';
  let resalta = null, pieza = null;
  let destino = null, demoEncendido = null;

  const raiz = el('div', { class: 'clase-visual clase-motor' }, contenedor);
  const escena = el('div', { class: 'clase-motor-escena' }, raiz);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-lienzo', role: 'group', 'aria-label': T.etiqueta }, escena);
  const defs = svg('defs', {}, lienzo);
  const grad = (tipo, attrs, paradas) => {
    const id = idUnico('m');
    const g = svg(tipo, { id, ...attrs }, defs);
    for (const [o, clase] of paradas) svg('stop', { offset: o, class: clase }, g);
    return `url(#${id})`;
  };
  const fondo = grad('linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'clase-taller-1'], [1, 'clase-taller-2']]);
  const metalV = grad('linearGradient', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, 'clase-metal-3'], [0.35, 'clase-metal-1'], [0.7, 'clase-metal-2'], [1, 'clase-metal-3']]);
  const metalH = grad('linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'clase-metal-1'], [1, 'clase-metal-3']]);
  const bloque = grad('linearGradient', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, 'clase-bloque-2'], [0.5, 'clase-bloque-1'], [1, 'clase-bloque-2']]);
  const fuego = grad('radialGradient', { cx: 0.5, cy: 0.3, r: 0.7 }, [[0, 'clase-fuego-1'], [0.45, 'clase-fuego-2'], [1, 'clase-fuego-3']]);

  svg('rect', { width: ANCHO, height: ALTO, fill: fondo }, lienzo);

  // Cárter (abajo) y bloque del cilindro.
  svg('path', { d: `M110 ${EJE_Y - 70}Q110 ${EJE_Y + 118} ${EJE_X} ${EJE_Y + 118}Q410 ${EJE_Y + 118} 410 ${EJE_Y - 70}Z`, class: 'clase-carter' }, lienzo);
  const gCilindro = svg('g', { class: 'clase-pieza' }, lienzo);
  svg('rect', { x: EJE_X - MEDIO_ANCHO - 34, y: CAMARA - 10, width: 34, height: 270, fill: bloque, class: 'clase-pared' }, gCilindro);
  svg('rect', { x: EJE_X + MEDIO_ANCHO, y: CAMARA - 10, width: 34, height: 270, fill: bloque, class: 'clase-pared' }, gCilindro);
  for (let y = CAMARA + 10; y < CAMARA + 250; y += 22) { // aletas de enfriamiento (motor enfriado por aire)
    svg('rect', { x: EJE_X - MEDIO_ANCHO - 62, y, width: 30, height: 9, rx: 3, class: 'clase-aleta' }, gCilindro);
    svg('rect', { x: EJE_X + MEDIO_ANCHO + 32, y, width: 30, height: 9, rx: 3, class: 'clase-aleta' }, gCilindro);
  }
  svg('rect', { x: EJE_X - MEDIO_ANCHO, y: CAMARA, width: MEDIO_ANCHO * 2, height: 262, class: 'clase-hueco' }, gCilindro);

  // Gases dentro del cilindro (cambian de color con el tiempo del ciclo).
  const gas = svg('rect', { x: EJE_X - MEDIO_ANCHO, y: CAMARA, width: MEDIO_ANCHO * 2, class: 'clase-gas' }, lienzo);
  const llama = svg('circle', { cx: EJE_X, cy: CAMARA + 4, r: 0, fill: fuego, class: 'clase-llama' }, lienzo);
  const gParticulas = svg('g', { class: 'clase-particulas' }, lienzo);
  const particulas = [];
  for (let i = 0; i < 26; i++) {
    const p = { fx: (0.5 + i * 0.7548776662) % 1, fy: (0.5 + i * 0.5698402910) % 1, fase: i * 0.7, nodo: svg('circle', { r: 4.2 }, gParticulas) };
    particulas.push(p);
  }

  // Culata con los conductos de admisión (izquierda) y escape (derecha).
  const gCulata = svg('g', { class: 'clase-pieza' }, lienzo);
  svg('path', { d: `M${EJE_X - MEDIO_ANCHO - 70} ${CAMARA}L${EJE_X - MEDIO_ANCHO - 70} 50Q${EJE_X - MEDIO_ANCHO - 70} 34 ${EJE_X - MEDIO_ANCHO - 54} 34L${EJE_X + MEDIO_ANCHO + 54} 34Q${EJE_X + MEDIO_ANCHO + 70} 34 ${EJE_X + MEDIO_ANCHO + 70} 50L${EJE_X + MEDIO_ANCHO + 70} ${CAMARA}Z`, fill: bloque, class: 'clase-culata' }, gCulata);
  const conductoAdm = svg('path', { d: `M${EJE_X - MEDIO_ANCHO - 72} 70L${EJE_X - 92} 70Q${EJE_X - 64} 72 ${EJE_X - 58} ${CAMARA}L${EJE_X - 104} ${CAMARA}Q${EJE_X - 108} 106 ${EJE_X - 128} 104L${EJE_X - MEDIO_ANCHO - 72} 104Z`, class: 'clase-conducto clase-conducto-adm' }, lienzo);
  const conductoEsc = svg('path', { d: `M${EJE_X + MEDIO_ANCHO + 72} 70L${EJE_X + 92} 70Q${EJE_X + 64} 72 ${EJE_X + 58} ${CAMARA}L${EJE_X + 104} ${CAMARA}Q${EJE_X + 108} 106 ${EJE_X + 128} 104L${EJE_X + MEDIO_ANCHO + 72} 104Z`, class: 'clase-conducto clase-conducto-esc' }, lienzo);
  svg('text', { x: 10, y: 94, class: 'clase-etiqueta-motor clase-entrada' }, lienzo, '→');
  svg('text', { x: ANCHO - 30, y: 94, class: 'clase-etiqueta-motor clase-salida' }, lienzo, '→');

  // Válvulas (vástago + cabeza) con su resorte.
  const valvula = (x, clase) => {
    const g = svg('g', { class: `clase-pieza ${clase}` }, lienzo);
    const mueve = svg('g', {}, g);
    svg('rect', { x: x - 5, y: 4, width: 10, height: CAMARA - 12, rx: 3, fill: metalV }, mueve);
    svg('path', { d: `M${x - 26} ${CAMARA - 4}L${x + 26} ${CAMARA - 4}L${x + 9} ${CAMARA - 16}L${x - 9} ${CAMARA - 16}Z`, fill: metalH, class: 'clase-valvula-cabeza' }, mueve);
    const resorte = svg('path', { class: 'clase-resorte' }, g);
    svg('rect', { x: x - 36, y: CAMARA - 52, width: 72, height: 70, class: 'clase-zona-toque' }, g);
    return { g, mueve, resorte, x };
  };
  const vAdm = valvula(EJE_X - 81, 'clase-valvula-adm');
  const vEsc = valvula(EJE_X + 81, 'clase-valvula-esc');

  // Bujía en el centro.
  const gBujia = svg('g', { class: 'clase-pieza' }, lienzo);
  svg('rect', { x: EJE_X - 9, y: 4, width: 18, height: 34, rx: 5, class: 'clase-bujia-aislante' }, gBujia);
  svg('rect', { x: EJE_X - 15, y: 38, width: 30, height: 18, rx: 2, fill: metalH }, gBujia);
  svg('rect', { x: EJE_X - 8, y: 56, width: 16, height: CAMARA - 58, fill: metalV }, gBujia);
  svg('rect', { x: EJE_X - 2, y: CAMARA - 2, width: 4, height: 8, class: 'clase-electrodo' }, gBujia);
  svg('rect', { x: EJE_X - 34, y: 0, width: 68, height: CAMARA + 6, class: 'clase-zona-toque' }, gBujia);
  const chispa = svg('path', { d: estrella(EJE_X, CAMARA + 10, 22, 8), class: 'clase-chispa', opacity: 0 }, lienzo);

  // Pistón, biela y cigüeñal.
  const gBiela = svg('g', { class: 'clase-pieza' }, lienzo);
  const biela = svg('path', { fill: metalV, class: 'clase-biela' }, gBiela);
  const gCiguenal = svg('g', { class: 'clase-pieza' }, lienzo);
  const gira = svg('g', {}, gCiguenal);
  svg('circle', { cx: EJE_X, cy: EJE_Y, r: 92, class: 'clase-ciguenal-disco' }, gira);
  svg('path', { d: `M${EJE_X - 80} ${EJE_Y + 30}A86 86 0 0 0 ${EJE_X + 80} ${EJE_Y + 30}L${EJE_X + 30} ${EJE_Y - 10}L${EJE_X - 30} ${EJE_Y - 10}Z`, class: 'clase-contrapeso' }, gira);
  svg('rect', { x: EJE_X - 22, y: EJE_Y - RADIO_MANIVELA - 22, width: 44, height: RADIO_MANIVELA + 44, rx: 22, fill: metalH }, gira);
  svg('circle', { cx: EJE_X, cy: EJE_Y, r: 20, class: 'clase-eje' }, gira);
  svg('circle', { cx: EJE_X, cy: EJE_Y - RADIO_MANIVELA, r: 13, class: 'clase-muñon' }, gira);
  const marcaGiro = svg('circle', { cx: EJE_X + 74, cy: EJE_Y, r: 5, class: 'clase-marca-giro' }, gira);
  void marcaGiro;
  const gPiston = svg('g', { class: 'clase-pieza' }, lienzo);
  const piston = svg('g', {}, gPiston);
  svg('rect', { x: EJE_X - MEDIO_ANCHO + 3, y: 0, width: MEDIO_ANCHO * 2 - 6, height: ALTO_PISTON, rx: 6, fill: metalV }, piston);
  for (const y of [10, 20, 30]) svg('rect', { x: EJE_X - MEDIO_ANCHO + 3, y, width: MEDIO_ANCHO * 2 - 6, height: 3.5, class: 'clase-aro' }, piston);
  svg('circle', { cx: EJE_X, cy: PIN_A_CABEZA + 12, r: 11, class: 'clase-eje' }, piston);
  const flechaPiston = svg('path', { class: 'clase-flecha-piston' }, lienzo);

  // Rótulo grande del tiempo, arriba a la izquierda.
  const rotulo = svg('g', { class: 'clase-rotulo-tiempo' }, lienzo);
  const rotuloFondo = svg('rect', { x: 10, y: ALTO - 64, rx: 14, height: 50, width: 210 }, rotulo);
  const rotuloNumero = svg('text', { x: 34, y: ALTO - 30, class: 'clase-rotulo-numero', 'text-anchor': 'middle' }, rotulo);
  const rotuloTexto = svg('text', { x: 58, y: ALTO - 31, class: 'clase-rotulo-texto' }, rotulo);

  // Piezas que se tocan.
  const piezas = {
    cilindro: gCilindro, culata: gCulata, admision: vAdm.g, escape: vEsc.g, bujia: gBujia,
    piston: gPiston, biela: gBiela, ciguenal: gCiguenal,
  };
  for (const [nombre, nodo] of Object.entries(piezas)) {
    tocable(nodo, T[`p_${nombre}`], () => elegirPieza(nombre));
  }

  // ---------- Panel ----------
  const panel = el('div', { class: 'clase-panel clase-motor-panel' }, escena);
  const tiras = el('ol', { class: 'clase-tiempos', 'aria-label': 'Tiempos del motor' }, panel);
  const chips = TIEMPOS.map((t, i) => {
    const li = el('li', { class: 'clase-tiempo' }, tiras);
    el('span', { class: 'clase-tiempo-num' }, li, String(i + 1));
    el('span', { class: 'clase-tiempo-nombre' }, li, T[t]);
    return li;
  });
  const descripcion = el('p', { class: 'clase-motor-descripcion', 'aria-live': 'polite' }, panel);
  const info = el('div', { class: 'clase-info-pieza', role: 'status', 'aria-live': 'polite' }, panel);
  const infoNombre = el('strong', {}, info, '');
  const infoTexto = el('span', {}, info, T.toca);
  const controles = el('div', { class: 'clase-botones clase-motor-controles' }, panel);
  const bReproducir = boton(controles, '', () => { demoEncendido = null; destino = null; andando = !andando; pintarBotones(); }, { class: 'clase-boton clase-boton-principal' });
  boton(controles, T.siguiente, () => { demoEncendido = null; destino = siguienteTiempo(theta) + 90; andando = false; pintarBotones(); });
  boton(controles, T.encendido, () => verEncendido());
  const control = deslizador(panel, { etiqueta: T.velocidad, min: 0.1, max: 1.5, paso: 0.05, valor: velocidad,
    formato: v => (v < 0.4 ? T.lenta : v > 0.9 ? T.rapida : `${Math.round(v * 120)} rpm`), alCambiar: v => { velocidad = v; } });

  function pintarBotones() {
    bReproducir.textContent = andando ? T.pausar : T.reproducir;
    bReproducir.setAttribute('aria-pressed', String(andando));
  }

  function elegirPieza(nombre) {
    pieza = pieza === nombre ? null : nombre;
    infoNombre.textContent = pieza ? T[`p_${pieza}`] : '';
    infoTexto.textContent = pieza ? T[`i_${pieza}`] : T.toca;
    dibujar();
  }

  function verEncendido() {
    andando = false;
    pintarBotones();
    demoEncendido = { inicio: 300, fin: 470, t: 0 };
    theta = 300;
    if (quieto) { theta = 362; infoNombre.textContent = T.p_bujia; infoTexto.textContent = `${T.e2} ${T.e3}`; dibujar(); demoEncendido = null; }
  }

  function dibujar() {
    const e = estadoMotor(theta);
    const pinY = EJE_Y - posicionPiston(theta);
    const arriba = pinY - PIN_A_CABEZA - 12;
    piston.setAttribute('transform', `translate(0 ${f1(arriba)})`);
    // Cigüeñal: gira en el sentido de las agujas del reloj (θ = 0 con el muñón arriba).
    gira.setAttribute('transform', `rotate(${f1(theta % 360)} ${EJE_X} ${EJE_Y})`);
    const a = rad(theta);
    const muX = EJE_X + RADIO_MANIVELA * Math.sin(a), muY = EJE_Y - RADIO_MANIVELA * Math.cos(a);
    const dx = EJE_X - muX, dy = pinY - muY, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
    biela.setAttribute('d', `M${f1(muX + nx * 17)} ${f1(muY + ny * 17)}L${f1(EJE_X + nx * 10)} ${f1(pinY + ny * 10)}L${f1(EJE_X - nx * 10)} ${f1(pinY - ny * 10)}L${f1(muX - nx * 17)} ${f1(muY - ny * 17)}Z`);
    // Válvulas: bajan para abrir (hasta 22 unidades).
    vAdm.mueve.setAttribute('transform', `translate(0 ${f1(22 * e.valvulaAdmision)})`);
    vEsc.mueve.setAttribute('transform', `translate(0 ${f1(22 * e.valvulaEscape)})`);
    vAdm.resorte.setAttribute('d', resorte(vAdm.x, 50 + 22 * e.valvulaAdmision));
    vEsc.resorte.setAttribute('d', resorte(vEsc.x, 50 + 22 * e.valvulaEscape));
    conductoAdm.classList.toggle('clase-conducto-abierto', e.valvulaAdmision > 0.05);
    conductoEsc.classList.toggle('clase-conducto-abierto', e.valvulaEscape > 0.05);
    // Gas: alto = de la culata a la cabeza del pistón; color según el tiempo.
    const alto = Math.max(0, arriba - CAMARA);
    gas.setAttribute('height', f1(alto));
    gas.setAttribute('class', `clase-gas clase-gas-${e.tiempo}`);
    const densidad = e.tiempo === 'compresion' ? 0.35 + 0.5 * e.progreso : e.tiempo === 'admision' ? 0.25 + 0.15 * e.progreso : 0.4;
    gas.setAttribute('opacity', f1(e.tiempo === 'escape' ? 0.55 * (1 - e.progreso * 0.6) : densidad));
    llama.setAttribute('r', f1(e.llama > 0 ? 20 + 210 * Math.sqrt(e.llama) : 0));
    llama.setAttribute('opacity', f1(e.llama > 0 ? (1 - e.llama) * 0.95 : 0));
    chispa.setAttribute('opacity', e.chispa ? '1' : '0');
    // Partículas de mezcla: entran, se aprietan, se queman y salen.
    const visibles = e.tiempo === 'admision' ? Math.round(particulas.length * e.progreso) : particulas.length;
    particulas.forEach((p, i) => {
      let x = EJE_X - MEDIO_ANCHO + 12 + p.fx * (MEDIO_ANCHO * 2 - 24);
      let y = CAMARA + 8 + p.fy * Math.max(4, alto - 16);
      let clase = 'clase-p-mezcla', opacidad = i < visibles ? 1 : 0;
      if (e.tiempo === 'explosion') clase = 'clase-p-fuego';
      if (e.tiempo === 'escape') {
        clase = 'clase-p-humo';
        const salida = limitar(e.progreso * 1.6 - p.fx * 0.6, 0, 1);
        x = x + (EJE_X + 81 - x) * salida + salida * salida * 140;
        y = y + (CAMARA - 30 - y) * salida;
        opacidad = 1 - limitar((salida - 0.7) / 0.3, 0, 1);
      }
      if (e.tiempo === 'admision' && i >= visibles - 3 && i < visibles) { // las últimas vienen por el conducto
        const k = (particulas.length * e.progreso) - i;
        const entra = limitar(1 - k, 0, 1);
        x = x + (EJE_X - 81 - x) * entra - entra * entra * 120;
        y = y + (CAMARA - 30 - y) * entra;
      }
      p.nodo.setAttribute('cx', f1(x)); p.nodo.setAttribute('cy', f1(y));
      p.nodo.setAttribute('class', clase); p.nodo.setAttribute('opacity', f1(opacidad));
    });
    // Flecha del movimiento del pistón.
    const yf = arriba + ALTO_PISTON / 2;
    const xf = EJE_X + MEDIO_ANCHO + 92;
    flechaPiston.setAttribute('d', e.pistonBaja
      ? `M${xf} ${f1(yf - 22)}L${xf} ${f1(yf + 12)}M${xf - 10} ${f1(yf + 2)}L${xf} ${f1(yf + 14)}L${xf + 10} ${f1(yf + 2)}`
      : `M${xf} ${f1(yf + 22)}L${xf} ${f1(yf - 12)}M${xf - 10} ${f1(yf - 2)}L${xf} ${f1(yf - 14)}L${xf + 10} ${f1(yf - 2)}`);
    // Rótulo y panel.
    rotuloNumero.textContent = String(e.indice + 1);
    rotuloTexto.textContent = T[e.tiempo].toUpperCase();
    rotulo.setAttribute('class', `clase-rotulo-tiempo clase-rotulo-${e.tiempo}`);
    rotuloFondo.setAttribute('width', String(70 + T[e.tiempo].length * 15));
    chips.forEach((c, i) => {
      c.classList.toggle('clase-tiempo-activo', i === e.indice);
      if (i === e.indice) c.setAttribute('aria-current', 'step'); else c.removeAttribute('aria-current');
    });
    if (descripcion.dataset.tiempo !== e.tiempo) { descripcion.textContent = T[`d_${e.tiempo}`]; descripcion.dataset.tiempo = e.tiempo; }
    const marcada = pieza || resalta;
    for (const [nombre, nodo] of Object.entries(piezas)) nodo.classList.toggle('clase-pieza-activa', nombre === marcada);
    if (demoEncendido) {
      const paso = theta < 350 ? 'e1' : theta < 370 ? 'e2' : theta < 400 ? 'e3' : 'e4';
      infoNombre.textContent = T.encendido;
      infoTexto.textContent = T[paso];
    }
    lienzo.setAttribute('aria-label', `${T.etiqueta}. ${e.indice + 1}: ${T[e.tiempo]}.`);
  }

  const bucle = crearBucle(raiz, dt => {
    if (modo === 'explicacion' && opciones.claves) return;
    if (demoEncendido) {
      theta += dt * 720 * 0.09;
      if (theta >= demoEncendido.fin) { theta = demoEncendido.fin; demoEncendido.fin = null; }
      dibujar();
      if (demoEncendido.fin === null) demoEncendido = null;
      return;
    }
    if (destino !== null) {
      theta = Math.min(destino, theta + dt * 720 * 0.6);
      if (theta >= destino) destino = null;
      dibujar();
      return;
    }
    if (andando) { theta += dt * 720 * velocidad; if (theta > 7200) theta -= 7200; dibujar(); }
  });

  function aplicarModo() {
    raiz.classList.toggle('clase-modo-explicacion', modo === 'explicacion');
    controles.hidden = modo === 'explicacion';
    control.fila.hidden = modo === 'explicacion';
    if (modo === 'explicacion' && !quieto && !opciones.claves) andando = true;
    pintarBotones();
  }

  aplicarModo();
  dibujar();
  bucle.iniciar();

  return {
    raiz,
    tiempo(t) {
      if (opciones.claves) {
        const v = interpolarClaves(opciones.claves, t);
        if (typeof v.theta === 'number') theta = v.theta;
        resalta = v.resalta ?? null;
      } else if (opciones.ciclos) theta = t * 720 * opciones.ciclos;
      dibujar();
    },
    poner(valores = {}) {
      if (typeof valores.theta === 'number') { theta = valores.theta; andando = false; demoEncendido = null; destino = null; pintarBotones(); }
      if ('resalta' in valores) resalta = valores.resalta;
      if ('pieza' in valores) { pieza = null; if (valores.pieza) elegirPieza(valores.pieza); }
      dibujar();
    },
    verEncendido,
    get estado() { return estadoMotor(theta); },
    modo(m) { modo = m === 'explicacion' ? 'explicacion' : 'interactivo'; aplicarModo(); },
    pausar(si) { if (si) { andando = false; bucle.detener(); } else { bucle.iniciar(); } pintarBotones(); },
    destruir() { bucle.destruir(); raiz.remove(); },
  };
}

function estrella(cx, cy, r1, r2) {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? r2 : r1, a = (i / 16) * Math.PI * 2;
    d += `${i ? 'L' : 'M'}${f1(cx + Math.cos(a) * r)} ${f1(cy + Math.sin(a) * r)}`;
  }
  return d + 'Z';
}

function resorte(x, abajo) {
  let d = `M${x - 14} 24`;
  const vueltas = 6, alto = abajo - 24;
  for (let i = 1; i <= vueltas; i++) d += `L${x + (i % 2 ? 14 : -14)} ${f1(24 + (alto * i) / vueltas)}`;
  return d;
}
