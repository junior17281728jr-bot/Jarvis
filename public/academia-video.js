// Academia 0.7.2: el «Video resumen» de una materia → la lección del reproductor (public/clase/reproductor.js).
// Lógica pura (test/tarjetas.test.js). Una escena usa un dibujo de public/clase solo si le sirve de verdad; si no (o si el
// paquete pide un tipo que la app no conoce, o un escenario sin sus opciones), usa el «cartel»: el cielo con un ícono
// que corresponde a lo que se dice y la frase clave en grande. Un video nunca se queda esperando una respuesta.
import { validarEscenario } from './clase/escenario.js';

// El ícono del cartel según lo que dice la escena (en español).
const ICONO_POR_TEMA = [
  [/\b(ojo|ojos|visi[oó]n|vista|luz|luces|conos|bastones|ilusi)/i, 'ojo'],
  [/\b(o[ií]do|vestibular|equilibrio|giro|desorienta)/i, 'oido'],
  [/\b(respir|pulm[oó]n|hiperventil|ox[ií]geno|hipoxia|altura|presi[oó]n)/i, 'pulmon'],
  [/\b(lista|checklist|imsafe|i'?m safe|rev[ií]sate)/i, 'lista'],
  [/\b(decide|decisi[oó]n|decidir|actitud)/i, 'rueda'],
  [/\b(cadena|eslab[oó]n|error)/i, 'cadena'],
  [/(%|\baccidentes?\b|estad[ií]stic)/i, 'grafica'],
  [/\b(nube|tormenta|meteorolog|frente|lluvia)/i, 'nube'],
  [/\b(motor|mon[oó]xido|\bco\b|calefacci[oó]n|escape)/i, 'motor'],
  [/\b(fatiga|cansancio|sue[nñ]o|tiempo|reloj|estr[eé]s)/i, 'reloj'],
];
export function iconoDe(texto) {
  for (const [re, icono] of ICONO_POR_TEMA) if (re.test(String(texto ?? ''))) return icono;
  return 'avion';
}

// ¿El dibujo pedido le sirve a esta escena? Si no, el cartel.
export function visualDeEscena(escena, i) {
  const v = escena?.visual;
  const dicho = `${escena?.subtitulo ?? ''} ${escena?.texto_pantalla ?? ''} ${escena?.texto_narracion ?? ''}`;
  // El cartel lleva el título de la escena; la frase clave va en los subtítulos (así no se repite).
  const cartel = { tipo: 'cartel', parametros: { titulo: escena?.subtitulo || '', icono: iconoDe(dicho), variante: i } };
  const p = v?.parametros && typeof v.parametros === 'object' ? v.parametros : {};
  switch (v?.tipo) {
    case 'titulo': return { tipo: 'titulo', parametros: { titulo: p.titulo || escena.subtitulo || '', antetitulo: p.antetitulo || '' } };
    case 'cartel': return { tipo: 'cartel', parametros: { ...cartel.parametros, ...p } };
    case 'ala': return { tipo: 'ala', parametros: p };
    case 'instrumentos': return /\b(instrumento|panel|veloc|alt[ií]metro|horizonte|anem[oó]metro|br[uú]jula|rumbo)/i.test(dicho) ? { tipo: 'instrumentos', parametros: { demo: true, ...p } } : cartel;
    case 'motor': return /\b(motor|pist[oó]n|cilindro|tiempos|cig[uü]e[nñ]al)/i.test(dicho) ? { tipo: 'motor', parametros: p } : cartel;
    case 'meteo': return /\b(nube|frente|convecci|meteorolog|tormenta)/i.test(dicho) ? { tipo: 'meteo', parametros: p } : cartel;
    case 'escenario': return validarEscenario(p).length ? cartel : { tipo: 'escenario', parametros: p };
    default: return cartel;
  }
}

// video: lo que da GET /api/academia/video/:materia. duracionAudio: los segundos del mp3 (para un video sin escenas).
export function leccionDeVideo(video, { titulo = '', antetitulo = '', audioUrl = null, duracionAudio = null } = {}) {
  const escenas = (video?.escenas ?? []).filter(e => Number.isFinite(e?.inicio_s) && Number.isFinite(e?.fin_s) && e.fin_s > e.inicio_s);
  const lista = escenas.length
    ? escenas.map((e, i) => ({
      id: e.id || `escena-${i + 1}`, inicio_s: e.inicio_s, fin_s: e.fin_s, subtitulo: e.subtitulo || '',
      texto_narracion: e.texto_narracion || e.texto_pantalla || e.subtitulo || '', visual: visualDeEscena(e, i),
    }))
    // Solo la narración: una escena con el título, del largo del audio.
    : [{ id: 'escena-1', inicio_s: 0, fin_s: Number.isFinite(duracionAudio) && duracionAudio > 0 ? duracionAudio : 60, subtitulo: titulo, texto_narracion: '', visual: { tipo: 'titulo', parametros: { titulo, antetitulo } } }];
  return { id: `video-${video?.materia ?? ''}`, titulo, ...(audioUrl ? { audio_url: audioUrl } : {}), escenas: lista };
}
