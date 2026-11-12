// 0.12.12: que cambiar de pantalla no «se trabe» (lo usa public/app.js; aquí solo lo que se puede probar sin navegador).
//  - queOlvida(ruta): qué deja de valer de lo guardado en memoria después de un cambio (POST). Antes TODO cambio vaciaba
//    la memoria, también el «voy en la tarjeta 7» que la clase anota a cada tarjeta: al tocar la X, Inicio no tenía nada
//    guardado y esperaba al servidor con la clase todavía a la vista (con la red lenta, o el servidor ocupado, parecía que
//    la X no hacía nada).
//  - crearEspera(): si la pantalla nueva tarda más de un instante, una barra arriba («cargando») mientras la vieja sigue.
//  - conTope(): un pedido de lectura que no contesta en un rato se corta (la pantalla dice «sin conexión», no se queda colgada).

// Las señales que la clase y el tutor mandan mientras se estudia (no cambian nada de lo guardado, salvo lo indicado).
const SENALES = /^\/api\/academia\/tutor\/(?:senal|tarjeta)$/;
const PASO = /^\/api\/academia\/temas\/([^/]+)\/([^/]+)\/paso$/;

// → 'todo' (se vacía la memoria, como siempre) o { quitar: [rutas que ya no valen], revisar: [rutas que siguen sirviendo
// para dibujar enseguida pero se vuelven a preguntar al servidor] }.
export function queOlvida(ruta) {
  const camino = String(ruta ?? '').split('?')[0];
  if (SENALES.test(camino)) return { quitar: [], revisar: [] };
  const paso = PASO.exec(camino);
  // La lección guarda dónde quedó (para seguir ahí): esa se pide de nuevo. El camino y el progreso muestran el anillo
  // del tema: se dibujan con lo guardado y se revisan (si cambió, la pantalla se vuelve a dibujar sola).
  if (paso) return { quitar: [`/api/academia/temas/${paso[1]}/${paso[2]}`], revisar: ['/api/academia/camino', '/api/academia/progreso'] };
  return 'todo';
}

// Aplica queOlvida a un Map ruta -> { en } (la memoria de app.js). «revisar» pone en = 0: así se pregunta otra vez.
export function olvidar(memoria, ruta) {
  const que = queOlvida(ruta);
  if (que === 'todo') { memoria.clear(); return; }
  for (const r of que.quitar) memoria.delete(r);
  for (const r of que.revisar) { const g = memoria.get(r); if (g) memoria.set(r, { ...g, en: 0 }); }
}

// La barra de «cargando»: la clase va en el <body> después de retrasoMs (lo que se dibuja enseguida no parpadea) y se
// quita al dibujar. Con un tope: si nada se dibuja (un error que no muestra nada), se quita sola.
export const CLASE_ESPERA = 'cambiando-pantalla';
export function crearEspera(cuerpo, { retrasoMs = 150, topeMs = 30_000, programar = setTimeout, cancelar = clearTimeout } = {}) {
  let reloj = null;
  let tope = null;
  const limpiar = () => {
    if (reloj != null) cancelar(reloj);
    if (tope != null) cancelar(tope);
    reloj = tope = null;
  };
  const terminar = () => {
    limpiar();
    cuerpo.classList.remove(CLASE_ESPERA);
    cuerpo.removeAttribute('aria-busy');
  };
  return {
    // Otro cambio mientras ya se espera: la barra sale a la hora del primero (no se corre); el tope vuelve a empezar.
    empezar() {
      if (tope != null) cancelar(tope);
      if (reloj == null && !cuerpo.classList.contains(CLASE_ESPERA)) {
        reloj = programar(() => { reloj = null; cuerpo.classList.add(CLASE_ESPERA); cuerpo.setAttribute('aria-busy', 'true'); }, retrasoMs);
      }
      tope = programar(terminar, topeMs);
    },
    terminar,
    get esperando() { return reloj != null || cuerpo.classList.contains(CLASE_ESPERA); },
  };
}

// Un AbortSignal que corta el pedido a los ms (con el reloj que se le pase, para las pruebas). soltar() lo apaga.
export function conTope(ms, { programar = setTimeout, cancelar = clearTimeout } = {}) {
  const control = new AbortController();
  const reloj = programar(() => control.abort(), ms);
  return { senal: control.signal, soltar: () => cancelar(reloj) };
}
