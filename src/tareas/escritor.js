// El «escritor» del trabajador: TODA escritura del trabajador pasa por aquí, una detrás de otra.
// Por qué: la base la comparten las pantallas y el trabajador, y SQLite no reparte el permiso de escribir con
// justicia: si el trabajador escribe sin parar, una pantalla puede quedarse esperando segundos (medido: de
// 1,3 a 2,5 s). Con una pausa después de cada escritura, del doble de lo que tardó (y nunca menos de 10 ms),
// la espera de las pantallas bajó a 12–31 ms. La pausa está en el código: no depende de acordarse.
//  - Cada escritura va dentro de una transacción corta (o sin transacción, para órdenes PRAGMA).
//  - Nunca acepta trabajo asíncrono: nada de esperas con la base tomada.
//  - Una escritura que falla no traba a las que vienen detrás.
import { performance } from 'node:perf_hooks';
import { enTransaccion } from '../nucleo/db.js';

const dormirDeVerdad = ms => new Promise(listo => setTimeout(listo, ms));

function sinTransaccion(trabajo) {
  const tipo = Object.prototype.toString.call(trabajo);
  if (tipo === '[object AsyncFunction]' || tipo === '[object AsyncGeneratorFunction]') throw new Error('el escritor no acepta trabajo asíncrono');
  const resultado = trabajo();
  if (resultado && typeof resultado.then === 'function') {
    Promise.resolve(resultado).catch(() => {});
    throw new Error('el escritor no acepta trabajo asíncrono');
  }
  return resultado;
}

export function crearEscritor(db, { pausaMinMs = 10, factor = 2, lentaMs = 20, dormir = dormirDeVerdad, reloj = () => performance.now(), registro = console } = {}) {
  let cola = Promise.resolve();
  const cuentas = { escrituras: 0, maxMs: 0, lentas: 0 };

  function escribir(trabajo, { transaccion = true } = {}) {
    if (typeof trabajo !== 'function') return Promise.reject(new TypeError('escribir necesita una función'));
    let duracion = 0;
    const hecho = cola.then(() => {
      const inicio = reloj();
      try {
        return transaccion ? enTransaccion(db, trabajo) : sinTransaccion(trabajo);
      } finally {
        duracion = Math.max(0, reloj() - inicio);
        cuentas.escrituras += 1;
        cuentas.maxMs = Math.max(cuentas.maxMs, duracion);
        if (duracion > lentaMs) {
          cuentas.lentas += 1;
          registro?.warn?.(`Escritura lenta del trabajador: ${Math.round(duracion)} ms`);
        }
      }
    });
    // La pausa va DESPUÉS de cada escritura y antes de la siguiente; quien escribió recibe su resultado ya.
    const pausa = () => dormir(Math.max(pausaMinMs, factor * duracion));
    cola = hecho.then(pausa, pausa).catch(() => {});
    return hecho;
  }

  return {
    escribir,
    estadisticas: () => ({ ...cuentas }),
  };
}
