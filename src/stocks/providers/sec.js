// SEC EDGAR: datos oficiales y gratuitos de los informes financieros de empresas de EE. UU.
const METRICS = {
  ingresos: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
  ganancia_neta: ['NetIncomeLoss'],
  deuda_largo_plazo: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  efectivo: ['CashAndCashEquivalentsAtCarryingValue'],
  flujo_operativo: ['NetCashProvidedByUsedInOperatingActivities'],
  patrimonio: ['StockholdersEquity'],
};

let tickerMap = null;
export async function cikFor(symbol, ua, fetchImpl = fetch) {
  if (!tickerMap) {
    const res = await fetchImpl('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': ua } });
    if (!res.ok) throw new Error(`SEC respondió ${res.status}`);
    tickerMap = Object.fromEntries(Object.values(await res.json()).map(x => [x.ticker, String(x.cik_str).padStart(10, '0')]));
  }
  return tickerMap[symbol.toUpperCase()] || null;
}

/** Últimos valores anuales (10-K) de cada métrica, con su periodo y fuente. */
export async function companyFacts(symbol, ua, fetchImpl = fetch) {
  const cik = await cikFor(symbol, ua, fetchImpl);
  if (!cik) return { symbol, facts: [], note: 'No es una empresa registrada en la SEC (puede ser un fondo/ETF).' };
  const res = await fetchImpl(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`SEC respondió ${res.status}`);
  const gaap = (await res.json()).facts?.['us-gaap'] || {};
  const facts = [];
  for (const [metric, tags] of Object.entries(METRICS)) {
    for (const tag of tags) {
      const units = gaap[tag]?.units?.USD;
      if (!units) continue;
      const annual = units.filter(u => u.form === '10-K' && u.fp === 'FY').sort((a, b) => (a.end < b.end ? 1 : -1));
      const byYear = new Map();
      for (const u of annual) if (!byYear.has(u.fy)) byYear.set(u.fy, u);
      for (const u of [...byYear.values()].slice(0, 4)) facts.push({ metric, period: `FY${u.fy}`, end: u.end, value: u.val, source: `SEC EDGAR ${u.form} (${tag})` });
      break;
    }
  }
  // Ganancia por acción de cada trimestre (para ver si sorprendió contra el mismo trimestre del año pasado)
  const eps = gaap.EarningsPerShareDiluted?.units?.['USD/shares'] || gaap.EarningsPerShareBasic?.units?.['USD/shares'] || [];
  const byFrame = new Map();
  for (const u of eps) if (/^CY\d{4}Q[1-4]$/.test(u.frame || '') && !byFrame.has(u.frame)) byFrame.set(u.frame, u);
  for (const u of [...byFrame.values()].sort((a, b) => (a.frame < b.frame ? 1 : -1)).slice(0, 8))
    facts.push({ metric: 'bpa_trimestral', period: u.frame, end: u.end, value: u.val, source: `SEC EDGAR ${u.form} presentado ${u.filed}` });
  return { symbol, cik, facts };
}

/**
 * 👔 Lo que hacen los dueños: compras y ventas de directivos y consejeros con su propio dinero (Formulario 4).
 * La ley los obliga a publicarlo en 2 días. Las COMPRAS en la bolsa (código P) dicen más que las ventas
 * (venden por muchas razones: impuestos, casa, planes automáticos; compran por una sola: creen que va a subir).
 */
export async function insiderActivity(symbol, ua, { fetchImpl = fetch, days = 180, maxFilings = 25, pauseMs = 120, now = new Date() } = {}) {
  const cik = await cikFor(symbol, ua, fetchImpl);
  if (!cik) return { symbol, none: true };
  const res = await fetchImpl(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`SEC respondió ${res.status}`);
  const R = (await res.json()).filings?.recent || {};
  const since = new Date(now - days * 864e5).toISOString().slice(0, 10);
  const idx = (R.form || []).map((f, i) => i).filter(i => R.form[i] === '4' && R.filingDate[i] >= since).slice(0, maxFilings);
  const tx = [];
  for (const i of idx) {
    const acc = R.accessionNumber[i].replace(/-/g, ''), doc = String(R.primaryDocument[i] || '').replace(/^xsl[^/]+\//, '');
    try {
      const r = await fetchImpl(`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${doc}`, { headers: { 'User-Agent': ua } });
      if (r.ok) tx.push(...parseForm4(await r.text(), R.filingDate[i]));
    } catch { /* una que falle no frena las demás */ }
    if (pauseMs) await new Promise(ok => setTimeout(ok, pauseMs));
  }
  const buys = tx.filter(t => t.code === 'P'), sells = tx.filter(t => t.code === 'S');
  return { symbol, cik, days, filings: idx.length, buys, sells,
    buyUsd: Math.round(buys.reduce((s, t) => s + t.usd, 0)), sellUsd: Math.round(sells.reduce((s, t) => s + t.usd, 0)),
    buyers: new Set(buys.map(t => t.who)).size, sellers: new Set(sells.map(t => t.who)).size };
}

/** Lee un Formulario 4 (XML) y saca cada compra/venta de acciones comunes. */
export function parseForm4(xml, filed = null) {
  const tag = (s, t) => (s.match(new RegExp(`<${t}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${t}>`)) || [])[1] ?? null;
  const who = tag(xml, 'rptOwnerName') || 'Directivo';
  const title = tag(xml, 'officerTitle') || (tag(xml, 'isDirector') === '1' || tag(xml, 'isDirector') === 'true' ? 'Consejero' : '');
  const out = [];
  for (const m of xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g)) {
    const b = m[1], code = tag(b, 'transactionCode'), sh = Number(tag(b, 'transactionShares')), px = Number(tag(b, 'transactionPricePerShare'));
    if (!code || !(sh > 0)) continue;
    out.push({ who, title, code, shares: sh, price: px || 0, usd: sh * (px || 0), date: tag(b, 'transactionDate') || filed, filed });
  }
  return out;
}
