// Academia (0.7.1): leer una carpeta PÚBLICA de Google Drive («cualquiera con el enlace») sin cuenta de Google ni clave.
//  - Listar: https://drive.google.com/embeddedfolderview?id=<carpeta> (una página HTML). De ella solo se sacan los
//    enlaces /file/d/<id> y /drive/folders/<id> con su nombre; todo lo demás se ignora. Con topes de tamaño y de cantidad.
//  - Bajar: https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t, por pedazos directo al
//    disco (nunca entero en memoria), con un tope por archivo que dice quien llama.
//  - Todo pasa por la única puerta a la red (src/ia/llamar.js), que nunca sigue una redirección: aquí se siguen hasta 3,
//    y SOLO si van a uno de estos dos servidores de Google (en las pruebas, solo al Drive falso de 127.0.0.1). Una
//    redirección a cualquier otro lado (por ejemplo, la página para entrar con una cuenta) no se sigue.
//  - Estos son los ÚNICOS nombres de servidores de Google del programa (test/reglas.test.js lo revisa).
//  - El enlace de la carpeta no es secreto, pero nunca va en el repositorio (es público): vive en los ajustes de la base.
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { llamarProveedor } from '../ia/llamar.js';
import { LIMITES } from './formato.js';

export const HOST_LISTA = 'drive.google.com';
export const HOST_BAJAR = 'drive.usercontent.google.com';
const BASES_OFICIALES = Object.freeze({ lista: `https://${HOST_LISTA}`, bajar: `https://${HOST_BAJAR}` });
const BASE_DE_PRUEBA = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;
export const ID_DRIVE = /^[A-Za-z0-9_-]{10,120}$/;
// Los paquetes se reconocen por su nombre en Drive: paquete-<lo que sea>.json
export const PAQUETE_EN_DRIVE = /^paquete-[^/\\]{0,150}\.json$/i;

export const TOPES_DRIVE = Object.freeze({
  htmlBytes: 2 * 1024 * 1024, // la página de una carpeta
  entradasPorCarpeta: 500,
  carpetas: 40, // carpetas que se leen en una revisión (la principal y sus subcarpetas)
  profundidad: 2, // la carpeta, sus subcarpetas y las subcarpetas de esas
  nombre: 200,
  saltos: 3, // redirecciones que se siguen (solo dentro de Google Drive)
  listaMs: 20_000,
  bajarMs: 120_000, // el tope de la puerta a la red: un mp3 de 40 MB tiene que llegar en 2 minutos
  json: LIMITES.jsonBytes, // 12 MB
  imagen: LIMITES.figuraBytes, // 8 MB
  audio: LIMITES.audioBytes, // 40 MB
  video: LIMITES.videoBytes, // 0.12.1: 150 MB (el mp4 del video resumen)
  videoMs: 840_000, // 0.12.1: 14 minutos para bajar un mp4 (150 MB a ~1,5 Mbit/s): la puerta deja hasta 15 con alTrozo
  porRevision: 400 * 1024 * 1024, // lo que se baja como mucho en una revisión (lo demás, en la siguiente)
});

// Las direcciones de Drive: las oficiales; en modo de prueba, el Drive FALSO (solo 127.0.0.1) si la prueba lo dice.
export function basesDrive(config) {
  const b = config?.driveBases;
  if (process.env.OPORTIA_TEST === '1' && BASE_DE_PRUEBA.test(String(b?.lista ?? '')) && BASE_DE_PRUEBA.test(String(b?.bajar ?? ''))) return { lista: b.lista, bajar: b.bajar };
  return BASES_OFICIALES;
}

// El id de la carpeta, desde el enlace que pega el administrador (o el id solo). null si no se reconoce.
export function idDeCarpeta(enlace) {
  const texto = String(enlace ?? '').trim();
  if (!texto || texto.length > 600) return null;
  if (ID_DRIVE.test(texto)) return texto;
  let u;
  try { u = new URL(texto); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== HOST_LISTA || u.username || u.password || u.port) return null;
  const enRuta = /^\/drive\/(?:u\/\d{1,2}\/)?folders\/([A-Za-z0-9_-]{10,120})\/?$/.exec(u.pathname);
  if (enRuta) return enRuta[1];
  if (['/open', '/folderview', '/embeddedfolderview'].includes(u.pathname)) {
    const id = u.searchParams.get('id');
    return id && ID_DRIVE.test(id) ? id : null;
  }
  return null;
}
export const enlaceDeCarpeta = id => (ID_DRIVE.test(String(id)) ? `https://${HOST_LISTA}/drive/folders/${id}` : null);

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function sinEntidades(texto) {
  return texto.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (todo, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(n) && n > 31 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });
}
const limpio = texto => sinEntidades(texto.replace(/<[^>]{0,2000}>/g, ' ')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

// Lee la página de una carpeta (embeddedfolderview). → [{ id, nombre, carpeta, modificado }]. Nunca lanza: lo que no se
// entiende se salta. Solo se aceptan ids con la forma de Drive y nombres de texto corto.
export function leerListado(html, { propia = null, maximo = TOPES_DRIVE.entradasPorCarpeta } = {}) {
  // Lo que va dentro de <script>, <style> y comentarios no es la lista (podría parecerse a un enlace).
  const texto = String(html ?? '').slice(0, TOPES_DRIVE.htmlBytes)
    .replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi, ' ');
  const entradas = new Map();
  // Un enlace y lo que tiene adentro (sin pasar a otro enlace).
  const enlace = /<a\b[^>]{0,1000}?\bhref\s*=\s*(["'])([^"']{1,800})\1[^>]{0,1000}>((?:(?!<a\b)[\s\S]){0,6000}?)<\/a>/gi;
  for (const m of texto.matchAll(enlace)) {
    if (entradas.size >= maximo) break;
    const href = sinEntidades(m[2]);
    const archivo = /\/file\/d\/([A-Za-z0-9_-]{10,120})(?:[/?#]|$)/.exec(href);
    const carpeta = /\/drive\/(?:u\/\d{1,2}\/)?folders\/([A-Za-z0-9_-]{10,120})(?:[/?#]|$)/.exec(href);
    const id = archivo?.[1] ?? carpeta?.[1];
    if (!id || id === propia || entradas.has(id)) continue;
    const dentro = m[3];
    const titulo = /class\s*=\s*["'][^"']*\bflip-entry-title\b[^"']*["'][^>]{0,200}>([\s\S]{0,1000}?)<\/div>/i.exec(dentro);
    const nombre = limpio(titulo ? titulo[1] : dentro).slice(0, TOPES_DRIVE.nombre);
    if (!nombre) continue;
    const fecha = /class\s*=\s*["'][^"']*\bflip-entry-last-modified\b[^"']*["'][^>]{0,200}>([\s\S]{0,300}?)<\/div>/i.exec(dentro);
    const modificado = fecha ? limpio(fecha[1]).slice(0, 40) || null : null;
    entradas.set(id, { id, nombre, carpeta: Boolean(carpeta && !archivo), modificado });
  }
  return [...entradas.values()];
}

// Un pedido GET a Drive, siguiendo redirecciones SOLO dentro de los servidores permitidos. Nunca lanza.
async function pedirDrive(url, { bases, senal, timeoutMs, topeBytes, alTrozo = null, alEmpezar = null }) {
  const permitidos = new Set([new URL(bases.lista).origin, new URL(bases.bajar).origin]);
  let actual = url;
  for (let salto = 0; salto <= TOPES_DRIVE.saltos; salto++) {
    let u;
    try { u = new URL(actual); } catch { return { motivo: 'redireccion_no_permitida' }; }
    if (!permitidos.has(u.origin) || u.username || u.password) return { motivo: salto ? 'redireccion_no_permitida' : 'destino_no_permitido' };
    const r = await llamarProveedor({
      url: u.href, metodo: 'GET', cabeceras: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; Academia)' },
      senal, timeoutMs, topeBytes, alTrozo, alEmpezar, permitido: u.hostname,
    });
    if (r.cortado) return { motivo: r.cortado };
    if (r.red === 'redireccion') {
      if (!r.ubicacion) return { motivo: 'redireccion_no_permitida' };
      actual = new URL(r.ubicacion, u).href;
      continue;
    }
    if (r.rechazado) return { motivo: 'destino_no_permitido' };
    if (r.abortado) return { motivo: 'cancelado' };
    if (r.tiempoAgotado) return { motivo: 'tiempo_agotado' };
    if (r.falloAlRecibir) return { motivo: 'no_se_pudo_guardar' };
    if (r.demasiado) return { motivo: 'demasiado_grande' };
    if (r.red) return { motivo: 'sin_red' };
    if (r.status === 404) return { motivo: 'no_existe' };
    if (r.status === 401 || r.status === 403) return { motivo: 'sin_permiso' };
    if (r.status === 429) return { motivo: 'muchos_pedidos' };
    if (r.status !== 200) return { motivo: 'no_responde' };
    return { r };
  }
  return { motivo: 'redireccion_no_permitida' };
}

// Lista UNA carpeta. → { ok: true, entradas } o { ok: false, motivo }.
export async function listarCarpeta(id, { bases, senal = null } = {}) {
  if (!ID_DRIVE.test(String(id))) return { ok: false, motivo: 'enlace_no_valido' };
  const partes = [];
  let total = 0;
  const { r, motivo } = await pedirDrive(`${bases.lista}/embeddedfolderview?id=${encodeURIComponent(id)}`, {
    bases, senal, timeoutMs: TOPES_DRIVE.listaMs, topeBytes: TOPES_DRIVE.htmlBytes,
    alTrozo: async trozo => { total += trozo.byteLength; partes.push(Buffer.from(trozo)); },
  });
  // Una carpeta privada manda a la página para entrar con una cuenta (otro servidor): para quien mira es «sin permiso».
  if (motivo) return { ok: false, motivo: motivo === 'redireccion_no_permitida' ? 'sin_permiso' : motivo };
  if (!/text\/html/i.test(r.cabeceras['content-type'] ?? '')) return { ok: false, motivo: 'no_es_carpeta' };
  const html = Buffer.concat(partes, total).toString('utf8');
  const entradas = leerListado(html, { propia: id });
  if (!entradas.length && /accounts\.google\.com|ServiceLogin/i.test(html)) return { ok: false, motivo: 'sin_permiso' };
  return { ok: true, entradas };
}

// Recorre la carpeta y sus subcarpetas (hasta «profundidad»). → { ok, motivo?, archivos: [{ id, nombre, modificado,
// camino: [ids de carpetas desde la principal] }], carpetas, errores: [{ carpeta, motivo }] }. Si la principal no se
// puede leer: ok: false (y nada más).
export async function recorrerCarpeta(raiz, { bases, senal = null, profundidad = TOPES_DRIVE.profundidad, maxCarpetas = TOPES_DRIVE.carpetas } = {}) {
  const archivos = [];
  const errores = [];
  const vistas = new Set([raiz]);
  const pendientes = [{ id: raiz, camino: [raiz], nivel: 0, nombre: '' }];
  let leidas = 0;
  while (pendientes.length) {
    if (senal?.aborted) break;
    const c = pendientes.shift();
    if (leidas >= maxCarpetas) { errores.push({ carpeta: c.nombre, motivo: 'demasiadas_carpetas' }); break; }
    leidas += 1;
    const l = await listarCarpeta(c.id, { bases, senal });
    if (!l.ok) {
      if (c.nivel === 0) return { ok: false, motivo: l.motivo, archivos: [], carpetas: 0, errores: [] };
      errores.push({ carpeta: c.nombre, motivo: l.motivo });
      continue;
    }
    for (const e of l.entradas) {
      if (e.carpeta) {
        if (c.nivel < profundidad && !vistas.has(e.id)) {
          vistas.add(e.id);
          pendientes.push({ id: e.id, camino: [...c.camino, e.id], nivel: c.nivel + 1, nombre: e.nombre });
        }
      } else {
        archivos.push({ id: e.id, nombre: e.nombre, modificado: e.modificado, camino: c.camino });
      }
    }
  }
  return { ok: true, archivos, carpetas: leidas, errores };
}

// Baja un archivo directo al disco (ruta, abierta con 'w': se reusa siempre el mismo «.part»), con su tope.
// → { ok: true, bytes, huella } o { ok: false, motivo }. Una página HTML en vez del archivo (aviso de Google, cuota)
// es «no_disponible»: nunca se toma por el archivo.
// 0.12.1: timeoutMs (el video tarda más) y espacio(bytes) → motivo o null: se llama con lo que dice el servidor que pesa
// (o con el tope si no lo dice), ANTES de escribir nada.
export async function bajarArchivo(id, { bases, ruta, tope, senal = null, timeoutMs = TOPES_DRIVE.bajarMs, espacio = null }) {
  if (!ID_DRIVE.test(String(id))) return { ok: false, motivo: 'no_existe' };
  const hash = createHash('sha256');
  let archivo = null;
  let bytes = 0;
  try {
    archivo = await open(ruta, 'w', 0o640);
    const destino = archivo;
    const { r, motivo } = await pedirDrive(`${bases.bajar}/download?id=${encodeURIComponent(id)}&export=download&confirm=t`, {
      bases, senal, timeoutMs, topeBytes: tope,
      alEmpezar: espacio ? ({ largo }) => (largo != null && largo > tope ? 'demasiado_grande' : espacio(largo ?? tope)) : null,
      alTrozo: async trozo => {
        hash.update(trozo);
        const antes = bytes;
        bytes += trozo.byteLength;
        await destino.write(trozo);
        // Los pedazos ya escritos se sueltan de a 1 MB: si no, en el trabajador (con --expose-gc y poca memoria) se
        // juntan hasta unos 30 MB antes de que Node los recoja solo. Medido bajando 12 MB.
        if (Math.floor(antes / 1_048_576) !== Math.floor(bytes / 1_048_576)) globalThis.gc?.();
      },
    });
    if (motivo) return { ok: false, motivo };
    if (/text\/html/i.test(r.cabeceras['content-type'] ?? '')) return { ok: false, motivo: 'no_disponible' };
    if (!bytes) return { ok: false, motivo: 'vacio' };
    return { ok: true, bytes, huella: hash.digest('hex') };
  } catch {
    return { ok: false, motivo: 'no_se_pudo_guardar' };
  } finally {
    try { await archivo?.close(); } catch { /* ya estaba cerrado */ }
  }
}
