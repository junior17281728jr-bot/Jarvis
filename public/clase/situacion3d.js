// 0.14.92: el dibujo «situacion-3d»: una situación con una decisión. 1) El avión vuela y se cuenta la situación.
// 2) La escena se detiene y aparecen 2 a 4 opciones grandes. 3) Se ve qué pasaría (desde afuera o desde la cabina: el
// botón «Vista»), con un rótulo grande en el momento clave («Aquí entraste sin contacto») donde la escena se detiene un
// momento. 4) Al final, «Por qué», la regla en negrita y su fuente de la FAA, «Intentar otra opción» y «Siguiente».
// La primera elección se avisa con el evento «clase-decision» (burbujea): la app la guarda como el «¿Lo entendiste?» de
// la tarjeta (acierto = 👍, error = 👎), así cuenta para «Dónde más cuesta». parametros: { situacion, titulo? }.
import { el, prefiereMenosMovimiento } from './comun.js';
import { montarEscena3d } from './escena3d.js';
import { traductor3d, partesNegrita, sinMarcas } from './e3d-base.js';
import { SITUACIONES, TEXTOS_SITUACIONES } from './e3d-situaciones.js';
import { sacudir, pintarDestello, pintarAlarma, pintarHielo } from './e3d-efectos.js';
import { limitar, linea } from './motor3d.js';
import { montarMinimapa } from './e3d-minimapa.js';

export const PAUSA_CLAVE = 2.2; // segundos que la escena se queda quieta en el momento clave
const COLOR_NIVEL = { correcto: [70, 200, 110], aceptable: [255, 190, 60], mal: [240, 80, 70] };

// La situación convertida en una escena de escena3d.js: el paso 0 es la introducción; los demás, las opciones.
export function escenaDeSituacion(sit, Ts, ganchos = {}) {
  const pasos = [
    { id: 'intro', camara: sit.intro.camara, vuelo: { ...sit.intro.vuelo, unaVez: true }, tQuieto: sit.intro.vuelo.seg, nivel: null },
    ...sit.opciones.map(o => ({ id: o.id, camara: o.camara, vuelo: { ...o.vuelo, unaVez: true, maxAlabeo: o.maxAlabeo ?? 40 }, clave: o.clave, nivel: o.nivel, malDentro: o.malDentro, tQuieto: o.vuelo.seg + PAUSA_CLAVE + 0.4 })),
  ];
  const TEXTOS = { titulo: Ts('titulo'), recuerda: sinMarcas(Ts('recuerda')), 'intro.titulo': Ts('titulo'), 'intro.texto': sinMarcas(Ts('intro')), 'intro.mas': '' };
  for (const o of sit.opciones) Object.assign(TEXTOS, { [`${o.id}.titulo`]: Ts(`${o.id}.boton`), [`${o.id}.texto`]: sinMarcas(Ts(`${o.id}.resultado`)), [`${o.id}.mas`]: '' });
  const vy = sit.exagerar ?? 1;
  // Los rótulos del lienzo: «l.pared» o «pared» → sit.<id>.l.pared.
  const rotulo = (k, v) => Ts(k.startsWith('l.') ? k : `l.${k}`, v);
  return {
    id: `sit-${sit.id}`, TEXTOS, PASOS: pasos,
    unidades: sit.unidades, exagerar: vy, escalaAvion: sit.escalaAvion, texturaEscala: sit.texturaEscala, sombra: sit.sombra,
    niebla1: sit.niebla1, niebla3: sit.niebla3, ojo1: sit.unidades.ftH === 1000 ? 0.004 : 0.0015, cerca1: 0.0008,
    construir: paleta => sit.construir(paleta),
    armarPaso: () => ({ prims: [], etiquetas: sit.rotulos ? sit.rotulos(rotulo) : [] }),
    // El reloj: en el momento clave la escena se queda quieta PAUSA_CLAVE segundos.
    tiempo(paso, t) { const c = paso.clave; return c == null || t < c ? t : t < c + PAUSA_CLAVE ? c : t - PAUSA_CLAVE; },
    ajustarAvion(paso, avion, t) {
      const e = sit.efectos ? sit.efectos(paso.id, t, { ...avion, pos: [avion.pos[0], avion.pos[1] / vy, avion.pos[2]] }) : null;
      const girado = e?.alabeoExtra || e?.cabeceoExtra ? { ...avion, alabeo: avion.alabeo + (e.alabeoExtra ?? 0), cabeceo: avion.cabeceo + (e.cabeceoExtra ?? 0) } : avion;
      return e?.f ? sacudir(girado, t, e.f, 0.04 * vy) : girado;
    },
    cuadro({ paso, t, real, avion, mezcla }) {
      const [x, y, z] = avion.pos;
      const din = sit.dinamico ? sit.dinamico(t, avion, rotulo, real, paso.id) : { prims: [], etiquetas: [] };
      const ef = sit.efectos ? sit.efectos(paso.id, t, avion) : {};
      const est = sit.estado((k, v) => Ts(k, v), x, y, z, t, paso.id, avion);
      const etiquetas = [...(din.etiquetas ?? [])];
      // La línea al suelo (en el espacio aéreo): se ve a qué altura va el avión respecto de la pared.
      const prims = [...(din.prims ?? [])];
      if (sit.lineaSuelo) prims.push(linea([[x, y, z], [x, 0, z]], [255, 255, 255], { a: 0.7, w: 1.2, guion: [3, 3] }));
      // El rótulo del momento clave: sobre el avión (afuera) o delante de la nariz (en la cabina, donde se ve).
      const h = (avion.rumbo * Math.PI) / 180, adelante = sit.unidades.ftH === 1000 ? 0.5 : 1.2, k1 = mezcla > 0.5 ? 1 : 0;
      const pc = [x + Math.sin(h) * adelante * k1, y + 0.02 + (k1 ? -0.05 : 0), z + Math.cos(h) * adelante * k1];
      if (paso.clave != null && t >= paso.clave) etiquetas.push({ p: pc, texto: Ts(`${paso.id}.clave`), prioridad: 40, tam: 1.35, resaltada: true, color: COLOR_NIVEL[paso.nivel], cabina: true });
      ganchos.alCuadro?.(paso.id, real, t, avion);
      // Dentro de una nube: todo gris (sin horizonte). En tercera persona, escena3d corre la niebla por la distancia.
      const niebla = ef.dentro ? { color: [196, 200, 208], inicio: 0, fin: sit.unidades.ftH === 1000 ? 0.35 : 0.25 } : ef.oscuro ? { color: [70, 76, 90], inicio: 0.5, fin: 6 } : null;
      const hielo = sit.id === 'frente-frio' && paso.id === 'encima' ? limitar((y - 9.5) / 3, 0, 1) : 0;
      const alarma = ef.alarma ? 0.5 + 0.5 * Math.sin(real * 14) : 0;
      const flash = din.flash ?? 0;
      const encima = (ctx, ancho, alto, escala, m) => {
        pintarDestello(ctx, ancho, alto, flash * (ef.dentro ? 1.4 : 1));
        pintarAlarma(ctx, ancho, alto, alarma);
        if (m > 0.5) pintarHielo(ctx, ancho, alto, hielo);
      };
      // Dentro sin permiso (la opción mala): la etiqueta de arriba en rojo.
      const clase = paso.malDentro && ['B', 'C', 'D'].includes(est.clase) ? 'mal' : est.clase;
      return { prims, etiquetas, estado: est.texto, clase, niebla, encima, nublado: ef.dentro ? 1 : ef.oscuro ? 0.5 : 0, ft: sit.alturaFt ? sit.alturaFt(y) : undefined };
    },
  };
}

// 0.14.95: opciones.consecuencia = { opcion, alCerrar? }: la CONSECUENCIA de una pregunta (public/consecuencia-vista.js).
// Sin introducción ni decisión: una línea de contexto, la consecuencia de esa opción (con «Vista» cabina/afuera y el
// mini-mapa), y al final «Por qué», la regla, «Ver la correcta» (si no lo era) y «Cerrar». No avisa «clase-decision»
// (la pregunta ya se respondió y se guardó).
export function montarSituacion3d(contenedor, parametros = {}, opciones = {}) {
  const sit = SITUACIONES[parametros.situacion] ?? SITUACIONES['clase-c'];
  const directo = opciones.consecuencia && sit.opciones.some(o => o.id === opciones.consecuencia.opcion) ? opciones.consecuencia : null;
  const T0 = traductor3d(opciones, TEXTOS_SITUACIONES_PLANOS);
  const Ts = (k, v) => T0(`sit.${sit.id}.${k}`, v);
  const Tc = (k, v) => T0(`sit.ctl.${k}`, v);
  const reducir = prefiereMenosMovimiento();
  const titulo = typeof parametros.titulo === 'string' && parametros.titulo.trim() ? parametros.titulo : Ts('titulo');

  const raiz = el('figure', { class: `clase-visual clase-sit clase-sit-${sit.id}${directo ? ' clase-sit-directa' : ''}`, role: 'group', 'aria-label': titulo }, contenedor);
  el('figcaption', { class: 'clase-sit-titulo' }, raiz, titulo);
  const contexto = directo ? el('p', { class: 'clase-sit-contexto' }, raiz) : null;
  const lugar = el('div', { class: 'clase-sit-escena' }, raiz);
  const relato = el('p', { class: 'clase-sit-relato', 'aria-live': 'polite' }, raiz);
  const radio = el('p', { class: 'clase-sit-radio', hidden: true, lang: 'en' }, raiz);
  const pregunta = el('p', { class: 'clase-sit-pregunta', hidden: true }, raiz, Ts('pregunta'));
  const lista = el('div', { class: 'clase-sit-opciones', role: 'group', 'aria-label': Ts('pregunta'), hidden: true }, raiz);
  const cierre = el('div', { class: 'clase-sit-cierre', hidden: true, 'aria-live': 'polite' }, raiz);
  const final = el('p', { class: 'clase-sit-final', hidden: true }, raiz);

  const escribir = (nodo, texto) => { while (nodo.firstChild) nodo.removeChild(nodo.firstChild); for (const p of partesNegrita(texto)) el(p.negrita ? 'strong' : 'span', {}, nodo, p.texto); };
  let fase = 'intro', actual = null, primera = null, radioVisto = false;
  const vistas = new Set();

  const botones = sit.opciones.map((o, i) => {
    const b = el('button', { type: 'button', class: 'clase-sit-opcion', 'data-nivel': o.nivel, 'data-vista': '0' }, lista);
    el('span', { class: 'clase-sit-icono', 'aria-hidden': 'true' }, b, o.icono);
    el('span', {}, b, Ts(`${o.id}.boton`));
    b.addEventListener('click', () => elegir(i));
    return b;
  });

  let mapa = null;
  const ganchos = {
    alCuadro(id, real, _t, avion) {
      if (mapa && avion?.pos) mapa.mover(avion.pos[0], avion.pos[2], avion.rumbo);
      if (fase === 'intro' && id === 'intro' && real >= sit.intro.vuelo.seg - 0.05) mostrarDecision();
      if (fase === 'resultado' && actual && id === actual.id) {
        if (!radioVisto && actual.radio && real >= (actual.clave ?? 0)) { radioVisto = true; radio.textContent = Ts(`${actual.id}.radio`); radio.hidden = false; }
        if (real >= actual.vuelo.seg + PAUSA_CLAVE + 0.3) mostrarCierre();
      }
    },
  };
  const escena = escenaDeSituacion(sit, Ts, ganchos);
  const visor = montarEscena3d(lugar, {}, { ...opciones, escena, ui: 'situacion' });
  // El mini-mapa (e3d-minimapa.js), en una esquina de la escena: también en la cabina.
  if (directo) mapa = montarMinimapa(lugar.querySelector?.('.clase-e3d-caja') ?? lugar, sit, { T: (k, v) => Tc(k, v), numero: opciones.numero });
  if (contexto) escribir(contexto, Ts('intro'));
  escribir(relato, directo ? '' : Ts('intro'));

  function mostrarDecision() {
    fase = 'decision';
    pregunta.hidden = false; lista.hidden = false; cierre.hidden = true; final.hidden = true;
    botones.forEach((b, i) => b.setAttribute('data-vista', vistas.has(sit.opciones[i].id) ? '1' : '0'));
  }
  function elegir(i) {
    const o = sit.opciones[i];
    actual = o; radioVisto = false; vistas.add(o.id);
    mapa?.poner(o.id);
    if (primera == null && !directo) {
      primera = o.id;
      try {
        if (typeof CustomEvent === 'function' && raiz.dispatchEvent) raiz.dispatchEvent(new CustomEvent('clase-decision', { bubbles: true, detail: { situacion: sit.id, opcion: o.id, nivel: o.nivel, correcta: o.nivel === 'correcto', primera: true } }));
      } catch { /* sin eventos (pruebas) */ }
    }
    fase = 'resultado';
    pregunta.hidden = true; lista.hidden = true; cierre.hidden = true; final.hidden = true; radio.hidden = true;
    escribir(relato, Ts(`${o.id}.resultado`));
    visor.ir(i + 1);
    if (!reducir) visor.reproducir();
    else { const f = o.vuelo.ruta.at(-1); mapa?.mover(f[0], f[2]); ganchos.alCuadro(o.id, o.vuelo.seg + PAUSA_CLAVE + 1); }
  }
  function mostrarCierre() {
    if (fase !== 'resultado' || !actual) return;
    fase = 'cierre';
    const o = actual;
    if (o.radio && !radioVisto) { radioVisto = true; radio.textContent = Ts(`${o.id}.radio`); radio.hidden = false; }
    while (cierre.firstChild) cierre.removeChild(cierre.firstChild);
    cierre.setAttribute('data-nivel', o.nivel);
    el('p', { class: 'clase-sit-veredicto' }, cierre, `${o.nivel === 'correcto' ? '✔' : o.nivel === 'aceptable' ? '≈' : '✘'} ${Tc(o.nivel)}`);
    const porque = el('p', { class: 'clase-sit-porque' }, cierre);
    el('strong', {}, porque, `${Tc('porque')}: `);
    for (const p of partesNegrita(Ts(`${o.id}.porque`))) el(p.negrita ? 'strong' : 'span', {}, porque, p.texto);
    escribir(el('p', { class: 'clase-sit-regla' }, cierre), Ts(`${o.id}.regla`));
    el('p', { class: 'clase-sit-fuente' }, cierre, Tc('fuente', { f: o.fuente }));
    const fila = el('div', { class: 'clase-sit-botones' }, cierre);
    if (directo) {
      const ic = sit.opciones.findIndex(x => x.nivel === 'correcto');
      if (o.nivel !== 'correcto') el('button', { type: 'button', class: 'clase-boton clase-boton-principal clase-sit-ver-correcta' }, fila, Tc('verCorrecta')).addEventListener('click', () => elegir(ic));
      el('button', { type: 'button', class: `clase-boton${o.nivel === 'correcto' ? ' clase-boton-principal' : ''} clase-sit-cerrar` }, fila, Tc('cerrar')).addEventListener('click', () => directo.alCerrar?.());
      cierre.hidden = false;
      return;
    }
    const otra = el('button', { type: 'button', class: 'clase-boton clase-sit-otra' }, fila, Tc('otra'));
    otra.addEventListener('click', () => { radio.hidden = true; escribir(relato, Ts('intro')); mostrarDecision(); });
    const sig = el('button', { type: 'button', class: 'clase-boton clase-boton-principal clase-sit-siguiente' }, fila, Tc('siguiente'));
    sig.addEventListener('click', () => {
      cierre.hidden = true; radio.hidden = true; pregunta.hidden = true; lista.hidden = true;
      escribir(final, `${Tc('final')}: ${Ts('recuerda')}`); final.hidden = false; fase = 'final';
      try { if (typeof CustomEvent === 'function' && raiz.dispatchEvent) raiz.dispatchEvent(new CustomEvent('clase-siguiente', { bubbles: true, detail: { situacion: sit.id } })); } catch { /* sin eventos */ }
    });
    cierre.hidden = false;
  }

  if (directo) elegir(sit.opciones.findIndex(o => o.id === directo.opcion));

  return {
    raiz, mapa,
    tiempo() {}, modo() {}, poner() {},
    pausar() { visor.pausar(); },
    elegir, mostrarDecision,
    // Para las pruebas y las capturas: una fase quieta. { opcion?: id, tiempo?: s, vista?: '1p'|'3p' }.
    fijar({ opcion = null, tiempo = null, vista = null } = {}) {
      if (opcion == null) { fase = 'intro'; const r = visor.fijar({ paso: 0, tiempo: tiempo ?? sit.intro.vuelo.seg, vista }); return r; }
      const i = sit.opciones.findIndex(o => o.id === opcion);
      if (actual?.id !== opcion || fase === 'decision' || fase === 'intro') elegir(i);
      return visor.fijar({ paso: i + 1, tiempo, vista });
    },
    get estado() { return { fase, opcion: actual?.id ?? null, primera, vistas: [...vistas] }; },
    visor,
    destruir() { visor.destruir(); raiz.remove(); },
  };
}

// Los textos con su clave completa sin «clase.e3d.» (sit.<…>), para el traductor.
export const TEXTOS_SITUACIONES_PLANOS = Object.freeze(Object.fromEntries(Object.entries(TEXTOS_SITUACIONES).map(([k, v]) => [`sit.${k}`, v])));
