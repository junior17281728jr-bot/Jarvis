// Academia (0.7.1): lo que se guarda de la carpeta de Google Drive, en los ajustes de la base (nunca en el repositorio):
//  - 'academia.drive.carpeta': el id de la carpeta (lo pega el administrador una vez, en Administrador → Contenido).
//  - 'academia.drive.revisiones': las últimas revisiones (cuándo, qué encontró, qué entró, qué falló), la más nueva primero.
//  - 'academia.drive.memoria': para no repetir trabajo: la huella de cada archivo de Drive ya visto (con su fecha de la
//    lista) y las huellas de los paquetes rechazados (un paquete mal armado se informa una vez, no cada hora).
// Lo usan las dos partes: la pantalla (leer, guardar la carpeta) y el trabajador (src/academia/sincronizar.js).
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { ID_DRIVE, enlaceDeCarpeta } from './drive.js';

export const AJUSTE_CARPETA = 'academia.drive.carpeta';
export const AJUSTE_REVISIONES = 'academia.drive.revisiones';
export const AJUSTE_MEMORIA = 'academia.drive.memoria';
export const PROGRAMA_DRIVE = 'academia.drive';
export const REVISIONES_GUARDADAS = 20;
const ARCHIVOS_RECORDADOS = 400;
const RECHAZOS_RECORDADOS = 200;

const leerJson = (db, clave, porDefecto) => {
  try { const v = JSON.parse(leerAjuste(db, clave) ?? 'null'); return v ?? porDefecto; } catch { return porDefecto; }
};

export function carpetaDrive(db) {
  const id = leerAjuste(db, AJUSTE_CARPETA);
  return id && ID_DRIVE.test(id) ? id : null;
}
export function guardarCarpetaDrive(db, id) {
  guardarAjuste(db, AJUSTE_CARPETA, id && ID_DRIVE.test(id) ? id : '');
}

export function leerRevisiones(db) {
  const lista = leerJson(db, AJUSTE_REVISIONES, []);
  return Array.isArray(lista) ? lista.filter(r => r && typeof r.en === 'string').slice(0, REVISIONES_GUARDADAS) : [];
}
export function anotarRevision(db, informe) {
  const lista = [informe, ...leerRevisiones(db)].slice(0, REVISIONES_GUARDADAS);
  let texto = JSON.stringify(lista);
  // Nunca crece sin fin: si pasa de 60 KB, se guardan menos.
  for (let n = lista.length - 1; texto.length > 60_000 && n > 1; n--) texto = JSON.stringify(lista.slice(0, n));
  guardarAjuste(db, AJUSTE_REVISIONES, texto);
}

export function leerMemoria(db) {
  const m = leerJson(db, AJUSTE_MEMORIA, {});
  return {
    archivos: m && typeof m.archivos === 'object' && !Array.isArray(m.archivos) ? m.archivos : {},
    rechazados: m && typeof m.rechazados === 'object' && !Array.isArray(m.rechazados) ? m.rechazados : {},
  };
}
export function guardarMemoria(db, memoria) {
  const archivos = Object.entries(memoria.archivos).slice(-ARCHIVOS_RECORDADOS);
  const rechazados = Object.entries(memoria.rechazados).slice(-RECHAZOS_RECORDADOS);
  guardarAjuste(db, AJUSTE_MEMORIA, JSON.stringify({ archivos: Object.fromEntries(archivos), rechazados: Object.fromEntries(rechazados) }));
}

// Lo que ve el administrador en Contenido (nunca un alumno).
export function estadoDrive(db) {
  const id = carpetaDrive(db);
  const revisiones = leerRevisiones(db);
  const viva = db.prepare("SELECT id, estado FROM tareas WHERE programa = ? AND estado IN ('lista', 'en_curso') ORDER BY id DESC LIMIT 1").get(PROGRAMA_DRIVE);
  return {
    carpeta: id ? { id, enlace: enlaceDeCarpeta(id) } : null,
    ultima: revisiones[0] ?? null,
    revisiones: revisiones.slice(0, 8),
    enMarcha: Boolean(viva),
  };
}
