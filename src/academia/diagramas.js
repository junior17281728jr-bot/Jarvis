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
// Los dibujos que ya existían y que la fábrica también puede pedir (sin datos propios).
export const VISUALES_SIMPLES = Object.freeze(['titulo', 'cartel']);
const MAX = Object.freeze({ elementos: 8, pasos: 7, columnas: 4, filas: 6, texto: 160, largo: 400 });
const corto = (v, max = MAX.texto) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const numero = v => typeof v === 'number' && Number.isFinite(v);

// → lista de motivos (vacía si está bien).
export function revisarDiagrama(tipo, p) {
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

// ¿La tarjeta de la fábrica tiene algo que se VEA? (foto del libro, un dibujo bien llenado, o «solo texto» con motivo)
export function tarjetaConVisual(s) {
  if (s?.imagen?.archivo || s?.clip?.archivo) return true;
  if (s?.visual?.tipo && (VISUALES_SIMPLES.includes(s.visual.tipo) || (TIPOS_DIAGRAMA.includes(s.visual.tipo) && !revisarDiagrama(s.visual.tipo, s.visual.parametros).length))) return true;
  return typeof s?.solo_texto === 'string' && s.solo_texto.trim().length >= 10;
}
