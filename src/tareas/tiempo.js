// Horarios de los trabajos que se repiten, en hora de República Dominicana (UTC−4 todo el año: allí no se
// cambia la hora). Solo funciones puras: reciben la hora y devuelven cuentas, sin tocar nada.
//
// Una «ranura» es la vez que le toca a un programa: la de las 5:07 de hoy, la de la madrugada de hoy, la de
// esta semana… Su clave es única (por ejemplo 'sistema.vigilar@2026-11-04T05'), así que programar dos veces la
// misma ranura nunca crea dos tareas, y tras 3 días apagado solo se hace la ranura de ahora (una sola vez).

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const DIFERENCIA_RD = -4 * HORA;

const aLocal = ms => ms + DIFERENCIA_RD;
const aUtc = ms => ms - DIFERENCIA_RD;
const fechaLocal = ms => new Date(ms).toISOString();

export const CADAS = Object.freeze(['hora', 'diaria', 'semanal', 'mensual', 'manual']);

// { clave, inicio, siguiente } (inicio y siguiente en milisegundos UTC), o null para 'manual'.
// La semana empieza el lunes y el mes el día 1, a la hora y minuto del programa.
export function ranura({ programa, cada, hora = 0, minuto = 0 }, ahoraMs) {
  const local = aLocal(Number(ahoraMs));
  if (!Number.isFinite(local)) throw new Error('ranura: hora no válida');
  if (cada === 'hora') {
    const desfase = minuto * MINUTO;
    const inicio = Math.floor((local - desfase) / HORA) * HORA + desfase;
    return { clave: `${programa}@${fechaLocal(inicio).slice(0, 13)}`, inicio: aUtc(inicio), siguiente: aUtc(inicio + HORA) };
  }
  if (cada !== 'diaria' && cada !== 'semanal' && cada !== 'mensual') return null;
  const desfase = hora * HORA + minuto * MINUTO;
  // Se corre el día: antes de la hora del programa, todavía vale la ranura anterior.
  const dia = Math.floor((local - desfase) / DIA) * DIA;
  if (cada === 'diaria') {
    return { clave: `${programa}@${fechaLocal(dia).slice(0, 10)}`, inicio: aUtc(dia + desfase), siguiente: aUtc(dia + DIA + desfase) };
  }
  if (cada === 'semanal') {
    const lunes = dia - ((new Date(dia).getUTCDay() + 6) % 7) * DIA;
    return { clave: `${programa}@S${fechaLocal(lunes).slice(0, 10)}`, inicio: aUtc(lunes + desfase), siguiente: aUtc(lunes + 7 * DIA + desfase) };
  }
  const d = new Date(dia);
  const mes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const proximo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { clave: `${programa}@M${fechaLocal(mes).slice(0, 7)}`, inicio: aUtc(mes + desfase), siguiente: aUtc(proximo + desfase) };
}

// Hora repartida para los proyectos (fase 2): entre la 1:00 y las 5:59 de la madrugada, según su número, para
// que no arranquen todos a la vez ni de día.
export function horarioRepartido(proyectoId) {
  const n = Math.abs(Math.trunc(Number(proyectoId) || 0));
  const minutos = 60 + ((n * 37) % 300);
  return { hora: Math.floor(minutos / 60), minuto: minutos % 60 };
}

// ---------- Fase 1, parte d: el mes de cobro de la IA ----------
// El mes de la IA es el mismo con el que cobra el proveedor (su factura, su límite de gasto y su tope por nivel):
// el mes del calendario en hora universal (UTC), que empieza el día 1 a las 00:00 UTC. En RD eso es a las
// 8:00 p. m. del último día del mes anterior. Así «nunca pasa de US$X este mes» habla del mismo mes que la factura.
export function mesCobro(ms) {
  const fecha = new Date(Number(ms));
  if (!Number.isFinite(fecha.getTime())) throw new Error('mesCobro: hora no válida');
  return fecha.toISOString().slice(0, 7);
}

// Las 00:00 UTC del día 1 del mes de cobro siguiente (en milisegundos).
export function inicioMesSiguienteCobro(ms) {
  const fecha = new Date(Number(ms));
  if (!Number.isFinite(fecha.getTime())) throw new Error('inicioMesSiguienteCobro: hora no válida');
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 1);
}
