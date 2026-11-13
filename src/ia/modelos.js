// 0.14.2: los modelos de ChatGPT (y de la «API propia») que el dueño puede elegir. Nunca se adivina un nombre: la prueba
// gratis (GET /v1/models, src/claves/probar.js) trae la lista, se guarda aquí («ajustes») y, si todavía no hay uno
// elegido (o el elegido ya no está), se eligen solos los de por defecto, por el NOMBRE:
//  - escribir (las clases): el modelo general más nuevo que no es «mini», «nano» ni «pro» (pro es muy caro).
//  - verificar (y la rutina barata): el «mini» más nuevo (si no hay, un «nano»; si no, el mismo de escribir).
//  - dibujos: el «gpt-image» más nuevo (o «dall-e-3»).
// El dueño los cambia en Administrador → IA → ChatGPT (una lista simple). Puro salvo guardar/leer.
import { leerConfigIa, guardarConfigIa } from './config.js';
import { MODELO_ID, precioPara } from './precios.js';

const clave = proveedor => `ia.modelos.${proveedor}`;
const NO_TEXTO = /(audio|realtime|transcri|tts|image|search|embedding|instruct|moderation|dall-e|whisper|davinci|babbage|codex|computer|research|preview|sora|vision)/i;

function version(id) {
  const m = /^gpt-(\d+(?:\.\d+)?)/i.exec(id) ?? /^o(\d+)/i.exec(id);
  return m ? Number(m[1]) - (/^o\d/i.test(id) ? 0.5 : 0) : 0;
}
const conFecha = id => /-\d{4}-\d{2}-\d{2}$|-\d{4}$/.test(id);
const ordenar = lista => [...lista].sort((a, b) => version(b) - version(a) || Number(conFecha(a)) - Number(conFecha(b)) || a.length - b.length || a.localeCompare(b));

export function elegirPorDefecto(modelos, { proveedor = 'openai' } = {}) {
  const lista = (modelos ?? []).filter(m => typeof m === 'string' && MODELO_ID.test(m));
  if (proveedor === 'propia') {
    const texto = lista.filter(m => !NO_TEXTO.test(m));
    return { modeloEscribir: texto[0] ?? null, modelo: texto.find(m => /mini|small|lite|flash|haiku/i.test(m)) ?? texto[0] ?? null };
  }
  const chat = lista.filter(m => /^(gpt-|o\d|chatgpt-)/i.test(m) && !NO_TEXTO.test(m));
  const fuertes = ordenar(chat.filter(m => !/(mini|nano|(?:^|-)pro(?:-|$))/i.test(m)));
  const mini = ordenar(chat.filter(m => /mini/i.test(m)));
  const nano = ordenar(chat.filter(m => /nano/i.test(m)));
  // Solo «gpt-image» (el pedido usa sus opciones: WebP y calidad baja); nunca dall-e.
  const imagen = [...lista.filter(m => /^gpt-image/i.test(m))].sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0] ?? null;
  const escribir = fuertes[0] ?? mini[0] ?? null;
  return { modeloEscribir: escribir, modelo: mini[0] ?? nano[0] ?? escribir, modeloImagen: imagen };
}

export function modelosVistos(db, proveedor) {
  try {
    const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave(proveedor))?.valor ?? 'null');
    return v && Array.isArray(v.modelos) ? { modelos: v.modelos.filter(m => typeof m === 'string' && MODELO_ID.test(m)), en: v.en ?? null } : { modelos: [], en: null };
  } catch { return { modelos: [], en: null }; }
}

// Después de una prueba gratis que pasó: si el dueño eligió «el que funcione» (o este proveedor) y ya hay modelo y precio,
// este proveedor queda en «Usar» (la IA sigue apagada hasta que el dueño la encienda con su tope). Nunca lanza.
export function usarSiFunciona(db, config, { proveedor, ahora = Date.now(), usuarioId = null }) {
  try {
    const cfg = leerConfigIa(db);
    const p = cfg.proveedores[proveedor];
    if (!p || p.usar || !(cfg.preferido === 'auto' || cfg.preferido === proveedor)) return false;
    if (!precioPara(db, proveedor, p.modelo)) return false;
    guardarConfigIa(db, { usar: { [proveedor]: true } }, { config, usuarioId, origen: 'automatico', ahora });
    return true;
  } catch {
    return false;
  }
}

// Guarda la lista y, si falta, elige los de por defecto. Nunca lanza (la prueba de la clave sigue igual).
export function guardarModelosVistos(db, config, { proveedor, modelos, ahora = Date.now(), usuarioId = null }) {
  try {
    const lista = (modelos ?? []).slice(0, 400);
    db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
      ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave(proveedor), JSON.stringify({ modelos: lista, en: new Date(ahora).toISOString() }), new Date(ahora).toISOString());
    if (!lista.length) return null;
    const actual = leerConfigIa(db).proveedores[proveedor];
    const defecto = elegirPorDefecto(lista, { proveedor });
    const cambios = {};
    for (const campo of Object.keys(defecto)) {
      if (!(campo in actual)) continue;
      if ((actual[campo] == null || !lista.includes(actual[campo])) && defecto[campo] && defecto[campo] !== actual[campo]) cambios[campo] = defecto[campo];
    }
    if (!Object.keys(cambios).length) return null;
    guardarConfigIa(db, { modelos: { [proveedor]: cambios } }, { config, usuarioId, origen: 'automatico', ahora });
    return cambios;
  } catch {
    return null;
  }
}
