// Lectura de resultados desde páginas públicas. Las loterías no tienen API pública.
// Cada página se lee y se interpreta por separado; luego results.js compara las fuentes.
// IMPORTANTE: los lectores se validan contra la página real en el servidor (estado "por validar" hasta entonces).
import { recordObservation } from './results.js';
import { getSetting, setSetting } from '../core/db.js';

export const SOURCES = {
  'premios.do': {
    leidsa: 'https://premios.do/resultados-leidsa',
    nacional: 'https://premios.do/resultados-gana-mas',
    'nacional-noche': 'https://premios.do/resultados-nacional-noche',
    loteka: 'https://premios.do/resultados-loteka',
    real: 'https://premios.do/resultados-real',
  },
  'nacionalloteria.com': {
    leidsa: 'https://www.nacionalloteria.com/republica-dominicana/quiniela-leidsa.php',
    nacional: 'https://www.nacionalloteria.com/republica-dominicana/gana-mas.php',
    'nacional-noche': 'https://www.nacionalloteria.com/republica-dominicana/loteria-nacional.php',
    loteka: 'https://www.nacionalloteria.com/republica-dominicana/quiniela-loteka.php',
    real: 'https://www.nacionalloteria.com/republica-dominicana/quiniela-real.php',
  },
};

const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

/** Encuentra fechas y los tres números de dos dígitos que las siguen. */
export function parseResults(text, { maxGap = 220 } = {}) {
  const dateRe = new RegExp(
    String.raw`(\d{4})-(\d{2})-(\d{2})` + '|' +
    String.raw`(\d{1,2})[/-](\d{1,2})[/-](\d{4})` + '|' +
    String.raw`(\d{1,2})\s+de\s+(${Object.keys(MONTHS).join('|')})(?:\s+de|,)?\s+(\d{4})`, 'gi');
  const found = [];
  const all = [...text.matchAll(dateRe)];
  for (let i = 0; i < all.length; i++) {
    const m = all[i], end = m.index + m[0].length, stop = Math.min(end + maxGap, all[i + 1]?.index ?? Infinity);
    let y, mo, d;
    if (m[1]) [y, mo, d] = [m[1], m[2], m[3]].map(Number);
    else if (m[4]) [d, mo, y] = [m[4], m[5], m[6]].map(Number);
    else { d = Number(m[7]); mo = MONTHS[m[8].toLowerCase()]; y = Number(m[9]); }
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
    // Se quitan fechas cortas (02-11), horas (8:55), "sorteo 123", años y "1 de noviembre" antes de buscar los números:
    // si no, un "01" de una fecha se colaba como si fuera el primer número del sorteo.
    const after = text.slice(end, stop) // solo hasta la próxima fecha: así no se mezclan los números de otro día
      .replace(/\b\d{1,2}\s*[/.-]\s*\d{1,2}(\s*[/.-]\s*\d{2,4})?\b/g, ' ')
      .replace(/\b\d{1,2}:\d{2}(\s*[ap]\.?\s*m\.?)?/gi, ' ')
      .replace(/\b(sorteo|no\.?|n[úu]m(ero)?\.?|#|nro\.?)\s*:?\s*\d+/gi, ' ')
      .replace(new RegExp(String.raw`\b\d{1,2}\s+de\s+(${Object.keys(MONTHS).join('|')})`, 'gi'), ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ');
    // Los números del sorteo: tokens aislados de exactamente 2 dígitos (evita horas como 8:55 y años)
    const nums = [...after.matchAll(/(?<![\d:.,])(\d{2})(?![\d:.,])/g)].map(x => x[1]).slice(0, 3);
    if (nums.length === 3) found.push({ date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, nums });
  }
  const seen = new Set();
  return found.filter(r => (seen.has(r.date) ? false : seen.add(r.date)));
}

export async function fetchSource(source, game, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const url = SOURCES[source]?.[game];
  if (!url) return { source, game, ok: false, error: 'sin página configurada' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (JARVIS investigacion personal)' } });
    if (!res.ok) return { source, game, ok: false, error: `HTTP ${res.status}` };
    const rows = parseResults(htmlToText(await res.text()));
    return { source, game, ok: rows.length > 0, rows, error: rows.length ? null : 'no se encontraron resultados en la página' };
  } catch (e) {
    return { source, game, ok: false, error: e.name === 'AbortError' ? 'tiempo de espera agotado' : e.message };
  } finally { clearTimeout(timer); }
}

/** Lee todas las fuentes de todas las loterías y registra lo encontrado (últimos `days` días). */
export async function collectAll(db, { days = 7, fetchImpl, today } = {}) {
  const report = [];
  const min = new Date(Date.parse(today || new Date().toISOString().slice(0, 10)) - days * 864e5).toISOString().slice(0, 10);
  for (const source of Object.keys(SOURCES)) {
    for (const game of Object.keys(SOURCES[source])) {
      const r = await fetchSource(source, game, { fetchImpl });
      let saved = 0;
      if (r.ok) for (const row of r.rows) if (row.date >= min) { recordObservation(db, { game, date: row.date, source, nums: row.nums }); saved++; }
      report.push({ source, game, ok: r.ok, saved, error: r.error || null });
    }
  }
  return report;
}

/**
 * 📚 Historial de años: premios.do tiene una página por fecha (…-AAAA-MM-DD) con los ~15 sorteos anteriores.
 * Cada vuelta baja unas pocas páginas por lotería, hacia atrás, sin apurar a la página (pausa entre pedidos).
 * Se detiene en una lotería cuando encuentra 3 páginas seguidas que no existen (ahí empieza el archivo).
 */
export async function backfillHistory(db, { fetchImpl = fetch, pagesPerGame = 6, pauseMs = 800, today = new Date().toISOString().slice(0, 10) } = {}) {
  const st = getSetting(db, 'global', 'lottery.backfill', {});
  const out = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (const [game, base] of Object.entries(SOURCES['premios.do'])) {
    const g = (st[game] ||= { cursor: today, misses: 0, done: false, saved: 0, pages: 0, oldest: null });
    if (g.done) { out[game] = { done: true, saved: g.saved }; continue; }
    let saved = 0;
    for (let i = 0; i < pagesPerGame && !g.done; i++) {
      const url = `${base}-${g.cursor}`;
      let rows = [];
      try {
        const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (JARVIS investigacion personal)' } });
        if (res.status === 404) { g.misses++; if (g.misses >= 3) g.done = true; }
        else if (res.ok) { rows = parseResults(htmlToText(await res.text())); g.misses = 0; }
        else break; // la página falla: se intenta en la próxima vuelta
      } catch { break; }
      for (const r of rows) {
        if (r.date > g.cursor) continue; // solo lo de esa fecha hacia atrás
        try { const x = recordObservation(db, { game, date: r.date, source: 'premios.do', nums: r.nums }); if (!x?.skipped) saved++; } catch { /* números no válidos */ }
        if (!g.oldest || r.date < g.oldest) g.oldest = r.date;
      }
      g.pages++;
      // La próxima página: 14 días antes (cada página trae ~15 sorteos, así no queda ningún hueco)
      g.cursor = new Date(Date.parse(g.cursor) - 14 * 864e5).toISOString().slice(0, 10);
      if (pauseMs) await sleep(pauseMs);
    }
    g.saved += saved;
    out[game] = { saved, oldest: g.oldest, done: g.done };
  }
  setSetting(db, 'global', 'lottery.backfill', st);
  return out;
}
