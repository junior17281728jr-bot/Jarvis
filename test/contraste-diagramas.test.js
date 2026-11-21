// 0.14.94: los diagramas con datos (public/clase/diagramas.js) y los dibujos de aviación se leen en claro Y en oscuro.
// Lo reportó el dueño: en oscuro, «Mínimos VFR: la tabla» y «¿Qué mínimos aplican aquí?» salían con el panel casi blanco
// y las letras claras. La causa: el fondo era var(--fondo-suave, #eef5ff), una variable que ninguna hoja define (quedaba
// siempre el celeste claro), y el texto var(--texto), que en oscuro es claro. Esta prueba lee el CSS de verdad (sin
// navegador), resuelve las variables de cada tema y mide el contraste (WCAG AA: 4.5:1) de cada regla con texto.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = r => readFileSync(new URL(`../public/${r}`, import.meta.url), 'utf8');
const HOJAS = ['estilos.css', 'clase/clase.css', 'academia.css', 'instructor.css', 'alumnos.css', 'interfaz.css'];

// [{ selector, decl: Map }] de una hoja (las reglas dentro de @media también, sin su @media).
export function reglas(css) {
  const sin = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  for (const m of sin.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/^@media[^{]*$/, '').trim();
    const decl = new Map();
    for (const d of m[2].split(';')) { const i = d.indexOf(':'); if (i > 0) decl.set(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
    out.push({ selector, decl });
  }
  return out;
}
// Las variables de cada tema. tema.js siempre pone data-tema="claro" u "oscuro" (nunca deja «auto»): esas reglas no cuentan.
export function variables(todas) {
  const claro = new Map();
  const oscuro = new Map();
  const definidas = new Set();
  const esRaiz = s => /^:root$|\.clase-visual|\.clase-raiz/.test(s.replace(/\[data-tema="oscuro"\]/g, ''));
  for (const { selector, decl } of todas) {
    for (const k of decl.keys()) if (k.startsWith('--')) definidas.add(k);
    if (/data-tema="auto"|:not\(\[data-tema\]\)/.test(selector) || !esRaiz(selector)) continue;
    const enOscuro = selector.includes('[data-tema="oscuro"]');
    for (const [k, v] of decl) if (k.startsWith('--')) { if (!enOscuro) claro.set(k, v); oscuro.set(k, v); }
  }
  // Lo de oscuro manda en oscuro aunque venga antes en el archivo (como en el navegador, por especificidad).
  for (const { selector, decl } of todas) {
    if (!selector.includes('[data-tema="oscuro"]') || /data-tema="auto"/.test(selector) || !esRaiz(selector)) continue;
    for (const [k, v] of decl) if (k.startsWith('--')) oscuro.set(k, v);
  }
  return { claro, oscuro, definidas };
}
// Resuelve var(--x, respaldo) con las variables del tema. Una variable que NINGUNA hoja define es un error (así nació
// este problema: el respaldo claro quedaba en los dos temas). → { valor, sinDefinir: [nombres] }
export function resolver(valor, tema, definidas, sinDefinir = []) {
  let v = String(valor);
  for (let k = 0; k < 20 && v.includes('var('); k++) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/, (_, nombre, resp) => {
      if (!definidas.has(nombre)) sinDefinir.push(nombre);
      return tema.get(nombre) ?? (resp ?? '').trim();
    });
  }
  return { valor: v.trim(), sinDefinir };
}
const hex = v => { const m = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(v); if (!m) return null; const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]; return `#${h.toLowerCase()}`; };
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Revisa los diagramas de unas hojas: → [problema] (vacía = todo se lee).
export function revisarDiagramas(textos) {
  const todas = textos.flatMap(reglas);
  const { claro, oscuro, definidas } = variables(todas);
  const mal = [];
  const de = sel => todas.filter(r => r.selector.split(',').map(s => s.trim()).includes(sel));
  const prop = (sel, p) => de(sel).map(r => r.decl.get(p)).filter(Boolean).at(-1) ?? null;
  for (const [nombre, tema] of [['claro', claro], ['oscuro', oscuro]]) {
    const r = (v, donde) => { const x = resolver(v, tema, definidas); for (const n of x.sinDefinir) mal.push(`${donde}: ${n} no está definida en ninguna hoja`); return hex(x.valor); };
    const panel = r(prop('.clase-diagrama', 'background') ?? prop('.clase-diagrama', 'background-color') ?? '', '.clase-diagrama');
    const textoPanel = r(prop('.clase-diagrama', 'color') ?? '', '.clase-diagrama');
    if (!panel || !textoPanel) { mal.push(`${nombre}: el panel .clase-diagrama no tiene fondo o color propio`); continue; }
    // Cada regla de un diagrama que pone color de texto (o fill de un <text>): contra su propio fondo, o el del panel.
    for (const { selector, decl } of todas) {
      if (/data-tema|prefers/.test(selector)) continue;
      for (const s of selector.split(',').map(x => x.trim()).filter(x => /^\.clase-diagrama/.test(x))) {
        const fondoPropio = decl.get('background') ?? decl.get('background-color');
        const fondo = fondoPropio ? r(fondoPropio, s) : panel;
        const esTexto = !/\b(rect|line)\b|barra/.test(s);
        for (const p of ['color', ...(/\btext\b|rotulo/.test(s) ? ['fill'] : [])]) {
          const v = decl.get(p);
          if (!v || !esTexto) continue;
          if (/currentColor/i.test(v)) { if (contraste(textoPanel, fondo) < 4.5) mal.push(`${nombre} ${s} ${p}: ${textoPanel} sobre ${fondo}`); continue; }
          const c = r(v, s);
          // El nombre de una capa va DENTRO de su rectángulo de color fijo: se mide contra cada relleno de capa.
          const fondos = /^\.clase-diagrama-capa text:not\(/.test(s)
            ? todas.filter(x => /^\.clase-diagrama-capa(-\d)? rect$/.test(x.selector.trim()) || /\.clase-diagrama-capa-\d rect/.test(x.selector)).map(x => hex(x.decl.get('fill') ?? '')).filter(Boolean)
            : [fondo];
          for (const f of fondos) if (!c || !f || contraste(c, f) < 4.5) mal.push(`${nombre} ${s} ${p}: ${c} sobre ${f} (${c && f ? contraste(c, f).toFixed(2) : '?'}:1)`);
        }
      }
    }
    // El panel: nunca fondo claro con texto claro (ni oscuro con oscuro).
    if (contraste(textoPanel, panel) < 4.5) mal.push(`${nombre} .clase-diagrama: ${textoPanel} sobre ${panel}`);
  }
  // Los dibujos de aviación (.clase-dib*): ninguna variable sin definir.
  for (const { selector, decl } of todas) {
    if (!/\.clase-dib|\.clase-diagrama/.test(selector)) continue;
    for (const v of decl.values()) for (const m of v.matchAll(/var\(\s*(--[\w-]+)/g)) if (!definidas.has(m[1])) mal.push(`${selector}: ${m[1]} no está definida en ninguna hoja`);
  }
  return [...new Set(mal)];
}

test('0.14.94: cada diagrama con datos se lee en claro y en oscuro (AA 4.5:1) y no usa variables sin definir', () => {
  const mal = revisarDiagramas(HOJAS.map(leer));
  assert.deepEqual(mal, []);
});

test('0.14.94: la prueba de contraste atrapa el error de antes (fondo con --fondo-suave, que no existe, y texto con --texto)', () => {
  const antes = leer('clase/clase.css').replace(/\.clase-diagrama \{[^}]*\}/, '.clase-diagrama { margin: 0; padding: 14px 16px; background: var(--fondo-suave, #eef5ff); color: var(--texto, #10233f); display: grid; }');
  const mal = revisarDiagramas(HOJAS.map(h => (h === 'clase/clase.css' ? antes : leer(h))));
  assert.ok(mal.some(x => x.includes('--fondo-suave no está definida')), mal.join('\n'));
  assert.ok(mal.some(x => /^oscuro \.clase-diagrama: #e7ecf5 sobre #eef5ff/.test(x)), mal.join('\n'));
});

test('0.14.94: la cabeza de la tabla, el número y el resultado (colores fijos) llevan texto blanco con 4.5:1 o más', () => {
  const css = reglas(leer('clase/clase.css'));
  for (const sel of ['.clase-diagrama-tabla thead th', '.clase-diagrama-numero', '.clase-diagrama-resultado']) {
    const r = css.find(x => x.selector === sel);
    assert.ok(r, sel);
    assert.ok(contraste(hex(r.decl.get('color')), hex(r.decl.get('background'))) >= 4.5, sel);
  }
});

test('0.14.94: el marco de un diagrama no lleva la misma clase que su lista o tabla (antes «partes» salía en dos columnas y sin relleno)', async () => {
  const fuente = leer('clase/diagramas.js');
  assert.match(fuente, /clase-diagrama-tipo-\$\{tipo\}/);
  assert.doesNotMatch(fuente, /clase-diagrama clase-diagrama-\$\{tipo\}/);
});

test('0.14.94: el traductor del navegador no toca las clases (translate="no" y notranslate)', () => {
  const html = leer('index.html');
  assert.match(html, /<html[^>]*\btranslate="no"/);
  assert.match(html, /<meta name="google" content="notranslate">/);
});
