// Academia 0.9.1: lo que se ve después de responder (la hoja de abajo y la revisión al terminar), más fácil de leer:
//  1. El resultado grande: la opción correcta con su texto (no solo la letra).
//  2. «Explicación sencilla» PRIMERO, como lo principal. Si viene en líneas con su rótulo («✔ La correcta es…»,
//     «Por qué:», «Piensa así:», «Truco para recordar:»), cada línea es una fila con su ícono; un párrafo largo se
//     parte en esos mismos rótulos. El texto no se cambia: solo se separa en filas.
//  3. «Por qué tu opción no» (si fallaste): tu opción y por qué no (la idea del error o, en Modo reto, el porqué
//     de esa opción nueva), resaltado.
//  4. La explicación original del Test Guide, TAL CUAL, en un bloque que se abre (segundo plano).
//  5. La figura (miniatura, se amplía al tocarla) y las palabras en inglés.
// Recibe lo que necesita de app.js (el, t, icono, talCual, …), como perfil-vista.js.

// Los rótulos que se reconocen al principio de una línea: [patrón, tipo, ícono].
const ROTULOS = [
  [/^[✔✓]\s*/u, 'correcta', 'marca'],
  [/^por qu[eé]( no)?\s*:/iu, 'porque', 'info'],
  [/^piensa as[ií]\s*:/iu, 'piensa', 'bombilla'],
  [/^(truco para recordar|truco|para recordar|para aprender)\s*:/iu, 'truco', 'estrella'],
  [/^(la respuesta correcta es|la correcta es)\b/iu, 'correcta', 'marca'],
  [/^pregunta\s*:/iu, 'pregunta', 'lupa'],
];
// Dónde se puede partir un párrafo largo: justo antes de uno de los rótulos (después de un punto o un signo).
const CORTE = /(?<=[.!?…])\s+(?=(?:[✔✓]|Por qu[eé](?: no)?\s*:|Piensa as[ií]\s*:|Truco para recordar\s*:|Truco\s*:|Para recordar\s*:|Para aprender\s*:|La respuesta correcta es\b|La correcta es\b))/u;

// Las filas de la explicación sencilla: [{ tipo, icono, rotulo, resto }]. Juntas dicen exactamente el texto (sin
// contar los saltos de línea y los espacios entre filas).
export function filasSencilla(texto) {
  const lineas = String(texto ?? '').split(/\n+/).map(x => x.trim()).filter(Boolean).flatMap(l => l.split(CORTE).map(x => x.trim()).filter(Boolean));
  return lineas.map(linea => {
    for (const [patron, tipo, icono] of ROTULOS) {
      const m = patron.exec(linea);
      if (m) return { tipo, icono, rotulo: m[0].trim(), resto: linea.slice(m[0].length).trim() };
    }
    return { tipo: 'texto', icono: null, rotulo: '', resto: linea };
  });
}

export function partesClaras(q, resp, { enHoja = false } = {}, h) {
  const { el, t, icono, talCual, fichaIngles, figuraPregunta } = h;
  const opcion = letra => q.opciones.find(o => o.letra === letra)?.texto ?? '';
  const correcta = resp.correcta;
  const fallo = !resp.acierto && resp.elegida && resp.elegida !== correcta;
  // En Modo reto: por qué la opción que eligió no es la buena.
  const suReto = resp.modo === 'reto' ? (resp.reto ?? []).find(o => o.letra === resp.elegida) : null;
  const filas = filasSencilla(resp.sencilla);
  return [
    enHoja ? el('div', { class: `resp-correcta ${resp.acierto ? 'bien' : 'mal'}` },
      el('span', { class: 'resp-correcta-rotulo', texto: t('resp.la_correcta') }),
      el('div', { class: 'resp-correcta-opcion' }, el('span', { class: 'opcion-letra', texto: correcta }), talCual('span', opcion(correcta), 'resp-correcta-texto'))) : null,
    resp.modo === 'reto' && resp.letraOriginal && resp.letraOriginal !== correcta
      ? el('p', { class: 'nota-letras con-icono' }, icono('info', 'icono chico'), el('span', { texto: t('reto.letras', { aqui: correcta, original: resp.letraOriginal }) })) : null,
    filas.length ? el('section', { class: 'caja-hoja caja-sencilla principal' },
      el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: t('acad.explicacion_sencilla') })),
      el('div', { class: 'sencilla-filas' }, filas.map(f => f.tipo === 'texto'
        ? talCual('p', f.resto, 'sencilla-fila tipo-texto')
        : el('p', { class: `sencilla-fila tipo-${f.tipo}` },
          el('span', { class: 'sencilla-icono', 'aria-hidden': 'true' }, icono(f.icono, 'icono chico')),
          el('span', { class: 'sencilla-texto' }, el('strong', { class: 'sencilla-rotulo', texto: f.rotulo }), f.resto ? ` ${f.resto}` : ''))))) : null,
    fallo && (resp.idea || suReto) ? el('section', { class: 'caja-hoja caja-tuya' },
      el('h3', { class: 'con-icono' }, icono('atencion', 'icono chico'), el('span', { texto: t('resp.tu_opcion_no') })),
      el('p', { class: 'tuya-opcion' }, el('span', { class: 'opcion-letra', texto: resp.elegida }), talCual('span', suReto?.texto ?? opcion(resp.elegida))),
      resp.idea ? talCual('p', resp.idea) : null,
      suReto?.porque ? talCual('p', suReto.porque) : null,
      (resp.trampa || suReto?.trampa) ? el('p', { class: 'tuya-trampa' }, el('strong', { texto: `${t('reto.trampa')}: ` }), talCual('span', resp.trampa || suReto.trampa)) : null) : null,
    // 0.8.0: en Modo reto, por qué es incorrecta CADA opción nueva (y la trampa que tiende): se abre si se quiere.
    resp.modo === 'reto' && resp.reto?.length ? el('details', { class: 'caja-hoja caja-reto plegable-hoja' },
      el('summary', { class: 'con-icono' }, icono('rayo', 'icono chico'), el('span', { texto: t('reto.por_que') })),
      el('ul', { class: 'lista-reto' }, resp.reto.map(o => el('li', {},
        el('p', {}, el('strong', { texto: `${o.letra}. ` }), talCual('span', o.texto)),
        o.porque ? talCual('p', o.porque, 'reto-porque') : null,
        o.trampa ? el('p', { class: 'suave chica' }, el('strong', { texto: `${t('reto.trampa')}: ` }), talCual('span', o.trampa)) : null)))) : null,
    // La explicación del Test Guide (o del POH), tal cual: en segundo plano, se abre al tocar.
    resp.explicacion ? el('details', { class: 'caja-hoja caja-original plegable-hoja' },
      el('summary', { class: 'con-icono' }, icono('libro', 'icono chico'), el('span', { texto: q.origen === 'poh' ? t('acad.explicacion_poh') : t('acad.explicacion_original') })),
      talCual('p', resp.explicacion)) : null,
    enHoja && q.figura ? el('div', { class: 'resp-figura' }, figuraPregunta(q)) : null,
    resp.ingles?.length ? el('section', { class: 'caja-hoja caja-ingles' },
      el('h3', { class: 'con-icono' }, icono('avion', 'icono chico'), el('span', { texto: t('acad.ingles') })),
      el('ul', { class: 'lista-ingles' }, resp.ingles.map(w => el('li', {},
        fichaIngles(w), el('span', { class: 'ingles-significado', texto: w.significado }), w.ejemplo ? el('em', { class: 'ingles-ejemplo', lang: 'en', texto: w.ejemplo }) : null)))) : null,
  ];
}
