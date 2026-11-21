// 0.14.99: lo que pasa durante el vuelo del Juego (sin documento ni ventana: las pruebas lo usan tal cual):
//  - las preguntas: de lo que el alumno estudia (la «Práctica del instructor» del Test Guide, que trae primero las que
//    falló y las que no respondió, de sus temas abiertos, y la ronda del oral de opción múltiple), sin la respuesta;
//  - de qué tema es cada una (motor y sistemas, meteorología, espacio aéreo y comunicaciones) y qué pasa si la falla:
//    el motor pierde aceite, turbulencia y cambio de viento, o el control avisa una posible desviación;
//  - los eventos del vuelo: una pregunta del instructor o del control, una tormenta adelante, un cambio de viento y el
//    viento cruzado en final; con su reloj (sembrado: siempre igual con la misma semilla);
//  - el puntaje y el resumen.
import { filasSencilla } from '../respuesta-vista.js';

export const JUEGO = Object.freeze({
  puntosBien: 100, puntosRacha: 25, puntosDecision: 200,
  primerEventoS: 20, entreEventosS: Object.freeze([35, 60]), ofertaS: 15,
  turbulenciaS: 45, fallaMotorS: 70,
});

// ---------- el tema de una pregunta ----------
const POR_MATERIA = {
  sistemas: 'motor', oral_sistemas: 'motor', oral_aeronavegabilidad: 'motor', poh: 'motor',
  meteorologia: 'meteo', oral_meteorologia: 'meteo',
  comunicacion: 'espacio', ambiente_vuelo: 'espacio',
};
const PALABRAS = [
  ['motor', /\b(oil|aceite|motor|engine|magneto|carbur|mixture|mezcla|cilindro|cylinder|propel|hélice|rpm|alternador|alternator|combustible|fuel)/i],
  ['meteo', /\b(thunder|tormenta|nube|cloud|viento|wind|frente|front|niebla|fog|hielo|icing|ice|turbul|weather|metar|taf|cumulonimb|lluvia|rain|cizalladura|shear)/i],
  ['espacio', /\b(airspace|espacio aéreo|class [a-g]\b|clase [a-g]\b|atc|tower|torre|radio|transponder|clearance|autorizaci|frequency|frecuencia|controlador|controller|ctaf|unicom)/i],
];
// → 'motor' | 'meteo' | 'espacio' | 'otra'
export function categoriaDe(q) {
  if (q?.materia && POR_MATERIA[q.materia]) return POR_MATERIA[q.materia];
  const texto = `${q?.enunciado ?? ''} ${(q?.opciones ?? []).map(o => o.texto).join(' ')}`;
  for (const [c, re] of PALABRAS) if (re.test(texto)) return c;
  return 'otra';
}

// ---------- las preguntas del vuelo ----------
// tg: el intento de la Práctica del instructor ({ id, preguntas }); oral: la ronda del oral ({ preguntas }). Solo las que se
// pueden responder aquí (sin figura ni responder antes en este intento). El Test Guide primero (ya viene en el orden que
// prefiere lo fallado y lo nuevo) y, cada 3, una del oral.
export function poolDePreguntas(tg, oral) {
  const vale = q => q && !q.falta && !q.figura && Array.isArray(q.opciones) && q.opciones.length >= 2 && q.enunciado;
  const a = (tg?.preguntas ?? []).filter(q => vale(q) && !q.respuesta).map(q => ({ fuente: 'tg', intento: tg.id, q, categoria: categoriaDe(q) }));
  const b = (oral?.preguntas ?? []).filter(vale).map(q => ({ fuente: 'oral', q, categoria: categoriaDe(q) }));
  const out = [];
  while (a.length || b.length) {
    for (let k = 0; k < 2 && a.length; k++) out.push(a.shift());
    if (b.length) out.push(b.shift());
    if (!a.length) while (b.length) out.push(b.shift());
  }
  return out;
}
// La siguiente que no salió todavía (si se pide un tema, una de ese tema si hay).
export function elegirPregunta(pool, usadas, preferir = null) {
  const libres = pool.filter(p => !usadas.has(p.q.id));
  return (preferir && libres.find(p => p.categoria === preferir)) || libres[0] || null;
}
// Lo que se manda al responder (la pregunta y la letra; nunca más).
export const pedidoRespuesta = (item, letra) => (item.fuente === 'tg'
  ? { ruta: `/api/academia/intentos/${encodeURIComponent(item.intento)}/responder`, datos: { pregunta: item.q.id, elegida: letra } }
  : { ruta: '/api/academia/oral/responder', datos: { pregunta: item.q.id, elegida: letra } });
// La respuesta del servidor, igual para las dos: el Test Guide la manda en «respuesta»; el oral, suelta.
export function adaptarRespuesta(fuente, datos) {
  const r = fuente === 'tg' ? datos?.respuesta : datos;
  if (!r || typeof r.acierto !== 'boolean') return null;
  return { acierto: r.acierto, correcta: r.correcta ?? null, elegida: r.elegida ?? null, sencilla: r.sencilla ?? null, explicacion: r.explicacion ?? null };
}
// Una línea del porqué (de la explicación sencilla guardada; nunca la IA): el «Por qué» si lo hay; si no, la primera.
export function lineaPorque(sencilla, max = 220) {
  const filas = filasSencilla(sencilla);
  const f = filas.find(x => x.tipo === 'porque') ?? filas.find(x => x.tipo === 'texto') ?? filas[0];
  if (!f) return '';
  const s = (f.resto || f.rotulo).trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ---------- la consecuencia ----------
// → 'bien' | 'aceite' (motor) | 'turbulencia' (meteorología: turbulencia y cambio de viento) | 'atc' (espacio aéreo y radio)
export function consecuenciaDe(categoria, acierto) {
  if (acierto) return 'bien';
  return { motor: 'aceite', meteo: 'turbulencia', espacio: 'atc' }[categoria] ?? 'turbulencia';
}
// La turbulencia: empujones en cabeceo y alabeo (grados por segundo) que dependen solo del tiempo.
export function rafagaTurbulencia(fuerza = 1, semilla = 1) {
  const f = (t, a, b, c) => Math.sin(t * a + semilla) * 0.55 + Math.sin(t * b + semilla * 1.7) * 0.3 + Math.sin(t * c + semilla * 0.3) * 0.15;
  return t => ({ cabeceo: f(t, 2.3, 5.1, 9.7) * 10 * fuerza, alabeo: f(t, 1.9, 4.3, 8.1) * 24 * fuerza });
}

// ---------- los eventos ----------
// Un generador sembrado (los mismos números con la misma semilla).
export function azarSembrado(semilla = 1) {
  let s = (Math.abs(Math.floor(semilla)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
// La agenda: cuándo toca el próximo evento y cuál. Los eventos solo salen volando (más de 400 ft, sin estar en final).
export function crearAgenda(azar) {
  return { proximo: JUEGO.primerEventoS, n: 0, cruzado: false, azar };
}
const TIPOS = ['pregunta', 'pregunta', 'tormenta', 'pregunta', 'viento', 'pregunta'];
// → { agenda (nueva), evento: null | { tipo: 'pregunta'|'tormenta'|'viento'|'cruzado', quien: 'instructor'|'control', tema } }
export function siguienteEvento(agenda, t, { ft = 0, enSuelo = true, enFinal = false, ocupado = false } = {}) {
  // El viento cruzado en final: una vez por vuelo, al entrar en final (aunque haya otra cosa abierta).
  if (enFinal && !enSuelo && !agenda.cruzado) return { agenda: { ...agenda, cruzado: true }, evento: { tipo: 'cruzado', quien: 'control', tema: 'meteo' } };
  if (ocupado || enSuelo || enFinal || ft < 400 || t < agenda.proximo) return { agenda, evento: null };
  const tipo = TIPOS[agenda.n % TIPOS.length];
  const [a, b] = JUEGO.entreEventosS;
  const nueva = { ...agenda, n: agenda.n + 1, proximo: t + a + (b - a) * agenda.azar() };
  const quien = tipo === 'pregunta' ? (agenda.n % 4 === 3 ? 'control' : 'instructor') : 'control';
  return { agenda: nueva, evento: { tipo, quien, tema: tipo === 'pregunta' ? null : 'meteo' } };
}
// Un viento nuevo (el cambio de viento): de otro lado, entre 12 y 20 kt.
export function vientoNuevo(azar, antes = { desde: 0, kt: 0 }) {
  const desde = Math.round(((antes.desde ?? 0) + 90 + azar() * 180) / 10) * 10 % 360;
  return { desde: desde || 360, kt: Math.round(12 + azar() * 8) };
}
// Viento cruzado en final de la 36: de un costado (090 o 270), 10 kt.
export const vientoCruzado = azar => ({ desde: azar() < 0.5 ? 90 : 270, kt: 10 });

// ---------- el puntaje y el resumen ----------
// estado: { aceptadas, bien, racha, mejor, puntos } → el nuevo, después de responder.
export function puntuar(estado, acierto) {
  const racha = acierto ? estado.racha + 1 : 0;
  return {
    ...estado, aceptadas: estado.aceptadas + 1, bien: estado.bien + (acierto ? 1 : 0), racha, mejor: Math.max(estado.mejor, racha),
    puntos: estado.puntos + (acierto ? JUEGO.puntosBien + JUEGO.puntosRacha * Math.max(0, racha - 1) : 0),
  };
}
export const puntajeInicial = () => ({ aceptadas: 0, bien: 0, racha: 0, mejor: 0, puntos: 0, ofrecidas: 0, decisiones: 0 });

// ---------- 0.14.102: el orden de una pregunta en el vuelo (pedido del dueño) ----------
// 1) «pregunta»: el vuelo se detiene y la pregunta se ve grande; 2) «accion»: la tarjeta desaparece del todo y el avión
// hace lo que pide la respuesta (la maniobra o la falla), con la cámara mirándolo y solo un subtítulo chico; 3)
// «explicacion»: la tarjeta del resultado (bien o mal, las opciones, «Por qué» y la fuente) con «Seguir volando»; 4) «fin».
export const FLUJO = Object.freeze({ accionS: Object.freeze({ bien: 6, aceite: 8, turbulencia: 7, atc: 5, nube: 8, desvio: 8, leccion: 7 }) });
export const crearFlujo = (item, contexto = null) => ({ fase: 'pregunta', item, contexto, res: null, consecuencia: null, t: 0, dur: 0 });
export function responderFlujo(f, res, consecuencia) {
  if (!f || f.fase !== 'pregunta') return f;
  if (!res) return { ...f, fase: 'fin', res: null };
  return { ...f, fase: 'accion', res, consecuencia, t: 0, dur: FLUJO.accionS[consecuencia] ?? 6 };
}
export function tickFlujo(f, dt) {
  if (!f || f.fase !== 'accion') return f;
  const t = f.t + dt;
  return t >= f.dur ? { ...f, t: f.dur, fase: 'explicacion' } : { ...f, t };
}
export const seguirFlujo = f => (f && f.fase === 'explicacion' ? { ...f, fase: 'fin' } : f);
// Qué se ve en cada fase: la tarjeta de la pregunta, la de la explicación, si el vuelo está quieto y el subtítulo.
export function vistaFlujo(f) {
  const fase = f?.fase ?? 'fin';
  return { pregunta: fase === 'pregunta', explicacion: fase === 'explicacion', pausado: fase === 'pregunta' || fase === 'explicacion', subtitulo: fase === 'accion' };
}
// Desde dónde se mira la acción: las fallas del motor y del control, en la cabina (los relojes, la radio); el resto, afuera.
export const camaraDeAccion = consecuencia => (['aceite', 'atc', 'nube'].includes(consecuencia) ? 'cabina' : 'afuera');
