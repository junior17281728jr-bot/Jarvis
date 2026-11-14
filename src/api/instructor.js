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
import { espacioDe } from '../cuentas/espacios.js';
import { encolar } from '../tareas/cola.js';
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { leerConfigIa, esEspacioAdmin, MODELOS_INSTRUCTOR } from '../ia/config.js';
import { disponibilidad } from '../ia/presupuesto.js';
import { PROPOSITOS } from '../ia/propositos.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { camino } from '../academia/progreso.js';
import { repasoOral } from '../academia/oral.js';
import { consejoInstructor, modeloAlumno, resumenModelo, respuestaDelAlumno, reexplicarSinIa, dudaSinIa, tarjetasParaDuda } from '../academia/instructor.js';
import { cortarBytes } from '../academia/instructor.js';
import { armarExplicacion, armarConsejo, armarDuda, leerGuardado, DUDA_MAX_LETRAS, preguntaSinIa, armarMiniClase, armarPlanDia } from '../academia/instructor-ia.js';
import { enTransaccion } from '../nucleo/db.js';
import { cobrarUso, yaPagado, ponerTareaAlUso, novedadesPagos } from '../academia/tiempo-ia.js';
import { sincronizarFallas, fallasDe, planParaPasar, miRepaso, miniClase } from '../academia/fallas.js';
import { conceptoDePregunta, concepto as conceptoPorClave, nombreConcepto } from '../academia/conceptos.js';
import { accionesDeHoy, planBasico, notaPersonal } from '../academia/plan-dia.js';
import { ideaDe } from '../academia/reto.js';
import { tiempoDe } from './pagos.js';
import { permisoProfesor, darProfesor, leerVideos, guardarVideos, videosDeTema, anotarMensaje, historialParaVer, contextoChat, busquedaYoutube, respondidasParecidas } from '../academia/profesor.js';
import { armarChat } from '../academia/instructor-ia.js';
import { diagnostico, cifrasConsejo, consejoParaVer } from '../academia/consejo-ia.js';
import { veredicto } from '../academia/preparado.js';
import { estadisticas, anotarExplicado } from '../academia/aprendizaje.js';
import { iaPermitida } from '../cuentas/terminos.js';
import { humorActivo } from '../academia/humor.js';
import { guardarAjuste, leerAjuste } from '../academia/paquetes.js';
import { contarReuso } from '../academia/registro-ia.js';
import { registrarRutasTutor, personalParaVer, progresoPersonal } from './tutor.js';
import { memoriaParaIa, leerSenales, preferencias, preguntasDeMateria } from '../academia/tutor.js';
import { datosPreparacion, leerPuntero, guardarPuntero, ultimaActividad, preparadoConIa, preparadoBasico, diaRd, PREPARAR } from '../academia/preparar-clase.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;
const HORA = 60 * 60 * 1000;
// Lo que se le dice a un alumno de por qué no hay IA ahora (nada del estado del dueño).
const MOTIVOS_ALUMNO = new Set(['sin_consentimiento', 'sin_minutos', 'tope_espacio', 'sin_presupuesto', 'cuenta_sin_permiso', 'demasiadas_llamadas', 'trabajo_en_pausa', 'solo_tailnet', 'ia_apagada']);
// Los que no se pasan solos (sin un cambio del dueño): «básico». Los demás (un tope lleno este mes, una pausa corta,
// demasiadas llamadas en la hora): «en espera».
const SIN_IA = new Set(['ia_apagada', 'ayuda_no_activada', 'cuenta_sin_permiso', 'proveedor_no_usado', 'sin_clave', 'clave_ilegible', 'llave_no_disponible',
  'precio_sin_confirmar', 'llamada_muy_cara', 'solo_tailnet']);
const RESULTADO_ALUMNO = new Set(['ok', 'sin_minutos', 'caducada', 'tope_espacio', 'demasiadas_llamadas', 'rechazada', 'respuesta_no_valida', 'respuesta_incompleta', 'no_se_pudo_guardar', 'demasiado_largo']);
const TAMANO_TIPICO = 4_000;

export function crearLimitesInstructor() {
  return {
    lecturas: new Limitador({ maximo: 600, ventanaMs: DIEZ_MINUTOS }),
    explicar: new Limitador({ maximo: 40, ventanaMs: DIEZ_MINUTOS }),
    duda: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
    consejo: new Limitador({ maximo: 6, ventanaMs: HORA }),
    chat: new Limitador({ maximo: 20, ventanaMs: DIEZ_MINUTOS }),
  };
}

// La semana (lunes a domingo, hora de Santo Domingo) para el consejo semanal: «2026-11-09».
export function semanaDe(ms) {
  const d = new Date(ms - 4 * 3600 * 1000);
  const dia = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dia)).toISOString().slice(0, 10);
}

// 0.14.15: el consejo nuevo (corto, con botones) se guarda con «-v2»: el de antes (un muro de texto) se queda en la base,
// pero ya no se muestra en Inicio; al pedirlo otra vez se escribe el nuevo.
export const claveConsejo = (usuarioId, que, humor) => `academia.ia.consejo.${usuarioId}.${que}${humor ? '-humor' : ''}-v2`;

export function registrarRutasInstructor(rutas, { config = null, supervisor = null, limites = {}, reloj = Date.now, ganchos = null } = {}) {
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
    // 0.11.0: activó la academia sin IA (o la retiró en «Mis datos»): nada va a la IA.
    if (!iaPermitida(db, usuario.id, { estricto: config.terminosObligatorios !== false })) return basico('sin_consentimiento');
    const cfg = leerConfigIa(db);
    if (!cfg.encendida || !cfg.instructorIa) return basico('ia_apagada');
    const e = espacioDe(db, usuario);
    if (!e) return basico('no_disponible');
    const admin = esEspacioAdmin(db, e.id);
    const decir = (modo, motivo) => ({ modo, motivo: admin || MOTIVOS_ALUMNO.has(motivo) ? motivo : 'no_disponible', ...(admin ? { modelo: cfg.instructorModelo } : {}) });
    // 0.12.3: el instructor con IA del administrador también por el enlace público (antes, solo desde Tailscale).
    const d = disponibilidad(db, { config, espacioId: e.id, proposito: 'instructor_explicar', entradaMax: TAMANO_TIPICO, ahora });
    if (d.disponible) {
      if (leerModoSeguro(db).activo || !trabajadorEncendido()) return decir('espera', 'trabajo_en_pausa');
      // 0.10.0: su tiempo con IA. Sin minutos, el instructor básico (gratis) hasta que pida más.
      const tiempo = tiempoDe(db, usuario, ahora, { estricto: config?.terminosObligatorios !== false });
      // 0.12.7: sin plan, sin prueba (o sin sus usos de hoy) y sin minutos de antes: lo básico (la clave de siempre).
      if (!tiempo.ilimitado && !tiempo.puede) return decir('basico', 'sin_minutos');
      return decir('ia', 'ok');
    }
    // Un tope de plan en US$0 no se llena: esa cuenta no tiene presupuesto de IA (básico, no «en espera»).
    if (SIN_IA.has(d.motivo) || (d.motivo === 'tope_espacio' && !(d.topeMicro > 0))) return decir('basico', d.motivo === 'tope_espacio' ? 'sin_presupuesto' : d.motivo);
    return decir('espera', d.motivo);
  }

  // Pone en la fila el pedido a la IA. → { estado: 'pendiente', tarea } o { estado: 'no', motivo }.
  // 0.10.0: cada uso nuevo cuesta minutos de su tiempo con IA (se cobra al pedirlo y se devuelve solo si la IA no
  // responde); ver otra vez lo mismo no se cobra. La cuenta del administrador no tiene límite.
  function pedirIa(db, usuario, { uso, sistema, texto, clave, extra = {} }) {
    if (!iaPermitida(db, usuario.id, { estricto: config?.terminosObligatorios !== false })) return { estado: 'no', motivo: 'sin_consentimiento' };
    if (Buffer.byteLength(sistema) + Buffer.byteLength(texto) > PROPOSITOS[uso].entradaMaxBytes) return { estado: 'no', motivo: 'demasiado_largo' };
    const e = espacioDe(db, usuario);
    const ahora = reloj();
    const ilimitado = esEspacioAdmin(db, e.id);
    const pagado = ilimitado || yaPagado(db, usuario.id, clave);
    try {
      return enTransaccion(db, () => {
        if (!pagado) cobrarUso(db, usuario.id, { referencia: clave, ahora });
        const r = encolar(db, { tipo: 'academia.instructor', espacioId: e.id, creadaPor: usuario.id, datos: { uso, sistema, texto, clave, usuarioId: usuario.id, pedidaEn: ahora, ...extra } }, { ahora });
        if (!pagado) ponerTareaAlUso(db, usuario.id, clave, r.id);
        try { supervisor?.despertar?.(); } catch { /* la toma en su próxima vuelta (5 s) */ }
        return { estado: 'pendiente', tarea: r.id };
      });
    } catch (error) {
      if (error?.clave === 'sin_minutos') return { estado: 'no', motivo: 'sin_minutos' };
      throw error;
    }
  }
  // Lo que ya estaba guardado (otro alumno pidió lo mismo): no costó, pero es un uso de su tiempo con IA (una vez).
  function deGuardado(db, usuario, clave, guardado) {
    // 0.12.9: para el «Registro de la IA»: cuántas veces lo guardado sirvió otra vez (el ahorro).
    try { contarReuso(db, clave); } catch { /* solo una cuenta */ }
    const e = espacioDe(db, usuario);
    if (!esEspacioAdmin(db, e.id) && !yaPagado(db, usuario.id, clave)) {
      try { cobrarUso(db, usuario.id, { referencia: clave, ahora: reloj() }); } catch (error) {
        if (error?.clave === 'sin_minutos') return { estado: 'no', motivo: 'sin_minutos' };
        throw error;
      }
    }
    return lista(guardado);
  }
  const lista = (guardado, extra = {}) => ({ estado: 'lista', ...guardado, ...extra });
  // 0.12.4: sin IA para él por algo que no se pasa solo (sin clave, la IA apagada, sin su permiso, sin presupuesto…):
  // ia = null (la pantalla muestra solo lo básico, sin ningún «no pudo»). Solo lo pasajero dice algo: una pausa corta
  // («en espera») o sin minutos (con «Pedir más», porque la IA sí está lista para él).
  const iaNoAhora = instructor => (instructor.modo === 'espera' ? { estado: 'no', motivo: instructor.motivo, espera: true }
    : instructor.motivo === 'sin_minutos' ? { estado: 'no', motivo: 'sin_minutos' } : null);

  // ---------- 0.12.7: «Preparar tu próxima clase» (el ÚNICO trabajo de la IA que no espera una pantalla) ----------
  // Lo llama src/app.js cuando el alumno termina una sesión (finDeSesion). Las revisiones van de lo más barato a lo más
  // caro (ver src/academia/preparar-clase.js); cualquier «no» termina sin escribir nada. → { motivo, tarea? }.
  function prepararProximaClase(db, usuario, como = 'fin', ahora = reloj()) {
    if (!config || !usuario?.id) return { motivo: 'no_disponible' };
    const cfg = leerConfigIa(db);
    if (!cfg.encendida || !cfg.instructorIa || !cfg.prepararClase) return { motivo: 'apagado' };
    const dia = diaRd(ahora);
    const pt = leerPuntero(db, usuario.id);
    if (pt?.dia === dia) return { motivo: 'ya_hoy' };
    const ultima = ultimaActividad(db, usuario.id);
    if (ultima == null || ahora - ultima > PREPARAR.activoMs) return { motivo: 'inactivo' };
    if (pt?.en && ultima <= Date.parse(pt.en)) return { motivo: 'sin_novedad' };
    if (estadoInstructor(db, null, usuario, ahora).modo !== 'ia') return { motivo: 'sin_ia' };
    const p = activo(db);
    if (!p) return { motivo: 'sin_paquete' };
    const d = datosPreparacion(db, usuario.id, p, { idioma: usuario.idioma, ahora });
    if (!d) return { motivo: 'sin_tema' };
    // Sin cambios Y con lo de la última vez guardado: nada. (Si la última no llegó a guardarse, se puede otra vez.)
    if (pt?.huella === d.huella && leerGuardado(db, pt.clave)) return { motivo: 'sin_cambios' };
    if (Buffer.byteLength(d.prefijo.sistema) + Buffer.byteLength(d.texto) > PROPOSITOS.instructor_preparar.entradaMaxBytes) return { motivo: 'demasiado_largo' };
    const e = espacioDe(db, usuario);
    const clave = `academia.ia.preparado.${usuario.id}.${d.huella}`;
    const r = enTransaccion(db, () => {
      // El prefijo (igual para todos los que preparan ese tema) se guarda una vez por su huella.
      if (leerAjuste(db, d.prefijo.clave) == null) guardarAjuste(db, d.prefijo.clave, d.prefijo.sistema);
      const t = encolar(db, {
        tipo: 'academia.instructor', espacioId: e.id, creadaPor: usuario.id, claveUnica: `preparar:${usuario.id}:${dia}`,
        datos: { uso: 'instructor_preparar', prefijo: d.prefijo.clave, texto: d.texto, clave, huella: d.huella, usuarioId: usuario.id, pedidaEn: ahora, tema: d.tema, tarjetas: d.tarjetas, citas: d.citas, sinResponder: d.sinResponder, como },
      }, { ahora });
      guardarPuntero(db, usuario.id, { dia, huella: d.huella, tema: d.tema, clave, tarea: t.id, en: new Date(ahora).toISOString() });
      return t;
    });
    try { supervisor?.despertar?.(); } catch { /* la toma en su próxima vuelta */ }
    return { motivo: 'ok', tarea: r.id };
  }
  if (ganchos) {
    ganchos.finDeSesion = (db, usuario, como) => {
      try { return prepararProximaClase(db, usuario, como); } catch (error) {
        console.error('preparar la próxima clase:', error?.name ?? 'Error');
        return { motivo: 'error' };
      }
    };
  }

  // 0.12.9: el tutor del alumno (src/api/tutor.js), con el mismo estado de la IA, el mismo cobro y la misma fila.
  registrarRutasTutor(rutas, { estadoInstructor, pedirIa, deGuardado, iaNoAhora, lista, contar, topes, activo, reloj, config });

  // «Preparado para ti» al abrir un tema: lo de la IA si se preparó ESE tema y la IA está para él; si no, lo básico.
  rutas.agregar('GET', '/api/academia/instructor/preparado/:materia/:tema', ({ db, req, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    const ahora = reloj();
    const estado = camino(db, usuario.id, p, ahora).materias.find(m => m.id === parametros.materia)?.temas.find(t => t.id === parametros.tema)?.estado;
    if (!estado) throw new ErrorHttp(404, 'no_existe');
    const instructor = estadoInstructor(db, req, usuario, ahora);
    const ia = instructor.modo === 'ia' ? preparadoConIa(db, usuario.id, p, parametros.materia, parametros.tema) : null;
    return { codigo: 200, datos: { ia: ia ? { estado: 'lista', ...ia } : null, basico: preparadoBasico(db, usuario.id, p, parametros.materia, parametros.tema, ahora) } };
  });

  // ---------- «Tu instructor dice…» (Inicio, o al empezar un tema con ?materia=&tema=) ----------
  // Inicio: GET /api/academia/instructor. Al abrir un tema: GET /api/academia/instructor/tema/:materia/:tema (o ?materia=&tema=).
  rutas.agregar('GET', '/api/academia/instructor', ({ db, req, usuario }) => {
    const consulta = new URL(req.url, 'http://x').searchParams;
    return instructorDe(db, req, usuario, consulta.get('materia'), consulta.get('tema'));
  });
  rutas.agregar('GET', '/api/academia/instructor/tema/:materia/:tema', ({ db, req, usuario, parametros }) => instructorDe(db, req, usuario, parametros.materia, parametros.tema));
  function instructorDe(db, req, usuario, materia, tema) {
    contar(topes.lecturas, usuario);
    const p = activo(db);
    const ahora = reloj();
    const donde = materia && tema ? { materia, tema } : null;
    const datos = consejoInstructor(db, usuario.id, p, ahora, donde);
    // 0.12.0: con el humor encendido, el consejo de la IA va guardado aparte (en ese tono).
    const guardado = leerGuardado(db, claveConsejo(usuario.id, semanaDe(ahora), humorActivo(db, usuario.id)));
    // 0.10.0: su plan de refuerzo (las fallas que todavía tiene). 0.12.2: abrir un tema ya no pone ninguna tarjeta de
    // refuerzo en la clase (la clase sigue normal: lo de los errores vive en «Mi repaso»), así que «refuerzo» va vacío.
    const fallas = p ? fallasDe(db, usuario.id, p, ahora) : [];
    const refuerzo = null;
    return {
      codigo: 200,
      datos: {
        instructor: estadoInstructor(db, req, usuario, ahora), ...datos, consejoIa: guardado ? lista(consejoParaVer(guardado, diagnostico(db, usuario.id, p, ahora))) : null,
        tiempo: tiempoDe(db, usuario, ahora, { estricto: config?.terminosObligatorios !== false }), pagos: novedadesPagos(db, usuario.id), demoIa: usuario.rol === 'admin',
        plan: fallas.filter(f => f.estado !== 'superada' && f.cuenta), recientes: fallas.slice(0, 3), ...(donde ? { refuerzo } : {}),
      },
    };
  }

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
    // 0.10.0: si esa pregunta es una de sus fallas registradas, se le dice (y cuántas veces).
    sincronizarFallas(db, usuario.id, p, ahora);
    // 0.12.2: también si su concepto está en «Mi repaso».
    const falla = db.prepare("SELECT fallos, estado FROM academia_fallas WHERE usuario_id = ? AND clave IN (?, ?) AND estado <> 'superada' ORDER BY id DESC LIMIT 1")
      .get(usuario.id, `q:${r.q.id}`, conceptoDePregunta(p, r.q.id)?.clave ?? '');
    if (falla) basica.falla = { fallos: falla.fallos, estado: falla.estado };
    // 0.12.4: la «nota para ti» (su historia con ese concepto), encima de la explicación compartida. Sin IA y sin costo.
    basica.nota = notaPersonal(db, usuario.id, p, r.q.id, r.modo === 'original' ? r.elegida : null);
    const instructor = estadoInstructor(db, req, usuario, ahora);
    let ia = null;
    // 0.12.4: una pregunta en la que la IA contradijo al Test Guide 2 veces queda 7 días con lo básico (sin «no pudo»).
    const sinIaAqui = preguntaSinIa(db, r.q.id, ahora);
    if (datos.ia === true && instructor.modo === 'ia' && !sinIaAqui) {
      const cfg = leerConfigIa(db);
      const pedido = armarExplicacion({ q: r.q, elegida: r.elegida, acierto: r.acierto, modo: r.modo, idea: basica.idea, tarjeta: basica.tarjeta, alumno: { estilo: modelo.estilo }, idioma: usuario.idioma, modelo: cfg.instructorModelo });
      const ya = leerGuardado(db, pedido.clave);
      ia = ya ? deGuardado(db, usuario, pedido.clave, ya) : pedirIa(db, usuario, { uso: 'instructor_explicar', sistema: pedido.sistema, texto: pedido.texto, clave: pedido.clave, extra: { correcta: pedido.correcta, opciones: pedido.opciones, preguntaId: r.q.id } });
    } else if (sinIaAqui) ia = null;
    else if (datos.ia === true) ia = iaNoAhora(instructor);
    // 0.10.0: para «Aprendizaje»: ¿acertó la siguiente vez después de que se lo explicaron (con IA o sin IA)?
    anotarExplicado(db, usuario.id, { pregunta: r.q.id, ia: ia?.estado === 'pendiente' || ia?.estado === 'lista', ahora });
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
    // 0.12.0: con el humor encendido para él, el consejo de la IA viene en ese tono (y se guarda aparte).
    const conHumor = humorActivo(db, usuario.id);
    const clave = claveConsejo(usuario.id, examen ? `examen-${examen.id}` : semanaDe(ahora), conHumor);
    // 0.14.15: el diagnóstico (temas, números, alcance, video, repasos) lo hace el código; la IA solo lo dice corto.
    const diag = diagnostico(db, usuario.id, p, ahora, { examenId: examen?.id ?? null });
    const ya = leerGuardado(db, clave);
    let ia;
    if (ya) ia = lista(consejoParaVer(ya, diag));
    else if (instructor.modo !== 'ia') ia = iaNoAhora(instructor);
    else if (!diag.temas.length) ia = { estado: 'no', motivo: 'sin_fallas' }; // nada que corregir: no se paga por un «vas bien»
    else {
      // Solo cifras y textos del paquete: nunca el nombre ni el usuario del alumno.
      const cifras = cifrasConsejo(diag, { examen: examen ? { materia: examen.materia, pct: examen.total ? Math.floor((examen.aciertos * 100) / examen.total) : 0, aprobado: examen.aprobado === 1 } : null });
      const pedido = armarConsejo({ cifras, idioma: usuario.idioma, humor: conHumor });
      ia = pedirIa(db, usuario, { uso: 'instructor_consejo', sistema: pedido.sistema, texto: pedido.texto, clave, extra: { forma: 2, temas: diag.temas.map(t => t.id), vio: diag.temas.map(t => ({ id: t.id, bien: t.bien, de: t.de })), videoId: diag.video && diag.video.tipo !== 'buscar' ? diag.video.id : null } });
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
      const material = tarjetasParaDuda(p, materia, tema, texto, 8_000);
      // 0.12.4: también las preguntas del Test Guide de ese tema que ya respondió (para que cite la de verdad).
      const preguntas = respondidasParecidas(db, usuario.id, p, texto, { donde: { materia, tema } });
      const pedido = armarDuda({ material, pregunta: texto, preguntas, alumno: { estilo: modeloAlumno(db, usuario.id, p, ahora).estilo }, idioma: usuario.idioma });
      ia = pedirIa(db, usuario, { uso: 'instructor_duda', sistema: pedido.sistema, texto: pedido.texto, clave: `academia.ia.duda.${usuario.id}.${ahora}`, extra: { pregunta: texto, citas: pedido.citas } });
    } else ia = iaNoAhora(instructor);
    return { codigo: 200, datos: { instructor, basica, ia } };
  });

  // ---------- 0.10.0: «Lo que hicimos por ti» (todas sus fallas, también las superadas) ----------
  rutas.agregar('GET', '/api/academia/instructor/fallas', ({ db, usuario }) => {
    contar(topes.lecturas, usuario);
    return { codigo: 200, datos: { fallas: fallasDe(db, usuario.id, activo(db), reloj()) } };
  });

  // ---------- 0.12.2: «Mi repaso» (todo lo que falló, y los conceptos para repasar) y la mini-clase de un concepto ----------
  rutas.agregar('GET', '/api/academia/mi-repaso', ({ db, usuario }) => {
    contar(topes.lecturas, usuario);
    // 0.12.9 (O): las preguntas personalizadas cuentan en el progreso de «Mi repaso» (nunca en el % del Test Guide).
    // 0.13.1: lo del examen oral va aparte (sus errores, por tema), en su propia sección.
    const p = activo(db);
    return { codigo: 200, datos: { ...miRepaso(db, usuario.id, p, reloj()), personal: progresoPersonal(db, usuario.id), oral: repasoOral(db, usuario.id, p) } };
  });
  rutas.agregar('GET', '/api/academia/mi-repaso/clase', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    const ahora = reloj();
    const datos = miniClase(db, usuario.id, activo(db), new URL(req.url, 'http://x').searchParams.get('concepto') ?? '', ahora);
    // «Explícamelo de otra forma (IA)» solo si de verdad hay instructor con IA para él (minutos, permiso y clave).
    return { codigo: 200, datos: { ...datos, ia: estadoInstructor(db, req, usuario, ahora).modo === 'ia' } };
  });

  // ---------- 0.12.4: la «Mini-clase IA» de un concepto de «Mi repaso» (se guarda compartida; se cobra como explicar) ----------
  rutas.agregar('POST', '/api/academia/mi-repaso/clase/ia', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.explicar, usuario);
    const p = activo(db);
    const ahora = reloj();
    const clase = miniClase(db, usuario.id, p, textoDe(datos, 'concepto'), ahora); // 404 / 403 como la mini-clase
    const instructor = estadoInstructor(db, req, usuario, ahora);
    const q = clase.pregunta ? p.preguntas.get(clase.pregunta.id) : null;
    if (!q) throw new ErrorHttp(409, 'sin_pregunta');
    if (instructor.modo !== 'ia' || preguntaSinIa(db, q.id, ahora)) return { codigo: 200, datos: { instructor, ia: preguntaSinIa(db, q.id, ahora) ? null : iaNoAhora(instructor) } };
    const c = conceptoPorClave(p, clase.clave);
    const t = p.materias.find(m => m.id === c.materia)?.temas.find(x => x.id === c.tema);
    const tarjeta = c.indice >= 0 ? t?.secciones?.[c.indice] ?? null : null;
    const elegida = clase.pregunta.elegida?.letra ?? null;
    const pedido = armarMiniClase({
      concepto: nombreConcepto(c), tarjeta, q, elegida, idea: elegida && elegida !== q.original.correcta ? ideaDe(q, elegida) : null,
      alumno: { estilo: modeloAlumno(db, usuario.id, p, ahora).estilo }, idioma: usuario.idioma, modelo: leerConfigIa(db).instructorModelo,
    });
    const ya = leerGuardado(db, pedido.clave);
    const ia = ya ? deGuardado(db, usuario, pedido.clave, ya)
      : pedirIa(db, usuario, { uso: 'instructor_miniclase', sistema: pedido.sistema, texto: pedido.texto, clave: pedido.clave, extra: { correcta: pedido.correcta, opciones: pedido.opciones, preguntaId: q.id } });
    return { codigo: 200, datos: { instructor, ia, tiempo: tiempoDe(db, usuario, ahora, { estricto: config?.terminosObligatorios !== false }) } };
  });

  // ---------- 0.12.4: el «Plan de hoy» (sin IA: las primeras acciones; con IA: la IA elige y ordena entre ESAS) ----------
  const diaDe = ms => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);
  const conAcciones = (guardado, acciones) => {
    const porId = new Map(acciones.map(a => [a.id, a]));
    const pasos = (guardado.pasos ?? []).filter(x => porId.has(x.accion)).map(x => ({ ...porId.get(x.accion), porque: x.porque ?? '' }));
    return pasos.length ? lista({ titulo: guardado.titulo ?? '', pasos }) : null;
  };
  rutas.agregar('GET', '/api/academia/instructor/plan-hoy', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    const p = activo(db);
    const ahora = reloj();
    const acciones = accionesDeHoy(db, usuario.id, p, ahora);
    const porId = new Map(acciones.map(a => [a.id, a]));
    const guardado = leerGuardado(db, `academia.ia.plandia.${usuario.id}.${diaDe(ahora)}`);
    return { codigo: 200, datos: { instructor: estadoInstructor(db, req, usuario, ahora), basico: planBasico(acciones).map(x => porId.get(x.accion)), ia: guardado ? conAcciones(guardado, acciones) : null } };
  });
  rutas.agregar('POST', '/api/academia/instructor/plan-hoy', async ({ db, req, usuario }) => {
    await leerJson(req);
    contar(topes.consejo, usuario);
    const p = activo(db);
    const ahora = reloj();
    const instructor = estadoInstructor(db, req, usuario, ahora);
    const acciones = accionesDeHoy(db, usuario.id, p, ahora);
    const clave = `academia.ia.plandia.${usuario.id}.${diaDe(ahora)}`;
    const ya = leerGuardado(db, clave);
    let ia;
    if (ya) ia = conAcciones(ya, acciones);
    else if (instructor.modo !== 'ia' || !acciones.length) ia = iaNoAhora(instructor);
    else {
      // Solo cifras y las acciones (con textos del paquete): nunca el nombre ni el usuario del alumno.
      const resumen = resumenModelo(modeloAlumno(db, usuario.id, p, ahora));
      resumen.temas = [...resumen.temas].sort((a, b) => a.pct - b.pct).slice(0, 6);
      const pedido = armarPlanDia({ cifras: resumen, acciones: acciones.map(a => ({ id: a.id, que: `${a.clave}: ${Object.values(a.vars ?? {}).filter(v => typeof v === 'string' || typeof v === 'number').join(' · ')}` })), idioma: usuario.idioma, humor: humorActivo(db, usuario.id) });
      ia = pedirIa(db, usuario, { uso: 'instructor_plan', sistema: pedido.sistema, texto: pedido.texto, clave, extra: { acciones: acciones.map(a => a.id) } });
    }
    return { codigo: 200, datos: { instructor, ia } };
  });

  // ---------- 0.10.0: «Plan para pasar la próxima vez» (un intento suyo terminado) ----------
  const conVideos = (db, plan) => ({ ...plan, temas: plan.temas.map(x => ({ ...x, videos: videosDeTema(db, x.materia, x.tema).map(v => ({ titulo: v.titulo, url: v.url })), buscar: [{ texto: x.titulo, url: busquedaYoutube(x.titulo) }] })) });
  rutas.agregar('GET', '/api/academia/instructor/plan/:intento', ({ db, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    return { codigo: 200, datos: conVideos(db, planParaPasar(db, usuario.id, activo(db), parametros.intento, reloj())) };
  });
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/plan/:intento', ({ db, parametros }) =>
    ({ codigo: 200, datos: conVideos(db, planParaPasar(db, Number(parametros.id), activo(db), parametros.intento, reloj())) }), { admin: true });

  // ---------- 0.10.0: «¿Estás listo para el examen oficial?» (el alumno; el administrador, de cada alumno) ----------
  rutas.agregar('GET', '/api/academia/preparado', ({ db, usuario }) => {
    contar(topes.lecturas, usuario);
    const p = activo(db);
    if (p) sincronizarFallas(db, usuario.id, p, reloj());
    return { codigo: 200, datos: p ? veredicto(db, usuario.id, p, reloj()) : { nivel: 'todavia', reglas: [], porMateria: [], suerte: [], probabilidad: null, siguiente: null } };
  });
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/preparado', ({ db, parametros }) => {
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    sincronizarFallas(db, id, p, reloj());
    return { codigo: 200, datos: veredicto(db, id, p, reloj()) };
  }, { admin: true });
  // Administrador → «Aprendizaje» (de todos, o de un alumno con ?alumno=N).
  rutas.agregar('GET', '/api/admin/academia/aprendizaje', ({ db, req }) => {
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    const alumno = new URL(req.url, 'http://x').searchParams.get('alumno');
    const id = alumno == null || alumno === '' ? null : Number(alumno);
    if (id != null && (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id))) throw new ErrorHttp(404, 'no_existe');
    for (const u of db.prepare("SELECT id FROM usuarios WHERE activo = 1").all()) sincronizarFallas(db, u.id, p, reloj());
    return { codigo: 200, datos: estadisticas(db, p, { usuarioId: id, ahoraMs: reloj() }) };
  }, { admin: true });

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
    // 0.12.9: las preguntas personalizadas viajan SIN la correcta (se revisa al responder).
    if (guardado && /^academia\.ia\.personal\./.test(clave)) return { codigo: 200, datos: { estado: 'lista', clave, ...personalParaVer(guardado) } };
    // 0.14.15: el consejo nuevo se arma con el diagnóstico de ahora (los botones de verdad).
    if (guardado && /^academia\.ia\.consejo\./.test(clave) && guardado.forma === 2) return { codigo: 200, datos: lista(consejoParaVer(guardado, diagnostico(db, usuario.id, activo(db), reloj()))) };
    if (guardado) return { codigo: 200, datos: lista(guardado) };
    const motivo = typeof resultado?.motivo === 'string' ? resultado.motivo : 'no_disponible';
    const admin = esEspacioAdmin(db, e.id);
    return { codigo: 200, datos: { estado: 'no', motivo: admin || RESULTADO_ALUMNO.has(motivo) ? motivo : 'no_disponible' } };
  });

  // ---------- 0.10.0: «Ver cómo trabaja» (el administrador): una pregunta y una opción mala, sin IA y con IA ----------
  // Sin datos de ningún alumno: el estilo «claro». Con la IA lista para el administrador (desde Tailscale), la pide de
  // verdad (con su tope general); si no, la pantalla muestra un ejemplo marcado como ejemplo.
  rutas.agregar('POST', '/api/admin/academia/instructor/demo', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.explicar, usuario);
    const p = activo(db);
    const q = typeof datos?.pregunta === 'string' ? p?.preguntas.get(datos.pregunta) : null;
    if (!q) throw new ErrorHttp(404, 'no_existe');
    const elegida = typeof datos?.opcion === 'string' ? datos.opcion : '';
    if (!q.original.opciones.some(o => o.letra === elegida)) throw new ErrorHttp(400, 'opcion_no_valida');
    const r = { q, elegida, acierto: elegida === q.original.correcta, modo: 'original' };
    const basica = reexplicarSinIa(db, usuario.id, p, r, 'claro');
    basica.veces = 0;
    const instructor = estadoInstructor(db, req, usuario);
    let ia = { estado: 'ejemplo' };
    if (instructor.modo === 'ia') {
      const cfg = leerConfigIa(db);
      const pedido = armarExplicacion({ q, elegida, acierto: r.acierto, modo: 'original', idea: basica.idea, tarjeta: basica.tarjeta, alumno: { estilo: 'claro' }, idioma: usuario.idioma, modelo: cfg.instructorModelo });
      const ya = leerGuardado(db, pedido.clave);
      ia = ya ? lista(ya) : pedirIa(db, usuario, { uso: 'instructor_explicar', sistema: pedido.sistema, texto: pedido.texto, clave: pedido.clave, extra: { correcta: pedido.correcta, opciones: pedido.opciones } });
    }
    return { codigo: 200, datos: { instructor, basica, ia, pregunta: { id: q.id, numero: q.original.numero ?? null, enunciado: q.original.enunciado, opciones: q.original.opciones.map(o => ({ letra: o.letra, texto: o.texto })), correcta: q.original.correcta } } };
  }, { admin: true });

  // ---------- 0.12.4: la «Vista de prueba de la IA» (solo el administrador) ----------
  // Para ver cómo se verían las pantallas con IA SIN clave: los datos de verdad del paquete y del propio administrador
  // (una pregunta, lo básico, un concepto, las acciones de hoy); las respuestas «de la IA» las pone la pantalla, marcadas
  // como demostración. Nunca llama a la IA, nunca pone nada en la fila, nunca cobra minutos y no guarda nada de nadie.
  rutas.agregar('GET', '/api/admin/academia/ia-demo', ({ db, usuario }) => {
    contar(topes.lecturas, usuario);
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    const ahora = reloj();
    // La última que el administrador falló (estudiando como estudiante) o, si no, la primera del paquete con una mala.
    const suya = db.prepare('SELECT pregunta, elegida FROM academia_respuestas WHERE usuario_id = ? AND correcta = 0 ORDER BY id DESC LIMIT 1').get(usuario.id);
    const q = (suya && p.preguntas.get(suya.pregunta)) || [...p.preguntas.values()][0];
    if (!q) throw new ErrorHttp(409, 'sin_paquete');
    const elegida = suya && p.preguntas.get(suya.pregunta) ? suya.elegida : q.original.opciones.find(o => o.letra !== q.original.correcta).letra;
    const basica = reexplicarSinIa(db, usuario.id, p, { q, elegida, acierto: elegida === q.original.correcta, modo: 'original' }, 'claro');
    basica.veces = 0;
    const c = conceptoDePregunta(p, q.id);
    const lugar = p.deTema.get(q.id);
    const tema = lugar ? p.materias.find(m => m.id === lugar.materia)?.temas.find(t => t.id === lugar.tema) : null;
    const correcta = q.original.opciones.find(o => o.letra === q.original.correcta);
    return {
      codigo: 200, datos: {
        demo: true, basica, tema: tema?.titulo ?? '', concepto: c ? nombreConcepto(c) : tema?.titulo ?? '',
        // 0.12.7: para «Preparado para ti» (demostración): los títulos de las primeras tarjetas de ese tema.
        tarjetas: (tema?.secciones ?? []).slice(0, 2).map((x, i) => ({ numero: i + 1, titulo: String(x.titulo ?? '') })),
        // 0.12.9: para el tutor de demostración (las N preguntas de la materia y dónde está ese tema).
        materia: lugar?.materia ?? null, temaId: lugar?.tema ?? null, preguntasMateria: lugar ? preguntasDeMateria(p, lugar.materia) : 0,
        pregunta: { id: q.id, numero: q.original.numero ?? null, enunciado: q.original.enunciado, opciones: q.original.opciones.map(o => ({ letra: o.letra, texto: o.texto })), correcta: correcta?.letra ?? null, correctaTexto: correcta?.texto ?? '' },
        acciones: accionesDeHoy(db, usuario.id, p, ahora).map(a => ({ id: a.id, clave: a.clave, vars: a.vars })),
      },
    };
  }, { admin: true });

  // ---------- 0.10.0: el «Profesor virtual» (un chat; para quien pagó o a quien el administrador se lo dio) ----------
  const esAdminDe = (db, usuario) => { const e = espacioDe(db, usuario); return Boolean(e && esEspacioAdmin(db, e.id)); };
  rutas.agregar('GET', '/api/academia/profesor', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    const ahora = reloj();
    return { codigo: 200, datos: { permiso: permisoProfesor(db, usuario.id, { admin: esAdminDe(db, usuario) }), instructor: estadoInstructor(db, req, usuario, ahora), tiempo: tiempoDe(db, usuario, ahora, { estricto: config?.terminosObligatorios !== false }), historial: historialParaVer(db, usuario.id) } };
  });
  rutas.agregar('POST', '/api/academia/profesor', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.chat, usuario);
    const mensaje = textoDe(datos, 'mensaje').trim();
    if (mensaje.length < 2 || mensaje.length > DUDA_MAX_LETRAS) throw new ErrorHttp(400, 'duda_no_valida');
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    if (!permisoProfesor(db, usuario.id, { admin: esAdminDe(db, usuario) }).permitido) throw new ErrorHttp(403, 'sin_profesor');
    const ahora = reloj();
    const instructor = estadoInstructor(db, req, usuario, ahora);
    const c = camino(db, usuario.id, p, ahora);
    const abiertos = new Set(c.materias.flatMap(m => m.temas.filter(t => t.estado !== 'bloqueado').map(t => `${m.id}/${t.id}`)));
    const fallas = fallasDe(db, usuario.id, p, ahora).filter(f => f.estado !== 'superada');
    // 0.12.9 (G): «Explícame la clase de <tema>»: el tema lo dice el botón (abierto); si no, el que más se parece.
    const forzado = typeof datos?.materia === 'string' && typeof datos?.tema === 'string' && abiertos.has(`${datos.materia}/${datos.tema}`)
      ? p.materias.find(m => m.id === datos.materia)?.temas.find(t => t.id === datos.tema) : null;
    const ctx = forzado ? {
      materia: datos.materia, tema: datos.tema, temaTitulo: forzado.titulo,
      material: { tema: forzado.titulo, tarjetas: (forzado.secciones ?? []).slice(0, 6).map(s => ({ titulo: s.titulo ?? '', texto: cortarBytes([s.texto, ...(s.puntos ?? []), s.recuerda].filter(Boolean).join('\n'), 1500) })) },
      preguntas: respondidasParecidas(db, usuario.id, p, forzado.titulo, { donde: { materia: datos.materia, tema: datos.tema }, cuantas: 3 }),
    } : contextoChat(db, usuario.id, p, mensaje, abiertos, fallas);
    const videos = ctx.materia ? videosDeTema(db, ctx.materia, ctx.tema).map(v => ({ titulo: v.titulo, url: v.url })) : [];
    const buscar = ctx.temaTitulo ? [{ texto: ctx.temaTitulo, url: busquedaYoutube(ctx.temaTitulo) }] : [];
    // Sin IA (o sin minutos): el instructor básico le dice qué estudiar, y los videos igual. 0.12.4: el mensaje y la
    // respuesta básica quedan en su historial (antes se perdían al recargar); sin IA por algo que no se pasa solo, ia = null.
    if (instructor.modo !== 'ia') {
      const basica = consejoInstructor(db, usuario.id, p, ahora).consejo;
      anotarMensaje(db, usuario.id, { pregunta: mensaje, en: new Date(ahora).toISOString(), basica: basica ? { clave: basica.clave, vars: basica.vars ?? {} } : null, tema: ctx.temaTitulo, videos, buscar });
      return { codigo: 200, datos: { instructor, ia: iaNoAhora(instructor), basica, videos, buscar, tiempo: tiempoDe(db, usuario, ahora, { estricto: config?.terminosObligatorios !== false }) } };
    }
    const m = modeloAlumno(db, usuario.id, p, ahora);
    // Su modelo, en cifras y con los textos del paquete: nunca su nombre ni su usuario.
    const alumno = {
      ...resumenModelo(m), ideas: m.ideas.map(x => x.idea).filter(Boolean),
      fallas: fallas.slice(0, 5).map(f => ({ tema: f.temaTitulo, idea: f.idea, fallos: f.fallos, aciertos: f.aciertos, estado: f.estado })),
      // 0.12.9 (T, I): lo que el tutor recuerda de él (sin nombres) y sus señales de estilo (solo números).
      memoria: memoriaParaIa(db, usuario.id, 3, ahora), preferencias: preferencias(leerSenales(db, usuario.id)),
    };
    alumno.temas = [...alumno.temas].sort((a, b) => a.pct - b.pct).slice(0, 6); // solo los más flojos (cuida el tamaño)
    let historial = historialParaVer(db, usuario.id).filter(x => x.respuesta).map(x => ({ alumno: x.pregunta, profesor: x.respuesta.respuesta })).slice(-6);
    // Que quepa en lo que se puede mandar: primero se quita historial, después preguntas, después se acortan las tarjetas.
    // (y que los datos de la tarea —sistema, texto, la pregunta y las citas, como JSON— quepan en sus 16 000 letras)
    const cabe = x => Buffer.byteLength(x.sistema) + Buffer.byteLength(x.texto) <= PROPOSITOS.instructor_chat.entradaMaxBytes
      && JSON.stringify([x.sistema, x.texto, mensaje, x.citas]).length <= 14_500;
    let preguntas = ctx.preguntas;
    let material = ctx.material;
    let pedido = armarChat({ alumno, material, preguntas, historial, mensaje, idioma: usuario.idioma });
    while (!cabe(pedido) && (historial.length || preguntas.length || (material?.tarjetas ?? []).some(t => t.texto.length > 200))) {
      if (historial.length) historial = historial.slice(1);
      else if (preguntas.length) preguntas = preguntas.slice(1);
      else material = { ...material, tarjetas: material.tarjetas.map(t => ({ ...t, texto: t.texto.slice(0, Math.floor(t.texto.length / 2)) })) };
      pedido = armarChat({ alumno, material, preguntas, historial, mensaje, idioma: usuario.idioma });
    }
    const clave = `academia.ia.chat.${usuario.id}.${ahora}`;
    const ia = pedirIa(db, usuario, { uso: 'instructor_chat', sistema: pedido.sistema, texto: pedido.texto, clave, extra: { pregunta: mensaje, citas: pedido.citas } });
    if (ia.estado === 'pendiente') anotarMensaje(db, usuario.id, { pregunta: mensaje, en: new Date(ahora).toISOString(), clave, tarea: ia.tarea, tema: ctx.temaTitulo, videos, buscar });
    else {
      // 0.12.4: no se pudo pedir (sin minutos, muy largo): lo básico, y también queda en su historial.
      const basica = consejoInstructor(db, usuario.id, p, ahora).consejo;
      anotarMensaje(db, usuario.id, { pregunta: mensaje, en: new Date(ahora).toISOString(), basica: basica ? { clave: basica.clave, vars: basica.vars ?? {} } : null, tema: ctx.temaTitulo, videos, buscar });
      return { codigo: 200, datos: { instructor, ia, basica, videos, buscar, tiempo: tiempoDe(db, usuario, ahora, { estricto: config?.terminosObligatorios !== false }) } };
    }
    return { codigo: 200, datos: { instructor, ia, videos, buscar, tiempo: tiempoDe(db, usuario, ahora, { estricto: config?.terminosObligatorios !== false }) } };
  });
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/profesor', ({ db, parametros }) => {
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, datos: { permiso: permisoProfesor(db, id), historial: historialParaVer(db, id) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/alumnos/:id/profesor', async ({ db, req, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { permiso: darProfesor(db, Number(parametros.id), datos?.permitido ?? null) } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('GET', '/api/admin/academia/videos', ({ db }) => ({ codigo: 200, datos: { videos: leerVideos(db) } }), { admin: true });
  rutas.agregar('POST', '/api/admin/academia/videos', async ({ db, req }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { videos: guardarVideos(db, datos?.videos) } };
  }, { admin: true });

  // ---------- El administrador: qué alumnos tienen ahora un instructor con IA ----------
  rutas.agregar('GET', '/api/admin/academia/instructor', ({ db, req }) => {
    const cfg = leerConfigIa(db);
    const usuarios = db.prepare("SELECT id, nombre, nombre_visible, rol, idioma FROM usuarios WHERE activo = 1 ORDER BY rol, nombre").all();
    const ahora = reloj();
    const alumnos = usuarios.map(u => ({ id: u.id, nombre: u.nombre_visible || u.nombre, rol: u.rol, ...estadoInstructor(db, req, u, ahora) }));
    return { codigo: 200, datos: { encendido: cfg.encendida && cfg.instructorIa, iaEncendida: cfg.encendida, instructorIa: cfg.instructorIa, modelo: cfg.instructorModelo, modelos: [...MODELOS_INSTRUCTOR], alumnos } };
  }, { admin: true });
}
