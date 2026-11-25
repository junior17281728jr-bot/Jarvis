// Academia 0.14.29: las rutas de la «Práctica en vivo» del examen oral (src/academia/oral-vivo.js). Las registra
// src/api/instructor.js (comparten su estado de la IA, su cobro de usos y su fila): este archivo NUNCA llama a la IA; pone
// en la fila la tarea 'academia.instructor' (usos instructor_oral_vivo y instructor_oral_vivo_cierre) como los demás.
//  - Solo viaja TEXTO (lo que dijo, ya pasado a texto por el navegador): nunca audio, nunca su nombre.
//    0.14.50: salvo el «dictado» (POST …/:sesion/dictar): la grabación de su respuesta va en memoria al trabajador y de ahí
//    a ChatGPT para pasarla a texto; nunca se guarda (src/academia/oral-dictado.js).
//  - La respuesta del libro y lo que dijo la IA en detalle NUNCA viajan antes del final: durante la práctica, solo el
//    veredicto («bien / casi / mal») con una línea corta y, si fue «casi», la repregunta del examinador.
//  - Sin IA para él (apagada, en pausa, sin usos, un tope): igual funciona; se califica él mismo en el repaso del final,
//    con la sugerencia de la app (palabras clave del libro).
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { espacioDe } from '../cuentas/espacios.js';
import { leerGuardado } from '../academia/instructor-ia.js';
import { sistemaCalificar, sistemaPalabras, textoCalificar, armarCierre, RESPUESTA_MAX_LETRAS } from '../academia/oral-vivo-ia.js';
import { tarjetaParaPalabras, textoPalabras, clavePalabras, vistaPalabras } from '../academia/repaso-final.js';
import {
  VIVO, portadaVivo, crearVivo, vistaAbierta, abiertaDe, materialCalificar, anotarRespuesta, ponerCalificacion, cerrarVivo, ponerCierre, datosCierre, leerVivo, calificarSistema, porqueDe,
} from '../academia/oral-vivo.js';
import { aprenderDeIa } from '../academia/oral-aprende.js';
import { tiempoDe } from './pagos.js';
import { createReadStream, statSync } from 'node:fs';
import { CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { encolar } from '../tareas/cola.js';
import { leerConfigIa } from '../ia/config.js';
import { elegirProveedor, modelosDe, disponibilidad } from '../ia/presupuesto.js';
import { PROPOSITOS } from '../ia/propositos.js';
import { VOZ, hayVoz, rutaVoz } from '../academia/oral-voz.js';
import { normalizarHabla } from '../academia/voz-textos.js';
import { buscarGuardada, elevenPuede, estadoEleven, vocesGuardadas } from '../academia/voz-natural.js';
import { registrarRutasVoz, pedirVoz } from './voz-natural.js';
import { textoPreguntaVivo } from '../academia/oral-vivo.js';
import { DICTADO, ID_DICTADO, nuevoIdDictado, tipoDeAudio, tomarTexto, barrerTextos } from '../academia/oral-dictado.js';

const CABE_DATOS = 15_000; // los datos de una tarea son ≤ 16 000 letras (src/tareas/cola.js)
// 0.14.93: la repregunta se califica solo contra lo que ella pide (su texto y los puntos que dio la IA al hacerla).
const focoDe = (seguimiento, r) => (seguimiento ? { repregunta: r?.primera?.repregunta ?? '', puntos: Array.isArray(r?.primera?.repreguntaPuntos) ? r.primera.repreguntaPuntos : [] } : {});

export function registrarRutasOralVivo(rutas, h) {
  const { estadoInstructor, pedirIa, iaNoAhora, contar, topes, activo, reloj, config, supervisor = null } = h;
  const estricto = config?.terminosObligatorios !== false;
  const conPaquete = db => { const p = activo(db); if (!p) throw new ErrorHttp(409, 'sin_paquete'); return p; };
  // 0.14.29: ¿hay voz natural (ChatGPT) para él ahora? Con su IA lista (nada en pausa) y ChatGPT funcionando.
  const vozNatural = (db, i, ahora) => {
    if (i.modo !== 'ia' || !config) return false;
    try {
      const cfg = leerConfigIa(db);
      const def = PROPOSITOS.oral_voz;
      return elegirProveedor(db, config, cfg, ahora, modelosDe(def, cfg), def).ok === true;
    } catch { return false; }
  };
  // 0.14.50: ¿hay dictado con ChatGPT para él ahora? Con su IA lista (nada en pausa), el trabajador que lo recibe, y ChatGPT
  // con lugar en sus topes y en las llamadas de la hora (lo mismo que miraría al gastar). Si no: el dictado del teclado.
  const dictadoListo = (db, usuario, i, ahora) => {
    if (i.modo !== 'ia' || !config || typeof supervisor?.entregarAudio !== 'function') return false;
    try {
      const e = espacioDe(db, usuario);
      if (!e) return false;
      const def = PROPOSITOS.oral_dictado;
      return disponibilidad(db, { config, espacioId: e.id, proposito: 'oral_dictado', entradaMax: DICTADO.pistaMax + 200 + def.audioTokens, ahora }).disponible === true;
    } catch { return false; }
  };
  const iaVista = (db, req, usuario, ahora) => {
    const i = estadoInstructor(db, req, usuario, ahora);
    const tiempo = tiempoDe(db, usuario, ahora, { estricto });
    // 0.14.70: hay voz natural también con ElevenLabs (sin IA para él) o con lo que ya está guardado.
    const natural = vozNatural(db, i, ahora) || (config ? estadoEleven(db, config, { ahora }).estado === 'lista' || vocesGuardadas(config, { ahora }).n > 0 : false);
    return { modo: i.modo, motivo: i.modo === 'ia' ? null : (iaNoAhora(i)?.motivo ?? null), ilimitado: tiempo.ilimitado === true, vozNatural: natural, dictado: dictadoListo(db, usuario, i, ahora) };
  };

  // 0.14.70: la voz natural de las clases y lo del dueño (src/api/voz-natural.js).
  registrarRutasVoz(rutas, { estadoInstructor, contar, topes, activo, reloj, config, supervisor, vozNatural });

  // El estado de la tarea de la IA (solo una suya). → 'pendiente' | 'hecha' | 'fallida'
  const estadoTarea = (db, usuario, tarea) => {
    const e = espacioDe(db, usuario);
    const f = Number.isSafeInteger(tarea) && e ? db.prepare("SELECT estado FROM tareas WHERE id = ? AND tipo = 'academia.instructor' AND espacio_id = ? AND creada_por = ?").get(tarea, e.id, usuario.id) : null;
    if (!f) return 'fallida';
    return f.estado === 'lista' || f.estado === 'en_curso' ? 'pendiente' : 'hecha';
  };
  const claveNueva = (prefijo, usuario, ahora, extra) => `academia.ia.${prefijo}.${usuario.id}.${ahora}${String(extra).padStart(3, '0')}`;

  // 0.14.51: guarda lo que calificó la IA como ejemplo para cuando no haya IA (con la repregunta: lo de la primera + lo de
  // la repregunta). Nunca con una respuesta en blanco ni con lo que calificó el sistema.
  const aprender = (db, abierta, i, r, parte, g) => {
    const texto = String(r?.[parte]?.texto ?? '').trim();
    if (!texto || g?.sistema === true) return;
    const seguimiento = parte === 'seguimiento';
    // La edición de la versión del paquete que trae ESE tema (con varias en uso, cada tema sale de la suya).
    const it = abierta.items?.[i];
    let edicion = null;
    try {
      const pid = activo(db)?.oral?.materias?.find(m => m.id === it?.m)?.temas?.find(t => t.id === it?.t)?.paquete;
      edicion = pid != null ? db.prepare('SELECT edicion FROM academia_paquetes WHERE id = ?').get(pid)?.edicion ?? null : null;
    } catch { edicion = null; }
    aprenderDeIa(db, { it, edicion, texto: seguimiento ? [r.primera?.texto, texto].filter(Boolean).join(' ') : texto, seguimiento, g }, reloj());
  };

  rutas.agregar('GET', '/api/academia/oral/vivo', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    const p = activo(db);
    const ahora = reloj();
    return { codigo: 200, datos: { ...portadaVivo(db, usuario.id, p), ia: iaVista(db, req, usuario, ahora) } };
  });
  rutas.agregar('POST', '/api/academia/oral/vivo', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.lecturas, usuario);
    const p = conPaquete(db);
    const materia = typeof datos?.materia === 'string' && datos.materia ? datos.materia : null;
    const s = crearVivo(db, usuario.id, p, { materia, n: Number(datos?.n) }, { ahoraMs: reloj() });
    return { codigo: 200, datos: { ...s, ia: iaVista(db, req, usuario, reloj()) } };
  });
  rutas.agregar('GET', '/api/academia/oral/vivo/:sesion', ({ db, req, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    return { codigo: 200, datos: { ...vistaAbierta(db, usuario.id, conPaquete(db), parametros.sesion), ia: iaVista(db, req, usuario, reloj()) } };
  });

  // Su respuesta (texto). Con IA: se pone en la fila para calificarla (un uso); sin IA: se anota y se califica al final.
  rutas.agregar('POST', '/api/academia/oral/vivo/responder', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.explicar, usuario);
    const sesion = textoDe(datos, 'sesion');
    const i = Number(datos?.i);
    const seguimiento = datos?.seguimiento === true;
    const texto = textoDe(datos, 'texto').trim().slice(0, RESPUESTA_MAX_LETRAS);
    const p = conPaquete(db);
    const ahora = reloj();
    const yo = abiertaDe(db, usuario.id, sesion);
    // Ya terminada (vio las respuestas del libro) o cerrada: nada más, y sin gastar un uso.
    if (yo.abierta.cerrada || yo.abierta.terminada) throw new ErrorHttp(409, 'ya_cerrada');
    const it = yo.abierta.items[i];
    if (!it) throw new ErrorHttp(404, 'no_existe');
    const antes = yo.abierta.resp?.[i];
    if (seguimiento ? !(antes?.primera?.veredicto === 'casi' && antes.primera.repregunta && !antes.seguimiento) : antes?.primera) throw new ErrorHttp(409, seguimiento ? 'sin_repregunta' : 'ya_respondida');
    const instructor = estadoInstructor(db, req, usuario, ahora);
    // En blanco («No sé»): no se gasta la IA; es «mal».
    if (!texto || instructor.modo !== 'ia') {
      anotarRespuesta(db, usuario.id, sesion, i, { texto, seguimiento }, ahora);
      if (!texto) ponerCalificacion(db, usuario.id, sesion, i, seguimiento, { veredicto: 'mal', linea: '', bienDicho: '', falto: '', repregunta: '' });
      // 0.14.42: sin IA, califica el sistema (ideas clave del libro).
      // 0.14.51: con lo que aprendió de la IA en esa pregunta (src/academia/oral-aprende.js), si hay.
      const gs = texto ? calificarSistema(p, it, texto, { db, seguimiento, previo: antes?.primera?.texto ?? '', ...focoDe(seguimiento, antes) }) : null;
      if (gs) { ponerCalificacion(db, usuario.id, sesion, i, seguimiento, gs); return { codigo: 200, datos: { estado: 'lista', veredicto: gs.veredicto, linea: gs.linea, repregunta: null, sistema: true, ...(gs.aprendido ? { aprendido: true } : {}) } }; }
      return { codigo: 200, datos: { estado: texto ? 'sin_ia' : 'lista', ...(texto ? { ia: iaNoAhora(instructor) } : { veredicto: 'mal', linea: null, repregunta: null }) } };
    }
    const m = materialCalificar(p, it, sistemaCalificar);
    const clave = claveNueva('vivo', usuario, ahora, i * 2 + (seguimiento ? 1 : 0));
    const pedido = { uso: 'instructor_oral_vivo', sistema: m.sistema, texto: textoCalificar({ n: m.n, respuesta: texto, repregunta: seguimiento ? antes.primera.repregunta : null, puntos: seguimiento ? antes.primera.repreguntaPuntos : [] }), clave, extra: { sesion, seguimiento } };
    const cabe = JSON.stringify([pedido.sistema, pedido.texto, clave, sesion]).length <= CABE_DATOS;
    const ia = cabe ? pedirIa(db, usuario, pedido) : { estado: 'no', motivo: 'demasiado_largo' };
    anotarRespuesta(db, usuario.id, sesion, i, { texto, seguimiento, clave: ia.estado === 'pendiente' ? clave : null, tarea: ia.tarea ?? null }, ahora);
    if (ia.estado !== 'pendiente') {
      const gs = calificarSistema(p, it, texto, { db, seguimiento, previo: antes?.primera?.texto ?? '', ...focoDe(seguimiento, antes) });
      ponerCalificacion(db, usuario.id, sesion, i, seguimiento, gs);
      if (gs) return { codigo: 200, datos: { estado: 'lista', veredicto: gs.veredicto, linea: gs.linea, repregunta: null, sistema: true, ...(gs.aprendido ? { aprendido: true } : {}) } };
      return { codigo: 200, datos: { estado: 'sin_ia', ia } };
    }
    return { codigo: 200, datos: { estado: 'pendiente' } };
  });

  // 0.14.29: la voz natural de una pregunta (solo el texto de la pregunta del libro; nunca algo del alumno). Ya hecha: su
  // archivo; si no y hay ChatGPT: se pide al trabajador (en el tope de su cuenta, una vez por texto) y la pantalla pregunta otra
  // vez; si no: estado 'no' (la voz del teléfono).
  rutas.agregar('POST', '/api/academia/oral/vivo/voz', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.lecturas, usuario);
    const p = conPaquete(db);
    const ahora = reloj();
    const yo = abiertaDe(db, usuario.id, textoDe(datos, 'sesion'));
    const it = yo.abierta.items[Number(datos?.i)];
    if (!it) throw new ErrorHttp(404, 'no_existe');
    const idioma = textoDe(datos, 'idioma') === 'en' ? 'en' : 'es';
    const crudo = textoPreguntaVivo(p, it, idioma);
    // 0.14.70: uno ya guardado (ElevenLabs o ChatGPT) sirve gratis; si no, ElevenLabs (con su clave, crédito y tope) o
    // ChatGPT (si él tiene IA); si no, la voz del teléfono.
    const texto = normalizarHabla(crudo);
    if (!texto || texto.length > VOZ.textoMax) return { codigo: 200, datos: { estado: 'no' } };
    const ya = buscarGuardada(db, config, { texto, crudo });
    if (ya) return { codigo: 200, datos: { estado: 'lista', archivo: ya.archivo } };
    const chatgpt = vozNatural(db, estadoInstructor(db, req, usuario, ahora), ahora);
    if (!chatgpt && !elevenPuede(db, config, { letras: texto.length, ahora })) return { codigo: 200, datos: { estado: 'no' } };
    const e = espacioDe(db, usuario);
    // Una por texto y por hora (si una no se pudo, se puede otra vez la hora siguiente).
    const { archivo, pendiente } = pedirVoz(db, { texto, crudo, idioma, uso: 'oral_voz', espacioId: e.id, usuarioId: usuario.id, chatgpt, ahora });
    if (!pendiente) return { codigo: 200, datos: { estado: 'no' } };
    try { supervisor?.despertar?.(); } catch { /* la toma en su próxima vuelta */ }
    return { codigo: 200, datos: { estado: 'pendiente', archivo } };
  });
  rutas.agregar('GET', '/api/academia/oral/vivo/voz/:archivo', ({ usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    const ruta = rutaVoz(config, parametros.archivo);
    if (!ruta || !hayVoz(config, parametros.archivo)) throw new ErrorHttp(404, 'no_existe');
    const bytes = statSync(ruta).size;
    return {
      codigo: 200,
      enviar: res => {
        res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': 'audio/mpeg', 'Content-Length': bytes, 'Cache-Control': 'private, max-age=86400' });
        const flujo = createReadStream(ruta);
        flujo.on('error', () => res.destroy());
        flujo.pipe(res);
      },
    };
  });

  // 0.14.50: el dictado. El cuerpo es la grabación tal cual (Content-Type audio/webm, audio/mp4…; hasta 4 MB). Solo el
  // dueño de la práctica, con la práctica abierta. La grabación nunca se guarda: va en memoria al trabajador (la fila lleva
  // solo su id) y la pantalla pregunta por el texto (GET …/dictar/:id). Sin ChatGPT para él: { estado: 'no' } (el teclado).
  rutas.agregar('POST', '/api/academia/oral/vivo/:sesion/dictar', async ({ db, req, usuario, parametros }) => {
    let p;
    let yo;
    // Lo que se revisa antes de leer la grabación (si algo no va, lo que mandó no se lee).
    try {
      contar(topes.dictar, usuario);
      const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!tipo.startsWith('audio/') && tipo !== 'application/octet-stream') throw new ErrorHttp(415, 'formato_no_valido');
      const largo = Number(req.headers['content-length']);
      if (Number.isFinite(largo) && largo > DICTADO.bytesMax) throw new ErrorHttp(413, 'demasiado_grande');
      p = conPaquete(db);
      yo = abiertaDe(db, usuario.id, parametros.sesion);
      if (yo.abierta.cerrada || yo.abierta.terminada) throw new ErrorHttp(409, 'ya_cerrada');
    } catch (error) { req.resume(); throw error; }
    const audio = await leerAudio(req, DICTADO.bytesMax);
    if (audio.length < DICTADO.bytesMin) throw new ErrorHttp(400, 'muy_corto');
    if (!tipoDeAudio(audio)) throw new ErrorHttp(415, 'grabacion_no_valida');
    const ahora = reloj();
    const instructor = estadoInstructor(db, req, usuario, ahora);
    if (!dictadoListo(db, usuario, instructor, ahora)) return { codigo: 200, datos: { estado: 'no' } };
    const consulta = new URL(req.url, 'http://x').searchParams;
    const idioma = consulta.get('idioma') === 'en' ? 'en' : 'es';
    const it = yo.abierta.items[Number(consulta.get('i'))];
    // La pista para ChatGPT: solo el texto de la pregunta del libro (las palabras de aviación); nada del alumno.
    const pista = it ? String(textoPreguntaVivo(p, it, idioma) ?? '').slice(0, DICTADO.pistaMax) : '';
    const e = espacioDe(db, usuario);
    const id = nuevoIdDictado();
    if (!supervisor.entregarAudio({ id, base64: audio.toString('base64') })) return { codigo: 200, datos: { estado: 'no' } };
    barrerTextos(db, ahora);
    encolar(db, { tipo: 'academia.instructor', espacioId: e.id, creadaPor: usuario.id, claveUnica: `dictado:${id}`,
      datos: { uso: 'oral_dictado', audio: id, usuarioId: usuario.id, pedidaEn: ahora, idioma, pista } }, { ahora });
    try { supervisor?.despertar?.(); } catch { /* la toma en su próxima vuelta */ }
    return { codigo: 200, datos: { estado: 'pendiente', id } };
  });
  // El texto de un dictado: { estado: 'lista', texto } (una vez: después se borra), 'pendiente', o 'no' (con el motivo).
  rutas.agregar('GET', '/api/academia/oral/vivo/:sesion/dictar/:id', ({ db, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    abiertaDe(db, usuario.id, parametros.sesion);
    if (!ID_DICTADO.test(parametros.id)) throw new ErrorHttp(404, 'no_existe');
    const listo = tomarTexto(db, { usuarioId: usuario.id, id: parametros.id });
    if (listo) return { codigo: 200, datos: { estado: 'lista', texto: listo.texto } };
    const t = db.prepare("SELECT estado, resultado FROM tareas WHERE clave_unica = ? AND tipo = 'academia.instructor' AND creada_por = ?").get(`dictado:${parametros.id}`, usuario.id);
    if (!t) throw new ErrorHttp(404, 'no_existe');
    if (t.estado === 'lista' || t.estado === 'en_curso') return { codigo: 200, datos: { estado: 'pendiente' } };
    let motivo = null;
    try { motivo = JSON.parse(t.resultado ?? 'null')?.motivo ?? null; } catch { motivo = null; }
    return { codigo: 200, datos: { estado: 'no', motivo: typeof motivo === 'string' && /^[a-z_]{1,40}$/.test(motivo) ? motivo : null } };
  });

  // El mensaje del instructor al final (con IA), cuando llega.
  rutas.agregar('GET', '/api/academia/oral/vivo/:sesion/cierre', ({ db, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    const yo = abiertaDe(db, usuario.id, parametros.sesion);
    const c = yo.abierta.resumen?.cierre ?? null;
    if (!c) return { codigo: 200, datos: { estado: 'no' } };
    if (c.estado !== 'pendiente') return { codigo: 200, datos: vistaCierre(c) };
    const g = leerGuardado(db, c.clave);
    if (g?.mensaje) {
      const listo = { estado: 'lista', mensaje: g.mensaje, listoPorque: g.listoPorque || null, temas: (g.temas ?? []).map(x => ({ id: c.letras?.[x.id] ?? null, comentario: x.comentario })).filter(x => x.id) };
      ponerCierre(db, usuario.id, parametros.sesion, listo);
      return { codigo: 200, datos: listo };
    }
    if (estadoTarea(db, usuario, c.tarea) === 'pendiente') return { codigo: 200, datos: { estado: 'pendiente' } };
    ponerCierre(db, usuario.id, parametros.sesion, { estado: 'no' });
    return { codigo: 200, datos: { estado: 'no' } };
  });

  // 0.14.43: «¿Por qué?» de una pregunta YA calificada (y sin repregunta pendiente): lo que dijo bien, lo que faltó y la
  // respuesta del libro. Antes calificada, nada (no se adelanta la respuesta).
  rutas.agregar('GET', '/api/academia/oral/vivo/:sesion/:i/porque', ({ db, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    const yo = abiertaDe(db, usuario.id, parametros.sesion);
    const i = Number(parametros.i);
    const x = porqueDe(conPaquete(db), yo.abierta.items?.[i], yo.abierta.resp?.[i]);
    if (!x) throw new ErrorHttp(409, 'todavia_no');
    return { codigo: 200, datos: x };
  });

  // ¿Ya la calificó? Solo el veredicto, la línea corta y (si fue «casi») la repregunta: nada del libro.
  rutas.agregar('GET', '/api/academia/oral/vivo/:sesion/:i', ({ db, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    const yo = abiertaDe(db, usuario.id, parametros.sesion);
    const i = Number(parametros.i);
    const r = yo.abierta.resp?.[i];
    if (!r?.primera) throw new ErrorHttp(404, 'no_existe');
    const parte = r.seguimiento ? 'seguimiento' : 'primera';
    const x = r[parte];
    const vista = y => ({ estado: 'lista', seguimiento: parte === 'seguimiento', veredicto: y.veredicto, linea: y.linea || null, repregunta: parte === 'primera' && y.veredicto === 'casi' ? y.repregunta || null : null, ...(y.sistema === true ? { sistema: true } : {}), ...(y.aprendido === true ? { aprendido: true } : {}) });
    if (x.veredicto) return { codigo: 200, datos: vista(x) };
    if (x.sinIa || !x.clave) return { codigo: 200, datos: { estado: 'sin_ia' } };
    const g = leerGuardado(db, x.clave);
    if (g?.veredicto) {
      // Como mucho VIVO.repreguntas repreguntas por práctica (cada una es una llamada más a la IA).
      const dadas = Object.entries(yo.abierta.resp ?? {}).filter(([k, y]) => Number(k) !== i && y?.primera?.repregunta).length;
      const nuevo = ponerCalificacion(db, usuario.id, parametros.sesion, i, parte === 'seguimiento', dadas >= VIVO.repreguntas ? { ...g, repregunta: '', repreguntaPuntos: [] } : g);
      // 0.14.51: el sistema aprende de lo que calificó la IA (sin el usuario; src/academia/oral-aprende.js).
      aprender(db, yo.abierta, i, r, parte, g);
      return { codigo: 200, datos: vista(nuevo[parte]) };
    }
    if (estadoTarea(db, usuario, x.tarea) === 'pendiente') return { codigo: 200, datos: { estado: 'pendiente' } };
    // La IA no llegó (caducó, un tope, no sirvió): 0.14.42: califica el sistema; si no se puede, él al final.
    const gs = calificarSistema(conPaquete(db), yo.abierta.items?.[i], x.texto ?? '', { db, seguimiento: parte === 'seguimiento', previo: r.primera?.texto ?? '', ...focoDe(parte === 'seguimiento', r) });
    const puesto = ponerCalificacion(db, usuario.id, parametros.sesion, i, parte === 'seguimiento', gs);
    if (gs) return { codigo: 200, datos: vista(puesto[parte]) };
    return { codigo: 200, datos: { estado: 'sin_ia' } };
  });

  // El final: el repaso (con la respuesta del libro), y «Aprobado / No aprobado» cuando ya no falta calificarse ninguna.
  // Con IA, el mensaje del instructor (un uso) llega después: GET …/cierre.
  rutas.agregar('POST', '/api/academia/oral/vivo/terminar', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.lecturas, usuario);
    const sesion = textoDe(datos, 'sesion');
    const p = conPaquete(db);
    const ahora = reloj();
    // Las calificaciones que siguen en la fila: si ya llegaron, se ponen; si no, se califica él.
    const yo = abiertaDe(db, usuario.id, sesion);
    if (!yo.abierta.cerrada) {
      for (const [k, r] of Object.entries(yo.abierta.resp ?? {})) {
        for (const parte of ['primera', 'seguimiento']) {
          const x = r?.[parte];
          if (!x || x.veredicto || x.sinIa) continue;
          const g = x.clave ? leerGuardado(db, x.clave) : null;
          ponerCalificacion(db, usuario.id, sesion, Number(k), parte === 'seguimiento', g?.veredicto ? g : null);
          if (g?.veredicto) aprender(db, yo.abierta, Number(k), r, parte, g);
        }
      }
    }
    const fin = cerrarVivo(db, usuario.id, p, sesion, { auto: datos?.auto }, { ahoraMs: ahora });
    let cierre = fin.resumen?.cierre ?? null;
    if (fin.cerrada && fin.resumen && !cierre && datos?.ia !== false) {
      const instructor = estadoInstructor(db, req, usuario, ahora);
      if (instructor.modo === 'ia') {
        const { letras, resumen } = datosCierre(fin.resumen, fin.revision);
        const pedido = armarCierre({ resumen, idioma: usuario.idioma });
        const clave = claveNueva('vivocierre', usuario, ahora, 0);
        const ia = pedirIa(db, usuario, { uso: 'instructor_oral_vivo_cierre', sistema: pedido.sistema, texto: pedido.texto, clave, extra: { sesion, temas: [...letras.values()] } });
        cierre = ia.estado === 'pendiente' ? { estado: 'pendiente', clave, tarea: ia.tarea, letras: Object.fromEntries([...letras].map(([id, l]) => [l, id])) } : { estado: 'no' };
        ponerCierre(db, usuario.id, sesion, cierre);
      }
    }
    return { codigo: 200, datos: { ...fin, resumen: fin.resumen ? { ...fin.resumen, cierre: vistaCierre(cierre) } : null } };
  });
  // ---------- 0.14.116: «Responder con mis palabras» del Repaso final (src/academia/repaso-final.js) ----------
  // Lo mismo que la práctica en vivo: su IA (estadoInstructor: apagada, en pausa, sin usos, sin su permiso, un tope → no),
  // un uso por respuesta nueva (pedirIa; la misma respuesta otra vez no se cobra) y la misma fila. Sin IA, o si la IA no
  // llegó: { estado: 'sin_ia' } y la pantalla muestra la respuesta del libro con «La corrección con IA está desactivada en
  // este momento». Sin nombres: a la IA va solo el texto que escribió y el libro.
  const iaPalabras = (db, req, usuario, ahora) => {
    const i = estadoInstructor(db, req, usuario, ahora);
    return i.modo === 'ia' ? { disponible: true, motivo: null } : { disponible: false, motivo: i.modo === 'espera' ? 'espera' : (i.motivo ?? 'no_disponible') };
  };
  // La tarea de esa clave (solo una suya): 'pendiente' | 'hecha' | null.
  const tareaDeClave = (db, usuario, clave) => {
    const e = espacioDe(db, usuario);
    const f = e ? db.prepare("SELECT estado FROM tareas WHERE tipo = 'academia.instructor' AND espacio_id = ? AND creada_por = ? AND datos LIKE ? ORDER BY id DESC LIMIT 1").get(e.id, usuario.id, `%"clave":"${clave}"%`) : null;
    if (!f) return null;
    return f.estado === 'lista' || f.estado === 'en_curso' ? 'pendiente' : 'hecha';
  };
  const datosPalabras = (db, datos) => {
    const y = tarjetaParaPalabras(conPaquete(db), textoDe(datos, 'tarjeta'));
    if (!y) throw new ErrorHttp(404, 'no_existe');
    const texto = textoPalabras(textoDe(datos, 'texto'));
    if (!texto) throw new ErrorHttp(400, 'datos_no_validos');
    return { ...y, texto };
  };
  rutas.agregar('GET', '/api/academia/repaso-final/oral/ia', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    return { codigo: 200, datos: iaPalabras(db, req, usuario, reloj()) };
  });
  rutas.agregar('POST', '/api/academia/repaso-final/oral/palabras', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.explicar, usuario);
    const p = conPaquete(db);
    const { x, it, texto } = datosPalabras(db, datos);
    const ahora = reloj();
    const clave = clavePalabras(usuario.id, x, texto);
    // Ya calificada (la misma respuesta): se ve sin pedir nada ni cobrar.
    const ya = vistaPalabras(leerGuardado(db, clave));
    if (ya) return { codigo: 200, datos: ya };
    const ia = iaPalabras(db, req, usuario, ahora);
    if (!ia.disponible) return { codigo: 200, datos: { estado: 'sin_ia', motivo: ia.motivo } };
    if (tareaDeClave(db, usuario, clave) === 'pendiente') return { codigo: 200, datos: { estado: 'pendiente' } };
    const m = materialCalificar(p, it, sistemaPalabras);
    const pedido = { uso: 'instructor_oral_vivo', sistema: m.sistema, texto: textoCalificar({ n: m.n, respuesta: texto }), clave, extra: { seguimiento: true, palabras: true } };
    const cabe = JSON.stringify([pedido.sistema, pedido.texto, clave]).length <= CABE_DATOS;
    const r = cabe ? pedirIa(db, usuario, pedido) : { estado: 'no', motivo: 'demasiado_largo' };
    if (r.estado !== 'pendiente') return { codigo: 200, datos: { estado: 'sin_ia', motivo: r.motivo ?? 'no_disponible' } };
    return { codigo: 200, datos: { estado: 'pendiente' } };
  });
  // ¿Ya llegó? (la pantalla pregunta con la misma tarjeta y el mismo texto: la clave es la misma).
  rutas.agregar('POST', '/api/academia/repaso-final/oral/palabras/ver', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.lecturas, usuario);
    const { x, texto } = datosPalabras(db, datos);
    const clave = clavePalabras(usuario.id, x, texto);
    const ya = vistaPalabras(leerGuardado(db, clave));
    if (ya) return { codigo: 200, datos: ya };
    if (tareaDeClave(db, usuario, clave) === 'pendiente') return { codigo: 200, datos: { estado: 'pendiente' } };
    // No llegó (el proveedor falló, no respondió a tiempo, se acabó el crédito): el uso ya se devolvió (pedirIa).
    return { codigo: 200, datos: { estado: 'sin_ia', motivo: 'no_llego' } };
  });
  // El administrador, en la ficha del alumno: su historial de prácticas en vivo (solo cifras).
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/oral-vivo', ({ db, parametros }) => {
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
    const v = leerVivo(db, id);
    return { codigo: 200, datos: { veces: v.veces, mejor: v.mejor, aprobado: v.aprobado, historial: v.historial } };
  }, { admin: true });
}
// 0.14.50: la grabación de un dictado, con su tope (más que eso: 413, sin leer el resto). Solo en memoria.
function leerAudio(req, tope) {
  return new Promise((ok, mal) => {
    const partes = [];
    let total = 0;
    let cortado = false;
    req.on('data', parte => {
      if (cortado) return;
      total += parte.length;
      if (total > tope) { cortado = true; partes.length = 0; mal(new ErrorHttp(413, 'demasiado_grande')); req.resume(); return; }
      partes.push(parte);
    });
    req.on('end', () => { if (!cortado) ok(Buffer.concat(partes)); });
    req.on('error', () => { if (!cortado) mal(new ErrorHttp(400, 'datos_no_validos')); });
  });
}
const vistaCierre = c => (!c ? null : c.estado === 'pendiente' ? { estado: 'pendiente' } : c);
