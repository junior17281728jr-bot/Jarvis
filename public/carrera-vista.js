// Academia 0.14.14 (pedido del dueño: «Progreso» corto, básico y visual, «como una carrera hacia la meta»):
//  - «La carrera»: dos pistas (Test Guide y oral); cada alumno es un avioncito en su % (Tú, más grande y del color de la
//    marca), la meta a cuadros al 100 % y una rayita suave en el promedio. Debajo: «Vas 2.º de 5 · 45 %» y «Ahora en».
//    Aviones muy juntos se juntan en uno con «+3» (al tocarlo, quiénes son); nunca más de 8 por pista.
//  - «Tabla»: el podio (los 3 primeros) y una fila corta por alumno: inicial, nombre, «M3 · T2» y sus dos barras.
//  - «Mis números» (solo lo propio): racha, temas hechos, nota media de exámenes y el tiempo de esta semana.
// Los datos: GET /api/academia/carrera (src/academia/carrera.js) y, para el administrador, «Cómo van todos».
// Todo con h.el (solo textContent) y la posición por CSSOM (style.left: la CSP no deja style en línea).
// La lógica (agruparAviones, puestoDe, ordenTabla) es pura, sin DOM: test/carrera.test.js la prueba.

const pctDe = (p, campo) => Math.max(0, Math.min(100, Math.floor(Number(p?.[campo]) || 0)));

// El puesto de quien es «Tú» en una pista: 1 + cuántos van ESTRICTAMENTE delante (los empatados comparten puesto).
// → { puesto, de, pct } | null (si no corre).
export function puestoDe(pilotos, campo = 'tg') {
  const lista = (pilotos ?? []).filter(p => p[campo] != null);
  const yo = lista.find(p => p.esYo);
  if (!yo) return null;
  const pct = pctDe(yo, campo);
  return { puesto: 1 + lista.filter(p => pctDe(p, campo) > pct).length, de: lista.length, pct };
}

export function promedioDe(pilotos, campo = 'tg') {
  const lista = (pilotos ?? []).filter(p => p[campo] != null);
  return lista.length ? Math.round(lista.reduce((n, p) => n + pctDe(p, campo), 0) / lista.length) : 0;
}

// Los aviones de una pista. Los que quedan a menos de «separacion» puntos del avión de su grupo van juntos (con «+N»);
// después, mientras haya más de «max», se juntan los dos grupos vecinos más cercanos. El avión de un grupo es «Tú» si
// estás en él (si no, el que va más adelante) y va en SU %. → [{ clave, pct, alias, esYo, miembros: [{ alias, pct, esYo }] }]
// ordenados de atrás hacia adelante.
export function agruparAviones(pilotos, campo = 'tg', { max = 8, separacion = 12 } = {}) {
  const lista = (pilotos ?? []).filter(p => p[campo] != null)
    .map(p => ({ alias: String(p.alias ?? ''), pct: pctDe(p, campo), esYo: Boolean(p.esYo) }))
    .sort((a, b) => a.pct - b.pct || Number(a.esYo) - Number(b.esYo) || a.alias.localeCompare(b.alias, 'es'));
  const cabeza = g => g.find(x => x.esYo) ?? [...g].sort((a, b) => b.pct - a.pct || a.alias.localeCompare(b.alias, 'es'))[0];
  let grupos = [];
  for (const p of lista) {
    const g = grupos.at(-1);
    if (g && p.pct - cabeza(g).pct < separacion) g.push(p);
    else grupos.push([p]);
  }
  while (grupos.length > Math.max(1, max)) {
    let mejor = 0;
    for (let k = 1; k < grupos.length - 1; k++) if (cabeza(grupos[k + 1]).pct - cabeza(grupos[k]).pct < cabeza(grupos[mejor + 1]).pct - cabeza(grupos[mejor]).pct) mejor = k;
    grupos = [...grupos.slice(0, mejor), [...grupos[mejor], ...grupos[mejor + 1]], ...grupos.slice(mejor + 2)];
  }
  return grupos.map(g => {
    const c = cabeza(g);
    const miembros = [c, ...g.filter(x => x !== c).sort((a, b) => b.pct - a.pct || a.alias.localeCompare(b.alias, 'es'))];
    return { clave: c.esYo ? '\u0000yo' : c.alias, pct: c.pct, alias: c.alias, esYo: c.esYo, miembros };
  });
}

// El orden de la tabla: más % del Test Guide primero, después el oral, después el nombre.
export function ordenTabla(pilotos) {
  return [...(pilotos ?? [])].sort((a, b) => pctDe(b, 'tg') - pctDe(a, 'tg') || pctDe(b, 'oral') - pctDe(a, 'oral') || String(a.alias).localeCompare(String(b.alias), 'es'));
}

// «Piloto 3» viene así del servidor (src/academia/carrera.js): aquí, en el idioma de la pantalla.
const nombreVisto = (h, p) => (p.esYo ? h.t('carrera.tu') : /^Piloto \d+$/.test(p.alias ?? '') ? h.t('carrera.piloto', { n: h.numero(Number(p.alias.slice(7))) }) : p.alias);
const textoDonde = (h, en, oral) => (en ? h.t(oral ? 'carrera.donde_oral' : 'carrera.donde_tg', { n: h.numero(en.n), t: h.numero(en.t) }) : null);

// Una pista. → { nodo, actualizar(pilotos) } (los aviones se mueven con transición: la misma caja por avión).
function pista(h, { campo, titulo, iconoNombre, admin }) {
  const { el, t, numero } = h;
  const aviones = new Map();
  const zona = el('div', { class: 'carrera-zona' });
  // El promedio: una raya amarilla (el pie de la carrera lo dice); sin texto encima, que tapaba los «+N».
  const promedio = el('span', { class: 'carrera-promedio', 'aria-hidden': 'true' });
  zona.append(promedio);
  const puesto = el('strong', { class: 'carrera-puesto' });
  const ahora = el('p', { class: 'carrera-ahora' });
  const quienes = el('p', { class: 'carrera-quienes', hidden: true, 'aria-live': 'polite' });
  const nodo = el('div', { class: `carrera-pista ${campo}` },
    el('div', { class: 'carrera-cabeza' },
      el('span', { class: 'carrera-titulo' }, h.icono(iconoNombre, 'icono chico'), el('span', { texto: titulo })),
      puesto),
    el('div', { class: 'carrera-via' },
      el('span', { class: 'carrera-asfalto', 'aria-hidden': 'true' }),
      el('span', { class: 'carrera-meta', 'aria-hidden': 'true' }),
      zona),
    quienes, ahora);
  const mover = (caja, pct) => { caja.style.left = `${pct}%`; };
  let ultimos = [];
  // Cuánto aparta un avión del otro: unos 38 px (el de «Tú» es más grande) (en un iPhone de 320 px la pista es más corta: menos aviones).
  const medidas = () => {
    const ancho = zona.clientWidth || 250;
    return { separacion: Math.max(8, Math.ceil((100 * 38) / ancho)), max: Math.max(3, Math.min(8, Math.floor(ancho / 38))) };
  };
  const actualizar = pilotos => {
    ultimos = pilotos;
    const grupos = agruparAviones(pilotos, campo, medidas());
    const vistos = new Set();
    grupos.forEach((g, k) => {
      vistos.add(g.clave);
      let a = aviones.get(g.clave);
      if (!a) {
        const mas = el('span', { class: 'carrera-mas' });
        const nombre = el('span', { class: 'carrera-alias' });
        const boton = el('button', { type: 'button', class: 'carrera-avion' }, el('span', { class: 'carrera-icono' }, h.icono('avion', 'icono')), mas, nombre);
        a = { boton, mas, nombre, g };
        boton.addEventListener('click', () => {
          const ya = !quienes.hidden && quienes.dataset.clave === a.g.clave;
          quienes.hidden = ya;
          quienes.dataset.clave = a.g.clave;
          quienes.textContent = a.g.miembros.map(x => `${nombreVisto(h, x)} ${h.pctTexto(x.pct)}`).join(' · ');
        });
        aviones.set(g.clave, a);
        mover(boton, 0);
        zona.append(boton);
        requestAnimationFrame(() => requestAnimationFrame(() => mover(boton, a.g.pct)));
      } else mover(a.boton, g.pct);
      a.g = g;
      const otros = g.miembros.length - 1;
      a.mas.textContent = otros ? `+${numero(otros)}` : '';
      a.mas.hidden = !otros;
      // El administrador ve el nombre entero al tocar; debajo del avión, solo el primero (cabe).
      a.nombre.textContent = admin ? String(g.alias).split(' ')[0] : nombreVisto(h, g);
      a.boton.className = `carrera-avion fila-${k % 2 ? 'b' : 'a'}${g.esYo ? ' yo' : ''}${g.pct >= 100 ? ' llego' : ''}${g.pct < 12 ? ' al-inicio' : g.pct > 88 ? ' al-final' : ''}`;
      a.boton.setAttribute('aria-label', g.miembros.map(x => `${nombreVisto(h, x)}: ${h.pctTexto(x.pct)}`).join(', '));
      if (!quienes.hidden && quienes.dataset.clave === g.clave) quienes.textContent = g.miembros.map(x => `${nombreVisto(h, x)} ${h.pctTexto(x.pct)}`).join(' · ');
    });
    for (const [clave, a] of aviones) if (!vistos.has(clave)) { a.boton.remove(); aviones.delete(clave); }
    const prom = promedioDe(pilotos, campo);
    promedio.style.left = `${prom}%`;
    promedio.setAttribute('title', t('carrera.promedio', { pct: h.pctTexto(prom) }));
    const yo = (pilotos ?? []).find(p => p.esYo);
    const p = puestoDe(pilotos, campo);
    const corren = (pilotos ?? []).filter(x => x[campo] != null).length;
    puesto.textContent = p ? t('carrera.vas', { n: numero(p.puesto), total: numero(p.de), pct: h.pctTexto(p.pct) })
      : t('carrera.resumen', { n: numero(corren), pct: h.pctTexto(prom) });
    ahora.hidden = admin || !yo;
    if (yo) {
      const en = campo === 'tg' ? yo.tgEn : yo.oralEn;
      ahora.replaceChildren(el('span', { class: 'carrera-ahora-rotulo', texto: t('carrera.ahora') }),
        el('strong', { texto: pctDe(yo, campo) >= 100 ? t('carrera.en_meta') : textoDonde(h, en, campo === 'oral') ?? t('carrera.sin_despegar') }));
    }
  };
  // Ya en la pantalla, con el ancho de verdad (antes de pintarse no se sabe).
  requestAnimationFrame(() => { if (zona.clientWidth) actualizar(ultimos); });
  return { nodo, actualizar };
}

// «La carrera»: datos = { oral, pilotos }. admin: los nombres enteros y sin «Tú». → { nodo, actualizar(datos) }
export function vistaCarrera(h, datos, { admin = false } = {}) {
  const { el, t } = h;
  const tg = pista(h, { campo: 'tg', titulo: t('carrera.tg'), iconoNombre: 'libro', admin });
  const oral = pista(h, { campo: 'oral', titulo: t('carrera.oral'), iconoNombre: 'microfono', admin });
  const nodo = el('section', { class: 'panel carrera', 'aria-labelledby': 'carrera-titulo' },
    el('div', { class: 'carrera-arriba' },
      el('h2', { id: 'carrera-titulo', class: 'con-icono' }, h.icono('bandera'), el('span', { texto: t('carrera.titulo') })),
      el('span', { class: 'carrera-cuantos suave chica' })),
    // 0.14.15: cada sección con una línea que dice qué es.
    el('p', { class: 'seccion-sub suave chica', texto: t(admin ? 'carrera.sub_admin' : 'carrera.sub') }),
    tg.nodo, oral.nodo,
    el('p', { class: 'carrera-pie suave chica', texto: t(admin ? 'carrera.pie_admin' : 'carrera.pie') }));
  const actualizar = d => {
    const pilotos = d?.pilotos ?? [];
    nodo.querySelector('.carrera-cuantos').textContent = h.tn('carrera.pilotos', { n: pilotos.length });
    tg.actualizar(pilotos);
    oral.nodo.hidden = !d?.oral;
    if (d?.oral) oral.actualizar(pilotos);
  };
  actualizar(datos);
  return { nodo, actualizar };
}

// «Tabla»: el podio y una fila por alumno (máx. 10, y la tuya si quedó más abajo).
export function vistaTabla(h, pilotos, { oral = true } = {}) {
  const { el, t, numero } = h;
  const lista = ordenTabla(pilotos);
  const puesto = p => 1 + lista.filter(x => pctDe(x, 'tg') > pctDe(p, 'tg')).length;
  const inicial = p => el('span', { class: `tabla-inicial${p.esYo ? ' yo' : ''}`, 'aria-hidden': 'true', texto: (nombreVisto(h, p).match(/\p{L}|\d/u)?.[0] ?? '?').toUpperCase() });
  const MEDALLAS = ['🥇', '🥈', '🥉'];
  const top = lista.slice(0, 3);
  // El podio: el 2.º, el 1.º (más alto) y el 3.º.
  const podio = top.length >= 2 ? el('ol', { class: 'podio', 'aria-label': t('carrera.podio') }, [1, 0, 2].filter(k => top[k]).map(k => {
    const p = top[k];
    return el('li', { class: `podio-lugar lugar-${k + 1}${p.esYo ? ' yo' : ''}` },
      el('span', { class: 'podio-medalla', 'aria-hidden': 'true', texto: MEDALLAS[k] }),
      inicial(p),
      el('span', { class: 'podio-nombre', texto: nombreVisto(h, p) }),
      el('strong', { class: 'podio-pct', texto: h.pctTexto(pctDe(p, 'tg')) }),
      el('span', { class: 'podio-escalon', 'aria-hidden': 'true', texto: numero(k + 1) }));
  })) : null;
  let filas = lista.slice(0, 10);
  const yo = lista.find(p => p.esYo);
  if (yo && !filas.includes(yo)) filas = [...filas.slice(0, 9), yo];
  const barra = (pct, clase, nombre) => el('span', { class: `tabla-barra ${clase}`, title: `${nombre} ${h.pctTexto(pct)}` },
    el('span', { class: 'tabla-barra-nombre', texto: nombre }), el('span', { class: 'cv-barra av-barra' }, h.barraLlena(pct)), el('span', { class: 'tabla-barra-pct', texto: h.pctTexto(pct) }));
  const filasNodo = el('ol', { class: 'tabla-filas' }, filas.map(p => el('li', { class: `tabla-fila${p.esYo ? ' yo' : ''}` },
    el('span', { class: 'tabla-puesto', texto: numero(puesto(p)) }),
    inicial(p),
    el('span', { class: 'tabla-quien' },
      el('span', { class: 'tabla-nombre', texto: nombreVisto(h, p) }),
      textoDonde(h, p.tgEn, false) ? el('span', { class: 'tabla-chip', texto: textoDonde(h, p.tgEn, false) }) : el('span', { class: 'tabla-chip apagado', texto: t('carrera.chip_nada') })),
    el('span', { class: 'tabla-barras' }, barra(pctDe(p, 'tg'), 'tg', t('carrera.tg_corto')), oral && p.oral != null ? barra(pctDe(p, 'oral'), 'oral', t('carrera.oral_corto')) : null))));
  return el('section', { class: 'panel tabla-carrera', 'aria-labelledby': 'tabla-titulo' },
    el('h2', { id: 'tabla-titulo', class: 'con-icono' }, h.icono('trofeo'), el('span', { texto: t('carrera.tabla') })),
    el('p', { class: 'seccion-sub suave chica', texto: t('carrera.tabla_sub') }),
    podio, filasNodo);
}

// «Mis números»: 4 fichas grandes, solo lo propio. d: yo.datos de /api/academia/carrera.
export function vistaMisNumeros(h, d) {
  const { el, t, numero } = h;
  if (!d) return null;
  const ficha = (clase, iconoNombre, valor, rotulo) => el('li', { class: `mi-numero ${clase}` },
    el('span', { class: 'mi-numero-icono', 'aria-hidden': 'true' }, h.icono(iconoNombre, 'icono')),
    el('strong', { class: 'mi-numero-valor', texto: valor }),
    el('span', { class: 'mi-numero-rotulo', texto: rotulo }));
  const horas = Math.floor(d.minutosSemana / 60);
  const tiempo = horas ? t('carrera.horas', { h: numero(horas), m: numero(d.minutosSemana % 60) }) : t('carrera.minutos', { m: numero(d.minutosSemana) });
  return el('section', { class: 'panel mis-numeros', 'aria-labelledby': 'mis-numeros-titulo' },
    el('h2', { id: 'mis-numeros-titulo', class: 'con-icono' }, h.icono('velocimetro'), el('span', { texto: t('carrera.mis_numeros') })),
    el('p', { class: 'seccion-sub suave chica', texto: t('carrera.mis_numeros_sub') }),
    el('ul', { class: 'mis-numeros-lista' },
      ficha('racha', 'fuego', numero(d.racha), h.tn('carrera.dias_racha', { n: d.racha })),
      ficha('temas', 'libro', t('carrera.de', { n: numero(d.temas.hechos), total: numero(d.temas.total) }), t('carrera.temas_hechos')),
      ficha('nota', 'medalla', d.notaMedia == null ? '—' : h.pctTexto(d.notaMedia), t('carrera.nota_media')),
      ficha('tiempo', 'reloj', tiempo, t('carrera.esta_semana'))));
}
