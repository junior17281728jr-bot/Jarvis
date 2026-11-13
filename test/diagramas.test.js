// 0.13.0: los dibujos con datos de la fábrica (src/academia/diagramas.js revisa; public/clase/diagramas.js dibuja), con un
// documento de mentira (sin navegador).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisarDiagrama, tarjetaConVisual, TIPOS_DIAGRAMA } from '../src/academia/diagramas.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { paqueteMuestra } from './academia-muestra.js';

function nodo(etiqueta) {
  return {
    etiqueta, atributos: {}, hijos: [], textContent: '', padre: null,
    setAttribute(k, v) { this.atributos[k] = v; },
    appendChild(h) { h.padre = this; this.hijos.push(h); return h; },
    remove() { if (this.padre) this.padre.hijos = this.padre.hijos.filter(x => x !== this); },
  };
}
globalThis.document = { createElement: nodo, createElementNS: (_, e) => nodo(e) };
const textos = n => [n.textContent, ...n.hijos.flatMap(textos)].filter(Boolean);
const { VISUALES_DIAGRAMA } = await import('../public/clase/diagramas.js');
const { VISUALES } = await import('../public/clase/visuales.js');

const EJEMPLOS = {
  'diagrama-partes': { titulo: 'El ojo', elementos: [{ nombre: 'Córnea', detalle: 'la ventana' }, { nombre: 'Retina' }] },
  'diagrama-tabla': { columnas: ['Luz', 'Lado'], filas: [['Roja', 'Izquierda'], ['Verde', 'Derecha']] },
  'diagrama-pasos': { elementos: [{ nombre: 'Detectar' }, { nombre: 'Decidir' }, { nombre: 'Actuar' }] },
  'diagrama-escala': { unidad: 'ft', elementos: [{ nombre: 'Sin oxígeno', valor: 12500 }, { nombre: 'Tripulación', valor: 14000 }] },
  'diagrama-capas': { unidad: 'ft', elementos: [{ nombre: 'Clase G', valor: 0, hasta: 1200 }, { nombre: 'Clase E', valor: 1200, hasta: 18000 }] },
  'diagrama-linea': { elementos: [{ nombre: '8 h antes', detalle: 'nada de alcohol' }, { nombre: 'Al despegar', detalle: 'menos de 0,04 %' }] },
  calculo: { problema: 'Viento de 20 kt a 30°', formula: 'componente = viento × sen(ángulo)', elementos: [{ nombre: 'sen 30°', detalle: '0,5' }, { nombre: '20 × 0,5', detalle: '10 kt' }], resultado: '10 kt de viento cruzado' },
};

test('cada dibujo con datos se revisa y se dibuja con sus textos (sin HTML ni estilos incrustados)', () => {
  assert.deepEqual(Object.keys(VISUALES_DIAGRAMA).sort(), [...TIPOS_DIAGRAMA].sort());
  for (const tipo of TIPOS_DIAGRAMA) {
    assert.deepEqual(revisarDiagrama(tipo, EJEMPLOS[tipo]), [], tipo);
    assert.equal(typeof VISUALES[tipo], 'function', `${tipo} está en el registro de visuales.js`);
    const raiz = nodo('div');
    const v = VISUALES[tipo](raiz, EJEMPLOS[tipo], { modo: 'interactivo' });
    const dichos = textos(raiz).join(' | ');
    for (const e of EJEMPLOS[tipo].elementos ?? []) assert.ok(dichos.includes(e.nombre), `${tipo}: ${e.nombre}`);
    for (const c of EJEMPLOS[tipo].columnas ?? []) assert.ok(dichos.includes(c));
    if (EJEMPLOS[tipo].resultado) assert.ok(dichos.includes(EJEMPLOS[tipo].resultado));
    assert.ok(!JSON.stringify(raiz.hijos[0].atributos).includes('style'));
    v.destruir();
    assert.equal(raiz.hijos.length, 0);
  }
});

test('los datos mal llenados se rechazan: en la revisión del paquete y en la fábrica (cada tarjeta con algo que se vea)', () => {
  assert.ok(revisarDiagrama('diagrama-tabla', { columnas: ['a', 'b'], filas: [['solo uno']] }).includes('filas'));
  assert.ok(revisarDiagrama('diagrama-escala', { elementos: [{ nombre: 'a', valor: 5 }, { nombre: 'b', valor: 1 }] }).includes('orden'));
  assert.ok(revisarDiagrama('diagrama-capas', { elementos: [{ nombre: 'a', valor: 5, hasta: 1 }] }).length);
  assert.ok(revisarDiagrama('calculo', { elementos: [{ nombre: 'x', detalle: '1' }] }).includes('formula'));
  assert.deepEqual(revisarDiagrama('ala', { cualquier: 1 }), [], 'los dibujos de antes no cambian');
  const p = paqueteMuestra();
  p.materias[0].temas[0].secciones[0] = { ...p.materias[0].temas[0].secciones[0], tipo: 'tarjeta', puntos: ['x'], visual: { tipo: 'diagrama-pasos', parametros: { elementos: [{ nombre: 'solo uno' }] } } };
  const r = revisarPaquete(p);
  assert.equal(r.ok, false);
  assert.ok(r.errores.some(e => e.motivo === 'diagrama_no_valido'));
  assert.equal(tarjetaConVisual({ titulo: 'x', puntos: ['a'] }), false, 'sin dibujo ni foto: no');
  assert.equal(tarjetaConVisual({ solo_texto: 'corto' }), false);
  assert.equal(tarjetaConVisual({ solo_texto: 'Es una regla sin nada que dibujar.' }), true);
  assert.equal(tarjetaConVisual({ visual: { tipo: 'diagrama-pasos', parametros: EJEMPLOS['diagrama-pasos'] } }), true);
  assert.equal(tarjetaConVisual({ imagen: { archivo: 'img-x.webp' } }), true);
});
