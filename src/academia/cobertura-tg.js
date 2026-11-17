// Academia 0.14.17 (pedido del dueño: «que no falte nada del Test Guide»): la cobertura del Test Guide, revisada en CÓDIGO
// (sin IA). Para cada pregunta del Test Guide de lo publicado (las 11 materias), su tema tiene que tener una tarjeta que
// enseñe el dato de la respuesta correcta: una tarjeta «Para el Test Guide» que la nombra por su número («5-1: …») o
// cualquier tarjeta del tema que dice la respuesta correcta. Lo que falta se lista (Administrador → Lo que hizo la IA) y
// la revisión final de la mejora profunda lo busca a propósito («falta_tg: <id>») y lo arregla.
import { MATERIAS } from './formato.js';
import { normalizar } from './reto-calidad.js';
import { publicado, crearLector } from './fabrica-profunda.js';
import { leerEnUso } from './paquetes.js';

const textoDe = s => [s.titulo, ...(s.puntos ?? []), s.recuerda, s.ejemplo, s.texto, s.truco].filter(x => typeof x === 'string').join(' \n ');
const numeroDe = q => String(q.original?.numero ?? String(q.id).replace(/^tg-/, ''));
const correctaDe = q => {
  const o = q.original;
  if (!o) return '';
  if (Array.isArray(o.opciones)) return o.opciones.find(x => x.letra === o.correcta)?.texto ?? '';
  return o.opciones?.[o.correcta] ?? '';
};
const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ¿El tema enseña lo que pide esta pregunta? → true / false (solo código).
export function preguntaCubierta(tema, q) {
  const secciones = (tema.secciones ?? []).filter(s => s.tipo === 'tarjeta' || typeof s.texto === 'string');
  const num = numeroDe(q);
  const porNumero = new RegExp(`(^|[^0-9-])${escapar(num)}(?![0-9])`);
  if (secciones.some(s => /Test Guide/i.test(String(s.titulo ?? '')) && porNumero.test(textoDe(s)))) return true;
  const correcta = normalizar(correctaDe(q)).replace(/[.,;:]+$/g, '').trim();
  if (correcta.length < 2) return false;
  const todo = normalizar(secciones.map(textoDe).join(' \n '));
  if (todo.includes(correcta)) return true;
  // Dicho con otras palabras («Igual que durante el día» por «La misma que durante el día»): sus números todos y al
  // menos el 60 % de sus palabras con contenido (4 letras o más) están en las tarjetas del tema.
  const numeros = correcta.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numeros.some(n => !todo.includes(n))) return false;
  const palabras = [...new Set(correcta.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4))];
  if (!palabras.length) return numeros.length > 0;
  const hay = new Set(todo.split(/[^\p{L}\p{N}]+/u));
  return palabras.filter(w => hay.has(w)).length / palabras.length >= 0.6;
}

// → { total, cubiertas, faltan: [{ materia, tema, titulo, id, numero }] }
const MEMORIA = new Map(); // (lista en uso) → el resultado: los paquetes no cambian una vez escritos
export function coberturaTg(db, config) {
  const firma = `${config.raiz ?? ''}|${JSON.stringify(leerEnUso(db))}`;
  if (MEMORIA.has(firma)) return MEMORIA.get(firma);
  const r = calcular(db, config);
  if (MEMORIA.size > 20) MEMORIA.clear();
  MEMORIA.set(firma, r);
  return r;
}
function calcular(db, config) {
  const lector = crearLector(config);
  const out = { total: 0, cubiertas: 0, faltan: [] };
  for (const id of MATERIAS) {
    let pub = null;
    try { pub = publicado(db, config, id, lector); } catch { pub = null; }
    if (!pub) continue;
    for (const t of pub.orden ?? []) {
      for (const qid of t.preguntas ?? []) {
        const q = pub.preguntas.get(qid);
        if (!q || q.origen !== 'test_guide') continue;
        out.total += 1;
        if (preguntaCubierta(t, q)) out.cubiertas += 1;
        else if (out.faltan.length < 200) out.faltan.push({ materia: id, tema: t.id, titulo: t.titulo, id: qid, numero: numeroDe(q) });
      }
    }
  }
  return out;
}
