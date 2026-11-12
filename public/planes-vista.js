// Academia 0.12.9 (X): la página de planes del tutor IA, bonita y honesta (móvil primero, sin presión falsa: nada de
// «quedan 2 lugares» ni relojes). La usa «Tiempo con IA» (public/pagos.js) en el modo planes. Todo texto con textContent.
//  - «Tu tutor IA personal» y los días de prueba que le quedan (de verdad, de su cuenta);
//  - dos tarjetas: IA Estándar / IA Plus (precio en US$ y en RD$ si el administrador puso la tasa, usos, ≈ por día);
//  - «Con IA vs sin IA» con las funciones que existen DE VERDAD en la app (las básicas siguen gratis siempre);
//  - un ejemplo ESTÁTICO marcado «ejemplo» (no es una respuesta de la IA);
//  - 3 pasos para pagar (el flujo de siempre: transferencia + foto del comprobante).
export function vistaPlanes(d, h, { irA = null } = {}) {
  const { el, t, icono, numero } = h;
  const pg = d.pagar ?? {};
  const planes = pg.planes ?? [];
  const tiempo = d.tiempo ?? {};
  const precio = p => (p.precioRd ? t('plan.precio_rd', { usd: p.precioUsd, rd: p.precioRd }) : t('plan.precio', { usd: p.precioUsd }));
  const lista = (clave, n, marca) => el('ul', { class: 'lista-beneficios' }, Array.from({ length: n }, (_, i) => el('li', { class: 'con-icono' }, icono(marca, 'icono chico'), el('span', { texto: t(`${clave}.${i + 1}`) }))));
  // La prueba: lo que le queda de verdad (o que empieza con su primer uso).
  const p = tiempo.prueba;
  const prueba = p && !p.terminada
    ? el('p', { class: 'planes-prueba con-icono' }, icono('reloj', 'icono chico'),
      el('span', { texto: p.empezada ? t('planes.prueba_quedan', { dias: numero(p.quedanDias ?? 0), por_dia: numero(p.porDia ?? 0) }) : t('planes.prueba_nueva', { dias: numero(p.dias ?? pg.pruebaDias ?? 0), por_dia: numero(p.porDia ?? pg.pruebaUsosDia ?? 0) }) }))
    : tiempo.plan && !tiempo.plan.vencido ? el('p', { class: 'planes-prueba con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: t('plan.estado.plan', { nombre: tiempo.plan.nombre, n: numero(tiempo.plan.quedan ?? 0), dias: numero(tiempo.plan.dias ?? 0) }) }))
      : null;
  const tarjeta = (x, i) => el('article', { class: `plan-tarjeta${i === planes.length - 1 ? ' plus' : ''}` },
    el('h3', { texto: x.nombre }),
    el('p', { class: 'plan-precio' }, el('strong', { texto: precio(x) })),
    el('p', { class: 'fuerte', texto: t('planes.usos', { n: numero(x.usos), dias: numero(pg.planDias ?? 30) }) }),
    el('p', { class: 'suave chica', texto: t('planes.por_dia', { n: numero(Math.floor(x.usos / Math.max(1, pg.planDias ?? 30))) }) }),
    el('p', { class: 'chica', texto: t(i === planes.length - 1 ? 'planes.plus_para' : 'planes.estandar_para') }));
  const ejemplo = el('aside', { class: 'planes-ejemplo caja-hoja', 'aria-label': t('planes.ejemplo_titulo') },
    el('p', { class: 'sello-ejemplo', texto: t('planes.ejemplo_sello') }),
    el('p', { class: 'burbuja-ejemplo fuerte', texto: t('planes.ejemplo_1') }),
    el('p', { class: 'burbuja-ejemplo', texto: t('planes.ejemplo_2') }));
  const pasos = el('ol', { class: 'planes-pasos' }, [1, 2, 3].map(n => el('li', { texto: t(`planes.paso.${n}`) })));
  return el('section', { class: 'panel planes-ia' },
    el('p', { class: 'antetitulo', texto: t('planes.antetitulo') }),
    el('h2', { class: 'titulo-grande', texto: t('planes.titulo') }),
    el('p', { class: 'bajada', texto: t('planes.linea') }),
    prueba,
    planes.length ? el('div', { class: 'planes-tarjetas' }, planes.map(tarjeta)) : null,
    el('div', { class: 'comparacion-columnas' },
      el('div', { class: 'comparacion-basico' }, el('h3', { class: 'con-icono' }, icono('cerebro', 'icono chico'), el('span', { texto: t('planes.sin_ia') })), lista('planes.sin', 5, 'marca')),
      el('div', { class: 'comparacion-ia-col' }, el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: t('planes.con_ia') })), lista('planes.con', 7, 'chispa'))),
    ejemplo,
    el('h3', { texto: t('planes.como_pagar') }), pasos,
    el('p', { class: 'suave chica', texto: t('planes.honesto') }),
    irA ? el('button', { type: 'button', class: 'boton-3d naranja grande', onclick: () => { irA.scrollIntoView({ behavior: 'smooth', block: 'start' }); irA.querySelector('input')?.focus({ preventScroll: true }); } }, el('span', { texto: t('planes.elegir') })) : null);
}
