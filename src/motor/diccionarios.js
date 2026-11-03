// Diccionarios del motor propio: con ellos OPORTIA entiende las instrucciones sin ninguna IA.
// Cada palabra va escrita en minúsculas y sin acentos (así se compara). Los plurales se generan solos
// (hotel → hoteles, hotels); los que no siguen la regla se escriben aparte.
// Para añadir un sector, un producto o una zona basta con agregar una línea aquí.

// ---------- Sectores (a quién se busca) ----------
export const SECTORES = [
  { clave: 'hoteles', es: 'Hoteles', en: 'Hotels', palabras: ['hotel', 'hospedaje', 'resort', 'hostal', 'aparthotel', 'apart hotel', 'lodging', 'villa turistica'] },
  { clave: 'clinicas', es: 'Clínicas y hospitales', en: 'Clinics and hospitals', palabras: ['clinica', 'centro medico', 'hospital', 'consultorio', 'policlinica', 'clinic', 'medical center', 'centro de salud'] },
  { clave: 'odontologia', es: 'Consultorios dentales', en: 'Dental offices', palabras: ['clinica dental', 'consultorio dental', 'odontologo', 'odontologia', 'dentista', 'dentist', 'dental clinic', 'dental office'] },
  { clave: 'laboratorios', es: 'Laboratorios', en: 'Laboratories', palabras: ['laboratorio', 'laboratorio clinico', 'laboratory', 'laboratories', 'lab'] },
  { clave: 'farmacias', es: 'Farmacias', en: 'Pharmacies', palabras: ['farmacia', 'pharmacy', 'pharmacies', 'drugstore'] },
  { clave: 'restaurantes', es: 'Restaurantes, bares y cafés', en: 'Restaurants, bars and cafés', palabras: ['restaurante', 'restaurant', 'bar', 'cafeteria', 'cafe', 'comedor', 'pizzeria', 'comida rapida', 'coffee shop', 'fast food'] },
  { clave: 'panaderias', es: 'Panaderías y reposterías', en: 'Bakeries', palabras: ['panaderia', 'reposteria', 'bakery', 'bakeries'] },
  { clave: 'supermercados', es: 'Supermercados', en: 'Supermarkets', palabras: ['supermercado', 'super mercado', 'hipermercado', 'supermarket', 'grocery store'] },
  { clave: 'colmados', es: 'Colmados', en: 'Corner stores (colmados)', palabras: ['colmado', 'colmadon', 'bodega', 'minimarket', 'mini market', 'corner store', 'convenience store'] },
  { clave: 'tiendas', es: 'Tiendas y comercios', en: 'Shops and retail', palabras: ['tienda', 'comercio', 'boutique', 'almacen', 'retail', 'store', 'shop', 'tienda de ropa'] },
  { clave: 'ferreterias', es: 'Ferreterías', en: 'Hardware stores', palabras: ['ferreteria', 'hardware store'] },
  { clave: 'fabricas', es: 'Fábricas e industrias', en: 'Factories and industry', palabras: ['fabrica', 'industria', 'manufactura', 'manufacturera', 'planta industrial', 'industrial', 'factory', 'factories', 'manufacturing', 'industry', 'industries'] },
  { clave: 'zonas-francas', es: 'Zonas francas', en: 'Free trade zones', palabras: ['zona franca', 'free zone', 'free trade zone'] },
  { clave: 'constructoras', es: 'Constructoras', en: 'Construction companies', palabras: ['constructora', 'empresa de construccion', 'contratista', 'construction company', 'construction companies', 'contractor'] },
  { clave: 'inmobiliarias', es: 'Inmobiliarias', en: 'Real estate', palabras: ['inmobiliaria', 'bienes raices', 'real estate', 'realtor'] },
  { clave: 'educacion', es: 'Colegios, escuelas y universidades', en: 'Schools and universities', palabras: ['colegio', 'escuela', 'universidad', 'instituto', 'academia', 'liceo', 'school', 'university', 'universities', 'academy', 'academies'] },
  { clave: 'finanzas', es: 'Bancos, financieras y cooperativas', en: 'Banks, lenders and credit unions', palabras: ['banco', 'financiera', 'cooperativa', 'asociacion de ahorros', 'bank', 'credit union', 'lender'] },
  { clave: 'aseguradoras', es: 'Aseguradoras', en: 'Insurance companies', palabras: ['aseguradora', 'insurance company', 'insurance companies'] },
  { clave: 'talleres', es: 'Talleres mecánicos', en: 'Auto repair shops', palabras: ['taller', 'taller mecanico', 'mecanica', 'auto repair', 'repair shop', 'garage'] },
  { clave: 'concesionarios', es: 'Concesionarios de vehículos', en: 'Car dealerships', palabras: ['concesionario', 'dealer', 'car dealer', 'car dealership'] },
  { clave: 'belleza', es: 'Salones de belleza, barberías y spas', en: 'Beauty salons, barbershops and spas', palabras: ['salon de belleza', 'salon', 'peluqueria', 'barberia', 'spa', 'estetica', 'beauty salon', 'barbershop', 'barber shop'] },
  { clave: 'gimnasios', es: 'Gimnasios', en: 'Gyms', palabras: ['gimnasio', 'gym', 'fitness center'] },
  { clave: 'transporte', es: 'Transporte y logística', en: 'Transport and logistics', palabras: ['transporte', 'logistica', 'mensajeria', 'courier', 'transportista', 'flota', 'transport', 'logistics', 'shipping'] },
  { clave: 'turismo', es: 'Turismo y agencias de viajes', en: 'Tourism and travel agencies', palabras: ['turismo', 'agencia de viajes', 'agencias de viajes', 'tour operador', 'excursion', 'tourism', 'travel agency', 'travel agencies', 'tour operator'] },
  { clave: 'agricultura', es: 'Fincas y agricultura', en: 'Farms and agriculture', palabras: ['finca', 'agricola', 'agricultura', 'agropecuaria', 'ganaderia', 'granja', 'farm', 'agriculture'] },
  { clave: 'servicios-profesionales', es: 'Oficinas y servicios profesionales', en: 'Offices and professional services', palabras: ['oficina', 'despacho', 'abogado', 'bufete', 'firma de abogados', 'contador', 'firma contable', 'consultora', 'law firm', 'lawyer', 'accountant', 'office', 'consulting firm'] },
  { clave: 'empresas-servicios', es: 'Empresas de servicios', en: 'Service companies', palabras: ['empresa de servicios', 'empresas de servicios', 'service company', 'service companies'] },
  { clave: 'call-centers', es: 'Call centers', en: 'Call centers', palabras: ['call center', 'centro de llamadas', 'contact center'] },
  { clave: 'eventos', es: 'Eventos y salones de fiesta', en: 'Events and venues', palabras: ['salon de eventos', 'organizador de eventos', 'salon de fiestas', 'event venue', 'event planner', 'wedding planner'] },
  { clave: 'veterinarias', es: 'Veterinarias', en: 'Veterinary clinics', palabras: ['veterinaria', 'veterinario', 'veterinary', 'vet clinic'] },
  { clave: 'iglesias', es: 'Iglesias', en: 'Churches', palabras: ['iglesia', 'church', 'churches'] },
  { clave: 'ong', es: 'Fundaciones y ONG', en: 'Foundations and nonprofits', palabras: ['ong', 'fundacion', 'nonprofit', 'ngo', 'foundation'] },
  // «Empresas» o «negocios» sin decir cuáles: se usa solo si no se nombró ningún otro sector.
  { clave: 'todas', es: 'Todo tipo de empresas', en: 'All kinds of businesses', palabras: ['empresa', 'negocio', 'compania', 'company', 'companies', 'business', 'businesses'], general: true },
];

// ---------- Productos o servicios (lo que se vende) ----------
export const PRODUCTOS = [
  { clave: 'paneles-solares', es: 'paneles solares', en: 'solar panels', palabras: ['panel solar', 'paneles solares', 'energia solar', 'placa solar', 'placas solares', 'fotovoltaico', 'solar', 'solar panel', 'solar energy'] },
  { clave: 'plantas-electricas', es: 'plantas eléctricas e inversores', en: 'generators and inverters', palabras: ['planta electrica', 'plantas electricas', 'generador', 'inversor', 'bateria', 'generator', 'inverter'] },
  { clave: 'inventario', es: 'sistemas de inventario', en: 'inventory systems', palabras: ['inventario', 'sistema de inventario', 'sistemas de inventario', 'control de inventario', 'inventory', 'inventory system'] },
  { clave: 'reservas', es: 'sistemas de reservas', en: 'booking systems', palabras: ['reserva', 'reservacion', 'sistema de reservas', 'booking', 'reservation', 'booking system'] },
  { clave: 'citas', es: 'citas en línea', en: 'online appointments', palabras: ['citas en linea', 'sistema de citas', 'agenda en linea', 'agendamiento', 'appointment', 'online appointments', 'scheduling'] },
  { clave: 'facturacion', es: 'facturación y punto de venta', en: 'invoicing and point of sale', palabras: ['facturacion', 'facturacion electronica', 'factura electronica', 'punto de venta', 'caja registradora', 'invoicing', 'point of sale', 'e invoicing'] },
  { clave: 'contabilidad', es: 'contabilidad', en: 'accounting', palabras: ['contabilidad', 'sistema contable', 'servicios contables', 'accounting', 'bookkeeping'] },
  { clave: 'paginas-web', es: 'páginas web', en: 'websites', palabras: ['pagina web', 'paginas web', 'sitio web', 'sitios web', 'website', 'diseno web', 'desarrollo web', 'tienda en linea', 'tiendas en linea', 'ecommerce', 'e commerce', 'online store', 'web design'] },
  { clave: 'software', es: 'software', en: 'software', palabras: ['software', 'software empresarial', 'aplicacion', 'aplicaciones', 'app', 'programa informatico', 'erp', 'crm', 'application', 'business software'] },
  { clave: 'automatizacion', es: 'automatización y chatbots', en: 'automation and chatbots', palabras: ['automatizacion', 'chatbot', 'inteligencia artificial', 'whatsapp business', 'automation', 'artificial intelligence'] },
  { clave: 'marketing', es: 'marketing digital', en: 'digital marketing', palabras: ['marketing', 'marketing digital', 'publicidad', 'redes sociales', 'community manager', 'mercadeo', 'advertising', 'social media'] },
  { clave: 'seguridad', es: 'cámaras y seguridad', en: 'cameras and security', palabras: ['camara de seguridad', 'camaras de seguridad', 'cctv', 'videovigilancia', 'alarma', 'seguridad electronica', 'security camera', 'alarm'] },
  { clave: 'redes', es: 'internet y redes', en: 'internet and networks', palabras: ['internet', 'cableado', 'wifi', 'fibra optica', 'networking'] },
  { clave: 'climatizacion', es: 'aire acondicionado', en: 'air conditioning', palabras: ['aire acondicionado', 'aires acondicionados', 'climatizacion', 'refrigeracion', 'air conditioning', 'hvac'] },
  { clave: 'limpieza', es: 'limpieza', en: 'cleaning', palabras: ['limpieza', 'servicio de limpieza', 'productos de limpieza', 'cleaning'] },
  { clave: 'seguros', es: 'seguros', en: 'insurance', palabras: ['seguros', 'poliza', 'insurance'] },
  { clave: 'agua', es: 'agua y filtros', en: 'water and filters', palabras: ['agua purificada', 'botellon', 'filtro de agua', 'purificadora', 'water filter'] },
  { clave: 'uniformes', es: 'uniformes', en: 'uniforms', palabras: ['uniforme', 'uniform'] },
  { clave: 'capacitacion', es: 'capacitación', en: 'training', palabras: ['capacitacion', 'curso', 'entrenamiento', 'formacion', 'training'] },
  { clave: 'consultoria', es: 'consultoría', en: 'consulting', palabras: ['consultoria', 'asesoria', 'consulting'] },
];

// ---------- Zonas de República Dominicana: las 32 provincias (31 y el Distrito Nacional) ----------
export const PROVINCIAS = [
  { clave: 'distrito-nacional', nombre: 'Distrito Nacional', palabras: ['distrito nacional', 'dn'] },
  { clave: 'santo-domingo', nombre: 'Santo Domingo (provincia)', palabras: ['provincia santo domingo', 'provincia de santo domingo'] },
  { clave: 'santiago', nombre: 'Santiago', palabras: ['santiago', 'santiago de los caballeros'] },
  { clave: 'la-vega', nombre: 'La Vega', palabras: ['la vega'] },
  { clave: 'puerto-plata', nombre: 'Puerto Plata', palabras: ['puerto plata'] },
  { clave: 'san-cristobal', nombre: 'San Cristóbal', palabras: ['san cristobal'] },
  { clave: 'la-altagracia', nombre: 'La Altagracia', palabras: ['la altagracia', 'altagracia'] },
  { clave: 'la-romana', nombre: 'La Romana', palabras: ['la romana'] },
  { clave: 'san-pedro-de-macoris', nombre: 'San Pedro de Macorís', palabras: ['san pedro de macoris', 'san pedro'] },
  { clave: 'duarte', nombre: 'Duarte', palabras: ['provincia duarte', 'duarte'] },
  { clave: 'espaillat', nombre: 'Espaillat', palabras: ['espaillat'] },
  { clave: 'peravia', nombre: 'Peravia', palabras: ['peravia'] },
  { clave: 'azua', nombre: 'Azua', palabras: ['azua'] },
  { clave: 'barahona', nombre: 'Barahona', palabras: ['barahona'] },
  { clave: 'monsenor-nouel', nombre: 'Monseñor Nouel', palabras: ['monsenor nouel'] },
  { clave: 'sanchez-ramirez', nombre: 'Sánchez Ramírez', palabras: ['sanchez ramirez'] },
  { clave: 'valverde', nombre: 'Valverde', palabras: ['valverde'] },
  { clave: 'maria-trinidad-sanchez', nombre: 'María Trinidad Sánchez', palabras: ['maria trinidad sanchez'] },
  { clave: 'samana', nombre: 'Samaná', palabras: ['samana'] },
  { clave: 'hermanas-mirabal', nombre: 'Hermanas Mirabal', palabras: ['hermanas mirabal'] },
  { clave: 'monte-plata', nombre: 'Monte Plata', palabras: ['monte plata'] },
  { clave: 'hato-mayor', nombre: 'Hato Mayor', palabras: ['hato mayor'] },
  { clave: 'el-seibo', nombre: 'El Seibo', palabras: ['el seibo', 'el seybo'] },
  { clave: 'san-juan', nombre: 'San Juan', palabras: ['san juan', 'san juan de la maguana'] },
  { clave: 'elias-pina', nombre: 'Elías Piña', palabras: ['elias pina'] },
  { clave: 'dajabon', nombre: 'Dajabón', palabras: ['dajabon'] },
  { clave: 'montecristi', nombre: 'Montecristi', palabras: ['montecristi', 'monte cristi'] },
  { clave: 'santiago-rodriguez', nombre: 'Santiago Rodríguez', palabras: ['santiago rodriguez'] },
  { clave: 'bahoruco', nombre: 'Bahoruco', palabras: ['bahoruco', 'baoruco'] },
  { clave: 'independencia', nombre: 'Independencia', palabras: ['provincia independencia'] },
  { clave: 'pedernales', nombre: 'Pedernales', palabras: ['pedernales'] },
  { clave: 'san-jose-de-ocoa', nombre: 'San José de Ocoa', palabras: ['san jose de ocoa', 'ocoa'] },
];

// Ciudades y municipios conocidos: cada uno dice a qué provincia pertenece.
export const CIUDADES = [
  { clave: 'santo-domingo-este', nombre: 'Santo Domingo Este', provincia: 'santo-domingo', palabras: ['santo domingo este', 'sde'] },
  { clave: 'santo-domingo-norte', nombre: 'Santo Domingo Norte', provincia: 'santo-domingo', palabras: ['santo domingo norte'] },
  { clave: 'santo-domingo-oeste', nombre: 'Santo Domingo Oeste', provincia: 'santo-domingo', palabras: ['santo domingo oeste'] },
  { clave: 'boca-chica', nombre: 'Boca Chica', provincia: 'santo-domingo', palabras: ['boca chica'] },
  { clave: 'los-alcarrizos', nombre: 'Los Alcarrizos', provincia: 'santo-domingo', palabras: ['los alcarrizos'] },
  { clave: 'pedro-brand', nombre: 'Pedro Brand', provincia: 'santo-domingo', palabras: ['pedro brand'] },
  { clave: 'punta-cana', nombre: 'Bávaro-Punta Cana', provincia: 'la-altagracia', palabras: ['punta cana', 'bavaro'] },
  { clave: 'higuey', nombre: 'Higüey', provincia: 'la-altagracia', palabras: ['higuey'] },
  { clave: 'bayahibe', nombre: 'Bayahibe', provincia: 'la-altagracia', palabras: ['bayahibe'] },
  { clave: 'juan-dolio', nombre: 'Juan Dolio', provincia: 'san-pedro-de-macoris', palabras: ['juan dolio'] },
  { clave: 'bonao', nombre: 'Bonao', provincia: 'monsenor-nouel', palabras: ['bonao'] },
  { clave: 'san-francisco-de-macoris', nombre: 'San Francisco de Macorís', provincia: 'duarte', palabras: ['san francisco de macoris', 'san francisco'] },
  { clave: 'moca', nombre: 'Moca', provincia: 'espaillat', palabras: ['moca'] },
  { clave: 'bani', nombre: 'Baní', provincia: 'peravia', palabras: ['bani'] },
  { clave: 'jarabacoa', nombre: 'Jarabacoa', provincia: 'la-vega', palabras: ['jarabacoa'] },
  { clave: 'constanza', nombre: 'Constanza', provincia: 'la-vega', palabras: ['constanza'] },
  { clave: 'sosua', nombre: 'Sosúa-Cabarete', provincia: 'puerto-plata', palabras: ['sosua', 'cabarete'] },
  { clave: 'las-terrenas', nombre: 'Las Terrenas', provincia: 'samana', palabras: ['las terrenas'] },
  { clave: 'cotui', nombre: 'Cotuí', provincia: 'sanchez-ramirez', palabras: ['cotui'] },
  { clave: 'mao', nombre: 'Mao', provincia: 'valverde', palabras: ['mao'] },
  { clave: 'nagua', nombre: 'Nagua', provincia: 'maria-trinidad-sanchez', palabras: ['nagua'] },
  { clave: 'salcedo', nombre: 'Salcedo', provincia: 'hermanas-mirabal', palabras: ['salcedo'] },
  { clave: 'haina', nombre: 'Bajos de Haina', provincia: 'san-cristobal', palabras: ['haina', 'bajos de haina'] },
  { clave: 'villa-altagracia', nombre: 'Villa Altagracia', provincia: 'san-cristobal', palabras: ['villa altagracia'] },
  { clave: 'neiba', nombre: 'Neiba', provincia: 'bahoruco', palabras: ['neiba'] },
  { clave: 'jimani', nombre: 'Jimaní', provincia: 'independencia', palabras: ['jimani'] },
];

// Regiones: nombres que la gente usa para varias provincias juntas.
export const REGIONES = [
  // «Santo Domingo» a secas casi siempre quiere decir la capital y sus alrededores.
  { clave: 'gran-santo-domingo', nombre: 'Gran Santo Domingo', provincias: ['distrito-nacional', 'santo-domingo'], palabras: ['gran santo domingo', 'santo domingo', 'la capital', 'capital'] },
];

// Frases que significan «todo el país».
export const PAIS_COMPLETO = ['republica dominicana', 'rd', 'todo el pais', 'en el pais', 'del pais', 'todo rd', 'toda la republica', 'nivel nacional', 'a nivel nacional', 'dominican republic', 'the whole country', 'nationwide'];

// ---------- Tamaño de las empresas ----------
export const TAMANOS = [
  { clave: 'pequenas', es: 'Pequeñas', en: 'Small', palabras: ['pequena', 'pequeno', 'pyme', 'micro', 'microempresa', 'small'] },
  { clave: 'medianas', es: 'Medianas', en: 'Medium', palabras: ['mediana', 'mediano', 'medium', 'mid sized', 'midsize'] },
  { clave: 'grandes', es: 'Grandes', en: 'Large', palabras: ['grande', 'large', 'big'] },
];

// ---------- Cada cuánto trabaja el proyecto ----------
export const FRECUENCIAS = [
  { clave: 'diaria', palabras: ['cada dia', 'todos los dias', 'diario', 'diaria', 'diariamente', 'a diario', 'daily', 'every day'] },
  { clave: 'semanal', palabras: ['cada semana', 'semanal', 'semanalmente', 'una vez por semana', 'una vez a la semana', 'weekly', 'every week'] },
  { clave: 'mensual', palabras: ['cada mes', 'mensual', 'mensualmente', 'una vez al mes', 'monthly', 'every month'] },
  { clave: 'manual', palabras: ['cuando yo diga', 'cuando yo lo pida', 'solo cuando lo pida', 'manualmente', 'manually', 'when i ask'] },
];
export const FRECUENCIA_POR_DEFECTO = 'semanal';

// ---------- Las 7 capacidades de cada proyecto ----------
// «desde» dice en qué fase empieza a trabajar de verdad cada capacidad, según el tipo de proyecto.
export const CAPACIDADES = [
  { clave: 'investigar', desde: { comercial: 2, laboral: 6 }, palabras: ['investigar', 'investiga', 'buscar', 'busca', 'encontrar', 'research', 'find'] },
  { clave: 'analizar', desde: { comercial: 2, laboral: 6 }, palabras: ['analizar', 'analiza', 'analisis', 'detectar necesidades', 'necesidades', 'clasificar', 'clasifica', 'puntuar', 'analyze', 'analyse'] },
  { clave: 'recomendar', desde: { comercial: 2, laboral: 6 }, palabras: ['recomendar', 'recomienda', 'recomendaciones', 'que ofrecer', 'recommend', 'recommendations'] },
  { clave: 'propuestas', desde: { comercial: 3, laboral: 6 }, palabras: ['propuesta', 'cotizacion', 'candidatura', 'proposal', 'quote'] },
  { clave: 'correos', desde: { comercial: 3, laboral: 6 }, palabras: ['correo', 'email', 'e mail', 'mensaje', 'carta de presentacion', 'cover letter'] },
  { clave: 'contactar', desde: { comercial: 3, laboral: 6 }, palabras: ['contactar', 'contactarlos', 'contactarlas', 'contacta', 'contactalos', 'contactalas', 'enviar', 'enviarles', 'envialos', 'envialas', 'escribirles', 'escribeles', 'gmail', 'contact', 'send'] },
  { clave: 'supervisar', desde: { comercial: 3, laboral: 6 }, palabras: ['respuestas', 'supervisar', 'supervisa', 'seguimiento', 'follow up', 'replies'] },
];
export const CLAVES_CAPACIDADES = CAPACIDADES.map(c => c.clave);

// Tres combinaciones listas para elegir rápido.
export const COMBINACIONES = {
  solo_investigar: ['investigar'],
  investigar_y_preparar: ['investigar', 'analizar', 'recomendar', 'propuestas', 'correos'],
  ciclo_completo: CLAVES_CAPACIDADES,
};
export const COMBINACION_POR_DEFECTO = 'investigar_y_preparar';

// ---------- Señales para saber si el proyecto es para vender o para buscar empleo ----------
export const SENALES_LABORAL = ['busco trabajo', 'busco empleo', 'buscar trabajo', 'buscar empleo', 'trabajo de', 'trabajo como', 'empleo de', 'empleo como', 'empleo', 'empleos', 'vacante', 'puesto de', 'trabajar como', 'trabajar de', 'salario', 'sueldo', 'curriculum', 'job', 'jobs', 'looking for work', 'salary', 'position as', 'work as'];
export const SENALES_COMERCIAL = ['vendo', 'vende', 'vender', 'vendemos', 'venta', 'ventas', 'cliente', 'clientes', 'ofrecer', 'ofrezco', 'ofrecemos', 'mis servicios', 'mis productos', 'mi empresa', 'mi negocio', 'prospecto', 'necesiten', 'puedan necesitar', 'necesitan', 'sell', 'selling', 'customer', 'customers', 'client', 'clients', 'leads', 'prospects'];

// Fuentes previstas para cada tipo de proyecto (se conectan en las fases 2 y 6).
export const FUENTES = {
  comercial: ['datos_abiertos', 'webs', 'noticias'],
  laboral: ['empleos', 'webs', 'noticias'],
};
