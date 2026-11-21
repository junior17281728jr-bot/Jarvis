// 0.14.103 (pedido del dueño): la repetición de «qué pasó» después de responder: una escena corta (6 a 12 s) que muestra lo
// que pasa por la respuesta desde varias cámaras (la cabina, detrás del avión, de costado fija y desde arriba con los
// caminos dibujados), con cortes suaves, y que se detiene en el momento clave con una frase («Aquí debiste virar a la
// derecha»). Mal: el incidente (casi choque, motor parado y aterrizaje forzoso, la nube y la espiral, entrar a un espacio
// aéreo sin permiso), sin explosiones. Bien: la maniobra correcta. Siempre igual (sin azar). Sin documento.
import { crearCamara, ojoOrbita, baseAvion, suma, por, linea, primitivasAvion } from './motor3d.js';

export const CAMARAS = Object.freeze(['cabina', 'persecucion', 'lado', 'arriba']);
export const REPETICION = Object.freeze({ minS: 6, maxS: 12, congelarS: 1.6, fundidoS: 0.3, velocidad: 0.06, escalaAvion: 0.0048 });
export const ENCUENTROS = Object.freeze(['de_frente', 'cruza_der_izq', 'cruza_izq_der', 'alcanzas', 'se_aleja']);

// Qué escena corresponde a lo que pasó (la consecuencia de la respuesta y el tema de la pregunta).
export function escenaDeRepeticion(consecuencia, categoria = null) {
  if (consecuencia === 'aceite') return 'motor';
  if (consecuencia === 'nube' || consecuencia === 'turbulencia') return 'nube';
  if (consecuencia === 'atc' || consecuencia === 'desvio') return 'espacio';
  const porTema = { motor: 'motor', meteo: 'nube', espacio: 'espacio' };
  return porTema[categoria] ?? 'trafico';
}

const lim = (x, a, b) => Math.min(b, Math.max(a, x));
const rad = g => (g * Math.PI) / 180;
const suave = (t, a, b) => { const k = lim((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const norm = g => ((g % 360) + 360) % 360;

// Un avión que se mueve con «mandos» que dependen del tiempo: → muestras { t, x, y, z, rumbo, alabeo, cabeceo, rpm, enSuelo }.
function volar(inicio, { dur, v = REPETICION.velocidad, giro = () => 0, alabeo = () => 0, sube = () => 0, cabeceo = () => 0, rpm = () => 2300, piso = -Infinity, rapidez = () => 1 }) {
  const out = [];
  let { x, z, y, rumbo } = inicio, enSuelo = false;
  const dt = 1 / 30;
  for (let t = 0; t <= dur + 1e-9; t += dt) {
    out.push({ t, x, y, z, rumbo: norm(rumbo), alabeo: enSuelo ? 0 : alabeo(t), cabeceo: enSuelo ? 0 : cabeceo(t), rpm: rpm(t), enSuelo });
    rumbo += giro(t) * dt;
    const h = rad(rumbo), w = v * rapidez(t) * (enSuelo ? Math.max(0, 1 - (t - enSuelo) / 1.2) : 1);
    x += Math.sin(h) * w * dt; z += Math.cos(h) * w * dt;
    y += sube(t) * dt;
    if (y <= piso && !enSuelo) { y = piso; enSuelo = t; }
    if (enSuelo !== false) y = piso;
  }
  return out.map(m => ({ ...m, enSuelo: m.enSuelo !== false && m.enSuelo !== 0 ? true : m.enSuelo === 0 }));
}
function muestra(lista, t) {
  const dt = lista[1].t - lista[0].t, i = lim(Math.floor(t / dt), 0, lista.length - 2), k = lim((t - lista[i].t) / dt, 0, 1);
  const a = lista[i], b = lista[i + 1];
  const mez = (p, q) => p + (q - p) * k;
  let dr = ((b.rumbo - a.rumbo + 540) % 360) - 180;
  return { x: mez(a.x, b.x), y: mez(a.y, b.y), z: mez(a.z, b.z), rumbo: norm(a.rumbo + dr * k), alabeo: mez(a.alabeo, b.alabeo), cabeceo: mez(a.cabeceo, b.cabeceo), rpm: mez(a.rpm, b.rpm), enSuelo: k < 0.5 ? a.enSuelo : b.enSuelo };
}

// La escena: { escena, encuentro, acierto, dur (con la pausa), clave { t, texto }, tomas [{ camara, desde, hasta }], propio, otro,
// nube, limite, puntoLado } — inicio: { x, z, ft, rumbo } (el avión de verdad); suelo(x, z): la altura del suelo (unidades).
export function crearRepeticion({ escena = 'trafico', encuentro = 'de_frente', acierto = false, inicio, suelo = () => 0, camara = 0 } = {}) {
  const v = REPETICION.velocidad, y0 = inicio.ft / 1000, h0 = rad(inicio.rumbo);
  const F = [Math.sin(h0), Math.cos(h0)], R = [Math.cos(h0), -Math.sin(h0)];
  const enMundo = (a, d) => ({ x: inicio.x + F[0] * a + R[0] * d, z: inicio.z + F[1] * a + R[1] * d });
  const p0 = { ...enMundo(0, 0), y: y0, rumbo: inicio.rumbo };
  let dur = 9, clave = 5, propio, otro = null, nube = null, limite = null, lado = null, tomas;
  if (escena === 'trafico') {
    if (!ENCUENTROS.includes(encuentro)) encuentro = 'de_frente';
    const c = 5.2; clave = c;
    const virarDer = (t0, grados, durGiro = 2.4) => t => (t >= t0 && t < t0 + durGiro ? grados / durGiro : 0);
    const banco = (t0, durGiro = 2.4, b = 25) => t => b * Math.min(suave(t, t0, t0 + 0.4), 1 - suave(t, t0 + durGiro - 0.4, t0 + durGiro));
    const P = enMundo(v * c, 0);
    let oInicio, oRumbo, oV = v, oGiro = () => 0, oAlabeo = () => 0, pGiro = () => 0, pAlabeo = () => 0, dOtro = acierto ? 0 : 0.012;
    if (encuentro === 'de_frente') {
      oInicio = enMundo(2 * v * c, dOtro); oRumbo = inicio.rumbo + 180;
      if (acierto) { pGiro = virarDer(1.4, 40); pAlabeo = banco(1.4); oGiro = virarDer(1.4, 40); oAlabeo = banco(1.4); }
    } else if (encuentro === 'cruza_der_izq') {
      oInicio = enMundo(v * c - dOtro, v * c); oRumbo = inicio.rumbo - 90;
      if (acierto) { pGiro = virarDer(1.2, 55); pAlabeo = banco(1.2); }
    } else if (encuentro === 'cruza_izq_der') {
      oInicio = enMundo(v * c - dOtro, -v * c); oRumbo = inicio.rumbo + 90;
      if (acierto) { oGiro = virarDer(1.2, 55); oAlabeo = banco(1.2); }
    } else if (encuentro === 'alcanzas') {
      oV = 0.5 * v; oInicio = enMundo(0.5 * v * c, dOtro); oRumbo = inicio.rumbo;
      if (acierto) { pGiro = t => virarDer(0.6, 40, 1.6)(t) - virarDer(2.4, 40, 1.6)(t); pAlabeo = t => banco(0.6, 1.6, 25)(t) - banco(2.4, 1.6, 25)(t); }
    } else { // se_aleja
      oV = 1.3 * v; oInicio = enMundo(0.25, 0.02); oRumbo = inicio.rumbo;
    }
    propio = volar(p0, { dur, giro: pGiro, alabeo: pAlabeo });
    otro = volar({ ...oInicio, y: y0, rumbo: oRumbo }, { dur, v: oV, giro: oGiro, alabeo: oAlabeo });
    lado = { x: P.x + R[0] * 0.3 - F[0] * 0.05, z: P.z + R[1] * 0.3 - F[1] * 0.05, y: y0 + 0.04 };
    tomas = ['cabina', 'lado', 'arriba'];
  } else if (escena === 'motor') {
    dur = 10; clave = acierto ? 4 : 2.2;
    const gy = suelo(enMundo(v * 14, 0).x, enMundo(v * 14, 0).z);
    if (acierto) {
      propio = volar(p0, { dur, giro: t => (t > 1 && t < 4 ? 15 : 0), alabeo: t => 20 * Math.min(suave(t, 1, 1.4), 1 - suave(t, 3.6, 4)) });
    } else {
      // El motor se para; planea y aterriza en un campo (sin choque): la nariz abajo, la nivelada al final y se detiene.
      // (la escena empieza más baja, a unos 300 ft sobre el campo: si no, la bajada se vería casi vertical)
      const yA = Math.min(y0, gy + 0.3), tToque = 8.2, bajar = (yA - gy) / (tToque - 2.2);
      propio = volar({ ...p0, y: yA }, { dur, v: 2 * v, piso: gy, rpm: t => 2300 * (1 - suave(t, 1.2, 2.4)), sube: t => (t < 2.2 ? 0 : -bajar * (1 - 0.5 * suave(t, 7.4, 8.2))), cabeceo: t => (t < 2.2 ? 0 : -5 + 7 * suave(t, 7.3, 8.1)), rapidez: t => 1 - 0.25 * suave(t, 2, 4) });
    }
    lado = { ...enMundo(acierto ? v * 7.5 : v * 13, 0.28), y: gy + 0.03 };
    tomas = ['cabina', 'persecucion', 'lado'];
  } else if (escena === 'nube') {
    dur = 10; clave = acierto ? 6 : 6.5;
    nube = { ...enMundo(v * 3.6, 0), y: y0, r: 0.14 };
    if (acierto) {
      // Antes de entrar: un viraje de 180° (y sale por donde vino).
      propio = volar(p0, { dur, giro: t => (t > 0.8 && t < 6.2 ? 180 / 5.4 : 0), alabeo: t => 30 * Math.min(suave(t, 0.8, 1.3), 1 - suave(t, 5.7, 6.2)) });
    } else {
      // Entra; sin horizonte, el ala baja sola y empieza la espiral (la nariz abajo, cada vez más rápido).
      // (baja hasta salir por debajo de la nube, ladeado: así se ve desde afuera; nunca hasta el suelo)
      const gy = suelo(nube.x, nube.z), cuanto = lim((y0 - gy - 0.1) / 0.4, 0, 1);
      const b = t => 60 * suave(t, 3.4, 7);
      propio = volar(p0, { dur, alabeo: b, giro: t => 0.9 * b(t), sube: t => -0.12 * cuanto * suave(t, 4, 7.5), cabeceo: t => -12 * suave(t, 4, 7.5), rapidez: t => 1 + 0.5 * suave(t, 4, 8) });
    }
    lado = { ...enMundo(v * 3.6, 0.55), y: y0 - 0.16 };
    tomas = ['persecucion', 'cabina', 'lado', 'arriba'];
  } else { // espacio
    dur = 9; clave = 4.6;
    const a = v * 4.6, A = enMundo(a, -0.5), B = enMundo(a, 0.5);
    limite = [[A.x, A.z], [B.x, B.z]];
    propio = volar(p0, acierto ? { dur, giro: t => (t > 1.4 && t < 3.6 ? 90 / 2.2 : 0), alabeo: t => 25 * Math.min(suave(t, 1.4, 1.8), 1 - suave(t, 3.2, 3.6)) } : { dur });
    lado = { ...enMundo(a + 0.05, -0.3), y: y0 + 0.05 };
    tomas = ['persecucion', 'lado', 'arriba'];
  }
  // Las tomas: 2 a 4 cámaras seguidas (con «Cambiar cámara», empieza por otra).
  const n = tomas.length, total = dur + REPETICION.congelarS;
  const orden = tomas.map((c, i) => CAMARAS[(CAMARAS.indexOf(c) + camara) % CAMARAS.length] ?? tomas[i]);
  const unicas = orden.filter((c, i) => orden.indexOf(c) === i);
  const lista = unicas.length >= 2 ? unicas : [...unicas, CAMARAS.find(c => !unicas.includes(c))];
  const tramo = total / lista.length;
  const texto = escena === 'trafico' ? `juego.rep.trafico.${encuentro}.${acierto ? 'bien' : 'mal'}` : `juego.rep.${escena}.${acierto ? 'bien' : 'mal'}`;
  return {
    escena, encuentro: escena === 'trafico' ? encuentro : null, acierto, dur: total, durEscena: dur, clave: { t: clave, texto }, camara,
    tomas: lista.map((c, i) => ({ camara: c, desde: i * tramo, hasta: (i + 1) * tramo })),
    propio, otro, nube, limite, lado,
  };
}

// El tiempo de la escena en el segundo «t» de la repetición: se detiene en la clave (congelarS) y sigue.
export function tiempoEscena(rep, t) {
  const c = rep.clave.t, F = REPETICION.congelarS;
  return t < c ? t : t < c + F ? c : Math.min(rep.durEscena, t - F);
}
export const congelada = (rep, t) => t >= rep.clave.t && t < rep.clave.t + REPETICION.congelarS;
export const tomaEn = (rep, t) => rep.tomas.find(x => t < x.hasta) ?? rep.tomas[rep.tomas.length - 1];
// El fundido entre tomas (0 = nada, 1 = negro): baja y sube en fundidoS alrededor de cada corte.
export function fundido(rep, t) {
  const f = REPETICION.fundidoS;
  let a = 0;
  for (const x of rep.tomas.slice(1)) a = Math.max(a, 1 - Math.abs(t - x.desde) / f);
  return lim(a, 0, 1);
}
// Dónde están los dos aviones en el segundo «t» de la repetición.
export function estadoRepeticion(rep, t) {
  const te = tiempoEscena(rep, t);
  return { te, propio: muestra(rep.propio, te), otro: rep.otro ? muestra(rep.otro, te) : null };
}
// La distancia más corta entre los dos aviones (para las pruebas: el casi choque y la maniobra bien hecha).
export function distanciaMinima(rep) {
  if (!rep.otro) return Infinity;
  let d = Infinity, tMin = 0;
  for (let i = 0; i < Math.min(rep.propio.length, rep.otro.length); i++) {
    const a = rep.propio[i], b = rep.otro[i], x = Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y);
    if (x < d) { d = x; tMin = a.t; }
  }
  return { d, t: tMin };
}

// La cámara de cada toma. aspecto: ancho / alto.
export function camaraRepeticion(rep, t, aspecto = 1) {
  const { propio: p } = estadoRepeticion(rep, t), toma = tomaEn(rep, t).camara, pos = [p.x, p.y + 0.0027, p.z];
  const fov = aspecto < 1 ? 66 : 52;
  if (toma === 'cabina') {
    const b = baseAvion(p.rumbo, p.cabeceo - 6, p.alabeo);
    const ojo = suma(suma(pos, por(b.U, 0.0017)), por(b.F, 0.0016));
    return { toma, cam: crearCamara({ ojo, mira: suma(ojo, b.F), arriba: b.U, fov: aspecto < 1 ? 74 : 58, cerca: 0.0006 }) };
  }
  if (toma === 'persecucion') {
    const ojo = ojoOrbita({ mira: pos, giro: p.rumbo, alto: 8, dist: 0.09 });
    return { toma, cam: crearCamara({ ojo, mira: pos, fov, cerca: 0.002 }) };
  }
  if (toma === 'lado') return { toma, cam: crearCamara({ ojo: [rep.lado.x, rep.lado.y, rep.lado.z], mira: pos, fov: fov * 0.8, cerca: 0.002 }) };
  // Desde arriba: todo el camino de los dos a la vista (el norte arriba).
  const xs = [...rep.propio, ...(rep.otro ?? [])], xMin = Math.min(...xs.map(m => m.x)), xMax = Math.max(...xs.map(m => m.x)), zMin = Math.min(...xs.map(m => m.z)), zMax = Math.max(...xs.map(m => m.z));
  const cx = (xMin + xMax) / 2, cz = (zMin + zMax) / 2, span = Math.max(xMax - xMin, (zMax - zMin) * Math.max(1, aspecto), 0.25) * 1.35;
  const alto = span / 2 / Math.tan(rad(fov) / 2), y = Math.max(...xs.map(m => m.y));
  return { toma, cam: crearCamara({ ojo: [cx, y + alto, cz - 0.0001], mira: [cx, y, cz], arriba: [0, 0, 1], fov, cerca: 0.01 }) };
}

// Lo que se dibuja: los aviones (más grandes que de verdad, para verlos), los caminos (desde arriba y de costado), la nube
// y el límite del espacio aéreo. Colores: el propio en azul, el otro en naranja; mal, el tramo peligroso en rojo.
export function primitivasRepeticion(rep, t, { conPropio = true, conCaminos = true } = {}) {
  const { te, propio: p, otro: o } = estadoRepeticion(rep, t), out = [], e = REPETICION.escalaAvion;
  if (conPropio) out.push(...primitivasAvion({ pos: [p.x, p.y + 0.0027, p.z], rumbo: p.rumbo, cabeceo: p.cabeceo, alabeo: p.alabeo, escala: e, luces: false, helice: te * (p.rpm / 60) * 1.2 }));
  // (el otro, pintado de naranja para distinguirlo)
  const naranja = c => (Array.isArray(c) ? c.map((v, i) => Math.round(v + ([236, 132, 40][i] - v) * 0.5)) : c);
  if (o) out.push(...primitivasAvion({ pos: [o.x, o.y + 0.0027, o.z], rumbo: o.rumbo, cabeceo: o.cabeceo, alabeo: o.alabeo, escala: e, luces: false, helice: te * 40 }).map(q => (q.t === 'p' ? { ...q, c: naranja(q.c) } : q)));
  if (conCaminos) {
    const camino = (lista, color) => {
      const pts = lista.filter((m, i) => i % 6 === 0 && m.t <= te).map(m => [m.x, m.y + 0.002, m.z]);
      for (let i = 1; i < pts.length; i++) out.push(linea([pts[i - 1], pts[i]], color, { a: 0.9, w: 3 }));
    };
    camino(rep.propio, rep.acierto ? [60, 140, 255] : [229, 72, 62]);
    if (rep.otro) camino(rep.otro, [255, 160, 40]);
  }
  if (rep.limite) {
    const [[ax, az], [bx, bz]] = rep.limite, y = p.y;
    out.push(linea([[ax, 0.001, az], [bx, 0.001, bz]], [214, 51, 196], { a: 0.95, w: 3 }));
    for (let k = 0; k <= 10; k++) { const x = ax + (bx - ax) * (k / 10), z = az + (bz - az) * (k / 10); out.push(linea([[x, 0, z], [x, y + 0.08, z]], [214, 51, 196], { a: 0.55, w: 2 })); }
    out.push(linea([[ax, y + 0.08, az], [bx, y + 0.08, bz]], [214, 51, 196], { a: 0.7, w: 2 }));
  }
  return out;
}
