// Academia 0.14.83: Administrador → Avanzado → «Traspaso (para otro Claude)» (src/traspaso/boveda.js y
// src/traspaso/instrucciones.js). Todo es solo del administrador (401/403 para los demás).
//  - GET  /api/admin/traspaso            lo que NO es secreto (versión, repositorio, disco, memoria, última migración,
//                                         alumnos y cursos) y si hay bóveda. Nunca un dato de la bóveda.
//  - POST /api/admin/traspaso/abrir      { clave, anterior?, origen? } → { contenido, markdown, venceEn }.
//  - POST /api/admin/traspaso/guardar    { clave, contenido, origen? } → lo mismo, ya guardado.
//  - POST /api/admin/traspaso/empezar    { clave, origen? } → una bóveda vacía (la vieja queda guardada aparte).
//  - POST /api/admin/traspaso/repo       { repo } el enlace público del repositorio, si el servidor no lo sabe solo.
// La contraseña (la de entrar) se pide SIEMPRE, también desde la cuenta de Tailscale del dueño (nunca confirmar()).
// La pantalla la guarda solo en su memoria, como mucho 10 minutos (VENCE_MS), y la manda en cada pedido. Una mala:
// 401 'traspaso_clave_incorrecta', con el mismo freno de la contraseña de lo delicado (src/cuentas/confirmar.js: 5 sin
// espera, después 1, 2, 4… hasta 8 s, por cuenta y lugar) y su aviso de muchos intentos. Nada de esto se anota en la
// consola; la auditoría solo dice QUÉ pasó (abrir, guardar, fallar), nunca un valor.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { MIGRACIONES } from '../nucleo/migraciones.js';
import { medirSalud } from '../nucleo/salud.js';
import { verificarClave } from '../cuentas/claves.js';
import { auditar, buscarPorId } from '../cuentas/usuarios.js';
import { anotarFalloAdmin, crearLimitesConfirmar } from '../cuentas/confirmar.js';
import { leerAjuste, guardarAjuste } from '../academia/paquetes.js';
import { abrirBoveda, guardarBoveda, cambiarContrasenaBoveda, empezarDeNuevo, estadoBoveda, KDF_TRASPASO, LARGO_CONTRASENA } from '../traspaso/boveda.js';
import { markdownTraspaso } from '../traspaso/instrucciones.js';

export const VENCE_MS = 10 * 60 * 1000;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLAVE_REPO = 'traspaso.repo';
const ACTUALIZADOR = '/usr/local/bin/jarvis-actualizar';

// Un enlace de GitHub limpio (https://github.com/dueño/repo), sin usuario ni token, o null.
export function repoLimpio(texto) {
  const s = String(texto ?? '').trim();
  let m = /^git@github\.com:([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/.exec(s);
  if (!m) {
    try {
      const u = new URL(s);
      if (!['https:', 'http:', 'ssh:', 'git:'].includes(u.protocol) || u.hostname !== 'github.com') return null;
      m = /^\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/.exec(u.pathname);
    } catch { m = null; }
  }
  if (!m) m = /^([A-Za-z0-9_-][A-Za-z0-9_.-]{0,99})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?$/.exec(s);
  if (!m || m[1].startsWith('.') || m[2].startsWith('.')) return null;
  return `https://github.com/${m[1]}/${m[2]}`;
}

function leerTexto(ruta, tope = 64 * 1024) {
  try {
    if (!existsSync(ruta) || statSync(ruta).size > tope) return null;
    return readFileSync(ruta, 'utf8');
  } catch { return null; }
}

// El repositorio, sin preguntarle a nadie: el «origin» de .git/config (también en un worktree, donde .git es un
// archivo), el campo repository de package.json, o el REPO del actualizador del servidor. Solo GitHub; sin token.
export function repoDelServidor(raiz = RAIZ, actualizador = ACTUALIZADOR) {
  const configs = [];
  const git = join(raiz, '.git');
  if (existsSync(git)) {
    try {
      if (statSync(git).isDirectory()) configs.push(join(git, 'config'));
      else {
        const gitdir = /^gitdir:\s*(.+)$/m.exec(leerTexto(git, 4096) ?? '')?.[1]?.trim();
        if (gitdir) {
          const dir = resolve(raiz, gitdir);
          const comun = leerTexto(join(dir, 'commondir'), 4096)?.trim();
          configs.push(join(comun ? resolve(dir, comun) : dir, 'config'));
        }
      }
    } catch { /* sin git */ }
  }
  for (const ruta of configs) {
    const texto = leerTexto(ruta) ?? '';
    const seccion = /\[remote "origin"\]([\s\S]*?)(?:\n\[|$)/.exec(texto)?.[1] ?? '';
    const url = repoLimpio(/^\s*url\s*=\s*(.+)$/m.exec(seccion)?.[1]);
    if (url) return url;
  }
  try {
    const p = JSON.parse(leerTexto(join(raiz, 'package.json')) ?? '{}');
    const url = repoLimpio(typeof p.repository === 'string' ? p.repository : p.repository?.url);
    if (url) return url;
  } catch { /* sin package.json */ }
  if (actualizador) {
    const m = /^REPO="([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"$/m.exec(leerTexto(actualizador) ?? '');
    const url = repoLimpio(m?.[1]);
    if (url) return url;
  }
  return null;
}

// La dirección de la app tal como la ve el navegador (location.origin): solo http(s), sin usuario ni ruta.
function origenLimpio(texto) {
  try {
    const u = new URL(String(texto ?? ''));
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    return u.origin;
  } catch { return null; }
}

export function registrarRutasTraspaso(rutas, { config = null, version = null, limites = null, kdf = KDF_TRASPASO, repo = repoDelServidor, medir = null, reloj = Date.now } = {}) {
  const topes = limites ?? crearLimitesConfirmar();
  const carpetaDatos = config?.carpetaDatos ?? (config?.archivoBase ? dirname(config.archivoBase) : null);
  const salud = medir ?? (() => medirSalud({ carpetaDatos, archivoBase: config?.archivoBase ?? null }));

  function info(db) {
    let m = {};
    try { m = salud() ?? {}; } catch { m = {}; }
    let detectado = null;
    try { detectado = repo(); } catch { detectado = null; }
    const guardado = repoLimpio(leerAjuste(db, CLAVE_REPO));
    const alumnos = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol <> 'admin' AND eliminado_en IS NULL").get().n;
    let cursos = null;
    try { cursos = db.prepare('SELECT COUNT(*) AS n FROM academia_cursos WHERE archivado_en IS NULL').get().n; } catch { cursos = null; }
    return {
      version,
      repo: detectado ?? guardado ?? null,
      repoDetectado: Boolean(detectado),
      migracion: Math.max(...MIGRACIONES.map(x => x.id)),
      alumnos,
      cursos,
      disco: { libreMb: m.disco?.libreMb ?? null, totalMb: m.disco?.totalMb ?? null },
      memoria: { libreMb: m.memoria?.disponibleMb ?? null, totalMb: m.memoria?.totalMb ?? null },
    };
  }

  const textoDe = (datos, campo) => (typeof datos?.[campo] === 'string' ? datos[campo] : '');

  // La contraseña de entrar de ESTE administrador, siempre (también desde Tailscale). 401 si no es.
  async function revisarClave(db, usuario, cliente, clave) {
    if (!clave || clave.length > LARGO_CONTRASENA) throw new ErrorHttp(400, 'traspaso_falta_clave');
    const llave = `${usuario.id}|${cliente}`;
    await topes.freno.esperarTurno(llave);
    const fila = buscarPorId(db, usuario.id);
    if (!(await verificarClave(clave, fila?.clave_hash))) {
      auditar(db, { usuarioId: usuario.id, accion: 'traspaso_clave_fallida' });
      anotarFalloAdmin(db, topes.alerta, usuario);
      throw new ErrorHttp(401, 'traspaso_clave_incorrecta');
    }
    topes.freno.olvidar(llave);
  }

  const respuesta = (db, r, datos) => {
    const i = { ...info(db), origen: origenLimpio(datos?.origen) };
    return { codigo: 200, datos: { contenido: r.contenido, en: r.en, markdown: markdownTraspaso(i, r.contenido), venceEn: reloj() + VENCE_MS, info: i } };
  };

  rutas.agregar('GET', '/api/admin/traspaso', ({ db, usuario }) => {
    const e = estadoBoveda(db, usuario.id);
    return { codigo: 200, datos: { info: info(db), boveda: e, venceMs: VENCE_MS } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/traspaso/abrir', async ({ db, req, usuario, cliente }) => {
    const datos = await leerJson(req);
    const clave = textoDe(datos, 'clave');
    await revisarClave(db, usuario, cliente, clave);
    const anterior = textoDe(datos, 'anterior');
    let r;
    if (anterior) {
      if (anterior.length > LARGO_CONTRASENA) throw new ErrorHttp(400, 'traspaso_falta_clave');
      const llave = `${usuario.id}|${cliente}`;
      await topes.freno.esperarTurno(llave);
      try {
        r = await cambiarContrasenaBoveda(db, usuario.id, anterior, clave, { kdf, ahora: reloj() });
      } catch (error) {
        if (error instanceof ErrorHttp && error.codigo === 401) {
          auditar(db, { usuarioId: usuario.id, accion: 'traspaso_clave_fallida' });
          anotarFalloAdmin(db, topes.alerta, usuario);
        }
        throw error;
      }
      topes.freno.olvidar(llave);
      auditar(db, { usuarioId: usuario.id, accion: 'traspaso_clave_cambiada' });
    } else {
      r = await abrirBoveda(db, usuario.id, clave, { kdf, ahora: reloj() });
    }
    auditar(db, { usuarioId: usuario.id, accion: 'traspaso_abierto' });
    return respuesta(db, r, datos);
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/traspaso/guardar', async ({ db, req, usuario, cliente }) => {
    const datos = await leerJson(req, 400 * 1024);
    const clave = textoDe(datos, 'clave');
    await revisarClave(db, usuario, cliente, clave);
    const r = await guardarBoveda(db, usuario.id, clave, datos?.contenido, { kdf, ahora: reloj() });
    auditar(db, { usuarioId: usuario.id, accion: 'traspaso_guardado' });
    return respuesta(db, r, datos);
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/traspaso/empezar', async ({ db, req, usuario, cliente }) => {
    const datos = await leerJson(req);
    const clave = textoDe(datos, 'clave');
    await revisarClave(db, usuario, cliente, clave);
    const r = await empezarDeNuevo(db, usuario.id, clave, { kdf, ahora: reloj() });
    auditar(db, { usuarioId: usuario.id, accion: 'traspaso_de_nuevo' });
    return respuesta(db, r, datos);
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/traspaso/repo', async ({ db, req }) => {
    const datos = await leerJson(req);
    const texto = textoDe(datos, 'repo').trim();
    const url = texto ? repoLimpio(texto) : '';
    if (url == null) throw new ErrorHttp(400, 'traspaso_repo_no_valido');
    guardarAjuste(db, CLAVE_REPO, url);
    return { codigo: 200, datos: { info: info(db) } };
  }, { admin: true });
}
