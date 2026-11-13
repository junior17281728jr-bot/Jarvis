// 0.14.8: Administrador → Contenido → «Mejorar la app con Claude» (#contenido/app). Sin librerías; todo texto con
// textContent y sin estilos en línea. Las piezas llegan de app.js en «h» (este módulo no importa nada). Lo que se decide
// está en el servidor (src/academia/app-mejora.js): aquí solo se muestra y se tocan botones.
const usd = micro => `US$${((Number(micro) || 0) / 1_000_000).toFixed(2)}`;
const EN_CAMINO = new Set(['en_fila', 'pensando', 'probar', 'probando', 'paso', 'aprobado', 'subido', 'no_instalado', 'deshacer']);
const TONO = { instalado: 'bien', paso: 'bien', no_paso: 'mal', rechazado: 'mal', fallido: 'mal', conflicto: 'mal', deshecho: 'neutro', esperando_aprobar: 'atencion', esperando_token: 'atencion' };
export const siguePasando = d => (d.propuestas ?? []).some(p => EN_CAMINO.has(p.estado));

function descargar(nombre, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pantallaAppMejora(d, h, { alCambiar } = {}) {
  const { el, t } = h;
  const cfg = d.config;
  const mensaje = el('p', { class: 'mensaje', role: 'status', hidden: true });
  const decir = (texto, clase) => { mensaje.className = `mensaje ${clase}`; mensaje.textContent = texto; mensaje.hidden = false; };
  const mandar = async (metodo, ruta, cuerpo, okTexto) => {
    const r = await h.api(metodo, ruta, cuerpo);
    if (!r.ok) return decir(h.textoError(r.datos.error), 'error');
    if (okTexto) h.avisar(okTexto, 'bien');
    if (r.datos?.propuestas && alCambiar) alCambiar(r.datos); else h.recargar();
  };
  const e = d.estado ?? {};
  const barra = el('progress', { class: 'appm-barra', max: 100, value: Math.max(0, Math.min(100, Number(e.pct) || 0)), 'aria-label': t('appm.avance') });
  const botones = [
    el('button', { type: 'button', class: `boton-3d ${cfg.pausada ? 'verde' : 'blanco'} con-icono`, onclick: ev => { ev.currentTarget.disabled = true; mandar('POST', '/api/admin/academia/app/config', { pausada: !cfg.pausada }, t(cfg.pausada ? 'appm.reanudada' : 'appm.pausada')); } },
      h.icono(cfg.pausada ? 'play' : 'pausa'), el('span', { texto: t(cfg.pausada ? 'appm.reanudar' : 'appm.pausar') })),
    el('button', { type: 'button', class: 'boton-3d blanco con-icono', onclick: ev => { ev.currentTarget.disabled = true; mandar('POST', '/api/admin/academia/app/revisar', {}, t('appm.revisar_listo')); } },
      h.icono('chispa'), el('span', { texto: t('appm.revisar') })),
  ];
  if (d.puedeDeshacer) {
    botones.push(el('button', { type: 'button', class: 'boton-3d blanco con-icono', onclick: async ev => {
      if (!(await h.confirmar(t('appm.deshacer.confirmar')))) return;
      ev.currentTarget.disabled = true;
      mandar('POST', '/api/admin/academia/app/deshacer', {}, t('appm.deshacer.listo'));
    } }, h.icono('actualizar'), el('span', { texto: t('appm.deshacer') })));
  }
  const cabeza = el('section', { class: 'tarjeta ancha appm-cabeza' },
    el('h2', { class: 'con-icono' }, h.icono('chispa', 'icono grande'), el('span', { texto: t('appm.titulo') })),
    el('p', { class: 'suave', texto: t('appm.linea') }),
    d.pausadaIa ? el('p', { class: 'aviso', texto: t('appm.ia_en_pausa') }) : null,
    el('p', { class: 'appm-ahora' }, el('strong', { texto: e.actual ?? t('appm.sin_empezar') })),
    barra,
    el('p', { class: 'suave chica', texto: t('appm.pct', { pct: Number(e.pct) || 0 }) }),
    el('div', { class: 'botones' }, botones),
    mensaje);

  // El permiso de GitHub (el token): cómo se crea, en palabras simples.
  const token = d.token?.hay
    ? el('section', { class: 'tarjeta' }, el('h3', { texto: t('appm.token.titulo') }), el('p', { class: 'bien', texto: t('appm.token.hay', { final: d.token.final ?? '' }) }))
    : el('section', { class: 'tarjeta appm-token' },
      el('h3', { texto: t('appm.token.titulo') }),
      el('p', { class: 'aviso', texto: t('appm.token.falta') }),
      el('ol', { class: 'appm-pasos' }, [1, 2, 3, 4, 5].map(n => el('li', { texto: t(`appm.token.paso${n}`) }))),
      el('a', { class: 'boton-enlace con-icono', href: '#claves' }, h.icono('llave'), el('span', { texto: t('appm.token.ir') })));

  // Ajustes: subir solo, el tope.
  const auto = el('input', { type: 'checkbox', id: 'appm-auto', checked: cfg.autoSubir });
  auto.addEventListener('change', () => mandar('POST', '/api/admin/academia/app/config', { autoSubir: auto.checked }, t('appm.guardado')));
  const tope = el('input', { type: 'text', inputmode: 'decimal', id: 'appm-tope', value: String((cfg.topeMicro / 1_000_000).toFixed(2)), class: 'campo-corto' });
  const ajustes = el('section', { class: 'tarjeta' },
    el('h3', { texto: t('appm.ajustes') }),
    el('p', { class: 'appm-fila' }, auto, el('label', { for: 'appm-auto', texto: t('appm.auto') })),
    el('p', { class: 'suave chica', texto: t('appm.auto.ayuda') }),
    el('p', { class: 'appm-fila' }, el('label', { for: 'appm-tope', texto: t('appm.tope') }), tope,
      el('button', { type: 'button', class: 'secundario chico', onclick: () => mandar('POST', '/api/admin/academia/app/config', { topeUsd: tope.value }, t('appm.guardado')) }, el('span', { texto: t('appm.guardar') }))),
    el('p', { class: 'suave', texto: t('appm.gasto', { usado: usd(d.gastoMicro), tope: usd(cfg.topeMicro) }) }),
    d.todo ? el('p', { class: 'suave', texto: t('appm.todo', { usado: usd(d.todo.gastoMicro), tope: usd(d.todo.topeMicro) }) }) : null);

  // Pedir un cambio.
  const campo = el('textarea', { id: 'appm-texto', rows: 3, maxlength: 1000, placeholder: t('appm.pedir.ejemplo') });
  const pedir = el('section', { class: 'tarjeta' },
    el('h3', { texto: t('appm.pedir') }),
    el('label', { for: 'appm-texto', texto: t('appm.pedir.escribe') }),
    campo,
    el('div', { class: 'botones' }, el('button', { type: 'button', class: 'con-icono', onclick: ev => {
      const texto = campo.value.trim();
      if (!texto) return;
      ev.currentTarget.disabled = true;
      mandar('POST', '/api/admin/academia/app/pedir', { texto }, t('appm.pedir.listo'));
    } }, h.icono('avion_papel'), el('span', { texto: t('appm.pedir.enviar') }))));

  // Las propuestas (la más nueva primero).
  const tarjeta = p => {
    const acciones = [];
    if (p.estado === 'esperando_aprobar') acciones.push(el('button', { type: 'button', class: 'con-icono', onclick: ev => { ev.currentTarget.disabled = true; mandar('POST', `/api/admin/academia/app/${p.id}/aprobar`, {}, t('appm.aprobada')); } }, h.icono('bien'), el('span', { texto: t('appm.aprobar') })));
    if (['esperando_aprobar', 'esperando_token'].includes(p.estado)) acciones.push(el('button', { type: 'button', class: 'secundario', onclick: ev => { ev.currentTarget.disabled = true; mandar('POST', `/api/admin/academia/app/${p.id}/descartar`, {}, null); } }, el('span', { texto: t('appm.descartar') })));
    if (p.diff) {
      acciones.push(el('button', { type: 'button', class: 'secundario', onclick: async () => {
        const r = await h.api('GET', `/api/admin/academia/app/${p.id}/parche`);
        if (!r.ok) return decir(h.textoError(r.datos.error), 'error');
        try { await navigator.clipboard.writeText(JSON.stringify(r.datos, null, 2)); h.avisar(t('appm.copiado'), 'bien'); } catch { decir(t('appm.no_copiado'), 'aviso'); }
      } }, el('span', { texto: t('appm.copiar') })));
      acciones.push(el('button', { type: 'button', class: 'secundario', onclick: async () => {
        const r = await h.api('GET', `/api/admin/academia/app/${p.id}/parche`);
        if (!r.ok) return decir(h.textoError(r.datos.error), 'error');
        descargar(`cambio-claude-${p.id}.json`, JSON.stringify(r.datos, null, 2));
      } }, el('span', { texto: t('appm.descargar') })));
    }
    const pr = p.pruebas;
    return el('article', { class: `appm-propuesta estado-${p.estado}` },
      el('p', {}, el('strong', { texto: p.titulo ?? p.pedido ?? h.tSi(`appm.pantalla.${p.pantalla}`, p.pantalla ?? '') }), ' ', h.insignia(TONO[p.estado] ?? 'neutro', h.tSi(`appm.estado.${p.estado}`, p.estado))),
      p.pedido && p.titulo ? el('p', { class: 'suave chica', texto: t('appm.pediste', { texto: p.pedido }) }) : null,
      p.explicacion ? el('p', { texto: p.explicacion }) : null,
      p.archivos?.length ? el('p', { class: 'suave chica', texto: t('appm.archivos', { lista: p.archivos.join(', ') }) }) : null,
      pr ? el('p', { class: pr.ok ? 'bien chica' : 'mal chica', texto: pr.ok ? t('appm.pruebas.ok', { n: pr.pasaron ?? 0, s: pr.segundos ?? 0 }) : t('appm.pruebas.mal', { n: pr.fallaron ?? 0, lista: (pr.fallidas ?? []).slice(0, 3).join(' · ') || '—' }) }) : null,
      p.motivo ? el('p', { class: 'suave chica', texto: h.tSi(`appm.motivo.${String(p.motivo).replace(/:.*/, '')}`, p.motivo) }) : null,
      p.diff ? el('details', {}, el('summary', { texto: t('appm.ver_diff') }), el('pre', { class: 'appm-diff', texto: p.diff })) : null,
      el('p', { class: 'suave chica', texto: [h.fecha(p.creadaEn), p.commit ? `commit ${p.commit.slice(0, 7)}` : null, h.tSi(`appm.origen.${p.origen}`, p.origen)].filter(Boolean).join(' · ') }),
      acciones.length ? el('div', { class: 'botones' }, acciones) : null);
  };
  const lista = el('section', { class: 'tarjeta ancha' },
    el('h3', { texto: t('appm.propuestas') }),
    (d.propuestas ?? []).length ? d.propuestas.map(tarjeta) : el('p', { class: 'suave', texto: t('appm.sin_propuestas') }));

  const pantallas = el('section', { class: 'tarjeta' },
    el('h3', { texto: t('appm.pantallas') }),
    el('ul', { class: 'appm-pantallas' }, (d.pantallas ?? []).map(p => el('li', { class: p.hecha ? 'hecha' : '' }, h.icono(p.hecha ? 'bien' : 'reloj', 'icono chico'), el('span', { texto: p.nombre }), p.cambios ? el('span', { class: 'suave chica', texto: ` · ${t('appm.cambios_n', { n: p.cambios })}` }) : null))));
  const ideas = (d.ideas ?? []).length ? el('section', { class: 'tarjeta' },
    el('h3', { texto: t('appm.ideas') }),
    el('p', { class: 'suave chica', texto: t('appm.ideas.linea') }),
    el('ul', { class: 'lista-simple' }, d.ideas.map(x => el('li', { texto: x.texto })))) : null;

  return el('div', { class: 'rejilla dos appm' }, cabeza, token, lista, pedir, ajustes, pantallas, ideas);
}
