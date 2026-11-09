// Rutas de Administrador → Copias (fase 1, parte e). Los errores son claves; las pantallas las traducen.
//  - Ver cómo están las copias: cualquier administrador, desde cualquier entrada (solo lee filas de la base y UNA medida
//    del disco: nunca mira la carpeta de las copias).
//  - «Hacer una copia ahora»: la pone en la fila del trabajador (nunca la hace el servidor web).
//  - La clave de recuperación: solo el dueño, desde su cuenta de Tailscale (soloDueno). «Crear» es la ÚNICA respuesta que
//    lleva la clave (una vez, sin guardar en caché). Confirmar y comprobar reciben SOLO el «verificador» que calcula la
//    página: el texto de la clave nunca vuelve al servidor. Estas rutas atrapan sus propios errores y anotan solo un
//    código corto (nunca el pedido ni el error entero).
import { statSync } from 'node:fs';
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { discoLibreMb, discoDeCopias } from '../nucleo/salud.js';
import { encolar } from '../tareas/cola.js';
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { duenoDeTailscale } from '../cuentas/tailscale.js';
import { ErrorCopias } from '../copias/formato.js';
import { estadoCopias, crearClavePendiente, confirmarClave, comprobarClave, tareaDeCopiaViva, llaveActiva, planDeDisco, ajustesCopias, selloLegible } from '../copias/estado.js';
import { estadoTelegram, canalActivo } from '../canales/canales.js';
import { estadoLlave } from '../claves/cifrado.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;
const HORA = 60 * 60 * 1000;
const MB = 1024 * 1024;
const SIN_CACHE = Object.freeze({ 'Cache-Control': 'no-store' });

export function crearLimitesCopias() {
  return {
    ahora: new Limitador({ maximo: 6, ventanaMs: HORA }),
    clave: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
    comprobar: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
  };
}

const tamanoMb = ruta => { try { return statSync(ruta).size / MB; } catch { return 0; } };

// Un error de la clave: 400/409 con su código, o 500 «error_interno» (anotando SOLO un código corto).
function errorDeClave(error, registro) {
  if (error instanceof ErrorHttp) return error;
  if (error instanceof ErrorCopias) {
    if (error.clave === 'sin_pendiente') return new ErrorHttp(409, 'sin_pendiente');
    if (['verificador_formato', 'clave_no_coincide', 'clave_de_prueba'].includes(error.clave)) return new ErrorHttp(400, error.clave);
    if (error.clave === 'almacen_no_disponible') return new ErrorHttp(503, 'almacen_no_disponible');
  }
  try { registro?.error?.(`Clave de recuperación: ${error instanceof ErrorCopias ? error.clave : 'error'}`); } catch { /* nada */ }
  return new ErrorHttp(500, 'error_interno');
}

// El pedido de confirmar o comprobar: SOLO { verificador } (64 hex). Cualquier otro campo (por ejemplo, la clave
// escrita) se rechaza sin leerlo ni anotarlo.
async function soloVerificador(req) {
  let datos;
  try { datos = await leerJson(req, 4096); } catch (error) { throw error instanceof ErrorHttp ? error : new ErrorHttp(400, 'datos_no_validos'); }
  const campos = Object.keys(datos);
  if (campos.length !== 1 || campos[0] !== 'verificador' || typeof datos.verificador !== 'string') throw new ErrorHttp(400, 'verificador_formato');
  return datos.verificador;
}

// medirDisco: solo para pruebas (el disco libre de mentira); en el servidor, el de verdad.
export function registrarRutasCopias(rutas, { config = null, supervisor = null, limites = {}, registro = console, medirDisco = null } = {}) {
  const topes = { ...crearLimitesCopias(), ...limites };
  const disco = () => {
    try { return medirDisco ? medirDisco() : config ? discoLibreMb(config.carpetaDatos ?? config.carpetaCopias) : null; } catch { return null; }
  };
  // El disco de la carpeta de las copias (puede ser otro: OPORTIA_COPIAS). En las pruebas, el mismo número.
  const discoCopias = () => {
    try {
      if (medirDisco) return { libreMb: medirDisco(), mismoDisco: true };
      return config ? discoDeCopias(config.carpetaCopias, config.carpetaDatos) : { libreMb: null, mismoDisco: null };
    } catch { return { libreMb: null, mismoDisco: null }; }
  };
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };
  const trabajadorEncendido = () => {
    try {
      const fase = supervisor?.estado ? supervisor.estado().fase : null;
      return fase == null || !['modo_seguro', 'parando'].includes(fase);
    } catch { return true; }
  };

  // La huella de la llave de las claves (sin leer la llave): para saber si el sello de la clave de recuperación se abre.
  const huellaDeLaLlave = () => {
    try { const e = config ? estadoLlave(config) : null; return e?.listo ? e.huella : null; } catch { return null; }
  };

  function estado(db, req, usuario) {
    const libreMb = disco();
    const dc = discoCopias();
    const t = config ? estadoTelegram(db, config) : null;
    const modoSeguro = leerModoSeguro(db).activo;
    const e = estadoCopias(db, {
      libreMb, libreCopiasMb: dc.libreMb, mismoDisco: dc.mismoDisco !== false, baseMb: config ? tamanoMb(config.archivoBase) : 0, walMb: config ? tamanoMb(`${config.archivoBase}-wal`) : 0,
      telegram: t ? { listo: t.listo, motivo: t.motivo, chat: t.chat, bot: t.bot } : null, modoSeguro, trabajador: trabajadorEncendido(),
      huellaLlave: huellaDeLaLlave(),
    });
    const dueno = duenoDeTailscale(db, req, usuario);
    return { ...e, puede: { ...e.puede, crearClave: dueno.si, motivoNoClave: dueno.si ? null : dueno.motivo } };
  }

  rutas.agregar('GET', '/api/admin/copias', ({ db, req, usuario }) => ({ codigo: 200, datos: estado(db, req, usuario) }), { admin: true });

  rutas.agregar('POST', '/api/admin/copias/ahora', ({ db, usuario }) => {
    contar(topes.ahora, usuario);
    if (tareaDeCopiaViva(db)) throw new ErrorHttp(409, 'copia_en_marcha');
    if (leerModoSeguro(db).activo || !trabajadorEncendido()) throw new ErrorHttp(409, 'trabajo_en_pausa');
    if (!llaveActiva(db) || !selloLegible(llaveActiva(db), huellaDeLaLlave())) throw new ErrorHttp(409, 'falta_clave');
    const libreMb = disco();
    const dc = discoCopias();
    const plan = planDeDisco({ libreMb, libreCopiasMb: dc.libreMb, mismoDisco: dc.mismoDisco !== false, baseMb: config ? tamanoMb(config.archivoBase) : 0, walMb: config ? tamanoMb(`${config.archivoBase}-wal`) : 0, ajusteLocal: ajustesCopias(db).local });
    if (plan.freno) throw new ErrorHttp(409, 'disco_lleno');
    if (!plan.local && !canalActivo(db)) throw new ErrorHttp(409, 'sin_destino');
    const ahora = Date.now();
    const { id, nueva } = encolar(db, {
      tipo: 'copias.hacer', programa: 'copias.hacer', claveUnica: `copias.hacer@manual-${ahora}`, datos: { origen: 'manual' }, creadaPor: usuario.id,
    }, { ahora });
    if (!nueva) throw new ErrorHttp(409, 'copia_en_marcha');
    try { supervisor?.despertar?.(); } catch { /* el trabajador la toma en su próxima vuelta */ }
    return { codigo: 202, datos: { tarea: { id, estado: 'lista' } } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/copias/clave/nueva', ({ db, usuario }) => {
    try {
      contar(topes.clave, usuario);
      const r = crearClavePendiente(db, { config, usuarioId: usuario.id });
      return { codigo: 201, datos: { clave: r.clave, huella: r.huella, expira: r.expira }, cabeceras: SIN_CACHE };
    } catch (error) {
      throw errorDeClave(error, registro);
    }
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/copias/clave/confirmar', async ({ db, req, usuario }) => {
    try {
      const verificador = await soloVerificador(req);
      contar(topes.clave, usuario);
      const r = confirmarClave(db, { verificador, usuarioId: usuario.id });
      return { codigo: 200, datos: { activa: { huella: r.huella, desde: r.desde } }, cabeceras: SIN_CACHE };
    } catch (error) {
      throw errorDeClave(error, registro);
    }
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/copias/clave/comprobar', async ({ db, req, usuario }) => {
    try {
      const verificador = await soloVerificador(req);
      contar(topes.comprobar, usuario);
      return { codigo: 200, datos: comprobarClave(db, { verificador }), cabeceras: SIN_CACHE };
    } catch (error) {
      throw errorDeClave(error, registro);
    }
  }, { admin: true, soloDueno: true });
}
