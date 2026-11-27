// 0.14.98: el modelo de vuelo del «Juego» (Vuelo libre): simple y estable, sin documento ni ventana (las pruebas lo usan
// tal cual). Una avioneta tipo Cessna 172: cabeceo, alabeo, viraje por alabeo (viraje coordinado), potencia y velocidad,
// resistencia, sustentación con el ángulo de ataque, pérdida (por debajo de unos 48 kt sin flaps), flaps, tren en el suelo,
// viento, el motor (RPM, presión y temperatura del aceite) y el combustible.
// Mundo como las escenas 3D (motor3d.js): x = este, y = arriba, z = norte; 1 unidad = 1,000 ft (como el circuito).
// Unidades del estado: kt (velocidad), ft (altitud), grados (rumbo, cabeceo, alabeo), ft/min (vs).
import { tasaDeGiro, inclinacionCoordinador, agujaAnemometro, agujasAltimetro, agujaVariometro } from './instrumentos.js';
import { pasoMotor } from './motor-piston.js';
import { efectosDanos, clasificarImpacto } from './juego-danos.js';

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
// 0.14.131: el pasto frena más que el asfalto (kt/s, con todo el peso sobre las ruedas; con el ala sosteniendo, menos).
export const SUELO = Object.freeze({ pastoKtS: 1.5 });

// Coeficiente de sustentación relativo (1 = el máximo) para un ángulo de ataque; pasada la pérdida, cae.
// (0.14.118: flaps de 0 a 1.5: 10° = 0.5, 20° = 1 (como antes), 30° = 1.5; el máximo sube hasta los 20° y después casi
// no sube más: los últimos 10° dan sobre todo resistencia, como en el avión de verdad)
const cmaxFlaps = flaps => 1 + ((VUELO.perdidaKt / VUELO.perdidaFlapsKt) ** 2 - 1) * (Math.min(1, flaps) + Math.max(0, flaps - 1) * 0.2);
export function sustentacion(alfa, flaps = 0) {
  flaps = Number(flaps) || 0;
  const a0 = 2 + Math.min(1, flaps) * 3 + Math.max(0, flaps - 1) * 1; // con flaps hay sustentación con menos ángulo
  const cmax = flaps ? cmaxFlaps(flaps) : 1;
  if (alfa <= VUELO.alfaPerdida) return lim(((alfa + a0) / (VUELO.alfaPerdida + a0)) * cmax, -0.4, cmax);
  return cmax * lim(1 - (alfa - VUELO.alfaPerdida) * 0.09, 0.55, 1); // (0.14.127: la rotura, más marcada)
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

// 0.14.127: la física del aire (vuelo-modelo: «la gravedad, que sea más realista»). La resistencia como la de un avión de
// entrenamiento: la parásita crece con la velocidad al cuadrado y la inducida con el factor de carga al cuadrado y a poca
// velocidad (D/W = parásito·x + inducido·n²/x, x = (V/Vs)²); sin motor (o en ralentí) la hélice que gira con el viento frena
// más. Con estos números (los del modelo, no de un manual): planeo de ~8.5:1 cerca de 67 kt, ~120 kt a fondo, ~700 ft/min de
// subida a nivel del mar.
export const ARRASTRE = Object.freeze({ parasito: 0.0181, inducido: 0.115, flaps: 0.0133, helice: 0.012, empujeKtS: 5.0, empujeCeroKt: 280 });
// El empuje (kt/s): la hélice empuja menos con la velocidad y con la altura; sin potencia, frena (gira con el viento).
export function empujeDe(efectiva, kt, ft) {
  const x = (kt / VUELO.perdidaKt) ** 2;
  return ARRASTRE.empujeKtS * efectiva * Math.max(0, 1 - kt / ARRASTRE.empujeCeroKt) * TECHO.factor(ft) - G_KTS * ARRASTRE.helice * x * (1 - Math.min(1, efectiva * 4));
}
// El yugo a fondo: el ángulo de ataque que pide (atrás, pasado el crítico: se puede entrar en pérdida a cualquier velocidad;
// adelante, negativo: G negativos).
export const YUGO = Object.freeze({ alfaAtras: 24, alfaAdelante: -12, curva: 1.4 });
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const escalar = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const sumar = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = a => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
// Girar el vector a alrededor del eje e (unitario) un ángulo (rad, regla de la mano derecha con e).
const girar = (a, e, ang) => { const c = Math.cos(ang), s = Math.sin(ang), k = punto(e, a), x = cruz(e, a); return [a[0] * c + x[0] * s + e[0] * k * (1 - c), a[1] * c + x[1] * s + e[1] * k * (1 - c), a[2] * c + x[2] * s + e[2] * k * (1 - c)]; };
const firmaDe = a => `${a.cabeceo}|${a.alabeo}|${a.rumbo}|${a.gamma}`;
// Los vectores del estado: los que dejó el último paso, o (si alguien cambió los ángulos: el comienzo, el despegue, el rebote,
// una prueba) armados de los ángulos: v con el rumbo y la trayectoria, l inclinada con el alabeo, el ataque = cabeceo − trayectoria.
function ejesDe(a) {
  if (a.ejes && a.ejes.firma === firmaDe(a)) return a.ejes;
  const g = a.gamma ?? 0, h = rad(a.rumbo ?? 0), mu = rad(a.alabeo ?? 0);
  const v = [Math.cos(g) * Math.sin(h), Math.sin(g), Math.cos(g) * Math.cos(h)];
  const u0 = [-Math.sin(g) * Math.sin(h), Math.cos(g), -Math.sin(g) * Math.cos(h)], r0 = [Math.cos(h), 0, -Math.sin(h)];
  // (el ala derecha abajo: l se inclina a la derecha; derecha = l × v)
  const l = sumar(escalar(u0, Math.cos(mu)), escalar(r0, Math.sin(mu)));
  return { v, l, alfa: (a.cabeceo ?? 0) - grad(g) };
}
// Con los límites: la sustentación no se inclina más de max grados (respecto de la vertical que pasa por v).
function bancoMax(v, l, max) {
  const der = norm(cruz([0, 1, 0], v)), u0 = cruz(v, der); // der: a la derecha; u0: «arriba» en el plano vertical de v
  const mu = Math.atan2(punto(l, der), punto(l, u0)), m = rad(max);
  if (Math.abs(mu) <= m) return l;
  const k = Math.sign(mu) * m;
  return norm(sumar(escalar(u0, Math.cos(k)), escalar(der, Math.sin(k))));
}
// Los ángulos de la escena (grados) del cuerpo del avión: la nariz es v girada «alfa» hacia l.
function angulosDe(v, l, alfa, rumboAntes = 0) {
  const ca = Math.cos(rad(alfa)), sa = Math.sin(rad(alfa));
  const f = sumar(escalar(v, ca), escalar(l, sa)), u = sumar(escalar(l, ca), escalar(v, -sa)), der = cruz(u, f);
  const th = Math.asin(lim(f[1], -1, 1));
  const psi = Math.hypot(f[0], f[2]) > 1e-6 ? Math.atan2(f[0], f[2]) : rad(rumboAntes);
  const uh = [-Math.sin(th) * Math.sin(psi), Math.cos(th), -Math.sin(th) * Math.cos(psi)], rh = [Math.cos(psi), 0, -Math.sin(psi)];
  const fi = Math.atan2(-punto(der, uh), punto(der, rh));
  return { cabeceo: grad(th), alabeo: grad(fi), rumbo: norm360(grad(psi)) };
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
  // 0.14.130: el ala dañada pierde combustible; el motor golpeado se gasta de a poco (más rápido con más potencia): la presión
  // del aceite baja y la temperatura sube en los relojes, después anda áspero y, gastado del todo, se para.
  if (ef.fugaGph) n.combustible = Math.max(0, n.combustible - (ef.fugaGph * dt) / 3600);
  if (ef.desgasteS && anda && (a.danos.motorDesgaste ?? 0) < 1) n.danos = { ...a.danos, motorDesgaste: Math.min(1, (a.danos.motorDesgaste ?? 0) + (dt / ef.desgasteS) * (0.3 + 0.7 * n.potencia)) };
  const gasto = n.danos?.motorDesgaste ?? 0;
  if (gasto > 0) { n.aceitePsi = Math.min(n.aceitePsi, VUELO.aceitePsiNormal * (1 - 0.85 * gasto)); n.aceiteTemp = Math.max(n.aceiteTemp ?? VUELO.aceiteTempNormal, VUELO.aceiteTempNormal + 75 * gasto); }
  // ---- los mandos ----
  // (0.14.127: los mandos dañados responden menos)
  const pideAlabeo = lim(m.alabeo ?? 0, -1, 1) * (n.enSuelo ? 1 : ef.autAlabeo), pideCabeceo = lim(m.cabeceo ?? 0, -1, 1) * ef.autCabeceo;
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
    // ---- velocidad en el suelo (el empuje, el aire y la rodadura) ----
    const alfa = n.cabeceo;
    const resistencia = 0.000163 * a.kt * a.kt + flaps * 0.0002 * a.kt * a.kt + Math.max(0, alfa) ** 2 * 0.012 + 0.8 + (n.potencia < 0.05 && a.kt < 70 ? 4 : 0);
    const cl = sustentacion(alfa, flaps) * (1 + EFECTO_SUELO.masSustentacion * EFECTO_SUELO.tabla[0][1]);
    // 0.14.131 (el dueño: «si se daña una rueda, el avión puede seguir acelerando y arrancar»): el roce de lo que se arrastra
    // (la panza, la rueda doblada, la goma, el pasto) es una fricción con el peso que carga el suelo: con más velocidad el ala
    // sostiene más y el roce baja. Nada lo traba: a fondo, el empuje puede más y el avión acelera y puede despegar.
    const carga = lim(1 - (a.kt / VUELO.perdidaKt) ** 2 * cl * ef.sustentacion, 0, 1);
    const roce = a.agua ? 0 : ((ef.frenoSuelo ?? 0) + (enPista(a.x, a.z, pistaDe(a.x, a.z)).dentro ? 0 : SUELO.pastoKtS)) * carga;
    const kt = Math.max(0, a.kt + (empujeDe(efectiva, a.kt, a.ft) - resistencia - roce) * dt);
    const sobreW = (kt / VUELO.perdidaKt) ** 2 * cl * ef.sustentacion;
    n.g = 1; n.perdida = false; n.aviso = false; n.efectoSuelo = 0; n.alfa = alfa; n.ejes = null;
    let gamma = 0;
    // (en el agua no se despega: el avión flota y se frena)
    if (sobreW > 1.02 && kt > VUELO.rotacionKt - 4 && !a.agua) { n.enSuelo = false; gamma = rad(1); }
    n.dgamma = grad(gamma - (a.gamma ?? 0)) / dt; n.gamma = gamma; n.kt = kt; n.q = 0;
    n.vs = kt * KT_FTS * Math.sin(gamma) * 60;
    const v = kt * KT_FTS * Math.cos(gamma), h = rad(n.rumbo);
    // En el suelo el viento no arrastra (las ruedas).
    n.x = a.x + (v * Math.sin(h) * dt) / VUELO.ftPorUnidad;
    n.z = a.z + (v * Math.cos(h) * dt) / VUELO.ftPorUnidad;
    n.velSuelo = v / KT_FTS;
    n.ft = a.ft + (n.enSuelo ? 0 : (n.vs / 60) * dt);
  } else {
    // 0.14.127 (el dueño: «la gravedad, que sea más realista»): en el aire, la física de verdad con vectores (sin ángulos que
    // se traben en la vertical): la dirección de la velocidad (v) y la de la sustentación (l, perpendicular a v). El yugo
    // pide un ángulo de ataque (como el timón de profundidad de verdad: suelto, vuelve al compensado); la sustentación curva
    // la trayectoria, la gravedad la tira hacia abajo, el empuje y la resistencia (con la inducida, que crece con los G y a
    // poca velocidad) cambian la velocidad. Así salen solos el rizo, el vuelo invertido, el arco balístico con 0 G, la
    // velocidad que se pierde al subir y se gana al bajar y la pérdida con su caída. El cabeceo, el alabeo, el rumbo y la
    // trayectoria se calculan de los vectores (para la escena, los relojes y los jueces).
    const E = ejesDe(a);
    let v = E.v, l = E.l, alfa = E.alfa;
    const V0 = Math.max(a.kt, 1);
    // -- alabeo: la tasa (p) va hacia lo que pide el yugo en ~0.35 s; los alerones pueden más con más velocidad --
    const autoridad = lim(V0 / 100, 0.3, 1.25);
    let pMeta = pideAlabeo * 48 * autoridad;
    if (limites && Math.abs(pideAlabeo) < 0.08) pMeta = lim(-a.alabeo * 0.6, -10, 10); // nivela, suave
    n.p = (a.p ?? 0) + (pMeta - (a.p ?? 0)) * Math.min(1, dt / 0.35) + ef.alabeo * dt; // (0.14.123: un ala dañada tira)
    // En pérdida (sin límites) un ala cae.
    if (!limites && alfa > VUELO.alfaPerdida) n.p += (a.alabeo > 2 ? 1 : -1) * ALA_CAE * dt;
    if (limites && ((a.alabeo >= VUELO.maxAlabeoAsistente && n.p > 0) || (a.alabeo <= -VUELO.maxAlabeoAsistente && n.p < 0))) n.p = 0;
    l = girar(l, v, -rad(n.p * dt)); // (alrededor de v, hacia la derecha: ángulo negativo con la mano derecha)
    // -- cabeceo: el ángulo de ataque va hacia lo que pide el yugo (con inercia: más lento a poca velocidad) --
    n.osc = ef.oscila > 0 ? (a.osc ?? 0) + dt : 0; // (la cola muy dañada: oscila cada vez más)
    const colaMal = ef.cabeceoExtra + ef.oscila * Math.sin(n.osc * 1.6) * Math.min(14, 3 + n.osc * 0.6);
    const trim = a.trim ?? alfaNivel(a.kt, flaps);
    n.trim = trim;
    let alfaMeta;
    if (Math.abs(pideCabeceo) < 0.08) {
      // Suelto: vuelve al ángulo de ataque compensado (la estabilidad).
      alfaMeta = trim - 0.3 * (a.dgamma ?? 0) * Math.max(0, Math.cos(rad(a.alabeo))); // (un poco de amortiguación del fugoide, de unos 20 s)
    } else {
      // (más fino cerca del centro, todo el recorrido a fondo: |yugo|^1.4)
      const k = Math.sign(pideCabeceo) * Math.abs(pideCabeceo) ** YUGO.curva;
      alfaMeta = k > 0 ? trim + k * (YUGO.alfaAtras - trim) : trim + k * (trim - YUGO.alfaAdelante);
      // (con el Asistente, la compensación sigue al yugo de a poco, como un piloto que compensa: solo volando más o menos
      // derecho, con ~1 G; en un rizo o un viraje cerrado, no: al soltar, el avión vuelve a lo que estaba compensado)
      if (asistente && Math.abs((a.g ?? 1) - 1) < 0.35) n.trim = lim(trim + lim(alfa - trim, -2, 2) * 0.5 * dt, -2, 12);
    }
    alfaMeta += colaMal;
    if (limites) {
      // Con los límites: nunca más de 12° de ataque (no hay pérdida) ni de ~3.3 G; la nariz entre −40° y +35°.
      alfaMeta = Math.min(alfaMeta, Math.min(12, alfaParaCarga(3.3, a.kt, flaps)));
      if (a.cabeceo > VUELO.maxCabeceoAsistente) alfaMeta = Math.min(alfaMeta, alfa - (a.cabeceo - VUELO.maxCabeceoAsistente) * 3);
      if (a.cabeceo < -40) alfaMeta = Math.max(alfaMeta, alfa + (-40 - a.cabeceo) * 3);
    }
    const tau = lim((0.3 * 90) / Math.max(V0, 30), 0.2, 0.7);
    alfa += (alfaMeta - alfa) * Math.min(1, dt / tau);
    // En pérdida, la nariz cae sola (el ala deja de sostener la cola).
    if (alfa > VUELO.alfaPerdida) alfa -= ((alfa - VUELO.alfaPerdida) * 3 + 4) * dt;
    if (limites) alfa = Math.min(alfa, Math.max(12, alfaMeta));
    // -- la turbulencia --
    const rafaga = amb.rafaga ? amb.rafaga(n.t) : null;
    if (rafaga) { l = girar(l, v, -rad(rafaga.alabeo * dt)); alfa += rafaga.cabeceo * dt; v = norm(sumar(v, escalar(l, rad(rafaga.cabeceo * 0.4) * dt))); }
    // -- las fuerzas (en kt/s; G_KTS es 1 g) --
    const ge = efectoSuelo(a.ft - (amb.sueloFt ?? 0));
    n.efectoSuelo = ge;
    const x = (V0 / VUELO.perdidaKt) ** 2; // la presión dinámica relativa (1 = la de la pérdida)
    const cl0 = sustentacion(alfa, flaps) * ef.sustentacion, cl = cl0 * (1 + EFECTO_SUELO.masSustentacion * ge);
    const nL = x * cl, nL0 = x * cl0; // sustentación / peso (el factor de carga); (la de más del efecto suelo no suma inducida)
    const cdPerdida = alfa > VUELO.alfaPerdida ? Math.min(0.12, (alfa - VUELO.alfaPerdida) * 0.012) : 0;
    const resistencia = G_KTS * (x * (ARRASTRE.parasito + ARRASTRE.flaps * flaps + cdPerdida) + (ARRASTRE.inducido * nL0 * nL0 * (1 - ge)) / x);
    let kt = Math.max(0, a.kt + (empujeDe(efectiva, a.kt, a.ft) - resistencia - G_KTS * v[1]) * dt);
    // La trayectoria: la sustentación la curva hacia l; la gravedad, hacia abajo (lo que no va a lo largo de v).
    const vMin = Math.max(V0, 8); // (casi sin velocidad la gravedad la da vuelta enseguida: no queda «colgado»)
    let dv = sumar(escalar(l, (G_KTS * nL) / vMin), escalar(sumar(escalar(v, v[1]), [0, -1, 0]), G_KTS / vMin));
    // (casi quieto y vertical: la nariz cae hacia un lado, como al final de una subida vertical)
    if (V0 < 8 && Math.abs(v[1]) > 0.97) dv = sumar(dv, escalar(l, -0.6 * (1 - V0 / 8)));
    v = norm(sumar(v, escalar(dv, dt)));
    // (la cola dañada: la nariz y la trayectoria se van de costado)
    if (ef.guinada) v = girar(v, [0, 1, 0], rad(ef.guinada * dt));
    l = norm(sumar(l, escalar(v, -punto(l, v))));
    if (limites) l = bancoMax(v, l, VUELO.maxAlabeoAsistente);
    // -- los ángulos para la escena y los relojes --
    const A = angulosDe(v, l, alfa, a.rumbo);
    n.cabeceo = A.cabeceo; n.alabeo = limites ? lim(A.alabeo, -VUELO.maxAlabeoAsistente, VUELO.maxAlabeoAsistente) : A.alabeo; n.rumbo = A.rumbo;
    const gamma = Math.asin(lim(v[1], -1, 1));
    n.q = (n.cabeceo - a.cabeceo) / dt;
    n.dgamma = grad(gamma - (a.gamma ?? 0)) / dt; n.gamma = gamma; n.kt = kt; n.alfa = alfa;
    n.g = nL;
    n.perdida = alfa > VUELO.alfaPerdida;
    n.aviso = alfa > VUELO.alfaPerdida - 3 || kt < (flaps ? VUELO.perdidaFlapsKt : VUELO.perdidaKt) + 5;
    n.vs = kt * KT_FTS * v[1] * 60;
    // 0.14.119: las corrientes de la tormenta (ft/min, arriba +): suben o bajan al avión con todo.
    if (amb.vertical) n.vs += amb.vertical;
    // ---- posición (a lo largo de la velocidad, más el viento) ----
    const w = amb.viento ?? { desde: 0, kt: 0 };
    const hw = rad(w.desde), vw = (w.kt ?? 0) * KT_FTS; // el viento SOPLA hacia desde + 180
    const vx = kt * KT_FTS * v[0] - vw * Math.sin(hw), vz = kt * KT_FTS * v[2] - vw * Math.cos(hw);
    n.x = a.x + (vx * dt) / VUELO.ftPorUnidad;
    n.z = a.z + (vz * dt) / VUELO.ftPorUnidad;
    n.velSuelo = Math.hypot(vx, vz) / KT_FTS;
    // (de costado respecto de la nariz, en kt, + a la derecha: si toca así, el tren se carga de lado)
    const hn = rad(n.rumbo); n.deriva = (vx * Math.cos(hn) - vz * Math.sin(hn)) / KT_FTS;
    n.ft = a.ft + (n.vs / 60) * dt;
    n.ejes = { v, l, alfa, firma: firmaDe(n) };
  }
  // ---- tocar el suelo ----
  // 0.14.131: el suelo puede estar más alto que la pista (el relieve lejos del aeropuerto): amb.sueloFt (ft).
  const sueloFt = amb.sueloFt ?? 0;
  if (!n.enSuelo && n.ft <= sueloFt) {
    const pista = pistaDe(n.x, n.z), p = enPista(n.x, n.z, pista);
    // 0.14.113: en el lago, el toque es un amarizaje (agua: true): no rebota y el agua frena muy rápido.
    const agua = enAgua(n.x, n.z);
    n.toque = { kt: a.kt, vs: a.vs, alabeo: a.alabeo, cabeceo: a.cabeceo, costado: p.costado, largo: p.largo, dentro: p.dentro && !agua, rumbo: n.rumbo, pista: pista.id, lateralKt: n.deriva ?? 0, ...(agua ? { agua: true } : {}) };
    n.ft = sueloFt; n.enSuelo = true; n.gamma = 0; n.vs = 0; n.alabeo = 0; n.cabeceo = Math.max(0, Math.min(n.cabeceo, 8)); n.p = 0; n.q = 0; n.agua = agua;
    // 0.14.131: en tierra (la pista, el pasto o el relieve), el golpe lo clasifica juego-danos.js: solo lo imposible de
    // sobrevivir es choque; si no, los daños (con sus consecuencias) y el avión sigue: se arrastra, rueda o vuelve a volar.
    // Con el tren roto el golpe se lleva algo de velocidad (la panza toca). En el agua, como antes.
    const imp = agua ? null : clasificarImpacto(n.toque, a.danos);
    if (imp) { n.danos = imp.danos; if (imp.nuevos.length) n.toque.nuevos = imp.nuevos; }
    const rompio = imp && imp.danos.tren >= 2 && !(a.danos?.tren >= 2);
    if (imp ? imp.fatal : (a.vs < -1000 || Math.abs(a.alabeo) > 25 || a.cabeceo < -8)) { n.choque = true; n.kt = 0; }
    else if (rompio) n.kt = a.kt * 0.8;
    // Un toque duro rebota: las ruedas devuelven parte del golpe (un salto chico). En el agua, no; con el tren roto, tampoco.
    else if (a.vs < -ATERRIZAJE.vsDuroFpm && !agua) { n.enSuelo = false; n.ft = sueloFt + 0.5; n.gamma = rad(Math.min(4, (-a.vs * 0.3) / (Math.max(a.kt, 30) * KT_FTS * 60) * 57.3)); n.vs = -a.vs * 0.3; n.toque.rebote = true; }
  }
  if (n.enSuelo) {
    n.ft = sueloFt;
    n.agua = enAgua(n.x, n.z);
    // En el agua, la resistencia del agua frena en pocos segundos y el avión queda flotando; fuera de la pista, el pasto
    // frena más.
    if (n.agua) n.kt = Math.max(0, n.kt - (AMARIZAJE.frenoKtS + AMARIZAJE.frenoPorKt * n.kt) * dt);
    // 0.14.118: los frenos (0..1: el pedal o el freno de mano): hasta ~10 kt por segundo (más que el empuje a fondo: con
    // el freno de mano puesto el avión no se mueve).
    if (!n.agua && (m.freno ?? 0) > 0) n.kt = Math.max(0, n.kt - lim(m.freno, 0, 1) * 10 * dt);
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
