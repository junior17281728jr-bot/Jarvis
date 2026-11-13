// Academia 0.13.2: el MAPA entero de la Guía del examen oral (solo los títulos: los 8 capítulos, sus 39 temas en el
// orden del libro y los «Escenarios»), para que el Camino oral muestre todo desde el primer día: lo que ya tiene clase
// se abre; lo que todavía no, sale en gris con «Pronto». Nada del contenido del libro: solo nombres.
// (Escenarios: un solo tema, sin letra, que es el que traiga el paquete.)
// Los temas se cruzan con lo que trae el paquete por su letra (el id del tema termina en «-a», «-b»…: t01-a, t02-b; si no,
// por su número de orden «tNN»). El inglés del paquete (titulo_en) manda sobre el del mapa.

const T = (letra, es, en) => Object.freeze({ letra, es, en });
export const MAPA_ORAL = Object.freeze([
  { id: 'oral_calificaciones', n: 1, en: 'Pilot Qualifications', temas: [
    T('A', 'Privilegios y limitaciones', 'Privileges and Limitations'), T('B', 'Vigencia', 'Currency Requirements'), T('C', 'Certificado médico', 'Medical Certificates')] },
  { id: 'oral_aeronavegabilidad', n: 2, en: 'Airworthiness Requirements', temas: [
    T('A', 'Certificados y documentos del avión', 'Aircraft Certificates and Documents'), T('B', 'Mantenimiento del avión', 'Aircraft Maintenance Requirements')] },
  { id: 'oral_meteorologia', n: 3, en: 'Weather Information', temas: [
    T('A', 'La atmósfera', 'The Atmosphere'), T('B', 'Cómo obtener el clima', 'Obtaining Weather Information'), T('C', 'Reportes y observaciones', 'Reports and Observations'),
    T('D', 'Pronósticos', 'Forecasts'), T('E', 'Cartas del tiempo', 'Weather Charts')] },
  { id: 'oral_rendimiento', n: 4, en: 'Performance and Limitations', temas: [
    T('A', 'Aerodinámica', 'Aerodynamics'), T('B', 'Peso y balance', 'Weight and Balance'), T('C', 'Rendimiento del avión', 'Aircraft Performance')] },
  { id: 'oral_sistemas', n: 5, en: 'Operation of Systems', temas: [
    T('A', 'Operación del avión y del motor', 'Aircraft and Engine Operation'), T('B', 'Fallas de sistemas y equipos', 'System and Equipment Malfunctions'),
    T('C', 'Instrumentos pitot-estática', 'Pitot-Static Instruments'), T('D', 'Instrumentos giroscópicos', 'Gyroscopic Instruments'),
    T('E', 'Brújula magnética', 'Magnetic Compass'), T('F', 'Aviónica avanzada', 'Advanced Avionics')] },
  { id: 'oral_travesia', n: 6, en: 'Cross-Country Flight Planning', temas: [
    T('A', 'Navegación', 'Navigation'), T('B', 'Computador de vuelo y cálculos', 'Flight Computer and Calculations'), T('C', 'Comunicación por radio', 'Radio Communications'),
    T('D', 'Reglas de vuelo (Parte 91)', 'Flight Rules (Part 91)'), T('E', 'Espacio aéreo', 'Airspace'), T('F', 'Resumen de clases de espacio aéreo', 'Airspace Classes Summary'),
    T('G', 'Junta de seguridad del transporte (NTSB)', 'National Transportation Safety Board (NTSB)'), T('H', 'Manual de información aeronáutica (AIM)', 'Aeronautical Information Manual (AIM)'),
    T('I', 'Evitar incursiones en pista', 'Runway Incursion Avoidance'), T('J', 'Seguridad de la aviación', 'Aviation Security')] },
  { id: 'oral_nocturno', n: 7, en: 'Night Operations', temas: [
    T('A', 'Preparación para la noche', 'Night Preparation'), T('B', 'Vuelo de noche', 'Night Flight')] },
  { id: 'oral_factores_humanos', n: 8, en: 'Human Factors', temas: [
    T('A', 'Fisiología de vuelo', 'Aeromedical Factors'), T('B', 'Recursos del piloto solo', 'Single-Pilot Resource Management'), T('C', 'Toma de decisiones', 'Aeronautical Decision Making'),
    T('D', 'Manejo del riesgo', 'Risk Management'), T('E', 'Manejo de tareas', 'Task Management'), T('F', 'Conciencia situacional', 'Situational Awareness'),
    T('G', 'Evitar choques contra el terreno (CFIT)', 'Controlled Flight Into Terrain (CFIT)'), T('H', 'Manejo de la automatización', 'Automation Management')] },
  { id: 'oral_escenarios', n: 9, en: 'Scenario-Based Questions', temas: [T('', 'Preguntas de escenario', 'Scenario-Based Questions')] },
].map(c => Object.freeze({ ...c, temas: Object.freeze(c.temas) })));

// La letra de un tema del paquete: «t02-b» → «B»; si el id no la trae, la de su número de orden («t03-…» → «C»);
// si tampoco, null (va al final de su capítulo).
export function letraDeTema(id) {
  const s = String(id ?? '');
  const m = /-([a-z])$/i.exec(s);
  if (m) return m[1].toUpperCase();
  const n = /^t(\d{1,2})(?:-|$)/i.exec(s);
  return n && Number(n[1]) >= 1 && Number(n[1]) <= 26 ? String.fromCharCode(64 + Number(n[1])) : null;
}

// Junta el mapa con lo que trae el Camino oral del servidor (d.materias): cada capítulo del mapa, en orden, con sus temas
// del libro; cada uno lleva lo suyo del paquete (x) si ya tiene clase, o null («Pronto»). Un tema del paquete que no
// está en el mapa va al final de su capítulo (nunca se pierde); un capítulo del paquete que no está en el mapa, también.
export function caminoConMapa(materias = []) {
  const porId = new Map(materias.map(m => [m.id, m]));
  const capitulos = MAPA_ORAL.map(c => {
    const m = porId.get(c.id) ?? null;
    const propios = [...(m?.temas ?? [])];
    const temas = c.temas.map(x => {
      const i = propios.findIndex(p => (x.letra ? letraDeTema(p.id) === x.letra : true));
      return { letra: x.letra, es: x.es, en: x.en, x: i >= 0 ? propios.splice(i, 1)[0] : null };
    });
    // Los temas que el mapa no conoce: tal cual, al final.
    for (const p of propios) temas.push({ letra: letraDeTema(p.id), es: p.titulo, en: p.titulo_en ?? null, x: p });
    return { id: c.id, n: c.n, en: c.en, m, temas };
  });
  for (const m of materias) {
    if (!MAPA_ORAL.some(c => c.id === m.id)) capitulos.push({ id: m.id, n: m.numero, en: null, m, temas: m.temas.map(p => ({ letra: letraDeTema(p.id), es: p.titulo, en: p.titulo_en ?? null, x: p })) });
  }
  return capitulos;
}
export const TOTAL_TEMAS_MAPA = MAPA_ORAL.reduce((n, c) => n + c.temas.filter(x => x.letra).length, 0);
