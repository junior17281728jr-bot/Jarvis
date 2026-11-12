// Rutas de la Academia (etapa 1, 0.7.0).
//  - Las del alumno (/api/academia/…) usan SIEMPRE el id de quien entró (la sesión): no aceptan el id de otra persona,
//    y un intento de otro responde «no existe». Así ningún alumno puede leer los datos de otro.
//  - Las del administrador (/api/admin/academia/…) llevan { admin: true }: subir y poner en uso un paquete, el nombre
//    de la app, el % para aprobar y lo de cada alumno.
//  - El paquete se sube en partes: primero el JSON (un pedido), después cada figura (un pedido por figura, el cuerpo es
//    la imagen tal cual y se escribe por partes en el disco). Ver src/academia/paquetes.js.
//  - 0.7.1: la carpeta de Google Drive (pegar el enlace, «Probar», «Guardar», «Buscar ahora») y la narración en mp3,
//    que se sirve por partes (Range) para que el iPhone la pueda reproducir.
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { ErrorHttp, leerJson, textoDe, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { LIMITES } from '../academia/formato.js';
import { leerCuerpo, subirJson, subirFigura, subirRecurso, activarPaquete, listarPaquetes, paqueteActivo, rutaFigura, rutaAudio, rutaVideo, rutaClip, rutaFoto, paginaDe } from '../academia/paquetes.js';
import { extraDeMateria, rondaExtra, responderExtra } from '../academia/extra.js';
import { humorDelDia, humorDelAdmin, humorDelAlumno, encenderHumorAdmin, encenderHumorAlumno } from '../academia/humor.js';
import { idDeCarpeta, enlaceDeCarpeta, basesDrive, recorrerCarpeta, PAQUETE_EN_DRIVE } from '../academia/drive.js';
import { estadoDrive, carpetaDrive, guardarCarpetaDrive, PROGRAMA_DRIVE } from '../academia/drive-estado.js';
import { encolar } from '../tareas/cola.js';
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { auditar } from '../cuentas/usuarios.js';
import { camino, leccion, crearIntento, verIntento, responder, terminar, progreso, alumnos, detalleAlumno, ajustesAcademia, guardarAjustesAcademia, grupoEncendido, encenderGrupo, videoMateria, marcarVideoVisto, guardarPosicionVideo, marcarTemaLeido, guardarPasoTema, marcarVideoOfrecido, claveDeRespuestas } from '../academia/progreso.js';
import { extrasAlumno, elegirPlan, ocultarEnGrupo, grupoDe } from '../academia/plan.js';
import { crearExamen, vistaExamen, guardarEnExamen, entregarExamen, examenDe, cerrarVencidos, GRACIA_MS, finDe } from '../academia/examen.js';

export function crearLimitesAcademia() {
  return {
    subidas: new Limitador({ maximo: 3000, ventanaMs: 60 * 60 * 1000 }), intentos: new Limitador({ maximo: 300, ventanaMs: 60 * 60 * 1000 }),
    drive: new Limitador({ maximo: 60, ventanaMs: 60 * 60 * 1000 }),
    posiciones: new Limitador({ maximo: 600, ventanaMs: 60 * 60 * 1000 }), // 0.12.1: cada ~15 s mirando un video
  };
}

// Un pedido «Range: bytes=…» (uno solo) → { inicio, fin } dentro del archivo; null si no hay; 'no' si no se puede dar.
export function rangoPedido(cabecera, tamano) {
  if (cabecera == null || cabecera === '') return null;
  const m = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(String(cabecera).trim());
  if (!m || (m[1] === '' && m[2] === '') || tamano <= 0) return 'no';
  let inicio;
  let fin;
  if (m[1] === '') { // los últimos N bytes
    const n = Number(m[2]);
    if (n <= 0) return 'no';
    inicio = Math.max(0, tamano - n);
    fin = tamano - 1;
  } else {
    inicio = Number(m[1]);
    fin = m[2] === '' ? tamano - 1 : Math.min(Number(m[2]), tamano - 1);
  }
  if (inicio >= tamano || fin < inicio) return 'no';
  return { inicio, fin };
}

// Manda un archivo entero o la parte pedida (Range: 206; imposible: 416), por pedazos desde el disco (nunca entero en
// memoria). Con pipeline: si quien mira corta (el video salta a otro minuto todo el tiempo), el archivo se cierra.
// 0.12.1: lo usan la narración (mp3) y el video (mp4).
export function enviarPorPartes(res, req, { ruta, bytes, tipo, cache = 'private, max-age=3600', etiqueta = null }) {
  const comunes = { ...CABECERAS_SEGURIDAD, 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, ...(etiqueta ? { ETag: etiqueta } : {}) };
  if (etiqueta && req.headers['if-none-match'] === etiqueta && !req.headers.range) {
    res.writeHead(304, comunes);
    return res.end();
  }
  // Un «If-Range» que no es esta versión del archivo: va entero.
  const ifRange = req.headers['if-range'];
  const rango = ifRange && etiqueta && ifRange !== etiqueta ? null : rangoPedido(req.headers.range, bytes);
  if (rango === 'no') {
    res.writeHead(416, { ...comunes, 'Content-Range': `bytes */${bytes}`, 'Content-Length': 0 });
    return res.end();
  }
  const { inicio, fin } = rango ?? { inicio: 0, fin: bytes - 1 };
  res.writeHead(rango ? 206 : 200, { ...comunes, 'Content-Length': fin - inicio + 1, ...(rango ? { 'Content-Range': `bytes ${inicio}-${fin}/${bytes}` } : {}) });
  if (req.method === 'HEAD') return res.end();
  pipeline(createReadStream(ruta, { start: inicio, end: fin, highWaterMark: 256 * 1024 }), res).catch(() => res.destroy());
}

export function registrarRutasAcademia(rutas, { config = null, supervisor = null, limites = {}, azar = Math.random, reloj = Date.now, finDeSesion = () => {} } = {}) {
  const topes = { ...crearLimitesAcademia(), ...limites };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const activo = db => { necesitaConfig(); return paqueteActivo(db, config); };

  // ---------- El alumno ----------
  // 0.7.2: el camino y el progreso traen también el plan de estudio, el panel «Grupo» y la preparación (una sola
  // respuesta: la pantalla no pide nada más al abrir).
  rutas.agregar('GET', '/api/academia/camino', ({ db, usuario }) => {
    const p = activo(db);
    // 0.12.0: la frase de humor del día (racha perdida o el regreso), si el humor está encendido para él.
    let humor = null;
    try { humor = p ? humorDelDia(db, usuario.id, reloj()) : null; } catch { humor = null; }
    return { codigo: 200, datos: { ...camino(db, usuario.id, p, reloj()), ...extrasAlumno(db, usuario.id, p, reloj()), humor } };
  });

  // 0.12.0: el humor del instructor (Configuración): si el administrador lo permite y si el alumno lo quiere.
  rutas.agregar('GET', '/api/academia/humor', ({ db, usuario }) => ({ codigo: 200, datos: { permitido: humorDelAdmin(db), encendido: humorDelAlumno(db, usuario.id) } }));
  rutas.agregar('POST', '/api/academia/humor', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    encenderHumorAlumno(db, usuario.id, datos?.encendido);
    return { codigo: 200, datos: { permitido: humorDelAdmin(db), encendido: humorDelAlumno(db, usuario.id) } };
  });

  // 0.12.0: «¿De dónde salió?»: la imagen de la PÁGINA real del libro de una pregunta. En esa página está la
  // respuesta, así que solo se da a quien ya respondió esa pregunta (en academia_respuestas: un examen con reloj no
  // escribe ahí hasta entregar) y nunca mientras tenga abierto un examen con reloj que la trae. El administrador, siempre.
  rutas.agregar('GET', '/api/academia/paginas/:pregunta', ({ db, usuario, parametros }) => {
    const p = activo(db);
    const g = paginaDe(p, parametros.pregunta);
    if (!g || !g.existe) throw new ErrorHttp(404, 'no_existe');
    if (usuario.rol !== 'admin') {
      const respondida = db.prepare('SELECT 1 FROM academia_respuestas WHERE usuario_id = ? AND pregunta = ? LIMIT 1').get(usuario.id, parametros.pregunta);
      if (!respondida) throw new ErrorHttp(403, 'pagina_despues_de_responder');
      for (const f of db.prepare("SELECT * FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND terminado_en IS NULL").all(usuario.id)) {
        const e = examenDe(db, f);
        if (e && reloj() <= finDe(f, e) + GRACIA_MS && JSON.parse(f.orden).includes(parametros.pregunta)) throw new ErrorHttp(403, 'pagina_en_examen');
      }
    }
    return {
      codigo: 200,
      enviar: res => {
        res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': g.tipo, 'Content-Length': g.bytes, 'Cache-Control': 'private, max-age=3600' });
        const flujo = createReadStream(g.ruta);
        flujo.on('error', () => res.destroy());
        flujo.pipe(res);
      },
    };
  });

  // 0.12.0: lo EXTRA de una materia (no es del Test Guide): la pantalla, una ronda por nivel y responder.
  rutas.agregar('GET', '/api/academia/extra/:materia', ({ db, usuario, parametros }) => {
    const p = activo(db);
    const c = camino(db, usuario.id, p, reloj()).materias.find(m => m.id === parametros.materia);
    return { codigo: 200, datos: extraDeMateria(db, usuario.id, p, parametros.materia, { examenAprobado: c?.examen?.aprobado === true }) };
  });
  rutas.agregar('POST', '/api/academia/extra/:materia/ronda', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: rondaExtra(db, usuario.id, activo(db), parametros.materia, { nivel: textoDe(datos, 'nivel') || null, tema: textoDe(datos, 'tema') || null }, { azar }) };
  });
  rutas.agregar('POST', '/api/academia/extra/:materia/responder', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    if (!topes.intentos.permitir(`x${usuario.id}`)) throw new ErrorHttp(429, 'demasiados_intentos');
    return { codigo: 200, datos: responderExtra(db, usuario.id, activo(db), parametros.materia, { pregunta: textoDe(datos, 'pregunta'), elegida: textoDe(datos, 'elegida') }, { ahoraMs: reloj() }) };
  });

  rutas.agregar('POST', '/api/academia/plan', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { plan: elegirPlan(db, usuario.id, activo(db), textoDe(datos, 'plan'), reloj()) } };
  });

  rutas.agregar('POST', '/api/academia/grupo', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    ocultarEnGrupo(db, usuario.id, datos?.oculto);
    return { codigo: 200, datos: { grupo: grupoDe(db, usuario.id, activo(db), reloj()) } };
  });

  // El «Video resumen» de una materia (escenas + la narración en mp3, si ya llegó) y «ya lo vi».
  rutas.agregar('GET', '/api/academia/video/:materia', ({ db, usuario, parametros }) =>
    ({ codigo: 200, datos: videoMateria(db, usuario.id, activo(db), parametros.materia) }));
  rutas.agregar('POST', '/api/academia/video/:materia/visto', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    return { codigo: 200, datos: marcarVideoVisto(db, usuario.id, activo(db), parametros.materia) };
  });
  // 0.12.1: dónde quedó en el video (para seguir desde ahí, también en otro aparato): { segundos }.
  rutas.agregar('POST', '/api/academia/video/:materia/posicion', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    if (!topes.posiciones.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    return { codigo: 200, datos: guardarPosicionVideo(db, usuario.id, activo(db), parametros.materia, datos?.segundos, reloj()) };
  });

  rutas.agregar('GET', '/api/academia/temas/:materia/:tema', ({ db, usuario, parametros }) =>
    ({ codigo: 200, datos: leccion(db, usuario.id, activo(db), parametros.materia, parametros.tema) }));

  // 0.12.2: el video de la materia ya se ofreció (la primera vez que entró): nunca más se muestra solo.
  rutas.agregar('POST', '/api/academia/video/:materia/ofrecido', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    return { codigo: 200, datos: marcarVideoOfrecido(db, usuario.id, activo(db), parametros.materia) };
  });

  // 0.12.2: dónde quedó en la clase de un tema ({ paso, total }): para seguir ahí y para el anillo del Camino.
  rutas.agregar('POST', '/api/academia/temas/:materia/:tema/paso', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    if (!topes.posiciones.permitir(`t${usuario.id}`)) throw new ErrorHttp(429, 'demasiados_intentos');
    return { codigo: 200, datos: guardarPasoTema(db, usuario.id, activo(db), parametros.materia, parametros.tema, { paso: datos?.paso, total: datos?.total }, reloj()) };
  });

  // 0.7.2: «terminé de leer la lección» (un tema sin preguntas se aprueba así).
  rutas.agregar('POST', '/api/academia/temas/:materia/:tema/leido', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    const leido = marcarTemaLeido(db, usuario.id, activo(db), parametros.materia, parametros.tema);
    finDeSesion(db, usuario, 'leido'); // 0.12.7: preparar su próxima clase (si hace falta)
    return { codigo: 200, datos: leido };
  });

  rutas.agregar('POST', '/api/academia/intentos', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (!topes.intentos.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    // 0.8.0: «intento» (opcional, con tipo «errores»): practicar las falladas de ese intento (tiene que ser suyo).
    const base = datos?.intento;
    if (base != null && !Number.isSafeInteger(base)) throw new ErrorHttp(400, 'datos_no_validos');
    // 0.12.2: «concepto» (opcional, con tipo «errores»): repasar un concepto de «Mi repaso» (su clave).
    const pedido = { tipo: textoDe(datos, 'tipo'), materia: textoDe(datos, 'materia') || null, tema: textoDe(datos, 'tema') || null, intento: base ?? null, concepto: textoDe(datos, 'concepto') || null };
    // 0.9.2: el examen de materia va con reloj (src/academia/examen.js); si hay uno abierto con tiempo, sigue ese (200).
    // 0.12.0: «saltar: true» = «Ir directo al examen» sin terminar los temas (queda anotado; src/academia/saltos.js).
    if (pedido.tipo === 'examen') return crearExamen(db, usuario.id, activo(db), pedido.materia, { azar, ahoraMs: reloj(), saltar: datos?.saltar === true });
    return { codigo: 201, datos: crearIntento(db, usuario.id, activo(db), pedido, { azar, ahoraMs: reloj() }) };
  });

  // Un examen con reloj que ya venció se entrega solo al mirarlo.
  const filaPropia = (db, usuario, id) => {
    const n = Number(id);
    return Number.isSafeInteger(n) ? db.prepare('SELECT * FROM academia_intentos WHERE id = ? AND usuario_id = ?').get(n, usuario.id) : null;
  };
  rutas.agregar('GET', '/api/academia/intentos/:id', ({ db, usuario, parametros }) => {
    const p = activo(db);
    const f = filaPropia(db, usuario, parametros.id);
    const e = examenDe(db, f);
    if (!e) return { codigo: 200, datos: verIntento(db, usuario.id, p, parametros.id) };
    if (!f.terminado_en && reloj() > finDe(f, e) + GRACIA_MS) cerrarVencidos(db, usuario.id, p, reloj());
    return { codigo: 200, datos: vistaExamen(db, usuario.id, p, f.id, { ahoraMs: reloj() }) };
  });

  // 0.9.2: guardar (o cambiar) una respuesta del examen, marcar «revisar después» y los segundos en cada pregunta.
  rutas.agregar('POST', '/api/academia/intentos/:id/examen', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    const pedido = { pregunta: textoDe(datos, 'pregunta') };
    for (const campo of ['elegida', 'marcada', 'segundos']) if (Object.hasOwn(datos ?? {}, campo)) pedido[campo] = datos[campo];
    return { codigo: 200, datos: guardarEnExamen(db, usuario.id, activo(db), parametros.id, pedido, { ahoraMs: reloj() }) };
  });

  rutas.agregar('POST', '/api/academia/intentos/:id/responder', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    // El examen con reloj no dice nada antes de entregar: sus respuestas van por …/examen.
    if (examenDe(db, filaPropia(db, usuario, parametros.id))) throw new ErrorHttp(409, 'examen_con_reloj');
    return { codigo: 200, datos: responder(db, usuario.id, activo(db), parametros.id, { pregunta: textoDe(datos, 'pregunta'), elegida: textoDe(datos, 'elegida') }, { ahoraMs: reloj() }) };
  });

  rutas.agregar('POST', '/api/academia/intentos/:id/terminar', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    const fin = examenDe(db, filaPropia(db, usuario, parametros.id))
      ? entregarExamen(db, usuario.id, activo(db), parametros.id, { ahoraMs: reloj() })
      : terminar(db, usuario.id, activo(db), parametros.id, { ahoraMs: reloj() });
    finDeSesion(db, usuario, 'terminar'); // 0.12.7: preparar su próxima clase (si hace falta)
    return { codigo: 200, datos: fin };
  });

  rutas.agregar('GET', '/api/academia/progreso', ({ db, usuario }) => {
    const p = activo(db);
    return { codigo: 200, datos: { ...progreso(db, usuario.id, p, reloj()), ...extrasAlumno(db, usuario.id, p, reloj()) } };
  });

  // Una figura del paquete en uso (solo con la sesión abierta; nunca sale de public/).
  rutas.agregar('GET', '/api/academia/figuras/:numero', ({ db, parametros }) => {
    const f = rutaFigura(activo(db), parametros.numero);
    if (!f) throw new ErrorHttp(404, 'no_existe');
    return {
      codigo: 200,
      enviar: res => {
        res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': f.tipo, 'Content-Length': f.bytes, 'Cache-Control': 'private, max-age=3600' });
        const flujo = createReadStream(f.ruta);
        flujo.on('error', () => res.destroy());
        flujo.pipe(res);
      },
    };
  });

  // La narración (mp3) de una materia o un tema en uso, por partes (Range): el iPhone primero pide «bytes=0-1».
  rutas.agregar('GET', '/api/academia/audio/:ref', ({ db, req, parametros }) => {
    const a = rutaAudio(activo(db), parametros.ref);
    if (!a) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, enviar: res => enviarPorPartes(res, req, a) };
  });

  // 0.12.1: el video resumen editado (mp4) de una materia en uso, y su portada. Por partes (Range), como el audio. Un
  // archivo de una versión nunca cambia y la dirección lleva su huella (?v=): se guarda un año en el aparato.
  rutas.agregar('GET', '/api/academia/videos/:ref', ({ db, req, parametros }) => {
    const v = rutaVideo(activo(db), parametros.ref);
    if (!v) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, enviar: res => enviarPorPartes(res, req, { ...v, cache: 'private, max-age=31536000, immutable' }) };
  });

  // 0.12.1: el clip de una tarjeta (mp4 corto, mudo, en bucle) y su poster: como el video, por partes y guardado un año.
  rutas.agregar('GET', '/api/academia/clips/:ref', ({ db, req, parametros }) => {
    const c = rutaClip(activo(db), parametros.ref);
    if (!c) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, enviar: res => enviarPorPartes(res, req, { ...c, cache: 'private, max-age=31536000, immutable' }) };
  });

  // 0.12.5: la foto del libro de una tarjeta (una imagen de «fotos/»): solo con la sesión, solo las que nombran las
  // tarjetas en uso, guardada un año (la dirección lleva su huella).
  rutas.agregar('GET', '/api/academia/fotos/:ref', ({ db, req, parametros }) => {
    const f = rutaFoto(activo(db), parametros.ref);
    if (!f) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, enviar: res => enviarPorPartes(res, req, { ...f, cache: 'private, max-age=31536000, immutable' }) };
  });

  // ---------- El administrador ----------
  rutas.agregar('GET', '/api/admin/academia', ({ db }) => {
    necesitaConfig();
    return {
      codigo: 200,
      datos: {
        ajustes: ajustesAcademia(db), grupo: grupoEncendido(db), humor: humorDelAdmin(db), paquetes: listarPaquetes(db, config), drive: estadoDrive(db),
        limites: { jsonBytes: LIMITES.jsonBytes, figuraBytes: LIMITES.figuraBytes, audioBytes: LIMITES.audioBytes, videoBytes: LIMITES.videoBytes, clipBytes: LIMITES.clipBytes, paginaBytes: LIMITES.paginaBytes, fotoBytes: LIMITES.fotoBytes },
      },
    };
  }, { admin: true });

  // ---------- La carpeta de Google Drive (0.7.1) ----------
  const trabajadorEncendido = () => {
    try {
      const fase = supervisor?.estado ? supervisor.estado().fase : null;
      return fase == null || !['modo_seguro', 'parando'].includes(fase);
    } catch { return true; }
  };
  // Pide una revisión ya (la hace el trabajador). → { id, nueva }.
  const revisarYa = (db, usuario) => {
    const ahora = reloj();
    const r = encolar(db, { tipo: 'academia.drive', programa: PROGRAMA_DRIVE, claveUnica: `academia.drive@manual-${ahora}`, datos: { origen: 'manual', forzar: true }, creadaPor: usuario.id }, { ahora });
    try { supervisor?.despertar?.(); } catch { /* el trabajador la toma en su próxima vuelta */ }
    return r;
  };
  const enlaceDe = datos => {
    const id = idDeCarpeta(textoDe(datos, 'enlace'));
    if (!id) throw new ErrorHttp(400, 'enlace_no_valido');
    return id;
  };

  // «Probar»: lee la carpeta (y sus subcarpetas de primer nivel) y dice qué hay. No guarda nada.
  rutas.agregar('POST', '/api/admin/academia/drive/probar', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    const id = enlaceDe(datos);
    if (!topes.drive.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const r = await recorrerCarpeta(id, { bases: basesDrive(config), profundidad: 1, maxCarpetas: 8 });
    if (!r.ok) return { codigo: 200, datos: { ok: false, motivo: r.motivo } };
    const paquetes = r.archivos.filter(a => PAQUETE_EN_DRIVE.test(a.nombre)).map(a => a.nombre).slice(0, 20);
    return { codigo: 200, datos: { ok: true, carpetas: r.carpetas, archivos: r.archivos.length, paquetes } };
  }, { admin: true });

  // «Guardar»: el enlace queda en los ajustes de la base (nunca en el repositorio). Vacío = dejar de usar Drive.
  rutas.agregar('POST', '/api/admin/academia/drive', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    if (!textoDe(datos, 'enlace').trim()) {
      guardarCarpetaDrive(db, null);
      auditar(db, { usuarioId: usuario.id, accion: 'academia_drive_quitado' });
      return { codigo: 200, datos: { drive: estadoDrive(db) } };
    }
    const id = enlaceDe(datos);
    guardarCarpetaDrive(db, id);
    auditar(db, { usuarioId: usuario.id, accion: 'academia_drive_guardado' });
    // La primera revisión, enseguida (si el trabajo está en pausa, la hará la revisión de cada hora).
    if (!leerModoSeguro(db).activo && trabajadorEncendido()) { try { revisarYa(db, usuario); } catch { /* la hará la de cada hora */ } }
    return { codigo: 200, datos: { drive: estadoDrive(db), enlace: enlaceDeCarpeta(id) } };
  }, { admin: true });

  // «Buscar ahora».
  rutas.agregar('POST', '/api/admin/academia/drive/buscar', async ({ db, req, usuario }) => {
    necesitaConfig();
    await leerJson(req);
    if (!carpetaDrive(db)) throw new ErrorHttp(409, 'sin_carpeta');
    if (!topes.drive.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    if (leerModoSeguro(db).activo || !trabajadorEncendido()) throw new ErrorHttp(409, 'trabajo_en_pausa');
    const { id } = revisarYa(db, usuario);
    return { codigo: 202, datos: { tarea: { id }, drive: estadoDrive(db) } };
  }, { admin: true });

  // 0.7.2: encender o apagar el panel «Grupo» que ven los alumnos.
  rutas.agregar('POST', '/api/admin/academia/grupo', async ({ db, req }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { grupo: encenderGrupo(db, datos?.encendido) } };
  }, { admin: true });

  // 0.12.0: el humor del instructor para todos (encendido por defecto).
  rutas.agregar('POST', '/api/admin/academia/humor', async ({ db, req }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { humor: encenderHumorAdmin(db, datos?.encendido) } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/academia/ajustes', async ({ db, req }) => {
    const datos = await leerJson(req);
    const pedido = {};
    if (Object.hasOwn(datos, 'nombre')) pedido.nombre = datos.nombre;
    if (Object.hasOwn(datos, 'umbral')) pedido.umbral = datos.umbral;
    if (Object.hasOwn(datos, 'examenSegundos')) pedido.examenSegundos = datos.examenSegundos;
    if (Object.hasOwn(datos, 'practicaModo')) pedido.practicaModo = datos.practicaModo;
    return { codigo: 200, datos: { ajustes: guardarAjustesAcademia(db, pedido) } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/academia/paquetes', async ({ db, req, usuario }) => {
    necesitaConfig();
    const tipo = String(req.headers['content-type'] || '').toLowerCase();
    if (!tipo.startsWith('application/json')) throw new ErrorHttp(415, 'formato_no_valido');
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const cuerpo = await leerCuerpo(req, LIMITES.jsonBytes);
    const r = await subirJson(db, config, { cuerpo, usuarioId: usuario.id });
    return { codigo: r.codigo, datos: r.datos };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/figuras/:archivo', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const r = await subirFigura(db, config, { paqueteId: parametros.id, archivo: parametros.archivo, req, usuarioId: usuario.id });
    return { codigo: r.ya ? 200 : 201, datos: r };
  }, { admin: true });

  // 0.7.1: la narración (mp3) de una materia o un tema, igual que una figura (el cuerpo es el archivo tal cual).
  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/audio/:archivo', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const r = await subirRecurso(db, config, { clase: 'audio', paqueteId: parametros.id, archivo: parametros.archivo, req, usuarioId: usuario.id });
    return { codigo: r.ya ? 200 : 201, datos: r };
  }, { admin: true });

  // 0.12.1: el video resumen (mp4, hasta 150 MB) y su portada, igual que el audio: por pedazos al disco, nunca entero en
  // memoria, y solo si el disco tiene el doble de lo que pesa libre (si no: 507 «sin_espacio», con los MB).
  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/video/:archivo', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const r = await subirRecurso(db, config, { clase: 'video', paqueteId: parametros.id, archivo: parametros.archivo, req, usuarioId: usuario.id });
    return { codigo: r.ya ? 200 : 201, datos: r };
  }, { admin: true });

  // 0.12.1: el clip de una tarjeta (≤ 8 s, ≤ 600 KB, hasta 720p) y su poster, igual que una figura.
  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/clips/:archivo', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const r = await subirRecurso(db, config, { clase: 'clip', paqueteId: parametros.id, archivo: parametros.archivo, req, usuarioId: usuario.id });
    return { codigo: r.ya ? 200 : 201, datos: r };
  }, { admin: true });

  // 0.12.5: la foto del libro de una tarjeta (≤ 1 MB), igual que una figura.
  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/fotos/:archivo', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const r = await subirRecurso(db, config, { clase: 'foto', paqueteId: parametros.id, archivo: parametros.archivo, req, usuarioId: usuario.id });
    return { codigo: r.ya ? 200 : 201, datos: r };
  }, { admin: true });

  // 0.12.0: la imagen de una página del libro («¿De dónde salió?»), igual que una figura.
  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/paginas/:archivo', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const r = await subirRecurso(db, config, { clase: 'pagina', paqueteId: parametros.id, archivo: parametros.archivo, req, usuarioId: usuario.id });
    return { codigo: r.ya ? 200 : 201, datos: r };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/activar', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    return { codigo: 200, datos: { paquete: activarPaquete(db, { paqueteId: parametros.id, usuarioId: usuario.id, config }) } };
  }, { admin: true });

  rutas.agregar('GET', '/api/admin/academia/alumnos', ({ db }) => ({ codigo: 200, datos: { alumnos: alumnos(db, activo(db), reloj()), ajustes: ajustesAcademia(db) } }), { admin: true });

  // 0.8.0: «Respuestas»: la clave completa de lo que está en uso (solo el administrador: 403 para los alumnos).
  rutas.agregar('GET', '/api/admin/academia/respuestas', ({ db }) => ({ codigo: 200, datos: claveDeRespuestas(activo(db)) }), { admin: true });

  rutas.agregar('GET', '/api/admin/academia/alumnos/:id', ({ db, parametros }) =>
    ({ codigo: 200, datos: detalleAlumno(db, activo(db), parametros.id, reloj()) }), { admin: true });
}
