// Academia 0.14.83: Administrador → Avanzado → «Traspaso (para otro Claude)» (src/traspaso/boveda.js,
// src/traspaso/instrucciones.js, src/api/traspaso.js, public/traspaso-vista.js). Todo con valores INVENTADOS aquí
// (dominios .invalid, que no existen), sin internet, con un scrypt chico y el freno con un reloj de mentira.
import { configDePrueba, conServidor, hashClave, carpetaTemporal } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { Freno } from '../src/nucleo/limites.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { claveDeBoveda, limpiarContenido, contenidoVacio, KDF_TRASPASO, MAX_PROPIOS } from '../src/traspaso/boveda.js';
import { markdownTraspaso, REGLAS_DE_LA_CASA } from '../src/traspaso/instrucciones.js';
import { repoLimpio, repoDelServidor, VENCE_MS } from '../src/api/traspaso.js';
import { AVANZADO_ADMIN } from '../public/navegacion.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const NUEVA = 'otra clave distinta 42';
const AHORA = Date.parse('2026-11-20T12:00:00Z');
const KDF_CHICO = Object.freeze({ kdf: 'scrypt', N: 1024, r: 8, p: 1 });
// Valores de mentira: si alguno aparece donde no debe, la prueba lo dice.
const FALSOS = Object.freeze({
  driveContenido: 'https://ejemplo.invalid/carpeta-CONTENIDO-falsa-7781',
  driveFuentes: 'https://ejemplo.invalid/carpeta-FUENTES-falsa-9902',
  repo: 'https://ejemplo.invalid/repo-FALSO-3310',
  servidor: 'Servidor de mentira: entrar con PALABRA-FALSA-5521',
  notas: 'Notas de prueba NOTA-FALSA-6634\ncon dos líneas',
  pendientes: 'Falta PENDIENTE-FALSO-4417',
  propios: [{ nombre: 'Campo propio', valor: 'VALOR-PROPIO-FALSO-1188' }],
});
const MARCAS = ['7781', '9902', 'repo-FALSO-3310', 'PALABRA-FALSA-5521', 'NOTA-FALSA-6634', 'PENDIENTE-FALSO-4417', 'VALOR-PROPIO-FALSO-1188'];

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${base}${ruta}`, opciones);
  const sc = r.headers.get('set-cookie');
  return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: sc ? sc.split(';')[0] : null };
}

// Lo que se escribe en la consola mientras corre fn (console.* y stdout/stderr).
async function conConsola(fn) {
  const escrito = [];
  const viejos = {};
  for (const m of ['log', 'error', 'warn', 'info', 'debug']) { viejos[m] = console[m]; console[m] = (...a) => { escrito.push(a.map(String).join(' ')); }; }
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  process.stdout.write = (x, ...r) => { escrito.push(String(x)); return out(x, ...r); };
  process.stderr.write = (x, ...r) => { escrito.push(String(x)); return err(x, ...r); };
  try { await fn(); } finally {
    Object.assign(console, viejos);
    process.stdout.write = out;
    process.stderr.write = err;
  }
  return escrito.join('\n');
}

async function conTraspaso(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const esperas = [];
  const freno = new Freno({ dormir: async ms => { esperas.push(ms); }, reloj: () => AHORA });
  const medir = () => ({ disco: { libreMb: 1234, totalMb: 25000 }, memoria: { disponibleMb: 210, totalMb: 512 } });
  const servidor = crearServidor({ db, config, supervisor: { despertar() {} }, academia: { reloj: () => AHORA }, confirmar: { freno }, traspaso: { kdf: KDF_CHICO, repo: () => null, medir } });
  try {
    await conServidor(servidor, async base => {
      const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      const adminId = db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
      crearUsuario(db, { nombre: 'zoelia', claveHash: await hashClave(CLAVE), debeCambiarClave: false, creadoPor: adminId });
      const alumno = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'zoelia', clave: CLAVE } })).galleta;
      await fn({ base, db, config, admin, adminId, alumno, esperas });
    });
  } finally {
    db.close();
  }
}

test('solo el administrador: un alumno recibe 403 y sin sesión 401, en cada ruta', async () => {
  await conTraspaso(async ({ base, alumno }) => {
    const rutas = [['GET', '/api/admin/traspaso'], ['POST', '/api/admin/traspaso/abrir'], ['POST', '/api/admin/traspaso/guardar'], ['POST', '/api/admin/traspaso/empezar'], ['POST', '/api/admin/traspaso/repo']];
    for (const [m, ruta] of rutas) {
      const datos = m === 'POST' ? { clave: CLAVE, contenido: FALSOS } : undefined;
      assert.equal((await pedir(base, m, ruta, { galleta: alumno, datos })).codigo, 403, `${m} ${ruta} (alumno)`);
      assert.equal((await pedir(base, m, ruta, { datos })).codigo, 401, `${m} ${ruta} (sin sesión)`);
    }
  });
});

test('cerrado: lo que no es secreto llega solo; una contraseña mala da 401 y pasa por el freno (también desde Tailscale)', async () => {
  await conTraspaso(async ({ base, db, admin, esperas }) => {
    const g = await pedir(base, 'GET', '/api/admin/traspaso', { galleta: admin });
    assert.equal(g.codigo, 200);
    assert.deepEqual(g.datos.boveda, { existe: false, en: null, danada: false });
    assert.equal(g.datos.venceMs, 10 * 60 * 1000);
    const i = g.datos.info;
    assert.equal(i.version, JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version);
    assert.equal(i.migracion, Math.max(...MIGRACIONES.map(x => x.id)));
    assert.equal(i.alumnos, 1);
    assert.equal(i.cursos, db.prepare('SELECT COUNT(*) AS n FROM academia_cursos WHERE archivado_en IS NULL').get().n);
    assert.equal(typeof i.cursos, 'number');
    assert.deepEqual([i.disco.libreMb, i.memoria.libreMb, i.memoria.totalMb], [1234, 210, 512]);
    assert.equal(i.repo, null);
    assert.equal(g.datos.markdown, undefined, 'cerrado no trae instrucciones');

    // Sin contraseña (aunque venga de la cuenta de Tailscale del dueño): no se abre.
    const sin = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, cabeceras: DUENO, datos: {} });
    assert.deepEqual([sin.codigo, sin.datos.error], [400, 'traspaso_falta_clave']);
    for (let n = 0; n < 6; n++) {
      const r = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, cabeceras: DUENO, datos: { clave: `mala ${n}` } });
      assert.deepEqual([r.codigo, r.datos.error], [401, 'traspaso_clave_incorrecta']);
      assert.equal(r.datos.contenido, undefined);
    }
    // El freno de siempre: 5 sin espera, la sexta espera 1 s (cada vez más, hasta 8 s).
    assert.deepEqual(esperas, [1000]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'traspaso_clave_fallida'").get().n, 6);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ajustes WHERE clave LIKE ?').get('traspaso.boveda.%').n, 0, 'una contraseña mala nunca crea la bóveda');
    // La buena abre (y el freno se olvida de esta cuenta).
    const ok = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, cabeceras: DUENO, datos: { clave: CLAVE } });
    assert.equal(ok.codigo, 200, JSON.stringify(ok.datos));
    assert.deepEqual(ok.datos.contenido, contenidoVacio());
    assert.equal(ok.datos.venceEn, AHORA + VENCE_MS);
  });
});

test('ida y vuelta: guardar, cerrar y abrir otra vez; en la base solo queda texto cifrado y nada secreto sale por la consola', async () => {
  let galletaAdmin = null;
  const consola = await conConsola(async () => {
    await conTraspaso(async ({ base, db, config, admin, adminId }) => {
      galletaAdmin = admin;
      const origen = 'https://academia.ejemplo.invalid';
      const g = await pedir(base, 'POST', '/api/admin/traspaso/guardar', { galleta: admin, datos: { clave: CLAVE, contenido: FALSOS, origen } });
      assert.equal(g.codigo, 200, JSON.stringify(g.datos));
      assert.deepEqual(g.datos.contenido, FALSOS);
      // Cerrado (la pantalla olvida la contraseña): lo de afuera no trae nada secreto.
      const cerrado = await pedir(base, 'GET', '/api/admin/traspaso', { galleta: admin });
      assert.equal(cerrado.datos.boveda.existe, true);
      for (const m of MARCAS) assert.ok(!JSON.stringify(cerrado.datos).includes(m), `cerrado deja ver ${m}`);
      // Mal: no abre. Bien: vuelve todo.
      assert.equal((await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, datos: { clave: 'no es esta' } })).codigo, 401);
      const a = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, datos: { clave: CLAVE, origen } });
      assert.equal(a.codigo, 200);
      assert.deepEqual(a.datos.contenido, FALSOS);
      // Las instrucciones llevan lo de la bóveda (solo abierta), lo de afuera y las reglas de la casa.
      const md = a.datos.markdown;
      for (const m of MARCAS) assert.ok(md.includes(m), `las instrucciones no traen ${m}`);
      for (const regla of REGLAS_DE_LA_CASA) assert.ok(md.includes(regla));
      assert.match(md, /Dirección de la app \(producción\): https:\/\/academia\.ejemplo\.invalid/);
      assert.match(md, /cada 30 minutos/);
      assert.match(md, /900 segundos/);
      assert.match(md, /env -i PATH=/);
      const cerradoMd = markdownTraspaso(a.datos.info, null);
      for (const m of MARCAS) assert.ok(!cerradoMd.includes(m), `sin abrir, las instrucciones traen ${m}`);
      // La base: un sobre con su sal y sus números; ni el texto ni la contraseña (tampoco en el -wal).
      const sobre = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(claveDeBoveda(adminId)).valor);
      assert.deepEqual(Object.keys(sobre).sort(), ['cifrado', 'en', 'iv', 'kdf', 'ref', 'sello', 'v']);
      assert.deepEqual({ ...sobre.kdf, sal: 'x' }, { ...KDF_CHICO, sal: 'x' });
      for (const archivo of [config.archivoBase, `${config.archivoBase}-wal`]) {
        if (!existsSync(archivo)) continue;
        const bytes = readFileSync(archivo).toString('latin1');
        for (const m of [...MARCAS, CLAVE]) assert.ok(!bytes.includes(m), `${archivo} contiene ${m} sin cifrar`);
      }
      // La auditoría y los avisos solo dicen qué pasó.
      const filas = JSON.stringify([...db.prepare('SELECT * FROM auditoria').all(), ...db.prepare('SELECT * FROM avisos').all()]);
      assert.match(filas, /traspaso_guardado/);
      assert.match(filas, /traspaso_abierto/);
      for (const m of [...MARCAS, CLAVE]) assert.ok(!filas.includes(m), `la auditoría o un aviso tiene ${m}`);
      // Con otro sobre (otra fila, otro ref) no se abre: el ref va en la AAD.
      db.prepare('UPDATE ajustes SET valor = ? WHERE clave = ?').run(JSON.stringify({ ...sobre, ref: 'otro-ref-cualquiera' }), claveDeBoveda(adminId));
      const otro = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, datos: { clave: CLAVE } });
      assert.deepEqual([otro.codigo, otro.datos.error], [409, 'traspaso_otra_clave']);
    });
  });
  assert.ok(galletaAdmin);
  for (const m of [...MARCAS, CLAVE]) assert.ok(!consola.includes(m), `la consola mostró ${m}`);
});

test('la contraseña cambió: se abre con la de antes (y queda con la nueva) o se empieza de nuevo sin borrar nada', async () => {
  await conTraspaso(async ({ base, db, admin, adminId }) => {
    assert.equal((await pedir(base, 'POST', '/api/admin/traspaso/guardar', { galleta: admin, datos: { clave: CLAVE, contenido: FALSOS } })).codigo, 200);
    const cambio = await pedir(base, 'POST', '/api/yo/clave', { galleta: admin, datos: { actual: CLAVE, nueva: NUEVA } });
    assert.equal(cambio.codigo, 200, JSON.stringify(cambio.datos));
    // La de antes ya no es la de entrar: 401.
    assert.equal((await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, datos: { clave: CLAVE } })).codigo, 401);
    // La nueva es la de entrar, pero la bóveda se cerró con la de antes.
    const otra = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, datos: { clave: NUEVA } });
    assert.deepEqual([otra.codigo, otra.datos.error], [409, 'traspaso_otra_clave']);
    assert.equal((await pedir(base, 'POST', '/api/admin/traspaso/guardar', { galleta: admin, datos: { clave: NUEVA, contenido: contenidoVacio() } })).codigo, 409, 'nunca se pisa lo de antes');
    const mala = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, datos: { clave: NUEVA, anterior: 'tampoco es esta' } });
    assert.deepEqual([mala.codigo, mala.datos.error], [401, 'traspaso_anterior_incorrecta']);
    const bien = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, datos: { clave: NUEVA, anterior: CLAVE } });
    assert.equal(bien.codigo, 200, JSON.stringify(bien.datos));
    assert.deepEqual(bien.datos.contenido, FALSOS);
    const ya = await pedir(base, 'POST', '/api/admin/traspaso/abrir', { galleta: admin, datos: { clave: NUEVA } });
    assert.deepEqual(ya.datos.contenido, FALSOS, 'ahora abre con la nueva');
    // Empezar de nuevo: lo de antes queda guardado con otro nombre.
    const antes = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(claveDeBoveda(adminId)).valor;
    const nuevo = await pedir(base, 'POST', '/api/admin/traspaso/empezar', { galleta: admin, datos: { clave: NUEVA } });
    assert.equal(nuevo.codigo, 200);
    assert.deepEqual(nuevo.datos.contenido, contenidoVacio());
    const apartadas = db.prepare('SELECT valor FROM ajustes WHERE clave LIKE ?').all(`${claveDeBoveda(adminId)}.apartada-%`);
    assert.deepEqual(apartadas.map(f => f.valor), [antes]);
  });
});

test('topes: 30 campos propios como mucho, campos con su largo, una fila vacía no se guarda y nada que no se conozca', () => {
  const propios = Array.from({ length: MAX_PROPIOS }, (_, i) => ({ nombre: `c${i}`, valor: 'v' }));
  assert.equal(limpiarContenido({ propios }).propios.length, 30);
  assert.throws(() => limpiarContenido({ propios: [...propios, { nombre: 'uno más', valor: 'v' }] }), /traspaso_muchos_campos/);
  assert.throws(() => limpiarContenido({ notas: 'x'.repeat(20001) }), /traspaso_muy_largo/);
  assert.throws(() => limpiarContenido({ propios: [{ nombre: '', valor: 'sin nombre' }] }), /traspaso_sin_nombre/);
  assert.throws(() => limpiarContenido({ notas: 5 }), /datos_no_validos/);
  const c = limpiarContenido({ notas: 'a\r\nb', otra: 'no se guarda', propios: [{ nombre: '  ', valor: '' }] });
  assert.deepEqual(c, { ...contenidoVacio(), notas: 'a\nb' });
  assert.deepEqual(KDF_TRASPASO, { kdf: 'scrypt', N: 32768, r: 8, p: 1 }, 'en el servidor, el scrypt de las copias (32 MB)');
});

test('el repositorio: de .git/config (también en un worktree), sin usuario ni token; si no, un campo que el dueño llena', async () => {
  assert.equal(repoLimpio('https://x-access-token:TOKEN-FALSO@github.com/alguien/proyecto.git'), 'https://github.com/alguien/proyecto');
  assert.equal(repoLimpio('git@github.com:alguien/proyecto.git'), 'https://github.com/alguien/proyecto');
  assert.equal(repoLimpio('alguien/proyecto'), 'https://github.com/alguien/proyecto');
  for (const malo of ['https://ejemplo.invalid/a/b', 'javascript:alert(1)', 'https://github.com/a', '', 'https://github.com/../x']) assert.equal(repoLimpio(malo), null, malo);
  const raiz = carpetaTemporal('traspaso-repo');
  const comun = join(raiz, 'comun');
  mkdirSync(join(comun, 'worktrees', 'wt'), { recursive: true });
  writeFileSync(join(comun, 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://usuario:TOKEN-FALSO@github.com/alguien/proyecto.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
  writeFileSync(join(comun, 'worktrees', 'wt', 'commondir'), '../..\n');
  const wt = join(raiz, 'wt');
  mkdirSync(wt);
  writeFileSync(join(wt, '.git'), `gitdir: ${join(comun, 'worktrees', 'wt')}\n`);
  assert.equal(repoDelServidor(wt, null), 'https://github.com/alguien/proyecto');
  assert.equal(repoDelServidor(join(raiz, 'nada'), null), null);
  // Sin git, el REPO del actualizador del servidor.
  const act = join(raiz, 'actualizar');
  writeFileSync(act, '#!/bin/bash\nREPO="alguien/otro"\n');
  assert.equal(repoDelServidor(join(raiz, 'nada'), act), 'https://github.com/alguien/otro');
  await conTraspaso(async ({ base, admin }) => {
    assert.equal((await pedir(base, 'POST', '/api/admin/traspaso/repo', { galleta: admin, datos: { repo: 'https://ejemplo.invalid/x/y' } })).datos.error, 'traspaso_repo_no_valido');
    const r = await pedir(base, 'POST', '/api/admin/traspaso/repo', { galleta: admin, datos: { repo: 'https://github.com/alguien/proyecto' } });
    assert.equal(r.datos.info.repo, 'https://github.com/alguien/proyecto');
  });
});

test('la pantalla: en Avanzado, sin innerHTML ni estilos en línea, la contraseña solo en memoria (10 minutos) y textos en los dos idiomas', () => {
  const item = AVANZADO_ADMIN.flatMap(g => g.items).find(x => x.id === 'traspaso');
  assert.deepEqual(item, { id: 'traspaso', href: '#traspaso', clave: 'admin.pestana.traspaso', icono: 'llave' });
  const vista = readFileSync(join(RAIZ, 'public', 'traspaso-vista.js'), 'utf8');
  assert.doesNotMatch(vista, /innerHTML|outerHTML|insertAdjacentHTML|style=|\.style\b|localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.match(vista, /window\.addEventListener\('hashchange'/);
  assert.match(vista, /abierto\.clave = '';/);
  // Los 10 minutos con el reloj de este equipo (no la hora del servidor), y lo abierto es de UN administrador.
  assert.match(vista, /vence: Date\.now\(\) \+ venceMs/);
  assert.doesNotMatch(vista, /venceEn/);
  assert.match(vista, /abierto\.usuarioId !== h\.usuarioId/);
  const app = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  assert.match(app, /if \(seccion === 'traspaso' && esAdmin\) return pantallaTraspaso\(\);/);
  // Al terminar la sesión o al salir, se olvida lo abierto; nada se pinta si ya no es el administrador.
  assert.equal((app.match(/cerrarTraspasoAbierto\?\.\(\);\n {2,4}estado\.usuario = null;/g) ?? []).length, 2);
  assert.match(app, /estado\.usuario\?\.rol !== 'admin'\) return vista\.cerrarTraspaso\(\);/);
  const es = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'es.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'en.json'), 'utf8'));
  const usadas = new Set([...vista.matchAll(/t\('((?:tr|error)\.[a-z0-9_.]+)'/g)].map(m => m[1]));
  for (const m of vista.matchAll(/clave: '(tr\.[a-z0-9_.]+)'/g)) { usadas.add(m[1]); usadas.add(`${m[1]}.ejemplo`); }
  assert.ok(usadas.size > 30);
  for (const k of usadas) assert.ok(k in es && k in en, `falta ${k}`);
  assert.equal(es['tr.nota'], 'Para darle acceso a otro Claude: abre esto, pon tu contraseña, toca «Copiar instrucciones» y pégaselo. Nadie puede ver esto sin tu contraseña.');
});

// Regla: ningún archivo del repositorio trae un enlace de verdad a una carpeta o un documento de Google Drive / Docs
// (los enlaces del dueño viven solo en la base, cifrados en la bóveda o en los ajustes de Drive). Los ids de verdad
// tienen 25 caracteres o más; los inventados de test/drive.test.js son más cortos o van con ${…}.
test('ningún archivo del repositorio trae un enlace de Google Drive o Google Docs con su id', () => {
  const enlace = /\b(?:drive|docs)\.google\.com\/[^\s'"`<>)]*?(?:\/d\/|\/folders\/|[?&]id=)(?!\$\{|…|<)([A-Za-z0-9_-]{25,})/;
  const todos = [];
  (function recorrer(dir) {
    for (const nombre of readdirSync(dir)) {
      if (nombre === '.git' || nombre === 'node_modules') continue;
      const ruta = join(dir, nombre);
      const s = statSync(ruta);
      if (s.isDirectory()) recorrer(ruta);
      else if (/\.(js|mjs|cjs|json|md|html|css|sh|service|txt|ya?ml)$/.test(nombre) && s.size < 2_000_000) todos.push(ruta);
    }
  })(RAIZ);
  assert.ok(todos.length > 100);
  // Control: la regla sí atrapa enlaces de verdad (armados aquí por partes, para que este archivo no los traiga).
  const g = 'google.com';
  for (const bueno of [`https://drive.${g}/drive/folders/${'A'.repeat(33)}`, `https://docs.${g}/document/d/${'b1'.repeat(22)}/edit`, `https://drive.${g}/open?id=${'C'.repeat(28)}`]) assert.match(bueno, enlace, bueno);
  for (const ejemplo of [`https://drive.${g}/drive/folders/…`, 'https://drive.' + g + '/drive/folders/${id}']) assert.doesNotMatch(ejemplo, enlace, ejemplo);
  for (const f of todos) {
    const m = enlace.exec(readFileSync(f, 'utf8'));
    assert.equal(m, null, `${relative(RAIZ, f).split(sep).join('/')} trae un enlace de Google (${m?.[0]?.slice(0, 40)}…)`);
  }
});
