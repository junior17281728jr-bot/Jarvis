// Academia 0.13.0: la «Mejora continua» de la fábrica. Como mucho UNA vez por semana, y SOLO si hay evidencia de los
// alumnos, reescribe esas tarjetas o explicaciones (la meta siempre: aprobar el Test Guide), las verifica igual que la
// fábrica y publica una versión nueva de esa materia (o la deja esperando revisión). Sin evidencia: ninguna llamada.
// Evidencia (solo números agregados; nunca un nombre ni un texto de un alumno va al modelo):
//  - una tarjeta con «Explícamelo mejor» (🤔) de 3 alumnos o más (anotarEvidenciaTarjeta, desde /api/academia/tutor/tarjeta);
//  - una pregunta del Test Guide que responden mal la mitad o más de 5 alumnos o más (academia_respuestas), con la
//    opción equivocada que más eligen.
// Lo que se mejoró se marca: la misma evidencia no vuelve a trabajarse (solo si después llega evidencia nueva).
// Su tope propio (por defecto US$2 al mes, editable) además del general. El Test Guide nunca cambia (se compara con la
// versión de antes, byte a byte).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { carpetaAcademia, leerAjuste, guardarAjuste, leerEnUso, guardarJson, activarPaquete, rutaDeRecurso } from './paquetes.js';
import { revisarPaquete } from './formato.js';
import { REGLAS_ESCRITURA, REGLAS_VERIFICACION, ESQUEMAS, datos } from './fabrica-prompts.js';
import { tarjetaConVisual } from './diagramas.js';
import { abrirAviso } from '../avisos/avisos.js';
import { puedeLlamar, gastoMejoraMesMicro, adjuntar, T } from './fabrica.js';
import { anotarCambio, costoDe } from './cambios-ia.js';

export const SEMANA_MS = 7 * 86_400_000;
export const UMBRALES_MEJORA = Object.freeze({ usuariosTarjeta: 3, usuariosPregunta: 5, fallaPct: 50, items: 6, paqueteMaxBytes: 4 * 1024 * 1024 });
const AJUSTE_ULTIMA = 'fabrica.mejora.ultima';
const AJUSTE_TRABAJO = 'fabrica.mejora.trabajo';
const iso = ms => new Date(ms).toISOString();
const leerJson = (db, clave) => { try { const v = JSON.parse(leerAjuste(db, clave) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const claveTarjeta = (materia, tema, titulo) => `fabrica.evidencia.t.${createHash('sha256').update(`${materia}|${tema}|${titulo}`).digest('hex').slice(0, 24)}`;

// Lo llama el servidor web al pedir «Explícamelo mejor» de una tarjeta (solo el id interno del alumno, para contar distintos).
export function anotarEvidenciaTarjeta(db, { materia, tema, titulo, usuarioId }) {
  if (typeof titulo !== 'string' || !titulo || typeof materia !== 'string' || typeof tema !== 'string') return;
  const clave = claveTarjeta(materia, tema, titulo);
  const v = leerJson(db, clave) ?? { materia, tema, titulo: titulo.slice(0, 200), usuarios: [], veces: 0, consumida: 0 };
  v.veces += 1;
  if (!v.usuarios.includes(usuarioId) && v.usuarios.length < 200) v.usuarios.push(usuarioId);
  guardarAjuste(db, clave, JSON.stringify(v));
}

// La evidencia que todavía no se trabajó. → [{ tipo: 'tarjeta'|'pregunta', materia, tema, titulo?, pregunta?, evidencia }]
export function evidencia(db) {
  const out = [];
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave > 'fabrica.evidencia.t.' AND clave < 'fabrica.evidencia.t/'").all()) {
    let v; try { v = JSON.parse(f.valor); } catch { continue; }
    const nuevos = v.usuarios.length - (v.consumida ?? 0);
    if (v.usuarios.length >= UMBRALES_MEJORA.usuariosTarjeta && nuevos >= UMBRALES_MEJORA.usuariosTarjeta) {
      out.push({ tipo: 'tarjeta', materia: v.materia, tema: v.tema, titulo: v.titulo, clave: f.clave, evidencia: { alumnos: v.usuarios.length, veces: v.veces }, peso: v.usuarios.length });
    }
  }
  const filas = db.prepare(`SELECT pregunta, materia, tema, COUNT(DISTINCT usuario_id) AS alumnos, COUNT(*) AS n, SUM(correcta) AS bien FROM academia_respuestas
    WHERE pregunta LIKE 'tg-%' GROUP BY pregunta HAVING alumnos >= ?`).all(UMBRALES_MEJORA.usuariosPregunta);
  for (const f of filas) {
    const pct = Math.round(((f.n - f.bien) * 100) / f.n);
    if (pct < UMBRALES_MEJORA.fallaPct) continue;
    const hecha = leerJson(db, `fabrica.mejora.hecha.${f.pregunta}`);
    if (hecha && f.n - hecha.n < 10) continue;
    const opcion = db.prepare('SELECT elegida, COUNT(*) AS n FROM academia_respuestas WHERE pregunta = ? AND correcta = 0 GROUP BY elegida ORDER BY n DESC LIMIT 1').get(f.pregunta);
    out.push({ tipo: 'pregunta', materia: f.materia, tema: f.tema, pregunta: f.pregunta, evidencia: { alumnos: f.alumnos, respuestas: f.n, fallaPct: pct, opcion: opcion?.elegida ?? null, opcionPct: opcion ? Math.round((opcion.n * 100) / f.n) : 0 }, peso: f.alumnos * pct, n: f.n });
  }
  return out.filter(x => typeof x.materia === 'string' && typeof x.tema === 'string').sort((a, b) => b.peso - a.peso);
}

// La versión en uso que da esa materia (la última puesta en uso que la trae).
function versionDe(db, materia) {
  for (const e of [...leerEnUso(db)].reverse()) {
    if (e.materias && !e.materias.includes(materia)) continue;
    const f = db.prepare("SELECT * FROM academia_paquetes WHERE id = ? AND estado = 'listo'").get(e.id);
    if (f) return f;
  }
  return null;
}
function leerPaquete(config, fila) {
  const ruta = join(carpetaAcademia(config), 'paquetes', fila.carpeta, 'paquete.json');
  if (statSync(ruta).size > UMBRALES_MEJORA.paqueteMaxBytes) return null;
  return JSON.parse(readFileSync(ruta, 'utf8'));
}

// Un paso de la mejora. → { seguir, motivo, esperarMs? }
export async function mejorar(ctx, { ahora, cfg }) {
  const { db, config } = ctx;
  if (!cfg.mejora.activa) return { seguir: false, motivo: 'apagada' };
  let trabajo = leerJson(db, AJUSTE_TRABAJO);
  if (!trabajo?.items) {
    const ultima = leerJson(db, AJUSTE_ULTIMA);
    if (ultima?.en && ahora - Date.parse(ultima.en) < SEMANA_MS) return { seguir: false, motivo: 'semana' };
    const ev = evidencia(db);
    if (!ev.length) { await ctx.escribir(() => guardarAjuste(db, AJUSTE_ULTIMA, JSON.stringify({ en: iso(ahora), motivo: 'sin_evidencia', mejorados: [] }))); return { seguir: false, motivo: 'sin_evidencia' }; }
    const materia = ev[0].materia;
    const fila = versionDe(db, materia);
    if (!fila) { await ctx.escribir(() => guardarAjuste(db, AJUSTE_ULTIMA, JSON.stringify({ en: iso(ahora), motivo: 'sin_version', mejorados: [] }))); return { seguir: false, motivo: 'sin_version' }; }
    trabajo = { materia, version: fila.id, items: ev.filter(x => x.materia === materia).slice(0, UMBRALES_MEJORA.items), hechos: {}, iniciado: iso(ahora) };
    await ctx.escribir(() => guardarAjuste(db, AJUSTE_TRABAJO, JSON.stringify(trabajo)));
    return { seguir: true, motivo: 'empieza' };
  }
  const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(trabajo.version);
  const viejo = fila ? leerPaquete(config, fila) : null;
  const m = viejo?.materias?.find(x => x.id === trabajo.materia);
  if (!m) { await ctx.escribir(() => { guardarAjuste(db, AJUSTE_TRABAJO, 'null'); guardarAjuste(db, AJUSTE_ULTIMA, JSON.stringify({ en: iso(ahora), motivo: 'sin_version', mejorados: [] })); }); return { seguir: false, motivo: 'sin_version' }; }
  const porId = new Map(viejo.preguntas.map(q => [q.id, q]));
  const pendiente = trabajo.items.findIndex((x, i) => !trabajo.hechos[i]);
  const llamar = async (proposito, sistema, texto, esquema, paso) => {
    const bytes = Buffer.byteLength(sistema) + Buffer.byteLength(texto) + Buffer.byteLength(JSON.stringify(esquema));
    const puede = puedeLlamar(db, config, { proposito, bytes, ahora, topeMicro: cfg.mejora.topeMesMicro, gastado: gastoMejoraMesMicro(db, ahora) });
    if (!puede.ok) return { espera: puede.motivo };
    return ctx.ia.pedir({ proposito, paso, sistema, texto, esquema });
  };
  if (pendiente >= 0) {
    const it = trabajo.items[pendiente];
    const t = m.temas.find(x => x.id === it.tema);
    let r;
    let porque = null;
    if (it.tipo === 'tarjeta') {
      const s = t?.secciones.find(x => x.titulo === it.titulo);
      if (!s) { trabajo.hechos[pendiente] = { saltado: 'no_esta' }; await ctx.escribir(() => guardarAjuste(db, AJUSTE_TRABAJO, JSON.stringify(trabajo))); return { seguir: true }; }
      const preguntas = (t.preguntas ?? []).map(id => porId.get(id)?.original).filter(Boolean).map(o => ({ enunciado: o.enunciado, correcta: o.opciones.find(x => x.letra === o.correcta)?.texto }));
      porque = `${it.evidencia.alumnos} alumnos pidieron «Explícamelo mejor»`;
      r = await llamar('mejora_escribir', REGLAS_ESCRITURA, `Varios alumnos no entendieron esta tarjeta (${porque}). Reescríbela más clara, con un ejemplo más concreto y su dibujo, con los MISMOS datos y fuentes (no agregues datos nuevos). Meta: aprobar el Test Guide.\n${datos({ tarjeta: s, test_guide_del_tema: preguntas })}`, ESQUEMAS.mejora_tarjeta, `m:${trabajo.version}:${pendiente}`);
    } else {
      const q = porId.get(it.pregunta);
      if (!q) { trabajo.hechos[pendiente] = { saltado: 'no_esta' }; await ctx.escribir(() => guardarAjuste(db, AJUSTE_TRABAJO, JSON.stringify(trabajo))); return { seguir: true }; }
      porque = `${it.evidencia.fallaPct} % la responde mal${it.evidencia.opcion ? `; la mayoría elige la ${it.evidencia.opcion}` : ''}`;
      r = await llamar('mejora_escribir', REGLAS_ESCRITURA, `Muchos alumnos fallan esta pregunta del Test Guide (${porque}). Reescribe «sencilla» y «errores» (para CADA opción incorrecta) para que la entiendan y no caigan en la trampa. La respuesta correcta es la del Test Guide, TAL CUAL.\n${datos({ pregunta: q.original, sencilla_actual: q.sencilla, errores_actuales: q.errores })}`, ESQUEMAS.mejora_pregunta, `m:${trabajo.version}:${pendiente}`);
    }
    if (r.espera) { await ctx.escribir(() => guardarAjuste(db, AJUSTE_ULTIMA, JSON.stringify({ en: trabajo.iniciado, motivo: r.espera, mejorados: [] }))); return { seguir: false, motivo: r.espera }; }
    trabajo.hechos[pendiente] = r.usada ? { json: r.json, porque } : { fallido: r.motivo };
    await ctx.escribir(() => guardarAjuste(db, AJUSTE_TRABAJO, JSON.stringify(trabajo)));
    return r.usada ? { seguir: true } : { seguir: false, motivo: r.motivo };
  }
  // Todo escrito: verificar (Haiku) una vez y armar la versión nueva.
  const cambios = trabajo.items.map((it, i) => ({ it, h: trabajo.hechos[i] })).filter(x => x.h?.json);
  if (!trabajo.verificado && cambios.length) {
    const r = await llamar('mejora_verificar', REGLAS_VERIFICACION, `${'Revisa estas tarjetas y explicaciones reescritas contra la versión de antes (que ya fue revisada contra el libro) y la clave del Test Guide.'}\n${datos(cambios.map(({ it, h }) => ({ antes: it.tipo === 'tarjeta' ? m.temas.find(t => t.id === it.tema)?.secciones.find(s => s.titulo === it.titulo) : { original: porId.get(it.pregunta)?.original, sencilla: porId.get(it.pregunta)?.sencilla }, despues: h.json })))}`, ESQUEMAS.verificar, `m:${trabajo.version}:v`);
    if (r.espera) return { seguir: false, motivo: r.espera };
    trabajo.verificado = { dudas: r.usada ? r.json.dudas : [{ donde: 'mejora', problema: `sin_verificar:${r.motivo}`, gravedad: 'error' }] };
    await ctx.escribir(() => guardarAjuste(db, AJUSTE_TRABAJO, JSON.stringify(trabajo)));
    return { seguir: true };
  }
  const dudas = [...(trabajo.verificado?.dudas ?? [])];
  const mejorados = [];
  const nuevo = JSON.parse(JSON.stringify(viejo));
  const mn = nuevo.materias.find(x => x.id === trabajo.materia);
  const pregs = new Map(nuevo.preguntas.map(q => [q.id, q]));
  for (const { it, h } of cambios) {
    const t = mn.temas.find(x => x.id === it.tema);
    if (it.tipo === 'tarjeta') {
      const i = t.secciones.findIndex(s => s.titulo === it.titulo);
      const d = h.json.tarjeta;
      const s = { ...t.secciones[i], titulo: d.titulo, puntos: d.puntos.slice(0, 6), recuerda: d.recuerda, ejemplo: d.ejemplo };
      if (d.visual?.tipo) s.visual = { tipo: d.visual.tipo, parametros: Object.fromEntries(Object.entries(d.visual.parametros ?? {}).filter(([, v]) => v != null)) };
      if (!d.puntos.length || d.puntos.length > 4 || !tarjetaConVisual(s)) { dudas.push({ donde: it.titulo, problema: 'tarjeta_no_valida', gravedad: 'error' }); continue; }
      t.secciones[i] = JSON.parse(JSON.stringify(s));
      mejorados.push({ tipo: 'tarjeta', tema: it.tema, titulo: it.titulo, porque: h.porque });
    } else {
      const q = pregs.get(it.pregunta);
      const malas = q.original.opciones.map(o => o.letra).filter(l => l !== q.original.correcta);
      if (!h.json.sencilla.trim() || h.json.errores.length !== malas.length || malas.some(l => !h.json.errores.some(e => e.letra === l))) { dudas.push({ donde: it.pregunta, problema: 'errores_no_validos', gravedad: 'error' }); continue; }
      q.sencilla = h.json.sencilla;
      q.errores = Object.fromEntries(h.json.errores.map(e => [e.letra, e.idea]));
      mejorados.push({ tipo: 'pregunta', tema: it.tema, pregunta: it.pregunta, porque: h.porque });
    }
  }
  // Solo esa materia (y lo que nombra), con el Test Guide igual al de antes.
  const ids = new Set(mn.temas.flatMap(t => t.preguntas));
  nuevo.materias = [mn];
  nuevo.preguntas = nuevo.preguntas.filter(q => ids.has(q.id));
  const figurasUsadas = new Set(nuevo.preguntas.map(q => q.original?.figura).filter(Boolean));
  nuevo.figuras = (nuevo.figuras ?? []).filter(f => figurasUsadas.has(f.numero));
  const paginasUsadas = new Set(nuevo.preguntas.map(q => q.original?.pagina_imagen?.toLowerCase()).filter(Boolean));
  if (Array.isArray(nuevo.paginas)) nuevo.paginas = nuevo.paginas.filter(g => paginasUsadas.has(g.archivo.toLowerCase()));
  nuevo.edicion = `mejora-${trabajo.materia}-${iso(ahora).slice(0, 10)}`;
  const igualTg = nuevo.preguntas.every(q => q.origen !== 'test_guide' || JSON.stringify(q.original) === JSON.stringify(porId.get(q.id)?.original));
  const revision = revisarPaquete(nuevo);
  const cierre = async (motivo, version = null) => {
    await ctx.escribir(() => {
      for (const x of mejorados) {
        if (x.tipo === 'tarjeta') { const it = trabajo.items.find(i => i.titulo === x.titulo); const v = leerJson(db, it.clave); if (v) guardarAjuste(db, it.clave, JSON.stringify({ ...v, consumida: v.usuarios.length })); }
        else { const it = trabajo.items.find(i => i.pregunta === x.pregunta); guardarAjuste(db, `fabrica.mejora.hecha.${x.pregunta}`, JSON.stringify({ n: it.n, en: iso(ahora) })); }
      }
      guardarAjuste(db, AJUSTE_ULTIMA, JSON.stringify({ en: iso(ahora), motivo, materia: trabajo.materia, version, mejorados, dudas: dudas.slice(0, 50) }));
      guardarAjuste(db, AJUSTE_TRABAJO, 'null');
      // 0.14.2: «Lo que hizo la IA»: cada corrección que quedó en una versión (publicada o esperando revisión).
      if (version != null) {
        const c = costoDe(db, `m:${trabajo.version}:`);
        for (const x of mejorados.slice(0, 20)) anotarCambio(db, { materia: trabajo.materia, tema: x.tema, que: 'correccion', estado: motivo, version, antes: { que: x.tipo === 'tarjeta' ? x.titulo : x.pregunta }, despues: { porque: x.porque }, proveedor: c.proveedor, modelo: c.modelo, revisadoPor: c.revisadoPor, ahora });
      }
    });
    return { seguir: false, motivo };
  };
  if (!mejorados.length) return cierre('nada_valido');
  if (!igualTg || !revision.ok) return cierre(!igualTg ? 'tg_alterado' : 'paquete_no_valido');
  const cuerpo = Buffer.from(JSON.stringify(nuevo));
  const huella = createHash('sha256').update(cuerpo).digest('hex');
  const g = await guardarJson(db, config, { cuerpo, revisado: { datos: nuevo, revision, huella }, origen: 'fabrica', escribir: ctx.escribir });
  const nf = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(g.datos.paquete.id);
  for (const [clase, lista] of [['figura', revision.figuras], ['pagina', revision.paginas], ['foto', revision.fotos], ['clip', revision.clips], ['audio', revision.audios], ['video', revision.videos]]) {
    for (const f of lista ?? []) await adjuntar(db, config, nf, clase, f.archivo, rutaDeRecurso(config, fila, clase, f.archivo), ctx.escribir);
  }
  const listo = db.prepare('SELECT estado FROM academia_paquetes WHERE id = ?').get(nf.id).estado === 'listo';
  if (listo && !dudas.length) {
    await ctx.escribir(() => {
      activarPaquete(db, { paqueteId: nf.id, materias: [trabajo.materia] });
      abrirAviso(db, { clave: `fabrica_mejora:${trabajo.materia}:${nf.id}`, nivel: 'atencion', detalle: { n: mejorados.length }, ahora });
    });
    return cierre('publicada', nf.id);
  }
  await ctx.escribir(() => abrirAviso(db, { clave: `fabrica_revision:${trabajo.materia}:m${nf.id}`, nivel: 'atencion', detalle: { n: dudas.length }, ahora }));
  return cierre('revision', nf.id);
}
export { T as TOPES_FABRICA };
