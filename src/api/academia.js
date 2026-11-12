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
import { ErrorHttp, leerJson, textoDe, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { LIMITES } from '../academia/formato.js';
import { leerCuerpo, subirJson, subirFigura, subirRecurso, activarPaquete, listarPaquetes, paqueteActivo, rutaFigura, rutaAudio } from '../academia/paquetes.js';
import { idDeCarpeta, enlaceDeCarpeta, basesDrive, recorrerCarpeta, PAQUETE_EN_DRIVE } from '../academia/drive.js';
import { estadoDrive, carpetaDrive, guardarCarpetaDrive, PROGRAMA_DRIVE } from '../academia/drive-estado.js';
import { encolar } from '../tareas/cola.js';
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { auditar } from '../cuentas/usuarios.js';
import { camino, leccion, crearIntento, verIntento, responder, terminar, progreso, alumnos, detalleAlumno, ajustesAcademia, guardarAjustesAcademia, grupoEncendido, encenderGrupo, videoMateria, marcarVideoVisto, marcarTemaLeido, claveDeRespuestas } from '../academia/progreso.js';
import { extrasAlumno, elegirPlan, ocultarEnGrupo, grupoDe } from '../academia/plan.js';
import { crearExamen, vistaExamen, guardarEnExamen, entregarExamen, examenDe, cerrarVencidos, GRACIA_MS, finDe } from '../academia/examen.js';

export function crearLimitesAcademia() {
  return {
    subidas: new Limitador({ maximo: 3000, ventanaMs: 60 * 60 * 1000 }), intentos: new Limitador({ maximo: 300, ventanaMs: 60 * 60 * 1000 }),
    drive: new Limitador({ maximo: 60, ventanaMs: 60 * 60 * 1000 }),
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

export function registrarRutasAcademia(rutas, { config = null, supervisor = null, limites = {}, azar = Math.random, reloj = Date.now } = {}) {
  const topes = { ...crearLimitesAcademia(), ...limites };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const activo = db => { necesitaConfig(); return paqueteActivo(db, config); };

  // ---------- El alumno ----------
  // 0.7.2: el camino y el progreso traen también el plan de estudio, el panel «Grupo» y la preparación (una sola
  // respuesta: la pantalla no pide nada más al abrir).
  rutas.agregar('GET', '/api/academia/camino', ({ db, usuario }) => {
    const p = activo(db);
    return { codigo: 200, datos: { ...camino(db, usuario.id, p, reloj()), ...extrasAlumno(db, usuario.id, p, reloj()) } };
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

  rutas.agregar('GET', '/api/academia/temas/:materia/:tema', ({ db, usuario, parametros }) =>
    ({ codigo: 200, datos: leccion(db, usuario.id, activo(db), parametros.materia, parametros.tema) }));

  // 0.7.2: «terminé de leer la lección» (un tema sin preguntas se aprueba así).
  rutas.agregar('POST', '/api/academia/temas/:materia/:tema/leido', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    return { codigo: 200, datos: marcarTemaLeido(db, usuario.id, activo(db), parametros.materia, parametros.tema) };
  });

  rutas.agregar('POST', '/api/academia/intentos', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (!topes.intentos.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    // 0.8.0: «intento» (opcional, con tipo «errores»): practicar las falladas de ese intento (tiene que ser suyo).
    const base = datos?.intento;
    if (base != null && !Number.isSafeInteger(base)) throw new ErrorHttp(400, 'datos_no_validos');
    const pedido = { tipo: textoDe(datos, 'tipo'), materia: textoDe(datos, 'materia') || null, tema: textoDe(datos, 'tema') || null, intento: base ?? null };
    // 0.9.2: el examen de materia va con reloj (src/academia/examen.js); si hay uno abierto con tiempo, sigue ese (200).
    if (pedido.tipo === 'examen') return crearExamen(db, usuario.id, activo(db), pedido.materia, { azar, ahoraMs: reloj() });
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
    if (examenDe(db, filaPropia(db, usuario, parametros.id))) return { codigo: 200, datos: entregarExamen(db, usuario.id, activo(db), parametros.id, { ahoraMs: reloj() }) };
    return { codigo: 200, datos: terminar(db, usuario.id, activo(db), parametros.id, { ahoraMs: reloj() }) };
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
    const rango = rangoPedido(req.headers.range, a.bytes);
    const comunes = { ...CABECERAS_SEGURIDAD, 'Content-Type': a.tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
    return {
      codigo: 200,
      enviar: res => {
        if (rango === 'no') {
          res.writeHead(416, { ...comunes, 'Content-Range': `bytes */${a.bytes}`, 'Content-Length': 0 });
          return res.end();
        }
        const { inicio, fin } = rango ?? { inicio: 0, fin: a.bytes - 1 };
        res.writeHead(rango ? 206 : 200, { ...comunes, 'Content-Length': fin - inicio + 1, ...(rango ? { 'Content-Range': `bytes ${inicio}-${fin}/${a.bytes}` } : {}) });
        const flujo = createReadStream(a.ruta, { start: inicio, end: fin });
        flujo.on('error', () => res.destroy());
        flujo.pipe(res);
      },
    };
  });

  // ---------- El administrador ----------
  rutas.agregar('GET', '/api/admin/academia', ({ db }) => {
    necesitaConfig();
    return {
      codigo: 200,
      datos: {
        ajustes: ajustesAcademia(db), grupo: grupoEncendido(db), paquetes: listarPaquetes(db, config), drive: estadoDrive(db),
        limites: { jsonBytes: LIMITES.jsonBytes, figuraBytes: LIMITES.figuraBytes, audioBytes: LIMITES.audioBytes },
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

  rutas.agregar('POST', '/api/admin/academia/ajustes', async ({ db, req }) => {
    const datos = await leerJson(req);
    const pedido = {};
    if (Object.hasOwn(datos, 'nombre')) pedido.nombre = datos.nombre;
    if (Object.hasOwn(datos, 'umbral')) pedido.umbral = datos.umbral;
    if (Object.hasOwn(datos, 'examenSegundos')) pedido.examenSegundos = datos.examenSegundos;
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
