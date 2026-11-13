// 0.14.2: «Dibujos con IA» (APAGADO por defecto; Administrador → IA → ChatGPT, con su tope propio, US$5, y el estimado
// antes de encenderlo). Solo ChatGPT DIBUJA (la API de imágenes de OpenAI, con el modelo de imagen que el dueño elige de
// la lista); Claude solo MIRA: si Claude funciona, revisa cada dibujo (¿coincide con la tarjeta? ¿etiquetas o números
// mal? ¿algo engañoso?) y uno rechazado nunca se usa.
// Para qué: una tarjeta de una clase YA publicada que no tiene foto del libro, ni clip, ni un dibujo propio (los
// diagramas del código), donde un dibujo simple ayudaría. NUNCA para lo que debe mostrar un dato exacto del libro
// (tablas, números, figuras del Test Guide, mapas, instrumentos con valores): esas tarjetas se saltan por el texto.
// Cada dibujo: WebP de ≤ 200 KB (si no, se descarta), guardado en la carpeta PRIVADA de datos del servidor (nunca en
// git, nunca servida sin pasar por la app), marcado «Dibujo hecho con IA (ilustrativo)». Si la API de imágenes no
// está (sin modelo de imagen, sin ChatGPT, un error), se salta sin hacer ruido.
// Lo que falta (README): ponerlos en una versión nueva del paquete (hoy quedan guardados, aprobados y listados).
// Este archivo NO importa el camino pagado: recibe ctx.ia del trabajador.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { MATERIAS, MATERIAS_ORAL } from './formato.js';
import { carpetaAcademia, leerAjuste, guardarAjuste } from './paquetes.js';
import { crearLector, publicado } from './fabrica-profunda.js';
import { GASTO_SQL } from '../ia/gasto.js';
import { PROPOSITOS, PROPOSITOS_DIBUJO } from '../ia/propositos.js';
import { leerConfigIa } from '../ia/config.js';
import { elegirProveedor, modelosDe } from '../ia/presupuesto.js';
import { anotarCambio } from './cambios-ia.js';

export const D = Object.freeze({ maxBytes: 200 * 1024, porMateria: 3, costoMicro: 15_000, revisarMicro: 1_500 });
export const ETIQUETA = 'Dibujo hecho con IA (ilustrativo)';
const AJUSTE = 'fabrica.dibujos.hechos';
const iso = ms => new Date(ms).toISOString();
const corto = t => createHash('sha256').update(String(t)).digest('hex').slice(0, 16);
// Lo que debe mostrar un dato exacto del libro: nunca un dibujo inventado.
const EXACTO = /\b(tabla|carta|mapa|figura|gr[aá]fic|instrumento|altímetro|velocímetro|horizonte|brújula|frecuencia|metar|taf|notam|peso y balance|densidad|fórmula|cálculo|\d)/i;
const FIJA = /^(Para el Test Guide|Qué vas a aprender|Resumen|¿Te acuerdas\?|¿Qué es y por qué importa\?|Otra vez)/i;

export const carpetaDibujos = config => join(carpetaAcademia(config), 'dibujos-ia');
export function hechos(db) {
  try { const v = JSON.parse(leerAjuste(db, AJUSTE) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function gastoDibujosMicro(db) {
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE proposito IN (${PROPOSITOS_DIBUJO.map(() => '?').join(', ')})`).get(...PROPOSITOS_DIBUJO).g;
}

// Las tarjetas que podrían llevar un dibujo (sin foto, sin clip, sin dibujo propio, sin datos exactos), por materia.
export function candidatas(db, config, { lector = crearLector(config) } = {}) {
  const ya = hechos(db);
  const out = [];
  for (const materia of [...MATERIAS, ...MATERIAS_ORAL]) {
    const pub = publicado(db, config, materia, lector);
    if (!pub) continue;
    let n = 0;
    for (const t of pub.orden) {
      for (const s of t.secciones ?? []) {
        if (s.tipo !== 'tarjeta' || s.imagen || s.clip || FIJA.test(String(s.titulo ?? ''))) continue;
        if (s.visual && !['titulo', 'cartel'].includes(s.visual.tipo)) continue;
        const texto = [s.titulo, ...(s.puntos ?? [])].join(' ');
        if (EXACTO.test(texto)) continue;
        const id = corto(`${materia}|${t.id}|${s.titulo}`);
        if (n >= D.porMateria) break;
        n += 1;
        if (!ya[id]) out.push({ id, materia, tema: t.id, titulo: String(s.titulo).slice(0, 200), puntos: (s.puntos ?? []).slice(0, 4).map(p => String(p).slice(0, 200)) });
      }
      if (n >= D.porMateria) break;
    }
  }
  return out;
}

// Lo que costaría (antes de encenderlo): cuántas tarjetas y cuánto, con lo típico de un dibujo y su revisión.
export function estimadoDibujos(db, config) {
  let n = 0;
  try { n = candidatas(db, config).length; } catch { n = 0; }
  return { tarjetas: n, micro: n * (D.costoMicro + D.revisarMicro), gastoMicro: gastoDibujosMicro(db), hechos: Object.values(hechos(db)).filter(x => x.estado === 'aprobado').length };
}

// ¿Es un WebP de verdad y pequeño?
export function webpBueno(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 30 && buf.length <= D.maxBytes && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
}

const ESQUEMA_REVISAR = Object.freeze({
  type: 'object', additionalProperties: false, required: ['usar', 'problemas'],
  properties: { usar: { type: 'boolean' }, problemas: { type: 'array', items: { type: 'string' } } },
});

// UN paso: el próximo dibujo (o su revisión). → { trabajo: false, motivo } (no hay nada que hacer, sin gastar) o
// { trabajo: true, seguir }. cfg: la configuración de la fábrica.
export async function dibujar(ctx, { ahora, cfg }) {
  const { db, config } = ctx;
  if (!cfg.dibujos?.activa) return { trabajo: false, motivo: 'apagado' };
  if (gastoDibujosMicro(db) + PROPOSITOS.dibujo_generar.maximoMicro > cfg.dibujos.topeMicro) return { trabajo: false, motivo: 'tope_dibujos' };
  const cfgIa = leerConfigIa(db);
  const def = PROPOSITOS.dibujo_generar;
  if (!elegirProveedor(db, config, cfgIa, ahora, modelosDe(def, cfgIa), def).ok) return { trabajo: false, motivo: 'sin_dibujante' };
  const ya = hechos(db);
  const anotar = (id, valor) => ctx.escribir(() => guardarAjuste(db, AJUSTE, JSON.stringify({ ...hechos(db), [id]: { ...(hechos(db)[id] ?? {}), ...valor, en: iso(ahora) } })));
  // 1. Un dibujo hecho que espera la revisión de Claude.
  const pendiente = Object.entries(ya).find(([, x]) => x.estado === 'hecho');
  if (pendiente) {
    const [id, x] = pendiente;
    const ruta = join(carpetaDibujos(config), x.archivo);
    if (!existsSync(ruta)) { await anotar(id, { estado: 'descartado', motivo: 'archivo_no_esta' }); return { trabajo: true, seguir: true }; }
    const defR = PROPOSITOS.dibujo_revisar;
    if (!elegirProveedor(db, config, cfgIa, ahora, modelosDe(defR, cfgIa), defR).ok) {
      // Sin Claude no hay quien lo mire: queda aprobado SIN revisión (así lo dice la pantalla).
      await anotar(id, { estado: 'aprobado', revisadoPor: null });
      await ctx.escribir(() => anotarCambio(db, { materia: x.materia, tema: x.tema, que: 'dibujo', estado: 'aprobado', costoMicro: x.costoMicro ?? null, proveedor: x.proveedor, modelo: x.modelo, revisadoPor: null, detalle: x.titulo, ahora }));
      return { trabajo: true, seguir: true };
    }
    const r = await ctx.ia.pedir({
      proposito: 'dibujo_revisar', paso: `d:${id}:revisar`,
      sistema: 'Eres el revisor de una academia de aviación. Miras un dibujo ilustrativo hecho por otra IA para una tarjeta de clase. Responde SOLO con JSON.',
      texto: `La tarjeta dice:\n${JSON.stringify({ titulo: x.titulo, puntos: x.puntos })}\n¿El dibujo coincide con la tarjeta, sin etiquetas ni números equivocados y sin nada que pueda confundir a un alumno de piloto privado? usar=false si hay cualquier duda.`,
      esquema: ESQUEMA_REVISAR, imagenes: [{ tipo: 'image/webp', base64: readFileSync(ruta).toString('base64') }],
    });
    if (r.usada) {
      const estado = r.json.usar ? 'aprobado' : 'rechazado';
      await anotar(id, { estado, revisadoPor: 'anthropic', problemas: r.json.problemas.slice(0, 5).map(p => String(p).slice(0, 200)), revisarMicro: r.costoMicro });
      await ctx.escribir(() => anotarCambio(db, { materia: x.materia, tema: x.tema, que: 'dibujo', estado, costoMicro: (x.costoMicro ?? 0) + (r.costoMicro ?? 0), proveedor: x.proveedor, modelo: x.modelo, revisadoPor: 'anthropic', detalle: x.titulo, ahora }));
    }
    else await anotar(id, { estado: r.motivo === 'ya_cobrada' ? 'rechazado' : 'hecho', motivoEspera: r.motivo });
    return { trabajo: true, seguir: r.usada };
  }
  // 2. Una tarjeta nueva.
  const c = candidatas(db, config)[0];
  if (!c) return { trabajo: false, motivo: 'hecho' };
  const archivo = `dibujo-ia-${c.id}.webp`;
  const r = await ctx.ia.pedir({
    proposito: 'dibujo_generar', paso: `d:${c.id}:dibujo`, sistema: '',
    texto: `Dibujo explicativo MUY simple, estilo pizarra limpia, fondo claro, para una clase de piloto privado en español. Tema: «${c.titulo}». Idea: ${c.puntos.join(' ')} Sin números, sin datos técnicos, sin texto largo (como mucho 3 etiquetas cortas en español). Nada de logos ni marcas.`.slice(0, 3_500),
    guardar: (dbx, json) => {
      const buf = Buffer.from(String(json.b64), 'base64');
      if (!webpBueno(buf)) return { bueno: false, bytes: buf.length };
      mkdirSync(carpetaDibujos(config), { recursive: true });
      const parcial = join(carpetaDibujos(config), `${archivo}.part`);
      writeFileSync(parcial, buf);
      renameSync(parcial, join(carpetaDibujos(config), archivo));
      return { bueno: true, bytes: buf.length };
    },
  });
  if (r.usada && r.guardado?.valor?.bueno) await anotar(c.id, { estado: 'hecho', archivo, materia: c.materia, tema: c.tema, titulo: c.titulo, puntos: c.puntos, etiqueta: ETIQUETA, costoMicro: r.costoMicro, proveedor: r.proveedor, modelo: r.modelo });
  else if (r.usada || ['respuesta_no_valida', 'proveedor_no_usado', 'modelo_no_disponible', 'pedido_no_valido', 'ya_cobrada'].includes(r.motivo)) await anotar(c.id, { estado: 'descartado', motivo: r.usada ? 'no_es_webp_chico' : r.motivo, materia: c.materia, tema: c.tema, titulo: c.titulo });
  else return { trabajo: false, motivo: r.motivo }; // un tope, la clave, la red: se salta en silencio (lo intenta otro día)
  return { trabajo: true, seguir: true };
}
