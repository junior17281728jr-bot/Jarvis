// Tema de la pantalla (claro, oscuro o automático), guardado en este navegador.
// Corre antes de dibujar la página (sin «module»), así nunca se ve un destello del otro color.
// 0.14.54: si no hay nada guardado, sigue al equipo (automático: oscuro si el iPhone o la Mac están en oscuro). Lo que se
// elige en Configuración (claro u oscuro) manda. «Automático» se pone en <html> ya resuelto (data-tema="oscuro" o
// "claro"): así valen todas las reglas del modo oscuro, también las que solo miran data-tema="oscuro".
(function () {
  var elegido = function () {
    try {
      var guardado = localStorage.getItem('op_tema');
      if (guardado === 'oscuro' || guardado === 'auto' || guardado === 'claro') return guardado;
    } catch (e) { /* el navegador no deja leer lo guardado: automático */ }
    return 'auto';
  };
  var oscuroDelEquipo = function () {
    try { return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; }
  };
  var aplicar = function () {
    var tema = elegido();
    document.documentElement.setAttribute('data-tema', tema === 'auto' ? (oscuroDelEquipo() ? 'oscuro' : 'claro') : tema);
  };
  aplicar();
  // El equipo cambia de claro a oscuro (al anochecer, o a mano): si la persona no eligió uno, la app lo sigue.
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (elegido() === 'auto') aplicar(); }); } catch (e) { /* navegador viejo */ }
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
