// 0.14.103: el motor de pistón del Juego: el arranque y el apagado (master, magnetos, selector de combustible, mezcla y
// gases) y la combustión con la mezcla (EGT, potencia, aspereza y flujo de combustible). Simple pero correcto para una
// avioneta de entrenamiento. Los datos, del PHAK cap. 7 y 11 y del AFH cap. 2 (tabla MOTOR_FAA; las pruebas la revisan).
// Sin documento ni ventana.

export const MOTOR_FAA = Object.freeze({
  // El interruptor de encendido tiene 5 posiciones; con R o L funciona un solo magneto (PHAK cap. 7).
  magnetos: Object.freeze(['OFF', 'R', 'L', 'BOTH', 'START']),
  // Con la altura el aire es menos denso y la mezcla se enriquece: aspereza y pérdida de potencia; hay que empobrecer
  // (PHAK cap. 7). Demasiado pobre: detonación, aspereza, recalentamiento y pérdida de potencia (PHAK cap. 7).
  // Mejor potencia: unos 100 °F del lado rico del pico de EGT; mejor economía: en el pico (PHAK cap. 11).
  mejorPotenciaRicoF: 100, mejorEconomia: 'pico',
  // Con la mezcla en IDLE CUTOFF el motor se para (PHAK cap. 7).
  corte: 'IDLE CUTOFF',
  // La presión de aceite debe subir en 30 s; no usar el arranque más de 30 s seguidos (AFH cap. 2).
  aceiteS: 30, arranqueMaxS: 30,
  // El orden del arranque (simplificado) y del apagado.
  arranque: Object.freeze(['master', 'combustible', 'mezcla', 'gases', 'magnetos']),
  apagado: Object.freeze(['gases', 'mezcla', 'magnetos', 'master']),
  fuentes: Object.freeze({ mezcla: 'PHAK cap. 7', potencia: 'PHAK cap. 11', arranque: 'AFH cap. 2', luces: 'AIM 4-3-24 · 14 CFR 91.209' }),
  // 0.14.105: la prueba de motor (run-up). Con un solo magneto es normal una caída pequeña de RPM; si se para o cae más
  // de lo permitido, no se vuela; lo permitido lo dice el AFM/POH (PHAK cap. 7). El calor al carburador quita potencia,
  // a veces hasta un 15 % (el aire caliente es menos denso, PHAK cap. 7). Los números de la prueba son los del POH del
  // avión del juego (un ejemplo como el de un avión de escuela).
  calorPerdidaMax: 0.15, magnetoFactor: 0.94, calorFactor: 0.93,
  poh: Object.freeze({ runupRpm: 1700, caidaMaxRpm: 125, diferenciaMaxRpm: 50, aceitePsiVerde: Object.freeze([25, 100]), aceiteTempVerde: Object.freeze([100, 245]), fuente: 'POH del avión del juego (ejemplo)' }),
  // El molinete: en vuelo, con el motor parado, la hélice sigue girando con el viento; con mezcla, magnetos y combustible,
  // el motor vuelve a arrancar sin el motor de arranque.
  molineteKt: 55,
});
// 0.14.105: las luces del avión (dependen del MASTER). Posición (roja a la izquierda, verde a la derecha, blanca en la cola)
// de la puesta a la salida del sol; las anticolisión (baliza y estroboscópicas) en toda operación; la de aterrizaje se
// recomienda cerca de los aeropuertos (AIM 4-3-24; 14 CFR 91.209; AFH cap. 11).
export const LUCES = Object.freeze(['nav', 'baliza', 'estrobo', 'aterrizaje', 'rodaje']);
export const LUCES_PROPIAS = Object.freeze({ izquierda: 'rojo', derecha: 'verde', cola: 'blanco', baliza: 'rojo', estrobo: 'blanco', fuente: 'AFH cap. 11 · AIM 4-3-24' });
const LUCES_ENCENDIDAS = Object.freeze({ nav: true, baliza: true, estrobo: true, aterrizaje: false, rodaje: false });
const LUCES_APAGADAS = Object.freeze({ nav: false, baliza: false, estrobo: false, aterrizaje: false, rodaje: false });
// Qué luces dan luz: las que están en ON, solo con el MASTER en ON.
export const lucesActivas = m => Object.fromEntries(LUCES.map(k => [k, Boolean(m?.master && (m.luces ?? LUCES_ENCENDIDAS)[k])]));

const lim = (x, a, b) => Math.min(b, Math.max(a, x));
// La densidad relativa del aire (atmósfera estándar).
export const densidad = ft => Math.pow(Math.max(0.2, 1 - 6.8756e-6 * Math.max(0, ft)), 4.2559);
// La relación de mezcla relativa (1 = el pico de EGT). mezcla: 0 (corte) … 1 (RICH). Con RICH a nivel del mar, 1.25.
export const lambda = (mezcla, ft) => (lim(mezcla, 0, 1) * 1.25) / densidad(ft);
export const LAMBDA = Object.freeze({ mejorPotencia: 1.2, para: 0.6, asperoPobre: 0.82, asperoRico: 1.55 });

// La combustión: → { lambda, egt (°F), pico (°F), factor (de la potencia), aspereza 0..1, flujoGph, para (se apaga) }
export function combustion(mezcla, ft, potencia) {
  const L = lambda(mezcla, ft), p = lim(potencia, 0, 1);
  const pico = 1000 + 450 * Math.max(0.15, p);
  // (del lado rico baja despacio: a la mejor potencia, unos 100 °F; RICA en altura, unos 300 °F bajo el pico)
  const egt = L >= 1 ? pico - 500 * (L - 1) : pico - 6000 * (1 - L) ** 2;
  const factor = L >= LAMBDA.mejorPotencia ? 1 - 1.2 * (L - LAMBDA.mejorPotencia) ** 2 : 1 - 3 * (LAMBDA.mejorPotencia - L) ** 2;
  const aspereza = lim((LAMBDA.asperoPobre - L) / 0.2, 0, 1) + 0.5 * lim((L - LAMBDA.asperoRico) / 0.4, 0, 1);
  const flujoGph = 0.6 + 11 * Math.max(0.08, p) * (L / 1.25) * densidad(ft);
  return { lambda: L, egt: Math.max(300, egt), pico, factor: lim(factor, 0, 1), aspereza: lim(aspereza, 0, 1), flujoGph, para: mezcla < 0.05 || L < LAMBDA.para };
}

// El estado de los mandos del motor. enMarcha: si empieza ya en marcha (todo encendido) o «en frío» (todo apagado).
export function crearMotor({ enMarcha = true, mezcla = 1 } = {}) {
  return enMarcha
    ? { master: true, magnetos: 'BOTH', selector: 'BOTH', mezcla, enMarcha: true, arrancando: 0, arranqueTotal: 0, desdeArranque: 99, calor: false, auto: 0, luces: { ...LUCES_ENCENDIDAS } }
    : { master: false, magnetos: 'OFF', selector: 'OFF', mezcla: 0, enMarcha: false, arrancando: 0, arranqueTotal: 0, desdeArranque: 0, calor: false, auto: 0, luces: { ...LUCES_APAGADAS } };
}
// Un paso: el arranque (con START y el master, el motor de arranque gira; con combustible, mezcla y gases bien, prende en
// ~1.5 s) y lo que lo apaga (magnetos OFF, mezcla en corte o demasiado pobre, sin combustible o el selector en OFF).
export function pasoMotor(m0, { potencia = 0, ft = 0, combustible = 40, dt = 1 / 60, kt = 0 } = {}) {
  // «Encender motor» en tierra: el arranque se mantiene en START unos segundos (auto) y vuelve solo a BOTH.
  const m = m0.auto > 0 && m0.magnetos === 'START' && (m0.enMarcha || m0.auto - dt <= 0) ? { ...m0, magnetos: 'BOTH', auto: 0 } : m0;
  const n = { ...m, auto: Math.max(0, (m.auto ?? 0) - dt) };
  const c = combustion(m.mezcla, ft, potencia);
  const chispa = m.magnetos !== 'OFF';
  const hayCombustible = m.selector === 'BOTH' && combustible > 0;
  n.girando = m.magnetos === 'START' && m.master; // el motor de arranque
  const molinete = !m.enMarcha && kt >= MOTOR_FAA.molineteKt; // la hélice girando con el viento (en vuelo)
  if (n.girando) { n.arrancando = m.arrancando + dt; n.arranqueTotal = m.arranqueTotal + dt; } else if (molinete) n.arrancando = m.arrancando + dt; else n.arrancando = 0;
  if (!m.enMarcha) {
    if ((n.girando || molinete) && chispa && hayCombustible && !c.para && (molinete || potencia <= 0.5) && n.arrancando >= (molinete ? 1 : 1.5)) { n.enMarcha = true; n.desdeArranque = 0; n.motivo = null; }
  } else {
    n.desdeArranque = m.desdeArranque + dt;
    const motivo = !chispa ? 'magnetos' : !hayCombustible ? 'combustible' : c.para ? (m.mezcla < 0.05 ? 'corte' : 'pobre') : null;
    if (motivo) { n.enMarcha = false; n.motivo = motivo; }
  }
  // Un solo magneto: un poco menos de potencia (la caída de RPM de la prueba de magnetos).
  n.factor = n.enMarcha ? c.factor * (m.magnetos === 'R' || m.magnetos === 'L' ? MOTOR_FAA.magnetoFactor : 1) * (m.calor ? MOTOR_FAA.calorFactor : 1) : 0;
  n.aspereza = n.enMarcha ? c.aspereza : 0;
  n.egt = n.enMarcha ? c.egt : Math.max(100, (m.egt ?? 100) - 40 * dt);
  n.pico = c.pico; n.lambda = c.lambda;
  n.flujoGph = n.enMarcha ? c.flujoGph : 0;
  return n;
}
// La lista del arranque, con lo que ya está hecho (para el «Arranque guiado»).
export function listaArranque(m, potencia) {
  const hecho = {
    master: m.master, combustible: m.selector === 'BOTH', mezcla: m.mezcla >= 0.9,
    gases: potencia >= 0.05 && potencia <= 0.3, magnetos: m.enMarcha,
  };
  return MOTOR_FAA.arranque.map(id => ({ id, hecho: hecho[id] }));
}
export function listaApagado(m, potencia) {
  const hecho = { gases: potencia <= 0.02, mezcla: m.mezcla < 0.05, magnetos: m.magnetos === 'OFF', master: !m.master };
  return MOTOR_FAA.apagado.map(id => ({ id, hecho: hecho[id] }));
}

// ---------- 0.14.105: encender y apagar cuando se quiera ----------
// La mezcla del Asistente: RICA abajo de 3,000 ft; más arriba, la de mejor potencia (unos 100 °F del lado rico del pico).
export const mezclaAuto = ft => (ft < 3000 ? 1 : Math.min(1, Math.max(0.1, (LAMBDA.mejorPotencia * densidad(ft)) / 1.25)));
// «Encender todo (automático)»: todo listo y en marcha (lo que haría el Asistente).
export const encenderTodo = (m, ft = 0) => ({ ...m, master: true, selector: 'BOTH', mezcla: mezclaAuto(ft), magnetos: 'BOTH', enMarcha: true, arrancando: 0, desdeArranque: 99, motivo: null, auto: 0,
  luces: { ...LUCES_ENCENDIDAS, ...(m.luces ?? {}), nav: true, baliza: true, estrobo: true } });
// «Encender motor» como de verdad: MASTER, combustible, mezcla RICA y magnetos. En tierra, el arranque (START unos
// segundos); en vuelo, con la hélice en molinete, BOTH alcanza.
export const encenderMotor = (m, { enSuelo = true } = {}) => ({ ...m, master: true, selector: 'BOTH', mezcla: Math.max(m.mezcla ?? 0, 0.95), magnetos: enSuelo ? 'START' : 'BOTH', auto: enSuelo ? 2 : 0 });
// «Apagar motor»: mezcla en CORTE y magnetos en OFF (en tierra también el MASTER).
export const apagarMotor = (m, { enSuelo = true } = {}) => ({ ...m, mezcla: 0, magnetos: 'OFF', auto: 0, ...(enSuelo ? { master: false } : {}) });

// ---------- 0.14.105: la prueba de motor (run-up) ----------
export const PASOS_RUNUP = Object.freeze(['aceite', 'rpm', 'magnetoL', 'magnetoR', 'calor', 'ralenti']);
// Mide las caídas de RPM: la referencia en BOTH (sin calor) cerca de 1,700; con L, R o el calor, la caída después de 1.5 s.
export function medirRunup(r = {}, { rpm, magnetos, calor, dt = 1 / 60 }) {
  const n = { ...r }, poh = MOTOR_FAA.poh;
  const estado = calor ? 'calor' : magnetos;
  n.quieto = estado === r.estado ? (r.quieto ?? 0) + dt : 0; n.estado = estado;
  const estable = Math.abs(rpm - (r.rpm ?? rpm)) < Math.max(2, 120 * dt); n.rpm = rpm;
  if (estado === 'BOTH' && Math.abs(rpm - poh.runupRpm) < 120 && n.quieto > 1 && estable) n.base = rpm;
  if (n.base && n.quieto > 1.2 && estable) {
    if (estado === 'L') n.caidaL = Math.round(n.base - rpm);
    if (estado === 'R') n.caidaR = Math.round(n.base - rpm);
    if (estado === 'calor') n.caidaCalor = Math.round(n.base - rpm);
  }
  return n;
}
export function listaRunup(r = {}, { rpm = 0, aceitePsi = 0, aceiteTemp = 0, enMarcha = false, magnetos = 'OFF', calor = false } = {}) {
  const poh = MOTOR_FAA.poh, en = (v, [a, b]) => v >= a && v <= b;
  const ok = x => x != null && x > 0 && x <= poh.caidaMaxRpm;
  const hecho = {
    aceite: enMarcha && en(aceitePsi, poh.aceitePsiVerde) && en(aceiteTemp, poh.aceiteTempVerde),
    rpm: Boolean(r.base),
    magnetoL: ok(r.caidaL), magnetoR: ok(r.caidaR) && (r.caidaL == null || Math.abs(r.caidaL - r.caidaR) <= poh.diferenciaMaxRpm),
    calor: (r.caidaCalor ?? 0) > 0 && !calor,
    ralenti: Boolean(r.caidaCalor) && enMarcha && rpm < 1000 && magnetos === 'BOTH',
  };
  return PASOS_RUNUP.map(id => ({ id, hecho: hecho[id] }));
}
