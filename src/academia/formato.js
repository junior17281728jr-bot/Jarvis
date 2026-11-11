// Academia (etapa 1, 0.7.0): el formato del «paquete» de contenido, versión 1 (ver README, «Paquete de contenido»).
// El paquete trae los libros y las preguntas del Test Guide y vive SOLO en la carpeta de datos del servidor: nunca en el
// repositorio (es público). Aquí solo se revisa que esté bien armado; nunca se cambia ni se recorta un texto: lo del
// Test Guide se guarda y se muestra tal cual (sin trim, sin normalizar).

// Las 11 materias de ENALAS (piloto privado), en el orden fijo de la escuela. Sus nombres están en public/i18n.
export const MATERIAS = Object.freeze([
  'factores_humanos', 'sistemas', 'aerodinamica', 'ambiente_vuelo', 'rad', 'poh',
  'comunicacion', 'meteorologia', 'rendimiento', 'navegacion', 'sms',
]);
export const ORIGENES = Object.freeze(['test_guide', 'poh']);
export const FORMATO = 'academia-enalas';
export const VERSION_FORMATO = 1;

export const LIMITES = Object.freeze({
  jsonBytes: 12 * 1024 * 1024,
  figuraBytes: 8 * 1024 * 1024,
  audioBytes: 40 * 1024 * 1024, // 0.7.1: la narración (mp3) de una materia o de un tema
  audios: 500,
  figurasBytes: 400 * 1024 * 1024,
  figuras: 2000,
  preguntas: 5000,
  temasPorMateria: 200,
  seccionesPorTema: 100,
  texto: 60_000,
  corto: 400,
  errores: 50,
  escenas: 300, // 0.7.2: escenas del video resumen de una materia
});

export const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const ARCHIVO_FIGURA = /^[a-z0-9][a-z0-9._-]{0,80}\.(png|jpg|jpeg|webp)$/i;
// 0.7.1: una materia o un tema puede traer su narración en mp3 («audio»: { archivo, titulo?, sha256? }). Es opcional:
// un paquete sin audio es igual que antes, y uno cuyo audio todavía no llegó se usa igual (el reproductor no sale).
export const ARCHIVO_AUDIO = /^[a-z0-9][a-z0-9._-]{0,80}\.mp3$/i;
// 0.7.2: el tipo de un dibujo (public/clase/visuales.js: titulo, ala, motor, instrumentos, escenario, meteo…).
export const TIPO_VISUAL = /^[a-z][a-z0-9_-]{0,39}$/;
const LETRA = /^[A-F]$/;
const SHA256 = /^[a-f0-9]{64}$/;

const esObjeto = v => v != null && typeof v === 'object' && !Array.isArray(v);

// Revisa el paquete ya leído (JSON.parse). Devuelve { ok, errores: [{ ruta, motivo }], resumen, figuras }.
// Las rutas dicen exactamente dónde está el problema («materias[2].temas[0].preguntas[5]»), para quien arma el paquete.
export function revisarPaquete(p) {
  const errores = [];
  const mal = (ruta, motivo) => { if (errores.length < LIMITES.errores) errores.push({ ruta, motivo }); };
  const texto = (v, ruta, { obligatorio = true, max = LIMITES.texto } = {}) => {
    if (v == null) { if (obligatorio) mal(ruta, 'falta'); return false; }
    if (typeof v !== 'string') { mal(ruta, 'no_es_texto'); return false; }
    if (obligatorio && !v.trim()) { mal(ruta, 'vacio'); return false; }
    if (v.length > max) { mal(ruta, 'muy_largo'); return false; }
    if (v.includes('\u0000')) { mal(ruta, 'caracter_no_valido'); return false; }
    return true;
  };
  const id = (v, ruta) => {
    if (typeof v !== 'string' || !ID_VALIDO.test(v)) { mal(ruta, 'id_no_valido'); return false; }
    return true;
  };
  if (!esObjeto(p)) return { ok: false, errores: [{ ruta: '', motivo: 'no_es_objeto' }] };
  if (p.formato !== FORMATO) mal('formato', 'formato_desconocido');
  if (p.version !== VERSION_FORMATO) mal('version', 'version_desconocida');
  texto(p.nombre, 'nombre', { max: LIMITES.corto });
  texto(p.edicion, 'edicion', { obligatorio: false, max: LIMITES.corto });
  if (p.muestra != null && typeof p.muestra !== 'boolean') mal('muestra', 'no_es_si_o_no');

  // Libros (las fuentes que se citan).
  const libros = new Set();
  if (!Array.isArray(p.libros) || !p.libros.length) mal('libros', 'falta');
  else p.libros.forEach((l, i) => {
    const r = `libros[${i}]`;
    if (!esObjeto(l)) return mal(r, 'no_es_objeto');
    if (id(l.id, `${r}.id`)) { if (libros.has(l.id)) mal(`${r}.id`, 'repetido'); libros.add(l.id); }
    texto(l.titulo, `${r}.titulo`, { max: LIMITES.corto });
    if (l.idioma != null && !['es', 'en'].includes(l.idioma)) mal(`${r}.idioma`, 'idioma_no_valido');
  });
  const fuentes = (lista, ruta, { obligatorio }) => {
    if (lista == null && !obligatorio) return;
    if (!Array.isArray(lista) || (obligatorio && !lista.length)) return mal(ruta, 'falta');
    lista.forEach((f, i) => {
      const r = `${ruta}[${i}]`;
      if (!esObjeto(f)) return mal(r, 'no_es_objeto');
      if (!libros.has(f.libro)) mal(`${r}.libro`, 'libro_desconocido');
      for (const campo of ['capitulo', 'seccion', 'pagina']) texto(f[campo], `${r}.${campo}`, { obligatorio: campo === 'pagina', max: LIMITES.corto });
    });
  };
  // 0.7.2: un dibujo de las clases (public/clase): { tipo, parametros? }. Un tipo que la app no conoce se ve como una
  // tarjeta con el texto (no es error): así un paquete nuevo no rompe una app vieja.
  const visual = (v, ruta) => {
    if (v == null) return;
    if (!esObjeto(v)) return mal(ruta, 'no_es_objeto');
    if (typeof v.tipo !== 'string' || !TIPO_VISUAL.test(v.tipo)) mal(`${ruta}.tipo`, 'tipo_desconocido');
    if (v.parametros != null && !esObjeto(v.parametros)) mal(`${ruta}.parametros`, 'no_es_objeto');
    else if (v.parametros != null && JSON.stringify(v.parametros).length > LIMITES.texto) mal(`${ruta}.parametros`, 'muy_largo');
  };
  const palabrasIngles = (lista, ruta, obligatorios) => {
    if (lista == null) return;
    if (!Array.isArray(lista) || lista.length > 20) return mal(ruta, 'no_es_lista');
    lista.forEach((w, j) => {
      const rw = `${ruta}[${j}]`;
      if (!esObjeto(w)) return mal(rw, 'no_es_objeto');
      texto(w.palabra, `${rw}.palabra`, { max: LIMITES.corto });
      for (const campo of ['pronunciacion', 'significado', 'ejemplo']) texto(w[campo], `${rw}.${campo}`, { obligatorio: obligatorios.includes(campo), max: 2000 });
    });
  };
  const secciones = (lista, ruta, { obligatorio }) => {
    if (lista == null && !obligatorio) return 0;
    if (!Array.isArray(lista) || (obligatorio && !lista.length)) { mal(ruta, 'falta'); return 0; }
    if (lista.length > LIMITES.seccionesPorTema) mal(ruta, 'demasiadas');
    lista.forEach((s, i) => {
      const r = `${ruta}[${i}]`;
      if (!esObjeto(s)) return mal(r, 'no_es_objeto');
      texto(s.titulo, `${r}.titulo`, { max: LIMITES.corto });
      if (s.tipo != null && s.tipo !== 'tarjeta') mal(`${r}.tipo`, 'tipo_desconocido');
      if (s.tipo === 'tarjeta') {
        // 0.7.2: una tarjeta ya partida (una idea por pantalla): 1 a 6 puntos cortos, «Recuerda», ejemplo, inglés y dibujo.
        if (!Array.isArray(s.puntos) || !s.puntos.length || s.puntos.length > 6) mal(`${r}.puntos`, s.puntos == null ? 'falta' : 'no_es_lista');
        else s.puntos.forEach((x, k) => texto(x, `${r}.puntos[${k}]`, { max: 2000 }));
        texto(s.texto, `${r}.texto`, { obligatorio: false });
        texto(s.recuerda, `${r}.recuerda`, { obligatorio: false, max: 2000 });
        texto(s.ejemplo, `${r}.ejemplo`, { obligatorio: false, max: 2000 });
        palabrasIngles(s.ingles, `${r}.ingles`, []);
        visual(s.visual, `${r}.visual`);
      } else {
        texto(s.texto, `${r}.texto`);
      }
      texto(s.nota, `${r}.nota`, { obligatorio: false });
      fuentes(s.fuentes, `${r}.fuentes`, { obligatorio: true });
    });
    return lista.length;
  };

  // Figuras: por número, cada una con su archivo.
  const figuras = new Map();
  const archivos = new Set();
  if (p.figuras != null && !Array.isArray(p.figuras)) mal('figuras', 'no_es_lista');
  (Array.isArray(p.figuras) ? p.figuras : []).forEach((f, i) => {
    const r = `figuras[${i}]`;
    if (i >= LIMITES.figuras) return i === LIMITES.figuras ? mal('figuras', 'demasiadas') : null;
    if (!esObjeto(f)) return mal(r, 'no_es_objeto');
    if (texto(f.numero, `${r}.numero`, { max: 40 })) { if (figuras.has(f.numero)) mal(`${r}.numero`, 'repetido'); }
    if (typeof f.archivo !== 'string' || !ARCHIVO_FIGURA.test(f.archivo)) mal(`${r}.archivo`, 'archivo_no_valido');
    else if (archivos.has(f.archivo.toLowerCase())) mal(`${r}.archivo`, 'repetido');
    else archivos.add(f.archivo.toLowerCase());
    if (f.sha256 != null && (typeof f.sha256 !== 'string' || !SHA256.test(f.sha256))) mal(`${r}.sha256`, 'no_valido');
    texto(f.titulo, `${r}.titulo`, { obligatorio: false, max: LIMITES.corto });
    if (typeof f.numero === 'string') figuras.set(f.numero, { numero: f.numero, archivo: f.archivo, sha256: f.sha256 ?? null });
  });

  // Preguntas: lo ORIGINAL (tal cual) va en «original»; lo agregado para entender, aparte.
  const preguntas = new Map();
  if (!Array.isArray(p.preguntas)) mal('preguntas', 'falta');
  else if (p.preguntas.length > LIMITES.preguntas) mal('preguntas', 'demasiadas');
  else p.preguntas.forEach((q, i) => {
    const r = `preguntas[${i}]`;
    if (!esObjeto(q)) return mal(r, 'no_es_objeto');
    if (id(q.id, `${r}.id`)) { if (preguntas.has(q.id)) mal(`${r}.id`, 'repetido'); preguntas.set(q.id, q); }
    if (!ORIGENES.includes(q.origen)) mal(`${r}.origen`, 'origen_no_valido');
    const o = q.original;
    if (!esObjeto(o)) return mal(`${r}.original`, 'falta');
    texto(o.numero, `${r}.original.numero`, { obligatorio: q.origen === 'test_guide', max: 40 });
    texto(o.seccion, `${r}.original.seccion`, { obligatorio: false, max: LIMITES.corto });
    texto(o.enunciado, `${r}.original.enunciado`);
    texto(o.explicacion, `${r}.original.explicacion`, { obligatorio: q.origen === 'test_guide' });
    texto(o.pagina, `${r}.original.pagina`, { obligatorio: false, max: 40 });
    const letras = [];
    if (!Array.isArray(o.opciones) || o.opciones.length < 2 || o.opciones.length > 6) mal(`${r}.original.opciones`, 'opciones_no_validas');
    else o.opciones.forEach((op, j) => {
      const ro = `${r}.original.opciones[${j}]`;
      if (!esObjeto(op)) return mal(ro, 'no_es_objeto');
      if (typeof op.letra !== 'string' || !LETRA.test(op.letra) || letras.includes(op.letra)) mal(`${ro}.letra`, 'letra_no_valida');
      else letras.push(op.letra);
      texto(op.texto, `${ro}.texto`);
    });
    if (!letras.includes(o.correcta)) mal(`${r}.original.correcta`, 'correcta_no_es_opcion');
    if (o.figura != null && (typeof o.figura !== 'string' || !figuras.has(o.figura))) mal(`${r}.original.figura`, 'figura_desconocida');
    if (q.origen === 'poh') fuentes(q.fuente == null ? null : [q.fuente], `${r}.fuente`, { obligatorio: true });
    texto(q.sencilla, `${r}.sencilla`);
    if (q.errores != null) {
      if (!esObjeto(q.errores)) mal(`${r}.errores`, 'no_es_objeto');
      else for (const [letra, idea] of Object.entries(q.errores)) {
        if (!letras.includes(letra) || letra === o.correcta) mal(`${r}.errores.${letra}`, 'no_es_opcion_incorrecta');
        texto(idea, `${r}.errores.${letra}`);
      }
    }
    palabrasIngles(q.ingles, `${r}.ingles`, ['pronunciacion', 'significado', 'ejemplo']);
  });

  // 0.7.1: la narración (mp3) de una materia o de un tema. El mismo archivo puede servir a dos lugares.
  const audios = new Map();
  const audio = (a, ruta) => {
    if (a == null) return;
    if (!esObjeto(a)) return mal(ruta, 'no_es_objeto');
    if (typeof a.archivo !== 'string' || !ARCHIVO_AUDIO.test(a.archivo)) return mal(`${ruta}.archivo`, 'archivo_no_valido');
    if (a.sha256 != null && (typeof a.sha256 !== 'string' || !SHA256.test(a.sha256))) mal(`${ruta}.sha256`, 'no_valido');
    texto(a.titulo, `${ruta}.titulo`, { obligatorio: false, max: LIMITES.corto });
    const ya = audios.get(a.archivo.toLowerCase());
    if (ya && ya.sha256 !== (a.sha256 ?? null)) mal(`${ruta}.sha256`, 'no_valido');
    else if (!ya) {
      if (audios.size >= LIMITES.audios) return mal(ruta, 'demasiados');
      audios.set(a.archivo.toLowerCase(), { archivo: a.archivo, sha256: a.sha256 ?? null });
    }
  };

  // 0.7.2: el «Video resumen» de una materia (lo primero del camino de la materia): su narración (un mp3, como «audio»)
  // y las escenas con su tiempo dentro de ese mp3. Sin escenas se ve una sola escena con el título; sin audio, las
  // escenas van por su tiempo con subtítulos. Los campos de más que traiga una escena se ignoran.
  const video = (v, ruta) => {
    if (v == null) return;
    if (!esObjeto(v)) return mal(ruta, 'no_es_objeto');
    texto(v.titulo, `${ruta}.titulo`, { obligatorio: false, max: LIMITES.corto });
    audio(v.audio, `${ruta}.audio`);
    if (v.escenas == null) { if (v.audio == null) mal(`${ruta}.escenas`, 'falta'); return; }
    if (!Array.isArray(v.escenas) || v.escenas.length > LIMITES.escenas) return mal(`${ruta}.escenas`, 'no_es_lista');
    v.escenas.forEach((e, k) => {
      const re = `${ruta}.escenas[${k}]`;
      if (!esObjeto(e)) return mal(re, 'no_es_objeto');
      const inicio = e.inicio_s, fin = e.fin_s;
      if (typeof inicio !== 'number' || !Number.isFinite(inicio) || inicio < 0 || inicio > 36_000) mal(`${re}.inicio_s`, 'tiempo_no_valido');
      else if (typeof fin !== 'number' || !Number.isFinite(fin) || fin <= inicio || fin > 36_000) mal(`${re}.fin_s`, 'tiempo_no_valido');
      texto(e.subtitulo, `${re}.subtitulo`, { obligatorio: e.texto_pantalla == null, max: LIMITES.corto });
      texto(e.texto_pantalla, `${re}.texto_pantalla`, { obligatorio: false, max: 2000 });
      texto(e.texto_narracion, `${re}.texto_narracion`, { obligatorio: false, max: 20_000 });
      visual(e.visual, `${re}.visual`);
    });
  };

  // Materias (de las 11, en su orden; puede faltar alguna) → temas → secciones y las preguntas del tema.
  const usadas = new Map();
  let temas = 0;
  let ultima = -1;
  const materiasVistas = new Set();
  if (!Array.isArray(p.materias) || !p.materias.length) mal('materias', 'falta');
  else p.materias.forEach((m, i) => {
    const r = `materias[${i}]`;
    if (!esObjeto(m)) return mal(r, 'no_es_objeto');
    const lugar = MATERIAS.indexOf(m.id);
    if (lugar < 0) mal(`${r}.id`, 'materia_desconocida');
    else if (materiasVistas.has(m.id)) mal(`${r}.id`, 'repetido');
    else if (lugar < ultima) mal(`${r}.id`, 'fuera_de_orden');
    else { ultima = lugar; materiasVistas.add(m.id); }
    audio(m.audio, `${r}.audio`);
    video(m.video, `${r}.video`);
    if (!Array.isArray(m.temas)) return mal(`${r}.temas`, 'falta');
    if (m.temas.length > LIMITES.temasPorMateria) mal(`${r}.temas`, 'demasiados');
    const ids = new Set();
    m.temas.forEach((t, j) => {
      const rt = `${r}.temas[${j}]`;
      if (!esObjeto(t)) return mal(rt, 'no_es_objeto');
      if (id(t.id, `${rt}.id`)) { if (ids.has(t.id)) mal(`${rt}.id`, 'repetido'); ids.add(t.id); }
      texto(t.titulo, `${rt}.titulo`, { max: LIMITES.corto });
      secciones(t.secciones, `${rt}.secciones`, { obligatorio: true });
      secciones(t.reexplicacion, `${rt}.reexplicacion`, { obligatorio: false });
      audio(t.audio, `${rt}.audio`);
      temas += 1;
      if (!Array.isArray(t.preguntas)) return mal(`${rt}.preguntas`, 'falta');
      t.preguntas.forEach((qid, k) => {
        const rq = `${rt}.preguntas[${k}]`;
        if (!preguntas.has(qid)) return mal(rq, 'pregunta_desconocida');
        if (usadas.has(qid)) return mal(rq, 'pregunta_en_dos_temas');
        usadas.set(qid, { materia: m.id, tema: t.id });
      });
    });
  });
  for (const qid of preguntas.keys()) if (!usadas.has(qid)) mal(`preguntas[${[...preguntas.keys()].indexOf(qid)}]`, 'pregunta_sin_tema');

  const ok = errores.length === 0;
  return {
    ok,
    errores,
    resumen: ok ? { nombre: p.nombre, edicion: p.edicion ?? null, muestra: p.muestra === true, materias: materiasVistas.size, temas, preguntas: preguntas.size, figuras: figuras.size } : null,
    figuras: ok ? [...figuras.values()] : [],
    audios: ok ? [...audios.values()] : [],
    // Las materias que el paquete TRAE (con un tema o más): las que da cuando está en uso junto con otros.
    materias: ok ? p.materias.filter(m => m.temas.length > 0).map(m => m.id) : [],
  };
}

// Los audios que nombra un paquete YA REVISADO (sin repetir), sin volver a revisarlo entero.
export function audiosDe(p) {
  const vistos = new Map();
  for (const m of p?.materias ?? []) {
    for (const a of [m?.audio, m?.video?.audio, ...(m?.temas ?? []).map(t => t?.audio)]) {
      if (a?.archivo && !vistos.has(a.archivo.toLowerCase())) vistos.set(a.archivo.toLowerCase(), { archivo: a.archivo, sha256: a.sha256 ?? null });
    }
  }
  return [...vistos.values()];
}

// El paquete ya revisado, listo para usar: materias en el orden fijo, preguntas por id y figuras por número.
export function indexarPaquete(p) {
  const preguntas = new Map();
  const deTema = new Map();
  for (const q of p.preguntas) preguntas.set(q.id, q);
  const materias = MATERIAS.map(idMateria => {
    const m = p.materias.find(x => x.id === idMateria);
    const temas = (m?.temas ?? []).map(t => {
      for (const qid of t.preguntas) deTema.set(qid, { materia: idMateria, tema: t.id });
      return { id: t.id, titulo: t.titulo, secciones: t.secciones, reexplicacion: t.reexplicacion ?? [], preguntas: [...t.preguntas], audio: t.audio ?? null };
    });
    return { id: idMateria, temas, audio: m?.audio ?? null, video: m?.video ?? null };
  });
  const figuras = new Map((p.figuras ?? []).map(f => [f.numero, f]));
  const libros = new Map(p.libros.map(l => [l.id, l]));
  return { nombre: p.nombre, edicion: p.edicion ?? null, muestra: p.muestra === true, materias, preguntas, deTema, figuras, libros };
}
