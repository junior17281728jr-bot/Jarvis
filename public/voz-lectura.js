// 0.14.70: leer en voz alta el camino de estudio (las tarjetas de las clases, las preguntas de práctica y sus
// explicaciones). El orden es el mismo en toda la app: un audio ya guardado (de ElevenLabs o de ChatGPT) → uno nuevo
// (ElevenLabs o ChatGPT, si el servidor puede) → la voz del teléfono, que siempre funciona. Solo el servidor decide qué
// se puede grabar: lo compartido del contenido. Lo que no es del contenido (algo suyo) siempre va con la voz del teléfono.
// Sin librerías, sin tocar el DOM (solo un <audio> en memoria).
// Uso: const lector = crearLector(api); lector.leer([{ texto, lang: 'es' | 'en' }]); lector.callar();

export const puedeHablar = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
const esperar = ms => new Promise(listo => setTimeout(listo, ms));
const LOTE = 12;

export function crearLector(api, { alHablar = null } = {}) {
  let turno = 0;
  let audio = null;
  const hablar = si => { try { alHablar?.(si); } catch { /* nada */ } };
  function callar() {
    turno += 1;
    try { if (puedeHablar()) window.speechSynthesis.cancel(); } catch { /* nada */ }
    try { audio?.pause(); } catch { /* nada */ }
    hablar(false);
  }
  // Suena un mp3 guardado y espera a que termine. → true si sonó.
  function sonar(archivo, mio) {
    return new Promise(listo => {
      try {
        if (!audio) audio = new Audio();
        const fin = ok => { audio.onended = null; audio.onerror = null; hablar(false); listo(ok); };
        audio.onended = () => fin(true);
        audio.onerror = () => fin(false);
        audio.src = `/api/academia/lectura/archivo/${encodeURIComponent(archivo)}`;
        audio.play().then(() => { if (mio()) hablar(true); else audio.pause(); }, () => fin(false));
      } catch { listo(false); }
    });
  }
  // La voz del teléfono (espera a que termine).
  function telefono(texto, lang) {
    return new Promise(listo => {
      if (!puedeHablar() || !texto) return listo(false);
      try {
        const u = new window.SpeechSynthesisUtterance(texto);
        u.lang = lang === 'en' ? 'en-US' : 'es-ES';
        const voz = window.speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith(u.lang.slice(0, 2)));
        if (voz) u.voice = voz;
        u.rate = 0.95;
        u.onstart = () => hablar(true);
        u.onend = () => { hablar(false); listo(true); };
        u.onerror = () => { hablar(false); listo(false); };
        window.speechSynthesis.speak(u);
      } catch { listo(false); }
    });
  }
  const pedir = async textos => {
    try {
      const r = await api('POST', '/api/academia/lectura/voz', { textos });
      return r.ok && Array.isArray(r.datos?.partes) ? r.datos.partes : textos.map(() => ({ estado: 'no' }));
    } catch { return textos.map(() => ({ estado: 'no' })); }
  };
  // piezas: [{ texto, lang }]. Lee una tras otra; si llega otro leer() o callar(), deja de leer esta.
  async function leer(piezas) {
    callar();
    const mio = turno;
    const sigue = () => mio === turno;
    const lista = (piezas ?? []).filter(p => p && typeof p.texto === 'string' && p.texto.trim());
    // iOS: la voz del teléfono se «despierta» dentro del toque.
    try { if (puedeHablar()) window.speechSynthesis.speak(new window.SpeechSynthesisUtterance('')); } catch { /* nada */ }
    const estados = [];
    for (let i = 0; i < lista.length; i += LOTE) estados.push(...(await pedir(lista.slice(i, i + LOTE).map(p => p.texto))));
    for (let i = 0; i < lista.length && sigue(); i++) {
      let e = estados[i] ?? { estado: 'no' };
      // Recién pedida: unos segundos, por si llega (la próxima vez ya estará guardada para todos).
      for (let k = 0; k < 4 && e.estado === 'pendiente' && sigue(); k++) {
        await esperar(1500);
        if (!sigue()) return;
        e = (await pedir([lista[i].texto]))[0] ?? { estado: 'no' };
      }
      if (!sigue()) return;
      let sono = false;
      if (e.estado === 'lista' && Array.isArray(e.archivos)) {
        sono = true;
        for (const a of e.archivos) { if (!sigue()) return; if (!(await sonar(a, sigue))) { sono = false; break; } }
      }
      if (!sono && sigue()) await telefono(lista[i].texto, lista[i].lang);
    }
  }
  return Object.freeze({ leer, callar });
}

// La preferencia «Con voz / Sin voz» del alumno (guardada en el servidor). En memoria mientras dura la página.
let preferencia = null;
export async function vozEncendida(api) {
  if (preferencia) return preferencia;
  try {
    const r = await api('GET', '/api/academia/lectura');
    preferencia = r.ok ? { voz: r.datos.voz === true, natural: r.datos.natural === true } : { voz: false, natural: false };
  } catch { preferencia = { voz: false, natural: false }; }
  return preferencia;
}
export async function ponerVoz(api, si) {
  const r = await api('POST', '/api/academia/lectura/preferencia', { voz: si === true });
  if (r.ok) preferencia = { ...(preferencia ?? { natural: false }), voz: r.datos.voz === true };
  return r;
}
export const vozGuardada = () => preferencia?.voz === true;
