// Tema de la pantalla (claro, oscuro o automático), guardado en este navegador.
// Corre antes de dibujar la página (sin «module»), así nunca se ve un destello del otro color.
// Si no hay nada guardado, OPORTIA empieza en claro (blanco).
(function () {
  var tema = 'claro';
  try {
    var guardado = localStorage.getItem('op_tema');
    if (guardado === 'oscuro' || guardado === 'auto' || guardado === 'claro') tema = guardado;
  } catch (e) { /* el navegador no deja leer lo guardado: queda claro */ }
  document.documentElement.setAttribute('data-tema', tema);
  // 0.9.1: la foto de fondo (interfaz.css) se pide después de la primera pantalla, cuando el navegador está libre;
  // mientras tanto se ve una versión diminuta y borrosa. Con «ahorro de datos» no se pide.
  try {
    var red = navigator.connection;
    var ahorro = (red && red.saveData) || (window.matchMedia && window.matchMedia('(prefers-reduced-data: reduce)').matches);
    if (!ahorro) {
      var poner = function () { document.documentElement.classList.add('fondo-listo'); };
      window.addEventListener('load', function () {
        if (window.requestIdleCallback) window.requestIdleCallback(poner, { timeout: 1500 }); else setTimeout(poner, 300);
      });
    }
  } catch (e) { /* sin la foto: queda el fondo liso */ }
})();
