// 0.12.4: las «visitas» de cada cuenta (para la ficha del alumno: «Última entrada», «Última salida», «En línea»). Casi
// nadie toca «Salir» y «entrada» solo contaba las contraseñas, así que las dos cosas engañaban. Una visita:
//  - EMPIEZA al entrar con su contraseña, o cuando la app se usa después de 15 minutos (o más) sin actividad;
//  - TERMINA en su última actividad antes de 15 minutos sin nada («sin actividad 15 min»), al cerrar o esconder la app
//    (un aviso corto de la pantalla, «cerró la app») o al tocar «Salir». Si vuelve antes de 15 minutos, sigue la MISMA
//    visita (cerrar la app un momento no es salir).
// Sin cambio de base: un ajuste por cuenta (`cuenta.visitas.<id>`), que se escribe como mucho una vez por minuto (y al
// empezar o terminar una visita). Nunca se borra nada de las sesiones ni de la auditoría.
export const HUECO_MS = 15 * 60 * 1000;
// 0.14.9 (pedido del dueño): «en línea» = actividad en los últimos 45 s. Mientras la app está a la vista, la pantalla
// manda un latido cada 15 s (POST /api/yo/visita/latido; public/presencia.js); al cerrarla de golpe, a los 45 s ya sale
// «desconectado». Por eso la visita se anota hasta cada 10 s (antes, 1 min): cada latido la mueve.
export const EN_LINEA_MS = 45 * 1000;
export const LATIDO_MS = 15 * 1000;
const CADA_MS = 10 * 1000;
export const COMO = Object.freeze(['cerro', 'inactiva', 'salir']);

const clave = id => `cuenta.visitas.${Number(id)}`;
const iso = ms => new Date(ms).toISOString();

export function leerVisitas(db, usuarioId) {
  try {
    const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave(usuarioId))?.valor ?? 'null');
    if (!v || typeof v !== 'object' || !v.actual || typeof v.actual.inicio !== 'string') return null;
    return v;
  } catch { return null; }
}
function guardar(db, usuarioId, v, ahoraMs) {
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave(usuarioId), JSON.stringify(v), iso(ahoraMs));
}
// Cómo terminó una visita que ya pasó: lo que quedó anotado o, si no, «sin actividad».
const cerrada = a => ({ inicio: a.inicio, fin: a.fin ?? a.ultimo, como: COMO.includes(a.como) ? a.como : 'inactiva' });

// Cada pedido de una cuenta que entró (src/app.js). entrada: true = acaba de entrar con su contraseña.
export function anotarActividad(db, usuarioId, ahoraMs = Date.now(), { entrada = false } = {}) {
  const v = leerVisitas(db, usuarioId);
  const a = v?.actual;
  const ultimo = a ? Date.parse(a.ultimo ?? a.inicio) : NaN;
  if (!a || entrada || !(ahoraMs - ultimo < HUECO_MS)) {
    guardar(db, usuarioId, { actual: { inicio: iso(ahoraMs), ultimo: iso(ahoraMs) }, anterior: a ? cerrada(a) : null, visitas: (v?.visitas ?? 0) + 1 }, ahoraMs);
    return 'nueva';
  }
  // Volvió antes de 15 minutos (aunque hubiera cerrado la app): la misma visita sigue.
  if (a.fin || ahoraMs - ultimo >= CADA_MS) {
    guardar(db, usuarioId, { ...v, actual: { inicio: a.inicio, ultimo: iso(ahoraMs) } }, ahoraMs);
    return 'sigue';
  }
  return null;
}
// Cerró o escondió la app (pagehide / visibilitychange) o tocó «Salir». Una vez cada 30 s como mucho.
export function anotarFin(db, usuarioId, como, ahoraMs = Date.now()) {
  if (!COMO.includes(como)) return false;
  const v = leerVisitas(db, usuarioId);
  if (!v) return false;
  const a = v.actual;
  if (a.fin && como !== 'salir' && ahoraMs - Date.parse(a.fin) < 30_000) return false;
  guardar(db, usuarioId, { ...v, actual: { ...a, ultimo: iso(ahoraMs), fin: iso(ahoraMs), como } }, ahoraMs);
  return true;
}

// Lo que se ve en la ficha: { entrada, salida, salidaComo, ultima, enLinea, visitas } (null si nunca se anotó una visita).
export function resumenVisitas(db, usuarioId, ahoraMs = Date.now()) {
  return resumenDeVisitas(leerVisitas(db, usuarioId), ahoraMs);
}
// 0.14.9: las visitas de TODAS las cuentas en una consulta (lo que «Cómo van todos» pide cada 5 s): Map id → resumen.
export function resumenesVisitas(db, ahoraMs = Date.now()) {
  const m = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'cuenta.visitas.%'").all()) {
    const id = Number(f.clave.slice('cuenta.visitas.'.length));
    if (!Number.isSafeInteger(id)) continue;
    let v = null;
    try { v = JSON.parse(f.valor); } catch { v = null; }
    if (!v || typeof v !== 'object' || !v.actual || typeof v.actual.inicio !== 'string') continue;
    m.set(id, resumenDeVisitas(v, ahoraMs));
  }
  return m;
}
function resumenDeVisitas(v, ahoraMs) {
  if (!v) return null;
  const a = v.actual;
  const ultima = a.ultimo ?? a.inicio;
  const enLinea = !a.fin && ahoraMs - Date.parse(ultima) <= EN_LINEA_MS;
  // En línea: la salida es la de la visita anterior. Si no, la de esta (cerró la app, tocó Salir o dejó de usarla).
  const salida = enLinea ? v.anterior : cerrada(a);
  return { entrada: a.inicio, salida: salida?.fin ?? null, salidaComo: salida?.como ?? null, ultima, enLinea, visitas: Number(v.visitas) || 1 };
}

// POST /api/yo/visita/fin { como: 'cerro' }: la pantalla avisa que se cerró o se escondió (pagehide / visibilitychange).
// Barato: una escritura, como mucho una vez cada 30 s por cuenta (anotarFin) y 30 avisos cada 10 minutos.
// 0.14.9: POST /api/yo/visita/latido: «sigo aquí» (cada 15 s con la app a la vista). No hace nada más que contar como
// actividad (src/app.js → anotarActividad: una escritura cada 10 s como mucho). 80 cada 10 minutos por cuenta.
// 0.12.7: finDeSesion (src/app.js): al cerrar la app, el instructor mira si hace falta preparar su próxima clase (barato:
// primero lo que no cuesta nada; solo si estudió de verdad y no se preparó hoy).
export function registrarRutasVisitas(rutas, { Limitador, finDeSesion = () => {} }) {
  const tope = new Limitador({ maximo: 30, ventanaMs: 10 * 60 * 1000 });
  const topeLatido = new Limitador({ maximo: 80, ventanaMs: 10 * 60 * 1000 });
  rutas.agregar('POST', '/api/yo/visita/latido', ({ usuario }) => {
    if (!topeLatido.permitir(String(usuario.id))) return { codigo: 429, datos: { error: 'demasiados_intentos' } };
    return { codigo: 200, datos: { ok: true } };
  }, { permitirConClaveTemporal: true });
  rutas.agregar('POST', '/api/yo/visita/fin', ({ db, usuario }) => {
    if (tope.permitir(String(usuario.id))) {
      anotarFin(db, usuario.id, 'cerro');
      finDeSesion(db, usuario, 'salio');
    }
    return { codigo: 200, datos: { ok: true } };
  }, { permitirConClaveTemporal: true, noEsActividad: true });
}
