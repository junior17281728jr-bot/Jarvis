// Motor propio: entiende las instrucciones de un proyecto SIN IA.
// Lee lo que la persona escribió, encuentra sectores, zonas, producto, salario, exclusiones, prioridades
// y frecuencia, y arma una configuración que la persona revisa y aprueba antes de que se haga nada.
// Si algo no lo entiende, no lo adivina: lo deja como pregunta (ver faltantes()).
import {
  SECTORES, PRODUCTOS, PROVINCIAS, CIUDADES, REGIONES, PAIS_COMPLETO, TAMANOS, FRECUENCIAS, FRECUENCIA_POR_DEFECTO,
  CAPACIDADES, CLAVES_CAPACIDADES, COMBINACIONES, COMBINACION_POR_DEFECTO, SENALES_LABORAL, SENALES_COMERCIAL, FUENTES,
} from './diccionarios.js';
import { normalizar, comparable, buscarFrases, contiene, variantes } from './texto.js';

export const LIMITES = { instrucciones: 4000, nombre: 80, objetivo: 300, producto: 120, elemento: 80, lista: 30, prioridad: 160, salario: 10_000_000 };
export const TIPOS = ['comercial', 'laboral'];
export const CLAVES_FRECUENCIAS = FRECUENCIAS.map(f => f.clave);
export const CLAVES_TAMANOS = TAMANOS.map(t => t.clave);
export const ESQUEMA = 1;

const SECTOR = new Map(SECTORES.map(s => [s.clave, s]));
const PRODUCTO = new Map(PRODUCTOS.map(p => [p.clave, p]));
const ZONAS = [
  ...PROVINCIAS.map(p => ({ ...p, tipo: 'provincia' })),
  ...CIUDADES.map(c => ({ ...c, tipo: 'ciudad' })),
  ...REGIONES.map(r => ({ ...r, tipo: 'region' })),
];
const ZONA = new Map(ZONAS.map(z => [z.clave, z]));

const ENTRADAS_LUGARES_Y_COSAS = [
  ...SECTORES.flatMap(s => s.palabras.map(frase => ({ frase, dato: { que: 'sector', clave: s.clave, general: Boolean(s.general) } }))),
  ...PRODUCTOS.flatMap(p => p.palabras.map(frase => ({ frase, dato: { que: 'producto', clave: p.clave } }))),
  ...ZONAS.flatMap(z => z.palabras.map(frase => ({ frase, dato: { que: 'zona', clave: z.clave } }))),
  ...PAIS_COMPLETO.map(frase => ({ frase, dato: { que: 'pais' } })),
];
const ENTRADAS_TAMANOS = TAMANOS.flatMap(t => t.palabras.map(frase => ({ frase, dato: t.clave })));

// ¿Aparece alguna de estas frases (o su plural)?
const contieneAlguna = (norm, frases) => frases.some(f => variantes(f).some(v => contiene(norm, v)));
const recorte = (texto, maximo) => String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, maximo);
const unicos = lista => [...new Set(lista)];

// ---------- Partes del texto que excluyen, priorizan o califican ----------
const DISPARADORES_EXCLUSION = ['excepto', 'salvo', 'menos', 'no quiero', 'no incluyas', 'no incluir', 'no busques', 'que no sean', 'excluye', 'excluyendo', 'excluir', 'evita', 'evitar', 'fuera de', 'nada de', 'except', 'excluding', 'exclude', 'not including'];
const DISPARADORES_SIN = ['sin', 'without'];
const CORTES = ['pero', 'prioriza', 'priorizar', 'quiero', 'busco', 'que', 'con', 'en', 'para', 'cada', 'preferiblemente', 'sobre todo', 'but', 'with', 'in', 'every'];
const DISPARADORES_PRIORIDAD = [
  { frase: 'prioriza', incluir: false }, { frase: 'priorizar', incluir: false }, { frase: 'prioriza a', incluir: false },
  { frase: 'dale prioridad a', incluir: false }, { frase: 'prioridad a', incluir: false }, { frase: 'preferiblemente', incluir: false },
  { frase: 'preferentemente', incluir: false }, { frase: 'de preferencia', incluir: false }, { frase: 'sobre todo', incluir: false },
  { frase: 'especialmente', incluir: false }, { frase: 'en especial', incluir: false }, { frase: 'prefiero', incluir: false },
  { frase: 'que tengan', incluir: true }, { frase: 'prioritize', incluir: false }, { frase: 'especially', incluir: false },
  { frase: 'preferably', incluir: false }, { frase: 'that have', incluir: true },
];
const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'a', 'y', 'o', 'e', 'que', 'the', 'a', 'an', 'and', 'or', 'of']);

function posiciones(norm, frase) {
  const patron = new RegExp(`(?<![a-z0-9$])${comparable(frase).split(' ').join('\\s+')}(?![a-z0-9$])`, 'g');
  return [...norm.matchAll(patron)].map(m => ({ inicio: m.index, fin: m.index + m[0].length }));
}

// Hasta dónde llega una frase que empezó en «desde»: el final de la oración, una palabra de corte o 80 letras.
function finDeTramo(norm, desde, { cortes = CORTES, maximo = 80 } = {}) {
  let fin = Math.min(norm.length, desde + maximo);
  const punto = norm.indexOf('.', desde);
  if (punto !== -1 && punto < fin) fin = punto;
  for (const corte of cortes) {
    for (const p of posiciones(norm, corte)) if (p.inicio > desde && p.inicio < fin) fin = p.inicio;
  }
  return fin;
}

function tramosDeExclusion(norm) {
  const tramos = [];
  for (const disparador of DISPARADORES_EXCLUSION) {
    for (const p of posiciones(norm, disparador)) {
      const antes = norm.slice(Math.max(0, p.inicio - 3), p.inicio);
      const despues = norm.slice(p.fin, p.fin + 6);
      // «al menos», «a menos que» y «menos de 25,000» no son exclusiones.
      if (disparador === 'menos' && (/\bal?\s$/.test(antes) || /^\s+(de\s+\d|que)/.test(despues) || /^\s+\d/.test(despues))) continue;
      tramos.push({ inicio: p.fin, fin: finDeTramo(norm, p.fin, { cortes: CORTES.filter(c => c !== 'en' && c !== 'in') }), clase: 'excluir' });
    }
  }
  for (const disparador of DISPARADORES_SIN) {
    for (const p of posiciones(norm, disparador)) tramos.push({ inicio: p.fin, fin: finDeTramo(norm, p.fin), clase: 'sin', desde: p.inicio });
  }
  return tramos;
}

function dentroDe(tramos, h) {
  return tramos.find(t => h.inicio >= t.inicio && h.fin <= t.fin) || null;
}

function textoSignificativo(original, inicio, fin) {
  const texto = recorte(original.slice(inicio, fin), LIMITES.elemento);
  const palabras = comparable(texto).split(' ').filter(p => p && !RELLENO.has(p));
  return palabras.length ? texto.replace(/^[\s,;:]+|[\s,;:]+$/g, '') : '';
}

function prioridadesDe(original, norm) {
  const encontradas = [];
  const disparos = DISPARADORES_PRIORIDAD.flatMap(d => posiciones(norm, d.frase).map(p => ({ ...p, ...d })))
    .sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
  let hasta = -1;
  for (const d of disparos) {
    if (d.inicio < hasta) continue;
    const desde = d.incluir ? d.inicio : d.fin;
    let fin = Math.min(norm.length, desde + LIMITES.prioridad);
    const punto = norm.indexOf('.', desde);
    if (punto !== -1 && punto < fin) fin = punto;
    hasta = fin;
    const texto = recorte(original.slice(desde, fin), LIMITES.prioridad).replace(/^[\s,;:]+|[\s,;:]+$/g, '');
    // «preferiblemente sin experiencia» ya se entiende como experiencia no obligatoria.
    if (!texto || /^sin experiencia|^without experience/.test(comparable(texto))) continue;
    encontradas.push(texto);
  }
  return encontradas;
}

// ---------- Salario ----------
const PALABRAS_SALARIO = ['salario', 'sueldo', 'pago', 'paguen', 'pagan', 'ganar', 'gane', 'ingreso', 'salary', 'pay', 'wage', 'earn'];
const MINIMO = ['mas de', 'superior a', 'superior de', 'mayor a', 'mayor de', 'minimo', 'minimo de', 'al menos', 'desde', 'a partir de', 'arriba de', 'por encima de', 'over', 'more than', 'at least', 'above', 'from'];
const MAXIMO = ['menos de', 'hasta', 'maximo', 'no mas de', 'inferior a', 'por debajo de', 'under', 'up to', 'less than', 'below'];
const UNIDADES_QUE_NO_SON_DINERO = /^\s*(anos|ano|meses|mes|dias|dia|horas|hora|semanas|years|year|months|days|hours|km|kilometros|empleados|personas|habitaciones|camas|sucursales|%|por ciento)\b/;

function numero(texto, mil) {
  let limpio = texto;
  if (/^\d{1,3}([.,]\d{3})+$/.test(limpio)) limpio = limpio.replace(/[.,]/g, '');
  else limpio = limpio.replace(',', '.');
  const valor = Number(limpio);
  if (!Number.isFinite(valor)) return null;
  return Math.round(mil ? valor * 1000 : valor);
}

function salarioDe(norm, esLaboral) {
  const patron = /(us\$|rd\$|usd|dop|\$)?\s?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s?(mil|k)?(?![a-z0-9])\s?(pesos|dolares|usd|dop)?/g;
  const hablaDeSalario = PALABRAS_SALARIO.some(p => contiene(norm, p));
  const resultado = { salarioMinimo: null, salarioMaximo: null, moneda: 'DOP' };
  for (const m of norm.matchAll(patron)) {
    const [todo, simbolo, cifra, mil, palabraMoneda] = m;
    const despues = norm.slice(m.index + todo.length);
    if (!simbolo && !palabraMoneda && UNIDADES_QUE_NO_SON_DINERO.test(despues)) continue;
    if (!simbolo && !palabraMoneda && !hablaDeSalario) continue;
    if (!esLaboral && !hablaDeSalario) continue;
    const valor = numero(cifra, Boolean(mil));
    if (valor == null || valor < 100 || valor > LIMITES.salario) continue;
    if (/us\$|usd/.test(simbolo || '') || /dolares|usd/.test(palabraMoneda || '')) resultado.moneda = 'USD';
    const antes = norm.slice(Math.max(0, m.index - 28), m.index);
    const esMaximo = MAXIMO.some(p => contiene(antes, p)) && !contiene(antes, 'al menos');
    const esMinimo = MINIMO.some(p => contiene(antes, p));
    const entreAntes = contiene(norm.slice(Math.max(0, m.index - 60), m.index), 'entre');
    if (/\b(y|a|and|to)\s*$/.test(antes) && entreAntes && resultado.salarioMinimo != null && resultado.salarioMaximo == null) resultado.salarioMaximo = valor;
    else if (contiene(antes, 'entre')) resultado.salarioMinimo ??= valor;
    else if (esMaximo) resultado.salarioMaximo ??= valor;
    else if (esMinimo || resultado.salarioMinimo == null) resultado.salarioMinimo ??= valor;
  }
  return resultado;
}

// ---------- Puesto (empleo) y producto (venta) cuando no está en el diccionario ----------
const DISPARADORES_PUESTO = ['trabajo de', 'trabajo como', 'empleo de', 'empleo como', 'empleos de', 'puesto de', 'puestos de', 'vacante de', 'vacantes de', 'trabajar de', 'trabajar como', 'busco trabajo', 'busco empleo', 'empleos', 'empleo', 'work as', 'job as', 'jobs as', 'position as', 'job', 'jobs'];
const DISPARADORES_PRODUCTO = ['vendo', 'vende', 'vendemos', 'ofrezco', 'ofrece', 'ofrecemos', 'que necesiten', 'puedan necesitar', 'necesitan', 'i sell', 'we sell', 'sell', 'offer'];
const CORTES_FRASE = ['en', 'con', 'que', 'y', 'para', 'sin', 'por', 'donde', 'cerca', 'a', 'de mas', 'con un', 'mas de', 'in', 'with', 'that', 'and', 'for', 'near', 'at'];
const ARTICULOS = /^(un|una|unos|unas|el|la|los|las|mis|mi|nuestros|nuestras|nuestro|nuestra|sus|de|como|a|an|the|my|our|as)\s+/;

function fraseTras(original, norm, disparadores, { maximoPalabras = 6 } = {}) {
  const disparos = disparadores.flatMap(d => posiciones(norm, d)).sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
  for (const d of disparos) {
    const fin = finDeTramo(norm, d.fin, { cortes: CORTES_FRASE, maximo: 60 });
    let texto = recorte(original.slice(d.fin, fin), LIMITES.producto).replace(/^[\s,;:]+|[\s,;:]+$/g, '');
    let comp = comparable(texto);
    while (ARTICULOS.test(comp)) {
      const quitar = comp.match(ARTICULOS)[0].length;
      texto = texto.slice(quitar).trim();
      comp = comparable(texto);
    }
    if (!comp || RELLENO.has(comp)) continue;
    if (comp.split(' ').length > maximoPalabras) texto = texto.split(/\s+/).slice(0, maximoPalabras).join(' ');
    return texto;
  }
  return '';
}

// ---------- Interpretar ----------
function textoDe(idioma, es, en) {
  return idioma === 'en' ? en : es;
}

function etiquetaProducto(clave, idioma) {
  const p = PRODUCTO.get(clave);
  return p ? textoDe(idioma, p.es, p.en) : clave;
}

export function capacidadesDesdeLista(lista) {
  const encendidas = new Set(lista);
  if (encendidas.has('contactar')) encendidas.add('correos');
  return Object.fromEntries(CLAVES_CAPACIDADES.map(c => [c, encendidas.has(c)]));
}

export function nombreSugerido(config, idioma = 'es') {
  const producto = recorte(config.producto, 60);
  if (config.tipo === 'laboral') return producto ? textoDe(idioma, `Empleo: ${producto}`, `Job: ${producto}`) : textoDe(idioma, 'Búsqueda de empleo', 'Job search');
  return producto ? textoDe(idioma, `Clientes para ${producto}`, `Customers for ${producto}`) : textoDe(idioma, 'Proyecto nuevo', 'New project');
}

export function objetivoSugerido(config, idioma = 'es') {
  const producto = recorte(config.producto, 100);
  if (config.tipo === 'laboral') return producto ? textoDe(idioma, `Conseguir empleo de ${producto}`, `Get a job as ${producto}`) : textoDe(idioma, 'Conseguir empleo', 'Get a job');
  return producto ? textoDe(idioma, `Encontrar clientes que puedan necesitar ${producto}`, `Find customers who may need ${producto}`) : textoDe(idioma, 'Encontrar clientes', 'Find customers');
}

// Devuelve { configuracion, supuestos }. «supuestos» son las cosas que el motor decidió solo
// (por ejemplo, la frecuencia) para que la persona las vea y las cambie si no son así.
export function interpretar(instrucciones, { idioma = 'es' } = {}) {
  const original = String(instrucciones ?? '').slice(0, LIMITES.instrucciones);
  const norm = normalizar(original.replace(/\bR\.\s?D\.(?!\$)/gi, m => `RD${' '.repeat(m.length - 2)}`));
  const supuestos = [];

  // Tipo de proyecto
  const puntosLaboral = SENALES_LABORAL.filter(s => contieneAlguna(norm, [s])).length;
  const puntosComercial = SENALES_COMERCIAL.filter(s => contieneAlguna(norm, [s])).length;
  const tipo = puntosLaboral > puntosComercial ? 'laboral' : 'comercial';
  if (puntosLaboral === 0 && puntosComercial === 0) supuestos.push('tipo');

  const tramos = tramosDeExclusion(norm);
  const hallazgos = buscarFrases(norm, ENTRADAS_LUGARES_Y_COSAS);
  const sectores = [];
  const generales = [];
  const sectoresExcluidos = [];
  const productos = [];
  const zonas = [];
  const zonasExcluidas = [];
  let paisCompleto = false;
  const usados = [];

  for (const h of hallazgos) {
    const tramo = dentroDe(tramos, h);
    const excluido = tramo && (tramo.clase === 'excluir' || (tramo.clase === 'sin' && h.dato.que === 'sector' && !h.dato.general));
    if (tramo) usados.push(tramo);
    const { que, clave } = h.dato;
    if (que === 'sector') {
      if (excluido) sectoresExcluidos.push(clave);
      else if (h.dato.general) generales.push(clave);
      else sectores.push(clave);
    } else if (que === 'producto' && !excluido) productos.push(clave);
    else if (que === 'zona') (excluido ? zonasExcluidas : zonas).push(clave);
    else if (que === 'pais' && !excluido) paisCompleto = true;
  }

  // Lo que va después de «sin», «excepto»… y no es un sector ni una zona conocida
  const exclusiones = [];
  const prioridades = prioridadesDe(original, norm);
  let experiencia = null;
  for (const tramo of tramos) {
    const contenido = comparable(original.slice(tramo.inicio, tramo.fin));
    if (tramo.clase === 'sin') {
      if (/^(experiencia|ninguna experiencia|experience)/.test(contenido)) {
        experiencia = 'no_requerida';
        continue;
      }
      if (usados.includes(tramo) && hallazgos.some(h => dentroDe([tramo], h) && h.dato.que === 'sector')) continue;
      const texto = textoSignificativo(original, tramo.desde, tramo.fin);
      if (texto && !prioridades.some(p => comparable(p).includes(comparable(texto)))) prioridades.push(texto);
      continue;
    }
    if (usados.includes(tramo)) continue;
    const texto = textoSignificativo(original, tramo.inicio, tramo.fin);
    if (texto) exclusiones.push(texto);
  }

  // Si solo dijo «empresas» o «negocios», se buscan todas (y se avisa).
  if (!sectores.length && generales.length && tipo === 'comercial') {
    sectores.push('todas');
    supuestos.push('sectores_todos');
  }
  if (hallazgos.some(h => h.dato.clave === 'gran-santo-domingo')) supuestos.push('gran_santo_domingo');

  // Producto o puesto
  let producto = '';
  const listaProductos = unicos(productos);
  if (tipo === 'laboral') producto = fraseTras(original, norm, DISPARADORES_PUESTO, { maximoPalabras: 5 });
  else if (listaProductos.length) producto = listaProductos.map(c => etiquetaProducto(c, idioma)).join(', ');
  else producto = fraseTras(original, norm, DISPARADORES_PRODUCTO);

  // Tamaño, frecuencia, salario
  const tamanos = unicos(buscarFrases(norm, ENTRADAS_TAMANOS).map(h => h.dato));
  let frecuencia = FRECUENCIAS.find(f => contieneAlguna(norm, f.palabras))?.clave;
  if (!frecuencia) {
    frecuencia = FRECUENCIA_POR_DEFECTO;
    supuestos.push('frecuencia');
  }
  const salario = salarioDe(norm, tipo === 'laboral');

  // Capacidades: investigar siempre; lo demás según lo que pidió.
  const pedidas = CAPACIDADES.filter(c => c.clave !== 'investigar' && contieneAlguna(norm, c.palabras)).map(c => c.clave);
  let capacidades;
  if (pedidas.length) capacidades = capacidadesDesdeLista(['investigar', 'analizar', 'recomendar', ...pedidas]);
  else {
    capacidades = capacidadesDesdeLista(COMBINACIONES[COMBINACION_POR_DEFECTO]);
    supuestos.push('capacidades');
  }

  const configuracion = limpiarConfiguracion({
    tipo,
    producto,
    productos: listaProductos,
    sectores: unicos(sectores),
    sectoresLibres: [],
    sectoresExcluidos: unicos(sectoresExcluidos),
    exclusiones,
    paisCompleto,
    zonas: unicos(zonas),
    zonasLibres: [],
    zonasExcluidas: unicos(zonasExcluidas),
    tamanos: tipo === 'comercial' ? tamanos : [],
    prioridades,
    salarioMinimo: tipo === 'laboral' ? salario.salarioMinimo : null,
    salarioMaximo: tipo === 'laboral' ? salario.salarioMaximo : null,
    moneda: salario.moneda,
    experiencia: tipo === 'laboral' ? experiencia : null,
    frecuencia,
    capacidades,
  });
  configuracion.objetivo = objetivoSugerido(configuracion, idioma);
  return { configuracion, supuestos: unicos(supuestos) };
}

// ---------- Limpieza y validación (para lo que interpreta el motor y para lo que cambia la persona) ----------
function listaDeClaves(valor, validas) {
  return unicos((Array.isArray(valor) ? valor : []).filter(v => validas.has(v))).slice(0, LIMITES.lista);
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
  const n = Math.round(Number(valor));
  return Number.isFinite(n) && n > 0 && n <= LIMITES.salario ? n : null;
}

// Deja la configuración con la forma exacta que guarda la base: nada de más, nada fuera de límites.
export function limpiarConfiguracion(c = {}) {
  const tipo = TIPOS.includes(c.tipo) ? c.tipo : 'comercial';
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
    frecuencia: CLAVES_FRECUENCIAS.includes(c.frecuencia) ? c.frecuencia : FRECUENCIA_POR_DEFECTO,
    capacidades,
    fuentes: FUENTES[tipo],
  };
}

// Lo que falta para poder aprobar. La interfaz lo muestra como preguntas.
export function faltantes(config) {
  const lista = [];
  if (!config.producto) lista.push('producto');
  if (config.tipo === 'comercial' && !config.sectores.length && !config.sectoresLibres.length) lista.push('sectores');
  if (!config.paisCompleto && !config.zonas.length && !config.zonasLibres.length) lista.push('zonas');
  if (!Object.values(config.capacidades).some(Boolean)) lista.push('capacidades');
  return lista;
}

// ---------- Lo que la persona cambia a mano en el formulario ----------
function partes(texto, separador = /[,;\n]+/) {
  const lista = Array.isArray(texto) ? texto : String(texto ?? '').split(separador);
  return lista.map(p => recorte(p, LIMITES.elemento)).filter(Boolean).slice(0, LIMITES.lista * 2);
}

function porEtiqueta(texto, entradas) {
  const comp = comparable(texto);
  return entradas.find(e => [e.es, e.en, e.nombre].filter(Boolean).some(n => comparable(n) === comp)) || null;
}

// Separa una lista escrita a mano en claves conocidas y textos libres.
function clasificarSectores(texto) {
  const claves = [];
  const libres = [];
  for (const parte of partes(texto)) {
    const exacta = porEtiqueta(parte, SECTORES);
    if (exacta) { claves.push(exacta.clave); continue; }
    const encontrados = buscarFrases(normalizar(parte), ENTRADAS_LUGARES_Y_COSAS).filter(h => h.dato.que === 'sector');
    if (encontrados.length) claves.push(...encontrados.map(h => h.dato.clave));
    else libres.push(parte);
  }
  return { claves: unicos(claves), libres };
}

function clasificarZonas(texto) {
  const claves = [];
  const libres = [];
  let pais = false;
  for (const parte of partes(texto)) {
    const exacta = porEtiqueta(parte, ZONAS);
    if (exacta) { claves.push(exacta.clave); continue; }
    const encontrados = buscarFrases(normalizar(parte), ENTRADAS_LUGARES_Y_COSAS).filter(h => h.dato.que === 'zona' || h.dato.que === 'pais');
    if (encontrados.some(h => h.dato.que === 'pais')) pais = true;
    const zonasHalladas = encontrados.filter(h => h.dato.que === 'zona').map(h => h.dato.clave);
    if (zonasHalladas.length) claves.push(...zonasHalladas);
    else if (!encontrados.length) libres.push(parte);
  }
  return { claves: unicos(claves), libres, pais };
}

function clasificarExclusiones(texto) {
  const sectores = [];
  const zonas = [];
  const libres = [];
  for (const parte of partes(texto)) {
    const sector = clasificarSectores(parte);
    if (sector.claves.length && !sector.libres.length) { sectores.push(...sector.claves); continue; }
    const zona = clasificarZonas(parte);
    if (zona.claves.length && !zona.libres.length) { zonas.push(...zona.claves); continue; }
    libres.push(parte);
  }
  return { sectores: unicos(sectores), zonas: unicos(zonas), libres };
}

// campos: lo que manda el formulario (textos tal como los escribió la persona).
export function configuracionDesdeCampos(campos = {}, anterior = {}) {
  const sectores = clasificarSectores(campos.sectores);
  const zonas = clasificarZonas(campos.zonas);
  const exclusiones = clasificarExclusiones(campos.exclusiones);
  const tipo = TIPOS.includes(campos.tipo) ? campos.tipo : anterior.tipo;
  const producto = recorte(campos.producto, LIMITES.producto);
  // Si el producto escrito coincide con uno del diccionario, se guarda su clave (servirá para puntuar).
  const productos = tipo === 'comercial'
    ? unicos(buscarFrases(normalizar(producto), ENTRADAS_LUGARES_Y_COSAS).filter(h => h.dato.que === 'producto').map(h => h.dato.clave))
    : [];
  const capacidades = campos.capacidades && typeof campos.capacidades === 'object' ? campos.capacidades : anterior.capacidades;
  return limpiarConfiguracion({
    ...anterior,
    tipo,
    objetivo: campos.objetivo ?? anterior.objetivo,
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
    // Las prioridades son frases (pueden llevar comas): van una por línea.
    prioridades: partes(campos.prioridades, /[;\n]+/).map(p => recorte(p, LIMITES.prioridad)),
    salarioMinimo: campos.salarioMinimo,
    salarioMaximo: campos.salarioMaximo,
    moneda: campos.moneda ?? anterior.moneda,
    experiencia: campos.experienciaNoRequerida === true ? 'no_requerida' : null,
    frecuencia: campos.frecuencia,
    capacidades,
  });
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
    tipos: TIPOS,
  };
}
