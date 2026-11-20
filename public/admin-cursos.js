// Academia 0.14.79: los cursos en las pantallas del Administrador (solo se carga ahí; los alumnos nunca bajan este archivo).
//  - El filtro «Todos los cursos» / cada curso: el mismo en Alumnos, Cómo van todos, Notas por materia (y su CSV y
//    «Copiar»), Certificados, Reporte, Comparar un examen y la Competencia. Se recuerda en ESTE navegador (localStorage,
//    con try/catch: sin él, «Todos los cursos»). Las filas ya traen su curso (enCurso) del servidor: aquí solo se filtra.
//  - La pantalla «Cursos» (Alumnos → Cursos, #cursos): crear («Grupo Piloto N», el que sigue), cambiar el nombre y
//    archivar o volver a abrir. Nunca se borra un curso.
// Las piezas de dibujo (el, t, icono…) llegan de app.js en «h». Todo texto va con textContent.

export const CLAVE_FILTRO = 'academia.admin.curso';
export const TODOS = 'todos';

// Lo recordado (o «todos»). almacen: localStorage (o lo que se le pase, en las pruebas).
export function leerFiltro(almacen = globalThis.localStorage) {
  try {
    const v = almacen?.getItem(CLAVE_FILTRO);
    return v && /^\d{1,9}$/.test(v) ? Number(v) : TODOS;
  } catch { return TODOS; }
}
export function guardarFiltro(valor, almacen = globalThis.localStorage) {
  try {
    if (valor === TODOS || valor == null || valor === '') almacen?.removeItem(CLAVE_FILTRO);
    else almacen?.setItem(CLAVE_FILTRO, String(Number(valor)));
  } catch { /* sin almacenamiento: el filtro vale solo mientras la pantalla está abierta */ }
}
// El filtro que vale con estos cursos: uno que ya no existe vuelve a «todos».
export function filtroValido(filtro, cursos = []) {
  if (filtro === TODOS || filtro == null) return TODOS;
  return cursos.some(c => c.id === Number(filtro)) ? Number(filtro) : TODOS;
}
// Las filas de ese curso (por su campo enCurso). «todos»: todas.
export function filtrarPorCurso(lista, filtro, campo = 'enCurso') {
  if (filtro === TODOS || filtro == null) return [...(lista ?? [])];
  return (lista ?? []).filter(x => x?.[campo]?.id === Number(filtro));
}
// Los datos de una pantalla con sus filas filtradas (lista: el nombre del arreglo). → { ...d, [lista]: filtradas }
export function datosDelCurso(d, filtro, lista = 'alumnos', campo = 'enCurso') {
  return { ...d, [lista]: filtrarPorCurso(d?.[lista], filtro, campo) };
}
// Lo que se le agrega a una dirección del servidor (?curso=N o nada).
export function consultaCurso(filtro, primera = true) {
  return filtro === TODOS || filtro == null ? '' : `${primera ? '?' : '&'}curso=${Number(filtro)}`;
}
// El nombre del curso para mostrar debajo de un nombre (solo si hay más de un curso: con uno solo no dice nada nuevo).
export function nombreCursoFila(fila, cursos = []) {
  return cursos.length > 1 && fila?.enCurso?.nombre ? fila.enCurso.nombre : '';
}

// ---------- El selector ----------
// cursos: [{ id, nombre, archivado }]. alCambiar(valor): por defecto guarda y vuelve a dibujar (h.recargar).
export function selectorCurso(h, cursos, filtro, { alCambiar = null, id = 'filtro-curso' } = {}) {
  const { el, t } = h;
  const lista = Array.isArray(cursos) ? cursos : [];
  const actual = filtroValido(filtro, lista);
  const opciones = [
    el('option', { value: TODOS, texto: t('cursos.filtro.todos') }),
    ...lista.map(c => el('option', { value: String(c.id), texto: c.archivado ? t('cursos.archivado_nombre', { nombre: c.nombre }) : c.nombre })),
  ];
  const select = el('select', { id, class: 'filtro-curso-select', 'data-filtro-curso': '1' }, opciones);
  select.value = String(actual);
  select.addEventListener('change', () => {
    const v = select.value === TODOS ? TODOS : Number(select.value);
    guardarFiltro(v);
    if (alCambiar) alCambiar(v);
    else h.recargar?.();
  });
  return el('div', { class: 'filtro-curso' },
    el('label', { for: id, class: 'filtro-curso-etiqueta con-icono' }, h.icono ? h.icono('personas', 'icono chico') : null, el('span', { texto: t('cursos.filtro') })),
    select);
}
// Una etiqueta chica con el nombre del curso (o null si no hace falta).
export function chipCurso(h, fila, cursos) {
  const nombre = nombreCursoFila(fila, cursos);
  return nombre ? h.el('span', { class: 'chip-curso', texto: nombre }) : null;
}

// ---------- Cambiar de curso a un alumno (su ficha → Cuenta) ----------
export function moverDeCurso(h, alumnoId, curso, cursos) {
  const { el, t } = h;
  const mensaje = h.caja();
  const activos = (cursos ?? []).filter(c => !c.archivado || c.id === curso?.id);
  const select = el('select', { id: 'campo-mover-curso', name: 'curso' }, activos.map(c => el('option', { value: String(c.id), texto: c.archivado ? t('cursos.archivado_nombre', { nombre: c.nombre }) : c.nombre })));
  if (curso) select.value = String(curso.id);
  const boton = h.botonAccion(t('cursos.mover.boton'), 'secundario', mensaje, async () => {
    const r = await h.api('POST', `/api/admin/academia/alumnos/${encodeURIComponent(alumnoId)}/curso`, { curso: Number(select.value) });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(t('cursos.mover.listo', { curso: r.datos.curso.nombre }));
    h.recargar?.();
  });
  return el('section', { class: 'tarjeta mover-curso' },
    el('h2', { class: 'con-icono' }, h.icono('personas'), el('span', { texto: t('cursos.mover.titulo') })),
    el('p', { class: 'suave', texto: curso ? t('cursos.mover.esta', { curso: curso.nombre }) : t('cursos.mover.sin') }),
    el('label', { for: 'campo-mover-curso', texto: t('cursos.mover.a') }),
    select,
    el('p', { class: 'ayuda', texto: t('cursos.mover.ayuda') }),
    el('div', { class: 'botones' }, boton),
    mensaje);
}

// ---------- La pantalla «Cursos» ----------
// d: GET /api/admin/academia/cursos → { cursos: [{ id, nombre, creadoEn, archivado, alumnos }], porDefecto, siguiente }
export function vistaCursos(d, h) {
  const { el, t } = h;
  const mensaje = h.caja();
  const nombreNuevo = el('input', { id: 'campo-curso-nuevo', name: 'nombre', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: d.siguiente });
  const crear = h.botonAccion(t('cursos.crear'), 'boton-3d azul', mensaje, async () => {
    const r = await h.api('POST', '/api/admin/academia/cursos', nombreNuevo.value.trim() ? { nombre: nombreNuevo.value } : {});
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(t('cursos.creado', { nombre: r.datos.curso.nombre }));
    h.recargar?.();
  });
  const fila = c => {
    const msg = h.caja();
    const campo = el('input', { id: `campo-curso-${c.id}`, type: 'text', maxlength: 60, autocomplete: 'off', 'aria-label': t('cursos.nombre_de', { nombre: c.nombre }) });
    campo.value = c.nombre;
    const renombrar = h.botonAccion(t('cursos.renombrar'), 'secundario chico', msg, async () => {
      const r = await h.api('POST', `/api/admin/academia/cursos/${c.id}/nombre`, { nombre: campo.value });
      if (!r.ok) throw new Error(h.textoError(r.datos.error));
      h.avisar(t('cursos.renombrado', { nombre: r.datos.curso.nombre }));
      h.recargar?.();
    });
    const archivar = h.botonAccion(t(c.archivado ? 'cursos.abrir' : 'cursos.archivar'), 'secundario chico', msg, async () => {
      if (!c.archivado && h.confirmar && !(await h.confirmar(t('cursos.archivar.confirmar', { nombre: c.nombre }), { si: t('cursos.archivar') }))) return;
      const r = await h.api('POST', `/api/admin/academia/cursos/${c.id}/archivar`, { archivado: !c.archivado });
      if (!r.ok) throw new Error(h.textoError(r.datos.error));
      h.avisar(t(c.archivado ? 'cursos.abierto' : 'cursos.archivado', { nombre: c.nombre }));
      h.recargar?.();
    });
    return el('li', { class: `curso-fila${c.archivado ? ' curso-archivado' : ''}`, 'data-curso': String(c.id) },
      el('div', { class: 'curso-cabeza' },
        el('strong', { class: 'curso-nombre', texto: c.nombre }),
        c.id === d.porDefecto ? el('span', { class: 'etiqueta', texto: t('cursos.por_defecto') }) : null,
        c.archivado ? el('span', { class: 'etiqueta suave', texto: t('cursos.archivado_etiqueta') }) : null),
      el('p', { class: 'suave chica', texto: t('cursos.alumnos', { n: c.alumnos }) }),
      el('a', { class: 'enlace-fuerte chica', href: '#alumnos', onclick: () => guardarFiltro(c.id), texto: t('cursos.ver_alumnos') }),
      el('div', { class: 'curso-editar' }, campo, renombrar, archivar),
      msg);
  };
  return el('section', { class: 'tarjeta cursos' },
    el('h1', { class: 'titulo-pantalla con-icono' }, h.icono('personas'), el('span', { texto: t('cursos.titulo') })),
    el('p', { class: 'suave', texto: t('cursos.linea') }),
    el('div', { class: 'curso-nuevo' },
      el('label', { for: 'campo-curso-nuevo', texto: t('cursos.nuevo') }),
      nombreNuevo,
      el('p', { class: 'ayuda', texto: t('cursos.nuevo.ayuda', { nombre: d.siguiente }) }),
      el('div', { class: 'botones' }, crear),
      mensaje),
    el('ul', { class: 'cursos-lista' }, (d.cursos ?? []).map(fila)),
    el('p', { class: 'suave chica', texto: t('cursos.compartido') }));
}
