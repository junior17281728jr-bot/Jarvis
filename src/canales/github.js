// 0.14.8: el adaptador de GitHub de «Claude mejora la app». El ÚNICO archivo que nombra los servidores de GitHub.
//  - Toda llamada pasa por la única puerta a la red (src/ia/llamar.js): nunca sigue redirecciones, corta por tiempo y por
//    tamaño. Nada de lo que devuelve lleva el token, la dirección pedida ni el texto que mandó GitHub: solo un motivo y
//    datos seguros (un sha, un número).
//  - El token (uno «fine-grained» que el dueño pega en Administrador → Claves: SOLO este repositorio, permiso «Contents:
//    Read and write») se lee con conCredencial (src/canales/credencial.js) y vive solo dentro de cada llamada.
//  - Subir un cambio = API de datos de Git, sin git ni procesos: un árbol nuevo sobre el de `main`, un commit cuyo padre es
//    `main`, la rama claude-app/<id>, y después `main` avanza SOLO si sigue donde estaba (force: false; GitHub responde 422 si
//    alguien la movió → «conflicto»). Deshacer = OTRO commit hacia adelante con el árbol de antes (nunca se fuerza nada).
//  - Bajar la fuente (codeload, público): no usa el token.
//  - Las direcciones base solo cambian en modo de prueba (config.canalesBases, 127.0.0.1).
import { openSync, writeSync, closeSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { llamarProveedor } from '../ia/llamar.js';
import { conCredencial } from './credencial.js';

export const HOST_API = 'api.github.com';
export const HOST_DESCARGA = 'codeload.github.com';
export const REPO_POR_DEFECTO = 'junior17281728jr-bot/jarvis';
export const REPO = /^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
export const TOKEN_GITHUB = /^github_pat_[A-Za-z0-9_]{40,255}$/;
const SHA = /^[0-9a-f]{40}$/;
const RAMA = /^claude-app\/[a-z0-9]{6,24}$/;
const prueba = () => process.env.OPORTIA_TEST === '1';
const baseApi = config => (prueba() && config?.canalesBases?.github ? config.canalesBases.github : `https://${HOST_API}`);
const baseDescarga = config => (prueba() && config?.canalesBases?.github_descarga ? config.canalesBases.github_descarga : `https://${HOST_DESCARGA}`);
const sha = v => (typeof v === 'string' && SHA.test(v) ? v : null);

function motivoDe(salida) {
  if (salida.rechazado) return 'rechazado';
  if (salida.abortado) return 'cancelado';
  if (salida.tiempoAgotado) return 'tiempo_agotado';
  if (salida.red === 'redireccion') return 'respuesta_no_valida';
  if (salida.red) return 'sin_red';
  const s = salida.status;
  if (s >= 200 && s <= 299) return salida.demasiado || salida.profundo ? 'respuesta_no_valida' : 'ok';
  if (s === 401) return 'token_no_valido';
  if (s === 403 || s === 404) return 'token_sin_permiso';
  if (s === 409 || s === 422) return 'conflicto';
  if (s === 429) return 'limite_github';
  return 'error_github';
}

async function pedir(config, cred, { metodo = 'GET', ruta, cuerpo = null, senal = null }) {
  const cabeceras = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'academia-app' };
  if (cred) {
    const t = cred.token;
    if (typeof t !== 'string' || !TOKEN_GITHUB.test(t)) return { motivo: 'token_no_valido' };
    cabeceras.authorization = `Bearer ${t}`;
  }
  if (cuerpo) cabeceras['content-type'] = 'application/json';
  const salida = await llamarProveedor({ url: `${baseApi(config)}${ruta}`, metodo, cabeceras, cuerpo, senal, timeoutMs: 30_000, topeBytes: 1_048_576, permitido: HOST_API });
  const motivo = motivoDe(salida);
  return { motivo, json: motivo === 'ok' ? salida.json : null };
}
const r = repo => (REPO.test(String(repo)) ? String(repo) : null);

// El sha de main (sin token: el repositorio es público; con token si lo hay). → { motivo, sha? }
export async function shaDeMain(db, config, { repo, senal = null }) {
  if (!r(repo)) return { motivo: 'repo_no_valido' };
  const leer = async cred => {
    const x = await pedir(config, cred, { ruta: `/repos/${repo}/git/ref/heads/main`, senal });
    return x.motivo === 'ok' ? (sha(x.json?.object?.sha) ? { motivo: 'ok', sha: x.json.object.sha } : { motivo: 'respuesta_no_valida' }) : { motivo: x.motivo };
  };
  const conToken = await conCredencial(db, config, { uso: 'github_token', tipo: 'github' }, leer);
  return conToken.motivo === 'sin_clave' || conToken.motivo === 'clave_no_valida' ? leer(null) : conToken;
}

// Baja la fuente de ese commit (.tar.gz) a «archivo», por pedazos. → { motivo, bytes? }
export async function bajarFuente(config, { repo, commit, archivo, senal = null, topeBytes = 40 * 1024 * 1024 }) {
  if (!r(repo) || !sha(commit)) return { motivo: 'repo_no_valido' };
  mkdirSync(dirname(archivo), { recursive: true });
  const fd = openSync(archivo, 'w');
  try {
    const salida = await llamarProveedor({
      url: `${baseDescarga(config)}/${repo}/tar.gz/${commit}`, metodo: 'GET', cabeceras: { 'user-agent': 'academia-app' }, senal, timeoutMs: 300_000, topeBytes,
      permitido: HOST_DESCARGA, alTrozo: async trozo => { writeSync(fd, trozo); },
    });
    if (salida.falloAlRecibir) return { motivo: 'error_local' };
    const motivo = motivoDe(salida);
    return motivo === 'ok' ? { motivo, bytes: salida.bytes } : { motivo };
  } finally { closeSync(fd); }
}

// ¿Hay un token guardado? (sin usarlo en la red) → true/false
export async function hayToken(db, config) {
  const x = await conCredencial(db, config, { uso: 'github_token', tipo: 'github' }, async cred => ({ motivo: TOKEN_GITHUB.test(cred.token ?? '') ? 'ok' : 'token_no_valido' }));
  return x.motivo === 'ok';
}

// Sube el cambio. archivos: [{ archivo, despues }] (ya revisados). marca: un texto que va en el mensaje del commit (para
// reconocerlo después de un corte). → { motivo: 'ok', commit, rama } · { motivo: 'conflicto' } · { motivo: <otro> }
export async function subirCambio(db, config, { repo, base, archivos, mensaje, rama, marca, senal = null }) {
  if (!r(repo) || !sha(base) || !RAMA.test(String(rama)) || !archivos?.length) return { motivo: 'pedido_no_valido' };
  return conCredencial(db, config, { uso: 'github_token', tipo: 'github' }, async cred => {
    const main = await pedir(config, cred, { ruta: `/repos/${repo}/git/ref/heads/main`, senal });
    if (main.motivo !== 'ok') return { motivo: main.motivo };
    const actual = sha(main.json?.object?.sha);
    if (!actual) return { motivo: 'respuesta_no_valida' };
    if (actual !== base) {
      // ¿Ya es el nuestro? (se subió y se cortó antes de anotarlo)
      const c = await pedir(config, cred, { ruta: `/repos/${repo}/git/commits/${actual}`, senal });
      if (c.motivo === 'ok' && typeof c.json?.message === 'string' && c.json.message.includes(marca)) return { motivo: 'ok', commit: actual, rama, yaEstaba: true };
      return { motivo: 'conflicto', main: actual };
    }
    const cb = await pedir(config, cred, { ruta: `/repos/${repo}/git/commits/${base}`, senal });
    const arbolBase = sha(cb.json?.tree?.sha);
    if (cb.motivo !== 'ok' || !arbolBase) return { motivo: cb.motivo === 'ok' ? 'respuesta_no_valida' : cb.motivo };
    const arbol = await pedir(config, cred, { metodo: 'POST', ruta: `/repos/${repo}/git/trees`, senal,
      cuerpo: { base_tree: arbolBase, tree: archivos.map(a => ({ path: a.archivo, mode: '100644', type: 'blob', content: a.despues })) } });
    const arbolNuevo = sha(arbol.json?.sha);
    if (arbol.motivo !== 'ok' || !arbolNuevo) return { motivo: arbol.motivo === 'ok' ? 'respuesta_no_valida' : arbol.motivo };
    const commit = await pedir(config, cred, { metodo: 'POST', ruta: `/repos/${repo}/git/commits`, senal, cuerpo: { message: `${mensaje}\n\n${marca}`, tree: arbolNuevo, parents: [base] } });
    const nuevo = sha(commit.json?.sha);
    if (commit.motivo !== 'ok' || !nuevo) return { motivo: commit.motivo === 'ok' ? 'respuesta_no_valida' : commit.motivo };
    const ref = await pedir(config, cred, { metodo: 'POST', ruta: `/repos/${repo}/git/refs`, senal, cuerpo: { ref: `refs/heads/${rama}`, sha: nuevo } });
    if (ref.motivo !== 'ok' && ref.motivo !== 'conflicto') return { motivo: ref.motivo };
    const avanzar = await pedir(config, cred, { metodo: 'PATCH', ruta: `/repos/${repo}/git/refs/heads/main`, senal, cuerpo: { sha: nuevo, force: false } });
    if (avanzar.motivo !== 'ok') return { motivo: avanzar.motivo, commit: nuevo };
    return { motivo: 'ok', commit: nuevo, rama };
  });
}

// Deshace «commit» con un commit NUEVO encima que vuelve al árbol de su padre, solo si main sigue en «commit».
// → { motivo: 'ok', commit } · { motivo: 'conflicto' } · otro
export async function deshacerCambio(db, config, { repo, commit, mensaje, marca, senal = null }) {
  if (!r(repo) || !sha(commit)) return { motivo: 'pedido_no_valido' };
  return conCredencial(db, config, { uso: 'github_token', tipo: 'github' }, async cred => {
    const main = await pedir(config, cred, { ruta: `/repos/${repo}/git/ref/heads/main`, senal });
    if (main.motivo !== 'ok') return { motivo: main.motivo };
    const actual = sha(main.json?.object?.sha);
    if (actual !== commit) {
      const c = actual ? await pedir(config, cred, { ruta: `/repos/${repo}/git/commits/${actual}`, senal }) : null;
      if (c?.motivo === 'ok' && typeof c.json?.message === 'string' && c.json.message.includes(marca)) return { motivo: 'ok', commit: actual, yaEstaba: true };
      return { motivo: 'conflicto' };
    }
    const c = await pedir(config, cred, { ruta: `/repos/${repo}/git/commits/${commit}`, senal });
    const padre = sha(c.json?.parents?.[0]?.sha);
    if (c.motivo !== 'ok' || !padre) return { motivo: c.motivo === 'ok' ? 'respuesta_no_valida' : c.motivo };
    const p = await pedir(config, cred, { ruta: `/repos/${repo}/git/commits/${padre}`, senal });
    const arbol = sha(p.json?.tree?.sha);
    if (p.motivo !== 'ok' || !arbol) return { motivo: p.motivo === 'ok' ? 'respuesta_no_valida' : p.motivo };
    const nuevo = await pedir(config, cred, { metodo: 'POST', ruta: `/repos/${repo}/git/commits`, senal, cuerpo: { message: `${mensaje}\n\n${marca}`, tree: arbol, parents: [commit] } });
    const id = sha(nuevo.json?.sha);
    if (nuevo.motivo !== 'ok' || !id) return { motivo: nuevo.motivo === 'ok' ? 'respuesta_no_valida' : nuevo.motivo };
    const avanzar = await pedir(config, cred, { metodo: 'PATCH', ruta: `/repos/${repo}/git/refs/heads/main`, senal, cuerpo: { sha: id, force: false } });
    return avanzar.motivo === 'ok' ? { motivo: 'ok', commit: id } : { motivo: avanzar.motivo };
  });
}

// La prueba GRATIS del token (Administrador → Claves): lee el repositorio con ese token. → un motivo de MOTIVOS.
export async function probarTokenGithub(valor, { db, config, senal = null } = {}) {
  if (typeof valor !== 'string' || !TOKEN_GITHUB.test(valor)) return 'clave_no_valida';
  let repo = REPO_POR_DEFECTO;
  try { const v = JSON.parse(db?.prepare("SELECT valor FROM ajustes WHERE clave = 'ia.app.config'").get()?.valor ?? '{}'); if (REPO.test(String(v.repo ?? ''))) repo = v.repo; } catch { /* el de siempre */ }
  const cred = { token: valor };
  const x = await pedir(config, cred, { ruta: `/repos/${repo}`, senal });
  return { ok: 'ok', token_no_valido: 'clave_no_valida', token_sin_permiso: 'sin_permiso', sin_red: 'sin_red', tiempo_agotado: 'tiempo_agotado' }[x.motivo] ?? 'error_proveedor';
}
