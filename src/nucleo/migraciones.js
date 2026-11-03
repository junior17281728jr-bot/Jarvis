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
];
