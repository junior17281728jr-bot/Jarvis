// Academia 0.14.34: «Tu instructor» (#instructor; se carga solo al abrirlo, desde public/app.js). UN solo instructor para
// TODO: el Test Guide (Camino), el oral (con la práctica en vivo) y el repaso.
// 0.14.39 (pedido del dueño): es un CHAT con tu instructor, estilo mensajería: arriba su avatar y «Tu instructor»; el
// PRIMER mensaje es su revisión de tu estudio, corta y humana («Revisé tu estudio de ayer y hoy. 👍 Vas bien en…
// Donde te veo con dudas: … ¿Empezamos por …? Te tomo 3 preguntas rápidas.»), armada por el código con lo mismo de
// siempre (lo que cambió y lo flojo; frases variadas, nunca una lista de «Sigues flojo en …»), con hasta 3 pastillas
// («Repasar ahora», «Ver la clase», «Practicar oral») y «Más opciones». Abajo, las sugerencias rápidas y la caja para
// escribir (fija). La revisión se vuelve a pedir al volver a la pantalla y cada ~30 s (solo cambia si cambió algo).
//  - Sin el instructor con IA (o sin su permiso): el mismo chat con su revisión y sus pastillas, sin caja para escribir.
//    «Repasar ahora» usa las tarjetas «Otra vez, más fácil» del tema y preguntas rápidas.
//  - Las preguntas rápidas (de «Repasar ahora» y del repaso) son una práctica de verdad (POST /api/academia/intentos con
//    «cuantas»): quedan guardadas como práctica y el repaso queda al día con su lógica de siempre.
//  - El administrador ve, solo para leer, lo que el instructor le diría a un alumno (con el detalle plegado).
// Todo con h.el y textContent (nunca HTML, nunca estilos sueltos). Lo que llega del servidor no trae ids ni nombres.

import { tituloSinIngles } from './tarjetas.js';

export const REFRESCO_MS = 30_000;
export const PREGUNTAS_GUIA = 3;
export const PREGUNTAS_REPASO = 5;
export const MAX_PASTILLAS = 3;
export const MAX_PALABRAS = 60;

// El texto de un cambio (el detalle del administrador): «Hipoxia: 2/6 → 5/6 ✅ mejoraste». Puro (se prueba sin navegador).
export function textoCambio(c, t) {
  if (c.tipo === 'sigue_flojo') return t('tuinstr.cambio.sigue_flojo', { tema: c.titulo });
  if (c.origen === 'vivo') return t(`tuinstr.cambio.${c.tipo}.vivo`, { tema: c.titulo, a: c.antes?.pct ?? 0, c: c.ahora?.pct ?? 0 });
  return t(`tuinstr.cambio.${c.tipo}.tg`, { tema: c.titulo, a: c.antes?.bien ?? 0, b: c.antes?.de ?? 0, c: c.ahora?.bien ?? 0, d: c.ahora?.de ?? 0 });
}
export function textoDebil(x, t) {
  if (x.origen === 'tg') return t('tuinstr.debil.tg', { tema: x.titulo, pct: x.pct });
  if (x.origen === 'vivo') return t('tuinstr.debil.vivo', { tema: x.titulo, pct: x.pct });
  return t('tuinstr.debil.oral', { tema: x.titulo });
}
const cuantasRepaso = n => Math.max(2, Math.min(PREGUNTAS_REPASO, Number(n) || 0));

// ---------- La revisión (el primer mensaje del chat). Pura. ----------
// Cuántas frases distintas hay de cada parte (tuinstr.rev.<parte>.<1..n> en public/i18n).
export const VARIANTES = Object.freeze({ abre: 3, abre_dias: 2, abre_sin: 3, bien: 3, bien_falta: 2, dudas: 3, propone: 3, propone_otra: 2, repaso: 2, siguiente: 2, nada: 2 });
// El día (hora de Santo Domingo): la misma frase todo el día (la revisión se vuelve a pedir cada ~30 s y no debe
// cambiarle las palabras al alumno mientras la lee); otro día, otras palabras.
export const semillaDe = ms => Math.floor((Number(ms) - 4 * 3600 * 1000) / 86_400_000);
// d: lo de GET /api/academia/instructor/resumen. → { partes: [{ clave, vars }], acciones: { primarias, mas } }.
// Los hechos los decide el código (lo que mejoró, lo flojo, el tema para empezar); las frases solo varían en forma.
export function revision(d, { semilla = 0 } = {}) {
  const variante = parte => `tuinstr.rev.${parte}.${Math.abs(Number(semilla) || 0) % VARIANTES[parte] + 1}`;
  // Los títulos, sin el inglés entre paréntesis (como en las pastillas).
  const limpio = x => tituloSinIngles(x ?? '');
  const cambios = d?.cambios ?? [];
  const debiles = d?.debiles ?? [];
  const foco = d?.foco ?? null;
  const repasoN = Number(d?.repaso?.n) || 0;
  const partes = [];
  // Lo que mejoró (el primero) y lo que le cuesta (hasta 2, sin repetir; el tema para empezar va primero).
  const bien = cambios.find(c => c.tipo === 'mejoro') ?? null;
  const dudas = [];
  const agregar = (titulo, origen, bienN, de) => {
    if (!titulo || dudas.some(x => x.titulo === titulo) || titulo === bien?.titulo || dudas.length >= 2) return;
    dudas.push({ titulo: limpio(titulo), origen, bien: bienN, de });
  };
  const debilDe = titulo => debiles.find(x => x.titulo === titulo && x.origen === 'tg');
  if (foco) { const x = debilDe(foco.titulo); agregar(foco.titulo, 'tg', x?.bien, x?.de); }
  for (const c of cambios.filter(c => c.tipo !== 'mejoro')) agregar(c.titulo, c.origen, c.ahora?.bien, c.ahora?.de);
  for (const x of debiles) agregar(x.titulo, x.origen, x.bien, x.de);
  const hayAlgo = Boolean(cambios.length || debiles.length || foco || repasoN > 0 || d?.vivo || (d?.botones ?? []).length);
  if (!hayAlgo) partes.push({ clave: 'tuinstr.rev.vacio', vars: {} });
  else if (cambios.length) partes.push(d?.desdeDias > 1 ? { clave: variante('abre_dias'), vars: { n: d.desdeDias } } : { clave: variante('abre'), vars: {} });
  else partes.push({ clave: variante('abre_sin'), vars: {} });
  // Mejoró, pero todavía no está firme (sigue entre lo flojo o es el tema para empezar): se dice tal cual.
  const pctBien = bien?.ahora?.de ? (bien.ahora.bien * 100) / bien.ahora.de : Number.isFinite(bien?.ahora?.pct) ? bien.ahora.pct : null;
  const bienFlojo = Boolean(bien && ((pctBien != null && pctBien < 70) || foco?.titulo === bien.titulo || debiles.some(x => x.titulo === bien.titulo)));
  if (bien) partes.push({ clave: variante(bienFlojo ? 'bien_falta' : 'bien'), vars: { tema: limpio(bien.titulo), ...(bien.origen === 'vivo' ? { oral: true } : {}) } });
  if (dudas.length) partes.push({ clave: variante('dudas'), vars: { temas: dudas } });
  else if (hayAlgo && !bien) partes.push({ clave: variante('nada'), vars: {} });
  if (foco) partes.push({ clave: variante(foco.titulo === bien?.titulo ? 'propone_otra' : 'propone'), vars: { tema: limpio(foco.titulo), n: PREGUNTAS_GUIA } });
  else if (repasoN > 0) partes.push({ clave: variante('repaso'), vars: { n: repasoN } });
  else if (hayAlgo && !dudas.length) partes.push({ clave: variante('siguiente'), vars: {} });
  // Las acciones: hasta 3 a la vista; el resto en «Más opciones».
  const botones = d?.botones ?? [];
  const oral = botones.find(b => b.tipo === 'oral') ?? null;
  const primarias = [];
  const mas = [];
  if (foco) {
    primarias.push({ tipo: 'guiar', etiqueta: 'tuinstr.accion.repasar', principal: true });
    primarias.push({ tipo: 'clase', materia: foco.materia, tema: foco.tema, titulo: foco.titulo, etiqueta: 'tuinstr.accion.clase' });
  } else if (repasoN > 0) primarias.push({ tipo: 'repaso_guiado', n: repasoN, etiqueta: 'tuinstr.accion.repasar', principal: true });
  if (oral) primarias.push({ ...oral, etiqueta: 'tuinstr.accion.oral' });
  if (foco && repasoN > 0) (primarias.length < MAX_PASTILLAS ? primarias : mas).push({ tipo: 'repaso_guiado', n: repasoN, etiqueta: 'tuinstr.accion.repaso_hoy' });
  const siguiente = !foco ? botones.find(b => b.tipo === 'clase') : null;
  if (siguiente && primarias.length < MAX_PASTILLAS) primarias.push({ ...siguiente, etiqueta: 'tuinstr.accion.siguiente', principal: !primarias.length });
  if (foco) mas.push({ tipo: 'practicar', materia: foco.materia, tema: foco.tema, titulo: foco.titulo, etiqueta: 'tuinstr.solo' });
  const usados = new Set([...primarias, ...mas].map(b => [b.tipo, b.materia, b.tema, b.errores].join('|')));
  for (const b of botones) {
    const k = [b.tipo, b.materia, b.tema, b.errores].join('|');
    if (b.tipo === 'repaso' || usados.has(k) || b === siguiente || b === oral) continue;
    if (foco && b.materia === foco.materia && b.tema === foco.tema && ['clase', 'practicar'].includes(b.tipo)) continue;
    usados.add(k);
    mas.push(b);
  }
  return { partes, acciones: { primarias: primarias.slice(0, MAX_PASTILLAS), mas: [...primarias.slice(MAX_PASTILLAS), ...mas] } };
}
// Las partes, en una sola frase para leer (t, tn: las de la app). Los temas: «A y B»; el primero con «1 de 4» si es claro.
// Nunca más de MAX_PALABRAS: si se pasa (títulos largos), primero sin el «1 de 4», después con una sola duda, sin las
// dudas (el tema para empezar ya va en la propuesta) y, por último, sin lo que mejoró.
export function textoRevision(rev, t, tn = t) {
  const armar = ({ fraccion = true, dudas = 2, sin = [] } = {}) => {
    const tema = (x, i) => {
      const nombre = x.origen === 'tg' || !x.origen ? x.titulo : t('tuinstr.rev.en_oral', { tema: x.titulo });
      return fraccion && i === 0 && x.origen === 'tg' && Number.isFinite(x.bien) && x.de >= 2 && x.de <= 12 ? t('tuinstr.rev.fraccion', { tema: nombre, bien: x.bien, de: x.de }) : nombre;
    };
    return rev.partes.filter(p => !sin.some(x => p.clave.startsWith(`tuinstr.rev.${x}.`))).map(p => {
      let vars = Array.isArray(p.vars.temas) ? { ...p.vars, temas: p.vars.temas.slice(0, dudas).map(tema).join(t('tuinstr.rev.y')) } : p.vars;
      if (vars.oral) vars = { ...vars, tema: t('tuinstr.rev.en_oral', { tema: vars.tema }) };
      return Number(vars.n) === 1 ? tn(p.clave, vars) : t(p.clave, vars);
    }).join(' ');
  };
  const pasos = [{}, { fraccion: false }, { fraccion: false, dudas: 1 }, { fraccion: false, sin: ['dudas'] }, { fraccion: false, sin: ['dudas', 'bien', 'bien_falta'] }];
  for (const o of pasos) {
    const x = armar(o);
    if (contarPalabras(x) <= MAX_PALABRAS) return x;
  }
  return armar(pasos.at(-1));
}
export const contarPalabras = s => String(s ?? '').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;

export function crearVistaInstructor(h) {
  const { el, t, tn, icono, api, talCual, numero, avisar, textoError } = h;
  const ui = () => h.instructorUi();
  const reloj = h.ahora ?? Date.now;

  // ---- Las preguntas rápidas en la conversación ----
  // zona: la lista del chat. pedido: { tipo: 'instructor', materia, tema } o { tipo: 'repaso' }.
  async function preguntasRapidas(zona, pedido) {
    const r = await api('POST', '/api/academia/intentos', pedido);
    if (!r.ok) {
      zona.append(burbuja(el('p', { texto: ['sin_preguntas', 'repaso_vacio', 'sin_errores'].includes(r.datos?.error) ? t('tuinstr.quiz.no') : textoError(r.datos?.error) })));
      return null;
    }
    const intento = r.datos;
    const preguntas = (intento.preguntas ?? []).filter(q => !q.falta && !q.respuesta);
    zona.append(burbuja(el('p', { texto: tn('tuinstr.quiz.intro', { n: preguntas.length }) })));
    let aciertos = 0;
    for (const [i, q] of preguntas.entries()) {
      // Una a la vez: la siguiente sale al tocar «Siguiente» (o sola, si acertó).
      const r2 = await unaPregunta(zona, intento.id, q, i + 1, preguntas.length);
      if (r2 == null) return null;
      if (r2) aciertos += 1;
    }
    const fin = await api('POST', `/api/academia/intentos/${encodeURIComponent(intento.id)}/terminar`, {});
    const total = fin.ok ? fin.datos.total : preguntas.length;
    const bien = fin.ok ? fin.datos.aciertos : aciertos;
    zona.append(burbuja(el('p', { class: 'fuerte', texto: t(pedido.tipo === 'repaso' ? 'tuinstr.quiz.fin_repaso' : 'tuinstr.quiz.fin', { n: numero(bien), total: numero(total) }) })));
    h.alTerminar?.();
    return { bien, total };
  }
  function unaPregunta(zona, intentoId, q, n, total) {
    return new Promise(resolver => {
      const salida = el('div', { class: 'tuinstr-salida', 'aria-live': 'polite' });
      const botones = (q.opciones ?? []).map(o => el('button', { type: 'button', class: 'tuinstr-opcion', onclick: () => elegir(o.letra) },
        el('strong', { class: 'tuinstr-letra', texto: o.letra }), el('span', { texto: o.texto })));
      const nodo = el('div', { class: 'burbuja profesor burbuja-quiz tuinstr-burbuja' },
        el('p', { class: 'quiz-etiqueta', texto: t('tuinstr.quiz.n', { n: numero(n), total: numero(total) }) }),
        talCual('p', q.enunciado, 'fuerte'),
        el('div', { class: 'tuinstr-opciones' }, botones),
        salida);
      zona.append(nodo);
      nodo.scrollIntoView?.({ block: 'nearest' });
      async function elegir(letra) {
        for (const b of botones) b.disabled = true;
        const r = await api('POST', `/api/academia/intentos/${encodeURIComponent(intentoId)}/responder`, { pregunta: q.id, elegida: letra });
        if (!r.ok) { for (const b of botones) b.disabled = false; return avisar(textoError(r.datos?.error), 'mal'); }
        const x = r.datos.respuesta;
        const correcta = (q.opciones ?? []).find(o => o.letra === x.correcta);
        h.sonar?.(x.acierto ? 'bien' : 'mal');
        for (const b of botones) b.classList?.add('cerrada');
        if (x.acierto) {
          salida.append(el('p', { class: 'tono-bien con-icono' }, icono('bien', 'icono chico'), el('span', { texto: t('tuinstr.quiz.bien') })));
          return resolver(true);
        }
        salida.append(el('p', { class: 'tono-mal con-icono' }, icono('mal', 'icono chico'), el('span', { texto: t('tuinstr.quiz.mal', { letra: x.correcta, texto: correcta?.texto ?? '' }) })),
          el('div', { class: 'pastillas' },
            // «Explícamelo con otras palabras»: la explicación del instructor (con IA, dicha de otra forma; sin IA, la del Test Guide).
            ui().explicar(intentoId, q, { etiqueta: t('tuinstr.quiz.explicar') }),
            el('button', { type: 'button', class: 'pastilla principal', onclick: e => { e.currentTarget.disabled = true; resolver(false); } }, el('span', { texto: t('tuinstr.quiz.siguiente') }))));
      }
    });
  }
  const burbuja = (...partes) => el('div', { class: 'burbuja profesor tuinstr-burbuja' }, ...partes);
  const burbujaAlumno = texto => el('div', { class: 'burbuja alumno' }, talCual('p', texto));

  // ---- «Repasar ahora» (guiado) ----
  // chat: { mandar, lista } cuando hay chat con IA; si no, zona (la lista del chat sin caja para escribir).
  async function guiar(foco, { chat = null, zona, ia = false }) {
    const pedido = t('tuinstr.guia.pedido', { tema: tituloSinIngles(foco.titulo) });
    const lugar = chat?.lista ?? zona;
    if (chat && ia) {
      // La IA lo explica con OTRAS palabras que la clase (guia: true); después, las preguntas rápidas.
      await chat.mandar(pedido, { materia: foco.materia, tema: foco.tema, guia: true });
    } else {
      lugar.append(burbujaAlumno(pedido));
      const g = await api('GET', `/api/academia/instructor/guia/${encodeURIComponent(foco.materia)}/${encodeURIComponent(foco.tema)}`);
      if (!g.ok) { lugar.append(burbuja(el('p', { texto: textoError(g.datos?.error) }))); return; }
      lugar.append(burbuja(el('p', { class: 'fuerte', texto: t('tuinstr.guia.facil') }),
        (g.datos.facil ?? []).map(x => el('div', { class: 'tuinstr-facil' }, x.titulo ? el('h3', { texto: x.titulo }) : null, talCual('p', x.texto ?? '')))));
    }
    await preguntasRapidas(lugar, { tipo: 'instructor', materia: foco.materia, tema: foco.tema, cuantas: PREGUNTAS_GUIA });
  }
  async function repasoGuiado({ chat = null, zona, n }) {
    const lugar = chat?.lista ?? zona;
    lugar.append(burbujaAlumno(t('tuinstr.repaso.pedido')));
    await preguntasRapidas(lugar, { tipo: 'repaso', cuantas: cuantasRepaso(n) });
  }

  // ---- El primer mensaje: su revisión, con sus pastillas ----
  // acciones: { guiar(foco), repaso(n) } (null: solo leer, sin botones).
  function pastilla(a, d, acciones, enMas = false) {
    const etiqueta = a.etiqueta ? (a.tipo === 'repaso_guiado' ? tn(a.etiqueta, { n: numero(a.n) }) : t(a.etiqueta)) : null;
    const principal = Boolean(a.principal) && !enMas;
    const ocupado = fn => async e => { const b = e.currentTarget; b.disabled = true; try { await fn(); } finally { b.disabled = false; } };
    if (a.tipo === 'guiar') return el('button', { type: 'button', class: `pastilla con-icono${principal ? ' principal' : ''}`, onclick: ocupado(() => acciones.guiar(d.foco)) }, icono('cerebro', 'icono chico'), el('span', { texto: etiqueta }));
    if (a.tipo === 'repaso_guiado') return el('button', { type: 'button', class: `pastilla con-icono${principal ? ' principal' : ''}`, onclick: ocupado(() => acciones.repaso(a.n)) }, icono('calendario', 'icono chico'), el('span', { texto: etiqueta }));
    return ui().botonProfe(a, { pastilla: true, principal, etiqueta });
  }
  function mensajeInicial(d, acciones, { rev = null } = {}) {
    const r = rev ?? revision(d, { semilla: semillaDe(reloj()) });
    return el('div', { class: 'burbuja profesor tuinstr-primero' },
      talCual('p', textoRevision(r, t, tn), 'tuinstr-revision'),
      acciones ? ui().pastillas([...r.acciones.primarias.map(a => pastilla(a, d, acciones)), ...r.acciones.mas.map(a => pastilla(a, d, acciones, true))], { max: r.acciones.primarias.length || MAX_PASTILLAS }) : null);
  }
  // La cabeza del chat: avatar, «Tu instructor» y de qué se ocupa.
  function cabezaChat({ conIa = false } = {}) {
    return el('header', { class: 'chat-cabeza mensajero-cabeza' },
      el('a', { class: 'chat-volver', href: '#inicio', 'aria-label': t('acad.volver'), title: t('acad.volver') }, icono('flecha', 'icono chico volver-icono')),
      el('span', { class: 'instructor-avatar', 'aria-hidden': 'true' }, icono('cerebro'), el('span', { class: 'avatar-punto' })),
      el('div', { class: 'chat-quien' },
        el('h1', { texto: t('tuinstr.titulo') }),
        el('p', { class: 'suave chica', texto: t(conIa ? 'tuinstr.chat.estado' : 'tuinstr.chat.estado_sin') })));
  }

  // ---- La vista del administrador: lo que le diría a un alumno (solo leer; el detalle, plegado) ----
  function tarjeta(d) {
    const cambios = d.cambios ?? [];
    const debiles = d.debiles ?? [];
    return el('section', { class: 'panel tuinstr-tarjeta', 'aria-labelledby': 'tuinstr-tarjeta-titulo' },
      el('div', { class: 'tuinstr-cabeza' },
        el('span', { class: 'instructor-avatar', 'aria-hidden': 'true' }, icono('cerebro')),
        el('div', {}, el('h2', { id: 'tuinstr-tarjeta-titulo', texto: t('tuinstr.admin.titulo') }), el('p', { class: 'suave chica', texto: t('tuinstr.admin.nota') }))),
      mensajeInicial(d, null),
      el('details', { class: 'tuinstr-detalle' },
        el('summary', { texto: t('tuinstr.admin.detalle') }),
        cambios.length ? el('div', { class: 'tuinstr-cambios' },
          el('p', { class: 'fuerte chica', texto: d.desdeDias > 1 ? t('tuinstr.desde_dias', { n: numero(d.desdeDias) }) : t('tuinstr.desde') }),
          el('ul', { class: 'lista-simple' }, cambios.map(c => el('li', { class: `tuinstr-cambio cambio-${c.tipo}`, texto: textoCambio(c, t) })))) : null,
        el('div', { class: 'tuinstr-debiles' },
          el('p', { class: 'fuerte chica', texto: t('tuinstr.debiles') }),
          debiles.length ? el('ul', { class: 'lista-simple' }, debiles.map(x => el('li', { texto: textoDebil(x, t) }))) : el('p', { class: 'suave', texto: t('tuinstr.nada') })),
        d.vivo ? el('p', { class: 'chica con-icono' }, icono('microfono', 'icono chico'), el('span', { texto: `${t('tuinstr.vivo', { u: numero(d.vivo.ultima ?? 0), m: numero(d.vivo.mejor ?? 0) })}${d.vivo.listo ? ` · ${t('tuinstr.listo_real')}` : ''}` })) : null,
        d.repasoFinal?.tg?.total ? el('p', { class: 'chica con-icono' }, icono('trofeo', 'icono chico'), el('span', { texto: t('tuinstr.rf', { f: numero(d.repasoFinal.tg.falladas), total: numero(d.repasoFinal.tg.total) }) })) : null));
  }

  // ---- La pantalla ----
  // r: GET /api/academia/instructor/resumen; prof: GET /api/academia/profesor (los pide public/app.js).
  function pantalla(r, prof) {
    if (!r.ok) return h.mostrar(h.marco('instructor', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos?.error) }))));
    h.anotarAlgo?.(r.datos.algo === true);
    const primero = el('div', { class: 'tuinstr-lugar' });
    const lista = el('div', { class: 'chat-lista', 'aria-live': 'polite' }, primero);
    let chat = null;
    let datos = r.datos;
    const conChat = Boolean(datos.chat && prof?.ok && prof.datos.permiso?.permitido);
    const acciones = {
      guiar: foco => guiar(foco, { chat, zona: lista, ia: datos.chat && datos.ia }),
      repaso: n => repasoGuiado({ chat, zona: lista, n }),
    };
    // Solo se vuelve a pintar si cambió lo que dice (o sus botones): nunca le cambia las palabras mientras lee.
    let firma = null;
    const pintar = () => {
      const rev = datos.hay ? revision(datos, { semilla: semillaDe(reloj()) }) : null;
      const nueva = JSON.stringify(rev);
      if (nueva === firma) return;
      firma = nueva;
      primero.replaceChildren(rev ? mensajeInicial(datos, acciones, { rev }) : burbuja(el('p', { texto: t('profe.sin_datos') })));
    };
    pintar();
    // Al día: al volver a la pantalla, cada ~30 s mientras se ve y después de las preguntas rápidas.
    const refrescar = async () => {
      if (!primero.isConnected || globalThis.document?.visibilityState === 'hidden') return;
      const x = await api('GET', '/api/academia/instructor/resumen', undefined, { fresco: true });
      if (!x.ok || !primero.isConnected) return;
      datos = x.datos;
      h.anotarAlgo?.(datos.algo === true);
      pintar();
    };
    h.alTerminar = () => { setTimeout(refrescar, 300); };
    const programar = h.programar ?? setInterval;
    const parar = h.parar ?? clearInterval;
    const alVolver = () => { if (globalThis.document?.visibilityState === 'visible') refrescar(); };
    const reloj30 = programar(() => { if (!primero.isConnected) { parar(reloj30); globalThis.document?.removeEventListener('visibilitychange', alVolver); return; } refrescar(); }, REFRESCO_MS);
    globalThis.document?.addEventListener('visibilitychange', alVolver);
    // Con chat (IA y su permiso; el administrador siempre tiene permiso): el chat del Profesor, estilo mensajería.
    if (conChat) {
      prof.datos.historial = ui().historialParaChat(prof.datos.historial);
      const chips = [datos.foco ? t('tuinstr.chip.explica', { tema: tituloSinIngles(datos.foco.titulo) }) : t('profesor.chip.2'), t('profesor.chip.1'), t('profesor.chip.3')];
      return h.pagosUi().pantallaProfesor(prof, { seccion: 'instructor', mensajero: { cabeza: cabezaChat({ conIa: true }), primero, chips }, alListo: c => { chat = c; } });
    }
    // Sin chat: el mismo chat con su revisión y sus pastillas (sin caja para escribir).
    return h.mostrar(h.marco('instructor',
      el('section', { class: 'panel chat mensajero sin-chat', 'aria-label': t('tuinstr.titulo') },
        cabezaChat(),
        lista,
        el('div', { class: 'chat-abajo' },
          el('p', { class: 'chat-nota con-icono tuinstr-sin-chat' }, icono('info', 'icono chico'), el('span', { texto: t('tuinstr.sin_chat') }))))));
  }

  // ---- El administrador: lo que le recomienda a un alumno (solo leer) ----
  function resumenAdmin(id) {
    const lugar = el('div', { class: 'tuinstr-admin' });
    api('GET', `/api/admin/academia/alumnos/${encodeURIComponent(id)}/instructor`).then(r => {
      lugar.replaceChildren(r.ok ? tarjeta(r.datos) : el('p', { class: 'mensaje error', texto: textoError(r.datos?.error) }));
    }).catch(() => {});
    return lugar;
  }

  // ---- «Recomendación de tu instructor» (arriba de Repaso) ----
  function recomendacionRepaso() {
    const lugar = el('div', { class: 'tuinstr-reco-lugar' });
    api('GET', '/api/academia/instructor/recomendacion').then(r => {
      if (!r.ok || !(r.datos.lineas ?? []).length) return;
      const lineas = (r.datos.lineas ?? []).map(l => (Number(l.vars?.n) === 1 ? tn(l.clave, l.vars) : t(l.clave, l.vars ?? {})));
      lugar.replaceChildren(el('section', { class: 'panel tuinstr-reco', 'aria-label': t('tuinstr.reco.titulo') },
        el('p', { class: 'fuerte chica con-icono' }, icono('cerebro', 'icono chico'), el('span', { texto: t('tuinstr.reco.titulo') })),
        lineas.map(x => talCual('p', x)),
        (r.datos.botones ?? []).length ? ui().pintarProfe({ botones: r.datos.botones }) : null,
        el('a', { class: 'enlace-fuerte chica', href: '#instructor', texto: t('tuinstr.reco.hablar') })));
    }).catch(() => {});
    return lugar;
  }

  return Object.freeze({ pantalla, tarjeta, mensajeInicial, resumenAdmin, recomendacionRepaso, preguntasRapidas, guiar });
}
