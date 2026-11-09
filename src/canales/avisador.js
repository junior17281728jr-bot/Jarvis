// El que MANDA los avisos graves al Telegram del dueño (fase 1, parte e). Corre en el proceso WEB, no en el trabajador:
// el trabajador es justo lo que se apaga (modo seguro) o se cae, y esos avisos tienen que llegar igual.
//  - Una pasada cada 15 s, como mucho UN mensaje por pasada, nunca esperada por una pantalla; empieza después de abrir
//    el puerto; se traga sus propios errores (anota solo un código corto).
//  - Qué va y qué suena: RUTA_AVISOS (vaPorTelegram). Solo lo grave suena; lo demás llega en silencio.
//  - No repetir: avisos.enviado_en (la parte c y la d lo vacían cuando el aviso sube a grave o es una noticia nueva:
//    «reenviar»). Solo avisos de las últimas 48 h. Lo que NO es grave y va y viene se calla 6 h; lo grave nunca se calla:
//    si vuelve después de «Ya se arregló», llega como «Volvió a pasar» y suena (si vuelve 3 veces en 6 h, se juntan en un
//    mensaje cada 30 min como mucho).
//  - Topes por chat: 10 por hora y 30 por día, contando SOLO los mensajes de avisos (nunca las partes de las copias).
//    Lo grave nunca se pierde: espera. Con 3 o más pendientes, va UN mensaje que los junta.
//  - Primero se manda y después se anota (en una transacción): una caída entre medio puede repetir un mensaje, nunca
//    perderlo.
//  - También revisa, cada 5 min, si las copias se atrasaron (copia_atrasada): así un trabajador caído no esconde que
//    las copias se pararon.
import { enTransaccion } from '../nucleo/db.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { copiaAtrasada } from '../copias/estado.js';
import { conCredencial } from './credencial.js';
import { ADAPTADORES, esPasajero } from './canal.js';
import { USO, listoParaMandar, anotarEnvio, anotarProblema, marcarBien, enviadosDesde, rangoDe } from './canales.js';
import { textoDeAviso, textoCierre, textoResumen, idiomaDelDueno, baseDeClave } from './textos.js';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
export const TOPES_ENVIO = Object.freeze({
  porHora: 10, porDia: 30, frescuraMs: 48 * HORA, reenvioMinMs: 30 * MINUTO, callarMs: 6 * HORA, cierreMs: 24 * HORA,
  juntarDesde: 3, reaperturasParaJuntar: 3, fallidoMs: 24 * HORA, atrasadaCadaMs: 5 * MINUTO, cadaMs: 15_000,
});

// Lo que va por Telegram (además de TODO lo grave, que va siempre y suena). Ver diseno-1e §7.2.
export const RUTA_AVISOS = Object.freeze({
  claves: Object.freeze(['trabajador_reinicios', 'disco_bajo', 'memoria_baja', 'copias_locales_pausadas', 'copias_sin_clave', 'copias_comprobar_clave',
    'copias_disco_pronto', 'copia_sin_fijar', 'copia_fallida', 'copia_atrasada', 'ia_costo_mayor', 'ia_llave', 'base_danada']),
  prefijos: Object.freeze(['actualizacion_no_instalada', 'actualizacion_revertida', 'ia_tope', 'ia_proveedor']),
  // Nunca (solo en la pantalla), aunque estén en la lista de arriba por su nivel: el modo seguro puesto a mano es «info».
});

// → { va, suena }. Pura.
export function vaPorTelegram(aviso) {
  if (!aviso) return { va: false, suena: false };
  if (aviso.nivel === 'grave') return { va: true, suena: true };
  const base = baseDeClave(aviso.clave);
  const va = RUTA_AVISOS.claves.includes(base) || (String(aviso.clave).includes(':') && RUTA_AVISOS.prefijos.includes(base));
  return { va: va && aviso.nivel !== 'info', suena: false };
}

const iso = ms => new Date(ms).toISOString();

export function crearAvisador({ db, config, reloj = Date.now, adaptador = ADAPTADORES.telegram, registro = null, topes = {} } = {}) {
  const T = { ...TOPES_ENVIO, ...topes };
  let temporizador = null;
  let enMarcha = null;
  let ultimaAtrasada = -Infinity;
  let parado = false;
  const anotar = codigo => { try { registro?.error?.(`Avisos por Telegram: ${codigo}`); } catch { /* nada */ } };

  function revisarAtrasada(ahora) {
    if (ahora - ultimaAtrasada < T.atrasadaCadaMs) return;
    ultimaAtrasada = ahora;
    const r = copiaAtrasada(db, ahora);
    enTransaccion(db, () => {
      if (r.activo) abrirAviso(db, { clave: 'copia_atrasada', nivel: 'grave', detalle: { ...r.detalle, modoSeguro: leerModoSeguro(db).activo }, ahora });
      else resolverAviso(db, 'copia_atrasada', ahora);
    });
  }

  // Marca un aviso que no se va a mandar (no va, ya estaba antes de unir el chat, callado…).
  function marcarSinMandar(canal, a, resultado, ahora) {
    enTransaccion(db, () => {
      db.prepare('UPDATE avisos SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL').run(iso(ahora), a.id);
      anotarEnvio(db, { canalId: canal.id, clase: 'aviso', avisoId: a.id, clave: a.clave, nivel: a.nivel, resultado, ahora });
    });
  }

  const ultimoEnvioDe = (sql, ...valores) => db.prepare(`SELECT creado_en FROM canal_envios WHERE resultado IN ('enviado', 'agrupado') AND ${sql}
    ORDER BY id DESC LIMIT 1`).get(...valores)?.creado_en ?? null;

  // Lo que toca mandar ahora: [{ a, titulo, suena, veces, desde }] (lo grave primero).
  function pendientes(canal, ahora) {
    const candidatos = db.prepare(`SELECT * FROM avisos WHERE enviado_en IS NULL AND resuelto_en IS NULL AND ultima_vez >= ?
      ORDER BY CASE nivel WHEN 'grave' THEN 0 ELSE 1 END, ultima_vez, id LIMIT 20`).all(iso(ahora - T.frescuraMs));
    const toca = [];
    for (const a of candidatos) {
      const ruta = vaPorTelegram(a);
      if (!ruta.va) { marcarSinMandar(canal, a, 'no_va', ahora); continue; }
      if (canal.vinculado_en && a.ultima_vez < canal.vinculado_en) { marcarSinMandar(canal, a, 'antes_de_conectar', ahora); continue; }
      // La misma fila, otra vez (subió a grave, o una noticia nueva): no antes de 30 min desde la última vez.
      const mismo = ultimoEnvioDe('aviso_id = ?', a.id);
      if (mismo && ahora - Date.parse(mismo) < T.reenvioMinMs) continue;
      const desde6h = iso(ahora - T.callarMs);
      if (a.nivel !== 'grave') {
        // Va y viene: otra fila de la misma clave ya se mandó en 6 h con el mismo nivel o más → se calla.
        const otras = db.prepare(`SELECT e.nivel FROM canal_envios e WHERE e.clave = ? AND e.aviso_id <> ? AND e.creado_en >= ? AND e.resultado IN ('enviado', 'agrupado')
          AND e.clase IN ('aviso', 'resumen')`).all(a.clave, a.id, desde6h);
        if (otras.some(o => rangoDe(o.nivel) >= rangoDe(a.nivel))) { marcarSinMandar(canal, a, 'silenciado', ahora); continue; }
        toca.push({ a, titulo: 'atencion', suena: false });
        continue;
      }
      // Lo grave nunca se calla.
      const antes = ultimoEnvioDe("clave = ? AND aviso_id <> ? AND creado_en >= ? AND clase IN ('aviso', 'resumen')", a.clave, a.id, desde6h);
      if (!antes) { toca.push({ a, titulo: 'grave', suena: true }); continue; }
      const reaperturas = db.prepare('SELECT COUNT(*) AS n, MIN(creado_en) AS desde FROM avisos WHERE clave = ? AND creado_en >= ?').get(a.clave, desde6h);
      if (reaperturas.n >= T.reaperturasParaJuntar) {
        if (ahora - Date.parse(antes) < T.reenvioMinMs) continue; // se juntan: un mensaje cada 30 min como mucho
        toca.push({ a, titulo: 'volvio', suena: true, veces: reaperturas.n, desde: reaperturas.desde });
      } else toca.push({ a, titulo: 'volvio', suena: true });
    }
    return toca;
  }

  // Los graves que ya se mandaron y se arreglaron en las últimas 24 h, sin su «Ya se arregló».
  function cierres(ahora) {
    return db.prepare(`SELECT a.* FROM avisos a WHERE a.nivel = 'grave' AND a.resuelto_en IS NOT NULL AND a.resuelto_en >= ?
      AND EXISTS (SELECT 1 FROM canal_envios e WHERE e.aviso_id = a.id AND e.resultado IN ('enviado', 'agrupado') AND e.clase IN ('aviso', 'resumen'))
      AND NOT EXISTS (SELECT 1 FROM canal_envios e WHERE e.aviso_id = a.id AND e.clase = 'cierre')
      ORDER BY a.resuelto_en LIMIT 5`).all(iso(ahora - T.cierreMs));
  }

  async function mandar(listo, mensaje, ahora) {
    const { canal } = listo;
    const r = await conCredencial(db, config, { uso: USO, secretoId: canal.secreto_id }, cred => adaptador.enviarTexto(cred, {
      destino: canal.destino, texto: mensaje.texto, silencioso: !mensaje.suena,
    }));
    const momento = reloj();
    if (r.motivo === 'ok') {
      enTransaccion(db, () => {
        for (const item of mensaje.avisos) {
          db.prepare('UPDATE avisos SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL').run(iso(momento), item.id);
          anotarEnvio(db, { canalId: canal.id, clase: mensaje.clase === 'resumen' ? 'aviso' : mensaje.clase, avisoId: item.id, clave: item.clave, nivel: item.nivel,
            resultado: mensaje.clase === 'resumen' ? 'agrupado' : 'enviado', mensajeId: r.mensajeId, ahora: momento });
        }
        if (mensaje.clase === 'resumen') anotarEnvio(db, { canalId: canal.id, clase: 'resumen', resultado: 'enviado', mensajeId: r.mensajeId, ahora: momento });
        marcarBien(db, canal.id, momento);
      });
      return { enviado: mensaje.clase, avisos: mensaje.avisos.map(a => a.id), suena: mensaje.suena };
    }
    enTransaccion(db, () => {
      if (r.motivo === 'sin_clave' || r.motivo === 'credencial_cambiada') return;
      anotarProblema(db, canal, { motivo: r.motivo, esperarMs: r.esperarMs, ahora: momento });
      // Un aviso que no se pudo mandar en 24 h queda «fallido» (sigue en la pantalla).
      if (esPasajero(r.motivo) && r.motivo !== 'limite') {
        for (const item of mensaje.avisos) {
          if (mensaje.clase !== 'cierre' && Date.parse(item.ultima_vez) < momento - T.fallidoMs) {
            db.prepare('UPDATE avisos SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL').run(iso(momento), item.id);
            anotarEnvio(db, { canalId: canal.id, clase: 'aviso', avisoId: item.id, clave: item.clave, nivel: item.nivel, resultado: 'fallido', motivo: r.motivo, ahora: momento });
          }
        }
      }
    });
    anotar(r.motivo);
    return { enviado: null, motivo: r.motivo };
  }

  async function pasadaDeVerdad() {
    const ahora = reloj();
    revisarAtrasada(ahora);
    const listo = listoParaMandar(db, config, ahora);
    if (!listo.si) return { enviado: null, motivo: listo.motivo };
    const { canal } = listo;
    const toca = pendientes(canal, ahora);
    const porCerrar = cierres(ahora);
    if (!toca.length && !porCerrar.length) return { enviado: null, motivo: 'nada' };
    if (enviadosDesde(db, canal.id, ahora - HORA) >= T.porHora || enviadosDesde(db, canal.id, ahora - 24 * HORA) >= T.porDia) {
      return { enviado: null, motivo: 'tope' };
    }
    const idioma = idiomaDelDueno(db);
    let mensaje;
    if (toca.length >= T.juntarDesde) {
      mensaje = { clase: 'resumen', avisos: toca.map(x => x.a), suena: toca.some(x => x.suena), texto: textoResumen(toca.map(x => x.a), idioma) };
    } else if (toca.length) {
      const x = toca[0];
      mensaje = { clase: 'aviso', avisos: [x.a], suena: x.suena, texto: textoDeAviso(x.a, idioma, { titulo: x.titulo, veces: x.veces, desde: x.desde }) };
    } else {
      const a = porCerrar[0];
      mensaje = { clase: 'cierre', avisos: [a], suena: false, texto: textoCierre(a, idioma) };
    }
    return mandar(listo, mensaje, ahora);
  }

  // Una pasada (la usan el temporizador y las pruebas). Nunca lanza.
  async function pasada() {
    if (enMarcha) return enMarcha;
    enMarcha = (async () => {
      try {
        return await pasadaDeVerdad();
      } catch (error) {
        anotar(error?.codigo ?? error?.code ?? error?.name ?? 'error');
        return { enviado: null, motivo: 'error' };
      } finally {
        enMarcha = null;
      }
    })();
    return enMarcha;
  }

  return {
    pasada,
    iniciar() {
      if (temporizador || parado) return;
      temporizador = setInterval(() => { pasada(); }, T.cadaMs);
      temporizador.unref?.();
      const primera = setTimeout(() => { if (!parado) pasada(); }, Math.min(5000, T.cadaMs));
      primera.unref?.();
    },
    async parar() {
      parado = true;
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
      if (enMarcha) await Promise.race([enMarcha, new Promise(listo => setTimeout(listo, 3000).unref?.())]);
    },
  };
}
