// Academia 0.14.59 (0.14.77: con «no se entendió» y cuántos de cuántos): Administrador → Contenido: «Dónde más les cuesta» (src/academia/donde-cuesta.js, listaAdmin). Una
// lista corta: las 10 tarjetas (o temas) que más les cuestan a los alumnos, con su puntaje, lo que ya hizo la IA y la
// «Otra forma de verlo» que pasó a la clase (con «Ocultar», el mismo de la biblioteca de la IA). Todo texto con textContent.
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

const TONO = p => (p >= 60 ? 'mal' : p >= 40 ? 'atencion' : 'info');
const quitarIngles = x => String(x ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();

// Las razones en palabras: «Fallan 62 % (de 40 respuestas)», «Piden ayuda 30 %», «Fallan después de la ayuda 50 %».
export function razones(x, { t, numero }) {
  return [
    // 0.14.77: siempre cuántos de cuántos (proporción y muestra juntas), no solo el %.
    x.fallo && x.fallo.alumnosMal != null ? t('cuesta.fallo_alumnos', { mal: numero(x.fallo.alumnosMal), alumnos: numero(x.fallo.alumnos), pct: numero(x.fallo.pct), n: numero(x.fallo.n) })
      : x.fallo ? t('cuesta.fallo', { pct: numero(x.fallo.pct), n: numero(x.fallo.n) }) : null,
    x.pide && x.pide.pidieron != null ? t('cuesta.pide_alumnos', { pidieron: numero(x.pide.pidieron), n: numero(x.pide.n), pct: numero(x.pide.pct) })
      : x.pide ? t('cuesta.pide', { pct: numero(x.pide.pct), n: numero(x.pide.n) }) : null,
    x.despues ? t('cuesta.despues', { pct: numero(x.despues.pct), n: numero(x.despues.n) }) : null,
    x.no ? t('cuesta.no', { no: numero(x.no.no), n: numero(x.no.n), pct: numero(x.no.pct) }) : null,
  ].filter(Boolean);
}

export function tarjetaCuesta(datos, h) {
  const { el, t, numero } = h;
  const lista = Array.isArray(datos?.lista) ? datos.lista : [];
  const fila = x => {
    const donde = x.tipo === 'tarjeta'
      ? t('cuesta.donde_tarjeta', { tarjeta: quitarIngles(x.titulo), tema: quitarIngles(x.temaTitulo) })
      : t('cuesta.donde_tema', { tema: quitarIngles(x.temaTitulo) });
    const hizo = x.hizo ? t(`cuesta.hizo.${x.hizo.que === 'clase_reescrita' ? 'reescrita' : 'corregida'}`, { fecha: String(x.hizo.en ?? '').slice(0, 10) }) : t('cuesta.hizo.nada');
    const promo = x.promovida;
    const ocultar = promo ? el('button', { type: 'button', class: 'secundario chico', onclick: async e => {
      const b = e.currentTarget;
      b.disabled = true;
      const r = await h.api('POST', '/api/admin/academia/ia-biblioteca/ocultar', { clave: promo.clave, oculto: !promo.oculta });
      b.disabled = false;
      if (!r.ok) return h.avisar(h.textoError(r.datos.error), 'mal');
      promo.oculta = !promo.oculta;
      b.textContent = t(promo.oculta ? 'cuesta.mostrar' : 'cuesta.ocultar');
      estado.textContent = t(promo.oculta ? 'cuesta.promovida_oculta' : 'cuesta.promovida', { con: numero(promo.vieron ?? 0), sin: numero(promo.sin ?? 0) });
    } }, el('span', { texto: t(promo.oculta ? 'cuesta.mostrar' : 'cuesta.ocultar') })) : null;
    const estado = el('span', { class: 'chica', texto: promo ? t(promo.oculta ? 'cuesta.promovida_oculta' : 'cuesta.promovida', { con: numero(promo.vieron ?? 0), sin: numero(promo.sin ?? 0) }) : '' });
    return el('li', { class: 'cuesta-fila' }, ...[
      el('div', { class: 'cuesta-cabeza' },
        h.insignia(TONO(x.puntaje), t('cuesta.puntaje', { n: numero(x.puntaje) })),
        el('strong', { texto: donde }),
        el('span', { class: 'suave chica', texto: h.nombreMateria(x.materia) })),
      el('p', { class: 'chica', texto: razones(x, h).join(' · ') }),
      el('p', { class: 'suave chica', texto: hizo }),
      promo ? el('p', { class: 'cuesta-promo con-icono' }, h.icono('bombilla', 'icono chico'), estado, ocultar) : null,
    ].filter(Boolean));
  };
  return el('section', { class: 'tarjeta cuesta-tarjeta' }, ...[
    el('h2', { class: 'con-icono' }, h.icono('grafica'), el('span', { texto: t('cuesta.titulo') })),
    el('p', { class: 'ayuda', texto: t('cuesta.linea') }),
    lista.length ? el('ol', { class: 'cuesta-lista' }, ...lista.map(fila)) : el('p', { class: 'suave', texto: t('cuesta.vacio') }),
  ]);
}
