// 0.14.70: ElevenLabs en «Claves e IA» (la voz natural) y su línea en «Dinero». Los datos: GET /api/admin/voz
// (src/api/voz-natural.js). La clave se pega en la caja de siempre (cajaDeClave): nunca vuelve al navegador. Sin
// librerías; todo texto con textContent y sin estilos en línea. Las piezas llegan en «h».

const ICONO_ESTADO = { sin_clave: 'apagado', lista: 'bien', sin_credito: 'mal', en_pausa: 'pausa', apagada: 'apagado', tope_lleno: 'pausa' };
const TONO_ESTADO = { sin_clave: 'info', lista: 'bien', sin_credito: 'mal', en_pausa: 'atencion', apagada: 'info', tope_lleno: 'atencion' };
const mb = bytes => (bytes / 1_048_576).toFixed(bytes >= 10 * 1_048_576 ? 0 : 1);

// Suena un audio guardado (la muestra) en el navegador del dueño.
let audioMuestra = null;
function sonar(archivo) {
  try {
    audioMuestra ??= new Audio();
    audioMuestra.src = `/api/academia/lectura/archivo/${encodeURIComponent(archivo)}`;
    audioMuestra.play().catch(() => {});
  } catch { /* sin audio */ }
}

export function tarjetaVoz(g, d, h) {
  const { el, t, icono, api, numero, textoError, avisar, confirmar, recargar, cajaDeClave, tSi } = h;
  const u = (g?.usos ?? [])[0] ?? null;
  const partes = [
    el('h2', { class: 'con-icono titulo-tarjeta' }, icono('altavoz', 'icono grande'), el('span', { texto: t('voz.titulo') })),
    el('p', { class: 'suave', texto: t('voz.explica') }),
  ];
  if (!d) {
    partes.push(u ? cajaDeClave(u, { abrirPegar: !u.activa }) : null);
    return el('section', { class: 'tarjeta voz-tarjeta', id: 'claves-voz' }, partes.filter(Boolean));
  }
  const e = d.estado?.estado ?? 'sin_clave';
  partes.push(el('p', { class: 'voz-estado' },
    el('span', { class: `insignia tono-${TONO_ESTADO[e] ?? 'info'}` }, icono(ICONO_ESTADO[e] ?? 'info', 'icono chico'), el('span', { texto: t(`voz.estado.${e}`) })),
    d.estado?.motivo && e !== 'lista' && e !== 'sin_clave' ? el('span', { class: 'suave chica', texto: ` ${tSi(`ia.motivo.${d.estado.motivo}`, '')}` }) : null));
  partes.push(el('p', { class: 'voz-guardadas con-icono' }, icono('disco', 'icono chico'),
    el('span', { texto: t('voz.guardadas', { n: numero(d.guardadas?.n ?? 0), mb: mb(d.guardadas?.bytes ?? 0) }) })));
  if (u) partes.push(cajaDeClave(u, { abrirPegar: !u.activa }));

  // La voz, el modelo, el tope de letras y el orden.
  const c = d.config;
  const mensaje = el('p', { class: 'mensaje', role: 'status', hidden: true });
  const decir = (texto, clase = 'bien') => { mensaje.textContent = texto; mensaje.className = `mensaje ${clase}`; mensaje.hidden = false; };
  const enLista = (d.voces ?? []).some(v => v.id === c.vozId);
  const voz = el('select', { id: 'voz-id' }, [...(d.voces ?? []).map(v => el('option', { value: v.id, texto: v.nombre, selected: v.id === c.vozId })),
    el('option', { value: 'otra', texto: t('voz.otra'), selected: !enLista })]);
  const otra = el('input', { id: 'voz-otra', type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: 40, value: enLista ? '' : c.vozId, 'aria-label': t('voz.otra_id') });
  otra.hidden = enLista;
  voz.addEventListener('change', () => { otra.hidden = voz.value !== 'otra'; });
  const modelo = el('select', { id: 'voz-modelo' }, (d.modelos ?? []).map(m => el('option', { value: m, texto: t(`voz.modelo.${m}`), selected: m === c.modelo })));
  const tope = el('input', { id: 'voz-tope', type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: String(c.topeMes) });
  const usar = el('input', { id: 'voz-usar', type: 'checkbox', checked: c.usar });
  const primero = el('select', { id: 'voz-primero' }, ['elevenlabs', 'chatgpt'].map(v => el('option', { value: v, texto: t(`voz.primero.${v}`), selected: v === c.primero })));
  const guardar = el('button', { type: 'button', class: 'con-icono' }, icono('marca', 'icono chico'), el('span', { texto: t('voz.guardar') }));
  guardar.addEventListener('click', async () => {
    const n = Number(tope.value);
    if (!Number.isSafeInteger(n) || n < 0) return decir(t('voz.tope_mal'), 'error');
    guardar.disabled = true;
    const r = await api('POST', '/api/admin/voz/ajustes', { vozId: voz.value === 'otra' ? otra.value.trim() : voz.value, modelo: modelo.value, topeMes: n, usar: usar.checked, primero: primero.value });
    guardar.disabled = false;
    if (!r.ok) return decir(textoError(r.datos.error), 'error');
    recargar({ texto: t('voz.guardado'), clase: 'bien' });
  });
  const probar = el('button', { type: 'button', class: 'secundario con-icono' }, icono('play', 'icono chico'), el('span', { texto: t('voz.probar') }));
  probar.addEventListener('click', async () => {
    probar.disabled = true;
    decir(t('voz.probando'), 'suave');
    for (let k = 0; k < 12; k++) {
      const r = await api('POST', '/api/admin/voz/muestra', { idioma: 'es' });
      if (!r.ok) { probar.disabled = false; return decir(textoError(r.datos.error), 'error'); }
      if (r.datos.estado === 'lista') { probar.disabled = false; mensaje.hidden = true; return sonar(r.datos.archivo); }
      if (r.datos.estado === 'no') { probar.disabled = false; return decir(t('voz.probar_no', { motivo: tSi(`ia.motivo.${r.datos.motivo}`, t(`voz.estado.${e}`)) }), 'aviso'); }
      await new Promise(listo => setTimeout(listo, 1500));
    }
    probar.disabled = false;
    decir(t('voz.probar_tarde'), 'aviso');
  });
  const campo = (id, texto, ...nodos) => el('div', { class: 'campo voz-campo' }, el('label', { for: id, texto }), ...nodos);
  partes.push(el('details', { class: 'voz-ajustes', open: Boolean(u?.activa) },
    el('summary', { class: 'con-icono' }, icono('ajustes', 'icono chico'), el('span', { texto: t('voz.ajustes') })),
    campo('voz-id', t('voz.voz'), voz, otra),
    campo('voz-modelo', t('voz.modelo'), modelo),
    campo('voz-tope', t('voz.tope'), tope, el('p', { class: 'ayuda', texto: t('voz.tope_ayuda') })),
    campo('voz-primero', t('voz.orden'), primero, el('p', { class: 'ayuda', texto: t('voz.orden_ayuda') })),
    el('label', { class: 'casilla', for: 'voz-usar' }, usar, el('span', { texto: t('voz.usar') })),
    el('div', { class: 'botones' }, guardar, probar),
    mensaje));
  partes.push(seccionPreparar(d, h));
  return el('section', { class: 'tarjeta voz-tarjeta', id: 'claves-voz' }, partes.filter(Boolean));
}

// «Preparar todas las voces»: antes de empezar, cuántas letras son; con la confirmación de la app; con su barra.
function seccionPreparar(d, h) {
  const { el, t, icono, api, numero, textoError, confirmar, recargar } = h;
  const p = d.preparar;
  const est = d.estimado;
  const zona = el('div', { class: 'voz-preparar' });
  const titulo = el('h3', { class: 'con-icono separado' }, icono('rayo', 'icono chico'), el('span', { texto: t('voz.preparar.titulo') }));
  const linea = el('p', { class: 'ayuda', texto: t('voz.preparar.linea') });
  const accion = async (datos, textoBien) => {
    const r = await api('POST', '/api/admin/voz/preparar', datos);
    if (!r.ok) return h.avisar(textoError(r.datos.error), 'mal');
    recargar({ texto: textoBien, clase: 'bien' });
  };
  if (p && p.estado === 'en_curso') {
    const barra = el('progress', { class: 'voz-barra', max: Math.max(1, p.total), value: p.hechos, 'aria-label': t('voz.preparar.titulo') });
    const texto = el('p', { texto: t('voz.preparar.va', { hechos: numero(p.hechos), total: numero(p.total), letras: numero(p.letrasHechas) }) });
    const parar = el('button', { type: 'button', class: 'secundario con-icono' }, icono('pausa', 'icono chico'), el('span', { texto: t('voz.preparar.parar') }));
    parar.addEventListener('click', () => accion({ accion: 'parar' }, t('voz.preparar.parada')));
    zona.append(titulo, barra, texto, el('div', { class: 'botones' }, parar));
    // Se actualiza sola mientras está a la vista.
    const vuelta = setInterval(async () => {
      if (!zona.isConnected) return clearInterval(vuelta);
      const r = await api('GET', '/api/admin/voz');
      if (!r.ok || !zona.isConnected) return;
      const q = r.datos.preparar;
      if (!q || q.estado !== 'en_curso') { clearInterval(vuelta); return recargar(null); }
      barra.max = Math.max(1, q.total);
      barra.value = q.hechos;
      texto.textContent = t('voz.preparar.va', { hechos: numero(q.hechos), total: numero(q.total), letras: numero(q.letrasHechas) });
    }, 5000);
    return zona;
  }
  zona.append(titulo, linea);
  if (p && (p.estado === 'en_pausa' || p.estado === 'parada')) {
    const seguir = el('button', { type: 'button', class: 'con-icono' }, icono('play', 'icono chico'), el('span', { texto: t('voz.preparar.seguir') }));
    seguir.addEventListener('click', () => accion({ accion: 'seguir' }, t('voz.preparar.sigue')));
    zona.append(el('div', { class: 'aviso-sistema tono-atencion' },
      el('p', { texto: t('voz.preparar.en_pausa', { hechos: numero(p.hechos), total: numero(p.total), motivo: h.tSi(`ia.motivo.${p.motivo}`, p.motivo ?? '') }) }),
      el('progress', { class: 'voz-barra', max: Math.max(1, p.total), value: p.hechos }),
      el('div', { class: 'botones' }, seguir)));
  } else if (p?.estado === 'lista') {
    zona.append(el('p', { class: 'con-icono tono-bien' }, icono('bien', 'icono chico'), el('span', { texto: t('voz.preparar.lista', { n: numero(p.pagados), total: numero(p.total) }) })));
  }
  if (!est) return zona;
  const libre = Math.max(0, d.mes.tope - d.mes.usados);
  const elegir = ['oral', 'clases'].map((alcance, i) => {
    const x = est[alcance];
    const r = el('input', { type: 'radio', name: 'voz-alcance', value: alcance, id: `voz-alcance-${alcance}`, checked: i === 0 });
    return { alcance, x, nodo: el('label', { class: 'casilla voz-alcance', for: `voz-alcance-${alcance}` }, r,
      el('span', {}, el('strong', { texto: t(`voz.alcance.${alcance}`) }), el('br'),
        el('span', { class: 'suave chica', texto: t('voz.alcance.cuanto', { audios: numero(x.faltan), letras: numero(x.letrasFaltan), total: numero(x.letras) }) }))), radio: r };
  });
  const empezar = el('button', { type: 'button', class: 'con-icono' }, icono('rayo', 'icono chico'), el('span', { texto: t('voz.preparar.boton') }));
  empezar.disabled = d.estado?.estado !== 'lista';
  empezar.addEventListener('click', async () => {
    const e = elegir.find(x => x.radio.checked) ?? elegir[0];
    const texto = e.x.letrasFaltan > libre
      ? t('voz.preparar.confirmar_tope', { letras: numero(e.x.letrasFaltan), libre: numero(libre) })
      : t('voz.preparar.confirmar', { letras: numero(e.x.letrasFaltan), audios: numero(e.x.faltan) });
    if (!(await confirmar(texto))) return;
    accion({ alcance: e.alcance }, t('voz.preparar.empezo'));
  });
  zona.append(...[el('div', { class: 'voz-alcances', role: 'radiogroup', 'aria-label': t('voz.preparar.titulo') }, elegir.map(x => x.nodo)),
    el('p', { class: 'ayuda', texto: t('voz.preparar.libre', { libre: numero(libre) }) }),
    el('div', { class: 'botones' }, empezar),
    d.estado?.estado !== 'lista' ? el('p', { class: 'suave chica', texto: t('voz.preparar.sin_lista') }) : null].filter(Boolean));
  return zona;
}

// La línea de ElevenLabs en «Dinero»: las letras del mes junto al tope de la IA, y el crédito que le queda.
export function tarjetaVozDinero(d, h) {
  const { el, t, icono, numero, fecha } = h;
  if (!d) return null;
  const tope = d.mes.tope;
  const credito = d.credito?.desconocido
    ? t('voz.dinero.credito_desconocido')
    : t('voz.dinero.credito', { queda: numero(d.credito.queda ?? 0), limite: numero(d.credito.limite), cuando: d.credito.reinicio ? fecha(d.credito.reinicio) : '?' });
  return el('section', { class: 'tarjeta dinero-voz', id: 'dinero-voz' },
    el('h2', { class: 'con-icono' }, icono('altavoz'), el('span', { texto: t('voz.dinero.titulo') })),
    el('p', { texto: t('voz.dinero.mes', { usados: numero(d.mes.usados), tope: numero(tope), audios: numero(d.mes.audios) }) }),
    el('progress', { class: 'voz-barra', max: Math.max(1, tope), value: Math.min(d.mes.usados, Math.max(1, tope)), 'aria-label': t('voz.dinero.titulo') }),
    el('p', { class: 'suave', texto: credito }),
    el('p', { class: 'suave chica', texto: t('voz.guardadas', { n: numero(d.guardadas?.n ?? 0), mb: mb(d.guardadas?.bytes ?? 0) }) }),
    el('div', { class: 'botones' }, el('a', { class: 'boton-enlace secundario con-icono', href: '#claves' }, icono('llave', 'icono chico'), el('span', { texto: t('voz.dinero.ir') }))));
}
