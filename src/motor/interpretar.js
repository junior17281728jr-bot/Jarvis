// Motor propio: entiende las instrucciones de un proyecto SIN IA.
// Lee lo que la persona escribió (ver leer.js), encuentra a quién se busca, dónde, qué se vende o qué empleo,
// salario, exclusiones, preferencias y frecuencia, y arma una configuración que la persona revisa y aprueba
// antes de que se haga nada. Lo que no entiende no lo adivina: lo deja como duda (ver dudas() y faltantes()),
// y mientras haya dudas no se puede aprobar.
import {
  SECTORES, PRODUCTOS, ZONAS, TAMANOS, FRECUENCIAS, FRECUENCIA_POR_DEFECTO, CAPACIDADES, CLAVES_CAPACIDADES, COMBINACIONES,
  COMBINACION_POR_DEFECTO, FUENTES, AUTONOMIAS, AUTONOMIA_POR_DEFECTO,
} from './diccionarios.js';
import { comparable } from './texto.js';
import { leer, negociosDeTexto, lugaresDeTexto, exclusionDeTexto, esExtranjero, clavesDeProducto, sugerenciasDeLugar } from './leer.js';
import { juntarSalario } from './salario.js';

export const LIMITES = { instrucciones: 4000, nombre: 80, objetivo: 300, producto: 120, elemento: 80, lista: 30, prioridad: 160, salario: 10_000_000, dudas: 12 };
export const TIPOS = ['comercial', 'laboral'];
export const CLAVES_FRECUENCIAS = FRECUENCIAS.map(f => f.clave);
export const CLAVES_TAMANOS = TAMANOS.map(t => t.clave);
export const ESQUEMA = 3;
export { AUTONOMIAS, AUTONOMIA_POR_DEFECTO };
// La IA llega en la parte 1d. Hasta entonces cada versión guarda que la IA no está permitida, con tope US$0,
// y que el costo estimado es US$0. Encenderla será un cambio que crea una versión nueva y espera aprobación.
export const IA_APAGADA = Object.freeze({ permitida: false, topeMensualUsd: 0 });

// Lo que el motor decidió solo y avisa (se muestra; no impide aprobar).
export const CLAVES_SUPUESTOS = ['frecuencia', 'capacidades', 'tipo', 'tipo_laboral', 'sectores_todos', 'gran_santo_domingo', 'contactar_a_mano',
  'salario_minimo', 'producto_negocio', 'sectores_libres', 'dia_semana', 'telefono', 'contactar_sin_correos', 'contactar_telefono', 'clientes_actuales',
  'autonomia_pedida', 'clientes_sin_nombre', 'personas_sueltas', 'enviar_whatsapp'];
// Dudas: cosas que el motor no entendió. Mientras haya alguna, no se puede aprobar.
// Las «guardadas» salen de las instrucciones y se marcan como resueltas en el formulario; las otras se calculan
// de la configuración y desaparecen solas cuando se corrige el dato.
export const CLAVES_DUDAS_GUARDADAS = ['texto', 'lugar', 'calle_o_provincia', 'direccion', 'conflicto_tamano', 'salario', 'salario_periodo', 'frecuencia', 'frecuencia_no_disponible',
  'tipo', 'fuente', 'combinacion', 'objetivo_competidores', 'objetivo_proveedores', 'objetivo_socios', 'objetivo_que_vender', 'objetivo_una_empresa',
  'objetivo_empleados', 'objetivo_otra_tarea', 'parte_de_lugar', 'lugar_homonimo', 'lugar_difuso', 'cambio', 'combinacion_producto', 'combinacion_parcial',
  'sector_general', 'lugar_provincia', 'lista_larga', 'lugar_inseguro', 'para_quien', 'personas', 'tamano_del_general'];
export const CLAVES_DUDAS_CALCULADAS = ['conflicto_sector', 'conflicto_zona', 'fuera_del_pais'];
export const CLAVES_DUDAS = [...CLAVES_DUDAS_GUARDADAS, ...CLAVES_DUDAS_CALCULADAS];

const PALABRAS_DE_FRECUENCIA = new Set([...FRECUENCIAS.flatMap(f => [...f.palabras, ...f.adverbios]).flatMap(p => comparable(p).split(' '))
  .filter(p => !['cada', 'todos', 'todas', 'los', 'las', 'una', 'vez', 'al', 'por', 'a', 'la', 'to', 'every', 'each', 'once', 'when', 'yo', 'lo', 'i', 'cuando'].includes(p)),
'quincenal', 'quincena', 'quincenas', 'biweekly', 'fortnightly', 'semanas', 'meses', 'dias', 'diarias', 'semanales', 'mensuales', 'anual', 'yearly', 'annually']);
const SECTOR = new Map(SECTORES.map(s => [s.clave, s]));
const PRODUCTO = new Map(PRODUCTOS.map(p => [p.clave, p]));
const ZONA = new Map(ZONAS.map(z => [z.clave, z]));

// Solo textos y números cuentan como texto: cualquier otra cosa (un objeto, una lista) queda vacía.
const comoTexto = valor => (typeof valor === 'string' || typeof valor === 'number' ? String(valor) : '');
const recorte = (valor, maximo) => comoTexto(valor).replace(/\s+/g, ' ').trim().slice(0, maximo);
const unicos = lista => [...new Set(lista)];
const unicosPorTexto = lista => {
  const vistos = new Set();
  return lista.filter(v => { const c = comparable(v); if (!c || vistos.has(c)) return false; vistos.add(c); return true; });
};

function textoDe(idioma, es, en) {
  return idioma === 'en' ? en : es;
}

export function capacidadesDesdeLista(lista) {
  const encendidas = new Set(lista);
  if (encendidas.has('contactar')) encendidas.add('correos');
  return Object.fromEntries(CLAVES_CAPACIDADES.map(c => [c, encendidas.has(c)]));
}

// Corta un texto sin partir palabras: «Oficinas y servicios profesion» no; «Oficinas y servicios…» sí.
// Solo lleva «…» si de verdad se cortó algo.
export function recortePorPalabra(valor, maximo) {
  const texto = recorte(valor, 10_000);
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo - 1);
  const espacio = corte.lastIndexOf(' ');
  const base = (espacio >= Math.floor(maximo / 3) ? corte.slice(0, espacio) : corte)
    .replace(/\s+(?:y|e|o|u|and|or|de|del|para|for|of|the|la|el|los|las|a|en|in|to)$/i, '').replace(/[\s,;:·]+$/u, '');
  return `${base}…`;
}

// La primera parte de una etiqueta compuesta: «Oficinas y servicios profesionales» → «Oficinas»,
// «Banks, lenders and credit unions» → «Banks».
const primeraParte = etiqueta => comoTexto(etiqueta).split(/,\s*|\s+(?:y|e|and)\s+/u)[0];

// Lo que vende, si es exactamente el nombre de productos del catálogo («paneles solares», «cámaras y seguridad»):
// entonces se puede escribir en cualquier idioma. Si la persona lo escribió con sus palabras, es null.
function productoDelCatalogo(c, idioma) {
  const claves = Array.isArray(c.productos) ? c.productos : [];
  if (c.tipo === 'laboral' || !c.producto || !claves.length) return null;
  const items = claves.map(k => PRODUCTO.get(k));
  if (!items.every(Boolean)) return null;
  const unir = (lengua, nombres) => {
    try { return new Intl.ListFormat(lengua, { type: 'conjunction' }).format(nombres); } catch { return nombres.join(', '); }
  };
  const formas = new Set(['es', 'en'].flatMap(lengua => {
    const nombres = items.map(x => x[lengua]);
    return [comparable(nombres.join(', ')), comparable(unir(lengua, nombres))];
  }));
  return formas.has(comparable(c.producto)) ? unir(idioma, items.map(x => x[idioma === 'en' ? 'en' : 'es'])) : null;
}

// ¿En qué idioma se escribió un nombre que puso OPORTIA? (los nombres sugeridos empiezan siempre igual).
export function idiomaDelNombre(nombre) {
  return /^(?:Customers for |Job: |Job search|New project)/.test(comoTexto(nombre)) ? 'en' : 'es';
}

// El nombre que se le pone solo a un proyecto: lo que vende (o el empleo) y el primer sector o lugar,
// para que dos proyectos del mismo producto no se vean iguales en la lista.
// «Clientes para paneles solares · Hoteles», «Empleo: chofer · Santiago».
// Va entero en un idioma: si todo sale del catálogo, en «idioma» (el de quien lo mira); si lleva palabras que la
// persona escribió («paneles solares» a su manera, «turistas»), en «idiomaOriginal», el de cuando se creó:
// nunca «Customers for paneles solares».
export function nombreSugerido(config, idioma = 'es', idiomaOriginal = idioma) {
  const c = config && typeof config === 'object' ? config : {};
  const delCatalogo = productoDelCatalogo(c, 'es') != null;
  const detalle = detalleDelNombre(c);
  const libre = (recorte(c.producto, 1) && !delCatalogo) || detalle?.libre;
  const lengua = libre ? idiomaOriginal : idioma;
  let parte = detalle ? (detalle.textos ? textoDe(lengua, detalle.textos.es, detalle.textos.en) : detalle.texto) : '';
  if (parte.length > 30) parte = recortePorPalabra(primeraParte(parte), 30);
  const cola = parte ? ` · ${parte}` : '';
  const conProducto = (es, en) => {
    const prefijo = textoDe(lengua, es, en);
    const texto = delCatalogo ? productoDelCatalogo(c, lengua) : c.producto;
    return prefijo + recortePorPalabra(texto, Math.min(50, LIMITES.nombre - prefijo.length - cola.length));
  };
  const base = c.tipo === 'laboral'
    ? (recorte(c.producto, 1) ? conProducto('Empleo: ', 'Job: ') : textoDe(lengua, 'Búsqueda de empleo', 'Job search'))
    : (recorte(c.producto, 1) ? conProducto('Clientes para ', 'Customers for ') : textoDe(lengua, 'Proyecto nuevo', 'New project'));
  return recortePorPalabra(base + cola, LIMITES.nombre);
}

// La segunda parte del nombre: { textos: {es, en} } si sale del catálogo, { texto, libre } si no.
function detalleDelNombre(c) {
  const lista = valor => (Array.isArray(valor) ? valor : []);
  if (c.tipo !== 'laboral') {
    const sector = lista(c.sectores).find(s => s !== 'todas' && SECTOR.has(s));
    if (sector) return { textos: { es: SECTOR.get(sector).es, en: SECTOR.get(sector).en } };
    const libre = lista(c.sectoresLibres).map(comoTexto).find(Boolean);
    if (libre) return { texto: libre, libre: true };
  }
  // Los lugares se llaman igual en los dos idiomas.
  const zona = lista(c.zonas).find(z => ZONA.has(z));
  if (zona) return { texto: ZONA.get(zona).nombre };
  const lugar = lista(c.zonasLibres).map(comoTexto).find(Boolean);
  if (lugar) return { texto: lugar };
  return c.paisCompleto === true ? { textos: { es: 'Todo el país', en: 'Whole country' } } : null;
}

export function objetivoSugerido(config, idioma = 'es') {
  const producto = recorte(config.producto, 100);
  if (config.tipo === 'laboral') return producto ? textoDe(idioma, `Conseguir empleo de ${producto}`, `Get a job as ${producto}`) : textoDe(idioma, 'Conseguir empleo', 'Get a job');
  return producto ? textoDe(idioma, `Encontrar clientes que puedan necesitar ${producto}`, `Find customers who may need ${producto}`) : textoDe(idioma, 'Encontrar clientes', 'Find customers');
}

// Las claves del diccionario que hay en lo que se vende (sirven para puntuar en la fase 2).
// Si el texto es exactamente la etiqueta de un producto («cámaras y seguridad»), también cuenta.
export function productosDe(producto) {
  const valor = recorte(producto, LIMITES.producto);
  if (!valor) return [];
  const comp = comparable(valor);
  const porEtiqueta = PRODUCTOS.filter(p => comparable(p.es) === comp || comparable(p.en) === comp).map(p => p.clave);
  if (porEtiqueta.length) return porEtiqueta;
  return clavesDeProducto(valor);
}

// Devuelve { configuracion, supuestos }. «supuestos» son las cosas que el motor decidió solo
// (por ejemplo, la frecuencia) para que la persona las vea y las cambie si no son así.
// Lo que no entendió va en configuracion.noEntendido (y bloquea la aprobación hasta que se resuelva).
export function interpretar(instrucciones, { idioma = 'es' } = {}) {
  const original = comoTexto(instrucciones).slice(0, LIMITES.instrucciones);
  const x = leer(original);
  const supuestos = new Set(x.supuestos);
  const noEntendido = [...x.dudas];
  const duda = (clave, texto = '') => {
    if (!noEntendido.some(d => d.clave === clave && d.texto === texto)) noEntendido.push({ clave, texto, sugerencias: [] });
  };
  const tipo = x.tipo;

  // A quién se busca
  let sectores = unicos(x.sectores);
  const sectoresLibres = unicosPorTexto(x.sectoresLibres);
  if (tipo === 'comercial' && !sectores.length && !sectoresLibres.length) {
    if (x.general.visto || x.pideClientes) {
      sectores = ['todas'];
      if (!x.general.todos) supuestos.add('sectores_todos');
    } else if (x.sectoresPrioridad.length) sectores = unicos(x.sectoresPrioridad);
  }
  // «a talleres…, sobre todo colmados y farmacias»: los negocios con prioridad también se buscan.
  if (tipo === 'comercial' && sectores.length && !sectores.includes('todas')) sectores = unicos([...sectores, ...x.sectoresPrioridadDirectos]);
  // «hoteles y empresas», «casas y negocios»: no se sabe si busca solo esos negocios o todos. Se pregunta.
  // «hoteles, clínicas, fábricas y negocios grandes»: los negocios nombrados (de todo tamaño) y además cualquier negocio grande. Eso todavía
  // no se puede guardar en un proyecto: se pregunta con su propia duda. «empresas medianas y grandes…» sola en su lista dice el tamaño
  // de todo lo que busca: ahí no se pregunta si es «cualquier negocio».
  const conNegocios = sectores.some(s => s !== 'todas') || sectoresLibres.length > 0;
  if (tipo === 'comercial' && x.generalesConTamano.length && conNegocios) duda('tamano_del_general', x.generalesConTamano[0]);
  const generales = x.generalesEnLista.filter(g => !x.generalesConTamano.includes(g) && !x.generalesMarco.includes(g));
  if (tipo === 'comercial' && generales.length && conNegocios) duda('sector_general', generales[0]);
  if (!sectoresLibres.length) supuestos.delete('sectores_libres');

  // Tamaños: lo incluido menos lo excluido. Si algo está en los dos lados, se pregunta.
  let tamanos = [...x.tamanos];
  for (const t of x.tamanosExcluidos) if (x.tamanos.has(t)) duda('conflicto_tamano', t);
  if (!tamanos.length && x.tamanosExcluidos.size) tamanos = CLAVES_TAMANOS.filter(t => !x.tamanosExcluidos.has(t));

  // Dónde. Dónde está la persona o su negocio («vivo en Moca», «mi oficina está en Naco») no es dónde se busca;
  // solo si no dijo ningún otro lugar se busca ahí (un negocio de Santiago que no dice más vende en Santiago).
  let zonas = unicos(x.zonas);
  const zonasLibres = unicosPorTexto(x.zonasLibres);
  const lugarDudoso = noEntendido.some(d => d.clave === 'lugar');
  if (!zonas.length && !zonasLibres.length && !x.pais.explicito && !x.pais.nombre) zonas = unicos(x.zonasPropias);
  const paisCompleto = x.pais.explicito || (x.pais.nombre && !zonas.length && !zonasLibres.length && !lugarDudoso);
  // «Santo Domingo, pero no en el Distrito Nacional»: queda la provincia Santo Domingo (el aviso no puede prometer el Distrito Nacional).
  if (zonas.includes('gran-santo-domingo') && x.zonasExcluidas.includes('distrito-nacional')) zonas = unicos(zonas.map(z => (z === 'gran-santo-domingo' ? 'santo-domingo' : z)));
  if (zonas.includes('gran-santo-domingo')) supuestos.add('gran_santo_domingo');

  // Producto o empleo
  let producto = '';
  if (tipo === 'laboral') producto = x.puesto;
  else {
    producto = unicosPorTexto(x.productos).join(', ');
    // «tengo una empresa de transporte»: lo que hace su negocio, si no dijo otra cosa.
    if (!producto) producto = unicosPorTexto(x.productosPropios).join(', ');
    if (!producto && x.negocioPropio && !x.productoRelleno) {
      producto = x.negocioPropio;
      supuestos.add('producto_negocio');
    }
  }
  producto = recorte(producto, LIMITES.producto);

  // Salario
  const salario = juntarSalario(x.tramosSalario, LIMITES.salario);
  if (salario.duda) duda(salario.duda, [...x.tramosSalario].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)).map(t => t.texto).join(' … ').slice(0, 80));
  if (salario.supuesto && tipo === 'laboral') supuestos.add('salario_minimo');

  // Frecuencia
  const frecuencias = unicos(x.frecuencias.map(f => f.clave));
  let frecuencia = frecuencias[0] || FRECUENCIA_POR_DEFECTO;
  if (frecuencias.length > 1) duda('frecuencia', x.frecuencias.map(f => f.texto).join(', ').slice(0, 80));
  else if (frecuencias.length === 1 && x.frecuencias.some(f => f.dia)) supuestos.add('dia_semana');
  if (!frecuencias.length) {
    frecuencia = FRECUENCIA_POR_DEFECTO;
    // Si lo que no entendí es casi solo una frecuencia («Biweekly», «revisa quincenal»), no se dice a la vez «Revisaré cada semana».
    const hablaDeFrecuencia = d => {
      if (d.clave === 'frecuencia_no_disponible') return true;
      const palabras = comparable(d.texto).split(' ').filter(Boolean);
      return d.clave === 'texto' && palabras.length <= 3 && palabras.some(p => PALABRAS_DE_FRECUENCIA.has(p));
    };
    if (!noEntendido.some(hablaDeFrecuencia)) supuestos.add('frecuencia');
  }

  // Capacidades: solo lo que se pidió de verdad. «Contactar» nunca se enciende desde el texto.
  const pedidas = new Set(x.capPedidas);
  pedidas.delete('contactar');
  let base;
  if (x.cicloCompleto) base = CLAVES_CAPACIDADES.filter(c => c !== 'contactar');
  else if (x.soloInvestigar) base = ['investigar', ...pedidas];
  else if (pedidas.size) base = ['investigar', 'analizar', 'recomendar', ...pedidas];
  else base = COMBINACIONES[COMBINACION_POR_DEFECTO];
  // Pedir contactar enciende preparar los correos (contactar se enciende a mano), sin apagar nada más («llámalos» no quita las propuestas).
  if (x.contactarPedido) base = [...base, 'correos'];
  const lista = base.filter(c => c === 'investigar' || !x.capNegadas.has(c)).filter(c => c !== 'contactar');
  const capacidades = capacidadesDesdeLista(lista);
  const porDefecto = capacidadesDesdeLista(COMBINACIONES[COMBINACION_POR_DEFECTO]);
  if (!x.soloInvestigar && !x.cicloCompleto && !pedidas.size && !x.contactarPedido && CLAVES_CAPACIDADES.every(c => capacidades[c] === porDefecto[c])) supuestos.add('capacidades');
  // Si pidió contactar pero también que no prepare correos («no les mandes correos, solo llámalos»), el aviso no puede prometer correos.
  // Si pidió llamar o escribir por WhatsApp, se dice que eso todavía no se hace.
  if (x.contactarPedido) supuestos.add(!capacidades.correos ? 'contactar_sin_correos' : x.porTelefono ? 'contactar_telefono' : 'contactar_a_mano');
  // «hazlo todo tú solo sin preguntarme»: se queda en el nivel más seguro, y se avisa.
  if (x.autonomiaPedida) supuestos.add('autonomia_pedida');

  // Más de 30 en una lista: no caben. Nunca se quitan en silencio: se dice cuáles quedaron fuera.
  const listas = [[zonas, z => ZONA.get(z)?.nombre], [unicos(x.zonasExcluidas), z => ZONA.get(z)?.nombre], [sectores, s => SECTOR.get(s)?.es],
    [unicos(x.sectoresExcluidos), s => SECTOR.get(s)?.es], [sectoresLibres], [zonasLibres], [unicosPorTexto(x.exclusiones)], [x.prioridades]];
  for (const [lista, nombre = v => v] of listas) {
    if (lista.length > LIMITES.lista) duda('lista_larga', lista.slice(LIMITES.lista).map(v => nombre(v) || v).join(', ').slice(0, LIMITES.elemento));
  }
  if (noEntendido.some(d => d.clave === 'tipo')) { supuestos.delete('tipo'); supuestos.delete('tipo_laboral'); }
  // Si lo que pide todavía no existe (competidores, proveedores…), no se dice nada más: solo eso.
  if (noEntendido.some(d => d.clave.startsWith('objetivo_'))) supuestos.clear();

  const configuracion = limpiarConfiguracion({
    tipo,
    producto,
    productos: tipo === 'comercial' ? productosDe(producto) : [],
    sectores: tipo === 'comercial' ? sectores : [],
    sectoresLibres: tipo === 'comercial' ? sectoresLibres : [],
    sectoresExcluidos: unicos(x.sectoresExcluidos).filter(s => s !== 'todas'),
    exclusiones: unicosPorTexto(x.exclusiones),
    paisCompleto,
    zonas,
    zonasLibres,
    zonasExcluidas: unicos(x.zonasExcluidas),
    tamanos: tipo === 'comercial' ? tamanos : [],
    prioridades: x.prioridades,
    salarioMinimo: tipo === 'laboral' ? salario.minimo : null,
    salarioMaximo: tipo === 'laboral' ? salario.maximo : null,
    moneda: salario.moneda || 'DOP',
    experiencia: tipo === 'laboral' ? x.experiencia : null,
    frecuencia,
    // «Solo cuando yo lo pida» (frecuencia manual) también dice cuánta libertad tiene: solo trabaja cuando él lo pide.
    // Si no lo dijo, queda el nivel más seguro: todo lo que sale espera su aprobación.
    autonomia: frecuencia === 'manual' ? 'solo_cuando_pida' : AUTONOMIA_POR_DEFECTO,
    capacidades,
    noEntendido,
  });
  configuracion.objetivo = objetivoSugerido(configuracion, idioma);
  return { configuracion, supuestos: CLAVES_SUPUESTOS.filter(s => supuestos.has(s)) };
}

// ---------- Limpieza y validación (para lo que interpreta el motor y para lo que cambia la persona) ----------
function listaDeClaves(valor, validas) {
  return unicos((Array.isArray(valor) ? valor : []).filter(v => typeof v === 'string' && validas.has(v))).slice(0, LIMITES.lista);
}

function listaDeTextos(valor, maximo = LIMITES.elemento) {
  const vistos = new Set();
  const lista = [];
  for (const v of Array.isArray(valor) ? valor : []) {
    const texto = recorte(v, maximo);
    const clave = comparable(texto);
    if (!texto || vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push(texto);
    if (lista.length >= LIMITES.lista) break;
  }
  return lista;
}

function salarioValido(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const n = Math.round(Number(valor));
  return Number.isFinite(n) && n > 0 && n <= LIMITES.salario ? n : null;
}

function dudasValidas(valor) {
  const lista = [];
  for (const d of Array.isArray(valor) ? valor : []) {
    if (!d || typeof d !== 'object' || !CLAVES_DUDAS_GUARDADAS.includes(d.clave)) continue;
    lista.push({ clave: d.clave, texto: recorte(d.texto, LIMITES.elemento), sugerencias: listaDeClaves(d.sugerencias, ZONA).slice(0, 3) });
    if (lista.length >= LIMITES.dudas) break;
  }
  return lista;
}

// Deja la configuración con la forma exacta que guarda la base: nada de más, nada fuera de límites.
export function limpiarConfiguracion(c = {}) {
  const tipo = TIPOS.includes(c.tipo) ? c.tipo : 'comercial';
  const autonomia = AUTONOMIAS.includes(c.autonomia) ? c.autonomia : AUTONOMIA_POR_DEFECTO;
  const capacidades = Object.fromEntries(CLAVES_CAPACIDADES.map(k => [k, c.capacidades?.[k] === true]));
  if (capacidades.contactar) capacidades.correos = true;
  return {
    esquema: ESQUEMA,
    tipo,
    objetivo: recorte(c.objetivo, LIMITES.objetivo),
    producto: recorte(c.producto, LIMITES.producto),
    productos: listaDeClaves(c.productos, PRODUCTO),
    sectores: listaDeClaves(c.sectores, SECTOR),
    sectoresLibres: listaDeTextos(c.sectoresLibres),
    sectoresExcluidos: listaDeClaves(c.sectoresExcluidos, SECTOR),
    exclusiones: listaDeTextos(c.exclusiones),
    paisCompleto: c.paisCompleto === true,
    zonas: listaDeClaves(c.zonas, ZONA),
    zonasLibres: listaDeTextos(c.zonasLibres),
    zonasExcluidas: listaDeClaves(c.zonasExcluidas, ZONA),
    tamanos: tipo === 'comercial' ? listaDeClaves(c.tamanos, new Set(CLAVES_TAMANOS)) : [],
    prioridades: listaDeTextos(c.prioridades, LIMITES.prioridad),
    salarioMinimo: tipo === 'laboral' ? salarioValido(c.salarioMinimo) : null,
    salarioMaximo: tipo === 'laboral' ? salarioValido(c.salarioMaximo) : null,
    moneda: c.moneda === 'USD' ? 'USD' : 'DOP',
    experiencia: tipo === 'laboral' && c.experiencia === 'no_requerida' ? 'no_requerida' : null,
    // «Solo cuando yo lo pida» siempre va con la frecuencia manual.
    frecuencia: autonomia === 'solo_cuando_pida' ? 'manual' : CLAVES_FRECUENCIAS.includes(c.frecuencia) ? c.frecuencia : FRECUENCIA_POR_DEFECTO,
    autonomia,
    capacidades,
    fuentes: FUENTES[tipo],
    ia: { ...IA_APAGADA },
    costoEstimadoUsd: 0,
    noEntendido: dudasValidas(c.noEntendido),
  };
}

// Todas las dudas de una configuración: las que dejó el motor y las que salen de los datos
// (lo mismo para buscar y para excluir, o un lugar fuera del país). La interfaz las muestra como preguntas.
export function dudas(config = {}) {
  const lista = dudasValidas(config.noEntendido);
  const excluidos = new Set(Array.isArray(config.sectoresExcluidos) ? config.sectoresExcluidos : []);
  for (const s of Array.isArray(config.sectores) ? config.sectores : []) if (excluidos.has(s)) lista.push({ clave: 'conflicto_sector', texto: s, sugerencias: [] });
  const zonasFuera = new Set(Array.isArray(config.zonasExcluidas) ? config.zonasExcluidas : []);
  for (const z of Array.isArray(config.zonas) ? config.zonas : []) if (zonasFuera.has(z)) lista.push({ clave: 'conflicto_zona', texto: z, sugerencias: [] });
  for (const z of Array.isArray(config.zonasLibres) ? config.zonasLibres : []) if (esExtranjero(z)) lista.push({ clave: 'fuera_del_pais', texto: recorte(z, LIMITES.elemento), sugerencias: [] });
  return lista;
}

// Lo que falta para poder aprobar. La interfaz lo muestra como preguntas; «dudas» quiere decir
// que hay cosas sin entender (la lista está en dudas()).
export function faltantes(config) {
  const lista = [];
  if (!config.producto) lista.push('producto');
  if (config.tipo === 'comercial' && !config.sectores.length && !config.sectoresLibres.length) lista.push('sectores');
  if (!config.paisCompleto && !config.zonas.length && !config.zonasLibres.length) lista.push('zonas');
  if (!Object.values(config.capacidades).some(Boolean)) lista.push('capacidades');
  if (dudas(config).length) lista.push('dudas');
  return lista;
}

// ---------- Lo que la persona cambia a mano en el formulario ----------
function partes(valor, separador = /[,;\n]+/) {
  const lista = Array.isArray(valor) ? valor.map(comoTexto) : comoTexto(valor).split(separador);
  return lista.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, LIMITES.lista * 3);
}

// Junta pedazos que, unidos con comas, son una etiqueta conocida («Restaurantes, bares y cafés»).
function piezas(valor, etiquetas) {
  const lista = partes(valor);
  const resultado = [];
  for (let i = 0; i < lista.length; i++) {
    let encontrada = null;
    for (let j = Math.min(lista.length, i + 4); j > i; j--) {
      const comp = comparable(lista.slice(i, j).join(', '));
      const hallada = etiquetas.get(comp);
      if (hallada) { encontrada = { clave: hallada, hasta: j }; break; }
    }
    if (encontrada) { resultado.push({ clave: encontrada.clave }); i = encontrada.hasta - 1; } else resultado.push({ texto: lista[i] });
  }
  return resultado;
}

const ETIQUETAS_SECTORES = new Map(SECTORES.flatMap(s => [[comparable(s.es), s.clave], [comparable(s.en), s.clave]]));
const ETIQUETAS_ZONAS = new Map(ZONAS.map(z => [comparable(z.nombre), z.clave]));

function clasificarSectores(valor) {
  const claves = [];
  const libres = [];
  for (const p of piezas(valor, ETIQUETAS_SECTORES)) {
    if (p.clave) { claves.push(p.clave); continue; }
    const r = negociosDeTexto(p.texto);
    if (r.todas) claves.push('todas');
    claves.push(...r.claves);
    libres.push(...r.libres);
  }
  const lista = unicos(claves);
  return { claves: lista.length > 1 ? lista.filter(c => c !== 'todas') : lista, libres: unicosPorTexto(libres) };
}

function clasificarZonas(valor) {
  const claves = [];
  const libres = [];
  let pais = false;
  for (const p of piezas(valor, ETIQUETAS_ZONAS)) {
    if (p.clave) { claves.push(p.clave); continue; }
    const r = lugaresDeTexto(p.texto);
    if (r.libre) libres.push(r.libre);
    claves.push(...r.claves);
    if (r.pais) pais = true;
  }
  return { claves: unicos(claves), libres: unicosPorTexto(libres), pais };
}

function clasificarExclusiones(valor) {
  const sectores = [];
  const zonas = [];
  const libres = [];
  for (const p of piezas(valor, new Map([...ETIQUETAS_SECTORES, ...ETIQUETAS_ZONAS]))) {
    if (p.clave) { (SECTOR.has(p.clave) ? sectores : zonas).push(p.clave); continue; }
    const r = exclusionDeTexto(p.texto);
    sectores.push(...r.sectores);
    zonas.push(...r.zonas);
    libres.push(...r.libres);
  }
  return { sectores: unicos(sectores).filter(s => s !== 'todas'), zonas: unicos(zonas), libres: unicosPorTexto(libres) };
}

// campos: lo que manda el formulario (textos tal como los escribió la persona).
// campos.resueltas: los números de las dudas que la persona marcó como «ya lo arreglé».
// Guardar el formulario sin cambiar nada deja la configuración exactamente igual.
export function configuracionDesdeCampos(campos = {}, anterior = {}) {
  const previa = anterior && typeof anterior === 'object' ? anterior : {};
  const tipo = TIPOS.includes(campos.tipo) ? campos.tipo : previa.tipo;
  const sectores = clasificarSectores(campos.sectores);
  const zonas = clasificarZonas(campos.zonas);
  const exclusiones = clasificarExclusiones(campos.exclusiones);
  const producto = recorte(campos.producto, LIMITES.producto);
  const mismoProducto = comparable(producto) === comparable(comoTexto(previa.producto)) && previa.tipo === tipo && Array.isArray(previa.productos);
  const productos = tipo === 'comercial' ? (mismoProducto ? previa.productos : productosDe(producto)) : [];
  const capacidades = campos.capacidades && typeof campos.capacidades === 'object' ? campos.capacidades : previa.capacidades;
  // Autonomía: la que eligió en el formulario, o la que tenía. Si tenía «solo cuando yo lo pida» y ahora eligió
  // otra frecuencia sin tocar la autonomía, vuelve al nivel más seguro (todo lo que sale espera su aprobación).
  const eligioAutonomia = AUTONOMIAS.includes(campos.autonomia);
  let autonomia = eligioAutonomia ? campos.autonomia : previa.autonomia;
  if (!eligioAutonomia && autonomia === 'solo_cuando_pida' && CLAVES_FRECUENCIAS.includes(campos.frecuencia) && campos.frecuencia !== 'manual') {
    autonomia = AUTONOMIA_POR_DEFECTO;
  }

  // Dudas: se quitan las que la persona marcó; un lugar nuevo que no se conoce se vuelve a preguntar.
  const resueltas = new Set((Array.isArray(campos.resueltas) ? campos.resueltas : []).map(Number));
  const noEntendido = dudasValidas(previa.noEntendido).filter((_, i) => !resueltas.has(i));
  const libresAntes = new Set((Array.isArray(previa.zonasLibres) ? previa.zonasLibres : []).map(z => comparable(comoTexto(z))));
  for (const z of zonas.libres) {
    if (!libresAntes.has(comparable(z)) && !esExtranjero(z)) noEntendido.push({ clave: 'lugar', texto: z, sugerencias: sugerenciasDeLugar(z) });
  }

  return limpiarConfiguracion({
    ...previa,
    tipo,
    objetivo: campos.objetivo ?? previa.objetivo,
    producto,
    productos,
    sectores: sectores.claves,
    sectoresLibres: sectores.libres,
    sectoresExcluidos: exclusiones.sectores,
    exclusiones: exclusiones.libres,
    paisCompleto: campos.paisCompleto === true || zonas.pais,
    zonas: zonas.claves,
    zonasLibres: zonas.libres,
    zonasExcluidas: exclusiones.zonas,
    tamanos: Array.isArray(campos.tamanos) ? campos.tamanos : [],
    // Las prioridades son frases (pueden llevar comas o punto y coma): van una por línea, hasta 160 letras.
    prioridades: partes(campos.prioridades, /\n+/).map(p => recorte(p, LIMITES.prioridad)),
    salarioMinimo: campos.salarioMinimo,
    salarioMaximo: campos.salarioMaximo,
    moneda: campos.moneda ?? previa.moneda,
    experiencia: campos.experienciaNoRequerida === true ? 'no_requerida' : null,
    frecuencia: campos.frecuencia,
    autonomia,
    capacidades,
    noEntendido,
  });
}

// Los lugares NUEVOS (que no estaban en «anterior») que no se conocen, no son de fuera del país y se quedaron sin su
// duda 'lugar' en «nueva» (las dudas no cupieron: LIMITES.dudas). Ronda 3 de revisión: la ayuda de IA no guarda una
// versión así (src/ia/ayuda.js): un lugar que no se conoce siempre se pregunta.
export function lugaresNuevosSinDuda(anterior = {}, nueva = {}) {
  const textos = v => (Array.isArray(v) ? v.map(comoTexto) : []);
  const antes = new Set(textos(anterior?.zonasLibres).map(comparable));
  const conDuda = new Set(dudasValidas(nueva?.noEntendido).filter(d => d.clave === 'lugar').map(d => comparable(d.texto)));
  return textos(nueva?.zonasLibres).filter(z => !antes.has(comparable(z)) && !esExtranjero(z) && !conDuda.has(comparable(z)));
}

// Lo que la interfaz necesita para mostrar nombres en español o inglés.
export function catalogo() {
  return {
    sectores: SECTORES.map(s => ({ clave: s.clave, es: s.es, en: s.en })),
    productos: PRODUCTOS.map(p => ({ clave: p.clave, es: p.es, en: p.en })),
    zonas: ZONAS.map(z => ({ clave: z.clave, nombre: z.nombre, tipo: z.tipo, provincia: z.provincia ?? null })),
    tamanos: CLAVES_TAMANOS,
    frecuencias: CLAVES_FRECUENCIAS,
    capacidades: CAPACIDADES.map(c => ({ clave: c.clave, desde: c.desde })),
    combinaciones: COMBINACIONES,
    autonomias: AUTONOMIAS,
    autonomiaPorDefecto: AUTONOMIA_POR_DEFECTO,
    tipos: TIPOS,
    dudas: CLAVES_DUDAS,
    supuestos: CLAVES_SUPUESTOS,
  };
}
