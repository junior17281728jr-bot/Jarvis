// Cambios de la base de datos, en orden. REGLAS (las revisa test/reglas.test.js):
//  - Solo se AGREGAN cosas: nunca DROP, nunca RENAME, nunca borrar columnas.
//  - Una columna nueva NOT NULL siempre lleva DEFAULT.
//  - Nunca se cambia ni se reordena una migración ya publicada: se agrega una nueva al final.
export const MIGRACIONES = [
  {
    id: 1,
    nombre: 'base',
    sql: `
CREATE TABLE IF NOT EXISTS meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  detalle TEXT
);
`,
  },
  {
    id: 2,
    nombre: 'cuentas',
    sql: `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre_visible TEXT,
  clave_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
  activo INTEGER NOT NULL DEFAULT 1,
  idioma TEXT NOT NULL DEFAULT 'es' CHECK (idioma IN ('es', 'en')),
  debe_cambiar_clave INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL,
  ultimo_acceso TEXT,
  tailscale_login TEXT
);
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  creada_en TEXT NOT NULL,
  vence_en TEXT NOT NULL,
  ultimo_uso TEXT,
  navegador TEXT
);
CREATE INDEX IF NOT EXISTS sesiones_usuario ON sesiones(usuario_id);
CREATE TABLE IF NOT EXISTS espacios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'prueba',
  creado_en TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS miembros (
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  rol TEXT NOT NULL DEFAULT 'dueno' CHECK (rol IN ('dueno', 'editor', 'lector')),
  creado_en TEXT NOT NULL,
  PRIMARY KEY (espacio_id, usuario_id)
);
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auditoria_fecha ON auditoria(fecha);
`,
  },
  {
    id: 3,
    nombre: 'proyectos',
    // Cada proyecto vive en un espacio. Su configuración se guarda por versiones: cambiar algo crea
    // una versión nueva que espera aprobación, y la anterior sigue en uso hasta que se apruebe.
    // «Eliminar» manda el proyecto a la papelera: no se borra y se puede restaurar.
    // «numero» es el número del proyecto DENTRO de su espacio (1, 2, 3…): es el que ven las pantallas, así
    // nadie puede contar los proyectos de otras cuentas. «id» es solo interno.
    // «nombre_propio» = 1 cuando la persona le puso nombre; si es 0, el nombre se recalcula al aprobar.
    // Los valores de tipo, estado y origen NO llevan CHECK: se revisan en el código (src/proyectos/proyectos.js),
    // así una fase futura puede agregar un valor nuevo sin rehacer la tabla (eso exigiría DROP y RENAME).
    // avisos_cuenta: avisos para la persona, por ahora «el administrador reinició tu contraseña». Se guardan
    // siempre (la lista se ve en Configuración); «visto_en» dice cuándo lo vio al entrar.
    sql: `
CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  numero INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  nombre_propio INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'comercial',
  estado TEXT NOT NULL DEFAULT 'borrador',
  version_activa INTEGER,
  en_papelera INTEGER NOT NULL DEFAULT 0,
  motivo_error TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  UNIQUE (espacio_id, numero)
);
CREATE INDEX IF NOT EXISTS proyectos_espacio ON proyectos(espacio_id, en_papelera);
CREATE TABLE IF NOT EXISTS proyecto_versiones (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  numero INTEGER NOT NULL,
  instrucciones TEXT NOT NULL,
  configuracion TEXT NOT NULL,
  interpretacion TEXT NOT NULL DEFAULT '{}',
  origen TEXT NOT NULL DEFAULT 'instrucciones',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  motivo TEXT,
  creada_por INTEGER REFERENCES usuarios(id),
  creada_en TEXT NOT NULL,
  decidida_por INTEGER REFERENCES usuarios(id),
  decidida_en TEXT,
  UNIQUE (proyecto_id, numero)
);
CREATE TABLE IF NOT EXISTS proyecto_historial (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  fecha TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS proyecto_historial_proyecto ON proyecto_historial(proyecto_id, id);
CREATE TABLE IF NOT EXISTS avisos_cuenta (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  visto_en TEXT
);
CREATE INDEX IF NOT EXISTS avisos_cuenta_usuario ON avisos_cuenta(usuario_id, id);
`,
  },
  {
    id: 4,
    nombre: 'tareas',
    // Fase 1, parte c: la fila de tareas 24/7 y lo que la cuida. Las explicaciones van aquí, FUERA del
    // texto SQL, para que la huella del cambio no dependa de los comentarios.
    //  - tareas: cada trabajo, con su punto de avance (para seguir donde quedó) y su «cerca» (dueno + tomas):
    //    solo quien la tomó, y en esa toma, puede guardar su avance.
    //    Solo el estado lleva CHECK, con los 6 estados que pide el plan. Un CHECK nunca se puede ampliar
    //    (habría que rehacer la tabla, y eso está prohibido), así que todo lo demás se revisa en el código.
    //  - programa + índice único parcial: como mucho UNA tarea viva por programa. clave_unica (la ranura,
    //    por ejemplo 'sistema.vigilar@2026-11-04T06') hace que programar dos veces no cree dos tareas.
    //  - repetible se copia del tipo al crear la tarea: así, aunque se vuelva a un código viejo que no
    //    conoce el tipo, una tarea que no se puede repetir (un correo) nunca se repite sola.
    //  - tarea_eventos: historial que solo crece (errores, esperas, recuperaciones…). Nunca se borra.
    //  - tarea_carriles: tiempo usado por cada cuenta y cada proyecto, para repartir los turnos con justicia.
    //  - trabajador_corridas y servidor_arranques: cada vida del trabajador y del servidor, con la huella
    //    del código que corría, para contar caídas solo del MISMO código.
    //  - salud_muestras: una muestra por hora (la hora es única: nunca dos muestras de la misma hora).
    //  - avisos: para el administrador; enviado_en queda listo para mandarlos por Telegram (parte e).
    sql: `
CREATE TABLE IF NOT EXISTS tareas (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  espacio_id INTEGER REFERENCES espacios(id),
  proyecto_id INTEGER REFERENCES proyectos(id),
  programa TEXT,
  clave_unica TEXT UNIQUE,
  carril_espacio TEXT NOT NULL DEFAULT 'sistema',
  carril_proyecto TEXT NOT NULL DEFAULT 'sistema',
  cupo TEXT NOT NULL DEFAULT 'normal',
  prioridad INTEGER NOT NULL DEFAULT 0,
  repetible INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'lista'
    CHECK (estado IN ('lista', 'en_curso', 'hecha', 'fallida', 'cancelada', 'revisar')),
  datos TEXT NOT NULL DEFAULT '{}',
  punto TEXT,
  resultado TEXT,
  pasos INTEGER NOT NULL DEFAULT 0,
  tomas INTEGER NOT NULL DEFAULT 0,
  fallos_seguidos INTEGER NOT NULL DEFAULT 0,
  max_fallos INTEGER NOT NULL DEFAULT 3,
  disponible_en TEXT NOT NULL,
  motivo_espera TEXT,
  dueno TEXT,
  arriendo_hasta TEXT,
  ultimo_error TEXT,
  ms_usados INTEGER NOT NULL DEFAULT 0,
  creada_por INTEGER REFERENCES usuarios(id),
  creada_en TEXT NOT NULL,
  empezada_en TEXT,
  terminada_en TEXT,
  actualizada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tareas_por_tomar ON tareas(estado, cupo, disponible_en);
CREATE INDEX IF NOT EXISTS tareas_terminadas ON tareas(estado, terminada_en);
CREATE INDEX IF NOT EXISTS tareas_por_espacio ON tareas(espacio_id, id);
CREATE INDEX IF NOT EXISTS tareas_por_proyecto ON tareas(proyecto_id, estado);
CREATE INDEX IF NOT EXISTS tareas_por_dueno ON tareas(dueno, estado);
CREATE UNIQUE INDEX IF NOT EXISTS tareas_una_viva_por_programa ON tareas(programa)
  WHERE programa IS NOT NULL AND estado IN ('lista', 'en_curso', 'revisar');
CREATE TABLE IF NOT EXISTS tarea_eventos (
  id INTEGER PRIMARY KEY,
  tarea_id INTEGER NOT NULL REFERENCES tareas(id),
  fecha TEXT NOT NULL,
  evento TEXT NOT NULL,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS tarea_eventos_tarea ON tarea_eventos(tarea_id, id);
CREATE INDEX IF NOT EXISTS tarea_eventos_fecha ON tarea_eventos(fecha);
CREATE TABLE IF NOT EXISTS tarea_carriles (
  carril TEXT PRIMARY KEY,
  virtual_ms REAL NOT NULL DEFAULT 0,
  peso REAL NOT NULL DEFAULT 1,
  usado_ms INTEGER NOT NULL DEFAULT 0,
  turnos INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trabajador_corridas (
  id INTEGER PRIMARY KEY,
  corrida TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  codigo TEXT NOT NULL DEFAULT '',
  pid INTEGER,
  empezo_en TEXT NOT NULL,
  listo_en TEXT,
  latido_en TEXT,
  termino_en TEXT,
  como_termino TEXT,
  codigo_salida INTEGER,
  senal TEXT,
  memoria_mb REAL,
  pasos_hechos INTEGER NOT NULL DEFAULT 0,
  pasos_con_error INTEGER NOT NULL DEFAULT 0,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS trabajador_corridas_fin ON trabajador_corridas(termino_en);
CREATE TABLE IF NOT EXISTS servidor_arranques (
  id INTEGER PRIMARY KEY,
  version TEXT NOT NULL,
  codigo TEXT NOT NULL DEFAULT '',
  pid INTEGER,
  empezo_en TEXT NOT NULL,
  termino_en TEXT,
  como_termino TEXT
);
CREATE INDEX IF NOT EXISTS servidor_arranques_inicio ON servidor_arranques(empezo_en);
CREATE TABLE IF NOT EXISTS salud_muestras (
  id INTEGER PRIMARY KEY,
  hora TEXT NOT NULL UNIQUE,
  fecha TEXT NOT NULL,
  memoria_total_mb REAL,
  memoria_disponible_mb REAL,
  swap_usada_mb REAL,
  web_mb REAL,
  trabajador_mb REAL,
  disco_libre_mb REAL,
  disco_total_mb REAL,
  base_mb REAL,
  wal_mb REAL,
  copias_mb REAL,
  carga_1m REAL,
  pantallas_p99_ms REAL,
  fila_lista INTEGER,
  fila_en_curso INTEGER,
  fila_fallida INTEGER
);
CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY,
  clave TEXT NOT NULL,
  nivel TEXT NOT NULL DEFAULT 'atencion',
  para TEXT NOT NULL DEFAULT 'admin',
  detalle TEXT,
  veces INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  ultima_vez TEXT NOT NULL,
  resuelto_en TEXT,
  visto_en TEXT,
  visto_por INTEGER REFERENCES usuarios(id),
  enviado_en TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS avisos_abierto_por_clave ON avisos(clave) WHERE resuelto_en IS NULL;
CREATE INDEX IF NOT EXISTS avisos_fecha ON avisos(creado_en);
`,
  },
  {
    id: 5,
    nombre: 'ia',
    // Fase 1, parte d: la IA opcional con topes. Explicaciones FUERA del texto SQL (la huella no depende de ellas).
    //  - secretos: el almacén de claves (IA ahora, el bot de Telegram en la parte e). Solo guarda el texto cifrado
    //    (AES-256-GCM); la llave está en su propio archivo junto a la base (src/claves/cifrado.js), nunca en la base.
    //    ref entra en la AAD.
    //    Nunca se borra una clave: cambiar deja la vieja «reemplazada», desactivar la deja «desactivada».
    //    pausa_*: el proveedor quedó en pausa por un error (pausa_hasta NULL = hasta que el administrador la reanude).
    //  - ia_llamadas: cada intento PAGADO (pasó la reserva). El dinero va en millonésimas de dólar (enteros).
    //    Nunca guarda lo que se preguntó ni lo que se respondió. mes = 'AAAA-MM' del mes de cobro del proveedor
    //    (calendario UTC, el mismo de su factura y de su límite de gasto).
    //  - ia_bloqueos: cuántas veces NO se usó la IA (apagada, tope, pausa…), por mes: crece poco aunque se repita.
    //    Su llave (mes, ambito, motivo, proposito) queda CONGELADA a propósito: una dimensión nueva (por ejemplo,
    //    el proveedor) será una tabla nueva, nunca un cambio de esta.
    //  - cuentas_confianza (ronda 5 de revisión): de dónde vino cada cambio que da acceso al dinero de la IA de una cuenta
    //    (crearla, cambiar su plan, reiniciar su contraseña, volver a activarla) y el permiso del dueño. Una cuenta común
    //    gasta IA solo si su última fila es «confiable» y su huella (contraseña guardada, activa, plan) sigue igual:
    //    un cambio que no quedó anotado (por ejemplo, con la versión anterior del código) la deja sin permiso.
    //  - Sin CHECK y sin reglas únicas de negocio (solo ref, que es al azar, y la llave de conteo de ia_bloqueos):
    //    los valores se revisan en el código (un CHECK o un índice único nunca se pueden quitar ni ampliar).
    sql: `
CREATE TABLE IF NOT EXISTS secretos (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  uso TEXT NOT NULL,
  espacio_id INTEGER REFERENCES espacios(id),
  estado TEXT NOT NULL DEFAULT 'activa',
  origen TEXT NOT NULL DEFAULT 'pegada',
  cifrado BLOB NOT NULL,
  iv BLOB NOT NULL,
  sello BLOB NOT NULL,
  llave_huella TEXT NOT NULL,
  esquema INTEGER NOT NULL DEFAULT 1,
  final TEXT NOT NULL DEFAULT '',
  largo INTEGER NOT NULL DEFAULT 0,
  reemplaza_a INTEGER REFERENCES secretos(id),
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  cambiado_por INTEGER REFERENCES usuarios(id),
  cambiado_en TEXT,
  probado_en TEXT,
  prueba TEXT,
  usado_en TEXT,
  pausa_motivo TEXT,
  pausa_desde TEXT,
  pausa_hasta TEXT
);
CREATE INDEX IF NOT EXISTS secretos_por_uso ON secretos(uso, espacio_id, estado);
CREATE TABLE IF NOT EXISTS ia_llamadas (
  id INTEGER PRIMARY KEY,
  mes TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'reservada',
  resultado TEXT,
  proposito TEXT NOT NULL,
  paso TEXT,
  proveedor TEXT NOT NULL,
  modelo TEXT NOT NULL,
  secreto_id INTEGER REFERENCES secretos(id),
  espacio_id INTEGER REFERENCES espacios(id),
  proyecto_id INTEGER REFERENCES proyectos(id),
  version_numero INTEGER,
  cuenta_proyecto INTEGER NOT NULL DEFAULT 0,
  tarea_id INTEGER REFERENCES tareas(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  entrada_max INTEGER NOT NULL DEFAULT 0,
  salida_max INTEGER NOT NULL DEFAULT 0,
  reservado_micro INTEGER NOT NULL DEFAULT 0,
  tokens_entrada INTEGER,
  tokens_salida INTEGER,
  tokens_cache_lectura INTEGER,
  tokens_cache_escritura INTEGER,
  costo_micro INTEGER,
  precio TEXT NOT NULL DEFAULT '{}',
  id_peticion TEXT,
  http INTEGER,
  duracion_ms INTEGER,
  creada_en TEXT NOT NULL,
  terminada_en TEXT,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS ia_llamadas_mes ON ia_llamadas(mes, estado);
CREATE INDEX IF NOT EXISTS ia_llamadas_espacio ON ia_llamadas(espacio_id, mes);
CREATE INDEX IF NOT EXISTS ia_llamadas_proyecto ON ia_llamadas(proyecto_id, mes);
CREATE INDEX IF NOT EXISTS ia_llamadas_tarea ON ia_llamadas(tarea_id, proposito, paso);
CREATE INDEX IF NOT EXISTS ia_llamadas_fecha ON ia_llamadas(creada_en);
CREATE INDEX IF NOT EXISTS ia_llamadas_reservadas ON ia_llamadas(creada_en) WHERE estado = 'reservada';
CREATE TABLE IF NOT EXISTS ia_bloqueos (
  mes TEXT NOT NULL,
  ambito TEXT NOT NULL,
  motivo TEXT NOT NULL,
  proposito TEXT NOT NULL,
  veces INTEGER NOT NULL DEFAULT 0,
  primera_vez TEXT NOT NULL,
  ultima_vez TEXT NOT NULL,
  PRIMARY KEY (mes, ambito, motivo, proposito)
);
CREATE TABLE IF NOT EXISTS cuentas_confianza (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  desde TEXT NOT NULL,
  confiable INTEGER NOT NULL DEFAULT 0,
  huella TEXT NOT NULL,
  hecho_por INTEGER REFERENCES usuarios(id),
  fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cuentas_confianza_usuario ON cuentas_confianza(usuario_id, id);
`,
  },
  {
    id: 6,
    nombre: 'copias_y_canales',
    // Fase 1, parte e. Explicaciones FUERA del texto SQL (la huella no depende de ellas).
    //  - copias_llaves: las llaves PÚBLICAS de las copias (y el «sello», que firma los índices y no abre nada). La clave
    //    de recuperación del dueño nunca se guarda; «verificador» es el sha256 de un valor derivado de ella que la
    //    página calcula (sirve para comprobarla sin mandarla). Nunca se borran: las copias viejas necesitan su llave vieja.
    //  - canales: por dónde OPORTIA habla con alguien (hoy: el chat privado del dueño con su bot de Telegram). Genérico
    //    para la fase 3+ (tipo, propósito, espacio). Una fila 'pendiente' guarda solo la huella del código de un uso.
    //  - copias / copia_partes: cada copia cifrada (fuera y/o en el servidor), sus partes, hashes y dónde están. Cada
    //    copia guarda el secreto y el bot con que se mandó (una copia nunca mezcla dos bots) y el servidor que la hizo.
    //  - canal_envios: cada mensaje que salió (o no) por un canal: no repetir avisos y los topes por hora y por día.
    //  - canales.pausa_motivo: por qué hay pausa ('limite': Telegram pidió esperar, un 429; 'espera': las esperas tras
    //    fallos; 'bloqueado'). Solo un 429 frena una copia. canales.codigo_intentos_chats: los intentos equivocados del
    //    código de un uso POR chat (JSON { chat: n }): un extraño nunca gasta los del dueño.
    //  - Sin CHECK ni índices únicos: los valores se revisan en el código (un CHECK nunca se puede ampliar).
    sql: `
CREATE TABLE IF NOT EXISTS copias_llaves (
  id INTEGER PRIMARY KEY,
  formato INTEGER NOT NULL DEFAULT 1,
  publica TEXT NOT NULL,
  sello TEXT NOT NULL,
  huella TEXT NOT NULL,
  verificador TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  creada_por INTEGER REFERENCES usuarios(id),
  creada_en TEXT NOT NULL,
  vence_en TEXT,
  confirmada_en TEXT,
  reemplazada_en TEXT,
  comprobada_en TEXT
);
CREATE INDEX IF NOT EXISTS copias_llaves_estado ON copias_llaves(estado, id);
CREATE TABLE IF NOT EXISTS canales (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  proposito TEXT NOT NULL DEFAULT 'avisos_dueno',
  espacio_id INTEGER REFERENCES espacios(id),
  estado TEXT NOT NULL DEFAULT 'pendiente',
  secreto_id INTEGER REFERENCES secretos(id),
  cuenta_id TEXT,
  cuenta_nombre TEXT,
  destino TEXT,
  destino_nombre TEXT,
  codigo_huella TEXT,
  codigo_desde TEXT,
  codigo_hasta TEXT,
  codigo_intentos INTEGER NOT NULL DEFAULT 0,
  novedades_desde INTEGER,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  vinculado_en TEXT,
  desvinculado_por INTEGER REFERENCES usuarios(id),
  desvinculado_en TEXT,
  motivo TEXT,
  ultimo_ok_en TEXT,
  ultimo_error TEXT,
  ultimo_error_en TEXT,
  fallos_seguidos INTEGER NOT NULL DEFAULT 0,
  pausa_hasta TEXT,
  pausa_motivo TEXT,
  codigo_intentos_chats TEXT
);
CREATE INDEX IF NOT EXISTS canales_por_proposito ON canales(tipo, proposito, espacio_id, estado, id);
CREATE TABLE IF NOT EXISTS copias (
  id INTEGER PRIMARY KEY,
  copia TEXT NOT NULL,
  formato INTEGER NOT NULL DEFAULT 1,
  origen TEXT NOT NULL DEFAULT 'noche',
  tarea_id INTEGER REFERENCES tareas(id),
  estado TEXT NOT NULL DEFAULT 'haciendo',
  llave_id INTEGER REFERENCES copias_llaves(id),
  receptor TEXT NOT NULL DEFAULT '',
  local INTEGER NOT NULL DEFAULT 0,
  fuera INTEGER NOT NULL DEFAULT 0,
  canal_id INTEGER REFERENCES canales(id),
  secreto_id INTEGER REFERENCES secretos(id),
  cuenta_id TEXT,
  servidor TEXT,
  partes INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  volcado_bytes INTEGER,
  volcado_sha256 TEXT,
  tablas INTEGER,
  filas INTEGER,
  migracion INTEGER,
  version TEXT,
  sellado TEXT,
  indice_sha256 TEXT,
  indice_mensaje_id INTEGER,
  indice_archivo_id TEXT,
  fijada INTEGER NOT NULL DEFAULT 0,
  motivo TEXT,
  detalle TEXT,
  empezada_en TEXT NOT NULL,
  escrita_en TEXT,
  subida_en TEXT,
  verificada_en TEXT,
  terminada_en TEXT
);
CREATE INDEX IF NOT EXISTS copias_por_fecha ON copias(empezada_en);
CREATE INDEX IF NOT EXISTS copias_por_estado ON copias(estado, verificada_en);
CREATE INDEX IF NOT EXISTS copias_por_uuid ON copias(copia);
CREATE TABLE IF NOT EXISTS copia_partes (
  id INTEGER PRIMARY KEY,
  copia_id INTEGER NOT NULL REFERENCES copias(id),
  n INTEGER NOT NULL,
  desde INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  archivo_local TEXT,
  mensaje_id INTEGER,
  archivo_id TEXT,
  archivo_id_unico TEXT,
  subida_en TEXT,
  verificada_en TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT
);
CREATE INDEX IF NOT EXISTS copia_partes_copia ON copia_partes(copia_id, n);
CREATE TABLE IF NOT EXISTS canal_envios (
  id INTEGER PRIMARY KEY,
  canal_id INTEGER NOT NULL REFERENCES canales(id),
  clase TEXT NOT NULL,
  aviso_id INTEGER REFERENCES avisos(id),
  clave TEXT,
  nivel TEXT,
  copia_id INTEGER REFERENCES copias(id),
  resultado TEXT NOT NULL,
  motivo TEXT,
  mensaje_id INTEGER,
  bytes INTEGER,
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS canal_envios_fecha ON canal_envios(canal_id, creado_en);
CREATE INDEX IF NOT EXISTS canal_envios_aviso ON canal_envios(aviso_id, clase);
CREATE INDEX IF NOT EXISTS canal_envios_clave ON canal_envios(clave, creado_en);
`,
  },
  {
    id: 7,
    nombre: 'academia',
    // Academia (etapa 1, 0.7.0). Explicaciones FUERA del texto SQL (la huella no depende de ellas).
    //  - academia_paquetes: cada paquete de contenido subido (los libros y el Test Guide NUNCA van al repositorio: viven
    //    solo en la carpeta de datos del servidor, OPORTIA_DATOS/academia/paquetes/<id>/). Nunca se borra ni se pisa uno:
    //    subir otro crea una versión nueva; el que está en uso se guarda en ajustes ('academia.paquete_activo').
    //    estado: 'incompleto' (faltan figuras) | 'listo'. huella: sha256 del JSON tal cual se subió.
    //  - academia_intentos: cada práctica de un tema, examen de materia o repaso, con el orden en que salieron las preguntas.
    //  - academia_respuestas: cada respuesta (la pregunta va por su id del paquete, que no cambia entre versiones).
    //    dia: la fecha en Santo Domingo (para la racha).
    //  - academia_repaso: la fila de repaso de cada alumno (cajas de repaso espaciado).
    //  - Sin CHECK, sin UNIQUE y sin ADD COLUMN: los valores se revisan en el código (src/academia/).
    sql: `
CREATE TABLE IF NOT EXISTS academia_paquetes (
  id INTEGER PRIMARY KEY,
  huella TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  edicion TEXT,
  carpeta TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'incompleto',
  muestra INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  materias INTEGER NOT NULL DEFAULT 0,
  temas INTEGER NOT NULL DEFAULT 0,
  preguntas INTEGER NOT NULL DEFAULT 0,
  figuras INTEGER NOT NULL DEFAULT 0,
  subido_por INTEGER REFERENCES usuarios(id),
  subido_en TEXT NOT NULL,
  listo_en TEXT,
  activado_en TEXT,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS academia_paquetes_huella ON academia_paquetes(huella);
CREATE TABLE IF NOT EXISTS academia_intentos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  paquete_id INTEGER REFERENCES academia_paquetes(id),
  tipo TEXT NOT NULL,
  materia TEXT,
  tema TEXT,
  orden TEXT NOT NULL DEFAULT '[]',
  total INTEGER NOT NULL DEFAULT 0,
  respondidas INTEGER NOT NULL DEFAULT 0,
  aciertos INTEGER NOT NULL DEFAULT 0,
  umbral INTEGER,
  aprobado INTEGER,
  empezado_en TEXT NOT NULL,
  terminado_en TEXT
);
CREATE INDEX IF NOT EXISTS academia_intentos_usuario ON academia_intentos(usuario_id, tipo, materia, tema);
CREATE TABLE IF NOT EXISTS academia_respuestas (
  id INTEGER PRIMARY KEY,
  intento_id INTEGER NOT NULL REFERENCES academia_intentos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  pregunta TEXT NOT NULL,
  materia TEXT,
  tema TEXT,
  elegida TEXT NOT NULL,
  correcta INTEGER NOT NULL DEFAULT 0,
  dia TEXT NOT NULL,
  creada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS academia_respuestas_intento ON academia_respuestas(intento_id, pregunta);
CREATE INDEX IF NOT EXISTS academia_respuestas_usuario ON academia_respuestas(usuario_id, pregunta);
CREATE INDEX IF NOT EXISTS academia_respuestas_dia ON academia_respuestas(usuario_id, dia);
CREATE TABLE IF NOT EXISTS academia_repaso (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  pregunta TEXT NOT NULL,
  materia TEXT,
  tema TEXT,
  caja INTEGER NOT NULL DEFAULT 1,
  vence_en TEXT NOT NULL,
  fallos INTEGER NOT NULL DEFAULT 0,
  aciertos INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT NOT NULL,
  PRIMARY KEY (usuario_id, pregunta)
);
CREATE INDEX IF NOT EXISTS academia_repaso_vence ON academia_repaso(usuario_id, vence_en);
`,
  },
];
