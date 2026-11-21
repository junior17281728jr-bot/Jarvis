// 0.14.105 (pedido del dueño: «no me deja mover la mezcla… lo más resumido, se ve muy feo eso»): el cajón del motor,
// chico y ordenado. Arriba: «Apagar motor / Encender motor» y «Encender todo (automático)»; una fila de mandos (MASTER,
// combustible, la perilla de los magnetos, el calor al carburador y la palanca roja de la mezcla); las luces (NAV, BCN,
// STRB, LDG, TAXI, con el MASTER); una línea con RPM, EGT, FF y combustible; y, solo en el arranque guiado, el paso que
// sigue. Los mandos son propios (no el <input type=range> del navegador): andan igual con el dedo (iOS y Android), el
// ratón y el teclado, aunque la escena de atrás capture los toques.
// Recibe el «el» de la app (o uno de mentira en las pruebas), los textos y lo que hace cada mando. Sin estado propio del avión.
import { MOTOR_FAA, LUCES, lucesActivas } from './motor-piston.js';

const lim = (x, a, b) => Math.min(b, Math.max(a, x));

// La palanca de la mezcla: una perilla roja sobre un riel (CORTE a la izquierda, RICA a la derecha). Arrastre con el
// puntero (dedo o ratón, con captura), toque en el riel, y teclas (←/→ de a 2 %, Re Pág/Av Pág de a 10 %, Inicio/Fin).
export function crearPalanca({ el, etiqueta, valor = 1, alCambiar }) {
  let v = lim(valor, 0, 1), arrastrando = null;
  const perilla = el('span', { class: 'juego-palanca-perilla', 'aria-hidden': 'true' });
  const riel = el('span', { class: 'juego-palanca-riel', 'aria-hidden': 'true' }, el('span', { class: 'juego-palanca-lleno' }), perilla);
  const nodo = el('div', { class: 'juego-palanca', role: 'slider', tabindex: '0', 'aria-label': etiqueta, 'aria-valuemin': '0', 'aria-valuemax': '100' }, riel);
  const pintar = () => {
    nodo.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    nodo.setAttribute('aria-valuetext', v < 0.05 ? 'CUTOFF' : `${Math.round(v * 100)} %`);
    nodo.style?.setProperty?.('--v', v.toFixed(3));
  };
  const poner = (x, avisar = true) => { const n = lim(x, 0, 1); if (Math.abs(n - v) < 1e-4) return; v = n; pintar(); if (avisar) alCambiar(v); };
  const desdePuntero = e => { const r = riel.getBoundingClientRect(); return r.width > 0 ? (e.clientX - r.left) / r.width : v; };
  nodo.addEventListener('pointerdown', e => {
    arrastrando = e.pointerId; try { nodo.setPointerCapture?.(e.pointerId); } catch { /* sin captura */ }
    e.preventDefault?.(); e.stopPropagation?.(); poner(desdePuntero(e));
  });
  nodo.addEventListener('pointermove', e => { if (arrastrando === e.pointerId) { e.preventDefault?.(); poner(desdePuntero(e)); } });
  for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) nodo.addEventListener(tipo, e => { if (arrastrando === e.pointerId) arrastrando = null; });
  // (la escena de atrás frena el «touchmove» para el yugo: aquí no llega)
  nodo.addEventListener('touchstart', e => e.stopPropagation?.(), { passive: true });
  nodo.addEventListener('touchmove', e => { e.stopPropagation?.(); if (e.cancelable) e.preventDefault?.(); }, { passive: false });
  nodo.addEventListener('keydown', e => {
    const paso = { ArrowLeft: -0.02, ArrowDown: -0.02, ArrowRight: 0.02, ArrowUp: 0.02, PageDown: -0.1, PageUp: 0.1 }[e.key];
    if (paso != null) poner(v + paso); else if (e.key === 'Home') poner(0); else if (e.key === 'End') poner(1); else return;
    e.preventDefault?.(); e.stopPropagation?.();
  });
  pintar();
  return { nodo, get valor() { return v; }, fijar: x => { if (arrastrando == null) { v = lim(x, 0, 1); pintar(); } }, get arrastrando() { return arrastrando != null; } };
}

// La perilla de los magnetos: un toque pasa a la posición siguiente (OFF → R → L → BOTH); mantenerla apretada lleva a
// START (el arranque) y al soltar vuelve a BOTH, como la llave. Con el teclado: ←/→ cambian y «S» (o Enter en BOTH) da START unos segundos.
export function crearPerilla({ el, etiqueta, posicion = 'OFF', alCambiar, sostenerMs = 450, temporizador = globalThis }) {
  const POS = MOTOR_FAA.magnetos, ANG = { OFF: -60, R: -20, L: 20, BOTH: 60, START: 95 };
  let pos = posicion, reloj = null, enStart = false, ignorarClic = false;
  const marca = el('span', { class: 'juego-perilla-marca', 'aria-hidden': 'true' });
  const texto = el('span', { class: 'juego-perilla-texto' });
  const nodo = el('button', { type: 'button', class: 'juego-perilla', 'aria-label': etiqueta }, el('span', { class: 'juego-perilla-cara', 'aria-hidden': 'true' }, marca), texto);
  const pintar = () => { texto.textContent = pos; nodo.setAttribute('data-pos', pos); nodo.style?.setProperty?.('--giro', `${ANG[pos]}deg`); nodo.setAttribute('aria-valuetext', pos); };
  const poner = p => { if (p === pos) return; pos = p; pintar(); alCambiar(pos); };
  const siguiente = () => POS[(POS.indexOf(pos === 'START' ? 'BOTH' : pos) + 1) % 4];
  const soltar = () => { temporizador.clearTimeout?.(reloj); reloj = null; if (enStart) { enStart = false; poner('BOTH'); } };
  nodo.addEventListener('pointerdown', e => {
    try { nodo.setPointerCapture?.(e.pointerId); } catch { /* sin captura */ }
    e.preventDefault?.(); e.stopPropagation?.();
    reloj = temporizador.setTimeout?.(() => { reloj = null; enStart = true; poner('START'); }, sostenerMs);
  });
  nodo.addEventListener('pointerup', e => {
    e.stopPropagation?.();
    if (enStart) { soltar(); ignorarClic = true; return; }
    if (reloj != null) { temporizador.clearTimeout?.(reloj); reloj = null; poner(siguiente()); ignorarClic = true; }
  });
  nodo.addEventListener('pointercancel', soltar);
  nodo.addEventListener('click', e => { if (ignorarClic) { ignorarClic = false; return; } if (e.detail === 0) poner(siguiente()); });
  nodo.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') poner(POS[Math.min(3, POS.indexOf(pos) + 1)]);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') poner(POS[Math.max(0, Math.min(3, POS.indexOf(pos)) - 1)]);
    else if (e.key === 's' || e.key === 'S') { enStart = true; poner('START'); temporizador.clearTimeout?.(reloj); reloj = temporizador.setTimeout?.(() => soltar(), 2500); }
    else return;
    e.preventDefault?.(); e.stopPropagation?.();
  });
  pintar();
  return { nodo, get posicion() { return pos; }, fijar: p => { if (!enStart && p !== pos) { pos = p; pintar(); } } };
}

// El cajón entero. estado(): { pist, enSuelo, potencia, rpm, aceitePsi, combustible, guiado }. acciones: { poner(cambio),
// encender(), apagar(), todo(), guiado(), manual(), cerrar() }.
export function crearPanelMotor({ el, t, estado, acciones, temporizador = globalThis }) {
  const chip = (clase, texto, f, extra = {}) => el('button', { type: 'button', class: `juego-chip-motor ${clase}`, onclick: f, ...extra }, texto);
  const bOnOff = chip('juego-motor-onoff', '', () => (estado().pist?.enMarcha ? acciones.apagar() : acciones.encender()));
  const bTodo = chip('juego-motor-todo', [el('span', { texto: t('juego.motor.todo') }), el('span', { class: 'juego-motor-largo', texto: ` ${t('juego.motor.auto')}` })], () => acciones.todo(), { 'aria-label': `${t('juego.motor.todo')} ${t('juego.motor.auto')}` });
  // (en el teléfono de pie, «Arranque guiado» se acorta a «Guiado»)
  const opcion = (largo, corto, f) => chip('juego-motor-opcion', [el('span', { class: 'juego-motor-largo', texto: t(largo) }), el('span', { class: 'juego-motor-corto', texto: t(corto) })], f, { 'aria-label': t(largo) });
  const bGuiado = opcion('juego.motor.guiado', 'juego.motor.guiado_corto', () => acciones.guiado());
  const bManual = opcion('juego.motor.manual', 'juego.motor.manual_corto', () => acciones.manual());
  const bCerrar = el('button', { type: 'button', class: 'juego-chip-motor juego-motor-cerrar', 'aria-label': t('juego.aviso.cerrar'), onclick: () => acciones.cerrar() }, '×');
  const bMaster = chip('juego-motor-master', 'MASTER', () => acciones.poner({ master: !estado().pist.master }), { 'aria-pressed': 'false' });
  const bFuel = chip('juego-motor-fuel', 'FUEL', () => acciones.poner({ selector: estado().pist.selector === 'BOTH' ? 'OFF' : 'BOTH' }), { 'aria-pressed': 'false' });
  const bCalor = chip('juego-motor-calor', t('juego.motor.calor'), () => acciones.poner({ calor: !estado().pist.calor }), { 'aria-pressed': 'false' });
  const perilla = crearPerilla({ el, etiqueta: t('juego.motor.magnetos'), posicion: estado().pist?.magnetos ?? 'OFF', alCambiar: p => acciones.poner({ magnetos: p }), temporizador });
  const palanca = crearPalanca({ el, etiqueta: t('juego.motor.mezcla'), valor: estado().pist?.mezcla ?? 1, alCambiar: v => acciones.poner({ mezcla: Math.round(v * 100) / 100 }) });
  const bLuces = LUCES.map(k => chip('juego-motor-luz', t(`juego.luces.${k}`), () => { const p = estado().pist; acciones.poner({ luces: { ...(p.luces ?? {}), [k]: !p.luces?.[k] } }); }, { 'aria-pressed': 'false', 'data-luz': k }));
  const datos = el('p', { class: 'juego-motor-datos', 'aria-live': 'off' });
  const estadoTexto = el('p', { class: 'juego-motor-estado', role: 'status' });
  const guia = el('p', { class: 'juego-motor-guia', hidden: true });
  const nodo = el('section', { class: 'juego-motor', hidden: true, 'aria-label': t('juego.motor') },
    el('div', { class: 'juego-motor-fila juego-motor-arriba' }, bOnOff, bTodo, bCerrar),
    el('div', { class: 'juego-motor-fila juego-motor-mandos' }, bMaster, bFuel, perilla.nodo,
      el('div', { class: 'juego-motor-mezcla' }, el('span', { class: 'juego-mezcla-fin', texto: t('juego.motor.corte') }), palanca.nodo, el('span', { class: 'juego-mezcla-fin', texto: t('juego.motor.rica') })), bCalor),
    // (las luces y, en tierra, el arranque guiado o manual: en la misma fila, para que el cajón quede bajo)
    el('div', { class: 'juego-motor-fila juego-motor-luces' }, el('div', { class: 'juego-motor-grupo', role: 'group', 'aria-label': t('juego.luces') }, bLuces), el('div', { class: 'juego-motor-grupo juego-motor-opciones' }, bGuiado, bManual)),
    guia, datos, estadoTexto);
  let hastaEstado = 0;
  function pintar() {
    const s = estado(), p = s.pist;
    if (!p) return;
    bOnOff.textContent = t(p.enMarcha ? 'juego.motor.apagar' : 'juego.motor.encender');
    bOnOff.setAttribute('data-anda', p.enMarcha ? '1' : '0');
    bMaster.setAttribute('aria-pressed', String(Boolean(p.master)));
    bFuel.setAttribute('aria-pressed', String(p.selector === 'BOTH')); bFuel.textContent = `FUEL ${p.selector}`;
    bCalor.setAttribute('aria-pressed', String(Boolean(p.calor)));
    perilla.fijar(p.magnetos); palanca.fijar(p.mezcla);
    const act = lucesActivas(p);
    for (const b of bLuces) { const k = b.getAttribute('data-luz'); b.setAttribute('aria-pressed', String(Boolean(p.luces?.[k]))); b.setAttribute('data-da-luz', act[k] ? '1' : '0'); }
    for (const b of [bGuiado, bManual]) b.hidden = !s.enSuelo;
    const d = t('juego.motor.datos2', { rpm: Math.round((s.rpm ?? 0) / 10) * 10, egt: Math.round(p.egt ?? 0).toLocaleString('en-US'), ff: (p.flujoGph ?? 0).toFixed(1), gal: (s.combustible ?? 0).toFixed(1), psi: Math.round(s.aceitePsi ?? 0) });
    if (datos.textContent !== d) datos.textContent = d;
    // El arranque guiado: solo el paso que sigue (y cuántos van).
    guia.hidden = !s.guiado || !s.lista;
    if (s.guiado && s.lista) {
      const i = s.lista.findIndex(x => !x.hecho), n = s.lista.length;
      const g = i < 0 ? `✓ ${t('juego.motor.guia_lista')}` : `${s.lista.map(x => (x.hecho ? '●' : '○')).join('')} ${t('juego.motor.paso', { n: i + 1, total: n })}: ${t(`juego.motor.${s.modoLista ?? 'arranque'}.${s.lista[i].id}`)}`;
      if (guia.textContent !== g) guia.textContent = g;
    }
    if (estadoTexto.textContent && (s.ahora ?? Date.now()) > hastaEstado) estadoTexto.textContent = '';
    nodo.setAttribute('data-vuelo', s.enSuelo ? '0' : '1');
  }
  return {
    nodo, pintar, palanca, perilla, botones: { bOnOff, bTodo, bGuiado, bManual, bMaster, bFuel, bCalor, bLuces, bCerrar },
    decir(texto, tono = 'info', ahora = Date.now()) { estadoTexto.textContent = texto; estadoTexto.setAttribute('data-tono', tono); hastaEstado = ahora + 9000; },
  };
}
