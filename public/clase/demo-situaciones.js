// 0.14.92: galería de las situaciones 3D (demo-situaciones.html). ?situacion=clase-c para ver una sola; para las
// capturas: ?fase=decision (la pregunta), ?opcion=entrar&t=8 (la consecuencia en ese segundo), ?vista=1p|3p y
// ?motor=2d. «Siguiente» lleva a la situación que sigue.
import { montarSituacion3d } from './situacion3d.js';
import { SITUACIONES } from './e3d-situaciones.js';

export const EJEMPLOS = Object.keys(SITUACIONES).map(situacion => ({ situacion }));

async function iniciar() {
  const q = new URLSearchParams(location.search);
  const raiz = document.documentElement;
  if (q.get('tema')) raiz.dataset.tema = q.get('tema');
  const idioma = q.get('idioma') === 'en' ? 'en' : 'es';
  raiz.lang = idioma;
  let catalogo = {};
  try { catalogo = await (await fetch(`../i18n/${idioma}.json`)).json(); } catch { catalogo = {}; }
  const t = (clave, v = {}) => String(catalogo[clave] ?? clave).replace(/\{(\w+)\}/g, (_, n) => (n in v ? String(v[n]) : `{${n}}`));
  const ir = cambio => { const u = new URL(location.href); for (const [k, v] of Object.entries(cambio)) u.searchParams.set(k, v); location.href = u.href; };
  document.querySelectorAll('.demo-tema [data-tema]').forEach(b => b.addEventListener('click', () => ir({ tema: b.dataset.tema })));
  document.querySelectorAll('.demo-tema [data-idioma]').forEach(b => b.addEventListener('click', () => ir({ idioma: b.dataset.idioma })));
  const galeria = document.getElementById('galeria');
  const sola = q.get('situacion');
  const montadas = [];
  const decisiones = [];
  galeria.addEventListener('clase-decision', e => decisiones.push(e.detail));
  galeria.addEventListener('clase-siguiente', e => {
    const ids = Object.keys(SITUACIONES), i = ids.indexOf(e.detail.situacion);
    if (sola && i + 1 < ids.length) ir({ situacion: ids[i + 1] });
  });
  for (const p of EJEMPLOS) {
    if (sola && sola !== p.situacion) continue;
    const seccion = document.createElement('section');
    seccion.className = 'demo-seccion';
    seccion.id = p.situacion;
    const hueco = document.createElement('div');
    hueco.className = 'demo-hueco';
    seccion.appendChild(hueco);
    montadas.push(montarSituacion3d(hueco, p, { modo: 'interactivo', t, motor: q.get('motor') }));
    const pre = document.createElement('pre');
    pre.className = 'demo-json';
    pre.textContent = JSON.stringify({ tipo: 'situacion-3d', parametros: p });
    seccion.appendChild(pre);
    galeria.appendChild(seccion);
  }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const num = k => (q.get(k) != null ? Number(q.get(k)) : null);
  for (const api of montadas) {
    if (q.get('opcion')) api.fijar({ opcion: q.get('opcion'), tiempo: num('t'), vista: q.get('vista') });
    else if (q.get('fase') === 'decision') { api.fijar({ vista: q.get('vista') }); api.mostrarDecision(); }
    else if (q.get('pausa') === '1') api.fijar({ tiempo: num('t') ?? 4, vista: q.get('vista') });
  }
  window.__sit = montadas;
  window.__decisiones = decisiones;
  document.body.dataset.listo = '1';
}
if (typeof document !== 'undefined' && typeof location !== 'undefined') iniciar();
