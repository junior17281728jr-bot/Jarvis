// Lugares de República Dominicana que entiende el motor propio.
// Hay cinco clases: provincias (las 31 y el Distrito Nacional), municipios, distritos municipales que la gente
// usa mucho, sectores conocidos (barrios y zonas turísticas) y regiones (varias provincias juntas).
// Cada lugar dice a qué provincia pertenece. Las palabras van en minúsculas y sin acentos.
// Palabras «ambiguas»: nombres que también son palabras de todos los días o apellidos (Castillo, Esperanza,
// Paraíso…). Solo cuentan como lugar si van después de «en», «de», «cerca de»… o en una lista de lugares.
import { comparable } from './texto.js';

const slug = nombre => comparable(nombre.replace(/\(.*?\)/g, ' ')).replace(/ /g, '-');

// ---------- Provincias ----------
const DATOS_PROVINCIAS = [
  ['distrito-nacional', 'Distrito Nacional', ['distrito nacional', 'dn']],
  ['santo-domingo', 'Santo Domingo (provincia)', ['provincia santo domingo', 'provincia de santo domingo']],
  ['santiago', 'Santiago', ['santiago', 'stgo', 'provincia santiago', 'provincia de santiago']],
  ['la-vega', 'La Vega', ['la vega', 'provincia la vega', 'provincia de la vega']],
  ['puerto-plata', 'Puerto Plata', ['puerto plata', 'provincia puerto plata', 'provincia de puerto plata']],
  ['san-cristobal', 'San Cristóbal', ['san cristobal', 'provincia san cristobal', 'provincia de san cristobal']],
  ['la-altagracia', 'La Altagracia', ['la altagracia', 'provincia la altagracia', 'provincia de la altagracia', 'altagracia'], ['altagracia']],
  ['la-romana', 'La Romana', ['la romana', 'provincia la romana', 'provincia de la romana']],
  ['san-pedro-de-macoris', 'San Pedro de Macorís', ['san pedro de macoris', 'san pedro', 'spm', 'provincia san pedro de macoris']],
  // «Duarte» a secas casi siempre es una avenida o una calle: la provincia se nombra como «provincia Duarte».
  ['duarte', 'Duarte', ['provincia duarte', 'provincia de duarte']],
  ['espaillat', 'Espaillat', ['espaillat', 'provincia espaillat']],
  ['peravia', 'Peravia', ['peravia', 'provincia peravia']],
  ['azua', 'Azua', ['azua', 'provincia azua', 'provincia de azua']],
  ['barahona', 'Barahona', ['barahona', 'provincia barahona', 'provincia de barahona']],
  ['monsenor-nouel', 'Monseñor Nouel', ['monsenor nouel', 'provincia monsenor nouel']],
  ['sanchez-ramirez', 'Sánchez Ramírez', ['sanchez ramirez', 'provincia sanchez ramirez']],
  ['valverde', 'Valverde', ['valverde', 'provincia valverde']],
  ['maria-trinidad-sanchez', 'María Trinidad Sánchez', ['maria trinidad sanchez', 'provincia maria trinidad sanchez']],
  ['samana', 'Samaná', ['samana', 'provincia samana', 'provincia de samana']],
  ['hermanas-mirabal', 'Hermanas Mirabal', ['hermanas mirabal', 'provincia hermanas mirabal']],
  ['monte-plata', 'Monte Plata', ['monte plata', 'provincia monte plata', 'provincia de monte plata']],
  ['hato-mayor', 'Hato Mayor', ['hato mayor', 'provincia hato mayor', 'provincia de hato mayor']],
  ['el-seibo', 'El Seibo', ['el seibo', 'el seybo', 'seibo', 'provincia el seibo']],
  // «el Valle de San Juan» es San Juan, no El Valle de Hato Mayor.
  ['san-juan', 'San Juan', ['san juan', 'provincia san juan', 'provincia de san juan', 'valle de san juan', 'el valle de san juan']],
  ['elias-pina', 'Elías Piña', ['elias pina', 'provincia elias pina']],
  ['dajabon', 'Dajabón', ['dajabon', 'provincia dajabon', 'provincia de dajabon']],
  ['montecristi', 'Montecristi', ['montecristi', 'monte cristi', 'provincia montecristi']],
  ['santiago-rodriguez', 'Santiago Rodríguez', ['santiago rodriguez', 'provincia santiago rodriguez']],
  ['bahoruco', 'Bahoruco', ['bahoruco', 'baoruco', 'provincia bahoruco']],
  // «Independencia» a secas es casi siempre una avenida: igual que Duarte.
  ['independencia', 'Independencia', ['provincia independencia', 'provincia de independencia']],
  ['pedernales', 'Pedernales', ['pedernales', 'provincia pedernales', 'provincia de pedernales']],
  ['san-jose-de-ocoa', 'San José de Ocoa', ['san jose de ocoa', 'ocoa', 'provincia san jose de ocoa']],
];

export const PROVINCIAS = DATOS_PROVINCIAS.map(([clave, nombre, palabras, ambiguas = []]) => ({ clave, nombre, palabras, ambiguas }));

// ---------- Municipios: los 158 (aquí 157 seguros; ver la nota de abajo), cada uno con su provincia ----------
// Una entrada es el nombre, o [nombre, { clave, palabras, ambiguas }]. Sin «palabras», se usa el nombre.
// Cuando el municipio cabecera se llama igual que su provincia (La Romana, San Cristóbal…), el nombre a secas
// se entiende como la provincia, y el municipio se nombra «municipio de …».
// Nota: la lista se escribió de memoria (no hubo acceso a internet para compararla). Matanzas (Peravia) es
// el único municipio dudoso, y falta uno para llegar a los 158 oficiales.
const cabecera = (nombre, clave, base) => [nombre, { clave, palabras: [`municipio de ${base}`, `municipio ${base}`, `ciudad de ${base}`] }];

const DATOS_MUNICIPIOS = {
  'distrito-nacional': [['Santo Domingo de Guzmán', { palabras: ['santo domingo de guzman'] }]],
  'santo-domingo': [
    ['Santo Domingo Este', { palabras: ['santo domingo este', 'sde', 'sto dgo este', 'santo dgo este', 'zona oriental', 'sd este', 'santo domingo east', 'sd east'] }],
    ['Santo Domingo Norte', { palabras: ['santo domingo norte', 'sdn', 'sto dgo norte', 'santo dgo norte', 'sd norte', 'santo domingo north', 'sd north'] }],
    ['Santo Domingo Oeste', { palabras: ['santo domingo oeste', 'sdo', 'sto dgo oeste', 'santo dgo oeste', 'sd oeste', 'santo domingo west', 'sd west'] }],
    'Boca Chica', 'Los Alcarrizos', 'Pedro Brand',
    ['San Antonio de Guerra', { palabras: ['san antonio de guerra', 'guerra'], ambiguas: ['guerra'] }],
  ],
  azua: [
    ['Azua de Compostela', { palabras: ['azua de compostela', 'municipio de azua', 'ciudad de azua'] }],
    'Estebanía', ['Guayabal', { ambiguas: ['guayabal'] }], ['Las Charcas', { ambiguas: ['las charcas'] }],
    ['Las Yayas de Viajama', { palabras: ['las yayas de viajama', 'las yayas'] }], 'Padre Las Casas',
    ['Peralta', { ambiguas: ['peralta'] }], ['Pueblo Viejo', { ambiguas: ['pueblo viejo'] }], 'Sabana Yegua', 'Tábara Arriba',
  ],
  bahoruco: ['Neiba', ['Galván', { ambiguas: ['galvan'] }], ['Los Ríos (Bahoruco)', { palabras: ['los rios'], ambiguas: ['los rios'], homonimo: true }], ['Tamayo', { ambiguas: ['tamayo'] }], 'Villa Jaragua'],
  barahona: [
    ['Santa Cruz de Barahona', { palabras: ['santa cruz de barahona', 'municipio de barahona', 'ciudad de barahona'] }],
    ['Cabral', { ambiguas: ['cabral'] }], ['El Peñón', { ambiguas: ['el penon'] }], ['Enriquillo', { ambiguas: ['enriquillo'] }],
    ['Fundación', { ambiguas: ['fundacion'] }], 'Jaquimeyes', ['La Ciénaga (Barahona)', { palabras: ['la cienaga'], ambiguas: ['la cienaga'], homonimo: true }],
    ['Las Salinas', { ambiguas: ['las salinas'] }], ['Paraíso', { ambiguas: ['paraiso'] }], ['Polo', { ambiguas: ['polo'] }], 'Vicente Noble',
  ],
  dajabon: [
    cabecera('Dajabón (municipio)', 'dajabon-municipio', 'dajabon'),
    ['El Pino', { ambiguas: ['el pino'] }], 'Loma de Cabrera', ['Partido', { ambiguas: ['partido'] }], ['Restauración', { ambiguas: ['restauracion'] }],
  ],
  duarte: [
    ['San Francisco de Macorís', { palabras: ['san francisco de macoris', 'san francisco', 'sfm', 'san fco de macoris', 'san fco macoris', 'san fco', 'sfco'] }],
    ['Arenoso', { ambiguas: ['arenoso'] }], ['Castillo', { ambiguas: ['castillo'] }],
    ['Eugenio María de Hostos', { palabras: ['eugenio maria de hostos', 'hostos'], ambiguas: ['hostos'] }],
    'Las Guáranas', ['Pimentel', { ambiguas: ['pimentel'] }], 'Villa Riva',
  ],
  'elias-pina': [['Comendador', { ambiguas: ['comendador'] }], 'Bánica', ['El Llano', { ambiguas: ['el llano'] }], 'Hondo Valle', 'Juan Santiago', 'Pedro Santana'],
  'el-seibo': [['Santa Cruz del Seibo', { palabras: ['santa cruz del seibo', 'municipio de el seibo', 'municipio del seibo'] }], 'Miches'],
  espaillat: ['Moca', 'Cayetano Germosén', 'Gaspar Hernández', ['Jamao al Norte', { palabras: ['jamao al norte', 'jamao'] }]],
  'hato-mayor': [['Hato Mayor del Rey', { palabras: ['hato mayor del rey', 'municipio de hato mayor'] }], ['El Valle (Hato Mayor)', { palabras: ['el valle'], ambiguas: ['el valle'], homonimo: true }], 'Sabana de la Mar'],
  'hermanas-mirabal': ['Salcedo', 'Tenares', 'Villa Tapia'],
  independencia: ['Jimaní', ['Cristóbal', { ambiguas: ['cristobal'] }], 'Duvergé', ['La Descubierta', { ambiguas: ['la descubierta'] }], ['Mella', { palabras: ['municipio de mella', 'municipio mella'] }], 'Postrer Río'],
  'la-altagracia': [
    ['Higüey', { palabras: ['higuey', 'salvaleon de higuey'] }],
    ['San Rafael del Yuma', { palabras: ['san rafael del yuma', 'yuma'], ambiguas: ['yuma'] }],
  ],
  'la-romana': [cabecera('La Romana (municipio)', 'la-romana-municipio', 'la romana'), 'Guaymate', ['Villa Hermosa', { ambiguas: ['villa hermosa'] }]],
  'la-vega': [
    ['Concepción de La Vega', { palabras: ['concepcion de la vega', 'ciudad de la vega', 'municipio de la vega'] }],
    ['Constanza', { ambiguas: ['constanza'] }], 'Jarabacoa', 'Jima Abajo',
  ],
  'maria-trinidad-sanchez': ['Nagua', ['Cabrera', { ambiguas: ['cabrera'] }], ['El Factor', { ambiguas: ['el factor'] }], 'Río San Juan'],
  'monsenor-nouel': ['Bonao', ['Maimón', { ambiguas: ['maimon'] }], ['Piedra Blanca', { ambiguas: ['piedra blanca'] }]],
  montecristi: [
    ['San Fernando de Monte Cristi', { palabras: ['san fernando de monte cristi', 'san fernando de montecristi', 'municipio de montecristi'] }],
    ['Castañuelas', { ambiguas: ['castanuelas'] }], 'Guayubín',
    ['Las Matas de Santa Cruz', { palabras: ['las matas de santa cruz', 'las matas'], ambiguas: ['las matas'], homonimo: true }], 'Pepillo Salcedo', 'Villa Vásquez',
  ],
  'monte-plata': [cabecera('Monte Plata (municipio)', 'monte-plata-municipio', 'monte plata'), 'Bayaguana', 'Peralvillo', 'Sabana Grande de Boyá', 'Yamasá'],
  pedernales: [cabecera('Pedernales (municipio)', 'pedernales-municipio', 'pedernales'), ['Oviedo', { ambiguas: ['oviedo'] }]],
  peravia: [['Baní', { palabras: ['bani'] }], 'Nizao', ['Matanzas', { ambiguas: ['matanzas'] }]],
  'puerto-plata': [
    ['San Felipe de Puerto Plata', { palabras: ['san felipe de puerto plata', 'ciudad de puerto plata', 'municipio de puerto plata'] }],
    ['Altamira', { ambiguas: ['altamira'] }], 'Guananico', ['Imbert', { ambiguas: ['imbert'] }], ['Los Hidalgos', { ambiguas: ['los hidalgos'] }],
    ['Luperón', { palabras: ['municipio de luperon', 'municipio luperon'] }], 'Sosúa', 'Villa Isabela', ['Villa Montellano', { palabras: ['villa montellano', 'montellano'] }],
  ],
  samana: [['Santa Bárbara de Samaná', { palabras: ['santa barbara de samana', 'municipio de samana', 'ciudad de samana'] }], 'Las Terrenas', ['Sánchez', { ambiguas: ['sanchez'] }]],
  'san-cristobal': [
    cabecera('San Cristóbal (municipio)', 'san-cristobal-municipio', 'san cristobal'),
    ['Bajos de Haina', { clave: 'haina', palabras: ['bajos de haina', 'haina'] }],
    ['Cambita Garabitos', { palabras: ['cambita garabitos', 'cambita'] }], ['Los Cacaos', { ambiguas: ['los cacaos'] }],
    ['Sabana Grande de Palenque', { palabras: ['sabana grande de palenque', 'palenque'], ambiguas: ['palenque'] }],
    ['San Gregorio de Nigua', { palabras: ['san gregorio de nigua', 'nigua'] }], 'Villa Altagracia', 'Yaguate',
  ],
  'san-jose-de-ocoa': [
    cabecera('San José de Ocoa (municipio)', 'san-jose-de-ocoa-municipio', 'san jose de ocoa'),
    ['Rancho Arriba', { ambiguas: ['rancho arriba'] }], ['Sabana Larga', { ambiguas: ['sabana larga'] }],
  ],
  'san-juan': ['San Juan de la Maguana', 'Bohechío', ['El Cercado', { ambiguas: ['el cercado'] }], 'Juan de Herrera',
    ['Las Matas de Farfán', { palabras: ['las matas de farfan', 'las matas'], ambiguas: ['las matas'], homonimo: true }], 'Vallejuelo'],
  'san-pedro-de-macoris': [
    cabecera('San Pedro de Macorís (municipio)', 'san-pedro-de-macoris-municipio', 'san pedro de macoris'),
    ['Consuelo', { ambiguas: ['consuelo'] }], ['Guayacanes', { ambiguas: ['guayacanes'] }], ['Quisqueya (San Pedro de Macorís)', { palabras: ['quisqueya'], ambiguas: ['quisqueya'], homonimo: true }], 'Ramón Santana',
    ['San José de Los Llanos', { palabras: ['san jose de los llanos', 'los llanos'], ambiguas: ['los llanos'] }],
  ],
  'sanchez-ramirez': ['Cotuí', 'Cevicos', 'Fantino', ['La Mata', { ambiguas: ['la mata'] }]],
  santiago: [
    ['Santiago de los Caballeros', { palabras: ['santiago de los caballeros', 'stgo de los caballeros'] }],
    ['Villa Bisonó (Navarrete)', { clave: 'bisono', palabras: ['villa bisono', 'bisono', 'navarrete'] }],
    'Jánico', ['Licey al Medio', { palabras: ['licey al medio', 'licey'], ambiguas: ['licey'] }], ['Puñal', { ambiguas: ['punal'] }],
    'Sabana Iglesia', 'San José de las Matas', 'Tamboril', 'Villa González', 'Baitoa',
  ],
  'santiago-rodriguez': [['San Ignacio de Sabaneta', { palabras: ['san ignacio de sabaneta', 'sabaneta'] }], 'Monción', ['Villa Los Almácigos', { palabras: ['villa los almacigos', 'los almacigos'] }]],
  valverde: ['Mao', ['Esperanza', { ambiguas: ['esperanza'] }], 'Laguna Salada'],
};

function armar(lista, extra) {
  return lista.map(entrada => {
    const [nombre, opciones = {}] = Array.isArray(entrada) ? entrada : [entrada];
    const palabras = opciones.palabras || [comparable(nombre)];
    return { clave: opciones.clave || slug(nombre), nombre, palabras, ambiguas: opciones.ambiguas || [], homonimo: Boolean(opciones.homonimo), ...extra };
  });
}

export const MUNICIPIOS = Object.entries(DATOS_MUNICIPIOS).flatMap(([provincia, lista]) => armar(lista, { provincia }));
const PROVINCIA_DE_MUNICIPIO = new Map(MUNICIPIOS.map(m => [m.clave, m.provincia]));

// ---------- Distritos municipales que la gente usa mucho ----------
// [nombre, municipio, opciones]. Revisados de memoria: los marcados «dudoso» conviene confirmarlos.
const DATOS_DISTRITOS = [
  ['Verón-Punta Cana (Bávaro)', 'higuey', { clave: 'punta-cana', palabras: ['veron punta cana', 'veron', 'punta cana', 'bavaro', 'cap cana', 'cabeza de toro', 'el cortecito', 'los corales', 'friusa'] }],
  ['La Otra Banda', 'higuey', { ambiguas: ['la otra banda'] }],
  ['Las Lagunas de Nisibón', 'higuey', { palabras: ['las lagunas de nisibon', 'nisibon'] }], // dudoso
  ['Bayahíbe', 'san-rafael-del-yuma', { clave: 'bayahibe', palabras: ['bayahibe', 'dominicus'] }],
  ['Boca de Yuma', 'san-rafael-del-yuma'],
  ['Cabarete', 'sosua'],
  ['Sabaneta de Yásica', 'sosua'],
  ['Las Galeras', 'santa-barbara-de-samana'],
  ['La Victoria', 'santo-domingo-norte', { ambiguas: ['la victoria'] }],
  ['San Luis', 'santo-domingo-este', { ambiguas: ['san luis'] }],
  ['La Caleta', 'boca-chica', { ambiguas: ['la caleta'] }],
  ['Palmarejo-Villa Linda', 'los-alcarrizos', { palabras: ['palmarejo villa linda', 'palmarejo', 'villa linda'] }],
  ['Pantoja', 'los-alcarrizos', { ambiguas: ['pantoja'] }],
  ['La Cuaba', 'pedro-brand'],
  ['La Guáyiga', 'pedro-brand'],
  ['Hato Viejo', 'san-antonio-de-guerra', { ambiguas: ['hato viejo'] }],
  ['Pedro García', 'santiago-de-los-caballeros', { ambiguas: ['pedro garcia'] }],
  ['La Canela', 'santiago-de-los-caballeros', { ambiguas: ['la canela'] }],
  ['San Francisco de Jacagua', 'santiago-de-los-caballeros', { palabras: ['san francisco de jacagua', 'jacagua'] }],
  ['Hato del Yaque', 'santiago-de-los-caballeros'],
  ['Canca La Reina', 'tamboril'], // dudoso
  ['Las Palomas', 'licey-al-medio', { ambiguas: ['las palomas'] }], // dudoso
  ['José Contreras', 'moca', { ambiguas: ['jose contreras'] }],
  ['San Víctor', 'moca', { ambiguas: ['san victor'] }],
  ['Juan López', 'moca', { ambiguas: ['juan lopez'] }],
  ['Manabao', 'jarabacoa'],
  ['Tireo', 'constanza'],
  ['El Carril', 'haina', { ambiguas: ['el carril'] }],
  ['Paya', 'bani', { ambiguas: ['paya'] }],
  ['Villa Sombrero', 'bani'],
  ['Villa Fundación', 'bani'], // dudoso
  ['Sabana Buey', 'bani'], // dudoso
];

// ---------- Sectores conocidos: barrios y zonas turísticas ----------
const DATOS_SECTORES = [
  ['Zona Colonial', 'santo-domingo-de-guzman', { palabras: ['zona colonial', 'ciudad colonial'] }],
  ['Naco', 'santo-domingo-de-guzman', { palabras: ['naco', 'ensanche naco'] }],
  ['Piantini', 'santo-domingo-de-guzman', { palabras: ['piantini', 'ensanche piantini'] }],
  ['Gazcue', 'santo-domingo-de-guzman'],
  ['Bella Vista (Distrito Nacional)', 'santo-domingo-de-guzman', { palabras: ['bella vista'], ambiguas: ['bella vista'], homonimo: true }],
  ['Los Prados', 'santo-domingo-de-guzman', { ambiguas: ['los prados'] }],
  ['Arroyo Hondo', 'santo-domingo-de-guzman'],
  ['Evaristo Morales', 'santo-domingo-de-guzman'],
  ['Serrallés', 'santo-domingo-de-guzman'],
  ['Mirador Sur', 'santo-domingo-de-guzman'],
  ['Ciudad Nueva', 'santo-domingo-de-guzman', { ambiguas: ['ciudad nueva'] }],
  ['Villa Juana', 'santo-domingo-de-guzman'],
  ['Villa Consuelo', 'santo-domingo-de-guzman'],
  ['Villa Francisca', 'santo-domingo-de-guzman'],
  ['Villas Agrícolas', 'santo-domingo-de-guzman', { palabras: ['villas agricolas', 'villa agricolas'] }],
  ['Cristo Rey', 'santo-domingo-de-guzman', { ambiguas: ['cristo rey'] }],
  ['Los Cacicazgos', 'santo-domingo-de-guzman'],
  ['La Esperilla', 'santo-domingo-de-guzman'],
  ['Ensanche Quisqueya', 'santo-domingo-de-guzman'],
  ['Los Mina', 'santo-domingo-este'],
  ['Villa Duarte', 'santo-domingo-este'],
  ['Alma Rosa', 'santo-domingo-este'],
  ['Ensanche Ozama', 'santo-domingo-este'],
  ['San Isidro', 'santo-domingo-este', { ambiguas: ['san isidro'] }],
  ['Invivienda', 'santo-domingo-este'],
  ['Herrera', 'santo-domingo-oeste', { ambiguas: ['herrera'] }],
  ['Las Caobas', 'santo-domingo-oeste', { ambiguas: ['las caobas'] }],
  ['Manoguayabo', 'santo-domingo-oeste'],
  ['Villa Mella', 'santo-domingo-norte'],
  ['Sabana Perdida', 'santo-domingo-norte'],
  ['Guaricano', 'santo-domingo-norte', { palabras: ['guaricano', 'los guaricanos'] }],
  ['Cienfuegos', 'santiago-de-los-caballeros', { ambiguas: ['cienfuegos'] }],
  ['Gurabo', 'santiago-de-los-caballeros', { palabras: ['gurabo', 'cerros de gurabo'] }],
  ['Villa Olga', 'santiago-de-los-caballeros'],
  ['Los Pepines', 'santiago-de-los-caballeros'],
  ['Uvero Alto', 'higuey'], // dudoso: está en Higüey, falta confirmar el distrito
  ['Casa de Campo', 'la-romana-municipio'],
  ['Altos de Chavón', 'la-romana-municipio', { palabras: ['altos de chavon', 'chavon'] }],
  ['Playa Dorada', 'san-felipe-de-puerto-plata'],
  ['Costambar', 'san-felipe-de-puerto-plata'],
  ['Juan Dolio', 'guayacanes', { clave: 'juan-dolio' }], // dudoso: municipio Guayacanes
];

function armarDentro(lista, tipo) {
  return lista.map(([nombre, municipio, opciones = {}]) => ({
    clave: opciones.clave || slug(nombre),
    nombre,
    palabras: opciones.palabras || [comparable(nombre)],
    ambiguas: opciones.ambiguas || [],
    homonimo: Boolean(opciones.homonimo),
    municipio,
    provincia: PROVINCIA_DE_MUNICIPIO.get(municipio),
    tipo,
  }));
}

export const DISTRITOS = armarDentro(DATOS_DISTRITOS, 'distrito');
export const SECTORES_DE_CIUDAD = armarDentro(DATOS_SECTORES, 'lugar');

// ---------- Regiones: nombres que la gente usa para varias provincias juntas ----------
const CIBAO_NORTE = ['santiago', 'puerto-plata', 'espaillat'];
const CIBAO_SUR = ['la-vega', 'monsenor-nouel', 'sanchez-ramirez'];
const CIBAO_NORDESTE = ['duarte', 'maria-trinidad-sanchez', 'hermanas-mirabal', 'samana'];
const CIBAO_NOROESTE = ['valverde', 'montecristi', 'dajabon', 'santiago-rodriguez'];
const VALDESIA = ['san-cristobal', 'peravia', 'azua', 'san-jose-de-ocoa'];
const EL_VALLE = ['san-juan', 'elias-pina'];
const ENRIQUILLO = ['barahona', 'bahoruco', 'independencia', 'pedernales'];
const HIGUAMO = ['san-pedro-de-macoris', 'hato-mayor', 'monte-plata'];
const YUMA = ['la-altagracia', 'la-romana', 'el-seibo'];

// Palabras de región que solo dicen un punto cardinal: «el norte de Santiago» es una parte de Santiago, no el Cibao.
export const CARDINALES = ['el norte', 'del norte', 'el sur', 'del sur', 'zona sur', 'la zona sur', 'el este', 'del este', 'zona este', 'zona del este',
  'nordeste', 'noroeste'];

export const REGIONES = [
  // «Santo Domingo» a secas casi siempre quiere decir la capital y sus alrededores. «Capital» solo cuenta como «la capital».
  { clave: 'gran-santo-domingo', nombre: 'Gran Santo Domingo', provincias: ['distrito-nacional', 'santo-domingo'], palabras: ['gran santo domingo', 'santo domingo', 'la capital', 'the capital', 'sto dgo', 'santo dgo', 'sto domingo', 'sd'] },
  { clave: 'cibao', nombre: 'Cibao (región Norte)', provincias: [...CIBAO_NORTE, ...CIBAO_SUR, ...CIBAO_NORDESTE, ...CIBAO_NOROESTE], palabras: ['cibao', 'region del cibao', 'region cibao', 'region norte', 'el norte', 'del norte', 'norte del pais'] },
  { clave: 'cibao-norte', nombre: 'Cibao Norte', provincias: CIBAO_NORTE, palabras: ['cibao norte'] },
  { clave: 'cibao-sur', nombre: 'Cibao Sur', provincias: CIBAO_SUR, palabras: ['cibao sur'] },
  { clave: 'cibao-nordeste', nombre: 'Cibao Nordeste', provincias: CIBAO_NORDESTE, palabras: ['cibao nordeste', 'nordeste', 'region nordeste'] },
  { clave: 'noroeste', nombre: 'Línea Noroeste', provincias: CIBAO_NOROESTE, palabras: ['linea noroeste', 'noroeste', 'region noroeste', 'cibao noroeste'] },
  { clave: 'sur', nombre: 'Región Sur', provincias: [...VALDESIA, ...EL_VALLE, ...ENRIQUILLO], palabras: ['region sur', 'el sur', 'del sur', 'zona sur', 'sur del pais'] },
  { clave: 'valdesia', nombre: 'Región Valdesia', provincias: VALDESIA, palabras: ['valdesia', 'region valdesia'] },
  { clave: 'region-el-valle', nombre: 'Región El Valle', provincias: EL_VALLE, palabras: ['region el valle', 'region del valle'] },
  { clave: 'region-enriquillo', nombre: 'Región Enriquillo', provincias: ENRIQUILLO, palabras: ['region enriquillo'] },
  { clave: 'este', nombre: 'Región Este', provincias: [...HIGUAMO, ...YUMA], palabras: ['region este', 'el este', 'del este', 'zona este', 'este del pais', 'zona del este'] },
  { clave: 'higuamo', nombre: 'Región Higuamo', provincias: HIGUAMO, palabras: ['higuamo', 'region higuamo'] },
  { clave: 'region-yuma', nombre: 'Región Yuma', provincias: YUMA, palabras: ['region yuma'] },
];

// Lugares que no son exactos («el interior», «la costa norte»): se preguntan, con una sugerencia si la hay.
export const DIFUSOS = [
  { palabras: ['el interior', 'el interior del pais', 'interior del pais', 'the interior', 'the interior of the country'], sugerencias: [] },
  { palabras: ['costa norte', 'la costa norte', 'north coast', 'the north coast'], sugerencias: ['puerto-plata'] },
  { palabras: ['costa sur', 'la costa sur', 'south coast', 'the south coast'], sugerencias: [] },
  // «la frontera con Haití»: cinco provincias tocan la frontera. Se pregunta cuáles.
  { palabras: ['la frontera', 'frontera con haiti', 'la frontera con haiti', 'zona fronteriza', 'la zona fronteriza', 'linea fronteriza', 'la linea fronteriza',
    'the border', 'the border with haiti', 'border with haiti'], sugerencias: [] },
  // «Sabana Grande» a secas puede ser Sabana Grande de Boyá (Monte Plata) o Sabana Grande de Palenque (San Cristóbal). No es un tamaño.
  { palabras: ['sabana grande'], sugerencias: ['sabana-grande-de-boya', 'sabana-grande-de-palenque'] },
];

// Frases que dicen «todo el país» sin dudas.
export const PAIS_EXPLICITO = ['todo el pais', 'en todo el pais', 'a nivel nacional', 'nivel nacional', 'todo rd', 'toda rd', 'toda la republica',
  'toda la republica dominicana', 'todo el territorio', 'todo el territorio nacional', 'cualquier parte del pais', 'cualquier provincia',
  'todas las provincias', 'nationwide', 'the whole country', 'across the country', 'all over the country', 'all of the dominican republic',
  'all over the dominican republic', 'all over the dr', 'all over dr', 'anywhere in the country', 'anywhere in the dominican republic', 'anywhere in the dr',
  'everywhere in the country', 'por todo el pais'];
// El nombre del país: si va solo, es todo el país; si va junto a una ciudad («Santiago, RD»), solo dice el país.
export const PAIS_NOMBRE = ['republica dominicana', 'rd', 'dominican republic', 'the dominican republic', 'pais', 'nuestro pais', 'quisqueya', 'the country',
  'dr', 'the dr'];

// Lugares fuera del país: por ahora OPORTIA solo busca dentro de República Dominicana.
export const EXTRANJEROS = ['estados unidos', 'eeuu', 'ee uu', 'usa', 'united states', 'nueva york', 'new york', 'nueva jersey', 'new jersey', 'miami',
  'florida', 'boston', 'puerto rico', 'haiti', 'espana', 'spain', 'madrid', 'barcelona', 'europa', 'europe', 'canada', 'mexico', 'panama',
  'colombia', 'venezuela', 'cuba', 'italia', 'italy', 'francia', 'france', 'paris', 'alemania', 'germany', 'suiza', 'chile', 'argentina',
  'peru', 'costa rica', 'curazao', 'aruba', 'ecuador', 'california', 'texas', 'orlando', 'chicago', 'filadelfia', 'philadelphia', 'connecticut',
  'massachusetts', 'pennsylvania', 'rhode island', 'bolivia', 'uruguay', 'paraguay', 'guatemala', 'honduras', 'el salvador', 'nicaragua', 'brasil',
  'brazil', 'portugal', 'inglaterra', 'england', 'londres', 'london', 'china', 'japon', 'japan', 'santiago de chile', 'santiago de cuba',
  'santiago de compostela', 'san juan de puerto rico', 'el extranjero', 'en el extranjero', 'el exterior', 'fuera del pais', 'otro pais', 'otros paises', 'abroad', 'overseas'];
