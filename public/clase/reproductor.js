// Reproductor de clase: una lección es una serie de escenas que se ven como una película corta. Cada escena tiene
// su animación, su subtítulo y su texto de narración. Si hay audio (por ejemplo, grabado con ElevenLabs) se oye
// y marca el largo de la escena; si no, los subtítulos van por tiempo y se puede pedir la voz del navegador.
//
// API: montarReproductor(contenedor, leccion, opciones) → { reproducir(), pausar(), ir(i), siguiente(), anterior(),
//        velocidad(v), voz(b), get estado, destruir() }
//   leccion: { id?, titulo?, escenas: [{ id, subtitulo, texto_narracion, audio_url?, duracion_s?,
//              visual: { tipo: 'titulo'|'ala'|'motor'|'instrumentos'|'escenario'|'meteo', parametros } }] }
//   opciones: { inicio: {indice, tiempo}, onProgreso(p), onFin(p), autoAvance: true, voz: false, velocidad: 1,
//               visuales: {tipo: montar}, textos }
//   onProgreso recibe { leccionId, indice, escenaId, tiempo, porcentaje (0..100), completado }: se guarda y luego
//   se pasa como opciones.inicio para seguir donde quedó.
// Lógica pura (para las pruebas): Secuencia, estimarDuracion, dividirFrases, tiemposFrases, fraseEn, duracionEscena,
//   normalizarLeccion, VELOCIDADES, siguienteVelocidad.

import { el, svg, limitar, crearBucle, conTextos } from './comun.js';
import { VISUALES } from './visuales.js';

export const VELOCIDADES = [1, 1.25, 1.5];

export const TEXTOS_REPRODUCTOR = {
  etiqueta: 'Reproductor de la clase', reproducir: 'Reproducir', pausar: 'Pausar', anterior: 'Escena anterior',
  siguiente: 'Escena siguiente', velocidad: 'Velocidad', voz: 'Leer en voz alta', escena: 'Escena', de: 'de',
  probar: 'Probar tú', volver: 'Volver a la clase', fin: 'Fin de la clase', repetir: 'Ver otra vez',
  responde: 'Responde para seguir', sinVoz: 'Este navegador no tiene voz', irA: 'Ir a la escena',
};

export const siguienteVelocidad = v => VELOCIDADES[(VELOCIDADES.indexOf(v) + 1) % VELOCIDADES.length] ?? 1;

// ~150 palabras por minuto en español narrado, con un respiro al final; nunca menos de 5 s.
export function estimarDuracion(texto) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5, Math.round((palabras / 2.5 + 1.2) * 10) / 10);
}

export function dividirFrases(texto) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!limpio) return [];
  const partes = limpio.match(/[^.!?…]+(?:[.!?…]+["»”)]?|$)/g) || [limpio];
  return partes.map(p => p.trim()).filter(Boolean);
}

// Cuándo empieza y termina cada frase dentro de la escena, en proporción a su largo.
export function tiemposFrases(frases, duracion) {
  const pesos = frases.map(f => Math.max(8, f.length));
  const total = pesos.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return pesos.map(p => { const inicio = t; t += (p / total) * duracion; return { inicio, fin: t }; });
}

export function fraseEn(tiempos, t) {
  for (let i = 0; i < tiempos.length; i++) if (t < tiempos[i].fin) return i;
  return Math.max(0, tiempos.length - 1);
}

export function duracionEscena(escena, duracionAudio = null) {
  if (Number.isFinite(duracionAudio) && duracionAudio > 0) return duracionAudio;
  if (Number.isFinite(escena?.duracion_s) && escena.duracion_s > 0) return escena.duracion_s;
  return estimarDuracion(escena?.texto_narracion || escena?.subtitulo || '');
}

export function normalizarLeccion(leccion) {
  const escenas = Array.isArray(leccion?.escenas) ? leccion.escenas : [];
  if (!escenas.length) throw new Error('la lección no tiene escenas');
  return {
    ...leccion,
    escenas: escenas.map((e, i) => ({
      ...e,
      id: e.id || `escena-${i + 1}`,
      subtitulo: e.subtitulo || '',
      texto_narracion: e.texto_narracion || '',
      visual: e.visual && e.visual.tipo ? e.visual : { tipo: 'titulo', parametros: { titulo: e.subtitulo || '' } },
    })),
  };
}

// La secuencia de escenas, sin nada de pantalla: qué escena va, cuánto lleva, cuándo pasar a la siguiente.
export class Secuencia {
  constructor(leccion, { indice = 0, tiempo = 0, autoAvance = true } = {}) {
    this.leccion = normalizarLeccion(leccion);
    this.duraciones = this.leccion.escenas.map(e => duracionEscena(e));
    this.autoAvance = autoAvance;
    this.terminada = false;
    this.esperando = false; // una escena con decisión no avanza sola hasta que se responde
    this.respondidas = new Set();
    this.indice = limitar(Math.floor(Number(indice) || 0), 0, this.total - 1);
    this.tiempo = limitar(Number(tiempo) || 0, 0, Math.max(0, this.duracion - 0.5));
  }
  get total() { return this.leccion.escenas.length; }
  get escena() { return this.leccion.escenas[this.indice]; }
  get duracion() { return this.duraciones[this.indice]; }
  get duracionTotal() { return this.duraciones.reduce((a, b) => a + b, 0); }
  get pideRespuesta() { return this.escena.visual?.tipo === 'escenario' && !this.respondidas.has(this.indice); }
  fijarDuracion(i, segundos) {
    if (Number.isFinite(segundos) && segundos > 0 && i >= 0 && i < this.total) this.duraciones[i] = segundos;
  }
  ir(i) {
    const nuevo = limitar(Math.floor(i), 0, this.total - 1);
    const cambio = nuevo !== this.indice || this.terminada;
    this.indice = nuevo; this.tiempo = 0; this.terminada = false; this.esperando = false;
    return cambio;
  }
  siguiente() { return this.indice < this.total - 1 ? this.ir(this.indice + 1) : false; }
  anterior() {
    if (this.tiempo > 3 && !this.terminada) { this.tiempo = 0; return false; } // primero vuelve al inicio de la escena
    return this.ir(this.indice - 1);
  }
  responder() { this.respondidas.add(this.indice); this.esperando = false; }
  // Avanza el reloj (dt ya multiplicado por la velocidad). Devuelve 'escena' si cambió de escena, 'fin' al terminar.
  avanzar(dt) {
    if (this.terminada) return null;
    this.tiempo += Math.max(0, dt);
    if (this.tiempo < this.duracion) return null;
    this.tiempo = this.duracion;
    if (this.pideRespuesta) { this.esperando = true; return null; }
    if (this.indice < this.total - 1 && this.autoAvance) { this.ir(this.indice + 1); return 'escena'; }
    if (this.indice < this.total - 1) return null;
    this.terminada = true;
    return 'fin';
  }
  progreso() {
    const antes = this.duraciones.slice(0, this.indice).reduce((a, b) => a + b, 0);
    const total = this.duracionTotal || 1;
    return {
      leccionId: this.leccion.id ?? null, indice: this.indice, escenaId: this.escena.id,
      tiempo: Math.round(this.tiempo * 10) / 10,
      porcentaje: this.terminada ? 100 : Math.round(((antes + this.tiempo) / total) * 1000) / 10,
      completado: this.terminada,
    };
  }
}

// ---------- Pantalla ----------
const ICONOS = {
  reproducir: 'M8 5.5v13l11-6.5z',
  pausar: 'M7 5h4v14H7zM13 5h4v14h-4z',
  anterior: 'M6 6h2.5v12H6zM19 6v12l-9-6z',
  siguiente: 'M15.5 6H18v12h-2.5zM5 6v12l9-6z',
  voz: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12',
  repetir: 'M5 12a7 7 0 1 0 2.1-5M5 4v4h4',
};

function icono(padre, nombre) {
  const s = svg('svg', { viewBox: '0 0 24 24', class: 'clase-icono', 'aria-hidden': 'true', focusable: 'false' }, padre);
  svg('path', { d: ICONOS[nombre] }, s);
  return s;
}

function botonIcono(padre, nombre, etiqueta, alPulsar, clase = '') {
  const b = el('button', { type: 'button', class: `clase-rep-boton ${clase}`.trim(), 'aria-label': etiqueta, title: etiqueta }, padre);
  icono(b, nombre);
  b.addEventListener('click', alPulsar);
  return b;
}

function elegirVoz() {
  try {
    const voces = speechSynthesis.getVoices();
    return voces.find(v => /^es[-_](ES|MX|US|419|DO)/i.test(v.lang) && v.localService) || voces.find(v => /^es/i.test(v.lang)) || null;
  } catch { return null; }
}

export function montarReproductor(contenedor, leccion, opciones = {}) {
  const T = conTextos(TEXTOS_REPRODUCTOR, opciones.textos);
  const visuales = { ...VISUALES, ...(opciones.visuales || {}) };
  const seq = new Secuencia(leccion, { ...(opciones.inicio || {}), autoAvance: opciones.autoAvance !== false });
  const hayVoz = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function';
  let reproduciendo = false, velocidad = VELOCIDADES.includes(opciones.velocidad) ? opciones.velocidad : 1;
  let conVoz = Boolean(opciones.voz) && hayVoz;
  let visual = null, probando = false;
  let frases = [], tiempos = [], fraseActual = -1;
  let hablando = false, esperaVoz = 0;
  let audio = null, audioListo = false, audioFallo = false;

  const raiz = el('section', { class: 'clase-rep', 'aria-label': leccion.titulo ? `${T.etiqueta}: ${leccion.titulo}` : T.etiqueta, tabindex: -1 }, contenedor);
  const escenario = el('div', { class: 'clase-rep-escenario' }, raiz);
  const lugarVisual = el('div', { class: 'clase-rep-visual' }, escenario);
  const cabeza = el('div', { class: 'clase-rep-cabeza' }, escenario);
  const chipEscena = el('span', { class: 'clase-rep-chip' }, cabeza);
  const bProbar = el('button', { type: 'button', class: 'clase-rep-probar' }, cabeza, T.probar);
  const finTarjeta = el('div', { class: 'clase-rep-fin', hidden: true }, escenario);
  el('strong', {}, finTarjeta, T.fin);
  const bRepetir = el('button', { type: 'button', class: 'clase-boton clase-boton-principal' }, finTarjeta);
  icono(bRepetir, 'repetir');
  el('span', {}, bRepetir, T.repetir);

  const subtitulos = el('div', { class: 'clase-rep-subtitulos' }, raiz);
  const tituloEscena = el('p', { class: 'clase-rep-subtitulo' }, subtitulos);
  const textoEscena = el('p', { class: 'clase-rep-texto', 'aria-live': 'polite' }, subtitulos);
  const avisoRespuesta = el('p', { class: 'clase-rep-aviso', hidden: true }, subtitulos, T.responde);

  const barra = el('div', { class: 'clase-rep-barra', role: 'group', 'aria-label': `${T.escena}s` }, raiz);
  const segmentos = seq.leccion.escenas.map((e, i) => {
    const b = el('button', { type: 'button', class: 'clase-rep-segmento', 'aria-label': `${T.irA} ${i + 1}: ${e.subtitulo}`, title: e.subtitulo }, barra);
    const pista = el('span', { class: 'clase-rep-pista' }, b);
    const relleno = el('span', { class: 'clase-rep-relleno' }, pista);
    el('span', { class: 'clase-rep-punto' }, b);
    b.addEventListener('click', () => irA(i));
    return { b, relleno };
  });

  const controles = el('div', { class: 'clase-rep-controles' }, raiz);
  const bAnterior = botonIcono(controles, 'anterior', T.anterior, () => { const c = seq.anterior(); if (c) entrarEscena(); else reiniciarNarracion(); avisar(); });
  const bPlay = botonIcono(controles, 'reproducir', T.reproducir, () => (reproduciendo ? pausar() : reproducir()), 'clase-rep-play');
  const bSiguiente = botonIcono(controles, 'siguiente', T.siguiente, () => { if (seq.siguiente()) { entrarEscena(); avisar(); } });
  const tiempoTexto = el('span', { class: 'clase-rep-tiempo', 'aria-hidden': 'true' }, controles);
  const derecha = el('div', { class: 'clase-rep-derecha' }, controles);
  const bVelocidad = el('button', { type: 'button', class: 'clase-rep-velocidad', 'aria-label': T.velocidad }, derecha);
  bVelocidad.addEventListener('click', () => ponerVelocidad(siguienteVelocidad(velocidad)));
  const bVoz = el('button', { type: 'button', class: 'clase-rep-voz', 'aria-pressed': String(conVoz) }, derecha);
  icono(bVoz, 'voz');
  el('span', {}, bVoz, T.voz);
  if (!hayVoz) { bVoz.disabled = true; bVoz.title = T.sinVoz; }
  bVoz.addEventListener('click', () => ponerVoz(!conVoz));

  function avisar() { opciones.onProgreso?.(seq.progreso()); }

  // ---------- Escenas ----------
  function entrarEscena() {
    const e = seq.escena;
    visual?.destruir?.();
    visual = null;
    probando = false;
    while (lugarVisual.firstChild) lugarVisual.removeChild(lugarVisual.firstChild);
    const montar = visuales[e.visual.tipo];
    const marco = el('div', { class: 'clase-rep-marco' }, lugarVisual);
    if (montar) {
      try {
        visual = montar(marco, e.visual.parametros || {}, {
          modo: 'explicacion',
          alResolver: () => { seq.responder(); avisoRespuesta.hidden = true; if (seq.tiempo >= seq.duracion && reproduciendo) { if (seq.avanzar(0.001) === 'escena') entrarEscena(); avisar(); } },
        });
      } catch (error) {
        el('p', { class: 'clase-rep-sinvisual' }, marco, e.subtitulo);
        console.warn('No se pudo dibujar la escena', e.id, error);
      }
    } else {
      el('p', { class: 'clase-rep-sinvisual' }, marco, e.subtitulo);
    }
    visual?.pausar?.(!reproduciendo && e.visual.tipo !== 'escenario');
    bProbar.hidden = !visual?.modo || ['titulo', 'escenario'].includes(e.visual.tipo);
    bProbar.textContent = T.probar;
    chipEscena.textContent = `${T.escena} ${seq.indice + 1} ${T.de} ${seq.total}${e.subtitulo ? ` · ${e.subtitulo}` : ''}`;
    tituloEscena.textContent = e.subtitulo;
    frases = dividirFrases(e.texto_narracion);
    while (textoEscena.firstChild) textoEscena.removeChild(textoEscena.firstChild);
    frases.forEach(f => el('span', { class: 'clase-rep-frase' }, textoEscena, `${f} `));
    calcularTiempos();
    fraseActual = -1;
    finTarjeta.hidden = true;
    avisoRespuesta.hidden = true;
    prepararAudio(e);
    pintar();
    pintarBotones();
  }

  function calcularTiempos() { tiempos = tiemposFrases(frases, seq.duracion); }

  // ---------- Audio grabado ----------
  function prepararAudio(e) {
    detenerVoz();
    audioListo = false; audioFallo = false;
    if (!e.audio_url) { if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load?.(); } return; }
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) { seq.fijarDuracion(seq.indice, audio.duration); calcularTiempos(); }
        audioListo = true;
      });
      audio.addEventListener('error', () => { audioFallo = true; audioListo = false; });
    }
    audio.src = e.audio_url;
    audio.playbackRate = velocidad;
    if (seq.tiempo > 0) { try { audio.currentTime = seq.tiempo; } catch { /* aún no cargó */ } }
    if (reproduciendo) audio.play().catch(() => { audioFallo = true; });
  }
  const usaAudio = () => Boolean(seq.escena.audio_url) && !audioFallo;

  // ---------- Voz del navegador ----------
  function decir(texto) {
    if (!conVoz || !hayVoz || usaAudio() || !texto) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'es-ES';
      const voz = elegirVoz();
      if (voz) { u.voice = voz; u.lang = voz.lang; }
      u.rate = velocidad;
      u.onend = u.onerror = () => { hablando = false; };
      hablando = true; esperaVoz = 0;
      speechSynthesis.speak(u);
    } catch { hablando = false; }
  }
  function detenerVoz() { if (hayVoz) { try { speechSynthesis.cancel(); } catch { /* nada */ } } hablando = false; }
  function reiniciarNarracion() { fraseActual = -1; detenerVoz(); if (audio && usaAudio()) { try { audio.currentTime = 0; } catch { /* nada */ } } pintar(); }

  function ponerVoz(si) {
    conVoz = Boolean(si) && hayVoz;
    bVoz.setAttribute('aria-pressed', String(conVoz));
    if (!conVoz) detenerVoz();
    else if (reproduciendo) decir(frases[Math.max(0, fraseActual)]);
  }
  function ponerVelocidad(v) {
    velocidad = VELOCIDADES.includes(v) ? v : 1;
    bVelocidad.textContent = `${String(velocidad).replace('.', ',')}×`;
    bVelocidad.setAttribute('aria-label', `${T.velocidad}: ${String(velocidad).replace('.', ',')}×`);
    if (audio) audio.playbackRate = velocidad;
    if (hablando && reproduciendo) decir(frases[fraseActual]);
  }

  // ---------- Reproducir ----------
  function reproducir() {
    if (seq.terminada) { seq.ir(0); entrarEscena(); }
    reproduciendo = true;
    if (probando) salirDePrueba();
    visual?.pausar?.(false);
    if (usaAudio() && audio) audio.play().catch(() => { audioFallo = true; });
    else if (conVoz && fraseActual >= 0) decir(frases[fraseActual]);
    bucle.iniciar();
    pintarBotones();
  }
  function pausar() {
    reproduciendo = false;
    audio?.pause();
    detenerVoz();
    bucle.detener();
    if (seq.escena.visual.tipo !== 'escenario') visual?.pausar?.(true);
    pintarBotones();
    avisar();
  }
  function irA(i) { seq.ir(i); entrarEscena(); avisar(); }

  function salirDePrueba() {
    probando = false;
    visual?.modo?.('explicacion');
    bProbar.textContent = T.probar;
    raiz.classList.remove('clase-rep-probando');
  }
  bProbar.addEventListener('click', () => {
    if (probando) { salirDePrueba(); reproducir(); return; }
    pausar();
    probando = true;
    visual?.pausar?.(false);
    visual?.modo?.('interactivo');
    bProbar.textContent = T.volver;
    raiz.classList.add('clase-rep-probando');
  });
  bRepetir.addEventListener('click', () => { seq.ir(0); entrarEscena(); reproducir(); avisar(); });

  // ---------- Cada cuadro ----------
  const bucle = crearBucle(raiz, dt => {
    if (!reproduciendo) return;
    let evento;
    if (usaAudio() && audio && audioListo && !audio.paused) {
      seq.tiempo = Math.min(audio.currentTime, seq.duracion);
      evento = audio.ended ? seq.avanzar(seq.duracion) : seq.avanzar(0);
    } else if (usaAudio() && !audioListo) {
      evento = null; // esperando que cargue el audio
    } else {
      let paso = dt * velocidad;
      // Con la voz del navegador, el subtítulo espera a que termine de leer la frase (hasta 6 s de más).
      const actual = tiempos[fraseActual];
      if (conVoz && hablando && actual && seq.tiempo + paso >= actual.fin - 0.05 && esperaVoz < 6) { esperaVoz += dt; paso = 0; }
      evento = seq.avanzar(paso);
    }
    if (evento === 'escena') { entrarEscena(); if (usaAudio()) audio.play().catch(() => { audioFallo = true; }); avisar(); }
    else if (evento === 'fin') { reproduciendo = false; bucle.detener(); detenerVoz(); finTarjeta.hidden = false; pintarBotones(); const p = seq.progreso(); opciones.onProgreso?.(p); opciones.onFin?.(p); }
    pintar();
  });

  function pintar() {
    const t = seq.tiempo, d = seq.duracion;
    if (!probando) visual?.tiempo?.(limitar(t / d, 0, 1));
    const i = frases.length ? fraseEn(tiempos, t) : -1;
    if (i !== fraseActual) {
      fraseActual = i;
      [...textoEscena.children].forEach((s, k) => { s.classList.toggle('clase-rep-frase-actual', k === i); s.classList.toggle('clase-rep-frase-dicha', k < i); });
      if (reproduciendo && i >= 0) decir(frases[i]);
    }
    avisoRespuesta.hidden = !(seq.esperando && seq.pideRespuesta);
    segmentos.forEach((s, k) => {
      const lleno = k < seq.indice || seq.terminada ? 1 : k > seq.indice ? 0 : t / d;
      s.relleno.style.transform = `scaleX(${limitar(lleno, 0, 1).toFixed(4)})`;
      s.b.classList.toggle('clase-rep-segmento-actual', k === seq.indice);
      if (k === seq.indice) s.b.setAttribute('aria-current', 'step'); else s.b.removeAttribute('aria-current');
    });
    const p = seq.progreso();
    tiempoTexto.textContent = `${seq.indice + 1}/${seq.total} · ${Math.round(p.porcentaje)} %`;
  }

  function pintarBotones() {
    const svgPlay = bPlay.querySelector('path');
    svgPlay.setAttribute('d', reproduciendo ? ICONOS.pausar : ICONOS.reproducir);
    bPlay.setAttribute('aria-label', reproduciendo ? T.pausar : T.reproducir);
    bPlay.title = bPlay.getAttribute('aria-label');
    bAnterior.disabled = seq.indice === 0 && seq.tiempo < 0.5;
    bSiguiente.disabled = seq.indice >= seq.total - 1;
    raiz.classList.toggle('clase-rep-en-pausa', !reproduciendo);
  }

  raiz.addEventListener('keydown', e => {
    const etiqueta = e.target?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(etiqueta)) return;
    if (e.key === ' ' && etiqueta !== 'BUTTON') { e.preventDefault(); reproduciendo ? pausar() : reproducir(); }
    else if (e.key === 'ArrowRight' && etiqueta !== 'BUTTON') { if (seq.siguiente()) { entrarEscena(); avisar(); } }
    else if (e.key === 'ArrowLeft' && etiqueta !== 'BUTTON') { if (seq.anterior()) entrarEscena(); avisar(); }
  });

  ponerVelocidad(velocidad);
  entrarEscena();
  pintarBotones();

  return {
    raiz,
    reproducir, pausar,
    ir: irA,
    siguiente() { if (seq.siguiente()) { entrarEscena(); avisar(); pintarBotones(); } },
    anterior() { if (seq.anterior()) entrarEscena(); avisar(); pintarBotones(); },
    velocidad: ponerVelocidad,
    voz: ponerVoz,
    // Para pruebas y capturas: poner el reloj en un punto exacto de la escena actual.
    buscar(segundos) { seq.tiempo = limitar(segundos, 0, seq.duracion); fraseActual = -1; pintar(); },
    get estado() { return { ...seq.progreso(), reproduciendo, velocidad, voz: conVoz }; },
    destruir() { pausar(); bucle.destruir(); visual?.destruir?.(); audio?.pause(); raiz.remove(); },
  };
}
