// El camino PAGADO de la IA: SOLO lo usa el trabajador (test/reglas.test.js comprueba que el servidor web nunca lo
// carga). Cada paso de una tarea recibe uno propio en ctx.ia (src/tareas/ejecutor.js).
//
//   const r = await ctx.ia.pedir({ proposito, paso, espacioId, proyectoId?, versionNumero?, usuarioId?, sistema, texto,
//                                  esquema?, maximoConfirmadoMicro?, guardar?: (db, json, llamada) => valor })
//   → { usada: true, json, texto, costoMicro, llamadaId, proveedor, modelo, guardado }
//   → { usada: false, motivo, costoMicro?, llamadaId?, guardado? }
//
// Reglas (valen para todas las fases):
//  - NUNCA lanza por un problema del proveedor, de la red, de la clave o de un tope: devuelve { usada: false, motivo }
//    y quien la usa sigue con el motor propio. Solo lanza por un error de programación (un propósito que no existe).
//  - UN solo pedido a la red por cada pedir, siempre. Nunca reintenta: un error pausa esa clave y el próximo pedir la
//    encuentra en pausa SIN tocar la red (src/ia/politica.js).
//  - Antes de llamar se APARTA lo máximo que puede costar (reservar, en una escritura con la cerca de la tarea). Después
//    se anota lo que costó de verdad (liquidar) con el escritor SIN cerca: el costo se anota siempre, aunque la tarea
//    ya no sea de este trabajador. Lo que se guarda con lo que respondió la IA (guardar) sí va con la cerca, dentro de
//    la misma escritura: si la tarea ya no es suya, el costo queda anotado y no se guarda nada más.
//  - Un paso que se repite (un reinicio a mitad) nunca paga dos veces: (tarea, propósito, paso) identifica la llamada.
//  - La clave descifrada vive solo dentro de un pedir: nunca se guarda, se muestra ni se escribe en un registro.
import { enTransaccion } from '../nucleo/db.js';
import { FASE_ACTUAL } from '../tareas/tipos.js';
import { asegurarQueEsMia } from '../tareas/cola.js';
import { abrirAviso } from '../avisos/avisos.js';
import { leerSecreto, validarValor } from '../claves/almacen.js';
import { PROPOSITOS, MOTIVOS, definicionProposito } from './propositos.js';
import { reservar, liquidar, anotarBloqueo, mesCobro, cerrarLlamadaRota } from './presupuesto.js';
import { PROVEEDORES, urlDe } from './proveedores/index.js';
import { llamarProveedor } from './llamar.js';
import { cumpleEsquema } from './esquema.js';

// Lo que se lee de una respuesta si el propósito no dice otra cosa (src/ia/propositos.js: respuestaMaxBytes).
export const RESPUESTA_MAX_BYTES = 262_144;
// Dónde puede venir el «id» de una petición (lo que liquidar guarda en ia_llamadas.id_peticion).
const CAMPOS_ID = Object.freeze(['request_id', 'id']);
const CABECERAS_ID = Object.freeze(['request-id', 'x-request-id']);
const TROZO_CLAVE = 12;

// ¿El texto trae la clave, o un pedazo de 12 caracteres o más de ella? (un proveedor, o algo en el medio, que la
// devuelve como id, en lo que «escribió» el modelo o en un código de error). Solo en memoria, mientras la clave existe.
// Ronda 3 de revisión: también sin mirar mayúsculas y minúsculas, y con solo sus letras y números (así queda en un
// código corto: codigoCorto pasa todo a minúsculas y no acepta «-»).
const soloLetrasYNumeros = texto => texto.toLowerCase().replace(/[^a-z0-9]/g, '');
function traePedazo(texto, pedazoDe) {
  if (!pedazoDe) return false;
  if (texto.includes(pedazoDe)) return true;
  if (pedazoDe.length < TROZO_CLAVE) return false;
  for (let i = 0; i + TROZO_CLAVE <= pedazoDe.length; i++) if (texto.includes(pedazoDe.slice(i, i + TROZO_CLAVE))) return true;
  return false;
}
function traePedazoDeClave(texto, clave) {
  if (typeof texto !== 'string' || !texto || typeof clave !== 'string' || !clave) return false;
  if (texto.includes(clave)) return true;
  return traePedazo(texto.toLowerCase(), clave.toLowerCase()) || traePedazo(soloLetrasYNumeros(texto), soloLetrasYNumeros(clave));
}

// Quita de la respuesta todo «id» que traiga la clave, ANTES de olvidarla: así nunca llega a la base.
function quitarEcoDeClave(respuesta, clave) {
  for (const nombre of CABECERAS_ID) {
    if (traePedazoDeClave(respuesta?.cabeceras?.[nombre], clave)) delete respuesta.cabeceras[nombre];
  }
  const json = respuesta?.json;
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    for (const campo of CAMPOS_ID) if (traePedazoDeClave(json[campo], clave)) json[campo] = null;
  }
}

// Ronda 3 de revisión: ¿queda la clave (o un pedazo) en ALGUNA parte de la respuesta, después de quitar los id? Mira
// todas las cabeceras que se leen, todo el JSON (lo que escribió el modelo, los códigos de error, el motivo de parada)
// y el texto de una respuesta que no es JSON.
function respuestaTraeClave(respuesta, clave) {
  const partes = Object.values(respuesta?.cabeceras ?? {});
  if (typeof respuesta?.textoCorto === 'string') partes.push(respuesta.textoCorto);
  if (respuesta?.json != null) {
    try { partes.push(JSON.stringify(respuesta.json)); } catch { return true; }
  }
  return partes.some(p => traePedazoDeClave(String(p), clave));
}

// Lo que se anota de una respuesta que traía la clave: NADA de lo que dijo (ni texto, ni JSON, ni códigos, ni id, ni
// lugar). Solo cuánto gastó, si lo dijo (sin el lugar: se cobra con el más caro). Un 200: 'eco_de_clave' (pausa del
// dueño y aviso grave). Un error: si el proveedor dijo que la clave no sirve, eso; si no, 'eco_de_clave' sin costo.
function resultadoConEco(leido, respuesta) {
  const exito = Number.isSafeInteger(respuesta?.status) && respuesta.status >= 200 && respuesta.status <= 299;
  const nada = { texto: null, json: null, idPeticion: null, reintentarMs: null, http: leido?.http ?? null, detalle: {} };
  if (exito) {
    let uso = null;
    if (leido?.uso && typeof leido.uso === 'object') {
      uso = { ...leido.uso };
      delete uso.geo;
    }
    return { ...nada, motivo: 'eco_de_clave', estado: uso ? 'hecha' : 'desconocida', uso };
  }
  const estado = leido?.estado === 'desconocida' ? 'desconocida' : 'fallida';
  return { ...nada, motivo: leido?.motivo === 'clave_no_valida' ? 'clave_no_valida' : 'eco_de_clave', estado, uso: null };
}

// Para deshacer lo anotado cuando una respuesta buena no se pudo guardar (se vuelve a anotar como lo que fue).
class NoSeGuardo extends Error {}

// Lo que se suma a los bytes del pedido por el «sobre» del proveedor (roles, nombres de campos…).
export const MARCO_BYTES = 200;
const CLAVE_CORTA = /^[a-z_]{1,60}$/;

// ¿SQLite dijo «ocupada» (otro está escribiendo hace más de busy_timeout)? Solo mira el código, nunca el texto.
function baseOcupada(error) {
  const n = Number(error?.errcode);
  return Number.isInteger(n) && ((n & 0xff) === 5 || (n & 0xff) === 6);
}

// La clave corta de un error de guardar (ErrorHttp / ErrorTarea), o 'no_se_pudo_guardar'.
function claveDeError(error) {
  const clave = typeof error?.clave === 'string' && CLAVE_CORTA.test(error.clave) ? error.clave : null;
  if (clave === 'ya_no_es_mia') return 'interrumpida';
  return clave && MOTIVOS.includes(clave) ? clave : 'no_se_pudo_guardar';
}

// db, config: los del trabajador. escritor: el escritor del trabajador (src/tareas/escritor.js). tarea, corrida: la
// tarea tomada y la corrida de este trabajador (para la cerca); sin tarea, escribe sin cerca (pruebas, consola).
// senal: la señal de parar del paso. validar: solo para una prueba (comprobar que una clave mal guardada nunca sale en
// un error); el trabajador nunca la cambia.
export function crearClienteIA({
  db, config, escritor, tarea = null, corrida = null, senal = null, reloj = Date.now, registro = console,
  propositos = PROPOSITOS, validar = validarValor,
}) {
  if (!db || !escritor) throw new Error('crearClienteIA necesita db y escritor');
  const conCerca = Boolean(tarea?.id != null && corrida);
  const escribirConCerca = trabajo => escritor.escribir(() => {
    if (conCerca) asegurarQueEsMia(db, tarea, corrida);
    return trabajo();
  });
  const escribirSinCerca = trabajo => escritor.escribir(trabajo);

  // Cierra una llamada reservada que no llegó a salir (clave ilegible o mal guardada): cuesta 0.
  async function cerrarSinLlamar(llamada, motivo, { avisoLlave = false } = {}) {
    try {
      await escribirSinCerca(() => {
        const l = liquidar(db, { llamadaId: llamada.id, resultado: { motivo, estado: 'fallida' }, ahora: reloj(), config });
        if (avisoLlave) abrirAviso(db, { clave: 'ia_llave', nivel: 'grave', detalle: { motivo }, ahora: reloj() });
        return l;
      });
    } catch {
      registro?.error?.('ia: no se pudo cerrar la llamada', llamada.id);
    }
    return { usada: false, motivo, costoMicro: 0, llamadaId: llamada.id, proveedor: llamada.proveedor, modelo: llamada.modelo };
  }

  // Una respuesta que no se pudo anotar (un error que no es «base ocupada»): cuenta lo apartado, pausa esa clave
  // hasta que el dueño la revise y abre el aviso grave de «costó más de lo apartado» (no se sabe cuánto costó).
  async function cerrarConFalla(llamada) {
    const datos = { llamadaId: llamada.id, proveedor: llamada.proveedor, modelo: llamada.modelo };
    try {
      await escribirSinCerca(() => cerrarLlamadaRota(db, { llamadaId: llamada.id, ahora: reloj() }));
    } catch {
      registro?.error?.('ia: no se pudo cerrar la llamada', llamada.id);
      return { usada: false, motivo: 'base_ocupada', ...datos };
    }
    return { usada: false, motivo: 'costo_mayor', costoMicro: llamada.reservadoMicro ?? null, ...datos };
  }

  async function pedir(pedido = {}) {
    const proposito = pedido.proposito;
    const def = definicionProposito(proposito, propositos);
    // Errores de programación: se lanzan (nunca son culpa de la persona ni del proveedor).
    if (!def) throw new Error(`propósito de IA desconocido: ${String(proposito).slice(0, 40)}`);
    if (def.fase > FASE_ACTUAL) throw new Error(`el propósito ${proposito} es de la fase ${def.fase}`);
    const sistema = String(pedido.sistema ?? '');
    const texto = String(pedido.texto ?? '');
    const esquema = pedido.esquema ?? null;
    const paso = pedido.paso == null ? null : String(pedido.paso).slice(0, 80);
    const espacioId = pedido.espacioId ?? null;
    const proyectoId = pedido.proyectoId ?? null;

    // 0. ¿Cabe? Lo que no cabe ni se intenta (y cuenta como una vez sin IA).
    const bytes = Buffer.byteLength(sistema) + Buffer.byteLength(texto) + (esquema ? Buffer.byteLength(JSON.stringify(esquema)) : 0);
    if (bytes > def.entradaMaxBytes) {
      try {
        await escribirConCerca(() => anotarBloqueo(db, { mes: mesCobro(reloj()), ambito: 'general', motivo: 'demasiado_largo', proposito, ahora: reloj() }));
      } catch (error) {
        if (error?.clave === 'ya_no_es_mia') return { usada: false, motivo: 'interrumpida' };
        if (!baseOcupada(error)) throw error;
      }
      return { usada: false, motivo: 'demasiado_largo' };
    }

    // 1. ¿Este paso ya se hizo? (un reinicio a mitad nunca paga dos veces)
    if (tarea?.id != null && paso != null) {
      const previa = db.prepare('SELECT id, estado, resultado, costo_micro, proveedor, modelo FROM ia_llamadas WHERE tarea_id = ? AND proposito = ? AND paso = ? ORDER BY id DESC LIMIT 1')
        .get(tarea.id, proposito, paso);
      if (previa) {
        const datos = { llamadaId: previa.id, proveedor: previa.proveedor, modelo: previa.modelo };
        if (previa.estado === 'reservada') {
          // Quedó a mitad (el trabajador se cayó o se actualizó): se cierra contando lo máximo apartado.
          let costo = null;
          try {
            costo = (await escribirSinCerca(() => liquidar(db, { llamadaId: previa.id, resultado: { motivo: 'interrumpida', estado: 'desconocida' }, ahora: reloj(), config }))).costoMicro;
          } catch {
            registro?.error?.('ia: no se pudo cerrar la llamada', previa.id);
          }
          return { usada: false, motivo: 'interrumpida', costoMicro: costo, ...datos };
        }
        if (previa.estado === 'hecha' && previa.resultado === 'ok') return { usada: false, motivo: 'ya_cobrada', costoMicro: previa.costo_micro, ...datos };
        return { usada: false, motivo: MOTIVOS.includes(previa.resultado) ? previa.resultado : 'interrumpida', costoMicro: previa.costo_micro, ...datos };
      }
    }

    // 2. Apartar el dinero (o saber por qué no), con la cerca de la tarea. Nunca toca la red.
    let r;
    try {
      r = await escribirConCerca(() => reservar(db, {
        config, proposito, espacioId, proyectoId, versionNumero: pedido.versionNumero ?? null, tareaId: tarea?.id ?? null,
        usuarioId: pedido.usuarioId ?? null, paso, entradaMax: bytes + MARCO_BYTES, maximoConfirmadoMicro: pedido.maximoConfirmadoMicro ?? null,
        ahora: reloj(), propositos,
      }));
    } catch (error) {
      if (error?.clave === 'ya_no_es_mia') return { usada: false, motivo: 'interrumpida' };
      if (baseOcupada(error)) return { usada: false, motivo: 'base_ocupada' };
      throw error;
    }
    if (!r.ok) return { usada: false, motivo: r.motivo };
    const llamada = r.llamada;
    const adaptador = PROVEEDORES[llamada.proveedor];

    // 3. La clave, descifrada justo ahora (y revisada otra vez: un valor raro nunca llega a una cabecera).
    let clave = leerSecreto(db, config, { id: llamada.secretoId });
    if (clave == null) return cerrarSinLlamar(llamada, 'clave_ilegible', { avisoLlave: true });
    try {
      clave = validar(adaptador.uso, clave);
    } catch {
      clave = null;
      return cerrarSinLlamar(llamada, 'clave_no_valida');
    }

    // 4. UNA llamada, con su tiempo máximo y la señal de parar del paso.
    const p = adaptador.pedido({ modelo: llamada.modelo, sistema, texto, esquema, salidaMax: llamada.salidaMax, esfuerzo: def.esfuerzo, cachear: def.cachear === true });
    let respuesta;
    let eco = false;
    try {
      respuesta = await llamarProveedor({
        url: urlDe(adaptador, config, p.ruta), metodo: p.metodo, cabeceras: adaptador.cabeceras(clave), cuerpo: p.cuerpo,
        senal, timeoutMs: def.timeoutMs, permitido: adaptador.host, topeBytes: def.respuestaMaxBytes ?? RESPUESTA_MAX_BYTES,
      });
      quitarEcoDeClave(respuesta, clave);
      eco = respuestaTraeClave(respuesta, clave);
    } finally {
      clave = null;
    }

    // 5. Qué respondió (solo en memoria; nunca se guarda un mensaje del proveedor). Lo que no cumple el esquema pedido
    // no se usa: cuenta como 'respuesta_no_valida' (con su costo real) y no se guarda nada. Una respuesta que traía la
    // clave no se usa ni se guarda nada de ella (ronda 3 de revisión).
    let leido = adaptador.leer(respuesta, { json: Boolean(esquema) });
    if (eco) {
      leido = resultadoConEco(leido, respuesta);
      respuesta.json = null;
      respuesta.textoCorto = null;
      respuesta.cabeceras = {};
    } else if (leido.motivo === 'ok' && esquema && !cumpleEsquema(leido.json, esquema)) {
      leido = { ...leido, motivo: 'respuesta_no_valida', json: null, texto: null, detalle: { ...leido.detalle, esquema: 'no_cumple' } };
    }

    // 6. Anotar lo que costó (siempre, sin cerca) y, si sirvió, guardar lo que hizo (con la cerca, en la misma escritura).
    // Ronda 3 de revisión: si una respuesta buena NO se pudo guardar (por ejemplo, las dudas ya no cabían), lo anotado se
    // deshace y se anota otra vez como lo que fue: 'no_se_pudo_guardar' (se pagó y no sirvió). Así nunca cierra el aviso
    // del proveedor ni quita una pausa, y cuenta para la pausa de «tres seguidas». Una versión que cambió o un proyecto en
    // la papelera mientras la IA pensaba no es culpa del modelo: queda 'ok'.
    const anotar = resultado => liquidar(db, { llamadaId: llamada.id, resultado, duracionMs: respuesta.msTotal, ahora: reloj(), config, enviadoBytes: bytes });
    let cierre;
    try {
      cierre = await escribirSinCerca(() => {
        let guardado = null;
        let l;
        try {
          l = enTransaccion(db, () => {
            const hecho = anotar(leido);
            if (leido.motivo === 'ok' && typeof pedido.guardar === 'function') {
              try {
                const valor = enTransaccion(db, () => {
                  if (conCerca) asegurarQueEsMia(db, tarea, corrida);
                  return pedido.guardar(db, leido.json, { id: llamada.id, proveedor: llamada.proveedor, modelo: llamada.modelo, costoMicro: hecho.costoMicro });
                });
                guardado = { ok: true, valor: valor ?? null };
              } catch (error) {
                // Si SQLite deshizo la escritura entera, no se puede seguir en ella: que falle toda (la reserva se barre).
                if (error?.transaccionPerdida) throw error;
                const motivo = claveDeError(error);
                if (motivo === 'no_se_pudo_guardar') registro?.error?.('ia: no se pudo guardar lo que hizo la IA', typeof error?.name === 'string' ? error.name.slice(0, 40) : 'Error');
                guardado = { ok: false, error: motivo };
                if (motivo === 'no_se_pudo_guardar') throw new NoSeGuardo();
              }
            }
            return hecho;
          });
        } catch (error) {
          if (!(error instanceof NoSeGuardo) || error.transaccionPerdida) throw error;
          l = anotar({ ...leido, motivo: 'no_se_pudo_guardar', json: null });
        }
        return { costoMicro: l.costoMicro, guardado };
      });
    } catch (error) {
      registro?.error?.('ia: no se pudo cerrar la llamada', llamada.id);
      // La base estaba ocupada: la reserva sigue «en curso» (cuenta lo máximo) y el barrido la cierra después.
      if (baseOcupada(error)) return { usada: false, motivo: 'base_ocupada', llamadaId: llamada.id, proveedor: llamada.proveedor, modelo: llamada.modelo };
      // Ronda 2 de revisión: cualquier otro error al anotar lo que costó NUNCA queda en silencio (el proveedor ya
      // respondió y pudo cobrar): se cierra contando lo apartado, esa clave queda en pausa del dueño y se avisa grave.
      return cerrarConFalla(llamada);
    }

    const comun = { costoMicro: cierre.costoMicro, llamadaId: llamada.id, proveedor: llamada.proveedor, modelo: llamada.modelo };
    if (leido.motivo === 'ok') return { usada: true, json: leido.json, texto: leido.texto, ...comun, guardado: cierre.guardado };
    return { usada: false, motivo: MOTIVOS.includes(leido.motivo) ? leido.motivo : 'error_proveedor', ...comun };
  }

  return Object.freeze({ pedir });
}
