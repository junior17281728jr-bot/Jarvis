// OPORTIA: lo que deciden las pantallas de la IA opcional y de Claves (fase 1, parte d), sin tocar la página.
// Solo datos y reglas: public/app.js dibuja con esto y test/pantallas.test.js lo prueba sin navegador.
// La regla de siempre: un botón aparece solo cuando su acción se puede hacer ahora; si no, una línea corta dice por qué
// (o no se muestra nada, cuando a esa cuenta no le toca la IA).

// El cuadro donde se pega una clave: una línea de texto (NO un campo de contraseña: en el iPhone, Safari ofrecería
// guardar la clave en el llavero de iCloud o pondría ahí la contraseña de OPORTIA), sin autocompletar, sin corrector y
// sin mayúscula al empezar. Se tapa con puntos (estilos.css: .campo-clave) y se vacía apenas se manda.
export const ATRIBUTOS_CAMPO_CLAVE = Object.freeze({
  rows: 1,
  class: 'campo-clave',
  autocomplete: 'off',
  autocorrect: 'off',
  autocapitalize: 'off',
  spellcheck: 'false',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-form-type': 'other',
  enterkeyhint: 'done',
});

// Las rayitas de la barra del gasto (porcentaje del tope): los avisos salen al 50, al 80 y al 100 %.
export const MARCAS_GASTO = Object.freeze([50, 80]);

// Las tareas de ayuda que todavía no terminaron (la pantalla sigue esperando).
export const TAREA_VIVA = Object.freeze(['lista', 'en_curso']);

// Cambios de la IA que se resaltan: cambian mucho lo que se busca (otro tipo, o todo el país).
export const CAMBIOS_RESALTADOS = Object.freeze(['tipo', 'paisCompleto']);

// El color de lo gastado contra el tope: verde, amarillo desde el 80 %, rojo al llegar.
export function partesBarraGasto({ usadoMicro = 0, apartadoMicro = 0, topeMicro = 0 } = {}) {
  const tope = Number.isFinite(topeMicro) && topeMicro > 0 ? topeMicro : 0;
  const usado = Math.max(0, Number(usadoMicro) || 0);
  const apartado = Math.min(usado, Math.max(0, Number(apartadoMicro) || 0));
  const real = usado - apartado;
  const pct = tope ? (100 * usado) / tope : 0;
  const ancho = x => (tope ? Math.min(100, (100 * x) / tope) : 0);
  // Algo gastado se ve aunque sea poquito (una rayita), para que nunca parezca «nada» cuando hubo uso.
  const realPct = real > 0 ? Math.max(1.5, ancho(real)) : 0;
  const apartadoPct = apartado > 0 ? Math.min(100 - realPct, Math.max(1.5, ancho(apartado))) : 0;
  const tono = tope && pct >= 100 ? 'mal' : pct >= 80 ? 'atencion' : 'bien';
  return { realPct, apartadoPct, pct: Math.floor(pct), tono };
}

// Los controles de cada proveedor en Administrador → Inteligencia artificial. El interruptor «Usar …» solo existe
// cuando el precio oficial de su modelo está confirmado (sin precio no se puede gastar con él: el interruptor no haría
// nada). «Usar ChatGPT solo cuando Claude no esté disponible» solo aparece cuando los dos precios están confirmados.
//   → [{ id, usar, conInterruptor, etiqueta: 'ia.proveedor.usar' | 'ia.proveedor.segundo' | null,
//        estado: 'lista' | 'sin_precio' | 'apagado' | 'motivo', motivo, confirmado }]
export function controlesProveedores(proveedores = []) {
  const lista = Array.isArray(proveedores) ? proveedores.filter(p => p && typeof p.id === 'string') : [];
  const confirmado = p => p.precio?.confirmado === true;
  const todos = lista.length > 1 && lista.every(confirmado);
  return lista.map((p, i) => {
    const conInterruptor = confirmado(p);
    const estado = p.usable === true ? 'lista'
      : p.motivo === 'precio_sin_confirmar' || !confirmado(p) ? 'sin_precio'
        : p.motivo === 'proveedor_no_usado' ? 'apagado' : 'motivo';
    return {
      id: p.id,
      usar: p.usar === true,
      conInterruptor,
      etiqueta: !conInterruptor ? null : todos && i > 0 ? 'ia.proveedor.segundo' : 'ia.proveedor.usar',
      estado,
      motivo: typeof p.motivo === 'string' ? p.motivo : null,
      confirmado: confirmado(p),
    };
  });
}

// Cómo se ve la clave activa de un uso: 'ninguna', 'ilegible', 'pausada', 'no_pasa' o 'activa', con su color.
const PRUEBA_DUDOSA = new Set(['limite_proveedor', 'sobrecargado', 'error_proveedor', 'tiempo_agotado', 'sin_red']);
export function estadoDeClave(activa, ahora = Date.now()) {
  if (!activa) return { estado: 'ninguna', tono: 'apagado' };
  if (activa.legible === false) return { estado: 'ilegible', tono: 'mal' };
  const pausa = activa.pausa && (activa.pausa.hasta == null || Date.parse(activa.pausa.hasta) > ahora) ? activa.pausa : null;
  if (pausa) return { estado: 'pausada', tono: 'atencion' };
  if (activa.prueba && activa.prueba !== 'ok') return { estado: 'no_pasa', tono: PRUEBA_DUDOSA.has(activa.prueba) ? 'atencion' : 'mal' };
  return { estado: 'activa', tono: activa.prueba === 'ok' ? 'bien' : 'info' };
}

// El bloque «Ayuda de IA» de una versión que espera aprobación, según GET /api/proyectos/:id/ayuda-ia.
// seguida: la ayuda que se pidió desde esta pantalla ({ tareaId }), para contar cómo terminó.
//   vista: 'nada' (no se muestra nada: a esta cuenta no le toca la IA), 'disponible' (con el botón), 'esperando',
//          'solo_tailnet', 'apagada_admin', 'tope_lleno', 'pausa' o 'no_disponible' (una línea con el motivo).
//   lista: { numero, costoMicro } si la IA hizo una versión nueva (la pantalla vuelve a cargar el proyecto).
//   fallo: { motivo, costoMicro } si la ayuda que se pidió no pudo (se dice una vez, con lo que costó).
export function vistaAyudaIa(d, { seguida = null } = {}) {
  const r = { vista: 'nada', motivo: null, lista: null, fallo: null };
  if (!d || typeof d !== 'object') return r;
  const tarea = d.tarea && typeof d.tarea === 'object' ? d.tarea : null;
  if (tarea && TAREA_VIVA.includes(tarea.estado)) return { ...r, vista: 'esperando' };
  if (tarea && seguida && seguida.tareaId === tarea.id) {
    const res = tarea.resultado;
    if (tarea.estado === 'hecha' && res?.usada === true && Number.isSafeInteger(res.numero)) r.lista = { numero: res.numero, costoMicro: res.costoMicro ?? 0 };
    else r.fallo = { motivo: res?.motivo || 'no_disponible', costoMicro: res?.costoMicro ?? 0 };
  }
  const motivo = typeof d.motivo === 'string' ? d.motivo : null;
  r.motivo = motivo;
  // Una cuenta sin presupuesto de IA solo recibe { disponible: false }: no se le muestra nada.
  if (!motivo || motivo === 'sin_pendiente') return r;
  if (d.disponible === true && motivo === 'ok' && Number.isSafeInteger(d.maximoMicro) && d.maximoMicro > 0) return { ...r, vista: 'disponible' };
  if (motivo === 'trabajo_en_pausa') return { ...r, vista: 'pausa' };
  if (motivo === 'tope_general' || motivo === 'tope_espacio' || motivo === 'tope_proyecto') return { ...r, vista: 'tope_lleno' };
  if (d.esAdmin === true) {
    if (motivo === 'solo_tailnet') return { ...r, vista: 'solo_tailnet' };
    if (motivo === 'ia_apagada' || motivo === 'ayuda_no_activada') return { ...r, vista: 'apagada_admin' };
  }
  if (motivo === 'ok') return r; // «ok» sin precio: nunca un botón que no se sabe cuánto cuesta
  return { ...r, vista: 'no_disponible' };
}

// El nombre de un modelo para la gente: 'claude-haiku-5-5' → «Claude Haiku 5.5», 'gpt-6-luna' → «GPT-6 Luna».
const MAYUSCULA = texto => texto.charAt(0).toUpperCase() + texto.slice(1);
export function nombreModelo(id) {
  const texto = String(id ?? '');
  const claude = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(texto);
  if (claude) return `Claude ${MAYUSCULA(claude[1])} ${claude[2]}.${claude[3]}`;
  const gpt = /^gpt-(\d+(?:\.\d+)?)-([a-z]+)$/.exec(texto);
  if (gpt) return `GPT-${gpt[1]} ${MAYUSCULA(gpt[2])}`;
  return texto;
}

// Dólares escritos por la persona («2», «2.50», «2,50», «US$ 2») → texto para el servidor, o null si no se entiende.
// El servidor vuelve a revisar todo (de US$0 a US$100, hasta 2 decimales).
export function leerDolares(texto) {
  const limpio = String(texto ?? '').trim().replace(/^us\$\s*|^\$\s*/i, '').replace(',', '.');
  return /^\d{1,3}(?:\.\d{1,2})?$/.test(limpio) ? limpio : null;
}
