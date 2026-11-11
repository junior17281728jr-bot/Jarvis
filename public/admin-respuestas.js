// Academia (0.8.0): Administrador → Respuestas. La clave completa de lo que está en uso: cada materia → tema → pregunta con
// el enunciado y las opciones TAL CUAL, la correcta resaltada, la explicación original, la sencilla, las ideas equivocadas
// de cada opción y las 2 opciones del Modo reto. Se busca por número o por texto (sin tildes ni mayúsculas).
// Solo se carga cuando el administrador abre esta pestaña (los alumnos nunca bajan este archivo). Las piezas de dibujo
// (el, t, icono…) llegan de app.js, así este módulo no importa nada (sin ciclos).
const sinTildes = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function vistaRespuestas(datos, h) {
  const { el, t, tn, icono, talCual, numero, nombreMateria, partirTitulo, vacio, figuraPregunta, claseMateria } = h;
  if (!datos.materias.length) return el('section', { class: 'tarjeta' }, vacio('libro', t('respuestas.vacio')));
  const tarjetas = [];
  const bloques = datos.materias.map(m => el('section', { class: `respuestas-materia ${claseMateria(m.id)}` },
    el('h2', { class: 'respuestas-materia-titulo', texto: nombreMateria(m.id) }),
    m.temas.map(tema => {
      const { es } = partirTitulo(tema.titulo);
      const preguntas = tema.preguntas.map(q => {
        const buscar = sinTildes([q.numero, q.id, q.enunciado, ...q.opciones.map(o => o.texto), q.explicacion, q.sencilla, ...q.reto.map(r => r.texto)].join(' '));
        const nodo = el('article', { class: 'respuesta-pregunta', 'data-buscar': buscar },
          el('div', { class: 'q-cabeza' },
            el('span', { class: `insignia-pregunta ${q.origen === 'poh' ? 'poh' : 'tg'}` }, icono(q.origen === 'poh' ? 'manual' : 'libro', 'icono chico'),
              el('span', { texto: q.origen === 'poh' ? t('acad.origen.poh_corto') : t('acad.origen.test_guide_sello') }),
              q.numero ? el('span', { class: 'insignia-numero' }, `${t('acad.pregunta')} `, talCual('span', q.numero)) : null),
            q.seccion ? talCual('span', q.seccion, 'q-seccion') : null),
          talCual('p', q.enunciado, 'q-enunciado'),
          figuraPregunta(q),
          el('ul', { class: 'respuesta-opciones' }, q.opciones.map(o => el('li', { class: o.letra === q.correcta ? 'es-correcta' : null },
            el('span', { class: 'opcion-letra', texto: o.letra }), talCual('span', o.texto, 'opcion-texto'),
            o.letra === q.correcta ? el('span', { class: 'respuesta-sello', texto: t('respuestas.correcta') })
              : q.errores?.[o.letra] ? talCual('span', q.errores[o.letra], 'respuesta-idea') : null))),
          q.explicacion ? el('section', { class: 'caja-hoja caja-original' },
            el('h3', { class: 'con-icono' }, icono('libro', 'icono chico'), el('span', { texto: q.origen === 'poh' ? t('acad.explicacion_poh') : t('acad.explicacion_original') })),
            talCual('p', q.explicacion)) : null,
          el('section', { class: 'caja-hoja caja-sencilla' },
            el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: t('acad.explicacion_sencilla') })),
            talCual('p', q.sencilla)),
          q.reto.length ? el('section', { class: 'caja-hoja caja-reto' },
            el('h3', { class: 'con-icono' }, icono('rayo', 'icono chico'), el('span', { texto: t('respuestas.reto') })),
            el('ul', { class: 'lista-reto' }, q.reto.map(r => el('li', {},
              talCual('p', r.texto, 'reto-texto'),
              r.porque ? talCual('p', r.porque, 'reto-porque') : null,
              r.trampa ? el('p', { class: 'suave chica' }, el('strong', { texto: `${t('reto.trampa')}: ` }), talCual('span', r.trampa)) : null)))) : null);
        tarjetas.push(nodo);
        return nodo;
      });
      return el('details', { class: 'respuestas-tema', open: true },
        el('summary', {}, el('span', { texto: es }), el('span', { class: 'suave chica', texto: tn('acad.n_preguntas', { n: tema.preguntas.length }) })),
        preguntas.length ? preguntas : el('p', { class: 'suave', texto: t('respuestas.sin_preguntas') }));
    })));
  const cuenta = el('p', { class: 'suave', role: 'status' });
  const campo = el('input', { id: 'campo-buscar-respuestas', type: 'search', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'search', placeholder: t('respuestas.buscar') });
  const filtrar = () => {
    const q = sinTildes(campo.value);
    let n = 0;
    for (const x of tarjetas) {
      const si = !q || x.dataset.buscar.includes(q);
      x.hidden = !si;
      if (si) n += 1;
    }
    for (const d of bloques.flatMap(b => [...b.querySelectorAll('.respuestas-tema')])) d.hidden = Boolean(q) && !d.querySelector('.respuesta-pregunta:not([hidden])');
    cuenta.textContent = t('respuestas.cuenta', { n: numero(n), total: numero(tarjetas.length) });
  };
  campo.addEventListener('input', filtrar);
  filtrar();
  return el('div', { class: 'respuestas' },
    el('section', { class: 'tarjeta respuestas-buscar' },
      el('label', { for: 'campo-buscar-respuestas', class: 'con-icono' }, icono('lupa', 'icono chico'), el('span', { texto: t('respuestas.buscar_etiqueta') })),
      campo, cuenta,
      el('p', { class: 'suave chica', texto: t('respuestas.privado') })),
    bloques);
}
