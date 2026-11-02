// 💎 Buscador de joyas: busca más allá de las empresas famosas que todo el mundo mira.
//  1) Una lista de empresas medianas muy bien llevadas que casi nadie menciona, y fondos de sectores y otros países.
//  2) Un radar que cada día trae de Yahoo las listas de "crecimiento barato", "pequeñas agresivas", etc.
//  3) Un detector de "rarezas": patrones que los estudios han encontrado que funcionan y la gente suele ignorar.
// Nada de esto se recomienda solo: todo pasa por las mismas pruebas con precios reales que las demás.
import { getSetting, setSetting, nowIso, activity } from '../core/db.js';
import { sd } from '../core/util.js';

/** Empresas medianas/menos famosas con negocios fuertes, y fondos que la gente casi no mira. */
export const HIDDEN = {
  // Líderes "aburridos" de nicho: crecen parejo año tras año
  ODFL: 'camiones de carga', CPRT: 'subastas de carros chocados', FAST: 'tornillos y suministros', ROL: 'control de plagas', POOL: 'piscinas',
  TSCO: 'tiendas de campo', CTAS: 'uniformes', PAYX: 'nóminas', ORLY: 'piezas de carros', AZO: 'piezas de carros', BRO: 'seguros',
  ROP: 'software de nicho', VRSK: 'datos de seguros', WM: 'basura y reciclaje', RSG: 'basura y reciclaje', GWW: 'suministros industriales',
  URI: 'alquiler de equipos', PWR: 'redes eléctricas', ETN: 'electricidad', HEI: 'piezas de aviones', TDG: 'piezas de aviones', WST: 'envases médicos',
  IDXX: 'diagnóstico para mascotas', ISRG: 'robots de cirugía', FICO: 'puntaje de crédito', MSCI: 'índices de bolsa', MCO: 'calificaciones de crédito',
  SPGI: 'calificaciones e índices', ICE: 'bolsas de valores', CME: 'bolsa de futuros', AXON: 'equipos para policía', DECK: 'zapatos (HOKA/UGG)',
  // Crecimiento que no es de los 7 gigantes
  ANET: 'redes para centros de datos', SNPS: 'software para diseñar chips', CDNS: 'software para diseñar chips', KLAC: 'máquinas de chips',
  LRCX: 'máquinas de chips', MPWR: 'chips de energía', CRWD: 'ciberseguridad', PANW: 'ciberseguridad', FTNT: 'ciberseguridad', MELI: 'comercio en Latinoamérica',
  TSM: 'fábrica de chips (Taiwán)', ASML: 'máquinas de chips (Holanda)', NVO: 'farmacéutica (Dinamarca)', RACE: 'Ferrari', UBER: 'transporte', TJX: 'tiendas de descuento',
  VRTX: 'medicinas', REGN: 'medicinas', DUOL: 'app de idiomas', ELF: 'maquillaje barato',
  // Fondos de sectores, factores y otros países
  SMH: 'fondo de chips', XLE: 'fondo de petróleo', XLV: 'fondo de salud', XLI: 'fondo de industria', XLU: 'fondo de electricidad', XLP: 'fondo de consumo básico',
  XLF: 'fondo de bancos', IWM: 'fondo de 2000 empresas pequeñas', MDY: 'fondo de empresas medianas', VXUS: 'fondo del mundo sin EE. UU.', EWJ: 'fondo de Japón',
  INDA: 'fondo de India', EWZ: 'fondo de Brasil', GLD: 'oro', SLV: 'plata', COWZ: 'fondo de empresas que generan mucho efectivo', QUAL: 'fondo de empresas de calidad',
  MTUM: 'fondo de las que vienen subiendo', USMV: 'fondo de las más tranquilas', VIG: 'fondo de dividendos crecientes', AVUV: 'fondo de pequeñas baratas',
  IBB: 'fondo de biotecnología', ITA: 'fondo de aviones y defensa', PAVE: 'fondo de infraestructura', URA: 'fondo de uranio', COPX: 'fondo de cobre',
};

const TICKER = /^[A-Z]{1,5}(\.[A-Z])?$/;
const SCREENS = { undervalued_growth_stocks: 'crecimiento a buen precio', growth_technology_stocks: 'tecnología creciendo', undervalued_large_caps: 'grandes baratas', aggressive_small_caps: 'pequeñas creciendo rápido', small_cap_gainers: 'pequeñas subiendo' };

/** Radar diario: listas públicas de Yahoo con empresas que están llamando la atención por sus números. */
export async function radarFetch(db, { fetchImpl = fetch, now = new Date() } = {}) {
  const st = getSetting(db, 'global', 'explore.radar', { at: null, list: [] });
  if (st.at && now - Date.parse(st.at) < 20 * 3600e3) return st.list;
  const found = new Map();
  for (const [id, label] of Object.entries(SCREENS)) {
    try {
      const r = await fetchImpl(`https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${id}&count=25`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const q = (await r.json())?.finance?.result?.[0]?.quotes || [];
      for (const x of q) {
        // Solo empresas de verdad: más de US$2 mil millones, precio de 5 dólares o más y que se negocien mucho (no centavos)
        if (!TICKER.test(x.symbol || '') || x.quoteType !== 'EQUITY' || (x.marketCap || 0) < 2e9 || (x.regularMarketPrice || 0) < 5 || (x.averageDailyVolume3Month || 0) < 5e5) continue;
        if (!found.has(x.symbol)) found.set(x.symbol, { symbol: x.symbol, why: `Apareció en la lista de Yahoo "${label}"`, name: x.shortName || x.longName || null });
      }
    } catch { /* si Yahoo no responde, se intenta mañana */ }
  }
  const list = [...found.values()].slice(0, 40);
  setSetting(db, 'global', 'explore.radar', { at: now.toISOString(), list: list.length ? list : st.list });
  return list.length ? list : st.list;
}

/** Rarezas en el precio que la gente suele pasar por alto (no son promesas; se prueban como todo lo demás). */
export function rareza(bars, spy = []) {
  const c = bars.map(b => b.close), n = c.length;
  if (n < 260) return [];
  const tags = [], last = c[n - 1];
  const hi = Math.max(...c.slice(-252));
  if (last / hi >= 0.97) tags.push({ id: 'cerca_maximo', text: `Está a menos de 3% de su precio más alto del año. Muchos piensan "ya subió mucho", pero los estudios muestran que las que están ahí suelen seguir mejor que el resto.` });
  const months = Array.from({ length: 12 }, (_, i) => c[n - 1 - i * 21] / c[n - 1 - (i + 1) * 21] - 1);
  const up = months.filter(x => x > 0).length;
  if (up >= 9) tags.push({ id: 'constante', text: `Subió en ${up} de los últimos 12 meses: crece parejo, sin grandes sustos.` });
  const daily = c.slice(-253).map((x, i, a) => (i ? x / a[i - 1] - 1 : 0)).slice(1), vol = sd(daily) * Math.sqrt(252);
  const mom = c[n - 22] / c[n - 253] - 1; // del año, sin contar el último mes (la medida que usan los estudios)
  const sMap = new Map(spy.map(b => [b.ts, b.close])), s1 = sMap.get(bars[n - 22]?.ts), s0 = sMap.get(bars[n - 253]?.ts);
  const beat = s0 && s1 ? mom - (s1 / s0 - 1) : null;
  if (beat != null && beat > 0.10 && vol < 0.30) tags.push({ id: 'fuerza_silenciosa', text: `Le ganó al mercado por ${Math.round(beat * 100)}% en el último año sin moverse mucho (se mueve ${Math.round(vol * 100)}% al año).` });
  const c3 = n >= 756 ? c[n - 756] : null;
  if (last / hi <= 0.75 && c3 && last / c3 >= 1.3) tags.push({ id: 'caida_rara', text: `Bajó ${Math.round((1 - last / hi) * 100)}% desde su máximo del año, pero en 3 años sigue ${Math.round((last / c3 - 1) * 100)}% arriba: puede ser oportunidad… o trampa. JARVIS la vigila.` });
  return tags;
}

/** Guarda una joya encontrada (las 2+ rarezas a la vez) y lo anuncia. */
export function noteGem(db, { symbol, tags, conv, light, source }) {
  const list = getSetting(db, 'global', 'explore.gems', []).filter(g => g.symbol !== symbol);
  const isNew = !getSetting(db, 'global', 'explore.gems', []).some(g => g.symbol === symbol);
  list.push({ symbol, tags, conv, light, source, about: HIDDEN[symbol] || null, at: nowIso() });
  setSetting(db, 'global', 'explore.gems', list.slice(-30));
  if (isNew) activity(db, { agent: 'largo', type: 'explorar', important: true, text: `💎 Joya poco conocida: ${symbol}${HIDDEN[symbol] ? ` (${HIDDEN[symbol]})` : ''}. ${tags.map(t => t.text.split('.')[0]).join(' · ')}. Conveniencia ${conv}/100; JARVIS la sigue probando antes de recomendarla.` });
}
export const gems = db => getSetting(db, 'global', 'explore.gems', []).slice().reverse();
