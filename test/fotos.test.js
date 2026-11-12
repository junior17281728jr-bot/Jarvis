// Pruebas de la 0.12.5: la foto del libro de una tarjeta («imagen»: { archivo, alt, pie?, pagina?, libro?, sha256? }) en
// la carpeta «fotos/» de la versión. El formato, subirla (solo el administrador, solo las que el paquete nombra, ≤ 1 MB),
// que la lección la traiga solo cuando llegó (sin ella la tarjeta se ve igual), servirla solo con la sesión y solo las
// declaradas, Drive (la clase «foto»), el almacén, y la pantalla. Todo con datos inventados aquí mismo.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase, enTransaccion } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete, fotosDe, LIMITES } from '../src/academia/formato.js';
import { RECURSOS, manifiesto, carpetaAcademia } from '../src/academia/paquetes.js';
import { CARPETAS_DE_ARCHIVOS } from '../src/academia/almacen.js';
import { crearSincronizador } from '../src/academia/sincronizar.js';
import { importarEntrante } from '../src/academia/importador.js';
import { guardarCarpetaDrive, leerRevisiones } from '../src/academia/drive-estado.js';
import { partirLeccion } from '../public/tarjetas.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const CLAVE = 'una clave bien larga';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
const LIBRO = 'Libro de muestra (inventado para las pruebas)';

// La muestra con dos tarjetas nuevas: una con foto (y pie y página) y otra con foto y clip.
function paqueteConFoto() {
  const p = paqueteMuestra();
  p.edicion = 'muestra-foto';
  const fuentes = [{ libro: 'muestra', capitulo: 'Capítulo de muestra', seccion: 'Muestra', pagina: '7' }];
  p.materias[0].temas[0].secciones.push(
    { tipo: 'tarjeta', titulo: 'El ala por dentro', puntos: ['Muestra: largueros y costillas.'], fuentes,
      imagen: { archivo: 'foto-ala.jpg', alt: 'Dibujo inventado de un ala abierta.', pie: 'Las partes del ala', pagina: '12' } },
    { tipo: 'tarjeta', titulo: 'El motor', puntos: ['Muestra: así se ve.'], fuentes,
      clip: { archivo: 'clip-motor.mp4', alt: 'Un motor (inventado).' },
      imagen: { archivo: 'foto-motor.png', alt: 'Un motor dibujado (inventado).' } });
  return p;
}
const ultima = (p, k = 1) => p.materias[0].temas[0].secciones.at(-k);
async function pedir(base, metodo, ruta, { galleta, datos, cabeceras = {}, cuerpo } = {}) {
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras }, body: datos ? JSON.stringify(datos) : cuerpo });
  const tipo = r.headers.get('content-type') || '';
  return { codigo: r.status, cabeceras: r.headers, datos: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), galleta: r.headers.get('set-cookie')?.split(';')[0] };
}

test('foto 0.12.5: el formato de «imagen» (bien y mal) y lo que nombra el paquete', () => {
  const r = revisarPaquete(paqueteConFoto());
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.fotos.map(f => f.archivo), ['foto-ala.jpg', 'foto-motor.png']);
  assert.deepEqual(fotosDe(paqueteConFoto()).map(f => f.archivo), ['foto-ala.jpg', 'foto-motor.png']);
  // Con «libro» (de «libros») y sha256 también está bien; el mismo archivo en dos tarjetas cuenta una vez.
  const otro = paqueteConFoto();
  ultima(otro, 2).imagen.libro = 'muestra';
  ultima(otro, 2).imagen.sha256 = 'a'.repeat(64);
  ultima(otro).imagen.archivo = 'foto-ala.jpg';
  const r2 = revisarPaquete(otro);
  assert.equal(r2.ok, true, JSON.stringify(r2.errores));
  assert.deepEqual(r2.fotos, [{ archivo: 'foto-ala.jpg', sha256: 'a'.repeat(64) }]);
  const casos = [
    [x => { x.archivo = 'foto.gif'; }, 'archivo', 'archivo_no_valido'],
    [x => { x.archivo = '../paquete.json'; }, 'archivo', 'archivo_no_valido'],
    [x => { delete x.alt; }, 'alt', 'falta'],
    [x => { x.alt = '   '; }, 'alt', 'vacio'],
    [x => { x.pie = 12; }, 'pie', 'no_es_texto'],
    [x => { x.pie = 'x'.repeat(LIMITES.corto + 1); }, 'pie', 'muy_largo'],
    [x => { x.pagina = 'x'.repeat(41); }, 'pagina', 'muy_largo'],
    [x => { x.libro = 'otro-libro'; }, 'libro', 'libro_desconocido'],
    [x => { x.sha256 = 'x'; }, 'sha256', 'no_valido'],
  ];
  for (const [cambiar, campo, motivo] of casos) {
    const p = paqueteConFoto();
    cambiar(ultima(p, 2).imagen);
    const x = revisarPaquete(p);
    assert.deepEqual(x.errores, [{ ruta: `materias[0].temas[0].secciones[${p.materias[0].temas[0].secciones.length - 2}].imagen.${campo}`, motivo }], campo);
  }
  const noObjeto = paqueteConFoto();
  ultima(noObjeto, 2).imagen = 'foto-ala.jpg';
  assert.deepEqual(revisarPaquete(noObjeto).errores.map(e => e.motivo), ['no_es_objeto']);
  // En la reexplicación también se revisa.
  const reex = paqueteMuestra();
  reex.materias[0].temas[0].reexplicacion = [{ tipo: 'tarjeta', titulo: 'Otra vez', puntos: ['a'], imagen: { archivo: 'x.webp' }, fuentes: [{ libro: 'muestra', pagina: '1' }] }];
  assert.deepEqual(revisarPaquete(reex).errores, [{ ruta: 'materias[0].temas[0].reexplicacion[0].imagen.alt', motivo: 'falta' }]);
});

test('foto 0.12.5: la clase «foto» (carpeta fotos/, ≤ 1 MB) está en el almacén, en el manifiesto y en lo que baja Drive', () => {
  assert.equal(RECURSOS.foto.carpeta, 'fotos');
  assert.equal(RECURSOS.foto.tope, 1024 * 1024);
  assert.ok(CARPETAS_DE_ARCHIVOS.includes('fotos'));
  const sinc = readFileSync(join(RAIZ, 'src', 'academia', 'sincronizar.js'), 'utf8');
  assert.match(sinc, /foto: fotosQueFaltan/);
  assert.match(sinc, /for \(const clase of \[[^\]]*'foto'[^\]]*\]\)/);
});

test('foto 0.12.5: subirla, la tarjeta se ve sin ella mientras falta, y se sirve solo con la sesión y solo si está declarada', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    const p = paqueteConFoto();
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(p) });
    assert.equal(s.codigo, 201, JSON.stringify(s.datos));
    assert.deepEqual(s.datos.faltanFotos, ['foto-ala.jpg', 'foto-motor.png']);
    const id = s.datos.paquete.id;
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/${p.figuras[0].archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    // Las fotos son opcionales: la versión ya se puede poner en uso.
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    const tema = p.materias[0].temas[0].id;
    const tarjetas = async () => (await pedir(base, 'GET', `/api/academia/temas/factores_humanos/${tema}`, { galleta: ana })).datos.secciones;
    // Sin el archivo: la tarjeta se ve entera, sin foto.
    let [conFoto, conClip] = (await tarjetas()).slice(-2);
    assert.equal(conFoto.imagen, null);
    assert.equal(conFoto.titulo, 'El ala por dentro');
    assert.deepEqual(conFoto.puntos, ['Muestra: largueros y costillas.']);
    assert.equal(conClip.imagen, null);
    const subir = (archivo, cuerpo, tipo = 'image/jpeg', galleta = admin) => pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/fotos/${archivo}`, { galleta, cabeceras: { 'Content-Type': tipo }, cuerpo });
    assert.equal((await subir('foto-ala.jpg', JPG, 'image/jpeg', ana)).codigo, 403, 'solo el administrador');
    assert.equal((await subir('otra.jpg', JPG)).datos.error, 'foto_no_esta_en_el_paquete');
    assert.equal((await subir('foto-ala.jpg', Buffer.from('no soy una imagen'))).datos.error, 'imagen_no_valida');
    assert.equal((await subir('foto-ala.jpg', Buffer.concat([JPG, Buffer.alloc(1024 * 1024)]))).codigo, 413, 'más de 1 MB');
    const r = await subir('foto-ala.jpg', JPG);
    assert.equal(r.codigo, 201, JSON.stringify(r.datos));
    assert.deepEqual(r.datos.faltanFotos, ['foto-motor.png']);
    assert.ok(existsSync(join(carpetaAcademia(config), 'paquetes', `${id}-${db.prepare('SELECT huella FROM academia_paquetes WHERE id = ?').get(id).huella.slice(0, 12)}`, 'fotos', 'foto-ala.jpg')));
    assert.equal((await subir('foto-ala.jpg', JPG)).codigo, 200, 'ya estaba');
    [conFoto, conClip] = (await tarjetas()).slice(-2);
    assert.match(conFoto.imagen.url, new RegExp(`^/api/academia/fotos/${id}~foto-ala\\.jpg\\?v=`));
    assert.deepEqual({ ...conFoto.imagen, url: null }, { url: null, alt: 'Dibujo inventado de un ala abierta.', pie: 'Las partes del ala', libro: LIBRO, pagina: '12' });
    assert.equal(conClip.imagen, null, 'la otra todavía no llegó');
    // La lista de versiones dice cuántas fotos trae y cuántas faltan.
    const lista = (await pedir(base, 'GET', '/api/admin/academia', { galleta: admin })).datos;
    const v = lista.paquetes.find(x => x.id === id);
    assert.equal(v.recursos.fotos, 2);
    assert.deepEqual(v.faltanFotos, ['foto-motor.png']);
    assert.equal(lista.limites.fotoBytes, 1024 * 1024);
    // Servirla: solo con la sesión, con su tipo y guardada un año.
    assert.equal((await pedir(base, 'GET', conFoto.imagen.url)).codigo, 401);
    const y = await pedir(base, 'GET', conFoto.imagen.url, { galleta: ana });
    assert.equal(y.codigo, 200);
    assert.equal(y.cabeceras.get('content-type'), 'image/jpeg');
    assert.equal(y.cabeceras.get('cache-control'), 'private, max-age=31536000, immutable');
    assert.ok(y.datos.equals(JPG));
    // Solo las que nombran las tarjetas en uso (ni otra, ni un camino, ni otra versión, ni una figura por esta ruta).
    for (const otra of [`${id}~otra.jpg`, `${id}~..%2Fpaquete.json`, `${id}~../paquete.json`, `999~foto-ala.jpg`, `${id}~${p.figuras[0].archivo}`, 'foto-ala.jpg']) {
      assert.equal((await pedir(base, 'GET', `/api/academia/fotos/${encodeURIComponent(otra)}`, { galleta: ana })).codigo, 404, otra);
    }
    // La segunda (png) usa el libro de la primera fuente; sin pie ni página.
    assert.equal((await subir('foto-motor.png', figuraMuestraPng(), 'image/png')).codigo, 201);
    [, conClip] = (await tarjetas()).slice(-2);
    assert.deepEqual({ ...conClip.imagen, url: null }, { url: null, alt: 'Un motor dibujado (inventado).', pie: null, libro: LIBRO, pagina: null });
    assert.equal((await pedir(base, 'GET', conClip.imagen.url, { galleta: ana })).cabeceras.get('content-type'), 'image/png');
  });
  db.close();
});

test('foto 0.12.5: una versión de antes (manifiesto sin «fotos») se vuelve a armar con sus fotos', () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const fila = { id: 77, huella: 'b'.repeat(64), carpeta: `77-${'b'.repeat(12)}` };
  const carpeta = join(carpetaAcademia(config), 'paquetes', fila.carpeta);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'paquete.json'), JSON.stringify(paqueteConFoto()));
  writeFileSync(join(carpeta, 'manifiesto.json'), JSON.stringify({ figuras: [], audios: [], materias: ['factores_humanos'], paginas: [], videos: [], clips: [] }));
  assert.deepEqual(manifiesto(config, fila, null, { soloArchivo: true }).fotos, [], 'el trabajador lo usa así (sin fotos)');
  assert.deepEqual(manifiesto(config, fila).fotos.map(f => f.archivo), ['foto-ala.jpg', 'foto-motor.png'], 'el servidor web lo vuelve a armar');
  assert.deepEqual(JSON.parse(readFileSync(join(carpeta, 'manifiesto.json'), 'utf8')).fotos.map(f => f.archivo), ['foto-ala.jpg', 'foto-motor.png'], 'y lo reescribe');
  db.close();
});

test('foto 0.12.5: Drive la baja por su nombre como una página (clase «foto»)', async () => {
  const archivos = new Map();
  const lista = createServer((req, res) => {
    const filas = [...archivos.entries()].map(([id, a]) => `<div class="flip-entry"><a href="https://drive.google.com/file/d/${id}/view"><div class="flip-entry-title">${a.nombre}</div></a></div>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body>${filas}</body></html>`);
  });
  const bajar = createServer((req, res) => {
    const a = archivos.get(new URL(req.url, 'http://x').searchParams.get('id'));
    if (!a) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': a.tipo, 'Content-Length': a.cuerpo.length });
    res.end(a.cuerpo);
  });
  const abrir = s => new Promise(ok => s.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${s.address().port}`)));
  const bases = { lista: await abrir(lista), bajar: await abrir(bajar) };
  try {
    const config = { ...configDePrueba(), driveBases: bases };
    const db = abrirBase(config);
    enTransaccion(db, () => guardarCarpetaDrive(db, 'carpetaRaizDeFotos01'));
    const p = paqueteConFoto();
    delete ultima(p).clip; // solo fotos
    archivos.set('archivoPaqueteFoto01', { nombre: 'paquete-foto.json', cuerpo: Buffer.from(JSON.stringify(p)), tipo: 'application/json' });
    archivos.set('archivoFiguraFoto001', { nombre: 'figura-m1.png', cuerpo: figuraMuestraPng(), tipo: 'image/png' });
    archivos.set('archivoFotoAla00001', { nombre: 'foto-ala.jpg', cuerpo: Buffer.from('no soy una imagen'), tipo: 'image/jpeg' });
    const revisar = async () => {
      const paso = crearSincronizador();
      let punto = null;
      for (let i = 0; i < 20; i++) {
        const r = await paso({ db, config, senal: new AbortController().signal, tarea: { id: 1, punto, datos: { origen: 'manual', forzar: true } }, escribir: async t => enTransaccion(db, t), quedaMs: () => 900_000 });
        if (r.listo) return leerRevisiones(db)[0];
        punto = r.punto;
        await importarEntrante(db, config);
      }
      throw new Error('no terminó');
    };
    let r = await revisar();
    assert.deepEqual(r.errores.sort((a, b) => a.archivo.localeCompare(b.archivo)), [{ archivo: 'foto-ala.jpg', motivo: 'imagen_no_valida' }, { archivo: 'foto-motor.png', motivo: 'no_esta_en_drive' }]);
    // Faltan fotos (opcionales): la versión igual queda en uso.
    assert.ok(r.activados.length >= 1);
    archivos.set('archivoFotoAla00001', { nombre: 'foto-ala.jpg', cuerpo: JPG, tipo: 'image/jpeg' });
    archivos.set('archivoFotoMotor001', { nombre: 'foto-motor.png', cuerpo: figuraMuestraPng(), tipo: 'image/png' });
    r = await revisar();
    assert.deepEqual(r.errores, []);
    assert.ok(r.completados >= 2);
    const fila = db.prepare('SELECT * FROM academia_paquetes ORDER BY id DESC LIMIT 1').get();
    assert.ok(existsSync(join(carpetaAcademia(config), 'paquetes', fila.carpeta, 'fotos', 'foto-motor.png')));
    db.close();
  } finally { await Promise.all([lista, bajar].map(s => new Promise(ok => s.close(ok)))); }
});

test('foto 0.12.5: en la pantalla: debajo del título, con pie «pie · Libro, p. N», el visor, y con clip solo una miniatura', () => {
  const [p] = partirLeccion([{ tipo: 'tarjeta', titulo: 'T', puntos: ['a'], imagen: { url: '/f.jpg', alt: 'a' }, fuentes: [] }]);
  assert.equal(p.imagen.url, '/f.jpg', 'la lección la pasa a la tarjeta');
  const [q] = partirLeccion([{ tipo: 'tarjeta', titulo: 'T', puntos: ['a'], imagen: null, fuentes: [] }]);
  assert.equal(q.imagen, null);
  const app = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  const vista = app.slice(app.indexOf('function pieFoto('), app.indexOf('function vistaTarjeta('));
  for (const x of ["loading: 'lazy'", 'alt: f.alt', 'abrirImagenGrande(', "addEventListener('error'", 'foto.ver', "t('foto.libro_pagina'"]) assert.ok(vista.includes(x), x);
  assert.match(app, /const foto = p\.imagen\?\.url \? vistaFoto\(p\.imagen, \{ mini: Boolean\(clip\) \}\) : null;/, 'con clip, miniatura');
  assert.match(app, /clip\?\.nodo \?\? null,\n\s+foto,\n\s+visual,/, 'debajo del título (y del clip)');
  const extra = readFileSync(join(RAIZ, 'public', 'extra-vista.js'), 'utf8');
  assert.match(extra, /h\.vistaFoto\(c\.imagen/);
  const css = readFileSync(join(RAIZ, 'public', 'academia.css'), 'utf8');
  assert.match(css, /\.tarjeta-leccion\.con-foto > \.tarjeta-foto \{ float: right;/, 'al lado en la pantalla ancha');
  for (const idioma of ['es', 'en']) {
    const t = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', `${idioma}.json`), 'utf8'));
    assert.equal(t['foto.libro_pagina'], '{libro}, p. {pagina}');
    assert.ok(t['foto.ver'] && t['error.foto_no_esta_en_el_paquete'] && t['acad.subir.faltan_fotos'], idioma);
  }
});
