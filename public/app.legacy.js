/* JARVIS versión para navegadores viejos. Generado desde app.js (2ad4431b4bf19d10). No editar a mano: corre tools/build-legacy.sh */
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
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const esc = (v) => String(v != null ? v : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const usd = (v, d = 2) => v == null || isNaN(v) ? "\u2014" : (v < 0 ? "\u2212" : "") + "US$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const rd = (v) => v == null ? "\u2014" : "RD$" + Number(v).toLocaleString("es-DO", { maximumFractionDigits: 2 });
  const pct = (v, d = 1) => v == null || isNaN(v) ? "\u2014" : (v > 0 ? "+" : v < 0 ? "\u2212" : "") + Math.abs(v).toFixed(d) + "%";
  const cls = (v) => v > 0 ? "good" : v < 0 ? "bad" : "";
  const timeAgo = (iso) => {
    if (!iso) return "nunca";
    const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
    return m < 1 ? "ahora" : m < 60 ? "hace ".concat(m, " min") : m < 1440 ? "hace ".concat(Math.round(m / 60), " h") : "hace ".concat(Math.round(m / 1440), " d");
  };
  const hhmm = (iso) => new Date(iso).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit", hour12: false });
  const LIGHT = { verde: "S\xED, invierte", amarillo: "Invierte poco", rojo: "No inviertas", gris: "Igual que el azar" };
  let MYBUDGET = null;
  const STYLE_PCT = { conservador: { verde: 0.05, amarillo: 0.025, max: 0.1 }, equilibrado: { verde: 0.1, amarillo: 0.05, max: 0.2 }, arriesgado: { verde: 0.15, amarillo: 0.075, max: 0.25 } };
  const myStyle = () => {
    var _a;
    return STYLE_PCT[(_a = MYBUDGET == null ? void 0 : MYBUDGET.profile) == null ? void 0 : _a.style] || STYLE_PCT.equilibrado;
  };
  const baseAmt = (l) => {
    var _a;
    const B = (_a = MYBUDGET == null ? void 0 : MYBUDGET.usd) != null ? _a : 100, p = myStyle()[l] || 0;
    return l === "rojo" || !p ? 0 : Math.max(5, Math.round(B * p));
  };
  const VERDICT = new Proxy({}, { get: (_, l) => l === "verde" ? "S\xED, te recomiendo invertir ".concat(usd(baseAmt("verde"), 0)) : l === "amarillo" ? "Invierte poco: ".concat(usd(baseAmt("amarillo"), 0), ", con cuidado") : "No te recomiendo invertir ahora" });
  const scaleProj = (r, amt) => r ? __spreadProps(__spreadValues({}, r), { bad: r.bad * amt / 10, probable: r.probable * amt / 10, good: r.good * amt / 10 }) : r;
  async function loadBudget() {
    try {
      MYBUDGET = await api("/api/budget");
    } catch (e) {
      MYBUDGET = null;
    }
  }
  const light = (l) => '<span class="light '.concat(l, '"><i></i>').concat(LIGHT[l] || l, "</span>");
  const FACTOR = { tendencia: "C\xF3mo le va contra el mercado", historial: "Aciertos previos de JARVIS", empresa: "Salud de la empresa", riesgo: "Cu\xE1nto sube y baja", polemicas: "Noticias" };
  const STATUS = { en_desarrollo: "En desarrollo", en_prueba: "En prueba en vivo", en_evaluacion: "En evaluaci\xF3n", validada: "Validada (simulaci\xF3n)", no_validada: "No validada", en_revision: "En revisi\xF3n", retirada: "Retirada" };
  const GLOSS = {
    volatilidad: "Cu\xE1nto sube y baja el precio. M\xE1s volatilidad = m\xE1s riesgo.",
    "SPY": "Fondo que copia a las 500 empresas m\xE1s grandes de EE. UU. Es la referencia del mercado.",
    confianza: "Qu\xE9 tan respaldada est\xE1 la idea por datos y por el historial real de JARVIS. No es una garant\xEDa.",
    sem\u00E1foro: "Verde: buenas pruebas. Amarillo: hay dudas. Rojo: las razones en contra pesan m\xE1s.",
    "valor esperado": "Lo que devuelve en promedio cada apuesta a largo plazo, calculado con todas las combinaciones posibles.",
    acci\u00F3n: "Un pedacito de una empresa. Si a la empresa le va bien, el precio suele subir.",
    fondo: "Una canasta con muchas acciones. Repartir el dinero baja el riesgo.",
    "acci\xF3n fraccionada": "Comprar una parte de una acci\xF3n (por ejemplo, US$5 de una que cuesta US$500).",
    comisi\u00F3n: "Lo que cobra el br\xF3ker por operar. Muchos ya cobran US$0.",
    diferencial: "La peque\xF1a diferencia entre el precio de compra y el de venta. Es un costo escondido.",
    deslizamiento: "Cuando el precio cambia un poco entre que decides y se ejecuta la orden.",
    "ca\xEDda m\xE1xima": "Lo m\xE1s que lleg\xF3 a bajar el dinero desde su punto m\xE1s alto. Mide el susto que habr\xEDa que aguantar.",
    diversificar: "No poner todos los huevos en la misma canasta.",
    "prueba hist\xF3rica": "Probar una estrategia con datos del pasado, como si se hubiera usado en ese momento.",
    "prueba en vivo": "Probar con datos nuevos que la estrategia nunca vio. Es la prueba que m\xE1s vale.",
    "datos bajo llave": "Una parte del historial que JARVIS nunca usa para crear estrategias, solo para el examen final.",
    "pruebas m\xFAltiples": "Si pruebas cientos de ideas, alguna gana por suerte. JARVIS exige m\xE1s mientras m\xE1s prueba.",
    br\u00F3ker: "La empresa donde se compran y venden acciones de verdad (JARVIS nunca se conecta a uno con dinero real).",
    "pol\xE9mica": "Noticia que puede da\xF1ar a la empresa: demandas, fraudes, investigaciones, retiros de productos.",
    "tipo de cambio": "Cu\xE1ntos pesos dominicanos cuesta un d\xF3lar.",
    "fondo de emergencia": "Dinero guardado para imprevistos (3 a 6 meses de gastos). Va antes de invertir."
  };
  const term = (w, label = w) => '<abbr title="'.concat(esc(GLOSS[w] || ""), '" style="text-decoration:underline dotted;cursor:help">').concat(esc(label), "</abbr>");
  const PALETTES0 = { cian: { name: "Cian", dark: "#38d6f5", light: "#1a6dff" }, azul: { name: "Azul", dark: "#6fa0ff", light: "#1a4fd6" }, violeta: { name: "Violeta", dark: "#b39bff", light: "#6a46e8" }, dorado: { name: "Dorado", dark: "#ffc94d", light: "#9a6400" }, rosa: { name: "Rosa", dark: "#ff7cc8", light: "#c02a86" }, turquesa: { name: "Turquesa", dark: "#3ee6c4", light: "#00806a" } };
  let BRAND = { name: "JARVIS", tagline: "Tu investigador de bolsa y loter\xEDas", owner: "", color: "cian", hasLogo: false, v: 0, palette: PALETTES0.cian, palettes: PALETTES0 };
  const brandMark = (big = false) => BRAND.hasLogo ? '<img class="blogo'.concat(big ? " big" : "", '" src="/brand/logo?v=').concat(BRAND.v, '" alt="">') : '<span class="ring'.concat(big ? " big" : "", '"><i></i></span>');
  const brandName = () => '<span class="bname'.concat(BRAND.name.length <= 8 ? " wide" : "", '">').concat(esc(BRAND.name), "</span>");
  function applyBrand() {
    document.title = BRAND.name;
    document.querySelector(".top .logo").innerHTML = brandMark() + brandName();
    let st = document.getElementById("brand-css");
    if (!st) {
      st = document.createElement("style");
      st.id = "brand-css";
      document.head.appendChild(st);
    }
    const P = BRAND.palette;
    st.textContent = ":root{--accent:".concat(P.light, '}:root[data-theme="dark"]{--accent:').concat(P.dark, ";--glow:0 0 18px ").concat(P.dark, "59}.tv{--a:").concat(P.dark, "}");
    let ic = document.querySelector('link[rel="icon"]');
    if (ic) {
      ic.href = BRAND.hasLogo ? "/brand/logo?v=".concat(BRAND.v) : "/icon.svg";
      ic.type = BRAND.hasLogo ? "" : "image/svg+xml";
    }
  }
  async function loadBrand() {
    try {
      const b = await fetch("/api/brand").then((r) => r.json());
      if (b && b.name) BRAND = b;
    } catch (e) {
    }
    applyBrand();
  }
  const footLine = () => '<div class="foot">'.concat(esc(BRAND.name)).concat(BRAND.owner ? " \xB7 propiedad de ".concat(esc(BRAND.owner)) : "", " \xB7 Todo es dinero virtual. Estimaciones con pruebas, no promesas. La decisi\xF3n de invertir dinero real es tuya.</div>");
  const CO = { SPY: "El mercado (S&P 500)", VOO: "Fondo S&P 500", QQQ: "Fondo Nasdaq 100", MSFT: "Microsoft", AAPL: "Apple", NVDA: "NVIDIA", AMZN: "Amazon", TSLA: "Tesla", KO: "Coca-Cola", JPM: "JPMorgan", GOOGL: "Google", GOOG: "Google", META: "Meta (Facebook)", NFLX: "Netflix", DIS: "Disney", V: "Visa", MA: "Mastercard", WMT: "Walmart", COST: "Costco", PEP: "Pepsi", MCD: "McDonald's", NKE: "Nike", "BRK.B": "Berkshire Hathaway", JNJ: "Johnson & Johnson", PG: "Procter & Gamble", XOM: "ExxonMobil", AMD: "AMD", INTC: "Intel", BAC: "Bank of America", UNH: "UnitedHealth", HD: "Home Depot", ORCL: "Oracle", CRM: "Salesforce", ADBE: "Adobe", PYPL: "PayPal", UBER: "Uber", SBUX: "Starbucks", T: "AT&T", VZ: "Verizon", AVGO: "Broadcom", LLY: "Eli Lilly" };
  const coName = (s) => CO[s] || s;
  function coBadge(sym, size = 40) {
    let h = 0;
    for (const ch of String(sym)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const t = String(sym).replace(".", "").slice(0, 4);
    return '<span class="cob" style="--h:'.concat(h, ";width:").concat(size, "px;height:").concat(size, "px;font-size:").concat(Math.round(size * (t.length > 3 ? 0.27 : 0.34)), 'px">').concat(esc(t), "</span>");
  }
  const coCell = (sym, sub = "") => '<div class="coc">'.concat(coBadge(sym), "<div><b>").concat(esc(coName(sym)), '</b><div class="note">').concat(esc(sym)).concat(sub ? " \xB7 " + sub : "", "</div></div></div>");
  const AGENTS = { largo: ["Largo plazo", "var(--accent)"], corto: ["Corto plazo", "var(--violet)"], polemicas: ["Noticias", "var(--warn)"], loteria: ["Loter\xEDas", "var(--good)"] };
  function chanceDots(p, { what = "le gana al mercado", big = false } = {}) {
    if (p == null || isNaN(p)) return '<span class="note">\u2014</span>';
    if (p < 0.095) return '<div class="chance'.concat(big ? " big" : "", '"><div class="ct"><b>').concat(Math.max(1, Math.round(p * 100)), " de cada 100</b> veces ").concat(esc(what), "</div></div>");
    const n = Math.round(p * 10), col = p >= 0.55 ? "var(--good)" : p >= 0.45 ? "var(--warn)" : "var(--bad)";
    return '<div class="chance'.concat(big ? " big" : "", '" title="').concat(Math.round(p * 100), '%"><div class="dots">').concat(Array.from({ length: 10 }, (_, i) => "<i".concat(i < n ? ' style="background:'.concat(col, ";border-color:").concat(col, '"') : "", "></i>")).join(""), '</div><div class="ct"><b>').concat(n, " de cada 10</b> veces ").concat(esc(what), "</div></div>");
  }
  function moneyRange(base, r, { months = 6 } = {}) {
    if (!r) return '<span class="note">\u2014</span>';
    const lo = base + r.bad, mid = base + r.probable, hi = base + r.good, span = hi - lo || 1, x = (v) => Math.max(0, Math.min(100, (v - lo) / span * 100));
    return '<div class="mr"><div class="mr-v '.concat(cls(r.probable), '">').concat(usd(mid), '</div><div class="mr-bar"><span class="z" style="left:').concat(x(base), '%"></span><span class="m" style="left:').concat(x(mid), '%"></span></div><div class="note">entre ').concat(usd(lo), " y ").concat(usd(hi), " en ").concat(months, " meses</div></div>");
  }
  const humanDays = (d) => d == null ? "m\xE1s de un a\xF1o" : d <= 7 ? "".concat(Math.max(1, Math.round(d / 5)), " semana").concat(Math.round(d / 5) > 1 ? "s" : "") : d < 42 ? "".concat(Math.round(d / 5), " semanas") : "".concat(Math.round(d / 21), " mes").concat(Math.round(d / 21) > 1 ? "es" : "");
  function patience(t, lightName) {
    if (!t || lightName === "rojo") return "";
    if (t.immediate) return '<span class="pat fast">\u26A1 Puede ganar en semanas</span>';
    if (t.recommended) return '<span class="pat">\u23F3 D\xE9jala al menos '.concat(esc(t.recommended.label), "</span>");
    return '<span class="pat">\u23F3 D\xE9jala 1 a\xF1o o m\xE1s (sube y baja mucho)</span>';
  }
  const takeaway = (t) => t ? '<div class="takeaway"><b>En pocas palabras:</b> '.concat(t, "</div>") : "";
  async function api(path, opts = {}) {
    const res = await fetch(path, __spreadProps(__spreadValues({}, opts), { headers: { "Content-Type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : void 0 }));
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) {
      showAuth();
      throw new Error("Inicia sesi\xF3n.");
    }
    if (!res.ok) throw new Error(j.error || "Error");
    return j;
  }
  function shrinkImage(file) {
    return new Promise((ok, fail) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return fail(new Error("Usa una imagen PNG, JPG o WEBP."));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 512 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let d = c.toDataURL("image/png");
        if (d.length > 38e4) d = c.toDataURL("image/webp", 0.9);
        if (!d.startsWith("data:image/webp") || d.length > 38e4) d = d.length > 38e4 ? c.toDataURL("image/jpeg", 0.85) : d;
        d.length > 4e5 ? fail(new Error("La imagen sigue muy pesada; prueba con otra m\xE1s simple.")) : ok(d);
      };
      img.onerror = () => fail(new Error("No pude leer esa imagen."));
      img.src = url;
    });
  }
  function lineChart(points, { h = 200, color = "var(--accent)", bench = null, label = "" } = {}) {
    if (!(points == null ? void 0 : points.length)) return '<div class="empty">Sin datos de precios todav\xEDa.</div>';
    const W = 760, H = h, pad = 34, vals = points.map((p) => p[1]).concat(bench ? bench.map((p) => p[1]) : []);
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const x = (i) => pad + i / (points.length - 1 || 1) * (W - pad - 10), y = (v) => 10 + (1 - (v - min) / span) * (H - 40);
    const path = (pts) => pts.map((p, i) => "".concat(i ? "L" : "M").concat(x(i).toFixed(1), " ").concat(y(p[1]).toFixed(1))).join(" ");
    const ticks = [min, min + span / 2, max];
    const lastP = points.at(-1);
    const months = points.filter((p, i) => i % Math.ceil(points.length / 6) === 0);
    return '<svg viewBox="0 0 '.concat(W, " ").concat(H, '" width="100%" role="img" aria-label="').concat(esc(label), '">\n    ').concat(ticks.map((t) => '<line x1="'.concat(pad, '" x2="').concat(W - 10, '" y1="').concat(y(t), '" y2="').concat(y(t), '" stroke="var(--line)"/><text x="0" y="').concat(y(t) + 4, '" font-size="11" fill="var(--mute)">').concat(t >= 100 ? t.toFixed(0) : t.toFixed(2), "</text>")).join(""), "\n    ").concat(months.map((p) => {
      const i = points.indexOf(p);
      return '<text x="'.concat(x(i), '" y="').concat(H - 6, '" font-size="11" fill="var(--mute)">').concat(esc(p[0].slice(2, 7)), "</text>");
    }).join(""), '\n    <path d="').concat(path(points), " L").concat(x(points.length - 1), " ").concat(H - 30, " L").concat(x(0), " ").concat(H - 30, ' Z" fill="').concat(color, '" opacity=".10"/>\n    <path d="').concat(path(points), '" fill="none" stroke="').concat(color, '" stroke-width="2.5"/>\n    ').concat(bench ? '<path d="'.concat(path(bench), '" fill="none" stroke="var(--mute)" stroke-width="1.8" stroke-dasharray="6 5"/>') : "", '\n    <circle cx="').concat(x(points.length - 1), '" cy="').concat(y(lastP[1]), '" r="5" fill="').concat(color, '" stroke="var(--panel)" stroke-width="2"/>\n  </svg>');
  }
  function gauge(conf, cases, label = "Confianza", [hi, lo] = [0.66, 0.45]) {
    const a = Math.max(0.02, Math.min(0.98, conf)), ang = Math.PI * (1 - a), cx = 85, cy = 90, r = 70;
    const ex = cx + r * Math.cos(ang), ey = cy - r * Math.sin(ang);
    const col = conf >= hi ? "var(--good)" : conf >= lo ? "var(--warn)" : "var(--bad)";
    return '<div style="text-align:center"><svg width="170" height="100" viewBox="0 0 170 100" role="img" aria-label="Confianza '.concat(Math.round(conf * 100), '%">\n    <path d="M15 90 A70 70 0 0 1 155 90" fill="none" stroke="var(--panel2)" stroke-width="14" stroke-linecap="round"/>\n    <path d="M15 90 A70 70 0 0 1 ').concat(ex.toFixed(1), " ").concat(ey.toFixed(1), '" fill="none" stroke="').concat(col, '" stroke-width="14" stroke-linecap="round"/>\n    <text x="85" y="84" text-anchor="middle" fill="var(--ink)" font-size="28" font-weight="800">').concat(Math.round(conf * 100), '%</text></svg>\n    <div class="note" style="letter-spacing:.1em;text-transform:uppercase;font-weight:700;font-size:11px">').concat(label === "Confianza" ? term("confianza", "Confianza") : esc(label)).concat(cases ? " \xB7 ".concat(cases, " casos") : "", "</div></div>");
  }
  function whyBars(contribs) {
    const max = Math.max(...contribs.map((c) => Math.abs(c.contribution)), 1);
    return '<div class="why">'.concat(contribs.slice().sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).map((c) => '<div class="w"><span>'.concat(esc(FACTOR[c.factor] || c.factor), '</span><b class="').concat(cls(c.contribution), '" title="').concat(c.contribution, '">').concat(Math.abs(c.contribution) < 1 ? "Neutral" : c.contribution > 0 ? "A favor" : "En contra", '</b>\n    <div class="bar"><span style="width:').concat(Math.abs(c.contribution) / max * 100, "%;background:").concat(c.contribution >= 0 ? "var(--good)" : "var(--bad)", '"></span></div></div>')).join(""), "</div>");
  }
  function projBox(p, title) {
    if (!p) return '<div class="empty">Faltan datos para estimar.</div>';
    return '<div class="note" style="margin-bottom:8px">'.concat(esc(title), ' \xB7 <span class="tag est">Estimaci\xF3n</span> basada en ').concat(p.basedOnDays, ' d\xEDas reales</div>\n  <div class="mini3">\n    <div class="pbox"><div class="l">Caso malo</div><div class="v ').concat(cls(p.bad), '">').concat(usd(p.bad), '</div></div>\n    <div class="pbox"><div class="l">Lo probable</div><div class="v ').concat(cls(p.probable), '">').concat(usd(p.probable), '</div></div>\n    <div class="pbox"><div class="l">Caso bueno</div><div class="v ').concat(cls(p.good), '">').concat(usd(p.good), '</div></div>\n  </div><div class="note" style="margin-top:6px">Probabilidad de perder dinero: ').concat(Math.round(p.lossChance * 100), "%. No es una promesa.</div>");
  }
  function feed(items) {
    if (!(items == null ? void 0 : items.length)) return '<div class="empty">Todav\xEDa no hay actividad. Activa el motor en Ajustes.</div>';
    return '<div class="feed">'.concat(items.map((e) => '<div class="ev '.concat(e.important ? "imp" : "", '"><time>').concat(hhmm(e.ts), "</time><span>").concat(e.agent ? '<span class="ag" style="--ac:'.concat((AGENTS[e.agent] || [0, "var(--accent)"])[1], '">').concat(esc((AGENTS[e.agent] || [e.agent])[0]), "</span>") : "").concat(esc(e.text), "</span></div>")).join(""), "</div>");
  }
  function steps(list) {
    return '<div class="steps">'.concat(list.map((s, i) => '<div class="step"><i>'.concat(i + 1, "</i><div>").concat(esc(s.step), "<small>").concat(esc(s.note || ""), "</small></div></div>")).join(""), "</div>");
  }
  function todoFor(lightName) {
    if (lightName === "verde") return [{ step: "Invierte US$10 ahora", note: "Dentro de tu l\xEDmite por operaci\xF3n" }, { step: "Sal si cae 8%", note: "P\xE9rdida m\xE1xima: US$0.80" }];
    if (lightName === "amarillo") return [{ step: "Invierte US$5 ahora", note: "Entrada en dos partes por la duda" }, { step: "Otros US$5 en 2 semanas", note: "Solo si no sube m\xE1s de 5% ni aparece una pol\xE9mica" }, { step: "Sal si cae 8%", note: "P\xE9rdida m\xE1xima: US$0.80" }];
    return [{ step: "No compres por ahora", note: "Las razones en contra pesan m\xE1s" }, { step: "Queda en vigilancia", note: "JARVIS te avisa si cambia" }];
  }
  const ACC_KEY = "jv.accounts";
  function savedAccounts() {
    try {
      const a = JSON.parse(localStorage.getItem(ACC_KEY) || "[]");
      return Array.isArray(a) ? a.filter((x) => x && typeof x.u === "string").slice(0, 8) : [];
    } catch (e) {
      return [];
    }
  }
  function rememberAccount(u, name) {
    try {
      const a = savedAccounts().filter((x) => x.u.toLowerCase() !== u.toLowerCase());
      a.unshift({ u, name: name || u });
      localStorage.setItem(ACC_KEY, JSON.stringify(a.slice(0, 8)));
    } catch (e) {
    }
  }
  function forgetAccount(u) {
    try {
      localStorage.setItem(ACC_KEY, JSON.stringify(savedAccounts().filter((x) => x.u !== u)));
    } catch (e) {
    }
  }
  async function showAuth() {
    $("#top").classList.add("hide");
    const { needsSetup } = await fetch("/api/setup").then((r) => r.json());
    const accs = needsSetup ? [] : savedAccounts();
    app.innerHTML = '<div class="center"><form class="card auth form" id="auth">\n    <div class="auth-brand">'.concat(brandMark(true), '<div class="logo">').concat(brandName(), "</div>").concat(BRAND.tagline ? '<div class="note">'.concat(esc(BRAND.tagline), "</div>") : "").concat(BRAND.owner ? '<div class="owner">Programa privado de '.concat(esc(BRAND.owner), "</div>") : "", '</div>\n    <h1 style="text-align:center;font-size:20px">').concat(needsSetup ? "Crea tu cuenta de administrador" : accs.length ? "\xBFQui\xE9n entra?" : "Inicia sesi\xF3n", "</h1>\n    ").concat(needsSetup ? '<p class="note" style="text-align:center">Es la primera vez. Esta cuenta controla JARVIS y crea los usuarios de tus amigos.</p>' : "", "\n    ").concat(accs.length ? '<div class="accts" id="accs">'.concat(accs.map((x) => '<div class="acct-item"><button type="button" class="acct" data-u="'.concat(esc(x.u), '"><span class="acct-av">').concat(esc((x.name || x.u).trim().charAt(0).toUpperCase()), '</span><span class="acct-t"><b>').concat(esc(x.name || x.u), '</b><span class="note">').concat(esc(x.u), '</span></span></button><button type="button" class="acct-x" data-x="').concat(esc(x.u), '" title="Olvidar esta cuenta en este equipo" aria-label="Olvidar ').concat(esc(x.u), '">\xD7</button></div>')).join(""), '</div>\n      <button type="button" class="linkbtn" id="other">Entrar con otra cuenta</button>') : "", '\n    <div id="userbox"').concat(accs.length ? ' class="hide"' : "", '><label>Usuario<input id="u" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label></div>\n    <div id="passbox"').concat(accs.length ? ' class="hide"' : "", '>\n      <div id="who" class="note hide" style="text-align:center;margin-bottom:6px"></div>\n      <label>Contrase\xF1a<input id="p" name="password" type="password" autocomplete="').concat(needsSetup ? "new-password" : "current-password", '" required minlength="').concat(needsSetup ? 10 : 1, '"></label>\n      <label class="chk" style="margin-top:8px"><input type="checkbox" id="rem" checked> Recordar mi usuario en este equipo</label>\n      <div class="note" style="margin-top:4px">La contrase\xF1a la puede guardar tu iPhone (te lo ofrece al entrar) y despu\xE9s se pone sola con Face ID. Adem\xE1s, la sesi\xF3n dura 30 d\xEDas en este equipo.</div>\n      <button class="btn" style="margin-top:10px">').concat(needsSetup ? "Crear y entrar" : "Entrar", '</button>\n    </div><div class="msg err" id="am"></div>\n    ').concat(needsSetup ? "" : '<div class="tvbox"><button type="button" class="linkbtn" id="tvopen">\u{1F4FA} Entrar con c\xF3digo (TV)</button>\n      <div id="tvform" class="hide"><div class="note" style="text-align:center">En tu celular abre JARVIS \u2192 <b>Mi perfil</b> \u2192 <b>C\xF3digo para la TV</b>. Escribe aqu\xED ese c\xF3digo (4 n\xFAmeros y 2 letras).</div>\n      <input id="tvc" class="tvcode" maxlength="8" placeholder="1234 AB" autocomplete="off" autocapitalize="characters" spellcheck="false">\n      <button type="button" class="btn" id="tvgo" style="width:100%">Entrar</button></div></div>', "\n    </form></div>");
    const pick = (u) => {
      $("#u").value = u;
      $("#userbox").classList.add("hide");
      $("#passbox").classList.remove("hide");
      const a = accs.find((x) => x.u === u);
      $("#who").textContent = "Entrando como ".concat((a == null ? void 0 : a.name) || u);
      $("#who").classList.remove("hide");
      document.querySelectorAll(".acct").forEach((b) => b.classList.toggle("on", b.dataset.u === u));
      $("#p").focus();
    };
    document.querySelectorAll(".acct").forEach((b) => b.onclick = () => pick(b.dataset.u));
    document.querySelectorAll(".acct-x").forEach((b) => b.onclick = () => {
      forgetAccount(b.dataset.x);
      showAuth();
    });
    if ($("#other")) $("#other").onclick = () => {
      $("#u").value = "";
      $("#who").classList.add("hide");
      $("#userbox").classList.remove("hide");
      $("#passbox").classList.remove("hide");
      document.querySelectorAll(".acct").forEach((b) => b.classList.remove("on"));
      $("#u").focus();
    };
    if (accs.length === 1) pick(accs[0].u);
    if ($("#tvopen")) {
      $("#tvopen").onclick = () => {
        $("#tvform").classList.toggle("hide");
        $("#tvc").focus();
      };
      const tvGo = async () => {
        try {
          await api("/api/tvlogin", { method: "POST", body: { code: $("#tvc").value } });
          boot();
        } catch (err) {
          $("#am").textContent = err.message;
        }
      };
      $("#tvgo").onclick = tvGo;
      $("#tvc").onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          tvGo();
        }
      };
    }
    $("#auth").onsubmit = async (e) => {
      var _a, _b;
      e.preventDefault();
      try {
        const r = await api(needsSetup ? "/api/setup" : "/api/login", { method: "POST", body: { username: $("#u").value.trim(), password: $("#p").value } });
        if ($("#rem").checked) rememberAccount(((_a = r == null ? void 0 : r.user) == null ? void 0 : _a.username) || $("#u").value.trim(), (_b = r == null ? void 0 : r.user) == null ? void 0 : _b.displayName);
        else forgetAccount($("#u").value.trim());
        boot();
      } catch (err) {
        $("#am").textContent = err.message;
      }
    };
  }
  let ME = null;
  const views = {};
  const FOCUS_OPTS = [["corto", "\u26A1", "Ganar en semanas", "Corto plazo"], ["medio", "\u2696\uFE0F", "En unos meses", "Medio plazo"], ["largo", "\u{1F333}", "A largo plazo", "1 a\xF1o o m\xE1s"]];
  const focusShell = () => '<section class="card focuscard" id="focuscard"><h2>\u{1F3AF} \xBFQu\xE9 buscas ahora?</h2><div class="note">Toca una opci\xF3n y JARVIS se concentra en buscar lo mejor para ese plazo.</div><div class="fopts" id="fopts">'.concat(FOCUS_OPTS.map(([k, i, t, sub]) => '<button type="button" class="fopt" data-h="'.concat(k, '"><span class="fi">').concat(i, "</span><b>").concat(t, '</b><span class="note">').concat(sub, "</span></button>")).join(""), '</div><div id="fres" class="note" style="margin-top:10px">Cargando\u2026</div></section>');
  function focusPaint(f) {
    document.querySelectorAll(".fopt").forEach((b) => b.classList.toggle("on", b.dataset.h === f.horizon));
    const el = $("#fres");
    if (!el) return;
    const rows = f.top.map((t, i) => '<a class="frow" href="#analisis/'.concat(esc(t.symbol), '">').concat(coBadge(t.symbol, 34), '<div style="flex:1;min-width:0"><b>').concat(i + 1, ". ").concat(esc(coName(t.symbol)), '</b> <span class="note">').concat(esc(t.symbol), '</span><div class="note">Termin\xF3 ganando <b>').concat(Math.round(t.p * 10), " de cada 10 veces</b> ").concat(esc(f.when)).concat(t.median != null ? " \xB7 lo normal: ".concat(t.median >= 0 ? "+" : "").concat(Math.round(t.median * 100), "%") : "").concat(t.bad != null ? " \xB7 en un mal caso: ".concat(Math.round(t.bad * 100), "%") : "", '</div></div><span class="note">').concat(t.zone === "recomendada" ? "\u2705 Te recomiendo" : t.zone === "observacion" ? "\u{1F440} En observaci\xF3n" : "\u{1F50E} Explorando", "</span></a>")).join("");
    el.innerHTML = "".concat(f.searching ? '<div class="searching">\u{1F50E} JARVIS est\xE1 buscando m\xE1s opciones para esto ahora mismo\u2026 (unos minutos; te aviso en "Lo que pas\xF3")</div>' : "", "\n    ").concat(rows ? '<div style="margin:8px 0 4px"><b>Lo mejor si esperas '.concat(esc(f.when.replace(/^en /, "")), ", seg\xFAn la historia real:</b></div>").concat(rows, '<div class="note" style="margin-top:6px">"Termin\xF3 ganando" = cu\xE1ntas veces, en el pasado, quien compr\xF3 y esper\xF3 ese tiempo termin\xF3 con m\xE1s dinero. No es garant\xEDa.</div>') : "<div>Todav\xEDa no hay datos suficientes para este plazo. Toca el bot\xF3n y JARVIS se pone a buscar.</div>");
  }
  async function focusInit() {
    if (!$("#focuscard")) return;
    try {
      focusPaint(await api("/api/focus"));
    } catch (e) {
      $("#fres").textContent = e.message;
    }
    document.querySelectorAll(".fopt").forEach((b) => b.onclick = async () => {
      $("#fres").textContent = "Buscando\u2026";
      try {
        const f = await api("/api/focus", { method: "POST", body: { horizon: b.dataset.h } });
        focusPaint(f);
        if (MYBUDGET == null ? void 0 : MYBUDGET.profile) MYBUDGET.profile.horizon = f.horizon;
      } catch (e) {
        $("#fres").textContent = e.message;
      }
    });
  }
  views.inicio = async () => {
    var _a, _b;
    const h = await api("/api/home");
    const greens = h.ranking.filter((c) => c.light === "verde"), alerts = h.activity.filter((a) => a.important && Date.now() - Date.parse(a.ts) < 864e5).length;
    const best = h.myBest || greens[0] || h.ranking.find((c) => c.light === "amarillo");
    const p = h.predictions, leader = h.league[0];
    return '\n  <section class="hero">'.concat(best ? coBadge(best.symbol, 64) : '<span class="cob idle" style="width:64px;height:64px;font-size:26px">\u23F8</span>', '<div style="flex:1;min-width:0"><div class="tag">Hoy en 10 segundos</div>\n    <div class="big">').concat(best ? "Te recomiendo: ".concat(esc(coName(best.symbol)), " \u2192 ").concat(best.light === "verde" ? "invierte ".concat(usd(baseAmt("verde"), 0)) : "invierte poco (".concat(usd(baseAmt("amarillo"), 0), ")")) : "Hoy no te recomiendo invertir en ninguna: lo mejor es esperar", '</div>\n    <div class="sub">').concat(best ? "".concat(chanceDots(best.probBeat)).concat(patience(best.timing, best.light), ' <a href="#analisis/').concat(esc(best.symbol), '">Ver por qu\xE9 \u25B8</a> \xB7 <a href="#mapa">Ver mi mapa \u25B8</a>') : "Esperar tambi\xE9n es una decisi\xF3n. JARVIS sigue investigando y te avisa si algo cambia.", '</div>\n    <div class="note" style="margin-top:4px">Tu dinero de pr\xE1ctica: <b class="').concat(cls(h.account.returnPct), '">').concat(usd(h.account.total), " (").concat(pct(h.account.returnPct, 2), ")</b> \xB7 ").concat(alerts, " aviso").concat(alerts === 1 ? "" : "s", ' hoy</div></div>\n    <div class="pill">').concat(h.system.motor.running ? '<span class="status-dot on"></span><b>Trabajando</b>' : '<span class="status-dot"></span><b>En pausa</b>', "</div></section>\n  ").concat(focusShell(), '\n\n  <section class="grid g4">\n    <div class="card kpi" style="--c:var(--accent)"><div class="l">Tu dinero de pr\xE1ctica</div><div class="v">').concat(usd(h.account.total), '</div><div class="s"><span class="').concat(cls(h.account.returnPct), '">').concat(pct(h.account.returnPct, 2), "</span> desde ").concat(usd(h.account.start, 0)).concat(h.account.spy ? " \xB7 el ".concat(term("SPY", "mercado"), " hoy ").concat(pct(h.account.spy.changePct, 2)) : "", '</div></div>\n    <div class="card kpi" style="--c:var(--good)"><div class="l">JARVIS acierta</div><div class="v">').concat(p.hitRate != null ? Math.round(p.hitRate / 10) + " de 10" : "\u2014", '</div><div class="s">').concat(p.hits, " aciertos y ").concat(p.misses, " fallos (").concat(p.hitRate != null ? p.hitRate + "%" : "\u2014", ") \xB7 ").concat(p.pending, ' esperando resultado</div></div>\n    <div class="card kpi" style="--c:var(--warn)"><div class="l">Racha</div><div class="v">').concat(p.streak.current || 0, '</div><div class="s">').concat(p.streak.type ? p.streak.type === "acierto" ? "aciertos seguidos" : "fallos seguidos" : "sin datos", " \xB7 r\xE9cord ").concat(p.streak.bestHits, ' aciertos</div></div>\n    <div class="card kpi" style="--c:var(--violet)"><div class="l">Monedas del mejor agente</div><div class="v">').concat(leader ? leader.coins : 0, '</div><div class="s">').concat(leader ? esc(leader.name) : "\u2014").concat((leader == null ? void 0 : leader.week) != null ? " \xB7 ".concat(leader.week >= 0 ? "+" : "").concat(leader.week, " esta semana") : "", " \xB7 trampas: ").concat(h.cheats.length, "</div></div>\n  </section>\n\n  ").concat((ME == null ? void 0 : ME.role) === "admin" && h.setup.some((x) => !x.ok) ? '<details class="card setup"><summary><span class="prog-ring" style="--p:'.concat(Math.round(h.setup.filter((x) => x.ok).length / h.setup.length * 100), '"></span><b>Instalaci\xF3n: ').concat(h.setup.filter((x) => x.ok).length, " de ").concat(h.setup.length, ' pasos listos</b><span class="note">Toca para ver qu\xE9 falta (solo t\xFA lo ves)</span></summary>\n    <div class="grid g3" style="gap:10px;margin-top:12px">').concat(h.setup.map((x) => '<div class="pbox" style="opacity:'.concat(x.ok ? 0.6 : 1, '"><b class="').concat(x.ok ? "good" : "", '">').concat(x.ok ? "\u2713" : "\u25CB", " ").concat(esc(x.text), "</b>").concat(x.ok ? "" : '<div class="note">'.concat(esc(x.how), "</div>"), "</div>")).join(""), "</div></details>") : "", "\n  ").concat(oppCard(h.opportunities), '\n\n  <section class="grid split">\n    <div class="card"><h2>Ranking de hoy <a class="more" href="#recomendaciones">Ver todas \u25B8</a></h2>').concat(rankingTable(h.ranking, true), '</div>\n    <div class="card"><h2>Preg\xFAntale a JARVIS</h2>\n      <form class="ask" id="ask"><input id="q" placeholder="\xBFPor qu\xE9 me recomiendas Microsoft? \xBFC\xF3mo voy este mes?" maxlength="500"><button type="button" class="btn ghost" id="mic" title="Preguntar con la voz">\u{1F3A4}</button><button class="btn">Preguntar</button></form>\n      <label class="note" style="flex-direction:row;align-items:center;gap:6px;margin-top:6px"><input type="checkbox" id="speak" style="width:auto"> Leer la respuesta en voz alta</label>\n      <div id="ans"></div>\n      <h2 style="margin-top:18px">Qu\xE9 est\xE1 haciendo ahora</h2>').concat(feed(h.activity.slice(0, 12)), '</div>\n  </section>\n\n  <section class="grid g3">\n    <div class="card"><h2>Lo que aprendi\xF3 <a class="more" href="#aprendizaje">Detalle \u25B8</a></h2>\n      <div class="mini3">').concat(["en_prueba", "validada", "no_validada"].map((s) => '<div><div class="note">'.concat(STATUS[s], '</div><div style="font-size:24px;font-weight:800">').concat(h.learning.byStatus[s] || 0, "</div></div>")).join(""), '</div>\n      <div class="note" style="margin-top:8px">').concat(h.learning.experiments, " experimentos con datos bajo llave. ").concat(h.rankingStats.resolved ? "Recomendaciones calificadas: ".concat(h.rankingStats.hits, " de ").concat(h.rankingStats.resolved, " acertadas.") : "Las recomendaciones se califican a los 20 d\xEDas de bolsa.", '</div></div>\n    <div class="card"><h2>Liga de agentes <span class="more note">ganan monedas si ganan dinero</span></h2>').concat(h.league.map((a) => '<div class="w" style="margin-bottom:8px"><span>'.concat(esc(a.name), "</span><b>").concat(a.coins, '</b><div class="bar"><span style="width:').concat(Math.max(4, Math.min(100, 50 + a.coins * 2)), '%;background:linear-gradient(90deg,var(--violet),var(--accent))"></span></div></div>')).join(""), '</div>\n    <div class="card').concat(((_b = (_a = ME == null ? void 0 : ME.profile) == null ? void 0 : _a.interests) == null ? void 0 : _b.loterias) === false ? " hide" : "", '"><h2>Loter\xEDas RD <a class="more" href="#loterias">Ver \u25B8</a></h2>\n      <div class="mini3"><div><div class="note">Jugadas</div><b style="font-size:22px">').concat(h.lottery.stats.settled, '</b></div><div><div class="note">De cada RD$100 volvieron</div><b style="font-size:22px" class="').concat(h.lottery.stats.per100 != null && h.lottery.stats.per100 < 100 ? "bad" : "", '">').concat(h.lottery.stats.per100 != null ? rd(h.lottery.stats.per100) : "\u2014", '</b></div><div><div class="note">Lo normal a largo plazo</div><b style="font-size:22px">').concat(rd(h.lottery.expectedQuinielaPer100), '</b></div></div>\n      <div class="note" style="margin-top:8px">').concat(h.lottery.effort === "bajo" ? "Ning\xFAn m\xE9todo le gana al azar: esfuerzo reducido, prioridad a la bolsa." : "Probando m\xE9todos contra el azar en cada sorteo.", "</div></div>\n  </section>\n  ").concat(footLine());
  };
  views.inicio.after = () => {
    bindOpp();
    focusInit();
    $("#ask").onsubmit = async (e) => {
      e.preventDefault();
      const q = $("#q").value.trim();
      if (!q) return;
      $("#ans").innerHTML = '<div class="answer muted">Pensando\u2026</div>';
      try {
        const r = await api("/api/ask", { method: "POST", body: { question: q } });
        $("#ans").innerHTML = '<div class="answer">'.concat(esc(r.answer)).concat(r.provider ? '<div class="note" style="margin-top:6px">Respondi\xF3: '.concat(esc(r.provider), "</div>") : "", "</div>");
        if ($("#speak").checked && "speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(r.answer);
          u.lang = "es-ES";
          speechSynthesis.cancel();
          speechSynthesis.speak(u);
        }
      } catch (err) {
        $("#ans").innerHTML = '<div class="answer msg err">'.concat(esc(err.message), "</div>");
      }
    };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      $("#mic").title = "Tu navegador no permite dictar; usa Chrome o Safari.";
      $("#mic").disabled = true;
      return;
    }
    $("#mic").onclick = () => {
      const rec = new SR();
      rec.lang = "es-DO";
      rec.interimResults = true;
      $("#mic").textContent = "\u25CF Escuchando";
      $("#speak").checked = true;
      rec.onresult = (e) => {
        $("#q").value = [...e.results].map((x) => x[0].transcript).join("");
        if (e.results[e.results.length - 1].isFinal) $("#ask").requestSubmit();
      };
      rec.onend = () => {
        $("#mic").textContent = "\u{1F3A4}";
      };
      rec.onerror = (ev) => {
        $("#mic").textContent = "\u{1F3A4}";
        $("#ans").innerHTML = '<div class="answer msg err">No pude escuchar ('.concat(esc(ev.error), "). Revisa el permiso del micr\xF3fono.</div>");
      };
      rec.start();
    };
  };
  function oppCard(list) {
    if (!(list == null ? void 0 : list.length)) return "";
    return '<section class="card"><h2>\xBFCu\xE1nto puedes ganar? <span class="more note">estimaci\xF3n a '.concat(list[0].months, ' meses, con pruebas, no promesa</span></h2>\n    <div class="row" style="align-items:flex-end;margin-bottom:12px"><label style="width:220px">\xBFCu\xE1nto piensas invertir? (US$)<input id="oppamt" type="number" min="1" step="1" value="').concat(baseAmt("verde") || 10, '"></label>\n    <div class="note" style="flex:1">M\xEDnimo para entrar: <b>US$').concat(list[0].minimum, "</b>").concat(list[0].fixedCostUsd ? " \xB7 para que los costos (US$".concat(list[0].fixedCostUsd, ") no se coman la ganancia: <b>US$").concat(list[0].minimumWorth, "</b>") : "", '. Cambia el monto y los n\xFAmeros se recalculan.</div></div>\n    <div class="grid g3">').concat(list.map((o, i) => {
      var _a;
      return '<div class="pbox" style="padding:14px">\n      <div style="display:flex;align-items:center;gap:10px">'.concat(coBadge(o.symbol, 36), '<a href="#analisis/').concat(esc(o.symbol), '" style="font-size:18px;font-weight:800;color:var(--ink)">').concat(esc(coName(o.symbol)), '</a><span style="margin-left:auto">').concat(light(o.light), "</span></div>\n      ").concat(o.probBeat != null ? '<div style="margin-top:8px">'.concat(chanceDots(o.probBeat), "</div>") : "", '\n      <div style="margin:10px 0 4px;font-size:13px;color:var(--mute)">Lo m\xE1s probable que ganes</div>\n      <div style="display:flex;align-items:baseline;gap:10px"><span class="opp-v ').concat(cls(o.pct.probable), '" data-p="').concat(o.pct.probable, '" style="font-size:30px;font-weight:800"></span><span class="').concat(cls(o.pct.probable), '" style="font-weight:700">').concat(pct(o.pct.probable), '</span></div>\n      <div class="mini3" style="margin-top:8px"><div><div class="note">Caso malo</div><b class="opp-v ').concat(cls(o.pct.bad), '" data-p="').concat(o.pct.bad, '"></b><div class="note">').concat(pct(o.pct.bad), '</div></div>\n      <div><div class="note">Caso bueno</div><b class="opp-v ').concat(cls(o.pct.good), '" data-p="').concat(o.pct.good, '"></b><div class="note">').concat(pct(o.pct.good), '</div></div>\n      <div><div class="note">Chance de perder</div><b>').concat(Math.round(o.lossChance * 100), "%</b></div></div>\n      ").concat(o.timing ? '<div style="margin-top:10px">'.concat(patience(o.timing, o.light), ' <span class="note">').concat(((_a = o.timing.toTarget) == null ? void 0 : _a.median) != null ? "Subir 5% tard\xF3 normalmente ".concat(humanDays(o.timing.toTarget.median), ".") : "", "</span></div>") : "", '\n      <div class="note" style="margin-top:8px">').concat(esc(o.why), "</div></div>");
    }).join(""), "</div></section>");
  }
  function bindOpp() {
    const inp = $("#oppamt");
    if (!inp) return;
    const upd = () => {
      const a = Math.max(0, Number(inp.value) || 0);
      document.querySelectorAll(".opp-v").forEach((el) => {
        const v = a * Number(el.dataset.p) / 100;
        el.textContent = (v >= 0 ? "+" : "") + usd(v);
      });
    };
    inp.oninput = upd;
    upd();
  }
  function mainReason(c) {
    const w = (r) => {
      var _a, _b, _c;
      return (_c = (_b = (_a = c.contributions) == null ? void 0 : _a.find((x) => x.factor === r.factor)) == null ? void 0 : _b.contribution) != null ? _c : 0;
    };
    if (c.light === "rojo") return c.reasons.find((r) => r.factor === "calibracion") || c.reasons.slice().sort((a, b) => w(a) - w(b))[0];
    return c.reasons.filter((r) => r.factor !== "calibracion").sort((a, b) => w(b) - w(a))[0];
  }
  function rankingTable(list, compact = false) {
    if (!(list == null ? void 0 : list.length)) return '<div class="empty">El ranking aparece cuando JARVIS tenga precios de al menos 6 meses. Activa el motor o pulsa "Correr ciclo ahora" en Ajustes.</div>';
    return '<div class="tablewrap"><table class="rank"><tr><th>Empresa</th><th>\xBFInvierto?</th><th>\xBFQu\xE9 tan seguido gana?</th>'.concat(compact ? "" : "<th>Si pones ".concat(usd(baseAmt("verde"), 0), "</th>"), "<th></th></tr>\n  ").concat(list.map((c) => {
      var _a, _b, _c;
      return '<tr class="click" data-go="#analisis/'.concat(esc(c.symbol), '"><td>').concat(coCell(c.symbol, usd((_a = c.price) == null ? void 0 : _a.value)), "</td><td>").concat(light(c.light)).concat(compact ? '<div style="margin-top:6px">'.concat(patience(c.timing, c.light), "</div>") : '<div style="margin-top:6px;font-weight:700">'.concat(esc(VERDICT[c.light]), '</div><div class="note" style="max-width:260px">Porque: ').concat(esc(((_b = mainReason(c)) == null ? void 0 : _b.text) || ""), "</div>"), "</td>\n  <td>").concat(chanceDots(c.probBeat), "</td>\n  ").concat(compact ? "" : "<td>".concat(moneyRange(baseAmt("verde"), scaleProj((_c = c.projection) == null ? void 0 : _c.personal, baseAmt("verde"))), '<div style="margin-top:6px">').concat(patience(c.timing, c.light), "</div></td>"), '\n  <td class="r"><a class="btn ghost sm" href="#analisis/').concat(esc(c.symbol), '" onclick="event.stopPropagation()">Ver por qu\xE9 \u25B8</a>').concat(compact ? "" : c.debateId ? '<div style="margin-top:6px"><a href="#debate/'.concat(c.debateId, '" onclick="event.stopPropagation()" class="note">Debate de las IA \u25B8</a></div>') : (ME == null ? void 0 : ME.role) === "admin" && c.light !== "rojo" ? '<div style="margin-top:6px"><button class="btn ghost sm" data-debate="'.concat(esc(c.symbol), '">Que debatan las IA</button></div>') : "", "</td></tr>");
    }).join(""), "</table></div>");
  }
  const ZL = { recomendada: ["\u2705", "Te recomiendo", "good"], observacion: ["\u{1F440}", "En observaci\xF3n", "warn"], no_recomendada: ["\u26D4", "No te recomiendo", "bad"], candidata: ["\u{1F52D}", "Explorando", "mute"], descartada: ["\u{1F4E6}", "Fuera del mapa", "mute"] };
  function mapScatter(items) {
    const pts = items.filter((r) => {
      var _a, _b;
      return ((_b = (_a = r.card) == null ? void 0 : _a.projection) == null ? void 0 : _b.personal) && r.card.probBeat != null;
    });
    if (pts.length < 2) return "";
    const W = 760, H = 330, L = 56, R = 20, T = 20, B = 44;
    const ys = pts.map((r) => r.card.projection.personal.probable), ymin = Math.min(-0.5, ...ys) - 0.3, ymax = Math.max(0.5, ...ys) + 0.3;
    const x = (p) => L + (Math.max(0.3, Math.min(0.7, p)) - 0.3) / 0.4 * (W - L - R), y = (v) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
    const col = { recomendada: "var(--good)", observacion: "var(--warn)", no_recomendada: "var(--bad)" };
    return '<svg viewBox="0 0 '.concat(W, " ").concat(H, '" width="100%" role="img" aria-label="Mapa: chance de ganarle al mercado contra ganancia probable">\n    <rect x="').concat(x(0.5), '" y="').concat(T, '" width="').concat(W - R - x(0.5), '" height="').concat(y(0) - T, '" fill="var(--good-bg)" rx="10"/>\n    <rect x="').concat(L, '" y="').concat(y(0), '" width="').concat(x(0.5) - L, '" height="').concat(H - B - y(0), '" fill="var(--bad-bg)" rx="10"/>\n    <text x="').concat(W - R - 10, '" y="').concat(T + 18, '" text-anchor="end" font-size="13" font-weight="800" fill="var(--good)">\u2705 La mejor zona</text>\n    <text x="').concat(L + 10, '" y="').concat(H - B - 10, '" font-size="13" font-weight="800" fill="var(--bad)">\u26D4 Evitar</text>\n    <line x1="').concat(x(0.5), '" x2="').concat(x(0.5), '" y1="').concat(T, '" y2="').concat(H - B, '" stroke="var(--mute)" stroke-dasharray="4 4"/><line x1="').concat(L, '" x2="').concat(W - R, '" y1="').concat(y(0), '" y2="').concat(y(0), '" stroke="var(--mute)" stroke-dasharray="4 4"/>\n    <text x="').concat((L + W - R) / 2, '" y="').concat(H - 10, '" text-anchor="middle" font-size="12" fill="var(--mute)">\u2190 menos veces \xB7 De cada 10 veces, cu\xE1ntas le gana al mercado \xB7 m\xE1s veces \u2192</text>\n    <text x="14" y="').concat((T + H - B) / 2, '" font-size="12" fill="var(--mute)" transform="rotate(-90 14 ').concat((T + H - B) / 2, ')" text-anchor="middle">Ganancia probable con US$10 en 6 meses</text>\n    <text x="').concat(L - 6, '" y="').concat(y(0) + 4, '" text-anchor="end" font-size="11" fill="var(--mute)">US$0</text>\n    ').concat(pts.map((r) => {
      const p = r.card.projection.personal.probable;
      return '<a href="#analisis/'.concat(esc(r.symbol), '"><g><circle cx="').concat(x(r.card.probBeat), '" cy="').concat(y(p), '" r="20" fill="').concat(col[r.zone], '" opacity=".9" stroke="var(--panel)" stroke-width="3"><title>').concat(esc(coName(r.symbol)), ": ").concat(esc(r.verdict), " \xB7 ").concat(Math.round(r.card.probBeat * 10), " de 10 \xB7 ").concat(p >= 0 ? "+" : "").concat(usd(p), '</title></circle><text x="').concat(x(r.card.probBeat), '" y="').concat(y(p) + 4, '" text-anchor="middle" font-size="').concat(r.symbol.length > 3 ? 9.5 : 11, '" font-weight="800" fill="#fff">').concat(esc(r.symbol), "</text></g></a>");
    }).join(""), "\n  </svg>");
  }
  function mapCard(r, compact = false) {
    var _a, _b, _c;
    const [ic, , tone] = ZL[r.zone] || ZL.candidata;
    const verdict = r.zone === "candidata" || r.zone === "descartada" ? "Si estuviera en el mapa: ".concat(r.verdict.charAt(0).toLowerCase()).concat(r.verdict.slice(1)) : r.verdict;
    return '<div class="mcard '.concat(tone, '"><div class="mc-h">').concat(r.rank ? '<span class="rk">#'.concat(r.rank, "</span>") : "").concat(coBadge(r.symbol, 36), '<div style="min-width:0;flex:1"><b>').concat(esc(coName(r.symbol)), '</b><div class="note">').concat(esc(r.symbol)).concat(((_a = r.card.price) == null ? void 0 : _a.value) ? " \xB7 " + usd(r.card.price.value) : "", "</div></div>").concat(r.trend ? '<span class="trend '.concat(r.trend, '">').concat(r.trend === "sube" ? "\u2191 subi\xF3" : "\u2193 baj\xF3", "</span>") : "", '</div>\n    <div class="conv"><span style="width:').concat(Math.max(3, r.conv), '%"></span></div><div class="note">Qu\xE9 tanto te conviene: <b>').concat(r.conv, '/100</b></div>\n    <div class="mc-v ').concat(tone, '">').concat(ic, " ").concat(esc(verdict), '</div>\n    <div class="mc-s"><b>Por qu\xE9:</b><ul>').concat(r.why.map((w) => "<li>".concat(esc(w), "</li>")).join(""), "</ul></div>\n    ").concat(((_b = r.need) == null ? void 0 : _b.length) && r.zone !== "candidata" ? '<div class="mc-s"><b>Para que te la recomiende necesita:</b><ul>'.concat(r.need.map((w) => "<li>".concat(esc(w), "</li>")).join(""), "</ul></div>") : "", "\n    ").concat((r.zone === "recomendada" || r.zone === "observacion") && !compact ? '<div class="mc-s">\u23F3 '.concat(esc(r.hold), "</div>").concat(r.size ? '<div class="mc-s"><b>\xBFPuedo poner m\xE1s?</b> '.concat(esc(r.size.more), "</div>") : "") : "", "\n    ").concat(((_c = r.exitIf) == null ? void 0 : _c.length) && !compact && r.zone !== "candidata" ? '<div class="mc-s note"><b>La saco si:</b> '.concat(esc(r.exitIf[0]), "</div>") : "", '\n    <div class="mc-f note">').concat(r.zone === "no_recomendada" && r.reds ? "".concat(r.reds, " revisi\xF3n").concat(r.reds > 1 ? "es" : "", " seguida").concat(r.reds > 1 ? "s" : "", " aqu\xED \xB7 ") : "").concat(r.zone === "candidata" ? "estudiada ".concat(esc(r.checkedAt)) : "desde ".concat(esc(r.since))).concat(r.active ? ' \xB7 <a href="#analisis/'.concat(esc(r.symbol), '">An\xE1lisis completo \u25B8</a>') : "", "</div></div>");
  }
  views.mapa = async () => {
    var _a, _b;
    const m = await api("/api/map");
    const z = m.zones, act = [...z.recomendada, ...z.observacion, ...z.no_recomendada], b = m.best, e = m.explore;
    const worst = z.no_recomendada.slice().sort((x, y) => x.conv - y.conv)[0];
    const zname = (k) => (ZL[k] || ["", k])[1];
    const col = (k, list) => '<div class="mcol"><div class="mcol-h '.concat(ZL[k][2], '">').concat(ZL[k][0], " ").concat(ZL[k][1], ' <span class="note">(').concat(list.length, ")</span></div>").concat(list.length ? list.map((r) => mapCard(r)).join("") : '<div class="empty">'.concat(k === "recomendada" ? "Hoy ninguna cumple. JARVIS sigue buscando." : "Ninguna.", "</div>"), "</div>");
    return '<div><h1>Tu mapa de inversi\xF3n</h1><p class="sub">Ordenado para tu estilo: <b>'.concat(esc(m.styleLabel || "Equilibrado"), '</b> (<a href="#perfil">cambiar</a>). Todas las empresas que JARVIS sigue, de la que m\xE1s te conviene a la que menos. Las que no sirven no se olvidan: se revisan cada d\xEDa y, si aparece una mejor, la reemplaza.</p></div>\n  <section class="card explorer"><div class="ex-ic">\u{1F52D}</div><div><b>Explorando sin parar</b><div class="note">Ya estudi\xF3 <b>').concat(e.studied, "</b> de ").concat(e.pool, " empresas y fondos grandes de EE. UU.").concat(e.pending ? " \xB7 le faltan ".concat(e.pending) : "", " \xB7 busca m\xE1s cada ").concat(esc(e.every)).concat(e.lastAt ? " (la \xFAltima vez: ".concat(timeAgo(e.lastAt), ")") : "", ". Si una lleva ").concat(e.redStreak, ' revisiones seguidas en "No te recomiendo" y aparece otra mejor, la cambia; la que sale se vuelve a revisar cada ').concat(e.recheckDays, " d\xEDas.</div></div></section>\n  ").concat(b ? '<section class="card bestpick '.concat(ZL[b.zone][2], '"><div class="s10-h">Tu mejor opci\xF3n ahora</div><div class="bp">').concat(coBadge(b.symbol, 72), '<div style="flex:1;min-width:0"><div class="bp-v">').concat(esc(coName(b.symbol)), ": ").concat(esc(b.verdict), '</div>\n    <ul class="bp-l">').concat(b.why.map((w) => "<li>".concat(esc(w), "</li>")).join(""), "<li>\u23F3 ").concat(esc(b.hold), "</li>").concat(b.size ? "<li><b>\xBFPuedo poner m\xE1s?</b> ".concat(esc(b.size.more), "</li>") : "").concat(b.exitIf.map((w) => '<li class="note">'.concat(esc(w), "</li>")).join(""), '</ul></div>\n    <div class="bp-r">').concat(chanceDots(b.card.probBeat)).concat(moneyRange(((_a = b.size) == null ? void 0 : _a.usd) || 10, scaleProj(b.card.projection.personal, ((_b = b.size) == null ? void 0 : _b.usd) || 10)), '<a class="btn" href="#analisis/').concat(esc(b.symbol), '">Ver el an\xE1lisis \u25B8</a></div></div></section>') : '<section class="card bestpick bad"><div class="bp-v">Hoy no te recomiendo invertir en ninguna.</div><div class="note">Esperar tambi\xE9n es una decisi\xF3n. JARVIS sigue explorando y te avisa al celular cuando una suba a "Te recomiendo".</div></section>', '\n  <section class="card"><h2>El mapa de un vistazo</h2>').concat(takeaway("cada bolita es una empresa. Arriba a la derecha est\xE1 lo que m\xE1s te conviene: le gana al mercado m\xE1s veces y con US$10 lo probable es ganar."), '<div class="scatterwrap">').concat(mapScatter(act), '</div>\n    <div class="legend"><span><i style="background:var(--good)"></i>Te recomiendo</span><span><i style="background:var(--warn)"></i>En observaci\xF3n</span><span><i style="background:var(--bad)"></i>No te recomiendo</span><span>Toca una bolita para ver su an\xE1lisis</span></div></section>\n  <section class="mcols">').concat(col("recomendada", z.recomendada)).concat(col("observacion", z.observacion)).concat(col("no_recomendada", z.no_recomendada), '</section>\n  <section class="card"><h2>\u{1F52D} Explorando para reemplazar <span class="more note">las mejores que encontr\xF3 fuera del mapa</span></h2>\n    ').concat(z.candidata.length ? "".concat(takeaway(worst ? "si una de estas conviene m\xE1s que <b>".concat(esc(coName(worst.symbol)), "</b> (").concat(worst.conv, '/100) y esa sigue en "No te recomiendo", JARVIS hace el cambio.') : "entran al mapa cuando hay espacio y convienen m\xE1s."), '<div class="grid g3">').concat(z.candidata.slice(0, 6).map((r) => mapCard(r, true)).join(""), "</div>") : '<div class="empty">Todav\xEDa no ha explorado fuera del mapa. Empieza cuando el motor est\xE1 activo.</div>', "</section>\n  ").concat(z.descartada.length ? '<section class="card"><h2>Fuera del mapa <span class="more note">no se olvidan: se revisan cada '.concat(e.recheckDays, ' d\xEDas</span></h2><div class="grid g3">').concat(z.descartada.map((r) => '<div class="pbox"><div class="coc">'.concat(coBadge(r.symbol, 32), "<div><b>").concat(esc(coName(r.symbol)), '</b><div class="note">sali\xF3 el ').concat(esc(r.since), " \xB7 revisada ").concat(esc(r.checkedAt), '</div></div></div><div class="note" style="margin-top:6px">').concat(esc((m.moves.find((x) => x.symbol === r.symbol && x.to_zone === "descartada") || {}).reason || r.verdict), "</div></div>")).join(""), "</div></section>") : "", '\n  <section class="card"><h2>Movimientos recientes <span class="more note">sellados: no se pueden borrar</span></h2>').concat(m.moves.length ? '<div class="moves">'.concat(m.moves.slice(0, 20).map((x) => '<div class="mv"><time>'.concat(esc(String(x.ts).slice(0, 10)), "</time><b>").concat(esc(coName(x.symbol)), '</b><span class="mv-z">').concat(x.from_zone ? esc(zname(x.from_zone)) + " \u2192 " : "").concat(esc(zname(x.to_zone)), '</span><span class="note">').concat(esc(x.reason), "</span></div>")).join(""), "</div>") : '<div class="empty">Sin movimientos todav\xEDa.</div>', "</section>");
  };
  const HZ = [[5, "1 semana"], [21, "1 mes"], [63, "3 meses"], [126, "6 meses"], [252, "1 a\xF1o"]];
  views.buscar = async () => {
    const b = MYBUDGET || { usd: 100 };
    return '<div><h1>Buscar a mi medida</h1><p class="sub">Dile a JARVIS qu\xE9 tan seguro lo quieres, en cu\xE1nto tiempo y cu\xE1nto vas a poner. Busca entre todas las empresas que ha estudiado y te dice cu\xE1les cumplen, con n\xFAmeros claros.</p></div>\n  <section class="card"><form class="form" id="ff">\n    <div><div class="note" style="margin-bottom:6px"><b>\xBFQu\xE9 tan seguro lo quieres?</b> (de cada 10 veces, cu\xE1ntas)</div>\n      <div class="row chips" id="fchips"><button type="button" class="btn ghost sm" data-r="8,10">Muy seguro (8 a 10)</button><button type="button" class="btn ghost sm" data-r="7,10">Seguro (7 a 10)</button><button type="button" class="btn ghost sm" data-r="5,7">Medio (5 a 7)</button><button type="button" class="btn ghost sm" data-r="4,5">Arriesgado (4 a 5)</button></div>\n      <div class="grid g2" style="gap:10px;margin-top:8px"><label>Desde (de cada 10)<input id="fmin" type="number" min="0" max="10" step="0.5" value="7"></label><label>Hasta (de cada 10)<input id="fmax" type="number" min="0" max="10" step="0.5" value="10"></label></div></div>\n    <div class="grid g3" style="gap:10px">\n      <label>Que sea la chance de\u2026<select id="fmet"><option value="ganar">terminar ganando dinero</option><option value="mercado">ganarle al mercado</option></select></label>\n      <label>\xBFEn cu\xE1nto tiempo?<select id="fdays">'.concat(HZ.map(([d, l]) => '<option value="'.concat(d, '"').concat(d === 252 ? " selected" : "", ">").concat(l, "</option>")).join(""), '</select></label>\n      <label>\xBFCu\xE1nto vas a poner? (US$)<input id="famt" type="number" min="1" step="1" value="').concat(baseAmt("verde"), '"></label>\n    </div>\n    <div class="grid g3" style="gap:10px">\n      <label>Lo m\xE1s que aguantas perder en un mal caso (%)<input id="floss" type="number" min="1" max="100" placeholder="Ej.: 10 (opcional)"></label>\n      <label>Buscar en<select id="fkind"><option value="todas">empresas y fondos</option><option value="empresas">solo empresas</option><option value="fondos">solo fondos</option></select></label>\n      <label style="flex-direction:row;align-items:center;gap:8px;padding-top:22px"><input type="checkbox" id="frec" style="width:auto"> Solo las que JARVIS recomienda</label>\n    </div>\n    <button class="btn">Buscar</button>\n    <div class="note">Tu dinero para invertir: <b>').concat(usd(b.usd, 0), '</b> (c\xE1mbialo en <a href="#bolsa">Mi cuenta</a>). Los n\xFAmeros salen de la historia real de cada acci\xF3n: no son promesas.</div>\n  </form></section>\n  <div id="fres"></div>');
  };
  views.buscar.after = () => {
    document.querySelectorAll("#fchips [data-r]").forEach((c) => c.onclick = () => {
      const [a, z] = c.dataset.r.split(",");
      $("#fmin").value = a;
      $("#fmax").value = z;
      document.querySelectorAll("#fchips button").forEach((x) => x.classList.toggle("ghost", x !== c));
    });
    $("#ff").onsubmit = async (e) => {
      e.preventDefault();
      $("#fres").innerHTML = '<div class="card muted">Buscando\u2026</div>';
      try {
        const r = await api("/api/finder", { method: "POST", body: { minP: Number($("#fmin").value) / 10, maxP: Number($("#fmax").value) / 10, metric: $("#fmet").value, days: Number($("#fdays").value), amount: Number($("#famt").value), maxLossPct: $("#floss").value, kind: $("#fkind").value, onlyRec: $("#frec").checked } });
        const q = r.query, card = (x, i) => {
          const z = ZL[x.zone] || ZL.candidata;
          return '<div class="mcard '.concat(z[2], '"><div class="mc-h"><span class="rk">').concat(i + 1, "</span>").concat(coBadge(x.symbol, 36), '<div style="flex:1;min-width:0"><b>').concat(esc(coName(x.symbol)), '</b><div class="note">').concat(esc(x.symbol), " \xB7 ").concat(esc(z[1]), '</div></div></div>\n        <div class="fr-p">').concat(chanceDots(x.p, { what: r.what === "le gan\xF3 al mercado" ? "le gan\xF3 al mercado en ".concat(r.label) : "termin\xF3 ganando en ".concat(r.label) }), '</div>\n        <div class="mini3 frm"><div class="pbox"><div class="l">Con ').concat(usd(q.amount, 0), ', lo normal</div><div class="v ').concat(cls(x.normalUsd), '">').concat(x.normalUsd != null ? (x.normalUsd >= 0 ? "+" : "") + usd(x.normalUsd) : "\u2014", '</div></div><div class="pbox"><div class="l">En un mal caso (1 de cada 10)</div><div class="v ').concat(cls(x.badUsd), '">').concat(x.badUsd != null ? (x.badUsd >= 0 ? "+" : "") + usd(x.badUsd) : "\u2014", "</div></div></div>\n        ").concat(x.zone === "recomendada" || x.zone === "observacion" ? '<div class="fit ok">\u2705 Cumple lo que pediste y JARVIS dice: '.concat(esc(x.verdict.charAt(0).toLowerCase() + x.verdict.slice(1)), ".</div>") : '<div class="fit no">\u26A0\uFE0F Cumple lo que pediste mirando el pasado, pero hoy JARVIS <b>no te la recomienda</b>: '.concat(esc(x.why[0] || ""), "</div>")).concat(x.active ? '<a class="note" href="#analisis/'.concat(esc(x.symbol), '">An\xE1lisis completo \u25B8</a>') : "", "</div>");
        };
        const bb = r.bigBet;
        r.matches.sort((x, y) => (["recomendada", "observacion"].includes(y.zone) ? 1 : 0) - (["recomendada", "observacion"].includes(x.zone) ? 1 : 0));
        const okN = r.matches.filter((x) => x.zone === "recomendada" || x.zone === "observacion").length;
        $("#fres").innerHTML = '<section class="card hsum" style="border-color:var(--'.concat(okN ? "good" : "warn", ')"><div class="hs-big">').concat(r.matches.length ? "Encontr\xE9 ".concat(r.matches.length, " que cumplen; ").concat(okN ? "JARVIS te recomienda ".concat(okN, " de ellas") : "pero JARVIS no te recomienda ninguna") : "Ninguna cumple exactamente lo que pediste", '</div><div class="hs-v">').concat(esc(r.honest)).concat(r.matches.length && okN < r.matches.length ? " Que antes casi siempre terminara ganando no basta: JARVIS tambi\xE9n mira c\xF3mo le va hoy contra el mercado, sus noticias y si ha acertado con ella." : "", "</div></section>\n        ").concat(r.matches.length ? '<section class="grid g3">'.concat(r.matches.slice(0, 9).map(card).join(""), "</section>") : r.closest.length ? '<section class="card"><h2>Lo m\xE1s cercano a lo que pediste</h2><div class="grid g3" style="margin-top:10px">'.concat(r.closest.map(card).join(""), "</div></section>") : "", '\n        <section class="card"><h2>Revisi\xF3n de tu apuesta de ').concat(usd(q.amount, 0), ' <span class="more note">').concat(bb.pctOfBudget, '% de tu dinero</span></h2>\n          <div class="answer" style="margin:10px 0;font-weight:700">').concat(esc(bb.verdict), '</div>\n          <div class="checks">').concat(bb.checks.map((c) => '<div class="ck '.concat(c.ok ? "ok" : "no", '">').concat(c.ok ? "\u2713" : "\u2715", " ").concat(esc(c.text), "</div>")).join(""), "</div>\n          ").concat(bb.worstUsd != null ? '<div class="note" style="margin-top:8px">En un mal caso (1 de cada 10 veces) con estas opciones podr\xEDas ver <b class="bad">'.concat(usd(bb.worstUsd), "</b> o m\xE1s.</div>") : "", "\n          ").concat(bb.parts.length ? '<h3 class="cs-h">C\xF3mo repartirla</h3><div class="tablewrap"><table><tr><th>D\xF3nde</th><th class="r">Parte</th><th class="r">Monto</th><th>Por qu\xE9</th></tr>'.concat(bb.parts.map((p) => "<tr><td>".concat(coCell(p.symbol), '</td><td class="r">').concat(p.pct, '%</td><td class="r"><b>').concat(usd(p.usd), '</b></td><td class="note">').concat(esc(p.why), "</td></tr>")).join(""), "</table></div>") : "", '\n          <h3 class="cs-h">C\xF3mo entrar sin apurarte</h3><div class="steps">').concat(bb.steps.map((s, i) => '<div class="step"><i>'.concat(i + 1, "</i><div>").concat(esc(s), "</div></div>")).join(""), "</div></section>");
        $("#fres").scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        $("#fres").innerHTML = '<div class="card msg err">'.concat(esc(err.message), "</div>");
      }
    };
  };
  views.perfil = async () => {
    const d = await api("/api/profile");
    const p = d.profile, first = !p.setup;
    const card = (group, key, o) => '<button type="button" class="opt'.concat((group === "style" ? p.style : p.horizon) === key ? " on" : "", '" data-g="').concat(group, '" data-k="').concat(key, '">').concat(o.icon ? '<span class="oi">'.concat(o.icon, "</span>") : "", "<b>").concat(esc(o.label), '</b><span class="note">').concat(esc(o.desc), "</span>").concat(o.pct ? '<span class="note">"S\xED, invierte" = '.concat(Math.round(o.pct.verde * 100), "% de tu dinero</span>") : "", "</button>");
    return "".concat(first ? '<section class="card welcome"><div class="s10-h">Bienvenido'.concat((ME == null ? void 0 : ME.displayName) ? ", " + esc(ME.displayName) : "", '</div><div class="bp-v">Cu\xE9ntale a JARVIS c\xF3mo eres</div><p class="note">El n\xFAcleo (la investigaci\xF3n, el mapa y el historial) es el mismo para todos. Esto solo cambia cu\xE1nto te sugiere poner y en qu\xE9 orden te muestra las opciones. Lo puedes cambiar cuando quieras.</p></section>') : '<div><h1>Mi perfil</h1><p class="sub">JARVIS se adapta a tu forma de invertir. Tu amigo tiene el suyo: cada uno ve lo mismo del n\xFAcleo, pero ordenado para s\xED.</p></div>', '\n  <section class="card tvcard"><h2>\u{1F4FA} C\xF3digo para la TV</h2><p class="note">Para entrar r\xE1pido en la TV o en otro equipo sin escribir tu usuario ni contrase\xF1a. En la TV toca <b>"Entrar con c\xF3digo (TV)"</b> y escribe este c\xF3digo. Sirve <b>10 minutos</b> y <b>una sola vez</b>.</p>\n    <div id="tvshow"></div><button type="button" class="btn" id="tvnew">Crear c\xF3digo</button></section>\n  <form id="pf" class="grid" style="gap:16px">\n    <section class="card"><h2>Tu nombre</h2><label style="max-width:360px;margin-top:8px">C\xF3mo quieres que te llame<input id="pn" maxlength="30" value="').concat(esc(d.displayName || ""), '"></label></section>\n    <section class="card"><h2>\xBFC\xF3mo eres con el riesgo?</h2><div class="opts" style="margin-top:10px">').concat(Object.entries(d.styles).map(([k, o]) => card("style", k, o)).join(""), '</div></section>\n    <section class="card"><h2>\xBFCu\xE1nto tiempo puedes dejar el dinero?</h2><div class="opts" style="margin-top:10px">').concat(Object.entries(d.horizons).map(([k, o]) => card("horizon", k, o)).join(""), '</div></section>\n    <section class="card"><h2>\xBFQu\xE9 te interesa?</h2><div class="row" style="gap:16px;margin-top:10px">\n      ').concat([["empresas", "Empresas (Apple, Microsoft\u2026)"], ["fondos", "Fondos (reparten el riesgo)"], ["loterias", "Loter\xEDas RD"]].map(([k, l]) => '<label class="chk"><input type="checkbox" data-int="'.concat(k, '"').concat(p.interests[k] ? " checked" : "", "> ").concat(l, "</label>")).join(""), '</div>\n      <div class="note" style="margin-top:6px">Lo que no te interese se oculta de tus pantallas. JARVIS lo sigue investigando para los dem\xE1s.</div></section>\n    <section class="card"><h2>Tu dinero</h2><div class="row" style="gap:12px;align-items:flex-end;margin-top:8px"><label style="width:220px">Dinero para invertir (US$)<input id="pbu" type="number" min="10" step="1" value="').concat(d.budget.usd, '"></label><label class="chk" style="padding-bottom:10px"><input type="checkbox" id="pbe"').concat(d.budget.emergency ? " checked" : "", '> Tengo fondo de emergencia aparte</label></div></section>\n    <section class="card"><h2>Tus avisos al celular</h2><label style="max-width:420px;margin-top:8px">Tu tema secreto en la app ntfy (opcional)<input id="pt" maxlength="64" value="').concat(esc(p.ntfyTopic || ""), '" placeholder="').concat(esc(((ME == null ? void 0 : ME.username) || "yo") + "-jarvis-7k2p"), '"></label>\n      <div class="note">Instala la app <b>ntfy</b>, suscr\xEDbete a ese nombre y te llegan tus avisos personales (por ejemplo, si tu inversi\xF3n real cae 8%). Nadie m\xE1s los ve.</div></section>\n    <section class="card summary10"><div class="s10-h">As\xED te va a recomendar JARVIS</div><div id="pline" style="font-size:16px;line-height:1.55">').concat(esc(d.line), '</div></section>\n    <button class="btn" style="max-width:420px">').concat(first ? "Guardar y empezar" : "Guardar mi perfil", '</button><div class="msg" id="pm"></div>\n  </form>\n  <section class="card"><h2>Cambiar mi contrase\xF1a</h2><form class="row" id="pwf" style="gap:12px;align-items:flex-end;margin-top:8px">\n    <label style="flex:1;min-width:200px">Contrase\xF1a actual<input id="pw0" type="password" autocomplete="current-password" required></label>\n    <label style="flex:1;min-width:200px">Contrase\xF1a nueva (10 o m\xE1s)<input id="pw1" type="password" autocomplete="new-password" minlength="10" required></label>\n    <button class="btn">Cambiar</button></form><div class="msg" id="pwm"></div></section>');
  };
  views.perfil.after = () => {
    var _a;
    let tvTick = null;
    $("#tvnew").onclick = async () => {
      try {
        const r = await api("/api/tvcode", { method: "POST" });
        clearInterval(tvTick);
        const paint = () => {
          const s = Math.max(0, Math.round((Date.parse(r.expiresAt) - Date.now()) / 1e3));
          if (!$("#tvshow")) return clearInterval(tvTick);
          $("#tvshow").innerHTML = s ? '<div class="tvbig">'.concat(esc(r.code), '</div><div class="note" style="text-align:center">Vence en ').concat(Math.floor(s / 60), ":").concat(String(s % 60).padStart(2, "0"), "</div>") : '<div class="note">Venci\xF3. Crea otro.</div>';
          if (!s) clearInterval(tvTick);
        };
        paint();
        tvTick = setInterval(paint, 1e3);
        $("#tvnew").textContent = "Crear otro c\xF3digo";
      } catch (err) {
        $("#tvshow").innerHTML = '<div class="msg err">'.concat(esc(err.message), "</div>");
      }
    };
    const sel = { style: null, horizon: null };
    document.querySelectorAll(".opt").forEach((b) => {
      if (b.classList.contains("on")) sel[b.dataset.g] = b.dataset.k;
      b.onclick = () => {
        sel[b.dataset.g] = b.dataset.k;
        document.querySelectorAll('.opt[data-g="'.concat(b.dataset.g, '"]')).forEach((x) => x.classList.toggle("on", x === b));
      };
    });
    $("#pf").onsubmit = async (e) => {
      e.preventDefault();
      const interests = {};
      document.querySelectorAll("[data-int]").forEach((c) => {
        interests[c.dataset.int] = c.checked;
      });
      try {
        const r = await api("/api/profile", { method: "POST", body: { displayName: $("#pn").value, style: sel.style, horizon: sel.horizon, interests, ntfyTopic: $("#pt").value, budget: { usd: Number($("#pbu").value), emergency: $("#pbe").checked } } });
        await loadBudget();
        ME = await api("/api/me");
        applyUser();
        $("#pline").textContent = r.line;
        $("#pm").className = "msg ok";
        $("#pm").textContent = "Guardado. JARVIS ya te muestra todo a tu manera.";
        if (location.hash === "#perfil" && !window.__wasSetup) setTimeout(() => {
          location.hash = "#inicio";
        }, 1200);
      } catch (err) {
        $("#pm").className = "msg err";
        $("#pm").textContent = err.message;
      }
    };
    window.__wasSetup = !!((_a = MYBUDGET == null ? void 0 : MYBUDGET.profile) == null ? void 0 : _a.setup);
    $("#pwf").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/me/password", { method: "POST", body: { current: $("#pw0").value, next: $("#pw1").value } });
        $("#pwm").className = "msg ok";
        $("#pwm").textContent = "Contrase\xF1a cambiada. Se cerraron tus otras sesiones.";
        $("#pw0").value = $("#pw1").value = "";
      } catch (err) {
        $("#pwm").className = "msg err";
        $("#pwm").textContent = err.message;
      }
    };
  };
  function applyUser() {
    var _a, _b;
    const chip = $("#mechip");
    if (chip) chip.textContent = "\u{1F464} " + ((ME == null ? void 0 : ME.displayName) || (ME == null ? void 0 : ME.username) || "");
    const lot = document.querySelector('#tabs a[href="#loterias"]');
    if (lot) lot.classList.toggle("hide", ((_b = (_a = ME == null ? void 0 : ME.profile) == null ? void 0 : _a.interests) == null ? void 0 : _b.loterias) === false);
  }
  views.recomendaciones = async () => {
    const r = await api("/api/ranking");
    return '<div><h1>Recomendaciones de hoy</h1><p class="sub">Las mejores arriba. Toca cualquier empresa para ver por qu\xE9, con gr\xE1ficos y pruebas.</p></div>\n  <div class="legend-big"><span>'.concat(light("verde"), " te la recomiendo: buenas pruebas a favor</span><span>").concat(light("amarillo"), " hay dudas: si entras, con poco</span><span>").concat(light("rojo"), ' no te la recomiendo (puede subir, pero probablemente menos que el mercado)</span><span><span class="chance mini"><span class="dots"><i style="background:var(--good);border-color:var(--good)"></i><i style="background:var(--good);border-color:var(--good)"></i><i></i></span></span> de cada 10 veces que JARVIS vio algo parecido, cu\xE1ntas le gan\xF3 al mercado</span></div>\n  <div class="card">').concat(rankingTable(r), '</div>\n  <a class="card mapcta" href="#mapa">\u{1F5FA}\uFE0F <b>Ver mi mapa</b> <span class="note">las que te recomiendo, las que vigila, las que no y las que est\xE1 explorando para reemplazarlas \u25B8</span></a>\n  <details class="card"><summary><b>\xBFC\xF3mo decide JARVIS?</b> <span class="note">toca para leer</span></summary><p class="note" style="margin-top:10px">Mira cinco cosas: c\xF3mo le va a la empresa contra el mercado, si JARVIS acert\xF3 antes con ella, la salud de la empresa seg\xFAn sus informes oficiales, cu\xE1nto sube y baja, y si hay noticias negativas. Cada recomendaci\xF3n queda sellada y a los 20 d\xEDas de bolsa se revisa si acert\xF3: as\xED el historial es real y nadie lo puede maquillar.</p></details>');
  };
  views.recomendaciones.after = bindDebateButtons;
  function bindDebateButtons() {
    document.querySelectorAll("[data-debate]").forEach((b) => b.onclick = async (ev) => {
      ev.stopPropagation();
      b.disabled = true;
      b.textContent = "Debatiendo\u2026";
      try {
        const d = await api("/api/debate/" + b.dataset.debate, { method: "POST" });
        location.hash = "#debate/" + d.id;
      } catch (e) {
        b.textContent = e.message.slice(0, 40);
      }
    });
  }
  views.empresa = async (sym) => {
    var _a, _b, _c;
    const d = await api("/api/stock/" + encodeURIComponent(sym));
    const c = d.card;
    const track = c == null ? void 0 : c.reasons.find((r) => r.factor === "historial");
    return '<div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap"><div><div class="note"><a href="#recomendaciones">Recomendaciones</a> \u203A '.concat(esc(d.symbol), '</div>\n    <h1 style="display:flex;align-items:center;gap:12px">').concat(coBadge(d.symbol, 44)).concat(esc(coName(d.symbol)), ' <span class="muted" style="font-size:16px;font-weight:600">').concat(d.quote ? usd(d.quote.price) + " \xB7 " + esc(d.quote.source) + " \xB7 " + timeAgo(d.quote.as_of) : "", '</span></h1></div>\n    <span class="pill">Precio: <b>').concat(esc(d.quoteStatus.label), '</b></span><a class="btn" href="#analisis/').concat(esc(d.symbol), '" style="margin-left:auto">\xBFPor qu\xE9? An\xE1lisis profundo \u25B8</a><button class="btn ghost" id="watch">+ Lista de vigilancia</button></div>\n  ').concat(c ? '<section class="card verdict" style="">'.concat(light(c.light), '\n    <div><div style="font-size:24px;font-weight:800">').concat(esc(VERDICT[c.light]), '</div><div class="sub">').concat(esc(((_a = c.reasons[0]) == null ? void 0 : _a.text) || ""), "</div></div>").concat(chanceDots(c.probBeat, { big: true }), "</section>") : '<div class="card empty">Esta empresa todav\xEDa no est\xE1 en el ranking de hoy.</div>', '\n  <section class="grid split">\n    <div class="card"><h2>Precio del \xFAltimo a\xF1o <span class="more note">Fuente: ').concat(esc(d.barsSource || "\u2014"), "</span></h2>").concat(lineChart(d.bars, { label: "Precio de " + d.symbol }), '</div>\n    <div class="card"><h2>Por qu\xE9 se decidi\xF3 as\xED</h2>').concat(c ? whyBars(c.contributions) : "", '<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">').concat(((c == null ? void 0 : c.reasons) || []).map((r) => '<div style="font-size:14px"><span class="tag '.concat(r.kind === "dato" ? "dato" : "opinion", '">').concat(r.kind === "dato" ? "Dato" : "Opini\xF3n", "</span> ").concat(esc(r.text), "</div>")).join(""), '</div></div>\n  </section>\n  <section class="grid g2">\n    <div class="card"><h2>Qu\xE9 hacer, paso a paso</h2>').concat(c ? steps(todoFor(c.light)) : "", '</div>\n    <div class="card"><h2>Cu\xE1nto podr\xEDas ganar o perder</h2>').concat(c ? projBox((_b = c.projection) == null ? void 0 : _b.personal, "Con US$10 en 6 meses") + '<div style="height:12px"></div>' + projBox((_c = c.projection) == null ? void 0 : _c.ejemplo, "Con US$200 en 6 meses") : "", '</div>\n  </section>\n  <section class="grid g2">\n    <div class="card"><h2>Informes oficiales (SEC)</h2>').concat(d.facts.length ? '<table><tr><th>Dato</th><th>Periodo</th><th class="r">Valor</th></tr>'.concat(d.facts.sort((a, b) => a.metric + b.period < b.metric + a.period ? -1 : 1).map((f) => "<tr><td>".concat(esc(f.metric.replace(/_/g, " ")), "</td><td>").concat(esc(f.period), '</td><td class="r">').concat(usd(f.value / 1e9, 1), " mil M</td></tr>")).join(""), '</table><div class="note">Fuente: SEC EDGAR (informes 10-K)</div>') : '<div class="empty">Sin informes cargados (los fondos como SPY no presentan estos informes).</div>', '</div>\n    <div class="card"><h2>Noticias y pol\xE9micas</h2>').concat(d.news.length ? d.news.map((n) => '<div style="padding:8px 0;border-top:1px solid var(--line)">'.concat(n.polemic >= 2 ? '<span class="tag" style="background:var(--bad-bg);color:var(--bad)">Pol\xE9mica'.concat(n.verified ? " confirmada" : "", "</span> ") : "", '<a href="').concat(esc(n.url), '" target="_blank" rel="noopener">').concat(esc(n.title), '</a><div class="note">').concat(esc(n.summary || ""), " \xB7 ").concat(esc(n.source), " \xB7 ").concat(timeAgo(n.published_at), "</div></div>")).join("") : '<div class="empty">Sin noticias todav\xEDa.</div>', '</div>\n  </section>\n  <section class="grid g2">\n    <div class="card"><h2>Historial de JARVIS con ').concat(esc(d.symbol), "</h2>").concat(d.history.length ? "<table><tr><th>Fecha</th><th>Dijo</th><th>Resultado</th></tr>".concat(d.history.map((x) => "<tr><td>".concat(esc(x.sealedAt.slice(0, 10)), "</td><td>").concat(light(x.light), "</td><td>").concat(x.correct == null ? '<span class="note">Pendiente</span>' : x.correct ? '<span class="good">\u2713 Acert\xF3</span> <span class="note">'.concat(pct(x.outcome.excess * 100, 1), " vs mercado</span>") : '<span class="bad">\u2715 Fall\xF3</span> <span class="note">'.concat(pct(x.outcome.excess * 100, 1), " vs mercado</span>"), "</td></tr>")).join(""), "</table>") : '<div class="empty">Todav\xEDa no hay recomendaciones calificadas.</div>', '</div>\n    <div class="card"><h2>Comentarios</h2><div id="cm"></div><form class="ask" id="cmf" style="margin-top:10px"><input id="cmt" placeholder="Escribe tu opini\xF3n para el grupo\u2026" maxlength="1000"><button class="btn">Enviar</button></form></div>\n  </section>');
  };
  views.empresa.after = async (sym) => {
    const load = async () => {
      const c = await api("/api/comments?subject=" + encodeURIComponent("stock:" + sym));
      $("#cm").innerHTML = c.length ? c.map((x) => '<div style="padding:6px 0;border-top:1px solid var(--line)"><b>'.concat(esc(x.username), '</b> <span class="note">').concat(timeAgo(x.ts), "</span><div>").concat(esc(x.body), "</div></div>")).join("") : '<div class="empty">Sin comentarios todav\xEDa.</div>';
    };
    await load();
    $("#cmf").onsubmit = async (e) => {
      e.preventDefault();
      await api("/api/comments", { method: "POST", body: { subject: "stock:" + sym, body: $("#cmt").value } });
      $("#cmt").value = "";
      load();
    };
    $("#watch").onclick = async () => {
      await api("/api/watchlist", { method: "POST", body: { symbol: sym } });
      $("#watch").textContent = "\u2713 En tu lista";
    };
  };
  views.debate = async (id) => {
    var _a;
    const d = await api("/api/debate/" + id);
    const v = d.verdict, c = d.card;
    const bubble = (m, side) => {
      var _a2;
      return m.failed ? '<div class="bub"><b>'.concat(esc(m.who), '</b><p class="note">No respondi\xF3: ').concat(esc(m.reason), "</p></div>") : '<div class="bub '.concat(side, '"><div class="who">').concat(esc(m.who), ' <span class="note">\xB7 ').concat(esc(m.label), '</span><span class="stance">').concat(esc(m.stance.replace("_", " ")), "</span></div><p>").concat(esc(m.text), '</p>\n    <div style="display:flex;gap:6px;flex-wrap:wrap">').concat((m.evidence || []).map((e) => '<span class="tag '.concat(e.kind === "dato" ? "dato" : "opinion", '">').concat(e.kind === "dato" ? "Dato" : "Opini\xF3n IA", "</span>").concat(e.source ? '<span class="src ok">'.concat(esc(e.source), "</span>") : "")).join(" "), "</div>\n    ").concat(((_a2 = m.evidence) == null ? void 0 : _a2.length) ? "<details><summary>m\xE1s \u25B8</summary>".concat(m.evidence.map((e) => '<div class="note">\u2022 '.concat(esc(e.text), "</div>")).join(""), "</details>") : "", "</div>");
    };
    return '<div><div class="note"><a href="#recomendaciones">Recomendaciones</a> \u203A Debate</div><h1>'.concat(esc(d.subject), ' <span class="muted" style="font-size:15px">\xB7 ').concat(d.rounds.length, " rondas \xB7 costo ").concat(usd(d.cost_usd, 3), " \xB7 sellado ").concat(esc(d.created_at.slice(0, 16).replace("T", " ")), '</span></h1></div>\n  <section class="card verdict" style=";border-color:var(--').concat(v.light === "verde" ? "good" : v.light === "amarillo" ? "warn" : "bad", ')">').concat(light(v.light), '\n    <div><div class="note" style="text-transform:uppercase;letter-spacing:.12em;font-weight:800">Decisi\xF3n final</div><div style="font-size:26px;font-weight:800">').concat(esc(v.title), '</div><div class="sub">').concat(esc(v.notes.join(" ")), '</div><div class="note">Basada en: ').concat(esc(v.basedOn), "</div></div>").concat(gauge(v.confidence), '</section>\n  <section class="grid split">\n    <div class="card"><h2>C\xF3mo debatieron</h2>').concat(d.rounds.length ? d.rounds.map((r) => '<div class="round"><i>Ronda '.concat(r.round, "</i>").concat(esc(r.title), '</div><div class="bubbles">').concat(r.messages.map((m, i) => bubble(m, i ? "b" : "a")).join(""), "</div>")).join("") : '<div class="empty">No hubo debate: IA no disponible o tope de gasto alcanzado. La decisi\xF3n usa solo datos e historial.</div>', '\n      <div class="grid g2" style="gap:10px;margin-top:8px"><div class="card" style="background:var(--').concat(v.agree ? "good" : "warn", '-bg);border-color:transparent"><b class="').concat(v.agree ? "good" : "warn", '">').concat(v.agree ? "\u2713 Coinciden" : "\u2715 No coinciden", '</b><div class="note">').concat(v.agree ? "Las dos IA llegaron a la misma postura final." : "Cada una mantuvo su postura: por eso la cautela.", '</div></div></div></div>\n    <div style="display:flex;flex-direction:column;gap:16px">\n      <div class="card"><h2>Por qu\xE9 se decidi\xF3 as\xED</h2>').concat(c ? whyBars(c.contributions) : '<div class="empty">\u2014</div>', '</div>\n      <div class="card"><h2>Qu\xE9 hacer, paso a paso</h2>').concat(steps(v.todo), '</div>\n      <div class="card"><h2>Con US$10 en 6 meses</h2>').concat(c ? projBox((_a = c.projection) == null ? void 0 : _a.personal, "Tu monto por operaci\xF3n") : "\u2014", "</div>\n    </div></section>");
  };
  function iaCompare(a, ia) {
    var _a, _b, _c, _d;
    const you = a.returnPct, iaR = (_a = ia == null ? void 0 : ia.returnPct) != null ? _a : null, mk = (_d = (_c = ia == null ? void 0 : ia.market) != null ? _c : (_b = a.compare) == null ? void 0 : _b.market) != null ? _d : null;
    const box = (icon, title, sub, v, extra) => '<div class="pbox vs"><div class="l">'.concat(icon, " <b>").concat(title, '</b></div><div class="note">').concat(sub, '</div><div class="v ').concat(cls(v), '">').concat(v != null ? pct(v * 100, 2) : "\u2014", "</div>").concat(extra || "", "</div>");
    return '<section class="card"><h2>\xBFQui\xE9n lo hace mejor? <span class="more note">dinero virtual, precios reales</span></h2>\n    <div class="mini3">'.concat(box("\u{1F9D1}", "T\xFA", "Tu cartera: decides t\xFA", you, '<div class="note">'.concat(usd(a.total), "</div>"))).concat(box("\u{1F916}", "La IA", "Cartera de JARVIS: decide sola", iaR, ia ? '<div class="note">'.concat(usd(ia.total), "</div>") : "")).concat(box("\u{1F4C8}", "No hacer nada", "Solo el mercado (SPY)", mk), '</div>\n    <div class="note" style="margin-top:8px">Son dos carteras <b>separadas</b>: lo que t\xFA compras no cambia la de la IA, ni al rev\xE9s. As\xED ves si las decisiones de JARVIS de verdad sirven.</div></section>\n  ').concat(ia ? '<section class="card iacard"><h2>\u{1F916} Cartera de la IA <span class="note" style="font-weight:600">\xB7 decide sola</span></h2>\n    <div class="grid g3" style="gap:10px;margin-top:8px"><div class="pbox"><div class="l">Valor</div><div class="v">'.concat(usd(ia.total), '</div><div class="note">empez\xF3 con ').concat(usd(ia.start, 0), '</div></div><div class="pbox"><div class="l">Efectivo</div><div class="v">').concat(usd(ia.cash), '</div></div><div class="pbox"><div class="l">Ganancia ya cerrada</div><div class="v ').concat(cls(ia.realized), '">').concat(usd(ia.realized), '</div><div class="note">').concat(ia.closed, " ").concat(ia.closed === 1 ? "operaci\xF3n cerrada" : "operaciones cerradas", '</div></div></div>\n    <h3 style="margin-top:14px">Lo que tiene ahora</h3>').concat(ia.positions.length ? '<div class="tablewrap"><table><tr><th>Acci\xF3n</th><th class="r">Vale</th><th class="r">Ganancia</th></tr>'.concat(ia.positions.map((p) => "<tr><td>".concat(coCell(p.symbol), '</td><td class="r">').concat(usd(p.value), '</td><td class="r ').concat(cls(p.pnl), '">').concat(usd(p.pnl), ' <span class="note">').concat(pct(p.pnlPct * 100), "</span></td></tr>")).join(""), "</table></div>") : '<div class="empty">Todav\xEDa no ha comprado nada. Compra sola cuando el mercado est\xE1 abierto y hay acciones en "Te recomiendo".</div>', '\n    <h3 style="margin-top:14px">Lo que decidi\xF3 y por qu\xE9</h3>').concat(ia.trades.length ? '<div class="iatl">'.concat(ia.trades.slice(0, 12).map((t) => '<div class="iarow"><b class="'.concat(t.side === "buy" ? "good" : "bad", '">').concat(t.side === "buy" ? "Compr\xF3" : "Vendi\xF3", " ").concat(esc(t.symbol), "</b> \xB7 ").concat(usd(t.usd), ' \xB7 <span class="note">').concat(esc(t.ts.slice(0, 10)), '</span><div class="note">').concat(esc(String(t.reason || "").replace(/^IA (compra|vende): /, "")), "</div></div>")).join(""), "</div>") : '<div class="empty">A\xFAn no ha hecho operaciones.</div>', '\n    <details class="note" style="margin-top:10px"><summary>Las reglas de la IA</summary><ul>').concat(ia.rules.map((x) => "<li>".concat(esc(x), "</li>")).join(""), "</ul></details></section>") : "");
  }
  views.bolsa = async () => {
    var _a;
    const [a, r, wl, ia] = await Promise.all([api("/api/account"), api("/api/ranking"), api("/api/watchlist"), api("/api/ia").catch(() => null)]);
    const syms = [.../* @__PURE__ */ new Set([...r.map((c) => c.symbol), ...wl, ...a.positions.map((p) => p.symbol)])];
    const B = a.budget || MYBUDGET || { usd: 100, emergency: true };
    return '<section class="card mymoney"><h2>Mi dinero <span class="more note">JARVIS calcula todo con este monto</span></h2>\n    <form class="row" id="bf" style="align-items:flex-end;gap:12px;margin-top:10px"><label style="width:220px">\xBFCu\xE1nto dinero tienes para invertir? (US$)<input id="bu" type="number" min="10" step="1" value="'.concat(B.usd, '"></label>\n      <label style="flex-direction:row;align-items:center;gap:8px;padding-bottom:10px"><input type="checkbox" id="be" style="width:auto"').concat(B.emergency ? " checked" : "", '> Ya tengo fondo de emergencia aparte</label><button class="btn">Guardar</button></form>\n    <div class="grid g3" style="gap:10px;margin-top:12px"><div class="pbox"><div class="l">"S\xED, invierte" (').concat(myStyle().verde * 100, '%)</div><div class="v good">').concat(usd(baseAmt("verde"), 0), '</div><div class="note">por idea</div></div><div class="pbox"><div class="l">"Invierte poco" (').concat(myStyle().amarillo * 100, '%)</div><div class="v warn">').concat(usd(baseAmt("amarillo"), 0), '</div><div class="note">por idea</div></div><div class="pbox"><div class="l">M\xE1ximo con pruebas fuertes (').concat(myStyle().max * 100, '%)</div><div class="v">').concat(usd(Math.round(B.usd * myStyle().max), 0), '</div><div class="note">solo si se cumplen las 5 condiciones</div></div></div>\n    <div class="note" style="margin-top:8px">Porcentajes seg\xFAn tu estilo (').concat(esc({ conservador: "conservador", equilibrado: "equilibrado", arriesgado: "arriesgado" }[(_a = MYBUDGET == null ? void 0 : MYBUDGET.profile) == null ? void 0 : _a.style] || "equilibrado"), '). <a href="#perfil">Cambiar mi estilo \u25B8</a></div>\n    <div class="row" style="margin-top:12px;gap:10px;align-items:center"><button type="button" class="btn ghost" id="breset">Empezar mi pr\xE1ctica con ').concat(usd(B.usd, 0), '</button><span class="note">Tu cuenta de pr\xE1ctica empieza con ').concat(usd(a.start, 0), '. Si la reinicias, la anterior queda guardada en el historial (no se borra).</span></div><div class="msg" id="bm"></div></section>\n  ').concat(iaCompare(a, ia), '\n  <div><h1>\u{1F9D1} Mi cartera virtual <span class="note" style="font-size:15px;font-weight:600">\xB7 aqu\xED decides t\xFA</span></h1><p class="sub">Dinero de mentira, precios reales. Operaciones de ').concat(usd(a.limits.min, 0), " a ").concat(usd(a.limits.max, 0), ", como har\xEDas t\xFA. Mercado ").concat(a.marketOpen ? '<b class="good">abierto</b>' : "<b>cerrado</b> (9:30 a.m.\u20134:00 p.m. hora de Nueva York)", '.</p></div>\n  <section class="grid g4">\n    <div class="card kpi"><div class="l">Valor total</div><div class="v">').concat(usd(a.total), '</div><div class="s"><span class="').concat(cls(a.returnPct), '">').concat(pct(a.returnPct * 100, 2), " desde ").concat(usd(a.start, 0), "</span>").concat(a.fx ? " \xB7 \u2248 ".concat(rd(Math.round(a.total * a.fx.rate))) : "", '</div></div>\n    <div class="card kpi" style="--c:var(--accent2)"><div class="l">Efectivo</div><div class="v">').concat(usd(a.cash), '</div><div class="s">Disponible para operar</div></div>\n    <div class="card kpi" style="--c:var(--good)"><div class="l">Ganancia realizada</div><div class="v ').concat(cls(a.realized), '">').concat(usd(a.realized), '</div><div class="s">Operaciones cerradas: ').concat(a.closed.length, '</div></div>\n    <div class="card kpi" style="--c:var(--warn)"><div class="l">No realizada</div><div class="v ').concat(cls(a.unrealized), '">').concat(usd(a.unrealized), '</div><div class="s">Provisional: cambia con el precio</div></div>\n  </section>\n  <section class="grid g2">\n    <div class="card"><h2>Operar (virtual)</h2><form class="form" id="of">\n      <div class="grid g2" style="gap:10px"><label>Acci\xF3n<select id="osym">').concat(syms.map((s) => "<option>".concat(esc(s), "</option>")).join(""), '</select></label>\n      <label>Operaci\xF3n<select id="oside"><option value="buy">Comprar</option><option value="sell">Vender</option></select></label></div>\n      <div class="grid g2" style="gap:10px"><label id="ousdl">Monto (US$)<input id="ousd" type="number" min="').concat(a.limits.min, '" max="').concat(a.limits.max, '" step="0.5" value="').concat(a.limits.max, '"></label>\n      <label id="oqtyl" class="hide">Cantidad de acciones<input id="oqty" type="number" step="0.000001" min="0"></label></div>\n      <button class="btn">Ejecutar</button><div class="msg" id="om"></div>\n      <div class="note">Se usa el precio real m\xE1s reciente. Si el precio no es actual o el mercado est\xE1 cerrado, la operaci\xF3n no se hace.</div></form></div>\n    <div class="card"><h2>\xBFCu\xE1nto invertir?</h2><form class="form" id="af">\n      <div class="grid g2" style="gap:10px"><label>Dinero que piensas invertir (US$)<input id="aamt" type="number" min="1" value="100"></label><label>\xBFEn cu\xE1nto tiempo lo necesitas? (meses)<input id="ahz" type="number" min="1" value="12"></label></div>\n      <div class="grid g2" style="gap:10px"><label>Costos fijos (env\xEDo desde RD, comisi\xF3n) US$<input id="afee" type="number" min="0" step="0.5" value="0"></label><label>\xBFTienes fondo de emergencia?<select id="aem"><option value="1">S\xED</option><option value="0">No</option></select></label></div>\n      <label>\xBFAlguien te propuso algo extremo? (opcional)<input id="aex" placeholder="Ej.: meter el 100% en Tesla"></label>\n      <button class="btn">Analizar</button><div id="ares"></div></form></div>\n  </section>\n  <section class="card"><h2>Posiciones abiertas</h2>').concat(a.positions.length ? '<div class="tablewrap"><table><tr><th>Acci\xF3n</th><th class="r">Cantidad</th><th class="r">Costo promedio</th><th class="r">Precio</th><th class="r">Ganancia</th></tr>'.concat(a.positions.map((p) => '<tr><td class="sym">'.concat(esc(p.symbol), '</td><td class="r">').concat(p.qty.toFixed(5), '</td><td class="r">').concat(usd(p.avgCost), '</td><td class="r">').concat(usd(p.price), '</td><td class="r ').concat(cls(p.pnl), '">').concat(usd(p.pnl), ' <span class="note">').concat(pct(p.pnlPct * 100), "</span></td></tr>")).join(""), "</table></div>") : '<div class="empty">Sin posiciones. Compra desde aqu\xED o desde una recomendaci\xF3n.</div>', '</section>\n  <section class="card"><h2>Historial de operaciones <a class="more" href="/api/export/operaciones">Exportar a Excel (CSV) \u25B8</a></h2>').concat(a.closed.length ? '<div class="tablewrap"><table><tr><th>Acci\xF3n</th><th>Entr\xF3</th><th>Sali\xF3</th><th class="r">Resultado</th></tr>'.concat(a.closed.slice().reverse().map((c) => '<tr><td class="sym">'.concat(esc(c.symbol), "</td><td>").concat(esc(c.openedAt.slice(0, 10)), " a ").concat(usd(c.entry), "</td><td>").concat(esc(c.closedAt.slice(0, 10)), " a ").concat(usd(c.exit), '</td><td class="r ').concat(cls(c.pnl), '">').concat(usd(c.pnl), " (").concat(pct(c.pnlPct * 100), ")</td></tr>")).join(""), "</table></div>") : '<div class="empty">A\xFAn no hay operaciones cerradas.</div>', "</section>");
  };
  views.bolsa.after = () => {
    $("#bf").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/budget", { method: "POST", body: { usd: Number($("#bu").value), emergency: $("#be").checked } });
        await loadBudget();
        $("#bm").className = "msg ok";
        $("#bm").textContent = "Guardado. Todos los montos ahora se calculan con tu dinero.";
        setTimeout(render, 900);
      } catch (err) {
        $("#bm").className = "msg err";
        $("#bm").textContent = err.message;
      }
    };
    $("#breset").onclick = async () => {
      try {
        const r = await api("/api/account/reset", { method: "POST" });
        $("#bm").className = "msg ok";
        $("#bm").textContent = "Listo: practicas con ".concat(usd(r.account.start_cash, 0), ". La cuenta anterior qued\xF3 guardada.");
        setTimeout(render, 1100);
      } catch (err) {
        $("#bm").className = "msg err";
        $("#bm").textContent = err.message;
      }
    };
    $("#oside").onchange = () => {
      const s = $("#oside").value === "sell";
      $("#ousdl").classList.toggle("hide", s);
      $("#oqtyl").classList.toggle("hide", !s);
    };
    $("#of").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api("/api/order", { method: "POST", body: { symbol: $("#osym").value, side: $("#oside").value, usd: Number($("#ousd").value), qty: Number($("#oqty").value), confirmEmotion: !!window.__emo } });
        window.__emo = false;
        $("#om").className = "msg ok";
        $("#om").textContent = "Hecho: ".concat(r.side === "buy" ? "compraste" : "vendiste", " ").concat(r.qty, " ").concat(r.symbol, " a ").concat(usd(r.execPrice), " (precio observado ").concat(usd(r.observedPrice), ").");
        setTimeout(render, 1500);
      } catch (err) {
        $("#om").className = "msg err";
        $("#om").textContent = err.message;
        if (/caliente|esperar/.test(err.message)) {
          $("#om").innerHTML += ' <button type="button" class="btn ghost" id="emo" style="padding:3px 10px">Entiendo, seguir igual</button>';
          $("#emo").onclick = () => {
            window.__emo = true;
            $("#of").requestSubmit();
          };
        }
      }
    };
    $("#af").onsubmit = async (e) => {
      e.preventDefault();
      const r = await api("/api/advice", { method: "POST", body: { amountUsd: Number($("#aamt").value), horizonMonths: Number($("#ahz").value), fixedCostUsd: Number($("#afee").value), hasEmergencyFund: $("#aem").value === "1", extremeIdea: $("#aex").value || null } });
      $("#ares").innerHTML = '<div class="answer">'.concat(light(r.light), '<div style="margin-top:8px">').concat(r.notes.map((n) => "<div>\u2022 ".concat(esc(n), "</div>")).join("") || "<div>Tu situaci\xF3n permite invertir ese monto.</div>", "</div>\n      ").concat(r.plan.length ? '<div style="margin-top:10px"><b>C\xF3mo repartirlo:</b>'.concat(r.plan.map((p) => '<div class="w" style="margin-top:6px"><span>'.concat(esc(p.part), "</span><b>").concat(p.pct, '%</b><div class="bar"><span style="width:').concat(p.pct, '%;background:var(--accent)"></span></div><div class="note" style="grid-column:1/-1">').concat(esc(p.why), "</div></div>")).join(""), "</div>") : "", "\n      ").concat(r.projectionSPY ? '<div style="margin-top:10px">'.concat(projBox(r.projectionSPY, "Si lo pones en un fondo del mercado (SPY) por ".concat($("#ahz").value, " meses")), "</div>") : "", "</div>");
    };
  };
  views.loterias = async () => {
    const L = await api("/api/lottery");
    const g0 = L.games.find((g) => g.draws) || L.games[0];
    window.__L = L;
    return '<div><h1>Loter\xEDas RD</h1><p class="sub">Resultados verificados, vigilancia de trampas y m\xE9todos puestos a prueba contra el azar. Si los sorteos son justos, ning\xFAn n\xFAmero es m\xE1s probable que otro.</p></div>\n  <section class="grid g4">\n    <div class="card kpi"><div class="l">Jugadas virtuales</div><div class="v">'.concat(L.stats.settled, '</div><div class="s">').concat(L.stats.pending, ' pendientes de sorteo</div></div>\n    <div class="card kpi" style="--c:var(--good)"><div class="l">Aciertos</div><div class="v">').concat(L.stats.hitRate != null ? L.stats.hitRate + "%" : "\u2014", '</div><div class="s">').concat(L.stats.wins, " premios \xB7 racha r\xE9cord ").concat(L.stats.streak.bestWin, '</div></div>\n    <div class="card kpi" style="--c:var(--bad)"><div class="l">Devuelve por RD$100</div><div class="v">').concat(L.stats.per100 != null ? rd(L.stats.per100) : "\u2014", '</div><div class="s">Apostado ').concat(rd(L.stats.staked), " \xB7 cobrado ").concat(rd(L.stats.paid), '</div></div>\n    <div class="card kpi" style="--c:var(--accent)"><div class="l">').concat(term("valor esperado", "Valor esperado"), '</div><div class="v">').concat(rd(L.expected.quiniela), '</div><div class="s">Quiniela \xB7 pal\xE9 ').concat(rd(L.expected.pale), " \xB7 tripleta ").concat(rd(L.expected.tripleta), '</div></div>\n  </section>\n  <div class="row" id="gtabs">').concat(L.games.map((g) => '<button class="btn '.concat(g.id === g0.id ? "" : "ghost", '" data-g="').concat(g.id, '">').concat(esc(g.name), "</button>")).join(""), '</div>\n  <div id="gview"></div>');
  };
  views.loterias.after = () => {
    const L = window.__L;
    const show = (id) => {
      document.querySelectorAll("#gtabs button").forEach((b) => b.classList.toggle("ghost", b.dataset.g !== id));
      const g = L.games.find((x) => x.id === id);
      const exp = g.draws * 3 / 100;
      const maxc = g.freq ? Math.max(1, ...Object.values(g.freq)) : 1, enough = g.draws >= 100;
      const heat = g.freq ? Object.keys(g.freq).sort().map((n) => {
        const c = g.freq[n];
        const z = exp ? (c - exp) / Math.sqrt(exp) : 0;
        const bg = enough && z > 3 ? "var(--bad)" : enough && z > 2 ? "var(--warn)" : "color-mix(in srgb, var(--accent) ".concat(Math.round(c / maxc * 55), "%, var(--panel2))");
        return '<div style="background:'.concat(bg, ';color:var(--ink)" title="').concat(n, ": sali\xF3 ").concat(c, " veces (esperado ").concat(exp.toFixed(1), ')">').concat(n, "</div>");
      }).join("") : "";
      $("#gview").innerHTML = '\n    <section class="grid g2">\n      <div class="card"><h2>Su n\xFAmero del pr\xF3ximo sorteo</h2>'.concat(g.pick ? '<div class="balls" style="margin-bottom:8px">'.concat(g.pick.numbers.map((n) => '<span class="ball">'.concat(esc(n), "</span>")).join(""), " ").concat(light(g.pick.light), "</div>\n        <div><b>").concat(esc(g.pick.methodLabel), ":</b> ").concat(esc(g.pick.why), '</div><div class="note" style="margin-top:4px">').concat(esc(g.pick.record), '</div>\n        <div class="answer" style="margin-top:8px">\u26A0 ').concat(esc(g.pick.warning), '</div><div class="note">Sorteo del ').concat(esc(g.pick.date), " \xB7 cierra ").concat(hhmm(g.pick.closesAt), " ").concat(g.timeVerified ? "" : "(horario por verificar)", '</div><a class="btn ghost" href="#analisis/loteria/').concat(esc(id), '" style="margin-top:8px;display:inline-block">An\xE1lisis completo \u25B8</a>') : '<div class="empty">Faltan sorteos para elegir.</div>', '</div>\n      <div class="card"><h2>\xDAltimos resultados</h2>').concat(g.last.length ? "<table>".concat(g.last.map((d) => "<tr><td>".concat(esc(d.date), '</td><td><div class="balls">').concat(d.nums.map((n) => '<span class="ball" style="width:28px;height:28px;font-size:12px">'.concat(esc(n), "</span>")).join(""), '</div></td><td><span class="src ').concat(d.status === "verificado" ? "ok" : "", '">').concat(d.status === "verificado" ? "2 fuentes" : d.status === "una_fuente" ? "1 fuente" : esc(d.status), "</span></td></tr>")).join(""), "</table>") : '<div class="empty">Sin resultados todav\xEDa.</div>', '</div>\n    </section>\n    <section class="grid g2">\n      <div class="card"><h2>Mapa de n\xFAmeros (').concat(g.draws, " sorteos)</h2>").concat(heat ? '<div class="heat">'.concat(heat, '</div><div class="legend"><span><i style="background:color-mix(in srgb,var(--accent) 55%,var(--panel2))"></i>M\xE1s veces</span><span><i style="background:var(--panel2);border:1px solid var(--line)"></i>Menos veces</span>').concat(enough ? '<span><i style="background:var(--warn)"></i>Raro</span><span><i style="background:var(--bad)"></i>Muy raro: revisar</span>' : "", '</div><div class="note" style="margin-top:6px">').concat(enough ? "Rojo solo si sale tanto que el azar casi no lo explica." : "Con ".concat(g.draws, " sorteos estas diferencias son ruido normal del azar; las alertas de color se activan desde 100 sorteos."), "</div>") : '<div class="empty">Sin datos.</div>', '</div>\n      <div class="card"><h2>Vigilancia de trampas</h2>').concat(g.scan ? '<div class="answer" style="margin-bottom:10px">'.concat(esc(g.scan.verdict), '</div><table><tr><th>Prueba</th><th class="r">Prob. de casualidad</th><th>Estado</th></tr>').concat(g.scan.tests.map((t) => "<tr><td>".concat(esc(t.title), '<div class="note">').concat(esc(t.detail), '</div></td><td class="r">').concat((t.p * 100).toFixed(1), "%</td><td>").concat(t.anomaly ? '<span class="light rojo"><i></i>Revisar</span>' : '<span class="light verde"><i></i>Normal</span>', "</td></tr>")).join(""), "</table>") : '<div class="empty">Se necesitan al menos 10 sorteos.</div>', '</div>\n    </section>\n    <section class="card"><h2>M\xE9todos contra el azar</h2>').concat(g.compare ? '<div class="answer" style="margin-bottom:10px">'.concat(esc(g.compare.verdict), '</div><div class="tablewrap"><table><tr><th>M\xE9todo</th><th class="r">Jugadas</th><th class="r">Premios</th><th class="r">Devuelve / RD$100</th><th class="r">\xBFLe gana al azar?</th></tr>\n      <tr><td><b>Azar puro</b> <span class="note">(400 jugadores simulados)</span></td><td class="r">\u2014</td><td class="r">\u2014</td><td class="r">').concat(rd(g.compare.random.median), ' <span class="note">(').concat(g.compare.random.lo, "\u2013").concat(g.compare.random.hi, ')</span></td><td class="r">Referencia</td></tr>\n      ').concat(g.compare.methods.map((m) => "<tr><td>".concat(esc(m.label), '<div class="note">').concat(esc(m.why), '</div></td><td class="r">').concat(m.plays, '</td><td class="r">').concat(m.wins, '</td><td class="r ').concat(m.per100 >= 100 ? "good" : "bad", '">').concat(rd(m.per100), '</td><td class="r">').concat(m.beatsRandom ? '<span class="light verde"><i></i>S\xED (confirmar)</span>' : '<span class="light gris"><i></i>No</span> <span class="note">'.concat((m.pBetterThanRandom * 100).toFixed(0), "% por azar</span>"), "</td></tr>")).join(""), "</table></div>") : '<div class="empty">Se necesitan al menos 20 sorteos.</div>', '</section>\n    <section class="card"><h2>Jugar en virtual</h2><form class="form" id="lf"><div class="grid g4" style="gap:10px">\n      <label>Tipo<select id="lk"><option value="quiniela">Quiniela</option><option value="pale">Pal\xE9</option><option value="tripleta">Tripleta</option></select></label>\n      <label>N\xFAmeros (separados por espacio)<input id="ln" placeholder="27 o 27 45"></label><label>Monto RD$<input id="ls" type="number" min="1" value="10"></label><label>&nbsp;<button class="btn">Sellar jugada</button></label></div><div class="msg" id="lm"></div></form></section>');
      $("#lf").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = await api("/api/lottery/play", { method: "POST", body: { game: id, kind: $("#lk").value, numbers: $("#ln").value.trim().split(/\s+/).map((x) => x.padStart(2, "0")), stake: Number($("#ls").value) } });
          $("#lm").className = "msg ok";
          $("#lm").textContent = "Sellada para el sorteo del ".concat(r.date, ". Huella: ").concat(r.hash.slice(0, 12), "\u2026");
        } catch (err) {
          $("#lm").className = "msg err";
          $("#lm").textContent = err.message;
        }
      };
    };
    document.querySelectorAll("#gtabs button").forEach((b) => b.onclick = () => show(b.dataset.g));
    show(document.querySelector("#gtabs button:not(.ghost)").dataset.g);
  };
  views.aprendizaje = async () => {
    const [d, wi, gr] = await Promise.all([api("/api/learning"), api("/api/whatif?usd=10"), api("/api/grade")]);
    const p = d.predictions, s = d.strategies;
    return '<div><h1>Aprendizaje</h1><p class="sub">Aprender = mejorar en datos que no se usaron para crear la estrategia. Aqu\xED est\xE1 todo: aciertos, errores, cambios y trampas.</p></div>\n  <section class="grid g4">\n    <div class="card kpi" style="--c:var(--good)"><div class="l">Predicciones selladas</div><div class="v">'.concat(p.total, '</div><div class="s">').concat(p.resolved, " calificadas \xB7 ").concat(p.pending, ' pendientes</div></div>\n    <div class="card kpi" style="--c:var(--accent)"><div class="l">% de acierto</div><div class="v">').concat(p.hitRate != null ? p.hitRate + "%" : "\u2014", '</div><div class="s">').concat(p.hits, " aciertos / ").concat(p.misses, " fallos").concat(p.range ? " \xB7 rango ".concat(p.range[0], "\u2013").concat(p.range[1], "%") : "", '</div></div>\n    <div class="card kpi" style="--c:var(--warn)"><div class="l">Rachas</div><div class="v">').concat(p.streak.current, '</div><div class="s">actual (').concat(p.streak.type || "\u2014", ") \xB7 r\xE9cord ").concat(p.streak.bestHits, " aciertos / ").concat(p.streak.bestMisses, ' fallos</div></div>\n    <div class="card kpi" style="--c:var(--violet)"><div class="l">Experimentos</div><div class="v">').concat(s.experiments, '</div><div class="s">').concat(s.byStatus.en_prueba || 0, " en prueba en vivo \xB7 ").concat(s.byStatus.validada || 0, ' validadas</div></div>\n  </section>\n  <section class="grid g2">\n    <div class="card"><h2>Cambios recientes (con su motivo)</h2>').concat(s.recent.length ? s.recent.map((r) => '<div style="padding:8px 0;border-top:1px solid var(--line)"><b>'.concat(esc(STATUS[r.to_status] || r.to_status), '</b> <span class="note">\xB7 ').concat(esc(r.family.replace(/_/g, " ")), " ").concat(esc(r.params), " \xB7 ").concat(esc(r.agent || ""), " \xB7 ").concat(timeAgo(r.ts), '</span><div class="note">').concat(esc(r.reason), "</div></div>")).join("") : '<div class="empty">A\xFAn no hay experimentos. Activa el motor.</div>', '</div>\n    <div class="card"><h2>Liga de agentes y monedas</h2><table><tr><th>Agente</th><th class="r">Monedas</th><th class="r">Semana</th><th class="r">Trampas</th></tr>').concat(d.league.map((a) => {
      var _a;
      return "<tr><td>".concat(esc(a.name), '</td><td class="r"><b>').concat(a.coins, '</b></td><td class="r ').concat(cls(a.week), '">').concat((_a = a.week) != null ? _a : "\u2014", '</td><td class="r ').concat(a.cheats ? "bad" : "", '">').concat(a.cheats, "</td></tr>");
    }).join(""), '</table>\n      <div class="note" style="margin-top:8px">+1 moneda por cada 1% ganado neto en la bolsa, +1 extra si le gana al mercado. Las p\xE9rdidas restan. Las monedas compran m\xE1s pruebas y prioridad.</div>\n      ').concat(d.coins.length ? '<details style="margin-top:8px"><summary>\xDAltimos movimientos \u25B8</summary>'.concat(d.coins.map((c) => '<div class="note">'.concat(esc(c.ts.slice(0, 16).replace("T", " ")), " \xB7 ").concat(esc(c.agent), ' \xB7 <b class="').concat(cls(c.amount), '">').concat(c.amount > 0 ? "+" : "").concat(c.amount, "</b> ").concat(esc(c.reason)).concat(c.revoked ? " (revocada)" : "", "</div>")).join(""), "</details>") : "", '</div>\n  </section>\n  <section class="grid g2">\n    <div class="card"><h2>Reporte de trampas</h2>').concat(d.cheats.length ? d.cheats.map((c) => '<div style="padding:8px 0;border-top:1px solid var(--line)"><span class="light rojo"><i></i>'.concat(esc(c.rule.replace(/_/g, " ")), '</span> <span class="note">').concat(esc(c.agent), " \xB7 ").concat(timeAgo(c.ts), " \xB7 \u2212").concat(c.coins_removed, " monedas</span><div>").concat(esc(c.explanation), "</div></div>")).join("") : '<div class="empty">Ninguna trampa detectada. El auditor revisa cada moneda antes de darla.</div>', '</div>\n    <div class="card"><h2>Lo que JARVIS no sabe</h2>').concat(d.dontKnow.map((x) => '<div style="padding:6px 0">\u2022 '.concat(esc(x), "</div>")).join(""), '</div>\n  </section>\n  <section class="grid g2">\n    <div class="card"><h2>\xBFY si hubieras seguido a JARVIS?</h2><div class="mini3"><div class="pbox"><div class="l">Recomendaciones</div><div class="v">').concat(wi.trades, '</div></div><div class="pbox"><div class="l">JARVIS</div><div class="v ').concat(cls(wi.jarvisGain), '">').concat(usd(wi.jarvisGain), '</div></div><div class="pbox"><div class="l">Mercado</div><div class="v ').concat(cls(wi.marketGain), '">').concat(usd(wi.marketGain), '</div></div></div>\n      <div class="note" style="margin-top:8px">').concat(esc(wi.text), "</div>").concat(wi.curve.length > 1 ? lineChart(wi.curve.map((c) => [c.date, c.jarvis]), { h: 160, bench: wi.curve.map((c) => [c.date, c.market]), label: "JARVIS contra el mercado" }) : "", '</div>\n    <div class="card"><h2>Bolet\xEDn del mes</h2><div style="display:flex;gap:18px;align-items:center"><div style="font-size:64px;font-weight:800;line-height:1;color:').concat({ A: "var(--good)", B: "var(--accent)", C: "var(--warn)", D: "var(--bad)" }[gr.grade] || "var(--mute)", '">').concat(esc(gr.grade), "</div><div>").concat(esc(gr.text), '</div></div>\n      <div class="note" style="margin-top:8px">A: le gan\xF3 al mercado con evidencia \xB7 B: le gan\xF3, puede ser suerte \xB7 C: empat\xF3 \xB7 D: perdi\xF3 contra el mercado.</div>\n      <div class="row" style="margin-top:12px"><a class="btn ghost" href="/api/export/predicciones">Exportar predicciones (CSV)</a><a class="btn ghost" href="/api/export/ranking">Exportar ranking (CSV)</a><button class="btn ghost" onclick="window.print()">Imprimir / PDF</button></div></div>\n  </section>\n  <section class="card"><h2>Glosario</h2><div class="grid g3" style="gap:10px">').concat(Object.entries(GLOSS).map(([k, v]) => "<div><b>".concat(esc(k[0].toUpperCase() + k.slice(1)), '</b><div class="note">').concat(esc(v), "</div></div>")).join(""), '</div></section>\n  <section class="card"><h2>Estrategias</h2>').concat(d.list.length ? '<div class="tablewrap"><table><tr><th>Estrategia</th><th>Agente</th><th>Estado</th><th class="r">Pr\xE1ctica (t)</th><th class="r">Examen (t)</th><th class="r">Extra anual vs SPY</th></tr>'.concat(d.list.map((x) => {
      var _a, _b, _c, _d, _e;
      return "<tr><td>".concat(esc(x.family.replace(/_/g, " ")), ' <span class="note">').concat(esc(JSON.stringify(x.params)), "</span></td><td>").concat(esc(x.agent || ""), "</td><td>").concat(esc(STATUS[x.status] || x.status), '</td><td class="r">').concat(((_a = x.result) == null ? void 0 : _a.train) ? x.result.train.t.toFixed(2) : "\u2014", '</td><td class="r">').concat(((_b = x.result) == null ? void 0 : _b.holdout) ? x.result.holdout.t.toFixed(2) : "\u2014", '</td><td class="r ').concat(cls((_d = (_c = x.result) == null ? void 0 : _c.holdout) == null ? void 0 : _d.annual), '">').concat(((_e = x.result) == null ? void 0 : _e.holdout) ? pct(x.result.holdout.annual * 100) : "\u2014", "</td></tr>");
    }).join(""), "</table></div>") : '<div class="empty">Sin estrategias probadas todav\xEDa.</div>', "</section>");
  };
  const adminOnly = () => '<section class="card"><h2>Solo para el administrador</h2><p class="note">Esta parte la maneja quien administra JARVIS. Lo tuyo est\xE1 en <a href="#perfil">Mi perfil</a> y <a href="#potenciador">\u26A1 Potenciador</a>.</p></section>';
  views.estado = async () => {
    var _a;
    if ((ME == null ? void 0 : ME.role) !== "admin") return adminOnly();
    const s = await api("/api/status");
    const NAMES = { loterias_resultados: "Resultados de loter\xEDas", loterias_liquidar: "Pagar jugadas", bolsa_precios: "Precios en vivo", bolsa_historial: "Historial de precios", copia: "Copia de seguridad", resumen_diario: "Resumen diario", fundamentales: "Informes de empresas", noticias: "Noticias", investigacion: "Investigaci\xF3n", loterias_jugadas: "Jugadas autom\xE1ticas", prueba_en_vivo: "Prueba en vivo", cartera_ia: "Cartera de la IA", explorar: "Explorar nuevas acciones", ranking: "Ranking", debate: "Debate", vigilancia_loterias: "Vigilancia de trampas" };
    return '<div><h1>Estado del sistema</h1><p class="sub">\xDAltimo latido: '.concat(timeAgo(s.heartbeat), " \xB7 Motor: ").concat(s.motor.running ? "activo".concat(s.motor.until ? " hasta " + new Date(s.motor.until).toLocaleString("es-DO") : "") : "en pausa", " \xB7 Versi\xF3n: <b>").concat(esc(s.version || "\u2014"), '</b></p></div>\n  <section class="grid g4">\n    <div class="card kpi" style="--c:').concat(s.ledger.ok ? "var(--good)" : "var(--bad)", '"><div class="l">Registro sellado</div><div class="v">').concat(s.ledger.ok ? "Intacto" : "Alterado", '</div><div class="s">').concat(s.ledger.checked, ' entradas verificadas</div></div>\n    <div class="card kpi"><div class="l">Gasto de IA</div><div class="v">').concat(usd(s.ai.month, 2), '</div><div class="s">de ').concat(usd(s.ai.monthCap, 0), " este mes \xB7 hoy ").concat(usd(s.ai.day, 3), '</div></div>\n    <div class="card kpi" style="--c:var(--accent2)"><div class="l">Datos guardados</div><div class="v">').concat(s.db.bars.toLocaleString(), '</div><div class="s">precios \xB7 ').concat(s.db.draws, " sorteos \xB7 ").concat(s.db.ledger, ' sellos</div></div>\n    <div class="card kpi" style="--c:var(--violet)"><div class="l">Conexiones</div><div class="v" style="font-size:18px;line-height:1.6">').concat(["openai", "anthropic", "ollama"].map((k) => '<span class="light '.concat(s.ai.available[k] ? "verde" : "gris", '"><i></i>').concat({ openai: "ChatGPT", anthropic: "Claude", ollama: "Modelo gratis" }[k], "</span>")).join(" "), ' <span class="light ').concat(s.sources.alpaca ? "verde" : "amarillo", '"><i></i>').concat(s.sources.alpaca ? "Alpaca" : "Yahoo (respaldo)", '</span></div></div>\n  </section>\n  <section class="card"><h2>Tareas</h2><div class="tablewrap"><table><tr><th>Tarea</th><th>Cada</th><th>Necesita motor</th><th>\xDAltima vez</th><th>Resultado</th></tr>').concat(s.tasks.map((t) => {
      var _a2;
      return "<tr><td>".concat(esc(NAMES[t.name] || t.name), "</td><td>").concat(t.every >= 1440 ? Math.round(t.every / 1440) + " d" : t.every >= 60 ? Math.round(t.every / 60) + " h" : t.every + " min", "</td><td>").concat(t.needsMotor ? "S\xED" : "Siempre", "</td><td>").concat(timeAgo((_a2 = t.last) == null ? void 0 : _a2.at), "</td><td>").concat(t.last ? t.last.ok ? '<span class="good">\u2713 Bien</span>' : '<span class="bad">\u2715 '.concat(esc(t.last.error), "</span>") : "\u2014", "</td></tr>");
    }).join(""), '</table></div></section>\n  <section class="card"><h2>Resumen diario (8:00 a.m.)</h2><div class="answer">').concat(esc(((_a = s.dailySummary) == null ? void 0 : _a.text) || "Todav\xEDa no se ha generado."), "</div></section>");
  };
  const onlineChip = (iso) => !iso ? '<span class="note">Nunca ha entrado</span>' : Date.now() - Date.parse(iso) < 3 * 6e4 ? '<span class="chip good">\u{1F7E2} En l\xEDnea</span>' : '<span class="note">\u26AA '.concat(timeAgo(iso), "</span>");
  views.ajustes = async () => {
    if ((ME == null ? void 0 : ME.role) !== "admin") return adminOnly();
    const [st, users, mot, keys] = await Promise.all([api("/api/settings"), api("/api/users"), api("/api/status"), api("/api/keys")]);
    const KEYHELP = { OPENAI_API_KEY: ["platform.openai.com/api-keys", "https://platform.openai.com/api-keys", "sk-\u2026"], ANTHROPIC_API_KEY: ["console.anthropic.com (opcional)", "https://console.anthropic.com/settings/keys", "sk-ant-\u2026"], ALPACA_KEY_ID: ["alpaca.markets, cuenta de pr\xE1ctica (gratis)", "https://app.alpaca.markets/paper/dashboard/overview", "PK\u2026"], ALPACA_SECRET_KEY: ["la misma p\xE1gina de Alpaca", "https://app.alpaca.markets/paper/dashboard/overview", ""], NTFY_TOPIC: ["inventa un nombre secreto y suscr\xEDbete en la app ntfy", "https://ntfy.sh", "jarvis-junior-7f3k9"], SEC_USER_AGENT: ["tu nombre y correo (la SEC lo pide)", "https://www.sec.gov/os/accessing-edgar-data", "Junior tu@correo.com"] };
    return '<div><h1>Ajustes</h1><p class="sub">Solo el administrador ve esta pantalla.</p></div>\n  <section class="card brandcard"><h2>Tu marca <span class="more note">hazlo tuyo: nombre, logo y color</span></h2>\n    <div class="grid split" style="gap:20px;margin-top:10px">\n      <div class="form">\n        <label>Nombre del programa<input id="bn" maxlength="24" value="'.concat(esc(BRAND.name), '"></label>\n        <label>Frase debajo del nombre<input id="bt" maxlength="60" value="').concat(esc(BRAND.tagline), '" placeholder="Ej.: Mi investigador personal"></label>\n        <label>Due\xF1o (sale como "Programa privado de\u2026")<input id="bo" maxlength="40" value="').concat(esc(BRAND.owner), '" placeholder="Ej.: Junior"></label>\n        <div><div class="note" style="margin-bottom:6px">Color principal</div><div class="swatches">').concat(Object.entries(BRAND.palettes || {}).map(([k, p]) => '<button type="button" class="sw'.concat(k === BRAND.color ? " on" : "", '" data-c="').concat(k, '" title="').concat(esc(p.name), '" style="--d:').concat(p.dark, ";--l:").concat(p.light, '"><i></i>').concat(esc(p.name), "</button>")).join(""), '</div></div>\n        <div><div class="note" style="margin-bottom:6px">Logo (PNG, JPG o WEBP; se ajusta solo)</div><div class="row" style="gap:10px;align-items:center"><label class="btn ghost" style="cursor:pointer">Subir logo<input id="bl" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>').concat(BRAND.hasLogo ? '<button type="button" class="btn ghost" id="blr">Quitar logo</button>' : "", '</div></div>\n        <button class="btn" id="bsave">Guardar mi marca</button><div class="msg" id="bm"></div>\n      </div>\n      <div><div class="note" style="margin-bottom:8px">As\xED se ver\xE1</div><div class="bprev" id="bprev"></div><div class="note" style="margin-top:8px">Sale en la barra de arriba, la pantalla de entrada, el Modo TV, la pesta\xF1a del navegador y el \xEDcono cuando lo instalas en el celular.</div></div>\n    </div></section>\n  ').concat(mot.publicUrl ? '<section class="card"><h2>Tu enlace para la TV y cualquier navegador</h2><p style="font-size:18px;margin:8px 0"><a href="'.concat(esc(mot.publicUrl), '" target="_blank" rel="noopener"><b>').concat(esc(mot.publicUrl), '</b></a></p><div class="note">Escr\xEDbelo en la barra de direcciones (no en el buscador de Google) del navegador de la TV, otra computadora o el celular de tu amigo. Siempre pide usuario y contrase\xF1a. Para la TV usa el bot\xF3n "Modo TV".</div></section>') : '<section class="card"><h2>Enlace para que cualquiera entre (sin instalar nada)</h2>'.concat(mot.funnelEnable ? '<p style="margin:8px 0">Tailscale pide tu permiso <b>una sola vez</b> para abrir JARVIS a internet.</p><a class="btn" href="'.concat(esc(mot.funnelEnable), '" target="_blank" rel="noopener">Activar enlace p\xFAblico</a><ol class="note" style="margin-top:10px;padding-left:18px"><li>Toca el bot\xF3n (se abre la p\xE1gina de Tailscale).</li><li>Entra con la misma cuenta de Tailscale y toca <b>Enable</b> / <b>Activar</b> en todo lo que pregunte.</li><li>Vuelve aqu\xED en unos 10 minutos: aparecer\xE1 tu enlace.</li></ol><div class="note">Aunque el enlace sea p\xFAblico, nadie ve nada sin el usuario y la contrase\xF1a que t\xFA le crees.</div>') : '<div class="note">Todav\xEDa no hay enlace p\xFAblico. El servidor lo intenta cada 10 minutos. Si en 20 minutos sigue as\xED, m\xE1ndale una foto de esta tarjeta a Claude. Mientras tanto entra con Tailscale: http://jarvis:8080</div>', "</section>"), '\n  <section class="card keyscard"><h2>Claves <span class="more note">se guardan solo en tu servidor; nunca se muestran de nuevo</span></h2>\n    <p class="note">P\xE9galas desde el celular. JARVIS revisa el formato y las usa al momento, sin reiniciar. Para borrar una, deja el campo vac\xEDo y marca "borrar".</p>\n    <form class="form" id="kf">').concat(keys.map((k) => '<div class="krow"><div><b>'.concat(esc(k.label), "</b> ").concat(k.set ? '<span class="tag dato">puesta '.concat(esc(k.hint || ""), "</span>") : '<span class="tag est">falta</span>', '<div class="note">D\xF3nde sacarla: <a href="').concat(KEYHELP[k.name][1], '" target="_blank" rel="noopener">').concat(esc(KEYHELP[k.name][0]), '</a></div></div>\n      <input type="').concat(k.name === "NTFY_TOPIC" || k.name === "SEC_USER_AGENT" ? "text" : "password", '" data-key="').concat(k.name, '" autocomplete="off" placeholder="').concat(k.set ? "Escribe solo si quieres cambiarla" : esc(KEYHELP[k.name][2]), '">').concat(k.set ? '<label class="note" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-del="'.concat(k.name, '" style="width:auto"> borrar</label>') : "<span></span>", "</div>")).join(""), '\n      <button class="btn">Guardar claves</button><div class="msg" id="km"></div></form>\n    <div class="note">Pon tambi\xE9n un l\xEDmite de gasto en la p\xE1gina de OpenAI. JARVIS adem\xE1s respeta su propio tope: ').concat(usd(st.caps.month, 0), ' al mes.</div></section>\n  <section class="card"><h2>Motor aut\xF3nomo</h2><div class="row" style="align-items:flex-end">\n    <label style="flex-direction:row;align-items:center;gap:8px;padding-bottom:10px"><input type="checkbox" id="mnon" style="width:auto" checked> Sin parar (hasta que yo lo detenga)</label>\n    <label style="width:180px" id="mhl" class="hide">Trabajar durante (horas)<input id="mh" type="number" min="1" value="72"></label>\n    <button class="btn" id="mstart">Iniciar</button><button class="btn ghost" id="mpause">Pausar</button><button class="btn ghost" id="mresume">Reanudar</button><button class="btn danger" id="mstop">Detener</button><button class="btn ghost" id="mrun">Correr ciclo ahora</button></div>\n    <div class="note" style="margin-top:8px">Estado: <b>').concat(mot.motor.running ? "activo" : "en pausa", "</b>").concat(mot.motor.until ? " hasta " + new Date(mot.motor.until).toLocaleString("es-DO") : "", '. Al pausar o detener, todo el progreso queda guardado.</div><div class="msg" id="mm"></div></section>\n  <section class="grid g2">\n    <div class="card"><h2>Inteligencia artificial</h2><div class="form">\n      ').concat([["openai", "ChatGPT (principal)"], ["anthropic", "Claude (opcional, activa el debate entre dos IA)"], ["ollama", "Modelo gratis en el servidor"]].map(([k, l]) => '<label style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" data-ai="'.concat(k, '" ').concat(st.aiEnabled[k] ? "checked" : "", ' style="width:auto"> ').concat(l, " ").concat(st.keys[k] === false ? '<span class="tag est">falta la clave (ponla arriba, en Claves)</span>' : "", "</label>")).join(""), '\n      <div class="note">Modelos: ').concat(esc(st.models.openai), " \xB7 ").concat(esc(st.models.anthropic), " \xB7 ").concat(esc(st.models.local), ". Tope: ").concat(usd(st.caps.month, 0), " al mes, ").concat(usd(st.caps.day, 2), ' al d\xEDa (en .env).</div>\n      <label>Precios por mill\xF3n de tokens (conf\xEDrmalos en la p\xE1gina oficial)<textarea id="prices" rows="4" class="mono">').concat(esc(JSON.stringify(st.prices, null, 1)), '</textarea></label>\n      <button class="btn" id="saveai">Guardar IA</button></div></div>\n    <div class="card"><h2>Bolsa y loter\xEDas</h2><div class="form">\n      <label>Acciones que investiga (separadas por coma)<textarea id="univ" rows="3">').concat(esc(st.universe.join(", ")), '</textarea></label>\n      <label>Pagos de la banca (por RD$1)<textarea id="pay" rows="4" class="mono">').concat(esc(JSON.stringify(st.payouts)), '</textarea></label>\n      <label style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="single" ').concat(st.allowSingleSource ? "checked" : "", ' style="width:auto"> Pagar jugadas con una sola fuente (marcadas como "1 fuente")</label>\n      <button class="btn" id="saveother">Guardar</button></div></div>\n  </section>\n  <section class="grid g2">\n    <div class="card"><h2>Avisos al celular</h2>').concat(st.notify.on ? "<p>Activos (tema ".concat(esc(st.notify.topic), ').</p><button class="btn ghost" id="ntest">Enviar aviso de prueba</button>') : '<ol class="note" style="padding-left:18px"><li>Instala la app gratis <b>ntfy</b> en tu celular.</li><li>Inventa un nombre secreto, por ejemplo <span class="mono">jarvis-junior-7f3k9</span>, y suscr\xEDbete a ese tema en la app.</li><li>Ponlo arriba, en <b>Claves \u2192 Tema de avisos</b>. Para tus avisos personales, ponlo tambi\xE9n en <a href="#perfil">Mi perfil</a>. Cada usuario puede tener el suyo.</li></ol>', '<div class="msg" id="nm"></div></div>\n    <div class="card"><h2>Copia fuera del servidor</h2>').concat(st.offsite ? '<p class="good">Activa: cada copia diaria se cifra y se sube.</p>' : '<ol class="note" style="padding-left:18px"><li>En el servidor instala rclone y conecta tu Google Drive: <span class="mono">sudo apt install -y rclone && sudo -u jarvis rclone config</span></li><li>En .env pon <span class="mono">RCLONE_REMOTE=gdrive:</span> y una frase larga en <span class="mono">BACKUP_PASSPHRASE</span>. Guarda la frase en un lugar seguro: sin ella la copia no se puede abrir.</li><li>Reinicia JARVIS.</li></ol>', '</div>\n  </section>\n  <section class="card" id="usuarios"><h2>Usuarios <span class="more note">cada uno con su perfil; todos usan el mismo n\xFAcleo</span></h2>').concat((() => {
      const on = users.filter((u) => u.lastSeen && Date.now() - Date.parse(u.lastSeen) < 3 * 6e4);
      return '<div class="onl"><b>\u{1F465} Tienes '.concat(users.length, " ").concat(users.length === 1 ? "usuario" : "usuarios", "</b> \xB7 ").concat(on.length ? "\u{1F7E2} En l\xEDnea ahora: ".concat(on.map((u) => esc(u.display_name || u.username)).join(", ")) : "nadie en l\xEDnea ahora", "</div>");
    })(), '<div class="tablewrap"><table><tr><th>Persona</th><th>Estilo</th><th class="r">Su dinero</th><th>Estado</th><th></th></tr>').concat(users.map((u) => "<tr><td><b>".concat(esc(u.display_name || u.username), '</b><div class="note">').concat(esc(u.username), " \xB7 ").concat(u.role === "admin" ? "Administrador" : "Usuario", '</div><div style="margin-top:4px">').concat(onlineChip(u.lastSeen), "</div></td><td>").concat(u.setup ? esc({ conservador: "\u{1F6E1}\uFE0F Conservador", equilibrado: "\u2696\uFE0F Equilibrado", arriesgado: "\u{1F680} Arriesgado" }[u.style]) : '<span class="note">sin configurar</span>', '</td><td class="r">').concat(usd(u.budget, 0), "</td><td>").concat(u.active ? '<span class="good">Activo</span>' : '<span class="bad">Desactivado</span>', '</td>\n      <td class="r" style="white-space:nowrap">').concat(u.id === ME.id ? '<a class="note" href="#perfil">Mi perfil \u25B8</a>' : '<button class="btn ghost sm" data-pw="'.concat(u.id, '">Nueva contrase\xF1a</button> <button class="btn ghost sm" data-act="').concat(u.id, '" data-on="').concat(u.active ? 0 : 1, '">').concat(u.active ? "Desactivar" : "Activar", "</button>"), "</td></tr>")).join(""), '</table></div>\n    <h3 class="cs-h">Crear un usuario (por ejemplo, para tu amigo)</h3>\n    <form class="row" id="uf" style="align-items:flex-end;gap:10px"><label style="flex:1;min-width:160px">Su nombre<input id="nn" placeholder="Ricardo"></label><label style="flex:1;min-width:160px">Usuario para entrar<input id="nu" required placeholder="ricardo"></label><label style="flex:1;min-width:180px">Contrase\xF1a (d\xE9jala vac\xEDa y JARVIS crea una)<input id="np" type="text" minlength="10" placeholder="autom\xE1tica" autocomplete="off"></label><label style="width:150px">IA gratis al mes (US$)<input id="nm" type="number" value="2" step="0.5"></label><button class="btn">Crear usuario</button></form>\n    <div class="note" style="margin-top:6px">Al entrar por primera vez, JARVIS le pregunta su estilo, su plazo y qu\xE9 le interesa. Tiene su propio dinero virtual, sus avisos y su historial real; la investigaci\xF3n se comparte sin gastar doble. Desactivar guarda sus datos.</div><div class="msg" id="um"></div></section>');
  };
  views.ajustes.after = () => {
    if ((ME == null ? void 0 : ME.role) !== "admin") return;
    $("#kf").onsubmit = async (e) => {
      e.preventDefault();
      const body = {};
      document.querySelectorAll("[data-key]").forEach((i) => {
        if (i.value.trim()) body[i.dataset.key] = i.value.trim();
      });
      document.querySelectorAll("[data-del]").forEach((c) => {
        if (c.checked) body[c.dataset.del] = "";
      });
      if (!Object.keys(body).length) {
        $("#km").className = "msg err";
        $("#km").textContent = "No escribiste ninguna clave.";
        return;
      }
      try {
        await api("/api/keys", { method: "POST", body });
        document.querySelectorAll("[data-key]").forEach((i) => {
          i.value = "";
        });
        $("#km").className = "msg ok";
        $("#km").textContent = "Guardadas en el servidor. Ya est\xE1n funcionando.";
        setTimeout(render, 1e3);
      } catch (err) {
        $("#km").className = "msg err";
        $("#km").textContent = err.message;
      }
    };
    let color = BRAND.color, logo = null, removeLogo = false;
    const prev = () => {
      const P = BRAND.palettes[color];
      const src = logo || (BRAND.hasLogo && !removeLogo ? "/brand/logo?v=".concat(BRAND.v) : null);
      $("#bprev").innerHTML = '<div class="bp-bar" style="--pa:'.concat(P.dark, '">').concat(src ? '<img src="'.concat(src, '" alt="">') : '<span class="ring" style="border-color:'.concat(P.dark, '"><i style="background:').concat(P.dark, '"></i></span>'), "<b>").concat(esc($("#bn").value || "JARVIS"), '</b><span class="bp-tabs"><i style="background:').concat(P.dark, "33;color:").concat(P.dark, '">Inicio</i><i>Historial</i></span></div>\n      <div class="bp-login">').concat(src ? '<img src="'.concat(src, '" alt="">') : '<span class="ring big" style="border-color:'.concat(P.dark, '"><i style="background:').concat(P.dark, '"></i></span>'), "<b>").concat(esc($("#bn").value || "JARVIS"), "</b><small>").concat(esc($("#bt").value), "</small>").concat($("#bo").value ? "<em>Programa privado de ".concat(esc($("#bo").value), "</em>") : "", '<span class="bp-btn" style="background:').concat(P.dark, '">Entrar</span></div>');
    };
    ["#bn", "#bt", "#bo"].forEach((id) => $(id).oninput = prev);
    document.querySelectorAll(".sw").forEach((b) => b.onclick = () => {
      color = b.dataset.c;
      document.querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x === b));
      prev();
    });
    $("#bl").onchange = async () => {
      const f = $("#bl").files[0];
      if (!f) return;
      try {
        logo = await shrinkImage(f);
        removeLogo = false;
        prev();
        $("#bm").className = "msg ok";
        $("#bm").textContent = 'Logo listo. Pulsa "Guardar mi marca".';
      } catch (e) {
        $("#bm").className = "msg err";
        $("#bm").textContent = e.message;
      }
    };
    if ($("#blr")) $("#blr").onclick = () => {
      removeLogo = true;
      logo = null;
      prev();
    };
    $("#bsave").onclick = async () => {
      try {
        BRAND = await api("/api/brand", { method: "POST", body: __spreadValues(__spreadValues({ name: $("#bn").value, tagline: $("#bt").value, owner: $("#bo").value, color }, logo ? { logo } : {}), removeLogo ? { removeLogo: true } : {}) });
        applyBrand();
        $("#bm").className = "msg ok";
        $("#bm").textContent = "\xA1Listo! Tu marca qued\xF3 guardada.";
        setTimeout(render, 900);
      } catch (e) {
        $("#bm").className = "msg err";
        $("#bm").textContent = e.message;
      }
    };
    prev();
    const m = (t, ok = true) => {
      $("#mm").className = "msg " + (ok ? "ok" : "err");
      $("#mm").textContent = t;
    };
    $("#mnon").onchange = () => $("#mhl").classList.toggle("hide", $("#mnon").checked);
    $("#mstart").onclick = async () => {
      await api("/api/motor/start", { method: "POST", body: { hours: $("#mnon").checked ? null : Number($("#mh").value) } });
      m($("#mnon").checked ? "Motor activado sin parar: investiga y explora hasta que lo detengas." : "Motor activado.");
      setTimeout(render, 800);
    };
    $("#mpause").onclick = async () => {
      await api("/api/motor/pause", { method: "POST" });
      m("En pausa.");
      setTimeout(render, 800);
    };
    $("#mresume").onclick = async () => {
      await api("/api/motor/resume", { method: "POST" });
      m("Reanudado.");
      setTimeout(render, 800);
    };
    $("#mstop").onclick = async () => {
      await api("/api/motor/stop", { method: "POST" });
      m("Detenido.");
      setTimeout(render, 800);
    };
    $("#mrun").onclick = async () => {
      m("Corriendo ciclo\u2026 puede tardar unos minutos la primera vez.");
      try {
        const r = await api("/api/motor/run", { method: "POST", body: { force: ["loterias_resultados", "bolsa_historial", "ranking"] } });
        m("Ciclo terminado: " + Object.entries(r).map(([k, v]) => "".concat(k, " ").concat(v.ok ? "\u2713" : "\u2715")).join(", "));
      } catch (e) {
        m(e.message, false);
      }
    };
    $("#saveai").onclick = async () => {
      try {
        const en = {};
        document.querySelectorAll("[data-ai]").forEach((c) => en[c.dataset.ai] = c.checked);
        await api("/api/settings", { method: "POST", body: { aiEnabled: en, prices: JSON.parse($("#prices").value) } });
        m("IA guardada.");
      } catch (e) {
        m(e.message, false);
      }
    };
    $("#saveother").onclick = async () => {
      try {
        await api("/api/settings", { method: "POST", body: { universe: $("#univ").value.split(/[,\s]+/).filter(Boolean), payouts: JSON.parse($("#pay").value), allowSingleSource: $("#single").checked } });
        m("Guardado.");
      } catch (e) {
        m(e.message, false);
      }
    };
    if ($("#ntest")) $("#ntest").onclick = async () => {
      try {
        await api("/api/notify/test", { method: "POST" });
        $("#nm").className = "msg ok";
        $("#nm").textContent = "Aviso enviado: revisa tu celular.";
      } catch (e) {
        $("#nm").className = "msg err";
        $("#nm").textContent = e.message;
      }
    };
    document.querySelectorAll("[data-act]").forEach((b) => b.onclick = async () => {
      try {
        await api("/api/users/".concat(b.dataset.act, "/active"), { method: "POST", body: { active: b.dataset.on === "1" } });
        render();
      } catch (err) {
        $("#um").className = "msg err";
        $("#um").textContent = err.message;
      }
    });
    document.querySelectorAll("[data-pw]").forEach((b) => b.onclick = () => {
      const td = b.parentElement;
      td.innerHTML = '<form class="row" style="gap:6px;justify-content:flex-end"><input type="text" minlength="10" placeholder="vac\xEDa = autom\xE1tica" style="width:160px" autocomplete="off"><button class="btn sm">Guardar</button></form>';
      td.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          const r = await api("/api/users/".concat(b.dataset.pw, "/password"), { method: "POST", body: { password: td.querySelector("input").value } });
          td.innerHTML = r.password ? '<span class="good">Nueva: <b style="font-family:ui-monospace,monospace;user-select:all">'.concat(esc(r.password), '</b></span><div class="note">D\xE1sela ahora; no se vuelve a mostrar.</div>') : '<span class="good">Contrase\xF1a cambiada</span>';
        } catch (err) {
          td.insertAdjacentHTML("beforeend", '<div class="msg err">'.concat(esc(err.message), "</div>"));
        }
      };
    });
    const showPw = (who, pw) => '<div class="msg ok" style="font-size:16px;line-height:1.6">Usuario <b>'.concat(esc(who), '</b> listo. Su contrase\xF1a es: <b style="font-family:ui-monospace,monospace;font-size:20px;user-select:all">').concat(esc(pw), '</b><br><span class="note">C\xF3piala y d\xE1sela ahora: no se vuelve a mostrar. \xC9l la puede cambiar en Mi perfil.</span></div>');
    $("#uf").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api("/api/users", { method: "POST", body: { displayName: $("#nn").value, username: $("#nu").value, password: $("#np").value, monthlyCap: Number($("#nm").value), dailyCap: Number($("#nm").value) / 10 } });
        if (r.password) {
          $("#um").className = "";
          $("#um").innerHTML = showPw($("#nu").value, r.password) + '<button class="btn ghost sm" id="umok" style="margin-top:8px">Ya la copi\xE9</button>';
          $("#umok").onclick = () => render();
        } else {
          $("#um").className = "msg ok";
          $("#um").textContent = "Usuario creado.";
          setTimeout(render, 900);
        }
      } catch (err) {
        $("#um").className = "msg err";
        $("#um").textContent = err.message;
      }
    };
  };
  function barChart(items, { fmt = (v) => v, h = 30, label = "" } = {}) {
    if (!(items == null ? void 0 : items.length)) return '<div class="empty">Sin datos todav\xEDa.</div>';
    const max = Math.max(...items.map((i) => Math.abs(i.value)), 1e-9), neg = items.some((i) => i.value < 0);
    const W = 600, LW = Math.min(250, Math.max(90, Math.max(...items.map((i) => String(i.label).length)) * 7.8 + 18)), VW = 86, BW = W - LW - VW, zero = neg ? LW + BW / 2 : LW, scale = neg ? BW / 2 : BW;
    return '<svg viewBox="0 0 '.concat(W, " ").concat(items.length * h + 8, '" width="100%" style="max-width:760px;display:block" role="img" aria-label="').concat(esc(label), '">\n    ').concat(neg ? '<line x1="'.concat(zero, '" x2="').concat(zero, '" y1="0" y2="').concat(items.length * h + 8, '" stroke="var(--line)"/>') : "", "\n    ").concat(items.map((it, i) => {
      const w = Math.abs(it.value) / max * scale, x = it.value >= 0 ? zero : zero - w, y = i * h + 4, col = it.color || (it.value >= 0 ? "var(--good)" : "var(--bad)");
      return '<text x="'.concat(LW - 10, '" y="').concat(y + h / 2 + 5, '" text-anchor="end" font-size="14" fill="').concat(it.dim && !it.color ? "var(--mute)" : "var(--ink)", '" font-weight="').concat(it.bold ? 800 : 500, '">').concat(esc(it.label), '</text>\n      <rect x="').concat(x, '" y="').concat(y + 3, '" width="').concat(Math.max(2, w), '" height="').concat(h - 9, '" rx="4" fill="').concat(col, '" opacity="').concat(it.dim ? 0.45 : 0.9, '"/>\n      <text x="').concat(W - 4, '" y="').concat(y + h / 2 + 5, '" text-anchor="end" font-size="14" fill="var(--ink)" font-weight="700">').concat(esc(fmt(it.value)), "</text>");
    }).join(""), "\n  </svg>");
  }
  function rangeChart(rows, { fmt = (v) => pctp(v), label = "" } = {}) {
    if (!(rows == null ? void 0 : rows.length)) return '<div class="empty">Faltan datos para estimar escenarios.</div>';
    const W = 760, LW = 90, RW = 20, h = 46, vals = rows.flatMap((r) => [r.bad, r.good, 0]), min = Math.min(...vals), max = Math.max(...vals), sp = max - min || 1;
    const x = (v) => LW + (v - min) / sp * (W - LW - RW);
    return '<svg viewBox="0 0 '.concat(W, " ").concat(rows.length * h + 26, '" width="100%" role="img" aria-label="').concat(esc(label), '">\n    <line x1="').concat(x(0), '" x2="').concat(x(0), '" y1="0" y2="').concat(rows.length * h, '" stroke="var(--mute)" stroke-dasharray="4 4"/><text x="').concat(x(0), '" y="').concat(rows.length * h + 18, '" text-anchor="middle" font-size="12" fill="var(--mute)">0%</text>\n    ').concat(rows.map((r, i) => {
      const y = i * h + 10;
      return '<text x="'.concat(LW - 10, '" y="').concat(y + 16, '" text-anchor="end" font-size="13" font-weight="700" fill="var(--ink)">').concat(esc(r.label), '</text>\n      <rect x="').concat(x(Math.min(r.bad, 0)), '" y="').concat(y + 6, '" width="').concat(Math.max(1, x(Math.min(0, r.good)) - x(Math.min(r.bad, 0))), '" height="14" rx="7" fill="var(--bad)" opacity=".35"/>\n      <rect x="').concat(x(Math.max(r.bad, 0)), '" y="').concat(y + 6, '" width="').concat(Math.max(1, x(r.good) - x(Math.max(r.bad, 0))), '" height="14" rx="7" fill="var(--good)" opacity=".35"/>\n      <circle cx="').concat(x(r.probable), '" cy="').concat(y + 13, '" r="7" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>\n      <text x="').concat(x(r.bad), '" y="').concat(y + 38, '" text-anchor="middle" font-size="11.5" fill="var(--bad)">').concat(esc(fmt(r.bad)), '</text>\n      <text x="').concat(x(r.probable), '" y="').concat(y + 38, '" text-anchor="middle" font-size="11.5" font-weight="800" fill="var(--accent)">').concat(esc(fmt(r.probable)), '</text>\n      <text x="').concat(x(r.good), '" y="').concat(y + 38, '" text-anchor="middle" font-size="11.5" fill="var(--good)">').concat(esc(fmt(r.good)), "</text>");
    }).join(""), "\n  </svg>");
  }
  function compareLine(a, b, markers = [], { label = "" } = {}) {
    if (!(a == null ? void 0 : a.length)) return '<div class="empty">Sin precios.</div>';
    const bm = new Map((b || []).map((p) => [p[0], p[1]])), a0 = a[0][1], b0 = bm.get(a[0][0]);
    const A = a.map((p) => [p[0], (p[1] / a0 - 1) * 100]), B = b0 ? a.filter((p) => bm.has(p[0])).map((p) => [p[0], (bm.get(p[0]) / b0 - 1) * 100]) : null;
    const W = 760, H = 230, L = 46, R = 70, all = [...A, ...B || []].map((p) => p[1]), min = Math.min(0, ...all), max = Math.max(0, ...all), sp = max - min || 1;
    const idx = new Map(a.map((p, i) => [p[0], i])), x = (i) => L + i / (a.length - 1) * (W - L - R), y = (v) => 10 + (1 - (v - min) / sp) * (H - 40);
    const path = (pts) => pts.map((p) => "".concat(p === pts[0] ? "M" : "L").concat(x(idx.get(p[0])).toFixed(1), " ").concat(y(p[1]).toFixed(1))).join(" ");
    const col = { verde: "var(--good)", amarillo: "var(--warn)", rojo: "var(--bad)" };
    return '<svg viewBox="0 0 '.concat(W, " ").concat(H, '" width="100%" role="img" aria-label="').concat(esc(label), '">\n    ').concat([min, (min + max) / 2, max].map((t) => '<line x1="'.concat(L, '" x2="').concat(W - R, '" y1="').concat(y(t), '" y2="').concat(y(t), '" stroke="var(--line)"/><text x="').concat(L - 6, '" y="').concat(y(t) + 4, '" text-anchor="end" font-size="11" fill="var(--mute)">').concat(t >= 0 ? "+" : "").concat(t.toFixed(0), "%</text>")).join(""), '\n    <line x1="').concat(L, '" x2="').concat(W - R, '" y1="').concat(y(0), '" y2="').concat(y(0), '" stroke="var(--mute)" stroke-dasharray="3 4"/>\n    ').concat(B ? '<path d="'.concat(path(B), '" fill="none" stroke="var(--mute)" stroke-width="1.8" stroke-dasharray="6 5"/><text x="').concat(W - R + 6, '" y="').concat(y(B.at(-1)[1]) + 4, '" font-size="12" fill="var(--mute)">Mercado</text>') : "", '\n    <path d="').concat(path(A), '" fill="none" stroke="var(--accent)" stroke-width="2.6"/><text x="').concat(W - R + 6, '" y="').concat(y(A.at(-1)[1]) + 4, '" font-size="12" font-weight="800" fill="var(--accent)">').concat(A.at(-1)[1] >= 0 ? "+" : "").concat(A.at(-1)[1].toFixed(1), "%</text>\n    ").concat(markers.filter((m) => idx.has(m.date)).map((m) => '<circle cx="'.concat(x(idx.get(m.date)), '" cy="').concat(y(A[idx.get(m.date)][1]), '" r="6" fill="').concat(col[m.light] || "var(--accent)", '" stroke="var(--panel)" stroke-width="2"><title>').concat(esc(m.date), ": JARVIS dijo ").concat(esc(m.light)).concat(m.correct == null ? " (pendiente)" : m.correct ? " \u2014 acert\xF3" : " \u2014 fall\xF3", "</title></circle>")).join(""), '\n    <text x="').concat(L, '" y="').concat(H - 6, '" font-size="11" fill="var(--mute)">').concat(esc(a[0][0]), '</text><text x="').concat(W - R, '" y="').concat(H - 6, '" text-anchor="end" font-size="11" fill="var(--mute)">').concat(esc(a.at(-1)[0]), "</text>\n  </svg>");
  }
  function freqChart(freq, expected, highlight) {
    const keys = Object.keys(freq).sort(), max = Math.max(...Object.values(freq), expected * 1.5, 1), W = 760, H = 190, bw = (W - 30) / 100;
    const y = (v) => 28 + (1 - v / max) * (H - 54);
    return '<svg viewBox="0 0 '.concat(W, " ").concat(H, '" width="100%" role="img" aria-label="Veces que sali\xF3 cada n\xFAmero">\n    ').concat(keys.map((k, i) => '<rect x="'.concat(20 + i * bw, '" y="').concat(y(freq[k]), '" width="').concat(bw - 1.5, '" height="').concat(H - 26 - y(freq[k]), '" fill="').concat(k === highlight ? "var(--warn)" : "var(--accent)", '" opacity="').concat(k === highlight ? 1 : 0.55, '"><title>').concat(k, ": ").concat(freq[k], " veces</title></rect>")).join(""), '\n    <line x1="20" x2="').concat(W - 10, '" y1="').concat(y(expected), '" y2="').concat(y(expected), '" stroke="var(--bad)" stroke-dasharray="5 4"/><text x="22" y="14" font-size="12" fill="var(--bad)">- - - esperado por azar: ').concat(expected.toFixed(1), " veces</text>\n    ").concat(["00", "25", "50", "75", "99"].map((k) => '<text x="'.concat(20 + Number(k) * bw + bw / 2, '" y="').concat(H - 10, '" text-anchor="middle" font-size="11" fill="var(--mute)">').concat(k, "</text>")).join(""), "\n  </svg>");
  }
  const pctp = (v, d = 1) => v == null || isNaN(v) ? "\u2014" : (v >= 0 ? "+" : "\u2212") + Math.abs(v * 100).toFixed(d) + "%";
  const KIND = { dato: ["dato", "Dato confirmado"], estimacion: ["est", "Estimaci\xF3n"], opinion: ["opinion", "Opini\xF3n de IA"], noticia: ["est", "Noticia sin confirmar"] };
  const kindTag = (k) => '<span class="tag '.concat((KIND[k] || KIND.dato)[0], '">').concat((KIND[k] || KIND.dato)[1], "</span>");
  function sourcesList(src) {
    return '<div style="display:flex;flex-direction:column;gap:8px">'.concat(src.map((s, i) => '<div style="display:flex;gap:10px;align-items:flex-start"><span class="mono note" style="min-width:26px">['.concat(i + 1, "]</span>").concat(kindTag(s.kind), '<div style="min-width:0">').concat(s.url ? '<a href="'.concat(esc(s.url), '" target="_blank" rel="noopener">').concat(esc(s.label), "</a>") : esc(s.label)).concat(s.at ? '<div class="note">'.concat(esc(String(s.at).slice(0, 16).replace("T", " ")), "</div>") : "", "</div></div>")).join(""), "</div>");
  }
  function qaAccordion(c) {
    const Q = [["\u{1F4A1}", "\xBFPor qu\xE9?", c.why], ["\u{1F4CA}", "\xBFQu\xE9 pruebas la respaldan?", c.evidence], ["\u{1F3AF}", "\xBFQu\xE9 posibilidades tiene?", c.chance], ["\u23F3", "\xBFEl dinero se gana de inmediato o en cu\xE1nto tiempo?", c.when], ["\u26A0\uFE0F", "\xBFCu\xE1les son los riesgos?", c.risks], ["\u{1F9EF}", "\xBFQu\xE9 podr\xEDa hacerla fallar?", c.failIf], ["\u{1F916}", "\xBFQu\xE9 dicen las otras IA?", c.ias], ["\u2705", "\xBFQu\xE9 conviene m\xE1s?", [c.best, c.amount]]].filter((q) => q[2]);
    return '<div class="acc">'.concat(Q.map(([ic, q, a], i) => "<details".concat(i === 0 ? " open" : "", '><summary><span class="ic">').concat(ic, "</span>").concat(q, '</summary><div class="ans">').concat(Array.isArray(a) ? "<ul>".concat(a.filter(Boolean).map((x) => "<li>".concat(esc(x), "</li>")).join(""), "</ul>") : esc(a), "</div></details>")).join(""), "</div>");
  }
  function sizeCard(z, budget, lightName) {
    return '<section class="card sizecard"><h2>\xBFCu\xE1nto pongo con mi dinero?</h2>\n    <div class="sz"><div><div class="note">Tu dinero para invertir</div><div class="sz-v">'.concat(usd(budget.usd, 0), '</div><a class="note" href="#bolsa">cambiar \u25B8</a></div>\n    <div class="sz-arrow">\u2192</div><div><div class="note">Te recomiendo poner</div><div class="sz-v ').concat(z.usd ? "good" : "bad", '">').concat(z.usd ? usd(z.usd, 0) : "US$0", '</div><div class="note">').concat(z.usd ? "".concat(z.pct, "% de tu dinero") : "no inviertas en esta", '</div></div>\n    <div class="sz-more ').concat(z.canMore ? "yes" : "no", '"><b>\xBFPuedo poner m\xE1s?</b><div>').concat(esc(z.more), "</div></div></div>\n    ").concat(z.usd ? '<details class="note" style="margin-top:10px"'.concat(z.canMore ? "" : " open", "><summary>\xBFPor qu\xE9? Las 5 condiciones para poder poner m\xE1s (hasta ").concat(myStyle().max * 100, '% de tu dinero)</summary><div class="note" style="margin-top:6px">\u2713 = se cumple \xB7 \u2715 = todav\xEDa no. Se necesitan las 5 para poner m\xE1s.</div><div class="checks" style="margin-top:8px">').concat(z.checks.map((c) => '<div class="ck '.concat(c.ok ? "ok" : "no", '">').concat(c.ok ? "\u2713" : "\u2715", " ").concat(esc(c.text), "</div>")).join(""), "</div></details>") : "", "\n    ").concat(z.note ? '<div class="note" style="margin-top:6px">'.concat(esc(z.note), "</div>") : "", '\n    <div class="note" style="margin-top:8px">Regla seg\xFAn tu estilo: "S\xED, invierte" = ').concat(myStyle().verde * 100, '% de tu dinero por idea; "Invierte poco" = ').concat(myStyle().amarillo * 100, "%; nunca m\xE1s de ").concat(myStyle().max * 100, '% en una sola, y siempre guarda al menos 10% en efectivo. \xBFVas a poner mucho m\xE1s? Usa <a href="#buscar">Buscar a mi medida</a> y JARVIS revisa tu apuesta.</div></section>');
  }
  function timingCard(a) {
    const t = a.timing;
    if (!t) return "";
    const rows = t.horizons.map((h) => {
      var _a, _b;
      const n = Math.round(h.pProfit * 10), col = h.pProfit >= 0.66 ? "var(--good)" : h.pProfit >= 0.5 ? "var(--warn)" : "var(--bad)";
      return '<div class="tl-row'.concat(((_a = t.recommended) == null ? void 0 : _a.days) === h.days ? " rec" : "", '"><span class="tl-l">').concat(esc(h.label), '</span><span class="dots">').concat(Array.from({ length: 10 }, (_, i) => "<i".concat(i < n ? ' style="background:'.concat(col, ";border-color:").concat(col, '"') : "", "></i>")).join(""), '</span><span class="tl-n"><b>').concat(n, ' de 10</b> veces ganando</span><span class="tl-m note">lo normal: ').concat(pctp(h.median)).concat(((_b = t.recommended) == null ? void 0 : _b.days) === h.days ? ' \xB7 <b class="good">tiempo recomendado</b>' : "", "</span></div>");
    }).join("");
    const tt = t.toTarget, rc = t.recovery;
    return '<section class="card"><h2>\xBFEn cu\xE1nto tiempo se gana el dinero?</h2>'.concat(takeaway(esc(t.summary)), '\n    <div class="grid split" style="gap:20px">\n      <div><div class="note" style="margin-bottom:8px">Si alguien compraba cualquier d\xEDa de los \xFAltimos ').concat(t.yearsUsed, ' a\xF1os y esperaba\u2026</div><div class="tl">').concat(rows, '</div></div>\n      <div class="mini3 tl-facts">\n        <div class="pbox"><div class="l">Subir ').concat(tt ? Math.round(tt.target * 100) : 5, '% tard\xF3 normalmente</div><div class="v">').concat((tt == null ? void 0 : tt.median) != null ? humanDays(tt.median) : "\u2014", '</div><div class="note">').concat((tt == null ? void 0 : tt.median) != null ? "a veces ".concat(humanDays(tt.fast), "; 1 de cada 4, m\xE1s de ").concat(humanDays(tt.slow)) : "casi nunca lleg\xF3", '</div></div>\n        <div class="pbox"><div class="l">Si empez\xF3 perdiendo, recuperarse tard\xF3</div><div class="v">').concat((rc == null ? void 0 : rc.median) != null ? humanDays(rc.median) : "\u2014", '</div><div class="note">').concat(rc ? "".concat(Math.round(rc.neverPct * 100), "% no se recuper\xF3 en 2 a\xF1os") : "sin casos suficientes", '</div></div>\n        <div class="pbox"><div class="l">No lleg\xF3 a +').concat(tt ? Math.round(tt.target * 100) : 5, '% en un a\xF1o</div><div class="v ').concat(tt && tt.neverPct > 0.3 ? "bad" : "", '">').concat(tt ? Math.round(tt.neverPct * 100) + "%" : "\u2014", '</div><div class="note">de las veces</div></div>\n      </div>\n    </div>\n    <h3 class="cs-h">\xBFCu\xE1ndo tienes el dinero en la mano?</h3>\n    <div class="cash">').concat(a.cashSteps.map((st, i) => '<div class="cs"><i>'.concat(i + 1, "</i><b>").concat(esc(st.step), '</b><span class="note">').concat(esc(st.note)).concat(st.url ? ' <a href="'.concat(esc(st.url), '" target="_blank" rel="noopener">Fuente \u25B8</a>') : "", "</span></div>")).join(""), '</div>\n    <div class="note" style="margin-top:10px">').concat(kindTag("estimacion"), " Medido con ").concat(esc(t.basedOn), ". Es lo que pas\xF3 antes, no una promesa: el futuro puede ser distinto.</div></section>");
  }
  function realtimeBox(a) {
    var _a, _b;
    return '<div class="card"><h2>En tiempo real <span class="more note">an\xE1lisis del '.concat(esc(a.createdAt.slice(0, 16).replace("T", " ")), " \xB7 se rehace cuando llegan datos nuevos</span></h2>\n    ").concat(((_a = a.changes) == null ? void 0 : _a.length) ? '<div class="answer" style="margin-bottom:10px"><b>Cambi\xF3 desde el an\xE1lisis anterior:</b>'.concat(a.changes.map((c) => "<div>\u2022 ".concat(esc(c), "</div>")).join(""), "</div>") : '<div class="note" style="margin-bottom:10px">Sin cambios desde el \xFAltimo an\xE1lisis.</div>', "\n    ").concat(((_b = a.timeline) == null ? void 0 : _b.length) > 1 ? "<details><summary>C\xF3mo evolucion\xF3 el an\xE1lisis (".concat(a.timeline.length, ' versiones selladas) \u25B8</summary><table style="margin-top:8px"><tr><th>Fecha</th><th>Sem\xE1foro</th><th class="r">Probabilidad</th><th class="r">Precio</th></tr>').concat(a.timeline.map((t) => "<tr><td>".concat(esc(t.at.slice(0, 16).replace("T", " ")), "</td><td>").concat(t.light ? light(t.light) : "\u2014", '</td><td class="r">').concat(t.probBeat != null ? Math.round(t.probBeat * 100) + "%" : "\u2014", '</td><td class="r">').concat(t.price ? usd(t.price) : "\u2014", "</td></tr>")).join(""), "</table></details>") : "", "</div>");
  }
  function narrativeBox(a) {
    return '<div class="card"><h2>Explicaci\xF3n del analista (IA) <span class="more note">usa solo los datos de este an\xE1lisis</span></h2><div id="narr">'.concat(a.narrative ? '<div class="answer">'.concat(esc(a.narrative), '<div class="note" style="margin-top:6px">Escrita por ').concat(esc(a.narrativeBy || "IA"), ' \xB7 <span class="tag opinion">Opini\xF3n de IA</span> basada en los datos</div></div>') : '<button class="btn" id="explain" data-id="'.concat(a.id, '">Explic\xE1rmelo en palabras simples</button><div class="note" style="margin-top:6px">Usa la IA de pago una vez por an\xE1lisis (centavos) y queda guardada.</div>'), "</div></div>");
  }
  views.analisis = async (arg) => {
    var _a, _b, _c;
    if (arg.startsWith("loteria/")) return lotteryAnalysisView(arg.split("/")[1]);
    const a = await api("/api/analysis/stock/" + encodeURIComponent(arg));
    if (a.empty) return '<div class="card empty">'.concat(esc(a.message), "</div>");
    const c = a.conclusion, pr = a.profile, nm = (pr == null ? void 0 : pr.name) || coName(a.symbol), s6 = a.scenarios[1];
    const col = a.light === "verde" ? "good" : a.light === "amarillo" ? "warn" : "bad";
    const myAmt = (_b = (_a = a.size) == null ? void 0 : _a.usd) != null ? _b : a.amountUsd;
    const todo = a.light === "verde" ? "S\xED, invierte ".concat(usd(myAmt, 0)) : a.light === "amarillo" ? "Invierte poco: ".concat(usd(myAmt, 0)) : "No inviertas ahora";
    const y1 = a.periods.find((p) => p.label === "1 a\xF1o"), beatN = a.periods.filter((p) => p.stock != null && p.market != null && p.stock > p.market).length;
    const fav = a.contributions.slice().sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution))[0];
    const bestOther = a.compare.filter((o) => !o.current).sort((x, y) => y.probBeat - x.probBeat)[0];
    const tm = a.timing, h1w = tm == null ? void 0 : tm.horizons.find((h) => h.days === 5);
    return '<div class="note"><a href="#recomendaciones">Recomendaciones</a> \u203A '.concat(esc(nm), ' \u203A An\xE1lisis completo</div>\n  <section class="card ahead">\n    ').concat((pr == null ? void 0 : pr.image) ? '<img src="'.concat(esc(pr.image), '" alt="').concat(esc(nm), '" class="coimg">') : coBadge(a.symbol, 84), '\n    <div style="min-width:0"><h1>').concat(esc(nm), ' <span class="muted" style="font-size:16px">').concat(esc(a.symbol), " \xB7 ").concat(usd(a.price.value), " \xB7 ").concat(esc(a.price.status), "</span></h1>\n      ").concat(pr ? '<div class="sub">'.concat(esc(pr.description || ""), '</div><div class="note" style="margin-top:4px;max-width:80ch">').concat(esc(pr.extract), ' <a href="').concat(esc(pr.url), '" target="_blank" rel="noopener">').concat(esc(pr.source), " \u25B8</a></div>") : '<div class="sub">'.concat(a.symbol === "SPY" ? "Fondo que copia a las 500 empresas m\xE1s grandes de EE. UU." : "Empresa que cotiza en la bolsa de Estados Unidos.", "</div>"), '</div>\n    <div></div></section>\n\n  <section class="card summary10" style="border-color:var(--').concat(col, ')"><div class="s10-h">Resumen en 10 segundos</div>\n    <div class="s10">\n      <div class="tile"><div class="q">\xBFTe recomiendo invertir?</div><div class="a ').concat(col, '">').concat(todo, '</div><div class="note">').concat(esc(c.headline.replace(/^[^:]+:\s*/, "")), '</div></div>\n      <div class="tile"><div class="q">Si pones ').concat(usd(myAmt || baseAmt("verde"), 0), ", en 6 meses quedar\xEDas con\u2026</div>").concat(moneyRange(myAmt || baseAmt("verde"), s6 ? { bad: (myAmt || baseAmt("verde")) * s6.bad, probable: (myAmt || baseAmt("verde")) * s6.probable, good: (myAmt || baseAmt("verde")) * s6.good } : null), '<div class="note">').concat(s6 ? "Chance de terminar perdiendo: ".concat(Math.round(s6.lossChance * 100), " de cada 100") : "", '</div></div>\n      <div class="tile"><div class="q">\xBFQu\xE9 tan seguido le gana al mercado?</div>').concat(chanceDots(a.probBeat, { big: true }), '<div class="note">').concat(a.probMethod === "calibrado" ? "Medido con casos reales parecidos" : "Estimaci\xF3n inicial: se ajusta con resultados reales", '</div></div>\n      <div class="tile"><div class="q">\xBFLa ganancia es inmediata?</div>').concat(tm ? '<div class="a '.concat(tm.immediate ? "good" : "warn", '">').concat(tm.immediate ? "Puede ser en semanas" : tm.recommended ? "No: d\xE9jala ".concat(esc(tm.recommended.label)) : "No: d\xE9jala 1 a\xF1o o m\xE1s", '</div><div class="note">').concat(h1w ? "En 1 semana estuvo ganando ".concat(Math.round(h1w.pProfit * 10), " de cada 10 veces") : "").concat(tm.recommended && !tm.immediate ? "; en ".concat(esc(tm.recommended.label), ", ").concat(Math.round(tm.horizons.find((h) => h.days === tm.recommended.days).pProfit * 10), " de cada 10.") : !tm.recommended && tm.horizons.length ? "; en ".concat(esc(tm.horizons.at(-1).label), ", ").concat(Math.round(tm.horizons.at(-1).pProfit * 10), " de cada 10.") : ".").concat(((_c = tm.toTarget) == null ? void 0 : _c.median) != null ? " Subir 5% tard\xF3 normalmente ".concat(humanDays(tm.toTarget.median), ".") : "", "</div>") : '<div class="note">Faltan precios para medirlo.</div>', "</div>\n    </div></section>\n\n  ").concat(a.size ? sizeCard(a.size, a.budget, a.light) : "", '\n  <section class="card"><h2>Las preguntas, respondidas</h2>').concat(qaAccordion(c), "</section>\n  ").concat(timingCard(a), '\n  <section class="grid split">\n    <div class="card"><h2>Su precio en el \xFAltimo a\xF1o, contra el mercado</h2>').concat(takeaway(y1 && y1.stock != null && y1.market != null ? "en un a\xF1o ".concat(esc(nm), " ").concat(y1.stock >= 0 ? "subi\xF3" : "baj\xF3", " ").concat(Math.abs(Math.round(y1.stock * 100)), "% y el mercado ").concat(y1.market >= 0 ? "subi\xF3" : "baj\xF3", " ").concat(Math.abs(Math.round(y1.market * 100)), "%: <b>").concat(y1.stock > y1.market ? "le gan\xF3" : "qued\xF3 por debajo", "</b>.") : "")).concat(compareLine(a.chart, a.benchChart, a.past, { label: nm + " contra el mercado" }), '<div class="legend"><span><i style="background:var(--accent)"></i>').concat(esc(nm), '</span><span><i style="background:var(--mute)"></i>El mercado</span><span>\u25CF Recomendaciones pasadas de JARVIS (toca un punto para ver si acert\xF3)</span></div></div>\n    <div class="card"><h2>\xBFLe gan\xF3 al mercado?</h2>').concat(takeaway("le gan\xF3 al mercado en <b>".concat(beatN, " de ").concat(a.periods.length, "</b> periodos."))).concat(barChart(a.periods.flatMap((p) => {
      var _a2, _b2;
      return [{ label: p.label + " \xB7 " + a.symbol, value: (_a2 = p.stock) != null ? _a2 : 0, bold: true }, { label: "mercado", value: (_b2 = p.market) != null ? _b2 : 0, dim: true }];
    }), { fmt: (v) => pctp(v), label: "Rendimiento por periodo" }), '\n      <table style="margin-top:8px"><tr><th>Periodo</th><th class="r">').concat(esc(a.symbol), '</th><th class="r">Mercado</th><th>\xBFLe gan\xF3?</th></tr>').concat(a.periods.map((p) => "<tr><td>".concat(esc(p.label), '</td><td class="r ').concat(cls(p.stock), '">').concat(pctp(p.stock), '</td><td class="r">').concat(pctp(p.market), "</td><td>").concat(p.stock == null || p.market == null ? "\u2014" : p.stock > p.market ? '<span class="good">S\xED</span>' : '<span class="bad">No</span>', "</td></tr>")).join(""), '</table>\n      <div class="note">Barras claras: el mercado en el mismo periodo. ').concat(kindTag("dato"), '</div></div>\n  </section>\n  <section class="grid split">\n    <div class="card"><h2>Contra las otras opciones de hoy</h2>').concat(takeaway(bestOther && bestOther.probBeat > a.probBeat ? "hoy <b>".concat(esc(coName(bestOther.symbol)), "</b> tiene m\xE1s chance (").concat(Math.round(bestOther.probBeat * 10), " de cada 10).") : "".concat(esc(nm), " est\xE1 entre las de m\xE1s chance hoy."))).concat(barChart(a.compare.slice().sort((x, y) => y.probBeat - x.probBeat).map((o) => ({ label: coName(o.symbol), value: o.probBeat, bold: o.current, color: o.light === "verde" ? "var(--good)" : o.light === "amarillo" ? "var(--warn)" : "var(--bad)", dim: !o.current })), { fmt: (v) => Math.round(v * 10) + " de 10", label: "De cada 10 veces, cu\xE1ntas le gana al mercado" }), '\n      <div class="note">De cada 10 veces, cu\xE1ntas le ganar\xEDa al mercado (').concat(kindTag("estimacion"), '). Color = qu\xE9 hacer.</div></div>\n    <div class="card"><h2>Qu\xE9 pes\xF3 en la decisi\xF3n</h2>').concat(takeaway(fav ? "lo que m\xE1s pes\xF3 fue <b>".concat(esc((FACTOR[fav.factor] || fav.factor).toLowerCase()), "</b>, ").concat(fav.contribution >= 0 ? "a favor" : "en contra", ".") : "")).concat(whyBars(a.contributions), '<div class="mini3" style="margin-top:14px"><div class="pbox"><div class="l">Sube y baja al a\xF1o</div><div class="v">').concat(Math.round(a.stats.vol * 100), '%</div></div><div class="pbox"><div class="l">Su peor ca\xEDda (1 a\xF1o)</div><div class="v bad">').concat(pctp(a.stats.maxDrawdown, 0), '</div></div><div class="pbox"><div class="l">Contra su promedio de 50 d\xEDas</div><div class="v">').concat(a.stats.sma50 ? pctp(a.stats.last / a.stats.sma50 - 1) : "\u2014", '</div></div></div></div>\n  </section>\n  <section class="grid split">\n    <div class="card"><h2>\xBFQu\xE9 podr\xEDa pasar en el futuro?</h2>').concat(takeaway(s6 ? "con US$10, en 6 meses lo m\xE1s probable es <b>".concat(s6.probable >= 0 ? "ganar" : "perder", " ").concat(usd(Math.abs(10 * s6.probable)), "</b>; en un mal caso, ").concat(s6.bad >= 0 ? "ganar" : "perder", " ").concat(usd(Math.abs(10 * s6.bad)), ".") : "")).concat(rangeChart(a.scenarios, { label: "Escenarios" }), '<div class="note">Rojo: zona de p\xE9rdida \xB7 verde: zona de ganancia \xB7 punto: lo m\xE1s probable. ').concat(kindTag("estimacion"), ' hecha con 3 a\xF1os de movimientos reales; no es una promesa.</div></div>\n    <div class="card"><h2>La empresa por dentro</h2>').concat(a.fundamentals.revenue.length >= 2 ? takeaway("sus ventas ".concat(a.fundamentals.revenue.at(-1).value >= a.fundamentals.revenue[0].value ? "crecieron" : "bajaron", " de ").concat(usd(a.fundamentals.revenue[0].value / 1e9, 0), " a ").concat(usd(a.fundamentals.revenue.at(-1).value / 1e9, 0), " mil millones.")) : "").concat(a.fundamentals.revenue.length ? barChart([...a.fundamentals.revenue.map((r) => ({ label: "Ingresos " + r.period, value: r.value / 1e9, color: "var(--accent)" })), ...a.fundamentals.netIncome.map((r) => ({ label: "Ganancia " + r.period, value: r.value / 1e9 }))], { fmt: (v) => usd(v, 1) + " mil M", label: "Ingresos y ganancias" }) + '<div class="note">'.concat(kindTag("dato"), " SEC EDGAR, informes 10-K.</div>") : '<div class="empty">Sin informes oficiales cargados todav\xEDa (los fondos no los presentan).</div>', '</div>\n  </section>\n  <section class="grid split">\n    <div class="card"><h2>Qu\xE9 opinan las IA ').concat(a.debate ? '<a class="more" href="#debate/'.concat(a.debate.id, '">Ver debate completo \u25B8</a>') : "", "</h2>").concat(a.opinions.length ? a.opinions.map((o) => '<div class="pbox" style="margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center"><b>'.concat(esc(o.agent), '</b><span class="tag opinion">').concat(esc(o.stance.replace("_", " ")), "</span>").concat(o.probBeat != null ? '<span class="note">'.concat(Math.round(o.probBeat * 100), "% de ganarle al mercado</span>") : "", '<span class="note" style="margin-left:auto">').concat(esc(o.date || ""), " \xB7 ").concat(o.correct == null ? "resultado pendiente" : o.correct ? "\u2713 acert\xF3" : "\u2715 fall\xF3", '</span></div><div style="margin-top:4px">').concat(esc(o.argument), "</div></div>")).join("") : '<div class="empty">Todav\xEDa no hay debate sobre esta acci\xF3n.</div>', "\n      ").concat(a.iaTrack.length ? '<div class="note">Historial de aciertos de cada IA: '.concat(a.iaTrack.map((t) => "".concat(esc(t.agent), " ").concat(t.hitRate, "% (").concat(t.n, " casos)")).join(" \xB7 "), "</div>") : "", '</div>\n    <div class="card"><h2>Noticias</h2>').concat(a.news.length ? a.news.map((n) => '<div style="padding:8px 0;border-top:1px solid var(--line)">'.concat(n.polemic >= 2 ? '<span class="tag" style="background:var(--bad-bg);color:var(--bad)">Pol\xE9mica'.concat(n.verified ? " confirmada" : "", "</span> ") : "", '<a href="').concat(esc(n.url), '" target="_blank" rel="noopener">').concat(esc(n.title), '</a><div class="note">').concat(esc(n.summary || ""), " \xB7 ").concat(esc(n.source), "</div></div>")).join("") : '<div class="empty">Sin noticias recientes.</div>', '</div>\n  </section>\n  <section class="grid split">').concat(narrativeBox(a)).concat(realtimeBox(a), '</section>\n  <section class="card"><h2>Fuentes y pruebas</h2>').concat(sourcesList(a.sources), '<div class="note" style="margin-top:10px">Este an\xE1lisis qued\xF3 sellado: no se puede cambiar despu\xE9s de conocer el resultado.</div></section>');
  };
  views.analisis.after = () => {
    const b = $("#explain");
    if (!b) return;
    b.onclick = async () => {
      b.disabled = true;
      b.textContent = "Pensando\u2026";
      try {
        const r = await api("/api/analysis/".concat(b.dataset.id, "/explain"), { method: "POST" });
        $("#narr").innerHTML = r.text ? '<div class="answer">'.concat(esc(r.text), '<div class="note" style="margin-top:6px">Escrita por ').concat(esc(r.by), ' \xB7 <span class="tag opinion">Opini\xF3n de IA</span></div></div>') : '<div class="msg err">'.concat(esc(r.error), "</div>");
      } catch (e) {
        $("#narr").innerHTML = '<div class="msg err">'.concat(esc(e.message), "</div>");
      }
    };
  };
  async function lotteryAnalysisView(game) {
    const a = await api("/api/analysis/lottery/" + encodeURIComponent(game));
    if (a.empty) return '<div class="card empty">'.concat(esc(a.message), "</div>");
    const c = a.conclusion;
    return '<div class="note"><a href="#loterias">Loter\xEDas</a> \u203A '.concat(esc(a.name), ' \u203A An\xE1lisis profundo</div>\n  <section class="card ahead">\n    <div class="balls">').concat(a.pick.numbers.map((n) => '<span class="ball" style="width:84px;height:84px;font-size:30px">'.concat(esc(n), "</span>")).join(""), "</div>\n    <div><h1>").concat(esc(a.name), ' <span class="muted" style="font-size:16px">').concat(esc(a.entity), " \xB7 ").concat(a.draws, ' sorteos analizados</span></h1><div class="sub">N\xFAmero del sorteo del ').concat(esc(a.pick.date), " \xB7 m\xE9todo: ").concat(esc(a.pick.methodLabel), '</div></div>\n    <div></div></section>\n  <section class="card summary10" style="border-color:var(--warn)"><div class="s10-h">Resumen en 10 segundos</div>\n    <div class="s10">\n      <div class="tile"><div class="q">\xBFQu\xE9 hago?</div><div class="a warn">Si juegas, solo por diversi\xF3n</div><div class="note">').concat(esc(c.headline.replace(/^[^:]+:\s*/, "")), '</div></div>\n      <div class="tile"><div class="q">Si apuestas RD$100 muchas veces\u2026</div><div class="mr-v bad">vuelven ').concat(rd(a.probs[0].per100), '</div><div class="note">en promedio, a largo plazo (quiniela). La banca se queda con el resto.</div></div>\n      <div class="tile"><div class="q">\xBFQu\xE9 tan seguido sale el ').concat(esc(a.number.num), "?</div>").concat(chanceDots(a.probs[0].win, { what: "sale en el sorteo", big: true }), '<div class="note">Igual que cualquier otro n\xFAmero, si el sorteo es justo</div></div>\n      <div class="tile"><div class="q">\xBFCu\xE1ndo s\xE9 si gan\xE9?</div><div class="a good">El mismo d\xEDa</div><div class="note">Al salir los n\xFAmeros. Si ganas, cobras con el ticket en la banca: gu\xE1rdalo y pregunta el plazo.</div></div>\n    </div></section>\n  ').concat(a.size ? sizeCard(a.size, a.budget, a.light) : "", '\n  <section class="card"><h2>Las preguntas, respondidas</h2>').concat(qaAccordion(c), "</section>\n  ").concat(timingCard(a), '\n  <section class="grid split">\n    <div class="card"><h2>Cu\xE1ntas veces sali\xF3 cada n\xFAmero</h2>').concat(takeaway("el ".concat(esc(a.number.num), " sali\xF3 ").concat(a.number.count, " veces en ").concat(a.draws, " sorteos. Con tan pocos sorteos, que un n\xFAmero salga m\xE1s es casi siempre casualidad."))).concat(freqChart(a.freq, a.draws * 3 / 100, a.number.num), '<div class="note">Naranja: el ').concat(esc(a.number.num), ", que sali\xF3 ").concat(a.number.count, " veces (esperado ").concat(a.number.expected, "); lleva ").concat(a.number.gap, " sorteos sin salir. ").concat(kindTag("dato"), '</div></div>\n    <div class="card"><h2>Probabilidades exactas</h2><div class="tablewrap"><table><tr><th>Jugada</th><th class="r">Chance</th><th class="r">Devuelve de cada RD$100</th></tr>').concat(a.probs.map((p) => "<tr><td>".concat(esc({ quiniela: "Quiniela", pale: "Pal\xE9", tripleta: "Tripleta" }[p.kind]), '</td><td class="r">').concat((p.win * 100).toFixed(p.win < 0.01 ? 3 : 2), '%</td><td class="r bad">').concat(rd(p.per100), "</td></tr>")).join(""), '</table></div><div class="note">').concat(kindTag("dato"), ' Calculado con todas las combinaciones posibles y los pagos de banca configurados.</div></div>\n  </section>\n  <section class="grid split">\n    <div class="card"><h2>\xBFAlg\xFAn m\xE9todo le gana al azar?</h2>').concat(takeaway(esc(a.compare.verdict))).concat(barChart([{ label: "Azar (mediana)", value: a.compare.random.median, color: "var(--mute)" }, ...a.compare.methods.map((m) => ({ label: m.label, value: m.per100, color: m.beatsRandom ? "var(--good)" : "var(--warn)" }))], { fmt: (v) => rd(v), label: "Devuelve por RD$100" }), '<div class="note">').concat(esc(a.compare.verdict), '</div></div>\n    <div class="card"><h2>\xBFHay se\xF1ales de trampa?</h2>').concat(takeaway(esc(a.scan.verdict))).concat(a.scan.tests.map((t) => '<div style="display:flex;gap:8px;padding:4px 0">'.concat(t.anomaly ? '<span class="light rojo"><i></i>Revisar</span>' : '<span class="light verde"><i></i>Normal</span>', "<span>").concat(esc(t.title), '</span><span class="note" style="margin-left:auto">').concat((Math.min(1, t.p) * 100).toFixed(1), "% por casualidad</span></div>")).join(""), '</div>\n  </section>\n  <section class="grid split">').concat(narrativeBox(a)).concat(realtimeBox(a), '</section>\n  <section class="card"><h2>Fuentes y pruebas</h2>').concat(sourcesList(a.sources), "</section>");
  }
  function shrinkReceipt(file) {
    return new Promise((ok, fail) => {
      if (!/^image\//.test(file.type || "image/")) return fail(new Error("Sube una foto o captura del comprobante."));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const draw = (max, q) => {
          const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          const g = c.getContext("2d");
          g.fillStyle = "#fff";
          g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL("image/jpeg", q);
        };
        let d = draw(1600, 0.82);
        if (d.length > 19e5) d = draw(1200, 0.72);
        if (d.length > 19e5) d = draw(900, 0.65);
        URL.revokeObjectURL(url);
        d.length > 19e5 ? fail(new Error("La foto es muy pesada; prueba con una captura de pantalla.")) : ok(d);
      };
      img.onerror = () => fail(new Error("No pude leer esa foto. Prueba con una captura de pantalla."));
      img.src = url;
    });
  }
  const STATUS_CHIP = { pendiente: ["\u23F3 Esperando revisi\xF3n", "warn"], aprobada: ["\u2705 Aprobada", "good"], rechazada: ["\u2715 No aprobada", "bad"] };
  const monthName = (iso) => new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "long", timeZone: "UTC" });
  views.potenciador = async () => {
    const d = await api("/api/potenciador"), m = d.me;
    const pctUsed = m.base ? Math.round(m.baseUsed / m.base * 100) : 0;
    const reqRow = (r, admin) => '<div class="preq '.concat(r.status, '"><div class="preq-h"><b>').concat(esc(admin ? r.who : r.pack_name), '</b><span class="chip ').concat(STATUS_CHIP[r.status][1], '">').concat(STATUS_CHIP[r.status][0], '</span></div>\n    <div class="note">').concat(admin ? "".concat(esc(r.pack_name), " \xB7 ") : "").concat(esc(r.price), " \u2192 <b>").concat(r.credits, " cr\xE9ditos</b> \xB7 ").concat(esc(new Date(r.created_at).toLocaleString("es-DO"))).concat(r.reference ? " \xB7 Ref: ".concat(esc(r.reference)) : "", "</div>\n    ").concat(r.note ? '<div class="note">\u201C'.concat(esc(r.note), "\u201D</div>") : "").concat(r.admin_note ? '<div class="note">Respuesta: '.concat(esc(r.admin_note), "</div>") : "", '\n    <a href="/api/potenciador/').concat(r.id, '/foto" target="_blank" rel="noopener"><img class="preq-img" src="/api/potenciador/').concat(r.id, '/foto" alt="Comprobante" loading="lazy"></a>\n    ').concat(admin && r.status === "pendiente" ? '<div class="row" style="gap:8px;margin-top:8px;align-items:center"><input class="pnote" data-id="'.concat(r.id, '" placeholder="Nota (opcional)" style="flex:1;min-width:140px"><button class="btn sm" data-ok="').concat(r.id, '">Aprobar</button><button class="btn ghost sm" data-no="').concat(r.id, '">Rechazar</button></div>') : "", "</div>");
    const userPart = '\n  <section class="card"><h2>Tu IA este mes</h2>\n    <div class="pbase"><div class="row" style="justify-content:space-between"><span>IA gratis del mes</span><b>'.concat(m.baseLeft, " de ").concat(m.base, ' cr\xE9ditos</b></div><div class="bar" style="margin-top:6px"><span style="width:').concat(100 - pctUsed, '%;background:var(--accent)"></span></div><div class="note">Se renueva sola el ').concat(esc(monthName(m.resetsAt)), '.</div></div>\n    <div class="pbox" style="margin-top:10px"><div class="l">\u26A1 Cr\xE9ditos extra (Potenciador)</div><div class="v">').concat(m.extra, '</div><div class="note">No vencen. Se usan solo cuando se acaba la IA gratis del mes.</div></div>\n    <div class="note" style="margin-top:10px">La IA responde tus preguntas y hace los an\xE1lisis con IA. <b>Si se te acaba, JARVIS sigue funcionando igual</b> (mapa, recomendaciones, historial, avisos): solo las respuestas de la IA esperan al mes siguiente o a un Potenciador.</div></section>\n  <section class="card"><h2>\u26A1 Activar un Potenciador</h2>\n    <form class="form" id="pf2">\n      <div><b>1. Elige un paquete</b><div class="packs" style="margin-top:8px">').concat(d.packs.map((p, i) => '<label class="pack"><input type="radio" name="pack" value="'.concat(esc(p.id), '"').concat(i === 0 ? " checked" : "", "><span><b>").concat(esc(p.name), '</b><span class="pk-price">').concat(esc(p.price), '</span><span class="note">').concat(p.credits, " cr\xE9ditos extra</span></span></label>")).join(""), '</div></div>\n      <div><b>2. Paga</b><div class="payinfo">').concat(d.payInfo ? esc(d.payInfo).replace(/\n/g, "<br>") : "El administrador todav\xEDa no puso c\xF3mo pagarle. Preg\xFAntale directamente.", '</div></div>\n      <div><b>3. Sube la foto del comprobante</b><label class="btn ghost" style="cursor:pointer;margin-top:8px;display:inline-flex">\u{1F4F7} Elegir foto o captura<input id="prc" type="file" accept="image/*" hidden></label><div id="prcv" class="note" style="margin-top:6px"></div></div>\n      <label>N\xFAmero de referencia (opcional)<input id="pref" maxlength="60" placeholder="Ej.: 123456789"></label>\n      <label>Nota para el administrador (opcional)<input id="pnt" maxlength="300"></label>\n      <button class="btn">Enviar solicitud</button><div class="msg" id="pmsg"></div>\n      <div class="note">El administrador revisa tu comprobante y aprueba. Te llega un aviso aqu\xED cuando lo haga.</div>\n    </form></section>\n  <section class="card"><h2>Mis solicitudes</h2>').concat(d.mine.length ? d.mine.map((r) => reqRow(r, false)).join("") : '<div class="empty">Todav\xEDa no has pedido ning\xFAn Potenciador.</div>', "</section>");
    const adminPart = d.isAdmin ? '\n  <section class="card"><h2>Solicitudes de tus usuarios '.concat(d.admin.requests.filter((r) => r.status === "pendiente").length ? '<span class="chip warn">'.concat(d.admin.requests.filter((r) => r.status === "pendiente").length, " por revisar</span>") : "", '</h2>\n    <div class="note">Revisa que el pago te lleg\xF3 de verdad antes de aprobar. Al aprobar, los cr\xE9ditos se le suman al momento.</div>\n    ').concat(d.admin.requests.length ? d.admin.requests.map((r) => reqRow(r, true)).join("") : '<div class="empty">No hay solicitudes todav\xEDa.</div>', '<div class="msg" id="amsg"></div></section>\n  <section class="card"><h2>Cr\xE9ditos de cada usuario</h2>').concat(d.admin.users.length ? '<div class="tablewrap"><table><tr><th>Persona</th><th class="r">Gratis del mes</th><th class="r">Extra</th><th class="r">Regalar</th></tr>'.concat(d.admin.users.map((u) => "<tr><td>".concat(esc(u.name)).concat(u.pending ? ' <span class="chip warn">pidi\xF3</span>' : "", '</td><td class="r">').concat(u.baseLeft, "/").concat(u.base, '</td><td class="r"><b>').concat(u.extra, '</b></td><td class="r"><span class="row" style="gap:6px;justify-content:flex-end"><input type="number" class="gift" data-u="').concat(u.id, '" placeholder="50" style="width:80px"><button class="btn ghost sm" data-gift="').concat(u.id, '">Dar</button></span></td></tr>')).join(""), "</table></div>") : '<div class="empty">Todav\xEDa no has creado usuarios.</div>', '\n    <div class="note">La IA gratis de cada mes es la que pusiste al crear el usuario ("IA gratis al mes") (1 cr\xE9dito = 1 centavo de d\xF3lar de IA).</div></section>\n  <section class="card"><h2>Paquetes y forma de pago</h2><form class="form" id="pset">\n    ').concat([0, 1, 2].map((i) => {
      const p = d.packs[i] || {};
      return '<div class="grid g3" style="gap:8px"><label>Nombre<input data-pk="'.concat(i, '" data-f="name" value="').concat(esc(p.name || ""), '" maxlength="40"></label><label>Precio<input data-pk="').concat(i, '" data-f="price" value="').concat(esc(p.price || ""), '" maxlength="20" placeholder="RD$300"></label><label>Cr\xE9ditos<input data-pk="').concat(i, '" data-f="credits" type="number" value="').concat(p.credits || "", '"></label></div>');
    }).join(""), '\n    <label>C\xF3mo te pagan (lo ven tus usuarios)<textarea id="ppay" rows="4" maxlength="600" placeholder="Ej.: Transferencia a mi cuenta del banco \u2026 a nombre de \u2026">').concat(esc(d.payInfo), '</textarea></label>\n    <button class="btn">Guardar</button><div class="msg" id="psm"></div></form></section>') : "";
    return '<div><h1>\u26A1 Potenciador de IA</h1><p class="sub">'.concat(d.isAdmin ? "Aqu\xED apruebas los pagos de tus usuarios y decides los paquetes." : "M\xE1s respuestas de la IA cuando las necesites.", "</p></div>").concat(d.isAdmin ? adminPart : userPart);
  };
  views.potenciador.after = () => {
    let receipt = null;
    if ($("#prc")) $("#prc").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      $("#prcv").textContent = "Preparando la foto\u2026";
      try {
        receipt = await shrinkReceipt(f);
        $("#prcv").innerHTML = '<img src="'.concat(receipt, '" class="preq-img" alt="Vista previa"><div>\u2705 Foto lista</div>');
      } catch (err) {
        receipt = null;
        $("#prcv").textContent = err.message;
      }
    };
    if ($("#pf2")) $("#pf2").onsubmit = async (e) => {
      var _a;
      e.preventDefault();
      if (!receipt) {
        $("#pmsg").className = "msg err";
        $("#pmsg").textContent = "Falta la foto del comprobante.";
        return;
      }
      try {
        await api("/api/potenciador", { method: "POST", body: { packId: (_a = document.querySelector("input[name=pack]:checked")) == null ? void 0 : _a.value, receipt, reference: $("#pref").value, note: $("#pnt").value } });
        $("#pmsg").className = "msg ok";
        $("#pmsg").textContent = "\xA1Enviado! Te aviso cuando el administrador lo apruebe.";
        setTimeout(render, 1400);
      } catch (err) {
        $("#pmsg").className = "msg err";
        $("#pmsg").textContent = err.message;
      }
    };
    const decide = async (id, approve) => {
      var _a;
      try {
        await api("/api/potenciador/".concat(id, "/decidir"), { method: "POST", body: { approve, note: ((_a = document.querySelector('.pnote[data-id="'.concat(id, '"]'))) == null ? void 0 : _a.value) || "" } });
        render();
      } catch (err) {
        $("#amsg").className = "msg err";
        $("#amsg").textContent = err.message;
      }
    };
    document.querySelectorAll("[data-ok]").forEach((b) => b.onclick = () => decide(b.dataset.ok, true));
    document.querySelectorAll("[data-no]").forEach((b) => b.onclick = () => decide(b.dataset.no, false));
    document.querySelectorAll("[data-gift]").forEach((b) => b.onclick = async () => {
      const n = Number(document.querySelector('.gift[data-u="'.concat(b.dataset.gift, '"]')).value);
      try {
        await api("/api/potenciador/regalar", { method: "POST", body: { userId: Number(b.dataset.gift), credits: n } });
        render();
      } catch (err) {
        alertMsg(err.message);
      }
    });
    if ($("#pset")) $("#pset").onsubmit = async (e) => {
      e.preventDefault();
      const packs = [0, 1, 2].map((i) => ({ name: document.querySelector('[data-pk="'.concat(i, '"][data-f=name]')).value, price: document.querySelector('[data-pk="'.concat(i, '"][data-f=price]')).value, credits: Number(document.querySelector('[data-pk="'.concat(i, '"][data-f=credits]')).value) })).filter((p) => p.name || p.price || p.credits);
      try {
        await api("/api/potenciador/ajustes", { method: "POST", body: { packs, payInfo: $("#ppay").value } });
        $("#psm").className = "msg ok";
        $("#psm").textContent = "Guardado.";
      } catch (err) {
        $("#psm").className = "msg err";
        $("#psm").textContent = err.message;
      }
    };
  };
  function alertMsg(t) {
    const m = $("#amsg");
    if (m) {
      m.className = "msg err";
      m.textContent = t;
    }
  }
  views.historial = async () => {
    const [perf, hist, real] = await Promise.all([api("/api/performance"), api("/api/history"), api("/api/real")]);
    window.__H = { perf, hist, real };
    return '<div><h1>Historial: \xBFcu\xE1nto acierta de verdad?</h1><p class="sub">Todo lo que JARVIS y cada IA recomendaron, guardado antes de saber el resultado. Aciertos y fallos, sin esconder nada.</p>\n  <div class="seal '.concat(perf.ledger.ok ? "ok" : "bad", '">').concat(perf.ledger.ok ? "\u{1F512} Registro intacto: ".concat(perf.ledger.checked, " entradas revisadas, nada se borr\xF3 ni se cambi\xF3.") : "\u26A0\uFE0F El registro sellado fue alterado: revisar.", '</div></div>\n  <div class="row" id="htabs"><button class="btn" data-t="bolsa">Bolsa (virtual)</button><button class="btn ghost" data-t="loterias">Loter\xEDas (virtual)</button><button class="btn ghost" data-t="ia">Comparar IA</button><button class="btn ghost" data-t="real">Dinero real (registrado por ti)</button></div>\n  <div id="hview"></div>');
  };
  function perfBlock(s, cur) {
    const money = (v) => cur === "RD$" ? rd(v) : usd(v);
    const coin = s.range && s.range[0] <= 50 && s.range[1] >= 50;
    const verdict = !s.resolved ? "Todav\xEDa no hay resultados para juzgar." : coin ? "Por ahora acierta casi igual que lanzar una moneda: hace falta m\xE1s tiempo para saber si de verdad sirve." : s.hitRate > 50 ? "Acierta m\xE1s de lo que dar\xEDa la suerte, y no es casualidad con estos datos." : "Acierta menos que la suerte: no conviene seguirlo todav\xEDa.";
    return '<section class="card hsum" style="border-color:var(--'.concat(!s.resolved || coin ? "warn" : s.hitRate > 50 ? "good" : "bad", ')">\n    <div class="hs-big">').concat(s.resolved ? "De <b>".concat(s.resolved, '</b> recomendaciones ya revisadas, acert\xF3 <b class="good">').concat(s.hits, "</b> (").concat(Math.round(s.hitRate), "%).") : "A\xFAn no hay recomendaciones revisadas.", "</div>\n    ").concat(s.resolved ? '<div class="hs-sub">Si le hubieras hecho caso con los montos que dijo, hoy ir\xEDas <b class="'.concat(cls(s.net), '">').concat(s.net >= 0 ? "ganando" : "perdiendo", " ").concat(money(Math.abs(s.net)), "</b> (dinero virtual).</div>") : "", '\n    <div class="hs-v">').concat(verdict, '</div></section>\n  <section class="grid g4">\n    <div class="card kpi" style="--c:var(--good)"><div class="l">Acertadas</div><div class="v good">').concat(s.hits, '</div><div class="s">').concat(s.hitRate != null ? s.hitRate + "% de acierto" : "sin calificar a\xFAn").concat(s.range ? " (rango ".concat(s.range[0], "\u2013").concat(s.range[1], "%)") : "", '</div></div>\n    <div class="card kpi" style="--c:var(--bad)"><div class="l">Fallidas</div><div class="v bad">').concat(s.misses, '</div><div class="s">racha r\xE9cord de fallos: ').concat(s.streak.bestMisses, '</div></div>\n    <div class="card kpi" style="--c:var(--warn)"><div class="l">Pendientes</div><div class="v">').concat(s.pending, '</div><div class="s">').concat(s.total, ' registradas en total</div></div>\n    <div class="card kpi"><div class="l">Si le hubieras hecho caso</div><div class="v ').concat(cls(s.net), '">').concat(money(s.net), '</div><div class="s">apostado ').concat(money(s.staked), " \xB7 ganado ").concat(money(s.won), " \xB7 perdido ").concat(money(s.lost), '</div></div>\n  </section>\n  <section class="grid split">\n    <div class="card"><h2>Evoluci\xF3n del dinero</h2>').concat(s.curve.length > 1 ? lineChart(s.curve, { h: 200, label: "Dinero acumulado" }) : '<div class="empty">Aparece cuando haya al menos 2 recomendaciones calificadas.</div>', '</div>\n    <div class="card"><h2>Ganancias y p\xE9rdidas por mes</h2>').concat(s.months.length ? barChart(s.months.map((m) => ({ label: m.month, value: m.net })), { fmt: money, label: "Por mes" }) : '<div class="empty">Sin meses calificados todav\xEDa.</div>', '\n      <div class="note">').concat(s.best ? "Mejor mes: ".concat(esc(s.best.month), " (").concat(money(s.best.net), "). Peor mes: ").concat(esc(s.worst.month), " (").concat(money(s.worst.net), ").") : "", "</div>\n      ").concat(s.brier != null ? '<details class="note" style="margin-top:6px"><summary>Para expertos</summary>Calibraci\xF3n (Brier): '.concat(s.brier, ". M\xE1s bajo es mejor; 0.25 es lo mismo que adivinar.</details>") : "", "</div>\n  </section>");
  }
  function recordsTable(rows) {
    if (!rows.length) return '<div class="empty">Todav\xEDa no hay registros. Aparecen cuando el motor genere el ranking o sorteos.</div>';
    const st = { acerto: '<span class="good">\u2713 Acert\xF3</span>', fallo: '<span class="bad">\u2715 Fall\xF3</span>', pendiente: '<span class="note">Pendiente</span>' };
    return '<div class="tablewrap"><table><tr><th>D\xEDa</th><th>Qui\xE9n</th><th>Opci\xF3n</th><th>Qu\xE9 dijo</th><th class="r">Prob.</th><th class="r">Monto</th><th class="r">Posible ganancia</th><th>Resultado</th></tr>\n  '.concat(rows.map((r) => {
      var _a, _b;
      return '<tr><td class="note">'.concat(esc(r.dataDate), "</td><td>").concat(esc(r.agentLabel), '</td><td class="sym">').concat(esc(r.subject), '</td><td style="min-width:220px">').concat(r.light ? light(r.light) + " " : "").concat(esc(r.claim), "\n    <details><summary>Detalle \u25B8</summary>").concat(r.why ? '<div class="note"><b>Por qu\xE9:</b> '.concat(esc(Array.isArray(r.why) ? r.why.join(" ") : r.why), "</div>") : "").concat(((_a = r.others) == null ? void 0 : _a.length) ? '<div class="note"><b>Otras IA:</b> '.concat(r.others.map((o) => "".concat(esc(o.agent), ": ").concat(esc(o.stance), " (").concat(Math.round(o.probBeat * 100), "%)")).join(" \xB7 "), "</div>") : "").concat(((_b = r.sources) == null ? void 0 : _b.length) ? '<div class="note"><b>Fuentes:</b> '.concat(r.sources.map((s) => s.url ? '<a href="'.concat(esc(s.url), '" target="_blank" rel="noopener">').concat(esc(s.label), "</a>") : esc(s.label)).join(" \xB7 "), "</div>") : "").concat(r.outcome ? '<div class="note"><b>Resultado real:</b> '.concat(r.outcome.ret != null ? "".concat(pctp(r.outcome.ret), " la acci\xF3n vs ").concat(pctp(r.outcome.bench), " el mercado (al ").concat(esc(r.outcome.endDate), ")") : "sali\xF3 ".concat(esc((r.outcome.draw || []).join("-"))), "</div>") : "", '<div class="note mono">Sellada ').concat(esc(r.sealedAt.slice(0, 16).replace("T", " ")), " UTC \xB7 huella ").concat(esc(r.hash.slice(0, 16)), '\u2026</div></details></td>\n    <td class="r">').concat(Math.round(r.prob * 100), '%</td><td class="r">').concat(r.amount.value != null ? r.amount.cur === "RD$" ? rd(r.amount.value) : usd(r.amount.value, 0) : "\u2014", '</td>\n    <td class="r">').concat(r.potential ? typeof r.potential === "number" ? rd(r.potential) : "".concat(usd(r.potential.probable), ' <span class="note">(').concat(usd(r.potential.bad), " a ").concat(usd(r.potential.good), ")</span>") : "\u2014", "</td>\n    <td>").concat(st[r.status]).concat(r.pnl != null ? ' <span class="'.concat(cls(r.pnl), '">').concat(r.amount.cur === "RD$" ? rd(r.pnl) : usd(r.pnl), "</span>") : "", "</td></tr>");
    }).join(""), "</table></div>");
  }
  views.historial.after = () => {
    const { perf, hist, real } = window.__H;
    const show = (t) => {
      document.querySelectorAll("#htabs button").forEach((b) => b.classList.toggle("ghost", b.dataset.t !== t));
      if (t === "bolsa" || t === "loterias") {
        const rows = hist.filter((r) => t === "bolsa" ? r.module !== "loteria" : r.module === "loteria");
        const who = [...new Set(rows.map((r) => r.agentLabel))];
        $("#hview").innerHTML = perfBlock(perf[t], t === "bolsa" ? "US$" : "RD$") + '<section class="card"><h2>Registro completo ('.concat(rows.length, ') <a class="more" href="/api/export/predicciones">Exportar todo \u25B8</a></h2>\n        <div class="row" style="margin-bottom:10px;gap:10px"><label class="note">Qui\xE9n <select id="fq"><option value="">Todos</option>').concat(who.map((w) => "<option>".concat(esc(w), "</option>")).join(""), '</select></label>\n        <label class="note">Resultado <select id="fr"><option value="">Todos</option><option value="acerto">Acert\xF3</option><option value="fallo">Fall\xF3</option><option value="pendiente">Pendiente</option></select></label>\n        <span class="note" id="fc" style="margin-left:auto"></span></div><div id="rt"></div><div style="text-align:center;margin-top:10px"><button class="btn ghost" id="fm">Ver m\xE1s</button></div></section>');
        let lim = 20;
        const draw = () => {
          const f = rows.filter((r) => (!$("#fq").value || r.agentLabel === $("#fq").value) && (!$("#fr").value || r.status === $("#fr").value));
          $("#rt").innerHTML = recordsTable(f.slice(0, lim));
          $("#fc").textContent = "Mostrando ".concat(Math.min(lim, f.length), " de ").concat(f.length);
          $("#fm").style.display = f.length > lim ? "" : "none";
        };
        $("#fq").onchange = $("#fr").onchange = () => {
          lim = 20;
          draw();
        };
        $("#fm").onclick = () => {
          lim += 40;
          draw();
        };
        draw();
      } else if (t === "ia") {
        const ia = perf.ia;
        const people = ia.agents.filter((a) => a.kind !== "estrategia").sort((x, y) => {
          var _a, _b;
          return ((_a = y.hitRate) != null ? _a : -1) - ((_b = x.hitRate) != null ? _b : -1);
        });
        const tags = (a) => {
          var _a, _b, _c, _d;
          return [[(_a = ia.leaders) == null ? void 0 : _a.masAciertos, "\u{1F3C6} Acierta m\xE1s"], [(_b = ia.leaders) == null ? void 0 : _b.mejorProbabilidad, "\u{1F3AF} Mejor calculando"], [(_c = ia.leaders) == null ? void 0 : _c.masGanancia, "\u{1F4B0} Gana m\xE1s"], [(_d = ia.leaders) == null ? void 0 : _d.masErrores, "\u26A0\uFE0F Falla m\xE1s"]].filter(([n]) => n === a.label).map(([, t2]) => '<span class="pill">'.concat(t2, "</span>")).join("");
        };
        $("#hview").innerHTML = '<section><h2 style="margin:4px 0 12px">\xBFQu\xE9 IA es m\xE1s confiable?</h2><div class="grid g3">'.concat(people.map((a, i) => '<div class="card iac'.concat(i === 0 && a.resolved ? " first" : "", '"><div class="iac-h"><span class="pos">').concat(i + 1, "</span><b>").concat(esc(a.label), '</b></div>\n          <div class="iac-v">').concat(a.hitRate != null ? Math.round(a.hitRate) + "%" : "\u2014", '</div><div class="note">de acierto \xB7 ').concat(a.hits, " aciertos y ").concat(a.misses, " fallos</div>\n          ").concat(a.hitRate != null ? chanceDots(a.hitRate / 100, { what: "acierta" }) : "", '\n          <div class="note" style="margin-top:8px">Con US$10 por idea: <b class="').concat(cls(a.net), '">').concat(usd(a.net), '</b></div><div class="row" style="gap:6px;margin-top:8px">').concat(tags(a), "</div></div>")).join(""), '</div>\n        <div class="note" style="margin-top:8px">').concat(esc(ia.note || ""), ' Ninguna IA puede borrar ni cambiar lo que dijo: todo queda sellado antes del resultado.</div></section>\n        <details class="card"><summary><b>Tabla completa</b> <span class="note">para expertos</span></summary><div class="tablewrap" style="margin-top:10px"><table><tr><th>Agente</th><th class="r">Predicciones</th><th class="r">Aciertos</th><th class="r">Fallos</th><th class="r">% acierto</th><th class="r">Prob. promedio</th><th class="r">Calibraci\xF3n (Brier)</th><th class="r">Neto con US$10</th></tr>\n        ').concat(ia.agents.filter((a) => a.kind !== "estrategia").map((a) => {
          var _a;
          return "<tr><td><b>".concat(esc(a.label), '</b></td><td class="r">').concat(a.total, '</td><td class="r good">').concat(a.hits, '</td><td class="r bad">').concat(a.misses, '</td><td class="r">').concat(a.hitRate != null ? a.hitRate + "%" : "\u2014", '</td><td class="r">').concat(a.avgProb != null ? a.avgProb + "%" : "\u2014", '</td><td class="r">').concat((_a = a.brier) != null ? _a : "\u2014", '</td><td class="r ').concat(cls(a.net), '">').concat(usd(a.net), "</td></tr>");
        }).join(""), '</table></div>\n        <div class="note" style="margin-top:8px">Calibraci\xF3n: si una IA dice "70%" y acierta 7 de cada 10, est\xE1 bien calibrada. Brier m\xE1s bajo es mejor; 0.25 equivale a adivinar.</div></details>\n        <section class="card"><h2>Agentes de estrategia (practican con dinero virtual)</h2><table><tr><th>Agente</th><th class="r">Operaciones cerradas</th><th class="r">Monedas</th><th class="r">Trampas detectadas</th></tr>').concat(ia.agents.filter((a) => a.kind === "estrategia").map((a) => "<tr><td>".concat(esc(a.label), '</td><td class="r">').concat(a.closedTrades, '</td><td class="r">').concat(a.coins, '</td><td class="r ').concat(a.cheats ? "bad" : "", '">').concat(a.cheats, "</td></tr>")).join(""), "</table></section>");
      } else {
        const r = real;
        $("#hview").innerHTML = '<section class="card" style="border-color:var(--warn)"><h2>Dinero real</h2><p class="note">JARVIS nunca invierte ni apuesta por ti. Aqu\xED anotas lo que hiciste de verdad, para comparar tu dinero real con sus recomendaciones. Lo que anotes queda sellado. Si una inversi\xF3n real cae 8% desde tu compra o pasa a "No te recomiendo", te aviso al celular para que decidas salir.</p>\n        <div class="grid g4"><div class="pbox"><div class="l">Bolsa: neto realizado</div><div class="v '.concat(cls(r.bolsa.net), '">').concat(usd(r.bolsa.net), '</div><div class="note">').concat(r.bolsa.count, " registros \xB7 ").concat(r.bolsa.open, ' abiertos</div></div><div class="pbox"><div class="l">Bolsa: invertido</div><div class="v">').concat(usd(r.bolsa.staked), '</div><div class="note">').concat(r.bolsa.followed, ' siguiendo a JARVIS</div></div>\n        <div class="pbox"><div class="l">Loter\xEDas: neto</div><div class="v ').concat(cls(r.loterias.net), '">').concat(rd(r.loterias.net), '</div><div class="note">').concat(r.loterias.count, " apuestas \xB7 ").concat(r.loterias.wins, ' premios</div></div><div class="pbox"><div class="l">Loter\xEDas: apostado</div><div class="v">').concat(rd(r.loterias.staked), '</div></div></div></section>\n        <section class="grid g2"><div class="card"><h2>Anotar inversi\xF3n real (bolsa)</h2><form class="form" id="rbf"><div class="grid g3" style="gap:10px"><label>Acci\xF3n<input id="rbs" placeholder="MSFT" required></label><label>Monto US$<input id="rba" type="number" step="0.01" min="0.01" required></label><label>Precio de compra<input id="rbp" type="number" step="0.0001" min="0.0001" required></label></div><button class="btn">Anotar</button><div class="msg" id="rbm"></div></form></div>\n        <div class="card"><h2>Anotar apuesta real (loter\xEDa)</h2><form class="form" id="rlf"><div class="grid g4" style="gap:10px"><label>Loter\xEDa<select id="rlg">').concat(["leidsa", "nacional", "nacional-noche", "loteka", "real"].map((g) => "<option>".concat(g, "</option>")).join(""), '</select></label><label>Fecha<input id="rld" type="date" required></label><label>N\xFAmeros<input id="rln" placeholder="27" required></label><label>Monto RD$<input id="rls" type="number" min="1" required></label></div><button class="btn">Anotar</button><div class="msg" id="rlm"></div></form></div></section>\n        <section class="card"><h2>Mis registros reales</h2>').concat(r.rows.length ? '<table><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Estado</th><th class="r">Resultado</th></tr>'.concat(r.rows.map((x) => '<tr><td class="note">'.concat(esc(x.ts.slice(0, 10)), "</td><td>").concat(x.module === "bolsa" ? "Bolsa" : "Loter\xEDa", "</td><td>").concat(x.module === "bolsa" ? "".concat(esc(x.detail.symbol), " \xB7 ").concat(usd(x.detail.amountUsd), " a ").concat(usd(x.detail.price)) : "".concat(esc(x.detail.game), " ").concat(esc(x.detail.date), " \xB7 ").concat(esc(x.detail.numbers.join("-")), " \xB7 ").concat(rd(x.detail.stakeRd)), "</td><td>").concat(x.status === "abierta" ? x.module === "bolsa" ? '<button class="btn ghost" data-close="'.concat(x.id, '" style="padding:3px 10px">Anotar venta</button>') : "Esperando sorteo" : "Cerrada", '</td><td class="r ').concat(cls(x.result), '">').concat(x.result != null ? x.module === "bolsa" ? usd(x.result) : rd(x.result) : "\u2014", "</td></tr>")).join(""), "</table>") : '<div class="empty">Sin registros reales todav\xEDa.</div>', "</section>");
        const post = async (body, m) => {
          try {
            await api("/api/real", { method: "POST", body });
            $(m).className = "msg ok";
            $(m).textContent = "Anotado y sellado.";
            setTimeout(render, 900);
          } catch (e) {
            $(m).className = "msg err";
            $(m).textContent = e.message;
          }
        };
        $("#rbf").onsubmit = (e) => {
          e.preventDefault();
          post({ module: "bolsa", symbol: $("#rbs").value, amountUsd: $("#rba").value, price: $("#rbp").value }, "#rbm");
        };
        $("#rlf").onsubmit = (e) => {
          e.preventDefault();
          post({ module: "loteria", game: $("#rlg").value, date: $("#rld").value, numbers: $("#rln").value.trim().split(/\s+/).map((x) => x.padStart(2, "0")), stakeRd: $("#rls").value }, "#rlm");
        };
        document.querySelectorAll("[data-close]").forEach((b) => b.onclick = async () => {
          const td = b.parentElement;
          td.innerHTML = '<form class="ask" style="max-width:260px"><input type="number" step="0.0001" placeholder="Precio de venta" required><button class="btn">OK</button></form>';
          td.querySelector("form").onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api("/api/real/".concat(b.dataset.close, "/close"), { method: "POST", body: { sellPrice: td.querySelector("input").value } });
              render();
            } catch (err) {
              td.insertAdjacentHTML("beforeend", '<div class="msg err">'.concat(esc(err.message), "</div>"));
            }
          };
        });
      }
    };
    document.querySelectorAll("#htabs button").forEach((b) => b.onclick = () => show(b.dataset.t));
    show("bolsa");
  };
  let tvTimer = null;
  let tvLastId = 0;
  let tvClock = null;
  let tvDebTimer = null;
  let tvPrev = null;
  let tvChartKey = "";
  const TVC = { verde: "#2fd58a", amarillo: "#ffbf3c", rojo: "#ff5d6c" };
  function animNum(el, from, to, fmt, ms = 1400) {
    if (!el) return;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  async function tvOpen() {
    var _a, _b;
    $("#tv-root").innerHTML = '<div class="tv" id="tv"><button class="iconbtn exit" id="tvx">Salir \u2715</button>\n    <div class="th"><span class="logo">'.concat(brandMark()).concat(brandName(), '</span><span class="chip" id="tvm">\u2026</span><span class="chip" id="tvmk">\u2026</span><span class="chip" id="tvai">\u2026</span><span class="clock" id="tvc"></span></div>\n    <div class="headline" id="tvh">Conectando\u2026</div>\n    <div class="kpis">\n      <div class="kp money"><small>Dinero virtual</small><div class="row1"><b id="k-money">\u2014</b><span class="arrow" id="k-arrow"></span></div><div class="sub" id="k-money-sub"></div></div>\n      <div class="kp"><small>Aciertos</small><b id="k-hit">\u2014</b><div class="sub" id="k-hit-sub"></div></div>\n      <div class="kp"><small>Racha actual</small><b id="k-streak">0</b><div class="sub" id="k-streak-sub"></div></div>\n      <div class="kp"><small>Experimentos</small><b id="k-exp">0</b><div class="sub" id="k-exp-sub"></div></div>\n    </div>\n    <div class="body">\n      <div class="pane"><h3><span class="live"></span>La IA en este momento</h3><div class="console" id="tvcon"></div><div class="prog"><span></span></div></div>\n      <div class="col">\n        <div class="pane chartpane"><h3 id="tvct">Rendimiento</h3><div id="tvchart" class="chartbox"></div></div>\n        <div class="pane"><h3>Recomendaciones del momento</h3><div class="cards" id="tvrank"></div></div>\n      </div>\n      <div class="col">\n        <div class="pane debpane"><h3><span class="live"></span><span id="tvdt">Debate en vivo</span></h3><div class="chat" id="tvchat"></div></div>\n        <div class="pane leaguepane"><h3>Liga de agentes \xB7 monedas</h3><div class="league" id="tvlg"></div></div>\n      </div>\n    </div>\n    <div class="ticker"><div class="track" id="tvtk"></div></div></div>');
    $("#tvx").onclick = () => {
      location.hash = "#inicio";
    };
    try {
      await ((_b = (_a = document.documentElement).requestFullscreen) == null ? void 0 : _b.call(_a));
    } catch (e) {
    }
    tvClock = setInterval(() => {
      const c = $("#tvc");
      if (c) c.textContent = (/* @__PURE__ */ new Date()).toLocaleString("es-DO", { weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    }, 1e3);
    tvPrev = null;
    tvLastId = 0;
    tvChartKey = "";
    await tvRefresh();
    tvTimer = setInterval(tvRefresh, 15e3);
  }
  function tvClose() {
    var _a;
    clearInterval(tvTimer);
    clearInterval(tvClock);
    clearTimeout(tvDebTimer);
    $("#tv-root").innerHTML = "";
    if (document.fullscreenElement) (_a = document.exitFullscreen) == null ? void 0 : _a.call(document).catch(() => {
    });
  }
  function tvChart(c) {
    const box = $("#tvchart");
    if (!box) return;
    if (!c) {
      box.innerHTML = '<div class="empty-tv">El gr\xE1fico aparece cuando haya precios suficientes.</div>';
      return;
    }
    const key = JSON.stringify([c.a.at(-1), c.b.at(-1), c.a.length]);
    if (key === tvChartKey) return;
    tvChartKey = key;
    $("#tvct").textContent = c.title;
    const W = 900, H = 300, L = c.unit === "usd" ? 92 : 60, R = 200, T = 16, B = 30, all = [...c.a, ...c.b].map((p) => p[1]);
    const min = Math.min(0, ...all), max = Math.max(0, ...all), sp = max - min || 1;
    const x = (i) => L + i / (c.a.length - 1) * (W - L - R), y = (v) => T + (1 - (v - min) / sp) * (H - T - B);
    const path = (pts) => pts.map((p, i) => "".concat(i ? "L" : "M").concat(x(i).toFixed(1), " ").concat(y(p[1]).toFixed(1))).join(" ");
    const f = (v) => c.unit === "usd" ? usd(v) : (v > 0 ? "+" : "") + v.toFixed(1) + "%";
    const ticks = [min, (min + max) / 2, max], la = c.a.at(-1)[1], lb = c.b.at(-1)[1];
    const ca = la >= lb ? "#2fd58a" : "#ff5d6c";
    box.innerHTML = '<svg viewBox="0 0 '.concat(W, " ").concat(H, '" preserveAspectRatio="none" role="img" aria-label="').concat(esc(c.title), '">\n    <defs><linearGradient id="tvg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="').concat(ca, '" stop-opacity=".35"/><stop offset="1" stop-color="').concat(ca, '" stop-opacity="0"/></linearGradient></defs>\n    ').concat(ticks.map((t) => '<line x1="'.concat(L, '" x2="').concat(W - R, '" y1="').concat(y(t), '" y2="').concat(y(t), '" stroke="#1e2a44"/><text x="').concat(L - 8, '" y="').concat(y(t) + 5, '" text-anchor="end" fill="#6d7b99" font-size="15">').concat(f(t), "</text>")).join(""), '\n    <line x1="').concat(L, '" x2="').concat(W - R, '" y1="').concat(y(0), '" y2="').concat(y(0), '" stroke="#3a4a6b" stroke-dasharray="4 4"/>\n    <path class="area" d="').concat(path(c.a), " L").concat(x(c.a.length - 1), " ").concat(y(min), " L").concat(x(0), " ").concat(y(min), ' Z" fill="url(#tvg)"/>\n    <path class="draw b" d="').concat(path(c.b), '" fill="none" stroke="#8a97b5" stroke-width="2.5" stroke-dasharray="7 6" pathLength="1000"/>\n    <path class="draw a" d="').concat(path(c.a), '" fill="none" stroke="').concat(ca, '" stroke-width="4" pathLength="1000"/>\n    <circle class="dot" cx="').concat(x(c.a.length - 1), '" cy="').concat(y(la), '" r="8" fill="').concat(ca, '"/>\n    <text x="').concat(W - R + 14, '" y="').concat(y(la) + 6, '" fill="').concat(ca, '" font-size="20" font-weight="800">').concat(esc(c.aLabel), " ").concat(f(la), '</text>\n    <text x="').concat(W - R + 14, '" y="').concat(y(lb) + (Math.abs(y(lb) - y(la)) < 26 ? 30 : 6), '" fill="#8a97b5" font-size="17">').concat(esc(c.bLabel), " ").concat(f(lb), '</text>\n    <text x="').concat(L, '" y="').concat(H - 6, '" fill="#6d7b99" font-size="14">').concat(esc(c.a[0][0]), '</text><text x="').concat(W - R, '" y="').concat(H - 6, '" text-anchor="end" fill="#6d7b99" font-size="14">').concat(esc(c.a.at(-1)[0]), "</text></svg>");
  }
  function tvDebate(d) {
    const chat = $("#tvchat");
    if (!chat) return;
    if (!d) {
      chat.innerHTML = '<div class="empty-tv">Las dos IA debaten aqu\xED antes de cada recomendaci\xF3n importante.</div>';
      return;
    }
    if (chat.dataset.id === String(d.id)) return;
    chat.dataset.id = d.id;
    $("#tvdt").textContent = "Debate en vivo \xB7 ".concat(d.subject);
    const msgs = d.rounds.flatMap((r) => r.messages.filter((m) => !m.failed).map((m, i2) => __spreadProps(__spreadValues({}, m), { side: i2 ? "b" : "a", round: r.round })));
    const v = d.verdict;
    let i = 0;
    clearTimeout(tvDebTimer);
    const next = () => {
      if (!$("#tvchat")) return;
      if (i === 0) chat.innerHTML = "";
      if (!msgs.length || i >= msgs.length) {
        chat.insertAdjacentHTML("beforeend", '<div class="verdict-tv" style="border-color:'.concat(TVC[v.light], '"><span style="color:').concat(TVC[v.light], '">\u25CF Decisi\xF3n: ').concat(esc(v.title), "</span><small>").concat(esc(v.notes[0] || ""), " \xB7 confianza ").concat(Math.round(v.confidence * 100), "%</small></div>"));
        i = 0;
        tvDebTimer = setTimeout(next, 9e3);
        return;
      }
      const m = msgs[i];
      const typing = document.createElement("div");
      typing.className = "bub-tv ".concat(m.side, " typing");
      typing.innerHTML = "<b>".concat(esc(m.who), '</b> est\xE1 escribiendo <span class="dots"><i></i><i></i><i></i></span>');
      chat.appendChild(typing);
      tvDebTimer = setTimeout(() => {
        typing.remove();
        chat.insertAdjacentHTML("beforeend", '<div class="bub-tv '.concat(m.side, '"><div class="who"><b>').concat(esc(m.who), '</b><span class="st ').concat(m.stance, '">').concat(esc(m.stance.replace("_", " ")), '</span><span class="rd">ronda ').concat(m.round, "</span></div><p>").concat(esc(m.text), "</p></div>"));
        while (chat.children.length > 4) chat.firstElementChild.remove();
        i++;
        tvDebTimer = setTimeout(next, 3800);
      }, 1500);
    };
    next();
  }
  function tvLeague(list) {
    const box = $("#tvlg");
    if (!box) return;
    const rowH = 2.9, max = Math.max(1, ...list.map((a) => Math.abs(a.coins)));
    list.forEach((a, rank) => {
      let row = box.querySelector('[data-ag="'.concat(a.id, '"]'));
      const prev = row ? Number(row.dataset.coins) : null;
      if (!row) {
        row = document.createElement("div");
        row.className = "lrow";
        row.dataset.ag = a.id;
        row.innerHTML = '<span class="pos"></span><span class="nm">'.concat(esc(a.name), '</span><b class="cn"></b><div class="bar"><span></span></div>');
        box.appendChild(row);
      }
      row.style.top = rank * rowH + "vw";
      row.querySelector(".pos").textContent = rank + 1;
      const cn = row.querySelector(".cn");
      animNum(cn, prev != null ? prev : 0, a.coins, (v) => (Math.round(v * 10) / 10).toString(), 1200);
      cn.className = "cn " + (a.coins >= 0 ? "pos-c" : "neg-c");
      requestAnimationFrame(() => {
        row.querySelector(".bar span").style.width = Math.max(3, (a.coins + max) / (2 * max) * 100) + "%";
      });
      const gained = prev == null ? rank === 0 && a.week > 0 ? a.week : 0 : a.coins - prev;
      if (gained > 0) coinRain(box, rank * rowH, Math.min(14, Math.ceil(gained * 2)), "+".concat(Math.round(gained * 10) / 10));
      row.dataset.coins = a.coins;
    });
    box.style.height = list.length * rowH + "vw";
  }
  function coinRain(box, topVw, n, label) {
    const tag = document.createElement("div");
    tag.className = "gain";
    tag.style.top = topVw + "vw";
    tag.textContent = label + " monedas";
    box.appendChild(tag);
    setTimeout(() => tag.remove(), 3e3);
    for (let k = 0; k < n; k++) {
      const c = document.createElement("span");
      c.className = "coin";
      c.textContent = "\xA2";
      c.style.left = 55 + Math.random() * 40 + "%";
      c.style.top = topVw - 4 + "vw";
      c.style.animationDelay = k * 0.12 + "s";
      box.appendChild(c);
      setTimeout(() => c.remove(), 2600 + k * 120);
    }
  }
  function tvTicker(qs) {
    const t = $("#tvtk");
    if (!t) return;
    const items = qs.map((q) => {
      var _a, _b;
      const up = ((_a = q.changePct) != null ? _a : 0) >= 0;
      return '<span class="tq"><b>'.concat(esc(q.symbol), "</b> ").concat(usd(q.price), ' <em class="').concat(up ? "up" : "dn", '">').concat(up ? "\u25B2" : "\u25BC", " ").concat(Math.abs((_b = q.changePct) != null ? _b : 0).toFixed(2), "%</em></span>");
    }).join("");
    const html = items + '<span class="tq dim">Todo es dinero virtual \xB7 JARVIS no promete ganancias, demuestra con datos</span>';
    if (t.dataset.h !== html) {
      t.dataset.h = html;
      t.innerHTML = html + html;
      t.style.animationDuration = Math.max(30, qs.length * 5) + "s";
    }
  }
  async function tvRefresh() {
    var _a, _b, _c;
    let d;
    try {
      d = await api("/api/tv");
    } catch (e) {
      return;
    }
    if (!$("#tv")) return;
    $("#tvm").innerHTML = d.motor.running ? '<b style="color:#2fd58a">\u25CF Motor activo</b>' : "<b>\u25CB Motor en pausa</b>";
    $("#tvmk").innerHTML = "Bolsa de NY: <b>".concat(d.marketOpen ? "abierta" : "cerrada", "</b>");
    $("#tvai").innerHTML = "Gasto IA: <b>".concat(usd(d.ai.month), "</b> / ").concat(usd(d.ai.monthCap, 0));
    $("#tvh").innerHTML = "".concat(esc(d.headline), "<small>").concat(esc(d.lotteryLine), "</small>");
    const a = d.account, prev = tvPrev;
    const delta = a.total - a.start, up = delta >= 0;
    animNum($("#k-money"), prev ? prev.account.total : a.start, a.total, (v) => usd(v));
    $("#k-arrow").className = "arrow " + (up ? "up" : "dn");
    $("#k-arrow").textContent = up ? "\u25B2" : "\u25BC";
    $("#k-money-sub").innerHTML = '<span class="'.concat(up ? "up" : "dn", '">').concat(up ? "+" : "\u2212").concat(usd(Math.abs(delta)).replace("\u2212", ""), " (").concat(pct(a.returnPct, 2), ")</span> desde ").concat(usd(a.start, 0)).concat(a.fx ? " \xB7 \u2248 RD$".concat(Math.round(a.total * a.fx).toLocaleString("es-DO")) : "");
    if (prev && prev.account.total !== a.total) {
      const k = $(".kp.money");
      k.classList.remove("flash-up", "flash-dn");
      void k.offsetWidth;
      k.classList.add(a.total > prev.account.total ? "flash-up" : "flash-dn");
    }
    const p = d.predictions;
    if (p.hitRate != null) animNum($("#k-hit"), (_a = prev == null ? void 0 : prev.predictions.hitRate) != null ? _a : 0, p.hitRate, (v) => v.toFixed(1) + "%");
    else $("#k-hit").textContent = "\u2014";
    $("#k-hit-sub").textContent = "".concat(p.hits, " aciertos \xB7 ").concat(p.misses, " fallos \xB7 ").concat(p.pending, " pendientes");
    animNum($("#k-streak"), (_b = prev == null ? void 0 : prev.predictions.streak.current) != null ? _b : 0, p.streak.current || 0, (v) => Math.round(v).toString());
    $("#k-streak-sub").textContent = "".concat(p.streak.type ? p.streak.type === "acierto" ? "aciertos seguidos" : "fallos seguidos" : "esperando resultados", " \xB7 r\xE9cord ").concat(p.streak.bestHits);
    animNum($("#k-exp"), (_c = prev == null ? void 0 : prev.learning.experiments) != null ? _c : 0, d.learning.experiments, (v) => Math.round(v).toString());
    $("#k-exp-sub").textContent = "".concat(d.learning.byStatus.en_prueba || 0, " en prueba en vivo \xB7 ").concat(d.learning.byStatus.validada || 0, " validadas");
    const evs = d.activity.slice(0, 13);
    const con = $("#tvcon");
    con.innerHTML = evs.map((e, i) => '<div class="'.concat(e.important ? "imp" : "", '"><time>').concat(hhmm(e.ts), "</time><span>").concat(e.agent ? '<span class="ag">['.concat(esc((AGENTS[e.agent] || [e.agent])[0]), "]</span> ") : "", '<span class="tx" data-full="').concat(esc(e.text), '">').concat(i === 0 && e.id > tvLastId ? "" : esc(e.text), "</span>").concat(i === 0 ? '<span class="cursor"></span>' : "", "</span></div>")).join("");
    const first = con.querySelector(".tx");
    if (first && !first.textContent) {
      const full = first.dataset.full;
      let n = 0;
      const ty = setInterval(() => {
        if (!first.isConnected) return clearInterval(ty);
        first.textContent = full.slice(0, ++n);
        if (n >= full.length) clearInterval(ty);
      }, 22);
    }
    const alert = tvLastId && d.activity.find((e) => e.id > tvLastId && e.important);
    if (alert) {
      const el = document.createElement("div");
      el.className = "alert";
      el.textContent = alert.text;
      $("#tv").appendChild(el);
      setTimeout(() => el.remove(), 7e3);
    }
    tvLastId = Math.max(tvLastId, ...d.activity.map((e) => e.id), 0);
    tvChart(d.chart);
    $("#tvrank").innerHTML = d.ranking.length ? d.ranking.slice(0, 6).map((c, i) => {
      var _a2;
      return '<div class="rc" style="animation-delay:'.concat(i * 0.08, 's"><div class="s"><i style="background:').concat(TVC[c.light], ";box-shadow:0 0 12px ").concat(TVC[c.light], '"></i>').concat(esc(coName(c.symbol)), '<span class="c">').concat(c.probBeat != null ? Math.round(c.probBeat * 10) + "/10" : "", '</span></div><div class="cbar"><span style="width:').concat(Math.round(((_a2 = c.probBeat) != null ? _a2 : c.confidence) * 100), "%;background:").concat(TVC[c.light], '"></span></div><p>').concat(esc(c.why || ""), "</p></div>");
    }).join("") : '<div class="empty-tv">El ranking aparece cuando haya suficientes precios.</div>';
    tvDebate(d.debate);
    tvLeague(d.league);
    tvTicker(d.quotes || []);
    tvPrev = d;
  }
  async function render() {
    const [name, ...rest] = (location.hash.slice(1) || "inicio").split("/");
    const arg = rest.join("/");
    document.querySelectorAll("#tabs a").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === "#" + name ? "page" : "false"));
    if (name === "tv") {
      app.innerHTML = "";
      return tvOpen();
    }
    tvClose();
    const v = views[name] || views.inicio;
    try {
      app.innerHTML = await v(decodeURIComponent(arg || ""));
      document.querySelectorAll("[data-go]").forEach((el) => el.onclick = () => location.hash = el.dataset.go);
      if (v.after) await v.after(decodeURIComponent(arg || ""));
      bindDebateButtons();
    } catch (e) {
      if (e.message !== "Inicia sesi\xF3n.") app.innerHTML = '<div class="card msg err">'.concat(esc(e.message), "</div>");
    }
    window.scrollTo(0, 0);
  }
  async function pulse() {
    try {
      const s = await api("/api/status");
      if (s.storage && !s.storage.persistent && !document.getElementById("nopersist")) document.querySelector("main").insertAdjacentHTML("beforebegin", '<div id="nopersist" class="msg err" style="text-align:center;padding:10px;font-weight:700">\u26A0\uFE0F Falta el volumen en Railway: tus datos se borran en cada actualizaci\xF3n. Agrega un volumen montado en /data.</div>');
      const alive = s.heartbeat && Date.now() - Date.parse(s.heartbeat) < 20 * 6e4;
      $("#sys-dot").className = "status-dot " + (alive && s.ledger.ok ? "on" : "off");
      $("#sys-text").textContent = alive ? s.motor.running ? "Trabajando" : "En pausa" : "Sin latido";
    } catch (e) {
    }
  }
  async function boot() {
    var _a;
    await loadBrand();
    try {
      ME = await api("/api/me");
    } catch (e) {
      return;
    }
    await loadBudget();
    applyUser();
    if (ME.profile && !ME.profile.setup && !location.hash.startsWith("#perfil")) location.hash = "#perfil";
    $("#top").classList.remove("hide");
    $("#nav-admin").classList.toggle("hide", ME.role !== "admin");
    (_a = $("#nav-estado")) == null ? void 0 : _a.classList.toggle("hide", ME.role !== "admin");
    render();
    pulse();
    setInterval(pulse, 6e4);
  }
  $("#theme").onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("jv-theme", t);
    } catch (e) {
    }
  };
  $("#logout").onclick = async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {
    });
    showAuth();
  };
  window.addEventListener("hashchange", () => ME && render());
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {
  });
  boot();
})();
