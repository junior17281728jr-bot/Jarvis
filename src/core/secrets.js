// Claves puestas desde la app (para quien solo tiene el celular). Se guardan SOLO en un archivo del servidor
// (secrets.env, permisos 600), nunca en la base de datos, ni en registros, ni se devuelven a la pantalla.
import { readFileSync, writeFileSync, existsSync, renameSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const KEYS = {
  OPENAI_API_KEY: { cfg: 'openaiKey', label: 'ChatGPT (OpenAI)', re: /^sk-[A-Za-z0-9_\-]{20,200}$/ },
  ANTHROPIC_API_KEY: { cfg: 'anthropicKey', label: 'Claude (Anthropic)', re: /^sk-ant-[A-Za-z0-9_\-]{20,200}$/ },
  ALPACA_KEY_ID: { cfg: 'alpacaKey', label: 'Alpaca: Key ID', re: /^[A-Z0-9]{10,40}$/ },
  ALPACA_SECRET_KEY: { cfg: 'alpacaSecret', label: 'Alpaca: Secret', re: /^[A-Za-z0-9]{20,80}$/ },
  NTFY_TOPIC: { cfg: 'ntfyTopic', label: 'Tema de avisos (ntfy)', re: /^[A-Za-z0-9_\-]{8,64}$/ },
  SEC_USER_AGENT: { cfg: 'secUserAgent', label: 'Tu nombre y correo para la SEC', re: /^[^\n\r<>]{5,120}@[^\n\r<>]{3,80}$/ },
  // Copia automática en Google Drive (se ponen desde su propia tarjeta, no en la lista de claves)
  DRIVE_URL: { cfg: 'driveUrl', label: 'Enlace del código de Google Drive', re: /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/, hidden: true },
  DRIVE_TOKEN: { cfg: 'driveToken', label: 'Clave del código de Google Drive', re: /^[A-Za-z0-9]{16,80}$/, hidden: true },
  BACKUP_PASSPHRASE: { cfg: 'backupPassphrase', label: 'Frase secreta de las copias', re: /^[^\n\r]{10,200}$/, hidden: true },
};

export const secretsPath = cfg => process.env.SECRETS_FILE || resolve(dirname(cfg.dbPath), 'secrets.env');

/** Carga secrets.env encima de .env (lo puesto desde la app manda). */
export function loadSecrets(cfg) {
  const file = secretsPath(cfg);
  if (!existsSync(file)) return 0;
  let n = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && KEYS[m[1]] && m[2]) { cfg[KEYS[m[1]].cfg] = m[2]; n++; }
  }
  return n;
}

/** Qué está configurado (solo sí/no y los últimos 4 caracteres, nunca la clave). */
export function keyStatus(cfg) {
  return Object.entries(KEYS).filter(([, k]) => !k.hidden).map(([name, k]) => {
    const v = cfg[k.cfg] || '';
    const isDefault = name === 'SEC_USER_AGENT' && /example\.com/.test(v);
    return { name, label: k.label, set: !!v && !isDefault, hint: v && !isDefault && name !== 'SEC_USER_AGENT' && name !== 'NTFY_TOPIC' ? '…' + v.slice(-4) : null };
  });
}

/** Guarda claves nuevas (o borra con ""), valida el formato y actualiza el programa sin reiniciar. */
export function saveKeys(cfg, input) {
  const file = secretsPath(cfg);
  const cur = {};
  if (existsSync(file)) for (const line of readFileSync(file, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && KEYS[m[1]]) cur[m[1]] = m[2]; }
  const changed = [];
  for (const [name, raw] of Object.entries(input || {})) {
    if (!KEYS[name] || raw == null) continue;
    const v = String(raw).trim();
    if (v && !KEYS[name].re.test(v)) throw new Error(`${KEYS[name].label}: el formato no parece correcto. Cópiala completa, sin espacios.`);
    if (v) cur[name] = v; else delete cur[name];
    cfg[KEYS[name].cfg] = v || (name === 'SEC_USER_AGENT' ? 'JARVIS personal research contacto@example.com' : '');
    changed.push(name);
  }
  const tmp = file + '.tmp';
  writeFileSync(tmp, Object.entries(cur).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* sistemas sin permisos POSIX */ }
  return { changed, status: keyStatus(cfg) };
}
