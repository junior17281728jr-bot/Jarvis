// 0.14.53: el trabajador (Web Worker) del dictado en el equipo: Whisper (Transformers.js) pasa a texto lo que grabó el
// alumno, aquí mismo en su navegador; el audio nunca sale del equipo. La librería, el wasm y el modelo vienen de NUESTRO
// sitio (/voz/<id>/…, src/academia/voz.js): nunca de otro (la CSP tampoco lo dejaría).
// Mensajes: { tipo: 'preparar', base, modelo } → { tipo: 'progreso', archivo, cargado, total }… y { tipo: 'listo' } o
// { tipo: 'fallo', motivo }; { tipo: 'transcribir', id, audio (Float32Array 16 kHz), idioma: 'es'|'en' } →
// { tipo: 'texto', id, texto, ms } o { tipo: 'fallo', id, motivo }.
let cargando = null;
// 0.14.53: el Cache API, sin que un error suyo tumbe el dictado (en algunos navegadores match() falla con «Unexpected
// internal error»: entonces se baja de nuevo de OPORTIA, o sale de la caché normal del navegador).
function cajaSegura() {
  let caja = null;
  const abrir = () => (caja ??= (typeof caches === 'undefined' ? Promise.resolve(null) : caches.open('oportia-voz').catch(() => null)));
  return {
    async match(clave) { try { const c = await abrir(); return (c && (await c.match(clave))) || undefined; } catch { return undefined; } },
    async put(clave, respuesta) { try { const c = await abrir(); if (c) await c.put(clave, respuesta); } catch { /* sin caché: no pasa nada */ } },
  };
}
let transcriptor = null;

function cargar(base, modelo) {
  cargando ??= (async () => {
    const { pipeline, env } = await import(`${base}lib/transformers.min.js`);
    env.allowRemoteModels = false; // nunca de huggingface.co: solo de aquí
    env.allowLocalModels = true;
    env.localModelPath = `${base}modelos/`;
    // La segunda vez, del Cache API del navegador; si el navegador no lo deja (modo privado, sin espacio, un error
    // interno) sigue sin él: el navegador igual guarda los archivos (van «immutable» por un año).
    env.useBrowserCache = false;
    env.useCustomCache = true;
    env.customCache = cajaSegura();
    // Un solo hilo: sin SharedArrayBuffer (no hace falta aislar la página con COOP/COEP).
    env.backends.onnx.wasm.wasmPaths = `${base}ort/`;
    // El wasm de onnxruntime (~22 MB) también queda en la caja: lo lee de aquí y se lo da hecho (si no, onnxruntime lo
    // pide cada vez y la caché normal del navegador no siempre guarda un archivo tan grande).
    try {
      const url = `${base}ort/ort-wasm-simd-threaded.jsep.wasm`;
      const caja = cajaSegura();
      const avisar = (cargado, total) => self.postMessage({ tipo: 'progreso', archivo: 'ort-wasm', cargado, total });
      const guardado = await caja.match(url);
      let binario = null;
      if (guardado?.ok) { binario = await guardado.arrayBuffer(); avisar(binario.byteLength, binario.byteLength); } else {
        // Por pedazos, para que «Preparando el dictado… N %» avance también con este archivo.
        const r = await self.fetch(url);
        if (r.ok && r.body) {
          const total = Number(r.headers.get('content-length')) || 0;
          const lector = r.body.getReader();
          const partes = [];
          let cargado = 0;
          for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            partes.push(value);
            cargado += value.byteLength;
            avisar(cargado, total || cargado);
          }
          const blob = new Blob(partes, { type: 'application/wasm' });
          await caja.put(url, new Response(blob, { headers: { 'Content-Type': 'application/wasm' } }));
          binario = await blob.arrayBuffer();
        }
      }
      if (binario) env.backends.onnx.wasm.wasmBinary = binario;
    } catch { /* que onnxruntime lo pida solo */ }
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    transcriptor = await pipeline('automatic-speech-recognition', modelo, {
      dtype: 'q8', device: 'wasm',
      progress_callback: x => { if (x?.status === 'progress') self.postMessage({ tipo: 'progreso', archivo: String(x.file ?? ''), cargado: Number(x.loaded) || 0, total: Number(x.total) || 0 }); },
    });
  })();
  cargando.catch(() => { cargando = null; });
  return cargando;
}

const motivoDe = e => String(e?.message ?? e ?? 'error').slice(0, 200);

self.addEventListener('message', async ev => {
  const d = ev.data ?? {};
  if (d.tipo === 'preparar') {
    try { await cargar(String(d.base), String(d.modelo)); self.postMessage({ tipo: 'listo' }); } catch (e) { console.warn('dictado: no cargó el modelo:', motivoDe(e)); self.postMessage({ tipo: 'fallo', motivo: motivoDe(e) }); }
    return;
  }
  if (d.tipo === 'transcribir') {
    try {
      if (!transcriptor) throw new Error('sin_modelo');
      const t0 = performance.now();
      const segundos = d.audio.length / 16000;
      // Contra el «bucle» de Whisper (repetir lo mismo sin fin): pocas palabras por segundo y sin repetir 4 seguidas.
      const r = await transcriptor(d.audio, {
        language: d.idioma === 'en' ? 'english' : 'spanish', task: 'transcribe',
        chunk_length_s: 30, stride_length_s: 5,
        no_repeat_ngram_size: 4, max_new_tokens: Math.min(220, Math.ceil(Math.min(segundos, 30) * 6) + 12),
      });
      self.postMessage({ tipo: 'texto', id: d.id, texto: String(r?.text ?? ''), ms: Math.round(performance.now() - t0) });
    } catch (e) {
      self.postMessage({ tipo: 'fallo', id: d.id, motivo: motivoDe(e) });
    }
  }
});
