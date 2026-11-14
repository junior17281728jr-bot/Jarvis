// Academia 0.14.11: repetir algo cada N ms SOLO mientras la app está a la vista (pausa con la app escondida; al volver,
// enseguida una vez y otra vez cada N ms). Lo usan el latido del alumno (cada 15 s: «sigo aquí», para «en línea») y lo que
// el administrador pide en «Cómo van todos» (en línea cada 5 s, el avance cada 30 s) y en la ficha (el avance cada 30 s).
// Sin nada del DOM aparte de document (llega como «doc»): las pruebas lo usan con un reloj y un documento falsos.
export const LATIDO_ALUMNO_MS = 15 * 1000;
export const EN_LINEA_ADMIN_MS = 5 * 1000;
export const AVANCE_ADMIN_MS = 30 * 1000;

// hacer(parar): lo que se repite (puede devolver una promesa: no se pide otra vez mientras la anterior no termina).
// → parar(). reloj: { setInterval, clearInterval } (por defecto, los de siempre).
export function repetirMientrasVisible({ doc, cadaMs, hacer, reloj = globalThis, alEmpezar = false }) {
  let intervalo = null;
  let ocupado = false;
  let parado = false;
  const vez = async () => {
    if (parado || doc.hidden || ocupado) return;
    ocupado = true;
    try { await hacer(parar); } catch { /* sin red: la próxima vez */ } finally { ocupado = false; }
  };
  const empezar = () => { if (intervalo == null) intervalo = reloj.setInterval(vez, cadaMs); };
  const pausar = () => { if (intervalo != null) { reloj.clearInterval(intervalo); intervalo = null; } };
  const alCambiar = () => {
    if (parado) return;
    if (doc.hidden) pausar();
    else { vez(); empezar(); }
  };
  function parar() {
    parado = true;
    pausar();
    doc.removeEventListener('visibilitychange', alCambiar);
  }
  doc.addEventListener('visibilitychange', alCambiar);
  if (!doc.hidden) { empezar(); if (alEmpezar) vez(); }
  return parar;
}
