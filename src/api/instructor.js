// Academia 0.9.0: las rutas del «Instructor» (src/academia/instructor.js, sin IA, y src/academia/instructor-ia.js, con IA).
//  - Todas las del alumno usan SIEMPRE el id de la sesión: un intento, una tarea o una respuesta guardada de otro
//    responde 404. Para explicar una pregunta, el alumno tiene que haberla respondido EN SU intento (así nunca se puede
//    pedir la respuesta antes de responder) y la opción sale de la base, nunca de la pantalla.
//  - Sin IA (lo normal) todo responde enseguida con el instructor básico. Con la IA encendida por el dueño y el instructor
//    con IA encendido, además se pone en la fila una tarea 'academia.instructor' (la IA solo la usa el trabajador: este
//    archivo NUNCA llama a la IA) y la pantalla pregunta por ella hasta que llega; si no llega, se queda lo básico.
//  - Lo paga la cuenta del alumno: dentro del tope de su plan y del general, y solo con el permiso de IA del dueño para
//    esa cuenta (src/ia/presupuesto.js revisa todo eso otra vez al gastar). La cuenta del administrador solo gasta desde
//    la red de Tailscale (una contraseña robada en el enlace público no gasta).
//  - A un alumno nunca se le cuenta el estado del dueño (saldo, claves, pausas): solo «con IA», «en espera» o «básico».
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { vieneDeTailscale } from '../nucleo/red.js';
import { espacioDe } from '../cuentas/espacios.js';
import { encolar } from '../tareas/cola.js';
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { leerConfigIa, esEspacioAdmin, MODELOS_INSTRUCTOR } from '../ia/config.js';
import { disponibilidad } from '../ia/presupuesto.js';
import { PROPOSITOS } from '../ia/propositos.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { camino } from '../academia/progreso.js';
import { consejoInstructor, modeloAlumno, resumenModelo, respuestaDelAlumno, reexplicarSinIa, dudaSinIa, tarjetasParaDuda } from '../academia/instructor.js';
import { armarExplicacion, armarConsejo, armarDuda, leerGuardado, DUDA_MAX_LETRAS } from '../academia/instructor-ia.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;
const HORA = 60 * 60 * 1000;
// Lo que se le dice a un alumno de por qué no hay IA ahora (nada del estado del dueño).
const MOTIVOS_ALUMNO = new Set(['tope_espacio', 'sin_presupuesto', 'cuenta_sin_permiso', 'demasiadas_llamadas', 'trabajo_en_pausa', 'solo_tailnet', 'ia_apagada']);
// Los que no se pasan solos (sin un cambio del dueño): «básico». Los demás (un tope lleno este mes, una pausa corta,
// demasiadas llamadas en la hora): «en espera».
const SIN_IA = new Set(['ia_apagada', 'ayuda_no_activada', 'cuenta_sin_permiso', 'proveedor_no_usado', 'sin_clave', 'clave_ilegible', 'llave_no_disponible',
  'precio_sin_confirmar', 'llamada_muy_cara', 'solo_tailnet']);
const RESULTADO_ALUMNO = new Set(['ok', 'caducada', 'tope_espacio', 'demasiadas_llamadas', 'rechazada', 'respuesta_no_valida', 'respuesta_incompleta', 'no_se_pudo_guardar', 'demasiado_largo']);
const TAMANO_TIPICO = 4_000;

export function crearLimitesInstructor() {
  return {
    lecturas: new Limitador({ maximo: 600, ventanaMs: DIEZ_MINUTOS }),
    explicar: new Limitador({ maximo: 40, ventanaMs: DIEZ_MINUTOS }),
    duda: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
    consejo: new Limitador({ maximo: 6, ventanaMs: HORA }),
  };
}

// La semana (lunes a domingo, hora de Santo Domingo) para el consejo semanal: «2026-11-09».
export function semanaDe(ms) {
  const d = new Date(ms - 4 * 3600 * 1000);
  const dia = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dia)).toISOString().slice(0, 10);
}

export function registrarRutasInstructor(rutas, { config = null, supervisor = null, limites = {}, reloj = Date.now } = {}) {
  const topes = { ...crearLimitesInstructor(), ...(limites ?? {}) };
  reloj ??= Date.now;
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };
  const activo = db => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); return paqueteActivo(db, config); };
  const trabajadorEncendido = () => {
    try {
      const fase = supervisor?.estado ? supervisor.estado().fase : null;
      return fase == null || !['modo_seguro', 'parando'].includes(fase);
    } catch { return true; }
  };

  // ¿Este alumno tiene ahora un instructor con IA? { modo: 'ia' | 'espera' | 'basico', motivo, modelo? (solo admin) }.
  function estadoInstructor(db, req, usuario, ahora = reloj()) {
    const basico = motivo => ({ modo: 'basico', motivo });
    if (!config) return basico('no_disponible');
    const cfg = leerConfigIa(db);
    if (!cfg.encendida || !cfg.instructorIa) return basico('ia_apagada');
    const e = espacioDe(db, usuario);
    if (!e) return basico('no_disponible');
    const admin = esEspacioAdmin(db, e.id);
    const decir = (modo, motivo) => ({ modo, motivo: admin || MOTIVOS_ALUMNO.has(motivo) ? motivo : 'no_disponible', ...(admin ? { modelo: cfg.instructorModelo } : {}) });
    if (admin && !vieneDeTailscale(req).si) return decir('basico', 'solo_tailnet');
    const d = disponibilidad(db, { config, espacioId: e.id, proposito: 'instructor_explicar', entradaMax: TAMANO_TIPICO, ahora });
    if (d.disponible) {
      if (leerModoSeguro(db).activo || !trabajadorEncendido()) return decir('espera', 'trabajo_en_pausa');
      return decir('ia', 'ok');
    }
    // Un tope de plan en US$0 no se llena: esa cuenta no tiene presupuesto de IA (básico, no «en espera»).
    if (SIN_IA.has(d.motivo) || (d.motivo === 'tope_espacio' && !(d.topeMicro > 0))) return decir('basico', d.motivo === 'tope_espacio' ? 'sin_presupuesto' : d.motivo);
    return decir('espera', d.motivo);
  }

  // Pone en la fila el pedido a la IA. → { estado: 'pendiente', tarea } o { estado: 'no', motivo }.
  function pedirIa(db, usuario, { uso, sistema, texto, clave, extra = {} }) {
    if (Buffer.byteLength(sistema) + Buffer.byteLength(texto) > PROPOSITOS[uso].entradaMaxBytes) return { estado: 'no', motivo: 'demasiado_largo' };
    const e = espacioDe(db, usuario);
    const ahora = reloj();
    const r = encolar(db, { tipo: 'academia.instructor', espacioId: e.id, creadaPor: usuario.id, datos: { uso, sistema, texto, clave, usuarioId: usuario.id, pedidaEn: ahora, ...extra } }, { ahora });
    try { supervisor?.despertar?.(); } catch { /* la toma en su próxima vuelta (5 s) */ }
    return { estado: 'pendiente', tarea: r.id };
  }
  const lista = (guardado, extra = {}) => ({ estado: 'lista', ...guardado, ...extra });

  // ---------- «Tu instructor dice…» (Inicio, o al empezar un tema con ?materia=&tema=) ----------
  rutas.agregar('GET', '/api/academia/instructor', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    const p = activo(db);
    const consulta = new URL(req.url, 'http://x').searchParams;
    const materia = consulta.get('materia');
    const tema = consulta.get('tema');
    const ahora = reloj();
    const datos = consejoInstructor(db, usuario.id, p, ahora, materia && tema ? { materia, tema } : null);
    const guardado = leerGuardado(db, `academia.ia.consejo.${usuario.id}.${semanaDe(ahora)}`);
    return { codigo: 200, datos: { instructor: estadoInstructor(db, req, usuario, ahora), ...datos, consejoIa: guardado ? lista(guardado) : null } };
  });

  // ---------- «Explícamelo de otra forma» ----------
  rutas.agregar('POST', '/api/academia/instructor/explicar', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.explicar, usuario);
    if (!Number.isSafeInteger(datos?.intento) || typeof datos?.pregunta !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
    const p = activo(db);
    const ahora = reloj();
    const r = respuestaDelAlumno(db, usuario.id, p, datos.intento, datos.pregunta); // 404 si no la respondió en SU intento
    const modelo = modeloAlumno(db, usuario.id, p, ahora);
    const basica = reexplicarSinIa(db, usuario.id, p, r, modelo.estilo);
    const instructor = estadoInstructor(db, req, usuario, ahora);
    let ia = null;
    if (datos.ia === true && instructor.modo === 'ia') {
      const cfg = leerConfigIa(db);
      const pedido = armarExplicacion({ q: r.q, elegida: r.elegida, acierto: r.acierto, modo: r.modo, idea: basica.idea, tarjeta: basica.tarjeta, alumno: { estilo: modelo.estilo }, idioma: usuario.idioma, modelo: cfg.instructorModelo });
      const ya = leerGuardado(db, pedido.clave);
      ia = ya ? lista(ya) : pedirIa(db, usuario, { uso: 'instructor_explicar', sistema: pedido.sistema, texto: pedido.texto, clave: pedido.clave, extra: { correcta: pedido.correcta, opciones: pedido.opciones } });
    } else if (datos.ia === true) ia = { estado: 'no', motivo: instructor.motivo };
    return { codigo: 200, datos: { instructor, basica, ia } };
  });

  // ---------- El consejo de la semana (o de un examen suyo que ya terminó) ----------
  rutas.agregar('POST', '/api/academia/instructor/consejo', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.consejo, usuario);
    const p = activo(db);
    const ahora = reloj();
    let examen = null;
    if (datos?.examen != null) {
      if (!Number.isSafeInteger(datos.examen)) throw new ErrorHttp(400, 'datos_no_validos');
      examen = db.prepare("SELECT id, materia, total, aciertos, aprobado FROM academia_intentos WHERE id = ? AND usuario_id = ? AND terminado_en IS NOT NULL").get(datos.examen, usuario.id);
      if (!examen) throw new ErrorHttp(404, 'no_existe');
    }
    const base = consejoInstructor(db, usuario.id, p, ahora);
    const instructor = estadoInstructor(db, req, usuario, ahora);
    const clave = `academia.ia.consejo.${usuario.id}.${examen ? `examen-${examen.id}` : semanaDe(ahora)}`;
    const ya = leerGuardado(db, clave);
    let ia;
    if (ya) ia = lista(ya);
    else if (instructor.modo !== 'ia') ia = { estado: 'no', motivo: instructor.motivo };
    else {
      const m = modeloAlumno(db, usuario.id, p, ahora);
      const falladas = examen ? db.prepare('SELECT tema, COUNT(*) AS n FROM academia_respuestas WHERE intento_id = ? AND correcta = 0 GROUP BY tema ORDER BY n DESC LIMIT 5').all(examen.id) : [];
      const titulo = (materia, tema) => p?.materias.find(x => x.id === materia)?.temas.find(x => x.id === tema)?.titulo ?? tema;
      // Solo cifras y textos del paquete: nunca el nombre ni el usuario del alumno.
      const cifras = {
        ...resumenModelo(m), ideas: m.ideas.map(x => ({ idea: x.idea, tema: titulo(x.materia, x.tema), veces: x.fallos })),
        repite_misma_opcion: m.repetidas.map(x => ({ tema: titulo(x.materia, x.tema), veces: x.veces, idea: x.idea })),
        consejo_basico: base.consejo?.clave ?? null,
        examen: examen ? { materia: examen.materia, pct: examen.total ? Math.floor((examen.aciertos * 100) / examen.total) : 0, aprobado: examen.aprobado === 1, temas_fallados: falladas.map(f => ({ tema: titulo(examen.materia, f.tema), errores: f.n })) } : null,
      };
      const pedido = armarConsejo({ cifras, idioma: usuario.idioma });
      ia = pedirIa(db, usuario, { uso: 'instructor_consejo', sistema: pedido.sistema, texto: pedido.texto, clave });
    }
    return { codigo: 200, datos: { instructor, ...base, ia } };
  });

  // ---------- Una duda escrita sobre un tema (abierto) ----------
  rutas.agregar('POST', '/api/academia/instructor/duda', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.duda, usuario);
    const materia = textoDe(datos, 'materia');
    const tema = textoDe(datos, 'tema');
    const texto = textoDe(datos, 'texto').trim();
    if (texto.length < 3 || texto.length > DUDA_MAX_LETRAS) throw new ErrorHttp(400, 'duda_no_valida');
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    const ahora = reloj();
    const estado = camino(db, usuario.id, p, ahora).materias.find(m => m.id === materia)?.temas.find(t => t.id === tema)?.estado;
    if (!estado) throw new ErrorHttp(404, 'no_existe');
    if (estado === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
    const basica = dudaSinIa(p, materia, tema, texto);
    const instructor = estadoInstructor(db, req, usuario, ahora);
    let ia = null;
    if (instructor.modo === 'ia') {
      const material = tarjetasParaDuda(p, materia, tema, texto, 3_500);
      const pedido = armarDuda({ material, pregunta: texto, alumno: { estilo: modeloAlumno(db, usuario.id, p, ahora).estilo }, idioma: usuario.idioma });
      ia = pedirIa(db, usuario, { uso: 'instructor_duda', sistema: pedido.sistema, texto: pedido.texto, clave: `academia.ia.duda.${usuario.id}.${ahora}`, extra: { pregunta: texto } });
    } else ia = { estado: 'no', motivo: instructor.motivo };
    return { codigo: 200, datos: { instructor, basica, ia } };
  });

  // ---------- ¿Ya llegó lo de la IA? (solo una tarea suya) ----------
  rutas.agregar('GET', '/api/academia/instructor/tareas/:id', ({ db, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    const id = Number(parametros.id);
    const e = espacioDe(db, usuario);
    const f = Number.isSafeInteger(id) && e ? db.prepare("SELECT estado, datos, resultado FROM tareas WHERE id = ? AND tipo = 'academia.instructor' AND espacio_id = ? AND creada_por = ?").get(id, e.id, usuario.id) : null;
    if (!f) throw new ErrorHttp(404, 'no_existe');
    if (f.estado === 'lista' || f.estado === 'en_curso') return { codigo: 200, datos: { estado: 'pendiente' } };
    let clave = null;
    let resultado = null;
    try { clave = JSON.parse(f.datos)?.clave ?? null; } catch { clave = null; }
    try { resultado = f.resultado ? JSON.parse(f.resultado) : null; } catch { resultado = null; }
    const guardado = f.estado === 'hecha' ? leerGuardado(db, clave) : null;
    if (guardado) return { codigo: 200, datos: lista(guardado) };
    const motivo = typeof resultado?.motivo === 'string' ? resultado.motivo : 'no_disponible';
    const admin = esEspacioAdmin(db, e.id);
    return { codigo: 200, datos: { estado: 'no', motivo: admin || RESULTADO_ALUMNO.has(motivo) ? motivo : 'no_disponible' } };
  });

  // ---------- El administrador: qué alumnos tienen ahora un instructor con IA ----------
  rutas.agregar('GET', '/api/admin/academia/instructor', ({ db, req }) => {
    const cfg = leerConfigIa(db);
    const usuarios = db.prepare("SELECT id, nombre, nombre_visible, rol, idioma FROM usuarios WHERE activo = 1 ORDER BY rol, nombre").all();
    const ahora = reloj();
    const alumnos = usuarios.map(u => ({ id: u.id, nombre: u.nombre_visible || u.nombre, rol: u.rol, ...estadoInstructor(db, req, u, ahora) }));
    return { codigo: 200, datos: { encendido: cfg.encendida && cfg.instructorIa, iaEncendida: cfg.encendida, instructorIa: cfg.instructorIa, modelo: cfg.instructorModelo, modelos: [...MODELOS_INSTRUCTOR], alumnos } };
  }, { admin: true });
}
