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
