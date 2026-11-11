// Academia (0.8.0): sonidos cortos hechos al momento con Web Audio (sin archivos de audio): acierto, error, tocar un
// botón, tema terminado, racha y subir de nivel. Se apagan en Configuración (encendidos por defecto, uno por cuenta, en
// este navegador). El contexto de audio se crea o se reanuda dentro de un toque (si no, el iPhone no deja sonar).
// No se cambia el tipo de sesión de audio de la página (navigator.audioSession): así la narración del Video resumen no se
// apaga, y en el iPhone estos sonidos siguen la regla de siempre de Web Audio (respetan el interruptor de silencio).
let contexto = null;
let usuario = null;
const clave = () => `op_sonidos.${usuario ?? 'x'}`;

export function ponerUsuario(id) { usuario = id; }
export function sonidosEncendidos() {
  try { return localStorage.getItem(clave()) !== '0'; } catch { return true; }
}
export function encenderSonidos(si) {
  try { localStorage.setItem(clave(), si ? '1' : '0'); } catch { /* sin almacenamiento: solo por ahora */ }
}

// Las notas de cada efecto: [frecuencia Hz, empieza s, dura s, forma, volumen]. Cortos (menos de 0,7 s) y suaves.
const EFECTOS = Object.freeze({
  toque: [[880, 0, 0.05, 'triangle', 0.10]],
  bien: [[659.25, 0, 0.11, 'sine', 0.22], [987.77, 0.09, 0.2, 'sine', 0.22]],
  mal: [[220, 0, 0.16, 'sawtooth', 0.09], [174.61, 0.12, 0.24, 'sawtooth', 0.09]],
  tema: [[523.25, 0, 0.12, 'triangle', 0.2], [659.25, 0.11, 0.12, 'triangle', 0.2], [783.99, 0.22, 0.12, 'triangle', 0.2], [1046.5, 0.33, 0.3, 'triangle', 0.22]],
  racha: [[392, 0, 0.09, 'square', 0.07], [587.33, 0.08, 0.09, 'square', 0.07], [880, 0.16, 0.22, 'square', 0.08]],
  nivel: [[523.25, 0, 0.1, 'sine', 0.2], [783.99, 0.1, 0.1, 'sine', 0.2], [1046.5, 0.2, 0.1, 'sine', 0.2], [1318.5, 0.3, 0.36, 'sine', 0.24], [1568, 0.3, 0.36, 'triangle', 0.1]],
});
export const NOMBRES_EFECTOS = Object.freeze(Object.keys(EFECTOS));

function elContexto() {
  const Clase = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Clase) return null;
  if (!contexto) { try { contexto = new Clase(); } catch { return null; } }
  if (contexto.state === 'suspended') contexto.resume().catch(() => {});
  return contexto;
}

// El iPhone solo deja sonar un contexto de audio creado o reanudado DENTRO de un toque. Los sonidos suenan muchas veces
// después de esperar al servidor (COMPROBAR): por eso, con cada toque o tecla, el contexto se crea o se reanuda ya.
export function prepararSonidos() {
  const despertar = () => { if (sonidosEncendidos() && (!contexto || contexto.state !== 'running')) elContexto(); };
  try {
    document.addEventListener('pointerdown', despertar, { capture: true, passive: true });
    document.addEventListener('keydown', despertar, { capture: true });
  } catch { /* sin documento: nada */ }
}

// Llamarla dentro del toque (o justo después): suena el efecto si los sonidos están encendidos.
export function sonar(nombre) {
  const notas = EFECTOS[nombre];
  if (!notas || !sonidosEncendidos()) return false;
  // Para las pruebas en el navegador: cuántas veces sonó cada efecto (no es global de la app).
  const cuenta = document.documentElement.dataset;
  cuenta.sonidos = String(Number(cuenta.sonidos || 0) + 1);
  cuenta.ultimoSonido = nombre;
  cuenta[`s${nombre}`] = String(Number(cuenta[`s${nombre}`] || 0) + 1);
  const c = elContexto();
  if (!c) return false;
  try {
    const t0 = c.currentTime + 0.01;
    for (const [frecuencia, empieza, dura, forma, volumen] of notas) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = forma;
      o.frequency.setValueAtTime(frecuencia, t0 + empieza);
      g.gain.setValueAtTime(0.0001, t0 + empieza);
      g.gain.exponentialRampToValueAtTime(volumen, t0 + empieza + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + empieza + dura);
      o.connect(g).connect(c.destination);
      o.start(t0 + empieza);
      o.stop(t0 + empieza + dura + 0.02);
    }
    return true;
  } catch { return false; }
}
