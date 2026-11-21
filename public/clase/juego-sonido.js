// 0.14.103: el sonido del Juego, hecho en código con Web Audio (sin archivos ni dependencias): el motor (su tono y su
// volumen siguen las RPM), el viento y la hélice (con la velocidad), la bocina de pérdida, el motor que tose (falla del
// aceite o mezcla muy pobre) y el silencio cuando se para, el arranque, el chirrido de las ruedas al tocar, la turbulencia,
// la lluvia, el trueno y un pitido (el aviso del tráfico). Apagado al empezar: solo suena después de tocar «Sonido» (lo
// pide el iPhone); se calla en pausa, al salir y con la pestaña escondida. Liviano: pocos nodos, siempre los mismos.
// crearContexto: para las pruebas (un AudioContext de mentira). Nada se crea hasta encender().

export function crearSonido({ crearContexto = null } = {}) {
  let ctx = null, n = null, activo = false, ultimoToque = 0;
  const nuevo = () => {
    if (crearContexto) return crearContexto();
    const C = globalThis.AudioContext || globalThis.webkitAudioContext;
    return C ? new C() : null;
  };
  function armar() {
    const g = v => { const x = ctx.createGain(); x.gain.value = v; return x; };
    const maestro = g(0.0); maestro.connect(ctx.destination);
    // El ruido (2 s, en bucle): para el viento, la turbulencia, la lluvia, las ruedas y el trueno.
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const datos = buf.getChannelData(0);
    let s = 7;
    for (let i = 0; i < datos.length; i++) { s = (s * 16807) % 2147483647; datos[i] = (s / 2147483647) * 2 - 1; }
    const ruido = ctx.createBufferSource(); ruido.buffer = buf; ruido.loop = true;
    const filtro = (tipo, f, q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = tipo; x.frequency.value = f; x.Q.value = q; return x; };
    // El motor: dos osciladores (el tono de los encendidos y su armónico) por un filtro.
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const fMotor = filtro('lowpass', 700), gMotor = g(0);
    o1.connect(fMotor); o2.connect(fMotor); fMotor.connect(gMotor); gMotor.connect(maestro);
    // El viento y la hélice.
    const fViento = filtro('bandpass', 900, 0.5), gViento = g(0); ruido.connect(fViento); fViento.connect(gViento); gViento.connect(maestro);
    const fGolpe = filtro('lowpass', 160), gGolpe = g(0); ruido.connect(fGolpe); fGolpe.connect(gGolpe); gGolpe.connect(maestro); // turbulencia
    // El trueno, con su propio volumen (si no, la turbulencia de cada cuadro lo pisaría).
    const gTrueno = g(0); fGolpe.connect(gTrueno); gTrueno.connect(maestro);
    const fLluvia = filtro('highpass', 3500), gLluvia = g(0); ruido.connect(fLluvia); fLluvia.connect(gLluvia); gLluvia.connect(maestro);
    const fRueda = filtro('bandpass', 2400, 4), gRueda = g(0); ruido.connect(fRueda); fRueda.connect(gRueda); gRueda.connect(maestro);
    // La bocina de pérdida y el arranque.
    const oBocina = ctx.createOscillator(); oBocina.type = 'square'; oBocina.frequency.value = 580;
    const gBocina = g(0); oBocina.connect(gBocina); gBocina.connect(maestro);
    const oArranque = ctx.createOscillator(); oArranque.type = 'triangle'; oArranque.frequency.value = 95;
    const gArranque = g(0); oArranque.connect(gArranque); gArranque.connect(maestro);
    const oPitido = ctx.createOscillator(); oPitido.type = 'sine'; oPitido.frequency.value = 880;
    const gPitido = g(0); oPitido.connect(gPitido); gPitido.connect(maestro);
    for (const x of [ruido, o1, o2, oBocina, oArranque, oPitido]) x.start();
    n = { maestro, o1, o2, gMotor, fMotor, gViento, fViento, gGolpe, gTrueno, gLluvia, gRueda, gBocina, gArranque, oArranque, gPitido };
  }
  const poner = (param, v, tau = 0.08) => { if (param.setTargetAtTime) param.setTargetAtTime(v, ctx.currentTime, tau); else param.value = v; };
  // Un golpe corto (las ruedas, el trueno, el pitido): sube y baja.
  const golpe = (param, pico, dur) => {
    const t0 = ctx.currentTime;
    if (param.setValueAtTime) { param.cancelScheduledValues?.(t0); param.setValueAtTime(pico, t0); param.exponentialRampToValueAtTime?.(0.0001, t0 + dur); }
    else param.value = pico;
  };
  return {
    get activo() { return activo; },
    get contexto() { return ctx; },
    // Desde un toque o una tecla del usuario (el iPhone no deja sonar antes).
    async encender() {
      if (!ctx) { ctx = nuevo(); if (!ctx) return false; armar(); }
      try { await ctx.resume?.(); } catch { /* sigue */ }
      activo = true;
      poner(n.maestro.gain, 0.5, 0.2);
      return true;
    },
    apagar() { activo = false; if (ctx && n) { poner(n.maestro.gain, 0, 0.05); try { ctx.suspend?.(); } catch { /* nada */ } } },
    // e: { rpm, enMarcha, kt, aviso, aspereza, girando, turbulencia, lluvia } (cada cuadro; barato: solo mueve parámetros)
    actualizar(e) {
      if (!activo || !ctx || !n) return;
      const rpm = Math.max(0, e.rpm ?? 0), anda = e.enMarcha !== false && rpm > 400;
      const f = (rpm / 60) * 2; // 4 cilindros: dos encendidos por vuelta
      poner(n.o1.frequency, Math.max(20, f)); poner(n.o2.frequency, Math.max(10, f / 2));
      // Áspero (tose): el volumen baja y sube de golpe.
      const tos = (e.aspereza ?? 0) > 0.05 && Math.random() < e.aspereza * 0.25 ? 0.25 : 1;
      poner(n.gMotor.gain, anda ? (0.08 + 0.14 * Math.min(1, rpm / 2700)) * tos : 0, anda ? 0.05 : 0.3);
      poner(n.fMotor.frequency, 300 + rpm * 0.35);
      const v = Math.min(1, (e.kt ?? 0) / 140);
      poner(n.gViento.gain, 0.02 + 0.22 * v * v); poner(n.fViento.frequency, 500 + 900 * v);
      poner(n.gBocina.gain, e.aviso ? 0.05 : 0, 0.02);
      poner(n.gArranque.gain, e.girando ? 0.12 : 0, 0.03);
      if (e.girando) poner(n.oArranque.frequency, 80 + Math.random() * 25);
      poner(n.gGolpe.gain, Math.min(0.5, (e.turbulencia ?? 0) * 0.35));
      poner(n.gLluvia.gain, Math.min(0.3, (e.lluvia ?? 0) * 0.25));
    },
    // Lo que pasa una vez: 'toque' (ruedas), 'trueno', 'pitido'.
    evento(tipo) {
      if (!activo || !ctx || !n) return;
      if (tipo === 'toque') { const t = ctx.currentTime; if (t - ultimoToque < 0.5) return; ultimoToque = t; golpe(n.gRueda.gain, 0.35, 0.25); }
      else if (tipo === 'trueno') golpe(n.gTrueno.gain, 0.9, 2.5);
      else if (tipo === 'pitido') golpe(n.gPitido.gain, 0.15, 0.18);
    },
    destruir() { activo = false; try { ctx?.close?.(); } catch { /* nada */ } ctx = null; n = null; },
  };
}
