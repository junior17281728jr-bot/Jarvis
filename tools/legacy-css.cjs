// Convierte el CSS moderno de JARVIS en uno que entiendan las TVs viejas (motor Chromium 47, de 2017):
//  - CSS grid (no existe ahí) → flexbox con anchos calculados
//  - gap (no existe en flexbox viejo) → márgenes en los hijos
//  - inset, place-items, max(), aspect-ratio → equivalentes antiguos
// No es perfecto para todo, pero deja las pantallas ordenadas y completas.
'use strict';

function splitTop(s, sep) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === sep && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur); return out; }
function tokens(s) { const out = []; let d = 0, cur = ''; for (const ch of s.trim()) { if (ch === '(') d++; if (ch === ')') d--; if (/\s/.test(ch) && d === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
const half = v => /^0(px)?$/.test(v) ? '0px' : `calc(${v} / 2)`;
const neg = v => /^0(px)?$/.test(v) ? '0px' : `calc(${v} / -2)`;

/** Columnas de grid → lista de pistas: {fr:n} | {min:'320px', auto:true (auto-fit)} | {auto:true} | {fixed:'200px'} */
function tracks(gtc) {
  gtc = gtc.replace(/!important/, '').trim();
  const m = /^repeat\(\s*(auto-fit|auto-fill)\s*,\s*minmax\(\s*([^,]+),\s*[^)]+\)\s*\)$/.exec(gtc);
  if (m) return { autofit: m[2].trim() };
  const list = [];
  for (const t of tokens(gtc)) {
    const r = /^repeat\(\s*(\d+)\s*,\s*(.+)\)$/.exec(t);
    if (r) { for (let i = 0; i < Number(r[1]); i++) list.push(...trackOf(r[2].trim())); continue; }
    list.push(...trackOf(t));
  }
  return { list };
  function trackOf(t) {
    const mm = /^minmax\(\s*([^,]+),\s*(.+)\)$/.exec(t); if (mm) t = mm[2].trim();
    const fr = /^([\d.]+)fr$/.exec(t); if (fr) return [{ fr: Number(fr[1]) }];
    if (t === 'auto' || t === 'max-content' || t === 'min-content') return [{ auto: true }];
    return [{ fixed: t }];
  }
}

function declMap(body) {
  const list = splitTop(body, ';').map(d => { const i = d.indexOf(':'); return i < 0 ? null : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]; }).filter(Boolean);
  return list;
}

/** Devuelve las reglas extra (texto CSS) y las declaraciones reemplazadas para una regla. */
function convertRule(sel, body) {
  const decls = declMap(body), get = k => { const d = decls.filter(x => x[0] === k).pop(); return d ? d[1] : null; };
  const extra = [], out = [];
  const disp = get('display'), gap = get('gap') || [get('row-gap'), get('column-gap')].filter(Boolean).join(' ') || null;
  const [rg, cg] = gap ? (tokens(gap.replace('!important', '')).length > 1 ? tokens(gap) : [gap.replace('!important', '').trim(), gap.replace('!important', '').trim()]) : [null, null];
  const isGrid = disp && /grid/.test(disp), gtc = get('grid-template-columns');
  const column = (get('flex-direction') || '').startsWith('column');
  const sels = splitTop(sel, ',').map(s => s.trim());
  const kids = suffix => sels.map(s => `${s}>${suffix}`).join(',');
  for (const [k, v] of decls) {
    if (k === 'inset') { const t = tokens(v.replace('!important', '')); const [a, b = a, c = a, d = b] = t; out.push(`top:${a}`, `right:${b}`, `bottom:${c}`, `left:${d}`); continue; }
    if (k === 'place-items') { const [a, b = a] = tokens(v); out.push(`align-items:${a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : a}`, `justify-content:${b === 'start' ? 'flex-start' : b === 'end' ? 'flex-end' : b}`); continue; }
    if (k === 'aspect-ratio') continue;
    if (k === 'grid-column' && /1\s*\/\s*-1|span\s+\d{2}/.test(v)) { out.push('width:100%', 'flex-basis:100%', 'max-width:100%'); continue; }
    if (k === 'display' && isGrid) continue; // se reemplaza abajo
    if (/^grid-|^gap$|^row-gap$|^column-gap$/.test(k)) continue;
    if (/max\(|min\(|clamp\(/.test(v)) { const fixed = v.replace(/max\(\s*([^,()]+)\s*,[^()]*(\([^()]*\))?[^()]*\)/g, '$1').replace(/min\(\s*([^,()]+)\s*,[^()]*(\([^()]*\))?[^()]*\)/g, '$1'); out.push(`${k}:${fixed}`); continue; }
    if (k === 'grid-column' && /1\s*\/\s*-1|span\s+\d{2}/.test(v)) { out.push('width:100%', 'flex-basis:100%', 'max-width:100%'); continue; }
    out.push(`${k}:${v}`);
  }
  const imp = /!important/.test(gtc || '') ? ' !important' : '';
  if (isGrid) {
    out.push(`display:${disp.includes('inline') ? 'inline-flex' : 'flex'}`);
    if (gtc) out.push('flex-wrap:wrap', '-webkit-flex-wrap:wrap');
    else {
      out.push('flex-direction:column', 'flex-wrap:nowrap');
      const gtr = get('grid-template-rows');
      if (gtr) { const R = tracks(gtr).list || []; R.forEach((t, i) => extra.push(`${kids(`:nth-last-child(${R.length - i})`)}{${t.fr ? `-webkit-flex:${t.fr} 1 0%;flex:${t.fr} 1 0%;min-height:0` : 'flex:0 0 auto'}}`)); }
    }
  }
  // gap → márgenes. Sin márgenes negativos abajo/arriba (anulaban el espacio entre filas y dejaban todo pegado):
  //  - columna: margen arriba a cada hijo menos el primero
  //  - fila que no se parte: margen a la izquierda a cada hijo menos el primero
  //  - fila que se parte (wrap): medio margen a cada lado + margen abajo
  const flexy = isGrid || (disp && /flex/.test(disp)) || (!disp && gap);
  const wraps = /wrap/.test(get('flex-wrap') || '') && !/nowrap/.test(get('flex-wrap') || '');
  const T0 = gtc ? tracks(gtc) : null, nCols = T0 && T0.list ? T0.list.length : 0;
  if (gap && flexy) {
    if ((isGrid && !gtc) || column) extra.push(`${kids('*+*')}{margin-top:${rg}}`);
    else if (gtc && nCols && !T0.list.some(t => t.auto)) {
      extra.push(`${kids('*')}{margin-left:${half(cg)};margin-right:${half(cg)}}`, `${kids(`*:nth-child(n+${nCols + 1})`)}{margin-top:${rg}}`);
      out.push(`margin-left:${neg(cg)}`, `margin-right:${neg(cg)}`);
    } else if (gtc && nCols) extra.push(`${kids('*+*')}{margin-left:${cg}}`);
    else if (isGrid || wraps) { extra.push(`${kids('*')}{margin-left:${half(cg)};margin-right:${half(cg)};margin-bottom:${rg}}`); out.push(`margin-left:${neg(cg)}`, `margin-right:${neg(cg)}`); }
    else extra.push(`${kids('*+*')}{margin-left:${cg}}`);
  }
  // columnas
  if (gtc) {
    const g = cg || '16px', T = tracks(gtc);
    if (T.autofit) extra.push(`${kids('*')}{-webkit-flex:1 1 ${T.autofit};flex:1 1 ${T.autofit};min-width:0;max-width:100%${imp}}`);
    else if (T.list.length === 1 && T.list[0].fr) extra.push(`${kids('*')}{width:calc(100% - ${g})${imp};flex:0 0 auto${imp}}`);
    else if (T.list.some(t => t.auto)) { out.push('flex-wrap:nowrap'); T.list.forEach((t, i) => extra.push(`${kids(`:nth-child(${T.list.length}n+${i + 1})`)}{${t.fr ? `flex:${t.fr} 1 0%;min-width:0` : t.auto ? 'flex:0 0 auto' : `flex:0 0 ${t.fixed}`}${imp}}`)); }
    else {
      const sum = T.list.reduce((a, t) => a + (t.fr || 0), 0), fixed = T.list.filter(t => t.fixed).map(t => t.fixed);
      T.list.forEach((t, i) => {
        const w = t.fixed ? t.fixed : fixed.length ? `calc((100% - ${fixed.join(' - ')}) * ${(t.fr / sum).toFixed(5)} - ${g} - 1px)` : `calc(${(t.fr / sum * 100).toFixed(4)}% - ${g} - 1px)`; // 1px de holgura: el redondeo no los manda a otra fila
        extra.push(`${kids(`:nth-child(${T.list.length}n+${i + 1})`)}{flex:0 0 auto${imp};width:${w}${imp};min-width:0}`);
      });
    }
  }
  return { decl: out.join(';'), extra };
}

/** Recorre el CSS (con @media y @keyframes) y convierte cada regla. */
function convertCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0, out = '';
  function block(endAtBrace) {
    let res = '';
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; if (endAtBrace) return res; continue; }
      if (open === -1) break;
      const sel = css.slice(i, open).trim(); i = open + 1;
      if (sel.startsWith('@media') || sel.startsWith('@supports')) { res += `${sel}{${block(true)}}`; continue; }
      if (sel.startsWith('@keyframes') || sel.startsWith('@-webkit-keyframes') || sel.startsWith('@font-face')) { let d = 1, j = i; while (d && j < css.length) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; } res += `${sel}{${css.slice(i, j - 1)}}`; i = j; continue; }
      const end = css.indexOf('}', i), body = css.slice(i, end); i = end + 1;
      if (/:has\(/.test(sel)) continue;
      const r = convertRule(sel, body);
      res += `${sel}{${r.decl}}` + r.extra.join('');
    }
    return res;
  }
  out = block(false);
  // Base para la TV: el contenedor del Modo TV ocupa toda la pantalla
  out += '.tv{top:0;right:0;bottom:0;left:0;width:100%;height:100%}.tv .body{flex-wrap:nowrap;overflow:hidden}.tv .body>*{height:100%;overflow:hidden}.tv .col>*{-webkit-flex-shrink:1;flex-shrink:1;min-height:0}';
  return out;
}

module.exports = { convertCss, convertRule, tracks };
