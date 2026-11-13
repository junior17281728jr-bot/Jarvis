// Pruebas de la 0.14.1: «Pago del servidor» (src/avisos/pago-servidor.js, src/api/pago-servidor.js,
// public/pago-servidor-vista.js). Todo con un reloj de mentira: nunca dependen del día en que corren.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import {
  proximoPago, tonoPago, recordatorioQueToca, revisarPagoServidor, guardarAjustesPago, marcarPagado, leerPago, estadoPago, pareceTarjeta, diaRd, ENLACES_PAGO,
} from '../src/avisos/pago-servidor.js';
import { claveDeAvisoValida, marcarVisto } from '../src/avisos/avisos.js';
import { vaPorTelegram, crearAvisador } from '../src/canales/avisador.js';
import { textoDeAviso } from '../src/canales/textos.js';
import { textoProximo, textoAvisoPago, fechaCorta } from '../public/pago-servidor-vista.js';
import { montar, CHAT } from './copias-tarea-base.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
// Un momento del día de RD (UTC−4): «2026-11-13 10:00» de RD son las 14:00 UTC.
const rd = (fecha, hora = 10) => Date.parse(`${fecha}T00:00:00Z`) + (hora + 4) * 3_600_000;
const tEs = (clave, v = {}) => String(es[clave] ?? clave).replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (_, n, uno, varios) => (Number(v[n]) === 1 ? uno : varios)).replace(/\{(\w+)\}/g, (_, n) => (n in v ? String(v[n]) : `{${n}}`));
const sinAvisos = db => db.prepare("SELECT clave, resuelto_en FROM avisos WHERE clave LIKE 'servidor_pago:%' ORDER BY id").all();

function base() {
  const config = configDePrueba();
  return { config, db: abrirBase(config) };
}

// ---------- La fecha del próximo pago (pura) ----------

test('pago: la fecha del próximo pago, en días de RD, con el reloj de mentira', () => {
  // Día 1, a mitad de noviembre (guardado hoy): el próximo es el 1 de diciembre, a 18 días.
  const desde = '2026-11-13';
  assert.deepEqual(proximoPago({ dia: 1, desde }, rd('2026-11-13')), { fecha: '2026-12-01', mes: '2026-12', dias: 18, vencido: false, tono: 'bien' });
  // El mismo día del pago: 0 días (hoy).
  assert.equal(proximoPago({ dia: 15, desde }, rd('2026-11-15')).dias, 0);
  // La medianoche de RD (no la de UTC): el 30 nov a las 23:00 de RD ya son las 03:00 UTC del 1 dic, pero en RD falta 1 día.
  assert.equal(proximoPago({ dia: 1, desde }, rd('2026-11-30', 23)).dias, 1);
  assert.equal(proximoPago({ dia: 1, desde }, rd('2026-12-01', 0)).dias, 0);
  // Un día que el mes no tiene: el último del mes (31 → 30 nov; 30 → 28 feb; 29 feb en un año bisiesto).
  assert.equal(proximoPago({ dia: 31, desde }, rd('2026-11-13')).fecha, '2026-11-30');
  assert.equal(proximoPago({ dia: 30, desde: '2027-02-01' }, rd('2027-02-10')).fecha, '2027-02-28');
  assert.equal(proximoPago({ dia: 30, desde: '2028-02-01' }, rd('2028-02-10')).fecha, '2028-02-29');
  // Diciembre → enero del año siguiente.
  assert.equal(proximoPago({ dia: 5, desde }, rd('2026-12-20')).fecha, '2027-01-05');
  // Un día de pago que no es válido cuenta como el 1.
  assert.equal(proximoPago({ dia: 99, desde }, rd('2026-11-13')).fecha, '2026-12-01');
  assert.deepEqual([diaRd(rd('2026-11-13', 22)).d, diaRd(Date.parse('2026-11-14T02:00:00Z')).d], [13, 13]);
});

test('pago: vencido (sin marcar pagado) hasta 5 días; con pago automático o ya pagado, el del mes siguiente', () => {
  const desde = '2026-10-01';
  // Venció el 10 nov y no está marcado: el 12 nov, «venció hace 2 días», rojo.
  assert.deepEqual(proximoPago({ dia: 10, desde }, rd('2026-11-12')), { fecha: '2026-11-10', mes: '2026-11', dias: -2, vencido: true, tono: 'mal' });
  // Pasados 5 días se piensa en el del mes siguiente.
  assert.equal(proximoPago({ dia: 10, desde }, rd('2026-11-15')).dias, -5);
  assert.equal(proximoPago({ dia: 10, desde }, rd('2026-11-16')).fecha, '2026-12-10');
  // Con pago automático, nunca «vencido».
  assert.equal(proximoPago({ dia: 10, desde, automatico: true }, rd('2026-11-12')).fecha, '2026-12-10');
  // Ya marcado como pagado ese mes: el del mes siguiente (y por adelantado también).
  assert.equal(proximoPago({ dia: 10, desde, pagadoMes: '2026-11' }, rd('2026-11-12')).fecha, '2026-12-10');
  assert.equal(proximoPago({ dia: 10, desde, pagadoMes: '2026-11' }, rd('2026-11-05')).fecha, '2026-12-10');
  assert.equal(proximoPago({ dia: 1, desde, pagadoMes: '2026-12' }, rd('2026-11-28')).fecha, '2027-01-01');
  // Un pago de ANTES de guardar los datos nunca sale vencido (se guardó el 12 nov; el del 10 nov no cuenta).
  assert.equal(proximoPago({ dia: 10, desde: '2026-11-12' }, rd('2026-11-12')).fecha, '2026-12-10');
});

test('pago: los colores — naranja a 7 días o menos, rojo a 2 días o menos y vencido', () => {
  assert.deepEqual([30, 8, 7, 3, 2, 1, 0, -1].map(tonoPago), ['bien', 'bien', 'atencion', 'atencion', 'mal', 'mal', 'mal', 'mal']);
  const desde = '2026-11-01';
  assert.equal(proximoPago({ dia: 20, desde }, rd('2026-11-12')).tono, 'bien'); // 8 días
  assert.equal(proximoPago({ dia: 20, desde }, rd('2026-11-13')).tono, 'atencion'); // 7 días
  assert.equal(proximoPago({ dia: 20, desde }, rd('2026-11-18')).tono, 'mal'); // 2 días
});

test('pago: qué recordatorio toca (solo el más reciente), y con pago automático uno solo, 2 días antes', () => {
  const pago = { configurado: true, automatico: false };
  const toca = dias => recordatorioQueToca(pago, { dias });
  assert.deepEqual([10, 8, 7, 3, 2, 1, 0, -2].map(toca), [null, null, 'd7', 'd7', 'd2', 'd2', 'd0', 'd0']);
  const auto = dias => recordatorioQueToca({ configurado: true, automatico: true }, { dias });
  assert.deepEqual([7, 3, 2, 1, 0].map(auto), [null, null, 'auto', 'auto', 'auto']);
  assert.equal(recordatorioQueToca({ configurado: false }, { dias: 0 }), null, 'sin guardar los datos, ningún recordatorio');
});

// ---------- Los recordatorios (avisos de siempre) ----------

test('recordatorios: 7 días, 2 días y el día; nunca dos veces (ni después de «Entendido»); solo el último si se saltó alguno', () => {
  const { db } = base();
  guardarAjustesPago(db, { dia: 1, montoUsd: '6' }, { ahora: rd('2026-11-13') });
  assert.equal(revisarPagoServidor(db, rd('2026-11-20')), null, 'a 11 días, nada');
  assert.deepEqual(revisarPagoServidor(db, rd('2026-11-24')), { clave: 'servidor_pago:2026-12:d7', abierto: true });
  // Otra revisión el mismo día y los siguientes: no se repite.
  assert.deepEqual(revisarPagoServidor(db, rd('2026-11-24', 15)), { clave: 'servidor_pago:2026-12:d7', abierto: false });
  assert.equal(revisarPagoServidor(db, rd('2026-11-26')).abierto, false);
  // «Entendido» no hace que vuelva.
  const d7 = db.prepare("SELECT id FROM avisos WHERE clave = 'servidor_pago:2026-12:d7'").get();
  marcarVisto(db, { id: d7.id });
  assert.equal(revisarPagoServidor(db, rd('2026-11-27')).abierto, false);
  // A 2 días: el de 2 días (y el de 7 se cierra).
  assert.deepEqual(revisarPagoServidor(db, rd('2026-11-29')), { clave: 'servidor_pago:2026-12:d2', abierto: true });
  assert.equal(revisarPagoServidor(db, rd('2026-11-30')).abierto, false);
  assert.deepEqual(revisarPagoServidor(db, rd('2026-12-01')), { clave: 'servidor_pago:2026-12:d0', abierto: true });
  assert.equal(revisarPagoServidor(db, rd('2026-12-02')).abierto, false, 'vencido: el mismo del día, nunca otro');
  const filas = sinAvisos(db);
  assert.deepEqual(filas.map(f => f.clave), ['servidor_pago:2026-12:d7', 'servidor_pago:2026-12:d2', 'servidor_pago:2026-12:d0'], 'uno por recordatorio');
  assert.ok(filas[0].resuelto_en && filas[1].resuelto_en && !filas[2].resuelto_en);
  // El detalle: la fecha, los días y el monto, nunca la nota del método.
  const det = JSON.parse(db.prepare("SELECT detalle FROM avisos WHERE clave = 'servidor_pago:2026-12:d0'").get().detalle);
  assert.deepEqual(det, { fecha: '2026-12-01', dias: 0, montoCentavos: 600 }, 'el detalle es el del día en que se abrió');
  // La app estuvo apagada: en el mes siguiente, a 1 día, solo el de 2 días (no también el de 7).
  marcarPagado(db, { ahora: rd('2026-12-02') });
  assert.deepEqual(revisarPagoServidor(db, rd('2026-12-31')), { clave: 'servidor_pago:2027-01:d2', abierto: true });
  assert.equal(sinAvisos(db).filter(f => f.clave.startsWith('servidor_pago:2027-01')).length, 1);
  db.close();
});

test('recordatorios: marcado como pagado este mes, ninguno (y se cierran los abiertos); deshacer los vuelve a pedir', () => {
  const { db } = base();
  guardarAjustesPago(db, { dia: 1, metodo: 'tarjeta …1234' }, { ahora: rd('2026-11-13') });
  assert.equal(revisarPagoServidor(db, rd('2026-11-25')).abierto, true);
  const pagado = marcarPagado(db, { ahora: rd('2026-11-26') });
  assert.equal(pagado.pagadoMes, '2026-12');
  assert.ok(sinAvisos(db).every(f => f.resuelto_en), 'se cerró el de 7 días');
  for (const dia of ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-03']) assert.equal(revisarPagoServidor(db, rd(dia)), null, dia);
  assert.equal(sinAvisos(db).length, 1);
  assert.equal(estadoPago(db, rd('2026-12-01')).proximo.fecha, '2027-01-01');
  // Deshacer: vuelve a ser el de diciembre (y el de 2 días llega; el de 7 nunca otra vez).
  assert.equal(marcarPagado(db, { deshacer: true, ahora: rd('2026-11-29') }).pagadoMes, '2026-11');
  assert.deepEqual(revisarPagoServidor(db, rd('2026-11-29')), { clave: 'servidor_pago:2026-12:d2', abierto: false }, 'ya lo abrió el deshacer');
  assert.deepEqual(sinAvisos(db).map(x => [x.clave, Boolean(x.resuelto_en)]), [['servidor_pago:2026-12:d7', true], ['servidor_pago:2026-12:d2', false]]);
  db.close();
});

test('recordatorios: con pago automático, uno solo 2 días antes; sin datos guardados, ninguno', () => {
  const { db } = base();
  for (const dia of ['2026-11-24', '2026-11-29', '2026-12-01']) assert.equal(revisarPagoServidor(db, rd(dia)), null, `sin guardar: ${dia}`);
  guardarAjustesPago(db, { dia: 1, automatico: true }, { ahora: rd('2026-11-13') });
  assert.equal(revisarPagoServidor(db, rd('2026-11-24')), null, 'a 7 días, nada');
  assert.deepEqual(revisarPagoServidor(db, rd('2026-11-29')), { clave: 'servidor_pago:2026-12:auto', abierto: true });
  assert.equal(revisarPagoServidor(db, rd('2026-11-30')).abierto, false);
  assert.equal(revisarPagoServidor(db, rd('2026-12-01')).abierto, false);
  assert.equal(revisarPagoServidor(db, rd('2026-12-02')), null, 'el día después, ya es el de enero');
  assert.deepEqual(sinAvisos(db).map(f => f.clave), ['servidor_pago:2026-12:auto']);
  // Pasar a «automático» con uno de 7 días abierto lo cierra.
  const { db: db2 } = base();
  guardarAjustesPago(db2, { dia: 1 }, { ahora: rd('2026-11-13') });
  revisarPagoServidor(db2, rd('2026-11-25'));
  guardarAjustesPago(db2, { automatico: true }, { ahora: rd('2026-11-25') });
  assert.ok(sinAvisos(db2).every(f => f.resuelto_en));
  db.close();
  db2.close();
});

test('recordatorios: las claves son válidas, van por Telegram en silencio y su texto dice la fecha y el monto (nunca la nota)', () => {
  for (const etapa of ['d7', 'd2', 'd0', 'auto']) {
    assert.ok(claveDeAvisoValida(`servidor_pago:2026-12:${etapa}`));
    assert.deepEqual(vaPorTelegram({ clave: `servidor_pago:2026-12:${etapa}`, nivel: 'atencion' }), { va: true, suena: false });
  }
  assert.ok(!claveDeAvisoValida('servidor_pago:2026-13:d7'));
  assert.ok(!claveDeAvisoValida('servidor_pago:2026-12:d5'));
  const aviso = (etapa, dias) => ({ clave: `servidor_pago:2026-12:${etapa}`, nivel: 'atencion', ultima_vez: '2026-11-24T14:00:00.000Z', detalle: JSON.stringify({ fecha: '2026-12-01', dias, montoCentavos: 600 }) });
  const d7 = textoDeAviso(aviso('d7', 7), 'es');
  assert.match(d7, /^🖥️ Pago del servidor\n/);
  assert.match(d7, /1 dic/);
  assert.match(d7, /faltan 7 días/);
  assert.match(d7, /US\$6\.00/);
  assert.match(textoDeAviso(aviso('d2', 1), 'es'), /Mañana/);
  assert.match(textoDeAviso(aviso('d2', 2), 'es'), /Faltan 2 días/);
  assert.match(textoDeAviso(aviso('d0', 0), 'es'), /Hoy/);
  assert.match(textoDeAviso(aviso('d0', -1), 'es'), /no está marcado como pagado/);
  assert.match(textoDeAviso(aviso('auto', 2), 'es'), /Se cobrará solo.*revisa que tu tarjeta tenga fondos/);
  assert.match(textoDeAviso(aviso('d7', 7), 'en'), /Dec 1.*7 days left.*US\$6\.00/s);
  // En la pantalla (la lista de avisos del Resumen).
  const conDetalle = (etapa, dias) => ({ clave: `servidor_pago:2026-12:${etapa}`, detalle: { fecha: '2026-12-01', dias, montoCentavos: 600 } });
  assert.equal(textoAvisoPago(conDetalle('d2', 1), tEs), 'Pago del servidor (DigitalOcean): en 1 día, el 1 dic (US$6.00).');
  assert.equal(textoAvisoPago(conDetalle('d0', -2), tEs), 'El pago del servidor (DigitalOcean) era el 1 dic y no está marcado como pagado.');
});

test('recordatorios: el avisador los manda por Telegram una sola vez (solo si se enciende pagoServidor)', async () => {
  const b = await montar({ relleno: 0 });
  try {
    // El reloj de mentira: 7 días antes de un día de pago del mes que viene (después de unir el chat).
    const hoy = diaRd(b.t);
    // Un día de pago a 12 días o más (así guardar no abre ningún recordatorio).
    const dia = hoy.d <= 16 ? hoy.d + 12 : hoy.d - 14;
    guardarAjustesPago(b.db, { dia, montoUsd: '12.50', metodo: 'tarjeta …4242' }, { ahora: b.t });
    const mensajes = () => b.falso.mensajes.filter(m => m.chatId === String(CHAT) && /Pago del servidor/.test(m.text ?? ''));
    const apagado = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
    // Sin la opción, nunca revisa (así las demás pruebas no dependen del día del mes).
    const proximo = proximoPago(leerPago(b.db), b.t);
    b.t += (proximo.dias - 7) * 86_400_000 + 60_000;
    assert.equal(proximoPago(leerPago(b.db), b.t).dias, 7);
    for (let i = 0; i < 3; i++) await apagado.pasada();
    assert.equal(sinAvisos(b.db).length, 0);
    const avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj, pagoServidor: true });
    for (let i = 0; i < 4; i++) { await avisador.pasada(); b.t += 6 * 60_000; }
    assert.equal(mensajes().length, 1, 'uno solo');
    assert.match(mensajes()[0].text, /faltan 7 días/);
    assert.match(mensajes()[0].text, /US\$12\.50/);
    assert.ok(!mensajes()[0].text.includes('4242'), 'nunca la nota del método');
    assert.equal(mensajes()[0].silencioso, true);
    // Marcado como pagado: el de 2 días nunca llega.
    marcarPagado(b.db, { ahora: b.t });
    b.t += 5 * 86_400_000;
    for (let i = 0; i < 4; i++) { await avisador.pasada(); b.t += 6 * 60_000; }
    assert.equal(mensajes().length, 1);
    await apagado.parar();
    await avisador.parar();
  } finally { await b.cerrar(); }
});

// ---------- Guardar (validación) ----------

test('guardar: monto, día, nota del método (nunca un número de tarjeta) y «automático»', () => {
  const { db } = base();
  const ahora = rd('2026-11-13');
  assert.equal(leerPago(db).configurado, false);
  assert.deepEqual([leerPago(db).dia, leerPago(db).automatico], [1, false], 'por defecto, el día 1 y sin automático');
  const g = guardarAjustesPago(db, { montoUsd: '6,00', dia: 3, metodo: '  tarjeta  …1234 ', automatico: true }, { ahora });
  assert.deepEqual([g.configurado, g.montoUsd, g.dia, g.metodo, g.automatico, g.desde], [true, 6, 3, 'tarjeta …1234', true, '2026-11-13']);
  assert.equal(guardarAjustesPago(db, { montoUsd: '' }, { ahora }).montoUsd, null, 'el monto se puede dejar vacío');
  assert.equal(guardarAjustesPago(db, { montoUsd: 'US$ 7.5' }, { ahora }).montoUsd, 7.5);
  const error = (datos, codigo) => assert.throws(() => guardarAjustesPago(db, datos, { ahora }), e => e.codigo === 400 && e.clave === codigo, JSON.stringify(datos));
  error({ montoUsd: 'seis' }, 'pago_servidor_monto');
  error({ montoUsd: '0' }, 'pago_servidor_monto');
  error({ montoUsd: '99999' }, 'pago_servidor_monto');
  error({ dia: 0 }, 'pago_servidor_dia');
  error({ dia: 32 }, 'pago_servidor_dia');
  error({ dia: 2.5 }, 'pago_servidor_dia');
  error({ metodo: 'x'.repeat(61) }, 'pago_servidor_metodo');
  error({ metodo: 'Visa 4111 1111 1111 1111' }, 'pago_servidor_tarjeta');
  error({ metodo: '4111-1111-1111-1111' }, 'pago_servidor_tarjeta');
  error({ automatico: 'si' }, 'pago_servidor_automatico');
  assert.ok(pareceTarjeta('41111111'));
  assert.ok(!pareceTarjeta('tarjeta …1234'));
  assert.ok(!pareceTarjeta('Visa que vence 12/2028'));
  // Nada de lo malo se guardó, y la auditoría nunca lleva la nota.
  assert.equal(leerPago(db).metodo, 'tarjeta …1234');
  assert.ok(!db.prepare("SELECT group_concat(detalle, ' ') AS d FROM auditoria WHERE accion LIKE 'servidor_pago%'").get().d.includes('1234'));
  db.close();
});

// ---------- Las rutas (solo del administrador) ----------

test('rutas: solo el administrador (401 sin sesión, 403 un alumno); guardar, marcar pagado y deshacer, con el reloj de mentira', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const reloj = { ahora: rd('2026-11-13') };
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { reloj: () => reloj.ahora } });
  await conServidor(servidor, async base => {
    const pedir = async (metodo, ruta, { datos, galleta, cabeceras = {} } = {}) => {
      const h = { 'X-Oportia': '1', ...cabeceras };
      if (galleta) h.Cookie = galleta;
      if (datos !== undefined) h['Content-Type'] = 'application/json';
      const r = await fetch(`${base}${ruta}`, { method: metodo, headers: h, body: datos === undefined ? undefined : JSON.stringify(datos) });
      const set = r.headers.get('set-cookie');
      return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: set ? set.split(';')[0] : null };
    };
    const admin = (await pedir('POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: 'una clave bien larga' }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    crearUsuario(db, { nombre: 'ana', claveHash: await hashClave('una clave bien larga'), debeCambiarClave: false });
    const ana = (await pedir('POST', '/api/entrar', { datos: { nombre: 'ana', clave: 'una clave bien larga' } })).galleta;
    for (const [metodo, ruta] of [['GET', '/api/admin/servidor-pago'], ['POST', '/api/admin/servidor-pago'], ['POST', '/api/admin/servidor-pago/pagado']]) {
      assert.equal((await pedir(metodo, ruta, { datos: metodo === 'POST' ? {} : undefined })).codigo, 401, `${metodo} ${ruta} sin sesión`);
      assert.equal((await pedir(metodo, ruta, { galleta: ana, datos: metodo === 'POST' ? {} : undefined })).codigo, 403, `${metodo} ${ruta} alumno`);
    }
    let r = await pedir('GET', '/api/admin/servidor-pago', { galleta: admin });
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.datos.enlaces, { factura: 'https://cloud.digitalocean.com/account/billing', servidor: 'https://cloud.digitalocean.com/droplets' });
    assert.deepEqual(r.datos.enlaces, ENLACES_PAGO);
    assert.deepEqual([r.datos.pago.configurado, r.datos.pago.dia, r.datos.proximo.fecha, r.datos.proximo.dias], [false, 1, '2026-12-01', 18]);
    r = await pedir('POST', '/api/admin/servidor-pago', { galleta: admin, datos: { montoUsd: '6.00', dia: 1, metodo: 'tarjeta …1234', automatico: false } });
    assert.equal(r.codigo, 200);
    assert.deepEqual([r.datos.pago.configurado, r.datos.pago.montoUsd, r.datos.pago.metodo], [true, 6, 'tarjeta …1234']);
    assert.equal((await pedir('POST', '/api/admin/servidor-pago', { galleta: admin, datos: { metodo: '4111 1111 1111 1111' } })).datos.error, 'pago_servidor_tarjeta');
    assert.equal((await pedir('POST', '/api/admin/servidor-pago', { galleta: admin, datos: { dia: 40 } })).datos.error, 'pago_servidor_dia');
    // A 2 días: rojo; al marcarlo, el de enero (verde).
    reloj.ahora = rd('2026-11-29');
    r = await pedir('GET', '/api/admin/servidor-pago', { galleta: admin });
    assert.deepEqual([r.datos.proximo.dias, r.datos.proximo.tono, r.datos.recordatorio], [2, 'mal', 'd2']);
    r = await pedir('POST', '/api/admin/servidor-pago/pagado', { galleta: admin, datos: {} });
    assert.deepEqual([r.datos.pago.pagadoMes, r.datos.proximo.fecha, r.datos.proximo.tono, r.datos.recordatorio], ['2026-12', '2027-01-01', 'bien', null]);
    r = await pedir('POST', '/api/admin/servidor-pago/pagado', { galleta: admin, datos: { deshacer: true } });
    assert.deepEqual([r.datos.pago.pagadoMes, r.datos.proximo.fecha], ['2026-11', '2026-12-01']);
  });
  db.close();
});

// ---------- La pantalla ----------

test('pantalla: las frases existen en los dos idiomas (sin claves repetidas), sin innerHTML ni style=, y los textos del próximo pago', () => {
  for (const archivo of ['es.json', 'en.json']) {
    const texto = readFileSync(join(RAIZ, 'public/i18n', archivo), 'utf8');
    const claves = [...texto.matchAll(/^\s*"([^"]+)":/gm)].map(m => m[1]);
    const repetidas = claves.filter((c, i) => claves.indexOf(c) !== i);
    assert.deepEqual(repetidas, [], `${archivo}: claves repetidas`);
  }
  const vista = readFileSync(join(RAIZ, 'public/pago-servidor-vista.js'), 'utf8');
  assert.doesNotMatch(vista, /innerHTML|outerHTML|insertAdjacentHTML|style=|\.style\b|setAttribute\('style'/);
  const usadas = new Set([...vista.matchAll(/'((?:pago_servidor|aviso\.servidor_pago)\.[a-z0-9_.]+)'/g)].map(m => m[1]));
  for (const clave of ['admin.pestana.pago_servidor', 'admin.linea.pago_servidor', 'telegram.titulo.servidor_pago', 'telegram.aviso.servidor_pago.titulo', 'telegram.aviso.servidor_pago.texto',
    ...['d7', 'd2', 'd2.uno', 'd0', 'vencido', 'auto'].map(x => `telegram.aviso.servidor_pago.${x}`),
    ...['monto', 'dia', 'metodo', 'tarjeta', 'automatico'].map(x => `error.pago_servidor_${x}`), ...usadas]) {
    assert.ok(clave in es && clave in en, `falta la frase ${clave}`);
  }
  assert.ok(usadas.size > 25, `frases usadas: ${usadas.size}`);
  assert.match(es['pago_servidor.campo.metodo.ayuda'], /Nunca escribas el número completo/);
  assert.match(es['pago_servidor.explica'], /pueden suspender la cuenta y, con el tiempo, apagar o borrar el servidor/);
  assert.match(es['pago_servidor.copias'], /Admin → Copias/);
  assert.equal(fechaCorta('2026-12-01'), '1 dic');
  assert.equal(textoProximo({ fecha: '2026-12-01', dias: 18 }, tEs), 'Próximo pago: 1 dic (en 18 días)');
  assert.equal(textoProximo({ fecha: '2026-12-01', dias: 1 }, tEs), 'Próximo pago: mañana, 1 dic');
  assert.equal(textoProximo({ fecha: '2026-12-01', dias: 0 }, tEs), 'Próximo pago: hoy, 1 dic');
  assert.equal(textoProximo({ fecha: '2026-12-01', dias: -1 }, tEs), 'El pago venció el 1 dic (hace 1 día)');
  // La pestaña está en el grupo Sistema y la pantalla se abre en #pago-servidor.
  const app = readFileSync(join(RAIZ, 'public/app.js'), 'utf8');
  assert.match(app, /\{ id: 'pago-servidor', href: '#pago-servidor', clave: 'admin\.pestana\.pago_servidor'/);
  assert.match(app, /seccion === 'pago-servidor' && esAdmin\) return pantallaPagoServidor\(\)/);
});
