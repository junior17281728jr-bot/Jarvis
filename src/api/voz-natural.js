// 0.14.70: las rutas de la voz natural (src/academia/voz-natural.js). Las registra src/api/oral-vivo.js (comparten el
// estado de la IA del alumno, los topes de pedidos y la fila). Este archivo NUNCA llama a la red: pone en la fila la tarea
// 'academia.instructor' (uso 'lectura_voz') o 'academia.voces' («Preparar todas las voces»).
//  Alumno:
//   GET  /api/academia/lectura                 { voz (su «Con voz / Sin voz»), natural (hay ElevenLabs o ChatGPT) }
//   POST /api/academia/lectura/preferencia     { voz: true|false }
//   POST /api/academia/lectura/voz             { textos: [≤ 12 textos] } → { partes: [{ estado, archivos? }] }
//     Cada texto se busca en el contenido COMPARTIDO en uso (src/academia/voz-textos.js). Si no está (algo suyo): 'no'
//     (la voz del teléfono) y nunca se manda a nadie. Si está: 'lista' (sus audios guardados), 'pendiente' (se pidió:
//     un audio por texto, aunque lo pidan varios alumnos a la vez) o 'no' (no hay voz pagada para él ahora).
//   GET  /api/academia/lectura/archivo/:archivo  el mp3 guardado
//  Administrador (Claves e IA → ElevenLabs, y Dinero):
//   GET  /api/admin/voz                        el estado, el tope de letras, el crédito, las voces guardadas, «Preparar»
//   POST /api/admin/voz/ajustes                { usar, vozId, modelo, topeMes, primero }
//   POST /api/admin/voz/muestra                probar la voz elegida con una frase corta (también queda guardada)
//   POST /api/admin/voz/preparar               { alcance: 'oral' | 'clases' } empezar; { accion: 'seguir' | 'parar' }
import { createReadStream, statSync } from 'node:fs';
import { ErrorHttp, leerJson, textoDe, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { espacioDe } from '../cuentas/espacios.js';
import { encolar } from '../tareas/cola.js';
import { archivoVoz, rutaVoz, hayVoz } from '../academia/oral-voz.js';
import { buscarTexto, normalizarHabla } from '../academia/voz-textos.js';
import {
  buscarGuardada, elevenPuede, estadoEleven, vistaVozAdmin, guardarConfigVoz, leerConfigVoz, varianteDe, archivoEleven, vozDelAlumno, ponerVozDelAlumno, olvidarCuenta,
} from '../academia/voz-natural.js';
import { estimarPreparar, empezarPreparar, seguirPreparar, pararPreparar, leerPreparar, MUESTRA_VOZ } from '../academia/voz-preparar.js';

const DIEZ_MINUTOS = 10 * 60_000;
export const LECTURA = Object.freeze({ textosMax: 12, letrasMax: 6000 });

// Un pedido nuevo de voz pagada (no uno ya guardado): una por texto y por hora, entre todos los alumnos.
// extra: algo más en la clave (la muestra de OTRA voz, en la misma hora, es otro pedido). permitir(): el tope de pedidos
// nuevos de esa persona (solo cuenta si de verdad se pide uno nuevo).
// → { archivo, pendiente } (pendiente: false = ya se intentó esta hora y no salió, o no se pudo pedir: la voz del teléfono).
export function pedirVoz(db, { texto, crudo = null, idioma, uso, espacioId, usuarioId, chatgpt, ahora, prioridad = null, extra = null, muestra = false, permitir = () => true }) {
  const archivo = archivoVoz(texto);
  const claveUnica = `voz:${archivo}:${Math.floor(ahora / 3_600_000)}${extra ? `:${extra.slice(0, 32)}` : ''}`;
  const ya = db.prepare('SELECT estado FROM tareas WHERE clave_unica = ?').get(claveUnica);
  if (ya) return { archivo, pendiente: ya.estado === 'lista' || ya.estado === 'en_curso' };
  if (!permitir()) return { archivo, pendiente: false };
  const datos = { uso, texto, archivo, idioma, chatgpt: chatgpt === true, usuarioId, pedidaEn: ahora };
  if (crudo && crudo !== texto) datos.crudo = crudo;
  if (muestra) datos.muestra = true;
  encolar(db, { tipo: 'academia.instructor', espacioId, creadaPor: usuarioId, claveUnica, prioridad, datos }, { ahora });
  return { archivo, pendiente: true };
}

export function registrarRutasVoz(rutas, h) {
  const { estadoInstructor, contar, topes, activo, reloj, config, supervisor = null, vozNatural } = h;
  const nuevas = new Limitador({ maximo: 60, ventanaMs: DIEZ_MINUTOS });
  const despertar = () => { try { supervisor?.despertar?.(); } catch { /* la toma en su próxima vuelta */ } };
  const malDato = e => { if (e?.clave === 'datos_no_validos') throw new ErrorHttp(400, 'datos_no_validos'); throw e; };
  const servir = (ruta, bytes) => ({
    codigo: 200,
    enviar: res => {
      res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': 'audio/mpeg', 'Content-Length': bytes, 'Cache-Control': 'private, max-age=86400' });
      const flujo = createReadStream(ruta);
      flujo.on('error', () => res.destroy());
      flujo.pipe(res);
    },
  });

  rutas.agregar('GET', '/api/academia/lectura', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    const ahora = reloj();
    const natural = estadoEleven(db, config, { ahora }).estado === 'lista' || vozNatural(db, estadoInstructor(db, req, usuario, ahora), ahora);
    return { codigo: 200, datos: { voz: vozDelAlumno(db, usuario.id), natural } };
  });
  rutas.agregar('POST', '/api/academia/lectura/preferencia', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.lecturas, usuario);
    try { return { codigo: 200, datos: { voz: ponerVozDelAlumno(db, usuario.id, datos?.voz) } }; } catch (e) { return malDato(e); }
  });
  rutas.agregar('POST', '/api/academia/lectura/voz', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.lecturas, usuario);
    const textos = Array.isArray(datos?.textos) ? datos.textos : null;
    if (!textos || !textos.length || textos.length > LECTURA.textosMax || textos.some(x => typeof x !== 'string') || textos.reduce((n, x) => n + x.length, 0) > LECTURA.letrasMax) throw new ErrorHttp(400, 'datos_no_validos');
    const p = activo(db);
    const ahora = reloj();
    let puedeChatgpt = null;
    const chatgpt = () => (puedeChatgpt ??= vozNatural(db, estadoInstructor(db, req, usuario, ahora), ahora));
    const e = espacioDe(db, usuario);
    let pedidas = 0;
    const partes = textos.map(crudo => {
      const hallado = p ? buscarTexto(p, crudo) : null;
      if (!hallado) return { estado: 'no' };
      const archivos = hallado.partes.map(t => buscarGuardada(db, config, { texto: t })?.archivo ?? null);
      if (archivos.every(Boolean)) return { estado: 'lista', archivos };
      const faltan = hallado.partes.filter((_, k) => !archivos[k]);
      const eleven = faltan.every(t => elevenPuede(db, config, { letras: t.length, ahora }));
      if (!eleven && !chatgpt()) return { estado: 'no' };
      if (!e) return { estado: 'no' };
      let todas = true;
      for (const t of faltan) {
        const r = pedirVoz(db, { texto: t, idioma: hallado.idioma, uso: 'lectura_voz', espacioId: e.id, usuarioId: usuario.id, chatgpt: chatgpt(), ahora, prioridad: 3, permitir: () => nuevas.permitir(String(usuario.id)) });
        if (r.pendiente) pedidas += 1; else todas = false;
      }
      return { estado: todas ? 'pendiente' : 'no' };
    });
    if (pedidas) despertar();
    return { codigo: 200, datos: { partes } };
  });
  rutas.agregar('GET', '/api/academia/lectura/archivo/:archivo', ({ usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    const ruta = rutaVoz(config, parametros.archivo);
    if (!ruta || !hayVoz(config, parametros.archivo)) throw new ErrorHttp(404, 'no_existe');
    return servir(ruta, statSync(ruta).size);
  });

  // ---------- Administrador ----------
  // corto (Dinero): sin la estimación de «Preparar» (recorrer el contenido no hace falta ahí).
  const vistaAdmin = (db, { corto = false } = {}) => {
    const p = corto ? null : (() => { try { return activo(db); } catch { return null; } })();
    return { ...vistaVozAdmin(db, config, { ahora: reloj() }), preparar: leerPreparar(db), estimado: p ? estimarPreparar(db, config, p, { ahora: reloj() }) : null };
  };
  rutas.agregar('GET', '/api/admin/voz', ({ db, req }) => ({ codigo: 200, datos: vistaAdmin(db, { corto: new URL(req.url, 'http://x').searchParams.get('corto') === '1' }) }), { admin: true });
  rutas.agregar('POST', '/api/admin/voz/ajustes', async ({ db, req }) => {
    const datos = await leerJson(req);
    const cambios = {};
    for (const k of ['usar', 'vozId', 'modelo', 'topeMes', 'primero']) if (datos?.[k] !== undefined) cambios[k] = datos[k];
    try { guardarConfigVoz(db, cambios); } catch (e) { return malDato(e); }
    return { codigo: 200, datos: vistaAdmin(db) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/voz/muestra', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const ahora = reloj();
    const texto = normalizarHabla(MUESTRA_VOZ[textoDe(datos, 'idioma') === 'en' ? 'en' : 'es']);
    const archivo = archivoEleven(varianteDe(leerConfigVoz(db)), texto);
    if (hayVoz(config, archivo)) return { codigo: 200, datos: { estado: 'lista', archivo } };
    const estado = estadoEleven(db, config, { ahora });
    if (estado.estado !== 'lista') return { codigo: 200, datos: { estado: 'no', motivo: estado.motivo } };
    const e = espacioDe(db, usuario);
    const r = pedirVoz(db, { texto, idioma: textoDe(datos, 'idioma') === 'en' ? 'en' : 'es', uso: 'lectura_voz', espacioId: e?.id ?? null, usuarioId: usuario.id, chatgpt: false, ahora, extra: archivo, muestra: true });
    if (!r.pendiente) return { codigo: 200, datos: { estado: 'no', motivo: estadoEleven(db, config, { ahora }).motivo ?? 'error_proveedor' } };
    despertar();
    return { codigo: 200, datos: { estado: 'pendiente' } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/voz/preparar', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const accion = textoDe(datos, 'accion') || 'empezar';
    const ahora = reloj();
    if (accion === 'parar') pararPreparar(db, { ahora });
    else if (accion === 'seguir') seguirPreparar(db, { ahora, usuarioId: usuario.id });
    else if (accion === 'empezar') {
      const alcance = textoDe(datos, 'alcance');
      if (!['oral', 'clases'].includes(alcance)) throw new ErrorHttp(400, 'datos_no_validos');
      const p = activo(db);
      try { empezarPreparar(db, config, p, { alcance, ahora, usuarioId: usuario.id }); } catch (e) { if (e?.clave === 'ya_en_curso') throw new ErrorHttp(409, 'ya_en_curso'); throw e; }
    } else throw new ErrorHttp(400, 'datos_no_validos');
    olvidarCuenta();
    despertar();
    return { codigo: 200, datos: vistaAdmin(db) };
  }, { admin: true, soloDueno: true });
}
