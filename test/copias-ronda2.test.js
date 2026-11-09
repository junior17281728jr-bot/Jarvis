// Fase 1, parte e — ronda 2 del equipo rojo: las copias y la restauración. Una prueba por cada problema confirmado:
//  1. una copia hecha con el reloj adelantado (y después corregido) nunca apaga las copias de cada noche;
//  2. restaurar nunca elige en silencio una copia con fecha del futuro (la cadena «anterior» manda);
//  3. un servidor viejo que revive con el mismo bot: el nuevo lo avisa GRAVE; restaurar pregunta si hay dos «puntas»;
//  4. el disco que manda es el de la carpeta de las copias, y un disco lleno al escribir nunca frena la copia de Telegram;
//  5. una base restaurada en un servidor nuevo no cuenta como suyas las copias del servidor de antes;
//  9. Telegram caído con un aviso pendiente: la copia de la noche queda al menos en el servidor;
// 10. Telegram caído (502 en todo) en medio de subir: la copia entera en el disco nunca se pierde.
// Contra el Telegram FALSO; nunca internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { carpetaTemporal, esperarHasta } from './ayuda.js';
import { montar, CHAT, HORA, MINUTO } from './copias-tarea-base.js';
import { TELEGRAM } from '../src/canales/telegram.js';
import { crearCredencial } from '../src/canales/credencial.js';
import { canalActual } from '../src/canales/canales.js';
import { crearAvisador } from '../src/canales/avisador.js';
import { abrirAviso } from '../src/avisos/avisos.js';
import { restaurarCopia, ajustarTrasRestaurar } from '../src/copias/restaurar.js';
import { copiaAtrasada, resumenCopias, estadoCopias, ultimaFuera, planDeDisco, servidorActual } from '../src/copias/estado.js';
import { carpetaDelMes, nombreIndice } from '../src/copias/formato.js';
import { discoDeCopias } from '../src/nucleo/salud.js';
import { configDePrueba } from './ayuda.js';
import { abrirBase } from '../src/nucleo/db.js';

const DIA = 24 * HORA;
const iso = ms => new Date(ms).toISOString();
const contar = (archivo, sql) => { const d = new DatabaseSync(archivo); try { return d.prepare(sql).get().n; } finally { d.close(); } };
const rutaIndice = (b, c) => join(b.config.carpetaCopias, 'cifradas', carpetaDelMes(c.empezada_en), nombreIndice(c.copia, c.empezada_en));
function copiarCopia(b, c, carpeta, { indice = true } = {}) {
  mkdirSync(carpeta, { recursive: true });
  for (const p of b.partes(c.id)) copyFileSync(p.archivo_local, join(carpeta, basename(p.archivo_local)));
  if (indice) copyFileSync(rutaIndice(b, c), join(carpeta, basename(rutaIndice(b, c))));
  return carpeta;
}

// ---------- 1. El reloj adelantado ----------

test('ronda 2 (1): una copia hecha con el reloj 30 días adelantado, y el reloj corregido: cada noche se hace su copia; copia_atrasada y las pantallas no se engañan', async () => {
  const b = await montar({ relleno: 2 });
  try {
    const t0 = b.t;
    b.t = t0 + 30 * DIA; // la máquina despertó con la hora mal
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const futura = b.copias()[0];
    assert.equal(futura.estado, 'verificada');
    // La hora se corrige. Tres noches seguidas: cada una hace su copia (nunca «reciente» por la del futuro).
    for (let noche = 1; noche <= 3; noche++) {
      b.t = t0 + noche * DIA;
      const fin = await b.terminar(b.pedir({ origen: 'noche' }));
      assert.equal(fin.resultado?.saltada, undefined, `noche ${noche}: ${JSON.stringify(fin.resultado)}`);
      assert.equal(b.copias().at(-1).estado, 'verificada');
    }
    assert.equal(b.copias().length, 4);
    assert.equal(b.aviso('copias_fecha_futura')?.nivel, 'atencion', 'se avisa que una copia tiene fecha del futuro');
    const ultima = b.copias().at(-1);
    assert.equal(ultimaFuera(b.db, b.t).id, ultima.id, 'la última es la de verdad, no la del futuro');
    assert.equal(resumenCopias(b.db, { ahora: b.t }).ultimaFuera.fecha, ultima.empezada_en);
    assert.equal(estadoCopias(b.db, { ahora: b.t }).ultimaFuera.fecha, ultima.empezada_en);
    // 40 h sin copia: atrasada (la del futuro no la calla).
    b.t = Date.parse(ultima.empezada_en) + 40 * HORA;
    const a = copiaAtrasada(b.db, b.t);
    assert.equal(a.activo, true);
    assert.equal(a.detalle.horas, 40);
    assert.equal(resumenCopias(b.db, { ahora: b.t }).motivo, 'atrasada');
    // Cuando la hora de verdad llega a la fecha de la copia del futuro, igual no cuenta como la más nueva: las copias
    // hechas después (por su número) tienen fechas más viejas, así que la suya no es de verdad.
    b.t = Date.parse(futura.empezada_en) + 2 * HORA;
    assert.equal(ultimaFuera(b.db, b.t).id, ultima.id);
    const fin = await b.terminar(b.pedir({ origen: 'noche' }));
    assert.equal(fin.resultado?.saltada, undefined, 'tampoco ese día se salta por «reciente»');
    assert.equal(b.aviso('copias_fecha_futura'), null, 'ya no hay fechas del futuro: el aviso se cierra');
  } finally {
    await b.cerrar();
  }
});

// ---------- 2. Restaurar: la fecha del futuro nunca se elige en silencio ----------

test('ronda 2 (2): copia 1 con el reloj adelantado, copia 2 (más nueva de verdad) con la hora buena: restaurar elige la 2 por la cadena, y nombra la otra', async () => {
  const b = await montar({ relleno: 2 });
  try {
    const t0 = b.t;
    b.t = t0 + 30 * DIA;
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    b.t = t0 + HORA;
    b.db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('dato.nuevo', '1', ?)").run(iso(b.t));
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const [c1, c2] = b.copias();
    const vistos = [];
    const destino = join(carpetaTemporal('r2-futuro'), 'r.db');
    const r = await restaurarCopia({
      clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [b.config.carpetaCopias] }, destino, ahora: b.t,
      alElegir: async e => { vistos.push(e); return true; },
    });
    assert.equal(r.copia, c2.copia, 'la más nueva de verdad (la cadena dice que la 1 fue antes)');
    assert.equal(vistos[0].otraCandidata?.copia, c1.copia, 'se nombra la otra');
    assert.equal(vistos[0].otraCandidata.futura, true);
    assert.equal(contar(destino, "SELECT COUNT(*) AS n FROM ajustes WHERE clave = 'dato.nuevo'"), 1, 'la base tiene el dato nuevo');
    // Solo con la copia del futuro (su índice y sus partes): futura: true (la consola pregunta siempre).
    const sola = copiarCopia(b, c1, join(carpetaTemporal('r2-futuro-sola'), 'x'));
    const v2 = [];
    await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [sola] }, destino: null, ahora: b.t, alElegir: async e => { v2.push(e); return true; } });
    assert.deepEqual([v2[0].copia, v2[0].futura, v2[0].edadHoras], [c1.copia, true, 0]);
    // Sin índices (solo las partes de las dos): la del futuro sale primero por fecha, pero va con futura y la otra nombrada.
    const sinIndice = join(carpetaTemporal('r2-futuro-sin'), 'x');
    copiarCopia(b, c1, sinIndice, { indice: false });
    copiarCopia(b, c2, sinIndice, { indice: false });
    const v3 = [];
    await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [sinIndice] }, destino: null, ahora: b.t, alElegir: async e => { v3.push(e); return false; } })
      .catch(e => assert.equal(e.clave, 'cancelada_por_dueno'));
    assert.deepEqual([v3[0].copia, v3[0].futura, v3[0].otraCandidata?.copia], [c1.copia, true, c2.copia]);
  } finally {
    await b.cerrar();
  }
});

// ---------- 3. Dos servidores con el mismo bot ----------

test('ronda 2 (3): tras restaurar, el servidor viejo sigue mandando su índice al chat: el nuevo abre copias_otro_servidor GRAVE (y lo cierra cuando ya no pasa)', async () => {
  const b = await montar({ relleno: 2 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const a1 = b.copias()[0];
    const servidorA = a1.servidor;
    // Esta base pasa a ser la del servidor NUEVO (como tras restaurar: otro id, el viejo en servidor.origenes).
    ajustarTrasRestaurar(b.db, { ahora: b.t });
    assert.notEqual(servidorActual(b.db), servidorA);
    b.avanzar(HORA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    // El viejo revive (mismo token) y fija SU índice en el chat (aquí, el índice auténtico de su copia).
    const cred = crearCredencial({ token: b.token, base: b.falso.url });
    const s = await TELEGRAM.enviarArchivo(cred, { destino: String(CHAT), nombre: 'viejo-indice.txt', datos: readFileSync(rutaIndice(b, a1)) });
    assert.equal(s.motivo, 'ok');
    assert.equal((await TELEGRAM.fijar(cred, { destino: String(CHAT), mensajeId: s.mensajeId })).motivo, 'ok');
    b.avanzar(DIA);
    assert.equal((await b.terminar(b.pedir({ origen: 'noche' }))).estado, 'hecha');
    const aviso = b.aviso('copias_otro_servidor');
    assert.equal(aviso?.nivel, 'grave', 'el servidor nuevo dice que otro manda copias');
    assert.equal(JSON.parse(aviso.detalle).viejo, true);
    // La copia de esta noche volvió a fijar la suya; la noche siguiente, todo bien: el aviso se cierra.
    b.avanzar(DIA);
    assert.equal((await b.terminar(b.pedir({ origen: 'noche' }))).estado, 'hecha');
    assert.equal(b.aviso('copias_otro_servidor'), null);
  } finally {
    await b.cerrar();
  }
});

test('ronda 2 (3): dos copias que dicen la MISMA anterior (dos servidores): restaurar nombra la otra «punta» y la consola pregunta', async () => {
  const b = await montar({ relleno: 2 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    b.avanzar(HORA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const [c1, c2] = b.copias();
    // El otro servidor: su próxima copia dice como anterior la c1 (no conoció la c2) y tiene otro id.
    b.db.prepare("UPDATE copias SET estado = 'interrumpida' WHERE id = ?").run(c2.id);
    ajustarTrasRestaurar(b.db, { ahora: b.t });
    b.avanzar(HORA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    b.db.prepare("UPDATE copias SET estado = 'verificada' WHERE id = ?").run(c2.id);
    const c3 = b.copias().at(-1);
    const vistos = [];
    await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [b.config.carpetaCopias] }, destino: null, ahora: b.t, alElegir: async e => { vistos.push(e); return true; } });
    assert.equal(vistos[0].copia, c3.copia);
    assert.equal(vistos[0].anterior?.copia, c1.copia);
    assert.deepEqual([vistos[0].otraCandidata?.copia, vistos[0].otraCandidata?.motivo], [c2.copia, 'otra_punta']);
    assert.equal(vistos[0].otraCandidata.servidor, c2.servidor);
  } finally {
    await b.cerrar();
  }
});

test('ronda 2 (3): una noche sin Telegram en medio (copia solo en el servidor) NO es «otra punta»: restaurar no pregunta por eso', async () => {
  const b = await montar({ relleno: 2 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    b.avanzar(DIA);
    b.falso.escena('sendDocument', 'error_500', { veces: 3 });
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.equal(b.copias()[1].estado, 'solo_local');
    b.avanzar(DIA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const vistos = [];
    await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [b.config.carpetaCopias] }, destino: null, ahora: b.t, alElegir: async e => { vistos.push(e); return true; } });
    assert.equal(vistos[0].copia, b.copias()[2].copia);
    assert.deepEqual([vistos[0].otraCandidata, vistos[0].futura, vistos[0].hayMasNueva], [null, false, null]);
  } finally {
    await b.cerrar();
  }
});

// ---------- 4. El disco de las copias ----------

test('ronda 2 (4): la política mide el disco de las COPIAS (otro disco: su propio margen); la carpeta que no existe se mide por la de arriba', () => {
  // Datos con mucho espacio, copias en otro disco casi lleno: sin copias aquí, y el número que se muestra es el de las copias.
  const p = planDeDisco({ libreMb: 10_000, libreCopiasMb: 1, mismoDisco: false, baseMb: 1 });
  assert.deepEqual([p.local, p.motivo, p.libreMb, p.otroDisco], [false, 'disco', 1, true]);
  // En otro disco no hace falta el piso de 2 GB de los datos: 256 MB de margen.
  assert.equal(planDeDisco({ libreMb: 10_000, libreCopiasMb: 400, mismoDisco: false, baseMb: 1 }).local, true);
  assert.equal(planDeDisco({ libreMb: 10_000, libreCopiasMb: 400, mismoDisco: true, baseMb: 1 }).local, false, 'en el mismo disco, el piso de siempre');
  // El freno sigue siendo el disco de los datos.
  assert.equal(planDeDisco({ libreMb: 200, libreCopiasMb: 50_000, mismoDisco: false }).freno, true);
  const raiz = carpetaTemporal('r2-disco');
  const d = discoDeCopias(join(raiz, 'no', 'existe', 'todavia'), raiz);
  assert.ok(d.libreMb > 0);
  assert.equal(d.mismoDisco, true);
  assert.ok(!existsSync(join(raiz, 'no')), 'medir nunca crea la carpeta');
});

test('ronda 2 (4): el disco de las copias no deja escribir (ENOSPC en la parte 3): la copia sigue directo a Telegram en la MISMA tarea; copias_locales_pausadas lo dice', async () => {
  let escritas = 0;
  const b = await montar({
    relleno: 16,
    manejador: {
      escribirArchivo: (ruta, datos) => {
        if (++escritas === 3) { const e = new Error('no space left on device'); e.code = 'ENOSPC'; throw e; }
        const fd = openSync(ruta, 'wx', 0o640);
        try { writeSync(fd, datos); } finally { closeSync(fd); }
      },
    },
  });
  try {
    const id = b.pedir();
    const fin = await b.terminar(id);
    assert.equal(fin.estado, 'hecha');
    const [medias, buena] = b.copias();
    assert.deepEqual([medias.estado, medias.motivo], ['interrumpida', 'disco_lleno']);
    assert.equal(b.partes(medias.id).length, 2, 'lo que alcanzó a escribir se queda (nada se borra)');
    assert.deepEqual([buena.estado, buena.local, buena.fuera, buena.tarea_id], ['verificada', 0, 1, id], 'directo a Telegram, misma tarea');
    assert.ok(b.falso.documentos.length >= buena.partes + 1, 'las partes y el índice llegaron a Telegram');
    const aviso = b.aviso('copias_locales_pausadas');
    assert.equal(JSON.parse(aviso.detalle).motivo, 'escribir');
    // Con el disco de las COPIAS casi lleno (los datos con mucho espacio): la copia va directo a Telegram desde el principio.
    b.avanzar(HORA);
    b.opcionesManejador.escribirArchivo = undefined;
    b.opcionesManejador.discoCopias = () => ({ libreMb: 1, mismoDisco: false });
    b.nuevoEjecutor();
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.deepEqual([b.copias().at(-1).local, b.copias().at(-1).fuera, b.copias().at(-1).estado], [0, 1, 'verificada']);
  } finally {
    await b.cerrar();
  }
});

// ---------- 5. Las copias del servidor anterior ----------

test('ronda 2 (5): una base restaurada en un servidor nuevo no cuenta como suyas las copias del de antes (sus archivos no están aquí)', async () => {
  const b = await montar({ relleno: 2 });
  try {
    for (let i = 0; i < 3; i++) { assert.equal((await b.terminar(b.pedir())).estado, 'hecha'); b.avanzar(HORA); }
    const antes = estadoCopias(b.db, { ahora: b.t }).locales;
    assert.deepEqual([antes.copias, antes.anterior], [3, null]);
    const destino = join(carpetaTemporal('r2-restaurada'), 'nuevo', 'oportia.db');
    mkdirSync(join(destino, '..'), { recursive: true });
    await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [b.config.carpetaCopias] }, destino, ahora: b.t });
    const config = { ...configDePrueba(), archivoBase: destino };
    const db = abrirBase(config);
    try {
      const l = estadoCopias(db, { ahora: b.t }).locales;
      assert.equal(l.copias, 0, 'en este servidor no hay ninguna');
      assert.equal(l.anterior?.copias, 2, 'las dos de antes de la foto quedan aparte: del servidor anterior');
    } finally {
      db.close();
    }
  } finally {
    await b.cerrar();
  }
});

// ---------- 9. Telegram caído y un aviso pendiente ----------

test('ronda 2 (9): Telegram caído (502 en todo) y un aviso pendiente: las esperas del que manda avisos no son un 429; la copia queda en el servidor', async () => {
  for (const clave of [{ clave: 'disco_bajo', nivel: 'atencion', detalle: { libreMb: 900 } }, { clave: 'copia_atrasada', nivel: 'grave', detalle: { horas: 31 } }]) {
    const b = await montar({ relleno: 4 });
    try {
      const avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
      b.falso.escena('*', 'error_502', { veces: 1e9 });
      abrirAviso(b.db, { ...clave, ahora: b.t });
      const id = b.pedir({ origen: 'noche' });
      let fin = null;
      for (let i = 0; i < 4 * 60 * 4 && !fin; i++) { // hasta 4 h de reloj de mentira, de 15 en 15 s
        b.avanzar(15_000);
        await avisador.pasada();
        const f = b.tarea(id);
        if (f.estado === 'lista' && Date.parse(f.disponible_en) <= b.t) {
          await b.ejecutor.ciclo();
          await esperarHasta(() => !b.ejecutor.estado().enCurso.length, { cada: 2, ms: 60_000, que: 'el paso' });
        }
        if (['hecha', 'fallida', 'revisar', 'cancelada'].includes(b.tarea(id).estado)) fin = b.tarea(id);
      }
      assert.equal(fin?.estado, 'hecha', clave.clave);
      assert.deepEqual(b.copias().map(c => [c.estado, c.local, c.fuera]), [['solo_local', 1, 0]], clave.clave);
      assert.ok(canalActual(b.db).pausa_motivo === 'espera', 'la pausa del canal es de las esperas tras fallos, no un 429');
    } finally {
      await b.cerrar();
    }
  }
});

// ---------- 10. Telegram cae en medio de subir ----------

test('ronda 2 (10): Telegram cae del todo (502 en cada método) justo al empezar a subir: la copia entera en el disco queda «solo en el servidor», comprobada', async () => {
  const b = await montar({ relleno: 8 });
  try {
    const adaptador = (await import('../src/canales/canal.js')).ADAPTADORES.telegram;
    let caido = false;
    b.opcionesManejador.adaptador = {
      ...adaptador,
      enviarArchivo: async (...a) => { if (!caido) { caido = true; b.falso.escena('*', 'error_502', { veces: 1e9 }); } return adaptador.enviarArchivo(...a); },
    };
    b.nuevoEjecutor();
    const fin = await b.terminar(b.pedir());
    assert.equal(fin.estado, 'hecha');
    const [c] = b.copias();
    assert.deepEqual([c.estado, c.local, c.fuera, c.motivo], ['solo_local', 1, 0, 'telegram_no_responde']);
    assert.ok(b.partes(c.id).every(p => p.verificada_en), 'cada parte leída otra vez del disco');
    assert.ok(existsSync(rutaIndice(b, c)), 'con su índice en el servidor');
    assert.equal(b.aviso('copia_solo_local')?.nivel, 'atencion');
    assert.equal(b.aviso('copia_fallida'), null);
    // Y se restaura desde esos archivos.
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [b.config.carpetaCopias] }, destino: null, ahora: b.t });
    assert.equal(r.copia, c.copia);
  } finally {
    await b.cerrar();
  }
});

void MINUTO;
