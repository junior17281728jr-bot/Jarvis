// Lo que pasa cuando una tarea de un proyecto queda «fallida» (fase 1, parte c): el proyecto, si estaba en marcha, pasa
// a «con errores» y queda en su historial. 0.8.0: los proyectos de OPORTIA se quitaron (sus tablas siguen: las
// migraciones solo agregan); la fila de tareas sigue llamando a esto para las tareas viejas que tengan proyecto.
import { enTransaccion } from '../nucleo/db.js';

export function marcarConErrores(db, proyectoId, motivo) {
  return enTransaccion(db, () => {
    const p = db.prepare('SELECT id, estado, en_papelera FROM proyectos WHERE id = ?').get(Number(proyectoId));
    if (!p || p.estado !== 'en_ejecucion' || p.en_papelera === 1) return false;
    const razon = String(motivo ?? '').trim().slice(0, 300) || null;
    const ahora = new Date().toISOString();
    db.prepare('UPDATE proyectos SET estado = ?, motivo_error = ?, actualizado_en = ? WHERE id = ?').run('con_errores', razon, ahora, p.id);
    db.prepare('INSERT INTO proyecto_historial (proyecto_id, fecha, usuario_id, accion, detalle) VALUES (?, ?, ?, ?, ?)')
      .run(p.id, ahora, null, 'con_errores', JSON.stringify({ motivo: razon }));
    return true;
  });
}
