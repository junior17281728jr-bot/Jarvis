// Academia 0.14.3 (pedido del dueño): el examen oral se hace en ESPAÑOL. Las preguntas y respuestas del libro se ven en
// español cuando el paquete ya trae su traducción (pregunta_es / respuesta_es), con un botón «Español | Inglés original»
// en cada pregunta para ver el original tal cual. Lo usan public/oral-vista.js (la clase, practicar, los exámenes) y
// public/repaso-final-vista.js (el oral del «Repaso final»).
//  - Las dos versiones se arman juntas y el botón solo cambia data-oral-idioma en <html> (academia.css esconde la otra):
//    cambiar de idioma nunca vuelve a pintar la pantalla, así que no pierde lo elegido, no muestra la respuesta antes de
//    tiempo y no cambia la nota.
//  - Lo elegido se recuerda por alumno en este navegador (localStorage; si no se puede, vale solo ahora).
//  - Sin español, se ve el inglés con «Aún sin traducir».
// Todo con h.el / h.talCual (nunca texto como código) y clases (nunca estilos escritos).

const IDIOMAS = ['es', 'en'];
const clave = usuario => `op_oral_idioma.${Number(usuario) || 0}`;

export function idiomaOral(usuario) {
  try { return localStorage.getItem(clave(usuario)) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}
export function ponerIdiomaOral(idioma) {
  const x = IDIOMAS.includes(idioma) ? idioma : 'es';
  document.documentElement.dataset.oralIdioma = x;
  for (const b of document.querySelectorAll('.idioma-oral-boton')) b.setAttribute('aria-pressed', String(b.dataset.idioma === x));
  return x;
}

// El botón: una pastilla con dos partes (44 px de alto), siempre a la vista arriba de cada pregunta.
export function selectorIdioma(h) {
  const { el, t, usuario } = h;
  const actual = ponerIdiomaOral(idiomaOral(usuario));
  const boton = (idioma, texto) => el('button', {
    type: 'button', class: 'idioma-oral-boton', 'data-idioma': idioma, 'aria-pressed': String(actual === idioma),
    onclick: () => {
      try { localStorage.setItem(clave(usuario), idioma); } catch { /* vale solo ahora */ }
      ponerIdiomaOral(idioma);
    },
  }, el('span', { texto }));
  return el('div', { class: 'idioma-oral-fila' },
    el('div', { class: 'idioma-oral', role: 'group', 'aria-label': t('oral.idioma.grupo') }, boton('es', t('oral.idioma.es')), boton('en', t('oral.idioma.en'))));
}

const conLang = (nodo, lang) => { nodo.setAttribute('lang', lang); return nodo; };

// Un texto del libro en los dos idiomas: el español (si ya lo trae) con «Español» y el inglés tal cual con «Inglés original».
// Sin español: el inglés siempre, y con «Español» la nota «Aún sin traducir».
export function bilingue(h, etiqueta, es, en, clase = '') {
  const { el, t, talCual } = h;
  if (en == null) return es ? conLang(talCual(etiqueta, es, clase), 'es') : null;
  if (es) return [conLang(talCual(etiqueta, es, `${clase} oral-solo-es`), 'es'), conLang(talCual(etiqueta, en, `${clase} oral-solo-en`), 'en')];
  return [conLang(talCual(etiqueta, en, clase), 'en'), el(etiqueta === 'span' ? 'span' : 'p', { class: 'sin-traducir oral-solo-es', texto: t('oral.sin_traducir') })];
}
// El rótulo de arriba de un texto: el de español solo si hay español; si no, el del original.
export function rotulo(h, hayEs, es, en, clase = 'oral-qa-etiqueta') {
  const { el } = h;
  return hayEs ? [el('p', { class: `${clase} oral-solo-es`, texto: es }), el('p', { class: `${clase} oral-solo-en`, texto: en })] : el('p', { class: clase, texto: en });
}

// Una pregunta de opción múltiple del oral (ya vienen en español): con «Inglés original», su enunciado en inglés si el
// paquete lo trae; si no, la pregunta del libro tal cual (nunca su respuesta).
export function enunciadoOral(h, q, clase = 'q-enunciado') {
  const { el, t, talCual } = h;
  const es = conLang(talCual('p', q.enunciado, clase), 'es');
  if (!q.enunciado_en && !q.pregunta_libro_en) return es;
  es.classList.add('oral-solo-es');
  if (q.enunciado_en) return [es, conLang(talCual('p', q.enunciado_en, `${clase} oral-solo-en`), 'en')];
  return [es, el('div', { class: 'oral-solo-en' },
    el('p', { class: 'oral-qa-etiqueta', texto: t('oral.enunciado_libro') }),
    conLang(talCual('p', q.pregunta_libro_en, clase), 'en'))];
}
// El texto de una opción: en inglés solo si el paquete trae opciones_en (con la misma letra).
export function textoOpcion(h, q, o) {
  const { talCual } = h;
  const en = q.opciones_en?.find(x => x.letra === o.letra)?.texto;
  if (!en) return conLang(talCual('span', o.texto, 'opcion-texto'), 'es');
  return [conLang(talCual('span', o.texto, 'opcion-texto oral-solo-es'), 'es'), conLang(talCual('span', en, 'opcion-texto oral-solo-en'), 'en')];
}
// Con «Inglés original» y sin opciones en inglés: una nota corta debajo de las opciones.
export function notaOpciones(h, q) {
  const { el, t } = h;
  return q.opciones_en?.length ? null : el('p', { class: 'sin-traducir oral-solo-en', texto: t('oral.opciones_es') });
}
