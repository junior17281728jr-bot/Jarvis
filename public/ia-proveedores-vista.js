// 0.14.0: la pestaña «IA (Claude o ChatGPT)» (Administrador → Dinero e IA, #claves): «¿Quién hace el trabajo?»
// (Claude / ChatGPT / API propia / el que funcione, con su orden), y una sección por proveedor: pegar la clave,
// «Probar (gratis)», el estado en palabras simples y los 3 pasos; para ChatGPT y la API propia, además, los modelos
// (de la lista que trae la prueba gratis), su tabla de precios editable y, en ChatGPT, los «Dibujos con IA».
// Sin librerías; todo texto con textContent y sin estilos en línea. Las piezas llegan de app.js en «h».
const NOMBRE = { anthropic: 'Claude', openai: 'ChatGPT', propia: 'API propia' };
const usd = micro => `US$${((Number(micro) || 0) / 1_000_000).toFixed(2)}`;

// Lo que ve el dueño de la elección de quién trabaja.
export function textoPreferido(t, preferido) {
  return t(`iaprov.usar.${preferido}`);
}

function pasos(h, id) {
  const { el, t } = h;
  return el('div', { class: 'claude-pasos' },
    el('h3', { class: 'con-icono' }, h.icono('llave'), el('span', { texto: t(`iaprov.${id}.ayuda`) })),
    el('ol', { class: 'pasos-numerados' }, [1, 2, 3].map(n => el('li', {},
      el('span', { class: 'paso-numero', 'aria-hidden': 'true', texto: String(n) }),
      el('span', { texto: t(`iaprov.${id}.paso${n}`) })))));
}

function quien(prov, h) {
  const { el, t } = h;
  const mensaje = el('p', { class: 'mensaje', role: 'status', hidden: true });
  const mandar = async datos => {
    const r = await h.api('POST', '/api/admin/ia/proveedores', datos);
    if (!r.ok) { mensaje.className = 'mensaje error'; mensaje.textContent = h.textoError(r.datos.error); mensaje.hidden = false; return; }
    h.recargar({ texto: t('iaprov.guardado'), clase: 'bien' });
  };
  const opciones = ['auto', 'anthropic', 'openai', 'propia'].map(id => {
    const radio = el('input', { type: 'radio', name: 'ia-preferido', id: `ia-pref-${id}`, value: id, checked: prov.preferido === id, onchange: () => mandar({ preferido: id }) });
    return el('label', { class: 'ia-opcion', for: `ia-pref-${id}` }, radio, el('span', { texto: textoPreferido(t, id) }));
  });
  const orden = prov.orden.map((id, i) => el('li', { class: 'ia-orden-fila' },
    el('span', { texto: `${i + 1}. ${NOMBRE[id]}` }),
    el('span', { class: 'botones-chicos' },
      i > 0 ? el('button', { type: 'button', class: 'secundario chico', 'aria-label': t('iaprov.subir', { nombre: NOMBRE[id] }), onclick: () => { const o = [...prov.orden]; [o[i - 1], o[i]] = [o[i], o[i - 1]]; mandar({ orden: o }); } }, el('span', { texto: '↑' })) : null,
      i < prov.orden.length - 1 ? el('button', { type: 'button', class: 'secundario chico', 'aria-label': t('iaprov.bajar', { nombre: NOMBRE[id] }), onclick: () => { const o = [...prov.orden]; [o[i + 1], o[i]] = [o[i], o[i + 1]]; mandar({ orden: o }); } }, el('span', { texto: '↓' })) : null)));
  return el('section', { class: 'tarjeta ancha', id: 'ia-quien' },
    el('h2', { class: 'con-icono' }, h.icono('chispa', 'icono grande'), el('span', { texto: t('iaprov.quien') })),
    el('p', { class: 'suave', texto: t('iaprov.quien.explica') }),
    el('fieldset', { class: 'ia-opciones' }, el('legend', { texto: t('iaprov.usar') }), opciones),
    prov.preferido === 'auto' ? el('div', {}, el('p', { class: 'suave chica', texto: t('iaprov.orden') }), el('ol', { class: 'lista-simple ia-orden' }, orden)) : null,
    el('p', { class: 'suave chica', texto: t('iaprov.revision_cruzada') }),
    prov.encendida ? null : el('p', { class: 'aviso con-icono-arriba' }, h.icono('info', 'icono chico'), el('span', { texto: t('claude.detalle.ia_apagada') }), el('a', { href: '#ia', class: 'enlace-claude', texto: t('ia.abrir') })),
    mensaje);
}

// Los modelos (listas simples) y la tabla de precios de ChatGPT o de la API propia.
function modelosYPrecios(p, h) {
  const { el, t } = h;
  const mensaje = el('p', { class: 'mensaje', role: 'status', hidden: true });
  const decir = (texto, clase) => { mensaje.className = `mensaje ${clase}`; mensaje.textContent = texto; mensaje.hidden = false; };
  const campos = p.id === 'openai' ? [['modeloEscribir', 'iaprov.modelo.escribir'], ['modelo', 'iaprov.modelo.verificar'], ['modeloImagen', 'iaprov.modelo.imagen']] : [['modeloEscribir', 'iaprov.modelo.escribir'], ['modelo', 'iaprov.modelo.verificar']];
  const elegir = ([campo, clave]) => {
    const id = `ia-${p.id}-${campo}`;
    const actual = p[campo];
    let control;
    if (p.vistos.length) {
      const lista = [...new Set([...(actual ? [actual] : []), ...p.vistos])];
      control = el('select', { id, onchange: async e => {
        const r = await h.api('POST', '/api/admin/ia/proveedores', { modelos: { [p.id]: { [campo]: e.currentTarget.value || null } } });
        if (!r.ok) return decir(h.textoError(r.datos.error), 'error');
        h.recargar({ texto: t('iaprov.guardado'), clase: 'bien' });
      } }, el('option', { value: '', texto: t('iaprov.modelo.ninguno') }), lista.map(m => el('option', { value: m, selected: m === actual, texto: m })));
    } else {
      control = el('input', { id, type: 'text', value: actual ?? '', maxlength: 80, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder: t('iaprov.modelo.escribe'),
        onchange: async e => {
          const r = await h.api('POST', '/api/admin/ia/proveedores', { modelos: { [p.id]: { [campo]: e.currentTarget.value.trim() || null } } });
          if (!r.ok) return decir(h.textoError(r.datos.error), 'error');
          h.recargar({ texto: t('iaprov.guardado'), clase: 'bien' });
        } });
    }
    return el('div', { class: 'campo' }, el('label', { for: id, texto: t(clave) }), control);
  };
  const filaPrecio = x => {
    const ids = ['entrada', 'cacheLectura', 'salida'].map(k => `ia-precio-${p.id}-${x.modelo}-${k}`.replace(/[^A-Za-z0-9-]/g, '-'));
    const [e, c, s] = [[x.entradaUsd, 'iaprov.precio.entrada'], [x.cacheLecturaUsd, 'iaprov.precio.cache'], [x.salidaUsd, 'iaprov.precio.salida']].map(([v, k], i) =>
      el('div', { class: 'campo campo-precio' }, el('label', { for: ids[i], texto: t(k) }), el('input', { id: ids[i], type: 'text', inputmode: 'decimal', value: v ?? '', maxlength: 10 })));
    const leer = i => document.getElementById(ids[i])?.value ?? '';
    return el('div', { class: 'ia-precio' },
      el('p', {}, el('strong', { texto: x.modelo }), el('span', { class: 'suave chica', texto: ` · ${x.porDefecto ? t('iaprov.precio.por_defecto') : t('iaprov.precio.tuyo', { fecha: x.revisadoEl ?? '' })}` })),
      el('div', { class: 'ia-precio-campos' }, e, c, s),
      el('div', { class: 'botones' },
        el('button', { type: 'button', class: 'secundario chico', onclick: async () => {
          const r = await h.api('POST', '/api/admin/ia/precios', { proveedor: p.id, modelo: x.modelo, entrada: leer(0), cacheLectura: leer(1), salida: leer(2) });
          if (!r.ok) return decir(h.textoError(r.datos.error), 'error');
          h.recargar({ texto: t('iaprov.precio.guardado'), clase: 'bien' });
        } }, el('span', { texto: t('iaprov.precio.guardar') })),
        x.porDefecto ? null : el('button', { type: 'button', class: 'secundario chico', onclick: async () => {
          const r = await h.api('POST', '/api/admin/ia/precios', { proveedor: p.id, modelo: x.modelo, borrar: true });
          if (!r.ok) return decir(h.textoError(r.datos.error), 'error');
          h.recargar({ texto: t('iaprov.precio.guardado'), clase: 'bien' });
        } }, el('span', { texto: t('iaprov.precio.volver') }))));
  };
  return el('div', { class: 'ia-modelos' },
    el('h3', { texto: t('iaprov.modelos') }),
    el('p', { class: 'suave chica', texto: p.vistos.length ? t('iaprov.modelos.lista', { n: p.vistos.length }) : t('iaprov.modelos.sin_lista') }),
    campos.map(elegir),
    p.precios.length ? el('details', {}, el('summary', { texto: t('iaprov.precios') }),
      el('p', { class: 'aviso chica', texto: t(p.id === 'openai' ? 'iaprov.precios.revisa' : 'iaprov.precios.revisa_propia') }),
      p.precios.map(filaPrecio)) : null,
    mensaje);
}

function dibujos(prov, h) {
  const { el, t } = h;
  const d = prov.dibujos;
  const mensaje = el('p', { class: 'mensaje', role: 'status', hidden: true });
  const tope = el('input', { id: 'ia-dibujos-tope', type: 'text', inputmode: 'decimal', value: ((d.topeMicro ?? 0) / 1_000_000).toFixed(2), maxlength: 6 });
  const mandar = async datos => {
    const r = await h.api('POST', '/api/admin/ia/dibujos', datos);
    if (!r.ok) { mensaje.className = 'mensaje error'; mensaje.textContent = h.textoError(r.datos.error); mensaje.hidden = false; return; }
    h.recargar({ texto: t('iaprov.guardado'), clase: 'bien' });
  };
  return el('div', { class: 'ia-dibujos' },
    el('h3', { class: 'con-icono' }, h.icono('ojo'), el('span', { texto: t('iaprov.dibujos') })),
    el('p', { class: 'suave chica', texto: t('iaprov.dibujos.explica') }),
    el('p', { class: 'chica', texto: t('iaprov.dibujos.estimado', { n: h.numero(d.estimado?.tarjetas ?? 0), usd: usd(d.estimado?.micro ?? 0), hechos: h.numero(d.estimado?.hechos ?? 0), gasto: usd(d.estimado?.gastoMicro ?? 0) }) }),
    el('p', {}, h.insignia(d.activa ? 'bien' : 'neutro', t(d.activa ? 'iaprov.dibujos.encendido' : 'iaprov.dibujos.apagado'))),
    el('div', { class: 'campo' }, el('label', { for: 'ia-dibujos-tope', texto: t('iaprov.dibujos.tope') }), tope),
    el('div', { class: 'botones' },
      el('button', { type: 'button', class: d.activa ? 'secundario' : 'con-icono', onclick: () => mandar({ activa: !d.activa, topeUsd: tope.value }) }, el('span', { texto: t(d.activa ? 'iaprov.dibujos.apagar' : 'iaprov.dibujos.encender') })),
      el('button', { type: 'button', class: 'secundario', onclick: () => mandar({ topeUsd: tope.value }) }, el('span', { texto: t('iaprov.dibujos.guardar_tope') }))),
    mensaje);
}

function basePropia(p, h) {
  const { el, t } = h;
  const mensaje = el('p', { class: 'mensaje', role: 'status', hidden: true });
  const campo = el('input', { id: 'ia-propia-base', type: 'url', value: p.base ?? '', maxlength: 200, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder: 'https://mi-servidor.com/v1' });
  return el('div', { class: 'campo' },
    el('label', { for: 'ia-propia-base', texto: t('iaprov.propia.base') }),
    campo,
    el('p', { class: 'suave chica', texto: t('iaprov.propia.base_explica') }),
    el('div', { class: 'botones' }, el('button', { type: 'button', class: 'secundario', onclick: async () => {
      const r = await h.api('POST', '/api/admin/ia/proveedores', { basePropia: campo.value.trim() });
      if (!r.ok) { mensaje.className = 'mensaje error'; mensaje.textContent = h.textoError(r.datos.error); mensaje.hidden = false; return; }
      h.recargar({ texto: t('iaprov.guardado'), clase: 'bien' });
    } }, el('span', { texto: t('iaprov.propia.guardar_base') }))),
    mensaje);
}

// Las secciones de la IA (en lugar de las cajas sueltas): «¿Quién?», Claude, ChatGPT y la API propia.
// g: el grupo 'ia' de GET /api/admin/claves; prov: GET /api/admin/ia/proveedores (o null si no se pudo leer).
export function seccionesIa(g, prov, h, { abrirClaude = false } = {}) {
  const { el, t } = h;
  const uso = id => (g.usos ?? []).find(u => u.uso === `ia_${id}`) ?? { uso: `ia_${id}`, activa: null, anteriores: [] };
  const p = id => prov?.proveedores?.find(x => x.id === id) ?? null;
  const trabaja = prov?.preferido ?? 'auto';
  const marca = id => (trabaja === id ? el('span', { class: 'insignia tono-bien', texto: t('iaprov.elegido') }) : null);
  const claude = el('section', { class: 'tarjeta', id: 'claves-ia' },
    el('h2', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: 'Claude (Anthropic)' }), marca('anthropic')),
    h.pasosClaude(),
    h.cajaDeClave(uso('anthropic'), { abrirPegar: abrirClaude || !uso('anthropic').activa }));
  const chatgpt = el('section', { class: 'tarjeta', id: 'claves-ia-openai' },
    el('h2', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: 'ChatGPT (OpenAI)' }), marca('openai')),
    pasos(h, 'openai'),
    h.cajaDeClave(uso('openai'), { abrirPegar: !uso('openai').activa }),
    p('openai') && uso('openai').activa ? modelosYPrecios(p('openai'), h) : null,
    prov && uso('openai').activa ? dibujos(prov, h) : null);
  const propia = el('section', { class: 'tarjeta', id: 'claves-ia-propia' },
    el('details', { open: Boolean(uso('propia').activa || p('propia')?.base) },
      el('summary', { class: 'con-icono' }, h.icono('servidor'), el('span', { texto: t('iaprov.propia') }), marca('propia')),
      el('p', { class: 'suave chica', texto: t('iaprov.propia.explica') }),
      p('propia') ? basePropia(p('propia'), h) : null,
      h.cajaDeClave(uso('propia'), { abrirPegar: false }),
      p('propia') && uso('propia').activa ? modelosYPrecios(p('propia'), h) : null));
  return [prov ? quien(prov, h) : null, claude, chatgpt, propia].filter(Boolean);
}
