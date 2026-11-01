// Registro sellado: cada entrada guarda la huella de la anterior. Cambiar algo rompe la cadena.
import { canonical, sha256 } from './util.js';

const GENESIS = '0'.repeat(64);

export function seal(db, { kind, ref = null, userId = null, payload, ts = new Date().toISOString() }) {
  const last = db.prepare('SELECT hash FROM ledger ORDER BY id DESC LIMIT 1').get();
  const prev = last ? last.hash : GENESIS;
  const body = canonical(payload);
  const hash = sha256(prev + '|' + ts + '|' + kind + '|' + (ref ?? '') + '|' + (userId ?? '') + '|' + body);
  db.prepare('INSERT INTO ledger (ts, user_id, kind, ref, payload, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ts, userId, kind, ref, body, prev, hash);
  return { hash, ts };
}

/** Recorre toda la cadena y dice si está intacta y, si no, dónde se rompe. */
export function verifyLedger(db) {
  let prev = GENESIS, n = 0;
  for (const r of db.prepare('SELECT * FROM ledger ORDER BY id').iterate()) {
    const hash = sha256(prev + '|' + r.ts + '|' + r.kind + '|' + (r.ref ?? '') + '|' + (r.user_id ?? '') + '|' + r.payload);
    if (r.prev_hash !== prev || r.hash !== hash) return { ok: false, brokenAt: r.id, checked: n };
    prev = r.hash; n++;
  }
  return { ok: true, checked: n };
}

export function getSealed(db, hash) {
  const r = db.prepare('SELECT * FROM ledger WHERE hash = ?').get(hash);
  return r ? { ...r, payload: JSON.parse(r.payload) } : null;
}
