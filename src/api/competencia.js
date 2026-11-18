// Academia 0.14.38: las rutas de la «Competencia» (src/academia/competencia.js).
//  - /api/academia/competencia: las 6 rondas, lo suyo y la tabla general (alias de la carrera; nunca ids).
//  - /api/academia/competencia/:ronda (+ /empezar, /responder): jugar SU único intento, una pregunta a la vez.
//  - /api/academia/competencia/:ronda/tabla y /certificados (la galería, con reacciones y comentarios).
//  - /api/academia/competencia/certificados: los suyos (con la frase de la IA si llegó; si no, la fija).
//  - /api/admin/academia/competencia…: todo con nombres, el reloj, «Mejorar preguntas con IA», borrar y silenciar.
// La IA es opcional (ganchos.iaCompe, de src/api/instructor.js): sin ella todo funciona igual.
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { auditar } from '../cuentas/usuarios.js';
import {
  numeroRonda, resumenCompetencia, estadoRonda, empezarRonda, responderRonda, tablaRonda, galeria, misCertificadosCompe, reaccionar, comentar,
  borrarComentario, silenciar, resumenAdmin, aprobarSugerencia, descartarSugerencia, guardarRelojCompe, rondaJugada, rondaEfectiva, falladas,
  anotarIaPedida, anotarPedidoMejora, claveCertCompe, claveSugerencia, creditosFotos, RONDAS, SEMILLA,
} from '../academia/competencia.js';
import { armarFrase, armarMejora } from '../academia/competencia-ia.js';

export function crearLimitesCompetencia() {
  return {
    responder: new Limitador({ maximo: 400, ventanaMs: 10 * 60_000 }), // 6 rondas × 20 = 120: nunca un 429 en medio de una ronda
    reaccionar: new Limitador({ maximo: 60, ventanaMs: 10 * 60_000 }),
    comentar: new Limitador({ maximo: 8, ventanaMs: 10 * 60_000 }),
    ia: new Limitador({ maximo: 6, ventanaMs: 3600_000 }),
  };
}

export function registrarRutasCompetencia(rutas, { reloj = Date.now, limites = {}, azar, ganchos = null } = {}) {
  const topes = { ...crearLimitesCompetencia(), ...limites };
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id), reloj())) throw new ErrorHttp(429, 'demasiados_intentos'); };
  const opciones = () => ({ ahoraMs: reloj(), ...(azar ? { azar } : {}) });
  const admin = usuario => usuario.rol === 'admin';

  // La frase de la IA para sus certificados que todavía no la tienen (una sola vez por certificado; si no hay IA, nada).
  function pedirFrases(db, usuario, certs) {
    if (!ganchos?.iaCompe) return;
    for (const c of certs) {
      if (c.frase) continue;
      const clave = claveCertCompe(c.ronda, usuario.id);
      const guardado = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? 'null');
      if (!guardado || guardado.iaPedida) continue;
      const preguntas = new Map(rondaEfectiva(db, c.ronda).preguntas.map(q => [q.id, q.pregunta]));
      const malas = falladas(db, usuario.id).filter(f => f.ronda === c.ronda).map(f => preguntas.get(f.id)).filter(Boolean);
      const pedido = armarFrase({ ronda: c.ronda, titulo: c.titulo, aciertos: c.aciertos, total: c.total, falladas: malas });
      const r = ganchos.iaCompe(db, usuario, { uso: 'compe_frase', ...pedido, clave });
      // Se anota «pedida» solo si quedó en la fila: sin IA hoy, se puede pedir otro día.
      if (r.estado === 'pendiente') anotarIaPedida(db, c.ronda, usuario.id, reloj());
    }
  }

  rutas.agregar('GET', '/api/academia/competencia', ({ db, usuario }) => ({ codigo: 200, datos: resumenCompetencia(db, usuario.id, reloj()) }));
  rutas.agregar('GET', '/api/academia/competencia/certificados', ({ db, usuario }) => {
    const certificados = misCertificadosCompe(db, usuario.id, opciones());
    try { pedirFrases(db, usuario, certificados); } catch { /* la frase fija sirve igual */ }
    return { codigo: 200, datos: { certificados } };
  });
  // 0.14.41: «Créditos de las fotos» (autor, licencia y enlace de cada foto; antes de /:ronda para que no la tome).
  rutas.agregar('GET', '/api/academia/competencia/fotos', () => ({ codigo: 200, datos: { fotos: creditosFotos() } }));
  // Mostrar la ronda (si está jugando, le SIRVE la pregunta que le toca: desde ahí corre su reloj).
  rutas.agregar('GET', '/api/academia/competencia/:ronda', ({ db, usuario, parametros }) => {
    const n = numeroRonda(parametros.ronda);
    return { codigo: 200, datos: { ...estadoRonda(db, usuario.id, n, reloj(), { servir: true }), tabla: tablaRonda(db, n, { yoId: usuario.id }) } };
  });
  rutas.agregar('POST', '/api/academia/competencia/:ronda/empezar', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    const n = numeroRonda(parametros.ronda);
    return { codigo: 200, datos: empezarRonda(db, usuario.id, n, reloj()) };
  });
  rutas.agregar('POST', '/api/academia/competencia/:ronda/responder', async ({ db, req, usuario, parametros }) => {
    const d = await leerJson(req);
    const n = numeroRonda(parametros.ronda);
    contar(topes.responder, usuario);
    const elegida = d?.elegida == null ? null : textoDe(d, 'elegida');
    return { codigo: 200, datos: responderRonda(db, usuario.id, n, { pregunta: textoDe(d, 'pregunta'), elegida }, reloj()) };
  });
  rutas.agregar('GET', '/api/academia/competencia/:ronda/tabla', ({ db, usuario, parametros }) => ({ codigo: 200, datos: { ronda: numeroRonda(parametros.ronda), tabla: tablaRonda(db, numeroRonda(parametros.ronda), { yoId: usuario.id }) } }));
  rutas.agregar('GET', '/api/academia/competencia/:ronda/certificados', ({ db, usuario, parametros }) =>
    ({ codigo: 200, datos: galeria(db, numeroRonda(parametros.ronda), { yoId: usuario.id, ahoraMs: reloj() }) }));
  rutas.agregar('POST', '/api/academia/competencia/:ronda/certificados/:codigo/reaccion', async ({ db, req, usuario, parametros }) => {
    const d = await leerJson(req);
    const n = numeroRonda(parametros.ronda);
    contar(topes.reaccionar, usuario);
    return { codigo: 200, datos: reaccionar(db, usuario.id, n, parametros.codigo, textoDe(d, 'emoji'), reloj()) };
  });
  rutas.agregar('POST', '/api/academia/competencia/:ronda/certificados/:codigo/comentario', async ({ db, req, usuario, parametros }) => {
    const d = await leerJson(req);
    const n = numeroRonda(parametros.ronda);
    contar(topes.comentar, usuario);
    return { codigo: 201, datos: comentar(db, usuario.id, n, parametros.codigo, textoDe(d, 'texto'), reloj()) };
  });
  // Quien lo escribió puede borrar el suyo; el administrador, cualquiera.
  rutas.agregar('POST', '/api/academia/competencia/comentarios/:id/borrar', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    const r = borrarComentario(db, parametros.id, { usuarioId: usuario.id, admin: admin(usuario) }, reloj());
    if (admin(usuario)) auditar(db, { usuarioId: usuario.id, accion: 'compe_comentario_borrado', detalle: { id: Number(parametros.id) } });
    return { codigo: 200, datos: r };
  });

  // ---------- Administrador ----------
  rutas.agregar('GET', '/api/admin/academia/competencia', ({ db }) => ({ codigo: 200, datos: resumenAdmin(db) }), { admin: true });
  rutas.agregar('GET', '/api/admin/academia/competencia/:ronda/certificados', ({ db, usuario, parametros }) =>
    ({ codigo: 200, datos: galeria(db, numeroRonda(parametros.ronda), { yoId: usuario.id, admin: true, ahoraMs: reloj() }) }), { admin: true });
  rutas.agregar('POST', '/api/admin/academia/competencia/ajustes', async ({ db, req }) => {
    const d = await leerJson(req);
    return { codigo: 200, datos: { reloj: guardarRelojCompe(db, d?.reloj) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/competencia/silenciar', async ({ db, req, usuario }) => {
    const d = await leerJson(req);
    const si = silenciar(db, Number(d?.usuarioId), d?.silenciado);
    auditar(db, { usuarioId: usuario.id, accion: si ? 'compe_silenciado' : 'compe_sin_silencio', detalle: { alumno: Number(d?.usuarioId) } });
    return { codigo: 200, datos: { silenciado: si } };
  }, { admin: true });
  // «Mejorar preguntas con IA»: solo pone el pedido en la fila; la sugerencia espera la aprobación del administrador.
  rutas.agregar('POST', '/api/admin/academia/competencia/:ronda/mejorar', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    const n = numeroRonda(parametros.ronda);
    if (rondaJugada(db, n)) throw new ErrorHttp(409, 'ronda_ya_jugada');
    contar(topes.ia, usuario);
    const ronda = rondaEfectiva(db, n);
    const pedido = armarMejora({ ronda: n, titulo: ronda.titulo, preguntas: ronda.preguntas });
    const r = ganchos?.iaCompe ? ganchos.iaCompe(db, usuario, { uso: 'compe_mejorar', ...pedido, clave: claveSugerencia(n), extra: { ids: ronda.preguntas.map(q => q.id) } }) : { estado: 'no', motivo: 'no_disponible' };
    if (r.estado !== 'pendiente') throw new ErrorHttp(409, 'ia_no_disponible');
    anotarPedidoMejora(db, n, r.tarea, reloj());
    return { codigo: 202, datos: { tarea: { id: r.tarea } } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/competencia/:ronda/aprobar', async ({ db, req, usuario, parametros }) => {
    const d = await leerJson(req);
    const n = numeroRonda(parametros.ronda);
    const ids = Array.isArray(d?.ids) ? d.ids.filter(x => typeof x === 'string').slice(0, 40) : null;
    const r = aprobarSugerencia(db, n, ids, reloj());
    auditar(db, { usuarioId: usuario.id, accion: 'compe_ia_aprobada', detalle: { ronda: n, aplicados: r.aplicados } });
    return { codigo: 200, datos: r };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/competencia/:ronda/descartar', async ({ db, req, parametros }) => {
    await leerJson(req);
    return { codigo: 200, datos: descartarSugerencia(db, numeroRonda(parametros.ronda), reloj()) };
  }, { admin: true });
}

export { RONDAS, SEMILLA };
