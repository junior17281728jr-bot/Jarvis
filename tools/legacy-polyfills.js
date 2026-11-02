// Ayudas para navegadores viejos (TV Samsung/LG, celulares antiguos). Solo agrega lo que falte.
(function () {
  function def(o, k, f) { if (!o[k]) Object.defineProperty(o, k, { value: f, writable: true, configurable: true }); }
  var at = function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return i < 0 || i >= this.length ? undefined : this[i]; };
  def(Array.prototype, 'at', at); def(String.prototype, 'at', at);
  def(Array.prototype, 'flat', function (d) { d = d === undefined ? 1 : d; return d < 1 ? this.slice() : this.reduce(function (a, v) { return a.concat(Array.isArray(v) ? v.flat(d - 1) : v); }, []); });
  def(Array.prototype, 'flatMap', function (f, t) { return this.map(f, t).flat(1); });
  def(Object, 'fromEntries', function (it) { var o = {}; Array.from(it).forEach(function (e) { o[e[0]] = e[1]; }); return o; });
  def(String.prototype, 'padStart', function (n, s) { s = s === undefined ? ' ' : String(s); var t = String(this); while (t.length < n) t = s + t; return t.slice(t.length - Math.max(n, String(this).length)); });
  def(String.prototype, 'replaceAll', function (a, b) { return typeof a === 'string' ? this.split(a).join(b) : this.replace(a, b); });
  if (typeof HTMLFormElement !== 'undefined') def(HTMLFormElement.prototype, 'requestSubmit', function () { var e; try { e = new Event('submit', { cancelable: true, bubbles: true }); } catch (x) { e = document.createEvent('Event'); e.initEvent('submit', true, true); } if (this.dispatchEvent(e)) this.submit(); });
  if (typeof globalThis === 'undefined') window.globalThis = window;
})();
(function () {
  function def(o, k, f) { if (o && !o[k]) Object.defineProperty(o, k, { value: f, writable: true, configurable: true }); }
  def(Object, 'entries', function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); });
  def(Object, 'values', function (o) { return Object.keys(o).map(function (k) { return o[k]; }); });
  def(Object, 'assign', function (t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; } return t; });
  def(Array.prototype, 'includes', function (v) { return this.indexOf(v) !== -1; });
  def(Array.prototype, 'find', function (f, t) { for (var i = 0; i < this.length; i++) if (f.call(t, this[i], i, this)) return this[i]; });
  def(Array.prototype, 'findIndex', function (f, t) { for (var i = 0; i < this.length; i++) if (f.call(t, this[i], i, this)) return i; return -1; });
  def(Array, 'from', function (a, f) { var r = []; if (a && typeof a.length === 'number') { for (var i = 0; i < a.length; i++) r.push(a[i]); } else if (a && typeof a.forEach === 'function') { a.forEach(function (v) { r.push(v); }); } return f ? r.map(f) : r; });
  def(String.prototype, 'includes', function (s, p) { return this.indexOf(s, p || 0) !== -1; });
  def(String.prototype, 'startsWith', function (s, p) { p = p || 0; return this.substr(p, s.length) === s; });
  def(String.prototype, 'endsWith', function (s) { return this.slice(-s.length) === s; });
  def(String.prototype, 'repeat', function (n) { return new Array(n + 1).join(this); });
  def(String.prototype, 'padEnd', function (n, s) { s = s === undefined ? ' ' : String(s); var t = String(this); while (t.length < n) t += s; return t.slice(0, Math.max(n, String(this).length)); });
  // isConnected (Chrome 54+): sin esto, el texto que se escribe letra por letra en la TV nunca aparecía
  if (typeof Node !== 'undefined' && !('isConnected' in Node.prototype)) Object.defineProperty(Node.prototype, 'isConnected', { configurable: true, get: function () { var d = this.ownerDocument || document; return d.documentElement === this || d.documentElement.contains(this); } });
  def(Math, 'trunc', function (x) { return x < 0 ? Math.ceil(x) : Math.floor(x); });
  def(Number, 'isFinite', function (x) { return typeof x === 'number' && isFinite(x); });
  if (typeof NodeList !== 'undefined') def(NodeList.prototype, 'forEach', Array.prototype.forEach);
  if (typeof Element !== 'undefined') {
    def(Element.prototype, 'matches', Element.prototype.webkitMatchesSelector);
    def(Element.prototype, 'closest', function (s) { var e = this; while (e && e.nodeType === 1) { if (e.matches(s)) return e; e = e.parentNode; } return null; });
    def(Element.prototype, 'remove', function () { if (this.parentNode) this.parentNode.removeChild(this); });
  }
  // Navegadores viejos no mandaban la sesión con fetch: se fuerza "same-origin"
  if (window.fetch) { var f0 = window.fetch; window.fetch = function (u, o) { o = Object.assign({ credentials: 'same-origin' }, o || {}); return f0.call(window, u, o); }; }
  else window.fetch = function (u, o) {
    o = o || {};
    return new Promise(function (ok, fail) {
      var x = new XMLHttpRequest(); x.open(o.method || 'GET', u, true); x.withCredentials = true;
      var h = o.headers || {}; Object.keys(h).forEach(function (k) { x.setRequestHeader(k, h[k]); });
      x.onload = function () { var t = x.responseText; ok({ ok: x.status >= 200 && x.status < 300, status: x.status, headers: { get: function (k) { return x.getResponseHeader(k); } }, text: function () { return Promise.resolve(t); }, json: function () { try { return Promise.resolve(JSON.parse(t)); } catch (e) { return Promise.reject(e); } }, clone: function () { return this; } }); };
      x.onerror = function () { fail(new TypeError('Falló la conexión')); }; x.send(o.body || null);
    });
  };
})();
