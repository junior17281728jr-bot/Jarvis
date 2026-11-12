// Academia 0.12.4: lo común de las pruebas del instructor con IA contra el proveedor FALSO (copiado de
// test/instructor-ia.test.js para las pruebas nuevas: test/ia-0124.test.js). Nunca una API ni una clave de verdad.
import { configDePrueba, conServidor, esperarHasta } from './ayuda.js';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { guardarSecreto, anotarPrueba } from '../src/claves/almacen.js';
import { guardarConfigPagos } from '../src/academia/tiempo-ia.js';
import { guardarConfigIa } from '../src/ia/config.js';
import { crearEjecutor } from '../src/tareas/ejecutor.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import { nuevaCorrida } from '../src/tareas/corridas.js';
import { TIPOS } from '../src/tareas/tipos.js';
import { MANEJADORES } from '../src/tareas/manejadores.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { claveAnthropic, permitirIa } from './ia-base.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

export const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
export const FUNNEL = { 'Tailscale-Funnel-Request': '?1' };
export const CLAVE = 'una clave bien larga';
export const MUESTRA = paqueteMuestra();
export const DE = id => MUESTRA.preguntas.find(q => q.id === id);
export const SILENCIO = { log() {}, error() {}, warn() {}, info() {} };
// Nombres que no aparecen en ningún texto del paquete: si alguno llega al proveedor, es un dato personal que se escapó.
export const NOMBRES = ['zoelia', 'quirino'];

export async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}

// Lo que la IA de mentira responde para explicar (bien, o diciendo otra correcta).
export const explicacionFalsa = (correcta, extra = {}) => ({
  tipo: 'ok',
  json: { opcion_correcta: correcta, explicacion: 'Arriba hay menos presión y por eso entra menos oxígeno (oxygen).', por_que_no: 'Esa opción confunde la idea.', recuerda: 'Menos presión, menos oxígeno.', terminos: [{ ingles: 'hypoxia', espanol: 'hipoxia', abreviatura: '' }], ...extra },
});

export async function conInstructor(fn, { pagos = 'minutos', modelo = 'claude-sonnet-5-5', topePlan = 1_000_000, permitir = true, encender = true } = {}) {
  const falso = await crearProveedorFalso();
  const config = { ...configDePrueba(), iaBases: { anthropic: falso.base, openai: falso.base } };
  const db = abrirBase(config);
  const despertares = [];
  const servidor = crearServidor({ db, config, supervisor: { despertar: () => despertares.push(1) } });
  const corrida = nuevaCorrida(db, { version: 'prueba', codigo: 'prueba' });
  const escritor = crearEscritor(db, { registro: SILENCIO, dormir: async () => {} });
  const ejecutor = crearEjecutor({
    db, config, corrida, escritor, registro: TIPOS, manejadores: MANEJADORES, tiempos: { rssMaxMb: 1e9 }, programas: [],
    memoriaDisponibleMb: () => 1000, discoLibreMb: () => 100_000, pedirSalida: () => {}, log: SILENCIO,
  });
  const fila = id => db.prepare('SELECT * FROM tareas WHERE id = ?').get(id);
  const hacer = async id => {
    await esperarHasta(async () => { await ejecutor.ciclo(); return ['hecha', 'fallida', 'revisar'].includes(fila(id).estado); }, { que: `la tarea ${id}`, cada: 10 });
    return { ...fila(id), resultado: JSON.parse(fila(id).resultado ?? 'null') };
  };
  try {
    await conServidor(servidor, async base => {
      const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      const adminId = db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
      const alumnos = {};
      for (const nombre of NOMBRES) {
        const id = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false, creadoPor: adminId });
        if (permitir) permitirIa(db, id, adminId);
        alumnos[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
      }
      const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
      for (const archivo of s.datos.faltan) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} });
      // 0.12.7: estas pruebas son del «tiempo con IA» por minutos (el modo de antes, que sigue existiendo); los planes y la
      // prueba gratis se prueban en test/planes-ia.test.js.
      guardarConfigPagos(db, { modo: pagos });
      const secretoId = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: adminId }).secreto.id;
      anotarPrueba(db, { id: secretoId, motivo: 'ok' });
      guardarConfigIa(db, { topeGeneralMicro: 2_000_000, topesPlanMicro: { prueba: topePlan } }, { config, usuarioId: adminId });
      if (encender) {
        guardarConfigIa(db, { encendida: true }, { config, usuarioId: adminId });
        // El interruptor del instructor y su modelo, por la ruta del dueño (desde su cuenta de Tailscale).
        const r = await pedir(base, 'POST', '/api/admin/ia/ajustes', { galleta: admin, cabeceras: DUENO, datos: { instructorIa: true, instructorModelo: modelo } });
        assert.equal(r.codigo, 200, JSON.stringify(r.datos));
        assert.equal(r.datos.instructorIa, true);
        assert.equal(r.datos.instructorModelo, modelo);
      }
      await fn({ base, db, config, falso, admin, adminId, secretoId, hacer, fila, despertares, z: alumnos.zoelia, q: alumnos.quirino });
    });
  } finally {
    db.close();
    await falso.cerrar?.();
  }
}

export const nuevo = (c, galleta, datos) => pedir(c.base, 'POST', '/api/academia/intentos', { galleta, datos });
export const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);
// Un intento del tema 1 con la primera pregunta respondida mal. → { intento, pregunta }
export async function unaMala(c, galleta, preguntaId = null) {
  const i = (await nuevo(c, galleta, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
  const q = preguntaId ? i.preguntas.find(x => x.id === preguntaId) : i.preguntas[0];
  assert.equal((await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: mala(q.id) } })).codigo, 200);
  return { intento: i, pregunta: q };
}
export const explicar = (c, galleta, x) => pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta, datos: { intento: x.intento.id, pregunta: x.pregunta.id, ia: true } });
export const datosDe = texto => JSON.parse(/<datos>\n([\s\S]*)\n<\/datos>/.exec(texto)[1]);
export const pedidosIa = c => c.falso.peticiones.filter(p => p.ruta === '/v1/messages');
// 0.12.7: el sistema puede ir como texto o como bloques (con la marca de la caché): su texto.
export const sistemaDe = cuerpo => (typeof cuerpo.system === 'string' ? cuerpo.system : cuerpo.system.map(b => b.text).join(''));
export const cuerpoDe = p => (typeof p.cuerpo === 'string' ? JSON.parse(p.cuerpo) : p.cuerpo);
export const textoDe = p => (typeof p.cuerpo === 'string' ? p.cuerpo : JSON.stringify(p.cuerpo));

