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

// El color de lo gastado contra el tope: verde, amarillo desde el 80 %, rojo al llegar. lleno: el servidor ya dice
// «Tope lleno» (lo que queda no alcanza ni para el uso más corto, aunque no sea el 100 %): entonces también rojo, igual
// que la tarjeta del estado (ronda 4 de revisión).
export function partesBarraGasto({ usadoMicro = 0, apartadoMicro = 0, topeMicro = 0, lleno = false } = {}) {
  const tope = Number.isFinite(topeMicro) && topeMicro > 0 ? topeMicro : 0;
  const usado = Math.max(0, Number(usadoMicro) || 0);
  const apartado = Math.min(usado, Math.max(0, Number(apartadoMicro) || 0));
  const real = usado - apartado;
  const pct = tope ? (100 * usado) / tope : 0;
  const ancho = x => (tope ? Math.min(100, (100 * x) / tope) : 0);
  // Algo gastado se ve aunque sea poquito (una rayita), para que nunca parezca «nada» cuando hubo uso.
  const realPct = real > 0 ? Math.max(1.5, ancho(real)) : 0;
  const apartadoPct = apartado > 0 ? Math.min(100 - realPct, Math.max(1.5, ancho(apartado))) : 0;
  const tono = (tope && pct >= 100) || lleno === true ? 'mal' : pct >= 80 ? 'atencion' : 'bien';
  return { realPct, apartadoPct, pct: Math.floor(pct), tono };
}

// Lo que se muestra en «Para encenderla». Sin ningún proveedor encendido, lo que falta es eso (no la clave ni el precio,
// que pueden estar bien: ronda 4 de revisión).
export function cosasParaEncender(faltan = []) {
  const lista = Array.isArray(faltan) ? faltan : [];
  return lista.includes('proveedor') ? ['proveedor', 'tope'] : ['clave', 'tope', 'precio'];
}

// ¿Apagar «Usar …» de este proveedor deja la IA encendida sin ningún proveedor? Entonces se pregunta antes (se apagaría).
export function apagarProveedorApagaIa(s, id) {
  if (!s || s.encendida !== true || !Array.isArray(s.proveedores)) return false;
  const este = s.proveedores.find(p => p?.id === id);
  if (!este || este.usar !== true) return false;
  return !s.proveedores.some(p => p && p.id !== id && p.usar === true);
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

// Dinero de la IA (llega en millonésimas de dólar) escrito para la gente: «US$0.12» desde un centavo; debajo, hasta 4
// decimales («US$0.0022»). haciaArriba: para lo MÁXIMO que algo puede costar (el precio que se ve antes de confirmar):
// se redondea hacia arriba, así nunca se muestra menos de lo que se aparta y se puede cobrar. Lo gastado se redondea
// normal. formato: 'es-DO' o 'en-US'.
export function textoUsd(micro, formato = 'es-DO', { haciaArriba = false } = {}) {
  const m = Number(micro);
  if (micro == null || !Number.isFinite(m)) return '—';
  const chico = m > 0 && m < 10_000;
  let n = m / 1_000_000;
  if (haciaArriba && m > 0) n = chico ? Math.ceil(m / 100) / 10_000 : Math.ceil(m / 10_000) / 100;
  else if (m > 0 && m < 100) return '<US$0.0001';
  return `US$${new Intl.NumberFormat(formato, { minimumFractionDigits: 2, maximumFractionDigits: chico ? 4 : 2 }).format(n)}`;
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
