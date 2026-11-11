// Piezas compartidas de las clases visuales: crear elementos (HTML y SVG) sin convertir texto en HTML, interpolar claves de
// tiempo y un bucle de animación que solo corre cuando se ve (pantalla visible y elemento en pantalla).
// Nada toca document/window al importar: las pruebas (node --test) importan estos módulos sin navegador.

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const limitar = (x, min, max) => Math.min(max, Math.max(min, x));
export const mezclar = (a, b, t) => a + (b - a) * t;
export const suave = t => t * t * (3 - 2 * t);
export const rad = g => (g * Math.PI) / 180;
export const grados = r => (r * 180) / Math.PI;

// Un elemento HTML: el('button', { class: 'x', 'aria-label': '…' }, padre, 'texto').
export function el(etiqueta, atributos = {}, padre = null, texto = null) {
  const nodo = document.createElement(etiqueta);
  ponerAtributos(nodo, atributos);
  if (texto != null) nodo.textContent = String(texto);
  if (padre) padre.appendChild(nodo);
  return nodo;
}

// Un elemento SVG: svg('path', { d: '…', class: 'x' }, padre).
export function svg(etiqueta, atributos = {}, padre = null, texto = null) {
  const nodo = document.createElementNS(SVG_NS, etiqueta);
  ponerAtributos(nodo, atributos);
  if (texto != null) nodo.textContent = String(texto);
  if (padre) padre.appendChild(nodo);
  return nodo;
}

export function ponerAtributos(nodo, atributos) {
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor == null || valor === false) continue;
    if (clave === 'style') throw new Error('sin estilos incrustados (CSP): usar clases o nodo.style.x');
    nodo.setAttribute(clave, valor === true ? '' : String(valor));
  }
}

export function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

// Un id único por página para gradientes y recortes (dos alas en la misma página no se pisan).
let contador = 0;
export const idUnico = base => `cl-${base}-${++contador}`;

// Interpola una lista de claves [{t:0, alfa:2}, {t:1, alfa:18}] en t∈[0,1]. Los números se mezclan con una
// curva suave; lo que no es número (textos, booleanos) toma el valor de la última clave alcanzada.
export function interpolarClaves(claves, t) {
  if (!Array.isArray(claves) || claves.length === 0) return {};
  const lista = [...claves].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  if (t <= (lista[0].t ?? 0)) return sinT(lista[0]);
  const ultima = lista[lista.length - 1];
  if (t >= (ultima.t ?? 1)) return sinT(ultima);
  let i = 0;
  while (i < lista.length - 1 && t > lista[i + 1].t) i++;
  const a = lista[i], b = lista[i + 1];
  const tramo = b.t - a.t || 1;
  const f = suave(limitar((t - a.t) / tramo, 0, 1));
  const salida = {};
  for (const clave of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (clave === 't') continue;
    const va = a[clave], vb = b[clave];
    if (typeof va === 'number' && typeof vb === 'number') salida[clave] = mezclar(va, vb, f);
    else salida[clave] = va !== undefined ? va : vb;
  }
  return salida;
}
const sinT = clave => { const { t, ...resto } = clave; return resto; };

export function prefiereMenosMovimiento() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

// Bucle de animación: llama alCuadro(dtSegundos, tiempoTotal) en cada cuadro, pero solo mientras el elemento
// se ve en pantalla y la pestaña está visible (la galería tiene varias animaciones a la vez en el teléfono).
export function crearBucle(elemento, alCuadro) {
  let activo = false, visible = true, pestana = true, id = 0, anterior = 0, total = 0;
  const cuadro = ahora => {
    id = 0;
    const dt = anterior ? Math.min(0.1, (ahora - anterior) / 1000) : 0;
    anterior = ahora;
    total += dt;
    alCuadro(dt, total);
    pedir();
  };
  const pedir = () => {
    if (activo && visible && pestana && !id) id = requestAnimationFrame(cuadro);
  };
  const parar = () => { if (id) cancelAnimationFrame(id); id = 0; anterior = 0; };
  let observador = null;
  if (typeof IntersectionObserver === 'function') {
    observador = new IntersectionObserver(entradas => {
      visible = entradas.some(e => e.isIntersecting);
      if (visible) pedir(); else parar();
    });
    observador.observe(elemento);
  }
  const alCambiarPestana = () => {
    pestana = document.visibilityState !== 'hidden';
    if (pestana) pedir(); else parar();
  };
  document.addEventListener('visibilitychange', alCambiarPestana);
  return {
    iniciar() { activo = true; pedir(); },
    detener() { activo = false; parar(); },
    get activo() { return activo; },
    destruir() {
      activo = false; parar();
      observador?.disconnect();
      document.removeEventListener('visibilitychange', alCambiarPestana);
    },
  };
}

// Un control deslizante con su etiqueta y su valor visible (≥44 px de alto para el dedo).
export function deslizador(padre, { etiqueta, min, max, paso = 1, valor, unidad = '', alCambiar, formato }) {
  const fila = el('label', { class: 'clase-deslizador' }, padre);
  const cabeza = el('span', { class: 'clase-deslizador-cabeza' }, fila);
  el('span', { class: 'clase-deslizador-nombre' }, cabeza, etiqueta);
  const salida = el('output', { class: 'clase-deslizador-valor' }, cabeza);
  const entrada = el('input', { type: 'range', min, max, step: paso, value: valor }, fila);
  const mostrar = v => { salida.textContent = formato ? formato(v) : `${Math.round(v)}${unidad}`; };
  mostrar(Number(valor));
  entrada.addEventListener('input', () => { const v = Number(entrada.value); mostrar(v); alCambiar?.(v); });
  return {
    fila, entrada,
    poner(v) { entrada.value = String(v); mostrar(Number(v)); },
  };
}

// Un botón con texto (y aria-label opcional).
export function boton(padre, texto, alPulsar, atributos = {}) {
  const b = el('button', { type: 'button', class: 'clase-boton', ...atributos }, padre, texto);
  b.addEventListener('click', alPulsar);
  return b;
}

// Hace que un grupo SVG se pueda tocar y usar con el teclado como un botón.
export function tocable(nodo, etiqueta, alTocar) {
  ponerAtributos(nodo, { role: 'button', tabindex: 0, 'aria-label': etiqueta, class: `${nodo.getAttribute('class') || ''} clase-tocable`.trim() });
  nodo.addEventListener('click', alTocar);
  nodo.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alTocar(e); }
  });
}

// Una flecha (línea + punta) de (x1,y1) a (x2,y2) dentro de un grupo; devuelve una función para moverla.
export function flecha(padre, clase, punta = 14) {
  const g = svg('g', { class: clase }, padre);
  const linea = svg('line', { class: 'clase-flecha-linea' }, g);
  const cabeza = svg('path', { class: 'clase-flecha-punta' }, g);
  return {
    g,
    mover(x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1, largo = Math.hypot(dx, dy);
      g.setAttribute('opacity', largo < 2 ? '0' : '1');
      if (largo < 2) return;
      const ux = dx / largo, uy = dy / largo, p = Math.min(punta, largo * 0.6);
      const bx = x2 - ux * p, by = y2 - uy * p;
      linea.setAttribute('x1', f1(x1)); linea.setAttribute('y1', f1(y1));
      linea.setAttribute('x2', f1(bx)); linea.setAttribute('y2', f1(by));
      const ancho = p * 0.62;
      cabeza.setAttribute('d', `M${f1(x2)} ${f1(y2)}L${f1(bx - uy * ancho)} ${f1(by + ux * ancho)}L${f1(bx + uy * ancho)} ${f1(by - ux * ancho)}Z`);
    },
  };
}

export const f1 = n => (Math.round(n * 10) / 10).toString();

// Un trazo SVG suave (Catmull-Rom → Bézier) por una lista de puntos [[x,y], …].
export function trazoSuave(puntos, cerrado = false) {
  if (puntos.length < 2) return '';
  const p = puntos;
  let d = `M${f1(p[0][0])} ${f1(p[0][1])}`;
  const n = p.length;
  for (let i = 0; i < (cerrado ? n : n - 1); i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const a = cerrado || i > 0 ? p0 : p1;
    const b = cerrado || i + 2 < n ? p3 : p2;
    const c1x = p1[0] + (p2[0] - a[0]) / 6, c1y = p1[1] + (p2[1] - a[1]) / 6;
    const c2x = p2[0] - (b[0] - p1[0]) / 6, c2y = p2[1] - (b[1] - p1[1]) / 6;
    d += `C${f1(c1x)} ${f1(c1y)} ${f1(c2x)} ${f1(c2y)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return cerrado ? d + 'Z' : d;
}

// Textos: los de la tabla del módulo, con los que lleguen en opciones.textos encima (para el i18n de después).
export const conTextos = (base, propios) => ({ ...base, ...(propios || {}) });
