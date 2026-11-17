// 0.14.18: Administrador → Alumnos en orden de actividad (en línea, después lo más reciente; nunca entró al final).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarPorActividad } from '../public/admin-alumnos.js';

test('la lista de alumnos: en línea primero, después la entrada más reciente, los que nunca entraron al final', () => {
  const lista = [
    { nombre: 'miguel', ultimaActividad: null },
    { nombre: 'jhon', ultimaActividad: '2026-11-12T10:00:00Z' },
    { nombre: 'albert', ultimaActividad: '2026-11-17T01:00:00Z' },
    { nombre: 'junior', enLinea: true, ultimaActividad: '2026-11-17T17:00:00Z' },
    { nombre: 'ana', ultimaActividad: null },
    { nombre: 'ozuna', ultimaActividad: '2026-11-16T22:00:00Z' },
  ];
  assert.deepEqual(ordenarPorActividad(lista).map(a => a.nombre), ['junior', 'albert', 'ozuna', 'jhon', 'ana', 'miguel']);
  assert.equal(lista[0].nombre, 'miguel', 'no cambia la lista que llega');
  assert.deepEqual(ordenarPorActividad(undefined), []);
});
