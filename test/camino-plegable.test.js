// Academia 0.9.1: el camino con las materias plegables (public/camino-plegable.js). Al entrar solo está abierta la
// materia actual; lo que la persona abrió o cerró antes manda; las materias «Pronto» (sin temas) no se pliegan.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abiertasAlEntrar, leerAbiertas } from '../public/camino-plegable.js';

const materias = [
  { id: 'm1', estado: 'aprobada', temas: [{}] },
  { id: 'm2', estado: 'abierta', temas: [{}, {}] },
  { id: 'm3', estado: 'bloqueada', temas: [{}] },
  { id: 'm4', estado: 'vacia', temas: [] },
];

test('al entrar solo está abierta la materia actual (la del paso que toca, o la primera en curso)', () => {
  assert.deepEqual([...abiertasAlEntrar(materias, { tipo: 'tema', materia: 'm2', tema: 'x' })], ['m2']);
  assert.deepEqual([...abiertasAlEntrar(materias, null)], ['m2']);
  assert.deepEqual([...abiertasAlEntrar(materias.map(m => ({ ...m, estado: m.estado === 'abierta' ? 'aprobada' : m.estado })), null)], []);
});

test('lo que la persona abrió o cerró se respeta; una materia sin temas nunca se abre', () => {
  assert.deepEqual([...abiertasAlEntrar(materias, { materia: 'm2' }, { m2: false, m3: true, m4: true })], ['m3']);
  assert.deepEqual([...abiertasAlEntrar(materias, { materia: 'm2' }, { m1: true })].sort(), ['m1', 'm2']);
  // Sin navegador (o sin almacenamiento) no se recuerda nada y no falla.
  assert.deepEqual(leerAbiertas(7), {});
});
