// Pruebas de la Academia 0.14.24: la FOTO de perfil (src/cuentas/foto.js, src/api/perfil.js).
//  - Subir: solo con sesión (401), solo JPEG/PNG/WEBP de verdad (los primeros bytes: 400), nunca otro tipo (415), hasta
//    200 KB (413) y de 16 a 512 px por lado (400 foto_tamano). Vive en la carpeta privada de datos, un archivo por persona.
//  - Ver (GET /api/fotos/<token>): con sesión; el token es al azar (nunca el id); no-cache + ETag (304).
//  - Privacidad: con «Perfil privado» los demás alumnos no la ven (404; el administrador y la persona, sí); en la carrera
//    solo viaja la de otro con «Mostrar nombres» encendido y sin «Perfil privado»; sin Grupo ni nombres, 404.
//  - Reemplazar (el token viejo ya no sirve), «Quitar foto» (vuelve al avatar; el archivo NUNCA se borra) y la
//    moderación del administrador (403 para alumnos, auditoría y aviso a la persona).
// Imágenes armadas a mano (solo cabeceras), paquete de MUESTRA (test/academia-muestra.js), reloj fijo.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from './ayuda.js';
import { medirImagen, revisarFoto, FOTO_MAX_BYTES } from '../src/cuentas/foto.js';
import { mostrarNombresEnCarrera } from '../src/academia/carrera.js';
import { grupoDe } from '../src/academia/plan.js';
import { paqueteActivo } from '../src/academia/paquetes.js';
import { recorteCuadrado } from '../public/perfil-vista.js';
import { fotoValida, direccionFoto } from '../public/avatares.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const CLAVE = 'una clave bien larga';
const AHORA = Date.parse('2026-11-17T15:00:00Z');

// ---------- Imágenes de prueba (solo lo que hace falta para reconocerlas y medirlas) ----------
function jpeg(ancho, alto, relleno = 0) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, alto >> 8, alto & 0xff, ancho >> 8, ancho & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(relleno, 0x11), Buffer.from([0xff, 0xd9])]);
}
function png(ancho, alto) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(ancho, 16); b.writeUInt32BE(alto, 20);
  return b;
}
function webpX(ancho, alto) {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBP', 8, 'latin1'); b.write('VP8X', 12, 'latin1'); b.writeUInt32LE(10, 16);
  b.writeUIntLE(ancho - 1, 24, 3); b.writeUIntLE(alto - 1, 27, 3);
  return b;
}

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo, crudo = false } = {}) {
  const o = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) o.headers.Cookie = galleta;
  if (datos !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) o.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, o);
  if (crudo) return { codigo: r.status, cuerpo: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type'), cache: r.headers.get('cache-control'), etag: r.headers.get('etag') };
  const c = await r.json().catch(() => ({}));
  const sc = r.headers.get('set-cookie');
  return { codigo: r.status, datos: c, galleta: sc ? sc.split(';')[0] : null };
}
const subir = (base, galleta, cuerpo, tipo = 'image/jpeg') => pedir(base, 'POST', '/api/yo/foto', { galleta, cuerpo, cabeceras: { 'Content-Type': tipo } });

async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { reloj: () => AHORA } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } });
    assert.equal(admin.codigo, 201);
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(paqueteMuestra()) });
    assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
    for (const a of s.datos.faltan ?? []) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${a}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const hash = await hashClave(CLAVE);
    const ids = {
      ana: crearUsuario(db, { nombre: 'ana', nombreVisible: 'Ana Pérez', claveHash: hash, debeCambiarClave: false }),
      beto: crearUsuario(db, { nombre: 'beto', nombreVisible: 'Beto Gómez', claveHash: hash, debeCambiarClave: false }),
    };
    const entrar = async nombre => (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    const carpeta = join(dirname(config.archivoBase), 'fotos');
    await fn({ base, db, config, admin: admin.galleta, ana: await entrar('ana'), beto: await entrar('beto'), ids, carpeta });
  });
  db.close();
}

test('medir y revisar una foto por sus bytes: JPEG, PNG y WEBP; otra cosa, demasiado grande o fuera de tamaño, no', () => {
  assert.deepEqual(medirImagen(jpeg(256, 200)), { tipo: 'image/jpeg', ancho: 256, alto: 200 });
  assert.deepEqual(medirImagen(png(300, 120)), { tipo: 'image/png', ancho: 300, alto: 120 });
  assert.deepEqual(medirImagen(webpX(512, 64)), { tipo: 'image/webp', ancho: 512, alto: 64 });
  assert.equal(medirImagen(Buffer.from('GIF89a................................')), null);
  assert.equal(medirImagen(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(medirImagen(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null, 'un JPEG sin tamaño no sirve');
  // El tipo lo dicen los bytes: un PNG que llega como «image/jpeg» es un PNG.
  assert.equal(revisarFoto(png(64, 64), 'image/jpeg').tipo, 'image/png');
  const clave = f => { try { f(); return null; } catch (e) { return `${e.codigo} ${e.clave}`; } };
  assert.equal(clave(() => revisarFoto(jpeg(64, 64), 'image/gif')), '415 imagen_no_valida');
  assert.equal(clave(() => revisarFoto(Buffer.from('hola, no soy una imagen de verdad!!'), 'image/jpeg')), '400 imagen_no_valida');
  assert.equal(clave(() => revisarFoto(jpeg(64, 64, FOTO_MAX_BYTES), 'image/jpeg')), '413 demasiado_grande');
  assert.equal(clave(() => revisarFoto(jpeg(513, 256), 'image/jpeg')), '400 foto_tamano');
  assert.equal(clave(() => revisarFoto(png(8, 8), 'image/png')), '400 foto_tamano');
  assert.equal(clave(() => revisarFoto(webpX(512, 512), 'image/webp')), null);
});

test('el recorte cuadrado de la pantalla (centrado, con zoom, nunca sale de la imagen) y el token de la foto', () => {
  assert.deepEqual(recorteCuadrado(400, 300), { sx: 50, sy: 0, lado: 300, cx: 200, cy: 150 });
  assert.deepEqual(recorteCuadrado(300, 400, 2), { sx: 75, sy: 125, lado: 150, cx: 150, cy: 200 });
  assert.deepEqual(recorteCuadrado(400, 300, 1, 0, 9999), { sx: 0, sy: 0, lado: 300, cx: 150, cy: 150 });
  assert.equal(recorteCuadrado(1000, 1000, 0.2).lado, 1000, 'el zoom nunca baja de 1');
  assert.ok(fotoValida('a'.repeat(32)));
  assert.ok(!fotoValida('../../etc/passwd') && !fotoValida('A'.repeat(32)) && !fotoValida(null));
  assert.equal(direccionFoto('0123456789abcdef0123456789abcdef'), '/api/fotos/0123456789abcdef0123456789abcdef');
  assert.equal(direccionFoto('x'), null);
});

test('subir la foto: sesión, tipo, bytes de verdad, tope y tamaño; se guarda en la carpeta privada y se ve con no-cache + ETag', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids, carpeta }) => {
    assert.equal((await subir(base, null, jpeg(256, 256))).codigo, 401);
    assert.equal((await pedir(base, 'GET', `/api/fotos/${'a'.repeat(32)}`)).codigo, 401);
    // Sin la cabecera de la app (otra página): 403.
    assert.equal((await fetch(`${base}/api/yo/foto`, { method: 'POST', headers: { Cookie: ana, 'Content-Type': 'image/jpeg' }, body: jpeg(256, 256) })).status, 403);
    const malas = [
      [jpeg(256, 256), 'text/plain', 415, 'imagen_no_valida'],
      [jpeg(256, 256), 'image/gif', 415, 'imagen_no_valida'],
      [Buffer.from('GIF89a, esto no es un JPEG aunque lo diga'), 'image/jpeg', 400, 'imagen_no_valida'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png', 400, 'imagen_no_valida'],
      [jpeg(256, 256, FOTO_MAX_BYTES + 10), 'image/jpeg', 413, 'demasiado_grande'],
      [jpeg(1024, 1024), 'image/jpeg', 400, 'foto_tamano'],
      [Buffer.alloc(0), 'image/jpeg', 400, 'imagen_no_valida'],
    ];
    for (const [cuerpo, tipo, codigo, error] of malas) {
      const r = await subir(base, ana, cuerpo, tipo);
      assert.equal(r.codigo, codigo, `${tipo} ${cuerpo.length}: ${JSON.stringify(r.datos)}`);
      assert.equal(r.datos.error, error);
    }
    assert.ok(!existsSync(carpeta) || readdirSync(carpeta).length === 0, 'ninguna mala llegó al disco');

    const foto = jpeg(256, 256, 2000);
    const r = await subir(base, ana, foto);
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    const token = r.datos.perfil.foto;
    assert.match(token, /^[a-f0-9]{32}$/);
    assert.deepEqual(readdirSync(carpeta), [`${ids.ana}.foto`]);
    assert.ok(readFileSync(join(carpeta, `${ids.ana}.foto`)).equals(foto));
    // La referencia va en «ajustes»; su perfil, /api/yo y la lista del administrador la traen.
    assert.equal((await pedir(base, 'GET', '/api/yo/perfil', { galleta: ana })).datos.perfil.foto, token);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).datos.usuario.foto, token);
    const lista = await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin });
    assert.equal(lista.datos.usuarios.find(u => u.id === ids.ana).foto, token);
    assert.equal(lista.datos.usuarios.find(u => u.id === ids.beto).foto, null);
    assert.equal((await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos.alumno?.foto ?? null, token);

    const v = await pedir(base, 'GET', `/api/fotos/${token}`, { galleta: ana, crudo: true });
    assert.equal(v.codigo, 200);
    assert.equal(v.tipo, 'image/jpeg');
    assert.ok(v.cuerpo.equals(foto));
    assert.match(v.cache, /private/);
    assert.match(v.cache, /no-cache/);
    assert.equal(v.etag, `"${token}"`);
    assert.equal((await pedir(base, 'GET', `/api/fotos/${token}`, { galleta: ana, crudo: true, cabeceras: { 'If-None-Match': `"${token}"` } })).codigo, 304);
    // Un compañero la ve (Grupo encendido, sin «Perfil privado»); un token inventado o mal escrito, no.
    assert.equal((await pedir(base, 'GET', `/api/fotos/${token}`, { galleta: beto, crudo: true })).codigo, 200);
    assert.equal((await pedir(base, 'GET', `/api/fotos/${'0'.repeat(32)}`, { galleta: beto, crudo: true })).codigo, 404);
    assert.equal((await pedir(base, 'GET', '/api/fotos/..%2F..%2Foportia.db', { galleta: beto, crudo: true })).codigo, 404);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'foto_perfil_cambiada' AND usuario_id = ?").get(ids.ana).n, 1);
  });
});

test('reemplazar y quitar: el token viejo deja de servir, un solo archivo por persona y nunca se borra', async () => {
  await conAcademia(async ({ base, ana, beto, ids, carpeta }) => {
    const t1 = (await subir(base, ana, jpeg(256, 256))).datos.perfil.foto;
    const nueva = png(200, 200);
    const r2 = await subir(base, ana, nueva, 'image/png');
    assert.equal(r2.codigo, 200);
    const t2 = r2.datos.perfil.foto;
    assert.notEqual(t1, t2);
    assert.equal((await pedir(base, 'GET', `/api/fotos/${t1}`, { galleta: ana, crudo: true })).codigo, 404);
    const v = await pedir(base, 'GET', `/api/fotos/${t2}`, { galleta: ana, crudo: true });
    assert.equal(v.codigo, 200);
    assert.equal(v.tipo, 'image/png');
    assert.deepEqual(readdirSync(carpeta), [`${ids.ana}.foto`], 'la nueva reemplazó a la suya (sin archivos a medias)');
    // Beto sube la suya: no toca la de Ana.
    await subir(base, beto, jpeg(128, 128));
    assert.deepEqual(readdirSync(carpeta).sort(), [`${ids.ana}.foto`, `${ids.beto}.foto`].sort());
    assert.ok(readFileSync(join(carpeta, `${ids.ana}.foto`)).equals(nueva));
    // «Quitar foto»: vuelve al avatar; nadie la ve; el archivo se queda (nunca se borra nada).
    const q = await pedir(base, 'POST', '/api/yo/foto/quitar', { galleta: ana, datos: {} });
    assert.equal(q.codigo, 200);
    assert.equal(q.datos.perfil.foto, null);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).datos.usuario.foto, null);
    for (const g of [ana, beto]) assert.equal((await pedir(base, 'GET', `/api/fotos/${t2}`, { galleta: g, crudo: true })).codigo, 404);
    assert.ok(existsSync(join(carpeta, `${ids.ana}.foto`)));
    // Guardar el perfil (avatar, meta) no toca la foto, y la foto no toca el avatar.
    const t3 = (await subir(base, ana, jpeg(256, 256))).datos.perfil.foto;
    const p = await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { avatar: 'jet-rojo', meta: 'Volar' } });
    assert.equal(p.datos.perfil.foto, t3);
    assert.equal(p.datos.perfil.avatar, 'jet-rojo');
  });
});

test('privacidad: «Perfil privado», la carrera con «Mostrar nombres» apagado y sin Grupo', async () => {
  await conAcademia(async ({ base, db, config, admin, ana, beto, ids }) => {
    const token = (await subir(base, ana, jpeg(256, 256))).datos.perfil.foto;
    const tokenBeto = (await subir(base, beto, jpeg(256, 256))).datos.perfil.foto;
    const ver = g => pedir(base, 'GET', `/api/fotos/${token}`, { galleta: g, crudo: true }).then(r => r.codigo);
    const carrera = async g => (await pedir(base, 'GET', '/api/academia/carrera', { galleta: g })).datos;
    // Con todo encendido: Beto ve la foto de Ana en la carrera (solo el token: nunca su id) y en el Grupo.
    let c = await carrera(beto);
    const deAna = c.pilotos.find(x => !x.esYo);
    assert.equal(deAna.foto, token);
    assert.equal(c.pilotos.find(x => x.esYo).foto, tokenBeto);
    assert.ok(!JSON.stringify(c.pilotos).includes(`"${ids.ana}"`));
    const paquete = paqueteActivo(db, config);
    assert.equal(grupoDe(db, ids.beto, paquete, AHORA).companeros.find(x => !x.tu).foto, token);

    // «Mostrar nombres en la carrera» apagado: los demás son «Piloto N» y sin foto; la suya, sí.
    mostrarNombresEnCarrera(db, false);
    c = await carrera(beto);
    assert.equal(c.pilotos.find(x => !x.esYo).foto, undefined);
    assert.ok(!('foto' in c.pilotos.find(x => !x.esYo)));
    assert.equal(c.pilotos.find(x => x.esYo).foto, tokenBeto);
    assert.equal(await ver(beto), 200, 'el Grupo sigue encendido: ahí sí la ve');
    // Sin Grupo y sin nombres en la carrera: no hay dónde ver la de otro (404); ella y el administrador, sí.
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('academia.grupo', '0', ?) ON CONFLICT(clave) DO UPDATE SET valor = '0'").run(new Date(AHORA).toISOString());
    assert.equal(await ver(beto), 404);
    assert.equal(await ver(ana), 200);
    assert.equal(await ver(admin), 200);
    db.prepare("UPDATE ajustes SET valor = '1' WHERE clave = 'academia.grupo'").run();
    mostrarNombresEnCarrera(db, true);

    // «Perfil privado»: los otros alumnos nunca ven su foto (ni con el token que ya tenían); ella y el administrador, sí.
    assert.equal((await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { privado: true } })).codigo, 200);
    assert.equal(await ver(beto), 404);
    assert.equal(await ver(ana), 200);
    assert.equal(await ver(admin), 200);
    c = await carrera(beto);
    assert.ok(c.pilotos.filter(x => !x.esYo).every(x => !('foto' in x)));
    assert.ok(grupoDe(db, ids.beto, paquete, AHORA).companeros.every(x => x.tu || x.foto !== token));
    // El administrador la sigue viendo en sus listas («Cómo van todos»).
    const cv = await pedir(base, 'GET', '/api/admin/academia/como-van', { galleta: admin });
    assert.equal(cv.datos.alumnos.find(x => x.id === ids.ana).foto, token);
    // Una cuenta bloqueada: los demás no ven su foto.
    await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { privado: false } });
    assert.equal(await ver(beto), 200);
    db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(ids.ana);
    assert.equal(await ver(beto), 404);
  });
});

test('el administrador quita la foto de alguien (moderación): 403 para alumnos, auditoría y aviso; nada se borra', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids, carpeta }) => {
    const token = (await subir(base, beto, jpeg(256, 256))).datos.perfil.foto;
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.beto}/foto/quitar`, { datos: {} })).codigo, 401);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.beto}/foto/quitar`, { galleta: ana, datos: {} })).codigo, 403);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: beto })).datos.usuario.foto, token, 'un alumno no le quita la foto a otro');
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios/99999/foto/quitar', { galleta: admin, datos: {} })).codigo, 404);
    const r = await pedir(base, 'POST', `/api/admin/usuarios/${ids.beto}/foto/quitar`, { galleta: admin, datos: {} });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.deepEqual(r.datos, { id: ids.beto, quitada: true, foto: null });
    assert.equal((await pedir(base, 'GET', `/api/fotos/${token}`, { galleta: admin, crudo: true })).codigo, 404);
    const yo = (await pedir(base, 'GET', '/api/yo', { galleta: beto })).datos;
    assert.equal(yo.usuario.foto, null);
    assert.ok(yo.avisos.some(a => a.tipo === 'foto_quitada'));
    const fila = db.prepare("SELECT usuario_id, detalle FROM auditoria WHERE accion = 'foto_perfil_quitada' ORDER BY id DESC").get();
    assert.notEqual(fila.usuario_id, ids.beto);
    assert.match(fila.detalle, /por el administrador/);
    assert.ok(existsSync(join(carpeta, `${ids.beto}.foto`)), 'el archivo se queda');
    // Otra vez: no había foto (quitada: false) y no hay otro aviso.
    const otra = await pedir(base, 'POST', `/api/admin/usuarios/${ids.beto}/foto/quitar`, { galleta: admin, datos: {} });
    assert.equal(otra.datos.quitada, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos_cuenta WHERE usuario_id = ? AND tipo = 'foto_quitada'").get(ids.beto).n, 1);
  });
});
