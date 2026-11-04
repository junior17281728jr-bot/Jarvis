// Planes de cada cuenta: cuántos proyectos puede tener en uso a la vez.
// Una cuenta nueva empieza en «prueba» (1 proyecto). El administrador le puede dar más desde
// «Administrador» (control «Proyectos permitidos»): pago = 5, empresarial = 20. El administrador tiene 20.
// Nunca se baja una cuenta por debajo de los proyectos que ya tiene en uso: se responde un error claro.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';

export const LIMITE_POR_PLAN = Object.freeze({ prueba: 1, pago: 5, empresarial: 20 });
export const PLANES = Object.keys(LIMITE_POR_PLAN);
export const PLAN_POR_DEFECTO = 'prueba';
export const LIMITE_ADMINISTRADOR = 20;

// Proyectos en uso que permite un plan. Un plan desconocido cuenta como «prueba» (lo más pequeño).
export function limiteDe(plan, rolUsuario = 'usuario') {
  const delPlan = Object.hasOwn(LIMITE_POR_PLAN, plan) ? LIMITE_POR_PLAN[plan] : LIMITE_POR_PLAN[PLAN_POR_DEFECTO];
  return rolUsuario === 'admin' ? Math.max(delPlan, LIMITE_ADMINISTRADOR) : delPlan;
}

// Proyectos guardados en total (en uso + papelera). Nada se borra nunca, así que este tope cuida el disco
// del servidor: al llegar, se restaura o se cambia uno que ya existe, o se le piden más al administrador.
export function guardadosPermitidos(limite) {
  return Math.max(10, limite * 3);
}

export function contarProyectos(db, espacioId) {
  const fila = db.prepare('SELECT COUNT(*) AS guardados, COALESCE(SUM(en_papelera = 0), 0) AS activos FROM proyectos WHERE espacio_id = ?').get(espacioId);
  return { activos: fila.activos, guardados: fila.guardados };
}

// El espacio del que la persona es dueña (ahí viven sus proyectos y su plan).
export function espacioPropio(db, usuarioId) {
  return db.prepare(`SELECT e.id, e.plan FROM miembros m JOIN espacios e ON e.id = m.espacio_id
    WHERE m.usuario_id = ? AND m.rol = 'dueno' ORDER BY e.id LIMIT 1`).get(usuarioId) || null;
}

export function planesPublicos() {
  return PLANES.map(clave => ({ clave, proyectos: LIMITE_POR_PLAN[clave] }));
}

// Cambia el plan de una cuenta. Devuelve { antes, ahora, limite }. «alCambiar» corre dentro de la misma
// transacción (la ruta del administrador lo usa para dejarlo en la auditoría): o queda todo, o nada.
export function cambiarPlan(db, { usuario, plan, alCambiar = () => {} }) {
  if (typeof plan !== 'string' || !Object.hasOwn(LIMITE_POR_PLAN, plan)) throw new ErrorHttp(400, 'plan_no_valido');
  return enTransaccion(db, () => {
    const espacio = espacioPropio(db, usuario.id);
    if (!espacio) throw new ErrorHttp(409, 'sin_espacio');
    const limite = limiteDe(plan, usuario.rol);
    if (contarProyectos(db, espacio.id).activos > limite) throw new ErrorHttp(409, 'plan_menor_que_activos');
    if (espacio.plan !== plan) {
      db.prepare('UPDATE espacios SET plan = ? WHERE id = ?').run(plan, espacio.id);
      alCambiar(espacio.plan, plan);
    }
    return { antes: espacio.plan, ahora: plan, limite };
  });
}
