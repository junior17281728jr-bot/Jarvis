// 0.14.8: «Claude mejora la app»: el que PRUEBA un cambio. Vive en el servidor web (el trabajador nunca enciende procesos;
// los enciende solo src/tareas/supervisor.js). Cada 20 s mira si hay una propuesta «probar»; como mucho UNA a la vez:
//   1. Pone los archivos del cambio en la copia de main (src/academia/app-fuente.js), después de comprobar que la copia
//      está limpia (cada archivo con la huella de antes). Si no lo está, la marca «sucia» (el trabajador la vuelve a abrir).
//   2. Revisa la escritura de cada .js cambiado (node --check) y corre TODAS las pruebas (test/*.test.js) con prioridad
//      baja, un entorno vacío y un tiempo máximo (15 min).
//   3. Vuelve a dejar los archivos como estaban (SIEMPRE, también si algo falló) y anota el resultado: «paso» o «no_paso»
//      (con cuántas pasaron y los nombres de las que fallaron). Despierta a la fábrica para que siga.
// Si el servidor se reinicia a mitad, la propuesta «probando» vuelve a «probar» (la copia vive en la carpeta temporal del
// servicio, que se vacía al reiniciar: el trabajador la vuelve a bajar).
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { enTransaccion } from '../nucleo/db.js';
import { encolar } from '../tareas/cola.js';
import { lanzarPruebas, revisarSintaxis } from '../tareas/supervisor.js';
import { aplicarParche, huellaTexto } from './app-parche.js';
import { carpetaApp, carpetaArbol, lectorDeArbol } from './app-fuente.js';
import { leerPropuestas, leerDetalle, cambiarPropuesta, leerFuente, guardarFuente, escribirEstado } from './app-mejora.js';
import { anotarCambio, costoDe } from './cambios-ia.js';

export const TIEMPOS_PROBADOR = Object.freeze({ cadaMs: 20_000, pruebasMs: 900_000, sintaxisMs: 30_000, colaBytes: 16_384 });
const iso = ms => new Date(ms).toISOString();

// Corre un proceso y espera: → { codigo, cola (el final de lo que escribió), tiempoAgotado }
export function esperarProceso(hijo, { timeoutMs, colaBytes = TIEMPOS_PROBADOR.colaBytes, reloj = setTimeout }) {
  return new Promise(resolve => {
    let cola = '';
    let agotado = false;
    const juntar = t => { cola = (cola + t).slice(-colaBytes); };
    hijo.stdout?.setEncoding?.('utf8'); hijo.stderr?.setEncoding?.('utf8');
    hijo.stdout?.on('data', juntar); hijo.stderr?.on('data', juntar);
    const reloj1 = reloj(() => { agotado = true; try { hijo.kill('SIGKILL'); } catch { /* ya salió */ } }, timeoutMs);
    reloj1?.unref?.();
    hijo.on('error', () => { clearTimeout(reloj1); resolve({ codigo: -1, cola, tiempoAgotado: false }); });
    hijo.on('close', codigo => { clearTimeout(reloj1); resolve({ codigo, cola, tiempoAgotado: agotado }); });
  });
}
// Lo que dicen las pruebas (salida TAP de node --test): cuántas pasaron, cuántas fallaron y los nombres de las que fallaron.
export function leerResultado(cola) {
  const n = re => { const m = [...String(cola).matchAll(re)].at(-1); return m ? Number(m[1]) : null; };
  const fallidas = [...String(cola).matchAll(/^\s*not ok \d+ - (.{1,160})$/gm)].map(m => m[1]).slice(-10);
  return { pasaron: n(/^# pass (\d+)$/gm), fallaron: n(/^# fail (\d+)$/gm), fallidas };
}

export function crearProbador({ db, config, lanzar = lanzarPruebas, sintaxis = revisarSintaxis, reloj = Date.now, tiempos = TIEMPOS_PROBADOR, supervisor = null, registro = null } = {}) {
  let vuelta = null;
  let ocupado = false;
  let hijo = null;
  let parado = false;

  async function probarUna() {
    if (ocupado || parado) return null;
    const p = leerPropuestas(db).find(x => x.estado === 'probar');
    if (!p) return null;
    ocupado = true;
    const ahora = reloj();
    const anotar = (cambios, final = null) => enTransaccion(db, () => {
      const q = cambiarPropuesta(db, p.id, cambios, { si: 'probando' });
      if (q && final) {
        try { anotarCambio(db, { que: final, estado: q.estado, detalle: [q.titulo, q.motivo].filter(Boolean).join(' · ').slice(0, 600), despues: { pantalla: q.pantalla, pasaron: q.pruebas?.pasaron ?? null, fallaron: q.pruebas?.fallaron ?? null }, ...costoDe(db, `a:${q.id}:`), ahora: reloj() }); } catch { /* el registro nunca para */ }
        escribirEstado(db, { estado: 'ahora', actual: q.estado === 'paso' ? `Pasó todas las pruebas: ${q.titulo ?? ''}` : `No pasó las pruebas, no lo instalé: ${q.titulo ?? ''}`, ahora: reloj() });
      }
      return q;
    });
    const arbol = carpetaArbol(config, p.base);
    const escritos = [];
    try {
      const empezo = enTransaccion(db, () => cambiarPropuesta(db, p.id, { estado: 'probando', probandoDesde: iso(ahora) }, { si: 'probar' }));
      if (!empezo) return null;
      const f = leerFuente(db);
      const d = leerDetalle(db, p.id);
      if (f.sha !== p.base || !f.listo || !existsSync(join(arbol, 'package.json')) || !d?.cambio) {
        // La copia no está (se reinició el servicio): vuelve a «probar» cuando el trabajador la abra otra vez.
        enTransaccion(db, () => { guardarFuente(db, { listo: false, sucia: true }); cambiarPropuesta(db, p.id, { estado: 'probar' }, { si: 'probando' }); });
        return 'sin_copia';
      }
      const a = aplicarParche(d.cambio, lectorDeArbol(arbol));
      const huellas = new Map((d.archivos ?? []).map(x => [x.archivo, x]));
      if (!a.ok || a.archivos.some(x => huellas.get(x.archivo)?.huellaAntes !== x.huellaAntes || huellas.get(x.archivo)?.huellaDespues !== x.huellaDespues) || a.archivos.length !== huellas.size) {
        enTransaccion(db, () => { guardarFuente(db, { listo: false, sucia: true }); cambiarPropuesta(db, p.id, { estado: 'probar' }, { si: 'probando' }); });
        return 'copia_sucia';
      }
      for (const x of a.archivos) { writeFileSync(join(arbol, x.archivo), x.despues); escritos.push(x); }
      const tmp = join(carpetaApp(config), `tmp-${p.id}`);
      mkdirSync(tmp, { recursive: true });
      for (const x of a.archivos.filter(y => y.archivo.endsWith('.js'))) {
        hijo = sintaxis({ carpeta: arbol, archivo: x.archivo, tmp });
        const s = await esperarProceso(hijo, { timeoutMs: tiempos.sintaxisMs });
        hijo = null;
        if (s.codigo !== 0) {
          anotar({ estado: 'no_paso', motivo: 'sintaxis', pruebas: { ok: false, pasaron: 0, fallaron: 1, fallidas: [x.archivo] }, terminadaEn: iso(reloj()) }, 'app_no_paso');
          return 'no_paso';
        }
      }
      const archivos = readdirSync(join(arbol, 'test')).filter(n => n.endsWith('.test.js')).sort().map(n => `test/${n}`);
      const desde = reloj();
      hijo = lanzar({ carpeta: arbol, archivos, tmp });
      const r = await esperarProceso(hijo, { timeoutMs: tiempos.pruebasMs });
      hijo = null;
      const res = leerResultado(r.cola);
      const ok = r.codigo === 0 && !r.tiempoAgotado && res.fallaron === 0 && (res.pasaron ?? 0) > 0;
      const pruebas = { ok, pasaron: res.pasaron, fallaron: res.fallaron, fallidas: res.fallidas, segundos: Math.round((reloj() - desde) / 1000), tiempoAgotado: r.tiempoAgotado };
      anotar(ok ? { estado: 'paso', pruebas, probadaEn: iso(reloj()) } : { estado: 'no_paso', motivo: r.tiempoAgotado ? 'pruebas_tardaron' : 'pruebas_fallaron', pruebas, terminadaEn: iso(reloj()) }, ok ? null : 'app_no_paso');
      return ok ? 'paso' : 'no_paso';
    } catch {
      try { anotar({ estado: 'probar' }); } catch { /* sigue en probando: al reiniciar vuelve */ }
      return 'error';
    } finally {
      // SIEMPRE: la copia vuelve a quedar como estaba (y se comprueba).
      for (const x of escritos) { try { writeFileSync(join(arbol, x.archivo), x.antes); } catch { /* se ve abajo */ } }
      if (escritos.length && escritos.some(x => huellaTexto(lectorDeArbol(arbol)(x.archivo) ?? '') !== x.huellaAntes)) {
        try { enTransaccion(db, () => guardarFuente(db, { listo: false, sucia: true })); } catch { /* el trabajador la revisa */ }
      }
      ocupado = false;
      despertar();
    }
  }
  function despertar() {
    try {
      const ahora = reloj();
      encolar(db, { tipo: 'academia.fabrica', programa: 'academia.fabrica', claveUnica: `academia.fabrica@app-${ahora}` }, { ahora });
      supervisor?.despertar?.();
    } catch { /* ya hay una en la fila */ }
  }
  return {
    probarUna,
    iniciar() {
      // Lo que quedó «probando» de antes de un reinicio vuelve a la fila.
      try { enTransaccion(db, () => { for (const p of leerPropuestas(db).filter(x => x.estado === 'probando')) cambiarPropuesta(db, p.id, { estado: 'probar' }, { si: 'probando' }); }); } catch { /* sin base */ }
      vuelta = setInterval(() => { probarUna().catch(() => registro?.error?.('No se pudo probar un cambio de Claude')); }, tiempos.cadaMs);
      vuelta.unref?.();
    },
    async parar() {
      parado = true;
      if (vuelta) clearInterval(vuelta);
      try { hijo?.kill('SIGKILL'); } catch { /* ya salió */ }
    },
  };
}
