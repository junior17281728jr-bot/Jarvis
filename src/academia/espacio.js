// Academia (0.12.1): cuánto espacio libre queda en el disco donde se escribe (para no llenarlo con un video grande).
// → bytes libres para el programa, o null si no se puede medir (entonces se deja pasar, como antes).
import { statfsSync } from 'node:fs';

export function espacioLibre(carpeta) {
  try {
    const s = statfsSync(carpeta);
    const libre = Number(s.bavail) * Number(s.bsize);
    return Number.isFinite(libre) ? libre : null;
  } catch { return null; }
}
