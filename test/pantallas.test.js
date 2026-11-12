// Pruebas de las pantallas: archivos servidos con seguridad, español e inglés completos y código seguro.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { RESUMEN_FIRMA, PASOS_FIRMA } from '../public/terminos-vista.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const appJs = readFileSync(join(RAIZ, 'public/app.js'), 'utf8');

function archivosDe(carpeta, filtro) {
  const lista = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) lista.push(...archivosDe(ruta, filtro));
    else if (filtro(ruta)) lista.push(ruta);
  }
  return lista;
}

test('las pantallas se sirven con su tipo y con cabeceras de seguridad', async () => {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    for (const [ruta, tipo] of [['/', /text\/html/], ['/app.js', /javascript/], ['/estilos.css', /text\/css/], ['/i18n/es.json', /json/], ['/icono.svg', /svg/], ['/icono-180.png', /image\/png/]]) {
      const r = await fetch(`${base}${ruta}`);
      assert.equal(r.status, 200, ruta);
      assert.match(r.headers.get('content-type'), tipo, ruta);
      assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/, `${ruta} sin política de seguridad`);
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
    }
    const ruta = await fetch(`${base}/configuracion`);
    assert.equal(ruta.status, 200, 'una ruta de la app muestra la app');
  });
  db.close();
});

test('no se puede salir de la carpeta de pantallas para leer otros archivos', async () => {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    for (const ruta of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/i18n/../../src/app.js', '/.env', '/%2e%2e/%2e%2e/etc/passwd']) {
      const r = await fetch(`${base}${ruta}`);
      const cuerpo = await r.text();
      assert.ok(!cuerpo.includes('"name": "oportia"') && !cuerpo.includes('crearServidor') && !cuerpo.includes('root:'), `${ruta} dejó ver un archivo`);
    }
  });
  db.close();
});

test('español e inglés tienen exactamente las mismas frases', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const [clave, valor] of Object.entries(es)) {
    const variables = texto => [...texto.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(variables(en[clave]), variables(valor), `variables distintas en ${clave}`);
    assert.ok(valor.trim() && en[clave].trim(), `frase vacía: ${clave}`);
  }
});

test('toda frase que usan las pantallas existe en los dos idiomas', () => {
  for (const m of appJs.matchAll(/\b(?:t|tn)\('([a-z0-9_.]+)'/g)) assert.ok(m[1] in es, `falta la frase ${m[1]}`);
  // tn(…) elige la frase en singular («.uno») cuando el número es 1: tiene que existir.
  for (const m of appJs.matchAll(/\btn\('([a-z0-9_.]+)'/g)) assert.ok(`${m[1]}.uno` in es, `falta la frase ${m[1]}.uno`);
  for (const m of appJs.matchAll(/texto: t\(u\.[a-z]+ \? '([a-z0-9_.]+)' : '([a-z0-9_.]+)'/g)) {
    assert.ok(m[1] in es && m[2] in es, `falta ${m[1]} o ${m[2]}`);
  }
});

test('en español una hora nunca va pegada a un punto final («p. m..»): la hora ya termina en punto', () => {
  // es-DO escribe «8:47 p. m.»: una frase que termina en «{hora}.» o «{fecha}.» mostraría «p. m..».
  for (const [clave, valor] of Object.entries(es)) assert.doesNotMatch(valor, /\{(hora|fecha|desde|ultima)\}\./, clave);
  const hora = new Intl.DateTimeFormat('es-DO', { timeStyle: 'short', timeZone: 'America/Santo_Domingo' }).format(new Date('2026-11-05T01:00:00Z'));
  assert.match(hora, /m\.$/, 'si un día la hora deja de terminar en punto, esta prueba se puede relajar');
});

test('con 1 se dice en singular: «1 paso», «1 archivo», «1 tarea»', () => {
  for (const clave of ['tareas.pasos', 'servidor.copias', 'aviso.tareas_fallidas', 'aviso.tareas_revisar', 'tiempo.hace_d']) {
    for (const [nombre, idioma] of [['es', es], ['en', en]]) {
      const uno = idioma[`${clave}.uno`];
      assert.ok(uno, `falta ${clave}.uno en ${nombre}`);
      assert.match(uno, /\b1\b/, `${clave}.uno (${nombre})`);
      assert.doesNotMatch(uno, /\b1 (pasos|archivos|tareas|días|steps|files|tasks|days)\b/, `${clave}.uno (${nombre})`);
    }
  }
});

test('todo error que puede dar el servidor tiene su explicación en los dos idiomas', () => {
  const claves = new Set();
  for (const archivo of archivosDe(join(RAIZ, 'src'), r => r.endsWith('.js'))) {
    const codigo = readFileSync(archivo, 'utf8');
    for (const m of codigo.matchAll(/new ErrorHttp\(\d+, '([a-z_]+)'/g)) claves.add(m[1]);
    for (const m of codigo.matchAll(/\{ error: '([a-z_]+)' \}/g)) claves.add(m[1]);
  }
  assert.ok(claves.size > 10);
  for (const clave of claves) assert.ok(`error.${clave}` in es && `error.${clave}` in en, `falta error.${clave}`);
});

test('las pantallas nunca convierten texto en código (sin innerHTML, eval ni scripts incrustados)', () => {
  for (const archivo of readdirSync(join(RAIZ, 'public')).filter(n => n.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(join(RAIZ, 'public', archivo), 'utf8'), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, archivo);
  }
  const html = readFileSync(join(RAIZ, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'hay un script incrustado');
  assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=/i, 'hay estilos o eventos incrustados');
});

test('las frases que las pantallas arman por partes (estados, capacidades, historial…) existen en los dos idiomas', async () => {
  const { PLANES } = await import('../src/cuentas/planes.js');
  // Fase 1, parte c: la zona de sistema de Administrador.
  const { FASES_TRABAJADOR } = await import('../src/tareas/supervisor.js');
  const { ESTADOS_TAREA, EVENTOS } = await import('../src/tareas/cola.js');
  const { TIPOS: TIPOS_TAREA, COMO_TERMINA } = await import('../src/tareas/tipos.js');
  const { MOTIVOS_MODO_SEGURO, QUIEN_QUITA } = await import('../src/tareas/modo-seguro.js');
  const { CLAVES_AVISO, NIVELES } = await import('../src/avisos/avisos.js');
  // Fase 1, parte d: la IA opcional y las Claves.
  const { MOTIVOS, PROPOSITOS, ESTADOS_LLAMADA } = await import('../src/ia/propositos.js');
  const { PROVEEDORES } = await import('../src/ia/proveedores/index.js');
  const { USOS, GRUPOS, ESTADOS_SECRETO } = await import('../src/claves/usos.js');
  // Ronda 5 de revisión: el permiso de IA de cada cuenta (Administrador → Usuarios).
  const { ACCIONES_CONFIANZA, DESDE } = await import('../src/cuentas/confianza.js');
  // Fase 1, parte e: las copias y el Telegram.
  const { MOTIVOS_COPIA, NO_CLAVE } = await import('../public/copias-vista.js');
  const { ESTADOS_COPIA } = await import('../src/copias/formato.js');
  // 0.12.3: cada cambio delicado del administrador (aviso y «Cambios importantes»).
  const { ACCIONES_ADMIN } = await import('../src/cuentas/confirmar.js');
  // Academia (0.7.0).
  const { MATERIAS } = await import('../src/academia/formato.js');
  const { ESTADOS_PAQUETE } = await import('../src/academia/paquetes.js');
  const formatoAcademia = readFileSync(join(RAIZ, 'src/academia/formato.js'), 'utf8');
  const MOTIVOS_PAQUETE = [...new Set([...formatoAcademia.matchAll(/(?:mal\([^,]+, |motivo: )'([a-z_]+)'/g)].map(m => m[1])), 'json_no_valido'];
  // 0.7.1: cada motivo de la carpeta de Google Drive (src/academia/drive.js y la tarea que la revisa).
  const textoDrive = ['drive.js', 'sincronizar.js', 'importador.js'].map(f => readFileSync(join(RAIZ, 'src/academia', f), 'utf8')).join('\n');
  const MOTIVOS_DRIVE = [...new Set([...textoDrive.matchAll(/(?:motivo: |error\([^,]+, |ultimo = )'([a-z_]+)'/g)].map(m => m[1]))];
  assert.ok(MOTIVOS_DRIVE.length > 15, `motivos de Drive: ${MOTIVOS_DRIVE.length}`);
  assert.ok(MOTIVOS_PAQUETE.length > 20, `motivos del paquete: ${MOTIVOS_PAQUETE.length}`);
  const claves = [
    ...MOTIVOS.map(x => `ia.motivo.${x}`),
    ...Object.keys(PROPOSITOS).map(x => `ia.proposito.${x}`),
    ...Object.keys(PROVEEDORES).map(x => `ia.proveedor.${x}`),
    ...ESTADOS_LLAMADA.map(x => `ia.estado_llamada.${x}`),
    ...['general', 'e', 'p'].map(x => `ia.ambito.${x}`),
    ...['clave', 'tope', 'precio', 'encendida', 'listo', 'pendiente'].map(x => `ia.falta.${x}`),
    ...PLANES.map(x => `ia.plan.${x}`),
    ...['encendida', 'apagada'].map(x => `ia.ayuda.${x}`),
    ...['apagada', 'encendida', 'sin_uso', 'tope_lleno'].map(x => `ia.estado.${x}`),
    ...Object.keys(USOS).flatMap(x => [`claves.uso.${x}`, `claves.donde.${x}`, `claves.corto.${x}`]),
    ...GRUPOS.map(x => `claves.grupo.${x}`),
    ...[...ESTADOS_SECRETO, 'ninguna', 'pausada', 'no_pasa', 'ilegible'].map(x => `claves.estado.${x}`),
    ...ACCIONES_CONFIANZA.map(x => `admin.ia.accion.${x}`),
    ...DESDE.map(x => `admin.ia.desde.${x}`),
    'historial.version_nueva.ia', 'aviso.ia_tope', 'aviso.ia_tope.lleno', 'aviso.ia_proveedor', 'aviso.ia_proveedor.admin',
    ...PLANES.map(x => `plan.${x}`),
    'aviso.clave_reiniciada',
    ...[...FASES_TRABAJADOR, 'sin_supervisor'].map(x => `tareas.fase.${x}`),
    ...ESTADOS_TAREA.map(x => `tareas.estado.${x}`),
    ...Object.keys(TIPOS_TAREA).map(x => `tareas.tipo.${x}`),
    ...EVENTOS.map(x => `tareas.evento.${x}`),
    ...COMO_TERMINA.map(x => `tareas.como.${x}`),
    ...['poca_memoria', 'poco_disco'].map(x => `tareas.freno.${x}`),
    ...['tiempo_agotado', 'respuesta_no_valida', 'resultado_muy_grande', 'memoria', 'apagado', 'arriendo_vencido', 'sin_dueno', 'trabajador', 'no_se_pudo_guardar'].map(x => `tareas.motivo.${x}`),
    ...MOTIVOS_MODO_SEGURO.map(x => `modo_seguro.motivo.${x}`),
    ...QUIEN_QUITA.map(x => `modo_seguro.quitado.${x}`),
    ...CLAVES_AVISO.map(x => `aviso.${x}`),
    'aviso.freno',
    ...NIVELES.map(x => `aviso.nivel.${x}`),
    ...['verde', 'amarillo', 'rojo'].flatMap(x => [`sistema.semaforo.${x}`, `servidor.semaforo.${x}`]),
    'error.ya_hay_otra_en_marcha', 'error.arrancando',
    ...MOTIVOS_COPIA.map(x => `copias.motivo.${x}`),
    ...ESTADOS_COPIA.map(x => `copias.estado_fila.${x}`),
    ...NO_CLAVE.map(x => `copias.clave.no_puede.${x}`),
    ...['en_marcha', 'modo_seguro', 'sin_clave', 'sin_trabajador', 'disco_lleno', 'sin_destino'].map(x => `copias.no_ahora.${x}`),
    ...['bloqueado', 'perdido', 'clave_no_valida', 'sin_token', 'sin_probar', 'bot_ocupado', 'sin_red', 'pausa', 'bot_cambiado'].map(x => `telegram.problema.${x}`),
    'copias.aqui.anterior', 'aviso.copias_locales_pausadas.escribir', 'telegram.aviso.copias_locales_pausadas.escribir', 'ia.motivo.bot_cambiado', 'ia.motivo.sin_probar',
    ...[1, 2, 3, 4, 5, 6].map(n => `copias.restaurar.paso${n}`),
    ...[1, 2, 3, 4].map(n => `telegram.como${n}`),
    // Academia (0.7.0): las 11 materias, cada motivo de un paquete mal armado y cada estado de una versión.
    ...MATERIAS.map(x => `acad.materia.${x}`),
    ...MOTIVOS_PAQUETE.map(x => `acad.motivo.${x}`),
    ...ESTADOS_PAQUETE.map(x => `acad.paquete.estado.${x}`),
    ...MOTIVOS_DRIVE.map(x => `acad.drive.motivo.${x}`),
    // Academia (0.12.0): los niveles de lo extra y el modo de práctica por defecto.
    ...['basico', 'intermedio', 'avanzado'].map(x => `extra.nivel.${x}`),
    ...['original', 'reto'].map(x => `acad.modo.${x}`),
    // 0.12.1: firmar por pasos y «Lo importante en 1 minuto».
    ...RESUMEN_FIRMA.flatMap(x => [`lee.resumen.${x}`, `lee.resumen.${x}.texto`]),
    ...PASOS_FIRMA.flatMap(x => [`firma.paso.${x}`, `firma.${x}.titulo`, `firma.${x}.linea`]),
    ...PASOS_FIRMA.filter(x => x !== 'listo').map(x => `firma.${x}.despues`),
    // 0.12.2: el avance de cada nodo del Camino.
    ...['nuevo', 'empezado', 'terminado', 'dominado'].map(x => `camino.nivel.${x}`),
    // 0.12.3.
    ...ACCIONES_ADMIN.map(x => `admin.cambio.${x}`),
    ...['ia_apagada', 'sin_presupuesto', 'cuenta_sin_permiso', 'sin_consentimiento'].map(x => `pagos.admin.falta.${x}`),
    ...['formato', 'repetido', 'demasiados'].map(x => `pagos.paquetes.error.${x}`),
  ];
  for (const clave of claves) assert.ok(clave in es && clave in en, `falta la frase ${clave}`);
  // Y en el código, cada frase armada por partes usa uno de esos prefijos conocidos.
  const prefijos = new Set(claves.map(c => c.slice(0, c.lastIndexOf('.') + 1)).concat(['estado.', 'tipo.', 'idioma.', 'error.', 'faltante.', 'campo.producto.', 'capacidad.', 'proyecto.aviso_espera.', 'historial.', 'version.estado.', 'version.origen.', 'supuesto.', 'autonomia.', 'plan.',
    'creador.falta.', 'creador.fuera.', 'tareas.fase.', 'tareas.estado.', 'tareas.tipo.', 'tareas.motivo.', 'tareas.evento.', 'tareas.como.', 'tareas.freno.', 'modo_seguro.motivo.', 'modo_seguro.quitado.', 'aviso.', 'aviso.nivel.', 'sistema.semaforo.', 'servidor.semaforo.',
    // Fase 1, parte d.
    'ia.motivo.', 'ia.proposito.', 'ia.proveedor.', 'ia.estado.', 'ia.estado_llamada.', 'ia.ambito.', 'ia.falta.', 'ia.plan.', 'ia.ayuda.',
    'claves.uso.', 'claves.donde.', 'claves.estado.', 'claves.grupo.', 'claves.corto.', 'version.campo_ia.',
    // Fase 1, parte e.
    'copias.motivo.', 'copias.estado_fila.', 'copias.restaurar.paso', 'telegram.como', 'telegram.problema.',
    // Claridad (0.5.1): las explicaciones de la Ayuda y los pasos de la guía (sus frases se revisan más abajo, en «claridad: …»).
    'ayuda.', 'guia.paso.',
    // Academia (0.7.0).
    'acad.materia.', 'acad.motivo.', 'acad.paquete.estado.',
    // Academia (0.7.1).
    'acad.drive.motivo.',
    // Academia (0.12.0).
    'extra.nivel.', 'acad.modo.',
    // 0.12.1.
    'lee.resumen.', 'firma.paso.', 'firma.',
    // 0.12.2.
    'camino.nivel.',
    // 0.12.3.
    'admin.cambio.']));
  // tSi(…) es t(…) con un respaldo (para valores de una versión más nueva): también se revisa.
  for (const m of appJs.matchAll(/\b(?:t|tSi)\(`([a-z0-9_.]+)\$\{/g)) assert.ok(prefijos.has(m[1]), `frase armada sin revisar: ${m[1]}…`);
});

test('los mensajes que dicen un número de tope usan el número que de verdad tiene el servidor', async () => {
  const { LIMITE_POR_PLAN } = await import('../src/cuentas/planes.js');
  for (const [plan, n] of Object.entries(LIMITE_POR_PLAN)) for (const idioma of [es, en]) assert.match(idioma[`plan.${plan}`], new RegExp(`\\b${n}\\b`), `plan.${plan}`);
});

// ---------- Fase 1, parte d: las pantallas de la IA opcional y de Claves ----------

const iaVistaJs = readFileSync(join(RAIZ, 'public/ia-vista.js'), 'utf8');
// Un trozo de app.js: desde una línea que empieza con «desde» hasta la siguiente sección («// ---------- »).
function seccionDe(texto, desde) {
  const inicio = texto.indexOf(desde);
  assert.ok(inicio >= 0, `no encontré ${desde}`);
  const fin = texto.indexOf('\n// ---------- ', inicio + desde.length);
  return texto.slice(inicio, fin < 0 ? texto.length : fin);
}

test('27. «Usar …» de un proveedor solo existe con su precio confirmado (con la respuesta real del servidor: ChatGPT sin precio)', async () => {
  const { controlesProveedores } = await import('../public/ia-vista.js');
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const dueno = { 'Tailscale-User-Login': 'junior@example.com', 'X-Oportia': '1', 'Content-Type': 'application/json' };
    const creado = await fetch(`${base}/api/primer-admin`, { method: 'POST', headers: dueno, body: JSON.stringify({ nombre: 'junior', clave: 'una clave bien larga' }) });
    assert.equal(creado.status, 201);
    const galleta = creado.headers.get('set-cookie').split(';')[0];
    const r = await fetch(`${base}/api/admin/ia`, { headers: { ...dueno, Cookie: galleta } });
    assert.equal(r.status, 200);
    const s = await r.json();
    assert.equal(s.encendida, false, 'la IA llega apagada');
    assert.equal(s.topeGeneralMicro, 0, 'y con tope US$0');
    const porId = Object.fromEntries(controlesProveedores(s.proveedores).map(c => [c.id, c]));
    assert.equal(s.proveedores.find(p => p.id === 'openai').precio?.confirmado, false, 'el precio de ChatGPT sigue sin confirmar');
    assert.deepEqual([porId.openai.conInterruptor, porId.openai.etiqueta, porId.openai.estado], [false, null, 'sin_precio'], 'sin precio no hay interruptor para ChatGPT');
    assert.deepEqual([porId.anthropic.conInterruptor, porId.anthropic.etiqueta], [true, 'ia.proveedor.usar']);
    // 0.12.3: por el enlace público, el administrador con su sesión ve lo mismo (los mismos controles).
    const publico = await (await fetch(`${base}/api/admin/ia`, { headers: { 'Tailscale-Funnel-Request': '?1', Cookie: galleta } })).json();
    assert.equal(publico.esDueno, true);
    assert.deepEqual(controlesProveedores(publico.proveedores), controlesProveedores(s.proveedores));
  });
  db.close();
  // Con los dos precios confirmados, el segundo dice que solo se usa cuando el primero no está.
  const claude = { id: 'anthropic', usar: true, usable: true, motivo: null, precio: { confirmado: true } };
  const chatgpt = { id: 'openai', usar: false, usable: false, motivo: 'proveedor_no_usado', precio: { confirmado: true } };
  assert.deepEqual(controlesProveedores([claude, chatgpt]).map(c => c.etiqueta), ['ia.proveedor.usar', 'ia.proveedor.segundo']);
  assert.deepEqual(controlesProveedores([claude, { ...chatgpt, precio: null }]).map(c => c.conInterruptor), [true, false]);
  assert.deepEqual(controlesProveedores([{ ...claude, precio: { confirmado: false }, usable: false, motivo: 'precio_sin_confirmar' }]).map(c => [c.conInterruptor, c.estado]), [[false, 'sin_precio']]);
  // app.js dibuja el interruptor de un proveedor solo cuando la decisión lo dice, y nunca escribe «segundo» por su cuenta.
  const proveedoresJs = appJs.slice(appJs.indexOf('controlesProveedores(proveedores).map'), appJs.indexOf('// ---- 6.'));
  assert.match(proveedoresJs, /c\.conInterruptor \? interruptor\(/);
  assert.equal((appJs.match(/interruptor\(/g) ?? []).length, 2, 'el interruptor solo se crea en su función y en la tarjeta de proveedores');
  for (const clave of ['ia.proveedor.usar', 'ia.proveedor.segundo']) assert.ok(clave in es && clave in en && iaVistaJs.includes(`'${clave}'`), clave);
});

test('27. el cuadro para pegar una clave es una línea de texto tapada (nunca un campo de contraseña), sin autocompletar ni corrector', async () => {
  const { ATRIBUTOS_CAMPO_CLAVE } = await import('../public/ia-vista.js');
  for (const [atributo, valor] of Object.entries({ autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'data-1p-ignore': 'true' })) {
    assert.equal(ATRIBUTOS_CAMPO_CLAVE[atributo], valor, atributo);
  }
  assert.equal(ATRIBUTOS_CAMPO_CLAVE.type, undefined, 'un textarea no lleva type');
  const claves = seccionDe(appJs, '// ---- #claves:');
  assert.match(claves, /el\('textarea', \{ \.\.\.ATRIBUTOS_CAMPO_CLAVE/);
  assert.doesNotMatch(claves, /password/, 'en Claves no hay ningún campo de contraseña');
  // El único input de Claves (ronda 3): el segundo código de 6 cifras que el bot le manda al chat (números, de un uso).
  assert.deepEqual([...claves.matchAll(/el\('input', \{[^}]*\}/g)].map(m => m[0]), ["el('input', { id, name: 'codigo', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 9, required: true, class: 'codigo-campo' }"]);
  // Se vacía apenas se manda y nunca se vuelve a mostrar (la respuesta solo trae los últimos 4 caracteres).
  assert.match(claves, /const valor = area\.value;\s+area\.value = '';/);
  const css = readFileSync(join(RAIZ, 'public/estilos.css'), 'utf8');
  assert.match(css, /textarea\.campo-clave \{[^}]*-webkit-text-security: disc/);
  // Solo se pide a /api/admin/claves desde la cuenta de Tailscale del dueño (el administrador la pide solo si esDueno).
  assert.match(appJs, /ia\.ok && ia\.datos\.esDueno \? await api\('GET', '\/api\/admin\/claves'\)/);
});

test('0.8.0: los íconos que quedan (pantallas y servicios) son solo líneas con números, sin nada de afuera', async () => {
  const { ICONOS_PROYECTO, ICONOS_SERVICIOS } = await import('../public/dibujos.js');
  for (const forma of [...Object.values(ICONOS_PROYECTO), ...Object.values(ICONOS_SERVICIOS)]) {
    for (const [etiqueta, atributos] of forma) {
      assert.ok(['path', 'circle', 'rect', 'line', 'polyline', 'ellipse'].includes(etiqueta), etiqueta);
      for (const v of Object.values(atributos)) assert.match(String(v), /^[-\d.\sMmLlHhVvCcSsQqTtAaZz,]+$/, 'solo números y órdenes de dibujo');
    }
  }
  // Cada ícono que nombra una pantalla existe (si no, se dibujaría la marca de «bien» en su lugar).
  for (const nombre of ['rayo', 'libro', 'lupa', 'estrella', 'candado', 'buscar']) assert.ok(ICONOS_PROYECTO[nombre] || appJs.includes(`  ${nombre}: [`), nombre);
});

test('27b. el precio máximo se muestra redondeado hacia arriba: nunca menos de lo que se aparta', async () => {
  const { textoUsd } = await import('../public/ia-vista.js');
  const leer = texto => {
    const m = /^US\$([\d.,]+)$/.exec(texto);
    assert.ok(m, texto);
    return Math.round(Number(m[1].replace(/,/g, '')) * 1_000_000);
  };
  for (const formato of ['es-DO', 'en-US']) {
    for (let micro = 1; micro <= 5000; micro++) {
      const visto = leer(textoUsd(micro, formato, { haciaArriba: true }));
      assert.ok(visto >= micro, `${formato}: ${micro} µUSD se mostró como ${textoUsd(micro, formato, { haciaArriba: true })}`);
      assert.ok(visto - micro < 100, `${formato}: ${micro} µUSD, a lo sumo una diezmilésima de más`);
    }
    for (const micro of [9999, 10_000, 10_001, 123_456, 2_000_000, 2_000_001]) {
      const visto = leer(textoUsd(micro, formato, { haciaArriba: true }));
      assert.ok(visto >= micro && visto - micro < 10_000, `${formato}: ${micro}`);
    }
  }
  assert.equal(textoUsd(1812, 'es-DO', { haciaArriba: true }), 'US$0.0019', 'el caso de la revisión: se aparta 1812 µUSD');
  assert.equal(textoUsd(1812, 'es-DO'), 'US$0.0018', 'lo gastado se redondea normal');
  assert.equal(textoUsd(50, 'en-US'), '<US$0.0001');
  assert.equal(textoUsd(50, 'en-US', { haciaArriba: true }), 'US$0.0001');
  assert.equal(textoUsd(0, 'en-US', { haciaArriba: true }), 'US$0.00');
  assert.equal(textoUsd(null, 'en-US'), '—');
  assert.doesNotMatch(appJs, /maximo: usd\(/);
});

// Ronda 1 de revisión: en modo seguro, una ayuda que ya estaba en la fila dice la pausa (no «sigue en la fila» sin fin).
test('27e. Administrador: el permiso de IA de cada cuenta (dar solo el dueño desde Tailscale, quitar desde cualquier entrada)', () => {
  assert.match(appJs, /if \(u\.rol === 'admin' \|\| !u\.ia\) return null;/);
  assert.match(appJs, /const boton = permitida \? botonAccion\(t\('admin\.ia\.quitar'\)[^\n]*\n\s*: u\.activo && permisos\.admins \? botonAccion\(t\('admin\.ia\.permitir'\)/);
  assert.match(appJs, /if \(permitir && !\(await confirmar\(t\('admin\.ia\.confirmar', \{ nombre: u\.nombreVisible \|\| u\.nombre, origen \}\)/);
  assert.match(appJs, /api\('POST', `\/api\/admin\/usuarios\/\$\{u\.id\}\/ia`, \{ permitida: permitir \}\)/);
  assert.match(appJs, /\n\s*controlIa\(u\),/);
  assert.match(appJs, /t\('ia\.planes\.cuentas', \{ si: numero\(s\.cuentas\.permitidas \?\? 0\), no: numero\(s\.cuentas\.sinPermiso \?\? 0\) \}\)/);
  for (const clave of ['admin.ia.permitida', 'admin.ia.sin_permiso', 'admin.ia.solo_dueno', 'admin.ia.sin_historia', 'admin.ia.cambio_sin_anotar', 'ia.planes.ir_permisos', 'error.cuenta_inactiva', 'ia.motivo.cuenta_sin_permiso']) {
    assert.ok(es[clave] && en[clave], clave);
  }
});

// Ronda 1 de revisión: Administrador solo muestra los botones que sirven desde esta entrada (dueño único; cuentas por
// Tailscale mientras alguna pueda gastar IA) y dice por qué en una línea.
test('27d. Administrador: «Administrador» como rol solo para el dueño; crear, planes y reiniciar se esconden si no sirven', () => {
  assert.match(appJs, /permisos\.admins \? el\('option', \{ value: 'admin', texto: t\('admin\.rol\.admin'\) \}\) : null/);
  assert.match(appJs, /permisos\.cuentas \? formulario : el\('p', \{ class: 'aviso con-icono-arriba' \}, icono\('candado'\), el\('span', \{ texto: t\('admin\.cuentas_solo_tailnet'\) \}\)\)/);
  assert.match(appJs, /!u\.activo \|\| !puedeEntrarle \? null : el\('button'/);
  assert.match(appJs, /s\.motivoDueno === 'solo_el_dueno' \? 'ia\.solo_el_dueno' : 'ia\.solo_dueno'/);
  assert.match(appJs, /e === 'solo_el_dueno' \? t\('claves\.solo_el_dueno'\)/);
  for (const clave of ['version.volver_sin_ia_lleno', 'admin.cuentas_solo_tailnet', 'admin.otro_admin', 'admin.plan.solo_ver', 'admin.nuevo.rol.solo_dueno', 'ia.solo_el_dueno', 'claves.solo_el_dueno',
    'error.cuentas_solo_tailnet', 'error.solo_el_dueno', 'servicios.claves.solo_el_dueno']) {
    assert.ok(es[clave] && en[clave], clave);
  }
});

test('27. las frases de la IA son cortas y dicen dónde se paga Claude', () => {
  // El recordatorio: la API de Claude se paga aparte, en console.anthropic.com, no con la suscripción del chat.
  for (const idioma of [es, en]) {
    assert.match(idioma['ia.pago.claude'], /console\.anthropic\.com/);
    assert.match(idioma['claves.donde.ia_anthropic'], /console\.anthropic\.com/);
  }
  assert.match(es['ia.pago.claude'], /No es tu suscripción/);
  assert.ok(appJs.includes("t('ia.pago.claude')"), 'la pantalla de la IA muestra el recordatorio');
  // Poco texto en la cara de cada tarjeta: los títulos, botones y estados son cortos.
  for (const [clave, valor] of Object.entries(es)) {
    if (/^(servicios\.|ia\.estado\.[a-z_]+$|ia\.estado\.[a-z_]+\.corto$|claves\.estado\.|ia\.proveedor\.(lista|apagado)$)/.test(clave) || /\.(titulo|boton|guardar|encender|apagar|probar|activar|desactivar)$/.test(clave)) {
      if (!/^(servicios|ia|claves|ayuda_ia)\./.test(clave)) continue;
      assert.ok(valor.length <= 60, `${clave} es largo para una tarjeta: «${valor}»`);
    }
  }
  // inicio.viene.ia ya no se muestra (la IA ya llegó), pero la frase sigue en los archivos (nunca se borra nada).
  assert.ok('inicio.viene.ia' in es && !appJs.includes("'inicio.viene.ia'"));
  assert.equal(es['valor.ia.no_permitida'], 'No permitida · tope US$0');
});

// ---------- Fase 1, parte e: Copias, la clave de recuperación y el Telegram (pruebas 3.1–3.3 del diseño) ----------
const existe = clave => clave in es && clave in en;
const hora = h => new Date(Date.now() - h * 3_600_000).toISOString();
// Una respuesta de GET /api/admin/copias con todo bien (los casos cambian una parte).
const copiasBien = (cambio = {}) => ({
  clave: { activa: true, huella: 'A7F3', desde: hora(500), comprobadaEn: null, pendiente: null, anteriores: [] },
  telegram: { listo: true, motivo: null, chat: { estado: 'activo', nombre: 'Junior', problema: null }, bot: { usuario: 'oportia_junior_bot' } },
  ultima: { estado: 'verificada', motivo: null }, ultimaFuera: { fecha: hora(3), bytes: 41 * 1024 * 1024, partes: 21 }, proxima: hora(-20),
  enCurso: null, locales: { activas: true, pausadas: false, frenoDisco: false, copias: 3, mb: 120, libreMb: 7900, pisoMb: 2304, diasRestantes: 300 },
  fijada: true, recientes: [], modoSeguro: false, puede: { ahora: true, motivoNoAhora: null, crearClave: true, motivoNoClave: null },
  ...cambio,
});

test('3.1/3.3 Copias: cada estado de la tarjeta grande tiene sus frases, y un botón solo cuando se puede usar', async () => {
  const { vistaCopias, vistaDisco, motivoNoAhora } = await import('../public/copias-vista.js');
  const casos = {
    bien: copiasBien(),
    sin_clave: copiasBien({ clave: { activa: false, anteriores: [] }, puede: { ahora: false, motivoNoAhora: 'sin_clave', crearClave: true } }),
    sin_clave_funnel: copiasBien({ clave: { activa: false, anteriores: [] }, puede: { ahora: false, motivoNoAhora: 'sin_clave', crearClave: false, motivoNoClave: 'solo_desde_tailnet' } }),
    modo_seguro: copiasBien({ modoSeguro: true, puede: { ahora: false, motivoNoAhora: 'modo_seguro', crearClave: true } }),
    en_fila: copiasBien({ enCurso: { paso: 'preparar', n: null, de: null, esperando: true }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    reintentando: copiasBien({ enCurso: { paso: 'subir', n: 2, de: 5, esperando: true, tomas: 1, motivo: 'error_servidor', disponibleEn: hora(-0.5) }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    revisar: copiasBien({ enCurso: { paso: 'subir', n: 2, de: 5, esperando: true, tomas: 2, revisar: true }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    entre_pasos: copiasBien({ enCurso: { paso: 'subir', n: 2, de: 5, esperando: true, tomas: 2, motivo: null, disponibleEn: null }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    haciendo: copiasBien({ enCurso: { paso: 'subir', n: 4, de: 11 }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    haciendo_sin_total: copiasBien({ enCurso: { paso: 'generar', n: 4, de: null }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    comprobando: copiasBien({ enCurso: { paso: 'verificar', n: 2, de: 11 }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    freno_disco: copiasBien({ locales: { activas: true, pausadas: true, frenoDisco: true, libreMb: 250 }, puede: { ahora: false, motivoNoAhora: 'disco_lleno', crearClave: true } }),
    solo_locales: copiasBien({ telegram: null }),
    fallo: copiasBien({ ultima: { estado: 'fallida', motivo: 'parte_distinta:3' } }),
    telegram_problema: copiasBien({ telegram: { listo: false, motivo: 'bloqueado', chat: { estado: 'bloqueado', problema: 'bloqueado' } } }),
    primera: copiasBien({ ultimaFuera: null, ultima: null }),
    atrasada: copiasBien({ ultimaFuera: { fecha: hora(80), bytes: 1, partes: 1 } }),
    sin_fijar: copiasBien({ fijada: false }),
  };
  const vistas = {};
  for (const [nombre, c] of Object.entries(casos)) {
    const v = vistaCopias(c);
    vistas[nombre] = v;
    for (const clave of [v.titulo, v.linea, v.razon, v.enlace?.texto].filter(Boolean)) assert.ok(existe(clave), `${nombre}: falta ${clave}`);
    assert.ok(['bien', 'atencion', 'mal', 'info', 'apagado'].includes(v.tono), nombre);
    // La regla de siempre: o hay un botón que sirve, o una línea que dice por qué no (o un enlace adonde arreglarlo).
    if (motivoNoAhora(c) && v.accion !== 'crear_clave') assert.equal(v.accion, null, `${nombre}: un botón que no puede hacer nada`);
    if (v.accion && v.accion !== 'crear_clave') assert.equal(motivoNoAhora(c), null, nombre);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(vistas).map(([n, v]) => [n, v.estado])), {
    bien: 'bien', sin_clave: 'sin_clave', sin_clave_funnel: 'sin_clave', modo_seguro: 'modo_seguro', en_fila: 'en_fila', reintentando: 'reintentando',
    revisar: 'revisar', entre_pasos: 'haciendo', haciendo: 'haciendo',
    haciendo_sin_total: 'haciendo', comprobando: 'haciendo', freno_disco: 'freno_disco', solo_locales: 'solo_locales', fallo: 'fallo',
    telegram_problema: 'telegram_problema', primera: 'primera', atrasada: 'atrasada', sin_fijar: 'sin_fijar',
  });
  assert.equal(vistas.bien.accion, 'ahora');
  assert.equal(vistas.fallo.accion, 'otra_vez');
  assert.equal(vistas.sin_clave.accion, 'crear_clave');
  // Por el enlace público (o desde otra cuenta) no se ofrece crear la clave: se dice desde dónde.
  assert.equal(vistas.sin_clave_funnel.accion, null);
  assert.equal(vistas.sin_clave_funnel.razon, 'copias.clave.no_puede.solo_desde_tailnet');
  assert.equal(vistas.modo_seguro.accion, null);
  assert.equal(vistas.modo_seguro.enlace.href, '#admin/trabajo');
  assert.equal(vistas.freno_disco.accion, null);
  assert.equal(vistas.freno_disco.enlace.href, '#admin/servidor');
  assert.equal(vistas.haciendo.accion, null);
  assert.deepEqual(vistas.haciendo.progreso, { n: 4, de: 11 });
  assert.equal(vistas.haciendo.linea, 'copias.haciendo');
  assert.equal(vistas.haciendo_sin_total.linea, 'copias.haciendo_sin_total');
  assert.equal(vistas.comprobando.linea, 'copias.comprobando');
  assert.equal(vistas.solo_locales.enlace.href, '#claves');
  // Sin Telegram y con el disco que ya no deja guardar copias aquí: no hay adónde mandarla (el servidor diría sin_destino).
  const sinDestino = copiasBien({ telegram: null, locales: { activas: true, pausadas: true, frenoDisco: false, libreMb: 1900 } });
  assert.equal(motivoNoAhora(sinDestino), 'sin_destino');
  assert.equal(vistaCopias(sinDestino).accion, null);
  assert.equal(vistaCopias(sinDestino).razon, 'copias.no_ahora.sin_destino');
  // El disco: nunca se borra nada; con poco espacio se dice, con menos de 300 MB está en rojo.
  for (const [locales, tono] of [[{ activas: true }, 'bien'], [{ activas: true, pausadas: true }, 'atencion'], [{ frenoDisco: true }, 'mal'], [{ activas: false }, 'apagado'], [{ activas: true, diasRestantes: 12 }, 'atencion']]) {
    const v = vistaDisco(locales);
    assert.equal(v.tono, tono, JSON.stringify(locales));
    if (v.linea) assert.ok(existe(v.linea), v.linea);
  }
});

test('3.1 Copias: el Resumen, Inicio y el Telegram de Claves dicen cosas que existen en los dos idiomas', async () => {
  const { vistaAzulejoCopias, vistaAzulejoTelegram, vistaTelegram, motivoBase, codigoLegible, cuentaAtras, enlaceSeguro } = await import('../public/copias-vista.js');
  const resumenes = [null, { motivo: 'sin_clave' }, { motivo: 'solo_locales' }, { motivo: 'fallo', ultimaFuera: { fecha: hora(2) } }, { motivo: 'atrasada', ultimaFuera: null },
    { motivo: 'atrasada', ultimaFuera: { fecha: hora(50) } }, { motivo: null, tono: 'bien', ultimaFuera: { fecha: hora(2) } }];
  for (const r of resumenes) {
    for (const modoSeguro of [false, true]) {
      const v = vistaAzulejoCopias(r, { modoSeguro });
      assert.ok(existe(v.valor.clave), v.valor.clave);
      if (v.detalle) assert.ok(existe(v.detalle), v.detalle);
    }
  }
  // Recién configurado (clave y Telegram, sin ninguna copia todavía): no es una alarma roja.
  assert.notEqual(vistaAzulejoCopias({ motivo: 'atrasada', tono: 'mal', ultimaFuera: null }).tono, 'mal');
  const telegrams = [null, { listo: false, chat: null }, { listo: true, chat: { estado: 'activo', nombre: 'Junior' } }, { listo: false, motivo: 'bloqueado', chat: { estado: 'bloqueado' } },
    { listo: false, motivo: 'perdido', chat: { estado: 'perdido' } }, { listo: false, motivo: 'pausa', chat: { estado: 'activo' } }, { listo: false, motivo: 'sin_probar', chat: { estado: 'activo' } }];
  for (const tg of telegrams) {
    const v = vistaAzulejoTelegram(tg);
    assert.ok(existe(v.valor), v.valor);
    if (v.detalle) assert.ok(existe(v.detalle), v.detalle);
  }
  // Claves → Telegram: ① el bot, ② el chat (solo cuando el bot pasó la prueba), y los problemas.
  const token = { legible: true, prueba: 'ok' };
  assert.equal(vistaTelegram({}, { activa: null }).paso, 'bot');
  assert.equal(vistaTelegram({ bot: null }, { activa: { ...token, prueba: 'clave_no_valida' } }).problema, 'clave_no_valida');
  assert.equal(vistaTelegram({ bot: null }, { activa: { ...token, prueba: 'bot_ocupado' } }).problema, 'bot_ocupado');
  assert.equal(vistaTelegram({ bot: { usuario: 'b' }, chat: null }, { activa: token }).paso, 'unir');
  assert.deepEqual(vistaTelegram({ bot: { usuario: 'b' }, chat: { estado: 'perdido' } }, { activa: token }), { paso: 'unir', tokenBien: true, problema: 'perdido', chat: { estado: 'perdido' } });
  assert.equal(vistaTelegram({ bot: { usuario: 'b' }, listo: true, chat: { estado: 'activo' } }, { activa: token }).problema, null);
  assert.equal(vistaTelegram({ bot: { usuario: 'b' }, listo: false, motivo: 'bloqueado', chat: { estado: 'bloqueado', problema: 'bloqueado' } }, { activa: token }).problema, 'bloqueado');
  assert.equal(vistaTelegram({ bot: { usuario: 'b' }, listo: false, motivo: 'pausa', chat: { estado: 'activo' } }, { activa: token }).problema, 'pausa');
  // Un motivo desconocido nunca se muestra tal cual.
  assert.equal(motivoBase('parte_distinta:indice'), 'parte_distinta');
  assert.equal(motivoBase('algo_nuevo_de_otra_version'), 'otro');
  assert.equal(codigoLegible('48217730'), '4821 7730');
  assert.equal(cuentaAtras(new Date(Date.now() + 598_500).toISOString()), '9:58');
  assert.equal(cuentaAtras(hora(1)), null);
  // Solo un enlace de t.me con 8 cifras (nunca otra dirección que llegue en una respuesta).
  assert.equal(enlaceSeguro('https://t.me/oportia_junior_bot?start=48217730'), 'https://t.me/oportia_junior_bot?start=48217730');
  for (const malo of ['http://t.me/x_bot?start=48217730', 'https://t.me.ejemplo.com/x?start=48217730', 'javascript:alert(1)', 'https://t.me/x_bot?start=4821', null]) assert.equal(enlaceSeguro(malo), null, String(malo));
  // Lo que manda el Telegram (src/canales/textos.js) existe en los dos idiomas.
  const textos = readFileSync(join(RAIZ, 'src/canales/textos.js'), 'utf8');
  for (const m of textos.matchAll(/'(telegram\.[a-z0-9_.]+)'/g)) assert.ok(existe(m[1]) || (existe(`${m[1]}.titulo`) && existe(`${m[1]}.texto`)), `falta ${m[1]}`);
  // Los avisos de una actualización dicen cuál fue (sus 7 primeras cifras).
  for (const clave of ['aviso.actualizacion_no_instalada', 'aviso.actualizacion_revertida']) for (const d of [es, en]) assert.match(d[clave], /\{sha\}/, clave);
  assert.match(appJs, /actualizacion_\(no_instalada\|revertida\):\(\[0-9a-f\]\{7\}\)/);
});

test('3.2 Copias: íconos propios, y la clave de recuperación nunca se guarda en el navegador ni viaja al confirmarla', async () => {
  const { ICONOS_SERVICIOS } = await import('../public/dibujos.js');
  for (const nombre of ['copia', 'nube_candado', 'avion_papel', 'disco', 'clave_recuperacion', 'imprimir', 'copiar']) assert.ok(nombre in ICONOS_SERVICIOS, `falta el ícono ${nombre}`);
  // Los íconos que nombra la vista de las copias existen.
  const vista = readFileSync(join(RAIZ, 'public/copias-vista.js'), 'utf8');
  for (const m of vista.matchAll(/icono: '([a-z_]+)'/g)) assert.ok(m[1] in ICONOS_SERVICIOS || appJs.includes(`  ${m[1]}: [`), `ícono ${m[1]}`);
  // La pantalla manda SOLO el verificador al confirmar y al comprobar.
  const envios = [...appJs.matchAll(/api\('POST', '\/api\/admin\/copias\/clave\/(confirmar|comprobar)', (\{[^}]*\})\)/g)];
  assert.equal(envios.length, 2);
  for (const e of envios) assert.equal(e[2], '{ verificador: calculado.verificador }', e[1]);
  // La clave nueva vive en una variable de la pantalla: nunca en localStorage, sessionStorage, la dirección ni un borrador.
  const bloque = appJs.slice(appJs.indexOf('// ---------- Copias de seguridad (fase 1, parte e)'), appJs.indexOf('// ---------- IA opcional y Claves (fase 1, parte d)'));
  assert.ok(bloque.length > 1000);
  assert.doesNotMatch(bloque, /localStorage|sessionStorage|location\.hash\s*=(?!=)|borrador\(|recordarTexto\(/);
  // Al salir de Copias se suelta (y el código de Telegram al salir de Claves).
  assert.match(appJs, /if \(seccion !== 'copias'\) claveNueva = null;/);
  assert.match(appJs, /if \(seccion !== 'claves'\) vinculoEnPantalla = null;/);
  // La página calcula el verificador sin WebCrypto (también en una dirección http:// de Tailscale).
  assert.match(appJs, /import \{ leerClave, verificadorDe, grupoDistinto, gruposDeClave, sobraNombreCorto \} from '\.\/clave-recuperacion\.js';/);
  // El enlace al bot pasa siempre por enlaceSeguro.
  assert.match(appJs, /enlace: enlaceSeguro\(x\.datos\.enlace\)/);
});

// ---------- Fase 1, parte e — revisión final ----------

test('revisión: los pasos para recuperar son los mismos en la pantalla, la hoja impresa y el README, y dicen /revoke y la clave nueva', () => {
  const lista = appJs.match(/const PASOS_RESTAURAR = Object\.freeze\(\[([^\]]*)\]\)/)?.[1];
  assert.ok(lista, 'una sola lista de pasos');
  const numeros = lista.split(',').map(x => Number(x.trim()));
  // La pantalla y la hoja dibujan esa lista (pasosRestaurar), nunca otra.
  assert.match(seccionDe(appJs, 'function hojaDeLaClave('), /pasosRestaurar\(\)/);
  assert.match(appJs, /PASOS_RESTAURAR\.map\(n =>/);
  const readme = readFileSync(join(RAIZ, 'README.md'), 'utf8');
  const seccion = readme.split('### Si un día pierdes el servidor')[1].split('\n\n')[0];
  const delReadme = [...seccion.matchAll(/^(\d+)\. /gm)].map(m => Number(m[1]));
  assert.deepEqual(numeros, delReadme, 'los mismos pasos que el README');
  for (const idioma of [es, en]) {
    for (const n of numeros) assert.ok(idioma[`copias.restaurar.paso${n}`], `falta copias.restaurar.paso${n}`);
    const todos = numeros.map(n => idioma[`copias.restaurar.paso${n}`]).join(' ');
    assert.match(todos, /\/revoke/);
    assert.match(todos, idioma === es ? /NUEVO/ : /NEW/);
    assert.match(todos, idioma === es ? /clave de recuperación nueva/ : /new recovery key/);
  }
  assert.ok(numeros.findIndex(n => /\/revoke/.test(es[`copias.restaurar.paso${n}`])) < numeros.findIndex(n => /token NUEVO/.test(es[`copias.restaurar.paso${n}`]) && /Claves/.test(es[`copias.restaurar.paso${n}`])), 'revocar antes de pegar el token nuevo');
});

test('revisión: cada motivo que la tarea de copias puede dejar se dice con palabras en Trabajo (nunca el código)', async () => {
  const { fraseMotivoTareaCopia, MOTIVOS_TAREA_COPIA } = await import('../public/copias-vista.js');
  const { MOTIVOS_CANAL, esPasajero } = await import('../src/canales/canal.js');
  const hacer = readFileSync(join(RAIZ, 'src/copias/hacer.js'), 'utf8');
  const codigos = new Set([
    ...[...hacer.matchAll(/new ErrorTarea\('([a-z_]+)'/g)].map(m => m[1]),
    ...[...hacer.matchAll(/fallar\(ctx, [a-z]+, [`']([a-z_]+)/g)].map(m => m[1]),
    ...[...hacer.matchAll(/new ErrorCopias\('([a-z_]+)'/g)].map(m => m[1]),
    ...[...hacer.matchAll(/reiniciar\(ctx, copia, \{ motivo: '([a-z_]+)'/g)].map(m => m[1]),
    'disco_distinto:abc', 'fila_muy_grande:ajustes', 'parte_distinta:3',
  ]);
  assert.ok(codigos.size > 12, 'se encontraron los códigos de hacer.js');
  // Los de Telegram: un problema pasajero tal cual, los demás como telegram_<problema>.
  const deTelegram = MOTIVOS_CANAL.filter(m => m !== 'ok').map(m => (esPasajero(m) ? m : `telegram_${m}`));
  for (const m of MOTIVOS_TAREA_COPIA) assert.ok(existe(`tareas.motivo.${m}`), `falta tareas.motivo.${m}`);
  for (const codigo of [...codigos, ...deTelegram]) {
    const frase = fraseMotivoTareaCopia(codigo, existe);
    assert.ok(existe(frase), `${codigo}: ${frase} no está en los dos idiomas`);
    if (codigos.has(codigo)) assert.notEqual(frase, 'copias.motivo.otro', `${codigo} no tiene una frase propia`);
  }
  // app.js usa esa frase para las tareas de copias (Errores recientes y «Ver la fila»).
  assert.match(appJs, /textoMotivo\(e\.motivo, e\.tipo\)/);
  assert.match(appJs, /textoMotivo\(x\.ultimoError, x\.tipo\)/);
  assert.match(seccionDe(appJs, 'function textoMotivo('), /fraseMotivoTareaCopia\(motivo, existeFrase\)/);
});

test('revisión: el nombre corto de la clave va debajo de la clave y, si se escribe con ella, se dice qué sobra', async () => {
  const { sobraNombreCorto, gruposDeClave } = await import('../public/clave-recuperacion.js');
  const clave = 'P03Z-0NXE-HT8S-8ZX0-4A2M-JAD6-N05E';
  assert.equal(sobraNombreCorto(`21JE ${clave}`, '21JE'), true);
  assert.equal(sobraNombreCorto(`21je-${clave.toLowerCase()}`, '21JE'), true);
  assert.equal(sobraNombreCorto(clave, '21JE'), false);
  assert.equal(sobraNombreCorto(`ABCD ${clave}`, '21JE'), false);
  assert.equal(gruposDeClave(clave).length, 7);
  for (const k of ['copias.clave.nombre_corto', 'copias.clave.sobra_nombre']) assert.ok(existe(k) && es[k].includes('{huella}') && en[k].includes('{huella}'), k);
  const paso1 = seccionDe(appJs, 'function dibujarClaveNueva(');
  assert.ok(paso1.indexOf("'copias.clave.nombre_corto'") > paso1.indexOf("class: 'clave-recuperacion'"), 'el nombre corto va después de la clave');
  assert.match(paso1, /sobraNombreCorto\(escrita, n\.huella\)/);
});

test('revisión: Claves dice que la base se recuperó; Trabajo menciona la copia de las 4:40; el chat se retoma tras recargar', () => {
  for (const k of ['claves.restaurada', 'telegram.unir.retomado', 'telegram.unir.pedir_otro', 'copias.estado.reintentando', 'copias.reintentando', 'copias.estado.revisar', 'copias.revisar']) assert.ok(existe(k), k);
  assert.match(appJs, /d\.almacen\?\.motivo === 'restaurada'/);
  assert.match(es['tareas.explicacion'], /4:40/);
  assert.match(en['tareas.explicacion'], /4:40/);
  const unir = seccionDe(appJs, 'function bloqueUnirChat(');
  assert.match(unir, /tg\.vinculo\?\.pendiente && cuentaAtras\(tg\.vinculo\.hasta\)/);
  assert.match(unir, /vincular\/cancelar/, 'cancelar le avisa al servidor (si no, se retomaría)');
});


// ---------- Claridad (0.5.1): «Primeros pasos», «¿Qué es esto?», la Ayuda y la línea de cada pantalla ----------
test('claridad: «Primeros pasos» del administrador sale de datos de verdad (clave, Telegram, copia, proyecto, aprobar; la IA es opcional)', async () => {
  const { pasosAdmin, resumenGuia } = await import('../public/guia.js');
  const estados = datos => Object.fromEntries(resumenGuia(pasosAdmin(datos)).pasos.map(p => [p.id, p.estado]));
  const nuevo = { sistema: { copias: { motivo: 'sin_clave', ultimaFuera: null }, telegram: { listo: false, chat: null } }, ia: { encendida: false }, proyectos: [] };
  assert.deepEqual(estados(nuevo), { clave: 'ahora', telegram: 'luego', copia: 'luego', proyecto: 'luego', aprobar: 'luego', ia: 'opcional' });
  let g = resumenGuia(pasosAdmin(nuevo));
  assert.deepEqual([g.hechos, g.total, g.completa, g.siguiente.id, g.siguiente.destino], [0, 5, false, 'clave', '#copias']);
  // Con la clave creada sigue el Telegram; la copia espera a los dos.
  const conClave = { ...nuevo, sistema: { copias: { motivo: 'solo_locales', ultimaFuera: null }, telegram: { listo: false, chat: null } } };
  assert.deepEqual(estados(conClave), { clave: 'hecho', telegram: 'ahora', copia: 'luego', proyecto: 'luego', aprobar: 'luego', ia: 'opcional' });
  assert.equal(pasosAdmin(conClave).find(p => p.id === 'copia').necesita, 'telegram');
  // Un chat perdido no cuenta como unido; uno bloqueado sí (sigue unido, aunque no deje mandar).
  const perdido = { ...conClave, sistema: { ...conClave.sistema, telegram: { listo: false, chat: { estado: 'perdido' } } } };
  assert.equal(estados(perdido).telegram, 'ahora');
  const unido = { ...conClave, sistema: { copias: { motivo: 'atrasada', ultimaFuera: null }, telegram: { listo: true, chat: { estado: 'activo', nombre: 'Junior' } } } };
  assert.deepEqual(estados(unido), { clave: 'hecho', telegram: 'hecho', copia: 'ahora', proyecto: 'luego', aprobar: 'luego', ia: 'opcional' });
  // Un proyecto que espera aprobación: el paso «aprobar» lleva a ese proyecto.
  const conProyecto = { ...unido, sistema: { ...unido.sistema, copias: { motivo: null, ultimaFuera: { fecha: '2026-11-09T08:41:00Z' } } },
    proyectos: [{ id: 9, enPapelera: true, versionPendiente: 1, versionActiva: null }, { id: 4, enPapelera: false, versionPendiente: 1, versionActiva: null }] };
  g = resumenGuia(pasosAdmin(conProyecto));
  assert.deepEqual([g.hechos, g.total, g.siguiente.id, g.siguiente.destino], [4, 5, 'aprobar', '#proyecto/4']);
  // Todo hecho: completa aunque la IA siga apagada (es opcional); con la IA encendida, también ese paso queda hecho.
  const listo = { ...conProyecto, proyectos: [{ id: 4, enPapelera: false, versionPendiente: null, versionActiva: 1 }] };
  g = resumenGuia(pasosAdmin(listo));
  assert.deepEqual([g.hechos, g.total, g.completa, g.siguiente], [5, 5, true, null]);
  assert.equal(estados(listo).ia, 'opcional');
  assert.equal(estados({ ...listo, ia: { encendida: true } }).ia, 'hecho');
  // Un proyecto aprobado que se mandó a la papelera no devuelve la guía al principio.
  assert.equal(resumenGuia(pasosAdmin({ ...listo, proyectos: [{ id: 4, enPapelera: true, versionPendiente: null, versionActiva: 1 }] })).completa, true);
  // Si el estado del sistema no llegó, solo se muestran los pasos de los proyectos (nunca un paso inventado).
  assert.deepEqual(pasosAdmin({ sistema: null, ia: null, proyectos: [] }).map(p => p.id), ['proyecto', 'aprobar']);
});

test('claridad: cada palabra de la Ayuda tiene su explicación en los dos idiomas, y las pantallas solo usan palabras que existen', async () => {
  const { TEMAS_AYUDA, TEMAS_CON_EJEMPLO, buscarTemas } = await import('../public/guia.js');
  assert.ok(TEMAS_AYUDA.length >= 20);
  assert.equal(new Set(TEMAS_AYUDA).size, TEMAS_AYUDA.length);
  for (const tema of TEMAS_AYUDA) {
    for (const [nombre, idioma] of [['es', es], ['en', en]]) {
      assert.ok(idioma[`ayuda.${tema}.titulo`], `falta ayuda.${tema}.titulo (${nombre})`);
      const texto = idioma[`ayuda.${tema}.texto`];
      assert.ok(texto, `falta ayuda.${tema}.texto (${nombre})`);
      // Corta: 2 o 3 frases (4 como mucho) y sin palabras de programador.
      const frases = texto.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¿«“])/).length;
      assert.ok(frases >= 2 && frases <= 4, `ayuda.${tema}.texto (${nombre}) tiene ${frases} frases`);
      assert.ok(texto.length <= 260, `ayuda.${tema}.texto (${nombre}) es larga: ${texto.length}`);
      assert.equal(Boolean(idioma[`ayuda.${tema}.ejemplo`]), TEMAS_CON_EJEMPLO.includes(tema), `ayuda.${tema}.ejemplo (${nombre})`);
    }
  }
  for (const tema of TEMAS_CON_EJEMPLO) assert.ok(TEMAS_AYUDA.includes(tema), tema);
  // No queda una explicación suelta que ninguna pantalla muestre.
  for (const clave of Object.keys(es)) {
    const m = /^ayuda\.([a-z_]+)\.(titulo|texto|ejemplo)$/.exec(clave);
    if (m) assert.ok(TEMAS_AYUDA.includes(m[1]), `sobra ${clave}`);
  }
  // Los botones (i) de las pantallas: queEs('…'), titulo(…, '…') y palabras([…]) nombran palabras de la lista.
  const usadas = new Set();
  for (const m of appJs.matchAll(/queEs\('([a-z_]+)'/g)) usadas.add(m[1]);
  for (const m of appJs.matchAll(/titulo\([^\n]*?, undefined, '([a-z_]+)'\)/g)) usadas.add(m[1]);
  for (const m of appJs.matchAll(/(?:palabras\(|PALABRAS_ADMIN = )([^\n]*)/g)) for (const x of m[1].matchAll(/'([a-z_]+)'/g)) usadas.add(x[1]);
  for (const m of readFileSync(join(RAIZ, 'public/guia.js'), 'utf8').matchAll(/tema: '([a-z_]+)'/g)) usadas.add(m[1]);
  assert.ok(usadas.size >= 15, `pocas palabras con botón: ${usadas.size}`);
  for (const tema of usadas) assert.ok(TEMAS_AYUDA.includes(tema), `la pantalla usa la palabra «${tema}», que no está en la Ayuda`);
  for (const tema of TEMAS_AYUDA) assert.ok(usadas.has(tema), `«${tema}» está en la Ayuda pero ningún botón (i) la abre`);
  // El buscador: sin tildes ni mayúsculas; primero lo que coincide en el título.
  const temas = TEMAS_AYUDA.map(id => ({ id, titulo: es[`ayuda.${id}.titulo`], texto: es[`ayuda.${id}.texto`], ejemplo: es[`ayuda.${id}.ejemplo`] ?? '' }));
  assert.equal(buscarTemas(temas, '').length, temas.length);
  assert.equal(buscarTemas(temas, 'TELEGRAM')[0].id, 'telegram');
  assert.deepEqual(buscarTemas(temas, 'copia').slice(0, 2).map(x => x.id).sort(), ['copia', 'copia_comprobada']);
  assert.ok(buscarTemas(temas, 'botfather').some(x => x.id === 'token'));
  assert.deepEqual(buscarTemas(temas, 'zzzz'), []);
  // La hoja es accesible: un <dialog> de verdad (Escape la cierra), el botón dice si está abierta y el foco vuelve.
  const abrir = seccionDe(appJs, 'function abrirAyuda(');
  assert.match(abrir, /el\('dialog', \{ class: 'hoja-ayuda', 'aria-labelledby': 'hoja-ayuda-titulo' \}\)/);
  assert.match(abrir, /hoja\.showModal\(\)/);
  assert.match(abrir, /setAttribute\('aria-expanded', 'true'\)/);
  assert.match(abrir, /setAttribute\('aria-expanded', 'false'\)/);
  assert.match(abrir, /vuelve\.focus\(/);
  assert.match(seccionDe(appJs, 'function queEs('), /'aria-haspopup': 'dialog', 'aria-expanded': 'false'/);
  assert.match(seccionDe(appJs, 'async function dibujar('), /cerrarAyuda\(\);/);
});

test('claridad: cada pantalla y pestaña empieza con una línea corta (12 palabras como mucho) y cada paso de la guía tiene sus frases', async () => {
  const { pasosAdmin } = await import('../public/guia.js');
  // 0.8.0: sin las líneas de los proyectos (se quitaron); con las pestañas de la academia.
  const lineas = ['entrar.linea', 'config.linea', 'ayuda.linea',
    ...['resumen', 'usuarios', 'trabajo', 'servidor', 'copias', 'ia', 'claves', 'alumnos', 'contenido', 'respuestas'].map(x => `admin.linea.${x}`)];
  for (const clave of lineas) {
    for (const [nombre, idioma] of [['es', es], ['en', en]]) {
      assert.ok(idioma[clave], `falta ${clave} (${nombre})`);
      assert.ok(idioma[clave].split(/\s+/).length <= 12, `${clave} (${nombre}) pasa de 12 palabras`);
    }
    assert.ok(appJs.includes(`'${clave}'`), `ninguna pantalla muestra ${clave}`);
  }
  // Las pestañas de Administrador tienen su línea.
  assert.match(appJs, /LINEA_ADMIN\[actual\] \? entrada\(LINEA_ADMIN\[actual\]\(\)\) : null/);
  const todos = { sistema: { copias: { motivo: null, ultimaFuera: null }, telegram: { chat: null } }, ia: { encendida: false }, proyectos: [] };
  const ids = new Set(pasosAdmin(todos).map(p => p.id));
  assert.deepEqual([...ids].sort(), ['aprobar', 'clave', 'copia', 'ia', 'proyecto', 'telegram']);
  for (const id of ids) for (const idioma of [es, en]) assert.ok(idioma[`guia.paso.${id}`] && idioma[`guia.paso.${id}.linea`], `guia.paso.${id}`);
  // Las listas vacías enseñan (un dibujo, una línea y, si se puede, el botón) y los errores ya no salen en un alert().
  for (const clave of ['admin.usuarios.solo_tu', 'copias.recientes.vacio', 'sistema.avisos.vacio', 'config.reinicios.vacio', 'ayuda.buscar.vacio']) {
    assert.match(appJs, new RegExp(`vacio\\('[a-z_]+', t\\('${clave.replaceAll('.', '\\.')}'`), `${clave} no se muestra con vacio(…)`);
  }
  assert.doesNotMatch(appJs, /\balert\(/);
});
