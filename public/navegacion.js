// 0.12.12: que cambiar de pantalla no «se trabe» (lo usa public/app.js; aquí solo lo que se puede probar sin navegador).
//  - queOlvida(ruta): qué deja de valer de lo guardado en memoria después de un cambio (POST). Antes TODO cambio vaciaba
//    la memoria, también el «voy en la tarjeta 7» que la clase anota a cada tarjeta: al tocar la X, Inicio no tenía nada
//    guardado y esperaba al servidor con la clase todavía a la vista (con la red lenta, o el servidor ocupado, parecía que
//    la X no hacía nada).
//  - crearEspera(): si la pantalla nueva tarda más de un instante, una barra arriba («cargando») mientras la vieja sigue.
//  - conTope(): un pedido de lectura que no contesta en un rato se corta (la pantalla dice «sin conexión», no se queda colgada).

// Las señales que la clase y el tutor mandan mientras se estudia (no cambian nada de lo guardado, salvo lo indicado).
const SENALES = /^\/api\/academia\/tutor\/(?:senal|tarjeta)$/;
const PASO = /^\/api\/academia\/temas\/([^/]+)\/([^/]+)\/paso$/;

// → 'todo' (se vacía la memoria, como siempre) o { quitar: [rutas que ya no valen], revisar: [rutas que siguen sirviendo
// para dibujar enseguida pero se vuelven a preguntar al servidor] }.
export function queOlvida(ruta) {
  const camino = String(ruta ?? '').split('?')[0];
  if (SENALES.test(camino)) return { quitar: [], revisar: [] };
  const paso = PASO.exec(camino);
  // La lección guarda dónde quedó (para seguir ahí): esa se pide de nuevo. El camino y el progreso muestran el anillo
  // del tema: se dibujan con lo guardado y se revisan (si cambió, la pantalla se vuelve a dibujar sola).
  if (paso) return { quitar: [`/api/academia/temas/${paso[1]}/${paso[2]}`], revisar: ['/api/academia/camino', '/api/academia/progreso'] };
  return 'todo';
}

// Aplica queOlvida a un Map ruta -> { en } (la memoria de app.js). «revisar» pone en = 0: así se pregunta otra vez.
export function olvidar(memoria, ruta) {
  const que = queOlvida(ruta);
  if (que === 'todo') { memoria.clear(); return; }
  for (const r of que.quitar) memoria.delete(r);
  for (const r of que.revisar) { const g = memoria.get(r); if (g) memoria.set(r, { ...g, en: 0 }); }
}

// La barra de «cargando»: la clase va en el <body> después de retrasoMs (lo que se dibuja enseguida no parpadea) y se
// quita al dibujar. Con un tope: si nada se dibuja (un error que no muestra nada), se quita sola.
export const CLASE_ESPERA = 'cambiando-pantalla';
export function crearEspera(cuerpo, { retrasoMs = 150, topeMs = 30_000, programar = setTimeout, cancelar = clearTimeout } = {}) {
  let reloj = null;
  let tope = null;
  const limpiar = () => {
    if (reloj != null) cancelar(reloj);
    if (tope != null) cancelar(tope);
    reloj = tope = null;
  };
  const terminar = () => {
    limpiar();
    cuerpo.classList.remove(CLASE_ESPERA);
    cuerpo.removeAttribute('aria-busy');
  };
  return {
    // Otro cambio mientras ya se espera: la barra sale a la hora del primero (no se corre); el tope vuelve a empezar.
    empezar() {
      if (tope != null) cancelar(tope);
      if (reloj == null && !cuerpo.classList.contains(CLASE_ESPERA)) {
        reloj = programar(() => { reloj = null; cuerpo.classList.add(CLASE_ESPERA); cuerpo.setAttribute('aria-busy', 'true'); }, retrasoMs);
      }
      tope = programar(terminar, topeMs);
    },
    terminar,
    get esperando() { return reloj != null || cuerpo.classList.contains(CLASE_ESPERA); },
  };
}

// Un AbortSignal que corta el pedido a los ms (con el reloj que se le pase, para las pruebas). soltar() lo apaga.
export function conTope(ms, { programar = setTimeout, cancelar = clearTimeout } = {}) {
  const control = new AbortController();
  const reloj = programar(() => control.abort(), ms);
  return { senal: control.signal, soltar: () => cancelar(reloj) };
}

// 0.14.54: ¿esta dirección lleva el botón flotante «Tu instructor»? Solo las 4 pestañas tal cual (#inicio, #oral,
// #progreso, #repaso; también la portada sin nada): nunca una subpantalla (#oral/vivo, #profesor, #mi-repaso…), una clase
// ni un examen. Antes se miraba la pestaña marcada en el menú, y muchas subpantallas marcan «Camino».
const RUTAS_INSTRUCTOR = new Set(['', 'inicio', 'oral', 'progreso', 'repaso']);
export function rutaConInstructor(hash) {
  return RUTAS_INSTRUCTOR.has(String(hash ?? '').replace(/^#/, '').replace(/\/+$/, ''));
}

// ---------- 0.14.56: el mapa del Administrador ----------
// Antes: 28 pestañas en 4 grupos y 6 pantallas sin pestaña. Ahora 6 entradas, con pocas sub-pestañas cada una:
//  - Inicio («Para hoy»: solo lo que pide algo, con su botón), Alumnos (una lista y la ficha de cada uno), Mensajes (una
//    bandeja: ayuda, reportes y opiniones), Dinero (el único tope del mes, los pagos y el servidor), Contenido (paquetes,
//    ajustes del curso, términos, videos, competencia, respuestas) y Avanzado (lo técnico, en una lista).
// Cada pantalla de antes sigue en su misma dirección (nada se pierde y los enlaces de los avisos siguen sirviendo); solo
// cambia en qué entrada está. Las direcciones que ya no tienen pantalla propia llevan a su lugar nuevo (REDIRECCIONES_ADMIN).
export const AREAS_ADMIN = Object.freeze([
  { id: 'inicio', href: '#admin', clave: 'admin.area.inicio', icono: 'casa', sub: [] },
  { id: 'alumnos', href: '#alumnos', clave: 'admin.area.alumnos', icono: 'personas', sub: [
    { id: 'alumnos', href: '#alumnos', clave: 'admin.sub.lista', icono: 'personas' },
    { id: 'como-van', href: '#como-van', clave: 'admin.pestana.como_van', icono: 'medalla' },
    // 0.14.71: «Notas por materia» (el total de cada materia y si la completó) ocupa el lugar de «Notas»: las notas por tema
    // y cada intento (#notas…) siguen en su dirección, con un botón desde aquí (y desde la lista y «Cómo van todos»).
    { id: 'notas-materia', href: '#notas-materia', clave: 'admin.sub.notas_materia', icono: 'marca' },
  ] },
  { id: 'mensajes', href: '#mensajes', clave: 'admin.area.mensajes', icono: 'chispa', sub: [
    { id: 'mensajes', href: '#mensajes', clave: 'admin.sub.por_responder', icono: 'campana' },
    { id: 'soporte', href: '#soporte', clave: 'admin.pestana.soporte', icono: 'chispa' },
    { id: 'reportes', href: '#reportes', clave: 'admin.pestana.reportes', icono: 'atencion' },
    { id: 'opiniones', href: '#opiniones', clave: 'admin.pestana.opiniones', icono: 'chispa' },
  ] },
  { id: 'dinero', href: '#dinero', clave: 'admin.area.dinero', icono: 'dinero', sub: [
    { id: 'dinero', href: '#dinero', clave: 'admin.sub.ia_dinero', icono: 'dinero' },
    { id: 'pagos', href: '#pagos', clave: 'admin.pestana.pagos', icono: 'recibo' },
    { id: 'pago-servidor', href: '#pago-servidor', clave: 'admin.pestana.pago_servidor', icono: 'servidor' },
  ] },
  { id: 'contenido', href: '#contenido', clave: 'admin.area.contenido', icono: 'libro', sub: [
    { id: 'contenido', href: '#contenido', clave: 'admin.pestana.paquetes', icono: 'carpeta' },
    { id: 'ajustes', href: '#contenido/ajustes', clave: 'admin.sub.ajustes', icono: 'ajustes' },
    { id: 'terminos', href: '#contenido/terminos', clave: 'admin.pestana.terminos', icono: 'manual' },
    { id: 'videos', href: '#contenido/videos', clave: 'admin.pestana.videos', icono: 'video' },
    { id: 'competencia', href: '#competencia/admin', clave: 'admin.sub.competencia', icono: 'trofeo' },
    { id: 'respuestas', href: '#respuestas', clave: 'admin.pestana.respuestas', icono: 'marca' },
  ] },
  { id: 'avanzado', href: '#avanzado', clave: 'admin.area.avanzado', icono: 'ajustes', sub: [] },
]);
// Lo de Avanzado: una lista (no una fila de pestañas), en grupos con una línea que dice para qué sirve cada cosa.
export const AVANZADO_ADMIN = Object.freeze([
  { grupo: 'ia', items: [
    { id: 'claves', href: '#claves', clave: 'admin.pestana.claude_api', icono: 'llave' },
    { id: 'ia', href: '#ia', clave: 'admin.pestana.ia', icono: 'chispa' },
    { id: 'fabrica', href: '#contenido/fabrica', clave: 'admin.pestana.fabrica', icono: 'chispa' },
    { id: 'ia-hizo', href: '#contenido/ia-hizo', clave: 'admin.pestana.ia_hizo', icono: 'manual' },
    { id: 'pidele', href: '#contenido/pidele', clave: 'admin.pestana.pidele', icono: 'chispa' },
    { id: 'app-mejora', href: '#contenido/app', clave: 'admin.pestana.app_mejora', icono: 'chispa' },
    { id: 'ia-registro', href: '#ia-registro', clave: 'admin.pestana.ia_registro', icono: 'manual' },
    { id: 'ia-demo', href: '#ia-demo', clave: 'admin.pestana.ia_demo', icono: 'ojo' },
  ] },
  { grupo: 'sistema', items: [
    { id: 'estado', href: '#admin/estado', clave: 'admin.pestana.estado', icono: 'escudo' },
    { id: 'copias', href: '#copias', clave: 'admin.pestana.copias', icono: 'copia' },
    { id: 'trabajo', href: '#admin/trabajo', clave: 'admin.pestana.trabajo', icono: 'latido' },
    { id: 'servidor', href: '#admin/servidor', clave: 'admin.pestana.servidor', icono: 'servidor' },
    { id: 'cambios', href: '#admin/cambios', clave: 'admin.pestana.cambios', icono: 'escudo' },
  ] },
  { grupo: 'alumnos', items: [
    { id: 'usuarios', href: '#admin/usuarios', clave: 'admin.pestana.usuarios', icono: 'personas' },
    { id: 'aprendizaje', href: '#aprendizaje', clave: 'admin.pestana.aprendizaje', icono: 'grafica' },
    { id: 'ia-alumnos', href: '#ia-alumnos', clave: 'admin.pestana.ia_alumnos', icono: 'dinero' },
  ] },
]);
// En qué entrada está cada pantalla (el nombre que cada pantalla le pasa a la cabecera). Lo que no está aquí ni en las
// sub-pestañas es de Avanzado.
// «Usuarios» (crear un alumno, todas las cuentas) está también en la lista de Avanzado, pero se marca Alumnos: «Crear
// alumno» es de todos los días.
const AREA_DE = Object.freeze({ resumen: 'inicio', inicio: 'inicio', reporte: 'alumnos', contratos: 'alumnos', ficha: 'alumnos', comparar: 'alumnos', usuarios: 'alumnos', notas: 'alumnos' });
export function areaAdmin(actual) {
  if (Object.hasOwn(AREA_DE, actual)) return AREAS_ADMIN.find(a => a.id === AREA_DE[actual]);
  return AREAS_ADMIN.find(a => a.id === actual || a.sub.some(x => x.id === actual)) ?? AREAS_ADMIN.find(a => a.id === 'avanzado');
}
// La pantalla de Avanzado que se está viendo (para el «← Avanzado» y su nombre), o null.
export function itemAvanzado(actual) {
  for (const g of AVANZADO_ADMIN) for (const x of g.items) if (x.id === actual) return x;
  return null;
}
// Las direcciones viejas (de grupos, de pestañas bajo #admin/… y de la 0.14.54) → su lugar en el mapa nuevo. Exactas:
// ninguna lleva a otra que también se redirija (no hay saltos en cadena).
export const REDIRECCIONES_ADMIN = Object.freeze({
  'admin/alumnos': '#alumnos', 'admin/como-van': '#como-van', 'admin/contenido': '#contenido', 'admin/dinero': '#dinero', 'claude': '#claves', 'admin/claude': '#claves', 'api': '#claves',
  'admin/sistema': '#avanzado', 'admin/avanzado': '#avanzado', 'admin/inicio': '#admin', 'admin/mensajes': '#mensajes', 'admin/respuestas': '#respuestas', 'admin/aprendizaje': '#aprendizaje',
  'admin/soporte': '#soporte', 'admin/ayuda': '#soporte', 'admin/reportes': '#reportes', 'admin/opiniones': '#opiniones', 'admin/notas': '#notas',
  'admin/paquetes': '#contenido', 'admin/terminos': '#contenido/terminos', 'admin/videos': '#contenido/videos', 'contenido/paquetes': '#contenido', 'admin/ajustes': '#contenido/ajustes',
  'admin/competencia': '#competencia/admin', 'admin/pagos': '#pagos', 'admin/ia': '#ia', 'admin/claves': '#claves', 'admin/telegram': '#claves', 'admin/copias': '#copias', 'admin/resumen': '#admin',
  'terminos-admin': '#contenido/terminos', 'videos': '#contenido/videos', 'cambios': '#admin/cambios', 'mensajes/ayuda': '#soporte', 'ayuda-admin': '#soporte',
  'admin/pago-servidor': '#pago-servidor', 'admin/pago': '#pago-servidor', 'pago': '#pago-servidor', // 0.14.1
  'admin/certificados': '#certificados/todos', 'certificados/admin': '#certificados/todos', 'certificados/alumno': '#certificados/todos', // 0.14.72
  'admin/fabrica': '#contenido/fabrica', 'admin/ia-demo': '#ia-demo', 'admin/ia-alumnos': '#ia-alumnos', 'admin/ia-registro': '#ia-registro', 'admin/dinero-ia': '#dinero', 'dinero-ia': '#dinero',
});

// ---------- 0.14.56: «Para hoy» (Inicio del Administrador) ----------
// Solo lo que pide algo, cada cosa con su botón que lleva ahí. Sin nada pendiente: una lista vacía («Todo en orden»).
// datos: { sistema (GET /api/admin/sistema), copiasTono (el color del azulejo de Copias), pagosPendientes, pagoServidor (GET /api/admin/servidor-pago), dinero
// (GET /api/admin/ia/dinero?corto=1) }; cualquiera puede faltar. → [{ id, tono, clave, n?, vars?, href, aviso? }]
// en el orden en que conviene atenderlo (lo rojo primero).
const ORDEN_TONO = { mal: 0, atencion: 1, info: 2 };
const SEMANA_MS = 7 * 24 * 3_600_000;
export const MINIMO_RESPUESTAS_HOY = 10;
export function paraHoy({ sistema = null, copiasTono = null, pagosPendientes = 0, pagoServidor = null, dinero = null, alumnos = null, ahora = Date.now() } = {}) {
  const lista = [];
  const s = sistema ?? {};
  const ayuda = Number(s.soporte?.pendientes ?? 0);
  const reportes = Number(s.soporte?.reportes ?? 0);
  if (ayuda > 0) lista.push({ id: 'ayuda', tono: 'atencion', clave: 'hoy.ayuda', n: ayuda, href: '#mensajes' });
  if (reportes > 0) lista.push({ id: 'reportes', tono: 'atencion', clave: 'hoy.reportes', n: reportes, href: '#reportes' });
  if (Number(pagosPendientes) > 0) lista.push({ id: 'pagos', tono: 'atencion', clave: 'hoy.pagos', n: Number(pagosPendientes), href: '#pagos' });
  // Las copias (el mismo color del azulejo de Copias: rojo = sin copias fuera o fallando; amarillo = solo en el servidor).
  if (copiasTono === 'mal') lista.push({ id: 'copias', tono: 'mal', clave: 'hoy.copias', href: '#copias' });
  else if (copiasTono === 'atencion') lista.push({ id: 'copias', tono: 'atencion', clave: 'hoy.copias_vieja', href: '#copias' });
  // El servidor: si está en rojo o amarillo.
  const semaforo = s.salud?.semaforo;
  if (semaforo === 'rojo') lista.push({ id: 'servidor', tono: 'mal', clave: 'hoy.servidor_mal', href: '#admin/servidor' });
  else if (semaforo === 'amarillo') lista.push({ id: 'servidor', tono: 'atencion', clave: 'hoy.servidor_atencion', href: '#admin/servidor' });
  if (s.modoSeguro?.activo) lista.push({ id: 'modo-seguro', tono: 'mal', clave: 'hoy.en_pausa', href: '#admin/trabajo' });
  // La cuenta del servidor: vence pronto o ya venció (lo mismo que avisa la pantalla «Pago del servidor»).
  const p = pagoServidor ?? null;
  if (p?.pago?.configurado && p.proximo && p.proximo.tono && p.proximo.tono !== 'bien') {
    const dias = Number(p.proximo.dias);
    const clave = dias < 0 ? 'hoy.servidor_pago_vencido' : dias === 0 ? 'hoy.servidor_pago_hoy' : 'hoy.servidor_pago';
    lista.push({ id: 'pago-servidor', tono: p.proximo.tono === 'mal' ? 'mal' : 'atencion', clave, ...(dias === 0 ? {} : { n: Number.isFinite(dias) ? Math.abs(dias) : 0 }), href: '#pago-servidor' });
  }
  // El dinero de la IA: el tope del mes lleno, o a punto (cuando ya se gastó algo).
  const general = (dinero?.topes ?? []).find(x => x.id === 'general');
  if (general && general.topeMicro > 0 && general.pct >= 100) lista.push({ id: 'dinero', tono: 'mal', clave: 'hoy.dinero_lleno', href: '#dinero' });
  else if (general && general.topeMicro > 0 && general.pct >= 80) lista.push({ id: 'dinero', tono: 'atencion', clave: 'hoy.dinero_casi', vars: { pct: general.pct }, href: '#dinero' });
  // Los alumnos que necesitan una mano: más de una semana sin estudiar (habiendo empezado), o que fallan más de la mitad
  // (con al menos 10 respuestas, para no juzgar por 2). Uno solo: el botón abre su ficha.
  const suyos = (alumnos ?? []).filter(a => a.rol !== 'admin' && a.activo !== false);
  const quietos = suyos.filter(a => !a.enLinea && a.ultimaActividad && ahora - Date.parse(a.ultimaActividad) > SEMANA_MS);
  if (quietos.length) lista.push({ id: 'sin-estudiar', tono: 'info', clave: 'hoy.sin_estudiar', n: quietos.length, vars: { nombre: quietos[0].nombreVisible || quietos[0].nombre }, href: quietos.length === 1 ? `#alumno/${quietos[0].id}` : '#como-van' });
  const cuesta = suyos.filter(a => (a.respuestas ?? 0) >= MINIMO_RESPUESTAS_HOY && a.pct != null && a.pct < 50);
  if (cuesta.length) lista.push({ id: 'les-cuesta', tono: 'info', clave: 'hoy.les_cuesta', n: cuesta.length, vars: { nombre: cuesta[0].nombreVisible || cuesta[0].nombre }, href: cuesta.length === 1 ? `#alumno/${cuesta[0].id}` : '#alumnos' });
  // Los avisos sin «Entendido» que piden algo (grave o atención), cada uno con su botón; los que ya salen arriba no se
  // repiten. Los que solo informan (el resumen del día…) van en UNA línea «N avisos más» → Estado del sistema.
  let soloInforman = 0;
  for (const a of s.avisos?.abiertos ?? []) {
    if (a.vistoEn) continue;
    if (/^reporte_error:/.test(String(a.clave ?? '')) && reportes > 0) continue;
    if (/^pago_recibido:/.test(String(a.clave ?? '')) && Number(pagosPendientes) > 0) continue;
    if (a.nivel !== 'grave' && a.nivel !== 'atencion') { soloInforman++; continue; }
    lista.push({ id: `aviso-${a.id}`, tono: a.nivel === 'grave' ? 'mal' : 'atencion', aviso: a });
  }
  if (soloInforman) lista.push({ id: 'avisos-mas', tono: 'info', clave: 'hoy.avisos_mas', n: soloInforman, href: '#admin/estado' });
  return lista.map((x, i) => ({ x, i })).sort((a, b) => (ORDEN_TONO[a.x.tono] ?? 3) - (ORDEN_TONO[b.x.tono] ?? 3) || a.i - b.i).map(({ x }) => x);
}
