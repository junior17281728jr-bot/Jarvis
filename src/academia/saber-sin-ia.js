// Academia 0.14.57 (pedido del dueño: «que vaya mejorando respuestas en todo sentido ya que tiene la IA, para el día que
// no esté pueda usar eso, y así mejore el motor»): lo que la IA ya escribió y es COMPARTIDO se muestra gratis cuando no
// hay IA para ese alumno (sin clave, la IA apagada, en pausa, sin saldo, el tope del mes lleno o sin tiempo con IA).
//
// Qué se reutiliza (lo compartido: no tiene nada del alumno; la clave sale del contenido del paquete):
//  - academia.ia.explica.*     «Explícamelo de otra forma» de una pregunta y una opción (y la pista de una línea).
//  - academia.ia.miniclase.*   la «Mini-clase IA» de un concepto de «Mi repaso».
//  - academia.ia.tarjeta.*     «Explícamelo mejor» de una tarjeta de la clase.
//  - academia.ia.profundiza.*  «Profundizar» de una tarjeta.
// Qué NUNCA (es de un alumno, o depende de lo que él respondió): consejo, plandia, preparado, duda, chat, vivo,
// vivocierre (llevan el id del alumno en la clave) y personal (las preguntas personalizadas: hechas a SU confusión y solo
// las puede responder quien las pidió). Las dudas no: la respuesta se arma con las preguntas del Test Guide que ESE alumno
// ya respondió (y puede citar su respuesta), y guarda lo que él escribió.
//
// Cómo se busca (sin recorrer «ajustes»): la clave es un hash de (contenido, opción, estilo, idioma, modelo). Se calculan
// las claves candidatas —estilos × idiomas × modelos conocidos, en el orden de abajo— y se lee cada una por la clave
// primaria. Son ≤ 4 × 2 × (modelos) lecturas puntuales: unos microsegundos cada una, sin memoria extra.
//  1. su estilo, su idioma, cualquier modelo;  2. otro estilo, su idioma;  3. solo si su idioma es inglés: en español
//     (el material del paquete ya está en español; a quien estudia en español nunca se le muestra uno en inglés).
// Lo guardado ya pasó el candado del Test Guide (la IA dijo la correcta del Test Guide o no se guardó: instructor-ia.js,
// revisarRespuesta) y la clave tiene la correcta y el texto de la pregunta: si cambian, no coincide. Lo «oculto» por el
// administrador tampoco sale (leerGuardado).
//
// No cuesta nada: no llama a la IA, no pone nada en la fila, no cobra minutos ni usa ningún tope. Solo suma 1 en una
// cuenta del mes (academia.ia_saber.servidas.AAAA-MM), para que el administrador vea cuántas veces sirvió.
import { leerGuardado, ESTILOS_CLAVE, TIPOS_SIN_IA } from './instructor-ia.js';
import { MODELOS_INSTRUCTOR } from '../ia/config.js';
import { resumenAprendido } from './oral-aprende.js';

const CLAVE_MODELOS = 'academia.ia_saber.modelos';
const claveMes = ahora => `academia.ia_saber.servidas.${new Date(ahora - 4 * 3600 * 1000).toISOString().slice(0, 7)}`;
const json = t => { try { return JSON.parse(t); } catch { return null; } };
const guardar = (db, clave, valor, ahora) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, valor, new Date(ahora).toISOString());

// Los modelos con los que se pudo guardar algo: el de ahora, los de la lista, el de «Explícamelo mejor» (Haiku) y los que
// se usaron antes (si un modelo sale de la lista, lo que escribió se sigue encontrando).
const recordados = new WeakMap();
export function recordarModelo(db, modelo, ahora = Date.now()) {
  if (typeof modelo !== 'string' || !modelo || modelo.length > 80) return;
  let set = recordados.get(db);
  if (!set) { set = new Set(leidos(db)); recordados.set(db, set); }
  if (set.has(modelo)) return;
  set.add(modelo);
  try { guardar(db, CLAVE_MODELOS, JSON.stringify([...set].slice(-20)), ahora); } catch { /* solo una lista */ }
}
function leidos(db) {
  const v = json(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_MODELOS)?.valor ?? 'null');
  return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
}
export function modelosConocidos(db, actual = null) {
  return [...new Set([actual, ...MODELOS_INSTRUCTOR, 'claude-haiku-5-5', ...leidos(db)].filter(x => typeof x === 'string' && x))];
}

// Las variantes, en orden. conEstilo = false: la clave no lleva estilo (Profundizar).
export function candidatos({ estilo = 'claro', idioma = 'es', modelos = [], conEstilo = true }) {
  const suyo = idioma === 'en' ? 'en' : 'es';
  const idiomas = suyo === 'en' ? ['en', 'es'] : ['es'];
  const estilos = conEstilo ? [...new Set([ESTILOS_CLAVE.includes(estilo) ? estilo : 'claro', 'claro', ...ESTILOS_CLAVE])] : ['claro'];
  const out = [];
  for (const i of idiomas) for (const e of estilos) for (const m of modelos) out.push({ estilo: e, idioma: i, modelo: m });
  return out;
}

// armar: (variante) → clave (de armadorClave). → { clave, guardado, idioma, estilo, modelo, lecturas } o null.
export function buscarGuardada(db, armar, { estilo, idioma, modelo = null, conEstilo = true } = {}) {
  let lecturas = 0;
  const vistas = new Set();
  for (const v of candidatos({ estilo, idioma, modelos: modelosConocidos(db, modelo), conEstilo })) {
    const clave = armar(v);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    lecturas++;
    if (!TIPOS_SIN_IA.some(t => clave.startsWith(`academia.ia.${t}.`))) return null; // nunca algo de un alumno
    const guardado = leerGuardado(db, clave);
    if (guardado) return { clave, guardado, idioma: v.idioma, estilo: v.estilo, modelo: v.modelo, lecturas };
  }
  return null;
}

// Lo que ve el alumno: lo guardado tal cual, marcado «guardada» (la pantalla dice «Explicación guardada del instructor»).
// Sin el costo ni el proveedor (no son de él).
export function paraVer(hallada, idiomaAlumno = 'es') {
  const { costoMicro, proveedor, modelo, ...resto } = hallada.guardado;
  // 0.14.77: con su clave (lo compartido), para «¿Lo entendiste? 👍 / 👎».
  return { estado: 'lista', ...resto, guardada: true, clave: hallada.clave, ...(hallada.idioma !== (idiomaAlumno === 'en' ? 'en' : 'es') ? { idioma: hallada.idioma } : {}) };
}

// +1 en la cuenta del mes (por tipo). Nunca falla lo que se muestra por esto.
export function anotarServida(db, tipo, ahora = Date.now()) {
  if (!TIPOS_SIN_IA.includes(tipo)) return;
  try {
    const clave = claveMes(ahora);
    const v = json(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? 'null');
    const cuenta = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    cuenta[tipo] = (Number(cuenta[tipo]) || 0) + 1;
    guardar(db, clave, JSON.stringify(cuenta), ahora);
  } catch { /* solo una cuenta */ }
}

// Para el administrador: cuánto sabe el sistema sin IA y cuántas veces lo usó este mes. Cuenta por rango de la clave
// primaria (nunca lee los valores).
const contar = (db, tipo) => db.prepare('SELECT COUNT(*) AS n FROM ajustes WHERE clave >= ? AND clave < ?').get(`academia.ia.${tipo}.`, `academia.ia.${tipo}/`).n;
export function resumenSaber(db, ahora = Date.now()) {
  const mes = json(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(claveMes(ahora))?.valor ?? 'null') ?? {};
  const servidasMes = TIPOS_SIN_IA.reduce((s, t) => s + (Number(mes?.[t]) || 0), 0);
  return {
    explicaciones: contar(db, 'explica'), tarjetas: contar(db, 'tarjeta') + contar(db, 'profundiza'), miniclases: contar(db, 'miniclase'),
    oral: resumenAprendido(db).respuestas, servidasMes,
  };
}
