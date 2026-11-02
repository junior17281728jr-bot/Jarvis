// Configuración: valores por defecto + archivo .env (sin dependencias).
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnv(file = resolve(process.cwd(), '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function config() {
  const e = process.env;
  const num = (k, d) => (e[k] !== undefined && e[k] !== '' ? Number(e[k]) : d);
  return {
    port: num('PORT', 8080),
    // En Railway escucha hacia afuera (Railway pone HTTPS delante) y guarda los datos en el volumen
    host: e.HOST || (e.RAILWAY_ENVIRONMENT || e.RAILWAY_PROJECT_ID ? '0.0.0.0' : '127.0.0.1'),
    dbPath: e.DB_PATH || (e.RAILWAY_VOLUME_MOUNT_PATH ? resolve(e.RAILWAY_VOLUME_MOUNT_PATH, 'jarvis.db') : resolve(process.cwd(), 'data/jarvis.db')),
    backupDir: e.BACKUP_DIR || (e.RAILWAY_VOLUME_MOUNT_PATH ? resolve(e.RAILWAY_VOLUME_MOUNT_PATH, 'backups') : resolve(process.cwd(), 'data/backups')),
    platform: e.RAILWAY_ENVIRONMENT || e.RAILWAY_PROJECT_ID ? 'railway' : 'servidor',
    // Sin volumen en Railway, los datos se borran en cada actualización: la app avisa
    persistent: !(e.RAILWAY_ENVIRONMENT || e.RAILWAY_PROJECT_ID) || !!e.RAILWAY_VOLUME_MOUNT_PATH || !!e.DB_PATH,
    // IA (las claves solo viven en .env, nunca en la base de datos ni en registros)
    openaiKey: e.OPENAI_API_KEY || '',
    openaiModel: e.OPENAI_MODEL || '', // vacío = JARVIS elige el más barato disponible
    anthropicKey: e.ANTHROPIC_API_KEY || '',
    anthropicModel: e.ANTHROPIC_MODEL || 'claude-haiku-5-5',
    ollamaUrl: e.OLLAMA_URL || 'http://127.0.0.1:11434',
    ollamaModel: e.OLLAMA_MODEL || 'qwen2.5:3b',
    aiMonthlyCapUsd: num('AI_MONTHLY_CAP_USD', 10),
    aiDailyCapUsd: num('AI_DAILY_CAP_USD', 0.5),
    // Datos de mercado
    alpacaKey: e.ALPACA_KEY_ID || '',
    alpacaSecret: e.ALPACA_SECRET_KEY || '',
    secUserAgent: e.SEC_USER_AGENT || 'JARVIS personal research contacto@example.com',
    // Cuenta virtual por defecto
    startCashUsd: num('START_CASH_USD', 100),
    tradeMinUsd: num('TRADE_MIN_USD', 5),
    tradeMaxUsd: num('TRADE_MAX_USD', 10),
    dailySummaryHourRd: num('DAILY_SUMMARY_HOUR_RD', 8),
    // Avisos al celular (app ntfy) y copia cifrada fuera del servidor (rclone)
    ntfyServer: e.NTFY_SERVER || 'https://ntfy.sh',
    ntfyTopic: e.NTFY_TOPIC || '',
    backupPassphrase: e.BACKUP_PASSPHRASE || '',
    rcloneRemote: e.RCLONE_REMOTE || '',
    driveUrl: e.DRIVE_URL || '',
    driveToken: e.DRIVE_TOKEN || '',
  };
}
