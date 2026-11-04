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
})();
