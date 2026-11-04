// Salario: lee cantidades de dinero solo donde se habla de dinero.
// Un número cuenta como salario si va junto a una palabra de salario («salario 25 mil», «que paguen…»),
// o si dice que es dinero (RD$, US$, pesos, mil, 20k, «al mes»). Los teléfonos, los años, las direcciones
// y las cantidades de otras cosas («5 años», «3 sucursales») no son salario.
// Si las cantidades no cuadran entre sí, no se adivina: se pregunta.
import { crearIndice, buscarEn } from './texto.js';

const indice = (pares) => crearIndice(pares.flatMap(([dato, frases]) => frases.map(frase => ({ frase, dato }))));

export const PALABRAS_SALARIO = new Set(['salario', 'salarios', 'sueldo', 'sueldos', 'pago', 'paga', 'pagan', 'paguen', 'pague', 'pagar', 'pagarme',
  'ganar', 'gane', 'ganando', 'gano', 'ganaria', 'cobrar', 'cobro', 'ingreso', 'ingresos', 'remuneracion', 'devengar', 'salary', 'pay', 'paying',
  'pays', 'paid', 'wage', 'wages', 'earn', 'earning', 'earnings', 'compensation']);
const ANTES_DE_SALARIO = new Set(['que', 'me', 'con', 'y', 'un', 'una', 'el', 'mi', 'de', 'buen', 'a', 'to', 'para', 'of', 'the', 'and', 'with']);

const COMPARADORES = indice([
  ['min', ['mas de', 'mas que', 'superior a', 'superior de', 'mayor a', 'mayor de', 'minimo', 'minimo de', 'como minimo', 'al menos', 'por lo menos',
    'desde', 'a partir de', 'arriba de', 'por encima de', 'no menos de', 'no menor de', 'no menor a', 'no inferior a', 'no inferior de', 'de mas de',
    'over', 'more than', 'at least', 'above', 'minimum', 'minimum of', 'starting at', 'no less than', 'not less than']],
  ['max', ['menos de', 'hasta', 'maximo', 'maximo de', 'como maximo', 'inferior a', 'por debajo de', 'no mas de', 'no mayor de', 'no mayor a',
    'no superior a', 'under', 'up to', 'less than', 'below', 'maximum', 'no more than', 'not more than', 'at most']],
  ['entre', ['entre', 'between']],
  ['de', ['de', 'from', 'of', 'en']],
]);
const DESPUES = indice([
  ['min', ['o mas', 'o mas que eso', 'para arriba', 'pa arriba', 'en adelante', 'como minimo', 'minimo', 'or more', 'and up', 'plus', 'o superior']],
  ['max', ['o menos', 'como maximo', 'maximo', 'or less', 'at most', 'tops', 'max']],
  ['extra', ['mas propinas', 'mas comisiones', 'mas beneficios', 'con propinas', 'plus tips', 'plus commissions']],
  ['nada', ['netos', 'brutos', 'libres', 'aproximadamente', 'aprox', 'mas o menos', 'dominicanos']],
]);
export const PERIODOS = indice([
  ['mensual', ['mensual', 'mensuales', 'al mes', 'por mes', 'cada mes', 'el mes', 'a month', 'per month', 'monthly', 'mensualmente']],
  ['quincenal', ['quincenal', 'quincenales', 'por quincena', 'cada quincena', 'a la quincena', 'quincenalmente', 'biweekly']],
  ['semanal', ['semanal', 'semanales', 'por semana', 'a la semana', 'cada semana', 'semanalmente', 'a week', 'per week', 'weekly']],
  ['diario', ['diario', 'diarios', 'por dia', 'al dia', 'diariamente', 'a day', 'per day', 'daily']],
  ['hora', ['por hora', 'la hora', 'a la hora', 'an hour', 'per hour', 'hourly']],
  ['anual', ['anual', 'anuales', 'al ano', 'por ano', 'a year', 'per year', 'yearly', 'annually']],
]);
const A_CONVENIR = indice([['nada', ['a convenir', 'negociable', 'a negociar', 'competitivo', 'segun experiencia', 'negotiable']]]);

// Cosas que se cuentan: un número delante de estas palabras no es dinero.
export const UNIDADES = new Set(['ano', 'anos', 'mes', 'meses', 'dia', 'dias', 'hora', 'horas', 'semana', 'semanas', 'minuto', 'minutos', 'year', 'years',
  'month', 'months', 'day', 'days', 'hour', 'hours', 'week', 'weeks', 'km', 'kilometro', 'kilometros', 'metro', 'metros', 'milla', 'millas',
  'empleado', 'empleados', 'trabajador', 'trabajadores', 'persona', 'personas', 'habitacion', 'habitaciones', 'cama', 'camas', 'sucursal',
  'sucursales', 'tienda', 'tiendas', 'local', 'locales', 'sede', 'sedes', 'unidad', 'unidades', 'vehiculo', 'vehiculos', 'camion', 'camiones',
  'carro', 'carros', 'piso', 'pisos', 'mesa', 'mesas', 'silla', 'sillas', 'estudiante', 'estudiantes', 'alumno', 'alumnos', 'paciente', 'pacientes',
  'cliente', 'clientes', 'kw', 'kilovatios', 'panel', 'paneles', 'porciento', 'employees', 'rooms', 'branches', 'people', 'locations',
  'stores', 'beds', 'students', 'edificio', 'edificios', 'apartamento', 'apartamentos', 'vez', 'veces', 'turno', 'turnos']);
// Lo que va antes de un número de dirección o de teléfono.
const ANTES_DE_DIRECCION = new Set(['calle', 'edificio', 'edif', 'no', 'numero', 'num', 'casa', 'apartamento', 'apto', 'local', 'km', 'kilometro',
  'manzana', 'torre', 'piso', 'nivel', 'suite', 'carretera', 'autopista', 'tramo', 'ruta', 'avenida', 'av', 'ave', 'sector', 'residencial', 'plaza']);
const ANTES_DE_TELEFONO = new Set(['tel', 'telefono', 'telefonos', 'cel', 'celular', 'whatsapp', 'wasap', 'llamar', 'llama', 'llamame', 'llamenme',
  'contacto', 'phone', 'call', 'movil', 'flota']);
const ANTES_DE_ANO = new Set(['desde', 'en', 'del', 'hasta', 'para', 'ano', 'year', 'since', 'in', 'de', 'el', 'antes', 'despues', 'until', 'by']);

function numero(texto) {
  let limpio = texto;
  if (/^\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$/.test(limpio)) {
    const decimales = limpio.match(/[.,](\d{1,2})$/);
    if (decimales && !/[.,]\d{3}$/.test(limpio)) limpio = `${limpio.slice(0, -decimales[0].length).replace(/[.,]/g, '')}.${decimales[1]}`;
    else limpio = limpio.replace(/[.,]/g, '');
  } else limpio = limpio.replace(',', '.');
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : null;
}

// ¿El número en «k» es (parte de) un teléfono? 809-555-1234, 8095551234, «tel 809…».
export function esTelefono(T, k) {
  const t = T[k];
  if (!t || t.tipo !== 'n') return false;
  const digitos = t.w.replace(/\D/g, '');
  if (digitos.length >= 10 && /^[0-9]+$/.test(t.w)) return true;
  const anterior = T[k - 1];
  if (anterior && ANTES_DE_TELEFONO.has(anterior.w)) return true;
  // 809-555-1234: se mira el número desde cualquiera de sus tres partes.
  const patron = j => /^[0-9]{3}$/.test(T[j]?.w || '') && T[j + 1]?.w === '-' && /^[0-9]{3}$/.test(T[j + 2]?.w || '') && T[j + 3]?.w === '-' && /^[0-9]{4}$/.test(T[j + 4]?.w || '');
  return patron(k) || patron(k - 2) || patron(k - 4);
}

// Dónde termina un teléfono que empieza en «k» (para guardarlo como «no es salario»).
export function finDeTelefono(T, k) {
  let j = k;
  if (T[j] && ANTES_DE_TELEFONO.has(T[j].w)) j++;
  if (T[j]?.w === 'al' || T[j]?.w === 'es') j++;
  if (!T[j] || T[j].tipo !== 'n' || !(esTelefono(T, j) || ANTES_DE_TELEFONO.has(T[k].w))) return k;
  const tope = j + 5;
  while (j < tope && T[j] && (T[j].tipo === 'n' || T[j].w === '-')) j++;
  return j;
}

// Una cantidad: [moneda] número [mil|k] [moneda] [periodo].
function leerMonto(T, k, enContexto) {
  let moneda = null;
  let marcador = false;
  let j = k;
  const w = T[j]?.w;
  if (w === 'rd$' || w === 'dop' || (w === 'rd' && T[j + 1]?.tipo === 'n')) { moneda = 'DOP'; marcador = true; j++; }
  else if (w === 'us$' || w === 'usd') { moneda = 'USD'; marcador = true; j++; }
  else if (w === '$') { marcador = true; j++; }
  const t = T[j];
  if (!t || t.tipo !== 'n') return null;
  if (esTelefono(T, j)) return null;
  const base = numero(t.w);
  if (base == null) return null;
  const antes = T[k - 1]?.w;
  j++;
  let mil = false;
  let factor = 1;
  if (T[j]?.w === 'mil' || T[j]?.w === 'k') { mil = true; factor = 1000; j++; }
  else if (T[j]?.w === 'millon' || T[j]?.w === 'millones') { mil = true; factor = 1_000_000; j++; }
  const sufijo = T[j]?.w;
  if (['pesos', 'peso', 'dop', 'rd$'].includes(sufijo) || (sufijo === 'rd' && T[j]?.tipo === 'p')) { moneda = 'DOP'; marcador = true; j++; }
  else if (['dolares', 'dolar', 'dollars', 'dollar', 'usd', 'us$'].includes(sufijo)) { moneda = 'USD'; marcador = true; j++; }
  if (T[j]?.w === 'dominicanos' || T[j]?.w === 'americanos') j++;
  let periodo = null;
  const p = buscarEn(T, j, PERIODOS);
  if (p) { periodo = p.datos[0]; marcador = true; j = p.fin; }
  if (!marcador && !mil) {
    if (!enContexto) return null;
    const siguiente = T[j];
    if (siguiente?.tipo === 'p' && UNIDADES.has(siguiente.w)) return null;
    if (siguiente?.w === '%' || siguiente?.w === '#') return null;
    if (base >= 1950 && base <= 2100 && Number.isInteger(base) && ANTES_DE_ANO.has(antes)) return null;
    if (antes && ANTES_DE_DIRECCION.has(antes)) return null;
  }
  return { valor: Math.round(base * factor), base, mil, moneda, periodo, marcador: marcador || mil, fin: j };
}

// Una expresión: [comparador] monto [(a|y|-|hasta) monto] [o más | máximo…].
function leerExpresion(T, k, enContexto) {
  let comp = null;
  let j = k;
  const c = buscarEn(T, j, COMPARADORES);
  if (c) { comp = c.datos[0]; j = c.fin; }
  if (T[j]?.tipo === 's' && T[j].w === ',' && comp) j++;
  const fuerte = enContexto || (comp && comp !== 'de');
  const a = leerMonto(T, j, true);
  if (!a) return null;
  const conector = T[a.fin]?.w;
  const valeConector = ['a', 'al', '-', 'hasta', 'to'].includes(conector) || (['y', 'and'].includes(conector) && comp === 'entre');
  const b = valeConector ? leerMonto(T, a.fin + 1, true) : null;
  // Sin nada que diga «salario», un número sin marca de dinero solo vale si abre un rango con dinero: «de 50 a 70 mil».
  if (!fuerte && !a.marcador && !(b && b.marcador)) return null;
  j = a.fin;
  if (b) {
    // «entre 20 y 30 mil»: el «mil» y la moneda del segundo también son del primero.
    if (b.mil && !a.mil && a.base < 1000) { a.valor = Math.round(a.base * (b.valor / b.base)); a.mil = true; a.marcador = true; }
    a.moneda ??= b.moneda;
    b.moneda ??= a.moneda;
    a.periodo ??= b.periodo;
    b.periodo ??= a.periodo;
    const extra = leerDespues(T, b.fin);
    return { fin: extra.fin, extras: extra.extras, montos: [{ ...a, rol: 'min' }, { ...b, rol: 'max' }] };
  }
  const despues = leerDespues(T, j);
  let rol = despues.rol || (comp === 'min' ? 'min' : comp === 'max' ? 'max' : 'suelto');
  if (comp === 'entre') rol = 'suelto';
  return { fin: despues.fin, extras: despues.extras, montos: [{ ...a, rol }] };
}

function leerDespues(T, k) {
  let j = k;
  let rol = null;
  const extras = [];
  for (let vueltas = 0; vueltas < 3; vueltas++) {
    if (T[j]?.w === '+') { rol = 'min'; j++; continue; }
    const p = buscarEn(T, j, PERIODOS);
    if (p) { j = p.fin; continue; }
    const d = buscarEn(T, j, DESPUES);
    if (!d) break;
    const tipo = d.datos[0];
    if (tipo === 'min' || tipo === 'max') rol = tipo;
    if (tipo === 'extra') extras.push({ ini: j, fin: d.fin });
    j = d.fin;
  }
  return { fin: j, rol, extras };
}

// ¿Empieza en «k» algo sobre el salario? Devuelve { ini, fin, montos, periodoAntes, extras, alternativa } o null.
export function salarioEn(T, k) {
  let j = k;
  let palabra = false;
  if (T[j] && ANTES_DE_SALARIO.has(T[j].w) && PALABRAS_SALARIO.has(T[j + 1]?.w)) j++;
  if (T[j] && PALABRAS_SALARIO.has(T[j].w)) {
    palabra = true;
    j++;
    if (['me', 'de', 'es', 'que', 'of', 'is'].includes(T[j]?.w)) j++;
  }
  let periodoAntes = null;
  if (palabra) {
    const p = buscarEn(T, j, PERIODOS);
    if (p) { periodoAntes = p.datos[0]; j = p.fin; }
    if (T[j]?.w === 'de') j++;
    if (T[j]?.tipo === 's' && T[j].w === ',') j++;
    const convenir = buscarEn(T, j, A_CONVENIR);
    if (convenir) return { ini: k, fin: convenir.fin, montos: [], extras: [], alternativa: false, periodoAntes, palabra };
    // «pago semanal» sin cifra: es una preferencia, no un salario.
    if (periodoAntes && !leerExpresion(T, j, true)) return { ini: k, fin: j, montos: [], extras: [], alternativa: false, periodoAntes, palabra, soloPeriodo: true };
  }
  const expresiones = [];
  let alternativa = false;
  for (let vueltas = 0; vueltas < 4; vueltas++) {
    const e = leerExpresion(T, j, palabra || expresiones.length > 0);
    if (!e) break;
    expresiones.push(e);
    j = e.fin;
    const sigue = T[j];
    if (!sigue) break;
    if ((sigue.w === ',' || sigue.w === 'y' || sigue.w === 'and') && leerExpresion(T, j + 1, true)) { j++; continue; }
    if ((sigue.w === 'o' || sigue.w === 'or') && leerExpresion(T, j + 1, true)) { alternativa = true; j++; continue; }
    break;
  }
  if (!expresiones.length) return null;
  const montos = expresiones.flatMap(e => e.montos);
  if (!palabra && !montos.some(m => m.marcador)) return null;
  return { ini: k, fin: j, montos, extras: expresiones.flatMap(e => e.extras), alternativa, periodoAntes, palabra };
}

// Junta todo lo que se dijo del salario. Devuelve { minimo, maximo, moneda, duda, supuesto }.
// duda: 'salario' (no cuadra) o 'salario_periodo' (no es mensual). Con duda, no se pone ninguna cifra.
export function juntarSalario(tramos, limite) {
  const montos = tramos.flatMap(t => t.montos.map(m => ({ ...m, periodo: m.periodo || t.periodoAntes })));
  const vacio = { minimo: null, maximo: null, moneda: null, duda: null, supuesto: false };
  if (!montos.length) return vacio;
  if (montos.some(m => m.periodo && m.periodo !== 'mensual')) return { ...vacio, duda: 'salario_periodo' };
  if (tramos.some(t => t.alternativa)) return { ...vacio, duda: 'salario' };
  const monedas = new Set(montos.map(m => m.moneda).filter(Boolean));
  if (monedas.size > 1) return { ...vacio, duda: 'salario' };
  const moneda = monedas.size ? [...monedas][0] : 'DOP';
  for (const m of montos) {
    const muyPoco = moneda === 'USD' ? m.valor < 50 : m.valor < 1000;
    if (muyPoco || m.valor > limite) return { ...vacio, duda: 'salario' };
  }
  const minimos = [...new Set(montos.filter(m => m.rol === 'min').map(m => m.valor))];
  const maximos = [...new Set(montos.filter(m => m.rol === 'max').map(m => m.valor))];
  const sueltos = [...new Set(montos.filter(m => m.rol === 'suelto').map(m => m.valor))];
  if (minimos.length > 1 || maximos.length > 1 || sueltos.length > 1 || (sueltos.length && minimos.length)) return { ...vacio, duda: 'salario' };
  let supuesto = false;
  let minimo = minimos[0] ?? null;
  const maximo = maximos[0] ?? null;
  if (sueltos.length) {
    minimo = sueltos[0];
    supuesto = true;
  }
  if (minimo != null && maximo != null && minimo > maximo) return { ...vacio, duda: 'salario' };
  return { minimo, maximo, moneda, duda: null, supuesto };
}
