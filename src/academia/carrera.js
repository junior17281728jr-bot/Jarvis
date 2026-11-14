// Academia 0.14.14 (pedido del dueño: «Progreso» corto y visual, «como una carrera»): «La carrera» que ve cada alumno
// arriba de su Progreso: cada compañero es un avioncito en dos pistas (Test Guide y oral) en su % de TODOS los temas
// (src/academia/avance-alumno.js, el mismo número que ve el administrador en «Cómo van todos»).
// Privacidad (test/carrera.test.js lo cuida):
//  - De los demás solo viaja: un alias (el primer nombre, o «Piloto N»), su % del Test Guide y del oral y dónde va
//    («M3 · T2»: lo mismo que ya muestra el Grupo). Nunca el id, el usuario (que puede ser un correo), el apellido entero,
//    notas, intentos ni tiempos. Lo suyo (racha, tiempo, notas) solo le llega a él mismo, en «yo».
//  - «Mostrar nombres en la carrera» (ajustes: academia.carrera_nombres, encendido salvo '0'): apagado, los demás son
//    «Piloto 1, 2…» (por orden de cuenta, no por puesto). Quien puso «Perfil privado» (el mismo de Grupo) sale siempre
//    como «Piloto N».
//  - Corren solo los alumnos: ni administradores, ni cuentas eliminadas (papelera), ni bloqueadas.
// Una sola pasada: avanceDe (pocas consultas para todos) + 2 lecturas de «ajustes». Sin memoria (no-store): 1 CPU.
import { ErrorHttp } from '../nucleo/http.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { avanceDe } from './avance-alumno.js';
import { puntosYRacha } from './progreso.js';
import { tiempoDeEstudio } from './fichas.js';

const CLAVE_NOMBRES = 'academia.carrera_nombres';
const SEMANA_MS = 7 * 24 * 3600 * 1000;
const LARGO_ALIAS = 14;

export const nombresEnCarrera = db => leerAjuste(db, CLAVE_NOMBRES) !== '0';
export function mostrarNombresEnCarrera(db, encendido) {
  if (typeof encendido !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, CLAVE_NOMBRES, encendido ? '1' : '0');
  return encendido;
}

// Quién corre: los alumnos activos (sin administradores, eliminados ni bloqueados), por orden de cuenta.
export function corredores(db) {
  return db.prepare("SELECT id, nombre, nombre_visible FROM usuarios WHERE rol <> 'admin' AND eliminado_en IS NULL AND activo = 1 ORDER BY id").all();
}

const json = t => { try { return JSON.parse(t); } catch { return null; } };
const palabras = s => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().split(/\s+/).filter(Boolean);
const corto = s => (s.length > LARGO_ALIAS ? `${s.slice(0, LARGO_ALIAS - 1)}…` : s);

// El primer nombre de cada uno: el legal (lo confirmó al firmar), si no el nombre en la app; nunca algo con «@».
// → Map id → { nombre, inicial } (inicial: la del apellido, para desempatar dos «Ana»).
function primerosNombres(db, cuentas) {
  const legales = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'cuenta.nombre\\_legal.%' ESCAPE '\\'").all()) {
    const n = json(f.valor);
    if (n && typeof n.nombre === 'string') legales.set(Number(f.clave.slice('cuenta.nombre_legal.'.length)), n);
  }
  return new Map(cuentas.map(u => {
    const l = legales.get(u.id);
    const visible = palabras(u.nombre_visible);
    const fuente = l?.nombre ? [l.nombre, l.apellido] : visible.length ? [visible[0], visible[1]] : [String(u.nombre ?? '').split('@')[0]];
    const nombre = palabras(fuente[0])[0] ?? '';
    const inicial = palabras(fuente[1])[0]?.[0]?.toUpperCase() ?? '';
    const valido = nombre && !/[@<>]/.test(nombre);
    return [u.id, valido ? { nombre: corto(nombre), inicial: /[@<>]/.test(inicial) ? '' : inicial } : null];
  }));
}

function ocultos(db) {
  return new Set(db.prepare("SELECT clave FROM ajustes WHERE clave LIKE 'academia.grupo\\_oculto.%' ESCAPE '\\' AND valor = '1'").all()
    .map(f => Number(f.clave.slice('academia.grupo_oculto.'.length))));
}

// Los alias (únicos: también son la llave de cada avión en la pantalla). cuentas: por orden de id.
// → Map id → alias. yoId: el que pregunta (su alias es su nombre; la pantalla dice «Tú»).
export function aliasDe(cuentas, { nombres = true, primeros = new Map(), privados = new Set(), yoId = null } = {}) {
  const salida = new Map();
  let n = 0;
  const conNombre = [];
  for (const u of cuentas) {
    if (u.id === yoId) { salida.set(u.id, null); continue; }
    n++;
    const p = primeros.get(u.id);
    if (nombres && p && !privados.has(u.id)) conNombre.push([u.id, p]);
    else salida.set(u.id, `Piloto ${n}`);
  }
  const cuantos = new Map();
  for (const [, p] of conNombre) cuantos.set(p.nombre.toLowerCase(), (cuantos.get(p.nombre.toLowerCase()) ?? 0) + 1);
  const usados = new Set([...salida.values()].filter(Boolean).map(s => s.toLowerCase()));
  for (const [id, p] of conNombre) {
    let alias = cuantos.get(p.nombre.toLowerCase()) > 1 && p.inicial ? `${p.nombre} ${p.inicial}.` : p.nombre;
    for (let k = 2; usados.has(alias.toLowerCase()); k++) alias = `${p.nombre} ${k}`;
    usados.add(alias.toLowerCase());
    salida.set(id, alias);
  }
  if (yoId != null && salida.has(yoId)) {
    const p = primeros.get(yoId);
    let alias = p?.nombre ?? 'Tú';
    for (let k = 2; usados.has(alias.toLowerCase()); k++) alias = `${p?.nombre ?? 'Tú'} ${k}`;
    salida.set(yoId, alias);
  }
  return salida;
}

// «Dónde va» en corto, solo números: { m|c, t } (o null).
const dondeVa = parte => (parte?.ahora ? { n: parte.ahora.numero, t: parte.ahora.temaNumero } : null);

// Lo propio (solo para él): racha, temas hechos, la nota media de sus exámenes del Test Guide (la mejor de cada materia
// que ya dio) y el tiempo de esta semana (aprox., de sus respuestas, como «Cómo van todos»).
function misDatos(db, id, av, ahoraMs) {
  const notas = (av?.tg?.bloques ?? []).filter(b => b.examen && b.examen.mejor != null).map(b => Number(b.examen.mejor) || 0);
  const fechas = db.prepare('SELECT creada_en FROM academia_respuestas WHERE usuario_id = ? AND creada_en >= ? ORDER BY creada_en')
    .all(id, new Date(ahoraMs - SEMANA_MS).toISOString()).map(f => f.creada_en).filter(f => Date.parse(f) <= ahoraMs);
  return {
    racha: puntosYRacha(db, id, ahoraMs).racha,
    temas: { hechos: av?.tg?.hechos ?? 0, total: av?.tg?.total ?? 0 },
    notaMedia: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null,
    examenes: notas.length,
    minutosSemana: tiempoDeEstudio(fechas),
  };
}

// GET /api/academia/carrera. → { nombres, oral, pilotos: [{ alias, tg, oral, esYo, tgEn, oralEn }], yo }
// yo: { avance, datos } del que pregunta si corre (un administrador que mira no corre: yo = null).
export function carreraDe(db, paquete, yoId, ahoraMs = Date.now()) {
  const cuentas = corredores(db);
  const nombres = nombresEnCarrera(db);
  const corre = cuentas.some(u => u.id === yoId);
  const avance = avanceDe(db, paquete, cuentas.map(u => u.id));
  const alias = aliasDe(cuentas, { nombres, primeros: primerosNombres(db, cuentas), privados: ocultos(db), yoId: corre ? yoId : null });
  const hayOral = Boolean(paquete?.oral?.hay);
  const pilotos = cuentas.map(u => {
    const a = avance.get(u.id);
    return { alias: alias.get(u.id), tg: a?.tg?.pct ?? 0, oral: hayOral ? a?.oral?.pct ?? 0 : null, esYo: u.id === yoId, tgEn: dondeVa(a?.tg), oralEn: hayOral ? dondeVa(a?.oral) : null };
  });
  const mio = corre ? avance.get(yoId) : null;
  return { nombres, oral: hayOral, pilotos, yo: corre ? { avance: mio, datos: misDatos(db, yoId, mio, ahoraMs) } : null };
}
