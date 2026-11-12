// Qué tipos de tarea existen y cómo se comportan. Lo importan los dos procesos (las pantallas y el
// trabajador), por eso aquí solo hay DATOS: el código que hace cada trabajo vive aparte y solo lo carga el
// trabajador. Los tipos de prueba NO viven aquí: están en test/tareas-prueba.js.

// En qué fase del plan estamos. Un tipo con una fase mayor existe en el código pero todavía no se usa.
export const FASE_ACTUAL = 1;

// Cuántas tareas a la vez, por cupo. «grande» es para trabajos pesados (revisar la base, copias…).
// Con el servidor de 512 MB: 1 normal y 1 grande. En la fase 2, con 1 GB, «normal» sube a 2.
export const CUPOS = Object.freeze({ normal: 1, grande: 1 });

// Lo que vale para un tipo cuando no dice otra cosa.
export const POR_DEFECTO = Object.freeze({
  fase: 1,
  cupo: 'normal',
  maxFallos: 3, // fallos SEGUIDOS antes de quedar «fallida» (un paso bueno pone la cuenta en cero)
  tiempoPorPasoMs: 60_000, // un paso que tarda más se corta
  repetible: true, // false = si se interrumpe a mitad, una persona revisa (nunca se repite solo: correos)
  ignoraFrenos: false, // true = corre aunque falte memoria o disco (vigilar, para que el aviso salga)
  prioridad: 0, // solo ordena dentro de un mismo carril
  reintentos: Object.freeze({ baseMs: 60_000, factor: 4, topeMs: 21_600_000 }), // 1 min, 4 min, 16 min… hasta 6 h
  frenoTrasFallos: 6, // tantos pasos fallidos seguidos (de 2 tareas o más) frenan el tipo un rato
});

export const TIPOS = Object.freeze({
  // Revisa la fila cada hora: avisos de tareas con error, por revisar o atrasadas.
  'sistema.vigilar': Object.freeze({ cupo: 'normal', maxFallos: 2, tiempoPorPasoMs: 30_000, ignoraFrenos: true, prioridad: 10 }),
  // Cada madrugada: revisa que la base esté sana y luego la ordena.
  'sistema.base': Object.freeze({ cupo: 'grande', maxFallos: 2, tiempoPorPasoMs: 300_000, prioridad: 10 }),
  // Fase 1, parte d: «Pedir ayuda a la IA» en un proyecto. 0.8.0: retirada con los proyectos de OPORTIA; el tipo sigue
  // registrado para las filas viejas de la base (una que quede en la fila termina sola, sin llamar a la IA).
  'ia.interpretar': Object.freeze({ cupo: 'normal', maxFallos: 2, tiempoPorPasoMs: 90_000, repetible: true, prioridad: 5 }),
  // Fase 1, parte e: la copia cifrada de cada noche (src/copias/hacer.js): a una carpeta del servidor y al chat privado
  // del dueño con su bot de Telegram. Pasos: preparar → generar → subir → verificar → indice.
  //  - «grande»: nunca a la vez que sistema.base (4:10). Los dos frenos (poca memoria, poco disco: < 300 MB) la paran.
  //  - tiempoPorPasoMs 30 min: el ÚNICO tipo con más de 10 minutos (test/reglas.test.js lo sabe). Solo «generar» sin
  //    copia en el servidor (las partes van directo a Telegram) puede tardar: se corta sola a los 25 min (la foto de la
  //    base no puede quedar abierta más). Los demás pasos vuelven en ~60 s con su avance guardado.
  //  - repetible: true aunque MANDA archivos: es una excepción pensada. Solo manda al chat del propio dueño; repetir un
  //    paso suma, como mucho, documentos repetidos en silencio y una copia nueva, y los topes de src/copias/hacer.js
  //    (3 copias por tarea, 3 copias subidas sin éxito por día, 12 esperas o 6 h de esperas por copia) ponen el límite.
  'copias.hacer': Object.freeze({
    cupo: 'grande', maxFallos: 3, tiempoPorPasoMs: 1_800_000, repetible: true, prioridad: 8,
    reintentos: Object.freeze({ baseMs: 10 * 60_000, factor: 3, topeMs: 6 * 3_600_000 }), // 10, 30, 90 min…
  }),
  // Academia (0.7.1): trae los paquetes de la carpeta de Google Drive del dueño (src/academia/sincronizar.js). Un paso,
  // cortado a los 10 min (lo que no alcanza, en la revisión siguiente: nada se repite ni se pisa). «repetible»: solo LEE
  // de Drive y agrega versiones nuevas (por su huella): repetirlo nunca crea dos veces la misma.
  'academia.drive': Object.freeze({ cupo: 'normal', maxFallos: 3, tiempoPorPasoMs: 600_000, repetible: true, prioridad: 3 }),
  // Academia (0.9.0): el «Instructor con IA» (src/academia/instructor-tarea.js). Un paso: una llamada a la IA con lo
  // que armó el servidor web (el trabajador nunca abre el paquete). «repetible»: la llamada se anota por tarea y paso,
  // así un reinicio a mitad nunca paga dos veces; una que se pidió hace más de 5 minutos termina sin llamar.
  'academia.instructor': Object.freeze({ cupo: 'normal', maxFallos: 1, tiempoPorPasoMs: 90_000, repetible: true, prioridad: 6, reintentos: Object.freeze({ baseMs: 30_000 }) }),
});

// La definición completa de un tipo (con lo que vale por defecto), o null si este código no lo conoce.
export function definicion(tipo, registro = TIPOS) {
  if (typeof tipo !== 'string' || !registro || !Object.hasOwn(registro, tipo)) return null;
  const propio = registro[tipo] ?? {};
  return { ...POR_DEFECTO, ...propio, reintentos: { ...POR_DEFECTO.reintentos, ...(propio.reintentos ?? {}) }, tipo };
}

// Los tipos que este código sabe hacer en esta fase.
export function tiposEjecutables(registro = TIPOS, fase = FASE_ACTUAL) {
  return Object.keys(registro).filter(tipo => definicion(tipo, registro).fase <= fase);
}

// Trabajos del sistema que se repiten (la hora es de República Dominicana).
export const PROGRAMAS_DEL_SISTEMA = Object.freeze([
  Object.freeze({ programa: 'sistema.vigilar', tipo: 'sistema.vigilar', cada: 'hora', minuto: 7 }),
  Object.freeze({ programa: 'sistema.base', tipo: 'sistema.base', cada: 'diaria', hora: 4, minuto: 10 }),
  // Después de la revisión de la base (4:10): una base dañada pone el modo seguro y nunca se copia encima de una buena.
  Object.freeze({ programa: 'copias.hacer', tipo: 'copias.hacer', cada: 'diaria', hora: 4, minuto: 40 }),
  // Academia (0.7.1): cada hora, a los :23, mira la carpeta de Drive (sin carpeta guardada no hace nada).
  Object.freeze({ programa: 'academia.drive', tipo: 'academia.drive', cada: 'hora', minuto: 23 }),
]);

// Cómo terminó cada vida del trabajador (trabajador_corridas.como_termino). Viven aquí, con los demás datos
// que comparten los dos procesos; src/tareas/corridas.js las vuelve a exportar.
export const COMO_TERMINA = Object.freeze([
  'normal', 'senal', 'sin_padre', 'modo_seguro', 'zombis',
  'caida', 'colgado', 'no_arranco', 'memoria', 'reemplazada', 'base_no_compatible', 'perdida',
]);
// Las que sí son un problema del trabajador: cuentan para el modo seguro, y la tarea que tenía en las manos
// suma un fallo (puede ser la culpable). «perdida» (un apagón, o se cayó el servicio entero), «normal»,
// «senal», «sin_padre», «modo_seguro» y «zombis» no cuentan.
export const ANORMALES = Object.freeze(['caida', 'colgado', 'no_arranco', 'memoria', 'reemplazada', 'base_no_compatible']);

// Cómo un trabajo dice qué le pasó. Cualquier otro error cuenta como un fallo que se puede reintentar.
//  - clave: texto corto que las pantallas traducen (por ejemplo 'sin_red' o 'tope_ia').
//  - reintentable: false = no tiene arreglo solo; la tarea queda «fallida» de una vez.
//  - esperarMs: cuánto esperar antes de volver a intentarlo (si no, lo calcula la política del tipo).
//  - noEsFallo: true = no es culpa de la tarea (tope de gasto de IA, cortesía con una web): espera sin contar fallo.
//  - revisar: true = una persona tiene que mirar antes de seguir (por ejemplo, no se sabe si un correo salió).
export class ErrorTarea extends Error {
  constructor(clave, { reintentable = true, esperarMs = null, noEsFallo = false, revisar = false } = {}) {
    super(String(clave));
    this.name = 'ErrorTarea';
    this.clave = String(clave);
    this.reintentable = reintentable !== false;
    this.esperarMs = esperarMs == null ? null : Number(esperarMs);
    this.noEsFallo = noEsFallo === true;
    this.revisar = revisar === true;
  }
}

// Esperar sin que cuente como fallo: throw esperar(3_600_000, 'tope_ia')
export function esperar(ms, clave) {
  return new ErrorTarea(clave, { esperarMs: ms, noEsFallo: true });
}
