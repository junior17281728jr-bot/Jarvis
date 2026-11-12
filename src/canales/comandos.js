// 0.12.8 (pedido del dueño): lo que responde el bot a los comandos del DUEÑO (solo a su chat unido: src/canales/bot.js).
// /resumen, /gastos, /pagos, /alumno <usuario>, /contratos <usuario>|todos (también /firmas) y /ayuda.
//  - Mensajes cortos en HTML: el título en negrita con su emoji (📊 resumen, 🤖 gasto de la IA, 💳 comprobantes, 📄
//    contratos) y TODO lo demás escapado (escaparHtml). Nombres de alumnos: sí (es el chat del dueño; excepción
//    documentada en src/canales/textos.js); nunca claves, tokens ni el texto de una conversación.
//  - Solo lee la base (más lo que ya leen las pantallas de Administrador).
import { frase, escaparHtml, tituloHtml, fechaRd } from './textos.js';
import { mesCobro, inicioMesSiguienteCobro } from '../tareas/tiempo.js';
import { gastoMicro } from '../ia/gasto.js';
import { leerConfigIa } from '../ia/config.js';
import { filasIaAlumnos } from '../academia/ia-alumnos.js';
import { contratos } from '../cuentas/terminos.js';

export const COMANDOS = Object.freeze(['resumen', 'gastos', 'pagos', 'alumno', 'contratos', 'ayuda']);
const ALIAS = Object.freeze({ firmas: 'contratos', start: 'ayuda', help: 'ayuda', comandos: 'ayuda' });
const DIA_MS = 86_400_000;

// «/alumno@mi_bot juan» → { comando: 'alumno', arg: 'juan' }; lo que no es un comando → null.
export function leerComando(texto) {
  const m = /^\/([A-Za-z_]{1,32})(?:@[A-Za-z0-9_]{1,64})?(?:\s+([\s\S]*))?$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const c = m[1].toLowerCase();
  return { comando: ALIAS[c] ?? (COMANDOS.includes(c) ? c : 'desconocido'), arg: String(m[2] ?? '').trim().slice(0, 60) };
}

const usd = (micro, idioma) => `US$${new Intl.NumberFormat(idioma === 'en' ? 'en-US' : 'es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(micro) || 0) / 1_000_000)}`;
const linea = (idioma, clave, v = {}) => escaparHtml(frase(idioma, clave, v));
const pct = (a, b) => (b > 0 ? Math.floor((100 * a) / b) : 0);
const inicioDiaRd = ms => Date.parse(`${new Date(ms - 4 * 3_600_000).toISOString().slice(0, 10)}T04:00:00Z`);

export function textoAyuda(idioma) {
  return [tituloHtml('🤖', frase(idioma, 'bot.ayuda.titulo')), ...COMANDOS.map(c => linea(idioma, `bot.ayuda.${c}`))].join('\n');
}

export function textoResumen(db, idioma, ahora = Date.now()) {
  const cfg = leerConfigIa(db);
  const mes = mesCobro(ahora);
  const hoy = new Date(inicioDiaRd(ahora)).toISOString();
  const alumnos = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol <> 'admin' AND activo = 1").get().n;
  const activos = db.prepare("SELECT COUNT(DISTINCT r.usuario_id) AS n FROM academia_respuestas r JOIN usuarios u ON u.id = r.usuario_id WHERE u.rol <> 'admin' AND r.creada_en >= ?").get(hoy).n;
  const iaHoy = db.prepare("SELECT COALESCE(SUM(CASE estado WHEN 'reservada' THEN reservado_micro ELSE COALESCE(costo_micro, 0) END), 0) AS g FROM ia_llamadas WHERE creada_en >= ?").get(hoy).g;
  const iaMes = gastoMicro(db, { mes });
  const revisar = db.prepare("SELECT COUNT(*) AS n FROM academia_pagos WHERE estado = 'revision'").get().n;
  const avisos = db.prepare('SELECT COUNT(*) AS n FROM avisos WHERE resuelto_en IS NULL').get().n;
  return [
    tituloHtml('📊', frase(idioma, 'bot.resumen.titulo')),
    linea(idioma, 'bot.resumen.alumnos', { n: activos, total: alumnos }),
    linea(idioma, 'bot.resumen.ia', { hoy: usd(iaHoy, idioma), mes: usd(iaMes, idioma), tope: usd(cfg.topeGeneralMicro, idioma), pct: pct(iaMes, cfg.topeGeneralMicro) }),
    linea(idioma, 'bot.resumen.pagos', { n: revisar }),
    linea(idioma, 'bot.resumen.avisos', { n: avisos }),
  ].join('\n');
}

export function textoGastos(db, idioma, ahora = Date.now()) {
  const cfg = leerConfigIa(db);
  const mes = mesCobro(ahora);
  const usado = gastoMicro(db, { mes });
  const dias = Math.max(0, Math.ceil((inicioMesSiguienteCobro(ahora) - ahora) / DIA_MS));
  const porTipo = db.prepare(`SELECT proposito, COUNT(*) AS n, COALESCE(SUM(CASE estado WHEN 'reservada' THEN reservado_micro ELSE COALESCE(costo_micro, 0) END), 0) AS g
    FROM ia_llamadas WHERE mes = ? GROUP BY proposito ORDER BY g DESC LIMIT 5`).all(mes);
  const alumnos = filasIaAlumnos(db, ahora).filas.filter(f => f.usdMesMicro > 0 || f.usosMes > 0).slice(0, 5);
  return [
    tituloHtml('🤖', frase(idioma, 'bot.gastos.titulo')),
    linea(idioma, 'bot.gastos.mes', { usado: usd(usado, idioma), tope: usd(cfg.topeGeneralMicro, idioma), pct: pct(usado, cfg.topeGeneralMicro), dias }),
    ...(porTipo.length ? [linea(idioma, 'bot.gastos.por_tipo'), ...porTipo.map(t => `• ${escaparHtml(frase(idioma, `ia.proposito.${t.proposito}`))}: ${escaparHtml(usd(t.g, idioma))} (${t.n})`)] : [linea(idioma, 'bot.gastos.nada')]),
    ...(alumnos.length ? [linea(idioma, 'bot.gastos.por_alumno'), ...alumnos.map(a => `• ${escaparHtml(a.nombre.slice(0, 40))}: ${escaparHtml(usd(a.usdMesMicro, idioma))} · ${escaparHtml(frase(idioma, 'bot.usos', { n: a.usosMes }))}`)] : []),
  ].join('\n');
}

export function textoPagos(db, idioma, ahora = Date.now()) {
  const mes = mesCobro(ahora);
  const revisar = db.prepare(`SELECT p.precio, p.paquete, p.minutos, p.creado_en, u.nombre, u.nombre_visible FROM academia_pagos p JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.estado = 'revision' ORDER BY p.id LIMIT 6`).all();
  const aprobados = db.prepare("SELECT precio FROM academia_pagos WHERE estado = 'aprobado' AND revisado_en >= ?").all(`${mes}-01T00:00:00.000Z`);
  const total = aprobados.reduce((n, p) => n + (Number(/^US\$(\d+(?:\.\d+)?)$/.exec(String(p.precio ?? ''))?.[1]) || 0), 0);
  return [
    tituloHtml('💳', frase(idioma, 'bot.pagos.titulo')),
    linea(idioma, revisar.length ? 'bot.pagos.revisar' : 'bot.pagos.ninguno', { n: revisar.length }),
    ...revisar.slice(0, 5).map(p => `• ${escaparHtml((p.nombre_visible || p.nombre).slice(0, 40))} · ${escaparHtml(String(p.precio ?? '').slice(0, 40))} · ${escaparHtml(fechaRd(p.creado_en, idioma))}`),
    linea(idioma, 'bot.pagos.aprobados', { n: aprobados.length, total: `US$${Math.round(total * 100) / 100}` }),
    linea(idioma, 'bot.pagos.mira'),
  ].join('\n');
}

// El alumno por su usuario (exacto, sin importar mayúsculas), o el único cuyo nombre lo contiene. → id o null.
export function buscarAlumno(db, texto) {
  const q = String(texto ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!q) return null;
  const exacto = db.prepare("SELECT id FROM usuarios WHERE rol <> 'admin' AND lower(nombre) = ?").get(q);
  if (exacto) return exacto.id;
  const parecidos = db.prepare("SELECT id, nombre, nombre_visible FROM usuarios WHERE rol <> 'admin'").all()
    .filter(u => String(u.nombre).toLowerCase().includes(q) || String(u.nombre_visible ?? '').toLowerCase().includes(q));
  return parecidos.length === 1 ? parecidos[0].id : null;
}

export function textoAlumno(db, idioma, texto, ahora = Date.now()) {
  const id = buscarAlumno(db, texto);
  if (id == null) return [tituloHtml('⚠️', frase(idioma, 'bot.alumno.no')), linea(idioma, 'bot.alumno.como')].join('\n');
  const f = filasIaAlumnos(db, ahora).filas.find(x => x.id === id);
  const u = db.prepare('SELECT nombre, nombre_visible, activo FROM usuarios WHERE id = ?').get(id);
  const ultima = db.prepare('SELECT MAX(creada_en) AS en FROM academia_respuestas WHERE usuario_id = ?').get(id).en;
  const firma = contratos(db).find(c => c.usuarioId === id);
  const ia = !f ? frase(idioma, 'bot.alumno.inactivo')
    : f.pausada ? frase(idioma, 'bot.alumno.pausada')
      : f.plan && !f.plan.vencido ? frase(idioma, 'bot.alumno.plan', { nombre: f.plan.nombre ?? f.plan.id, quedan: f.plan.quedan, usos: f.plan.usos, vence: fechaRd(f.plan.hasta, idioma) })
        : f.prueba && !f.prueba.terminada ? frase(idioma, 'bot.alumno.prueba', { dias: f.prueba.quedanDias })
          : frase(idioma, 'bot.alumno.sin_plan');
  return [
    tituloHtml('👤', `${(u.nombre_visible || u.nombre).slice(0, 60)} (@${u.nombre})`),
    escaparHtml(ia),
    f ? linea(idioma, 'bot.alumno.mes', { usos: f.usosMes, usado: usd(f.usdMesMicro, idioma), tope: usd(f.topeMicro, idioma) }) : null,
    linea(idioma, f?.pago ? 'bot.alumno.pago' : 'bot.alumno.sin_pago', f?.pago ? { precio: f.pago.precio ?? '', fecha: fechaRd(f.pago.fecha, idioma) } : {}),
    linea(idioma, 'bot.alumno.ultima', { cuando: ultima ? fechaRd(ultima, idioma) : '—' }),
    linea(idioma, firma ? 'bot.alumno.firma' : 'bot.alumno.sin_firma', firma ? { version: firma.version, fecha: fechaRd(firma.en, idioma) } : {}),
  ].filter(Boolean).join('\n');
}

// Qué contratos manda «/contratos <usuario>|todos»: de un alumno, sus firmas (las 5 más nuevas); «todos», la última firma
// de cada alumno (como mucho 20). → { lista: [{ usuarioId, n }], error? }
export function contratosParaMandar(db, arg) {
  const todos = contratos(db);
  if (String(arg ?? '').trim().toLowerCase() === 'todos' || String(arg ?? '').trim().toLowerCase() === 'all') {
    const vistos = new Set();
    const lista = todos.filter(c => (vistos.has(c.usuarioId) ? false : vistos.add(c.usuarioId))).slice(0, 20);
    return { lista: lista.map(c => ({ usuarioId: c.usuarioId, n: c.n })), total: vistos.size };
  }
  const id = buscarAlumno(db, arg);
  if (id == null) return { lista: [], error: 'alumno' };
  const suyos = todos.filter(c => c.usuarioId === id).slice(0, 5);
  return { lista: suyos.map(c => ({ usuarioId: c.usuarioId, n: c.n })), total: suyos.length };
}
