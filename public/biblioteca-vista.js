// Academia 0.14.20: la «Biblioteca» (se carga solo al abrirla, desde public/app.js). Leer los libros de dominio público
// de las fuentes del servidor, página por página, con su índice y un buscador. Direcciones:
//   #biblioteca                     los libros publicados (y, para el administrador, qué libros se publican)
//   #biblioteca/<libro>             el índice del libro y el buscador
//   #biblioteca/<libro>/<página>    leer esa página (o la siguiente que exista)
// Todo se arma con h.el (nunca texto como código, nunca estilos sueltos). El texto llega del servidor por página.
// h: { el, t, tn, icono, talCual, api, mostrar, marco, textoError, avisar, abrirImagenGrande, esAdmin, vigente }.

// El texto de una página del PDF viene cortado en renglones: se juntan en párrafos (una línea en blanco separa) y una
// palabra partida con guion al final del renglón se vuelve a unir. Puro (se prueba sin navegador).
export function parrafos(texto) {
  return String(texto ?? '').replace(/\r/g, '').split(/\n\s*\n/)
    .map(p => p.split('\n').map(l => l.trim()).filter(Boolean).reduce((a, l) => (!a ? l : /[a-záéíóúñ]-$/i.test(a) ? a.slice(0, -1) + l : `${a} ${l}`), ''))
    .filter(Boolean);
}
// 0.14.34: la estructura de una página (para leerla cómoda): títulos (renglones en MAYÚSCULAS o secciones numeradas como
// «2.1 Definiciones»), párrafos (los renglones cortados se juntan; una línea en blanco separa), listas (renglones que
// empiezan con «-», «•», «a)», «1.»; un renglón que sigue sin marca es la continuación del punto) y la etiqueta de un
// artículo o sección en negrita («Artículo 12.-», «Sección 3»). Solo texto: nunca HTML del libro. Puro (se prueba sin navegador).
// → [{ tipo: 'titulo', nivel: 2|3, texto } | { tipo: 'parrafo', etiqueta, texto } | { tipo: 'lista', ordenada, items: [{ marca, texto }] }]
const MARCA_LISTA = /^(?:([-•▪●◦–*])|(\(?[a-zA-Z]\)|[a-z]\.|\d{1,2}[.)]))\s+(\S.*)$/u;
const SECCION = /^(\d{1,2}(?:\.\d{1,3})+)\.?\s+(\S.*)$/;
const ETIQUETA = /^((?:Art[íi]culo|Art\.|Secci[óo]n|Section|Article|Cap[íi]tulo|Chapter|P[áa]rrafo|Regla|Rule)\s+[0-9IVXLC]+[A-Za-z0-9.()]*\s*(?:\.-|[.:–-])?)(?:\s+(.*))?$/iu;
const juntar = (a, l) => (!a ? l : /[\p{L}]-$/u.test(a) ? a.slice(0, -1) + l : `${a} ${l}`);
export function esTituloMayusculas(l) {
  const letras = l.match(/\p{L}/gu) ?? [];
  return letras.length >= 3 && l.length <= 90 && !/\p{Ll}/u.test(l) && !/[,;]$/.test(l);
}
export function estructura(texto) {
  const bloques = [];
  let parrafo = null;
  let lista = null;
  const cerrar = () => {
    if (parrafo) {
      const m = ETIQUETA.exec(parrafo);
      bloques.push(m && m[2] ? { tipo: 'parrafo', etiqueta: m[1], texto: m[2] } : { tipo: 'parrafo', etiqueta: null, texto: parrafo });
    }
    if (lista) bloques.push(lista);
    parrafo = null;
    lista = null;
  };
  for (const crudo of String(texto ?? '').replace(/\r/g, '').split('\n')) {
    const l = crudo.trim();
    if (!l) { cerrar(); continue; }
    if (/^\d{1,4}$/.test(l)) continue; // un número de página suelto
    const sec = SECCION.exec(l);
    if (sec && l.length <= 80 && !/[.;:,]$/.test(l)) { cerrar(); bloques.push({ tipo: 'titulo', nivel: 3, texto: l }); continue; }
    if (esTituloMayusculas(l)) { cerrar(); bloques.push({ tipo: 'titulo', nivel: 2, texto: l }); continue; }
    const et = ETIQUETA.exec(l);
    if (et && !et[2]) { cerrar(); bloques.push({ tipo: 'titulo', nivel: 3, texto: l }); continue; }
    const li = MARCA_LISTA.exec(l);
    if (li) {
      if (parrafo) cerrar();
      const ordenada = !li[1];
      if (!lista || lista.ordenada !== ordenada) { cerrar(); lista = { tipo: 'lista', ordenada, items: [] }; }
      lista.items.push({ marca: ordenada ? li[2] : '•', texto: li[3] });
      continue;
    }
    if (lista) { const u = lista.items.at(-1); u.texto = juntar(u.texto, l); continue; }
    parrafo = juntar(parrafo, l);
  }
  cerrar();
  return bloques;
}
// El tamaño de la letra al leer (A− / A+), recordado en este navegador.
export const LETRAS = Object.freeze([1, 2, 3, 4, 5]);
const CLAVE_LETRA = 'biblio.letra';
export function letraGuardada(almacen = globalThis.localStorage) {
  try { const n = Number(almacen?.getItem(CLAVE_LETRA)); return LETRAS.includes(n) ? n : 2; } catch { return 2; }
}
export function guardarLetra(n, almacen = globalThis.localStorage) {
  const v = Math.min(LETRAS.at(-1), Math.max(LETRAS[0], Number(n) || 2));
  try { almacen?.setItem(CLAVE_LETRA, String(v)); } catch { /* sin almacenamiento: solo en esta visita */ }
  return v;
}

// Las partes de un fragmento con la búsqueda resaltada (sin importar mayúsculas ni tildes). → [{ texto, marca }]
export function resaltarBusqueda(fragmento, consulta) {
  const base = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const f = String(fragmento ?? '');
  const q = base(String(consulta ?? '').trim());
  if (!q) return [{ texto: f, marca: false }];
  // Se compara letra por letra (cada letra de f normalizada por separado), así las posiciones son las de f.
  const letras = [...f];
  const plano = letras.map(base);
  const partes = [];
  let i = 0;
  let desde = 0;
  while (i < letras.length) {
    let j = i;
    let k = 0;
    let acum = '';
    while (j < letras.length && acum.length < q.length) { acum += plano[j]; j += 1; k += 1; }
    if (k && acum === q) {
      if (desde < i) partes.push({ texto: letras.slice(desde, i).join(''), marca: false });
      partes.push({ texto: letras.slice(i, j).join(''), marca: true });
      i = j;
      desde = j;
    } else i += 1;
  }
  if (desde < letras.length) partes.push({ texto: letras.slice(desde).join(''), marca: false });
  return partes;
}

const enlaceLibro = (id, pagina = null) => `#biblioteca/${encodeURIComponent(id)}${pagina != null ? `/${pagina}` : ''}`;

export async function pantallaBiblioteca(libro, pagina, h) {
  if (!libro) return portada(h);
  if (pagina == null) return indice(libro, h);
  return leer(libro, Number(pagina), h);
}

function errorEn(h, r, volver = '#biblioteca') {
  const { el, t } = h;
  return h.mostrar(h.marco('biblioteca', el('section', { class: 'tarjeta' },
    el('p', { class: 'mensaje error', texto: h.textoError(r.datos?.error || 'no_existe') }),
    el('a', { class: 'boton-3d blanco', href: volver }, el('span', { texto: t('biblio.volver') })))));
}

// ---- Los libros ----
async function portada(h) {
  const { el, t, tn, icono } = h;
  const [r, a] = await Promise.all([h.api('GET', '/api/academia/biblioteca'), h.esAdmin ? h.api('GET', '/api/admin/academia/biblioteca') : null]);
  if (!h.vigente()) return;
  if (!r.ok) return errorEn(h, r, '#inicio');
  const libros = r.datos.libros ?? [];
  const lista = libros.length
    ? el('ul', { class: 'biblio-libros' }, libros.map(l => el('li', {},
      el('a', { class: 'tarjeta biblio-libro', href: enlaceLibro(l.id) },
        el('span', { class: 'biblio-libro-icono', 'aria-hidden': 'true' }, icono('libro')),
        el('span', { class: 'biblio-libro-texto' }, el('strong', { texto: l.titulo }), el('span', { class: 'suave chica', texto: tn('biblio.paginas', { n: l.paginas }) }))))))
    : el('p', { class: 'tarjeta vacio', texto: t('biblio.vacio') });
  return h.mostrar(h.marco('biblioteca', el('section', { class: 'biblioteca' },
    el('h1', { class: 'con-icono' }, icono('libro'), el('span', { texto: t('biblio.titulo') })),
    el('p', { class: 'suave', texto: t('biblio.intro') }),
    lista,
    a?.ok ? panelAdmin(a.datos.libros ?? [], h) : null)));
}

// El administrador: qué libros se publican. Los comerciales salen apagados y sin interruptor.
function panelAdmin(libros, h) {
  const { el, t } = h;
  const fila = l => {
    const id = `biblio-libro-${l.id}`;
    const caja = el('input', { type: 'checkbox', id, checked: l.permitido, disabled: l.bloqueado || !l.paginas });
    caja.addEventListener('change', async () => {
      caja.disabled = true;
      const r = await h.api('POST', `/api/admin/academia/biblioteca/libros/${encodeURIComponent(l.id)}`, { permitido: caja.checked });
      if (!r.ok) { caja.checked = !caja.checked; h.avisar?.(h.textoError(r.datos?.error), 'error'); }
      caja.disabled = false;
      if (r.ok) portada(h);
    });
    return el('li', { class: `biblio-admin-fila ${l.bloqueado ? 'bloqueado' : ''}`.trim() },
      el('label', { for: id, class: 'biblio-admin-caja' }, caja, el('span', { texto: l.titulo })),
      el('span', { class: 'suave chica', texto: t(`biblio.clase.${l.clase}`) }),
      l.bloqueado ? el('span', { class: 'biblio-nota-comercial chica', texto: t('biblio.comercial') }) : null);
  };
  return el('details', { class: 'tarjeta biblio-admin' },
    el('summary', { texto: t('biblio.admin.titulo') }),
    el('p', { class: 'suave chica', texto: t('biblio.admin.nota') }),
    libros.length ? el('ul', { class: 'biblio-admin-lista' }, libros.map(fila)) : el('p', { class: 'suave', texto: t('biblio.admin.sin_fuentes') }));
}

// ---- El buscador (en el índice y al leer) ----
function buscador(libro, h, { consulta = '' } = {}) {
  const { el, t, tn, icono } = h;
  const id = `biblio-buscar-${libro}`;
  const campo = el('input', { type: 'search', id, name: 'q', minlength: '3', maxlength: '80', autocomplete: 'off', enterkeyhint: 'search', value: consulta, placeholder: t('biblio.buscar.ejemplo') });
  const salida = el('div', { class: 'biblio-resultados', 'aria-live': 'polite' });
  const forma = el('form', { class: 'biblio-buscar', role: 'search' },
    el('label', { for: id, texto: t('biblio.buscar') }),
    el('div', { class: 'biblio-buscar-fila' }, campo,
      el('button', { type: 'submit', class: 'boton-3d azul cuadrado', 'aria-label': t('biblio.buscar') }, icono('lupa'))),
    salida);
  forma.addEventListener('submit', async e => {
    e.preventDefault();
    const q = campo.value.trim();
    if (q.length < 3) { salida.replaceChildren(el('p', { class: 'suave chica', texto: t('biblio.buscar.corta') })); return; }
    salida.replaceChildren(el('p', { class: 'suave chica', texto: t('biblio.buscando') }));
    const r = await h.api('GET', `/api/academia/biblioteca/${encodeURIComponent(libro)}/buscar?q=${encodeURIComponent(q)}`);
    if (!forma.isConnected) return;
    if (!r.ok) { salida.replaceChildren(el('p', { class: 'mensaje error', texto: h.textoError(r.datos?.error) })); return; }
    const lista = r.datos.resultados ?? [];
    const partes = [el('p', { class: 'suave chica', texto: lista.length ? tn(r.datos.mas ? 'biblio.resultados_mas' : 'biblio.resultados', { n: lista.length }) : t('biblio.sin_resultados') })];
    if (lista.length) partes.push(el('ol', { class: 'biblio-lista-resultados' }, lista.map(x => el('li', {},
      el('a', { href: enlaceLibro(libro, x.pagina), class: 'biblio-resultado' },
        el('strong', { texto: t('biblio.pagina_corta', { n: x.pagina }) }),
        el('span', {}, resaltarBusqueda(x.fragmento, q).map(p => (p.marca ? el('mark', { texto: p.texto }) : p.texto))))))));
    salida.replaceChildren(...partes);
  });
  return forma;
}

// ---- El índice de un libro ----
async function indice(libro, h) {
  const { el, t, tn, icono } = h;
  const r = await h.api('GET', `/api/academia/biblioteca/${encodeURIComponent(libro)}`);
  if (!h.vigente()) return;
  if (!r.ok) return errorEn(h, r);
  const d = r.datos;
  return h.mostrar(h.marco('biblioteca', el('section', { class: 'biblioteca' },
    el('a', { class: 'biblio-volver con-icono-chico', href: '#biblioteca' }, el('span', { texto: t('biblio.volver') })),
    el('h1', { class: 'biblio-titulo', texto: d.titulo }),
    el('p', { class: 'suave', texto: tn('biblio.paginas_rango', { n: d.paginas, desde: d.desde, hasta: d.hasta }) }),
    el('a', { class: 'boton-3d azul', href: enlaceLibro(libro, d.desde) }, icono('libro'), el('span', { texto: t('biblio.empezar') })),
    el('div', { class: 'tarjeta' }, buscador(libro, h)),
    el('nav', { class: 'tarjeta biblio-indice', 'aria-label': t('biblio.indice') },
      el('h2', { texto: t('biblio.indice') }),
      el('ol', { class: 'biblio-capitulos' }, (d.capitulos ?? []).map(c => el('li', {},
        el('a', { href: enlaceLibro(libro, c.desde) },
          el('span', { texto: c.titulo || t('biblio.capitulo', { n: c.n }) }),
          el('span', { class: 'suave chica', texto: t('biblio.paginas_de', { desde: c.desde, hasta: c.hasta }) }))))),
      d.temas?.length ? el('h2', { texto: t('biblio.temas') }) : null,
      d.temas?.length ? el('ol', { class: 'biblio-capitulos' }, d.temas.map(x => el('li', {},
        el('a', { href: enlaceLibro(libro, x.pagina) },
          el('span', { texto: x.titulo }),
          el('span', { class: 'suave chica', texto: `${x.materia} · ${t('biblio.pagina_corta', { n: x.pagina })}` }))))) : null))));
}

// ---- Leer una página ----
async function leer(libro, pagina, h) {
  const { el, t, icono } = h;
  const r = await h.api('GET', `/api/academia/biblioteca/${encodeURIComponent(libro)}/paginas/${pagina}`);
  if (!h.vigente()) return;
  if (!r.ok) return errorEn(h, r, enlaceLibro(libro));
  const d = r.datos;
  // Se pidió una página que no está (un hueco del libro): la dirección queda en la que se muestra.
  if (d.pagina !== pagina) { try { history.replaceState(null, '', enlaceLibro(libro, d.pagina)); } catch { /* sin historial */ } }
  const ir = el('form', { class: 'biblio-ir' },
    el('label', { for: 'biblio-ir', texto: t('biblio.ir') }),
    el('input', { type: 'number', id: 'biblio-ir', inputmode: 'numeric', min: '1', max: '99999', value: String(d.pagina) }),
    el('button', { type: 'submit', class: 'boton-3d blanco chico', texto: t('biblio.ir.boton') }));
  ir.addEventListener('submit', e => { e.preventDefault(); const n = Number(ir.querySelector('input').value); if (Number.isSafeInteger(n) && n > 0) location.hash = enlaceLibro(libro, n); });
  const pasos = () => el('nav', { class: 'biblio-pasos', 'aria-label': t('biblio.pasos') },
    d.anterior != null ? el('a', { class: 'boton-3d blanco', href: enlaceLibro(libro, d.anterior), rel: 'prev' }, el('span', { texto: t('biblio.anterior') })) : el('span'),
    el('span', { class: 'biblio-posicion suave chica', texto: t('biblio.posicion', { n: d.posicion, total: d.total }) }),
    d.siguiente != null ? el('a', { class: 'boton-3d azul', href: enlaceLibro(libro, d.siguiente), rel: 'next' }, el('span', { texto: t('biblio.siguiente') })) : el('span'));
  const fotos = (d.imagenes ?? []).map(x => {
    const src = `/api/academia/biblioteca/${encodeURIComponent(libro)}/imagenes/${encodeURIComponent(x.archivo)}`;
    const alt = x.pie || t('biblio.imagen', { n: d.pagina });
    return el('figure', { class: 'biblio-figura' },
      el('button', { type: 'button', class: 'origen-imagen-boton', 'aria-label': t('origen.tocar'), onclick: () => h.abrirImagenGrande({ src, nombre: alt, titulo: alt }) },
        el('img', { src, alt, loading: 'lazy', decoding: 'async', width: x.ancho ? String(x.ancho) : null, height: x.alto ? String(x.alto) : null })),
      x.pie ? h.talCual('figcaption', x.pie, 'suave chica') : null);
  });
  const bloques = estructura(d.texto);
  // 0.14.34: la página con su estructura (títulos, párrafos, listas y etiquetas en negrita), con letra cómoda (A− / A+).
  let letra = letraGuardada();
  const hoja = el('div', { class: `tarjeta biblio-pagina letra-${letra}` },
    bloques.length ? bloques.map(b => pintarBloque(b, h)) : el('p', { class: 'suave', texto: t('biblio.pagina_vacia') }),
    fotos);
  const cambiarLetra = paso => {
    hoja.classList.remove(`letra-${letra}`);
    letra = guardarLetra(letra + paso);
    hoja.classList.add(`letra-${letra}`);
    menos.disabled = letra <= LETRAS[0];
    mas.disabled = letra >= LETRAS.at(-1);
  };
  const menos = el('button', { type: 'button', class: 'boton-3d blanco chico biblio-letra', 'aria-label': t('biblio.letra_menos'), disabled: letra <= LETRAS[0], onclick: () => cambiarLetra(-1), texto: 'A−' });
  const mas = el('button', { type: 'button', class: 'boton-3d blanco chico biblio-letra', 'aria-label': t('biblio.letra_mas'), disabled: letra >= LETRAS.at(-1), onclick: () => cambiarLetra(1), texto: 'A+' });
  // La cabecera chiquita que se queda arriba al bajar: capítulo y página, anterior / siguiente y el tamaño de la letra.
  const mini = el('div', { class: 'biblio-mini' },
    d.anterior != null ? el('a', { class: 'biblio-mini-paso', href: enlaceLibro(libro, d.anterior), rel: 'prev', 'aria-label': t('biblio.anterior'), texto: '‹' }) : el('span', { class: 'biblio-mini-paso vacio' }),
    el('span', { class: 'biblio-mini-donde' }, el('strong', { texto: t('biblio.pagina_corta', { n: d.pagina }) }), d.capitulo?.titulo ? el('span', { class: 'suave', texto: ` · ${d.capitulo.titulo}` }) : null),
    el('span', { class: 'biblio-mini-letra' }, menos, mas),
    d.siguiente != null ? el('a', { class: 'biblio-mini-paso', href: enlaceLibro(libro, d.siguiente), rel: 'next', 'aria-label': t('biblio.siguiente'), texto: '›' }) : el('span', { class: 'biblio-mini-paso vacio' }));
  return h.mostrar(h.marco('biblioteca', el('article', { class: 'biblioteca biblio-lector', lang: /-en$/.test(libro) ? 'en' : null },
    el('header', { class: 'biblio-cabeza' },
      el('a', { class: 'biblio-volver', href: enlaceLibro(libro) }, el('span', { texto: t('biblio.al_indice') })),
      el('h1', { class: 'biblio-titulo chico', texto: d.titulo })),
    mini,
    hoja,
    pasos(),
    el('details', { class: 'tarjeta biblio-mas' }, el('summary', {}, icono('lupa', 'icono chico'), el('span', { texto: t('biblio.buscar_o_ir') })),
      buscador(libro, h), ir))));
}

// Un bloque de la página (solo textContent).
function pintarBloque(b, h) {
  const { el } = h;
  if (b.tipo === 'titulo') return h.talCual(b.nivel === 2 ? 'h2' : 'h3', b.texto, 'biblio-h');
  if (b.tipo === 'lista') return el(b.ordenada ? 'ol' : 'ul', { class: 'biblio-lista' }, b.items.map(x => el('li', {},
    el('span', { class: 'biblio-marca', 'aria-hidden': b.ordenada ? null : 'true', texto: x.marca }), h.talCual('span', x.texto))));
  return el('p', { class: 'biblio-parrafo' }, b.etiqueta ? el('strong', { class: 'biblio-etiqueta', texto: `${b.etiqueta} ` }) : null, h.talCual('span', b.texto));
}

// «Ver en el libro» en la línea de la fuente de una tarjeta: solo si ese libro se puede leer y la página es un número.
export function paginaDeFuente(f) {
  const m = /(\d{1,5})/.exec(String(f?.pagina ?? ''));
  return m ? Number(m[1]) : null;
}
export { enlaceLibro };
