// Yahoo Finance: respaldo NO oficial (sin API pública garantizada). Sus datos se marcan como tales.
export async function dailyBars(symbol, { range = '5y', fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=div,split`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo respondió ${res.status}`);
  const r = (await res.json()).chart?.result?.[0];
  if (!r) throw new Error('Yahoo no devolvió datos para ' + symbol);
  const q = r.indicators.quote[0], adj = r.indicators.adjclose?.[0]?.adjclose;
  const bars = r.timestamp.map((t, i) => {
    const f = adj && q.close[i] ? adj[i] / q.close[i] : 1; // ajusta por dividendos y divisiones
    return { ts: new Date(t * 1000).toISOString().slice(0, 10), open: q.open[i] * f, high: q.high[i] * f, low: q.low[i] * f, close: q.close[i] * f, volume: q.volume[i] };
  }).filter(b => [b.open, b.high, b.low, b.close].every(Number.isFinite));
  // Cierre de AYER (no el de hace 5 años: "chartPreviousClose" es el cierre antes del rango pedido)
  const raw = r.timestamp.map((t, i) => ({ d: new Date(t * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(x => Number.isFinite(x.c));
  const mDay = new Date(r.meta.regularMarketTime * 1000).toISOString().slice(0, 10), n = raw.length - 1;
  const prevClose = r.meta.previousClose ?? r.meta.regularMarketPreviousClose ?? (n >= 0 ? (raw[n].d === mDay ? raw[n - 1]?.c : raw[n].c) : null) ?? (range === '1d' || range === '5d' ? r.meta.chartPreviousClose : null);
  return { source: 'yahoo-no-oficial', bars, quote: { symbol, price: r.meta.regularMarketPrice, prevClose, asOf: new Date(r.meta.regularMarketTime * 1000).toISOString(), kind: 'retrasado', source: 'yahoo-no-oficial' } };
}
