// Academia 0.14.71: «Notas por materia» (Administrador → Alumnos → Notas por materia, #notas-materia). Solo se carga en esa
// pantalla (los alumnos nunca bajan este archivo). Las piezas de dibujo (el, t, icono…) llegan de app.js en «h».
// Una tabla: una fila por alumno; una columna por materia (las 11, las que todavía no tienen clases con «—»), el Oral y el
// «Total completado». Cada casilla: la nota (el mejor examen; sin examen, el % de práctica con «P») y si la completó
// («✓ completa») o cuánto hizo («3 de 5 temas»), con «Convalidada», «Se quemó» o «Fue directo al examen» cuando toca.
// El color: verde si la nota llega a la de aprobar de «Ajustes del curso», rojo si no, gris sin nota.
// La tabla se desliza de lado DENTRO de su caja (la página nunca), con la primera columna fija. Todo texto va con textContent.
// «Descargar» baja un CSV (para Excel) y «Copiar» copia un texto corto por alumno (para WhatsApp o Excel).
// Los datos salen de GET /api/admin/academia/notas-materia (src/academia/resumen-materias.js).
// 0.14.79: el oral ya no es una sola columna: una por cada capítulo del paquete oral (O1…O9, los que tienen temas), igual
// que las materias, y después «Oral total» (cuánto del oral hizo y la nota del oral: el examen final si lo dio). La
// cabecera va en dos franjas: «Test Guide» y «Examen oral». Y el filtro de curso (public/admin-cursos.js): la tabla, el
// CSV y «Copiar» llevan solo los alumnos del curso elegido; con «Todos los cursos», cada fila dice su curso.
import { selectorCurso, leerFiltro, filtroValido, datosDelCurso, TODOS } from './admin-cursos.js';

// El color de una nota con la nota de aprobar del curso. → 'bien' | 'mal' | 'nada'
export function tonoAprobar(pct, umbral) {
  if (pct == null || !Number.isFinite(Number(pct))) return 'nada';
  return Number(pct) >= Number(umbral) ? 'bien' : 'mal';
}
const nombreDe = a => a.nombreVisible || a.nombre;

const pctDe = n => `${Math.floor(Number(n) || 0)} %`;

// Las columnas: las materias en el orden de la escuela, cada capítulo del oral y «Oral total» (si hay oral).
// → [{ id, codigo, pronto, banda: 'tg' | 'oral', tipo: 'materia' | 'capitulo' | 'oral' }]
export function columnasResumen(d) {
  const oral = d.oral?.hay ? [
    ...(d.oral.capitulos ?? []).map(c => ({ id: c.id, codigo: `O${c.numero}`, pronto: false, banda: 'oral', tipo: 'capitulo' })),
    { id: 'oral', codigo: 'Oral', pronto: false, banda: 'oral', tipo: 'oral' },
  ] : [];
  return [...d.materias.map(m => ({ id: m.id, codigo: `M${m.numero}`, pronto: m.pronto, banda: 'tg', tipo: 'materia' })), ...oral];
}
const celdaDe = (a, col) => (col.tipo === 'oral' ? a.oral : col.tipo === 'capitulo' ? a.capitulos?.[col.id] : a.materias[col.id]) ?? null;
// El nombre largo de una columna («M1 Factores humanos…», «O1 Requisitos del piloto», «Oral total»).
export function nombreColumna(c, t, nombreMateria) {
  return c.tipo === 'oral' ? t('nm.col.oral_total') : `${c.codigo} ${nombreMateria(c.id)}`;
}
const cursoDe = a => a.enCurso?.nombre ?? '';

// Lo que dice una casilla, en palabras (sin DOM: la pantalla, el CSV y «Copiar» dicen lo mismo).
// → { nota: '85 %' | 'P 40 %' | '—', estado: '✓ completa' | '3 de 5 temas' | …, salto: '' | 'Convalidada (examen 92 %)' | … }
export function textosCelda(c, t, { oralTotal = false } = {}) {
  if (!c || c.pronto) return { nota: '—', estado: t('nm.pronto'), salto: '' };
  const nota = !c.nota ? '—' : c.nota.fuente === 'practica' ? t('nm.nota.practica', { pct: pctDe(c.nota.pct) }) : pctDe(c.nota.pct);
  let estado;
  if (c.completa) estado = t('nm.completa');
  else if (c.temas > 0 && c.hechos >= c.temas) estado = c.examen === 'a_medias' ? t('nm.falta_examen_medias') : c.examen === 'hecho' ? t('nm.falta_aprobar') : t('nm.falta_examen');
  else estado = t('nm.temas', { n: c.hechos, total: c.temas });
  // «Oral total»: también el % del oral que ya hizo.
  if (oralTotal && !c.completa) estado = t('nm.oral.avance', { pct: pctDe(c.pct ?? (c.temas ? Math.floor((c.hechos * 100) / c.temas) : 0)), estado });
  let salto = '';
  if (c.salto?.tipo === 'convalidada') salto = c.salto.capitulos ? t('nm.salto.convalidados', { n: c.salto.capitulos }) : t('nm.salto.convalidada', { pct: pctDe(c.salto.pct) });
  else if (c.salto?.tipo === 'quemado') salto = t('nm.salto.quemado', { pct: pctDe(c.salto.pct) });
  else if (c.salto?.tipo === 'directo') salto = t('nm.salto.directo');
  return { nota, estado, salto };
}
// El total de un alumno, en palabras.
export function textosTotal(total, t) {
  return {
    pct: pctDe(total.pct),
    temas: t('nm.total.temas', { n: total.hechos, total: total.temas }),
    completas: t('nm.total.completas', { n: total.completas, total: total.conClases }),
    general: total.general?.conExamen ? pctDe(total.general.pct) : '—',
  };
}

// ---------- CSV (para Excel: «;», con BOM y CRLF) ----------
// Un nombre que empieza con = + - @ se abre en Excel como fórmula: va con un apóstrofo delante.
export function celdaCsv(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// 0.14.79: con la columna «Curso» y solo los alumnos que se le pasen (la pantalla ya filtró por curso).
export function csvResumen(d, t, nombreMateria) {
  const cols = columnasResumen(d);
  const nombreCol = c => nombreColumna(c, t, nombreMateria);
  const lineas = [];
  const fila = valores => lineas.push(valores.map(celdaCsv).join(';'));
  fila([t('nm.col.alumno'), t('nm.col.curso'), ...cols.flatMap(c => [t('nm.csv.nota', { col: nombreCol(c) }), t('nm.csv.avance', { col: nombreCol(c) })]),
    t('nm.col.total'), t('nm.csv.temas'), t('nm.csv.completas'), t('nm.csv.general')]);
  for (const a of d.alumnos) {
    const tt = textosTotal(a.total, t);
    fila([nombreDe(a), cursoDe(a), ...cols.flatMap(c => {
      const x = textosCelda(celdaDe(a, c), t, { oralTotal: c.tipo === 'oral' });
      return [x.nota, [x.estado, x.salto].filter(Boolean).join(' · ')];
    }), tt.pct, tt.temas, tt.completas, tt.general]);
  }
  return `﻿${lineas.join('\r\n')}\r\n`;
}

// ---------- «Copiar» (para WhatsApp: un bloque corto por alumno; en Excel cada línea queda en su fila) ----------
export function textoCopiar(d, t, nombreMateria) {
  const cols = columnasResumen(d).filter(c => !c.pronto);
  const bloques = [d.cursoNombre ? t('nm.copiar.titulo_curso', { umbral: d.umbral, curso: d.cursoNombre }) : t('nm.copiar.titulo', { umbral: d.umbral })];
  for (const a of d.alumnos) {
    const tt = textosTotal(a.total, t);
    const lineas = [t('nm.copiar.alumno', { nombre: nombreDe(a), pct: tt.pct, general: tt.general })];
    for (const c of cols) {
      const x = textosCelda(celdaDe(a, c), t, { oralTotal: c.tipo === 'oral' });
      const nombre = nombreColumna(c, t, nombreMateria);
      lineas.push(`${nombre}: ${[x.nota, x.estado, x.salto].filter(Boolean).join(' · ')}`);
    }
    bloques.push(lineas.join('\n'));
  }
  const pronto = columnasResumen(d).filter(c => c.pronto).map(c => c.codigo);
  if (pronto.length) bloques.push(t('nm.copiar.pronto', { lista: pronto.join(', ') }));
  return bloques.join('\n\n');
}

// ---------- La pantalla ----------
function casilla(h, c, umbral, nombre, oralTotal = false) {
  const { el, t } = h;
  const x = textosCelda(c, t, { oralTotal });
  if (!c || c.pronto) return el('td', { class: 'nm-td nm-pronto', title: `${nombre}: ${t('nm.pronto')}` }, el('span', { class: 'nm-nota nt nt-nada', texto: '—' }));
  const tono = tonoAprobar(c.nota?.pct, umbral);
  const practica = c.nota?.fuente === 'practica';
  const texto = [x.nota, x.estado, x.salto].filter(Boolean).join(' · ');
  return el('td', { class: `nm-td${c.completa ? ' nm-completa' : ''}${oralTotal ? ' nm-oral-total' : ''}`, title: `${nombre}: ${texto}` },
    el('span', { class: 'solo-lectores', texto: `${nombre}: ${practica ? t('nm.leyenda.practica') : ''} ${texto}` }),
    el('span', { class: 'nm-celda', 'aria-hidden': 'true' },
      el('strong', { class: `nm-nota nt nt-${tono}${practica ? ' nm-practica' : ''}`, texto: x.nota }),
      el('span', { class: `nm-estado${c.completa ? ' nm-estado-completa' : ''}`, texto: x.estado }),
      x.salto ? el('span', { class: `nm-salto nm-salto-${c.salto.tipo}`, texto: x.salto }) : null));
}
function casillaTotal(h, total, umbral) {
  const { el, t } = h;
  const tt = textosTotal(total, t);
  const general = total.general?.conExamen ? total.general.pct : null;
  return el('td', { class: 'nm-td nm-total' },
    el('span', { class: 'nm-celda' },
      el('strong', { class: 'nm-total-pct', texto: t('nm.total.completado', { pct: tt.pct }) }),
      el('span', { class: 'nm-estado', texto: `${tt.temas} · ${tt.completas}` }),
      el('span', { class: 'nm-general' }, el('span', { class: 'suave chica', texto: t('nm.total.general') }), el('strong', { class: `nt nt-${tonoAprobar(general, umbral)}`, texto: tt.general }))));
}
function leyenda(h, umbral) {
  const { el, t } = h;
  const item = (clase, texto, explica) => el('li', { class: 'nm-leyenda-fila' }, el('span', { class: clase, texto }), el('span', { texto: explica }));
  return el('ul', { class: 'nm-leyenda', 'aria-label': t('nm.leyenda.titulo') },
    item('nm-nota nt nt-bien', '92 %', t('nm.leyenda.bien', { umbral })),
    item('nm-nota nt nt-mal', '57 %', t('nm.leyenda.mal', { umbral })),
    item('nm-nota nt nt-bien nm-practica', t('nm.nota.practica', { pct: '80 %' }), t('nm.leyenda.practica')),
    item('nm-estado nm-estado-completa', t('nm.completa'), t('nm.leyenda.completa')),
    item('nm-salto nm-salto-convalidada', t('nm.salto.convalidada', { pct: '92 %' }), t('nm.leyenda.convalidada')),
    item('nm-salto nm-salto-quemado', t('nm.salto.quemado', { pct: '57 %' }), t('nm.leyenda.quemado')),
    item('nm-salto nm-salto-directo', t('nm.salto.directo'), t('nm.leyenda.directo')),
    item('nm-nota nt nt-nada', '—', t('nm.leyenda.nada')));
}
function descargar(h, d) {
  const blob = new Blob([csvResumen(d, h.t, h.nombreMateria)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h.el('a', { href: url, download: `notas-por-materia-${String(d.ahora).slice(0, 10)}${d.cursoNombre ? `-${d.cursoNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : ''}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function vistaResumen(todo, h, { filtro = leerFiltro() } = {}) {
  const { el, t } = h;
  const cursos = todo.cursos ?? [];
  const elegido = filtroValido(filtro, cursos);
  const d = { ...datosDelCurso(todo, elegido), ...(elegido !== TODOS ? { cursoNombre: cursos.find(c => c.id === elegido)?.nombre ?? '' } : {}) };
  const cols = columnasResumen(d);
  const nombreCol = c => (c.tipo === 'oral' ? t('nm.col.oral_total') : h.nombreMateria(c.id));
  const estado = el('p', { class: 'suave chica nm-aviso', role: 'status' });
  const copiar = async () => {
    const texto = textoCopiar(d, t, h.nombreMateria);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles');
      await navigator.clipboard.writeText(texto);
      estado.textContent = t('nm.copiado');
    } catch {
      // Sin portapapeles: el texto queda a la vista, seleccionado, para copiarlo a mano.
      const caja = el('textarea', { class: 'nm-copia', readonly: true, rows: '6', 'aria-label': t('nm.copiar') });
      caja.value = texto;
      estado.replaceChildren(el('span', { texto: t('nm.copiar_a_mano') }), caja);
      caja.select();
    }
  };
  // Dos filas de cabecera: arriba las franjas («Test Guide», «Examen oral»); abajo cada columna. El nombre y el total
  // ocupan las dos filas.
  const deTg = cols.filter(c => c.banda === 'tg').length;
  const deOral = cols.filter(c => c.banda === 'oral').length;
  const franjas = el('tr', { class: 'nm-franjas' },
    el('th', { scope: 'col', rowspan: '2', class: 'notas-th notas-quien', texto: t('nm.col.alumno') }),
    el('th', { scope: 'colgroup', colspan: String(deTg), class: 'notas-th nm-franja nm-franja-tg', texto: t('nm.banda.tg') }),
    deOral ? el('th', { scope: 'colgroup', colspan: String(deOral), class: 'notas-th nm-franja nm-franja-oral', texto: t('nm.banda.oral') }) : null,
    el('th', { scope: 'col', rowspan: '2', class: 'notas-th nm-th nm-th-total', texto: t('nm.col.total') }));
  const cabeza = el('tr', {},
    cols.map(c => el('th', { scope: 'col', class: `notas-th nm-th nm-th-${c.banda}${c.tipo === 'oral' ? ' nm-th-oral-total' : ''}${c.pronto ? ' nm-th-pronto' : ''}`, title: nombreCol(c) },
      el('span', { class: 'nm-cod', texto: c.tipo === 'oral' ? t('nm.col.oral_total') : c.codigo }),
      c.tipo === 'oral' ? null : el('span', { class: 'nm-th-nombre', texto: nombreCol(c) }),
      c.pronto ? el('span', { class: 'nm-th-nombre suave', texto: t('nm.pronto') }) : null)));
  const conVarios = cursos.length > 1 && elegido === TODOS;
  const filas = d.alumnos.map(a => el('tr', { 'data-alumno': String(a.id) },
    el('th', { scope: 'row', class: 'notas-quien' },
      el('a', { class: 'notas-quien-enlace', href: `#alumno/${a.id}`, title: t('nm.ver_ficha', { nombre: nombreDe(a) }) },
        el('span', { class: 'notas-nombre', texto: nombreDe(a) })),
      conVarios && cursoDe(a) ? el('span', { class: 'chip-curso', texto: cursoDe(a) }) : null),
    cols.map(c => casilla(h, celdaDe(a, c), d.umbral, nombreCol(c), c.tipo === 'oral')),
    casillaTotal(h, a.total, d.umbral)));
  const hay = d.alumnos.length > 0;
  return el('section', { class: 'tarjeta notas nm' },
    el('h1', { class: 'titulo-pantalla con-icono' }, h.icono('marca'), el('span', { texto: t('nm.titulo') })),
    el('p', { class: 'suave', texto: t('nm.linea', { umbral: d.umbral }) }),
    cursos.length ? selectorCurso(h, cursos, elegido, { id: 'filtro-curso-nm' }) : null,
    el('div', { class: 'botones nm-botones' },
      hay ? el('button', { type: 'button', class: 'secundario con-icono nm-descargar', onclick: () => descargar(h, d) }, h.icono('manual', 'icono chico'), el('span', { texto: t('nm.descargar') })) : null,
      hay ? el('button', { type: 'button', class: 'secundario con-icono nm-copiar', onclick: copiar }, h.icono('copia', 'icono chico'), el('span', { texto: t('nm.copiar') })) : null,
      el('a', { class: 'boton-enlace secundario con-icono', href: '#notas' }, h.icono('medalla', 'icono chico'), el('span', { texto: t('nm.ver_detalle') }))),
    estado,
    hay ? [
      leyenda(h, d.umbral),
      el('p', { class: 'suave chica notas-deslizar', texto: t('nm.deslizar') }),
      el('div', { class: 'notas-caja nm-caja', role: 'region', 'aria-label': t('nm.titulo'), tabindex: '0' },
        el('table', { class: 'notas-tabla nm-tabla' }, el('thead', {}, franjas, cabeza), el('tbody', {}, filas))),
      el('p', { class: 'suave chica', texto: t('nm.general.nota') }),
    ] : h.vacio('personas', t('nm.vacio')));
}
