// Lectura de las instrucciones, parte por parte, sin IA.
// El texto se parte en palabras (tokens). Luego se recorre de izquierda a derecha buscando «disparadores»:
// palabras que abren una parte con un papel claro. Por ejemplo:
//   «vendo X»              → X es lo que se vende (nunca a quién se busca)
//   «a / para Y»           → Y es a quién se busca
//   «en Z»                 → Z es dónde
//   «excepto / pero no / ni / que no sea…» → lo que se excluye
//   «prioriza / sobre todo / que tengan…»  → preferencias (no filtros)
//   «busco trabajo de T»   → T es el empleo
// Lo que ninguna parte usa y tiene palabras con sentido se guarda como duda: el motor pregunta, no adivina.
import {
  SECTORES, PRODUCTOS, TAMANOS, TAMANOS_QUE_SON_EMPRESA, ZONAS, CALLES, PAIS_EXPLICITO, PAIS_NOMBRE, EXTRANJEROS, FRECUENCIAS,
  FRECUENCIAS_NO_DISPONIBLES, DIAS_DE_LA_SEMANA, VERBOS_DE_REVISAR, CAPACIDADES, VERBOS_DE_PEDIR, VERBOS_DE_ENVIAR, SOLO_INVESTIGAR,
  SENALES_LABORAL_FUERTES, SENALES_COMERCIAL_FUERTES, SENALES_LABORAL_DEBILES, SENALES_COMERCIAL_DEBILES, OBJETIVOS_NO_DISPONIBLES,
  FUENTES_CON_NOMBRE,
} from './diccionarios.js';
import { tokenizar, crearIndice, buscarEn, comparable, distancia, todoEnMayusculas } from './texto.js';
import { salarioEn, esTelefono, finDeTelefono, PALABRAS_SALARIO, UNIDADES } from './salario.js';

// ---------- Índices (se arman una sola vez al cargar) ----------
const indice = (lista, dato = {}) => crearIndice(lista.map(frase => ({ frase, dato: { ...dato, frase } })));
const indicePorClave = pares => crearIndice(pares.flatMap(([dato, frases]) => frases.map(frase => ({ frase, dato: { ...dato, frase } }))));

const GENERALES_EXTRA = ['todo el que', 'todos los que', 'cualquiera que', 'cualquier persona', 'anyone', 'everyone', 'empresarial', 'empresariales', 'corporativo', 'corporativos'];

const ENTIDADES = crearIndice([
  ...SECTORES.flatMap(s => s.palabras.map(frase => ({
    frase, plural: true,
    // En un sector que junta varias cosas («Bancos, financieras y cooperativas»), cada palabra es solo una parte.
    dato: { que: 'sector', clave: s.clave, general: Boolean(s.general), parcial: (s.parciales || []).includes(frase) || (!s.general && /,| y | e /.test(s.es)), todos: Boolean(s.general) && /tipo|cualquier|todos|todas|any|all/.test(frase) },
  }))),
  ...GENERALES_EXTRA.map(frase => ({ frase, dato: { que: 'sector', clave: 'todas', general: true, parcial: false, todos: !/empresarial|corporativo/.test(frase) } })),
  ...TAMANOS.flatMap(t => t.palabras.map(frase => ({ frase, plural: true, dato: { que: 'tamano', clave: t.clave, empresa: TAMANOS_QUE_SON_EMPRESA.includes(frase) } }))),
  ...PRODUCTOS.flatMap(p => p.palabras.map(frase => ({ frase, plural: true, dato: { que: 'producto', clave: p.clave } }))),
  ...CAPACIDADES.flatMap(c => c.cosas.map(frase => ({ frase, plural: true, dato: { que: 'capcosa', clave: c.clave } }))),
  ...ZONAS.flatMap(z => z.palabras.map(frase => ({ frase, dato: { que: 'zona', clave: z.clave, tipo: z.tipo, ambigua: (z.ambiguas || []).includes(frase) } }))),
  ...PAIS_EXPLICITO.map(frase => ({ frase, dato: { que: 'pais', explicito: true } })),
  ...PAIS_NOMBRE.map(frase => ({ frase, dato: { que: 'pais', explicito: false } })),
  ...EXTRANJEROS.map(frase => ({ frase, dato: { que: 'extranjero' } })),
  ...CALLES.map(c => ({ frase: c.frase, dato: { que: 'calle', provincia: c.provincia } })),
  ...FUENTES_CON_NOMBRE.map(frase => ({ frase, dato: { que: 'fuente' } })),
]);

const EXPERIENCIA = indice(['sin experiencia', 'sin experiencia obligatoria', 'sin experiencia requerida', 'sin experiencia previa', 'sin necesidad de experiencia',
  'sin mucha experiencia', 'no requiere experiencia', 'no se requiere experiencia', 'que no pidan experiencia', 'que no exijan experiencia',
  'que no requieran experiencia', 'no tengo experiencia', 'experiencia no obligatoria', 'experiencia no requerida', 'without experience',
  'without required experience', 'without prior experience', 'no experience', 'no experience required', 'no experience needed', 'no prior experience',
  'i have no experience', 'experience not required']);
const OBJETIVOS = crearIndice(OBJETIVOS_NO_DISPONIBLES.flatMap(o => o.palabras.map(frase => ({ frase, dato: { clave: o.clave } }))));
const SOLO = indice(SOLO_INVESTIGAR);
const CICLO = indice(['ciclo completo', 'el ciclo completo', 'todo el ciclo', 'full cycle', 'the full cycle', 'hazlo todo', 'haz todo']);
const NADIE = indice(['sin enviar nada', 'no envies nada', 'no mandes nada', 'sin mandar nada', 'no contactes a nadie', 'sin contactar a nadie',
  'no contactar a nadie', 'no le escribas a nadie', 'no llames a nadie', 'dont send anything', 'do not send anything', 'dont contact anyone',
  'do not contact anyone', 'dont contact anybody']);
const CAP_VERBOS = crearIndice(CAPACIDADES.flatMap(c => c.verbos.map(frase => ({ frase, dato: { clave: c.clave } }))));
const PEDIR = indice(VERBOS_DE_PEDIR);
const ENVIAR = new Set(VERBOS_DE_ENVIAR);
const NEG_CAP = indice(['no', 'ni', 'sin', 'nunca', 'jamas', 'dont', 'do not', 'never', 'not', 'no me', 'no los', 'no las', 'no les', 'no le', 'no lo', 'no la',
  'ni los', 'ni las', 'ni les', 'sin que', 'y no', 'pero no', 'todavia no', 'aun no', 'no quiero', 'no quiero que', 'no necesito', 'no hace falta',
  'dont want', 'do not want', 'no hagas', 'no prepares', 'no envies', 'no mandes', 'no escribas', 'sin preparar', 'sin enviar', 'sin mandar',
  'sin hacer', 'no hacer', 'no enviar', 'no preparar', 'dont send', 'do not send', 'dont prepare', 'dont write', 'do not contact', 'no contactar']);
const PEQUENAS = new Set(['me', 'nos', 'les', 'le', 'los', 'las', 'lo', 'la', 'el', 'un', 'una', 'unos', 'unas', 'mis', 'mi', 'sus', 'tambien', 'buenas',
  'buenos', 'them', 'any', 'the', 'a', 'an', 'some', 'my', 'tampoco', 'todavia', 'aun', 'yet', 'ya', 'personalizadas', 'personalizados', 'y']);

const FREC_FRASES = crearIndice([
  ...FRECUENCIAS.flatMap(f => f.palabras.map(frase => ({ frase, dato: { clave: f.clave } }))),
  ...FRECUENCIAS_NO_DISPONIBLES.map(frase => ({ frase, dato: { nd: true } })),
  ...DIAS_DE_LA_SEMANA.flatMap(d => [`cada ${d}`, `todos los ${d}`, `every ${d}`, `los ${d}`].map(frase => ({ frase, dato: { clave: 'semanal', dia: true } }))),
]);
const FREC_ADV = crearIndice(FRECUENCIAS.flatMap(f => f.adverbios.map(frase => ({ frase, dato: { clave: f.clave } }))));
const VERBOS_REVISAR = new Set(VERBOS_DE_REVISAR);

const EXCLUIR = crearIndice([
  ...['excepto', 'exceptuando', 'salvo', 'no quiero', 'no deseo', 'no me interesa', 'no me interesan', 'no me gusta', 'no me gustan', 'no incluyas',
    'no incluir', 'no busques', 'no buscar', 'que no sea', 'que no sean', 'que no son', 'que no es', 'que no esten', 'que no este', 'que no estan',
    'sin incluir', 'sin contar', 'nada de', 'fuera de', 'excluye', 'excluyendo', 'excluir', 'excluyan', 'evita', 'evitar', 'evitando', 'quitando',
    'tampoco', 'except', 'excepting', 'excluding', 'exclude', 'not including', 'other than', 'dont want', 'do not want', 'dont include', 'avoid',
    'except for', 'apart from', 'menos en', 'menos a', 'menos los', 'menos las', 'menos el', 'menos la'].map(frase => ({ frase, dato: { frase } })),
  { frase: 'menos', dato: { frase: 'menos', menos: true } },
  // «a menos que sean pequeños», «unless»: excluye lo que sigue; si lo que sigue no se entiende, se pregunta.
  ...['a menos que', 'unless', 'excepto si', 'salvo que', 'excepto que'].map(frase => ({ frase, dato: { frase, condicional: true } })),
  ...['no', 'ni', 'y no', 'pero no', 'not', 'but not', 'and not', 'nor', 'no to', 'not to', 'not in'].map(frase => ({ frase, dato: { frase, generico: true } })),
]);
const INICIO_DE_EXCLUSION = new Set(['a', 'al', 'en', 'de', 'del', 'para', 'los', 'las', 'el', 'la', 'un', 'una', 'to', 'in', 'at', 'the', 'any', 'sea', 'sean',
  'es', 'son', 'este', 'esten', 'trabajar', 'trabajo', 'vender', 'venderle', 'venderles', 'con', 'for']);
const PRIORIDAD = indice(['prioriza', 'priorizar', 'prioriza a', 'priorizame', 'dale prioridad a', 'da prioridad a', 'dar prioridad a', 'prioridad a', 'prioridad para',
  'con prioridad a', 'preferiblemente', 'preferentemente', 'de preferencia', 'sobre todo', 'especialmente', 'en especial', 'prefiero', 'preferimos',
  'mejor si', 'idealmente', 'principalmente', 'en particular', 'prioritize', 'prioritise', 'especially', 'preferably', 'ideally', 'mainly', 'above all',
  'mostly', 'in particular']);
const CONDICION = indicePorClave([
  [{ clave: 'tener' }, ['que tengan', 'que tenga', 'que tienen', 'que tiene', 'que no tengan', 'que no tenga', 'que no tienen', 'que no tiene', 'que hayan',
    'que haya', 'que cuenten con', 'que cuente con', 'que manejen', 'que usen', 'que utilicen', 'que facturen', 'que vendan', 'que ofrezcan',
    'que trabajen con', 'que quieran', 'que busquen', 'que esten buscando', 'que esten abriendo', 'que estan abriendo', 'que abran',
    'solo los que', 'solo las que', 'solamente los que', 'solamente las que', 'solo aquellos que', 'solo aquellas que', 'that have', 'that has',
    'that dont have', 'that do not have', 'that use', 'only those that', 'only ones that', 'with more than', 'with at least', 'with less than']],
  [{ clave: 'sean' }, ['que sean', 'que sea', 'que son', 'that are']],
  [{ clave: 'con' }, ['con', 'with']],
  [{ clave: 'laboral', corta: true }, ['remoto', 'remota', 'a distancia', 'desde casa', 'desde mi casa', 'medio tiempo', 'de medio tiempo', 'tiempo completo',
    'a tiempo completo', 'tiempo parcial', 'part time', 'full time', 'remote', 'from home', 'presencial', 'bilingue', 'bilingual', 'fines de semana',
    'los fines de semana', 'weekends', 'de noche', 'de dia', 'nocturno', 'diurno', 'con propinas', 'seguro medico', 'con seguro medico', 'con beneficios',
    'con vehiculo propio', 'con carro propio', 'con moto propia']],
  [{ clave: 'laboral' }, ['con licencia', 'turno', 'turnos', 'horario', 'jornada', 'tengo experiencia', 'tengo mucha experiencia', 'con experiencia', 'with experience', 'i have experience']],
]);
const SIN = indice(['sin', 'without']);
// «menos de 1 hora de viaje», «más de 20 empleados»: una condición, no un salario.
const CANTIDAD = indice(['menos de', 'mas de', 'a menos de', 'no mas de', 'maximo', 'como maximo', 'hasta', 'al menos', 'por lo menos', 'minimo',
  'como minimo', 'more than', 'less than', 'at least', 'up to', 'within', 'under', 'over']);
const PUESTO = indicePorClave([
  [{}, ['trabajo de', 'trabajo como', 'trabajos de', 'empleo de', 'empleo como', 'empleos de', 'empleos como', 'puesto de', 'puestos de', 'vacante de',
    'vacantes de', 'trabajar de', 'trabajar como', 'chiripa de', 'chiripas de', 'chance de', 'plaza de', 'cargo de', 'job as', 'jobs as', 'work as',
    'working as', 'position as', 'job as a', 'job as an', 'work as a', 'work as an', 'a job as', 'a job as a', 'a job as an', 'trabajando de',
    'trabajando como']],
  [{ desnudo: true }, ['empleo', 'empleos', 'trabajo', 'puesto', 'cargo', 'job', 'position']],
]);
const PRODUCTO = indice(['vendo', 'vende', 'vendemos', 'venden', 'ofrezco', 'ofrecemos', 'ofrece', 'ofrecen', 'brindo', 'brindamos', 'distribuyo',
  'distribuimos', 'instalo', 'instalamos', 'fabrico', 'fabricamos', 'doy servicio de', 'doy servicios de', 'damos servicio de', 'damos servicios de',
  'quiero vender', 'queremos vender', 'que necesiten', 'que necesitan', 'que puedan necesitar', 'puedan necesitar', 'que podrian necesitar',
  'que quieran comprar', 'i sell', 'we sell', 'sell', 'sells', 'selling', 'i offer', 'we offer', 'offer', 'offers', 'that need', 'that may need',
  'who need', 'that might need', 'which need', 'clientes para', 'customers for', 'clients for', 'buyers for', 'compradores para', 'me dedico a vender',
  'nos dedicamos a vender', 'me dedico a la venta de', 'nos dedicamos a la venta de', 'trabajo vendiendo', 'vendiendo', 'soy distribuidor de',
  'soy distribuidora de', 'somos distribuidores de', 'distribuidor de', 'distribuidora de']);
const PROPIO = indice(['tengo un', 'tengo una', 'tenemos un', 'tenemos una', 'soy dueno de un', 'soy dueno de una', 'soy duena de un', 'soy duena de una',
  'mi', 'nuestro', 'nuestra', 'my', 'our', 'i have a', 'i own a', 'i run a', 'we have a', 'we run a', 'tengo mi', 'tengo mi propio', 'tengo mi propia']);
const CERCA = indice(['cerca de', 'cerca del', 'cerquita de', 'cerquita del', 'alrededor de', 'alrededor del', 'por la zona de', 'por los alrededores de', 'near', 'close to', 'around']);
const DIRECCION = indice(['avenida', 'av', 'ave', 'avda', 'calle', 'autopista', 'carretera', 'esquina', 'esq', 'edificio', 'edif', 'plaza', 'torre',
  'residencial', 'urbanizacion', 'urb', 'kilometro', 'km', 'callejon', 'manzana', 'street', 'avenue', 'road']);
const CALLE_PREVIA = new Set(['avenida', 'av', 'ave', 'avda', 'calle', 'autopista', 'carretera', 'esquina', 'esq', 'plaza', 'edificio', 'edif', 'torre',
  'residencial', 'res', 'urbanizacion', 'urb', 'parque', 'paseo', 'puente', 'aeropuerto', 'malecon', 'street', 'avenue', 'road', 'km', 'kilometro',
  'callejon', 'manzana', 'colegio', 'universidad', 'hospital', 'clinica', 'farmacia', 'supermercado', 'hotel', 'banco', 'club', 'liceo', 'escuela']);
const LUGAR_TRIG = indice(['que esten en', 'que este en', 'que estan en', 'que esta en', 'que quedan en', 'que queden en', 'ubicados en', 'ubicadas en',
  'ubicado en', 'ubicada en', 'localizados en', 'situados en', 'located in', 'based in', 'que sea en', 'que sean en']);
const PERO = indice(['pero', 'sino', 'aunque', 'but', 'however']);
const VERBOS = indice(['quiero', 'queremos', 'quisiera', 'necesito', 'necesitamos', 'deseo', 'busco', 'buscamos', 'i want', 'we want', 'i need', 'we need',
  'please', 'por favor', 'quiero que', 'me gustaria', 'ayudame a', 'help me', 'i would like', 'id like']);
const TELEFONO_PREVIO = indice(['tel', 'telefono', 'cel', 'celular', 'whatsapp', 'llamar al', 'llamame al', 'phone', 'call me at']);
const FRASES_RELLENO = indice(['que ofrecer', 'que ofrecerles', 'que ofrecerle', 'que venderles', 'que venderle', 'what to offer', 'tu mismo', 'tu misma',
  'ustedes mismos', 'yourself', 'por mi', 'por nosotros', 'estoy seguro', 'estoy segura', 'seguro que', 'muchas gracias', 'si se puede', 'lo antes posible', 'cuanto antes', 'que yo pueda',
  'que puedo', 'te lo agradezco', 'gracias de antemano', 'no importa', 'no importa el', 'lo que sea', 'de lo que sea', 'cualquier cosa', 'de todo',
  'por ahora', 'de momento', 'por el momento', 'thank you', 'as soon as possible', 'for now', 'no se', 'ni idea']);
const CAMPOS_DE_ESTUDIO = new Set(['sistemas', 'informatica', 'computacion', 'computadoras', 'enfermeria', 'refrigeracion', 'contabilidad', 'administracion',
  'mercadeo', 'marketing', 'derecho', 'medicina', 'electricidad', 'electronica', 'mecanica', 'redes', 'ventas', 'educacion', 'psicologia', 'finanzas',
  'economia', 'turismo', 'hoteleria', 'gastronomia', 'arquitectura', 'construccion', 'telecomunicaciones', 'software', 'programacion', 'diseno',
  'recursos', 'logistica', 'seguridad', 'salud', 'laboratorio', 'odontologia', 'farmacia', 'agronomia', 'veterinaria', 'idiomas', 'ingles',
  'comunicacion', 'comunicaciones', 'publicidad', 'calidad', 'mantenimiento', 'aire', 'plomeria', 'soldadura', 'carpinteria', 'ebanisteria', 'cocina',
  'reposteria', 'belleza', 'estetica', 'industrial', 'civil', 'electrica', 'quimica', 'biologia', 'matematicas', 'fisica', 'banca', 'seguros',
  'cobros', 'atencion', 'servicio', 'call', 'it', 'ti', 'datos', 'web', 'computers', 'nursing', 'accounting', 'sales', 'engineering']);
const LUGARES_DE_TRABAJO = new Set(['moto', 'motor', 'carro', 'camion', 'guagua', 'bicicleta', 'yipeta', 'patana', 'grua', 'salon', 'salones', 'oficina', 'oficinas', 'empresa', 'empresas', 'compania', 'tienda', 'tiendas', 'casa', 'casas',
  'restaurante', 'negocio', 'fabrica', 'almacen', 'obra', 'obras', 'aeropuerto', 'puerto', 'crucero', 'cruceros', 'hospital', 'clinica', 'colegio',
  'escuela', 'universidad', 'banco', 'hotel', 'hoteles', 'bar', 'familia', 'zona']);
const NO_INFINITIVOS = new Set(['lugar', 'hogar', 'mar', 'collar', 'dolar', 'militar', 'familiar', 'particular', 'popular', 'celular', 'ejemplar', 'bienestar',
  'par', 'poder', 'mujer', 'placer', 'alquiler', 'cancer', 'chofer', 'taller', 'bar', 'solar', 'nivel', 'cuartel', 'hotel', 'papel', 'cuadrilatero',
  'ingeniero', 'super', 'master', 'computer', 'manager', 'dealer', 'center', 'printer', 'water', 'flyer', 'poster', 'container', 'contenedor', 'proveedor',
  'distribuidor', 'mayor', 'menor', 'mejor', 'peor', 'exterior', 'interior', 'motor', 'sector', 'tractor', 'generador', 'inversor', 'contador', 'doctor',
  'pintor', 'auditor', 'vendedor', 'conductor', 'operador', 'supervisor', 'director', 'gerente', 'tutor', 'actor', 'escritor', 'impresor', 'servidor']);

// Palabras que no dicen nada por sí solas: si en un pedazo sin usar solo hay de estas, no se pregunta nada.
export const RELLENO = new Set(`a al ante bajo con contra de del desde durante en entre hacia hasta mediante para por segun sin sobre tras y e o u ni que el la lo
  los las un una unos unas mi mis tu tus su sus nuestro nuestra nuestros nuestras me te se nos le les yo usted ustedes ella ellos ellas nosotros este esta
  estos estas ese esa esos esas eso esto aquel aquella aqui ahi alli alla aca muy mas tan tanto tambien ademas solo solamente ya aun todavia ahora luego
  despues antes entonces pues bueno bien ok okay si hola saludos gracias favor porfa ayuda ayudame quiero queremos quisiera quisieramos necesito necesitamos
  busco buscamos buscar busca buscame encontrar encuentra encuentrame encontrarme conseguir consigueme hacer haz hazme crear crea creame proyecto proyectos
  oportia todo toda todos todas otro otra otros otras cual cuales quien quienes donde cuando como porque cuanto cuantos mucho muchos mucha muchas poco
  pocos ser es son sea sean era estar esta estan este esten estoy tengo tiene tienen tenga tengan tener hay haber he ha han puede pueden pueda puedan poder
  puedo podria podrias debe deben deberia gustaria encantaria interesa interesan vamos voy va van ir dar dame mira mire oye gente personas persona clientes
  cliente potenciales nuevos nuevas posibles mejores buenos buenas buen bueno oportunidades oportunidad ayudar ayudarme idea ideas etc algo cosa cosas
  necesitarlos necesitarlas necesitar necesite necesiten necesitan necesita necesitaria lo les vender venderle venderles ventas venta comprar compren
  trabajo trabajar empleo empleos chamba chiripa revisa revisar revises reviso dia revision listo lista seguir sigue manera forma
  i im ive we you they it its my our your their a an the to of in on at for from with by and or but so please thanks thank hi hello want need looking
  look find search get some any new potential customers clients leads that who which can could would will should is are be am this these those there here
  also just only more very me us them him her do does did dont have has project help work job jobs sell selling buy ones one really well good great`
  .split(/\s+/).filter(Boolean));

const ARTICULOS = new Set(['el', 'la', 'los', 'las', 'lo', 'un', 'una', 'unos', 'unas', 'the', 'a', 'an']);
const POSESIVOS = new Set(['mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'my', 'our', 'your', 'their']);
const SEPARADORES = new Set(['y', 'e', 'o', 'u', 'ni', 'and', 'or', 'nor', '/']);
const PREP_LUGAR = new Set(['en', 'de', 'del', 'desde', 'hasta', 'in', 'near', 'from', 'around', 'hacia', 'por', 'across', 'throughout', 'at', 'para', 'a', 'al', 'of']);
const PREP_LUGAR_FUERTE = new Set(['en', 'de', 'del', 'desde', 'hasta', 'in', 'near', 'from', 'around', 'hacia', 'across', 'at']);
const SIN_ARTICULO = new Set(['zona', 'region', 'linea', 'ciudad', 'provincia', 'municipio', 'distrito', 'republica', 'gran', 'capital', 'parte', 'costa', 'sur',
  'este', 'norte', 'dn', 'sde', 'sdn', 'sdo', 'cibao', 'noroeste', 'nordeste']);
const ADJETIVOS_PREVIOS = new Set(['todo', 'toda', 'todos', 'todas', 'el', 'la', 'los', 'las', 'all', 'the', 'whole', 'entire', 'cualquier', 'parte', 'resto']);
const RECORTE_INICIAL = new Set(['los', 'las', 'el', 'la', 'un', 'una', 'unos', 'unas', 'todo', 'toda', 'todos', 'todas', 'otros', 'otras', 'otro', 'otra',
  'mas', 'muchos', 'muchas', 'varios', 'varias', 'algunos', 'algunas', 'ciertos', 'ciertas', 'nuevos', 'nuevas', 'potenciales', 'posibles', 'mejores',
  'the', 'a', 'an', 'all', 'any', 'some', 'other', 'new', 'potential', 'mis', 'mi', 'sus', 'su', 'my', 'our', 'their', 'de', 'of', 'tipo', 'clase']);
const RECORTE_EXCLUSION = new Set(['que', 'sea', 'sean', 'son', 'es', 'esten', 'este', 'estan', 'me', 'nos', 'interesa', 'interesan', 'gusta',
  'gustan', 'incluir', 'incluyas', 'contar', 'trabajar', 'trabajo', 'vender', 'venderle', 'venderles', 'buscar', 'busques', 'is', 'are',
  'be', 'want', 'working', 'work', 'quiero', 'deseo', 'include', 'any']);
// Preposiciones que se quitan solo si después viene algo conocido («excepto en Moca» → Moca; «not at night» queda igual).
const PREPOSICIONES_DE_EXCLUSION = new Set(['a', 'al', 'en', 'in', 'at', 'to', 'for', 'para']);

// ---------- Estado de la lectura ----------
function nuevoEstado(original) {
  const T = tokenizar(original);
  const n = T.length;
  const ent = new Array(n).fill(null);
  for (let i = 0; i < n;) {
    const m = buscarEn(T, i, ENTIDADES);
    if (m) { ent[i] = m; i = m.fin; } else i++;
  }
  return {
    original, T, n, ent, mayus: todoEnMayusculas(original),
    usado: new Uint8Array(n),
    memo: new Map(),
    tipo: 'comercial',
    sectores: [], sectoresPrioridad: [], general: { visto: false, todos: false }, sectoresLibres: [], sectoresExcluidos: [], exclusiones: [],
    zonas: [], zonasLibres: [], zonasExcluidas: [], pais: { explicito: false, nombre: false },
    tamanos: new Set(), tamanosExcluidos: new Set(), prioridades: [], productos: [], negocioPropio: null,
    puesto: '', experiencia: null, tramosSalario: [], salarioEnVenta: [], frecuencias: [], dudas: [], supuestos: new Set(),
    capPedidas: new Set(), capNegadas: new Set(), soloInvestigar: false, contactarPedido: false,
    ultimoProductoFin: -1, secuencia: [], pideClientes: false, cicloCompleto: false,
  };
}

const texto = (x, a, b) => (a < b ? x.original.slice(x.T[a].ini, x.T[b - 1].fin) : '');
const esFuerte = t => !t || (t.tipo === 's' && t.w === '.');
const esComa = t => t?.tipo === 's' && t.w === ',';
const marcar = (x, a, b) => { for (let k = Math.max(0, a); k < Math.min(b, x.n); k++) x.usado[k] = 1; };
const datoDe = (x, i, que) => x.ent[i]?.datos.find(d => d.que === que) || null;
const esRelleno = w => RELLENO.has(w);

const MAXIMO_DE_DUDAS = 12;

function agregarDuda(x, clave, valor, sugerencias = []) {
  if (x.dudas.length >= MAXIMO_DE_DUDAS) return;
  const limpio = String(valor ?? '').replace(/\s+/g, ' ').replace(/^[\s,;:.]+|[\s,;:.]+$/g, '').slice(0, 80);
  if (x.dudas.some(d => d.clave === clave && comparable(d.texto) === comparable(limpio))) return;
  x.dudas.push({ clave, texto: limpio, sugerencias: sugerencias.slice(0, 3) });
}

function agregarPrioridad(x, a, b) {
  while (a < b && (esComa(x.T[a]) || ['y', 'e', 'and', 'pero'].includes(x.T[a].w))) a++;
  while (b > a && (x.T[b - 1].tipo === 's' || ['y', 'e', 'de', 'and', 'o', 'que', 'con', 'en'].includes(x.T[b - 1].w))) b--;
  if (b <= a) return;
  let valor = texto(x, a, b).replace(/\s+/g, ' ').trim();
  if (valor.length > 160) valor = valor.slice(0, 160).replace(/\s+\S*$/, '');
  if (!valor || x.prioridades.length >= 30) return;
  if (!x.prioridades.some(p => comparable(p) === comparable(valor))) x.prioridades.push(valor);
}

// ---------- Lugares ----------
// ¿Hay un lugar en «i»? Revisa el contexto: «avenida Duarte» o «la Mella» son calles; «Esperanza» solo es lugar después de «en».
function lugarEn(x, i, enLista = false) {
  const m = x.ent[i];
  if (!m) return null;
  const { T } = x;
  const anterior = T[i - 1]?.tipo === 'p' ? T[i - 1].w : null;
  const callePrevia = (anterior && CALLE_PREVIA.has(anterior)) || (T[i - 1]?.w === '/' && T[i - 2]?.w === 'c');
  const primera = T[i].w;
  const conArticulo = (anterior === 'la' || anterior === 'el') && !ARTICULOS.has(primera);
  const previaFuerte = anterior && (PREP_LUGAR_FUERTE.has(anterior) || ((anterior === 'la' || anterior === 'el' || anterior === 'todo' || anterior === 'toda')
    && PREP_LUGAR_FUERTE.has(T[i - 2]?.w)));
  const contexto = enLista || previaFuerte;
  for (const d of m.datos) {
    if (d.que === 'zona') {
      if (callePrevia) continue;
      if (conArticulo && !SIN_ARTICULO.has(primera) && d.tipo !== 'region' && d.tipo !== 'lugar') continue;
      if (d.ambigua && !contexto) continue;
      return { que: 'zona', clave: d.clave, tipo: d.tipo, fin: m.fin };
    }
    if (d.que === 'pais' && !callePrevia) return { que: 'pais', explicito: d.explicito, fin: m.fin };
    if (d.que === 'extranjero' && !callePrevia && !conArticulo && anterior !== 'con') return { que: 'extranjero', fin: m.fin };
  }
  const calle = m.datos.find(d => d.que === 'calle');
  if (calle) return { que: 'calle', provincia: calle.provincia, fin: m.fin, comoCalle: callePrevia || conArticulo, explicita: callePrevia };
  return null;
}

// Palabras que parecen el nombre de un lugar que no está en la lista («Pueblo Inventado», «SFM»).
function pareceLugar(x, i) {
  const t = x.T[i];
  if (!t || t.tipo !== 'p' || x.ent[i] || esRelleno(t.w) || detectar(x, i)) return 0;
  const original = x.original.slice(t.ini, t.fin);
  const sigla = /^[A-Z]{2,4}$/.test(original);
  if (!sigla && (x.mayus || !t.mayus)) return 0;
  let fin = i + 1;
  while (fin < x.n && fin - i < 4) {
    const s = x.T[fin];
    if (s.tipo === 'p' && !x.ent[fin] && !detectar(x, fin) && (s.mayus || (['de', 'del', 'la', 'los', 'las'].includes(s.w) && x.T[fin + 1]?.mayus))) fin++;
    else break;
  }
  while (fin > i + 1 && ['de', 'del', 'la', 'los', 'las'].includes(x.T[fin - 1].w)) fin--;
  return fin;
}

const ZONA_POR_PALABRA = (() => {
  const lista = [];
  for (const z of ZONAS) for (const p of z.palabras) if (p.length >= 4) lista.push({ p, clave: z.clave });
  return lista;
})();

export function sugerenciasDeLugar(valor) {
  const comp = comparable(valor).replace(/^(en|de|del|la|el)\s+/, '');
  if (comp.length < 3) return [];
  const tope = comp.length <= 5 ? 1 : 2;
  let mejor = tope + 1;
  let claves = [];
  for (const { p, clave } of ZONA_POR_PALABRA) {
    const d = distancia(comp, p, tope);
    if (d < mejor) { mejor = d; claves = [clave]; } else if (d === mejor && !claves.includes(clave)) claves.push(clave);
  }
  return mejor <= tope ? claves.slice(0, 3) : [];
}

// Guarda un lugar y devuelve dónde termina.
function guardarLugar(x, L, a, b, destino) {
  if (L.que === 'zona') (destino === 'excluir' ? x.zonasExcluidas : x.zonas).push(L.clave);
  else if (L.que === 'pais' && destino !== 'excluir') {
    if (L.explicito) x.pais.explicito = true; else x.pais.nombre = true;
  } else if (L.que === 'extranjero') {
    if (destino !== 'excluir') x.zonasLibres.push(texto(x, a, b));
  } else if (L.que === 'calle') {
    // «la Duarte», «de la Independencia»: puede ser la avenida o la provincia. Se pregunta.
    const desde = ['la', 'el'].includes(x.T[a - 1]?.w) ? a - 1 : a;
    if (L.provincia && !L.explicita && !['con', 'esq', 'esquina'].includes(x.T[b]?.w)) {
      marcar(x, desde, b);
      agregarDuda(x, 'calle_o_provincia', texto(x, desde, b), [L.provincia]);
      return b;
    }
    const fin = spanDireccion(x, desde, a);
    agregarDuda(x, 'direccion', texto(x, desde, fin));
    return fin;
  }
  return b;
}

// Una lista de lugares: «en Santiago, Moca y La Vega», «en Stgo o en La Vega», «en Santiago y todo el Cibao».
function listaDeLugares(x, i, destino = 'incluir') {
  const { T } = x;
  const antes = x.zonas.length;
  let j = i;
  let enLista = false;
  let alguno = false;
  for (let vueltas = 0; vueltas < 25; vueltas++) {
    const L = lugarEn(x, j, enLista);
    // «la capital de Santiago» es la ciudad de Santiago, no Santo Domingo.
    if (L && L.clave === 'gran-santo-domingo' && T[j].w === 'la' && ['de', 'del'].includes(T[L.fin]?.w) && lugarEn(x, L.fin + 1, true)?.que === 'zona') {
      marcar(x, j, L.fin + 1);
      j = L.fin + 1;
      continue;
    }
    if (L && !(L.que === 'calle' && L.explicita)) {
      const fin = guardarLugar(x, L, j, L.fin, destino);
      marcar(x, j, fin);
      j = fin;
      alguno = L.que !== 'calle';
    } else {
      const fin = enLista || PREP_LUGAR_FUERTE.has(T[j - 1]?.w) ? pareceLugar(x, j) : 0;
      if (!fin) break;
      const valor = texto(x, j, fin);
      if (destino === 'excluir') { if (x.exclusiones.length < 30) x.exclusiones.push(valor); }
      else if (x.zonasLibres.length < 30) {
        x.zonasLibres.push(valor);
        // Las sugerencias cuestan: solo se buscan si la duda todavía cabe en la lista.
        if (x.dudas.length < MAXIMO_DE_DUDAS) agregarDuda(x, 'lugar', valor, sugerenciasDeLugar(valor));
      }
      marcar(x, j, fin);
      j = fin;
      alguno = true;
    }
    enLista = true;
    // ¿Sigue la lista?
    let k = j;
    if (esComa(T[k]) || SEPARADORES.has(T[k]?.w)) k++; else break;
    let hallado = -1;
    for (let q = k; q < x.n && q - k < 4; q++) {
      const siguiente = lugarEn(x, q, true);
      if ((siguiente && !(siguiente.que === 'calle' && siguiente.explicita)) || pareceLugar(x, q)) { hallado = q; break; }
      if (!(['en', 'de', 'del', 'in', 'a', 'al', 'y'].includes(T[q].w) || ADJETIVOS_PREVIOS.has(T[q].w))) break;
    }
    if (hallado >= 0) {
      marcar(x, j, hallado);
      j = hallado;
      continue;
    }
    break;
  }
  if (alguno && destino === 'incluir') x.secuencia.push({ t: 'Z', claves: x.zonas.slice(antes) });
  return j;
}

// El primer lugar después de «k», saltando «todo el», «la»… solo si hace falta («en la capital» empieza en «la»).
function lugarTras(x, k) {
  for (let q = k; q < x.n && q - k < 4; q++) {
    const L = lugarEn(x, q, true);
    if (L) return { L, q };
    if (!ADJETIVOS_PREVIOS.has(x.T[q].w) || x.ent[q]) return null;
  }
  return null;
}

// ---------- Disparadores ----------
// Qué empieza en «j»: devuelve { tipo, fin, … } o null. Se calcula una sola vez por posición.
export function detectar(x, j) {
  if (x.memo.has(j)) return x.memo.get(j);
  const r = detectarSinMemo(x, j);
  // Si un nombre conocido más largo empieza aquí («contact center»), gana el nombre.
  const final = r && x.ent[j] && x.ent[j].fin > r.fin && !['experiencia', 'objetivo', 'salario', 'telefono'].includes(r.tipo) ? null : r;
  x.memo.set(j, final);
  return final;
}

function detectarSinMemo(x, j) {
  const { T } = x;
  const t = T[j];
  if (!t || t.tipo === 's') return null;
  let m = buscarEn(T, j, EXPERIENCIA);
  if (m) return { tipo: 'experiencia', fin: m.fin };
  m = buscarEn(T, j, OBJETIVOS);
  if (m) return { tipo: 'objetivo', fin: m.fin, clave: m.datos[0].clave };
  m = buscarEn(T, j, SOLO);
  if (m) return { tipo: 'solo', fin: m.fin };
  m = buscarEn(T, j, NADIE);
  if (m) return { tipo: 'cap', neg: true, fin: m.fin, claves: ['contactar'], enviar: true };
  m = buscarEn(T, j, CICLO);
  if (m) return { tipo: 'ciclo', fin: m.fin };
  const cap = capacidadEn(x, j);
  if (cap) return cap;
  const frec = frecuenciaEn(x, j);
  if (frec) return frec;
  if ((buscarEn(T, j, TELEFONO_PREVIO) && T[(buscarEn(T, j, TELEFONO_PREVIO)).fin]?.tipo === 'n') || esTelefono(T, j)) {
    const fin = finDeTelefono(T, j);
    if (fin > j) return { tipo: 'telefono', fin };
  }
  const salario = salarioEn(T, j);
  if (salario) return { tipo: 'salario', fin: salario.fin, tramo: salario };
  m = buscarEn(T, j, CANTIDAD);
  if (m && T[m.fin]?.tipo === 'n' && T[m.fin + 1]?.tipo === 'p' && UNIDADES.has(T[m.fin + 1].w)) return { tipo: 'condicion', fin: m.fin, clave: 'cantidad' };
  m = buscarEn(T, j, EXCLUIR);
  if (m && exclusionValida(x, j, m)) return { tipo: 'excluir', fin: m.fin, frase: m.datos[0].frase, condicional: Boolean(m.datos[0].condicional) };
  m = buscarEn(T, j, PRIORIDAD);
  if (m) return { tipo: 'prioridad', fin: m.fin };
  m = buscarEn(T, j, LUGAR_TRIG);
  if (m && lugarEn(x, m.fin, true)) return { tipo: 'lugar', fin: m.fin };
  m = buscarEn(T, j, CONDICION);
  if (m && condicionValida(x, j, m)) return { tipo: 'condicion', fin: m.fin, clave: m.datos[0].clave, corta: Boolean(m.datos[0].corta) };
  // «tengo 3 años de experiencia»: algo sobre la persona que busca empleo.
  if (x.tipo === 'laboral' && ['tengo', 'tenemos', 'have'].includes(t.w)) {
    for (let k = j + 1; k < Math.min(x.n, j + 6); k++) {
      if (T[k].tipo === 's') break;
      if (T[k].w === 'experiencia' || T[k].w === 'experience') return { tipo: 'condicion', fin: j + 1, clave: 'laboral' };
    }
  }
  m = buscarEn(T, j, SIN);
  if (m) return { tipo: 'sin', fin: m.fin };
  if (x.tipo === 'laboral') {
    m = buscarEn(T, j, PUESTO);
    if (m && puestoValido(x, j, m)) return { tipo: 'puesto', fin: m.fin };
  } else {
    m = buscarEn(T, j, PRODUCTO);
    if (m) return { tipo: 'producto', fin: m.fin, frase: m.datos[0].frase };
  }
  m = buscarEn(T, j, PROPIO);
  if (m && propioValido(x, m.fin)) return { tipo: 'propio', fin: m.fin };
  m = buscarEn(T, j, CERCA);
  if (m && T[m.fin] && !esFuerte(T[m.fin])) return { tipo: 'cerca', fin: m.fin };
  m = buscarEn(T, j, DIRECCION);
  if (m && T[m.fin] && T[m.fin].tipo !== 's' && !esRelleno(T[m.fin].w)) return { tipo: 'direccion', fin: m.fin };
  m = buscarEn(T, j, PERO);
  if (m) return { tipo: 'pero', fin: m.fin };
  m = buscarEn(T, j, VERBOS);
  if (m) return { tipo: 'verbo', fin: m.fin };
  return null;
}

function exclusionValida(x, j, m) {
  const { T } = x;
  const d = m.datos[0];
  const siguiente = T[m.fin];
  if (!siguiente || siguiente.tipo === 's') return false;
  if (d.menos || (d.frase.startsWith('menos') && !d.condicional)) {
    const a1 = T[j - 1]?.w;
    const a2 = T[j - 2]?.w;
    if (a1 === 'al' || a1 === 'a' || (a1 === 'lo' && a2 === 'por') || (a1 === 'o' && a2 === 'mas') || a1 === 'mas') return false;
    if (siguiente.tipo === 'n' || siguiente.w === 'que' || siguiente.w === 'mal' || (siguiente.w === 'de' && T[m.fin + 1]?.tipo === 'n')) return false;
  }
  if (d.generico) {
    if (['se', 'importa', 'necesariamente', 'tan', 'hay', 'tengo', 'tiene', 'solo', 'only', 'just'].includes(siguiente.w)) return false;
    if (buscarEn(T, m.fin, EXCLUIR)) return true;
    if (INICIO_DE_EXCLUSION.has(siguiente.w)) return true;
    const e = x.ent[m.fin];
    return Boolean(e && e.datos.some(dd => ['sector', 'zona', 'tamano', 'capcosa', 'extranjero', 'pais'].includes(dd.que)));
  }
  return true;
}

function condicionValida(x, j, m) {
  const { T } = x;
  const d = m.datos[0];
  const siguiente = T[m.fin];
  if (d.clave === 'laboral') return x.tipo === 'laboral';
  if (d.clave === 'con') {
    if (!siguiente || siguiente.tipo === 's' || PALABRAS_SALARIO.has(siguiente.w)) return false;
    if (POSESIVOS.has(siguiente.w) && ['permiso', 'aprobacion', 'autorizacion', 'ok', 'visto'].includes(T[m.fin + 1]?.w)) return false;
    return true;
  }
  return Boolean(siguiente && siguiente.tipo !== 's');
}

function puestoValido(x, j, m) {
  const { T } = x;
  const d = m.datos[0];
  if (!d.desnudo) return true;
  const anterior = T[j - 1];
  const alInicio = !anterior || esFuerte(anterior) || ['busco', 'quiero', 'necesito', 'buscando', 'un', 'consigueme', 'buscar', 'nuevo', 'a', 'looking', 'for'].includes(anterior.w);
  if (!alInicio) return false;
  const siguiente = T[m.fin];
  if (esComa(siguiente) && T[m.fin + 1]?.tipo === 'p' && (x.original[siguiente.ini] === ':')) return true;
  if (!siguiente || siguiente.tipo !== 'p' || esRelleno(siguiente.w) || PREP_LUGAR.has(siguiente.w) || PALABRAS_SALARIO.has(siguiente.w)) return false;
  if (x.ent[m.fin] && x.ent[m.fin].datos.some(dd => dd.que === 'zona' || dd.que === 'pais')) return false;
  return !detectar(x, m.fin);
}

// Palabras que dicen «mi negocio» aunque no sean un sector: «tengo una agencia de publicidad».
const NEGOCIOS_PROPIOS = new Set(['agencia', 'firma', 'distribuidora', 'imprenta', 'emprendimiento', 'marca', 'franquicia', 'startup', 'tiendita',
  'fabriquita', 'negocito', 'empresita', 'compania', 'microempresa', 'pyme']);

function propioValido(x, k) {
  let j = k;
  if (x.ent[j]?.datos.some(d => d.que === 'tamano')) j = x.ent[j].fin;
  if (['propio', 'propia', 'pequeno', 'pequena', 'nuevo', 'nueva'].includes(x.T[j]?.w)) j++;
  return Boolean(x.ent[j]?.datos.some(d => d.que === 'sector')) || (NEGOCIOS_PROPIOS.has(x.T[j]?.w) && ['de', 'of'].includes(x.T[j + 1]?.w));
}

// ---------- Capacidades ----------
function capacidadEn(x, j) {
  const { T } = x;
  const n = buscarEn(T, j, NEG_CAP);
  if (n) {
    const r = capacidadesDespues(x, n.fin);
    if (r) return { tipo: 'cap', neg: true, fin: r.fin, claves: r.claves, enviar: r.enviar };
  }
  const v = buscarEn(T, j, CAP_VERBOS);
  if (v && !(T[j - 1] && ['no', 'sin', 'ni', 'dont', 'not', 'never', 'nunca'].includes(T[j - 1].w))) {
    return { tipo: 'cap', neg: false, fin: v.fin, claves: [v.datos[0].clave], enviar: false };
  }
  const p = buscarEn(T, j, PEDIR);
  if (p) {
    const r = cosasDespues(x, p.fin);
    if (r) return { tipo: 'cap', neg: false, fin: r.fin, claves: r.claves, enviar: ENVIAR.has(p.datos[0].frase) && r.claves.includes('correos') };
  }
  return null;
}

function saltarPequenas(x, k) {
  let j = k;
  while (j < x.n && j - k < 3 && PEQUENAS.has(x.T[j].w)) j++;
  return j;
}

function capacidadesDespues(x, k) {
  const { T } = x;
  const j = saltarPequenas(x, k);
  const v = buscarEn(T, j, CAP_VERBOS);
  if (v) return { fin: v.fin, claves: [v.datos[0].clave], enviar: false };
  const p = buscarEn(T, j, PEDIR);
  if (p) {
    const r = cosasDespues(x, p.fin);
    if (r) return { ...r, enviar: ENVIAR.has(p.datos[0].frase) && r.claves.includes('correos') };
  }
  const r = cosasDespues(x, j);
  return r ? { ...r, enviar: false } : null;
}

function cosasDespues(x, k) {
  const { T } = x;
  const claves = [];
  let j = saltarPequenas(x, k);
  let fin = -1;
  for (let vueltas = 0; vueltas < 6; vueltas++) {
    const d = datoDe(x, j, 'capcosa');
    if (!d) break;
    claves.push(d.clave);
    j = x.ent[j].fin;
    fin = j;
    if (['de', 'para', 'a', 'al'].includes(T[j]?.w) && datoDe(x, j + 1, 'capcosa')) j++;
    if (!(esComa(T[j]) || SEPARADORES.has(T[j]?.w))) break;
    j = saltarPequenas(x, j + 1);
  }
  return claves.length ? { fin, claves } : null;
}

// ---------- Frecuencia ----------
function frecuenciaEn(x, j) {
  const { T } = x;
  let k = j;
  let neg = false;
  if (T[k].w === 'no' || T[k].w === 'not') { neg = true; k++; } else if ((T[k].w === 'pero' || T[k].w === 'y') && T[k + 1]?.w === 'no') { neg = true; k += 2; }
  const m = buscarEn(T, k, FREC_FRASES);
  if (m) {
    const d = m.datos[0];
    // «cada día no, cada semana»: el «no» de después también niega.
    if (T[m.fin]?.w === 'no' && (esComa(T[m.fin + 1]) || esFuerte(T[m.fin + 1]))) return { tipo: 'frec', fin: m.fin + 1, ini: k, clave: d.clave, neg: true };
    return { tipo: 'frec', fin: m.fin, ini: k, clave: d.clave, nd: Boolean(d.nd), dia: Boolean(d.dia), neg };
  }
  const a = buscarEn(T, k, FREC_ADV);
  if (a && contextoDeFrecuencia(x, k, a.fin)) return { tipo: 'frec', fin: a.fin, ini: k, clave: a.datos[0].clave, neg };
  return null;
}

function contextoDeFrecuencia(x, k, fin) {
  const { T } = x;
  const despues = T[fin];
  if (despues && (PALABRAS_SALARIO.has(despues.w) || despues.tipo === 'n')) return false;
  for (let b = k - 1; b >= 0 && b >= k - 4; b--) {
    const t = T[b];
    if (esFuerte(t)) break;
    if (t.tipo === 'n' || PALABRAS_SALARIO.has(t.w) || t.w === 'horas' || t.w === 'turnos' || t.w === 'pago') return false;
    if (VERBOS_REVISAR.has(t.w)) return true;
  }
  return esComa(T[k - 1]) && esFuerte(T[fin]);
}

// ---------- Tipo: vender o buscar empleo ----------
const FUERTES = crearIndice([
  ...SENALES_LABORAL_FUERTES.map(frase => ({ frase, dato: { lado: 'laboral' } })),
  ...SENALES_COMERCIAL_FUERTES.map(frase => ({ frase, dato: { lado: 'comercial', clientes: /clientes|customers|clients|leads|prospectos|compradores|buyers/.test(frase) } })),
]);
const DEBILES = crearIndice([
  ...SENALES_LABORAL_DEBILES.map(frase => ({ frase, dato: { lado: 'laboral' } })),
  ...SENALES_COMERCIAL_DEBILES.map(frase => ({ frase, dato: { lado: 'comercial' } })),
]);

function decidirTipo(x) {
  const { T } = x;
  const fuertes = [];
  const debiles = { laboral: 0, comercial: 0 };
  for (let i = 0; i < x.n;) {
    const m = buscarEn(T, i, FUERTES);
    if (m) { fuertes.push({ lado: m.datos[0].lado, i }); if (m.datos[0].clientes) x.pideClientes = true; i = m.fin; continue; }
    const d = buscarEn(T, i, DEBILES);
    if (d) { debiles[d.datos[0].lado]++; i = d.fin; continue; }
    i++;
  }
  const primero = fuertes[0];
  if (primero) {
    // Una señal del otro lado dentro de una frase que depende de la primera no cuenta:
    // «busco trabajo en una empresa QUE VENDE…», «vendo software DE EMPLEOS».
    const otros = fuertes.filter(f => f.lado !== primero.lado && !['que', 'de', 'para', 'of', 'for', 'that'].includes(T[f.i - 1]?.w));
    if (otros.length) return { tipo: primero.lado, duda: true };
    return { tipo: primero.lado };
  }
  if (debiles.laboral > debiles.comercial) return { tipo: 'laboral', supuesto: 'tipo_laboral' };
  return { tipo: 'comercial', supuesto: 'tipo' };
}

// ---------- A quién se busca ----------
// Analiza un pedazo como «hoteles grandes», «empresas de seguridad», «clínicas privadas», «pymes».
function analizarNegocio(x, a, b, { libre }) {
  const { T } = x;
  let s = a;
  while (s < b && !x.ent[s] && RECORTE_INICIAL.has(T[s].w)) s++;
  const sectores = [];
  const tamanos = [];
  let general = null;
  let generalAntes = false;
  let deDespuesDeGeneral = false;
  let masOMenos = false;
  const desconocidas = [];
  for (let j = s; j < b;) {
    const e = x.ent[j];
    if (e) {
      const sector = e.datos.find(d => d.que === 'sector');
      const tamano = e.datos.find(d => d.que === 'tamano');
      if (sector && !sector.general) { sectores.push({ j, fin: e.fin, dato: sector, despuesDeDe: generalAntes && ['de', 'del'].includes(T[j - 1]?.w) }); if (generalAntes && ['de', 'del'].includes(T[j - 1]?.w)) deDespuesDeGeneral = true; }
      else if (sector) { general = general || sector; generalAntes = true; }
      else if (tamano) tamanos.push(tamano);
      else desconocidas.push(j);
      j = e.fin;
      continue;
    }
    // «más o menos grandes»: medianas y grandes.
    if (T[j].w === 'menos' && T[j - 1]?.w === 'o' && T[j - 2]?.w === 'mas') { masOMenos = true; j++; continue; }
    if (!esRelleno(T[j].w) && T[j].tipo !== 's') desconocidas.push(j);
    j++;
  }
  if (masOMenos && tamanos.length) tamanos.push({ clave: 'medianas' });
  let ultimo = b;
  while (ultimo > s && (esRelleno(T[ultimo - 1].w) || T[ultimo - 1].tipo === 's')) ultimo--;
  const valorLibre = texto(x, s, ultimo);
  if (x.tipo === 'comercial') for (const t of tamanos) x.tamanos.add(t.clave);
  if (!sectores.length && !general && !desconocidas.length) {
    if (tamanos.some(t => t.empresa)) { x.general.visto = true; return true; }
    return tamanos.length > 0;
  }
  if (!desconocidas.length && sectores.length === 1) { x.sectores.push(sectores[0].dato.clave); return true; }
  if (!desconocidas.length && !sectores.length && general) {
    x.general.visto = true;
    if (general.todos) x.general.todos = true;
    return true;
  }
  if (!desconocidas.length && general && deDespuesDeGeneral && sectores.length === 1) { x.sectores.push(sectores[0].dato.clave); return true; }
  if (valorLibre && (libre || sectores.length || general)) {
    x.sectoresLibres.push(valorLibre);
    x.supuestos.add('sectores_libres');
    return true;
  }
  return false;
}

// ¿En «k» empieza otro negocio de la lista (después de una coma o una «y»)?
function empiezaNegocio(x, k, libre) {
  const { T } = x;
  let j = k;
  while (j < x.n && RECORTE_INICIAL.has(T[j].w) && !x.ent[j]) j++;
  const e = x.ent[j];
  if (e) return e.datos.some(d => d.que === 'sector' || d.que === 'tamano');
  if (!libre) return false;
  const t = T[j];
  return Boolean(t && t.tipo === 'p' && !esRelleno(t.w) && !detectar(x, j) && !PREP_LUGAR.has(t.w));
}

function esInfinitivo(x, j) {
  const t = x.T[j];
  return Boolean(t && t.tipo === 'p' && !x.ent[j] && /^[a-z]{2,}(ar|er|ir)(lo|la|los|las|le|les|se)?$/.test(t.w) && !NO_INFINITIVOS.has(t.w));
}

// Lista de a quién se busca: «a hoteles, clínicas y fábricas grandes de Santiago».
function spanObjetivo(x, k, { libre, deClientes = false }) {
  const { T } = x;
  const items = [];
  let a = k;
  let j = k;
  let fin = k;
  while (j < x.n && j - k < 40) {
    const t = T[j];
    if (esFuerte(t)) break;
    if (j > a && detectar(x, j) && !['verbo'].includes(detectar(x, j).tipo)) break;
    if (j > a && detectar(x, j)?.tipo === 'verbo') break;
    if (t.w === 'mas' && T[j + 1]?.w === 'o' && T[j + 2]?.w === 'menos') { j += 3; continue; }
    if (SEPARADORES.has(t.w) && T[j - 1]?.tipo === 'n' && T[j + 1]?.tipo === 'n') { j++; continue; }
    if (esComa(t) || SEPARADORES.has(t.w)) {
      if (j > a && empiezaNegocio(x, j + 1, libre && !esComa(t))) { items.push([a, j]); a = j + 1; j++; continue; }
      if (SEPARADORES.has(t.w) && x.ent[j + 1]?.datos.some(d => d.que === 'tamano')) { items.push([a, j]); a = j + 1; j++; continue; }
      break;
    }
    const aqui = j > a ? lugarEn(x, j, false) : null;
    if (aqui && aqui.que !== 'calle') {
      items.push([a, j]);
      fin = listaDeLugares(x, j, 'incluir');
      a = fin;
      j = fin;
      break;
    }
    if (['en', 'in', 'de', 'del', 'of', 'from', 'at', 'across', 'throughout'].includes(t.w)) {
      let z = j + 1;
      while (z < x.n && ADJETIVOS_PREVIOS.has(T[z].w) && !x.ent[z]) z++;
      const L = lugarEn(x, z, true);
      if (L) {
        items.push([a, j]);
        marcar(x, j, z);
        fin = listaDeLugares(x, z, 'incluir');
        a = fin;
        j = fin;
        break;
      }
      if ((t.w === 'en' || t.w === 'in') && x.ent[z]?.datos.some(d => d.que === 'sector' && !d.general)) { items.push([a, j]); a = z; j = z; continue; }
      if (t.w === 'en' || t.w === 'in' || t.w === 'at') break;
    }
    // «en una empresa que vende paneles»: en un empleo, lo que va con «que» describe el lugar de trabajo.
    if (x.tipo === 'laboral' && ['que', 'that', 'which'].includes(t.w) && j > a) {
      let b = j + 1;
      while (b < x.n && b - j < 8 && !esFuerte(T[b]) && !esComa(T[b]) && !(['en', 'in'].includes(T[b].w) && lugarTras(x, b + 1))) b++;
      j = b;
      break;
    }
    if (['que', 'that', 'who', 'which', 'con', 'with', 'sin', 'without', 'cada', 'every', 'a', 'al', 'to', 'cerca', 'near', 'donde', 'where'].includes(t.w)) break;
    if ((t.w === 'para' || t.w === 'for') && deClientes) break;
    if (t.w === 'para' || t.w === 'for') break;
    j++;
  }
  if (j > a) items.push([a, j]);
  let usadoAlguno = false;
  for (const [ia, ib] of items) {
    if (ib <= ia) continue;
    if (x.tipo === 'laboral') {
      let desde = ia;
      while (desde > 0 && !x.usado[desde - 1] && ['un', 'una', 'el', 'la', 'los', 'las', 'unos', 'unas'].includes(T[desde - 1].w)) desde--;
      if (desde > 0 && !x.usado[desde - 1] && ['en', 'de', 'in', 'at', 'para'].includes(T[desde - 1].w)) desde--;
      agregarPrioridad(x, desde, ib);
      marcar(x, desde, ib);
      usadoAlguno = true;
      continue;
    }
    if (analizarNegocio(x, ia, ib, { libre })) { marcar(x, ia, ib); usadoAlguno = true; }
  }
  if (usadoAlguno) x.secuencia.push({ t: 'T' });
  return Math.max(j, fin);
}

// ---------- Exclusiones ----------
// Después de una coma, ¿sigue la misma lista de exclusiones? Solo si lo que viene es de la misma clase
// («excepto Moca, La Vega…» son lugares; «excepto colmados, bares…» son negocios), o empieza con «ni».
function claseDeExclusion(x, a, b) {
  for (let j = a; j < b; j++) {
    const L = lugarEn(x, j, true);
    if (L && L.que === 'zona') return 'zona';
    if (x.ent[j]) return 'otra';
  }
  return 'otra';
}

function siguiePalabraDeExclusion(x, k, clase) {
  const { T } = x;
  let j = k;
  if (T[j]?.w === 'ni' || T[j]?.w === 'tampoco' || T[j]?.w === 'nor') return true;
  if (['y', 'o', 'e', 'and', 'or'].includes(T[j]?.w)) j++;
  const t = T[j];
  if (!t || t.tipo === 's') return false;
  if ((t.w === 'los' || t.w === 'las') && T[j + 1] && !detectar(x, j + 1)) return clase !== 'zona';
  if (['en', 'a', 'al', 'de'].includes(t.w)) j++;
  const L = lugarEn(x, j, true);
  if (L && L.que === 'zona') return clase === 'zona';
  const e = x.ent[j];
  return clase !== 'zona' && Boolean(e && e.datos.some(d => ['sector', 'tamano', 'capcosa'].includes(d.que)));
}

function spanExcluir(x, i, d) {
  const { T } = x;
  const items = [];
  let a = d.fin;
  let j = d.fin;
  while (j < x.n && j - d.fin < 30) {
    const t = T[j];
    if (esFuerte(t)) break;
    if (esComa(t)) {
      if (siguiePalabraDeExclusion(x, j + 1, claseDeExclusion(x, items.length ? items[0][0] : a, j))) { items.push([a, j]); a = j + 1; j++; continue; }
      break;
    }
    if (SEPARADORES.has(t.w)) {
      if (T[j + 1]?.w === 'no' || detectar(x, j + 1)?.tipo === 'cap') break;
      items.push([a, j]);
      a = j + 1;
      j++;
      continue;
    }
    if (j > a && ['en', 'in', 'de', 'del'].includes(t.w)) {
      const L = lugarEn(x, j + 1 + (['la', 'el'].includes(T[j + 1]?.w) && !x.ent[j + 1] ? 1 : 0), true);
      const soloPreparacion = Array.from({ length: j - a }, (_, q) => T[a + q].w).every(w => RECORTE_EXCLUSION.has(w) || PREPOSICIONES_DE_EXCLUSION.has(w) || ARTICULOS.has(w) || ['que', 'los', 'las'].includes(w));
      if (L && L.que === 'zona' && !soloPreparacion && !(['los', 'las'].includes(T[a]?.w) && ['que', 'de'].includes(T[a + 1]?.w))) break;
    }
    const otro = j > a ? detectar(x, j) : null;
    if (otro && !(otro.tipo === 'condicion' && ['los', 'las'].includes(T[j - 1]?.w)) && !(otro.tipo === 'lugar') && !(otro.tipo === 'sin' && j === a)) break;
    if (['pero', 'sino', 'but', 'cada', 'every'].includes(t.w)) break;
    j++;
  }
  if (j > a) items.push([a, j]);
  marcar(x, i, d.fin);
  if (d.condicional) {
    // Con «a menos que…» solo vale si lo que sigue es algo conocido (un tamaño, un sector, un lugar).
    const antes = x.exclusiones.length;
    for (const [ia, ib] of items) analizarExclusion(x, ia, ib);
    if (x.exclusiones.length > antes) {
      x.exclusiones.length = antes;
      agregarDuda(x, 'texto', texto(x, i, j));
    }
    return j;
  }
  for (const [ia, ib] of items) analizarExclusion(x, ia, ib);
  return j;
}

function analizarExclusion(x, a, b) {
  const { T } = x;
  let s = a;
  let eliptico = false;
  while (s < b) {
    const w = T[s].w;
    if (RECORTE_EXCLUSION.has(w) && !x.ent[s]) { s++; continue; }
    if (PREPOSICIONES_DE_EXCLUSION.has(w) && !x.ent[s] && s + 1 < b && (x.ent[s + 1] || (ARTICULOS.has(T[s + 1].w) && x.ent[s + 2]) || ['los', 'las'].includes(T[s + 1].w))) { s++; continue; }
    if (ARTICULOS.has(w) && !x.ent[s]) {
      if (s + 1 < b && x.ent[s + 1]) { s++; continue; }
      eliptico = true;
    }
    break;
  }
  if (s >= b) { marcar(x, a, b); return; }
  // «los que estén en Navarrete», «los de Moca»: se excluye el lugar.
  if (eliptico) {
    let z = s + 1;
    if (T[z]?.w === 'que') z++;
    while (z < b && ['esten', 'este', 'estan', 'esta', 'quedan', 'queden', 'sean', 'son', 'ubicados', 'ubicadas'].includes(T[z].w)) z++;
    if (z < b && ['en', 'de', 'del', 'in'].includes(T[z].w)) {
      const L = lugarEn(x, z + 1, true);
      if (L && L.que === 'zona') {
        listaDeLugares(x, z + 1, 'excluir');
        marcar(x, a, b);
        return;
      }
    }
  }
  const sectores = [];
  const tamanos = [];
  const capacidades = [];
  const zonas = [];
  let paisVisto = false;
  const desconocidas = [];
  for (let j = s; j < b;) {
    const L = ['en', 'de', 'del', 'a', 'in'].includes(T[j - 1]?.w) || j === s ? lugarEn(x, j, true) : null;
    if (L && L.que === 'zona') { zonas.push(L.clave); j = L.fin; continue; }
    const e = x.ent[j];
    if (e) {
      const sector = e.datos.find(d => d.que === 'sector');
      const tamano = e.datos.find(d => d.que === 'tamano');
      const cosa = e.datos.find(d => d.que === 'capcosa');
      // «excepto empresas» a secas no dice nada: nunca se excluyen todas (la palabra general se ignora).
      if (sector && !sector.general) sectores.push(sector);
      else if (sector) { /* general: no cuenta */ }
      else if (tamano) tamanos.push(tamano.clave);
      else if (cosa) capacidades.push(cosa.clave);
      else if (e.datos.some(d => d.que === 'pais')) paisVisto = true;
      else desconocidas.push(j);
      j = e.fin;
      continue;
    }
    const v = buscarEn(T, j, CAP_VERBOS);
    if (v) { capacidades.push(v.datos[0].clave); j = v.fin; continue; }
    if (!esRelleno(T[j].w) && T[j].tipo !== 's') desconocidas.push(j);
    j++;
  }
  let ultimo = b;
  while (ultimo > s && (T[ultimo - 1].tipo === 's' || ['y', 'e', 'o', 'que', 'en', 'de', 'a'].includes(T[ultimo - 1].w))) ultimo--;
  const valorLibre = texto(x, s, ultimo);
  marcar(x, a, b);
  // Lo que no se puede guardar como clave se guarda tal como se escribió: «empresas del gobierno», «los de cadena»,
  // «bares» (que es solo una parte de «Restaurantes, bares y cafés») o «colmados en Santiago».
  const mezcla = (zonas.length && sectores.length) || sectores.length > 1;
  if (desconocidas.length || eliptico || mezcla) {
    if (capacidades.length && !desconocidas.length && !eliptico) { for (const c of capacidades) x.capNegadas.add(c); return; }
    if (valorLibre) x.exclusiones.push(valorLibre);
    return;
  }
  if (paisVisto && !zonas.length && !sectores.length && !tamanos.length && !capacidades.length) return;
  for (const c of capacidades) x.capNegadas.add(c);
  for (const z of zonas) x.zonasExcluidas.push(z);
  for (const t of tamanos) x.tamanosExcluidos.add(t);
  if (sectores.length === 1) {
    if (sectores[0].parcial) x.exclusiones.push(valorLibre);
    else x.sectoresExcluidos.push(sectores[0].clave);
  }
}

// ---------- Preferencias y condiciones ----------
function finDePreferencia(x, desde) {
  const { T } = x;
  let j = desde;
  while (j < x.n && j - desde < 30) {
    const t = T[j];
    if (esFuerte(t)) break;
    if (esComa(t)) {
      const k = j + 1;
      const sig = T[k];
      if (!sig || sig.tipo === 's' || detectar(x, k) || lugarEn(x, k, false) || (['en', 'in', 'de'].includes(sig.w) && lugarEn(x, k + 1, true))) break;
      if (sig.w === 'y' && (detectar(x, k + 1) && detectar(x, k + 1).tipo !== 'condicion')) break;
      j++;
      continue;
    }
    if (j > desde) {
      const d = detectar(x, j);
      if (d && !['condicion', 'sin', 'lugar', 'direccion'].includes(d.tipo) && !(d.tipo === 'salario' && x.tipo === 'comercial')) break;
      if (d && d.tipo === 'condicion' && d.clave === 'con' && T[j - 1]?.w === 'y') break;
    }
    if (['en', 'in', 'de', 'del'].includes(t.w)) {
      let z = j + 1;
      while (z < x.n && ADJETIVOS_PREVIOS.has(T[z].w) && !x.ent[z]) z++;
      const L = lugarEn(x, z, true);
      if (L && (L.que === 'zona' || L.que === 'pais') && t.w !== 'de') break;
      if (L && L.que === 'zona' && t.w === 'de' && x.tipo === 'comercial' && !x.ent[j - 1]) break;
    }
    if (['y', 'and'].includes(t.w) && (capacidadEn(x, j + 1) || frecuenciaEn(x, j + 1) || detectar(x, j + 1)?.tipo === 'verbo')) break;
    j++;
  }
  return j;
}

function spanPreferencia(x, i, desdeTexto, desdeContenido) {
  const { T } = x;
  const fin = finDePreferencia(x, desdeContenido);
  // «preferiblemente sin experiencia obligatoria» ya es «experiencia no obligatoria».
  const exp = buscarEn(T, desdeContenido, EXPERIENCIA);
  if (exp && exp.fin >= fin - 1) {
    x.experiencia = 'no_requerida';
  } else {
    for (let k = desdeContenido; k < fin; k++) {
      const s = datoDe(x, k, 'sector');
      if (s && !s.general) x.sectoresPrioridad.push(s.clave);
    }
    agregarPrioridad(x, desdeTexto, fin);
  }
  marcar(x, i, fin);
  return fin;
}

function spanCondicion(x, i, d) {
  const { T } = x;
  if (d.clave === 'sean') {
    // «que sean grandes», «que sean hoteles»: es lo que se busca, no una preferencia.
    const e = x.ent[d.fin];
    if (e && e.datos.some(dd => dd.que === 'tamano' || dd.que === 'sector')) {
      marcar(x, i, d.fin);
      return spanObjetivo(x, d.fin, { libre: false });
    }
  }
  let inicio = i;
  // «solo los que…» se guarda completo.
  if (['los', 'las'].includes(T[i - 1]?.w) && ['solo', 'solamente'].includes(T[i - 2]?.w)) inicio = i - 2;
  // «bilingüe», «remoto», «medio tiempo»: la condición es esa palabra sola.
  if (d.corta) {
    agregarPrioridad(x, inicio, d.fin);
    marcar(x, inicio, d.fin);
    return d.fin;
  }
  return spanPreferencia(x, inicio, inicio, d.fin);
}

function spanSin(x, i, d) {
  const { T } = x;
  const k = d.fin;
  const t = T[k];
  if (!t || t.tipo === 's') { marcar(x, i, d.fin); return d.fin; }
  // «sin mi permiso», «sin avisarme»: va con lo de contactar (que nunca se enciende solo).
  if ((POSESIVOS.has(t.w) && ['permiso', 'aprobacion', 'autorizacion', 'ok', 'visto'].includes(T[k + 1]?.w)) || ['avisarme', 'preguntarme', 'consultarme', 'permiso', 'asking'].includes(t.w)) {
    const fin = POSESIVOS.has(t.w) ? k + 2 : k + 1;
    marcar(x, i, fin);
    return fin;
  }
  const L = lugarEn(x, k, true);
  if (L && L.que === 'zona') {
    marcar(x, i, k);
    return listaDeLugares(x, k, 'excluir');
  }
  const anterior = T[i - 1];
  const sueltoDelObjetivo = !anterior || esFuerte(anterior) || esComa(anterior) || ['y', 'e', 'pero', 'and', 'but'].includes(anterior.w);
  if (sueltoDelObjetivo && x.ent[k]?.datos.some(dd => dd.que === 'sector' && !dd.general)) {
    return spanExcluir(x, i, { fin: k });
  }
  return spanPreferencia(x, i, i, k);
}

// ---------- Empleo (puesto) ----------
function spanPuesto(x, i, d) {
  const { T } = x;
  let s = d.fin;
  if (esComa(T[s])) s++;
  while (s < x.n && ['un', 'una', 'de', 'como', 'a', 'an', 'the', 'as', 'el', 'la'].includes(T[s].w) && T[s + 1] && T[s + 1].tipo === 'p') s++;
  let j = s;
  let palabras = 0;
  while (j < x.n && palabras < 8) {
    const t = T[j];
    if (t.tipo === 's') break;
    if (j > s) {
      const otro = detectar(x, j);
      if (otro && otro.tipo !== 'verbo') break;
      if (otro && otro.tipo === 'verbo') break;
    }
    if (['en', 'in', 'at'].includes(t.w)) {
      let z = j + 1;
      while (z < x.n && ['un', 'una', 'el', 'la', 'los', 'las', 'a', 'an', 'the'].includes(T[z].w)) z++;
      const sig = T[z];
      const sector = x.ent[z]?.datos.some(dd => dd.que === 'sector');
      const lugar = lugarEn(x, z, true);
      if (lugar && lugar.que !== 'calle') break;
      if (sig && (CAMPOS_DE_ESTUDIO.has(sig.w) || (sector && !lugar) || LUGARES_DE_TRABAJO.has(sig.w))) {
        const e = x.ent[z];
        j = e ? e.fin : z + 1;
        palabras += 2;
        continue;
      }
      break;
    }
    if (['de', 'del'].includes(t.w)) {
      const L = lugarEn(x, j + 1, true);
      if (L) break;
    }
    if (['que', 'con', 'sin', 'por', 'cerca', 'donde', 'pero', 'cada', 'with', 'that', 'near', 'for', 'paying', 'earning'].includes(t.w)) break;
    if (t.w === 'para' && !esInfinitivo(x, j + 1)) break;
    if (['o', 'y', 'u', 'e', 'or', 'and'].includes(t.w)) {
      const sig = T[j + 1];
      if (!sig || sig.tipo !== 'p' || ['en', 'que', 'de', 'in'].includes(sig.w) || lugarEn(x, j + 1, true) || detectar(x, j + 1)) break;
    }
    if (['a', 'to'].includes(t.w) && (T[j + 1]?.tipo === 'n' || ['rd$', 'us$', '$'].includes(T[j + 1]?.w))) break;
    if (t.tipo === 'n' || ['rd$', 'us$'].includes(t.w)) break;
    if (lugarEn(x, j, false)?.que === 'zona' && j > s) break;
    j++;
    palabras++;
  }
  let fin = j;
  while (fin > s && ['de', 'y', 'o', 'en', 'para', 'a', 'el', 'la', 'un', 'una', 'del', 'as', 'the', 'an'].includes(T[fin - 1].w)) fin--;
  const valor = texto(x, s, fin);
  const comp = comparable(valor);
  const soloRelleno = !comp || comp.split(' ').every(w => esRelleno(w) || ['as', 'como', 'job', 'jobs', 'work', 'trabajo', 'empleo', 'puesto'].includes(w));
  marcar(x, i, Math.max(fin, d.fin));
  if (!soloRelleno && !x.puesto) x.puesto = valor.slice(0, 120);
  else if (!soloRelleno && x.puesto && comparable(x.puesto) !== comp) agregarPrioridad(x, s, fin);
  return Math.max(fin, d.fin);
}

// ---------- Producto (lo que se vende) ----------
const PRODUCTO_RELLENO = new Set(['cosas', 'cosa', 'algo', 'productos', 'producto', 'servicios', 'servicio', 'mis servicios', 'mis productos', 'nuestros servicios',
  'nuestros productos', 'lo que vendo', 'lo que ofrezco', 'lo que tengo', 'de todo', 'stuff', 'things', 'products', 'services', 'my services', 'my products',
  'our services', 'our products', 'eso', 'esto', 'lo mio', 'mi producto', 'mi servicio', 'mis cosas', 'los', 'las', 'lo', 'them', 'it']);

function hayAMasAdelante(x, k) {
  for (let j = k; j < x.n && j - k < 10; j++) {
    const t = x.T[j];
    if (t.tipo === 's') return false;
    if (['a', 'al', 'to'].includes(t.w)) return true;
    if (['en', 'in', 'que', 'that', 'excepto'].includes(t.w)) return false;
  }
  return false;
}

function spanProducto(x, i, d) {
  const { T } = x;
  let s = d.fin;
  while (s < x.n && ['un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'a', 'an', 'the', 'some', 'tambien'].includes(T[s].w) && !['a', 'al'].includes(T[s].w)) s++;
  if (['a', 'al', 'to'].includes(T[s]?.w) && !['vendo', 'vende'].includes(d.frase || '')) { marcar(x, i, d.fin); x.ultimoProductoFin = d.fin; return d.fin; }
  if (['a', 'al', 'to'].includes(T[s]?.w)) { marcar(x, i, d.fin); x.ultimoProductoFin = d.fin; return d.fin; }
  // «clientes para mi negocio de uniformes», «clientes para mi taller de mecánica».
  if (POSESIVOS.has(T[s]?.w)) {
    const e = x.ent[s + 1];
    const sector = e?.datos.find(dd => dd.que === 'sector');
    if (sector && sector.general && ['de', 'of'].includes(T[e.fin]?.w)) { marcar(x, s, e.fin + 1); s = e.fin + 1; }
    else if (sector && !sector.general) {
      x.negocioPropio = texto(x, s + 1, e.fin);
      marcar(x, i, e.fin);
      x.ultimoProductoFin = e.fin;
      return e.fin;
    } else if (sector) { marcar(x, i, e.fin); x.ultimoProductoFin = e.fin; return e.fin; }
  }
  let j = s;
  let palabras = 0;
  while (j < x.n && palabras < 14) {
    const t = T[j];
    if (t.tipo === 's') break;
    if (t.w === 'al' && T[j + 1]?.w === 'por' && ['mayor', 'menor'].includes(T[j + 2]?.w)) { j += 3; palabras += 3; continue; }
    if (t.w === 'al' && ['detal', 'detalle'].includes(T[j + 1]?.w)) { j += 2; palabras += 2; continue; }
    if (['a', 'al', 'to'].includes(t.w)) break;
    if (t.w === 'para' || t.w === 'for') {
      if (esInfinitivo(x, j + 1) || hayAMasAdelante(x, j + 1)) { j++; palabras++; continue; }
      break;
    }
    if (['en', 'in', 'de', 'del', 'desde', 'across', 'throughout'].includes(t.w)) {
      let z = j + 1;
      while (z < x.n && ADJETIVOS_PREVIOS.has(T[z].w) && !x.ent[z]) z++;
      const L = lugarEn(x, z, true);
      if (L && L.que !== 'calle') {
        if ((t.w === 'de' || t.w === 'del') && j > s && L.que === 'zona') { j = L.fin; palabras++; continue; }
        break;
      }
    }
    if (j > s) {
      const otro = detectar(x, j);
      if (otro && !(otro.tipo === 'condicion' && otro.clave === 'con')) break;
    }
    if (['que', 'that', 'which', 'who', 'sin', 'without', 'pero', 'but', 'cada', 'every', 'donde', 'where', 'cerca'].includes(t.w)) break;
    if (SEPARADORES.has(t.w) && (detectar(x, j + 1) || T[j + 1]?.tipo === 's')) break;
    if (lugarEn(x, j, false)?.que === 'zona' && j > s) break;
    j++;
    palabras++;
  }
  let fin = j;
  while (fin > s && (['y', 'e', 'de', 'con', 'para', 'o', 'and', 'or', 'for', 'del', 'en'].includes(T[fin - 1].w) || T[fin - 1].tipo === 's')) fin--;
  const valor = texto(x, s, fin);
  marcar(x, i, Math.max(fin, d.fin));
  x.ultimoProductoFin = j;
  if (valor && !PRODUCTO_RELLENO.has(comparable(valor))) x.productos.push(valor);
  return j;
}

function spanPropio(x, i, d) {
  const { T } = x;
  let k = d.fin;
  if (x.ent[k]?.datos.some(dd => dd.que === 'tamano')) k = x.ent[k].fin;
  if (['propio', 'propia', 'pequeno', 'pequena', 'nuevo', 'nueva'].includes(T[k]?.w)) k++;
  if (!x.ent[k] && NEGOCIOS_PROPIOS.has(T[k]?.w)) {
    // «tengo una agencia de publicidad»: lo que va después de «de» es lo que se vende.
    marcar(x, i, k + 2);
    if (x.tipo === 'comercial') return spanProducto(x, k + 1, { fin: k + 2 });
    return k + 2;
  }
  const e = x.ent[k];
  const sector = e?.datos.find(dd => dd.que === 'sector');
  marcar(x, i, e.fin);
  if (sector.general) {
    if (['de', 'of'].includes(T[e.fin]?.w) && x.tipo === 'comercial') return spanProducto(x, e.fin, { fin: e.fin + 1 });
    return e.fin;
  }
  x.negocioPropio = texto(x, k, e.fin);
  return e.fin;
}

// ---------- Direcciones ----------
function spanDireccion(x, i, desde) {
  const { T } = x;
  let j = desde;
  let palabras = 0;
  while (j < x.n && palabras < 6) {
    const t = T[j];
    if (t.tipo === 's' && t.w !== '/' && t.w !== '#' && t.w !== '-') break;
    if (['en', 'in', 'de', 'del'].includes(t.w) && j > desde && lugarEn(x, j + 1, true)?.que === 'zona') break;
    if (['con', 'esq', 'esquina', 'y'].includes(t.w) && j > desde) { j++; continue; }
    if (j > desde && detectar(x, j) && !['direccion'].includes(detectar(x, j).tipo)) break;
    if (j > desde && t.tipo === 'p' && !t.mayus && !x.mayus && !x.ent[j] && esRelleno(t.w)) break;
    j++;
    palabras++;
  }
  marcar(x, i, j);
  return j;
}

// ---------- Recorrido ----------
function recorrer(x) {
  const { T } = x;
  let i = 0;
  while (i < x.n) {
    const t = T[i];
    if (t.tipo === 's' || x.usado[i]) { i++; continue; }
    // «Busco empleo en la capital, de cajero»: el empleo puede venir después de una coma.
    if (x.tipo === 'laboral' && !x.puesto && ['de', 'como'].includes(t.w) && (esComa(T[i - 1]) || x.usado[i - 1]) && T[i + 1]?.tipo === 'p'
      && !lugarEn(x, i + 1, true) && !detectar(x, i + 1) && !esRelleno(T[i + 1].w)) {
      i = Math.max(i + 1, spanPuesto(x, i, { fin: i }));
      continue;
    }
    // «en Pueblo Inventado y en Higuei»: después de «en», un nombre propio que no conozco es un lugar a preguntar.
    if (PREP_LUGAR_FUERTE.has(t.w) && !x.ent[i] && pareceLugar(x, i + 1)) {
      marcar(x, i, i + 1);
      i = listaDeLugares(x, i + 1, 'incluir');
      continue;
    }
    const d = detectar(x, i);
    const e = x.ent[i];
    if (d && (!e || d.fin >= e.fin)) { i = Math.max(i + 1, manejar(x, d, i)); continue; }
    if (e) {
      const j = manejarEntidad(x, i);
      if (j > i) { i = j; continue; }
    }
    const j = objetivoDesde(x, i);
    if (j > i) { i = j; continue; }
    i++;
  }
}

function manejar(x, d, i) {
  const { T } = x;
  switch (d.tipo) {
    case 'experiencia':
      x.experiencia = 'no_requerida';
      marcar(x, i, d.fin);
      return d.fin;
    case 'objetivo': {
      x.dudas.push({ clave: `objetivo_${d.clave}`, texto: '', sugerencias: [] });
      let a = i;
      while (a > 0 && !esFuerte(T[a - 1])) a--;
      let b = d.fin;
      while (b < x.n && !esFuerte(T[b])) b++;
      marcar(x, a, b);
      return b;
    }
    case 'solo':
      x.soloInvestigar = true;
      marcar(x, i, d.fin);
      return d.fin;
    case 'ciclo':
      // «Ciclo completo»: todo menos contactar, que se enciende a mano.
      x.cicloCompleto = true;
      x.contactarPedido = true;
      marcar(x, i, d.fin);
      return d.fin;
    case 'cap': {
      for (const c of d.claves) (d.neg ? x.capNegadas : x.capPedidas).add(c);
      if (!d.neg && d.enviar) x.contactarPedido = true;
      if (d.neg && d.enviar) x.capNegadas.add('contactar');
      if (x.capPedidas.has('contactar')) { x.capPedidas.delete('contactar'); x.contactarPedido = true; }
      marcar(x, i, d.fin);
      return finDeObjetoDeCapacidad(x, d.fin);
    }
    case 'frec':
      if (!d.neg) {
        if (d.nd) agregarDuda(x, 'frecuencia_no_disponible', texto(x, d.ini, d.fin));
        else x.frecuencias.push({ clave: d.clave, texto: texto(x, d.ini, d.fin), dia: d.dia });
      }
      marcar(x, i, d.fin);
      return d.fin;
    case 'telefono':
      x.supuestos.add('telefono');
      marcar(x, i, d.fin);
      return d.fin;
    case 'salario':
      if (d.tramo.soloPeriodo) agregarPrioridad(x, i, d.fin);
      else if (x.tipo === 'laboral') {
        x.tramosSalario.push({ ...d.tramo, texto: texto(x, i, d.fin) });
        for (const e of d.tramo.extras) agregarPrioridad(x, e.ini, e.fin);
      } else if (d.tramo.montos.length) agregarDuda(x, 'texto', texto(x, i, d.fin));
      marcar(x, i, d.fin);
      return d.fin;
    case 'excluir':
      return spanExcluir(x, i, d);
    case 'prioridad':
      return spanPreferencia(x, i, d.fin, d.fin);
    case 'lugar':
      marcar(x, i, d.fin);
      return listaDeLugares(x, d.fin, 'incluir');
    case 'condicion':
      return spanCondicion(x, i, d);
    case 'sin':
      return spanSin(x, i, d);
    case 'puesto':
      return spanPuesto(x, i, d);
    case 'producto':
      return spanProducto(x, i, d);
    case 'propio':
      return spanPropio(x, i, d);
    case 'cerca':
      return spanPreferencia(x, i, i, d.fin);
    case 'direccion': {
      const fin = spanDireccion(x, i, d.fin);
      agregarDuda(x, 'direccion', texto(x, i, fin));
      return fin;
    }
    default:
      marcar(x, i, d.fin);
      return d.fin;
  }
}

// Lo que va después de pedir algo: «a los gerentes», «por Gmail», «todavía».
function finDeObjetoDeCapacidad(x, k) {
  const { T } = x;
  let j = k;
  // «analiza cada hotel», «clasifica los negocios»: a quién se le hace (no cambia a quién se busca).
  if (['cada', 'los', 'las', 'todos', 'todas', 'esos', 'esas', 'ellos', 'each', 'every', 'all', 'the', 'those'].includes(T[j]?.w)
    && x.ent[j + 1]?.datos.some(d => d.que === 'sector')) {
    marcar(x, j, x.ent[j + 1].fin);
    j = x.ent[j + 1].fin;
  }
  for (let vueltas = 0; vueltas < 3; vueltas++) {
    if (['todavia', 'aun', 'ya', 'yet', 'for', 'now', 'them', 'tampoco', 'tambien', 'directamente'].includes(T[j]?.w)) { marcar(x, j, j + 1); j++; continue; }
    if (['a', 'al', 'to'].includes(T[j]?.w) && T[j + 1] && T[j + 1].tipo === 'p' && !x.ent[j + 1]?.datos.some(d => d.que === 'sector')) {
      let b = j + 1;
      while (b < x.n && b - j < 5 && T[b].tipo === 'p' && !detectar(x, b) && !lugarEn(x, b, false)) b++;
      marcar(x, j, b);
      j = b;
      continue;
    }
    if (['por', 'via', 'by', 'con', 'en'].includes(T[j]?.w) && ['gmail', 'correo', 'email', 'whatsapp', 'telefono', 'llamada', 'mensaje', 'outlook', 'phone', 'mail'].includes(T[j + 1]?.w)) {
      marcar(x, j, j + 2);
      j += 2;
      continue;
    }
    break;
  }
  return j;
}

function manejarEntidad(x, i) {
  const { T } = x;
  const L = lugarEn(x, i, false);
  if (L) {
    if (L.que === 'calle') {
      const interseccion = ['con', 'esq', 'esquina'].includes(T[L.fin]?.w);
      if (L.explicita || interseccion || !L.provincia) {
        if (!L.comoCalle && !PREP_LUGAR.has(T[i - 1]?.w)) return i;
        const desde = ['la', 'el'].includes(T[i - 1]?.w) && !x.usado[i - 1] ? i - 1 : i;
        const fin = spanDireccion(x, desde, i);
        agregarDuda(x, 'direccion', texto(x, desde, fin));
        return fin;
      }
      if (!L.comoCalle && !PREP_LUGAR.has(T[i - 1]?.w)) return i;
      const fin = guardarLugar(x, L, i, L.fin, 'incluir');
      marcar(x, i, fin);
      return fin;
    }
    return listaDeLugares(x, i, 'incluir');
  }
  const e = x.ent[i];
  if (e.datos.some(d => d.que === 'fuente')) {
    let fin = e.fin;
    const partes = [texto(x, i, e.fin)];
    while (SEPARADORES.has(T[fin]?.w) || esComa(T[fin])) {
      const otra = x.ent[fin + 1];
      if (!otra?.datos.some(d => d.que === 'fuente')) break;
      partes.push(texto(x, fin + 1, otra.fin));
      fin = otra.fin;
    }
    agregarDuda(x, 'fuente', partes.join(', '));
    marcar(x, i, fin);
    return fin;
  }
  if (e.datos.some(d => d.que === 'sector') || e.datos.some(d => d.que === 'tamano' && d.empresa)) return spanObjetivo(x, i, { libre: false });
  const tamano = e.datos.find(d => d.que === 'tamano');
  if (tamano && x.tipo === 'comercial') {
    x.tamanos.add(tamano.clave);
    marcar(x, i, e.fin);
    return e.fin;
  }
  if (e.datos.some(d => d.que === 'producto') && x.tipo === 'comercial') return spanProducto(x, i, { fin: i });
  return i;
}

// «a hoteles», «para clínicas», «encontrar restaurantes», «quiero hoteles»…
const OBJETIVO_TRIG = indice(['a', 'al', 'para', 'to', 'for', 'encontrar', 'encuentra', 'encuentrame', 'busca', 'buscar', 'buscame', 'busques', 'find',
  'conseguir', 'consigueme', 'venderle a', 'venderles a', 'vender a', 'venderle', 'venderles', 'dirigido a', 'enfocado en', 'clientes como', 'targeting',
  'looking for', 'enfocate en', 'apunta a', 'llegar a', 'llegarle a', 'reach']);

function objetivoDesde(x, i) {
  const { T } = x;
  const m = buscarEn(T, i, OBJETIVO_TRIG);
  if (!m) return i;
  if (x.tipo !== 'comercial') return i;
  let k = m.fin;
  while (k < x.n && ['los', 'las', 'unos', 'unas', 'el', 'la', 'me', 'nuevos', 'nuevas', 'clientes', 'cliente', 'the', 'some', 'new'].includes(T[k].w) && !x.ent[k]) k++;
  const e = x.ent[k];
  const esNegocio = e && e.datos.some(d => d.que === 'sector' || d.que === 'tamano');
  const tras = x.usado[i - 1] && x.ultimoProductoFin >= i - 1 && x.ultimoProductoFin <= i;
  const libre = tras && ['a', 'al', 'para', 'to', 'for'].includes(m.datos[0].frase);
  if (!esNegocio) {
    if (!libre || !T[k] || T[k].tipo !== 'p' || esRelleno(T[k].w) || detectar(x, k) || esInfinitivo(x, k) || lugarEn(x, k, true)) return i;
  }
  marcar(x, i, k);
  const deClientes = ['clientes', 'cliente'].includes(T[k - 1]?.w);
  const fin = spanObjetivo(x, k, { libre, deClientes });
  // «clientes empresariales … para catering»: lo que va después de «para» es lo que se vende.
  if (deClientes && ['para', 'for'].includes(T[fin]?.w) && x.tipo === 'comercial') return spanProducto(x, fin, { fin: fin + 1 });
  return fin;
}

// ---------- Lo que nadie usó ----------
function sobrantes(x) {
  const { T } = x;
  let i = 0;
  while (i < x.n) {
    if (x.usado[i] || T[i].tipo === 's') { i++; continue; }
    const f = buscarEn(T, i, FRASES_RELLENO);
    if (f) { marcar(x, i, f.fin); i = f.fin; continue; }
    let j = i;
    while (j < x.n && !x.usado[j] && (T[j].tipo !== 's' || ['-', '/', '%', '#', '+', '$'].includes(T[j].w))) {
      const f2 = j > i ? buscarEn(T, j, FRASES_RELLENO) : null;
      if (f2) break;
      j++;
    }
    const conSentido = [];
    for (let k = i; k < j; k++) if (T[k].tipo !== 's' && !esRelleno(T[k].w) && T[k].w.length > 1) conSentido.push(k);
    if (conSentido.length) {
      let a = i;
      let b = j;
      while (a < b && ['y', 'e', 'o', 'pero', 'que', 'and', 'or', 'but', 'also', 'tambien', 'ademas'].includes(T[a].w)) a++;
      while (b > a && T[b - 1].tipo === 's') b--;
      const valor = texto(x, a, b);
      const previa = T[a]?.w;
      const lugar = (PREP_LUGAR_FUERTE.has(previa) || PREP_LUGAR_FUERTE.has(T[a - 1]?.w)) && !x.mayus && conSentido.length <= 3
        && conSentido.every(k => T[k].mayus || /^[A-Z]{2,4}$/.test(x.original.slice(T[k].ini, T[k].fin)));
      const sugerencias = x.dudas.length < MAXIMO_DE_DUDAS && conSentido.length <= 3 ? sugerenciasDeLugar(texto(x, conSentido[0], conSentido[conSentido.length - 1] + 1)) : [];
      const trasPreposicion = PREP_LUGAR_FUERTE.has(T[conSentido[0] - 1]?.w) && conSentido.length <= 3;
      if (lugar || (sugerencias.length && trasPreposicion)) {
        // «la Esperanza»: el artículo va con el nombre (así se distingue de Esperanza, en Valverde).
        const desde = ARTICULOS.has(T[conSentido[0] - 1]?.w) && conSentido[0] - 1 >= a ? conSentido[0] - 1 : conSentido[0];
        const nombre = texto(x, desde, conSentido[conSentido.length - 1] + 1);
        if (x.zonasLibres.length < 30) x.zonasLibres.push(nombre);
        agregarDuda(x, 'lugar', nombre, sugerencias);
      } else agregarDuda(x, 'texto', valor);
    }
    i = Math.max(j, i + 1);
  }
}

// ---------- Leer todo ----------
export function leer(original) {
  const x = nuevoEstado(original);
  const tipo = decidirTipo(x);
  x.tipo = tipo.tipo;
  if (tipo.supuesto) x.supuestos.add(tipo.supuesto);
  if (tipo.duda) agregarDuda(x, 'tipo', '');
  recorrer(x);
  sobrantes(x);
  // «en Punta Cana a hoteles y en Santiago a fábricas»: cada lugar con su negocio no se puede guardar así.
  // Se juntan los grupos seguidos del mismo tipo; si hay T Z T Z (o Z T Z T) con lugares distintos, se pregunta.
  const grupos = [];
  for (const g of x.secuencia) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.t === g.t) { if (g.claves) ultimo.claves.push(...g.claves); } else grupos.push({ t: g.t, claves: [...(g.claves || [])] });
  }
  const zonasDeGrupos = grupos.filter(g => g.t === 'Z').map(g => g.claves.slice().sort().join());
  const patron = grupos.map(g => g.t).join('');
  if (x.tipo === 'comercial' && (patron.includes('ZTZT') || patron.includes('TZTZ')) && new Set(zonasDeGrupos).size > 1) agregarDuda(x, 'combinacion', '');
  return x;
}

// ---------- Para el formulario: leer un pedazo suelto ----------
// «empresas de seguridad» → libre; «Hoteles» → hoteles; «hoteles y bares» → hoteles y restaurantes.
export function negociosDeTexto(valor) {
  const x = nuevoEstado(String(valor ?? ''));
  x.tipo = 'comercial';
  const fin = x.n ? spanObjetivo(x, 0, { libre: true }) : 0;
  let resto = false;
  for (let k = fin; k < x.n; k++) if (!x.usado[k] && x.T[k].tipo !== 's' && !esRelleno(x.T[k].w)) resto = true;
  for (let k = 0; k < fin; k++) if (!x.usado[k] && x.T[k].tipo !== 's' && !esRelleno(x.T[k].w)) resto = true;
  if (resto) return { claves: [], libres: [String(valor).trim()], todas: false };
  return { claves: x.sectores, libres: x.sectoresLibres, todas: x.general.visto && !x.sectores.length && !x.sectoresLibres.length };
}

// «Santiago», «La Vega y Moca», «todo el país», «Miami». Si hay algo que no es un lugar conocido, va entero como texto.
export function lugaresDeTexto(valor) {
  const x = nuevoEstado(String(valor ?? ''));
  const claves = [];
  let pais = false;
  let extranjero = false;
  let desconocido = false;
  for (let i = 0; i < x.n;) {
    const t = x.T[i];
    const L = t.tipo === 's' ? null : lugarEn(x, i, true);
    if (!L && (t.tipo === 's' || SEPARADORES.has(t.w) || ['en', 'de', 'del', 'in', 'provincia', 'municipio'].includes(t.w) || ADJETIVOS_PREVIOS.has(t.w))) { i++; continue; }
    if (L && L.que === 'zona') { claves.push(L.clave); i = L.fin; continue; }
    if (L && L.que === 'pais') { pais = true; i = L.fin; continue; }
    if (L && L.que === 'extranjero') { extranjero = true; i = L.fin; continue; }
    if (!esRelleno(t.w)) desconocido = true;
    i++;
  }
  if (desconocido || extranjero) return { claves: [], pais: false, libre: String(valor).trim() };
  return { claves, pais, libre: null };
}

// Lo que se escribe a mano en «Excluir». Devuelve { sectores, zonas, libres }.
export function exclusionDeTexto(valor) {
  const x = nuevoEstado(String(valor ?? ''));
  x.tipo = 'comercial';
  if (x.n) analizarExclusion(x, 0, x.n);
  const libres = [...x.exclusiones];
  for (const t of x.tamanosExcluidos) libres.push(String(valor).trim());
  for (const c of x.capNegadas) libres.push(String(valor).trim());
  if (x.sectoresExcluidos.length && x.zonasExcluidas.length) return { sectores: [], zonas: [], libres: [String(valor).trim()] };
  return { sectores: x.sectoresExcluidos, zonas: x.zonasExcluidas, libres: [...new Set(libres)] };
}

// ¿El texto nombra un lugar de fuera del país?
export function esExtranjero(valor) {
  const x = nuevoEstado(String(valor ?? ''));
  for (let i = 0; i < x.n; i++) if (x.ent[i]?.datos.some(d => d.que === 'extranjero')) return true;
  return false;
}

// Claves de producto dentro de lo que se vende. Lo que va después de «para» o «a» no es producto.
export function clavesDeProducto(valor) {
  const x = nuevoEstado(String(valor ?? ''));
  const claves = [];
  for (let i = 0; i < x.n; i++) {
    if (['para', 'a', 'al', 'to', 'for'].includes(x.T[i].w)) break;
    const d = datoDe(x, i, 'producto');
    if (d && !claves.includes(d.clave)) claves.push(d.clave);
    if (x.ent[i]) i = x.ent[i].fin - 1;
  }
  return claves;
}
