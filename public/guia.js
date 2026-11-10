// «Primeros pasos» y la Ayuda (0.5.1): solo cuentas y listas, sin pantallas (para poder probarlas).
// Todo sale de respuestas que las pantallas ya piden: GET /api/proyectos, /api/admin/sistema y /api/admin/ia.

// Las palabras que se explican con el botón (i) y en la pantalla Ayuda. Cada una tiene en los textos
// ayuda.<tema>.titulo y ayuda.<tema>.texto (2 o 3 frases) y, si ayuda, ayuda.<tema>.ejemplo.
export const TEMAS_AYUDA = Object.freeze([
  'proyecto', 'entendi', 'duda', 'aprobar', 'version', 'autonomia', 'papelera', 'fase',
  'trabajo_automatico', 'modo_seguro', 'aviso', 'servidor',
  'copia', 'copia_comprobada', 'clave_recuperacion', 'telegram', 'token',
  'ia', 'tope', 'clave_api', 'plan', 'clave_temporal', 'tailscale',
]);
// Las que traen ejemplo.
export const TEMAS_CON_EJEMPLO = Object.freeze(['proyecto', 'duda', 'version', 'autonomia', 'modo_seguro', 'copia_comprobada', 'clave_recuperacion', 'token', 'tope', 'clave_temporal']);

const lista = v => (Array.isArray(v) ? v : []);

// Los pasos de los proyectos (para todos): crear el primero, revisarlo y aprobarlo.
// «revisar» no se puede saber aparte con la lista de proyectos: se da por hecho cuando ya hay uno aprobado.
function pasosDeProyectos(proyectos, { conRevisar }) {
  const todos = lista(proyectos);
  const hayProyecto = todos.length > 0;
  const hayAprobado = todos.some(p => p && p.versionActiva != null);
  const porAprobar = todos.find(p => p && !p.enPapelera && p.versionPendiente != null && p.versionActiva == null)
    ?? todos.find(p => p && !p.enPapelera && p.versionPendiente != null) ?? todos.find(p => p && !p.enPapelera);
  const destinoProyecto = porAprobar ? `#proyecto/${porAprobar.id}` : hayProyecto ? '#proyectos' : '#nuevo';
  return [
    { id: 'proyecto', icono: 'carpeta', tema: 'proyecto', hecho: hayProyecto, destino: '#nuevo' },
    conRevisar ? { id: 'revisar', icono: 'ojo', tema: 'entendi', hecho: hayAprobado, destino: porAprobar ? `#proyecto/${porAprobar.id}/entendi` : destinoProyecto, necesita: 'proyecto' } : null,
    { id: 'aprobar', icono: 'marca', tema: 'aprobar', hecho: hayAprobado, destino: destinoProyecto, necesita: 'proyecto' },
  ].filter(Boolean);
}

// Para el administrador: primero lo que protege sus datos (clave, Telegram, primera copia) y después su primer proyecto.
// sistema: GET /api/admin/sistema (o null si no llegó: entonces solo se muestran los pasos de los proyectos).
export function pasosAdmin({ sistema = null, ia = null, proyectos = [] } = {}) {
  const deProyectos = pasosDeProyectos(proyectos, { conRevisar: false });
  if (!sistema || !sistema.copias) return deProyectos;
  const hayClave = sistema.copias.motivo !== 'sin_clave';
  const chat = sistema.telegram?.chat ?? null;
  const hayTelegram = Boolean(chat) && chat.estado !== 'perdido';
  const hayCopia = Boolean(sistema.copias.ultimaFuera);
  const pasos = [
    { id: 'clave', icono: 'llave', tema: 'clave_recuperacion', hecho: hayClave, destino: '#copias' },
    { id: 'telegram', icono: 'avion_papel', tema: 'telegram', hecho: hayTelegram, destino: '#claves' },
    { id: 'copia', icono: 'nube_candado', tema: 'copia_comprobada', hecho: hayCopia, destino: '#copias', necesita: !hayClave ? 'clave' : !hayTelegram ? 'telegram' : null },
    ...deProyectos,
  ];
  // La IA es opcional: se muestra, pero no cuenta para «2 de 5».
  if (ia) pasos.push({ id: 'ia', icono: 'chispa', tema: 'ia', hecho: ia.encendida === true, destino: '#ia', opcional: true });
  return pasos;
}

// Para las demás cuentas. Quien solo puede ver (lector) no tiene pasos: no puede crear ni aprobar.
export function pasosUsuario({ proyectos = [], puedeEscribir = true } = {}) {
  return puedeEscribir ? pasosDeProyectos(proyectos, { conRevisar: true }) : [];
}

// Cada paso con su estado («hecho», «ahora»: el primero que falta, «luego») y la cuenta «hechos de total».
// Los opcionales no cuentan ni son nunca «ahora».
export function resumenGuia(pasos) {
  const obligatorios = lista(pasos).filter(p => !p.opcional);
  const siguiente = obligatorios.find(p => !p.hecho) ?? null;
  const conEstado = lista(pasos).map(p => ({ ...p, estado: p.hecho ? 'hecho' : p.opcional ? 'opcional' : p === siguiente ? 'ahora' : 'luego' }));
  const hechos = obligatorios.filter(p => p.hecho).length;
  return {
    pasos: conEstado, hechos, total: obligatorios.length, completa: obligatorios.length > 0 && hechos === obligatorios.length,
    siguiente: siguiente ? conEstado.find(p => p.id === siguiente.id) : null,
  };
}

// Para buscar sin fijarse en mayúsculas ni tildes: «copia» encuentra «Copia comprobada»; «ia» no encuentra «copia»
// por el título, pero sí lo que la nombra en su texto.
export const sinTildes = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// temas: [{ id, titulo, texto, ejemplo }]. Devuelve los que tienen todas las palabras escritas; primero los que las
// tienen en el título.
export function buscarTemas(temas, consulta) {
  const palabras = sinTildes(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return [...temas];
  const enTitulo = [];
  const enTexto = [];
  for (const tema of temas) {
    const titulo = sinTildes(tema.titulo);
    const todo = `${titulo} ${sinTildes(tema.texto)} ${sinTildes(tema.ejemplo)}`;
    if (palabras.every(p => titulo.includes(p))) enTitulo.push(tema);
    else if (palabras.every(p => todo.includes(p))) enTexto.push(tema);
  }
  return [...enTitulo, ...enTexto];
}
