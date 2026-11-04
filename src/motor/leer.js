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
  FUENTES_CON_NOMBRE, CARDINALES, DIFUSOS, FRECUENCIAS_NO_DISPONIBLES_SUELTAS,
} from './diccionarios.js';
import { tokenizar, crearIndice, buscarEn, comparable, distancia, todoEnMayusculas } from './texto.js';
import { salarioEn, esTelefono, finDeTelefono, PALABRAS_SALARIO, UNIDADES, horarioEn, PERIODOS } from './salario.js';

// ---------- Índices (se arman una sola vez al cargar) ----------
const indice = (lista, dato = {}) => crearIndice(lista.map(frase => ({ frase, dato: { ...dato, frase } })));
const indicePorClave = pares => crearIndice(pares.flatMap(([dato, frases]) => frases.map(frase => ({ frase, dato: { ...dato, frase } }))));

const GENERALES_EXTRA = ['todo el que', 'todos los que', 'cualquiera que', 'cualquier persona', 'anyone', 'everyone', 'empresarial', 'empresariales', 'corporativo', 'corporativos',
  // «a cualquiera menos bancas», «cualquier negocio sirve»: todos los negocios.
  'cualquiera', 'cualquiera sirve', 'cualquier negocio sirve', 'cualquier empresa sirve', 'cualquier negocio me sirve', 'any business', 'any kind of business',
  'any type of business'];

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
  ...ZONAS.flatMap(z => z.palabras.map(frase => ({ frase, dato: { que: 'zona', clave: z.clave, tipo: z.tipo, ambigua: (z.ambiguas || []).includes(frase),
    // «Las Matas» se pregunta; «Las Matas de Farfán», con el nombre entero, no.
    homonimo: Boolean(z.homonimo) && (!(z.ambiguas || []).length || z.ambiguas.includes(frase)), cardinal: z.tipo === 'region' && CARDINALES.includes(frase) } }))),
  ...DIFUSOS.flatMap(d => d.palabras.map(frase => ({ frase, dato: { que: 'difuso', sugerencias: d.sugerencias } }))),
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
  'i have no experience', 'experience not required', 'i dont have experience', 'i do not have experience', 'dont have experience',
  'que no me pidan experiencia', 'que no me exijan experiencia', 'no me pidan experiencia', 'que no me pidan mucha experiencia',
  'i dont have any experience', 'no tengo experiencia previa', 'no tengo mucha experiencia']);
const OBJETIVOS = crearIndice(OBJETIVOS_NO_DISPONIBLES.flatMap(o => o.palabras.map(frase => ({ frase, dato: { clave: o.clave } }))));
const SOLO = indice(SOLO_INVESTIGAR);
const CICLO = indice(['ciclo completo', 'el ciclo completo', 'todo el ciclo', 'full cycle', 'the full cycle', 'hazlo todo', 'haz todo']);
const NADIE = indice(['sin enviar nada', 'no envies nada', 'no mandes nada', 'sin mandar nada', 'no contactes a nadie', 'sin contactar a nadie',
  'no contactar a nadie', 'no le escribas a nadie', 'no llames a nadie', 'dont send anything', 'do not send anything', 'dont contact anyone',
  'do not contact anyone', 'dont contact anybody', 'sin escribirle a nadie', 'sin escribirles a nadie', 'sin llamar a nadie', 'sin hablarle a nadie',
  'sin mandarle nada a nadie', 'no le mandes nada a nadie', 'no le escribas a ninguno', 'without contacting anyone', 'no me mandes nada', 'no me envies nada',
  'no le mandes nada', 'no les mandes nada', 'no les envies nada']);
const CAP_VERBOS = crearIndice(CAPACIDADES.flatMap(c => c.verbos.map(frase => ({ frase, dato: { clave: c.clave, frase } }))));
// «llámalos», «call them», «por WhatsApp»: contactar por teléfono o por WhatsApp todavía no existe.
// Lo que pide hacer, como verbo o como cosa («recomienda», «recomendaciones», «propuesta»).
const CAP_PALABRAS = indice(CAPACIDADES.flatMap(c => [...c.verbos, ...c.cosas]));
const POR_TELEFONO = /^(llam|call|telefon|whatsapp|wasap|phone)/;
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
const FREC_ND_SUELTAS = indice(FRECUENCIAS_NO_DISPONIBLES_SUELTAS);
// «dos veces a la semana», «3 veces al día», «5 times a week»: todavía no existen.
const VECES = new Set(['dos', 'tres', 'cuatro', 'cinco', 'seis', 'varias', 'muchas', 'two', 'three', 'four', 'five', 'several']);
const PERIODO_DE_VECES = indice(['a la semana', 'por semana', 'en la semana', 'al dia', 'por dia', 'en el dia', 'al mes', 'por mes', 'en el mes', 'a la quincena',
  'al ano', 'por ano', 'a week', 'per week', 'a day', 'per day', 'a month', 'per month', 'a year', 'per year']);
const VERBOS_REVISAR = new Set(VERBOS_DE_REVISAR);
const DIAS = new Set(DIAS_DE_LA_SEMANA);

const EXCLUIR = crearIndice([
  ...['excepto', 'exceptuando', 'salvo', 'no quiero', 'no deseo', 'no me interesa', 'no me interesan', 'no me gusta', 'no me gustan', 'no incluyas',
    'no incluir', 'no busques', 'no buscar', 'que no sea', 'que no sean', 'que no son', 'que no es', 'que no esten', 'que no este', 'que no estan',
    'sin incluir', 'sin contar', 'nada de', 'fuera de', 'excluye', 'excluyendo', 'excluir', 'excluyan', 'evita', 'evitar', 'evitando', 'quitando',
    'tampoco', 'except', 'excepting', 'excluding', 'exclude', 'not including', 'other than', 'dont want', 'do not want', 'dont include', 'avoid',
    'except for', 'apart from', 'menos en', 'menos a', 'menos los', 'menos las', 'menos el', 'menos la', 'a excepcion de', 'a excepcion del',
    'con excepcion de', 'con la excepcion de', 'excepcion de', 'with the exception of', 'olvidate de', 'olvidate', 'olvidense de', 'olvida', 'forget',
    'forget about', 'no me mandes', 'no me pongas', 'no me traigas', 'no me incluyas', 'no me muestres', 'no me des', 'no me envies', 'no me busques',
    'nada en', 'ningun', 'ninguna', 'ningunos', 'ningunas', 'not interested in', 'im not interested in', 'i am not interested in', 'no interest in',
    'dont look in', 'do not look in', 'dont search in', 'do not search in', 'dont look for', 'skip', 'skip the', 'besides', 'leave out',
    'do not look for', 'dont search for', 'do not search for', 'dont find', 'do not find', 'instead of', 'rather than', 'dont care about',
    'i dont care about', 'do not care about', 'i do not care about', 'en vez de', 'en lugar de',
    'no vendo a', 'no le vendo a', 'no les vendo a', 'no vendemos a', 'no le vendemos a', 'no les vendemos a', 'dont sell to', 'do not sell to',
    'i dont sell to', 'we dont sell to', 'i do not sell to', 'we do not sell to', 'dont want to work with', 'do not want to work with',
    'dont want to work at', 'dont want to work in', 'dont want to work for', 'do not want to work at', 'i dont want to work', 'no quiero trabajar',
    'no quiero trabajar con', 'no quiero trabajar en', 'no quiero nada con',
    // «no trabajamos en Puerto Plata», «we don't work in Moca», «we don't do Moca»: donde no trabaja no se busca.
    'no trabajamos en', 'no trabajo en', 'no vendemos en', 'no vendo en', 'no cubrimos', 'we dont work in', 'i dont work in',
    'dont work in', 'we do not work in', 'i do not work in', 'do not work in', 'we dont do', 'i dont do', 'we dont sell in', 'i dont sell in', 'dont sell in',
    'we do not sell in', 'we dont cover', 'we dont serve', 'we dont go to', 'i dont go to'].map(frase => ({ frase, dato: { frase } })),
  { frase: 'menos', dato: { frase: 'menos', menos: true } },
  // «a menos que sean pequeños», «unless»: excluye lo que sigue; si lo que sigue no se entiende, se pregunta.
  ...['a menos que', 'unless', 'excepto si', 'salvo que', 'excepto que'].map(frase => ({ frase, dato: { frase, condicional: true } })),
  ...['no', 'ni', 'y no', 'pero no', 'not', 'but not', 'and not', 'nor', 'no to', 'not to', 'not in', 'nunca', 'jamas', 'never', 'nunca a', 'jamas a',
    'nunca en', 'jamas en', 'never to', 'never in', 'pero nunca', 'but never'].map(frase => ({ frase, dato: { frase, generico: true } })),
]);
const INICIO_DE_EXCLUSION = new Set(['a', 'al', 'en', 'de', 'del', 'para', 'los', 'las', 'el', 'la', 'un', 'una', 'to', 'in', 'at', 'the', 'any', 'sea', 'sean',
  'es', 'son', 'este', 'esten', 'trabajar', 'trabajo', 'vender', 'venderle', 'venderles', 'con', 'for']);
const PRIORIDAD = indice(['prioriza', 'priorizar', 'prioriza a', 'priorizame', 'dale prioridad a', 'da prioridad a', 'dar prioridad a', 'prioridad a', 'prioridad para',
  'con prioridad a', 'preferiblemente', 'preferentemente', 'de preferencia', 'sobre todo', 'especialmente', 'en especial', 'prefiero', 'preferimos',
  'mejor si', 'idealmente', 'principalmente', 'en particular', 'prioritize', 'prioritise', 'especially', 'preferably', 'ideally', 'mainly', 'above all',
  'mostly', 'in particular', 'me interesan mas', 'me interesa mas', 'me interesan sobre todo', 'los que mas me interesan son', 'las que mas me interesan son',
  'lo que mas me interesa es', 'lo que mas me interesa son', 'los que mas me interesan', 'las que mas me interesan', 'empieza por', 'empieza con',
  'empezando por', 'comienza por', 'comienza con', 'primero los', 'primero las', 'primero a los', 'primero a las', 'lo primero que quiero son',
  'lo primero que quiero es', 'lo primero son', 'me gustan mas', 'start with', 'begin with', 'more interested in', 'im more interested in',
  'i am more interested in', 'mas que nada', 'more than anything', 'most of all', 'la prioridad son', 'la prioridad es', 'mi prioridad son', 'mi prioridad es',
  'mis prioridades son', 'nuestra prioridad es', 'nuestra prioridad son', 'la prioridad seria', 'my priority is', 'our priority is', 'the priority is']);
const CONDICION = indicePorClave([
  [{ clave: 'tener' }, ['que tengan', 'que tenga', 'que tienen', 'que tiene', 'que no tengan', 'que no tenga', 'que no tienen', 'que no tiene', 'que hayan',
    'que haya', 'que cuenten con', 'que cuente con', 'que manejen', 'que usen', 'que utilicen', 'que facturen', 'que vendan', 'que ofrezcan',
    'que trabajen con', 'que quieran', 'que busquen', 'que esten buscando', 'que esten abriendo', 'que estan abriendo', 'que abran', 'que paguen',
    'que pague', 'que esten', 'que este', 'que estan', 'que abren',
    'solo los que', 'solo las que', 'solamente los que', 'solamente las que', 'solo aquellos que', 'solo aquellas que', 'that have', 'that has',
    'that dont have', 'that do not have', 'that use', 'only those that', 'only ones that', 'with more than', 'with at least', 'with less than']],
  [{ clave: 'sean' }, ['que sean', 'que sea', 'que son', 'that are']],
  [{ clave: 'con' }, ['con', 'with']],
  [{ clave: 'laboral', corta: true }, ['remoto', 'remota', 'a distancia', 'desde casa', 'desde mi casa', 'medio tiempo', 'de medio tiempo', 'tiempo completo',
    'a tiempo completo', 'tiempo parcial', 'part time', 'full time', 'remote', 'from home', 'presencial', 'bilingue', 'bilingual', 'fines de semana',
    'los fines de semana', 'weekends', 'de noche', 'de dia', 'nocturno', 'diurno', 'con propinas', 'seguro medico', 'con seguro medico', 'con beneficios',
    'con vehiculo propio', 'con carro propio', 'con moto propia',
    // Modalidad: «híbrido», «online», «teletrabajo» (como «remoto»).
    'hibrido', 'hibrida', 'online', 'en linea', 'teletrabajo', 'de teletrabajo', 'virtual', 'hybrid', 'telecommuting', 'work from home',
    // Horarios: «en las tardes», «por las noches», «tardes» («buenas tardes» es un saludo; ver condicionValida).
    'noches', 'las noches', 'en las noches', 'por las noches', 'en la noche', 'por la noche', 'tardes', 'las tardes', 'en las tardes', 'por las tardes',
    'en la tarde', 'por la tarde', 'de tarde', 'mananas', 'las mananas', 'en las mananas', 'por las mananas', 'en la manana', 'por la manana',
    'de madrugada', 'en la madrugada', 'nights', 'at night', 'evenings', 'in the evenings', 'in the evening', 'mornings', 'in the mornings',
    'in the morning', 'afternoons', 'in the afternoons', 'in the afternoon', 'night shift', 'turno de noche', 'turno de la noche', 'turno de tarde',
    'turno de la tarde', 'turno de manana', 'turno de la manana']],
  [{ clave: 'laboral' }, ['con licencia', 'turno', 'turnos', 'horario', 'jornada', 'tengo experiencia', 'tengo mucha experiencia', 'con experiencia', 'with experience', 'i have experience']],
]);
const SIN = indice(['sin', 'without']);
// «menos de 1 hora de viaje», «más de 20 empleados»: una condición, no un salario.
const CANTIDAD = indice(['menos de', 'mas de', 'a menos de', 'no mas de', 'maximo', 'como maximo', 'hasta', 'al menos', 'por lo menos', 'minimo',
  'como minimo', 'more than', 'less than', 'at least', 'up to', 'within', 'under', 'over']);
const PUESTO = indicePorClave([
  [{}, ['trabajo de', 'trabajo como', 'trabajos de', 'empleo de', 'empleo como', 'empleos de', 'empleos como', 'puesto de', 'puestos de', 'plazas de', 'vacante de',
    'vacantes de', 'trabajar de', 'trabajar como', 'chiripa de', 'chiripas de', 'chance de', 'plaza de', 'cargo de', 'job as', 'jobs as', 'work as',
    'working as', 'position as', 'job as a', 'job as an', 'work as a', 'work as an', 'a job as', 'a job as a', 'a job as an', 'trabajando de',
    'trabajando como', 'chamba de', 'chambita de', 'pega de', 'camello de', 'trabajito de', 'empleito de', 'jobs for', 'job for',
    'pasantia de', 'pasantias de', 'pasantia como', 'practicas profesionales de', 'practica profesional de', 'practicas de', 'practica de',
    'internship as', 'internship as a', 'internship as an', 'an internship as', 'internship for']],
  [{ desnudo: true }, ['empleo', 'empleos', 'trabajo', 'puesto', 'cargo', 'job', 'position', 'chamba', 'chambita', 'pega', 'camello', 'trabajito', 'empleito']],
]);
const PRODUCTO = indice(['vendo', 'vende', 'vendemos', 'venden', 'ofrezco', 'ofrecemos', 'ofrece', 'ofrecen', 'brindo', 'brindamos', 'distribuyo',
  'distribuimos', 'exporto', 'exportamos', 'instalo', 'instalamos', 'fabrico', 'fabricamos', 'reparo', 'reparamos', 'arreglo', 'arreglamos', 'doy servicio de', 'doy servicios de', 'damos servicio de', 'damos servicios de',
  'quiero vender', 'queremos vender', 'quiero venderle', 'quiero venderles', 'queremos venderle', 'queremos venderles', 'venderle', 'venderles', 'i install', 'we install',
  'needing', 'that needs', 'who needs', 'in need of', 'que requieran', 'que requieren', 'que necesiten', 'que necesitan', 'que puedan necesitar',
  'puedan necesitar', 'que podrian necesitar', 'que quieran comprar', 'i sell', 'we sell', 'sell', 'sells', 'selling', 'i offer', 'we offer', 'offer', 'offers', 'that need', 'that may need',
  'who need', 'that might need', 'which need', 'clientes para', 'customers for', 'clients for', 'buyers for', 'compradores para', 'me dedico a vender',
  'nos dedicamos a vender', 'me dedico a la venta de', 'nos dedicamos a la venta de', 'trabajo vendiendo', 'vendiendo', 'soy distribuidor de',
  'soy distribuidora de', 'somos distribuidores de', 'distribuidor de', 'distribuidora de',
  // «Busco quien me compre mangos», «clientes que me compren pan»: lo que le compren es lo que vende.
  'quien me compre', 'quienes me compren', 'alguien que me compre', 'gente que me compre', 'que me compre', 'que me compren', 'who will buy my', 'someone to buy my']);
const PROPIO = indice(['tengo un', 'tengo una', 'tenemos un', 'tenemos una', 'soy dueno de un', 'soy dueno de una', 'soy duena de un', 'soy duena de una',
  'soy dueno de', 'soy duena de', 'soy el dueno de', 'soy la duena de', 'soy el dueno de un', 'soy el dueno de una', 'soy la duena de un', 'soy la duena de una',
  'somos los duenos de', 'somos duenos de', 'i own', 'im the owner of', 'i am the owner of',
  'mi', 'nuestro', 'nuestra', 'my', 'our', 'i have a', 'i own a', 'i run a', 'we have a', 'we run a', 'tengo mi', 'tengo mi propio', 'tengo mi propia']);
const CERCA = indice(['cerca de', 'cerca del', 'cerquita de', 'cerquita del', 'alrededor de', 'alrededor del', 'por la zona de', 'por los alrededores de', 'near', 'close to', 'around']);
const DIRECCION = indice(['avenida', 'av', 'ave', 'avda', 'calle', 'autopista', 'carretera', 'esquina', 'esq', 'edificio', 'edif', 'plaza', 'torre',
  'residencial', 'urbanizacion', 'urb', 'kilometro', 'km', 'callejon', 'manzana', 'street', 'avenue', 'road']);
const CALLE_PREVIA = new Set(['avenida', 'av', 'ave', 'avda', 'calle', 'autopista', 'carretera', 'esquina', 'esq', 'plaza', 'edificio', 'edif', 'torre',
  'residencial', 'res', 'urbanizacion', 'urb', 'parque', 'paseo', 'puente', 'aeropuerto', 'malecon', 'street', 'avenue', 'road', 'km', 'kilometro',
  'callejon', 'manzana', 'colegio', 'universidad', 'hospital', 'clinica', 'farmacia', 'supermercado', 'hotel', 'banco', 'club', 'liceo', 'escuela', 'ensanche',
  'reparto', 'barrio']);
const LUGAR_TRIG = indice(['que esten en', 'que este en', 'que estan en', 'que esta en', 'que quedan en', 'que queden en', 'ubicados en', 'ubicadas en',
  'ubicado en', 'ubicada en', 'localizados en', 'situados en', 'located in', 'based in', 'que sea en', 'que sean en', 'la zona de', 'zona de',
  'el area de', 'area de', 'the area of', 'el sector de']);
const PERO = indice(['pero', 'sino', 'aunque', 'but', 'however']);
const VERBOS = indice(['quiero', 'queremos', 'quisiera', 'necesito', 'necesitamos', 'deseo', 'busco', 'buscamos', 'i want', 'we want', 'i need', 'we need',
  'please', 'por favor', 'quiero que', 'me gustaria', 'ayudame a', 'help me', 'i would like', 'id like']);
// «los talleres no me interesan», «bancos no», «bares tampoco»: la negación va después de lo que se niega.
const NEG_DESPUES = indice(['no', 'tampoco', 'no me interesa', 'no me interesan', 'no me gusta', 'no me gustan', 'no me sirve', 'no me sirven',
  'no me conviene', 'no me convienen', 'tampoco me interesa', 'tampoco me interesan', 'no gracias', 'ni hablar', 'not', 'no thanks', 'nope',
  // «a las ferreterías no les vendo nada», «esas no las busques».
  'no les vendo', 'no le vendo', 'no les vendemos', 'no le vendemos', 'no les vendo nada', 'no le vendo nada', 'no les vendemos nada',
  'no le vendemos nada', 'no los busques', 'no las busques', 'no lo busques', 'no la busques', 'no los incluyas', 'no las incluyas',
  'tampoco les vendo', 'tampoco le vendo']);
// «hoteles sí, restaurantes no»: el «sí» de después solo confirma.
const SI_DESPUES = indice(['si', 'yes', 'si me interesa', 'si me interesan', 'claro que si']);
// «porque esos no compran»: la razón explica, no cambia lo que se busca.
const PORQUE = indice(['porque', 'because', 'ya que', 'debido a que', 'pues ya']);
// Dónde está la persona o su negocio: no es dónde se busca («Vivo en Moca», «I'm based in Santo Domingo», «desde Santiago»).
const ORIGEN = indice(['estoy en', 'estamos en', 'vivo en', 'vivimos en', 'soy de', 'somos de', 'naci en', 'nacimos en', 'vengo de', 'i live in',
  'we live in', 'im from', 'i am from', 'were from', 'we are from', 'im based in', 'i am based in', 'were based in', 'we are based in',
  'im located in', 'i am located in', 'were located in', 'we are located in', 'desde', 'me mude a', 'me mude para', 'me mude pa', 'nos mudamos a',
  'nos mudamos para', 'i moved to', 'we moved to']);
// Lugares del propio negocio: «mi oficina está en Naco», «nuestra oficina queda en Higüey».
const LUGARES_PROPIOS = new Set(['oficina', 'oficinas', 'local', 'sede', 'sucursal', 'almacen', 'deposito', 'casa', 'office', 'warehouse', 'headquarters', 'base']);
const VERBOS_DE_ESTAR = new Set(['esta', 'estan', 'queda', 'quedan', 'se', 'encuentra', 'encuentran', 'ubicada', 'ubicado', 'ubicados', 'is', 'are', 'located',
  'based', 'principal']);
// Quién es la persona que vende: «Somos una clínica», «Soy contador», «We are a law firm», «Mi negocio es una farmacia».
const SOY = indice(['soy', 'soy un', 'soy una', 'somos', 'somos un', 'somos una', 'im', 'im a', 'im an', 'i am', 'i am a', 'i am an', 'we are', 'we are a',
  'we are an', 'were a', 'were an', 'mi negocio es', 'mi negocio es un', 'mi negocio es una', 'mi empresa es', 'mi empresa es un', 'mi empresa es una',
  'nuestro negocio es', 'nuestro negocio es un', 'nuestro negocio es una', 'nuestra empresa es', 'nuestra empresa es un', 'nuestra empresa es una',
  'my business is', 'my business is a', 'my company is', 'my company is a', 'our company is a', 'our business is a', 'trabajo para', 'trabajamos para',
  'i work for', 'we work for', 'soy representante de', 'soy representante de ventas de', 'soy vendedor de', 'soy vendedora de', 'represento a']);
// Nombres propios que no son datos de la búsqueda: «se llama Solar Caribe», «mi marca es Seguros Cibao».
const NOMBRE = indice(['se llama', 'se llaman', 'me llamo', 'mi nombre es', 'mi marca es', 'la marca es', 'nuestra marca es', 'el nombre es',
  'is called', 'is named', 'my brand is', 'our brand is', 'my name is']);
// «Yo los contacto», «I will contact them myself»: la persona contacta, no OPORTIA.
const CONTACTO_PROPIO = indice(['i will contact them', 'ill contact them', 'i will call them', 'ill call them', 'i contact them', 'i will reach out',
  'ill reach out', 'i will do the contacting', 'yo los contacto', 'yo las contacto', 'yo los llamo', 'yo las llamo', 'yo los voy a contactar',
  'yo los voy a llamar', 'yo mismo los contacto', 'yo misma los contacto', 'los contacto yo', 'las contacto yo', 'los llamo yo', 'las llamo yo',
  'yo me encargo de contactarlos', 'yo me encargo de llamarlos', 'yo me encargo del contacto', 'yo contacto', 'yo hablo con ellos']);
const MISMO = new Set(['myself', 'mismo', 'misma', 'personalmente', 'yo']);
// «No vendo paneles solares»: lo que se niega no es lo que se vende.
const NEG_PRODUCTO = indice(['no vendo', 'no vendemos', 'no ofrezco', 'no ofrecemos', 'i dont sell', 'we dont sell', 'dont sell', 'do not sell',
  'i do not sell', 'we do not sell']);
// «no tengo página web»: algo que la persona no tiene; no es lo que vende ni a quién busca.
const NO_TENGO = indice(['no tengo', 'no tenemos', 'i dont have', 'we dont have', 'i do not have', 'we do not have']);
// Relleno que va antes que las condiciones: «lo que sea» no es «que sea…».
const RELLENO_TEMPRANO = indice(['lo que sea', 'de lo que sea', 'en lo que sea', 'aunque sea', 'lo que salga', 'lo que aparezca', 'cualquier cosa',
  'de cualquier cosa', 'en cualquier cosa', 'anything', 'whatever']);
// «Ah no, mejor en La Romana», «digo», «no wait»: la persona cambió de idea a mitad del texto.
const CORRECCION = indice(['ah no', 'no mejor', 'mejor no', 'o mejor', 'no no', 'no espera', 'no espere', 'quiero decir', 'perdon', 'me equivoque',
  'corrijo', 'no wait', 'i mean', 'scratch that', 'actually no', 'sorry i mean', 'digo']);
// Ya le compran: no son clientes nuevos que buscar.
const YA_CLIENTES = indice(['ya me compran', 'ya me compra', 'ya son mis clientes', 'ya son clientes', 'ya son clientes mios', 'already buy from me',
  'already my customers', 'already my clients', 'me compran', 'me compra', 'nos compran', 'nos compra', 'buy from me', 'buys from me', 'buy from us',
  'buys from us', 'es mi cliente', 'es cliente mio', 'es cliente mia', 'es clienta mia', 'son mis clientes', 'son clientes mios', 'ya es mi cliente',
  'ya es cliente mio', 'ya es cliente', 'is my customer', 'is my client', 'are my customers', 'are my clients', 'is already my customer',
  'is already my client']);
// Quienes le venden a la persona (sus suplidores): no son clientes que buscar. «Los hoteles me venden toallas».
const ME_VENDEN = indice(['me venden', 'me vende', 'me lo venden', 'me la venden', 'me los venden', 'me las venden', 'me lo vende', 'me la vende', 'nos venden',
  'nos vende', 'nos lo venden', 'me suplen', 'me suple', 'nos suplen', 'me surten', 'me surte', 'me suministran', 'me suministra', 'me distribuyen',
  'sell to me', 'sells to me', 'sell me', 'sells me', 'sell to us', 'sell us', 'supply me', 'supplies me', 'supply us', 'son mis suplidores',
  'son mis proveedores', 'are my suppliers']);
// «ya tengo a la Bonanza y a Supermercado Nacional como clientes»: los clientes que ya tiene se excluyen.
const TENGO_A = indice(['ya tengo a', 'tengo a', 'ya tenemos a', 'tenemos a', 'i already have', 'we already have']);
// «ya trabajo con Hotel Matum», «we already work with Hodelpa», «ya le vendí al hotel Aloft»: con nombre, ya son sus clientes.
const YA_TRABAJO_CON = indice(['ya trabajo con', 'ya trabajamos con', 'i already work with', 'we already work with', 'already work with', 'ya le trabajo a',
  'ya les trabajo a', 'ya le vendi', 'ya les vendi', 'ya le vendimos', 'ya les vendimos', 'ya le he vendido', 'ya les he vendido', 'le vendi', 'les vendi',
  'i already sold to', 'we already sold to', 'already sold to']);
// Empleo: dónde trabajó o estudió antes. No es dónde busca.
const PASADO_LABORAL = indice(['antes trabaje', 'antes trabajaba', 'anteriormente trabaje', 'trabaje', 'trabajaba', 'labore', 'laboraba', 'antes labore', 'estudie',
  'estudiaba', 'antes estudie', 'me gradue', 'mi ultimo trabajo', 'mi ultimo empleo', 'mi trabajo anterior', 'mi empleo anterior', 'mi anterior trabajo',
  'mi anterior empleo', 'i worked', 'i used to work', 'i studied', 'my last job', 'my previous job', 'previously worked']);
const COMO_CLIENTES = indice(['como clientes', 'como cliente', 'de clientes', 'de cliente', 'as customers', 'as clients', 'as a customer', 'as a client']);
// «sácalos», «no lo incluyas»: después de nombrar a sus clientes, pide que no se busquen (ya se excluyeron).
const QUITALOS = indice(['sacalos', 'sacalo', 'sacala', 'sacalas', 'quitalos', 'quitalo', 'quitala', 'quitalas', 'excluyelos', 'excluyelo', 'excluyela',
  'no lo incluyas', 'no los incluyas', 'no la incluyas', 'no las incluyas', 'no lo busques', 'no los busques', 'no la busques', 'no las busques',
  'leave them out', 'leave it out', 'exclude them', 'exclude it', 'dont include them', 'dont include it', 'do not include them', 'skip them', 'so skip them',
  'skip it', 'so skip it', 'no quiero que la busques', 'no quiero que lo busques', 'no quiero que los busques', 'no quiero que las busques']);
// «donde sea», «en cualquier lugar»: no es un lugar exacto. Se pregunta.
const CUALQUIER_LUGAR = indice(['donde sea', 'en donde sea', 'dondequiera', 'donde quiera', 'cualquier lugar', 'en cualquier lugar', 'cualquier sitio',
  'en cualquier sitio', 'cualquier parte', 'en cualquier parte', 'en todas partes', 'wherever', 'anywhere', 'everywhere']);
// «en cualquier parte del país», «en cualquier lugar de RD», «donde sea en la República»: es todo el país, no una duda.
const DEL_PAIS = indice(['del pais', 'de todo el pais', 'del pais entero', 'de rd', 'de la rd', 'de republica dominicana', 'de la republica', 'de la republica dominicana',
  'del territorio', 'del territorio nacional', 'de quisqueya', 'en rd', 'en el pais', 'en todo el pais', 'en la republica', 'en la republica dominicana',
  'en republica dominicana', 'dentro del pais', 'de nuestro pais', 'in the country', 'of the country', 'in the dr', 'in dr', 'in the dominican republic',
  'in dominican republic', 'of the dominican republic', 'in rd']);
// «no sé si…», «tal vez», «puede que» antes de un lugar; «moca no sé», «Moca tal vez» después.
const DUDA_DE_LUGAR = indice(['no se si', 'no estoy seguro si', 'no estoy segura si', 'no estoy seguro de', 'no estoy segura de', 'tal vez', 'talvez', 'quizas',
  'quiza', 'a lo mejor', 'puede que', 'capaz que', 'posiblemente', 'probablemente', 'maybe', 'perhaps', 'not sure if', 'im not sure if', 'i dont know if',
  'possibly']);
const DUDA_DESPUES = indice(['no se', 'no estoy seguro', 'no estoy segura', 'tal vez', 'talvez', 'quizas', 'quiza', 'not sure', 'maybe', 'no se todavia']);
function dudaDespues(x, k) {
  const m = buscarEn(x.T, k, DUDA_DESPUES);
  if (!m) return 0;
  const t = x.T[m.fin];
  return !t || esFuerte(t) || esComa(t) || ['y', 'e', 'and', 'pero', 'but'].includes(t.w) ? m.fin : 0;
}
// «hazlo todo tú solo», «sin preguntarme»: pide más libertad. Se avisa que todo espera su aprobación.
// «vende mis productos tú mismo», «sin molestarme»: también. («contáctalos tú mismo» ya es pedir contactar: ver finDeObjetoDeCapacidad).
const AUTONOMIA_PEDIDA = indice(['tu solo', 'tu sola', 'por tu cuenta', 'sin preguntarme', 'sin consultarme', 'sin pedirme permiso', 'sin esperar mi aprobacion',
  'sin mi aprobacion', 'on your own', 'by yourself', 'without asking me', 'without my approval', 'without my permission', 'tu mismo', 'tu misma', 'tu solito',
  'tu solita', 'sin molestarme', 'sin molestarnos', 'sin interrumpirme', 'without bothering me']);
// Lo que la persona compra (no vende): «le compro a fincas», «quiero comprar paneles».
const COMPRA = indice(['le compro a', 'les compro a', 'compro', 'compramos', 'le compramos a', 'quiero comprar', 'queremos comprar', 'necesito comprar',
  'quiero comprarle', 'quiero comprarles', 'queremos comprarle', 'queremos comprarles', 'necesito comprarle', 'necesito comprarles', 'comprarle a',
  'comprarles a', 'quiero comprarle a', 'quiero comprarles a', 'le quiero comprar a', 'les quiero comprar a', 'i want to buy from', 'buy from',
  'busco comprar', 'busco quien me venda', 'busco quien me vendan', 'quien me venda', 'quien me vendan', 'que acepte mi', 'que acepten mi',
  'i want to buy', 'we want to buy', 'looking to buy', 'i need to buy', 'i buy', 'we buy', 'donde comprar', 'where to buy']);
const TELEFONO_PREVIO = indice(['tel', 'telefono', 'cel', 'celular', 'whatsapp', 'llamar al', 'llamame al', 'phone', 'call me at']);
const FRASES_RELLENO = indice(['que ofrecer', 'que ofrecerles', 'que ofrecerle', 'que venderles', 'que venderle', 'what to offer',
  'que podria ofrecerles', 'que podria ofrecerle', 'que podrias ofrecerles', 'que podrias ofrecerle', 'que podriamos ofrecerles', 'que puedo ofrecerles',
  'que puedo ofrecerle', 'que pueda ofrecerles', 'que podemos ofrecerles', 'que les podria ofrecer', 'que le podria ofrecer', 'que podria venderles',
  'i could offer them', 'that i could offer them', 'that i could offer', 'tu mismo', 'tu misma',
  'ustedes mismos', 'yourself', 'por mi', 'por nosotros', 'estoy seguro', 'estoy segura', 'seguro que', 'muchas gracias', 'si se puede', 'lo antes posible', 'cuanto antes', 'que yo pueda',
  'que puedo', 'te lo agradezco', 'gracias de antemano', 'no importa', 'no importa el', 'lo que sea', 'de lo que sea', 'cualquier cosa', 'de todo',
  'por ahora', 'de momento', 'por el momento', 'thank you', 'as soon as possible', 'for now', 'no se', 'ni idea', 'dios te bendiga', 'dios le bendiga',
  'que dios te bendiga', 'bendiciones', 'mi hermano', 'mi hermana', 'como tu ta', 'como estas', 'espero que bien', 'espero que estes bien', 'te cuento que',
  'te cuento', 'tu decide', 'tu decides', 'decide tu', 'como tu quieras', 'lo que tu digas', 'you decide', 'buenas tardes', 'buenas noches', 'buenos dias',
  'no solo', 'no solamente', 'not only', 'but also', 'sino tambien', 'si se puede', 'preguntarme primero']);
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
  also just only more very me us them him her do does did dont have has project help work job jobs sell selling buy ones one really well good great
  yes then hermano hermana mano manito ta espero cuento sitios sitio lugares ayudes ayude ayuden ademas too among consigas consigan hagas hagan`
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
  'be', 'want', 'working', 'work', 'quiero', 'deseo', 'include', 'any', 'trabajamos', 'vendemos', 'vendo', 'operamos', 'we', 'do', 'sell', 'cover', 'serve',
  'operate', 'go']);
// Preposiciones que se quitan solo si después viene algo conocido («excepto en Moca» → Moca; «not at night» queda igual).
const PREPOSICIONES_DE_EXCLUSION = new Set(['a', 'al', 'en', 'in', 'at', 'to', 'for', 'para', 'con', 'with']);
// Palabras que dejan fuera el nombre: «los de Moca», «those in Moca», «the ones in Moca».
const ELIPTICOS = new Set([...ARTICULOS, 'those', 'these', 'aquellos', 'aquellas', 'esos', 'esas']);

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
    zonas: [], zonasLibres: [], zonasExcluidas: [], zonasPropias: [], pais: { explicito: false, nombre: false },
    tamanos: new Set(), tamanosExcluidos: new Set(), prioridades: [], productos: [], productosPropios: [], negocioPropio: null,
    rolObjetivo: new Uint8Array(n), sugerencias: new Map(), senalesNegadas: [], tieneVenta: false,
    puesto: '', experiencia: null, tramosSalario: [], salarioEnVenta: [], frecuencias: [], dudas: [], supuestos: new Set(),
    capPedidas: new Set(), capNegadas: new Set(), soloInvestigar: false, contactarPedido: false,
    ultimoProductoFin: -1, secuencia: [], pideClientes: false, cicloCompleto: false,
    // Con qué palabras se nombró cada sector buscado («restaurantes», «clinics»): para saber si se excluye eso mismo.
    palabrasSector: new Map(),
    // «hoteles y empresas»: una palabra general junto a negocios concretos. Se pregunta.
    generalesEnLista: [], sectoresPrioridadDirectos: [], generalesConTamano: [], generalesMarco: [],
    // «Le vendo agua a Banreservas», «quiero más bancos»: un negocio con nombre propio ya es su cliente.
    leVende: false, quiereMas: quiereMas(T, ent), clientesActuales: false,
    porTelefono: false, autonomiaPedida: false,
  };
}

// «quiero más bancos», «more universities», «otros hoteles»: pide más negocios como los que ya tiene.
function quiereMas(T, ent) {
  for (let k = 0; k + 1 < T.length; k++) {
    if (!['mas', 'more', 'otros', 'otras', 'other'].includes(T[k].w)) continue;
    if (ent[k + 1]?.datos.some(d => d.que === 'sector' && !d.general)) return true;
  }
  return false;
}

// ¿Es «k» un enlace (https://…, www.…) o un correo?
function esEnlace(x, k) {
  const t = x.T[k];
  return Boolean(t && t.w === 'enlace' && /[.@:/]/.test(x.original.slice(t.ini, t.fin)));
}

function hayEnlace(x, a, b) {
  for (let k = a; k < b; k++) if (esEnlace(x, k)) return true;
  return false;
}

// Un nombre propio desde «k»: «Ferretería Junior», «Seguros Pérez», «UASD». Devuelve dónde termina, o «k» si no hay.
function finDeNombre(x, k) {
  const { T } = x;
  if (x.mayus) return k;
  let q = k;
  const empieza = t => t?.tipo === 'p' && (t.mayus || /^[A-Z]{2,5}$/.test(x.original.slice(t.ini, t.fin))) && !esRelleno(t.w);
  if (!empieza(T[q])) return k;
  while (q < x.n && q - k < 6 && T[q].tipo === 'p' && (T[q].mayus || (['de', 'del', 'la', 'el', 'los', 'las', 'y'].includes(T[q].w) && T[q + 1]?.mayus))) q++;
  return q;
}

// «…, Colmado Junior, …», «mi negocio, Colmado La Esquina, en Villa Mella»: el nombre del negocio de la persona entre comas
// (o pegado, «mi empresa Constructora JR»). Devuelve dónde termina (con la coma de después), o 0 si no hay.
function nombreDelNegocio(x, k) {
  const { T } = x;
  const q = esComa(T[k]) ? k + 1 : k;
  const fin = finDeNombre(x, q);
  if (fin <= q || lugarEn(x, q, true)) return 0;
  const t = T[fin];
  if (t && !esFuerte(t) && !esComa(t) && !['y', 'e', 'en', 'de', 'del', 'in', 'and', 'pero', 'but', 'que', 'a', 'al', 'para', 'to', 'for'].includes(t.w)) return 0;
  return esComa(t) && q > k ? fin + 1 : fin;
}

// ¿Hay un nombre propio entre «a» y «b»? (una palabra con mayúscula que no es una palabra común ni algo conocido, o una sigla).
function hayNombrePropio(x, a, b) {
  if (x.mayus) return false;
  for (let q = a; q < Math.min(b, x.n); q++) {
    const t = x.T[q];
    if (t.tipo !== 'p') continue;
    const sigla = /^[A-Z]{2,5}$/.test(x.original.slice(t.ini, t.fin));
    if ((t.mayus || sigla) && !esRelleno(t.w) && (!x.ent[q] || sigla) && !lugarEn(x, q, true)) return true;
  }
  return false;
}

const texto = (x, a, b) => (a < b ? x.original.slice(x.T[a].ini, x.T[b - 1].fin) : '');
const esFuerte = t => !t || (t.tipo === 's' && t.w === '.');
const esComa = t => t?.tipo === 's' && t.w === ',';
const marcar = (x, a, b) => { for (let k = Math.max(0, a); k < Math.min(b, x.n); k++) x.usado[k] = 1; };
const datoDe = (x, i, que) => x.ent[i]?.datos.find(d => d.que === que) || null;
// La risa al final («jaja», «lol», «jsjs») no dice nada: no rompe un filtro («pero no los pequeños jaja»).
const RISA = /^(?:(?:ja|je|ji|ha|he)){2,}[jh]?$|^(?:lol|lmao|xd+|(?:js){2,})$/;
const esRelleno = w => RELLENO.has(w) || RISA.test(w);
// Las listas guardan más de las 30 que caben, para poder decir cuáles quedaron fuera (nada se quita en silencio).
const TOPE = 60;

const MAXIMO_DE_DUDAS = 12;

function agregarDuda(x, clave, valor, sugerencias = []) {
  if (x.dudas.length >= MAXIMO_DE_DUDAS) return;
  const limpio = String(valor ?? '').replace(/\s+/g, ' ').replace(/^[\s,;:.]+|[\s,;:.]+$/g, '').slice(0, 80);
  if (x.dudas.some(d => d.clave === clave && comparable(d.texto) === comparable(limpio))) return;
  x.dudas.push({ clave, texto: limpio, sugerencias: sugerencias.slice(0, 3) });
}

function agregarPrioridad(x, a, b) {
  if (hayEnlace(x, a, b)) { agregarDuda(x, 'texto', texto(x, a, b)); return; }
  while (a < b && (esComa(x.T[a]) || ['y', 'e', 'and', 'pero', 'tambien', 'also'].includes(x.T[a].w) || (['a', 'al', 'to'].includes(x.T[a].w) && x.ent[a + 1]))) a++;
  // «cerca de Santiago para venderles…», «near Punta Cana to sell…»: el «para» o el «to» de después no son parte de la preferencia.
  while (b > a && (x.T[b - 1].tipo === 's' || ['y', 'e', 'de', 'and', 'o', 'que', 'con', 'en', 'tambien', 'also', 'too', 'para', 'pa', 'to', 'for'].includes(x.T[b - 1].w))) b--;
  if (b <= a) return;
  if (x.tipo === 'laboral' && salarioEnPreferencia(x, a, b)) return;
  let valor = texto(x, a, b).replace(/\s+/g, ' ').trim();
  if (valor.length > 160) valor = valor.slice(0, 160).replace(/\s+\S*$/, '');
  if (!valor || x.prioridades.length >= TOPE) return;
  if (!x.prioridades.some(p => comparable(p) === comparable(valor))) x.prioridades.push(valor);
}

// Números escritos con letras: «treinta mil», «veinticinco mil».
const NUMEROS_ESCRITOS = new Set(['dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiun', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis',
  'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa', 'cien', 'ciento', 'doscientos',
  'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred']);
const DINERO = new Set(['mil', 'k', 'pesos', 'peso', 'dolares', 'dolar', 'dollars', 'dollar', 'usd', 'us$', 'rd$', 'dop', 'thousand', '$', 'minimo', 'maximo',
  'minimum', 'maximum']);
function cantidadEscrita(x, k) {
  const { T } = x;
  if (!NUMEROS_ESCRITOS.has(T[k]?.w)) return false;
  for (let q = k + 1; q < x.n && q - k <= 4; q++) {
    if (['mil', 'thousand', 'pesos', 'dolares', 'dollars'].includes(T[q].w)) return true;
    if (!NUMEROS_ESCRITOS.has(T[q].w) && !['y', 'e', 'and'].includes(T[q].w)) return false;
  }
  return false;
}

// «sueldo de veinte mil pesos», «quiero ganar treinta mil», «veinticinco mil o más». Devuelve dónde termina, o 0.
function salarioEscritoEn(x, j) {
  const { T } = x;
  let k = j;
  for (let v = 0; v < 2 && k < x.n && ['que', 'me', 'con', 'un', 'una', 'el', 'mi', 'de', 'a', 'to', 'quiero', 'want'].includes(T[k].w); v++) k++;
  const palabra = PALABRAS_SALARIO.has(T[k]?.w);
  if (palabra) k++; else k = j;
  let q = k;
  while (q < x.n && q - k < 4 && !cantidadEscrita(x, q) && ['de', 'mas', 'menos', 'por', 'lo', 'al', 'minimo', 'como', 'unos', 'alrededor', 'arriba', 'encima',
    'desde', 'entre', 'hasta', 'me', 'que', 'es', 'of', 'at', 'least', 'about', 'around', 'over'].includes(T[q].w)) q++;
  if (!cantidadEscrita(x, q) || (!palabra && q !== j)) return 0;
  let fin = q;
  while (fin < x.n && (NUMEROS_ESCRITOS.has(T[fin].w) || ['y', 'e', 'and', 'mil', 'thousand', 'pesos', 'dolares', 'dollars'].includes(T[fin].w))) fin++;
  while (fin > q + 1 && ['y', 'e', 'and'].includes(T[fin - 1].w)) fin--;
  if (['o', 'or'].includes(T[fin]?.w) && ['mas', 'more', 'menos', 'less'].includes(T[fin + 1]?.w)) fin += 2;
  return fin;
}

// Empleo: un salario dentro de una preferencia («que pague más de treinta mil», «que paguen en dólares, mínimo 800») no se
// esconde ahí: se pregunta el salario. Y un periodo de pago después del salario («20 mil, pago quincenal») hace preguntar si
// es por mes o por quincena. Devuelve true si ya se usó.
function salarioEnPreferencia(x, a, b) {
  const { T } = x;
  let cifra = false;
  let dinero = false;
  let escrita = false;
  let periodo = null;
  let pago = false;
  for (let k = a; k < b; k++) {
    const w = T[k].w;
    if (T[k].tipo === 'n') cifra = true;
    if (cantidadEscrita(x, k)) escrita = true;
    if (DINERO.has(w) || PALABRAS_SALARIO.has(w)) dinero = true;
    if (PALABRAS_SALARIO.has(w)) pago = true;
    const p = periodo ? null : buscarEn(T, k, PERIODOS);
    if (p) periodo = p.datos[0];
  }
  const valor = texto(x, a, b);
  if (escrita || (cifra && dinero)) {
    x.tramosSalario.push({ montos: [], extras: [], dudoso: true, texto: valor, pos: a });
    return true;
  }
  // «pago quincenal», «que paguen por quincena», «que me paguen quincenal», después de «20 mil».
  const ultimo = x.tramosSalario[x.tramosSalario.length - 1];
  if (periodo && (pago || b - a <= 2) && ultimo && ultimo.montos.length && !ultimo.periodoAntes && ultimo.montos.every(m => !m.periodo)) {
    if (periodo !== 'mensual') { ultimo.periodoAntes = periodo; ultimo.texto = `${ultimo.texto} … ${valor}`; }
    return true;
  }
  return false;
}

// ---------- Lugares ----------
const ZONA_POR_CLAVE = new Map(ZONAS.map(z => [z.clave, z]));
// «ensanche Espaillat», «reparto Oquendo», «barrio Pekín»: después de estas palabras viene el nombre de un barrio.
const BARRIO_PREVIO = new Set(['ensanche', 'reparto', 'barrio']);
// Países y estados de fuera: «San Juan, Puerto Rico» es Puerto Rico. Una ciudad de fuera («Miami») no se junta así.
const CIUDADES_DE_FUERA = new Set(['nueva york', 'new york', 'miami', 'boston', 'madrid', 'barcelona', 'paris', 'londres', 'london', 'orlando', 'chicago',
  'filadelfia', 'philadelphia']);
const MUNICIPIOS_SD = { este: 'santo-domingo-este', norte: 'santo-domingo-norte', oeste: 'santo-domingo-oeste' };

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
  // «toda Quisqueya», «Quisqueya entera»: el país, no el municipio de San Pedro de Macorís.
  if (m.datos.some(d => d.que === 'pais') && m.datos.some(d => d.que === 'zona') && !callePrevia) {
    if (['toda', 'todo', 'all'].includes(anterior)) return { que: 'pais', explicito: true, fin: m.fin };
    if (['entera', 'entero', 'completa', 'completo'].includes(T[m.fin]?.w)) return { que: 'pais', explicito: true, fin: m.fin + 1 };
  }
  for (const d of m.datos) {
    if (d.que === 'zona') {
      if (callePrevia) continue;
      if (conArticulo && !SIN_ARTICULO.has(primera) && d.tipo !== 'region' && d.tipo !== 'lugar') continue;
      if (d.ambigua && !contexto) continue;
      // «Jardines del Este», «Autopista del Nordeste»: el punto cardinal es parte del nombre.
      if (d.cardinal && cardinalEnUnNombre(x, i)) continue;
      return { que: 'zona', clave: d.clave, tipo: d.tipo, fin: m.fin, homonimo: d.homonimo, cardinal: d.cardinal };
    }
    if (d.que === 'pais' && !callePrevia) {
      // «DR» es el país solo escrito así; «dr» suele ser «doctor».
      if (primera === 'dr' && m.fin === i + 1 && anterior !== 'the' && x.original.slice(T[i].ini, T[i].fin) !== 'DR') continue;
      return { que: 'pais', explicito: d.explicito, fin: m.fin };
    }
    if (d.que === 'extranjero' && !callePrevia && !conArticulo && anterior !== 'con' && !usaComoVerbo(x, i)) return { que: 'extranjero', fin: m.fin };
    if (d.que === 'difuso' && !callePrevia) return { que: 'difuso', sugerencias: d.sugerencias, fin: m.fin };
  }
  const calle = m.datos.find(d => d.que === 'calle');
  if (calle) return { que: 'calle', provincia: calle.provincia, fin: m.fin, comoCalle: callePrevia || conArticulo, explicita: callePrevia };
  return null;
}

// «…, usa correos formales», «usa datos de la Cámara de Comercio»: «usa» es el verbo «usar», no Estados Unidos.
// Es el país después de «en», «de», «a» («en USA y Canadá»), o al final («Santiago, USA»).
function usaComoVerbo(x, i) {
  const { T } = x;
  if (T[i]?.w !== 'usa' || x.ent[i]?.fin !== i + 1) return false;
  if (PREP_LUGAR.has(T[i - 1]?.w)) return false;
  const sig = T[i + 1];
  return Boolean(sig && sig.tipo === 'p' && !SEPARADORES.has(sig.w) && !PREP_LUGAR.has(sig.w) && !['pero', 'but'].includes(sig.w));
}

// «Jardines del Este», «Los Jardines del Norte», «la Autopista del Nordeste»: ¿el punto cardinal en «i» va pegado a un nombre?
function cardinalEnUnNombre(x, i) {
  const { T } = x;
  const p = ['de', 'del'].includes(T[i].w) ? i - 1 : ['de', 'del'].includes(T[i - 1]?.w) ? i - 2 : -1;
  const t = T[p];
  if (!t || t.tipo !== 'p') return false;
  if (CALLE_PREVIA.has(t.w) || BARRIO_PREVIO.has(t.w)) return true;
  return t.mayus && !x.mayus && !esRelleno(t.w) && !x.ent[p];
}

// Palabras que parecen el nombre de un lugar que no está en la lista («Pueblo Inventado», «SFM», «Villa Faro», «Los Mameyes»).
function pareceLugar(x, i) {
  const { T } = x;
  const t = T[i];
  if (!t || t.tipo !== 'p') return 0;
  // «ensanche Espaillat»: el nombre de un barrio, aunque lleve el nombre de una provincia o de una calle.
  if (BARRIO_PREVIO.has(t.w) && T[i + 1]?.tipo === 'p' && !esRelleno(T[i + 1].w)) {
    let fin = i + 1;
    while (fin < x.n && fin - i < 4 && T[fin].tipo === 'p' && !esRelleno(T[fin].w) && (fin === i + 1 || T[fin].mayus)) fin = x.ent[fin] ? Math.max(fin + 1, x.ent[fin].fin) : fin + 1;
    return fin;
  }
  const conMayuscula = k => T[k]?.tipo === 'p' && T[k].mayus && !x.mayus;
  // «Los Mameyes», «Villa Faro», «Bajo Yuna»: un artículo, «Villa» o una palabra corta con mayúscula, delante de otro nombre.
  const nombreConArticulo = ARTICULOS.has(t.w) && conMayuscula(i) && conMayuscula(i + 1) && !x.ent[i + 1] && !esRelleno(T[i + 1].w);
  // «la Villa Faro», «las Villas Unidas»: el artículo va con el nombre.
  if (ARTICULOS.has(t.w) && ['villa', 'villas'].includes(T[i + 1]?.w) && conMayuscula(i + 1) && !lugarEn(x, i + 1, true)) return pareceLugar(x, i + 1);
  const villa = ['villa', 'villas'].includes(t.w) && conMayuscula(i) && conMayuscula(i + 1) && !lugarEn(x, i + 1, true);
  const cortaConMayuscula = esRelleno(t.w) && !ARTICULOS.has(t.w) && conMayuscula(i) && conMayuscula(i + 1) && !esRelleno(T[i + 1].w) && !x.ent[i + 1];
  if (!nombreConArticulo && !villa && !cortaConMayuscula && (x.ent[i] || esRelleno(t.w) || detectar(x, i))) return 0;
  const original = x.original.slice(t.ini, t.fin);
  const sigla = /^[A-Z]{2,4}$/.test(original);
  if (!sigla && (x.mayus || !t.mayus)) return 0;
  let fin = i + 1;
  if (villa && x.ent[fin]?.datos.some(d => d.que === 'sector')) fin = x.ent[fin].fin;
  while (fin < x.n && fin - i < 5) {
    const s = T[fin];
    // «del Este» dentro del nombre.
    const cardinal = ['de', 'del'].includes(s.w) && conMayuscula(fin + 1) && [x.ent[fin], x.ent[fin + 1]].some(e => e?.datos.some(d => d.que === 'zona' && d.cardinal));
    if (cardinal) { fin = x.ent[fin] ? x.ent[fin].fin : x.ent[fin + 1].fin; continue; }
    // «Villa Grande», «Laguna Grande»: un tamaño con mayúscula dentro del nombre es parte del nombre.
    const tamanoEnElNombre = s.mayus && !x.mayus && x.ent[fin]?.datos.every(d => d.que === 'tamano');
    if (s.tipo === 'p' && (!x.ent[fin] || tamanoEnElNombre) && !detectar(x, fin) && (s.mayus || (['de', 'del', 'la', 'los', 'las'].includes(s.w) && T[fin + 1]?.mayus && !x.ent[fin + 1]))) fin++;
    else break;
  }
  while (fin > i + 1 && ['de', 'del', 'la', 'los', 'las'].includes(T[fin - 1].w)) fin--;
  return fin;
}

const ZONA_POR_PALABRA = (() => {
  const lista = [];
  for (const z of ZONAS) for (const p of z.palabras) if (p.length >= 4) lista.push({ p, clave: z.clave });
  return lista;
})();

// Lugares parecidos («Santigo» → Santiago). Cuesta: con «x» se recuerda lo ya calculado y se calcula pocas veces por instrucción.
const MAXIMO_DE_SUGERENCIAS = 16;
export function sugerenciasDeLugar(valor, x = null) {
  const comp = comparable(valor).replace(/^(en|de|del|la|el)\s+/, '');
  if (comp.length < 3) return [];
  if (x) {
    if (x.sugerencias.has(comp)) return x.sugerencias.get(comp);
    if (x.sugerencias.size >= MAXIMO_DE_SUGERENCIAS) return [];
  }
  const tope = comp.length <= 5 ? 1 : 2;
  let mejor = tope + 1;
  let claves = [];
  for (const { p, clave } of ZONA_POR_PALABRA) {
    const d = distancia(comp, p, tope);
    if (d < mejor) { mejor = d; claves = [clave]; } else if (d === mejor && !claves.includes(clave)) claves.push(clave);
  }
  const lista = mejor <= tope ? claves.slice(0, 3) : [];
  if (x) x.sugerencias.set(comp, lista);
  return lista;
}

// Guarda un lugar y devuelve dónde termina. «destino»: 'incluir' (dónde buscar), 'excluir' o 'propia' (dónde está la persona).
function guardarLugar(x, L, a, b, destino) {
  if (L.que === 'zona') {
    (destino === 'excluir' ? x.zonasExcluidas : destino === 'propia' ? x.zonasPropias : x.zonas).push(L.clave);
  } else if (L.que === 'pais' && destino === 'incluir') {
    if (L.explicito) x.pais.explicito = true; else x.pais.nombre = true;
  } else if (L.que === 'extranjero') {
    if (destino === 'incluir') x.zonasLibres.push(texto(x, a, b));
  } else if (L.que === 'difuso') {
    // «el interior del país», «la costa norte»: no es un lugar exacto. Se pregunta.
    if (destino === 'incluir') { x.zonasLibres.push(texto(x, a, b)); agregarDuda(x, 'lugar_difuso', texto(x, a, b), L.sugerencias); }
    else if (destino === 'excluir') x.exclusiones.push(texto(x, a, b));
  } else if (L.que === 'calle' && destino !== 'propia') {
    // «la Duarte», «de la Independencia»: puede ser la avenida o la provincia. Se pregunta.
    const desde = ['la', 'el'].includes(x.T[a - 1]?.w) ? a - 1 : a;
    // «Luperón, Puerto Plata»: con su provincia al lado es el municipio, no la avenida.
    const z = L.provincia && !L.comoCalle ? ZONA_POR_CLAVE.get(L.provincia) : null;
    const siguiente = z && (esComa(x.T[b]) || ['de', 'del'].includes(x.T[b]?.w)) ? lugarEn(x, b + 1, true) : null;
    const claveSiguiente = siguiente?.que === 'zona' ? siguiente.clave : siguiente?.que === 'calle' && !siguiente.comoCalle ? siguiente.provincia : null;
    if (claveSiguiente && ZONA_POR_CLAVE.get(claveSiguiente) && contiene(ZONA_POR_CLAVE.get(claveSiguiente), z)) {
      (destino === 'excluir' ? x.zonasExcluidas : x.zonas).push(z.clave);
      marcar(x, a, siguiente.fin);
      return siguiente.fin;
    }
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
  const libresAlEmpezar = x.zonasLibres.length;
  let j = i;
  let enLista = false;
  let alguno = false;
  let anterior = null;
  let zonasAntesDelUltimo = x.zonas.length;
  let libresAntesDelUltimo = x.zonasLibres.length;
  let inicioDelUltimo = i;
  const destinoDe = () => (destino === 'excluir' ? x.zonasExcluidas : destino === 'propia' ? x.zonasPropias : x.zonas);
  for (let vueltas = 0; vueltas < 25; vueltas++) {
    const L = lugarEn(x, j, enLista);
    zonasAntesDelUltimo = x.zonas.length;
    libresAntesDelUltimo = x.zonasLibres.length;
    inicioDelUltimo = j;
    // «la capital de Santiago» es la ciudad de Santiago, no Santo Domingo.
    if (L && L.clave === 'gran-santo-domingo' && ['la', 'the'].includes(T[j].w) && ['de', 'del', 'of'].includes(T[L.fin]?.w) && lugarEn(x, L.fin + 1, true)?.que === 'zona') {
      marcar(x, j, L.fin + 1);
      j = L.fin + 1;
      continue;
    }
    // «el norte de Santiago», «el este de Santo Domingo»: una parte de ese lugar, no la región. Se busca en el lugar y se pregunta.
    let saltada = false;
    if (L && L.cardinal) {
      const dentro = ['de', 'del'].includes(T[L.fin]?.w) ? lugarTras(x, L.fin + 1) : null;
      const pegadaAUnaCiudad = enLista && anterior && anterior.tipo !== 'region' && esComa(T[j - 1]) && ['zona', 'la'].includes(T[j].w);
      if ((dentro && dentro.L.que === 'zona') || pegadaAUnaCiudad) {
        if (destino === 'incluir') agregarDuda(x, 'parte_de_lugar', dentro ? texto(x, j, dentro.L.fin) : texto(x, i, L.fin));
        marcar(x, j, dentro ? dentro.q : L.fin);
        if (dentro) { j = dentro.q; continue; }
        j = L.fin;
        saltada = true;
      }
    }
    // «en el sureste del país», «in the north of the country»: una parte del país que no conozco no es todo el país. Se pregunta.
    if (L && L.que === 'pais' && !L.explicito && ['del', 'de', 'of'].includes(T[j - 1]?.w) && T[j - 2]?.tipo === 'p' && !esRelleno(T[j - 2].w)
      && !x.usado[j - 2] && !x.ent[j - 2] && !EMPRESA.has(T[j - 2].w)) break;
    if (saltada) {
      // «Santiago de los Caballeros, zona sur»: la zona ya se preguntó; no se busca la región.
    } else if (L && !(L.que === 'calle' && L.explicita)) {
      // «en Santiago y Moca, en Moca solo a los grandes»: un lugar que ya estaba, con un tamaño o un negocio solo para él. Se pregunta.
      if (destino === 'incluir' && L.que === 'zona' && enLista && x.zonas.includes(L.clave) && new Set(x.zonas).size > 1) {
        let b = L.fin;
        let acotada = false;
        while (b < x.n && !esFuerte(T[b]) && !esComa(T[b]) && !['pero', 'but'].includes(T[b].w)) {
          if (x.ent[b]?.datos.some(d => d.que === 'tamano' || (d.que === 'sector' && !d.general))) acotada = true;
          b++;
        }
        if (acotada) {
          const desde = PREP_LUGAR_FUERTE.has(T[j - 1]?.w) ? j - 1 : j;
          agregarDuda(x, 'combinacion_parcial', texto(x, desde, b));
          marcar(x, j, b);
          j = b;
          break;
        }
      }
      let fin = guardarLugar(x, L, j, L.fin, destino);
      // «San Juan, Puerto Rico», «Santiago de Cuba»: con un país de fuera pegado, todo el lugar es de fuera.
      const fuera = L.que === 'zona' && (esComa(T[fin]) || ['de', 'del'].includes(T[fin]?.w)) ? lugarEn(x, fin + 1, true) : null;
      if (fuera && fuera.que === 'extranjero' && !CIUDADES_DE_FUERA.has(comparable(texto(x, fin + 1, fuera.fin)))) {
        destinoDe().pop();
        // Con coma se guarda como «San Juan (Puerto Rico)»: en el formulario la coma separa lugares.
        if (destino === 'incluir') x.zonasLibres.push(esComa(T[fin]) ? `${texto(x, j, fin)} (${texto(x, fin + 1, fuera.fin)})` : texto(x, j, fuera.fin));
        fin = fuera.fin;
      } else if (L.que === 'zona') {
        // «Constanza, La Vega», «Villa Mella de Santo Domingo»: la provincia solo dice dónde queda; se busca solo en Constanza.
        // «Moca, Santiago», «Bonao, La Vega»: el lugar no queda en esa provincia. No se sabe si es uno o los dos: se pregunta.
        const z = ZONA_POR_CLAVE.get(L.clave);
        const siguiente = esComa(T[fin]) || ['de', 'del'].includes(T[fin]?.w) ? lugarEn(x, fin + 1, true) : null;
        const posible = siguiente && siguiente.que === 'zona' && !siguiente.cardinal && esContenedor(z, ZONA_POR_CLAVE.get(siguiente.clave))
          && !sigueLaLista(x, siguiente.fin);
        const conSuProvincia = posible && contiene(ZONA_POR_CLAVE.get(siguiente.clave), z);
        // Con un nombre que tienen varios lugares («La Ciénaga de Santo Domingo»), la pregunta es cuál de ellos.
        const par = posible && (conSuProvincia || !L.homonimo);
        if (par) {
          if (!conSuProvincia) {
            destinoDe().push(siguiente.clave);
            if (destino === 'incluir') agregarDuda(x, 'lugar_provincia', texto(x, j, siguiente.fin));
          }
          fin = siguiente.fin;
        }
        // «Los Ríos», «La Ciénaga», «Bella Vista», «Quisqueya»: hay más de un lugar con ese nombre. Si no va con su provincia, se pregunta.
        if (L.homonimo && destino === 'incluir' && !conSuProvincia) agregarDuda(x, 'lugar_homonimo', texto(x, j, L.fin));
      }
      // «Santiago Este», «Puerto Plata Norte»: una parte del lugar (no «Santo Domingo Este», que es un municipio). Se busca en el lugar y se pregunta.
      if (L.que === 'zona' && ['este', 'oeste', 'norte', 'sur', 'east', 'west', 'north', 'south'].includes(T[fin]?.w) && !x.ent[fin]
        && (!T[fin + 1] || esFuerte(T[fin + 1]) || esComa(T[fin + 1]) || SEPARADORES.has(T[fin + 1].w) || PREP_LUGAR.has(T[fin + 1].w))) {
        if (destino === 'incluir') agregarDuda(x, 'parte_de_lugar', texto(x, j, fin + 1));
        fin++;
      }
      marcar(x, j, fin);
      j = fin;
      alguno = alguno || L.que !== 'calle';
      anterior = L.que === 'zona' ? L : anterior;
    } else {
      const fin = enLista || PREP_LUGAR_FUERTE.has(T[j - 1]?.w) || BARRIO_PREVIO.has(T[j].w) ? pareceLugar(x, j) : 0;
      if (!fin) break;
      const valor = texto(x, j, fin);
      if (destino === 'excluir') { if (x.exclusiones.length < TOPE) x.exclusiones.push(valor); }
      else if (destino === 'incluir' && x.zonasLibres.length < TOPE) {
        x.zonasLibres.push(valor);
        // Las sugerencias cuestan: solo se buscan si la duda todavía cabe en la lista.
        if (x.dudas.length < MAXIMO_DE_DUDAS) agregarDuda(x, 'lugar', valor, sugerenciasDeLugar(valor, x));
      }
      marcar(x, j, fin);
      j = fin;
      alguno = true;
    }
    enLista = true;
    // ¿Sigue la lista?
    let k = j;
    if (esComa(T[k]) || SEPARADORES.has(T[k]?.w)) k++; else break;
    // «que no sea en Santo Domingo, en Santiago o Puerto Plata»: después de la coma, «en …» es lo que sí quiere.
    if (destino === 'excluir' && esComa(T[j]) && ['en', 'in', 'a', 'al', 'to', 'para', 'pa'].includes(T[k]?.w)) break;
    // «Santo Domingo Norte y Este»: la segunda palabra es otro municipio de Santo Domingo.
    const ultima = destinoDe()[destinoDe().length - 1];
    if (Object.values(MUNICIPIOS_SD).includes(ultima) && MUNICIPIOS_SD[T[k]?.w] && !x.ent[k] && (esFuerte(T[k + 1]) || esComa(T[k + 1]) || !T[k + 1] || x.usado[k + 1] === 0)) {
      destinoDe().push(MUNICIPIOS_SD[T[k].w]);
      marcar(x, j, k + 1);
      j = k + 1;
      continue;
    }
    let hallado = -1;
    for (let q = k; q < x.n && q - k < 4; q++) {
      if (x.usado[q]) break;
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
  // «en Santiago y Moca, en Moca solo a los grandes»: un lugar que ya estaba, con un tamaño o un negocio solo para él. Se pregunta.
  const repetidas = x.zonas.slice(antes);
  if (destino === 'incluir' && repetidas.length && repetidas.every(z => x.zonas.indexOf(z) < antes) && new Set(x.zonas.slice(0, antes)).size > new Set(repetidas).size) {
    let b = j;
    let acotada = false;
    while (b < x.n && !esFuerte(T[b]) && !esComa(T[b]) && !['pero', 'but'].includes(T[b].w)) {
      if (x.ent[b]?.datos.some(d => d.que === 'tamano' || (d.que === 'sector' && !d.general))) acotada = true;
      b++;
    }
    if (acotada) {
      x.zonas.length = antes;
      const desde = PREP_LUGAR_FUERTE.has(T[i - 1]?.w) ? i - 1 : i;
      agregarDuda(x, 'combinacion_parcial', texto(x, desde, b));
      marcar(x, desde, b);
      return b;
    }
  }
  // «en Santo Domingo pagan poco», «en Puerto Plata pagan 30 mil»: el lugar se nombra para comparar, no para buscar ahí. Se pregunta.
  if (destino === 'incluir' && comparaElLugar(x, j)) {
    x.zonas.length = antes;
    x.zonasLibres.length = Math.min(x.zonasLibres.length, libresAlEmpezar);
    const desde = PREP_LUGAR_FUERTE.has(T[i - 1]?.w) ? i - 1 : i;
    const fin = finDeRazon(x, j);
    agregarDuda(x, 'texto', texto(x, desde, fin));
    marcar(x, desde, fin);
    return fin;
  }
  // «…, moca no sé», «Moca tal vez»: no está seguro de ese lugar. No se busca ahí: se pregunta.
  const inseguro = destino === 'incluir' ? dudaDespues(x, j) : 0;
  if (inseguro) {
    x.zonas.splice(zonasAntesDelUltimo);
    x.zonasLibres.splice(libresAntesDelUltimo);
    agregarDuda(x, 'lugar_inseguro', texto(x, inicioDelUltimo, inseguro));
    marcar(x, j, inseguro);
    j = inseguro;
  } else if (destino === 'incluir') {
    // «pero en Sosúa no», «pa Santiago no»: la negación de después excluye el último lugar. «pa La Vega sí»: lo confirma.
    const neg = negacionDespues(x, j);
    if (neg) {
      x.zonasExcluidas.push(...x.zonas.splice(zonasAntesDelUltimo));
      x.exclusiones.push(...x.zonasLibres.splice(libresAntesDelUltimo));
      marcar(x, j, neg);
      j = neg;
    } else {
      const si = afirmacionDespues(x, j);
      if (si) { marcar(x, j, si); j = si; }
    }
  }
  if (alguno && destino === 'incluir' && x.zonas.length > antes) x.secuencia.push({ t: 'Z', claves: x.zonas.slice(antes) });
  return j;
}

// ¿El lugar «L» queda dentro de un lugar que ya se busca (Naco en Santo Domingo, La Vega en el Cibao)?
function dentroDeLoBuscado(x, L) {
  if (L.que !== 'zona') return false;
  // «en todo el país, sobre todo en Santiago»: todo queda dentro del país.
  if (x.pais.explicito || x.pais.nombre) return true;
  const chico = ZONA_POR_CLAVE.get(L.clave);
  return x.zonas.some(c => {
    const grande = ZONA_POR_CLAVE.get(c);
    return c !== L.clave && grande && (contiene(grande, chico) || (Array.isArray(grande.provincias) && grande.provincias.includes(chico.clave)));
  });
}

// Desde «k» hasta la coma o el punto, ¿solo hay lugares conocidos («Santiago o Puerto Plata»)? Devuelve dónde empiezan, o 0.
function soloLugaresDesde(x, k) {
  const { T } = x;
  const primero = lugarTras(x, k);
  if (!primero || primero.L.que !== 'zona') return 0;
  let q = primero.q;
  while (q < x.n && !esFuerte(T[q]) && !esComa(T[q])) {
    const L = lugarEn(x, q, true);
    if (L && L.que === 'zona') { q = L.fin; continue; }
    if (SEPARADORES.has(T[q].w) || ['en', 'in'].includes(T[q].w)) { q++; continue; }
    return 0;
  }
  return primero.q;
}

// Después de un lugar, ¿se habla de cómo pagan ahí («pagan poco», «los sueldos son bajos», «pay more»)?
const PAGAN = new Set(['pagan', 'paga', 'pagaban', 'pagarian', 'pay', 'pays', 'paid', 'cobran']);
function comparaElLugar(x, j) {
  const { T } = x;
  const w = T[j]?.w;
  if (PAGAN.has(w)) return true;
  if (['no', 'se', 'they', 'dont'].includes(w) && PAGAN.has(T[j + 1]?.w)) return true;
  return ['los', 'el', 'the'].includes(w) && ['sueldos', 'sueldo', 'salarios', 'salario', 'salaries', 'pagos', 'pago'].includes(T[j + 1]?.w);
}

// ¿«grande» es una provincia, una región o un municipio que puede contener al lugar «chico»?
const RANGO_DE_ZONA = { lugar: 0, distrito: 0, municipio: 1, provincia: 2, region: 3 };
function esContenedor(chico, grande) {
  if (!chico || !grande || chico.clave === grande.clave) return false;
  if (!['lugar', 'distrito', 'municipio'].includes(chico.tipo)) return false;
  return RANGO_DE_ZONA[grande.tipo] > RANGO_DE_ZONA[chico.tipo];
}
function contiene(grande, chico) {
  if (grande.clave === chico.provincia || grande.clave === chico.municipio) return true;
  return grande.tipo === 'region' && Array.isArray(grande.provincias) && grande.provincias.includes(chico.provincia);
}
// Después de «k», ¿la lista de lugares sigue («…, La Vega y Moca»)?
function sigueLaLista(x, k) {
  const { T } = x;
  if (!(esComa(T[k]) || SEPARADORES.has(T[k]?.w))) return false;
  for (let q = k + 1; q < x.n && q - k <= 4; q++) {
    if (lugarEn(x, q, true) || pareceLugar(x, q)) return true;
    if (!(['en', 'de', 'del', 'in', 'a', 'al', 'y'].includes(T[q].w) || ADJETIVOS_PREVIOS.has(T[q].w))) return false;
  }
  return false;
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
  if (m) return { tipo: negadoAntes(x, j) ? 'objetivoNegado' : 'objetivo', fin: m.fin, clave: m.datos[0].clave };
  m = buscarEn(T, j, COMPRA);
  if (m && !(m.datos[0].frase === 'compro' && ['lo', 'la', 'los', 'las', 'que'].includes(T[j - 1]?.w))) return { tipo: 'compra', fin: m.fin };
  m = buscarEn(T, j, RELLENO_TEMPRANO);
  if (m) return { tipo: 'relleno', fin: m.fin };
  m = buscarEn(T, j, CORRECCION);
  if (m && correccionValida(x, j, m)) return { tipo: 'cambio', fin: m.fin };
  m = buscarEn(T, j, CUALQUIER_LUGAR);
  if (m) {
    const pais = buscarEn(T, m.fin, DEL_PAIS);
    return pais ? { tipo: 'difuso', fin: pais.fin, pais: true } : { tipo: 'difuso', fin: m.fin };
  }
  // «no sé si en La Vega también», «y puede que en La Vega», «tal vez en Moca»: no está seguro de ese lugar. Se pregunta.
  m = buscarEn(T, j, DUDA_DE_LUGAR);
  if (m) {
    let q = m.fin;
    while (q < x.n && q - m.fin < 3 && ['en', 'in', 'tambien', 'also', 'a', 'al', 'de', 'para', 'pa', 'y'].includes(T[q].w)) q++;
    const L = lugarTras(x, q);
    if (L && L.L.que === 'zona') return { tipo: 'lugarDudoso', fin: m.fin, lugar: L.q };
  }
  m = buscarEn(T, j, AUTONOMIA_PEDIDA);
  if (m) return { tipo: 'autonomia', fin: m.fin };
  m = buscarEn(T, j, SOLO);
  if (m) return { tipo: 'solo', fin: m.fin };
  m = buscarEn(T, j, NADIE);
  if (m) return { tipo: 'cap', neg: true, fin: m.fin, claves: ['contactar'], enviar: true };
  m = buscarEn(T, j, CICLO);
  if (m) return { tipo: 'ciclo', fin: m.fin };
  m = buscarEn(T, j, CONTACTO_PROPIO);
  if (m) return { tipo: 'contactoPropio', fin: MISMO.has(T[m.fin]?.w) ? m.fin + 1 : m.fin };
  m = buscarEn(T, j, NOMBRE);
  if (m && T[m.fin] && T[m.fin].tipo !== 's') return { tipo: 'nombre', fin: m.fin };
  if ((buscarEn(T, j, TELEFONO_PREVIO) && T[(buscarEn(T, j, TELEFONO_PREVIO)).fin]?.tipo === 'n') || esTelefono(T, j)) {
    const fin = finDeTelefono(T, j);
    if (fin > j) return { tipo: 'telefono', fin };
  }
  // «usa correos formales», «usa datos de la Cámara de Comercio»: una instrucción de cómo hacerlo (no un país ni un producto).
  if (usaComoVerbo(x, j)) return { tipo: 'usar', fin: finDeRazon(x, j + 1) };
  // «a las 8 de la mañana», «at 8am»: todavía no se puede elegir la hora. Se pregunta (nunca se pierde sin avisar).
  const hora = horaDeRevisar(x, j);
  if (hora) return { tipo: 'trabajoActual', fin: hora };
  // «que me lo mandes cada día», «mándamela por WhatsApp»: mandarle los resultados a él no es contactar a nadie.
  m = buscarEn(T, j, MANDAME);
  if (m) {
    let fin = m.fin;
    const canal = ['por', 'via', 'by', 'on', 'al', 'to'].includes(T[fin]?.w) ? fin + 1 : -1;
    const whatsapp = canal > 0 && ['whatsapp', 'wasap', 'wa', 'whatsap'].includes(T[canal]?.w);
    if (whatsapp) fin = canal + 1;
    return { tipo: 'mandame', fin, whatsapp };
  }
  // «no hago entregas en Cienfuegos», «no hago delivery a Gurabo», «we don't deliver to Moca»: ese lugar se excluye.
  const entrega = entregaNegadaEn(x, j);
  if (entrega) return entrega;
  const cap = capacidadEn(x, j);
  if (cap) return cap;
  const frec = frecuenciaEn(x, j);
  if (frec) return frec;
  if (x.tipo === 'laboral') {
    const actual = trabajoActual(x, j);
    if (actual) return actual;
  }
  // «para mi hijo», «for my wife»: la búsqueda es para otra persona. Se pregunta.
  if (x.tipo === 'laboral') {
    const otra = paraOtraPersona(x, j);
    if (otra) return { tipo: 'trabajoActual', fin: otra };
  }
  // «pagado en dólares», «bien pagado», «paid in dollars»: una preferencia del empleo.
  if (x.tipo === 'laboral') {
    const q = ['bien', 'well', 'mejor', 'better'].includes(t.w) ? j + 1 : j;
    if (['pagado', 'pagada', 'pagados', 'pagadas', 'paid'].includes(T[q]?.w)) {
      if (q > j) return { tipo: 'horario', fin: q + 1 };
      if (['en', 'in'].includes(T[q + 1]?.w) && ['dolares', 'dolar', 'pesos', 'usd', 'dollars', 'us$', 'rd$'].includes(T[q + 2]?.w)) return { tipo: 'horario', fin: q + 3 };
    }
    // «pago en dólares», «que paguen en dólares» (sin cifra): también.
    const r = T[q]?.w === 'que' ? q + 1 : q;
    if (['pago', 'paga', 'pagan', 'paguen', 'pague'].includes(T[r]?.w) && ['en', 'in'].includes(T[r + 1]?.w)
      && ['dolares', 'dolar', 'pesos', 'usd', 'dollars', 'us$', 'rd$'].includes(T[r + 2]?.w) && !esFuerte(T[r + 3]) && (esComa(T[r + 3]) || !T[r + 3] || T[r + 3].tipo !== 'n')) {
      let fin = r + 3;
      // «pago en dólares, mínimo US$800»: la moneda ya va con la cifra. «…, mínimo 800»: la cifra va con lo de antes (se pregunta el salario).
      const sal = esComa(T[fin]) ? salarioEn(T, fin + 1) : null;
      const moneda = ['pesos', 'rd$'].includes(T[r + 2].w) ? 'DOP' : 'USD';
      if (sal && sal.montos.length && sal.montos.every(mm => mm.moneda === moneda)) return { tipo: 'relleno', fin };
      const cifra = esComa(T[fin]) && (T[fin + 1]?.tipo === 'n' || T[fin + 2]?.tipo === 'n' || sal);
      if (!cifra) return { tipo: 'horario', fin };
    }
  }
  const salario = salarioEn(T, j);
  if (salario) return { tipo: 'salario', fin: salario.fin, tramo: salario };
  // «sueldo de veinte mil pesos», «quiero ganar treinta mil»: un salario escrito con letras. Se pregunta el salario.
  if (x.tipo === 'laboral') {
    const escrito = salarioEscritoEn(x, j);
    if (escrito) return { tipo: 'salarioEscrito', fin: escrito };
  }
  // «pagan 20 mil pero quiero 30»: otra cifra para el salario, sin «mil». No se sabe cuál es el mínimo: se pregunta el salario.
  if (x.tipo === 'laboral' && x.tramosSalario.length && ['quiero', 'pido', 'aspiro', 'quisiera', 'want', 'necesito'].includes(t.w)) {
    const q = ['a', 'unos', 'like', 'about'].includes(T[j + 1]?.w) ? j + 2 : j + 1;
    if (T[q]?.tipo === 'n' && /^\d{1,3}$/.test(T[q].w) && !salarioEn(T, q) && !(T[q + 1] && (PALABRAS_SALARIO.has(T[q + 1].w) || ['mil', 'k', 'pesos', 'millones', 'dolares', 'usd'].includes(T[q + 1].w)))) {
      return { tipo: 'salarioDudoso', fin: q + 1 };
    }
  }
  // «de 7 a 3», «de 8am a 5pm»: un horario (una preferencia).
  const horario = horarioEn(T, j);
  if (horario) return { tipo: 'horario', fin: horario };
  m = buscarEn(T, j, CANTIDAD);
  if (m && T[m.fin]?.tipo === 'n' && T[m.fin + 1]?.tipo === 'p' && UNIDADES.has(T[m.fin + 1].w)) return { tipo: 'condicion', fin: m.fin, clave: 'cantidad' };
  // «de lunes a viernes»: un horario.
  if (['de', 'from', 'los'].includes(t.w) && DIAS.has(T[j + 1]?.w) && ['a', 'al', 'to', 'hasta', 'y'].includes(T[j + 2]?.w) && DIAS.has(T[j + 3]?.w)) {
    return { tipo: 'horario', fin: j + 4 };
  }
  // «No vendo paneles», «no páginas web», «not generators»: lo negado no es lo que se vende.
  m = buscarEn(T, j, NEG_PRODUCTO);
  // «No vendo al detalle»: lo negado es cómo vende, no a quién.
  if (m && (!['a', 'al', 'to', 'nada', 'en', 'in'].includes(T[m.fin]?.w) || buscarEn(T, m.fin, MODO_DE_VENTA))) return { tipo: 'negproducto', fin: m.fin };
  // «solo al por mayor: arroz y habichuelas»: cómo vende; con dos puntos, lo que sigue es lo que vende.
  if (x.tipo === 'comercial') {
    const q = ['solo', 'solamente', 'sino', 'only'].includes(t.w) ? j + 1 : j;
    const modo = buscarEn(T, q, MODO_DE_VENTA);
    if (modo && (q === j + 1 || !x.usado[j - 1])) {
      const dosPuntos = esComa(T[modo.fin]) && x.original[T[modo.fin].ini] === ':';
      if (dosPuntos && T[modo.fin + 1]?.tipo === 'p') return { tipo: 'producto', fin: modo.fin + 1, frase: 'modo' };
      return { tipo: 'relleno', fin: modo.fin };
    }
  }
  if (['no', 'not', 'ni', 'nor'].includes(t.w) && datoDe(x, j + 1, 'producto') && !datoDe(x, j + 1, 'sector')) return { tipo: 'negproducto', fin: j + 1 };
  m = buscarEn(T, j, NO_TENGO);
  if (m && x.tipo === 'comercial' && T[m.fin] && T[m.fin].tipo !== 's') return { tipo: 'notengo', fin: m.fin };
  m = buscarEn(T, j, ORIGEN);
  if (m && origenValido(x, j, m)) return { tipo: 'origen', fin: m.fin };
  m = buscarEn(T, j, EXCLUIR);
  if (m && exclusionValida(x, j, m)) {
    // «menos Las Caobas»: el artículo es parte del nombre del lugar.
    const fin = ARTICULOS.has(T[m.fin - 1].w) && m.fin - 1 > j && lugarEn(x, m.fin - 1, true)?.que === 'zona' ? m.fin - 1 : m.fin;
    return { tipo: 'excluir', fin, frase: m.datos[0].frase, generico: Boolean(m.datos[0].generico), condicional: Boolean(m.datos[0].condicional) };
  }
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
  m = buscarEn(T, j, PORQUE);
  if (m) return { tipo: 'razon', fin: m.fin };
  m = buscarEn(T, j, SOY);
  if (m && negocioPropioEn(x, m.fin, m.datos[0].frase)) return { tipo: 'propio', fin: m.fin, frase: m.datos[0].frase, negado: ['no', 'not'].includes(T[j - 1]?.w) };
  if (x.tipo === 'laboral') {
    const antes = puestoAntesDeJob(x, j);
    if (antes) return antes;
    m = buscarEn(T, j, PUESTO);
    if (m && puestoValido(x, j, m)) return { tipo: 'puesto', fin: m.fin };
  } else {
    m = buscarEn(T, j, PRODUCTO);
    // «negocios que venden comida», «a quienes venden carros»: lo que venden ELLOS describe a quién se busca.
    // «tengo una empresa que vende paneles»: si la empresa es la suya, sí es lo que vende.
    // «los que más venden»: también con una palabra en medio.
    const q = ['mas', 'menos', 'mejor', 'ya', 'tambien', 'most', 'more'].includes(T[j - 1]?.w) ? j - 1 : j;
    const ellos = m && VENDEN_ELLOS.has(m.datos[0].frase) && ['que', 'quienes', 'that', 'who', 'which', 'los', 'las'].includes(T[q - 1]?.w)
      && !(x.usado[q - 2] && !x.rolObjetivo[q - 2]);
    if (m && !ellos) {
      return { tipo: 'producto', fin: m.fin, frase: m.datos[0].frase };
    }
  }
  m = buscarEn(T, j, PROPIO);
  if (m && negocioPropioEn(x, m.fin, m.datos[0].frase)) return { tipo: 'propio', fin: m.fin, frase: m.datos[0].frase };
  m = buscarEn(T, j, CERCA);
  if (m && T[m.fin] && !esFuerte(T[m.fin])) return { tipo: 'cerca', fin: m.fin };
  m = buscarEn(T, j, DIRECCION);
  if (m && T[m.fin] && T[m.fin].tipo !== 's' && (!esRelleno(T[m.fin].w) || (['de', 'del'].includes(T[m.fin].w) && (T[m.fin + 1]?.mayus || x.ent[m.fin + 1])))) {
    return { tipo: 'direccion', fin: m.fin };
  }
  m = buscarEn(T, j, PERO);
  if (m) {
    // «to everyone in Santiago but the banks»: después de «todos», «pero» quiere decir «excepto».
    let k = m.fin;
    if (ARTICULOS.has(T[k]?.w)) k++;
    const sector = datoDe(x, k, 'sector');
    if (x.general.visto && !x.sectores.length && ['but', 'pero'].includes(t.w) && sector && !sector.general) return { tipo: 'excluir', fin: m.fin, frase: t.w };
    return { tipo: 'pero', fin: m.fin };
  }
  m = buscarEn(T, j, VERBOS);
  if (m) return { tipo: 'verbo', fin: m.fin };
  return null;
}

const MANDAME = indice(['mandamela', 'mandamelo', 'mandamelos', 'mandamelas', 'enviamela', 'enviamelo', 'enviamelos', 'me la mandas', 'me lo mandas',
  'me los mandas', 'me lo mandes', 'me la mandes', 'me los mandes', 'que me lo mandes', 'que me la mandes', 'que me los mandes', 'me lo envies', 'que me lo envies',
  'send it to me', 'send them to me', 'send me the list', 'mandame la lista', 'enviame la lista']);
// Dónde no entrega: «no hago entregas en…», «no hago delivery a…», «no llego a…». Con un lugar, se excluye; sin lugar, se pregunta.
const ENTREGA = indicePorClave([
  [{ conNombre: true }, ['no hago entregas', 'no hacemos entregas', 'no hago delivery', 'no hacemos delivery', 'no hago envios', 'no hacemos envios',
    'no hago domicilios', 'no hacemos domicilios', 'no doy delivery', 'no damos delivery', 'we dont deliver', 'i dont deliver', 'dont deliver',
    'we do not deliver', 'i do not deliver', 'no delivery', 'no deliveries']],
  [{}, ['no entrego', 'no entregamos', 'no reparto', 'no repartimos', 'no llego', 'no llegamos', 'no llevo', 'no llevamos', 'no despacho', 'no despachamos',
    'no envio', 'no enviamos', 'no doy servicio', 'no damos servicio']],
]);
function entregaNegadaEn(x, j) {
  const { T } = x;
  // «pero no hago delivery a Gurabo»: el «pero» va con lo que sigue.
  const m = buscarEn(T, ['pero', 'y', 'e', 'but', 'and'].includes(T[j].w) ? j + 1 : j, ENTREGA);
  if (!m) return null;
  let q = m.fin;
  while (q < x.n && q - m.fin < 3 && ['a', 'al', 'en', 'para', 'pa', 'hasta', 'to', 'in'].includes(T[q].w)) q++;
  const L = lugarTras(x, q);
  if (L && L.L.que === 'zona') return { tipo: 'entrega', fin: m.fin, lugar: L.q };
  if (q > m.fin && pareceLugar(x, q)) return { tipo: 'entrega', fin: m.fin, lugar: q };
  return m.datos[0].conNombre ? { tipo: 'entrega', fin: m.fin, lugar: -1 } : null;
}

const VENDEN_ELLOS = new Set(['venden', 'vende', 'vendan', 'venda', 'sell', 'sells', 'ofrecen', 'ofrece', 'ofrezcan', 'ofrezca', 'offer', 'offers', 'selling']);
const NEGACIONES = new Set(['no', 'not', 'dont', 'nunca', 'never', 'ni', 'jamas']);

function horaDeRevisar(x, j) {
  const { T } = x;
  let k = j;
  if (['a', 'at', 'around', 'como'].includes(T[k].w)) k++; else return 0;
  const conArticulo = ['las', 'la'].includes(T[k]?.w);
  if (conArticulo) k++;
  const t = T[k];
  if (!t || t.tipo !== 'n' || !/^\d{1,2}([:.]\d{2})?$/.test(t.w) || Number(t.w.split(/[:.]/)[0]) > 24) return 0;
  k++;
  let conHora = conArticulo;
  if (['am', 'pm', 'oclock', 'hrs', 'horas', 'h'].includes(T[k]?.w)) { k++; conHora = true; }
  if (['de', 'del', 'in'].includes(T[k]?.w) && ['la', 'the'].includes(T[k + 1]?.w) && ['manana', 'tarde', 'noche', 'madrugada', 'morning', 'afternoon', 'evening'].includes(T[k + 2]?.w)) { k += 3; conHora = true; }
  if (!conHora && T[j].w === 'at' && !(T[k] && (PALABRAS_SALARIO.has(T[k].w) || ['mil', 'k', 'pesos', 'dollars'].includes(T[k].w)))) conHora = true;
  return conHora ? k : 0;
}

// ¿Hay un «no» poco antes, en la misma frase? («I don't want to find investors»).
function negadoAntes(x, j) {
  for (let k = j - 1; k >= 0 && k >= j - 4; k--) {
    const t = x.T[k];
    if (t.tipo === 's') return false;
    if (NEGACIONES.has(t.w) || (t.w === 'do' && x.T[k + 1]?.w === 'not')) return true;
  }
  return false;
}

// «Ah no, mejor…», «no wait»: solo es una corrección al empezar una parte de la frase.
function correccionValida(x, j, m) {
  const anterior = x.T[j - 1];
  if (['ah no', 'no mejor', 'mejor no', 'o mejor', 'no no', 'no espera', 'no espere', 'no wait'].includes(m.datos[0].frase)) {
    return !anterior || esFuerte(anterior) || esComa(anterior);
  }
  // «en Santiago, digo, en Puerto Plata»: «digo» solo corrige entre comas.
  if (m.datos[0].frase === 'digo') return esComa(anterior) && (esComa(x.T[m.fin]) || !x.T[m.fin]);
  return true;
}

// «Vivo en Moca», «soy de San Juan», «desde Santiago»: solo si después viene un lugar.
function origenValido(x, j, m) {
  const L = lugarTras(x, m.fin);
  // «Vivo en Miami», «I live in New York»: dónde vive la persona, aunque sea fuera del país (no es dónde busca).
  if (L && L.L.que === 'extranjero' && m.datos[0].frase !== 'desde') return true;
  if (!L || L.L.que !== 'zona') return false;
  // «Vendo software desde Santiago»: después de lo que se vende es de dónde sale. «trabajo desde casa» no es un lugar.
  if (m.datos[0].frase === 'desde') return x.tipo === 'comercial' && x.usado[j - 1] === 1;
  return true;
}

// «Ahora trabajo en una banca», «Gano 25 mil en una banca»: el empleo que la persona ya tiene, no una preferencia.
function trabajoActual(x, j) {
  const { T } = x;
  const anterior = T[j - 1];
  if (anterior && !esFuerte(anterior) && !esComa(anterior) && !['y', 'pero', 'ahora', 'actualmente', 'hoy'].includes(anterior.w)) return null;
  let k = j;
  if (['ahora', 'actualmente', 'hoy', 'now', 'currently'].includes(T[k]?.w)) k++;
  if (['i', 'yo'].includes(T[k]?.w)) k++;
  const w = T[k]?.w;
  let desde = -1;
  if (['trabajo', 'work', 'trabaja'].includes(w) && ['en', 'para', 'at', 'for', 'in'].includes(T[k + 1]?.w)) desde = k + 1;
  else if (['gano', 'cobro', 'earn'].includes(w) && T[k + 1]?.tipo === 'n') desde = k + 1;
  else if (w === 'estoy' && T[k + 1]?.w === 'trabajando') desde = k + 2;
  if (desde < 0) return null;
  // «Trabajo en Santiago»: un lugar solo se deja como lugar.
  const L = lugarTras(x, desde + (['en', 'in', 'at'].includes(T[desde]?.w) ? 1 : 0));
  if (L && L.L.que === 'zona' && w !== 'gano') return null;
  let fin = desde;
  while (fin < x.n && !esFuerte(T[fin]) && !esComa(T[fin]) && !['pero', 'but', 'busco', 'quiero', 'necesito', 'looking', 'y', 'and'].includes(T[fin].w)) fin++;
  return { tipo: 'trabajoActual', fin };
}

// Disparadores que solo excluyen si después viene un negocio, un tamaño o un lugar («ningún problema», «nada en especial» no excluyen).
const SOLO_CON_DATO = new Set(['ningun', 'ninguna', 'ningunos', 'ningunas', 'nada en', 'skip', 'skip the', 'besides', 'forget', 'olvida', 'olvidate',
  // «I don't care about Moca» excluye; «I don't care about the price» no.
  'dont care about', 'i dont care about', 'do not care about', 'i do not care about']);

function exclusionValida(x, j, m) {
  const { T } = x;
  const d = m.datos[0];
  const siguiente = T[m.fin];
  if (!siguiente || siguiente.tipo === 's') return false;
  if (siguiente.w === 'nada' || siguiente.w === 'anything') return false;
  if (SOLO_CON_DATO.has(d.frase)) {
    // «besides restaurants» solo es «excepto» si antes se dijo a quién o dónde se busca («all businesses… besides…»).
    if (d.frase === 'besides' && !x.general.visto && !x.sectores.length && !x.zonas.length) return false;
    let conDato = false;
    for (let k = m.fin; k < x.n && k - m.fin < 4 && !esFuerte(T[k]) && !esComa(T[k]); k++) {
      if (x.ent[k]?.datos.some(dd => ['sector', 'zona', 'tamano'].includes(dd.que)) || lugarEn(x, k, true)) conDato = true;
    }
    return conDato;
  }
  if (d.menos || (d.frase.startsWith('menos') && !d.condicional)) {
    const a1 = T[j - 1]?.w;
    const a2 = T[j - 2]?.w;
    if (a1 === 'al' || a1 === 'a' || (a1 === 'lo' && a2 === 'por') || (a1 === 'o' && a2 === 'mas') || a1 === 'mas') return false;
    if (siguiente.tipo === 'n' || siguiente.w === 'que' || siguiente.w === 'mal' || (siguiente.w === 'de' && T[m.fin + 1]?.tipo === 'n')) return false;
  }
  if (d.generico) {
    if (NO_ES_EXCLUSION.has(siguiente.w) || VERBOS_REVISAR.has(siguiente.w)) return false;
    // «pero no menos de 25 mil», «not less than 20k»: es parte del salario, no algo que excluir.
    if (['menos', 'mas', 'less', 'more', 'inferior', 'below', 'under'].includes(siguiente.w)) {
      let q = m.fin + 1;
      while (q < x.n && q - m.fin < 4 && ['de', 'than', 'a', 'to', 'del', 'rd$', 'us$', '$'].includes(T[q].w)) q++;
      if (T[q]?.tipo === 'n') return false;
    }
    if (buscarEn(T, m.fin, EXCLUIR)) return true;
    if (INICIO_DE_EXCLUSION.has(siguiente.w)) return true;
    const e = x.ent[m.fin];
    if (e && e.datos.some(dd => ['sector', 'zona', 'tamano', 'capcosa', 'extranjero', 'pais'].includes(dd.que))) return true;
    // «no fines de semana», «not part time», «no por turnos»: una condición del empleo que se excluye.
    if (x.tipo === 'laboral' && condicionLaboralEn(x, ['por', 'de', 'a', 'en', 'at', 'on'].includes(siguiente.w) ? m.fin + 1 : m.fin)) return true;
    // Al empezar una parte de la frase («, not in public schools»), si lo que sigue nombra un negocio o un lugar, se excluye.
    const anterior = T[j - 1];
    if (anterior && !esFuerte(anterior) && !esComa(anterior) && !['pero', 'but', 'y', 'and'].includes(anterior.w)) return false;
    for (let k = m.fin; k < x.n && k - m.fin < 4 && !esFuerte(T[k]) && !esComa(T[k]); k++) {
      if (x.ent[k]?.datos.some(dd => ['sector', 'zona', 'tamano'].includes(dd.que))) return true;
    }
    return false;
  }
  return true;
}

const NO_ES_EXCLUSION = new Set(['soy', 'somos', 'am', 'im', 'se', 'importa', 'necesariamente', 'tan', 'hay', 'tengo', 'tiene', 'solo', 'only', 'just', 'solamente', 'es', 'era', 'fue',
  'puedo', 'puede', 'pude', 'creo', 'estoy', 'gracias', 'problem', 'problema', 'wait', 'mejor', 'espera', 'digo', 'hace', 'me', 'te', 'lo', 'le', 'sabe',
  'sabes', 'need', 'necesito', 'hagas', 'thanks', 'idea', 'matter', 'sure', 'he', 'ha', 'hemos', 'han', 'have', 'has']);

// ¿Empieza en «k» una condición del empleo («fines de semana», «tiempo parcial», «turnos»)?
function condicionLaboralEn(x, k) {
  const c = buscarEn(x.T, k, CONDICION);
  return Boolean(c && c.datos[0].clave === 'laboral');
}

function condicionValida(x, j, m) {
  const { T } = x;
  const d = m.datos[0];
  const siguiente = T[m.fin];
  if (d.clave === 'laboral') return x.tipo === 'laboral' && !['buenas', 'buenos', 'good'].includes(T[j - 1]?.w);
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

// ---------- Capacidades ----------
function capacidadEn(x, j) {
  const { T } = x;
  if (!T[j]) return null;
  const n = buscarEn(T, j, NEG_CAP);
  if (n) {
    const r = capacidadesDespues(x, n.fin);
    if (r) return { tipo: 'cap', neg: true, fin: r.fin, claves: r.claves, enviar: r.enviar, frase: r.frase };
    // «prepara los correos pero no los mandes»: no enviar (preparar, sí).
    const k = saltarPequenas(x, n.fin);
    const t = T[k];
    if (t && (ENVIAR.has(t.w) || ['escribas', 'escriban', 'llames', 'llamen', 'contactes', 'contacten', 'call', 'contact'].includes(t.w))
      && (!T[k + 1] || esFuerte(T[k + 1]) || esComa(T[k + 1]) || ['porque', 'because', 'y', 'pero', 'and', 'but', 'todavia', 'aun', 'yet', 'hasta'].includes(T[k + 1].w))) {
      return { tipo: 'cap', neg: true, fin: k + 1, claves: ['contactar'], enviar: false };
    }
  }
  const v = buscarEn(T, j, CAP_VERBOS);
  // «se llama Solar Caribe», «me pueden llamar al 809…»: no es pedir que OPORTIA contacte a nadie.
  const aMi = T[j - 1]?.w === 'me' || (T[j - 2]?.w === 'me' && ['pueden', 'puede', 'puedes', 'van', 'vas', 'deben'].includes(T[j - 1]?.w));
  const alNumero = ['al', 'a'].includes(T[v?.fin]?.w) && T[v.fin + 1]?.tipo === 'n';
  if (v && !(T[j - 1] && ['no', 'sin', 'ni', 'dont', 'not', 'never', 'nunca', 'se'].includes(T[j - 1].w)) && !aMi && !alNumero) {
    return { tipo: 'cap', neg: false, fin: v.fin, claves: [v.datos[0].clave], enviar: false, frase: v.datos[0].frase };
  }
  const p = buscarEn(T, j, PEDIR);
  if (p) {
    const r = cosasDespues(x, p.fin);
    // «envía mi currículum a las empresas», «manda los correos»: enviar ya es contactar.
    if (r) return { tipo: 'cap', neg: false, fin: r.fin, claves: r.claves, enviar: ENVIAR.has(p.datos[0].frase) && r.claves.some(c => c === 'correos' || c === 'propuestas') };
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
  if (v) return { fin: v.fin, claves: [v.datos[0].clave], enviar: false, frase: v.datos[0].frase };
  const p = buscarEn(T, j, PEDIR);
  if (p) {
    const r = cosasDespues(x, p.fin);
    if (r) return { ...r, enviar: ENVIAR.has(p.datos[0].frase) && r.claves.some(c => c === 'correos' || c === 'propuestas') };
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
  if (!T[j]) return null;
  let k = j;
  let neg = false;
  if (T[k].w === 'no' || T[k].w === 'not') { neg = true; k++; } else if ((T[k].w === 'pero' || T[k].w === 'y') && T[k + 1]?.w === 'no') { neg = true; k += 2; }
  // «…, noches no» al final del texto: después del «no» no queda nada.
  if (!T[k]) return null;
  const m = buscarEn(T, k, FREC_FRASES);
  if (m) {
    const d = m.datos[0];
    // «cada día no, cada semana»: el «no» de después también niega.
    if (T[m.fin]?.w === 'no' && (esComa(T[m.fin + 1]) || esFuerte(T[m.fin + 1]))) return { tipo: 'frec', fin: m.fin + 1, ini: k, clave: d.clave, neg: true };
    // «los lunes y los jueves»: dos veces por semana todavía no existe. Se pregunta.
    if (d.dia && (['y', 'e', 'o', 'and', 'or'].includes(T[m.fin]?.w) || esComa(T[m.fin]))) {
      const q = ['los', 'el', 'cada', 'every', 'on'].includes(T[m.fin + 1]?.w) ? m.fin + 2 : m.fin + 1;
      if (DIAS.has(T[q]?.w)) return { tipo: 'frec', fin: q + 1, ini: k, clave: d.clave, nd: true, neg };
    }
    return { tipo: 'frec', fin: m.fin, ini: k, clave: d.clave, nd: Boolean(d.nd), dia: Boolean(d.dia), neg };
  }
  const a = buscarEn(T, k, FREC_ADV);
  if (a && contextoDeFrecuencia(x, k, a.fin)) return { tipo: 'frec', fin: a.fin, ini: k, clave: a.datos[0].clave, neg };
  // «dos veces a la semana», «3 veces al día», «5 times a week»: todavía no existen. Se preguntan.
  const cuantas = VECES.has(T[k].w) || (T[k].tipo === 'n' && /^\d{1,2}$/.test(T[k].w));
  if (cuantas && ['veces', 'times'].includes(T[k + 1]?.w)) {
    const p = buscarEn(T, k + 2, PERIODO_DE_VECES);
    if (p) return { tipo: 'frec', fin: p.fin, ini: k, nd: true, neg };
  }
  // «quincenal» suelto: una frecuencia que no existe; con dinero al lado es un salario («quincenal 12 mil»).
  const suelta = buscarEn(T, k, FREC_ND_SUELTAS);
  if (suelta && (x.tipo === 'comercial' ? sinDineroCerca(x, k, suelta.fin) : contextoDeFrecuencia(x, k, suelta.fin))) {
    return { tipo: 'frec', fin: suelta.fin, ini: k, nd: true, neg };
  }
  return null;
}

function sinDineroCerca(x, k, fin) {
  const { T } = x;
  const despues = T[fin];
  if (despues && (PALABRAS_SALARIO.has(despues.w) || despues.tipo === 'n' || ['rd$', 'us$', '$', 'de'].includes(despues.w))) return false;
  for (let b = k - 1; b >= 0 && b >= k - 4; b--) {
    const t = T[b];
    if (esFuerte(t)) break;
    if (t.tipo === 'n' || PALABRAS_SALARIO.has(t.w) || ['mil', 'pesos', 'k'].includes(t.w)) return false;
  }
  return true;
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
  // «Vendo paneles a hoteles en Santiago. Mensual.», «… in Santiago. Monthly.»: una oración que es solo la frecuencia (si lo de antes
  // no termina en un número o un salario: «…25 mil. Mensual.» es el periodo del salario).
  const solaAntes = k === 0 || (esFuerte(T[k - 1]) && !(T[k - 2] && (T[k - 2].tipo === 'n' || PALABRAS_SALARIO.has(T[k - 2].w))));
  if (solaAntes && esFuerte(T[fin])) return true;
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
  x.senalesNegadas = [];
  for (let i = 0; i < x.n;) {
    const m = buscarEn(T, i, FUERTES);
    // «I'm not looking for a job», «no busco trabajo»: lo negado no cuenta (y no se pregunta).
    const fin = m ? T[m.fin] : null;
    const negada = m && m.datos[0].lado === 'laboral' && ['no', 'not', 'nunca', 'never'].includes(T[i - 1]?.w)
      && (!fin || esFuerte(fin) || esComa(fin) || ['pero', 'but', 'sino'].includes(fin.w));
    if (negada) { x.senalesNegadas.push([['im', 'estoy', 'am', 'yo'].includes(T[i - 2]?.w) ? i - 2 : i - 1, m.fin]); i = m.fin; continue; }
    if (m) { fuertes.push({ lado: m.datos[0].lado, i }); if (m.datos[0].clientes) x.pideClientes = true; i = m.fin; continue; }
    const d = buscarEn(T, i, DEBILES);
    if (d) { debiles[d.datos[0].lado]++; i = d.fin; continue; }
    i++;
  }
  x.tieneVenta = fuertes.some(f => f.lado === 'comercial');
  const primero = fuertes[0];
  if (primero) {
    // Una señal del otro lado dentro de una frase que depende de la primera no cuenta:
    // «busco trabajo en una empresa QUE VENDE…», «vendo software DE EMPLEOS».
    const otros = fuertes.filter(f => f.lado !== primero.lado && !['que', 'de', 'para', 'of', 'for', 'that', 'a', 'al', 'los', 'las', 'unos', 'unas', 'to', 'en',
      'in'].includes(T[f.i - 1]?.w));
    if (otros.length) return { tipo: primero.lado, duda: true };
    return { tipo: primero.lado };
  }
  if (debiles.laboral > debiles.comercial) return { tipo: 'laboral', supuesto: 'tipo_laboral' };
  return { tipo: 'comercial', supuesto: 'tipo' };
}

// ---------- A quién se busca ----------
// Analiza un pedazo como «hoteles grandes», «empresas de seguridad», «clínicas privadas», «pymes».
// «enListaConNegocios»: en la misma lista hay negocios concretos («hoteles, clínicas, fábricas y negocios grandes»).
function analizarNegocio(x, a, b, { libre, enListaConNegocios = false }) {
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
  // «empresas de www.santiago.gob.do»: con un enlace dentro no se sabe a quién busca. Se pregunta.
  if (hayEnlace(x, s, ultimo)) { agregarDuda(x, 'texto', valorLibre); return true; }
  // «clínicas y oficinas…, pero las oficinas solo si son grandes»: un tamaño solo para una parte no se puede buscar así. Se pregunta.
  const claves = new Set(sectores.map(sc => sc.dato.clave));
  if (x.tipo === 'comercial' && tamanos.length && claves.size && [...claves].every(c => x.sectores.includes(c)) && new Set(x.sectores).size > claves.size) {
    agregarDuda(x, 'combinacion_parcial', texto(x, a, b));
    return true;
  }
  // «negocios grandes», «empresas medianas y grandes»: un tamaño que va solo con la palabra general.
  const generalConTamano = x.tipo === 'comercial' && general && !sectores.length && !desconocidas.length && tamanos.length > 0;
  // En la misma lista que negocios concretos («hoteles, clínicas, fábricas y negocios grandes»), el tamaño es solo para ese grupo
  // general: los hoteles, las clínicas y las fábricas son de todo tamaño. Eso todavía no se puede guardar en un proyecto: no se
  // aplica el tamaño a todos y se pregunta (duda «tamano_del_general»).
  if (generalConTamano && enListaConNegocios) {
    x.general.visto = true;
    x.generalesEnLista.push(valorLibre);
    x.generalesConTamano.push(valorLibre);
    return true;
  }
  // Sola en su lista («Quiero encontrar empresas medianas y grandes de RD… Investiga hoteles, clínicas…»), dice de qué tamaño son
  // todos los negocios que busca: el tamaño vale para todos y no hace falta preguntar si busca «cualquier negocio».
  if (generalConTamano) x.generalesMarco.push(valorLibre);
  if (x.tipo === 'comercial') for (const t of tamanos) x.tamanos.add(t.clave);
  const guardarSector = sc => {
    x.sectores.push(sc.dato.clave);
    if (!x.palabrasSector.has(sc.dato.clave)) x.palabrasSector.set(sc.dato.clave, new Set());
    x.palabrasSector.get(sc.dato.clave).add(comparable(texto(x, sc.j, sc.fin)));
  };
  if (!sectores.length && !general && !desconocidas.length) {
    if (tamanos.some(t => t.empresa)) { x.general.visto = true; x.generalesEnLista.push(valorLibre); return true; }
    // «no a ferreterías pequeñas, solo a las grandes»: se buscan las ferreterías grandes. Si hay otros negocios, el tamaño
    // es solo para las ferreterías: se pregunta al final.
    if (x.tipo === 'comercial' && tamanos.length && x.negocioConTamanoExcluido) {
      x.sectores.push(x.negocioConTamanoExcluido);
      x.tamanoDeUnNegocio = `${x.textoDelNegocioConTamano} … ${texto(x, a, b)}`;
    }
    return tamanos.length > 0;
  }
  if (!desconocidas.length && sectores.length === 1) { guardarSector(sectores[0]); return true; }
  if (!desconocidas.length && !sectores.length && general) {
    x.general.visto = true;
    if (general.todos) x.general.todos = true;
    x.generalesEnLista.push(valorLibre);
    return true;
  }
  if (!desconocidas.length && general && deDespuesDeGeneral && sectores.length === 1) { guardarSector(sectores[0]); return true; }
  // «Le vendo agua a Banreservas y quiero más bancos», «Ya le vendo a la UASD»: ese negocio con nombre propio ya es su cliente.
  // No se busca: se excluye (ya le compra).
  if (valorLibre && libre && (x.leVende || x.quiereMas) && !sectores.length && hayNombrePropio(x, s, ultimo)) {
    if (x.exclusiones.length < TOPE) x.exclusiones.push(valorLibre);
    x.supuestos.add('clientes_actuales');
    return true;
  }
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

// «barberías del Distrito»: una palabra común sola no es el nombre de un lugar.
const PALABRAS_DE_LUGAR = new Set(['distrito', 'sector', 'zona', 'barrio', 'ciudad', 'pueblo', 'provincia', 'municipio', 'capital', 'centro', 'area', 'region',
  'pais', 'campo', 'norte', 'sur', 'este', 'oeste']);
// Palabras de negocio que también son adjetivos: en «hoteles boutique» no empieza otro negocio.
const ADJETIVOS_DE_NEGOCIO = new Set(['boutique', 'spa', 'resort', 'express', 'gourmet', 'apart', 'shop']);

// Lista de a quién se busca: «a hoteles, clínicas y fábricas grandes de Santiago».
// También «hoteles restaurantes clínicas» (sin comas, como en WhatsApp) y «hoteles sí, restaurantes no».
function spanObjetivo(x, k, { libre, deClientes = false }) {
  const { T } = x;
  const items = [];
  let productoDespues = -1;
  let a = k;
  let j = k;
  let fin = k;
  let finDelSectorAnterior = -1;
  while (j < x.n && j - k < 40) {
    const t = T[j];
    if (esFuerte(t)) break;
    if (j > a) {
      // «los talleres no me interesan», «bancos no», «bares tampoco»: lo de antes se excluye. «hoteles sí»: se confirma.
      const neg = negacionDespues(x, j);
      const si = neg ? 0 : afirmacionDespues(x, j);
      if (neg || si) {
        items.push([a, j, Boolean(neg)]);
        marcar(x, j, neg || si);
        j = neg || si;
        a = j;
        if (esComa(T[j]) || SEPARADORES.has(T[j]?.w)) continue;
        break;
      }
    }
    // «negocios que venden comida», «negocios que vendan comida»: lo que venden ellos describe a quién se busca.
    if (['que', 'that', 'who', 'which', 'quienes'].includes(t.w) && VENDEN_ELLOS.has(T[j + 1]?.w) && (j > a || t.w === 'quienes')) { j += 2; continue; }
    if (j > a && detectar(x, j) && !['verbo'].includes(detectar(x, j).tipo)) break;
    if (j > a && detectar(x, j)?.tipo === 'verbo') break;
    // «santiago hoteles software»: un producto pegado al negocio, sin «de», es lo que vende (no parte del negocio).
    if (j > a && x.tipo === 'comercial' && datoDe(x, j, 'producto') && !datoDe(x, j, 'sector') && !['de', 'del', 'of', 'con', 'with'].includes(T[j - 1]?.w)
      && x.ent[j - 1] && !x.productos.length) break;
    if (t.w === 'mas' && T[j + 1]?.w === 'o' && T[j + 2]?.w === 'menos') { j += 3; continue; }
    if (SEPARADORES.has(t.w) && T[j - 1]?.tipo === 'n' && T[j + 1]?.tipo === 'n') { j++; continue; }
    if (esComa(t) || SEPARADORES.has(t.w)) {
      // «Vendo sillas a restaurantes y mesas a hoteles»: después de la «y» viene otro producto con su negocio, no otro negocio.
      if (SEPARADORES.has(t.w) && otroProductoConSuNegocio(x, j + 1)) { productoDespues = j; break; }
      if ((j > a || items.length) && empiezaNegocio(x, j + 1, libre && !esComa(t))) { if (j > a) items.push([a, j]); a = j + 1; j++; continue; }
      if (SEPARADORES.has(t.w) && x.ent[j + 1]?.datos.some(d => d.que === 'tamano')) { if (j > a) items.push([a, j]); a = j + 1; j++; continue; }
      break;
    }
    // «hoteles restaurantes clínicas»: dos negocios conocidos seguidos, sin coma, son dos negocios.
    const sectorAqui = x.ent[j]?.datos.find(d => d.que === 'sector');
    if (sectorAqui) {
      if (j > a && j === finDelSectorAnterior && !sectorAqui.general && !ADJETIVOS_DE_NEGOCIO.has(T[j].w)) { items.push([a, j]); a = j; }
      finDelSectorAnterior = x.ent[j].fin;
    }
    const aqui = j > a ? lugarEn(x, j, false) : null;
    if (aqui && aqui.que !== 'calle') {
      items.push([a, j]);
      fin = listaDeLugares(x, j, 'incluir');
      a = fin;
      j = fin;
      break;
    }
    // «oficinas de lunes a viernes»: el horario no es parte del negocio.
    if (['de', 'from'].includes(t.w) && DIAS.has(T[j + 1]?.w)) break;
    if (['en', 'in', 'on', 'de', 'del', 'of', 'from', 'at', 'across', 'throughout'].includes(t.w)) {
      // «colmados de Pekín y Camboya», «colmados de Los Mameyes»: un nombre propio que no conozco es un lugar a preguntar.
      const nombre = ['de', 'del', 'en', 'in'].includes(t.w) && j > a ? pareceLugar(x, j + 1) : 0;
      if (nombre && !(nombre === j + 2 && PALABRAS_DE_LUGAR.has(T[j + 1].w))) {
        items.push([a, j]);
        marcar(x, j, j + 1);
        fin = listaDeLugares(x, j + 1, 'incluir');
        a = fin;
        j = fin;
        break;
      }
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
      if (['en', 'in', 'at', 'on'].includes(t.w)) break;
    }
    // «en una empresa que vende paneles»: en un empleo, lo que va con «que» describe el lugar de trabajo.
    if (x.tipo === 'laboral' && ['que', 'that', 'which'].includes(t.w) && j > a) {
      let b = j + 1;
      while (b < x.n && b - j < 8 && !esFuerte(T[b]) && !esComa(T[b]) && !(['en', 'in'].includes(T[b].w) && lugarTras(x, b + 1))) b++;
      j = b;
      break;
    }
    // «negocios que venden comida», «businesses that sell fried chicken»: lo que venden ellos describe a quién se busca.
    if (['que', 'that', 'who', 'which', 'quienes'].includes(t.w) && VENDEN_ELLOS.has(T[j + 1]?.w) && (j > a || t.w === 'quienes')) { j += 2; continue; }
    if (['que', 'that', 'who', 'which', 'con', 'with', 'sin', 'without', 'cada', 'every', 'a', 'al', 'to', 'cerca', 'near', 'donde', 'where'].includes(t.w)) break;
    if ((t.w === 'para' || t.w === 'for') && deClientes) break;
    if (t.w === 'para' || t.w === 'for') break;
    j++;
  }
  if (j > a) items.push([a, j]);
  let usadoAlguno = false;
  const enListaConNegocios = items.some(([ia, ib, negado]) => !negado && ib > ia
    && Array.from({ length: ib - ia }, (_, q) => x.ent[ia + q]).some(e => e?.datos.some(d => d.que === 'sector' && !d.general)));
  for (const [ia, ib, negado] of items) {
    if (ib <= ia) continue;
    if (negado) { analizarExclusion(x, ia, ib); continue; }
    if (x.tipo === 'laboral') {
      let desde = ia;
      while (desde > 0 && !x.usado[desde - 1] && ['un', 'una', 'el', 'la', 'los', 'las', 'unos', 'unas'].includes(T[desde - 1].w)) desde--;
      if (desde > 0 && !x.usado[desde - 1] && ['en', 'de', 'in', 'at', 'para'].includes(T[desde - 1].w)) desde--;
      agregarPrioridad(x, desde, ib);
      marcar(x, desde, ib);
      usadoAlguno = true;
      continue;
    }
    if (analizarNegocio(x, ia, ib, { libre, enListaConNegocios })) {
      marcar(x, ia, ib);
      for (let q = ia; q < ib; q++) x.rolObjetivo[q] = 1;
      usadoAlguno = true;
    }
  }
  if (usadoAlguno) x.secuencia.push({ t: 'T' });
  if (productoDespues >= 0) return spanProducto(x, productoDespues, { fin: productoDespues + 1, frase: 'y' });
  return Math.max(j, fin);
}

// «… y mesas a hoteles», «… y gomas a gomeras»: después de una lista de negocios, ¿empieza en «k» otro producto (que no es un negocio
// conocido) seguido de «a» y su negocio? Solo si ya dijo lo que vende.
function otroProductoConSuNegocio(x, k) {
  const { T } = x;
  if (x.tipo !== 'comercial' || !x.productos.length) return false;
  let j = k;
  while (j < x.n && ARTICULOS.has(T[j].w) && !x.ent[j]) j++;
  const t = T[j];
  if (!t || t.tipo !== 'p' || esRelleno(t.w) || x.ent[j]?.datos.some(d => ['sector', 'zona', 'tamano', 'pais', 'extranjero'].includes(d.que)) || detectar(x, j)
    || lugarEn(x, j, true)) return false;
  for (let q = j + 1; q < x.n && q - j <= 4; q++) {
    const w = T[q];
    if (w.tipo === 's') return false;
    if (['a', 'al', 'to'].includes(w.w)) {
      let z = q + 1;
      while (z < x.n && ARTICULOS.has(T[z].w) && !x.ent[z]) z++;
      if (x.ent[z]?.datos.some(d => d.que === 'sector' && !d.general)) return true;
      return Boolean(T[z]?.tipo === 'p' && !esRelleno(T[z].w) && !x.ent[z] && !detectar(x, z) && !lugarEn(x, z, true) && !['precio', 'precios', 'buen', 'mejor', 'credito', 'domicilio'].includes(T[z].w));
    }
    if (x.ent[q]?.datos.some(d => ['sector', 'zona'].includes(d.que)) || (detectar(x, q) && !x.ent[q]) || (PREP_LUGAR_FUERTE.has(w.w) && !['de', 'del'].includes(w.w))) return false;
  }
  return false;
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

// Después de una coma, ¿sigue la misma lista de exclusiones? Solo si lo que viene es de la misma clase
// («excepto Moca, La Vega…» son lugares; «excepto colmados, bares…» son negocios), o empieza con «ni».
// Devuelve dónde empieza lo que sigue, o -1.
function siguePalabraDeExclusion(x, k, clase, d) {
  const { T } = x;
  let j = k;
  if (['ah', 'oh'].includes(T[j]?.w)) j++;
  if (['y', 'and'].includes(T[j]?.w) && ['tambien', 'also'].includes(T[j + 1]?.w)) j += 2;
  else if (['tambien', 'also'].includes(T[j]?.w)) j++;
  if (T[j]?.w === 'ni' || T[j]?.w === 'tampoco' || T[j]?.w === 'nor') return j;
  // «pero no en Santiago, en La Vega»: después de un «no», la misma preposición empieza lo que sí se quiere.
  // Igual con «que no sea en Santo Domingo, en Santiago», «nada en Moca, en La Vega». Con «excepto…» la lista sigue.
  const deLista = /^(excep|salvo|menos|except|exclu|a excepcion|con excepcion|con la excepcion|with the exception|sin|other than|apart|besides)/.test(d?.frase || '');
  if (d && !deLista && j === k && ['en', 'a', 'al', 'de', 'in', 'to', 'para', 'at'].includes(T[j]?.w)) return -1;
  const desde = j;
  if (['y', 'o', 'e', 'and', 'or'].includes(T[j]?.w)) j++;
  const t = T[j];
  if (!t || t.tipo === 's') return -1;
  // «…, y también los de Uvero Alto»: un lugar que sigue a una exclusión de lugares.
  if (ELIPTICOS.has(t.w) && ['de', 'del', 'que', 'in', 'that'].includes(T[j + 1]?.w)) {
    for (let q = j + 1; q < x.n && q - j < 5; q++) {
      const L = lugarEn(x, q, true);
      if (L && L.que === 'zona') return clase === 'zona' ? desde : -1;
    }
  }
  if ((t.w === 'los' || t.w === 'las') && T[j + 1] && !detectar(x, j + 1)) return clase !== 'zona' ? desde : -1;
  if (['en', 'a', 'al', 'de'].includes(t.w)) j++;
  const L = lugarEn(x, j, true);
  if (L && L.que === 'zona') return clase === 'zona' ? desde : -1;
  const e = x.ent[j];
  return clase !== 'zona' && Boolean(e && e.datos.some(dd => ['sector', 'tamano', 'capcosa'].includes(dd.que))) ? desde : -1;
}

// ¿Empieza en «k» otra cosa que no es parte de la exclusión? («… y que tengan piscina», «… and with health insurance»).
function empiezaOtraParte(x, k) {
  const { T } = x;
  const t = T[k];
  if (!t) return true;
  if (['que', 'that', 'which', 'who', 'with', 'con', 'si', 'if', 'ademas', 'tambien', 'also', 'revisa', 'prepara'].includes(t.w)) return true;
  if (capacidadEn(x, k) || frecuenciaEn(x, k)) return true;
  const d = detectar(x, k);
  return Boolean(d && ['verbo', 'prioridad', 'condicion', 'frec', 'cap', 'razon', 'salario', 'producto', 'propio', 'origen', 'cambio'].includes(d.tipo));
}

function spanExcluir(x, i, d) {
  const { T } = x;
  const items = [];
  let a = d.fin;
  let j = d.fin;
  // «los que ya tienen seguro con La Colonial», «a las de Moca que son pequeñas»: con «los que…» o «las de…» la frase sigue entera.
  const e0 = PREPOSICIONES_DE_EXCLUSION.has(T[a]?.w) ? a + 1 : a;
  const conQue = ELIPTICOS.has(T[e0]?.w) && ['que', 'that', 'who', 'de', 'del', 'in'].includes(T[e0 + 1]?.w);
  while (j < x.n && j - d.fin < 30) {
    const t = T[j];
    if (esFuerte(t)) break;
    if (esComa(t)) {
      const sigue = siguePalabraDeExclusion(x, j + 1, claseDeExclusion(x, items.length ? items[0][0] : a, j), d);
      if (sigue >= 0) { items.push([a, j]); marcar(x, j, sigue); a = sigue; j = sigue; continue; }
      // «no busques empresas de mi primo, Seguros Pérez»: el nombre después de la coma es lo que se excluye.
      const nombre = j > a ? finDeNombre(x, j + 1) : j + 1;
      if (nombre > j + 1 && (!T[nombre] || esFuerte(T[nombre]) || esComa(T[nombre])) && !lugarEn(x, j + 1, true)) {
        items.push([a, j]);
        marcar(x, j, j + 1);
        a = j + 1;
        j = nombre;
        break;
      }
      break;
    }
    if (SEPARADORES.has(t.w)) {
      if (['no', 'not'].includes(T[j + 1]?.w) || detectar(x, j + 1)?.tipo === 'cap' || empiezaOtraParte(x, j + 1)) break;
      items.push([a, j]);
      a = j + 1;
      j++;
      continue;
    }
    if (j > a && ['en', 'in'].includes(t.w)) {
      // «… ni Santiago en todo el Cibao»: «todo el» va antes del lugar.
      let z = j + 1;
      while (z < x.n && z - j < 3 && ADJETIVOS_PREVIOS.has(T[z].w) && !x.ent[z]) z++;
      const L = lugarEn(x, z, true);
      const soloPreparacion = Array.from({ length: j - a }, (_, q) => T[a + q].w).every(w => RECORTE_EXCLUSION.has(w) || PREPOSICIONES_DE_EXCLUSION.has(w)
        || ELIPTICOS.has(w) || ['que', 'that', 'who', 'which', 'ones', 'one', 'located', 'based', 'are', 'is'].includes(w));
      // «but no clinics in Moca»: un lugar que no está en «Dónde» va con lo que se excluye.
      const conNegocio = Array.from({ length: j - a }, (_, q) => x.ent[a + q]).some(e => e?.datos.some(dd => dd.que === 'sector' && !dd.general));
      // «except hotels in Santiago and clinics», buscando solo en Santiago: el lugar es el mismo; la lista sigue.
      const mismoLugar = conNegocio && L && L.que === 'zona' && new Set(x.zonas).size === 1 && x.zonas[0] === L.clave;
      const acotado = conNegocio && L && L.que === 'zona' && x.zonas.length && (!x.zonas.includes(L.clave) || mismoLugar);
      if (L && L.que === 'zona' && !soloPreparacion && !acotado && !(ELIPTICOS.has(T[a]?.w) && ['que', 'de'].includes(T[a + 1]?.w))) break;
    }
    const otro = j > a ? detectar(x, j) : null;
    // «pero no a la competencia», «no a mis competidores»: lo negado se excluye.
    // «no quiero clientes que sean colmados», «no quiero hoteles que sean pequeños»: lo que sigue a «que sean» también se excluye.
    const dentro = otro && ((otro.tipo === 'condicion' && (ELIPTICOS.has(T[j - 1]?.w) || otro.corta || otro.clave === 'laboral' || otro.clave === 'sean' || conQue))
      || otro.tipo === 'lugar' || (otro.tipo === 'sin' && j === a) || (otro.tipo === 'objetivoNegado' && otro.clave === 'competidores'));
    if (otro && !dentro) break;
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
    // «no a tiempo parcial», «que no sea de fines de semana»: la preposición no es parte de lo que se excluye.
    if (x.tipo === 'laboral' && ['a', 'de', 'en', 'por', 'at', 'in', 'on', 'to', 'para'].includes(w) && condicionLaboralEn(x, s + 1)) { s++; continue; }
    if (PREPOSICIONES_DE_EXCLUSION.has(w) && !x.ent[s] && s + 1 < b && (x.ent[s + 1] || (ELIPTICOS.has(T[s + 1].w) && x.ent[s + 2]) || ELIPTICOS.has(T[s + 1].w)
      || POSESIVOS.has(T[s + 1].w))) { s++; continue; }
    if (ELIPTICOS.has(w) && !x.ent[s]) {
      if (s + 1 < b && x.ent[s + 1]) { s++; continue; }
      eliptico = true;
    }
    break;
  }
  if (s >= b) { marcar(x, a, b); return; }
  // «los que estén en Navarrete», «los de Moca», «those in Moca», «the ones in Moca»: se excluye el lugar.
  if (eliptico) {
    let z = s + 1;
    while (z < b && ['que', 'that', 'who', 'which', 'ones', 'one', 'esten', 'este', 'estan', 'esta', 'quedan', 'queden', 'sean', 'son', 'ubicados', 'ubicadas',
      'are', 'is', 'located', 'based'].includes(T[z].w)) z++;
    if (z < b && ['en', 'de', 'del', 'in', 'from'].includes(T[z].w)) {
      const L = lugarEn(x, z + 1, true);
      if (L && L.que === 'zona') {
        const antes = x.zonasExcluidas.length;
        const fin = listaDeLugares(x, z + 1, 'excluir');
        marcar(x, a, b);
        // «las de Moca que son pequeñas»: un tamaño o un negocio solo para ese lugar no se puede buscar así. Se pregunta.
        for (let k = fin; k < b; k++) {
          if (x.ent[k]?.datos.some(dd => dd.que === 'tamano' || (dd.que === 'sector' && !dd.general))) {
            x.zonasExcluidas.length = antes;
            agregarDuda(x, 'combinacion_parcial', texto(x, a, b));
            return;
          }
        }
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
      if (sector && !sector.general) sectores.push({ ...sector, j, fin: e.fin });
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
  // «except hotels in Santiago» buscando solo en Santiago: es lo mismo que «except hotels».
  let finValor = b;
  if (sectores.length && zonas.length && new Set(x.zonas).size === 1 && zonas.every(z => z === x.zonas[0])) {
    zonas.length = 0;
    for (let k = s; k < b; k++) {
      const L = lugarEn(x, k, true);
      if (L && L.que === 'zona') { finValor = k > s && ['en', 'in', 'de', 'del', 'at'].includes(T[k - 1].w) ? k - 1 : k; break; }
    }
  }
  let ultimo = finValor;
  while (ultimo > s && (T[ultimo - 1].tipo === 's' || ['y', 'e', 'o', 'que', 'en', 'de', 'a'].includes(T[ultimo - 1].w))) ultimo--;
  const valorLibre = texto(x, s, ultimo);
  marcar(x, a, b);
  if (hayEnlace(x, s, ultimo)) { agregarDuda(x, 'texto', valorLibre); return; }
  // Lo que no se puede guardar como clave se guarda tal como se escribió: «empresas del gobierno», «los de cadena»,
  // «bares» (que es solo una parte de «Restaurantes, bares y cafés») o «colmados en Santiago».
  // «ningún hotel de Santiago» cuando se buscan hoteles: lo que se excluye es el lugar.
  if (zonas.length && sectores.length && !desconocidas.length && !eliptico && sectores.every(sc => x.sectores.includes(sc.clave))) {
    if (new Set(x.sectores).size === new Set(sectores.map(sc => sc.clave)).size) { for (const z of zonas) x.zonasExcluidas.push(z); return; }
    // «hoteles y clínicas… but no clinics in Moca»: excluir un negocio solo en un lugar no se puede buscar así. Se pregunta.
    agregarDuda(x, 'combinacion_parcial', texto(x, a, b));
    return;
  }
  const mezcla = (zonas.length && sectores.length) || sectores.length > 1;
  if (desconocidas.length || eliptico || mezcla) {
    if (capacidades.length && !desconocidas.length && !eliptico) { for (const c of capacidades) x.capNegadas.add(c); return; }
    if (valorLibre) x.exclusiones.push(valorLibre);
    return;
  }
  if (paisVisto && !zonas.length && !sectores.length && !tamanos.length && !capacidades.length) return;
  for (const c of capacidades) x.capNegadas.add(c);
  for (const z of zonas) x.zonasExcluidas.push(z);
  if (sectores.length === 1 && tamanos.length) {
    // «no a supermercados grandes», «pero no a hoteles pequeños»: el tamaño va solo con ese negocio, no con todos.
    const buscados = new Set(x.sectores);
    if (buscados.size === 1 && buscados.has(sectores[0].clave)) { for (const t of tamanos) x.tamanosExcluidos.add(t); return; }
    // Si ese negocio es solo una parte de lo que se busca, no se puede buscar así: se pregunta.
    if (buscados.has(sectores[0].clave)) { agregarDuda(x, 'combinacion_parcial', texto(x, a, b)); return; }
    // Si no se busca, se guarda tal cual como exclusión («supermercados grandes»).
    if (valorLibre) x.exclusiones.push(valorLibre);
    // «no a ferreterías pequeñas, solo a las grandes»: «las grandes» de después son de ese negocio.
    x.negocioConTamanoExcluido = sectores[0].clave;
    x.textoDelNegocioConTamano = valorLibre;
    return;
  }
  for (const t of tamanos) x.tamanosExcluidos.add(t);
  if (sectores.length === 1) {
    // «bares» es solo una parte de «Restaurantes, bares y cafés»: se guarda tal cual. Pero si se excluye con la misma
    // palabra con que se pidió («hoteles y restaurantes…, menos los restaurantes»), es el mismo sector: se pregunta.
    const mismaPalabra = x.palabrasSector.get(sectores[0].clave)?.has(comparable(texto(x, sectores[0].j, sectores[0].fin)));
    if (sectores[0].parcial && !mismaPalabra) x.exclusiones.push(valorLibre);
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
      if (d && !['condicion', 'sin', 'lugar', 'direccion', 'salarioEscrito'].includes(d.tipo) && !(d.tipo === 'salario' && x.tipo === 'comercial')) break;
      if (d && d.tipo === 'condicion' && d.clave === 'con' && T[j - 1]?.w === 'y') break;
    }
    if (['en', 'in', 'de', 'del'].includes(t.w)) {
      let z = j + 1;
      while (z < x.n && ADJETIVOS_PREVIOS.has(T[z].w) && !x.ent[z]) z++;
      const L = lugarEn(x, z, true);
      // «sobre todo en el este»: una parte del lugar como preferencia, no la región entera.
      // «en Santo Domingo, más que nada en Naco»: un lugar dentro de otro que ya se busca también es una preferencia.
      if (L && (L.que === 'zona' || L.que === 'pais') && t.w !== 'de' && !(j === desde && (L.cardinal || dentroDeLoBuscado(x, L)))) break;
      // «los que más me interesan son los de Bávaro»: «los de…» es la preferencia.
      if (L && L.que === 'zona' && t.w === 'de' && x.tipo === 'comercial' && !x.ent[j - 1] && !ELIPTICOS.has(T[j - 1]?.w)) break;
      // «la prioridad son las farmacias grandes de Santiago» sin otro lugar: Santiago es dónde busca, no parte de la preferencia.
      if (L && L.que === 'zona' && t.w === 'de' && j > desde && !x.zonas.length && !x.zonasLibres.length && !x.pais.explicito && !x.pais.nombre) break;
    }
    if (['y', 'and'].includes(t.w) && (capacidadEn(x, j + 1) || frecuenciaEn(x, j + 1) || detectar(x, j + 1)?.tipo === 'verbo'
      || ['si', 'ademas', 'also'].includes(T[j + 1]?.w) || VERBOS_REVISAR.has(T[j + 1]?.w))) break;
    j++;
  }
  return j;
}

function spanPreferencia(x, i, desdeTexto, desdeContenido, conNegocios = false) {
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
    // «sobre todo colmados y farmacias», «principalmente a colmados»: negocios nombrados justo después. También se buscan
    // (una prioridad dentro de «talleres» nunca encontraría colmados).
    let k = desdeContenido;
    for (let vueltas = 0; conNegocios && vueltas < 8 && k < fin; vueltas++) {
      while (k < fin && (['a', 'al', 'los', 'las', 'el', 'la', 'to', 'the', 'y', 'e', 'and'].includes(T[k].w) || esComa(T[k])) && !x.ent[k]) k++;
      const s = datoDe(x, k, 'sector');
      if (!s || s.general) break;
      x.sectoresPrioridadDirectos.push(s.clave);
      k = x.ent[k].fin;
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
  // «I have 3 years experience», «yo tengo experiencia»: la preferencia empieza en «I».
  if (['i', 'yo', 'we', 'nosotros'].includes(T[i - 1]?.w) && !x.usado[i - 1]) inicio = i - 1;
  // «solo los que…» se guarda completo.
  if (['los', 'las'].includes(T[i - 1]?.w) && ['solo', 'solamente'].includes(T[i - 2]?.w)) inicio = i - 2;
  // «bilingüe», «remoto», «medio tiempo»: la condición es esa palabra sola. «de noche no»: con la negación después, se excluye.
  // «solo en las noches»: con «solo» es una condición; se guarda con el «solo» para que se vea así.
  if (d.corta) {
    if (['solo', 'solamente', 'only'].includes(T[i - 1]?.w) && !x.usado[i - 1] && !negacionDespues(x, d.fin)) inicio = i - 1;
    const neg = negacionDespues(x, d.fin);
    if (neg) { if (x.exclusiones.length < TOPE) x.exclusiones.push(texto(x, inicio, d.fin)); marcar(x, inicio, neg); return neg; }
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
    let fin = POSESIVOS.has(t.w) ? k + 2 : k + 1;
    if (['primero', 'antes', 'first'].includes(T[fin]?.w)) fin++;
    marcar(x, i, fin);
    return fin;
  }
  // «sin que yo lo vea primero», «sin que lo revise»: pide aprobar antes, que ya es como trabaja (todo espera su aprobación).
  if (t.w === 'que') {
    for (let q = k + 1; q < x.n && q - k <= 4 && T[q].tipo === 'p'; q++) {
      if (!['vea', 'vean', 'revise', 'revisen', 'apruebe', 'aprueben', 'autorice', 'autoricen', 'confirme', 'mire', 'lea', 'chequee', 'sepa'].includes(T[q].w)) continue;
      let fin = q + 1;
      if (['primero', 'antes', 'first', 'yo'].includes(T[fin]?.w)) fin++;
      marcar(x, i, fin);
      return fin;
    }
  }
  const L = lugarEn(x, k, true);
  if (L && L.que === 'zona') {
    marcar(x, i, k);
    return listaDeLugares(x, k, 'excluir');
  }
  const anterior = T[i - 1];
  // «hoteles sin restaurante» describe los hoteles; «negocios en Santiago sin bancas», «, sin los bares» excluye.
  const sueltoDelObjetivo = !anterior || esFuerte(anterior) || esComa(anterior) || ['y', 'e', 'pero', 'and', 'but'].includes(anterior.w) || !x.rolObjetivo[i - 1];
  const q = ELIPTICOS.has(t.w) && !x.ent[k] ? k + 1 : k;
  const negocio = x.ent[q]?.datos.some(dd => (dd.que === 'sector' && !dd.general) || (dd.que === 'tamano' && x.tipo === 'comercial'));
  if (sueltoDelObjetivo && negocio) {
    return spanExcluir(x, i, { fin: k });
  }
  return spanPreferencia(x, i, i, k);
}

// ---------- Empleo (puesto) ----------
// «trabajo estable de chofer», «empleo formal de cajera»: el adjetivo no es el empleo. Algunos son condiciones reales.
const ADJETIVOS_DE_EMPLEO = new Set(['estable', 'temporal', 'temporero', 'nuevo', 'nueva', 'formal', 'seguro', 'serio', 'seria', 'decente', 'digno', 'digna',
  'permanente', 'extra', 'fijo', 'fija', 'rapido', 'rapida', 'urgente', 'bueno', 'buena', 'buen', 'tranquilo', 'facil', 'ya', 'pronto', 'inmediato',
  'temporary', 'permanent', 'stable', 'steady', 'urgent', 'good', 'new', 'quick', 'fast', 'decent', 'hunting', 'search', 'searching', 'seeking', 'wanted']);
const CONDICIONES_DE_EMPLEO = new Set(['estable', 'temporal', 'temporero', 'formal', 'permanente', 'extra', 'fijo', 'fija', 'temporary', 'permanent', 'stable',
  'steady']);
// «cajera urgente», «chofer ya»: lo que va después del empleo y no es parte de él.
const DESPUES_DEL_EMPLEO = new Set(['urgente', 'ya', 'pronto', 'rapido', 'rapida', 'inmediato', 'inmediatamente', 'urgent', 'asap', 'now', 'anywhere',
  'everywhere']);

function agregarPrioridadTexto(x, valor) {
  const limpio = String(valor).replace(/\s+/g, ' ').trim();
  if (limpio && x.prioridades.length < TOPE && !x.prioridades.some(p => comparable(p) === comparable(limpio))) x.prioridades.push(limpio);
}

const CUANDO_ES_EL_TRABAJO = new Set(['weekend', 'weekends', 'night', 'nights', 'evening', 'evenings', 'morning', 'mornings', 'day', 'weekday', 'overnight',
  'summer', 'seasonal', 'temporary', 'temp', 'side', 'remote', 'online', 'part', 'full', 'time', 'parttime', 'fulltime']);
// «cashier job», «nursing jobs», «security guard job»: el empleo va antes de «job».
function puestoAntesDeJob(x, j) {
  const { T } = x;
  const anterior = T[j - 1];
  if (anterior && !esFuerte(anterior) && !esComa(anterior) && !['a', 'an', 'for', 'some', 'me', 'looking', 'find', 'any'].includes(anterior.w)) return null;
  for (let k = j + 1; k <= j + 2 && k < x.n; k++) {
    if (!['job', 'jobs'].includes(T[k].w)) continue;
    for (let q = j; q < k; q++) if (T[q].tipo !== 'p' || esRelleno(T[q].w) || lugarEn(x, q, true)) return null;
    // «a weekend job as a bartender», «a night job»: cuándo es el trabajo, no cuál. Es una preferencia; el empleo va después.
    let condicion = true;
    for (let q = j; q < k; q++) if (!CUANDO_ES_EL_TRABAJO.has(T[q].w)) condicion = false;
    if (condicion) return { tipo: 'horario', fin: k };
    return { tipo: 'puesto', fin: k + 1, ini: j, finValor: k };
  }
  return null;
}

// «para mi hijo», «for my wife»: la búsqueda es para otra persona.
const FAMILIA = new Set(['hijo', 'hija', 'hijos', 'hijas', 'esposa', 'esposo', 'mujer', 'marido', 'hermano', 'hermana', 'primo', 'prima', 'sobrino',
  'sobrina', 'mama', 'papa', 'madre', 'padre', 'tio', 'tia', 'amigo', 'amiga', 'novia', 'novio', 'cunado', 'cunada', 'son', 'daughter', 'wife',
  'husband', 'brother', 'sister', 'cousin', 'nephew', 'niece', 'mother', 'father', 'mom', 'dad', 'friend', 'girlfriend', 'boyfriend', 'kids', 'children']);
function paraOtraPersona(x, k) {
  const { T } = x;
  return ['para', 'for', 'pa'].includes(T[k]?.w) && POSESIVOS.has(T[k + 1]?.w) && FAMILIA.has(T[k + 2]?.w) ? k + 3 : 0;
}

function spanPuesto(x, i, d) {
  const { T } = x;
  // «Find a job for my son as a cashier»: se pregunta por quién es; el empleo es lo que sigue.
  const otra = paraOtraPersona(x, d.fin - 1);
  if (otra) {
    agregarDuda(x, 'texto', texto(x, d.fin - 1, otra));
    marcar(x, i, otra);
    let s = otra;
    while (s < x.n && ['as', 'a', 'an', 'de', 'como', 'un', 'una'].includes(T[s].w)) s++;
    return s > otra && T[s]?.tipo === 'p' ? spanPuesto(x, otra, { fin: s }) : otra;
  }
  // «Busco trabajo de 8 a 5 en Santiago»: «de 8 a 5» es el horario, no el empleo.
  if (T[d.fin - 1]?.w === 'de' && horarioEn(T, d.fin - 1)) { marcar(x, i, d.fin - 1); return d.fin - 1; }
  if (d.ini != null) {
    marcar(x, i, d.fin);
    if (!x.puesto) x.puesto = texto(x, d.ini, d.finValor).slice(0, 120);
    return d.fin;
  }
  let s = d.fin;
  // «Find jobs for me as a software developer»: «me» no es el empleo.
  if (['for', 'para'].includes(T[s - 1]?.w) && ['me', 'us'].includes(T[s]?.w)) s++;
  // «trabajo estable de chofer»: se salta el adjetivo; si es una condición real, queda como preferencia.
  const conAdjetivo = s < x.n && ADJETIVOS_DE_EMPLEO.has(T[s].w);
  while (s < x.n && ADJETIVOS_DE_EMPLEO.has(T[s].w)) {
    if (CONDICIONES_DE_EMPLEO.has(T[s].w)) agregarPrioridadTexto(x, `${texto(x, i, i + 1)} ${texto(x, s, s + 1)}`);
    s++;
  }
  if (conAdjetivo) {
    if (esComa(T[s]) && x.original[T[s].ini] === ':') s++;
    else if (['de', 'como', 'of', 'as'].includes(T[s]?.w)) s++;
    else { marcar(x, i, s); return s; }
  }
  if (esComa(T[s])) s++;
  // «trabajo de teletrabajo de servicio al cliente»: la modalidad no es el empleo; queda como preferencia.
  const modalidad = buscarEn(T, s, CONDICION);
  if (modalidad && modalidad.datos[0].clave === 'laboral' && modalidad.datos[0].corta && ['de', 'como', 'of', 'as'].includes(T[modalidad.fin]?.w)) {
    agregarPrioridad(x, s, modalidad.fin);
    s = modalidad.fin + 1;
  } else if (modalidad && modalidad.datos[0].clave === 'laboral' && modalidad.datos[0].corta) {
    // «trabajo de medio tiempo en Santiago»: la modalidad no dice qué empleo. Queda como preferencia y se pregunta el empleo.
    const sig = T[modalidad.fin];
    if (!sig || sig.tipo === 's' || PREP_LUGAR.has(sig.w) || ['que', 'con', 'y', 'pero', 'cerca', 'that', 'with', 'and', 'but'].includes(sig.w) || detectar(x, modalidad.fin)) {
      agregarPrioridad(x, s, modalidad.fin);
      marcar(x, i, modalidad.fin);
      return modalidad.fin;
    }
  }
  while (s < x.n && ['un', 'una', 'de', 'como', 'a', 'an', 'the', 'as', 'el', 'la'].includes(T[s].w) && T[s + 1] && T[s + 1].tipo === 'p') s++;
  // «trabajo de cualquier cosa», «trabajo de lo que sea»: no dice qué empleo; se pregunta.
  const relleno = buscarEn(T, s, RELLENO_TEMPRANO) || buscarEn(T, s, FRASES_RELLENO);
  if (relleno) { marcar(x, i, relleno.fin); return relleno.fin; }
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
      // «en la zona de Bávaro»: es un lugar.
      if (['zona', 'area', 'sector'].includes(sig?.w) && ['de', 'del', 'of'].includes(T[z + 1]?.w) && lugarEn(x, z + 2, true)) break;
      // «en la Zona Norte de Santo Domingo», «en la zona sur»: una parte de un lugar, no el lugar de trabajo («zona franca»).
      if (sig?.w === 'zona' && (['norte', 'sur', 'este', 'oeste', 'centro', 'nordeste', 'noroeste', 'sureste', 'suroeste', 'oriental', 'occidental'].includes(T[z + 1]?.w) || (T[z + 1]?.mayus && !x.mayus))) break;
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
    if (['que', 'con', 'sin', 'por', 'cerca', 'donde', 'pero', 'cada', 'with', 'that', 'near', 'for', 'paying', 'earning', 'pagado', 'pagada', 'pagados', 'pagadas', 'paid', 'ganando'].includes(t.w)) break;
    if (['no', 'not', 'tampoco'].includes(t.w) && j > s) break;
    if (DESPUES_DEL_EMPLEO.has(t.w) && j > s) { j++; break; }
    if (t.w === 'para' && !esInfinitivo(x, j + 1)) break;
    if (['o', 'y', 'u', 'e', 'or', 'and'].includes(t.w)) {
      const sig = T[j + 1];
      if (!sig || sig.tipo !== 'p' || ['en', 'que', 'de', 'in'].includes(sig.w) || lugarEn(x, j + 1, true) || detectar(x, j + 1)) break;
    }
    if (['a', 'to'].includes(t.w) && (T[j + 1]?.tipo === 'n' || ['rd$', 'us$', '$'].includes(T[j + 1]?.w))) break;
    if (t.tipo === 'n' || ['rd$', 'us$'].includes(t.w)) break;
    if (['zona', 'pais'].includes(lugarEn(x, j, false)?.que) && j > s) break;
    j++;
    palabras++;
  }
  let fin = j;
  while (fin > s && ['de', 'y', 'o', 'en', 'para', 'a', 'el', 'la', 'un', 'una', 'del', 'as', 'the', 'an'].includes(T[fin - 1].w)) fin--;
  // «cajera urgente»: lo de después no es parte del empleo.
  let finValor = fin;
  while (finValor > s + 1 && DESPUES_DEL_EMPLEO.has(T[finValor - 1].w)) finValor--;
  const valor = texto(x, s, finValor);
  const comp = comparable(valor);
  const soloRelleno = !comp || comp.split(' ').every(w => esRelleno(w) || ['as', 'como', 'job', 'jobs', 'work', 'trabajo', 'empleo', 'puesto'].includes(w));
  // «chofer de Uber no, de chofer privado»: lo negado no es el empleo que busca; se excluye.
  const negado = !soloRelleno && ['no', 'not', 'tampoco'].includes(T[j]?.w) ? negacionDespues(x, j) : 0;
  if (negado) {
    if (x.exclusiones.length < TOPE) x.exclusiones.push(valor);
    marcar(x, i, negado);
    return negado;
  }
  marcar(x, i, Math.max(fin, d.fin));
  if (!soloRelleno && !x.puesto) x.puesto = valor.slice(0, 120);
  else if (!soloRelleno && x.puesto && comparable(x.puesto) !== comp) agregarPrioridad(x, s, finValor);
  return Math.max(fin, d.fin);
}

// ---------- Producto (lo que se vende) ----------
const PRODUCTO_RELLENO = new Set(['cosas', 'cosa', 'algo', 'productos', 'producto', 'servicios', 'servicio', 'mis servicios', 'mis productos', 'nuestros servicios',
  'nuestros productos', 'lo que vendo', 'lo que ofrezco', 'lo que tengo', 'de todo', 'stuff', 'things', 'products', 'services', 'my services', 'my products',
  'our services', 'our products', 'eso', 'esto', 'lo mio', 'mi producto', 'mi servicio', 'mis cosas', 'los', 'las', 'lo', 'them', 'it', 'mas', 'mucho',
  'mucho mas', 'bastante', 'more', 'a lot', 'mas cosas', 'lo mismo', 'lo mismo que', 'the same', 'same', 'the same thing', 'the same as']);
const PRODUCTO_SIN_DECIR = /^(mis |nuestros |nuestras |my |our )?(cosas|cosa|algo|productos|producto|servicios|servicio|stuff|things|products|services)$|^(lo mismo|lo mismo que|the same|same|the same thing|the same as)$/;
// «vender agua en botellones»: «vender» no es parte de lo que se vende.
const VENDER_AL_INICIO = new Set(['vender', 'venta', 'ventas', 'venderle', 'venderles']);
// «por medio de distribuidores», «a través de Instagram»: cómo vende, no qué vende.
const CANALES = indice(['por medio de', 'a traves de', 'mediante', 'via', 'through', 'por internet', 'en linea', 'online', 'por whatsapp', 'por instagram',
  'por facebook']);
// «comida a domicilio», «ropa al por mayor», «pasteles por encargo»: cómo se vende; va con lo que se vende.
const MODO_DE_VENTA = indice(['a domicilio', 'a credito', 'al contado', 'a plazos', 'por encargo', 'por pedido', 'al por mayor', 'al por menor', 'al detal',
  'al detalle', 'por mayor', 'por libra', 'por unidad', 'on credit', 'wholesale']);
// «pasteles para cumpleaños y bodas»: ocasiones, no negocios.
const OCASIONES = new Set(['cumpleanos', 'boda', 'bodas', 'bautizo', 'bautizos', 'graduacion', 'graduaciones', 'quinceanera', 'quinceaneras', 'fiesta', 'fiestas',
  'navidad', 'aniversario', 'aniversarios', 'baby', 'birthdays', 'birthday', 'weddings', 'wedding', 'parties', 'party']);
const EMPRESA = new Set(['empresa', 'empresas', 'negocio', 'negocios', 'compania', 'companias', 'company', 'companies', 'business', 'businesses', 'firm']);
const DISPARADORES_EN_INGLES = new Set(['i sell', 'we sell', 'sell', 'sells', 'selling', 'i offer', 'we offer', 'offer', 'offers', 'that need', 'that may need', 'i install', 'we install',
  'who need', 'that might need', 'which need', 'needing', 'that needs', 'who needs', 'in need of', 'customers for', 'clients for', 'buyers for']);

function hayAMasAdelante(x, k) {
  for (let j = k; j < x.n && j - k < 10; j++) {
    const t = x.T[j];
    if (t.tipo === 's') return false;
    if (['a', 'al', 'to'].includes(t.w)) return true;
    if (['en', 'in', 'que', 'that', 'excepto'].includes(t.w)) return false;
  }
  return false;
}

// Palabras que dicen a quién busca: si una oración las tiene junto a un negocio, ahí está la lista de a quién buscar.
const PIDE_A_QUIEN = new Set(['busco', 'buscamos', 'buscar', 'busca', 'buscame', 'buscales', 'quiero', 'queremos', 'necesito', 'necesitamos', 'clientes', 'cliente',
  'encontrar', 'encuentra', 'encuentrame', 'consigueme', 'conseguir', 'prospectos', 'find', 'looking', 'customers', 'clients', 'target', 'targets', 'want', 'need']);
// Para qué ocasión es lo que vende («sillas para eventos»): nunca es a quién buscar.
const OCASIONES_DE_NEGOCIO = new Set(['eventos', 'evento', 'events', 'event', 'fiestas', 'fiesta', 'actividades']);

// «Tengo una empresa de seguridad para residenciales. Quiero clientes en Santiago: hoteles y bancos», «Vendo alquiler de sillas para
// eventos. Busco iglesias en Moca»: si el «para …» llega al final de su oración y OTRA oración dice a quién busca (con negocios), el
// «para …» es para quién es lo que vende: va con lo que vende, no con a quién buscar. Si nombra un negocio que no está en esa
// lista, no se agrega en silencio: se pregunta (duda «para_quien»). Devuelve dónde termina el «para …», o 0.
function paraQuienEsLoQueVende(x, j) {
  const { T } = x;
  let b = j + 1;
  while (b < x.n && T[b].tipo !== 's' && !['a', 'al', 'to', 'que', 'that', 'which', 'who', 'en', 'in', 'pero', 'but', 'sin', 'without'].includes(T[b].w)) b++;
  if (b === j + 1 || b - j > 8 || !esFuerte(T[b])) return 0;
  let a = j;
  while (a > 0 && !esFuerte(T[a - 1])) a--;
  // Los negocios que pide en otra oración.
  const pedidos = new Set();
  let oracion = [];
  const cerrar = () => {
    if (oracion.some(k => PIDE_A_QUIEN.has(T[k].w))) {
      for (const k of oracion) for (const d of x.ent[k]?.datos || []) if (d.que === 'sector' && !d.general) pedidos.add(d.clave);
    }
    oracion = [];
  };
  for (let k = 0; k <= x.n; k++) {
    if (k === x.n || esFuerte(T[k])) { cerrar(); continue; }
    if (k < a || k > b) oracion.push(k);
  }
  if (!pedidos.size) return 0;
  const nombrados = [];
  for (let k = j + 1; k < b; k++) {
    if (OCASIONES_DE_NEGOCIO.has(T[k].w)) continue;
    for (const d of x.ent[k]?.datos || []) if (d.que === 'sector' && !d.general && !pedidos.has(d.clave)) nombrados.push(d.clave);
  }
  if (nombrados.length) agregarDuda(x, 'para_quien', texto(x, j, b));
  return b;
}

// Lo que se vende, desde «d.fin». «destino»: 'productos' (lo que dijo que vende), 'propios' (lo que hace su negocio, por si no dice
// otra cosa) o 'ninguno' (lo que dijo que NO vende).
function spanProducto(x, i, d, destino = 'productos') {
  const { T } = x;
  // «reparo inversores»: el servicio va con su verbo («reparo inversores», no solo «inversores»).
  let s = ['reparo', 'reparamos', 'arreglo', 'arreglamos'].includes(d.frase) ? i : d.fin;
  const ingles = DISPARADORES_EN_INGLES.has(d.frase || '');
  // «to sell them coffee»: «them» no es parte de lo que vende.
  const articulos = ingles ? ['a', 'an', 'the', 'some', 'new', 'them', 'us', 'him', 'her'] : ['un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'an', 'the', 'some', 'tambien'];
  // «Lo que yo vendo es hielo», «what I sell is software»: «es» no es parte de lo que vende.
  const loQue = (T[i - 1]?.w === 'que' && T[i - 2]?.w === 'lo') || (['yo', 'nosotros'].includes(T[i - 1]?.w) && T[i - 2]?.w === 'que' && T[i - 3]?.w === 'lo')
    || T[i - 1]?.w === 'what' || (['i', 'we'].includes(T[i - 1]?.w) && T[i - 2]?.w === 'what');
  if (loQue && ['es', 'son', 'is', 'are'].includes(T[s]?.w)) {
    let a = i;
    while (a > 0 && a > i - 4 && ['lo', 'que', 'yo', 'nosotros', 'what', 'i', 'we'].includes(T[a - 1].w)) a--;
    marcar(x, a, i);
    s++;
  }
  while (s < x.n && articulos.includes(T[s].w)) s++;
  // «Find clients for me in Santiago»: «me» no es lo que vende.
  if (/(for|para)$/.test(d.frase || '') && ['me', 'us', 'nosotros'].includes(T[s]?.w)) s++;
  // «Le vendo agua a…», «Ya le vendo a…»: le vende a alguien que ya es su cliente.
  if (destino === 'productos' && (['le', 'les'].includes(T[i - 1]?.w) || T[i - 1]?.w === 'ya' || T[i - 2]?.w === 'ya')) x.leVende = true;
  const sinProducto = () => { marcar(x, i, d.fin); x.ultimoProductoFin = d.fin; if (destino === 'productos') x.ventaSinProducto = true; return d.fin; };
  // «I sell nothing yet», «yo no les vendo nada»: no dice qué vende.
  if (['nada', 'nothing'].includes(T[s]?.w) && !['mas', 'more', 'but', 'excepto', 'except', 'que'].includes(T[s + 1]?.w)) {
    let b = s + 1;
    while (b < x.n && b - s < 3 && ['yet', 'todavia', 'aun', 'still', 'ahora', 'now', 'por', 'right'].includes(T[b].w)) b++;
    let a = i;
    while (a > 0 && !x.usado[a - 1] && ['no', 'not', 'dont', 'do', 'le', 'les', 'yo', 'i', 'we', 'nosotros', 'todavia', 'aun'].includes(T[a - 1].w)) a--;
    marcar(x, a, b);
    x.ultimoProductoFin = b;
    return b;
  }
  // «Vendo al por mayor arroz», «Vendo al detalle: ropa»: cómo vende no es lo que vende.
  const modo = buscarEn(T, s, MODO_DE_VENTA);
  if (modo) {
    marcar(x, s, modo.fin);
    s = modo.fin;
    if (esComa(T[s]) && x.original[T[s].ini] === ':') s++;
  }
  if (['a', 'al', 'to'].includes(T[s]?.w)) return sinProducto();
  // «Vendo por medio de distribuidores a colmados»: el canal no es lo que se vende.
  const canal = buscarEn(T, s, CANALES);
  if (canal) {
    let b = canal.fin;
    while (b < x.n && T[b].tipo === 'p' && !['a', 'al', 'to', 'en', 'in', 'y', 'and'].includes(T[b].w) && b - canal.fin < 3) b++;
    marcar(x, s, b);
    if (['a', 'al', 'to'].includes(T[b]?.w) || !T[b] || T[b].tipo === 's') { marcar(x, i, b); x.ultimoProductoFin = b; return b; }
    s = b;
  }
  // «my hotel supplies business», «my gym equipment», «my car wash supplies»: en inglés lo que describe va antes; lo que vende es todo eso.
  if (['my', 'our'].includes(T[s]?.w) && destino === 'productos') {
    const n = negocioPropioEn(x, s + 1, T[s].w);
    if (n?.producto) {
      const [pa, pb] = n.producto;
      let fin = pb;
      if (EMPRESA.has(T[fin]?.w)) fin = x.ent[fin]?.fin || fin + 1;
      x.productos.push(texto(x, pa, pb));
      x.secuencia.push({ t: 'P', valor: comparable(texto(x, pa, pb)) });
      marcar(x, i, fin);
      x.ultimoProductoFin = fin;
      return fin;
    }
  }
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
    } else if (sector) {
      // «clientes para mi empresa Constructora JR», «para mi negocio, Colmado La Esquina,»: el nombre de su negocio no es a quién busca.
      const fin = nombreDelNegocio(x, e.fin) || e.fin;
      marcar(x, i, fin);
      x.ultimoProductoFin = fin;
      return fin;
    }
    // «customers for my cleaning company», «clientes para mis paneles solares»: el posesivo no es parte de lo que se vende.
    else s++;
  }
  while (s < x.n && (VENDER_AL_INICIO.has(T[s].w) || (T[s].w === 'de' && VENDER_AL_INICIO.has(T[s - 1]?.w)))) s++;
  // «quiero vender por Amazon»: algo que todavía no hace.
  const objetivo = destino === 'productos' ? buscarEn(T, s, OBJETIVOS) : null;
  if (objetivo) return objetivoNoDisponible(x, i, objetivo.fin, objetivo.datos[0].clave);
  let j = s;
  let palabras = 0;
  while (j < x.n && palabras < 14) {
    const t = T[j];
    if (t.tipo === 's') break;
    // Un enlace no es lo que se vende: si no dijo más, se pregunta qué vende.
    if (esEnlace(x, j)) break;
    // «agua - colmados - santiago», «agua 💧 colmados»: después del guion suelto o del emoji, un negocio o un lugar ya no es lo que vende.
    if (t.sep && j > s && (x.ent[j]?.datos.some(dd => ['sector', 'zona', 'pais'].includes(dd.que)) || lugarEn(x, j, true))) break;
    const modo = buscarEn(T, j, MODO_DE_VENTA);
    if (modo && j > s) { palabras += modo.fin - j; j = modo.fin; continue; }
    // «paneles solares en hoteles de Punta Cana», «software in restaurants», «among hotels»: lo que sigue es a quién se busca.
    if (['en', 'in', 'among', 'entre'].includes(t.w) && j > s) {
      let z = j + 1;
      while (z < x.n && ['los', 'las', 'the', 'unos', 'unas', 'some'].includes(T[z].w) && !x.ent[z]) z++;
      if (x.ent[z]?.datos.some(dd => dd.que === 'sector' && !dd.general)) break;
    }
    if (['a', 'al', 'to'].includes(t.w)) break;
    if ((t.w === 'para' || t.w === 'for') && OCASIONES.has(T[j + 1]?.w) && j > s) { j++; palabras++; continue; }
    if (t.w === 'para' || t.w === 'for') {
      // «baterías para inversores»: lo que va después de «para» también es un producto (no un negocio).
      const z = ['los', 'las', 'el', 'la', 'the'].includes(T[j + 1]?.w) ? j + 2 : j + 1;
      const finOtro = x.ent[z]?.fin;
      const otroProducto = datoDe(x, z, 'producto') && !datoDe(x, z, 'sector')
        && (!T[finOtro] || T[finOtro].tipo === 's' || SEPARADORES.has(T[finOtro].w) || ['a', 'al', 'to', 'en', 'in'].includes(T[finOtro].w));
      if (esInfinitivo(x, j + 1) || hayAMasAdelante(x, j + 1) || otroProducto) { j++; palabras++; continue; }
      // «una empresa de seguridad para residenciales. Quiero clientes: hoteles y bancos»: el «para …» es para quién es lo que vende.
      const paraQuien = j > s ? paraQuienEsLoQueVende(x, j) : 0;
      if (paraQuien) { j = paraQuien; break; }
      break;
    }
    // «cursos online», «ropa por Instagram»: cómo vende no es lo que vende (y no hay nada que preguntar).
    const canalDespues = j > s ? buscarEn(T, j, CANALES) : null;
    if (canalDespues) {
      let b = canalDespues.fin;
      if (['por medio de', 'a traves de', 'mediante', 'via', 'through'].includes(canalDespues.datos[0].frase)) {
        while (b < x.n && T[b].tipo === 'p' && !['a', 'al', 'to', 'en', 'in', 'y', 'and'].includes(T[b].w) && b - canalDespues.fin < 3) b++;
      }
      marcar(x, j, b);
      break;
    }
    if (['en', 'in', 'de', 'del', 'desde', 'across', 'throughout', 'from'].includes(t.w)) {
      let z = j + 1;
      while (z < x.n && ADJETIVOS_PREVIOS.has(T[z].w) && !x.ent[z]) z++;
      const L = lugarEn(x, z, true);
      if (L && L.que !== 'calle') {
        if ((t.w === 'de' || t.w === 'del') && j > s && L.que === 'zona') { j = L.fin; palabras++; continue; }
        break;
      }
      // «seguros en Independencia», «imprenta en la Duarte con París»: una calle (o una provincia con nombre de calle) no es lo que vende.
      if (L && ['en', 'in', 'desde', 'from'].includes(t.w) && j > s) break;
      // «empanadas en mi barrio Los Mina», «en mi pueblo»: dónde vende no es lo que vende.
      if (['en', 'in'].includes(t.w) && j > s && POSESIVOS.has(T[j + 1]?.w) && PALABRAS_DE_LUGAR.has(T[j + 2]?.w)) break;
      // «zapatos en la avenida Mella»: la dirección no es lo que vende.
      if (['en', 'in'].includes(t.w) && j > s && buscarEn(T, z, DIRECCION)) break;
      // «pan en las Matas», «agua en Pueblo Inventado»: un nombre propio después de «en» es un lugar (que se pregunta).
      if (!L && ['en', 'in'].includes(t.w) && j > s && pareceLugar(x, j + 1)) break;
    }
    if (j > s) {
      const otro = detectar(x, j);
      if (otro && !(otro.tipo === 'condicion' && otro.clave === 'con')) break;
    }
    if (['que', 'that', 'which', 'who', 'sin', 'without', 'pero', 'but', 'cada', 'every', 'donde', 'where', 'cerca', 'no', 'not', 'ni', 'nunca', 'never',
      'busca', 'buscan', 'buscamos', 'find', 'looking'].includes(t.w)) break;
    // «Mi software es para hoteles»: «es» ya no es parte de lo que se vende.
    if (['es', 'son', 'is', 'are'].includes(t.w) && j > s) break;
    if (SEPARADORES.has(t.w) && (detectar(x, j + 1) || T[j + 1]?.tipo === 's')) break;
    const L = j > s ? lugarEn(x, j, false) : null;
    // «jugos naturales en todo el país»: «en todo el país» es un solo nombre que empieza en «en».
    if (L?.que === 'pais' && L.explicito) break;
    if (L?.que === 'zona') {
      // «café Santo Domingo»: un lugar pegado al producto, con mayúscula y sin «en» ni «de», es parte del nombre (una marca).
      if (T[j].mayus && !x.mayus && T[j - 1]?.tipo === 'p' && !PREP_LUGAR.has(T[j - 1].w)) { palabras += L.fin - j; j = L.fin; continue; }
      break;
    }
    j++;
    palabras++;
  }
  let fin = j;
  const recortar = () => {
    while (fin > s && (['y', 'e', 'de', 'con', 'para', 'o', 'and', 'or', 'for', 'del', 'en', 'from', 'desde', 'of', 'with', 'by', 'por', 'tambien', 'also'].includes(T[fin - 1].w)
      || T[fin - 1].tipo === 's')) fin--;
  };
  recortar();
  // «hielo y lo vendo a colmados»: el «lo» de después no es parte de lo que vende.
  if (fin - s > 1 && ['lo', 'la', 'los', 'las', 'le', 'les', 'it', 'them'].includes(T[fin - 1].w) && SEPARADORES.has(T[fin - 2]?.w)) { fin--; recortar(); }
  const finLeido = fin;
  // «cleaning company»: la palabra «empresa» al final no es parte de lo que se vende.
  for (let k = s + 1; k < fin; k++) {
    if (x.ent[k] && x.ent[k].fin === fin && EMPRESA.has(T[k].w)) { fin = k; recortar(); break; }
  }
  const valor = texto(x, s, fin);
  marcar(x, i, Math.max(finLeido, d.fin));
  if (destino !== 'ninguno') x.ultimoProductoFin = j;
  // «Vendo productos de mi tienda»: dijo que vende, pero no qué. No se toma su negocio («tienda») como lo que vende: se pregunta.
  // («quiero vender más» sí habla de lo de su negocio).
  if (valor && PRODUCTO_SIN_DECIR.test(comparable(valor)) && destino === 'productos') x.productoRelleno = true;
  if (valor && !PRODUCTO_RELLENO.has(comparable(valor))) {
    if (destino === 'productos') { x.productos.push(valor); x.secuencia.push({ t: 'P', valor: comparable(valor) }); }
    else if (destino === 'propios') x.productosPropios.push(valor);
  }
  return j;
}

// Palabras que dicen «mi negocio» aunque no sean un sector: «tengo una agencia de publicidad».
const NEGOCIOS_PROPIOS = new Set(['agencia', 'firma', 'distribuidora', 'imprenta', 'emprendimiento', 'marca', 'franquicia', 'startup', 'tiendita',
  'fabriquita', 'negocito', 'empresita', 'compania', 'microempresa', 'pyme']);

// Lo que va después de «tengo una», «soy», «mi», «mi negocio es»: ¿es el negocio de la persona? Devuelve cómo es, o null.
function negocioPropioEn(x, k, frase = '') {
  const { T } = x;
  let j = k;
  if (['un', 'una', 'a', 'an'].includes(T[j]?.w) && !x.ent[j]) j++;
  if (x.ent[j]?.datos.some(d => d.que === 'tamano') && !x.ent[j].datos.some(d => d.que === 'sector')) j = x.ent[j].fin;
  if (['propio', 'propia', 'pequeno', 'pequena', 'nuevo', 'nueva', 'own', 'main', 'head', 'principal', 'central', 'new'].includes(T[j]?.w)) j++;
  const e = x.ent[j];
  if (LUGARES_PROPIOS.has(T[j]?.w)) return { j, fin: e ? e.fin : j + 1, lugar: true };
  const sector = e?.datos.find(d => d.que === 'sector');
  // En inglés lo que describe va antes: «my school bus service» (no es una escuela), «my printing shop», «a print shop» (no es una tienda).
  const ingles = /^(my|our|i |we |im |i am)/.test(frase) || ['my', 'our', 'i have a', 'i own a', 'i run a', 'we have a', 'we run a'].includes(frase);
  if (ingles) {
    const palabra = q => T[q]?.tipo === 'p' && !esRelleno(T[q].w) && !lugarEn(x, q, true) && !detectar(x, q);
    if (sector && !sector.general && palabra(e.fin) && !x.ent[e.fin]) {
      let q = e.fin;
      while (q < x.n && q - j < 5 && palabra(q) && !x.ent[q]) q++;
      return { j, fin: q, producto: [j, q] };
    }
    if (!e && palabra(j)) {
      let q = j;
      while (q < x.n && q - j < 3 && palabra(q) && !x.ent[q]) q++;
      const otro = x.ent[q]?.datos.find(d => d.que === 'sector');
      if (q > j && otro && !otro.general) return { j, fin: x.ent[q].fin, propio: true };
    }
  }
  if (sector) return { j, fin: e.fin, sector };
  if (NEGOCIOS_PROPIOS.has(T[j]?.w) && ['de', 'of'].includes(T[j + 1]?.w)) return { j, fin: j + 1, agencia: true };
  // «Soy dueño de una imprenta en Moca», «tengo una distribuidora»: su negocio, aunque no sea un sector de la lista.
  if (NEGOCIOS_PROPIOS.has(T[j]?.w) && !['agencia', 'firma', 'marca', 'franquicia', 'startup', 'emprendimiento', 'pyme', 'microempresa', 'compania'].includes(T[j].w)) {
    return { j, fin: j + 1, propio: true };
  }
  // «mi negocio es de uniformes»: lo que va después de «de» es lo que vende.
  if (/ es$/.test(frase) && j === k && ['de', 'of'].includes(T[j]?.w) && T[j + 1]?.tipo === 'p' && !esRelleno(T[j + 1].w)) return { j: j + 1, fin: j + 1, de: true };
  // «a solar company»: lo que vende y después «empresa».
  if (datoDe(x, j, 'producto')) {
    const g = datoDe(x, e.fin, 'sector');
    if (g && g.general) return { j, fin: x.ent[e.fin].fin, producto: [j, e.fin] };
  }
  return null;
}

// Después del negocio propio: su tamaño, su nombre y dónde está («una ferretería grande en Higüey», «Panadería La Espiga»).
function colaDelNegocioPropio(x, k) {
  const { T } = x;
  let j = k;
  for (let vueltas = 0; vueltas < 4; vueltas++) {
    // «mi tienda es Ferretería Junior», «mi negocio: Panadería La Espiga»: el nombre del negocio, no a quién se busca.
    const dosPuntos = esComa(T[j]) && x.original[T[j].ini] === ':';
    if (['es', 'is'].includes(T[j]?.w) || dosPuntos) {
      const b = finDeNombre(x, ARTICULOS.has(T[j + 1]?.w) ? j + 2 : j + 1);
      if (b > j + 1) {
        let fin = b;
        // «…, https://ferreteriajunior.com.do»: el enlace de su negocio.
        if (esComa(T[fin]) && esEnlace(x, fin + 1)) fin += 2;
        marcar(x, j, fin);
        j = fin;
        continue;
      }
    }
    // «un colmado, Colmado Junior, en Santiago»: el nombre entre comas.
    const nombre = esComa(T[j]) ? nombreDelNegocio(x, j) : 0;
    if (nombre) { marcar(x, j, nombre); j = nombre; continue; }
    const e = x.ent[j];
    if (e?.datos.some(d => d.que === 'tamano') && !e.datos.some(d => d.que === 'sector')) { marcar(x, j, e.fin); j = e.fin; continue; }
    if (T[j]?.tipo === 'p' && T[j].mayus && !x.mayus && !esRelleno(T[j].w) && !lugarEn(x, j, false) && !detectar(x, j)) {
      let b = j;
      while (b < x.n && T[b].tipo === 'p' && (T[b].mayus || (['de', 'del', 'la', 'el', 'los', 'las', 'y'].includes(T[b].w) && T[b + 1]?.mayus))) b++;
      marcar(x, j, b);
      j = b;
      continue;
    }
    break;
  }
  let q = j;
  while (q < x.n && q - j < 3 && VERBOS_DE_ESTAR.has(T[q].w)) q++;
  if (['en', 'in', 'at'].includes(T[q]?.w)) {
    const L = lugarTras(x, q + 1);
    if (L && L.L.que === 'zona') {
      marcar(x, j, L.q);
      const fin = listaDeLugares(x, L.q, 'propia');
      // «un colmado en Santiago, Colmado Junior, y…»: el nombre después del lugar.
      const nombre = esComa(T[fin]) ? nombreDelNegocio(x, fin) : 0;
      if (nombre) { marcar(x, fin, nombre); return nombre; }
      return fin;
    }
  }
  return j;
}

function spanPropio(x, i, d) {
  const { T } = x;
  const n = negocioPropioEn(x, d.fin, d.frase);
  marcar(x, i, d.fin);
  if (!n) return d.fin;
  marcar(x, d.fin, n.fin);
  let fin = n.fin;
  if (n.agencia || (n.sector?.general && ['de', 'of'].includes(T[n.fin]?.w))) {
    // «tengo una agencia de publicidad», «una empresa de transporte»: lo que va después de «de» es lo que hace su negocio.
    marcar(x, n.fin, n.fin + 1);
    fin = x.tipo === 'comercial' ? spanProducto(x, n.fin, { fin: n.fin + 1 }, 'propios') : n.fin + 1;
  } else if (n.de) {
    fin = x.tipo === 'comercial' ? spanProducto(x, n.j, { fin: n.j }, 'propios') : n.fin;
  } else if (n.producto) {
    if (x.tipo === 'comercial') x.productosPropios.push(texto(x, n.producto[0], n.producto[1]));
  } else if (n.propio || (n.sector && !n.sector.general)) {
    x.negocioPropio = texto(x, n.j, n.fin);
    // «Soy el dueño de Ferretería Los Primos»: el nombre de su negocio va entero (no es a quién busca).
    const nombre = T[n.j].mayus ? finDeNombre(x, n.j) : n.j;
    if (nombre > n.fin) { marcar(x, n.fin, nombre); fin = nombre; }
  }
  return colaDelNegocioPropio(x, fin);
}

// ---------- Direcciones ----------
function spanDireccion(x, i, desde) {
  const { T } = x;
  let j = desde;
  let palabras = 0;
  while (j < x.n && palabras < 6) {
    const t = T[j];
    // Una calle conocida va entera, con su «de»: «27 de Febrero», «Charles de Gaulle», «Núñez de Cáceres».
    if (x.ent[j]?.datos.some(d => d.que === 'calle')) { j = x.ent[j].fin; palabras++; continue; }
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
    // «quiero clientes en Santiago y La Vega para tarjetas y volantes»: lo que va después de «para» es lo que vende.
    if (x.tipo === 'comercial' && x.pideClientes && !x.productos.length && ['para', 'for'].includes(t.w) && x.usado[i - 1]
      && T[i + 1]?.tipo === 'p' && !esRelleno(T[i + 1].w) && !x.ent[i + 1]?.datos.some(d => d.que === 'sector') && !detectar(x, i + 1)) {
      i = Math.max(i + 1, spanProducto(x, i, { fin: i + 1 }));
      continue;
    }
    // «vendo a colmados: salami en Santiago»: después de los dos puntos va lo que vende.
    if (x.tipo === 'comercial' && x.ventaSinProducto && !x.productos.length && esComa(T[i - 1]) && x.original[T[i - 1].ini] === ':' && x.rolObjetivo[i - 2]
      && t.tipo === 'p' && !esRelleno(t.w) && !x.ent[i]?.datos.some(dd => ['sector', 'zona', 'tamano'].includes(dd.que)) && !detectar(x, i)) {
      i = Math.max(i + 1, spanProducto(x, i, { fin: i }));
      continue;
    }
    // «en mi barrio Los Mina», «en mi pueblo, Licey»: el lugar que sigue es dónde.
    if (PREP_LUGAR_FUERTE.has(t.w) && POSESIVOS.has(T[i + 1]?.w) && PALABRAS_DE_LUGAR.has(T[i + 2]?.w)) {
      const q = esComa(T[i + 3]) ? i + 4 : i + 3;
      const desde = datoDe(x, q, 'zona') ? q : ARTICULOS.has(T[q]?.w) && datoDe(x, q + 1, 'zona') ? q + 1 : -1;
      if (desde >= 0) {
        // «barrio» antes del nombre no lo vuelve una calle; el lugar se guarda tal cual (sigue la lista si la hay).
        const z = datoDe(x, desde, 'zona');
        const fin = x.ent[desde].fin;
        x.zonas.push(z.clave);
        marcar(x, i, fin);
        x.secuencia.push({ t: 'Z', claves: [z.clave] });
        i = sigueLaLista(x, fin) ? listaDeLugares(x, fin + 1, 'incluir') : fin;
        continue;
      }
    }
    // «en Pueblo Inventado y en Higuei»: después de «en», un nombre propio que no conozco es un lugar a preguntar.
    if (PREP_LUGAR_FUERTE.has(t.w) && !x.ent[i] && pareceLugar(x, i + 1)) {
      marcar(x, i, i + 1);
      i = listaDeLugares(x, i + 1, 'incluir');
      continue;
    }
    if (PREP_LUGAR_FUERTE.has(t.w) && ARTICULOS.has(T[i + 1]?.w) && BARRIO_PREVIO.has(T[i + 2]?.w) && pareceLugar(x, i + 2)) {
      marcar(x, i, i + 2);
      i = listaDeLugares(x, i + 2, 'incluir');
      continue;
    }
    // «Vendo aceite y no arroz a colmados»: justo después de lo que vende, lo negado es otro producto (no vende arroz),
    // no a quién busca ni dónde.
    const otro = otroProductoNegado(x, i);
    if (otro) { marcar(x, i, otro); i = Math.max(i + 1, spanProducto(x, i, { fin: otro, frase: 'no' }, 'ninguno')); continue; }
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

// ¿Empieza en «i» un «no …» (o «y no …», «, ni …») justo después de lo que vende, con otro producto? Devuelve dónde empieza ese producto, o 0.
function otroProductoNegado(x, i) {
  const { T } = x;
  if (x.tipo !== 'comercial' || x.ultimoProductoFin < 0) return 0;
  let k = i;
  if (k === x.ultimoProductoFin && (SEPARADORES.has(T[k].w) || ['pero', 'but'].includes(T[k].w))) k++;
  else if (!(k - 1 === x.ultimoProductoFin && (esComa(T[k - 1]) || SEPARADORES.has(T[k - 1].w)))) return 0;
  else if (['pero', 'but'].includes(T[k].w)) k++;
  if (!['no', 'ni', 'not', 'nor'].includes(T[k]?.w)) return 0;
  const q = k + 1;
  const sig = T[q];
  // «Vendo café, pero no café molido», «publicidad en vallas, no en redes sociales»: lo negado es una forma de lo que vende.
  const ultimo = comparable(x.productos[x.productos.length - 1] || '');
  if (ultimo && sig && sig.tipo === 'p' && !lugarEn(x, q, true) && !lugarEn(x, q + 1, true) && !x.ent[q + 1]?.datos.some(dd => dd.que === 'sector')) {
    if (sig.w.length > 2 && !esRelleno(sig.w) && ultimo.split(' ').includes(sig.w)) return q;
    if (['en', 'de', 'para', 'con', 'in', 'for', 'with'].includes(sig.w) && ` ${ultimo} `.includes(` ${sig.w} `) && T[q + 1]?.tipo === 'p') return q;
  }
  if (!sig || sig.tipo !== 'p' || esRelleno(sig.w) || INICIO_DE_EXCLUSION.has(sig.w) || PREP_LUGAR.has(sig.w) || detectar(x, q)) return 0;
  if (x.ent[q]?.datos.some(dd => ['sector', 'zona', 'tamano', 'pais', 'extranjero', 'capcosa', 'calle'].includes(dd.que)) || lugarEn(x, q, true)) return 0;
  return q;
}

function manejar(x, d, i) {
  const { T } = x;
  switch (d.tipo) {
    case 'experiencia': {
      // «sin experiencia no»: no se sabe si la quiere sin experiencia o no. Se pregunta.
      const neg = negacionDespues(x, d.fin);
      if (neg) { agregarDuda(x, 'texto', texto(x, i, neg)); marcar(x, i, neg); return neg; }
      // «No busco trabajo sin experiencia»: la negación de antes dice lo contrario (tiene experiencia). Se pregunta.
      for (let q = i - 1; q >= 0 && q >= i - 5 && !esFuerte(T[q]) && !esComa(T[q]); q--) {
        if (!['no', 'not', 'nunca', 'never', 'dont'].includes(T[q].w)) continue;
        agregarDuda(x, 'texto', texto(x, q, d.fin));
        marcar(x, q, d.fin);
        return d.fin;
      }
      x.experiencia = 'no_requerida';
      marcar(x, i, d.fin);
      return d.fin;
    }
    case 'objetivo':
      return objetivoNoDisponible(x, i, d.fin, d.clave);
    case 'objetivoNegado': {
      // «I don't want to find investors»: lo que no quiere no se pregunta. «no a la competencia»: se excluye.
      let a = i;
      while (a > 0 && a > i - 4 && !esFuerte(T[a - 1]) && !esComa(T[a - 1])) a--;
      if (d.clave === 'competidores' && x.exclusiones.length < TOPE) x.exclusiones.push(texto(x, i, d.fin));
      marcar(x, a, d.fin);
      return d.fin;
    }
    case 'difuso':
      // «en cualquier parte del país», «en cualquier lugar de RD»: es todo el país.
      // «o donde sea», «en cualquier lugar» solos: no es un lugar exacto. Se pregunta (si le sirve cualquiera, marca «Todo el país»).
      if (d.pais) x.pais.explicito = true;
      else agregarDuda(x, 'lugar_difuso', texto(x, i, d.fin));
      marcar(x, i, d.fin);
      return d.fin;
    case 'autonomia': {
      // «hazlo todo tú solo», «sin preguntarme»: pide más libertad (salvo «no les escribas sin preguntarme», que pide lo contrario).
      let a = i;
      let negado = false;
      while (a > 0 && !esFuerte(T[a - 1])) { a--; if (NEGACIONES.has(T[a].w)) negado = true; }
      if (!negado) x.autonomiaPedida = true;
      let fin = d.fin;
      if (['primero', 'antes', 'first'].includes(T[fin]?.w)) fin++;
      marcar(x, i, fin);
      return fin;
    }
    case 'compra': {
      // «Le compro a fincas y le vendo a supermercados»: si también vende, lo que compra solo explica.
      if (x.tieneVenta) {
        let b = d.fin;
        while (b < x.n && !esFuerte(T[b]) && !esComa(T[b]) && !['y', 'e', 'pero', 'and', 'but'].includes(T[b].w)) b++;
        marcar(x, i, b);
        return b;
      }
      return objetivoNoDisponible(x, i, d.fin, 'proveedores');
    }
    case 'relleno':
    case 'contactoPropio':
      marcar(x, i, d.fin);
      return d.fin;
    case 'cambio': {
      // «Ah no, mejor en La Romana»: no se sabe si quiere los dos lugares o solo el último. Se pregunta.
      let fin = d.fin;
      if (esComa(T[fin]) && T[fin + 1]?.w === 'mejor') fin += 2;
      else if (T[fin]?.w === 'mejor') fin++;
      agregarDuda(x, 'cambio', texto(x, i, d.fin));
      marcar(x, i, fin);
      return fin;
    }
    case 'nombre':
      return spanNombre(x, i, d);
    case 'negproducto': {
      // «No vendo paneles solares», «no páginas web»: se lee y se deja fuera de lo que vende.
      marcar(x, i, d.fin);
      return spanProducto(x, i, { fin: d.fin, frase: 'no' }, 'ninguno');
    }
    case 'notengo':
    case 'razon': {
      marcar(x, i, d.fin);
      const fin = finDeRazon(x, d.fin);
      marcar(x, d.fin, fin);
      return fin;
    }
    case 'origen': {
      marcar(x, i, d.fin);
      const L = lugarTras(x, d.fin);
      marcar(x, d.fin, L.q);
      const fin = listaDeLugares(x, L.q, 'propia');
      // «Me mudé a Santiago desde La Vega»: de dónde viene no es dónde está ni dónde busca.
      const antes = ['desde', 'de', 'from'].includes(T[fin]?.w) && /mud|moved/.test(texto(x, i, d.fin)) ? lugarTras(x, fin + 1) : null;
      if (antes && antes.L.que === 'zona') {
        const propias = x.zonasPropias.length;
        marcar(x, fin, antes.q);
        const fin2 = listaDeLugares(x, antes.q, 'propia');
        x.zonasPropias.length = propias;
        return fin2;
      }
      return fin;
    }
    case 'usar': {
      // Si nombra una fuente («usa Google Maps»), se pregunta por la fuente; si no, por lo que pidió.
      const fuentes = [];
      for (let k = i; k < d.fin; k++) if (x.ent[k]?.datos.some(dd => dd.que === 'fuente')) { fuentes.push(texto(x, k, x.ent[k].fin)); k = x.ent[k].fin - 1; }
      if (fuentes.length) agregarDuda(x, 'fuente', fuentes.join(', '));
      else agregarDuda(x, 'texto', texto(x, i, d.fin));
      marcar(x, i, d.fin);
      return d.fin;
    }
    case 'trabajoActual':
      // El empleo que ya tiene no es una preferencia: se pregunta qué quiere decir.
      agregarDuda(x, 'texto', texto(x, i, d.fin));
      marcar(x, i, d.fin);
      return d.fin;
    case 'horario':
      agregarPrioridad(x, i, d.fin);
      marcar(x, i, d.fin);
      return d.fin;
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
      // «Research Hotel Matum», «Investiga el Hotel Matum»: investigar una empresa en particular llega en la fase 3.
      if (!d.neg && d.claves.includes('investigar')) {
        let q = d.fin;
        while (q < x.n && ['a', 'al', 'el', 'la', 'the', 'to'].includes(T[q].w)) q++;
        const nombre = finDeNombre(x, q);
        if (nombre > q && hayNombrePropio(x, q, nombre)) return objetivoNoDisponible(x, i, nombre, 'una_empresa');
      }
      for (const c of d.claves) (d.neg ? x.capNegadas : x.capPedidas).add(c);
      // «don't email them», «never email them»: tampoco se preparan correos.
      if (d.neg && /^(e ?mail|mail)/.test(d.frase || '')) x.capNegadas.add('correos');
      if (!d.neg && d.claves.includes('contactar') && POR_TELEFONO.test(d.frase || '')) x.porTelefono = true;
      if (!d.neg && d.enviar) x.contactarPedido = true;
      if (d.neg && d.enviar) x.capNegadas.add('contactar');
      if (x.capPedidas.has('contactar')) { x.capPedidas.delete('contactar'); x.contactarPedido = true; }
      marcar(x, i, d.fin);
      // «Don't email or call anyone»: lo de después de la «o» también se niega.
      let fin = d.fin;
      if (d.neg && ['or', 'o', 'ni', 'nor', 'y', 'and'].includes(T[fin]?.w)
        && ['call', 'llames', 'llamar', 'contact', 'contactes', 'escribas', 'text', 'message', 'whatsapp', 'wasap'].includes(T[fin + 1]?.w)) {
        x.capNegadas.add('contactar');
        marcar(x, fin, fin + 2);
        fin += 2;
      }
      return finDeObjetoDeCapacidad(x, fin);
    }
    case 'frec': {
      // «every day except Sundays», «todos los días menos los fines de semana», «cada semana pero no los lunes»:
      // todavía no puedo saltarme días. Nunca va a «Excluir».
      const dias = d.neg ? 0 : diasExceptuados(x, d.fin);
      if (dias) {
        if (d.nd || d.clave === 'diaria') agregarDuda(x, 'frecuencia_no_disponible', texto(x, d.ini, dias));
        else { x.frecuencias.push({ clave: d.clave, texto: texto(x, d.ini, d.fin), dia: true }); }
        marcar(x, i, dias);
        return dias;
      }
      if (!d.neg) {
        if (d.nd) agregarDuda(x, 'frecuencia_no_disponible', texto(x, d.ini, d.fin));
        else x.frecuencias.push({ clave: d.clave, texto: texto(x, d.ini, d.fin), dia: d.dia });
      } else if (d.dia) x.supuestos.add('dia_semana');
      marcar(x, i, d.fin);
      return d.fin;
    }
    case 'telefono':
      x.supuestos.add('telefono');
      marcar(x, i, d.fin);
      return d.fin;
    case 'salario':
      if (d.tramo.soloPeriodo) agregarPrioridad(x, i, d.fin);
      else if (x.tipo === 'laboral') {
        x.tramosSalario.push({ ...d.tramo, texto: texto(x, i, d.fin), pos: i });
        for (const e of d.tramo.extras) agregarPrioridad(x, e.ini, e.fin);
      } else if (d.tramo.montos.length) agregarDuda(x, 'texto', texto(x, i, d.fin));
      marcar(x, i, d.fin);
      return d.fin;
    case 'salarioDudoso':
      x.tramosSalario.push({ montos: [], extras: [], alternativa: true, texto: texto(x, i, d.fin), pos: i });
      marcar(x, i, d.fin);
      return d.fin;
    case 'salarioEscrito':
      x.tramosSalario.push({ montos: [], extras: [], dudoso: true, texto: texto(x, i, d.fin), pos: i });
      marcar(x, i, d.fin);
      return d.fin;
    case 'excluir':
      return spanExcluir(x, i, d);
    case 'lugarDudoso': {
      // El lugar se lee (para saber dónde termina) pero no se busca ahí.
      const zonas = x.zonas.length;
      const libres = x.zonasLibres.length;
      const secuencia = x.secuencia.length;
      marcar(x, i, d.lugar);
      let fin = listaDeLugares(x, d.lugar, 'incluir');
      x.zonas.length = zonas;
      x.zonasLibres.length = libres;
      x.secuencia.length = secuencia;
      if (['tambien', 'too', 'also'].includes(T[fin]?.w)) fin++;
      agregarDuda(x, 'lugar_inseguro', texto(x, i, fin));
      marcar(x, i, fin);
      return fin;
    }
    case 'pero': {
      // «but restaurants only in Santiago», «pero los restaurantes solo en Santiago»: una regla solo para una parte. Se pregunta.
      const fin = reglaParaUnaParte(x, d.fin);
      if (fin) { agregarDuda(x, 'combinacion_parcial', texto(x, i, fin)); marcar(x, i, fin); return fin; }
      marcar(x, i, d.fin);
      return d.fin;
    }
    case 'mandame':
      // «mándamela por WhatsApp»: todavía no se manda nada por WhatsApp. Se avisa. Sin WhatsApp, lo que encuentre se ve en OPORTIA.
      if (d.whatsapp) x.supuestos.add('enviar_whatsapp');
      marcar(x, i, d.fin);
      return d.fin;
    case 'entrega': {
      if (d.lugar >= 0) { marcar(x, i, d.lugar); return listaDeLugares(x, d.lugar, 'excluir'); }
      const fin = finDeRazon(x, d.fin);
      agregarDuda(x, 'texto', texto(x, i, fin));
      marcar(x, i, fin);
      return fin;
    }
    case 'prioridad': {
      // «colmados y farmacias sobre todo», «restaurantes sobre todo»: la prioridad va con los negocios de antes.
      const sig = T[d.fin];
      if (x.rolObjetivo[i - 1] && (!sig || esFuerte(sig) || esComa(sig) || ['pero', 'but', 'y', 'and'].includes(sig.w))) {
        let a = i;
        while (a > 0 && (x.rolObjetivo[a - 1] || ((SEPARADORES.has(T[a - 1].w) || esComa(T[a - 1])) && x.rolObjetivo[a - 2]))) a--;
        // Empieza en el primer negocio concreto («cualquier negocio sirve, restaurantes sobre todo» → «restaurantes»).
        while (a < i && !x.ent[a]?.datos.some(dd => dd.que === 'sector' && !dd.general)) a++;
        const claves = [];
        for (let q = a; q < i; q++) { const sc = datoDe(x, q, 'sector'); if (sc && !sc.general) claves.push(sc.clave); }
        x.sectoresPrioridad.push(...claves);
        // «cualquier negocio sirve, restaurantes sobre todo»: se buscan todos, con los restaurantes primero.
        if (x.general.todos && claves.length) x.sectores = x.sectores.filter(c => !claves.includes(c));
        agregarPrioridad(x, a, i);
        marcar(x, i, d.fin);
        return d.fin;
      }
      // «prefiero Santiago» sin ningún otro lugar: es dónde quiere (no hay otro lugar al que darle prioridad).
      const lugares = soloLugaresDesde(x, ['en', 'in'].includes(T[d.fin]?.w) ? d.fin + 1 : d.fin);
      if (lugares && !x.zonas.length && !x.zonasLibres.length && !x.pais.explicito && !x.pais.nombre) {
        marcar(x, i, lugares);
        return listaDeLugares(x, lugares, 'incluir');
      }
      return spanPreferencia(x, i, d.fin, d.fin, true);
    }
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
    case 'propio': {
      // «No soy colmado, vendo a colmados»: lo que dice que no es no es su negocio (ni lo que vende).
      if (d.negado) {
        const n = negocioPropioEn(x, d.fin, d.frase);
        marcar(x, i - 1, n.fin);
        return n.fin;
      }
      return spanPropio(x, i, d);
    }
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

// Después de una frecuencia, ¿dice qué días no («except Sundays», «menos los fines de semana», «pero no los lunes»)? Devuelve dónde termina, o 0.
const DIAS_SUELTOS = new Set(['weekends', 'weekend', 'feriados', 'holidays', 'festivos']);
function diasExceptuados(x, k) {
  const { T } = x;
  let q = esComa(T[k]) ? k + 1 : k;
  if (['pero', 'but', 'y', 'and'].includes(T[q]?.w) && ['no', 'not'].includes(T[q + 1]?.w)) q += 2;
  else if (['excepto', 'except', 'menos', 'salvo', 'sin', 'excluding', 'minus', 'besides'].includes(T[q]?.w)) q++;
  else return 0;
  const esDia = r => DIAS.has(T[r]?.w) || DIAS.has(T[r]?.w.replace(/s$/, '')) || DIAS_SUELTOS.has(T[r]?.w);
  let fin = 0;
  for (let vueltas = 0; vueltas < 7 && q < x.n; vueltas++) {
    while (q < x.n && ['los', 'las', 'el', 'la', 'on', 'the', 'a', 'for', 'de'].includes(T[q].w) && !esDia(q)) q++;
    if (['fin', 'fines'].includes(T[q]?.w) && T[q + 1]?.w === 'de' && T[q + 2]?.w === 'semana') q += 3;
    else if (esDia(q)) q++;
    else break;
    fin = q;
    if (!(SEPARADORES.has(T[q]?.w) || esComa(T[q]))) break;
    q++;
  }
  return fin;
}

// Después de «pero»: un negocio de los que se buscan (no todos) con un lugar solo para él. Devuelve dónde termina, o 0.
function reglaParaUnaParte(x, k) {
  const { T } = x;
  let j = k;
  while (j < x.n && ARTICULOS.has(T[j].w) && !x.ent[j]) j++;
  const s = datoDe(x, j, 'sector');
  if (!s || s.general || !x.sectores.includes(s.clave) || new Set(x.sectores).size < 2) return 0;
  let q = x.ent[j].fin;
  if (['solo', 'only', 'solamente', 'just'].includes(T[q]?.w)) q++;
  if (!['en', 'in', 'de', 'del', 'at'].includes(T[q]?.w)) return 0;
  const L = lugarTras(x, q + 1);
  if (!L || L.L.que !== 'zona') return 0;
  let fin = L.L.fin;
  while ((SEPARADORES.has(T[fin]?.w) || esComa(T[fin])) && lugarEn(x, fin + 1, true)?.que === 'zona') fin = lugarEn(x, fin + 1, true).fin;
  return fin;
}

// Algo que todavía no hace (competidores, proveedores, empleados, publicar…): se dice y no se lee nada más de esa frase.
function objetivoNoDisponible(x, i, fin, clave) {
  const { T } = x;
  let a = i;
  while (a > 0 && !esFuerte(T[a - 1])) a--;
  let b = fin;
  while (b < x.n && !esFuerte(T[b])) b++;
  if (!x.dudas.some(d => d.clave === `objetivo_${clave}`)) {
    // «publica mis productos en Instagram»: se repite lo que pidió, hasta la coma o el punto.
    let c = fin;
    while (c < b && !esComa(T[c])) c++;
    let pedido = clave === 'otra_tarea' ? texto(x, i, c).replace(/\s+/g, ' ') : '';
    if (pedido.length > 80) pedido = pedido.slice(0, 80).replace(/\s+\S*$/, '');
    x.dudas.push({ clave: `objetivo_${clave}`, texto: pedido, sugerencias: [] });
  }
  marcar(x, a, b);
  return b;
}

// Hasta dónde llega una razón («porque esos no compran») o algo que no tiene («no tengo página web»).
// Termina en la coma, el punto, «pero», o una «y» que empieza otra instrucción («y me gustaría…», «y también…»).
function finDeRazon(x, k) {
  const { T } = x;
  let j = k;
  while (j < x.n) {
    const t = T[j];
    if (esFuerte(t) || esComa(t) || ['pero', 'but', 'sino'].includes(t.w)) break;
    if (['y', 'e', 'and'].includes(t.w) && empiezaInstruccion(x, j + 1)) break;
    j++;
  }
  return j;
}

function empiezaInstruccion(x, k) {
  const { T } = x;
  const t = T[k];
  if (!t) return true;
  if (['tambien', 'ademas', 'also', 'que', 'revisa', 'prepara', 'busca', 'buscame'].includes(t.w)) return true;
  if (capacidadEn(x, k) || frecuenciaEn(x, k)) return true;
  const d = detectar(x, k);
  return Boolean(d && ['verbo', 'cap', 'frec', 'prioridad', 'condicion', 'producto', 'solo', 'ciclo'].includes(d.tipo));
}

// «se llama Solar Caribe», «mi marca es Seguros Cibao», «la doctora que me ayuda se llama María»: un nombre, no un dato.
function spanNombre(x, i, d) {
  const { T } = x;
  let b = d.fin;
  while (b < x.n && !esFuerte(T[b]) && !esComa(T[b]) && !['pero', 'but'].includes(T[b].w)) {
    if (['y', 'e', 'and'].includes(T[b].w) && (detectar(x, b + 1) || empiezaInstruccion(x, b + 1))) break;
    if (b > d.fin && !T[b].mayus && detectar(x, b)) break;
    b++;
  }
  // Lo de antes que no dice nada más («la doctora que me ayuda») va con el nombre.
  let a = i;
  while (a > 0 && !x.usado[a - 1] && T[a - 1].tipo === 'p' && !x.ent[a - 1] && !detectar(x, a - 1)) a--;
  marcar(x, a, b);
  return b;
}

// ¿Hay una negación de después en «k» («bancos no», «los talleres no me interesan», «bares tampoco»)? Devuelve dónde termina.
const FIN_DE_PARTE = new Set(['y', 'e', 'and', 'pero', 'but', 'porque', 'because', 'pues', 'que', 'ni']);
function negacionDespues(x, k) {
  const m = buscarEn(x.T, k, NEG_DESPUES);
  if (!m) return 0;
  const t = x.T[m.fin];
  return !t || esFuerte(t) || esComa(t) || FIN_DE_PARTE.has(t.w) || buscarEn(x.T, m.fin, PORQUE) ? m.fin : 0;
}

function afirmacionDespues(x, k) {
  const m = buscarEn(x.T, k, SI_DESPUES);
  if (!m) return 0;
  const t = x.T[m.fin];
  return !t || esFuerte(t) || esComa(t) || ['y', 'e', 'and', 'pero', 'but'].includes(t.w) ? m.fin : 0;
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
  for (let vueltas = 0; vueltas < 4; vueltas++) {
    if (['todavia', 'aun', 'ya', 'yet', 'for', 'now', 'them', 'tampoco', 'tambien', 'directamente', 'yourself'].includes(T[j]?.w)) { marcar(x, j, j + 1); j++; continue; }
    // «contáctalos tú mismo»: lo hace OPORTIA (contactar se enciende a mano); no es pedir más libertad.
    if (T[j]?.w === 'tu' && ['mismo', 'misma'].includes(T[j + 1]?.w)) { marcar(x, j, j + 2); j += 2; continue; }
    // «don't email anyone (yet)», «no emails to anyone», «a nadie»: a quién no se escribe no es a quién se busca.
    const q = ['a', 'to'].includes(T[j]?.w) ? j + 1 : j;
    if (['anyone', 'anybody', 'everyone', 'nobody', 'nadie', 'ninguno', 'ninguna'].includes(T[q]?.w)) { marcar(x, j, q + 1); j = q + 1; continue; }
    if (['a', 'al', 'to'].includes(T[j]?.w) && T[j + 1] && T[j + 1].tipo === 'p' && !x.ent[j + 1]?.datos.some(d => d.que === 'sector')) {
      let b = j + 1;
      while (b < x.n && b - j < 5 && T[b].tipo === 'p' && !detectar(x, b) && !lugarEn(x, b, false)) b++;
      marcar(x, j, b);
      j = b;
      continue;
    }
    if (['por', 'via', 'by', 'con', 'en'].includes(T[j]?.w) && ['gmail', 'correo', 'email', 'whatsapp', 'telefono', 'llamada', 'mensaje', 'outlook', 'phone', 'mail'].includes(T[j + 1]?.w)) {
      if (POR_TELEFONO.test(T[j + 1].w) || T[j + 1].w === 'llamada') x.porTelefono = true;
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
    // «mi instagram es @cervezajr», «mi tienda en instagram es instagram.com/petjunior»: su propia cuenta, no de dónde sacar la información.
    let propia = false;
    for (let q = i - 1; q >= 0 && q >= i - 3 && !esFuerte(T[q]) && !esComa(T[q]); q--) if (['mi', 'mis', 'nuestro', 'nuestra', 'my', 'our'].includes(T[q].w)) propia = true;
    if (propia) {
      let fin = e.fin;
      if (['es', 'is'].includes(T[fin]?.w) || (esComa(T[fin]) && x.original[T[fin].ini] === ':')) fin++;
      if (esEnlace(x, fin) || (T[fin]?.tipo === 'p' && x.original[T[fin].ini - 1] === '@')) fin++;
      else if (fin > e.fin) fin--;
      marcar(x, i, fin);
      return fin;
    }
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
  if (e.datos.some(d => d.que === 'producto') && x.tipo === 'comercial') {
    // «Mi página web: https://…», «My website is …»: es lo suyo, no lo que vende.
    if (POSESIVOS.has(T[i - 1]?.w) && !x.usado[i - 1]) {
      const fin = cosaPropia(x, e.fin);
      if (fin) { marcar(x, i - 1, fin); return fin; }
    }
    // «Seguros Pérez», «Agua Crystal»: con mayúscula y un nombre pegado, es el nombre de una empresa, no lo que vende. Se pregunta.
    if (x.productos.length && T[i].mayus && finDeNombre(x, e.fin) > e.fin) return i;
    // «Investiga hoteles y clínicas. Después prepara recomendaciones de software»: lo que va con lo que pide hacer (recomendar,
    // propuestas) es lo mismo que vende, no otro producto con su propio negocio: no cuenta para «cada producto con su negocio».
    let deCapacidad = false;
    for (let q = i - 1; q >= 0 && !esFuerte(T[q]) && i - q < 8; q--) if (buscarEn(T, q, CAP_PALABRAS)) { deCapacidad = true; break; }
    const antes = x.secuencia.length;
    const fin = spanProducto(x, i, { fin: i });
    if (deCapacidad && x.secuencia.length > antes && x.secuencia[x.secuencia.length - 1].t === 'P') x.secuencia.pop();
    return fin;
  }
  return i;
}

// Después de «mi página web», «my website»: «es …», «is …», «: …» o un enlace. Devuelve dónde termina, o 0.
function cosaPropia(x, k) {
  const { T } = x;
  let j = k;
  const dosPuntos = esComa(T[j]) && x.original[T[j].ini] === ':';
  if (['es', 'is', 'son', 'are'].includes(T[j]?.w) || dosPuntos) j++;
  else if (!esEnlace(x, j)) return 0;
  if (esEnlace(x, j)) return j + 1;
  // «Mi página web es Agua Junior»: un nombre. «Mi software es para hoteles» no: ahí sí habla de lo que vende.
  const nombre = finDeNombre(x, j);
  return nombre > j ? nombre : 0;
}

const NO_SOLO = indice(['no solo', 'no solamente', 'not only', 'not just']);
// «a hoteles», «para clínicas», «encontrar restaurantes», «quiero hoteles»…
const OBJETIVO_TRIG = indice(['a', 'al', 'para', 'to', 'for', 'encontrar', 'encuentra', 'encuentrame', 'busca', 'buscar', 'buscame', 'busques', 'find',
  'conseguir', 'consigueme', 'venderle a', 'venderles a', 'vender a', 'venderle', 'venderles', 'dirigido a', 'enfocado en', 'clientes como', 'targeting',
  'looking for', 'enfocate en', 'apunta a', 'llegar a', 'llegarle a', 'reach', 'target', 'targets', 'mis clientes son', 'mis clientes serian',
  'me sirven', 'me sirve', 'tambien me sirven', 'tambien me sirve',
  'my customers are', 'my clients are',
  // «Los que me compran son los colmados»: sus clientes son de ese tipo; es a quién busca.
  'los que me compran son', 'las que me compran son', 'quienes me compran son', 'los que me compran serian', 'mis compradores son',
  'the ones who buy from me are', 'those who buy from me are']);

function objetivoDesde(x, i) {
  const { T } = x;
  const m = buscarEn(T, i, OBJETIVO_TRIG);
  if (!m) return i;
  if (x.tipo !== 'comercial') return i;
  let k = m.fin;
  while (k < x.n && ['los', 'las', 'unos', 'unas', 'el', 'la', 'me', 'nuevos', 'nuevas', 'clientes', 'cliente', 'the', 'some', 'new', 'mas', 'sitios', 'lugares',
    'tipo', 'como', 'more', 'places', 'like', 'otros', 'otras'].includes(T[k].w) && !x.ent[k]) k++;
  if (esComa(T[k]) && x.original[T[k].ini] === ':') k++;
  // «to not only hotels but also clinics», «no solo a hoteles sino también a clínicas»: «no solo» no niega nada.
  const noSolo = buscarEn(T, k, NO_SOLO);
  if (noSolo) { k = noSolo.fin; if (['a', 'al', 'to'].includes(T[k]?.w)) k++; while (k < x.n && ['los', 'las', 'the'].includes(T[k].w) && !x.ent[k]) k++; }
  // «a quienes venden carros»: lo que venden ellos describe a quién se busca.
  if (['quienes', 'those', 'people'].includes(T[k]?.w) && (VENDEN_ELLOS.has(T[k + 1]?.w) || (['who', 'that'].includes(T[k + 1]?.w) && VENDEN_ELLOS.has(T[k + 2]?.w)))) {
    marcar(x, i, k);
    return spanObjetivo(x, k, { libre: true });
  }
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
      const sugerencias = x.dudas.length < MAXIMO_DE_DUDAS && conSentido.length <= 3 ? sugerenciasDeLugar(texto(x, conSentido[0], conSentido[conSentido.length - 1] + 1), x) : [];
      const trasPreposicion = PREP_LUGAR_FUERTE.has(T[conSentido[0] - 1]?.w) && conSentido.length <= 3;
      if (lugar || (sugerencias.length && trasPreposicion)) {
        // «la Esperanza»: el artículo va con el nombre (así se distingue de Esperanza, en Valverde).
        const desde = ARTICULOS.has(T[conSentido[0] - 1]?.w) && conSentido[0] - 1 >= a ? conSentido[0] - 1 : conSentido[0];
        const nombre = texto(x, desde, conSentido[conSentido.length - 1] + 1);
        if (x.zonasLibres.length < TOPE) x.zonasLibres.push(nombre);
        agregarDuda(x, 'lugar', nombre, sugerencias);
      } else agregarDuda(x, 'texto', valor);
    }
    i = Math.max(j, i + 1);
  }
}

const PALABRAS_DE_TRABAJO = new Set(['trabajo', 'trabajar', 'empleo', 'emplearme', 'puesto', 'vacante', 'plaza', 'cargo', 'pasantia', 'pasantias', 'pasante',
  'practica', 'practicas', 'internado', 'aprendiz', 'becario', 'contratar', 'contraten', 'contratarme', 'job', 'jobs', 'work', 'intern', 'internship',
  'hire', 'hired', 'career', 'chamba', 'chiripa', 'camello', 'pega']);

// ---------- Leer todo ----------
export function leer(original) {
  const x = nuevoEstado(original);
  const tipo = decidirTipo(x);
  x.tipo = tipo.tipo;
  if (tipo.supuesto) x.supuestos.add(tipo.supuesto);
  if (tipo.duda) agregarDuda(x, 'tipo', '');
  for (const [a, b] of x.senalesNegadas) marcar(x, a, b);
  antesDeRecorrer(x);
  recorrer(x);
  sobrantes(x);
  // Se supuso que es para vender, pero no hay nada que vender y lo que quedó sin entender habla de trabajo («hacer mis prácticas de
  // …», «un internado»): justo eso decide si es para vender o para buscar empleo. Se pregunta, en vez de decir con seguridad
  // «Entendí que es para vender».
  const hablaDeTrabajo = d => d.clave === 'texto' && comparable(d.texto).split(' ').some(p => PALABRAS_DE_TRABAJO.has(p));
  if (x.supuestos.has('tipo') && !x.productos.length && !x.productosPropios.length && x.dudas.some(hablaDeTrabajo)) {
    x.supuestos.delete('tipo');
    agregarDuda(x, 'tipo', '');
  }
  // «a personas y empresas», «y también a personas»: a personas sueltas no las busco (solo negocios). Se avisa; nunca se pierde en silencio.
  if (x.tipo === 'comercial' && personasSueltas(x)) x.supuestos.add('personas_sueltas');
  // «a maestros y policías», «a turistas», «a los empleados de las zonas francas», «a familias jóvenes»: son personas, no negocios.
  // Solo busco información pública de negocios (nada de datos personales): no se guardan como «negocios que no están en mi
  // lista» y se pregunta a qué negocios quiere venderle. Mientras tanto no se puede aprobar.
  const personas = x.sectoresLibres.filter(esGrupoDePersonas);
  if (personas.length) {
    x.sectoresLibres = x.sectoresLibres.filter(v => !personas.includes(v));
    agregarDuda(x, 'personas', personas.join(', '));
    x.supuestos.delete('personas_sueltas');
  }
  // «en Puerto Rico y en San Juan»: con Puerto Rico al lado, «San Juan» casi seguro es su capital (fuera del país).
  // Se guarda así y se pregunta; si era la provincia dominicana, la persona lo escribe en «Dónde».
  if (x.zonasLibres.some(z => /puerto rico/.test(comparable(z))) && x.zonas.includes('san-juan')) {
    x.zonas = x.zonas.filter(z => z !== 'san-juan');
    x.zonasLibres.push('San Juan (Puerto Rico)');
    agregarDuda(x, 'lugar_homonimo', 'San Juan');
  }
  // «no a ferreterías pequeñas, solo a las grandes y a constructoras»: el tamaño es solo para un negocio. Se pregunta.
  if (x.tamanoDeUnNegocio && new Set(x.sectores).size > 1) agregarDuda(x, 'combinacion_parcial', x.tamanoDeUnNegocio);
  // «en Punta Cana a hoteles y en Santiago a fábricas»: cada lugar con su negocio no se puede guardar así.
  // Se juntan los grupos seguidos del mismo tipo; si hay T Z T Z (o Z T Z T) con lugares distintos, se pregunta.
  const grupos = [];
  for (const g of x.secuencia.filter(g => g.t !== 'P')) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.t === g.t) { if (g.claves) ultimo.claves.push(...g.claves); } else grupos.push({ t: g.t, claves: [...(g.claves || [])] });
  }
  const zonasDeGrupos = grupos.filter(g => g.t === 'Z').map(g => g.claves.slice().sort().join());
  const patron = grupos.map(g => g.t).join('');
  if (x.tipo === 'comercial' && (patron.includes('ZTZT') || patron.includes('TZTZ')) && new Set(zonasDeGrupos).size > 1) agregarDuda(x, 'combinacion', '');
  // «paneles solares a hoteles y cámaras a farmacias»: cada producto con su negocio tampoco se puede guardar así.
  // También al revés: «busca hoteles … para mis paneles. Busca clínicas … para mis cámaras» (cada negocio antes de su producto).
  const pt = [];
  for (const g of x.secuencia) if ((g.t === 'P' || g.t === 'T') && pt[pt.length - 1]?.t !== g.t) pt.push(g);
  const conNegocioDespues = new Set(pt.filter((g, k) => g.t === 'P' && pt[k + 1]?.t === 'T').map(g => g.valor));
  const conNegocioAntes = new Set(pt.filter((g, k) => g.t === 'P' && pt[k - 1]?.t === 'T').map(g => g.valor));
  if (x.tipo === 'comercial' && (conNegocioDespues.size > 1 || conNegocioAntes.size > 1)) agregarDuda(x, 'combinacion_producto', '');
  return x;
}

// ¿Pide venderle a personas sueltas («a personas», «y a las personas», «to individuals»)?
const PERSONAS = new Set(['personas', 'persona', 'people', 'individuals', 'particulares', 'familias', 'gente']);
// Grupos de personas (no negocios): la primera palabra de lo que se pidió buscar.
const GRUPOS_DE_PERSONAS = new Set([...PERSONAS, 'individuos', 'familia', 'maestros', 'maestras', 'profesores', 'profesoras', 'policias', 'policia', 'militares',
  'soldados', 'estudiantes', 'estudiante', 'universitarios', 'universitarias', 'turistas', 'turista', 'visitantes', 'empleados', 'empleadas', 'trabajadores',
  'trabajadoras', 'obreros', 'obreras', 'enfermeras', 'enfermeros', 'doctores', 'doctoras', 'padres', 'madres', 'mamas', 'papas', 'jovenes', 'ninos', 'ninas',
  'adolescentes', 'muchachos', 'muchachas', 'mujeres', 'hombres', 'senoras', 'senores', 'damas', 'caballeros', 'ancianos', 'envejecientes', 'jubilados',
  'pensionados', 'abuelos', 'abuelas', 'parejas', 'novios', 'novias', 'vecinos', 'residentes', 'inquilinos', 'amas', 'consumidores', 'peloteros', 'atletas',
  'deportistas', 'pacientes', 'extranjeros', 'dominicanos', 'dominicanas', 'emigrantes', 'migrantes', 'motoconchistas', 'taxistas', 'choferes', 'camioneros',
  'conductores', 'empleados', 'servidores', 'funcionarios', 'feligreses', 'creyentes', 'fieles', 'bebes', 'personal',
  'teachers', 'police', 'policemen', 'officers', 'soldiers', 'students', 'tourists', 'visitors', 'employees', 'workers', 'nurses', 'parents', 'moms', 'mothers',
  'fathers', 'dads', 'kids', 'children', 'teens', 'teenagers', 'women', 'men', 'seniors', 'retirees', 'elderly', 'couples', 'neighbors', 'residents',
  'tenants', 'homeowners', 'consumers', 'athletes', 'patients', 'foreigners', 'expats', 'drivers', 'families', 'young', 'individual']);
const esGrupoDePersonas = valor => {
  const palabras = comparable(valor).split(' ').filter(p => !ARTICULOS.has(p) && !POSESIVOS.has(p));
  return GRUPOS_DE_PERSONAS.has(palabras[0]);
};
function personasSueltas(x) {
  const { T } = x;
  for (let k = 1; k < x.n; k++) {
    if (!PERSONAS.has(T[k].w) || x.ent[k]) continue;
    let p = k - 1;
    if (['la', 'las', 'los', 'el', 'the'].includes(T[p].w) && p > 0) p--;
    if (['a', 'al', 'y', 'e', 'to', 'and', 'para', 'for', 'busca', 'buscame', 'encuentra', 'find', 'tambien', 'also'].includes(T[p].w)) return true;
  }
  return false;
}

// Antes de leer de izquierda a derecha: lo que solo se entiende mirando el final de una parte de la frase.
function antesDeRecorrer(x) {
  const { T } = x;
  const inicioDeParte = k => {
    let a = k;
    while (a > 0 && !esFuerte(T[a - 1]) && !esComa(T[a - 1]) && !['y', 'e', 'pero', 'porque', 'and', 'but'].includes(T[a - 1].w)) a--;
    return a;
  };
  for (let k = 0; k < x.n; k++) {
    if (x.usado[k] || T[k].tipo === 's') continue;
    // «Mi hermano vende celulares», «mi esposa trabaja en Moca», «mi competencia vende más barato»: lo que hace otra persona no es
    // lo que vende la persona, ni dónde busca. Tampoco el «yo no» de después («Mi socio vende seguros, yo no»).
    const tercero = otraPersonaEn(x, k);
    if (tercero) { k = tercero - 1; continue; }
    // Lo que todavía no hace (proveedores, empleados, publicar…): se dice antes de leer nada más de esa frase,
    // para que no quede, por ejemplo, «A quién buscar: clínicas» en «busco una clínica que acepte mi seguro».
    const objetivo = buscarEn(T, k, OBJETIVOS);
    // «y a mis competidores no»: no pide buscarlos, pide no venderles. Se excluye.
    const negadoDespues = objetivo ? negacionDespues(x, objetivo.fin) : 0;
    if (objetivo && negadoDespues && !negadoAntes(x, k)) {
      if (objetivo.datos[0].clave === 'competidores' && x.exclusiones.length < TOPE) x.exclusiones.push(texto(x, k, objetivo.fin));
      let a = k;
      while (a > 0 && !x.usado[a - 1] && ['a', 'al', 'y', 'e', 'to', 'and', 'ni'].includes(T[a - 1].w)) a--;
      marcar(x, a, negadoDespues);
      k = negadoDespues - 1;
      continue;
    }
    // «…, son mi competencia», «mi competencia es Ferretería Ochoa», «mi competencia vende más barato»: dice quién es su competencia
    // (que no se busca), no pide buscarla.
    if (objetivo && objetivo.datos[0].clave === 'competidores' && !negadoAntes(x, k)) {
      const fin = competenciaNombrada(x, k, objetivo.fin, inicioDeParte(k));
      if (fin) { k = fin - 1; continue; }
    }
    if (objetivo && !negadoAntes(x, k)) { k = objetivoNoDisponible(x, k, objetivo.fin, objetivo.datos[0].clave) - 1; continue; }
    const compra = buscarEn(T, k, COMPRA);
    if (compra && !x.tieneVenta && detectar(x, k)?.tipo === 'compra') { k = objetivoNoDisponible(x, k, compra.fin, 'proveedores') - 1; continue; }
    // Empleo: dónde trabajó o estudió antes («antes trabajé en Puerto Plata», «estudié en la UASD», «mi último trabajo fue en…»)
    // no es dónde busca. Es parte de su historia: no se lee como lugar ni como preferencia.
    const pasado = x.tipo === 'laboral' ? buscarEn(T, k, PASADO_LABORAL) : null;
    if (pasado && inicioDeParte(k) === k) {
      const fin = finDeRazon(x, pasado.fin);
      marcar(x, k, fin);
      k = fin - 1;
      continue;
    }
    // Empleo: «aunque acepto menos si es cerca», «y si es cerca de Gurabo acepto menos», «o menos si es cerca de mi casa»:
    // una excepción al salario mínimo. No se puede guardar así: se pregunta el salario.
    if (x.tipo === 'laboral' && excepcionDelSalario(x, k)) {
      const a = inicioDeParte(k);
      const fin = finDeRazon(x, k + 1);
      x.tramosSalario.push({ montos: [], extras: [], dudoso: true, texto: texto(x, a, fin), pos: a });
      marcar(x, a, fin);
      k = fin - 1;
      continue;
    }
    // «los colmados de por aquí ya me compran», «Los hoteles me compran toallas», «ya Hotel Matum es cliente mío»: ya son sus
    // clientes; no son clientes nuevos que buscar. Si tienen nombre, se excluyen.
    const ya = buscarEn(T, k, YA_CLIENTES);
    // «los bancos no me compran»: no son sus clientes, pero tampoco dice si los busca o no. Se pregunta.
    if (ya && NEGACIONES.has(T[k - 1]?.w)) {
      const a = inicioDeParte(k);
      const fin = finDeRazon(x, ya.fin);
      agregarDuda(x, 'texto', texto(x, a, fin));
      marcar(x, a, fin);
      k = fin - 1;
      continue;
    }
    // «Los que me compran son los colmados»: dice a quién busca (ver OBJETIVO_TRIG), no que ya son sus clientes.
    if (ya && ['me compran', 'me compra', 'nos compran', 'nos compra', 'buy from me', 'buy from us'].includes(ya.datos[0].frase)
      && ['que', 'who', 'that'].includes(T[k - 1]?.w) && ['son', 'es', 'serian', 'are', 'is'].includes(T[ya.fin]?.w)) continue;
    if (ya) {
      const fin = clientesYa(x, k, ya, inicioDeParte(k));
      k = fin - 1;
      continue;
    }
    // «ya trabajo con Hotel Matum», «we already work with Hodelpa», «ya le vendí al hotel Aloft»: con nombre, ya son sus clientes.
    const trabajoCon = x.tipo === 'comercial' ? buscarEn(T, k, YA_TRABAJO_CON) : null;
    if (trabajoCon) {
      let desde = trabajoCon.fin;
      if (['a', 'al', 'to'].includes(T[desde]?.w)) desde++;
      const b = finDeNombres(x, desde);
      if (b > desde) {
        nombresQueExcluir(x, desde, b, true);
        marcar(x, inicioDeParte(k), b);
        k = b - 1;
        continue;
      }
    }
    // Los que le venden a la persona (sus suplidores): «Los hoteles me venden toallas», «los molinos de Nagua me lo venden».
    const suplidor = buscarEn(T, k, ME_VENDEN);
    if (suplidor) {
      const fin = finDeRazon(x, suplidor.fin);
      marcar(x, inicioDeParte(k), fin);
      k = fin - 1;
      continue;
    }
    // «ya tengo a la Bonanza y a Supermercado Nacional como clientes»: los clientes que ya tiene se excluyen.
    const tengo = buscarEn(T, k, TENGO_A);
    if (tengo) {
      const fin = clientesQueYaTiene(x, inicioDeParte(k), tengo.fin);
      if (fin) { k = fin - 1; continue; }
    }
    // «sácalos», «no lo incluyas», «so skip them»: después de nombrar a sus clientes o a su competencia (que ya se excluyeron).
    const quita = x.clientesActuales || x.competidoresNombrados ? buscarEn(T, k, QUITALOS) : null;
    if (quita) { marcar(x, k, quita.fin); k = quita.fin - 1; continue; }
    // «los más grandes primero», «los hoteles primero y luego los supermercados»: lo que va antes de «primero» es una
    // preferencia, no un filtro. Lo de «luego» se lee como siempre.
    const luego = ['y', 'and'].includes(T[k + 1]?.w) && ['luego', 'despues', 'then', 'after'].includes(T[k + 2]?.w) ? k + 3
      : ['luego', 'despues', 'then'].includes(T[k + 1]?.w) ? k + 2 : 0;
    if (['primero', 'first'].includes(T[k].w) && (!T[k + 1] || esFuerte(T[k + 1]) || esComa(T[k + 1]) || luego)) {
      const a = inicioDeParte(k);
      let conDato = false;
      for (let q = a; q < k; q++) if (T[q].w === 'mas' || x.ent[q]?.datos.some(dd => ['tamano', 'sector', 'zona'].includes(dd.que))) conDato = true;
      if (conDato && a < k) {
        for (let q = a; q < k; q++) {
          const sc = datoDe(x, q, 'sector');
          if (sc && !sc.general) { x.sectoresPrioridad.push(sc.clave); if (luego) x.sectoresPrioridadDirectos.push(sc.clave); }
        }
        agregarPrioridad(x, a, k);
        marcar(x, a, luego || k + 1);
      }
    }
  }
}

// Otra persona («mi hermano», «mi socio», «mi esposa», «mi competencia») que vende, trabaja o vive en algún sitio. Devuelve dónde termina, o 0.
const TERCEROS = new Set([...FAMILIA, 'socio', 'socia', 'socios', 'socias', 'vecino', 'vecina', 'vecinos', 'compadre', 'comadre', 'jefe', 'jefa', 'competencia',
  'competidor', 'competidores', 'companero', 'companera', 'partner', 'neighbor', 'boss', 'competition', 'competitor', 'competitors']);
const VERBOS_DE_TERCEROS = new Set(['vende', 'venden', 'vendia', 'vendian', 'ofrece', 'ofrecen', 'distribuye', 'distribuyen', 'trabaja', 'trabajan', 'trabajaba',
  'vive', 'viven', 'vivia', 'estudia', 'estudian', 'sells', 'sell', 'offers', 'works', 'work', 'worked', 'lives', 'live', 'lived', 'studies']);
function otraPersonaEn(x, k) {
  const { T } = x;
  if (!POSESIVOS.has(T[k].w) || !TERCEROS.has(T[k + 1]?.w) || !VERBOS_DE_TERCEROS.has(T[k + 2]?.w)) return 0;
  if (['tu', 'tus', 'your'].includes(T[k].w)) return 0;
  let j = k + 3;
  while (j < x.n && !esFuerte(T[j]) && !esComa(T[j]) && !['pero', 'but', 'sino'].includes(T[j].w)) {
    if (['y', 'e', 'and'].includes(T[j].w) && (['yo', 'i', 'we', 'nosotros'].includes(T[j + 1]?.w) || empiezaInstruccion(x, j + 1))) break;
    j++;
  }
  // «…, yo no», «…, yo tampoco», «…, I don't»: él no vende eso.
  const q = esComa(T[j]) ? j + 1 : j;
  if (['yo', 'i', 'we', 'nosotros'].includes(T[q]?.w) && ['no', 'tampoco', 'dont', 'not'].includes(T[q + 1]?.w) && (esFuerte(T[q + 2]) || esComa(T[q + 2]))) j = q + 2;
  marcar(x, k, j);
  return j;
}

// Lo que dijo de su competencia: «…, son mi competencia» (la nombró antes), «Ferretería Ochoa es mi competencia», «mi competencia es
// Ferretería Ochoa», «mi competencia vende más barato». Con nombre, se excluye. Devuelve dónde termina, o 0 si pide buscarla.
const PREGUNTAS = new Set(['quien', 'quienes', 'cual', 'cuales', 'who', 'which', 'what', 'saber', 'dime', 'tell', 'conocer', 'averiguar', 'encuentra', 'busca',
  'buscar', 'find', 'search', 'investiga', 'analiza', 'research']);
function competenciaNombrada(x, k, fin, a) {
  const { T } = x;
  for (let q = a; q < k; q++) if (PREGUNTAS.has(T[q].w)) return 0;
  const previo = T[k - 1]?.w;
  const copula = w => ['es', 'son', 'is', 'are', 'era', 'eran'].includes(w);
  // «X es mi competencia», «X me hace competencia», «…, son mi competencia».
  if ((copula(previo) && k - 1 >= a) || (/hace/.test(texto(x, k, fin)) && k > a)) {
    const e = copula(previo) ? k - 1 : k;
    if (e > a && !hayNombre(x, a, e)) return 0;
    if (e > a) nombresQueExcluir(x, a, e, false);
    const b = finDeRazon(x, fin);
    marcar(x, a, b);
    x.competidoresNombrados = true;
    return b;
  }
  if (k !== a || !T[fin] || T[fin].tipo !== 'p') return 0;
  // «mi competencia es Ferretería Ochoa (y no quiero que la busques)».
  if (copula(T[fin].w)) {
    const q = fin + 1;
    if (q >= x.n) { marcar(x, k, q); return q; }
    // «mi competencia es fuerte»: solo cuenta algo (no es un nombre ni pide nada).
    if (!x.mayus && !hayNombrePropio(x, q, q + 1) && !ARTICULOS.has(T[q]?.w) && !datoDe(x, q, 'sector')) {
      const b = finDeRazon(x, q);
      marcar(x, k, b);
      return b;
    }
    const b = finDeNombres(x, q);
    if (b <= q) return 0;
    nombresQueExcluir(x, fin + 1, b, false);
    marcar(x, k, b);
    x.competidoresNombrados = true;
    return b;
  }
  // «mi competencia vende más barato», «la competencia está fuerte»: solo cuenta algo.
  if (detectar(x, fin)?.tipo === 'excluir') return 0;
  const b = finDeRazon(x, fin);
  marcar(x, k, b);
  return b;
}

// ¿Hay un nombre entre «a» y «b»? Una palabra que no es común ni conocida («aloft», «garcia», «Hodelpa»), o un nombre propio.
// «los colmados de por aquí», «las que», «those» no son nombres.
function hayNombre(x, a, b) {
  const { T } = x;
  if (hayNombrePropio(x, a, b)) return true;
  for (let q = a; q < Math.min(b, x.n); q++) {
    if (x.ent[q]) { q = x.ent[q].fin - 1; continue; }
    const t = T[q];
    // «mis vecinos», «my friends»: lo que va después de un posesivo es una palabra común, no un nombre.
    if (POSESIVOS.has(T[q - 1]?.w)) continue;
    if (t.tipo === 'p' && !esRelleno(t.w) && !ELIPTICOS.has(t.w) && !['ones', 'one', 'those', 'these', 'aquellos', 'aquellas'].includes(t.w) && !detectar(x, q)) return true;
  }
  return false;
}

// Desde «k», una lista de nombres («el hotel aloft y el hodelpa», «Bravo and La Sirena»). Devuelve dónde termina.
function finDeNombres(x, k) {
  const { T } = x;
  let j = k;
  let fin = k;
  for (let vueltas = 0; vueltas < 8 && j < x.n; vueltas++) {
    let b = j;
    while (b < x.n && !esFuerte(T[b]) && !esComa(T[b]) && !SEPARADORES.has(T[b].w) && !['so', 'pero', 'but', 'que', 'that', 'who'].includes(T[b].w) && b - j < 6) b++;
    if (b === j || !hayNombre(x, j, b)) break;
    for (let q = j; q < b; q++) if (detectar(x, q) && !x.ent[q]) return fin;
    fin = b;
    if (!(esComa(T[b]) || SEPARADORES.has(T[b]?.w))) break;
    j = b + 1;
  }
  return fin;
}

// Los nombres entre «a» y «b», separados por comas o «y», van a «Excluir». Con «clientes», se avisa que ya son sus clientes.
function nombresQueExcluir(x, a, b, clientes) {
  const { T } = x;
  let inicio = a;
  for (let k = a; k <= b; k++) {
    if (k === b || esComa(T[k]) || SEPARADORES.has(T[k].w)) {
      if (k > inicio && hayNombre(x, inicio, k)) {
        if (clientes) clienteActual(x, texto(x, inicio, k));
        else if (x.exclusiones.length < TOPE) x.exclusiones.push(sinArticulo(x, texto(x, inicio, k)));
      }
      inicio = k + 1;
    }
  }
}

// «menos el aloft que ya es cliente mío», «excepto las que ya me compran», «el hotel aloft ya es cliente», «ya son clientes míos
// el hotel aloft y el hodelpa», «Bravo and La Sirena are already my customers». Devuelve dónde termina.
const CORTE_DE_CLIENTE = new Set(['menos', 'excepto', 'salvo', 'except', 'skip', 'sin', 'without', 'ni', 'nor', 'busques', 'incluyas', 'incluir', 'buscar',
  'besides', 'excluding', 'exclude', 'no', 'not']);
function clientesYa(x, k, ya, a) {
  const { T } = x;
  let fin = finDeRazon(x, ya.fin);
  // «… ni los chiquitos»: lo que sigue a «ni» es otra exclusión.
  for (let q = ya.fin; q < fin; q++) if (['ni', 'nor'].includes(T[q].w)) { fin = q; break; }
  let q = k - 1;
  while (q > a && ['ya', 'already', 'are', 'is', 'son', 'es', 'estan', 'were'].includes(T[q].w)) q--;
  if (q >= a && ['que', 'who', 'that', 'which'].includes(T[q].w)) {
    // Lo que va antes del «que» es de quién se habla.
    let s = q;
    while (s > a && s > q - 7 && !CORTE_DE_CLIENTE.has(T[s - 1].w)) s--;
    let desde = s;
    if (s > a && CORTE_DE_CLIENTE.has(T[s - 1].w)) {
      desde = s - 1;
      while (desde > a && (CORTE_DE_CLIENTE.has(T[desde - 1].w) || ['no', 'me', 'dont', 'do', 'not', 'pero', 'but', 'y', 'and'].includes(T[desde - 1].w))) desde--;
    }
    if (hayNombre(x, s, q)) nombresQueExcluir(x, s, q, true);
    else x.supuestos.add('clientes_sin_nombre');
    marcar(x, desde, fin);
    return fin;
  }
  // Antes: «el hotel aloft ya es cliente», «Bravo and La Sirena are already my customers» (la lista puede empezar antes de la «y»).
  let s = a;
  while (s > 1 && ['y', 'and', 'e'].includes(T[s - 1].w)) {
    let p = s - 1;
    while (p > 0 && !esFuerte(T[p - 1]) && !esComa(T[p - 1]) && !SEPARADORES.has(T[p - 1].w)) p--;
    if (s - 1 - p > 4 || !hayNombre(x, p, s - 1) || lugarEn(x, p, true)?.que === 'zona') break;
    let conDisparador = false;
    for (let r = p; r < s - 1; r++) if (detectar(x, r) && !x.ent[r]) conDisparador = true;
    if (conDisparador) break;
    s = p;
  }
  let inicio = s;
  while (inicio < k && ['ya', 'y', 'pero', 'also', 'tambien', 'and', 'but'].includes(T[inicio].w)) inicio++;
  let e = k;
  while (e > inicio && ['ya', 'already', 'tambien', 'also', 'are', 'is', 'son', 'es'].includes(T[e - 1].w)) e--;
  if (e > inicio && hayNombre(x, inicio, e)) nombresQueExcluir(x, inicio, e, true);
  else if (e <= inicio) {
    // Después: «ya son clientes míos el hotel aloft y el hodelpa».
    const b = finDeNombres(x, ya.fin);
    if (b > ya.fin) { nombresQueExcluir(x, ya.fin, b, true); fin = Math.max(fin, b); }
  }
  marcar(x, s, fin);
  return fin;
}

// «Los Bravo»: el artículo con mayúscula es parte del nombre; «la Bonanza», «al taller garcía»: el artículo no.
function sinArticulo(x, valor) {
  const articulo = x.mayus ? /^(\s*(a|al|la|el|los|las|to|the)\s+)+/i : /^(\s*(a|al|la|el|los|las|to|the)\s+)+/;
  return String(valor).replace(articulo, '').replace(/\s+/g, ' ').trim();
}

// ¿Empieza en «k» una excepción al salario mínimo («acepto menos», «o menos si…», «or less if…»)?
function excepcionDelSalario(x, k) {
  const { T } = x;
  const w = T[k].w;
  // «no acepto menos de 20 mil» es el mínimo, no una excepción.
  if (['acepto', 'aceptaria', 'aceptamos', 'accept', 'aceptar'].includes(w) && !NEGACIONES.has(T[k - 1]?.w) && !['dont', 'wont'].includes(T[k - 1]?.w)) {
    const q = ['algo', 'un'].includes(T[k + 1]?.w) ? (T[k + 1].w === 'un' && T[k + 2]?.w === 'poco' ? k + 3 : k + 2) : k + 1;
    return ['menos', 'less'].includes(T[q]?.w) && !['de', 'del', 'que', 'than'].includes(T[q + 1]?.w) && T[q + 1]?.tipo !== 'n';
  }
  return ['o', 'or'].includes(w) && ['menos', 'less'].includes(T[k + 1]?.w) && ['si', 'if', 'cuando', 'when'].includes(T[k + 2]?.w);
}

// Un cliente que ya tiene: va en «Excluir» (no se busca como cliente nuevo) y se avisa.
function clienteActual(x, valor) {
  const limpio = sinArticulo(x, valor);
  if (limpio && x.exclusiones.length < TOPE) x.exclusiones.push(limpio);
  x.clientesActuales = true;
  x.supuestos.add('clientes_actuales');
}

// «ya tengo a la Bonanza y a Supermercado Nacional como clientes»: los nombres entre «tengo a» y «como clientes».
// Devuelve dónde termina, o 0 si no es eso.
function clientesQueYaTiene(x, a, desde) {
  const { T } = x;
  let q = desde;
  let como = null;
  while (q < x.n && q - desde < 16 && !esFuerte(T[q])) {
    como = buscarEn(T, q, COMO_CLIENTES);
    if (como) break;
    q++;
  }
  if (!como || q === desde) return 0;
  let inicio = desde;
  for (let k = desde; k <= q; k++) {
    if (k === q || esComa(T[k]) || SEPARADORES.has(T[k].w)) {
      if (k > inicio) clienteActual(x, texto(x, inicio, k));
      inicio = k + 1;
    }
  }
  marcar(x, a, como.fin);
  return como.fin;
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
