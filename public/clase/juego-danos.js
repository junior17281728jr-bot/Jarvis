// 0.14.123 (pedido del dueño: «en un choque pequeño… el avión deja de funcionar; tiene que ser como en la vida real: se va
// rompiendo según el golpe»): los daños, poco a poco, en lugar de «se acabó».
//  - Cada toque se clasifica por el descenso, la velocidad, la actitud y dónde tocó (pista, pasto): un aterrizaje duro dobla
//    o rompe el tren, la nariz abajo golpea la hélice, un ala baja raspa la punta, la nariz muy arriba golpea la cola, una
//    rueda de costado revienta la goma, el pasto frena (y a mucha velocidad dobla el tren). Solo un golpe que no se puede
//    sobrevivir termina el vuelo. Los números del toque (AFH cap. 9: un aterrizaje duro puede dañar la estructura; tocar de
//    costado carga el tren de lado y puede romperlo) son los del juez del aterrizaje (vuelo-modelo.js): 600 ft/min ya es duro.
//  - Los pájaros (AIM 7-5): pueden rajar el parabrisas, abollar el borde de ataque del ala o dañar el motor o la hélice.
//  - Lo que hace cada daño (efectosDanos): menos potencia y vibración (hélice, motor), una tendencia a alabear (punta del ala,
//    borde de ataque), en el suelo tira hacia un lado y frena (tren, goma) y queda inclinado (tren roto).
// Sin estado global ni documento: todo con objetos simples (las pruebas los usan tal cual).

export const DANOS = Object.freeze({
  // ft/min de descenso al tocar: duro (el tren se dobla), muy duro (se rompe), imposible de sobrevivir.
  trenDobladoFpm: 600, trenRotoFpm: 1100, fatalFpm: 1800,
  alabeoPuntaGrados: 12, alabeoGomaGrados: 7, alabeoFatalGrados: 45, colaGrados: 13, heliceGrados: -3, heliceFpm: 400, narizFatalGrados: -15,
  pastoTrenKt: 50, gomaKt: 80,
  // 0.14.127: tocar yendo de costado (sin corregir la deriva) carga el tren de lado (AFH cap. 9): kt de costado respecto de
  // la nariz (números del modelo) para reventar la goma, doblar el tren y, muy de costado y con el ala de ese lado baja,
  // volcar sobre la punta del ala.
  ladoGomaKt: 15, ladoTrenKt: 20, ladoVuelcoKt: 25,
  fuente: 'AFH cap. 9',
});
export const AVES = Object.freeze({ bajoFt: 3000, migracion: 'marzo–abril y agosto–noviembre', fuente: 'AIM 7-5-1 · 7-5-2 · 7-5-3' });
export const PARTES_AVE = Object.freeze(['parabrisas', 'borde', 'motor']);

export const sinDanos = () => ({ tren: 0, trenLado: 0, helice: 0, puntaAla: 0, cola: 0, goma: 0, parabrisas: 0, borde: 0, motorAve: 0,
  // 0.14.127: lo que se gasta de a poco (el exceso de velocidad y de G): los flaps, los mandos y la estructura.
  flapEstres: 0, flapAtascado: 0, flapAsim: 0, flutter: 0, aleron: 0, elevador: 0, estres: 0, alas: 0,
  // 0.14.130: el motor que se va gastando después de un golpe (0..1: el aceite se pierde, la temperatura sube, anda áspero y,
  // al final, se para) y la panza raspada (se arrastró sin tren).
  motorDesgaste: 0, panza: 0 });
// 0.14.130: lo que pasa de a poco. El motor golpeado (un pájaro en la toma o un golpe de hélice) pierde aceite: en unos 4
// minutos a toda potencia (más despacio con menos potencia) se gasta del todo; un ala abollada en el borde de ataque, o
// doblada, pierde combustible (galones por hora). Números del modelo, no de un manual.
export const DESGASTE = Object.freeze({ motorAveS: 240, heliceS: 600, fugaBordeGph: 4, fugaAlasGph: 2 });
// 0.14.127: los límites de velocidad del anemómetro (PHAK cap. 8, fig. 8-8: el blanco termina en la VFE, el verde en la VNO, la
// raya roja es la VNE; los números, los del anemómetro de la cabina) y los de G (los de LIMITES en vuelo-modelo.js).
export const LIMITES_VEL = Object.freeze({ vfeKt: 85, vnoKt: 129, vneKt: 163, gMax: 3.8, gMin: -1.52, seguridad: 1.5, fuente: 'PHAK cap. 8 · cap. 5' });
// Los que hay (los ids, en orden): para la lista del Menú y el resumen.
export function listaDanos(d) {
  if (!d) return [];
  const out = [];
  if (d.tren >= 2) out.push('tren_roto'); else if (d.tren >= 1) out.push('tren_doblado');
  if (d.helice > 0) out.push('helice');
  if (d.puntaAla) out.push('punta_ala');
  if (d.cola) out.push('cola');
  if (d.goma) out.push('goma');
  if (d.parabrisas > 0) out.push('parabrisas');
  if (d.borde) out.push('borde');
  if (d.motorAve > 0) out.push('motor_ave');
  if (d.flapAsim) out.push('flap_asim'); else if (d.flapAtascado) out.push('flap_atascado');
  if (d.aleron > 0) out.push('aleron');
  if (d.elevador >= 0.8) out.push('cola_grave'); else if (d.elevador > 0) out.push('elevador');
  if (d.alas > 0) out.push('alas');
  if (d.motorDesgaste >= 0.25) out.push('motor_aceite');
  if (d.borde || d.alas > 0) out.push('fuga');
  return out;
}
const juntar = (a, b) => {
  const o = { ...sinDanos(), ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) o[k] = typeof v === 'number' && (k === 'trenLado' || k === 'puntaAla' || k === 'goma' || k === 'borde' || k === 'flapAsim') ? (v || o[k]) : Math.max(o[k] ?? 0, v);
  return o;
};

// Un toque (el del modelo: kt, vs, alabeo, cabeceo, dentro, agua) → { fatal, nuevos: [ids], danos } (danos: con los de antes).
export function clasificarImpacto(toque, antes = null) {
  const d0 = { ...sinDanos(), ...(antes ?? {}) };
  if (!toque || toque.agua) return { fatal: false, nuevos: [], danos: d0 };
  const fpm = Math.max(0, -(toque.vs ?? 0)), banco = Math.abs(toque.alabeo ?? 0), lado = (toque.alabeo ?? 0) > 0 ? 1 : -1, nariz = toque.cabeceo ?? 0, kt = toque.kt ?? 0;
  const fatal = fpm > DANOS.fatalFpm || banco > DANOS.alabeoFatalGrados || (nariz < DANOS.narizFatalGrados && fpm > 600);
  const nuevo = {};
  if (fpm > DANOS.trenRotoFpm) { nuevo.tren = 2; nuevo.trenLado = banco > 2 ? lado : 1; nuevo.panza = 1; } else if (fpm > DANOS.trenDobladoFpm) { nuevo.tren = 1; nuevo.trenLado = banco > 2 ? lado : 1; }
  // (0.14.127: la hélice golpeada sigue andando, áspera; solo un golpe fuerte de nariz la para)
  if (nariz < DANOS.heliceGrados && fpm > DANOS.heliceFpm) nuevo.helice = fpm > DANOS.trenRotoFpm ? 1 : 0.5;
  if (banco > DANOS.alabeoPuntaGrados) nuevo.puntaAla = lado;
  if (nariz > DANOS.colaGrados) { nuevo.cola = 1; nuevo.elevador = fpm > DANOS.trenDobladoFpm ? 0.5 : 0.25; }
  if ((banco > DANOS.alabeoGomaGrados && banco <= DANOS.alabeoPuntaGrados) || kt > DANOS.gomaKt) nuevo.goma = banco > 2 ? lado : 1;
  const deCostado = Math.abs(toque.lateralKt ?? 0), ladoDeriva = (toque.lateralKt ?? 0) > 0 ? 1 : -1;
  if (deCostado > DANOS.ladoGomaKt) nuevo.goma = nuevo.goma || ladoDeriva;
  if (deCostado > DANOS.ladoTrenKt) { nuevo.tren = Math.max(nuevo.tren ?? 0, 1); nuevo.trenLado = nuevo.trenLado || ladoDeriva; }
  if (deCostado > DANOS.ladoVuelcoKt && (toque.alabeo ?? 0) * ladoDeriva > 3) nuevo.puntaAla = ladoDeriva;
  if (toque.dentro === false && kt > DANOS.pastoTrenKt) { nuevo.tren = Math.max(nuevo.tren ?? 0, 1); nuevo.trenLado = nuevo.trenLado || 1; }
  const danos = juntar(d0, nuevo);
  const antesL = new Set(listaDanos(d0)), nuevos = listaDanos(danos).filter(x => !antesL.has(x));
  return { fatal, nuevos, danos };
}

// Un pájaro: dónde pegó (parte: 'parabrisas' | 'borde' | 'motor'; lado del ala ±1). → los daños nuevos.
export function danoAve(antes, parte, lado = 1) {
  const n = parte === 'parabrisas' ? { parabrisas: 1 } : parte === 'borde' ? { borde: lado || 1 } : { motorAve: 1 };
  return juntar(antes, n);
}

// Lo que hacen los daños en el vuelo (para vuelo-modelo.js):
// potencia (factor), rugido (vibración 0..1), alabeo (°/s² que tira hacia un lado en el aire), tiron (°/s del rumbo en el
// suelo), frenoSuelo (kt/s de roce con todo el peso en el suelo: el ala que sostiene lo alivia), inclinacion (° de alabeo quieto en el suelo), motorPara.
export function efectosDanos(d) {
  // potencia, rugido, alabeo (°/s² hacia un lado), tiron (°/s en el suelo), frenoSuelo (kt/s), inclinacion (° en el suelo),
  // motorPara, autAlabeo y autCabeceo (cuánto responden los alerones y el timón de profundidad, 0..1), cabeceoExtra (°/s de
  // nariz que se va sola), oscila (0..1: la cola muy dañada hace oscilar la nariz cada vez más), guinada (°/s del rumbo en el
  // aire), flapsFijos (los flaps no se mueven), sustentacion (factor por las alas dobladas).
  const e = { potencia: 1, rugido: 0, alabeo: 0, tiron: 0, frenoSuelo: 0, inclinacion: 0, motorPara: false, hundido: 0, fugaGph: 0, desgasteS: 0, autAlabeo: 1, autCabeceo: 1, cabeceoExtra: 0, oscila: 0, guinada: 0, flapsFijos: false, sustentacion: 1 };
  if (!d) return e;
  if (d.helice > 0) { e.potencia *= d.helice >= 1 ? 0 : 0.7; e.rugido = Math.max(e.rugido, d.helice >= 1 ? 0.9 : 0.65); e.motorPara = d.helice >= 1; }
  if (d.motorAve > 0) { e.potencia *= 0.75; e.rugido = Math.max(e.rugido, 0.5); }
  if (d.puntaAla) { e.alabeo += d.puntaAla * 6; e.autAlabeo *= 0.85; }
  if (d.borde) e.alabeo += d.borde * 5;
  // (tren roto: los nuevos puntos de apoyo son la panza y la punta del ala de ese lado: el avión baja ~1.8 ft, se inclina
  // ~12° y se arrastra con mucha fricción; doblado: rueda, inclinado un poco y tirando hacia ese lado)
  if (d.tren >= 2) { e.tiron += (d.trenLado || 1) * 9; e.frenoSuelo += 2.3; e.inclinacion = (d.trenLado || 1) * 12; e.hundido = 1.8; }
  else if (d.tren >= 1) { e.tiron += (d.trenLado || 1) * 3; e.frenoSuelo += 0.6; e.inclinacion = (d.trenLado || 1) * 2.5; e.hundido = 0.4; }
  if (d.goma) { e.tiron += d.goma * 4; e.frenoSuelo += 0.8; }
  if (d.cola) { e.guinada += 0.6; }
  if (d.elevador > 0) { e.autCabeceo *= 1 - Math.min(0.85, d.elevador * 0.7); e.cabeceoExtra += -d.elevador * 1.5; if (d.elevador >= 0.8) e.oscila = Math.min(1, d.elevador); }
  if (d.aleron > 0) { e.autAlabeo *= 1 - Math.min(0.7, d.aleron * 0.6); e.alabeo += d.aleron * 3; }
  if (d.flapAtascado || d.flapAsim) e.flapsFijos = true;
  if (d.flapAsim) e.alabeo += d.flapAsim * 7;
  if (d.alas > 0) { e.sustentacion = 1 - Math.min(0.15, d.alas * 0.08); e.alabeo += d.alas * 1.5; }
  // (0.14.130: el combustible que se va por el ala dañada; el motor que se gasta: el aceite, la temperatura y, gastado,
  // áspero y con menos potencia; del todo, se para)
  e.fugaGph = (d.borde ? DESGASTE.fugaBordeGph : 0) + (d.alas > 0 ? DESGASTE.fugaAlasGph : 0);
  e.desgasteS = d.motorAve > 0 ? DESGASTE.motorAveS : d.helice > 0 && d.helice < 1 ? DESGASTE.heliceS : 0;
  const w = d.motorDesgaste ?? 0;
  if (w > 0.5) { e.rugido = Math.max(e.rugido, 0.4 + (w - 0.5)); e.potencia *= 1 - (w - 0.5) * 0.8; }
  if (w >= 1) e.motorPara = true;
  return e;
}

// 0.14.127: el desgaste de cada momento por pasarse de los límites (en lugar de «se rompió de golpe»). → { danos, nuevos
// (los ids nuevos de la lista), avisos (los que tocan ahora: 'vfe' | 'vno' | 'vne' | 'g'), fatal }. Con el Asistente, más
// despacio (avisos y daño solo en los extremos). turb: 0..1 (la turbulencia de ahora).
export function desgastePaso(d0, { kt = 0, g = 1, flaps = 0, turb = 0, dt = 0, asistente = false, enSuelo = false, lado = 1 } = {}) {
  const L = LIMITES_VEL, d = { ...sinDanos(), ...(d0 ?? {}) }, avisos = [], k = asistente ? 0.25 : 1;
  // (con el Asistente: avisa igual, pero el daño empieza solo en los extremos: mucho más allá de cada límite)
  const m = asistente ? { vfe: 20, vno: 15, vne: 10, g: 0.8 } : { vfe: 0, vno: 0, vne: 0, g: 0 };
  // (nada pasado de los límites: los daños quedan como estaban, el mismo objeto)
  const pasa = !enSuelo && ((flaps > 0.05 && kt > L.vfeKt) || (kt > L.vnoKt && turb > 0.25) || kt > L.vneKt || g > L.gMax || g < L.gMin);
  if (!pasa) return { danos: d0, nuevos: [], avisos, fatal: false };
  const antes = new Set(listaDanos(d0));
  // Flaps afuera más rápido que la VFE: primero sacuden; después se traban; al final uno se daña (asimétricos).
  if (flaps > 0.05 && kt > L.vfeKt) {
    avisos.push('vfe');
    if (kt > L.vfeKt + m.vfe) d.flapEstres += ((kt - L.vfeKt) / 15) * dt * k;
    if (d.flapEstres > 1) d.flapAtascado = 1;
    if (d.flapEstres > 2.5 && !d.flapAsim) d.flapAsim = (typeof lado === 'function' ? lado() : lado) || 1;
  }
  // En el arco amarillo con turbulencia: la estructura se cansa.
  if (kt > L.vnoKt && turb > 0.25) { avisos.push('vno'); if (kt > L.vnoKt + m.vno) d.estres += ((kt - L.vnoKt) / 34) * turb * dt * 0.25 * k; }
  // Pasada la VNE: el aleteo (flutter) daña los alerones, después el timón de profundidad, y sostenido, la rotura.
  if (kt > L.vneKt) {
    avisos.push('vne');
    if (kt > L.vneKt + m.vne) d.flutter += ((kt - L.vneKt + 5) / 15) * dt * k;
    if (d.flutter > 1) d.aleron = Math.max(d.aleron, Math.min(1, (d.flutter - 1) * 0.6));
    if (d.flutter > 2) d.elevador = Math.max(d.elevador, Math.min(1, (d.flutter - 2) * 0.5));
  }
  // Más G que el límite: la estructura se dobla de a poco; con 1.5 veces el límite, se rompe.
  if (g > L.gMax || g < L.gMin) { avisos.push('g'); if (g > L.gMax + m.g || g < L.gMin - m.g) d.estres += (g > L.gMax ? g - L.gMax : L.gMin - g) * dt * 0.8 * k; }
  if (d.estres > 1) d.alas = Math.max(d.alas, Math.min(1.5, d.estres - 0.5));
  const fatal = (!asistente && (g > L.gMax * L.seguridad || g < L.gMin * L.seguridad)) || d.estres > 3 || d.flutter > 5;
  const nuevos = listaDanos(d).filter(x => !antes.has(x));
  return { danos: d, nuevos, avisos, fatal };
}
