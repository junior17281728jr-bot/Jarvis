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
  return { symbol, cik, facts };
}
