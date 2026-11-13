// 0.13.9: la tarjeta «Claude (IA)» del Resumen de Administrador (public/ia-vista.js: estadoClaude) y el aviso de
// Anthropic «Identity verification is required» → «Esperando verificación de identidad». Sin red y con reloj fijo.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoClaude } from '../public/ia-vista.js';
import { anthropic } from '../src/ia/proveedores/anthropic.js';
import { MOTIVOS } from '../src/ia/propositos.js';
import { POLITICA } from '../src/ia/politica.js';
import { secretoUsable, PRUEBAS_QUE_INUTILIZAN } from '../src/claves/almacen.js';
import { ESQUEMA_CIFRADO } from '../src/claves/cifrado.js';

const AHORA = Date.parse('2026-11-13T15:00:00Z');
const claves = activa => ({ grupos: [{ grupo: 'avisos', usos: [{ uso: 'telegram_bot', activa: { id: 9, final: 'zzzz', prueba: 'ok' } }] }, { grupo: 'ia', usos: [{ uso: 'ia_anthropic', activa }, { uso: 'ia_openai', activa: null }] }] });
const ia = { encendida: true, usadoMicro: 1_250_000, topeGeneralMicro: 100_000_000 };

test('la tarjeta de Claude: cada estado en palabras simples', () => {
  assert.equal(estadoClaude({ claves: null, ia }, AHORA).estado, 'sin_acceso', 'sin la cuenta del dueño no se ven las claves');
  assert.equal(estadoClaude({ claves: claves(null), ia }, AHORA).estado, 'no_conectado');
  const bien = estadoClaude({ claves: claves({ id: 3, final: 'abcd', prueba: 'ok', legible: true }), ia }, AHORA);
  assert.deepEqual([bien.estado, bien.usadoMicro, bien.topeMicro, bien.final, bien.id, bien.iaEncendida], ['conectado', 1_250_000, 100_000_000, 'abcd', 3, true]);
  assert.equal(estadoClaude({ claves: claves({ id: 3, prueba: 'ok' }), ia: { ...ia, encendida: false } }, AHORA).iaEncendida, false, 'conectada pero con la IA apagada');
  const ver = estadoClaude({ claves: claves({ id: 3, prueba: 'verificacion_identidad' }), ia }, AHORA);
  assert.deepEqual([ver.estado, ver.tono, ver.pausada], ['esperando_verificacion', 'atencion', false]);
  const enPausa = estadoClaude({ claves: claves({ id: 3, prueba: 'ok', pausa: { motivo: 'verificacion_identidad', hasta: null } }), ia }, AHORA);
  assert.deepEqual([enPausa.estado, enPausa.pausada], ['esperando_verificacion', true], 'la pausa por verificación también (y «Probar» la reanuda)');
  assert.equal(estadoClaude({ claves: claves({ id: 3, prueba: 'clave_no_valida' }), ia }, AHORA).estado, 'no_pasa');
  const pausada = estadoClaude({ claves: claves({ id: 3, prueba: 'ok', pausa: { motivo: 'sin_credito', hasta: null } }), ia }, AHORA);
  assert.deepEqual([pausada.estado, pausada.motivo, pausada.pausada], ['pausada', 'sin_credito', true]);
  assert.equal(estadoClaude({ claves: claves({ id: 3, legible: false }), ia }, AHORA).estado, 'ilegible');
});

test('«Identity verification is required» → verificacion_identidad (la prueba gratis y el uso pagado), y la clave no se usa', () => {
  const resp = (status, json, textoCorto = null) => ({ status, json, textoCorto, cabeceras: {} });
  const mensaje = 'Identity verification is required before using the API. Please complete it in the Console.';
  for (const status of [400, 401, 403]) {
    assert.equal(anthropic.leerPrueba(resp(status, { type: 'error', error: { type: 'permission_error', message: mensaje } })), 'verificacion_identidad', `HTTP ${status}`);
  }
  assert.equal(anthropic.leerPrueba(resp(403, null, mensaje)), 'verificacion_identidad', 'también como texto plano');
  assert.equal(anthropic.leer(resp(403, { error: { type: 'permission_error', message: mensaje } })).motivo, 'verificacion_identidad');
  assert.equal(anthropic.leerPrueba(resp(403, { error: { message: 'other permission problem' } })), 'sin_permiso', 'lo demás sigue igual');
  assert.ok(MOTIVOS.includes('verificacion_identidad'));
  assert.equal(POLITICA.verificacion_identidad.prueba, true);
  assert.ok(PRUEBAS_QUE_INUTILIZAN.includes('verificacion_identidad'));
  // Hasta que una prueba pase, la fábrica (y todo lo pagado) no la usa: espera sin gastar.
  assert.deepEqual(secretoUsable({ estado: 'activa', llave_huella: 'h', esquema: ESQUEMA_CIFRADO, prueba: 'verificacion_identidad' }, AHORA, 'h'), { si: false, motivo: 'verificacion_identidad' });
});
