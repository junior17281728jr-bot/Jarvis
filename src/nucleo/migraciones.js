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
];
