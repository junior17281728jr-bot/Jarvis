// El espacio de una cuenta (fase 1, parte b). 0.8.0: los proyectos de OPORTIA se quitaron, pero las tablas siguen (las
// migraciones solo agregan) y la IA y las tareas todavía separan lo del administrador por su espacio: aquí queda solo eso.
// → null si la cuenta no tiene espacio; si no, { id, rol, plan, esDueno }.
export function espacioDe(db, usuario) {
  const fila = db.prepare(`SELECT m.espacio_id, m.rol, e.plan FROM miembros m JOIN espacios e ON e.id = m.espacio_id
    WHERE m.usuario_id = ? ORDER BY CASE m.rol WHEN 'dueno' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, m.espacio_id LIMIT 1`).get(usuario.id);
  if (!fila) return null;
  return { id: fila.espacio_id, rol: fila.rol, plan: fila.plan, esDueno: fila.rol === 'dueno' };
}
