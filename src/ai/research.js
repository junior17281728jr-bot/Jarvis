// Investigador de noticias en inglés: fuentes gratuitas, resumen en español con el modelo gratis,
// detección de polémicas, y solo lo grave pasa a la IA de pago para confirmar.
import { complete } from './providers.js';
import { nowIso } from '../core/db.js';

export const FEEDS = sym => [
  { source: 'Yahoo Finance (RSS)', url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US` },
  { source: 'Google News (RSS)', url: `https://news.google.com/rss/search?q=${encodeURIComponent(sym + ' stock')}&hl=en-US&gl=US&ceid=US:en` },
];

const POLEMIC = [
  [/fraud|accounting irregular|restat/i, 3, 'posible fraude contable'], [/sec (probe|investigation|charges)|doj|indict/i, 3, 'investigación del gobierno'],
  [/lawsuit|sued|class action|antitrust/i, 2, 'demanda o antimonopolio'], [/recall|safety probe/i, 2, 'retiro de productos'],
  [/bankrupt|chapter 11|default/i, 3, 'riesgo de quiebra'], [/layoff|job cuts/i, 1, 'despidos'], [/downgrade/i, 1, 'baja de calificación'],
  [/data breach|hack/i, 2, 'filtración de datos'], [/ceo (resign|steps down|fired)/i, 2, 'salida del director'], [/sanction|tariff|ban/i, 1, 'riesgo político o comercial'],
];
export function polemicLevel(title) {
  let lvl = 0; const tags = [];
  for (const [re, w, tag] of POLEMIC) if (re.test(title)) { lvl = Math.max(lvl, w); tags.push(tag); }
  return { level: lvl, tags };
}

export function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = t => (m[1].match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1]?.trim();
    const title = get('title'), link = get('link');
    if (title && link) items.push({ title: title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), link, pubDate: get('pubDate') || null });
  }
  return items;
}

export async function collectNews(db, cfg, symbol, { fetchImpl = fetch, max = 10 } = {}) {
  const saved = [];
  for (const f of FEEDS(symbol)) {
    try {
      const res = await fetchImpl(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (JARVIS investigacion personal)' } });
      if (!res.ok) continue;
      for (const it of parseRss(await res.text()).slice(0, max)) {
        const pol = polemicLevel(it.title);
        const r = db.prepare(`INSERT OR IGNORE INTO news (url, title, source, published_at, fetched_at, symbols, polemic) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(it.link, it.title, f.source, it.pubDate ? new Date(it.pubDate).toISOString() : null, nowIso(), JSON.stringify([symbol]), pol.level);
        if (r.changes) saved.push({ ...it, polemic: pol });
      }
    } catch { /* la fuente queda marcada como caída en el estado */ }
  }
  return saved;
}

/** El modelo gratis resume en español; lo grave (nivel 3 o repetido) se manda a confirmar con la IA de pago. */
export async function digestNews(db, cfg, { limit = 20, fetchImpl } = {}) {
  const rows = db.prepare('SELECT * FROM news WHERE summary IS NULL ORDER BY fetched_at DESC LIMIT ?').all(limit);
  let done = 0, escalated = 0;
  for (const n of rows) {
    const r = await complete(db, cfg, { task: 'resumen_noticia', system: 'Resume titulares financieros en español sencillo (máximo 25 palabras). No inventes datos que no estén en el titular.', prompt: n.title, maxTokens: 80, prefer: 'local', only: 'ollama', fetchImpl });
    const summary = r.ok ? r.text.trim() : null;
    let verified = 0, esc = 0;
    if (n.polemic >= 3) {
      const v = await complete(db, cfg, { task: 'confirmar_polemica', system: 'Evalúas si un titular describe un hecho grave confirmado o un rumor. Responde JSON {"confirmado":true|false,"explicacion":"..."} usando solo el titular y la fuente.', prompt: `Fuente: ${n.source}\nTitular: ${n.title}`, json: true, maxTokens: 120, prefer: 'paid', only: 'openai', fetchImpl });
      esc = 1; escalated++;
      if (v.ok && v.json?.confirmado) verified = 1;
    }
    db.prepare('UPDATE news SET summary = ?, escalated = ?, verified = ? WHERE id = ?').run(summary ?? `(sin resumen: ${r.reason?.slice(0, 80) || 'IA no disponible'})`, esc, verified, n.id);
    done++;
  }
  return { done, escalated };
}

export function openPolemics(db, symbol, days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return db.prepare("SELECT title, source, url, polemic, verified, published_at FROM news WHERE symbols LIKE ? AND polemic >= 2 AND fetched_at >= ? ORDER BY polemic DESC").all(`%"${symbol}"%`, since);
}
