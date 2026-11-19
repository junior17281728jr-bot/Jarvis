// 0.14.55 (auditoría): las carpetas temporales del que PRUEBA los cambios de «Claude mejora la app»
// (src/academia/app-probador.js). Cada prueba corre TODAS las pruebas con su carpeta temporal propia (tmp-<propuesta>), y
// esas pruebas dejan ahí unos 600 MB. Antes nunca se quitaban (solo al reiniciar el servicio): con 10 a 15 pruebas sin
// reiniciar se llenaba el disco del servidor.
//
// Es la ÚNICA excepción a «el programa nunca borra archivos» (test/reglas.test.js), y es muy estrecha: solo quita una
// carpeta que el probador mismo creó, y solo si TODO esto se cumple (si no, no toca nada y dice por qué):
//   - se llama tmp-<letras, números, - o _> (el nombre que le pone el probador) u «oportia-pruebas» (abajo);
//   - está directamente dentro de la carpeta de «Claude mejora la app» (src/academia/app-fuente.js → carpetaApp), sin
//     enlaces en el camino (se compara la ruta real);
//   - esa carpeta está dentro de la carpeta temporal del sistema (os.tmpdir(): en el servidor, la del servicio, que de
//     todos modos se vacía al reiniciar). Nunca en la carpeta de los datos (/var/lib/jarvis), ni en ninguna otra;
//   - es una carpeta de verdad (no un enlace).
// También «oportia-pruebas» ahí mismo: la que crean las pruebas que encienden otro programa sin la carpeta temporal
// (test/ayuda.js → baseDePruebas), unos 18 MB por prueba.
// Nada de lo que hay ahí es un dato: son copias de prueba del código y las bases falsas de las pruebas.
// Se quita SIN frenar al servidor (node:fs/promises): son unos 30 000 archivos, y de una sola vez el servidor web quedaba
// 3 s sin atender a nadie (medido en 1 procesador).
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { carpetaApp } from './app-fuente.js';

export const NOMBRE_TEMPORAL = /^(?:tmp-[A-Za-z0-9_-]{1,64}|oportia-pruebas)$/;

const real = ruta => { try { return realpathSync(ruta); } catch { return null; } };

// ¿Se puede quitar esta carpeta? → null si sí; si no, el motivo (un texto corto).
export function motivoParaNoQuitar(config, carpeta, { temporal = tmpdir() } = {}) {
  if (typeof carpeta !== 'string' || !carpeta) return 'sin_ruta';
  if (!NOMBRE_TEMPORAL.test(basename(carpeta))) return 'nombre';
  const app = real(carpetaApp(config));
  const sistema = real(temporal);
  if (!app || !sistema) return 'sin_carpeta';
  if (!app.startsWith(sistema + sep)) return 'fuera_de_temporal';
  let info;
  try { info = lstatSync(carpeta); } catch { return 'no_existe'; }
  if (info.isSymbolicLink() || !info.isDirectory()) return 'no_es_carpeta';
  const suya = real(carpeta);
  if (!suya || dirname(suya) !== app || basename(suya) !== basename(carpeta)) return 'fuera_de_app';
  return null;
}

// Quita UNA carpeta temporal del probador (con todo lo que tiene). → Promise de true si la quitó; nunca falla.
export async function quitarTemporal(config, carpeta, opciones = {}) {
  if (motivoParaNoQuitar(config, carpeta, opciones) != null) return false;
  try {
    await rm(realpathSync(carpeta), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    return true;
  } catch {
    return false;
  }
}

// Al arrancar y antes de cada prueba (nunca durante una): quita las tmp-* que quedaron de antes (un reinicio a mitad, un
// tiempo agotado en el que algún proceso de prueba siguió escribiendo un rato). → Promise de cuántas quitó.
export async function quitarTemporalesViejos(config, opciones = {}) {
  let nombres;
  try { nombres = readdirSync(carpetaApp(config)); } catch { return 0; }
  let n = 0;
  for (const nombre of nombres) {
    if (NOMBRE_TEMPORAL.test(nombre) && await quitarTemporal(config, join(carpetaApp(config), nombre), opciones)) n++;
  }
  return n;
}
