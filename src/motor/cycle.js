// El ciclo de JARVIS. "Mantenimiento" corre siempre (resultados, pagos, copias). El "motor autónomo"
// (investigar, jugar, operar, debatir) corre cuando tú lo activas, por el tiempo que elijas.
import { getSetting, setSetting, activity, nowIso } from '../core/db.js';
import { backup } from '../core/jobs.js';
import { verifyLedger } from '../core/ledger.js';
import { rdDate } from '../core/util.js';
import { collectAll } from '../lottery/sources.js';
import { settlePending } from '../lottery/simulator.js';
import { scan } from '../lottery/stats.js';
import { history } from '../lottery/results.js';
import { GAMES } from '../lottery/games.js';
import { universe, updateSymbol, updateQuotes, updateFacts, BENCH } from '../stocks/collector.js';
import { marketOpen, nyParts } from '../stocks/market.js';
import { collectNews, digestNews } from '../ai/research.js';
import { ensureAgents } from './league.js';
import { seedAgenda, pickNext, runExperiment, proposeIdeas } from './research.js';
import { liveStep } from './live.js';
import { autoPlays, reviewEffort } from './lottery-agent.js';
import { buildRanking, resolveRanking, debateTop } from './recommend.js';
import { dailySummary } from './reports.js';
import { fetchProfile } from './analysis.js';
import { resolveLotteryPicks, settleRealLottery, resolveMarketPredictions } from './track.js';
import { pushImportant, sendPush } from '../core/notify.js';
import { offsiteBackup } from '../core/offsite.js';
import { driveBackup, driveLegal } from '../core/drive.js';
import { runContextScan } from './contexts.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { updateFx, updateCalendar } from './insights.js';
import { updateMap, exploreStep, watchRealPositions } from './map.js';
import { autopilotStep } from './autopilot.js';
import { planReminders, adminPendingReminder } from './credits.js';
import { suggestStocks } from '../ai/plus.js';
import { getProfile } from './profile.js';
import { setTradingDays } from '../stocks/market.js';

const MIN = 60e3;
// [nombre, cada cuánto (ms), ¿necesita el motor activo?, condición extra]
const TASKS = [
  ['loterias_resultados', 30 * MIN, false],
  ['loterias_liquidar', 10 * MIN, false],
  ['bolsa_precios', 15 * MIN, false, now => marketOpen(now)],
  ['bolsa_historial', 12 * 60 * MIN, false],
  ['copia', 24 * 60 * MIN, false],
  ['lecciones', 7 * 24 * 60 * MIN, false],
  ['drive', 24 * 60 * MIN, false, (now, cfg) => !!(cfg.driveUrl && cfg.driveToken)],
  ['avisos', 5 * MIN, false],
  ['tipo_cambio', 24 * 60 * MIN, false],
  ['calendario', 7 * 24 * 60 * MIN, false],
  ['perfiles', 7 * 24 * 60 * MIN, false],
  ['resumen_diario', 60 * MIN, false, (now, cfg) => rdDate(now).getUTCHours() === cfg.dailySummaryHourRd],
  ['fundamentales', 7 * 24 * 60 * MIN, true],
  ['noticias', 2 * 60 * MIN, true],
  ['investigacion', 10 * MIN, true],
  ['ideas_ia', 24 * 60 * MIN, true],
  ['loterias_jugadas', 30 * MIN, true],
  ['prueba_en_vivo', 15 * MIN, true, now => marketOpen(now)],
  ['cartera_ia', 60 * MIN, true, now => marketOpen(now)],
  ['ideas_acciones_ia', 7 * 24 * 60 * MIN, true],
  ['recordatorio_planes', 6 * 60 * MIN, false],
  ['explorar', 6 * 60 * MIN, true],
  ['ranking', 24 * 60 * MIN, true, now => { const p = nyParts(now); return p.h >= 17 || !marketOpen(now); }],
  ['debate', 7 * 24 * 60 * MIN, true],
  ['vigilancia_loterias', 24 * 60 * MIN, true],
];

export function motorState(db) {
  return getSetting(db, 'global', 'motor.state', { running: false, until: null, startedAt: null, pausedAt: null });
}
export function startMotor(db, hours) {
  const st = { running: true, startedAt: nowIso(), until: hours ? new Date(Date.now() + hours * 3600e3).toISOString() : null, pausedAt: null };
  setSetting(db, 'global', 'motor.state', st);
  activity(db, { type: 'motor', important: true, text: `Motor autónomo activado${hours ? ` por ${hours} horas` : ' sin límite de tiempo'}.` });
  return st;
}
export function pauseMotor(db) { const st = { ...motorState(db), running: false, pausedAt: nowIso() }; setSetting(db, 'global', 'motor.state', st); activity(db, { type: 'motor', text: 'Motor en pausa. Todo el progreso queda guardado.' }); return st; }
export function resumeMotor(db) { const st = { ...motorState(db), running: true, pausedAt: null }; setSetting(db, 'global', 'motor.state', st); activity(db, { type: 'motor', text: 'Motor reanudado donde iba.' }); return st; }
export function stopMotor(db) { const st = { running: false, until: null, startedAt: null, pausedAt: null }; setSetting(db, 'global', 'motor.state', st); activity(db, { type: 'motor', important: true, text: 'Motor detenido.' }); return st; }

async function runTask(name, db, cfg, now, fetchImpl) {
  const syms = universe(db);
  switch (name) {
    case 'loterias_resultados': { const r = await collectAll(db, { fetchImpl }); const ok = r.filter(x => x.ok).length; activity(db, { agent: 'loteria', type: 'datos', text: `Revisé ${r.length} páginas de resultados: ${ok} respondieron.` }); return { ok, total: r.length, failed: r.filter(x => !x.ok) }; }
    case 'loterias_liquidar': return { settled: settlePending(db), picks: resolveLotteryPicks(db), real: settleRealLottery(db) };
    case 'bolsa_precios': return { quotes: await updateQuotes(db, cfg, syms, { fetchImpl }) };
    case 'bolsa_historial': { const res = []; for (const s of syms) { try { res.push(await updateSymbol(db, cfg, s, { fetchImpl })); } catch (e) { res.push({ symbol: s, error: e.message }); } } activity(db, { type: 'datos', text: `Historial de precios actualizado: ${res.filter(r => !r.error).length} de ${syms.length} acciones.` }); return res; }
    case 'fundamentales': { const res = []; for (const s of syms) { try { res.push(await updateFacts(db, cfg, s, { fetchImpl })); } catch (e) { res.push({ symbol: s, error: e.message }); } } return res; }
    case 'noticias': { let n = 0; for (const s of syms.filter(x => x !== BENCH)) { activity(db, { agent: 'polemicas', type: 'noticias', text: `Leyendo noticias de ${s}…` }); n += (await collectNews(db, cfg, s, { fetchImpl })).length; } const d = await digestNews(db, cfg, { fetchImpl }); activity(db, { agent: 'polemicas', type: 'noticias', text: `${n} noticias nuevas; ${d.escalated} polémicas enviadas a confirmar con la IA de pago.`, important: d.escalated > 0 }); return { n, ...d }; }
    case 'investigacion': {
      const items = pickNext(db, 2), out = [];
      items.forEach((it, i) => { activity(db, { agent: it.agent, type: 'investigacion', progress: (i + 1) / items.length, text: `Probando: ${it.title}` }); out.push(runExperiment(db, it, { symbols: syms, bench: BENCH })); });
      for (const r of out) activity(db, { agent: r.agent, type: 'resultado', important: r.status === 'en_prueba', text: `${r.title} → ${r.status.replace('_', ' ')}. ${r.reason}` });
      return out.map(r => ({ id: r.strategyId, status: r.status }));
    }
    case 'ideas_ia': return proposeIdeas(db, cfg, { fetchImpl });
    case 'loterias_jugadas': return { sealed: autoPlays(db, { now }), effort: reviewEffort(db) };
    case 'prueba_en_vivo': return liveStep(db, { symbols: syms, now, bench: BENCH });
    case 'cartera_ia': return autopilotStep(db, { now });
    case 'recordatorio_planes': return { planes: planReminders(db), pendientes: adminPendingReminder(db) };
    case 'ideas_acciones_ia': { const adm = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get(); return suggestStocks(db, cfg, { fetchImpl, horizon: adm ? getProfile(db, adm.id).horizon : 'medio' }); }
    case 'ranking': { resolveRanking(db, BENCH); const cards = buildRanking(db, { symbols: syms, bench: BENCH }); return { cards: cards.length, moves: updateMap(db, cards) }; }
    case 'explorar': { const r = await exploreStep(db, cfg, { fetchImpl }); if (r.swap) activity(db, { agent: 'largo', type: 'mapa', important: true, text: r.swap.out ? `Mapa: entró ${r.swap.in} y salió ${r.swap.out} (llevaba mucho tiempo en "No te recomiendo").` : `Mapa: entró ${r.swap.in}.` }); return r; }
    case 'debate': return (await debateTop(db, cfg, { fetchImpl })).map(d => ({ symbol: d.symbol, light: d.verdict.light }));
    case 'vigilancia_loterias': {
      const out = {};
      for (const g of Object.keys(GAMES)) {
        const h = history(db, g);
        if (h.length < 10) continue;
        const s = scan(h, { label: GAMES[g].name, sims: 500 });
        out[g] = s.verdict;
        const alarm = s.tests.some(t => t.anomaly) || s.hotOutliers.length;
        activity(db, { agent: 'loteria', type: alarm ? 'alerta' : 'vigilancia', important: !!alarm, text: `${GAMES[g].name}: ${s.verdict}` });
      }
      setSetting(db, 'global', 'lottery.lastScan', { at: nowIso(), out });
      return out;
    }
    case 'copia': {
      const b = backup(db, cfg.backupDir); const v = verifyLedger(db);
      let off = { uploaded: false };
      try { off = await offsiteBackup(cfg, b.file); } catch (e) { off = { uploaded: false, reason: e.message }; }
      setSetting(db, 'global', 'backup.last', { at: nowIso(), bytes: b.bytes, verified: b.verified, offsite: off });
      activity(db, { type: 'sistema', text: `Copia de seguridad verificada (${Math.round(b.bytes / 1024)} KB)${off.uploaded ? ', cifrada y subida fuera del servidor' : ''}. Registro sellado: ${v.ok ? 'intacto' : 'ALTERADO'}.`, important: !v.ok });
      return { ...b, ledger: v, offsite: off };
    }
    case 'lecciones': return runContextScan(db, { symbols: syms, bench: BENCH });
    case 'drive': return runDrive(db, cfg, fetchImpl);
    case 'perfiles': { let n = 0; for (const s of syms) if (await fetchProfile(db, s, fetchImpl)) n++; return { profiles: n }; }
    case 'avisos': return { real: watchRealPositions(db), push: await pushImportant(db, cfg, fetchImpl) };
    case 'tipo_cambio': return updateFx(db, fetchImpl);
    case 'calendario': { const r = await updateCalendar(db, cfg, fetchImpl); setTradingDays(getSetting(db, 'global', 'market.tradingDays', null)?.days); return r; }
    case 'resumen_diario': {
      const s = dailySummary(db); setSetting(db, 'global', 'report.daily', { at: nowIso(), text: s });
      activity(db, { type: 'resumen', text: 'Resumen diario listo.' });
      try { await sendPush(cfg, { title: 'JARVIS: resumen del día', message: s, tags: ['sunrise'] }, fetchImpl); } catch { /* el resumen queda en la app */ }
      return { chars: s.length };
    }
  }
}

export const programVersion = cfg => { try { return readFileSync(join(dirname(cfg.dbPath), 'version.txt'), 'utf8').trim().slice(0, 7); } catch { return null; } };

/** Manda la memoria y el núcleo ligero a Google Drive y anota cómo salió. */
export async function runDrive(db, cfg, fetchImpl = fetch) {
  try {
    const r = await driveBackup(db, cfg, { fetchImpl, tasks: taskStatus(db), version: programVersion(cfg) });
    try { r.legal = await driveLegal(db, cfg, { fetchImpl }); } catch (e) { r.legal = { ok: false, error: e.message }; }
    setSetting(db, 'global', 'drive.last', { ok: true, ...r });
    activity(db, { type: 'sistema', text: `Copia en tu Google Drive lista: memoria (${Math.round(r.memoryBytes / 1024)} KB)${r.core ? ` y núcleo cifrado (${Math.round(r.core.bytes / 1024)} KB)` : ' (el núcleo completo no se mandó: falta la frase secreta)'}.` });
    return r;
  } catch (e) {
    setSetting(db, 'global', 'drive.last', { ok: false, error: e.message, at: nowIso() });
    throw e;
  }
}

/** Una vuelta del ciclo: ejecuta lo que toca según horarios y estado. Nunca se detiene por un error aislado. */
export async function runCycle(db, cfg, { now = new Date(), fetchImpl = fetch, force = [] } = {}) {
  ensureAgents(db); seedAgenda(db);
  const st = motorState(db);
  if (st.running && st.until && now > new Date(st.until)) { stopMotor(db); activity(db, { type: 'motor', text: 'Se cumplió el tiempo programado: motor detenido y progreso guardado.' }); }
  const running = motorState(db).running;
  const last = getSetting(db, 'global', 'motor.lastRun', {});
  const results = {};
  for (const [name, every, needsMotor, cond] of TASKS) {
    const due = force.includes(name) || ((!needsMotor || running) && (!last[name] || now - new Date(last[name].at) >= every) && (!cond || cond(now, cfg)));
    if (!due) continue;
    try {
      const r = await runTask(name, db, cfg, now, fetchImpl);
      last[name] = { at: now.toISOString(), ok: true };
      results[name] = { ok: true, r };
    } catch (e) {
      last[name] = { at: now.toISOString(), ok: false, error: e.message };
      results[name] = { ok: false, error: e.message };
      activity(db, { type: 'error', important: true, text: `Falló "${name.replace('_', ' ')}": ${e.message}. Lo reintento en la próxima vuelta.` });
    }
    setSetting(db, 'global', 'motor.lastRun', last);
  }
  setSetting(db, 'global', 'motor.heartbeat', now.toISOString());
  return results;
}

export function taskStatus(db) {
  const last = getSetting(db, 'global', 'motor.lastRun', {});
  return TASKS.map(([name, every, needsMotor]) => ({ name, every: every / MIN, needsMotor, last: last[name] || null }));
}
