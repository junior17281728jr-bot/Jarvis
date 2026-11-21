// 0.14.94: la guarda de lo que reescribe la IA de la fábrica (src/academia/guarda-reescritura.js) y «Ver y deshacer» una
// tarjeta (src/academia/tarjeta-historial.js). En producción se vio «3 millones» por «3 millas» y «la visibilidad de vuelo
// mía» por «mínima»: una reescritura así nunca se publica, y el administrador puede volver una tarjeta a como estaba.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { carpetaAcademia, leerAjuste, leerEnUso } from '../src/academia/paquetes.js';
import { estadoMateria } from '../src/academia/fabrica.js';
import { anotarEvidenciaTarjeta, SEMANA_MS } from '../src/academia/fabrica-mejora.js';
import { leerCambios } from '../src/academia/cambios-ia.js';
import { revisarReescritura } from '../src/academia/guarda-reescritura.js';
import { historialTema, revertirTarjeta } from '../src/academia/tarjeta-historial.js';
import { conFabrica } from './fabrica-base.js';

// La tarjeta real de la materia 4 (v7), con su tabla.
const MINIMOS = {
  tipo: 'tarjeta', titulo: 'Mínimos VFR: la tabla',
  puntos: ['Los mínimos VFR (VFR weather minimums) son la visibilidad de vuelo mínima y la distancia mínima a las nubes. Son mínimos legales: puedes fijarte unos personales más altos.',
    'Clase B: 3 millas y libre de nubes.', 'Clases C, D y E bajo 10,000 MSL: 3 millas; 500 pies debajo, 1,000 encima, 2,000 de lado.',
    'Sobre 1,200 AGL y a 10,000 MSL o más (controlado o no): 5 millas; 1,000 debajo, 1,000 encima, 1 milla de lado.'],
  visual: { tipo: 'diagrama-tabla', parametros: { titulo: 'Mínimos VFR (visibilidad y nubes)', columnas: ['Dónde', 'Visibilidad', 'Nubes'], filas: [['Clase B', '3 millas', 'libre de nubes'], ['C, D, E bajo 10,000 MSL', '3 millas', '500 abajo, 1,000 arriba, 2,000 al lado'], ['Sobre 1,200 AGL y desde 10,000 MSL', '5 millas', '1,000 abajo, 1,000 arriba, 1 milla al lado'], ['G de día, hasta 1,200 AGL', '1 milla', 'libre de nubes']] } },
};
const copia = x => JSON.parse(JSON.stringify(x));
const cambiar = (x, de, a) => JSON.parse(JSON.stringify(x).replaceAll(de, a));

test('0.14.94: «3 millas» → «3 millones» (y «1 milla» → «1 millón») se rechaza', () => {
  const malo = cambiar(cambiar(MINIMOS, 'millas', 'millones'), '1 milla', '1 millón');
  const r = revisarReescritura(MINIMOS, malo);
  assert.equal(r.ok, false);
  assert.ok(r.motivos.includes('unidad_cambiada:3 milla'), r.motivos.join(' '));
  assert.ok(r.motivos.includes('palabra_sospechosa:millones'), r.motivos.join(' '));
  // Solo en la tabla también: el dibujo cuenta como texto de la tarjeta.
  const soloTabla = copia(MINIMOS);
  soloTabla.visual.parametros.filas[0][1] = '3 millones';
  assert.equal(revisarReescritura(MINIMOS, soloTabla).ok, false);
});

test('0.14.94: «mínima / mínima / mínimos» → «mía / mía / míos» se rechaza', () => {
  const malo = copia(MINIMOS);
  malo.puntos[0] = 'Los mínimos VFR (VFR weather minimums) son la visibilidad de vuelo mía y la distancia mía a las nubes. Son míos legales: puedes fijarte unos personales más altos.';
  const r = revisarReescritura(MINIMOS, malo);
  assert.equal(r.ok, false);
  assert.ok(r.motivos.includes('palabra_clave_perdida:mínima'), r.motivos.join(' '));
  assert.ok(r.motivos.includes('palabra_sospechosa:mía'), r.motivos.join(' '));
});

test('0.14.94: una reescritura que solo cambia las palabras pasa; un número nuevo o uno que falta, no', () => {
  const bien = copia(MINIMOS);
  bien.puntos[0] = 'Los mínimos VFR (VFR weather minimums) son dos cosas: la visibilidad de vuelo mínima y la distancia mínima a las nubes. Son mínimos legales; los tuyos pueden ser más altos.';
  bien.puntos[1] = 'En la clase B: 3 millas, libre de nubes.';
  assert.deepEqual(revisarReescritura(MINIMOS, bien), { ok: true, motivos: [] });
  const nuevo = copia(MINIMOS);
  nuevo.puntos.push('Y de noche, 4 millas.');
  assert.ok(revisarReescritura(MINIMOS, nuevo).motivos.includes('numero_nuevo:4'));
  // El mismo número si está en el libro (la base) sí puede aparecer.
  assert.ok(!revisarReescritura(MINIMOS, nuevo, { base: 'De noche, 4 millas.' }).motivos.includes('numero_nuevo:4'));
  const falta = copia(MINIMOS);
  falta.puntos.pop();
  falta.visual.parametros.filas.pop();
  falta.visual.parametros.filas.pop();
  assert.ok(revisarReescritura(MINIMOS, falta).motivos.includes('numero_quitado:5'));
  // «10,000» y «10000» son el mismo número; «millas» en mayúscula al empezar sigue siendo «millas».
  assert.ok(revisarReescritura('Bajo 10,000 MSL: 3 millas.', 'Millas: 3 bajo 10000 MSL (3 millas).').ok);
  // «MHz», «nudos» y «pies» también son unidades.
  assert.equal(revisarReescritura('Llama en 122.8 MHz a 90 nudos y 1,000 pies.', 'Llama en 122.8 millones a 90 nudos y 1,000 pies.').ok, false);
});

function alumnos(db, admin, n) {
  return Array.from({ length: n }, (_, i) => crearUsuario(db, { nombre: `alumno${i}`, claveHash: 'x', creadoPor: admin }));
}
const paqueteDe = (db, config, id) => JSON.parse(readFileSync(join(carpetaAcademia(config), 'paquetes', db.prepare('SELECT carpeta FROM academia_paquetes WHERE id = ?').get(id).carpeta, 'paquete.json'), 'utf8'));
const helice = (db, config, id) => paqueteDe(db, config, id).materias.find(m => m.id === 'sistemas').temas.find(t => t.id === 't01-motor').secciones.find(s => /hélice/.test(s.titulo));

test('0.14.94: la «Mejora continua» NO publica una tarjeta con «2400 millones» (queda la de antes y se anota)', async () => {
  const mejoraTarjeta = t => cambiar(t, '2400 rpm', '2400 millones');
  await conFabrica(async ({ db, config, correr, admin, avanzar }) => {
    await correr();
    const v1 = estadoMateria(db, 'sistemas').version;
    for (const u of alumnos(db, admin, 3)) anotarEvidenciaTarjeta(db, { materia: 'sistemas', tema: 't01-motor', titulo: 'La hélice', usuarioId: u });
    avanzar(SEMANA_MS + 1000);
    const r = await correr();
    assert.equal(r.at(-1).resultado.mejora, 'nada_valido', JSON.stringify(r.at(-1)));
    const ultima = JSON.parse(leerAjuste(db, 'fabrica.mejora.ultima'));
    assert.equal(ultima.mejorados.length, 0);
    assert.match(ultima.rechazados[0].problema, /^reescritura_rechazada:.*unidad_cambiada:2400 rpm/);
    assert.equal(ultima.version, null, 'ninguna versión nueva');
    assert.ok(leerEnUso(db).some(e => e.id === v1), 'sigue en uso la de antes');
    assert.doesNotMatch(JSON.stringify(helice(db, config, v1)), /millones/);
    assert.ok(leerCambios(db).some(c => c.que === 'reescritura_rechazada' && c.tema === 't01-motor'));
  }, { mejoraTarjeta });
});

test('0.14.94: «Ver y deshacer»: el historial de la tarjeta reescrita y volver a como estaba (versión nueva, nada se borra)', async () => {
  await conFabrica(async ({ db, config, correr, admin, avanzar }) => {
    await correr();
    const v1 = estadoMateria(db, 'sistemas').version;
    for (const u of alumnos(db, admin, 3)) anotarEvidenciaTarjeta(db, { materia: 'sistemas', tema: 't01-motor', titulo: 'La hélice', usuarioId: u });
    avanzar(SEMANA_MS + 1000);
    const r = await correr();
    assert.equal(r.at(-1).resultado.mejora, 'publicada', JSON.stringify(r.at(-1)));
    const v2 = JSON.parse(leerAjuste(db, 'fabrica.mejora.ultima')).version;
    const antes = helice(db, config, v1);
    assert.notDeepEqual(helice(db, config, v2), antes, 'la mejora cambió la tarjeta');
    const h = historialTema(db, config, { materia: 'sistemas', tema: 't01-motor' });
    assert.equal(h.actual.version, v2);
    const x = h.tarjetas.find(y => /hélice/.test(y.titulo));
    assert.ok(x, JSON.stringify(h));
    assert.equal(x.antes[0].version, v1);
    assert.match(x.antes[0].texto, /2400 rpm/);
    const vuelta = await revertirTarjeta(db, config, { materia: 'sistemas', tema: 't01-motor', n: x.n, version: v1, usuarioId: admin });
    assert.equal(vuelta.publicada, true);
    assert.ok(vuelta.version > v2);
    assert.deepEqual(helice(db, config, vuelta.version), antes, 'la tarjeta volvió a como estaba');
    assert.ok(leerEnUso(db).some(e => e.id === vuelta.version));
    // Nada se borró: las dos versiones de antes siguen ahí, con su contenido.
    assert.deepEqual(helice(db, config, v1), antes);
    assert.ok(helice(db, config, v2));
    assert.ok(leerCambios(db).some(c => c.que === 'tarjeta_revertida' && c.version === vuelta.version));
    // Ahora el historial muestra la reescrita como «antes» (se puede volver a ella también).
    assert.ok(historialTema(db, config, { materia: 'sistemas', tema: 't01-motor' }).tarjetas.find(y => y.n === x.n).antes.some(v => v.version === v2));
    // Datos raros: 400; algo que no existe: 404.
    await assert.rejects(revertirTarjeta(db, config, { materia: 'sistemas', tema: '../x', n: 1, version: v1 }), e => e.codigo === 400 || e.estado === 400 || /datos_no_validos/.test(e.message));
    await assert.rejects(revertirTarjeta(db, config, { materia: 'sistemas', tema: 't01-motor', n: 1, version: 99999 }), /no_existe/);
  });
});
