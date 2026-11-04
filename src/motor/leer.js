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
  FUENTES_CON_NOMBRE, CARDINALES, DIFUSOS,
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
  ...ZONAS.flatMap(z => z.palabras.map(frase => ({ frase, dato: { que: 'zona', clave: z.clave, tipo: z.tipo, ambigua: (z.ambiguas || []).includes(frase),
    homonimo: Boolean(z.homonimo), cardinal: z.tipo === 'region' && CARDINALES.includes(frase) } }))),
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
  'i dont have any experience', 'no tengo experiencia previa', 'no tengo mucha experiencia']);
const OBJETIVOS = crearIndice(OBJETIVOS_NO_DISPONIBLES.flatMap(o => o.palabras.map(frase => ({ frase, dato: { clave: o.clave } }))));
const SOLO = indice(SOLO_INVESTIGAR);
const CICLO = indice(['ciclo completo', 'el ciclo completo', 'todo el ciclo', 'full cycle', 'the full cycle', 'hazlo todo', 'haz todo']);
const NADIE = indice(['sin enviar nada', 'no envies nada', 'no mandes nada', 'sin mandar nada', 'no contactes a nadie', 'sin contactar a nadie',
  'no contactar a nadie', 'no le escribas a nadie', 'no llames a nadie', 'dont send anything', 'do not send anything', 'dont contact anyone',
  'do not contact anyone', 'dont contact anybody', 'sin escribirle a nadie', 'sin escribirles a nadie', 'sin llamar a nadie', 'sin hablarle a nadie',
  'sin mandarle nada a nadie', 'no le mandes nada a nadie', 'no le escribas a ninguno', 'without contacting anyone', 'no me mandes nada', 'no me envies nada',
  'no le mandes nada', 'no les mandes nada', 'no les envies nada']);
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
    'no vendo a', 'no le vendo a', 'no les vendo a', 'no vendemos a', 'no le vendemos a', 'no les vendemos a', 'dont sell to', 'do not sell to',
    'i dont sell to', 'we dont sell to', 'i do not sell to', 'we do not sell to', 'dont want to work with', 'do not want to work with',
    'dont want to work at', 'dont want to work in', 'dont want to work for', 'do not want to work at', 'i dont want to work', 'no quiero trabajar',
    'no quiero trabajar con', 'no quiero trabajar en', 'no quiero nada con'].map(frase => ({ frase, dato: { frase } })),
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
  'i am more interested in']);
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
    'trabajando como', 'chamba de', 'chambita de', 'pega de', 'camello de', 'trabajito de', 'empleito de', 'jobs for', 'job for']],
  [{ desnudo: true }, ['empleo', 'empleos', 'trabajo', 'puesto', 'cargo', 'job', 'position', 'chamba', 'chambita', 'pega', 'camello', 'trabajito', 'empleito']],
]);
const PRODUCTO = indice(['vendo', 'vende', 'vendemos', 'venden', 'ofrezco', 'ofrecemos', 'ofrece', 'ofrecen', 'brindo', 'brindamos', 'distribuyo',
  'distribuimos', 'instalo', 'instalamos', 'fabrico', 'fabricamos', 'doy servicio de', 'doy servicios de', 'damos servicio de', 'damos servicios de',
  'quiero vender', 'queremos vender', 'quiero venderle', 'quiero venderles', 'queremos venderle', 'queremos venderles', 'venderle', 'venderles',
  'needing', 'that needs', 'who needs', 'in need of', 'que requieran', 'que requieren', 'que necesiten', 'que necesitan', 'que puedan necesitar',
  'puedan necesitar', 'que podrian necesitar', 'que quieran comprar', 'i sell', 'we sell', 'sell', 'sells', 'selling', 'i offer', 'we offer', 'offer', 'offers', 'that need', 'that may need',
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
  'no me conviene', 'no me convienen', 'tampoco me interesa', 'tampoco me interesan', 'no gracias', 'ni hablar', 'not', 'no thanks', 'nope']);
// «hoteles sí, restaurantes no»: el «sí» de después solo confirma.
const SI_DESPUES = indice(['si', 'yes', 'si me interesa', 'si me interesan', 'claro que si']);
// «porque esos no compran»: la razón explica, no cambia lo que se busca.
const PORQUE = indice(['porque', 'because', 'ya que', 'debido a que', 'pues ya']);
// Dónde está la persona o su negocio: no es dónde se busca («Vivo en Moca», «I'm based in Santo Domingo», «desde Santiago»).
const ORIGEN = indice(['estoy en', 'estamos en', 'vivo en', 'vivimos en', 'soy de', 'somos de', 'naci en', 'nacimos en', 'vengo de', 'i live in',
  'we live in', 'im from', 'i am from', 'were from', 'we are from', 'im based in', 'i am based in', 'were based in', 'we are based in',
  'im located in', 'i am located in', 'were located in', 'we are located in', 'desde']);
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
  'already my customers', 'already my clients']);
// Lo que la persona compra (no vende): «le compro a fincas», «quiero comprar paneles».
const COMPRA = indice(['le compro a', 'les compro a', 'compro', 'compramos', 'le compramos a', 'quiero comprar', 'queremos comprar', 'necesito comprar',
  'busco comprar', 'busco quien me venda', 'busco quien me vendan', 'quien me venda', 'quien me vendan', 'que acepte mi', 'que acepten mi',
  'i want to buy', 'we want to buy', 'looking to buy', 'i need to buy', 'i buy', 'we buy', 'donde comprar', 'where to buy']);
const TELEFONO_PREVIO = indice(['tel', 'telefono', 'cel', 'celular', 'whatsapp', 'llamar al', 'llamame al', 'phone', 'call me at']);
const FRASES_RELLENO = indice(['que ofrecer', 'que ofrecerles', 'que ofrecerle', 'que venderles', 'que venderle', 'what to offer', 'tu mismo', 'tu misma',
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
  yes tardes noches hermano hermana mano manito ta espero cuento sitios sitio lugares ayudes ayude ayuden ademas`
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
  while (b > a && (x.T[b - 1].tipo === 's' || ['y', 'e', 'de', 'and', 'o', 'que', 'con', 'en', 'tambien', 'also', 'too'].includes(x.T[b - 1].w))) b--;
  if (b <= a) return;
  let valor = texto(x, a, b).replace(/\s+/g, ' ').trim();
  if (valor.length > 160) valor = valor.slice(0, 160).replace(/\s+\S*$/, '');
  if (!valor || x.prioridades.length >= 30) return;
  if (!x.prioridades.some(p => comparable(p) === comparable(valor))) x.prioridades.push(valor);
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
    if (d.que === 'extranjero' && !callePrevia && !conArticulo && anterior !== 'con') return { que: 'extranjero', fin: m.fin };
    if (d.que === 'difuso' && !callePrevia) return { que: 'difuso', sugerencias: d.sugerencias, fin: m.fin };
  }
  const calle = m.datos.find(d => d.que === 'calle');
  if (calle) return { que: 'calle', provincia: calle.provincia, fin: m.fin, comoCalle: callePrevia || conArticulo, explicita: callePrevia };
  return null;
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
  const villa = t.w === 'villa' && conMayuscula(i) && conMayuscula(i + 1) && !lugarEn(x, i + 1, true);
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
    if (s.tipo === 'p' && !x.ent[fin] && !detectar(x, fin) && (s.mayus || (['de', 'del', 'la', 'los', 'las'].includes(s.w) && T[fin + 1]?.mayus && !x.ent[fin + 1]))) fin++;
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
  let anterior = null;
  let zonasAntesDelUltimo = x.zonas.length;
  let libresAntesDelUltimo = x.zonasLibres.length;
  const destinoDe = () => (destino === 'excluir' ? x.zonasExcluidas : destino === 'propia' ? x.zonasPropias : x.zonas);
  for (let vueltas = 0; vueltas < 25; vueltas++) {
    const L = lugarEn(x, j, enLista);
    zonasAntesDelUltimo = x.zonas.length;
    libresAntesDelUltimo = x.zonasLibres.length;
    // «la capital de Santiago» es la ciudad de Santiago, no Santo Domingo.
    if (L && L.clave === 'gran-santo-domingo' && T[j].w === 'la' && ['de', 'del'].includes(T[L.fin]?.w) && lugarEn(x, L.fin + 1, true)?.que === 'zona') {
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
      } else if (L.que === 'zona' && L.homonimo && destino === 'incluir') {
        // «Los Ríos», «La Ciénaga», «Bella Vista»: hay más de un lugar con ese nombre. Si no va con su provincia, se pregunta.
        const z = ZONA_POR_CLAVE.get(L.clave);
        const siguiente = esComa(T[fin]) || ['de', 'del'].includes(T[fin]?.w) ? lugarEn(x, fin + 1, true) : null;
        const conSuProvincia = siguiente && siguiente.que === 'zona' && [z.provincia, z.municipio].includes(siguiente.clave);
        if (!conSuProvincia) agregarDuda(x, 'lugar_homonimo', texto(x, j, fin));
      }
      marcar(x, j, fin);
      j = fin;
      alguno = alguno || L.que !== 'calle';
      anterior = L.que === 'zona' ? L : anterior;
    } else {
      const fin = enLista || PREP_LUGAR_FUERTE.has(T[j - 1]?.w) || BARRIO_PREVIO.has(T[j].w) ? pareceLugar(x, j) : 0;
      if (!fin) break;
      const valor = texto(x, j, fin);
      if (destino === 'excluir') { if (x.exclusiones.length < 30) x.exclusiones.push(valor); }
      else if (destino === 'incluir' && x.zonasLibres.length < 30) {
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
  if (destino === 'incluir') {
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
  const cap = capacidadEn(x, j);
  if (cap) return cap;
  const frec = frecuenciaEn(x, j);
  if (frec) return frec;
  if (x.tipo === 'laboral') {
    const actual = trabajoActual(x, j);
    if (actual) return actual;
  }
  const salario = salarioEn(T, j);
  if (salario) return { tipo: 'salario', fin: salario.fin, tramo: salario };
  m = buscarEn(T, j, CANTIDAD);
  if (m && T[m.fin]?.tipo === 'n' && T[m.fin + 1]?.tipo === 'p' && UNIDADES.has(T[m.fin + 1].w)) return { tipo: 'condicion', fin: m.fin, clave: 'cantidad' };
  // «de lunes a viernes»: un horario.
  if (['de', 'from', 'los'].includes(t.w) && DIAS.has(T[j + 1]?.w) && ['a', 'al', 'to', 'hasta', 'y'].includes(T[j + 2]?.w) && DIAS.has(T[j + 3]?.w)) {
    return { tipo: 'horario', fin: j + 4 };
  }
  // «No vendo paneles», «no páginas web», «not generators»: lo negado no es lo que se vende.
  m = buscarEn(T, j, NEG_PRODUCTO);
  if (m && !['a', 'al', 'to', 'nada'].includes(T[m.fin]?.w)) return { tipo: 'negproducto', fin: m.fin };
  if (['no', 'not', 'ni', 'nor'].includes(t.w) && datoDe(x, j + 1, 'producto') && !datoDe(x, j + 1, 'sector')) return { tipo: 'negproducto', fin: j + 1 };
  m = buscarEn(T, j, NO_TENGO);
  if (m && x.tipo === 'comercial' && T[m.fin] && T[m.fin].tipo !== 's') return { tipo: 'notengo', fin: m.fin };
  m = buscarEn(T, j, ORIGEN);
  if (m && origenValido(x, j, m)) return { tipo: 'origen', fin: m.fin };
  m = buscarEn(T, j, EXCLUIR);
  if (m && exclusionValida(x, j, m)) {
    return { tipo: 'excluir', fin: m.fin, frase: m.datos[0].frase, generico: Boolean(m.datos[0].generico), condicional: Boolean(m.datos[0].condicional) };
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
  if (m && negocioPropioEn(x, m.fin, m.datos[0].frase)) return { tipo: 'propio', fin: m.fin, frase: m.datos[0].frase };
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

const VENDEN_ELLOS = new Set(['venden', 'vende', 'sell', 'sells', 'ofrecen', 'ofrece', 'offer', 'offers', 'selling']);
const NEGACIONES = new Set(['no', 'not', 'dont', 'nunca', 'never', 'ni', 'jamas']);

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
const SOLO_CON_DATO = new Set(['ningun', 'ninguna', 'ningunos', 'ningunas', 'nada en', 'skip', 'skip the', 'besides', 'forget', 'olvida', 'olvidate']);

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

const NO_ES_EXCLUSION = new Set(['se', 'importa', 'necesariamente', 'tan', 'hay', 'tengo', 'tiene', 'solo', 'only', 'just', 'solamente', 'es', 'era', 'fue',
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

// ---------- Capacidades ----------
function capacidadEn(x, j) {
  const { T } = x;
  const n = buscarEn(T, j, NEG_CAP);
  if (n) {
    const r = capacidadesDespues(x, n.fin);
    if (r) return { tipo: 'cap', neg: true, fin: r.fin, claves: r.claves, enviar: r.enviar };
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
    return { tipo: 'cap', neg: false, fin: v.fin, claves: [v.datos[0].clave], enviar: false };
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
  if (v) return { fin: v.fin, claves: [v.datos[0].clave], enviar: false };
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
  let k = j;
  let neg = false;
  if (T[k].w === 'no' || T[k].w === 'not') { neg = true; k++; } else if ((T[k].w === 'pero' || T[k].w === 'y') && T[k + 1]?.w === 'no') { neg = true; k += 2; }
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
  // «clínicas y oficinas…, pero las oficinas solo si son grandes»: un tamaño solo para una parte no se puede buscar así. Se pregunta.
  const claves = new Set(sectores.map(sc => sc.dato.clave));
  if (x.tipo === 'comercial' && tamanos.length && claves.size && [...claves].every(c => x.sectores.includes(c)) && new Set(x.sectores).size > claves.size) {
    agregarDuda(x, 'combinacion_parcial', texto(x, a, b));
    return true;
  }
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
    if (j > a && detectar(x, j) && !['verbo'].includes(detectar(x, j).tipo)) break;
    if (j > a && detectar(x, j)?.tipo === 'verbo') break;
    if (t.w === 'mas' && T[j + 1]?.w === 'o' && T[j + 2]?.w === 'menos') { j += 3; continue; }
    if (SEPARADORES.has(t.w) && T[j - 1]?.tipo === 'n' && T[j + 1]?.tipo === 'n') { j++; continue; }
    if (esComa(t) || SEPARADORES.has(t.w)) {
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
    if (analizarNegocio(x, ia, ib, { libre })) {
      marcar(x, ia, ib);
      for (let q = ia; q < ib; q++) x.rolObjetivo[q] = 1;
      usadoAlguno = true;
    }
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
  if (d?.generico && j === k && ['en', 'a', 'al', 'de', 'in', 'to', 'para', 'at'].includes(T[j]?.w)) return -1;
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
      break;
    }
    if (SEPARADORES.has(t.w)) {
      if (T[j + 1]?.w === 'no' || detectar(x, j + 1)?.tipo === 'cap' || empiezaOtraParte(x, j + 1)) break;
      items.push([a, j]);
      a = j + 1;
      j++;
      continue;
    }
    if (j > a && ['en', 'in'].includes(t.w)) {
      const L = lugarEn(x, j + 1 + (['la', 'el'].includes(T[j + 1]?.w) && !x.ent[j + 1] ? 1 : 0), true);
      const soloPreparacion = Array.from({ length: j - a }, (_, q) => T[a + q].w).every(w => RECORTE_EXCLUSION.has(w) || PREPOSICIONES_DE_EXCLUSION.has(w)
        || ELIPTICOS.has(w) || ['que', 'that', 'who', 'which', 'ones', 'one', 'located', 'based', 'are', 'is'].includes(w));
      // «but no clinics in Moca»: un lugar que no está en «Dónde» va con lo que se excluye.
      const conNegocio = Array.from({ length: j - a }, (_, q) => x.ent[a + q]).some(e => e?.datos.some(dd => dd.que === 'sector' && !dd.general));
      const acotado = conNegocio && L && L.que === 'zona' && x.zonas.length && !x.zonas.includes(L.clave);
      if (L && L.que === 'zona' && !soloPreparacion && !acotado && !(ELIPTICOS.has(T[a]?.w) && ['que', 'de'].includes(T[a + 1]?.w))) break;
    }
    const otro = j > a ? detectar(x, j) : null;
    const dentro = otro && ((otro.tipo === 'condicion' && (ELIPTICOS.has(T[j - 1]?.w) || otro.corta || otro.clave === 'laboral' || conQue))
      || otro.tipo === 'lugar' || (otro.tipo === 'sin' && j === a));
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
    if (PREPOSICIONES_DE_EXCLUSION.has(w) && !x.ent[s] && s + 1 < b && (x.ent[s + 1] || (ELIPTICOS.has(T[s + 1].w) && x.ent[s + 2]) || ELIPTICOS.has(T[s + 1].w))) { s++; continue; }
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
      // «sobre todo en el este»: una parte del lugar como preferencia, no la región entera.
      if (L && (L.que === 'zona' || L.que === 'pais') && t.w !== 'de' && !(j === desde && L.cardinal)) break;
      // «los que más me interesan son los de Bávaro»: «los de…» es la preferencia.
      if (L && L.que === 'zona' && t.w === 'de' && x.tipo === 'comercial' && !x.ent[j - 1] && !ELIPTICOS.has(T[j - 1]?.w)) break;
    }
    if (['y', 'and'].includes(t.w) && (capacidadEn(x, j + 1) || frecuenciaEn(x, j + 1) || detectar(x, j + 1)?.tipo === 'verbo'
      || ['si', 'ademas', 'also'].includes(T[j + 1]?.w) || VERBOS_REVISAR.has(T[j + 1]?.w))) break;
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
  // «bilingüe», «remoto», «medio tiempo»: la condición es esa palabra sola. «de noche no»: con la negación después, se excluye.
  if (d.corta) {
    const neg = negacionDespues(x, d.fin);
    if (neg) { if (x.exclusiones.length < 30) x.exclusiones.push(texto(x, inicio, d.fin)); marcar(x, inicio, neg); return neg; }
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
  if (limpio && x.prioridades.length < 30 && !x.prioridades.some(p => comparable(p) === comparable(limpio))) x.prioridades.push(limpio);
}

// «cashier job», «nursing jobs», «security guard job»: el empleo va antes de «job».
function puestoAntesDeJob(x, j) {
  const { T } = x;
  const anterior = T[j - 1];
  if (anterior && !esFuerte(anterior) && !esComa(anterior) && !['a', 'an', 'for', 'some', 'me', 'looking', 'find', 'any'].includes(anterior.w)) return null;
  for (let k = j + 1; k <= j + 2 && k < x.n; k++) {
    if (!['job', 'jobs'].includes(T[k].w)) continue;
    for (let q = j; q < k; q++) if (T[q].tipo !== 'p' || esRelleno(T[q].w) || lugarEn(x, q, true)) return null;
    return { tipo: 'puesto', fin: k + 1, ini: j, finValor: k };
  }
  return null;
}

function spanPuesto(x, i, d) {
  const { T } = x;
  if (d.ini != null) {
    marcar(x, i, d.fin);
    if (!x.puesto) x.puesto = texto(x, d.ini, d.finValor).slice(0, 120);
    return d.fin;
  }
  let s = d.fin;
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
  marcar(x, i, Math.max(fin, d.fin));
  if (!soloRelleno && !x.puesto) x.puesto = valor.slice(0, 120);
  else if (!soloRelleno && x.puesto && comparable(x.puesto) !== comp) agregarPrioridad(x, s, finValor);
  return Math.max(fin, d.fin);
}

// ---------- Producto (lo que se vende) ----------
const PRODUCTO_RELLENO = new Set(['cosas', 'cosa', 'algo', 'productos', 'producto', 'servicios', 'servicio', 'mis servicios', 'mis productos', 'nuestros servicios',
  'nuestros productos', 'lo que vendo', 'lo que ofrezco', 'lo que tengo', 'de todo', 'stuff', 'things', 'products', 'services', 'my services', 'my products',
  'our services', 'our products', 'eso', 'esto', 'lo mio', 'mi producto', 'mi servicio', 'mis cosas', 'los', 'las', 'lo', 'them', 'it', 'mas', 'mucho',
  'mucho mas', 'bastante', 'more', 'a lot', 'mas cosas']);
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
const DISPARADORES_EN_INGLES = new Set(['i sell', 'we sell', 'sell', 'sells', 'selling', 'i offer', 'we offer', 'offer', 'offers', 'that need', 'that may need',
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

// Lo que se vende, desde «d.fin». «destino»: 'productos' (lo que dijo que vende), 'propios' (lo que hace su negocio, por si no dice
// otra cosa) o 'ninguno' (lo que dijo que NO vende).
function spanProducto(x, i, d, destino = 'productos') {
  const { T } = x;
  let s = d.fin;
  const ingles = DISPARADORES_EN_INGLES.has(d.frase || '');
  const articulos = ingles ? ['a', 'an', 'the', 'some', 'new'] : ['un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'an', 'the', 'some', 'tambien'];
  while (s < x.n && articulos.includes(T[s].w)) s++;
  const sinProducto = () => { marcar(x, i, d.fin); x.ultimoProductoFin = d.fin; return d.fin; };
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
    // «customers for my cleaning company», «clients for my solar panels»: en inglés el posesivo no es parte de lo que se vende.
    else if (ingles) s++;
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
    const modo = buscarEn(T, j, MODO_DE_VENTA);
    if (modo && j > s) { palabras += modo.fin - j; j = modo.fin; continue; }
    if (['a', 'al', 'to'].includes(t.w)) break;
    if ((t.w === 'para' || t.w === 'for') && OCASIONES.has(T[j + 1]?.w) && j > s) { j++; palabras++; continue; }
    if (t.w === 'para' || t.w === 'for') {
      if (esInfinitivo(x, j + 1) || hayAMasAdelante(x, j + 1)) { j++; palabras++; continue; }
      break;
    }
    if (j > s && buscarEn(T, j, CANALES)) break;
    if (['en', 'in', 'de', 'del', 'desde', 'across', 'throughout', 'from'].includes(t.w)) {
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
    if (['que', 'that', 'which', 'who', 'sin', 'without', 'pero', 'but', 'cada', 'every', 'donde', 'where', 'cerca', 'no', 'not', 'ni', 'nunca', 'never',
      'busca', 'buscan', 'buscamos', 'find', 'looking'].includes(t.w)) break;
    if (SEPARADORES.has(t.w) && (detectar(x, j + 1) || T[j + 1]?.tipo === 's')) break;
    const L = j > s ? lugarEn(x, j, false) : null;
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
    while (fin > s && (['y', 'e', 'de', 'con', 'para', 'o', 'and', 'or', 'for', 'del', 'en', 'from', 'desde', 'of', 'with', 'by', 'por'].includes(T[fin - 1].w)
      || T[fin - 1].tipo === 's')) fin--;
  };
  recortar();
  const finLeido = fin;
  // «cleaning company»: la palabra «empresa» al final no es parte de lo que se vende.
  for (let k = s + 1; k < fin; k++) {
    if (x.ent[k] && x.ent[k].fin === fin && EMPRESA.has(T[k].w)) { fin = k; recortar(); break; }
  }
  const valor = texto(x, s, fin);
  marcar(x, i, Math.max(finLeido, d.fin));
  if (destino !== 'ninguno') x.ultimoProductoFin = j;
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
  if (['propio', 'propia', 'pequeno', 'pequena', 'nuevo', 'nueva', 'own'].includes(T[j]?.w)) j++;
  const e = x.ent[j];
  if (LUGARES_PROPIOS.has(T[j]?.w)) return { j, fin: e ? e.fin : j + 1, lugar: true };
  const sector = e?.datos.find(d => d.que === 'sector');
  if (sector) return { j, fin: e.fin, sector };
  if (NEGOCIOS_PROPIOS.has(T[j]?.w) && ['de', 'of'].includes(T[j + 1]?.w)) return { j, fin: j + 1, agencia: true };
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
    if (L && L.L.que === 'zona') { marcar(x, j, L.q); return listaDeLugares(x, L.q, 'propia'); }
  }
  return j;
}

function spanPropio(x, i, d) {
  const { T } = x;
  const n = negocioPropioEn(x, d.fin, d.frase);
  marcar(x, i, d.fin);
  if (!n) return d.fin;
  marcar(x, n.j, n.fin);
  let fin = n.fin;
  if (n.agencia || (n.sector?.general && ['de', 'of'].includes(T[n.fin]?.w))) {
    // «tengo una agencia de publicidad», «una empresa de transporte»: lo que va después de «de» es lo que hace su negocio.
    marcar(x, n.fin, n.fin + 1);
    fin = x.tipo === 'comercial' ? spanProducto(x, n.fin, { fin: n.fin + 1 }, 'propios') : n.fin + 1;
  } else if (n.de) {
    fin = x.tipo === 'comercial' ? spanProducto(x, n.j, { fin: n.j }, 'propios') : n.fin;
  } else if (n.producto) {
    if (x.tipo === 'comercial') x.productosPropios.push(texto(x, n.producto[0], n.producto[1]));
  } else if (n.sector && !n.sector.general) x.negocioPropio = texto(x, n.j, n.fin);
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
    case 'objetivo':
      return objetivoNoDisponible(x, i, d.fin, d.clave);
    case 'objetivoNegado': {
      // «I don't want to find investors»: lo que no quiere no se pregunta.
      let a = i;
      while (a > 0 && a > i - 4 && !esFuerte(T[a - 1]) && !esComa(T[a - 1])) a--;
      marcar(x, a, d.fin);
      return d.fin;
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
      return listaDeLugares(x, L.q, 'propia');
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
  'looking for', 'enfocate en', 'apunta a', 'llegar a', 'llegarle a', 'reach', 'target', 'targets', 'mis clientes son', 'mis clientes serian',
  'my customers are', 'my clients are']);

function objetivoDesde(x, i) {
  const { T } = x;
  const m = buscarEn(T, i, OBJETIVO_TRIG);
  if (!m) return i;
  if (x.tipo !== 'comercial') return i;
  let k = m.fin;
  while (k < x.n && ['los', 'las', 'unos', 'unas', 'el', 'la', 'me', 'nuevos', 'nuevas', 'clientes', 'cliente', 'the', 'some', 'new', 'mas', 'sitios', 'lugares',
    'tipo', 'como', 'more', 'places', 'like', 'otros', 'otras'].includes(T[k].w) && !x.ent[k]) k++;
  if (esComa(T[k]) && x.original[T[k].ini] === ':') k++;
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
  for (const [a, b] of x.senalesNegadas) marcar(x, a, b);
  antesDeRecorrer(x);
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
  // «paneles solares a hoteles y cámaras a farmacias»: cada producto con su negocio tampoco se puede guardar así.
  const pt = [];
  for (const g of x.secuencia) if ((g.t === 'P' || g.t === 'T') && pt[pt.length - 1]?.t !== g.t) pt.push(g);
  const productosConNegocio = new Set(pt.filter((g, k) => g.t === 'P' && pt[k + 1]?.t === 'T').map(g => g.valor));
  if (x.tipo === 'comercial' && productosConNegocio.size > 1) agregarDuda(x, 'combinacion_producto', '');
  return x;
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
    // Lo que todavía no hace (proveedores, empleados, publicar…): se dice antes de leer nada más de esa frase,
    // para que no quede, por ejemplo, «A quién buscar: clínicas» en «busco una clínica que acepte mi seguro».
    const objetivo = buscarEn(T, k, OBJETIVOS);
    if (objetivo && !negadoAntes(x, k)) { k = objetivoNoDisponible(x, k, objetivo.fin, objetivo.datos[0].clave) - 1; continue; }
    const compra = buscarEn(T, k, COMPRA);
    if (compra && !x.tieneVenta && detectar(x, k)?.tipo === 'compra') { k = objetivoNoDisponible(x, k, compra.fin, 'proveedores') - 1; continue; }
    // «los colmados de por aquí ya me compran»: ya son sus clientes; no son clientes nuevos que buscar.
    const ya = buscarEn(T, k, YA_CLIENTES);
    if (ya) { marcar(x, inicioDeParte(k), ya.fin); k = ya.fin - 1; continue; }
    // «los más grandes primero»: lo que va antes de «primero» es una preferencia, no un filtro.
    if (['primero', 'first'].includes(T[k].w) && (!T[k + 1] || esFuerte(T[k + 1]) || esComa(T[k + 1]))) {
      const a = inicioDeParte(k);
      let conDato = false;
      for (let q = a; q < k; q++) if (T[q].w === 'mas' || x.ent[q]?.datos.some(dd => ['tamano', 'sector', 'zona'].includes(dd.que))) conDato = true;
      if (conDato && a < k) {
        for (let q = a; q < k; q++) { const sc = datoDe(x, q, 'sector'); if (sc && !sc.general) x.sectoresPrioridad.push(sc.clave); }
        agregarPrioridad(x, a, k);
        marcar(x, a, k + 1);
      }
    }
  }
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
