// Avisos al celular con ntfy (gratis, sin cuenta): instalas la app "ntfy", te suscribes a tu tema secreto y listo.
// Solo se avisa lo que importa: oportunidades, trampas, anomalías, errores y el resumen diario.
import { getSetting, setSetting } from './db.js';

export async function sendPush(cfg, { title, message, priority = 3, tags = [] }, fetchImpl = fetch) {
  if (!cfg.ntfyTopic) return { ok: false, reason: 'sin tema de avisos configurado' };
  const res = await fetchImpl(`${cfg.ntfyServer}/${encodeURIComponent(cfg.ntfyTopic)}`, {
    method: 'POST', body: message.slice(0, 3800),
    headers: { Title: encodeHeader(title), Priority: String(priority), Tags: tags.join(',') },
  });
  return { ok: res.ok };
}
// Las cabeceras HTTP no aceptan tildes: se codifican como pide ntfy (RFC 2047)
function encodeHeader(s) { return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`; }

/** Envía en un solo aviso los eventos importantes nuevos desde el último aviso. */
export async function pushImportant(db, cfg, fetchImpl = fetch) {
  const last = getSetting(db, 'global', 'notify.lastId', 0);
  const evs = db.prepare('SELECT * FROM activity WHERE important = 1 AND id > ? ORDER BY id').all(last);
  if (!evs.length) return { sent: 0 };
  const maxId = evs.at(-1).id;
  if (!cfg.ntfyTopic) { setSetting(db, 'global', 'notify.lastId', maxId); return { sent: 0, reason: 'sin tema' }; }
  const alert = evs.some(e => ['trampa', 'alerta', 'error'].includes(e.type));
  const r = await sendPush(cfg, {
    title: alert ? 'JARVIS: revisar' : 'JARVIS: novedades',
    message: evs.slice(-8).map(e => `• ${e.text}`).join('\n') + (evs.length > 8 ? `\n(+${evs.length - 8} más en la app)` : ''),
    priority: alert ? 4 : 3, tags: [alert ? 'warning' : 'chart_with_upwards_trend'],
  }, fetchImpl);
  if (r.ok) setSetting(db, 'global', 'notify.lastId', maxId);
  return { sent: r.ok ? evs.length : 0 };
}
