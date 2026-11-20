// 0.14.66 (pedido del dueño): en la lista de Alumnos, cada alumno dice en corto si tiene la IA y cuánto le queda.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir } from './instructor-ia-base.js';
import { chipIa } from '../public/admin-alumnos.js';

const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;

test('la lista de Alumnos trae la IA de cada uno: prueba, pausa, regalo y sin IA', async () => {
  await conInstructor(async c => {
    const q = idDe(c, 'quirino');
    const lista = async () => new Map((await pedir(c.base, 'GET', '/api/admin/academia/alumnos', { galleta: c.admin })).datos.alumnos.map(a => [a.nombre, a.ia]));
    let m = await lista();
    assert.deepEqual([m.get('zoelia').activa, m.get('zoelia').por], [true, 'prueba']);
    assert.ok(m.get('zoelia').dias > 0, 'los días que le quedan de prueba');
    // En pausa: no la tiene.
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${q}/pausa`, { galleta: c.admin, datos: { pausada: true } })).codigo, 200);
    m = await lista();
    assert.deepEqual([m.get('quirino').activa, m.get('quirino').pausada], [false, true]);
    // Sin prueba y con 5 usos regalados: «quedan 5 usos».
    await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${q}/pausa`, { galleta: c.admin, datos: { pausada: false } });
    c.db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)").run(`academia.ia.prueba.${q}`, JSON.stringify({ desde: new Date(Date.now() - 10 * 86_400_000).toISOString() }), new Date().toISOString());
    m = await lista();
    assert.equal(m.get('quirino').activa, false, 'se le acabó la prueba');
    await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${q}/regalo`, { galleta: c.admin, datos: { usos: 5 } });
    m = await lista();
    assert.deepEqual([m.get('quirino').activa, m.get('quirino').por, m.get('quirino').quedan], [true, 'minutos', 5]);
  }, { pagos: 'planes' });
});

test('la etiqueta dice lo justo', () => {
  const h = { t: (k, v) => `${k}${v ? JSON.stringify(v) : ''}`, numero: n => String(n), insignia: (tono, texto) => ({ tono, texto }) };
  assert.equal(chipIa(null, h), null);
  assert.deepEqual(chipIa({ activa: true, por: 'plan', quedan: 3, usos: 30, permiso: true }, h), { tono: 'bien', texto: 'alumnos.ia.plan{"n":"3","de":"30"}' });
  assert.equal(chipIa({ activa: false, pausada: true, permiso: true }, h).texto, 'alumnos.ia.pausada');
  assert.equal(chipIa({ activa: false, permiso: false }, h).texto, 'alumnos.ia.sin_permiso');
  assert.equal(chipIa({ activa: false, permiso: true }, h).texto, 'alumnos.ia.no');
  assert.equal(chipIa({ activa: true, por: 'prueba', dias: 4, permiso: true }, h).texto, 'alumnos.ia.prueba{"dias":"4"}');
});
