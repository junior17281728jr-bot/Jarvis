// Academia 0.9.1: el camino con las materias plegables. Antes la materia 1 estaba siempre abierta con su sendero largo
// y había que bajar mucho para ver las demás. Ahora cada materia es una tarjeta (número, nombre, ícono, avance,
// estado, si vio el video, punto débil) que abre o cierra su sendero:
//  - Al entrar solo está abierta la materia ACTUAL (la del paso que toca); lo que la persona abre o cierra se recuerda
//    en este navegador, por cuenta (localStorage, si se puede).
//  - «Ver todas / Cerrar todas» arriba.
//  - Una materia bloqueada se puede abrir para VER sus temas (títulos y cuántas preguntas), pero siguen cerrados:
//    el orden 1 → 11 es el de siempre (lo decide el servidor).
//  - Accesible: un botón con aria-expanded y aria-controls sobre cada tarjeta; lo cerrado no se lee ni se toca.
//  - Sin saltos al abrir la pantalla: el estado se pone antes de dibujar y la animación solo corre al tocar.
// Recibe lo que necesita (t, icono, …) como perfil-vista.js: no importa app.js.

const CLAVE = usuario => `op_camino_abiertas_${usuario}`;

export function leerAbiertas(usuario) {
  try {
    const x = JSON.parse(localStorage.getItem(CLAVE(usuario)) || 'null');
    return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  } catch { return {}; }
}
function guardarAbiertas(usuario, abiertas) {
  try { localStorage.setItem(CLAVE(usuario), JSON.stringify(abiertas)); } catch { /* sin almacenamiento: no se recuerda */ }
}

// ¿Qué materias empiezan abiertas? Lo que la persona eligió antes; si no eligió nada para una materia, solo la actual
// (la del paso que toca o, si no hay paso, la primera que esté en curso).
export function abiertasAlEntrar(materias, siguiente, guardadas = {}) {
  const plegables = materias.filter(m => m.temas?.length);
  const actual = siguiente?.materia ?? plegables.find(m => m.estado === 'abierta')?.id ?? null;
  const abiertas = new Set();
  for (const m of plegables) {
    const elegida = guardadas[m.id];
    if (elegida === true || (elegida !== false && m.id === actual)) abiertas.add(m.id);
  }
  return abiertas;
}

export function plegarCamino(camino, materias, { t, tn, icono, numero, el, usuario, siguiente }) {
  const guardadas = leerAbiertas(usuario);
  const abiertas = abiertasAlEntrar(materias, siguiente, guardadas);
  const secciones = [...camino.querySelectorAll(':scope > .materia-bloque')];
  const plegables = [];
  secciones.forEach((seccion, n) => {
    const m = materias[n];
    if (!m) return;
    const banner = seccion.querySelector(':scope > .banner-materia');
    if (!banner) return;
    // Lo de la cabeza: avance, estado, video y punto débil (.materia-insignias deja lugar para otras insignias).
    const estado = m.estado === 'vacia' ? null : m.estado === 'aprobada' ? ['marca', t('camino.estado.aprobada')]
      : m.estado === 'bloqueada' ? ['candado', t('camino.estado.bloqueada')] : ['avion', t('camino.estado.abierta')];
    const insignias = el('div', { class: 'materia-insignias' },
      m.video ? el('span', { class: `materia-insignia ${m.video.visto ? 'hecho' : 'pendiente'}` }, icono('video', 'icono chico'), el('span', { texto: t(m.video.visto ? 'camino.video_visto' : 'camino.video_pendiente') })) : null,
      m.debil ? el('span', { class: 'materia-insignia debil' }, icono('atencion', 'icono chico'), el('span', { texto: t('camino.debil') })) : null);
    if (estado) {
      banner.querySelector('.banner-texto')?.append(el('div', { class: 'materia-estado' },
        el('span', { class: `materia-estado-chip estado-${m.estado}` }, icono(estado[0], 'icono chico'), el('span', { texto: estado[1] })),
        el('span', { class: 'materia-pct', texto: `${numero(m.pct ?? 0)} %` })),
      insignias.childNodes.length ? insignias : null);
    }
    if (!m.temas?.length) return; // «Pronto»: no hay nada que abrir.
    // El sendero (y lo de la materia) va dentro de un cuerpo que se pliega.
    const dentro = el('div', { class: 'materia-cuerpo-dentro' });
    if (m.estado === 'bloqueada') dentro.append(el('p', { class: 'materia-vista-previa con-icono' }, icono('candado', 'icono chico'), el('span', { texto: t('camino.vista_previa') })));
    for (const hijo of [...seccion.children]) if (hijo !== banner) dentro.append(hijo);
    const cuerpo = el('div', { class: 'materia-cuerpo', id: `camino-cuerpo-${m.id}` }, dentro);
    seccion.append(cuerpo);
    const boton = el('button', {
      type: 'button', class: 'materia-plegar', 'aria-controls': cuerpo.id, 'aria-labelledby': `materia-${m.id}`,
      'aria-describedby': `camino-cuenta-${m.id}`,
    }, el('span', { class: 'materia-plegar-flecha', 'aria-hidden': 'true' }, icono('flecha', 'icono')));
    // Lo que dice VoiceOver además del nombre: el estado, el avance y cuántos temas.
    banner.append(el('span', { class: 'solo-lectores', id: `camino-cuenta-${m.id}`, texto: `${estado ? `${estado[1]} · ` : ''}${numero(m.pct ?? 0)} % · ${tn('camino.n_temas', { n: m.temas.length })}` }));
    banner.classList.add('plegable');
    banner.append(boton);
    const item = { m, seccion, cuerpo, dentro, boton };
    plegables.push(item);
    poner(item, abiertas.has(m.id));
    boton.addEventListener('click', () => {
      camino.classList.add('camino-animado');
      const abrir = !item.abierta;
      poner(item, abrir);
      guardadas[m.id] = abrir;
      guardarAbiertas(usuario, guardadas);
      pintarTodas();
    });
  });
  if (!plegables.length) return camino;
  const todas = el('button', { type: 'button', class: 'camino-todas boton-texto con-icono' });
  const pintarTodas = () => {
    const todasAbiertas = plegables.every(x => x.abierta);
    todas.replaceChildren(icono(todasAbiertas ? 'cerrar' : 'tarjetas', 'icono chico'), el('span', { texto: t(todasAbiertas ? 'camino.cerrar_todas' : 'camino.ver_todas') }));
    todas.dataset.accion = todasAbiertas ? 'cerrar' : 'abrir';
  };
  todas.addEventListener('click', () => {
    camino.classList.add('camino-animado');
    const abrir = todas.dataset.accion === 'abrir';
    for (const x of plegables) { poner(x, abrir); guardadas[x.m.id] = abrir; }
    guardarAbiertas(usuario, guardadas);
    pintarTodas();
  });
  pintarTodas();
  camino.prepend(el('div', { class: 'camino-controles' }, todas));
  return camino;
}

function poner(item, abierta) {
  item.abierta = abierta;
  item.seccion.classList.toggle('abierta', abierta);
  item.seccion.classList.toggle('plegada', !abierta);
  item.boton.setAttribute('aria-expanded', String(abierta));
  // Lo plegado no se lee ni se alcanza con el tabulador.
  if (abierta) item.dentro.removeAttribute('inert'); else item.dentro.setAttribute('inert', '');
}
