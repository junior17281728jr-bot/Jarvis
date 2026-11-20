// Academia 0.14.85: lo que el alumno elige en «⚑ Reportar un error» («¿Qué está mal?»), aparte (sin nada que pese) para
// que src/cuentas/soporte.js lo use sin abrir el paquete. Los cuatro primeros son de CONTENIDO: el porqué es obligatorio.
export const QUE_REPORTE = Object.freeze(['respuesta', 'explicacion', 'traduccion', 'imagen', 'no_carga', 'otro']);
export const QUE_CONTENIDO = Object.freeze(['respuesta', 'explicacion', 'traduccion', 'imagen']);
export const TEXTO_QUE = Object.freeze({
  respuesta: 'La respuesta está mal', explicacion: 'La explicación está mal o confusa', traduccion: 'Error de traducción',
  imagen: 'Imagen o animación mal', no_carga: 'No carga / error de la app', otro: 'Otro',
});
export const PORQUE = Object.freeze({ minimo: 10, maximo: 1000 });
// Lo que escribió el alumno, sin correos ni números largos (teléfonos, cédulas): así puede ir a la IA o a «Para Claude».
export function sinDatosPersonales(texto) {
  return String(texto ?? '').replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[número]');
}
