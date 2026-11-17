// Academia 0.14.26: Administrador → «Opiniones de los alumnos» (#opiniones): lo que dijeron al terminar cada tema y cada
// examen («¿Cómo te fue con esta clase?»), por materia y tema, con cuántos y sus comentarios (sin nombres). «Exportar para
// el programador»: el mismo resumen en texto o en JSON, para revisarlo después.
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

const EMOJI = { clara: '👍', duda: '🤔', mejorar: '💡' };

// El resumen como texto para el programador. nombre(materia) y nombreTema(materia, tema) dan los nombres que se ven.
export function textoOpiniones(datos, { nombre = m => m, nombreTema = (m, t) => t } = {}) {
  const lineas = [`Opiniones de los alumnos (${datos.generado ?? ''})`, ''];
  for (const m of datos.materias ?? []) {
    lineas.push(`## ${nombre(m.materia)} (${m.materia})`);
    for (const l of m.lugares) {
      const donde = l.tipo === 'examen' ? 'Examen de la materia' : `Tema: ${l.titulo ?? nombreTema(m.materia, l.tema)} (${l.tema})`;
      lineas.push(`- ${donde} · ${l.alumnos} alumnos · 👍 ${l.clara} · 🤔 ${l.duda} · 💡 ${l.mejorar}`);
      for (const x of l.textos ?? []) lineas.push(`    ${EMOJI[x.voto] ?? ''} ${x.texto}`);
    }
    lineas.push('');
  }
  return lineas.join('\n');
}
export const jsonOpiniones = datos => JSON.stringify({ generado: datos.generado ?? null, materias: datos.materias ?? [] }, null, 2);

function bajar(contenido, nombreArchivo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombreArchivo;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

export function vistaOpiniones(datos, h) {
  const { el, t } = h;
  const nombre = m => h.nombreMateria?.(m) ?? m;
  const fecha = (datos.generado ?? '').slice(0, 10);
  const exportar = el('div', { class: 'botones' },
    el('button', { type: 'button', class: 'con-icono', onclick: () => bajar(textoOpiniones(datos, { nombre }), `opiniones-${fecha}.txt`, 'text/plain;charset=utf-8') }, h.icono('manual'), el('span', { texto: t('opiniones.exportar.texto') })),
    el('button', { type: 'button', class: 'secundario con-icono', onclick: () => bajar(jsonOpiniones(datos), `opiniones-${fecha}.json`, 'application/json') }, h.icono('carpeta'), el('span', { texto: t('opiniones.exportar.json') })));
  const fila = (m, l) => el('li', { class: 'opinion-lugar' },
    el('div', { class: 'opinion-lugar-cabeza' },
      el('strong', { texto: l.tipo === 'examen' ? t('opiniones.examen') : t('opiniones.tema', { tema: l.titulo ?? l.tema }) }),
      el('span', { class: 'opinion-cuentas' },
        h.insignia('bien', `👍 ${h.numero(l.clara)}`), h.insignia(l.duda ? 'atencion' : 'info', `🤔 ${h.numero(l.duda)}`), h.insignia(l.mejorar ? 'atencion' : 'info', `💡 ${h.numero(l.mejorar)}`))),
    l.textos?.length ? el('ul', { class: 'opinion-textos' }, l.textos.map(x => el('li', {}, el('span', { 'aria-hidden': 'true', texto: `${EMOJI[x.voto] ?? ''} ` }), h.talCual('span', x.texto)))) : null);
  return [
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: t('opiniones.titulo') })),
      el('p', { class: 'suave', texto: t('opiniones.linea') }),
      exportar),
    datos.materias.length ? datos.materias.map(m => el('section', { class: 'tarjeta' },
      el('h2', { texto: nombre(m.materia) }),
      el('ul', { class: 'opinion-lugares' }, m.lugares.map(l => fila(m, l)))))
      : el('section', { class: 'tarjeta' }, h.vacio('chispa', t('opiniones.vacio'))),
  ];
}
