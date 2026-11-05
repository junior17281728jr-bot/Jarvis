// Ronda 5 de revisión: el permiso de IA de cada cuenta se mira AL GASTAR (src/cuentas/confianza.js). Aquí, sin servidor:
// lo que hace la versión anterior del código (0.3.2, si el actualizador vuelve atrás) sobre una base ya en la 5 nunca
// deja una cuenta con permiso, y lo único que da permiso es una fila confiable con la huella de ahora.
// Nunca una API de verdad ni una clave de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T0, preparar, permitirIa } from './ia-base.js';
import { crearUsuario, guardarClave, ponerActivo } from '../src/cuentas/usuarios.js';
import { cambiarPlan, espacioPropio } from '../src/cuentas/planes.js';
import { anotarConfianza, cuentaConfirmada, espacioConfirmado, seguirConfianza, estadoConfianza, resumenConfianza } from '../src/cuentas/confianza.js';
import { reservar, disponibilidad } from '../src/ia/presupuesto.js';

const pedirReserva = (b, espacioId, ahora = T0) => reservar(b.db, { config: b.config, proposito: 'interpretar', espacioId, entradaMax: 4000, ahora });

test('ronda 5: una cuenta sin fila confiable (creada antes, o por la versión anterior) no gasta, aunque su plan tenga tope', () => {
  const b = preparar({ planes: { prueba: 1_000_000, pago: 1_000_000 }, permitirOtro: false });
  try {
    const { db } = b;
    assert.equal(cuentaConfirmada(db, b.otro), false);
    assert.deepEqual(estadoConfianza(db, b.otro), { permitida: false, ultimo: null });
    const r = pedirReserva(b, b.espacioOtro);
    assert.deepEqual([r.ok, r.motivo, r.ambito], [false, 'cuenta_sin_permiso', `e${b.espacioOtro}`]);
    assert.equal(disponibilidad(db, { config: b.config, espacioId: b.espacioOtro, proposito: 'interpretar', entradaMax: 4000, ahora: T0 }).motivo, 'cuenta_sin_permiso');
    // Una fila desde internet tampoco.
    anotarConfianza(db, { usuarioId: b.otro, accion: 'creada', desdeTailnet: false });
    assert.equal(pedirReserva(b, b.espacioOtro).motivo, 'cuenta_sin_permiso');
    // La cuenta del administrador no pasa por aquí (solo usa el tope general).
    assert.equal(pedirReserva(b, b.espacioAdmin).ok, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas WHERE espacio_id = ?').get(b.espacioOtro).n, 0);
  } finally {
    b.db.close();
  }
});

test('ronda 5: lo que haría la 0.3.2 (reiniciar, cambiar el plan, desactivar y activar, sin anotar) quita el permiso', () => {
  const b = preparar({ planes: { prueba: 1_000_000, pago: 1_000_000 } });
  try {
    const { db } = b;
    assert.equal(cuentaConfirmada(db, b.otro), true, 'preparar le da permiso desde Tailscale');
    assert.equal(pedirReserva(b, b.espacioOtro).ok, true);
    const casos = [
      () => guardarClave(db, b.otro, 'otra-huella', { debeCambiarClave: true }),
      () => cambiarPlan(db, { usuario: { id: b.otro, rol: 'usuario' }, plan: 'pago' }),
      () => { ponerActivo(db, b.otro, false); ponerActivo(db, b.otro, true); }, // vuelve igual: la huella también
    ];
    for (const [i, cambio] of casos.entries()) {
      permitirIa(db, b.otro);
      cambio();
      const esperado = i === 2; // desactivar y volver a activar deja todo igual que antes
      assert.equal(cuentaConfirmada(db, b.otro), esperado, `caso ${i}`);
      if (!esperado) assert.equal(estadoConfianza(db, b.otro).ultimo.vigente, false, `caso ${i}`);
    }
    // Una cuenta nueva de la 0.3.2 (sin filas) tampoco.
    const nueva = crearUsuario(db, { nombre: 'titere', claveHash: 'x' });
    assert.equal(espacioConfirmado(db, espacioPropio(db, nueva).id), false);
  } finally {
    b.db.close();
  }
});

test('ronda 5: cambiar SU contraseña sigue el permiso solo si lo tenía; el resumen cuenta solo las cuentas comunes activas', () => {
  const b = preparar({ planes: { prueba: 1_000_000 } });
  try {
    const { db } = b;
    // Tenía permiso: lo sigue teniendo con la contraseña nueva.
    let antes = cuentaConfirmada(db, b.otro);
    guardarClave(db, b.otro, 'nueva-1');
    seguirConfianza(db, { usuarioId: b.otro, teniaPermiso: antes, desdeTailnet: false });
    assert.equal(cuentaConfirmada(db, b.otro), true);
    // Reiniciada desde internet y luego cambiada por quien entró: no lo recupera.
    guardarClave(db, b.otro, 'temporal', { debeCambiarClave: true });
    anotarConfianza(db, { usuarioId: b.otro, accion: 'clave_reiniciada', desdeTailnet: false });
    antes = cuentaConfirmada(db, b.otro);
    guardarClave(db, b.otro, 'del-atacante');
    assert.equal(seguirConfianza(db, { usuarioId: b.otro, teniaPermiso: antes, desdeTailnet: false }), null);
    assert.equal(cuentaConfirmada(db, b.otro), false);
    const otra = crearUsuario(db, { nombre: 'pedro', claveHash: 'x' });
    permitirIa(db, otra);
    const apagada = crearUsuario(db, { nombre: 'luisa', claveHash: 'x' });
    ponerActivo(db, apagada, false);
    assert.deepEqual(resumenConfianza(db), { permitidas: 1, sinPermiso: 1 });
    assert.throws(() => anotarConfianza(db, { usuarioId: b.otro, accion: 'inventada', desdeTailnet: true }), /acción no válida/);
    assert.throws(() => anotarConfianza(db, { usuarioId: 9999, accion: 'permitida', desdeTailnet: true }), /no existe/);
  } finally {
    b.db.close();
  }
});
