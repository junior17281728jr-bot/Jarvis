// 0.14.70: la llamada a ElevenLabs (SOLO la usa el trabajador: src/academia/instructor-tarea.js y voz-preparar.js).
//  - La clave se lee con conCredencial (src/canales/credencial.js, el que puede leer una clave descifrada para lo que no
//    es la IA que escribe) justo antes de llamar y se suelta después; nunca se guarda, se muestra ni se anota.
//  - Una llamada = un texto (de hasta 500 letras). Antes se apartan sus letras (apartarLetras: nunca pasa el tope del mes).
//  - El mp3 llega por pedazos (alTrozo), con tope de bytes; se revisa que sea un mp3 y se guarda con «.part» y renombrar.
//  - Lo que respondió decide (como con los otros proveedores):
//      sin crédito, clave mala, sin permiso, la voz ya no existe, una redirección o la clave en la respuesta → ElevenLabs
//      queda EN PAUSA hasta que el dueño toque «Probar y reanudar», y se le avisa (aviso 'ia_proveedor:elevenlabs', que
//      llega también por Telegram si es grave);
//      429 (espera) → pausa corta, lo que pida (entre 1 y 15 min); un error del servidor o de la red → pausa de 2 min.
//    Después de una pausa la pantalla sigue con ChatGPT o con la voz del teléfono: nada se rompe.
import { llamarProveedor } from '../ia/llamar.js';
import { urlDe, hostDe } from '../ia/proveedores/index.js';
import { elevenlabs } from '../ia/proveedores/elevenlabs.js';
import { conCredencial } from '../canales/credencial.js';
import { anotarPrueba, anotarUso, pausarSecreto, quitarPausaCorta } from '../claves/almacen.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { esMp3, VOZ } from './oral-voz.js';
import {
  USO_ELEVENLABS, AVISO_ELEVENLABS, CREDITO_CADA_MS, leerConfigVoz, varianteDe, archivoEleven, anotarVariante, guardarAudio, apartarLetras,
  devolverLetras, estadoEleven, leerCredito, guardarCredito, filaEleven,
} from './voz-natural.js';

export const VOZ_MS = 40_000;
const MINUTO = 60_000;
const PAUSA_ADMIN = Object.freeze({ sin_credito: 'grave', clave_no_valida: 'grave', sin_permiso: 'grave', eco_de_clave: 'grave', voz_no_existe: 'atencion', redireccion: 'atencion' });
const PASAJERO = Object.freeze(['error_proveedor', 'sin_red', 'tiempo_agotado']);

// ¿Trae la respuesta la clave (o un pedazo de 12 letras)? Solo en memoria, mientras la clave existe.
function traeClave(resp, clave) {
  const partes = [...Object.values(resp?.cabeceras ?? {}), resp?.textoCorto ?? ''];
  try { if (resp?.json != null) partes.push(JSON.stringify(resp.json)); } catch { return true; }
  const texto = partes.join('\n').toLowerCase();
  const k = String(clave).toLowerCase();
  if (texto.includes(k)) return true;
  for (let i = 0; i + 12 <= k.length; i++) if (texto.includes(k.slice(i, i + 12))) return true;
  return false;
}

// Lo que se hace con el resultado (dentro de una escritura). secretoId: la clave que se usó.
export function aplicarResultado(db, { secretoId, motivo, reintentarMs = null, ahora = Date.now() }) {
  if (secretoId == null) return;
  if (motivo === 'ok') {
    anotarUso(db, { id: secretoId, ahora });
    quitarPausaCorta(db, { id: secretoId });
    resolverAviso(db, AVISO_ELEVENLABS, ahora);
    return;
  }
  if (Object.hasOwn(PAUSA_ADMIN, motivo)) {
    if (motivo === 'clave_no_valida' || motivo === 'sin_permiso') anotarPrueba(db, { id: secretoId, motivo, ahora });
    pausarSecreto(db, { id: secretoId, motivo, hastaMs: null, ahora });
    abrirAviso(db, { clave: AVISO_ELEVENLABS, nivel: PAUSA_ADMIN[motivo], detalle: { proveedor: 'elevenlabs', motivo, pausa: 'admin', hasta: null }, ahora });
    return;
  }
  if (motivo === 'limite_proveedor') {
    const espera = Math.min(15 * MINUTO, Math.max(MINUTO, Number.isFinite(reintentarMs) && reintentarMs != null ? reintentarMs : MINUTO));
    pausarSecreto(db, { id: secretoId, motivo, hastaMs: ahora + espera, ahora });
    return;
  }
  if (PASAJERO.includes(motivo)) pausarSecreto(db, { id: secretoId, motivo, hastaMs: ahora + 2 * MINUTO, ahora });
}

// Graba UN texto con ElevenLabs. ctx: { db, config, escribir, senal }. → { motivo, archivo?, letras }
//  motivo 'ok' (archivo guardado), o por qué no (sin_clave, tope_voz, sin_credito, proveedor_en_pausa, clave_no_valida…).
export async function grabarEleven(ctx, { texto, idioma = null, ahora = Date.now }) {
  const { db, config } = ctx;
  const t = String(texto ?? '');
  if (!t.trim() || t.length > VOZ.textoMax) return { motivo: 'pedido_no_valido', letras: 0 };
  const e = estadoEleven(db, config, { ahora: ahora() });
  if (e.estado === 'sin_clave') return { motivo: 'sin_clave', letras: 0 };
  if (e.estado === 'tope_lleno') return { motivo: 'tope_voz', letras: 0 };
  if (e.estado === 'apagada') return { motivo: 'proveedor_no_usado', letras: 0 };
  if (e.estado !== 'lista') return { motivo: e.motivo === 'sin_credito' ? 'sin_credito' : 'proveedor_en_pausa', letras: 0 };
  // La foto del crédito, si ya es vieja (más de una hora): antes de gastar se mira otra vez (gratis).
  const foto = leerCredito(db);
  if (!foto?.en || ahora() - Date.parse(foto.en) >= CREDITO_CADA_MS) { try { await actualizarCredito(ctx, { ahora }); } catch { /* se sigue con lo que se sabe */ } }
  const cfg = leerConfigVoz(db);
  const variante = varianteDe(cfg);
  const archivo = archivoEleven(variante, t);
  const fila = filaEleven(db);
  const apartado = await ctx.escribir(() => apartarLetras(db, { letras: t.length, ahora: ahora() }));
  if (!apartado.ok) return { motivo: apartado.motivo, letras: 0 };
  const devolver = () => ctx.escribir(() => devolverLetras(db, { letras: t.length, mes: apartado.mes }));
  const trozos = [];
  let bytes = 0;
  let r;
  try {
    r = await conCredencial(db, config, { uso: USO_ELEVENLABS, secretoId: fila?.id ?? null, tipo: 'elevenlabs' }, async cred => {
      const p = elevenlabs.pedidoVoz({ vozId: cfg.vozId, modelo: cfg.modelo, texto: t, idioma });
      const resp = await llamarProveedor({
        url: urlDe(elevenlabs, config, p.ruta), metodo: p.metodo, cabeceras: elevenlabs.cabeceras(cred.token), cuerpo: p.cuerpo,
        senal: ctx.senal ?? null, timeoutMs: VOZ_MS, permitido: hostDe(elevenlabs), topeBytes: VOZ.bytesMax,
        alEmpezar: ({ largo }) => (largo != null && largo > VOZ.bytesMax ? 'demasiado_largo' : null),
        alTrozo: async trozo => { bytes += trozo.byteLength; trozos.push(Buffer.from(trozo)); },
      });
      if (traeClave(resp, cred.token)) return { motivo: 'eco_de_clave', reintentarMs: null, cobra: true };
      if (resp.cortado) return { motivo: 'respuesta_no_valida', reintentarMs: null, cobra: true };
      return elevenlabs.leerVoz(resp, { bytes });
    });
  } catch {
    r = { motivo: 'error_proveedor', reintentarMs: null, cobra: true };
  }
  // Sin la clave (se cambió o se quitó en el medio): no salió nada.
  if (!r || r.cobra === undefined) {
    await devolver();
    return { motivo: r?.motivo === 'clave_no_valida' ? 'clave_no_valida' : 'sin_clave', letras: 0 };
  }
  let motivo = r.motivo;
  const buf = motivo === 'ok' ? Buffer.concat(trozos) : null;
  if (motivo === 'ok' && !esMp3(buf)) motivo = 'respuesta_no_valida';
  const momento = ahora();
  let guardado = null;
  try {
    await ctx.escribir(() => {
      if (motivo === 'ok') {
        guardado = guardarAudio(config, archivo, buf);
        anotarVariante(db, variante);
      }
      if (r.cobra === false) devolverLetras(db, { letras: t.length, mes: apartado.mes });
      aplicarResultado(db, { secretoId: fila?.id ?? null, motivo, reintentarMs: r.reintentarMs ?? null, ahora: momento });
    });
  } catch {
    return { motivo: 'no_se_pudo_guardar', letras: t.length };
  }
  if (motivo === 'ok') {
    try { await actualizarCredito(ctx, { ahora }); } catch { /* la foto espera a la próxima */ }
    return { motivo: 'ok', archivo: guardado?.archivo ?? archivo, letras: t.length };
  }
  return { motivo, letras: r.cobra === false ? 0 : t.length };
}

// La foto del crédito (GET /v1/user/subscription, gratis), como mucho una vez por hora. Sin clave: nada (ni la red).
export async function actualizarCredito(ctx, { forzar = false, ahora = Date.now } = {}) {
  const { db, config } = ctx;
  const fila = filaEleven(db);
  if (!fila) return { motivo: 'sin_clave' };
  const c = leerCredito(db);
  if (!forzar && c?.en && ahora() - Date.parse(c.en) < CREDITO_CADA_MS) return { motivo: 'reciente' };
  const r = await conCredencial(db, config, { uso: USO_ELEVENLABS, secretoId: fila.id, tipo: 'elevenlabs' }, async cred => {
    const p = elevenlabs.suscripcion();
    const resp = await llamarProveedor({ url: urlDe(elevenlabs, config, p.ruta), metodo: p.metodo, cabeceras: elevenlabs.cabecerasCuenta(cred.token), senal: ctx.senal ?? null, timeoutMs: 10_000, permitido: hostDe(elevenlabs), topeBytes: 65_536 });
    if (traeClave(resp, cred.token)) return { motivo: 'eco_de_clave', credito: null };
    return elevenlabs.leerSuscripcion(resp);
  });
  if (r?.motivo === 'ok') await ctx.escribir(() => guardarCredito(db, r.credito, { ahora: ahora() }));
  return r ?? { motivo: 'error_proveedor' };
}
