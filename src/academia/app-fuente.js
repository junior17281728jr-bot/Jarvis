// 0.14.8: «Claude mejora la app». La COPIA de trabajo del código: la versión de `main` en GitHub (la única fuente: el
// actualizador del servidor instala lo mismo), bajada como .tar.gz y abierta aquí mismo (sin encender programas: el
// trabajador nunca enciende procesos). Vive en la carpeta temporal del servicio (se vacía sola al reiniciar), nunca en
// los datos; en modo de prueba, dentro de la carpeta de datos de la prueba. Nunca se borra nada: cada versión en su
// carpeta (arbol-<sha>), y una prueba deja los archivos como estaban.
// También arma lo que Claude ve de UNA pantalla: sus archivos (cortados), las reglas de CSS de sus clases y sus textos.
import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { motivoRuta, I18N } from './app-parche.js';

export const LIMITES_FUENTE = Object.freeze({ tgzBytes: 40 * 1024 * 1024, arbolBytes: 80 * 1024 * 1024, archivos: 6_000, archivoBytes: 8 * 1024 * 1024 });
export const SHA = /^[0-9a-f]{40}$/;

export function carpetaApp(config) {
  if (config?.carpetaAppMejora) return config.carpetaAppMejora;
  return config?.modoPrueba ? join(config.carpetaDatos, 'app-mejora') : join(tmpdir(), 'oportia-app-mejora');
}
export const carpetaArbol = (config, sha) => join(carpetaApp(config), `arbol-${String(sha).slice(0, 40)}`);
export const archivoTgz = (config, sha) => join(carpetaApp(config), `fuente-${String(sha).slice(0, 40)}.tgz`);

// Un .tar.gz de GitHub (codeload) → archivos en «destino», sin la primera carpeta (repo-<sha>/). Solo archivos y carpetas
// comunes (nunca enlaces), sin «..» ni rutas absolutas, con topes. → { ok, archivos, bytes, motivo? }
export function abrirTgz(tgz, destino) {
  let tar;
  try { tar = gunzipSync(tgz, { maxOutputLength: LIMITES_FUENTE.arbolBytes }); } catch { return { ok: false, motivo: 'fuente_rota' }; }
  const raiz = resolve(destino);
  mkdirSync(raiz, { recursive: true });
  let pos = 0;
  let largo = null;
  let paxRuta = null;
  let n = 0;
  let bytes = 0;
  const texto = (b, i, l) => b.subarray(i, i + l).toString('utf8').replace(/\0.*$/s, '');
  while (pos + 512 <= tar.length) {
    const h = tar.subarray(pos, pos + 512);
    if (h.every(x => x === 0)) break;
    const tam = parseInt(texto(h, 124, 12).trim() || '0', 8);
    if (!Number.isSafeInteger(tam) || tam < 0) return { ok: false, motivo: 'fuente_rota' };
    const tipo = String.fromCharCode(h[156] || 48);
    const datos = tar.subarray(pos + 512, pos + 512 + tam);
    pos += 512 + Math.ceil(tam / 512) * 512;
    if (tipo === 'g') continue;
    if (tipo === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(datos.toString('utf8'));
      paxRuta = m ? m[1] : null;
      continue;
    }
    if (tipo === 'L') { largo = datos.toString('utf8').replace(/\0.*$/s, ''); continue; }
    const prefijo = texto(h, 345, 155);
    const nombre = paxRuta ?? largo ?? (prefijo ? `${prefijo}/${texto(h, 0, 100)}` : texto(h, 0, 100));
    paxRuta = null;
    largo = null;
    const partes = nombre.split('/').slice(1).filter(Boolean);
    if (!partes.length) continue;
    if (partes.some(p => p === '..' || p === '.' || p.includes('\\') || p.includes('\0'))) return { ok: false, motivo: 'fuente_rara' };
    const ruta = resolve(raiz, ...partes);
    if (!ruta.startsWith(raiz + sep)) return { ok: false, motivo: 'fuente_rara' };
    if (tipo === '5') { mkdirSync(ruta, { recursive: true }); continue; }
    if (tipo !== '0' && tipo !== '7') continue; // enlaces y otras cosas: no
    if (++n > LIMITES_FUENTE.archivos || tam > LIMITES_FUENTE.archivoBytes) return { ok: false, motivo: 'fuente_grande' };
    bytes += tam;
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, datos);
  }
  if (!n) return { ok: false, motivo: 'fuente_rota' };
  for (const imprescindible of ['package.json', 'public/index.html', ...I18N]) if (!existsSync(join(raiz, imprescindible))) return { ok: false, motivo: 'fuente_incompleta' };
  return { ok: true, archivos: n, bytes };
}

// Lee un archivo de la copia (solo una ruta que se puede tocar o un archivo de idioma, y solo dentro de la copia). → texto o null.
export function lectorDeArbol(arbol) {
  const raiz = resolve(arbol);
  return archivo => {
    const r = String(archivo ?? '');
    if (motivoRuta(r) && !I18N.includes(r)) return null;
    const ruta = resolve(raiz, r);
    if (!ruta.startsWith(raiz + sep)) return null;
    try {
      if (!statSync(ruta).isFile() || !realpathSync(ruta).startsWith(realpathSync(raiz) + sep)) return null;
      return readFileSync(ruta, 'utf8');
    } catch { return null; }
  };
}

// ---------- Las pantallas que Claude revisa, una por una (primero la app del alumno, después el administrador) ----------
// archivos: los de la pantalla; funciones: las de public/app.js que la dibujan (se manda solo ese pedazo).
export const PANTALLAS = Object.freeze([
  { id: 'inicio', nombre: 'la pantalla de inicio (el Camino)', archivos: ['public/camino-plegable.js'], funciones: ['pantallaInicio'] },
  { id: 'tema', nombre: 'una clase (las tarjetas)', archivos: ['public/tarjetas.js'], funciones: ['pantallaTema'] },
  { id: 'practica', nombre: 'la práctica de preguntas', archivos: ['public/respuesta-vista.js'], funciones: ['pantallaPractica'] },
  { id: 'examen', nombre: 'el examen', archivos: ['public/examen-vista.js'], funciones: ['pantallaExamen'] },
  { id: 'repaso', nombre: '«Mi repaso»', archivos: ['public/mi-repaso-vista.js'], funciones: ['pantallaMiRepaso'] },
  { id: 'repaso_final', nombre: 'el repaso final', archivos: ['public/repaso-final-vista.js'], funciones: [] },
  { id: 'oral', nombre: 'el examen oral', archivos: ['public/oral-vista.js'], funciones: [] },
  { id: 'progreso', nombre: 'el progreso del alumno', archivos: ['public/progreso-vista.js'], funciones: ['pantallaProgreso'] },
  { id: 'profesor', nombre: 'el Profesor virtual', archivos: ['public/tutor-vista.js'], funciones: ['pantallaProfesor'] },
  { id: 'perfil', nombre: 'el perfil y los datos del alumno', archivos: ['public/perfil-vista.js'], funciones: ['pantallaMisDatos'] },
  { id: 'ayuda', nombre: 'la ayuda', archivos: ['public/guia.js'], funciones: ['pantallaMiAyuda'] },
  { id: 'admin_inicio', nombre: 'el inicio del administrador', archivos: [], funciones: ['pantallaAdmin'] },
  { id: 'admin_alumnos', nombre: 'los alumnos (administrador)', archivos: ['public/reporte-vista.js'], funciones: ['pantallaAlumnos', 'pantallaComoVan'] },
  { id: 'admin_contenido', nombre: 'el contenido y la fábrica (administrador)', archivos: ['public/fabrica-vista.js'], funciones: ['pantallaContenido'] },
  { id: 'admin_ia', nombre: 'la IA y Claude (administrador)', archivos: ['public/ia-vista.js', 'public/claude-vista.js'], funciones: [] },
  { id: 'admin_ia_trabajo', nombre: '«Lo que hizo la IA» y «Pídele a la IA»', archivos: ['public/ia-trabajo-vista.js'], funciones: [] },
  { id: 'admin_copias', nombre: 'las copias (administrador)', archivos: ['public/copias-vista.js'], funciones: [] },
  { id: 'admin_soporte', nombre: 'el soporte', archivos: ['public/soporte-vista.js'], funciones: [] },
  { id: 'admin_config', nombre: 'la configuración', archivos: [], funciones: ['pantallaConfiguracion'] },
]);
export const pantallaDe = id => PANTALLAS.find(p => p.id === id) ?? null;
// Lo que cabe en UNA llamada (28 000 bytes con las reglas y el formato; el JSON escapa comillas y saltos de línea).
export const CONTEXTO = Object.freeze({ total: 19_000, archivo: 9_000, funcion: 7_000, css: 4_000, textos: 2_500 });
const CSS_ARCHIVOS = ['public/estilos.css', 'public/interfaz.css', 'public/academia.css', 'public/alumnos.css', 'public/instructor.css'];

// El pedazo de public/app.js de una función (desde «function nombre» hasta la próxima función de primer nivel).
export function pedazoDeFuncion(app, nombre) {
  const re = new RegExp(`^(?:async )?function ${nombre}\\b`, 'm');
  const m = re.exec(app);
  if (!m) return null;
  const resto = app.slice(m.index + 1);
  const fin = resto.search(/\n(?:async )?function /);
  return app.slice(m.index, fin < 0 ? app.length : m.index + 1 + fin + 1);
}
// Las reglas de CSS de primer nivel (sin @media) cuyo selector nombra alguna de las clases.
export function reglasDeClases(css, clases, maxBytes) {
  const out = [];
  let total = 0;
  const reglas = [];
  let nivel = 0;
  let desde = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') { if (nivel === 0) reglas.push({ desde }); nivel++; }
    else if (css[i] === '}') { nivel--; if (nivel === 0) { reglas.at(-1).hasta = i + 1; desde = i + 1; } if (nivel < 0) return ''; }
  }
  for (const r of reglas) {
    if (r.hasta == null) continue;
    const bloque = css.slice(r.desde, r.hasta).replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*/, '').trim();
    if (bloque.startsWith('@')) continue;
    const selector = bloque.slice(0, bloque.indexOf('{'));
    if (![...clases].some(c => new RegExp(`\\.${c.replace(/[^a-z0-9_-]/gi, '')}(?![a-z0-9_-])`, 'i').test(selector))) continue;
    if (total + bloque.length + 1 > maxBytes) break;
    out.push(bloque);
    total += bloque.length + 1;
  }
  return out.join('\n');
}
const clasesDe = js => new Set([...js.matchAll(/class(?:Name)?:\s*['"`]([^'"`$]{1,200})['"`]|classList\.(?:add|toggle)\(\s*['"]([a-z0-9_-]{1,60})['"]/gi)]
  .flatMap(m => String(m[1] ?? m[2]).split(/\s+/)).filter(c => /^[a-z][a-z0-9_-]{1,60}$/i.test(c)));
const clavesDe = js => new Set([...js.matchAll(/\bt(?:Si)?\(\s*['"]([a-z0-9_.]{3,80})['"]/g)].map(m => m[1]));
const cortar = (t, n) => (Buffer.byteLength(t) <= n ? t : `${Buffer.from(t).subarray(0, n).toString('utf8').replace(/�$/, '')}\n/* … (el resto del archivo no se muestra) */`);

// Lo que Claude ve de una pantalla: { archivos: [{ archivo, texto, completo }], css: [{ archivo, reglas }], textos: { clave: es } }.
export function contextoDePantalla(leer, pantalla, { limites = CONTEXTO } = {}) {
  const archivos = [];
  let usado = 0;
  const poner = (archivo, texto, completo) => {
    const t = cortar(texto, Math.min(limites.archivo, limites.total - usado - limites.css - limites.textos));
    if (!t.trim() || Buffer.byteLength(t) > limites.total - usado) return;
    usado += Buffer.byteLength(t);
    archivos.push({ archivo, texto: t, completo: completo && t === texto });
  };
  for (const a of pantalla.archivos ?? []) { const t = leer(a); if (t != null) poner(a, t, true); }
  const app = (pantalla.funciones ?? []).length ? leer('public/app.js') : null;
  for (const f of pantalla.funciones ?? []) {
    const p = app && pedazoDeFuncion(app, f);
    if (p) poner('public/app.js', cortar(p, limites.funcion), false);
  }
  const js = archivos.map(x => x.texto).join('\n');
  const clases = clasesDe(js);
  const css = [];
  let resta = limites.css;
  for (const archivo of CSS_ARCHIVOS) {
    const t = leer(archivo);
    if (t == null || resta < 200) continue;
    const reglas = reglasDeClases(t, clases, resta);
    if (reglas) { css.push({ archivo, reglas }); resta -= Buffer.byteLength(reglas); }
  }
  const textos = {};
  let rt = limites.textos;
  try {
    const es = JSON.parse(leer(I18N[0]) ?? '{}');
    for (const k of clavesDe(js)) {
      if (!Object.hasOwn(es, k)) continue;
      const n = Buffer.byteLength(k) + Buffer.byteLength(String(es[k])) + 6;
      if (n > rt) break;
      textos[k] = es[k];
      rt -= n;
    }
  } catch { /* sin textos */ }
  return { archivos, css, textos };
}
// La lista de pantallas y archivos (para que Claude elija dónde va un pedido del dueño).
export function mapaDeLaApp(leer) {
  return PANTALLAS.map(p => ({ id: p.id, nombre: p.nombre, archivos: [...p.archivos, ...(p.funciones.length ? ['public/app.js'] : [])].filter(a => leer(a) != null) }));
}
