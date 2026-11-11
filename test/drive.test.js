// Pruebas de la Academia 0.7.1: el contenido llega SOLO desde una carpeta de Google Drive. Nunca usan internet: un Drive
// FALSO en 127.0.0.1 imita las dos direcciones (la lista «embeddedfolderview», con un HTML escrito aquí, y la de bajar
// archivos), y un tercer servidor «ajeno» cuenta si alguien llegó a él (nunca debe). Usan la muestra (test/academia-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { crearServidor } from '../src/app.js';
import { abrirBase, enTransaccion } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { idDeCarpeta, leerListado, listarCarpeta, TOPES_DRIVE, HOST_LISTA, HOST_BAJAR } from '../src/academia/drive.js';
import { crearSincronizador, ESPERAS_MAXIMAS } from '../src/academia/sincronizar.js';
import { importarEntrante, crearImportador } from '../src/academia/importador.js';
import { guardarCarpetaDrive, leerRevisiones } from '../src/academia/drive-estado.js';
import { paqueteActivo, leerEnUso } from '../src/academia/paquetes.js';
import { LIMITES } from '../src/academia/formato.js';
import { PROGRAMAS_DEL_SISTEMA, definicion } from '../src/tareas/tipos.js';
import { MANEJADORES } from '../src/tareas/manejadores.js';
import { rangoPedido } from '../src/api/academia.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const CLAVE = 'una clave bien larga';
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const RAIZ = 'carpetaRaizDePrueba01';
const SUB_FIG = 'carpetaFigurasPrueba1';
const SUB_M2 = 'carpetaMateriaDos0001';

// Un mp3 «de mentira» que pasa la revisión: la etiqueta ID3 y bytes que se reconocen por su posición.
const mp3 = (n = 5000) => Buffer.concat([Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1'), Buffer.from(Array.from({ length: n }, (_, i) => i % 251))]);

// La muestra para la materia «sistemas» (otra materia, sus propios ids; la figura también se llama M1 / figura-m1.png).
function paqueteSistemas() {
  const p = paqueteMuestra();
  p.nombre = 'Paquete de muestra 2 (no es material real)';
  p.edicion = 'muestra-sistemas';
  p.materias[0].id = 'sistemas';
  const nuevoId = id => id.replace('muestra-', 'muestra-s-');
  for (const t of p.materias[0].temas) { t.id = nuevoId(t.id); t.preguntas = t.preguntas.map(nuevoId); }
  for (const q of p.preguntas) q.id = nuevoId(q.id);
  return p;
}
function paqueteConAudio() {
  const p = paqueteMuestra();
  p.edicion = 'muestra-audio';
  p.materias[0].audio = { archivo: 'resumen-factores.mp3', titulo: 'Resumen de la materia (muestra)' };
  return p;
}

// ---------- El Drive falso ----------
// carpetas: id → [{ id, nombre, carpeta?, modificado? }]; archivos: id → { cuerpo, tipo, redirige? }.
function htmlDeCarpeta(entradas) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const filas = entradas.map(e => {
    const href = e.carpeta ? `https://drive.google.com/drive/folders/${e.id}` : `https://drive.google.com/file/d/${e.id}/view?usp=drive_web`;
    return `<div class="flip-entry" id="entry-${e.id}" tabindex="0" role="link"><div class="flip-entry-info"><a href="${href}" target="_blank">`
      + `<div class="flip-entry-list-icon"><img src="https://drive-thirdparty.googleusercontent.com/16/type/x" alt=""></div>`
      + `<div class="flip-entry-title">${esc(e.nombre)}</div><div class="flip-entry-last-modified"><div>${esc(e.modificado ?? '3:10 PM')}</div></div></a></div></div>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Carpeta</title><script>var x = "<a href='/file/d/noEsUnaEntrada99/view'>";</script></head>`
    + `<body><div class="flip-view-title">Carpeta</div><div class="flip-entries">${filas}</div><a href="https://www.google.com/intl/es/policies/">Políticas</a></body></html>`;
}

async function conDrive(fn) {
  const estado = { carpetas: new Map(), archivos: new Map(), pedidos: [], ajenos: 0, html: new Map() };
  const ajeno = createServer((req, res) => { estado.ajenos += 1; res.end('no'); });
  const lista = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    estado.pedidos.push(`lista ${u.pathname}?${u.searchParams.get('id')}`);
    const id = u.searchParams.get('id');
    if (u.pathname !== '/embeddedfolderview' || !estado.carpetas.has(id)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<html>no</html>'); }
    if (estado.html.has(id)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(estado.html.get(id)); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlDeCarpeta(estado.carpetas.get(id)));
  });
  const bajar = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const id = u.searchParams.get('id');
    estado.pedidos.push(`bajar ${id}`);
    const a = estado.archivos.get(id);
    if (u.pathname !== '/download' || u.searchParams.get('confirm') !== 't' || !a) { res.writeHead(404); return res.end(); }
    if (a.redirige) { res.writeHead(302, { Location: a.redirige(estado) }); return res.end(); }
    res.writeHead(200, { 'Content-Type': a.tipo, 'Content-Length': a.cuerpo.length });
    res.end(a.cuerpo);
  });
  const abrir = s => new Promise(ok => s.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${s.address().port}`)));
  const [bLista, bBajar, bAjeno] = await Promise.all([abrir(lista), abrir(bajar), abrir(ajeno)]);
  Object.assign(estado, { bases: { lista: bLista, bajar: bBajar }, ajeno: bAjeno });
  // Ayudas para armar la carpeta.
  estado.poner = (carpeta, entrada, archivo) => {
    if (!estado.carpetas.has(carpeta)) estado.carpetas.set(carpeta, []);
    estado.carpetas.get(carpeta).push(entrada);
    if (archivo) estado.archivos.set(entrada.id, archivo);
  };
  estado.json = p => ({ cuerpo: Buffer.from(JSON.stringify(p)), tipo: 'application/json' });
  estado.png = b => ({ cuerpo: b, tipo: 'image/png' });
  estado.bajadas = id => estado.pedidos.filter(x => x === `bajar ${id}`).length;
  try { await fn(estado); } finally { await Promise.all([lista, bajar, ajeno].map(s => new Promise(ok => s.close(ok)))); }
}

// La base, la carpeta guardada y una revisión «como la del trabajador» (el mismo manejador, en este proceso).
function prepararBase(drive) {
  const config = { ...configDePrueba(), driveBases: drive.bases };
  const db = abrirBase(config);
  enTransaccion(db, () => guardarCarpetaDrive(db, RAIZ));
  return { config, db };
}
// Como el trabajador y el servidor web juntos: cada paso de la tarea; cuando espera, una pasada del que importa.
async function revisar(db, config, { forzar = false, topes = {}, senal = new AbortController().signal, importar = true } = {}) {
  const paso = crearSincronizador({ topes });
  let punto = null;
  for (let i = 0; i < 50; i++) {
    const ctx = { db, config, senal, tarea: { id: 1, punto, datos: { origen: forzar ? 'manual' : 'hora', forzar } }, escribir: async trabajo => enTransaccion(db, trabajo), quedaMs: () => 600_000 };
    const r = await paso(ctx);
    if (r.listo) return leerRevisiones(db)[0];
    assert.equal(r.punto.paso, 'esperar');
    assert.equal(r.esperarMs, 5000);
    JSON.stringify(r.punto).length < 16_000 || assert.fail('el punto pasa del tope de la fila');
    punto = r.punto;
    if (importar) await importarEntrante(db, config);
  }
  assert.fail('la revisión no terminó');
}

function carpetaBasica(drive, paquete = paqueteMuestra()) {
  drive.poner(RAIZ, { id: 'archivoPaqueteUno001', nombre: 'paquete-materia1.json' }, drive.json(paquete));
  drive.poner(RAIZ, { id: SUB_FIG, nombre: 'figuras', carpeta: true });
  drive.poner(SUB_FIG, { id: 'archivoFiguraUno0001', nombre: 'figura-m1.png' }, drive.png(figuraMuestraPng()));
  drive.poner(RAIZ, { id: 'archivoNotasTexto001', nombre: 'notas.txt' }, { cuerpo: Buffer.from('hola'), tipo: 'text/plain' });
}

test('drive: el enlace de la carpeta, la lista (HTML imitado) leída con cuidado, y los topes de verdad', () => {
  const id = 'AbCdEfGhIjKlMnOp_-12';
  for (const enlace of [id, `https://drive.google.com/drive/folders/${id}`, `https://drive.google.com/drive/folders/${id}?usp=sharing`,
    `https://drive.google.com/drive/u/0/folders/${id}`, `https://drive.google.com/open?id=${id}`, ` https://drive.google.com/embeddedfolderview?id=${id} `]) {
    assert.equal(idDeCarpeta(enlace), id, enlace);
  }
  for (const malo of ['', 'corto', `http://drive.google.com/drive/folders/${id}`, `https://evil.example.com/drive/folders/${id}`, `https://drive.google.com.evil.example/drive/folders/${id}`,
    `https://user:clave@drive.google.com/drive/folders/${id}`, `https://drive.google.com/file/d/${id}/view`, 'javascript:alert(1)', 'x'.repeat(700)]) {
    assert.equal(idDeCarpeta(malo), null, malo);
  }
  const html = htmlDeCarpeta([
    { id: 'archivoUnoDePrueba01', nombre: 'paquete-a&b <1>.json', modificado: '5 nov' },
    { id: 'carpetaDosDePrueba01', nombre: 'figuras', carpeta: true },
    { id: 'archivoUnoDePrueba01', nombre: 'repetido.json' },
  ]) + '<a href="/file/d/corto/view">x</a><a href="https://drive.google.com/file/d/archivoSinNombre01/view"></a>';
  assert.deepEqual(leerListado(html), [
    { id: 'archivoUnoDePrueba01', nombre: 'paquete-a&b <1>.json', carpeta: false, modificado: '5 nov' },
    { id: 'carpetaDosDePrueba01', nombre: 'figuras', carpeta: true, modificado: '3:10 PM' },
  ]);
  // Basura, nada o demasiado: nunca lanza y nunca pasa de su tope.
  assert.deepEqual(leerListado(null), []);
  assert.deepEqual(leerListado('<a href="https://drive.google.com/file/d/archivoUnoDePrueba01/view'), []);
  const muchas = htmlDeCarpeta(Array.from({ length: 700 }, (_, i) => ({ id: `archivoNumero${String(i).padStart(6, '0')}`, nombre: `f${i}.png` })));
  assert.equal(leerListado(muchas).length, TOPES_DRIVE.entradasPorCarpeta);
  // Los topes de verdad (las pruebas usan otros más chicos: el disco del servidor es chico).
  assert.equal(TOPES_DRIVE.json, 12 * 1024 * 1024);
  assert.equal(TOPES_DRIVE.imagen, 8 * 1024 * 1024);
  assert.equal(TOPES_DRIVE.audio, 40 * 1024 * 1024);
  assert.equal(LIMITES.audioBytes, 40 * 1024 * 1024);
  assert.equal(TOPES_DRIVE.profundidad, 2);
  assert.ok(TOPES_DRIVE.porRevision <= 400 * 1024 * 1024);
  assert.equal(HOST_LISTA, 'drive.google.com');
  assert.equal(HOST_BAJAR, 'drive.usercontent.google.com');
  // La tarea: cada hora, con su manejador, en el cupo normal y con 10 minutos por paso como mucho.
  assert.ok(PROGRAMAS_DEL_SISTEMA.some(p => p.programa === 'academia.drive' && p.cada === 'hora'));
  const d = definicion('academia.drive');
  assert.equal(d.cupo, 'normal');
  assert.ok(d.tiempoPorPasoMs <= 600_000);
  assert.equal(typeof MANEJADORES['academia.drive'].paso, 'function');
});

test('drive: sin la dirección falsa, las de Google se rechazan en las pruebas antes de tocar la red', async () => {
  const r = await listarCarpeta(RAIZ, { bases: { lista: 'https://drive.google.com', bajar: 'https://drive.usercontent.google.com' } });
  assert.deepEqual(r, { ok: false, motivo: 'destino_no_permitido' });
});

test('drive: un paquete nuevo entra como versión nueva con su figura (de una subcarpeta), se pone en uso solo, y otra vez «sin cambios»', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive);
    const { config, db } = prepararBase(drive);
    const r1 = await revisar(db, config);
    assert.equal(r1.ok, true);
    assert.equal(r1.carpetas, 2);
    assert.equal(r1.paquetes, 1);
    assert.equal(r1.nuevos.length, 1);
    assert.deepEqual(r1.activados, [{ version: r1.nuevos[0].version, materias: ['factores_humanos'] }]);
    assert.equal(r1.completados, 1);
    assert.deepEqual(r1.errores, []);
    assert.equal(drive.bajadas('archivoNotasTexto001'), 0, 'lo que no es de un paquete no se baja');
    const fila = db.prepare('SELECT * FROM academia_paquetes').get();
    assert.equal(fila.estado, 'listo');
    assert.equal(fila.subido_por, null);
    const carpeta = join(dirname(config.archivoBase), 'academia', 'paquetes', fila.carpeta);
    assert.equal(readFileSync(join(carpeta, 'paquete.json'), 'utf8'), JSON.stringify(paqueteMuestra()), 'el JSON tal cual');
    assert.ok(readFileSync(join(carpeta, 'figuras', 'figura-m1.png')).equals(figuraMuestraPng()));
    assert.equal(paqueteActivo(db, config).materias.find(m => m.id === 'factores_humanos').temas.length, 2);
    assert.ok(db.prepare("SELECT 1 FROM auditoria WHERE accion = 'academia_paquete_drive'").get());
    // Otra revisión: la lista dice la misma fecha → ni se baja el JSON; nada nuevo.
    const r2 = await revisar(db, config);
    assert.equal(r2.nuevos.length, 0);
    assert.equal(r2.activados.length, 0);
    assert.equal(r2.sinCambios, 1);
    assert.equal(drive.bajadas('archivoPaqueteUno001'), 1);
    // «Buscar ahora» lo baja otra vez, pero por su huella sabe que es el mismo: no hay versión nueva.
    const r3 = await revisar(db, config, { forzar: true });
    assert.equal(r3.nuevos.length, 0);
    assert.equal(r3.sinCambios, 1);
    assert.equal(drive.bajadas('archivoPaqueteUno001'), 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_paquetes').get().n, 1);
    // El mismo archivo de Drive con OTRO contenido (otra fecha en la lista): versión nueva; la de antes queda guardada.
    const nueva = paqueteMuestra();
    nueva.edicion = 'muestra-2';
    drive.archivos.set('archivoPaqueteUno001', drive.json(nueva));
    drive.carpetas.get(RAIZ)[0].modificado = '4:00 PM';
    const r4 = await revisar(db, config);
    assert.equal(r4.nuevos.length, 1);
    assert.equal(r4.activados.length, 1);
    assert.equal(readdirSync(join(dirname(config.archivoBase), 'academia', 'paquetes')).length, 2);
    assert.equal(paqueteActivo(db, config).id, r4.nuevos[0].version);
    assert.ok(readFileSync(join(carpeta, 'paquete.json')).equals(Buffer.from(JSON.stringify(paqueteMuestra()))), 'la versión vieja nunca se pisa');
    db.close();
  });
});

test('drive: varios paquetes se SUMAN (materia 1 y después materia 2), cada figura sale de su versión y «Poner en uso» una vieja vale solo para su materia', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive);
    const { config, db } = prepararBase(drive);
    const r1 = await revisar(db, config);
    const v1 = r1.nuevos[0].version;
    // Después llega la materia 2, en su subcarpeta, con OTRA imagen que también se llama figura-m1.png.
    const otraFigura = figuraMuestraPng(100, 60);
    drive.poner(RAIZ, { id: SUB_M2, nombre: 'materia 2', carpeta: true });
    drive.poner(SUB_M2, { id: 'archivoPaqueteDos001', nombre: 'paquete-materia2.json' }, drive.json(paqueteSistemas()));
    drive.poner(SUB_M2, { id: 'archivoFiguraDos0001', nombre: 'figura-m1.png' }, drive.png(otraFigura));
    const r2 = await revisar(db, config);
    assert.equal(r2.nuevos.length, 1, JSON.stringify(r2));
    assert.deepEqual(r2.errores, []);
    const v2 = r2.nuevos[0].version;
    assert.deepEqual(r2.activados, [{ version: v2, materias: ['sistemas'] }]);
    const p = paqueteActivo(db, config);
    assert.deepEqual(p.ids.sort(), [v1, v2].sort());
    assert.deepEqual(p.materias.filter(m => m.temas.length).map(m => [m.id, m.paquete]), [['factores_humanos', v1], ['sistemas', v2]]);
    assert.deepEqual(leerEnUso(db).map(e => e.id), [v1, v2]);
    // Por la pantalla: el alumno ve las dos materias, y cada figura es la de su versión.
    const servidor = crearServidor({ db, config });
    await conServidor(servidor, async base => {
      const pedir = async (metodo, ruta, { galleta, datos, cabeceras = {} } = {}) => {
        const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras }, body: datos ? JSON.stringify(datos) : undefined });
        const tipo = r.headers.get('content-type') || '';
        return { codigo: r.status, datos: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), galleta: r.headers.get('set-cookie')?.split(';')[0] };
      };
      const admin = await pedir('POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
      crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      const ana = (await pedir('POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
      const camino = await pedir('GET', '/api/academia/camino', { galleta: ana });
      assert.deepEqual(camino.datos.materias.filter(m => m.estado !== 'vacia').map(m => m.id), ['factores_humanos', 'sistemas']);
      const lista = await pedir('GET', '/api/admin/academia', { galleta: admin.galleta });
      assert.deepEqual(lista.datos.paquetes.map(x => [x.id, x.activo, x.enUso]), [[v2, true, ['sistemas']], [v1, true, ['factores_humanos']]]);
      // Las figuras por su «ref»: cada una la de su versión. Sin «ref» (como antes), la de la primera materia.
      const fig1 = await pedir('GET', `/api/academia/figuras/${encodeURIComponent(`${v1}~M1`)}`, { galleta: ana });
      const fig2 = await pedir('GET', `/api/academia/figuras/${encodeURIComponent(`${v2}~M1`)}`, { galleta: ana });
      assert.ok(fig1.datos.equals(figuraMuestraPng()));
      assert.ok(fig2.datos.equals(otraFigura));
      assert.equal((await pedir('GET', `/api/academia/figuras/${encodeURIComponent('999~M1')}`, { galleta: ana })).codigo, 404);
      // La pregunta con figura de la materia 2 dice de qué versión es.
      const i = await pedir('POST', '/api/academia/intentos', { galleta: admin.galleta, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } });
      assert.equal(i.codigo, 201, JSON.stringify(i.datos));
      const conFigura = i.datos.preguntas.find(q => q.figura);
      assert.deepEqual(conFigura.figura, { numero: 'M1', titulo: 'Figura M1 (muestra): cielo, horizonte y pista', ref: `${v1}~M1` });
      // «Poner en uso» la versión 1 otra vez: sigue dando SU materia; la 2 sigue con la suya.
      assert.equal((await pedir('POST', `/api/admin/academia/paquetes/${v1}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
      assert.deepEqual(paqueteActivo(db, config).materias.filter(m => m.temas.length).map(m => [m.id, m.paquete]), [['factores_humanos', v1], ['sistemas', v2]]);
      // Una versión nueva de la materia 1 en la carpeta principal: su figura-m1.png está en DOS subcarpetas (al mismo nivel)
      // y el paquete no dice su huella: no se adivina; queda incompleta, se informa y no se pone en uso.
      const nueva = paqueteMuestra();
      nueva.edicion = 'muestra-3';
      drive.poner(RAIZ, { id: 'archivoPaqueteTres01', nombre: 'paquete-materia1-v2.json' }, drive.json(nueva));
      const rDuda = await revisar(db, config);
      assert.deepEqual(rDuda.errores, [{ archivo: 'figura-m1.png', motivo: 'nombre_repetido' }]);
      assert.deepEqual(rDuda.activados, []);
      // Con la huella de la figura en el paquete, sí se sabe cuál es: entra y tapa a la vieja (que sale de la lista),
      // sin tocar la materia 2.
      const conHuella = paqueteMuestra();
      conHuella.edicion = 'muestra-4';
      conHuella.figuras[0].sha256 = createHash('sha256').update(figuraMuestraPng()).digest('hex');
      drive.poner(RAIZ, { id: 'archivoPaqueteCuatro', nombre: 'paquete-materia1-v3.json' }, drive.json(conHuella));
      const r3 = await revisar(db, config);
      assert.deepEqual(r3.errores, [{ archivo: 'figura-m1.png', motivo: 'nombre_repetido' }], 'la de antes sigue sin saber cuál');
      const v3 = r3.nuevos[0].version;
      assert.deepEqual(r3.activados, [{ version: v3, materias: ['factores_humanos'] }]);
      assert.deepEqual(paqueteActivo(db, config).materias.filter(m => m.temas.length).map(m => [m.id, m.paquete]), [['factores_humanos', v3], ['sistemas', v2]]);
      assert.deepEqual(leerEnUso(db).map(e => e.id), [v2, v3]);
      // Lo de Drive es solo del administrador.
      assert.equal((await pedir('POST', '/api/admin/academia/drive/buscar', { galleta: ana, datos: {} })).codigo, 403);
      assert.equal((await pedir('POST', '/api/admin/academia/drive', { galleta: ana, datos: { enlace: RAIZ } })).codigo, 403);
      assert.equal((await pedir('POST', '/api/admin/academia/drive/probar', { galleta: ana, datos: { enlace: RAIZ } })).codigo, 403);
    });
    db.close();
  });
});

test('drive: un paquete mal armado no entra, se informa UNA vez con sus errores, y lo bueno sigue', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive);
    const malo = paqueteSistemas();
    malo.version = 2;
    malo.preguntas[0].original.correcta = 'Z';
    drive.poner(RAIZ, { id: 'archivoPaqueteMalo01', nombre: 'paquete-malo.json' }, drive.json(malo));
    drive.poner(RAIZ, { id: 'archivoNoEsJson00001', nombre: 'paquete-roto.json' }, { cuerpo: Buffer.from('{ esto no es json'), tipo: 'application/json' });
    const { config, db } = prepararBase(drive);
    const r1 = await revisar(db, config);
    assert.equal(r1.nuevos.length, 1);
    assert.deepEqual(r1.rechazados.map(x => x.archivo).sort(), ['paquete-malo.json', 'paquete-roto.json']);
    const errores = r1.rechazados.find(x => x.archivo === 'paquete-malo.json').errores;
    assert.ok(errores.some(e => e.ruta === 'version' && e.motivo === 'version_desconocida'));
    assert.ok(errores.some(e => e.ruta === 'preguntas[0].original.correcta' && e.motivo === 'correcta_no_es_opcion'));
    assert.deepEqual(r1.rechazados.find(x => x.archivo === 'paquete-roto.json').errores, [{ ruta: '', motivo: 'json_no_valido' }]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_paquetes').get().n, 1, 'el malo no creó ninguna versión');
    // La revisión siguiente (aunque se baje otra vez con «Buscar ahora») no lo vuelve a revisar, pero lo sigue
    // informando mientras esté en la carpeta (la pantalla no dice «Sin cambios» con un paquete malo ahí).
    const r2 = await revisar(db, config, { forzar: true });
    assert.deepEqual(r2.rechazados.map(x => [x.archivo, x.antes, x.errores.length > 0]).sort(), [['paquete-malo.json', true, true], ['paquete-roto.json', true, true]]);
    assert.equal(r2.sinCambios, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_paquetes').get().n, 1);
    // Cuando sale de la carpeta, deja de informarse.
    drive.carpetas.set(RAIZ, drive.carpetas.get(RAIZ).filter(e => !['archivoPaqueteMalo01', 'archivoNoEsJson00001'].includes(e.id)));
    assert.deepEqual((await revisar(db, config)).rechazados, []);
    db.close();
  });
});

test('drive: topes de tamaño (JSON, imagen, mp3) y nada a medias se pone en uso', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive, paqueteConAudio());
    drive.poner(RAIZ, { id: 'archivoAudioUno00001', nombre: 'resumen-factores.mp3' }, { cuerpo: mp3(20_000), tipo: 'audio/mpeg' });
    const { config, db } = prepararBase(drive);
    // Un JSON más grande que su tope no se lee.
    const r1 = await revisar(db, config, { topes: { json: 1000 } });
    assert.deepEqual(r1.errores, [{ archivo: 'paquete-materia1.json', motivo: 'demasiado_grande' }]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_paquetes').get().n, 0);
    // Una figura más grande que su tope: la versión queda incompleta y NO se pone en uso; un mp3 grande: sin audio.
    const r2 = await revisar(db, config, { topes: { imagen: 1000, audio: 1000 } });
    assert.equal(r2.nuevos.length, 1);
    assert.deepEqual(r2.errores.map(e => [e.archivo, e.motivo]).sort(), [['figura-m1.png', 'demasiado_grande'], ['resumen-factores.mp3', 'demasiado_grande']]);
    assert.deepEqual(r2.activados, []);
    assert.equal(db.prepare('SELECT estado FROM academia_paquetes').get().estado, 'incompleto');
    assert.equal(paqueteActivo(db, config), null);
    // Con los topes de verdad, la próxima revisión la completa (sin bajar el JSON otra vez) y la pone en uso.
    const r3 = await revisar(db, config);
    assert.equal(r3.completados, 2);
    assert.equal(r3.activados.length, 1);
    assert.equal(drive.bajadas('archivoPaqueteUno001'), 2, 'el JSON solo se bajó en las dos primeras');
    db.close();
  });
});

test('drive: redirecciones solo dentro de Drive; a otro servidor nunca; una página HTML no es el archivo', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive);
    // La figura «de verdad» redirige a la otra dirección de Drive (se sigue); otras, a otro servidor (no se siguen).
    drive.archivos.set('archivoFiguraUno0001', { redirige: e => `${e.bases.lista}/download?id=noSeUsaPorqueEsLista&confirm=t` });
    const { config, db } = prepararBase(drive);
    let r = await revisar(db, config);
    assert.deepEqual(r.errores, [{ archivo: 'figura-m1.png', motivo: 'no_existe' }], 'siguió la redirección a la otra dirección de Drive (que no la tiene)');
    drive.archivos.set('archivoFiguraUno0001', { redirige: e => `${e.ajeno}/robar` });
    r = await revisar(db, config);
    assert.deepEqual(r.errores, [{ archivo: 'figura-m1.png', motivo: 'redireccion_no_permitida' }]);
    drive.archivos.set('archivoFiguraUno0001', { redirige: () => 'https://evil.example.com/x.png' });
    r = await revisar(db, config);
    assert.deepEqual(r.errores, [{ archivo: 'figura-m1.png', motivo: 'redireccion_no_permitida' }]);
    assert.equal(drive.ajenos, 0, 'nadie llegó al servidor ajeno');
    // Google a veces responde una página (aviso, cuota) en vez del archivo: no se toma por la figura.
    drive.archivos.set('archivoFiguraUno0001', { cuerpo: Buffer.from('<html>Google Drive - Quota exceeded</html>'), tipo: 'text/html; charset=utf-8' });
    r = await revisar(db, config);
    assert.deepEqual(r.errores, [{ archivo: 'figura-m1.png', motivo: 'no_disponible' }]);
    // Una «figura» que no es una imagen: no entra.
    drive.archivos.set('archivoFiguraUno0001', { cuerpo: Buffer.from('no soy una imagen'), tipo: 'image/png' });
    r = await revisar(db, config);
    assert.deepEqual(r.errores, [{ archivo: 'figura-m1.png', motivo: 'imagen_no_valida' }]);
    assert.equal(paqueteActivo(db, config), null);
    // La de verdad, otra vez por una redirección DENTRO de Drive: entra, y se pone en uso.
    drive.archivos.set('figuraDeVerdad00001', drive.png(figuraMuestraPng()));
    drive.archivos.set('archivoFiguraUno0001', { redirige: e => `/download?id=figuraDeVerdad00001&export=download&confirm=t` });
    r = await revisar(db, config);
    assert.deepEqual(r.errores, []);
    assert.equal(r.activados.length, 1);
    db.close();
  });
});

test('drive: si la carpeta no se puede leer, se anota y sale el aviso; lo que está en uso sigue; al volver, el aviso se cierra', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive);
    const { config, db } = prepararBase(drive);
    await revisar(db, config);
    const enUso = paqueteActivo(db, config).id;
    const guardada = drive.carpetas.get(RAIZ);
    drive.carpetas.delete(RAIZ);
    const r = await revisar(db, config);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'no_existe');
    const aviso = db.prepare("SELECT * FROM avisos WHERE clave = 'drive_sin_acceso' AND resuelto_en IS NULL").get();
    assert.ok(aviso, 'aviso abierto');
    assert.equal(paqueteActivo(db, config).id, enUso, 'nada se quitó');
    // Una carpeta privada manda a entrar con una cuenta (otro servidor): «sin permiso», sin seguir la redirección.
    drive.carpetas.set(RAIZ, guardada);
    drive.html.set(RAIZ, '<html><body><a href="https://accounts.google.com/ServiceLogin">Sign in</a></body></html>');
    const r2 = await revisar(db, config);
    assert.equal(r2.motivo, 'sin_permiso');
    drive.html.delete(RAIZ);
    const r3 = await revisar(db, config);
    assert.equal(r3.ok, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'drive_sin_acceso' AND resuelto_en IS NULL").get().n, 0, 'aviso cerrado');
    db.close();
  });
});

test('drive: las pantallas del administrador (Probar, Guardar, Buscar ahora, el estado) y el audio por partes para el iPhone', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive, paqueteConAudio());
    const audio = mp3(5000);
    drive.poner(RAIZ, { id: 'archivoAudioUno00001', nombre: 'resumen-factores.mp3' }, { cuerpo: audio, tipo: 'audio/mpeg' });
    const config = { ...configDePrueba(), driveBases: drive.bases };
    const db = abrirBase(config);
    const servidor = crearServidor({ db, config });
    await conServidor(servidor, async base => {
      const pedir = async (metodo, ruta, { galleta, datos, cabeceras = {} } = {}) => {
        const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras }, body: datos ? JSON.stringify(datos) : undefined });
        const tipo = r.headers.get('content-type') || '';
        return { codigo: r.status, cabeceras: r.headers, datos: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), galleta: r.headers.get('set-cookie')?.split(';')[0] };
      };
      const admin = (await pedir('POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE })).galleta;
      crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      const ana = (await pedir('POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
      // Sin carpeta: el estado lo dice, y «Buscar ahora» pide guardarla primero.
      let a = await pedir('GET', '/api/admin/academia', { galleta: admin });
      assert.deepEqual(a.datos.drive, { carpeta: null, ultima: null, revisiones: [], enMarcha: false });
      assert.equal((await pedir('POST', '/api/admin/academia/drive/buscar', { galleta: admin, datos: {} })).datos.error, 'sin_carpeta');
      // Probar: un enlace que no es de Drive, una carpeta que no existe, y la buena (con lo que encontró).
      assert.equal((await pedir('POST', '/api/admin/academia/drive/probar', { galleta: admin, datos: { enlace: 'https://evil.example.com/x' } })).datos.error, 'enlace_no_valido');
      assert.deepEqual((await pedir('POST', '/api/admin/academia/drive/probar', { galleta: admin, datos: { enlace: 'carpetaQueNoExiste01' } })).datos, { ok: false, motivo: 'no_existe' });
      const enlace = `https://drive.google.com/drive/folders/${RAIZ}?usp=sharing`;
      const p = await pedir('POST', '/api/admin/academia/drive/probar', { galleta: admin, datos: { enlace } });
      assert.deepEqual(p.datos, { ok: true, carpetas: 2, archivos: 4, paquetes: ['paquete-materia1.json'] });
      assert.equal(db.prepare("SELECT valor FROM ajustes WHERE clave = 'academia.drive.carpeta'").get(), undefined, 'probar no guarda');
      // Guardar: queda el id en la base y se pide la primera revisión (una tarea del trabajador).
      const g = await pedir('POST', '/api/admin/academia/drive', { galleta: admin, datos: { enlace } });
      assert.equal(g.codigo, 200);
      assert.deepEqual(g.datos.drive.carpeta, { id: RAIZ, enlace: `https://drive.google.com/drive/folders/${RAIZ}` });
      assert.equal(g.datos.drive.enMarcha, true);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'academia.drive' AND estado = 'lista'").get().n, 1);
      // «Buscar ahora» con una ya pedida: no se encima otra.
      const b = await pedir('POST', '/api/admin/academia/drive/buscar', { galleta: admin, datos: {} });
      assert.equal(b.codigo, 202);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'academia.drive' AND estado IN ('lista', 'en_curso')").get().n, 1);
      // La revisión (la haría el trabajador).
      await revisar(db, config, { forzar: true });
      a = await pedir('GET', '/api/admin/academia', { galleta: admin });
      assert.equal(a.datos.drive.ultima.activados.length, 1);
      assert.equal(a.datos.drive.revisiones.length, 1);
      assert.deepEqual(a.datos.paquetes[0].faltanAudio, []);
      // El alumno ve el audio de la materia en el camino; nunca ve nada de Drive.
      const c = await pedir('GET', '/api/academia/camino', { galleta: ana });
      const m = c.datos.materias.find(x => x.id === 'factores_humanos');
      const ref = m.audio.ref;
      assert.deepEqual(m.audio, { ref: `${a.datos.paquetes[0].id}~resumen-factores.mp3`, titulo: 'Resumen de la materia (muestra)' });
      assert.doesNotMatch(JSON.stringify(c.datos), /drive|Drive/);
      const ruta = `/api/academia/audio/${encodeURIComponent(ref)}`;
      assert.equal((await pedir('GET', ruta)).codigo, 401, 'solo con la sesión');
      // Como el iPhone: primero «bytes=0-1», después por partes; el final; los últimos N; y uno imposible (416).
      let x = await pedir('GET', ruta, { galleta: ana, cabeceras: { Range: 'bytes=0-1' } });
      assert.equal(x.codigo, 206);
      assert.equal(x.cabeceras.get('content-range'), `bytes 0-1/${audio.length}`);
      assert.equal(x.cabeceras.get('accept-ranges'), 'bytes');
      assert.equal(x.cabeceras.get('content-type'), 'audio/mpeg');
      assert.ok(x.datos.equals(audio.subarray(0, 2)));
      x = await pedir('GET', ruta, { galleta: ana, cabeceras: { Range: 'bytes=100-' } });
      assert.equal(x.codigo, 206);
      assert.ok(x.datos.equals(audio.subarray(100)));
      x = await pedir('GET', ruta, { galleta: ana, cabeceras: { Range: 'bytes=-10' } });
      assert.ok(x.datos.equals(audio.subarray(audio.length - 10)));
      x = await pedir('GET', ruta, { galleta: ana, cabeceras: { Range: `bytes=${audio.length}-` } });
      assert.equal(x.codigo, 416);
      assert.equal(x.cabeceras.get('content-range'), `bytes */${audio.length}`);
      x = await pedir('GET', ruta, { galleta: ana });
      assert.equal(x.codigo, 200);
      assert.ok(x.datos.equals(audio));
      // Un audio que el contenido en uso no nombra, o con un nombre raro: no existe.
      for (const otra of [`${a.datos.paquetes[0].id}~otro.mp3`, `${a.datos.paquetes[0].id}~..%2Fpaquete.json`, '1~resumen-factores.mp3x']) {
        assert.equal((await pedir('GET', `/api/academia/audio/${encodeURIComponent(otra)}`, { galleta: ana })).codigo, 404, otra);
      }
      // A mano también se puede subir la narración (junto con el JSON en Contenido → Subir): un paquete con otro audio.
      const conOtro = paqueteConAudio();
      conOtro.edicion = 'muestra-audio-2';
      conOtro.materias[0].temas[0].audio = { archivo: 'tema-hipoxia.mp3' };
      const sj = await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify(conOtro) }).then(r => r.json());
      assert.deepEqual(sj.faltanAudio.sort(), ['resumen-factores.mp3', 'tema-hipoxia.mp3']);
      const subirAudio = (archivo, cuerpo, tipo = 'audio/mpeg') => fetch(`${base}/api/admin/academia/paquetes/${sj.paquete.id}/audio/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': tipo }, body: cuerpo }).then(async r => ({ codigo: r.status, datos: await r.json() }));
      assert.equal((await subirAudio('tema-hipoxia.mp3', Buffer.from('no soy un mp3'))).datos.error, 'audio_no_valido');
      assert.equal((await subirAudio('otro.mp3', mp3(10))).datos.error, 'audio_no_esta_en_el_paquete');
      assert.equal((await subirAudio('tema-hipoxia.mp3', mp3(10), 'image/png')).codigo, 415);
      const s1 = await subirAudio('tema-hipoxia.mp3', mp3(300));
      assert.equal(s1.codigo, 201);
      assert.deepEqual(s1.datos.faltanAudio, ['resumen-factores.mp3']);
      assert.equal(s1.datos.paquete.estado, 'incompleto', 'el audio no hace falta para estar lista; la figura sí');
      assert.equal((await subirAudio('tema-hipoxia.mp3', mp3(999))).codigo, 200, 'otra vez: no se pisa');
      assert.equal((await pedir('POST', `/api/admin/academia/paquetes/${sj.paquete.id}/audio/tema-hipoxia.mp3`, { galleta: ana, cabeceras: { 'Content-Type': 'audio/mpeg' } })).codigo, 403);
      // Quitar la carpeta: se deja de usar Drive, pero lo que está en uso sigue.
      const q = await pedir('POST', '/api/admin/academia/drive', { galleta: admin, datos: { enlace: '' } });
      assert.equal(q.datos.drive.carpeta, null);
      assert.ok(paqueteActivo(db, config));
    });
    db.close();
  });
});

test('drive: el rango pedido (Range) se lee bien', () => {
  assert.equal(rangoPedido(undefined, 100), null);
  assert.deepEqual(rangoPedido('bytes=0-1', 100), { inicio: 0, fin: 1 });
  assert.deepEqual(rangoPedido('bytes=90-', 100), { inicio: 90, fin: 99 });
  assert.deepEqual(rangoPedido('bytes=50-500', 100), { inicio: 50, fin: 99 });
  assert.deepEqual(rangoPedido('bytes=-30', 100), { inicio: 70, fin: 99 });
  assert.deepEqual(rangoPedido('bytes=-300', 100), { inicio: 0, fin: 99 });
  for (const malo of ['bytes=100-', 'bytes=5-2', 'bytes=-', 'bytes=-0', 'bytes=0-1,4-5', 'items=0-1', 'bytes=abc']) assert.equal(rangoPedido(malo, 100), 'no', malo);
});

test('drive: el JSON lo revisa el servidor web (nunca el trabajador): una sola vez, aunque se caiga; si nunca contesta, se anota', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive);
    const { config, db } = prepararBase(drive);
    const paso = crearSincronizador();
    const ctx = punto => ({ db, config, senal: new AbortController().signal, tarea: { id: 1, punto, datos: {} }, escribir: async t => enTransaccion(db, t), quedaMs: () => 600_000 });
    // El trabajador deja el paquete y espera; mientras nadie lo revisa, sigue esperando (pasos cortos).
    const r1 = await paso(ctx(null));
    assert.equal(r1.punto.paso, 'esperar');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_paquetes').get().n, 0, 'el trabajador no lo guardó');
    const r2 = await paso(ctx(r1.punto));
    assert.equal(r2.punto.esperas, 1);
    // El servidor web se cayó revisándolo («en_curso»): la vez siguiente queda «fallo» y no se intenta otra vez.
    const entrante = JSON.parse(db.prepare("SELECT valor FROM ajustes WHERE clave = 'academia.drive.entrante'").get().valor);
    enTransaccion(db, () => db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('academia.drive.importado', ?, '2026-01-01')").run(JSON.stringify({ huella: entrante.huella, resultado: 'en_curso' })));
    assert.deepEqual(await importarEntrante(db, config), { huella: entrante.huella, resultado: 'fallo', motivo: 'se_corto' });
    assert.equal(await importarEntrante(db, config), null, 'no lo vuelve a intentar');
    const r3 = await paso(ctx(r2.punto));
    assert.equal(r3.listo, true);
    assert.deepEqual(leerRevisiones(db)[0].errores, [{ archivo: 'paquete-materia1.json', motivo: 'se_corto' }]);
    // Si el servidor web nunca contesta, después de ESPERAS_MAXIMAS se anota «sin_importar» y la tarea termina.
    const nueva = paqueteMuestra();
    nueva.edicion = 'otra';
    drive.archivos.set('archivoPaqueteUno001', drive.json(nueva));
    drive.carpetas.get(RAIZ)[0].modificado = '9:00 PM';
    const r4 = await paso(ctx(null));
    const r5 = await paso(ctx({ ...r4.punto, esperas: ESPERAS_MAXIMAS }));
    assert.equal(r5.listo, true);
    assert.deepEqual(leerRevisiones(db)[0].errores, [{ archivo: 'paquete-materia1.json', motivo: 'sin_importar' }]);
    db.close();
  });
});

test('drive: el trabajador solo lee el manifiesto de una versión; el servidor web lo arma para las de antes de la 0.7.1', async () => {
  await conDrive(async drive => {
    carpetaBasica(drive);
    const { config, db } = prepararBase(drive);
    await revisar(db, config);
    const fila = db.prepare('SELECT * FROM academia_paquetes').get();
    const carpeta = join(dirname(config.archivoBase), 'academia', 'paquetes', fila.carpeta);
    assert.deepEqual(JSON.parse(readFileSync(join(carpeta, 'manifiesto.json'), 'utf8')), { figuras: [{ archivo: 'figura-m1.png', sha256: null }], audios: [], materias: ['factores_humanos'] });
    // Una versión subida a mano con la 0.7.0 (sin manifiesto): el que importa se lo arma en su pasada.
    const vieja = paqueteMuestra();
    vieja.edicion = 'de-la-0.7.0';
    const { subirJson } = await import('../src/academia/paquetes.js');
    const r = await subirJson(db, config, { cuerpo: Buffer.from(JSON.stringify(vieja)), usuarioId: null });
    const filaVieja = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(r.datos.paquete.id);
    const rutaManifiesto = join(dirname(config.archivoBase), 'academia', 'paquetes', filaVieja.carpeta, 'manifiesto.json');
    assert.ok(readFileSync(rutaManifiesto, 'utf8').includes('figura-m1.png'), 'una versión nueva siempre trae el suyo');
    // Las pasadas del que importa: empiezan y paran como el que manda avisos (sin dejar vivo al proceso).
    const imp = crearImportador({ db, config, cadaMs: 50 });
    imp.iniciar();
    await imp.pasada();
    await imp.parar();
    db.close();
  });
});
