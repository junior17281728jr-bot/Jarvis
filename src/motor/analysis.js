// Análisis profundo: junta todo lo que JARVIS sabe de una opción, lo compara con las demás, estima escenarios,
// lista riesgos y fuentes, y responde en lenguaje simple por qué recomienda (o no) esa opción.
// Cada análisis se sella cuando cambian sus datos, para poder ver cómo evolucionó en el tiempo.
import { nowIso, getSetting } from '../core/db.js';
import { seal } from '../core/ledger.js';
import { round, sha256, canonical, sd } from '../core/util.js';
import { getBars, getQuote, quoteStatus } from '../stocks/market.js';
import { factsFor } from '../stocks/collector.js';
import { scoreSymbol, project } from '../stocks/advice.js';
import { openPolemics } from '../ai/research.js';
import { latestRanking, trackRecord } from './recommend.js';
import { probBeat, calibrateLight, recommendedAmount, HORIZON, agentLabel } from './track.js';
import { complete } from '../ai/providers.js';
import { GAMES } from '../lottery/games.js';
import { history } from '../lottery/results.js';
import { frequencies, scan } from '../lottery/stats.js';
import { compareMethods } from '../lottery/simulator.js';
import { pickOfTheDay, liveMethodStats } from './lottery-agent.js';
import { timeToProfit, CASH_STEPS, humanDays } from '../stocks/timing.js';
import { getBudget } from './sizing.js';
import { expectedReturn, winProbability, DEFAULT_PAYOUTS } from '../lottery/payouts.js';

// ---------- Perfil e imagen (Wikipedia, gratis y con enlace a la fuente) ----------
const WIKI = { AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'Nvidia', AMZN: 'Amazon', GOOGL: 'Alphabet_Inc.', META: 'Meta_Platforms', TSLA: 'Tesla,_Inc.', JPM: 'JPMorgan_Chase',
  KO: 'The_Coca-Cola_Company', JNJ: 'Johnson_&_Johnson', V: 'Visa_Inc.', WMT: 'Walmart', COST: 'Costco', XOM: 'ExxonMobil', SPY: 'SPDR_S&P_500_ETF_Trust', QQQ: 'Invesco_QQQ' };
export async function fetchProfile(db, symbol, fetchImpl = fetch) {
  const row = db.prepare('SELECT payload, fetched_at FROM profiles WHERE subject = ?').get(symbol);
  if (row && Date.now() - Date.parse(row.fetched_at) < 30 * 864e5) return JSON.parse(row.payload);
  const title = WIKI[symbol] || symbol;
  for (const lang of ['es', 'en']) {
    try {
      const res = await fetchImpl(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { 'User-Agent': 'JARVIS investigacion personal' } });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.type === 'disambiguation' || !j.extract) continue;
      const p = { name: j.title, description: j.description || null, extract: j.extract.slice(0, 600), image: j.thumbnail?.source || null, url: j.content_urls?.desktop?.page, source: `Wikipedia (${lang})` };
      db.prepare('INSERT INTO profiles (subject, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(subject) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at').run(symbol, JSON.stringify(p), nowIso());
      return p;
    } catch { /* se intenta la otra */ }
  }
  return row ? JSON.parse(row.payload) : null;
}
const cachedProfile = (db, s) => { const r = db.prepare('SELECT payload FROM profiles WHERE subject = ?').get(s); return r ? JSON.parse(r.payload) : null; };

// ---------- Utilidades ----------
const ret = (b, n) => (b.length > n ? b.at(-1).close / b.at(-1 - n).close - 1 : null);
const sma = (b, n) => (b.length >= n ? b.slice(-n).reduce((s, x) => s + x.close, 0) / n : null);
function maxDrawdown(b) { let peak = -Infinity, dd = 0; for (const x of b) { peak = Math.max(peak, x.close); dd = Math.min(dd, x.close / peak - 1); } return dd; }
const pct = (x, d = 1) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${round(x * 100, d)}%`);

function storeAnalysis(db, subject, module, payload, inputs) {
  const h = sha256(canonical(inputs));
  const last = db.prepare('SELECT * FROM analyses WHERE subject = ? ORDER BY id DESC LIMIT 1').get(subject);
  if (last && last.inputs_hash === h) return { ...JSON.parse(last.payload), id: last.id, createdAt: last.created_at, narrative: last.narrative, narrativeBy: last.narrative_by, previous: null };
  const s = seal(db, { kind: 'analisis', ref: subject, payload: { subject, inputs, conclusion: payload.conclusion } });
  const info = db.prepare('INSERT INTO analyses (subject, module, created_at, inputs_hash, payload, ledger_hash) VALUES (?, ?, ?, ?, ?, ?)').run(subject, module, s.ts, h, JSON.stringify(payload), s.hash);
  return { ...payload, id: Number(info.lastInsertRowid), createdAt: s.ts, narrative: null, previous: last ? JSON.parse(last.payload) : null, previousAt: last?.created_at || null };
}

/** Qué cambió desde el análisis anterior (análisis en tiempo real). */
function changes(cur, prev) {
  if (!prev) return [];
  const out = [];
  if (prev.price?.value && cur.price?.value) { const d = cur.price.value / prev.price.value - 1; if (Math.abs(d) >= 0.005) out.push(`Precio ${d > 0 ? 'subió' : 'bajó'} ${round(Math.abs(d) * 100, 1)}% (de US$${round(prev.price.value)} a US$${round(cur.price.value)}).`); }
  if (prev.light !== cur.light) out.push(`El semáforo cambió de ${prev.light} a ${cur.light}.`);
  if (prev.probBeat != null && Math.abs(cur.probBeat - prev.probBeat) >= 0.02) out.push(`La probabilidad estimada pasó de ${round(prev.probBeat * 100)}% a ${round(cur.probBeat * 100)}%.`);
  const pn = new Set((prev.news || []).map(n => n.url)), fresh = (cur.news || []).filter(n => !pn.has(n.url));
  if (fresh.length) out.push(`${fresh.length} noticia(s) nueva(s)${fresh.some(n => n.polemic >= 2) ? ', con al menos una polémica' : ''}.`);
  return out;
}

// ---------- Análisis de una acción ----------
export function stockAnalysis(db, symbol, { now = new Date() } = {}) {
  symbol = symbol.toUpperCase();
  const bars = getBars(db, symbol), spy = getBars(db, 'SPY');
  if (bars.length < 130) return { symbol, empty: true, message: 'Todavía no hay suficientes precios de esta acción (hacen falta unos 6 meses).' };
  const pol = openPolemics(db, symbol), facts = factsFor(db, symbol), track = trackRecord(db, symbol);
  const npol = pol.filter(p => p.polemic >= 2).length;
  const raw = scoreSymbol({ symbol, bars, bench: spy, facts, polemics: npol, track });
  const pb = probBeat(db, raw.score), card = calibrateLight(raw, pb, { polemics: npol }), amount = recommendedAmount(card.light, { budgetUsd: getBudget(db).usd });
  const q = getQuote(db, symbol), qs = quoteStatus(q, now);
  const price = q ? { value: q.price, asOf: q.as_of, source: q.source, status: qs.label } : { value: bars.at(-1).close, asOf: bars.at(-1).ts, source: bars.at(-1).source, status: 'cierre' };
  const periods = [['1 mes', 21], ['3 meses', 63], ['6 meses', 126], ['1 año', 252]].map(([label, n]) => ({ label, stock: ret(bars, n), market: ret(spy, n) }));
  const daily = bars.slice(-253).map((b, i, a) => (i ? b.close / a[i - 1].close - 1 : 0)).slice(1);
  const vol = sd(daily) * Math.sqrt(252), dd = maxDrawdown(bars.slice(-252));
  const s50 = sma(bars, 50), s200 = sma(bars, 200), last = bars.at(-1).close;
  const scen = [['1 mes', 21], ['6 meses', 126], ['1 año', 252]].map(([label, days]) => { const p = project(bars, 100, { days, sims: 1500 }); return p && { label, bad: p.bad / 100, probable: p.probable / 100, good: p.good / 100, lossChance: p.lossChance }; }).filter(Boolean);
  const series = metric => facts.filter(f => f.metric === metric).sort((a, b) => (a.period < b.period ? -1 : 1)).map(f => ({ period: f.period, value: f.value }));
  const news = db.prepare('SELECT title, source, url, published_at, summary, polemic, verified FROM news WHERE symbols LIKE ? ORDER BY fetched_at DESC LIMIT 8').all(`%"${symbol}"%`);
  const timing = timeToProfit(bars, spy);

  // Comparación con las demás opciones del día
  const rank = latestRanking(db);
  const compare = rank.slice(0, 6).map(c => ({ symbol: c.symbol, light: c.light, probBeat: c.probBeat ?? probBeat(db, c.score).p, score: c.score, probable6m: c.projection?.ejemplo ? c.projection.ejemplo.probable / 200 : null, lossChance: c.projection?.ejemplo?.lossChance ?? null, current: c.symbol === symbol }));
  if (!compare.some(c => c.current)) compare.push({ symbol, light: card.light, probBeat: pb.p, score: card.score, probable6m: scen[1]?.probable ?? null, lossChance: scen[1]?.lossChance ?? null, current: true });
  const better = compare.filter(c => !c.current && c.probBeat > pb.p + 0.02 && c.light !== 'rojo').sort((a, b) => b.probBeat - a.probBeat)[0];

  // Debate y opiniones de cada IA
  const deb = db.prepare('SELECT id, created_at, rounds, verdict FROM debates WHERE subject = ? ORDER BY id DESC LIMIT 1').get(symbol);
  // La opinión más reciente de cada IA (las anteriores siguen en el Historial, sin borrarse)
  const seenAg = new Set();
  const opinions = db.prepare("SELECT agent, subject, payload, correct, sealed_at FROM predictions WHERE module = 'ia_opinion' AND subject LIKE ? ORDER BY substr(subject, -10) DESC, id DESC").all(`ia:%:${symbol}:%`)
    .filter(o => !seenAg.has(o.agent) && seenAg.add(o.agent))
    .map(o => { const p = JSON.parse(o.payload); return { agent: agentLabel(o.agent), stance: p.stance, probBeat: p.probBeat, argument: p.argument, correct: o.correct, at: o.sealed_at, date: o.subject.slice(-10) }; });
  const iaTrack = db.prepare("SELECT agent, COUNT(*) n, SUM(correct) hits FROM predictions WHERE module = 'ia_opinion' AND correct IS NOT NULL GROUP BY agent").all()
    .map(r => ({ agent: agentLabel(r.agent), n: r.n, hitRate: round(r.hits / r.n * 100, 1) }));

  // Historial de JARVIS con esta acción (para marcar en el gráfico)
  const past = db.prepare("SELECT payload, correct, outcome, sealed_at FROM predictions WHERE module = 'ranking' AND subject LIKE ? ORDER BY sealed_at").all(`ranking:${symbol}:%`)
    .map(r => { const p = JSON.parse(r.payload); return { date: p.startDate, light: p.light, correct: r.correct, excess: r.outcome ? JSON.parse(r.outcome).excess : null }; });

  // Riesgos y qué podría hacer fallar la predicción
  const risks = [];
  if (vol > 0.4) risks.push({ level: 'alto', text: `Sube y baja mucho (${round(vol * 100)}% al año): una mala semana puede borrar meses de ganancia.` });
  else if (vol > 0.25) risks.push({ level: 'medio', text: `Volatilidad moderada (${round(vol * 100)}% al año).` });
  if (dd < -0.25) risks.push({ level: 'alto', text: `En el último año llegó a caer ${round(-dd * 100)}% desde su punto más alto.` });
  if (pol.length) risks.push({ level: pol.some(p => p.polemic >= 3) ? 'alto' : 'medio', text: `${pol.length} polémica(s) en noticias recientes: ${pol[0].title}` });
  if (s50 && last > s50 * 1.12) risks.push({ level: 'medio', text: `El precio está ${round((last / s50 - 1) * 100)}% por encima de su promedio de 50 días: podría corregir.` });
  if (track.wins + track.losses < 10) risks.push({ level: 'medio', text: `JARVIS solo tiene ${track.wins + track.losses} casos calificados con esta acción: su historial todavía no prueba nada.` });
  if (!facts.length) risks.push({ level: 'bajo', text: 'No hay informes oficiales cargados (puede ser un fondo o faltar la conexión con la SEC).' });
  risks.push({ level: 'medio', text: 'Noticias inesperadas (resultados trimestrales, crisis, decisiones de la Reserva Federal) pueden mover el precio en cualquier dirección.' });
  const failIf = [
    `El precio cae 8% desde la entrada (salida recomendada).`,
    s50 ? `El precio baja de su promedio de 50 días (US$${round(s50)}): la tendencia se rompe.` : null,
    'Aparece una polémica grave (fraude, investigación del gobierno, quiebra).',
    `En ${HORIZON} días de bolsa le va peor que al SPY: la predicción queda como fallo en el historial.`,
  ].filter(Boolean);

  // Fuentes, cada una con su tipo
  const sources = [
    { label: `Precio y su hora (${price.source})`, url: `https://finance.yahoo.com/quote/${symbol}`, kind: 'dato', at: price.asOf },
    { label: 'Historial de precios diarios', url: `https://finance.yahoo.com/quote/${symbol}/history`, kind: 'dato', at: bars.at(-1).ts },
    ...(facts.length ? [{ label: 'Informes anuales 10-K (SEC EDGAR)', url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${symbol}&type=10-K`, kind: 'dato', at: facts[0]?.fetched_at }] : []),
    ...news.slice(0, 5).map(n => ({ label: `${n.title} (${n.source})`, url: n.url, kind: n.verified ? 'dato' : 'noticia', at: n.published_at })),
    { label: `Probabilidad ${pb.method === 'calibrado' ? `ajustada con ${pb.n} casos reales` : 'del modelo inicial (35%–65%)'}`, url: null, kind: 'estimacion' },
    { label: 'Escenarios futuros: remuestreo de 3 años de movimientos reales', url: null, kind: 'estimacion' },
    ...(timing ? [{ label: `Tiempo para ver ganancia: medido con ${timing.basedOn}`, url: `https://finance.yahoo.com/quote/${symbol}/history`, kind: 'estimacion' }] : []),
    { label: 'Liquidación T+1: el dinero de una venta se liquida al día hábil siguiente (SEC, desde el 28/05/2024)', url: CASH_STEPS[3].url, kind: 'dato' },
    ...(opinions.length ? [{ label: 'Opiniones de las IA en el debate', url: null, kind: 'opinion' }] : []),
  ];
  const profile = cachedProfile(db, symbol);
  if (profile?.url) sources.unshift({ label: `Qué es ${profile.name} (${profile.source})`, url: profile.url, kind: 'dato' });

  // Razones ordenadas por cuánto empujaron la decisión: en contra primero si es rojo, a favor primero si no
  const contrib = Object.fromEntries(card.contributions.map(c => [c.factor, c.contribution]));
  const sign = card.light === 'rojo' ? 1 : -1, w = r => (r.factor === 'calibracion' ? -999 : sign * (contrib[r.factor] ?? 0));
  const ordered = card.reasons.slice().sort((a, b) => w(a) - w(b));
  const against = ordered.filter(r => r.factor === 'calibracion' || (contrib[r.factor] ?? 0) < 0), favor = card.reasons.filter(r => (contrib[r.factor] ?? 0) > 0).sort((a, b) => contrib[b.factor] - contrib[a.factor]);
  const topReasons = ordered.slice(0, 3).map(r => r.text);
  const verdictWord = card.light === 'verde' ? 'Recomendada' : card.light === 'amarillo' ? 'Con dudas' : 'No recomendada';
  const conclusion = {
    headline: `${verdictWord}: ${symbol} ${card.light === 'rojo' ? 'probablemente NO le ganará' : 'tiene posibilidades de ganarle'} al mercado en ${HORIZON} días de bolsa.`,
    why: card.light === 'rojo'
      ? `Pesa más lo que está en contra: ${(against.length ? against : ordered).slice(0, 2).map(r => r.text).join(' ')}${favor.length ? ` A favor, pero no alcanza: ${favor[0].text}` : ''}`
      : `Lo que más pesa a favor: ${(favor.length ? favor : ordered).slice(0, 2).map(r => r.text).join(' ')}${against.length ? ` En contra: ${against[0].text}` : ''}`,
    evidence: [...new Set([...card.reasons.filter(r => r.factor !== 'calibracion').map(r => r.text), ...(track.wins + track.losses ? [] : ['Sin historial propio todavía con esta acción.'])])].slice(0, 5),
    chance: `${round(pb.p * 100)}% de probabilidad estimada de ganarle al SPY (${pb.method === 'calibrado' ? `ajustada con ${pb.n} casos reales` : 'modelo inicial; se ajusta con resultados reales'}). Confianza en el análisis: ${round(card.confidence * 100)}%.`,
    risks: risks.slice(0, 4).map(r => r.text),
    failIf,
    ias: opinions.length ? opinions.slice(0, 3).map(o => `${o.agent}: ${o.stance.replace('_', ' ')} (${o.probBeat != null ? round(o.probBeat * 100) + '%' : 's/p'}) — ${o.argument}`) : ['Todavía no hay debate de las IA sobre esta acción.'],
    best: better ? `Hoy ${better.symbol} parece más conveniente (${round(better.probBeat * 100)}% vs ${round(pb.p * 100)}%).` : card.light === 'rojo' ? 'Hoy es mejor no entrar; esperar también es una decisión.' : `Entre las opciones de hoy, ${symbol} está entre las más convenientes.`,
    when: timing ? [timing.summary, timing.targetLine, timing.recommended ? `Tiempo recomendado para dejarlo: ${timing.recommended.label} o más.` : 'Si entras, hazlo solo con dinero que no necesites en mucho tiempo.', 'Cuando vendes, el dinero se liquida al día hábil siguiente (regla T+1); pasarlo a tu banco depende de tu bróker.'].filter(Boolean) : ['Faltan precios para medir cuánto tarda en ganar.'],
    amount: amount ? `Monto sugerido: US$${amount} (dentro de tu límite de US$5–10).` : 'Monto sugerido: US$0 (no entrar por ahora).',
  };

  const payload = {
    module: 'bolsa', symbol, profile, price, light: card.light, score: card.score, confidence: card.confidence, probBeat: pb.p, probMethod: pb.method, probCases: pb.n, amountUsd: amount,
    contributions: card.contributions, reasons: card.reasons, periods, stats: { vol, maxDrawdown: dd, sma50: s50, sma200: s200, last }, scenarios: scen,
    fundamentals: { revenue: series('ingresos'), netIncome: series('ganancia_neta') }, news, compare, debate: deb ? { id: deb.id, at: deb.created_at, verdict: JSON.parse(deb.verdict), rounds: JSON.parse(deb.rounds) } : null,
    opinions, iaTrack, past, chart: bars.slice(-252).map(b => [b.ts, round(b.close, 2)]), benchChart: spy.slice(-252).map(b => [b.ts, round(b.close, 2)]),
    risks, failIf, sources, conclusion, horizonDays: HORIZON, timing, cashSteps: CASH_STEPS,
  };
  const inputs = { v: 2, symbol, last: round(last, 2), price: round(price.value, 2), light: card.light, score: round(card.score, 3), pb: pb.p, news: news.map(n => n.url), deb: deb?.id ?? null, op: opinions.length, past: past.length };
  const stored = storeAnalysis(db, `bolsa:${symbol}`, 'bolsa', payload, inputs);
  stored.changes = changes(stored, stored.previous);
  delete stored.previous;
  return stored;
}

// ---------- Análisis de una lotería ----------
export function lotteryAnalysis(db, game, { now = new Date() } = {}) {
  const g = GAMES[game];
  if (!g) throw new Error('Lotería desconocida.');
  const hist = history(db, game);
  if (hist.length < 10) return { game, empty: true, message: 'Hacen falta al menos 10 sorteos para analizar.' };
  const P = getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS);
  const pick = pickOfTheDay(db, game, { now });
  const f = frequencies(hist), exp = hist.length * 3 / 100;
  const num = pick.numbers[0];
  const appearances = hist.filter(d => d.nums.includes(num)).map(d => d.date);
  const sc = scan(hist, { sims: 400 }), cmp = compareMethods(hist, 'quiniela', { sims: 200, P }), live = liveMethodStats(db);
  const azar = live.find(m => m.method === 'azar');
  const probs = ['quiniela', 'pale', 'tripleta'].map(k => ({ kind: k, win: winProbability(k, P), per100: round(expectedReturn(k, P) * 100, 2) }));
  const top = Object.entries(f.total).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => ({ num: n, count: c }));
  const pickTrack = db.prepare("SELECT COUNT(*) n, SUM(correct) hits FROM predictions WHERE module = 'loteria' AND correct IS NOT NULL AND payload LIKE ?").get(`%"game":"${game}"%`);
  const sources = [
    ...['premios.do', 'nacionalloteria.com'].map(s => ({ label: `Resultados oficiales publicados (${s})`, url: s === 'premios.do' ? `https://premios.do` : 'https://www.nacionalloteria.com/republica-dominicana/', kind: 'dato' })),
    { label: 'Probabilidades exactas: cálculo con los 1,000,000 resultados posibles', url: null, kind: 'dato' },
    { label: `Pagos de banca usados (${P.q.join('/')} quiniela)`, url: null, kind: 'dato' },
    { label: 'Comparación con 200 jugadores al azar (simulación)', url: null, kind: 'estimacion' },
    { label: 'Plazo de 60 días para reclamar premios de la Loto de Leidsa (CDN, 2021)', url: 'https://cdn.com.do/economicas/ganadores-de-la-loto-tienen-60-dias-para-reclamar-el-premio-2/', kind: 'noticia' },
  ];
  const conclusion = {
    headline: `${g.name}: JARVIS no puede predecir el número; si el sorteo es justo, todos tienen la misma probabilidad.`,
    why: `Su número (${num}) sale del método "${pick.methodLabel}": ${pick.why} Esto no lo hace más probable.`,
    evidence: [`El ${num} salió ${f.total[num]} veces en ${hist.length} sorteos (lo esperado por azar es ${round(exp, 1)}).`, sc.verdict, cmp.verdict],
    chance: `Probabilidad exacta de que el ${num} salga en alguna posición: ${round(probs[0].win * 100, 2)}% (1 de cada ${Math.round(1 / probs[0].win)}). En vivo, este método acierta ${pickTrack.n ? `${pickTrack.hits || 0} de ${pickTrack.n}` : 'sin casos todavía'}.`,
    risks: [`De cada RD$100 apostados vuelven en promedio RD$${probs[0].per100} en quiniela, RD$${probs[1].per100} en palé y RD$${probs[2].per100} en tripleta.`, 'Las rachas y los números "calientes" no cambian la probabilidad del siguiente sorteo.'],
    failIf: ['Casi siempre: la probabilidad de no acertar es de 97%.'],
    ias: ['Las IA no opinan sobre números: sería inventar. Su trabajo aquí es vigilar trampas y medir métodos.'],
    best: sc.tests.some(t => t.anomaly) ? 'Hay una anomalía estadística para revisar; aun así, no es prueba de que se pueda ganar.' : 'Lo más conveniente para tu dinero es no apostar, o hacerlo solo como diversión con un monto que estés dispuesto a perder.',
    when: ['Sabes si ganaste el mismo día, cuando salen los números del sorteo.', 'Si ganas en una banca, cobras con el ticket en esa banca; guarda el ticket y pregunta el plazo para cobrar.', 'Para la Loto de Leidsa se ha publicado un plazo de 60 días para reclamar el premio.', 'A largo plazo no hay ganancia que esperar: cada RD$100 apostados devuelven en promedio RD$' + probs[0].per100 + '.'],
    amount: 'Monto sugerido: RD$0 (valor esperado negativo).',
  };
  const payload = {
    module: 'loteria', game, name: g.name, entity: g.entity, draws: hist.length, last: hist.slice(-10).reverse(), pick, number: { num, count: f.total[num], expected: round(exp, 1), gap: f.gaps[num], appearances: appearances.slice(-10).reverse() },
    freq: f.total, top, probs, scan: sc, compare: cmp, live, azarLive: azar?.per100 ?? null, pickTrack, sources, conclusion,
    risks: conclusion.risks.map(t => ({ level: 'alto', text: t })),
  };
  const stored = storeAnalysis(db, `loteria:${game}`, 'loteria', payload, { v: 2, game, draws: hist.length, last: hist.at(-1).date, num, method: pick.method });
  stored.changes = stored.previous && stored.previous.draws !== hist.length ? [`${hist.length - stored.previous.draws} sorteo(s) nuevo(s) desde el último análisis.`] : [];
  delete stored.previous;
  return stored;
}

// ---------- Explicación del analista (IA): solo con los datos del análisis ----------
export async function explainAnalysis(db, cfg, analysisId, { userId = null, fetchImpl } = {}) {
  const row = db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysisId);
  if (!row) throw new Error('No existe ese análisis.');
  if (row.narrative) return { text: row.narrative, by: row.narrative_by, cached: true };
  const a = JSON.parse(row.payload);
  const facts = a.module === 'bolsa'
    ? { opcion: a.symbol, semaforo: a.light, probabilidad: a.probBeat, conclusion: a.conclusion, periodos: a.periods, escenarios: a.scenarios, riesgos: a.risks.map(r => r.text), comparacion: a.compare, opinionesIA: a.opinions, fuentes: a.sources.map((s, i) => `[${i + 1}] ${s.label}`) }
    : { loteria: a.name, conclusion: a.conclusion, probabilidades: a.probs, vigilancia: a.scan.verdict, metodos: a.compare.verdict, fuentes: a.sources.map((s, i) => `[${i + 1}] ${s.label}`) };
  const r = await complete(db, cfg, { task: `explicar:${row.subject}`, userId, prefer: 'paid', maxTokens: 700, fetchImpl,
    system: 'Eres el analista de JARVIS. Explica en español muy sencillo, como a un amigo que no sabe de finanzas, en 6 a 9 frases cortas: qué se recomienda, por qué, qué tan probable es, qué riesgos hay y qué podría salir mal. Usa SOLO los datos dados; cita las fuentes con [n]; marca como "opinión" lo que no sea dato. Nunca prometas ganancias.',
    prompt: JSON.stringify(facts) });
  if (!r.ok) return { text: null, error: r.reason };
  db.prepare('UPDATE analyses SET narrative = ?, narrative_by = ?, narrative_at = ? WHERE id = ?').run(r.text, `${r.provider} (${r.model})`, nowIso(), analysisId);
  return { text: r.text, by: `${r.provider} (${r.model})`, cached: false };
}

export function analysisHistory(db, subject, limit = 20) {
  return db.prepare('SELECT id, created_at, payload FROM analyses WHERE subject = ? ORDER BY id DESC LIMIT ?').all(subject, limit)
    .map(r => { const p = JSON.parse(r.payload); return { id: r.id, at: r.created_at, light: p.light, probBeat: p.probBeat, price: p.price?.value, headline: p.conclusion?.headline }; });
}
