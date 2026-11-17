// Academia 0.14.26: los CERTIFICADOS de recuerdo (pedido del dueño). No son oficiales: son un recuerdo divertido de
// haber terminado un curso de la app. Hay dos cursos:
//  - 'tg' (Test Guide): terminado con la misma idea que ya usa la app para el oral («siguiente paso»): todas las materias
//    con clases tienen su examen aprobado (tgTerminado).
//  - 'oral' (Preparación para el examen oral): el examen final del oral aprobado.
// SIN cambio de base: todo va en «ajustes» (y por eso entra en las copias de cada noche):
//  - (el nombre: el de su perfil si lo personalizó; si no, su nombre legal; si tampoco, su usuario)
//  - academia.certificado.<curso>.<alumno>: { codigo, curso, usuarioId, fecha, variante, emitido } — se emite UNA vez
//    (la primera vez que se mira estando terminado) y nunca cambia: si después llega una materia nueva, el certificado
//    sigue ahí, con el mismo código y el mismo texto.
//  - academia.certificado_codigo.<CÓDIGO>: { usuarioId, curso } — para verificar un código.
// El NOMBRE no se guarda: siempre sale el de ahora (el nombre para mostrar de su perfil; si está vacío, su nombre legal;
// si tampoco, su usuario). Así, si lo cambia en su perfil, el certificado ya sale con el nombre nuevo.
// El texto (7 variantes) se elige con elegirVariante, una función pura de números (test/certificados.test.js).
import { randomBytes } from 'node:crypto';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { camino } from './progreso.js';
import { convalidadasDe } from './saltos.js';
import { nombresLegales } from '../cuentas/terminos.js';

export const CURSOS = Object.freeze(['tg', 'oral']);
// Las 7 variantes del texto (el número es el que pidió el dueño).
export const VARIANTES = Object.freeze(['tesonero', 'estrella', 'disciplinado', 'rapido', 'constante', 'convalidado', 'normal']);
// Las reglas, en este orden (la primera que se cumple gana). Ver elegirVariante.
export const REGLAS = Object.freeze({
  convalidadoParte: 0.5, // la mitad (o más) de las materias: fue directo al examen y lo pasó
  tesoneroFallos: 4, // 4 o más exámenes o prácticas reprobadas…
  tesoneroPct: 65, tesoneroMinRespuestas: 40, // …o menos del 65 % de aciertos con 40 respuestas o más
  estrellaPct: 88, estrellaMinRespuestas: 20, // sin reprobar nada y 88 % o más
  rapidoDias: 14, // terminó en 14 días o menos
  disciplinadoRepasos: 12, // 12 repasos o más (repaso, mis errores, repaso final, reto, instructor)
  constanteDias: 60, constanteNocturnas: 30, constanteMinRespuestas: 40, // 60 días o más, o 30 % de respuestas de noche
});
const PREFIJO = 'AA';
const DE_CURSO = { tg: 'TG', oral: 'OR' };
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const FORMATO_CODIGO = /^AA-(TG|OR)-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
const claveCert = (curso, id) => `academia.certificado.${curso}.${Number(id)}`;
const claveCodigo = codigo => `academia.certificado_codigo.${codigo}`;
const json = t => { try { return JSON.parse(t ?? 'null'); } catch { return null; } };

// ¿Terminó los exámenes del Test Guide? (todas las materias con clases, con su examen aprobado). La misma idea que el
// oral usa para su «siguiente paso» (src/api/academia.js).
export const tgTerminado = c => { const con = (c?.materias ?? []).filter(m => m.temas?.length); return con.length > 0 && con.every(m => m.examen?.aprobado === true); };

// perfil: números simples → el id de la variante. Sin azar y sin fechas: siempre da lo mismo para lo mismo.
export function elegirVariante(p = {}) {
  const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const respuestas = n(p.respuestas);
  const pctBien = respuestas > 0 ? (n(p.bien) * 100) / respuestas : 100;
  const fallos = n(p.examenesReprobados) + n(p.temasReprobados);
  const R = REGLAS;
  if (n(p.materias) > 0 && n(p.convalidadas) >= n(p.materias) * R.convalidadoParte) return 'convalidado';
  if (fallos >= R.tesoneroFallos || (respuestas >= R.tesoneroMinRespuestas && pctBien < R.tesoneroPct)) return 'tesonero';
  if (fallos === 0 && respuestas >= R.estrellaMinRespuestas && pctBien >= R.estrellaPct) return 'estrella';
  if (p.dias != null && n(p.dias) <= R.rapidoDias) return 'rapido';
  if (n(p.repasos) >= R.disciplinadoRepasos) return 'disciplinado';
  if ((p.dias != null && n(p.dias) >= R.constanteDias) || (respuestas >= R.constanteMinRespuestas && (n(p.nocturnas) * 100) / respuestas >= R.constanteNocturnas)) return 'constante';
  return 'normal';
}

const dias = (desde, hasta) => (desde && hasta ? Math.max(0, Math.floor((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)) : null);
// «De noche» = de 10 p. m. a 5 a. m., hora de República Dominicana (UTC−4).
const NOCHE = "CAST(strftime('%H', creada_en, '-4 hours') AS INTEGER) NOT BETWEEN 5 AND 21";

// ---------- El Test Guide ----------
function estadoTg(db, usuarioId, paquete, ahoraMs) {
  const c = paquete ? camino(db, usuarioId, paquete, ahoraMs) : null;
  const con = (c?.materias ?? []).filter(m => m.temas?.length);
  const aprobadas = con.filter(m => m.examen?.aprobado === true).length;
  const completo = tgTerminado(c);
  let fecha = null;
  if (completo) {
    const ids = new Set(con.map(m => m.id));
    for (const f of db.prepare("SELECT materia, MIN(terminado_en) AS en FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND aprobado = 1 AND terminado_en IS NOT NULL GROUP BY materia").all(usuarioId)) {
      if (ids.has(f.materia) && (!fecha || f.en > fecha)) fecha = f.en;
    }
  }
  return { completo, fecha, avance: { hechos: aprobadas, total: con.length }, materias: con.map(m => m.id) };
}
export function perfilTg(db, usuarioId, materias, fecha) {
  const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien, COALESCE(SUM(CASE WHEN ${NOCHE} THEN 1 ELSE 0 END), 0) AS noche, MIN(creada_en) AS primera FROM academia_respuestas WHERE usuario_id = ?`).get(usuarioId);
  const i = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN tipo = 'examen' AND aprobado = 0 THEN 1 ELSE 0 END), 0) AS examenes,
      COALESCE(SUM(CASE WHEN tipo = 'tema' AND aprobado = 0 THEN 1 ELSE 0 END), 0) AS temas,
      COALESCE(SUM(CASE WHEN tipo IN ('repaso', 'errores', 'final', 'reto', 'instructor') THEN 1 ELSE 0 END), 0) AS repasos,
      MIN(empezado_en) AS primero
    FROM academia_intentos WHERE usuario_id = ? AND terminado_en IS NOT NULL`).get(usuarioId);
  // 0.14.19: las materias «Convalidadas por examen» (aprobó el examen directo, sin hacer los temas).
  const convalidadas = convalidadasDe(db, usuarioId);
  const primera = [r.primera, i.primero].filter(Boolean).sort()[0] ?? null;
  return {
    respuestas: r.n, bien: r.bien, nocturnas: r.noche, examenesReprobados: i.examenes, temasReprobados: i.temas, repasos: i.repasos,
    materias: materias.length, convalidadas: materias.filter(m => convalidadas[m]).length, dias: dias(primera, fecha),
  };
}

// ---------- El oral ----------
function examenesOral(db, usuarioId) {
  const v = json(leerAjuste(db, `academia.oral.${Number(usuarioId)}`));
  return v && typeof v.examenes === 'object' && v.examenes ? v.examenes : {};
}
function estadoOral(db, usuarioId, paquete) {
  const hay = Boolean(paquete?.oral?.materias?.some(m => m.temas?.length));
  const final = examenesOral(db, usuarioId).final ?? null;
  const completo = hay && final?.aprobado === true;
  return { hay, completo, fecha: completo ? (typeof final.en === 'string' ? final.en : null) : null, avance: { hechos: completo ? 1 : 0, total: 1 } };
}
export function perfilOral(db, usuarioId, fecha) {
  const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien, COALESCE(SUM(CASE WHEN ${NOCHE} THEN 1 ELSE 0 END), 0) AS noche,
      COALESCE(SUM(CASE WHEN nivel = 'oral_practica' THEN 1 ELSE 0 END), 0) AS practica, MIN(creada_en) AS primera
    FROM academia_extra_respuestas WHERE usuario_id = ? AND materia LIKE 'oral\\_%' ESCAPE '\\'`).get(usuarioId);
  const ex = examenesOral(db, usuarioId);
  let reprobados = 0;
  for (const e of Object.values(ex)) if (e && typeof e === 'object') reprobados += Math.max(0, (Number(e.veces) || 0) - (e.aprobado === true ? 1 : 0));
  const final = ex.final ?? {};
  // «Ya lo sabías todo»: pasó el final a la primera, casi sin practicar; o la mitad (o más) de los capítulos quedaron
  // convalidados por su examen (examenes.<capítulo>.convalidada, de la 0.14.19).
  const capitulos = Object.entries(ex).filter(([k, e]) => k !== 'final' && e && typeof e === 'object');
  const porExamen = capitulos.filter(([, e]) => e.convalidada && typeof e.convalidada === 'object').length;
  const directo = final.aprobado === true && Number(final.veces) === 1 && r.practica < 20;
  return {
    respuestas: r.n, bien: r.bien, nocturnas: r.noche, examenesReprobados: reprobados, temasReprobados: 0,
    // En el oral, cada 10 preguntas de práctica cuentan como un repaso.
    repasos: Math.floor(r.practica / 10), materias: Math.max(1, capitulos.length), convalidadas: directo ? Math.max(1, capitulos.length) : porExamen, dias: dias(r.primera, fecha),
  };
}

// ---------- Nombre, código y emisión ----------
export function nombreDe(db, usuarioId) {
  const u = db.prepare('SELECT nombre, nombre_visible FROM usuarios WHERE id = ?').get(Number(usuarioId));
  if (!u) return null;
  // Si nunca lo personalizó, nombre_visible es igual a su usuario (crearUsuario lo copia): entonces va su nombre legal.
  const visible = String(u.nombre_visible ?? '').trim();
  const personalizado = visible && visible.toLowerCase() !== String(u.nombre).toLowerCase() ? visible : '';
  return personalizado || nombresLegales(db).get(Number(usuarioId)) || visible || u.nombre;
}
export function nuevoCodigo(curso, azar = randomBytes) {
  const b = azar(8);
  const parte = k => Array.from(b.subarray(k, k + 4), x => LETRAS[x % LETRAS.length]).join('');
  return `${PREFIJO}-${DE_CURSO[curso]}-${parte(0)}-${parte(4)}`;
}
export const limpiarCodigo = c => String(c ?? '').toUpperCase().replace(/[\s_]+/g, '').replace(/[^A-Z0-9-]/g, '').slice(0, 20);

function guardado(db, curso, usuarioId) {
  const v = json(leerAjuste(db, claveCert(curso, usuarioId)));
  return v && FORMATO_CODIGO.test(String(v.codigo)) && VARIANTES.includes(v.variante) ? v : null;
}
function emitir(db, curso, usuarioId, datos) {
  return enTransaccion(db, () => guardado(db, curso, usuarioId) ?? emitirYa(db, curso, usuarioId, datos));
}
function emitirYa(db, curso, usuarioId, { fecha, variante, ahoraMs, azar }) {
  let codigo = nuevoCodigo(curso, azar);
  for (let k = 0; leerAjuste(db, claveCodigo(codigo)) != null; k++) {
    if (k > 20) throw new ErrorHttp(500, 'error_interno');
    codigo = nuevoCodigo(curso, azar);
  }
  const emitido = new Date(ahoraMs).toISOString();
  const cert = { codigo, curso, usuarioId: Number(usuarioId), fecha: fecha ?? emitido, variante, emitido };
  guardarAjuste(db, claveCodigo(codigo), JSON.stringify({ usuarioId: Number(usuarioId), curso }));
  guardarAjuste(db, claveCert(curso, usuarioId), JSON.stringify(cert));
  return cert;
}

// Los dos certificados de un alumno: { nombre, cursos: [{ curso, hay, disponible, avance, codigo?, fecha?, variante? }] }.
// Lo que está terminado y todavía no tenía certificado, se emite aquí (una sola vez).
export function certificadosDe(db, usuarioId, paquete, { ahoraMs = Date.now(), azar = randomBytes } = {}) {
  const nombre = nombreDe(db, usuarioId);
  if (nombre == null) throw new ErrorHttp(404, 'no_existe');
  const cursos = CURSOS.map(curso => {
    const ya = guardado(db, curso, usuarioId);
    const e = curso === 'tg' ? estadoTg(db, usuarioId, paquete, ahoraMs) : estadoOral(db, usuarioId, paquete);
    const hay = curso === 'tg' ? Boolean(paquete) : e.hay;
    let cert = ya;
    if (!cert && e.completo) {
      const perfil = curso === 'tg' ? perfilTg(db, usuarioId, e.materias, e.fecha) : perfilOral(db, usuarioId, e.fecha);
      cert = emitir(db, curso, usuarioId, { fecha: e.fecha, variante: elegirVariante(perfil), ahoraMs, azar });
    }
    return cert
      ? { curso, hay: true, disponible: true, avance: e.avance, codigo: cert.codigo, fecha: cert.fecha, variante: cert.variante, numero: VARIANTES.indexOf(cert.variante) + 1 }
      : { curso, hay, disponible: false, avance: e.avance };
  });
  return { nombre, cursos };
}

// Verificar un código (cualquier persona con cuenta): solo lo justo para saber que es de verdad.
export function verificarCodigo(db, codigo) {
  const c = limpiarCodigo(codigo);
  if (!FORMATO_CODIGO.test(c)) return { valido: false, codigo: c };
  const ref = json(leerAjuste(db, claveCodigo(c)));
  const cert = ref && CURSOS.includes(ref.curso) ? guardado(db, ref.curso, ref.usuarioId) : null;
  if (!cert || cert.codigo !== c) return { valido: false, codigo: c };
  return { valido: true, codigo: c, curso: cert.curso, nombre: nombreDe(db, cert.usuarioId), fecha: cert.fecha };
}
