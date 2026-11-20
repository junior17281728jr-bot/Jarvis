// Academia 0.14.26: los certificados de recuerdo (src/academia/certificados.js) y las opiniones de cada clase.
//  - /api/academia/certificados: los de quien entró (nunca los de otro).
//  - /api/admin/academia/alumnos/:id/certificados: los de cualquier alumno (solo el administrador; 403/401).
//  - /api/admin/academia/certificados (0.14.72): TODOS los ya hechos (emite antes los que faltaban; solo el administrador).
//  - /api/certificados/verificar/:codigo: verificar un código (cualquier persona con cuenta, con tope por hora).
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { guardarOpinion, resumenOpiniones } from '../academia/opiniones.js';
import { Limitador } from '../nucleo/limites.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { certificadosDe, verificarCodigo } from '../academia/certificados.js';
import { todosLosCertificados } from '../academia/certificados-todos.js';
import { misCertificadosCompe } from '../academia/competencia.js';

export function registrarRutasCertificados(rutas, { config = null, reloj = Date.now, limites = {}, azar } = {}) {
  const topes = { verificar: new Limitador({ maximo: 60, ventanaMs: 3600 * 1000 }), ...limites };
  const paquete = db => (config ? paqueteActivo(db, config) : null);
  const opciones = () => ({ ahoraMs: reloj(), ...(azar ? { azar } : {}) });
  rutas.agregar('GET', '/api/academia/certificados', ({ db, usuario }) => ({ codigo: 200, datos: certificadosDe(db, usuario.id, paquete(db), opciones()) }));
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/certificados', ({ db, parametros }) => {
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ErrorHttp(404, 'no_existe');
    // 0.14.72: también los de la Competencia (así, desde la lista de todos, cada uno abre aquí el suyo).
    const opc = opciones();
    return { codigo: 200, datos: { ...certificadosDe(db, id, paquete(db), opc), compe: misCertificadosCompe(db, id, opc), alumnoId: id } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/certificados', ({ db }) => ({ codigo: 200, datos: { ...todosLosCertificados(db, paquete(db), opciones()), generado: new Date(reloj()).toISOString() } }), { admin: true });
  rutas.agregar('GET', '/api/certificados/verificar/:codigo', ({ db, usuario, parametros }) => {
    if (!topes.verificar.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    return { codigo: 200, datos: verificarCodigo(db, parametros.codigo, { yoId: usuario.id, admin: usuario.rol === 'admin' }) };
  });
}

// ---------- 0.14.26: «¿Cómo te fue con esta clase?» (src/academia/opiniones.js) ----------
export function registrarRutasOpiniones(rutas, { config = null, reloj = Date.now } = {}) {
  rutas.agregar('POST', '/api/academia/opinion', async ({ db, req, usuario }) => {
    const d = await leerJson(req);
    return { codigo: 201, datos: guardarOpinion(db, usuario.id, { tipo: textoDe(d, 'tipo'), materia: textoDe(d, 'materia'), tema: textoDe(d, 'tema') || null, voto: textoDe(d, 'voto'), texto: textoDe(d, 'texto') }, { ahoraMs: reloj() }) };
  });
  rutas.agregar('GET', '/api/admin/opiniones', ({ db }) => ({ codigo: 200, datos: { materias: resumenOpiniones(db, config ? paqueteActivo(db, config) : null), generado: new Date(reloj()).toISOString() } }), { admin: true });
}
