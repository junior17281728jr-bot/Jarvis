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
  fuente: 'AFH cap. 9',
});
export const AVES = Object.freeze({ bajoFt: 3000, migracion: 'marzo–abril y agosto–noviembre', fuente: 'AIM 7-5-1 · 7-5-2 · 7-5-3' });
export const PARTES_AVE = Object.freeze(['parabrisas', 'borde', 'motor']);

export const sinDanos = () => ({ tren: 0, trenLado: 0, helice: 0, puntaAla: 0, cola: 0, goma: 0, parabrisas: 0, borde: 0, motorAve: 0 });
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
  return out;
}
const juntar = (a, b) => {
  const o = { ...sinDanos(), ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) o[k] = typeof v === 'number' && (k === 'trenLado' || k === 'puntaAla' || k === 'goma' || k === 'borde') ? (v || o[k]) : Math.max(o[k] ?? 0, v);
  return o;
};

// Un toque (el del modelo: kt, vs, alabeo, cabeceo, dentro, agua) → { fatal, nuevos: [ids], danos } (danos: con los de antes).
export function clasificarImpacto(toque, antes = null) {
  const d0 = { ...sinDanos(), ...(antes ?? {}) };
  if (!toque || toque.agua) return { fatal: false, nuevos: [], danos: d0 };
  const fpm = Math.max(0, -(toque.vs ?? 0)), banco = Math.abs(toque.alabeo ?? 0), lado = (toque.alabeo ?? 0) > 0 ? 1 : -1, nariz = toque.cabeceo ?? 0, kt = toque.kt ?? 0;
  const fatal = fpm > DANOS.fatalFpm || banco > DANOS.alabeoFatalGrados || (nariz < DANOS.narizFatalGrados && fpm > 600);
  const nuevo = {};
  if (fpm > DANOS.trenRotoFpm) { nuevo.tren = 2; nuevo.trenLado = banco > 2 ? lado : 1; } else if (fpm > DANOS.trenDobladoFpm) { nuevo.tren = 1; nuevo.trenLado = banco > 2 ? lado : 1; }
  if (nariz < DANOS.heliceGrados && fpm > DANOS.heliceFpm) nuevo.helice = fpm > 900 ? 1 : 0.5;
  if (banco > DANOS.alabeoPuntaGrados) nuevo.puntaAla = lado;
  if (nariz > DANOS.colaGrados) nuevo.cola = 1;
  if ((banco > DANOS.alabeoGomaGrados && banco <= DANOS.alabeoPuntaGrados) || kt > DANOS.gomaKt) nuevo.goma = banco > 2 ? lado : 1;
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
// suelo), frenoSuelo (kt/s), inclinacion (° de alabeo quieto en el suelo), motorPara.
export function efectosDanos(d) {
  const e = { potencia: 1, rugido: 0, alabeo: 0, tiron: 0, frenoSuelo: 0, inclinacion: 0, motorPara: false };
  if (!d) return e;
  if (d.helice > 0) { e.potencia *= d.helice >= 1 ? 0 : 0.7; e.rugido = Math.max(e.rugido, d.helice >= 1 ? 0.9 : 0.6); e.motorPara = d.helice >= 1; }
  if (d.motorAve > 0) { e.potencia *= 0.75; e.rugido = Math.max(e.rugido, 0.5); }
  if (d.puntaAla) e.alabeo += d.puntaAla * 6;
  if (d.borde) e.alabeo += d.borde * 5;
  if (d.tren >= 2) { e.tiron += (d.trenLado || 1) * 9; e.frenoSuelo += 7; e.inclinacion = (d.trenLado || 1) * 7; }
  else if (d.tren >= 1) { e.tiron += (d.trenLado || 1) * 3; e.frenoSuelo += 1.5; e.inclinacion = (d.trenLado || 1) * 2.5; }
  if (d.goma) { e.tiron += d.goma * 4; e.frenoSuelo += 2.5; }
  return e;
}
