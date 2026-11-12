// Academia 0.12.7: los avisos del gasto de la IA para el dueño (en la pantalla y por Telegram).
//  - el tope del mes avisa cada 10 % («IA: llevas el 40 % del límite del mes (US$4.00 de US$10.00) · quedan 18 días»),
//    cada uno una vez por mes; al 100 % dice que la IA quedó en modo básico (y suena);
//  - un resumen corto SOLO de los días con gasto (un día sin gasto no manda nada).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuerpoDeAviso } from '../src/canales/textos.js';
import { vaPorTelegram } from '../src/canales/avisador.js';
import { vigilarIA } from '../src/ia/presupuesto.js';
import { conInstructor, unaMala, explicar, explicacionFalsa, DE } from './instructor-ia-base.js';

const aviso = (clave, nivel, detalle) => ({ clave, nivel, detalle: JSON.stringify(detalle) });

test('el texto de Telegram: el porcentaje, el dinero y los días; al 100 % dice que la IA quedó en modo básico', () => {
  const a = aviso('ia_tope:general:2026-11', 'atencion', { ambito: 'general', umbral: 40, pct: 40, usadoMicro: 4_000_000, topeMicro: 10_000_000, dias: 18 });
  assert.equal(cuerpoDeAviso(a, 'es'), 'IA: llevas el 40 % del límite del mes (US$4.00 de US$10.00) · quedan 18 días.', 'como en la app (es-DO)');
  assert.deepEqual(vaPorTelegram(a), { va: true, suena: false }, 'cada 10 % llega, en silencio');
  const lleno = aviso('ia_tope:general:2026-11', 'grave', { ambito: 'general', umbral: 100, pct: 100, usadoMicro: 10_000_000, topeMicro: 10_000_000, dias: 3 });
  assert.match(cuerpoDeAviso(lleno, 'es'), /100 %.*instructor básico/);
  assert.deepEqual(vaPorTelegram(lleno), { va: true, suena: true });
  assert.match(cuerpoDeAviso(aviso('ia_tope:e5:2026-11', 'atencion', { ambito: 'e5', umbral: 80 }), 'es'), /una cuenta/);
  const r = aviso('ia_resumen:2026-11-11', 'atencion', { usadoMicro: 12_000, n: 3, mesMicro: 4_000_000, topeMicro: 10_000_000, pct: 40, dias: 18 });
  assert.equal(cuerpoDeAviso(r, 'es'), 'IA ayer: US$0.01 en 3 llamadas. En el mes: US$4.00 de US$10.00 (40 %) · quedan 18 días.');
  assert.deepEqual(vaPorTelegram(r), { va: true, suena: false });
  assert.doesNotMatch(cuerpoDeAviso(r, 'en'), /\{/);
});

test('el resumen del día: solo si ese día hubo gasto, uno por día, y sin gasto ninguno', async () => {
  await conInstructor(async c => {
    const x = await unaMala(c, c.z);
    // Una llamada de verdad (al proveedor falso) para que haya gasto hoy.
    const correcta = DE(x.pregunta.id).original.correcta;
    c.falso.siguiente(explicacionFalsa(String(['A', 'B', 'C'].indexOf(correcta) + 1)));
    const r = (await explicar(c, c.z, x)).datos;
    await c.hacer(r.ia.tarea);
    const gasto = c.db.prepare("SELECT COUNT(*) AS n, MAX(creada_en) AS en FROM ia_llamadas WHERE estado = 'hecha'").get();
    assert.equal(gasto.n, 1);
    const resumenes = () => c.db.prepare("SELECT * FROM avisos WHERE clave LIKE 'ia_resumen:%' ORDER BY id").all();
    const enRd = ms => new Date(ms - 4 * 3_600_000).toISOString().slice(0, 10);
    const dia = enRd(Date.parse(gasto.en));
    // El mismo día: todavía nada (el resumen es de AYER).
    vigilarIA(c.db, { config: c.config, ahora: Date.parse(gasto.en) + 1000 });
    assert.equal(resumenes().length, 0);
    // A las 00:07 del día siguiente (hora de RD): el resumen de ese día, una sola vez.
    const manana = Date.parse(`${dia}T04:00:00Z`) + 86_400_000 + 7 * 60_000;
    vigilarIA(c.db, { config: c.config, ahora: manana });
    vigilarIA(c.db, { config: c.config, ahora: manana + 3_600_000 });
    const [a] = resumenes();
    assert.equal(resumenes().length, 1);
    assert.equal(a.clave, `ia_resumen:${dia}`);
    assert.equal(JSON.parse(a.detalle).n, 1);
    assert.equal(a.nivel, 'atencion');
    // El día siguiente no hubo gasto: ningún resumen nuevo.
    vigilarIA(c.db, { config: c.config, ahora: manana + 86_400_000 });
    assert.equal(resumenes().length, 1, 'un día sin gasto no manda nada');
  });
});
