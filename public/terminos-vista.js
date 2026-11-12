// Academia 0.9.2: «Términos de uso y aviso». Solo se carga cuando hace falta (al aceptar, al leerlos, en Contenido).
//  - Aceptar (0.12.1, por pasos): 1 Tus datos → 2 Lee → 3 Firma → 4 Listo. Sin firmar no se sigue (solo «Salir»).
//  - Leer: el texto en uso (también antes de entrar, desde el pie), con el resumen, el índice y las partes plegables.
//  - Administrador: publicar una versión nueva (todos la aceptan otra vez).
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

const NOMBRE = /^[\p{L}](?:[\p{L}\p{M}' -]*[\p{L}\p{M}])?$/u;
export function parteValida(texto) {
  const limpio = String(texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return limpio.length >= 2 && limpio.length <= 60 && NOMBRE.test(limpio) ? limpio : null;
}

// ---------- 0.12.1: firmar por pasos, claro de punta a punta ----------
// «1 Tus datos → 2 Lee → 3 Firma → 4 Listo», con la barra de avance y, en cada paso, qué pasa ahora y qué viene.
// Lógica pura (test/terminos-pasos.test.js): los pasos, el índice de los textos, cuánto se leyó y cuándo se puede marcar.
export const PASOS_FIRMA = Object.freeze(['datos', 'lee', 'firma', 'listo']);
// «Lo importante en 1 minuto»: las ideas que más le afectan, antes del texto completo.
export const RESUMEN_FIRMA = Object.freeze(['que_es', 'no_oficial', 'errores', 'pagos', 'datos', 'quien_ve', 'firma', 'menores']);
// El índice de los dos textos: un ancla por parte (términos y privacidad).
export function indiceDe(docs) {
  return docs.flatMap(({ doc, texto }) => (texto?.secciones ?? []).map((x, i) => ({ doc, i, id: `lee-${doc}-${i + 1}`, titulo: x.titulo })));
}
// Cuánto del texto ya pasó por la pantalla (0 a 1): arriba = dónde empieza el texto respecto a la ventana, alto = su alto.
export function progresoLectura({ arriba, alto, ventana }) {
  if (!(alto > 0)) return 1;
  const visto = ventana - arriba;
  return Math.max(0, Math.min(1, visto / alto));
}
// Las casillas se pueden marcar cuando llegó al final del texto, o cuando abrió cada parte.
export const lecturaCompleta = ({ alFinal = false, abiertas = 0, total = 0 } = {}) => alFinal || (total > 0 && abiertas >= total);

// El texto de un documento en partes plegables (abiertas al empezar), cada una con su ancla para el índice.
export function textoTerminos(h, terminos, { doc = 'terminos', plegable = false, alAbrir = null } = {}) {
  const { el, t } = h;
  if (!plegable) {
    return el('div', { class: 'terminos-texto', tabindex: '0', 'aria-label': t(doc === 'privacidad' ? 'privacidad.titulo' : 'terminos.titulo') },
      terminos.secciones.map((x, i) => el('section', { id: `lee-${doc}-${i + 1}` }, el('h3', { texto: x.titulo }), h.talCual('p', x.texto))));
  }
  return el('div', { class: 'terminos-texto plegable' }, terminos.secciones.map((x, i) => {
    const parte = el('details', { class: 'lee-parte', id: `lee-${doc}-${i + 1}`, open: true },
      el('summary', {}, /^\d+[.)]/.test(x.titulo) ? null : el('span', { class: 'lee-parte-n', texto: String(i + 1) }), el('h3', { texto: x.titulo })),
      el('div', { class: 'lee-parte-texto' }, h.talCual('p', x.texto)));
    parte.addEventListener('toggle', () => alAbrir?.(parte));
    return parte;
  }));
}

// La lectura completa de los dos textos: el resumen, el índice (tocar salta ahí), las partes plegables, la barra de
// lectura y «Bajar al final». alFinal() se llama una vez, cuando llegó al final (o abrió cada parte después de cerrarlas).
export function lecturaTerminos(h, datos, { alFinal = () => {}, conResumen = true } = {}) {
  const { el, t, numero } = h;
  const docs = [{ doc: 'terminos', texto: datos.terminos }, { doc: 'privacidad', texto: datos.privacidad }];
  const indice = indiceDe(docs);
  const relleno = el('span', { class: 'lee-barra-relleno' });
  const barra = el('div', { class: 'lee-barra', role: 'progressbar', 'aria-label': t('lee.progreso'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, relleno);
  const cuenta = el('span', { class: 'lee-barra-cuenta suave chica', texto: '0 %' });
  let llego = false;
  const abiertasVistas = new Set();
  const avisarFinal = () => { if (!llego) { llego = true; alFinal(); } };
  // Las partes empiezan abiertas (el navegador avisa «toggle» al ponerlas): cuenta solo la que se cerró y se volvió a abrir.
  const cerradas = new Set();
  const alAbrir = parte => {
    if (!parte.open) { cerradas.add(parte.id); return; }
    if (cerradas.has(parte.id)) abiertasVistas.add(parte.id);
    if (lecturaCompleta({ abiertas: abiertasVistas.size, total: indice.length })) avisarFinal();
  };
  const fin = el('div', { class: 'lee-fin', id: 'lee-fin', tabindex: '-1' }, el('p', { class: 'suave chica', texto: t('lee.fin') }));
  const textos = el('div', { class: 'lee-textos' },
    docs.map(({ doc, texto }) => el('section', { class: 'lee-doc', 'aria-labelledby': `lee-${doc}-titulo` },
      el('h2', { id: `lee-${doc}-titulo`, class: 'terminos-subtitulo', texto: t(doc === 'privacidad' ? 'privacidad.titulo' : 'terminos.titulo') }),
      el('p', { class: 'suave chica', texto: t('terminos.version', { n: numero(texto.version) }) }),
      textoTerminos(h, texto, { doc, plegable: true, alAbrir }))),
    fin);
  const ir = id => {
    const destino = document.getElementById(id);
    if (!destino) return;
    if (destino.tagName === 'DETAILS') destino.open = true;
    destino.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    (destino.querySelector('summary') ?? destino).focus({ preventScroll: true });
  };
  const todas = () => [...textos.querySelectorAll('details.lee-parte')];
  const plegar = el('button', { type: 'button', class: 'boton-texto', texto: t('lee.cerrar_todo'), onclick: () => {
    const abrir = todas().every(d => !d.open);
    for (const d of todas()) d.open = abrir;
    plegar.textContent = t(abrir ? 'lee.cerrar_todo' : 'lee.abrir_todo');
  } });
  const nav = el('nav', { class: 'lee-indice', 'aria-labelledby': 'lee-indice-titulo' },
    el('h2', { id: 'lee-indice-titulo', texto: t('lee.indice') }),
    docs.map(({ doc }) => el('div', { class: 'lee-indice-grupo' },
      el('p', { class: 'lee-indice-doc', texto: t(doc === 'privacidad' ? 'privacidad.titulo' : 'terminos.titulo') }),
      el('ol', {}, indice.filter(x => x.doc === doc).map(x => el('li', {}, el('button', { type: 'button', class: 'lee-indice-ir', onclick: () => ir(x.id), texto: x.titulo })))))),
    el('div', { class: 'lee-indice-pie' }, plegar,
      el('button', { type: 'button', class: 'boton-texto con-icono', onclick: () => window.print() }, h.icono('manual'), el('span', { texto: t('lee.imprimir') }))));
  const bajar = el('button', { type: 'button', class: 'lee-bajar secundario con-icono', onclick: () => { ir('lee-fin'); avisarFinal(); } },
    h.icono('flecha', 'icono chico lee-bajar-icono'), el('span', { texto: t('lee.bajar') }));
  // La barra: cuánto del texto ya pasó por la pantalla. Al llegar al final, las casillas se pueden marcar.
  let pendiente = false;
  const medir = () => {
    pendiente = false;
    if (!textos.isConnected) return window.removeEventListener('scroll', alMover);
    const r = textos.getBoundingClientRect();
    const p = progresoLectura({ arriba: r.top, alto: r.height, ventana: window.innerHeight });
    const pct = Math.round(p * 100);
    relleno.style.width = `${pct}%`;
    barra.setAttribute('aria-valuenow', String(pct));
    cuenta.textContent = `${numero(pct)} %`;
    if (p >= 0.995 || fin.getBoundingClientRect().top < window.innerHeight) avisarFinal();
  };
  const alMover = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(medir); } };
  window.addEventListener('scroll', alMover, { passive: true });
  // Al imprimir o guardar en PDF sale todo, aunque alguna parte esté cerrada.
  const alImprimir = () => { if (!textos.isConnected) return window.removeEventListener('beforeprint', alImprimir); for (const d of todas()) d.open = true; };
  window.addEventListener('beforeprint', alImprimir);
  window.addEventListener('resize', alMover, { passive: true });
  setTimeout(medir, 50);
  const resumen = conResumen ? el('section', { class: 'lee-resumen', 'aria-labelledby': 'lee-resumen-titulo' },
    el('h2', { id: 'lee-resumen-titulo', class: 'con-icono' }, h.icono('chispa'), el('span', { texto: t('lee.resumen') })),
    el('ul', {}, RESUMEN_FIRMA.map(k => el('li', {}, el('strong', { texto: t(`lee.resumen.${k}`) }), el('span', { texto: t(`lee.resumen.${k}.texto`) })))),
    el('p', { class: 'suave chica', texto: t('lee.resumen.nota') })) : null;
  return {
    nodo: el('div', { class: 'lee' }, resumen, nav, el('div', { class: 'lee-barra-fila' }, barra, cuenta), textos, bajar),
    llego: () => llego,
  };
}

// 0.9.2 / 0.12.1: la firma dibujada con el dedo o el ratón, grande, con renglón, «Firma aquí», Deshacer y Borrar.
// → { nodo, vacia(), png() }. «Vacía» = menos de 20 puntos o un trazo de menos de 90 × 22 (un toque suelto no es una
// firma). El renglón y el «Firma aquí» van detrás del lienzo (no salen en la imagen de la firma).
export function padFirma(h, { id = 'propia' } = {}) {
  const { el, t } = h;
  const ANCHO = 720;
  const ALTO = 240;
  const lienzo = el('canvas', { class: 'firma-lienzo', width: ANCHO, height: ALTO, 'aria-label': t(id === 'tutor' ? 'firma.lienzo_tutor' : 'firma.lienzo'), role: 'img' });
  const ctx = lienzo.getContext('2d');
  const trazos = []; // cada trazo: [{ x, y }, …]
  let actual = null;
  let alCambiar = () => {};
  const pintar = () => {
    ctx.clearRect(0, 0, ANCHO, ALTO);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const tr of trazos) {
      ctx.beginPath();
      tr.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (tr.length === 1) ctx.lineTo(tr[0].x + 0.1, tr[0].y);
      ctx.stroke();
    }
    marco.classList.toggle('con-trazo', trazos.length > 0);
    deshacer.disabled = !trazos.length;
    borrar.disabled = !trazos.length;
  };
  const punto = e => {
    const r = lienzo.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * ANCHO) / r.width, y: ((e.clientY - r.top) * ALTO) / r.height };
  };
  lienzo.addEventListener('pointerdown', e => {
    e.preventDefault();
    lienzo.setPointerCapture?.(e.pointerId);
    actual = [punto(e)];
    trazos.push(actual);
    pintar();
  });
  lienzo.addEventListener('pointermove', e => {
    if (!actual) return;
    e.preventDefault();
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(actual.at(-1).x, actual.at(-1).y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    actual.push(p);
  });
  const soltar = () => { if (actual) { actual = null; alCambiar(); } };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('pointerleave', soltar);
  const deshacer = el('button', { type: 'button', class: 'secundario chico con-icono', onclick: () => { trazos.pop(); pintar(); alCambiar(); } }, h.icono('flecha', 'icono chico firma-deshacer-icono'), el('span', { texto: t('firma.deshacer') }));
  const borrar = el('button', { type: 'button', class: 'secundario chico con-icono', onclick: () => { trazos.length = 0; pintar(); alCambiar(); } }, h.icono('cerrar', 'icono chico'), el('span', { texto: t('firma.borrar') }));
  const marco = el('div', { class: 'firma-marco' },
    el('span', { class: 'firma-aqui', 'aria-hidden': 'true', texto: t('firma.aqui') }),
    el('span', { class: 'firma-x', 'aria-hidden': 'true', texto: '✕' }),
    lienzo);
  const vacia = () => {
    const todos = trazos.flat();
    if (todos.length < 20) return true;
    const xs = todos.map(p => p.x);
    const ys = todos.map(p => p.y);
    return Math.max(...xs) - Math.min(...xs) < 90 || Math.max(...ys) - Math.min(...ys) < 22;
  };
  pintar();
  return {
    nodo: el('div', { class: 'firma' },
      el('p', { class: 'firma-titulo', texto: t(id === 'tutor' ? 'firma.titulo_tutor' : 'firma.titulo') }),
      marco,
      el('div', { class: 'firma-pie' }, el('span', { class: 'suave chica', texto: t('firma.ayuda') }), el('span', { class: 'firma-botones' }, deshacer, borrar))),
    vacia,
    png: () => lienzo.toDataURL('image/png'),
    alCambiar: fn => { alCambiar = fn; },
  };
}

// Edad cumplida en una fecha (AAAA-MM-DD).
export function edad(nacimiento, hoy = new Date().toISOString().slice(0, 10)) {
  const [a, m, d] = String(nacimiento).split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  if (!a || !m || !d) return null;
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
function casilla(h, id, texto, { requerida = true, nota = null } = {}) {
  const c = h.el('input', { id, type: 'checkbox' });
  return { c, nodo: h.el('label', { class: `terminos-acepto${requerida ? '' : ' opcional'}`, for: id }, c, h.el('span', {}, h.el('span', { texto }), nota ? h.el('span', { class: 'suave chica', texto: nota }) : null)) };
}

// Los pasos, arriba: el número de cada uno (✓ los hechos), el nombre y la barra de avance.
export function pasosFirma(h, paso) {
  const { el, t, numero } = h;
  const n = PASOS_FIRMA.indexOf(paso) + 1;
  const pct = Math.round(((n - 1) / (PASOS_FIRMA.length - 1)) * 100);
  return el('nav', { class: 'firma-pasos', 'aria-label': t('terminos.pasos') },
    el('ol', {}, PASOS_FIRMA.map((p, k) => el('li', { class: k + 1 === n ? 'actual' : k + 1 < n ? 'hecho' : null, 'aria-current': k + 1 === n ? 'step' : null },
      el('span', { class: 'firma-paso-n', 'aria-hidden': 'true', texto: k + 1 < n ? '✓' : numero(k + 1) }),
      el('span', { class: 'firma-paso-nombre', texto: t(`firma.paso.${p}`) }),
      k + 1 < n ? el('span', { class: 'solo-lectores', texto: t('firma.paso.hecho') }) : null))),
    el('div', { class: 'firma-pasos-barra', role: 'progressbar', 'aria-label': t('firma.paso.de', { n: numero(n), total: numero(PASOS_FIRMA.length) }), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct },
      el('span', { style: `width: ${pct}%` })));
}
// Lo que pasa en este paso (y lo que viene después).
function introPaso(h, paso, extra = {}) {
  const { el, t, numero } = h;
  const n = PASOS_FIRMA.indexOf(paso) + 1;
  return el('header', { class: 'firma-intro' },
    el('p', { class: 'antetitulo', texto: t('firma.paso.de', { n: numero(n), total: numero(PASOS_FIRMA.length) }) }),
    el('h1', { tabindex: '-1', texto: t(`firma.${paso}.titulo`, extra) }),
    el('p', { class: 'firma-intro-linea', texto: t(`firma.${paso}.linea`, extra) }),
    paso !== 'listo' ? el('p', { class: 'firma-intro-despues suave chica', texto: t(`firma.${paso}.despues`, extra) }) : null);
}

// La pantalla para firmar, por pasos: 1 Tus datos (nombre, apellido, nacimiento) → 2 Lee (lo importante en 1 minuto, el
// texto completo con índice y las casillas, que se pueden marcar al llegar al final) → 3 Firma («Yo, …», la firma y, si
// es menor de 18, la parte del padre, madre o tutor) → 4 Listo («Descargar mi copia»). El servidor recibe lo mismo de
// siempre (POST /api/yo/terminos) al tocar «Firmar».
export function pantallaAceptar(datos, h, { alListo, salir }) {
  const { el, t, numero } = h;
  const legal = datos.estado.nombreLegal;
  const fijo = legal?.confirmado === true;
  const campoNombre = el('input', { id: 'campo-legal-nombre', type: 'text', maxlength: 60, autocomplete: 'given-name', autocapitalize: 'words', value: legal?.nombre ?? '', readonly: fijo || null });
  const campoApellido = el('input', { id: 'campo-legal-apellido', type: 'text', maxlength: 60, autocomplete: 'family-name', autocapitalize: 'words', value: legal?.apellido ?? '', readonly: fijo || null });
  const campoNacimiento = el('input', { id: 'campo-nacimiento', type: 'date', value: datos.estado.nacimiento ?? '', max: new Date().toISOString().slice(0, 10), autocomplete: 'bday' });
  const mensaje = h.caja();
  const caja = el('section', { class: 'tarjeta terminos-pantalla firma-flujo' });
  // Lo que se lleva de un paso a otro (volver atrás no borra nada).
  const s = { nombre: null, apellido: null, nacimiento: null, menor: false };
  const c1 = casilla(h, 'campo-acepto', '');
  const c2 = casilla(h, 'campo-acepto-privacidad', t('terminos.acepto_privacidad', { n: numero(datos.privacidad.version) }));
  const c3 = casilla(h, 'campo-acepto-ia', t('terminos.acepto_ia'), { requerida: false, nota: t('terminos.acepto_ia.nota') });
  let leido = false;
  const mostrarPaso = (paso, contenido, extra) => {
    caja.dataset.paso = paso;
    caja.replaceChildren(...[h.marcaConLogo(), pasosFirma(h, paso), introPaso(h, paso, extra), ...contenido].filter(Boolean));
    window.scrollTo({ top: 0 });
    caja.querySelector('.firma-intro h1')?.focus({ preventScroll: true });
  };

  const paso1 = () => {
    const formulario = el('form', { novalidate: true, class: 'firma-datos' },
      el('label', { for: 'campo-legal-nombre', texto: t('terminos.nombre') }), campoNombre,
      el('label', { for: 'campo-legal-apellido', texto: t('terminos.apellido') }), campoApellido,
      el('p', { class: 'ayuda', texto: t(fijo ? 'terminos.nombre.fijo' : legal ? 'terminos.nombre.confirma' : 'terminos.nombre.ayuda') }),
      el('label', { for: 'campo-nacimiento', texto: t('terminos.nacimiento') }), campoNacimiento,
      el('p', { class: 'ayuda', texto: t('terminos.nacimiento.ayuda') }),
      el('div', { class: 'botones apilados' },
        el('button', { type: 'submit', class: 'boton-3d grande', texto: t('firma.datos.seguir') }),
        el('button', { type: 'button', class: 'secundario', texto: t('menu.salir'), onclick: salir })),
      mensaje);
    formulario.addEventListener('submit', e => {
      e.preventDefault();
      const n = parteValida(campoNombre.value);
      const a = parteValida(campoApellido.value);
      if (!n || !a) return h.decir(mensaje, t('error.nombre_legal_no_valido'), 'error');
      const anos = edad(campoNacimiento.value);
      if (anos == null || anos < 5 || anos > 110) return h.decir(mensaje, t('error.nacimiento_no_valido'), 'error');
      Object.assign(s, { nombre: n, apellido: a, nacimiento: campoNacimiento.value, menor: anos < 18 });
      h.decir(mensaje, '');
      paso2();
    });
    mostrarPaso('datos', [formulario]);
  };

  const paso2 = () => {
    c1.nodo.querySelector('span > span').textContent = t('terminos.yo_acepto', { nombre: `${s.nombre} ${s.apellido}`, n: numero(datos.terminos.version) });
    const seguir = el('button', { type: 'button', class: 'boton-3d grande', texto: t('firma.lee.seguir') });
    const nota = el('p', { class: 'lee-candado suave', role: 'status', 'aria-live': 'polite' });
    const casillas = [c1, c2, c3];
    const pintar = () => {
      for (const x of casillas) { x.c.disabled = !leido; x.nodo.classList.toggle('bloqueada', !leido); }
      nota.textContent = leido ? t('lee.ya_puedes') : t('lee.candado');
      seguir.disabled = !(leido && c1.c.checked && c2.c.checked);
    };
    for (const x of casillas) x.c.onchange = pintar;
    const lectura = lecturaTerminos(h, datos, { alFinal: () => { leido = true; pintar(); } });
    if (leido) lectura.llego = () => true;
    seguir.addEventListener('click', () => { if (!seguir.disabled) paso3(); });
    pintar();
    mostrarPaso('lee', [lectura.nodo,
      el('section', { class: 'lee-casillas', 'aria-labelledby': 'lee-casillas-titulo' },
        el('h2', { id: 'lee-casillas-titulo', texto: t('lee.casillas') }), nota, c1.nodo, c2.nodo, c3.nodo),
      el('div', { class: 'botones apilados' }, seguir,
        el('button', { type: 'button', class: 'secundario', texto: t('firma.atras'), onclick: paso1 }))]);
  };

  const paso3 = () => {
    const nombre = `${s.nombre} ${s.apellido}`;
    const boton = el('button', { type: 'button', class: 'boton-3d grande', disabled: true, texto: t('firma.firma.boton') });
    const pad = padFirma(h);
    const tutorNombre = el('input', { id: 'campo-tutor-nombre', type: 'text', maxlength: 120, autocomplete: 'off' });
    const tutorRelacion = el('select', { id: 'campo-tutor-relacion' }, ['madre', 'padre', 'tutor'].map(r => el('option', { value: t(`terminos.tutor.rel.${r}`), texto: t(`terminos.tutor.rel.${r}`) })));
    const tutorContacto = el('input', { id: 'campo-tutor-contacto', type: 'text', maxlength: 120, autocomplete: 'off', inputmode: 'email' });
    const padTutor = s.menor ? padFirma(h, { id: 'tutor' }) : null;
    const c4 = s.menor ? casilla(h, 'campo-tutor-acepto', t('terminos.tutor.acepto')) : null;
    const listo = () => c1.c.checked && c2.c.checked && !pad.vacia() && (!s.menor || (parteValida(tutorNombre.value) && tutorContacto.value.trim().length >= 5 && !padTutor.vacia() && c4.c.checked));
    const pintarBoton = () => { boton.disabled = !listo(); };
    pad.alCambiar(pintarBoton);
    padTutor?.alCambiar(pintarBoton);
    c4?.c.addEventListener('change', pintarBoton);
    for (const x of [tutorNombre, tutorContacto]) x.addEventListener('input', pintarBoton);
    boton.addEventListener('click', async () => {
      if (!listo()) return h.decir(mensaje, t('error.firma_falta'), 'error');
      boton.disabled = true;
      boton.setAttribute('aria-busy', 'true');
      const r = await h.api('POST', '/api/yo/terminos', {
        version: datos.terminos.version, versionPrivacidad: datos.privacidad.version, nombre: s.nombre, apellido: s.apellido, nacimiento: s.nacimiento,
        acepto: c1.c.checked, aceptoPrivacidad: c2.c.checked, aceptoIa: c3.c.checked, firma: pad.png(),
        ...(s.menor ? { tutor: { nombre: tutorNombre.value, relacion: tutorRelacion.value, contacto: tutorContacto.value, acepto: c4.c.checked, firma: padTutor.png() } } : {}),
      });
      boton.removeAttribute('aria-busy');
      if (!r.ok) { boton.disabled = false; return h.decir(mensaje, h.textoError(r.datos.error), 'error'); }
      paso4(r.datos.estado);
    });
    mostrarPaso('firma', [
      el('div', { class: 'firma-yo' },
        el('p', { class: 'firma-yo-frase', texto: t('firma.firma.yo', { nombre, t: numero(datos.terminos.version), p: numero(datos.privacidad.version) }) }),
        el('p', { class: 'terminos-declaracion', texto: datos.declaracion ?? '' })),
      pad.nodo,
      s.menor ? el('fieldset', { class: 'terminos-tutor' },
        el('legend', { texto: t('terminos.tutor.titulo') }),
        el('p', { class: 'suave', texto: t('terminos.tutor.linea') }),
        el('label', { for: 'campo-tutor-nombre', texto: t('terminos.tutor.nombre') }), tutorNombre,
        el('label', { for: 'campo-tutor-relacion', texto: t('terminos.tutor.relacion') }), tutorRelacion,
        el('label', { for: 'campo-tutor-contacto', texto: t('terminos.tutor.contacto') }), tutorContacto,
        padTutor.nodo, c4.nodo) : null,
      el('div', { class: 'botones apilados' }, boton,
        el('button', { type: 'button', class: 'secundario', texto: t('firma.atras'), onclick: paso2 })),
      mensaje], { nombre });
  };

  const paso4 = async estado => {
    // Su copia: la firma recién guardada (la última de «Mis documentos»).
    const d = await h.api('GET', '/api/yo/documentos');
    const ultimo = d.ok && d.datos.documentos.length ? d.datos.documentos.at(-1) : null;
    const entrar = el('button', { type: 'button', class: 'boton-3d grande', texto: t('firma.listo.entrar'), onclick: () => alListo(estado) });
    mostrarPaso('listo', [
      el('div', { class: 'firma-listo' },
        el('div', { class: 'firma-listo-sello', 'aria-hidden': 'true', texto: '✓' }),
        el('dl', { class: 'ficha-datos firma-listo-datos' },
          el('dt', { texto: t('firma.listo.como') }), el('dd', { texto: `${s.nombre} ${s.apellido}` }),
          el('dt', { texto: t('firma.listo.versiones') }), el('dd', { texto: t('contratos.versiones', { t: numero(datos.terminos.version), p: numero(datos.privacidad.version) }) }),
          el('dt', { texto: t('firma.listo.ia') }), el('dd', { texto: t(c3.c.checked ? 'firma.listo.ia.si' : 'firma.listo.ia.no') }))),
      el('p', { class: 'suave', texto: t('firma.listo.donde') }),
      el('div', { class: 'botones apilados' }, entrar,
        ultimo ? el('button', { type: 'button', class: 'secundario con-icono', onclick: () => alListo(estado, `#mi-documento/${ultimo.n}`) }, h.icono('manual'), el('span', { texto: t('firma.listo.copia') })) : null)]);
  };
  paso1();
  return caja;
}

const TEXTO_REVISA = {
  reembolso: 'terminos.admin.revisa.reembolso', devolucion: 'terminos.admin.revisa.devolucion', activacion: 'terminos.admin.revisa.activacion',
  chat: 'terminos.admin.revisa.chat', alojamiento: 'terminos.admin.revisa.alojamiento', contacto: 'terminos.admin.revisa.contacto', retencion: 'terminos.admin.revisa.retencion',
};
// Administrador → Contenido: los textos en uso (términos y privacidad) y publicar una versión nueva.
// Cada parte: primera línea = título; las partes van separadas por una línea en blanco.
export function tarjetaAdminTerminos(datos, h, { alPublicar }) {
  const { el, t, numero } = h;
  const editor = doc => {
    const actual = datos[doc];
    const area = el('textarea', { id: `campo-${doc}`, rows: 14, class: 'terminos-editor' });
    area.value = actual.secciones.map(x => `${x.titulo}\n${x.texto}`).join('\n\n');
    const mensaje = h.caja();
    const publicar = h.botonAccion(t('terminos.admin.publicar', { n: numero(actual.version + 1) }), '', mensaje, async () => {
      const secciones = area.value.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
        const [titulo, ...resto] = b.split('\n');
        return { titulo: titulo.trim(), texto: resto.join('\n').trim() };
      });
      if (!secciones.length || secciones.some(x => !x.titulo || !x.texto)) throw new Error(t('error.terminos_no_validos'));
      if (!confirm(t('terminos.admin.confirmar', { n: numero(actual.version + 1) }))) return;
      const r = await h.api('POST', '/api/admin/terminos', { doc, secciones });
      if (!r.ok) throw new Error(h.textoError(r.datos.error));
      h.avisar(t('terminos.admin.listo', { n: numero(r.datos[doc].version) }));
      await alPublicar();
    }, 'marca');
    return el('details', {},
      el('summary', { texto: t(doc === 'terminos' ? 'terminos.admin.editar' : 'terminos.admin.editar_privacidad', { n: numero(actual.version) }) }),
      el('p', { class: 'ayuda', texto: t('terminos.admin.ayuda') }),
      el('label', { for: `campo-${doc}`, texto: t('terminos.admin.texto') }), area,
      el('div', { class: 'botones' }, publicar), mensaje);
  };
  // 0.11.0: lo que se llenó por Junior en los textos del informe legal: que lo confirme o lo cambie.
  const revisar = el('div', { class: 'aviso terminos-revisa', role: 'note' },
    el('strong', { texto: t('terminos.admin.revisa') }),
    el('ul', {}, ['reembolso', 'devolucion', 'activacion', 'chat', 'alojamiento', 'contacto', 'retencion'].map(k => el('li', { texto: t(TEXTO_REVISA[k]) }))),
    el('p', { class: 'chica', texto: t('terminos.admin.revisa.linea') }));
  return el('section', { class: 'tarjeta', 'aria-labelledby': 'terminos-admin-titulo' },
    el('h2', { id: 'terminos-admin-titulo', class: 'con-icono' }, h.icono('manual'), el('span', { texto: t('terminos.admin.titulo') })),
    revisar,
    el('p', { class: 'suave', texto: t('terminos.admin.linea2', { t: numero(datos.terminos.version), p: numero(datos.privacidad.version), si: numero(datos.aceptaron), total: numero(datos.cuentas) }) }),
    editor('terminos'), editor('privacidad'));
}
