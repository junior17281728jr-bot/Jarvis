// Elige la versión de JARVIS que entiende este navegador. Los modernos cargan app.js; las TVs y equipos viejos, app.legacy.js.
(function () {
  // ¿Qué equipo es? TV, teléfono o computadora. Cada uno recibe su propio diseño.
  var ua = navigator.userAgent || '', w = Math.max(screen.width || 0, window.innerWidth || 0), touch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  var tv = /SmartTV|SMART-TV|Tizen|Web0S|WebOS|NetCast|HbbTV|BRAVIA|AFT[A-Z]|GoogleTV|Android TV|CrKey|Roku|VIDAA|Viera|AQUOS|PhilipsTV|Opera TV|TV Safari|Large Screen/i.test(ua);
  var phone = !tv && (/iPhone|iPod|Android.+Mobile|Windows Phone|Mobile Safari/i.test(ua) || (touch && w < 760));
  var tablet = !tv && !phone && (/iPad|Android|Tablet/i.test(ua) || (touch && w < 1200));
  var kind = tv ? 'tv' : phone ? 'phone' : tablet ? 'tablet' : 'desktop';
  try { var forced = localStorage.getItem('jv-device'); if (forced) kind = forced; } catch (e) {}
  document.documentElement.className += ' is-' + kind;
  window.JV_DEVICE = kind;
  var modern = false;
  try { modern = !!(new Function('var o={a:[1]};return o?.a?.at(-1)??0'))() && 'noModule' in document.createElement('script'); } catch (e) { modern = false; }
  var s = document.createElement('script');
  if (modern) { s.type = 'module'; s.src = '/app.js'; } else {
    s.src = '/app.legacy.js';
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/styles.legacy.css'; document.head.appendChild(l);
    document.documentElement.className += ' legacy';
  }
  document.body.appendChild(s);
  // Si algo falla, que se vea en pantalla (sirve para mandarle una foto a quien lo arregla)
  window.addEventListener('error', function (e) {
    var a = document.getElementById('app');
    if (a && /Cargando JARVIS/.test(a.textContent)) a.innerHTML = '<div class="center"><div class="card msg err" style="max-width:640px">No pude abrir JARVIS en este navegador.<br><small>' + String(e.message || e.error || 'error').replace(/[<>&]/g, '') + '</small></div></div>';
  });
  setTimeout(function () { var a = document.getElementById('app'); if (a && /Cargando JARVIS/.test(a.textContent)) a.innerHTML = '<div class="center"><div class="card" style="max-width:640px;text-align:center">JARVIS está tardando en abrir en este navegador. Recarga la página. Si sigue igual, prueba con otro navegador.</div></div>'; }, 20000);
})();
