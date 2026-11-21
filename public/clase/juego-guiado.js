// 0.14.99: «Vuelo con preguntas»: una ruta con 9 tramos alrededor del aeropuerto; el piloto automático la vuela y en
// cada tramo sale una pregunta. Bien: la maniobra que pide el tramo que sigue (virar, subir o bajar) y avanzas. Mal: una
// falla (una nube, turbulencia o te desvías del rumbo) y pierdes una de las 3 vidas. Al final, el piloto automático hace
// la aproximación y aterriza en la 36 (o, sin vidas, vuelve a la base y aterriza). Sin documento ni ventana.
import { PISTA, enPista } from './vuelo-modelo.js';

export const GUIADO = Object.freeze({ vidas: 3, velocidadReloj: 3, llegadaUnidades: 1.6 });
// La ruta (x este, z norte en unidades de 1,000 ft; ft de altitud). La última es el punto de final (3.6 NM al sur, alineado
// con la 36, a la altura de una senda de 3°).
export const RUTA_GUIADA = Object.freeze([
  [0, 10, 2500], [7, 16, 2500], [15, 12, 3000], [16, 3, 3000], [11, -3, 2500], [14, -11, 2500], [8, -19, 2000], [3, -27, 1500], [0, -24.2, 1200],
].map(([x, z, ft]) => Object.freeze({ x, z, ft })));
export const INICIO_GUIADO = Object.freeze({ x: 0, z: 3, ft: 1500, rumbo: 360, kt: 95 });

const norm180 = g => ((((g % 360) + 540) % 360) - 180);
const lim = (x, a, b) => Math.min(b, Math.max(a, x));
export const rumboHacia = (x, z, p) => ((Math.atan2(p.x - x, p.z - z) * 180) / Math.PI + 360) % 360;

// La maniobra que pide un tramo, desde donde está el avión: → { tipos: ['derecha'|'izquierda'|'subir'|'bajar'|'seguir'…], giro, dft }.
export function maniobraDe(a, wp) {
  const giro = norm180(rumboHacia(a.x, a.z, wp) - a.rumbo), dft = wp.ft - a.ft;
  const tipos = [];
  if (giro > 20) tipos.push('derecha'); else if (giro < -20) tipos.push('izquierda');
  if (dft > 200) tipos.push('subir'); else if (dft < -200) tipos.push('bajar');
  return { tipos: tipos.length ? tipos : ['seguir'], giro, dft };
}

// El estado del vuelo guiado y lo que pasa al responder.
export const FALLAS_GUIADAS = Object.freeze(['nube', 'turbulencia', 'desvio']);
export function crearGuiado(total = RUTA_GUIADA.length) {
  return { i: 0, total, vidas: GUIADO.vidas, bien: 0, respondidas: 0, racha: 0, mejor: 0, fallas: 0, fin: null, falla: null };
}
// → el nuevo estado: avanza un tramo (bien o mal); mal = una falla (la siguiente de la lista) y una vida menos.
// fin: 'destino' (respondió el último tramo) o 'sin_vidas' (vuelve a la base).
export function responderGuiado(g, acierto) {
  if (g.fin) return g;
  const vidas = acierto ? g.vidas : g.vidas - 1, racha = acierto ? g.racha + 1 : 0, i = g.i + 1;
  return {
    ...g, i, vidas, racha, mejor: Math.max(g.mejor, racha), bien: g.bien + (acierto ? 1 : 0), respondidas: g.respondidas + 1,
    fallas: g.fallas + (acierto ? 0 : 1), falla: acierto ? null : FALLAS_GUIADAS[g.fallas % FALLAS_GUIADAS.length],
    fin: vidas <= 0 ? 'sin_vidas' : i >= g.total ? 'destino' : null,
  };
}
// ¿Llegó al punto de la ruta?
export const llego = (a, wp) => Math.hypot(a.x - wp.x, a.z - wp.z) < GUIADO.llegadaUnidades;

// ---------- el piloto automático ----------
// Hacia un rumbo y una altitud (con el Asistente: la potencia decide si sube o baja). desvio: grados de más (una falla).
export function piloto(a, meta, { desvio = 0 } = {}) {
  const err = norm180(meta.rumbo + desvio - a.rumbo);
  const alabeoMeta = lim(err * 1.1, -25, 25);
  const dft = meta.ft - a.ft;
  return { alabeo: lim((alabeoMeta - a.alabeo) / 12, -1, 1), cabeceo: 0, potencia: dft > 150 ? 1 : dft < -150 ? 0.1 : 0.65, flaps: 0 };
}
// La aproximación y el aterrizaje en la 36: la senda de 3° al umbral, el eje, los flaps y el «flare» cerca del suelo.
export function pilotoFinal(a) {
  const p = enPista(a.x, a.z);
  const alUmbral = Math.max(0, -p.largo - PISTA.largoFt / 2 + 300);
  const senda = alUmbral * Math.tan((3 * Math.PI) / 180);
  const rumboMeta = PISTA.rumbo - lim(p.costado / 40, -25, 25);
  const err = norm180(rumboMeta - a.rumbo), alabeoMeta = lim(err * 1.2, -15, 15);
  const enTierra = a.enSuelo;
  return {
    alabeo: enTierra ? lim(-p.costado / 30, -1, 1) : lim((alabeoMeta - a.alabeo) / 10, -1, 1),
    cabeceo: !enTierra && a.ft < 25 ? lim((-a.vs - 150) / 400, 0, 0.5) : 0,
    potencia: enTierra ? 0 : lim(0.2 + (senda - a.ft) / 250, 0, 0.6), flaps: 1,
  };
}
// ¿Ya está en final (cerca del eje, al sur, rumbo norte)? Desde aquí manda pilotoFinal.
export function enFinal(a) {
  const p = enPista(a.x, a.z);
  return p.largo < -PISTA.largoFt / 2 && p.largo > -26000 && Math.abs(p.costado) < 1500 && Math.abs(norm180(a.rumbo - PISTA.rumbo)) < 35;
}
