// Academia 0.10.0: «Pedir más tiempo con IA» (el alumno), «Pagos» (el administrador) y el «Profesor virtual» (el chat).
// Sin librerías; todo texto con textContent (nunca como código). app.js le pasa sus ayudas. Los datos de la cuenta para
// transferir los pone el administrador: viven solo en la base del servidor.

export function crearPagos(h) {
  const { el, t, icono, api, talCual, numero, textoError, avisar, fecha, mostrar, marco, cabeceraAdmin, instructorUi } = h;
  const tx = (clave, vars = {}) => t(clave, vars);

  // «Instructor básico (gratis)» contra «Instructor con IA»: lo que de verdad hace cada uno.
  function comparacion(pagar = null) {
    const lista = (clave, n) => el('ul', { class: 'lista-beneficios' }, Array.from({ length: n }, (_, i) => el('li', { class: 'con-icono' }, icono('marca', 'icono chico'), el('span', { texto: tx(`${clave}.${i + 1}`) }))));
    return el('section', { class: 'panel comparacion-ia' },
      el('h2', { texto: tx('vender.titulo') }),
      el('p', { texto: tx('vender.intro') }),
      el('div', { class: 'comparacion-columnas' },
        el('div', { class: 'comparacion-basico' }, el('h3', { class: 'con-icono' }, icono('cerebro', 'icono chico'), el('span', { texto: tx('vender.basico') })), lista('vender.basico', 4)),
        el('div', { class: 'comparacion-ia-col' }, el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: tx('vender.ia') })), lista('vender.ia', 6))),
      pagar?.paquetes?.length ? el('ul', { class: 'lista-paquetes' }, pagar.paquetes.map(p => el('li', {}, el('strong', { texto: tx('pago.paquete', { n: numero(p.minutos) }) }), talCual('span', ` · ${p.precio}`)))) : null,
      el('p', { class: 'suave chica', texto: tx('vender.honesto') }),
      el('a', { class: 'boton-3d naranja', href: '#tiempo-ia' }, el('span', { texto: tx('vender.comprar') })));
  }

  // ---------- El alumno: «Pedir más tiempo con IA» ----------
  async function pantallaTiempo() {
    const r = await api('GET', '/api/academia/tiempo-ia');
    if (!r.ok) return mostrar(marco('inicio', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
    const d = r.datos;
    const pg = d.pagar;
    const datosCuenta = el('section', { class: 'panel datos-pago' },
      el('h2', { class: 'con-icono' }, icono('dinero'), el('span', { texto: tx('pago.como') })),
      pg.listo ? el('dl', { class: 'datos-cuenta' },
        ...[['banco', pg.banco], ['tipo', pg.tipoCuenta], ['numero', pg.numero], ['titular', pg.titular], ['documento', pg.documento]].filter(([, v]) => v)
          .flatMap(([k, v]) => [el('dt', { texto: tx(`pago.campo.${k}`) }), talCual('dd', v)])) : el('p', { class: 'aviso', texto: tx('pago.sin_datos') }),
      pg.instrucciones ? talCual('p', pg.instrucciones) : null);
    const mensaje = el('p', { class: 'mensaje', hidden: true });
    let elegido = pg.paquetes[0]?.id ?? null;
    const paquetes = el('fieldset', { class: 'paquetes' }, el('legend', { texto: tx('pago.elige') }), pg.paquetes.map((p, i) => el('label', { class: 'opcion-radio paquete' },
      el('input', { type: 'radio', name: 'paquete', value: p.id, checked: i === 0, onchange: () => { elegido = p.id; } }),
      el('span', {}, el('strong', { texto: tx('pago.paquete', { n: numero(p.minutos) }) }), talCual('span', ` · ${p.precio}`)))));
    const archivo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': tx('pago.foto') });
    const nota = el('input', { type: 'text', maxlength: 300, placeholder: tx('pago.nota.ejemplo'), 'aria-label': tx('pago.nota') });
    const enviar = el('button', {
      type: 'button', class: 'boton-3d grande',
      onclick: async () => {
        mensaje.hidden = true;
        const f = archivo.files?.[0];
        if (!elegido) return avisar(tx('pago.elige'), 'mal');
        if (!f) return avisar(tx('pago.falta_foto'), 'mal');
        if (f.size > d.maxBytes) return avisar(textoError('demasiado_grande'), 'mal');
        enviar.disabled = true;
        let x;
        try {
          const respuesta = await fetch(`/api/academia/pagos?paquete=${encodeURIComponent(elegido)}&nota=${encodeURIComponent(nota.value.trim())}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Oportia': '1', 'Content-Type': f.type || 'application/octet-stream' }, body: f });
          x = { ok: respuesta.ok, datos: await respuesta.json().catch(() => ({})) };
        } catch { x = { ok: false, datos: { error: 'sin_conexion' } }; }
        enviar.disabled = false;
        if (!x.ok) return avisar(textoError(x.datos.error), 'mal');
        avisar(x.datos.espera, 'info');
        await pantallaTiempo();
      },
    }, el('span', { texto: tx('pago.enviar') }));
    const subir = pg.listo ? el('section', { class: 'panel subir-pago' },
      el('h2', { class: 'con-icono' }, icono('subir'), el('span', { texto: tx('pago.subir') })),
      paquetes, el('label', { class: 'campo-archivo' }, el('span', { texto: tx('pago.foto') }), archivo), el('label', {}, el('span', { texto: tx('pago.nota') }), nota),
      el('p', { class: 'suave chica', texto: tx('pago.limites') }), enviar, mensaje) : null;
    const historial = d.pagos.length ? el('section', { class: 'panel historial-pagos' },
      el('h2', { texto: tx('pago.historial') }),
      el('ul', { class: 'lista-pagos' }, d.pagos.map(p => el('li', { class: `pago pago-${p.estado}` },
        el('img', { src: `/api/academia/pagos/${p.id}/recibo`, alt: tx('pago.foto'), loading: 'lazy', class: 'recibo-mini' }),
        el('div', {},
          el('p', {}, el('strong', { texto: tx('pago.paquete', { n: numero(p.minutos) }) }), el('span', { class: 'suave', texto: ` · ${fecha(p.fecha)}` })),
          el('p', { class: `estado-pago tono-${p.estado === 'aprobado' ? 'bien' : p.estado === 'rechazado' ? 'mal' : 'atencion'}`, texto: p.estado === 'revision' ? pg.espera : tx(`pago.estado.${p.estado}`) }),
          p.motivo ? el('p', { class: 'suave' }, el('span', { texto: `${tx('pago.motivo')} ` }), talCual('span', p.motivo)) : null))))) : null;
    if (d.novedades.length) api('POST', '/api/academia/tiempo-ia/visto', {});
    mostrar(marco('inicio',
      el('a', { class: 'volver con-icono', href: '#inicio' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: tx('acad.volver') })),
      el('section', { class: 'panel tiempo-cabeza' }, el('h1', { class: 'titulo-grande', texto: tx('tiempo.titulo') }), instructorUi().medidorTiempo({ ...d.tiempo, activo: true }, { conBoton: false }), el('p', { class: 'suave', texto: tx('tiempo.que_es', { n: numero(d.tiempo.porUso) }) })),
      comparacion(pg), datosCuenta, subir, historial));
  }

  // ---------- El administrador: «Pagos» ----------
  async function pantallaPagosAdmin(cargado = null) {
    const r = cargado ?? await api('GET', '/api/admin/academia/pagos');
    if (!r.ok) return mostrar(marco('admin', cabeceraAdmin('pagos'), el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
    const d = r.datos;
    const c = d.config;
    const ampliar = src => {
      const capa = el('div', { class: 'figura-grande', role: 'dialog', 'aria-modal': 'true', 'aria-label': tx('pago.foto') },
        el('div', { class: 'figura-grande-barra' }, el('span', { texto: tx('pago.foto') }), el('button', { type: 'button', class: 'boton-3d blanco cuadrado', 'aria-label': tx('acad.cerrar'), onclick: () => capa.remove() }, icono('cerrar'))),
        el('div', { class: 'figura-grande-lienzo' }, el('img', { src, alt: tx('pago.foto') })));
      document.body.append(capa);
    };
    const resolver = async (p, aprobar, boton) => {
      let motivo = '';
      if (!aprobar) { motivo = prompt(tx('pagos.motivo_pedir')) ?? ''; if (!motivo.trim()) return; }
      boton.disabled = true;
      const x = await api('POST', `/api/admin/academia/pagos/${p.id}/${aprobar ? 'aprobar' : 'rechazar'}`, aprobar ? {} : { motivo });
      if (!x.ok) { boton.disabled = false; return avisar(textoError(x.datos.error), 'mal'); }
      const falta = aprobar && x.datos.ia && !x.datos.ia.listo ? ` ${tx('pagos.falta_ia', { falta: x.datos.ia.falta.map(f => tx(`instr.motivo.${f}`)).join(', ') })}` : '';
      avisar((aprobar ? tx('pagos.aprobado', { n: numero(p.minutos), alumno: p.alumno.nombre }) : tx('pagos.rechazado')) + falta, falta ? 'info' : 'bien');
      pantallaPagosAdmin();
    };
    const filaPago = p => el('li', { class: `pago pago-${p.estado}` },
      el('button', { type: 'button', class: 'recibo-boton', 'aria-label': tx('pago.ampliar'), onclick: () => ampliar(`/api/admin/academia/pagos/${p.id}/recibo`) },
        el('img', { src: `/api/admin/academia/pagos/${p.id}/recibo`, alt: tx('pago.foto'), loading: 'lazy', class: 'recibo-mini' })),
      el('div', { class: 'pago-datos' },
        el('p', {}, el('strong', { texto: p.alumno.nombre }), el('span', { texto: ` · ${tx('pago.paquete', { n: numero(p.minutos) })}` }), p.precio ? talCual('span', ` · ${p.precio}`) : null),
        el('p', { class: 'suave chica', texto: fecha(p.fecha) }),
        p.nota ? el('p', { class: 'suave' }, el('span', { texto: `${tx('pago.nota')}: ` }), talCual('span', p.nota)) : null,
        p.estado === 'revision' ? el('div', { class: 'botones' },
          el('button', { type: 'button', class: 'boton-3d chico', onclick: e => resolver(p, true, e.currentTarget) }, el('span', { texto: tx('pagos.aprobar') })),
          el('button', { type: 'button', class: 'boton-3d rojo chico', onclick: e => resolver(p, false, e.currentTarget) }, el('span', { texto: tx('pagos.rechazar') })))
          : el('p', { class: `tono-${p.estado === 'aprobado' ? 'bien' : 'mal'}`, texto: [tx(`pago.estado.${p.estado}`), p.motivo].filter(Boolean).join(': ') })));
    // Los datos para transferir, los paquetes, el regalo y lo que cuesta un uso (solo el dueño, desde Tailscale).
    const campo = (id, valor, { tipo = 'text', max = 120 } = {}) => el('input', { id: `pago-${id}`, type: tipo, value: valor ?? '', maxlength: max });
    const campos = {
      banco: campo('banco', c.banco), tipoCuenta: campo('tipoCuenta', c.tipoCuenta), numero: campo('numero', c.numero, { max: 60 }), titular: campo('titular', c.titular),
      documento: campo('documento', c.documento, { max: 40 }), espera: campo('espera', c.espera, { max: 300 }),
      minutosRegalo: campo('minutosRegalo', c.minutosRegalo, { tipo: 'number' }), minutosPorUso: campo('minutosPorUso', c.minutosPorUso, { tipo: 'number' }),
    };
    const instrucciones = el('textarea', { id: 'pago-instrucciones', rows: 3, maxlength: 1000 });
    instrucciones.value = c.instrucciones ?? '';
    const paquetesTexto = el('textarea', { id: 'pago-paquetes', rows: 3, 'aria-describedby': 'pago-paquetes-ayuda' });
    paquetesTexto.value = c.paquetes.map(p => `${p.minutos} | ${p.precio}`).join('\n');
    const guardar = el('button', {
      type: 'button', class: 'boton-3d',
      onclick: async () => {
        const paquetes = paquetesTexto.value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x[0])
          .map(([m, precio]) => ({ id: `p${Number(m)}`, minutos: Number(m), precio: precio ?? '' }));
        const datos = { paquetes, instrucciones: instrucciones.value };
        for (const [k, nodo] of Object.entries(campos)) datos[k] = nodo.type === 'number' ? Number(nodo.value) : nodo.value;
        guardar.disabled = true;
        const x = await api('POST', '/api/admin/academia/pagos/ajustes', datos);
        guardar.disabled = false;
        if (!x.ok) return avisar(textoError(x.datos.error), 'mal');
        avisar(tx('pagos.guardado'), 'bien');
        pantallaPagosAdmin();
      },
    }, el('span', { texto: tx('pagos.guardar') }));
    const etiqueta = (k, nodo) => [el('label', { for: nodo.id, texto: tx(`pagos.campo.${k}`) }), nodo];
    const ajustes = el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, icono('dinero'), el('span', { texto: tx('pagos.ajustes') })),
      el('p', { class: 'suave', texto: tx('pagos.minuto') }),
      ...Object.entries(campos).flatMap(([k, nodo]) => etiqueta(k, nodo)), ...etiqueta('instrucciones', instrucciones), ...etiqueta('paquetes', paquetesTexto),
      el('p', { id: 'pago-paquetes-ayuda', class: 'ayuda', texto: tx('pagos.paquetes_ayuda') }),
      el('p', { class: 'suave chica con-icono' }, icono('candado', 'icono chico'), el('span', { texto: tx('pagos.solo_dueno') })), guardar);
    // El saldo de cada alumno (se puede dejar en un número).
    const saldos = el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, icono('reloj'), el('span', { texto: tx('pagos.saldos') })),
      el('ul', { class: 'lista-simple' }, d.alumnos.map(a => {
        const n = el('input', { type: 'number', min: 0, value: a.minutos, 'aria-label': tx('pagos.minutos_de', { alumno: a.nombre }), class: 'campo-corto' });
        return el('li', { class: 'fila-saldo' }, el('span', { texto: a.nombre }),
          el('span', { class: `chica tono-${a.ia?.listo ? 'bien' : 'atencion'}`, texto: a.ia?.listo ? tx('pagos.ia_lista') : tx('pagos.falta_ia', { falta: (a.ia?.falta ?? []).map(f => tx(`instr.motivo.${f}`)).join(', ') }) }), n,
          el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: async e => {
            e.currentTarget.disabled = true;
            const x = await api('POST', `/api/admin/academia/alumnos/${a.id}/minutos`, { minutos: Number(n.value) });
            if (!x.ok) avisar(textoError(x.datos.error), 'mal'); else avisar(tx('pagos.saldo_listo'), 'bien');
            pantallaPagosAdmin();
          } }, el('span', { texto: tx('pagos.poner') })));
      })));
    // Las fallas registradas: desde cuántas veces se registra una.
    const umbral = el('input', { type: 'number', min: 2, max: 10, value: d.fallas.umbral, class: 'campo-corto', id: 'fallas-umbral' });
    const examen = el('input', { type: 'number', min: 1, max: 10, value: d.fallas.examen, class: 'campo-corto', id: 'fallas-examen' });
    const fallas = el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, icono('atencion'), el('span', { texto: tx('pagos.fallas') })),
      el('label', { for: 'fallas-umbral', texto: tx('pagos.fallas.umbral') }), umbral,
      el('label', { for: 'fallas-examen', texto: tx('pagos.fallas.examen') }), examen,
      el('p', { class: 'suave chica', texto: tx('pagos.fallas.superar', { n: numero(d.fallas.aciertos), dias: numero(d.fallas.dias) }) }),
      el('button', { type: 'button', class: 'boton-3d blanco', onclick: async () => {
        const x = await api('POST', '/api/admin/academia/fallas/ajustes', { umbral: Number(umbral.value), examen: Number(examen.value) });
        avisar(x.ok ? tx('pagos.guardado') : textoError(x.datos.error), x.ok ? 'bien' : 'mal');
      } }, el('span', { texto: tx('pagos.guardar') })));
    const pendientes = d.pagos.filter(p => p.estado === 'revision');
    const resueltos = d.pagos.filter(p => p.estado !== 'revision');
    mostrar(marco('admin', cabeceraAdmin('pagos'),
      el('section', { class: 'tarjeta' },
        el('h2', { class: 'con-icono' }, icono('recibo'), el('span', { texto: tx('pagos.pendientes', { n: numero(pendientes.length) }) })),
        pendientes.length ? el('ul', { class: 'lista-pagos' }, pendientes.map(filaPago)) : el('p', { class: 'suave', texto: tx('pagos.ninguno') }),
        resueltos.length ? el('details', {}, el('summary', { texto: tx('pagos.resueltos', { n: numero(resueltos.length) }) }), el('ul', { class: 'lista-pagos' }, resueltos.map(filaPago))) : null),
      el('div', { class: 'rejilla dos' }, ajustes, el('div', {}, saldos, fallas, videosAdmin()))));
  }

  // Los videos de YouTube que el administrador elige por tema (el Profesor virtual los muestra primero).
  function videosAdmin() {
    const area = el('textarea', { rows: 4, id: 'videos-lista', 'aria-describedby': 'videos-ayuda' });
    api('GET', '/api/admin/academia/videos').then(r => { if (r.ok) area.value = r.datos.videos.map(v => [v.materia, v.tema, v.titulo, v.url].join(' | ')).join('\n'); });
    return el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, icono('video'), el('span', { texto: tx('videos.titulo') })),
      el('label', { for: 'videos-lista', texto: tx('videos.etiqueta') }), area,
      el('p', { id: 'videos-ayuda', class: 'ayuda', texto: tx('videos.ayuda') }),
      el('button', { type: 'button', class: 'boton-3d blanco', onclick: async () => {
        const videos = area.value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x.length >= 4).map(([materia, tema, titulo, url]) => ({ materia, tema, titulo, url }));
        const x = await api('POST', '/api/admin/academia/videos', { videos });
        avisar(x.ok ? tx('pagos.guardado') : textoError(x.datos.error), x.ok ? 'bien' : 'mal');
      } }, el('span', { texto: tx('pagos.guardar') })));
  }
  // El número de comprobantes en revisión, para la pestaña «Pagos» de Administrador.
  function contarPendientes(nodo) {
    api('GET', '/api/admin/academia/pagos/pendientes').then(r => {
      if (r.ok && r.datos.pendientes > 0 && nodo.isConnected) nodo.append(el('span', { class: 'contador-pendientes', 'aria-label': tx('pagos.pendientes', { n: r.datos.pendientes }), texto: String(r.datos.pendientes) }));
    });
  }

  // ---------- El Profesor virtual ----------
  const SUGERENCIAS = ['profesor.chip.1', 'profesor.chip.2', 'profesor.chip.3'];
  function enlaceVideo(v, clase) {
    return el('a', { class: clase, href: v.url, target: '_blank', rel: 'noopener noreferrer' }, icono('video', 'icono chico'), el('span', { texto: v.titulo ?? v.texto }));
  }
  function burbujas(m) {
    const respuesta = m.respuesta;
    return [
      el('div', { class: 'burbuja alumno' }, talCual('p', m.pregunta)),
      el('div', { class: 'burbuja profesor' },
        respuesta ? [
          // Lo que escribió la IA va como texto (una dirección que escriba se ve como texto, nunca como enlace).
          talCual('p', respuesta.respuesta),
          respuesta.estudiar ? el('p', { class: 'suave' }, el('strong', { texto: `${tx('profesor.estudia')} ` }), talCual('span', respuesta.estudiar)) : null,
          respuesta.control ? el('p', { class: 'pregunta-control' }, el('strong', { texto: `${tx('profesor.comprueba')} ` }), talCual('span', respuesta.control)) : null,
        ] : el('p', { class: 'suave', texto: m.estado === 'no' ? tx('profesor.no') : tx('instr.ia.escribiendo') }),
        m.videos?.length || m.buscar?.length ? el('div', { class: 'videos' },
          ...(m.videos ?? []).map(v => enlaceVideo(v, 'video-elegido')),
          ...(m.buscar ?? []).map(v => enlaceVideo({ url: v.url, titulo: tx('profesor.buscar', { texto: v.texto }) }, 'video-buscar'))) : null),
    ];
  }
  async function pantallaProfesor(cargado = null) {
    const r = cargado ?? await api('GET', '/api/academia/profesor');
    if (!r.ok) return mostrar(marco('inicio', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
    const d = r.datos;
    const volver = el('a', { class: 'volver con-icono', href: '#inicio' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: tx('acad.volver') }));
    if (!d.permiso.permitido) {
      return mostrar(marco('inicio', volver, el('section', { class: 'panel' }, el('h1', { class: 'titulo-grande', texto: tx('profesor.titulo') }), el('p', { texto: tx('profesor.sin_permiso') })), comparacion()));
    }
    const lista = el('div', { class: 'chat-lista', 'aria-live': 'polite' }, d.historial.flatMap(burbujas));
    const entradaTexto = el('textarea', { rows: 2, maxlength: 500, 'aria-label': tx('profesor.escribe'), placeholder: tx('profesor.escribe') });
    const medidor = el('div', { class: 'chat-tiempo' }, instructorUi().medidorTiempo({ ...d.tiempo, activo: true }));
    const mandar = async texto => {
      const mensaje = String(texto ?? entradaTexto.value).trim();
      if (mensaje.length < 2) return entradaTexto.focus();
      boton.disabled = true;
      const x = await api('POST', '/api/academia/profesor', { mensaje });
      boton.disabled = false;
      if (!x.ok) return avisar(textoError(x.datos.error), 'mal');
      entradaTexto.value = '';
      const m = { pregunta: mensaje, respuesta: null, estado: x.datos.ia.estado, videos: x.datos.videos, buscar: x.datos.buscar };
      const nodos = burbujas(m);
      lista.append(...nodos);
      const caja = nodos[1];
      if (x.datos.tiempo) medidor.replaceChildren(instructorUi().medidorTiempo({ ...x.datos.tiempo, activo: true }) ?? '');
      if (x.datos.ia.estado === 'no') {
        caja.replaceChildren(x.datos.ia.motivo === 'sin_minutos' ? instructorUi().sinMinutos() : el('p', { class: 'suave', texto: tx('profesor.no') }),
          x.datos.basica ? el('p', {}, el('strong', { texto: `${tx('profesor.basico')} ` }), el('span', { texto: tx(`instr.c.${x.datos.basica.clave}`, x.datos.basica.vars ?? {}) })) : null,
          ...[...(x.datos.videos ?? []).map(v => enlaceVideo(v, 'video-elegido')), ...(x.datos.buscar ?? []).map(v => enlaceVideo({ url: v.url, titulo: tx('profesor.buscar', { texto: v.texto }) }, 'video-buscar'))]);
      } else if (x.datos.ia.estado === 'pendiente') {
        const vuelta = async (n = 0) => {
          if (!caja.isConnected) return;
          const y = await api('GET', '/api/academia/profesor');
          const ultimo = y.ok ? y.datos.historial.at(-1) : null;
          if (ultimo?.respuesta || ultimo?.estado === 'no') { caja.replaceWith(...burbujas(ultimo).slice(1)); medidor.replaceChildren(instructorUi().medidorTiempo({ ...y.datos.tiempo, activo: true }) ?? ''); return; }
          if (n < 60) setTimeout(() => vuelta(n + 1), 2000);
        };
        setTimeout(vuelta, 2000);
      }
      caja.scrollIntoView?.({ block: 'nearest' });
    };
    const boton = el('button', { type: 'button', class: 'boton-3d', onclick: () => mandar() }, el('span', { texto: tx('profesor.enviar') }));
    mostrar(marco('inicio', volver,
      el('section', { class: 'panel chat' },
        el('div', { class: 'chat-cabeza' }, el('span', { class: 'instructor-avatar', 'aria-hidden': 'true' }, icono('cerebro')),
          el('div', {}, el('h1', { texto: tx('profesor.titulo') }), el('p', { class: 'suave chica', texto: tx('profesor.linea') })), medidor),
        lista,
        el('div', { class: 'chips' }, SUGERENCIAS.map(k => el('button', { type: 'button', class: 'chip', onclick: () => mandar(tx(k)) }, el('span', { texto: tx(k) })))),
        el('div', { class: 'chat-escribir' }, entradaTexto, boton),
        el('p', { class: 'suave chica', texto: tx('profesor.reglas') }))));
  }

  return Object.freeze({ comparacion, pantallaTiempo, pantallaPagosAdmin, contarPendientes, pantallaProfesor });
}
