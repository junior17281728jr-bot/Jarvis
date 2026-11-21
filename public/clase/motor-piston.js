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
  fuentes: Object.freeze({ mezcla: 'PHAK cap. 7', potencia: 'PHAK cap. 11', arranque: 'AFH cap. 2' }),
});

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
  const egt = L >= 1 ? pico - 2500 * (L - 1) ** 2 : pico - 6000 * (1 - L) ** 2;
  const factor = L >= LAMBDA.mejorPotencia ? 1 - 1.2 * (L - LAMBDA.mejorPotencia) ** 2 : 1 - 3 * (LAMBDA.mejorPotencia - L) ** 2;
  const aspereza = lim((LAMBDA.asperoPobre - L) / 0.2, 0, 1) + 0.5 * lim((L - LAMBDA.asperoRico) / 0.4, 0, 1);
  const flujoGph = 0.6 + 11 * Math.max(0.08, p) * (L / 1.25) * densidad(ft);
  return { lambda: L, egt: Math.max(300, egt), pico, factor: lim(factor, 0, 1), aspereza: lim(aspereza, 0, 1), flujoGph, para: mezcla < 0.05 || L < LAMBDA.para };
}

// El estado de los mandos del motor. enMarcha: si empieza ya en marcha (todo encendido) o «en frío» (todo apagado).
export function crearMotor({ enMarcha = true, mezcla = 1 } = {}) {
  return enMarcha
    ? { master: true, magnetos: 'BOTH', selector: 'BOTH', mezcla, enMarcha: true, arrancando: 0, arranqueTotal: 0, desdeArranque: 99 }
    : { master: false, magnetos: 'OFF', selector: 'OFF', mezcla: 0, enMarcha: false, arrancando: 0, arranqueTotal: 0, desdeArranque: 0 };
}
// Un paso: el arranque (con START y el master, el motor de arranque gira; con combustible, mezcla y gases bien, prende en
// ~1.5 s) y lo que lo apaga (magnetos OFF, mezcla en corte o demasiado pobre, sin combustible o el selector en OFF).
export function pasoMotor(m, { potencia = 0, ft = 0, combustible = 40, dt = 1 / 60 } = {}) {
  const n = { ...m };
  const c = combustion(m.mezcla, ft, potencia);
  const chispa = m.magnetos !== 'OFF';
  const hayCombustible = m.selector === 'BOTH' && combustible > 0;
  n.girando = m.magnetos === 'START' && m.master; // el motor de arranque
  if (n.girando) { n.arrancando = m.arrancando + dt; n.arranqueTotal = m.arranqueTotal + dt; } else n.arrancando = 0;
  if (!m.enMarcha) {
    if (n.girando && chispa && hayCombustible && !c.para && potencia <= 0.5 && n.arrancando >= 1.5) { n.enMarcha = true; n.desdeArranque = 0; n.motivo = null; }
  } else {
    n.desdeArranque = m.desdeArranque + dt;
    const motivo = !chispa ? 'magnetos' : !hayCombustible ? 'combustible' : c.para ? (m.mezcla < 0.05 ? 'corte' : 'pobre') : null;
    if (motivo) { n.enMarcha = false; n.motivo = motivo; }
  }
  // Un solo magneto: un poco menos de potencia (la caída de RPM de la prueba de magnetos).
  n.factor = n.enMarcha ? c.factor * (m.magnetos === 'R' || m.magnetos === 'L' ? 0.97 : 1) : 0;
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
