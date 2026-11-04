// Diccionarios del motor propio: con ellos OPORTIA entiende las instrucciones sin ninguna IA.
// Cada palabra va escrita en minúsculas y sin acentos (así se compara). Los plurales se generan solos
// (hotel → hoteles, hotels; coffee shop → coffee shops); los que no siguen la regla se escriben aparte.
// Para añadir un sector, un producto o una zona basta con agregar una línea aquí (o en lugares.js).
import { PROVINCIAS, MUNICIPIOS, DISTRITOS, SECTORES_DE_CIUDAD, REGIONES, PAIS_EXPLICITO, PAIS_NOMBRE, EXTRANJEROS, CARDINALES, DIFUSOS } from './lugares.js';

export { PROVINCIAS, MUNICIPIOS, DISTRITOS, SECTORES_DE_CIUDAD, REGIONES, PAIS_EXPLICITO, PAIS_NOMBRE, EXTRANJEROS, CARDINALES, DIFUSOS };

// Todos los lugares de dentro de una provincia (municipios, distritos municipales y sectores conocidos).
export const CIUDADES = [...MUNICIPIOS.map(m => ({ ...m, tipo: 'municipio' })), ...DISTRITOS, ...SECTORES_DE_CIUDAD];

// Para compatibilidad con lo anterior: las frases que significan el país (las claras y el nombre).
export const PAIS_COMPLETO = [...PAIS_EXPLICITO, ...PAIS_NOMBRE];

// ---------- Sectores (a quién se busca) ----------
// «parciales»: palabras que son solo una parte del sector (los bares son parte de «Restaurantes, bares y cafés»).
// Si alguien excluye una parcial («no quiero bares»), se guarda tal cual y no se excluye el sector entero.
export const SECTORES = [
  { clave: 'hoteles', es: 'Hoteles', en: 'Hotels', palabras: ['hotel', 'hospedaje', 'resort', 'hostal', 'aparthotel', 'apart hotel', 'lodging', 'villa turistica', 'villa'], parciales: ['villa', 'hostal', 'aparthotel', 'apart hotel'] },
  { clave: 'clinicas', es: 'Clínicas y hospitales', en: 'Clinics and hospitals', palabras: ['clinica', 'centro medico', 'hospital', 'consultorio', 'policlinica', 'clinic', 'medical center', 'centro de salud'], parciales: ['consultorio', 'policlinica', 'centro de salud'] },
  { clave: 'odontologia', es: 'Consultorios dentales', en: 'Dental offices', palabras: ['clinica dental', 'consultorio dental', 'consultorio odontologico', 'odontologo', 'odontologia', 'dentista', 'dentist', 'dental clinic', 'dental office'] },
  { clave: 'laboratorios', es: 'Laboratorios', en: 'Laboratories', palabras: ['laboratorio', 'laboratorio clinico', 'laboratory', 'laboratories', 'lab'] },
  { clave: 'farmacias', es: 'Farmacias', en: 'Pharmacies', palabras: ['farmacia', 'pharmacy', 'pharmacies', 'drugstore'] },
  { clave: 'restaurantes', es: 'Restaurantes, bares y cafés', en: 'Restaurants, bars and cafés', palabras: ['restaurante', 'restaurant', 'bar', 'cafeteria', 'cafe', 'comedor', 'pizzeria', 'comida rapida', 'coffee shop', 'fast food', 'pica pollo', 'food truck'], parciales: ['bar', 'cafeteria', 'cafe', 'comedor', 'pizzeria', 'comida rapida', 'coffee shop', 'fast food', 'pica pollo', 'food truck'] },
  { clave: 'panaderias', es: 'Panaderías y reposterías', en: 'Bakeries', palabras: ['panaderia', 'reposteria', 'bakery', 'bakeries'] },
  { clave: 'supermercados', es: 'Supermercados', en: 'Supermarkets', palabras: ['supermercado', 'super mercado', 'hipermercado', 'supermarket', 'grocery store'] },
  { clave: 'colmados', es: 'Colmados', en: 'Corner stores (colmados)', palabras: ['colmado', 'colmadon', 'bodega', 'minimarket', 'mini market', 'corner store', 'convenience store'] },
  { clave: 'tiendas', es: 'Tiendas y comercios', en: 'Shops and retail', palabras: ['tienda', 'comercio', 'boutique', 'almacen', 'retail', 'store', 'shop', 'tienda de ropa'], parciales: ['boutique', 'almacen', 'tienda de ropa'] },
  { clave: 'ferreterias', es: 'Ferreterías', en: 'Hardware stores', palabras: ['ferreteria', 'hardware store'] },
  { clave: 'fabricas', es: 'Fábricas e industrias', en: 'Factories and industry', palabras: ['fabrica', 'industria', 'manufactura', 'manufacturera', 'planta industrial', 'factory', 'factories', 'manufacturing', 'industry', 'industries'] },
  { clave: 'zonas-francas', es: 'Zonas francas', en: 'Free trade zones', palabras: ['zona franca', 'zona franca industrial', 'parque de zona franca', 'free zone', 'free trade zone'] },
  { clave: 'constructoras', es: 'Constructoras', en: 'Construction companies', palabras: ['constructora', 'empresa de construccion', 'contratista', 'construction company', 'construction companies', 'contractor'] },
  { clave: 'inmobiliarias', es: 'Inmobiliarias', en: 'Real estate', palabras: ['inmobiliaria', 'bienes raices', 'real estate', 'realtor', 'agencia inmobiliaria'] },
  { clave: 'educacion', es: 'Colegios, escuelas y universidades', en: 'Schools and universities', palabras: ['colegio', 'escuela', 'universidad', 'instituto', 'academia', 'liceo', 'school', 'university', 'universities', 'academy', 'academies'], parciales: ['instituto', 'academia', 'liceo', 'academy', 'academies'] },
  { clave: 'finanzas', es: 'Bancos, financieras y cooperativas', en: 'Banks, lenders and credit unions', palabras: ['banco', 'financiera', 'cooperativa', 'asociacion de ahorros', 'bank', 'credit union', 'lender'], parciales: ['asociacion de ahorros'] },
  { clave: 'aseguradoras', es: 'Aseguradoras', en: 'Insurance companies', palabras: ['aseguradora', 'compania de seguros', 'insurance company', 'insurance companies'] },
  { clave: 'bancas', es: 'Bancas de lotería', en: 'Lottery shops (bancas)', palabras: ['banca de loteria', 'banca de apuestas', 'banca de apuesta', 'bancas de apuesta', 'banca', 'loteria', 'lottery shop'] },
  { clave: 'talleres', es: 'Talleres mecánicos', en: 'Auto repair shops', palabras: ['taller', 'taller mecanico', 'taller de mecanica', 'auto repair', 'repair shop', 'garage', 'body shop'] },
  { clave: 'concesionarios', es: 'Concesionarios de vehículos', en: 'Car dealerships', palabras: ['concesionario', 'dealer', 'car dealer', 'car dealership', 'dealer de carros'] },
  { clave: 'belleza', es: 'Salones de belleza, barberías y spas', en: 'Beauty salons, barbershops and spas', palabras: ['salon de belleza', 'peluqueria', 'barberia', 'spa', 'estetica', 'beauty salon', 'barbershop', 'barber shop', 'nail salon', 'salon de unas'], parciales: ['peluqueria', 'barberia', 'spa', 'estetica', 'barbershop', 'barber shop', 'nail salon', 'salon de unas'] },
  { clave: 'gimnasios', es: 'Gimnasios', en: 'Gyms', palabras: ['gimnasio', 'gym', 'fitness center'] },
  { clave: 'transporte', es: 'Transporte y logística', en: 'Transport and logistics', palabras: ['transporte', 'logistica', 'mensajeria', 'courier', 'transportista', 'flota', 'transport', 'logistics', 'shipping'], parciales: ['mensajeria', 'courier', 'flota'] },
  { clave: 'turismo', es: 'Turismo y agencias de viajes', en: 'Tourism and travel agencies', palabras: ['turismo', 'agencia de viajes', 'agencias de viajes', 'agencia de viaje', 'tour operador', 'turoperador', 'tourism', 'travel agency', 'travel agencies', 'tour operator'], parciales: ['tour operador', 'turoperador', 'tour operator'] },
  { clave: 'agricultura', es: 'Fincas y agricultura', en: 'Farms and agriculture', palabras: ['finca', 'agricola', 'agricultura', 'agropecuaria', 'ganaderia', 'granja', 'farm', 'agriculture'], parciales: ['ganaderia', 'granja'] },
  { clave: 'servicios-profesionales', es: 'Oficinas y servicios profesionales', en: 'Offices and professional services', palabras: ['oficina', 'despacho', 'abogado', 'bufete', 'firma de abogados', 'contador', 'firma contable', 'consultora', 'law firm', 'lawyer', 'accountant', 'office', 'consulting firm'], parciales: ['despacho', 'abogado', 'bufete', 'firma de abogados', 'contador', 'firma contable', 'consultora', 'law firm', 'lawyer', 'accountant', 'consulting firm'] },
  { clave: 'empresas-servicios', es: 'Empresas de servicios', en: 'Service companies', palabras: ['empresa de servicios', 'empresas de servicios', 'service company', 'service companies'] },
  { clave: 'call-centers', es: 'Call centers', en: 'Call centers', palabras: ['call center', 'centro de llamadas', 'contact center', 'centro de contacto'] },
  { clave: 'eventos', es: 'Eventos y salones de fiesta', en: 'Events and venues', palabras: ['salon de eventos', 'organizador de eventos', 'salon de fiestas', 'event venue', 'event planner', 'wedding planner'] },
  { clave: 'veterinarias', es: 'Veterinarias', en: 'Veterinary clinics', palabras: ['veterinaria', 'veterinario', 'veterinary', 'vet clinic'] },
  { clave: 'iglesias', es: 'Iglesias', en: 'Churches', palabras: ['iglesia', 'church', 'churches'] },
  { clave: 'ong', es: 'Fundaciones y ONG', en: 'Foundations and nonprofits', palabras: ['ong', 'fundacion', 'nonprofit', 'ngo', 'foundation'] },
  { clave: 'joyerias', es: 'Joyerías', en: 'Jewelry stores', palabras: ['joyeria', 'jewelry store', 'jeweler'] },
  { clave: 'lavaderos', es: 'Lavaderos de carros (car wash)', en: 'Car washes', palabras: ['car wash', 'carwash', 'lavadero', 'lavadero de carros', 'lavado de carros', 'autolavado', 'auto lavado'] },
  { clave: 'discotecas', es: 'Discotecas y centros nocturnos', en: 'Nightclubs', palabras: ['discoteca', 'discotec', 'club nocturno', 'centro nocturno', 'nightclub', 'night club'] },
  { clave: 'combustible', es: 'Estaciones de combustible', en: 'Gas stations', palabras: ['estacion de combustible', 'estacion de gasolina', 'gasolinera', 'bomba de gasolina', 'bomba de combustible', 'gas station'] },
  // «Empresas» o «negocios» sin decir cuáles: se usa solo si no se nombró ningún otro sector.
  { clave: 'todas', es: 'Todo tipo de empresas', en: 'All kinds of businesses', palabras: ['empresa', 'negocio', 'compania', 'establecimiento', 'local comercial', 'company', 'companies', 'business', 'businesses', 'todo tipo de negocio', 'todo tipo de negocios', 'todo tipo de empresas', 'cualquier negocio', 'cualquier empresa', 'todos los negocios', 'todas las empresas', 'any business', 'all businesses', 'any company'], general: true },
];

// ---------- Productos o servicios (lo que se vende) ----------
// La clave sirve para puntuar en la fase 2; lo que se muestra es lo que la persona escribió.
export const PRODUCTOS = [
  { clave: 'paneles-solares', es: 'paneles solares', en: 'solar panels', palabras: ['panel solar', 'paneles solares', 'energia solar', 'placa solar', 'placas solares', 'fotovoltaico', 'solar', 'solar panel', 'solar energy'] },
  { clave: 'plantas-electricas', es: 'plantas eléctricas e inversores', en: 'generators and inverters', palabras: ['planta electrica', 'plantas electricas', 'generador', 'generador electrico', 'inversor', 'inversor solar', 'bateria', 'generator', 'inverter'] },
  { clave: 'inventario', es: 'sistemas de inventario', en: 'inventory systems', palabras: ['inventario', 'sistema de inventario', 'sistemas de inventario', 'control de inventario', 'inventory', 'inventory system'] },
  { clave: 'reservas', es: 'sistemas de reservas', en: 'booking systems', palabras: ['reserva', 'reservacion', 'sistema de reservas', 'booking', 'reservation', 'booking system'] },
  { clave: 'citas', es: 'citas en línea', en: 'online appointments', palabras: ['citas en linea', 'sistema de citas', 'sistemas de citas', 'agenda en linea', 'agendamiento', 'appointment', 'online appointments', 'scheduling'] },
  { clave: 'facturacion', es: 'facturación y punto de venta', en: 'invoicing and point of sale', palabras: ['facturacion', 'facturacion electronica', 'factura electronica', 'punto de venta', 'caja registradora', 'invoicing', 'point of sale', 'e invoicing'] },
  { clave: 'contabilidad', es: 'contabilidad', en: 'accounting', palabras: ['contabilidad', 'sistema contable', 'servicios contables', 'software contable', 'accounting', 'bookkeeping'] },
  { clave: 'paginas-web', es: 'páginas web', en: 'websites', palabras: ['pagina web', 'paginas web', 'sitio web', 'sitios web', 'website', 'diseno web', 'desarrollo web', 'tienda en linea', 'tiendas en linea', 'ecommerce', 'e commerce', 'online store', 'web design'] },
  { clave: 'software', es: 'software', en: 'software', palabras: ['software', 'software empresarial', 'aplicacion', 'aplicaciones', 'app', 'programa informatico', 'erp', 'crm', 'application', 'business software'] },
  { clave: 'automatizacion', es: 'automatización y chatbots', en: 'automation and chatbots', palabras: ['automatizacion', 'chatbot', 'inteligencia artificial', 'whatsapp business', 'automation', 'artificial intelligence'] },
  { clave: 'marketing', es: 'marketing digital', en: 'digital marketing', palabras: ['marketing', 'marketing digital', 'publicidad', 'redes sociales', 'community manager', 'mercadeo', 'advertising', 'social media'] },
  { clave: 'seguridad', es: 'cámaras y seguridad', en: 'cameras and security', palabras: ['camara', 'camara de seguridad', 'camaras de seguridad', 'camara de vigilancia', 'cctv', 'videovigilancia', 'alarma', 'sistema de seguridad', 'seguridad electronica', 'security camera', 'alarm'] },
  { clave: 'redes', es: 'internet y redes', en: 'internet and networks', palabras: ['internet', 'cableado', 'cableado estructurado', 'wifi', 'fibra optica', 'networking'] },
  { clave: 'climatizacion', es: 'aire acondicionado', en: 'air conditioning', palabras: ['aire acondicionado', 'aires acondicionados', 'climatizacion', 'refrigeracion', 'air conditioning', 'hvac'] },
  { clave: 'limpieza', es: 'limpieza', en: 'cleaning', palabras: ['limpieza', 'servicio de limpieza', 'productos de limpieza', 'cleaning'] },
  { clave: 'seguros', es: 'seguros', en: 'insurance', palabras: ['seguro', 'seguros', 'seguro de vida', 'seguros de salud', 'poliza', 'insurance'] },
  { clave: 'agua', es: 'agua y filtros', en: 'water and filters', palabras: ['agua', 'agua purificada', 'botellon', 'filtro', 'filtro de agua', 'purificadora', 'water', 'water filter'] },
  { clave: 'uniformes', es: 'uniformes', en: 'uniforms', palabras: ['uniforme', 'uniform'] },
  { clave: 'capacitacion', es: 'capacitación', en: 'training', palabras: ['capacitacion', 'curso', 'entrenamiento', 'formacion', 'training'] },
  { clave: 'consultoria', es: 'consultoría', en: 'consulting', palabras: ['consultoria', 'asesoria', 'consulting'] },
];

// ---------- Tamaño de las empresas ----------
export const TAMANOS = [
  { clave: 'pequenas', es: 'Pequeñas', en: 'Small', palabras: ['pequena', 'pequeno', 'pequenita', 'chiquita', 'chiquito', 'pyme', 'mipyme', 'micro', 'microempresa', 'small'] },
  { clave: 'medianas', es: 'Medianas', en: 'Medium', palabras: ['mediana', 'mediano', 'medium', 'mid sized', 'midsize', 'medium sized'] },
  { clave: 'grandes', es: 'Grandes', en: 'Large', palabras: ['grande', 'grandisima', 'enorme', 'large', 'big'] },
];
// Palabras de tamaño que ya dicen «empresa» (una pyme es una empresa pequeña).
export const TAMANOS_QUE_SON_EMPRESA = ['pyme', 'mipyme', 'microempresa'];

// ---------- Cada cuánto trabaja el proyecto ----------
// Solo cuentan frases que dicen cada cuánto revisar: «cada semana», «todos los días», «revisa diario»…
// «adverbios» (diario, semanal…) solo cuentan junto a un verbo como «revisa» o «busca»: «pago mensual»,
// «12 horas diarias» o «Diario Libre» no dicen nada de la frecuencia.
export const FRECUENCIAS = [
  { clave: 'diaria', palabras: ['cada dia', 'todos los dias', 'diariamente', 'a diario', 'una vez al dia', 'una vez por dia', 'every day', 'each day', 'once a day'], adverbios: ['diario', 'diaria', 'daily'] },
  { clave: 'semanal', palabras: ['cada semana', 'todas las semanas', 'semanalmente', 'una vez por semana', 'una vez a la semana', 'una vez cada semana', 'every week', 'each week', 'once a week'], adverbios: ['semanal', 'weekly'] },
  { clave: 'mensual', palabras: ['cada mes', 'todos los meses', 'mensualmente', 'una vez al mes', 'una vez por mes', 'una vez cada mes', 'every month', 'each month', 'once a month'], adverbios: ['mensual', 'monthly'] },
  { clave: 'manual', palabras: ['cuando yo diga', 'cuando yo lo diga', 'cuando yo lo pida', 'cuando lo pida', 'cuando yo quiera', 'manualmente', 'when i ask', 'when i say', 'manually', 'on demand'], adverbios: [] },
];
export const FRECUENCIA_POR_DEFECTO = 'semanal';

// ---------- Nivel de autonomía de cada proyecto (decisión del dueño) ----------
// aprobar_salidas: todo lo que sale (correos, propuestas enviadas, contactos) espera su aprobación. Es el más seguro.
// frecuencia_aprobada: trabaja solo con la frecuencia aprobada y le avisa.
// solo_cuando_pida: solo trabaja cuando él lo pide (va siempre con la frecuencia «manual»).
// En TODOS los niveles, contactar a alguien necesita su «sí».
export const AUTONOMIAS = ['aprobar_salidas', 'frecuencia_aprobada', 'solo_cuando_pida'];
export const AUTONOMIA_POR_DEFECTO = 'aprobar_salidas';
// Frecuencias que la persona puede pedir pero que todavía no existen: se preguntan.
export const FRECUENCIAS_NO_DISPONIBLES = ['cada 15 dias', 'cada quince dias', 'cada dos semanas', 'cada 2 semanas', 'quincenalmente', 'cada quincena',
  'cada dos dias', 'cada 2 dias', 'cada tres dias', 'cada 3 dias', 'interdiario', 'cada hora', 'cada dos meses', 'cada 2 meses', 'cada tres meses',
  'cada 3 meses', 'cada ano', 'una vez al ano', 'anualmente', 'every two weeks', 'every 2 weeks', 'every other week', 'every other day', 'biweekly',
  'every hour', 'hourly', 'yearly', 'every year', 'cada rato', 'a cada rato', 'cada ratito', 'de vez en cuando', 'de cuando en cuando', 'every now and then',
  'from time to time', 'once in a while', 'twice a week', 'twice a day', 'twice a month'];
// «quincenal», «bisemanal»: palabras sueltas que piden una frecuencia que no existe. Solo cuentan si no hablan de dinero
// («quincenal 12 mil» es un salario por quincena).
export const FRECUENCIAS_NO_DISPONIBLES_SUELTAS = ['quincenal', 'quincenales', 'bisemanal', 'fortnightly'];
export const DIAS_DE_LA_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// Verbos que, junto a «diario», «semanal»…, sí hablan de cada cuánto revisar.
export const VERBOS_DE_REVISAR = ['revisa', 'revisar', 'revises', 'revisen', 'revisalo', 'revision', 'busca', 'buscar', 'busques', 'busquen', 'buscalos',
  'busqueda', 'corre', 'correr', 'ejecuta', 'ejecutar', 'actualiza', 'actualizar', 'hazlo', 'hacerlo', 'repite', 'repetir', 'trabaja', 'frecuencia',
  'forma', 'manera', 'check', 'search', 'run', 'update', 'review', 'look'];

// ---------- Las 7 capacidades de cada proyecto ----------
// «desde» dice en qué fase empieza a trabajar de verdad cada capacidad, según el tipo de proyecto.
// Solo se encienden si la persona lo PIDE («prepara propuestas», «analiza…»), nunca porque la palabra
// aparezca en lo que vende («GPS para seguimiento de flotas»). «Contactar» nunca se enciende solo.
// «verbos»: piden la capacidad por sí solos. «cosas»: necesitan un verbo de pedir delante («prepara correos»).
export const CAPACIDADES = [
  { clave: 'investigar', desde: { comercial: 2, laboral: 6 }, verbos: ['investiga', 'investigar', 'investigues', 'research'], cosas: [] },
  { clave: 'analizar', desde: { comercial: 2, laboral: 6 }, verbos: ['analiza', 'analizar', 'analices', 'analicen', 'clasifica', 'clasificar', 'clasifiques', 'puntua', 'puntuar', 'evalua', 'evaluar', 'califica', 'calificar', 'analyze', 'analyse', 'evaluate', 'rank', 'score'], cosas: ['analisis', 'analysis'] },
  { clave: 'recomendar', desde: { comercial: 2, laboral: 6 }, verbos: ['recomienda', 'recomendar', 'recomiendes', 'recomiendame', 'sugiere', 'sugerir', 'sugiereme', 'recommend', 'suggest'], cosas: ['recomendacion', 'recomendaciones', 'recommendation', 'recommendations'] },
  { clave: 'propuestas', desde: { comercial: 3, laboral: 6 }, verbos: [], cosas: ['propuesta', 'cotizacion', 'candidatura', 'curriculum', 'hoja de vida', 'cv', 'proposal', 'quote', 'resume', 'application'] },
  { clave: 'correos', desde: { comercial: 3, laboral: 6 }, verbos: [], cosas: ['correo', 'email', 'e mail', 'mensaje', 'carta de presentacion', 'cover letter', 'message'] },
  { clave: 'contactar', desde: { comercial: 3, laboral: 6 }, verbos: ['contacta', 'contactar', 'contactes', 'contacte', 'contacten', 'contactarlos', 'contactarlas', 'contactarles', 'contactalos', 'contactalas', 'contactales', 'contactenlos', 'llama', 'llamar', 'llames', 'llamen', 'llamalos', 'llamalas', 'llamarlos', 'llamarlas', 'llamales', 'llamarles', 'escribas', 'escriban', 'escribeles', 'escribirles', 'enviales', 'enviarles', 'mandales', 'mandarles', 'aplica', 'aplicar', 'aplicame', 'postula', 'postular', 'postulame', 'contact', 'reach out', 'call them', 'email them', 'apply'], cosas: [] },
  { clave: 'supervisar', desde: { comercial: 3, laboral: 6 }, verbos: ['supervisa', 'supervisar', 'supervises', 'dale seguimiento', 'darle seguimiento', 'da seguimiento', 'dar seguimiento', 'haz seguimiento', 'hacer seguimiento', 'revisa las respuestas', 'revisar las respuestas', 'follow up', 'track replies', 'monitor replies'], cosas: ['seguimiento', 'respuestas', 'replies', 'follow ups'] },
].map(c => ({ ...c, palabras: [...c.verbos, ...c.cosas] }));
export const CLAVES_CAPACIDADES = CAPACIDADES.map(c => c.clave);
// Verbos que piden una cosa: «prepara propuestas», «haz correos», «write emails».
export const VERBOS_DE_PEDIR = ['prepara', 'preparar', 'prepares', 'preparame', 'haz', 'hacer', 'hagas', 'hazme', 'redacta', 'redactar', 'redactes', 'redactame',
  'escribe', 'escribir', 'escribas', 'escribeme', 'genera', 'generar', 'arma', 'armar', 'armame', 'crea', 'crear', 'quiero', 'queremos', 'necesito',
  'dame', 'manda', 'mandar', 'mandes', 'envia', 'enviar', 'envies', 'incluye', 'incluir', 'write', 'prepare', 'draft', 'make', 'create', 'want', 'need', 'send'];
// Verbos que, con correos o mensajes, son ya contactar: «envía correos», «manda mensajes».
export const VERBOS_DE_ENVIAR = ['envia', 'enviar', 'envies', 'manda', 'mandar', 'mandes', 'send'];
// «Solo investigar»: la combinación más corta.
export const SOLO_INVESTIGAR = ['solo investiga', 'solo investigar', 'solamente investiga', 'solamente investigar', 'nada mas investiga', 'nada mas investigar',
  'unicamente investiga', 'unicamente investigar', 'solo busca', 'solo buscar', 'solo buscalos', 'solo encuentra', 'solo encontrar', 'solamente busca',
  'solamente buscar', 'nada mas busca', 'nada mas buscar', 'only research', 'just research', 'only find', 'just find', 'only search', 'just search',
  'research only', 'investigar solamente', 'investigar nada mas', 'solo la investigacion', 'only the research', 'just the research'];

// Tres combinaciones listas para elegir rápido.
export const COMBINACIONES = {
  solo_investigar: ['investigar'],
  investigar_y_preparar: ['investigar', 'analizar', 'recomendar', 'propuestas', 'correos'],
  ciclo_completo: CLAVES_CAPACIDADES,
};
export const COMBINACION_POR_DEFECTO = 'investigar_y_preparar';

// ---------- Señales para saber si el proyecto es para vender o para buscar empleo ----------
// Las «fuertes» deciden solas; las «débiles» solo cuentan si no hay fuertes (y entonces se avisa).
export const SENALES_LABORAL_FUERTES = ['busco trabajo', 'busco empleo', 'busco un trabajo', 'busco un empleo', 'buscar trabajo', 'buscar empleo',
  'busco chiripa', 'busco una chiripa', 'quiero trabajar', 'quisiera trabajar', 'me gustaria trabajar', 'quiero trabajo', 'quiero un trabajo',
  'quiero un empleo', 'quiero empleo', 'necesito trabajo', 'necesito empleo', 'necesito un trabajo', 'necesito un empleo', 'consigueme trabajo',
  'consigueme un trabajo', 'conseguir trabajo', 'conseguir empleo', 'trabajo de', 'trabajo como', 'empleo de', 'empleo como', 'empleos de',
  'empleos', 'vacante de', 'vacantes de', 'puesto de', 'trabajar de', 'trabajar como', 'looking for work', 'looking for a job', 'looking for job',
  'i want a job', 'i need a job', 'find me a job', 'job as', 'jobs as', 'work as', 'working as', 'position as', 'a job in', 'job in',
  // Formas dominicanas de decir trabajo: chamba, pega, camello, chance, trabajito, empleíto.
  'busco una chamba', 'busco chamba', 'necesito chamba', 'necesito una chamba', 'quiero chamba', 'chamba de', 'busco una chambita', 'chambita de',
  'busco un chance', 'busco pega', 'necesito pega', 'pega de', 'busco camello', 'camello de', 'busco trabajito', 'busco un trabajito', 'trabajito de',
  'busco un empleito', 'empleito de', 'jobs for', 'jobs in', 'job hunting', 'job search', 'job searching',
  // «Busco puestos de enfermera», «busco una plaza de maestro»: también es buscar empleo.
  'puestos de', 'un puesto de', 'busco puesto de', 'plazas de', 'busco plaza de', 'busco una plaza de', 'quiero una plaza de', 'necesito una plaza de'];
export const SENALES_COMERCIAL_FUERTES = ['vendo', 'vendemos', 'vende', 'venden', 'ofrezco', 'ofrecemos', 'ofrece', 'brindo', 'brindamos',
  'distribuyo', 'distribuimos', 'exporto', 'exportamos', 'reparo', 'reparamos', 'instalo', 'instalamos', 'fabrico', 'fabricamos', 'i install', 'we install', 'quiero vender', 'queremos vender', 'quiero venderle', 'quiero venderles', 'queremos venderles', 'venderle', 'venderles', 'mi negocio',
  'mi empresa', 'tengo una empresa', 'tengo un negocio', 'tenemos una empresa', 'me dedico a vender', 'nos dedicamos a vender', 'trabajo vendiendo',
  'soy distribuidor', 'soy distribuidora', 'somos distribuidores', 'tengo una agencia', 'tengo una tienda', 'busco clientes', 'buscar clientes', 'conseguir clientes',
  'encontrar clientes', 'necesito clientes', 'quiero clientes', 'clientes para', 'prospectos', 'que necesiten', 'puedan necesitar', 'que necesitan',
  'que puedan necesitar', 'i sell', 'we sell', 'i offer', 'we offer', 'sells', 'that sells', 'clients for', 'customers for', 'i want clients',
  'i want customers', 'want customers', 'want clients', 'representante de ventas', 'looking for clients', 'looking for customers', 'busca clientes',
  'buscamos clientes', 'i have a company', 'i have a business', 'my company', 'my business', 'find customers', 'find clients', 'find me customers', 'find me clients', 'get me customers', 'get me clients', 'buscame clientes', 'consigueme clientes', 'leads', 'that need', 'that may need', 'who need'];
export const SENALES_LABORAL_DEBILES = ['trabajo', 'empleo', 'salario', 'sueldo', 'vacante', 'curriculum', 'job', 'salary'];
export const SENALES_COMERCIAL_DEBILES = ['venta', 'ventas', 'vender', 'cliente', 'clientes', 'customers', 'clients', 'sell'];

// ---------- Objetivos que todavía no existen: se dice que llegan más adelante, no se fuerzan ----------
export const OBJETIVOS_NO_DISPONIBLES = [
  { clave: 'competidores', palabras: ['mis competidores', 'competidores', 'la competencia', 'mi competencia', 'competitors', 'my competition'] },
  { clave: 'empleados', palabras: ['busco empleados', 'buscar empleados', 'necesito empleados', 'busco personal', 'necesito personal', 'buscando empleados',
    'buscando personal', 'busco trabajadores', 'necesito trabajadores', 'quiero contratar', 'necesito contratar', 'contratar empleados', 'contratar personal',
    'busco un empleado', 'busco una empleada', 'busco empleado', 'busco empleada', 'need workers', 'need employees', 'looking for employees',
    'looking for workers', 'i want to hire', 'i need to hire', 'need to hire', 'we are hiring'] },
  // Cosas que piden hacer y que OPORTIA no hace: publicar, poner anuncios, vender por Amazon, llevar la contabilidad…
  { clave: 'otra_tarea', palabras: ['pon anuncios', 'poner anuncios', 'pon publicidad', 'haz anuncios', 'hazme anuncios', 'publica mis', 'publica en',
    'publicar mis', 'publicar en', 'publicame', 'publiques', 'publica los', 'publica las', 'publica anuncios', 'sube mis productos', 'post my', 'run ads',
    'make ads', 'vender por amazon', 'vender en amazon', 'vendo por amazon', 'por amazon', 'por mercadolibre', 'por mercado libre', 'me lleves la contabilidad',
    'lleves la contabilidad', 'llevarme la contabilidad', 'llevar la contabilidad', 'hazme la contabilidad', 'haz mi contabilidad', 'do my accounting',
    'manejes mis redes', 'maneja mis redes', 'manejar mis redes', 'hazme una pagina', 'hazme la pagina', 'disena mi logo', 'hazme un logo',
    'run my social media', 'me hagas una pagina', 'me hagas la pagina', 'me hagas mi pagina', 'me hagas una web', 'me hagas un sitio', 'me hagas un logo',
    'me hagas el logo', 'me hagas mi logo', 'me hagas anuncios', 'me hagas publicidad', 'me hagas un video', 'me hagas un flyer', 'hazme una web',
    'hazme un sitio', 'hazme un video', 'hazme un flyer', 'me disenes', 'disename', 'me crees una pagina', 'creame una pagina', 'creame un logo',
    'make me a website', 'build me a website', 'build my website', 'make my website', 'make me a logo', 'design my logo', 'design me a logo'] },
  { clave: 'proveedores', palabras: ['busco proveedores', 'buscar proveedores', 'encontrar proveedores', 'conseguir proveedores', 'necesito proveedores', 'proveedores para mi', 'suplidores', 'busco suplidores', 'suppliers', 'find suppliers', 'vendors for my'] },
  { clave: 'socios', palabras: ['encontrar inversores', 'busco inversores', 'buscar inversores', 'conseguir inversores', 'necesito inversores', 'encontrar inversionistas', 'busco inversionistas', 'buscar inversionistas', 'conseguir inversionistas', 'busco socios', 'buscar socios', 'encontrar socios', 'conseguir socios', 'necesito socios', 'find investors', 'looking for investors', 'find partners', 'looking for partners',
    'business partner', 'business partners', 'busco un socio', 'busco socio', 'necesito un socio', 'quiero un socio', 'encontrar un socio', 'conseguir un socio',
    'socio inversionista', 'socios inversionistas'] },
  { clave: 'que_vender', palabras: ['no se que vender', 'no se que ofrecer', 'que puedo vender', 'que podria vender', 'que deberia vender', 'que negocio poner', 'que negocio puedo', 'descubrir que vender', 'dime que vender', 'what to sell', 'what should i sell', 'what can i sell'] },
  { clave: 'una_empresa', palabras: ['investiga esta empresa', 'investiga la empresa', 'investigar esta empresa', 'investigar la empresa', 'investiga a la empresa', 'informacion sobre la empresa', 'informacion de la empresa', 'research this company', 'research the company'] },
];

// Fuentes de información con nombre: elegirlas llega más adelante (por ahora son fijas).
export const FUENTES_CON_NOMBRE = ['diario libre', 'listin diario', 'el nuevo diario', 'el caribe', 'hoy digital', 'acento', 'linkedin', 'facebook',
  'instagram', 'google maps', 'paginas amarillas', 'computrabajo', 'indeed', 'twitter', 'tiktok'];

// Fuentes previstas para cada tipo de proyecto (se conectan en las fases 2 y 6).
export const FUENTES = {
  comercial: ['datos_abiertos', 'webs', 'noticias'],
  laboral: ['empleos', 'webs', 'noticias'],
};

// Todas las zonas en una sola lista, con su clase.
export const ZONAS = [
  ...PROVINCIAS.map(p => ({ ...p, tipo: 'provincia' })),
  ...CIUDADES,
  ...REGIONES.map(r => ({ ...r, ambiguas: [], tipo: 'region' })),
];

// Avenidas y calles famosas: «la Duarte», «avenida Independencia», «la 27». No son provincias.
// «provincia»: si alguien escribe solo «en Duarte», se le sugiere la provincia de ese nombre.
export const CALLES = [
  ['duarte', 'duarte'], ['juan pablo duarte', 'duarte'], ['independencia', 'independencia'], ['hermanas mirabal', 'hermanas-mirabal'],
  ['churchill'], ['winston churchill'], ['lincoln'], ['abraham lincoln'], ['kennedy'], ['john f kennedy'], ['maximo gomez'], ['tiradentes'],
  ['nunez de caceres'], ['sarasota'], ['bolivar'], ['charles de gaulle'], ['jacobo majluta'], ['ortega y gasset'], ['27 de febrero'],
  ['30 de marzo'], ['george washington'], ['malecon'], ['las americas'], ['el conde'], ['mella', 'mella'], ['luperon', 'luperon'], ['gregorio luperon'],
  ['sabana larga'], ['venezuela'], ['mexico'], ['paris'], ['san martin'], ['san vicente de paul'], ['romulo betancourt'], ['estrella sadhala'],
  ['las carreras'], ['del sol'], ['rafael vidal'], ['bartolome colon'], ['salvador estrella sadhala'], ['lope de vega'], ['pedro henriquez urena'],
  ['gustavo mejia ricart'], ['roberto pastoriza'], ['los proceres'], ['jose ortega y gasset'], ['rafael augusto sanchez'], ['alma mater'],
  ['jose contreras'], ['luis f thomen'], ['correa y cidron'], ['jimenez moya'],
].map(([frase, provincia = null]) => ({ frase, provincia }));
