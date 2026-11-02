// 📘 La memoria de JARVIS: un archivo pequeño (texto) con TODO lo que aprendió y por qué.
// Qué métodos usa, cómo los probó, cuáles descartó y por qué, cuánto acierta, qué hizo la IA y cuánto costó.
// Está escrito para que lo lea una persona y también otra IA en el futuro (así no empieza de cero).
// Solo usa datos reales guardados; nada inventado. No lleva datos personales (nombres, cédulas, pagos ni claves).
import { nowIso, getSetting } from './db.js';
import { FAMILIES, describe } from '../stocks/strategies.js';
import { CRITERIA } from '../motor/research.js';
import { METHODS } from '../lottery/methods.js';
import { DEFAULT_AGENTS } from '../motor/league.js';
import { ZONE_LABEL } from '../motor/map.js';
import { agentLabel } from '../motor/track.js';
import { SOURCES } from '../lottery/sources.js';

// Qué guarda cada parte de la base de datos (para que otra IA entienda el núcleo sin leer el código)
export const TABLE_DOCS = {
  ledger: 'Registro sellado en cadena (cada fila lleva la huella de la anterior): predicciones, operaciones, experimentos, firmas. No se puede cambiar ni borrar.',
  predictions: 'Cada voto/predicción sellada antes del resultado y luego resuelta (correct = 1 acierto, 0 fallo).',
  strategies: 'Ideas de bolsa (familia + parámetros), su estado y el agente dueño.',
  strategy_status_log: 'Historial de cada cambio de estado de una idea y el porqué.',
  experiments: 'Exámenes de cada idea: plan pre-registrado y resultado (entrenamiento y examen final).',
  agenda: 'Cola de ideas por probar: intentos, aprobadas y de dónde salió (libro o IA).',
  agents: 'Los agentes (largo plazo, corto plazo, polémicas, loterías).',
  coins: 'Monedas ganadas/perdidas por cada agente, con referencia a la operación o voto que las justifica.',
  cheat_reports: 'Trampas detectadas por el auditor y monedas quitadas.',
  trades: 'Operaciones con dinero virtual (precio observado, hora, costo, motivo).',
  accounts: 'Cuentas de dinero virtual (de cada usuario, de cada idea en prueba y de la cartera de la IA).',
  map_entries: 'Mapa de oportunidades: en qué zona está cada acción hoy.',
  map_moves: 'Historial de movimientos del mapa y su razón (no se puede borrar).',
  recommendations: 'Recomendaciones con semáforo, confianza y fuentes.',
  debates: 'Debates entre IA a favor y en contra.',
  analyses: 'Análisis completos de una acción con sus datos de entrada.',
  lottery_draws: 'Resultados oficiales de loterías (cruzados entre varias páginas).',
  lottery_observations: 'Lo que dijo cada página de resultados (para comparar fuentes).',
  lottery_plays: 'Jugadas de lotería selladas antes del sorteo y su resultado.',
  stock_bars: 'Precios diarios (se pueden volver a descargar; no van en la copia ligera).',
  fundamentals: 'Datos de las empresas (SEC).', news: 'Noticias leídas y polémicas detectadas.',
  ai_usage: 'Cada uso de IA: tarea, modelo, tokens y costo.', activity: 'Lo que JARVIS va haciendo (en vivo).',
  settings: 'Configuración y estados guardados (motor, mapa, lecciones, etc.).',
  users: 'Usuarios (no se copian a la memoria).',
};

const r1 = x => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);
const pct = (a, b) => (b ? r1(a / b * 100) : null);
const J = s => { try { return JSON.parse(s); } catch { return null; } };
const q = (db, sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
const one = (db, sql, ...a) => { try { return db.prepare(sql).get(...a) || {}; } catch { return {}; } };

export const PRINCIPLES = [
  'Dinero virtual siempre: precios y resultados reales, pero nunca se mueve dinero de verdad.',
  'Nunca inventar números: si un dato no existe, se dice "no lo sé".',
  'Toda predicción se sella (con hora y huella) ANTES de saber el resultado; después se compara con lo que pasó de verdad.',
  'Una idea de bolsa solo se usa si pasa dos exámenes: con años de precios (entrenamiento) y con precios que nunca vio (examen final), con exigencia extra por cada idea probada (corrección de pruebas múltiples).',
  'Después del examen se prueba en vivo con dinero virtual; si en vivo no le gana al mercado, se descarta aunque antes pareciera buena.',
  'La referencia es "comprar el mercado (SPY) y esperar". Si una idea no le gana a eso después de costes, no sirve.',
  'Loterías: si los sorteos son justos ningún número es más probable. Los métodos se miden contra el azar; se vigila si algún sorteo se comporta raro.',
  'Monedas: los agentes ganan monedas solo con aciertos verificados; un auditor revisa cada moneda y quita las conseguidas con trampa (precios viejos, datos del futuro, decisiones no selladas).',
  'La IA explica y propone, pero nunca decide sola ni pone números: JARVIS prueba con datos reales todo lo que la IA sugiere.',
  'Nunca prometer ganancias ni hablar de 100% de seguridad.',
];

/** Junta todo lo aprendido en un objeto. */
export function memoryData(db, { tasks = [], version = null } = {}) {
  const now = nowIso();
  const first = one(db, 'SELECT MIN(ts) t FROM ledger').t || now;
  const days = Math.max(0, Math.round((Date.parse(now) - Date.parse(first)) / 864e5));

  // ---------- Bolsa: ideas probadas ----------
  const strats = q(db, `SELECT s.id, s.family, s.params, s.status, s.agent, s.created_at,
      (SELECT result FROM experiments e WHERE e.strategy_id = s.id AND e.status = 'decidido' ORDER BY e.id DESC LIMIT 1) result
    FROM strategies s WHERE s.module = 'bolsa' ORDER BY s.id`).map(s => {
    const p = J(s.params) || {}, res = J(s.result) || {};
    return { id: s.id, familia: s.family, nombre: FAMILIES[s.family]?.label || s.family, regla: describe(s.family, p), parametros: p, agente: s.agent, estado: s.status, desde: s.created_at?.slice(0, 10),
      entrenamiento: res.train ? { extra_anual_pct: r1(res.train.annual * 100), t: r1(res.train.t), operaciones: res.train.trades } : null,
      examen_final: res.holdout ? { extra_anual_pct: r1(res.holdout.annual * 100), t: r1(res.holdout.t), operaciones: res.holdout.trades } : null };
  });
  const log = q(db, `SELECT l.strategy_id id, l.ts, l.from_status de, l.to_status a, l.reason FROM strategy_status_log l ORDER BY l.id`);
  const byStrat = {}; for (const l of log) (byStrat[l.id] ||= []).push({ fecha: l.ts.slice(0, 10), de: l.de, a: l.a, por_que: l.reason });
  const ACTIVE = ['en_prueba', 'en_evaluacion', 'validada'];
  const families = {};
  for (const s of strats) {
    const f = (families[s.familia] ||= { familia: s.familia, nombre: s.nombre, probadas: 0, pasaron_entrenamiento: 0, pasaron_examen: 0, validadas_en_vivo: 0, mejor_examen_pct: null });
    if (!s.entrenamiento) continue;
    f.probadas++;
    if (s.examen_final) f.pasaron_entrenamiento++;
    if (ACTIVE.includes(s.estado) || (byStrat[s.id] || []).some(x => x.a === 'en_prueba')) f.pasaron_examen++;
    if (s.estado === 'validada') f.validadas_en_vivo++;
    const best = s.examen_final?.extra_anual_pct ?? null;
    if (best != null && (f.mejor_examen_pct == null || best > f.mejor_examen_pct)) f.mejor_examen_pct = best;
  }
  const famList = Object.values(families).filter(f => f.probadas).sort((a, b) => b.pasaron_examen - a.pasaron_examen || (b.mejor_examen_pct ?? -99) - (a.mejor_examen_pct ?? -99));
  const activas = strats.filter(s => ACTIVE.includes(s.estado)).map(s => ({ ...s, historia: byStrat[s.id] || [] }));
  // "Lo que dejó de usar": estuvo en prueba o validada y después salió
  const abandonadas = strats.filter(s => !ACTIVE.includes(s.estado) && (byStrat[s.id] || []).some(x => ACTIVE.includes(x.a)))
    .map(s => { const h = byStrat[s.id] || []; const last = h[h.length - 1]; return { regla: s.regla, agente: s.agente, estado: s.estado, cuando: last?.fecha, por_que: last?.por_que, historia: h }; });
  const casi = strats.filter(s => s.estado === 'no_validada' && s.examen_final).sort((a, b) => (b.examen_final.t ?? -9) - (a.examen_final.t ?? -9)).slice(0, 10)
    .map(s => ({ regla: s.regla, entrenamiento: s.entrenamiento, examen_final: s.examen_final }));

  // ---------- Votos y aciertos ----------
  const votes = q(db, `SELECT module, agent, COUNT(*) n, SUM(CASE WHEN correct IS NOT NULL THEN 1 ELSE 0 END) resueltos, SUM(COALESCE(correct,0)) aciertos FROM predictions GROUP BY module, agent ORDER BY module, agent`)
    .map(v => ({ modulo: v.module, quien: agentLabel(v.agent), votos: v.n, resueltos: v.resueltos, aciertos: v.aciertos, acierto_pct: pct(v.aciertos, v.resueltos) }));
  const trend = q(db, `SELECT substr(sealed_at,1,7) mes, COUNT(*) n, SUM(correct) c FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL GROUP BY mes ORDER BY mes DESC LIMIT 12`)
    .reverse().map(m => ({ mes: m.mes, resueltos: m.n, acierto_pct: pct(m.c, m.n) }));
  const byLight = q(db, `SELECT json_extract(payload,'$.light') luz, COUNT(*) n, SUM(correct) c FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL GROUP BY luz`)
    .map(x => ({ semaforo: x.luz, resueltos: x.n, acierto_pct: pct(x.c, x.n) }));

  // ---------- Monedas y trampas ----------
  const coins = q(db, `SELECT a.id, a.name, COALESCE(SUM(CASE WHEN c.revoked = 0 THEN c.amount END),0) neto, COUNT(c.id) movimientos,
      COALESCE(SUM(CASE WHEN c.revoked = 0 AND c.amount > 0 THEN c.amount END),0) ganadas, COALESCE(SUM(CASE WHEN c.revoked = 0 AND c.amount < 0 THEN -c.amount END),0) perdidas
    FROM agents a LEFT JOIN coins c ON c.agent = a.id GROUP BY a.id ORDER BY neto DESC`).map(c => ({ agente: c.name, monedas: r1(c.neto), ganadas: r1(c.ganadas), perdidas: r1(c.perdidas), movimientos: c.movimientos }));
  const cheats = q(db, `SELECT rule, COUNT(*) n, MAX(explanation) ejemplo, SUM(coins_removed) quitadas FROM cheat_reports GROUP BY rule ORDER BY n DESC`).map(c => ({ regla: c.rule, veces: c.n, monedas_quitadas: r1(c.quitadas), ejemplo: c.ejemplo }));

  // ---------- Mapa y cartera de la IA ----------
  const zones = q(db, 'SELECT zone, COUNT(*) n, GROUP_CONCAT(symbol) s FROM map_entries GROUP BY zone').map(z => ({ zona: ZONE_LABEL[z.zone] || z.zone, cuantas: z.n, simbolos: z.zone === 'recomendada' || z.zone === 'observacion' ? String(z.s || '').split(',').slice(0, 20) : undefined }));
  const moves = q(db, `SELECT ts, symbol, from_zone, to_zone, reason FROM map_moves ORDER BY id DESC LIMIT 25`).map(m => ({ fecha: m.ts.slice(0, 10), simbolo: m.symbol, de: ZONE_LABEL[m.from_zone] || m.from_zone, a: ZONE_LABEL[m.to_zone] || m.to_zone, por_que: m.reason }));
  const iaAcc = one(db, "SELECT id, start_cash, created_at FROM accounts WHERE owner = 'jarvis:ia' LIMIT 1");
  const iaTrades = iaAcc.id ? one(db, "SELECT COUNT(*) n, SUM(CASE WHEN side = 'sell' THEN 1 ELSE 0 END) ventas FROM trades WHERE account_id = ?", iaAcc.id) : {};

  // ---------- Loterías ----------
  const lot = q(db, `SELECT method, COUNT(*) n, SUM(stake) apostado, SUM(COALESCE(prize,0)) cobrado, SUM(CASE WHEN status = 'gano' THEN 1 ELSE 0 END) ganadas
    FROM lottery_plays WHERE user_id IS NULL AND status != 'pending' GROUP BY method ORDER BY method`).map(m => ({ metodo: m.method, nombre: METHODS[m.method]?.label || m.method, idea: METHODS[m.method]?.why || '', jugadas: m.n, ganadas: m.ganadas, apostado_rd: r1(m.apostado), cobrado_rd: r1(m.cobrado), devuelve_por_cada_100: pct(m.cobrado, m.apostado) }));
  const scan = getSetting(db, 'global', 'lottery.lastScan', null);
  const draws = one(db, "SELECT COUNT(*) n, MIN(date) desde FROM lottery_draws WHERE nums IS NOT NULL");

  // ---------- Agenda de investigación ----------
  const agenda = q(db, `SELECT source, COUNT(*) ideas, SUM(tries) pruebas, SUM(wins) aprobadas FROM agenda GROUP BY source`).map(a => ({ origen: a.source === 'semilla' ? 'ideas de libro (profesionales)' : a.source === 'ia' ? 'propuestas por la IA' : a.source, ideas: a.ideas, pruebas: a.pruebas, aprobadas: a.aprobadas }));
  const aiStocks = (getSetting(db, 'global', 'explore.ai', []) || []).slice(-20).map(x => ({ simbolo: x.symbol, por_que_la_propuso: x.why, estado: x.status }));

  // ---------- Uso de la IA ----------
  const ai = q(db, `SELECT task, provider, model, COUNT(*) n, SUM(ok) ok, SUM(cost_usd) usd, SUM(in_tokens) tin, SUM(out_tokens) tout FROM ai_usage GROUP BY task, provider, model ORDER BY usd DESC LIMIT 40`)
    .map(a => ({ tarea: a.task, proveedor: a.provider, modelo: a.model, usos: a.n, salieron_bien: a.ok, costo_usd: Math.round((a.usd || 0) * 10000) / 10000, tokens_entrada: a.tin, tokens_salida: a.tout }));
  const aiTotal = one(db, 'SELECT COUNT(*) n, SUM(cost_usd) usd, MIN(ts) desde FROM ai_usage');

  // ---------- Decisiones importantes (sin datos personales) ----------
  const timeline = q(db, `SELECT ts, agent, type, text FROM activity WHERE important = 1 AND user_id IS NULL AND type NOT IN ('legal','pago','potenciador') ORDER BY id DESC LIMIT 120`)
    .reverse().map(a => ({ fecha: a.ts.slice(0, 16).replace('T', ' '), quien: a.agent || 'jarvis', que: a.text }));

  const data = {
    formato: 'memoria-jarvis/1', generado: now, version_programa: version, funcionando_desde: first.slice(0, 10), dias_de_experiencia: days,
    que_es: 'JARVIS: investigador autónomo de acciones de EE. UU. y loterías de República Dominicana. Trabaja 24/7 en un servidor, con dinero virtual y datos reales. Varios usuarios comparten un mismo núcleo (la investigación se hace una vez y sirve a todos). Creado por Junior.',
    principios: PRINCIPLES,
    como_trabaja: {
      agentes: DEFAULT_AGENTS.map(a => ({ id: a.id, nombre: a.name, area: a.role, ...(J(a.style) || {}) })),
      tareas: tasks.map(t => ({ tarea: t.name, cada_minutos: t.every, necesita_motor: t.needsMotor, ultima_vez: t.last?.at || null, ultima_bien: t.last ? t.last.ok !== false : null })),
      reglas_de_examen: { parte_final_guardada_para_examen: `${CRITERIA.holdoutFrac * 100}% de los años de precios`, t_minimo_entrenamiento: CRITERIA.trainMinT, operaciones_minimas: CRITERIA.minTrades, tasa_de_falsos_descubrimientos: CRITERIA.fdr, dias_minimos_en_vivo: CRITERIA.liveMinDays, operaciones_minimas_en_vivo: CRITERIA.liveMinTrades },
      cartera_ia: ['Compra sola lo que está en "Te recomiendo", 10% por idea, máximo 8 a la vez.', 'Vende si deja de estar recomendada o si baja 8%; espera 7 días para volver a comprarla.', 'Siempre deja al menos 10% en efectivo.'],
    },
    bolsa: {
      ideas_probadas: strats.filter(s => s.entrenamiento).length, activas,
      todas_las_ideas: strats.map(s => ({ regla: s.regla, familia: s.familia, parametros: s.parametros, agente: s.agente, estado: s.estado, desde: s.desde, entrenamiento: s.entrenamiento, examen_final: s.examen_final, historia: byStrat[s.id] || [] })), familias: famList, lo_que_dejo_de_usar: abandonadas, casi_pasaron: casi,
      mapa: { zonas: zones, ultimos_movimientos: moves },
      cartera_ia: iaAcc.id ? { desde: iaAcc.created_at?.slice(0, 10), dinero_inicial_usd: iaAcc.start_cash, operaciones: iaTrades.n || 0, ventas: iaTrades.ventas || 0 } : null,
      ideas_de_la_ia: aiStocks,
    },
    votos: { por_quien: votes, ranking_por_mes: trend, ranking_por_semaforo: byLight },
    monedas: { por_agente: coins, trampas_detectadas: cheats },
    loterias: { sorteos_guardados: draws.n || 0, desde: draws.desde || null, metodos: lot, ultima_vigilancia: scan ? { fecha: scan.at?.slice(0, 10), veredictos: scan.out } : null },
    investigacion: { agenda },
    ia: { usos: aiTotal.n || 0, costo_total_usd: Math.round((aiTotal.usd || 0) * 100) / 100, desde: aiTotal.desde?.slice(0, 10) || null, detalle: ai },
    decisiones_importantes: timeline,
  };
  // ---------- Formas viejas que sí sirven en casos específicos ----------
  const ctx = getSetting(db, 'global', 'lessons.contexts', null);
  data.casos_especificos = ctx ? { revisado: ctx.at?.slice(0, 10), ideas_revisadas: ctx.checkedStrategies, comparaciones: ctx.comparisons, pistas: ctx.findings || [], votos_por_situacion: ctx.votes || [] } : null;
  data.loterias.por_juego = q(db, `SELECT game, method, COUNT(*) n, SUM(stake) a, SUM(COALESCE(prize,0)) c FROM lottery_plays WHERE user_id IS NULL AND status != 'pending' GROUP BY game, method ORDER BY game, method`)
    .map(x => ({ juego: x.game, metodo: METHODS[x.method]?.label || x.method, jugadas: x.n, devuelve_por_cada_100: pct(x.c, x.a) }));
  data.base_de_datos = { motor: 'SQLite (un solo archivo)', tablas: q(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(t => ({ tabla: t.name, filas: one(db, `SELECT COUNT(*) n FROM "${t.name}"`).n ?? null, guarda: TABLE_DOCS[t.name] || '' })) };
  data.fuentes = {
    bolsa: ['Yahoo Finance (precios diarios, gratis)', 'Alpaca (precios en tiempo real, si hay clave)', 'SEC EDGAR (datos oficiales de las empresas)', 'Noticias públicas por empresa'],
    loterias: Object.keys(SOURCES).map(k => `${k} (${Object.keys(SOURCES[k]).join(', ')})`),
    regla: 'Un resultado de lotería se paga solo si dos fuentes coinciden (o queda marcado "1 fuente").',
  };
  const lw = getSetting(db, 'global', 'ranking.learnedWeights', null);
  data.senales_aprendidas = lw ? { revisado: lw.at?.slice(0, 10), votos_revisados: lw.cases, detalle: Object.values(lw.detail) } : null;
  data.lecciones = lessons(data);
  return data;
}

/** Lecciones en palabras simples, sacadas SOLO de los datos. */
export function lessons(d) {
  const L = [], b = d.bolsa;
  if (!b.ideas_probadas) L.push('Todavía no hay ideas de bolsa probadas: el motor de investigación no ha corrido lo suficiente.');
  else {
    const passed = b.familias.filter(f => f.pasaron_examen);
    L.push(`Probó ${b.ideas_probadas} ideas de bolsa con precios reales. ${passed.length ? `Las familias que pasaron el examen final: ${passed.map(f => `${f.nombre} (${f.pasaron_examen} de ${f.probadas})`).join(', ')}.` : 'Ninguna pasó todavía el examen final: hasta ahora, comprar el mercado (SPY) y esperar sigue siendo lo más difícil de superar.'}`);
    const bad = b.familias.filter(f => f.probadas >= 3 && !f.pasaron_entrenamiento);
    if (bad.length) L.push(`No vale la pena repetir sin datos nuevos: ${bad.map(f => `${f.nombre} (${f.probadas} intentos, ninguno pasó ni la primera prueba)`).join('; ')}.`);
    if (b.lo_que_dejo_de_usar.length) L.push(`Dejó de usar ${b.lo_que_dejo_de_usar.length} idea(s) que antes funcionaban; la razón de cada una está en "Lo que dejó de usar". Lo más común: en vivo no repitieron lo que mostraron con precios viejos.`);
    if (b.activas.length) L.push(`Ideas en uso ahora: ${b.activas.map(s => s.regla).join(' | ')}.`);
  }
  const rk = d.votos.por_quien.find(v => v.modulo === 'ranking');
  if (rk?.resueltos) L.push(`Sus votos de bolsa ("le ganará o no al mercado en 20 días") acertaron ${rk.acierto_pct}% de ${rk.resueltos} veces.${rk.resueltos < 100 ? ' Con menos de 100 casos todavía puede ser suerte.' : rk.acierto_pct > 55 ? ' Eso es mejor que tirar una moneda.' : ' Cerca de 50% significa que todavía no tiene ventaja clara.'}`);
  const tr = d.votos.ranking_por_mes;
  if (tr.length >= 3) { const a = tr.slice(0, Math.ceil(tr.length / 2)), z = tr.slice(Math.ceil(tr.length / 2)); const m = x => x.reduce((s, y) => s + (y.acierto_pct || 0), 0) / x.length; L.push(`Tendencia: el acierto pasó de ~${r1(m(a))}% (primeros meses) a ~${r1(m(z))}% (últimos meses).`); }
  for (const v of d.votos.por_quien.filter(v => v.modulo === 'ia_opinion' && v.resueltos >= 10)) L.push(`Opiniones de ${v.quien}: ${v.acierto_pct}% de acierto en ${v.resueltos} casos.`);
  const lot = d.loterias.metodos, az = lot.find(m => m.metodo === 'azar');
  if (lot.length) {
    const best = lot.slice().sort((a, b) => (b.devuelve_por_cada_100 ?? 0) - (a.devuelve_por_cada_100 ?? 0))[0];
    const n = lot.reduce((s, m) => s + m.jugadas, 0);
    L.push(`Loterías: ${n} jugadas de prueba. Por cada RD$100, el mejor método (${best.nombre}) devolvió RD$${best.devuelve_por_cada_100 ?? 0}${az ? ` y el azar puro RD$${az.devuelve_por_cada_100 ?? 0}` : ''}. ${n < 2000 ? 'Con tan pocas jugadas las diferencias son suerte.' : 'Ningún método se puede dar por ganador si no le saca ventaja clara al azar durante mucho tiempo.'}`);
  }
  const cx = d.casos_especificos;
  if (cx?.pistas?.length) L.push(`Formas viejas que sí sirven en casos específicos: ${cx.pistas.slice(0, 4).map(p => `"${p.regla}" ${p.donde} (+${p.extra_anual_pct}%/año)`).join('; ')}. Son pistas: hay que examinarlas como idea nueva antes de usarlas.`);
  else if (cx) L.push(`Revisó ${cx.ideas_revisadas} ideas descartadas en ${cx.comparaciones} situaciones distintas (mercado subiendo/bajando, calma/nervioso, cada acción) y ninguna funcionó de forma confiable en un caso específico.`);
  for (const v of cx?.votos_por_situacion || []) if (v.resueltos >= 30) L.push(`Votos ${v.situacion}: ${v.acierto_pct}% de acierto (${v.resueltos}).`);
  const ch = d.monedas.trampas_detectadas.reduce((s, c) => s + c.veces, 0);
  L.push(ch ? `El auditor detectó ${ch} trampa(s) y quitó esas monedas (ver "Trampas"). Regla: cada moneda necesita precio actual, decisión sellada antes y nada del futuro.` : 'El auditor no ha detectado trampas en las monedas.');
  if (d.ia.usos) L.push(`La IA se usó ${d.ia.usos} veces y costó US$${d.ia.costo_total_usd} en total. Sirve para explicar, resumir noticias, debatir y proponer empresas; los números siempre los calcula JARVIS.`);
  else L.push('La IA (ChatGPT) todavía no se ha usado: JARVIS funcionó solo con sus cálculos.');
  return L;
}

const esc = s => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const table = (rows, cols) => rows.length ? [`| ${cols.map(c => c[0]).join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map(r => `| ${cols.map(c => esc(typeof c[1] === 'function' ? c[1](r) : r[c[1]])).join(' | ')} |`)].join('\n') : '_(todavía no hay datos)_';

/** La memoria en texto (Markdown): fácil de leer y de pegar en cualquier IA. */
export function memoryMarkdown(d) {
  const b = d.bolsa, out = [];
  out.push(`# 📘 Memoria de JARVIS`, '', `Generada: ${d.generado.slice(0, 16).replace('T', ' ')} UTC · ${d.dias_de_experiencia} días de experiencia (desde ${d.funcionando_desde})${d.version_programa ? ` · versión ${d.version_programa}` : ''}`, '', `> ${d.que_es}`, '');
  out.push('## 🤖 Para la próxima IA (léelo primero)', '',
    'Este archivo resume la experiencia real de un sistema anterior. Úsalo así:',
    '1. Respeta los **principios** de abajo: son la razón de que los resultados sean confiables.',
    '2. Empieza por lo que **funcionó** (ideas activas y familias que pasaron el examen) y **no repitas** lo descartado sin datos nuevos.',
    '3. Mira "Lo que dejó de usar" para no caer en los mismos errores.',
    '4. Compara siempre contra la misma referencia (comprar el SPY y esperar; en loterías, el azar puro).',
    '5. Mira "Formas viejas que sí sirven en casos específicos": son pistas para probar como ideas nuevas.',
    '6. El archivo `JARVIS-memoria.json` tiene los mismos datos en formato para programas (o para entrenar/enseñar a otra IA).', '');
  out.push('## 💡 Lecciones aprendidas', '', ...d.lecciones.map(l => `- ${l}`), '');
  out.push('## 📜 Principios (reglas de la casa)', '', ...d.principios.map((p, i) => `${i + 1}. ${p}`), '');
  out.push('## ⚙️ Cómo trabaja', '', '### Agentes', '', table(d.como_trabaja.agentes, [['Agente', 'nombre'], ['Área', 'area'], ['Qué mira', r => r.mira || ''], ['Familias', r => (r.families || []).join(', ')]]), '');
  out.push('### Reglas del examen de ideas', '', ...Object.entries(d.como_trabaja.reglas_de_examen).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: **${v}**`), '');
  out.push('### Tareas automáticas', '', table(d.como_trabaja.tareas, [['Tarea', 'tarea'], ['Cada (min)', 'cada_minutos'], ['Necesita motor', r => (r.necesita_motor ? 'sí' : 'no')], ['Última vez', r => (r.ultima_vez || '').slice(0, 16)]]), '');
  out.push('## 📈 Bolsa', '', `Ideas probadas: **${b.ideas_probadas}**`, '', '### Ideas en uso ahora', '', table(b.activas, [['Regla', 'regla'], ['Agente', 'agente'], ['Estado', 'estado'], ['Examen final (extra/año)', r => (r.examen_final ? `${r.examen_final.extra_anual_pct}% (t=${r.examen_final.t})` : '—')]]), '');
  out.push('### Qué familias funcionan', '', table(b.familias, [['Familia', 'nombre'], ['Probadas', 'probadas'], ['Pasaron 1ª prueba', 'pasaron_entrenamiento'], ['Pasaron examen final', 'pasaron_examen'], ['Validadas en vivo', 'validadas_en_vivo'], ['Mejor examen (extra/año %)', 'mejor_examen_pct']]), '');
  out.push('### Lo que dejó de usar y por qué', '', b.lo_que_dejo_de_usar.length ? b.lo_que_dejo_de_usar.map(s => `- **${s.regla}** (${s.cuando || '—'}): ${s.por_que || ''}`).join('\n') : '_(nada todavía)_', '');
  out.push('### Las que casi pasan', '', table(b.casi_pasaron, [['Regla', 'regla'], ['Entrenamiento', r => (r.entrenamiento ? `${r.entrenamiento.extra_anual_pct}% t=${r.entrenamiento.t}` : '—')], ['Examen final', r => (r.examen_final ? `${r.examen_final.extra_anual_pct}% t=${r.examen_final.t}` : '—')]]), '');
  out.push('### Mapa de oportunidades', '', ...b.mapa.zonas.map(z => `- ${z.zona}: ${z.cuantas}${z.simbolos ? ` (${z.simbolos.join(', ')})` : ''}`), '', table(b.mapa.ultimos_movimientos.slice(0, 12), [['Fecha', 'fecha'], ['Acción', 'simbolo'], ['De', 'de'], ['A', 'a'], ['Por qué', 'por_que']]), '');
  if (b.ideas_de_la_ia.length) out.push('### Empresas que propuso la IA', '', table(b.ideas_de_la_ia, [['Símbolo', 'simbolo'], ['Por qué', 'por_que_la_propuso'], ['Estado', 'estado']]), '');
  const cx = d.casos_especificos;
  out.push('### 🔎 Formas viejas que sí sirven en casos específicos', '', cx ? `Revisado ${cx.revisado}: ${cx.ideas_revisadas} ideas descartadas, ${cx.comparaciones} comparaciones (con corrección por comparaciones múltiples y exigiendo que funcione en las dos mitades del tiempo).` : '_(todavía no se ha hecho la revisión semanal)_', '', cx ? table(cx.pistas, [['Regla', 'regla'], ['Dónde sí sirve', 'donde'], ['Días', 'dias'], ['Extra/año %', 'extra_anual_pct'], ['t', 't']]) : '', '');
  if (d.senales_aprendidas) out.push('### 🧠 Cuánto pesa cada señal (aprendido de los votos ya decididos)', '', table(d.senales_aprendidas.detalle, [['Señal', 'name'], ['Votos', 'n'], ['Acierto %', 'rawPct'], ['Peso base', 'base'], ['×', 'mult'], ['Peso actual', 'weight']]), '');
  out.push('## 🗳️ Votos y aciertos', '', table(d.votos.por_quien, [['Módulo', 'modulo'], ['Quién', 'quien'], ['Votos', 'votos'], ['Resueltos', 'resueltos'], ['Acierto %', 'acierto_pct']]), '', '### Acierto del ranking por mes', '', table(d.votos.ranking_por_mes, [['Mes', 'mes'], ['Resueltos', 'resueltos'], ['Acierto %', 'acierto_pct']]), '', '### Por semáforo', '', table(d.votos.ranking_por_semaforo, [['Semáforo', 'semaforo'], ['Resueltos', 'resueltos'], ['Acierto %', 'acierto_pct']]), '', '### Según la situación del mercado', '', table(cx?.votos_por_situacion || [], [['Situación', 'situacion'], ['Resueltos', 'resueltos'], ['Acierto %', 'acierto_pct']]), '');
  out.push('## 🪙 Monedas', '', table(d.monedas.por_agente, [['Agente', 'agente'], ['Monedas', 'monedas'], ['Ganadas', 'ganadas'], ['Perdidas', 'perdidas']]), '', '### Trampas', '', table(d.monedas.trampas_detectadas, [['Regla', 'regla'], ['Veces', 'veces'], ['Monedas quitadas', 'monedas_quitadas'], ['Ejemplo', 'ejemplo']]), '');
  out.push('## 🎱 Loterías', '', `Sorteos guardados: ${d.loterias.sorteos_guardados}${d.loterias.desde ? ` (desde ${d.loterias.desde})` : ''}`, '', table(d.loterias.metodos, [['Método', 'nombre'], ['Idea', 'idea'], ['Jugadas', 'jugadas'], ['Ganadas', 'ganadas'], ['Devuelve por cada RD$100', 'devuelve_por_cada_100']]), '');
  out.push('### Por juego', '', table(d.loterias.por_juego, [['Juego', 'juego'], ['Método', 'metodo'], ['Jugadas', 'jugadas'], ['Devuelve por cada RD$100', 'devuelve_por_cada_100']]), '');
  if (d.loterias.ultima_vigilancia) out.push(`Última vigilancia (${d.loterias.ultima_vigilancia.fecha}):`, '', ...Object.entries(d.loterias.ultima_vigilancia.veredictos || {}).map(([g, v]) => `- ${g}: ${v}`), '');
  out.push('## 🔬 De dónde salen las ideas', '', table(d.investigacion.agenda, [['Origen', 'origen'], ['Ideas', 'ideas'], ['Pruebas', 'pruebas'], ['Aprobadas', 'aprobadas']]), '');
  out.push('## ✨ Cómo se usó la IA', '', `Usos: ${d.ia.usos} · Costo total: US$${d.ia.costo_total_usd}${d.ia.desde ? ` · desde ${d.ia.desde}` : ''}`, '', table(d.ia.detalle, [['Tarea', 'tarea'], ['Proveedor', 'proveedor'], ['Modelo', 'modelo'], ['Usos', 'usos'], ['Bien', 'salieron_bien'], ['US$', 'costo_usd']]), '');
  out.push('## 🗓️ Decisiones importantes (de la más vieja a la más nueva)', '', d.decisiones_importantes.length ? d.decisiones_importantes.map(t => `- ${t.fecha} · ${t.quien}: ${t.que}`).join('\n') : '_(nada todavía)_', '');
  out.push('## 🗄️ Su base de datos (cómo guarda todo)', '', `Motor: ${d.base_de_datos.motor}.`, '', table(d.base_de_datos.tablas, [['Tabla', 'tabla'], ['Filas', 'filas'], ['Qué guarda', 'guarda']]), '');
  out.push('## 🌐 De dónde saca los datos', '', ...d.fuentes.bolsa.map(x => `- Bolsa: ${x}`), ...d.fuentes.loterias.map(x => `- Loterías: ${x}`), `- ${d.fuentes.regla}`, '');
  out.push('## 📚 Todas las ideas probadas (detalle)', '', table(b.todas_las_ideas.slice(-400), [['Regla', 'regla'], ['Agente', 'agente'], ['Estado', 'estado'], ['1ª prueba (extra/año, t)', r => (r.entrenamiento ? `${r.entrenamiento.extra_anual_pct}% · t=${r.entrenamiento.t}` : '—')], ['Examen final', r => (r.examen_final ? `${r.examen_final.extra_anual_pct}% · t=${r.examen_final.t}` : '—')], ['Último cambio', r => { const h = r.historia[r.historia.length - 1]; return h ? `${h.fecha}: ${h.por_que}` : ''; }]]), '');
  out.push('## 🛟 Cómo recuperar JARVIS completo', '',
    '1. Crea un servidor nuevo con el mismo programa (repositorio de GitHub de JARVIS).',
    '2. Entra como administrador → Ajustes → "El núcleo de JARVIS".',
    '3. Restaura el archivo `jarvis-nucleo-….jvbk` más nuevo de esta misma carpeta de Drive (o tócale "Traer la última copia desde Drive") con tu frase secreta.',
    '4. JARVIS vuelve con toda su experiencia. El historial de precios se vuelve a descargar solo en unas horas.', '');
  out.push('---', '_Sin datos personales: no incluye nombres de usuarios, cédulas, pagos, contraseñas ni claves._');
  return out.join('\n');
}

export function buildMemory(db, opts = {}) {
  const data = memoryData(db, opts);
  return { data, md: memoryMarkdown(data), json: JSON.stringify(data) };
}

/** Lo nuevo desde la última vez, para AGREGAR a la bitácora (nunca se borra). */
export function journalEntry(db, sinceIso = null) {
  const since = sinceIso || '1970-01-01', now = nowIso(), L = [];
  const d = new Date(now), DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  L.push('', `## ${now.slice(0, 10)} (${DAYS[d.getUTCDay()]})${sinceIso ? '' : ' — primera entrada: todo lo anterior'}`, '');
  const tot = one(db, "SELECT COUNT(*) n FROM experiments WHERE status = 'decidido'").n || 0;
  const rk = one(db, "SELECT COUNT(*) n, SUM(correct) c FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL");
  const coins = q(db, 'SELECT a.name, COALESCE(SUM(CASE WHEN c.revoked = 0 THEN c.amount END),0) w FROM agents a LEFT JOIN coins c ON c.agent = a.id GROUP BY a.id ORDER BY w DESC');
  L.push(`**Cómo va:** ${tot} ideas probadas en total · votos de bolsa: ${rk.n ? `${pct(rk.c, rk.n)}% de acierto en ${rk.n}` : 'todavía sin resolver'} · monedas: ${coins.map(c => `${c.name} ${r1(c.w)}`).join(', ')}`, '');
  const ch = q(db, `SELECT l.ts, l.from_status de, l.to_status a, l.reason, s.family, s.params FROM strategy_status_log l JOIN strategies s ON s.id = l.strategy_id WHERE l.ts > ? ORDER BY l.id LIMIT 300`, since);
  if (ch.length) L.push('### Ideas que cambiaron', '', ...ch.map(c => `- ${describe(c.family, J(c.params) || {})}: ${c.de || 'nueva'} → **${c.a}**. ${c.reason}`), '');
  const v = one(db, "SELECT COUNT(*) n, SUM(correct) c FROM predictions WHERE resolved_at > ? AND correct IS NOT NULL", since);
  if (v.n) L.push(`### Votos resueltos: ${v.c} aciertos de ${v.n}`, '', ...q(db, "SELECT module, agent, subject, correct FROM predictions WHERE resolved_at > ? AND correct IS NOT NULL ORDER BY resolved_at LIMIT 200", since).map(p => `- ${p.correct ? '✅' : '❌'} ${agentLabel(p.agent)} · ${p.subject.replace(/^[a-z_]+:/, '')}`), '');
  const mv = q(db, 'SELECT symbol, from_zone, to_zone, reason FROM map_moves WHERE ts > ? ORDER BY id LIMIT 100', since);
  if (mv.length) L.push('### Movimientos del mapa', '', ...mv.map(m => `- ${m.symbol}: ${ZONE_LABEL[m.from_zone] || m.from_zone || 'nueva'} → ${ZONE_LABEL[m.to_zone] || m.to_zone}. ${m.reason}`), '');
  const ctx = getSetting(db, 'global', 'lessons.contexts', null);
  if (ctx && ctx.at > since && ctx.findings?.length) L.push('### Pistas: formas viejas que sí sirven en casos específicos', '', ...ctx.findings.map(f => `- "${f.regla}" ${f.donde}: +${f.extra_anual_pct}%/año (${f.dias} días, t=${f.t})`), '');
  const ch2 = q(db, 'SELECT agent, rule, explanation FROM cheat_reports WHERE ts > ? ORDER BY id LIMIT 50', since);
  if (ch2.length) L.push('### Trampas detectadas', '', ...ch2.map(c => `- ${c.agent}: ${c.rule} — ${c.explanation}`), '');
  const ai = one(db, 'SELECT COUNT(*) n, SUM(cost_usd) usd FROM ai_usage WHERE ts > ?', since);
  if (ai.n) L.push(`### IA: ${ai.n} usos, US$${Math.round((ai.usd || 0) * 100) / 100}`, '');
  const act = q(db, `SELECT ts, agent, text FROM activity WHERE important = 1 AND user_id IS NULL AND type NOT IN ('legal','pago','potenciador') AND ts > ? ORDER BY id LIMIT 200`, since);
  if (act.length) L.push('### Decisiones importantes', '', ...act.map(a => `- ${a.ts.slice(11, 16)} · ${a.agent || 'jarvis'}: ${a.text}`), '');
  if (L.length <= 5) L.push('_Sin cambios importantes desde la última copia._', '');
  return L.join('\n');
}
