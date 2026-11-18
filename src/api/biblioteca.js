// Academia 0.14.20: las rutas de la «Biblioteca» y de «Ver en el Test Guide» (src/academia/biblioteca.js).
//  - /api/academia/… (con sesión y con los términos firmados, como todo lo de estudiar; JSON sin caché: no-store).
//  - /api/admin/academia/biblioteca… ({ admin: true }): el interruptor de cada libro (los comerciales no se encienden).
import { createReadStream } from 'node:fs';
import { ErrorHttp, leerJson, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { vistaPregunta, modoDeFila } from '../academia/progreso.js';
import { examenDe, finDe, GRACIA_MS } from '../academia/examen.js';
import { listaBiblioteca, indiceDeLibro, paginaDeLibro, seccionDeLibro, buscarEnLibro, imagenDeLibro, librosParaAdmin, cambiarLibro, preguntaDelTestGuide } from '../academia/biblioteca.js';

// ¿Puede ver la RESPUESTA oficial de esta pregunta? Igual que la página del libro (0.12.0): el administrador siempre; el
// alumno solo si ya la respondió (academia_respuestas: un examen con reloj no escribe ahí hasta entregar) y no tiene
// abierto un examen con reloj que la trae. → { visible, motivo: null | 'sin_responder' | 'en_examen' }
// 0.14.20: el administrador también la ve siempre, salvo en un examen con reloj suyo abierto (si se prueba como alumno).
export function respuestaVisible(db, usuario, pregunta, ahoraMs) {
  for (const f of db.prepare("SELECT * FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND terminado_en IS NULL").all(usuario.id)) {
    const e = examenDe(db, f);
    if (e && ahoraMs <= finDe(f, e) + GRACIA_MS && JSON.parse(f.orden).includes(pregunta)) return { visible: false, motivo: 'en_examen' };
  }
  if (usuario.rol === 'admin') return { visible: true, motivo: null };
  const respondida = db.prepare('SELECT 1 FROM academia_respuestas WHERE usuario_id = ? AND pregunta = ? LIMIT 1').get(usuario.id, pregunta);
  return respondida ? { visible: true, motivo: null } : { visible: false, motivo: 'sin_responder' };
}
// En Modo reto las opciones que ve son la correcta y dos inventadas: con las del Test Guide al lado, la que se repite es
// la correcta. Así que, mientras no la responda, en un intento de Modo reto abierto no se muestran las opciones oficiales.
function enRetoSinResponder(db, usuarioId, pregunta) {
  for (const f of db.prepare('SELECT * FROM academia_intentos WHERE usuario_id = ? AND terminado_en IS NULL').all(usuarioId)) {
    if (modoDeFila(f) === 'reto' && JSON.parse(f.orden).includes(pregunta)) return true;
  }
  return false;
}

// La ficha «Ver en el Test Guide» de una pregunta del paquete en uso.
export function fichaTestGuide(db, config, paquete, usuario, pregunta, ahoraMs) {
  const q = paquete?.preguntas.get(pregunta);
  if (!q || q.origen !== 'test_guide') throw new ErrorHttp(404, 'no_existe');
  const o = q.original;
  const lugar = paquete.deTema.get(pregunta) ?? null;
  const idTg = String(o.numero ?? pregunta.replace(/^tg-/, ''));
  const tg = preguntaDelTestGuide(config, idTg, lugar);
  const enunciado = tg ? tg.enunciado : o.enunciado;
  const opciones = tg ? Object.keys(tg.opciones).map(letra => ({ letra, texto: tg.opciones[letra] })) : o.opciones.map(op => ({ letra: op.letra, texto: op.texto }));
  const correcta = tg ? tg.correcta : o.correcta;
  const explicacion = tg ? (tg.explicacion ?? null) : (o.explicacion ?? null);
  const ver = respuestaVisible(db, usuario, pregunta, ahoraMs);
  const ocultarOpciones = !ver.visible && enRetoSinResponder(db, usuario.id, pregunta);
  const capitulo = /^(\d{1,2})-/.exec(idTg)?.[1] ?? null;
  const difiere = enunciado !== o.enunciado || opciones.length !== o.opciones.length || opciones.some((op, i) => op.letra !== o.opciones[i]?.letra || op.texto !== o.opciones[i]?.texto);
  return {
    id: pregunta, numero: idTg, capitulo: capitulo ? Number(capitulo) : null,
    referencia: (tg?.referencia ?? o.seccion) || null, pagina: o.pagina ?? null,
    figura: o.figura != null ? vistaPregunta(paquete, pregunta).figura : null,
    enunciado, opciones: ocultarOpciones ? null : opciones, opcionesOcultas: ocultarOpciones,
    deLasFuentes: Boolean(tg), difiere,
    respuesta: ver.visible ? { correcta, texto: opciones.find(op => op.letra === correcta)?.texto ?? null, explicacion } : null,
    bloqueo: ver.motivo,
  };
}

export function registrarRutasBiblioteca(rutas, { config = null, reloj = Date.now, limites = {} } = {}) {
  const busquedas = limites.busquedas ?? new Limitador({ maximo: 300, ventanaMs: 60 * 60 * 1000 });
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };

  rutas.agregar('GET', '/api/academia/test-guide/:pregunta', ({ db, usuario, parametros }) => {
    necesitaConfig();
    return { codigo: 200, datos: fichaTestGuide(db, config, paqueteActivo(db, config), usuario, parametros.pregunta, reloj()) };
  });

  rutas.agregar('GET', '/api/academia/biblioteca', ({ db }) => { necesitaConfig(); return { codigo: 200, datos: listaBiblioteca(db, config) }; });
  rutas.agregar('GET', '/api/academia/biblioteca/:libro', ({ db, parametros }) => { necesitaConfig(); return { codigo: 200, datos: indiceDeLibro(db, config, parametros.libro) }; });
  rutas.agregar('GET', '/api/academia/biblioteca/:libro/paginas/:pagina', ({ db, parametros }) => {
    necesitaConfig();
    return { codigo: 200, datos: paginaDeLibro(db, config, parametros.libro, parametros.pagina) };
  });
  // 0.14.43: leer por secciones (su texto organizado: ver src/academia/biblioteca-secciones.js).
  rutas.agregar('GET', '/api/academia/biblioteca/:libro/secciones/:n', ({ db, parametros }) => {
    necesitaConfig();
    return { codigo: 200, datos: seccionDeLibro(db, config, parametros.libro, parametros.n) };
  });
  rutas.agregar('GET', '/api/academia/biblioteca/:libro/buscar', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!busquedas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiadas_busquedas');
    const q = new URL(req.url, 'http://x').searchParams.get('q') ?? '';
    return { codigo: 200, datos: await buscarEnLibro(db, config, parametros.libro, q) };
  });
  rutas.agregar('GET', '/api/academia/biblioteca/:libro/imagenes/:archivo', ({ db, parametros }) => {
    necesitaConfig();
    const f = imagenDeLibro(db, config, parametros.libro, parametros.archivo);
    return {
      codigo: 200,
      enviar: res => {
        res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': f.tipo, 'Content-Length': f.bytes, 'Cache-Control': 'private, no-store' });
        const flujo = createReadStream(f.ruta);
        flujo.on('error', () => res.destroy());
        flujo.pipe(res);
      },
    };
  });

  rutas.agregar('GET', '/api/admin/academia/biblioteca', ({ db }) => { necesitaConfig(); return { codigo: 200, datos: { libros: librosParaAdmin(db, config) } }; }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/biblioteca/libros/:libro', async ({ db, req, parametros }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    return { codigo: 200, datos: { libros: cambiarLibro(db, config, parametros.libro, datos?.permitido) } };
  }, { admin: true });
}
