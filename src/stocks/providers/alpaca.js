// Alpaca (cuenta gratuita de práctica): precios e historial. Solo datos; nunca se envían órdenes reales.
const DATA = 'https://data.alpaca.markets';

function headers(cfg) {
  if (!cfg.alpacaKey || !cfg.alpacaSecret) throw new Error('Faltan las claves de Alpaca en .env (ALPACA_KEY_ID y ALPACA_SECRET_KEY).');
  return { 'APCA-API-KEY-ID': cfg.alpacaKey, 'APCA-API-SECRET-KEY': cfg.alpacaSecret };
}

export async function dailyBars(cfg, symbol, { start, end, fetchImpl = fetch } = {}) {
  const out = [];
  let token = null;
  do {
    const q = new URLSearchParams({ symbols: symbol, timeframe: '1Day', start, ...(end ? { end } : {}), feed: 'iex', adjustment: 'all', limit: '10000', ...(token ? { page_token: token } : {}) });
    const res = await fetchImpl(`${DATA}/v2/stocks/bars?${q}`, { headers: headers(cfg) });
    if (!res.ok) throw new Error(`Alpaca respondió ${res.status}`);
    const j = await res.json();
    for (const b of j.bars?.[symbol] || []) out.push({ ts: b.t.slice(0, 10), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
    token = j.next_page_token;
  } while (token);
  return { source: 'alpaca-iex', bars: out };
}

export async function snapshots(cfg, symbols, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${DATA}/v2/stocks/snapshots?symbols=${symbols.join(',')}&feed=iex`, { headers: headers(cfg) });
  if (!res.ok) throw new Error(`Alpaca respondió ${res.status}`);
  const j = await res.json();
  return Object.entries(j).map(([symbol, s]) => ({
    symbol, price: s.latestTrade?.p ?? s.dailyBar?.c, prevClose: s.prevDailyBar?.c ?? null,
    asOf: s.latestTrade?.t ?? s.dailyBar?.t, kind: 'tiempo_real_iex', source: 'alpaca-iex',
  })).filter(q => q.price);
}
