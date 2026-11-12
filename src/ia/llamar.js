// La ÚNICA llamada a la red de OPORTIA (IA y canales; lo comprueba test/reglas.test.js: ningún otro archivo de src/ usa
// fetch). Fase 1, parte e: los canales (src/canales/telegram.js) pasan por esta misma puerta, con dos opciones genéricas:
//  - cuerpoCrudo (un Blob o un Buffer): se manda tal cual, con el Content-Type que pone quien llama (los archivos de
//    las copias van como multipart armado a mano; nunca pasan por JSON.stringify ni se copian enteros en memoria).
//  - alTrozo(async Uint8Array): la respuesta se entrega por pedazos a quien llama (a un sha256 o a un archivo) con el
//    mismo corte de topeBytes, y NO se lee como JSON (salida.bytes = cuántos llegaron). Así se baja un archivo grande
//    sin tenerlo entero en memoria.
// llamarProveedor NUNCA lanza: siempre devuelve qué pasó, para que quien la usa siga con el motor propio.
//  - Destino: en el servidor real, solo https al servidor OFICIAL del proveedor (permitido). En modo de prueba
//    (OPORTIA_TEST=1) SOLO http://127.0.0.1:<puerto> (el proveedor falso): las direcciones oficiales también se
//    rechazan, antes de tocar la red (las pruebas corren en el servidor, que sí tiene internet).
//  - Nunca sigue una redirección (redirect: 'manual'): fetch de Node, si la siguiera, mandaría la clave y el pedido
//    a OTRO servidor. Una respuesta 3xx vuelve como red: 'redireccion' y no se sigue. Academia (0.7.1): trae también
//    salida.ubicacion (la cabecera Location, hasta 2.048 caracteres) para que QUIEN LLAMA decida si sigue, con su
//    propia lista de servidores (src/academia/drive.js solo sigue dentro de los dos de Google Drive).
//  - Corta a los timeoutMs (también mientras lee la respuesta) y cuando llega la señal de parar de la tarea.
//  - Lee como mucho topeBytes de respuesta (quien llama pasa el de su propósito; 1 MB si no dice); más que eso:
//    demasiado: true. Un JSON con más de 64 niveles anidados ([[[[…]]]]) tampoco se lee (profundo: true): con poco
//    texto ocupa mucha memoria, y ninguna respuesta de verdad se parece a eso.
//  - De un error solo guarda su nombre y su código (TypeError, ECONNREFUSED…). Nunca su texto: el texto de un error
//    de cabeceras de Node trae el valor de la cabecera, es decir, la clave.
//  - textoCorto: si la respuesta no es JSON, sus primeros 2.048 caracteres, SOLO en memoria (para reconocer un error
//    en texto plano como «Credit balance is too low»). Nunca se guarda ni se muestra.

const NOMBRE = /^[A-Za-z]{2,40}$/;
const CODIGO = /^[A-Z][A-Z0-9_]{1,39}$/;
// Errores en los que el pedido todavía no había salido (no se conectó): el proveedor no recibió nada.
const ANTES_DE_MANDAR = /^(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EADDRNOTAVAIL|UND_ERR_CONNECT_TIMEOUT|CERT_\w+|ERR_TLS_\w+|UNABLE_TO_\w+|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|ERR_SSL_\w+)$/;
const CABECERAS_QUE_SE_LEEN = Object.freeze(['retry-after', 'request-id', 'x-request-id', 'content-type']);
const LARGO_TEXTO_CORTO = 2048;
const LARGO_UBICACION = 2048;
export const PROFUNDIDAD_MAXIMA_JSON = 64;

// ¿El texto (JSON) tiene más de «maximo» niveles de [ y { anidados? Mira cada carácter una vez, fuera de los textos.
export function demasiadoProfundo(texto, maximo = PROFUNDIDAD_MAXIMA_JSON) {
  let nivel = 0;
  let enTexto = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (enTexto) {
      if (c === 92) i += 1; // \ : el siguiente carácter va escapado
      else if (c === 34) enTexto = false; // "
    } else if (c === 34) enTexto = true;
    else if (c === 91 || c === 123) { // [ {
      nivel += 1;
      if (nivel > maximo) return true;
    } else if (c === 93 || c === 125) nivel -= 1; // ] }
  }
  return false;
}

function enModoPrueba() {
  return process.env.OPORTIA_TEST === '1';
}

// ¿Se puede llamar a esta dirección? (sin tocar la red)
export function destinoPermitido(url, permitido, { prueba = enModoPrueba() } = {}) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.username || u.password) return false;
  if (prueba) return u.protocol === 'http:' && u.hostname === '127.0.0.1' && /^\d{2,5}$/.test(u.port);
  return u.protocol === 'https:' && typeof permitido === 'string' && permitido.length > 0 && u.hostname === permitido && u.port === '';
}

function errorCorto(error) {
  const nombre = typeof error?.name === 'string' && NOMBRE.test(error.name) ? error.name : null;
  const crudo = error?.cause?.code ?? error?.code;
  const codigo = typeof crudo === 'string' && CODIGO.test(crudo) ? crudo : null;
  return { nombre, codigo };
}

async function leerConTope(respuesta, topeBytes) {
  if (!respuesta.body) return { bytes: Buffer.alloc(0), demasiado: false };
  const lector = respuesta.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > topeBytes) {
      try { await lector.cancel(); } catch { /* ya se cortó */ }
      return { bytes: null, demasiado: true };
    }
    partes.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return { bytes: Buffer.concat(partes), demasiado: false };
}

// Pasa la respuesta, por pedazos, a alTrozo (sin guardarla). Más de topeBytes: corta y dice demasiado.
async function entregarConTope(respuesta, topeBytes, alTrozo) {
  if (!respuesta.body) return { bytes: 0, demasiado: false };
  const lector = respuesta.body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > topeBytes) {
      try { await lector.cancel(); } catch { /* ya se cortó */ }
      return { bytes: total, demasiado: true };
    }
    try {
      await alTrozo(value);
    } catch (error) {
      // Falló quien recibe (su archivo, su cuenta): se corta y se dice que fue de este lado, no de la red.
      try { await lector.cancel(); } catch { /* ya se cortó */ }
      return { bytes: total, demasiado: false, fallo: errorCorto(error) };
    }
  }
  return { bytes: total, demasiado: false };
}

// 0.12.1: un archivo grande que se baja por pedazos (alTrozo) puede tardar más: hasta 15 minutos (un video de 150 MB).
// alEmpezar({ largo }): antes de recibir el cuerpo (con el largo que dice el servidor, o null); si devuelve un motivo
// (texto), no se baja nada y salida.cortado lo dice (por ejemplo, «sin_espacio_disco»).
export const TOPE_MS = 120_000;
export const TOPE_MS_POR_PEDAZOS = 900_000;
export async function llamarProveedor({ url, metodo = 'POST', cabeceras = {}, cuerpo = null, cuerpoCrudo = null, alTrozo = null, alEmpezar = null, senal = null, timeoutMs = 30_000, topeBytes = 1_048_576, permitido = null }) {
  const inicio = Date.now();
  const salida = {
    status: null, json: null, textoCorto: null, cabeceras: {}, red: null, tiempoAgotado: false, abortado: false,
    demasiado: false, profundo: false, error: null, rechazado: false, msTotal: 0, bytes: 0, ubicacion: null,
  };
  const terminar = () => { salida.msTotal = Date.now() - inicio; return salida; };
  if (!destinoPermitido(url, permitido)) {
    salida.rechazado = true;
    salida.red = 'local';
    return terminar();
  }
  if (senal?.aborted) {
    salida.abortado = true;
    return terminar();
  }
  const limite = AbortSignal.timeout(Math.max(1, Math.min(typeof alTrozo === 'function' ? TOPE_MS_POR_PEDAZOS : TOPE_MS, Number(timeoutMs) || 30_000)));
  const unida = senal ? AbortSignal.any([senal, limite]) : limite;
  let respuesta = null;
  try {
    const opciones = { method: metodo, headers: cabeceras, signal: unida, redirect: 'manual' };
    if (cuerpoCrudo != null) opciones.body = cuerpoCrudo;
    else if (cuerpo != null) opciones.body = JSON.stringify(cuerpo);
    respuesta = await fetch(String(url), opciones);
    salida.status = respuesta.status;
    for (const nombre of CABECERAS_QUE_SE_LEEN) {
      const valor = respuesta.headers.get(nombre);
      if (valor != null) salida.cabeceras[nombre] = String(valor).slice(0, 200);
    }
    if (respuesta.status >= 300 && respuesta.status <= 399) {
      salida.red = 'redireccion';
      const ubicacion = respuesta.headers.get('location');
      if (ubicacion != null && ubicacion.length <= LARGO_UBICACION) salida.ubicacion = String(ubicacion);
      try { await respuesta.body?.cancel(); } catch { /* nada que leer */ }
      return terminar();
    }
    const tope = Math.max(1, Number(topeBytes) || 1_048_576);
    // Con alTrozo, solo una respuesta 2xx va por pedazos; un error (JSON corto) se lee como siempre, con tope chico.
    if (typeof alTrozo === 'function' && respuesta.status >= 200 && respuesta.status <= 299) {
      if (typeof alEmpezar === 'function') {
        const dicho = respuesta.headers.get('content-length');
        const largo = dicho != null && /^\d{1,15}$/.test(dicho.trim()) ? Number(dicho) : null;
        const motivo = await alEmpezar({ largo });
        if (typeof motivo === 'string' && motivo) {
          try { await respuesta.body?.cancel(); } catch { /* nada que leer */ }
          salida.cortado = motivo;
          return terminar();
        }
      }
      const entregado = await entregarConTope(respuesta, tope, alTrozo);
      salida.bytes = entregado.bytes;
      if (entregado.demasiado) salida.demasiado = true;
      if (entregado.fallo) { salida.error = entregado.fallo; salida.red = 'local'; salida.falloAlRecibir = true; }
      return terminar();
    }
    const { bytes, demasiado } = await leerConTope(respuesta, typeof alTrozo === 'function' ? Math.min(tope, 262_144) : tope);
    if (demasiado) {
      salida.demasiado = true;
      return terminar();
    }
    const texto = bytes.toString('utf8');
    if (demasiadoProfundo(texto)) {
      salida.profundo = true;
      return terminar();
    }
    try {
      salida.json = texto ? JSON.parse(texto) : null;
    } catch {
      salida.json = null;
    }
    if (salida.json == null && texto) salida.textoCorto = texto.slice(0, LARGO_TEXTO_CORTO);
    return terminar();
  } catch (error) {
    salida.error = errorCorto(error);
    if (senal?.aborted) salida.abortado = true;
    else if (limite.aborted) salida.tiempoAgotado = true;
    else if (respuesta) salida.red = 'durante';
    else if (salida.error.codigo && ANTES_DE_MANDAR.test(salida.error.codigo)) salida.red = 'antes';
    // Un error sin causa antes de responder (una cabecera o un cuerpo que no se puede mandar): no salió nada.
    else if (!error?.cause && error?.name === 'TypeError') salida.red = 'local';
    else salida.red = 'durante';
    return terminar();
  }
}
