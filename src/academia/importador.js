// Academia (0.7.1): el que ENTRA al contenido un paquete que el trabajador trajo de Google Drive. Vive en el servidor web
// (como el que manda los avisos), no en el trabajador. Por qué: revisar un JSON de 12 MB necesita unos 55 MB de memoria
// y deja la del proceso unos 40 MB más arriba; el trabajador vive con unos 68 MB y sale solo al pasar de 120 MB (y esa
// salida cuenta para el modo seguro). Medido con un paquete de 12 MB con tildes y comillas.
//
// El trato entre los dos (cada ajuste tiene UN solo dueño que lo escribe):
//  - El trabajador (src/academia/sincronizar.js) deja el JSON bajado en academia/drive/entrante.json (un solo lugar: solo
//    deja otro cuando el anterior ya se atendió) y escribe 'academia.drive.entrante' = { huella, archivo, en }.
//  - Este, cada 5 s: si hay uno sin atender, escribe 'academia.drive.importado' = { huella, resultado: 'en_curso' } ANTES
//    de leerlo (si el proceso se cae a mitad, la próxima vez queda «fallo», nunca se vuelve a intentar en bucle), revisa la
//    huella, lo revisa con el revisor de siempre y lo guarda como versión nueva (src/academia/paquetes.js). Al final:
//    resultado 'nuevo' | 'repetido' (con la versión y sus materias), 'rechazado' (con los primeros errores) o 'fallo'.
//  - El trabajador, que esperaba, lee el resultado y sigue (figuras, audios, ponerla en uso).
// También arma, de a una por pasada, el «manifiesto.json» de las versiones de antes de la 0.7.1 (el trabajador solo lee ese).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { enTransaccion } from '../nucleo/db.js';
import { carpetaAcademia, leerAjuste, guardarAjuste, revisarJson, guardarJson, huellaDeArchivo, manifiesto, tieneManifiesto } from './paquetes.js';
import { LIMITES } from './formato.js';

export const AJUSTE_ENTRANTE = 'academia.drive.entrante';
export const AJUSTE_IMPORTADO = 'academia.drive.importado';
export const rutaEntrante = config => join(carpetaAcademia(config), 'drive', 'entrante.json');

const leerJsonAjuste = (db, clave) => {
  try { const v = JSON.parse(leerAjuste(db, clave) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; }
};
export const leerEntrante = db => { const e = leerJsonAjuste(db, AJUSTE_ENTRANTE); return typeof e?.huella === 'string' ? e : null; };
export const leerImportado = db => { const i = leerJsonAjuste(db, AJUSTE_IMPORTADO); return typeof i?.huella === 'string' ? i : null; };
const anotar = (db, valor) => enTransaccion(db, () => guardarAjuste(db, AJUSTE_IMPORTADO, JSON.stringify(valor)));

// Una pasada. → lo que hizo (o null si no había nada).
export async function importarEntrante(db, config) {
  const entrante = leerEntrante(db);
  let hecho = null;
  if (entrante) {
    const ya = leerImportado(db);
    if (ya?.huella === entrante.huella) {
      // Ya atendido. Si quedó «en_curso», el proceso se cayó revisándolo: no se intenta otra vez.
      if (ya.resultado === 'en_curso') { hecho = { huella: entrante.huella, resultado: 'fallo', motivo: 'se_corto' }; anotar(db, hecho); }
    } else {
      anotar(db, { huella: entrante.huella, resultado: 'en_curso' });
      try {
        const ruta = rutaEntrante(config);
        if (statSync(ruta).size > LIMITES.jsonBytes) hecho = { huella: entrante.huella, resultado: 'fallo', motivo: 'demasiado_grande' };
        else if (huellaDeArchivo(ruta) !== entrante.huella) hecho = { huella: entrante.huella, resultado: 'fallo', motivo: 'archivo_cambiado' };
        else {
          let cuerpo = readFileSync(ruta);
          const revisado = revisarJson(cuerpo);
          if (revisado.error) hecho = { huella: entrante.huella, resultado: 'rechazado', errores: (revisado.error.datos.errores ?? []).slice(0, 5) };
          else {
            const r = await guardarJson(db, config, { cuerpo, revisado, origen: 'drive' });
            hecho = { huella: entrante.huella, resultado: r.datos.repetido ? 'repetido' : 'nuevo', version: r.datos.paquete.id, materias: revisado.revision.materias };
          }
          cuerpo = null;
        }
      } catch (error) {
        hecho = { huella: entrante.huella, resultado: 'fallo', motivo: typeof error?.clave === 'string' ? error.clave : 'no_se_pudo_guardar' };
      }
      anotar(db, hecho);
    }
  }
  // Las versiones de antes, sin su manifiesto: una por pasada.
  try {
    for (const fila of db.prepare("SELECT * FROM academia_paquetes WHERE estado <> 'fallido' ORDER BY id DESC LIMIT 50").all()) {
      if (!tieneManifiesto(config, fila)) { try { manifiesto(config, fila); } catch { /* sin su JSON: se queda así */ } break; }
    }
  } catch { /* sin la tabla (base vieja): nada que hacer */ }
  return hecho;
}

// Igual que el que manda avisos: empieza después de abrir el puerto, nunca dos pasadas a la vez, su reloj nunca deja vivo
// al proceso, y se apaga antes de cerrar la base.
export function crearImportador({ db, config, supervisor = null, cadaMs = 5000, registro = null } = {}) {
  let temporizador = null;
  let enMarcha = null;
  let parado = false;
  const pasada = () => {
    if (enMarcha || parado) return enMarcha;
    enMarcha = (async () => {
      try {
        const hecho = await importarEntrante(db, config);
        if (hecho) { try { supervisor?.despertar?.(); } catch { /* el trabajador lo ve en su próxima vuelta */ } }
        return hecho;
      } catch (error) {
        try { registro?.error?.(`Importar de Drive: ${error?.name ?? 'error'}`); } catch { /* nada */ }
        return null;
      } finally {
        enMarcha = null;
      }
    })();
    return enMarcha;
  };
  return {
    pasada,
    iniciar() {
      if (temporizador || parado) return;
      temporizador = setInterval(() => { pasada(); }, cadaMs);
      temporizador.unref?.();
    },
    async parar() {
      parado = true;
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
      if (enMarcha) await Promise.race([enMarcha, new Promise(listo => setTimeout(listo, 3000).unref?.())]);
    },
  };
}
