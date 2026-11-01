// Base de datos SQLite integrada en Node, con migraciones que nunca borran datos.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MIGRATIONS = [
  {
    id: 1,
    name: 'base',
    sql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL,
  ai_daily_cap_usd REAL NOT NULL DEFAULT 0.2, ai_monthly_cap_usd REAL NOT NULL DEFAULT 3
);
CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE settings (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (scope, key));
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, user_id INTEGER, kind TEXT NOT NULL, ref TEXT,
  payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL UNIQUE
);
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT, 'el registro sellado no se puede modificar'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT, 'el registro sellado no se puede borrar'); END;
CREATE TABLE jobs (
  key TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE audit (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, user_id INTEGER, action TEXT NOT NULL, detail TEXT);
CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, user_id INTEGER, provider TEXT NOT NULL, model TEXT NOT NULL,
  task TEXT NOT NULL, in_tokens INTEGER NOT NULL, out_tokens INTEGER NOT NULL, cost_usd REAL NOT NULL, ok INTEGER NOT NULL
);

-- Loterías
CREATE TABLE lottery_observations (
  id INTEGER PRIMARY KEY, game TEXT NOT NULL, date TEXT NOT NULL, source TEXT NOT NULL,
  nums TEXT NOT NULL, fetched_at TEXT NOT NULL, UNIQUE (game, date, source)
);
CREATE TABLE lottery_draws (
  id INTEGER PRIMARY KEY, game TEXT NOT NULL, date TEXT NOT NULL, nums TEXT, status TEXT NOT NULL,
  sources TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (game, date)
);
CREATE TABLE lottery_plays (
  id INTEGER PRIMARY KEY, user_id INTEGER, agent TEXT, game TEXT NOT NULL, date TEXT NOT NULL,
  kind TEXT NOT NULL, numbers TEXT NOT NULL, stake REAL NOT NULL, payouts TEXT NOT NULL,
  method TEXT NOT NULL, method_version INTEGER NOT NULL, purpose TEXT NOT NULL DEFAULT 'control',
  sealed_at TEXT NOT NULL, ledger_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  prize REAL, settled_at TEXT
);
CREATE INDEX lottery_plays_draw ON lottery_plays (game, date);

-- Bolsa
CREATE TABLE stock_bars (
  symbol TEXT NOT NULL, interval TEXT NOT NULL, ts TEXT NOT NULL, open REAL NOT NULL, high REAL NOT NULL,
  low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, interval, ts)
);
CREATE TABLE stock_quotes (
  symbol TEXT PRIMARY KEY, price REAL NOT NULL, prev_close REAL, as_of TEXT NOT NULL, kind TEXT NOT NULL,
  source TEXT NOT NULL, fetched_at TEXT NOT NULL
);
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY, owner TEXT NOT NULL, user_id INTEGER, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
  start_cash REAL NOT NULL, created_at TEXT NOT NULL, UNIQUE (owner, name)
);
CREATE TABLE trades (
  id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), symbol TEXT NOT NULL, side TEXT NOT NULL,
  qty REAL NOT NULL, observed_price REAL NOT NULL, observed_at TEXT NOT NULL, exec_price REAL NOT NULL, fee REAL NOT NULL,
  ts TEXT NOT NULL, strategy_id INTEGER, strategy_version INTEGER, reason TEXT, ledger_hash TEXT NOT NULL
);

-- Motor
CREATE TABLE strategies (
  id INTEGER PRIMARY KEY, module TEXT NOT NULL, family TEXT NOT NULL, params TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'en_desarrollo', agent TEXT, created_at TEXT NOT NULL, notes TEXT,
  UNIQUE (module, family, params)
);
CREATE TABLE strategy_status_log (id INTEGER PRIMARY KEY, strategy_id INTEGER NOT NULL, ts TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, reason TEXT NOT NULL);
CREATE TABLE experiments (
  id INTEGER PRIMARY KEY, strategy_id INTEGER NOT NULL, kind TEXT NOT NULL, plan TEXT NOT NULL, preregistered_at TEXT NOT NULL,
  ledger_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierto', result TEXT, decided_at TEXT
);
CREATE TABLE predictions (
  id INTEGER PRIMARY KEY, module TEXT NOT NULL, strategy_id INTEGER, agent TEXT, subject TEXT NOT NULL,
  payload TEXT NOT NULL, prob REAL, sealed_at TEXT NOT NULL, ledger_hash TEXT NOT NULL,
  resolved_at TEXT, outcome TEXT, correct INTEGER
);
CREATE TABLE agenda (
  id INTEGER PRIMARY KEY, module TEXT NOT NULL, family TEXT NOT NULL, title TEXT NOT NULL, params TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'activa', source TEXT NOT NULL DEFAULT 'semilla', created_at TEXT NOT NULL,
  UNIQUE (module, family, params)
);
CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, style TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'activo', created_at TEXT NOT NULL);
CREATE TABLE coins (
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, agent TEXT, strategy_id INTEGER, amount REAL NOT NULL, reason TEXT NOT NULL,
  ref TEXT, revoked INTEGER NOT NULL DEFAULT 0, revoked_reason TEXT
);
CREATE TABLE cheat_reports (
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, agent TEXT, strategy_id INTEGER, ref TEXT, rule TEXT NOT NULL,
  explanation TEXT NOT NULL, coins_removed REAL NOT NULL DEFAULT 0
);

-- Investigación y recomendaciones (compartidas)
CREATE TABLE news (
  id INTEGER PRIMARY KEY, url TEXT UNIQUE NOT NULL, title TEXT NOT NULL, source TEXT NOT NULL, published_at TEXT,
  fetched_at TEXT NOT NULL, summary TEXT, symbols TEXT NOT NULL DEFAULT '[]', polemic INTEGER NOT NULL DEFAULT 0,
  escalated INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE fundamentals (symbol TEXT NOT NULL, metric TEXT NOT NULL, period TEXT NOT NULL, value REAL NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (symbol, metric, period));
CREATE TABLE debates (id INTEGER PRIMARY KEY, subject TEXT NOT NULL, created_at TEXT NOT NULL, rounds TEXT NOT NULL, verdict TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, ledger_hash TEXT NOT NULL);
CREATE TABLE recommendations (
  id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, created_at TEXT NOT NULL, light TEXT NOT NULL, confidence REAL NOT NULL,
  payload TEXT NOT NULL, debate_id INTEGER, ledger_hash TEXT NOT NULL
);
CREATE TABLE comments (id INTEGER PRIMARY KEY, subject TEXT NOT NULL, user_id INTEGER NOT NULL, ts TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE watchlist (user_id INTEGER NOT NULL, symbol TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (user_id, symbol));
`,
  },
  {
    id: 2,
    name: 'actividad_en_vivo',
    sql: `
CREATE TABLE activity (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, agent TEXT, type TEXT NOT NULL, text TEXT NOT NULL, progress REAL, important INTEGER NOT NULL DEFAULT 0);
CREATE INDEX activity_ts ON activity (ts);
`,
  },
  {
    id: 3,
    name: 'analisis_e_historial',
    sql: `
CREATE TABLE analyses (
  id INTEGER PRIMARY KEY, subject TEXT NOT NULL, module TEXT NOT NULL, created_at TEXT NOT NULL, inputs_hash TEXT NOT NULL,
  payload TEXT NOT NULL, ledger_hash TEXT NOT NULL, narrative TEXT, narrative_by TEXT, narrative_at TEXT
);
CREATE INDEX analyses_subject ON analyses (subject, id);
CREATE TABLE profiles (subject TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE real_entries (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, ts TEXT NOT NULL, module TEXT NOT NULL, detail TEXT NOT NULL,
  prediction_id INTEGER, note TEXT, ledger_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierta', result REAL, closed_at TEXT
);
CREATE INDEX predictions_module ON predictions (module, correct);
`,
  },
  {
    id: 4,
    name: 'mapa_de_oportunidades',
    sql: `
CREATE TABLE map_entries (
  symbol TEXT PRIMARY KEY, zone TEXT NOT NULL, conv REAL, light TEXT, prob REAL, since TEXT NOT NULL, checked_at TEXT NOT NULL,
  reds INTEGER NOT NULL DEFAULT 0, card TEXT, note TEXT
);
CREATE TABLE map_moves (
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, symbol TEXT NOT NULL, from_zone TEXT, to_zone TEXT NOT NULL, reason TEXT NOT NULL, ledger_hash TEXT NOT NULL
);
CREATE TRIGGER map_moves_no_update BEFORE UPDATE ON map_moves BEGIN SELECT RAISE(ABORT, 'los movimientos del mapa no se pueden modificar'); END;
CREATE TRIGGER map_moves_no_delete BEFORE DELETE ON map_moves BEGIN SELECT RAISE(ABORT, 'los movimientos del mapa no se pueden borrar'); END;
`,
  },
  {
    id: 5,
    name: 'usuarios_y_perfiles',
    sql: `
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE activity ADD COLUMN user_id INTEGER;
CREATE INDEX activity_user ON activity (user_id, id);
`,
  },
  {
    id: 6,
    name: 'potenciador_ia',
    sql: `
ALTER TABLE users ADD COLUMN ai_extra_usd REAL NOT NULL DEFAULT 0;
CREATE TABLE credit_requests (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  pack_name TEXT NOT NULL, price TEXT NOT NULL, credits INTEGER NOT NULL, reference TEXT, note TEXT, receipt_ext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente', decided_at TEXT, decided_by INTEGER, admin_note TEXT
);
CREATE INDEX credit_requests_user ON credit_requests (user_id, status);
`,
  },
  {
    id: 7,
    name: 'usuarios_en_linea',
    sql: `ALTER TABLE users ADD COLUMN last_seen_at TEXT;`,
  },
];

/** Registra lo que JARVIS está haciendo (para el Modo TV y el panel). Guarda solo los últimos 5,000 eventos. */
/** Actividad: sin userId la ven todos (el núcleo central); con userId solo esa persona (por ejemplo, avisos de su dinero real). */
export function activity(db, { agent = null, type = 'info', text, progress = null, important = false, userId = null }) {
  db.prepare('INSERT INTO activity (ts, agent, type, text, progress, important, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), agent, type, text, progress, important ? 1 : 0, userId);
  db.prepare('DELETE FROM activity WHERE id <= (SELECT MAX(id) - 5000 FROM activity)').run();
}

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migración ${m.id} (${m.name}) falló; no se cambió nada: ${err.message}`);
    }
  }
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const nowIso = () => new Date().toISOString();

export function getSetting(db, scope, key, fallback) {
  const r = db.prepare('SELECT value FROM settings WHERE scope = ? AND key = ?').get(scope, key);
  return r ? JSON.parse(r.value) : fallback;
}
export function setSetting(db, scope, key, value) {
  db.prepare('INSERT INTO settings (scope, key, value) VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value')
    .run(scope, key, JSON.stringify(value));
}
export function audit(db, userId, action, detail) {
  db.prepare('INSERT INTO audit (ts, user_id, action, detail) VALUES (?, ?, ?, ?)').run(nowIso(), userId ?? null, action, detail ? JSON.stringify(detail) : null);
}
