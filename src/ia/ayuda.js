// La tarea 'ia.interpretar' (fase 1, parte d): «Pedir ayuda a la IA» en un proyecto que espera aprobación. SOLO la
// carga el trabajador (test/reglas.test.js comprueba que el servidor web nunca la carga).
//
// Lo que hace un paso (uno solo):
//  1. Si se pidió hace más de 15 minutos (el trabajador estaba apagado, en modo seguro o se volvió a una versión
//     anterior), termina como 'caducada' SIN llamar: nadie está esperando y nadie aceptó pagar tan tarde.
//  2. Revisa ANTES de pagar que la versión siga esperando aprobación y sea la última, que el proyecto no esté en la
//     papelera y que quepa otra versión. Si no, termina sin costo ('version_cambio', 'en_papelera'…).
//  3. Pide a la IA que llene el formulario (ctx.ia.pedir, como máximo lo que la persona aceptó pagar).
//  4. Con la respuesta, el MOTOR PROPIO vuelve a leer el formulario y queda una versión nueva que espera aprobación
//     (la anterior queda «descartada», en el historial). Una persona la revisa y la aprueba; la IA nunca aprueba ni
//     quita dudas (src/ia/interpretar.js).
// Lo esperado (la IA no está, un tope, un error del proveedor, una respuesta que no sirve) NUNCA lanza: la tarea
// termina «hecha» con { usada: false, motivo } y el proyecto queda como lo entendió OPORTIA. Solo un error de verdad
// del programa sigue el camino normal de errores de la fila.
import { ErrorHttp } from '../nucleo/http.js';
import { configuracionDesdeCampos, lugaresNuevosSinDuda } from '../motor/interpretar.js';
import { pendienteDeProyecto, puedeTenerOtraVersion, nuevaVersion, versionDeLlamadaIa, versionSinIa, LUGARES_PARA_AYUDA_IA } from '../proyectos/proyectos.js';
import { anotarBloqueo, mesCobro } from './presupuesto.js';
import { armarPeticion, aCampos, pistasDeDudas, cambiosIa, conDudasDeLaBase, sinLugarParaDudas, supuestosQueSiguen, PROPOSITO_AYUDA } from './interpretar.js';

export const CADUCA_MS = 15 * 60_000;
const idiomaDe = idioma => (idioma === 'en' ? 'en' : 'es');

// La versión que espera aprobación, si sigue siendo la que se pidió y la última. { info } o { motivo }.
function revisarBase(db, espacioId, datos) {
  let info;
  try {
    info = pendienteDeProyecto(db, espacioId, datos.proyecto);
  } catch (error) {
    if (error instanceof ErrorHttp) return { motivo: 'version_cambio' };
    throw error;
  }
  const v = info.pendiente;
  if (!v || v.numero !== datos.version || info.ultima !== datos.version) return { motivo: 'version_cambio' };
  // Dos lugares: la versión que hace la IA y uno para «Volver a la versión sin IA».
  const no = puedeTenerOtraVersion(db, { espacioId, proyectoId: datos.proyecto, libres: LUGARES_PARA_AYUDA_IA });
  if (no) return { motivo: no };
  // Ronda 3 de revisión: lo que hiciera la IA podría no caber (las dudas están llenas): no se paga.
  if (sinLugarParaDudas(v.configuracion)) return { motivo: 'demasiadas_dudas' };
  return { info };
}

async function pasoInterpretar(ctx) {
  const datos = ctx.tarea.datos ?? {};
  const espacioId = ctx.tarea.espacioId;
  const ahora = Date.now();
  const fin = resultado => ({ listo: true, resultado: { usada: false, numero: null, costoMicro: 0, ...resultado } });
  const pedidaEn = Number(datos.pedidaEn);
  if (!Number.isSafeInteger(pedidaEn) || ahora - pedidaEn > CADUCA_MS || pedidaEn > ahora + 60_000) return fin({ motivo: 'caducada' });
  if (!Number.isSafeInteger(espacioId) || !Number.isSafeInteger(datos.proyecto) || !Number.isSafeInteger(datos.version)) return fin({ motivo: 'version_cambio' });

  const revision = revisarBase(ctx.db, espacioId, datos);
  if (revision.motivo) return fin({ motivo: revision.motivo });
  const { info } = revision;
  const base = info.pendiente;
  const idioma = idiomaDe(datos.idioma);
  const peticion = armarPeticion(base, idioma);
  if (!peticion) {
    await ctx.escribir(() => anotarBloqueo(ctx.db, { mes: mesCobro(ahora), ambito: 'general', motivo: 'demasiado_largo', proposito: PROPOSITO_AYUDA, ahora }));
    return fin({ motivo: 'demasiado_largo' });
  }

  // Guarda la versión que hizo la IA. Corre dentro de la escritura que anota el costo, con la cerca de la tarea:
  // si algo cambió mientras la IA pensaba, el costo queda anotado y no se guarda nada.
  const usuarioId = Number.isSafeInteger(datos.usuarioId) ? datos.usuarioId : null;
  function crearVersionDeIa(db, json, llamada) {
    const otra = revisarBase(db, espacioId, datos);
    if (otra.motivo) throw new ErrorHttp(409, otra.motivo);
    const actual = otra.info.pendiente;
    // Las dudas que el motor calcula (un lugar fuera del país, algo para buscar y para excluir) nunca se van solas por
    // un cambio de la IA: pasan como dudas guardadas, y la versión sigue sin poder aprobarse hasta que alguien las vea.
    const configuracion = conDudasDeLaBase(actual.configuracion, configuracionDesdeCampos(aCampos(json, actual.configuracion, idioma), actual.configuracion), idioma);
    if (!configuracion) throw new ErrorHttp(409, 'no_se_pudo_guardar');
    // Ronda 3 de revisión: un lugar nuevo que no se conoce siempre queda como duda. Si no cupo (más lugares nuevos que
    // dudas libres), la versión no se guarda: nunca se podría aprobar un lugar por el que nadie preguntó.
    if (lugaresNuevosSinDuda(actual.configuracion, configuracion).length) throw new ErrorHttp(409, 'no_se_pudo_guardar');
    const pistas = pistasDeDudas(json, actual.configuracion.noEntendido);
    // Ronda 3 de revisión: si la IA respondió lo mismo que ya tenía la versión y no dejó ninguna pista, no hace falta una
    // versión nueva: la que espera aprobación sigue igual (y no queda «descartada»).
    if (!cambiosIa(actual.configuracion, configuracion).length && !pistas.length) return { sinCambios: true };
    // «base» y lo que cambió se cuentan desde la primera versión SIN IA de la cadena: si se pidió ayuda sobre una versión
    // que ya hizo la IA, «Volver a la versión sin IA» vuelve a lo que entendió el motor propio, y la lista muestra todo
    // lo que la IA cambió (también lo de antes).
    const sinIa = actual.ayudaIa ? versionSinIa(db, { proyectoInternoId: otra.info.id, numero: actual.numero }) : null;
    const raiz = sinIa ?? actual;
    const ayudaIa = {
      llamadaId: llamada.id,
      proveedor: llamada.proveedor,
      modelo: llamada.modelo,
      costoMicro: llamada.costoMicro,
      base: raiz.numero,
      cambios: cambiosIa(raiz.configuracion, configuracion),
      pistas,
    };
    // Ronda 3 de revisión: las notas del motor propio («Lo que decidí yo») pasan a la versión de la IA, salvo las que
    // hablan de algo que la IA cambió (contactar a mano, la autonomía pedida… siguen a la vista).
    const supuestos = supuestosQueSiguen(raiz.supuestos, ayudaIa.cambios);
    return nuevaVersion(db, {
      espacioId, proyectoId: datos.proyecto, usuarioId, instrucciones: actual.instrucciones, configuracion, supuestos, origen: 'campos', ayudaIa,
    });
  }

  const r = await ctx.ia.pedir({
    proposito: PROPOSITO_AYUDA, paso: `v${datos.version}`, espacioId, proyectoId: info.id, versionNumero: datos.version, usuarioId,
    sistema: peticion.sistema, texto: peticion.texto, esquema: peticion.esquema,
    maximoConfirmadoMicro: Number.isSafeInteger(datos.maximoMicro) ? datos.maximoMicro : 0,
    guardar: crearVersionDeIa,
  });

  if (r.motivo === 'ya_cobrada') {
    // El paso se repitió después de pagar (un reinicio justo al final): si la versión quedó guardada, ya está.
    const numero = versionDeLlamadaIa(ctx.db, { proyectoInternoId: info.id, llamadaId: r.llamadaId });
    if (numero != null) return { listo: true, resultado: { usada: true, motivo: 'ok', numero, costoMicro: r.costoMicro ?? 0 } };
    return fin({ motivo: 'interrumpida', costoMicro: r.costoMicro ?? 0 });
  }
  if (!r.usada) return fin({ motivo: r.motivo, costoMicro: r.costoMicro ?? 0 });
  if (!r.guardado?.ok) return fin({ motivo: r.guardado?.error ?? 'no_se_pudo_guardar', costoMicro: r.costoMicro ?? 0 });
  // La IA respondió lo mismo que ya entendió OPORTIA: se usó (y se pagó), pero no hizo falta una versión nueva.
  if (r.guardado.valor?.sinCambios === true) return { listo: true, resultado: { usada: true, motivo: 'sin_cambios', numero: null, costoMicro: r.costoMicro ?? 0 } };
  return { listo: true, resultado: { usada: true, motivo: 'ok', numero: r.guardado.valor, costoMicro: r.costoMicro ?? 0 } };
}

export const MANEJADOR_INTERPRETAR = Object.freeze({ paso: pasoInterpretar });
