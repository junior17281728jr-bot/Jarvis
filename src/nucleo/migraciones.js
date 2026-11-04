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
    sql: `
CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'comercial' CHECK (tipo IN ('comercial', 'laboral')),
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'pendiente', 'en_ejecucion', 'pausado', 'completado', 'con_errores')),
  version_activa INTEGER,
  en_papelera INTEGER NOT NULL DEFAULT 0,
  motivo_error TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS proyectos_espacio ON proyectos(espacio_id, en_papelera);
CREATE TABLE IF NOT EXISTS proyecto_versiones (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  numero INTEGER NOT NULL,
  instrucciones TEXT NOT NULL,
  configuracion TEXT NOT NULL,
  interpretacion TEXT NOT NULL DEFAULT '{}',
  origen TEXT NOT NULL DEFAULT 'instrucciones' CHECK (origen IN ('instrucciones', 'campos')),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'reemplazada', 'descartada')),
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
];
