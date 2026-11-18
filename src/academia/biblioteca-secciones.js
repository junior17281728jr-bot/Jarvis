// Academia 0.14.43: las SECCIONES de un libro de la Biblioteca (src/academia/biblioteca.js). El texto de las fuentes
// llega como renglones de PDF con marcas «=== p N ===»; aquí se encuentra su estructura real para leerlo por secciones:
//  - nivel 1: «RAD 63 – PERMISOS Y CONSTANCIAS DE MUESTRA», «Capítulo 3» / «Chapter 3» (con el título del renglón siguiente) y
//    los títulos en MAYÚSCULAS («UN TÍTULO EN MAYÚSCULAS»);
//  - nivel 2: «Sección B ― Reglas de Prueba» / «Section 2 - …» y los títulos cortos en Mayúsculas Iniciales
//    («Marco Legal», «Forces Acting on the Aircraft») o de una palabra después de un punto («Prohibiciones»);
//  - nivel 3: los numerados «63.57 Práctica reciente…», «4.2.1 …» (también «91.407» solo en su renglón, con el título
//    partido palabra por palabra en los renglones siguientes).
// Un título partido en dos renglones (termina en coma, en «Y», «de»…; o sigue en MAYÚSCULAS) se junta.
// Puro y por BYTES (como el índice de páginas): una sección es un rango [inicio, fin) del archivo del capítulo; nunca se
// guarda el texto. Un título sin texto propio («RAD 2 – …» seguido de «2.9 …») se vuelve el encabezado de la siguiente.
// Una sección muy larga se parte en las páginas (para leerla cómoda en el teléfono).

const MARCA = /^===\s*p\s+(\d{1,5})\s*===\s*$/;
const RAYA = '[-–—―]';
const RAD = new RegExp(`^RAD\\s+\\d{1,3}\\s*${RAYA}\\s*(\\S.*)$`);
const CAPITULO = /^(?:Cap[íi]tulo|CAP[ÍI]TULO|Chapter|CHAPTER)\s+(?:\d{1,3}|[IVXLC]{1,6})\b(.*)$/u;
const SECCION_LETRA = new RegExp(`^(?:Secci[óo]n|SECCI[ÓO]N|Section|SECTION)\\s+[A-Z0-9]{1,3}\\s*${RAYA}\\s*\\S`, 'u');
const NUMERADA = /^(\d{1,3}(?:\.\d{1,3}){1,3})\.?\s+(\S.*)$/;
const MARCA_LISTA_SIMPLE = /^(?:[-•▪●◦–*]|\(?[a-zA-Z0-9]{1,2}[.)])\s/u;
const NUMERO_SOLO = /^\d{1,3}(?:\.\d{1,3}){1,3}\.?$/;
const ITEM_LISTA = new RegExp(`^\\p{Lu}\\p{Ll}+\\s+(?:\\d{1,3}|[IVXLC]{1,6})\\s*${RAYA}\\s`, 'u');
const MENORES = new Set(['a', 'al', 'and', 'de', 'del', 'el', 'en', 'for', 'in', 'la', 'las', 'los', 'o', 'of', 'on', 'or', 'para', 'por', 'the', 'to', 'un', 'una', 'y', 'e', 'with', 'at', 'by', 'from', 'sin', 'con']);
const SIGUE = /(?:,|\s(?:y|e|o|de|del|la|el|los|las|para|en|and|of|the|to|for|Y|DE|DEL|LA|EL|AND|OF|THE))$/u;
export const TOPES_SECCIONES = Object.freeze({ seccionBytes: 24 * 1024, porLibro: 3000, minCuerpo: 40, minDebil: 200, repetido: 3, titulo: 140 });

const mayusculas = l => { const letras = l.match(/\p{L}/gu) ?? []; return letras.length >= 6 && l.length <= 90 && !/\p{Ll}/u.test(l) && !/[,;]$/.test(l); };
const cierraOracion = l => !l || /[.:;)!?]$/.test(l);
const empiezaMayuscula = l => /^[\p{Lu}¿¡"«“]/u.test(l ?? '');
function tituloCapitalizado(l) {
  if (l.length > 60 || /[.,;:]/.test(l) || /\d/.test(l) || !empiezaMayuscula(l)) return false;
  const palabras = l.split(/\s+/);
  if (palabras.length < 2 || palabras.length > 7) return false;
  return palabras.every(p => MENORES.has(p.toLowerCase()) || /^[\p{Lu}(]/u.test(p)) && palabras.filter(p => !MENORES.has(p.toLowerCase())).length >= 2;
}

// ¿Es título este renglón? previa/siguiente: los renglones con texto de al lado ('' si hay un renglón en blanco en medio o
// es el comienzo); anterior: el renglón con texto de antes aunque haya blancos en medio. → nivel (1|2|3) | 0
export function nivelDeTitulo(l, previa = '', siguiente = '', anterior = previa) {
  if (!l || l.length > TOPES_SECCIONES.titulo) return 0;
  const m = RAD.exec(l);
  if (m && !/\p{Ll}/u.test(m[1])) return 1;
  if (CAPITULO.test(l) && l.length <= 90 && !/[,;]$/.test(l)) return 1;
  if (SECCION_LETRA.test(l)) return 2;
  const n = NUMERADA.exec(l);
  if (n && empiezaMayuscula(n[2]) && l.length <= 110 && (cierraOracion(previa) || previa.length < 60)) return 3;
  if (NUMERO_SOLO.test(l) && empiezaMayuscula(siguiente) && siguiente.length <= 40 && cierraOracion(previa)) return 3;
  if (mayusculas(l) && /^\p{Lu}/u.test(l) && cierraOracion(previa) && siguiente) return 1;
  // Los cortos en Mayúsculas Iniciales y los de una palabra: solo si les sigue texto de verdad (no una tabla ni otra etiqueta).
  const sigueTexto = siguiente.length >= 25 && empiezaMayuscula(siguiente);
  if (tituloCapitalizado(l) && sigueTexto && (cierraOracion(anterior) || ITEM_LISTA.test(anterior))) return 2;
  if (/^\p{Lu}\p{Ll}{3,29}$/u.test(l) && cierraOracion(anterior) && sigueTexto && siguiente.length >= 60) return 2;
  return 0;
}

// Los renglones de un archivo con sus bytes. → [{ texto (sin espacios a los lados), inicio, fin (incluye el \n), pagina }]
function renglones(buffer) {
  const lista = [];
  let desde = 0;
  let pagina = null;
  while (desde < buffer.length) {
    let fin = buffer.indexOf(10, desde);
    if (fin < 0) fin = buffer.length;
    const texto = buffer.toString('utf8', desde, fin).replace(/\r$/, '').trim();
    const m = MARCA.exec(texto);
    if (m) pagina = Number(m[1]);
    lista.push({ texto, inicio: desde, fin: Math.min(fin + 1, buffer.length), pagina, marca: Boolean(m) });
    desde = fin + 1;
  }
  return lista;
}

const limpiarTitulo = t => t.replace(/\s+/g, ' ').replace(/\s*[.:]$/, '').slice(0, TOPES_SECCIONES.titulo);

// Las secciones de un capítulo. → [{ titulo (null = el comienzo, antes del primer título), nivel, encabezados: [{ titulo,
// nivel }], cabeza, inicio, fin, desde, hasta }] (bytes del archivo; desde/hasta: páginas)
export function seccionesDeCapitulo(buffer) {
  const rs = renglones(buffer);
  // Los renglones que se repiten en el capítulo (cabecera o pie de cada página) no cuentan: ni son título ni son el
  // renglón de al lado de uno.
  const repetidos = new Map();
  for (const r of rs) if (r.texto && !r.marca) repetidos.set(r.texto, (repetidos.get(r.texto) ?? 0) + 1);
  const cabecera = t => (repetidos.get(t) ?? 0) >= TOPES_SECCIONES.repetido && !NUMERADA.test(t) && !RAD.test(t) && !MARCA_LISTA_SIMPLE.test(t) && t.length <= 90;
  const conTexto = rs.map((r, i) => i).filter(i => rs[i].texto && !rs[i].marca && !cabecera(rs[i].texto));
  const titulos = [];
  let finTitulo = -1;
  let cuenta = null; // [mayor, menor] del último numerado («61.19» → [61, 19])
  for (let k = 0; k < conTexto.length; k++) {
    const i = conTexto[k];
    const r = rs[i];
    if (r.pagina == null) continue;
    // «previa» vacía si hay un renglón en blanco en medio (un párrafo que terminó).
    const iPrev = k > 0 ? conTexto[k - 1] : -1;
    const blancoEnMedio = iPrev >= 0 && rs.slice(iPrev + 1, i).some(x => !x.texto);
    // Después de un título, el renglón que sigue puede ser otro título («Sección C ― …» y luego «91.203 …»).
    const previa = iPrev < 0 || blancoEnMedio || iPrev === finTitulo ? '' : rs[iPrev].texto;
    const siguiente = k + 1 < conTexto.length ? rs[conTexto[k + 1]].texto : '';
    const anterior = iPrev < 0 || iPrev === finTitulo ? '' : rs[iPrev].texto;
    let nivel = nivelDeTitulo(r.texto, previa, siguiente, anterior);
    // Un numerado que sigue la cuenta del anterior («61.23» después de «61.19») es título aunque el renglón de antes no
    // termine en punto (pasa en el texto real).
    const num = NUMERADA.exec(r.texto);
    if (!nivel && num && cuenta && empiezaMayuscula(num[2]) && r.texto.length <= 110) {
      const [mayor, menor] = num[1].split('.').map(Number);
      if (mayor === cuenta[0] && menor > cuenta[1]) nivel = 3;
    }
    // Un título «débil» (en MAYÚSCULAS o Mayúsculas Iniciales, sin número): no si el renglón se repite en el capítulo (la
    // cabecera o el pie de cada página de un PDF).
    const debil = nivel && !(RAD.test(r.texto) || CAPITULO.test(r.texto) || SECCION_LETRA.test(r.texto) || num || NUMERO_SOLO.test(r.texto));
    if (!nivel) continue;
    if (num && nivel === 3) cuenta = num[1].split('.').map(Number);
    const rad = /^RAD\s+(\d{1,3})/.exec(r.texto);
    if (rad && nivel === 1) cuenta = [Number(rad[1]), 0];
    // Juntar los renglones que siguen del título.
    let titulo = r.texto;
    let ultimo = k;
    if (NUMERO_SOLO.test(r.texto)) {
      while (ultimo + 1 < conTexto.length && ultimo - k < 12) {
        const s = rs[conTexto[ultimo + 1]].texto;
        if (s.length > 40) break;
        titulo += ` ${s}`;
        ultimo += 1;
        if (/[.:]$/.test(s)) break;
      }
    } else {
      const soloCapitulo = CAPITULO.exec(r.texto) && !CAPITULO.exec(r.texto)[1].trim();
      while (ultimo + 1 < conTexto.length && ultimo - k < 2) {
        const s = rs[conTexto[ultimo + 1]].texto;
        const juntar = (soloCapitulo && ultimo === k && s.length <= 90 && !/[.;]$/.test(s))
          || (SIGUE.test(titulo) && s.length <= 90)
          || (nivel === 1 && mayusculas(titulo) && mayusculas(s) && !RAD.test(s) && !NUMERADA.test(s));
        if (!juntar) break;
        titulo += soloCapitulo && ultimo === k ? ` · ${s}` : ` ${s}`;
        ultimo += 1;
      }
    }
    const fin = rs[conTexto[ultimo]];
    titulos.push({ titulo: limpiarTitulo(titulo), nivel, cabeza: r.inicio, inicio: fin.fin, pagina: r.pagina, debil });
    k = ultimo;
    finTitulo = conTexto[ultimo];
  }
  // Las secciones: del final de un título al comienzo del siguiente.
  const primera = rs.find(r => r.pagina != null && !r.marca);
  const finArchivo = buffer.length;
  const crudas = [];
  if (primera) {
    const finIntro = titulos.length ? titulos[0].cabeza : finArchivo;
    crudas.push({ titulo: null, nivel: 1, cabeza: primera.inicio, inicio: primera.inicio, fin: finIntro, pagina: primera.pagina });
  }
  titulos.forEach((x, j) => crudas.push({ ...x, fin: j + 1 < titulos.length ? titulos[j + 1].cabeza : finArchivo }));
  const cuerpo = s => rs.filter(r => r.inicio >= s.inicio && r.inicio < s.fin && !r.marca).reduce((a, r) => a + r.texto.replace(/\s/g, '').length, 0);
  const paginaEn = pos => { let p = null; for (const r of rs) { if (r.inicio > pos) break; if (r.pagina != null) p = r.pagina; } return p; };
  const secciones = [];
  let pendientes = [];
  for (const s of crudas) {
    // Un título débil con poco texto (las etiquetas de una figura, «FLOAT CHAMBER») queda dentro de la sección de antes.
    const previaSec = secciones.at(-1);
    if (s.debil && previaSec && !pendientes.length && cuerpo(s) < TOPES_SECCIONES.minDebil) {
      previaSec.fin = s.fin;
      previaSec.hasta = paginaEn(Math.max(previaSec.inicio, s.fin - 1));
      continue;
    }
    if (cuerpo(s) < TOPES_SECCIONES.minCuerpo) {
      if (s.titulo) pendientes.push({ titulo: s.titulo, nivel: s.nivel });
      continue;
    }
    secciones.push({ titulo: s.titulo, nivel: s.nivel, encabezados: pendientes, cabeza: s.cabeza, inicio: s.inicio, fin: s.fin, desde: s.pagina ?? paginaEn(s.inicio), hasta: paginaEn(Math.max(s.inicio, s.fin - 1)) });
    pendientes = [];
  }
  // Muy larga: se parte donde empieza una página (la segunda parte lleva el mismo título).
  const partidas = [];
  for (const s of secciones) {
    if (s.fin - s.inicio <= TOPES_SECCIONES.seccionBytes) { partidas.push(s); continue; }
    const cortes = rs.filter(r => r.marca && r.inicio > s.inicio && r.inicio < s.fin);
    let desde = s.inicio;
    let parte = 1;
    for (const c of cortes) {
      if (c.inicio - desde < TOPES_SECCIONES.seccionBytes) continue;
      partidas.push({ ...s, cabeza: parte === 1 ? s.cabeza : desde, inicio: desde, fin: c.inicio, desde: paginaEn(desde), hasta: paginaEn(c.inicio - 1), parte, encabezados: parte === 1 ? s.encabezados : [] });
      desde = c.inicio;
      parte += 1;
    }
    partidas.push({ ...s, inicio: desde, desde: paginaEn(desde), hasta: paginaEn(s.fin - 1), ...(parte > 1 ? { parte, cabeza: desde, encabezados: [] } : {}) });
  }
  return partidas;
}

// En qué sección cae un byte de un archivo. secciones: las del libro (con archivo). → la sección | null
export function seccionEn(secciones, archivo, pos) {
  let hallada = null;
  for (const s of secciones) {
    if (s.archivo !== archivo) continue;
    if (s.cabeza <= pos && pos < s.fin) return s;
    if (s.cabeza <= pos) hallada = s;
  }
  return hallada;
}
