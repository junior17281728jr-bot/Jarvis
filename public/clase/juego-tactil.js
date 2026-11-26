// 0.14.118 (pedido del dueño: «los botones no funcionan bien o a veces no abren» y «la página se agranda sola y no puedo
// tocar los mandos»): los toques del Juego de vuelo en el teléfono.
//
// 1. Los botones responden al PRIMER toque, también con el otro dedo en el yugo o en la palanca. En iOS (y en Chrome con
//    varios dedos) el navegador no manda el «click» de un toque mientras otro dedo sigue apoyado: el botón no hacía nada.
//    Aquí el botón se aprieta al levantar el dedo (pointerup) si el dedo no se corrió, y el «click» que el navegador manda
//    después (si lo manda) se descarta: un toque = una vez. El teclado y VoiceOver siguen con el «click» de siempre.
// 2. La página no se agranda: mientras el Juego está abierto, el viewport no deja hacer zoom (maximum-scale=1,
//    user-scalable=no) y se descartan los gestos de pellizco de iOS (gesturestart/gesturechange/gestureend), el doble toque
//    y el pellizco con dos dedos; si la página ya estaba agrandada, vuelve a 1. Al salir, el viewport queda como estaba (el
//    resto de la app se puede agrandar, para quien lo necesite).
// Sin estado global: cada función recibe lo que usa (en las pruebas, objetos de mentira).

// Lo que se aprieta al levantar el dedo: los botones y los enlaces con forma de botón (no los que manejan sus toques solos).
export const SELECTOR_TOQUE = 'button:not([data-propio]):not(.juego-perilla), a.juego-boton';
export const TOQUE = Object.freeze({ umbralPx: 14, ventanaMs: 750, radioClicPx: 40 });

// Los toques de una raíz: → { destruir }. reloj() en ms (para las pruebas).
export function activarToques(raiz, { reloj = () => Date.now(), selector = SELECTOR_TOQUE } = {}) {
  const dedos = new Map();
  let ultimo = null; // { t, x, y }: el último botón apretado con el dedo (para descartar el «click» repetido)
  const objetivo = e => (typeof e.target?.closest === 'function' ? e.target.closest(selector) : null);
  const abajo = e => {
    if (e.pointerType === 'mouse') return;
    const nodo = objetivo(e);
    if (nodo && raiz.contains?.(nodo) !== false) dedos.set(e.pointerId, { nodo, x: e.clientX, y: e.clientY, movido: false });
  };
  const mover = e => {
    const d = dedos.get(e.pointerId);
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TOQUE.umbralPx) d.movido = true;
  };
  const arriba = e => {
    const d = dedos.get(e.pointerId);
    dedos.delete(e.pointerId);
    if (!d || d.movido) return;
    // (el dedo se levantó sobre el mismo botón: con captura de puntero el objetivo puede ser otro, por eso se mira el punto)
    const aqui = objetivo(e);
    if (aqui !== d.nodo || d.nodo.disabled || d.nodo.getAttribute?.('aria-disabled') === 'true') return;
    ultimo = { t: reloj(), x: e.clientX, y: e.clientY };
    d.nodo.click();
  };
  const cancelar = e => { dedos.delete(e.pointerId); };
  // El «click» del navegador que llega después del toque (el mismo dedo): se descarta. Los de nuestro click(), no.
  const clic = e => {
    if (!e.isTrusted || !ultimo) return;
    const cerca = !(e.clientX || e.clientY) || Math.hypot(e.clientX - ultimo.x, e.clientY - ultimo.y) < TOQUE.radioClicPx;
    if (reloj() - ultimo.t < TOQUE.ventanaMs && cerca) { e.preventDefault(); e.stopImmediatePropagation(); ultimo = null; }
  };
  const ops = [['pointerdown', abajo], ['pointermove', mover], ['pointerup', arriba], ['pointercancel', cancelar], ['click', clic]];
  for (const [tipo, f] of ops) raiz.addEventListener(tipo, f, true);
  return { destruir() { for (const [tipo, f] of ops) raiz.removeEventListener(tipo, f, true); dedos.clear(); } };
}

// El viewport sin zoom: el mismo contenido con maximum-scale=1 y user-scalable=no (lo demás, igual).
export function contenidoSinZoom(original = '') {
  const partes = String(original).split(',').map(s => s.trim()).filter(Boolean).filter(s => !/^(maximum-scale|minimum-scale|user-scalable)\s*=/i.test(s));
  if (!partes.some(s => /^width\s*=/i.test(s))) partes.unshift('width=device-width');
  if (!partes.some(s => /^initial-scale\s*=/i.test(s))) partes.push('initial-scale=1');
  return [...partes, 'maximum-scale=1', 'user-scalable=no'].join(',');
}

// Mientras el Juego está abierto: sin zoom. doc: el documento; raiz: el Juego. → { destruir } (deja todo como estaba).
export function bloquearZoom(doc, raiz, { ventana = globalThis } = {}) {
  const meta = doc?.querySelector?.('meta[name="viewport"]') ?? null;
  const original = meta?.getAttribute('content') ?? null;
  if (meta) meta.setAttribute('content', contenidoSinZoom(original ?? ''));
  // Si ya estaba agrandada (un pellizco de antes), vuelve a 1: iOS reacomoda la escala al cambiar el viewport.
  const vv = ventana?.visualViewport;
  if (meta && vv && vv.scale > 1.01) {
    meta.setAttribute('content', `${contenidoSinZoom(original ?? '')},initial-scale=1.0001`);
    ventana.requestAnimationFrame?.(() => meta.setAttribute('content', contenidoSinZoom(original ?? '')));
  }
  const nada = e => { if (e.cancelable !== false) e.preventDefault(); };
  const gestos = ['gesturestart', 'gesturechange', 'gestureend'];
  for (const g of gestos) doc?.addEventListener?.(g, nada, { passive: false });
  // El doble toque y el pellizco dentro del Juego (los botones ya se apretaron al levantar el dedo).
  let ultimoFin = -1e9;
  const fin = e => {
    if (e.touches?.length) return;
    const ahora = e.timeStamp ?? Date.now();
    if (ahora - ultimoFin < 350 && e.cancelable !== false && !e.target?.closest?.('.juego-se-desplaza')) e.preventDefault();
    ultimoFin = ahora;
  };
  const pellizco = e => { if ((e.touches?.length ?? 0) > 1 && e.cancelable !== false) e.preventDefault(); };
  raiz?.addEventListener?.('touchend', fin, { passive: false });
  raiz?.addEventListener?.('touchmove', pellizco, { passive: false });
  raiz?.addEventListener?.('dblclick', nada);
  return {
    destruir() {
      if (meta) { if (original == null) meta.removeAttribute('content'); else meta.setAttribute('content', original); }
      for (const g of gestos) doc?.removeEventListener?.(g, nada);
      raiz?.removeEventListener?.('touchend', fin); raiz?.removeEventListener?.('touchmove', pellizco); raiz?.removeEventListener?.('dblclick', nada);
    },
  };
}
