// Copia fuera del servidor: la copia diaria se cifra (AES-256-GCM con tu frase) y se sube con rclone
// a Google Drive u otro almacenamiento. Sin tu frase, nadie puede leerla.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';

const MAGIC = Buffer.from('JVBK1');

export function encryptBuffer(buf, passphrase) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(gzipSync(buf)), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), enc]);
}
export function decryptBuffer(data, passphrase) {
  if (!data.subarray(0, 5).equals(MAGIC)) throw new Error('No es una copia de JARVIS.');
  const salt = data.subarray(5, 21), iv = data.subarray(21, 33), tag = data.subarray(33, 49);
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return gunzipSync(Buffer.concat([d.update(data.subarray(49)), d.final()]));
}

export function encryptFile(src, dest, passphrase) {
  writeFileSync(dest, encryptBuffer(readFileSync(src), passphrase));
  // Verificación: la copia cifrada se puede abrir con la misma frase
  const back = decryptBuffer(readFileSync(dest), passphrase);
  if (back.length !== readFileSync(src).length) throw new Error('La copia cifrada no coincide con la original.');
  return dest;
}

export function rcloneCopy(file, remote) {
  return new Promise((resolve, reject) => {
    execFile('rclone', ['copy', file, `${remote}/jarvis-copias`], { timeout: 10 * 60e3 }, (err, _o, stderr) => (err ? reject(new Error(`rclone: ${stderr || err.message}`)) : resolve(true)));
  });
}

/** Cifra y sube la copia si hay frase y destino configurados. */
export async function offsiteBackup(cfg, localFile) {
  if (!cfg.backupPassphrase || !cfg.rcloneRemote) return { uploaded: false, reason: 'copia externa no configurada (BACKUP_PASSPHRASE y RCLONE_REMOTE)' };
  const enc = encryptFile(localFile, localFile + '.jvbk', cfg.backupPassphrase);
  await rcloneCopy(enc, cfg.rcloneRemote);
  return { uploaded: true, file: enc.split('/').pop(), remote: cfg.rcloneRemote };
}
