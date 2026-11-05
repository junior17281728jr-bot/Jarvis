// OPORTIA: el creador con toques. Convierte lo que la persona elige tocando (qué quiere, a qué negocios, dónde,
// de qué tamaño y cada cuánto) en una frase sencilla que el motor entiende igual que si la hubiera escrito.
// Así todo sigue igual que con el texto libre: «Lo que entendí», las dudas, la aprobación, las versiones y el
// límite de 4000 letras. Este archivo no toca la pantalla (solo datos y texto): las pruebas lo usan directamente
// (test/creador.test.js comprueba que cada frase que puede salir de aquí se entiende sin adivinar nada).

// Cada negocio con las palabras que el motor reconoce sin dudar, en español y en inglés.
// El orden es el de la pantalla: primero los más pedidos.
export const SECTORES_CREADOR = [
  ['hoteles', 'hoteles', 'hotels'],
  ['clinicas', 'clínicas', 'clinics'],
  ['restaurantes', 'restaurantes', 'restaurants'],
  ['farmacias', 'farmacias', 'pharmacies'],
  ['supermercados', 'supermercados', 'supermarkets'],
  ['colmados', 'colmados', 'corner stores'],
  ['tiendas', 'tiendas', 'stores'],
  ['ferreterias', 'ferreterías', 'hardware stores'],
  ['fabricas', 'fábricas', 'factories'],
  ['constructoras', 'constructoras', 'construction companies'],
  ['educacion', 'colegios', 'schools'],
  ['finanzas', 'bancos', 'banks'],
  ['belleza', 'salones de belleza', 'beauty salons'],
  ['talleres', 'talleres mecánicos', 'garages'],
  ['odontologia', 'consultorios dentales', 'dental offices'],
  ['laboratorios', 'laboratorios', 'laboratories'],
  ['panaderias', 'panaderías', 'bakeries'],
  ['zonas-francas', 'empresas de zona franca', 'free trade zone companies'],
  ['inmobiliarias', 'inmobiliarias', 'real estate companies'],
  ['aseguradoras', 'aseguradoras', 'insurance companies'],
  ['bancas', 'bancas de lotería', 'lottery shops'],
  ['concesionarios', 'concesionarios', 'car dealerships'],
  ['gimnasios', 'gimnasios', 'gyms'],
  ['transporte', 'empresas de transporte', 'transport companies'],
  ['turismo', 'agencias de viajes', 'travel agencies'],
  ['agricultura', 'fincas', 'farms'],
  ['servicios-profesionales', 'oficinas', 'offices'],
  ['empresas-servicios', 'empresas de servicios', 'service companies'],
  ['call-centers', 'call centers', 'call centers'],
  ['eventos', 'salones de eventos', 'event venues'],
  ['veterinarias', 'veterinarias', 'vet clinics'],
  ['iglesias', 'iglesias', 'churches'],
  ['ong', 'fundaciones', 'foundations'],
  ['joyerias', 'joyerías', 'jewelry stores'],
  ['lavaderos', 'car wash', 'car washes'],
  ['discotecas', 'discotecas', 'nightclubs'],
  ['combustible', 'estaciones de combustible', 'gas stations'],
].map(([clave, es, en]) => ({ clave, es, en }));
// Cuántos se ven al abrir (los demás, con «Ver todos»).
export const SECTORES_A_LA_VISTA = 12;
// «Todo tipo de empresas»: va solo (si se elige, los demás se quitan).
export const TODAS = { clave: 'todas', es: 'todo tipo de empresas', en: 'all businesses' };

// Dónde: regiones y provincias, con la forma en que el motor las reconoce sin confundirlas con otra cosa.
// «Duarte» sola puede ser la avenida: va como «la provincia Duarte» (en inglés, «provincia Duarte»: el motor no
// entiende «Duarte province»).
export const ZONAS_CREADOR = [
  ['gran-santo-domingo', 'region', 'el Gran Santo Domingo', 'Gran Santo Domingo'],
  ['distrito-nacional', 'provincia', 'el Distrito Nacional', 'the Distrito Nacional'],
  ['santo-domingo', 'provincia', 'la provincia Santo Domingo', 'provincia Santo Domingo'],
  ['santiago', 'provincia', 'Santiago', 'Santiago'],
  ['la-altagracia', 'provincia', 'La Altagracia', 'La Altagracia'],
  ['puerto-plata', 'provincia', 'Puerto Plata', 'Puerto Plata'],
  ['la-vega', 'provincia', 'La Vega', 'La Vega'],
  ['la-romana', 'provincia', 'La Romana', 'La Romana'],
  ['san-cristobal', 'provincia', 'San Cristóbal', 'San Cristóbal'],
  ['san-pedro-de-macoris', 'provincia', 'San Pedro de Macorís', 'San Pedro de Macorís'],
  ['duarte', 'provincia', 'la provincia Duarte', 'provincia Duarte'],
  ['espaillat', 'provincia', 'Espaillat', 'Espaillat'],
  ['peravia', 'provincia', 'Peravia', 'Peravia'],
  ['azua', 'provincia', 'Azua', 'Azua'],
  ['barahona', 'provincia', 'Barahona', 'Barahona'],
  ['monsenor-nouel', 'provincia', 'Monseñor Nouel', 'Monseñor Nouel'],
  ['sanchez-ramirez', 'provincia', 'Sánchez Ramírez', 'Sánchez Ramírez'],
  ['valverde', 'provincia', 'Valverde', 'Valverde'],
  ['maria-trinidad-sanchez', 'provincia', 'María Trinidad Sánchez', 'María Trinidad Sánchez'],
  ['samana', 'provincia', 'Samaná', 'Samaná'],
  ['hermanas-mirabal', 'provincia', 'Hermanas Mirabal', 'Hermanas Mirabal'],
  ['monte-plata', 'provincia', 'Monte Plata', 'Monte Plata'],
  ['hato-mayor', 'provincia', 'Hato Mayor', 'Hato Mayor'],
  ['el-seibo', 'provincia', 'El Seibo', 'El Seibo'],
  ['san-juan', 'provincia', 'la provincia San Juan', 'provincia San Juan'],
  ['elias-pina', 'provincia', 'Elías Piña', 'Elías Piña'],
  ['dajabon', 'provincia', 'Dajabón', 'Dajabón'],
  ['montecristi', 'provincia', 'Montecristi', 'Montecristi'],
  ['santiago-rodriguez', 'provincia', 'Santiago Rodríguez', 'Santiago Rodríguez'],
  ['bahoruco', 'provincia', 'Bahoruco', 'Bahoruco'],
  ['independencia', 'provincia', 'la provincia Independencia', 'provincia Independencia'],
  ['pedernales', 'provincia', 'Pedernales', 'Pedernales'],
  ['san-jose-de-ocoa', 'provincia', 'San José de Ocoa', 'San José de Ocoa'],
  ['cibao', 'region', 'el Cibao', 'the Cibao'],
  ['cibao-norte', 'region', 'el Cibao Norte', 'Cibao Norte'],
  ['cibao-sur', 'region', 'el Cibao Sur', 'Cibao Sur'],
  ['cibao-nordeste', 'region', 'el Cibao Nordeste', 'Cibao Nordeste'],
  ['noroeste', 'region', 'la Línea Noroeste', 'the Línea Noroeste'],
  ['este', 'region', 'la Región Este', 'the Región Este'],
  ['sur', 'region', 'la Región Sur', 'the Región Sur'],
  ['valdesia', 'region', 'la Región Valdesia', 'the Región Valdesia'],
  ['region-el-valle', 'region', 'la Región El Valle', 'the Región El Valle'],
  ['region-enriquillo', 'region', 'la Región Enriquillo', 'the Región Enriquillo'],
  ['higuamo', 'region', 'la Región Higuamo', 'the Región Higuamo'],
  ['region-yuma', 'region', 'la Región Yuma', 'the Región Yuma'],
].map(([clave, tipo, es, en]) => ({ clave, tipo, es, en }));
export const ZONAS_A_LA_VISTA = 8;
export const PAIS = { es: 'todo el país', en: 'the whole country' };

export const TAMANOS_CREADOR = { pequenas: { es: 'pequeñas', en: 'small' }, medianas: { es: 'medianas', en: 'medium' }, grandes: { es: 'grandes', en: 'large' } };
export const ORDEN_TAMANOS = ['pequenas', 'medianas', 'grandes'];

export const FRECUENCIAS_CREADOR = {
  diaria: { es: 'Revisa todos los días.', en: 'Search every day.' },
  semanal: { es: 'Revisa cada semana.', en: 'Search every week.' },
  mensual: { es: 'Revisa cada mes.', en: 'Search every month.' },
  manual: { es: 'Revisa solo cuando yo lo pida.', en: 'Search only when I ask.' },
};
export const ORDEN_FRECUENCIAS = ['diaria', 'semanal', 'mensual', 'manual'];

// Sugerencias para lo que vende (las del catálogo del motor) y para el empleo.
// Lo que vende: las claves del catálogo del motor. Se escriben con el nombre del catálogo (así se muestran en el
// idioma de quien mira), salvo las que el motor entiende mejor con otras palabras.
export const PRODUCTOS_SUGERIDOS = ['paneles-solares', 'paginas-web', 'software', 'marketing', 'seguridad', 'climatizacion', 'limpieza', 'seguros',
  'facturacion', 'inventario', 'contabilidad', 'plantas-electricas', 'agua', 'uniformes', 'capacitacion', 'consultoria', 'redes', 'automatizacion', 'reservas', 'citas'];
export const PRODUCTOS_CON_OTRAS_PALABRAS = { citas: { es: 'sistemas de citas', en: 'scheduling systems' } };
export const PUESTOS_SUGERIDOS = [
  ['chofer', 'driver'], ['cajero', 'cashier'], ['secretaria', 'secretary'], ['contador', 'accountant'], ['vendedor', 'salesperson'],
  ['recepcionista', 'receptionist'], ['mesero', 'waiter'], ['cocinero', 'cook'], ['electricista', 'electrician'], ['servicio al cliente', 'customer service'],
  ['enfermera', 'nurse'], ['guardia de seguridad', 'security guard'],
].map(([es, en]) => ({ es, en }));

const SECTOR = new Map(SECTORES_CREADOR.map(s => [s.clave, s]));
const ZONA = new Map(ZONAS_CREADOR.map(z => [z.clave, z]));
const HUECO = { es: '…', en: '…' };
export const MAXIMO_PRODUCTO = 120;
// Hasta cuántos negocios y lugares se marcan (el motor guarda hasta 30 de cada uno; más de 12 ya es «todo»).
export const MAXIMO_ELEGIDOS = 12;
// Salario mínimo para buscar empleo, en pesos (se elige tocando; vacío = no importa).
export const SALARIOS_SUGERIDOS = [15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
export const MAXIMO_SALARIO = 10_000_000;

// Lo que la persona escribió en el único campo de texto: sin espacios de más, sin punto final, sin comillas.
export function limpiarProducto(texto) {
  return String(texto ?? '').replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim().replace(/[\s.,;:!?¡¿]+$/u, '').replace(/^[\s.,;:!?¡¿]+/u, '').slice(0, MAXIMO_PRODUCTO).trim();
}

function lista(nombres, idioma) {
  if (nombres.length <= 1) return nombres.join('');
  const y = idioma === 'en' ? ' and ' : ' y ';
  return `${nombres.slice(0, -1).join(', ')}${y}${nombres[nombres.length - 1]}`;
}

// La elección, ordenada y sin nada que no exista: lo mismo que se compone y lo que se guarda como borrador.
export function normalizarEleccion(e = {}) {
  const tipo = e.tipo === 'laboral' ? 'laboral' : 'comercial';
  const sectores = Array.isArray(e.sectores) ? e.sectores : [];
  const todas = sectores.includes('todas');
  const zonas = (Array.isArray(e.zonas) ? e.zonas : []).filter(z => ZONA.has(z));
  const salario = Number(e.salarioMinimo);
  return {
    tipo,
    producto: limpiarProducto(e.producto),
    sectores: tipo === 'laboral' ? [] : todas ? ['todas'] : SECTORES_CREADOR.map(s => s.clave).filter(c => sectores.includes(c)).slice(0, MAXIMO_ELEGIDOS),
    pais: e.pais === true,
    zonas: e.pais === true ? [] : ZONAS_CREADOR.map(z => z.clave).filter(c => zonas.includes(c)).slice(0, MAXIMO_ELEGIDOS),
    tamanos: tipo === 'laboral' ? [] : ORDEN_TAMANOS.filter(x => Array.isArray(e.tamanos) && e.tamanos.includes(x)),
    frecuencia: ORDEN_FRECUENCIAS.includes(e.frecuencia) ? e.frecuencia : 'semanal',
    salarioMinimo: tipo === 'laboral' && Number.isSafeInteger(salario) && salario > 0 && salario <= MAXIMO_SALARIO ? salario : null,
  };
}

// Las claves de lo que puede faltar (la pantalla dice «empleo» en vez de «producto» cuando busca empleo) y de lo que
// no cabe en los toques: test/pantallas.test.js comprueba que cada una tiene su frase en los dos idiomas.
export const CLAVES_FALTA = ['producto', 'empleo', 'sectores', 'zonas'];
export const CLAVES_QUEDA_FUERA = ['sectores', 'zonas', 'exclusiones', 'prioridades', 'salario', 'autonomia', 'capacidades'];

// Lo que falta elegir antes de crear. La pantalla lo dice paso a paso (no deja crear algo incompleto).
export function faltaEnEleccion(e) {
  const x = normalizarEleccion(e);
  const falta = [];
  if (!x.producto) falta.push('producto');
  if (x.tipo === 'comercial' && !x.sectores.length) falta.push('sectores');
  if (!x.pais && !x.zonas.length) falta.push('zonas');
  return falta;
}

const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// La frase que se manda al motor, en el idioma de la persona (el motor entiende los dos).
// «Quiero vender paneles solares a hoteles y clínicas medianas y grandes en Santiago y La Vega. Revisa cada semana.»
// huecos: true para la vista previa mientras falta algo («Quiero vender … a … en …»); nunca se manda así.
export function componer(eleccion, idioma = 'es', { huecos = false } = {}) {
  const en = idioma === 'en';
  const x = normalizarEleccion(eleccion);
  if (huecos) {
    if (!x.producto) x.producto = '…';
    if (!x.sectores.length && x.tipo === 'comercial') x.sectores = ['…'];
    if (!x.pais && !x.zonas.length) x.zonas = ['…'];
  }
  const donde = x.pais ? (en ? PAIS.en : PAIS.es) : lista(x.zonas.map(z => (ZONA.get(z) ?? HUECO)[en ? 'en' : 'es']), idioma);
  const frecuencia = FRECUENCIAS_CREADOR[x.frecuencia][en ? 'en' : 'es'];
  // Los tres tamaños juntos es lo mismo que no decir ninguno.
  const tamanos = x.tamanos.length === ORDEN_TAMANOS.length ? [] : x.tamanos.map(t => TAMANOS_CREADOR[t][en ? 'en' : 'es']);
  if (x.tipo === 'laboral') {
    const salario = x.salarioMinimo ? (en ? `, with a salary of at least RD$${miles(x.salarioMinimo)}` : `, con un salario de al menos RD$${miles(x.salarioMinimo)}`) : '';
    return en ? `I am looking for a job as ${x.producto} in ${donde}${salario}. ${frecuencia}`
      : `Busco empleo de ${x.producto} en ${donde}${salario}. ${frecuencia}`;
  }
  const negocios = x.sectores.includes('todas') ? (en ? TODAS.en : TODAS.es) : lista(x.sectores.map(s => (SECTOR.get(s) ?? HUECO)[en ? 'en' : 'es']), idioma);
  if (en) {
    const tam = tamanos.length ? `, ${lista(tamanos, 'en')},` : '';
    return `I sell ${x.producto}. Find ${negocios}${tam} in ${donde}. ${frecuencia}`;
  }
  const tam = tamanos.length ? ` ${lista(tamanos, 'es')}` : '';
  return `Quiero vender ${x.producto} a ${negocios}${tam} en ${donde}. ${frecuencia}`;
}

// Para «Cambiar con toques» en un proyecto que ya existe: lo que se puede marcar a partir de lo que está en uso,
// y lo que NO cabe en los toques (exclusiones, prioridades, lugares escritos a mano…), para avisar antes de reemplazarlo.
// capacidadesPorDefecto: las que enciende el motor cuando no se dice nada (catalogo.combinaciones.investigar_y_preparar).
export function eleccionDesde(c = {}, productoVisible = c.producto, capacidadesPorDefecto = null) {
  const sectores = Array.isArray(c.sectores) ? c.sectores.filter(s => s === 'todas' || SECTOR.has(s)) : [];
  const zonas = Array.isArray(c.zonas) ? c.zonas.filter(z => ZONA.has(z)) : [];
  const eleccion = normalizarEleccion({
    tipo: c.tipo,
    producto: productoVisible ?? '',
    sectores,
    pais: c.paisCompleto === true,
    zonas,
    tamanos: c.tamanos,
    frecuencia: c.frecuencia,
    salarioMinimo: c.salarioMinimo,
  });
  const quedaFuera = [];
  const largo = v => (Array.isArray(v) ? v.length : 0);
  if (sectores.filter(x => x !== 'todas').length > MAXIMO_ELEGIDOS) quedaFuera.push('sectores');
  if (zonas.length > MAXIMO_ELEGIDOS) quedaFuera.push('zonas');
  if (largo(c.sectoresLibres) || (Array.isArray(c.sectores) && c.sectores.some(s => s !== 'todas' && !SECTOR.has(s)))) quedaFuera.push('sectores');
  if (largo(c.zonasLibres) || (Array.isArray(c.zonas) && c.zonas.some(z => !ZONA.has(z))) || (c.paisCompleto && largo(c.zonas))) quedaFuera.push('zonas');
  if (largo(c.exclusiones) || largo(c.sectoresExcluidos) || largo(c.zonasExcluidas)) quedaFuera.push('exclusiones');
  if (largo(c.prioridades)) quedaFuera.push('prioridades');
  if (c.tipo === 'laboral' && (c.salarioMaximo || c.moneda === 'USD' || c.experiencia)) quedaFuera.push('salario');
  if (c.autonomia && c.autonomia !== 'aprobar_salidas' && c.autonomia !== 'solo_cuando_pida') quedaFuera.push('autonomia');
  if (Array.isArray(capacidadesPorDefecto) && c.capacidades && typeof c.capacidades === 'object'
    && Object.entries(c.capacidades).some(([k, v]) => Boolean(v) !== capacidadesPorDefecto.includes(k))) quedaFuera.push('capacidades');
  return { eleccion, quedaFuera };
}
