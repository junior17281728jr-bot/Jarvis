// Academia 0.13.0: los DIBUJOS que la fábrica puede llenar con datos (el «visual» de una tarjeta, public/clase/diagramas.js
// los dibuja en SVG). Todos usan la misma forma de parámetros, así el modelo los llena con un solo esquema:
//   { titulo?, unidad?, columnas?: [texto], filas?: [[texto]], elementos?: [{ nombre, detalle?, valor?, hasta? }],
//     problema?, formula?, resultado? }
//  - diagrama-partes: las partes de algo con su rótulo (elementos: nombre + detalle).
//  - diagrama-tabla: una comparación (columnas ≤ 4 y filas ≤ 6, del mismo largo).
//  - diagrama-pasos: una secuencia o un flujo (elementos en orden, ≤ 7).
//  - diagrama-escala: una escala o un instrumento con valores (unidad; elementos con valor numérico, en orden).
//  - diagrama-capas: capas o franjas (espacio aéreo, nubes): elementos con valor (desde) y hasta, de abajo hacia arriba.
//  - diagrama-linea: una línea de tiempo (elementos: nombre = el momento, detalle = lo que pasa).
//  - calculo: un ejemplo resuelto (peso y balance, altitud de densidad, combustible, viento…): problema, fórmula, cada
//    paso con sus números (elementos) y el resultado.
// Puro: lo usan formato.js (si una tarjeta trae uno, sus datos tienen que estar bien) y la fábrica (cada tarjeta lleva un
// dibujo, la foto del libro o «solo texto» con el motivo).
export const TIPOS_DIAGRAMA = Object.freeze(['diagrama-partes', 'diagrama-tabla', 'diagrama-pasos', 'diagrama-escala', 'diagrama-capas', 'diagrama-linea', 'calculo']);
// 0.14.62: los dibujos de AVIACIÓN con parámetros propios (public/clase/aviacion.js los dibuja; cada uno tiene su forma,
// distinta de la de arriba). Los escribe el autor del paquete; la fábrica todavía no los pide (su esquema no los tiene).
//  - circuito: el circuito de tránsito (pista, lado, altitud, tramo resaltado, entrada a 45°, viento y manga).
//  - pista-marcas: las marcas de una pista visual, de no precisión o de precisión (y desplazado, zona previa, cerrada).
//  - letreros: los letreros del aeropuerto y las marcas de espera, el área crítica del ILS y el «hot spot».
//  - vor: el CDI (curso del OBS, TO/FROM, la aguja a 2° por punto) y dónde está el avión.
//  - triangulo-viento: curso, rumbo, viento, velocidad sobre el suelo y corrección, a escala.
//  - carta-simbolos: los símbolos de la carta seccional, como una leyenda.
export const TIPOS_DIBUJO = Object.freeze(['circuito', 'pista-marcas', 'letreros', 'vor', 'triangulo-viento', 'carta-simbolos']);
export const TRAMOS_CIRCUITO = Object.freeze(['upwind', 'crosswind', 'downwind', 'base', 'final', 'entrada', 'salida']);
export const MARCAS_PISTA = Object.freeze(['designador', 'eje', 'umbral', 'punto_mira', 'zona_contacto', 'bordes', 'umbral_desplazado', 'zona_previa', 'cerrada']);
export const CLASES_PISTA = Object.freeze(['visual', 'no_precision', 'precision']);
export const ANCHOS_PISTA = Object.freeze([60, 75, 100, 150, 200]);
export const TIPOS_LETRERO = Object.freeze(['obligatorio', 'no_entrar', 'ubicacion', 'direccion', 'destino', 'informacion', 'distancia', 'limite_pista', 'limite_ils', 'espera_pista', 'espera_ils', 'punto_caliente']);
export const FLECHAS_LETRERO = Object.freeze(['izquierda', 'derecha', 'arriba', 'abajo', 'arriba_izquierda', 'arriba_derecha', 'abajo_izquierda', 'abajo_derecha']);
export const SIMBOLOS_CARTA = Object.freeze(['aeropuerto_torre', 'aeropuerto_sin_torre', 'aeropuerto_largo', 'aeropuerto_blando', 'aeropuerto_privado',
  'clase_b', 'clase_c', 'clase_d', 'clase_e_superficie', 'clase_e_700', 'clase_e_1200', 'moa', 'restringida', 'prohibida',
  'vor', 'vor_dme', 'vortac', 'ndb', 'obstaculo', 'obstaculo_alto', 'mef']);
// 0.14.78: las ESCENAS 3D (tipo «escena-3d», public/clase/escena3d.js): una animación guiada por pasos. Parámetros:
//   { escena, titulo?, pasos?: [{ id, texto?, mas? }] }. Sin «pasos», todos; con «pasos», esos (sin repetir) en ese orden, y
//   con su texto propio si se da (texto con **negrita**, «mas» es el «Ver más»). La lista de pasos de cada escena es la
//   de public/clase/escenas3d.js (una prueba revisa que coincidan).
export const TIPO_ESCENA_3D = 'escena-3d';
export const ESCENAS_3D = Object.freeze({
  'espacio-aereo': Object.freeze(['vista', 'g', 'e', 'd', 'c', 'c1p', 'b', 'a']),
  'minimos-vfr': Object.freeze(['burbuja', 'vis', 'alto', 'b', 'g']),
  'circuito-3d': Object.freeze(['vista', 'salida', 'cruzado', 'cola', 'cola1p', 'base', 'final', 'entrada']),
  frentes: Object.freeze(['vista', 'calido', 'calidoPaso', 'frio', 'frio1p', 'frioPaso']),
  perdida: Object.freeze(['aoa', 'masAoa', 'critico', 'recuperar', 'g0', 'g45', 'g60']),
  'vor-3d': Object.freeze(['radiales', 'hacia', 'desvio', 'desde', 'rumbo']),
});
export const LIMITES_ESCENA_3D = Object.freeze({ pasos: 10, texto: 220, mas: 420 });
function revisarEscena3d(p) {
  if (p == null || typeof p !== 'object' || Array.isArray(p)) return ['sin_parametros'];
  const mal = [];
  if (!(typeof p.escena === 'string' && Object.hasOwn(ESCENAS_3D, p.escena))) return ['escena'];
  if (p.titulo != null && !corto(p.titulo)) mal.push('titulo');
  if (p.pasos != null) {
    const L = LIMITES_ESCENA_3D, ids = ESCENAS_3D[p.escena];
    if (!Array.isArray(p.pasos) || !p.pasos.length || p.pasos.length > Math.min(L.pasos, ids.length)) return [...mal, 'pasos'];
    const vistos = new Set();
    p.pasos.forEach((x, i) => {
      if (!x || typeof x !== 'object' || Array.isArray(x) || !ids.includes(x.id)) return mal.push(`pasos[${i}].id`);
      if (vistos.has(x.id)) mal.push(`pasos[${i}].repetido`);
      vistos.add(x.id);
      if (x.texto != null && !corto(x.texto, L.texto)) mal.push(`pasos[${i}].texto`);
      if (x.mas != null && !corto(x.mas, L.mas)) mal.push(`pasos[${i}].mas`);
      for (const k of Object.keys(x)) if (!['id', 'texto', 'mas'].includes(k)) mal.push(`pasos[${i}].${k}`);
    });
  }
  for (const k of Object.keys(p)) if (!['escena', 'titulo', 'pasos'].includes(k)) mal.push(k);
  return mal;
}
// Los dibujos que ya existían y que la fábrica también puede pedir (sin datos propios).
export const VISUALES_SIMPLES = Object.freeze(['titulo', 'cartel']);
const MAX = Object.freeze({ elementos: 8, pasos: 7, columnas: 4, filas: 6, texto: 160, largo: 400 });
const corto = (v, max = MAX.texto) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const numero = v => typeof v === 'number' && Number.isFinite(v);

// → lista de motivos (vacía si está bien).
export function revisarDiagrama(tipo, p) {
  if (TIPOS_DIBUJO.includes(tipo)) return revisarDibujo(tipo, p);
  if (tipo === TIPO_ESCENA_3D) return revisarEscena3d(p);
  if (!TIPOS_DIAGRAMA.includes(tipo)) return [];
  const mal = [];
  if (p == null || typeof p !== 'object' || Array.isArray(p)) return ['sin_parametros'];
  if (p.titulo != null && !corto(p.titulo)) mal.push('titulo');
  const elementos = Array.isArray(p.elementos) ? p.elementos : null;
  const conElementos = (min, max, { valor = false, hasta = false, detalle = false } = {}) => {
    if (!elementos || elementos.length < min || elementos.length > max) return mal.push('elementos');
    elementos.forEach((e, i) => {
      if (!e || typeof e !== 'object' || !corto(e.nombre)) mal.push(`elementos[${i}].nombre`);
      if (detalle && !corto(e?.detalle, MAX.largo)) mal.push(`elementos[${i}].detalle`);
      else if (e?.detalle != null && !corto(e.detalle, MAX.largo)) mal.push(`elementos[${i}].detalle`);
      if (valor && !numero(e?.valor)) mal.push(`elementos[${i}].valor`);
      if (hasta && !(numero(e?.hasta) && e.hasta > e.valor)) mal.push(`elementos[${i}].hasta`);
    });
  };
  switch (tipo) {
    case 'diagrama-partes': conElementos(2, MAX.elementos); break;
    case 'diagrama-pasos': conElementos(2, MAX.pasos); break;
    case 'diagrama-linea': conElementos(2, MAX.elementos, { detalle: true }); break;
    case 'diagrama-escala':
      conElementos(2, MAX.elementos, { valor: true });
      if (p.unidad != null && !corto(p.unidad, 20)) mal.push('unidad');
      if (elementos && elementos.some((e, i) => i > 0 && numero(e?.valor) && numero(elementos[i - 1]?.valor) && e.valor < elementos[i - 1].valor)) mal.push('orden');
      break;
    case 'diagrama-capas': conElementos(1, MAX.elementos, { valor: true, hasta: true }); if (p.unidad != null && !corto(p.unidad, 20)) mal.push('unidad'); break;
    case 'diagrama-tabla': {
      const c = p.columnas, f = p.filas;
      if (!Array.isArray(c) || c.length < 2 || c.length > MAX.columnas || !c.every(x => corto(x))) mal.push('columnas');
      if (!Array.isArray(f) || !f.length || f.length > MAX.filas || !f.every(fila => Array.isArray(fila) && fila.length === (c?.length ?? -1) && fila.every(x => corto(x)))) mal.push('filas');
      break;
    }
    case 'calculo':
      if (!corto(p.problema, MAX.largo)) mal.push('problema');
      if (!corto(p.formula, MAX.largo)) mal.push('formula');
      if (!corto(p.resultado, MAX.texto)) mal.push('resultado');
      conElementos(1, MAX.pasos, { detalle: true });
      break;
    default: break;
  }
  return mal;
}

// ---------- 0.14.62: los dibujos de aviación ----------
const PISTA = /^(0?[1-9]|[12][0-9]|3[0-6])[LCR]?$/;
const angulo = v => numero(v) && v >= 0 && v <= 360;
const entre = (v, min, max) => numero(v) && v >= min && v <= max;
const siNo = v => v == null || typeof v === 'boolean';
const unaDe = (v, lista) => typeof v === 'string' && lista.includes(v);
const listaDe = (v, lista, max) => Array.isArray(v) && v.length >= 1 && v.length <= max && v.every(x => unaDe(x, lista)) && new Set(v).size === v.length;
export const LIMITES_DIBUJO = Object.freeze({ letreros: 8, simbolos: 21, textoLetrero: 24, vientoCircuito: 60, tasMin: 30, tasMax: 500, vientoMax: 200 });

function revisarDibujo(tipo, p) {
  if (p == null || typeof p !== 'object' || Array.isArray(p)) return ['sin_parametros'];
  const mal = [];
  if (p.titulo != null && !corto(p.titulo)) mal.push('titulo');
  const viento = (v, max) => {
    if (v == null || typeof v !== 'object' || Array.isArray(v)) return mal.push('viento');
    if (!angulo(v.direccion)) mal.push('viento.direccion');
    if (!entre(v.velocidad, 0, max)) mal.push('viento.velocidad');
  };
  switch (tipo) {
    case 'circuito':
      if (p.pista != null && !(typeof p.pista === 'string' && PISTA.test(p.pista))) mal.push('pista');
      if (p.lado != null && !unaDe(p.lado, ['izquierda', 'derecha'])) mal.push('lado');
      if (p.altitud != null && !entre(p.altitud, 100, 5000)) mal.push('altitud');
      if (p.referencia != null && !unaDe(p.referencia, ['AGL', 'MSL'])) mal.push('referencia');
      if (p.resaltar != null && !unaDe(p.resaltar, TRAMOS_CIRCUITO)) mal.push('resaltar');
      for (const k of ['entrada', 'salida', 'manga']) if (!siNo(p[k])) mal.push(k);
      if (p.viento != null) viento(p.viento, LIMITES_DIBUJO.vientoCircuito);
      break;
    case 'pista-marcas':
      if (p.clase != null && !unaDe(p.clase, CLASES_PISTA)) mal.push('clase');
      if (p.numero != null && !(typeof p.numero === 'string' && PISTA.test(p.numero))) mal.push('numero');
      if (p.ancho != null && !ANCHOS_PISTA.includes(p.ancho)) mal.push('ancho');
      if (p.mostrar != null && !listaDe(p.mostrar, MARCAS_PISTA, MARCAS_PISTA.length)) mal.push('mostrar');
      if (p.resaltar != null && !listaDe(p.resaltar, MARCAS_PISTA, MARCAS_PISTA.length)) mal.push('resaltar');
      break;
    case 'letreros': {
      const l = p.letreros;
      if (!Array.isArray(l) || !l.length || l.length > LIMITES_DIBUJO.letreros) { mal.push('letreros'); break; }
      l.forEach((x, i) => {
        if (!x || typeof x !== 'object' || !unaDe(x.tipo, TIPOS_LETRERO)) return mal.push(`letreros[${i}].tipo`);
        const conTexto = !['no_entrar', 'espera_pista', 'espera_ils', 'limite_pista', 'limite_ils'].includes(x.tipo) && x.tipo !== 'punto_caliente';
        if (conTexto ? !corto(x.texto, LIMITES_DIBUJO.textoLetrero) : (x.texto != null && !corto(x.texto, LIMITES_DIBUJO.textoLetrero))) mal.push(`letreros[${i}].texto`);
        if (x.tipo === 'distancia' && !(typeof x.texto === 'string' && /^[1-9][0-9]?$/.test(x.texto))) mal.push(`letreros[${i}].texto`);
        if (x.flecha != null && !(unaDe(x.flecha, FLECHAS_LETRERO) && ['direccion', 'destino', 'obligatorio'].includes(x.tipo))) mal.push(`letreros[${i}].flecha`);
        if (x.nota != null && !corto(x.nota)) mal.push(`letreros[${i}].nota`);
        if (!siNo(x.pegado) || (x.pegado && i === 0)) mal.push(`letreros[${i}].pegado`);
      });
      break;
    }
    case 'vor':
      if (!angulo(p.curso)) mal.push('curso');
      if (!angulo(p.radial)) mal.push('radial');
      if (p.rumbo != null && !angulo(p.rumbo)) mal.push('rumbo');
      if (!siNo(p.mapa)) mal.push('mapa');
      break;
    case 'triangulo-viento':
      if (!angulo(p.curso)) mal.push('curso');
      if (!entre(p.tas, LIMITES_DIBUJO.tasMin, LIMITES_DIBUJO.tasMax)) mal.push('tas');
      viento(p.viento, LIMITES_DIBUJO.vientoMax);
      // Con viento más fuerte que la velocidad del avión no hay rumbo que mantenga el curso.
      if (numero(p.tas) && numero(p.viento?.velocidad) && p.viento.velocidad >= p.tas) mal.push('viento_mayor_que_tas');
      break;
    case 'carta-simbolos':
      if (p.simbolos != null && !listaDe(p.simbolos, SIMBOLOS_CARTA, LIMITES_DIBUJO.simbolos)) mal.push('simbolos');
      if (p.resaltar != null && !listaDe(p.resaltar, SIMBOLOS_CARTA, LIMITES_DIBUJO.simbolos)) mal.push('resaltar');
      break;
    default: break;
  }
  return mal;
}

// ¿La tarjeta de la fábrica tiene algo que se VEA? (foto del libro, un dibujo bien llenado, o «solo texto» con motivo)
export function tarjetaConVisual(s) {
  if (s?.imagen?.archivo || s?.clip?.archivo) return true;
  if (s?.visual?.tipo && (VISUALES_SIMPLES.includes(s.visual.tipo) || ([...TIPOS_DIAGRAMA, ...TIPOS_DIBUJO, TIPO_ESCENA_3D].includes(s.visual.tipo) && !revisarDiagrama(s.visual.tipo, s.visual.parametros).length))) return true;
  return typeof s?.solo_texto === 'string' && s.solo_texto.trim().length >= 10;
}
