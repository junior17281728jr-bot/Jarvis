// Pruebas de la 0.14.26: los certificados de recuerdo (src/academia/certificados.js, src/api/certificados.js y los textos
// de public/certificado-vista.js). Usa solo el paquete de MUESTRA; sin internet.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from './ayuda.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { paqueteActivo, guardarAjuste } from '../src/academia/paquetes.js';
import { elegirVariante, VARIANTES, REGLAS, FORMATO_CODIGO, nuevoCodigo, limpiarCodigo, certificadosDe, verificarCodigo, tgTerminado, perfilTg } from '../src/academia/certificados.js';
import { partirLineas, clavesTexto, PAPELES } from '../public/certificado-vista.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ES = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const EN = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
const entrar = async (base, nombre) => (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } }));
// Bytes «al azar» fijos: el mismo código cada vez (y uno distinto en cada llamada).
function azarFijo() { let n = 0; return k => { n += 1; return Buffer.from(Array.from({ length: k }, (_, i) => (n * 7 + i * 13) % 256)); }; }

async function conAcademia(fn, { limitesCertificados } = {}) {
  const reloj = { ahora: Date.parse('2026-11-12T15:00:00Z') };
  const config = configDePrueba();
  const db = abrirBase(config);
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { reloj: () => reloj.ahora, limitesCertificados } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const ids = {};
    for (const nombre of ['ana', 'beto']) ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const ana = (await entrar(base, 'ana')).galleta;
    const beto = (await entrar(base, 'beto')).galleta;
    await fn({ base, db, admin: admin.galleta, ana, beto, ids, reloj, config });
  });
  db.close();
}
// Un intento terminado, escrito directo en la base (como si lo hubiera hecho en la app).
function intento(db, usuarioId, { tipo = 'examen', materia, aprobado = 1, en = '2026-11-10T15:00:00Z', empezado = en, total = 10, aciertos = 9 }) {
  db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, umbral, aprobado, empezado_en, terminado_en)
    VALUES (?, ?, ?, NULL, ?, ?, ?, 70, ?, ?, ?)`).run(usuarioId, tipo, materia, total, total, aciertos, aprobado, empezado, en);
}
const materiasConClases = (db, config) => paqueteActivo(db, config).materias.filter(m => m.temas.length).map(m => m.id);

test('la variante del texto sale de reglas fijas, en su orden (la primera que se cumple gana)', () => {
  const base = { respuestas: 100, bien: 80, nocturnas: 0, examenesReprobados: 1, temasReprobados: 0, repasos: 0, materias: 4, convalidadas: 0, dias: 30 };
  const casos = [
    [{}, 'convalidado', { convalidadas: 2 }], // la mitad de las materias, directo al examen
    [{}, 'tesonero', { examenesReprobados: 3, temasReprobados: 1 }],
    [{}, 'tesonero', { bien: 60 }], // menos del 65 %
    [{}, 'estrella', { examenesReprobados: 0, bien: 92 }],
    [{}, 'rapido', { dias: 9 }],
    [{}, 'disciplinado', { repasos: 12 }],
    [{}, 'constante', { dias: 75 }],
    [{}, 'constante', { nocturnas: 35 }],
    [{}, 'normal', {}],
    // El orden: convalidado gana aunque también haya fallado mucho; tesonero gana a rápido; estrella gana a rápido.
    [{}, 'convalidado', { convalidadas: 4, examenesReprobados: 9 }],
    [{}, 'tesonero', { examenesReprobados: 5, dias: 3 }],
    [{}, 'estrella', { examenesReprobados: 0, bien: 95, dias: 3 }],
    [{}, 'rapido', { dias: 5, repasos: 40 }],
    [{}, 'disciplinado', { repasos: 20, dias: 90 }],
    // Pocas respuestas: ni «estrella» ni «tesonero» por porcentaje.
    [{}, 'normal', { respuestas: 10, bien: 2, examenesReprobados: 0 }],
  ];
  for (const [, esperada, cambio] of casos) assert.equal(elegirVariante({ ...base, ...cambio }), esperada, JSON.stringify(cambio));
  assert.equal(elegirVariante({}), 'normal');
  assert.equal(elegirVariante({ dias: null, respuestas: 0 }), 'normal');
  assert.equal(VARIANTES.length, 7);
  assert.equal(REGLAS.rapidoDias, 14);
});

test('el código: formato fijo, sin letras que se confunden, y se limpia lo que escribe la persona', () => {
  for (let k = 0; k < 200; k++) {
    const c = nuevoCodigo(k % 2 ? 'tg' : 'oral');
    assert.match(c, FORMATO_CODIGO);
    assert.doesNotMatch(c.slice(6), /[IL01O]/);
  }
  assert.equal(limpiarCodigo(' aa-tg-abcd-efgh '), 'AA-TG-ABCD-EFGH');
  assert.equal(limpiarCodigo('aa-tg-<script>'), 'AA-TG-SCRIPT');
});

test('los 14 textos (7 por curso) existen en los dos idiomas, caben en el papel y no nombran a nadie', () => {
  for (const curso of ['tg', 'oral']) {
    for (const v of VARIANTES) {
      const k = clavesTexto(curso, v);
      for (const [nombre, idioma] of [['es', ES], ['en', EN]]) {
        assert.ok(idioma[k.titular] && idioma[k.cuerpo], `${nombre}: falta ${k.cuerpo}`);
        assert.ok(idioma[k.titular].length <= 60, `${nombre} ${k.titular} es muy largo`);
        const todo = `${idioma[k.cuerpo]} ${idioma['cert.cierre']}`;
        for (const papel of Object.values(PAPELES)) {
          const lineas = partirLineas(todo, Math.floor((papel.ancho - 260) / 7.6));
          assert.ok(lineas.length <= 8, `${nombre} ${k.cuerpo}: ${lineas.length} líneas en ${papel.ancho}`);
        }
        assert.doesNotMatch(todo, /claude|anthropic|openai|chatgpt|\bgpt|gemini/i, `${nombre} ${k.cuerpo}: nombra a una empresa`);
        if (nombre === 'es') assert.doesNotMatch(`${idioma[k.titular]} ${todo}`, /\bhombre|\blisto\b|\blista\b/i, `${k.cuerpo}: debe ser para cualquiera`);
      }
    }
    // Los del oral no son los mismos que los del Test Guide.
    for (const v of VARIANTES) assert.notEqual(ES[`cert.oral.${v}.texto`], ES[`cert.tg.${v}.texto`]);
  }
  assert.equal(ES['cert.aviso'], 'Este certificado es únicamente de recuerdo. No tiene validez oficial ni sustituye una licencia o formación aeronáutica.');
  assert.equal(ES['cert.academia'], 'Academia de Aviación');
  assert.deepEqual(partirLineas('uno dos tres cuatro', 9), ['uno dos', 'tres', 'cuatro']);
  assert.deepEqual(partirLineas('abcdefghijkl', 5), ['abcde', 'fghij', 'kl']);
});

test('certificado del Test Guide: solo al terminar, una vez, con su nombre, verificable y el administrador lo ve', async () => {
  await conAcademia(async ({ base, db, config, admin, ana, beto, ids, reloj }) => {
    assert.equal((await pedir(base, 'GET', '/api/academia/certificados')).codigo, 401);
    let r = (await pedir(base, 'GET', '/api/academia/certificados', { galleta: ana })).datos;
    const tg = () => r.cursos.find(c => c.curso === 'tg');
    const materias = materiasConClases(db, config);
    assert.ok(materias.length >= 1);
    assert.deepEqual([tg().disponible, tg().avance], [false, { hechos: 0, total: materias.length }]);
    assert.equal(r.cursos.find(c => c.curso === 'oral').disponible, false);
    // Reprueba unas veces y después aprueba todo (sus fechas: la última aprobada es la fecha del certificado).
    for (let k = 0; k < 4; k++) intento(db, ids.ana, { materia: materias[0], aprobado: 0, en: '2026-11-01T15:00:00Z', aciertos: 3 });
    materias.forEach((m, i) => intento(db, ids.ana, { materia: m, en: `2026-11-0${2 + i}T15:00:00Z` }));
    r = (await pedir(base, 'GET', '/api/academia/certificados', { galleta: ana })).datos;
    assert.equal(tg().disponible, true);
    assert.match(tg().codigo, FORMATO_CODIGO);
    assert.match(tg().codigo, /^AA-TG-/);
    assert.equal(tg().fecha, `2026-11-0${1 + materias.length}T15:00:00Z`);
    assert.equal(tg().variante, 'tesonero');
    assert.equal(tg().numero, 1);
    assert.equal(r.nombre, 'ana', 'sin perfil ni nombre legal: su usuario');
    const codigo = tg().codigo;
    // Siempre el mismo (aunque después cambie lo que hizo: el certificado ya se dio).
    reloj.ahora += 86_400_000;
    db.prepare("UPDATE academia_intentos SET aprobado = 0 WHERE usuario_id = ? AND tipo = 'examen'").run(ids.ana);
    r = (await pedir(base, 'GET', '/api/academia/certificados', { galleta: ana })).datos;
    assert.deepEqual([tg().disponible, tg().codigo, tg().variante], [true, codigo, 'tesonero']);
    // El nombre: el de su perfil (nombre para mostrar); si está vacío, su nombre legal; y si no, su usuario.
    // Con el nombre legal y sin personalizar el perfil (nombre_visible = su usuario): el legal.
    guardarAjuste(db, `cuenta.nombre_legal.${ids.ana}`, JSON.stringify({ nombre: 'Ana María', apellido: 'Rodríguez' }));
    assert.equal((await pedir(base, 'GET', '/api/academia/certificados', { galleta: ana })).datos.nombre, 'Ana María Rodríguez');
    db.prepare('UPDATE usuarios SET nombre_visible = ? WHERE id = ?').run('Ana Piloto', ids.ana);
    assert.equal((await pedir(base, 'GET', '/api/academia/certificados', { galleta: ana })).datos.nombre, 'Ana Piloto');
    db.prepare("UPDATE usuarios SET nombre_visible = '' WHERE id = ?").run(ids.ana);
    guardarAjuste(db, `cuenta.nombre_legal.${ids.ana}`, JSON.stringify({ nombre: 'Ana María', apellido: 'Rodríguez' }));
    assert.equal((await pedir(base, 'GET', '/api/academia/certificados', { galleta: ana })).datos.nombre, 'Ana María Rodríguez');
    db.prepare('UPDATE usuarios SET nombre_visible = ? WHERE id = ?').run('Ana Piloto', ids.ana);
    // Beto no tiene, y nunca ve el de Ana por su ruta.
    assert.equal((await pedir(base, 'GET', '/api/academia/certificados', { galleta: beto })).datos.cursos[0].disponible, false);
    // Verificar: cualquier persona con cuenta; sin cuenta, 401. Un código inventado no vale.
    assert.equal((await pedir(base, 'GET', `/api/certificados/verificar/${codigo}`)).codigo, 401);
    const v = (await pedir(base, 'GET', `/api/certificados/verificar/${encodeURIComponent(codigo.toLowerCase())}`, { galleta: beto })).datos;
    assert.deepEqual(v, { valido: true, codigo, curso: 'tg', nombre: 'Ana Piloto', fecha: tg().fecha });
    assert.equal((await pedir(base, 'GET', '/api/certificados/verificar/AA-TG-ZZZZ-ZZZZ', { galleta: beto })).datos.valido, false);
    assert.equal((await pedir(base, 'GET', '/api/certificados/verificar/nada', { galleta: beto })).datos.valido, false);
    // El administrador: el de cualquier alumno (el mismo código); los alumnos, 403; sin sesión, 401; quien no existe, 404.
    const ruta = `/api/admin/academia/alumnos/${ids.ana}/certificados`;
    assert.equal((await pedir(base, 'GET', ruta)).codigo, 401);
    assert.equal((await pedir(base, 'GET', ruta, { galleta: beto })).codigo, 403);
    const a = (await pedir(base, 'GET', ruta, { galleta: admin })).datos;
    assert.deepEqual([a.alumnoId, a.nombre, a.cursos[0].codigo], [ids.ana, 'Ana Piloto', codigo]);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/alumnos/99999/certificados', { galleta: admin })).codigo, 404);
    // Se guardó en «ajustes» (entra en las copias de cada noche).
    assert.ok(db.prepare("SELECT 1 FROM ajustes WHERE clave = ?").get(`academia.certificado_codigo.${codigo}`));
  });
});

test('verificar tiene tope por hora', async () => {
  await conAcademia(async ({ base, beto }) => {
    for (let k = 0; k < 3; k++) assert.equal((await pedir(base, 'GET', '/api/certificados/verificar/AA-TG-AAAA-AAAA', { galleta: beto })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/certificados/verificar/AA-TG-AAAA-AAAA', { galleta: beto })).codigo, 429);
  }, { limitesCertificados: { verificar: new Limitador({ maximo: 3, ventanaMs: 3600_000 }) } });
});

test('el perfil del Test Guide: directo al examen = «ya lo sabías todo»; rápido; de noche', async () => {
  await conAcademia(async ({ db, config, ids }) => {
    const materias = materiasConClases(db, config);
    const p = paqueteActivo(db, config);
    // Aprobó el examen directo en todas: «Convalidadas por examen» (0.14.19, src/academia/saltos.js).
    guardarAjuste(db, `academia.convalidadas.${ids.beto}`, JSON.stringify(Object.fromEntries(materias.map(m => [m, { intento: 1, pct: 95, umbral: 90, en: '2026-11-10T15:00:00Z' }]))));
    materias.forEach(m => intento(db, ids.beto, { materia: m }));
    const c = certificadosDe(db, ids.beto, p, { ahoraMs: Date.parse('2026-11-12T15:00:00Z'), azar: azarFijo() });
    assert.equal(c.cursos[0].variante, 'convalidado');
    assert.equal(c.cursos[0].numero, 6);
    assert.equal(tgTerminado({ materias: [{ temas: [1], examen: { aprobado: true } }, { temas: [], examen: null }] }), true);
    assert.equal(tgTerminado({ materias: [{ temas: [1], examen: { aprobado: false } }] }), false);
    assert.equal(tgTerminado({ materias: [] }), false);
    // Las respuestas de noche (hora de RD) cuentan como nocturnas; los días, desde la primera actividad.
    db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, total, aciertos, empezado_en, terminado_en) VALUES (?, 'repaso', ?, 1, 1, '2026-09-01T03:00:00Z', '2026-09-01T03:10:00Z')`).run(ids.ana, materias[0]);
    const intentoId = db.prepare('SELECT MAX(id) AS id FROM academia_intentos').get().id;
    for (const hora of ['2026-09-01T03:00:00Z', '2026-09-01T07:30:00Z', '2026-09-01T16:00:00Z']) {
      db.prepare("INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, elegida, correcta, dia, creada_en) VALUES (?, ?, 'q', ?, 'A', 1, '2026-09-01', ?)").run(intentoId, ids.ana, materias[0], hora);
    }
    const perfil = perfilTg(db, ids.ana, materias, '2026-11-10T00:00:00Z');
    assert.deepEqual([perfil.respuestas, perfil.nocturnas, perfil.repasos, perfil.dias], [3, 2, 1, 69]);
  });
});

test('certificado del oral: con el examen final del oral aprobado (y su texto propio)', async () => {
  await conAcademia(async ({ db, config, ids }) => {
    const p = { ...paqueteActivo(db, config), oral: { materias: [{ id: 'oral_a', temas: [{ id: 't1', preguntas: ['x'] }] }] } };
    const ahoraMs = Date.parse('2026-11-12T15:00:00Z');
    assert.equal(certificadosDe(db, ids.ana, p, { ahoraMs }).cursos[1].disponible, false);
    // Sin oral en el contenido: «no hay».
    assert.equal(certificadosDe(db, ids.ana, { ...p, oral: null }, { ahoraMs }).cursos[1].hay, false);
    guardarAjuste(db, `academia.oral.${ids.ana}`, JSON.stringify({ leidos: [], examenes: { oral_a: { aprobado: true, veces: 1 }, final: { aprobado: true, mejor: 90, veces: 1, en: '2026-11-11T20:00:00.000Z' } } }));
    const o = certificadosDe(db, ids.ana, p, { ahoraMs, azar: azarFijo() }).cursos[1];
    assert.deepEqual([o.curso, o.disponible, o.fecha, o.variante], ['oral', true, '2026-11-11T20:00:00.000Z', 'convalidado']);
    assert.match(o.codigo, /^AA-OR-/);
    assert.equal(verificarCodigo(db, o.codigo).curso, 'oral');
    // El de Beto, reprobando el final 5 veces antes de pasarlo: «no fuiste fácil de enseñar».
    guardarAjuste(db, `academia.oral.${ids.beto}`, JSON.stringify({ examenes: { final: { aprobado: true, veces: 6, en: '2026-11-11T20:00:00.000Z' } } }));
    assert.equal(certificadosDe(db, ids.beto, p, { ahoraMs }).cursos[1].variante, 'tesonero');
    // Capítulos convalidados por su examen (0.14.19): la mitad o más → «ya lo sabías todo».
    const id3 = (await import('../src/cuentas/usuarios.js')).crearUsuario(db, { nombre: 'carla', claveHash: 'x', debeCambiarClave: false });
    guardarAjuste(db, `academia.oral.${id3}`, JSON.stringify({ examenes: { oral_a: { aprobado: true, veces: 1, convalidada: { pct: 90 } }, oral_b: { aprobado: true, veces: 1 }, final: { aprobado: true, veces: 2, en: '2026-11-11T20:00:00.000Z' } } }));
    assert.equal(certificadosDe(db, id3, p, { ahoraMs }).cursos[1].variante, 'convalidado');
  });
});
