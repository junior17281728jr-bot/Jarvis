// Academia 0.14.72: TODOS los certificados ya hechos, para el administrador (#certificados/todos). Pedido del dueño: «una
// vez que se vea el certificado ya no debe buscarlo por código porque se queda guardado; y solo el admin puede ver los
// certificados ya hechos».
//  - Primero emite los que faltan: quien terminó un curso (o una ronda de la Competencia) pero nunca abrió «Mis
//    certificados» todavía no tenía el suyo. Se usa lo mismo de siempre (certificadosDe y certificadoRonda), que lo hace
//    UNA vez: si ya está guardado, no cambia nada.
//  - Barato: solo se llama a certificadosDe para quien le falta uno y YA lo terminó (todas las materias con su examen
//    aprobado, o el final del oral aprobado); a los demás no se les calcula el camino. Las rondas: las terminadas sin el suyo.
//  - Quiénes: los alumnos activos (corredores: un administrador que también estudia cuenta; uno que solo administra, no).
//  - Después lee TODOS los guardados (academia.certificado.<curso>.<id>) de una vez: también los de alguien que ya no está
//    activo (el certificado se dio y no se borra nada).
import { leerAjuste } from './paquetes.js';
import { corredores } from './carrera.js';
import { nombresLegales } from '../cuentas/terminos.js';
import { FORMATO_CODIGO, VARIANTES, certificadosDe, nombreCon } from './certificados.js';
import { RONDAS, certificadoRonda } from './competencia.js';

const json = t => { try { return JSON.parse(t ?? 'null'); } catch { return null; } };
const CLAVE = /^academia\.certificado\.(tg|oral|compe[1-6])\.(\d+)$/;

// ¿Terminó el oral? (lo mismo que mira estadoOral: el final aprobado y que haya oral en el contenido).
const oralTerminado = (db, id, hayOral) => hayOral && json(leerAjuste(db, `academia.oral.${id}`))?.examenes?.final?.aprobado === true;

function emitirFaltantes(db, paquete, opciones) {
  const ids = corredores(db).map(u => u.id);
  if (!ids.length) return;
  const guardados = new Set(db.prepare("SELECT clave FROM ajustes WHERE clave LIKE 'academia.certificado.%'").all().map(f => f.clave));
  // El Test Guide: solo a quien tiene aprobado el examen de TODAS las materias con clases (lo mismo que tgTerminado).
  const conClases = (paquete?.materias ?? []).filter(m => m.temas?.length).map(m => m.id);
  const aprobadas = new Map();
  for (const f of db.prepare("SELECT DISTINCT usuario_id AS id, materia FROM academia_intentos WHERE tipo = 'examen' AND aprobado = 1 AND terminado_en IS NOT NULL").all()) {
    if (!aprobadas.has(f.id)) aprobadas.set(f.id, new Set());
    aprobadas.get(f.id).add(f.materia);
  }
  const tgListo = id => conClases.length > 0 && conClases.every(m => aprobadas.get(id)?.has(m));
  const hayOral = Boolean(paquete?.oral?.materias?.some(m => m.temas?.length));
  const enLista = new Set(ids);
  for (const id of ids) {
    const faltaTg = !guardados.has(`academia.certificado.tg.${id}`);
    const faltaOral = !guardados.has(`academia.certificado.oral.${id}`);
    if ((faltaTg && tgListo(id)) || (faltaOral && oralTerminado(db, id, hayOral))) certificadosDe(db, id, paquete, opciones);
  }
  const rondas = db.prepare('SELECT DISTINCT usuario_id AS id, ronda FROM academia_compe_intentos WHERE terminado_en IS NOT NULL').all();
  for (const f of rondas) {
    if (enLista.has(f.id) && RONDAS.includes(f.ronda) && !guardados.has(`academia.certificado.compe${f.ronda}.${f.id}`)) certificadoRonda(db, f.id, f.ronda, opciones);
  }
}

// → { certificados: [{ usuarioId, nombre, curso: 'tg'|'oral'|'compe', ronda?, fecha, codigo, variante, href }], cuantos: { tg, oral, compe } }
// (los más nuevos primero; a la misma fecha, por código).
export function todosLosCertificados(db, paquete, opciones = {}) {
  emitirFaltantes(db, paquete, opciones);
  const legales = nombresLegales(db);
  const usuarios = new Map(db.prepare('SELECT id, nombre, nombre_visible FROM usuarios').all().map(u => [u.id, u]));
  const certificados = [];
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'academia.certificado.%'").all()) {
    const m = CLAVE.exec(f.clave);
    const v = m ? json(f.valor) : null;
    if (!v || typeof v.codigo !== 'string' || !FORMATO_CODIGO.test(v.codigo)) continue;
    const id = Number(m[2]);
    const u = usuarios.get(id);
    const compe = m[1].startsWith('compe');
    if (compe ? v.ronda !== Number(m[1].slice(5)) : !VARIANTES.includes(v.variante)) continue;
    certificados.push({
      usuarioId: id, nombre: u ? nombreCon(u, legales) : `#${id}`, curso: compe ? 'compe' : m[1], ...(compe ? { ronda: v.ronda } : {}),
      fecha: typeof v.fecha === 'string' ? v.fecha : null, codigo: v.codigo, variante: v.variante ?? null, href: `#certificados/alumno/${id}`,
    });
  }
  const antes = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  certificados.sort((a, b) => antes(String(b.fecha ?? ''), String(a.fecha ?? '')) || antes(a.codigo, b.codigo));
  const cuantos = { tg: 0, oral: 0, compe: 0 };
  for (const c of certificados) cuantos[c.curso] += 1;
  return { certificados, cuantos };
}
