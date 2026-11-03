// Borra TODO lo que dejó JARVIS en la carpeta de datos del servidor (base de datos, copias, registros).
// Solo se conservan los archivos que necesita el actualizador automático y las claves (secrets.env).
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

export const KEEP = new Set(['version.txt', 'version.bad', 'update.log', 'secrets.env', 'public-url.txt', 'funnel.log', '.instalado']);

export function limpiar(dir) {
  const d = resolve(dir);
  // Seguridad: solo borra dentro de una carpeta de datos de JARVIS (nunca la raíz ni otra carpeta del sistema)
  if (!existsSync(d) || !['jarvis', 'data'].includes(basename(d))) return { dir: d, borrados: [], omitido: true };
  const borrados = [];
  for (const name of readdirSync(d)) {
    if (KEEP.has(name)) continue;
    rmSync(join(d, name), { recursive: true, force: true });
    borrados.push(name);
  }
  return { dir: d, borrados };
}
