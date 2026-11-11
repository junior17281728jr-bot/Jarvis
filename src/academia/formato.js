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
  figurasBytes: 400 * 1024 * 1024,
  figuras: 2000,
  preguntas: 5000,
  temasPorMateria: 200,
  seccionesPorTema: 100,
  texto: 60_000,
  corto: 400,
  errores: 50,
});

export const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const ARCHIVO_FIGURA = /^[a-z0-9][a-z0-9._-]{0,80}\.(png|jpg|jpeg|webp)$/i;
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
  const secciones = (lista, ruta, { obligatorio }) => {
    if (lista == null && !obligatorio) return 0;
    if (!Array.isArray(lista) || (obligatorio && !lista.length)) { mal(ruta, 'falta'); return 0; }
    if (lista.length > LIMITES.seccionesPorTema) mal(ruta, 'demasiadas');
    lista.forEach((s, i) => {
      const r = `${ruta}[${i}]`;
      if (!esObjeto(s)) return mal(r, 'no_es_objeto');
      texto(s.titulo, `${r}.titulo`, { max: LIMITES.corto });
      texto(s.texto, `${r}.texto`);
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
    if (q.ingles != null) {
      if (!Array.isArray(q.ingles) || q.ingles.length > 20) mal(`${r}.ingles`, 'no_es_lista');
      else q.ingles.forEach((w, j) => {
        const rw = `${r}.ingles[${j}]`;
        if (!esObjeto(w)) return mal(rw, 'no_es_objeto');
        texto(w.palabra, `${rw}.palabra`, { max: LIMITES.corto });
        for (const campo of ['pronunciacion', 'significado', 'ejemplo']) texto(w[campo], `${rw}.${campo}`, { max: 2000 });
      });
    }
  });

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
  };
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
      return { id: t.id, titulo: t.titulo, secciones: t.secciones, reexplicacion: t.reexplicacion ?? [], preguntas: [...t.preguntas] };
    });
    return { id: idMateria, temas };
  });
  const figuras = new Map((p.figuras ?? []).map(f => [f.numero, f]));
  const libros = new Map(p.libros.map(l => [l.id, l]));
  return { nombre: p.nombre, edicion: p.edicion ?? null, muestra: p.muestra === true, materias, preguntas, deTema, figuras, libros };
}
