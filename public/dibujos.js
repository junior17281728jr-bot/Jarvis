// OPORTIA: los dibujos de los proyectos (pase visual 2, versión 0.3.2) y de los servicios (fase 1, parte d). Solo datos:
// íconos de línea (24×24) y el mapa de casillas de las 32 provincias. Todo es propio (sin fotos, sin archivos de fuera, sin red): app.js los
// dibuja con createElementNS. test/pantallas.test.js comprueba que cada negocio del motor tiene su ícono y que el
// mapa tiene las 32 provincias, cada una en su casilla, y las mismas regiones que el motor.

// Un ícono por cada negocio que entiende el motor (src/motor/diccionarios.js). «todas» usa el edificio de app.js.
export const ICONOS_SECTOR = {
  hoteles: [['path', { d: 'M3 19V6' }], ['path', { d: 'M3 15h18v4' }], ['path', { d: 'M21 15v-3a3 3 0 0 0-3-3h-7v6' }], ['circle', { cx: 7, cy: 11.5, r: 2 }]],
  clinicas: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }], ['path', { d: 'M12 8v8M8 12h8' }]],
  odontologia: [['path', { d: 'M7.5 4C5 4 3.6 6 4 9c.3 2.2 1.4 3.4 1.9 5.9.4 2.1.8 5.1 2.3 5.1 1.6 0 1.5-4.6 3.8-4.6s2.2 4.6 3.8 4.6c1.5 0 1.9-3 2.3-5.1.5-2.5 1.6-3.7 1.9-5.9.4-3-1-5-3.5-5-2 0-2.9 1.2-4.5 1.2S9.5 4 7.5 4z' }]],
  laboratorios: [['path', { d: 'M9 3h6' }], ['path', { d: 'M10 3v6l-5.2 9.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9V3' }], ['path', { d: 'M7.5 15h9' }]],
  farmacias: [['path', { d: 'M4.6 12.4l7.8-7.8a5 5 0 0 1 7 7l-7.8 7.8a5 5 0 0 1-7-7z' }], ['path', { d: 'M8.5 8.5l7 7' }]],
  restaurantes: [['path', { d: 'M5 3v5a2 2 0 0 0 4 0V3' }], ['path', { d: 'M7 3v18' }], ['path', { d: 'M17 21V3c-2 1.5-3 4-3 7v4h3' }]],
  panaderias: [['path', { d: 'M5 11a3 3 0 0 1-1-5.8C5 3.8 8 3 12 3s7 .8 8 2.2A3 3 0 0 1 19 11v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z' }], ['path', { d: 'M9 11v5M15 11v5' }]],
  supermercados: [['path', { d: 'M3 9h18l-2 10.2a1.5 1.5 0 0 1-1.5 1.3h-11A1.5 1.5 0 0 1 5 19.2z' }], ['path', { d: 'M8 9l3-6M16 9l-3-6' }], ['path', { d: 'M9 13v4M12 13v4M15 13v4' }]],
  colmados: [['path', { d: 'M3 10l2-6h14l2 6z' }], ['path', { d: 'M4.5 10v10h15V10' }], ['path', { d: 'M10 20v-5h4v5' }]],
  tiendas: [['path', { d: 'M5.5 8h13l1 13h-15z' }], ['path', { d: 'M9 8V6a3 3 0 0 1 6 0v2' }]],
  ferreterias: [['path', { d: 'M15 3.5l5.5 5.5-2.8 2.8-5.5-5.5z' }], ['path', { d: 'M13.6 8.4L4.4 17.6a1.5 1.5 0 0 0 2 2l9.2-9.2' }]],
  fabricas: [['path', { d: 'M3 21V10l5 3v-3l5 3v-3l5 3V4h3v17z' }], ['path', { d: 'M7 17h2M12 17h2' }]],
  'zonas-francas': [['path', { d: 'M3 7.5l9-4.5 9 4.5v9L12 21l-9-4.5z' }], ['path', { d: 'M3 7.5l9 4.5 9-4.5' }], ['path', { d: 'M12 12v9' }]],
  constructoras: [['path', { d: 'M3 18h18' }], ['path', { d: 'M5 18v-3a7 7 0 0 1 14 0v3' }], ['path', { d: 'M10 8.5V5h4v3.5' }]],
  inmobiliarias: [['path', { d: 'M3 11l9-7 9 7' }], ['path', { d: 'M5 10v10h14V10' }], ['circle', { cx: 12, cy: 13.5, r: 2 }], ['path', { d: 'M12 15.5V19' }]],
  educacion: [['path', { d: 'M2 9l10-5 10 5-10 5z' }], ['path', { d: 'M6 11v5c3 2.5 9 2.5 12 0v-5' }], ['path', { d: 'M22 9v6' }]],
  finanzas: [['path', { d: 'M3 9l9-5 9 5z' }], ['path', { d: 'M4 20h16' }], ['path', { d: 'M6 11v6M10 11v6M14 11v6M18 11v6' }]],
  aseguradoras: [['path', { d: 'M3 12a9 9 0 0 1 18 0z' }], ['path', { d: 'M12 12v7a2 2 0 0 1-4 0' }]],
  bancas: [['path', { d: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z' }], ['path', { d: 'M15 7v2M15 11v2M15 15v2' }]],
  talleres: [['path', { d: 'M14.5 4.5a4.5 4.5 0 0 0-5.3 5.9L3.6 16a2 2 0 0 0 2.8 2.8l5.6-5.6a4.5 4.5 0 0 0 5.9-5.3l-2.6 2.6-2.4-.6-.6-2.4z' }]],
  concesionarios: [['path', { d: 'M3 17v-4l2.2-5.2A1.5 1.5 0 0 1 6.6 7h10.8a1.5 1.5 0 0 1 1.4.8L21 13v4' }], ['path', { d: 'M3 13h18' }], ['circle', { cx: 7.5, cy: 17, r: 2 }], ['circle', { cx: 16.5, cy: 17, r: 2 }]],
  belleza: [['circle', { cx: 6, cy: 6, r: 3 }], ['circle', { cx: 6, cy: 18, r: 3 }], ['path', { d: 'M8.2 8.2L20 20M8.2 15.8L20 4' }]],
  gimnasios: [['path', { d: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12' }]],
  transporte: [['path', { d: 'M2 6h12v10H2z' }], ['path', { d: 'M14 10h4l3 3v3h-7' }], ['circle', { cx: 6, cy: 18, r: 2 }], ['circle', { cx: 17, cy: 18, r: 2 }]],
  turismo: [['circle', { cx: 12, cy: 10, r: 4 }], ['path', { d: 'M12 2.5v1M4.6 5.6l.8.7M19.4 5.6l-.8.7M3 10h1M20 10h1' }], ['path', { d: 'M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0' }]],
  agricultura: [['path', { d: 'M12 21v-9' }], ['path', { d: 'M12 12c0-4 3-7 8-7 0 5-3 7-8 7z' }], ['path', { d: 'M12 14c0-3-2.5-5.5-7-5.5 0 4 2.5 5.5 7 5.5z' }], ['path', { d: 'M7 21h10' }]],
  'servicios-profesionales': [['rect', { x: 5, y: 4, width: 14, height: 17, rx: 2 }], ['path', { d: 'M9 3h6v2.5H9z' }], ['path', { d: 'M9 11h6M9 15h6M9 18h3' }]],
  'empresas-servicios': [['rect', { x: 3, y: 8, width: 18, height: 12, rx: 2 }], ['path', { d: 'M8 8V5h8v3' }], ['path', { d: 'M3 13h18' }], ['path', { d: 'M10 13v2h4v-2' }]],
  'call-centers': [['path', { d: 'M4 14v-2a8 8 0 0 1 16 0v2' }], ['rect', { x: 3, y: 13, width: 4, height: 6, rx: 1.5 }], ['rect', { x: 17, y: 13, width: 4, height: 6, rx: 1.5 }], ['path', { d: 'M19 19c0 1.5-2 2.5-5 2.5' }]],
  eventos: [['ellipse', { cx: 12, cy: 9, rx: 5, ry: 6 }], ['path', { d: 'M12 15l-1.2 2h2.4z' }], ['path', { d: 'M12 17c0 2-2 2.5-1 4.5' }]],
  veterinarias: [['circle', { cx: 6, cy: 10, r: 1.7 }], ['circle', { cx: 9.8, cy: 6, r: 1.7 }], ['circle', { cx: 14.2, cy: 6, r: 1.7 }], ['circle', { cx: 18, cy: 10, r: 1.7 }],
    ['path', { d: 'M12 12c-3 0-5.5 3-5.5 5.5 0 1.8 1.4 2.5 3 2.5 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.6 0 3-.7 3-2.5C17.5 15 15 12 12 12z' }]],
  iglesias: [['path', { d: 'M12 2v4M10 4h4' }], ['path', { d: 'M7 21V11l5-4 5 4v10' }], ['path', { d: 'M3 21h18' }], ['path', { d: 'M10 21v-4a2 2 0 0 1 4 0v4' }]],
  ong: [['path', { d: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z' }]],
  joyerias: [['path', { d: 'M6 4h12l3 5-9 11L3 9z' }], ['path', { d: 'M3 9h18' }], ['path', { d: 'M9 4l3 5 3-5' }], ['path', { d: 'M12 20L8.5 9M12 20l3.5-11' }]],
  lavaderos: [['path', { d: 'M12 3s-5.5 6.2-5.5 10a5.5 5.5 0 0 0 11 0C17.5 9.2 12 3 12 3z' }], ['path', { d: 'M9.5 14a2.5 2.5 0 0 0 2.5 2.5' }]],
  discotecas: [['path', { d: 'M9 18V5l11-2v13' }], ['circle', { cx: 6.5, cy: 18, r: 2.5 }], ['circle', { cx: 17.5, cy: 16, r: 2.5 }]],
  combustible: [['path', { d: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16' }], ['path', { d: 'M3 21h12' }], ['rect', { x: 6, y: 6, width: 6, height: 4, rx: 0.5 }], ['path', { d: 'M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3' }]],
};

// Otros íconos de los proyectos: la pista de pasos, el mapa, las fichas de «Lo que entendí» y los botones.
export const ICONOS_PROYECTO = {
  buscar: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'M20 20l-4-4' }]],
  sobre: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ['path', { d: 'M3 7l9 6 9-6' }]],
  candado: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }]],
  mapa: [['path', { d: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z' }], ['path', { d: 'M9 4v14M15 6v14' }]],
  estrella: [['path', { d: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z' }]],
  prohibido: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M5.6 5.6l12.8 12.8' }]],
  play: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M10 8.5v7l5.5-3.5z' }]],
  rayo: [['path', { d: 'M13 2L4 14h7l-1 8 9-12h-7z' }]],
  libro: [['path', { d: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z' }], ['path', { d: 'M4 21a2 2 0 0 1 2-2h13v2H6' }], ['path', { d: 'M9 7h6' }]],
  // Un edificio solo (para dibujar 1, 2 o 3 según el tamaño de las empresas).
  casita: [['rect', { x: 6, y: 4, width: 12, height: 17, rx: 1 }], ['path', { d: 'M9.5 8h1M13.5 8h1M9.5 12h1M13.5 12h1M10.5 21v-4h3v4' }]],
};

// Fase 1, parte d: los íconos de los servicios (la IA opcional y las Claves). La IA usa la chispa de siempre.
export const ICONOS_SERVICIOS = {
  llave: [['circle', { cx: 7.5, cy: 15.5, r: 4.5 }], ['path', { d: 'M10.7 12.3L20 3' }], ['path', { d: 'M16 7l3 3' }], ['path', { d: 'M18.5 4.5l2 2' }]],
  encendido: [['path', { d: 'M12 3v8' }], ['path', { d: 'M6.3 6.8a8 8 0 1 0 11.4 0' }]],
  grafica: [['path', { d: 'M4 20h16' }], ['rect', { x: 5, y: 12, width: 3, height: 6, rx: 0.8 }], ['rect', { x: 10.5, y: 7, width: 3, height: 11, rx: 0.8 }], ['rect', { x: 16, y: 10, width: 3, height: 8, rx: 0.8 }]],
  recibo: [['path', { d: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z' }], ['path', { d: 'M9 8h6M9 12h6M9 16h3' }]],
  // Fase 1, parte e (copias y Telegram). Dibujos genéricos: nunca el logo de una marca (el avión de papel es «mensaje»).
  copia: [['path', { d: 'M4 7l7-3.5L18 7l-7 3.5z' }], ['path', { d: 'M4 11l7 3.5 3-1.5' }], ['path', { d: 'M4 15l7 3.5 2-1' }], ['path', { d: 'M18 12.5l3 1.2v2.6c0 2-1.3 3.4-3 3.9-1.7-.5-3-1.9-3-3.9v-2.6z' }]],
  nube_candado: [['path', { d: 'M7 17.5H6a4 4 0 0 1-.6-8A6 6 0 0 1 17 8.2a4.6 4.6 0 0 1 1.5 9' }], ['rect', { x: 9, y: 14, width: 7, height: 6, rx: 1.2 }], ['path', { d: 'M10.6 14v-1.6a1.9 1.9 0 0 1 3.8 0V14' }]],
  avion_papel: [['path', { d: 'M21 3.5L2.8 10.8l6.7 2.6 2.6 6.7z' }], ['path', { d: 'M21 3.5L9.5 13.4' }]],
  disco: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2.5 }], ['line', { x1: 3, y1: 13.5, x2: 21, y2: 13.5 }], ['line', { x1: 16.5, y1: 16.3, x2: 16.51, y2: 16.3 }], ['line', { x1: 7, y1: 16.3, x2: 12, y2: 16.3 }]],
  clave_recuperacion: [['circle', { cx: 7.5, cy: 12, r: 4 }], ['path', { d: 'M11.5 12H19' }], ['path', { d: 'M16 12v3' }], ['path', { d: 'M15.5 3.5l1.8 1.8 3.2-3.2' }]],
  imprimir: [['path', { d: 'M7 8V3.5h10V8' }], ['rect', { x: 3, y: 8, width: 18, height: 8, rx: 2 }], ['rect', { x: 7, y: 13, width: 10, height: 7.5, rx: 1 }], ['line', { x1: 17.5, y1: 11, x2: 17.51, y2: 11 }]],
  copiar: [['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }], ['path', { d: 'M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8' }]],
};

// El mapa de casillas: cada provincia en una casilla de una rejilla de 7×5, más o menos donde queda (el norte arriba,
// Haití a la izquierda). No es un mapa exacto: es para ver de un vistazo qué parte del país está elegida.
// [clave del motor, letras de la casilla, columna, fila]
export const MAPA_COLUMNAS = 7;
export const MAPA_FILAS = 5;
export const MAPA_PROVINCIAS = [
  ['montecristi', 'MC', 0, 0], ['valverde', 'VAL', 1, 0], ['puerto-plata', 'PP', 2, 0], ['espaillat', 'ESP', 3, 0], ['maria-trinidad-sanchez', 'MTS', 4, 0], ['samana', 'SAM', 5, 0],
  ['dajabon', 'DAJ', 0, 1], ['santiago-rodriguez', 'SRO', 1, 1], ['santiago', 'STI', 2, 1], ['hermanas-mirabal', 'HMI', 3, 1], ['duarte', 'DUA', 4, 1], ['hato-mayor', 'HMA', 5, 1], ['el-seibo', 'SEI', 6, 1],
  ['elias-pina', 'EP', 0, 2], ['san-juan', 'SJ', 1, 2], ['la-vega', 'LV', 2, 2], ['monsenor-nouel', 'MN', 3, 2], ['sanchez-ramirez', 'SR', 4, 2], ['monte-plata', 'MP', 5, 2], ['la-altagracia', 'LA', 6, 2],
  ['independencia', 'IND', 0, 3], ['bahoruco', 'BAH', 1, 3], ['azua', 'AZ', 2, 3], ['san-jose-de-ocoa', 'SJO', 3, 3], ['san-cristobal', 'SC', 4, 3], ['santo-domingo', 'SD', 5, 3], ['san-pedro-de-macoris', 'SPM', 6, 3],
  ['pedernales', 'PED', 0, 4], ['barahona', 'BAR', 1, 4], ['peravia', 'PER', 3, 4], ['distrito-nacional', 'DN', 5, 4], ['la-romana', 'LR', 6, 4],
].map(([clave, letras, columna, fila]) => ({ clave, letras, columna, fila }));

// Las provincias de cada región (las mismas que usa el motor en src/motor/lugares.js; una prueba lo comprueba).
export const PROVINCIAS_DE_REGION = {
  'gran-santo-domingo': ['distrito-nacional', 'santo-domingo'],
  cibao: ['santiago', 'puerto-plata', 'espaillat', 'la-vega', 'monsenor-nouel', 'sanchez-ramirez', 'duarte', 'maria-trinidad-sanchez', 'hermanas-mirabal', 'samana', 'valverde', 'montecristi', 'dajabon', 'santiago-rodriguez'],
  'cibao-norte': ['santiago', 'puerto-plata', 'espaillat'],
  'cibao-sur': ['la-vega', 'monsenor-nouel', 'sanchez-ramirez'],
  'cibao-nordeste': ['duarte', 'maria-trinidad-sanchez', 'hermanas-mirabal', 'samana'],
  noroeste: ['valverde', 'montecristi', 'dajabon', 'santiago-rodriguez'],
  sur: ['san-cristobal', 'peravia', 'azua', 'san-jose-de-ocoa', 'san-juan', 'elias-pina', 'barahona', 'bahoruco', 'independencia', 'pedernales'],
  valdesia: ['san-cristobal', 'peravia', 'azua', 'san-jose-de-ocoa'],
  'region-el-valle': ['san-juan', 'elias-pina'],
  'region-enriquillo': ['barahona', 'bahoruco', 'independencia', 'pedernales'],
  este: ['san-pedro-de-macoris', 'hato-mayor', 'monte-plata', 'la-altagracia', 'la-romana', 'el-seibo'],
  higuamo: ['san-pedro-de-macoris', 'hato-mayor', 'monte-plata'],
  'region-yuma': ['la-altagracia', 'la-romana', 'el-seibo'],
};

// Cuántos edificios se dibujan para cada tamaño de empresa.
export const EDIFICIOS_POR_TAMANO = { pequenas: 1, medianas: 2, grandes: 3 };
