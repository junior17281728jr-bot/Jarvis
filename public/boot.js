// Elige la versión de JARVIS que entiende este navegador. Los modernos cargan app.js; las TVs y equipos viejos, app.legacy.js.
(function () {
  var modern = false;
  try { modern = !!(new Function('var o={a:[1]};return o?.a?.at(-1)??0'))() && 'noModule' in document.createElement('script'); } catch (e) { modern = false; }
  var s = document.createElement('script');
  if (modern) { s.type = 'module'; s.src = '/app.js'; } else { s.src = '/app.legacy.js'; }
  document.body.appendChild(s);
  // Si algo falla, que se vea en pantalla (sirve para mandarle una foto a quien lo arregla)
  window.addEventListener('error', function (e) {
    var a = document.getElementById('app');
    if (a && /Cargando JARVIS/.test(a.textContent)) a.innerHTML = '<div class="center"><div class="card msg err" style="max-width:640px">No pude abrir JARVIS en este navegador.<br><small>' + String(e.message || e.error || 'error').replace(/[<>&]/g, '') + '</small></div></div>';
  });
  setTimeout(function () { var a = document.getElementById('app'); if (a && /Cargando JARVIS/.test(a.textContent)) a.innerHTML = '<div class="center"><div class="card" style="max-width:640px;text-align:center">JARVIS está tardando en abrir en este navegador. Recarga la página. Si sigue igual, prueba con otro navegador.</div></div>'; }, 20000);
})();
