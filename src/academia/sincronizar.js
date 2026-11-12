// Academia (0.7.1): la tarea 'academia.drive' (cada hora, y con «Buscar ahora»): trae SOLOS los paquetes de la carpeta
// de Google Drive del dueño. Solo la corre el trabajador (con su tope de tiempo y de bytes por paso; lo que no alcanza,
// en la revisión siguiente: todo lo hecho queda guardado y nada se repite):
//  1. Lista la carpeta y sus subcarpetas (src/academia/drive.js). Si la carpeta no se puede leer, se anota y se abre el
//     aviso 'drive_sin_acceso' (se cierra solo cuando vuelve). Nunca se quita nada de lo que está en uso.
//  2. Cada paquete-*.json: se baja (salvo que la lista diga la misma fecha que la última vez) y por su huella se sabe si
//     es nuevo. El trabajador NUNCA lee el JSON entero (12 MB pasarían su tope de memoria): uno nuevo lo deja en
//     academia/drive/entrante.json y espera (pasos cortos de 5 s) a que el servidor web lo revise con el revisor de
//     siempre y lo guarde como VERSIÓN NUEVA (src/academia/importador.js). Uno mal armado no entra y se informa en cada
//     revisión mientras siga en la carpeta (sin volver a revisarlo).
//  3. Las figuras y los audios que el paquete nombra (leídos de su manifiesto, unos pocos KB) se buscan POR NOMBRE en el
//     mismo árbol (primero en la carpeta del paquete, después en sus subcarpetas, después en las demás) y se bajan con su
//     tope; se revisan igual que al subirlos.
//  4. Una versión que queda «lista» se pone en uso SOLA, una vez (si el administrador después pone otra, se respeta).
//     Varias versiones se suman: cada materia sale de la última puesta en uso que la trae (src/academia/paquetes.js).
//  5. Se anota la revisión (cuándo, qué encontró, qué entró, qué falló): Administrador → Contenido la muestra.
import { mkdirSync, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorTarea } from '../tareas/tipos.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import {
  carpetaAcademia, aceptarRecurso, activarPaquete, apartarRecurso, figurasQueFaltan, audiosQueFaltan, paginasQueFaltan, videosQueFaltan, clipsQueFaltan, declarado, rutaDeRecurso,
  manifiesto, jsonEntero, guardarAjuste, topeDe, DISTINTO,
} from './paquetes.js';
import { espacioLibre } from './espacio.js';
import { enAlmacen, enlazarDesdeAlmacen, leerDrive, anotarDrive, claveDrive, indexarVersiones } from './almacen.js';
import { huellaDeArchivo } from './paquetes.js';
import { ARCHIVO_MP4 } from './formato.js';
import { basesDrive, recorrerCarpeta, bajarArchivo, TOPES_DRIVE, PAQUETE_EN_DRIVE } from './drive.js';
import { carpetaDrive, leerMemoria, guardarMemoria, anotarRevision } from './drive-estado.js';
import { AJUSTE_ENTRANTE, leerEntrante, leerImportado, rutaEntrante } from './importador.js';

const RESERVA_MS = 150_000; // si queda menos que esto del paso, se deja lo demás para la próxima revisión
const MAX_ERRORES = 30;
const MAX_RECHAZADOS = 10;
export const ESPERA_IMPORTAR_MS = 5000;
export const ESPERAS_MAXIMAS = 60; // 5 minutos esperando al servidor web: si no contesta, se anota y se sigue
const iso = ms => new Date(ms).toISOString();
const comparar = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;

function hayAcademia(db) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'academia_paquetes'").get());
}

// Dónde buscar un archivo por su nombre: primero junto al paquete, después debajo de su carpeta, después en el resto.
function candidatos(arbol, nombre, camino) {
  const carpeta = camino.at(-1);
  const delMismo = arbol.filter(a => a.nombre === nombre);
  const nivel = a => (a.camino.at(-1) === carpeta ? 0 : a.camino.includes(carpeta) ? 1 : 2);
  return delMismo.sort((a, b) => nivel(a) - nivel(b)).map(a => ({ ...a, nivel: nivel(a) }));
}

const informeNuevo = (ahora, origen) => ({
  en: iso(ahora), origen, ok: true, motivo: null,
  carpetas: 0, archivos: 0, paquetes: 0, sinCambios: 0, nuevos: [], rechazados: [], activados: [], completados: 0, errores: [], bytes: 0, parcial: false,
});

export function crearSincronizador({ topes = {} } = {}) {
  const T = { ...TOPES_DRIVE, ...topes };

  return async function sincronizar(ctx) {
    const { db, config } = ctx;
    if (!hayAcademia(db)) return { listo: true, resultado: { saltado: 'sin_academia' } };
    const raiz = carpetaDrive(db);
    if (!raiz) return { listo: true, resultado: { saltado: 'sin_carpeta' } };
    const ahora = Date.now();
    const punto = ctx.tarea?.punto && typeof ctx.tarea.punto === 'object' ? ctx.tarea.punto : null;
    const forzar = ctx.tarea?.datos?.forzar === true;
    const bases = basesDrive(config);
    const senal = ctx.senal;
    const quedaMs = () => (typeof ctx.quedaMs === 'function' ? ctx.quedaMs() : Infinity);
    const informe = punto?.informe ?? informeNuevo(ahora, ctx.tarea?.datos?.origen === 'manual' ? 'manual' : 'hora');
    const hechos = new Set(Array.isArray(punto?.hechos) ? punto.hechos : []);
    const memoria = leerMemoria(db);
    const error = (archivo, motivo) => { if (informe.errores.length < MAX_ERRORES) informe.errores.push({ archivo: String(archivo ?? '').slice(0, 200), motivo }); };
    const terminar = async () => {
      await ctx.escribir(() => anotarRevision(db, informe));
      return { listo: true, resultado: { ok: informe.ok, motivo: informe.motivo, paquetes: informe.paquetes, nuevos: informe.nuevos.length, activados: informe.activados.length, errores: informe.errores.length, parcial: informe.parcial } };
    };
    const soltarEntrante = () => ctx.escribir(() => guardarAjuste(db, AJUSTE_ENTRANTE, ''));
    const recienRechazados = new Set(Array.isArray(punto?.recien) ? punto.recien : []);

    // Esperando al servidor web (un paquete nuevo que dejamos para revisar).
    if (punto?.paso === 'esperar') {
      const entrante = leerEntrante(db);
      const hecho = leerImportado(db);
      if (entrante && hecho?.huella === entrante.huella && hecho.resultado !== 'en_curso') {
        if (hecho.resultado === 'nuevo') informe.nuevos.push({ archivo: entrante.archivo, version: hecho.version, materias: hecho.materias ?? [] });
        else if (hecho.resultado === 'rechazado') {
          memoria.rechazados[entrante.huella] = { archivo: entrante.archivo, errores: Array.isArray(hecho.errores) ? hecho.errores.slice(0, 5) : [] };
          recienRechazados.add(entrante.huella);
          await ctx.escribir(() => guardarMemoria(db, memoria));
        } else if (hecho.resultado === 'fallo') {
          error(entrante.archivo, hecho.motivo ?? 'no_se_pudo_guardar');
          hechos.add(entrante.id);
        }
        await soltarEntrante();
      } else if (!entrante || (punto.esperas ?? 0) >= ESPERAS_MAXIMAS) {
        error(entrante?.archivo, 'sin_importar');
        if (entrante) hechos.add(entrante.id);
        await soltarEntrante();
      } else {
        return { punto: { ...punto, esperas: (punto.esperas ?? 0) + 1 }, esperarMs: ESPERA_IMPORTAR_MS, motivo: 'esperando_importar' };
      }
    }

    // 1. La lista.
    const arbol = await recorrerCarpeta(raiz, { bases, senal, profundidad: T.profundidad, maxCarpetas: T.carpetas });
    if (senal?.aborted) throw new ErrorTarea('cancelado');
    if (!arbol.ok) {
      informe.ok = false;
      informe.motivo = arbol.motivo;
      await ctx.escribir(() => abrirAviso(db, { clave: 'drive_sin_acceso', nivel: 'atencion', detalle: { motivo: arbol.motivo }, ahora }));
      return terminar();
    }
    await ctx.escribir(() => resolverAviso(db, 'drive_sin_acceso', ahora));
    informe.carpetas = arbol.carpetas;
    informe.archivos = arbol.archivos.length;
    if (!punto) for (const e of arbol.errores) error(e.carpeta, e.motivo);
    const paquetes = arbol.archivos.filter(a => PAQUETE_EN_DRIVE.test(a.nombre)).sort((a, b) => comparar(a.nombre, b.nombre) || comparar(a.id, b.id));
    informe.paquetes = paquetes.length;

    const academia = carpetaAcademia(config);
    mkdirSync(join(academia, 'drive'), { recursive: true });
    const parcialJson = join(academia, 'drive', 'paquete.json.part'); // siempre el mismo: se reusa (nunca se borra nada)
    const queda = () => !senal?.aborted && quedaMs() > RESERVA_MS && informe.bytes < T.porRevision;
    const versionesNuevas = () => new Set(informe.nuevos.map(n => n.version));

    // Un paquete mal armado que sigue en la carpeta: se informa en cada revisión (sin volver a revisarlo).
    const seguirRechazado = (p, huella) => {
      const r = memoria.rechazados[huella];
      if (informe.rechazados.length < MAX_RECHAZADOS) {
        informe.rechazados.push({ archivo: p.nombre, errores: Array.isArray(r?.errores) ? r.errores : [], ...(recienRechazados.has(huella) ? {} : { antes: true }) });
      }
    };

    // 3. Las figuras y los audios de una versión que faltan (de su manifiesto: el JSON entero nunca se lee aquí).
    async function completar(fila, paquete) {
      // 0.12.1: un archivo que ya está guardado (por su sha256, o por ser el mismo archivo de Drive con la misma fecha) se
      // enlaza y no se baja otra vez (src/academia/almacen.js). Las versiones de antes se indexan una vez.
      const academiaDir = carpetaAcademia(config);
      let indexado = false;
      const deDrive = leerDrive(academiaDir);
      const yaGuardado = (d, c) => {
        const h = d?.sha256 ?? deDrive[claveDrive(c.id, c.modificado)] ?? null;
        if (!h) return null;
        if (!enAlmacen(academiaDir, h) && !indexado) { indexado = true; indexarVersiones(academiaDir, huellaDeArchivo); }
        return enAlmacen(academiaDir, h) ? h : null;
      };
      // 0.12.1: el video (mp4 y su portada) al final: lo chico llega primero.
      const QUE_FALTA = { figura: figurasQueFaltan, audio: audiosQueFaltan, pagina: paginasQueFaltan, clip: clipsQueFaltan, video: videosQueFaltan };
      for (const clase of ['figura', 'audio', 'pagina', 'clip', 'video']) {
        const faltan = QUE_FALTA[clase](config, fila);
        for (const archivo of faltan) {
          if (!queda()) { informe.parcial = true; return; }
          const esMp4 = clase === 'video' && ARCHIVO_MP4.test(archivo);
          // Un mp4 tarda: solo se empieza si al paso le queda su tiempo entero (si no, en la próxima revisión).
          // (Si ya está guardado, no hace falta esperar tiempo para bajarlo: se mira más abajo.)
          const candidatosYa = candidatos(arbol.archivos, archivo, paquete.camino);
          const dYa = declarado(config, fila, clase, archivo);
          const reusable = candidatosYa.length && (dYa?.sha256 || candidatosYa.length === 1 || candidatosYa[0].nivel !== candidatosYa[1].nivel) ? yaGuardado(dYa, candidatosYa[0]) : null;
          if (esMp4 && !reusable && quedaMs() < T.videoMs + 30_000) { informe.parcial = true; return; }
          const lista = candidatos(arbol.archivos, archivo, paquete.camino);
          if (!lista.length) { error(archivo, 'no_esta_en_drive'); continue; }
          const d = declarado(config, fila, clase, archivo);
          // Dos archivos con el mismo nombre al mismo nivel y sin huella en el paquete: no se adivina cuál es.
          if (!d?.sha256 && lista.length > 1 && lista[0].nivel === lista[1].nivel) { error(archivo, 'nombre_repetido'); continue; }
          const destino = rutaDeRecurso(config, fila, clase, archivo);
          if (existsSync(destino)) continue;
          mkdirSync(join(destino, '..'), { recursive: true });
          let soltar;
          try { soltar = apartarRecurso(fila, clase, archivo); } catch { continue; }
          try {
            // Ya guardado: un enlace, sin bajar nada.
            if (reusable && enlazarDesdeAlmacen(academiaDir, reusable, `${destino}.drive.part`)) {
              try {
                const bytes = statSync(`${destino}.drive.part`).size;
                await aceptarRecurso(db, config, { fila, clase, archivo, parcial: `${destino}.drive.part`, huella: reusable, bytes, escribir: ctx.escribir });
                informe.completados += 1;
                informe.reusados = (informe.reusados ?? 0) + 1;
                continue;
              } catch { /* se baja como siempre */ }
            }
            let listo = false;
            let ultimo = null;
            for (const c of (d?.sha256 ? lista : lista.slice(0, 1))) {
              if (!queda()) { informe.parcial = true; break; }
              const tope = Math.min(topeDe(clase, archivo), clase === 'audio' ? T.audio : esMp4 ? T.video : T.imagen);
              // 0.12.1: antes de escribir un mp4, el disco tiene que tener el doble de lo que pesa (si no, se dice).
              const libre = config?.espacioLibre ?? espacioLibre;
              const espacio = esMp4 ? bytes => { const hay = libre(join(destino, '..')); return hay != null && hay < 2 * bytes ? 'sin_espacio_disco' : null; } : null;
              // Su propio «.part» (la pantalla, en el otro proceso, usa «<archivo>.part»): nunca escriben el mismo.
              const b = await bajarArchivo(c.id, { bases, ruta: `${destino}.drive.part`, tope, senal, espacio, ...(esMp4 ? { timeoutMs: T.videoMs } : {}) });
              informe.bytes += b.bytes ?? 0;
              if (!b.ok) { ultimo = b.motivo; if (b.motivo === 'sin_espacio_disco') break; continue; }
              if (d?.sha256 && b.huella !== d.sha256) { ultimo = DISTINTO[clase]; continue; }
              anotarDrive(academiaDir, claveDrive(c.id, c.modificado), b.huella);
              try {
                await aceptarRecurso(db, config, { fila, clase, archivo, parcial: `${destino}.drive.part`, huella: b.huella, bytes: b.bytes, escribir: ctx.escribir });
                listo = true;
                informe.completados += 1;
                break;
              } catch (e) {
                ultimo = typeof e?.clave === 'string' ? e.clave : 'no_se_pudo_guardar';
              }
            }
            if (!listo && ultimo) error(archivo, ultimo);
          } finally {
            soltar();
          }
        }
      }
    }

    // 2. Cada paquete.
    for (const p of paquetes) {
      if (hechos.has(p.id)) continue;
      if (!queda()) { informe.parcial = true; break; }
      const recordado = memoria.archivos[p.id];
      let huella = null;
      // Si la lista dice la misma fecha que la última vez, no se vuelve a bajar (salvo «Buscar ahora», en su primer paso).
      if (!(forzar && !punto) && recordado?.h && p.modificado && recordado.m === p.modificado) huella = recordado.h;
      else {
        const b = await bajarArchivo(p.id, { bases, ruta: parcialJson, tope: T.json, senal });
        informe.bytes += b.bytes ?? 0;
        if (!b.ok) { error(p.nombre, b.motivo); hechos.add(p.id); continue; }
        huella = b.huella;
        memoria.archivos[p.id] = { h: huella, m: p.modificado ?? null };
        await ctx.escribir(() => guardarMemoria(db, memoria));
        if (!memoria.rechazados[huella]) {
          const ya = db.prepare("SELECT * FROM academia_paquetes WHERE huella = ? AND estado <> 'fallido' ORDER BY id DESC LIMIT 1").get(huella);
          if (!ya || !jsonEntero(config, ya)) {
            // Nuevo: al servidor web, que lo revisa y lo guarda. Esta misma tarea sigue cuando conteste.
            if (leerEntrante(db)) { informe.parcial = true; break; }
            renameSync(parcialJson, rutaEntrante(config));
            await ctx.escribir(() => guardarAjuste(db, AJUSTE_ENTRANTE, JSON.stringify({ huella, archivo: p.nombre, id: p.id, en: iso(Date.now()) })));
            return { punto: { paso: 'esperar', esperas: 0, informe, hechos: [...hechos], recien: [...recienRechazados] }, esperarMs: ESPERA_IMPORTAR_MS, motivo: 'esperando_importar' };
          }
        }
      }
      hechos.add(p.id);
      if (memoria.rechazados[huella]) { seguirRechazado(p, huella); continue; }
      let fila = db.prepare("SELECT * FROM academia_paquetes WHERE huella = ? AND estado <> 'fallido' ORDER BY id DESC LIMIT 1").get(huella) ?? null;
      if (!fila) { memoria.archivos[p.id] = { h: huella, m: null }; error(p.nombre, 'sin_importar'); continue; }
      if (!versionesNuevas().has(fila.id)) informe.sinCambios += 1;
      // Lo que la versión nombra, de su manifiesto (el servidor web lo arma para las versiones de antes).
      const m = manifiesto(config, fila, null, { soloArchivo: true });
      if (!m) { error(p.nombre, 'sin_manifiesto'); continue; }
      // 3 y 4.
      await completar(fila, p);
      fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id);
      if (fila.estado === 'listo' && !fila.activado_en) {
        try {
          await ctx.escribir(() => activarPaquete(db, { paqueteId: fila.id, materias: m.materias }));
          informe.activados.push({ version: fila.id, materias: m.materias });
        } catch (e) {
          error(p.nombre, typeof e?.clave === 'string' ? e.clave : 'no_se_pudo_activar');
        }
      }
    }
    await ctx.escribir(() => guardarMemoria(db, memoria));
    return terminar();
  };
}

export const MANEJADOR_DRIVE = Object.freeze({ paso: crearSincronizador() });
