// Academia 0.9.2: el «Reporte» del administrador (Administrador → Alumnos → Descargar reporte). Solo administrador.
// Partes (el administrador elige cuáles; se recuerda su última elección en ajustes academia.reporte.<id>):
//  - ranking: 1.º, 2.º, 3.º… por un puntaje que se explica en la página (ver PUNTAJE);
//  - alumnos: cada alumno con su % por materia, qué reforzar, última actividad, exámenes aprobados, términos aceptados;
//  - grupo: el promedio de cada materia y los temas más difíciles (más fallos entre todos);
//  - comparar: lado a lado los alumnos que elija (o todos).
// Filtros: desde / hasta (días de Santo Domingo, para lo que se respondió y los intentos) e incluir bloqueados.
// Un alumno con «perfil privado» SÍ sale aquí: el administrador ve todo. Sin cambio de base.
import { ErrorHttp } from '../nucleo/http.js';
import { porMateria, temasAprobados, examenes, puntosYRacha, ajustesAcademia } from './progreso.js';
import { preparacionDe } from './plan.js';
import { puntosDebiles } from './memoria.js';
import { avataresDe } from '../cuentas/perfil.js';
import { nombresLegales, estadoTerminos } from '../cuentas/terminos.js';
import { actividadDe } from '../cuentas/historial.js';

export const SECCIONES_REPORTE = Object.freeze(['ranking', 'alumnos', 'grupo', 'comparar']);
// El puntaje del ranking (0 a 100): lo que más pesa es la preparación (cuánto del contenido domina hoy), después la
// nota promedio de sus temas y exámenes, y el % de acierto. Quien no tiene nota promedio usa su preparación.
export const PUNTAJE = Object.freeze({ preparacion: 0.6, nota: 0.25, acierto: 0.15 });
const pct = (bien, total) => (total > 0 ? Math.floor((bien * 100) / total) : 0);
const DIA = /^\d{4}-\d{2}-\d{2}$/;
// Un día de Santo Domingo (UTC−4) → el instante UTC en que empieza.
const inicioDia = dia => new Date(Date.parse(`${dia}T00:00:00Z`) + 4 * 3600 * 1000).toISOString();

export function opcionesReporte(db, adminId) {
  let o = null;
  try { o = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`academia.reporte.${Number(adminId)}`)?.valor ?? 'null'); } catch { o = null; }
  return limpiarOpciones(o ?? {}, { estricto: false });
}
export function guardarOpcionesReporte(db, adminId, datos) {
  const o = limpiarOpciones(datos, { estricto: true });
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(`academia.reporte.${Number(adminId)}`, JSON.stringify(o), new Date().toISOString());
  return o;
}
// { secciones: [...], bloqueados: bool, comparar: 'todos' | [ids], desde?: 'AAAA-MM-DD', hasta?: … }
export function limpiarOpciones(d, { estricto }) {
  const mal = () => { if (estricto) throw new ErrorHttp(400, 'reporte_no_valido'); };
  const secciones = Array.isArray(d?.secciones) ? d.secciones.filter(s => SECCIONES_REPORTE.includes(s)) : null;
  if (estricto && (!secciones || secciones.length !== d.secciones.length)) mal();
  let comparar = 'todos';
  if (Array.isArray(d?.comparar)) {
    if (!d.comparar.every(n => Number.isSafeInteger(n) && n > 0) || d.comparar.length > 200) mal();
    else comparar = [...new Set(d.comparar)];
  } else if (d?.comparar !== undefined && d.comparar !== 'todos') mal();
  const fecha = v => (v == null || v === '' ? null : typeof v === 'string' && DIA.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ? v : (mal(), null));
  const desde = fecha(d?.desde);
  const hasta = fecha(d?.hasta);
  if (desde && hasta && desde > hasta) mal();
  return { secciones: secciones ?? ['ranking', 'alumnos', 'grupo'], bloqueados: d?.bloqueados === true, comparar, desde, hasta };
}

export function reporteAcademia(db, paquete, opciones, ahoraMs = Date.now()) {
  const o = limpiarOpciones(opciones, { estricto: true });
  const desdeIso = o.desde ? inicioDia(o.desde) : '0000';
  const hastaIso = o.hasta ? new Date(Date.parse(inicioDia(o.hasta)) + 24 * 3600 * 1000).toISOString() : '9999';
  const avatares = avataresDe(db);
  const legales = nombresLegales(db);
  const cuentas = db.prepare(`SELECT id, nombre, nombre_visible, rol, activo FROM usuarios WHERE rol = 'usuario' ${o.bloqueados ? '' : 'AND activo = 1'} ORDER BY id`).all();
  const materiasIds = (paquete?.materias ?? []).filter(m => m.temas.length).map(m => m.id);
  const titulos = new Map((paquete?.materias ?? []).flatMap(m => m.temas.map(t => [`${m.id}/${t.id}`, t.titulo])));
  const alumnos = cuentas.map(u => {
    const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien FROM academia_respuestas WHERE usuario_id = ? AND creada_en >= ? AND creada_en < ?').get(u.id, desdeIso, hastaIso);
    const calificados = db.prepare(`SELECT total, aciertos FROM academia_intentos WHERE usuario_id = ? AND tipo IN ('tema', 'examen') AND terminado_en IS NOT NULL
      AND terminado_en >= ? AND terminado_en < ?`).all(u.id, desdeIso, hastaIso);
    const nota = calificados.length ? Math.round(calificados.reduce((s, x) => s + pct(x.aciertos, x.total), 0) / calificados.length) : null;
    const prep = preparacionDe(db, u.id, paquete);
    const acierto = pct(r.bien, r.n);
    const puntaje = Math.round(PUNTAJE.preparacion * prep.pct + PUNTAJE.nota * (nota ?? prep.pct) + PUNTAJE.acierto * acierto);
    const deExamen = examenes(db, u.id);
    const memoria = puntosDebiles(db, u.id, paquete);
    const act = actividadDe(db, u.id, ahoraMs);
    const ultimaRespuesta = db.prepare('SELECT MAX(creada_en) AS f FROM academia_respuestas WHERE usuario_id = ?').get(u.id).f;
    const terminos = estadoTerminos(db, u.id);
    return {
      id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible || u.nombre, nombreLegal: legales.get(u.id) ?? null, avatar: avatares.get(u.id) ?? null,
      bloqueado: u.activo !== 1, puntaje, preparacion: prep.pct, notaPromedio: nota, pctAcierto: acierto, respuestas: r.n, calificados: calificados.length,
      examenesAprobados: [...deExamen.values()].filter(x => x.aprobado).length, examenes: materiasIds.length,
      temasAprobados: [...temasAprobados(db, u.id).values()].filter(x => x.aprobado).length, temas: (paquete?.materias ?? []).reduce((n, m) => n + m.temas.length, 0),
      racha: puntosYRacha(db, u.id, ahoraMs).racha,
      ultimaActividad: [act.ultimaActividad, ultimaRespuesta, act.ultimaEntrada].filter(Boolean).sort().pop() ?? null,
      materias: paquete ? porMateria(db, u.id, paquete).map(m => ({ id: m.id, pct: m.pct, pctRespuestas: m.pctRespuestas })) : [],
      reforzar: {
        temas: memoria.temas.slice(0, 3).map(t => ({ materia: t.materia, titulo: t.titulo, fallos: t.fallos, pct: t.pct })),
        ideas: memoria.ideas.filter(x => !x.superada).slice(0, 3).map(x => ({ idea: x.idea, numero: x.numero, fallos: x.fallos })),
        pendientes: memoria.preguntas.filter(p => !p.superada).length,
      },
      terminos: terminos.ultima ? { version: terminos.ultima.version, en: terminos.ultima.en, alDia: !terminos.pendiente } : null,
    };
  });
  const ranking = [...alumnos].sort((a, b) => b.puntaje - a.puntaje || b.respuestas - a.respuestas || a.nombre.localeCompare(b.nombre))
    .map((a, k) => ({ lugar: k + 1, id: a.id, puntaje: a.puntaje }));
  const lugarDe = new Map(ranking.map(x => [x.id, x.lugar]));
  for (const a of alumnos) a.lugar = lugarDe.get(a.id);
  // El grupo: promedio de cada materia y los temas con más fallos (en el período).
  const ids = alumnos.map(a => a.id);
  const grupo = {
    materias: materiasIds.map(id => {
      const valores = alumnos.map(a => a.materias.find(m => m.id === id)?.pct ?? 0);
      return { id, promedio: valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : 0 };
    }),
    dificiles: ids.length ? db.prepare(`SELECT materia, tema, COUNT(*) AS n, SUM(1 - correcta) AS fallos, COUNT(DISTINCT usuario_id) AS alumnos FROM academia_respuestas
      WHERE usuario_id IN (${ids.map(() => '?').join(',')}) AND creada_en >= ? AND creada_en < ? AND tema IS NOT NULL
      GROUP BY materia, tema HAVING SUM(1 - correcta) > 0 ORDER BY fallos DESC, n DESC LIMIT 8`).all(...ids, desdeIso, hastaIso)
      .map(f => ({ materia: f.materia, tema: f.tema, titulo: titulos.get(`${f.materia}/${f.tema}`) ?? f.tema, fallos: f.fallos, respuestas: f.n, pct: pct(f.fallos, f.n), alumnos: f.alumnos })) : [],
    alumnos: alumnos.length,
    preparacion: alumnos.length ? Math.round(alumnos.reduce((s, a) => s + a.preparacion, 0) / alumnos.length) : 0,
  };
  const comparar = o.comparar === 'todos' ? ids : o.comparar.filter(id => ids.includes(id));
  const { nombre } = ajustesAcademia(db);
  return {
    nombreApp: nombre, generado: new Date(ahoraMs).toISOString(), opciones: o, puntaje: PUNTAJE, materias: materiasIds,
    ranking: o.secciones.includes('ranking') ? ranking : null,
    alumnos: o.secciones.includes('alumnos') || o.secciones.includes('ranking') || o.secciones.includes('comparar') ? alumnos : null,
    grupo: o.secciones.includes('grupo') ? grupo : null,
    comparar: o.secciones.includes('comparar') ? comparar : null,
  };
}
