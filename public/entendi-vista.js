// Academia 0.14.77: «¿Lo entendiste? 👍 / 👎» debajo de cada explicación (src/academia/entendi.js). Un toque, chiquito:
// enseguida «¡Gracias!» (sin esperar al servidor); se puede cambiar tocando el otro. Con 👎, si hay «Explícamelo de otra
// forma» ahí mismo, se ofrece. Lo que se manda dice QUÉ se votó (dónde está), nunca el texto ni su huella: eso lo saca el
// servidor. Sin librerías; todo texto con textContent. h: { el, t, api }.
//  - item: { tipo: 'tarjeta' | 'otra' | 'oral', materia, tema, n } · { tipo: 'pregunta', pregunta } · { tipo: 'ia', clave }.
//  - alVotar(voto): lo que hace la pantalla además (la tarjeta de la clase abre «Explícamelo mejor» con 👎).
//  - otraForma(): con 👎 sale el botón «Explícamelo de otra forma» que la llama (solo si se pasa y, si se pasa hayOtra(),
//    solo si dice que sí).

// Solo lo compartido de la IA (nunca algo de un alumno): lo mismo que acepta el servidor.
export const CLAVE_IA_VOTO = /^academia\.ia\.(?:explica|miniclase|tarjeta|profundiza)\.[a-f0-9]{32}$/;

export function votoEntendi(h, item, { alVotar = null, otraForma = null, hayOtra = null } = {}) {
  const { el, t, api } = h;
  const gracias = el('span', { class: 'entendi-gracias chica', role: 'status', 'aria-live': 'polite' });
  const extra = el('span', { class: 'entendi-extra' });
  const botones = [];
  const votar = voto => {
    for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.voto === voto));
    gracias.textContent = t('entendi.gracias');
    Promise.resolve(api('POST', '/api/academia/entendi', { ...item, voto })).catch(() => {});
    extra.replaceChildren(...[voto === 'no' && typeof otraForma === 'function' && (typeof hayOtra !== 'function' || hayOtra())
      ? el('button', { type: 'button', class: 'boton-texto chica entendi-otra', onclick: () => otraForma() }, el('span', { texto: t('entendi.otra') }))
      : null].filter(Boolean));
    if (typeof alVotar === 'function') alVotar(voto);
  };
  for (const [voto, emoji, clave] of [['si', '👍', 'entendi.si'], ['no', '👎', 'entendi.no']]) {
    botones.push(el('button', { type: 'button', class: 'entendi-boton', 'data-voto': voto, 'aria-pressed': 'false', 'aria-label': t(clave), title: t(clave), onclick: () => votar(voto) },
      el('span', { 'aria-hidden': 'true', texto: emoji })));
  }
  return el('div', { class: 'entendi', role: 'group', 'aria-label': t('entendi.pregunta') },
    el('span', { class: 'entendi-pregunta chica', texto: t('entendi.pregunta') }), ...botones, gracias, extra);
}
