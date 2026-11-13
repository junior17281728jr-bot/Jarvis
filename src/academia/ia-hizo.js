// 0.14.0: «Lo que hizo la IA» (Administrador → Contenido, junto a la Fábrica). Solo LEE lo que la fábrica ya guarda:
//  - cambios: el registro (src/academia/cambios-ia.js), del más nuevo al más viejo, con su enlace a la clase.
//  - numeros: materias hechas / en curso / pendientes (de las 11 y de los capítulos orales), temas mejorados, preguntas
//    con explicación, dudas que esperan tu revisión, dinero gastado contra los topes y el tiempo estimado que falta.
//  - falta: «Lo que falta», en palabras simples (claves de texto con sus datos; la pantalla las traduce).
//  - materiales: lo que la IA necesita de los materiales privados (texto del libro, Test Guide, fotos, libro del oral)
//    y no está: así se sabe qué subir a la carpeta «fuentes» del Drive.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MATERIAS, MATERIAS_ORAL } from './formato.js';
import { paqueteActivo } from './paquetes.js';
import { carpetaFuentes, estadoFuentes, leerManifiesto, leerLecturas, preguntasDeTema, imagenesDeTema } from './fuentes.js';
import { leerFuenteOral } from './fabrica-oral.js';
import { vistaFabrica, estadoMateria, leerConfigFabrica, gastoFabricaMicro, gastoMejoraMesMicro } from './fabrica.js';
import { crearLector, publicado, estadoProfunda, gastoProfundaMicro, planProfundo } from './fabrica-profunda.js';
import { leerCambios } from './cambios-ia.js';
import { leerTrabajos, gastoChatMicro } from './pidele.js';
import { gastoDibujosMicro } from './dibujos-ia.js';
import { leerConfigIa } from '../ia/config.js';
import { gastoMicro } from '../ia/gasto.js';
import { elegirProveedor } from '../ia/presupuesto.js';
import { mesCobro } from '../tareas/tiempo.js';

// Lo que falta de los materiales privados. → [{ clave, materia?, tema?, archivo? }]
export function materialesQueFaltan(db, config) {
  const dir = carpetaFuentes(config);
  const out = [];
  const f = estadoFuentes(db);
  if (!f?.ok) { out.push({ clave: 'sin_fuentes' }); return out; }
  let man = null;
  try { man = leerManifiesto(dir); } catch { man = null; }
  if (!man) { out.push({ clave: 'sin_manifiesto' }); return out; }
  const presentes = new Set(man.materias.map(m => m.id));
  for (const id of MATERIAS) if (id !== 'factores_humanos' && !presentes.has(id)) out.push({ clave: 'materia_sin_fuentes', materia: id });
  for (const m of man.materias) {
    for (const t of m.temas) {
      if (!leerLecturas(dir, t).partes.length) out.push({ clave: 'tema_sin_libro', materia: m.id, tema: t.titulo });
      if (t.tg.length && !(preguntasDeTema(dir, m.id, t.id) ?? []).length) out.push({ clave: 'tema_sin_tg', materia: m.id, tema: t.titulo });
      for (const img of imagenesDeTema(dir, m.id, t.id) ?? []) if (img.archivo && !existsSync(join(dir, img.archivo))) out.push({ clave: 'foto_no_esta', materia: m.id, archivo: img.archivo });
    }
  }
  const oral = leerFuenteOral(dir);
  if (!oral.hay) out.push({ clave: 'sin_oral' });
  else if (!oral.ok) out.push({ clave: 'oral_con_errores', n: (oral.errores ?? []).length });
  // Lo publicado que la mejora profunda (y los pedidos del chat) no pueden mejorar por no tener su libro.
  let plan = [];
  try { plan = planProfundo(db, config, { man, fuenteOral: oral.hay && oral.ok ? oral : null }); } catch { plan = []; }
  for (const x of plan) if (x.estado === 'sin_fuentes' && publicado(db, config, x.id)) out.push({ clave: 'publicada_sin_libro', materia: x.id });
  return out.slice(0, 80);
}

export function vistaLoQueHizo(db, config, ahora = Date.now()) {
  const cfg = leerConfigFabrica(db);
  const cfgIa = leerConfigIa(db);
  let fab = null;
  try { fab = vistaFabrica(db, config, ahora); } catch { fab = null; }
  const lector = crearLector(config);
  const estadoDe = id => {
    const e = estadoMateria(db, id);
    if (['escribiendo', 'verificando'].includes(e.estado)) return 'en_curso';
    if (e.estado === 'revision') return 'revision';
    if (e.estado === 'publicada' || e.estado === 'ya_publicada' || publicado(db, config, id, lector)) return 'hecha';
    return 'pendiente';
  };
  const contar = ids => {
    const estados = ids.map(estadoDe);
    return { total: ids.length, hechas: estados.filter(x => x === 'hecha').length, enCurso: estados.filter(x => x === 'en_curso').length, revision: estados.filter(x => x === 'revision').length, pendientes: estados.filter(x => x === 'pendiente').length };
  };
  const trabajos = leerTrabajos(db);
  const temasMejorados = [...MATERIAS, ...MATERIAS_ORAL].reduce((s, id) => s + (estadoProfunda(db, id).temasMejorados ?? 0), 0) + trabajos.filter(j => j.tipo === 'reescribir_tema' && j.estado === 'hecho').length;
  let preguntas = { tg: 0, conExplicacion: 0 };
  try {
    const p = paqueteActivo(db, config);
    const lista = p ? [...(p.preguntas?.values?.() ?? [])] : [];
    const tg = lista.filter(q => q.origen === 'test_guide');
    preguntas = { tg: tg.length, conExplicacion: tg.filter(q => typeof q.sencilla === 'string' && q.sencilla.trim()).length };
  } catch { /* sin paquete */ }
  const dudasEsperando = [...MATERIAS, ...MATERIAS_ORAL].reduce((s, id) => {
    const e = estadoMateria(db, id);
    const pr = estadoProfunda(db, id);
    return s + (e.estado === 'revision' ? (e.dudas ?? []).length : 0) + (pr.estado === 'revision' ? (pr.dudas ?? []).length : 0);
  }, 0) + trabajos.filter(j => j.estado === 'revision').reduce((s, j) => s + (j.dudas ?? []).length, 0);
  const mes = mesCobro(ahora);
  const dinero = {
    mesMicro: gastoMicro(db, { mes }), topeMesMicro: cfgIa.topeGeneralMicro,
    fabricaMicro: gastoFabricaMicro(db), fabricaTopeMicro: cfg.topeMicro,
    profundaMicro: gastoProfundaMicro(db), profundaTopeMicro: cfg.profunda.topeMicro,
    chatMicro: gastoChatMicro(db), chatTopeMicro: cfg.chat.topeMicro,
    dibujosMicro: gastoDibujosMicro(db), dibujosTopeMicro: cfg.dibujos.topeMicro,
    mejoraMesMicro: gastoMejoraMesMicro(db, ahora), mejoraTopeMicro: cfg.mejora.topeMesMicro,
  };
  const eleccion = cfgIa.encendida ? elegirProveedor(db, config, cfgIa, ahora) : { ok: false, motivo: 'ia_apagada' };
  const materiales = materialesQueFaltan(db, config);
  const falta = [];
  if (!cfgIa.encendida) falta.push({ clave: 'ia_apagada' });
  else if (!eleccion.ok) falta.push({ clave: 'sin_proveedor', motivo: eleccion.motivo });
  if (cfg.pausada) falta.push({ clave: 'pausada' });
  for (const m of fab?.materias ?? []) {
    if (m.estado === 'revision') falta.push({ clave: 'revision', materia: m.id, num: m.num, nombre: m.nombre, n: m.dudas });
    else if (!['publicada', 'ya_publicada'].includes(m.estado)) falta.push({ clave: 'materia_falta', materia: m.id, num: m.num, nombre: m.nombre, pct: m.pct, temas: m.faltan.length });
  }
  if (fab?.oral?.hay && !fab.oral.activa) falta.push({ clave: 'oral_apagada' });
  for (const c of fab?.oral?.activa ? fab.oral.capitulos : []) {
    if (c.estado === 'revision') falta.push({ clave: 'revision', materia: c.id, num: c.num, nombre: c.nombre, n: c.dudas });
    else if (!['publicada', 'ya_publicada'].includes(c.estado)) falta.push({ clave: 'capitulo_falta', materia: c.id, num: c.num, nombre: c.nombre, pct: c.pct });
  }
  if (fab?.profunda && !fab.profunda.activa && fab.profunda.falta.temas) falta.push({ clave: 'profunda_apagada', temas: fab.profunda.falta.temas });
  for (const j of trabajos) if (j.estado === 'revision') falta.push({ clave: 'pedido_revision', materia: j.materia, nombre: j.temaTitulo ?? j.materiaNombre });
  for (const x of materiales.slice(0, 20)) falta.push({ ...x, clave: `material_${x.clave}` });
  return {
    numeros: {
      tg: contar([...MATERIAS]), oral: contar([...MATERIAS_ORAL]), temasMejorados, preguntas, dudasEsperando, dinero,
      etaMs: (fab?.etaMs ?? 0) + (fab?.profunda?.activa ? fab.profunda.falta.etaMs : 0), faltaMicro: (fab?.faltaMicro ?? 0) + (fab?.profunda?.activa ? fab.profunda.falta.micro : 0),
      proveedor: eleccion.ok ? eleccion.proveedor : null, modelo: eleccion.ok ? eleccion.modelo : null, pausada: cfg.pausada,
    },
    cambios: leerCambios(db).slice(-200).reverse(),
    falta: falta.slice(0, 60),
    materiales,
  };
}
