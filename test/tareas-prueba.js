// Tipos de tarea de PRUEBA (nunca viven en src/) y un trabajador que los conoce. No es un archivo *.test.js:
//  - las pruebas del mismo proceso importan TIPOS_PRUEBA y MANEJADORES_PRUEBA;
//  - test/trabajador.test.js lo usa como el programa del trabajador (crearSupervisor({ ruta: este archivo })).
// Con OPORTIA_PRUEBA_ROMPER=1 sale con 1 antes de arrancar (un trabajador que no puede encender).
import './ayuda.js';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TIPOS, ErrorTarea } from '../src/tareas/tipos.js';

// Espera ms, pero termina enseguida si llega la señal de parar (como debe hacer todo trabajo bien hecho).
function esperarCon(ms, senal) {
  return new Promise((listo, mal) => {
    if (senal?.aborted) return mal(senal.reason);
    const t = setTimeout(() => { senal?.removeEventListener('abort', alAbortar); listo(); }, Math.max(0, Number(ms) || 0));
    function alAbortar() { clearTimeout(t); mal(senal.reason); }
    senal?.addEventListener('abort', alAbortar, { once: true });
  });
}

// Cuántos pasos corren a la vez, por cupo (para comprobar los cupos en las pruebas del mismo proceso).
export const CONCURRENCIA = { ahora: { normal: 0, grande: 0 }, maximo: { normal: 0, grande: 0, juntos: 0 } };
export function reiniciarConcurrencia() {
  CONCURRENCIA.ahora = { normal: 0, grande: 0 };
  CONCURRENCIA.maximo = { normal: 0, grande: 0, juntos: 0 };
}
async function contando(cupo, trabajo) {
  CONCURRENCIA.ahora[cupo] += 1;
  CONCURRENCIA.maximo[cupo] = Math.max(CONCURRENCIA.maximo[cupo], CONCURRENCIA.ahora[cupo]);
  CONCURRENCIA.maximo.juntos = Math.max(CONCURRENCIA.maximo.juntos, CONCURRENCIA.ahora.normal + CONCURRENCIA.ahora.grande);
  try { return await trabajo(); } finally { CONCURRENCIA.ahora[cupo] -= 1; }
}

export const TIPOS_PRUEBA = Object.freeze({
  'prueba.eco': {},
  'prueba.pasos': {}, // 2 pasos; el primero espera datos.esperaMs
  'prueba.fallar': { reintentos: { baseMs: 10 } },
  'prueba.colgar': {}, // traba el proceso entero (un bucle sin esperas)
  'prueba.terca': { tiempoPorPasoMs: 100, maxFallos: 5, reintentos: { baseMs: 10 } }, // no respeta la señal de parar
  'prueba.correo': { repetible: false, cupo: 'grande' }, // «manda algo»: nunca se repite sola
  'prueba.lenta': {}, // espera datos.ms y respeta la señal
  'prueba.grande': { cupo: 'grande' },
  'prueba.rara': { reintentos: { baseMs: 10 } }, // devuelve algo que no se puede guardar (datos.modo)
  'prueba.correo_terco': { repetible: false, tiempoPorPasoMs: 100, reintentos: { baseMs: 10 } }, // «manda» y no respeta la señal
});

// Cuántas veces «mandó» prueba.correo_terco (para comprobar que nunca se manda dos veces sola).
export const ENVIOS = { n: 0 };

export const MANEJADORES_PRUEBA = Object.freeze({
  'prueba.eco': { paso: async ctx => ({ listo: true, resultado: { eco: ctx.tarea.datos } }) },
  'prueba.pasos': {
    paso: async ctx => {
      const n = ctx.tarea.punto?.n ?? 0;
      if (n >= 1) return { listo: true, resultado: { pasos: n + 1 } };
      await esperarCon(ctx.tarea.datos.esperaMs ?? 0, ctx.senal);
      return { punto: { n: n + 1 } };
    },
  },
  'prueba.fallar': { paso: async () => { throw new Error('falla_a_proposito'); } },
  'prueba.colgar': {
    paso: ctx => {
      const fin = Date.now() + (ctx.tarea.datos.ms ?? 30_000);
      while (Date.now() < fin) { /* traba el proceso a propósito */ }
      return { listo: true, resultado: null };
    },
  },
  'prueba.terca': {
    paso: async ctx => {
      await new Promise(listo => setTimeout(listo, ctx.tarea.datos.ms ?? 30_000).unref());
      return { listo: true, resultado: null };
    },
  },
  'prueba.correo': {
    paso: async ctx => {
      await esperarCon(ctx.tarea.datos.esperaMs ?? 0, ctx.senal);
      return { listo: true, resultado: { enviado: true } };
    },
  },
  'prueba.lenta': { paso: ctx => contando('normal', async () => { await esperarCon(ctx.tarea.datos.ms ?? 10_000, ctx.senal); return { listo: true, resultado: null }; }) },
  'prueba.grande': { paso: ctx => contando('grande', async () => { await esperarCon(ctx.tarea.datos.ms ?? 10_000, ctx.senal); return { listo: true, resultado: null }; }) },
  'prueba.rara': {
    paso: async ctx => {
      const circular = {};
      circular.yo = circular;
      if (ctx.tarea.datos.modo === 'circular') return { punto: circular };
      if (ctx.tarea.datos.modo === 'tojson') return { listo: true, resultado: { toJSON() { throw new Error('no se deja'); } } };
      return { listo: true, resultado: { n: 1n } };
    },
  },
  'prueba.correo_terco': {
    paso: async ctx => {
      await new Promise(listo => setTimeout(listo, ctx.tarea.datos.ms ?? 300).unref());
      ENVIOS.n += 1; // «ya salió» aunque el paso se haya cortado por tiempo
      return { listo: true, resultado: { enviado: true } };
    },
  },
});

export const REGISTRO_PRUEBA = Object.freeze({ ...TIPOS, ...TIPOS_PRUEBA });

// ErrorTarea queda a mano para las pruebas que arman sus propios manejadores.
export { ErrorTarea };

let principal = false;
try { principal = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { principal = false; }
if (principal) {
  if (process.env.OPORTIA_PRUEBA_ROMPER === '1') {
    console.error('trabajador de prueba roto a propósito');
    process.exit(1);
  }
  const [{ MANEJADORES }, trabajador] = await Promise.all([import('../src/tareas/manejadores.js'), import('../src/tareas/trabajador.js')]);
  await trabajador.principal({ registro: REGISTRO_PRUEBA, manejadores: { ...MANEJADORES, ...MANEJADORES_PRUEBA } });
}
