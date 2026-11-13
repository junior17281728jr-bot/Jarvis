// 0.13.0: las rutas de la «Fábrica de materias» (solo del administrador; nunca llaman a la IA).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configDePrueba, conServidor } from './ayuda.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { carpetaFuentes, revisarCarpetaFuentes, AJUSTE_FUENTES } from '../src/academia/fuentes.js';
import { leerConfigFabrica, estadoMateria } from '../src/academia/fabrica.js';
import { pedir, DUENO, CLAVE } from './instructor-ia-base.js';
import { escribirFuentes } from './fabrica-base.js';

test('rutas de la fábrica: ver el estado y el plan, pausar, topes, reiniciar, publicar y «mirar ahora»; un alumno no entra', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config });
  try {
    await conServidor(servidor, async base => {
      const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      const adminId = db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
      crearUsuario(db, { nombre: 'zoelia', claveHash: await hashClave(CLAVE), debeCambiarClave: false, creadoPor: adminId });
      const alumno = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'zoelia', clave: CLAVE } })).galleta;
      let r = await pedir(base, 'GET', '/api/admin/academia/fabrica', { galleta: admin });
      assert.equal(r.codigo, 200);
      assert.equal(r.datos.estado, 'sin_fuentes');
      escribirFuentes(config, { conOral: true });
      guardarAjuste(db, AJUSTE_FUENTES, JSON.stringify(revisarCarpetaFuentes(carpetaFuentes(config))));
      r = await pedir(base, 'GET', '/api/admin/academia/fabrica', { galleta: admin });
      assert.equal(r.datos.materias.length, 1);
      assert.equal(r.datos.materias[0].estado, 'pendiente');
      assert.ok(r.datos.materias[0].faltan.length === 1 && r.datos.materias[0].etaMs > 0, 'lo que falta y el tiempo estimado');
      assert.equal(r.datos.oral.hay, true);
      assert.equal(r.datos.oral.activa, false);
      assert.equal((await pedir(base, 'GET', '/api/admin/academia/fabrica', { galleta: alumno })).codigo, 403);
      assert.equal((await pedir(base, 'POST', '/api/admin/academia/fabrica/pausa', { galleta: alumno, datos: { pausada: true } })).codigo, 403);
      r = await pedir(base, 'POST', '/api/admin/academia/fabrica/pausa', { galleta: admin, datos: { pausada: true } });
      assert.equal(r.datos.config.pausada, true);
      assert.equal((await pedir(base, 'GET', '/api/admin/academia/fabrica', { galleta: admin })).datos.estado, 'pausada');
      r = await pedir(base, 'POST', '/api/admin/academia/fabrica/config', { galleta: admin, cabeceras: DUENO, datos: { topeUsd: '25', mejora: { activa: false, topeUsd: '3,50' } } });
      assert.equal(r.codigo, 200, JSON.stringify(r.datos));
      assert.equal(leerConfigFabrica(db).topeMicro, 25_000_000);
      assert.equal(leerConfigFabrica(db).mejora.topeMesMicro, 3_500_000);
      assert.equal(leerConfigFabrica(db).mejora.activa, false);
      assert.equal((await pedir(base, 'POST', '/api/admin/academia/fabrica/config', { galleta: admin, cabeceras: DUENO, datos: { topeUsd: '500' } })).datos.error, 'tope_no_valido');
      assert.equal((await pedir(base, 'POST', '/api/admin/academia/fabrica/sistemas/publicar', { galleta: admin, cabeceras: DUENO, datos: {} })).codigo, 409);
      assert.equal((await pedir(base, 'POST', '/api/admin/academia/fabrica/sistemas/reiniciar', { galleta: admin, datos: {} })).codigo, 200);
      assert.equal(estadoMateria(db, 'sistemas').gen, 2);
      assert.equal((await pedir(base, 'POST', '/api/admin/academia/fabrica/cocina/reiniciar', { galleta: admin, datos: {} })).codigo, 404);
      r = await pedir(base, 'GET', '/api/admin/academia/fabrica/sistemas/informe', { galleta: admin });
      assert.equal(r.datos.materia, 'sistemas');
      r = await pedir(base, 'POST', '/api/admin/academia/fabrica/ahora', { galleta: admin, datos: {} });
      assert.equal(r.codigo, 200);
      assert.ok(db.prepare("SELECT 1 FROM tareas WHERE tipo = 'academia.fabrica'").get());
      assert.ok(db.prepare("SELECT 1 FROM auditoria WHERE accion = 'fabrica_config'").get());
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n, 0, 'las rutas nunca llaman a la IA');
    });
  } finally { db.close(); }
});
