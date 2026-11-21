// Academia 0.14.94: «Ver y deshacer» lo que la IA de la fábrica reescribió en UNA tarjeta (Administrador → Contenido →
// «Lo que hizo la IA», en cada corrección). Solo agrega: nada se borra nunca.
//  - historialTema: las tarjetas de un tema en la versión EN USO de esa materia y, por cada una, cómo estaba en las
//    versiones de antes de la misma materia (la misma posición en el tema, o el mismo título), cuando el texto era otro.
//  - revertirTarjeta: arma una versión NUEVA (la de ahora, con esa tarjeta como estaba en la versión elegida), la revisa
//    como cualquier paquete, le pasa sus archivos y la pone en uso solo para esa materia. Las versiones de antes quedan
//    guardadas (también la reescrita): se puede volver a cualquiera.
import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { revisarPaquete, MATERIAS, MATERIAS_ORAL } from './formato.js';
import { carpetaAcademia, leerEnUso, guardarJson, activarPaquete, rutaDeRecurso, manifiesto } from './paquetes.js';
import { adjuntar } from './fabrica.js';
import { anotarCambio } from './cambios-ia.js';
import { textoDe } from './guarda-reescritura.js';

export const LIMITES_HISTORIAL = Object.freeze({ versiones: 12, paqueteMaxBytes: 8 * 1024 * 1024, texto: 4000, porTarjeta: 5 });
const MATERIA = /^[a-z_]{1,40}$/;
const TEMA = /^[a-z0-9_-]{1,80}$/;

function leer(config, fila) {
  const ruta = join(carpetaAcademia(config), 'paquetes', fila.carpeta, 'paquete.json');
  if (!existsSync(ruta) || statSync(ruta).size > LIMITES_HISTORIAL.paqueteMaxBytes) return null;
  try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch { return null; }
}
// La versión EN USO de esa materia (la última puesta en uso que la trae).
function enUso(db, materia) {
  for (const e of [...leerEnUso(db)].reverse()) {
    if (e.materias && !e.materias.includes(materia)) continue;
    const f = db.prepare("SELECT * FROM academia_paquetes WHERE id = ? AND estado = 'listo'").get(e.id);
    if (f) return f;
  }
  return null;
}
// Las versiones «listas» que traen esa materia, de la más nueva a la más vieja (como mucho LIMITES_HISTORIAL.versiones).
function versionesDe(db, config, materia) {
  const out = [];
  for (const f of db.prepare("SELECT * FROM academia_paquetes WHERE estado = 'listo' ORDER BY id DESC").all()) {
    let m = null;
    try { m = manifiesto(config, f).materias; } catch { m = null; }
    if (!Array.isArray(m) || !m.includes(materia)) continue;
    out.push(f);
    if (out.length >= LIMITES_HISTORIAL.versiones) break;
  }
  return out;
}
const revisarIds = (materia, tema) => {
  if (!MATERIA.test(String(materia ?? '')) || ![...MATERIAS, ...MATERIAS_ORAL].includes(materia)) throw new ErrorHttp(400, 'datos_no_validos');
  if (!TEMA.test(String(tema ?? ''))) throw new ErrorHttp(400, 'datos_no_validos');
};
const temaDe = (datos, materia, tema) => datos?.materias?.find(m => m.id === materia)?.temas?.find(t => t.id === tema) ?? null;
const corto = s => String(s).slice(0, LIMITES_HISTORIAL.texto);
const huella = s => createHash('sha256').update(JSON.stringify(s ?? null)).digest('hex').slice(0, 16);
// La tarjeta de una versión vieja que corresponde a la n de ahora: la del mismo lugar si tiene el mismo título; si no, la
// ÚNICA con ese título (otra versión la movió); si no, la del mismo lugar (la «Mejora continua» cambia el título en su
// lugar). Los títulos repetidos («¿Te acuerdas?») solo cuentan en su mismo lugar.
function pareja(viejas, n, titulo) {
  if (viejas[n - 1] && viejas[n - 1].titulo === titulo) return { i: n - 1, s: viejas[n - 1] };
  const iguales = viejas.map((s, i) => (s?.titulo === titulo ? i : -1)).filter(i => i >= 0);
  if (iguales.length === 1) return { i: iguales[0], s: viejas[iguales[0]] };
  return viejas[n - 1] ? { i: n - 1, s: viejas[n - 1] } : null;
}

// → { materia, tema, actual: { version, edicion }, tarjetas: [{ n, titulo, texto, antes: [{ version, edicion, subidoEn, titulo, texto, huella }] }] }
export function historialTema(db, config, { materia, tema }) {
  revisarIds(materia, tema);
  const fila = enUso(db, materia);
  if (!fila) throw new ErrorHttp(404, 'no_existe');
  const ahora = temaDe(leer(config, fila), materia, tema);
  if (!ahora) throw new ErrorHttp(404, 'no_existe');
  const viejas = versionesDe(db, config, materia).filter(f => f.id !== fila.id).map(f => ({ f, t: temaDe(leer(config, f), materia, tema) })).filter(x => x.t);
  const tarjetas = (ahora.secciones ?? []).map((s, i) => {
    const h = huella(s);
    const antes = [];
    const vistas = new Set([h]);
    for (const { f, t } of viejas) {
      const p = pareja(t.secciones ?? [], i + 1, s.titulo);
      if (!p || vistas.has(huella(p.s))) continue;
      vistas.add(huella(p.s));
      antes.push({ version: f.id, edicion: f.edicion ?? null, subidoEn: f.subido_en ?? null, titulo: String(p.s.titulo ?? '').slice(0, 200), texto: corto(textoDe(p.s)), huella: huella(p.s) });
      if (antes.length >= LIMITES_HISTORIAL.porTarjeta) break;
    }
    return { n: i + 1, titulo: String(s.titulo ?? '').slice(0, 200), texto: corto(textoDe(s)), huella: h, antes };
  }).filter(x => x.antes.length);
  return { materia, tema, actual: { version: fila.id, edicion: fila.edicion ?? null }, tarjetas };
}

// Vuelve UNA tarjeta a como estaba en «version». → { version (la nueva), publicada }
export async function revertirTarjeta(db, config, { materia, tema, n, version, usuarioId = null, ahora = Date.now() }) {
  revisarIds(materia, tema);
  if (!Number.isSafeInteger(n) || n < 1 || n > 500 || !Number.isSafeInteger(version) || version < 1) throw new ErrorHttp(400, 'datos_no_validos');
  const fila = enUso(db, materia);
  if (!fila) throw new ErrorHttp(404, 'no_existe');
  const origen = db.prepare("SELECT * FROM academia_paquetes WHERE id = ? AND estado = 'listo'").get(version);
  if (!origen || origen.id === fila.id) throw new ErrorHttp(404, 'no_existe');
  const actual = leer(config, fila);
  const viejo = leer(config, origen);
  const t = temaDe(actual, materia, tema);
  const tv = temaDe(viejo, materia, tema);
  if (!t || !tv || !t.secciones?.[n - 1]) throw new ErrorHttp(404, 'no_existe');
  const p = pareja(tv.secciones ?? [], n, t.secciones[n - 1].titulo);
  if (!p) throw new ErrorHttp(404, 'no_existe');
  const antes = t.secciones[n - 1];
  // La versión nueva: SOLO esa materia (y las preguntas, figuras y páginas que nombra), con esa tarjeta como estaba.
  const nuevo = JSON.parse(JSON.stringify(actual));
  const mn = nuevo.materias.find(m => m.id === materia);
  mn.temas.find(x => x.id === tema).secciones[n - 1] = JSON.parse(JSON.stringify(p.s));
  nuevo.materias = [mn];
  const ids = new Set(mn.temas.flatMap(x => x.preguntas ?? []));
  nuevo.preguntas = (nuevo.preguntas ?? []).filter(q => ids.has(q.id));
  const figuras = new Set(nuevo.preguntas.map(q => q.original?.figura).filter(Boolean));
  nuevo.figuras = (nuevo.figuras ?? []).filter(f => figuras.has(f.numero));
  const paginas = new Set(nuevo.preguntas.map(q => q.original?.pagina_imagen?.toLowerCase()).filter(Boolean));
  if (Array.isArray(nuevo.paginas)) nuevo.paginas = nuevo.paginas.filter(g => paginas.has(g.archivo.toLowerCase()));
  nuevo.edicion = `deshacer-${materia}-${new Date(ahora).toISOString().slice(0, 10)}-v${origen.id}`.slice(0, 200);
  const revision = revisarPaquete(nuevo);
  if (!revision.ok) throw new ErrorHttp(422, 'paquete_no_valido');
  const cuerpo = Buffer.from(JSON.stringify(nuevo));
  const g = await guardarJson(db, config, { cuerpo, revisado: { datos: nuevo, revision, huella: createHash('sha256').update(cuerpo).digest('hex') }, usuarioId });
  const nf = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(g.datos.paquete.id);
  // Cada archivo, desde la versión de ahora o (lo de la tarjeta vieja) desde la elegida.
  for (const [clase, lista] of [['figura', revision.figuras], ['pagina', revision.paginas], ['foto', revision.fotos], ['clip', revision.clips], ['audio', revision.audios], ['video', revision.videos]]) {
    for (const f of lista ?? []) {
      const ok = await adjuntar(db, config, nf, clase, f.archivo, rutaDeRecurso(config, fila, clase, f.archivo), w => enTransaccion(db, w));
      if (!ok) await adjuntar(db, config, nf, clase, f.archivo, rutaDeRecurso(config, origen, clase, f.archivo), w => enTransaccion(db, w));
    }
  }
  const listo = db.prepare('SELECT estado FROM academia_paquetes WHERE id = ?').get(nf.id).estado === 'listo';
  if (listo) activarPaquete(db, { paqueteId: nf.id, materias: [materia], usuarioId });
  anotarCambio(db, { materia, tema, que: 'tarjeta_revertida', estado: listo ? 'publicada' : 'incompleta', version: nf.id, antes: { que: antes.titulo ?? null, n, version: fila.id }, despues: { que: p.s.titulo ?? null, desde: origen.id }, ahora });
  return { version: nf.id, publicada: listo };
}
