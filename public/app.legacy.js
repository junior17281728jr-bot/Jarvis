/* JARVIS versión para navegadores viejos. Generado desde app.js (75b5a4b62359cac3). No editar a mano: node tools/build-legacy.cjs */
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

(function () {
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var $ = function (s) { return document.querySelector(s); };
var app = $('#app');
var esc = function (v) { return String(v !== null && v !== void 0 ? v : '').replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); };
var usd = function (v, d) {
    if (d === void 0) { d = 2; }
    return (v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + 'US$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
};
var rdRaw = function (v) { return (v == null ? '—' : 'RD$' + Number(v).toLocaleString('es-DO', { maximumFractionDigits: 2 })); };
var FX = 60;
var rdu = function (v, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.sign, sign = _c === void 0 ? false : _c;
    if (v == null || isNaN(v))
        return '—';
    var u = v / FX, s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : (v < 0 ? '−' : '');
    return "<span class=\"dual\">".concat(s, "US$").concat(Math.abs(u).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "<small class=\"rdsub\">").concat(s, "RD$").concat(Math.abs(Math.round(v)).toLocaleString('en-US'), "</small></span>");
};
var rd = function (v) { return rdu(v); };
var pct = function (v, d) {
    if (d === void 0) { d = 1; }
    return (v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%');
};
var cls = function (v) { return (v > 0 ? 'good' : v < 0 ? 'bad' : ''); };
var timeAgo = function (iso) { if (!iso)
    return 'nunca'; var m = Math.round((Date.now() - Date.parse(iso)) / 60e3); return m < 1 ? 'ahora' : m < 60 ? "hace ".concat(m, " min") : m < 1440 ? "hace ".concat(Math.round(m / 60), " h") : "hace ".concat(Math.round(m / 1440), " d"); };
var hhmm = function (iso) { return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false }); };
var LIGHT = { verde: 'Sí, invierte', amarillo: 'Invierte poco', rojo: 'No inviertas', gris: 'Igual que el azar' };
var MYBUDGET = null;
var STYLE_PCT = { conservador: { verde: 0.05, amarillo: 0.025, max: 0.1 }, equilibrado: { verde: 0.1, amarillo: 0.05, max: 0.2 }, arriesgado: { verde: 0.15, amarillo: 0.075, max: 0.25 } };
var myStyle = function () { var _a; return STYLE_PCT[(_a = MYBUDGET === null || MYBUDGET === void 0 ? void 0 : MYBUDGET.profile) === null || _a === void 0 ? void 0 : _a.style] || STYLE_PCT.equilibrado; };
var baseAmt = function (l) { var _a; var B = (_a = MYBUDGET === null || MYBUDGET === void 0 ? void 0 : MYBUDGET.usd) !== null && _a !== void 0 ? _a : 100, p = myStyle()[l] || 0; return l === 'rojo' || !p ? 0 : Math.max(5, Math.round(B * p)); };
var VERDICT = {
    get verde() { return "S\u00ED, te recomiendo invertir ".concat(usd(baseAmt('verde'), 0)); },
    get amarillo() { return "Invierte poco: ".concat(usd(baseAmt('amarillo'), 0), ", con cuidado"); },
    get rojo() { return 'No te recomiendo invertir ahora'; },
};
var scaleProj = function (r, amt) { return (r ? __assign(__assign({}, r), { bad: r.bad * amt / 10, probable: r.probable * amt / 10, good: r.good * amt / 10 }) : r); };
function loadBudget() {
    return __awaiter(this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                return [4, api('/api/budget')];
            case 1:
                MYBUDGET = _b.sent();
                return [3, 3];
            case 2:
                _a = _b.sent();
                MYBUDGET = null;
                return [3, 3];
            case 3: return [2];
        }
    }); });
}
var light = function (l) { return "<span class=\"light ".concat(l, "\"><i></i>").concat(LIGHT[l] || l, "</span>"); };
var FACTOR = { tendencia: 'Cómo le va contra el mercado', historial: 'Aciertos previos de JARVIS', empresa: 'Salud de la empresa', riesgo: 'Cuánto sube y baja', polemicas: 'Noticias' };
var STATUS = { en_desarrollo: '🛠️ Preparándose', en_prueba: '🧪 En prueba en vivo', en_evaluacion: '🔍 En evaluación', validada: '✅ Aprobada (con dinero virtual)', no_validada: '❌ Descartada', en_revision: '🔍 En revisión', retirada: '⏹️ Retirada' };
var STATUS_TONE = { no_validada: 'bad', retirada: 'bad', en_prueba: 'warn', en_evaluacion: 'warn', en_revision: 'warn', validada: 'good' };
var STRAT = {
    comprar_y_mantener: function () { return 'Comprar y no vender nunca (es la referencia contra la que se compara todo).'; },
    cruce_medias: function (p) { return "Comprar cuando el precio promedio de los \u00FAltimos ".concat(p.fast, " d\u00EDas sube por encima del promedio de ").concat(p.slow, " d\u00EDas (se\u00F1al de que empieza a subir), y vender cuando baja."); },
    impulso: function (p) { return "Comprar las acciones que subieron en los \u00FAltimos ".concat(p.lookback, " d\u00EDas (lo que sube suele seguir subiendo) y vender si empiezan a bajar."); },
    rebote_rsi: function (p) { return "Comprar cuando una acci\u00F3n cay\u00F3 mucho en pocos d\u00EDas (".concat(p.period, " d\u00EDas), esperando que rebote, y vender cuando se recupera."); },
    ruptura: function (p) { return "Comprar cuando el precio pasa su punto m\u00E1s alto de los \u00FAltimos ".concat(p.n, " d\u00EDas, y vender si cae a su punto m\u00E1s bajo de los \u00FAltimos ").concat(Math.round(p.n / 2), " d\u00EDas."); },
    tendencia_larga: function (p) { return "(Usada por profesionales) Estar invertido solo cuando el precio est\u00E1 por encima de su promedio de ".concat(p.n, " d\u00EDas, para esquivar las ca\u00EDdas grandes."); },
    momento_12_1: function (p) { return "(Usada por profesionales) Comprar lo que subi\u00F3 en los \u00FAltimos ".concat(Math.round(p.look / 21), " meses, sin contar el \u00FAltimo mes."); },
    baja_volatilidad: function (p) { return "(Usada por profesionales) Estar invertido solo cuando el mercado est\u00E1 tranquilo (se mueve menos de lo normal en ".concat(p.n, " d\u00EDas)."); },
    bandas_bollinger: function (p) { return "(Usada por profesionales) Comprar cuando el precio cae mucho por debajo de lo normal (".concat(p.k, " desviaciones bajo el promedio de ").concat(p.n, " d\u00EDas) y vender cuando vuelve al promedio."); },
};
var stratText = function (f, params) { try {
    var p = typeof params === 'string' ? JSON.parse(params) : params;
    return STRAT[f] ? STRAT[f](p || {}) : String(f).replace(/_/g, ' ');
}
catch (_a) {
    return String(f).replace(/_/g, ' ');
} };
var plainReason = function (t) { return String(t || '')
    .replace(/No le ganó al mercado ni en los datos de práctica \(t=[^)]*\)\./, 'La probé con años de precios reales y no ganó más que simplemente comprar el mercado y esperar. La descarto.')
    .replace(/En el examen final no demostró ventaja \(t=[^)]*\)\./, 'Pasó la primera prueba, pero en el examen final (con precios que nunca había visto) no ganó más que el mercado. La descarto.')
    .replace(/Pasó el examen con datos bajo llave \(t=[^)]*\)\. Pasa a prueba en vivo\./, '¡Pasó el examen final con precios que nunca había visto! Ahora la pruebo en vivo con dinero virtual.')
    .replace(/\s*\(t=[^)]*\)/g, ''); };
var AGENT_NAME = { largo: 'Agente de largo plazo', corto: 'Agente de corto plazo', polemicas: 'Cazador de noticias graves', loteria: 'Agente de loterías', ia: 'Cartera de la IA' };
var GLOSS = {
    volatilidad: 'Cuánto sube y baja el precio. Más volatilidad = más riesgo.', 'SPY': 'Fondo que copia a las 500 empresas más grandes de EE. UU. Es la referencia del mercado.',
    confianza: 'Qué tan respaldada está la idea por datos y por el historial real de JARVIS. No es una garantía.', semáforo: 'Verde: buenas pruebas. Amarillo: hay dudas. Rojo: las razones en contra pesan más.',
    'valor esperado': 'Lo que devuelve en promedio cada apuesta a largo plazo, calculado con todas las combinaciones posibles.',
    acción: 'Un pedacito de una empresa. Si a la empresa le va bien, el precio suele subir.', fondo: 'Una canasta con muchas acciones. Repartir el dinero baja el riesgo.',
    'acción fraccionada': 'Comprar una parte de una acción (por ejemplo, US$5 de una que cuesta US$500).', comisión: 'Lo que cobra el bróker por operar. Muchos ya cobran US$0.',
    diferencial: 'La pequeña diferencia entre el precio de compra y el de venta. Es un costo escondido.', deslizamiento: 'Cuando el precio cambia un poco entre que decides y se ejecuta la orden.',
    'caída máxima': 'Lo más que llegó a bajar el dinero desde su punto más alto. Mide el susto que habría que aguantar.', diversificar: 'No poner todos los huevos en la misma canasta.',
    'prueba histórica': 'Probar una estrategia con datos del pasado, como si se hubiera usado en ese momento.', 'prueba en vivo': 'Probar con datos nuevos que la estrategia nunca vio. Es la prueba que más vale.',
    'datos bajo llave': 'Una parte del historial que JARVIS nunca usa para crear estrategias, solo para el examen final.', 'pruebas múltiples': 'Si pruebas cientos de ideas, alguna gana por suerte. JARVIS exige más mientras más prueba.',
    bróker: 'La empresa donde se compran y venden acciones de verdad (JARVIS nunca se conecta a uno con dinero real).', 'polémica': 'Noticia que puede dañar a la empresa: demandas, fraudes, investigaciones, retiros de productos.',
    'tipo de cambio': 'Cuántos pesos dominicanos cuesta un dólar.', 'fondo de emergencia': 'Dinero guardado para imprevistos (3 a 6 meses de gastos). Va antes de invertir.',
    'el mercado': 'Las 500 empresas más grandes de EE. UU. juntas (el fondo SPY). Es la vara para medir: si una acción no le gana al mercado, sería mejor comprar ese fondo y esperar.',
    'informes oficiales': 'Los reportes de ventas, ganancias y deudas que la ley obliga a publicar a las empresas de EE. UU.',
    conveniencia: 'Nota de 0 a 100 que resume qué tanto te conviene una opción según su historia, su riesgo y tu forma de invertir.',
    probabilidad: 'De cada 10 casos parecidos en el pasado, cuántos salieron bien. Ayuda a decidir, pero no es una promesa.',
    efectivo: 'Dinero que no está invertido, listo para usar.', cartera: 'El grupo de acciones que tienes compradas.',
    'riesgo alto': 'Que el precio puede bajar mucho de golpe (aunque después se recupere). Pon menos dinero y ten paciencia.',
    dividendo: 'Parte de las ganancias que algunas empresas reparten cada cierto tiempo a quienes tienen sus acciones.',
};
var GLOSS_AUTO = ['el mercado', 'volatilidad', 'informes oficiales', 'conveniencia', 'fondo de emergencia', 'caída máxima', 'diversificar', 'valor esperado', 'acción fraccionada', 'bróker', 'tipo de cambio', 'probabilidad', 'semáforo', 'riesgo alto', 'dividendo', 'SPY'];
function glossify(root) {
    if (!root)
        return;
    var W = 'A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ', done = {};
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false), nodes = [];
    while (walker.nextNode())
        nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
        var e_1, _a;
        var par = n.parentNode;
        if (!par || par.closest('a,button,abbr,input,textarea,select,label,script,style,.gl,h1,.tvbig,.pbox .v'))
            return;
        var text = n.nodeValue, hit = null;
        try {
            for (var GLOSS_AUTO_1 = __values(GLOSS_AUTO), GLOSS_AUTO_1_1 = GLOSS_AUTO_1.next(); !GLOSS_AUTO_1_1.done; GLOSS_AUTO_1_1 = GLOSS_AUTO_1.next()) {
                var k = GLOSS_AUTO_1_1.value;
                if (done[k])
                    continue;
                var m = new RegExp('(^|[^' + W + '])(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=$|[^' + W + '])', 'i').exec(text);
                if (m && (!hit || m.index < hit.i))
                    hit = { i: m.index + m[1].length, len: m[2].length, k: k };
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (GLOSS_AUTO_1_1 && !GLOSS_AUTO_1_1.done && (_a = GLOSS_AUTO_1.return)) _a.call(GLOSS_AUTO_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        if (!hit)
            return;
        done[hit.k] = true;
        var ab = document.createElement('abbr');
        ab.className = 'gl';
        ab.dataset.g = hit.k;
        ab.title = GLOSS[hit.k];
        ab.textContent = text.substr(hit.i, hit.len);
        var after = document.createTextNode(text.slice(hit.i + hit.len));
        n.nodeValue = text.slice(0, hit.i);
        par.insertBefore(ab, n.nextSibling);
        par.insertBefore(after, ab.nextSibling);
    });
}
document.addEventListener('click', function (e) {
    var g = e.target.closest && e.target.closest('abbr.gl, abbr[title]');
    var old = document.getElementById('glpop');
    if (old)
        old.remove();
    if (!g || !(GLOSS[g.dataset.g] || g.title))
        return;
    e.preventDefault();
    var pop = document.createElement('div');
    pop.id = 'glpop';
    pop.className = 'glpop';
    var ttl = String(g.dataset.g || g.textContent);
    pop.innerHTML = "<b>".concat(esc(ttl.charAt(0).toUpperCase() + ttl.slice(1)), "</b><div>").concat(esc(GLOSS[g.dataset.g] || g.title), "</div><div class=\"note\">Toca en cualquier parte para cerrar</div>");
    document.body.appendChild(pop);
});
var term = function (w, label) {
    if (label === void 0) { label = w; }
    return "<abbr title=\"".concat(esc(GLOSS[w] || ''), "\" style=\"text-decoration:underline dotted;cursor:help\">").concat(esc(label), "</abbr>");
};
var PALETTES0 = { cian: { name: 'Cian', dark: '#38d6f5', light: '#1a6dff' }, azul: { name: 'Azul', dark: '#6fa0ff', light: '#1a4fd6' }, violeta: { name: 'Violeta', dark: '#b39bff', light: '#6a46e8' }, dorado: { name: 'Dorado', dark: '#ffc94d', light: '#9a6400' }, rosa: { name: 'Rosa', dark: '#ff7cc8', light: '#c02a86' }, turquesa: { name: 'Turquesa', dark: '#3ee6c4', light: '#00806a' } };
var BRAND = { name: 'JARVIS', tagline: 'Tu investigador de bolsa y loterías', owner: '', color: 'cian', hasLogo: false, v: 0, palette: PALETTES0.cian, palettes: PALETTES0 };
var brandMark = function (big) {
    if (big === void 0) { big = false; }
    return BRAND.hasLogo ? "<img class=\"blogo".concat(big ? ' big' : '', "\" src=\"/brand/logo?v=").concat(BRAND.v, "\" alt=\"\">") : "<span class=\"ring".concat(big ? ' big' : '', "\"><i></i></span>");
};
var brandName = function () { return "<span class=\"bname".concat(BRAND.name.length <= 8 ? ' wide' : '', "\">").concat(esc(BRAND.name), "</span>"); };
function applyBrand() {
    document.title = BRAND.name;
    document.querySelector('.top .logo').innerHTML = brandMark() + brandName();
    var st = document.getElementById('brand-css');
    if (!st) {
        st = document.createElement('style');
        st.id = 'brand-css';
        document.head.appendChild(st);
    }
    var P = BRAND.palette;
    st.textContent = ":root{--accent:".concat(P.light, "}:root[data-theme=\"dark\"]{--accent:").concat(P.dark, ";--glow:0 0 18px ").concat(P.dark, "59}.tv{--a:").concat(P.dark, "}");
    var ic = document.querySelector('link[rel="icon"]');
    if (ic) {
        ic.href = BRAND.hasLogo ? "/brand/logo?v=".concat(BRAND.v) : '/icon.svg';
        ic.type = BRAND.hasLogo ? '' : 'image/svg+xml';
    }
}
function loadBrand() {
    return __awaiter(this, void 0, void 0, function () { var b, _a; return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                return [4, fetch('/api/brand').then(function (r) { return r.json(); })];
            case 1:
                b = _b.sent();
                if (b && b.name)
                    BRAND = b;
                return [3, 3];
            case 2:
                _a = _b.sent();
                return [3, 3];
            case 3:
                applyBrand();
                return [2];
        }
    }); });
}
var footLine = function () { return "<div class=\"foot\">".concat(esc(BRAND.name)).concat(BRAND.owner ? " \u00B7 propiedad de ".concat(esc(BRAND.owner)) : '', " \u00B7 Todo es dinero virtual. Estimaciones con pruebas, no promesas. La decisi\u00F3n de invertir dinero real es tuya.</div>"); };
var CO = { SPY: 'El mercado (S&P 500)', VOO: 'Fondo S&P 500', QQQ: 'Fondo Nasdaq 100', MSFT: 'Microsoft', AAPL: 'Apple', NVDA: 'NVIDIA', AMZN: 'Amazon', TSLA: 'Tesla', KO: 'Coca-Cola', JPM: 'JPMorgan', GOOGL: 'Google', GOOG: 'Google', META: 'Meta (Facebook)', NFLX: 'Netflix', DIS: 'Disney', V: 'Visa', MA: 'Mastercard', WMT: 'Walmart', COST: 'Costco', PEP: 'Pepsi', MCD: "McDonald's", NKE: 'Nike', 'BRK.B': 'Berkshire Hathaway', JNJ: 'Johnson & Johnson', PG: 'Procter & Gamble', XOM: 'ExxonMobil', AMD: 'AMD', INTC: 'Intel', BAC: 'Bank of America', UNH: 'UnitedHealth', HD: 'Home Depot', ORCL: 'Oracle', CRM: 'Salesforce', ADBE: 'Adobe', PYPL: 'PayPal', UBER: 'Uber', SBUX: 'Starbucks', T: 'AT&T', VZ: 'Verizon', AVGO: 'Broadcom', LLY: 'Eli Lilly' };
var coName = function (s) { return CO[s] || s; };
function coBadge(sym, size) {
    var e_2, _a;
    if (size === void 0) { size = 40; }
    var h = 0;
    try {
        for (var _b = __values(String(sym)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var ch = _c.value;
            h = (h * 31 + ch.charCodeAt(0)) % 360;
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_2) throw e_2.error; }
    }
    var t = String(sym).replace('.', '').slice(0, 4);
    return "<span class=\"cob\" style=\"--h:".concat(h, ";background-color:hsl(").concat(h, ",70%,44%);width:").concat(size, "px;height:").concat(size, "px;font-size:").concat(Math.round(size * (t.length > 3 ? .27 : .34)), "px\">").concat(esc(t), "</span>");
}
var coCell = function (sym, sub) {
    if (sub === void 0) { sub = ''; }
    return "<div class=\"coc\">".concat(coBadge(sym), "<div><b>").concat(esc(coName(sym)), "</b><div class=\"note\">").concat(esc(sym)).concat(sub ? ' · ' + sub : '', "</div></div></div>");
};
var AGENTS = { largo: ['Largo plazo', '#38d6f5'], corto: ['Corto plazo', '#a98bff'], polemicas: ['Noticias', '#ffbf3c'], loteria: ['Loterías', '#2fd58a'] };
function chanceDots(p, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.what, what = _c === void 0 ? 'le gana al mercado' : _c, _d = _b.big, big = _d === void 0 ? false : _d;
    if (p == null || isNaN(p))
        return '<span class="note">—</span>';
    if (p < 0.095)
        return "<div class=\"chance".concat(big ? ' big' : '', "\"><div class=\"ct\"><b>").concat(Math.max(1, Math.round(p * 100)), " de cada 100</b> veces ").concat(esc(what), "</div></div>");
    var n = Math.round(p * 10), col = p >= 0.55 ? '#2fd58a' : p >= 0.45 ? '#ffbf3c' : '#ff5d6c';
    return "<div class=\"chance".concat(big ? ' big' : '', "\" title=\"").concat(Math.round(p * 100), "%\"><div class=\"dots\">").concat(Array.from({ length: 10 }, function (_, i) { return "<i".concat(i < n ? " style=\"background:".concat(col, ";border-color:").concat(col, "\"") : '', "></i>"); }).join(''), "</div><div class=\"ct\"><b>").concat(n, " de cada 10</b> veces ").concat(esc(what), "</div></div>");
}
function moneyRange(base, r, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.months, months = _c === void 0 ? 6 : _c;
    if (!r)
        return '<span class="note">—</span>';
    var lo = base + r.bad, mid = base + r.probable, hi = base + r.good, span = hi - lo || 1, x = function (v) { return Math.max(0, Math.min(100, (v - lo) / span * 100)); };
    return "<div class=\"mr\"><div class=\"mr-v ".concat(cls(r.probable), "\">").concat(usd(mid), "</div><div class=\"mr-bar\"><span class=\"z\" style=\"left:").concat(x(base), "%\"></span><span class=\"m\" style=\"left:").concat(x(mid), "%\"></span></div><div class=\"note\">entre ").concat(usd(lo), " y ").concat(usd(hi), " en ").concat(months, " meses</div></div>");
}
var humanDays = function (d) { return (d == null ? 'más de un año' : d <= 7 ? "".concat(Math.max(1, Math.round(d / 5)), " semana").concat(Math.round(d / 5) > 1 ? 's' : '') : d < 42 ? "".concat(Math.round(d / 5), " semanas") : "".concat(Math.round(d / 21), " mes").concat(Math.round(d / 21) > 1 ? 'es' : '')); };
function patience(t, lightName) {
    if (!t || lightName === 'rojo')
        return '';
    if (t.immediate)
        return '<span class="pat fast">⚡ Puede ganar en semanas</span>';
    if (t.recommended)
        return "<span class=\"pat\">\u23F3 D\u00E9jala al menos ".concat(esc(t.recommended.label), "</span>");
    return '<span class="pat">⏳ Déjala 1 año o más (sube y baja mucho)</span>';
}
var takeaway = function (t) { return t ? "<div class=\"takeaway\"><b>En pocas palabras:</b> ".concat(t, "</div>") : ''; };
function api(path_1) {
    return __awaiter(this, arguments, void 0, function (path, opts) {
        var res, j;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, fetch(path, __assign(__assign({}, opts), { headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined }))];
                case 1:
                    res = _a.sent();
                    return [4, res.json().catch(function () { return ({}); })];
                case 2:
                    j = _a.sent();
                    if (res.status === 401) {
                        showAuth();
                        throw new Error('Inicia sesión.');
                    }
                    if (!res.ok)
                        throw new Error(j.error || 'Error');
                    return [2, j];
            }
        });
    });
}
function shrinkImage(file) {
    return new Promise(function (ok, fail) {
        if (!/^image\/(png|jpeg|webp)$/.test(file.type))
            return fail(new Error('Usa una imagen PNG, JPG o WEBP.'));
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
            var k = Math.min(1, 512 / Math.max(img.width, img.height)), c = document.createElement('canvas');
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            var d = c.toDataURL('image/png');
            if (d.length > 380000)
                d = c.toDataURL('image/webp', 0.9);
            if (!d.startsWith('data:image/webp') || d.length > 380000)
                d = d.length > 380000 ? c.toDataURL('image/jpeg', 0.85) : d;
            d.length > 400000 ? fail(new Error('La imagen sigue muy pesada; prueba con otra más simple.')) : ok(d);
        };
        img.onerror = function () { return fail(new Error('No pude leer esa imagen.')); };
        img.src = url;
    });
}
function lineChart(points, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.h, h = _c === void 0 ? 200 : _c, _d = _b.color, color = _d === void 0 ? '#38d6f5' : _d, _e = _b.bench, bench = _e === void 0 ? null : _e, _f = _b.label, label = _f === void 0 ? '' : _f;
    if (!(points === null || points === void 0 ? void 0 : points.length))
        return '<div class="empty">Sin datos de precios todavía.</div>';
    var W = 760, H = h, pad = 34, vals = points.map(function (p) { return p[1]; }).concat(bench ? bench.map(function (p) { return p[1]; }) : []);
    var min = Math.min.apply(Math, __spreadArray([], __read(vals), false)), max = Math.max.apply(Math, __spreadArray([], __read(vals), false)), span = max - min || 1;
    var x = function (i) { return pad + (i / (points.length - 1 || 1)) * (W - pad - 10); }, y = function (v) { return 10 + (1 - (v - min) / span) * (H - 40); };
    var path = function (pts) { return pts.map(function (p, i) { return "".concat(i ? 'L' : 'M').concat(x(i).toFixed(1), " ").concat(y(p[1]).toFixed(1)); }).join(' '); };
    var ticks = [min, min + span / 2, max];
    var lastP = points.at(-1);
    var months = points.filter(function (p, i) { return i % Math.ceil(points.length / 6) === 0; });
    return "<svg viewBox=\"0 0 ".concat(W, " ").concat(H, "\" width=\"100%\" role=\"img\" aria-label=\"").concat(esc(label), "\">\n    ").concat(ticks.map(function (t) { return "<line x1=\"".concat(pad, "\" x2=\"").concat(W - 10, "\" y1=\"").concat(y(t), "\" y2=\"").concat(y(t), "\" stroke=\"#1e2a44\"/><text x=\"0\" y=\"").concat(y(t) + 4, "\" font-size=\"11\" fill=\"#8a97b5\">").concat(t >= 100 ? t.toFixed(0) : t.toFixed(2), "</text>"); }).join(''), "\n    ").concat(months.map(function (p) { var i = points.indexOf(p); return "<text x=\"".concat(x(i), "\" y=\"").concat(H - 6, "\" font-size=\"11\" fill=\"#8a97b5\">").concat(esc(p[0].slice(2, 7)), "</text>"); }).join(''), "\n    <path d=\"").concat(path(points), " L").concat(x(points.length - 1), " ").concat(H - 30, " L").concat(x(0), " ").concat(H - 30, " Z\" fill=\"").concat(color, "\" opacity=\".10\"/>\n    <path d=\"").concat(path(points), "\" fill=\"none\" stroke=\"").concat(color, "\" stroke-width=\"2.5\"/>\n    ").concat(bench ? "<path d=\"".concat(path(bench), "\" fill=\"none\" stroke=\"#8a97b5\" stroke-width=\"1.8\" stroke-dasharray=\"6 5\"/>") : '', "\n    <circle cx=\"").concat(x(points.length - 1), "\" cy=\"").concat(y(lastP[1]), "\" r=\"5\" fill=\"").concat(color, "\" stroke=\"#0e1527\" stroke-width=\"2\"/>\n  </svg>");
}
function gauge(conf, cases, label, _a) {
    if (label === void 0) { label = 'Confianza'; }
    var _b = _a === void 0 ? [0.66, 0.45] : _a, _c = __read(_b, 2), hi = _c[0], lo = _c[1];
    var a = Math.max(0.02, Math.min(0.98, conf)), ang = Math.PI * (1 - a), cx = 85, cy = 90, r = 70;
    var ex = cx + r * Math.cos(ang), ey = cy - r * Math.sin(ang);
    var col = conf >= hi ? '#2fd58a' : conf >= lo ? '#ffbf3c' : '#ff5d6c';
    return "<div style=\"text-align:center\"><svg width=\"170\" height=\"100\" viewBox=\"0 0 170 100\" role=\"img\" aria-label=\"Confianza ".concat(Math.round(conf * 100), "%\">\n    <path d=\"M15 90 A70 70 0 0 1 155 90\" fill=\"none\" stroke=\"#111a2e\" stroke-width=\"14\" stroke-linecap=\"round\"/>\n    <path d=\"M15 90 A70 70 0 0 1 ").concat(ex.toFixed(1), " ").concat(ey.toFixed(1), "\" fill=\"none\" stroke=\"").concat(col, "\" stroke-width=\"14\" stroke-linecap=\"round\"/>\n    <text x=\"85\" y=\"84\" text-anchor=\"middle\" fill=\"#e8eefc\" font-size=\"28\" font-weight=\"800\">").concat(Math.round(conf * 100), "%</text></svg>\n    <div class=\"note\" style=\"letter-spacing:.1em;text-transform:uppercase;font-weight:700;font-size:11px\">").concat(label === 'Confianza' ? term('confianza', 'Confianza') : esc(label)).concat(cases ? " \u00B7 ".concat(cases, " casos") : '', "</div></div>");
}
function whyBars(contribs) {
    var max = Math.max.apply(Math, __spreadArray(__spreadArray([], __read(contribs.map(function (c) { return Math.abs(c.contribution); })), false), [1], false));
    return "<div class=\"why\">".concat(contribs.slice().sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution); }).map(function (c) { return "<div class=\"w\"><span>".concat(esc(FACTOR[c.factor] || c.factor), "</span><b class=\"").concat(cls(c.contribution), "\" title=\"").concat(c.contribution, "\">").concat(Math.abs(c.contribution) < 1 ? 'Neutral' : c.contribution > 0 ? 'A favor' : 'En contra', "</b>\n    <div class=\"bar\"><span style=\"width:").concat(Math.abs(c.contribution) / max * 100, "%;background:").concat(c.contribution >= 0 ? '#2fd58a' : '#ff5d6c', "\"></span></div></div>"); }).join(''), "</div>");
}
function projBox(p, title) {
    if (!p)
        return '<div class="empty">Faltan datos para estimar.</div>';
    return "<div class=\"note\" style=\"margin-bottom:8px\">".concat(esc(title), " \u00B7 <span class=\"tag est\">Estimaci\u00F3n</span> basada en ").concat(p.basedOnDays, " d\u00EDas reales</div>\n  <div class=\"mini3\">\n    <div class=\"pbox\"><div class=\"l\">Caso malo</div><div class=\"v ").concat(cls(p.bad), "\">").concat(usd(p.bad), "</div></div>\n    <div class=\"pbox\"><div class=\"l\">Lo probable</div><div class=\"v ").concat(cls(p.probable), "\">").concat(usd(p.probable), "</div></div>\n    <div class=\"pbox\"><div class=\"l\">Caso bueno</div><div class=\"v ").concat(cls(p.good), "\">").concat(usd(p.good), "</div></div>\n  </div><div class=\"note\" style=\"margin-top:6px\">Probabilidad de perder dinero: ").concat(Math.round(p.lossChance * 100), "%. No es una promesa.</div>");
}
function feed(items) {
    if (!(items === null || items === void 0 ? void 0 : items.length))
        return '<div class="empty">Todavía no hay actividad. Activa el motor en Ajustes.</div>';
    return "<div class=\"feed\">".concat(items.map(function (e) { return "<div class=\"ev ".concat(e.important ? 'imp' : '', "\"><time>").concat(hhmm(e.ts), "</time><span>").concat(e.agent ? "<span class=\"ag\" style=\"--ac:".concat((AGENTS[e.agent] || [0, '#38d6f5'])[1], "\">").concat(esc((AGENTS[e.agent] || [e.agent])[0]), "</span>") : '').concat(esc(e.text), "</span></div>"); }).join(''), "</div>");
}
function steps(list) { return "<div class=\"steps\">".concat(list.map(function (s, i) { return "<div class=\"step\"><i>".concat(i + 1, "</i><div>").concat(esc(s.step), "<small>").concat(esc(s.note || ''), "</small></div></div>"); }).join(''), "</div>"); }
function todoFor(lightName) {
    if (lightName === 'verde')
        return [{ step: 'Invierte US$10 ahora', note: 'Dentro de tu límite por operación' }, { step: 'Sal si cae 8%', note: 'Pérdida máxima: US$0.80' }];
    if (lightName === 'amarillo')
        return [{ step: 'Invierte US$5 ahora', note: 'Entrada en dos partes por la duda' }, { step: 'Otros US$5 en 2 semanas', note: 'Solo si no sube más de 5% ni aparece una polémica' }, { step: 'Sal si cae 8%', note: 'Pérdida máxima: US$0.80' }];
    return [{ step: 'No compres por ahora', note: 'Las razones en contra pesan más' }, { step: 'Queda en vigilancia', note: 'JARVIS te avisa si cambia' }];
}
var ACC_KEY = 'jv.accounts', DEV_KEY = 'jv.dev.';
var lsGet = function (k) { try {
    return localStorage.getItem(k);
}
catch (_a) {
    return null;
} };
var lsSet = function (k, v) { try {
    v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
}
catch (_a) { } };
function savedAccounts() { try {
    var a = JSON.parse(lsGet(ACC_KEY) || '[]');
    return Array.isArray(a) ? a.filter(function (x) { return x && typeof x.u === 'string'; }).slice(0, 12) : [];
}
catch (_a) {
    return [];
} }
function rememberAccount(u, name) { var a = savedAccounts().filter(function (x) { return x.u.toLowerCase() !== u.toLowerCase(); }); a.unshift({ u: u, name: name || u }); lsSet(ACC_KEY, JSON.stringify(a.slice(0, 12))); }
function forgetAccount(u) { lsSet(ACC_KEY, JSON.stringify(savedAccounts().filter(function (x) { return x.u !== u; }))); var t = lsGet(DEV_KEY + u); if (t) {
    fetch('/api/login/forget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }).catch(function () { });
    lsSet(DEV_KEY + u, null);
} }
function showAuth() {
    return __awaiter(this, void 0, void 0, function () {
        var needsSetup, all, _a, saved, seen, accs, pick, tvGo_1;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    $('#top').classList.add('hide');
                    return [4, fetch('/api/setup').then(function (r) { return r.json(); })];
                case 1:
                    needsSetup = (_b.sent()).needsSetup;
                    all = [];
                    if (!!needsSetup) return [3, 5];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4, fetch('/api/login/users').then(function (r) { return r.json(); })];
                case 3:
                    all = _b.sent();
                    return [3, 5];
                case 4:
                    _a = _b.sent();
                    return [3, 5];
                case 5:
                    saved = savedAccounts(), seen = {};
                    accs = needsSetup ? [] : __spreadArray(__spreadArray([], __read(saved.filter(function (x) { return !all.length || all.some(function (y) { return y.u === x.u; }); })), false), __read(all), false).filter(function (x) { var k = x.u.toLowerCase(); if (seen[k])
                        return false; seen[k] = 1; return true; })
                        .map(function (x) { return (__assign(__assign({}, x), { name: (all.find(function (y) { return y.u === x.u; }) || x).name, quick: !!lsGet(DEV_KEY + x.u) })); });
                    app.innerHTML = "<div class=\"center\"><form class=\"card auth form\" id=\"auth\">\n    <div class=\"auth-brand\">".concat(brandMark(true), "<div class=\"logo\">").concat(brandName(), "</div>").concat(BRAND.tagline ? "<div class=\"note\">".concat(esc(BRAND.tagline), "</div>") : '').concat(BRAND.owner ? "<div class=\"owner\">Programa privado de ".concat(esc(BRAND.owner), "</div>") : '', "</div>\n    <h1 style=\"text-align:center;font-size:20px\">").concat(needsSetup ? 'Crea tu cuenta de administrador' : accs.length ? '¿Quién entra?' : 'Inicia sesión', "</h1>\n    ").concat(needsSetup ? '<p class="note" style="text-align:center">Es la primera vez. Esta cuenta controla JARVIS y crea los usuarios de tus amigos.</p>' : '', "\n    ").concat(accs.length ? "<div class=\"accts\" id=\"accs\">".concat(accs.map(function (x) { return "<div class=\"acct-item\"><button type=\"button\" class=\"acct\" data-u=\"".concat(esc(x.u), "\"><span class=\"acct-av\">").concat(esc((x.name || x.u).trim().charAt(0).toUpperCase()), "</span><span class=\"acct-t\"><b>").concat(esc(x.name || x.u), "</b><span class=\"note\">").concat(x.quick ? '🔓 entra con un toque' : x.admin ? 'administrador' : 'pon tu contraseña', "</span></span></button>").concat(saved.some(function (y) { return y.u === x.u; }) ? "<button type=\"button\" class=\"acct-x\" data-x=\"".concat(esc(x.u), "\" title=\"Olvidar en este equipo\" aria-label=\"Olvidar ").concat(esc(x.name), " en este equipo\">\u00D7</button>") : '', "</div>"); }).join(''), "</div>\n      <button type=\"button\" class=\"linkbtn\" id=\"other\">Entrar con otro usuario</button>") : '', "\n    <div id=\"userbox\"").concat(accs.length ? ' class="hide"' : '', "><label>Usuario<input id=\"u\" name=\"username\" autocomplete=\"username\" autocapitalize=\"none\" autocorrect=\"off\" spellcheck=\"false\" required></label></div>\n    <div id=\"passbox\"").concat(accs.length ? ' class="hide"' : '', ">\n      <div id=\"who\" class=\"note hide\" style=\"text-align:center;margin-bottom:6px\"></div>\n      <label>Contrase\u00F1a<input id=\"p\" name=\"password\" type=\"password\" autocomplete=\"").concat(needsSetup ? 'new-password' : 'current-password', "\" required minlength=\"").concat(needsSetup ? 10 : 1, "\"></label>\n      ").concat(needsSetup ? '' : "<label class=\"chk\" style=\"margin-top:8px\"><input type=\"checkbox\" id=\"remp\"> Recordar mi contrase\u00F1a en este equipo <span class=\"note\">(la pr\u00F3xima vez entras con solo tocar tu nombre)</span></label>\n      <div class=\"note\" style=\"margin-top:2px\">\u00DAsalo solo en tu celular o en tu TV, no en equipos de otras personas.</div>", "\n      <button class=\"btn\" style=\"margin-top:10px\">").concat(needsSetup ? 'Crear y entrar' : 'Entrar', "</button>\n    </div><div class=\"msg err\" id=\"am\"></div>\n    ").concat(needsSetup ? '' : "<details class=\"forgot note\"><summary>\u00BFSe te olvid\u00F3 la contrase\u00F1a?</summary><div><b>Si eres usuario:</b> p\u00EDdele al administrador una nueva (Ajustes \u2192 Usuarios \u2192 \"Nueva contrase\u00F1a\").<br><b>Si eres el administrador:</b> abre la consola de tu servidor en DigitalOcean (bot\u00F3n \"Console\") y escribe:<div class=\"mono cmd\">sudo -u jarvis node /opt/jarvis/deploy/nueva-clave.mjs</div>Te muestra una clave nueva. La vieja no se puede ver: se guarda cifrada para que nadie la robe.</div></details>", "\n    ").concat(needsSetup ? '' : "<div class=\"tvbox\"><button type=\"button\" class=\"linkbtn\" id=\"tvopen\">\uD83D\uDCFA Entrar con c\u00F3digo (TV)</button>\n      <div id=\"tvform\" class=\"hide\"><div class=\"note\" style=\"text-align:center\">En tu celular abre JARVIS \u2192 <b>Mi perfil</b> \u2192 <b>C\u00F3digo para la TV</b>. Escribe aqu\u00ED ese c\u00F3digo (4 n\u00FAmeros y 2 letras).</div>\n      <input id=\"tvc\" class=\"tvcode\" maxlength=\"8\" placeholder=\"1234 AB\" autocomplete=\"off\" autocapitalize=\"characters\" spellcheck=\"false\">\n      <button type=\"button\" class=\"btn\" id=\"tvgo\" style=\"width:100%\">Entrar</button></div></div>", "\n    </form></div>");
                    pick = function (u) { return __awaiter(_this, void 0, void 0, function () {
                        var a, tok, err_1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    a = accs.find(function (x) { return x.u === u; });
                                    document.querySelectorAll('.acct').forEach(function (b) { return b.classList.toggle('on', b.dataset.u === u); });
                                    $('#u').value = u;
                                    $('#am').textContent = '';
                                    tok = lsGet(DEV_KEY + u);
                                    if (!tok) return [3, 4];
                                    $('#who').textContent = "Entrando como ".concat((a === null || a === void 0 ? void 0 : a.name) || u, "\u2026");
                                    $('#who').classList.remove('hide');
                                    $('#passbox').classList.remove('hide');
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 3, , 4]);
                                    return [4, api('/api/login/device', { method: 'POST', body: { username: u, token: tok } })];
                                case 2:
                                    _a.sent();
                                    rememberAccount(u, a === null || a === void 0 ? void 0 : a.name);
                                    return [2, boot()];
                                case 3:
                                    err_1 = _a.sent();
                                    lsSet(DEV_KEY + u, null);
                                    $('#am').textContent = err_1.message;
                                    return [3, 4];
                                case 4:
                                    $('#userbox').classList.add('hide');
                                    $('#passbox').classList.remove('hide');
                                    $('#who').textContent = "Entrando como ".concat((a === null || a === void 0 ? void 0 : a.name) || u);
                                    $('#who').classList.remove('hide');
                                    $('#p').value = '';
                                    $('#p').focus();
                                    return [2];
                            }
                        });
                    }); };
                    document.querySelectorAll('.acct').forEach(function (b) { return b.onclick = function () { return pick(b.dataset.u); }; });
                    document.querySelectorAll('.acct-x').forEach(function (b) { return b.onclick = function () { forgetAccount(b.dataset.x); showAuth(); }; });
                    if ($('#other'))
                        $('#other').onclick = function () { $('#u').value = ''; $('#who').classList.add('hide'); $('#userbox').classList.remove('hide'); $('#passbox').classList.remove('hide'); document.querySelectorAll('.acct').forEach(function (b) { return b.classList.remove('on'); }); $('#u').focus(); };
                    if ($('#tvopen')) {
                        $('#tvopen').onclick = function () { $('#tvform').classList.toggle('hide'); $('#tvc').focus(); };
                        tvGo_1 = function () { return __awaiter(_this, void 0, void 0, function () { var err_2; return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 2, , 3]);
                                    return [4, api('/api/tvlogin', { method: 'POST', body: { code: $('#tvc').value } })];
                                case 1:
                                    _a.sent();
                                    boot();
                                    return [3, 3];
                                case 2:
                                    err_2 = _a.sent();
                                    $('#am').textContent = err_2.message;
                                    return [3, 3];
                                case 3: return [2];
                            }
                        }); }); };
                        $('#tvgo').onclick = tvGo_1;
                        $('#tvc').onkeydown = function (e) { if (e.key === 'Enter') {
                            e.preventDefault();
                            tvGo_1();
                        } };
                    }
                    $('#auth').onsubmit = function (e) { return __awaiter(_this, void 0, void 0, function () {
                        var u, remember, r, name, err_3;
                        var _a, _b, _c;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    e.preventDefault();
                                    _d.label = 1;
                                case 1:
                                    _d.trys.push([1, 3, , 4]);
                                    u = $('#u').value.trim(), remember = !!((_a = $('#remp')) === null || _a === void 0 ? void 0 : _a.checked);
                                    return [4, api(needsSetup ? '/api/setup' : '/api/login', { method: 'POST', body: { username: u, password: $('#p').value, remember: remember } })];
                                case 2:
                                    r = _d.sent();
                                    name = ((_b = r === null || r === void 0 ? void 0 : r.user) === null || _b === void 0 ? void 0 : _b.username) || u;
                                    rememberAccount(name, (_c = r === null || r === void 0 ? void 0 : r.user) === null || _c === void 0 ? void 0 : _c.displayName);
                                    if (r === null || r === void 0 ? void 0 : r.deviceToken)
                                        lsSet(DEV_KEY + name, r.deviceToken);
                                    boot();
                                    return [3, 4];
                                case 3:
                                    err_3 = _d.sent();
                                    $('#am').textContent = err_3.message;
                                    return [3, 4];
                                case 4: return [2];
                            }
                        });
                    }); };
                    return [2];
            }
        });
    });
}
var ME = null;
var views = {};
var VOTE_NAME = { tendencia: 'Cómo va su precio', historial: 'Lo que JARVIS ya acertó con ella', empresa: 'Salud de la empresa', riesgo: 'Qué tan riesgosa es', polemicas: 'Noticias graves' };
function votesHtml(contribs) {
    var c = (contribs || []).filter(function (x) { return VOTE_NAME[x.factor]; });
    if (!c.length)
        return '';
    var yes = c.filter(function (x) { return x.value > 0.05; }), no = c.filter(function (x) { return x.value < -0.05; }), mid = c.length - yes.length - no.length;
    return "<div class=\"votes\"><div class=\"votes-h\">\uD83D\uDDF3\uFE0F <b>".concat(yes.length, " de ").concat(c.length, " se\u00F1ales votan a favor</b>").concat(no.length ? " \u00B7 ".concat(no.length, " en contra") : '').concat(mid ? " \u00B7 ".concat(mid, " neutral").concat(mid > 1 ? 'es' : '') : '', "</div>\n    <div class=\"vchips\">").concat(c.map(function (x) { return "<span class=\"vchip ".concat(x.value > 0.05 ? 'yes' : x.value < -0.05 ? 'no' : 'mid', "\">").concat(x.value > 0.05 ? '👍' : x.value < -0.05 ? '👎' : '✋', " ").concat(esc(VOTE_NAME[x.factor]), "</span>"); }).join(''), "</div></div>");
}
function confidenceCard() {
    var ev = MYBUDGET === null || MYBUDGET === void 0 ? void 0 : MYBUDGET.evidence;
    if (!ev)
        return '';
    var NEED = 50, n = ev.n || 0, hr = ev.hitRate, lo = ev.lo || 0;
    var level = n < 20 ? ['Aprendiendo', 'warn', 'Todavía tiene muy pocas recomendaciones terminadas para saber si acierta. Por eso te pide poner poco.']
        : lo > 0.55 ? ['Seguro', 'good', 'Ya demostró con casos reales que acierta más que la suerte.']
            : lo > 0.5 ? ['Medio', 'accent', 'Va acertando más que la suerte, pero todavía puede ser casualidad.']
                : ['Todavía no', 'bad', 'Con lo que ha visto hasta ahora, acierta casi como lanzar una moneda. Sigue aprendiendo y no te deja poner más.'];
    var pctNeed = Math.min(100, Math.round(n / NEED * 100));
    return "<section class=\"card conf\"><div class=\"conf-h\"><div><div class=\"s10-h\">\uD83E\uDDE0 Qu\u00E9 tan seguro est\u00E1 JARVIS</div><div class=\"conf-v ".concat(level[1], "\">").concat(level[0], "</div></div>\n    <div class=\"conf-m\"><div class=\"conf-big\">").concat(hr != null ? "".concat(Math.round(hr * 10), "<small>/10</small>") : '—', "</div><div class=\"note\">aciertos</div></div></div>\n    <div class=\"note\">").concat(esc(level[2]), "</div>\n    <div class=\"row\" style=\"justify-content:space-between;margin-top:10px;font-size:14px\"><span>Recomendaciones ya terminadas</span><b>").concat(n, " de ").concat(NEED, " para estar seguro</b></div>\n    <div class=\"vbar\" style=\"height:10px;margin-top:6px\"><span style=\"width:").concat(pctNeed, "%\"></span></div>\n    <div class=\"note\" style=\"margin-top:8px\">Nadie puede acertar 100% en la bolsa (ni JARVIS, ni los bancos). Lo honesto es medir cu\u00E1nto acierta de verdad y dec\u00EDrtelo. Cada d\u00EDa que trabaja suma casos y esta medida se vuelve m\u00E1s confiable.</div></section>");
}
var FOCUS_OPTS = [['corto', '⚡', 'Ganar en semanas', 'Corto plazo'], ['medio', '⚖️', 'En unos meses', 'Medio plazo'], ['largo', '🌳', 'A largo plazo', '1 año o más']];
var focusShell = function () { return "<section class=\"card focuscard\" id=\"focuscard\"><h2>\uD83C\uDFAF \u00BFQu\u00E9 buscas ahora?</h2><div class=\"note\">Toca una opci\u00F3n y JARVIS se concentra en buscar lo mejor para ese plazo.</div><div class=\"fopts\" id=\"fopts\">".concat(FOCUS_OPTS.map(function (_a) {
    var _b = __read(_a, 4), k = _b[0], i = _b[1], t = _b[2], sub = _b[3];
    return "<button type=\"button\" class=\"fopt\" data-h=\"".concat(k, "\"><span class=\"fi\">").concat(i, "</span><b>").concat(t, "</b><span class=\"note\">").concat(sub, "</span></button>");
}).join(''), "</div><div id=\"fres\" class=\"note\" style=\"margin-top:10px\">Cargando\u2026</div></section>"); };
function focusPaint(f) {
    document.querySelectorAll('.fopt').forEach(function (b) { return b.classList.toggle('on', b.dataset.h === f.horizon); });
    var el = $('#fres');
    if (!el)
        return;
    var rows = f.top.map(function (t, i) { return "<a class=\"frow\" href=\"#analisis/".concat(esc(t.symbol), "\">").concat(coBadge(t.symbol, 34), "<div style=\"flex:1;min-width:0\"><b>").concat(i + 1, ". ").concat(esc(coName(t.symbol)), "</b> <span class=\"note\">").concat(esc(t.symbol), "</span><div class=\"note\">Termin\u00F3 ganando <b>").concat(Math.round(t.p * 10), " de cada 10 veces</b> ").concat(esc(f.when)).concat(t.median != null ? " \u00B7 lo normal: ".concat(t.median >= 0 ? '+' : '').concat(Math.round(t.median * 100), "%") : '').concat(t.bad != null ? " \u00B7 en un mal caso: ".concat(Math.round(t.bad * 100), "%") : '', "</div></div><span class=\"note\">").concat(t.zone === 'recomendada' ? '✅ Te recomiendo' : t.zone === 'observacion' ? '👀 En observación' : '🔎 Explorando', "</span></a>"); }).join('');
    el.innerHTML = "".concat(f.searching ? '<div class="searching">🔎 JARVIS está buscando más opciones para esto ahora mismo… (unos minutos; te aviso en "Lo que pasó")</div>' : '', "\n    ").concat(rows ? "<div style=\"margin:8px 0 4px\"><b>Lo mejor si esperas ".concat(esc(f.when.replace(/^en /, "")), ", seg\u00FAn la historia real:</b></div>").concat(rows, "<div class=\"note\" style=\"margin-top:6px\">\"Termin\u00F3 ganando\" = cu\u00E1ntas veces, en el pasado, quien compr\u00F3 y esper\u00F3 ese tiempo termin\u00F3 con m\u00E1s dinero. No es garant\u00EDa.</div>") : '<div>Todavía no hay datos suficientes para este plazo. Toca el botón y JARVIS se pone a buscar.</div>');
}
function focusInit() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, e_3;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!$('#focuscard'))
                        return [2];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    _a = focusPaint;
                    return [4, api('/api/focus')];
                case 2:
                    _a.apply(void 0, [_b.sent()]);
                    return [3, 4];
                case 3:
                    e_3 = _b.sent();
                    $('#fres').textContent = e_3.message;
                    return [3, 4];
                case 4:
                    document.querySelectorAll('.fopt').forEach(function (b) { return b.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                        var f, e_4;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    $('#fres').textContent = 'Buscando…';
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 3, , 4]);
                                    return [4, api('/api/focus', { method: 'POST', body: { horizon: b.dataset.h } })];
                                case 2:
                                    f = _a.sent();
                                    focusPaint(f);
                                    if (MYBUDGET === null || MYBUDGET === void 0 ? void 0 : MYBUDGET.profile)
                                        MYBUDGET.profile.horizon = f.horizon;
                                    return [3, 4];
                                case 3:
                                    e_4 = _a.sent();
                                    $('#fres').textContent = e_4.message;
                                    return [3, 4];
                                case 4: return [2];
                            }
                        });
                    }); }; });
                    return [2];
            }
        });
    });
}
views.inicio = function () { return __awaiter(void 0, void 0, void 0, function () {
    var h, greens, alerts, best, p, leader;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4, api('/api/home')];
            case 1:
                h = _c.sent();
                greens = h.ranking.filter(function (c) { return c.light === 'verde'; }), alerts = h.activity.filter(function (a) { return a.important && Date.now() - Date.parse(a.ts) < 864e5; }).length;
                best = h.myBest || greens[0] || h.ranking.find(function (c) { return c.light === 'amarillo'; });
                p = h.predictions, leader = h.league[0];
                return [2, "\n  <section class=\"hero\">".concat(best ? coBadge(best.symbol, 64) : '<span class="cob idle" style="width:64px;height:64px;font-size:26px">⏸</span>', "<div style=\"flex:1;min-width:0\"><div class=\"tag\">Hoy en 10 segundos</div>\n    <div class=\"big\">").concat(best ? "Te recomiendo: ".concat(esc(coName(best.symbol)), " \u2192 ").concat(best.light === 'verde' ? "invierte ".concat(usd(baseAmt('verde'), 0)) : "invierte poco (".concat(usd(baseAmt('amarillo'), 0), ")")) : 'Hoy no te recomiendo invertir en ninguna: lo mejor es esperar', "</div>\n    <div class=\"sub\">").concat(best ? "".concat(chanceDots(best.probBeat)).concat(patience(best.timing, best.light), " <a href=\"#analisis/").concat(esc(best.symbol), "\">Ver por qu\u00E9 \u25B8</a> \u00B7 <a href=\"#mapa\">Ver mi mapa \u25B8</a> <a class=\"btn sm herobuy\" href=\"#bolsa\">\uD83D\uDCB5 Invertir (virtual)</a>") : 'Esperar también es una decisión. JARVIS sigue investigando y te avisa si algo cambia.', "</div>\n    <div class=\"note\" style=\"margin-top:4px\">Tu dinero de pr\u00E1ctica: <b class=\"").concat(cls(h.account.returnPct), "\">").concat(usd(h.account.total), " (").concat(pct(h.account.returnPct, 2), ")</b> \u00B7 ").concat(alerts, " aviso").concat(alerts === 1 ? '' : 's', " hoy</div></div>\n    ").concat(best ? votesHtml(best.contributions) : '', "\n    <div class=\"pill\">").concat(h.system.motor.running ? '<span class="status-dot on"></span><b>Trabajando</b>' : '<span class="status-dot"></span><b>En pausa</b>', "</div></section>\n  ").concat(confidenceCard(), "\n  <section class=\"card guide\"><h2>\uD83E\uDDED \u00BFQu\u00E9 hay en cada parte? <span class=\"more note\">toca para ir</span></h2><div class=\"gtiles\">").concat(__spreadArray([
                        ['#bolsa', '🧑', 'Mi dinero', 'TU parte: inviertes tú con dinero de práctica para probar.'],
                        ['#cuentas', '🤖', 'Dinero de la IA', 'La parte de la IA: invierte sola. Mira en qué, cuánto ganó o perdió y con cuánto queda.'],
                        ['#mapa', '🗺️', 'Mapa', 'Todas las empresas por color: recomendadas, en observación y no recomendadas.'],
                        ['#recomendaciones', '⭐', 'Recomendaciones', 'Las mejores ideas de hoy, con su nota y por qué.'],
                        ['#buscar', '🔍', 'Buscar', 'Busca cualquier empresa y JARVIS te dice si conviene.'],
                        ['#loterias', '🎱', 'Loterías', 'Próximos sorteos, el número de JARVIS y si acertó o no.'],
                        ['#aprendizaje', '🧠', 'Aprendizaje', 'Qué ideas probó, cuáles funcionan, monedas y trampas.'],
                        ['#historial', '📜', 'Historial', 'Todo lo que recomendó antes y cómo le fue de verdad.'],
                        ['#potenciador', '⚡', 'Potenciador', 'Créditos extra para usar más la inteligencia artificial.'],
                        ['#tv', '📺', 'Modo TV', 'Pantalla grande con todo en vivo, para dejarla prendida.']
                    ], __read(((ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? [['#ajustes', '⚙️', 'Ajustes', 'Usuarios, claves, copia en Google Drive, marca y el núcleo.']] : [])), false).map(function (_a) {
                        var _b = __read(_a, 4), h = _b[0], i = _b[1], t = _b[2], d = _b[3];
                        return "<a class=\"gt\" href=\"".concat(h, "\"><span>").concat(i, "</span><b>").concat(t, "</b><small>").concat(d, "</small></a>");
                    }).join(''), "</div></section>\n  <section class=\"card\" id=\"votelog\"><h2>\uD83D\uDDF3\uFE0F Registro de votos <span class=\"more note\">lo que vot\u00F3 JARVIS y lo que pas\u00F3 de verdad</span></h2><div class=\"note\">Cargando\u2026</div></section>\n  ").concat(focusShell(), "\n\n  <section class=\"grid g4\">\n    <div class=\"card kpi\" style=\"--c:#38d6f5\"><div class=\"l\">Tu dinero de pr\u00E1ctica</div><div class=\"v\">").concat(usd(h.account.total), "</div><div class=\"s\"><span class=\"").concat(cls(h.account.returnPct), "\">").concat(pct(h.account.returnPct, 2), "</span> desde ").concat(usd(h.account.start, 0)).concat(h.account.spy ? " \u00B7 el ".concat(term('SPY', 'mercado'), " hoy ").concat(pct(h.account.spy.changePct, 2)) : '', "</div></div>\n    <div class=\"card kpi\" style=\"--c:#2fd58a\"><div class=\"l\">JARVIS acierta</div><div class=\"v\">").concat(p.hitRate != null ? Math.round(p.hitRate / 10) + ' de 10' : '—', "</div><div class=\"s\">").concat(p.hits, " aciertos y ").concat(p.misses, " fallos (").concat(p.hitRate != null ? p.hitRate + '%' : '—', ") \u00B7 ").concat(p.pending, " esperando resultado</div></div>\n    <div class=\"card kpi\" style=\"--c:#ffbf3c\"><div class=\"l\">Racha</div><div class=\"v\">").concat(p.streak.current || 0, "</div><div class=\"s\">").concat(p.streak.type ? (p.streak.type === 'acierto' ? 'aciertos seguidos' : 'fallos seguidos') : 'sin datos', " \u00B7 r\u00E9cord ").concat(p.streak.bestHits, " aciertos</div></div>\n    <div class=\"card kpi\" style=\"--c:#a98bff\"><div class=\"l\">Monedas del mejor agente</div><div class=\"v\">").concat(leader ? leader.coins : 0, "</div><div class=\"s\">").concat(leader ? esc(leader.name) : '—').concat((leader === null || leader === void 0 ? void 0 : leader.week) != null ? " \u00B7 ".concat(leader.week >= 0 ? '+' : '').concat(leader.week, " esta semana") : '', " \u00B7 trampas: ").concat(h.cheats.length, "</div></div>\n  </section>\n\n  ").concat((ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' && h.setup.some(function (x) { return !x.ok; }) ? "<details class=\"card setup\"><summary><span class=\"prog-ring\" style=\"--p:".concat(Math.round(h.setup.filter(function (x) { return x.ok; }).length / h.setup.length * 100), "\"></span><b>Instalaci\u00F3n: ").concat(h.setup.filter(function (x) { return x.ok; }).length, " de ").concat(h.setup.length, " pasos listos</b><span class=\"note\">Toca para ver qu\u00E9 falta (solo t\u00FA lo ves)</span></summary>\n    <div class=\"grid g3\" style=\"gap:10px;margin-top:12px\">").concat(h.setup.map(function (x) { return "<div class=\"pbox\" style=\"opacity:".concat(x.ok ? .6 : 1, "\"><b class=\"").concat(x.ok ? 'good' : '', "\">").concat(x.ok ? '✓' : '○', " ").concat(esc(x.text), "</b>").concat(x.ok ? '' : "<div class=\"note\">".concat(esc(x.how), "</div>"), "</div>"); }).join(''), "</div></details>") : '', "\n  ").concat(oppCard(h.opportunities), "\n  ").concat(goalCard(h.opportunities), "\n\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>Ranking de hoy <a class=\"more\" href=\"#recomendaciones\">Ver todas \u25B8</a></h2>").concat(rankingTable(h.ranking, true), "</div>\n    <div class=\"card\"><h2>Preg\u00FAntale a JARVIS</h2>\n      <form class=\"ask\" id=\"ask\"><input id=\"q\" placeholder=\"\u00BFPor qu\u00E9 me recomiendas Microsoft? \u00BFC\u00F3mo voy este mes?\" maxlength=\"500\"><button type=\"button\" class=\"btn ghost\" id=\"mic\" title=\"Preguntar con la voz\">\uD83C\uDFA4</button><button class=\"btn\">Preguntar</button></form>\n      <label class=\"note\" style=\"flex-direction:row;align-items:center;gap:6px;margin-top:6px\"><input type=\"checkbox\" id=\"speak\" style=\"width:auto\"> Leer la respuesta en voz alta</label>\n      <div id=\"ans\"></div>\n      <h2 style=\"margin-top:18px\">Qu\u00E9 est\u00E1 haciendo ahora</h2>").concat(feed(h.activity.slice(0, 12)), "</div>\n  </section>\n\n  <section class=\"grid g3\">\n    <div class=\"card\"><h2>Lo que aprendi\u00F3 <a class=\"more\" href=\"#aprendizaje\">Detalle \u25B8</a></h2>\n      <div class=\"mini3\">").concat(['en_prueba', 'validada', 'no_validada'].map(function (s) { return "<div><div class=\"note\">".concat(STATUS[s], "</div><div style=\"font-size:24px;font-weight:800\">").concat(h.learning.byStatus[s] || 0, "</div></div>"); }).join(''), "</div>\n      <div class=\"note\" style=\"margin-top:8px\">").concat(h.learning.experiments, " experimentos con datos bajo llave. ").concat(h.rankingStats.resolved ? "Recomendaciones calificadas: ".concat(h.rankingStats.hits, " de ").concat(h.rankingStats.resolved, " acertadas.") : 'Las recomendaciones se califican a los 20 días de bolsa.', "</div></div>\n    <div class=\"card\"><h2>Liga de agentes <span class=\"more note\">ganan monedas si ganan dinero</span></h2>").concat(h.league.map(function (a) { return "<div class=\"w\" style=\"margin-bottom:8px\"><span>".concat(esc(a.name), "</span><b>").concat(a.coins, "</b><div class=\"bar\"><span style=\"width:").concat(Math.max(4, Math.min(100, 50 + a.coins * 2)), "%;background:linear-gradient(90deg,#a98bff,#38d6f5)\"></span></div></div>"); }).join(''), "</div>\n    <div class=\"card").concat(((_b = (_a = ME === null || ME === void 0 ? void 0 : ME.profile) === null || _a === void 0 ? void 0 : _a.interests) === null || _b === void 0 ? void 0 : _b.loterias) === false ? ' hide' : '', "\"><h2>Loter\u00EDas RD <a class=\"more\" href=\"#loterias\">Ver \u25B8</a></h2>\n      <div class=\"mini3\"><div><div class=\"note\">Jugadas</div><b style=\"font-size:22px\">").concat(h.lottery.stats.settled, "</b></div><div><div class=\"note\">Volvi\u00F3 de lo jugado</div><b style=\"font-size:22px\" class=\"").concat(h.lottery.stats.per100 != null && h.lottery.stats.per100 < 100 ? 'bad' : '', "\">").concat(h.lottery.stats.per100 != null ? Math.round(h.lottery.stats.per100) + '%' : '—', "</b></div><div><div class=\"note\">Lo normal a largo plazo</div><b style=\"font-size:22px\">").concat(h.lottery.expectedQuinielaPer100 != null ? Math.round(h.lottery.expectedQuinielaPer100) + '%' : '—', "</b></div></div>\n      <div class=\"note\" style=\"margin-top:8px\">").concat(h.lottery.effort === 'bajo' ? 'Ningún método le gana al azar: esfuerzo reducido, prioridad a la bolsa.' : 'Probando métodos contra el azar en cada sorteo.', "</div></div>\n  </section>\n  ").concat(footLine())];
        }
    });
}); };
views.inicio.after = function () {
    bindOpp();
    bindGoal();
    focusInit();
    api('/api/votes/recent').then(function (v) {
        var el = $('#votelog');
        if (!el)
            return;
        el.innerHTML = "<h2>\uD83D\uDDF3\uFE0F Registro de votos <span class=\"more note\">lo que vot\u00F3 JARVIS y lo que pas\u00F3 de verdad</span></h2>\n      <div class=\"note\" style=\"margin-bottom:6px\">Cada voto se sella antes y se califica a los 21 d\u00EDas h\u00E1biles con precios reales. Acierto = +1 moneda, fallo = \u22121 (as\u00ED adivinar no da monedas). Esta semana: <b class=\"".concat(v.coinsWeek >= 0 ? 'good' : 'bad', "\">").concat(v.coinsWeek >= 0 ? '+' : '').concat(v.coinsWeek, " monedas</b> \u00B7 ").concat(v.pending, " votos esperando resultado.</div>\n      ").concat(v.list.length ? "<div class=\"vlog\">".concat(v.list.slice(0, 8).map(function (x) { return "<div class=\"vl ".concat(x.ok ? 'ok' : 'no', "\"><span class=\"vi\">").concat(x.ok ? '✓' : '✕', "</span><div><b>").concat(esc(x.symbol), "</b>: vot\u00F3 \"").concat(esc(x.claim), "\" \u00B7 <span class=\"").concat((x.ret || 0) >= 0 ? 'good' : 'bad', "\">").concat(x.ret != null ? (x.ret >= 0 ? '+' : '') + (x.ret * 100).toFixed(1) + '%' : '', "</span> <span class=\"note\">contra ").concat(x.bench != null ? (x.bench * 100).toFixed(1) + '%' : '—', " del mercado \u00B7 ").concat(esc(x.end || ''), "</span></div><span class=\"vc ").concat(x.ok ? 'good' : 'bad', "\">").concat(x.ok ? '+1' : '−1', "</span></div>"); }).join(''), "</div><a class=\"note\" href=\"#historial\">Ver todo el historial \u25B8</a>") : '<div class="empty">Todavía no hay votos calificados. El primero se califica 21 días hábiles después de que empezó.</div>');
    }).catch(function () { });
    $('#ask').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var q, r, u, err_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    q = $('#q').value.trim();
                    if (!q)
                        return [2];
                    $('#ans').innerHTML = '<div class="answer muted">Pensando…</div>';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/ask', { method: 'POST', body: { question: q } })];
                case 2:
                    r = _a.sent();
                    $('#ans').innerHTML = "<div class=\"answer\">".concat(esc(r.answer)).concat(r.provider && (ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? "<div class=\"note\" style=\"margin-top:6px\">Respondi\u00F3: ".concat(esc(r.provider), "</div>") : '', "</div>");
                    if ($('#speak').checked && 'speechSynthesis' in window) {
                        u = new SpeechSynthesisUtterance(r.answer);
                        u.lang = 'es-ES';
                        speechSynthesis.cancel();
                        speechSynthesis.speak(u);
                    }
                    return [3, 4];
                case 3:
                    err_4 = _a.sent();
                    $('#ans').innerHTML = "<div class=\"answer msg err\">".concat(esc(err_4.message), "</div>");
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); };
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        $('#mic').title = 'Tu navegador no permite dictar; usa Chrome o Safari.';
        $('#mic').disabled = true;
        return;
    }
    $('#mic').onclick = function () {
        var rec = new SR();
        rec.lang = 'es-DO';
        rec.interimResults = true;
        $('#mic').textContent = '● Escuchando';
        $('#speak').checked = true;
        rec.onresult = function (e) { $('#q').value = __spreadArray([], __read(e.results), false).map(function (x) { return x[0].transcript; }).join(''); if (e.results[e.results.length - 1].isFinal)
            $('#ask').requestSubmit(); };
        rec.onend = function () { $('#mic').textContent = '🎤'; };
        rec.onerror = function (ev) { $('#mic').textContent = '🎤'; $('#ans').innerHTML = "<div class=\"answer msg err\">No pude escuchar (".concat(esc(ev.error), "). Revisa el permiso del micr\u00F3fono.</div>"); };
        rec.start();
    };
};
function oppCard(list) {
    if (!(list === null || list === void 0 ? void 0 : list.length))
        return '';
    return "<section class=\"card\"><h2>\u00BFCu\u00E1nto puedes ganar? <span class=\"more note\">calculado con 3 a\u00F1os de precios reales \u00B7 no es promesa</span></h2>\n    <div class=\"row\" style=\"align-items:flex-end;margin-bottom:12px\"><label style=\"width:220px\">\u00BFCu\u00E1nto piensas invertir? (US$)<input id=\"oppamt\" type=\"number\" min=\"1\" step=\"1\" value=\"".concat(baseAmt('verde') || 10, "\"></label>\n    <div class=\"note\" style=\"flex:1\">M\u00EDnimo para entrar: <b>US$").concat(list[0].minimum, "</b>").concat(list[0].fixedCostUsd ? " \u00B7 para que los costos (US$".concat(list[0].fixedCostUsd, ") no se coman la ganancia: <b>US$").concat(list[0].minimumWorth, "</b>") : '', ". Cambia el monto y los n\u00FAmeros se recalculan.</div></div>\n    <div class=\"grid g3\">").concat(list.map(function (o, i) {
        var _a, _b, _c;
        return "<div class=\"pbox\" style=\"padding:14px\">\n      <div style=\"display:flex;align-items:center;gap:10px\">".concat(coBadge(o.symbol, 36), "<a href=\"#analisis/").concat(esc(o.symbol), "\" style=\"font-size:18px;font-weight:800;color:#e8eefc\">").concat(esc(coName(o.symbol)), "</a><span style=\"margin-left:auto\">").concat(light(o.light), "</span></div>\n      ").concat(o.probBeat != null ? "<div style=\"margin-top:8px\">".concat(chanceDots(o.probBeat), "</div>") : '', "\n      <div style=\"margin:10px 0 4px;font-size:13px;color:#8a97b5\">Lo m\u00E1s probable que ganes <b style=\"color:#e8eefc\">si la dejas ").concat(esc(o.horizonLabel || "".concat(o.months, " meses")), "</b></div>\n      <div style=\"display:flex;align-items:baseline;gap:10px\"><span class=\"opp-v ").concat(cls(o.pct.probable), "\" data-p=\"").concat(o.pct.probable, "\" style=\"font-size:30px;font-weight:800\"></span><span class=\"").concat(cls(o.pct.probable), "\" style=\"font-weight:700\">").concat(pct(o.pct.probable), "</span></div>\n      ").concat(o.monthlyPct != null ? "<div class=\"opp-m\">\uD83D\uDCC5 \u2248 <b class=\"opp-v ".concat(cls(o.monthlyPct), "\" data-p=\"").concat(o.monthlyPct, "\"></b> <b>por mes</b> en promedio <span class=\"note\">(").concat(pct(o.monthlyPct, 2), " al mes; unos meses sube m\u00E1s, otros baja)</span></div>") : '', "\n      <div class=\"mini3\" style=\"margin-top:8px\"><div><div class=\"note\">Caso malo</div><b class=\"opp-v ").concat(cls(o.pct.bad), "\" data-p=\"").concat(o.pct.bad, "\"></b><div class=\"note\">").concat(pct(o.pct.bad), "</div></div>\n      <div><div class=\"note\">Caso bueno</div><b class=\"opp-v ").concat(cls(o.pct.good), "\" data-p=\"").concat(o.pct.good, "\"></b><div class=\"note\">").concat(pct(o.pct.good), "</div></div>\n      <div><div class=\"note\">Chance de perder</div><b>").concat(Math.round(o.lossChance * 100), "%</b></div></div>\n      ").concat(((_a = o.byTime) === null || _a === void 0 ? void 0 : _a.length) ? "<div class=\"opp-t\"><div class=\"note\" style=\"margin-bottom:4px\">\u23F1\uFE0F Seg\u00FAn cu\u00E1nto tiempo la dejes (lo m\u00E1s probable \u00B7 chance de perder):</div><table>".concat(o.byTime.map(function (t) { return "<tr".concat(t.label === o.horizonLabel ? ' class="on"' : '', "><td>").concat(esc(t.label), "</td><td class=\"r\"><b class=\"opp-v ").concat(cls(t.probable), "\" data-p=\"").concat(t.probable, "\"></b> <span class=\"note\">(").concat(pct(t.probable), ")</span></td><td class=\"r note\">pierde ").concat(Math.round(t.lossChance * 100), "%</td></tr>"); }).join(''), "</table>").concat(((_b = o.byTime.at(-1)) === null || _b === void 0 ? void 0 : _b.market) != null ? "<div class=\"note\" style=\"margin-top:4px\">El mercado entero, en 1 a\u00F1o: ".concat(pct(o.byTime.at(-1).market), "</div>") : '', "</div>") : '', "\n      ").concat(o.timing ? "<div style=\"margin-top:10px\">".concat(patience(o.timing, o.light), " <span class=\"note\">").concat(((_c = o.timing.toTarget) === null || _c === void 0 ? void 0 : _c.median) != null ? "Subir 5% tard\u00F3 normalmente ".concat(humanDays(o.timing.toTarget.median), ".") : '', "</span></div>") : '', "\n      <div class=\"note\" style=\"margin-top:8px\">").concat(esc(o.why), "</div></div>");
    }).join(''), "</div></section>");
}
function goalCard(list) {
    var _a, _b;
    if (!(list === null || list === void 0 ? void 0 : list.length))
        return '';
    var best = list.filter(function (o) { return o.monthlyPct != null; }).sort(function (a, b) { return b.monthlyPct - a.monthlyPct; })[0];
    var mY = (_a = list.find(function (o) { var _a, _b; return ((_b = (_a = o.byTime) === null || _a === void 0 ? void 0 : _a.at(-1)) === null || _b === void 0 ? void 0 : _b.market) != null; })) === null || _a === void 0 ? void 0 : _a.byTime.at(-1).market;
    var mkt = mY != null ? (Math.pow(1 + mY / 100, 1 / 12) - 1) * 100 : 0.8;
    return "<section class=\"card goal\" data-best=\"".concat((_b = best === null || best === void 0 ? void 0 : best.monthlyPct) !== null && _b !== void 0 ? _b : 1, "\" data-bsym=\"").concat(esc((best === null || best === void 0 ? void 0 : best.symbol) || ''), "\" data-mkt=\"").concat(mkt.toFixed(3), "\"><h2>\uD83C\uDFAF \u00BFPuedo llegar a mi meta? <span class=\"more note\">la cuenta honesta</span></h2>\n    <div class=\"row\" style=\"gap:10px;flex-wrap:wrap\"><label style=\"width:150px\">Empiezo con (US$)<input id=\"g-a\" type=\"number\" min=\"1\" value=\"100\"></label><label style=\"width:150px\">Quiero llegar a (US$)<input id=\"g-g\" type=\"number\" min=\"1\" value=\"6000\"></label><label style=\"width:120px\">En (meses)<input id=\"g-m\" type=\"number\" min=\"1\" max=\"120\" value=\"5\"></label><label style=\"width:170px\">Puedo a\u00F1adir cada mes (US$)<input id=\"g-c\" type=\"number\" min=\"0\" value=\"0\"></label></div>\n    <div id=\"g-out\" style=\"margin-top:10px\"></div></section>");
}
function bindGoal() {
    var box = document.querySelector('.goal');
    if (!box)
        return;
    var best = Number(box.dataset.best) / 100, mkt = Number(box.dataset.mkt) / 100, bsym = box.dataset.bsym;
    var fv = function (a, c, r, m) { return a * Math.pow(1 + r, m) + (r ? c * (Math.pow(1 + r, m) - 1) / r : c * m); };
    var upd = function () {
        var a = Math.max(1, +$('#g-a').value || 0), g = Math.max(1, +$('#g-g').value || 0), m = Math.max(1, Math.min(120, +$('#g-m').value || 1)), c = Math.max(0, +$('#g-c').value || 0);
        var lo = -0.5, hi = 20;
        for (var i = 0; i < 80; i++) {
            var mid = (lo + hi) / 2;
            if (fv(a, c, mid, m) < g)
                lo = mid;
            else
                hi = mid;
        }
        var need = hi, withBest = fv(a, c, best, m), withMkt = fv(a, c, mkt, m);
        var needStart = (g - (best ? c * (Math.pow(1 + best, m) - 1) / best : c * m)) / Math.pow(1 + best, m);
        var needAdd = best ? (g - a * Math.pow(1 + best, m)) * best / (Math.pow(1 + best, m) - 1) : (g - a) / m;
        var ratio = need / Math.max(best, 0.001);
        var tone = need <= best ? 'good' : ratio <= 3 ? 'warn' : 'bad';
        var verdict = need <= best ? '✅ <b>Es posible</b> con lo que JARVIS ve hoy (no es seguro, pero es realista).'
            : ratio <= 3 ? '⚠️ <b>Muy difícil.</b> Haría falta ganar bastante más que la mejor idea de JARVIS, todos los meses, sin un mal mes.'
                : "\u274C <b>No es realista</b> solo invirtiendo: har\u00EDa falta ganar <b>".concat((need * 100).toFixed(0), "% cada mes</b>. Los mejores inversionistas del mundo ganan cerca de 20% a 30% <b>al a\u00F1o</b>. Lo que promete eso en pocos meses (opciones, apalancamiento, cripto de moda, \"se\u00F1ales\") casi siempre termina en perder todo.");
        $('#g-out').innerHTML = "<div class=\"answer ".concat(tone, "\">").concat(verdict, "</div>\n      <div class=\"grid g3\" style=\"gap:10px;margin-top:10px\">\n        <div class=\"pbox\"><div class=\"l\">Har\u00EDa falta ganar</div><div class=\"v ").concat(tone, "\">").concat((need * 100).toFixed(1), "% al mes</div><div class=\"note\">todos los meses, ").concat(m, " meses seguidos</div></div>\n        <div class=\"pbox\"><div class=\"l\">Con la mejor idea de hoy").concat(bsym ? " (".concat(esc(bsym), ")") : '', "</div><div class=\"v\">").concat(usd(withBest), "</div><div class=\"note\">\u2248 ").concat((best * 100).toFixed(2), "% al mes (lo m\u00E1s probable)</div></div>\n        <div class=\"pbox\"><div class=\"l\">Con el mercado entero</div><div class=\"v\">").concat(usd(withMkt), "</div><div class=\"note\">\u2248 ").concat((mkt * 100).toFixed(2), "% al mes en promedio</div></div></div>\n      ").concat(need > best ? "<div class=\"note\" style=\"margin-top:10px\"><b>Qu\u00E9 har\u00EDa falta de verdad para llegar a ".concat(usd(g, 0), " en ").concat(m, " meses</b> (con la mejor idea de hoy):<br>\u2022 Empezar con unos <b>").concat(usd(Math.max(0, needStart), 0), "</b>").concat(c ? " (y seguir a\u00F1adiendo ".concat(usd(c, 0), " al mes)") : '', ", <b>o</b><br>\u2022 A\u00F1adir unos <b>").concat(usd(Math.max(0, needAdd), 0), " cada mes</b> a tus ").concat(usd(a, 0), ".<br>En la bolsa el dinero crece con <b>m\u00E1s dinero y m\u00E1s tiempo</b>; lo que m\u00E1s r\u00E1pido sube lo que inviertes es lo que ganas con tu trabajo o tu negocio.</div>") : '');
    };
    ['#g-a', '#g-g', '#g-m', '#g-c'].forEach(function (id) { $(id).oninput = upd; });
    upd();
}
function bindOpp() {
    var inp = $('#oppamt');
    if (!inp)
        return;
    var upd = function () { var a = Math.max(0, Number(inp.value) || 0); document.querySelectorAll('.opp-v').forEach(function (el) { var v = a * Number(el.dataset.p) / 100; el.textContent = (v >= 0 ? '+' : '') + usd(v); }); };
    inp.oninput = upd;
    upd();
}
function mainReason(c) {
    var w = function (r) { var _a, _b, _c; return (_c = (_b = (_a = c.contributions) === null || _a === void 0 ? void 0 : _a.find(function (x) { return x.factor === r.factor; })) === null || _b === void 0 ? void 0 : _b.contribution) !== null && _c !== void 0 ? _c : 0; };
    if (c.light === 'rojo')
        return c.reasons.find(function (r) { return r.factor === 'calibracion'; }) || c.reasons.slice().sort(function (a, b) { return w(a) - w(b); })[0];
    return c.reasons.filter(function (r) { return r.factor !== 'calibracion'; }).sort(function (a, b) { return w(b) - w(a); })[0];
}
function rankingTable(list, compact) {
    if (compact === void 0) { compact = false; }
    if (!(list === null || list === void 0 ? void 0 : list.length))
        return '<div class="empty">El ranking aparece cuando JARVIS tenga precios de al menos 6 meses. Activa el motor o pulsa "Correr ciclo ahora" en Ajustes.</div>';
    return "<div class=\"tablewrap\"><table class=\"rank\"><tr><th>Empresa</th><th>\u00BFInvierto?</th><th>\u00BFQu\u00E9 tan seguido gana?</th>".concat(compact ? '' : "<th>Si pones ".concat(usd(baseAmt('verde'), 0), "</th>"), "<th></th></tr>\n  ").concat(list.map(function (c) {
        var _a, _b, _c;
        return "<tr class=\"click\" data-go=\"#analisis/".concat(esc(c.symbol), "\"><td>").concat(coCell(c.symbol, usd((_a = c.price) === null || _a === void 0 ? void 0 : _a.value)), "</td><td>").concat(light(c.light)).concat(compact ? "<div style=\"margin-top:6px\">".concat(patience(c.timing, c.light), "</div>") : "<div style=\"margin-top:6px;font-weight:700\">".concat(esc(VERDICT[c.light]), "</div><div class=\"note\" style=\"max-width:260px\">Porque: ").concat(esc(((_b = mainReason(c)) === null || _b === void 0 ? void 0 : _b.text) || ''), "</div>"), "</td>\n  <td>").concat(chanceDots(c.probBeat), "</td>\n  ").concat(compact ? '' : "<td>".concat(moneyRange(baseAmt('verde'), scaleProj((_c = c.projection) === null || _c === void 0 ? void 0 : _c.personal, baseAmt('verde'))), "<div style=\"margin-top:6px\">").concat(patience(c.timing, c.light), "</div></td>"), "\n  <td class=\"r\"><a class=\"btn ghost sm\" href=\"#analisis/").concat(esc(c.symbol), "\" onclick=\"event.stopPropagation()\">Ver por qu\u00E9 \u25B8</a>").concat(compact ? '' : c.debateId ? "<div style=\"margin-top:6px\"><a href=\"#debate/".concat(c.debateId, "\" onclick=\"event.stopPropagation()\" class=\"note\">Debate de las IA \u25B8</a></div>") : (ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' && c.light !== 'rojo' ? "<div style=\"margin-top:6px\"><button class=\"btn ghost sm\" data-debate=\"".concat(esc(c.symbol), "\">Que debatan las IA</button></div>") : '', "</td></tr>");
    }).join(''), "</table></div>");
}
var ZL = { recomendada: ['✅', 'Te recomiendo', 'good'], observacion: ['👀', 'En observación', 'warn'], no_recomendada: ['⛔', 'No te recomiendo', 'bad'], candidata: ['🔭', 'Explorando', 'mute'], descartada: ['📦', 'Fuera del mapa', 'mute'] };
function mapScatter(items) {
    var pts = items.filter(function (r) { var _a, _b; return ((_b = (_a = r.card) === null || _a === void 0 ? void 0 : _a.projection) === null || _b === void 0 ? void 0 : _b.personal) && r.card.probBeat != null; });
    if (pts.length < 2)
        return '';
    var W = 760, H = 330, L = 56, R = 20, T = 20, B = 44;
    var ys = pts.map(function (r) { return r.card.projection.personal.probable; }), ymin = Math.min.apply(Math, __spreadArray([-0.5], __read(ys), false)) - 0.3, ymax = Math.max.apply(Math, __spreadArray([0.5], __read(ys), false)) + 0.3;
    var x = function (p) { return L + (Math.max(0.3, Math.min(0.7, p)) - 0.3) / 0.4 * (W - L - R); }, y = function (v) { return T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B); };
    var col = { recomendada: '#2fd58a', observacion: '#ffbf3c', no_recomendada: '#ff5d6c' };
    return "<svg viewBox=\"0 0 ".concat(W, " ").concat(H, "\" width=\"100%\" role=\"img\" aria-label=\"Mapa: chance de ganarle al mercado contra ganancia probable\">\n    <rect x=\"").concat(x(0.5), "\" y=\"").concat(T, "\" width=\"").concat(W - R - x(0.5), "\" height=\"").concat(y(0) - T, "\" fill=\"rgba(47,213,138,.12)\" rx=\"10\"/>\n    <rect x=\"").concat(L, "\" y=\"").concat(y(0), "\" width=\"").concat(x(0.5) - L, "\" height=\"").concat(H - B - y(0), "\" fill=\"rgba(255,93,108,.12)\" rx=\"10\"/>\n    <text x=\"").concat(W - R - 10, "\" y=\"").concat(T + 18, "\" text-anchor=\"end\" font-size=\"13\" font-weight=\"800\" fill=\"#2fd58a\">\u2705 La mejor zona</text>\n    <text x=\"").concat(L + 10, "\" y=\"").concat(H - B - 10, "\" font-size=\"13\" font-weight=\"800\" fill=\"#ff5d6c\">\u26D4 Evitar</text>\n    <line x1=\"").concat(x(0.5), "\" x2=\"").concat(x(0.5), "\" y1=\"").concat(T, "\" y2=\"").concat(H - B, "\" stroke=\"#8a97b5\" stroke-dasharray=\"4 4\"/><line x1=\"").concat(L, "\" x2=\"").concat(W - R, "\" y1=\"").concat(y(0), "\" y2=\"").concat(y(0), "\" stroke=\"#8a97b5\" stroke-dasharray=\"4 4\"/>\n    <text x=\"").concat((L + W - R) / 2, "\" y=\"").concat(H - 10, "\" text-anchor=\"middle\" font-size=\"12\" fill=\"#8a97b5\">\u2190 menos veces \u00B7 De cada 10 veces, cu\u00E1ntas le gana al mercado \u00B7 m\u00E1s veces \u2192</text>\n    <text x=\"14\" y=\"").concat((T + H - B) / 2, "\" font-size=\"12\" fill=\"#8a97b5\" transform=\"rotate(-90 14 ").concat((T + H - B) / 2, ")\" text-anchor=\"middle\">Ganancia probable con US$10 en 6 meses</text>\n    <text x=\"").concat(L - 6, "\" y=\"").concat(y(0) + 4, "\" text-anchor=\"end\" font-size=\"11\" fill=\"#8a97b5\">US$0</text>\n    ").concat(pts.map(function (r) { var p = r.card.projection.personal.probable; return "<a href=\"#analisis/".concat(esc(r.symbol), "\"><g><circle cx=\"").concat(x(r.card.probBeat), "\" cy=\"").concat(y(p), "\" r=\"20\" fill=\"").concat(col[r.zone], "\" opacity=\".9\" stroke=\"#0e1527\" stroke-width=\"3\"><title>").concat(esc(coName(r.symbol)), ": ").concat(esc(r.verdict), " \u00B7 ").concat(Math.round(r.card.probBeat * 10), " de 10 \u00B7 ").concat(p >= 0 ? '+' : '').concat(usd(p), "</title></circle><text x=\"").concat(x(r.card.probBeat), "\" y=\"").concat(y(p) + 4, "\" text-anchor=\"middle\" font-size=\"").concat(r.symbol.length > 3 ? 9.5 : 11, "\" font-weight=\"800\" fill=\"#fff\">").concat(esc(r.symbol), "</text></g></a>"); }).join(''), "\n  </svg>");
}
function mapCard(r, compact) {
    var _a, _b, _c;
    if (compact === void 0) { compact = false; }
    var _d = __read(ZL[r.zone] || ZL.candidata, 3), ic = _d[0], tone = _d[2];
    var verdict = r.zone === 'candidata' || r.zone === 'descartada' ? "Si estuviera en el mapa: ".concat(r.verdict.charAt(0).toLowerCase()).concat(r.verdict.slice(1)) : r.verdict;
    return "<div class=\"mcard ".concat(tone, "\"><div class=\"mc-h\">").concat(r.rank ? "<span class=\"rk\">#".concat(r.rank, "</span>") : '').concat(coBadge(r.symbol, 36), "<div style=\"min-width:0;flex:1\"><b>").concat(esc(coName(r.symbol)), "</b><div class=\"note\">").concat(esc(r.symbol)).concat(((_a = r.card.price) === null || _a === void 0 ? void 0 : _a.value) ? ' · ' + usd(r.card.price.value) : '', "</div></div>").concat(r.trend ? "<span class=\"trend ".concat(r.trend, "\">").concat(r.trend === 'sube' ? '↑ subió' : '↓ bajó', "</span>") : '', "</div>\n    <div class=\"conv\"><span style=\"width:").concat(Math.max(3, r.conv), "%\"></span></div><div class=\"note\">Qu\u00E9 tanto te conviene: <b>").concat(r.conv, "/100</b></div>\n    <div class=\"mc-v ").concat(tone, "\">").concat(ic, " ").concat(esc(verdict), "</div>\n    <div class=\"mc-s\"><b>Por qu\u00E9:</b><ul>").concat(r.why.map(function (w) { return "<li>".concat(esc(w), "</li>"); }).join(''), "</ul></div>\n    ").concat(((_b = r.need) === null || _b === void 0 ? void 0 : _b.length) && r.zone !== 'candidata' ? "<div class=\"mc-s\"><b>Para que te la recomiende necesita:</b><ul>".concat(r.need.map(function (w) { return "<li>".concat(esc(w), "</li>"); }).join(''), "</ul></div>") : '', "\n    ").concat((r.zone === 'recomendada' || r.zone === 'observacion') && !compact ? "<div class=\"mc-s\">\u23F3 ".concat(esc(r.hold), "</div>").concat(r.size ? "<div class=\"mc-s\"><b>\u00BFPuedo poner m\u00E1s?</b> ".concat(esc(r.size.more), "</div>") : '') : '', "\n    ").concat(((_c = r.exitIf) === null || _c === void 0 ? void 0 : _c.length) && !compact && r.zone !== 'candidata' ? "<div class=\"mc-s note\"><b>La saco si:</b> ".concat(esc(r.exitIf[0]), "</div>") : '', "\n    <div class=\"mc-f note\">").concat(r.zone === 'no_recomendada' && r.reds ? "".concat(r.reds, " revisi\u00F3n").concat(r.reds > 1 ? 'es' : '', " seguida").concat(r.reds > 1 ? 's' : '', " aqu\u00ED \u00B7 ") : '').concat(r.zone === 'candidata' ? "estudiada ".concat(esc(r.checkedAt)) : "desde ".concat(esc(r.since))).concat(r.active ? " \u00B7 <a href=\"#analisis/".concat(esc(r.symbol), "\">An\u00E1lisis completo \u25B8</a>") : '', "</div></div>");
}
var dt = function (iso) { return iso ? new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }) : '—'; };
var flow = function (steps) { return "<div class=\"flow\">".concat(steps.map(function (_a) {
    var _b = __read(_a, 4), l = _b[0], v = _b[1], cls = _b[2], sub = _b[3];
    return "<div class=\"fl ".concat(cls || '', "\"><small>").concat(l, "</small><b>").concat(v, "</b>").concat(sub ? "<i>".concat(sub, "</i>") : '', "</div>");
}).join('<span class="fla">→</span>'), "</div>"); };
function iaStateHtml(B) {
    var _a, _b, _c;
    var L = B.lastStep, when = function (iso) { return new Date(iso).toLocaleString('es-DO', { weekday: 'long', hour: 'numeric', minute: '2-digit' }); };
    var SK = { 'sin precio actual': 'todavía no hay precio de hoy', 'mercado bajista': 'el mercado entero va bajando' };
    var t;
    if (!B.marketOpen)
        t = "\uD83C\uDF19 <b>La bolsa est\u00E1 cerrada.</b> La IA revisa cada hora mientras la bolsa est\u00E1 abierta. ".concat(B.nextOpen ? "Pr\u00F3xima revisi\u00F3n: <b>".concat(when(B.nextOpen), "</b> (hora RD).") : '', " ").concat(B.regime === 'bajista' ? '🛡️ Ahora el mercado entero va bajando: si sigue así, esperará antes de comprar.' : B.plan.length ? "Al abrir piensa comprar: <b>".concat(B.plan.map(function (p) { return esc(p.symbol); }).join(', '), "</b>.") : '');
    else
        t = "\uD83D\uDFE2 <b>La bolsa est\u00E1 abierta y la IA est\u00E1 trabajando.</b> Revisa cada hora.";
    if (L === null || L === void 0 ? void 0 : L.at)
        t += "<br>\u00DAltima revisi\u00F3n: <b>".concat(timeAgo(L.at), "</b>: ").concat(((_a = L.bought) === null || _a === void 0 ? void 0 : _a.length) ? "compr\u00F3 ".concat(L.bought.map(esc).join(', ')) : 'no compró nada').concat(((_b = L.sold) === null || _b === void 0 ? void 0 : _b.length) ? ", vendi\u00F3 ".concat(L.sold.map(esc).join(', ')) : '').concat(((_c = L.skipped) === null || _c === void 0 ? void 0 : _c.length) ? " \u00B7 esper\u00F3 con ".concat(L.skipped.slice(0, 4).map(function (x) { return "".concat(esc(x.symbol === '*' ? 'todas' : x.symbol), " (").concat(esc(SK[x.why] || x.why), ")"); }).join(', ')) : '', ".");
    else
        t += '<br>Todavía no ha hecho su primera revisión con la bolsa abierta.';
    return "<div class=\"iastate\">\uD83E\uDD16 <b>Qu\u00E9 est\u00E1 haciendo la IA ahora</b><br>".concat(t, "</div>");
}
views.cuentas = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, A, me, iav, B, L, up, empty;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4, Promise.all([api('/api/jarvis/cuentas'), api('/api/account').catch(function () { return null; }), api('/api/ia').catch(function () { return null; })])];
            case 1:
                _a = __read.apply(void 0, [_d.sent(), 3]), A = _a[0], me = _a[1], iav = _a[2];
                if (A.rate)
                    FX = A.rate;
                if (me)
                    A.me = { returnPct: me.returnPct, market: (_b = iav === null || iav === void 0 ? void 0 : iav.market) !== null && _b !== void 0 ? _b : null };
                B = A.bolsa, L = A.loteria, up = B.gain >= 0;
                empty = !B.positions.length;
                return [2, "<div class=\"side-banner ai\"><span>\uD83E\uDD16</span><div><b>PARTE DE LA IA \u00B7 decide sola</b><small>Aqu\u00ED JARVIS invierte su propio dinero virtual con sus propias reglas. T\u00FA no puedes comprar aqu\u00ED: solo miras c\u00F3mo le va. Para invertir t\u00FA, ve a \"\uD83E\uDDD1 Mi dinero\".</small></div></div>\n  <div><h1>\uD83E\uDD16 Dinero de la IA</h1><p class=\"sub\">Cu\u00E1nto ten\u00EDa, en qu\u00E9 lo puso, cu\u00E1nto gan\u00F3 o perdi\u00F3 y con cu\u00E1nto queda. Todo sale de operaciones selladas con precios reales.</p></div>\n  ".concat(A.me ? "<section class=\"card\"><h2>\u00BFQui\u00E9n va ganando?</h2>".concat(vsStrip(A.me.returnPct, B.returnPct / 100, A.me.market, 'ai'), "</section>") : '', "\n  <section class=\"card acct-card\"><h2>\uD83D\uDCC8 Bolsa <span class=\"more note\">empez\u00F3 el ").concat(dt(B.since), " con ").concat(usd(B.start), "</span></h2>\n    ").concat(flow([['Empezó con', usd(B.start), '', 'dinero virtual'], ['Invirtió', usd(B.invested), '', "".concat(B.positions.length, " ").concat(B.positions.length === 1 ? 'acción' : 'acciones')], ['Eso vale hoy', usd(B.valueNow), B.valueNow >= B.invested ? 'good' : 'bad', "".concat(B.unrealized >= 0 ? '+' : '').concat(usd(B.unrealized))], ['En efectivo', usd(B.cash), '', 'sin invertir'], ['Tiene en total', usd(B.total), up ? 'good' : 'bad', "".concat(up ? '+' : '').concat(usd(B.gain), " (").concat(up ? '+' : '').concat(B.returnPct, "%)")]]), "\n    ").concat(iaStateHtml(B), "\n    <div class=\"acct-mini\"><span>\u2705 Ventas con ganancia: <b>").concat(B.wins, "</b></span><span>\u274C Ventas con p\u00E9rdida: <b>").concat(B.losses, "</b></span><span>\uD83D\uDCB0 Ganado ya cobrado: <b class=\"").concat(B.realized >= 0 ? 'good' : 'bad', "\">").concat(B.realized >= 0 ? '+' : '').concat(usd(B.realized), "</b></span><span>\u23F3 Ganancia a\u00FAn sin vender: <b class=\"").concat(B.unrealized >= 0 ? 'good' : 'bad', "\">").concat(B.unrealized >= 0 ? '+' : '').concat(usd(B.unrealized), "</b></span></div>\n    <h3 class=\"cs-h\">En qu\u00E9 lo tiene ahora</h3>\n    ").concat(empty ? "<div class=\"answer\">\uD83D\uDCA4 Ahora todo est\u00E1 en efectivo. ".concat(B.regime === 'bajista' ? '🛡️ El mercado entero va bajando: espera a que mejore antes de comprar. ' : '').concat(B.marketOpen ? 'Está buscando qué comprar.' : "La bolsa est\u00E1 cerrada; empieza a comprar cuando abra".concat(B.nextOpen ? ": <b>".concat(new Date(B.nextOpen).toLocaleString('es-DO', { weekday: 'long', hour: 'numeric', minute: '2-digit' }), "</b> (hora RD)") : '', "."), "</div>\n      ").concat(B.plan.length ? "<div class=\"note\" style=\"margin:8px 0\">Lo que comprar\u00EDa (est\u00E1 en \"Te recomiendo\"):</div><div class=\"plan\">".concat(B.plan.map(function (p) { return "<a class=\"pl\" href=\"#analisis/".concat(esc(p.symbol), "\"><b>").concat(esc(p.symbol), "</b><span>").concat(usd(p.usd), "</span><small>").concat(p.level ? "".concat(p.level === 'muy segura' ? '🔥 muy segura' : p.level === 'segura' ? '💪 segura' : '🙂 normal', " \u00B7 ").concat(p.pct, "% de su cartera") : "conviene ".concat(p.conv, "/100"), "</small></a>"); }).join(''), "</div>").concat(((_c = B.risk) === null || _c === void 0 ? void 0 : _c.mode) && B.risk.mode !== 'normal' ? "<div class=\"note\" style=\"margin-top:6px\">".concat(B.risk.mode === 'defensa' ? '🛡️ <b>Modo defensa:</b> perdió 40% o más; no compra, cuida lo que queda.' : '⚠️ <b>Modo cuidado:</b> la cartera bajó 20% desde su mejor momento; arriesga la mitad.', "</div>") : '', "<details class=\"note\" style=\"margin-top:6px\"><summary>\u00BFC\u00F3mo decide cu\u00E1nto arriesgar?</summary>").concat(esc(B.rules), "</details>") : '<div class="note">Todavía no hay empresas en "Te recomiendo".</div>')
                        : "<div class=\"tablewrap\"><table class=\"acct-t\"><tr><th>Acci\u00F3n</th><th class=\"r\">Invirti\u00F3</th><th class=\"r\">Vale hoy</th><th class=\"r\">Ganancia</th><th>Desde</th></tr>".concat(B.positions.map(function (p) { return "<tr><td><a href=\"#analisis/".concat(esc(p.symbol), "\"><b>").concat(esc(p.symbol), "</b></a></td><td class=\"r\">").concat(usd(p.invested), "</td><td class=\"r\">").concat(usd(p.value), "</td><td class=\"r ").concat(p.pnl >= 0 ? 'good' : 'bad', "\">").concat(p.pnl >= 0 ? '+' : '').concat(usd(p.pnl), " <span class=\"note\">(").concat(p.pnl >= 0 ? '+' : '').concat(p.pnlPct, "%)</span></td><td>").concat(dt(p.since), "</td></tr>"); }).join(''), "\n      <tr class=\"tot\"><td><b>Total</b></td><td class=\"r\"><b>").concat(usd(B.invested), "</b></td><td class=\"r\"><b>").concat(usd(B.valueNow), "</b></td><td class=\"r ").concat(B.unrealized >= 0 ? 'good' : 'bad', "\"><b>").concat(B.unrealized >= 0 ? '+' : '').concat(usd(B.unrealized), "</b></td><td></td></tr></table></div>"), "\n    ").concat(B.closed.length ? "<h3 class=\"cs-h\">Lo que ya vendi\u00F3 (resultado final)</h3><div class=\"tablewrap\"><table class=\"acct-t\"><tr><th>Acci\u00F3n</th><th class=\"r\">Puso</th><th class=\"r\">Sac\u00F3</th><th class=\"r\">Resultado</th><th>Por qu\u00E9 vendi\u00F3</th></tr>".concat(B.closed.map(function (c) { return "<tr><td><b>".concat(esc(c.symbol), "</b><div class=\"note\">").concat(dt(c.openedAt), " \u2192 ").concat(dt(c.closedAt), "</div></td><td class=\"r\">").concat(usd(c.invested), "</td><td class=\"r\">").concat(usd(c.got), "</td><td class=\"r ").concat(c.pnl >= 0 ? 'good' : 'bad', "\"><b>").concat(c.pnl >= 0 ? '+' : '').concat(usd(c.pnl), "</b> <span class=\"note\">(").concat(c.pnlPct, "%)</span></td><td class=\"note\">").concat(esc(c.why), "</td></tr>"); }).join(''), "</table></div>") : '', "\n    ").concat(B.moves.length ? "<details style=\"margin-top:10px\"><summary class=\"note\">Todas sus compras y ventas (".concat(B.moves.length, ")</summary><div class=\"tablewrap\"><table class=\"acct-t\">").concat(B.moves.map(function (m) { return "<tr><td>".concat(dt(m.at), "</td><td><b class=\"").concat(m.side === 'buy' ? '' : 'warn', "\">").concat(m.side === 'buy' ? '🟢 Compró' : '🔴 Vendió', "</b> ").concat(esc(m.symbol), "</td><td class=\"r\">").concat(usd(m.usd), "</td><td class=\"note\">a ").concat(usd(m.price), " \u00B7 ").concat(esc(m.why), "</td></tr>"); }).join(''), "</table></div></details>") : '', "\n    <div class=\"note\" style=\"margin-top:10px\">\uD83D\uDCCB Reglas: ").concat(esc(B.rules), "</div></section>\n  <section class=\"card acct-card\"><h2>\uD83C\uDFB1 Loter\u00EDa <span class=\"more note\">su monedero: ").concat(usd(L.startUsd), " \u2248 ").concat(rdRaw(L.startRd), "</span></h2>\n    ").concat(flow([['Empezó con', rdu(L.startRd), '', ''], ['Jugó', rdu(L.playedRd), '', "".concat(L.plays, " jugadas")], ['Ganó (premios)', rdu(L.wonRd), L.wonRd > 0 ? 'good' : '', "".concat(L.hits, " ").concat(L.hits === 1 ? 'acierto' : 'aciertos', " de ").concat(L.settled)], ['Perdió', rdu(L.lostRd), L.lostRd > 0 ? 'bad' : '', "".concat(L.settled - L.hits, " sin premio")], ['Le queda', rdu(L.leftRd), L.leftRd >= L.startRd ? 'good' : 'bad', L.pendingRd ? "".concat(rdRaw(L.pendingRd), " esperando sorteo") : '']]), "\n    ").concat(L.byGame.length ? "<div class=\"tablewrap\"><table class=\"acct-t\"><tr><th>Loter\u00EDa</th><th class=\"r\">Jugadas</th><th class=\"r\">Aciertos</th><th class=\"r\">Jug\u00F3</th><th class=\"r\">Gan\u00F3</th><th class=\"r\">Resultado</th></tr>".concat(L.byGame.map(function (g) { return "<tr><td>".concat(esc(g.name), "</td><td class=\"r\">").concat(g.plays, "</td><td class=\"r\">").concat(g.hits, "</td><td class=\"r\">").concat(rdu(g.playedRd), "</td><td class=\"r\">").concat(rdu(g.wonRd), "</td><td class=\"r ").concat(g.wonRd - g.playedRd >= 0 ? 'good' : 'bad', "\">").concat(rdu(g.wonRd - g.playedRd, { sign: true }), "</td></tr>"); }).join(''), "</table></div>") : '', "\n    ").concat(L.brokeAt ? "<div class=\"answer bad\" style=\"margin-top:8px\">\u26A0\uFE0F Con este ritmo se habr\u00EDa quedado sin dinero el ".concat(esc(L.brokeAt), ".</div>") : '', "\n    <div class=\"note\" style=\"margin-top:8px\">").concat(esc(L.note), " <a href=\"#loterias\">Ver cada jugada y qu\u00E9 sali\u00F3 \u25B8</a></div></section>")];
        }
    });
}); };
views.mapa = function () { return __awaiter(void 0, void 0, void 0, function () {
    var m, z, act, b, e, worst, zname, col;
    var _a, _b, _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0: return [4, api('/api/map')];
            case 1:
                m = _f.sent();
                z = m.zones, act = __spreadArray(__spreadArray(__spreadArray([], __read(z.recomendada), false), __read(z.observacion), false), __read(z.no_recomendada), false), b = m.best, e = m.explore;
                worst = z.no_recomendada.slice().sort(function (x, y) { return x.conv - y.conv; })[0];
                zname = function (k) { return (ZL[k] || ['', k])[1]; };
                col = function (k, list) { return "<div class=\"mcol\"><div class=\"mcol-h ".concat(ZL[k][2], "\">").concat(ZL[k][0], " ").concat(ZL[k][1], " <span class=\"note\">(").concat(list.length, ")</span></div>").concat(list.length ? list.map(function (r) { return mapCard(r); }).join('') : "<div class=\"empty\">".concat(k === 'recomendada' ? 'Hoy ninguna cumple. JARVIS sigue buscando.' : 'Ninguna.', "</div>"), "</div>"); };
                return [2, "<div><h1>Tu mapa de inversi\u00F3n</h1><p class=\"sub\">Ordenado para tu estilo: <b>".concat(esc(m.styleLabel || 'Equilibrado'), "</b> (<a href=\"#perfil\">cambiar</a>). Todas las empresas que JARVIS sigue, de la que m\u00E1s te conviene a la que menos. Las que no sirven no se olvidan: se revisan cada d\u00EDa y, si aparece una mejor, la reemplaza.</p></div>\n  <section class=\"card explorer\"><div class=\"ex-ic\">\uD83D\uDD2D</div><div><b>Explorando sin parar</b><div class=\"note\">Ya estudi\u00F3 <b>").concat(e.studied, "</b> de ").concat(e.pool, " empresas y fondos (las famosas, medianas poco conocidas, fondos de sectores y de otros pa\u00EDses)").concat(m.radar ? ", m\u00E1s ".concat(m.radar, " que encontr\u00F3 hoy en el radar de Yahoo") : '', ".").concat(e.pending ? " \u00B7 le faltan ".concat(e.pending) : '', " \u00B7 busca m\u00E1s cada ").concat(esc(e.every)).concat(e.lastAt ? " (la \u00FAltima vez: ".concat(timeAgo(e.lastAt), ")") : '', ". Si una lleva ").concat(e.redStreak, " revisiones seguidas en \"No te recomiendo\" y aparece otra mejor, la cambia; la que sale se vuelve a revisar cada ").concat(e.recheckDays, " d\u00EDas.</div>").concat(((_a = m.gems) === null || _a === void 0 ? void 0 : _a.length) ? "<div class=\"aiideas\"><b>\uD83D\uDC8E Joyas poco conocidas</b> <span class=\"note\">(tienen 2 o m\u00E1s rarezas que la gente suele pasar por alto; JARVIS las sigue probando)</span>".concat(m.gems.map(function (g) { return "<div class=\"aiidea\"><a href=\"#analisis/".concat(esc(g.symbol), "\"><b>").concat(esc(g.symbol), "</b></a>").concat(g.about ? " <span class=\"note\">\u00B7 ".concat(esc(g.about), "</span>") : '', " <span class=\"note\">\u00B7 conveniencia ").concat(g.conv, "/100 \u00B7 ").concat(esc({ ia: 'la propuso la IA', radar: 'del radar de Yahoo', lista: 'de la lista de joyas', grandes: 'de las grandes' }[g.source] || ''), "</span>").concat(g.tags.map(function (t) { return "<div class=\"note\">\u2022 ".concat(esc(t.text), "</div>"); }).join(''), "</div>"); }).join(''), "</div>") : '').concat(((_b = m.aiIdeas) === null || _b === void 0 ? void 0 : _b.length) ? "<div class=\"aiideas\"><b>\u2728 Sugeridas por la IA</b> <span class=\"note\">(JARVIS las prueba con precios reales antes de recomendarlas)</span>".concat(m.aiIdeas.map(function (x) { return "<div class=\"aiidea\"><b>".concat(esc(x.symbol), "</b> <span class=\"note\">\u00B7 ").concat(esc(({ por_estudiar: '⏳ por estudiar', estudiada: '✅ estudiada', no_encontrada: '✕ sin datos reales' })[x.status] || x.status)).concat(x.verdict ? ' · ' + esc(x.verdict) : '', "</span><div class=\"note\">").concat(esc(x.why), "</div></div>"); }).join(''), "</div>") : m.aiOn ? '<div class="note" style="margin-top:6px">✨ La IA propone empresas nuevas cada semana (y cuando tocas "¿Qué buscas ahora?" en Inicio).</div>' : '', "</div></section>\n  ").concat(b ? "<section class=\"card bestpick ".concat(ZL[b.zone][2], "\"><div class=\"s10-h\">Tu mejor opci\u00F3n ahora</div><div class=\"bp\">").concat(coBadge(b.symbol, 72), "<div style=\"flex:1;min-width:0\"><div class=\"bp-v\">").concat(esc(coName(b.symbol)), ": ").concat(esc(b.verdict), "</div>\n    <ul class=\"bp-l\">").concat(b.why.map(function (w) { return "<li>".concat(esc(w), "</li>"); }).join(''), "<li>\u23F3 ").concat(esc(b.hold), "</li>").concat(b.size ? "<li><b>\u00BFPuedo poner m\u00E1s?</b> ".concat(esc(b.size.more), "</li>") : '').concat(b.exitIf.map(function (w) { return "<li class=\"note\">".concat(esc(w), "</li>"); }).join(''), "</ul></div>").concat(((_c = b.card) === null || _c === void 0 ? void 0 : _c.contributions) ? votesHtml(b.card.contributions) : b.contributions ? votesHtml(b.contributions) : '', "\n    <div class=\"bp-r\">").concat(chanceDots(b.card.probBeat)).concat(moneyRange(((_d = b.size) === null || _d === void 0 ? void 0 : _d.usd) || 10, scaleProj(b.card.projection.personal, ((_e = b.size) === null || _e === void 0 ? void 0 : _e.usd) || 10)), "<a class=\"btn\" href=\"#analisis/").concat(esc(b.symbol), "\">Ver el an\u00E1lisis \u25B8</a></div></div></section>")
                        : "<section class=\"card bestpick bad\"><div class=\"bp-v\">Hoy no te recomiendo invertir en ninguna.</div><div class=\"note\">Esperar tambi\u00E9n es una decisi\u00F3n. JARVIS sigue explorando y te avisa al celular cuando una suba a \"Te recomiendo\".</div></section>", "\n  <section class=\"card\"><h2>El mapa de un vistazo</h2>").concat(takeaway('cada bolita es una empresa. Arriba a la derecha está lo que más te conviene: le gana al mercado más veces y con US$10 lo probable es ganar.'), "<div class=\"scatterwrap\">").concat(mapScatter(act), "</div>\n    <div class=\"legend\"><span><i style=\"background:#2fd58a\"></i>Te recomiendo</span><span><i style=\"background:#ffbf3c\"></i>En observaci\u00F3n</span><span><i style=\"background:#ff5d6c\"></i>No te recomiendo</span><span>Toca una bolita para ver su an\u00E1lisis</span></div></section>\n  <section class=\"mcols\">").concat(col('recomendada', z.recomendada)).concat(col('observacion', z.observacion)).concat(col('no_recomendada', z.no_recomendada), "</section>\n  <section class=\"card\"><h2>\uD83D\uDD2D Explorando para reemplazar <span class=\"more note\">las mejores que encontr\u00F3 fuera del mapa</span></h2>\n    ").concat(z.candidata.length ? "".concat(takeaway(worst ? "si una de estas conviene m\u00E1s que <b>".concat(esc(coName(worst.symbol)), "</b> (").concat(worst.conv, "/100) y esa sigue en \"No te recomiendo\", JARVIS hace el cambio.") : 'entran al mapa cuando hay espacio y convienen más.'), "<div class=\"grid g3\">").concat(z.candidata.slice(0, 6).map(function (r) { return mapCard(r, true); }).join(''), "</div>") : '<div class="empty">Todavía no ha explorado fuera del mapa. Empieza cuando el motor está activo.</div>', "</section>\n  ").concat(z.descartada.length ? "<section class=\"card\"><h2>Fuera del mapa <span class=\"more note\">no se olvidan: se revisan cada ".concat(e.recheckDays, " d\u00EDas</span></h2><div class=\"grid g3\">").concat(z.descartada.map(function (r) { return "<div class=\"pbox\"><div class=\"coc\">".concat(coBadge(r.symbol, 32), "<div><b>").concat(esc(coName(r.symbol)), "</b><div class=\"note\">sali\u00F3 el ").concat(esc(r.since), " \u00B7 revisada ").concat(esc(r.checkedAt), "</div></div></div><div class=\"note\" style=\"margin-top:6px\">").concat(esc((m.moves.find(function (x) { return x.symbol === r.symbol && x.to_zone === 'descartada'; }) || {}).reason || r.verdict), "</div></div>"); }).join(''), "</div></section>") : '', "\n  <section class=\"card\"><h2>Movimientos recientes <span class=\"more note\">sellados: no se pueden borrar</span></h2>").concat(m.moves.length ? "<div class=\"moves\">".concat(m.moves.slice(0, 20).map(function (x) { return "<div class=\"mv\"><time>".concat(esc(String(x.ts).slice(0, 10)), "</time><b>").concat(esc(coName(x.symbol)), "</b><span class=\"mv-z\">").concat(x.from_zone ? esc(zname(x.from_zone)) + ' → ' : '').concat(esc(zname(x.to_zone)), "</span><span class=\"note\">").concat(esc(x.reason), "</span></div>"); }).join(''), "</div>") : '<div class="empty">Sin movimientos todavía.</div>', "</section>")];
        }
    });
}); };
var HZ = [[5, '1 semana'], [21, '1 mes'], [63, '3 meses'], [126, '6 meses'], [252, '1 año']];
views.buscar = function () { return __awaiter(void 0, void 0, void 0, function () {
    var b;
    return __generator(this, function (_a) {
        b = MYBUDGET || { usd: 100 };
        return [2, "<div><h1>Buscar a mi medida</h1><p class=\"sub\">Dile a JARVIS qu\u00E9 tan seguro lo quieres, en cu\u00E1nto tiempo y cu\u00E1nto vas a poner. Busca entre todas las empresas que ha estudiado y te dice cu\u00E1les cumplen, con n\u00FAmeros claros.</p></div>\n  <section class=\"card\"><form class=\"form\" id=\"ff\">\n    <div><div class=\"note\" style=\"margin-bottom:6px\"><b>\u00BFQu\u00E9 tan seguro lo quieres?</b> (de cada 10 veces, cu\u00E1ntas)</div>\n      <div class=\"row chips\" id=\"fchips\"><button type=\"button\" class=\"btn ghost sm\" data-r=\"8,10\">Muy seguro (8 a 10)</button><button type=\"button\" class=\"btn ghost sm\" data-r=\"7,10\">Seguro (7 a 10)</button><button type=\"button\" class=\"btn ghost sm\" data-r=\"5,7\">Medio (5 a 7)</button><button type=\"button\" class=\"btn ghost sm\" data-r=\"4,5\">Arriesgado (4 a 5)</button></div>\n      <div class=\"grid g2\" style=\"gap:10px;margin-top:8px\"><label>Desde (de cada 10)<input id=\"fmin\" type=\"number\" min=\"0\" max=\"10\" step=\"0.5\" value=\"7\"></label><label>Hasta (de cada 10)<input id=\"fmax\" type=\"number\" min=\"0\" max=\"10\" step=\"0.5\" value=\"10\"></label></div></div>\n    <div class=\"grid g3\" style=\"gap:10px\">\n      <label>Que sea la chance de\u2026<select id=\"fmet\"><option value=\"ganar\">terminar ganando dinero</option><option value=\"mercado\">ganarle al mercado</option></select></label>\n      <label>\u00BFEn cu\u00E1nto tiempo?<select id=\"fdays\">".concat(HZ.map(function (_a) {
                var _b = __read(_a, 2), d = _b[0], l = _b[1];
                return "<option value=\"".concat(d, "\"").concat(d === 252 ? ' selected' : '', ">").concat(l, "</option>");
            }).join(''), "</select></label>\n      <label>\u00BFCu\u00E1nto vas a poner? (US$)<input id=\"famt\" type=\"number\" min=\"1\" step=\"1\" value=\"").concat(baseAmt('verde'), "\"></label>\n    </div>\n    <div class=\"grid g3\" style=\"gap:10px\">\n      <label>Lo m\u00E1s que aguantas perder en un mal caso (%)<input id=\"floss\" type=\"number\" min=\"1\" max=\"100\" placeholder=\"Ej.: 10 (opcional)\"></label>\n      <label>Buscar en<select id=\"fkind\"><option value=\"todas\">empresas y fondos</option><option value=\"empresas\">solo empresas</option><option value=\"fondos\">solo fondos</option></select></label>\n      <label style=\"flex-direction:row;align-items:center;gap:8px;padding-top:22px\"><input type=\"checkbox\" id=\"frec\" style=\"width:auto\"> Solo las que JARVIS recomienda</label>\n    </div>\n    <button class=\"btn\">Buscar</button>\n    <div class=\"note\">Tu dinero para invertir: <b>").concat(usd(b.usd, 0), "</b> (c\u00E1mbialo en <a href=\"#bolsa\">Mi cuenta</a>). Los n\u00FAmeros salen de la historia real de cada acci\u00F3n: no son promesas.</div>\n  </form></section>\n  <div id=\"fres\"></div>")];
    });
}); };
views.buscar.after = function () {
    document.querySelectorAll('#fchips [data-r]').forEach(function (c) { return c.onclick = function () { var _a = __read(c.dataset.r.split(','), 2), a = _a[0], z = _a[1]; $('#fmin').value = a; $('#fmax').value = z; document.querySelectorAll('#fchips button').forEach(function (x) { return x.classList.toggle('ghost', x !== c); }); }; });
    $('#ff').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var r_1, q_1, card, bb, okN, err_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    $('#fres').innerHTML = '<div class="card muted">Buscando…</div>';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/finder', { method: 'POST', body: { minP: Number($('#fmin').value) / 10, maxP: Number($('#fmax').value) / 10, metric: $('#fmet').value, days: Number($('#fdays').value), amount: Number($('#famt').value), maxLossPct: $('#floss').value, kind: $('#fkind').value, onlyRec: $('#frec').checked } })];
                case 2:
                    r_1 = _a.sent();
                    q_1 = r_1.query, card = function (x, i) {
                        var z = ZL[x.zone] || ZL.candidata;
                        return "<div class=\"mcard ".concat(z[2], "\"><div class=\"mc-h\"><span class=\"rk\">").concat(i + 1, "</span>").concat(coBadge(x.symbol, 36), "<div style=\"flex:1;min-width:0\"><b>").concat(esc(coName(x.symbol)), "</b><div class=\"note\">").concat(esc(x.symbol), " \u00B7 ").concat(esc(z[1]), "</div></div></div>\n        <div class=\"fr-p\">").concat(chanceDots(x.p, { what: r_1.what === 'le ganó al mercado' ? "le gan\u00F3 al mercado en ".concat(r_1.label) : "termin\u00F3 ganando en ".concat(r_1.label) }), "</div>\n        <div class=\"mini3 frm\"><div class=\"pbox\"><div class=\"l\">Con ").concat(usd(q_1.amount, 0), ", lo normal</div><div class=\"v ").concat(cls(x.normalUsd), "\">").concat(x.normalUsd != null ? (x.normalUsd >= 0 ? '+' : '') + usd(x.normalUsd) : '—', "</div></div><div class=\"pbox\"><div class=\"l\">En un mal caso (1 de cada 10)</div><div class=\"v ").concat(cls(x.badUsd), "\">").concat(x.badUsd != null ? (x.badUsd >= 0 ? '+' : '') + usd(x.badUsd) : '—', "</div></div></div>\n        ").concat(x.zone === 'recomendada' || x.zone === 'observacion' ? "<div class=\"fit ok\">\u2705 Cumple lo que pediste y JARVIS dice: ".concat(esc(x.verdict.charAt(0).toLowerCase() + x.verdict.slice(1)), ".</div>") : "<div class=\"fit no\">\u26A0\uFE0F Cumple lo que pediste mirando el pasado, pero hoy JARVIS <b>no te la recomienda</b>: ".concat(esc(x.why[0] || ''), "</div>")).concat(x.active ? "<a class=\"note\" href=\"#analisis/".concat(esc(x.symbol), "\">An\u00E1lisis completo \u25B8</a>") : '', "</div>");
                    };
                    bb = r_1.bigBet;
                    r_1.matches.sort(function (x, y) { return (['recomendada', 'observacion'].includes(y.zone) ? 1 : 0) - (['recomendada', 'observacion'].includes(x.zone) ? 1 : 0); });
                    okN = r_1.matches.filter(function (x) { return x.zone === 'recomendada' || x.zone === 'observacion'; }).length;
                    $('#fres').innerHTML = "<section class=\"card hsum\" style=\"border-color:var(--".concat(okN ? 'good' : 'warn', ")\"><div class=\"hs-big\">").concat(r_1.matches.length ? "Encontr\u00E9 ".concat(r_1.matches.length, " que cumplen; ").concat(okN ? "JARVIS te recomienda ".concat(okN, " de ellas") : 'pero JARVIS no te recomienda ninguna') : 'Ninguna cumple exactamente lo que pediste', "</div><div class=\"hs-v\">").concat(esc(r_1.honest)).concat(r_1.matches.length && okN < r_1.matches.length ? ' Que antes casi siempre terminara ganando no basta: JARVIS también mira cómo le va hoy contra el mercado, sus noticias y si ha acertado con ella.' : '', "</div></section>\n        ").concat(r_1.matches.length ? "<section class=\"grid g3\">".concat(r_1.matches.slice(0, 9).map(card).join(''), "</section>") : r_1.closest.length ? "<section class=\"card\"><h2>Lo m\u00E1s cercano a lo que pediste</h2><div class=\"grid g3\" style=\"margin-top:10px\">".concat(r_1.closest.map(card).join(''), "</div></section>") : '', "\n        <section class=\"card\"><h2>Revisi\u00F3n de tu apuesta de ").concat(usd(q_1.amount, 0), " <span class=\"more note\">").concat(bb.pctOfBudget, "% de tu dinero</span></h2>\n          <div class=\"answer\" style=\"margin:10px 0;font-weight:700\">").concat(esc(bb.verdict), "</div>\n          <div class=\"checks\">").concat(bb.checks.map(function (c) { return "<div class=\"ck ".concat(c.ok ? 'ok' : 'no', "\">").concat(c.ok ? '✓' : '✕', " ").concat(esc(c.text), "</div>"); }).join(''), "</div>\n          ").concat(bb.worstUsd != null ? "<div class=\"note\" style=\"margin-top:8px\">En un mal caso (1 de cada 10 veces) con estas opciones podr\u00EDas ver <b class=\"bad\">".concat(usd(bb.worstUsd), "</b> o m\u00E1s.</div>") : '', "\n          ").concat(bb.parts.length ? "<h3 class=\"cs-h\">C\u00F3mo repartirla</h3><div class=\"tablewrap\"><table><tr><th>D\u00F3nde</th><th class=\"r\">Parte</th><th class=\"r\">Monto</th><th>Por qu\u00E9</th></tr>".concat(bb.parts.map(function (p) { return "<tr><td>".concat(coCell(p.symbol), "</td><td class=\"r\">").concat(p.pct, "%</td><td class=\"r\"><b>").concat(usd(p.usd), "</b></td><td class=\"note\">").concat(esc(p.why), "</td></tr>"); }).join(''), "</table></div>") : '', "\n          <h3 class=\"cs-h\">C\u00F3mo entrar sin apurarte</h3><div class=\"steps\">").concat(bb.steps.map(function (s, i) { return "<div class=\"step\"><i>".concat(i + 1, "</i><div>").concat(esc(s), "</div></div>"); }).join(''), "</div></section>");
                    $('#fres').scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return [3, 4];
                case 3:
                    err_5 = _a.sent();
                    $('#fres').innerHTML = "<div class=\"card msg err\">".concat(esc(err_5.message), "</div>");
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); };
};
views.perfil = function () { return __awaiter(void 0, void 0, void 0, function () {
    var d, p, first, card;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, api('/api/profile')];
            case 1:
                d = _a.sent();
                p = d.profile, first = !p.setup;
                card = function (group, key, o) { return "<button type=\"button\" class=\"opt".concat((group === 'style' ? p.style : p.horizon) === key ? ' on' : '', "\" data-g=\"").concat(group, "\" data-k=\"").concat(key, "\">").concat(o.icon ? "<span class=\"oi\">".concat(o.icon, "</span>") : '', "<b>").concat(esc(o.label), "</b><span class=\"note\">").concat(esc(o.desc), "</span>").concat(o.pct ? "<span class=\"note\">\"S\u00ED, invierte\" = ".concat(Math.round(o.pct.verde * 100), "% de tu dinero</span>") : '', "</button>"); };
                return [2, "".concat(first ? "<section class=\"card welcome\"><div class=\"s10-h\">Bienvenido".concat((ME === null || ME === void 0 ? void 0 : ME.displayName) ? ', ' + esc(ME.displayName) : '', "</div><div class=\"bp-v\">Cu\u00E9ntale a JARVIS c\u00F3mo eres</div><p class=\"note\">El n\u00FAcleo (la investigaci\u00F3n, el mapa y el historial) es el mismo para todos. Esto solo cambia cu\u00E1nto te sugiere poner y en qu\u00E9 orden te muestra las opciones. Lo puedes cambiar cuando quieras.</p></section>") : "<div><h1>Mi perfil</h1><p class=\"sub\">JARVIS se adapta a tu forma de invertir. Tu amigo tiene el suyo: cada uno ve lo mismo del n\u00FAcleo, pero ordenado para s\u00ED.</p></div>", "\n  <section class=\"card\"><h2>\uD83D\uDDA5\uFE0F Este equipo</h2><p class=\"note\">JARVIS detecta solo si es tel\u00E9fono, computadora o TV y se adapta. Si se equivoc\u00F3, elige aqu\u00ED (solo cambia en este equipo).</p>\n    <div class=\"row\" style=\"gap:8px;margin-top:8px\">").concat([['', 'Automático'], ['phone', '📱 Teléfono'], ['desktop', '💻 Computadora'], ['tv', '📺 TV']].map(function (_a) {
                        var _b = __read(_a, 2), k = _b[0], l = _b[1];
                        return "<button type=\"button\" class=\"btn ".concat(((function () { try {
                            return localStorage.getItem('jv-device') || '';
                        }
                        catch (_a) {
                            return '';
                        } })()) === k ? '' : 'ghost', " sm\" data-dev=\"").concat(k, "\">").concat(l, "</button>");
                    }).join(''), "</div>\n    <div class=\"note\" style=\"margin-top:6px\">Ahora: <b>").concat({ phone: 'teléfono', tablet: 'tableta', desktop: 'computadora', tv: 'TV' }[window.JV_DEVICE] || 'automático', "</b></div></section>\n  <section class=\"card tvcard\"><h2>\uD83D\uDCFA C\u00F3digo para la TV</h2><p class=\"note\">Para entrar r\u00E1pido en la TV o en otro equipo sin escribir tu usuario ni contrase\u00F1a. En la TV toca <b>\"Entrar con c\u00F3digo (TV)\"</b> y escribe este c\u00F3digo. Sirve <b>10 minutos</b> y <b>una sola vez</b>.</p>\n    <div id=\"tvshow\"></div><button type=\"button\" class=\"btn\" id=\"tvnew\">Crear c\u00F3digo</button></section>\n  <form id=\"pf\" class=\"grid\" style=\"gap:16px\">\n    <section class=\"card\"><h2>Tu nombre</h2><label style=\"max-width:360px;margin-top:8px\">C\u00F3mo quieres que te llame<input id=\"pn\" maxlength=\"30\" value=\"").concat(esc(d.displayName || ''), "\"></label></section>\n    <section class=\"card\"><h2>\u00BFC\u00F3mo eres con el riesgo?</h2><div class=\"opts\" style=\"margin-top:10px\">").concat(Object.entries(d.styles).map(function (_a) {
                        var _b = __read(_a, 2), k = _b[0], o = _b[1];
                        return card('style', k, o);
                    }).join(''), "</div></section>\n    <section class=\"card\"><h2>\u00BFCu\u00E1nto tiempo puedes dejar el dinero?</h2><div class=\"opts\" style=\"margin-top:10px\">").concat(Object.entries(d.horizons).map(function (_a) {
                        var _b = __read(_a, 2), k = _b[0], o = _b[1];
                        return card('horizon', k, o);
                    }).join(''), "</div></section>\n    <section class=\"card\"><h2>\u00BFQu\u00E9 te interesa?</h2><div class=\"row\" style=\"gap:16px;margin-top:10px\">\n      ").concat([['empresas', 'Empresas (Apple, Microsoft…)'], ['fondos', 'Fondos (reparten el riesgo)'], ['loterias', 'Loterías RD']].map(function (_a) {
                        var _b = __read(_a, 2), k = _b[0], l = _b[1];
                        return "<label class=\"chk\"><input type=\"checkbox\" data-int=\"".concat(k, "\"").concat(p.interests[k] ? ' checked' : '', "> ").concat(l, "</label>");
                    }).join(''), "</div>\n      <div class=\"note\" style=\"margin-top:6px\">Lo que no te interese se oculta de tus pantallas. JARVIS lo sigue investigando para los dem\u00E1s.</div></section>\n    <section class=\"card\"><h2>Tu dinero</h2><div class=\"row\" style=\"gap:12px;align-items:flex-end;margin-top:8px\"><label style=\"width:220px\">Dinero para invertir (US$)<input id=\"pbu\" type=\"number\" min=\"10\" step=\"1\" value=\"").concat(d.budget.usd, "\"></label><label class=\"chk\" style=\"padding-bottom:10px\"><input type=\"checkbox\" id=\"pbe\"").concat(d.budget.emergency ? ' checked' : '', "> Tengo fondo de emergencia aparte</label></div></section>\n    <section class=\"card\"><h2>Tus avisos al celular</h2><label style=\"max-width:420px;margin-top:8px\">Tu tema secreto en la app ntfy (opcional)<input id=\"pt\" maxlength=\"64\" value=\"").concat(esc(p.ntfyTopic || ''), "\" placeholder=\"").concat(esc(((ME === null || ME === void 0 ? void 0 : ME.username) || 'yo') + '-jarvis-7k2p'), "\"></label>\n      <div class=\"note\">Instala la app <b>ntfy</b>, suscr\u00EDbete a ese nombre y te llegan tus avisos personales (por ejemplo, si tu inversi\u00F3n real cae 8%). Nadie m\u00E1s los ve.</div></section>\n    <section class=\"card summary10\"><div class=\"s10-h\">As\u00ED te va a recomendar JARVIS</div><div id=\"pline\" style=\"font-size:16px;line-height:1.55\">").concat(esc(d.line), "</div></section>\n    <button class=\"btn\" style=\"max-width:420px\">").concat(first ? 'Guardar y empezar' : 'Guardar mi perfil', "</button><div class=\"msg\" id=\"pm\"></div>\n  </form>\n  <section class=\"card\"><h2>Cambiar mi contrase\u00F1a</h2><form class=\"row\" id=\"pwf\" style=\"gap:12px;align-items:flex-end;margin-top:8px\">\n    <label style=\"flex:1;min-width:200px\">Contrase\u00F1a actual<input id=\"pw0\" type=\"password\" autocomplete=\"current-password\" required></label>\n    <label style=\"flex:1;min-width:200px\">Contrase\u00F1a nueva (10 o m\u00E1s)<input id=\"pw1\" type=\"password\" autocomplete=\"new-password\" minlength=\"10\" required></label>\n    <button class=\"btn\">Cambiar</button></form><div class=\"msg\" id=\"pwm\"></div></section>")];
        }
    });
}); };
views.perfil.after = function () {
    var _a;
    document.querySelectorAll('[data-dev]').forEach(function (b) { return b.onclick = function () { try {
        b.dataset.dev ? localStorage.setItem('jv-device', b.dataset.dev) : localStorage.removeItem('jv-device');
    }
    catch (_a) { } location.reload(); }; });
    var tvTick = null;
    $('#tvnew').onclick = function () { return __awaiter(void 0, void 0, void 0, function () {
        var r_2, paint, err_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4, api('/api/tvcode', { method: 'POST' })];
                case 1:
                    r_2 = _a.sent();
                    clearInterval(tvTick);
                    paint = function () {
                        var s = Math.max(0, Math.round((Date.parse(r_2.expiresAt) - Date.now()) / 1000));
                        if (!$('#tvshow'))
                            return clearInterval(tvTick);
                        $('#tvshow').innerHTML = s ? "<div class=\"tvbig\">".concat(esc(r_2.code), "</div><div class=\"note\" style=\"text-align:center\">Vence en ").concat(Math.floor(s / 60), ":").concat(String(s % 60).padStart(2, '0'), "</div>") : '<div class="note">Venció. Crea otro.</div>';
                        if (!s)
                            clearInterval(tvTick);
                    };
                    paint();
                    tvTick = setInterval(paint, 1000);
                    $('#tvnew').textContent = 'Crear otro código';
                    return [3, 3];
                case 2:
                    err_6 = _a.sent();
                    $('#tvshow').innerHTML = "<div class=\"msg err\">".concat(esc(err_6.message), "</div>");
                    return [3, 3];
                case 3: return [2];
            }
        });
    }); };
    var sel = { style: null, horizon: null };
    document.querySelectorAll('.opt').forEach(function (b) {
        if (b.classList.contains('on'))
            sel[b.dataset.g] = b.dataset.k;
        b.onclick = function () { sel[b.dataset.g] = b.dataset.k; document.querySelectorAll(".opt[data-g=\"".concat(b.dataset.g, "\"]")).forEach(function (x) { return x.classList.toggle('on', x === b); }); };
    });
    $('#pf').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var interests, r, err_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    interests = {};
                    document.querySelectorAll('[data-int]').forEach(function (c) { interests[c.dataset.int] = c.checked; });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4, api('/api/profile', { method: 'POST', body: { displayName: $('#pn').value, style: sel.style, horizon: sel.horizon, interests: interests, ntfyTopic: $('#pt').value, budget: { usd: Number($('#pbu').value), emergency: $('#pbe').checked } } })];
                case 2:
                    r = _a.sent();
                    return [4, loadBudget()];
                case 3:
                    _a.sent();
                    return [4, api('/api/me')];
                case 4:
                    ME = _a.sent();
                    applyUser();
                    $('#pline').textContent = r.line;
                    $('#pm').className = 'msg ok';
                    $('#pm').textContent = 'Guardado. JARVIS ya te muestra todo a tu manera.';
                    if (location.hash === '#perfil' && !window.__wasSetup)
                        setTimeout(function () { location.hash = '#inicio'; }, 1200);
                    return [3, 6];
                case 5:
                    err_7 = _a.sent();
                    $('#pm').className = 'msg err';
                    $('#pm').textContent = err_7.message;
                    return [3, 6];
                case 6: return [2];
            }
        });
    }); };
    window.__wasSetup = !!((_a = MYBUDGET === null || MYBUDGET === void 0 ? void 0 : MYBUDGET.profile) === null || _a === void 0 ? void 0 : _a.setup);
    $('#pwf').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () { var err_8; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                e.preventDefault();
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4, api('/api/me/password', { method: 'POST', body: { current: $('#pw0').value, next: $('#pw1').value } })];
            case 2:
                _a.sent();
                $('#pwm').className = 'msg ok';
                $('#pwm').textContent = 'Contraseña cambiada. Se cerraron tus otras sesiones.';
                $('#pw0').value = $('#pw1').value = '';
                return [3, 4];
            case 3:
                err_8 = _a.sent();
                $('#pwm').className = 'msg err';
                $('#pwm').textContent = err_8.message;
                return [3, 4];
            case 4: return [2];
        }
    }); }); };
};
function applyUser() {
    var _a, _b;
    api('/api/fx').then(function (f) { if (f === null || f === void 0 ? void 0 : f.rate)
        FX = f.rate; }).catch(function () { });
    var chip = $('#mechip');
    if (chip)
        chip.textContent = '👤 ' + ((ME === null || ME === void 0 ? void 0 : ME.displayName) || (ME === null || ME === void 0 ? void 0 : ME.username) || '');
    var lot = document.querySelector('#tabs a[href="#loterias"]');
    if (lot)
        lot.classList.toggle('hide', ((_b = (_a = ME === null || ME === void 0 ? void 0 : ME.profile) === null || _a === void 0 ? void 0 : _a.interests) === null || _b === void 0 ? void 0 : _b.loterias) === false);
}
views.recomendaciones = function () { return __awaiter(void 0, void 0, void 0, function () {
    var r;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, api('/api/ranking')];
            case 1:
                r = _a.sent();
                return [2, "<div><h1>Recomendaciones de hoy</h1><p class=\"sub\">Las mejores arriba. Toca cualquier empresa para ver por qu\u00E9, con gr\u00E1ficos y pruebas.</p></div>\n  <div class=\"legend-big\"><span>".concat(light('verde'), " te la recomiendo: buenas pruebas a favor</span><span>").concat(light('amarillo'), " hay dudas: si entras, con poco</span><span>").concat(light('rojo'), " no te la recomiendo (puede subir, pero probablemente menos que el mercado)</span><span><span class=\"chance mini\"><span class=\"dots\"><i style=\"background:#2fd58a;border-color:#2fd58a\"></i><i style=\"background:#2fd58a;border-color:#2fd58a\"></i><i></i></span></span> de cada 10 veces que JARVIS vio algo parecido, cu\u00E1ntas le gan\u00F3 al mercado</span></div>\n  <div class=\"card\">").concat(rankingTable(r), "</div>\n  <a class=\"card mapcta\" href=\"#mapa\">\uD83D\uDDFA\uFE0F <b>Ver mi mapa</b> <span class=\"note\">las que te recomiendo, las que vigila, las que no y las que est\u00E1 explorando para reemplazarlas \u25B8</span></a>\n  <details class=\"card\"><summary><b>\u00BFC\u00F3mo decide JARVIS?</b> <span class=\"note\">toca para leer</span></summary><p class=\"note\" style=\"margin-top:10px\">Mira cinco cosas: c\u00F3mo le va a la empresa contra el mercado, si JARVIS acert\u00F3 antes con ella, la salud de la empresa seg\u00FAn sus informes oficiales, cu\u00E1nto sube y baja, y si hay noticias negativas. Cada recomendaci\u00F3n queda sellada y a los 20 d\u00EDas de bolsa se revisa si acert\u00F3: as\u00ED el historial es real y nadie lo puede maquillar.</p></details>")];
        }
    });
}); };
views.recomendaciones.after = bindDebateButtons;
function bindDebateButtons() {
    var _this = this;
    document.querySelectorAll('[data-debate]').forEach(function (b) { return b.onclick = function (ev) { return __awaiter(_this, void 0, void 0, function () {
        var d, e_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ev.stopPropagation();
                    b.disabled = true;
                    b.textContent = 'Debatiendo…';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/debate/' + b.dataset.debate, { method: 'POST' })];
                case 2:
                    d = _a.sent();
                    location.hash = '#debate/' + d.id;
                    return [3, 4];
                case 3:
                    e_5 = _a.sent();
                    b.textContent = e_5.message.slice(0, 40);
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); }; });
}
views.empresa = function (sym) { return __awaiter(void 0, void 0, void 0, function () {
    var d, c, track;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4, api('/api/stock/' + encodeURIComponent(sym))];
            case 1:
                d = _d.sent();
                c = d.card;
                track = c === null || c === void 0 ? void 0 : c.reasons.find(function (r) { return r.factor === 'historial'; });
                return [2, "<div style=\"display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap\"><div><div class=\"note\"><a href=\"#recomendaciones\">Recomendaciones</a> \u203A ".concat(esc(d.symbol), "</div>\n    <h1 style=\"display:flex;align-items:center;gap:12px\">").concat(coBadge(d.symbol, 44)).concat(esc(coName(d.symbol)), " <span class=\"muted\" style=\"font-size:16px;font-weight:600\">").concat(d.quote ? usd(d.quote.price) + ' · ' + esc(d.quote.source) + ' · ' + timeAgo(d.quote.as_of) : '', "</span></h1></div>\n    <span class=\"pill\">Precio: <b>").concat(esc(d.quoteStatus.label), "</b></span><a class=\"btn\" href=\"#analisis/").concat(esc(d.symbol), "\" style=\"margin-left:auto\">\u00BFPor qu\u00E9? An\u00E1lisis profundo \u25B8</a><button class=\"btn ghost\" id=\"watch\">+ Lista de vigilancia</button></div>\n  ").concat(c ? "<section class=\"card verdict\" style=\"\">".concat(light(c.light), "\n    <div><div style=\"font-size:24px;font-weight:800\">").concat(esc(VERDICT[c.light]), "</div><div class=\"sub\">").concat(esc(((_a = c.reasons[0]) === null || _a === void 0 ? void 0 : _a.text) || ''), "</div></div>").concat(chanceDots(c.probBeat, { big: true }), "</section>") : '<div class="card empty">Esta empresa todavía no está en el ranking de hoy.</div>', "\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>Precio del \u00FAltimo a\u00F1o <span class=\"more note\">Fuente: ").concat(esc(d.barsSource || '—'), "</span></h2>").concat(lineChart(d.bars, { label: 'Precio de ' + d.symbol }), "</div>\n    <div class=\"card\"><h2>Por qu\u00E9 se decidi\u00F3 as\u00ED</h2>").concat(c ? whyBars(c.contributions) : '', "<div style=\"margin-top:14px;display:flex;flex-direction:column;gap:8px\">").concat(((c === null || c === void 0 ? void 0 : c.reasons) || []).map(function (r) { return "<div style=\"font-size:14px\"><span class=\"tag ".concat(r.kind === 'dato' ? 'dato' : 'opinion', "\">").concat(r.kind === 'dato' ? 'Dato' : 'Opinión', "</span> ").concat(esc(r.text), "</div>"); }).join(''), "</div></div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>Qu\u00E9 hacer, paso a paso</h2>").concat(c ? steps(todoFor(c.light)) : '', "</div>\n    <div class=\"card\"><h2>Cu\u00E1nto podr\u00EDas ganar o perder</h2>").concat(c ? projBox((_b = c.projection) === null || _b === void 0 ? void 0 : _b.personal, 'Con US$10 en 6 meses') + '<div style="height:12px"></div>' + projBox((_c = c.projection) === null || _c === void 0 ? void 0 : _c.ejemplo, 'Con US$200 en 6 meses') : '', "</div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>Informes oficiales (SEC)</h2>").concat(d.facts.length ? "<table><tr><th>Dato</th><th>Periodo</th><th class=\"r\">Valor</th></tr>".concat(d.facts.sort(function (a, b) { return (a.metric + b.period < b.metric + a.period ? -1 : 1); }).map(function (f) { return "<tr><td>".concat(esc(f.metric.replace(/_/g, ' ')), "</td><td>").concat(esc(f.period), "</td><td class=\"r\">").concat(usd(f.value / 1e9, 1), " mil M</td></tr>"); }).join(''), "</table><div class=\"note\">Fuente: SEC EDGAR (informes 10-K)</div>") : '<div class="empty">Sin informes cargados (los fondos como SPY no presentan estos informes).</div>', "</div>\n    <div class=\"card\"><h2>Noticias y pol\u00E9micas</h2>").concat(d.news.length ? d.news.map(function (n) { return "<div style=\"padding:8px 0;border-top:1px solid #1e2a44\">".concat(n.polemic >= 2 ? "<span class=\"tag\" style=\"background:rgba(255,93,108,.12);color:#ff5d6c\">Pol\u00E9mica".concat(n.verified ? ' confirmada' : '', "</span> ") : '', "<a href=\"").concat(esc(n.url), "\" target=\"_blank\" rel=\"noopener\">").concat(esc(n.title), "</a><div class=\"note\">").concat(esc(n.summary || ''), " \u00B7 ").concat(esc(n.source), " \u00B7 ").concat(timeAgo(n.published_at), "</div></div>"); }).join('') : '<div class="empty">Sin noticias todavía.</div>', "</div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>Historial de JARVIS con ").concat(esc(d.symbol), "</h2>").concat(d.history.length ? "<table><tr><th>Fecha</th><th>Dijo</th><th>Resultado</th></tr>".concat(d.history.map(function (x) { return "<tr><td>".concat(esc(x.sealedAt.slice(0, 10)), "</td><td>").concat(light(x.light), "</td><td>").concat(x.correct == null ? '<span class="note">Pendiente</span>' : x.correct ? "<span class=\"good\">\u2713 Acert\u00F3</span> <span class=\"note\">".concat(pct(x.outcome.excess * 100, 1), " vs mercado</span>") : "<span class=\"bad\">\u2715 Fall\u00F3</span> <span class=\"note\">".concat(pct(x.outcome.excess * 100, 1), " vs mercado</span>"), "</td></tr>"); }).join(''), "</table>") : '<div class="empty">Todavía no hay recomendaciones calificadas.</div>', "</div>\n    <div class=\"card\"><h2>Comentarios</h2><div id=\"cm\"></div><form class=\"ask\" id=\"cmf\" style=\"margin-top:10px\"><input id=\"cmt\" placeholder=\"Escribe tu opini\u00F3n para el grupo\u2026\" maxlength=\"1000\"><button class=\"btn\">Enviar</button></form></div>\n  </section>")];
        }
    });
}); };
views.empresa.after = function (sym) { return __awaiter(void 0, void 0, void 0, function () {
    var load;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                load = function () { return __awaiter(void 0, void 0, void 0, function () { var c; return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4, api('/api/comments?subject=' + encodeURIComponent('stock:' + sym))];
                        case 1:
                            c = _a.sent();
                            $('#cm').innerHTML = c.length ? c.map(function (x) { return "<div style=\"padding:6px 0;border-top:1px solid #1e2a44\"><b>".concat(esc(x.username), "</b> <span class=\"note\">").concat(timeAgo(x.ts), "</span><div>").concat(esc(x.body), "</div></div>"); }).join('') : '<div class="empty">Sin comentarios todavía.</div>';
                            return [2];
                    }
                }); }); };
                return [4, load()];
            case 1:
                _a.sent();
                $('#cmf').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            e.preventDefault();
                            return [4, api('/api/comments', { method: 'POST', body: { subject: 'stock:' + sym, body: $('#cmt').value } })];
                        case 1:
                            _a.sent();
                            $('#cmt').value = '';
                            load();
                            return [2];
                    }
                }); }); };
                $('#watch').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4, api('/api/watchlist', { method: 'POST', body: { symbol: sym } })];
                        case 1:
                            _a.sent();
                            $('#watch').textContent = '✓ En tu lista';
                            return [2];
                    }
                }); }); };
                return [2];
        }
    });
}); };
views.debate = function (id) { return __awaiter(void 0, void 0, void 0, function () {
    var d, v, c, aiWho, bubble;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4, api('/api/debate/' + id)];
            case 1:
                d = _b.sent();
                v = d.verdict, c = d.card;
                aiWho = function (m) { return (ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? m.who : "IA ".concat(m.label || '').trim(); };
                bubble = function (m, side) {
                    var _a;
                    return m.failed ? "<div class=\"bub\"><b>".concat(esc(aiWho(m)), "</b><p class=\"note\">").concat((ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? "No respondi\u00F3: ".concat(esc(m.reason)) : 'No respondió esta vez.', "</p></div>") :
                        "<div class=\"bub ".concat(side, "\"><div class=\"who\">").concat(esc(aiWho(m))).concat((ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? " <span class=\"note\">\u00B7 ".concat(esc(m.label), "</span>") : '', "<span class=\"stance\">").concat(esc(m.stance.replace('_', ' ')), "</span></div><p>").concat(esc(m.text), "</p>\n    <div style=\"display:flex;gap:6px;flex-wrap:wrap\">").concat((m.evidence || []).map(function (e) { return "<span class=\"tag ".concat(e.kind === 'dato' ? 'dato' : 'opinion', "\">").concat(e.kind === 'dato' ? 'Dato' : 'Opinión IA', "</span>").concat(e.source ? "<span class=\"src ok\">".concat(esc(e.source), "</span>") : ''); }).join(' '), "</div>\n    ").concat(((_a = m.evidence) === null || _a === void 0 ? void 0 : _a.length) ? "<details><summary>m\u00E1s \u25B8</summary>".concat(m.evidence.map(function (e) { return "<div class=\"note\">\u2022 ".concat(esc(e.text), "</div>"); }).join(''), "</details>") : '', "</div>");
                };
                return [2, "<div><div class=\"note\"><a href=\"#recomendaciones\">Recomendaciones</a> \u203A Debate</div><h1>".concat(esc(d.subject), " <span class=\"muted\" style=\"font-size:15px\">\u00B7 ").concat(d.rounds.length, " rondas \u00B7 costo ").concat(usd(d.cost_usd, 3), " \u00B7 sellado ").concat(esc(d.created_at.slice(0, 16).replace('T', ' ')), "</span></h1></div>\n  <section class=\"card verdict\" style=\";border-color:var(--").concat(v.light === 'verde' ? 'good' : v.light === 'amarillo' ? 'warn' : 'bad', ")\">").concat(light(v.light), "\n    <div><div class=\"note\" style=\"text-transform:uppercase;letter-spacing:.12em;font-weight:800\">Decisi\u00F3n final</div><div style=\"font-size:26px;font-weight:800\">").concat(esc(v.title), "</div><div class=\"sub\">").concat(esc(v.notes.join(' ')), "</div><div class=\"note\">Basada en: ").concat(esc(v.basedOn), "</div></div>").concat(gauge(v.confidence), "</section>\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>C\u00F3mo debatieron</h2>").concat(d.rounds.length ? d.rounds.map(function (r) { return "<div class=\"round\"><i>Ronda ".concat(r.round, "</i>").concat(esc(r.title), "</div><div class=\"bubbles\">").concat(r.messages.map(function (m, i) { return bubble(m, i ? 'b' : 'a'); }).join(''), "</div>"); }).join('') : '<div class="empty">No hubo debate: IA no disponible o tope de gasto alcanzado. La decisión usa solo datos e historial.</div>', "\n      <div class=\"grid g2\" style=\"gap:10px;margin-top:8px\"><div class=\"card\" style=\"background:var(--").concat(v.agree ? 'good' : 'warn', "-bg);border-color:transparent\"><b class=\"").concat(v.agree ? 'good' : 'warn', "\">").concat(v.agree ? '✓ Coinciden' : '✕ No coinciden', "</b><div class=\"note\">").concat(v.agree ? 'Las dos IA llegaron a la misma postura final.' : 'Cada una mantuvo su postura: por eso la cautela.', "</div></div></div></div>\n    <div style=\"display:flex;flex-direction:column;gap:16px\">\n      <div class=\"card\"><h2>Por qu\u00E9 se decidi\u00F3 as\u00ED</h2>").concat(c ? whyBars(c.contributions) : '<div class="empty">—</div>', "</div>\n      <div class=\"card\"><h2>Qu\u00E9 hacer, paso a paso</h2>").concat(steps(v.todo), "</div>\n      <div class=\"card\"><h2>Con US$10 en 6 meses</h2>").concat(c ? projBox((_a = c.projection) === null || _a === void 0 ? void 0 : _a.personal, 'Tu monto por operación') : '—', "</div>\n    </div></section>")];
        }
    });
}); };
function vsStrip(you, ia, mk, here) {
    var cell = function (icon, t, v, cls2, on) { return "<div class=\"vsc ".concat(cls2).concat(on ? ' on' : '', "\"><span>").concat(icon, "</span><small>").concat(t, "</small><b class=\"").concat(cls(v), "\">").concat(v != null ? pct(v * 100, 2) : '—', "</b></div>"); };
    return "<div class=\"vsstrip\">".concat(cell('🧑', 'Tú', you, 'me', here === 'me')).concat(cell('🤖', 'La IA', ia, 'ai', here === 'ai')).concat(cell('📈', 'El mercado', mk, 'mk', false), "</div>");
}
function iaCompare(a, ia) {
    var _a, _b, _c, _d;
    var you = a.returnPct, iaR = (_a = ia === null || ia === void 0 ? void 0 : ia.returnPct) !== null && _a !== void 0 ? _a : null, mk = (_d = (_b = ia === null || ia === void 0 ? void 0 : ia.market) !== null && _b !== void 0 ? _b : (_c = a.compare) === null || _c === void 0 ? void 0 : _c.market) !== null && _d !== void 0 ? _d : null;
    var box = function (icon, title, sub, v, extra) { return "<div class=\"pbox vs\"><div class=\"l\">".concat(icon, " <b>").concat(title, "</b></div><div class=\"note\">").concat(sub, "</div><div class=\"v ").concat(cls(v), "\">").concat(v != null ? pct(v * 100, 2) : '—', "</div>").concat(extra || '', "</div>"); };
    return "<section class=\"card\"><h2>\u00BFQui\u00E9n lo hace mejor? <span class=\"more note\">dinero virtual, precios reales</span></h2>\n    <div class=\"mini3\">".concat(box('🧑', 'Tú', 'Tu cartera: decides tú', you, "<div class=\"note\">".concat(usd(a.total), "</div>"))).concat(box('🤖', 'La IA', 'Cartera de JARVIS: decide sola', iaR, ia ? "<div class=\"note\">".concat(usd(ia.total), "</div>") : '')).concat(box('📈', 'No hacer nada', 'Solo el mercado (SPY)', mk), "</div>\n    <div class=\"note\" style=\"margin-top:8px\">Son dos carteras <b>separadas</b>: lo que t\u00FA compras no cambia la de la IA, ni al rev\u00E9s. As\u00ED ves si las decisiones de JARVIS de verdad sirven.</div></section>\n  ").concat(ia ? "<section class=\"card iacard\"><h2>\uD83E\uDD16 Cartera de la IA <span class=\"note\" style=\"font-weight:600\">\u00B7 decide sola</span></h2>\n    <div class=\"grid g3\" style=\"gap:10px;margin-top:8px\"><div class=\"pbox\"><div class=\"l\">Valor</div><div class=\"v\">".concat(usd(ia.total), "</div><div class=\"note\">empez\u00F3 con ").concat(usd(ia.start, 0), "</div></div><div class=\"pbox\"><div class=\"l\">Efectivo</div><div class=\"v\">").concat(usd(ia.cash), "</div></div><div class=\"pbox\"><div class=\"l\">Ganancia ya cerrada</div><div class=\"v ").concat(cls(ia.realized), "\">").concat(usd(ia.realized), "</div><div class=\"note\">").concat(ia.closed, " ").concat(ia.closed === 1 ? 'operación cerrada' : 'operaciones cerradas', "</div></div></div>\n    <h3 style=\"margin-top:14px\">Lo que tiene ahora</h3>").concat(ia.positions.length ? "<div class=\"tablewrap\"><table><tr><th>Acci\u00F3n</th><th class=\"r\">Vale</th><th class=\"r\">Ganancia</th></tr>".concat(ia.positions.map(function (p) { return "<tr><td>".concat(coCell(p.symbol), "</td><td class=\"r\">").concat(usd(p.value), "</td><td class=\"r ").concat(cls(p.pnl), "\">").concat(usd(p.pnl), " <span class=\"note\">").concat(pct(p.pnlPct * 100), "</span></td></tr>"); }).join(''), "</table></div>") : '<div class="empty">Todavía no ha comprado nada. Compra sola cuando el mercado está abierto y hay acciones en "Te recomiendo".</div>', "\n    <h3 style=\"margin-top:14px\">Lo que decidi\u00F3 y por qu\u00E9</h3>").concat(ia.trades.length ? "<div class=\"iatl\">".concat(ia.trades.slice(0, 12).map(function (t) { return "<div class=\"iarow\"><b class=\"".concat(t.side === 'buy' ? 'good' : 'bad', "\">").concat(t.side === 'buy' ? 'Compró' : 'Vendió', " ").concat(esc(t.symbol), "</b> \u00B7 ").concat(usd(t.usd), " \u00B7 <span class=\"note\">").concat(esc(t.ts.slice(0, 10)), "</span><div class=\"note\">").concat(esc(String(t.reason || '').replace(/^IA (compra|vende): /, '')), "</div></div>"); }).join(''), "</div>") : '<div class="empty">Aún no ha hecho operaciones.</div>', "\n    <details class=\"note\" style=\"margin-top:10px\"><summary>Las reglas de la IA</summary><ul>").concat(ia.rules.map(function (x) { return "<li>".concat(esc(x), "</li>"); }).join(''), "</ul></details></section>") : '');
}
views.bolsa = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, a, r, wl, ia, ct, syms, B, openTxt, picks;
    var _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0: return [4, Promise.all([api('/api/account'), api('/api/ranking'), api('/api/watchlist'), api('/api/ia').catch(function () { return null; }), api('/api/jarvis/cuentas').catch(function () { return null; })])];
            case 1:
                _a = __read.apply(void 0, [_h.sent(), 5]), a = _a[0], r = _a[1], wl = _a[2], ia = _a[3], ct = _a[4];
                syms = __spreadArray([], __read(new Set(__spreadArray(__spreadArray(__spreadArray([], __read(r.map(function (c) { return c.symbol; })), false), __read(wl), false), __read(a.positions.map(function (p) { return p.symbol; })), false))), false);
                B = a.budget || MYBUDGET || { usd: 100, emergency: true };
                openTxt = a.marketOpen ? '<span class="good">🟢 La bolsa está abierta: las órdenes se hacen al momento.</span>' : "<span class=\"warn\">\uD83C\uDF19 La bolsa est\u00E1 cerrada".concat(a.nextOpen ? " \u00B7 abre ".concat(new Date(a.nextOpen).toLocaleString('es-DO', { weekday: 'long', hour: 'numeric', minute: '2-digit' }), " (hora RD)") : '', "</span> \u00B7 Puedes dejar tus \u00F3rdenes listas y se hacen solas al abrir.");
                picks = r.filter(function (c) { return c.light !== 'rojo'; }).slice(0, 6);
                return [2, "<div class=\"side-banner me\"><span>\uD83E\uDDD1</span><div><b>TU PARTE \u00B7 aqu\u00ED decides t\u00FA</b><small>Tu dinero de pr\u00E1ctica: compras y vendes t\u00FA para probar. La IA tiene su propio dinero aparte, en \"\uD83E\uDD16 Dinero de la IA\".</small></div></div>\n  <section class=\"card investnow\"><h2>\uD83D\uDCB5 Invertir con mi dinero de pr\u00E1ctica <span class=\"more note\">dinero virtual, precios reales</span></h2>\n    <div class=\"mkt\">".concat(openTxt, "</div>\n    ").concat(picks.length ? "<div class=\"qbuy\">".concat(picks.map(function (c) {
                        var amt = Math.min(a.limits.max, Math.max(a.limits.min, baseAmt(c.light)));
                        return "<div class=\"qb\"><div class=\"qb-h\">".concat(coBadge(c.symbol, 34), "<div><b>").concat(esc(coName(c.symbol)), "</b><div class=\"note\">").concat(esc(c.symbol), " \u00B7 ").concat(light(c.light), "</div></div></div>\n      <button type=\"button\" class=\"btn\" data-qbuy=\"").concat(esc(c.symbol), "\" data-amt=\"").concat(amt, "\">").concat(a.marketOpen ? 'Comprar' : 'Dejar lista la compra de', " ").concat(usd(amt, 0), "</button></div>");
                    }).join(''), "</div>") : '<div class="note">Hoy JARVIS no recomienda comprar nada.</div>', "\n    <div class=\"msg\" id=\"qm\"></div>\n    ").concat(((_b = a.pending) === null || _b === void 0 ? void 0 : _b.length) ? "<h3 class=\"cs-h\">\u23F3 \u00D3rdenes listas para cuando abra la bolsa</h3><div class=\"pend\">".concat(a.pending.map(function (o) { return "<div class=\"pd\"><b>".concat(o.side === 'buy' ? '🟢 Comprar' : '🔴 Vender', " ").concat(esc(o.symbol), "</b>").concat(o.usd ? " \u00B7 ".concat(usd(o.usd, 0)) : ' · todo', "<button type=\"button\" class=\"btn ghost sm\" data-pcancel=\"").concat(esc(o.id), "\">Cancelar</button></div>"); }).join(''), "</div>") : '', "\n    <div class=\"note\" style=\"margin-top:8px\">\u00BFOtra empresa u otro monto? Usa <a href=\"#operar\">Operar (virtual)</a> m\u00E1s abajo. Para vender, toca \"Vender\" en tus posiciones.</div></section>\n  <section class=\"card mymoney\"><h2>Mi dinero <span class=\"more note\">JARVIS calcula todo con este monto</span></h2>\n    <form class=\"row\" id=\"bf\" style=\"align-items:flex-end;gap:12px;margin-top:10px\"><label style=\"width:220px\">\u00BFCu\u00E1nto dinero tienes para invertir? (US$)<input id=\"bu\" type=\"number\" min=\"10\" step=\"1\" value=\"").concat(B.usd, "\"></label>\n      <label style=\"flex-direction:row;align-items:center;gap:8px;padding-bottom:10px\"><input type=\"checkbox\" id=\"be\" style=\"width:auto\"").concat(B.emergency ? ' checked' : '', "> Ya tengo fondo de emergencia aparte</label><button class=\"btn\">Guardar</button></form>\n    <div class=\"grid g3\" style=\"gap:10px;margin-top:12px\"><div class=\"pbox\"><div class=\"l\">\"S\u00ED, invierte\" (").concat(myStyle().verde * 100, "%)</div><div class=\"v good\">").concat(usd(baseAmt('verde'), 0), "</div><div class=\"note\">por idea</div></div><div class=\"pbox\"><div class=\"l\">\"Invierte poco\" (").concat(myStyle().amarillo * 100, "%)</div><div class=\"v warn\">").concat(usd(baseAmt('amarillo'), 0), "</div><div class=\"note\">por idea</div></div><div class=\"pbox\"><div class=\"l\">M\u00E1ximo con pruebas fuertes (").concat(myStyle().max * 100, "%)</div><div class=\"v\">").concat(usd(Math.round(B.usd * myStyle().max), 0), "</div><div class=\"note\">solo si se cumplen las 5 condiciones</div></div></div>\n    <div class=\"note\" style=\"margin-top:8px\">Porcentajes seg\u00FAn tu estilo (").concat(esc({ conservador: 'conservador', equilibrado: 'equilibrado', arriesgado: 'arriesgado' }[(_c = MYBUDGET === null || MYBUDGET === void 0 ? void 0 : MYBUDGET.profile) === null || _c === void 0 ? void 0 : _c.style] || 'equilibrado'), "). <a href=\"#perfil\">Cambiar mi estilo \u25B8</a></div>\n    <div class=\"row\" style=\"margin-top:12px;gap:10px;align-items:center\"><button type=\"button\" class=\"btn ghost\" id=\"breset\">Empezar mi pr\u00E1ctica con ").concat(usd(B.usd, 0), "</button><span class=\"note\">Tu cuenta de pr\u00E1ctica empieza con ").concat(usd(a.start, 0), ". Si la reinicias, la anterior queda guardada en el historial (no se borra).</span></div><div class=\"msg\" id=\"bm\"></div></section>\n  <section class=\"card\"><h2>\u00BFQui\u00E9n va ganando? <a class=\"more\" href=\"#cuentas\">Ver la parte de la IA \u25B8</a></h2>").concat(vsStrip(a.returnPct, (_d = ia === null || ia === void 0 ? void 0 : ia.returnPct) !== null && _d !== void 0 ? _d : null, (_g = (_e = ia === null || ia === void 0 ? void 0 : ia.market) !== null && _e !== void 0 ? _e : (_f = a.compare) === null || _f === void 0 ? void 0 : _f.market) !== null && _g !== void 0 ? _g : null, 'me'), "<div class=\"note\" style=\"margin-top:6px\">Tu cartera y la de la IA est\u00E1n <b>separadas</b>: lo que compras t\u00FA no cambia la de la IA, ni al rev\u00E9s.</div></section>\n  <div><h1>\uD83E\uDDD1 Mi cartera virtual <span class=\"note\" style=\"font-size:15px;font-weight:600\">\u00B7 aqu\u00ED decides t\u00FA</span></h1><p class=\"sub\">Dinero de mentira, precios reales. Operaciones de ").concat(usd(a.limits.min, 0), " a ").concat(usd(a.limits.max, 0), ", como har\u00EDas t\u00FA. Mercado ").concat(a.marketOpen ? '<b class="good">abierto</b>' : '<b>cerrado</b> (9:30 a.m.–4:00 p.m. hora de Nueva York)', ".</p></div>\n  <section class=\"grid g4\">\n    <div class=\"card kpi\"><div class=\"l\">Valor total</div><div class=\"v\">").concat(usd(a.total), "</div><div class=\"s\"><span class=\"").concat(cls(a.returnPct), "\">").concat(pct(a.returnPct * 100, 2), " desde ").concat(usd(a.start, 0), "</span>").concat(a.fx ? " \u00B7 \u2248 ".concat(rd(Math.round(a.total * a.fx.rate))) : '', "</div></div>\n    <div class=\"card kpi\" style=\"--c:#4c7dff\"><div class=\"l\">Efectivo</div><div class=\"v\">").concat(usd(a.cash), "</div><div class=\"s\">Disponible para operar</div></div>\n    <div class=\"card kpi\" style=\"--c:#2fd58a\"><div class=\"l\">Ganancia realizada</div><div class=\"v ").concat(cls(a.realized), "\">").concat(usd(a.realized), "</div><div class=\"s\">Operaciones cerradas: ").concat(a.closed.length, "</div></div>\n    <div class=\"card kpi\" style=\"--c:#ffbf3c\"><div class=\"l\">No realizada</div><div class=\"v ").concat(cls(a.unrealized), "\">").concat(usd(a.unrealized), "</div><div class=\"s\">Provisional: cambia con el precio</div></div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\" id=\"operar\"><h2>Operar (virtual)</h2><form class=\"form\" id=\"of\">\n      <div class=\"grid g2\" style=\"gap:10px\"><label>Acci\u00F3n<select id=\"osym\">").concat(syms.map(function (s) { return "<option>".concat(esc(s), "</option>"); }).join(''), "</select></label>\n      <label>Operaci\u00F3n<select id=\"oside\"><option value=\"buy\">Comprar</option><option value=\"sell\">Vender</option></select></label></div>\n      <div class=\"grid g2\" style=\"gap:10px\"><label id=\"ousdl\">Monto (US$)<input id=\"ousd\" type=\"number\" min=\"").concat(a.limits.min, "\" max=\"").concat(a.limits.max, "\" step=\"0.5\" value=\"").concat(a.limits.max, "\"></label>\n      <label id=\"oqtyl\" class=\"hide\">Cantidad de acciones<input id=\"oqty\" type=\"number\" step=\"0.000001\" min=\"0\"></label></div>\n      <button class=\"btn\">Ejecutar</button><div class=\"msg\" id=\"om\"></div>\n      <div class=\"note\">Se usa el precio real m\u00E1s reciente. Con la bolsa cerrada, la orden queda lista y se hace sola al abrir, con el precio de ese momento.</div></form></div>\n    <div class=\"card\"><h2>\u00BFCu\u00E1nto invertir?</h2><form class=\"form\" id=\"af\">\n      <div class=\"grid g2\" style=\"gap:10px\"><label>Dinero que piensas invertir (US$)<input id=\"aamt\" type=\"number\" min=\"1\" value=\"100\"></label><label>\u00BFEn cu\u00E1nto tiempo lo necesitas? (meses)<input id=\"ahz\" type=\"number\" min=\"1\" value=\"12\"></label></div>\n      <div class=\"grid g2\" style=\"gap:10px\"><label>Costos fijos (env\u00EDo desde RD, comisi\u00F3n) US$<input id=\"afee\" type=\"number\" min=\"0\" step=\"0.5\" value=\"0\"></label><label>\u00BFTienes fondo de emergencia?<select id=\"aem\"><option value=\"1\">S\u00ED</option><option value=\"0\">No</option></select></label></div>\n      <label>\u00BFAlguien te propuso algo extremo? (opcional)<input id=\"aex\" placeholder=\"Ej.: meter el 100% en Tesla\"></label>\n      <button class=\"btn\">Analizar</button><div id=\"ares\"></div></form></div>\n  </section>\n  <section class=\"card\"><h2>Posiciones abiertas</h2>").concat(a.positions.length ? "<div class=\"tablewrap\"><table><tr><th>Acci\u00F3n</th><th class=\"r\">Cantidad</th><th class=\"r\">Costo promedio</th><th class=\"r\">Precio</th><th class=\"r\">Ganancia</th><th></th></tr>".concat(a.positions.map(function (p) { return "<tr><td class=\"sym\">".concat(esc(p.symbol), "</td><td class=\"r\">").concat(p.qty.toFixed(5), "</td><td class=\"r\">").concat(usd(p.avgCost), "</td><td class=\"r\">").concat(usd(p.price), "</td><td class=\"r ").concat(cls(p.pnl), "\">").concat(usd(p.pnl), " <span class=\"note\">").concat(pct(p.pnlPct * 100), "</span></td><td class=\"r\"><button type=\"button\" class=\"btn ghost sm\" data-sell=\"").concat(esc(p.symbol), "\" data-qty=\"").concat(p.qty, "\">Vender</button></td></tr>"); }).join(''), "</table></div>") : '<div class="empty">Sin posiciones. Compra desde aquí o desde una recomendación.</div>', "</section>\n  <section class=\"card\"><h2>Historial de operaciones <a class=\"more\" href=\"/api/export/operaciones\">Exportar a Excel (CSV) \u25B8</a></h2>").concat(a.closed.length ? "<div class=\"tablewrap\"><table><tr><th>Acci\u00F3n</th><th>Entr\u00F3</th><th>Sali\u00F3</th><th class=\"r\">Resultado</th></tr>".concat(a.closed.slice().reverse().map(function (c) { return "<tr><td class=\"sym\">".concat(esc(c.symbol), "</td><td>").concat(esc(c.openedAt.slice(0, 10)), " a ").concat(usd(c.entry), "</td><td>").concat(esc(c.closedAt.slice(0, 10)), " a ").concat(usd(c.exit), "</td><td class=\"r ").concat(cls(c.pnl), "\">").concat(usd(c.pnl), " (").concat(pct(c.pnlPct * 100), ")</td></tr>"); }).join(''), "</table></div>") : '<div class="empty">Aún no hay operaciones cerradas.</div>', "</section>")];
        }
    });
}); };
views.bolsa.after = function () {
    $('#bf').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () { var err_9; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                e.preventDefault();
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                return [4, api('/api/budget', { method: 'POST', body: { usd: Number($('#bu').value), emergency: $('#be').checked } })];
            case 2:
                _a.sent();
                return [4, loadBudget()];
            case 3:
                _a.sent();
                $('#bm').className = 'msg ok';
                $('#bm').textContent = 'Guardado. Todos los montos ahora se calculan con tu dinero.';
                setTimeout(render, 900);
                return [3, 5];
            case 4:
                err_9 = _a.sent();
                $('#bm').className = 'msg err';
                $('#bm').textContent = err_9.message;
                return [3, 5];
            case 5: return [2];
        }
    }); }); };
    $('#breset').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var r, err_10; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4, api('/api/account/reset', { method: 'POST' })];
            case 1:
                r = _a.sent();
                $('#bm').className = 'msg ok';
                $('#bm').textContent = "Listo: practicas con ".concat(usd(r.account.start_cash, 0), ". La cuenta anterior qued\u00F3 guardada.");
                setTimeout(render, 1100);
                return [3, 3];
            case 2:
                err_10 = _a.sent();
                $('#bm').className = 'msg err';
                $('#bm').textContent = err_10.message;
                return [3, 3];
            case 3: return [2];
        }
    }); }); };
    document.querySelectorAll('[data-qbuy]').forEach(function (b) { return b.onclick = function () { return __awaiter(void 0, void 0, void 0, function () {
        var sym, amt, r, err_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sym = b.dataset.qbuy, amt = Number(b.dataset.amt);
                    b.disabled = true;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/order', { method: 'POST', body: { symbol: sym, side: 'buy', usd: amt, confirmEmotion: true } })];
                case 2:
                    r = _a.sent();
                    $('#qm').className = 'msg ok';
                    $('#qm').textContent = r.queued ? "Listo: la compra de ".concat(sym, " por ").concat(usd(amt, 0), " se har\u00E1 sola cuando abra la bolsa.") : "Hecho: compraste ".concat(r.qty, " ").concat(sym, " a ").concat(usd(r.execPrice), ".");
                    setTimeout(render, 1600);
                    return [3, 4];
                case 3:
                    err_11 = _a.sent();
                    $('#qm').className = 'msg err';
                    $('#qm').textContent = err_11.message;
                    b.disabled = false;
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); }; });
    document.querySelectorAll('[data-pcancel]').forEach(function (b) { return b.onclick = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, api("/api/orders/pending/".concat(b.dataset.pcancel, "/cancel"), { method: 'POST' }).catch(function () { })];
            case 1:
                _a.sent();
                render();
                return [2];
        }
    }); }); }; });
    document.querySelectorAll('[data-sell]').forEach(function (b) { return b.onclick = function () { return __awaiter(void 0, void 0, void 0, function () {
        var sym, qty, r, err_12;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sym = b.dataset.sell, qty = Number(b.dataset.qty);
                    if (!confirm("\u00BFVender todo ".concat(sym, "?")))
                        return [2];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/order', { method: 'POST', body: { symbol: sym, side: 'sell', qty: qty } })];
                case 2:
                    r = _a.sent();
                    alert(r.queued ? "La venta de ".concat(sym, " se har\u00E1 sola cuando abra la bolsa.") : "Vendiste ".concat(sym, " a ").concat(usd(r.execPrice), "."));
                    render();
                    return [3, 4];
                case 3:
                    err_12 = _a.sent();
                    alert(err_12.message);
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); }; });
    $('#oside').onchange = function () { var s = $('#oside').value === 'sell'; $('#ousdl').classList.toggle('hide', s); $('#oqtyl').classList.toggle('hide', !s); };
    $('#of').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var r, err_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/order', { method: 'POST', body: { symbol: $('#osym').value, side: $('#oside').value, usd: Number($('#ousd').value), qty: Number($('#oqty').value), confirmEmotion: !!window.__emo } })];
                case 2:
                    r = _a.sent();
                    window.__emo = false;
                    $('#om').className = 'msg ok';
                    $('#om').textContent = r.queued ? "Listo: tu orden de ".concat(r.order.side === 'buy' ? 'compra' : 'venta', " de ").concat(r.order.symbol, " se har\u00E1 sola cuando abra la bolsa.") : "Hecho: ".concat(r.side === 'buy' ? 'compraste' : 'vendiste', " ").concat(r.qty, " ").concat(r.symbol, " a ").concat(usd(r.execPrice), " (precio observado ").concat(usd(r.observedPrice), ").");
                    setTimeout(render, 1500);
                    return [3, 4];
                case 3:
                    err_13 = _a.sent();
                    $('#om').className = 'msg err';
                    $('#om').textContent = err_13.message;
                    if (/caliente|esperar/.test(err_13.message)) {
                        $('#om').innerHTML += ' <button type="button" class="btn ghost" id="emo" style="padding:3px 10px">Entiendo, seguir igual</button>';
                        $('#emo').onclick = function () { window.__emo = true; $('#of').requestSubmit(); };
                    }
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); };
    $('#af').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    return [4, api('/api/advice', { method: 'POST', body: { amountUsd: Number($('#aamt').value), horizonMonths: Number($('#ahz').value), fixedCostUsd: Number($('#afee').value), hasEmergencyFund: $('#aem').value === '1', extremeIdea: $('#aex').value || null } })];
                case 1:
                    r = _a.sent();
                    $('#ares').innerHTML = "<div class=\"answer\">".concat(light(r.light), "<div style=\"margin-top:8px\">").concat(r.notes.map(function (n) { return "<div>\u2022 ".concat(esc(n), "</div>"); }).join('') || '<div>Tu situación permite invertir ese monto.</div>', "</div>\n      ").concat(r.plan.length ? "<div style=\"margin-top:10px\"><b>C\u00F3mo repartirlo:</b>".concat(r.plan.map(function (p) { return "<div class=\"w\" style=\"margin-top:6px\"><span>".concat(esc(p.part), "</span><b>").concat(p.pct, "%</b><div class=\"bar\"><span style=\"width:").concat(p.pct, "%;background:#38d6f5\"></span></div><div class=\"note\" style=\"grid-column:1/-1\">").concat(esc(p.why), "</div></div>"); }).join(''), "</div>") : '', "\n      ").concat(r.projectionSPY ? "<div style=\"margin-top:10px\">".concat(projBox(r.projectionSPY, "Si lo pones en un fondo del mercado (SPY) por ".concat($('#ahz').value, " meses")), "</div>") : '', "</div>");
                    return [2];
            }
        });
    }); };
};
views.loterias = function () { return __awaiter(void 0, void 0, void 0, function () {
    var L, g0;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, api('/api/lottery')];
            case 1:
                L = _a.sent();
                g0 = L.games.find(function (g) { return g.draws; }) || L.games[0];
                window.__L = L;
                return [2, "<div><h1>Loter\u00EDas RD</h1><p class=\"sub\">Resultados verificados, vigilancia de trampas y m\u00E9todos puestos a prueba contra el azar. Si los sorteos son justos, ning\u00FAn n\u00FAmero es m\u00E1s probable que otro.</p></div>\n  <section class=\"card pluscard\"><h2>\u2728 Expl\u00EDcame las loter\u00EDas (IA)</h2><p class=\"note\">La IA lee lo que encontr\u00F3 JARVIS (vigilancia de trampas, m\u00E9todos probados, cu\u00E1nto se pierde en promedio) y te lo explica en palabras simples, con consejos para jugar con cabeza. <b>Honestidad:</b> si los sorteos son justos, ninguna IA puede adivinar el pr\u00F3ximo n\u00FAmero.</p>\n    <div id=\"lplus\"></div><button type=\"button\" class=\"btn ghost\" id=\"lplusb\">Expl\u00EDcamelo</button></section>\n  <section class=\"grid g4\">\n    <div class=\"card kpi\"><div class=\"l\">Jugadas virtuales</div><div class=\"v\">".concat(L.stats.settled, "</div><div class=\"s\">").concat(L.stats.pending, " pendientes de sorteo</div></div>\n    <div class=\"card kpi\" style=\"--c:#2fd58a\"><div class=\"l\">Aciertos</div><div class=\"v\">").concat(L.stats.hitRate != null ? L.stats.hitRate + '%' : '—', "</div><div class=\"s\">").concat(L.stats.wins, " premios \u00B7 racha r\u00E9cord ").concat(L.stats.streak.bestWin, "</div></div>\n    <div class=\"card kpi\" style=\"--c:#ff5d6c\"><div class=\"l\">Volvi\u00F3 de lo jugado</div><div class=\"v ").concat(L.stats.per100 >= 100 ? 'good' : 'bad', "\">").concat(L.stats.per100 != null ? L.stats.per100 + '%' : '—', "</div><div class=\"s\">").concat(L.stats.per100 != null ? (L.stats.per100 >= 100 ? "gan\u00F3 ".concat((L.stats.per100 - 100).toFixed(1), "% m\u00E1s de lo jugado") : "perdi\u00F3 ".concat((100 - L.stats.per100).toFixed(1), "% de lo jugado")) + (L.stats.settled < 200 ? ' (con pocas jugadas, es suerte)' : '') : '', "</div><div class=\"s\">Apostado ").concat(rd(L.stats.staked), " \u00B7 cobrado ").concat(rd(L.stats.paid), "</div></div>\n    <div class=\"card kpi\" style=\"--c:#38d6f5\"><div class=\"l\">").concat(term('valor esperado', 'Valor esperado'), "</div><div class=\"v\">").concat(rdRaw(L.expected.quiniela), "</div><div class=\"s\">Quiniela \u00B7 pal\u00E9 ").concat(rdRaw(L.expected.pale), " \u00B7 tripleta ").concat(rdRaw(L.expected.tripleta), "</div></div>\n  </section>\n  <div id=\"jvlot\"><div class=\"card note\">Cargando lo que juega JARVIS\u2026</div></div>\n  <div class=\"row\" id=\"gtabs\">").concat(L.games.map(function (g) { return "<button class=\"btn ".concat(g.id === g0.id ? '' : 'ghost', "\" data-g=\"").concat(g.id, "\">").concat(esc(g.name), "</button>"); }).join(''), "</div>\n  <div id=\"gview\"></div>")];
        }
    });
}); };
var DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var fdate = function (d) {
    var x = new Date(d + 'T12:00:00Z');
    var today = new Date().toISOString().slice(0, 10), tm = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    return d === today ? 'hoy' : d === tm ? 'mañana' : "".concat(DAYS[x.getUTCDay()], " ").concat(x.getUTCDate(), " ").concat(x.toLocaleDateString('es-DO', { month: 'short', timeZone: 'UTC' }));
};
var lateSeal = function (sealedAt, date, time) { return !!(sealedAt && date && time) && Date.parse(sealedAt) > Date.parse("".concat(date, "T").concat(time, ":00-04:00")); };
var lateTag = function (x) { return (lateSeal(x.sealedAt, x.date, x.time) ? ' <b class="bad">⚠️ sellado después del sorteo: no cuenta</b>' : ' <span class="good">✓ antes del sorteo</span>'); };
var fmtWhen = function (iso) { return iso ? new Date(iso).toLocaleString('es-DO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'; };
var ampm = function (t) { if (!t)
    return ''; var _a = __read(t.split(':').map(Number), 2), h = _a[0], m = _a[1]; return "".concat(((h + 11) % 12) + 1, ":").concat(String(m).padStart(2, '0'), " ").concat(h < 12 ? 'a. m.' : 'p. m.'); };
var untilTxt = function (iso) { var m = Math.round((Date.parse(iso) - Date.now()) / 60e3); return m <= 0 ? 'cerrado' : m < 60 ? "cierra en ".concat(m, " min") : "cierra en ".concat(Math.floor(m / 60), " h ").concat(m % 60, " min"); };
function loadJarvisLottery() {
    return __awaiter(this, void 0, void 0, function () {
        var el, B, W, e_6, S, ST, balls, wallet;
        var _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    el = $('#jvlot');
                    if (!el)
                        return [2];
                    W = null;
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4, Promise.all([api('/api/lottery/jarvis'), api('/api/jarvis/cuentas').then(function (c) { return c.loteria; }).catch(function () { return null; })])];
                case 2:
                    _a = __read.apply(void 0, [_c.sent(), 2]), B = _a[0], W = _a[1];
                    return [3, 4];
                case 3:
                    e_6 = _c.sent();
                    el.innerHTML = "<div class=\"card note\">".concat(esc(e_6.message), "</div>");
                    return [2];
                case 4:
                    if (B.rate)
                        FX = B.rate;
                    S = B.summary, ST = { acerto: ['✅', 'Acertó', 'good'], fallo: ['❌', 'Falló', 'bad'], esperando: ['⏳', 'Esperando resultado', 'warn'] };
                    balls = function (nums, hit) { return nums.map(function (n) { return "<span class=\"ball".concat(hit && hit.includes(n) ? ' hit' : '', "\">").concat(esc(n), "</span>"); }).join(''); };
                    wallet = W ? "<h3 class=\"cs-h\">\uD83D\uDCB0 El dinero de JARVIS en loter\u00EDa</h3>".concat(flow([['Empezó con', rdu(W.startRd), '', ''], ['Jugó', rdu(W.playedRd), '', "".concat(W.plays, " sorteos")], ['Ganó (premios)', rdu(W.wonRd), W.wonRd > 0 ? 'good' : '', "".concat(W.hits, " con premio")], ['Perdió', rdu(W.lostRd), W.lostRd > 0 ? 'bad' : '', "".concat(W.settled - W.hits, " sin premio")], ['Le queda', rdu(W.leftRd), W.leftRd >= W.startRd ? 'good' : 'bad', "".concat(W.leftRd >= W.startRd ? 'va ganando' : 'va perdiendo', " ").concat(rdRaw(Math.abs(W.leftRd - W.startRd))).concat(W.pendingRd ? " \u00B7 ".concat(rdRaw(W.pendingRd), " esperando sorteo") : '')]]), "<div class=\"note\" style=\"margin-bottom:6px\">Es el dinero de <b>su n\u00FAmero</b> de cada sorteo. Las jugadas de prueba de los 6 m\u00E9todos se cuentan aparte (arriba, en \"Jugadas virtuales\").</div>") : '';
                    el.innerHTML = "<section class=\"card jvlot\"><h2>\uD83C\uDFB1 Lo que juega JARVIS <span class=\"more note\">sellado antes de cada sorteo</span></h2>".concat(wallet, "\n    ").concat(W ? '' : "<div class=\"jvsum\">".concat([['🎯', "".concat(S.hits, " de ").concat(S.picks), 'aciertos'], ['💵', rdu(S.stakedRd), 'jugado (virtual)'], ['🏆', rdu(S.wonRd), 'cobrado'], [S.netRd >= 0 ? '📈' : '📉', rdu(S.netRd, { sign: true }), 'resultado']].map(function (_a) {
                        var _b = __read(_a, 3), i = _b[0], v = _b[1], l = _b[2];
                        return "<div><span>".concat(i, "</span><b class=\"").concat(l === 'resultado' ? (S.netRd >= 0 ? 'good' : 'bad') : '', "\">").concat(v, "</b><small>").concat(l, "</small></div>");
                    }).join(''), "</div>"), "\n    <h3 class=\"cs-h\">\u23ED\uFE0F Pr\u00F3ximos sorteos</h3>\n    <div class=\"jvnext\">").concat(B.upcoming.map(function (u) {
                        var _a;
                        return "<div class=\"jvn\">\n      <div class=\"jvn-h\"><b>".concat(esc(u.name), "</b><span class=\"chip\">").concat(untilTxt(u.closesAt), "</span></div>\n      <div class=\"jvn-d\">\uD83D\uDCC5 ").concat(fdate(u.date), " \u00B7 \uD83D\uDD50 ").concat(ampm(u.time)).concat(u.verified ? '' : ' <span class="note">(hora por confirmar)</span>', "</div>\n      ").concat(u.pick ? "<div class=\"jvn-b\"><div class=\"balls\">".concat(balls(u.pick.numbers), "</div><div><div class=\"note\">").concat(u.pick.numbers.length > 1 ? "Sus ".concat(u.pick.numbers.length, " n\u00FAmeros \u00B7 RD$").concat(u.pick.perNumberRd, " c/u") : 'Su número · juega', "</div><b>").concat(rdu(u.pick.stakeRd), "</b></div></div>").concat(u.pick.stakeWhy ? "<div class=\"note\">\uD83D\uDCB5 ".concat(esc(u.pick.stakeWhy), "</div>") : '', "\n        <div class=\"jvn-w\"><b>\u00BFPor qu\u00E9?</b> M\u00E9todo \"").concat(esc(u.pick.methodLabel), "\": ").concat(esc(u.pick.why), "</div>\n        <div class=\"note\">").concat(u.pick.sealedAt ? "\uD83D\uDD12 Sellado ".concat(hhmm(u.pick.sealedAt), " \u00B7 huella ").concat(esc((u.pick.hash || '').slice(0, 10)), "\u2026 (ya no se puede cambiar)") : '📝 Se sella automáticamente antes del cierre', "</div>\n        ").concat(u.plays.length ? "<details><summary class=\"note\">Lo que juegan los otros ".concat(u.plays.length, " m\u00E9todos de prueba</summary><div class=\"jvo\">").concat(u.plays.map(function (p) { return "<span><i>".concat(esc(p.label), "</i> ").concat(p.numbers.map(esc).join(' '), "</span>"); }).join(''), "</div></details>") : '')
                            : "<div class=\"note\" style=\"margin-top:8px\">".concat(u.enough ? 'Preparando su número…' : "Tiene ".concat(u.draws, " sorteos guardados y necesita 10 para elegir."), "</div>").concat(((_a = u.sources) === null || _a === void 0 ? void 0 : _a.length) ? "<div class=\"srcst\">".concat(u.sources.map(function (x) { return "<div>".concat(x.ok ? '✅' : '❌', " <b>").concat(esc(x.source), "</b>: ").concat(x.ok ? "ley\u00F3 ".concat(x.saved, " resultados") : esc(x.error || 'no respondió'), "</div>"); }).join(''), "<div class=\"note\">Si las dos p\u00E1ginas salen con \u274C, m\u00E1ndale una foto de esto a Claude.</div></div>") : ''), "</div>");
                    }).join(''), "</div>\n    ").concat(((_b = B.wins) === null || _b === void 0 ? void 0 : _b.length) ? "<h3 class=\"cs-h\">\uD83C\uDFC6 Jugadas que ganaron (".concat(B.wins.length, ")</h3><div class=\"note\" style=\"margin-bottom:8px\">Cada una se sell\u00F3 <b>antes</b> del sorteo: compara la hora en que apost\u00F3 con la hora del sorteo.</div>\n    <div class=\"jvwins\">").concat(B.wins.map(function (w) { return "<div class=\"jw\"><div class=\"jw-h\"><b>".concat(esc(w.name), "</b> <span class=\"note\">").concat(fdate(w.date), "</span><span class=\"tag ").concat(w.kind === 'su_numero' ? 'dato' : '', "\">").concat(w.kind === 'su_numero' ? '⭐ su número' : "prueba: ".concat(esc(w.methodLabel)), "</span><b class=\"good jw-p\">+").concat(rdu(w.prizeRd - w.stakeRd), "</b></div>\n      <div class=\"jw-b\"><div><div class=\"note\">Jug\u00F3</div><div class=\"balls\">").concat(w.numbers.map(function (n) { var _a; return "<span class=\"ball".concat(((_a = w.draw) === null || _a === void 0 ? void 0 : _a.includes(n)) ? ' hit' : '', "\">").concat(esc(n), "</span>"); }).join(''), "</div></div><div class=\"jvp-vs\">\u2192</div><div><div class=\"note\">Sali\u00F3</div><div class=\"balls\">").concat((w.draw || []).map(function (n) { return "<span class=\"ball".concat(w.numbers.includes(n) ? ' hit' : '', "\">").concat(esc(n), "</span>"); }).join(''), "</div></div></div>\n      <div class=\"jw-t\">\uD83D\uDD12 Apost\u00F3: <b>").concat(fmtWhen(w.sealedAt), "</b>").concat(lateTag(w), " \u00B7 \uD83C\uDFB0 Sorteo: <b>").concat(fdate(w.date), " ").concat(ampm(w.time), "</b> \u00B7 \uD83D\uDCF0 Resultado visto: <b>").concat(w.resultSeenAt ? fmtWhen(w.resultSeenAt) : '—', "</b></div>\n      <div class=\"note\">Apost\u00F3 ").concat(rdu(w.stakeRd), " y cobr\u00F3 ").concat(rdu(w.prizeRd), " \u00B7 sali\u00F3 en ").concat(w.positions.map(function (p) { return "".concat(p, "\u00AA"); }).join(' y '), " posici\u00F3n (la ").concat(w.positions[0] === 1 ? '1ª paga 60' : w.positions[0] === 2 ? '2ª paga 8' : '3ª paga 4', " veces lo apostado)").concat(w.stakeRd < 100 ? ' · <b>jugada vieja</b>: era de antes del mínimo de RD$100' : '', " \u00B7 huella ").concat(esc((w.hash || '').slice(0, 10)), "\u2026</div></div>"); }).join(''), "</div>") : '', "\n    <h3 class=\"cs-h\">\uD83E\uDDFE Lo que ya jug\u00F3 y c\u00F3mo le fue</h3>\n    ").concat(B.past.length ? "<div class=\"jvpast\">".concat(B.past.map(function (p) {
                        var _a = __read(ST[p.status], 3), ic = _a[0], tx = _a[1], cl = _a[2];
                        return "<div class=\"jvp k-".concat(cl, "\">\n      <div class=\"jvp-h\"><b>").concat(esc(p.name), "</b> <span class=\"note\">").concat(fdate(p.date), " \u00B7 ").concat(ampm(p.time), "</span><span class=\"jvp-s ").concat(cl, "\">").concat(ic, " ").concat(tx, "</span></div>\n      <div class=\"jvp-c\"><div><div class=\"note\">Jug\u00F3</div><div class=\"balls\">").concat(balls(p.numbers, p.draw), "</div></div><div class=\"jvp-vs\">vs</div><div><div class=\"note\">Sali\u00F3</div><div class=\"balls\">").concat(p.draw ? balls(p.draw, p.numbers) : '<span class="note">todavía no</span>', "</div></div>\n        <div class=\"jvp-m\"><div class=\"note\">Resultado</div><b class=\"").concat(p.pnlRd > 0 ? 'good' : p.pnlRd < 0 ? 'bad' : '', "\">").concat(p.pnlRd != null ? rdu(p.pnlRd, { sign: true }) : '—', "</b></div></div>\n      <div class=\"jw-t\">\uD83D\uDD12 Apost\u00F3: <b>").concat(fmtWhen(p.sealedAt), "</b>").concat(lateTag(p), " \u00B7 \uD83C\uDFB0 Sorteo: <b>").concat(ampm(p.time), "</b>").concat(p.resultSeenAt ? " \u00B7 \uD83D\uDCF0 Resultado visto: <b>".concat(fmtWhen(p.resultSeenAt), "</b>") : '', "</div>\n      <div class=\"note jvp-e\">").concat(esc(p.explain), " <b>Por qu\u00E9 lo eligi\u00F3:</b> ").concat(esc(p.methodLabel), " \u2014 ").concat(esc(p.why), "</div>\n      ").concat(p.others.length ? "<details><summary class=\"note\">C\u00F3mo les fue a los otros m\u00E9todos en ese sorteo</summary><div class=\"jvo\">".concat(p.others.map(function (o) { return "<span class=\"".concat(o.won ? 'good' : '', "\"><i>").concat(esc(o.label), "</i> ").concat(o.numbers.map(esc).join(' '), " ").concat(o.won ? '✅' : '❌', "</span>"); }).join(''), "</div></details>") : '', "\n    </div>");
                    }).join(''), "</div>") : '<div class="empty">Todavía no ha jugado ningún sorteo.</div>', "\n    <div class=\"answer\" style=\"margin-top:12px\">\uD83D\uDD12 ").concat(esc(B.honest), "</div></section>");
                    return [2];
            }
        });
    });
}
views.loterias.after = function () {
    loadJarvisLottery();
    if ($('#lplusb'))
        $('#lplusb').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var r, err_14; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    $('#lplus').innerHTML = '<div class="note">Pensando…</div>';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/lottery/plus', { method: 'POST' })];
                case 2:
                    r = _a.sent();
                    $('#lplus').innerHTML = r.text ? "<div class=\"answer\">".concat(esc(r.text).replace(/\n/g, '<br>'), "</div>") : "<div class=\"msg err\">".concat(esc(r.error || 'La IA no respondió. Revisa en Ajustes → Claves que la clave de ChatGPT esté puesta.'), "</div>");
                    return [3, 4];
                case 3:
                    err_14 = _a.sent();
                    $('#lplus').innerHTML = "<div class=\"msg err\">".concat(esc(err_14.message), "</div>");
                    return [3, 4];
                case 4: return [2];
            }
        }); }); };
    var L = window.__L;
    var show = function (id) {
        var _a;
        document.querySelectorAll('#gtabs button').forEach(function (b) { return b.classList.toggle('ghost', b.dataset.g !== id); });
        var g = L.games.find(function (x) { return x.id === id; });
        var exp = g.draws * 3 / 100;
        var maxc = g.freq ? Math.max.apply(Math, __spreadArray([1], __read(Object.values(g.freq)), false)) : 1, enough = g.draws >= 100;
        var heat = g.freq ? Object.keys(g.freq).sort().map(function (n) {
            var c = g.freq[n];
            var z = exp ? (c - exp) / Math.sqrt(exp) : 0;
            var bg = enough && z > 3 ? '#ff5d6c' : enough && z > 2 ? '#ffbf3c' : "color-mix(in srgb, #38d6f5 ".concat(Math.round(c / maxc * 55), "%, #111a2e)");
            return "<div style=\"background:".concat(bg, ";color:#e8eefc\" title=\"").concat(n, ": sali\u00F3 ").concat(c, " veces (esperado ").concat(exp.toFixed(1), ")\">").concat(n, "</div>");
        }).join('') : '';
        var V = g.votes;
        $('#gview').innerHTML = "\n    ".concat(V ? "<section class=\"card votecard\"><h2>\uD83D\uDDF3\uFE0F Votaci\u00F3n de los m\u00E9todos <span class=\"more note\">sorteo del ".concat(esc(V.date), "</span></h2>\n      <div class=\"vote-top\">").concat(V.top.map(function (t) { var _a; return "<div class=\"vt\"><span class=\"ball big\">".concat(esc(t.num), "</span><div class=\"vt-c\"><b>").concat(t.votes, " de ").concat(V.totalVoters, " votos</b><div class=\"vbar\"><span style=\"width:").concat(Math.round(t.votes / V.totalVoters * 100), "%\"></span></div>").concat(t.prob != null ? "<div class=\"note\">\uD83D\uDCC8 ".concat(t.prob, "% de salir").concat(V.order ? " \u00B7 ".concat((_a = V.order.find(function (o) { return o.num === t.num; })) === null || _a === void 0 ? void 0 : _a.rank, "\u00BA para jugar") : '', "</div>") : '', "</div></div>"); }).join(''), "</div>\n      ").concat(((_a = V.order) === null || _a === void 0 ? void 0 : _a.length) ? "<div class=\"vorder\"><div class=\"note\" style=\"margin-bottom:6px\"><b>\uD83C\uDFAF Orden para jugar seg\u00FAn lo aprendido</b> (de m\u00E1s a menos probable). Lo normal para cualquier n\u00FAmero es <b>".concat(V.fairProb, "%</b>; aprendido de ").concat(V.draws, " sorteos y de c\u00F3mo les va a los m\u00E9todos de verdad.</div><div class=\"vo-list\">").concat(V.order.map(function (o) { return "<div class=\"vo".concat(o.rank <= 3 ? ' top' : '', "\"><small>").concat(o.rank, "\u00BA</small><span class=\"ball\" style=\"width:30px;height:30px;font-size:13px\">").concat(esc(o.num), "</span><b>").concat(o.prob, "%</b><small class=\"").concat(o.vsFair > 0 ? 'good' : o.vsFair < 0 ? 'bad' : '', "\">").concat(o.vsFair > 0 ? '+' : '').concat(o.vsFair, "% vs normal</small><small>").concat(o.votes, " voto").concat(o.votes === 1 ? '' : 's', " \u00B7 sali\u00F3 ").concat(o.timesOut, " veces</small></div>"); }).join(''), "</div><div class=\"note\" style=\"margin-top:6px\">Las diferencias son peque\u00F1as a prop\u00F3sito: si los sorteos son justos, ning\u00FAn n\u00FAmero es mucho m\u00E1s probable que otro. Si un m\u00E9todo demuestra que le gana al azar, sus n\u00FAmeros suben en este orden.</div></div>") : '', "\n      <div class=\"note\" style=\"margin:8px 0\">Los n\u00FAmeros que m\u00E1s m\u00E9todos eligieron. <b>Probabilidad real:</b> ").concat(esc(V.chance), "</div>\n      <details><summary class=\"note\">Ver c\u00F3mo vot\u00F3 cada m\u00E9todo y c\u00F3mo le va de verdad</summary><div class=\"tablewrap\"><table><tr><th>M\u00E9todo</th><th>Su voto</th><th class=\"r\">Jugadas reales</th><th class=\"r\">\u00BFLe gana al azar?</th></tr>").concat(V.voters.map(function (v) { return "<tr><td><b>".concat(esc(v.label), "</b><div class=\"note\">").concat(esc(v.why), "</div></td><td><div class=\"balls\">").concat(v.nums.map(function (n) { return "<span class=\"ball\" style=\"width:30px;height:30px;font-size:13px\">".concat(esc(n), "</span>"); }).join(''), "</div></td><td class=\"r\">").concat(v.n ? "".concat(v.wins, " premios en ").concat(v.n) : '—', "</td><td class=\"r\">").concat(v.beatsChance == null ? '<span class="note">pocos datos</span>' : v.beatsChance ? '<b class="good">Sí, por ahora</b>' : '<b class="bad">No</b>', "</td></tr>"); }).join(''), "</table></div></details>\n      <div class=\"answer\" style=\"margin-top:8px\">\uD83E\uDDE0 ").concat(esc(V.verdict), "</div></section>") : '', "\n    <section class=\"grid g2\">\n      <div class=\"card\"><h2>Su n\u00FAmero del pr\u00F3ximo sorteo</h2>").concat(g.pick ? "<div class=\"balls\" style=\"margin-bottom:8px\">".concat(g.pick.numbers.map(function (n) { return "<span class=\"ball\">".concat(esc(n), "</span>"); }).join(''), " ").concat(light(g.pick.light), "</div>\n        <div><b>").concat(esc(g.pick.methodLabel), ":</b> ").concat(esc(g.pick.why), "</div><div class=\"note\" style=\"margin-top:4px\">").concat(esc(g.pick.record), "</div>\n        ").concat(g.pick.stake ? "<div style=\"margin-top:8px\"><b>\uD83D\uDCB5 Cu\u00E1nto jugar: ".concat(rdu(g.pick.stake.suggested), "</b> <span class=\"note\">\u00B7 ").concat(esc(g.pick.stake.why), "</span></div>") : '', "<div class=\"answer\" style=\"margin-top:8px\">\u26A0 ").concat(esc(g.pick.warning), "</div><div class=\"note\">Sorteo del ").concat(esc(g.pick.date), " \u00B7 cierra ").concat(hhmm(g.pick.closesAt), " ").concat(g.timeVerified ? '' : '(horario por verificar)', "</div><a class=\"btn ghost\" href=\"#analisis/loteria/").concat(esc(id), "\" style=\"margin-top:8px;display:inline-block\">An\u00E1lisis completo \u25B8</a>") : '<div class="empty">Faltan sorteos para elegir.</div>', "</div>\n      <div class=\"card\"><h2>\u00DAltimos resultados</h2>").concat(g.last.length ? "<table>".concat(g.last.map(function (d) { return "<tr><td>".concat(esc(d.date), "</td><td><div class=\"balls\">").concat(d.nums.map(function (n) { return "<span class=\"ball\" style=\"width:28px;height:28px;font-size:12px\">".concat(esc(n), "</span>"); }).join(''), "</div></td><td><span class=\"src ").concat(d.status === 'verificado' ? 'ok' : '', "\">").concat(d.status === 'verificado' ? '2 fuentes' : d.status === 'estable' ? '1 fuente (confirmada)' : d.status === 'una_fuente' ? '1 fuente (esperando confirmar)' : esc(d.status), "</span></td></tr>"); }).join(''), "</table>") : '<div class="empty">Sin resultados todavía.</div>', "</div>\n    </section>\n    <section class=\"grid g2\">\n      <div class=\"card\"><h2>Mapa de n\u00FAmeros (").concat(g.draws, " sorteos)</h2>").concat(heat ? "<div class=\"heat\">".concat(heat, "</div><div class=\"legend\"><span><i style=\"background:color-mix(in srgb,#38d6f5 55%,#111a2e)\"></i>M\u00E1s veces</span><span><i style=\"background:#111a2e;border:1px solid #1e2a44\"></i>Menos veces</span>").concat(enough ? '<span><i style="background:#ffbf3c"></i>Raro</span><span><i style="background:#ff5d6c"></i>Muy raro: revisar</span>' : '', "</div><div class=\"note\" style=\"margin-top:6px\">").concat(enough ? 'Rojo solo si sale tanto que el azar casi no lo explica.' : "Con ".concat(g.draws, " sorteos estas diferencias son ruido normal del azar; las alertas de color se activan desde 100 sorteos."), "</div>") : '<div class="empty">Sin datos.</div>', "</div>\n      <div class=\"card\"><h2>Vigilancia de trampas</h2>").concat(g.scan ? "<div class=\"answer\" style=\"margin-bottom:10px\">".concat(esc(g.scan.verdict), "</div><div class=\"note\" style=\"margin-bottom:8px\">\uD83D\uDCA1 <b>\u00BFPor qu\u00E9 los % son tan distintos?</b> Cada prueba mira algo diferente, y el % dice <b>qu\u00E9 tan f\u00E1cil es que eso pase por pura suerte</b>. Si los sorteos son limpios, estos % caen al azar en cualquier parte entre 0% y 100% (por eso unos dan 9% y otros 55%): <b>todos son normales</b>. Solo preocupa si uno baja de <b>1%</b> y se repite con m\u00E1s sorteos.</div><table><tr><th>Prueba</th><th class=\"r\">Chance de que sea suerte</th><th>Estado</th></tr>").concat(g.scan.tests.map(function (t) { return "<tr><td>".concat(esc(t.title), "<div class=\"note\">").concat(esc(t.detail), "</div></td><td class=\"r\">").concat((t.p * 100).toFixed(1), "%</td><td>").concat(t.anomaly ? '<span class="light rojo"><i></i>Revisar</span>' : '<span class="light verde"><i></i>Normal</span>', "</td></tr>"); }).join(''), "</table>") : '<div class="empty">Se necesitan al menos 10 sorteos.</div>', "</div>\n    </section>\n    <section class=\"card\"><h2>M\u00E9todos contra el azar</h2>").concat(g.compare ? "<div class=\"answer\" style=\"margin-bottom:10px\">".concat(esc(g.compare.verdict), "</div><div class=\"tablewrap\"><table><tr><th>M\u00E9todo</th><th class=\"r\">Jugadas</th><th class=\"r\">Premios</th><th class=\"r\">Devuelve / RD$100</th><th class=\"r\">\u00BFLe gana al azar?</th></tr>\n      <tr><td><b>Azar puro</b> <span class=\"note\">(400 jugadores simulados)</span></td><td class=\"r\">\u2014</td><td class=\"r\">\u2014</td><td class=\"r\">").concat(rdRaw(g.compare.random.median), " <span class=\"note\">(").concat(g.compare.random.lo, "\u2013").concat(g.compare.random.hi, ")</span></td><td class=\"r\">Referencia</td></tr>\n      ").concat(g.compare.methods.map(function (m) { return "<tr><td>".concat(esc(m.label), "<div class=\"note\">").concat(esc(m.why), "</div></td><td class=\"r\">").concat(m.plays, "</td><td class=\"r\">").concat(m.wins, "</td><td class=\"r ").concat(m.per100 >= 100 ? 'good' : 'bad', "\">").concat(rdRaw(m.per100), "</td><td class=\"r\">").concat(m.beatsRandom ? '<span class="light verde"><i></i>Sí (confirmar)</span>' : "<span class=\"light gris\"><i></i>No</span> <span class=\"note\">".concat((m.pBetterThanRandom * 100).toFixed(0), "% por azar</span>"), "</td></tr>"); }).join(''), "</table></div>") : '<div class="empty">Se necesitan al menos 20 sorteos.</div>', "</section>\n    <section class=\"card\"><h2>Jugar en virtual</h2><form class=\"form\" id=\"lf\"><div class=\"grid g4\" style=\"gap:10px\">\n      <label>Tipo<select id=\"lk\"><option value=\"quiniela\">Quiniela</option><option value=\"pale\">Pal\u00E9</option><option value=\"tripleta\">Tripleta</option></select></label>\n      <label>N\u00FAmeros (separados por espacio)<input id=\"ln\" placeholder=\"27 o 27 45\"></label><label>Monto RD$ (m\u00EDnimo 100)<input id=\"ls\" type=\"number\" min=\"100\" step=\"25\" value=\"100\"></label><label>&nbsp;<button class=\"btn\">Sellar jugada</button></label></div><div class=\"msg\" id=\"lm\"></div></form></section>");
        $('#lf').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
            var r, err_15;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        e.preventDefault();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4, api('/api/lottery/play', { method: 'POST', body: { game: id, kind: $('#lk').value, numbers: $('#ln').value.trim().split(/\s+/).map(function (x) { return x.padStart(2, '0'); }), stake: Number($('#ls').value) } })];
                    case 2:
                        r = _a.sent();
                        $('#lm').className = 'msg ok';
                        $('#lm').textContent = "Sellada para el sorteo del ".concat(r.date, ". Huella: ").concat(r.hash.slice(0, 12), "\u2026");
                        return [3, 4];
                    case 3:
                        err_15 = _a.sent();
                        $('#lm').className = 'msg err';
                        $('#lm').textContent = err_15.message;
                        return [3, 4];
                    case 4: return [2];
                }
            });
        }); };
    };
    document.querySelectorAll('#gtabs button').forEach(function (b) { return b.onclick = function () { return show(b.dataset.g); }; });
    show(document.querySelector('#gtabs button:not(.ghost)').dataset.g);
};
views.aprendizaje = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, d, wi, gr, p, s;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4, Promise.all([api('/api/learning'), api('/api/whatif?usd=10'), api('/api/grade')])];
            case 1:
                _a = __read.apply(void 0, [_b.sent(), 3]), d = _a[0], wi = _a[1], gr = _a[2];
                p = d.predictions, s = d.strategies;
                return [2, "<div><h1>Aprendizaje</h1><p class=\"sub\">Aqu\u00ED ves c\u00F3mo JARVIS aprende: qu\u00E9 ideas prueba, cu\u00E1les descarta y por qu\u00E9, cu\u00E1ntas veces acierta y cu\u00E1ntas falla. Todo queda guardado y no se puede borrar.</p></div>\n  <section class=\"grid g4\">\n    <div class=\"card kpi\" style=\"--c:#2fd58a\"><div class=\"l\">Recomendaciones guardadas</div><div class=\"v\">".concat(p.total, "</div><div class=\"s\">").concat(p.resolved, " ya se sabe si acert\u00F3 \u00B7 ").concat(p.pending, " esperando</div></div>\n    <div class=\"card kpi\" style=\"--c:#38d6f5\"><div class=\"l\">% de acierto</div><div class=\"v\">").concat(p.hitRate != null ? p.hitRate + '%' : '—', "</div><div class=\"s\">").concat(p.hits, " aciertos / ").concat(p.misses, " fallos").concat(p.range ? " \u00B7 rango ".concat(p.range[0], "\u2013").concat(p.range[1], "%") : '', "</div></div>\n    <div class=\"card kpi\" style=\"--c:#ffbf3c\"><div class=\"l\">Racha actual</div><div class=\"v\">").concat(p.streak.current, "</div><div class=\"s\">").concat(p.streak.current ? "".concat(p.streak.type === 'acierto' ? 'aciertos' : 'fallos', " seguidos") : 'sin racha', " \u00B7 mejor racha: ").concat(p.streak.bestHits, " aciertos seguidos</div></div>\n    <div class=\"card kpi\" style=\"--c:#a98bff\"><div class=\"l\">Ideas probadas</div><div class=\"v\">").concat(s.experiments, "</div><div class=\"s\">").concat(s.byStatus.en_prueba || 0, " en prueba en vivo \u00B7 ").concat(s.byStatus.validada || 0, " aprobadas</div></div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>Ideas que JARVIS prob\u00F3</h2><p class=\"note\">JARVIS inventa reglas para comprar y vender, las prueba con a\u00F1os de precios reales y solo se queda con las que le ganan al mercado. Que casi todas fallen es normal: as\u00ED te protege de reglas que solo <i>parecen</i> buenas.</p>").concat(s.recent.length ? s.recent.map(function (r) { return "<div class=\"idea\"><div class=\"idea-h\"><span class=\"chip ".concat(STATUS_TONE[r.to_status] || '', "\">").concat(esc(STATUS[r.to_status] || r.to_status), "</span><span class=\"note\">").concat(esc(AGENT_NAME[r.agent] || r.agent || ''), " \u00B7 ").concat(timeAgo(r.ts), "</span></div><div><b>La idea:</b> ").concat(esc(stratText(r.family, r.params)), "</div><div class=\"note\"><b>Resultado:</b> ").concat(esc(plainReason(r.reason)), "</div></div>"); }).join('') : '<div class="empty">Todavía no ha probado ideas.</div>', "</div>\n    <div class=\"card\"><h2>Liga de agentes y monedas</h2><table><tr><th>Agente</th><th class=\"r\">Monedas</th><th class=\"r\">Semana</th><th class=\"r\">Trampas</th></tr>").concat(d.league.map(function (a) { var _a; return "<tr><td>".concat(esc(a.name), "</td><td class=\"r\"><b>").concat(a.coins, "</b></td><td class=\"r ").concat(cls(a.week), "\">").concat((_a = a.week) !== null && _a !== void 0 ? _a : '—', "</td><td class=\"r ").concat(a.cheats ? 'bad' : '', "\">").concat(a.cheats, "</td></tr>"); }).join(''), "</table>\n      <div class=\"note\" style=\"margin-top:8px\">+1 moneda por cada 1% ganado neto en la bolsa, +1 extra si le gana al mercado. Las p\u00E9rdidas restan. Las monedas compran m\u00E1s pruebas y prioridad.</div>\n      ").concat(d.coins.length ? "<details style=\"margin-top:8px\"><summary>\u00DAltimos movimientos \u25B8</summary>".concat(d.coins.map(function (c) { return "<div class=\"note\">".concat(esc(c.ts.slice(0, 16).replace('T', ' ')), " \u00B7 ").concat(esc(c.agent), " \u00B7 <b class=\"").concat(cls(c.amount), "\">").concat(c.amount > 0 ? '+' : '').concat(c.amount, "</b> ").concat(esc(c.reason)).concat(c.revoked ? ' (revocada)' : '', "</div>"); }).join(''), "</details>") : '', "</div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>\uD83D\uDEE1\uFE0F Auditor\u00EDa de monedas <span class=\"more note\">c\u00F3mo se gan\u00F3 cada una y de d\u00F3nde salieron los datos</span></h2><p class=\"note\">Un agente solo gana monedas cuando una operaci\u00F3n cerrada gana dinero (virtual). Antes de pagarle, el auditor revisa que no haya hecho trampa. Aqu\u00ED ves la prueba de cada moneda.</p><div id=\"caudit\" class=\"note\">Cargando\u2026</div></div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>Reporte de trampas</h2>").concat(d.cheats.length ? d.cheats.map(function (c) { return "<div style=\"padding:8px 0;border-top:1px solid #1e2a44\"><span class=\"light rojo\"><i></i>".concat(esc(c.rule.replace(/_/g, ' ')), "</span> <span class=\"note\">").concat(esc(c.agent), " \u00B7 ").concat(timeAgo(c.ts), " \u00B7 \u2212").concat(c.coins_removed, " monedas</span><div>").concat(esc(c.explanation), "</div></div>"); }).join('') : '<div class="empty">Ninguna trampa detectada. El auditor revisa cada moneda antes de darla.</div>', "</div>\n    <div class=\"card\"><h2>Lo que JARVIS no sabe</h2>").concat(d.dontKnow.map(function (x) { return "<div style=\"padding:6px 0\">\u2022 ".concat(esc(x), "</div>"); }).join(''), "</div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>\u00BFY si hubieras seguido a JARVIS?</h2><div class=\"mini3\"><div class=\"pbox\"><div class=\"l\">Recomendaciones</div><div class=\"v\">").concat(wi.trades, "</div></div><div class=\"pbox\"><div class=\"l\">JARVIS</div><div class=\"v ").concat(cls(wi.jarvisGain), "\">").concat(usd(wi.jarvisGain), "</div></div><div class=\"pbox\"><div class=\"l\">Mercado</div><div class=\"v ").concat(cls(wi.marketGain), "\">").concat(usd(wi.marketGain), "</div></div></div>\n      <div class=\"note\" style=\"margin-top:8px\">").concat(esc(wi.text), "</div>").concat(wi.curve.length > 1 ? lineChart(wi.curve.map(function (c) { return [c.date, c.jarvis]; }), { h: 160, bench: wi.curve.map(function (c) { return [c.date, c.market]; }), label: 'JARVIS contra el mercado' }) : '', "</div>\n    <div class=\"card\"><h2>Bolet\u00EDn del mes</h2><div style=\"display:flex;gap:18px;align-items:center\"><div style=\"font-size:64px;font-weight:800;line-height:1;color:").concat({ A: '#2fd58a', B: '#38d6f5', C: '#ffbf3c', D: '#ff5d6c' }[gr.grade] || '#8a97b5', "\">").concat(esc(gr.grade), "</div><div>").concat(esc(gr.text), "</div></div>\n      <div class=\"note\" style=\"margin-top:8px\">A: le gan\u00F3 al mercado con evidencia \u00B7 B: le gan\u00F3, puede ser suerte \u00B7 C: empat\u00F3 \u00B7 D: perdi\u00F3 contra el mercado.</div>\n      <div class=\"row\" style=\"margin-top:12px\"><a class=\"btn ghost\" href=\"/api/export/predicciones\">Exportar predicciones (CSV)</a><a class=\"btn ghost\" href=\"/api/export/ranking\">Exportar ranking (CSV)</a><button class=\"btn ghost\" onclick=\"window.print()\">Imprimir / PDF</button></div></div>\n  </section>\n  <section class=\"card\"><h2>Glosario</h2><div class=\"grid g3\" style=\"gap:10px\">").concat(Object.entries(GLOSS).map(function (_a) {
                        var _b = __read(_a, 2), k = _b[0], v = _b[1];
                        return "<div><b>".concat(esc(k[0].toUpperCase() + k.slice(1)), "</b><div class=\"note\">").concat(esc(v), "</div></div>");
                    }).join(''), "</div></section>\n  <section class=\"card\"><h2>Todas las ideas probadas</h2>").concat(d.list.length ? "<div class=\"tablewrap\"><table><tr><th>La idea</th><th>Estado</th><th class=\"r\">\u00BFLe gan\u00F3 al mercado?</th></tr>".concat(d.list.map(function (x) { var _a, _b; return "<tr><td>".concat(esc(stratText(x.family, x.params)), "<div class=\"note\">").concat(esc(AGENT_NAME[x.agent] || x.agent || ''), "</div></td><td><span class=\"chip ").concat(STATUS_TONE[x.status] || '', "\">").concat(esc(STATUS[x.status] || x.status), "</span></td><td class=\"r\">").concat(((_a = x.result) === null || _a === void 0 ? void 0 : _a.holdout) ? "<b class=\"".concat(cls(x.result.holdout.annual), "\">").concat(x.result.holdout.annual > 0 ? 'Sí' : 'No', "</b><div class=\"note\">").concat(pct(x.result.holdout.annual * 100), " al a\u00F1o vs el mercado</div>") : ((_b = x.result) === null || _b === void 0 ? void 0 : _b.train) ? '<b class="bad">No</b><div class="note">ni en la primera prueba</div>' : '—', "</td></tr>"); }).join(''), "</table></div>") : '<div class="empty">Sin estrategias probadas todavía.</div>', "</section>")];
        }
    });
}); };
var adminOnly = function () { return "<section class=\"card\"><h2>Solo para el administrador</h2><p class=\"note\">Esta parte la maneja quien administra JARVIS. Lo tuyo est\u00E1 en <a href=\"#perfil\">Mi perfil</a> y <a href=\"#potenciador\">\u26A1 Potenciador</a>.</p></section>"; };
views.estado = function () { return __awaiter(void 0, void 0, void 0, function () {
    var s, NAMES;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if ((ME === null || ME === void 0 ? void 0 : ME.role) !== 'admin')
                    return [2, adminOnly()];
                return [4, api('/api/status')];
            case 1:
                s = _b.sent();
                NAMES = { loterias_resultados: 'Resultados de loterías', loterias_liquidar: 'Pagar jugadas', bolsa_precios: 'Precios en vivo', bolsa_historial: 'Historial de precios', copia: 'Copia de seguridad', resumen_diario: 'Resumen diario', fundamentales: 'Informes de empresas', noticias: 'Noticias', investigacion: 'Investigación', loterias_jugadas: 'Jugadas automáticas', prueba_en_vivo: 'Prueba en vivo', cartera_ia: 'Cartera de la IA', explorar: 'Explorar nuevas acciones', ranking: 'Ranking', debate: 'Debate', vigilancia_loterias: 'Vigilancia de trampas' };
                return [2, "<div><h1>Estado del sistema</h1><p class=\"sub\">\u00DAltimo latido: ".concat(timeAgo(s.heartbeat), " \u00B7 Motor: ").concat(s.motor.running ? "activo".concat(s.motor.until ? ' hasta ' + new Date(s.motor.until).toLocaleString('es-DO') : '') : 'en pausa', " \u00B7 Versi\u00F3n: <b>").concat(esc(s.version || '—'), "</b></p></div>\n  <section class=\"grid g4\">\n    <div class=\"card kpi\" style=\"--c:").concat(s.ledger.ok ? '#2fd58a' : '#ff5d6c', "\"><div class=\"l\">Registro sellado</div><div class=\"v\">").concat(s.ledger.ok ? 'Intacto' : 'Alterado', "</div><div class=\"s\">").concat(s.ledger.checked, " entradas verificadas</div></div>\n    <div class=\"card kpi\"><div class=\"l\">Gasto de IA</div><div class=\"v\">").concat(usd(s.ai.month, 2), "</div><div class=\"s\">de ").concat(usd(s.ai.monthCap, 0), " este mes \u00B7 hoy ").concat(usd(s.ai.day, 3), "</div></div>\n    <div class=\"card kpi\" style=\"--c:#4c7dff\"><div class=\"l\">Datos guardados</div><div class=\"v\">").concat(s.db.bars.toLocaleString(), "</div><div class=\"s\">precios \u00B7 ").concat(s.db.draws, " sorteos \u00B7 ").concat(s.db.ledger, " sellos</div></div>\n    <div class=\"card kpi\" style=\"--c:#a98bff\"><div class=\"l\">Conexiones</div><div class=\"v\" style=\"font-size:18px;line-height:1.6\">").concat(['openai', 'anthropic', 'ollama'].map(function (k) { return "<span class=\"light ".concat(s.ai.available[k] ? 'verde' : 'gris', "\"><i></i>").concat({ openai: 'ChatGPT', anthropic: 'Claude', ollama: 'Modelo gratis' }[k], "</span>"); }).join(' '), " <span class=\"light ").concat(s.sources.alpaca ? 'verde' : 'amarillo', "\"><i></i>").concat(s.sources.alpaca ? 'Alpaca' : 'Yahoo (respaldo)', "</span></div></div>\n  </section>\n  <section class=\"card\"><h2>Tareas</h2><div class=\"tablewrap\"><table><tr><th>Tarea</th><th>Cada</th><th>Necesita motor</th><th>\u00DAltima vez</th><th>Resultado</th></tr>").concat(s.tasks.map(function (t) { var _a; return "<tr><td>".concat(esc(NAMES[t.name] || t.name), "</td><td>").concat(t.every >= 1440 ? Math.round(t.every / 1440) + ' d' : t.every >= 60 ? Math.round(t.every / 60) + ' h' : t.every + ' min', "</td><td>").concat(t.needsMotor ? 'Sí' : 'Siempre', "</td><td>").concat(timeAgo((_a = t.last) === null || _a === void 0 ? void 0 : _a.at), "</td><td>").concat(t.last ? (t.last.ok ? '<span class="good">✓ Bien</span>' : "<span class=\"bad\">\u2715 ".concat(esc(t.last.error), "</span>")) : '—', "</td></tr>"); }).join(''), "</table></div></section>\n  <section class=\"card\"><h2>Resumen diario (8:00 a.m.)</h2><div class=\"answer\">").concat(esc(((_a = s.dailySummary) === null || _a === void 0 ? void 0 : _a.text) || 'Todavía no se ha generado.'), "</div></section>")];
        }
    });
}); };
var onlineChip = function (iso) { return !iso ? '<span class="note">Nunca ha entrado</span>' : Date.now() - Date.parse(iso) < 3 * 60e3 ? '<span class="chip good">🟢 En línea</span>' : "<span class=\"note\">\u26AA ".concat(timeAgo(iso), "</span>"); };
views.ajustes = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, st, users, mot, keys, KEYHELP;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if ((ME === null || ME === void 0 ? void 0 : ME.role) !== 'admin')
                    return [2, adminOnly()];
                return [4, Promise.all([api('/api/settings'), api('/api/users'), api('/api/status'), api('/api/keys')])];
            case 1:
                _a = __read.apply(void 0, [_b.sent(), 4]), st = _a[0], users = _a[1], mot = _a[2], keys = _a[3];
                KEYHELP = { OPENAI_API_KEY: ['platform.openai.com/api-keys', 'https://platform.openai.com/api-keys', 'sk-…', 'La principal: explica, resume noticias, debate y propone empresas.'], ANTHROPIC_API_KEY: ['console.anthropic.com (opcional)', 'https://console.anthropic.com/settings/keys', 'sk-ant-…', 'No es obligatoria: solo agrega una segunda IA para el debate.'], ALPACA_KEY_ID: ['alpaca.markets, cuenta de práctica (gratis)', 'https://app.alpaca.markets/paper/dashboard/overview', 'PK…', 'NO es obligatoria. Solo da precios al segundo. Sin ella JARVIS usa Yahoo Finance gratis y funciona igual (los precios pueden venir con unos minutos de retraso).'], ALPACA_SECRET_KEY: ['la misma página de Alpaca', 'https://app.alpaca.markets/paper/dashboard/overview', '', 'Va junto con la de arriba. Tampoco es obligatoria.'], NTFY_TOPIC: ['inventa un nombre secreto y suscríbete en la app ntfy', 'https://ntfy.sh', 'jarvis-junior-7f3k9', 'No es obligatoria: avisos al celular.'], SEC_USER_AGENT: ['tu nombre y correo (la SEC lo pide)', 'https://www.sec.gov/os/accessing-edgar-data', 'Junior tu@correo.com', 'Recomendada y gratis: no es una clave, solo tu nombre y tu correo. La SEC (el gobierno de EE. UU.) los pide para dar los datos oficiales de las empresas (ventas, ganancias, deudas). Sin esto puede bloquear esa parte.'] };
                return [2, "<div><h1>Ajustes</h1><p class=\"sub\">Solo el administrador ve esta pantalla.</p></div>\n  <section class=\"card brandcard\"><h2>Tu marca <span class=\"more note\">hazlo tuyo: nombre, logo y color</span></h2>\n    <div class=\"grid split\" style=\"gap:20px;margin-top:10px\">\n      <div class=\"form\">\n        <label>Nombre del programa<input id=\"bn\" maxlength=\"24\" value=\"".concat(esc(BRAND.name), "\"></label>\n        <label>Frase debajo del nombre<input id=\"bt\" maxlength=\"60\" value=\"").concat(esc(BRAND.tagline), "\" placeholder=\"Ej.: Mi investigador personal\"></label>\n        <label>Due\u00F1o (sale como \"Programa privado de\u2026\")<input id=\"bo\" maxlength=\"40\" value=\"").concat(esc(BRAND.owner), "\" placeholder=\"Ej.: Junior\"></label>\n        <div><div class=\"note\" style=\"margin-bottom:6px\">Color principal</div><div class=\"swatches\">").concat(Object.entries(BRAND.palettes || {}).map(function (_a) {
                        var _b = __read(_a, 2), k = _b[0], p = _b[1];
                        return "<button type=\"button\" class=\"sw".concat(k === BRAND.color ? ' on' : '', "\" data-c=\"").concat(k, "\" title=\"").concat(esc(p.name), "\" style=\"--d:").concat(p.dark, ";--l:").concat(p.light, "\"><i></i>").concat(esc(p.name), "</button>");
                    }).join(''), "</div></div>\n        <div><div class=\"note\" style=\"margin-bottom:6px\">Logo (PNG, JPG o WEBP; se ajusta solo)</div><div class=\"row\" style=\"gap:10px;align-items:center\"><label class=\"btn ghost\" style=\"cursor:pointer\">Subir logo<input id=\"bl\" type=\"file\" accept=\"image/png,image/jpeg,image/webp\" hidden></label>").concat(BRAND.hasLogo ? '<button type="button" class="btn ghost" id="blr">Quitar logo</button>' : '', "</div></div>\n        <button class=\"btn\" id=\"bsave\">Guardar mi marca</button><div class=\"msg\" id=\"bm\"></div>\n      </div>\n      <div><div class=\"note\" style=\"margin-bottom:8px\">As\u00ED se ver\u00E1</div><div class=\"bprev\" id=\"bprev\"></div><div class=\"note\" style=\"margin-top:8px\">Sale en la barra de arriba, la pantalla de entrada, el Modo TV, la pesta\u00F1a del navegador y el \u00EDcono cuando lo instalas en el celular.</div></div>\n    </div></section>\n  ").concat(mot.publicUrl ? "<section class=\"card\"><h2>Tu enlace para la TV y cualquier navegador</h2><p style=\"font-size:18px;margin:8px 0\"><a href=\"".concat(esc(mot.publicUrl), "\" target=\"_blank\" rel=\"noopener\"><b>").concat(esc(mot.publicUrl), "</b></a></p><div class=\"note\">Escr\u00EDbelo en la barra de direcciones (no en el buscador de Google) del navegador de la TV, otra computadora o el celular de tu amigo. Siempre pide usuario y contrase\u00F1a. Para la TV usa el bot\u00F3n \"Modo TV\".</div></section>") : "<section class=\"card\"><h2>Enlace para que cualquiera entre (sin instalar nada)</h2>".concat(mot.funnelEnable ? "<p style=\"margin:8px 0\">Tailscale pide tu permiso <b>una sola vez</b> para abrir JARVIS a internet.</p><a class=\"btn\" href=\"".concat(esc(mot.funnelEnable), "\" target=\"_blank\" rel=\"noopener\">Activar enlace p\u00FAblico</a><ol class=\"note\" style=\"margin-top:10px;padding-left:18px\"><li>Toca el bot\u00F3n (se abre la p\u00E1gina de Tailscale).</li><li>Entra con la misma cuenta de Tailscale y toca <b>Enable</b> / <b>Activar</b> en todo lo que pregunte.</li><li>Vuelve aqu\u00ED en unos 10 minutos: aparecer\u00E1 tu enlace.</li></ol><div class=\"note\">Aunque el enlace sea p\u00FAblico, nadie ve nada sin el usuario y la contrase\u00F1a que t\u00FA le crees.</div>") : '<div class="note">Todavía no hay enlace público. El servidor lo intenta cada 10 minutos. Si en 20 minutos sigue así, mándale una foto de esta tarjeta a Claude. Mientras tanto entra con Tailscale: http://jarvis:8080</div>', "</section>"), "\n  <section class=\"card\"><h2>\u2728 Plus con IA ").concat(mot.aiOn ? '<span class="chip good">activado</span>' : '<span class="chip warn">apagado: falta la clave de ChatGPT</span>', "</h2>").concat(mot.aiOn ? "<div class=\"note\">Modelo en uso: <b>".concat(esc(mot.aiModel || 'se elige solo'), "</b></div>") : '').concat(mot.aiLastError && Date.now() - Date.parse(mot.aiLastError.at) < 864e5 ? "<div class=\"answer bad\" style=\"margin:8px 0\">\u26A0\uFE0F \u00DAltimo problema de la IA (".concat(timeAgo(mot.aiLastError.at), ", en \"").concat(esc(mot.aiLastError.task), "\"): ").concat(esc(mot.aiLastError.error), "<div class=\"note\">Si se repite, m\u00E1ndale una foto de esto a Claude.</div></div>") : '', "<ul class=\"note\" style=\"line-height:1.7;padding-left:18px\">\n    <li><b>Explicaci\u00F3n del analista:</b> cada an\u00E1lisis explicado como a un amigo.</li><li><b>Preguntas:</b> le preguntas lo que quieras a JARVIS.</li>\n    <li><b>Empresas nuevas:</b> la IA propone qu\u00E9 estudiar (cada semana y al tocar \"\u00BFQu\u00E9 buscas ahora?\"); JARVIS las prueba con precios reales.</li>\n    <li><b>Debate:</b> varias IA discuten a favor y en contra de una recomendaci\u00F3n.</li><li><b>Loter\u00EDas:</b> te explica la vigilancia y c\u00F3mo jugar con cabeza.</li><li><b>Noticias:</b> res\u00FAmenes en espa\u00F1ol sencillo.</li></ul>\n    <div class=\"note\">Sin IA, JARVIS sigue funcionando completo; solo se pierde esto. La IA explica y propone, pero nunca decide sola ni inventa n\u00FAmeros.</div></section>\n  <section class=\"card brain\"><h2>\uD83E\uDDE0 El n\u00FAcleo de JARVIS <span class=\"more note\">toda su experiencia</span></h2><div id=\"brainsum\" class=\"note\">Cargando\u2026</div>\n    <p class=\"note\" style=\"margin-top:8px\">Todo lo que JARVIS aprendi\u00F3 (votos, ideas probadas, monedas, historial, usuarios, firmas y pagos) vive en un solo archivo en tu servidor. Cada d\u00EDa se hace una copia verificada y, si conectas tu Google Drive (abajo), tambi\u00E9n se sube sola, cifrada y comprimida. Si el servidor se da\u00F1a, la restauras en un servidor nuevo y JARVIS sigue <b>exactamente</b> donde iba.</p>\n    <div class=\"grid g2\" style=\"gap:14px;margin-top:10px\">\n      <div class=\"form\"><b>Descargar copia</b><label>Frase secreta (10 o m\u00E1s letras; gu\u00E1rdala bien)<input id=\"bpw\" type=\"password\" autocomplete=\"new-password\" minlength=\"10\"></label><button type=\"button\" class=\"btn\" id=\"bdl\">Descargar copia del n\u00FAcleo</button><div class=\"msg\" id=\"bdm\"></div></div>\n      <div class=\"form\"><b>Restaurar desde una copia</b><label class=\"btn ghost\" style=\"cursor:pointer;display:inline-flex\">\uD83D\uDCC1 Elegir archivo .jvbk<input id=\"brf\" type=\"file\" accept=\".jvbk,application/octet-stream\" hidden></label><div class=\"note\" id=\"brn\"></div><label>Frase secreta de esa copia<input id=\"brpw\" type=\"password\" autocomplete=\"off\"></label><label class=\"chk\"><input type=\"checkbox\" id=\"brok\"> Entiendo que esto reemplaza el n\u00FAcleo actual (antes se guarda una copia del actual)</label><button type=\"button\" class=\"btn ghost\" id=\"brs\">Restaurar</button><div class=\"msg\" id=\"brm\"></div></div>\n    </div></section>\n  <section class=\"card drivecard\"><h2>\u2601\uFE0F Copia autom\u00E1tica en tu Google Drive <span class=\"more note\">gratis \u00B7 se hace sola cada d\u00EDa</span></h2><div id=\"drv\" class=\"note\">Cargando\u2026</div></section>\n  <section class=\"card keyscard\"><h2>Claves <span class=\"more note\">se guardan solo en tu servidor; nunca se muestran de nuevo</span></h2>\n    <p class=\"note\">P\u00E9galas desde el celular. JARVIS revisa el formato y las usa al momento, sin reiniciar. Para borrar una, deja el campo vac\u00EDo y marca \"borrar\".</p>\n    <form class=\"form\" id=\"kf\">").concat(keys.map(function (k) { return "<div class=\"krow\"><div><b>".concat(esc(k.label), "</b> <span class=\"need ").concat(esc(k.need), "\">").concat({ principal: '⭐ principal', recomendada: '👍 recomendada', opcional: 'opcional' }[k.need] || '', "</span> ").concat(k.set ? "<span class=\"tag dato\">puesta ".concat(esc(k.hint || ''), "</span>") : k.need === 'opcional' ? '<span class="tag">sin poner (no pasa nada)</span>' : '<span class="tag est">falta</span>').concat(KEYHELP[k.name][3] ? "<div class=\"note khelp\">".concat(esc(KEYHELP[k.name][3]), "</div>") : '', "<div class=\"note\">D\u00F3nde sacarla: <a href=\"").concat(KEYHELP[k.name][1], "\" target=\"_blank\" rel=\"noopener\">").concat(esc(KEYHELP[k.name][0]), "</a></div></div>\n      <input type=\"").concat(k.name === 'NTFY_TOPIC' || k.name === 'SEC_USER_AGENT' ? 'text' : 'password', "\" data-key=\"").concat(k.name, "\" autocomplete=\"off\" placeholder=\"").concat(k.set ? 'Escribe solo si quieres cambiarla' : esc(KEYHELP[k.name][2]), "\">").concat(k.set ? "<label class=\"note\" style=\"flex-direction:row;gap:6px;align-items:center\"><input type=\"checkbox\" data-del=\"".concat(k.name, "\" style=\"width:auto\"> borrar</label>") : '<span></span>', "</div>"); }).join(''), "\n      <button class=\"btn\">Guardar claves</button><div class=\"msg\" id=\"km\"></div></form>\n    <div class=\"note\">Pon tambi\u00E9n un l\u00EDmite de gasto en la p\u00E1gina de OpenAI. JARVIS adem\u00E1s respeta su propio tope: ").concat(usd(st.caps.month, 0), " al mes.</div></section>\n  <section class=\"card\"><h2>Motor aut\u00F3nomo</h2><div class=\"row\" style=\"align-items:flex-end\">\n    <label style=\"flex-direction:row;align-items:center;gap:8px;padding-bottom:10px\"><input type=\"checkbox\" id=\"mnon\" style=\"width:auto\" checked> Sin parar (hasta que yo lo detenga)</label>\n    <label style=\"width:180px\" id=\"mhl\" class=\"hide\">Trabajar durante (horas)<input id=\"mh\" type=\"number\" min=\"1\" value=\"72\"></label>\n    <button class=\"btn\" id=\"mstart\">Iniciar</button><button class=\"btn ghost\" id=\"mpause\">Pausar</button><button class=\"btn ghost\" id=\"mresume\">Reanudar</button><button class=\"btn danger\" id=\"mstop\">Detener</button><button class=\"btn ghost\" id=\"mrun\">Correr ciclo ahora</button></div>\n    <div class=\"note\" style=\"margin-top:8px\">Estado: <b>").concat(mot.motor.running ? 'activo' : 'en pausa', "</b>").concat(mot.motor.until ? ' hasta ' + new Date(mot.motor.until).toLocaleString('es-DO') : '', ". Al pausar o detener, todo el progreso queda guardado.</div><div class=\"msg\" id=\"mm\"></div></section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>Inteligencia artificial</h2><div class=\"form\">\n      ").concat([['openai', 'ChatGPT (principal)'], ['anthropic', 'Claude (opcional, activa el debate entre dos IA)'], ['ollama', 'Modelo gratis en el servidor']].map(function (_a) {
                        var _b = __read(_a, 2), k = _b[0], l = _b[1];
                        return "<label style=\"flex-direction:row;align-items:center;gap:10px\"><input type=\"checkbox\" data-ai=\"".concat(k, "\" ").concat(st.aiEnabled[k] ? 'checked' : '', " style=\"width:auto\"> ").concat(l, " ").concat(st.keys[k] === false ? '<span class="tag est">falta la clave (ponla arriba, en Claves)</span>' : '', "</label>");
                    }).join(''), "\n      <div class=\"note\">Modelos: ").concat(esc(st.models.openai), " \u00B7 ").concat(esc(st.models.anthropic), " \u00B7 ").concat(esc(st.models.local), ". Tope: ").concat(usd(st.caps.month, 0), " al mes, ").concat(usd(st.caps.day, 2), " al d\u00EDa (en .env).</div>\n      <label>Precios por mill\u00F3n de tokens (conf\u00EDrmalos en la p\u00E1gina oficial)<textarea id=\"prices\" rows=\"4\" class=\"mono\">").concat(esc(JSON.stringify(st.prices, null, 1)), "</textarea></label>\n      <button class=\"btn\" id=\"saveai\">Guardar IA</button></div></div>\n    <div class=\"card\"><h2>Bolsa y loter\u00EDas</h2><div class=\"form\">\n      <label>Acciones que investiga (separadas por coma)<textarea id=\"univ\" rows=\"3\">").concat(esc(st.universe.join(', ')), "</textarea></label>\n      <label>Pagos de la banca (por RD$1)<textarea id=\"pay\" rows=\"4\" class=\"mono\">").concat(esc(JSON.stringify(st.payouts)), "</textarea></label>\n      <label style=\"flex-direction:row;align-items:center;gap:10px\"><input type=\"checkbox\" id=\"single\" ").concat(st.allowSingleSource ? 'checked' : '', " style=\"width:auto\"> Pagar jugadas con una sola fuente (marcadas como \"1 fuente\")</label>\n      <button class=\"btn\" id=\"saveother\">Guardar</button></div></div>\n  </section>\n  <section class=\"grid g2\">\n    <div class=\"card\"><h2>Avisos al celular</h2>").concat(st.notify.on ? "<p>Activos (tema ".concat(esc(st.notify.topic), ").</p><button class=\"btn ghost\" id=\"ntest\">Enviar aviso de prueba</button>") : "<ol class=\"note\" style=\"padding-left:18px\"><li>Instala la app gratis <b>ntfy</b> en tu celular.</li><li>Inventa un nombre secreto, por ejemplo <span class=\"mono\">jarvis-junior-7f3k9</span>, y suscr\u00EDbete a ese tema en la app.</li><li>Ponlo arriba, en <b>Claves \u2192 Tema de avisos</b>. Para tus avisos personales, ponlo tambi\u00E9n en <a href=\"#perfil\">Mi perfil</a>. Cada usuario puede tener el suyo.</li></ol>", "<div class=\"msg\" id=\"nm\"></div></div>\n    <div class=\"card\"><h2>\uD83D\uDCD8 La memoria de JARVIS</h2><p class=\"note\">Un archivo peque\u00F1o (texto) con todo lo que aprendi\u00F3: qu\u00E9 m\u00E9todos usa y por qu\u00E9, cu\u00E1les dej\u00F3 y por qu\u00E9, d\u00F3nde s\u00ED sirven m\u00E9todos viejos, cu\u00E1nto acierta, c\u00F3mo us\u00F3 la IA y cu\u00E1nto cost\u00F3. Sin datos personales. Sirve para leerlo t\u00FA y para d\u00E1rselo a otra IA en el futuro y que no empiece de cero.</p><div class=\"row\" style=\"gap:8px\"><a class=\"btn ghost\" href=\"/api/memoria\" download>Descargar memoria (.md)</a><a class=\"btn ghost\" href=\"/api/memoria?formato=json\" download>Versi\u00F3n para programas (.json)</a></div></div>\n  </section>\n  <section class=\"card\" id=\"usuarios\"><h2>Usuarios <span class=\"more note\">cada uno con su perfil; todos usan el mismo n\u00FAcleo</span></h2><label class=\"chk\" style=\"margin:6px 0\"><input type=\"checkbox\" id=\"showusers\"").concat(st.showUsers !== false ? ' checked' : '', "> Mostrar la lista de usuarios en la pantalla de entrada <span class=\"note\">(cada uno toca su nombre y pone su contrase\u00F1a)</span></label>").concat((function () { var on = users.filter(function (u) { return u.lastSeen && Date.now() - Date.parse(u.lastSeen) < 3 * 60e3; }); return "<div class=\"onl\"><b>\uD83D\uDC65 Tienes ".concat(users.length, " ").concat(users.length === 1 ? 'usuario' : 'usuarios', "</b> \u00B7 ").concat(on.length ? "\uD83D\uDFE2 En l\u00EDnea ahora: ".concat(on.map(function (u) { return esc(u.display_name || u.username); }).join(', ')) : 'nadie en línea ahora', "</div>"); })(), "<div class=\"tablewrap\"><table><tr><th>Persona</th><th>Estilo</th><th class=\"r\">Su dinero</th><th>Estado</th><th></th></tr>").concat(users.map(function (u) { return "<tr><td><b>".concat(esc(u.display_name || u.username), "</b><div class=\"note\">").concat(esc(u.username), " \u00B7 ").concat(u.role === 'admin' ? 'Administrador' : 'Usuario', "</div><div style=\"margin-top:4px\">").concat(onlineChip(u.lastSeen), "</div></td><td>").concat(u.setup ? esc({ conservador: '🛡️ Conservador', equilibrado: '⚖️ Equilibrado', arriesgado: '🚀 Arriesgado' }[u.style]) : '<span class="note">sin configurar</span>', "</td><td class=\"r\">").concat(usd(u.budget, 0), "</td><td>").concat(u.active ? '<span class="good">Activo</span>' : '<span class="bad">Desactivado</span>', "</td>\n      <td class=\"r\" style=\"white-space:nowrap\">").concat(u.id === ME.id ? '<a class="note" href="#perfil">Mi perfil ▸</a>' : "<button class=\"btn ghost sm\" data-pw=\"".concat(u.id, "\">Nueva contrase\u00F1a</button> <button class=\"btn ghost sm\" data-act=\"").concat(u.id, "\" data-on=\"").concat(u.active ? 0 : 1, "\">").concat(u.active ? 'Desactivar' : 'Activar', "</button>"), "</td></tr>"); }).join(''), "</table></div>\n    <h3 class=\"cs-h\">Crear un usuario (por ejemplo, para tu amigo)</h3>\n    <form class=\"row\" id=\"uf\" style=\"align-items:flex-end;gap:10px\"><label style=\"flex:1;min-width:160px\">Su nombre<input id=\"nn\" placeholder=\"Ricardo\"></label><label style=\"flex:1;min-width:160px\">Usuario para entrar<input id=\"nu\" required placeholder=\"ricardo\"></label><label style=\"flex:1;min-width:180px\">Contrase\u00F1a (d\u00E9jala vac\u00EDa y JARVIS crea una)<input id=\"np\" type=\"text\" minlength=\"10\" placeholder=\"autom\u00E1tica\" autocomplete=\"off\"></label><label style=\"width:150px\">IA gratis al mes (US$)<input id=\"nm\" type=\"number\" value=\"2\" step=\"0.5\"></label><button class=\"btn\">Crear usuario</button></form>\n    <div class=\"note\" style=\"margin-top:6px\">Al entrar por primera vez, JARVIS le pregunta su estilo, su plazo y qu\u00E9 le interesa. Tiene su propio dinero virtual, sus avisos y su historial real; la investigaci\u00F3n se comparte sin gastar doble. Desactivar guarda sus datos.</div><div class=\"msg\" id=\"um\"></div></section>")];
        }
    });
}); };
var kb = function (n) { return n == null ? '—' : n < 1048576 ? "".concat(Math.max(1, Math.round(n / 1024)), " KB") : "".concat((n / 1048576).toFixed(1), " MB"); };
function loadDrive() {
    return __awaiter(this, void 0, void 0, function () {
        var el, d, e_7, L, G, status, what, msg;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    el = $('#drv');
                    if (!el)
                        return [2];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/drive')];
                case 2:
                    d = _a.sent();
                    return [3, 4];
                case 3:
                    e_7 = _a.sent();
                    el.textContent = e_7.message;
                    return [2];
                case 4:
                    L = d.last, G = d.legal;
                    status = d.connected ? "<div class=\"drvok\"><b>\u2705 Conectado</b> \u00B7 ".concat(L ? (L.ok ? "\u00FAltima copia ".concat(timeAgo(L.at), ": memoria ").concat(kb(L.memoryBytes)).concat(L.core ? " + n\u00FAcleo ".concat(kb(L.core.bytes)) : '', " \u00B7 en tu Drive ocupa <b>").concat(kb(L.used), "</b> en total").concat(L.folder ? " \u00B7 <a href=\"".concat(esc(L.folder), "\" target=\"_blank\" rel=\"noopener\">abrir carpeta</a>") : '') : "<span class=\"bad\">la \u00FAltima vez fall\u00F3: ".concat(esc(L.error), "</span>")) : 'todavía no ha subido nada').concat((G === null || G === void 0 ? void 0 : G.ok) ? "<br>\uD83D\uDCDD Firmas y pagos: ".concat(G.firmas, " firmas y ").concat(G.pagos, " pagos guardados (").concat(timeAgo(G.at), ")") : '').concat(d.passphrase ? '' : '<br><span class="warn">⚠️ Falta la frase secreta: solo se sube la memoria, no el núcleo completo.</span>', "</div>") : '';
                    what = "<div class=\"drvwhat\">".concat([['📘', 'Memoria', 'todo lo que aprendió, con detalle de cada idea probada (se actualiza cada día y queda una copia de cada mes)'], ['🧠', 'Núcleo', "todo JARVIS con todo lo aprendido, cifrado con tu frase (sin el historial de precios, que se vuelve a bajar solo). Se guardan las ".concat(d.keep.diarias, " m\u00E1s nuevas, una por semana de las \u00FAltimas ").concat(d.keep.semanas, " semanas y <b>una por mes para siempre</b>.")], ['📓', 'Bitácora', 'cada día se AGREGA lo que aprendió, lo que cambió y por qué. Nunca se borra nada.'], ['📝', 'Firmas, contratos y pagos', 'cada firma, el texto exacto firmado, cada pago y la foto del comprobante. Se suben al momento y nunca se borran.']].map(function (_a) {
                        var _b = __read(_a, 3), i = _b[0], t = _b[1], x = _b[2];
                        return "<div><span>".concat(i, "</span><b>").concat(t, "</b><small>").concat(x, "</small></div>");
                    }).join(''), "</div>");
                    el.innerHTML = status + what + (d.connected ? "<div class=\"row\" style=\"gap:8px;margin-top:10px\"><button class=\"btn\" id=\"dnow\">Subir ahora</button><button class=\"btn ghost\" id=\"doff\">Desconectar</button></div><div class=\"msg\" id=\"dm\"></div>\n    <details style=\"margin-top:12px\"><summary><b>Recuperar JARVIS desde tu Drive</b> (si el servidor se da\u00F1a o pasas a uno nuevo)</summary><div class=\"form\" style=\"margin-top:8px\"><label>Frase secreta de las copias<input id=\"drpw\" type=\"password\" autocomplete=\"off\"></label><label class=\"chk\"><input type=\"checkbox\" id=\"drok\"> Entiendo que esto reemplaza el n\u00FAcleo actual (antes se guarda una copia del actual)</label><button class=\"btn ghost\" id=\"drs\">Traer la \u00FAltima copia desde Drive</button><div class=\"msg\" id=\"drm\"></div></div></details>" : '') +
                        "<details ".concat(d.connected ? '' : 'open', " style=\"margin-top:12px\"><summary><b>").concat(d.connected ? 'Volver a conectar' : 'Conectar (una sola vez, unos 5 minutos)', "</b> \u00B7 m\u00E1s f\u00E1cil desde una computadora</summary>\n    <ol class=\"drvsteps\"><li>Toca <button type=\"button\" class=\"btn sm\" data-copy=\"").concat(esc(d.script), "\">Copiar</button> para copiar el c\u00F3digo.</li>\n      <li>Abre <a href=\"https://script.google.com/home/projects/create\" target=\"_blank\" rel=\"noopener\"><b>script.google.com</b></a> con tu cuenta de Google. Se abre un proyecto nuevo.</li>\n      <li>Borra lo que hay, pega el c\u00F3digo y toca \uD83D\uDCBE <b>Guardar</b>.</li>\n      <li>Arriba a la derecha: <b>Implementar \u2192 Nueva implementaci\u00F3n</b> \u2192 toca el engranaje \u2699\uFE0F \u2192 <b>Aplicaci\u00F3n web</b>. En \"Ejecutar como\" deja <b>Yo</b> y en \"Qui\u00E9n tiene acceso\" pon <b>Cualquier usuario</b>. Toca <b>Implementar</b>.</li>\n      <li>Google pide permiso: <b>Autorizar acceso</b> \u2192 tu cuenta \u2192 <b>Configuraci\u00F3n avanzada</b> \u2192 <b>Ir a \u2026 (no seguro)</b> \u2192 <b>Permitir</b>. Avisa as\u00ED porque es tu propio c\u00F3digo y Google no lo revis\u00F3; solo puede escribir en la carpeta de JARVIS.</li>\n      <li>Copia la <b>URL de la aplicaci\u00F3n web</b> (termina en <span class=\"mono\">/exec</span>) y p\u00E9gala aqu\u00ED:</li></ol>\n    <form class=\"form\" id=\"dcf\"><label>URL de la aplicaci\u00F3n web<input id=\"durl\" placeholder=\"https://script.google.com/macros/s/\u2026/exec\" autocomplete=\"off\"></label>\n      <label>Frase secreta para las copias (10 o m\u00E1s letras) <span class=\"note\">\u2014 an\u00F3tala en un lugar seguro: sin ella el n\u00FAcleo no se puede abrir, ni siquiera yo puedo</span><input id=\"dpw\" type=\"password\" autocomplete=\"new-password\" placeholder=\"").concat(d.passphrase ? 'Ya hay una puesta: escribe solo si quieres cambiarla' : '', "\"></label>\n      <label>Clave del c\u00F3digo <span class=\"note\">(ya va dentro del c\u00F3digo; c\u00E1mbiala solo si conectas un c\u00F3digo que ya ten\u00EDas)</span><input id=\"dtok\" value=\"").concat(esc(d.codeKey), "\" class=\"mono\" autocomplete=\"off\"></label>\n      <button class=\"btn\">Conectar y subir la primera copia</button><div class=\"msg\" id=\"dcm\"></div></form></details>");
                    el.querySelectorAll('[data-copy]').forEach(function (b) { return b.onclick = function () { return __awaiter(_this, void 0, void 0, function () { var t, _a, i; return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                t = b.dataset.copy;
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                return [4, navigator.clipboard.writeText(t)];
                            case 2:
                                _b.sent();
                                return [3, 4];
                            case 3:
                                _a = _b.sent();
                                i = document.createElement('textarea');
                                i.value = t;
                                document.body.appendChild(i);
                                i.select();
                                try {
                                    document.execCommand('copy');
                                }
                                catch (_c) { }
                                i.remove();
                                return [3, 4];
                            case 4:
                                b.textContent = '¡Copiado!';
                                setTimeout(function () { b.textContent = 'Copiar'; }, 1800);
                                return [2];
                        }
                    }); }); }; });
                    msg = function (id, cls, t) { var m = $(id); if (m) {
                        m.className = 'msg ' + cls;
                        m.textContent = t;
                    } };
                    $('#dcf').onsubmit = function (e) { return __awaiter(_this, void 0, void 0, function () {
                        var r, err_16;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    e.preventDefault();
                                    msg('#dcm', '', 'Probando la conexión con tu Drive…');
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 3, , 4]);
                                    return [4, api('/api/drive/conectar', { method: 'POST', body: { url: $('#durl').value, passphrase: $('#dpw').value, token: $('#dtok').value } })];
                                case 2:
                                    r = _b.sent();
                                    msg('#dcm', 'ok', ((_a = r.first) === null || _a === void 0 ? void 0 : _a.error) ? "Conectado, pero la primera copia fall\u00F3: ".concat(r.first.error) : '¡Conectado! Ya subí la primera copia a la carpeta "JARVIS - copias y memoria" de tu Drive.');
                                    setTimeout(loadDrive, 2500);
                                    return [3, 4];
                                case 3:
                                    err_16 = _b.sent();
                                    msg('#dcm', 'err', err_16.message);
                                    return [3, 4];
                                case 4: return [2];
                            }
                        });
                    }); };
                    if ($('#dnow'))
                        $('#dnow').onclick = function () { return __awaiter(_this, void 0, void 0, function () { var r, err_17; return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    msg('#dm', '', 'Subiendo…');
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 3, , 4]);
                                    return [4, api('/api/drive/ahora', { method: 'POST' })];
                                case 2:
                                    r = _a.sent();
                                    msg('#dm', 'ok', "Listo: memoria ".concat(kb(r.memoryBytes)).concat(r.core ? " + n\u00FAcleo ".concat(kb(r.core.bytes)) : '', "."));
                                    setTimeout(loadDrive, 1500);
                                    return [3, 4];
                                case 3:
                                    err_17 = _a.sent();
                                    msg('#dm', 'err', err_17.message);
                                    return [3, 4];
                                case 4: return [2];
                            }
                        }); }); };
                    if ($('#doff'))
                        $('#doff').onclick = function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4, api('/api/drive/desconectar', { method: 'POST' }).catch(function () { })];
                                case 1:
                                    _a.sent();
                                    loadDrive();
                                    return [2];
                            }
                        }); }); };
                    if ($('#drs'))
                        $('#drs').onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                            var r, err_18;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!$('#drok').checked)
                                            return [2, msg('#drm', 'err', 'Marca la casilla para confirmar.')];
                                        msg('#drm', '', 'Trayendo la copia de tu Drive y revisándola…');
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4, api('/api/drive/restaurar', { method: 'POST', body: { passphrase: $('#drpw').value, confirm: true } })];
                                    case 2:
                                        r = _a.sent();
                                        msg('#drm', 'ok', "".concat(r.message, " (").concat(r.info.predictions, " votos, ").concat(r.info.experiments, " ideas probadas)."));
                                        setTimeout(function () { return location.reload(); }, 9000);
                                        return [3, 4];
                                    case 3:
                                        err_18 = _a.sent();
                                        msg('#drm', 'err', err_18.message);
                                        return [3, 4];
                                    case 4: return [2];
                                }
                            });
                        }); };
                    return [2];
            }
        });
    });
}
views.ajustes.after = function () {
    if ((ME === null || ME === void 0 ? void 0 : ME.role) !== 'admin')
        return;
    api('/api/brain').then(function (b) {
        var _a;
        var el = $('#brainsum');
        if (!el)
            return;
        var S = b.summary;
        el.innerHTML = "<div class=\"bsum\">".concat([['🗳️', S.predictions, 'votos y recomendaciones'], ['🧪', S.experiments, 'ideas probadas'], ['🪙', S.coins, 'movimientos de monedas'], ['🔒', S.ledger, 'registros sellados'], ['🎱', S.lottery, 'jugadas de lotería'], ['📈', S.bars, 'precios guardados']].map(function (_a) {
            var _b = __read(_a, 3), i = _b[0], n = _b[1], l = _b[2];
            return "<div class=\"pbox\"><div class=\"l\">".concat(i, " ").concat(l, "</div><div class=\"v\">").concat(Number(n).toLocaleString('en-US'), "</div></div>");
        }).join(''), "</div>\n      <div class=\"note\" style=\"margin-top:6px\">Tama\u00F1o: ").concat(b.file ? (b.file.bytes / 1048576).toFixed(1) + ' MB' : '—', " \u00B7 \u00FAltima copia diaria: ").concat(b.last ? timeAgo(b.last.at) + (b.last.verified ? ' (verificada ✓)' : '') + (((_a = b.last.offsite) === null || _a === void 0 ? void 0 : _a.uploaded) ? ', también fuera del servidor ✓' : ', solo dentro del servidor') : 'todavía no', "</div>");
    }).catch(function () { });
    var restoreFile = null;
    $('#brf').onchange = function (e) { var f = e.target.files[0]; if (!f)
        return; var r = new FileReader(); r.onload = function () { restoreFile = r.result; $('#brn').textContent = "".concat(f.name, " \u00B7 ").concat((f.size / 1048576).toFixed(1), " MB"); }; r.readAsDataURL(f); };
    $('#bdl').onclick = function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, j, blob, name, a_1, err_19;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    $('#bdm').className = 'msg';
                    $('#bdm').textContent = 'Preparando copia…';
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 6, , 7]);
                    return [4, fetch('/api/brain/export', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase: $('#bpw').value }) })];
                case 2:
                    res = _b.sent();
                    if (!!res.ok) return [3, 4];
                    return [4, res.json().catch(function () { return ({}); })];
                case 3:
                    j = _b.sent();
                    throw new Error(j.error || 'No se pudo.');
                case 4: return [4, res.blob()];
                case 5:
                    blob = _b.sent(), name = ((_a = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)) === null || _a === void 0 ? void 0 : _a[1]) || 'jarvis-nucleo.jvbk';
                    a_1 = document.createElement('a');
                    a_1.href = URL.createObjectURL(blob);
                    a_1.download = name;
                    document.body.appendChild(a_1);
                    a_1.click();
                    setTimeout(function () { URL.revokeObjectURL(a_1.href); a_1.remove(); }, 2000);
                    $('#bdm').className = 'msg ok';
                    $('#bdm').textContent = "Listo: ".concat(name, ". Gu\u00E1rdalo en tu Drive o correo, junto con tu frase en un lugar seguro.");
                    return [3, 7];
                case 6:
                    err_19 = _b.sent();
                    $('#bdm').className = 'msg err';
                    $('#bdm').textContent = err_19.message;
                    return [3, 7];
                case 7: return [2];
            }
        });
    }); };
    $('#brs').onclick = function () { return __awaiter(void 0, void 0, void 0, function () {
        var r, err_20;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!restoreFile) {
                        $('#brm').className = 'msg err';
                        $('#brm').textContent = 'Elige el archivo de la copia.';
                        return [2];
                    }
                    if (!$('#brok').checked) {
                        $('#brm').className = 'msg err';
                        $('#brm').textContent = 'Marca la casilla para confirmar.';
                        return [2];
                    }
                    $('#brm').className = 'msg';
                    $('#brm').textContent = 'Revisando la copia…';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/brain/restore', { method: 'POST', body: { file: restoreFile, passphrase: $('#brpw').value } })];
                case 2:
                    r = _a.sent();
                    $('#brm').className = 'msg ok';
                    $('#brm').textContent = "".concat(r.message, " (").concat(r.info.predictions, " votos, ").concat(r.info.experiments, " ideas probadas).");
                    setTimeout(function () { return location.reload(); }, 9000);
                    return [3, 4];
                case 3:
                    err_20 = _a.sent();
                    $('#brm').className = 'msg err';
                    $('#brm').textContent = err_20.message;
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); };
    loadDrive();
    if ($('#showusers'))
        $('#showusers').onchange = function (e) { return api('/api/login/users', { method: 'POST', body: { show: e.target.checked } }).catch(function () { }); };
    $('#kf').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
        var body, err_21;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    body = {};
                    document.querySelectorAll('[data-key]').forEach(function (i) { if (i.value.trim())
                        body[i.dataset.key] = i.value.trim(); });
                    document.querySelectorAll('[data-del]').forEach(function (c) { if (c.checked)
                        body[c.dataset.del] = ''; });
                    if (!Object.keys(body).length) {
                        $('#km').className = 'msg err';
                        $('#km').textContent = 'No escribiste ninguna clave.';
                        return [2];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api('/api/keys', { method: 'POST', body: body })];
                case 2:
                    _a.sent();
                    document.querySelectorAll('[data-key]').forEach(function (i) { i.value = ''; });
                    $('#km').className = 'msg ok';
                    $('#km').textContent = 'Guardadas en el servidor. Ya están funcionando.';
                    setTimeout(render, 1000);
                    return [3, 4];
                case 3:
                    err_21 = _a.sent();
                    $('#km').className = 'msg err';
                    $('#km').textContent = err_21.message;
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); };
    var color = BRAND.color, logo = null, removeLogo = false;
    var prev = function () {
        var P = BRAND.palettes[color];
        var src = logo || (BRAND.hasLogo && !removeLogo ? "/brand/logo?v=".concat(BRAND.v) : null);
        $('#bprev').innerHTML = "<div class=\"bp-bar\" style=\"--pa:".concat(P.dark, "\">").concat(src ? "<img src=\"".concat(src, "\" alt=\"\">") : "<span class=\"ring\" style=\"border-color:".concat(P.dark, "\"><i style=\"background:").concat(P.dark, "\"></i></span>"), "<b>").concat(esc($('#bn').value || 'JARVIS'), "</b><span class=\"bp-tabs\"><i style=\"background:").concat(P.dark, "33;color:").concat(P.dark, "\">Inicio</i><i>Historial</i></span></div>\n      <div class=\"bp-login\">").concat(src ? "<img src=\"".concat(src, "\" alt=\"\">") : "<span class=\"ring big\" style=\"border-color:".concat(P.dark, "\"><i style=\"background:").concat(P.dark, "\"></i></span>"), "<b>").concat(esc($('#bn').value || 'JARVIS'), "</b><small>").concat(esc($('#bt').value), "</small>").concat($('#bo').value ? "<em>Programa privado de ".concat(esc($('#bo').value), "</em>") : '', "<span class=\"bp-btn\" style=\"background:").concat(P.dark, "\">Entrar</span></div>");
    };
    ['#bn', '#bt', '#bo'].forEach(function (id) { return $(id).oninput = prev; });
    document.querySelectorAll('.sw').forEach(function (b) { return b.onclick = function () { color = b.dataset.c; document.querySelectorAll('.sw').forEach(function (x) { return x.classList.toggle('on', x === b); }); prev(); }; });
    $('#bl').onchange = function () { return __awaiter(void 0, void 0, void 0, function () { var f, e_8; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                f = $('#bl').files[0];
                if (!f)
                    return [2];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4, shrinkImage(f)];
            case 2:
                logo = _a.sent();
                removeLogo = false;
                prev();
                $('#bm').className = 'msg ok';
                $('#bm').textContent = 'Logo listo. Pulsa "Guardar mi marca".';
                return [3, 4];
            case 3:
                e_8 = _a.sent();
                $('#bm').className = 'msg err';
                $('#bm').textContent = e_8.message;
                return [3, 4];
            case 4: return [2];
        }
    }); }); };
    if ($('#blr'))
        $('#blr').onclick = function () { removeLogo = true; logo = null; prev(); };
    $('#bsave').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var e_9; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4, api('/api/brand', { method: 'POST', body: __assign(__assign({ name: $('#bn').value, tagline: $('#bt').value, owner: $('#bo').value, color: color }, (logo ? { logo: logo } : {})), (removeLogo ? { removeLogo: true } : {})) })];
            case 1:
                BRAND = _a.sent();
                applyBrand();
                $('#bm').className = 'msg ok';
                $('#bm').textContent = '¡Listo! Tu marca quedó guardada.';
                setTimeout(render, 900);
                return [3, 3];
            case 2:
                e_9 = _a.sent();
                $('#bm').className = 'msg err';
                $('#bm').textContent = e_9.message;
                return [3, 3];
            case 3: return [2];
        }
    }); }); };
    prev();
    var m = function (t, ok) {
        if (ok === void 0) { ok = true; }
        $('#mm').className = 'msg ' + (ok ? 'ok' : 'err');
        $('#mm').textContent = t;
    };
    $('#mnon').onchange = function () { return $('#mhl').classList.toggle('hide', $('#mnon').checked); };
    $('#mstart').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, api('/api/motor/start', { method: 'POST', body: { hours: $('#mnon').checked ? null : Number($('#mh').value) } })];
            case 1:
                _a.sent();
                m($('#mnon').checked ? 'Motor activado sin parar: investiga y explora hasta que lo detengas.' : 'Motor activado.');
                setTimeout(render, 800);
                return [2];
        }
    }); }); };
    $('#mpause').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, api('/api/motor/pause', { method: 'POST' })];
            case 1:
                _a.sent();
                m('En pausa.');
                setTimeout(render, 800);
                return [2];
        }
    }); }); };
    $('#mresume').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, api('/api/motor/resume', { method: 'POST' })];
            case 1:
                _a.sent();
                m('Reanudado.');
                setTimeout(render, 800);
                return [2];
        }
    }); }); };
    $('#mstop').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, api('/api/motor/stop', { method: 'POST' })];
            case 1:
                _a.sent();
                m('Detenido.');
                setTimeout(render, 800);
                return [2];
        }
    }); }); };
    $('#mrun').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var r, e_10; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                m('Corriendo ciclo… puede tardar unos minutos la primera vez.');
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4, api('/api/motor/run', { method: 'POST', body: { force: ['loterias_resultados', 'bolsa_historial', 'ranking'] } })];
            case 2:
                r = _a.sent();
                m('Ciclo terminado: ' + Object.entries(r).map(function (_a) {
                    var _b = __read(_a, 2), k = _b[0], v = _b[1];
                    return "".concat(k, " ").concat(v.ok ? '✓' : '✕');
                }).join(', '));
                return [3, 4];
            case 3:
                e_10 = _a.sent();
                m(e_10.message, false);
                return [3, 4];
            case 4: return [2];
        }
    }); }); };
    $('#saveai').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var en_1, e_11; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                en_1 = {};
                document.querySelectorAll('[data-ai]').forEach(function (c) { return en_1[c.dataset.ai] = c.checked; });
                return [4, api('/api/settings', { method: 'POST', body: { aiEnabled: en_1, prices: JSON.parse($('#prices').value) } })];
            case 1:
                _a.sent();
                m('IA guardada.');
                return [3, 3];
            case 2:
                e_11 = _a.sent();
                m(e_11.message, false);
                return [3, 3];
            case 3: return [2];
        }
    }); }); };
    $('#saveother').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var e_12; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4, api('/api/settings', { method: 'POST', body: { universe: $('#univ').value.split(/[,\s]+/).filter(Boolean), payouts: JSON.parse($('#pay').value), allowSingleSource: $('#single').checked } })];
            case 1:
                _a.sent();
                m('Guardado.');
                return [3, 3];
            case 2:
                e_12 = _a.sent();
                m(e_12.message, false);
                return [3, 3];
            case 3: return [2];
        }
    }); }); };
    if ($('#ntest'))
        $('#ntest').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var e_13; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4, api('/api/notify/test', { method: 'POST' })];
                case 1:
                    _a.sent();
                    $('#nm').className = 'msg ok';
                    $('#nm').textContent = 'Aviso enviado: revisa tu celular.';
                    return [3, 3];
                case 2:
                    e_13 = _a.sent();
                    $('#nm').className = 'msg err';
                    $('#nm').textContent = e_13.message;
                    return [3, 3];
                case 3: return [2];
            }
        }); }); };
    document.querySelectorAll('[data-act]').forEach(function (b) { return b.onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var err_22; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4, api("/api/users/".concat(b.dataset.act, "/active"), { method: 'POST', body: { active: b.dataset.on === '1' } })];
            case 1:
                _a.sent();
                render();
                return [3, 3];
            case 2:
                err_22 = _a.sent();
                $('#um').className = 'msg err';
                $('#um').textContent = err_22.message;
                return [3, 3];
            case 3: return [2];
        }
    }); }); }; });
    document.querySelectorAll('[data-pw]').forEach(function (b) { return b.onclick = function () {
        var td = b.parentElement;
        td.innerHTML = "<form class=\"row\" style=\"gap:6px;justify-content:flex-end\"><input type=\"text\" minlength=\"10\" placeholder=\"vac\u00EDa = autom\u00E1tica\" style=\"width:160px\" autocomplete=\"off\"><button class=\"btn sm\">Guardar</button></form>";
        td.querySelector('form').onsubmit = function (ev) { return __awaiter(void 0, void 0, void 0, function () { var r, err_23; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ev.preventDefault();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api("/api/users/".concat(b.dataset.pw, "/password"), { method: 'POST', body: { password: td.querySelector('input').value } })];
                case 2:
                    r = _a.sent();
                    td.innerHTML = r.password ? "<span class=\"good\">Nueva: <b style=\"font-family:ui-monospace,monospace;user-select:all\">".concat(esc(r.password), "</b></span><div class=\"note\">D\u00E1sela ahora; no se vuelve a mostrar.</div>") : '<span class="good">Contraseña cambiada</span>';
                    return [3, 4];
                case 3:
                    err_23 = _a.sent();
                    td.insertAdjacentHTML('beforeend', "<div class=\"msg err\">".concat(esc(err_23.message), "</div>"));
                    return [3, 4];
                case 4: return [2];
            }
        }); }); };
    }; });
    var showPw = function (who, pw) { return "<div class=\"msg ok\" style=\"font-size:16px;line-height:1.6\">Usuario <b>".concat(esc(who), "</b> listo. Su contrase\u00F1a es: <b style=\"font-family:ui-monospace,monospace;font-size:20px;user-select:all\">").concat(esc(pw), "</b><br><span class=\"note\">C\u00F3piala y d\u00E1sela ahora: no se vuelve a mostrar. \u00C9l la puede cambiar en Mi perfil.</span></div>"); };
    $('#uf').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () { var r, err_24; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                e.preventDefault();
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4, api('/api/users', { method: 'POST', body: { displayName: $('#nn').value, username: $('#nu').value, password: $('#np').value, monthlyCap: Number($('#nm').value), dailyCap: Number($('#nm').value) / 10 } })];
            case 2:
                r = _a.sent();
                if (r.password) {
                    $('#um').className = '';
                    $('#um').innerHTML = showPw($('#nu').value, r.password) + '<button class="btn ghost sm" id="umok" style="margin-top:8px">Ya la copié</button>';
                    $('#umok').onclick = function () { return render(); };
                }
                else {
                    $('#um').className = 'msg ok';
                    $('#um').textContent = 'Usuario creado.';
                    setTimeout(render, 900);
                }
                return [3, 4];
            case 3:
                err_24 = _a.sent();
                $('#um').className = 'msg err';
                $('#um').textContent = err_24.message;
                return [3, 4];
            case 4: return [2];
        }
    }); }); };
};
function barChart(items, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.fmt, fmt = _c === void 0 ? function (v) { return v; } : _c, _d = _b.h, h = _d === void 0 ? 30 : _d, _e = _b.label, label = _e === void 0 ? '' : _e;
    if (!(items === null || items === void 0 ? void 0 : items.length))
        return '<div class="empty">Sin datos todavía.</div>';
    var max = Math.max.apply(Math, __spreadArray(__spreadArray([], __read(items.map(function (i) { return Math.abs(i.value); })), false), [1e-9], false)), neg = items.some(function (i) { return i.value < 0; });
    var W = 600, LW = Math.min(250, Math.max(90, Math.max.apply(Math, __spreadArray([], __read(items.map(function (i) { return String(i.label).length; })), false)) * 7.8 + 18)), VW = 86, BW = W - LW - VW, zero = neg ? LW + BW / 2 : LW, scale = neg ? BW / 2 : BW;
    return "<svg viewBox=\"0 0 ".concat(W, " ").concat(items.length * h + 8, "\" width=\"100%\" style=\"max-width:760px;display:block\" role=\"img\" aria-label=\"").concat(esc(label), "\">\n    ").concat(neg ? "<line x1=\"".concat(zero, "\" x2=\"").concat(zero, "\" y1=\"0\" y2=\"").concat(items.length * h + 8, "\" stroke=\"#1e2a44\"/>") : '', "\n    ").concat(items.map(function (it, i) {
        var w = Math.abs(it.value) / max * scale, x = it.value >= 0 ? zero : zero - w, y = i * h + 4, col = it.color || (it.value >= 0 ? '#2fd58a' : '#ff5d6c');
        return "<text x=\"".concat(LW - 10, "\" y=\"").concat(y + h / 2 + 5, "\" text-anchor=\"end\" font-size=\"14\" fill=\"").concat(it.dim && !it.color ? '#8a97b5' : '#e8eefc', "\" font-weight=\"").concat(it.bold ? 800 : 500, "\">").concat(esc(it.label), "</text>\n      <rect x=\"").concat(x, "\" y=\"").concat(y + 3, "\" width=\"").concat(Math.max(2, w), "\" height=\"").concat(h - 9, "\" rx=\"4\" fill=\"").concat(col, "\" opacity=\"").concat(it.dim ? .45 : .9, "\"/>\n      <text x=\"").concat(W - 4, "\" y=\"").concat(y + h / 2 + 5, "\" text-anchor=\"end\" font-size=\"14\" fill=\"#e8eefc\" font-weight=\"700\">").concat(esc(fmt(it.value)), "</text>");
    }).join(''), "\n  </svg>");
}
function rangeChart(rows, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.fmt, fmt = _c === void 0 ? function (v) { return pctp(v); } : _c, _d = _b.label, label = _d === void 0 ? '' : _d;
    if (!(rows === null || rows === void 0 ? void 0 : rows.length))
        return '<div class="empty">Faltan datos para estimar escenarios.</div>';
    var W = 760, LW = 90, RW = 20, h = 46, vals = rows.flatMap(function (r) { return [r.bad, r.good, 0]; }), min = Math.min.apply(Math, __spreadArray([], __read(vals), false)), max = Math.max.apply(Math, __spreadArray([], __read(vals), false)), sp = max - min || 1;
    var x = function (v) { return LW + (v - min) / sp * (W - LW - RW); };
    return "<svg viewBox=\"0 0 ".concat(W, " ").concat(rows.length * h + 26, "\" width=\"100%\" role=\"img\" aria-label=\"").concat(esc(label), "\">\n    <line x1=\"").concat(x(0), "\" x2=\"").concat(x(0), "\" y1=\"0\" y2=\"").concat(rows.length * h, "\" stroke=\"#8a97b5\" stroke-dasharray=\"4 4\"/><text x=\"").concat(x(0), "\" y=\"").concat(rows.length * h + 18, "\" text-anchor=\"middle\" font-size=\"12\" fill=\"#8a97b5\">0%</text>\n    ").concat(rows.map(function (r, i) {
        var y = i * h + 10;
        return "<text x=\"".concat(LW - 10, "\" y=\"").concat(y + 16, "\" text-anchor=\"end\" font-size=\"13\" font-weight=\"700\" fill=\"#e8eefc\">").concat(esc(r.label), "</text>\n      <rect x=\"").concat(x(Math.min(r.bad, 0)), "\" y=\"").concat(y + 6, "\" width=\"").concat(Math.max(1, x(Math.min(0, r.good)) - x(Math.min(r.bad, 0))), "\" height=\"14\" rx=\"7\" fill=\"#ff5d6c\" opacity=\".35\"/>\n      <rect x=\"").concat(x(Math.max(r.bad, 0)), "\" y=\"").concat(y + 6, "\" width=\"").concat(Math.max(1, x(r.good) - x(Math.max(r.bad, 0))), "\" height=\"14\" rx=\"7\" fill=\"#2fd58a\" opacity=\".35\"/>\n      <circle cx=\"").concat(x(r.probable), "\" cy=\"").concat(y + 13, "\" r=\"7\" fill=\"#38d6f5\" stroke=\"#0e1527\" stroke-width=\"2\"/>\n      <text x=\"").concat(x(r.bad), "\" y=\"").concat(y + 38, "\" text-anchor=\"middle\" font-size=\"11.5\" fill=\"#ff5d6c\">").concat(esc(fmt(r.bad)), "</text>\n      <text x=\"").concat(x(r.probable), "\" y=\"").concat(y + 38, "\" text-anchor=\"middle\" font-size=\"11.5\" font-weight=\"800\" fill=\"#38d6f5\">").concat(esc(fmt(r.probable)), "</text>\n      <text x=\"").concat(x(r.good), "\" y=\"").concat(y + 38, "\" text-anchor=\"middle\" font-size=\"11.5\" fill=\"#2fd58a\">").concat(esc(fmt(r.good)), "</text>");
    }).join(''), "\n  </svg>");
}
function compareLine(a, b, markers, _a) {
    if (markers === void 0) { markers = []; }
    var _b = _a === void 0 ? {} : _a, _c = _b.label, label = _c === void 0 ? '' : _c;
    if (!(a === null || a === void 0 ? void 0 : a.length))
        return '<div class="empty">Sin precios.</div>';
    var bm = new Map((b || []).map(function (p) { return [p[0], p[1]]; })), a0 = a[0][1], b0 = bm.get(a[0][0]);
    var A = a.map(function (p) { return [p[0], (p[1] / a0 - 1) * 100]; }), B = b0 ? a.filter(function (p) { return bm.has(p[0]); }).map(function (p) { return [p[0], (bm.get(p[0]) / b0 - 1) * 100]; }) : null;
    var W = 760, H = 230, L = 46, R = 70, all = __spreadArray(__spreadArray([], __read(A), false), __read((B || [])), false).map(function (p) { return p[1]; }), min = Math.min.apply(Math, __spreadArray([0], __read(all), false)), max = Math.max.apply(Math, __spreadArray([0], __read(all), false)), sp = max - min || 1;
    var idx = new Map(a.map(function (p, i) { return [p[0], i]; })), x = function (i) { return L + i / (a.length - 1) * (W - L - R); }, y = function (v) { return 10 + (1 - (v - min) / sp) * (H - 40); };
    var path = function (pts) { return pts.map(function (p) { return "".concat(p === pts[0] ? 'M' : 'L').concat(x(idx.get(p[0])).toFixed(1), " ").concat(y(p[1]).toFixed(1)); }).join(' '); };
    var col = { verde: '#2fd58a', amarillo: '#ffbf3c', rojo: '#ff5d6c' };
    return "<svg viewBox=\"0 0 ".concat(W, " ").concat(H, "\" width=\"100%\" role=\"img\" aria-label=\"").concat(esc(label), "\">\n    ").concat([min, (min + max) / 2, max].map(function (t) { return "<line x1=\"".concat(L, "\" x2=\"").concat(W - R, "\" y1=\"").concat(y(t), "\" y2=\"").concat(y(t), "\" stroke=\"#1e2a44\"/><text x=\"").concat(L - 6, "\" y=\"").concat(y(t) + 4, "\" text-anchor=\"end\" font-size=\"11\" fill=\"#8a97b5\">").concat(t >= 0 ? '+' : '').concat(t.toFixed(0), "%</text>"); }).join(''), "\n    <line x1=\"").concat(L, "\" x2=\"").concat(W - R, "\" y1=\"").concat(y(0), "\" y2=\"").concat(y(0), "\" stroke=\"#8a97b5\" stroke-dasharray=\"3 4\"/>\n    ").concat(B ? "<path d=\"".concat(path(B), "\" fill=\"none\" stroke=\"#8a97b5\" stroke-width=\"1.8\" stroke-dasharray=\"6 5\"/><text x=\"").concat(W - R + 6, "\" y=\"").concat(y(B.at(-1)[1]) + 4, "\" font-size=\"12\" fill=\"#8a97b5\">Mercado</text>") : '', "\n    <path d=\"").concat(path(A), "\" fill=\"none\" stroke=\"#38d6f5\" stroke-width=\"2.6\"/><text x=\"").concat(W - R + 6, "\" y=\"").concat(y(A.at(-1)[1]) + 4, "\" font-size=\"12\" font-weight=\"800\" fill=\"#38d6f5\">").concat(A.at(-1)[1] >= 0 ? '+' : '').concat(A.at(-1)[1].toFixed(1), "%</text>\n    ").concat(markers.filter(function (m) { return idx.has(m.date); }).map(function (m) { return "<circle cx=\"".concat(x(idx.get(m.date)), "\" cy=\"").concat(y(A[idx.get(m.date)][1]), "\" r=\"6\" fill=\"").concat(col[m.light] || '#38d6f5', "\" stroke=\"#0e1527\" stroke-width=\"2\"><title>").concat(esc(m.date), ": JARVIS dijo ").concat(esc(m.light)).concat(m.correct == null ? ' (pendiente)' : m.correct ? ' — acertó' : ' — falló', "</title></circle>"); }).join(''), "\n    <text x=\"").concat(L, "\" y=\"").concat(H - 6, "\" font-size=\"11\" fill=\"#8a97b5\">").concat(esc(a[0][0]), "</text><text x=\"").concat(W - R, "\" y=\"").concat(H - 6, "\" text-anchor=\"end\" font-size=\"11\" fill=\"#8a97b5\">").concat(esc(a.at(-1)[0]), "</text>\n  </svg>");
}
function freqChart(freq, expected, highlight) {
    var keys = Object.keys(freq).sort(), max = Math.max.apply(Math, __spreadArray(__spreadArray([], __read(Object.values(freq)), false), [expected * 1.5, 1], false)), W = 760, H = 190, bw = (W - 30) / 100;
    var y = function (v) { return 28 + (1 - v / max) * (H - 54); };
    return "<svg viewBox=\"0 0 ".concat(W, " ").concat(H, "\" width=\"100%\" role=\"img\" aria-label=\"Veces que sali\u00F3 cada n\u00FAmero\">\n    ").concat(keys.map(function (k, i) { return "<rect x=\"".concat(20 + i * bw, "\" y=\"").concat(y(freq[k]), "\" width=\"").concat(bw - 1.5, "\" height=\"").concat(H - 26 - y(freq[k]), "\" fill=\"").concat(k === highlight ? '#ffbf3c' : '#38d6f5', "\" opacity=\"").concat(k === highlight ? 1 : .55, "\"><title>").concat(k, ": ").concat(freq[k], " veces</title></rect>"); }).join(''), "\n    <line x1=\"20\" x2=\"").concat(W - 10, "\" y1=\"").concat(y(expected), "\" y2=\"").concat(y(expected), "\" stroke=\"#ff5d6c\" stroke-dasharray=\"5 4\"/><text x=\"22\" y=\"14\" font-size=\"12\" fill=\"#ff5d6c\">- - - esperado por azar: ").concat(expected.toFixed(1), " veces</text>\n    ").concat(['00', '25', '50', '75', '99'].map(function (k) { return "<text x=\"".concat(20 + Number(k) * bw + bw / 2, "\" y=\"").concat(H - 10, "\" text-anchor=\"middle\" font-size=\"11\" fill=\"#8a97b5\">").concat(k, "</text>"); }).join(''), "\n  </svg>");
}
var pctp = function (v, d) {
    if (d === void 0) { d = 1; }
    return (v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%');
};
var KIND = { dato: ['dato', 'Dato confirmado'], estimacion: ['est', 'Estimación'], opinion: ['opinion', 'Opinión de IA'], noticia: ['est', 'Noticia sin confirmar'] };
var kindTag = function (k) { return "<span class=\"tag ".concat((KIND[k] || KIND.dato)[0], "\">").concat((KIND[k] || KIND.dato)[1], "</span>"); };
function sourcesList(src) {
    return "<div style=\"display:flex;flex-direction:column;gap:8px\">".concat(src.map(function (s, i) { return "<div style=\"display:flex;gap:10px;align-items:flex-start\"><span class=\"mono note\" style=\"min-width:26px\">[".concat(i + 1, "]</span>").concat(kindTag(s.kind), "<div style=\"min-width:0\">").concat(s.url ? "<a href=\"".concat(esc(s.url), "\" target=\"_blank\" rel=\"noopener\">").concat(esc(s.label), "</a>") : esc(s.label)).concat(s.at ? "<div class=\"note\">".concat(esc(String(s.at).slice(0, 16).replace('T', ' ')), "</div>") : '', "</div></div>"); }).join(''), "</div>");
}
function qaAccordion(c) {
    var Q = [['💡', '¿Por qué?', c.why], ['📊', '¿Qué pruebas la respaldan?', c.evidence], ['🎯', '¿Qué posibilidades tiene?', c.chance], ['⏳', '¿El dinero se gana de inmediato o en cuánto tiempo?', c.when], ['⚠️', '¿Cuáles son los riesgos?', c.risks], ['🧯', '¿Qué podría hacerla fallar?', c.failIf], ['🤖', '¿Qué dicen las otras IA?', c.ias], ['✅', '¿Qué conviene más?', [c.best, c.amount]]].filter(function (q) { return q[2]; });
    return "<div class=\"acc\">".concat(Q.map(function (_a, i) {
        var _b = __read(_a, 3), ic = _b[0], q = _b[1], a = _b[2];
        return "<details".concat(i === 0 ? ' open' : '', "><summary><span class=\"ic\">").concat(ic, "</span>").concat(q, "</summary><div class=\"ans\">").concat(Array.isArray(a) ? "<ul>".concat(a.filter(Boolean).map(function (x) { return "<li>".concat(esc(x), "</li>"); }).join(''), "</ul>") : esc(a), "</div></details>");
    }).join(''), "</div>");
}
function sizeCard(z, budget, lightName) {
    return "<section class=\"card sizecard\"><h2>\u00BFCu\u00E1nto pongo con mi dinero?</h2>\n    <div class=\"sz\"><div><div class=\"note\">Tu dinero para invertir</div><div class=\"sz-v\">".concat(usd(budget.usd, 0), "</div><a class=\"note\" href=\"#bolsa\">cambiar \u25B8</a></div>\n    <div class=\"sz-arrow\">\u2192</div><div><div class=\"note\">Te recomiendo poner</div><div class=\"sz-v ").concat(z.usd ? 'good' : 'bad', "\">").concat(z.usd ? usd(z.usd, 0) : 'US$0', "</div><div class=\"note\">").concat(z.usd ? "".concat(z.pct, "% de tu dinero") : 'no inviertas en esta', "</div></div>\n    <div class=\"sz-more ").concat(z.canMore ? 'yes' : 'no', "\"><b>\u00BFPuedo poner m\u00E1s?</b><div>").concat(esc(z.more), "</div></div></div>\n    ").concat(z.usd ? "<details class=\"note\" style=\"margin-top:10px\"".concat(z.canMore ? '' : ' open', "><summary>\u00BFPor qu\u00E9? Las 5 condiciones para poder poner m\u00E1s (hasta ").concat(myStyle().max * 100, "% de tu dinero)</summary><div class=\"note\" style=\"margin-top:6px\">\u2713 = se cumple \u00B7 \u2715 = todav\u00EDa no. Se necesitan las 5 para poner m\u00E1s.</div><div class=\"checks\" style=\"margin-top:8px\">").concat(z.checks.map(function (c) { return "<div class=\"ck ".concat(c.ok ? 'ok' : 'no', "\">").concat(c.ok ? '✓' : '✕', " ").concat(esc(c.text), "</div>"); }).join(''), "</div></details>") : '', "\n    ").concat(z.note ? "<div class=\"note\" style=\"margin-top:6px\">".concat(esc(z.note), "</div>") : '', "\n    <div class=\"note\" style=\"margin-top:8px\">Regla seg\u00FAn tu estilo: \"S\u00ED, invierte\" = ").concat(myStyle().verde * 100, "% de tu dinero por idea; \"Invierte poco\" = ").concat(myStyle().amarillo * 100, "%; nunca m\u00E1s de ").concat(myStyle().max * 100, "% en una sola, y siempre guarda al menos 10% en efectivo. \u00BFVas a poner mucho m\u00E1s? Usa <a href=\"#buscar\">Buscar a mi medida</a> y JARVIS revisa tu apuesta.</div></section>");
}
function timingCard(a) {
    var t = a.timing;
    if (!t)
        return '';
    var rows = t.horizons.map(function (h) {
        var _a, _b;
        var n = Math.round(h.pProfit * 10), col = h.pProfit >= 0.66 ? '#2fd58a' : h.pProfit >= 0.5 ? '#ffbf3c' : '#ff5d6c';
        return "<div class=\"tl-row".concat(((_a = t.recommended) === null || _a === void 0 ? void 0 : _a.days) === h.days ? ' rec' : '', "\"><span class=\"tl-l\">").concat(esc(h.label), "</span><span class=\"dots\">").concat(Array.from({ length: 10 }, function (_, i) { return "<i".concat(i < n ? " style=\"background:".concat(col, ";border-color:").concat(col, "\"") : '', "></i>"); }).join(''), "</span><span class=\"tl-n\"><b>").concat(n, " de 10</b> veces ganando</span><span class=\"tl-m note\">lo normal: ").concat(pctp(h.median)).concat(((_b = t.recommended) === null || _b === void 0 ? void 0 : _b.days) === h.days ? ' · <b class="good">tiempo recomendado</b>' : '', "</span></div>");
    }).join('');
    var tt = t.toTarget, rc = t.recovery;
    return "<section class=\"card\"><h2>\u00BFEn cu\u00E1nto tiempo se gana el dinero?</h2>".concat(takeaway(esc(t.summary)), "\n    <div class=\"grid split\" style=\"gap:20px\">\n      <div><div class=\"note\" style=\"margin-bottom:8px\">Si alguien compraba cualquier d\u00EDa de los \u00FAltimos ").concat(t.yearsUsed, " a\u00F1os y esperaba\u2026</div><div class=\"tl\">").concat(rows, "</div></div>\n      <div class=\"mini3 tl-facts\">\n        <div class=\"pbox\"><div class=\"l\">Subir ").concat(tt ? Math.round(tt.target * 100) : 5, "% tard\u00F3 normalmente</div><div class=\"v\">").concat((tt === null || tt === void 0 ? void 0 : tt.median) != null ? humanDays(tt.median) : '—', "</div><div class=\"note\">").concat((tt === null || tt === void 0 ? void 0 : tt.median) != null ? "a veces ".concat(humanDays(tt.fast), "; 1 de cada 4, m\u00E1s de ").concat(humanDays(tt.slow)) : 'casi nunca llegó', "</div></div>\n        <div class=\"pbox\"><div class=\"l\">Si empez\u00F3 perdiendo, recuperarse tard\u00F3</div><div class=\"v\">").concat((rc === null || rc === void 0 ? void 0 : rc.median) != null ? humanDays(rc.median) : '—', "</div><div class=\"note\">").concat(rc ? "".concat(Math.round(rc.neverPct * 100), "% no se recuper\u00F3 en 2 a\u00F1os") : 'sin casos suficientes', "</div></div>\n        <div class=\"pbox\"><div class=\"l\">No lleg\u00F3 a +").concat(tt ? Math.round(tt.target * 100) : 5, "% en un a\u00F1o</div><div class=\"v ").concat(tt && tt.neverPct > 0.3 ? 'bad' : '', "\">").concat(tt ? Math.round(tt.neverPct * 100) + '%' : '—', "</div><div class=\"note\">de las veces</div></div>\n      </div>\n    </div>\n    <h3 class=\"cs-h\">\u00BFCu\u00E1ndo tienes el dinero en la mano?</h3>\n    <div class=\"cash\">").concat(a.cashSteps.map(function (st, i) { return "<div class=\"cs\"><i>".concat(i + 1, "</i><b>").concat(esc(st.step), "</b><span class=\"note\">").concat(esc(st.note)).concat(st.url ? " <a href=\"".concat(esc(st.url), "\" target=\"_blank\" rel=\"noopener\">Fuente \u25B8</a>") : '', "</span></div>"); }).join(''), "</div>\n    <div class=\"note\" style=\"margin-top:10px\">").concat(kindTag('estimacion'), " Medido con ").concat(esc(t.basedOn), ". Es lo que pas\u00F3 antes, no una promesa: el futuro puede ser distinto.</div></section>");
}
function qaGrid(c) {
    var Q = [['¿Por qué?', c.why], ['¿Qué pruebas la respaldan?', c.evidence], ['¿Qué posibilidades tiene?', c.chance], ['¿Cuáles son los riesgos?', c.risks], ['¿Qué podría hacerla fallar?', c.failIf], ['¿Qué dicen las otras IA?', c.ias], ['¿Qué conviene más?', [c.best, c.amount]]];
    return "<div class=\"grid g2\" style=\"gap:12px\">".concat(Q.map(function (_a) {
        var _b = __read(_a, 2), q = _b[0], a = _b[1];
        return "<div class=\"pbox\"><div style=\"font-weight:800;margin-bottom:6px\">".concat(q, "</div>").concat(Array.isArray(a) ? "<ul style=\"margin:0;padding-left:18px\">".concat(a.filter(Boolean).map(function (x) { return "<li>".concat(esc(x), "</li>"); }).join(''), "</ul>") : "<div>".concat(esc(a), "</div>"), "</div>");
    }).join(''), "</div>");
}
function realtimeBox(a) {
    var _a, _b;
    return "<div class=\"card\"><h2>En tiempo real <span class=\"more note\">an\u00E1lisis del ".concat(esc(a.createdAt.slice(0, 16).replace('T', ' ')), " \u00B7 se rehace cuando llegan datos nuevos</span></h2>\n    ").concat(((_a = a.changes) === null || _a === void 0 ? void 0 : _a.length) ? "<div class=\"answer\" style=\"margin-bottom:10px\"><b>Cambi\u00F3 desde el an\u00E1lisis anterior:</b>".concat(a.changes.map(function (c) { return "<div>\u2022 ".concat(esc(c), "</div>"); }).join(''), "</div>") : '<div class="note" style="margin-bottom:10px">Sin cambios desde el último análisis.</div>', "\n    ").concat(((_b = a.timeline) === null || _b === void 0 ? void 0 : _b.length) > 1 ? "<details><summary>C\u00F3mo evolucion\u00F3 el an\u00E1lisis (".concat(a.timeline.length, " versiones selladas) \u25B8</summary><table style=\"margin-top:8px\"><tr><th>Fecha</th><th>Sem\u00E1foro</th><th class=\"r\">Probabilidad</th><th class=\"r\">Precio</th></tr>").concat(a.timeline.map(function (t) { return "<tr><td>".concat(esc(t.at.slice(0, 16).replace('T', ' ')), "</td><td>").concat(t.light ? light(t.light) : '—', "</td><td class=\"r\">").concat(t.probBeat != null ? Math.round(t.probBeat * 100) + '%' : '—', "</td><td class=\"r\">").concat(t.price ? usd(t.price) : '—', "</td></tr>"); }).join(''), "</table></details>") : '', "</div>");
}
function narrativeBox(a) {
    return "<div class=\"card\"><h2>Explicaci\u00F3n del analista (IA) <span class=\"more note\">usa solo los datos de este an\u00E1lisis</span></h2><div id=\"narr\">".concat(a.narrative ? "<div class=\"answer\">".concat(esc(a.narrative), "<div class=\"note\" style=\"margin-top:6px\">Escrita por ").concat(esc((ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? (a.narrativeBy || 'IA') : 'la IA de JARVIS'), " \u00B7 <span class=\"tag opinion\">Opini\u00F3n de IA</span> basada en los datos</div></div>") : "<button class=\"btn\" id=\"explain\" data-id=\"".concat(a.id, "\">Explic\u00E1rmelo en palabras simples</button><div class=\"note\" style=\"margin-top:6px\">Usa la IA de pago una vez por an\u00E1lisis (centavos) y queda guardada.</div>"), "</div></div>");
}
views.analisis = function (arg) { return __awaiter(void 0, void 0, void 0, function () {
    var a, c, pr, nm, s6, col, myAmt, todo, y1, beatN, fav, bestOther, tm, h1w;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                if (arg.startsWith('loteria/'))
                    return [2, lotteryAnalysisView(arg.split('/')[1])];
                return [4, api('/api/analysis/stock/' + encodeURIComponent(arg))];
            case 1:
                a = _d.sent();
                if (a.empty)
                    return [2, "<div class=\"card empty\">".concat(esc(a.message), "</div>")];
                c = a.conclusion, pr = a.profile, nm = (pr === null || pr === void 0 ? void 0 : pr.name) || coName(a.symbol), s6 = a.scenarios[1];
                col = a.light === 'verde' ? 'good' : a.light === 'amarillo' ? 'warn' : 'bad';
                myAmt = (_b = (_a = a.size) === null || _a === void 0 ? void 0 : _a.usd) !== null && _b !== void 0 ? _b : a.amountUsd;
                todo = a.light === 'verde' ? "S\u00ED, invierte ".concat(usd(myAmt, 0)) : a.light === 'amarillo' ? "Invierte poco: ".concat(usd(myAmt, 0)) : 'No inviertas ahora';
                y1 = a.periods.find(function (p) { return p.label === '1 año'; }), beatN = a.periods.filter(function (p) { return p.stock != null && p.market != null && p.stock > p.market; }).length;
                fav = a.contributions.slice().sort(function (x, y) { return Math.abs(y.contribution) - Math.abs(x.contribution); })[0];
                bestOther = a.compare.filter(function (o) { return !o.current; }).sort(function (x, y) { return y.probBeat - x.probBeat; })[0];
                tm = a.timing, h1w = tm === null || tm === void 0 ? void 0 : tm.horizons.find(function (h) { return h.days === 5; });
                return [2, "<div class=\"note\"><a href=\"#recomendaciones\">Recomendaciones</a> \u203A ".concat(esc(nm), " \u203A An\u00E1lisis completo</div>\n  <section class=\"card ahead\">\n    ").concat((pr === null || pr === void 0 ? void 0 : pr.image) ? "<img src=\"".concat(esc(pr.image), "\" alt=\"").concat(esc(nm), "\" class=\"coimg\">") : coBadge(a.symbol, 84), "\n    <div style=\"min-width:0\"><h1>").concat(esc(nm), " <span class=\"muted\" style=\"font-size:16px\">").concat(esc(a.symbol), " \u00B7 ").concat(usd(a.price.value), " \u00B7 ").concat(esc(a.price.status), "</span></h1>\n      ").concat(pr ? "<div class=\"sub\">".concat(esc(pr.description || ''), "</div><div class=\"note\" style=\"margin-top:4px;max-width:80ch\">").concat(esc(pr.extract), " <a href=\"").concat(esc(pr.url), "\" target=\"_blank\" rel=\"noopener\">").concat(esc(pr.source), " \u25B8</a></div>") : "<div class=\"sub\">".concat(a.symbol === 'SPY' ? 'Fondo que copia a las 500 empresas más grandes de EE. UU.' : 'Empresa que cotiza en la bolsa de Estados Unidos.', "</div>"), "</div>\n    <div></div></section>\n\n  <section class=\"card summary10\" style=\"border-color:var(--").concat(col, ")\"><div class=\"s10-h\">Resumen en 10 segundos</div>\n    <div class=\"s10\">\n      <div class=\"tile\"><div class=\"q\">\u00BFTe recomiendo invertir?</div><div class=\"a ").concat(col, "\">").concat(todo, "</div><div class=\"note\">").concat(esc(c.headline.replace(/^[^:]+:\s*/, '')), "</div></div>\n      <div class=\"tile\"><div class=\"q\">Si pones ").concat(usd(myAmt || baseAmt('verde'), 0), ", en 6 meses quedar\u00EDas con\u2026</div>").concat(moneyRange(myAmt || baseAmt('verde'), s6 ? { bad: (myAmt || baseAmt('verde')) * s6.bad, probable: (myAmt || baseAmt('verde')) * s6.probable, good: (myAmt || baseAmt('verde')) * s6.good } : null), "<div class=\"note\">").concat(s6 ? "Chance de terminar perdiendo: ".concat(Math.round(s6.lossChance * 100), " de cada 100") : '', "</div></div>\n      <div class=\"tile\"><div class=\"q\">\u00BFQu\u00E9 tan seguido le gana al mercado?</div>").concat(chanceDots(a.probBeat, { big: true }), "<div class=\"note\">").concat(a.probMethod === 'calibrado' ? 'Medido con casos reales parecidos' : 'Estimación inicial: se ajusta con resultados reales', "</div></div>\n      <div class=\"tile\"><div class=\"q\">\u00BFLa ganancia es inmediata?</div>").concat(tm ? "<div class=\"a ".concat(tm.immediate ? 'good' : 'warn', "\">").concat(tm.immediate ? 'Puede ser en semanas' : tm.recommended ? "No: d\u00E9jala ".concat(esc(tm.recommended.label)) : 'No: déjala 1 año o más', "</div><div class=\"note\">").concat(h1w ? "En 1 semana estuvo ganando ".concat(Math.round(h1w.pProfit * 10), " de cada 10 veces") : '').concat(tm.recommended && !tm.immediate ? "; en ".concat(esc(tm.recommended.label), ", ").concat(Math.round(tm.horizons.find(function (h) { return h.days === tm.recommended.days; }).pProfit * 10), " de cada 10.") : !tm.recommended && tm.horizons.length ? "; en ".concat(esc(tm.horizons.at(-1).label), ", ").concat(Math.round(tm.horizons.at(-1).pProfit * 10), " de cada 10.") : '.').concat(((_c = tm.toTarget) === null || _c === void 0 ? void 0 : _c.median) != null ? " Subir 5% tard\u00F3 normalmente ".concat(humanDays(tm.toTarget.median), ".") : '', "</div>") : '<div class="note">Faltan precios para medirlo.</div>', "</div>\n    </div></section>\n\n  ").concat(a.size ? sizeCard(a.size, a.budget, a.light) : '', "\n  <section class=\"card\"><h2>Las preguntas, respondidas</h2>").concat(qaAccordion(c), "</section>\n  ").concat(timingCard(a), "\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>Su precio en el \u00FAltimo a\u00F1o, contra el mercado</h2>").concat(takeaway(y1 && y1.stock != null && y1.market != null ? "en un a\u00F1o ".concat(esc(nm), " ").concat(y1.stock >= 0 ? 'subió' : 'bajó', " ").concat(Math.abs(Math.round(y1.stock * 100)), "% y el mercado ").concat(y1.market >= 0 ? 'subió' : 'bajó', " ").concat(Math.abs(Math.round(y1.market * 100)), "%: <b>").concat(y1.stock > y1.market ? 'le ganó' : 'quedó por debajo', "</b>.") : '')).concat(compareLine(a.chart, a.benchChart, a.past, { label: nm + ' contra el mercado' }), "<div class=\"legend\"><span><i style=\"background:#38d6f5\"></i>").concat(esc(nm), "</span><span><i style=\"background:#8a97b5\"></i>El mercado</span><span>\u25CF Recomendaciones pasadas de JARVIS (toca un punto para ver si acert\u00F3)</span></div></div>\n    <div class=\"card\"><h2>\u00BFLe gan\u00F3 al mercado?</h2>").concat(takeaway("le gan\u00F3 al mercado en <b>".concat(beatN, " de ").concat(a.periods.length, "</b> periodos."))).concat(barChart(a.periods.flatMap(function (p) { var _a, _b; return [{ label: p.label + ' · ' + a.symbol, value: (_a = p.stock) !== null && _a !== void 0 ? _a : 0, bold: true }, { label: 'mercado', value: (_b = p.market) !== null && _b !== void 0 ? _b : 0, dim: true }]; }), { fmt: function (v) { return pctp(v); }, label: 'Rendimiento por periodo' }), "\n      <table style=\"margin-top:8px\"><tr><th>Periodo</th><th class=\"r\">").concat(esc(a.symbol), "</th><th class=\"r\">Mercado</th><th>\u00BFLe gan\u00F3?</th></tr>").concat(a.periods.map(function (p) { return "<tr><td>".concat(esc(p.label), "</td><td class=\"r ").concat(cls(p.stock), "\">").concat(pctp(p.stock), "</td><td class=\"r\">").concat(pctp(p.market), "</td><td>").concat(p.stock == null || p.market == null ? '—' : p.stock > p.market ? '<span class="good">Sí</span>' : '<span class="bad">No</span>', "</td></tr>"); }).join(''), "</table>\n      <div class=\"note\">Barras claras: el mercado en el mismo periodo. ").concat(kindTag('dato'), "</div></div>\n  </section>\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>Contra las otras opciones de hoy</h2>").concat(takeaway(bestOther && bestOther.probBeat > a.probBeat ? "hoy <b>".concat(esc(coName(bestOther.symbol)), "</b> tiene m\u00E1s chance (").concat(Math.round(bestOther.probBeat * 10), " de cada 10).") : "".concat(esc(nm), " est\u00E1 entre las de m\u00E1s chance hoy."))).concat(barChart(a.compare.slice().sort(function (x, y) { return y.probBeat - x.probBeat; }).map(function (o) { return ({ label: coName(o.symbol), value: o.probBeat, bold: o.current, color: o.light === 'verde' ? '#2fd58a' : o.light === 'amarillo' ? '#ffbf3c' : '#ff5d6c', dim: !o.current }); }), { fmt: function (v) { return Math.round(v * 10) + ' de 10'; }, label: 'De cada 10 veces, cuántas le gana al mercado' }), "\n      <div class=\"note\">De cada 10 veces, cu\u00E1ntas le ganar\u00EDa al mercado (").concat(kindTag('estimacion'), "). Color = qu\u00E9 hacer.</div></div>\n    <div class=\"card\"><h2>Qu\u00E9 pes\u00F3 en la decisi\u00F3n</h2>").concat(takeaway(fav ? "lo que m\u00E1s pes\u00F3 fue <b>".concat(esc((FACTOR[fav.factor] || fav.factor).toLowerCase()), "</b>, ").concat(fav.contribution >= 0 ? 'a favor' : 'en contra', ".") : '')).concat(whyBars(a.contributions), "<div class=\"mini3\" style=\"margin-top:14px\"><div class=\"pbox\"><div class=\"l\">Sube y baja al a\u00F1o</div><div class=\"v\">").concat(Math.round(a.stats.vol * 100), "%</div></div><div class=\"pbox\"><div class=\"l\">Su peor ca\u00EDda (1 a\u00F1o)</div><div class=\"v bad\">").concat(pctp(a.stats.maxDrawdown, 0), "</div></div><div class=\"pbox\"><div class=\"l\">Contra su promedio de 50 d\u00EDas</div><div class=\"v\">").concat(a.stats.sma50 ? pctp(a.stats.last / a.stats.sma50 - 1) : '—', "</div></div></div></div>\n  </section>\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>\u00BFQu\u00E9 podr\u00EDa pasar en el futuro?</h2>").concat(takeaway(s6 ? "con US$10, en 6 meses lo m\u00E1s probable es <b>".concat(s6.probable >= 0 ? 'ganar' : 'perder', " ").concat(usd(Math.abs(10 * s6.probable)), "</b>; en un mal caso, ").concat(s6.bad >= 0 ? 'ganar' : 'perder', " ").concat(usd(Math.abs(10 * s6.bad)), ".") : '')).concat(rangeChart(a.scenarios, { label: 'Escenarios' }), "<div class=\"note\">Rojo: zona de p\u00E9rdida \u00B7 verde: zona de ganancia \u00B7 punto: lo m\u00E1s probable. ").concat(kindTag('estimacion'), " hecha con 3 a\u00F1os de movimientos reales; no es una promesa.</div></div>\n    <div class=\"card\"><h2>La empresa por dentro</h2>").concat(a.fundamentals.revenue.length >= 2 ? takeaway("sus ventas ".concat(a.fundamentals.revenue.at(-1).value >= a.fundamentals.revenue[0].value ? 'crecieron' : 'bajaron', " de ").concat(usd(a.fundamentals.revenue[0].value / 1e9, 0), " a ").concat(usd(a.fundamentals.revenue.at(-1).value / 1e9, 0), " mil millones.")) : '').concat(a.fundamentals.revenue.length ? barChart(__spreadArray(__spreadArray([], __read(a.fundamentals.revenue.map(function (r) { return ({ label: 'Ingresos ' + r.period, value: r.value / 1e9, color: '#38d6f5' }); })), false), __read(a.fundamentals.netIncome.map(function (r) { return ({ label: 'Ganancia ' + r.period, value: r.value / 1e9 }); })), false), { fmt: function (v) { return usd(v, 1) + ' mil M'; }, label: 'Ingresos y ganancias' }) + "<div class=\"note\">".concat(kindTag('dato'), " SEC EDGAR, informes 10-K.</div>") : '<div class="empty">Sin informes oficiales cargados todavía (los fondos no los presentan).</div>', "</div>\n  </section>\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>Qu\u00E9 opinan las IA ").concat(a.debate ? "<a class=\"more\" href=\"#debate/".concat(a.debate.id, "\">Ver debate completo \u25B8</a>") : '', "</h2>").concat(a.opinions.length ? a.opinions.map(function (o) { return "<div class=\"pbox\" style=\"margin-bottom:8px\"><div style=\"display:flex;gap:8px;align-items:center\"><b>".concat(esc(o.agent), "</b><span class=\"tag opinion\">").concat(esc(o.stance.replace('_', ' ')), "</span>").concat(o.probBeat != null ? "<span class=\"note\">".concat(Math.round(o.probBeat * 100), "% de ganarle al mercado</span>") : '', "<span class=\"note\" style=\"margin-left:auto\">").concat(esc(o.date || ''), " \u00B7 ").concat(o.correct == null ? 'resultado pendiente' : o.correct ? '✓ acertó' : '✕ falló', "</span></div><div style=\"margin-top:4px\">").concat(esc(o.argument), "</div></div>"); }).join('') : '<div class="empty">Todavía no hay debate sobre esta acción.</div>', "\n      ").concat(a.iaTrack.length ? "<div class=\"note\">Historial de aciertos de cada IA: ".concat(a.iaTrack.map(function (t) { return "".concat(esc(t.agent), " ").concat(t.hitRate, "% (").concat(t.n, " casos)"); }).join(' · '), "</div>") : '', "</div>\n    <div class=\"card\"><h2>Noticias</h2>").concat(a.news.length ? a.news.map(function (n) { return "<div style=\"padding:8px 0;border-top:1px solid #1e2a44\">".concat(n.polemic >= 2 ? "<span class=\"tag\" style=\"background:rgba(255,93,108,.12);color:#ff5d6c\">Pol\u00E9mica".concat(n.verified ? ' confirmada' : '', "</span> ") : '', "<a href=\"").concat(esc(n.url), "\" target=\"_blank\" rel=\"noopener\">").concat(esc(n.title), "</a><div class=\"note\">").concat(esc(n.summary || ''), " \u00B7 ").concat(esc(n.source), "</div></div>"); }).join('') : '<div class="empty">Sin noticias recientes.</div>', "</div>\n  </section>\n  <section class=\"grid split\">").concat(narrativeBox(a)).concat(realtimeBox(a), "</section>\n  <section class=\"card\"><h2>Fuentes y pruebas</h2>").concat(sourcesList(a.sources), "<div class=\"note\" style=\"margin-top:10px\">Este an\u00E1lisis qued\u00F3 sellado: no se puede cambiar despu\u00E9s de conocer el resultado.</div></section>")];
        }
    });
}); };
views.analisis.after = function () {
    var b = $('#explain');
    if (!b)
        return;
    b.onclick = function () { return __awaiter(void 0, void 0, void 0, function () {
        var r, e_14;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    b.disabled = true;
                    b.textContent = 'Pensando…';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, api("/api/analysis/".concat(b.dataset.id, "/explain"), { method: 'POST' })];
                case 2:
                    r = _a.sent();
                    $('#narr').innerHTML = r.text ? "<div class=\"answer\">".concat(esc(r.text), "<div class=\"note\" style=\"margin-top:6px\">Escrita por ").concat(esc((ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? r.by : 'la IA de JARVIS'), " \u00B7 <span class=\"tag opinion\">Opini\u00F3n de IA</span></div></div>") : "<div class=\"msg err\">".concat(esc(r.error), "</div>");
                    return [3, 4];
                case 3:
                    e_14 = _a.sent();
                    $('#narr').innerHTML = "<div class=\"msg err\">".concat(esc(e_14.message), "</div>");
                    return [3, 4];
                case 4: return [2];
            }
        });
    }); };
};
function lotteryAnalysisView(game) {
    return __awaiter(this, void 0, void 0, function () {
        var a, c;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, api('/api/analysis/lottery/' + encodeURIComponent(game))];
                case 1:
                    a = _a.sent();
                    if (a.empty)
                        return [2, "<div class=\"card empty\">".concat(esc(a.message), "</div>")];
                    c = a.conclusion;
                    return [2, "<div class=\"note\"><a href=\"#loterias\">Loter\u00EDas</a> \u203A ".concat(esc(a.name), " \u203A An\u00E1lisis profundo</div>\n  <section class=\"card ahead\">\n    <div class=\"balls\">").concat(a.pick.numbers.map(function (n) { return "<span class=\"ball\" style=\"width:84px;height:84px;font-size:30px\">".concat(esc(n), "</span>"); }).join(''), "</div>\n    <div><h1>").concat(esc(a.name), " <span class=\"muted\" style=\"font-size:16px\">").concat(esc(a.entity), " \u00B7 ").concat(a.draws, " sorteos analizados</span></h1><div class=\"sub\">N\u00FAmero del sorteo del ").concat(esc(a.pick.date), " \u00B7 m\u00E9todo: ").concat(esc(a.pick.methodLabel), "</div></div>\n    <div></div></section>\n  <section class=\"card summary10\" style=\"border-color:#ffbf3c\"><div class=\"s10-h\">Resumen en 10 segundos</div>\n    <div class=\"s10\">\n      <div class=\"tile\"><div class=\"q\">\u00BFQu\u00E9 hago?</div><div class=\"a warn\">Si juegas, solo por diversi\u00F3n</div><div class=\"note\">").concat(esc(c.headline.replace(/^[^:]+:\s*/, '')), "</div></div>\n      <div class=\"tile\"><div class=\"q\">Si apuestas RD$100 muchas veces\u2026</div><div class=\"mr-v bad\">vuelven ").concat(rdRaw(a.probs[0].per100), "</div><div class=\"note\">en promedio, a largo plazo (quiniela). La banca se queda con el resto.</div></div>\n      <div class=\"tile\"><div class=\"q\">\u00BFQu\u00E9 tan seguido sale el ").concat(esc(a.number.num), "?</div>").concat(chanceDots(a.probs[0].win, { what: 'sale en el sorteo', big: true }), "<div class=\"note\">Igual que cualquier otro n\u00FAmero, si el sorteo es justo</div></div>\n      <div class=\"tile\"><div class=\"q\">\u00BFCu\u00E1ndo s\u00E9 si gan\u00E9?</div><div class=\"a good\">El mismo d\u00EDa</div><div class=\"note\">Al salir los n\u00FAmeros. Si ganas, cobras con el ticket en la banca: gu\u00E1rdalo y pregunta el plazo.</div></div>\n    </div></section>\n  ").concat(a.size ? sizeCard(a.size, a.budget, a.light) : '', "\n  <section class=\"card\"><h2>Las preguntas, respondidas</h2>").concat(qaAccordion(c), "</section>\n  ").concat(timingCard(a), "\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>Cu\u00E1ntas veces sali\u00F3 cada n\u00FAmero</h2>").concat(takeaway("el ".concat(esc(a.number.num), " sali\u00F3 ").concat(a.number.count, " veces en ").concat(a.draws, " sorteos. Con tan pocos sorteos, que un n\u00FAmero salga m\u00E1s es casi siempre casualidad."))).concat(freqChart(a.freq, a.draws * 3 / 100, a.number.num), "<div class=\"note\">Naranja: el ").concat(esc(a.number.num), ", que sali\u00F3 ").concat(a.number.count, " veces (esperado ").concat(a.number.expected, "); lleva ").concat(a.number.gap, " sorteos sin salir. ").concat(kindTag('dato'), "</div></div>\n    <div class=\"card\"><h2>Probabilidades exactas</h2><div class=\"tablewrap\"><table><tr><th>Jugada</th><th class=\"r\">Chance</th><th class=\"r\">Devuelve de cada RD$100</th></tr>").concat(a.probs.map(function (p) { return "<tr><td>".concat(esc({ quiniela: 'Quiniela', pale: 'Palé', tripleta: 'Tripleta' }[p.kind]), "</td><td class=\"r\">").concat((p.win * 100).toFixed(p.win < 0.01 ? 3 : 2), "%</td><td class=\"r bad\">").concat(rdRaw(p.per100), "</td></tr>"); }).join(''), "</table></div><div class=\"note\">").concat(kindTag('dato'), " Calculado con todas las combinaciones posibles y los pagos de banca configurados.</div></div>\n  </section>\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>\u00BFAlg\u00FAn m\u00E9todo le gana al azar?</h2>").concat(takeaway(esc(a.compare.verdict))).concat(barChart(__spreadArray([{ label: 'Azar (mediana)', value: a.compare.random.median, color: '#8a97b5' }], __read(a.compare.methods.map(function (m) { return ({ label: m.label, value: m.per100, color: m.beatsRandom ? '#2fd58a' : '#ffbf3c' }); })), false), { fmt: function (v) { return rdRaw(v); }, label: 'Devuelve por RD$100' }), "<div class=\"note\">").concat(esc(a.compare.verdict), "</div></div>\n    <div class=\"card\"><h2>\u00BFHay se\u00F1ales de trampa?</h2>").concat(takeaway(esc(a.scan.verdict))).concat(a.scan.tests.map(function (t) { return "<div style=\"display:flex;gap:8px;padding:4px 0\">".concat(t.anomaly ? '<span class="light rojo"><i></i>Revisar</span>' : '<span class="light verde"><i></i>Normal</span>', "<span>").concat(esc(t.title), "</span><span class=\"note\" style=\"margin-left:auto\">").concat((Math.min(1, t.p) * 100).toFixed(1), "% por casualidad</span></div>"); }).join(''), "</div>\n  </section>\n  <section class=\"grid split\">").concat(narrativeBox(a)).concat(realtimeBox(a), "</section>\n  <section class=\"card\"><h2>Fuentes y pruebas</h2>").concat(sourcesList(a.sources), "</section>")];
            }
        });
    });
}
function shrinkReceipt(file) {
    return new Promise(function (ok, fail) {
        if (!/^image\//.test(file.type || 'image/'))
            return fail(new Error('Sube una foto o captura del comprobante.'));
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
            var draw = function (max, q) { var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
            var d = draw(1600, 0.82);
            if (d.length > 1.9e6)
                d = draw(1200, 0.72);
            if (d.length > 1.9e6)
                d = draw(900, 0.65);
            URL.revokeObjectURL(url);
            d.length > 1.9e6 ? fail(new Error('La foto es muy pesada; prueba con una captura de pantalla.')) : ok(d);
        };
        img.onerror = function () { return fail(new Error('No pude leer esa foto. Prueba con una captura de pantalla.')); };
        img.src = url;
    });
}
var STATUS_CHIP = { pendiente: ['⏳ Esperando revisión', 'warn'], aprobada: ['✅ Aprobada', 'good'], rechazada: ['✕ No aprobada', 'bad'] };
var monthName = function (iso) { return new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', timeZone: 'UTC' }); };
views.aprendizaje.after = function () {
    api('/api/coins/audit').then(function (rows) {
        var el = $('#caudit');
        if (!el)
            return;
        var AG = { largo: 'Agente de largo plazo', corto: 'Agente de corto plazo', polemicas: 'Cazador de noticias', loteria: 'Agente de loterías' };
        el.innerHTML = rows.length ? rows.slice(0, 10).map(function (c) { return "<div class=\"coin\"><div class=\"coin-h\"><b class=\"".concat(c.amount >= 0 ? 'good' : 'bad', "\">").concat(c.amount >= 0 ? '+' : '').concat(c.amount, " monedas</b> \u00B7 ").concat(esc(AG[c.agent] || c.agent || ''), " \u00B7 ").concat(esc(c.symbol || ''), " <span class=\"chip ").concat(c.clean ? 'good' : 'bad', "\">").concat(c.clean ? '✓ Limpia' : c.revoked ? '✕ Revocada: ' + esc(c.revokedReason || 'trampa') : '⚠ Revisar', "</span></div>\n      <div>").concat(esc(c.reason), "</div>\n      ").concat(c.buy ? "<div class=\"note\">Compr\u00F3 a US$".concat(c.buy.price.toFixed(2), " (precio de las ").concat(esc(new Date(c.buy.priceAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })), ", fuente: ").concat(esc(c.buy.sourceName), ") \u00B7 vendi\u00F3 a US$").concat(c.sell.price.toFixed(2), " (fuente: ").concat(esc(c.sell.sourceName), ")</div>") : '', "\n      ").concat(c.vote ? "<div class=\"note\">Voto sellado el ".concat(esc(new Date(c.vote.sealedAt).toLocaleString('es-DO')), " (sello ").concat(esc(c.vote.hash), "\u2026) \u00B7 precio el ").concat(esc(c.vote.start), ": US$").concat(Number(c.vote.startClose).toFixed(2), " \u2192 el ").concat(esc(c.vote.end || ''), ": US$").concat(Number(c.vote.endClose || 0).toFixed(2), " \u00B7 fuente: ").concat(esc(c.vote.source), "</div>") : '', "\n      ").concat(c.decisionAt ? "<div class=\"note\">Decisi\u00F3n sellada el ".concat(esc(new Date(c.decisionAt).toLocaleString('es-DO')), " \u00B7 sello ").concat(esc(c.decisionHash), "\u2026</div>") : '', "\n      <div class=\"coin-ck\">").concat(c.checks.map(function (_a) {
            var _b = __read(_a, 2), t = _b[0], ok = _b[1];
            return "<span class=\"".concat(ok ? 'good' : 'bad', "\">").concat(ok ? '✓' : '✕', " ").concat(esc(t), "</span>");
        }).join(''), "</div></div>"); }).join('') : 'Todavía ningún agente ha ganado monedas: primero una idea tiene que pasar el examen y luego ganar dinero en la prueba en vivo.';
    }).catch(function (e) { var el = $('#caudit'); if (el)
        el.textContent = e.message; });
};
views.potenciador = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, d, L, m, pctUsed, reqRow, userPart, adminPart;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4, Promise.all([api('/api/potenciador'), api('/api/legal')])];
            case 1:
                _a = __read.apply(void 0, [_c.sent(), 2]), d = _a[0], L = _a[1], m = d.me;
                window.__potRate = (_b = d.admin) === null || _b === void 0 ? void 0 : _b.rate;
                window.__legal = L;
                pctUsed = m.base ? Math.round(m.baseUsed / m.base * 100) : 0;
                reqRow = function (r, admin) { return "<div class=\"preq ".concat(r.status, "\"><div class=\"preq-h\"><b>").concat(esc(admin ? r.who : r.pack_name), "</b><span class=\"chip ").concat(STATUS_CHIP[r.status][1], "\">").concat(STATUS_CHIP[r.status][0], "</span></div>\n    <div class=\"note\">").concat(admin ? "".concat(esc(r.pack_name), " \u00B7 ") : '').concat(esc(r.price), " \u2192 <b>").concat(r.credits, " cr\u00E9ditos</b> \u00B7 ").concat(esc(new Date(r.created_at).toLocaleString('es-DO'))).concat(r.reference ? " \u00B7 Ref: ".concat(esc(r.reference)) : '', "</div>\n    ").concat(r.payer_name ? "<div class=\"note\">Pag\u00F3: <b>".concat(esc(r.payer_name), "</b>").concat(r.payer_bank ? " desde ".concat(esc(r.payer_bank)) : '').concat(r.kind === 'mensual' ? ' · <b>plan mensual</b>' : '', "</div>") : '', "\n    ").concat(r.amount != null ? "<div>Dice que envi\u00F3: <b class=\"mono\">".concat(esc(r.currency || 'RD$')).concat(Number(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }), "</b>").concat((function () { var _a; var n = Number((_a = String(r.price).replace(/,/g, '').match(/[0-9]+(\.[0-9]+)?/)) === null || _a === void 0 ? void 0 : _a[0]); return Number.isFinite(n) && Math.abs(n - r.amount) > 0.009 ? " <span class=\"chip warn\">\u26A0\uFE0F no coincide con el precio (".concat(esc(r.price), ")</span>") : ' <span class="chip good">coincide con el precio</span>'; })(), "</div>") : '', "\n    ").concat(admin && r.status === 'pendiente' ? "<div class=\"note\">Esperando hace ".concat(timeAgo(r.created_at).replace('hace ', ''), ". Busca en tu banco un dep\u00F3sito de <b>esa cantidad exacta</b> a nombre de <b>").concat(esc(r.payer_name || r.who), "</b> antes de aprobar.</div>") : '', "\n    ").concat(r.note ? "<div class=\"note\">\u201C".concat(esc(r.note), "\u201D</div>") : '').concat(r.admin_note ? "<div class=\"note\">Respuesta: ".concat(esc(r.admin_note), "</div>") : '', "\n    <a href=\"/api/potenciador/").concat(r.id, "/foto\" target=\"_blank\" rel=\"noopener\"><img class=\"preq-img\" src=\"/api/potenciador/").concat(r.id, "/foto\" alt=\"Comprobante\" loading=\"lazy\"></a>\n    ").concat(admin && r.status === 'pendiente' ? "<div class=\"row\" style=\"gap:8px;margin-top:8px;align-items:center\"><input class=\"pnote\" data-id=\"".concat(r.id, "\" placeholder=\"Nota (opcional)\" style=\"flex:1;min-width:140px\"><button class=\"btn sm\" data-ok=\"").concat(r.id, "\">Aprobar</button><button class=\"btn ghost sm\" data-no=\"").concat(r.id, "\">Rechazar</button></div>") : '', "</div>"); };
                userPart = "\n  <section class=\"card\"><h2>Tu IA este mes</h2>\n    <div class=\"pbase\"><div class=\"row\" style=\"justify-content:space-between\"><span>IA gratis del mes</span><b>".concat(m.baseLeft, " de ").concat(m.base, " cr\u00E9ditos</b></div><div class=\"bar\" style=\"margin-top:6px\"><span style=\"width:").concat(100 - pctUsed, "%;background:#38d6f5\"></span></div><div class=\"note\">Se renueva sola el ").concat(esc(monthName(m.resetsAt)), ".</div></div>\n    <div class=\"pbox\" style=\"margin-top:10px\"><div class=\"l\">\u26A1 Cr\u00E9ditos extra (Potenciador)</div><div class=\"v\">").concat(m.extra, "</div><div class=\"note\">No vencen. Se usan solo cuando se acaba la IA gratis del mes.</div></div>\n    ").concat(m.plan ? "<div class=\"pbox\" style=\"margin-top:10px\"><div class=\"l\">\uD83D\uDCC5 ".concat(esc(m.plan.name || 'Plan mensual'), "</div><div class=\"v ").concat(m.plan.active ? (m.plan.daysLeft <= 3 ? 'warn' : 'good') : 'bad', "\">").concat(m.plan.active ? "".concat(m.plan.daysLeft, " ").concat(m.plan.daysLeft === 1 ? 'día' : 'días') : 'Vencido', "</div><div class=\"note\">").concat(m.plan.active ? "Vence el ".concat(esc(new Date(m.plan.until).toLocaleDateString('es-DO', { day: 'numeric', month: 'long' })), ". Te aviso 3 d\u00EDas antes para que lo renueves.") : 'Renuévalo abajo para recibir los créditos del próximo mes. Lo que te sobró sigue ahí.', "</div></div>") : '', "\n    <div class=\"note\" style=\"margin-top:10px\">La IA responde tus preguntas y hace los an\u00E1lisis con IA. <b>Si se te acaba, JARVIS sigue funcionando igual</b> (mapa, recomendaciones, historial, avisos): solo las respuestas de la IA esperan al mes siguiente o a un Potenciador.</div></section>\n  ").concat(!L.contrato.signed ? "<section class=\"card\" id=\"contractcard\"><h2>\uD83D\uDCDD Primero: contrato de compra</h2><p class=\"note\">Antes de pagar, lee y firma este contrato. Te protege a ti y al administrador: dice qu\u00E9 compras, c\u00F3mo se paga, los plazos y las devoluciones. Se firma una sola vez (o cuando cambie).</p>".concat(signForm('contrato', L.contrato, 'ct'), "</section>") : "<div class=\"note\" style=\"margin:-4px 0 4px\">\uD83D\uDCDD Contrato de compra firmado el ".concat(esc(new Date(L.contrato.signed.accepted_at).toLocaleDateString('es-DO')), " (versi\u00F3n ").concat(esc(L.contrato.signed.version), "). <a href=\"#\" id=\"seect\">Ver contrato</a></div>"), "\n  <section class=\"card").concat(!L.contrato.signed ? ' locked' : '', "\"><h2>\u26A1 Activar un Potenciador</h2>").concat(!L.contrato.signed ? '<div class="msg err" style="margin:6px 0">Firma el contrato de arriba para poder pagar.</div>' : '', "\n    <form class=\"form\" id=\"pf2\">\n      <div><b>1. Elige un paquete</b><div class=\"packs\" style=\"margin-top:8px\">").concat(d.packs.map(function (p, i) { return "<label class=\"pack\"><input type=\"radio\" name=\"pack\" value=\"".concat(esc(p.id), "\"").concat(i === 0 ? ' checked' : '', "><span><b>").concat(esc(p.name), "</b><span class=\"pk-price\">").concat(esc(p.price), "</span><span class=\"note\">").concat(p.credits, " cr\u00E9ditos extra").concat(p.kind === 'mensual' ? " \u00B7 <b>se renueva cada ".concat(30, " d\u00EDas</b>") : ' · pago de una vez', "</span></span></label>"); }).join(''), "</div></div>\n      <div><b>2. Deposita o transfiere a una de estas cuentas</b>").concat(d.accounts.length ? d.accounts.map(function (a) { return "<div class=\"bankacc\"><div class=\"ba-h\"><b>".concat(esc(a.bank), "</b><span class=\"note\">Cuenta de ").concat(esc(a.type.toLowerCase()), "</span></div>\n          <div class=\"ba-r\"><span class=\"note\">N\u00FAmero</span><b class=\"mono\">").concat(esc(a.number), "</b><button type=\"button\" class=\"btn ghost sm\" data-copy=\"").concat(esc(a.number.replace(/\D/g, '')), "\">Copiar</button></div>\n          <div class=\"ba-r\"><span class=\"note\">A nombre de</span><b>").concat(esc(a.holder), "</b></div>\n          ").concat(a.cedula ? "<div class=\"ba-r\"><span class=\"note\">C\u00E9dula / RNC</span><b class=\"mono\">".concat(esc(a.cedula), "</b><button type=\"button\" class=\"btn ghost sm\" data-copy=\"").concat(esc(a.cedula.replace(/\D/g, '')), "\">Copiar</button></div>") : '', "\n          ").concat(a.note ? "<div class=\"note\">".concat(esc(a.note), "</div>") : '', "</div>"); }).join('') : '', "\n        ").concat(d.payInfo ? "<div class=\"payinfo\">".concat(esc(d.payInfo).replace(/\n/g, '<br>'), "</div>") : !d.accounts.length ? '<div class="payinfo">El administrador todavía no puso sus cuentas. Pregúntale directamente.</div>' : '', "</div>\n      <div><b>3. Dinos qui\u00E9n pag\u00F3</b><div class=\"grid g2\" style=\"gap:10px;margin-top:6px\"><label>A nombre de qui\u00E9n sali\u00F3 el pago<input id=\"ppn\" maxlength=\"60\" required placeholder=\"Ej.: Ricardo P\u00E9rez\"></label>\n        <label>Desde qu\u00E9 banco pagaste<select id=\"ppb\"><option value=\"\">Elige\u2026</option>").concat(d.banks.map(function (b) { return "<option>".concat(esc(b), "</option>"); }).join(''), "</select></label></div>\n        <div class=\"row\" style=\"gap:10px;margin-top:10px;align-items:flex-end\"><label style=\"width:110px\">Moneda<select id=\"ppc\"><option>RD$</option><option>US$</option></select></label><label style=\"flex:1;min-width:160px\">Cantidad exacta que enviaste (como sale en el comprobante)<input id=\"ppa\" inputmode=\"decimal\" required placeholder=\"Ej.: 300.00\"></label></div></div>\n      <div><b>4. Sube la foto del comprobante (voucher o captura)</b><br><label class=\"btn ghost\" style=\"cursor:pointer;margin-top:8px;display:inline-flex\">\uD83D\uDCF7 Elegir foto o captura<input id=\"prc\" type=\"file\" accept=\"image/*\" hidden></label><div id=\"prcv\" class=\"note\" style=\"margin-top:6px\"></div></div>\n      <label>N\u00FAmero de referencia (opcional)<input id=\"pref\" maxlength=\"60\" placeholder=\"Ej.: 123456789\"></label>\n      <label>Nota para el administrador (opcional)<input id=\"pnt\" maxlength=\"300\"></label>\n      <button class=\"btn\">Enviar solicitud</button><div class=\"msg\" id=\"pmsg\"></div>\n      <div class=\"note\">\u23F3 <b>La aprobaci\u00F3n toma de 24 a 48 horas</b>: el administrador confirma en su banco que el dinero lleg\u00F3 de verdad. Te llega un aviso aqu\u00ED cuando responda.</div>\n    </form></section>\n  <section class=\"card\"><h2>Mis solicitudes</h2>").concat(d.mine.length ? d.mine.map(function (r) { return reqRow(r, false); }).join('') : '<div class="empty">Todavía no has pedido ningún Potenciador.</div>', "</section>");
                adminPart = d.isAdmin ? "\n  <section class=\"card\"><h2>Solicitudes de tus usuarios ".concat(d.admin.requests.filter(function (r) { return r.status === 'pendiente'; }).length ? "<span class=\"chip warn\">".concat(d.admin.requests.filter(function (r) { return r.status === 'pendiente'; }).length, " por revisar</span>") : '', "</h2>\n    <div class=\"note\">Tienes de 24 a 48 horas para responder (a tus usuarios se les dice eso). Antes de aprobar, confirma en tu banco que lleg\u00F3 <b>la cantidad exacta</b>. Si pasan 24 horas sin responder, JARVIS te lo recuerda.</div>\n    ").concat(d.admin.requests.length ? d.admin.requests.map(function (r) { return reqRow(r, true); }).join('') : '<div class="empty">No hay solicitudes todavía.</div>', "<div class=\"msg\" id=\"amsg\"></div></section>\n  <section class=\"card\"><h2>\uD83D\uDCDD Contratos y t\u00E9rminos firmados</h2><div class=\"note\">Cada firma guarda nombre, c\u00E9dula, fecha, IP, navegador y el texto exacto que acept\u00F3. No se puede borrar ni cambiar (ni siquiera t\u00FA). Las solicitudes de pago y sus comprobantes tampoco se borran.</div><div id=\"firmas\" class=\"note\" style=\"margin-top:8px\">Cargando\u2026</div><a class=\"btn ghost sm\" href=\"/api/export/firmas\" style=\"margin-top:8px;display:inline-block\">Descargar todas (Excel/CSV)</a></section>\n  <section class=\"card\"><h2>Cr\u00E9ditos de cada usuario</h2>").concat(d.admin.users.length ? "<div class=\"tablewrap\"><table><tr><th>Persona</th><th class=\"r\">Gratis del mes</th><th class=\"r\">Extra</th><th class=\"r\">Regalar</th></tr>".concat(d.admin.users.map(function (u) { return "<tr><td>".concat(esc(u.name)).concat(u.pending ? ' <span class="chip warn">pidió</span>' : '', "</td><td class=\"r\">").concat(u.baseLeft, "/").concat(u.base, "</td><td class=\"r\"><b>").concat(u.extra, "</b></td><td class=\"r\"><span class=\"row\" style=\"gap:6px;justify-content:flex-end\"><input type=\"number\" class=\"gift\" data-u=\"").concat(u.id, "\" placeholder=\"50\" style=\"width:80px\"><button class=\"btn ghost sm\" data-gift=\"").concat(u.id, "\">Dar</button></span></td></tr>"); }).join(''), "</table></div>") : '<div class="empty">Todavía no has creado usuarios.</div>', "\n    <div class=\"note\">La IA gratis de cada mes es la que pusiste al crear el usuario (\"IA gratis al mes\") (1 cr\u00E9dito = 1 centavo de d\u00F3lar de IA).</div></section>\n  <section class=\"card\"><h2>Tus cuentas, paquetes y forma de pago</h2><form class=\"form\" id=\"pset\">\n    <h3>Tus cuentas de banco (las ven tus usuarios para pagarte)</h3>\n    ").concat([0, 1, 2].map(function (i) {
                    var a = d.accounts[i] || {};
                    return "<div class=\"accrow\"><div class=\"grid g3\" style=\"gap:8px\"><label>Banco<select data-ac=\"".concat(i, "\" data-f=\"bank\"><option value=\"\">\u2014 ninguna \u2014</option>").concat(d.banks.map(function (b) { return "<option".concat(a.bank === b ? ' selected' : '', ">").concat(esc(b), "</option>"); }).join(''), "</select></label><label>Tipo<select data-ac=\"").concat(i, "\" data-f=\"type\"><option").concat(a.type !== 'Corriente' ? ' selected' : '', ">Ahorros</option><option").concat(a.type === 'Corriente' ? ' selected' : '', ">Corriente</option></select></label><label>N\u00FAmero de cuenta<input data-ac=\"").concat(i, "\" data-f=\"number\" value=\"").concat(esc(a.number || ''), "\" inputmode=\"numeric\" maxlength=\"30\"></label></div>\n      <div class=\"grid g3\" style=\"gap:8px;margin-top:6px\"><label>A nombre de<input data-ac=\"").concat(i, "\" data-f=\"holder\" value=\"").concat(esc(a.holder || ''), "\" maxlength=\"60\"></label><label>C\u00E9dula o RNC<input data-ac=\"").concat(i, "\" data-f=\"cedula\" value=\"").concat(esc(a.cedula || ''), "\" inputmode=\"numeric\" maxlength=\"20\"></label><label>Nota (opcional)<input data-ac=\"").concat(i, "\" data-f=\"note\" value=\"").concat(esc(a.note || ''), "\" maxlength=\"80\" placeholder=\"Ej.: tambi\u00E9n acepto dep\u00F3sito\"></label></div></div>");
                }).join(''), "\n    <div class=\"note\">Solo lo ven tus usuarios cuando van a pagar. Deja el banco en \"ninguna\" para quitar una cuenta.</div>\n    <h3 style=\"margin-top:12px\">Paquetes</h3>\n    <div class=\"econ\"><div class=\"row\" style=\"gap:10px;align-items:flex-end;flex-wrap:wrap\"><label style=\"width:170px\">Tu ganancia (multiplica el costo)<select id=\"pmar\">").concat([1.5, 2, 2.5, 3].map(function (m) { return "<option value=\"".concat(m, "\"").concat(Number(d.admin.margin) === m ? ' selected' : '', ">\u00D7").concat(m).concat(m === 2 ? ' (el doble)' : '', "</option>"); }).join(''), "</select></label><button type=\"button\" class=\"btn ghost\" id=\"pauto\">Calcular precios con mi ganancia</button></div>\n      <div class=\"note\" style=\"margin-top:6px\">1 cr\u00E9dito = US$0.01 de lo que te cobra la IA a ti. Con \u00D72, si 500 cr\u00E9ditos te cuestan US$5, tu usuario te paga US$10 (unos RD$").concat(Math.ceil(10 * d.admin.rate / 5) * 5, "). D\u00F3lar a RD$").concat(Number(d.admin.rate).toFixed(2), " (").concat(esc(d.admin.rateSource), ").</div></div>\n    ").concat([0, 1, 2].map(function (i) { var p = d.packs[i] || {}; return "<div class=\"grid g4\" style=\"gap:8px\"><label>Nombre<input data-pk=\"".concat(i, "\" data-f=\"name\" value=\"").concat(esc(p.name || ''), "\" maxlength=\"40\"></label><label>Precio<input data-pk=\"").concat(i, "\" data-f=\"price\" value=\"").concat(esc(p.price || ''), "\" maxlength=\"24\" placeholder=\"RD$300\"></label><label>Cr\u00E9ditos<input data-pk=\"").concat(i, "\" data-f=\"credits\" type=\"number\" value=\"").concat(p.credits || '', "\"></label><label>Tipo<select data-pk=\"").concat(i, "\" data-f=\"kind\"><option value=\"una_vez\"").concat(p.kind !== 'mensual' ? ' selected' : '', ">De una vez</option><option value=\"mensual\"").concat(p.kind === 'mensual' ? ' selected' : '', ">Plan mensual (se renueva)</option></select></label></div>").concat(d.admin.economics[i] ? "<div class=\"note econline\">Te cuesta como m\u00E1ximo <b>US$".concat(d.admin.economics[i].costUsd.toFixed(2), "</b> en IA \u00B7 con \u00D7").concat(d.admin.margin, " cobras <b>RD$").concat(d.admin.economics[i].chargeRd, "</b> \u00B7 ganas unos <b class=\"good\">US$").concat(d.admin.economics[i].profitUsd.toFixed(2), "</b></div>") : ''); }).join(''), "\n    <label>Otras instrucciones de pago (opcional)<textarea id=\"ppay\" rows=\"3\" maxlength=\"600\" placeholder=\"Ej.: Si depositas en efectivo, manda foto del recibo.\">").concat(esc(d.payInfo), "</textarea></label>\n    <button class=\"btn\">Guardar</button><div class=\"msg\" id=\"psm\"></div></form></section>") : '';
                return [2, "<div><h1>\u26A1 Potenciador de IA</h1><p class=\"sub\">".concat(d.isAdmin ? 'Aquí apruebas los pagos de tus usuarios y decides los paquetes.' : 'Más respuestas de la IA cuando las necesites.', "</p></div>").concat(d.isAdmin ? adminPart : userPart)];
        }
    });
}); };
views.potenciador.after = function () {
    if ($('#ctb'))
        bindSign('contrato', 'ct', function () { return render(); });
    if ($('#seect'))
        $('#seect').onclick = function (e) { e.preventDefault(); var L = window.__legal; var box = document.createElement('section'); box.className = 'card'; box.innerHTML = "<h2>Contrato que firmaste</h2><div class=\"legaldoc\"><pre class=\"legaltext\">".concat(esc(L.contrato.text), "</pre></div>"); $('#seect').closest('div').after(box); $('#seect').remove(); };
    if ($('#firmas'))
        api('/api/legal/firmas').then(function (rows) { $('#firmas').innerHTML = rows.length ? "<div class=\"tablewrap\"><table><tr><th>Fecha</th><th>Persona</th><th>Documento</th><th>C\u00E9dula</th><th>IP</th></tr>".concat(rows.map(function (a) { return "<tr><td>".concat(esc(new Date(a.accepted_at).toLocaleString('es-DO')), "</td><td><b>").concat(esc(a.full_name), "</b><div class=\"note\">").concat(esc(a.username), "</div></td><td>").concat(a.doc === 'contrato' ? 'Contrato de compra' : 'Términos de uso', " <span class=\"note\">v").concat(esc(a.version), "</span></td><td class=\"mono\">").concat(esc(a.id_number), "</td><td class=\"note\">").concat(esc(a.ip || ''), "</td></tr>"); }).join(''), "</table></div>") : 'Todavía nadie ha firmado.'; }).catch(function (e) { $('#firmas').textContent = e.message; });
    document.querySelectorAll('[data-copy]').forEach(function (b) { return b.onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var t, _a, i; return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                t = b.dataset.copy;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4, navigator.clipboard.writeText(t)];
            case 2:
                _b.sent();
                return [3, 4];
            case 3:
                _a = _b.sent();
                i = document.createElement('input');
                i.value = t;
                document.body.appendChild(i);
                i.select();
                try {
                    document.execCommand('copy');
                }
                catch (_c) { }
                i.remove();
                return [3, 4];
            case 4:
                b.textContent = '¡Copiado!';
                setTimeout(function () { b.textContent = 'Copiar'; }, 1500);
                return [2];
        }
    }); }); }; });
    var receipt = null;
    if ($('#prc'))
        $('#prc').onchange = function (e) { return __awaiter(void 0, void 0, void 0, function () { var f, err_25; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    f = e.target.files[0];
                    if (!f)
                        return [2];
                    $('#prcv').textContent = 'Preparando la foto…';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, shrinkReceipt(f)];
                case 2:
                    receipt = _a.sent();
                    $('#prcv').innerHTML = "<img src=\"".concat(receipt, "\" class=\"preq-img\" alt=\"Vista previa\"><div>\u2705 Foto lista</div>");
                    return [3, 4];
                case 3:
                    err_25 = _a.sent();
                    receipt = null;
                    $('#prcv').textContent = err_25.message;
                    return [3, 4];
                case 4: return [2];
            }
        }); }); };
    if ($('#pf2'))
        $('#pf2').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
            var err_26;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        e.preventDefault();
                        if (!receipt) {
                            $('#pmsg').className = 'msg err';
                            $('#pmsg').textContent = 'Falta la foto del comprobante.';
                            return [2];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4, api('/api/potenciador', { method: 'POST', body: { packId: (_a = document.querySelector('input[name=pack]:checked')) === null || _a === void 0 ? void 0 : _a.value, receipt: receipt, reference: $('#pref').value, note: $('#pnt').value, payerName: $('#ppn').value, payerBank: $('#ppb').value, amount: $('#ppa').value, currency: $('#ppc').value } })];
                    case 2:
                        _b.sent();
                        $('#pmsg').className = 'msg ok';
                        $('#pmsg').textContent = '¡Enviado! El administrador confirma que el dinero llegó a su banco y te responde en 24 a 48 horas. Te llega un aviso aquí.';
                        setTimeout(render, 1400);
                        return [3, 4];
                    case 3:
                        err_26 = _b.sent();
                        $('#pmsg').className = 'msg err';
                        $('#pmsg').textContent = err_26.message;
                        return [3, 4];
                    case 4: return [2];
                }
            });
        }); };
    var decide = function (id, approve) { return __awaiter(void 0, void 0, void 0, function () { var err_27; var _a; return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                return [4, api("/api/potenciador/".concat(id, "/decidir"), { method: 'POST', body: { approve: approve, note: ((_a = document.querySelector(".pnote[data-id=\"".concat(id, "\"]"))) === null || _a === void 0 ? void 0 : _a.value) || '' } })];
            case 1:
                _b.sent();
                render();
                return [3, 3];
            case 2:
                err_27 = _b.sent();
                $('#amsg').className = 'msg err';
                $('#amsg').textContent = err_27.message;
                return [3, 3];
            case 3: return [2];
        }
    }); }); };
    document.querySelectorAll('[data-ok]').forEach(function (b) { return b.onclick = function () { return decide(b.dataset.ok, true); }; });
    document.querySelectorAll('[data-no]').forEach(function (b) { return b.onclick = function () { return decide(b.dataset.no, false); }; });
    document.querySelectorAll('[data-gift]').forEach(function (b) { return b.onclick = function () { return __awaiter(void 0, void 0, void 0, function () { var n, err_28; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                n = Number(document.querySelector(".gift[data-u=\"".concat(b.dataset.gift, "\"]")).value);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4, api('/api/potenciador/regalar', { method: 'POST', body: { userId: Number(b.dataset.gift), credits: n } })];
            case 2:
                _a.sent();
                render();
                return [3, 4];
            case 3:
                err_28 = _a.sent();
                alertMsg(err_28.message);
                return [3, 4];
            case 4: return [2];
        }
    }); }); }; });
    if ($('#pauto'))
        $('#pauto').onclick = function () {
            var m = Number($('#pmar').value), rate = window.__potRate || 62;
            [0, 1, 2].forEach(function (i) {
                var c = Number(document.querySelector("[data-pk=\"".concat(i, "\"][data-f=credits]")).value);
                if (!c)
                    return;
                var rd = Math.ceil(c * 0.01 * m * rate / 5) * 5, kind = document.querySelector("[data-pk=\"".concat(i, "\"][data-f=kind]")).value;
                document.querySelector("[data-pk=\"".concat(i, "\"][data-f=price]")).value = "RD$".concat(rd).concat(kind === 'mensual' ? ' al mes' : '');
            });
            $('#psm').className = 'msg ok';
            $('#psm').textContent = 'Precios calculados. Revisa y toca Guardar.';
        };
    if ($('#pset'))
        $('#pset').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () {
            var f, packs, accounts, err_29;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        e.preventDefault();
                        f = function (sel, i, k) { return document.querySelector("[".concat(sel, "=\"").concat(i, "\"][data-f=").concat(k, "]")).value; };
                        packs = [0, 1, 2].map(function (i) { return ({ name: f('data-pk', i, 'name'), price: f('data-pk', i, 'price'), credits: Number(f('data-pk', i, 'credits')), kind: f('data-pk', i, 'kind') }); }).filter(function (p) { return p.name || p.price || p.credits; });
                        accounts = [0, 1, 2].map(function (i) { return ({ bank: f('data-ac', i, 'bank'), type: f('data-ac', i, 'type'), number: f('data-ac', i, 'number'), holder: f('data-ac', i, 'holder'), cedula: f('data-ac', i, 'cedula'), note: f('data-ac', i, 'note') }); }).filter(function (a) { return a.bank; });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4, api('/api/potenciador/ajustes', { method: 'POST', body: { packs: packs, accounts: accounts, payInfo: $('#ppay').value, margin: Number($('#pmar').value) } })];
                    case 2:
                        _a.sent();
                        $('#psm').className = 'msg ok';
                        $('#psm').textContent = 'Guardado.';
                        return [3, 4];
                    case 3:
                        err_29 = _a.sent();
                        $('#psm').className = 'msg err';
                        $('#psm').textContent = err_29.message;
                        return [3, 4];
                    case 4: return [2];
                }
            });
        }); };
};
function alertMsg(t) { var m = $('#amsg'); if (m) {
    m.className = 'msg err';
    m.textContent = t;
} }
views.historial = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, perf, hist, real;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4, Promise.all([api('/api/performance'), api('/api/history'), api('/api/real')])];
            case 1:
                _a = __read.apply(void 0, [_b.sent(), 3]), perf = _a[0], hist = _a[1], real = _a[2];
                window.__H = { perf: perf, hist: hist, real: real };
                return [2, "<div><h1>Historial: \u00BFcu\u00E1nto acierta de verdad?</h1><p class=\"sub\">Todo lo que JARVIS y cada IA recomendaron, guardado antes de saber el resultado. Aciertos y fallos, sin esconder nada.</p>\n  <div class=\"seal ".concat(perf.ledger.ok ? 'ok' : 'bad', "\">").concat(perf.ledger.ok ? "\uD83D\uDD12 Registro intacto: ".concat(perf.ledger.checked, " entradas revisadas, nada se borr\u00F3 ni se cambi\u00F3.") : '⚠️ El registro sellado fue alterado: revisar.', "</div></div>\n  <div class=\"row\" id=\"htabs\"><button class=\"btn\" data-t=\"bolsa\">Bolsa (virtual)</button><button class=\"btn ghost\" data-t=\"loterias\">Loter\u00EDas (virtual)</button><button class=\"btn ghost\" data-t=\"ia\">Comparar IA</button><button class=\"btn ghost\" data-t=\"real\">Dinero real (registrado por ti)</button></div>\n  <div id=\"hview\"></div>")];
        }
    });
}); };
function perfBlock(s, cur) {
    var money = function (v) { return (cur === 'RD$' ? rd(v) : usd(v)); };
    var coin = s.range && s.range[0] <= 50 && s.range[1] >= 50;
    var verdict = !s.resolved ? 'Todavía no hay resultados para juzgar.' : coin ? 'Por ahora acierta casi igual que lanzar una moneda: hace falta más tiempo para saber si de verdad sirve.' : s.hitRate > 50 ? 'Acierta más de lo que daría la suerte, y no es casualidad con estos datos.' : 'Acierta menos que la suerte: no conviene seguirlo todavía.';
    return "<section class=\"card hsum\" style=\"border-color:var(--".concat(!s.resolved || coin ? 'warn' : s.hitRate > 50 ? 'good' : 'bad', ")\">\n    <div class=\"hs-big\">").concat(s.resolved ? "De <b>".concat(s.resolved, "</b> recomendaciones ya revisadas, acert\u00F3 <b class=\"good\">").concat(s.hits, "</b> (").concat(Math.round(s.hitRate), "%).") : 'Aún no hay recomendaciones revisadas.', "</div>\n    ").concat(s.resolved ? "<div class=\"hs-sub\">Si le hubieras hecho caso con los montos que dijo, hoy ir\u00EDas <b class=\"".concat(cls(s.net), "\">").concat(s.net >= 0 ? 'ganando' : 'perdiendo', " ").concat(money(Math.abs(s.net)), "</b> (dinero virtual).</div>") : '', "\n    <div class=\"hs-v\">").concat(verdict, "</div></section>\n  <section class=\"grid g4\">\n    <div class=\"card kpi\" style=\"--c:#2fd58a\"><div class=\"l\">Acertadas</div><div class=\"v good\">").concat(s.hits, "</div><div class=\"s\">").concat(s.hitRate != null ? s.hitRate + '% de acierto' : 'sin calificar aún').concat(s.range ? " (rango ".concat(s.range[0], "\u2013").concat(s.range[1], "%)") : '', "</div></div>\n    <div class=\"card kpi\" style=\"--c:#ff5d6c\"><div class=\"l\">Fallidas</div><div class=\"v bad\">").concat(s.misses, "</div><div class=\"s\">racha r\u00E9cord de fallos: ").concat(s.streak.bestMisses, "</div></div>\n    <div class=\"card kpi\" style=\"--c:#ffbf3c\"><div class=\"l\">Pendientes</div><div class=\"v\">").concat(s.pending, "</div><div class=\"s\">").concat(s.total, " registradas en total</div></div>\n    <div class=\"card kpi\"><div class=\"l\">Si le hubieras hecho caso</div><div class=\"v ").concat(cls(s.net), "\">").concat(money(s.net), "</div><div class=\"s\">apostado ").concat(money(s.staked), " \u00B7 ganado ").concat(money(s.won), " \u00B7 perdido ").concat(money(s.lost), "</div></div>\n  </section>\n  <section class=\"grid split\">\n    <div class=\"card\"><h2>Evoluci\u00F3n del dinero</h2>").concat(s.curve.length > 1 ? lineChart(s.curve, { h: 200, label: 'Dinero acumulado' }) : '<div class="empty">Aparece cuando haya al menos 2 recomendaciones calificadas.</div>', "</div>\n    <div class=\"card\"><h2>Ganancias y p\u00E9rdidas por mes</h2>").concat(s.months.length ? barChart(s.months.map(function (m) { return ({ label: m.month, value: m.net }); }), { fmt: function (v) { return (cur === 'RD$' ? usd(v / FX) : usd(v)); }, label: 'Por mes' }) : '<div class="empty">Sin meses calificados todavía.</div>', "\n      <div class=\"note\">").concat(s.best ? "Mejor mes: ".concat(esc(s.best.month), " (").concat(money(s.best.net), "). Peor mes: ").concat(esc(s.worst.month), " (").concat(money(s.worst.net), ").") : '', "</div>\n      ").concat(s.brier != null ? "<details class=\"note\" style=\"margin-top:6px\"><summary>Para expertos</summary>Calibraci\u00F3n (Brier): ".concat(s.brier, ". M\u00E1s bajo es mejor; 0.25 es lo mismo que adivinar.</details>") : '', "</div>\n  </section>");
}
function recordsTable(rows) {
    if (!rows.length)
        return '<div class="empty">Todavía no hay registros. Aparecen cuando el motor genere el ranking o sorteos.</div>';
    var st = { acerto: '<span class="good">✓ Acertó</span>', fallo: '<span class="bad">✕ Falló</span>', pendiente: '<span class="note">Pendiente</span>' };
    return "<div class=\"tablewrap\"><table><tr><th>D\u00EDa</th><th>Qui\u00E9n</th><th>Opci\u00F3n</th><th>Qu\u00E9 dijo</th><th class=\"r\">Prob.</th><th class=\"r\">Monto</th><th class=\"r\">Posible ganancia</th><th>Resultado</th></tr>\n  ".concat(rows.map(function (r) {
        var _a, _b;
        return "<tr><td class=\"note\">".concat(esc(r.dataDate), "</td><td>").concat(esc(r.agentLabel), "</td><td class=\"sym\">").concat(esc(r.subject), "</td><td style=\"min-width:220px\">").concat(r.light ? light(r.light) + ' ' : '').concat(esc(r.claim), "\n    <details><summary>Detalle \u25B8</summary>").concat(r.why ? "<div class=\"note\"><b>Por qu\u00E9:</b> ".concat(esc(Array.isArray(r.why) ? r.why.join(' ') : r.why), "</div>") : '').concat(((_a = r.others) === null || _a === void 0 ? void 0 : _a.length) ? "<div class=\"note\"><b>Otras IA:</b> ".concat(r.others.map(function (o) { return "".concat(esc(o.agent), ": ").concat(esc(o.stance), " (").concat(Math.round(o.probBeat * 100), "%)"); }).join(' · '), "</div>") : '').concat(((_b = r.sources) === null || _b === void 0 ? void 0 : _b.length) ? "<div class=\"note\"><b>Fuentes:</b> ".concat(r.sources.map(function (s) { return s.url ? "<a href=\"".concat(esc(s.url), "\" target=\"_blank\" rel=\"noopener\">").concat(esc(s.label), "</a>") : esc(s.label); }).join(' · '), "</div>") : '').concat(r.outcome ? "<div class=\"note\"><b>Resultado real:</b> ".concat(r.outcome.ret != null ? "".concat(pctp(r.outcome.ret), " la acci\u00F3n vs ").concat(pctp(r.outcome.bench), " el mercado (al ").concat(esc(r.outcome.endDate), ")") : "sali\u00F3 ".concat(esc((r.outcome.draw || []).join('-'))), "</div>") : '', "<div class=\"note mono\">Sellada ").concat(esc(r.sealedAt.slice(0, 16).replace('T', ' ')), " UTC \u00B7 huella ").concat(esc(r.hash.slice(0, 16)), "\u2026</div></details></td>\n    <td class=\"r\">").concat(Math.round(r.prob * 100), "%</td><td class=\"r\">").concat(r.amount.value != null ? (r.amount.cur === 'RD$' ? rd(r.amount.value) : usd(r.amount.value, 0)) : '—', "</td>\n    <td class=\"r\">").concat(r.potential ? (typeof r.potential === 'number' ? rd(r.potential) : "".concat(usd(r.potential.probable), " <span class=\"note\">(").concat(usd(r.potential.bad), " a ").concat(usd(r.potential.good), ")</span>")) : '—', "</td>\n    <td>").concat(st[r.status]).concat(r.pnl != null ? " <span class=\"".concat(cls(r.pnl), "\">").concat(r.amount.cur === 'RD$' ? rd(r.pnl) : usd(r.pnl), "</span>") : '', "</td></tr>");
    }).join(''), "</table></div>");
}
views.historial.after = function () {
    var _a = window.__H, perf = _a.perf, hist = _a.hist, real = _a.real;
    var show = function (t) {
        document.querySelectorAll('#htabs button').forEach(function (b) { return b.classList.toggle('ghost', b.dataset.t !== t); });
        if (t === 'bolsa' || t === 'loterias') {
            var rows_1 = hist.filter(function (r) { return (t === 'bolsa' ? r.module !== 'loteria' : r.module === 'loteria'); });
            var who = __spreadArray([], __read(new Set(rows_1.map(function (r) { return r.agentLabel; }))), false);
            $('#hview').innerHTML = perfBlock(perf[t], t === 'bolsa' ? 'US$' : 'RD$') + "<section class=\"card\"><h2>Registro completo (".concat(rows_1.length, ") <a class=\"more\" href=\"/api/export/predicciones\">Exportar todo \u25B8</a></h2>\n        <div class=\"row\" style=\"margin-bottom:10px;gap:10px\"><label class=\"note\">Qui\u00E9n <select id=\"fq\"><option value=\"\">Todos</option>").concat(who.map(function (w) { return "<option>".concat(esc(w), "</option>"); }).join(''), "</select></label>\n        <label class=\"note\">Resultado <select id=\"fr\"><option value=\"\">Todos</option><option value=\"acerto\">Acert\u00F3</option><option value=\"fallo\">Fall\u00F3</option><option value=\"pendiente\">Pendiente</option></select></label>\n        <span class=\"note\" id=\"fc\" style=\"margin-left:auto\"></span></div><div id=\"rt\"></div><div style=\"text-align:center;margin-top:10px\"><button class=\"btn ghost\" id=\"fm\">Ver m\u00E1s</button></div></section>");
            var lim_1 = 20;
            var draw_1 = function () {
                var f = rows_1.filter(function (r) { return (!$('#fq').value || r.agentLabel === $('#fq').value) && (!$('#fr').value || r.status === $('#fr').value); });
                $('#rt').innerHTML = recordsTable(f.slice(0, lim_1));
                $('#fc').textContent = "Mostrando ".concat(Math.min(lim_1, f.length), " de ").concat(f.length);
                $('#fm').style.display = f.length > lim_1 ? '' : 'none';
            };
            $('#fq').onchange = $('#fr').onchange = function () { lim_1 = 20; draw_1(); };
            $('#fm').onclick = function () { lim_1 += 40; draw_1(); };
            draw_1();
        }
        else if (t === 'ia') {
            var ia_1 = perf.ia;
            var people = ia_1.agents.filter(function (a) { return a.kind !== 'estrategia'; }).sort(function (x, y) { var _a, _b; return ((_a = y.hitRate) !== null && _a !== void 0 ? _a : -1) - ((_b = x.hitRate) !== null && _b !== void 0 ? _b : -1); });
            var tags_1 = function (a) { var _a, _b, _c, _d; return [[(_a = ia_1.leaders) === null || _a === void 0 ? void 0 : _a.masAciertos, '🏆 Acierta más'], [(_b = ia_1.leaders) === null || _b === void 0 ? void 0 : _b.mejorProbabilidad, '🎯 Mejor calculando'], [(_c = ia_1.leaders) === null || _c === void 0 ? void 0 : _c.masGanancia, '💰 Gana más'], [(_d = ia_1.leaders) === null || _d === void 0 ? void 0 : _d.masErrores, '⚠️ Falla más']].filter(function (_a) {
                var _b = __read(_a, 1), n = _b[0];
                return n === a.label;
            }).map(function (_a) {
                var _b = __read(_a, 2), t = _b[1];
                return "<span class=\"pill\">".concat(t, "</span>");
            }).join(''); };
            $('#hview').innerHTML = "<section><h2 style=\"margin:4px 0 12px\">\u00BFQu\u00E9 IA es m\u00E1s confiable?</h2><div class=\"grid g3\">".concat(people.map(function (a, i) { return "<div class=\"card iac".concat(i === 0 && a.resolved ? ' first' : '', "\"><div class=\"iac-h\"><span class=\"pos\">").concat(i + 1, "</span><b>").concat(esc(a.label), "</b></div>\n          <div class=\"iac-v\">").concat(a.hitRate != null ? Math.round(a.hitRate) + '%' : '—', "</div><div class=\"note\">de acierto \u00B7 ").concat(a.hits, " aciertos y ").concat(a.misses, " fallos</div>\n          ").concat(a.hitRate != null ? chanceDots(a.hitRate / 100, { what: 'acierta' }) : '', "\n          <div class=\"note\" style=\"margin-top:8px\">Con US$10 por idea: <b class=\"").concat(cls(a.net), "\">").concat(usd(a.net), "</b></div><div class=\"row\" style=\"gap:6px;margin-top:8px\">").concat(tags_1(a), "</div></div>"); }).join(''), "</div>\n        <div class=\"note\" style=\"margin-top:8px\">").concat(esc(ia_1.note || ''), " Ninguna IA puede borrar ni cambiar lo que dijo: todo queda sellado antes del resultado.</div></section>\n        <details class=\"card\"><summary><b>Tabla completa</b> <span class=\"note\">para expertos</span></summary><div class=\"tablewrap\" style=\"margin-top:10px\"><table><tr><th>Agente</th><th class=\"r\">Predicciones</th><th class=\"r\">Aciertos</th><th class=\"r\">Fallos</th><th class=\"r\">% acierto</th><th class=\"r\">Prob. promedio</th><th class=\"r\">Calibraci\u00F3n (Brier)</th><th class=\"r\">Neto con US$10</th></tr>\n        ").concat(ia_1.agents.filter(function (a) { return a.kind !== 'estrategia'; }).map(function (a) { var _a; return "<tr><td><b>".concat(esc(a.label), "</b></td><td class=\"r\">").concat(a.total, "</td><td class=\"r good\">").concat(a.hits, "</td><td class=\"r bad\">").concat(a.misses, "</td><td class=\"r\">").concat(a.hitRate != null ? a.hitRate + '%' : '—', "</td><td class=\"r\">").concat(a.avgProb != null ? a.avgProb + '%' : '—', "</td><td class=\"r\">").concat((_a = a.brier) !== null && _a !== void 0 ? _a : '—', "</td><td class=\"r ").concat(cls(a.net), "\">").concat(usd(a.net), "</td></tr>"); }).join(''), "</table></div>\n        <div class=\"note\" style=\"margin-top:8px\">Calibraci\u00F3n: si una IA dice \"70%\" y acierta 7 de cada 10, est\u00E1 bien calibrada. Brier m\u00E1s bajo es mejor; 0.25 equivale a adivinar.</div></details>\n        <section class=\"card\"><h2>Agentes de estrategia (practican con dinero virtual)</h2><table><tr><th>Agente</th><th class=\"r\">Operaciones cerradas</th><th class=\"r\">Monedas</th><th class=\"r\">Trampas detectadas</th></tr>").concat(ia_1.agents.filter(function (a) { return a.kind === 'estrategia'; }).map(function (a) { return "<tr><td>".concat(esc(a.label), "</td><td class=\"r\">").concat(a.closedTrades, "</td><td class=\"r\">").concat(a.coins, "</td><td class=\"r ").concat(a.cheats ? 'bad' : '', "\">").concat(a.cheats, "</td></tr>"); }).join(''), "</table></section>");
        }
        else {
            var r = real;
            $('#hview').innerHTML = "<section class=\"card\" style=\"border-color:#ffbf3c\"><h2>Dinero real</h2><p class=\"note\">JARVIS nunca invierte ni apuesta por ti. Aqu\u00ED anotas lo que hiciste de verdad, para comparar tu dinero real con sus recomendaciones. Lo que anotes queda sellado. Si una inversi\u00F3n real cae 8% desde tu compra o pasa a \"No te recomiendo\", te aviso al celular para que decidas salir.</p>\n        <div class=\"grid g4\"><div class=\"pbox\"><div class=\"l\">Bolsa: neto realizado</div><div class=\"v ".concat(cls(r.bolsa.net), "\">").concat(usd(r.bolsa.net), "</div><div class=\"note\">").concat(r.bolsa.count, " registros \u00B7 ").concat(r.bolsa.open, " abiertos</div></div><div class=\"pbox\"><div class=\"l\">Bolsa: invertido</div><div class=\"v\">").concat(usd(r.bolsa.staked), "</div><div class=\"note\">").concat(r.bolsa.followed, " siguiendo a JARVIS</div></div>\n        <div class=\"pbox\"><div class=\"l\">Loter\u00EDas: neto</div><div class=\"v ").concat(cls(r.loterias.net), "\">").concat(rd(r.loterias.net), "</div><div class=\"note\">").concat(r.loterias.count, " apuestas \u00B7 ").concat(r.loterias.wins, " premios</div></div><div class=\"pbox\"><div class=\"l\">Loter\u00EDas: apostado</div><div class=\"v\">").concat(rd(r.loterias.staked), "</div></div></div></section>\n        <section class=\"grid g2\"><div class=\"card\"><h2>Anotar inversi\u00F3n real (bolsa)</h2><form class=\"form\" id=\"rbf\"><div class=\"grid g3\" style=\"gap:10px\"><label>Acci\u00F3n<input id=\"rbs\" placeholder=\"MSFT\" required></label><label>Monto US$<input id=\"rba\" type=\"number\" step=\"0.01\" min=\"0.01\" required></label><label>Precio de compra<input id=\"rbp\" type=\"number\" step=\"0.0001\" min=\"0.0001\" required></label></div><button class=\"btn\">Anotar</button><div class=\"msg\" id=\"rbm\"></div></form></div>\n        <div class=\"card\"><h2>Anotar apuesta real (loter\u00EDa)</h2><form class=\"form\" id=\"rlf\"><div class=\"grid g4\" style=\"gap:10px\"><label>Loter\u00EDa<select id=\"rlg\">").concat(['leidsa', 'nacional', 'nacional-noche', 'loteka', 'real'].map(function (g) { return "<option>".concat(g, "</option>"); }).join(''), "</select></label><label>Fecha<input id=\"rld\" type=\"date\" required></label><label>N\u00FAmeros<input id=\"rln\" placeholder=\"27\" required></label><label>Monto RD$<input id=\"rls\" type=\"number\" min=\"1\" required></label></div><button class=\"btn\">Anotar</button><div class=\"msg\" id=\"rlm\"></div></form></div></section>\n        <section class=\"card\"><h2>Mis registros reales</h2>").concat(r.rows.length ? "<table><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Estado</th><th class=\"r\">Resultado</th></tr>".concat(r.rows.map(function (x) { return "<tr><td class=\"note\">".concat(esc(x.ts.slice(0, 10)), "</td><td>").concat(x.module === 'bolsa' ? 'Bolsa' : 'Lotería', "</td><td>").concat(x.module === 'bolsa' ? "".concat(esc(x.detail.symbol), " \u00B7 ").concat(usd(x.detail.amountUsd), " a ").concat(usd(x.detail.price)) : "".concat(esc(x.detail.game), " ").concat(esc(x.detail.date), " \u00B7 ").concat(esc(x.detail.numbers.join('-')), " \u00B7 ").concat(rd(x.detail.stakeRd)), "</td><td>").concat(x.status === 'abierta' ? (x.module === 'bolsa' ? "<button class=\"btn ghost\" data-close=\"".concat(x.id, "\" style=\"padding:3px 10px\">Anotar venta</button>") : 'Esperando sorteo') : 'Cerrada', "</td><td class=\"r ").concat(cls(x.result), "\">").concat(x.result != null ? (x.module === 'bolsa' ? usd(x.result) : rd(x.result)) : '—', "</td></tr>"); }).join(''), "</table>") : '<div class="empty">Sin registros reales todavía.</div>', "</section>");
            var post_1 = function (body, m) { return __awaiter(void 0, void 0, void 0, function () { var e_15; return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4, api('/api/real', { method: 'POST', body: body })];
                    case 1:
                        _a.sent();
                        $(m).className = 'msg ok';
                        $(m).textContent = 'Anotado y sellado.';
                        setTimeout(render, 900);
                        return [3, 3];
                    case 2:
                        e_15 = _a.sent();
                        $(m).className = 'msg err';
                        $(m).textContent = e_15.message;
                        return [3, 3];
                    case 3: return [2];
                }
            }); }); };
            $('#rbf').onsubmit = function (e) { e.preventDefault(); post_1({ module: 'bolsa', symbol: $('#rbs').value, amountUsd: $('#rba').value, price: $('#rbp').value }, '#rbm'); };
            $('#rlf').onsubmit = function (e) { e.preventDefault(); post_1({ module: 'loteria', game: $('#rlg').value, date: $('#rld').value, numbers: $('#rln').value.trim().split(/\s+/).map(function (x) { return x.padStart(2, '0'); }), stakeRd: $('#rls').value }, '#rlm'); };
            document.querySelectorAll('[data-close]').forEach(function (b) { return b.onclick = function () { return __awaiter(void 0, void 0, void 0, function () {
                var td;
                return __generator(this, function (_a) {
                    td = b.parentElement;
                    td.innerHTML = "<form class=\"ask\" style=\"max-width:260px\"><input type=\"number\" step=\"0.0001\" placeholder=\"Precio de venta\" required><button class=\"btn\">OK</button></form>";
                    td.querySelector('form').onsubmit = function (e) { return __awaiter(void 0, void 0, void 0, function () { var err_30; return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                e.preventDefault();
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4, api("/api/real/".concat(b.dataset.close, "/close"), { method: 'POST', body: { sellPrice: td.querySelector('input').value } })];
                            case 2:
                                _a.sent();
                                render();
                                return [3, 4];
                            case 3:
                                err_30 = _a.sent();
                                td.insertAdjacentHTML('beforeend', "<div class=\"msg err\">".concat(esc(err_30.message), "</div>"));
                                return [3, 4];
                            case 4: return [2];
                        }
                    }); }); };
                    return [2];
                });
            }); }; });
        }
    };
    document.querySelectorAll('#htabs button').forEach(function (b) { return b.onclick = function () { return show(b.dataset.t); }; });
    show('bolsa');
};
var tvTimer = null, tvLastId = 0, tvClock = null, tvDebTimer = null, tvPrev = null, tvChartKey = '';
var TVC = { verde: '#2fd58a', amarillo: '#ffbf3c', rojo: '#ff5d6c' };
function animNum(el, from, to, fmt, ms) {
    if (ms === void 0) { ms = 1400; }
    if (!el)
        return;
    var t0 = performance.now();
    var step = function (t) { var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1)
        requestAnimationFrame(step); };
    requestAnimationFrame(step);
}
function tvOpen() {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    $('#tv-root').innerHTML = "<div class=\"tv\" id=\"tv\"><button class=\"iconbtn exit\" id=\"tvx\">Salir \u2715</button>\n    <div class=\"th\"><span class=\"logo\">".concat(brandMark()).concat(brandName(), "</span><span class=\"chip\" id=\"tvm\">\u2026</span><span class=\"chip\" id=\"tvmk\">\u2026</span><span class=\"chip\" id=\"tvai\">\u2026</span><span class=\"clock\" id=\"tvc\"></span></div>\n    <div class=\"headline\" id=\"tvh\">Conectando\u2026</div>\n    <div class=\"kpis\">\n      <div class=\"kp money\"><small>Tu dinero virtual</small><i class=\"what\">lo que tendr\u00EDas siguiendo a JARVIS</i><div class=\"row1\"><b id=\"k-money\">\u2014</b><span class=\"arrow\" id=\"k-arrow\"></span></div><div class=\"sub\" id=\"k-money-sub\"></div><div class=\"sub\" id=\"k-pos\"></div></div>\n      <div class=\"kp\"><small>\uD83D\uDCBC Los US$100 de JARVIS</small><i class=\"what\">JARVIS invierte solo, sin ti</i><b id=\"k-ia\">\u2014</b><div class=\"sub\" id=\"k-ia-sub\"></div></div>\n      <div class=\"kp\"><small>\uD83E\uDDE0 Experiencia</small><i class=\"what\">de cada 10 ideas, cu\u00E1ntas acert\u00F3</i><b id=\"k-hit\">\u2014</b><div class=\"sub\" id=\"k-hit-sub\"></div></div>\n      <div class=\"kp\"><small>\uD83C\uDFB1 Loter\u00EDas (virtual)</small><i class=\"what\">jugadas de prueba, sin dinero real</i><b id=\"k-lot\">\u2014</b><div class=\"sub\" id=\"k-lot-sub\"></div></div>\n      <div class=\"kp\"><small>\u2728 Gasto de IA este mes</small><i class=\"what\">lo que cuesta la inteligencia artificial</i><b id=\"k-ai\">\u2014</b><div class=\"sub\" id=\"k-ai-sub\"></div></div>\n    </div>\n    <div class=\"workers\" id=\"tvw\"></div>\n    <div class=\"body\">\n      <div class=\"pane\"><h3><span class=\"live\"></span>La IA en este momento</h3><p class=\"what\">Lo que JARVIS est\u00E1 pensando y haciendo ahora, en vivo.</p><div class=\"think\" id=\"tvthink\"></div><div class=\"console\" id=\"tvcon\"></div><div class=\"prog\"><span></span></div></div>\n      <div class=\"col\">\n        <div class=\"pane chartpane\"><h3 id=\"tvct\">Rendimiento</h3><p class=\"what\">Verde: JARVIS \u00B7 punteada: el mercado. Si la verde va arriba, va ganando.</p><div id=\"tvchart\" class=\"chartbox\"></div></div>\n        <div class=\"pane recpane\"><h3>Recomendaciones del momento</h3><p class=\"what\">Las mejores ideas de hoy. La nota de 10 = qu\u00E9 tan convencido est\u00E1.</p><div class=\"cards\" id=\"tvrank\"></div></div>\n      </div>\n      <div class=\"col\">\n        <div class=\"pane spot\"><h3><span class=\"live\"></span><span id=\"tvst\">Mapa</span><span class=\"dots\" id=\"tvsd\"></span></h3><p class=\"what\" id=\"tvsw\"></p>\n          <div class=\"slide on\" data-s=\"cuentas\"><div class=\"tvacct\" id=\"tvacct\"></div></div>\n          <div class=\"slide\" data-s=\"mapa\"><div class=\"tvmap\" id=\"tvmap\"></div></div>\n          <div class=\"slide\" data-s=\"loto\"><div class=\"tvloto\" id=\"tvloto\"></div></div>\n          <div class=\"slide\" data-s=\"ia\"><div class=\"tvia\" id=\"tvia\"></div></div>\n          <div class=\"slide\" data-s=\"ana\"><div class=\"tvana\" id=\"tvana\"></div></div>\n          <div class=\"slide\" data-s=\"debate\"><h4 class=\"sub\" id=\"tvdt\">Debate en vivo</h4><div class=\"chat\" id=\"tvchat\"></div></div>\n          <div class=\"sbar\"><span id=\"tvsb\"></span></div></div>\n        <div class=\"pane leaguepane\"><h3>Liga de agentes \u00B7 monedas</h3><p class=\"what\">Ganan una moneda al acertar y la pierden al fallar (con auditor).</p><div class=\"league\" id=\"tvlg\"></div></div>\n      </div>\n    </div>\n    <div class=\"ticker\"><div class=\"track\" id=\"tvtk\"></div></div></div>");
                    $('#tvx').onclick = function () { location.hash = '#inicio'; };
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4, ((_c = (_b = document.documentElement).requestFullscreen) === null || _c === void 0 ? void 0 : _c.call(_b))];
                case 2:
                    _d.sent();
                    return [3, 4];
                case 3:
                    _a = _d.sent();
                    return [3, 4];
                case 4:
                    tvClock = setInterval(function () { var c = $('#tvc'); if (c)
                        c.textContent = new Date().toLocaleString('es-DO', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }, 1000);
                    tvPrev = null;
                    tvLastId = 0;
                    tvChartKey = '';
                    return [4, tvRefresh()];
                case 5:
                    _d.sent();
                    tvTimer = setInterval(tvRefresh, 15000);
                    tvSlide = 0;
                    tvSpotShow();
                    clearInterval(tvSpotTimer);
                    tvSpotTimer = setInterval(function () { tvSlide++; tvSpotShow(); }, 12000);
                    return [2];
            }
        });
    });
}
function tvClose() { var _a; clearInterval(tvThinkTimer); tvThinkTimer = null; clearInterval(tvSpotTimer); clearInterval(tvTimer); clearInterval(tvClock); clearTimeout(tvDebTimer); $('#tv-root').innerHTML = ''; if (document.fullscreenElement)
    (_a = document.exitFullscreen) === null || _a === void 0 ? void 0 : _a.call(document).catch(function () { }); }
function tvChart(c) {
    var box = $('#tvchart');
    if (!box)
        return;
    if (!c) {
        box.innerHTML = '<div class="empty-tv">El gráfico aparece cuando haya precios suficientes.</div>';
        return;
    }
    var key = JSON.stringify([c.a.at(-1), c.b.at(-1), c.a.length]);
    if (key === tvChartKey)
        return;
    tvChartKey = key;
    $('#tvct').textContent = c.title;
    var W = 900, H = 300, L = c.unit === 'usd' ? 92 : 60, R = 200, T = 16, B = 30, all = __spreadArray(__spreadArray([], __read(c.a), false), __read(c.b), false).map(function (p) { return p[1]; });
    var min = Math.min.apply(Math, __spreadArray([0], __read(all), false)), max = Math.max.apply(Math, __spreadArray([0], __read(all), false)), sp = max - min || 1;
    var x = function (i) { return L + i / (c.a.length - 1) * (W - L - R); }, y = function (v) { return T + (1 - (v - min) / sp) * (H - T - B); };
    var path = function (pts) { return pts.map(function (p, i) { return "".concat(i ? 'L' : 'M').concat(x(i).toFixed(1), " ").concat(y(p[1]).toFixed(1)); }).join(' '); };
    var f = function (v) { return c.unit === 'usd' ? usd(v) : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
    var ticks = [min, (min + max) / 2, max], la = c.a.at(-1)[1], lb = c.b.at(-1)[1];
    var ca = la >= lb ? '#2fd58a' : '#ff5d6c';
    box.innerHTML = "<svg viewBox=\"0 0 ".concat(W, " ").concat(H, "\" preserveAspectRatio=\"none\" role=\"img\" aria-label=\"").concat(esc(c.title), "\">\n    <defs><linearGradient id=\"tvg\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"").concat(ca, "\" stop-opacity=\".35\"/><stop offset=\"1\" stop-color=\"").concat(ca, "\" stop-opacity=\"0\"/></linearGradient></defs>\n    ").concat(ticks.map(function (t) { return "<line x1=\"".concat(L, "\" x2=\"").concat(W - R, "\" y1=\"").concat(y(t), "\" y2=\"").concat(y(t), "\" stroke=\"#1e2a44\"/><text x=\"").concat(L - 8, "\" y=\"").concat(y(t) + 5, "\" text-anchor=\"end\" fill=\"#6d7b99\" font-size=\"15\">").concat(f(t), "</text>"); }).join(''), "\n    <line x1=\"").concat(L, "\" x2=\"").concat(W - R, "\" y1=\"").concat(y(0), "\" y2=\"").concat(y(0), "\" stroke=\"#3a4a6b\" stroke-dasharray=\"4 4\"/>\n    <path class=\"area\" d=\"").concat(path(c.a), " L").concat(x(c.a.length - 1), " ").concat(y(min), " L").concat(x(0), " ").concat(y(min), " Z\" fill=\"url(#tvg)\"/>\n    <path class=\"draw b\" d=\"").concat(path(c.b), "\" fill=\"none\" stroke=\"#8a97b5\" stroke-width=\"2.5\" stroke-dasharray=\"7 6\" pathLength=\"1000\"/>\n    <path class=\"draw a\" d=\"").concat(path(c.a), "\" fill=\"none\" stroke=\"").concat(ca, "\" stroke-width=\"4\" pathLength=\"1000\"/>\n    <circle class=\"dot\" cx=\"").concat(x(c.a.length - 1), "\" cy=\"").concat(y(la), "\" r=\"8\" fill=\"").concat(ca, "\"/>\n    <text x=\"").concat(W - R + 14, "\" y=\"").concat(y(la) + 6, "\" fill=\"").concat(ca, "\" font-size=\"20\" font-weight=\"800\">").concat(esc(c.aLabel), " ").concat(f(la), "</text>\n    <text x=\"").concat(W - R + 14, "\" y=\"").concat(y(lb) + (Math.abs(y(lb) - y(la)) < 26 ? 30 : 6), "\" fill=\"#8a97b5\" font-size=\"17\">").concat(esc(c.bLabel), " ").concat(f(lb), "</text>\n    <text x=\"").concat(L, "\" y=\"").concat(H - 6, "\" fill=\"#6d7b99\" font-size=\"14\">").concat(esc(c.a[0][0]), "</text><text x=\"").concat(W - R, "\" y=\"").concat(H - 6, "\" text-anchor=\"end\" fill=\"#6d7b99\" font-size=\"14\">").concat(esc(c.a.at(-1)[0]), "</text></svg>");
}
function tvDebate(d) {
    var chat = $('#tvchat');
    if (!chat)
        return;
    if (!d) {
        chat.innerHTML = '<div class="empty-tv">Las dos IA debaten aquí antes de cada recomendación importante.</div>';
        return;
    }
    if (chat.dataset.id === String(d.id))
        return;
    chat.dataset.id = d.id;
    $('#tvdt').textContent = "Debate en vivo \u00B7 ".concat(d.subject);
    var msgs = d.rounds.flatMap(function (r) { return r.messages.filter(function (m) { return !m.failed; }).map(function (m, i) { return (__assign(__assign({}, m), { side: i ? 'b' : 'a', round: r.round })); }); });
    var v = d.verdict;
    var i = 0;
    clearTimeout(tvDebTimer);
    var next = function () {
        if (!$('#tvchat'))
            return;
        if (i === 0)
            chat.innerHTML = '';
        if (!msgs.length || i >= msgs.length) {
            chat.insertAdjacentHTML('beforeend', "<div class=\"verdict-tv\" style=\"border-color:".concat(TVC[v.light], "\"><span style=\"color:").concat(TVC[v.light], "\">\u25CF Decisi\u00F3n: ").concat(esc(v.title), "</span><small>").concat(esc(v.notes[0] || ''), " \u00B7 confianza ").concat(Math.round(v.confidence * 100), "%</small></div>"));
            i = 0;
            tvDebTimer = setTimeout(next, 9000);
            return;
        }
        var m = msgs[i];
        var typing = document.createElement('div');
        typing.className = "bub-tv ".concat(m.side, " typing");
        typing.innerHTML = "<b>".concat(esc((ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? m.who : 'IA ' + (m.label || '')), "</b> est\u00E1 escribiendo <span class=\"dots\"><i></i><i></i><i></i></span>");
        chat.appendChild(typing);
        tvDebTimer = setTimeout(function () {
            typing.remove();
            chat.insertAdjacentHTML('beforeend', "<div class=\"bub-tv ".concat(m.side, "\"><div class=\"who\"><b>").concat(esc((ME === null || ME === void 0 ? void 0 : ME.role) === 'admin' ? m.who : 'IA ' + (m.label || '')), "</b><span class=\"st ").concat(m.stance, "\">").concat(esc(m.stance.replace('_', ' ')), "</span><span class=\"rd\">ronda ").concat(m.round, "</span></div><p>").concat(esc(m.text), "</p></div>"));
            while (chat.children.length > 4)
                chat.firstElementChild.remove();
            i++;
            tvDebTimer = setTimeout(next, 3800);
        }, 1500);
    };
    next();
}
function tvAcct(c) {
    var el = $('#tvacct');
    if (!el || !c)
        return;
    var B = c.bolsa, L = c.loteria, U = function (v) { return usd(v / (c.rate || FX)); };
    var box = function (l, v, cls, sub) { return "<div class=\"ab ".concat(cls || '', "\"><small>").concat(l, "</small><b>").concat(v, "</b>").concat(sub ? "<i>".concat(sub, "</i>") : '', "</div>"); };
    var syms = B.positions.length ? B.positions.slice(0, 3).map(function (p) { return esc(p.symbol); }).join(', ') + (B.positions.length > 3 ? '…' : '') : B.regime === 'bajista' ? 'esperando: mercado bajista' : (B.marketOpen ? 'buscando qué comprar' : 'compra al abrir la bolsa');
    el.innerHTML = "<div class=\"acols\"><div><div class=\"ah\">\uD83D\uDCC8 Bolsa <span>empez\u00F3 con ".concat(usd(B.start, 0), " \u00B7 ").concat(syms, "</span></div>\n    <div class=\"agrid\">").concat(box('Invirtió', usd(B.invested), '', syms)).concat(box('Vale hoy', usd(B.valueNow), B.unrealized >= 0 ? 'up' : 'dn', "".concat(B.unrealized >= 0 ? '+' : '').concat(usd(B.unrealized)))).concat(box('Efectivo', usd(B.cash), '', 'sin invertir')).concat(box('Tiene', usd(B.total), B.gain >= 0 ? 'up' : 'dn', "".concat(B.gain >= 0 ? '+' : '').concat(usd(B.gain), " (").concat(B.returnPct, "%)")), "</div></div>\n    <div><div class=\"ah\">\uD83C\uDFB1 Loter\u00EDa <span>empez\u00F3 con ").concat(usd(L.startUsd, 0), " \u00B7 ").concat(L.plays, " jugadas</span></div>\n    <div class=\"agrid\">").concat(box('Jugó', U(L.playedRd), '', "".concat(L.plays, " jugadas"))).concat(box('Ganó', U(L.wonRd), L.wonRd > 0 ? 'up' : '', "".concat(L.hits, " aciertos"))).concat(box('Perdió', U(L.lostRd), L.lostRd > 0 ? 'dn' : '', "".concat(L.settled - L.hits, " sin premio"))).concat(box('Le queda', U(L.leftRd), L.leftRd >= L.startRd ? 'up' : 'dn', "\u2248 RD$".concat(Math.round(L.leftRd).toLocaleString('en-US'))), "</div></div></div>");
}
function tvLeague(list) {
    var box = $('#tvlg');
    if (!box)
        return;
    var rowH = 3.1, max = Math.max.apply(Math, __spreadArray([1], __read(list.map(function (a) { return Math.abs(a.coins); })), false));
    list.forEach(function (a, rank) {
        var row = box.querySelector("[data-ag=\"".concat(a.id, "\"]"));
        var prev = row ? Number(row.dataset.coins) : null;
        if (!row) {
            row = document.createElement('div');
            row.className = 'lrow';
            row.dataset.ag = a.id;
            row.innerHTML = "<span class=\"pos\"></span><span class=\"nm\">".concat(esc(a.name), "<small class=\"dg\"></small></span><b class=\"cn\"></b><div class=\"bar\"><span></span></div>");
            box.appendChild(row);
        }
        row.style.top = rank * rowH + 'vw';
        row.querySelector('.pos').textContent = rank + 1;
        var dg = row.querySelector('.dg');
        if (dg)
            dg.textContent = a.doing || '';
        var cn = row.querySelector('.cn');
        animNum(cn, prev !== null && prev !== void 0 ? prev : 0, a.coins, function (v) { return (Math.round(v * 10) / 10).toString(); }, 1200);
        cn.className = 'cn ' + (a.coins >= 0 ? 'pos-c' : 'neg-c');
        requestAnimationFrame(function () { row.querySelector('.bar span').style.width = Math.max(3, (a.coins + max) / (2 * max) * 100) + '%'; });
        var gained = prev == null ? (rank === 0 && a.week > 0 ? a.week : 0) : a.coins - prev;
        if (gained > 0)
            coinRain(box, rank * rowH, Math.min(14, Math.ceil(gained * 2)), "+".concat(Math.round(gained * 10) / 10));
        row.dataset.coins = a.coins;
    });
    box.style.height = list.length * rowH + 'vw';
}
function coinRain(box, topVw, n, label) {
    var tag = document.createElement('div');
    tag.className = 'gain';
    tag.style.top = topVw + 'vw';
    tag.textContent = label + ' monedas';
    box.appendChild(tag);
    setTimeout(function () { return tag.remove(); }, 3000);
    var _loop_1 = function (k) {
        var c = document.createElement('span');
        c.className = 'coin';
        c.textContent = '¢';
        c.style.left = (55 + Math.random() * 40) + '%';
        c.style.top = (topVw - 4) + 'vw';
        c.style.animationDelay = (k * 0.12) + 's';
        box.appendChild(c);
        setTimeout(function () { return c.remove(); }, 2600 + k * 120);
    };
    for (var k = 0; k < n; k++) {
        _loop_1(k);
    }
}
function tvTicker(qs) {
    var t = $('#tvtk');
    if (!t)
        return;
    var items = qs.map(function (q) { var _a, _b; var up = ((_a = q.changePct) !== null && _a !== void 0 ? _a : 0) >= 0; return "<span class=\"tq\"><b>".concat(esc(q.symbol), "</b> ").concat(usd(q.price), " <em class=\"").concat(up ? 'up' : 'dn', "\">").concat(up ? '▲' : '▼', " ").concat(Math.abs((_b = q.changePct) !== null && _b !== void 0 ? _b : 0).toFixed(2), "%</em></span>"); }).join('');
    var html = items + '<span class="tq dim">Todo es dinero virtual · JARVIS no promete ganancias, demuestra con datos</span>';
    if (t.dataset.h !== html) {
        t.dataset.h = html;
        t.innerHTML = html + html;
        t.style.animationDuration = Math.max(30, qs.length * 5) + 's';
    }
}
var tvSpotTimer = null, tvSlide = 0, tvHasDebate = false;
var TV_SLIDES = [['cuentas', '🤖 Dinero de la IA', 'Cuánto tenía, en qué lo invirtió, cuánto ganó o perdió y con cuánto queda.'], ['mapa', '🗺️ Mapa de inversión', 'Verde = recomendada · amarillo = en observación · rojo = no.'], ['loto', '🎱 Loterías: próximos sorteos', 'Próximo sorteo y los números que votó cada método.'], ['ia', '🤖 Tú vs la IA vs el mercado', 'Quién va ganando: tú, la IA sola o el mercado.'], ['debate', '💬 Debate de las IA', 'Dos IA discuten a favor y en contra.'], ['ana', '🔬 Análisis en vivo', 'JARVIS revisa una empresa paso a paso.']];
function tvSpotShow() {
    var list = TV_SLIDES.filter(function (_a) {
        var _b = __read(_a, 1), k = _b[0];
        return (k !== 'debate' || tvHasDebate);
    }), cur = list[tvSlide % list.length];
    document.querySelectorAll('.tv .slide').forEach(function (el) { return el.classList.toggle('on', el.dataset.s === cur[0]); });
    var t = $('#tvst');
    if (t)
        t.textContent = cur[1];
    var w = $('#tvsw');
    if (w)
        w.textContent = cur[2] || '';
    var d = $('#tvsd');
    if (d)
        d.innerHTML = list.map(function (x) { return "<i class=\"".concat(x[0] === cur[0] ? 'on' : '', "\"></i>"); }).join('');
    var b = $('#tvsb');
    if (b) {
        b.style.animation = 'none';
        void b.offsetWidth;
        b.style.animation = '';
    }
}
var TASK_TV = { bolsa_precios: ['📈', 'Precios en vivo', 'trae precios reales'], loterias_resultados: ['🎱', 'Resultados de loterías', 'lee los resultados oficiales'], investigacion: ['🧪', 'Probando ideas', 'prueba ideas con años de precios'], explorar: ['🔭', 'Explorando empresas', 'busca empresas nuevas'], ranking: ['🗺️', 'Actualizando el mapa', 'mueve empresas en el mapa'], cartera_ia: ['🤖', 'Cartera de la IA', 'compra y vende sola (virtual)'], noticias: ['📰', 'Leyendo noticias', 'busca noticias graves'], prueba_en_vivo: ['⚡', 'Prueba en vivo', 'prueba ideas con precios de hoy'] };
function tvWorkers(tasks) {
    var _a;
    var el = $('#tvw');
    if (!el || !tasks)
        return;
    var now = Date.now(), recent = (_a = tasks.slice().sort(function (a, b) { return (b.last || '').localeCompare(a.last || ''); })[0]) === null || _a === void 0 ? void 0 : _a.name;
    el.innerHTML = tasks.map(function (t) {
        var _a = __read(TASK_TV[t.name] || ['•', t.name, ''], 3), ic = _a[0], lb = _a[1], ds = _a[2];
        var mins = t.last ? (now - Date.parse(t.last)) / 60e3 : null, alive = mins != null && mins < t.every * 2 + 10;
        return "<div class=\"wk ".concat(t.name === recent ? 'busy' : '', " ").concat(alive ? 'ok' : 'idle', "\"><span class=\"wi\">").concat(ic, "</span><div><b>").concat(esc(lb), "</b><small class=\"wds\">").concat(esc(ds), "</small><small>").concat(t.name === recent ? 'trabajando ahora…' : mins == null ? 'esperando su turno' : mins < 1 ? 'hace un momento' : mins < 60 ? "hace ".concat(Math.round(mins), " min") : "hace ".concat(Math.round(mins / 60), " h"), "</small></div><span class=\"wd\"></span></div>");
    }).join('');
}
var ZTV = [['recomendada', 'Te recomiendo', '#2fd58a'], ['observacion', 'En observación', '#ffbf3c'], ['no_recomendada', 'No te recomiendo', '#ff5d6c'], ['candidata', 'Explorando', '#a98bff']];
function tvMap(m) {
    var el = $('#tvmap');
    if (!el || !m)
        return;
    el.innerHTML = ZTV.map(function (_a) {
        var _b = __read(_a, 3), k = _b[0], lb = _b[1], col = _b[2];
        var L = m.zones[k] || [];
        return "<div class=\"zcol\" style=\"border-color:".concat(col, "55\"><div class=\"zh\" style=\"color:").concat(col, "\">").concat(esc(lb), " <span>").concat(L.length, "</span></div><div class=\"zb\">").concat(L.slice(0, 8).map(function (x, i) { return "<span class=\"zs\" style=\"background:".concat(col, "22;border-color:").concat(col, "88;animation-delay:").concat(i * 0.07, "s\">").concat(esc(x.s), "<small>").concat(x.c, "</small></span>"); }).join('') || '<span class="zempty">—</span>', "</div></div>");
    }).join('')
        + "<div class=\"znote\">\uD83D\uDD2D Busca empresas nuevas cada 6 horas".concat(m.exploredAt ? " \u00B7 \u00FAltima b\u00FAsqueda ".concat(timeAgo(m.exploredAt)) : '', ". El n\u00FAmero peque\u00F1o es qu\u00E9 tanto te conviene (0 a 100).</div>");
}
function tvLoto(votes, draws) {
    var el = $('#tvloto');
    if (!el)
        return;
    var cd = function (iso) { var ms = Date.parse(iso) - Date.now(); if (ms <= 0)
        return 'cerrado'; var h = Math.floor(ms / 3600e3), mi = Math.floor(ms % 3600e3 / 60e3); return h ? "".concat(h, " h ").concat(mi, " min") : "".concat(mi, " min"); };
    el.innerHTML = "<div class=\"draws\">".concat((draws || []).slice(0, 2).map(function (d) { return "<div class=\"dr\"><b>".concat(esc(d.game), "</b><span>cierra en <em data-cd=\"").concat(esc(d.closesAt), "\">").concat(cd(d.closesAt), "</em></span></div>"); }).join(''), "</div>\n    <div class=\"lv\">").concat((votes || []).slice(0, 3).map(function (v) { return "<div class=\"lvr\"><span class=\"lg\">".concat(esc(v.game), "<small>").concat(v.top.length, " n\u00FAmeros \u00B7 ").concat(v.voters, " m\u00E9todos votaron</small></span><span class=\"lb\">").concat(v.top.map(function (n, i) { var _a, _b, _c, _d; return "<span class=\"lbn\"><i style=\"animation-delay:".concat(i * 0.15, "s\">").concat(esc(n), "</i><small>").concat((_b = (_a = v.votes) === null || _a === void 0 ? void 0 : _a[i]) !== null && _b !== void 0 ? _b : '', " voto").concat(((_c = v.votes) === null || _c === void 0 ? void 0 : _c[i]) === 1 ? '' : 's').concat(((_d = v.probs) === null || _d === void 0 ? void 0 : _d[i]) != null ? " \u00B7 ".concat(v.probs[i], "%") : '', "</small></span>"); }).join(''), "</span></div>"); }).join('') || '<div class="zempty">Juntando resultados…</div>', "</div>\n    <div class=\"znote\">\uD83D\uDDF3\uFE0F Los n\u00FAmeros m\u00E1s votados por los m\u00E9todos. Cada n\u00FAmero tiene 3 de cada 100 de salir: JARVIS vigila trampas y no promete nada.</div>");
}
function tvIa(d) {
    var _a, _b, _c, _d, _e;
    var el = $('#tvia');
    if (!el)
        return;
    var you = d.account ? d.account.returnPct / 100 : null, ia = (_b = (_a = d.ia) === null || _a === void 0 ? void 0 : _a.returnPct) !== null && _b !== void 0 ? _b : null, mk = (_d = (_c = d.ia) === null || _c === void 0 ? void 0 : _c.market) !== null && _d !== void 0 ? _d : null;
    var vals = [['Tú', you, '#38d6f5'], ['La IA', ia, '#a98bff'], ['Mercado', mk, '#8a97b5']], mx = Math.max.apply(Math, __spreadArray([0.01], __read(vals.map(function (v) { return Math.abs(v[1] || 0); })), false));
    el.innerHTML = "<div class=\"bars3\">".concat(vals.map(function (_a) {
        var _b = __read(_a, 3), lb = _b[0], v = _b[1], col = _b[2];
        return "<div class=\"b3\"><div class=\"b3v\" style=\"color:".concat((v || 0) >= 0 ? '#2fd58a' : '#ff5d6c', "\">").concat(v == null ? '—' : "".concat(v >= 0 ? '+' : '').concat((v * 100).toFixed(2), "%"), "</div><div class=\"b3t\"><span style=\"height:").concat(Math.max(4, Math.abs(v || 0) / mx * 100), "%;background:linear-gradient(0deg,").concat(col, "33,").concat(col, ")\"></span></div><b>").concat(lb, "</b></div>");
    }).join(''), "</div>\n    <div class=\"znote\">").concat(((_e = d.ia) === null || _e === void 0 ? void 0 : _e.last) ? "\uD83E\uDD16 \u00DAltima decisi\u00F3n de la IA: <b>".concat(d.ia.last.side === 'buy' ? 'compró' : 'vendió', " ").concat(esc(d.ia.last.symbol), "</b> \u00B7 ").concat(esc(String(d.ia.last.reason || '').replace(/^IA (compra|vende): /, ''))) : '🤖 La IA invierte sola cuando la bolsa abre (lunes a viernes, 10:30 a.m. a 5 p.m.).', "</div>");
}
var tvThinkIdx = 0, tvThinkTimer = null;
function tvThink(list) {
    var el = $('#tvthink');
    if (!el || !list.length)
        return;
    window.__tvThoughts = list;
    if (tvThinkTimer)
        return;
    var step = function () {
        var L = window.__tvThoughts || [], t = L[tvThinkIdx++ % L.length];
        var box = $('#tvthink');
        if (!box || !t) {
            clearInterval(tvThinkTimer);
            tvThinkTimer = null;
            return;
        }
        var ICON = { bolsa: '📈', loto: '🎱', cuentas: '💼', idea: '🧪' }, TAG = { bolsa: 'Bolsa', loto: 'Lotería', cuentas: 'Mi dinero', idea: 'Investigando' };
        var title = t.kind === 'bolsa' ? "Estoy revisando ".concat(coName(t.sym)).concat(coName(t.sym) !== t.sym ? " (".concat(t.sym, ")") : '') : t.kind === 'loto' ? "Estoy revisando ".concat(t.title) : t.title;
        box.innerHTML = "<div class=\"tkh\"><span class=\"tk ".concat(t.kind, "\">").concat(ICON[t.kind] || '•', " ").concat(TAG[t.kind] || '', "</span><b>").concat(esc(title), "</b></div><span class=\"tt\"></span>").concat(t.verdict ? "<div class=\"tkv\" style=\"color:".concat(TVC[t.light] || '#fff', "\">Mi voto: ").concat(esc(t.verdict), "</div>") : '');
        var tt = box.querySelector('.tt');
        var n = 0;
        var ty = setInterval(function () { if (!tt.isConnected)
            return clearInterval(ty); tt.textContent = t.text.slice(0, n += 2); if (n >= t.text.length)
            clearInterval(ty); }, 24);
        tvAna(t);
    };
    step();
    tvThinkTimer = setInterval(step, 9000);
}
function tvAna(t) {
    var _a, _b;
    var el = $('#tvana');
    if (!el || t.kind !== 'bolsa')
        return;
    var c = (window.__tvRank || []).find(function (x) { return x.symbol === t.sym; });
    if (!c)
        return;
    el.innerHTML = "<div class=\"ana-h\">".concat(coBadge(c.symbol, 46), "<div><b>").concat(esc(coName(c.symbol)), "</b><div class=\"sub\">US$").concat((Number((_b = (_a = c.price) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : c.price) || 0).toFixed(2), " \u00B7 confianza ").concat(Math.round((c.confidence || 0) * 100), "%</div></div><span class=\"ana-v\" style=\"color:").concat(TVC[c.light], ";border-color:").concat(TVC[c.light], "\">").concat({ verde: 'Sí, invierte', amarillo: 'Invierte poco', rojo: 'No inviertas' }[c.light] || '', "</span></div>\n    <div class=\"ana-p\"><span>Le gana al mercado</span><div class=\"ana-dots\">").concat(Array.from({ length: 10 }, function (_, i) { var _a; return "<i class=\"".concat(i < Math.round(((_a = c.probBeat) !== null && _a !== void 0 ? _a : 0) * 10) ? 'on' : '', "\"></i>"); }).join(''), "</div><b>").concat(c.probBeat != null ? Math.round(c.probBeat * 10) + ' de 10' : '—', "</b></div>\n    <div class=\"ana-t\">").concat(esc(t.text.replace(/^Analizando [^:]+: /, '')), "</div>");
}
function tvRefresh() {
    return __awaiter(this, void 0, void 0, function () {
        var d, _a, a, prev, delta, up, k, pos, inv, CB, ex, L, fxr, U, net, evs, con, first, full_1, n_1, ty_1, alert, el_1;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 2, , 3]);
                    return [4, api('/api/tv')];
                case 1:
                    d = _e.sent();
                    return [3, 3];
                case 2:
                    _a = _e.sent();
                    return [2];
                case 3:
                    if (!$('#tv'))
                        return [2];
                    $('#tvm').innerHTML = d.motor.running ? '<b style="color:#2fd58a">● Motor activo</b>' : '<b>○ Motor en pausa</b>';
                    $('#tvmk').innerHTML = "Bolsa de NY: <b>".concat(d.marketOpen ? 'abierta' : 'cerrada', "</b>");
                    $('#tvai').innerHTML = "Gasto IA: <b>".concat(usd(d.ai.month), "</b> / ").concat(usd(d.ai.monthCap, 0));
                    $('#tvh').innerHTML = "".concat(esc(d.headline), "<small>").concat(esc(d.lotteryLine), "</small>");
                    a = d.account, prev = tvPrev;
                    delta = a.total - a.start, up = delta >= 0;
                    animNum($('#k-money'), prev ? prev.account.total : a.start, a.total, function (v) { return usd(v); });
                    $('#k-arrow').className = 'arrow ' + (up ? 'up' : 'dn');
                    $('#k-arrow').textContent = up ? '▲' : '▼';
                    $('#k-money-sub').innerHTML = "<span class=\"".concat(up ? 'up' : 'dn', "\">").concat(up ? '+' : '−').concat(usd(Math.abs(delta)).replace('−', ''), " (").concat(pct(a.returnPct, 2), ")</span> desde ").concat(usd(a.start, 0)).concat(a.fx ? " \u00B7 \u2248 RD$".concat(Math.round(a.total * a.fx).toLocaleString('es-DO')) : '');
                    if (prev && prev.account.total !== a.total) {
                        k = $('.kp.money');
                        k.classList.remove('flash-up', 'flash-dn');
                        void k.offsetWidth;
                        k.classList.add(a.total > prev.account.total ? 'flash-up' : 'flash-dn');
                    }
                    pos = d.positions || [], inv = pos.reduce(function (t, x) { return t + x.v; }, 0);
                    $('#k-pos').innerHTML = pos.length ? "Invertido ".concat(usd(inv, 0), " en ").concat(pos.slice(0, 3).map(function (x) { return "<span class=\"ps\">".concat(esc(x.s), "</span> <span class=\"").concat(x.pct >= 0 ? 'up' : 'dn', "\">").concat(x.pct >= 0 ? '+' : '').concat(x.pct, "%</span>"); }).join(' · ')) : 'Todavía no has comprado nada (todo en efectivo).';
                    CB = (_b = d.cuentas) === null || _b === void 0 ? void 0 : _b.bolsa;
                    if (CB) {
                        $('#k-ia').innerHTML = "".concat(usd(CB.total), " <span class=\"").concat(CB.gain >= 0 ? 'up' : 'dn', " kpct\">").concat(CB.gain >= 0 ? '+' : '').concat(CB.returnPct, "%</span>");
                        $('#k-ia-sub').innerHTML = CB.positions.length ? "invirti\u00F3 ".concat(usd(CB.invested, 0), " en ").concat(CB.positions.slice(0, 3).map(function (p) { return "<span class=\"ps\">".concat(esc(p.symbol), "</span>"); }).join(', ')).concat(CB.positions.length > 3 ? '…' : '', " \u00B7 efectivo ").concat(usd(CB.cash, 0)) : "todo en efectivo \u00B7 ".concat(CB.marketOpen ? 'buscando qué comprar' : 'compra cuando abra la bolsa');
                    }
                    else if (d.ia) {
                        $('#k-ia').innerHTML = "<span class=\"".concat(d.ia.returnPct >= 0 ? 'up' : 'dn', "\">").concat(d.ia.returnPct >= 0 ? '+' : '').concat((d.ia.returnPct * 100).toFixed(2), "%</span>");
                        $('#k-ia-sub').innerHTML = "".concat(usd(d.ia.total), " \u00B7 ").concat(d.ia.positions, " ").concat(d.ia.positions === 1 ? 'acción' : 'acciones').concat(d.ia.market != null ? " \u00B7 mercado ".concat((d.ia.market * 100).toFixed(2), "%") : '');
                    }
                    ex = d.exp || {};
                    $('#k-hit').textContent = ex.hitRate != null ? "".concat(Math.round(ex.hitRate * 10), "/10") : '—';
                    $('#k-hit-sub').textContent = (ex.n || 0) >= 50 ? "".concat(ex.n, " recomendaciones terminadas: ya son suficientes para confiar en este n\u00FAmero") : "".concat(ex.n || 0, " recomendaciones terminadas \u00B7 necesita 50 para estar seguro");
                    L = ex.lot || {};
                    fxr = ((_c = d.account) === null || _c === void 0 ? void 0 : _c.fx) || FX, U = function (v) { return "US$".concat(Math.abs(v / fxr).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }, net = (L.paid || 0) - (L.staked || 0);
                    $('#k-lot').innerHTML = L.settled ? "<span class=\"".concat(net >= 0 ? 'up' : 'dn', "\">").concat(net >= 0 ? '+' : '−').concat(U(net), "</span>") : 'US$0.00';
                    $('#k-lot-sub').innerHTML = "Jug\u00F3 ".concat(U(L.staked || 0), " \u00B7 gan\u00F3 ").concat(U(L.paid || 0), " \u00B7 ").concat(L.plays || 0, " jugadas (").concat(L.wins || 0, " premios)<br><span class=\"rdx\">\u2248 ").concat(net >= 0 ? '+' : '−', "RD$").concat(Math.abs(Math.round(net)).toLocaleString('en-US'), " en pesos</span>");
                    $('#k-ai').textContent = usd(d.ai.month, 2);
                    $('#k-ai-sub').textContent = "de ".concat(usd(d.ai.monthCap, 0), " de tope \u00B7 hoy ").concat(usd(d.ai.day, 3));
                    window.__tvRank = d.ranking || [];
                    tvThink(d.thoughts || []);
                    evs = d.activity.slice(0, 9);
                    con = $('#tvcon');
                    con.innerHTML = evs.map(function (e, i) { return "<div class=\"".concat(e.important ? 'imp' : '', "\"><time>").concat(hhmm(e.ts), "</time><span>").concat(e.agent ? "<span class=\"ag\">[".concat(esc((AGENTS[e.agent] || [e.agent])[0]), "]</span> ") : '', "<span class=\"tx\" data-full=\"").concat(esc(e.text), "\">").concat(i === 0 && e.id > tvLastId ? '' : esc(e.text), "</span>").concat(i === 0 ? '<span class="cursor"></span>' : '', "</span></div>"); }).join('');
                    first = con.querySelector('.tx');
                    if (first && !first.textContent) {
                        full_1 = first.dataset.full;
                        n_1 = 0;
                        ty_1 = setInterval(function () { if (!first.isConnected)
                            return clearInterval(ty_1); first.textContent = full_1.slice(0, ++n_1); if (n_1 >= full_1.length)
                            clearInterval(ty_1); }, 22);
                    }
                    alert = tvLastId && d.activity.find(function (e) { return e.id > tvLastId && e.important; });
                    if (alert) {
                        el_1 = document.createElement('div');
                        el_1.className = 'alert';
                        el_1.textContent = alert.text;
                        $('#tv').appendChild(el_1);
                        setTimeout(function () { return el_1.remove(); }, 7000);
                    }
                    tvLastId = Math.max.apply(Math, __spreadArray(__spreadArray([tvLastId], __read(d.activity.map(function (e) { return e.id; })), false), [0], false));
                    tvChart(d.chart);
                    $('#tvrank').innerHTML = d.ranking.length ? d.ranking.slice(0, 6).map(function (c, i) { var _a; return "<div class=\"rc\" style=\"animation-delay:".concat(i * 0.08, "s\"><div class=\"s\"><i style=\"background:").concat(TVC[c.light], ";box-shadow:0 0 12px ").concat(TVC[c.light], "\"></i><span class=\"nm\">").concat(esc(coName(c.symbol)), "</span><span class=\"c\">").concat(c.probBeat != null ? Math.round(c.probBeat * 10) + '/10' : '', "</span></div><div class=\"cbar\"><span style=\"width:").concat(Math.round(((_a = c.probBeat) !== null && _a !== void 0 ? _a : c.confidence) * 100), "%;background:").concat(TVC[c.light], "\"></span></div><p>").concat(esc(c.why || ''), "</p></div>"); }).join('') : '<div class="empty-tv">El ranking aparece cuando haya suficientes precios.</div>';
                    tvHasDebate = !!(d.debate && ((_d = d.debate.rounds) === null || _d === void 0 ? void 0 : _d.length));
                    tvDebate(d.debate);
                    tvAcct(d.cuentas);
                    tvMap(d.map);
                    tvLoto(d.votes, d.nextDraws);
                    tvIa(d);
                    tvWorkers(d.tasks);
                    tvLeague(d.league);
                    tvTicker(d.quotes || []);
                    tvPrev = d;
                    return [2];
            }
        });
    });
}
function addPwToggles(root) {
    (root || document).querySelectorAll('input[type="password"]:not([data-eye])').forEach(function (inp) {
        inp.setAttribute('data-eye', '1');
        var wrap = document.createElement('span');
        wrap.className = 'pwwrap';
        inp.parentNode.insertBefore(wrap, inp);
        wrap.appendChild(inp);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'eye';
        b.textContent = '👁';
        b.setAttribute('aria-label', 'Mostrar contraseña');
        b.title = 'Mostrar u ocultar la contraseña';
        b.onclick = function () { var show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.textContent = show ? '🙈' : '👁'; b.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña'); inp.focus(); };
        wrap.appendChild(b);
    });
}
try {
    new MutationObserver(function () { return addPwToggles(); }).observe(document.documentElement, { childList: true, subtree: true });
}
catch (_a) {
    setInterval(function () { return addPwToggles(); }, 1000);
}
function render() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, name, rest, arg, v, _b, e_16;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = __read((location.hash.slice(1) || 'inicio').split('/')), name = _a[0], rest = _a.slice(1);
                    arg = rest.join('/');
                    document.querySelectorAll('#tabs a').forEach(function (a) { return a.setAttribute('aria-current', a.getAttribute('href') === '#' + name ? 'page' : 'false'); });
                    if (name === 'tv') {
                        app.innerHTML = '';
                        return [2, tvOpen()];
                    }
                    tvClose();
                    v = views[name] || views.inicio;
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 5, , 6]);
                    _b = app;
                    return [4, v(decodeURIComponent(arg || ''))];
                case 2:
                    _b.innerHTML = _c.sent();
                    document.querySelectorAll('[data-go]').forEach(function (el) { return el.onclick = function () { return (location.hash = el.dataset.go); }; });
                    if (!v.after) return [3, 4];
                    return [4, v.after(decodeURIComponent(arg || ''))];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4:
                    bindDebateButtons();
                    try {
                        glossify(app);
                    }
                    catch (_d) { }
                    return [3, 6];
                case 5:
                    e_16 = _c.sent();
                    if (e_16.message !== 'Inicia sesión.')
                        app.innerHTML = "<div class=\"card msg err\">".concat(esc(e_16.message), "</div>");
                    return [3, 6];
                case 6:
                    window.scrollTo(0, 0);
                    return [2];
            }
        });
    });
}
function pulse() {
    return __awaiter(this, void 0, void 0, function () {
        var s, alive, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4, api('/api/status')];
                case 1:
                    s = _b.sent();
                    if (s.storage && !s.storage.persistent && !document.getElementById('nopersist'))
                        document.querySelector('main').insertAdjacentHTML('beforebegin', '<div id="nopersist" class="msg err" style="text-align:center;padding:10px;font-weight:700">⚠️ Falta el volumen en Railway: tus datos se borran en cada actualización. Agrega un volumen montado en /data.</div>');
                    alive = s.heartbeat && Date.now() - Date.parse(s.heartbeat) < 20 * 60e3;
                    $('#sys-dot').className = 'status-dot ' + (alive && s.ledger.ok ? 'on' : 'off');
                    $('#sys-text').textContent = alive ? (s.motor.running ? 'Trabajando' : 'En pausa') : 'Sin latido';
                    return [3, 3];
                case 2:
                    _a = _b.sent();
                    return [3, 3];
                case 3: return [2];
            }
        });
    });
}
function signForm(doc, d, id) {
    return "<div class=\"legaldoc\"><pre class=\"legaltext\">".concat(esc(d.text), "</pre></div>\n    <div class=\"grid g2\" style=\"gap:10px;margin-top:10px\"><label>Tu nombre completo<input id=\"").concat(id, "n\" maxlength=\"80\" autocomplete=\"name\" placeholder=\"Nombre y apellido\"></label>\n    <label>Tu c\u00E9dula (o pasaporte)<input id=\"").concat(id, "c\" maxlength=\"20\" inputmode=\"numeric\" placeholder=\"000-0000000-0\"></label></div>\n    <label class=\"chk\" style=\"margin-top:8px\"><input type=\"checkbox\" id=\"").concat(id, "a\"> Le\u00ED todo y acepto ").concat(doc === 'contrato' ? 'este contrato' : 'estos términos', ". Mi nombre y c\u00E9dula valen como mi firma.</label>\n    <button type=\"button\" class=\"btn\" id=\"").concat(id, "b\" style=\"margin-top:10px\">Firmar y aceptar</button><div class=\"msg\" id=\"").concat(id, "m\"></div>");
}
function bindSign(doc, id, done) {
    var _this = this;
    $("#".concat(id, "b")).onclick = function () { return __awaiter(_this, void 0, void 0, function () {
        var err_31;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4, api('/api/legal/accept', { method: 'POST', body: { doc: doc, fullName: $("#".concat(id, "n")).value, cedula: $("#".concat(id, "c")).value, agree: $("#".concat(id, "a")).checked } })];
                case 1:
                    _a.sent();
                    $("#".concat(id, "m")).className = 'msg ok';
                    $("#".concat(id, "m")).textContent = 'Firmado. Queda guardado.';
                    setTimeout(done, 700);
                    return [3, 3];
                case 2:
                    err_31 = _a.sent();
                    $("#".concat(id, "m")).className = 'msg err';
                    $("#".concat(id, "m")).textContent = err_31.message;
                    return [3, 3];
                case 3: return [2];
            }
        });
    }); };
}
function showTerms() {
    return __awaiter(this, void 0, void 0, function () {
        var L;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    $('#top').classList.add('hide');
                    return [4, api('/api/legal')];
                case 1:
                    L = _a.sent();
                    app.innerHTML = "<div class=\"center\" style=\"align-items:flex-start;padding-top:24px\"><section class=\"card\" style=\"max-width:820px;width:100%\"><h1 style=\"font-size:24px\">Antes de empezar</h1><p class=\"note\">Lee y acepta los t\u00E9rminos de uso de ".concat(esc(BRAND.name || 'JARVIS'), ". Es una sola vez.</p>").concat(signForm('terminos', L.terminos, 'tt'), "</section></div>");
                    bindSign('terminos', 'tt', function () { return boot(); });
                    return [2];
            }
        });
    });
}
function boot() {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4, loadBrand()];
                case 1:
                    _c.sent();
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4, api('/api/me')];
                case 3:
                    ME = _c.sent();
                    return [3, 5];
                case 4:
                    _a = _c.sent();
                    return [2];
                case 5:
                    if (ME.needsTerms)
                        return [2, showTerms()];
                    return [4, loadBudget()];
                case 6:
                    _c.sent();
                    applyUser();
                    if (ME.profile && !ME.profile.setup && !location.hash.startsWith('#perfil'))
                        location.hash = '#perfil';
                    $('#top').classList.remove('hide');
                    $('#nav-admin').classList.toggle('hide', ME.role !== 'admin');
                    (_b = $('#nav-estado')) === null || _b === void 0 ? void 0 : _b.classList.toggle('hide', ME.role !== 'admin');
                    if (window.JV_DEVICE === 'tv' && !sessionStorage.getItem('jv-tv-opened') && (!location.hash || location.hash === '#inicio')) {
                        try {
                            sessionStorage.setItem('jv-tv-opened', '1');
                        }
                        catch (_d) { }
                        location.hash = '#tv';
                    }
                    render();
                    pulse();
                    setInterval(pulse, 60000);
                    return [2];
            }
        });
    });
}
$('#theme').onclick = function () { var t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try {
    localStorage.setItem('jv-theme', t);
}
catch (_a) { } };
$('#logout').onclick = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    switch (_a.label) {
        case 0: return [4, api('/api/logout', { method: 'POST' }).catch(function () { })];
        case 1:
            _a.sent();
            showAuth();
            return [2];
    }
}); }); };
window.addEventListener('hashchange', function () { return ME && render(); });
if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('/sw.js').catch(function () { });
boot();

})();
