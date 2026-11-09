// OPORTIA: lo que deciden las pantallas de las copias y del Telegram (fase 1, parte e), sin tocar la página.
// Solo datos y reglas: public/app.js dibuja con esto y test/pantallas.test.js lo prueba sin navegador.
// La regla de siempre: un botón aparece solo cuando su acción se puede hacer ahora; si no, una línea corta dice por qué.
// Las frases son claves de public/i18n (la página las traduce); nada de aquí se muestra tal cual.

export const HORAS_COPIA_VIEJA = 30; // igual que src/copias/estado.js: sin copia comprobada fuera en 30 h, algo anda mal

// Los problemas del chat que hacen que las próximas copias se queden en este servidor (no «pausa»: esa se va sola).
const PROBLEMAS_DEL_CHAT = new Set(['bloqueado', 'perdido', 'clave_no_valida', 'sin_token', 'sin_probar', 'pedido', 'sin_respuesta', 'bot_cambiado']);

// Por qué no se puede «Hacer una copia ahora» (o null si se puede). Además de lo que dice el servidor: con el disco que
// no deja guardar copias aquí y sin un Telegram listo, no hay adónde mandarla (el servidor respondería sin_destino).
export function motivoNoAhora(c) {
  const m = c?.puede?.motivoNoAhora ?? null;
  if (m) return m;
  if (c?.locales?.pausadas && !c?.telegram?.listo) return 'sin_destino';
  return c?.puede?.ahora === false ? 'en_marcha' : null;
}

const viejaFuera = (c, ahora) => {
  const f = Date.parse(c?.ultimaFuera?.fecha ?? '');
  return !Number.isFinite(f) || ahora - f > HORAS_COPIA_VIEJA * 3_600_000;
};

// El problema del Telegram que importa para las copias (o null).
export function problemaTelegram(tg) {
  if (!tg || tg.listo || !tg.chat) return null;
  if (tg.chat.problema === 'bloqueado' || tg.chat.estado === 'bloqueado') return 'bloqueado';
  if (tg.chat.problema === 'perdido' || tg.chat.estado === 'perdido') return 'perdido';
  return PROBLEMAS_DEL_CHAT.has(tg.motivo) ? tg.motivo : null;
}

// Por qué quien mira no puede crear ni comprobar la clave: solo el dueño, desde su cuenta de Tailscale (como las Claves).
export const NO_CLAVE = Object.freeze(['solo_desde_tailnet', 'solo_dueno_tailscale', 'solo_el_dueno']);
export function razonNoClave(c) {
  const m = c?.puede?.motivoNoClave;
  return `copias.clave.no_puede.${NO_CLAVE.includes(m) ? m : 'solo_desde_tailnet'}`;
}

// Los motivos que puede tener una copia que no terminó bien (src/copias/hacer.js, vigilar.js, restaurar.js), sin lo que
// va después de «:». Cualquier otro se muestra como «otro» (nunca el código tal cual).
export const MOTIVOS_COPIA = Object.freeze(['telegram_limite_largo', 'telegram_limite', 'telegram_no_responde', 'copia_sin_exito', 'sin_llave',
  'volcado_incompleto', 'volcado_no_soportado', 'volcado_danado', 'fila_muy_grande', 'disco_distinto', 'parte_distinta', 'bot_cambiado',
  'foto_interrumpida', 'foto_larga', 'foto_vieja', 'chat_cambiado', 'tarea_fallida', 'tarea_cancelada', 'tarea_hecha', 'sin_tarea', 'restaurada', 'cancelada', 'disco_lleno', 'clave_ilegible', 'otro']);

// Revisión final: los motivos que la tarea de copias (copias.hacer) puede dejar en Administrador → Trabajo y que no son
// motivos de una copia (copias.motivo.*): cada uno tiene su frase tareas.motivo.<código> en los dos idiomas.
export const MOTIVOS_TAREA_COPIA = Object.freeze(['error_servidor', 'sin_red', 'limite', 'telegram_clave_dudosa', 'telegram_bloqueado',
  'telegram_chat_no_existe', 'telegram_sin_clave', 'telegram_otro', 'indice_sin_nombre', 'punto_no_valido', 'disco_local', 'telegram',
  'datos_no_validos', 'copia_no_autentica', 'formato_nuevo', 'volcado_sin_sello']);
// La frase de un motivo de la tarea de copias (nunca el código tal cual): la suya en tareas.motivo.*, la de la copia en
// copias.motivo.*, «Telegram no dejó» para otro problema de Telegram, o «algo no salió bien». existe(clave) dice si la
// frase está. → la clave de la frase.
export function fraseMotivoTareaCopia(motivo, existe = () => false) {
  const m = String(motivo ?? '');
  if (!m) return null;
  if (existe(`tareas.motivo.${m}`)) return `tareas.motivo.${m}`;
  const base = motivoBase(m);
  if (base && base !== 'otro') return `copias.motivo.${base}`;
  const sinDetalle = m.split(':')[0];
  if (existe(`tareas.motivo.${sinDetalle}`)) return `tareas.motivo.${sinDetalle}`;
  if (/^telegram_/.test(m)) return 'tareas.motivo.telegram_otro';
  return 'copias.motivo.otro';
}

// La tarjeta grande de #copias, según GET /api/admin/copias.
// → { estado, tono, icono, marca, titulo, linea, variables, accion, enlace, razon, progreso }
//   accion: 'ahora' | 'otra_vez' | 'crear_clave' | null (el botón grande) · enlace: { href, texto } (claves de frases)
//   razon: la frase de por qué no hay botón · progreso: { n, de } (de: null cuando todavía no se sabe el total)
export function vistaCopias(c, ahora = Date.now()) {
  const tg = c?.telegram ?? null;
  const noAhora = motivoNoAhora(c);
  const conAhora = (accion = 'ahora') => (noAhora ? { accion: null, razon: `copias.no_ahora.${noAhora}` } : { accion, razon: null });
  const base = { marca: null, variables: {}, accion: null, enlace: null, razon: null, progreso: null };
  if (!c?.clave?.activa) {
    const puede = c?.puede?.crearClave === true;
    return {
      ...base, estado: 'sin_clave', tono: 'mal', icono: 'clave_recuperacion', titulo: 'copias.estado.sin_clave', linea: 'copias.sin_clave',
      accion: puede ? 'crear_clave' : null, razon: puede ? null : razonNoClave(c),
    };
  }
  if (c.modoSeguro) {
    return { ...base, estado: 'modo_seguro', tono: 'apagado', icono: 'pausa', titulo: 'copias.estado.modo_seguro', linea: 'copias.pausa_modo_seguro', enlace: { href: '#admin/trabajo', texto: 'copias.ir.trabajo' } };
  }
  if (c.enCurso) {
    const n = Number.isFinite(Number(c.enCurso.n)) && c.enCurso.n != null ? Number(c.enCurso.n) : null;
    const de = Number.isFinite(Number(c.enCurso.de)) && c.enCurso.de ? Number(c.enCurso.de) : null;
    // Revisión final: «en la fila» solo para una copia que nunca se empezó. Una que espera otro intento (Telegram no
    // respondió) dice por qué y a qué hora; una que una persona tiene que mirar lleva a Trabajo.
    const e = c.enCurso;
    if (e.esperando && e.revisar) {
      return { ...base, estado: 'revisar', tono: 'atencion', icono: 'copia', marca: 'atencion', titulo: 'copias.estado.revisar', linea: 'copias.revisar', enlace: { href: '#admin/trabajo', texto: 'copias.ir.trabajo' } };
    }
    if (e.esperando && e.motivo && e.disponibleEn) {
      return {
        ...base, estado: 'reintentando', tono: 'atencion', icono: 'copia', marca: 'atencion', titulo: 'copias.estado.reintentando', linea: 'copias.reintentando',
        variables: { motivo: e.motivo, cuando: e.disponibleEn, intento: e.intento ?? null, de: e.maxIntentos ?? null }, progreso: { n: null, de: null },
      };
    }
    if (e.esperando && !(Number(e.tomas) > 0)) return { ...base, estado: 'en_fila', tono: 'info', icono: 'copia', titulo: 'copias.estado.en_fila', linea: 'copias.en_fila', progreso: { n: null, de: null } };
    const paso = c.enCurso.paso;
    const linea = paso === 'indice' ? 'copias.terminando' : n == null || paso === 'preparar' ? 'copias.preparando'
      : paso === 'verificar' ? (de ? 'copias.comprobando' : 'copias.comprobando_sin_total') : de ? 'copias.haciendo' : 'copias.haciendo_sin_total';
    return { ...base, estado: 'haciendo', tono: 'info', icono: 'copia', titulo: 'copias.estado.haciendo', linea, variables: { n: n ?? 0, de }, progreso: { n, de } };
  }
  if (c.locales?.frenoDisco) {
    return { ...base, estado: 'freno_disco', tono: 'mal', icono: 'disco', titulo: 'copias.estado.freno_disco', linea: 'copias.freno_disco', enlace: { href: '#admin/servidor', texto: 'copias.ir.servidor' } };
  }
  if (!tg?.chat) {
    return { ...base, estado: 'solo_locales', tono: 'atencion', icono: 'disco', titulo: 'copias.estado.solo_locales', linea: 'copias.solo_locales', enlace: { href: '#claves', texto: 'copias.ir.unir_telegram' }, ...conAhora() };
  }
  if (c.ultima?.estado === 'fallida') {
    return {
      ...base, estado: 'fallo', tono: 'mal', icono: 'nube_candado', marca: 'mal', titulo: 'copias.estado.fallo', linea: 'copias.fallo',
      variables: { motivo: c.ultima.motivo ?? null }, ...conAhora('otra_vez'),
    };
  }
  const problema = problemaTelegram(tg);
  if (problema) {
    return {
      ...base, estado: 'telegram_problema', tono: 'atencion', icono: 'avion_papel', marca: 'atencion', titulo: 'copias.estado.telegram_problema',
      linea: `telegram.problema.${problema}`, enlace: { href: '#claves', texto: 'copias.ir.claves' }, ...conAhora(),
    };
  }
  if (!c.ultimaFuera) {
    return { ...base, estado: 'primera', tono: 'info', icono: 'nube_candado', titulo: 'copias.estado.primera', linea: 'copias.primera', ...conAhora() };
  }
  if (viejaFuera(c, ahora)) {
    return { ...base, estado: 'atrasada', tono: 'mal', icono: 'nube_candado', marca: 'mal', titulo: 'copias.estado.atrasada', linea: 'copias.atrasada', ...conAhora('otra_vez') };
  }
  if (c.fijada === false) {
    return {
      ...base, estado: 'sin_fijar', tono: 'atencion', icono: 'nube_candado', marca: 'atencion', titulo: 'copias.estado.sin_fijar', linea: 'copias.sin_fijar',
      enlace: { href: '#claves', texto: 'copias.ir.claves' }, ...conAhora(),
    };
  }
  return { ...base, estado: 'bien', tono: 'bien', icono: 'nube_candado', marca: 'bien', titulo: 'copias.fuera.titulo', linea: 'copias.comprobada', ...conAhora() };
}

// La tarjeta del disco: { tono, linea } (linea: una frase de copias.aqui.* o null si todo está bien).
export function vistaDisco(locales) {
  const l = locales ?? {};
  if (l.frenoDisco) return { tono: 'mal', linea: 'copias.freno_disco' };
  if (l.activas === false) return { tono: 'apagado', linea: 'copias.aqui.apagadas' };
  if (l.pausadas) return { tono: 'atencion', linea: 'copias.disco_lleno' };
  if (l.diasRestantes != null && l.diasRestantes < 30) return { tono: 'atencion', linea: 'copias.aqui.pronto' };
  return { tono: 'bien', linea: null };
}

// Cada copia de la lista «Últimas copias»: su color y su ícono.
export const TONO_COPIA = Object.freeze({
  verificada: 'bien', solo_local: 'atencion', haciendo: 'info', escrita: 'info', subida: 'info', fallida: 'mal', interrumpida: 'apagado', saltada: 'apagado',
});
export const ICONO_TONO = Object.freeze({ bien: 'bien', atencion: 'atencion', mal: 'mal', info: 'reloj', apagado: 'apagado' });

// El motivo de una copia (fallida, interrumpida) sin lo que va después de «:» (por ejemplo «parte_distinta:indice»).
export function motivoBase(motivo) {
  if (!motivo) return null;
  const m = String(motivo).split(':')[0];
  return MOTIVOS_COPIA.includes(m) ? m : 'otro';
}

// Las copias de Telegram en el resumen de Administrador (GET /api/admin/sistema → copias, telegram, modoSeguro).
// → { tono, valor: { clave, variables }, detalle }
export function vistaAzulejoCopias(copias, { modoSeguro = false } = {}) {
  if (!copias) return { tono: 'apagado', valor: { clave: 'copias.azulejo.sin_datos' }, detalle: null };
  const m = copias.motivo;
  if (m === 'sin_clave') return { tono: 'atencion', valor: { clave: 'copias.azulejo.sin_clave' }, detalle: 'copias.azulejo.sin_clave.detalle' };
  if (modoSeguro) return { tono: 'apagado', valor: { clave: 'copias.azulejo.en_pausa' }, detalle: 'copias.azulejo.en_pausa.detalle' };
  if (m === 'solo_locales') return { tono: 'atencion', valor: { clave: 'copias.azulejo.solo_locales' }, detalle: 'copias.azulejo.solo_locales.detalle' };
  if (m === 'fallo') return { tono: 'mal', valor: { clave: 'copias.azulejo.fallo' }, detalle: 'copias.azulejo.fallo.detalle' };
  if (!copias.ultimaFuera) return { tono: 'info', valor: { clave: 'copias.azulejo.primera' }, detalle: 'copias.azulejo.primera.detalle' };
  if (m === 'atrasada') return { tono: 'mal', valor: { clave: 'copias.azulejo.hace', fecha: copias.ultimaFuera.fecha }, detalle: 'copias.azulejo.atrasada.detalle' };
  return { tono: copias.tono ?? 'bien', valor: { clave: 'copias.azulejo.cuando', fecha: copias.ultimaFuera.fecha }, detalle: 'copias.azulejo.bien.detalle' };
}

// El Telegram en el resumen (GET /api/admin/sistema → telegram { listo, motivo, chat }).
export function vistaAzulejoTelegram(tg) {
  if (!tg || !tg.chat) return { tono: 'apagado', valor: 'telegram.azulejo.sin_unir', detalle: 'telegram.azulejo.sin_unir.detalle' };
  if (tg.listo) return { tono: 'bien', valor: 'telegram.azulejo.activo', detalle: tg.chat.nombre ? 'telegram.azulejo.chat' : null };
  const p = problemaTelegram(tg);
  if (p) return { tono: p === 'sin_probar' ? 'atencion' : 'mal', valor: 'telegram.azulejo.problema', detalle: `telegram.problema.${p}` };
  return { tono: 'atencion', valor: 'telegram.azulejo.espera', detalle: 'telegram.problema.pausa' };
}

// El grupo «Avisos y copias por Telegram» de Claves (GET /api/admin/claves → telegram, y el uso telegram_bot).
//  paso: 'bot' (falta el token, o no pasa la prueba) · 'unir' (el bot funciona; falta unir el chat) · 'unido'
//  problema: la frase telegram.problema.<…> cuando algo no deja mandar (o null).
export function vistaTelegram(tg, uso) {
  const activa = uso?.activa ?? null;
  const tokenBien = Boolean(activa && activa.legible !== false && activa.prueba === 'ok' && tg?.bot);
  if (!activa) return { paso: 'bot', tokenBien: false, problema: null, chat: null };
  if (!tokenBien) {
    const p = activa.prueba === 'bot_ocupado' ? 'bot_ocupado' : activa.prueba && activa.prueba !== 'ok' ? (activa.prueba === 'clave_no_valida' ? 'clave_no_valida' : 'sin_red') : null;
    return { paso: 'bot', tokenBien: false, problema: p, chat: tg?.chat ?? null };
  }
  const chat = tg?.chat ?? null;
  if (!chat || chat.estado === 'perdido') return { paso: 'unir', tokenBien, problema: chat ? 'perdido' : null, chat };
  const p = problemaTelegram(tg);
  if (p) return { paso: 'unido', tokenBien, problema: p, chat };
  if (!tg.listo && tg.motivo === 'pausa') return { paso: 'unido', tokenBien, problema: 'pausa', chat };
  return { paso: 'unido', tokenBien, problema: null, chat };
}

// El código de 8 cifras como se lee en voz alta: «4821 7730».
export const codigoLegible = codigo => String(codigo ?? '').replace(/\D/g, '').replace(/^(\d{4})(\d{4})$/, '$1 $2');

// Lo que falta para que venza el código: «9:58» (o null si ya venció).
export function cuentaAtras(hasta, ahora = Date.now()) {
  const s = Math.floor((Date.parse(hasta) - ahora) / 1000);
  if (!Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// El enlace al bot que abre Telegram (solo https://t.me/<usuario>?start=<8 cifras>; cualquier otra cosa, ninguno).
export function enlaceSeguro(enlace) {
  return typeof enlace === 'string' && /^https:\/\/t\.me\/[A-Za-z0-9_]{3,64}\?start=\d{8}$/.test(enlace) ? enlace : null;
}
