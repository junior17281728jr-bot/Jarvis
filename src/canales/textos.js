// Los TEXTOS que salen por un canal (hoy: Telegram). Salen de las mismas frases de las pantallas
// (public/i18n/es.json y en.json, claves telegram.*), en el idioma del dueño. Texto plano, nunca formato enriquecido.
//  - Un aviso dice solo su clave, su nivel, la hora y números seguros (MB libres, horas, días, %, la versión corta).
//    Nunca datos de una persona, nombres de proyectos, correos, claves ni el «detalle» completo del aviso. Única excepción
//    (0.12.3, pedido del dueño): el comprobante de pago nuevo dice el nombre del alumno, el paquete y el monto.
//  - Lo más largo que sale es 1.000 caracteres (Telegram acepta 4.096); una leyenda, 300 (acepta 1.024).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { idDelDueno } from '../cuentas/tailscale.js';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'i18n');
const IDIOMAS = Object.freeze(['es', 'en']);
export const TEXTO_MAX = 1000;
export const LEYENDA_MAX = 300;
const cache = new Map();
// Los únicos números del «detalle» de un aviso que pueden ir en un mensaje.
const NUMEROS_SEGUROS = Object.freeze(['mb', 'libreMb', 'disponibleMb', 'archivoMb', 'walMb', 'n', 'reinicios24h', 'horas', 'dias', 'pct', 'veces', 'fallidas24h', 'revisar']);

function frasesDe(idioma) {
  const id = IDIOMAS.includes(idioma) ? idioma : 'es';
  if (!cache.has(id)) {
    let datos = {};
    try { datos = JSON.parse(readFileSync(join(CARPETA, `${id}.json`), 'utf8')); } catch { datos = {}; }
    cache.set(id, datos);
  }
  return cache.get(id);
}

export function frase(idioma, clave, valores = {}) {
  const texto = frasesDe(idioma)[clave] ?? frasesDe('es')[clave] ?? clave;
  return String(texto).replace(/\{([a-zA-Z0-9_]+)\}/g, (todo, nombre) => (Object.hasOwn(valores, nombre) && valores[nombre] != null ? String(valores[nombre]) : todo));
}

export function existeFrase(clave) {
  return IDIOMAS.every(i => Object.hasOwn(frasesDe(i), clave));
}

// El idioma del dueño (el primer administrador), o 'es'.
export function idiomaDelDueno(db) {
  try {
    const id = idDelDueno(db);
    const f = id == null ? null : db.prepare('SELECT idioma FROM usuarios WHERE id = ?').get(id);
    return IDIOMAS.includes(f?.idioma) ? f.idioma : 'es';
  } catch {
    return 'es';
  }
}

// Una fecha en hora de República Dominicana («9 nov, 4:12 a. m.»).
export function fechaRd(iso, idioma = 'es') {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-DO', {
      timeZone: 'America/Santo_Domingo', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms - 4 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
  }
}

// «41 MB», «7,8 MB»; debajo de 1 MB, en KB («11 KB», nunca «0 MB»: una copia chica no está vacía).
export function megas(bytes, idioma = 'es') {
  const b = Math.max(0, Number(bytes) || 0);
  const formato = n => { try { return new Intl.NumberFormat(idioma === 'en' ? 'en-US' : 'es-DO').format(n); } catch { return String(n); } };
  if (b < 1024 * 1024) return `${formato(Math.max(1, Math.round(b / 1024)))} KB`;
  const mb = b / (1024 * 1024);
  return `${formato(mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb))} MB`;
}

const recortar = (texto, max = TEXTO_MAX) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

// La clave base de un aviso (sin lo que va después de «:»).
export const baseDeClave = clave => String(clave ?? '').split(':')[0];

function detalleDe(aviso) {
  if (aviso?.detalle && typeof aviso.detalle === 'object') return aviso.detalle;
  try { return JSON.parse(aviso?.detalle ?? 'null'); } catch { return null; }
}

function valoresDe(aviso, idioma) {
  const v = {};
  const d = detalleDe(aviso);
  for (const nombre of NUMEROS_SEGUROS) {
    const x = d?.[nombre];
    if (typeof x === 'number' && Number.isFinite(x)) v[nombre] = Math.round(x * 10) / 10;
  }
  const partes = String(aviso?.clave ?? '').split(':');
  if (/^actualizacion_/.test(partes[0]) && /^[0-9a-f]{7}$/.test(partes[1] ?? '')) v.sha = partes[1];
  if (partes[0] === 'ia_proveedor' && /^[a-z][a-z0-9_]{1,30}$/.test(partes[1] ?? '')) {
    v.proveedor = existeFrase(`ia.proveedor.${partes[1]}`) ? frase(idioma, `ia.proveedor.${partes[1]}`) : partes[1];
  }
  if (d?.modoSeguro === true) v.pausa = 'modo_seguro';
  // 0.12.3: qué cambió el administrador (la frase de esa acción; nunca un valor) y, de un comprobante nuevo, el nombre
  // del alumno, el paquete y el monto (lo pidió el dueño: es lo que necesita para revisarlo).
  if (partes[0] === 'cambio_admin' && /^[a-z_]{1,40}$/.test(partes[1] ?? '')) {
    v.que = existeFrase(`admin.cambio.${partes[1]}`) ? frase(idioma, `admin.cambio.${partes[1]}`) : partes[1];
  }
  // 0.12.7: el gasto de la IA en dinero («US$4,00») y los días que quedan del mes (solo números del dueño, nunca un nombre).
  if (partes[0] === 'ia_tope' || partes[0] === 'ia_resumen') {
    const usd = x => (Number.isSafeInteger(x) && x >= 0 ? `US$${new Intl.NumberFormat(idioma === 'en' ? 'en-US' : 'es-DO', { minimumFractionDigits: 2, maximumFractionDigits: x < 10_000 ? 4 : 2 }).format(x / 1_000_000)}` : '?');
    v.usado = usd(d?.usadoMicro);
    v.tope = usd(d?.topeMicro);
    v.mes = usd(d?.mesMicro);
    if (Number.isSafeInteger(d?.dias)) v.dias = d.dias;
    if (Number.isSafeInteger(d?.n)) v.n = d.n;
  }
  if (partes[0] === 'pago_recibido') {
    const corto = (x, max) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
    v.alumno = corto(d?.alumno, 60) || '?';
    v.precio = corto(d?.precio, 40) || '?';
    v.minutos = Number.isSafeInteger(d?.minutos) ? d.minutos : '?';
  }
  return v;
}

// Los motivos del modo seguro que son un problema de la base de datos (src/tareas/modo-seguro.js).
const MODO_SEGURO_POR_LA_BASE = Object.freeze(['base_danada', 'base_no_compatible']);

// El cuerpo de un aviso (sin título): telegram.aviso.<clave>.texto, o telegram.aviso.otro.
export function cuerpoDeAviso(aviso, idioma) {
  const base = baseDeClave(aviso.clave);
  const clave = existeFrase(`telegram.aviso.${base}.texto`) ? `telegram.aviso.${base}` : 'telegram.aviso.otro';
  const valores = valoresDe(aviso, idioma);
  let texto = frase(idioma, `${clave}.texto`, valores);
  // El disco de las copias no dejó escribir (no es «casi lleno»: no hay MB libres que decir).
  // 0.12.7: el tope general cada 10 % («llevas el 40 %… quedan 18 días»), y al 100 % que la IA quedó en modo básico;
  // los topes de una cuenta, con el texto de siempre.
  if (base === 'ia_tope') {
    const d = detalleDe(aviso);
    if (d?.ambito !== 'general') texto = frase(idioma, 'telegram.aviso.ia_tope.cuenta', valores);
    else if (Number(d?.umbral) >= 100) texto = frase(idioma, 'telegram.aviso.ia_tope.lleno', valores);
  }
  if (base === 'copias_locales_pausadas' && detalleDe(aviso)?.motivo === 'escribir') texto = frase(idioma, 'telegram.aviso.copias_locales_pausadas.escribir');
  if (base === 'copia_atrasada' && valores.pausa === 'modo_seguro') texto = `${texto} ${frase(idioma, 'telegram.aviso.copia_atrasada.modo_seguro')}`;
  // Revisión final: el modo seguro por un problema de la base nunca dice que todo está bien: pide revisar antes de quitarlo.
  if (base === 'modo_seguro' && MODO_SEGURO_POR_LA_BASE.includes(detalleDe(aviso)?.motivo)) texto = frase(idioma, 'telegram.aviso.modo_seguro.base');
  return texto;
}

// Un aviso completo: título («🔴 OPORTIA · URGENTE», «Volvió a pasar»…), el texto, dónde mirarlo y la hora.
export function textoDeAviso(aviso, idioma = 'es', { titulo = null, veces = null, desde = null } = {}) {
  const tipo = titulo ?? (aviso.nivel === 'grave' ? 'grave' : 'atencion');
  const lineas = [frase(idioma, `telegram.titulo.${tipo}`)];
  if (tipo === 'volvio' && veces >= 3) lineas.push(frase(idioma, 'telegram.volvio_veces', { n: veces, desde: fechaRd(desde, idioma) }));
  lineas.push(cuerpoDeAviso(aviso, idioma));
  lineas.push(frase(idioma, 'telegram.miralo'));
  lineas.push(fechaRd(aviso.ultima_vez ?? aviso.ultimaVez ?? Date.now(), idioma));
  return recortar(lineas.filter(Boolean).join('\n'));
}

// «✅ OPORTIA · Ya se arregló / Modo seguro: se quitó (9 nov, 7:30 a. m.).»
export function textoCierre(aviso, idioma = 'es') {
  const base = baseDeClave(aviso.clave);
  const nombre = existeFrase(`telegram.aviso.${base}.titulo`) ? frase(idioma, `telegram.aviso.${base}.titulo`) : frase(idioma, 'telegram.aviso.otro.titulo');
  return recortar([frase(idioma, 'telegram.titulo.cierre'), frase(idioma, 'telegram.cierre', { que: nombre, fecha: fechaRd(aviso.resuelto_en, idioma) })].join('\n'));
}

// Varios avisos en un solo mensaje (≤ 5 líneas y «y N más»).
export function textoResumen(avisos, idioma = 'es') {
  const lineas = [frase(idioma, 'telegram.resumen', { n: avisos.length })];
  for (const a of avisos.slice(0, 5)) {
    const base = baseDeClave(a.clave);
    const nombre = existeFrase(`telegram.aviso.${base}.titulo`) ? frase(idioma, `telegram.aviso.${base}.titulo`) : frase(idioma, 'telegram.aviso.otro.titulo');
    lineas.push(`${a.nivel === 'grave' ? '🔴' : '•'} ${nombre}`);
  }
  if (avisos.length > 5) lineas.push(frase(idioma, 'telegram.resumen_mas', { n: avisos.length - 5 }));
  lineas.push(frase(idioma, 'telegram.miralo'));
  return recortar(lineas.join('\n'));
}

// Lo grave que no llegó a tiempo (Telegram no funcionaba, o se arregló solo antes de poder mandarlo): UN mensaje que
// lo nombra (≤ 5 líneas y «y N más»), suena.
export function textoPerdidos(avisos, idioma = 'es') {
  const lineas = [frase(idioma, 'telegram.titulo.perdidos'), frase(idioma, avisos.length === 1 ? 'telegram.perdidos_uno' : 'telegram.perdidos', { n: avisos.length })];
  for (const a of avisos.slice(0, 5)) {
    const base = baseDeClave(a.clave);
    const nombre = existeFrase(`telegram.aviso.${base}.titulo`) ? frase(idioma, `telegram.aviso.${base}.titulo`) : frase(idioma, 'telegram.aviso.otro.titulo');
    const sha = /^actualizacion_/.test(base) && /^[0-9a-f]{7}$/.test(String(a.clave).split(':')[1] ?? '') ? ` (${String(a.clave).split(':')[1]})` : '';
    lineas.push(`🔴 ${nombre}${sha} · ${fechaRd(a.creado_en ?? a.ultima_vez, idioma)}`);
  }
  if (avisos.length > 5) lineas.push(frase(idioma, 'telegram.resumen_mas', { n: avisos.length - 5 }));
  lineas.push(frase(idioma, 'telegram.miralo'));
  return recortar(lineas.join('\n'));
}

export function textoBienvenida(idioma = 'es', { nombre = '', abiertos = 0 } = {}) {
  const lineas = [frase(idioma, 'telegram.bienvenida', { nombre: String(nombre ?? '').slice(0, 40) })];
  if (abiertos > 0) lineas.push(frase(idioma, abiertos === 1 ? 'telegram.bienvenida_abiertos_uno' : 'telegram.bienvenida_abiertos', { n: abiertos }));
  return recortar(lineas.join('\n'));
}

// Ronda 3: el segundo código, que el bot le manda al chat que escribió el primero (se escribe en la pantalla de OPORTIA).
export function textoConfirmarVinculo(idioma = 'es', { codigo }) {
  const c = String(codigo ?? '');
  return recortar(frase(idioma, 'telegram.confirmar_mensaje', { codigo: `${c.slice(0, 3)} ${c.slice(3)}` }));
}

export function textoPrueba(idioma = 'es', ahora = Date.now()) {
  return recortar(frase(idioma, 'telegram.prueba_mensaje', { fecha: fechaRd(ahora, idioma) }));
}

// La leyenda de cada parte y del índice de una copia (§4.5).
export function textoCopia(tipo, idioma = 'es', { creada, n = null, de = null, bytes = 0, partes = 0 } = {}) {
  if (tipo === 'parte') {
    const clave = de ? 'telegram.copia.parte' : 'telegram.copia.parte_sin_total';
    return recortar(frase(idioma, clave, { fecha: fechaRd(creada, idioma), n, de }), LEYENDA_MAX);
  }
  // «1 parte» en singular (una copia chica de un servidor nuevo es de una sola parte).
  return recortar(frase(idioma, Number(partes) === 1 ? 'telegram.copia.leyenda.uno' : 'telegram.copia.leyenda', { fecha: fechaRd(creada, idioma), mb: megas(bytes, idioma), n: partes }), LEYENDA_MAX);
}
