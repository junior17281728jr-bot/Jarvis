// OPORTIA: íconos propios de línea (24×24): los de las pantallas y los de los servicios (fase 1, parte d). Solo datos: app.js
// los dibuja con createElementNS. Todo es propio (sin fotos, sin archivos de fuera, sin red).
// 0.8.0: se quitaron los dibujos de los proyectos de OPORTIA (negocios, mapa de provincias, edificios).

// Íconos de línea que usan las pantallas (antes eran de los proyectos de OPORTIA, que se quitaron en la 0.8.0).
export const ICONOS_PROYECTO = {
  buscar: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'M20 20l-4-4' }]],
  candado: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }]],
  estrella: [['path', { d: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z' }]],
  prohibido: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M5.6 5.6l12.8 12.8' }]],
  play: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M10 8.5v7l5.5-3.5z' }]],
  rayo: [['path', { d: 'M13 2L4 14h7l-1 8 9-12h-7z' }]],
  libro: [['path', { d: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z' }], ['path', { d: 'M4 21a2 2 0 0 1 2-2h13v2H6' }], ['path', { d: 'M9 7h6' }]],
  // Un edificio solo (para dibujar 1, 2 o 3 según el tamaño de las empresas).
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
