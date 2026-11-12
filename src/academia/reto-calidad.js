// Academia 0.9.0: ¿las opciones del «Modo reto» son DIFÍCILES de verdad? Puro (sin base, sin red, sin archivos): lo usan
// el revisor del paquete (src/academia/formato.js, como avisos que no impiden subirlo), la ruta que sube un paquete y el
// programa scripts/reto-faciles.mjs (para saber cuáles volver a escribir). Nunca mira ni cambia el enunciado, las opciones
// originales ni la respuesta del Test Guide: solo compara las 2 opciones NUEVAS con la correcta y con la pregunta.
//
// Una opción del reto es «fácil» (se descarta sin saber) cuando:
//  - muy_corta / muy_larga: su largo no se parece al de la correcta (la que «no pega» con las otras dos se nota);
//  - absoluto: dice «siempre», «nunca», «todo»… y la correcta no (los absolutos casi nunca son la respuesta);
//  - sin_cifras / cifras_de_mas: la correcta trae una cifra y ella no (o al revés);
//  - otra_unidad: las dos traen cifras, pero en unidades distintas (días contra horas, pies contra metros…);
//  - fuera_de_tema: no comparte ni una palabra con su tema (la lección y las preguntas del tema);
//  - casi_igual: es casi la misma frase que una opción original o que la otra del reto (no enseña nada nuevo).
// «repetido» (la MISMA frase que una opción original o que la otra del reto, sin mirar mayúsculas, tildes ni signos)
// sí es un error del paquete: lo marca el revisor (src/academia/formato.js).

export const MOTIVOS_RETO = Object.freeze(['muy_corta', 'muy_larga', 'absoluto', 'sin_cifras', 'cifras_de_mas', 'otra_unidad', 'fuera_de_tema', 'casi_igual']);

// Cuánto puede cambiar el largo (en letras) respecto de la correcta antes de notarse. Con textos muy cortos (menos de
// 12 letras de diferencia) no se avisa: «60 días» contra «90 días hábiles» se lee igual de rápido.
export const LARGO = Object.freeze({ minimo: 0.55, maximo: 1.8, diferenciaMinima: 12 });
const CASI_IGUAL = 0.85;

const ABSOLUTOS = /\b(siempre|nunca|jam[aá]s|todos?|todas?|ning[uú]n[oa]?|nada|nadie|s[oó]lo|[uú]nicamente|completamente|totalmente|imposible|garantiza\w*|always|never|all|none|only|completely|impossible)\b/i;
// Palabras que no dicen de qué se habla (para «fuera_de_tema»).
const VACIAS = new Set(('a al algo ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era es esa ese '
  + 'eso esta este esto estos estas fue ha hay la las le les lo los mas más me mi muy no o otra otro para pero por porque que qué se ser si sí '
  + 'sin sobre su sus tambien también tan te tiene u un una uno unos unas usted y ya the of and or to in on for is are be by with a an it its at as '
  + 'puede pueden debe deben esta están está será son sera hace hacer cada mismo misma menos mayor menor').split(/\s+/));
// Familias de unidades (para «otra_unidad»): la primera palabra que aparece de cada familia.
const UNIDADES = Object.freeze([
  ['tiempo', /\b(segundos?|minutos?|horas?|d[ií]as?|semanas?|meses|mes|a[nñ]os?|hrs?|min)\b/i],
  ['distancia', /\b(pies|ft|metros?|m|millas?|nm|sm|km|kil[oó]metros?)\b/i],
  ['velocidad', /\b(nudos?|kt|kts|mph|km\/h)\b/i],
  ['presion', /\b(hpa|mb|milibares|pulgadas|inhg|psi)\b/i],
  ['temperatura', /(°\s?[cf]\b|\bgrados\b)/i],
  ['porcentaje', /%|\bpor ciento\b/i],
]);

// Sin mayúsculas, sin tildes, sin signos y con un solo espacio: «¿Siempre?» → «siempre».
export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ%]+/g, ' ').trim();
}
const palabrasDe = texto => normalizar(texto).split(' ').filter(Boolean);
// La «raíz» de una palabra (sus primeras 5 letras): «visión» y «visual» no, «pilotos» y «piloto» sí.
const raiz = p => p.slice(0, 5);
const contenido = texto => new Set(palabrasDe(texto).filter(p => p.length >= 4 && !VACIAS.has(p)).map(raiz));
function parecido(a, b) {
  const x = new Set(palabrasDe(a));
  const y = new Set(palabrasDe(b));
  if (!x.size || !y.size) return 0;
  let comun = 0;
  for (const p of x) if (y.has(p)) comun += 1;
  return comun / (x.size + y.size - comun);
}
const tieneCifra = texto => /\d/.test(String(texto ?? ''));
const familiaDe = texto => UNIDADES.find(([, re]) => re.test(String(texto ?? '')))?.[0] ?? null;

// El vocabulario de un tema (sus lecciones y todas sus preguntas): lo que es «del tema». Una opción del reto que no
// comparte ni una palabra con eso sí está fuera de lugar; «hipoxia» en una pregunta de hiperventilación, no.
export function vocabularioDe(tema, preguntas) {
  const partes = [];
  const secciones = s => (Array.isArray(s) ? s : []).flatMap(x => [x?.titulo, x?.texto, x?.recuerda, x?.ejemplo, ...(Array.isArray(x?.puntos) ? x.puntos : [])]);
  partes.push(tema?.titulo, ...secciones(tema?.secciones), ...secciones(tema?.reexplicacion));
  for (const q of preguntas) partes.push(q?.original?.enunciado, ...(q?.original?.opciones ?? []).map(o => o?.texto), q?.original?.explicacion, q?.sencilla, ...Object.values(q?.errores ?? {}));
  return contenido(partes.filter(x => typeof x === 'string').join(' '));
}

// Las opciones del reto de UNA pregunta (con el formato del paquete) que parecen fáciles: [{ indice, texto, motivos }].
// Una pregunta sin reto, o mal formada, devuelve [] (eso lo dice el revisor del paquete). vocabulario: el de su tema
// (vocabularioDe); sin él, solo cuenta la pregunta misma.
export function revisarReto(q, { vocabulario = null } = {}) {
  const o = q?.original;
  const opciones = Array.isArray(o?.opciones) ? o.opciones : [];
  const correcta = opciones.find(op => op?.letra === o?.correcta)?.texto;
  const reto = Array.isArray(q?.reto?.opciones) ? q.reto.opciones : [];
  if (typeof correcta !== 'string' || !reto.length) return [];
  const tema = vocabulario ?? contenido([o.enunciado, ...opciones.map(op => op?.texto), o.explicacion, q.sencilla].filter(x => typeof x === 'string').join(' '));
  const absCorrecta = ABSOLUTOS.test(correcta);
  const cifraCorrecta = tieneCifra(correcta);
  const familiaCorrecta = familiaDe(correcta);
  const largo = correcta.trim().length;
  const salida = [];
  reto.forEach((r, i) => {
    const texto = typeof r?.texto === 'string' ? r.texto : '';
    if (!texto.trim()) return;
    const motivos = [];
    const n = texto.trim().length;
    if (Math.abs(n - largo) >= LARGO.diferenciaMinima) {
      if (n < largo * LARGO.minimo) motivos.push('muy_corta');
      else if (n > largo * LARGO.maximo) motivos.push('muy_larga');
    }
    if (ABSOLUTOS.test(texto) && !absCorrecta) motivos.push('absoluto');
    const cifra = tieneCifra(texto);
    if (cifraCorrecta && !cifra) motivos.push('sin_cifras');
    else if (!cifraCorrecta && cifra) motivos.push('cifras_de_mas');
    else if (cifra && familiaCorrecta && familiaDe(texto) && familiaDe(texto) !== familiaCorrecta) motivos.push('otra_unidad');
    const propias = contenido(texto);
    if (propias.size >= 2 && ![...propias].some(p => tema.has(p))) motivos.push('fuera_de_tema');
    const otras = [...opciones.filter(op => op?.letra !== o.correcta).map(op => op?.texto), ...reto.filter((_, j) => j !== i).map(x => x?.texto)];
    if (otras.some(x => typeof x === 'string' && normalizar(x) !== normalizar(texto) && parecido(x, texto) >= CASI_IGUAL)) motivos.push('casi_igual');
    if (motivos.length) salida.push({ indice: i, texto, motivos });
  });
  return salida;
}

// Todas las de un paquete: [{ pregunta, numero, materia, tema, correcta, opciones: [{ indice, texto, motivos }] }].
export function retosFaciles(paquete) {
  const lugar = new Map();
  const porId = new Map((Array.isArray(paquete?.preguntas) ? paquete.preguntas : []).map(q => [q?.id, q]));
  for (const m of Array.isArray(paquete?.materias) ? paquete.materias : []) {
    for (const t of Array.isArray(m?.temas) ? m.temas : []) {
      const ids = Array.isArray(t?.preguntas) ? t.preguntas : [];
      const vocabulario = vocabularioDe(t, ids.map(id => porId.get(id)).filter(Boolean));
      for (const id of ids) lugar.set(id, { materia: m.id, tema: t.id, vocabulario });
    }
  }
  const lista = [];
  for (const q of Array.isArray(paquete?.preguntas) ? paquete.preguntas : []) {
    const donde = lugar.get(q?.id);
    const malas = revisarReto(q, { vocabulario: donde?.vocabulario ?? null });
    if (!malas.length) continue;
    const correcta = q.original.opciones.find(op => op.letra === q.original.correcta)?.texto ?? '';
    lista.push({ pregunta: q.id, numero: q.original.numero ?? null, materia: donde?.materia ?? null, tema: donde?.tema ?? null, correcta, opciones: malas });
  }
  return lista;
}
