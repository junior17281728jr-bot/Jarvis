// Lo que muestran las pantallas de la IA (Administrador → Inteligencia artificial). Solo LEE la base: nunca escribe ni
// usa la red. Lo usa el servidor web.
// Privacidad: el detalle del gasto solo tiene números y claves («Proyecto n.º 12 de la cuenta n.º 3»), nunca el nombre
// de un proyecto ni nada de lo que escribió alguien (la misma regla de la zona de sistema de la parte c).
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { estadoLlave } from '../claves/cifrado.js';
import { secretoUsable } from '../claves/almacen.js';
import { leerConfigIa, faltaParaEncender } from './config.js';
import { precioDe, filaDe, precioPublico } from './precios.js';
import { PROVEEDORES } from './proveedores/index.js';
import { PROPOSITOS } from './propositos.js';
import { GASTO_SQL, gastoMicro, apartadoMicro } from './gasto.js';
import { mesCobro, inicioMesSiguienteCobro, elegirProveedor, tipicoMicro, topeLleno } from './presupuesto.js';
import { topeEspacioMicro } from './topes.js';
import { resumenConfianza } from '../cuentas/confianza.js';

const MES = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const iso = ms => new Date(ms).toISOString();
const pctDe = (usado, tope) => (tope > 0 ? Math.floor((100 * usado) / tope) : 0);
// La misma (y única) cuenta del gasto, con las columnas de ia_llamadas nombradas «l.» (para unirla con proyectos).
const GASTO_SQL_L = GASTO_SQL.replace(/\b(estado|reservado_micro|costo_micro)\b/g, 'l.$1');

// Cómo está cada proveedor para GASTAR ahora mismo (para la pantalla del dueño).
function proveedoresPublicos(db, config, cfg, ahora) {
  const llave = estadoLlave(config);
  return cfg.orden.map(id => {
    const p = cfg.proveedores[id];
    const adaptador = PROVEEDORES[id];
    const fila = filaDe(id, p.modelo);
    const secreto = db.prepare("SELECT * FROM secretos WHERE uso = ? AND espacio_id IS NULL AND estado = 'activa' ORDER BY id DESC LIMIT 1").get(adaptador.uso);
    let motivo = null;
    if (!p.usar) motivo = 'proveedor_no_usado';
    else if (!precioDe(id, p.modelo)) motivo = 'precio_sin_confirmar';
    else {
      const u = secretoUsable(secreto, ahora, llave.listo ? llave.huella : null);
      if (!u.si) motivo = u.motivo;
    }
    return { id, usar: p.usar, modelo: p.modelo, precio: precioPublico(fila), usable: motivo == null, motivo };
  });
}

// GET /api/admin/ia: el estado de la IA. esDueno: la persona entra con la cuenta de Tailscale del dueño (ve todo); si
// no (el enlace público, otro equipo), solo el estado, los números del mes y si puede apagarla.
export function estadoIA(db, { config, enTailnet = false, esDueno = false, motivoDueno = null, espacioAdmin = null, ahora = Date.now() }) {
  const cfg = leerConfigIa(db);
  const mes = mesCobro(ahora);
  const usadoMicro = gastoMicro(db, { mes });
  const apartado = apartadoMicro(db, { mes });
  const pct = pctDe(usadoMicro, cfg.topeGeneralMicro);
  let estado = 'apagada';
  let motivo = null;
  let modelo = cfg.proveedores[cfg.orden[0]]?.modelo ?? null;
  if (cfg.encendida) {
    const eleccion = elegirProveedor(db, config, cfg, ahora);
    if (eleccion.ok) modelo = eleccion.modelo;
    // Ronda 2 de revisión: «Tope lleno» sale de la MISMA regla que el aviso del 100 % (topeLleno: lo que queda no
    // alcanza ni para el uso más barato), nunca de un aviso abierto: un pedido grande que no cupo no apaga la IA.
    const lleno = pct >= 100 || topeLleno(db, { cfg, ambito: 'general', mes });
    if (lleno) estado = 'tope_lleno';
    else if (!eleccion.ok) { estado = 'sin_uso'; motivo = eleccion.motivo; }
    else estado = 'encendida';
  }
  const respuesta = {
    enTailnet,
    esDueno,
    // Por qué no puede cambiar nada (la pantalla elige la frase): 'solo_desde_tailnet', 'solo_el_dueno' (es otro
    // administrador, no el dueño) o 'solo_dueno_tailscale' (otra cuenta de Tailscale o sin el enlace https).
    motivoDueno: esDueno ? null : (['solo_desde_tailnet', 'solo_el_dueno', 'solo_dueno_tailscale'].includes(motivoDueno) ? motivoDueno : null),
    encendida: cfg.encendida,
    ayudaProyectos: cfg.ayudaProyectos,
    estado,
    motivo,
    mes,
    usadoMicro,
    apartadoMicro: apartado,
    topeGeneralMicro: cfg.topeGeneralMicro,
    pct,
    vuelveEl: iso(inicioMesSiguienteCobro(ahora)),
    modoSeguro: leerModoSeguro(db).activo,
    modelo,
  };
  if (!esDueno) return respuesta;
  return {
    ...respuesta,
    faltan: faltaParaEncender(db, config, cfg, ahora),
    topesPlanMicro: { ...cfg.topesPlanMicro },
    proveedores: proveedoresPublicos(db, config, cfg, ahora),
    llamadasMes: db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas WHERE mes = ?').get(mes).n,
    bloqueosMes: db.prepare('SELECT COALESCE(SUM(veces), 0) AS n FROM ia_bloqueos WHERE mes = ?').get(mes).n,
    tipicoMicro: espacioAdmin != null ? tipicoMicro(db, { proposito: 'interpretar', espacioId: espacioAdmin }) : PROPOSITOS.interpretar.tipicoMicro,
    // Ronda 5 de revisión: cuántas cuentas comunes activas tienen el permiso de IA y cuántas lo esperan.
    cuentas: resumenConfianza(db),
  };
}

function detalleGeo(texto) {
  try {
    const g = JSON.parse(texto ?? 'null')?.geo;
    return typeof g === 'string' && /^[a-z]{2,20}$/.test(g) ? g : null;
  } catch {
    return null;
  }
}

// GET /api/admin/ia/consumo: el detalle del gasto de un mes (desde Tailscale). antesDe: para ver más llamadas.
export function consumoIA(db, { mes = null, antesDe = null, espacioAdmin = null, ahora = Date.now() } = {}) {
  const cfg = leerConfigIa(db);
  const elMes = typeof mes === 'string' && MES.test(mes) ? mes : mesCobro(ahora);
  const usado = gastoMicro(db, { mes: elMes });
  const general = { usadoMicro: usado, apartadoMicro: apartadoMicro(db, { mes: elMes }), topeMicro: cfg.topeGeneralMicro, pct: pctDe(usado, cfg.topeGeneralMicro) };
  const porCuenta = db.prepare(`SELECT espacio_id AS cuenta, ${GASTO_SQL} AS usado, COUNT(*) AS n FROM ia_llamadas
    WHERE mes = ? AND espacio_id IS NOT NULL GROUP BY espacio_id ORDER BY usado DESC, espacio_id LIMIT 100`).all(elMes)
    .map(f => {
      const t = topeEspacioMicro(db, cfg, f.cuenta);
      return { cuenta: f.cuenta, propia: f.cuenta === espacioAdmin, plan: t.plan, usadoMicro: f.usado, topeMicro: t.admin ? null : t.topeMicro, n: f.n };
    });
  const porProyecto = db.prepare(`SELECT p.numero AS proyecto, l.espacio_id AS cuenta, ${GASTO_SQL_L} AS usado, COUNT(*) AS n
    FROM ia_llamadas l JOIN proyectos p ON p.id = l.proyecto_id
    WHERE l.mes = ? GROUP BY l.proyecto_id ORDER BY usado DESC, l.proyecto_id LIMIT 100`).all(elMes)
    .map(f => ({ proyecto: f.proyecto, cuenta: f.cuenta, propia: f.cuenta === espacioAdmin, usadoMicro: f.usado, n: f.n }));
  const porUso = db.prepare(`SELECT proposito, ${GASTO_SQL} AS usado, COUNT(*) AS n FROM ia_llamadas WHERE mes = ? GROUP BY proposito ORDER BY usado DESC`).all(elMes)
    .map(f => ({ proposito: f.proposito, usadoMicro: f.usado, n: f.n }));
  const bloqueos = db.prepare('SELECT motivo, SUM(veces) AS veces FROM ia_bloqueos WHERE mes = ? GROUP BY motivo ORDER BY veces DESC, motivo').all(elMes)
    .map(f => ({ motivo: f.motivo, veces: f.veces }));
  const antes = Number(antesDe);
  const desde = Number.isSafeInteger(antes) && antes > 0 ? antes : null;
  const filas = db.prepare(`SELECT l.*, p.numero AS numero_proyecto FROM ia_llamadas l LEFT JOIN proyectos p ON p.id = l.proyecto_id
    WHERE l.mes = ? AND (? IS NULL OR l.id < ?) ORDER BY l.id DESC LIMIT 21`).all(elMes, desde, desde);
  const ultimas = filas.slice(0, 20).map(f => ({
    id: f.id,
    fecha: f.creada_en,
    proposito: f.proposito,
    proveedor: f.proveedor,
    modelo: f.modelo,
    estado: f.estado,
    resultado: f.resultado,
    geo: detalleGeo(f.detalle),
    tokensEntrada: f.tokens_entrada,
    tokensSalida: f.tokens_salida,
    reservadoMicro: f.reservado_micro,
    costoMicro: f.costo_micro,
    cuenta: f.espacio_id,
    proyecto: f.numero_proyecto ?? null,
  }));
  const meses = db.prepare(`SELECT mes, ${GASTO_SQL} AS usado, COUNT(*) AS n FROM ia_llamadas GROUP BY mes ORDER BY mes DESC LIMIT 12`).all()
    .map(f => ({ mes: f.mes, usadoMicro: f.usado, n: f.n }));
  return { mes: elMes, general, porCuenta, porProyecto, porUso, bloqueos, ultimas, siguiente: filas.length > 20 ? filas[19].id : null, meses };
}
