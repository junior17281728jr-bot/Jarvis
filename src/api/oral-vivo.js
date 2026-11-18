// Academia 0.14.29: las rutas de la «Práctica en vivo» del examen oral (src/academia/oral-vivo.js). Las registra
// src/api/instructor.js (comparten su estado de la IA, su cobro de usos y su fila): este archivo NUNCA llama a la IA; pone
// en la fila la tarea 'academia.instructor' (usos instructor_oral_vivo y instructor_oral_vivo_cierre) como los demás.
//  - Solo viaja TEXTO (lo que dijo, ya pasado a texto por el navegador): nunca audio, nunca su nombre.
//  - La respuesta del libro y lo que dijo la IA en detalle NUNCA viajan antes del final: durante la práctica, solo el
//    veredicto («bien / casi / mal») con una línea corta y, si fue «casi», la repregunta del examinador.
//  - Sin IA para él (apagada, en pausa, sin usos, un tope): igual funciona; se califica él mismo en el repaso del final,
//    con la sugerencia de la app (palabras clave del libro).
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { espacioDe } from '../cuentas/espacios.js';
import { leerGuardado } from '../academia/instructor-ia.js';
import { sistemaCalificar, textoCalificar, armarCierre, RESPUESTA_MAX_LETRAS } from '../academia/oral-vivo-ia.js';
import {
  VIVO, portadaVivo, crearVivo, vistaAbierta, abiertaDe, materialCalificar, anotarRespuesta, ponerCalificacion, cerrarVivo, ponerCierre, datosCierre, leerVivo, calificarSistema, porqueDe,
} from '../academia/oral-vivo.js';
import { tiempoDe } from './pagos.js';
import { createReadStream, statSync } from 'node:fs';
import { CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { encolar } from '../tareas/cola.js';
import { leerConfigIa } from '../ia/config.js';
import { elegirProveedor, modelosDe } from '../ia/presupuesto.js';
import { PROPOSITOS } from '../ia/propositos.js';
import { VOZ, archivoVoz, hayVoz, rutaVoz } from '../academia/oral-voz.js';
import { textoPreguntaVivo } from '../academia/oral-vivo.js';

const CABE_DATOS = 15_000; // los datos de una tarea son ≤ 16 000 letras (src/tareas/cola.js)

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
  const iaVista = (db, req, usuario, ahora) => {
    const i = estadoInstructor(db, req, usuario, ahora);
    const tiempo = tiempoDe(db, usuario, ahora, { estricto });
    return { modo: i.modo, motivo: i.modo === 'ia' ? null : (iaNoAhora(i)?.motivo ?? null), ilimitado: tiempo.ilimitado === true, vozNatural: vozNatural(db, i, ahora) };
  };
  // El estado de la tarea de la IA (solo una suya). → 'pendiente' | 'hecha' | 'fallida'
  const estadoTarea = (db, usuario, tarea) => {
    const e = espacioDe(db, usuario);
    const f = Number.isSafeInteger(tarea) && e ? db.prepare("SELECT estado FROM tareas WHERE id = ? AND tipo = 'academia.instructor' AND espacio_id = ? AND creada_por = ?").get(tarea, e.id, usuario.id) : null;
    if (!f) return 'fallida';
    return f.estado === 'lista' || f.estado === 'en_curso' ? 'pendiente' : 'hecha';
  };
  const claveNueva = (prefijo, usuario, ahora, extra) => `academia.ia.${prefijo}.${usuario.id}.${ahora}${String(extra).padStart(3, '0')}`;

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
      const gs = texto ? calificarSistema(p, it, texto) : null;
      if (gs) { ponerCalificacion(db, usuario.id, sesion, i, seguimiento, gs); return { codigo: 200, datos: { estado: 'lista', veredicto: gs.veredicto, linea: gs.linea, repregunta: null, sistema: true } }; }
      return { codigo: 200, datos: { estado: texto ? 'sin_ia' : 'lista', ...(texto ? { ia: iaNoAhora(instructor) } : { veredicto: 'mal', linea: null, repregunta: null }) } };
    }
    const m = materialCalificar(p, it, sistemaCalificar);
    const clave = claveNueva('vivo', usuario, ahora, i * 2 + (seguimiento ? 1 : 0));
    const pedido = { uso: 'instructor_oral_vivo', sistema: m.sistema, texto: textoCalificar({ n: m.n, respuesta: texto, repregunta: seguimiento ? antes.primera.repregunta : null }), clave, extra: { sesion, seguimiento } };
    const cabe = JSON.stringify([pedido.sistema, pedido.texto, clave, sesion]).length <= CABE_DATOS;
    const ia = cabe ? pedirIa(db, usuario, pedido) : { estado: 'no', motivo: 'demasiado_largo' };
    anotarRespuesta(db, usuario.id, sesion, i, { texto, seguimiento, clave: ia.estado === 'pendiente' ? clave : null, tarea: ia.tarea ?? null }, ahora);
    if (ia.estado !== 'pendiente') {
      const gs = calificarSistema(p, it, texto);
      ponerCalificacion(db, usuario.id, sesion, i, seguimiento, gs);
      if (gs) return { codigo: 200, datos: { estado: 'lista', veredicto: gs.veredicto, linea: gs.linea, repregunta: null, sistema: true } };
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
    const texto = textoPreguntaVivo(p, it, textoDe(datos, 'idioma') === 'en' ? 'en' : 'es');
    if (!texto || texto.length > VOZ.textoMax) return { codigo: 200, datos: { estado: 'no' } };
    const archivo = archivoVoz(texto);
    if (hayVoz(config, archivo)) return { codigo: 200, datos: { estado: 'lista', archivo } };
    if (!vozNatural(db, estadoInstructor(db, req, usuario, ahora), ahora)) return { codigo: 200, datos: { estado: 'no' } };
    const e = espacioDe(db, usuario);
    // Una por texto y por hora (si una no se pudo, se puede otra vez la hora siguiente).
    encolar(db, { tipo: 'academia.instructor', espacioId: e.id, creadaPor: usuario.id, claveUnica: `voz:${archivo}:${Math.floor(ahora / 3_600_000)}`,
      datos: { uso: 'oral_voz', texto, archivo, usuarioId: usuario.id, pedidaEn: ahora } }, { ahora });
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
    const vista = y => ({ estado: 'lista', seguimiento: parte === 'seguimiento', veredicto: y.veredicto, linea: y.linea || null, repregunta: parte === 'primera' && y.veredicto === 'casi' ? y.repregunta || null : null, ...(y.sistema === true ? { sistema: true } : {}) });
    if (x.veredicto) return { codigo: 200, datos: vista(x) };
    if (x.sinIa || !x.clave) return { codigo: 200, datos: { estado: 'sin_ia' } };
    const g = leerGuardado(db, x.clave);
    if (g?.veredicto) {
      // Como mucho VIVO.repreguntas repreguntas por práctica (cada una es una llamada más a la IA).
      const dadas = Object.entries(yo.abierta.resp ?? {}).filter(([k, y]) => Number(k) !== i && y?.primera?.repregunta).length;
      const nuevo = ponerCalificacion(db, usuario.id, parametros.sesion, i, parte === 'seguimiento', dadas >= VIVO.repreguntas ? { ...g, repregunta: '' } : g);
      return { codigo: 200, datos: vista(nuevo[parte]) };
    }
    if (estadoTarea(db, usuario, x.tarea) === 'pendiente') return { codigo: 200, datos: { estado: 'pendiente' } };
    // La IA no llegó (caducó, un tope, no sirvió): 0.14.42: califica el sistema; si no se puede, él al final.
    const gs = calificarSistema(conPaquete(db), yo.abierta.items?.[i], x.texto ?? '');
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
  // El administrador, en la ficha del alumno: su historial de prácticas en vivo (solo cifras).
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/oral-vivo', ({ db, parametros }) => {
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
    const v = leerVivo(db, id);
    return { codigo: 200, datos: { veces: v.veces, mejor: v.mejor, aprobado: v.aprobado, historial: v.historial } };
  }, { admin: true });
}
const vistaCierre = c => (!c ? null : c.estado === 'pendiente' ? { estado: 'pendiente' } : c);
