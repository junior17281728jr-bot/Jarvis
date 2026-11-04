// Cada «corrida» es una vida del trabajador: desde que el servidor web lo enciende hasta que sale.
// Su identificador (un UUID) es la cerca de sus tareas: lo que guarde una corrida vieja ya no vale.
// Aquí nunca se borra nada: cada corrida queda anotada con cómo terminó, para contar caídas y para la pantalla.
import { randomUUID } from 'node:crypto';
import { enTransaccion } from '../nucleo/db.js';
import { COMO_TERMINA, ANORMALES } from './tipos.js';
import { recuperarAbandonadas, ARRIENDO_MS } from './cola.js';

export { COMO_TERMINA, ANORMALES };

export const LATIDO_MAXIMO_MS = 45_000;
export const LISTO_MAXIMO_MS = 60_000;

const iso = ms => new Date(ms).toISOString();

// ¿Sigue vivo ese proceso? process.kill(pid, 0) no le hace nada: solo pregunta. EPERM = existe pero es de
// otro usuario, así que cuenta como vivo.
export function procesoVivo(pid) {
  const numero = Number(pid);
  if (!Number.isSafeInteger(numero) || numero <= 0) return false;
  try {
    process.kill(numero, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

// La crea el servidor web ANTES de encender al trabajador: así queda anotado aunque se caiga al arrancar.
export function nuevaCorrida(db, { version, codigo = '', ahora = Date.now() }) {
  const corrida = randomUUID();
  db.prepare('INSERT INTO trabajador_corridas (corrida, version, codigo, empezo_en) VALUES (?, ?, ?, ?)')
    .run(corrida, String(version ?? ''), String(codigo ?? ''), iso(ahora));
  return corrida;
}

// Marca «perdida» cada corrida abierta (que no sea la mía) cuyo proceso ya no existe, que dejó de latir hace
// más de 45 s, o que nunca quedó lista en 60 s. Devuelve las corridas marcadas.
export function marcarPerdidas(db, { yo = null, ahora = Date.now(), latidoMaxMs = LATIDO_MAXIMO_MS, listoMaxMs = LISTO_MAXIMO_MS, vivo = procesoVivo } = {}) {
  const abiertas = db.prepare('SELECT * FROM trabajador_corridas WHERE termino_en IS NULL AND corrida IS NOT ?').all(yo);
  const limiteLatido = iso(ahora - latidoMaxMs);
  const limiteListo = iso(ahora - listoMaxMs);
  const perdidas = [];
  for (const c of abiertas) {
    const sinProceso = c.pid != null && !vivo(c.pid);
    const sinLatido = c.listo_en != null && (c.latido_en ?? c.listo_en) < limiteLatido;
    const nuncaListo = c.listo_en == null && c.empezo_en < limiteListo;
    if (!sinProceso && !sinLatido && !nuncaListo) continue;
    const motivo = sinProceso ? 'sin_proceso' : sinLatido ? 'sin_latido' : 'nunca_listo';
    const r = db.prepare("UPDATE trabajador_corridas SET termino_en = ?, como_termino = 'perdida', detalle = COALESCE(detalle, ?) WHERE id = ? AND termino_en IS NULL")
      .run(iso(ahora), motivo, c.id);
    if (r.changes === 1) perdidas.push(c.corrida);
  }
  return perdidas;
}

// Lo primero que hace el trabajador, en UNA transacción: anota su pid, marca perdidas las corridas abiertas
// que ya no viven y recupera sus tareas. Si su corrida no existe o ya terminó, lanza un error con
// codigo 'corrida_no_valida' (solo el servidor web enciende trabajadores).
export function empezarCorrida(db, { corrida, pid = process.pid, ahora = Date.now(), latidoMaxMs = LATIDO_MAXIMO_MS, listoMaxMs = LISTO_MAXIMO_MS, vivo = procesoVivo, alFallar = null, azar = Math.random, registro } = {}) {
  return enTransaccion(db, () => {
    const r = db.prepare('UPDATE trabajador_corridas SET pid = ? WHERE corrida = ? AND termino_en IS NULL').run(pid, corrida);
    if (r.changes !== 1) throw Object.assign(new Error(`La corrida ${corrida} no existe o ya terminó`), { codigo: 'corrida_no_valida' });
    const perdidas = marcarPerdidas(db, { yo: corrida, ahora, latidoMaxMs, listoMaxMs, vivo });
    const recuperadas = recuperarAbandonadas(db, { yo: corrida, ahora, azar, alFallar, ...(registro ? { registro } : {}) });
    return { perdidas, recuperadas };
  });
}

export function marcarListo(db, corrida, ahora = Date.now()) {
  const momento = iso(ahora);
  return db.prepare('UPDATE trabajador_corridas SET listo_en = ?, latido_en = ? WHERE corrida = ? AND termino_en IS NULL').run(momento, momento, corrida).changes === 1;
}

// El latido: anota que sigue vivo y alarga el arriendo de sus tareas. false = su corrida ya está cerrada (otro
// la dio por perdida): el trabajador debe salir sin escribir nada más.
export function latir(db, { corrida, memoriaMb = null, arriendoMs = ARRIENDO_MS, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const momento = iso(ahora);
    const r = db.prepare('UPDATE trabajador_corridas SET latido_en = ?, memoria_mb = ? WHERE corrida = ? AND termino_en IS NULL')
      .run(momento, memoriaMb == null ? null : Number(memoriaMb), corrida);
    if (r.changes !== 1) return false;
    db.prepare("UPDATE tareas SET arriendo_hasta = ? WHERE dueno = ? AND estado = 'en_curso'").run(iso(ahora + arriendoMs), corrida);
    return true;
  });
}

export function contarPaso(db, corrida, conError = false) {
  db.prepare('UPDATE trabajador_corridas SET pasos_hechos = pasos_hechos + 1, pasos_con_error = pasos_con_error + ? WHERE corrida = ?')
    .run(conError ? 1 : 0, corrida);
}

// Cierra la corrida UNA vez (WHERE termino_en IS NULL): si el trabajador ya anotó su propio motivo, que es más
// preciso, el que llega después (el del servidor web) no lo pisa. Devuelve true si la cerró.
export function terminarCorrida(db, { corrida, como, codigo = null, senal = null, detalle = null, memoriaMb = null, ahora = Date.now() }) {
  if (!COMO_TERMINA.includes(como)) throw new Error(`Forma de terminar no válida: ${como}`);
  return db.prepare(`UPDATE trabajador_corridas SET termino_en = ?, como_termino = ?, codigo_salida = ?, senal = ?,
      detalle = COALESCE(?, detalle), memoria_mb = COALESCE(?, memoria_mb)
    WHERE corrida = ? AND termino_en IS NULL`)
    .run(iso(ahora), como, codigo == null ? null : Number(codigo), senal == null ? null : String(senal).slice(0, 20),
      detalle == null ? null : String(detalle).slice(0, 500), memoriaMb == null ? null : Number(memoriaMb), corrida).changes === 1;
}

// Cuántas veces terminó mal el trabajador con ESTE código desde una fecha (para el modo seguro). Cuenta también
// vidas anteriores del servicio con el mismo código; nunca las de otro código.
export function salidasAnormales(db, { codigo, desde }) {
  const marcas = ANORMALES.map(() => '?').join(', ');
  return db.prepare(`SELECT COUNT(*) AS n FROM trabajador_corridas WHERE codigo = ? AND termino_en >= ? AND como_termino IN (${marcas})`)
    .get(String(codigo ?? ''), typeof desde === 'number' ? iso(desde) : String(desde), ...ANORMALES).n;
}

// Cuántas veces terminó mal el trabajador desde una fecha, con cualquier código (para la pantalla y el aviso
// 'trabajador_reinicios').
export function reiniciosDesde(db, desde) {
  const marcas = ANORMALES.map(() => '?').join(', ');
  return db.prepare(`SELECT COUNT(*) AS n FROM trabajador_corridas WHERE termino_en >= ? AND como_termino IN (${marcas})`)
    .get(typeof desde === 'number' ? iso(desde) : String(desde), ...ANORMALES).n;
}

export function ultimasCorridas(db, n = 5) {
  const cuantas = Math.max(1, Math.min(50, Math.trunc(Number(n)) || 5));
  return db.prepare('SELECT * FROM trabajador_corridas ORDER BY id DESC LIMIT ?').all(cuantas).map(c => ({
    corrida: c.corrida,
    version: c.version,
    codigo: c.codigo,
    pid: c.pid,
    empezoEn: c.empezo_en,
    listoEn: c.listo_en,
    latidoEn: c.latido_en,
    terminoEn: c.termino_en,
    como: c.como_termino,
    codigoSalida: c.codigo_salida,
    senal: c.senal,
    memoriaMb: c.memoria_mb,
    pasosHechos: c.pasos_hechos,
    pasosConError: c.pasos_con_error,
  }));
}
