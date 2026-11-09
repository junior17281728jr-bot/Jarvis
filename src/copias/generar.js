// Hace UNA copia cifrada a partir de una foto abierta de la base (el corazón del paso «generar» de la tarea
// copias.hacer, parte e paso 2): volcado → gzip → flujo cifrado → partes. Al mismo tiempo, en el MISMO paso, el flujo
// que sale se descifra otra vez (con la llave de esta copia), se descomprime y se lee línea por línea: las cuentas por
// tabla deben ser iguales a las del volcado y a las de un COUNT(*) independiente hecho en la misma foto, y la línea
// del sello debe estar. Si algo no cuadra, la copia no sirve (volcado_incompleto) y nunca se dice «comprobada».
//  - Nunca escribe nada sin cifrar en el disco, ni archivos temporales: cada parte terminada va a alParte (que la
//    guarda en un archivo nuevo o la manda a Telegram) y su búfer se usa otra vez para la siguiente.
//  - La llave de la copia vive solo en la memoria de este paso y se llena de ceros al final.
import { createGzip, createGunzip } from 'node:zlib';
import { Readable, Writable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { ErrorCopias, TAMANO_PARTE, LINEA_MAX, crearPartidor } from './formato.js';
import { crearCifrador, transformarCifrado, crearDescifrador, sellar } from './cifrar.js';
import { volcar as volcarDeVerdad, contarFilas, crearLector } from './volcado.js';

const esperar = () => new Promise(listo => setImmediate(listo));
const FALLAS_DE_REVISION = Object.freeze(['volcado_danado', 'copia_no_autentica', 'copia_danada', 'copia_cortada']);

// foto: la base abierta por abrirFotoDeLectura (su .db). publica/sello: de la llave activa del dueño.
// alParte({ n, desde, largo, archivo, sha256 }): guarda o manda cada parte (puede tardar; el búfer espera).
// → { copia, creada, bytes, sha256, partes, volcado: { bytes, sha256 }, tablas, filas, porTabla, migracion, sellado, resumen }
export async function generarCopia({
  foto, publica, sello, alParte, copia = randomUUID(), creada = new Date().toISOString(), servidor = null, version = null,
  codigo = null, tamanoParte = TAMANO_PARTE, ceder = esperar, senal = null, lineaMax = LINEA_MAX, asignar, volcar = volcarDeVerdad,
}) {
  if (!foto || typeof alParte !== 'function') throw new ErrorCopias('datos_no_validos');
  const independientes = contarFilas(foto);
  const cifrador = crearCifrador({ publica, copia, creada, servidor });
  const resultadoVolcado = {};
  const hashFlujo = createHash('sha256');
  let bytesFlujo = 0;
  const partidor = crearPartidor({ copia, tamanoParte, alParte, asignar });
  // La revisión: otro camino que recibe los mismos bytes cifrados.
  const entradaRevision = new PassThrough({ highWaterMark: 256 * 1024 });
  const lector = crearLector({ sello, copia, hashCabecera: cifrador.hashCabecera, lineaMax });
  const revision = pipeline(
    entradaRevision,
    crearDescifrador({ llaveDeCopia: cifrador.llaveDeCopia, hashCabecera: cifrador.hashCabecera }),
    createGunzip(),
    new Writable({
      write(datos, _cod, listo) {
        try { lector.alimentar(datos); listo(); } catch (error) { listo(error); }
      },
    }),
    { signal: senal ?? undefined },
  );
  let errorRevision = null;
  revision.catch(error => { errorRevision = error; });
  // Si la revisión se cae, nadie espera para siempre un «drain» que nunca llega.
  const revisionCaida = revision.then(() => {}, error => { throw error; });
  revisionCaida.catch(() => {});
  try {
    await pipeline(
      Readable.from(volcar(foto, { copia, creado: creada, version, codigo, sello, hashCabecera: cifrador.hashCabecera, ceder, senal, lineaMax, resultado: resultadoVolcado })),
      createGzip({ level: 6 }),
      transformarCifrado(cifrador),
      new Writable({
        async write(datos, _cod, listo) {
          try {
            if (errorRevision) throw errorRevision;
            hashFlujo.update(datos);
            bytesFlujo += datos.length;
            if (!entradaRevision.write(datos)) await Promise.race([once(entradaRevision, 'drain'), revisionCaida]);
            await partidor.escribir(datos);
            listo();
          } catch (error) { listo(error); }
        },
        async final(listo) {
          try {
            entradaRevision.end();
            await partidor.terminar();
            listo();
          } catch (error) { listo(error); }
        },
      }),
      { signal: senal ?? undefined },
    );
    await revision;
  } catch (error) {
    entradaRevision.destroy();
    await revision.catch(() => {});
    if (error?.name === 'AbortError' || senal?.aborted) throw new ErrorCopias('cancelada');
    // La revisión no pudo leer lo que salió: esta copia no sirve (nunca se dice «comprobada»).
    const deRevision = errorRevision instanceof ErrorCopias ? errorRevision : (error instanceof ErrorCopias && error === errorRevision ? error : null);
    if (deRevision && FALLAS_DE_REVISION.includes(deRevision.clave)) throw new ErrorCopias('volcado_incompleto', { revision: deRevision.clave });
    throw error;
  } finally {
    cifrador.cerrar();
  }
  const revisado = lector.terminar();
  // Tres cuentas que deben ser iguales: el volcado, el COUNT(*) de la misma foto y lo que leyó la revisión.
  const iguales = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  if (!iguales(resultadoVolcado.porTabla ?? {}, independientes.porTabla) || !iguales(revisado.porTabla, independientes.porTabla)
    || revisado.sha256 !== resultadoVolcado.sha256 || revisado.bytes !== resultadoVolcado.bytes || !revisado.selloOk) {
    throw new ErrorCopias('volcado_incompleto');
  }
  const sha256 = hashFlujo.digest('hex');
  const resumen = {
    copia, volcado: { bytes: resultadoVolcado.bytes, sha256: resultadoVolcado.sha256 }, tablas: independientes.tablas,
    filas: independientes.filas, porTabla: independientes.porTabla, version, migracion: resultadoVolcado.migracion ?? null,
  };
  const sellado = sellar(JSON.stringify(resumen), publica, { copia, creada, servidor });
  return {
    copia, creada, bytes: bytesFlujo, sha256, partes: partidor.partes, volcado: resumen.volcado, tablas: resumen.tablas,
    filas: resumen.filas, porTabla: resumen.porTabla, migracion: resumen.migracion, sellado, resumen,
  };
}
