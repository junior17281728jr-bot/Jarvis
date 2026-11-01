// JARVIS — interfaz. Resumen arriba, detalle con un clic. Cada número dice de dónde viene.
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (v, d = 2) => (v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + 'US$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const rd = v => (v == null ? '—' : 'RD$' + Number(v).toLocaleString('es-DO', { maximumFractionDigits: 2 }));
const pct = (v, d = 1) => (v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%');
const cls = v => (v > 0 ? 'good' : v < 0 ? 'bad' : '');
const timeAgo = iso => { if (!iso) return 'nunca'; const m = Math.round((Date.now() - Date.parse(iso)) / 60e3); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const hhmm = iso => new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false });
const LIGHT = { verde: 'Sí, invierte', amarillo: 'Invierte poco', rojo: 'No inviertas', gris: 'Igual que el azar' };
let MYBUDGET = null;
const STYLE_PCT = { conservador: { verde: 0.05, amarillo: 0.025, max: 0.1 }, equilibrado: { verde: 0.1, amarillo: 0.05, max: 0.2 }, arriesgado: { verde: 0.15, amarillo: 0.075, max: 0.25 } };
const myStyle = () => STYLE_PCT[MYBUDGET?.profile?.style] || STYLE_PCT.equilibrado;
const baseAmt = l => { const B = MYBUDGET?.usd ?? 100, p = myStyle()[l] || 0; return l === 'rojo' || !p ? 0 : Math.max(5, Math.round(B * p)); };
const VERDICT = new Proxy({}, { get: (_, l) => (l === 'verde' ? `Sí, te recomiendo invertir ${usd(baseAmt('verde'), 0)}` : l === 'amarillo' ? `Invierte poco: ${usd(baseAmt('amarillo'), 0)}, con cuidado` : 'No te recomiendo invertir ahora') });
const scaleProj = (r, amt) => (r ? { ...r, bad: r.bad * amt / 10, probable: r.probable * amt / 10, good: r.good * amt / 10 } : r);
async function loadBudget() { try { MYBUDGET = await api('/api/budget'); } catch { MYBUDGET = null; } }
const light = l => `<span class="light ${l}"><i></i>${LIGHT[l] || l}</span>`;
const FACTOR = { tendencia: 'Cómo le va contra el mercado', historial: 'Aciertos previos de JARVIS', empresa: 'Salud de la empresa', riesgo: 'Cuánto sube y baja', polemicas: 'Noticias' };
const STATUS = { en_desarrollo: 'En desarrollo', en_prueba: 'En prueba en vivo', en_evaluacion: 'En evaluación', validada: 'Validada (simulación)', no_validada: 'No validada', en_revision: 'En revisión', retirada: 'Retirada' };
const GLOSS = {
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
};
const term = (w, label = w) => `<abbr title="${esc(GLOSS[w] || '')}" style="text-decoration:underline dotted;cursor:help">${esc(label)}</abbr>`;

// ---------- Marca propia ----------
const PALETTES0 = { cian: { name: 'Cian', dark: '#38d6f5', light: '#1a6dff' }, azul: { name: 'Azul', dark: '#6fa0ff', light: '#1a4fd6' }, violeta: { name: 'Violeta', dark: '#b39bff', light: '#6a46e8' }, dorado: { name: 'Dorado', dark: '#ffc94d', light: '#9a6400' }, rosa: { name: 'Rosa', dark: '#ff7cc8', light: '#c02a86' }, turquesa: { name: 'Turquesa', dark: '#3ee6c4', light: '#00806a' } };
let BRAND = { name: 'JARVIS', tagline: 'Tu investigador de bolsa y loterías', owner: '', color: 'cian', hasLogo: false, v: 0, palette: PALETTES0.cian, palettes: PALETTES0 };
const brandMark = (big = false) => BRAND.hasLogo ? `<img class="blogo${big ? ' big' : ''}" src="/brand/logo?v=${BRAND.v}" alt="">` : `<span class="ring${big ? ' big' : ''}"><i></i></span>`;
const brandName = () => `<span class="bname${BRAND.name.length <= 8 ? ' wide' : ''}">${esc(BRAND.name)}</span>`;
function applyBrand() {
  document.title = BRAND.name;
  document.querySelector('.top .logo').innerHTML = brandMark() + brandName();
  let st = document.getElementById('brand-css'); if (!st) { st = document.createElement('style'); st.id = 'brand-css'; document.head.appendChild(st); }
  const P = BRAND.palette;
  st.textContent = `:root{--accent:${P.light}}:root[data-theme="dark"]{--accent:${P.dark};--glow:0 0 18px ${P.dark}59}.tv{--a:${P.dark}}`;
  let ic = document.querySelector('link[rel="icon"]'); if (ic) { ic.href = BRAND.hasLogo ? `/brand/logo?v=${BRAND.v}` : '/icon.svg'; ic.type = BRAND.hasLogo ? '' : 'image/svg+xml'; }
}
async function loadBrand() { try { const b = await fetch('/api/brand').then(r => r.json()); if (b && b.name) BRAND = b; } catch { /* usa la marca por defecto */ } applyBrand(); }
const footLine = () => `<div class="foot">${esc(BRAND.name)}${BRAND.owner ? ` · propiedad de ${esc(BRAND.owner)}` : ''} · Todo es dinero virtual. Estimaciones con pruebas, no promesas. La decisión de invertir dinero real es tuya.</div>`;

// ---------- Para entender a primera vista ----------
const CO = { SPY: 'El mercado (S&P 500)', VOO: 'Fondo S&P 500', QQQ: 'Fondo Nasdaq 100', MSFT: 'Microsoft', AAPL: 'Apple', NVDA: 'NVIDIA', AMZN: 'Amazon', TSLA: 'Tesla', KO: 'Coca-Cola', JPM: 'JPMorgan', GOOGL: 'Google', GOOG: 'Google', META: 'Meta (Facebook)', NFLX: 'Netflix', DIS: 'Disney', V: 'Visa', MA: 'Mastercard', WMT: 'Walmart', COST: 'Costco', PEP: 'Pepsi', MCD: "McDonald's", NKE: 'Nike', 'BRK.B': 'Berkshire Hathaway', JNJ: 'Johnson & Johnson', PG: 'Procter & Gamble', XOM: 'ExxonMobil', AMD: 'AMD', INTC: 'Intel', BAC: 'Bank of America', UNH: 'UnitedHealth', HD: 'Home Depot', ORCL: 'Oracle', CRM: 'Salesforce', ADBE: 'Adobe', PYPL: 'PayPal', UBER: 'Uber', SBUX: 'Starbucks', T: 'AT&T', VZ: 'Verizon', AVGO: 'Broadcom', LLY: 'Eli Lilly' };
const coName = s => CO[s] || s;
function coBadge(sym, size = 40) {
  let h = 0; for (const ch of String(sym)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const t = String(sym).replace('.', '').slice(0, 4);
  return `<span class="cob" style="--h:${h};width:${size}px;height:${size}px;font-size:${Math.round(size * (t.length > 3 ? .27 : .34))}px">${esc(t)}</span>`;
}
const coCell = (sym, sub = '') => `<div class="coc">${coBadge(sym)}<div><b>${esc(coName(sym))}</b><div class="note">${esc(sym)}${sub ? ' · ' + sub : ''}</div></div></div>`;
const AGENTS = { largo: ['Largo plazo', 'var(--accent)'], corto: ['Corto plazo', 'var(--violet)'], polemicas: ['Noticias', 'var(--warn)'], loteria: ['Loterías', 'var(--good)'] };
/** Probabilidad dicha como "X de cada 10" con puntitos: más fácil de imaginar que un porcentaje. */
function chanceDots(p, { what = 'le gana al mercado', big = false } = {}) {
  if (p == null || isNaN(p)) return '<span class="note">—</span>';
  if (p < 0.095) return `<div class="chance${big ? ' big' : ''}"><div class="ct"><b>${Math.max(1, Math.round(p * 100))} de cada 100</b> veces ${esc(what)}</div></div>`;
  const n = Math.round(p * 10), col = p >= 0.55 ? 'var(--good)' : p >= 0.45 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="chance${big ? ' big' : ''}" title="${Math.round(p * 100)}%"><div class="dots">${Array.from({ length: 10 }, (_, i) => `<i${i < n ? ` style="background:${col};border-color:${col}"` : ''}></i>`).join('')}</div><div class="ct"><b>${n} de cada 10</b> veces ${esc(what)}</div></div>`;
}
/** Con cuánto quedarías: lo probable en grande y el rango en una barrita. */
function moneyRange(base, r, { months = 6 } = {}) {
  if (!r) return '<span class="note">—</span>';
  const lo = base + r.bad, mid = base + r.probable, hi = base + r.good, span = hi - lo || 1, x = v => Math.max(0, Math.min(100, (v - lo) / span * 100));
  return `<div class="mr"><div class="mr-v ${cls(r.probable)}">${usd(mid)}</div><div class="mr-bar"><span class="z" style="left:${x(base)}%"></span><span class="m" style="left:${x(mid)}%"></span></div><div class="note">entre ${usd(lo)} y ${usd(hi)} en ${months} meses</div></div>`;
}
const humanDays = d => (d == null ? 'más de un año' : d <= 7 ? `${Math.max(1, Math.round(d / 5))} semana${Math.round(d / 5) > 1 ? 's' : ''}` : d < 42 ? `${Math.round(d / 5)} semanas` : `${Math.round(d / 21)} mes${Math.round(d / 21) > 1 ? 'es' : ''}`);
/** Cuánta paciencia pide, en una etiqueta corta. */
function patience(t, lightName) {
  if (!t || lightName === 'rojo') return '';
  if (t.immediate) return '<span class="pat fast">⚡ Puede ganar en semanas</span>';
  if (t.recommended) return `<span class="pat">⏳ Déjala al menos ${esc(t.recommended.label)}</span>`;
  return '<span class="pat">⏳ Déjala 1 año o más (sube y baja mucho)</span>';
}
const takeaway = t => t ? `<div class="takeaway"><b>En pocas palabras:</b> ${t}</div>` : '';

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) { showAuth(); throw new Error('Inicia sesión.'); }
  if (!res.ok) throw new Error(j.error || 'Error');
  return j;
}

/** Achica la imagen en el navegador (máx. 512 px) para que el logo pese poco. */
function shrinkImage(file) {
  return new Promise((ok, fail) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return fail(new Error('Usa una imagen PNG, JPG o WEBP.'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 512 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let d = c.toDataURL('image/png'); if (d.length > 380000) d = c.toDataURL('image/webp', 0.9); if (!d.startsWith('data:image/webp') || d.length > 380000) d = d.length > 380000 ? c.toDataURL('image/jpeg', 0.85) : d;
      d.length > 400000 ? fail(new Error('La imagen sigue muy pesada; prueba con otra más simple.')) : ok(d); };
    img.onerror = () => fail(new Error('No pude leer esa imagen.')); img.src = url;
  });
}

// ---------- Gráficos SVG ----------
function lineChart(points, { h = 200, color = 'var(--accent)', bench = null, label = '' } = {}) {
  if (!points?.length) return '<div class="empty">Sin datos de precios todavía.</div>';
  const W = 760, H = h, pad = 34, vals = points.map(p => p[1]).concat(bench ? bench.map(p => p[1]) : []);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = i => pad + (i / (points.length - 1 || 1)) * (W - pad - 10), y = v => 10 + (1 - (v - min) / span) * (H - 40);
  const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const ticks = [min, min + span / 2, max];
  const lastP = points.at(-1);
  const months = points.filter((p, i) => i % Math.ceil(points.length / 6) === 0);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}">
    ${ticks.map(t => `<line x1="${pad}" x2="${W - 10}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="0" y="${y(t) + 4}" font-size="11" fill="var(--mute)">${t >= 100 ? t.toFixed(0) : t.toFixed(2)}</text>`).join('')}
    ${months.map(p => { const i = points.indexOf(p); return `<text x="${x(i)}" y="${H - 6}" font-size="11" fill="var(--mute)">${esc(p[0].slice(2, 7))}</text>`; }).join('')}
    <path d="${path(points)} L${x(points.length - 1)} ${H - 30} L${x(0)} ${H - 30} Z" fill="${color}" opacity=".10"/>
    <path d="${path(points)}" fill="none" stroke="${color}" stroke-width="2.5"/>
    ${bench ? `<path d="${path(bench)}" fill="none" stroke="var(--mute)" stroke-width="1.8" stroke-dasharray="6 5"/>` : ''}
    <circle cx="${x(points.length - 1)}" cy="${y(lastP[1])}" r="5" fill="${color}" stroke="var(--panel)" stroke-width="2"/>
  </svg>`;
}
function gauge(conf, cases, label = 'Confianza', [hi, lo] = [0.66, 0.45]) {
  const a = Math.max(0.02, Math.min(0.98, conf)), ang = Math.PI * (1 - a), cx = 85, cy = 90, r = 70;
  const ex = cx + r * Math.cos(ang), ey = cy - r * Math.sin(ang);
  const col = conf >= hi ? 'var(--good)' : conf >= lo ? 'var(--warn)' : 'var(--bad)';
  return `<div style="text-align:center"><svg width="170" height="100" viewBox="0 0 170 100" role="img" aria-label="Confianza ${Math.round(conf * 100)}%">
    <path d="M15 90 A70 70 0 0 1 155 90" fill="none" stroke="var(--panel2)" stroke-width="14" stroke-linecap="round"/>
    <path d="M15 90 A70 70 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round"/>
    <text x="85" y="84" text-anchor="middle" fill="var(--ink)" font-size="28" font-weight="800">${Math.round(conf * 100)}%</text></svg>
    <div class="note" style="letter-spacing:.1em;text-transform:uppercase;font-weight:700;font-size:11px">${label === 'Confianza' ? term('confianza', 'Confianza') : esc(label)}${cases ? ` · ${cases} casos` : ''}</div></div>`;
}
function whyBars(contribs) {
  const max = Math.max(...contribs.map(c => Math.abs(c.contribution)), 1);
  return `<div class="why">${contribs.slice().sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).map(c => `<div class="w"><span>${esc(FACTOR[c.factor] || c.factor)}</span><b class="${cls(c.contribution)}" title="${c.contribution}">${Math.abs(c.contribution) < 1 ? 'Neutral' : c.contribution > 0 ? 'A favor' : 'En contra'}</b>
    <div class="bar"><span style="width:${Math.abs(c.contribution) / max * 100}%;background:${c.contribution >= 0 ? 'var(--good)' : 'var(--bad)'}"></span></div></div>`).join('')}</div>`;
}
function projBox(p, title) {
  if (!p) return '<div class="empty">Faltan datos para estimar.</div>';
  return `<div class="note" style="margin-bottom:8px">${esc(title)} · <span class="tag est">Estimación</span> basada en ${p.basedOnDays} días reales</div>
  <div class="mini3">
    <div class="pbox"><div class="l">Caso malo</div><div class="v ${cls(p.bad)}">${usd(p.bad)}</div></div>
    <div class="pbox"><div class="l">Lo probable</div><div class="v ${cls(p.probable)}">${usd(p.probable)}</div></div>
    <div class="pbox"><div class="l">Caso bueno</div><div class="v ${cls(p.good)}">${usd(p.good)}</div></div>
  </div><div class="note" style="margin-top:6px">Probabilidad de perder dinero: ${Math.round(p.lossChance * 100)}%. No es una promesa.</div>`;
}
function feed(items) {
  if (!items?.length) return '<div class="empty">Todavía no hay actividad. Activa el motor en Ajustes.</div>';
  return `<div class="feed">${items.map(e => `<div class="ev ${e.important ? 'imp' : ''}"><time>${hhmm(e.ts)}</time><span>${e.agent ? `<span class="ag" style="--ac:${(AGENTS[e.agent] || [0, 'var(--accent)'])[1]}">${esc((AGENTS[e.agent] || [e.agent])[0])}</span>` : ''}${esc(e.text)}</span></div>`).join('')}</div>`;
}
function steps(list) { return `<div class="steps">${list.map((s, i) => `<div class="step"><i>${i + 1}</i><div>${esc(s.step)}<small>${esc(s.note || '')}</small></div></div>`).join('')}</div>`; }
function todoFor(lightName) {
  if (lightName === 'verde') return [{ step: 'Invierte US$10 ahora', note: 'Dentro de tu límite por operación' }, { step: 'Sal si cae 8%', note: 'Pérdida máxima: US$0.80' }];
  if (lightName === 'amarillo') return [{ step: 'Invierte US$5 ahora', note: 'Entrada en dos partes por la duda' }, { step: 'Otros US$5 en 2 semanas', note: 'Solo si no sube más de 5% ni aparece una polémica' }, { step: 'Sal si cae 8%', note: 'Pérdida máxima: US$0.80' }];
  return [{ step: 'No compres por ahora', note: 'Las razones en contra pesan más' }, { step: 'Queda en vigilancia', note: 'JARVIS te avisa si cambia' }];
}

// ---------- Autenticación ----------
// Cuentas recordadas EN ESTE EQUIPO (solo el usuario, nunca la contraseña). La contraseña la guarda el
// llavero del celular o del navegador si la persona quiere (Face ID / autocompletar).
const ACC_KEY = 'jv.accounts';
function savedAccounts() { try { const a = JSON.parse(localStorage.getItem(ACC_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x.u === 'string').slice(0, 8) : []; } catch { return []; } }
function rememberAccount(u, name) { try { const a = savedAccounts().filter(x => x.u.toLowerCase() !== u.toLowerCase()); a.unshift({ u, name: name || u }); localStorage.setItem(ACC_KEY, JSON.stringify(a.slice(0, 8))); } catch { /* sin almacenamiento */ } }
function forgetAccount(u) { try { localStorage.setItem(ACC_KEY, JSON.stringify(savedAccounts().filter(x => x.u !== u))); } catch { /* sin almacenamiento */ } }

async function showAuth() {
  $('#top').classList.add('hide');
  const { needsSetup } = await fetch('/api/setup').then(r => r.json());
  const accs = needsSetup ? [] : savedAccounts();
  app.innerHTML = `<div class="center"><form class="card auth form" id="auth">
    <div class="auth-brand">${brandMark(true)}<div class="logo">${brandName()}</div>${BRAND.tagline ? `<div class="note">${esc(BRAND.tagline)}</div>` : ''}${BRAND.owner ? `<div class="owner">Programa privado de ${esc(BRAND.owner)}</div>` : ''}</div>
    <h1 style="text-align:center;font-size:20px">${needsSetup ? 'Crea tu cuenta de administrador' : accs.length ? '¿Quién entra?' : 'Inicia sesión'}</h1>
    ${needsSetup ? '<p class="note" style="text-align:center">Es la primera vez. Esta cuenta controla JARVIS y crea los usuarios de tus amigos.</p>' : ''}
    ${accs.length ? `<div class="accts" id="accs">${accs.map(x => `<div class="acct-item"><button type="button" class="acct" data-u="${esc(x.u)}"><span class="acct-av">${esc((x.name || x.u).trim().charAt(0).toUpperCase())}</span><span class="acct-t"><b>${esc(x.name || x.u)}</b><span class="note">${esc(x.u)}</span></span></button><button type="button" class="acct-x" data-x="${esc(x.u)}" title="Olvidar esta cuenta en este equipo" aria-label="Olvidar ${esc(x.u)}">×</button></div>`).join('')}</div>
      <button type="button" class="linkbtn" id="other">Entrar con otra cuenta</button>` : ''}
    <div id="userbox"${accs.length ? ' class="hide"' : ''}><label>Usuario<input id="u" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label></div>
    <div id="passbox"${accs.length ? ' class="hide"' : ''}>
      <div id="who" class="note hide" style="text-align:center;margin-bottom:6px"></div>
      <label>Contraseña<input id="p" name="password" type="password" autocomplete="${needsSetup ? 'new-password' : 'current-password'}" required minlength="${needsSetup ? 10 : 1}"></label>
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="rem" checked> Recordar mi usuario en este equipo</label>
      <div class="note" style="margin-top:4px">La contraseña la puede guardar tu iPhone (te lo ofrece al entrar) y después se pone sola con Face ID. Además, la sesión dura 30 días en este equipo.</div>
      <button class="btn" style="margin-top:10px">${needsSetup ? 'Crear y entrar' : 'Entrar'}</button>
    </div><div class="msg err" id="am"></div></form></div>`;
  const pick = u => {
    $('#u').value = u; $('#userbox').classList.add('hide'); $('#passbox').classList.remove('hide');
    const a = accs.find(x => x.u === u); $('#who').textContent = `Entrando como ${a?.name || u}`; $('#who').classList.remove('hide');
    document.querySelectorAll('.acct').forEach(b => b.classList.toggle('on', b.dataset.u === u)); $('#p').focus();
  };
  document.querySelectorAll('.acct').forEach(b => b.onclick = () => pick(b.dataset.u));
  document.querySelectorAll('.acct-x').forEach(b => b.onclick = () => { forgetAccount(b.dataset.x); showAuth(); });
  if ($('#other')) $('#other').onclick = () => { $('#u').value = ''; $('#who').classList.add('hide'); $('#userbox').classList.remove('hide'); $('#passbox').classList.remove('hide'); document.querySelectorAll('.acct').forEach(b => b.classList.remove('on')); $('#u').focus(); };
  if (accs.length === 1) pick(accs[0].u);
  $('#auth').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api(needsSetup ? '/api/setup' : '/api/login', { method: 'POST', body: { username: $('#u').value.trim(), password: $('#p').value } });
      if ($('#rem').checked) rememberAccount(r?.user?.username || $('#u').value.trim(), r?.user?.displayName); else forgetAccount($('#u').value.trim());
      boot();
    } catch (err) { $('#am').textContent = err.message; }
  };
}

// ---------- Vistas ----------
let ME = null;
const views = {};

views.inicio = async () => {
  const h = await api('/api/home');
  const greens = h.ranking.filter(c => c.light === 'verde'), alerts = h.activity.filter(a => a.important && Date.now() - Date.parse(a.ts) < 864e5).length;
  const best = h.myBest || greens[0] || h.ranking.find(c => c.light === 'amarillo');
  const p = h.predictions, leader = h.league[0];
  return `
  <section class="hero">${best ? coBadge(best.symbol, 64) : '<span class="cob idle" style="width:64px;height:64px;font-size:26px">⏸</span>'}<div style="flex:1;min-width:0"><div class="tag">Hoy en 10 segundos</div>
    <div class="big">${best ? `Te recomiendo: ${esc(coName(best.symbol))} → ${best.light === 'verde' ? `invierte ${usd(baseAmt('verde'), 0)}` : `invierte poco (${usd(baseAmt('amarillo'), 0)})`}` : 'Hoy no te recomiendo invertir en ninguna: lo mejor es esperar'}</div>
    <div class="sub">${best ? `${chanceDots(best.probBeat)}${patience(best.timing, best.light)} <a href="#analisis/${esc(best.symbol)}">Ver por qué ▸</a> · <a href="#mapa">Ver mi mapa ▸</a>` : 'Esperar también es una decisión. JARVIS sigue investigando y te avisa si algo cambia.'}</div>
    <div class="note" style="margin-top:4px">Tu dinero de práctica: <b class="${cls(h.account.returnPct)}">${usd(h.account.total)} (${pct(h.account.returnPct, 2)})</b> · ${alerts} aviso${alerts === 1 ? '' : 's'} hoy</div></div>
    <div class="pill">${h.system.motor.running ? '<span class="status-dot on"></span><b>Trabajando</b>' : '<span class="status-dot"></span><b>En pausa</b>'}</div></section>

  <section class="grid g4">
    <div class="card kpi" style="--c:var(--accent)"><div class="l">Tu dinero de práctica</div><div class="v">${usd(h.account.total)}</div><div class="s"><span class="${cls(h.account.returnPct)}">${pct(h.account.returnPct, 2)}</span> desde ${usd(h.account.start, 0)}${h.account.spy ? ` · el ${term('SPY', 'mercado')} hoy ${pct(h.account.spy.changePct, 2)}` : ''}</div></div>
    <div class="card kpi" style="--c:var(--good)"><div class="l">JARVIS acierta</div><div class="v">${p.hitRate != null ? Math.round(p.hitRate / 10) + ' de 10' : '—'}</div><div class="s">${p.hits} aciertos y ${p.misses} fallos (${p.hitRate != null ? p.hitRate + '%' : '—'}) · ${p.pending} esperando resultado</div></div>
    <div class="card kpi" style="--c:var(--warn)"><div class="l">Racha</div><div class="v">${p.streak.current || 0}</div><div class="s">${p.streak.type ? (p.streak.type === 'acierto' ? 'aciertos seguidos' : 'fallos seguidos') : 'sin datos'} · récord ${p.streak.bestHits} aciertos</div></div>
    <div class="card kpi" style="--c:var(--violet)"><div class="l">Monedas del mejor agente</div><div class="v">${leader ? leader.coins : 0}</div><div class="s">${leader ? esc(leader.name) : '—'}${leader?.week != null ? ` · ${leader.week >= 0 ? '+' : ''}${leader.week} esta semana` : ''} · trampas: ${h.cheats.length}</div></div>
  </section>

  ${ME?.role === 'admin' && h.setup.some(x => !x.ok) ? `<details class="card setup"><summary><span class="prog-ring" style="--p:${Math.round(h.setup.filter(x => x.ok).length / h.setup.length * 100)}"></span><b>Instalación: ${h.setup.filter(x => x.ok).length} de ${h.setup.length} pasos listos</b><span class="note">Toca para ver qué falta (solo tú lo ves)</span></summary>
    <div class="grid g3" style="gap:10px;margin-top:12px">${h.setup.map(x => `<div class="pbox" style="opacity:${x.ok ? .6 : 1}"><b class="${x.ok ? 'good' : ''}">${x.ok ? '✓' : '○'} ${esc(x.text)}</b>${x.ok ? '' : `<div class="note">${esc(x.how)}</div>`}</div>`).join('')}</div></details>` : ''}
  ${oppCard(h.opportunities)}

  <section class="grid split">
    <div class="card"><h2>Ranking de hoy <a class="more" href="#recomendaciones">Ver todas ▸</a></h2>${rankingTable(h.ranking, true)}</div>
    <div class="card"><h2>Pregúntale a JARVIS</h2>
      <form class="ask" id="ask"><input id="q" placeholder="¿Por qué me recomiendas Microsoft? ¿Cómo voy este mes?" maxlength="500"><button type="button" class="btn ghost" id="mic" title="Preguntar con la voz">🎤</button><button class="btn">Preguntar</button></form>
      <label class="note" style="flex-direction:row;align-items:center;gap:6px;margin-top:6px"><input type="checkbox" id="speak" style="width:auto"> Leer la respuesta en voz alta</label>
      <div id="ans"></div>
      <h2 style="margin-top:18px">Qué está haciendo ahora</h2>${feed(h.activity.slice(0, 12))}</div>
  </section>

  <section class="grid g3">
    <div class="card"><h2>Lo que aprendió <a class="more" href="#aprendizaje">Detalle ▸</a></h2>
      <div class="mini3">${['en_prueba', 'validada', 'no_validada'].map(s => `<div><div class="note">${STATUS[s]}</div><div style="font-size:24px;font-weight:800">${h.learning.byStatus[s] || 0}</div></div>`).join('')}</div>
      <div class="note" style="margin-top:8px">${h.learning.experiments} experimentos con datos bajo llave. ${h.rankingStats.resolved ? `Recomendaciones calificadas: ${h.rankingStats.hits} de ${h.rankingStats.resolved} acertadas.` : 'Las recomendaciones se califican a los 20 días de bolsa.'}</div></div>
    <div class="card"><h2>Liga de agentes <span class="more note">ganan monedas si ganan dinero</span></h2>${h.league.map(a => `<div class="w" style="margin-bottom:8px"><span>${esc(a.name)}</span><b>${a.coins}</b><div class="bar"><span style="width:${Math.max(4, Math.min(100, 50 + a.coins * 2))}%;background:linear-gradient(90deg,var(--violet),var(--accent))"></span></div></div>`).join('')}</div>
    <div class="card${ME?.profile?.interests?.loterias === false ? ' hide' : ''}"><h2>Loterías RD <a class="more" href="#loterias">Ver ▸</a></h2>
      <div class="mini3"><div><div class="note">Jugadas</div><b style="font-size:22px">${h.lottery.stats.settled}</b></div><div><div class="note">De cada RD$100 volvieron</div><b style="font-size:22px" class="${h.lottery.stats.per100 != null && h.lottery.stats.per100 < 100 ? 'bad' : ''}">${h.lottery.stats.per100 != null ? rd(h.lottery.stats.per100) : '—'}</b></div><div><div class="note">Lo normal a largo plazo</div><b style="font-size:22px">${rd(h.lottery.expectedQuinielaPer100)}</b></div></div>
      <div class="note" style="margin-top:8px">${h.lottery.effort === 'bajo' ? 'Ningún método le gana al azar: esfuerzo reducido, prioridad a la bolsa.' : 'Probando métodos contra el azar en cada sorteo.'}</div></div>
  </section>
  ${footLine()}`;
};
views.inicio.after = () => {
  bindOpp();
  $('#ask').onsubmit = async e => {
    e.preventDefault();
    const q = $('#q').value.trim(); if (!q) return;
    $('#ans').innerHTML = '<div class="answer muted">Pensando…</div>';
    try { const r = await api('/api/ask', { method: 'POST', body: { question: q } }); $('#ans').innerHTML = `<div class="answer">${esc(r.answer)}${r.provider ? `<div class="note" style="margin-top:6px">Respondió: ${esc(r.provider)}</div>` : ''}</div>`;
      if ($('#speak').checked && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(r.answer); u.lang = 'es-ES'; speechSynthesis.cancel(); speechSynthesis.speak(u); } }
    catch (err) { $('#ans').innerHTML = `<div class="answer msg err">${esc(err.message)}</div>`; }
  };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('#mic').title = 'Tu navegador no permite dictar; usa Chrome o Safari.'; $('#mic').disabled = true; return; }
  $('#mic').onclick = () => {
    const rec = new SR(); rec.lang = 'es-DO'; rec.interimResults = true;
    $('#mic').textContent = '● Escuchando'; $('#speak').checked = true;
    rec.onresult = e => { $('#q').value = [...e.results].map(x => x[0].transcript).join(''); if (e.results[e.results.length - 1].isFinal) $('#ask').requestSubmit(); };
    rec.onend = () => { $('#mic').textContent = '🎤'; };
    rec.onerror = ev => { $('#mic').textContent = '🎤'; $('#ans').innerHTML = `<div class="answer msg err">No pude escuchar (${esc(ev.error)}). Revisa el permiso del micrófono.</div>`; };
    rec.start();
  };
};

function oppCard(list) {
  if (!list?.length) return '';
  return `<section class="card"><h2>¿Cuánto puedes ganar? <span class="more note">estimación a ${list[0].months} meses, con pruebas, no promesa</span></h2>
    <div class="row" style="align-items:flex-end;margin-bottom:12px"><label style="width:220px">¿Cuánto piensas invertir? (US$)<input id="oppamt" type="number" min="1" step="1" value="${baseAmt('verde') || 10}"></label>
    <div class="note" style="flex:1">Mínimo para entrar: <b>US$${list[0].minimum}</b>${list[0].fixedCostUsd ? ` · para que los costos (US$${list[0].fixedCostUsd}) no se coman la ganancia: <b>US$${list[0].minimumWorth}</b>` : ''}. Cambia el monto y los números se recalculan.</div></div>
    <div class="grid g3">${list.map((o, i) => `<div class="pbox" style="padding:14px">
      <div style="display:flex;align-items:center;gap:10px">${coBadge(o.symbol, 36)}<a href="#analisis/${esc(o.symbol)}" style="font-size:18px;font-weight:800;color:var(--ink)">${esc(coName(o.symbol))}</a><span style="margin-left:auto">${light(o.light)}</span></div>
      ${o.probBeat != null ? `<div style="margin-top:8px">${chanceDots(o.probBeat)}</div>` : ''}
      <div style="margin:10px 0 4px;font-size:13px;color:var(--mute)">Lo más probable que ganes</div>
      <div style="display:flex;align-items:baseline;gap:10px"><span class="opp-v ${cls(o.pct.probable)}" data-p="${o.pct.probable}" style="font-size:30px;font-weight:800"></span><span class="${cls(o.pct.probable)}" style="font-weight:700">${pct(o.pct.probable)}</span></div>
      <div class="mini3" style="margin-top:8px"><div><div class="note">Caso malo</div><b class="opp-v ${cls(o.pct.bad)}" data-p="${o.pct.bad}"></b><div class="note">${pct(o.pct.bad)}</div></div>
      <div><div class="note">Caso bueno</div><b class="opp-v ${cls(o.pct.good)}" data-p="${o.pct.good}"></b><div class="note">${pct(o.pct.good)}</div></div>
      <div><div class="note">Chance de perder</div><b>${Math.round(o.lossChance * 100)}%</b></div></div>
      ${o.timing ? `<div style="margin-top:10px">${patience(o.timing, o.light)} <span class="note">${o.timing.toTarget?.median != null ? `Subir 5% tardó normalmente ${humanDays(o.timing.toTarget.median)}.` : ''}</span></div>` : ''}
      <div class="note" style="margin-top:8px">${esc(o.why)}</div></div>`).join('')}</div></section>`;
}
function bindOpp() {
  const inp = $('#oppamt'); if (!inp) return;
  const upd = () => { const a = Math.max(0, Number(inp.value) || 0); document.querySelectorAll('.opp-v').forEach(el => { const v = a * Number(el.dataset.p) / 100; el.textContent = (v >= 0 ? '+' : '') + usd(v); }); };
  inp.oninput = upd; upd();
}

/** La razón que más pesó: en contra si no la recomienda, a favor si sí. */
function mainReason(c) {
  const w = r => c.contributions?.find(x => x.factor === r.factor)?.contribution ?? 0;
  if (c.light === 'rojo') return c.reasons.find(r => r.factor === 'calibracion') || c.reasons.slice().sort((a, b) => w(a) - w(b))[0];
  return c.reasons.filter(r => r.factor !== 'calibracion').sort((a, b) => w(b) - w(a))[0];
}
function rankingTable(list, compact = false) {
  if (!list?.length) return '<div class="empty">El ranking aparece cuando JARVIS tenga precios de al menos 6 meses. Activa el motor o pulsa "Correr ciclo ahora" en Ajustes.</div>';
  return `<div class="tablewrap"><table class="rank"><tr><th>Empresa</th><th>¿Invierto?</th><th>¿Qué tan seguido gana?</th>${compact ? '' : `<th>Si pones ${usd(baseAmt('verde'), 0)}</th>`}<th></th></tr>
  ${list.map(c => `<tr class="click" data-go="#analisis/${esc(c.symbol)}"><td>${coCell(c.symbol, usd(c.price?.value))}</td><td>${light(c.light)}${compact ? `<div style="margin-top:6px">${patience(c.timing, c.light)}</div>` : `<div style="margin-top:6px;font-weight:700">${esc(VERDICT[c.light])}</div><div class="note" style="max-width:260px">Porque: ${esc(mainReason(c)?.text || '')}</div>`}</td>
  <td>${chanceDots(c.probBeat)}</td>
  ${compact ? '' : `<td>${moneyRange(baseAmt('verde'), scaleProj(c.projection?.personal, baseAmt('verde')))}<div style="margin-top:6px">${patience(c.timing, c.light)}</div></td>`}
  <td class="r"><a class="btn ghost sm" href="#analisis/${esc(c.symbol)}" onclick="event.stopPropagation()">Ver por qué ▸</a>${compact ? '' : c.debateId ? `<div style="margin-top:6px"><a href="#debate/${c.debateId}" onclick="event.stopPropagation()" class="note">Debate de las IA ▸</a></div>` : ME?.role === 'admin' && c.light !== 'rojo' ? `<div style="margin-top:6px"><button class="btn ghost sm" data-debate="${esc(c.symbol)}">Que debatan las IA</button></div>` : ''}</td></tr>`).join('')}</table></div>`;
}

// ---------- Mapa de oportunidades ----------
const ZL = { recomendada: ['✅', 'Te recomiendo', 'good'], observacion: ['👀', 'En observación', 'warn'], no_recomendada: ['⛔', 'No te recomiendo', 'bad'], candidata: ['🔭', 'Explorando', 'mute'], descartada: ['📦', 'Fuera del mapa', 'mute'] };
function mapScatter(items) {
  const pts = items.filter(r => r.card?.projection?.personal && r.card.probBeat != null);
  if (pts.length < 2) return '';
  const W = 760, H = 330, L = 56, R = 20, T = 20, B = 44;
  const ys = pts.map(r => r.card.projection.personal.probable), ymin = Math.min(-0.5, ...ys) - 0.3, ymax = Math.max(0.5, ...ys) + 0.3;
  const x = p => L + (Math.max(0.3, Math.min(0.7, p)) - 0.3) / 0.4 * (W - L - R), y = v => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  const col = { recomendada: 'var(--good)', observacion: 'var(--warn)', no_recomendada: 'var(--bad)' };
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Mapa: chance de ganarle al mercado contra ganancia probable">
    <rect x="${x(0.5)}" y="${T}" width="${W - R - x(0.5)}" height="${y(0) - T}" fill="var(--good-bg)" rx="10"/>
    <rect x="${L}" y="${y(0)}" width="${x(0.5) - L}" height="${H - B - y(0)}" fill="var(--bad-bg)" rx="10"/>
    <text x="${W - R - 10}" y="${T + 18}" text-anchor="end" font-size="13" font-weight="800" fill="var(--good)">✅ La mejor zona</text>
    <text x="${L + 10}" y="${H - B - 10}" font-size="13" font-weight="800" fill="var(--bad)">⛔ Evitar</text>
    <line x1="${x(0.5)}" x2="${x(0.5)}" y1="${T}" y2="${H - B}" stroke="var(--mute)" stroke-dasharray="4 4"/><line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--mute)" stroke-dasharray="4 4"/>
    <text x="${(L + W - R) / 2}" y="${H - 10}" text-anchor="middle" font-size="12" fill="var(--mute)">← menos veces · De cada 10 veces, cuántas le gana al mercado · más veces →</text>
    <text x="14" y="${(T + H - B) / 2}" font-size="12" fill="var(--mute)" transform="rotate(-90 14 ${(T + H - B) / 2})" text-anchor="middle">Ganancia probable con US$10 en 6 meses</text>
    <text x="${L - 6}" y="${y(0) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">US$0</text>
    ${pts.map(r => { const p = r.card.projection.personal.probable; return `<a href="#analisis/${esc(r.symbol)}"><g><circle cx="${x(r.card.probBeat)}" cy="${y(p)}" r="20" fill="${col[r.zone]}" opacity=".9" stroke="var(--panel)" stroke-width="3"><title>${esc(coName(r.symbol))}: ${esc(r.verdict)} · ${Math.round(r.card.probBeat * 10)} de 10 · ${p >= 0 ? '+' : ''}${usd(p)}</title></circle><text x="${x(r.card.probBeat)}" y="${y(p) + 4}" text-anchor="middle" font-size="${r.symbol.length > 3 ? 9.5 : 11}" font-weight="800" fill="#fff">${esc(r.symbol)}</text></g></a>`; }).join('')}
  </svg>`;
}
function mapCard(r, compact = false) {
  const [ic, , tone] = ZL[r.zone] || ZL.candidata;
  const verdict = r.zone === 'candidata' || r.zone === 'descartada' ? `Si estuviera en el mapa: ${r.verdict.charAt(0).toLowerCase()}${r.verdict.slice(1)}` : r.verdict;
  return `<div class="mcard ${tone}"><div class="mc-h">${r.rank ? `<span class="rk">#${r.rank}</span>` : ''}${coBadge(r.symbol, 36)}<div style="min-width:0;flex:1"><b>${esc(coName(r.symbol))}</b><div class="note">${esc(r.symbol)}${r.card.price?.value ? ' · ' + usd(r.card.price.value) : ''}</div></div>${r.trend ? `<span class="trend ${r.trend}">${r.trend === 'sube' ? '↑ subió' : '↓ bajó'}</span>` : ''}</div>
    <div class="conv"><span style="width:${Math.max(3, r.conv)}%"></span></div><div class="note">Qué tanto te conviene: <b>${r.conv}/100</b></div>
    <div class="mc-v ${tone}">${ic} ${esc(verdict)}</div>
    <div class="mc-s"><b>Por qué:</b><ul>${r.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
    ${r.need?.length && r.zone !== 'candidata' ? `<div class="mc-s"><b>Para que te la recomiende necesita:</b><ul>${r.need.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    ${(r.zone === 'recomendada' || r.zone === 'observacion') && !compact ? `<div class="mc-s">⏳ ${esc(r.hold)}</div>${r.size ? `<div class="mc-s"><b>¿Puedo poner más?</b> ${esc(r.size.more)}</div>` : ''}` : ''}
    ${r.exitIf?.length && !compact && r.zone !== 'candidata' ? `<div class="mc-s note"><b>La saco si:</b> ${esc(r.exitIf[0])}</div>` : ''}
    <div class="mc-f note">${r.zone === 'no_recomendada' && r.reds ? `${r.reds} revisión${r.reds > 1 ? 'es' : ''} seguida${r.reds > 1 ? 's' : ''} aquí · ` : ''}${r.zone === 'candidata' ? `estudiada ${esc(r.checkedAt)}` : `desde ${esc(r.since)}`}${r.active ? ` · <a href="#analisis/${esc(r.symbol)}">Análisis completo ▸</a>` : ''}</div></div>`;
}
views.mapa = async () => {
  const m = await api('/api/map');
  const z = m.zones, act = [...z.recomendada, ...z.observacion, ...z.no_recomendada], b = m.best, e = m.explore;
  const worst = z.no_recomendada.slice().sort((x, y) => x.conv - y.conv)[0];
  const zname = k => (ZL[k] || ['', k])[1];
  const col = (k, list) => `<div class="mcol"><div class="mcol-h ${ZL[k][2]}">${ZL[k][0]} ${ZL[k][1]} <span class="note">(${list.length})</span></div>${list.length ? list.map(r => mapCard(r)).join('') : `<div class="empty">${k === 'recomendada' ? 'Hoy ninguna cumple. JARVIS sigue buscando.' : 'Ninguna.'}</div>`}</div>`;
  return `<div><h1>Tu mapa de inversión</h1><p class="sub">Ordenado para tu estilo: <b>${esc(m.styleLabel || 'Equilibrado')}</b> (<a href="#perfil">cambiar</a>). Todas las empresas que JARVIS sigue, de la que más te conviene a la que menos. Las que no sirven no se olvidan: se revisan cada día y, si aparece una mejor, la reemplaza.</p></div>
  <section class="card explorer"><div class="ex-ic">🔭</div><div><b>Explorando sin parar</b><div class="note">Ya estudió <b>${e.studied}</b> de ${e.pool} empresas y fondos grandes de EE. UU.${e.pending ? ` · le faltan ${e.pending}` : ''} · busca más cada ${esc(e.every)}${e.lastAt ? ` (la última vez: ${timeAgo(e.lastAt)})` : ''}. Si una lleva ${e.redStreak} revisiones seguidas en "No te recomiendo" y aparece otra mejor, la cambia; la que sale se vuelve a revisar cada ${e.recheckDays} días.</div></div></section>
  ${b ? `<section class="card bestpick ${ZL[b.zone][2]}"><div class="s10-h">Tu mejor opción ahora</div><div class="bp">${coBadge(b.symbol, 72)}<div style="flex:1;min-width:0"><div class="bp-v">${esc(coName(b.symbol))}: ${esc(b.verdict)}</div>
    <ul class="bp-l">${b.why.map(w => `<li>${esc(w)}</li>`).join('')}<li>⏳ ${esc(b.hold)}</li>${b.size ? `<li><b>¿Puedo poner más?</b> ${esc(b.size.more)}</li>` : ''}${b.exitIf.map(w => `<li class="note">${esc(w)}</li>`).join('')}</ul></div>
    <div class="bp-r">${chanceDots(b.card.probBeat)}${moneyRange(b.size?.usd || 10, scaleProj(b.card.projection.personal, b.size?.usd || 10))}<a class="btn" href="#analisis/${esc(b.symbol)}">Ver el análisis ▸</a></div></div></section>`
    : `<section class="card bestpick bad"><div class="bp-v">Hoy no te recomiendo invertir en ninguna.</div><div class="note">Esperar también es una decisión. JARVIS sigue explorando y te avisa al celular cuando una suba a "Te recomiendo".</div></section>`}
  <section class="card"><h2>El mapa de un vistazo</h2>${takeaway('cada bolita es una empresa. Arriba a la derecha está lo que más te conviene: le gana al mercado más veces y con US$10 lo probable es ganar.')}<div class="scatterwrap">${mapScatter(act)}</div>
    <div class="legend"><span><i style="background:var(--good)"></i>Te recomiendo</span><span><i style="background:var(--warn)"></i>En observación</span><span><i style="background:var(--bad)"></i>No te recomiendo</span><span>Toca una bolita para ver su análisis</span></div></section>
  <section class="mcols">${col('recomendada', z.recomendada)}${col('observacion', z.observacion)}${col('no_recomendada', z.no_recomendada)}</section>
  <section class="card"><h2>🔭 Explorando para reemplazar <span class="more note">las mejores que encontró fuera del mapa</span></h2>
    ${z.candidata.length ? `${takeaway(worst ? `si una de estas conviene más que <b>${esc(coName(worst.symbol))}</b> (${worst.conv}/100) y esa sigue en "No te recomiendo", JARVIS hace el cambio.` : 'entran al mapa cuando hay espacio y convienen más.')}<div class="grid g3">${z.candidata.slice(0, 6).map(r => mapCard(r, true)).join('')}</div>` : '<div class="empty">Todavía no ha explorado fuera del mapa. Empieza cuando el motor está activo.</div>'}</section>
  ${z.descartada.length ? `<section class="card"><h2>Fuera del mapa <span class="more note">no se olvidan: se revisan cada ${e.recheckDays} días</span></h2><div class="grid g3">${z.descartada.map(r => `<div class="pbox"><div class="coc">${coBadge(r.symbol, 32)}<div><b>${esc(coName(r.symbol))}</b><div class="note">salió el ${esc(r.since)} · revisada ${esc(r.checkedAt)}</div></div></div><div class="note" style="margin-top:6px">${esc((m.moves.find(x => x.symbol === r.symbol && x.to_zone === 'descartada') || {}).reason || r.verdict)}</div></div>`).join('')}</div></section>` : ''}
  <section class="card"><h2>Movimientos recientes <span class="more note">sellados: no se pueden borrar</span></h2>${m.moves.length ? `<div class="moves">${m.moves.slice(0, 20).map(x => `<div class="mv"><time>${esc(String(x.ts).slice(0, 10))}</time><b>${esc(coName(x.symbol))}</b><span class="mv-z">${x.from_zone ? esc(zname(x.from_zone)) + ' → ' : ''}${esc(zname(x.to_zone))}</span><span class="note">${esc(x.reason)}</span></div>`).join('')}</div>` : '<div class="empty">Sin movimientos todavía.</div>'}</section>`;
};

// ---------- Buscar a tu medida ----------
const HZ = [[5, '1 semana'], [21, '1 mes'], [63, '3 meses'], [126, '6 meses'], [252, '1 año']];
views.buscar = async () => {
  const b = MYBUDGET || { usd: 100 };
  return `<div><h1>Buscar a mi medida</h1><p class="sub">Dile a JARVIS qué tan seguro lo quieres, en cuánto tiempo y cuánto vas a poner. Busca entre todas las empresas que ha estudiado y te dice cuáles cumplen, con números claros.</p></div>
  <section class="card"><form class="form" id="ff">
    <div><div class="note" style="margin-bottom:6px"><b>¿Qué tan seguro lo quieres?</b> (de cada 10 veces, cuántas)</div>
      <div class="row chips" id="fchips"><button type="button" class="btn ghost sm" data-r="8,10">Muy seguro (8 a 10)</button><button type="button" class="btn ghost sm" data-r="7,10">Seguro (7 a 10)</button><button type="button" class="btn ghost sm" data-r="5,7">Medio (5 a 7)</button><button type="button" class="btn ghost sm" data-r="4,5">Arriesgado (4 a 5)</button></div>
      <div class="grid g2" style="gap:10px;margin-top:8px"><label>Desde (de cada 10)<input id="fmin" type="number" min="0" max="10" step="0.5" value="7"></label><label>Hasta (de cada 10)<input id="fmax" type="number" min="0" max="10" step="0.5" value="10"></label></div></div>
    <div class="grid g3" style="gap:10px">
      <label>Que sea la chance de…<select id="fmet"><option value="ganar">terminar ganando dinero</option><option value="mercado">ganarle al mercado</option></select></label>
      <label>¿En cuánto tiempo?<select id="fdays">${HZ.map(([d, l]) => `<option value="${d}"${d === 252 ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>¿Cuánto vas a poner? (US$)<input id="famt" type="number" min="1" step="1" value="${baseAmt('verde')}"></label>
    </div>
    <div class="grid g3" style="gap:10px">
      <label>Lo más que aguantas perder en un mal caso (%)<input id="floss" type="number" min="1" max="100" placeholder="Ej.: 10 (opcional)"></label>
      <label>Buscar en<select id="fkind"><option value="todas">empresas y fondos</option><option value="empresas">solo empresas</option><option value="fondos">solo fondos</option></select></label>
      <label style="flex-direction:row;align-items:center;gap:8px;padding-top:22px"><input type="checkbox" id="frec" style="width:auto"> Solo las que JARVIS recomienda</label>
    </div>
    <button class="btn">Buscar</button>
    <div class="note">Tu dinero para invertir: <b>${usd(b.usd, 0)}</b> (cámbialo en <a href="#bolsa">Mi cuenta</a>). Los números salen de la historia real de cada acción: no son promesas.</div>
  </form></section>
  <div id="fres"></div>`;
};
views.buscar.after = () => {
  document.querySelectorAll('#fchips [data-r]').forEach(c => c.onclick = () => { const [a, z] = c.dataset.r.split(','); $('#fmin').value = a; $('#fmax').value = z; document.querySelectorAll('#fchips button').forEach(x => x.classList.toggle('ghost', x !== c)); });
  $('#ff').onsubmit = async e => {
    e.preventDefault();
    $('#fres').innerHTML = '<div class="card muted">Buscando…</div>';
    try {
      const r = await api('/api/finder', { method: 'POST', body: { minP: Number($('#fmin').value) / 10, maxP: Number($('#fmax').value) / 10, metric: $('#fmet').value, days: Number($('#fdays').value), amount: Number($('#famt').value), maxLossPct: $('#floss').value, kind: $('#fkind').value, onlyRec: $('#frec').checked } });
      const q = r.query, card = (x, i) => { const z = ZL[x.zone] || ZL.candidata; return `<div class="mcard ${z[2]}"><div class="mc-h"><span class="rk">${i + 1}</span>${coBadge(x.symbol, 36)}<div style="flex:1;min-width:0"><b>${esc(coName(x.symbol))}</b><div class="note">${esc(x.symbol)} · ${esc(z[1])}</div></div></div>
        <div class="fr-p">${chanceDots(x.p, { what: r.what === 'le ganó al mercado' ? `le ganó al mercado en ${r.label}` : `terminó ganando en ${r.label}` })}</div>
        <div class="mini3 frm"><div class="pbox"><div class="l">Con ${usd(q.amount, 0)}, lo normal</div><div class="v ${cls(x.normalUsd)}">${x.normalUsd != null ? (x.normalUsd >= 0 ? '+' : '') + usd(x.normalUsd) : '—'}</div></div><div class="pbox"><div class="l">En un mal caso (1 de cada 10)</div><div class="v ${cls(x.badUsd)}">${x.badUsd != null ? (x.badUsd >= 0 ? '+' : '') + usd(x.badUsd) : '—'}</div></div></div>
        ${x.zone === 'recomendada' || x.zone === 'observacion' ? `<div class="fit ok">✅ Cumple lo que pediste y JARVIS dice: ${esc(x.verdict.charAt(0).toLowerCase() + x.verdict.slice(1))}.</div>` : `<div class="fit no">⚠️ Cumple lo que pediste mirando el pasado, pero hoy JARVIS <b>no te la recomienda</b>: ${esc(x.why[0] || '')}</div>`}${x.active ? `<a class="note" href="#analisis/${esc(x.symbol)}">Análisis completo ▸</a>` : ''}</div>`; };
      const bb = r.bigBet;
      r.matches.sort((x, y) => (['recomendada', 'observacion'].includes(y.zone) ? 1 : 0) - (['recomendada', 'observacion'].includes(x.zone) ? 1 : 0));
      const okN = r.matches.filter(x => x.zone === 'recomendada' || x.zone === 'observacion').length;
      $('#fres').innerHTML = `<section class="card hsum" style="border-color:var(--${okN ? 'good' : 'warn'})"><div class="hs-big">${r.matches.length ? `Encontré ${r.matches.length} que cumplen; ${okN ? `JARVIS te recomienda ${okN} de ellas` : 'pero JARVIS no te recomienda ninguna'}` : 'Ninguna cumple exactamente lo que pediste'}</div><div class="hs-v">${esc(r.honest)}${r.matches.length && okN < r.matches.length ? ' Que antes casi siempre terminara ganando no basta: JARVIS también mira cómo le va hoy contra el mercado, sus noticias y si ha acertado con ella.' : ''}</div></section>
        ${r.matches.length ? `<section class="grid g3">${r.matches.slice(0, 9).map(card).join('')}</section>` : r.closest.length ? `<section class="card"><h2>Lo más cercano a lo que pediste</h2><div class="grid g3" style="margin-top:10px">${r.closest.map(card).join('')}</div></section>` : ''}
        <section class="card"><h2>Revisión de tu apuesta de ${usd(q.amount, 0)} <span class="more note">${bb.pctOfBudget}% de tu dinero</span></h2>
          <div class="answer" style="margin:10px 0;font-weight:700">${esc(bb.verdict)}</div>
          <div class="checks">${bb.checks.map(c => `<div class="ck ${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✕'} ${esc(c.text)}</div>`).join('')}</div>
          ${bb.worstUsd != null ? `<div class="note" style="margin-top:8px">En un mal caso (1 de cada 10 veces) con estas opciones podrías ver <b class="bad">${usd(bb.worstUsd)}</b> o más.</div>` : ''}
          ${bb.parts.length ? `<h3 class="cs-h">Cómo repartirla</h3><div class="tablewrap"><table><tr><th>Dónde</th><th class="r">Parte</th><th class="r">Monto</th><th>Por qué</th></tr>${bb.parts.map(p => `<tr><td>${coCell(p.symbol)}</td><td class="r">${p.pct}%</td><td class="r"><b>${usd(p.usd)}</b></td><td class="note">${esc(p.why)}</td></tr>`).join('')}</table></div>` : ''}
          <h3 class="cs-h">Cómo entrar sin apurarte</h3><div class="steps">${bb.steps.map((s, i) => `<div class="step"><i>${i + 1}</i><div>${esc(s)}</div></div>`).join('')}</div></section>`;
      $('#fres').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { $('#fres').innerHTML = `<div class="card msg err">${esc(err.message)}</div>`; }
  };
};

// ---------- Mi perfil: cada persona adapta JARVIS a su forma ----------
views.perfil = async () => {
  const d = await api('/api/profile');
  const p = d.profile, first = !p.setup;
  const card = (group, key, o) => `<button type="button" class="opt${(group === 'style' ? p.style : p.horizon) === key ? ' on' : ''}" data-g="${group}" data-k="${key}">${o.icon ? `<span class="oi">${o.icon}</span>` : ''}<b>${esc(o.label)}</b><span class="note">${esc(o.desc)}</span>${o.pct ? `<span class="note">"Sí, invierte" = ${Math.round(o.pct.verde * 100)}% de tu dinero</span>` : ''}</button>`;
  return `${first ? `<section class="card welcome"><div class="s10-h">Bienvenido${ME?.displayName ? ', ' + esc(ME.displayName) : ''}</div><div class="bp-v">Cuéntale a JARVIS cómo eres</div><p class="note">El núcleo (la investigación, el mapa y el historial) es el mismo para todos. Esto solo cambia cuánto te sugiere poner y en qué orden te muestra las opciones. Lo puedes cambiar cuando quieras.</p></section>` : `<div><h1>Mi perfil</h1><p class="sub">JARVIS se adapta a tu forma de invertir. Tu amigo tiene el suyo: cada uno ve lo mismo del núcleo, pero ordenado para sí.</p></div>`}
  <form id="pf" class="grid" style="gap:16px">
    <section class="card"><h2>Tu nombre</h2><label style="max-width:360px;margin-top:8px">Cómo quieres que te llame<input id="pn" maxlength="30" value="${esc(d.displayName || '')}"></label></section>
    <section class="card"><h2>¿Cómo eres con el riesgo?</h2><div class="opts" style="margin-top:10px">${Object.entries(d.styles).map(([k, o]) => card('style', k, o)).join('')}</div></section>
    <section class="card"><h2>¿Cuánto tiempo puedes dejar el dinero?</h2><div class="opts" style="margin-top:10px">${Object.entries(d.horizons).map(([k, o]) => card('horizon', k, o)).join('')}</div></section>
    <section class="card"><h2>¿Qué te interesa?</h2><div class="row" style="gap:16px;margin-top:10px">
      ${[['empresas', 'Empresas (Apple, Microsoft…)'], ['fondos', 'Fondos (reparten el riesgo)'], ['loterias', 'Loterías RD']].map(([k, l]) => `<label class="chk"><input type="checkbox" data-int="${k}"${p.interests[k] ? ' checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="note" style="margin-top:6px">Lo que no te interese se oculta de tus pantallas. JARVIS lo sigue investigando para los demás.</div></section>
    <section class="card"><h2>Tu dinero</h2><div class="row" style="gap:12px;align-items:flex-end;margin-top:8px"><label style="width:220px">Dinero para invertir (US$)<input id="pbu" type="number" min="10" step="1" value="${d.budget.usd}"></label><label class="chk" style="padding-bottom:10px"><input type="checkbox" id="pbe"${d.budget.emergency ? ' checked' : ''}> Tengo fondo de emergencia aparte</label></div></section>
    <section class="card"><h2>Tus avisos al celular</h2><label style="max-width:420px;margin-top:8px">Tu tema secreto en la app ntfy (opcional)<input id="pt" maxlength="64" value="${esc(p.ntfyTopic || '')}" placeholder="${esc((ME?.username || 'yo') + '-jarvis-7k2p')}"></label>
      <div class="note">Instala la app <b>ntfy</b>, suscríbete a ese nombre y te llegan tus avisos personales (por ejemplo, si tu inversión real cae 8%). Nadie más los ve.</div></section>
    <section class="card summary10"><div class="s10-h">Así te va a recomendar JARVIS</div><div id="pline" style="font-size:16px;line-height:1.55">${esc(d.line)}</div></section>
    <button class="btn" style="max-width:420px">${first ? 'Guardar y empezar' : 'Guardar mi perfil'}</button><div class="msg" id="pm"></div>
  </form>
  <section class="card"><h2>Cambiar mi contraseña</h2><form class="row" id="pwf" style="gap:12px;align-items:flex-end;margin-top:8px">
    <label style="flex:1;min-width:200px">Contraseña actual<input id="pw0" type="password" autocomplete="current-password" required></label>
    <label style="flex:1;min-width:200px">Contraseña nueva (10 o más)<input id="pw1" type="password" autocomplete="new-password" minlength="10" required></label>
    <button class="btn">Cambiar</button></form><div class="msg" id="pwm"></div></section>`;
};
views.perfil.after = () => {
  const sel = { style: null, horizon: null };
  document.querySelectorAll('.opt').forEach(b => {
    if (b.classList.contains('on')) sel[b.dataset.g] = b.dataset.k;
    b.onclick = () => { sel[b.dataset.g] = b.dataset.k; document.querySelectorAll(`.opt[data-g="${b.dataset.g}"]`).forEach(x => x.classList.toggle('on', x === b)); };
  });
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const interests = {}; document.querySelectorAll('[data-int]').forEach(c => { interests[c.dataset.int] = c.checked; });
    try {
      const r = await api('/api/profile', { method: 'POST', body: { displayName: $('#pn').value, style: sel.style, horizon: sel.horizon, interests, ntfyTopic: $('#pt').value, budget: { usd: Number($('#pbu').value), emergency: $('#pbe').checked } } });
      await loadBudget(); ME = await api('/api/me'); applyUser();
      $('#pline').textContent = r.line; $('#pm').className = 'msg ok'; $('#pm').textContent = 'Guardado. JARVIS ya te muestra todo a tu manera.';
      if (location.hash === '#perfil' && !window.__wasSetup) setTimeout(() => { location.hash = '#inicio'; }, 1200);
    } catch (err) { $('#pm').className = 'msg err'; $('#pm').textContent = err.message; }
  };
  window.__wasSetup = !!MYBUDGET?.profile?.setup;
  $('#pwf').onsubmit = async e => { e.preventDefault(); try { await api('/api/me/password', { method: 'POST', body: { current: $('#pw0').value, next: $('#pw1').value } }); $('#pwm').className = 'msg ok'; $('#pwm').textContent = 'Contraseña cambiada. Se cerraron tus otras sesiones.'; $('#pw0').value = $('#pw1').value = ''; } catch (err) { $('#pwm').className = 'msg err'; $('#pwm').textContent = err.message; } };
};
/** Muestra el nombre arriba y oculta lo que a esta persona no le interesa. */
function applyUser() {
  const chip = $('#mechip'); if (chip) chip.textContent = '👤 ' + (ME?.displayName || ME?.username || '');
  const lot = document.querySelector('#tabs a[href="#loterias"]'); if (lot) lot.classList.toggle('hide', ME?.profile?.interests?.loterias === false);
}

views.recomendaciones = async () => {
  const r = await api('/api/ranking');
  return `<div><h1>Recomendaciones de hoy</h1><p class="sub">Las mejores arriba. Toca cualquier empresa para ver por qué, con gráficos y pruebas.</p></div>
  <div class="legend-big"><span>${light('verde')} te la recomiendo: buenas pruebas a favor</span><span>${light('amarillo')} hay dudas: si entras, con poco</span><span>${light('rojo')} no te la recomiendo (puede subir, pero probablemente menos que el mercado)</span><span><span class="chance mini"><span class="dots"><i style="background:var(--good);border-color:var(--good)"></i><i style="background:var(--good);border-color:var(--good)"></i><i></i></span></span> de cada 10 veces que JARVIS vio algo parecido, cuántas le ganó al mercado</span></div>
  <div class="card">${rankingTable(r)}</div>
  <a class="card mapcta" href="#mapa">🗺️ <b>Ver mi mapa</b> <span class="note">las que te recomiendo, las que vigila, las que no y las que está explorando para reemplazarlas ▸</span></a>
  <details class="card"><summary><b>¿Cómo decide JARVIS?</b> <span class="note">toca para leer</span></summary><p class="note" style="margin-top:10px">Mira cinco cosas: cómo le va a la empresa contra el mercado, si JARVIS acertó antes con ella, la salud de la empresa según sus informes oficiales, cuánto sube y baja, y si hay noticias negativas. Cada recomendación queda sellada y a los 20 días de bolsa se revisa si acertó: así el historial es real y nadie lo puede maquillar.</p></details>`;
};
views.recomendaciones.after = bindDebateButtons;
function bindDebateButtons() {
  document.querySelectorAll('[data-debate]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation(); b.disabled = true; b.textContent = 'Debatiendo…';
    try { const d = await api('/api/debate/' + b.dataset.debate, { method: 'POST' }); location.hash = '#debate/' + d.id; } catch (e) { b.textContent = e.message.slice(0, 40); }
  });
}

views.empresa = async sym => {
  const d = await api('/api/stock/' + encodeURIComponent(sym));
  const c = d.card;
  const track = c?.reasons.find(r => r.factor === 'historial');
  return `<div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap"><div><div class="note"><a href="#recomendaciones">Recomendaciones</a> › ${esc(d.symbol)}</div>
    <h1 style="display:flex;align-items:center;gap:12px">${coBadge(d.symbol, 44)}${esc(coName(d.symbol))} <span class="muted" style="font-size:16px;font-weight:600">${d.quote ? usd(d.quote.price) + ' · ' + esc(d.quote.source) + ' · ' + timeAgo(d.quote.as_of) : ''}</span></h1></div>
    <span class="pill">Precio: <b>${esc(d.quoteStatus.label)}</b></span><a class="btn" href="#analisis/${esc(d.symbol)}" style="margin-left:auto">¿Por qué? Análisis profundo ▸</a><button class="btn ghost" id="watch">+ Lista de vigilancia</button></div>
  ${c ? `<section class="card verdict" style="">${light(c.light)}
    <div><div style="font-size:24px;font-weight:800">${esc(VERDICT[c.light])}</div><div class="sub">${esc(c.reasons[0]?.text || '')}</div></div>${chanceDots(c.probBeat, { big: true })}</section>` : '<div class="card empty">Esta empresa todavía no está en el ranking de hoy.</div>'}
  <section class="grid split">
    <div class="card"><h2>Precio del último año <span class="more note">Fuente: ${esc(d.barsSource || '—')}</span></h2>${lineChart(d.bars, { label: 'Precio de ' + d.symbol })}</div>
    <div class="card"><h2>Por qué se decidió así</h2>${c ? whyBars(c.contributions) : ''}<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">${(c?.reasons || []).map(r => `<div style="font-size:14px"><span class="tag ${r.kind === 'dato' ? 'dato' : 'opinion'}">${r.kind === 'dato' ? 'Dato' : 'Opinión'}</span> ${esc(r.text)}</div>`).join('')}</div></div>
  </section>
  <section class="grid g2">
    <div class="card"><h2>Qué hacer, paso a paso</h2>${c ? steps(todoFor(c.light)) : ''}</div>
    <div class="card"><h2>Cuánto podrías ganar o perder</h2>${c ? projBox(c.projection?.personal, 'Con US$10 en 6 meses') + '<div style="height:12px"></div>' + projBox(c.projection?.ejemplo, 'Con US$200 en 6 meses') : ''}</div>
  </section>
  <section class="grid g2">
    <div class="card"><h2>Informes oficiales (SEC)</h2>${d.facts.length ? `<table><tr><th>Dato</th><th>Periodo</th><th class="r">Valor</th></tr>${d.facts.sort((a, b) => (a.metric + b.period < b.metric + a.period ? -1 : 1)).map(f => `<tr><td>${esc(f.metric.replace(/_/g, ' '))}</td><td>${esc(f.period)}</td><td class="r">${usd(f.value / 1e9, 1)} mil M</td></tr>`).join('')}</table><div class="note">Fuente: SEC EDGAR (informes 10-K)</div>` : '<div class="empty">Sin informes cargados (los fondos como SPY no presentan estos informes).</div>'}</div>
    <div class="card"><h2>Noticias y polémicas</h2>${d.news.length ? d.news.map(n => `<div style="padding:8px 0;border-top:1px solid var(--line)">${n.polemic >= 2 ? `<span class="tag" style="background:var(--bad-bg);color:var(--bad)">Polémica${n.verified ? ' confirmada' : ''}</span> ` : ''}<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><div class="note">${esc(n.summary || '')} · ${esc(n.source)} · ${timeAgo(n.published_at)}</div></div>`).join('') : '<div class="empty">Sin noticias todavía.</div>'}</div>
  </section>
  <section class="grid g2">
    <div class="card"><h2>Historial de JARVIS con ${esc(d.symbol)}</h2>${d.history.length ? `<table><tr><th>Fecha</th><th>Dijo</th><th>Resultado</th></tr>${d.history.map(x => `<tr><td>${esc(x.sealedAt.slice(0, 10))}</td><td>${light(x.light)}</td><td>${x.correct == null ? '<span class="note">Pendiente</span>' : x.correct ? `<span class="good">✓ Acertó</span> <span class="note">${pct(x.outcome.excess * 100, 1)} vs mercado</span>` : `<span class="bad">✕ Falló</span> <span class="note">${pct(x.outcome.excess * 100, 1)} vs mercado</span>`}</td></tr>`).join('')}</table>` : '<div class="empty">Todavía no hay recomendaciones calificadas.</div>'}</div>
    <div class="card"><h2>Comentarios</h2><div id="cm"></div><form class="ask" id="cmf" style="margin-top:10px"><input id="cmt" placeholder="Escribe tu opinión para el grupo…" maxlength="1000"><button class="btn">Enviar</button></form></div>
  </section>`;
};
views.empresa.after = async sym => {
  const load = async () => { const c = await api('/api/comments?subject=' + encodeURIComponent('stock:' + sym)); $('#cm').innerHTML = c.length ? c.map(x => `<div style="padding:6px 0;border-top:1px solid var(--line)"><b>${esc(x.username)}</b> <span class="note">${timeAgo(x.ts)}</span><div>${esc(x.body)}</div></div>`).join('') : '<div class="empty">Sin comentarios todavía.</div>'; };
  await load();
  $('#cmf').onsubmit = async e => { e.preventDefault(); await api('/api/comments', { method: 'POST', body: { subject: 'stock:' + sym, body: $('#cmt').value } }); $('#cmt').value = ''; load(); };
  $('#watch').onclick = async () => { await api('/api/watchlist', { method: 'POST', body: { symbol: sym } }); $('#watch').textContent = '✓ En tu lista'; };
};

views.debate = async id => {
  const d = await api('/api/debate/' + id);
  const v = d.verdict, c = d.card;
  const bubble = (m, side) => m.failed ? `<div class="bub"><b>${esc(m.who)}</b><p class="note">No respondió: ${esc(m.reason)}</p></div>` :
    `<div class="bub ${side}"><div class="who">${esc(m.who)} <span class="note">· ${esc(m.label)}</span><span class="stance">${esc(m.stance.replace('_', ' '))}</span></div><p>${esc(m.text)}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${(m.evidence || []).map(e => `<span class="tag ${e.kind === 'dato' ? 'dato' : 'opinion'}">${e.kind === 'dato' ? 'Dato' : 'Opinión IA'}</span>${e.source ? `<span class="src ok">${esc(e.source)}</span>` : ''}`).join(' ')}</div>
    ${m.evidence?.length ? `<details><summary>más ▸</summary>${m.evidence.map(e => `<div class="note">• ${esc(e.text)}</div>`).join('')}</details>` : ''}</div>`;
  return `<div><div class="note"><a href="#recomendaciones">Recomendaciones</a> › Debate</div><h1>${esc(d.subject)} <span class="muted" style="font-size:15px">· ${d.rounds.length} rondas · costo ${usd(d.cost_usd, 3)} · sellado ${esc(d.created_at.slice(0, 16).replace('T', ' '))}</span></h1></div>
  <section class="card verdict" style=";border-color:var(--${v.light === 'verde' ? 'good' : v.light === 'amarillo' ? 'warn' : 'bad'})">${light(v.light)}
    <div><div class="note" style="text-transform:uppercase;letter-spacing:.12em;font-weight:800">Decisión final</div><div style="font-size:26px;font-weight:800">${esc(v.title)}</div><div class="sub">${esc(v.notes.join(' '))}</div><div class="note">Basada en: ${esc(v.basedOn)}</div></div>${gauge(v.confidence)}</section>
  <section class="grid split">
    <div class="card"><h2>Cómo debatieron</h2>${d.rounds.length ? d.rounds.map(r => `<div class="round"><i>Ronda ${r.round}</i>${esc(r.title)}</div><div class="bubbles">${r.messages.map((m, i) => bubble(m, i ? 'b' : 'a')).join('')}</div>`).join('') : '<div class="empty">No hubo debate: IA no disponible o tope de gasto alcanzado. La decisión usa solo datos e historial.</div>'}
      <div class="grid g2" style="gap:10px;margin-top:8px"><div class="card" style="background:var(--${v.agree ? 'good' : 'warn'}-bg);border-color:transparent"><b class="${v.agree ? 'good' : 'warn'}">${v.agree ? '✓ Coinciden' : '✕ No coinciden'}</b><div class="note">${v.agree ? 'Las dos IA llegaron a la misma postura final.' : 'Cada una mantuvo su postura: por eso la cautela.'}</div></div></div></div>
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card"><h2>Por qué se decidió así</h2>${c ? whyBars(c.contributions) : '<div class="empty">—</div>'}</div>
      <div class="card"><h2>Qué hacer, paso a paso</h2>${steps(v.todo)}</div>
      <div class="card"><h2>Con US$10 en 6 meses</h2>${c ? projBox(c.projection?.personal, 'Tu monto por operación') : '—'}</div>
    </div></section>`;
};

views.bolsa = async () => {
  const [a, r, wl] = await Promise.all([api('/api/account'), api('/api/ranking'), api('/api/watchlist')]);
  const syms = [...new Set([...r.map(c => c.symbol), ...wl, ...a.positions.map(p => p.symbol)])];
  const B = a.budget || MYBUDGET || { usd: 100, emergency: true };
  return `<section class="card mymoney"><h2>Mi dinero <span class="more note">JARVIS calcula todo con este monto</span></h2>
    <form class="row" id="bf" style="align-items:flex-end;gap:12px;margin-top:10px"><label style="width:220px">¿Cuánto dinero tienes para invertir? (US$)<input id="bu" type="number" min="10" step="1" value="${B.usd}"></label>
      <label style="flex-direction:row;align-items:center;gap:8px;padding-bottom:10px"><input type="checkbox" id="be" style="width:auto"${B.emergency ? ' checked' : ''}> Ya tengo fondo de emergencia aparte</label><button class="btn">Guardar</button></form>
    <div class="grid g3" style="gap:10px;margin-top:12px"><div class="pbox"><div class="l">"Sí, invierte" (${myStyle().verde * 100}%)</div><div class="v good">${usd(baseAmt('verde'), 0)}</div><div class="note">por idea</div></div><div class="pbox"><div class="l">"Invierte poco" (${myStyle().amarillo * 100}%)</div><div class="v warn">${usd(baseAmt('amarillo'), 0)}</div><div class="note">por idea</div></div><div class="pbox"><div class="l">Máximo con pruebas fuertes (${myStyle().max * 100}%)</div><div class="v">${usd(Math.round(B.usd * myStyle().max), 0)}</div><div class="note">solo si se cumplen las 5 pruebas</div></div></div>
    <div class="note" style="margin-top:8px">Porcentajes según tu estilo (${esc({ conservador: 'conservador', equilibrado: 'equilibrado', arriesgado: 'arriesgado' }[MYBUDGET?.profile?.style] || 'equilibrado')}). <a href="#perfil">Cambiar mi estilo ▸</a></div>
    <div class="row" style="margin-top:12px;gap:10px;align-items:center"><button type="button" class="btn ghost" id="breset">Empezar mi práctica con ${usd(B.usd, 0)}</button><span class="note">Tu cuenta de práctica empieza con ${usd(a.start, 0)}. Si la reinicias, la anterior queda guardada en el historial (no se borra).</span></div><div class="msg" id="bm"></div></section>
  <div><h1>Mi cuenta virtual</h1><p class="sub">Dinero de mentira, precios reales. Operaciones de ${usd(a.limits.min, 0)} a ${usd(a.limits.max, 0)}, como harías tú. Mercado ${a.marketOpen ? '<b class="good">abierto</b>' : '<b>cerrado</b> (9:30 a.m.–4:00 p.m. hora de Nueva York)'}.</p></div>
  <section class="grid g4">
    <div class="card kpi"><div class="l">Valor total</div><div class="v">${usd(a.total)}</div><div class="s"><span class="${cls(a.returnPct)}">${pct(a.returnPct * 100, 2)} desde ${usd(a.start, 0)}</span>${a.fx ? ` · ≈ ${rd(Math.round(a.total * a.fx.rate))}` : ''}</div></div>
    <div class="card kpi" style="--c:var(--accent2)"><div class="l">Efectivo</div><div class="v">${usd(a.cash)}</div><div class="s">Disponible para operar</div></div>
    <div class="card kpi" style="--c:var(--good)"><div class="l">Ganancia realizada</div><div class="v ${cls(a.realized)}">${usd(a.realized)}</div><div class="s">Operaciones cerradas: ${a.closed.length}</div></div>
    <div class="card kpi" style="--c:var(--warn)"><div class="l">No realizada</div><div class="v ${cls(a.unrealized)}">${usd(a.unrealized)}</div><div class="s">Provisional: cambia con el precio</div></div>
  </section>
  <section class="grid g2">
    <div class="card"><h2>Operar (virtual)</h2><form class="form" id="of">
      <div class="grid g2" style="gap:10px"><label>Acción<select id="osym">${syms.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
      <label>Operación<select id="oside"><option value="buy">Comprar</option><option value="sell">Vender</option></select></label></div>
      <div class="grid g2" style="gap:10px"><label id="ousdl">Monto (US$)<input id="ousd" type="number" min="${a.limits.min}" max="${a.limits.max}" step="0.5" value="${a.limits.max}"></label>
      <label id="oqtyl" class="hide">Cantidad de acciones<input id="oqty" type="number" step="0.000001" min="0"></label></div>
      <button class="btn">Ejecutar</button><div class="msg" id="om"></div>
      <div class="note">Se usa el precio real más reciente. Si el precio no es actual o el mercado está cerrado, la operación no se hace.</div></form></div>
    <div class="card"><h2>¿Cuánto invertir?</h2><form class="form" id="af">
      <div class="grid g2" style="gap:10px"><label>Dinero que piensas invertir (US$)<input id="aamt" type="number" min="1" value="100"></label><label>¿En cuánto tiempo lo necesitas? (meses)<input id="ahz" type="number" min="1" value="12"></label></div>
      <div class="grid g2" style="gap:10px"><label>Costos fijos (envío desde RD, comisión) US$<input id="afee" type="number" min="0" step="0.5" value="0"></label><label>¿Tienes fondo de emergencia?<select id="aem"><option value="1">Sí</option><option value="0">No</option></select></label></div>
      <label>¿Alguien te propuso algo extremo? (opcional)<input id="aex" placeholder="Ej.: meter el 100% en Tesla"></label>
      <button class="btn">Analizar</button><div id="ares"></div></form></div>
  </section>
  <section class="card"><h2>Tú vs JARVIS vs el mercado <span class="more note">desde ${esc(a.compare.since)}</span></h2>
    <div class="mini3"><div class="pbox"><div class="l">Tú</div><div class="v ${cls(a.compare.you)}">${pct(a.compare.you * 100, 2)}</div></div>
    <div class="pbox"><div class="l">Mejor estrategia de JARVIS</div><div class="v ${cls(a.compare.jarvisBest)}">${a.compare.jarvisBest != null ? pct(a.compare.jarvisBest * 100, 2) : '—'}</div></div>
    <div class="pbox"><div class="l">Mercado (${term('SPY')})</div><div class="v ${cls(a.compare.market)}">${a.compare.market != null ? pct(a.compare.market * 100, 2) : '—'}</div></div></div>
    <div class="note" style="margin-top:8px">Practica tú también: compara tus decisiones con las de JARVIS y con no hacer nada.${a.fx ? ` Tipo de cambio ${a.fx.rate.toFixed(2)} RD$/US$ (${esc(a.fx.source)}).` : ''}</div></section>
  <section class="card"><h2>Posiciones abiertas</h2>${a.positions.length ? `<div class="tablewrap"><table><tr><th>Acción</th><th class="r">Cantidad</th><th class="r">Costo promedio</th><th class="r">Precio</th><th class="r">Ganancia</th></tr>${a.positions.map(p => `<tr><td class="sym">${esc(p.symbol)}</td><td class="r">${p.qty.toFixed(5)}</td><td class="r">${usd(p.avgCost)}</td><td class="r">${usd(p.price)}</td><td class="r ${cls(p.pnl)}">${usd(p.pnl)} <span class="note">${pct(p.pnlPct * 100)}</span></td></tr>`).join('')}</table></div>` : '<div class="empty">Sin posiciones. Compra desde aquí o desde una recomendación.</div>'}</section>
  <section class="card"><h2>Historial de operaciones <a class="more" href="/api/export/operaciones">Exportar a Excel (CSV) ▸</a></h2>${a.closed.length ? `<div class="tablewrap"><table><tr><th>Acción</th><th>Entró</th><th>Salió</th><th class="r">Resultado</th></tr>${a.closed.slice().reverse().map(c => `<tr><td class="sym">${esc(c.symbol)}</td><td>${esc(c.openedAt.slice(0, 10))} a ${usd(c.entry)}</td><td>${esc(c.closedAt.slice(0, 10))} a ${usd(c.exit)}</td><td class="r ${cls(c.pnl)}">${usd(c.pnl)} (${pct(c.pnlPct * 100)})</td></tr>`).join('')}</table></div>` : '<div class="empty">Aún no hay operaciones cerradas.</div>'}</section>`;
};
views.bolsa.after = () => {
  $('#bf').onsubmit = async e => { e.preventDefault(); try { await api('/api/budget', { method: 'POST', body: { usd: Number($('#bu').value), emergency: $('#be').checked } }); await loadBudget(); $('#bm').className = 'msg ok'; $('#bm').textContent = 'Guardado. Todos los montos ahora se calculan con tu dinero.'; setTimeout(render, 900); } catch (err) { $('#bm').className = 'msg err'; $('#bm').textContent = err.message; } };
  $('#breset').onclick = async () => { try { const r = await api('/api/account/reset', { method: 'POST' }); $('#bm').className = 'msg ok'; $('#bm').textContent = `Listo: practicas con ${usd(r.account.start_cash, 0)}. La cuenta anterior quedó guardada.`; setTimeout(render, 1100); } catch (err) { $('#bm').className = 'msg err'; $('#bm').textContent = err.message; } };
  $('#oside').onchange = () => { const s = $('#oside').value === 'sell'; $('#ousdl').classList.toggle('hide', s); $('#oqtyl').classList.toggle('hide', !s); };
  $('#of').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('/api/order', { method: 'POST', body: { symbol: $('#osym').value, side: $('#oside').value, usd: Number($('#ousd').value), qty: Number($('#oqty').value), confirmEmotion: !!window.__emo } }); window.__emo = false;
      $('#om').className = 'msg ok'; $('#om').textContent = `Hecho: ${r.side === 'buy' ? 'compraste' : 'vendiste'} ${r.qty} ${r.symbol} a ${usd(r.execPrice)} (precio observado ${usd(r.observedPrice)}).`; setTimeout(render, 1500);
    } catch (err) { $('#om').className = 'msg err'; $('#om').textContent = err.message;
      if (/caliente|esperar/.test(err.message)) { $('#om').innerHTML += ' <button type="button" class="btn ghost" id="emo" style="padding:3px 10px">Entiendo, seguir igual</button>'; $('#emo').onclick = () => { window.__emo = true; $('#of').requestSubmit(); }; } }
  };
  $('#af').onsubmit = async e => {
    e.preventDefault();
    const r = await api('/api/advice', { method: 'POST', body: { amountUsd: Number($('#aamt').value), horizonMonths: Number($('#ahz').value), fixedCostUsd: Number($('#afee').value), hasEmergencyFund: $('#aem').value === '1', extremeIdea: $('#aex').value || null } });
    $('#ares').innerHTML = `<div class="answer">${light(r.light)}<div style="margin-top:8px">${r.notes.map(n => `<div>• ${esc(n)}</div>`).join('') || '<div>Tu situación permite invertir ese monto.</div>'}</div>
      ${r.plan.length ? `<div style="margin-top:10px"><b>Cómo repartirlo:</b>${r.plan.map(p => `<div class="w" style="margin-top:6px"><span>${esc(p.part)}</span><b>${p.pct}%</b><div class="bar"><span style="width:${p.pct}%;background:var(--accent)"></span></div><div class="note" style="grid-column:1/-1">${esc(p.why)}</div></div>`).join('')}</div>` : ''}
      ${r.projectionSPY ? `<div style="margin-top:10px">${projBox(r.projectionSPY, `Si lo pones en un fondo del mercado (SPY) por ${$('#ahz').value} meses`)}</div>` : ''}</div>`;
  };
};

views.loterias = async () => {
  const L = await api('/api/lottery');
  const g0 = L.games.find(g => g.draws) || L.games[0];
  window.__L = L;
  return `<div><h1>Loterías RD</h1><p class="sub">Resultados verificados, vigilancia de trampas y métodos puestos a prueba contra el azar. Si los sorteos son justos, ningún número es más probable que otro.</p></div>
  <section class="grid g4">
    <div class="card kpi"><div class="l">Jugadas virtuales</div><div class="v">${L.stats.settled}</div><div class="s">${L.stats.pending} pendientes de sorteo</div></div>
    <div class="card kpi" style="--c:var(--good)"><div class="l">Aciertos</div><div class="v">${L.stats.hitRate != null ? L.stats.hitRate + '%' : '—'}</div><div class="s">${L.stats.wins} premios · racha récord ${L.stats.streak.bestWin}</div></div>
    <div class="card kpi" style="--c:var(--bad)"><div class="l">Devuelve por RD$100</div><div class="v">${L.stats.per100 != null ? rd(L.stats.per100) : '—'}</div><div class="s">Apostado ${rd(L.stats.staked)} · cobrado ${rd(L.stats.paid)}</div></div>
    <div class="card kpi" style="--c:var(--accent)"><div class="l">${term('valor esperado', 'Valor esperado')}</div><div class="v">${rd(L.expected.quiniela)}</div><div class="s">Quiniela · palé ${rd(L.expected.pale)} · tripleta ${rd(L.expected.tripleta)}</div></div>
  </section>
  <div class="row" id="gtabs">${L.games.map(g => `<button class="btn ${g.id === g0.id ? '' : 'ghost'}" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>
  <div id="gview"></div>`;
};
views.loterias.after = () => {
  const L = window.__L;
  const show = id => {
    document.querySelectorAll('#gtabs button').forEach(b => b.classList.toggle('ghost', b.dataset.g !== id));
    const g = L.games.find(x => x.id === id);
    const exp = g.draws * 3 / 100;
    const maxc = g.freq ? Math.max(1, ...Object.values(g.freq)) : 1, enough = g.draws >= 100;
    const heat = g.freq ? Object.keys(g.freq).sort().map(n => { const c = g.freq[n]; const z = exp ? (c - exp) / Math.sqrt(exp) : 0;
      const bg = enough && z > 3 ? 'var(--bad)' : enough && z > 2 ? 'var(--warn)' : `color-mix(in srgb, var(--accent) ${Math.round(c / maxc * 55)}%, var(--panel2))`;
      return `<div style="background:${bg};color:var(--ink)" title="${n}: salió ${c} veces (esperado ${exp.toFixed(1)})">${n}</div>`; }).join('') : '';
    $('#gview').innerHTML = `
    <section class="grid g2">
      <div class="card"><h2>Su número del próximo sorteo</h2>${g.pick ? `<div class="balls" style="margin-bottom:8px">${g.pick.numbers.map(n => `<span class="ball">${esc(n)}</span>`).join('')} ${light(g.pick.light)}</div>
        <div><b>${esc(g.pick.methodLabel)}:</b> ${esc(g.pick.why)}</div><div class="note" style="margin-top:4px">${esc(g.pick.record)}</div>
        <div class="answer" style="margin-top:8px">⚠ ${esc(g.pick.warning)}</div><div class="note">Sorteo del ${esc(g.pick.date)} · cierra ${hhmm(g.pick.closesAt)} ${g.timeVerified ? '' : '(horario por verificar)'}</div><a class="btn ghost" href="#analisis/loteria/${esc(id)}" style="margin-top:8px;display:inline-block">Análisis completo ▸</a>` : '<div class="empty">Faltan sorteos para elegir.</div>'}</div>
      <div class="card"><h2>Últimos resultados</h2>${g.last.length ? `<table>${g.last.map(d => `<tr><td>${esc(d.date)}</td><td><div class="balls">${d.nums.map(n => `<span class="ball" style="width:28px;height:28px;font-size:12px">${esc(n)}</span>`).join('')}</div></td><td><span class="src ${d.status === 'verificado' ? 'ok' : ''}">${d.status === 'verificado' ? '2 fuentes' : d.status === 'una_fuente' ? '1 fuente' : esc(d.status)}</span></td></tr>`).join('')}</table>` : '<div class="empty">Sin resultados todavía.</div>'}</div>
    </section>
    <section class="grid g2">
      <div class="card"><h2>Mapa de números (${g.draws} sorteos)</h2>${heat ? `<div class="heat">${heat}</div><div class="legend"><span><i style="background:color-mix(in srgb,var(--accent) 55%,var(--panel2))"></i>Más veces</span><span><i style="background:var(--panel2);border:1px solid var(--line)"></i>Menos veces</span>${enough ? '<span><i style="background:var(--warn)"></i>Raro</span><span><i style="background:var(--bad)"></i>Muy raro: revisar</span>' : ''}</div><div class="note" style="margin-top:6px">${enough ? 'Rojo solo si sale tanto que el azar casi no lo explica.' : `Con ${g.draws} sorteos estas diferencias son ruido normal del azar; las alertas de color se activan desde 100 sorteos.`}</div>` : '<div class="empty">Sin datos.</div>'}</div>
      <div class="card"><h2>Vigilancia de trampas</h2>${g.scan ? `<div class="answer" style="margin-bottom:10px">${esc(g.scan.verdict)}</div><table><tr><th>Prueba</th><th class="r">Prob. de casualidad</th><th>Estado</th></tr>${g.scan.tests.map(t => `<tr><td>${esc(t.title)}<div class="note">${esc(t.detail)}</div></td><td class="r">${(t.p * 100).toFixed(1)}%</td><td>${t.anomaly ? '<span class="light rojo"><i></i>Revisar</span>' : '<span class="light verde"><i></i>Normal</span>'}</td></tr>`).join('')}</table>` : '<div class="empty">Se necesitan al menos 10 sorteos.</div>'}</div>
    </section>
    <section class="card"><h2>Métodos contra el azar</h2>${g.compare ? `<div class="answer" style="margin-bottom:10px">${esc(g.compare.verdict)}</div><div class="tablewrap"><table><tr><th>Método</th><th class="r">Jugadas</th><th class="r">Premios</th><th class="r">Devuelve / RD$100</th><th class="r">¿Le gana al azar?</th></tr>
      <tr><td><b>Azar puro</b> <span class="note">(400 jugadores simulados)</span></td><td class="r">—</td><td class="r">—</td><td class="r">${rd(g.compare.random.median)} <span class="note">(${g.compare.random.lo}–${g.compare.random.hi})</span></td><td class="r">Referencia</td></tr>
      ${g.compare.methods.map(m => `<tr><td>${esc(m.label)}<div class="note">${esc(m.why)}</div></td><td class="r">${m.plays}</td><td class="r">${m.wins}</td><td class="r ${m.per100 >= 100 ? 'good' : 'bad'}">${rd(m.per100)}</td><td class="r">${m.beatsRandom ? '<span class="light verde"><i></i>Sí (confirmar)</span>' : `<span class="light gris"><i></i>No</span> <span class="note">${(m.pBetterThanRandom * 100).toFixed(0)}% por azar</span>`}</td></tr>`).join('')}</table></div>` : '<div class="empty">Se necesitan al menos 20 sorteos.</div>'}</section>
    <section class="card"><h2>Jugar en virtual</h2><form class="form" id="lf"><div class="grid g4" style="gap:10px">
      <label>Tipo<select id="lk"><option value="quiniela">Quiniela</option><option value="pale">Palé</option><option value="tripleta">Tripleta</option></select></label>
      <label>Números (separados por espacio)<input id="ln" placeholder="27 o 27 45"></label><label>Monto RD$<input id="ls" type="number" min="1" value="10"></label><label>&nbsp;<button class="btn">Sellar jugada</button></label></div><div class="msg" id="lm"></div></form></section>`;
    $('#lf').onsubmit = async e => {
      e.preventDefault();
      try { const r = await api('/api/lottery/play', { method: 'POST', body: { game: id, kind: $('#lk').value, numbers: $('#ln').value.trim().split(/\s+/).map(x => x.padStart(2, '0')), stake: Number($('#ls').value) } });
        $('#lm').className = 'msg ok'; $('#lm').textContent = `Sellada para el sorteo del ${r.date}. Huella: ${r.hash.slice(0, 12)}…`; }
      catch (err) { $('#lm').className = 'msg err'; $('#lm').textContent = err.message; }
    };
  };
  document.querySelectorAll('#gtabs button').forEach(b => b.onclick = () => show(b.dataset.g));
  show(document.querySelector('#gtabs button:not(.ghost)').dataset.g);
};

views.aprendizaje = async () => {
  const [d, wi, gr] = await Promise.all([api('/api/learning'), api('/api/whatif?usd=10'), api('/api/grade')]);
  const p = d.predictions, s = d.strategies;
  return `<div><h1>Aprendizaje</h1><p class="sub">Aprender = mejorar en datos que no se usaron para crear la estrategia. Aquí está todo: aciertos, errores, cambios y trampas.</p></div>
  <section class="grid g4">
    <div class="card kpi" style="--c:var(--good)"><div class="l">Predicciones selladas</div><div class="v">${p.total}</div><div class="s">${p.resolved} calificadas · ${p.pending} pendientes</div></div>
    <div class="card kpi" style="--c:var(--accent)"><div class="l">% de acierto</div><div class="v">${p.hitRate != null ? p.hitRate + '%' : '—'}</div><div class="s">${p.hits} aciertos / ${p.misses} fallos${p.range ? ` · rango ${p.range[0]}–${p.range[1]}%` : ''}</div></div>
    <div class="card kpi" style="--c:var(--warn)"><div class="l">Rachas</div><div class="v">${p.streak.current}</div><div class="s">actual (${p.streak.type || '—'}) · récord ${p.streak.bestHits} aciertos / ${p.streak.bestMisses} fallos</div></div>
    <div class="card kpi" style="--c:var(--violet)"><div class="l">Experimentos</div><div class="v">${s.experiments}</div><div class="s">${s.byStatus.en_prueba || 0} en prueba en vivo · ${s.byStatus.validada || 0} validadas</div></div>
  </section>
  <section class="grid g2">
    <div class="card"><h2>Cambios recientes (con su motivo)</h2>${s.recent.length ? s.recent.map(r => `<div style="padding:8px 0;border-top:1px solid var(--line)"><b>${esc(STATUS[r.to_status] || r.to_status)}</b> <span class="note">· ${esc(r.family.replace(/_/g, ' '))} ${esc(r.params)} · ${esc(r.agent || '')} · ${timeAgo(r.ts)}</span><div class="note">${esc(r.reason)}</div></div>`).join('') : '<div class="empty">Aún no hay experimentos. Activa el motor.</div>'}</div>
    <div class="card"><h2>Liga de agentes y monedas</h2><table><tr><th>Agente</th><th class="r">Monedas</th><th class="r">Semana</th><th class="r">Trampas</th></tr>${d.league.map(a => `<tr><td>${esc(a.name)}</td><td class="r"><b>${a.coins}</b></td><td class="r ${cls(a.week)}">${a.week ?? '—'}</td><td class="r ${a.cheats ? 'bad' : ''}">${a.cheats}</td></tr>`).join('')}</table>
      <div class="note" style="margin-top:8px">+1 moneda por cada 1% ganado neto en la bolsa, +1 extra si le gana al mercado. Las pérdidas restan. Las monedas compran más pruebas y prioridad.</div>
      ${d.coins.length ? `<details style="margin-top:8px"><summary>Últimos movimientos ▸</summary>${d.coins.map(c => `<div class="note">${esc(c.ts.slice(0, 16).replace('T', ' '))} · ${esc(c.agent)} · <b class="${cls(c.amount)}">${c.amount > 0 ? '+' : ''}${c.amount}</b> ${esc(c.reason)}${c.revoked ? ' (revocada)' : ''}</div>`).join('')}</details>` : ''}</div>
  </section>
  <section class="grid g2">
    <div class="card"><h2>Reporte de trampas</h2>${d.cheats.length ? d.cheats.map(c => `<div style="padding:8px 0;border-top:1px solid var(--line)"><span class="light rojo"><i></i>${esc(c.rule.replace(/_/g, ' '))}</span> <span class="note">${esc(c.agent)} · ${timeAgo(c.ts)} · −${c.coins_removed} monedas</span><div>${esc(c.explanation)}</div></div>`).join('') : '<div class="empty">Ninguna trampa detectada. El auditor revisa cada moneda antes de darla.</div>'}</div>
    <div class="card"><h2>Lo que JARVIS no sabe</h2>${d.dontKnow.map(x => `<div style="padding:6px 0">• ${esc(x)}</div>`).join('')}</div>
  </section>
  <section class="grid g2">
    <div class="card"><h2>¿Y si hubieras seguido a JARVIS?</h2><div class="mini3"><div class="pbox"><div class="l">Recomendaciones</div><div class="v">${wi.trades}</div></div><div class="pbox"><div class="l">JARVIS</div><div class="v ${cls(wi.jarvisGain)}">${usd(wi.jarvisGain)}</div></div><div class="pbox"><div class="l">Mercado</div><div class="v ${cls(wi.marketGain)}">${usd(wi.marketGain)}</div></div></div>
      <div class="note" style="margin-top:8px">${esc(wi.text)}</div>${wi.curve.length > 1 ? lineChart(wi.curve.map(c => [c.date, c.jarvis]), { h: 160, bench: wi.curve.map(c => [c.date, c.market]), label: 'JARVIS contra el mercado' }) : ''}</div>
    <div class="card"><h2>Boletín del mes</h2><div style="display:flex;gap:18px;align-items:center"><div style="font-size:64px;font-weight:800;line-height:1;color:${{ A: 'var(--good)', B: 'var(--accent)', C: 'var(--warn)', D: 'var(--bad)' }[gr.grade] || 'var(--mute)'}">${esc(gr.grade)}</div><div>${esc(gr.text)}</div></div>
      <div class="note" style="margin-top:8px">A: le ganó al mercado con evidencia · B: le ganó, puede ser suerte · C: empató · D: perdió contra el mercado.</div>
      <div class="row" style="margin-top:12px"><a class="btn ghost" href="/api/export/predicciones">Exportar predicciones (CSV)</a><a class="btn ghost" href="/api/export/ranking">Exportar ranking (CSV)</a><button class="btn ghost" onclick="window.print()">Imprimir / PDF</button></div></div>
  </section>
  <section class="card"><h2>Glosario</h2><div class="grid g3" style="gap:10px">${Object.entries(GLOSS).map(([k, v]) => `<div><b>${esc(k[0].toUpperCase() + k.slice(1))}</b><div class="note">${esc(v)}</div></div>`).join('')}</div></section>
  <section class="card"><h2>Estrategias</h2>${d.list.length ? `<div class="tablewrap"><table><tr><th>Estrategia</th><th>Agente</th><th>Estado</th><th class="r">Práctica (t)</th><th class="r">Examen (t)</th><th class="r">Extra anual vs SPY</th></tr>${d.list.map(x => `<tr><td>${esc(x.family.replace(/_/g, ' '))} <span class="note">${esc(JSON.stringify(x.params))}</span></td><td>${esc(x.agent || '')}</td><td>${esc(STATUS[x.status] || x.status)}</td><td class="r">${x.result?.train ? x.result.train.t.toFixed(2) : '—'}</td><td class="r">${x.result?.holdout ? x.result.holdout.t.toFixed(2) : '—'}</td><td class="r ${cls(x.result?.holdout?.annual)}">${x.result?.holdout ? pct(x.result.holdout.annual * 100) : '—'}</td></tr>`).join('')}</table></div>` : '<div class="empty">Sin estrategias probadas todavía.</div>'}</section>`;
};

views.estado = async () => {
  const s = await api('/api/status');
  const NAMES = { loterias_resultados: 'Resultados de loterías', loterias_liquidar: 'Pagar jugadas', bolsa_precios: 'Precios en vivo', bolsa_historial: 'Historial de precios', copia: 'Copia de seguridad', resumen_diario: 'Resumen diario', fundamentales: 'Informes de empresas', noticias: 'Noticias', investigacion: 'Investigación', loterias_jugadas: 'Jugadas automáticas', prueba_en_vivo: 'Prueba en vivo', ranking: 'Ranking', debate: 'Debate', vigilancia_loterias: 'Vigilancia de trampas' };
  return `<div><h1>Estado del sistema</h1><p class="sub">Último latido: ${timeAgo(s.heartbeat)} · Motor: ${s.motor.running ? `activo${s.motor.until ? ' hasta ' + new Date(s.motor.until).toLocaleString('es-DO') : ''}` : 'en pausa'}</p></div>
  <section class="grid g4">
    <div class="card kpi" style="--c:${s.ledger.ok ? 'var(--good)' : 'var(--bad)'}"><div class="l">Registro sellado</div><div class="v">${s.ledger.ok ? 'Intacto' : 'Alterado'}</div><div class="s">${s.ledger.checked} entradas verificadas</div></div>
    <div class="card kpi"><div class="l">Gasto de IA</div><div class="v">${usd(s.ai.month, 2)}</div><div class="s">de ${usd(s.ai.monthCap, 0)} este mes · hoy ${usd(s.ai.day, 3)}</div></div>
    <div class="card kpi" style="--c:var(--accent2)"><div class="l">Datos guardados</div><div class="v">${s.db.bars.toLocaleString()}</div><div class="s">precios · ${s.db.draws} sorteos · ${s.db.ledger} sellos</div></div>
    <div class="card kpi" style="--c:var(--violet)"><div class="l">Conexiones</div><div class="v" style="font-size:18px;line-height:1.6">${['openai', 'anthropic', 'ollama'].map(k => `<span class="light ${s.ai.available[k] ? 'verde' : 'gris'}"><i></i>${{ openai: 'ChatGPT', anthropic: 'Claude', ollama: 'Modelo gratis' }[k]}</span>`).join(' ')} <span class="light ${s.sources.alpaca ? 'verde' : 'amarillo'}"><i></i>${s.sources.alpaca ? 'Alpaca' : 'Yahoo (respaldo)'}</span></div></div>
  </section>
  <section class="card"><h2>Tareas</h2><div class="tablewrap"><table><tr><th>Tarea</th><th>Cada</th><th>Necesita motor</th><th>Última vez</th><th>Resultado</th></tr>${s.tasks.map(t => `<tr><td>${esc(NAMES[t.name] || t.name)}</td><td>${t.every >= 1440 ? Math.round(t.every / 1440) + ' d' : t.every >= 60 ? Math.round(t.every / 60) + ' h' : t.every + ' min'}</td><td>${t.needsMotor ? 'Sí' : 'Siempre'}</td><td>${timeAgo(t.last?.at)}</td><td>${t.last ? (t.last.ok ? '<span class="good">✓ Bien</span>' : `<span class="bad">✕ ${esc(t.last.error)}</span>`) : '—'}</td></tr>`).join('')}</table></div></section>
  <section class="card"><h2>Resumen diario (8:00 a.m.)</h2><div class="answer">${esc(s.dailySummary?.text || 'Todavía no se ha generado.')}</div></section>`;
};

views.ajustes = async () => {
  const [st, users, mot, keys] = await Promise.all([api('/api/settings'), api('/api/users'), api('/api/status'), api('/api/keys')]);
  const KEYHELP = { OPENAI_API_KEY: ['platform.openai.com/api-keys', 'https://platform.openai.com/api-keys', 'sk-…'], ANTHROPIC_API_KEY: ['console.anthropic.com (opcional)', 'https://console.anthropic.com/settings/keys', 'sk-ant-…'], ALPACA_KEY_ID: ['alpaca.markets, cuenta de práctica (gratis)', 'https://app.alpaca.markets/paper/dashboard/overview', 'PK…'], ALPACA_SECRET_KEY: ['la misma página de Alpaca', 'https://app.alpaca.markets/paper/dashboard/overview', ''], NTFY_TOPIC: ['inventa un nombre secreto y suscríbete en la app ntfy', 'https://ntfy.sh', 'jarvis-junior-7f3k9'], SEC_USER_AGENT: ['tu nombre y correo (la SEC lo pide)', 'https://www.sec.gov/os/accessing-edgar-data', 'Junior tu@correo.com'] };
  return `<div><h1>Ajustes</h1><p class="sub">Solo el administrador ve esta pantalla.</p></div>
  <section class="card brandcard"><h2>Tu marca <span class="more note">hazlo tuyo: nombre, logo y color</span></h2>
    <div class="grid split" style="gap:20px;margin-top:10px">
      <div class="form">
        <label>Nombre del programa<input id="bn" maxlength="24" value="${esc(BRAND.name)}"></label>
        <label>Frase debajo del nombre<input id="bt" maxlength="60" value="${esc(BRAND.tagline)}" placeholder="Ej.: Mi investigador personal"></label>
        <label>Dueño (sale como "Programa privado de…")<input id="bo" maxlength="40" value="${esc(BRAND.owner)}" placeholder="Ej.: Junior"></label>
        <div><div class="note" style="margin-bottom:6px">Color principal</div><div class="swatches">${Object.entries(BRAND.palettes || {}).map(([k, p]) => `<button type="button" class="sw${k === BRAND.color ? ' on' : ''}" data-c="${k}" title="${esc(p.name)}" style="--d:${p.dark};--l:${p.light}"><i></i>${esc(p.name)}</button>`).join('')}</div></div>
        <div><div class="note" style="margin-bottom:6px">Logo (PNG, JPG o WEBP; se ajusta solo)</div><div class="row" style="gap:10px;align-items:center"><label class="btn ghost" style="cursor:pointer">Subir logo<input id="bl" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${BRAND.hasLogo ? '<button type="button" class="btn ghost" id="blr">Quitar logo</button>' : ''}</div></div>
        <button class="btn" id="bsave">Guardar mi marca</button><div class="msg" id="bm"></div>
      </div>
      <div><div class="note" style="margin-bottom:8px">Así se verá</div><div class="bprev" id="bprev"></div><div class="note" style="margin-top:8px">Sale en la barra de arriba, la pantalla de entrada, el Modo TV, la pestaña del navegador y el ícono cuando lo instalas en el celular.</div></div>
    </div></section>
  ${mot.publicUrl ? `<section class="card"><h2>Tu enlace para la TV y cualquier navegador</h2><p style="font-size:18px;margin:8px 0"><a href="${esc(mot.publicUrl)}" target="_blank" rel="noopener"><b>${esc(mot.publicUrl)}</b></a></p><div class="note">Escríbelo en la barra de direcciones (no en el buscador de Google) del navegador de la TV, otra computadora o el celular de tu amigo. Siempre pide usuario y contraseña. Para la TV usa el botón "Modo TV".</div></section>` : `<section class="card"><h2>Enlace para la TV</h2><div class="note">Todavía no hay enlace público. Se activa solo cuando Tailscale lo permite (revisa cada 10 minutos). Mientras tanto entra con Tailscale: http://jarvis:8080</div></section>`}
  <section class="card keyscard"><h2>Claves <span class="more note">se guardan solo en tu servidor; nunca se muestran de nuevo</span></h2>
    <p class="note">Pégalas desde el celular. JARVIS revisa el formato y las usa al momento, sin reiniciar. Para borrar una, deja el campo vacío y marca "borrar".</p>
    <form class="form" id="kf">${keys.map(k => `<div class="krow"><div><b>${esc(k.label)}</b> ${k.set ? `<span class="tag dato">puesta ${esc(k.hint || '')}</span>` : '<span class="tag est">falta</span>'}<div class="note">Dónde sacarla: <a href="${KEYHELP[k.name][1]}" target="_blank" rel="noopener">${esc(KEYHELP[k.name][0])}</a></div></div>
      <input type="${k.name === 'NTFY_TOPIC' || k.name === 'SEC_USER_AGENT' ? 'text' : 'password'}" data-key="${k.name}" autocomplete="off" placeholder="${k.set ? 'Escribe solo si quieres cambiarla' : esc(KEYHELP[k.name][2])}">${k.set ? `<label class="note" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-del="${k.name}" style="width:auto"> borrar</label>` : '<span></span>'}</div>`).join('')}
      <button class="btn">Guardar claves</button><div class="msg" id="km"></div></form>
    <div class="note">Pon también un límite de gasto en la página de OpenAI. JARVIS además respeta su propio tope: ${usd(st.caps.month, 0)} al mes.</div></section>
  <section class="card"><h2>Motor autónomo</h2><div class="row" style="align-items:flex-end">
    <label style="flex-direction:row;align-items:center;gap:8px;padding-bottom:10px"><input type="checkbox" id="mnon" style="width:auto" checked> Sin parar (hasta que yo lo detenga)</label>
    <label style="width:180px" id="mhl" class="hide">Trabajar durante (horas)<input id="mh" type="number" min="1" value="72"></label>
    <button class="btn" id="mstart">Iniciar</button><button class="btn ghost" id="mpause">Pausar</button><button class="btn ghost" id="mresume">Reanudar</button><button class="btn danger" id="mstop">Detener</button><button class="btn ghost" id="mrun">Correr ciclo ahora</button></div>
    <div class="note" style="margin-top:8px">Estado: <b>${mot.motor.running ? 'activo' : 'en pausa'}</b>${mot.motor.until ? ' hasta ' + new Date(mot.motor.until).toLocaleString('es-DO') : ''}. Al pausar o detener, todo el progreso queda guardado.</div><div class="msg" id="mm"></div></section>
  <section class="grid g2">
    <div class="card"><h2>Inteligencia artificial</h2><div class="form">
      ${[['openai', 'ChatGPT (principal)'], ['anthropic', 'Claude (opcional, activa el debate entre dos IA)'], ['ollama', 'Modelo gratis en el servidor']].map(([k, l]) => `<label style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" data-ai="${k}" ${st.aiEnabled[k] ? 'checked' : ''} style="width:auto"> ${l} ${st.keys[k] === false ? '<span class="tag est">falta la clave (ponla arriba, en Claves)</span>' : ''}</label>`).join('')}
      <div class="note">Modelos: ${esc(st.models.openai)} · ${esc(st.models.anthropic)} · ${esc(st.models.local)}. Tope: ${usd(st.caps.month, 0)} al mes, ${usd(st.caps.day, 2)} al día (en .env).</div>
      <label>Precios por millón de tokens (confírmalos en la página oficial)<textarea id="prices" rows="4" class="mono">${esc(JSON.stringify(st.prices, null, 1))}</textarea></label>
      <button class="btn" id="saveai">Guardar IA</button></div></div>
    <div class="card"><h2>Bolsa y loterías</h2><div class="form">
      <label>Acciones que investiga (separadas por coma)<textarea id="univ" rows="3">${esc(st.universe.join(', '))}</textarea></label>
      <label>Pagos de la banca (por RD$1)<textarea id="pay" rows="4" class="mono">${esc(JSON.stringify(st.payouts))}</textarea></label>
      <label style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" id="single" ${st.allowSingleSource ? 'checked' : ''} style="width:auto"> Pagar jugadas con una sola fuente (marcadas como "1 fuente")</label>
      <button class="btn" id="saveother">Guardar</button></div></div>
  </section>
  <section class="grid g2">
    <div class="card"><h2>Avisos al celular</h2>${st.notify.on ? `<p>Activos (tema ${esc(st.notify.topic)}).</p><button class="btn ghost" id="ntest">Enviar aviso de prueba</button>` : `<ol class="note" style="padding-left:18px"><li>Instala la app gratis <b>ntfy</b> en tu celular.</li><li>Inventa un nombre secreto, por ejemplo <span class="mono">jarvis-junior-7f3k9</span>, y suscríbete a ese tema en la app.</li><li>Ponlo arriba, en <b>Claves → Tema de avisos</b>. Para tus avisos personales, ponlo también en <a href="#perfil">Mi perfil</a>. Cada usuario puede tener el suyo.</li></ol>`}<div class="msg" id="nm"></div></div>
    <div class="card"><h2>Copia fuera del servidor</h2>${st.offsite ? '<p class="good">Activa: cada copia diaria se cifra y se sube.</p>' : '<ol class="note" style="padding-left:18px"><li>En el servidor instala rclone y conecta tu Google Drive: <span class="mono">sudo apt install -y rclone && sudo -u jarvis rclone config</span></li><li>En .env pon <span class="mono">RCLONE_REMOTE=gdrive:</span> y una frase larga en <span class="mono">BACKUP_PASSPHRASE</span>. Guarda la frase en un lugar seguro: sin ella la copia no se puede abrir.</li><li>Reinicia JARVIS.</li></ol>'}</div>
  </section>
  <section class="card"><h2>Usuarios <span class="more note">cada uno con su perfil; todos usan el mismo núcleo</span></h2><div class="tablewrap"><table><tr><th>Persona</th><th>Estilo</th><th class="r">Su dinero</th><th>Última entrada</th><th>Estado</th><th></th></tr>${users.map(u => `<tr><td><b>${esc(u.display_name || u.username)}</b><div class="note">${esc(u.username)} · ${u.role === 'admin' ? 'Administrador' : 'Usuario'}</div></td><td>${u.setup ? esc({ conservador: '🛡️ Conservador', equilibrado: '⚖️ Equilibrado', arriesgado: '🚀 Arriesgado' }[u.style]) : '<span class="note">sin configurar</span>'}</td><td class="r">${usd(u.budget, 0)}</td><td class="note">${u.lastSeen ? timeAgo(u.lastSeen) : 'nunca'}</td><td>${u.active ? '<span class="good">Activo</span>' : '<span class="bad">Desactivado</span>'}</td>
      <td class="r" style="white-space:nowrap">${u.id === ME.id ? '<a class="note" href="#perfil">Mi perfil ▸</a>' : `<button class="btn ghost sm" data-pw="${u.id}">Nueva contraseña</button> <button class="btn ghost sm" data-act="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? 'Desactivar' : 'Activar'}</button>`}</td></tr>`).join('')}</table></div>
    <h3 class="cs-h">Crear un usuario (por ejemplo, para tu amigo)</h3>
    <form class="row" id="uf" style="align-items:flex-end;gap:10px"><label style="flex:1;min-width:160px">Su nombre<input id="nn" placeholder="Ricardo"></label><label style="flex:1;min-width:160px">Usuario para entrar<input id="nu" required placeholder="ricardo"></label><label style="flex:1;min-width:180px">Contraseña (déjala vacía y JARVIS crea una)<input id="np" type="text" minlength="10" placeholder="automática" autocomplete="off"></label><label style="width:130px">Tope IA mes US$<input id="nm" type="number" value="2" step="0.5"></label><button class="btn">Crear usuario</button></form>
    <div class="note" style="margin-top:6px">Al entrar por primera vez, JARVIS le pregunta su estilo, su plazo y qué le interesa. Tiene su propio dinero virtual, sus avisos y su historial real; la investigación se comparte sin gastar doble. Desactivar guarda sus datos.</div><div class="msg" id="um"></div></section>`;
};
views.ajustes.after = () => {
  $('#kf').onsubmit = async e => { e.preventDefault(); const body = {};
    document.querySelectorAll('[data-key]').forEach(i => { if (i.value.trim()) body[i.dataset.key] = i.value.trim(); });
    document.querySelectorAll('[data-del]').forEach(c => { if (c.checked) body[c.dataset.del] = ''; });
    if (!Object.keys(body).length) { $('#km').className = 'msg err'; $('#km').textContent = 'No escribiste ninguna clave.'; return; }
    try { await api('/api/keys', { method: 'POST', body }); document.querySelectorAll('[data-key]').forEach(i => { i.value = ''; }); $('#km').className = 'msg ok'; $('#km').textContent = 'Guardadas en el servidor. Ya están funcionando.'; setTimeout(render, 1000); } catch (err) { $('#km').className = 'msg err'; $('#km').textContent = err.message; } };
  let color = BRAND.color, logo = null, removeLogo = false;
  const prev = () => { const P = BRAND.palettes[color]; const src = logo || (BRAND.hasLogo && !removeLogo ? `/brand/logo?v=${BRAND.v}` : null);
    $('#bprev').innerHTML = `<div class="bp-bar" style="--pa:${P.dark}">${src ? `<img src="${src}" alt="">` : `<span class="ring" style="border-color:${P.dark}"><i style="background:${P.dark}"></i></span>`}<b>${esc($('#bn').value || 'JARVIS')}</b><span class="bp-tabs"><i style="background:${P.dark}33;color:${P.dark}">Inicio</i><i>Historial</i></span></div>
      <div class="bp-login">${src ? `<img src="${src}" alt="">` : `<span class="ring big" style="border-color:${P.dark}"><i style="background:${P.dark}"></i></span>`}<b>${esc($('#bn').value || 'JARVIS')}</b><small>${esc($('#bt').value)}</small>${$('#bo').value ? `<em>Programa privado de ${esc($('#bo').value)}</em>` : ''}<span class="bp-btn" style="background:${P.dark}">Entrar</span></div>`; };
  ['#bn', '#bt', '#bo'].forEach(id => $(id).oninput = prev);
  document.querySelectorAll('.sw').forEach(b => b.onclick = () => { color = b.dataset.c; document.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); prev(); });
  $('#bl').onchange = async () => { const f = $('#bl').files[0]; if (!f) return; try { logo = await shrinkImage(f); removeLogo = false; prev(); $('#bm').className = 'msg ok'; $('#bm').textContent = 'Logo listo. Pulsa "Guardar mi marca".'; } catch (e) { $('#bm').className = 'msg err'; $('#bm').textContent = e.message; } };
  if ($('#blr')) $('#blr').onclick = () => { removeLogo = true; logo = null; prev(); };
  $('#bsave').onclick = async () => { try { BRAND = await api('/api/brand', { method: 'POST', body: { name: $('#bn').value, tagline: $('#bt').value, owner: $('#bo').value, color, ...(logo ? { logo } : {}), ...(removeLogo ? { removeLogo: true } : {}) } }); applyBrand(); $('#bm').className = 'msg ok'; $('#bm').textContent = '¡Listo! Tu marca quedó guardada.'; setTimeout(render, 900); } catch (e) { $('#bm').className = 'msg err'; $('#bm').textContent = e.message; } };
  prev();
  const m = (t, ok = true) => { $('#mm').className = 'msg ' + (ok ? 'ok' : 'err'); $('#mm').textContent = t; };
  $('#mnon').onchange = () => $('#mhl').classList.toggle('hide', $('#mnon').checked);
  $('#mstart').onclick = async () => { await api('/api/motor/start', { method: 'POST', body: { hours: $('#mnon').checked ? null : Number($('#mh').value) } }); m($('#mnon').checked ? 'Motor activado sin parar: investiga y explora hasta que lo detengas.' : 'Motor activado.'); setTimeout(render, 800); };
  $('#mpause').onclick = async () => { await api('/api/motor/pause', { method: 'POST' }); m('En pausa.'); setTimeout(render, 800); };
  $('#mresume').onclick = async () => { await api('/api/motor/resume', { method: 'POST' }); m('Reanudado.'); setTimeout(render, 800); };
  $('#mstop').onclick = async () => { await api('/api/motor/stop', { method: 'POST' }); m('Detenido.'); setTimeout(render, 800); };
  $('#mrun').onclick = async () => { m('Corriendo ciclo… puede tardar unos minutos la primera vez.'); try { const r = await api('/api/motor/run', { method: 'POST', body: { force: ['loterias_resultados', 'bolsa_historial', 'ranking'] } }); m('Ciclo terminado: ' + Object.entries(r).map(([k, v]) => `${k} ${v.ok ? '✓' : '✕'}`).join(', ')); } catch (e) { m(e.message, false); } };
  $('#saveai').onclick = async () => { try { const en = {}; document.querySelectorAll('[data-ai]').forEach(c => en[c.dataset.ai] = c.checked); await api('/api/settings', { method: 'POST', body: { aiEnabled: en, prices: JSON.parse($('#prices').value) } }); m('IA guardada.'); } catch (e) { m(e.message, false); } };
  $('#saveother').onclick = async () => { try { await api('/api/settings', { method: 'POST', body: { universe: $('#univ').value.split(/[,\s]+/).filter(Boolean), payouts: JSON.parse($('#pay').value), allowSingleSource: $('#single').checked } }); m('Guardado.'); } catch (e) { m(e.message, false); } };
  if ($('#ntest')) $('#ntest').onclick = async () => { try { await api('/api/notify/test', { method: 'POST' }); $('#nm').className = 'msg ok'; $('#nm').textContent = 'Aviso enviado: revisa tu celular.'; } catch (e) { $('#nm').className = 'msg err'; $('#nm').textContent = e.message; } };
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => { try { await api(`/api/users/${b.dataset.act}/active`, { method: 'POST', body: { active: b.dataset.on === '1' } }); render(); } catch (err) { $('#um').className = 'msg err'; $('#um').textContent = err.message; } });
  document.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => { const td = b.parentElement; td.innerHTML = `<form class="row" style="gap:6px;justify-content:flex-end"><input type="text" minlength="10" placeholder="vacía = automática" style="width:160px" autocomplete="off"><button class="btn sm">Guardar</button></form>`;
    td.querySelector('form').onsubmit = async ev => { ev.preventDefault(); try { const r = await api(`/api/users/${b.dataset.pw}/password`, { method: 'POST', body: { password: td.querySelector('input').value } }); td.innerHTML = r.password ? `<span class="good">Nueva: <b style="font-family:ui-monospace,monospace;user-select:all">${esc(r.password)}</b></span><div class="note">Dásela ahora; no se vuelve a mostrar.</div>` : '<span class="good">Contraseña cambiada</span>'; } catch (err) { td.insertAdjacentHTML('beforeend', `<div class="msg err">${esc(err.message)}</div>`); } }; });
const showPw = (who, pw) => `<div class="msg ok" style="font-size:16px;line-height:1.6">Usuario <b>${esc(who)}</b> listo. Su contraseña es: <b style="font-family:ui-monospace,monospace;font-size:20px;user-select:all">${esc(pw)}</b><br><span class="note">Cópiala y dásela ahora: no se vuelve a mostrar. Él la puede cambiar en Mi perfil.</span></div>`;
  $('#uf').onsubmit = async e => { e.preventDefault(); try { const r = await api('/api/users', { method: 'POST', body: { displayName: $('#nn').value, username: $('#nu').value, password: $('#np').value, monthlyCap: Number($('#nm').value), dailyCap: Number($('#nm').value) / 10 } }); if (r.password) { $('#um').className = ''; $('#um').innerHTML = showPw($('#nu').value, r.password) + '<button class="btn ghost sm" id="umok" style="margin-top:8px">Ya la copié</button>'; $('#umok').onclick = () => render(); } else { $('#um').className = 'msg ok'; $('#um').textContent = 'Usuario creado.'; setTimeout(render, 900); } } catch (err) { $('#um').className = 'msg err'; $('#um').textContent = err.message; } };
};

// ---------- Gráficos adicionales ----------
function barChart(items, { fmt = v => v, h = 30, label = '' } = {}) {
  if (!items?.length) return '<div class="empty">Sin datos todavía.</div>';
  const max = Math.max(...items.map(i => Math.abs(i.value)), 1e-9), neg = items.some(i => i.value < 0);
  const W = 600, LW = Math.min(250, Math.max(90, Math.max(...items.map(i => String(i.label).length)) * 7.8 + 18)), VW = 86, BW = W - LW - VW, zero = neg ? LW + BW / 2 : LW, scale = neg ? BW / 2 : BW;
  return `<svg viewBox="0 0 ${W} ${items.length * h + 8}" width="100%" style="max-width:760px;display:block" role="img" aria-label="${esc(label)}">
    ${neg ? `<line x1="${zero}" x2="${zero}" y1="0" y2="${items.length * h + 8}" stroke="var(--line)"/>` : ''}
    ${items.map((it, i) => { const w = Math.abs(it.value) / max * scale, x = it.value >= 0 ? zero : zero - w, y = i * h + 4, col = it.color || (it.value >= 0 ? 'var(--good)' : 'var(--bad)');
      return `<text x="${LW - 10}" y="${y + h / 2 + 5}" text-anchor="end" font-size="14" fill="${it.dim && !it.color ? 'var(--mute)' : 'var(--ink)'}" font-weight="${it.bold ? 800 : 500}">${esc(it.label)}</text>
      <rect x="${x}" y="${y + 3}" width="${Math.max(2, w)}" height="${h - 9}" rx="4" fill="${col}" opacity="${it.dim ? .45 : .9}"/>
      <text x="${W - 4}" y="${y + h / 2 + 5}" text-anchor="end" font-size="14" fill="var(--ink)" font-weight="700">${esc(fmt(it.value))}</text>`; }).join('')}
  </svg>`;
}
function rangeChart(rows, { fmt = v => pctp(v), label = '' } = {}) {
  if (!rows?.length) return '<div class="empty">Faltan datos para estimar escenarios.</div>';
  const W = 760, LW = 90, RW = 20, h = 46, vals = rows.flatMap(r => [r.bad, r.good, 0]), min = Math.min(...vals), max = Math.max(...vals), sp = max - min || 1;
  const x = v => LW + (v - min) / sp * (W - LW - RW);
  return `<svg viewBox="0 0 ${W} ${rows.length * h + 26}" width="100%" role="img" aria-label="${esc(label)}">
    <line x1="${x(0)}" x2="${x(0)}" y1="0" y2="${rows.length * h}" stroke="var(--mute)" stroke-dasharray="4 4"/><text x="${x(0)}" y="${rows.length * h + 18}" text-anchor="middle" font-size="12" fill="var(--mute)">0%</text>
    ${rows.map((r, i) => { const y = i * h + 10; return `<text x="${LW - 10}" y="${y + 16}" text-anchor="end" font-size="13" font-weight="700" fill="var(--ink)">${esc(r.label)}</text>
      <rect x="${x(Math.min(r.bad, 0))}" y="${y + 6}" width="${Math.max(1, x(Math.min(0, r.good)) - x(Math.min(r.bad, 0)))}" height="14" rx="7" fill="var(--bad)" opacity=".35"/>
      <rect x="${x(Math.max(r.bad, 0))}" y="${y + 6}" width="${Math.max(1, x(r.good) - x(Math.max(r.bad, 0)))}" height="14" rx="7" fill="var(--good)" opacity=".35"/>
      <circle cx="${x(r.probable)}" cy="${y + 13}" r="7" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>
      <text x="${x(r.bad)}" y="${y + 38}" text-anchor="middle" font-size="11.5" fill="var(--bad)">${esc(fmt(r.bad))}</text>
      <text x="${x(r.probable)}" y="${y + 38}" text-anchor="middle" font-size="11.5" font-weight="800" fill="var(--accent)">${esc(fmt(r.probable))}</text>
      <text x="${x(r.good)}" y="${y + 38}" text-anchor="middle" font-size="11.5" fill="var(--good)">${esc(fmt(r.good))}</text>`; }).join('')}
  </svg>`;
}
function compareLine(a, b, markers = [], { label = '' } = {}) {
  if (!a?.length) return '<div class="empty">Sin precios.</div>';
  const bm = new Map((b || []).map(p => [p[0], p[1]])), a0 = a[0][1], b0 = bm.get(a[0][0]);
  const A = a.map(p => [p[0], (p[1] / a0 - 1) * 100]), B = b0 ? a.filter(p => bm.has(p[0])).map(p => [p[0], (bm.get(p[0]) / b0 - 1) * 100]) : null;
  const W = 760, H = 230, L = 46, R = 70, all = [...A, ...(B || [])].map(p => p[1]), min = Math.min(0, ...all), max = Math.max(0, ...all), sp = max - min || 1;
  const idx = new Map(a.map((p, i) => [p[0], i])), x = i => L + i / (a.length - 1) * (W - L - R), y = v => 10 + (1 - (v - min) / sp) * (H - 40);
  const path = pts => pts.map(p => `${p === pts[0] ? 'M' : 'L'}${x(idx.get(p[0])).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const col = { verde: 'var(--good)', amarillo: 'var(--warn)', rojo: 'var(--bad)' };
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}">
    ${[min, (min + max) / 2, max].map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${t >= 0 ? '+' : ''}${t.toFixed(0)}%</text>`).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--mute)" stroke-dasharray="3 4"/>
    ${B ? `<path d="${path(B)}" fill="none" stroke="var(--mute)" stroke-width="1.8" stroke-dasharray="6 5"/><text x="${W - R + 6}" y="${y(B.at(-1)[1]) + 4}" font-size="12" fill="var(--mute)">Mercado</text>` : ''}
    <path d="${path(A)}" fill="none" stroke="var(--accent)" stroke-width="2.6"/><text x="${W - R + 6}" y="${y(A.at(-1)[1]) + 4}" font-size="12" font-weight="800" fill="var(--accent)">${A.at(-1)[1] >= 0 ? '+' : ''}${A.at(-1)[1].toFixed(1)}%</text>
    ${markers.filter(m => idx.has(m.date)).map(m => `<circle cx="${x(idx.get(m.date))}" cy="${y(A[idx.get(m.date)][1])}" r="6" fill="${col[m.light] || 'var(--accent)'}" stroke="var(--panel)" stroke-width="2"><title>${esc(m.date)}: JARVIS dijo ${esc(m.light)}${m.correct == null ? ' (pendiente)' : m.correct ? ' — acertó' : ' — falló'}</title></circle>`).join('')}
    <text x="${L}" y="${H - 6}" font-size="11" fill="var(--mute)">${esc(a[0][0])}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--mute)">${esc(a.at(-1)[0])}</text>
  </svg>`;
}
function freqChart(freq, expected, highlight) {
  const keys = Object.keys(freq).sort(), max = Math.max(...Object.values(freq), expected * 1.5, 1), W = 760, H = 190, bw = (W - 30) / 100;
  const y = v => 28 + (1 - v / max) * (H - 54);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Veces que salió cada número">
    ${keys.map((k, i) => `<rect x="${20 + i * bw}" y="${y(freq[k])}" width="${bw - 1.5}" height="${H - 26 - y(freq[k])}" fill="${k === highlight ? 'var(--warn)' : 'var(--accent)'}" opacity="${k === highlight ? 1 : .55}"><title>${k}: ${freq[k]} veces</title></rect>`).join('')}
    <line x1="20" x2="${W - 10}" y1="${y(expected)}" y2="${y(expected)}" stroke="var(--bad)" stroke-dasharray="5 4"/><text x="22" y="14" font-size="12" fill="var(--bad)">- - - esperado por azar: ${expected.toFixed(1)} veces</text>
    ${['00', '25', '50', '75', '99'].map(k => `<text x="${20 + Number(k) * bw + bw / 2}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--mute)">${k}</text>`).join('')}
  </svg>`;
}
const pctp = (v, d = 1) => (v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%');
const KIND = { dato: ['dato', 'Dato confirmado'], estimacion: ['est', 'Estimación'], opinion: ['opinion', 'Opinión de IA'], noticia: ['est', 'Noticia sin confirmar'] };
const kindTag = k => `<span class="tag ${(KIND[k] || KIND.dato)[0]}">${(KIND[k] || KIND.dato)[1]}</span>`;
function sourcesList(src) {
  return `<div style="display:flex;flex-direction:column;gap:8px">${src.map((s, i) => `<div style="display:flex;gap:10px;align-items:flex-start"><span class="mono note" style="min-width:26px">[${i + 1}]</span>${kindTag(s.kind)}<div style="min-width:0">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}${s.at ? `<div class="note">${esc(String(s.at).slice(0, 16).replace('T', ' '))}</div>` : ''}</div></div>`).join('')}</div>`;
}
function qaAccordion(c) {
  const Q = [['💡', '¿Por qué?', c.why], ['📊', '¿Qué pruebas la respaldan?', c.evidence], ['🎯', '¿Qué posibilidades tiene?', c.chance], ['⏳', '¿El dinero se gana de inmediato o en cuánto tiempo?', c.when], ['⚠️', '¿Cuáles son los riesgos?', c.risks], ['🧯', '¿Qué podría hacerla fallar?', c.failIf], ['🤖', '¿Qué dicen las otras IA?', c.ias], ['✅', '¿Qué conviene más?', [c.best, c.amount]]].filter(q => q[2]);
  return `<div class="acc">${Q.map(([ic, q, a], i) => `<details${i === 0 ? ' open' : ''}><summary><span class="ic">${ic}</span>${q}</summary><div class="ans">${Array.isArray(a) ? `<ul>${a.filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : esc(a)}</div></details>`).join('')}</div>`;
}
function sizeCard(z, budget, lightName) {
  return `<section class="card sizecard"><h2>¿Cuánto pongo con mi dinero?</h2>
    <div class="sz"><div><div class="note">Tu dinero para invertir</div><div class="sz-v">${usd(budget.usd, 0)}</div><a class="note" href="#bolsa">cambiar ▸</a></div>
    <div class="sz-arrow">→</div><div><div class="note">Te recomiendo poner</div><div class="sz-v ${z.usd ? 'good' : 'bad'}">${z.usd ? usd(z.usd, 0) : 'US$0'}</div><div class="note">${z.usd ? `${z.pct}% de tu dinero` : 'no inviertas en esta'}</div></div>
    <div class="sz-more ${z.canMore ? 'yes' : 'no'}"><b>¿Puedo poner más?</b><div>${esc(z.more)}</div></div></div>
    ${z.usd ? `<details class="note" style="margin-top:10px"${z.canMore ? '' : ' open'}><summary>Las 5 pruebas para poner más (hasta ${myStyle().max * 100}% de tu dinero)</summary><div class="checks" style="margin-top:8px">${z.checks.map(c => `<div class="ck ${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✕'} ${esc(c.text)}</div>`).join('')}</div></details>` : ''}
    ${z.note ? `<div class="note" style="margin-top:6px">${esc(z.note)}</div>` : ''}
    <div class="note" style="margin-top:8px">Regla según tu estilo: "Sí, invierte" = ${myStyle().verde * 100}% de tu dinero por idea; "Invierte poco" = ${myStyle().amarillo * 100}%; nunca más de ${myStyle().max * 100}% en una sola, y siempre guarda al menos 10% en efectivo. ¿Vas a poner mucho más? Usa <a href="#buscar">Buscar a mi medida</a> y JARVIS revisa tu apuesta.</div></section>`;
}
function timingCard(a) {
  const t = a.timing; if (!t) return '';
  const rows = t.horizons.map(h => { const n = Math.round(h.pProfit * 10), col = h.pProfit >= 0.66 ? 'var(--good)' : h.pProfit >= 0.5 ? 'var(--warn)' : 'var(--bad)';
    return `<div class="tl-row${t.recommended?.days === h.days ? ' rec' : ''}"><span class="tl-l">${esc(h.label)}</span><span class="dots">${Array.from({ length: 10 }, (_, i) => `<i${i < n ? ` style="background:${col};border-color:${col}"` : ''}></i>`).join('')}</span><span class="tl-n"><b>${n} de 10</b> veces ganando</span><span class="tl-m note">lo normal: ${pctp(h.median)}${t.recommended?.days === h.days ? ' · <b class="good">tiempo recomendado</b>' : ''}</span></div>`; }).join('');
  const tt = t.toTarget, rc = t.recovery;
  return `<section class="card"><h2>¿En cuánto tiempo se gana el dinero?</h2>${takeaway(esc(t.summary))}
    <div class="grid split" style="gap:20px">
      <div><div class="note" style="margin-bottom:8px">Si alguien compraba cualquier día de los últimos ${t.yearsUsed} años y esperaba…</div><div class="tl">${rows}</div></div>
      <div class="mini3 tl-facts">
        <div class="pbox"><div class="l">Subir ${tt ? Math.round(tt.target * 100) : 5}% tardó normalmente</div><div class="v">${tt?.median != null ? humanDays(tt.median) : '—'}</div><div class="note">${tt?.median != null ? `a veces ${humanDays(tt.fast)}; 1 de cada 4, más de ${humanDays(tt.slow)}` : 'casi nunca llegó'}</div></div>
        <div class="pbox"><div class="l">Si empezó perdiendo, recuperarse tardó</div><div class="v">${rc?.median != null ? humanDays(rc.median) : '—'}</div><div class="note">${rc ? `${Math.round(rc.neverPct * 100)}% no se recuperó en 2 años` : 'sin casos suficientes'}</div></div>
        <div class="pbox"><div class="l">No llegó a +${tt ? Math.round(tt.target * 100) : 5}% en un año</div><div class="v ${tt && tt.neverPct > 0.3 ? 'bad' : ''}">${tt ? Math.round(tt.neverPct * 100) + '%' : '—'}</div><div class="note">de las veces</div></div>
      </div>
    </div>
    <h3 class="cs-h">¿Cuándo tienes el dinero en la mano?</h3>
    <div class="cash">${a.cashSteps.map((st, i) => `<div class="cs"><i>${i + 1}</i><b>${esc(st.step)}</b><span class="note">${esc(st.note)}${st.url ? ` <a href="${esc(st.url)}" target="_blank" rel="noopener">Fuente ▸</a>` : ''}</span></div>`).join('')}</div>
    <div class="note" style="margin-top:10px">${kindTag('estimacion')} Medido con ${esc(t.basedOn)}. Es lo que pasó antes, no una promesa: el futuro puede ser distinto.</div></section>`;
}
function qaGrid(c) {
  const Q = [['¿Por qué?', c.why], ['¿Qué pruebas la respaldan?', c.evidence], ['¿Qué posibilidades tiene?', c.chance], ['¿Cuáles son los riesgos?', c.risks], ['¿Qué podría hacerla fallar?', c.failIf], ['¿Qué dicen las otras IA?', c.ias], ['¿Qué conviene más?', [c.best, c.amount]]];
  return `<div class="grid g2" style="gap:12px">${Q.map(([q, a]) => `<div class="pbox"><div style="font-weight:800;margin-bottom:6px">${q}</div>${Array.isArray(a) ? `<ul style="margin:0;padding-left:18px">${a.filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div>${esc(a)}</div>`}</div>`).join('')}</div>`;
}
function realtimeBox(a) {
  return `<div class="card"><h2>En tiempo real <span class="more note">análisis del ${esc(a.createdAt.slice(0, 16).replace('T', ' '))} · se rehace cuando llegan datos nuevos</span></h2>
    ${a.changes?.length ? `<div class="answer" style="margin-bottom:10px"><b>Cambió desde el análisis anterior:</b>${a.changes.map(c => `<div>• ${esc(c)}</div>`).join('')}</div>` : '<div class="note" style="margin-bottom:10px">Sin cambios desde el último análisis.</div>'}
    ${a.timeline?.length > 1 ? `<details><summary>Cómo evolucionó el análisis (${a.timeline.length} versiones selladas) ▸</summary><table style="margin-top:8px"><tr><th>Fecha</th><th>Semáforo</th><th class="r">Probabilidad</th><th class="r">Precio</th></tr>${a.timeline.map(t => `<tr><td>${esc(t.at.slice(0, 16).replace('T', ' '))}</td><td>${t.light ? light(t.light) : '—'}</td><td class="r">${t.probBeat != null ? Math.round(t.probBeat * 100) + '%' : '—'}</td><td class="r">${t.price ? usd(t.price) : '—'}</td></tr>`).join('')}</table></details>` : ''}</div>`;
}
function narrativeBox(a) {
  return `<div class="card"><h2>Explicación del analista (IA) <span class="more note">usa solo los datos de este análisis</span></h2><div id="narr">${a.narrative ? `<div class="answer">${esc(a.narrative)}<div class="note" style="margin-top:6px">Escrita por ${esc(a.narrativeBy || 'IA')} · <span class="tag opinion">Opinión de IA</span> basada en los datos</div></div>` : `<button class="btn" id="explain" data-id="${a.id}">Explicármelo en palabras simples</button><div class="note" style="margin-top:6px">Usa la IA de pago una vez por análisis (centavos) y queda guardada.</div>`}</div></div>`;
}

views.analisis = async arg => {
  if (arg.startsWith('loteria/')) return lotteryAnalysisView(arg.split('/')[1]);
  const a = await api('/api/analysis/stock/' + encodeURIComponent(arg));
  if (a.empty) return `<div class="card empty">${esc(a.message)}</div>`;
  const c = a.conclusion, pr = a.profile, nm = pr?.name || coName(a.symbol), s6 = a.scenarios[1];
  const col = a.light === 'verde' ? 'good' : a.light === 'amarillo' ? 'warn' : 'bad';
  const myAmt = a.size?.usd ?? a.amountUsd;
  const todo = a.light === 'verde' ? `Sí, invierte ${usd(myAmt, 0)}` : a.light === 'amarillo' ? `Invierte poco: ${usd(myAmt, 0)}` : 'No inviertas ahora';
  const y1 = a.periods.find(p => p.label === '1 año'), beatN = a.periods.filter(p => p.stock != null && p.market != null && p.stock > p.market).length;
  const fav = a.contributions.slice().sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution))[0];
  const bestOther = a.compare.filter(o => !o.current).sort((x, y) => y.probBeat - x.probBeat)[0];
  const tm = a.timing, h1w = tm?.horizons.find(h => h.days === 5);
  return `<div class="note"><a href="#recomendaciones">Recomendaciones</a> › ${esc(nm)} › Análisis completo</div>
  <section class="card ahead">
    ${pr?.image ? `<img src="${esc(pr.image)}" alt="${esc(nm)}" class="coimg">` : coBadge(a.symbol, 84)}
    <div style="min-width:0"><h1>${esc(nm)} <span class="muted" style="font-size:16px">${esc(a.symbol)} · ${usd(a.price.value)} · ${esc(a.price.status)}</span></h1>
      ${pr ? `<div class="sub">${esc(pr.description || '')}</div><div class="note" style="margin-top:4px;max-width:80ch">${esc(pr.extract)} <a href="${esc(pr.url)}" target="_blank" rel="noopener">${esc(pr.source)} ▸</a></div>` : `<div class="sub">${a.symbol === 'SPY' ? 'Fondo que copia a las 500 empresas más grandes de EE. UU.' : 'Empresa que cotiza en la bolsa de Estados Unidos.'}</div>`}</div>
    <div></div></section>

  <section class="card summary10" style="border-color:var(--${col})"><div class="s10-h">Resumen en 10 segundos</div>
    <div class="s10">
      <div class="tile"><div class="q">¿Te recomiendo invertir?</div><div class="a ${col}">${todo}</div><div class="note">${esc(c.headline.replace(/^[^:]+:\s*/, ''))}</div></div>
      <div class="tile"><div class="q">Si pones ${usd(myAmt || baseAmt('verde'), 0)}, en 6 meses quedarías con…</div>${moneyRange(myAmt || baseAmt('verde'), s6 ? { bad: (myAmt || baseAmt('verde')) * s6.bad, probable: (myAmt || baseAmt('verde')) * s6.probable, good: (myAmt || baseAmt('verde')) * s6.good } : null)}<div class="note">${s6 ? `Chance de terminar perdiendo: ${Math.round(s6.lossChance * 100)} de cada 100` : ''}</div></div>
      <div class="tile"><div class="q">¿Qué tan seguido le gana al mercado?</div>${chanceDots(a.probBeat, { big: true })}<div class="note">${a.probMethod === 'calibrado' ? 'Medido con casos reales parecidos' : 'Estimación inicial: se ajusta con resultados reales'}</div></div>
      <div class="tile"><div class="q">¿La ganancia es inmediata?</div>${tm ? `<div class="a ${tm.immediate ? 'good' : 'warn'}">${tm.immediate ? 'Puede ser en semanas' : tm.recommended ? `No: déjala ${esc(tm.recommended.label)}` : 'No: déjala 1 año o más'}</div><div class="note">${h1w ? `En 1 semana estuvo ganando ${Math.round(h1w.pProfit * 10)} de cada 10 veces` : ''}${tm.recommended && !tm.immediate ? `; en ${esc(tm.recommended.label)}, ${Math.round(tm.horizons.find(h => h.days === tm.recommended.days).pProfit * 10)} de cada 10.` : !tm.recommended && tm.horizons.length ? `; en ${esc(tm.horizons.at(-1).label)}, ${Math.round(tm.horizons.at(-1).pProfit * 10)} de cada 10.` : '.'}${tm.toTarget?.median != null ? ` Subir 5% tardó normalmente ${humanDays(tm.toTarget.median)}.` : ''}</div>` : '<div class="note">Faltan precios para medirlo.</div>'}</div>
    </div></section>

  ${a.size ? sizeCard(a.size, a.budget, a.light) : ''}
  <section class="card"><h2>Las preguntas, respondidas</h2>${qaAccordion(c)}</section>
  ${timingCard(a)}
  <section class="grid split">
    <div class="card"><h2>Su precio en el último año, contra el mercado</h2>${takeaway(y1 && y1.stock != null && y1.market != null ? `en un año ${esc(nm)} ${y1.stock >= 0 ? 'subió' : 'bajó'} ${Math.abs(Math.round(y1.stock * 100))}% y el mercado ${y1.market >= 0 ? 'subió' : 'bajó'} ${Math.abs(Math.round(y1.market * 100))}%: <b>${y1.stock > y1.market ? 'le ganó' : 'quedó por debajo'}</b>.` : '')}${compareLine(a.chart, a.benchChart, a.past, { label: nm + ' contra el mercado' })}<div class="legend"><span><i style="background:var(--accent)"></i>${esc(nm)}</span><span><i style="background:var(--mute)"></i>El mercado</span><span>● Recomendaciones pasadas de JARVIS (toca un punto para ver si acertó)</span></div></div>
    <div class="card"><h2>¿Le ganó al mercado?</h2>${takeaway(`le ganó al mercado en <b>${beatN} de ${a.periods.length}</b> periodos.`)}${barChart(a.periods.flatMap(p => [{ label: p.label + ' · ' + a.symbol, value: p.stock ?? 0, bold: true }, { label: 'mercado', value: p.market ?? 0, dim: true }]), { fmt: v => pctp(v), label: 'Rendimiento por periodo' })}
      <table style="margin-top:8px"><tr><th>Periodo</th><th class="r">${esc(a.symbol)}</th><th class="r">Mercado</th><th>¿Le ganó?</th></tr>${a.periods.map(p => `<tr><td>${esc(p.label)}</td><td class="r ${cls(p.stock)}">${pctp(p.stock)}</td><td class="r">${pctp(p.market)}</td><td>${p.stock == null || p.market == null ? '—' : p.stock > p.market ? '<span class="good">Sí</span>' : '<span class="bad">No</span>'}</td></tr>`).join('')}</table>
      <div class="note">Barras claras: el mercado en el mismo periodo. ${kindTag('dato')}</div></div>
  </section>
  <section class="grid split">
    <div class="card"><h2>Contra las otras opciones de hoy</h2>${takeaway(bestOther && bestOther.probBeat > a.probBeat ? `hoy <b>${esc(coName(bestOther.symbol))}</b> tiene más chance (${Math.round(bestOther.probBeat * 10)} de cada 10).` : `${esc(nm)} está entre las de más chance hoy.`)}${barChart(a.compare.slice().sort((x, y) => y.probBeat - x.probBeat).map(o => ({ label: coName(o.symbol), value: o.probBeat, bold: o.current, color: o.light === 'verde' ? 'var(--good)' : o.light === 'amarillo' ? 'var(--warn)' : 'var(--bad)', dim: !o.current })), { fmt: v => Math.round(v * 10) + ' de 10', label: 'De cada 10 veces, cuántas le gana al mercado' })}
      <div class="note">De cada 10 veces, cuántas le ganaría al mercado (${kindTag('estimacion')}). Color = qué hacer.</div></div>
    <div class="card"><h2>Qué pesó en la decisión</h2>${takeaway(fav ? `lo que más pesó fue <b>${esc((FACTOR[fav.factor] || fav.factor).toLowerCase())}</b>, ${fav.contribution >= 0 ? 'a favor' : 'en contra'}.` : '')}${whyBars(a.contributions)}<div class="mini3" style="margin-top:14px"><div class="pbox"><div class="l">Sube y baja al año</div><div class="v">${Math.round(a.stats.vol * 100)}%</div></div><div class="pbox"><div class="l">Su peor caída (1 año)</div><div class="v bad">${pctp(a.stats.maxDrawdown, 0)}</div></div><div class="pbox"><div class="l">Contra su promedio de 50 días</div><div class="v">${a.stats.sma50 ? pctp(a.stats.last / a.stats.sma50 - 1) : '—'}</div></div></div></div>
  </section>
  <section class="grid split">
    <div class="card"><h2>¿Qué podría pasar en el futuro?</h2>${takeaway(s6 ? `con US$10, en 6 meses lo más probable es <b>${s6.probable >= 0 ? 'ganar' : 'perder'} ${usd(Math.abs(10 * s6.probable))}</b>; en un mal caso, ${s6.bad >= 0 ? 'ganar' : 'perder'} ${usd(Math.abs(10 * s6.bad))}.` : '')}${rangeChart(a.scenarios, { label: 'Escenarios' })}<div class="note">Rojo: zona de pérdida · verde: zona de ganancia · punto: lo más probable. ${kindTag('estimacion')} hecha con 3 años de movimientos reales; no es una promesa.</div></div>
    <div class="card"><h2>La empresa por dentro</h2>${a.fundamentals.revenue.length >= 2 ? takeaway(`sus ventas ${a.fundamentals.revenue.at(-1).value >= a.fundamentals.revenue[0].value ? 'crecieron' : 'bajaron'} de ${usd(a.fundamentals.revenue[0].value / 1e9, 0)} a ${usd(a.fundamentals.revenue.at(-1).value / 1e9, 0)} mil millones.`) : ''}${a.fundamentals.revenue.length ? barChart([...a.fundamentals.revenue.map(r => ({ label: 'Ingresos ' + r.period, value: r.value / 1e9, color: 'var(--accent)' })), ...a.fundamentals.netIncome.map(r => ({ label: 'Ganancia ' + r.period, value: r.value / 1e9 }))], { fmt: v => usd(v, 1) + ' mil M', label: 'Ingresos y ganancias' }) + `<div class="note">${kindTag('dato')} SEC EDGAR, informes 10-K.</div>` : '<div class="empty">Sin informes oficiales cargados todavía (los fondos no los presentan).</div>'}</div>
  </section>
  <section class="grid split">
    <div class="card"><h2>Qué opinan las IA ${a.debate ? `<a class="more" href="#debate/${a.debate.id}">Ver debate completo ▸</a>` : ''}</h2>${a.opinions.length ? a.opinions.map(o => `<div class="pbox" style="margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center"><b>${esc(o.agent)}</b><span class="tag opinion">${esc(o.stance.replace('_', ' '))}</span>${o.probBeat != null ? `<span class="note">${Math.round(o.probBeat * 100)}% de ganarle al mercado</span>` : ''}<span class="note" style="margin-left:auto">${esc(o.date || '')} · ${o.correct == null ? 'resultado pendiente' : o.correct ? '✓ acertó' : '✕ falló'}</span></div><div style="margin-top:4px">${esc(o.argument)}</div></div>`).join('') : '<div class="empty">Todavía no hay debate sobre esta acción.</div>'}
      ${a.iaTrack.length ? `<div class="note">Historial de aciertos de cada IA: ${a.iaTrack.map(t => `${esc(t.agent)} ${t.hitRate}% (${t.n} casos)`).join(' · ')}</div>` : ''}</div>
    <div class="card"><h2>Noticias</h2>${a.news.length ? a.news.map(n => `<div style="padding:8px 0;border-top:1px solid var(--line)">${n.polemic >= 2 ? `<span class="tag" style="background:var(--bad-bg);color:var(--bad)">Polémica${n.verified ? ' confirmada' : ''}</span> ` : ''}<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><div class="note">${esc(n.summary || '')} · ${esc(n.source)}</div></div>`).join('') : '<div class="empty">Sin noticias recientes.</div>'}</div>
  </section>
  <section class="grid split">${narrativeBox(a)}${realtimeBox(a)}</section>
  <section class="card"><h2>Fuentes y pruebas</h2>${sourcesList(a.sources)}<div class="note" style="margin-top:10px">Este análisis quedó sellado: no se puede cambiar después de conocer el resultado.</div></section>`;
};
views.analisis.after = () => {
  const b = $('#explain'); if (!b) return;
  b.onclick = async () => { b.disabled = true; b.textContent = 'Pensando…';
    try { const r = await api(`/api/analysis/${b.dataset.id}/explain`, { method: 'POST' }); $('#narr').innerHTML = r.text ? `<div class="answer">${esc(r.text)}<div class="note" style="margin-top:6px">Escrita por ${esc(r.by)} · <span class="tag opinion">Opinión de IA</span></div></div>` : `<div class="msg err">${esc(r.error)}</div>`; }
    catch (e) { $('#narr').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; } };
};

async function lotteryAnalysisView(game) {
  const a = await api('/api/analysis/lottery/' + encodeURIComponent(game));
  if (a.empty) return `<div class="card empty">${esc(a.message)}</div>`;
  const c = a.conclusion;
  return `<div class="note"><a href="#loterias">Loterías</a> › ${esc(a.name)} › Análisis profundo</div>
  <section class="card ahead">
    <div class="balls">${a.pick.numbers.map(n => `<span class="ball" style="width:84px;height:84px;font-size:30px">${esc(n)}</span>`).join('')}</div>
    <div><h1>${esc(a.name)} <span class="muted" style="font-size:16px">${esc(a.entity)} · ${a.draws} sorteos analizados</span></h1><div class="sub">Número del sorteo del ${esc(a.pick.date)} · método: ${esc(a.pick.methodLabel)}</div></div>
    <div></div></section>
  <section class="card summary10" style="border-color:var(--warn)"><div class="s10-h">Resumen en 10 segundos</div>
    <div class="s10">
      <div class="tile"><div class="q">¿Qué hago?</div><div class="a warn">Si juegas, solo por diversión</div><div class="note">${esc(c.headline.replace(/^[^:]+:\s*/, ''))}</div></div>
      <div class="tile"><div class="q">Si apuestas RD$100 muchas veces…</div><div class="mr-v bad">vuelven ${rd(a.probs[0].per100)}</div><div class="note">en promedio, a largo plazo (quiniela). La banca se queda con el resto.</div></div>
      <div class="tile"><div class="q">¿Qué tan seguido sale el ${esc(a.number.num)}?</div>${chanceDots(a.probs[0].win, { what: 'sale en el sorteo', big: true })}<div class="note">Igual que cualquier otro número, si el sorteo es justo</div></div>
      <div class="tile"><div class="q">¿Cuándo sé si gané?</div><div class="a good">El mismo día</div><div class="note">Al salir los números. Si ganas, cobras con el ticket en la banca: guárdalo y pregunta el plazo.</div></div>
    </div></section>
  ${a.size ? sizeCard(a.size, a.budget, a.light) : ''}
  <section class="card"><h2>Las preguntas, respondidas</h2>${qaAccordion(c)}</section>
  ${timingCard(a)}
  <section class="grid split">
    <div class="card"><h2>Cuántas veces salió cada número</h2>${takeaway(`el ${esc(a.number.num)} salió ${a.number.count} veces en ${a.draws} sorteos. Con tan pocos sorteos, que un número salga más es casi siempre casualidad.`)}${freqChart(a.freq, a.draws * 3 / 100, a.number.num)}<div class="note">Naranja: el ${esc(a.number.num)}, que salió ${a.number.count} veces (esperado ${a.number.expected}); lleva ${a.number.gap} sorteos sin salir. ${kindTag('dato')}</div></div>
    <div class="card"><h2>Probabilidades exactas</h2><div class="tablewrap"><table><tr><th>Jugada</th><th class="r">Chance</th><th class="r">Devuelve de cada RD$100</th></tr>${a.probs.map(p => `<tr><td>${esc({ quiniela: 'Quiniela', pale: 'Palé', tripleta: 'Tripleta' }[p.kind])}</td><td class="r">${(p.win * 100).toFixed(p.win < 0.01 ? 3 : 2)}%</td><td class="r bad">${rd(p.per100)}</td></tr>`).join('')}</table></div><div class="note">${kindTag('dato')} Calculado con todas las combinaciones posibles y los pagos de banca configurados.</div></div>
  </section>
  <section class="grid split">
    <div class="card"><h2>¿Algún método le gana al azar?</h2>${takeaway(esc(a.compare.verdict))}${barChart([{ label: 'Azar (mediana)', value: a.compare.random.median, color: 'var(--mute)' }, ...a.compare.methods.map(m => ({ label: m.label, value: m.per100, color: m.beatsRandom ? 'var(--good)' : 'var(--warn)' }))], { fmt: v => rd(v), label: 'Devuelve por RD$100' })}<div class="note">${esc(a.compare.verdict)}</div></div>
    <div class="card"><h2>¿Hay señales de trampa?</h2>${takeaway(esc(a.scan.verdict))}${a.scan.tests.map(t => `<div style="display:flex;gap:8px;padding:4px 0">${t.anomaly ? '<span class="light rojo"><i></i>Revisar</span>' : '<span class="light verde"><i></i>Normal</span>'}<span>${esc(t.title)}</span><span class="note" style="margin-left:auto">${(Math.min(1, t.p) * 100).toFixed(1)}% por casualidad</span></div>`).join('')}</div>
  </section>
  <section class="grid split">${narrativeBox(a)}${realtimeBox(a)}</section>
  <section class="card"><h2>Fuentes y pruebas</h2>${sourcesList(a.sources)}</section>`;
}

views.historial = async () => {
  const [perf, hist, real] = await Promise.all([api('/api/performance'), api('/api/history'), api('/api/real')]);
  window.__H = { perf, hist, real };
  return `<div><h1>Historial: ¿cuánto acierta de verdad?</h1><p class="sub">Todo lo que JARVIS y cada IA recomendaron, guardado antes de saber el resultado. Aciertos y fallos, sin esconder nada.</p>
  <div class="seal ${perf.ledger.ok ? 'ok' : 'bad'}">${perf.ledger.ok ? `🔒 Registro intacto: ${perf.ledger.checked} entradas revisadas, nada se borró ni se cambió.` : '⚠️ El registro sellado fue alterado: revisar.'}</div></div>
  <div class="row" id="htabs"><button class="btn" data-t="bolsa">Bolsa (virtual)</button><button class="btn ghost" data-t="loterias">Loterías (virtual)</button><button class="btn ghost" data-t="ia">Comparar IA</button><button class="btn ghost" data-t="real">Dinero real (registrado por ti)</button></div>
  <div id="hview"></div>`;
};
function perfBlock(s, cur) {
  const money = v => (cur === 'RD$' ? rd(v) : usd(v));
  const coin = s.range && s.range[0] <= 50 && s.range[1] >= 50;
  const verdict = !s.resolved ? 'Todavía no hay resultados para juzgar.' : coin ? 'Por ahora acierta casi igual que lanzar una moneda: hace falta más tiempo para saber si de verdad sirve.' : s.hitRate > 50 ? 'Acierta más de lo que daría la suerte, y no es casualidad con estos datos.' : 'Acierta menos que la suerte: no conviene seguirlo todavía.';
  return `<section class="card hsum" style="border-color:var(--${!s.resolved || coin ? 'warn' : s.hitRate > 50 ? 'good' : 'bad'})">
    <div class="hs-big">${s.resolved ? `De <b>${s.resolved}</b> recomendaciones ya revisadas, acertó <b class="good">${s.hits}</b> (${Math.round(s.hitRate)}%).` : 'Aún no hay recomendaciones revisadas.'}</div>
    ${s.resolved ? `<div class="hs-sub">Si le hubieras hecho caso con los montos que dijo, hoy irías <b class="${cls(s.net)}">${s.net >= 0 ? 'ganando' : 'perdiendo'} ${money(Math.abs(s.net))}</b> (dinero virtual).</div>` : ''}
    <div class="hs-v">${verdict}</div></section>
  <section class="grid g4">
    <div class="card kpi" style="--c:var(--good)"><div class="l">Acertadas</div><div class="v good">${s.hits}</div><div class="s">${s.hitRate != null ? s.hitRate + '% de acierto' : 'sin calificar aún'}${s.range ? ` (rango ${s.range[0]}–${s.range[1]}%)` : ''}</div></div>
    <div class="card kpi" style="--c:var(--bad)"><div class="l">Fallidas</div><div class="v bad">${s.misses}</div><div class="s">racha récord de fallos: ${s.streak.bestMisses}</div></div>
    <div class="card kpi" style="--c:var(--warn)"><div class="l">Pendientes</div><div class="v">${s.pending}</div><div class="s">${s.total} registradas en total</div></div>
    <div class="card kpi"><div class="l">Si le hubieras hecho caso</div><div class="v ${cls(s.net)}">${money(s.net)}</div><div class="s">apostado ${money(s.staked)} · ganado ${money(s.won)} · perdido ${money(s.lost)}</div></div>
  </section>
  <section class="grid split">
    <div class="card"><h2>Evolución del dinero</h2>${s.curve.length > 1 ? lineChart(s.curve, { h: 200, label: 'Dinero acumulado' }) : '<div class="empty">Aparece cuando haya al menos 2 recomendaciones calificadas.</div>'}</div>
    <div class="card"><h2>Ganancias y pérdidas por mes</h2>${s.months.length ? barChart(s.months.map(m => ({ label: m.month, value: m.net })), { fmt: money, label: 'Por mes' }) : '<div class="empty">Sin meses calificados todavía.</div>'}
      <div class="note">${s.best ? `Mejor mes: ${esc(s.best.month)} (${money(s.best.net)}). Peor mes: ${esc(s.worst.month)} (${money(s.worst.net)}).` : ''}</div>
      ${s.brier != null ? `<details class="note" style="margin-top:6px"><summary>Para expertos</summary>Calibración (Brier): ${s.brier}. Más bajo es mejor; 0.25 es lo mismo que adivinar.</details>` : ''}</div>
  </section>`;
}
function recordsTable(rows) {
  if (!rows.length) return '<div class="empty">Todavía no hay registros. Aparecen cuando el motor genere el ranking o sorteos.</div>';
  const st = { acerto: '<span class="good">✓ Acertó</span>', fallo: '<span class="bad">✕ Falló</span>', pendiente: '<span class="note">Pendiente</span>' };
  return `<div class="tablewrap"><table><tr><th>Día</th><th>Quién</th><th>Opción</th><th>Qué dijo</th><th class="r">Prob.</th><th class="r">Monto</th><th class="r">Posible ganancia</th><th>Resultado</th></tr>
  ${rows.map(r => `<tr><td class="note">${esc(r.dataDate)}</td><td>${esc(r.agentLabel)}</td><td class="sym">${esc(r.subject)}</td><td style="min-width:220px">${r.light ? light(r.light) + ' ' : ''}${esc(r.claim)}
    <details><summary>Detalle ▸</summary>${r.why ? `<div class="note"><b>Por qué:</b> ${esc(Array.isArray(r.why) ? r.why.join(' ') : r.why)}</div>` : ''}${r.others?.length ? `<div class="note"><b>Otras IA:</b> ${r.others.map(o => `${esc(o.agent)}: ${esc(o.stance)} (${Math.round(o.probBeat * 100)}%)`).join(' · ')}</div>` : ''}${r.sources?.length ? `<div class="note"><b>Fuentes:</b> ${r.sources.map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)).join(' · ')}</div>` : ''}${r.outcome ? `<div class="note"><b>Resultado real:</b> ${r.outcome.ret != null ? `${pctp(r.outcome.ret)} la acción vs ${pctp(r.outcome.bench)} el mercado (al ${esc(r.outcome.endDate)})` : `salió ${esc((r.outcome.draw || []).join('-'))}`}</div>` : ''}<div class="note mono">Sellada ${esc(r.sealedAt.slice(0, 16).replace('T', ' '))} UTC · huella ${esc(r.hash.slice(0, 16))}…</div></details></td>
    <td class="r">${Math.round(r.prob * 100)}%</td><td class="r">${r.amount.value != null ? (r.amount.cur === 'RD$' ? rd(r.amount.value) : usd(r.amount.value, 0)) : '—'}</td>
    <td class="r">${r.potential ? (typeof r.potential === 'number' ? rd(r.potential) : `${usd(r.potential.probable)} <span class="note">(${usd(r.potential.bad)} a ${usd(r.potential.good)})</span>`) : '—'}</td>
    <td>${st[r.status]}${r.pnl != null ? ` <span class="${cls(r.pnl)}">${r.amount.cur === 'RD$' ? rd(r.pnl) : usd(r.pnl)}</span>` : ''}</td></tr>`).join('')}</table></div>`;
}
views.historial.after = () => {
  const { perf, hist, real } = window.__H;
  const show = t => {
    document.querySelectorAll('#htabs button').forEach(b => b.classList.toggle('ghost', b.dataset.t !== t));
    if (t === 'bolsa' || t === 'loterias') {
      const rows = hist.filter(r => (t === 'bolsa' ? r.module !== 'loteria' : r.module === 'loteria'));
      const who = [...new Set(rows.map(r => r.agentLabel))];
      $('#hview').innerHTML = perfBlock(perf[t], t === 'bolsa' ? 'US$' : 'RD$') + `<section class="card"><h2>Registro completo (${rows.length}) <a class="more" href="/api/export/predicciones">Exportar todo ▸</a></h2>
        <div class="row" style="margin-bottom:10px;gap:10px"><label class="note">Quién <select id="fq"><option value="">Todos</option>${who.map(w => `<option>${esc(w)}</option>`).join('')}</select></label>
        <label class="note">Resultado <select id="fr"><option value="">Todos</option><option value="acerto">Acertó</option><option value="fallo">Falló</option><option value="pendiente">Pendiente</option></select></label>
        <span class="note" id="fc" style="margin-left:auto"></span></div><div id="rt"></div><div style="text-align:center;margin-top:10px"><button class="btn ghost" id="fm">Ver más</button></div></section>`;
      let lim = 20;
      const draw = () => { const f = rows.filter(r => (!$('#fq').value || r.agentLabel === $('#fq').value) && (!$('#fr').value || r.status === $('#fr').value));
        $('#rt').innerHTML = recordsTable(f.slice(0, lim)); $('#fc').textContent = `Mostrando ${Math.min(lim, f.length)} de ${f.length}`; $('#fm').style.display = f.length > lim ? '' : 'none'; };
      $('#fq').onchange = $('#fr').onchange = () => { lim = 20; draw(); }; $('#fm').onclick = () => { lim += 40; draw(); }; draw();
    } else if (t === 'ia') {
      const ia = perf.ia;
      const people = ia.agents.filter(a => a.kind !== 'estrategia').sort((x, y) => (y.hitRate ?? -1) - (x.hitRate ?? -1));
      const tags = a => [[ia.leaders?.masAciertos, '🏆 Acierta más'], [ia.leaders?.mejorProbabilidad, '🎯 Mejor calculando'], [ia.leaders?.masGanancia, '💰 Gana más'], [ia.leaders?.masErrores, '⚠️ Falla más']].filter(([n]) => n === a.label).map(([, t]) => `<span class="pill">${t}</span>`).join('');
      $('#hview').innerHTML = `<section><h2 style="margin:4px 0 12px">¿Qué IA es más confiable?</h2><div class="grid g3">${people.map((a, i) => `<div class="card iac${i === 0 && a.resolved ? ' first' : ''}"><div class="iac-h"><span class="pos">${i + 1}</span><b>${esc(a.label)}</b></div>
          <div class="iac-v">${a.hitRate != null ? Math.round(a.hitRate) + '%' : '—'}</div><div class="note">de acierto · ${a.hits} aciertos y ${a.misses} fallos</div>
          ${a.hitRate != null ? chanceDots(a.hitRate / 100, { what: 'acierta' }) : ''}
          <div class="note" style="margin-top:8px">Con US$10 por idea: <b class="${cls(a.net)}">${usd(a.net)}</b></div><div class="row" style="gap:6px;margin-top:8px">${tags(a)}</div></div>`).join('')}</div>
        <div class="note" style="margin-top:8px">${esc(ia.note || '')} Ninguna IA puede borrar ni cambiar lo que dijo: todo queda sellado antes del resultado.</div></section>
        <details class="card"><summary><b>Tabla completa</b> <span class="note">para expertos</span></summary><div class="tablewrap" style="margin-top:10px"><table><tr><th>Agente</th><th class="r">Predicciones</th><th class="r">Aciertos</th><th class="r">Fallos</th><th class="r">% acierto</th><th class="r">Prob. promedio</th><th class="r">Calibración (Brier)</th><th class="r">Neto con US$10</th></tr>
        ${ia.agents.filter(a => a.kind !== 'estrategia').map(a => `<tr><td><b>${esc(a.label)}</b></td><td class="r">${a.total}</td><td class="r good">${a.hits}</td><td class="r bad">${a.misses}</td><td class="r">${a.hitRate != null ? a.hitRate + '%' : '—'}</td><td class="r">${a.avgProb != null ? a.avgProb + '%' : '—'}</td><td class="r">${a.brier ?? '—'}</td><td class="r ${cls(a.net)}">${usd(a.net)}</td></tr>`).join('')}</table></div>
        <div class="note" style="margin-top:8px">Calibración: si una IA dice "70%" y acierta 7 de cada 10, está bien calibrada. Brier más bajo es mejor; 0.25 equivale a adivinar.</div></details>
        <section class="card"><h2>Agentes de estrategia (practican con dinero virtual)</h2><table><tr><th>Agente</th><th class="r">Operaciones cerradas</th><th class="r">Monedas</th><th class="r">Trampas detectadas</th></tr>${ia.agents.filter(a => a.kind === 'estrategia').map(a => `<tr><td>${esc(a.label)}</td><td class="r">${a.closedTrades}</td><td class="r">${a.coins}</td><td class="r ${a.cheats ? 'bad' : ''}">${a.cheats}</td></tr>`).join('')}</table></section>`;
    } else {
      const r = real;
      $('#hview').innerHTML = `<section class="card" style="border-color:var(--warn)"><h2>Dinero real</h2><p class="note">JARVIS nunca invierte ni apuesta por ti. Aquí anotas lo que hiciste de verdad, para comparar tu dinero real con sus recomendaciones. Lo que anotes queda sellado. Si una inversión real cae 8% desde tu compra o pasa a "No te recomiendo", te aviso al celular para que decidas salir.</p>
        <div class="grid g4"><div class="pbox"><div class="l">Bolsa: neto realizado</div><div class="v ${cls(r.bolsa.net)}">${usd(r.bolsa.net)}</div><div class="note">${r.bolsa.count} registros · ${r.bolsa.open} abiertos</div></div><div class="pbox"><div class="l">Bolsa: invertido</div><div class="v">${usd(r.bolsa.staked)}</div><div class="note">${r.bolsa.followed} siguiendo a JARVIS</div></div>
        <div class="pbox"><div class="l">Loterías: neto</div><div class="v ${cls(r.loterias.net)}">${rd(r.loterias.net)}</div><div class="note">${r.loterias.count} apuestas · ${r.loterias.wins} premios</div></div><div class="pbox"><div class="l">Loterías: apostado</div><div class="v">${rd(r.loterias.staked)}</div></div></div></section>
        <section class="grid g2"><div class="card"><h2>Anotar inversión real (bolsa)</h2><form class="form" id="rbf"><div class="grid g3" style="gap:10px"><label>Acción<input id="rbs" placeholder="MSFT" required></label><label>Monto US$<input id="rba" type="number" step="0.01" min="0.01" required></label><label>Precio de compra<input id="rbp" type="number" step="0.0001" min="0.0001" required></label></div><button class="btn">Anotar</button><div class="msg" id="rbm"></div></form></div>
        <div class="card"><h2>Anotar apuesta real (lotería)</h2><form class="form" id="rlf"><div class="grid g4" style="gap:10px"><label>Lotería<select id="rlg">${['leidsa', 'nacional', 'nacional-noche', 'loteka', 'real'].map(g => `<option>${g}</option>`).join('')}</select></label><label>Fecha<input id="rld" type="date" required></label><label>Números<input id="rln" placeholder="27" required></label><label>Monto RD$<input id="rls" type="number" min="1" required></label></div><button class="btn">Anotar</button><div class="msg" id="rlm"></div></form></div></section>
        <section class="card"><h2>Mis registros reales</h2>${r.rows.length ? `<table><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Estado</th><th class="r">Resultado</th></tr>${r.rows.map(x => `<tr><td class="note">${esc(x.ts.slice(0, 10))}</td><td>${x.module === 'bolsa' ? 'Bolsa' : 'Lotería'}</td><td>${x.module === 'bolsa' ? `${esc(x.detail.symbol)} · ${usd(x.detail.amountUsd)} a ${usd(x.detail.price)}` : `${esc(x.detail.game)} ${esc(x.detail.date)} · ${esc(x.detail.numbers.join('-'))} · ${rd(x.detail.stakeRd)}`}</td><td>${x.status === 'abierta' ? (x.module === 'bolsa' ? `<button class="btn ghost" data-close="${x.id}" style="padding:3px 10px">Anotar venta</button>` : 'Esperando sorteo') : 'Cerrada'}</td><td class="r ${cls(x.result)}">${x.result != null ? (x.module === 'bolsa' ? usd(x.result) : rd(x.result)) : '—'}</td></tr>`).join('')}</table>` : '<div class="empty">Sin registros reales todavía.</div>'}</section>`;
      const post = async (body, m) => { try { await api('/api/real', { method: 'POST', body }); $(m).className = 'msg ok'; $(m).textContent = 'Anotado y sellado.'; setTimeout(render, 900); } catch (e) { $(m).className = 'msg err'; $(m).textContent = e.message; } };
      $('#rbf').onsubmit = e => { e.preventDefault(); post({ module: 'bolsa', symbol: $('#rbs').value, amountUsd: $('#rba').value, price: $('#rbp').value }, '#rbm'); };
      $('#rlf').onsubmit = e => { e.preventDefault(); post({ module: 'loteria', game: $('#rlg').value, date: $('#rld').value, numbers: $('#rln').value.trim().split(/\s+/).map(x => x.padStart(2, '0')), stakeRd: $('#rls').value }, '#rlm'); };
      document.querySelectorAll('[data-close]').forEach(b => b.onclick = async () => { const td = b.parentElement; td.innerHTML = `<form class="ask" style="max-width:260px"><input type="number" step="0.0001" placeholder="Precio de venta" required><button class="btn">OK</button></form>`;
        td.querySelector('form').onsubmit = async e => { e.preventDefault(); try { await api(`/api/real/${b.dataset.close}/close`, { method: 'POST', body: { sellPrice: td.querySelector('input').value } }); render(); } catch (err) { td.insertAdjacentHTML('beforeend', `<div class="msg err">${esc(err.message)}</div>`); } }; });
    }
  };
  document.querySelectorAll('#htabs button').forEach(b => b.onclick = () => show(b.dataset.t));
  show('bolsa');
};

// ---------- MODO TV ----------
let tvTimer = null, tvLastId = 0, tvClock = null, tvDebTimer = null, tvPrev = null, tvChartKey = '';
const TVC = { verde: '#2fd58a', amarillo: '#ffbf3c', rojo: '#ff5d6c' };
function animNum(el, from, to, fmt, ms = 1400) {
  if (!el) return; const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
async function tvOpen() {
  $('#tv-root').innerHTML = `<div class="tv" id="tv"><button class="iconbtn exit" id="tvx">Salir ✕</button>
    <div class="th"><span class="logo">${brandMark()}${brandName()}</span><span class="chip" id="tvm">…</span><span class="chip" id="tvmk">…</span><span class="chip" id="tvai">…</span><span class="clock" id="tvc"></span></div>
    <div class="headline" id="tvh">Conectando…</div>
    <div class="kpis">
      <div class="kp money"><small>Dinero virtual</small><div class="row1"><b id="k-money">—</b><span class="arrow" id="k-arrow"></span></div><div class="sub" id="k-money-sub"></div></div>
      <div class="kp"><small>Aciertos</small><b id="k-hit">—</b><div class="sub" id="k-hit-sub"></div></div>
      <div class="kp"><small>Racha actual</small><b id="k-streak">0</b><div class="sub" id="k-streak-sub"></div></div>
      <div class="kp"><small>Experimentos</small><b id="k-exp">0</b><div class="sub" id="k-exp-sub"></div></div>
    </div>
    <div class="body">
      <div class="pane"><h3><span class="live"></span>La IA en este momento</h3><div class="console" id="tvcon"></div><div class="prog"><span></span></div></div>
      <div class="col">
        <div class="pane chartpane"><h3 id="tvct">Rendimiento</h3><div id="tvchart" class="chartbox"></div></div>
        <div class="pane"><h3>Recomendaciones del momento</h3><div class="cards" id="tvrank"></div></div>
      </div>
      <div class="col">
        <div class="pane debpane"><h3><span class="live"></span><span id="tvdt">Debate en vivo</span></h3><div class="chat" id="tvchat"></div></div>
        <div class="pane leaguepane"><h3>Liga de agentes · monedas</h3><div class="league" id="tvlg"></div></div>
      </div>
    </div>
    <div class="ticker"><div class="track" id="tvtk"></div></div></div>`;
  $('#tvx').onclick = () => { location.hash = '#inicio'; };
  try { await document.documentElement.requestFullscreen?.(); } catch { /* opcional */ }
  tvClock = setInterval(() => { const c = $('#tvc'); if (c) c.textContent = new Date().toLocaleString('es-DO', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }, 1000);
  tvPrev = null; tvLastId = 0; tvChartKey = '';
  await tvRefresh(); tvTimer = setInterval(tvRefresh, 15000);
}
function tvClose() { clearInterval(tvTimer); clearInterval(tvClock); clearTimeout(tvDebTimer); $('#tv-root').innerHTML = ''; if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }

function tvChart(c) {
  const box = $('#tvchart'); if (!box) return;
  if (!c) { box.innerHTML = '<div class="empty-tv">El gráfico aparece cuando haya precios suficientes.</div>'; return; }
  const key = JSON.stringify([c.a.at(-1), c.b.at(-1), c.a.length]); if (key === tvChartKey) return; tvChartKey = key;
  $('#tvct').textContent = c.title;
  const W = 900, H = 300, L = c.unit === 'usd' ? 92 : 60, R = 200, T = 16, B = 30, all = [...c.a, ...c.b].map(p => p[1]);
  const min = Math.min(0, ...all), max = Math.max(0, ...all), sp = max - min || 1;
  const x = i => L + i / (c.a.length - 1) * (W - L - R), y = v => T + (1 - (v - min) / sp) * (H - T - B);
  const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const f = v => c.unit === 'usd' ? usd(v) : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  const ticks = [min, (min + max) / 2, max], la = c.a.at(-1)[1], lb = c.b.at(-1)[1];
  const ca = la >= lb ? '#2fd58a' : '#ff5d6c';
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(c.title)}">
    <defs><linearGradient id="tvg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${ca}" stop-opacity=".35"/><stop offset="1" stop-color="${ca}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#1e2a44"/><text x="${L - 8}" y="${y(t) + 5}" text-anchor="end" fill="#6d7b99" font-size="15">${f(t)}</text>`).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#3a4a6b" stroke-dasharray="4 4"/>
    <path class="area" d="${path(c.a)} L${x(c.a.length - 1)} ${y(min)} L${x(0)} ${y(min)} Z" fill="url(#tvg)"/>
    <path class="draw b" d="${path(c.b)}" fill="none" stroke="#8a97b5" stroke-width="2.5" stroke-dasharray="7 6" pathLength="1000"/>
    <path class="draw a" d="${path(c.a)}" fill="none" stroke="${ca}" stroke-width="4" pathLength="1000"/>
    <circle class="dot" cx="${x(c.a.length - 1)}" cy="${y(la)}" r="8" fill="${ca}"/>
    <text x="${W - R + 14}" y="${y(la) + 6}" fill="${ca}" font-size="20" font-weight="800">${esc(c.aLabel)} ${f(la)}</text>
    <text x="${W - R + 14}" y="${y(lb) + (Math.abs(y(lb) - y(la)) < 26 ? 30 : 6)}" fill="#8a97b5" font-size="17">${esc(c.bLabel)} ${f(lb)}</text>
    <text x="${L}" y="${H - 6}" fill="#6d7b99" font-size="14">${esc(c.a[0][0])}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" fill="#6d7b99" font-size="14">${esc(c.a.at(-1)[0])}</text></svg>`;
}

function tvDebate(d) {
  const chat = $('#tvchat'); if (!chat) return;
  if (!d) { chat.innerHTML = '<div class="empty-tv">Las dos IA debaten aquí antes de cada recomendación importante.</div>'; return; }
  if (chat.dataset.id === String(d.id)) return; chat.dataset.id = d.id;
  $('#tvdt').textContent = `Debate en vivo · ${d.subject}`;
  const msgs = d.rounds.flatMap(r => r.messages.filter(m => !m.failed).map((m, i) => ({ ...m, side: i ? 'b' : 'a', round: r.round })));
  const v = d.verdict;
  let i = 0; clearTimeout(tvDebTimer);
  const next = () => {
    if (!$('#tvchat')) return;
    if (i === 0) chat.innerHTML = '';
    if (!msgs.length || i >= msgs.length) {
      chat.insertAdjacentHTML('beforeend', `<div class="verdict-tv" style="border-color:${TVC[v.light]}"><span style="color:${TVC[v.light]}">● Decisión: ${esc(v.title)}</span><small>${esc(v.notes[0] || '')} · confianza ${Math.round(v.confidence * 100)}%</small></div>`);
      i = 0; tvDebTimer = setTimeout(next, 9000); return;
    }
    const m = msgs[i];
    const typing = document.createElement('div'); typing.className = `bub-tv ${m.side} typing`; typing.innerHTML = `<b>${esc(m.who)}</b> está escribiendo <span class="dots"><i></i><i></i><i></i></span>`;
    chat.appendChild(typing);
    tvDebTimer = setTimeout(() => {
      typing.remove();
      chat.insertAdjacentHTML('beforeend', `<div class="bub-tv ${m.side}"><div class="who"><b>${esc(m.who)}</b><span class="st ${m.stance}">${esc(m.stance.replace('_', ' '))}</span><span class="rd">ronda ${m.round}</span></div><p>${esc(m.text)}</p></div>`);
      while (chat.children.length > 4) chat.firstElementChild.remove();
      i++; tvDebTimer = setTimeout(next, 3800);
    }, 1500);
  };
  next();
}

function tvLeague(list) {
  const box = $('#tvlg'); if (!box) return;
  const rowH = 2.9, max = Math.max(1, ...list.map(a => Math.abs(a.coins)));
  list.forEach((a, rank) => {
    let row = box.querySelector(`[data-ag="${a.id}"]`);
    const prev = row ? Number(row.dataset.coins) : null;
    if (!row) { row = document.createElement('div'); row.className = 'lrow'; row.dataset.ag = a.id; row.innerHTML = `<span class="pos"></span><span class="nm">${esc(a.name)}</span><b class="cn"></b><div class="bar"><span></span></div>`; box.appendChild(row); }
    row.style.top = rank * rowH + 'vw';
    row.querySelector('.pos').textContent = rank + 1;
    const cn = row.querySelector('.cn'); animNum(cn, prev ?? 0, a.coins, v => (Math.round(v * 10) / 10).toString(), 1200);
    cn.className = 'cn ' + (a.coins >= 0 ? 'pos-c' : 'neg-c');
    requestAnimationFrame(() => { row.querySelector('.bar span').style.width = Math.max(3, (a.coins + max) / (2 * max) * 100) + '%'; });
    const gained = prev == null ? (rank === 0 && a.week > 0 ? a.week : 0) : a.coins - prev;
    if (gained > 0) coinRain(box, rank * rowH, Math.min(14, Math.ceil(gained * 2)), `+${Math.round(gained * 10) / 10}`);
    row.dataset.coins = a.coins;
  });
  box.style.height = list.length * rowH + 'vw';
}
function coinRain(box, topVw, n, label) {
  const tag = document.createElement('div'); tag.className = 'gain'; tag.style.top = topVw + 'vw'; tag.textContent = label + ' monedas'; box.appendChild(tag); setTimeout(() => tag.remove(), 3000);
  for (let k = 0; k < n; k++) {
    const c = document.createElement('span'); c.className = 'coin'; c.textContent = '¢';
    c.style.left = (55 + Math.random() * 40) + '%'; c.style.top = (topVw - 4) + 'vw'; c.style.animationDelay = (k * 0.12) + 's';
    box.appendChild(c); setTimeout(() => c.remove(), 2600 + k * 120);
  }
}

function tvTicker(qs) {
  const t = $('#tvtk'); if (!t) return;
  const items = qs.map(q => { const up = (q.changePct ?? 0) >= 0; return `<span class="tq"><b>${esc(q.symbol)}</b> ${usd(q.price)} <em class="${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.abs(q.changePct ?? 0).toFixed(2)}%</em></span>`; }).join('');
  const html = items + '<span class="tq dim">Todo es dinero virtual · JARVIS no promete ganancias, demuestra con datos</span>';
  if (t.dataset.h !== html) { t.dataset.h = html; t.innerHTML = html + html; t.style.animationDuration = Math.max(30, qs.length * 5) + 's'; }
}

async function tvRefresh() {
  let d; try { d = await api('/api/tv'); } catch { return; }
  if (!$('#tv')) return;
  $('#tvm').innerHTML = d.motor.running ? '<b style="color:#2fd58a">● Motor activo</b>' : '<b>○ Motor en pausa</b>';
  $('#tvmk').innerHTML = `Bolsa de NY: <b>${d.marketOpen ? 'abierta' : 'cerrada'}</b>`;
  $('#tvai').innerHTML = `Gasto IA: <b>${usd(d.ai.month)}</b> / ${usd(d.ai.monthCap, 0)}`;
  $('#tvh').innerHTML = `${esc(d.headline)}<small>${esc(d.lotteryLine)}</small>`;
  // Dinero en vivo
  const a = d.account, prev = tvPrev;
  const delta = a.total - a.start, up = delta >= 0;
  animNum($('#k-money'), prev ? prev.account.total : a.start, a.total, v => usd(v));
  $('#k-arrow').className = 'arrow ' + (up ? 'up' : 'dn'); $('#k-arrow').textContent = up ? '▲' : '▼';
  $('#k-money-sub').innerHTML = `<span class="${up ? 'up' : 'dn'}">${up ? '+' : '−'}${usd(Math.abs(delta)).replace('−', '')} (${pct(a.returnPct, 2)})</span> desde ${usd(a.start, 0)}${a.fx ? ` · ≈ RD$${Math.round(a.total * a.fx).toLocaleString('es-DO')}` : ''}`;
  if (prev && prev.account.total !== a.total) { const k = $('.kp.money'); k.classList.remove('flash-up', 'flash-dn'); void k.offsetWidth; k.classList.add(a.total > prev.account.total ? 'flash-up' : 'flash-dn'); }
  const p = d.predictions;
  if (p.hitRate != null) animNum($('#k-hit'), prev?.predictions.hitRate ?? 0, p.hitRate, v => v.toFixed(1) + '%'); else $('#k-hit').textContent = '—';
  $('#k-hit-sub').textContent = `${p.hits} aciertos · ${p.misses} fallos · ${p.pending} pendientes`;
  animNum($('#k-streak'), prev?.predictions.streak.current ?? 0, p.streak.current || 0, v => Math.round(v).toString());
  $('#k-streak-sub').textContent = `${p.streak.type ? (p.streak.type === 'acierto' ? 'aciertos seguidos' : 'fallos seguidos') : 'esperando resultados'} · récord ${p.streak.bestHits}`;
  animNum($('#k-exp'), prev?.learning.experiments ?? 0, d.learning.experiments, v => Math.round(v).toString());
  $('#k-exp-sub').textContent = `${d.learning.byStatus.en_prueba || 0} en prueba en vivo · ${d.learning.byStatus.validada || 0} validadas`;
  // Consola: la línea nueva se escribe letra por letra
  const evs = d.activity.slice(0, 13);
  const con = $('#tvcon');
  con.innerHTML = evs.map((e, i) => `<div class="${e.important ? 'imp' : ''}"><time>${hhmm(e.ts)}</time><span>${e.agent ? `<span class="ag">[${esc((AGENTS[e.agent] || [e.agent])[0])}]</span> ` : ''}<span class="tx" data-full="${esc(e.text)}">${i === 0 && e.id > tvLastId ? '' : esc(e.text)}</span>${i === 0 ? '<span class="cursor"></span>' : ''}</span></div>`).join('');
  const first = con.querySelector('.tx');
  if (first && !first.textContent) { const full = first.dataset.full; let n = 0; const ty = setInterval(() => { if (!first.isConnected) return clearInterval(ty); first.textContent = full.slice(0, ++n); if (n >= full.length) clearInterval(ty); }, 22); }
  const alert = tvLastId && d.activity.find(e => e.id > tvLastId && e.important);
  if (alert) { const el = document.createElement('div'); el.className = 'alert'; el.textContent = alert.text; $('#tv').appendChild(el); setTimeout(() => el.remove(), 7000); }
  tvLastId = Math.max(tvLastId, ...d.activity.map(e => e.id), 0);
  tvChart(d.chart);
  $('#tvrank').innerHTML = d.ranking.length ? d.ranking.slice(0, 6).map((c, i) => `<div class="rc" style="animation-delay:${i * 0.08}s"><div class="s"><i style="background:${TVC[c.light]};box-shadow:0 0 12px ${TVC[c.light]}"></i>${esc(coName(c.symbol))}<span class="c">${c.probBeat != null ? Math.round(c.probBeat * 10) + '/10' : ''}</span></div><div class="cbar"><span style="width:${Math.round((c.probBeat ?? c.confidence) * 100)}%;background:${TVC[c.light]}"></span></div><p>${esc(c.why || '')}</p></div>`).join('') : '<div class="empty-tv">El ranking aparece cuando haya suficientes precios.</div>';
  tvDebate(d.debate);
  tvLeague(d.league);
  tvTicker(d.quotes || []);
  tvPrev = d;
}

// ---------- Enrutador ----------
async function render() {
  const [name, ...rest] = (location.hash.slice(1) || 'inicio').split('/'); const arg = rest.join('/');
  document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + name ? 'page' : 'false'));
  if (name === 'tv') { app.innerHTML = ''; return tvOpen(); }
  tvClose();
  const v = views[name] || views.inicio;
  try {
    app.innerHTML = await v(decodeURIComponent(arg || ''));
    document.querySelectorAll('[data-go]').forEach(el => el.onclick = () => (location.hash = el.dataset.go));
    if (v.after) await v.after(decodeURIComponent(arg || ''));
    bindDebateButtons();
  } catch (e) { if (e.message !== 'Inicia sesión.') app.innerHTML = `<div class="card msg err">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
async function pulse() {
  try { const s = await api('/api/status');
    if (s.storage && !s.storage.persistent && !document.getElementById('nopersist')) document.querySelector('main').insertAdjacentHTML('beforebegin', '<div id="nopersist" class="msg err" style="text-align:center;padding:10px;font-weight:700">⚠️ Falta el volumen en Railway: tus datos se borran en cada actualización. Agrega un volumen montado en /data.</div>'); const alive = s.heartbeat && Date.now() - Date.parse(s.heartbeat) < 20 * 60e3; $('#sys-dot').className = 'status-dot ' + (alive && s.ledger.ok ? 'on' : 'off'); $('#sys-text').textContent = alive ? (s.motor.running ? 'Trabajando' : 'En pausa') : 'Sin latido'; } catch { /* sin sesión */ }
}
async function boot() {
  await loadBrand();
  try { ME = await api('/api/me'); } catch { return; }
  await loadBudget();
  applyUser();
  if (ME.profile && !ME.profile.setup && !location.hash.startsWith('#perfil')) location.hash = '#perfil';
  $('#top').classList.remove('hide');
  $('#nav-admin').classList.toggle('hide', ME.role !== 'admin');
  render(); pulse(); setInterval(pulse, 60000);
}
$('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('jv-theme', t); } catch { /* sin almacenamiento */ } };
$('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); showAuth(); };
window.addEventListener('hashchange', () => ME && render());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
