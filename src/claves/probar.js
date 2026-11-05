// La prueba GRATIS de una clave (la hace el servidor web, también en modo seguro). Nunca gasta saldo:
//  - Claude: contar los tokens de «Hola» con el modelo configurado (POST /v1/messages/count_tokens, gratis; además dice
//    si esa clave puede usar ese modelo).
//  - ChatGPT: leer los datos del modelo configurado (GET /v1/models/<modelo>, no usa tokens).
// Nunca llama a /v1/messages ni a /v1/responses. Pasa por src/ia/llamar.js (solo el servidor oficial; en las pruebas,
// solo el proveedor falso en 127.0.0.1; nunca sigue una redirección).
// «Probar y reanudar»: si la prueba pasa, se quita la pausa del dueño (queda en la auditoría) y se cierra el aviso de ese
// proveedor. La prueba no ve el saldo: si sigue sin saldo, el próximo uso pagado la vuelve a pausar sola, sin costo.
// PROBADORES es un mapa uso → función, para que la parte e agregue el bot de Telegram sin tocar este archivo.
import { enTransaccion } from '../nucleo/db.js';
import { ErrorHttp } from '../nucleo/http.js';
import { auditar } from '../cuentas/usuarios.js';
import { resolverAviso } from '../avisos/avisos.js';
import { MOTIVOS } from '../ia/propositos.js';
import { leerConfigIa } from '../ia/config.js';
import { llamarProveedor } from '../ia/llamar.js';
import { PROVEEDORES, urlDe } from '../ia/proveedores/index.js';
import { leerSecreto, validarValor, anotarPrueba, reanudarSecreto, secretoPublico } from './almacen.js';
import { definicionUso } from './usos.js';
import { estadoLlave } from './cifrado.js';

export const PRUEBA_MS = 10_000;

function probadorIa(id) {
  return async (clave, { db, config, senal = null }) => {
    const adaptador = PROVEEDORES[id];
    const modelo = leerConfigIa(db).proveedores[id]?.modelo;
    const p = adaptador.prueba({ modelo });
    const respuesta = await llamarProveedor({
      url: urlDe(adaptador, config, p.ruta), metodo: p.metodo, cabeceras: adaptador.cabeceras(clave), cuerpo: p.cuerpo,
      senal, timeoutMs: PRUEBA_MS, permitido: adaptador.host,
    });
    return adaptador.leerPrueba(respuesta);
  };
}

export const PROBADORES = Object.freeze({
  ia_anthropic: probadorIa('anthropic'),
  ia_openai: probadorIa('openai'),
});

const numero = id => {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// Prueba una clave ACTIVA. Devuelve { motivo, reanudada, secreto } (secreto: solo lo público). 404 si no existe o no
// está activa. reanudar: además, si pasa, quita su pausa del dueño.
export async function probarSecreto(db, config, { id, usuarioId = null, reanudar = false, probadores = PROBADORES, senal = null, ahora = Date.now }) {
  const n = numero(id);
  const fila = n == null ? null : db.prepare('SELECT * FROM secretos WHERE id = ?').get(n);
  if (!fila || fila.estado !== 'activa') throw new ErrorHttp(404, 'no_existe');
  const def = definicionUso(fila.uso);
  const probador = probadores?.[fila.uso];
  let motivo;
  let valor = leerSecreto(db, config, { id: fila.id });
  if (valor == null) motivo = 'clave_ilegible';
  else {
    try {
      valor = validarValor(fila.uso, valor);
    } catch {
      valor = null;
      motivo = 'clave_no_valida';
    }
  }
  if (!motivo) {
    try {
      motivo = typeof probador === 'function' ? await probador(valor, { db, config, senal }) : 'error_proveedor';
    } catch {
      motivo = 'error_proveedor';
    } finally {
      valor = null;
    }
    if (!MOTIVOS.includes(motivo)) motivo = 'error_proveedor';
  }
  const momento = typeof ahora === 'function' ? ahora() : ahora;
  const reanudada = enTransaccion(db, () => {
    anotarPrueba(db, { id: fila.id, motivo, ahora: momento });
    auditar(db, { usuarioId, accion: 'clave_probada', detalle: `${fila.uso} …${fila.final}: ${motivo}` });
    if (!(reanudar && motivo === 'ok')) return false;
    const quitada = reanudarSecreto(db, { id: fila.id, usuarioId });
    if (def?.proveedor) resolverAviso(db, `ia_proveedor:${def.proveedor}`, momento);
    // El aviso de «costó más de lo apartado» se cierra cuando ya ninguna clave sigue en pausa por eso.
    const otraConCostoMayor = db.prepare("SELECT 1 FROM secretos WHERE estado = 'activa' AND pausa_motivo = 'costo_mayor' LIMIT 1").get();
    if (!otraConCostoMayor) resolverAviso(db, 'ia_costo_mayor', momento);
    return quitada;
  });
  const llave = estadoLlave(config);
  const actual = db.prepare('SELECT * FROM secretos WHERE id = ?').get(fila.id);
  return { motivo, reanudada, secreto: secretoPublico(actual, { huellaActual: llave.listo ? llave.huella : null, ahora: momento }) };
}
