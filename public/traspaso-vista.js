// Academia 0.14.83: Administrador → Avanzado → «Traspaso (para otro Claude)» (src/api/traspaso.js). Todo lo que otra
// sesión de Claude necesita para tomar el proyecto. Lo secreto se abre SOLO con la contraseña del administrador.
//  - La contraseña vive solo en la memoria de esta pantalla (nunca en el almacenamiento del navegador), como mucho 10
//    minutos; después, o al salir de la pantalla, o al tocar «Cerrar ahora», se olvida (y lo abierto también).
//  - Sin librerías; todo texto con textContent y sin estilos en línea. h: { el, t, icono, avisar, api, textoError }.

export const RUTA_TRASPASO = 'traspaso';
const CAMPOS = Object.freeze([
  { id: 'driveContenido', tipo: 'url', clave: 'tr.campo.drive_contenido' },
  { id: 'driveFuentes', tipo: 'url', clave: 'tr.campo.drive_fuentes' },
  { id: 'repo', tipo: 'url', clave: 'tr.campo.repo' },
  { id: 'servidor', tipo: 'texto', clave: 'tr.campo.servidor', filas: 5, max: 4000 },
  { id: 'notas', tipo: 'texto', clave: 'tr.campo.notas', filas: 10, max: 20000 },
  { id: 'pendientes', tipo: 'texto', clave: 'tr.campo.pendientes', filas: 5, max: 8000 },
]);
export const MAX_PROPIOS = 30;

// Lo abierto: { clave, vence, contenido, markdown, info }. Solo en memoria.
let abierto = null;
let reloj = null;
let escuchando = false;
// 10 minutos, contados con el reloj de ESTE equipo (nunca con la hora del servidor: si el teléfono va atrasado o
// adelantado, igual son 10 minutos).
const VENCE_MAX_MS = 10 * 60 * 1000;
let venceMs = VENCE_MAX_MS;

export function cerrarTraspaso() {
  if (reloj) clearInterval(reloj);
  reloj = null;
  if (abierto) {
    abierto.clave = '';
    abierto.contenido = null;
    abierto.markdown = '';
  }
  abierto = null;
}
export const estaAbierto = () => Boolean(abierto && abierto.vence > Date.now());

function escucharSalida() {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  window.addEventListener('hashchange', () => { if (location.hash.replace('#', '') !== RUTA_TRASPASO) cerrarTraspaso(); });
  window.addEventListener('pagehide', () => cerrarTraspaso());
}

const mb = (t, x) => (x?.libreMb != null ? t('tr.mb', { libre: String(x.libreMb), total: x.totalMb != null ? String(x.totalMb) : '—' }) : '—');

export function pantallaTraspaso(datos, h, redibujar) {
  const { el, t, icono } = h;
  escucharSalida();
  if (abierto && (abierto.vence <= Date.now() || abierto.usuarioId !== h.usuarioId)) cerrarTraspaso();
  venceMs = Number(datos.venceMs) > 0 ? Math.min(Number(datos.venceMs), VENCE_MAX_MS) : VENCE_MAX_MS;
  const info = (abierto?.info ? { ...datos.info, ...abierto.info } : datos.info) ?? {};
  const boveda = datos.boveda ?? {};
  const origen = typeof location !== 'undefined' ? location.origin : '';

  const fila = (etiqueta, valor) => el('div', { class: 'tr-dato' }, el('dt', { texto: etiqueta }), el('dd', {}, valor));
  const repoDato = () => {
    if (info.repo) return el('a', { href: info.repo, target: '_blank', rel: 'noopener noreferrer', class: 'tr-enlace', texto: info.repo });
    const campo = el('input', { id: 'tr-repo-publico', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', maxlength: 300, placeholder: t('tr.repo.ejemplo'), 'aria-label': t('tr.dato.repo') });
    const guardar = async () => {
      const r = await h.api('POST', '/api/admin/traspaso/repo', { repo: campo.value });
      if (!r.ok) return h.avisar?.(h.textoError(r.datos.error), 'mal');
      datos.info = r.datos.info;
      redibujar();
    };
    return el('span', { class: 'tr-repo-editar' }, campo, el('button', { type: 'button', class: 'secundario', texto: t('tr.repo.guardar'), onclick: guardar }));
  };
  const publico = el('section', { class: 'tarjeta tr-publico' },
    el('h2', { class: 'con-icono' }, icono('servidor'), el('span', { texto: t('tr.publico.titulo') })),
    el('p', { class: 'ayuda', texto: t('tr.publico.linea') }),
    el('dl', { class: 'tr-datos' },
      fila(t('tr.dato.version'), info.version ?? '—'),
      fila(t('tr.dato.repo'), repoDato()),
      fila(t('tr.dato.origen'), origen || '—'),
      fila(t('tr.dato.disco'), mb(t, info.disco)),
      fila(t('tr.dato.memoria'), mb(t, info.memoria)),
      fila(t('tr.dato.migracion'), String(info.migracion ?? '—')),
      fila(t('tr.dato.alumnos'), String(info.alumnos ?? '—')),
      fila(t('tr.dato.cursos'), String(info.cursos ?? '—'))));

  const cabeza = el('section', { class: 'tarjeta tr-cabeza' },
    el('h1', { class: 'con-icono' }, icono('llave'), el('span', { texto: t('tr.titulo') })),
    el('p', { class: 'ayuda tr-nota', texto: t('tr.nota') }));

  return el('div', { class: 'traspaso' }, cabeza, estaAbierto() ? vistaAbierta(h, redibujar, origen) : vistaCerrada(h, redibujar, boveda, origen), publico);
}

// ---------- cerrado: pedir la contraseña ----------
function vistaCerrada(h, redibujar, boveda, origen) {
  const { el, t, icono } = h;
  const campo = el('input', { id: 'tr-clave', type: 'password', autocomplete: 'current-password', maxlength: 200, required: true });
  const anterior = el('input', { id: 'tr-anterior', type: 'password', autocomplete: 'off', maxlength: 200 });
  const error = el('p', { class: 'mensaje error', role: 'alert', id: 'tr-error', hidden: true });
  const lineaOtra = el('p', { class: 'aviso', texto: t('tr.otra_clave') });
  const etiquetaAnterior = el('label', { for: 'tr-anterior', texto: t('tr.anterior') });
  // «Empezar de nuevo» pide un segundo toque (lo de antes queda guardado aparte, pero ya no se ve aquí).
  const seguro = el('div', { class: 'tr-seguro', hidden: true },
    el('p', { class: 'aviso', texto: t('tr.empezar.seguro') }),
    el('button', { type: 'button', class: 'peligro tr-empezar-si', texto: t('tr.empezar.si'), onclick: () => enviar('/api/admin/traspaso/empezar') }));
  const cajaAnterior = el('div', { class: 'tr-anterior', hidden: true },
    lineaOtra,
    etiquetaAnterior,
    anterior,
    el('p', { class: 'suave chica', texto: t('tr.empezar.linea') }),
    el('button', { type: 'button', class: 'secundario tr-empezar', texto: t('tr.empezar'), onclick: () => { seguro.hidden = false; } }),
    seguro);
  const boton = el('button', { type: 'submit', class: 'boton-3d azul con-icono tr-abrir' }, icono('llave'), el('span', { texto: t('tr.abrir') }));
  const decir = clave => { error.hidden = false; error.textContent = h.textoError(clave); };
  const recibir = (r, clave) => {
    abierto = { clave, usuarioId: h.usuarioId, vence: Date.now() + venceMs, contenido: r.datos.contenido, markdown: r.datos.markdown, info: r.datos.info };
    redibujar();
  };
  async function enviar(ruta, extra = {}) {
    const clave = campo.value;
    if (!clave) { decir('traspaso_falta_clave'); campo.focus(); return; }
    boton.disabled = true;
    const r = await h.api('POST', ruta, { clave, origen, ...extra });
    boton.disabled = false;
    if (r.ok) return recibir(r, clave);
    if (r.datos.error === 'traspaso_otra_clave') { cajaAnterior.hidden = false; anterior.focus(); }
    if (r.datos.error === 'traspaso_danado') { cajaAnterior.hidden = false; anterior.hidden = true; etiquetaAnterior.hidden = true; lineaOtra.hidden = true; }
    decir(r.datos.error);
  }
  const formulario = el('form', { class: 'tr-form-clave', novalidate: true },
    el('label', { for: 'tr-clave', texto: t('tr.clave') }),
    campo,
    cajaAnterior,
    error,
    el('div', { class: 'botones' }, boton));
  formulario.addEventListener('submit', e => {
    e.preventDefault();
    enviar('/api/admin/traspaso/abrir', anterior.value ? { anterior: anterior.value } : {});
  });
  return el('section', { class: 'tarjeta tr-cerrado' },
    el('h2', { class: 'con-icono' }, icono('escudo'), el('span', { texto: t('tr.cerrado.titulo') })),
    el('p', { class: 'ayuda', texto: t(boveda.existe ? 'tr.cerrado.linea' : 'tr.cerrado.primera') }),
    formulario);
}

// ---------- abierto: editar, copiar, descargar ----------
function vistaAbierta(h, redibujar, origen) {
  const { el, t, icono } = h;
  const c = abierto.contenido ?? {};
  let sucio = false;
  const marcar = () => { sucio = true; estado.textContent = t('tr.sin_guardar'); };
  const campos = {};
  const bloques = CAMPOS.map(x => {
    const id = `tr-${x.id}`;
    const attrs = { id, autocomplete: 'off', spellcheck: 'false', placeholder: t(`${x.clave}.ejemplo`), oninput: marcar };
    const campo = x.tipo === 'url'
      ? el('input', { ...attrs, type: 'url', inputmode: 'url', maxlength: 500 })
      : el('textarea', { ...attrs, rows: x.filas, maxlength: x.max });
    campo.value = String(c[x.id] ?? '');
    campos[x.id] = campo;
    return el('div', { class: 'tr-campo' }, el('label', { for: id, texto: t(x.clave) }), campo);
  });
  const listaPropios = el('div', { class: 'tr-propios' });
  const propios = [];
  const botonMas = el('button', { type: 'button', class: 'secundario con-icono tr-mas' }, icono('mas'), el('span', { texto: t('tr.propio.agregar') }));
  const ponerPropio = (p = { nombre: '', valor: '' }) => {
    const n = propios.length + 1;
    const nombre = el('input', { type: 'text', autocomplete: 'off', maxlength: 60, placeholder: t('tr.propio.nombre.ejemplo'), 'aria-label': t('tr.propio.nombre', { n: String(n) }), oninput: marcar });
    const valor = el('textarea', { rows: 2, autocomplete: 'off', spellcheck: 'false', maxlength: 4000, placeholder: t('tr.propio.valor.ejemplo'), 'aria-label': t('tr.propio.valor', { n: String(n) }), oninput: marcar });
    nombre.value = p.nombre ?? '';
    valor.value = p.valor ?? '';
    const item = { nombre, valor, caja: null };
    item.caja = el('div', { class: 'tr-propio' }, nombre, valor,
      el('button', { type: 'button', class: 'secundario chico tr-quitar', 'aria-label': t('tr.propio.quitar'), onclick: () => {
        propios.splice(propios.indexOf(item), 1);
        item.caja.remove();
        botonMas.disabled = propios.length >= MAX_PROPIOS;
        marcar();
      } }, icono('cerrar', 'icono chico')));
    propios.push(item);
    listaPropios.append(item.caja);
    botonMas.disabled = propios.length >= MAX_PROPIOS;
  };
  for (const p of c.propios ?? []) ponerPropio(p);
  botonMas.addEventListener('click', () => { if (propios.length < MAX_PROPIOS) { ponerPropio(); marcar(); propios.at(-1).nombre.focus(); } });

  const estado = el('p', { class: 'suave chica tr-estado', role: 'status', texto: '' });
  const cuenta = el('span', { class: 'tr-cuenta' });
  const pre = el('pre', { class: 'pc-pre tr-pre', texto: abierto.markdown ?? '' });
  const detalles = el('details', { class: 'tarjeta tr-markdown' }, el('summary', { texto: t('tr.ver_texto') }), pre);

  const leer = () => ({
    ...Object.fromEntries(CAMPOS.map(x => [x.id, campos[x.id].value])),
    propios: propios.map(p => ({ nombre: p.nombre.value, valor: p.valor.value })),
  });
  async function guardar() {
    if (!estaAbierto()) { cerrarTraspaso(); redibujar(); return false; }
    estado.textContent = t('tr.guardando');
    const r = await h.api('POST', '/api/admin/traspaso/guardar', { clave: abierto.clave, contenido: leer(), origen });
    if (!r.ok) {
      estado.textContent = h.textoError(r.datos.error);
      if (r.datos.error === 'traspaso_clave_incorrecta' || r.datos.error === 'traspaso_otra_clave') { cerrarTraspaso(); redibujar(); }
      return false;
    }
    abierto.contenido = r.datos.contenido;
    abierto.markdown = r.datos.markdown;
    abierto.info = r.datos.info;
    pre.textContent = abierto.markdown;
    sucio = false;
    estado.textContent = t('tr.guardado');
    return true;
  }
  async function copiar() {
    // Con cambios sin guardar, primero se guarda y se pide otro toque: el iPhone solo deja copiar justo al tocar.
    if (sucio) {
      if (await guardar()) h.avisar?.(t('tr.copiar_otra_vez'), 'bien');
      return;
    }
    try {
      await navigator.clipboard.writeText(abierto.markdown);
      h.avisar?.(t('tr.copiado'), 'bien');
    } catch {
      detalles.open = true;
      h.avisar?.(t('tr.no_copiado'), 'mal');
    }
  }
  async function descargar() {
    if (sucio && !(await guardar())) return;
    const url = URL.createObjectURL(new Blob([abierto.markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = el('a', { href: url, download: `traspaso-${new Date().toISOString().slice(0, 10)}.md`, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const mostrarCuenta = () => {
    const quedan = Math.max(0, Math.ceil(((abierto?.vence ?? 0) - Date.now()) / 1000));
    if (!abierto || quedan <= 0) { cerrarTraspaso(); redibujar(); return; }
    const m = Math.floor(quedan / 60);
    const s = String(Math.floor(quedan % 60)).padStart(2, '0');
    cuenta.textContent = t('tr.abierto.cuenta', { tiempo: `${m}:${s}` });
  };
  if (reloj) clearInterval(reloj);
  reloj = setInterval(mostrarCuenta, 1000);
  mostrarCuenta();

  const formulario = el('form', { class: 'tr-form', novalidate: true },
    ...bloques,
    el('h3', { texto: t('tr.propios.titulo') }),
    el('p', { class: 'suave chica', texto: t('tr.propios.linea', { n: String(MAX_PROPIOS) }) }),
    listaPropios,
    el('div', { class: 'botones' }, botonMas),
    el('div', { class: 'botones' }, el('button', { type: 'submit', class: 'boton-3d verde con-icono tr-guardar' }, icono('bien'), el('span', { texto: t('tr.guardar') }))),
    estado);
  formulario.addEventListener('submit', e => { e.preventDefault(); guardar(); });

  return el('div', { class: 'tr-abierto' },
    el('section', { class: 'tarjeta tr-acciones' },
      el('p', { class: 'aviso con-icono-arriba tr-abierto-aviso' }, icono('escudo', 'icono chico'), el('span', { texto: t('tr.abierto.linea') }), cuenta),
      el('div', { class: 'botones' },
        el('button', { type: 'button', class: 'boton-3d azul con-icono tr-copiar', onclick: copiar }, icono('tarjetas'), el('span', { texto: t('tr.copiar') })),
        el('button', { type: 'button', class: 'boton-3d blanco con-icono tr-descargar', onclick: descargar }, icono('carpeta'), el('span', { texto: t('tr.descargar') })),
        el('button', { type: 'button', class: 'secundario con-icono tr-cerrar', onclick: () => { cerrarTraspaso(); redibujar(); } }, icono('cerrar'), el('span', { texto: t('tr.cerrar') })))),
    el('section', { class: 'tarjeta tr-secretos' },
      el('h2', { class: 'con-icono' }, icono('llave'), el('span', { texto: t('tr.secretos.titulo') })),
      el('p', { class: 'ayuda', texto: t('tr.secretos.linea') }),
      formulario),
    detalles);
}
