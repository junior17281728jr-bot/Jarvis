// Academia 0.12.2: los «conceptos» (sub-temas) de cada tema. Un concepto es la TARJETA de la lección que explica una
// pregunta: tarjetaPara (src/academia/instructor.js) con el texto de la pregunta (enunciado, la opción correcta y la
// explicación del Test Guide; nunca la opción que eligió el alumno, para que no cambie con cada respuesta). Las preguntas
// que no se parecen a ninguna tarjeta (menos de MINIMO palabras en común) quedan en el concepto «general» del tema.
// Las preguntas «relacionadas» son las del mismo concepto: «Mi repaso» (src/academia/fallas.js) cuenta los errores así.
// La clave de un concepto es estable entre versiones del paquete: c:<materia>/<tema>/<título de la tarjeta normalizado>.
// Se calcula una vez por paquete (en memoria; nada nuevo en la base).
import { tarjetaPara } from './instructor.js';

const MINIMO = 2;
export const GENERAL = 'general';
const cache = new WeakMap();

export const slugConcepto = titulo => String(titulo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const claveDe = (materia, tema, slug) => `c:${materia}/${tema}/${slug}`;
export const esClaveConcepto = clave => typeof clave === 'string' && /^c:[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9-]+$/.test(clave);
export function partesDeClave(clave) {
  const m = esClaveConcepto(clave) ? clave.match(/^c:([^/]+)\/([^/]+)\/(.+)$/) : null;
  return m ? { materia: m[1], tema: m[2], slug: m[3] } : null;
}

// { porPregunta: Map(id → concepto), porClave: Map(clave → concepto) }; concepto = { clave, materia, tema, temaTitulo,
// temaNumero (el número del tema en su materia), indice (de la tarjeta; -1 = general), titulo, preguntas: [ids] }.
export function conceptosDe(paquete) {
  if (!paquete) return { porPregunta: new Map(), porClave: new Map() };
  const ya = cache.get(paquete);
  if (ya) return ya;
  const porPregunta = new Map();
  const porClave = new Map();
  for (const m of paquete.materias) {
    m.temas.forEach((t, n) => {
      const usados = new Map(); // slug → índice de la tarjeta (dos tarjetas con el mismo título: la segunda lleva su número)
      for (const id of t.preguntas) {
        const q = paquete.preguntas.get(id);
        if (!q) continue;
        const correcta = q.original.opciones?.find(o => o.letra === q.original.correcta)?.texto ?? '';
        const tarjeta = tarjetaPara(t, [q.original.enunciado, correcta, q.original.explicacion].filter(Boolean).join(' '));
        let indice = -1;
        let slug = GENERAL;
        if (tarjeta && tarjeta.coincidencias >= MINIMO) {
          indice = tarjeta.indice;
          slug = slugConcepto(tarjeta.titulo) || `tarjeta-${indice + 1}`;
          if (slug === GENERAL) slug = `${slug}-${indice + 1}`;
          if (usados.has(slug) && usados.get(slug) !== indice) slug = `${slug}-${indice + 1}`;
          usados.set(slug, indice);
        }
        const clave = claveDe(m.id, t.id, slug);
        const c = porClave.get(clave) ?? { clave, materia: m.id, tema: t.id, temaTitulo: t.titulo, temaNumero: n + 1, indice, titulo: indice >= 0 ? (t.secciones[indice]?.titulo ?? '') : '', preguntas: [] };
        c.preguntas.push(id);
        porClave.set(clave, c);
        porPregunta.set(id, c);
      }
    });
  }
  const r = { porPregunta, porClave };
  cache.set(paquete, r);
  return r;
}

export const conceptoDePregunta = (paquete, id) => conceptosDe(paquete).porPregunta.get(id) ?? null;
export const concepto = (paquete, clave) => conceptosDe(paquete).porClave.get(clave) ?? null;
// El nombre que ve el alumno: el título de la tarjeta, o el del tema para el concepto general.
export const nombreConcepto = c => (c ? c.titulo || c.temaTitulo : '');
