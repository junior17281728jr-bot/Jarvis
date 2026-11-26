// 0.14.98: el modelo de vuelo del «Juego» (Vuelo libre): simple y estable, sin documento ni ventana (las pruebas lo usan
// tal cual). Una avioneta tipo Cessna 172: cabeceo, alabeo, viraje por alabeo (viraje coordinado), potencia y velocidad,
// resistencia, sustentación con el ángulo de ataque, pérdida (por debajo de unos 48 kt sin flaps), flaps, tren en el suelo,
// viento, el motor (RPM, presión y temperatura del aceite) y el combustible.
// Mundo como las escenas 3D (motor3d.js): x = este, y = arriba, z = norte; 1 unidad = 1,000 ft (como el circuito).
// Unidades del estado: kt (velocidad), ft (altitud), grados (rumbo, cabeceo, alabeo), ft/min (vs).
import { tasaDeGiro, inclinacionCoordinador, agujaAnemometro, agujasAltimetro, agujaVariometro } from './instrumentos.js';
import { pasoMotor } from './motor-piston.js';
import { efectosDanos } from './juego-danos.js';

export const VUELO = Object.freeze({
  perdidaKt: 48, // velocidad de pérdida sin flaps (alas niveladas)
  perdidaFlapsKt: 43, // con flaps
  avisoKt: 53, // el aviso de pérdida suena unos 5 kt antes
  alfaPerdida: 16, // ángulo de ataque crítico (grados)
  rotacionKt: 55, // en la carrera se puede levantar la nariz desde aquí
  rpmMax: 2700, rpmRalenti: 700,
  aceitePsiNormal: 60, aceiteTempNormal: 185, // psi y °F en verde
  combustibleGal: 40, consumoGph: 8.5,
  maxAlabeoAsistente: 30, maxAlabeo: 180, // (0.14.119: sin el Asistente, sin tope: se puede alabear como en el de verdad)
  maxCabeceoAsistente: 35, maxCabeceo: 89, // (0.14.127: sin límites, hasta la vertical)
  ftPorUnidad: 1000,
});
const G_KTS = 19.06; // g en nudos por segundo
const KT_FTS = 1.68781;
const rad = g => (g * Math.PI) / 180;
const grad = r => (r * 180) / Math.PI;
const lim = (x, a, b) => Math.min(b, Math.max(a, x));
const norm360 = g => ((g % 360) + 360) % 360;
const hacia = (a, b, paso) => (Math.abs(b - a) <= paso ? b : a + Math.sign(b - a) * paso);
const n180 = g => ((((g % 360) + 540) % 360) - 180);
// 0.14.119 (el dueño: «si quiero hacer giro puedo como en la vida real, solo que el avión actúe como en la vida real»): los
// límites de la estructura y de velocidad de un avión de categoría normal: +3.8 G (lo que dice la clase de la pérdida y el
// factor de carga) y −0.4 de eso (14 CFR 23.337); se rompe con 1.5 veces el límite (el factor de seguridad, 14 CFR 23.303).
// La VNE es la raya roja del anemómetro (163 kt, ARCOS_KT de cabina.js). Boca abajo (o con G negativos) el carburador, que
// recibe la nafta por gravedad, se queda sin combustible: el motor tose y casi no empuja.
export const LIMITES = Object.freeze({ gMax: 3.8, gMin: -1.52, seguridad: 1.5, vneKt: 163, vneRompeKt: 180, vneSeg: 8, fuente: 'PHAK cap. 5 · 14 CFR 23.303 · 14 CFR 23.337' });
// La tasa de viraje (°/s) con la sustentación inclinada: g·n·sen(alabeo)/V (en un viraje nivelado n = 1/cos: g·tan/V).
export function tasaConCarga(alabeo, kt, n) {
  const v = Math.max(kt, 30) * KT_FTS;
  return grad((32.174 * n * Math.sin(rad(alabeo))) / v);
}
// ¿Boca abajo o con G negativos? (el motor con carburador se queda sin combustible)
export const invertido = a => !a.enSuelo && (Math.cos(rad(a.alabeo ?? 0)) * Math.cos(rad(a.cabeceo ?? 0)) < -0.2 || (a.g ?? 1) < 0.1);

// La pista del aeropuerto del juego (la 36): centro, rumbo, largo y ancho en pies.
export const PISTA = Object.freeze({ x: 0, z: 0, rumbo: 360, largoFt: 4000, anchoFt: 75, nombre: '36', id: 'A' });
// 0.14.102: el aeropuerto B, a unos 10 NM al noreste, con su pista 09 (para volar de A a B y aterrizar allá).
export const PISTA_B = Object.freeze({ x: 34, z: 50, rumbo: 90, largoFt: 3500, anchoFt: 60, nombre: '09', id: 'B' });
export const PISTAS = Object.freeze([PISTA, PISTA_B]);
// La pista que corresponde a un punto: aquella en la que está; si no, la más cercana.
export function pistaDe(x, z) {
  let mejor = PISTA, d = Infinity;
  for (const p of PISTAS) { const e = enPista(x, z, p); if (e.dentro) return p; const dd = Math.hypot(x - p.x, z - p.z); if (dd < d) { d = dd; mejor = p; } }
  return mejor;
}
// 0.14.113: el lago del Juego (para practicar el amarizaje, pedido del dueño): una elipse grande y plana al suroeste del
// aeropuerto A (lejos de las dos pistas), de unos 2.3 × 5.9 NM. Unidades del mundo (1 = 1,000 ft): centro, semiejes.
export const LAGO = Object.freeze({ x: -13, z: -12, ax: 7, az: 18 });
// Qué tan adentro del lago está un punto: < 1 adentro, 1 en la orilla, > 1 afuera (la distancia «elíptica»).
export const radioLago = (x, z) => Math.hypot((x - LAGO.x) / LAGO.ax, (z - LAGO.z) / LAGO.az);
export const enAgua = (x, z) => radioLago(x, z) <= 1;
// El techo de servicio: el motor da menos con la altura (densidad); cerca de 13,500 ft sube unos 100 ft/min.
export const TECHO = Object.freeze({ servicioFt: 13500, factor: ft => Math.max(0.05, 1 - ft / 27500) });

// Dónde está un punto respecto de la pista: a lo largo (ft, + hacia el norte de la 36) y de costado (ft, + a la derecha).
export function enPista(x, z, pista = PISTA) {
  const h = rad(pista.rumbo), dx = (x - pista.x) * VUELO.ftPorUnidad, dz = (z - pista.z) * VUELO.ftPorUnidad;
  const largo = dx * Math.sin(h) + dz * Math.cos(h), costado = dx * Math.cos(h) - dz * Math.sin(h);
  return { largo, costado, dentro: Math.abs(largo) <= pista.largoFt / 2 && Math.abs(costado) <= pista.anchoFt / 2 };
}

// 0.14.117: el efecto suelo (PHAK cap. 5; AFH cap. 6: se nota hasta una envergadura sobre el suelo). Con el ala a la
// altura de su envergadura, la resistencia inducida baja apenas 1.4 %; a un cuarto, 23.5 %; a un décimo, 47.6 %. Por eso
// el avión «flota» en el redondeo y, en el despegue, puede dejar el suelo antes de tener la velocidad para subir.
// Con el mismo ángulo de ataque, algo más de sustentación (aquí, hasta un 15 % pegado al suelo).
export const EFECTO_SUELO = Object.freeze({ envergaduraFt: 36, alaFt: 7.5, tabla: Object.freeze([[0, 0.6], [0.1, 0.476], [0.25, 0.235], [1, 0.014]]), masSustentacion: 0.25, fuente: 'PHAK cap. 5 · AFH cap. 6' });
// Cuánto baja la resistencia inducida (0..0.6) a «ft» de altura (las ruedas).
export function efectoSuelo(ft) {
  const r = (Math.max(0, ft) + EFECTO_SUELO.alaFt) / EFECTO_SUELO.envergaduraFt, t = EFECTO_SUELO.tabla;
  if (r >= 1) return Math.max(0, t[3][1] * (1.5 - r) * 2); // (se apaga del todo a 1.5 envergaduras)
  for (let i = 0; i < t.length - 1; i++) if (r <= t[i + 1][0]) { const k = (r - t[i][0]) / (t[i + 1][0] - t[i][0]); return t[i][1] + (t[i + 1][1] - t[i][1]) * k; }
  return 0;
}
// 0.14.117: la pérdida sin el Asistente: un ala cae (aquí la izquierda, salvo que ya esté inclinado a la derecha; el AFH
// describe el ala que «rueda» en la pérdida) y hay que nivelar con el yugo después de bajar la nariz (AFH cap. 5).
// Grados/s² de alabeo que agrega.
export const ALA_CAE = 30;
// 0.14.117: el viento cruzado en el suelo: el avión tiende a poner la nariz hacia el viento («weathervane», AFH, glosario)
// y hay que corregir con los pedales (aquí, el yugo de costado). Grados/s por nudo de viento cruzado.
export const VELETA = 0.12;

// Coeficiente de sustentación relativo (1 = el máximo) para un ángulo de ataque; pasada la pérdida, cae.
// (0.14.118: flaps de 0 a 1.5: 10° = 0.5, 20° = 1 (como antes), 30° = 1.5; el máximo sube hasta los 20° y después casi
// no sube más: los últimos 10° dan sobre todo resistencia, como en el avión de verdad)
const cmaxFlaps = flaps => 1 + ((VUELO.perdidaKt / VUELO.perdidaFlapsKt) ** 2 - 1) * (Math.min(1, flaps) + Math.max(0, flaps - 1) * 0.2);
export function sustentacion(alfa, flaps = 0) {
  flaps = Number(flaps) || 0;
  const a0 = 2 + Math.min(1, flaps) * 3 + Math.max(0, flaps - 1) * 1; // con flaps hay sustentación con menos ángulo
  const cmax = flaps ? cmaxFlaps(flaps) : 1;
  if (alfa <= VUELO.alfaPerdida) return lim(((alfa + a0) / (VUELO.alfaPerdida + a0)) * cmax, -0.4, cmax);
  return cmax * lim(1 - (alfa - VUELO.alfaPerdida) * 0.06, 0.55, 1);
}

// 0.14.119: el ángulo de ataque que da un factor de carga n a una velocidad (para el tope del Asistente).
export function alfaParaCarga(n, kt, flaps = 0) {
  flaps = Number(flaps) || 0;
  const a0 = 2 + Math.min(1, flaps) * 3 + Math.max(0, flaps - 1) * 1, cmax = flaps ? cmaxFlaps(flaps) : 1;
  const cl = Math.min(cmax, n / Math.max(1e-6, (Math.max(kt, 1) / VUELO.perdidaKt) ** 2));
  return (cl / cmax) * (VUELO.alfaPerdida + a0) - a0;
}
// El ángulo de ataque que sostiene el vuelo nivelado a una velocidad (para la compensación).
export function alfaNivel(kt, flaps = 0) {
  flaps = Number(flaps) || 0;
  const a0 = 2 + Math.min(1, flaps) * 3 + Math.max(0, flaps - 1) * 1, cmax = flaps ? cmaxFlaps(flaps) : 1;
  const cl = Math.min(cmax * 0.95, (VUELO.perdidaKt / Math.max(kt, VUELO.perdidaKt)) ** 2);
  return (cl / cmax) * (VUELO.alfaPerdida + a0) - a0;
}

// Un avión nuevo: en la cabecera de la 36 (en el suelo) o en el aire.
export function crearAvion({ x = 0, z = -1.85, ft = 0, rumbo = 360, kt = 0, potencia = 0, enSuelo = true, flaps = 0, combustible = VUELO.combustibleGal } = {}) {
  return {
    x, z, ft, rumbo, kt, cabeceo: 0, alabeo: 0, gamma: 0, vs: 0, potencia, flaps, enSuelo, t: 0,
    // La compensación (el ángulo de ataque que el avión busca solo): en tierra, la del despegue (sube a unos 60 kt).
    trim: alfaNivel(enSuelo ? 60 : Math.max(kt, 55), flaps), p: 0, q: 0, g: 1, flapsPos: flaps,
    rpm: VUELO.rpmRalenti, aceitePsi: VUELO.aceitePsiNormal, aceiteTemp: VUELO.aceiteTempNormal, combustible,
    motor: 1, // 1 = sano; menos = pierde potencia (una falla)
    rugido: 0, // 0..1: el motor «falla» (las RPM suben y bajan)
    perdida: false, aviso: false, toque: null, choque: false, velSuelo: kt, agua: false,
  };
}

// Un paso de la simulación. mandos: { cabeceo -1..1 (atrás +), alabeo -1..1 (derecha +), potencia 0..1, flaps 0|1 }.
// ambiente: { viento: { desde (grados), kt }, rafaga(t) → { cabeceo, alabeo } (turbulencia) }. asistente: estabiliza.
// Pasos fijos de 1/60 s (estable con cualquier dt); dt se corta a 0.25 s (una pestaña dormida no hace saltar al avión).
// 0.14.127: limites (los topes de alabeo, cabeceo y G, y el nivelado suave) va aparte del Asistente (si no se dice, igual
// que el Asistente, como antes). Sin límites el avión sigue al yugo tal cual, con la física de verdad.
export function pasoVuelo(avion, mandos = {}, dt = 1 / 60, { ambiente = {}, asistente = false, limites = asistente } = {}) {
  let a = { ...avion };
  let resto = lim(dt, 0, 0.25), toque = null;
  // (0.14.113: el toque de un sub-paso que no es el último no se pierde: con cuadros lentos el juez y el resultado salían
  // solo si el avión tocaba justo en el último sub-paso)
  while (resto > 1e-9) { const h = Math.min(resto, 1 / 60); a = subpaso(a, mandos, h, ambiente, asistente, limites); toque ??= a.toque; resto -= h; }
  return toque && !a.toque ? { ...a, toque } : a;
}

function subpaso(a, m, dt, amb, asistente, limites = asistente) {
  const n = { ...a, t: a.t + dt, toque: null };
  if (n.choque) return n;
  // (0.14.118: flaps 0 · 0.5 · 1 · 1.5 = UP · 10° · 20° · 30°; true = 20°, como antes)
  // (0.14.127: con los flaps trabados por el exceso de velocidad, quedan donde estaban)
  const flaps = a.danos && (a.danos.flapAtascado || a.danos.flapAsim) ? (a.flapsPos ?? a.flaps ?? 0) : m.flaps === true ? 1 : lim(Number(m.flaps) || 0, 0, 1.5);
  n.flaps = flaps;
  n.potencia = lim(m.potencia ?? a.potencia, 0, 1);
  // ---- el motor ----
  // 0.14.103: con a.pist (motor-piston.js), el arranque, los magnetos, el selector y la mezcla (EGT, potencia, aspereza
  // y flujo de combustible); sin él, el motor de antes (siempre en marcha).
  const sinCombustible = n.combustible <= 0;
  let efectiva = sinCombustible ? 0 : n.potencia * lim(n.motor, 0, 1);
  let anda = !sinCombustible && n.motor > 0.05;
  if (a.pist) {
    n.pist = pasoMotor(a.pist, { potencia: n.potencia, ft: a.ft, combustible: n.combustible, dt, kt: a.kt });
    anda = anda && n.pist.enMarcha;
    efectiva = anda ? efectiva * n.pist.factor : 0;
  }
  // 0.14.123: los daños (juego-danos.js): la hélice o el motor golpeados empujan menos y vibran (o el motor se para).
  const ef = efectosDanos(a.danos);
  if (a.danos) { efectiva *= ef.potencia; if (ef.motorPara) anda = false; }
  // 0.14.119: boca abajo (o con G negativos) el carburador se queda sin combustible: tose y casi no empuja.
  n.tose = invertido(a);
  if (n.tose) { efectiva *= 0.15; n.rugido = Math.max(n.rugido ?? 0, 0.7); } else if (a.tose) n.rugido = 0;
  const aspero = Math.max(n.rugido, n.pist?.aspereza ?? 0, ef.rugido);
  const vibra = aspero > 0 ? aspero * 260 * Math.sin(n.t * 7.3) * Math.sin(n.t * 2.1 + 1) : 0;
  const rpmMeta = anda ? VUELO.rpmRalenti + (VUELO.rpmMax - 200 - VUELO.rpmRalenti) * efectiva + n.kt * 2 + vibra : n.pist?.girando ? 260 : (n.kt > 50 ? n.kt * 9 : 0);
  n.rpm = lim(hacia(a.rpm, rpmMeta, 1600 * dt), 0, VUELO.rpmMax + 200);
  n.combustible = Math.max(0, a.combustible - ((n.pist ? n.pist.flujoGph : VUELO.consumoGph * Math.max(0.15, efectiva)) * dt) / 3600);
  // La presión del aceite sube después del arranque (en verde en menos de 30 s) y baja al apagar.
  if (n.pist) n.aceitePsi = a.aceitePsi + ((anda ? VUELO.aceitePsiNormal : 0) - a.aceitePsi) * Math.min(1, dt / 6);
  // ---- los mandos ----
  // (0.14.127: los mandos dañados responden menos)
  const pideAlabeo = lim(m.alabeo ?? 0, -1, 1) * (n.enSuelo ? 1 : ef.autAlabeo), pideCabeceo = lim(m.cabeceo ?? 0, -1, 1) * ef.autCabeceo;
  const maxAlabeo = limites ? VUELO.maxAlabeoAsistente : VUELO.maxAlabeo, maxCab = limites ? VUELO.maxCabeceoAsistente : VUELO.maxCabeceo;
  let alfa = a.cabeceo - grad(a.gamma);
  if (n.enSuelo) {
    // En el suelo: el alabeo es la dirección (pedales y rueda de nariz); la nariz se levanta con velocidad.
    // (0.14.123: con el tren roto, quedado inclinado hacia ese lado)
    n.alabeo = hacia(a.alabeo, ef.inclinacion, 30 * dt);
    n.hundido = hacia(a.hundido ?? 0, ef.hundido, 4 * dt); // (0.14.127: con el tren roto, apoyado en la panza)
    // (el viento cruzado gira la nariz hacia el viento, más cuanto más rápido rueda, hasta unos 15 kt; en el agua también)
    const w0 = amb.viento ?? { desde: 0, kt: 0 }, cruzado = (w0.kt ?? 0) * Math.sin(rad((w0.desde ?? 0) - a.rumbo));
    n.rumbo = norm360(a.rumbo + pideAlabeo * 14 * lim(a.kt / 20, 0, 1) * dt + VELETA * cruzado * lim(a.kt / 15, 0, 1) * dt + ef.tiron * lim(a.kt / 20, 0, 1) * dt);
    const puede = a.kt >= VUELO.rotacionKt - 8 ? 12 : 0;
    n.cabeceo = lim(a.cabeceo + (pideCabeceo > 0.1 ? 8 : -6) * dt, 0, puede);
    alfa = n.cabeceo;
  } else {
    // Alabeo con inercia: la tasa (p) va hacia lo que pide el yugo en unos 0.35 s (con amortiguación).
    let pMeta = pideAlabeo * 50;
    if (limites && Math.abs(pideAlabeo) < 0.08) pMeta = lim(-a.alabeo * 0.6, -10, 10); // nivela, suave
    n.p = (a.p ?? 0) + (pMeta - (a.p ?? 0)) * Math.min(1, dt / 0.35) + ef.alabeo * dt; // (0.14.123: un ala dañada tira)
    n.alabeo = maxAlabeo >= 180 ? n180(a.alabeo + n.p * dt) : lim(a.alabeo + n.p * dt, -maxAlabeo, maxAlabeo);
    // (0.14.127: la cola dañada: la nariz se va sola y, muy dañada, oscila cada vez más; hay que pelear con el yugo)
    // (el reloj de la oscilación corre solo desde que la cola está muy dañada: crece de a poco, no de golpe)
    n.osc = ef.oscila > 0 ? (a.osc ?? 0) + dt : 0;
    const colaMal = ef.cabeceoExtra + ef.oscila * Math.sin(n.osc * 1.6) * Math.min(14, 3 + n.osc * 0.6);
    // La estabilidad del avión (como uno compensado): con el yugo suelto el ángulo de ataque vuelve al compensado (en
    // ~0.5 s) y la nariz sigue a la trayectoria (con algo de amortiguación del fugoide); con el yugo movido, el cabeceo tiene
    // inercia (q tarda ~0.25 s en tomar la tasa) y la compensación lo sigue. En un viraje la compensación no alcanza: la
    // sustentación se inclina y hay que tirar (el avión no lo hace solo).
    const trim = a.trim ?? alfaNivel(a.kt, flaps);
    n.trim = trim;
    let cab;
    if (Math.abs(pideCabeceo) < 0.08) {
      // (0.14.119: la amortiguación del fugoide actúa sobre el plano del ala: inclinado, ayuda menos; boca abajo, nada. Un
      // viraje sin tirar baja y la nariz cae, como en el avión de verdad)
      const alfaMeta = trim - 1.0 * (a.dgamma ?? 0) * Math.max(0, Math.cos(rad(a.alabeo))) + colaMal;
      cab = alfa + (alfaMeta - alfa) * Math.min(1, dt / 0.5) + grad(a.gamma);
      n.q = (cab - a.cabeceo) / dt;
    } else {
      n.trim = trim + lim(alfa - trim, -5, 5) * dt;
      n.q = (a.q ?? 0) + (pideCabeceo * 14 + colaMal * 1.6 - (a.q ?? 0)) * Math.min(1, dt / 0.25);
      cab = a.cabeceo + n.q * dt;
    }
    const alfaN = cab - grad(a.gamma);
    // El Asistente es una ayuda suave: nunca deja pasar de 12° de ataque (no hay pérdida); no fija la altura ni la subida.
    // (0.14.119: y tampoco deja pasar de unos 3.3 G: con el Asistente, quien empieza no rompe el avión al tirar rápido)
    const alfaG = alfaParaCarga(3.3, a.kt, flaps);
    if (limites && alfaN > Math.min(12, alfaG)) { cab = Math.min(12, alfaG) + grad(a.gamma); n.q = Math.min(n.q ?? 0, 0); }
    // En pérdida, la nariz cae sola (y sin el Asistente, también un ala).
    if (alfaN > VUELO.alfaPerdida) {
      cab -= ((alfaN - VUELO.alfaPerdida) * 6 + 12) * dt;
      if (!limites) n.p += (a.alabeo > 2 ? 1 : -1) * ALA_CAE * dt;
    }
    n.cabeceo = lim(cab, limites ? -40 : -maxCab, maxCab);
    alfa = n.cabeceo - grad(a.gamma);
  }
  // ---- velocidad ----
  const empuje = 4.5 * efectiva * (1 - a.kt / 230) * TECHO.factor(a.ft);
  const ge = a.agua ? 0 : efectoSuelo(a.ft);
  n.efectoSuelo = n.enSuelo ? 0 : ge;
  const resistencia = 0.000163 * a.kt * a.kt + flaps * 0.0002 * a.kt * a.kt + Math.max(0, alfa) ** 2 * 0.012 * (1 - ge) + (n.enSuelo ? 0.8 + (n.potencia < 0.05 && a.kt < 70 ? 4 : 0) : 0);
  let kt = a.kt + (empuje - resistencia - G_KTS * Math.sin(a.gamma)) * dt;
  kt = Math.max(0, kt);
  // ---- trayectoria (gamma: el ángulo de la trayectoria) ----
  const vMin = Math.max(kt, 20);
  const cl = sustentacion(alfa, flaps) * (1 + EFECTO_SUELO.masSustentacion * ge);
  const sobreW = (kt / VUELO.perdidaKt) ** 2 * cl * ef.sustentacion; // sustentación / peso (0.14.127: con las alas dobladas, menos)
  // El factor de carga (g): la sustentación sobre el peso (en tierra, 1).
  n.g = n.enSuelo ? 1 : sobreW;
  n.perdida = !n.enSuelo && alfa > VUELO.alfaPerdida;
  n.aviso = !n.enSuelo && (alfa > VUELO.alfaPerdida - 3 || kt < (flaps ? VUELO.perdidaFlapsKt : VUELO.perdidaKt) + 5);
  let gamma = a.gamma;
  if (n.enSuelo) {
    gamma = 0;
    // (en el agua no se despega: el avión flota y se frena)
    if (sobreW > 1.02 && kt > VUELO.rotacionKt - 4 && !a.agua) { n.enSuelo = false; gamma = rad(1); }
  } else {
    const dg = (G_KTS / vMin) * (sobreW * Math.cos(rad(n.alabeo)) - Math.cos(a.gamma));
    gamma = lim(a.gamma + dg * dt * 0.9, rad(limites ? -60 : -88), rad(limites ? 40 : 88)); // (0.14.127: sin límites, hasta casi vertical)
    const rafaga = amb.rafaga ? amb.rafaga(n.t) : null;
    if (rafaga) { n.alabeo += rafaga.alabeo * dt; n.cabeceo += rafaga.cabeceo * dt; gamma += rad(rafaga.cabeceo * 0.4) * dt; }
    // (0.14.119: hasta 60° la fórmula del viraje coordinado; más allá, la sustentación inclinada de verdad, también boca abajo)
    n.rumbo = norm360(a.rumbo + (Math.abs(n.alabeo) <= 60 ? tasaDeGiro(n.alabeo, Math.max(kt, 30)) : tasaConCarga(n.alabeo, kt, Math.max(0.3, Math.abs(sobreW)))) * dt + ef.guinada * dt); // (la cola dañada: la nariz se va de costado)
  }
  n.dgamma = grad(gamma - a.gamma) / dt; n.gamma = gamma; n.kt = kt;
  n.vs = kt * KT_FTS * Math.sin(gamma) * 60;
  // 0.14.119: las corrientes de la tormenta (ft/min, arriba +): suben o bajan al avión con todo.
  if (!n.enSuelo && amb.vertical) n.vs += amb.vertical;
  // ---- posición (aire + viento) ----
  const v = kt * KT_FTS * Math.cos(gamma); // ft/s horizontal
  const h = rad(n.rumbo);
  const w = amb.viento ?? { desde: 0, kt: 0 };
  const hw = rad(w.desde), vw = (w.kt ?? 0) * KT_FTS; // el viento SOPLA hacia desde + 180
  const vx = v * Math.sin(h) - vw * Math.sin(hw), vz = v * Math.cos(h) - vw * Math.cos(hw);
  const enRueda = n.enSuelo ? 1 : 0;
  // En el suelo el viento no arrastra (las ruedas), salvo que vuele.
  n.x = a.x + ((enRueda ? v * Math.sin(h) : vx) * dt) / VUELO.ftPorUnidad;
  n.z = a.z + ((enRueda ? v * Math.cos(h) : vz) * dt) / VUELO.ftPorUnidad;
  n.velSuelo = Math.hypot(enRueda ? v * Math.sin(h) : vx, enRueda ? v * Math.cos(h) : vz) / KT_FTS;
  n.ft = a.ft + (n.enSuelo ? 0 : (n.vs / 60) * dt);
  // ---- tocar el suelo ----
  if (!n.enSuelo && n.ft <= 0) {
    const pista = pistaDe(n.x, n.z), p = enPista(n.x, n.z, pista);
    // 0.14.113: en el lago, el toque es un amarizaje (agua: true): no rebota y el agua frena muy rápido.
    const agua = enAgua(n.x, n.z);
    n.toque = { kt: a.kt, vs: a.vs, alabeo: a.alabeo, cabeceo: a.cabeceo, costado: p.costado, largo: p.largo, dentro: p.dentro && !agua, rumbo: n.rumbo, pista: pista.id, ...(agua ? { agua: true } : {}) };
    n.ft = 0; n.enSuelo = true; n.gamma = 0; n.vs = 0; n.alabeo = 0; n.cabeceo = Math.max(0, Math.min(n.cabeceo, 8)); n.p = 0; n.q = 0; n.agua = agua;
    if (a.vs < -1000 || Math.abs(a.alabeo) > 25 || a.cabeceo < -8) { n.choque = true; n.kt = 0; }
    // Un toque duro rebota: las ruedas devuelven parte del golpe (un salto chico). En el agua, no.
    else if (a.vs < -ATERRIZAJE.vsDuroFpm && !agua) { n.enSuelo = false; n.ft = 0.5; n.gamma = rad(Math.min(4, (-a.vs * 0.3) / (Math.max(a.kt, 30) * KT_FTS * 60) * 57.3)); n.vs = -a.vs * 0.3; n.toque.rebote = true; }
  }
  if (n.enSuelo) {
    n.ft = 0;
    n.agua = enAgua(n.x, n.z);
    // En el agua, la resistencia del agua frena en pocos segundos y el avión queda flotando; fuera de la pista, el pasto
    // frena más.
    if (n.agua) n.kt = Math.max(0, n.kt - (AMARIZAJE.frenoKtS + AMARIZAJE.frenoPorKt * n.kt) * dt);
    else if (!enPista(n.x, n.z, pistaDe(n.x, n.z)).dentro) n.kt = Math.max(0, n.kt - 3 * dt);
    // 0.14.118: los frenos (0..1: el pedal o el freno de mano): hasta ~10 kt por segundo (más que el empuje a fondo: con
    // el freno de mano puesto el avión no se mueve).
    if (!n.agua && (m.freno ?? 0) > 0) n.kt = Math.max(0, n.kt - lim(m.freno, 0, 1) * 10 * dt);
    if (!n.agua && ef.frenoSuelo) n.kt = Math.max(0, n.kt - ef.frenoSuelo * dt);
  } else n.agua = false;
  // Los flaps bajan y suben despacio (para el indicador: unos 4 s).
  n.flapsPos = hacia(a.flapsPos ?? flaps, flaps, dt / 4);
  return n;
}

// Lo que conviene hacer ahora (la clave del consejo que se muestra arriba). Solo lee el estado.
export function consejo(a, { vuelo = false } = {}) {
  if (a.choque) return 'choque';
  if (a.perdida || a.aviso) return 'perdida';
  if (a.enSuelo) {
    if (a.agua) return 'flotando';
    if (vuelo) return a.kt < 3 ? 'detenido' : 'rodando';
    if (a.potencia < 0.9 && a.kt < VUELO.rotacionKt) return 'potencia';
    return a.kt < VUELO.rotacionKt ? 'acelera' : 'rotar';
  }
  if (a.ft < 500 && a.vs > 0) return 'subir';
  // 0.14.117: a menos de una envergadura sobre la pista (o su final corta), bajando: el redondeo (el efecto suelo lo hace flotar).
  if (a.ft < EFECTO_SUELO.envergaduraFt && !enAgua(a.x, a.z)) for (const pista of PISTAS) {
    const p = enPista(a.x, a.z, pista);
    if (p.largo > -pista.largoFt / 2 - 1500 && p.largo < pista.largoFt / 2 && Math.abs(p.costado) < 400) return 'redondeo';
  }
  // En final de cualquiera de las pistas: alineado (± 30°), antes del umbral y bajo.
  for (const pista of PISTAS) {
    const p = enPista(a.x, a.z, pista);
    const rumboDif = Math.abs((((a.rumbo - pista.rumbo) % 360) + 540) % 360 - 180);
    if (p.largo < -pista.largoFt / 2 && p.largo > -26000 && Math.abs(p.costado) < 3000 && rumboDif < 30 && a.ft < 1500) return a.kt > 80 ? 'final_rapido' : 'final';
  }
  return 'volver';
}

// El juez del aterrizaje (en el toque): velocidad, régimen de descenso y eje.
// → { nivel: 'bueno' | 'firme' | 'duro' | 'fuera' | 'choque', motivos: [claves], puntos }
export const ATERRIZAJE = Object.freeze({ vsBuenoFpm: 300, vsDuroFpm: 600, ktMax: 75, ejeBuenoFt: 15, alabeoMax: 8 });
export function juzgarAterrizaje(toque, { choque = false } = {}) {
  if (!toque) return null;
  const motivos = [];
  const vs = -Math.min(0, toque.vs);
  if (choque) return { nivel: 'choque', motivos: ['choque'], puntos: 0 };
  if (!toque.dentro) return { nivel: 'fuera', motivos: ['fuera'], puntos: 0 };
  if (vs > ATERRIZAJE.vsDuroFpm) motivos.push('descenso');
  if (Math.abs(toque.alabeo) > ATERRIZAJE.alabeoMax) motivos.push('alas');
  if (toque.kt > ATERRIZAJE.ktMax) motivos.push('rapido');
  if (motivos.length) return { nivel: 'duro', motivos, puntos: 50 };
  const firme = vs > ATERRIZAJE.vsBuenoFpm || Math.abs(toque.costado) > ATERRIZAJE.ejeBuenoFt;
  if (firme) return { nivel: 'firme', motivos: [vs > ATERRIZAJE.vsBuenoFpm ? 'descenso_firme' : 'eje'], puntos: 150 };
  return { nivel: 'bueno', motivos: [], puntos: 300 };
}

// 0.14.113: el juez del AMARIZAJE (en el lago). La FAA: un avión amarizado a la velocidad mínima y en la actitud normal de
// aterrizaje no se hunde enseguida (AFH cap. 18). Se usan los mismos números del juez de la pista (ATERRIZAJE) y la
// misma regla del choque (más de 1,000 ft/min, más de 25° de alabeo o la nariz más de 8° abajo).
// Con vida («amarizaje_vivos»): sin choque, a lo sumo 600 ft/min, alas casi niveladas (8°), la nariz arriba (≥ 0°) y
// despacio (a lo sumo 75 kt). Si falla algo de eso, «amarizaje_duro». → { nivel, motivos, puntos }
export const AMARIZAJE = Object.freeze({ vsMaxFpm: ATERRIZAJE.vsDuroFpm, alabeoMax: ATERRIZAJE.alabeoMax, ktMax: ATERRIZAJE.ktMax, cabeceoMin: 0, frenoKtS: 8, frenoPorKt: 0.3, fuente: 'AFH cap. 18 · AIM 6-3-3' });
export function juzgarAmarizaje(toque, { choque = false } = {}) {
  if (!toque) return null;
  if (choque) return { nivel: 'choque', motivos: ['choque_agua'], puntos: 0 };
  const motivos = [];
  const vs = -Math.min(0, toque.vs);
  if (vs > AMARIZAJE.vsMaxFpm) motivos.push('descenso_agua');
  if (Math.abs(toque.alabeo) > AMARIZAJE.alabeoMax) motivos.push('alas_agua');
  if (toque.cabeceo < AMARIZAJE.cabeceoMin) motivos.push('nariz');
  if (toque.kt > AMARIZAJE.ktMax) motivos.push('rapido_agua');
  if (motivos.length) return { nivel: 'amarizaje_duro', motivos, puntos: 50 };
  return { nivel: 'amarizaje_vivos', motivos: ['amarizaje_vivos'], puntos: 300 };
}
// El juez que toca: en el agua, el del amarizaje; si no, el de la pista.
export const juzgarToque = (toque, opciones = {}) => (toque?.agua ? juzgarAmarizaje(toque, opciones) : juzgarAterrizaje(toque, opciones));

// Lo que marcan los instrumentos (los valores y el ángulo de cada aguja, con la misma matemática que el panel de las clases).
export function lecturas(a) {
  const giro = tasaDeGiro(a.enSuelo ? 0 : a.alabeo, Math.max(a.kt, 1));
  const alt = agujasAltimetro(a.ft);
  return {
    kt: a.kt, ft: a.ft, rumbo: norm360(a.rumbo), cabeceo: a.cabeceo, alabeo: a.alabeo, vs: a.vs,
    tasaGiro: a.kt > 1 ? giro : 0, rpm: a.rpm, aceitePsi: a.aceitePsi, aceiteTemp: a.aceiteTemp, combustible: a.combustible,
    perdida: a.perdida, aviso: a.aviso,
    agujas: {
      kt: agujaAnemometro(a.kt), cien: alt.cien, mil: alt.mil, diezmil: alt.diezmil, vs: agujaVariometro(a.vs),
      coordinador: a.kt > 1 ? inclinacionCoordinador(giro) : 0, rumbo: -norm360(a.rumbo),
      rpm: agujaRpm(a.rpm), aceitePsi: agujaArco(a.aceitePsi, 0, 115), aceiteTemp: agujaArco(a.aceiteTemp, 75, 250), combustible: agujaArco(a.combustible, 0, VUELO.combustibleGal),
    },
  };
}
// Tacómetro: 0 a 3,500 RPM en 270° (de las 7 y media a las 4 y media).
export const agujaRpm = rpm => -135 + (lim(rpm, 0, 3500) / 3500) * 270;
// Los relojes chicos del motor (presión, temperatura y combustible): un arco de 120° (de -60° a +60°).
export const agujaArco = (v, min, max) => -60 + (lim((v - min) / (max - min), 0, 1)) * 120;

// Las fallas del motor: «aceite» (la presión baja, la temperatura sube, el motor tose y al final se para).
// t: segundos desde que empezó. → { aceitePsi, aceiteTemp, motor, rugido }
export function fallaAceite(t) {
  const k = lim(t / 40, 0, 1);
  const psi = VUELO.aceitePsiNormal - 48 * k;
  return { aceitePsi: psi, aceiteTemp: VUELO.aceiteTempNormal + 60 * k, motor: t < 60 ? 1 - 0.4 * k : Math.max(0, 0.6 - (t - 60) / 10), rugido: lim(t / 15, 0, 1) * (t < 70 ? 1 : 0) };
}

// Lo que marcan los instrumentos con su retraso de verdad: el variómetro tarda unos segundos en mostrar el cambio (sigue la
// tendencia) y el altímetro, un poquito. prev: lo indicado antes (o null). → { vs, ft }
export const RETRASO = Object.freeze({ vsiS: 2.5, altimetroS: 0.3 });
export function indicar(prev, a, dt) {
  if (!prev) return { vs: a.vs, ft: a.ft };
  const k = s => Math.min(1, dt / s);
  return { vs: prev.vs + (a.vs - prev.vs) * k(RETRASO.vsiS), ft: prev.ft + (a.ft - prev.ft) * k(RETRASO.altimetroS) };
}
// La pérdida sube con el factor de carga: Vs × √n.
export const perdidaConCarga = (n, flaps = 0) => (flaps ? VUELO.perdidaFlapsKt : VUELO.perdidaKt) * Math.sqrt(Math.max(0, n));
