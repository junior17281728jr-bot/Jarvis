// Fase 1, parte e — revisión final. Una prueba por cada problema confirmado que se puede probar sin un navegador:
//  1. tras restaurar en un servidor nuevo (sin el archivo de la llave), Claves deja pegar otra vez las claves, Copias
//     deja crear una clave nueva y la copia siguiente llega a «comprobada», sin pasar por la consola;
//  2. con --telegram, --anterior se rechaza y una parte dañada en Telegram dice la salida de verdad (--indice o --archivos);
//  3. una copia que espera para reintentar dice por qué y cuándo (no «empieza en un momento»), y la última buena se ve;
//  4. «Próxima» no promete la copia de la noche si se va a saltar por una reciente;
//  5. los tamaños chicos se dicen en KB (nunca «0 MB») y «1 parte» en singular;
//  6. el texto de «modo seguro» para Telegram nunca dice «tus datos están bien» si la base tiene un problema;
//  7. directo a Telegram (sin disco) las partes miden 1 MiB, para gastar menos memoria con la foto abierta.
// Las de las pantallas (pasos para recuperar, motivos en Trabajo, nombre corto de la clave) están en pantallas.test.js.
// Contra el Telegram FALSO; nunca internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carpetaTemporal, esperarHasta } from './ayuda.js';
import { montar, ponerClave, segundoCodigo, SILENCIO, CHAT, HORA, MINUTO } from './copias-tarea-base.js';
import { abrirBase } from '../src/nucleo/db.js';
import { restaurarCopia } from '../src/copias/restaurar.js';
import { estadoAlmacen, guardarSecreto } from '../src/claves/almacen.js';
import { permisoLlaveNueva, estadoLlave, marcaDeRestaurada } from '../src/claves/cifrado.js';
import { crearEjecutor } from '../src/tareas/ejecutor.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import { nuevaCorrida } from '../src/tareas/corridas.js';
import { MANEJADORES } from '../src/tareas/manejadores.js';
import { encolar } from '../src/tareas/cola.js';
import { crearManejadorCopias } from '../src/copias/hacer.js';
import { crearClavePendiente, estadoCopias, proximaCopia, PROGRAMA_COPIAS } from '../src/copias/estado.js';
import { ranura } from '../src/tareas/tiempo.js';
import { megas, textoCopia, cuerpoDeAviso } from '../src/canales/textos.js';
import { readFileSync } from 'node:fs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const existe = clave => clave in es && clave in en;

// ---------- 1. Después de restaurar: pegar otra vez, clave nueva, copia comprobada ----------

test('revisión (1): una base recuperada en un servidor nuevo deja pegar las claves y crear una clave nueva; la copia siguiente queda comprobada', async () => {
  const b = await montar({ relleno: 4 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    // El servidor nuevo: otra carpeta de datos, SIN el archivo de la llave (nunca viaja en una copia).
    const carpeta = carpetaTemporal('revision-nuevo');
    const datos = join(carpeta, 'datos');
    mkdirSync(datos, { recursive: true });
    const destino = join(datos, 'oportia.db');
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [join(b.config.carpetaCopias, 'cifradas')] }, destino, ahora: b.t });
    assert.equal(r.ok, true);
    assert.equal(r.claves.telegram, true, 'la copia traía el token (cifrado con la llave que se quedó allá)');
    const config = { archivoBase: destino, carpetaCopias: join(datos, 'oportia-copias'), raiz: carpeta, carpetaDatos: datos, canalesBases: b.config.canalesBases };
    const db = abrirBase(config);
    try {
      assert.equal(estadoLlave(config).motivo, 'llave_no_existe');
      const marca = marcaDeRestaurada(db);
      assert.ok(marca?.huellas.length >= 1, 'la base quedó marcada como recuperada, con las huellas que traía');
      // Antes: 503 almacen_no_disponible. Ahora: lista, y dice que es una base recuperada.
      assert.deepEqual(estadoAlmacen(db, config), { listo: true, motivo: 'restaurada' });
      const g = guardarSecreto(db, config, { uso: 'telegram_bot', valor: b.token, usuarioId: b.admin });
      assert.equal(g.secreto.estado, 'activa');
      assert.equal(estadoLlave(config).listo, true, 'se creó una llave nueva');
      assert.deepEqual(estadoAlmacen(db, config), { listo: true, motivo: null });
      // Si esa llave nueva faltara después, la puerta se cierra otra vez (hay una clave guardada con ella).
      assert.equal(permisoLlaveNueva({ ...config, carpetaDatos: join(carpeta, 'otra') }, {
        huellas: [...marca.huellas, estadoLlave(config).huella], ultimaMs: Date.now(), restaurada: marca,
      }).si, false);
      // Una clave de recuperación nueva (antes: 503) y una copia que llega a «verificada».
      const nueva = crearClavePendiente(db, { config, usuarioId: b.admin, ahora: b.t });
      assert.ok(nueva.clave);
      ponerClave(db, { config, usuarioId: b.admin, ahora: b.t });
      const corrida = nuevaCorrida(db, { version: '0.5.0', codigo: 'prueba', ahora: b.t });
      const ejecutor = crearEjecutor({
        db, config, corrida, escritor: crearEscritor(db, { registro: SILENCIO, dormir: async () => {} }),
        manejadores: { ...MANEJADORES, 'copias.hacer': crearManejadorCopias(b.opcionesManejador) },
        tiempos: { rssMaxMb: 1e9, graciaAbortoMs: 200 }, programas: [], memoriaDisponibleMb: () => 1000, discoLibreMb: () => 100_000,
        pedirSalida: () => {}, log: SILENCIO, reloj: b.reloj, version: '0.5.0', codigo: 'prueba',
      });
      try {
        const id = encolar(db, { tipo: 'copias.hacer', programa: 'copias.hacer', claveUnica: `copias.hacer@revision-${b.t}`, datos: { origen: 'manual' } }, { ahora: b.t }).id;
        let fila;
        for (let i = 0; i < 400; i++) {
          await ejecutor.ciclo();
          await esperarHasta(() => !ejecutor.estado().enCurso.length, { que: 'el paso', cada: 5, ms: 60_000 });
          fila = db.prepare('SELECT * FROM tareas WHERE id = ?').get(id);
          if (['hecha', 'fallida', 'revisar', 'cancelada'].includes(fila.estado)) break;
          if (fila.estado === 'lista' && Date.parse(fila.disponible_en) > b.t) b.t = Date.parse(fila.disponible_en) + 1;
        }
        assert.equal(fila.estado, 'hecha', fila.ultimo_error ?? '');
        const ultima = db.prepare('SELECT * FROM copias ORDER BY id DESC').get();
        assert.deepEqual([ultima.estado, ultima.fuera], ['verificada', 1]);
      } finally {
        await ejecutor.parar({ esperaMs: 0 });
      }
    } finally {
      db.close();
    }
  } finally {
    await b.cerrar();
  }
});

test('revisión (1): sin marca de «recuperada», la llave que falta con claves guardadas sigue pidiendo la consola', () => {
  const config = { carpetaDatos: carpetaTemporal('revision-sin-marca') };
  assert.equal(permisoLlaveNueva(config, { huellas: ['aaaaaaaaaaaaaaaa'], ultimaMs: Date.now() }).si, false);
  assert.equal(permisoLlaveNueva(config, { huellas: ['aaaaaaaaaaaaaaaa'], ultimaMs: Date.now(), restaurada: { huellas: ['bbbbbbbbbbbbbbbb'] } }).si, false, 'una clave que no traía la copia');
  assert.deepEqual(permisoLlaveNueva(config, { huellas: ['aaaaaaaaaaaaaaaa'], ultimaMs: Date.now(), restaurada: { huellas: ['aaaaaaaaaaaaaaaa'] } }), { si: true, motivo: 'restaurada', recuperable: false });
});

// ---------- 2. El programa para restaurar con --telegram: --anterior y una parte dañada ----------

function restaurar(argumentos, { entrada = '', env = {}, alSalir = null, abierta = false } = {}) {
  return new Promise(listo => {
    const hijo = spawn(process.execPath, ['--no-warnings', 'deploy/oportia-restaurar.mjs', ...argumentos], {
      cwd: RAIZ, env: { PATH: process.env.PATH, OPORTIA_TEST: '1', ...env }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    hijo.stdout.on('data', d => { stdout += d; alSalir?.(stdout, hijo); });
    hijo.stderr.on('data', d => { stderr += d; });
    const reloj = setTimeout(() => hijo.kill('SIGKILL'), 60_000);
    hijo.on('close', status => { clearTimeout(reloj); listo({ status, stdout, stderr }); });
    if (abierta) hijo.stdin.write(entrada);
    else hijo.stdin.end(entrada);
  });
}

test('revisión (2): --telegram --anterior se rechaza nombrando --indice y --archivos; una parte dañada en Telegram dice esa salida (nunca «prueba con --anterior»)', async () => {
  const b = await montar({ relleno: 16 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const no = await restaurar(['--telegram', '--anterior', '--comprobar']);
    assert.equal(no.status, 2);
    assert.match(no.stderr, /--indice=/);
    assert.match(no.stderr, /--archivos=/);
    // Se daña la parte 2 en el Telegram falso.
    const [c] = b.copias();
    const p2 = b.partes(c.id).find(p => p.n === 2);
    assert.ok(p2?.archivo_id, 'la parte 2 está en Telegram');
    b.falso.danarArchivo(p2.archivo_id);
    let escrito = false;
    let confirmado = false;
    const r = await restaurar(['--telegram', '--comprobar', `--trabajo=${carpetaTemporal('revision-trabajo')}`], {
      entrada: `${b.token}\nsí\n`, abierta: true, env: { OPORTIA_TELEGRAM_URL: b.falso.url },
      alSalir: (texto, hijo) => {
        const m = /este código: (\d{4} \d{4})/.exec(texto);
        if (m && !escrito) { escrito = true; b.falso.escribir({ chat: CHAT, texto: m[1] }); }
        if (!confirmado && /código de 6 cifras que te mandó el bot/.test(texto)) { confirmado = true; hijo.stdin.end(`${segundoCodigo(b.falso)}\n${b.claveTexto}\n`); }
      },
    });
    assert.equal(r.status, 4, r.stderr);
    assert.match(r.stderr, /--telegram --indice=/);
    assert.match(r.stderr, /--archivos=/);
    assert.doesNotMatch(r.stderr, /--anterior/);
  } finally {
    await b.cerrar();
  }
});

// ---------- 3. Reintentando: por qué y cuándo, y la última buena a la vista ----------

test('revisión (3): una copia que espera otro intento (Telegram respondió 500) dice el motivo y la hora; «en la fila» solo si nunca empezó', async () => {
  const { vistaCopias, fraseMotivoTareaCopia } = await import('../public/copias-vista.js');
  const b = await montar({ relleno: 4 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    // Una pedida que todavía no empezó: en la fila (tomas 0).
    const id = b.pedir();
    const huellaLlave = estadoLlave(b.config).huella;
    let e = estadoCopias(b.db, { ahora: b.t, libreMb: 100_000, telegram: { listo: true, chat: { estado: 'activo' } }, huellaLlave });
    assert.deepEqual([e.enCurso?.esperando, e.enCurso?.tomas], [true, 0]);
    assert.equal(vistaCopias(e, b.t).estado, 'en_fila');
    // Telegram responde 500 a cada documento: la tarea espera otro intento.
    b.falso.escena('sendDocument', 'error_500', { veces: 200 });
    let fila;
    for (let i = 0; i < 60; i++) {
      await b.ejecutor.ciclo();
      await esperarHasta(() => !b.ejecutor.estado().enCurso.length, { que: 'el paso', cada: 5, ms: 60_000 });
      fila = b.tarea(id);
      if (fila.fallos_seguidos > 0 || fila.estado !== 'lista') break;
      if (Date.parse(fila.disponible_en) > b.t) b.t = Date.parse(fila.disponible_en) + 1;
    }
    assert.equal(fila.estado, 'lista');
    assert.ok(fila.fallos_seguidos > 0, 'falló un intento');
    e = estadoCopias(b.db, { ahora: b.t, libreMb: 100_000, telegram: { listo: true, chat: { estado: 'activo' } }, huellaLlave });
    assert.equal(e.enCurso.esperando, true);
    assert.equal(e.enCurso.motivo, fila.ultimo_error);
    assert.equal(e.enCurso.disponibleEn, fila.disponible_en);
    const v = vistaCopias(e, b.t);
    assert.deepEqual([v.estado, v.tono, v.linea], ['reintentando', 'atencion', 'copias.reintentando']);
    assert.equal(v.variables.cuando, fila.disponible_en);
    // El motivo se dice con palabras en los dos idiomas (nunca «error_servidor»).
    const frase = fraseMotivoTareaCopia(v.variables.motivo, existe);
    assert.ok(existe(frase) && frase !== 'copias.motivo.otro', frase);
    for (const idioma of [es, en]) assert.ok(idioma[v.titulo] && idioma[v.linea].includes('{motivo}') && idioma[v.linea].includes('{cuando}'));
    // La última copia buena sigue en la respuesta (la pantalla la muestra mientras tanto).
    assert.ok(e.ultimaFuera?.fecha);
  } finally {
    await b.cerrar();
  }
});

// ---------- 4. «Próxima» no promete la copia que se va a saltar ----------

test('revisión (4): con una copia comprobada de hace menos de 6 h antes de las 4:40, «Próxima» es la noche siguiente', async () => {
  const b = await montar({ relleno: 2 });
  try {
    // 2:29 a. m. de RD (6:29 UTC) de mañana: la ranura de las 4:40 de ese día todavía no tiene tarea.
    const dia = new Date(b.t + 24 * HORA);
    const a229 = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 6, 29);
    const a440 = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 8, 40);
    // La copia de la noche de AYER ya se hizo (su tarea existe, como en el servidor de verdad).
    const ayer = ranura(PROGRAMA_COPIAS, a229);
    const t0 = encolar(b.db, { tipo: 'copias.hacer', programa: 'copias.hacer', claveUnica: ayer.clave, datos: { origen: 'noche' } }, { ahora: a229 - 22 * HORA }).id;
    b.db.prepare("UPDATE tareas SET estado = 'hecha' WHERE id = ?").run(t0);
    assert.equal(proximaCopia(b.db, a229), new Date(a440).toISOString(), 'sin copia reciente: hoy 4:40');
    b.t = a229;
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.equal(proximaCopia(b.db, a229 + 5 * MINUTO), new Date(a440 + 24 * HORA).toISOString(), 'la de hoy se salta: la próxima es mañana');
    // Una copia de las 9 p. m. (más de 6 h antes) no la salta.
    const otra = await montar({ relleno: 2 });
    try {
      otra.t = a229 - 5 * HORA - 30 * MINUTO; // 9:00 p. m. de RD
      assert.equal((await otra.terminar(otra.pedir())).estado, 'hecha');
      assert.equal(proximaCopia(otra.db, a229), new Date(a440).toISOString());
    } finally {
      await otra.cerrar();
    }
  } finally {
    await b.cerrar();
  }
});

// ---------- 5. Tamaños chicos y «1 parte» ----------

test('revisión (5): una copia de pocos KB se dice en KB (nunca «0 MB») y con «1 parte»; Copias manda los bytes del disco', async () => {
  assert.equal(megas(7 * 1024, 'es'), '7 KB');
  assert.equal(megas(100, 'en'), '1 KB');
  assert.equal(megas(41 * 1024 * 1024, 'es'), '41 MB');
  assert.doesNotMatch(megas(30 * 1024, 'es'), /\b0 MB/);
  for (const idioma of ['es', 'en']) {
    const uno = textoCopia('indice', idioma, { creada: new Date().toISOString(), bytes: 9 * 1024, partes: 1 });
    assert.match(uno, idioma === 'es' ? /9 KB, 1 parte\b/ : /9 KB, 1 part\b/);
    assert.doesNotMatch(uno, /1 partes|1 parts/);
    assert.match(textoCopia('indice', idioma, { creada: new Date().toISOString(), bytes: 3 * 1024 * 1024, partes: 2 }), idioma === 'es' ? /2 partes/ : /2 parts/);
  }
  const b = await montar({ relleno: 0 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const e = estadoCopias(b.db, { ahora: b.t, libreMb: 100_000 });
    assert.ok(e.locales.bytes > 0 && e.locales.bytes < 1024 * 1024, 'los bytes de verdad (la pantalla dice KB)');
    const indice = b.falso.documentos.filter(d => /No borres/.test(String(d.leyenda ?? ''))).at(-1);
    assert.ok(indice, 'el índice llegó con su leyenda');
    assert.match(indice.leyenda, /\d+ KB, 1 parte\b/);
    assert.doesNotMatch(indice.leyenda, /\b0 MB|1 partes/);
  } finally {
    await b.cerrar();
  }
});

// ---------- 6. Modo seguro por la base: nunca «tus datos están bien» ----------

test('revisión (6): el aviso de modo seguro en Telegram nunca dice que todo está bien; por la base, pide revisar antes de quitarlo', () => {
  for (const idioma of ['es', 'en']) {
    for (const motivo of ['base_danada', 'base_no_compatible']) {
      const texto = cuerpoDeAviso({ clave: 'modo_seguro', nivel: 'grave', detalle: JSON.stringify({ origen: 'automatico', motivo }) }, idioma);
      assert.doesNotMatch(texto, /datos están bien|data is fine/i, `${idioma} ${motivo}`);
      assert.match(texto, idioma === 'es' ? /antes de quitar el modo seguro/ : /before turning safe mode off/);
    }
    const otro = cuerpoDeAviso({ clave: 'modo_seguro', nivel: 'grave', detalle: JSON.stringify({ origen: 'automatico', motivo: 'trabajador_inestable' }) }, idioma);
    assert.doesNotMatch(otro, /datos están bien|data is fine/i);
  }
});

// ---------- 7. Directo a Telegram: partes de 1 MiB (menos memoria con la foto abierta) ----------

test('revisión (7): directo a Telegram cada parte mide como mucho 1 MiB (aunque el tamaño normal sea 2 MiB); con disco, 2 MiB', async () => {
  const { TAMANO_PARTE_DIRECTO } = await import('../src/copias/hacer.js');
  const { TAMANO_PARTE, CABECERA_PARTE } = await import('../src/copias/formato.js');
  const { CLAVE_AJUSTES } = await import('../src/copias/estado.js');
  assert.equal(TAMANO_PARTE_DIRECTO, 1024 * 1024);
  const b = await montar({ relleno: 160, manejador: { tamanoParte: TAMANO_PARTE } });
  try {
    b.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(CLAVE_AJUSTES, JSON.stringify({ local: false }), new Date().toISOString());
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const directa = b.copias().at(-1);
    assert.deepEqual([directa.estado, directa.local, directa.fuera], ['verificada', 0, 1]);
    const partes = b.partes(directa.id);
    assert.ok(partes.length >= 3, `${partes.length} partes`);
    assert.ok(partes.every(p => p.bytes <= TAMANO_PARTE_DIRECTO + CABECERA_PARTE), 'ninguna pasa de 1 MiB');
    // Y se recupera igual (el formato no cambia).
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'telegram', token: b.token, chatId: String(CHAT) }, destino: null, carpetaTrabajo: carpetaTemporal('revision-directo'), base: b.falso.url, ahora: b.t });
    assert.equal(r.copia, directa.copia);
    // Con el disco: el tamaño normal.
    b.db.prepare('UPDATE ajustes SET valor = ? WHERE clave = ?').run(JSON.stringify({ local: true }), CLAVE_AJUSTES);
    b.avanzar(HORA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const local = b.copias().at(-1);
    assert.equal(local.local, 1);
    assert.ok(b.partes(local.id).length < partes.length, 'con 2 MiB salen menos partes');
  } finally {
    await b.cerrar();
  }
});

test('revisión (1): el programa para restaurar dice los pasos que siguen (pegar las claves y crear una clave nueva)', async () => {
  const b = await montar({ relleno: 4, telegram: false });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const destino = join(carpetaTemporal('revision-cli'), 'recuperada.db');
    const r = await restaurar([`--archivos=${join(b.config.carpetaCopias, 'cifradas')}`, `--destino=${destino}`], { entrada: `${b.claveTexto}\n` });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Administrador → Claves pega otra vez/);
    assert.match(r.stdout, /clave de recuperación NUEVA/);
  } finally {
    await b.cerrar();
  }
});
