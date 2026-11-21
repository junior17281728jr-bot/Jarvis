// 0.14.95: el MINI-MAPA de una consecuencia 3D (pedido del dueño: «el mapa donde ves el avión avanzar»): en una esquina de
// la escena, visto desde arriba y con el norte arriba, la ruta de la opción como una línea, el avión que avanza al mismo
// tiempo que en 3D, las zonas (las paredes del espacio aéreo, cada tormenta con su anillo de 20 NM, la capa de nubes, la
// pista y el aeropuerto), el punto donde se decidió y una escala. Se toca para agrandarlo; en la cabina sigue a la vista.
// Usa lo que ya hay: el avión del mapa del VOR (vor.js, FORMA_AVION), svg() de comun.js y la misma ruta que vuela la
// escena (crearRuta de motor3d.js). Todo con clases (el color lo pone clase.css, claro y oscuro); nada de estilos escritos.
import { el, svg, f1 } from './comun.js';
import { crearRuta } from './motor3d.js';
import { FORMA_AVION } from './vor.js';
import { MAPAS_SITUACIONES } from './e3d-situaciones.js';

const TAM = 200, MARGEN = 14;
const NM_FT = 6076;
// La escala: el largo «redondo» más cercano a un cuarto del mapa (en NM; si es muy chico, en pies).
const ESCALAS_NM = [0.25, 0.5, 1, 2, 5, 10, 20, 50];
const ESCALAS_FT = [250, 500, 1000, 2000];

// Los puntos (x, z) que tiene que abarcar el mapa: las zonas, la introducción y todas las opciones.
// 0.14.98: zonas (opcional): las de otro mapa (el Juego de vuelo); si no, las de la situación.
export function limitesMapa(sit, zonas = null) {
  const pts = [];
  for (const z of zonas ?? MAPAS_SITUACIONES[sit.id] ?? []) {
    if (z.tipo === 'pared' || z.tipo === 'celda') { const r = z.tipo === 'celda' ? z.anillo : z.r; pts.push([z.c[0] - r, z.c[1] - r], [z.c[0] + r, z.c[1] + r]); }
    else if (z.tipo === 'capa') pts.push([z.x0, z.z0], [z.x1, z.z1]);
    else if (z.tipo === 'aeropuerto') pts.push([z.c[0], z.c[1] - z.largo / 2], [z.c[0], z.c[1] + z.largo / 2]);
    else if (z.tipo === 'antena') pts.push(z.c);
    else if (z.tipo === 'arboles') pts.push([z.x0, z.z], [z.x1, z.z]);
    else if (z.tipo === 'linea') pts.push(...z.puntos);
    else if (z.tipo === 'texto' || z.tipo === 'td') pts.push(z.c);
  }
  for (const v of [sit.intro.vuelo, ...sit.opciones.map(o => o.vuelo)]) for (const p of v.ruta) pts.push([p[0], p[2]]);
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

// De la escena al dibujo: un cuadrado de TAM con margen, la misma escala en x y z, el norte (+z) arriba.
export function proyeccionMapa(sit, zonas = null) {
  const L = limitesMapa(sit, zonas);
  const ancho = Math.max(L.x1 - L.x0, L.z1 - L.z0, 1e-3);
  const k = (TAM - 2 * MARGEN) / ancho;
  const cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
  const a = (x, z) => [TAM / 2 + (x - cx) * k, TAM / 2 - (z - cz) * k];
  return { a, k, ancho, ftPorUnidad: sit.unidades.ftH };
}

// La escala del mapa: { largo (en unidades de dibujo), valor, unidad: 'nm'|'ft' }.
export function escalaMapa(sit, P = proyeccionMapa(sit)) {
  const nmAncho = (P.ancho * P.ftPorUnidad) / NM_FT;
  const meta = nmAncho / 4;
  if (meta >= ESCALAS_NM[0] * 0.75) {
    const v = ESCALAS_NM.reduce((m, x) => (Math.abs(x - meta) < Math.abs(m - meta) ? x : m), ESCALAS_NM[0]);
    return { valor: v, unidad: 'nm', largo: ((v * NM_FT) / P.ftPorUnidad) * P.k };
  }
  const metaFt = meta * NM_FT;
  const v = ESCALAS_FT.reduce((m, x) => (Math.abs(x - metaFt) < Math.abs(m - metaFt) ? x : m), ESCALAS_FT[0]);
  return { valor: v, unidad: 'ft', largo: (v / P.ftPorUnidad) * P.k };
}

const camino = (puntos, a) => puntos.map(([x, z], i) => { const [u, v] = a(x, z); return `${i ? 'L' : 'M'}${f1(u)} ${f1(v)}`; }).join('');
const circulo = (padre, a, k, c, r, clase) => { const [u, v] = a(c[0], c[1]); return svg('circle', { cx: f1(u), cy: f1(v), r: f1(r * k), class: clase }, padre); };

// T(clave, variables): los textos «clase.e3d.sit.ctl.mapa…». → { nodo, poner(opcionId), mover(x, z, rumbo), grande, destruir }.
// 0.14.98: zonas (las de otro mapa) y decision: false (sin el «Decides aquí»): así lo usa también el Juego de vuelo.
export function montarMinimapa(padre, sit, { T, numero = n => String(n), zonas = null, decision = true } = {}) {
  const P = proyeccionMapa(sit, zonas), { a, k } = P;
  const ZONAS = zonas ?? MAPAS_SITUACIONES[sit.id] ?? [];
  const caja = el('button', { type: 'button', class: 'clase-sit-mapa', 'aria-pressed': 'false', 'aria-label': T('mapa.agrandar') }, padre);
  const s = svg('svg', { viewBox: `0 0 ${TAM} ${TAM}`, class: 'clase-sit-mapa-lienzo', role: 'img', 'aria-label': T('mapa') }, caja);
  svg('rect', { x: 1, y: 1, width: TAM - 2, height: TAM - 2, rx: 12, class: 'clase-sit-mapa-papel' }, s);
  // Las zonas, de abajo hacia arriba: la capa de nubes, los anillos de 20 NM, las tormentas, las paredes, la pista.
  for (const z of ZONAS) {
    if (z.tipo === 'capa') {
      const [u0, v0] = a(z.x0, z.z1), [u1, v1] = a(z.x1, z.z0);
      svg('rect', { x: f1(u0), y: f1(v0), width: f1(u1 - u0), height: f1(v1 - v0), rx: 6, class: `clase-sit-mapa-capa${z.estratos ? ' clase-sit-mapa-estratos' : ''}` }, s);
    }
  }
  for (const z of ZONAS) if (z.tipo === 'celda') circulo(s, a, k, z.c, z.anillo, 'clase-sit-mapa-anillo');
  for (const z of ZONAS) {
    if (z.tipo === 'celda') circulo(s, a, k, z.c, z.r, 'clase-sit-mapa-celda');
    else if (z.tipo === 'pared') circulo(s, a, k, z.c, z.r, `clase-sit-mapa-pared clase-${z.clase}${z.guion ? ' clase-sit-mapa-guion' : ''}`);
    else if (z.tipo === 'aeropuerto') {
      const h = (z.rumbo * Math.PI) / 180, dx = (Math.sin(h) * z.largo) / 2, dz = (Math.cos(h) * z.largo) / 2;
      const [u0, v0] = a(z.c[0] - dx, z.c[1] - dz), [u1, v1] = a(z.c[0] + dx, z.c[1] + dz);
      circulo(s, a, k, z.c, 0, 'clase-sit-mapa-aeropuerto-punto');
      svg('line', { x1: f1(u0), y1: f1(v0), x2: f1(u1), y2: f1(v1), class: 'clase-sit-mapa-pista' }, s);
    } else if (z.tipo === 'antena') {
      const [u, v] = a(z.c[0], z.c[1]);
      svg('path', { d: `M${f1(u)} ${f1(v - 6)}L${f1(u + 5)} ${f1(v + 4)}L${f1(u - 5)} ${f1(v + 4)}Z`, class: 'clase-sit-mapa-antena' }, s);
    } else if (z.tipo === 'arboles') {
      const [u0, v] = a(z.x0, z.z), [u1] = a(z.x1, z.z);
      svg('line', { x1: f1(u0), y1: f1(v), x2: f1(u1), y2: f1(v), class: 'clase-sit-mapa-arboles' }, s);
    } else if (z.tipo === 'linea') {
      // 0.14.102: una línea (la de la aproximación: discontinua).
      svg('path', { d: camino(z.puntos, a), class: `clase-sit-mapa-linea ${z.clase ?? ''}`.trim() }, s);
    } else if (z.tipo === 'td') {
      // 0.14.102: el punto donde tocar (TD): una raya cruzada sobre la pista y su rótulo.
      const h = (z.rumbo * Math.PI) / 180, w = 0.35, [u, v] = a(z.c[0], z.c[1]);
      const [u0, v0] = a(z.c[0] - Math.cos(h) * w, z.c[1] + Math.sin(h) * w), [u1, v1] = a(z.c[0] + Math.cos(h) * w, z.c[1] - Math.sin(h) * w);
      svg('line', { x1: f1(u0), y1: f1(v0), x2: f1(u1), y2: f1(v1), class: 'clase-sit-mapa-td' }, s);
      svg('text', { x: f1(u + 7), y: f1(v + 4), class: 'clase-sit-mapa-texto clase-sit-mapa-td-texto' }, s, 'TD');
    } else if (z.tipo === 'texto') {
      const [u, v] = a(z.c[0], z.c[1]);
      svg('text', { x: f1(u), y: f1(v), 'text-anchor': 'middle', class: `clase-sit-mapa-texto ${z.clase ?? ''}`.trim() }, s, z.texto);
    }
  }
  // La ruta: la introducción (hasta la decisión) y la de la opción, que se cambia con poner().
  const muestras = (ruta, n = 48) => { const r = crearRuta(ruta); return Array.from({ length: n + 1 }, (_, i) => { const p = r.en((i / n) * r.largo); return [p[0], p[2]]; }); };
  svg('path', { d: camino(muestras(sit.intro.vuelo.ruta, 12), a), class: 'clase-sit-mapa-intro' }, s);
  const linea = svg('path', { d: '', class: 'clase-sit-mapa-ruta' }, s);
  // La decisión: donde termina la introducción.
  const dec = sit.intro.vuelo.ruta.at(-1), [du, dv] = a(dec[0], dec[2]);
  if (decision) svg('path', { d: `M${f1(du)} ${f1(dv - 6)}L${f1(du + 6)} ${f1(dv)}L${f1(du)} ${f1(dv + 6)}L${f1(du - 6)} ${f1(dv)}Z`, class: 'clase-sit-mapa-decision' }, s);
  if (decision) svg('text', { x: f1(du + (du > TAM / 2 ? -9 : 9)), y: f1(dv + 4), 'text-anchor': du > TAM / 2 ? 'end' : 'start', class: 'clase-sit-mapa-texto clase-sit-mapa-decision-texto' }, s, T('mapa.decision'));
  // La escala (abajo a la izquierda) y el norte (arriba a la derecha).
  const e = escalaMapa(sit, P);
  const ex = 12, ey = TAM - 14;
  svg('path', { d: `M${ex} ${ey - 4}L${ex} ${ey}L${f1(ex + e.largo)} ${ey}L${f1(ex + e.largo)} ${ey - 4}`, class: 'clase-sit-mapa-escala' }, s);
  svg('text', { x: ex, y: ey - 7, class: 'clase-sit-mapa-texto' }, s, T(e.unidad === 'nm' ? 'mapa.nm' : 'mapa.ft', { v: numero(e.valor) }));
  svg('path', { d: `M${TAM - 16} 12L${TAM - 11} 24L${TAM - 16} 21L${TAM - 21} 24Z`, class: 'clase-sit-mapa-norte' }, s);
  svg('text', { x: TAM - 16, y: 34, 'text-anchor': 'middle', class: 'clase-sit-mapa-texto' }, s, T('mapa.norte'));
  // 0.14.102: las marcas que cambian (el tráfico: un avioncito con su altura, «+5» = 500 ft arriba).
  const capaMarcas = svg('g', { class: 'clase-sit-mapa-marcas' }, s);
  // El avión.
  const avion = svg('g', { class: 'clase-sit-mapa-avion', transform: `translate(${f1(du)} ${f1(dv)})` }, s);
  svg('path', { d: FORMA_AVION, class: 'clase-sit-mapa-avion-forma', transform: 'scale(0.72)' }, avion);

  let grande = false;
  caja.addEventListener('click', () => {
    grande = !grande;
    caja.setAttribute('aria-pressed', String(grande));
    caja.setAttribute('aria-label', T(grande ? 'mapa.achicar' : 'mapa.agrandar'));
  });
  let ultimo = '';
  return {
    nodo: caja,
    get grande() { return grande; },
    poner(opcionId) {
      const o = sit.opciones.find(x => x.id === opcionId);
      linea.setAttribute('d', o ? camino(muestras(o.vuelo.ruta), a) : '');
      linea.setAttribute('class', `clase-sit-mapa-ruta${o ? ` clase-sit-mapa-${o.nivel}` : ''}`);
    },
    // La posición del avión en la escena (x, z) y su rumbo (grados, 0 = +z): solo se escribe si cambió.
    mover(x, z, rumbo = 0) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      // (fuera del mapa, el avión queda en el borde, apuntando a donde va)
      const [u0, v0] = a(x, z), u = Math.min(TAM - 8, Math.max(8, u0)), v = Math.min(TAM - 8, Math.max(8, v0));
      const tr = `translate(${f1(u)} ${f1(v)}) rotate(${f1(Number.isFinite(rumbo) ? rumbo : 0)})`;
      if (tr !== ultimo) { avion.setAttribute('transform', tr); ultimo = tr; }
    },
    get posicion() { return ultimo; },
    // lista: [{ x, z, rumbo, texto }] (se dibujan de nuevo cada vez; pocas).
    marcas(lista = []) {
      while (capaMarcas.firstChild) capaMarcas.removeChild(capaMarcas.firstChild);
      for (const m of lista) {
        if (!Number.isFinite(m.x) || !Number.isFinite(m.z)) continue;
        const [u0, v0] = a(m.x, m.z);
        if (u0 < 4 || v0 < 4 || u0 > TAM - 4 || v0 > TAM - 4) continue;
        const g = svg('g', { transform: `translate(${f1(u0)} ${f1(v0)})` }, capaMarcas);
        svg('path', { d: FORMA_AVION, class: 'clase-sit-mapa-trafico', transform: `rotate(${f1(m.rumbo ?? 0)}) scale(0.5)` }, g);
        if (m.texto) svg('text', { x: 8, y: -6, class: 'clase-sit-mapa-texto clase-sit-mapa-trafico-texto' }, g, m.texto);
      }
    },
    destruir() { caja.remove(); },
  };
}
