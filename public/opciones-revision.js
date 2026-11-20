// Academia 0.14.84 (pedido de Junior: «ver la respuesta correcta, la que seleccionó, y la que estaba de más sin color»):
// en TODA revisión de una pregunta ya respondida se ven todas sus opciones (A, B, C), en su orden y con su texto tal cual:
//  - la correcta en verde, con ✓ y «Correcta»;
//  - la que eligió, si es mala, en rojo, con ✗ y «Tu respuesta» («Su respuesta» en lo del administrador);
//  - si acertó, la suya en verde con «Tu respuesta · Correcta»;
//  - las demás, sin color (neutras).
// Nunca solo el color: siempre el ícono y el rótulo. En Modo reto llegan las opciones que se VIERON (el servidor las manda
// así). Y el filtro «Solo las que falló / Todas» de las revisiones largas.
// Todo con h.el (nunca texto como código) y clases (nunca estilos escritos); los textos, de public/i18n.

// El estado de una opción: 'correcta' (la buena, no la eligió), 'bien' (la eligió y es la buena), 'mala' (la eligió y no
// es la buena) o 'neutra'. Sin elegida (sin responder), solo la correcta lleva color.
export function estadoOpcion(letra, { correcta = null, elegida = null } = {}) {
  const esCorrecta = correcta != null && letra === correcta;
  const esElegida = elegida != null && letra === elegida;
  if (esCorrecta) return esElegida ? 'bien' : 'correcta';
  return esElegida ? 'mala' : 'neutra';
}
export const estadosOpciones = (opciones, resp) => (Array.isArray(opciones) ? opciones : []).map(o => ({ letra: o.letra, texto: o.texto, estado: estadoOpcion(o.letra, resp ?? {}) }));

// Los rótulos de cada estado: [ícono, clave i18n]. quien: 'tu' (el alumno) o 'su' (el administrador mirando a un alumno).
const ROTULOS = {
  tu: { correcta: ['✓', 'resp.op.correcta'], bien: ['✓', 'resp.op.tuya_correcta'], mala: ['✗', 'resp.op.tuya'] },
  su: { correcta: ['✓', 'resp.op.correcta'], bien: ['✓', 'resp.op.suya_correcta'], mala: ['✗', 'resp.op.suya'] },
};

// La lista de las opciones revisadas. opciones: [{ letra, texto }]; resp: { correcta, elegida }.
// texto(o): el texto de una opción (por defecto, tal cual; el oral pasa el suyo, con español e inglés).
// rotulo(o, estado): para cambiar el rótulo (en «Comparar un examen»: «La eligieron 2»); null = el de siempre.
// estado(o): para dar el estado desde afuera (en «Comparar un examen», las malas que alguien eligió).
export function opcionesRevisadas(opciones, resp, h, { quien = 'tu', texto = null, rotulo = null, estado = null, clase = '' } = {}) {
  const { el, t, talCual } = h;
  const rotulos = ROTULOS[quien] ?? ROTULOS.tu;
  const escribir = texto ?? (o => talCual('span', o.texto, 'opcion-texto'));
  return el('ul', { class: `opciones-revisadas ${clase}`.trim(), 'aria-label': t('resp.op.titulo') },
    (Array.isArray(opciones) ? opciones : []).map(o => {
      const e = estado ? estado(o) : estadoOpcion(o.letra, resp ?? {});
      const [marca, clave] = rotulos[e] ?? [null, null];
      const propio = rotulo ? rotulo(o, e) : null;
      return el('li', { class: `op-rev op-${e}`, 'data-letra': o.letra, 'data-estado': e },
        el('span', { class: 'opcion-letra', texto: o.letra }),
        el('span', { class: 'op-rev-cuerpo' }, escribir(o),
          marca ? el('span', { class: 'op-rev-sello' }, el('span', { class: 'op-rev-marca', 'aria-hidden': 'true', texto: marca }), el('span', { texto: propio ?? t(clave) })) : null));
    }));
}

// «Solo las que falló / Todas»: dos botones; alCambiar(soloMalas) al tocar uno. inicial: true = «Solo las que falló» (lo
// normal para el alumno si falló alguna). Sin falladas, siempre «Todas» (el primero queda apagado).
export function filtroFallas(h, { malas, total, quien = 'tu', inicial = true, alCambiar = () => {} }) {
  const { el, t } = h;
  const numero = h.numero ?? (n => String(n));
  let solo = Boolean(inicial) && malas > 0;
  const pintar = () => {
    fallas.setAttribute('aria-pressed', String(solo));
    todas.setAttribute('aria-pressed', String(!solo));
  };
  const poner = v => { solo = v; pintar(); alCambiar(solo); };
  const fallas = el('button', { type: 'button', class: 'filtro', 'data-filtro': 'malas', disabled: !malas, onclick: () => poner(true) },
    el('span', { texto: t(quien === 'su' ? 'revision.solo_fallo' : 'revision.solo_falle', { n: numero(malas) }) }));
  const todas = el('button', { type: 'button', class: 'filtro', 'data-filtro': 'todas', onclick: () => poner(false) }, el('span', { texto: t('revision.todas', { n: numero(total) }) }));
  pintar();
  return { nodo: el('div', { class: 'filtros filtro-fallas', role: 'group', 'aria-label': t('revision.filtro') }, fallas, todas), solo: () => solo };
}
// Esconde las filas acertadas (data-bien="1") cuando el filtro está en «Solo las que falló».
export function aplicarFiltro(filas, solo) {
  for (const f of filas) f.hidden = Boolean(solo) && f.dataset?.bien === '1';
}
