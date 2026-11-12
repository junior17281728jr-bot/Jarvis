// Academia 0.9.2: «Términos de uso y aviso» y el nombre legal de cada persona. Sin cambio de base (todo en «ajustes»).
//  - El texto va por versiones (academia.terminos.v<N>, nunca se pisa una; academia.terminos.version dice cuál está en
//    uso). Sin nada guardado, la versión 1 es el texto de abajo. Publicar uno nuevo crea la versión siguiente y todos
//    tienen que aceptarlo otra vez.
//  - Antes de aceptar, la persona escribe su Nombre y Apellido de verdad (cuenta.nombre_legal.<id>). Si el administrador
//    ya lo puso, se le muestra para confirmar. Una vez que la persona lo confirmó, solo el administrador lo cambia.
//  - Cada aceptación queda como una firma (cuenta.terminos.<id>: versión, nombre tal como firmó, fecha y hora) y en la
//    auditoría («terminos_aceptados»).
// El texto no nombra ninguna escuela, autoridad, editorial ni empresa (pedido de Junior).
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from './usuarios.js';

export const TERMINOS_V1 = Object.freeze([
  { titulo: '1. Fin educativo', texto: 'Esta academia es una herramienta de estudio privada, hecha para fines de estudio por y para estudiantes. No es un producto comercial y no se vende el contenido.' },
  { titulo: '2. No es material oficial', texto: 'No pertenece ni está aprobada por ninguna escuela, autoridad de aviación ni editorial. No reemplaza tus clases, a tu instructor, los libros originales, el manual del avión ni las regulaciones vigentes. Siempre estudia el material oficial.' },
  { titulo: '3. Exactitud', texto: 'El contenido se tomó de los libros con cuidado, pero puede tener errores: ante cualquier duda manda el libro original y tu instructor. Las explicaciones de la inteligencia artificial pueden equivocarse. Nada aquí es instrucción de vuelo ni sirve para operar una aeronave.' },
  { titulo: '4. Pagos', texto: 'La academia ya funciona completa y gratis con su propio instructor (el sistema que sigue tu estudio, te refuerza y te prepara). Lo que se paga es opcional: tiempo con un instructor de inteligencia artificial más personalizado, que se adapta a tus problemas y a tu forma de aprender. No se paga por las preguntas ni por el contenido de los libros. Lo que se paga ayuda a mantener el sistema funcionando para ti y para futuros estudiantes.' },
  { titulo: '5. Contenido de terceros', texto: 'Los libros y materiales de estudio pertenecen a sus autores. Son solo para tu estudio personal: está prohibido copiar, descargar en masa o compartir el contenido fuera de la academia.' },
  { titulo: '6. Privacidad', texto: 'Guardamos tu usuario, tu progreso y tus respuestas para seguir tu estudio; solo tú y el administrador los ven. Los comprobantes de pago solo los ve el administrador. A la inteligencia artificial no se envía tu nombre.' },
  { titulo: '7. Responsabilidad', texto: 'Usas la academia bajo tu propia responsabilidad. El creador no se hace responsable por resultados de exámenes ni por decisiones de vuelo.' },
  { titulo: '8. Reglas', texto: 'El administrador puede bloquear las cuentas que no cumplan estas reglas.' },
]);

const leer = (db, clave) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
const escribir = (db, clave, valor) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, valor, new Date().toISOString());
const json = texto => { try { return JSON.parse(texto ?? 'null'); } catch { return null; } };
const ahora = () => new Date().toISOString();

export function versionTerminos(db) {
  const v = Number(leer(db, 'academia.terminos.version'));
  return Number.isSafeInteger(v) && v >= 1 ? v : 1;
}
export function terminosVersion(db, version) {
  const t = json(leer(db, `academia.terminos.v${Number(version)}`));
  if (t && Array.isArray(t.secciones)) return { version: Number(version), secciones: t.secciones, publicadoEn: t.publicadoEn ?? null };
  return Number(version) === 1 ? { version: 1, secciones: TERMINOS_V1.map(s => ({ ...s })), publicadoEn: null } : null;
}
export const terminosActuales = db => terminosVersion(db, versionTerminos(db));

// El administrador publica un texto nuevo: [{ titulo, texto }] (1 a 30 partes). Crea la versión siguiente.
export function publicarTerminos(db, secciones, { hechoPor }) {
  if (!Array.isArray(secciones) || !secciones.length || secciones.length > 30) throw new ErrorHttp(400, 'terminos_no_validos');
  const limpias = secciones.map(s => {
    if (!s || typeof s.titulo !== 'string' || typeof s.texto !== 'string') throw new ErrorHttp(400, 'terminos_no_validos');
    const titulo = s.titulo.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
    const texto = s.texto.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 4000);
    if (!titulo || !texto) throw new ErrorHttp(400, 'terminos_no_validos');
    return { titulo, texto };
  });
  return enTransaccion(db, () => {
    const version = versionTerminos(db) + 1;
    escribir(db, `academia.terminos.v${version}`, JSON.stringify({ secciones: limpias, publicadoEn: ahora(), por: hechoPor }));
    escribir(db, 'academia.terminos.version', String(version));
    auditar(db, { usuarioId: hechoPor, accion: 'terminos_publicados', detalle: `v${version}` });
    return terminosActuales(db);
  });
}

// ---------- El nombre legal ----------
const PARTE = /^[\p{L}](?:[\p{L}\p{M}' -]*[\p{L}\p{M}])?$/u;
function parteDe(valor) {
  if (typeof valor !== 'string') throw new ErrorHttp(400, 'nombre_legal_no_valido');
  const limpio = valor.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (limpio.length < 2 || limpio.length > 60 || !PARTE.test(limpio)) throw new ErrorHttp(400, 'nombre_legal_no_valido');
  return limpio;
}
export function nombreLegalDe(db, usuarioId) {
  const n = json(leer(db, `cuenta.nombre_legal.${Number(usuarioId)}`));
  return n && typeof n.nombre === 'string' && typeof n.apellido === 'string'
    ? { nombre: n.nombre, apellido: n.apellido, completo: `${n.nombre} ${n.apellido}`, confirmado: n.confirmado === true, en: n.en ?? null } : null;
}
export function nombresLegales(db) {
  const m = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'cuenta.nombre_legal.%'").all()) {
    const n = json(f.valor);
    if (n && typeof n.nombre === 'string' && typeof n.apellido === 'string') m.set(Number(f.clave.slice('cuenta.nombre_legal.'.length)), `${n.nombre} ${n.apellido}`);
  }
  return m;
}
// por: 'admin' (lo puso o lo corrigió el administrador) | 'persona' (lo confirmó al aceptar los términos).
export function ponerNombreLegal(db, usuarioId, { nombre, apellido }, { por, hechoPor = null }) {
  const n = parteDe(nombre);
  const a = parteDe(apellido);
  const id = Number(usuarioId);
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
  const antes = nombreLegalDe(db, id);
  escribir(db, `cuenta.nombre_legal.${id}`, JSON.stringify({ nombre: n, apellido: a, confirmado: por === 'persona' || (antes?.confirmado === true), por, en: ahora() }));
  if (por === 'admin') auditar(db, { usuarioId: hechoPor, accion: 'nombre_legal_puesto', detalle: `${id}: ${n} ${a}` });
  return nombreLegalDe(db, id);
}

// ---------- Aceptar ----------
export function firmasDe(db, usuarioId) {
  const l = json(leer(db, `cuenta.terminos.${Number(usuarioId)}`));
  return Array.isArray(l) ? l.filter(f => f && Number.isSafeInteger(f.version) && typeof f.en === 'string') : [];
}
export function estadoTerminos(db, usuarioId) {
  const version = versionTerminos(db);
  const firmas = firmasDe(db, usuarioId);
  const ultima = firmas.at(-1) ?? null;
  return { version, pendiente: !firmas.some(f => f.version === version), ultima, nombreLegal: nombreLegalDe(db, usuarioId) };
}
export function aceptarTerminos(db, usuarioId, { version, nombre, apellido, acepto }) {
  if (acepto !== true) throw new ErrorHttp(400, 'terminos_sin_aceptar');
  const id = Number(usuarioId);
  return enTransaccion(db, () => {
    const actual = versionTerminos(db);
    if (version !== actual) throw new ErrorHttp(409, 'terminos_cambiaron');
    const antes = nombreLegalDe(db, id);
    let legal;
    if (antes?.confirmado) {
      // Ya lo confirmó una vez: firma con ese (solo el administrador lo cambia).
      if (parteDe(nombre) !== antes.nombre || parteDe(apellido) !== antes.apellido) throw new ErrorHttp(409, 'nombre_legal_fijo');
      legal = antes;
    } else {
      legal = ponerNombreLegal(db, id, { nombre, apellido }, { por: 'persona' });
    }
    const firmas = firmasDe(db, id);
    if (!firmas.some(f => f.version === actual)) {
      firmas.push({ version: actual, firmado: legal.completo, en: ahora() });
      escribir(db, `cuenta.terminos.${id}`, JSON.stringify(firmas.slice(-50)));
      auditar(db, { usuarioId: id, accion: 'terminos_aceptados', detalle: `v${actual}: ${legal.completo}` });
    }
    return estadoTerminos(db, id);
  });
}
