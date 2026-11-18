// Academia 0.14.26: «Mis certificados» (#certificados) y los de un alumno para el administrador (#certificados/alumno/<id>).
// Un certificado de RECUERDO (no oficial) por curso terminado: Test Guide y Preparación para el examen oral.
//  - El dibujo es un SVG hecho aquí (createElementNS, nunca se arma código con texto; colores y letras como atributos, sin style=).
//  - «Descargar imagen»: el SVG → data:image/svg+xml (la página solo deja cargar imágenes «data:») → canvas → PNG.
//  - «Guardar como PDF»: se imprime SOLO el certificado, en horizontal (A4 o Carta): al tocar se agrega una hoja de
//    estilos propia (certificado-a4.css o certificado-carta.css, con su @page) y se quita al terminar, así no cambia
//    cómo se imprime lo demás (reporte, contratos).
// El nombre que sale es el de su perfil (nombre para mostrar; si está vacío, su nombre legal), lo da el servidor.
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

const SVG = 'http://www.w3.org/2000/svg';
export const PAPELES = Object.freeze({ a4: { ancho: 1123, alto: 794 }, carta: { ancho: 1056, alto: 816 } });
const COLOR = { fondo: '#fdfaf1', tinta: '#1d2b4f', azul: '#1f3a6e', oro: '#b8892d', oroClaro: '#e3c77a', suave: '#5b6478' };
const LETRA = "Georgia, 'Times New Roman', 'DejaVu Serif', serif";

function svg(etiqueta, atributos = {}, texto = null) {
  const n = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v != null) n.setAttribute(k, String(v));
  if (texto != null) n.textContent = texto;
  return n;
}

// Parte un texto en líneas de «maximo» letras o menos (sin cortar palabras, salvo una más larga que la línea).
export function partirLineas(texto, maximo) {
  const lineas = [];
  let actual = '';
  for (const palabra of String(texto ?? '').split(/\s+/).filter(Boolean)) {
    if (!actual) actual = palabra;
    else if (actual.length + 1 + palabra.length <= maximo) actual += ` ${palabra}`;
    else { lineas.push(actual); actual = palabra; }
    while (actual.length > maximo) { lineas.push(actual.slice(0, maximo)); actual = actual.slice(maximo); }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Las claves de texto de un certificado (las prueba test/certificados.test.js: que existan y quepan).
export const clavesTexto = (curso, variante) => ({ titular: `cert.${curso}.${variante}.titular`, cuerpo: `cert.${curso}.${variante}.texto` });
// 0.14.38: el certificado de una ronda de la Competencia: su titular por banda y la frase (la de la IA si llegó; si no,
// una de las fijas de su banda).
export const fraseCompe = (c, t) => (typeof c.frase === 'string' && c.frase ? c.frase : t(`compe.frase.${c.banda}.${c.variante}`));
export const textosCompe = (c, t) => ({ titular: t(`compe.cert.titular.${c.banda}`), cuerpo: `${t('compe.cert.puntos', { aciertos: c.aciertos, total: c.total })} ${fraseCompe(c, t)}` });

export function fechaLarga(iso, idioma = 'es') {
  try { return new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-DO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santo_Domingo' }).format(new Date(iso)); } catch { return String(iso ?? '').slice(0, 10); }
}

// El logo de la app (public/icono.svg), dibujado aquí mismo: una imagen SVG no puede ir a buscar otro archivo.
function logo(x, y, lado) {
  const g = svg('g', { transform: `translate(${x} ${y}) scale(${lado / 64})` });
  const defs = svg('defs');
  const grad = svg('linearGradient', { id: 'cert-logo-f', x1: 0, y1: 0, x2: 1, y2: 1 });
  grad.append(svg('stop', { offset: 0, 'stop-color': '#1f3fbf' }), svg('stop', { offset: 1, 'stop-color': '#0b6e80' }));
  defs.append(grad);
  g.append(defs,
    svg('rect', { width: 64, height: 64, rx: 15, fill: 'url(#cert-logo-f)' }),
    svg('circle', { cx: 32, cy: 32, r: 17, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': 6.4 }),
    svg('path', { d: 'M32 15a17 17 0 0 1 17 17', fill: 'none', stroke: '#ffffff', 'stroke-width': 6.4, 'stroke-linecap': 'round' }),
    svg('circle', { cx: 32, cy: 32, r: 5.6, fill: '#f59e0b' }));
  return g;
}

// El sello: dos anillos dorados, el texto alrededor, un avión y las cintas.
function sello(cx, cy, r, textoAnillo, centro) {
  const g = svg('g', { class: 'cert-sello' });
  g.append(svg('path', { d: `M${cx - r * 0.45} ${cy + r * 0.6} l-${r * 0.22} ${r * 0.8} l${r * 0.27} -${r * 0.17} l${r * 0.18} ${r * 0.25} l${r * 0.12} -${r * 0.75}z`, fill: COLOR.azul }));
  g.append(svg('path', { d: `M${cx + r * 0.45} ${cy + r * 0.6} l${r * 0.22} ${r * 0.8} l-${r * 0.27} -${r * 0.17} l-${r * 0.18} ${r * 0.25} l-${r * 0.12} -${r * 0.75}z`, fill: COLOR.azul }));
  // Borde dentado (24 puntas).
  const puntas = [];
  for (let k = 0; k < 48; k++) {
    const a = (Math.PI * 2 * k) / 48;
    const rr = k % 2 ? r : r * 1.08;
    puntas.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  g.append(svg('polygon', { points: puntas.join(' '), fill: COLOR.oro }));
  g.append(svg('circle', { cx, cy, r: r * 0.9, fill: COLOR.oroClaro, stroke: COLOR.oro, 'stroke-width': 2 }));
  g.append(svg('circle', { cx, cy, r: r * 0.62, fill: 'none', stroke: COLOR.oro, 'stroke-width': 1.5 }));
  const defs = svg('defs');
  defs.append(svg('path', { id: 'cert-anillo', d: `M${cx - r * 0.76} ${cy} a${r * 0.76} ${r * 0.76} 0 1 1 ${r * 1.52} 0 a${r * 0.76} ${r * 0.76} 0 1 1 -${r * 1.52} 0` }));
  g.append(defs);
  const anillo = svg('text', { 'font-family': LETRA, 'font-size': r * 0.165, 'font-weight': 700, fill: COLOR.azul, 'letter-spacing': 1 });
  anillo.append(svg('textPath', { href: '#cert-anillo', startOffset: '0' }, textoAnillo));
  g.append(anillo);
  // Un avioncito en el centro.
  g.append(svg('path', { d: `M${cx} ${cy - r * 0.42} l${r * 0.07} ${r * 0.3} l${r * 0.33} ${r * 0.17} v${r * 0.08} l-${r * 0.33} -${r * 0.08} l-${r * 0.02} ${r * 0.22} l${r * 0.1} ${r * 0.08} v${r * 0.06} l-${r * 0.15} -${r * 0.04} l-${r * 0.15} ${r * 0.04} v-${r * 0.06} l${r * 0.1} -${r * 0.08} l-${r * 0.02} -${r * 0.22} l-${r * 0.33} ${r * 0.08} v-${r * 0.08} l${r * 0.33} -${r * 0.17}z`, fill: COLOR.azul }));
  g.append(svg('text', { x: cx, y: cy + r * 0.55, 'text-anchor': 'middle', 'font-family': LETRA, 'font-size': r * 0.16, 'font-weight': 700, fill: COLOR.azul }, centro));
  return g;
}

// El certificado entero (un <svg>). c: { curso, codigo, fecha, variante }, nombre, papel: 'a4' | 'carta'.
export function dibujoCertificado(c, nombre, h, { papel = 'a4' } = {}) {
  const { t } = h;
  const { ancho: W, alto: H } = PAPELES[papel] ?? PAPELES.a4;
  const s = svg('svg', { xmlns: SVG, viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'cert-dibujo', role: 'img', 'aria-label': t('cert.aria', { nombre, curso: t(`cert.curso.${c.curso}`) }) });
  s.append(svg('rect', { width: W, height: H, fill: COLOR.fondo }));
  // Un fondo de guilloché suave (líneas onduladas finas).
  const ondas = svg('g', { stroke: COLOR.oroClaro, 'stroke-width': 0.7, fill: 'none', opacity: 0.55 });
  for (let k = 0; k < 14; k++) {
    const y = 120 + k * ((H - 240) / 13);
    let d = `M60 ${y.toFixed(1)}`;
    for (let x = 60; x < W - 100; x += 40) d += ` q10 ${k % 2 ? -7 : 7} 20 0 t20 0`;
    ondas.append(svg('path', { d }));
  }
  s.append(ondas);
  // El borde: azul grueso, dorado fino y las esquinas.
  s.append(svg('rect', { x: 16, y: 16, width: W - 32, height: H - 32, fill: 'none', stroke: COLOR.azul, 'stroke-width': 10 }));
  s.append(svg('rect', { x: 30, y: 30, width: W - 60, height: H - 60, fill: 'none', stroke: COLOR.oro, 'stroke-width': 2 }));
  s.append(svg('rect', { x: 38, y: 38, width: W - 76, height: H - 76, fill: 'none', stroke: COLOR.oro, 'stroke-width': 0.8, 'stroke-dasharray': '2 5' }));
  for (const [x, y, sx, sy] of [[30, 30, 1, 1], [W - 30, 30, -1, 1], [30, H - 30, 1, -1], [W - 30, H - 30, -1, -1]]) {
    const g = svg('g', { transform: `translate(${x} ${y}) scale(${sx} ${sy})`, fill: 'none', stroke: COLOR.oro, 'stroke-width': 2 });
    g.append(svg('path', { d: 'M0 46 Q0 0 46 0' }), svg('path', { d: 'M12 46 Q12 12 46 12' }));
    g.append(svg('circle', { cx: 22, cy: 22, r: 5, fill: COLOR.oro, stroke: 'none' }));
    s.append(g);
  }
  const centro = W / 2;
  const texto = (y, valor, a = {}) => svg('text', { x: centro, y, 'text-anchor': 'middle', 'font-family': LETRA, fill: COLOR.tinta, ...a }, valor);
  // Arriba: el logo y el nombre de la app.
  s.append(logo(centro - 26, 56, 52));
  s.append(texto(134, t('cert.academia').toUpperCase(), { 'font-size': 17, 'letter-spacing': 6, fill: COLOR.azul, 'font-weight': 700 }));
  s.append(texto(184, t('cert.titulo'), { 'font-size': 40, 'font-weight': 700, fill: COLOR.azul, 'letter-spacing': 2 }));
  s.append(svg('line', { x1: centro - 170, y1: 200, x2: centro + 170, y2: 200, stroke: COLOR.oro, 'stroke-width': 1.5 }));
  s.append(texto(228, t('cert.otorga'), { 'font-size': 16, fill: COLOR.suave, 'font-style': 'italic' }));
  // El nombre (más chico si es largo).
  const largo = String(nombre).length;
  // El nombre (hasta 80 letras): más chico si es largo y, si aun así no cabe, apretado al ancho de la línea.
  const tamNombre = largo > 50 ? 26 : largo > 34 ? 32 : largo > 24 ? 38 : 46;
  s.append(texto(282, nombre, { 'font-size': tamNombre, 'font-style': 'italic', 'font-weight': 700, ...(largo * tamNombre * 0.5 > W - 240 ? { textLength: W - 240, lengthAdjust: 'spacingAndGlyphs' } : {}) }));
  s.append(svg('line', { x1: centro - 260, y1: 298, x2: centro + 260, y2: 298, stroke: COLOR.tinta, 'stroke-width': 0.8 }));
  const compe = c.curso === 'compe';
  s.append(texto(326, compe ? t('compe.cert.por', { ronda: c.ronda, titulo: c.titulo }) : t('cert.por', { curso: t(`cert.curso.${c.curso}`) }), { 'font-size': 17 }));
  // El titular y el texto de su variante.
  const k = clavesTexto(c.curso, c.variante);
  const tc = compe ? textosCompe(c, t) : null;
  s.append(texto(366, compe ? tc.titular : t(k.titular), { 'font-size': 21, 'font-weight': 700, fill: COLOR.oro, 'letter-spacing': 1 }));
  const cuerpo = compe ? `${tc.cuerpo} ${t('compe.cert.cierre')}` : `${t(k.cuerpo)} ${t('cert.cierre')}`;
  const lineas = partirLineas(cuerpo, Math.floor((W - 260) / 7.6));
  const tam = lineas.length > 9 ? 13.5 : 14.5;
  const bloque = texto(394, null, { 'font-size': tam });
  lineas.forEach((linea, i) => bloque.append(svg('tspan', { x: centro, dy: i === 0 ? 0 : tam * 1.42 }, linea)));
  s.append(bloque);
  // Abajo: la fecha (izquierda), el sello (centro) y el código (derecha).
  const base = H - 150;
  const lado = (x, arriba, abajo) => {
    const g = svg('g');
    g.append(svg('line', { x1: x - 130, y1: base, x2: x + 130, y2: base, stroke: COLOR.tinta, 'stroke-width': 0.8 }));
    g.append(svg('text', { x, y: base - 10, 'text-anchor': 'middle', 'font-family': LETRA, 'font-size': 17, fill: COLOR.tinta, 'font-weight': 700 }, arriba));
    g.append(svg('text', { x, y: base + 20, 'text-anchor': 'middle', 'font-family': LETRA, 'font-size': 13, fill: COLOR.suave }, abajo));
    return g;
  };
  s.append(lado(230, fechaLarga(c.fecha, h.idioma), t('cert.fecha')));
  s.append(lado(W - 230, c.codigo, t('cert.codigo')));
  s.append(sello(centro, base - 22, 56, t('cert.sello.anillo'), t('cert.sello.centro')));
  s.append(texto(H - 64, t('cert.verificar'), { 'font-size': 11.5, fill: COLOR.suave }));
  s.append(texto(H - 47, t('cert.aviso'), { 'font-size': 11.5, fill: COLOR.suave, 'font-style': 'italic' }));
  return s;
}

const nombreArchivo = c => (c.curso === 'compe' ? `certificado-competencia-ronda-${c.ronda}-${c.codigo}.png` : `certificado-${c.curso === 'tg' ? 'test-guide' : 'oral'}-${c.codigo}.png`);

// SVG → PNG (el doble de grande, para que se vea nítido). Por «data:» (la página no deja cargar imágenes «blob:»).
export async function descargarPng(nodo, c) {
  const W = Number(nodo.getAttribute('width'));
  const H = Number(nodo.getAttribute('height'));
  const texto = new XMLSerializer().serializeToString(nodo);
  const img = new Image();
  await new Promise((ok, mal) => { img.onload = ok; img.onerror = () => mal(new Error('imagen')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`; });
  const lienzo = document.createElement('canvas');
  lienzo.width = W * 2;
  lienzo.height = H * 2;
  const ctx = lienzo.getContext('2d');
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0, W, H);
  const blob = await new Promise(ok => lienzo.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('png');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo(c);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

// Imprimir SOLO el certificado (Guardar como PDF), en horizontal.
export function imprimir(nodo, papel) {
  const hoja = document.createElement('link');
  hoja.rel = 'stylesheet';
  hoja.href = papel === 'carta' ? '/certificado-carta.css' : '/certificado-a4.css';
  const caja = document.createElement('div');
  caja.className = 'cert-impresion';
  // La copia lleva otros ids (el degradado del logo y el anillo del sello): con el original escondido al imprimir, el
  // navegador no dibujaría lo que apunta a él.
  const copia = nodo.cloneNode(true);
  for (const x of copia.querySelectorAll('[id]')) x.id = `${x.id}-imp`;
  for (const x of copia.querySelectorAll('[fill^="url(#"]')) x.setAttribute('fill', x.getAttribute('fill').replace(/\)$/, '-imp)'));
  for (const x of copia.querySelectorAll('textPath[href^="#"]')) x.setAttribute('href', `${x.getAttribute('href')}-imp`);
  caja.append(copia);
  document.body.append(caja);
  document.body.classList.add('imprimiendo-certificado');
  const limpiar = () => { hoja.remove(); caja.remove(); document.body.classList.remove('imprimiendo-certificado'); window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  // En el iPhone print() vuelve enseguida: se limpia con «afterprint» (y, por si no llega, al minuto).
  hoja.onload = () => { window.print(); setTimeout(limpiar, 60_000); };
  hoja.onerror = () => { window.print(); setTimeout(limpiar, 60_000); };
  document.head.append(hoja);
}

function tarjetaCurso(c, nombre, h, { admin }) {
  const { el, t } = h;
  const tituloCurso = t(`cert.curso.${c.curso}`);
  if (!c.disponible) {
    return el('section', { class: 'tarjeta cert-tarjeta cert-bloqueado' },
      el('h2', { class: 'con-icono' }, h.icono('candado'), el('span', { texto: tituloCurso })),
      el('p', { class: 'suave', texto: !c.hay ? t('cert.no_hay') : t(`cert.falta.${c.curso}`, { hechos: h.numero(c.avance?.hechos ?? 0), total: h.numero(c.avance?.total ?? 0) }) }),
      admin ? null : el('p', { class: 'suave chica', texto: t('cert.falta.animo') }));
  }
  let papel = 'a4';
  const marco = el('div', { class: 'cert-marco' });
  const poner = () => marco.replaceChildren(dibujoCertificado(c, nombre, h, { papel }));
  poner();
  const elegir = el('select', { id: `cert-papel-${c.curso}`, onchange: () => { papel = elegir.value; poner(); } },
    el('option', { value: 'a4', texto: t('cert.papel.a4') }), el('option', { value: 'carta', texto: t('cert.papel.carta') }));
  const mensaje = h.caja();
  const bajar = h.botonAccion(t('cert.descargar'), '', mensaje, async () => {
    try { await descargarPng(marco.firstElementChild, c); } catch { throw new Error(t('cert.descargar.error')); }
  }, 'flecha');
  const pdf = el('button', { type: 'button', class: 'secundario con-icono', onclick: () => imprimir(marco.firstElementChild, papel) }, h.icono('manual'), el('span', { texto: t('cert.pdf') }));
  const k = clavesTexto(c.curso, c.variante);
  return el('section', { class: 'tarjeta cert-tarjeta' },
    el('h2', { class: 'con-icono' }, h.icono('medalla'), el('span', { texto: tituloCurso })),
    marco,
    // El texto otra vez, en letra normal: en el teléfono el dibujo queda chico para leerlo.
    el('details', { class: 'cert-leer' }, el('summary', { texto: t('cert.leer') }),
      el('p', { class: 'cert-titular', texto: t(k.titular) }), el('p', { texto: t(k.cuerpo) }), el('p', { texto: t('cert.cierre') }),
      el('p', { class: 'suave chica', texto: t('cert.aviso') })),
    el('div', { class: 'cert-acciones' },
      el('label', { for: `cert-papel-${c.curso}`, texto: t('cert.papel') }), elegir,
      el('div', { class: 'botones' }, bajar, pdf)),
    el('p', { class: 'suave chica', texto: `${t('cert.codigo')}: ${c.codigo}` }),
    mensaje);
}

function verificador(h) {
  const { el, t } = h;
  const entrada = el('input', { id: 'cert-verificar', type: 'text', maxlength: 20, autocomplete: 'off', placeholder: 'AA-TG-XXXX-XXXX', autocapitalize: 'characters' });
  const resultado = el('div', { class: 'cert-resultado', 'aria-live': 'polite' });
  const mensaje = h.caja();
  const boton = h.botonAccion(t('cert.verificar.boton'), 'secundario', mensaje, async () => {
    const codigo = entrada.value.trim();
    if (!codigo) return;
    const r = await h.api('GET', `/api/certificados/verificar/${encodeURIComponent(codigo)}`);
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    const d = r.datos;
    resultado.replaceChildren(d.valido
      ? el('p', { class: 'aviso tono-bien', texto: d.curso === 'compe' ? t('compe.cert.verificado', { nombre: d.nombre, ronda: d.ronda, aciertos: d.aciertos, total: d.total, fecha: fechaLarga(d.fecha, h.idioma) }) : t('cert.verificar.bien', { nombre: d.nombre, curso: t(`cert.curso.${d.curso}`), fecha: fechaLarga(d.fecha, h.idioma) }) })
      : el('p', { class: 'aviso tono-atencion', texto: t('cert.verificar.mal') }));
  }, 'lupa');
  return el('section', { class: 'tarjeta' },
    el('h2', { class: 'con-icono' }, h.icono('escudo'), el('span', { texto: t('cert.verificar.titulo') })),
    el('p', { class: 'suave', texto: t('cert.verificar.linea') }),
    el('label', { for: 'cert-verificar', texto: t('cert.codigo') }), entrada,
    el('div', { class: 'botones' }, boton), resultado, mensaje);
}

// datos: { nombre, cursos, alumnoId? } (GET /api/academia/certificados o el del administrador).
export function vistaCertificados(datos, h) {
  const { el, t } = h;
  const admin = datos.alumnoId != null;
  return [
    admin ? el('a', { class: 'volver con-icono', href: `#alumno/${datos.alumnoId}` }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: datos.nombre })) : null,
    el('h1', { class: 'titulo-pantalla', texto: admin ? t('cert.titulo_admin', { nombre: datos.nombre }) : t('cert.mis') }),
    el('p', { class: 'entrada', texto: t('cert.linea') }),
    datos.cursos.map(c => tarjetaCurso(c, datos.nombre, h, { admin })),
    verificador(h),
  ];
}
