// 0.14.53: los «archivos de voz» del dictado en el equipo del alumno (Whisper con Transformers.js, en su navegador).
// El dueño no tiene ChatGPT y el dictado del navegador no escribía nada en su Mac ni en su iPhone: ahora el micrófono de
// la app graba y un programa (Whisper) lo pasa a texto DENTRO del navegador del alumno. El audio nunca sale del equipo.
//  - Los archivos grandes (la librería, el wasm de onnxruntime y el modelo: ~102 MB) NO van en el repositorio. La lista
//    con versiones exactas, direcciones y sha256 está en src/academia/voz-archivos.json. El servidor los baja la primera
//    vez que hacen falta (o al arrancar, en segundo plano), revisa cada sha256 y los sirve en /voz/<id>/… desde NUESTRO
//    sitio (la CSP solo deja cargar de aquí).
//  - Cada archivo tiene varias fuentes en orden: la directa (cdn.jsdelivr.net, huggingface.co con commit fijo) y, si
//    falla, el paquete de npm (registry.npmjs.org) del que se saca ese archivo. Con el sha256 fijo da igual de dónde
//    venga: un archivo distinto se rechaza y se prueba la fuente siguiente.
//  - Todo por pedazos (el servidor tiene 454 MB de memoria): de la red al disco, nunca entero en memoria. Uno a la vez
//    (una sola bajada aunque lo pidan muchos), a un archivo «.parte» que solo se renombra si el sha256 está bien. Si
//    falla, el «.parte» se deja vacío (nunca se borra nada: test/reglas.test.js) y se usa otra vez la próxima.
//  - La red pasa por la única puerta (src/ia/llamar.js), que nunca sigue redirecciones: aquí se siguen solo dentro de
//    los servidores de la lista (Hugging Face manda los archivos grandes a su CDN *.hf.co).
import { open, mkdir, rename, stat, statfs, truncate } from 'node:fs/promises';
import { createReadStream, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { once } from 'node:events';
import { join, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { llamarProveedor } from '../ia/llamar.js';
import { CABECERAS_SEGURIDAD } from '../nucleo/http.js';

export const MANIFIESTO_VOZ = Object.freeze(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'voz-archivos.json'), 'utf8')));

// Los servidores de donde se baja (y adonde se puede seguir una redirección). Hugging Face manda los archivos grandes a
// su CDN (us.aws.cdn.hf.co, cas-bridge.xethub.hf.co…): solo se sigue a *.hf.co si la bajada empezó en huggingface.co.
export const HOSTS_VOZ = Object.freeze(['cdn.jsdelivr.net', 'registry.npmjs.org', 'huggingface.co']);
const SALTOS = 4;
const BASE_DE_PRUEBA = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;
// Después de un fallo se espera un rato antes de probar otra vez (cada pedido del estado lo intentaría).
export const ESPERA_TRAS_FALLO_MS = 10 * 60_000;
// Lo que hace falta libre en el disco además de los archivos (el paquete de npm más grande, por si se usa, y un margen).
const MARGEN_DISCO = 64 * 1024 * 1024;

const TIPOS_VOZ = Object.freeze({
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8', '.onnx': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
});
export const tipoVoz = ruta => TIPOS_VOZ[/\.[a-z0-9]+$/.exec(ruta)?.[0] ?? ''] ?? 'application/octet-stream';
const UN_ANO = 'public, max-age=31536000, immutable';

// ¿Se puede pedir (o seguir una redirección a) esta dirección? origen: el host donde empezó esa bajada.
export function hostVozPermitido(url, origen = null, { prueba = process.env.OPORTIA_TEST === '1' } = {}) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.username || u.password) return false;
  if (prueba) return BASE_DE_PRUEBA.test(u.origin);
  if (u.protocol !== 'https:' || u.port !== '') return false;
  if (HOSTS_VOZ.includes(u.hostname)) return true;
  return (origen ?? u.hostname) === 'huggingface.co' && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.hf\.co$/.test(u.hostname);
}

// Revisa la lista (voz-archivos.json): rutas simples y únicas, sha256 y tamaños bien escritos, y cada fuente es de un
// servidor permitido o un paquete que existe. → la lista de problemas (vacía si está bien). prueba: como en las pruebas
// (solo 127.0.0.1); la lista del repositorio se revisa con prueba: false.
export function revisarManifiesto(m, { prueba = process.env.OPORTIA_TEST === '1' } = {}) {
  const permitido = url => hostVozPermitido(url, null, { prueba });
  const mal = [];
  if (!m || typeof m !== 'object') return ['sin_lista'];
  if (!/^[a-z0-9.-]{3,60}$/.test(String(m.id ?? ''))) mal.push('id');
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(String(m.modelo ?? ''))) mal.push('modelo');
  if (m.modeloChico != null && !/^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(String(m.modeloChico))) mal.push('modeloChico');
  const rutas = new Set();
  let suma = 0;
  for (const [nombre, p] of Object.entries(m.paquetes ?? {})) {
    if (!permitido(p?.url) || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(String(p?.integridad ?? '')) || !Number.isSafeInteger(p?.bytes)) mal.push(`paquete:${nombre}`);
  }
  for (const a of m.archivos ?? []) {
    const r = String(a?.ruta ?? '');
    if (!/^(?:lib|ort|modelos)\/[A-Za-z0-9._/-]+$/.test(r) || r.includes('..') || r.endsWith('.parte') || rutas.has(r)) mal.push(`ruta:${r}`);
    rutas.add(r);
    if (!/^[0-9a-f]{64}$/.test(String(a?.sha256 ?? '')) || !Number.isSafeInteger(a?.bytes) || a.bytes <= 0) mal.push(`huella:${r}`);
    suma += Number(a?.bytes) || 0;
    if (!Array.isArray(a?.fuentes) || !a.fuentes.length) mal.push(`fuentes:${r}`);
    for (const f of a?.fuentes ?? []) {
      if (f?.url != null ? !permitido(f.url) : !(m.paquetes?.[f?.paquete] && typeof f?.dentro === 'string' && f.dentro.length < 200)) mal.push(`fuente:${r}`);
    }
  }
  if (!rutas.size) mal.push('sin_archivos');
  if (m.bytes !== suma) mal.push('bytes');
  return mal;
}

// ---------- Un .tar (dentro del .tgz de npm), por pedazos ----------
// Lee las entradas una tras otra. alEntrada(nombre, tamano) → un destino { escribir(trozo), cerrar() } o null (se
// salta). Entiende los nombres largos de pax («x») y de GNU («L»). Nunca junta más de un bloque de 512 en memoria
// (salvo un nombre largo, hasta 64 KB).
export async function extraerTar(fuente, alEntrada) {
  let buf = Buffer.alloc(0);
  let modo = 'cabecera';
  let restante = 0;
  let relleno = 0;
  let destino = null;
  let meta = null; // { tipo, partes } mientras se lee un nombre largo
  let nombreLargo = null;
  let ceros = 0;
  const texto = (b, desde, largo) => { const s = b.subarray(desde, desde + largo); const fin = s.indexOf(0); return (fin < 0 ? s : s.subarray(0, fin)).toString('utf8'); };
  const terminarCuerpo = async () => {
    if (destino) { const d = destino; destino = null; await d.cerrar(); }
    if (meta) {
      const t = Buffer.concat(meta.partes).toString('utf8');
      if (meta.tipo === 'L') nombreLargo = t.replace(/\0+$/, '');
      else { const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(t); if (m) nombreLargo = m[1]; }
      meta = null;
    }
    modo = relleno ? 'relleno' : 'cabecera';
  };
  for await (const trozo of fuente) {
    buf = buf.length ? Buffer.concat([buf, trozo]) : Buffer.from(trozo.buffer, trozo.byteOffset, trozo.byteLength);
    while (buf.length) {
      if (modo === 'cuerpo') {
        const n = Math.min(restante, buf.length);
        const parte = buf.subarray(0, n);
        if (destino) await destino.escribir(parte);
        else if (meta) { meta.partes.push(Buffer.from(parte)); meta.bytes += n; if (meta.bytes > 65_536) throw new Error('tar_nombre_largo'); }
        restante -= n;
        buf = buf.subarray(n);
        if (!restante) await terminarCuerpo();
        continue;
      }
      if (modo === 'relleno') {
        const n = Math.min(relleno, buf.length);
        relleno -= n;
        buf = buf.subarray(n);
        if (!relleno) modo = 'cabecera';
        continue;
      }
      if (buf.length < 512) break;
      const h = buf.subarray(0, 512);
      buf = buf.subarray(512);
      if (h.every(b => b === 0)) { if (++ceros >= 2) return; continue; }
      ceros = 0;
      // La suma de la cabecera (los 8 bytes de la suma cuentan como espacios).
      let suma = 0;
      for (let k = 0; k < 512; k++) suma += k >= 148 && k < 156 ? 32 : h[k];
      if (parseInt(texto(h, 148, 8).trim(), 8) !== suma) throw new Error('tar_cabecera');
      const tamano = parseInt(texto(h, 124, 12).trim() || '0', 8);
      if (!Number.isSafeInteger(tamano) || tamano < 0) throw new Error('tar_tamano');
      const tipo = String.fromCharCode(h[156] || 48);
      const prefijo = texto(h, 257, 5) === 'ustar' ? texto(h, 345, 155) : '';
      const nombre = nombreLargo ?? (prefijo ? `${prefijo}/${texto(h, 0, 100)}` : texto(h, 0, 100));
      restante = tamano;
      relleno = (512 - (tamano % 512)) % 512;
      if (tipo === 'x' || tipo === 'L') meta = { tipo, partes: [], bytes: 0 };
      else { nombreLargo = null; destino = tipo === '0' || tipo === '7' ? alEntrada(nombre, tamano) : null; }
      modo = 'cuerpo';
      if (!restante) await terminarCuerpo();
    }
  }
  if (modo === 'cuerpo' || destino) throw new Error('tar_cortado');
}

// Espacio libre en el disco de esa carpeta (bytes), o null si no se sabe.
async function espacioLibreDe(carpeta) {
  try { const s = await statfs(carpeta); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}

// El que baja, guarda y sirve los archivos de voz. config: la del servidor (carpetaDatos, o la carpeta de la base en
// las pruebas). Para las pruebas: manifiesto (otra lista), llamar (la puerta a la red), espacioLibre, reloj.
export function crearVoz({ config = {}, manifiesto = MANIFIESTO_VOZ, llamar = llamarProveedor, espacioLibre = espacioLibreDe, reloj = () => Date.now(), registro = null } = {}) {
  // La lista tiene que valer con los servidores de verdad (en las pruebas, también una con el servidor falso en 127.0.0.1).
  const problemas = (() => { const real = revisarManifiesto(manifiesto, { prueba: false }); return real.length && process.env.OPORTIA_TEST === '1' ? revisarManifiesto(manifiesto, { prueba: true }) : real; })();
  const raiz = config.carpetaVoz ?? join(config.carpetaDatos ?? dirname(config.archivoBase ?? join(process.cwd(), 'x')), 'oportia-voz');
  const carpeta = join(raiz, String(manifiesto?.id ?? 'x'));
  const archivos = problemas.length ? [] : manifiesto.archivos;
  const porRuta = new Map(archivos.map(a => [a.ruta, a]));
  const listos = new Set();
  const enCurso = new Map(); // ruta -> bytes ya escritos de la bajada en curso
  let revisado = null;
  let bajando = null;
  let fallo = problemas.length ? { motivo: 'lista_no_valida', cuando: Infinity } : null;
  const total = archivos.reduce((s, a) => s + a.bytes, 0);
  // Lo que baja el NAVEGADOR con cada modelo (la librería, el wasm y ese modelo): para el aviso «~102 MB».
  const bytesDe = {};
  for (const modelo of [manifiesto?.modelo, manifiesto?.modeloChico].filter(Boolean)) {
    bytesDe[modelo] = archivos.filter(a => !a.ruta.startsWith('modelos/') || a.ruta.startsWith(`modelos/${modelo}/`)).reduce((s, a) => s + a.bytes, 0);
  }
  const completa = ruta => join(carpeta, ...ruta.split('/'));
  const log = (...x) => { try { registro?.log?.(...x); } catch { /* nada */ } };

  // Al empezar: cuáles ya están en el disco (con su tamaño exacto; el sha256 se revisó antes de renombrarlos).
  const revisar = () => (revisado ??= (async () => {
    for (const a of archivos) {
      try { if ((await stat(completa(a.ruta))).size === a.bytes) listos.add(a.ruta); } catch { /* falta */ }
    }
  })());

  // Un destino para un archivo: escribe a «.parte» con su sha256; cerrar() → true si quedó bien (y ya renombrado
  // si renombrar), false si no (el .parte queda vacío).
  const destinoDe = (a, { renombrar = true } = {}) => {
    const final = completa(a.ruta);
    const parte = `${final}.parte`;
    const huella = createHash('sha256');
    let fh = null;
    let bytes = 0;
    let malo = false;
    enCurso.set(a.ruta, 0);
    const vaciar = async () => { try { await fh?.close(); } catch { /* ya cerrado */ } fh = null; try { await truncate(parte, 0); } catch { /* no existe */ } };
    return {
      async escribir(trozo) {
        if (malo) return;
        if (!fh) { await mkdir(dirname(final), { recursive: true }); fh = await open(parte, 'w', 0o640); }
        bytes += trozo.byteLength;
        if (bytes > a.bytes) { malo = true; return; }
        huella.update(trozo);
        let hecho = 0;
        while (hecho < trozo.byteLength) hecho += (await fh.write(trozo, hecho, trozo.byteLength - hecho)).bytesWritten;
        enCurso.set(a.ruta, bytes);
      },
      async cerrar() {
        enCurso.delete(a.ruta);
        const bien = !malo && bytes === a.bytes && huella.digest('hex') === a.sha256;
        if (!bien) { log('voz: archivo rechazado', a.ruta, bytes === a.bytes ? 'sha256 distinto' : `bytes ${bytes}/${a.bytes}`); await vaciar(); return false; }
        try { await fh?.close(); } catch { /* ya cerrado */ }
        fh = null;
        if (renombrar) { await rename(parte, final); listos.add(a.ruta); }
        return true;
      },
      async confirmar() { await rename(parte, final); listos.add(a.ruta); },
      vaciar: async () => { enCurso.delete(a.ruta); await vaciar(); },
    };
  };

  // GET siguiendo redirecciones solo a servidores permitidos. → { ok, motivo }
  const pedir = async (url, { alTrozo, alEmpezar, topeBytes }) => {
    let actual = url;
    const origen = new URL(url).hostname;
    for (let salto = 0; salto <= SALTOS; salto++) {
      if (!hostVozPermitido(actual, origen)) return { ok: false, motivo: salto ? 'redireccion_no_permitida' : 'destino_no_permitido' };
      const u = new URL(actual);
      const r = await llamar({ url: u.href, metodo: 'GET', cabeceras: { Accept: '*/*', 'Accept-Encoding': 'identity', 'User-Agent': 'oportia-voz' }, alTrozo, alEmpezar, topeBytes, timeoutMs: 900_000, permitido: u.hostname });
      if (r.red === 'redireccion') {
        if (!r.ubicacion) return { ok: false, motivo: 'redireccion_no_permitida' };
        try { actual = new URL(r.ubicacion, u).href; } catch { return { ok: false, motivo: 'redireccion_no_permitida' }; }
        continue;
      }
      if (r.rechazado) return { ok: false, motivo: 'destino_no_permitido' };
      if (r.status !== 200) return { ok: false, motivo: r.status ? `http_${r.status}` : r.tiempoAgotado ? 'tiempo' : 'sin_red' };
      if (r.cortado) return { ok: false, motivo: r.cortado };
      if (r.demasiado) return { ok: false, motivo: 'demasiado_grande' };
      if (r.error) return { ok: false, motivo: r.falloAlRecibir ? 'fallo_al_guardar' : 'sin_red' };
      return { ok: true };
    }
    return { ok: false, motivo: 'redireccion_no_permitida' };
  };

  // Un archivo directo desde su dirección.
  const bajarDirecto = async (a, url) => {
    const d = destinoDe(a);
    const r = await pedir(url, {
      topeBytes: a.bytes + 1,
      alEmpezar: ({ largo }) => (largo != null && largo !== a.bytes ? 'tamano_distinto' : null),
      alTrozo: trozo => d.escribir(trozo),
    });
    if (!r.ok) { await d.vaciar(); log('voz: no se pudo bajar', a.ruta, r.motivo); return false; }
    return d.cerrar();
  };

  // Varios archivos desde el .tgz de un paquete de npm: se baja una vez y se sacan los que hacen falta. Se renombran
  // solo si el paquete entero coincide con su «integridad» (sha512) y cada archivo con su sha256.
  const bajarPaquete = async (nombre, lista) => {
    const p = manifiesto.paquetes[nombre];
    const quiere = new Map(lista.map(a => [a.fuentes.find(f => f.paquete === nombre).dentro, a]));
    const destinos = new Map();
    const gunzip = createGunzip();
    const extractor = extraerTar(gunzip, (entrada, tamano) => {
      const a = quiere.get(entrada);
      if (!a || tamano !== a.bytes || destinos.has(a)) return null;
      const d = destinoDe(a, { renombrar: false });
      const r = { ...d, bien: false, async cerrar() { r.bien = await d.cerrar(); } };
      destinos.set(a, r);
      return r;
    });
    let errorExtractor = null;
    const finExtractor = extractor.then(() => null, e => { errorExtractor = e; return e; });
    const integridad = createHash('sha512');
    const r = await pedir(p.url, {
      topeBytes: p.bytes + 1,
      alEmpezar: ({ largo }) => (largo != null && largo !== p.bytes ? 'tamano_distinto' : null),
      alTrozo: async trozo => {
        if (errorExtractor) throw errorExtractor;
        integridad.update(trozo);
        if (!gunzip.write(trozo)) await Promise.race([once(gunzip, 'drain'), finExtractor]);
        if (errorExtractor) throw errorExtractor;
      },
    });
    if (r.ok) { gunzip.end(); await finExtractor; } else { gunzip.destroy(); await finExtractor; }
    const ok = r.ok && !errorExtractor && `sha512-${integridad.digest('base64')}` === p.integridad;
    if (!ok) log('voz: paquete rechazado', nombre, r.motivo ?? (errorExtractor ? 'tar' : 'integridad'));
    const hechos = [];
    for (const d of destinos.values()) {
      if (ok && d.bien) hechos.push(d); else await d.vaciar();
    }
    for (const d of hechos) await d.confirmar();
    return ok;
  };

  const bajarTodo = async () => {
    await mkdir(carpeta, { recursive: true });
    const faltan = () => archivos.filter(a => !listos.has(a.ruta));
    const libre = await espacioLibre(carpeta);
    const necesita = faltan().reduce((s, a) => s + a.bytes, 0) + MARGEN_DISCO;
    if (libre != null && libre < necesita) throw Object.assign(new Error('sin_espacio'), { motivo: 'sin_espacio' });
    const niveles = Math.max(0, ...archivos.map(a => a.fuentes.length));
    for (let k = 0; k < niveles && faltan().length; k++) {
      const paquetes = new Map();
      for (const a of faltan()) {
        const f = a.fuentes[k];
        if (!f) continue;
        if (f.url) await bajarDirecto(a, f.url);
        else paquetes.set(f.paquete, [...(paquetes.get(f.paquete) ?? []), a]);
      }
      for (const [nombre, lista] of paquetes) await bajarPaquete(nombre, lista);
    }
    if (faltan().length) throw Object.assign(new Error('no_se_pudo'), { motivo: 'no_se_pudo' });
    log('voz: archivos listos', manifiesto.id, total, 'bytes');
  };

  const preparar = async ({ forzar = false } = {}) => {
    await revisar();
    if (listos.size === archivos.length && archivos.length) return true;
    if (bajando) return bajando;
    if (fallo && !forzar && reloj() - fallo.cuando < ESPERA_TRAS_FALLO_MS) return false;
    if (problemas.length) return false;
    fallo = null;
    bajando = bajarTodo().then(() => true, e => { fallo = { motivo: e?.motivo ?? 'no_se_pudo', cuando: reloj() }; log('voz: falló la bajada', fallo.motivo); return false; })
      .finally(() => { bajando = null; });
    return bajando;
  };

  // Lo que ve la pantalla: «lista», «bajando» (con %), «falta» (todavía no empezó) o «no» (falló: usar otro dictado).
  const estado = async ({ empezar = true } = {}) => {
    await revisar();
    const listo = archivos.length > 0 && listos.size === archivos.length;
    // Si empieza ahora, se espera un instante para que ya diga «bajando».
    if (!listo && empezar) await Promise.race([preparar(), new Promise(ok => setImmediate(ok))]);
    let bytes = 0;
    for (const a of archivos) bytes += listos.has(a.ruta) ? a.bytes : (enCurso.get(a.ruta) ?? 0);
    const base = { modelo: manifiesto?.modelo ?? null, modeloChico: manifiesto?.modeloChico ?? null, base: `/voz/${manifiesto?.id}/`, bytes: total, bytesDe };
    if (listo) return { ...base, estado: 'lista', pct: 100 };
    if (bajando) return { ...base, estado: 'bajando', pct: total ? Math.min(99, Math.floor((bytes / total) * 100)) : 0 };
    if (fallo) return { ...base, estado: 'no', motivo: fallo.motivo };
    return { ...base, estado: 'falta', pct: 0 };
  };

  // Sirve /voz/<id>/<ruta> (true si era de aquí). Solo archivos de la lista y ya revisados; lo demás, 404.
  const servir = async (req, res, ruta) => {
    const prefijo = `/voz/${manifiesto?.id}/`;
    const no = codigo => { res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CABECERAS_SEGURIDAD }); res.end(codigo === 404 ? 'No existe' : 'No'); return true; };
    if (!ruta.startsWith(prefijo)) return no(404);
    const relativa = ruta.slice(prefijo.length);
    const a = porRuta.get(relativa);
    await revisar();
    if (!a || !listos.has(a.ruta)) return no(404);
    const archivo = completa(a.ruta);
    if (!normalize(archivo).startsWith(carpeta + sep)) return no(404);
    const etag = `"${a.sha256.slice(0, 32)}"`;
    const cabeceras = { 'Content-Type': tipoVoz(a.ruta), 'Cache-Control': UN_ANO, ETag: etag, ...CABECERAS_SEGURIDAD };
    if (String(req.headers['if-none-match'] ?? '').split(',').some(x => x.trim().replace(/^W\//, '') === etag)) { res.writeHead(304, cabeceras); res.end(); return true; }
    res.writeHead(200, { ...cabeceras, 'Content-Length': a.bytes });
    if (req.method === 'HEAD') { res.end(); return true; }
    const flujo = createReadStream(archivo);
    flujo.on('error', () => res.destroy());
    // Si el teléfono corta a la mitad (53 MB por la red del celular), el archivo se cierra enseguida.
    res.on?.('close', () => flujo.destroy());
    flujo.pipe(res);
    return true;
  };

  return { estado, preparar, servir, carpeta, total, problemas, id: manifiesto?.id };
}
