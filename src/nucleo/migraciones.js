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
];
