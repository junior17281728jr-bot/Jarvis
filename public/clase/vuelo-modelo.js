// 0.14.98: el modelo de vuelo del «Juego» (Vuelo libre): simple y estable, sin documento ni ventana (las pruebas lo usan
// tal cual). Una avioneta tipo Cessna 172: cabeceo, alabeo, viraje por alabeo (viraje coordinado), potencia y velocidad,
// resistencia, sustentación con el ángulo de ataque, pérdida (por debajo de unos 48 kt sin flaps), flaps, tren en el suelo,
// viento, el motor (RPM, presión y temperatura del aceite) y el combustible.
// Mundo como las escenas 3D (motor3d.js): x = este, y = arriba, z = norte; 1 unidad = 1,000 ft (como el circuito).
// Unidades del estado: kt (velocidad), ft (altitud), grados (rumbo, cabeceo, alabeo), ft/min (vs).
import { tasaDeGiro, inclinacionCoordinador, agujaAnemometro, agujasAltimetro, agujaVariometro } from './instrumentos.js';

export const VUELO = Object.freeze({
  perdidaKt: 48, // velocidad de pérdida sin flaps (alas niveladas)
  perdidaFlapsKt: 43, // con flaps
  avisoKt: 53, // el aviso de pérdida suena unos 5 kt antes
  alfaPerdida: 16, // ángulo de ataque crítico (grados)
  rotacionKt: 55, // en la carrera se puede levantar la nariz desde aquí
  rpmMax: 2700, rpmRalenti: 700,
  aceitePsiNormal: 60, aceiteTempNormal: 185, // psi y °F en verde
  combustibleGal: 40, consumoGph: 8.5,
  maxAlabeoAsistente: 30, maxAlabeo: 65,
  ftPorUnidad: 1000,
});
const G_KTS = 19.06; // g en nudos por segundo
const KT_FTS = 1.68781;
const rad = g => (g * Math.PI) / 180;
const grad = r => (r * 180) / Math.PI;
const lim = (x, a, b) => Math.min(b, Math.max(a, x));
const norm360 = g => ((g % 360) + 360) % 360;
const hacia = (a, b, paso) => (Math.abs(b - a) <= paso ? b : a + Math.sign(b - a) * paso);

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
// El techo de servicio: el motor da menos con la altura (densidad); cerca de 13,500 ft sube unos 100 ft/min.
export const TECHO = Object.freeze({ servicioFt: 13500, factor: ft => Math.max(0.05, 1 - ft / 27500) });

// Dónde está un punto respecto de la pista: a lo largo (ft, + hacia el norte de la 36) y de costado (ft, + a la derecha).
export function enPista(x, z, pista = PISTA) {
  const h = rad(pista.rumbo), dx = (x - pista.x) * VUELO.ftPorUnidad, dz = (z - pista.z) * VUELO.ftPorUnidad;
  const largo = dx * Math.sin(h) + dz * Math.cos(h), costado = dx * Math.cos(h) - dz * Math.sin(h);
  return { largo, costado, dentro: Math.abs(largo) <= pista.largoFt / 2 && Math.abs(costado) <= pista.anchoFt / 2 };
}

// Coeficiente de sustentación relativo (1 = el máximo) para un ángulo de ataque; pasada la pérdida, cae.
export function sustentacion(alfa, flaps = 0) {
  const a0 = 2 + flaps * 3; // con flaps hay sustentación con menos ángulo
  const cmax = flaps ? (VUELO.perdidaKt / VUELO.perdidaFlapsKt) ** 2 : 1;
  if (alfa <= VUELO.alfaPerdida) return lim(((alfa + a0) / (VUELO.alfaPerdida + a0)) * cmax, -0.4, cmax);
  return cmax * lim(1 - (alfa - VUELO.alfaPerdida) * 0.06, 0.55, 1);
}

// El ángulo de ataque que sostiene el vuelo nivelado a una velocidad (para la compensación).
export function alfaNivel(kt, flaps = 0) {
  const a0 = 2 + flaps * 3, cmax = flaps ? (VUELO.perdidaKt / VUELO.perdidaFlapsKt) ** 2 : 1;
  const cl = Math.min(cmax * 0.95, (VUELO.perdidaKt / Math.max(kt, VUELO.perdidaKt)) ** 2);
  return (cl / cmax) * (VUELO.alfaPerdida + a0) - a0;
}

// Un avión nuevo: en la cabecera de la 36 (en el suelo) o en el aire.
export function crearAvion({ x = 0, z = -1.85, ft = 0, rumbo = 360, kt = 0, potencia = 0, enSuelo = true, flaps = 0 } = {}) {
  return {
    x, z, ft, rumbo, kt, cabeceo: 0, alabeo: 0, gamma: 0, vs: 0, potencia, flaps, enSuelo, t: 0,
    // La compensación (el ángulo de ataque que el avión busca solo): en tierra, la del despegue (sube a unos 60 kt).
    trim: alfaNivel(enSuelo ? 60 : Math.max(kt, 55), flaps), p: 0, q: 0, g: 1, flapsPos: flaps,
    rpm: VUELO.rpmRalenti, aceitePsi: VUELO.aceitePsiNormal, aceiteTemp: VUELO.aceiteTempNormal, combustible: VUELO.combustibleGal,
    motor: 1, // 1 = sano; menos = pierde potencia (una falla)
    rugido: 0, // 0..1: el motor «falla» (las RPM suben y bajan)
    perdida: false, aviso: false, toque: null, choque: false, velSuelo: kt,
  };
}

// Un paso de la simulación. mandos: { cabeceo -1..1 (atrás +), alabeo -1..1 (derecha +), potencia 0..1, flaps 0|1 }.
// ambiente: { viento: { desde (grados), kt }, rafaga(t) → { cabeceo, alabeo } (turbulencia) }. asistente: estabiliza.
// Pasos fijos de 1/60 s (estable con cualquier dt); dt se corta a 0.25 s (una pestaña dormida no hace saltar al avión).
export function pasoVuelo(avion, mandos = {}, dt = 1 / 60, { ambiente = {}, asistente = false } = {}) {
  let a = { ...avion };
  let resto = lim(dt, 0, 0.25);
  while (resto > 1e-9) { const h = Math.min(resto, 1 / 60); a = subpaso(a, mandos, h, ambiente, asistente); resto -= h; }
  return a;
}

function subpaso(a, m, dt, amb, asistente) {
  const n = { ...a, t: a.t + dt, toque: null };
  if (n.choque) return n;
  const flaps = m.flaps ? 1 : 0;
  n.flaps = flaps;
  n.potencia = lim(m.potencia ?? a.potencia, 0, 1);
  // ---- el motor ----
  const sinCombustible = n.combustible <= 0;
  const efectiva = sinCombustible ? 0 : n.potencia * lim(n.motor, 0, 1);
  const vibra = n.rugido > 0 ? n.rugido * 260 * Math.sin(n.t * 7.3) * Math.sin(n.t * 2.1 + 1) : 0;
  const anda = !sinCombustible && n.motor > 0.05;
  const rpmMeta = anda ? VUELO.rpmRalenti + (VUELO.rpmMax - 200 - VUELO.rpmRalenti) * efectiva + n.kt * 2 + vibra : (n.kt > 50 ? n.kt * 9 : 0);
  n.rpm = lim(hacia(a.rpm, rpmMeta, 1600 * dt), 0, VUELO.rpmMax + 200);
  n.combustible = Math.max(0, a.combustible - (VUELO.consumoGph * Math.max(0.15, efectiva) * dt) / 3600);
  // ---- los mandos ----
  const pideAlabeo = lim(m.alabeo ?? 0, -1, 1), pideCabeceo = lim(m.cabeceo ?? 0, -1, 1);
  const maxAlabeo = asistente ? VUELO.maxAlabeoAsistente : VUELO.maxAlabeo;
  let alfa = a.cabeceo - grad(a.gamma);
  if (n.enSuelo) {
    // En el suelo: el alabeo es la dirección (pedales y rueda de nariz); la nariz se levanta con velocidad.
    n.alabeo = hacia(a.alabeo, 0, 30 * dt);
    n.rumbo = norm360(a.rumbo + pideAlabeo * 14 * lim(a.kt / 20, 0, 1) * dt);
    const puede = a.kt >= VUELO.rotacionKt - 8 ? 12 : 0;
    n.cabeceo = lim(a.cabeceo + (pideCabeceo > 0.1 ? 8 : -6) * dt, 0, puede);
    alfa = n.cabeceo;
  } else {
    // Alabeo con inercia: la tasa (p) va hacia lo que pide el yugo en unos 0.35 s (con amortiguación).
    let pMeta = pideAlabeo * 50;
    if (asistente && Math.abs(pideAlabeo) < 0.08) pMeta = lim(-a.alabeo * 0.6, -10, 10); // nivela, suave
    n.p = (a.p ?? 0) + (pMeta - (a.p ?? 0)) * Math.min(1, dt / 0.35);
    n.alabeo = lim(a.alabeo + n.p * dt, -maxAlabeo, maxAlabeo);
    // La estabilidad del avión (como uno compensado): con el yugo suelto el ángulo de ataque vuelve al compensado (en
    // ~0.5 s) y la nariz sigue a la trayectoria (con algo de amortiguación del fugoide); con el yugo movido, el cabeceo tiene
    // inercia (q tarda ~0.25 s en tomar la tasa) y la compensación lo sigue. En un viraje la compensación no alcanza: la
    // sustentación se inclina y hay que tirar (el avión no lo hace solo).
    const trim = a.trim ?? alfaNivel(a.kt, flaps);
    n.trim = trim;
    let cab;
    if (Math.abs(pideCabeceo) < 0.08) {
      const alfaMeta = trim - 1.0 * (a.dgamma ?? 0);
      cab = alfa + (alfaMeta - alfa) * Math.min(1, dt / 0.5) + grad(a.gamma);
      n.q = (cab - a.cabeceo) / dt;
    } else {
      n.trim = trim + lim(alfa - trim, -5, 5) * dt;
      n.q = (a.q ?? 0) + (pideCabeceo * 14 - (a.q ?? 0)) * Math.min(1, dt / 0.25);
      cab = a.cabeceo + n.q * dt;
    }
    const alfaN = cab - grad(a.gamma);
    // El Asistente es una ayuda suave: nunca deja pasar de 12° de ataque (no hay pérdida); no fija la altura ni la subida.
    if (asistente && alfaN > 12) { cab = 12 + grad(a.gamma); n.q = Math.min(n.q ?? 0, 0); }
    // En pérdida, la nariz cae sola.
    if (alfaN > VUELO.alfaPerdida) cab -= ((alfaN - VUELO.alfaPerdida) * 6 + 12) * dt;
    n.cabeceo = lim(cab, -40, 35);
    alfa = n.cabeceo - grad(a.gamma);
  }
  // ---- velocidad ----
  const empuje = 4.5 * efectiva * (1 - a.kt / 230) * TECHO.factor(a.ft);
  const resistencia = 0.000163 * a.kt * a.kt + flaps * 0.0002 * a.kt * a.kt + Math.max(0, alfa) ** 2 * 0.012 + (n.enSuelo ? 0.8 + (n.potencia < 0.05 && a.kt < 70 ? 4 : 0) : 0);
  let kt = a.kt + (empuje - resistencia - G_KTS * Math.sin(a.gamma)) * dt;
  kt = Math.max(0, kt);
  // ---- trayectoria (gamma: el ángulo de la trayectoria) ----
  const vMin = Math.max(kt, 20);
  const cl = sustentacion(alfa, flaps);
  const sobreW = (kt / VUELO.perdidaKt) ** 2 * cl; // sustentación / peso
  // El factor de carga (g): la sustentación sobre el peso (en tierra, 1).
  n.g = n.enSuelo ? 1 : sobreW;
  n.perdida = !n.enSuelo && alfa > VUELO.alfaPerdida;
  n.aviso = !n.enSuelo && (alfa > VUELO.alfaPerdida - 3 || kt < (flaps ? VUELO.perdidaFlapsKt : VUELO.perdidaKt) + 5);
  let gamma = a.gamma;
  if (n.enSuelo) {
    gamma = 0;
    if (sobreW > 1.02 && kt > VUELO.rotacionKt - 4) { n.enSuelo = false; gamma = rad(1); }
  } else {
    const dg = (G_KTS / vMin) * (sobreW * Math.cos(rad(n.alabeo)) - Math.cos(a.gamma));
    gamma = lim(a.gamma + dg * dt * 0.9, rad(-60), rad(40));
    const rafaga = amb.rafaga ? amb.rafaga(n.t) : null;
    if (rafaga) { n.alabeo += rafaga.alabeo * dt; n.cabeceo += rafaga.cabeceo * dt; gamma += rad(rafaga.cabeceo * 0.4) * dt; }
    n.rumbo = norm360(a.rumbo + tasaDeGiro(n.alabeo, Math.max(kt, 30)) * dt);
  }
  n.dgamma = grad(gamma - a.gamma) / dt; n.gamma = gamma; n.kt = kt;
  n.vs = kt * KT_FTS * Math.sin(gamma) * 60;
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
    n.toque = { kt: a.kt, vs: a.vs, alabeo: a.alabeo, cabeceo: a.cabeceo, costado: p.costado, largo: p.largo, dentro: p.dentro, rumbo: n.rumbo, pista: pista.id };
    n.ft = 0; n.enSuelo = true; n.gamma = 0; n.vs = 0; n.alabeo = 0; n.cabeceo = Math.max(0, Math.min(n.cabeceo, 8)); n.p = 0; n.q = 0;
    if (a.vs < -1000 || Math.abs(a.alabeo) > 25 || a.cabeceo < -8) { n.choque = true; n.kt = 0; }
    // Un toque duro rebota: las ruedas devuelven parte del golpe (un salto chico).
    else if (a.vs < -ATERRIZAJE.vsDuroFpm) { n.enSuelo = false; n.ft = 0.5; n.gamma = rad(Math.min(4, (-a.vs * 0.3) / (Math.max(a.kt, 30) * KT_FTS * 60) * 57.3)); n.vs = -a.vs * 0.3; n.toque.rebote = true; }
  }
  if (n.enSuelo) {
    n.ft = 0;
    // Fuera de la pista, el pasto frena más.
    if (!enPista(n.x, n.z, pistaDe(n.x, n.z)).dentro) n.kt = Math.max(0, n.kt - 3 * dt);
  }
  // Los flaps bajan y suben despacio (para el indicador: unos 4 s).
  n.flapsPos = hacia(a.flapsPos ?? flaps, flaps, dt / 4);
  return n;
}

// Lo que conviene hacer ahora (la clave del consejo que se muestra arriba). Solo lee el estado.
export function consejo(a, { vuelo = false } = {}) {
  if (a.choque) return 'choque';
  if (a.perdida || a.aviso) return 'perdida';
  if (a.enSuelo) {
    if (vuelo) return a.kt < 3 ? 'detenido' : 'rodando';
    if (a.potencia < 0.9 && a.kt < VUELO.rotacionKt) return 'potencia';
    return a.kt < VUELO.rotacionKt ? 'acelera' : 'rotar';
  }
  if (a.ft < 500 && a.vs > 0) return 'subir';
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
