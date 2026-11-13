// Ayuda común para las pruebas de la fábrica de materias (no es un archivo *.test.js). Fuentes SINTÉTICAS (inventadas
// aquí: nunca material real), un proveedor falso que responde según el paso, un reloj de mentira y sin Drive.
import './ayuda.js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enTransaccion } from '../src/nucleo/db.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { carpetaFuentes, revisarCarpetaFuentes, AJUSTE_FUENTES } from '../src/academia/fuentes.js';
import { crearFabrica } from '../src/academia/fabrica.js';
import { crearClienteIA } from '../src/ia/cliente.js';
import { TAREAS, TAREAS_PROFUNDA } from '../src/academia/fabrica-prompts.js';
import { TAREAS_ORAL } from '../src/academia/fabrica-oral.js';
import { TAREA_CHAT } from '../src/academia/pidele.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { preparar, T0, claveOpenai } from './ia-base.js';
import { guardarSecreto, anotarPrueba } from '../src/claves/almacen.js';
import { probarSecreto } from '../src/claves/probar.js';
import { guardarConfigIa } from '../src/ia/config.js';

export const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([30, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'latin1'), Buffer.alloc(22, 7)]);
// Ojo: espacios dobles y uno al final A PROPÓSITO (el Test Guide se copia tal cual, sin recortar).
export const TG = [
  { id: '2-1', materia: 'sistemas', tema: 't01-motor', enunciado: '¿Cuántos  cilindros tiene el motor de muestra? ', opciones: { A: 'Dos.', B: 'Cuatro.', C: 'Seis.' }, correcta: 'B', explicacion: 'El motor de muestra tiene cuatro cilindros (p. 10).', referencia: 'Cap. 2 · Sección A' },
  { id: '2-2', materia: 'sistemas', tema: 't01-motor', enunciado: '¿Qué hace la hélice de muestra?', opciones: { A: 'Empuja el aire hacia atrás.', B: 'Enfría el aceite.', C: 'Mide la altitud.' }, correcta: 'A', explicacion: 'La hélice empuja el aire hacia atrás.', figura: 'fig-2.webp' },
];
export const LIBRO = '=== p 10 ===\nEl motor de muestra tiene cuatro cilindros y gira a 2400 rpm en crucero.\n=== p 11 ===\nLa hélice de muestra empuja el aire hacia atrás y así el avión avanza.\n';

export function escribirFuentes(config, { conOral = false } = {}) {
  const dir = carpetaFuentes(config);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'fuentes-manifiesto.json'), JSON.stringify({
    formato: 'fuentes-academia', version: 1,
    libros: [{ id: 'pp-es', titulo: 'Manual de muestra (no es material real)' }],
    materias: [{ id: 'sistemas', num: 2, nombre: 'Sistemas (muestra)', temas: [{ id: 't01-motor', titulo: 'El motor (muestra)', tg: ['2-1', '2-2'], lecturas: [{ libro: 'pp-es', archivo: 'libro-pp-es-cap02.txt', desde: 10, hasta: 11 }] }] }],
    excluidas: [{ id: '2-9', motivo: 'muestra' }], movidas: [], imagenes: 'imagenes.json', tg: 'tg.json',
  }));
  writeFileSync(join(dir, 'tg.json'), JSON.stringify({ preguntas: [...TG, { id: '2-9', materia: 'sistemas', enunciado: 'Excluida', opciones: { A: 'a', B: 'b' }, correcta: 'A', explicacion: 'x' }] }));
  writeFileSync(join(dir, 'libro-pp-es-cap02.txt'), LIBRO);
  writeFileSync(join(dir, 'imagenes.json'), JSON.stringify([{ archivo: 'img-pp-es-p10-1.webp', libro: 'pp-es', pagina: 10, ancho: 800, alto: 600, pie: 'El motor' }, { archivo: 'fig-2.webp' }]));
  writeFileSync(join(dir, 'img-pp-es-p10-1.webp'), WEBP);
  writeFileSync(join(dir, 'fig-2.webp'), WEBP);
  if (conOral === true) { mkdirSync(join(dir, 'oral'), { recursive: true }); writeFileSync(join(dir, 'oral', 'oral.json'), '{}'); }
  if (conOral === 'completa') escribirOral(dir);
  return dir;
}

// 0.13.1: la Guía del examen oral de MUESTRA (inventada aquí, en inglés como el libro real; nunca material real): el
// capítulo 1 con dos secciones, una «Additional Study Question» y un escenario (pregunta y respuesta juntas).
export const ORAL = {
  libro: { id: 'oral-en', titulo: 'Guía del examen oral (muestra)' },
  materias: [{ id: 'oral_calificaciones', num: 1, nombre: 'Calificaciones (muestra)', nombre_en: 'Sample Qualifications', temas: [
    { id: 't01-a', seccion: 'A', titulo: 'Atribuciones (muestra)', titulo_en: 'Sample Privileges', preguntas: [
      { n: 1, pregunta_en: 'May a sample private pilot fly for hire?', respuesta_en: 'No. A sample private pilot may not fly for hire.', referencia: 'Sample 1', pagina: 3 },
      { n: 2, pregunta_en: 'How many sample passengers may be carried?', respuesta_en: 'Up to 4 sample passengers may be carried.', referencia: 'Sample 2', pagina: 3 },
    ], adicionales: [] },
    { id: 't02-b', seccion: 'B', titulo: 'Experiencia reciente (muestra)', titulo_en: 'Sample Recent Experience', preguntas: [
      { n: 1, pregunta_en: 'How many sample landings are needed?', respuesta_en: 'Three sample landings within 90 days.', referencia: 'Sample 3', pagina: 4 },
    ], adicionales: [{ n: 1, pregunta_en: 'Describe your sample personal minimums.', referencia: 'Sample 4', pagina: 5 }] },
  ] }],
  escenarios: [{ n: 1, texto_en: 'A sample friend offers to pay for the whole flight.\nMay you accept the money?\nNo. A sample private pilot may only share the costs.', pagina: 7 }],
};
export const ORAL_CAP01 = '=== p 3 ===\n1\nSample Qualifications\n1. May a sample private pilot fly for hire?\nNo. A sample private pilot may not fly for hire.\n2. How many sample passengers may be carried?\nUp to 4 sample passengers may be carried.\n=== p 4 ===\n1. How many sample landings are needed?\nThree sample landings within 90 days.\n=== p 5 ===\nAdditional Study Questions\n1. Describe your sample personal minimums.\n';
export const ORAL_CAP09 = '=== p 7 ===\n1. A sample friend offers to pay for the whole flight.\nMay you accept the money?\nNo. A sample private pilot may only share the costs.\n';
export function escribirOral(dir) {
  mkdirSync(join(dir, 'oral'), { recursive: true });
  writeFileSync(join(dir, 'oral', 'oral.json'), JSON.stringify(ORAL));
  writeFileSync(join(dir, 'oral', 'oral-cap01.txt'), ORAL_CAP01);
  writeFileSync(join(dir, 'oral', 'oral-cap09.txt'), ORAL_CAP09);
  writeFileSync(join(dir, 'oral', 'img-oral-en-p3-1.webp'), WEBP);
  const imgs = JSON.parse(readFileSync(join(dir, 'imagenes.json'), 'utf8'));
  imgs.push({ archivo: 'oral/img-oral-en-p3-1.webp', libro: 'oral-en', pagina: 3, ancho: 600, alto: 400, pie: 'Una cabina de muestra' });
  writeFileSync(join(dir, 'imagenes.json'), JSON.stringify(imgs));
}
export const sincronizarFalso = async (db, config, { escribir }) => {
  const estado = revisarCarpetaFuentes(carpetaFuentes(config));
  await escribir(() => guardarAjuste(db, AJUSTE_FUENTES, JSON.stringify({ ...estado, en: new Date(T0).toISOString() })));
  return { ok: true, bajados: 0 };
};

// 0.14.2: el texto del pedido en los tres formatos: Claude (messages[0].content), ChatGPT (input) y la API propia
// (el último mensaje «user» de messages).
export function textoDelPedido(cuerpo) {
  if (typeof cuerpo?.input === 'string') return cuerpo.input;
  const usuario = (Array.isArray(cuerpo?.messages) ? cuerpo.messages : []).filter(m => m?.role === 'user').at(-1);
  if (typeof usuario?.content === 'string') return usuario.content;
  if (Array.isArray(usuario?.content)) return usuario.content.filter(c => c?.type === 'text').map(c => c.text).join('');
  return '';
}
// Lo que «responde el modelo» en cada paso (por la tarea que va en el mensaje). dudas: lo que dice el verificador.
const datosDe = texto => { const m = [...texto.matchAll(/<datos>\n([\s\S]*?)\n<\/datos>/g)].at(-1); return m ? JSON.parse(m[1]) : {}; };
// 0.14.2: chat(d): lo que «responde» la IA en «Pídele a la IA» (si no, un plan para reescribir el primer tema);
// sinDibujo: tarjetas sin foto ni dibujo y sin números (para los «Dibujos con IA»); revision(d): lo que mira Claude.
export function respuestaFalsa(cuerpo, { dudas = [], dudasProfunda = [], chat = null, sinDibujo = false, revision = null, veredicto = null, dudasFinal = null } = {}) {
  const opciones = { dudasProfunda, veredicto, dudasFinal };
  const texto = textoDelPedido(cuerpo);
  const d = datosDe(texto);
  if (texto.startsWith(TAREA_CHAT)) {
    if (chat) return chat(d);
    const m = d.materias[0];
    return { respuesta: `Puedo reescribir «${m.temas[0].titulo}» más claro. Toca «Hazlo».`, rechazo: null, resumen: 'Pidió explicar mejor un tema.',
      plan: { tipo: 'reescribir_tema', materia: m.id, tema: m.temas[0].id, instruccion: d.pide_ahora, pasos: ['Escribir', 'Verificar con el libro'] } };
  }
  if (texto.includes('¿El dibujo coincide con la tarjeta')) return revision ? revision(d) : { usar: true, problemas: [] };
  if (sinDibujo && texto.startsWith(TAREAS.tarjetas) && !d.preguntas_del_libro) {
    return { tarjetas: d.tarjetas.map(x => ({ titulo: x.titulo, puntos: ['El motor empuja el avión.', 'La hélice mueve el aire.'], recuerda: 'Motor y hélice.', ejemplo: 'Antes de despegar.', ingles: [], paginas: [10], imagen: null, visual: null, solo_texto: 'Una idea simple, sin dibujo.' })) };
  }
  const tarjeta = (titulo, i) => ({
    titulo, puntos: ['El motor tiene cuatro cilindros (cylinders).', 'Gira a 2400 rpm en crucero.'], recuerda: 'Cuatro cilindros.', ejemplo: 'En el circuito el motor va a 2400 rpm.',
    ingles: [{ palabra: 'Cylinder', pronunciacion: 'SÍ-lin-der', significado: 'Cilindro' }], paginas: [10],
    imagen: i === 0 ? { archivo: 'img-pp-es-p10-1.webp', alt: 'Un motor', pie: 'El motor de muestra' } : null,
    visual: i === 0 ? null : { tipo: 'diagrama-pasos', parametros: { titulo: null, unidad: null, problema: null, formula: null, resultado: null, columnas: null, filas: null, elementos: [{ nombre: 'Admisión', detalle: null, valor: null, hasta: null }, { nombre: 'Compresión', detalle: null, valor: null, hasta: null }] } },
    solo_texto: null,
  });
  // 0.13.9: la «Mejora profunda de las clases» (sus tareas empiezan con «MEJORA PROFUNDA ·»).
  if (texto.startsWith(TAREAS_PROFUNDA.plan)) {
    const oral = Boolean(d.preguntas_del_libro);
    const pag = oral ? d.preguntas_del_libro[0].pagina : 10;
    const viejas = d.tarjetas_de_ahora.filter(x => !/^(Qué vas a aprender|Resumen|Para el Test Guide)/.test(x.titulo));
    const tarjetas = viejas.map((x, i) => ({ titulo: `Mejor: ${x.titulo}`, idea: 'una idea', de: x.n, preguntas: i === 0 ? (oral ? d.preguntas_del_libro.map(q => String(q.n)) : d.test_guide.map(q => q.id)) : [], paginas: [pag] }));
    while (tarjetas.length < 3) tarjetas.push({ titulo: `Nueva ${tarjetas.length}`, idea: 'otra idea', de: null, preguntas: [], paginas: [pag] });
    return { contexto: ['Qué es y para qué sirve.', 'Por qué te lo preguntan en el examen.'], tarjetas };
  }
  if (texto.startsWith(TAREAS_PROFUNDA.tarjetas)) {
    return { tarjetas: d.tarjetas.map(x => ({
      titulo: x.titulo, puntos: ['Primero lo simple: el motor (engine) empuja el avión.', 'Paso a paso, una idea.'], recuerda: 'Una idea por tarjeta.', ejemplo: 'En el circuito, antes de despegar.',
      ingles: [{ palabra: 'Engine', pronunciacion: 'ÉN-yin', significado: 'Motor' }], paginas: x.paginas, imagen: null, de: x.de, truco: 'Motor = músculo del avión.',
      visual: { tipo: 'diagrama-pasos', parametros: { titulo: null, unidad: null, problema: null, formula: null, resultado: null, columnas: null, filas: null, elementos: [{ nombre: 'Primero', detalle: null, valor: null, hasta: null }, { nombre: 'Después', detalle: null, valor: null, hasta: null }] } },
      solo_texto: null,
    })), te_acuerdas: [{ pregunta: '¿Qué empuja el avión?', respuesta: 'El motor.' }, { pregunta: '¿Cuántas ideas por tarjeta?', respuesta: 'Una.' }] };
  }
  if (texto.startsWith(TAREAS_PROFUNDA.cierre)) {
    return { resumen: ['Lo simple primero.', 'Una idea por tarjeta.'], otra_vez: 'Otra vez, en fácil: el tema entero en pocas frases.',
      examinador: d.examen_oral ? [{ pregunta_en: 'May you fly for hire?', pregunta_es: '¿Puedes volar por paga?', respuesta: 'No: el piloto privado no vuela por paga (for hire).', paginas: [3] }, { pregunta_en: 'Who may share the costs?', pregunta_es: '¿Quién comparte los gastos?', respuesta: 'Solo se comparten los gastos.', paginas: [3] }] : [] };
  }
  // 0.14.7: las explicaciones (Test Guide y oral), su verificación una por una y la revisión final.
  if (texto.startsWith(TAREAS_PROFUNDA.explicaciones_tg)) {
    return { preguntas: d.preguntas.map(q => ({ id: q.id, sencilla: `✔ La correcta es: ${q.correcta_texto}\nPor qué: lo dice el libro de muestra.\nPiensa así: primero el dato.\nTruco para recordar: «el libro manda».`,
      errores: (q.errores_de_ahora ? Object.keys(q.errores_de_ahora) : q.opciones.map(o => o.letra).filter(l => l !== q.correcta)).map(letra => ({ letra, idea: 'Idea equivocada, mejor explicada.' })) })) };
  }
  if (texto.startsWith(TAREAS_PROFUNDA.explicaciones_oral)) {
    return { items: d.preguntas_del_libro.map(x => ({ id: x.id, explicacion_es: 'Explicación mejor: el libro de muestra lo dice así (sample).', puntos_clave: ['Lo dice el libro.'],
      pregunta_es: `Pregunta en español (muestra) ${x.id}`, respuesta_es: x.respuesta_en ? `Respuesta en español: ${(x.respuesta_en.match(/\d+/g) ?? []).join(' y ')} (muestra).` : null })) };
  }
  if (texto.startsWith(TAREAS_PROFUNDA.verificar_explicaciones)) return { items: d.items.map(i => (opciones.veredicto ? opciones.veredicto(i) : { id: i.original.id, ok: true, problema: null })) };
  if (texto.startsWith(TAREAS_PROFUNDA.revision_final)) return { dudas: opciones.dudasFinal ? opciones.dudasFinal(d) : [] };
  if (texto.startsWith(TAREAS_PROFUNDA.verificar)) return { dudas: typeof opciones.dudasProfunda === 'function' ? opciones.dudasProfunda(d) : opciones.dudasProfunda ?? [] };
  // 0.13.1: la pista oral (los pedidos traen «preguntas_del_libro»).
  if (texto.startsWith(TAREAS_ORAL.plan)) {
    const pag = [d.preguntas_del_libro[0].pagina];
    return { tarjetas: [{ titulo: 'Lo que puedes hacer', idea: 'atribuciones', libro: d.preguntas_del_libro.map(x => x.n), paginas: pag }, { titulo: 'Lo que no puedes', idea: 'cobrar', libro: [], paginas: pag }, { titulo: 'Para el examinador', idea: 'decirlo', libro: [], paginas: pag }] };
  }
  if (texto.startsWith(TAREAS.tarjetas) && d.preguntas_del_libro) {
    return { tarjetas: d.tarjetas.map((x, i) => ({
      titulo: x.titulo, puntos: ['El piloto privado de muestra no vuela por paga (for hire).', 'Lleva hasta 4 pasajeros.'], recuerda: 'Nunca por paga.', ejemplo: 'El examinador te pregunta si puedes cobrar.',
      ingles: [{ palabra: 'For hire', pronunciacion: 'for JÁIR', significado: 'Por paga' }], paginas: x.paginas,
      imagen: i === 0 && d.fotos_del_libro?.length ? { archivo: d.fotos_del_libro[0].archivo, alt: 'Una cabina', pie: 'La cabina de muestra' } : null,
      visual: i === 0 && d.fotos_del_libro?.length ? null : { tipo: 'diagrama-pasos', parametros: { titulo: null, unidad: null, problema: null, formula: null, resultado: null, columnas: null, filas: null, elementos: [{ nombre: 'Pregunta', detalle: null, valor: null, hasta: null }, { nombre: 'Respuesta', detalle: null, valor: null, hasta: null }] } },
      solo_texto: null,
    })) };
  }
  if (texto.startsWith(TAREAS_ORAL.libro)) {
    return { items: d.preguntas_del_libro.map(x => ({
      n: x.n, explicacion_es: 'En la muestra, el libro dice que el piloto privado no vuela por paga (for hire).', puntos_clave: ['No vuela por paga.'],
      pregunta_termina_en: x.escenario ? 'May you accept the money?' : null,
      pregunta: { enunciado: `Muestra ${x.n}: ¿qué dice el libro?`, opciones: [{ letra: 'A', texto: 'Lo que dice el libro.' }, { letra: 'B', texto: 'Lo contrario.' }, { letra: 'C', texto: 'Otra cosa.' }], correcta: 'A', explicacion: 'Lo dice el libro de muestra.', errores: [{ letra: 'B', idea: 'Al revés.' }, { letra: 'C', idea: 'Inventado.' }], como: 'La respuesta del libro es la A.' },
    })) };
  }
  if (texto.startsWith(TAREAS_ORAL.verificar)) return { dudas };
  if (texto.startsWith(TAREAS.plan)) return { tarjetas: [{ titulo: 'El motor', idea: 'cilindros', preguntas: ['2-1'], paginas: [10] }, { titulo: 'La hélice', idea: 'empuje', preguntas: ['2-2'], paginas: [11] }, { titulo: 'Cuidarlo', idea: 'rpm', preguntas: [], paginas: [10] }] };
  if (texto.startsWith(TAREAS.tarjetas)) return { tarjetas: d.tarjetas.map((x, i) => tarjeta(x.titulo, i)) };
  if (texto.startsWith(TAREAS.preguntas)) {
    return { preguntas: d.test_guide.map(q => ({
      id: q.id, sencilla: `✔ La correcta es: ${q.opciones[q.correcta]}`, errores: Object.keys(q.opciones).filter(l => l !== q.correcta).map(letra => ({ letra, idea: 'Una idea equivocada.' })),
      reto: [{ texto: `Opción engañosa uno ${q.id}`, porque_es_incorrecta: 'No.', trampa: 'Parece.' }, { texto: `Opción engañosa dos ${q.id}`, porque_es_incorrecta: 'No.', trampa: 'Parece.' }],
      si_te_preguntan: q.enunciado.slice(0, 30), recuerda: q.opciones[q.correcta],
    })) };
  }
  if (texto.startsWith(TAREAS.cierre)) return { aprender: ['Cómo es el motor.'], resumen: ['Cuatro cilindros.'], otra_vez: 'El motor tiene cuatro cilindros y la hélice empuja el aire.' };
  if (texto.startsWith(TAREAS.extra)) {
    return { tarjetas: [tarjeta('Profundiza: las rpm', 1)], preguntas: [
      { enunciado: '¿A cuántas rpm gira en crucero?', opciones: [{ letra: 'A', texto: '2400' }, { letra: 'B', texto: '900' }, { letra: 'C', texto: '5000' }], correcta: 'A', explicacion: 'Lo dice el libro.', porque_incorrectas: [{ letra: 'B', texto: 'Muy poco.' }, { letra: 'C', texto: 'Demasiado.' }], nivel: 'basico', libro: 'pp-es', pagina: 10, cita_corta: 'gira a 2400 rpm en crucero' },
      { enunciado: 'Inventada', opciones: [{ letra: 'A', texto: 'x' }, { letra: 'B', texto: 'y' }], correcta: 'A', explicacion: 'x', porque_incorrectas: [{ letra: 'B', texto: 'y' }], nivel: 'basico', libro: 'pp-es', pagina: 10, cita_corta: 'una cita que no está en el libro' },
    ] };
  }
  if (texto.startsWith(TAREAS.verificar)) return { dudas };
  if (texto.startsWith(TAREAS.extracto)) return { pasajes: [{ libro: 'pp-es', pagina: 10, texto: 'El motor de muestra tiene cuatro cilindros' }] };
  if (texto.includes('Varios alumnos no entendieron')) return { tarjeta: { ...tarjeta(d.tarjeta.titulo, 1), puntos: ['Mejor explicado: cuatro cilindros.'] }, porque: 'más claro' };
  if (texto.includes('Muchos alumnos fallan')) return { sencilla: '✔ Mejor explicada.', errores: Object.keys(d.pregunta.opciones.reduce((o, x) => ({ ...o, [x.letra]: 1 }), {})).filter(l => l !== d.pregunta.correcta).map(letra => ({ letra, idea: 'Nueva idea.' })), porque: 'trampa' };
  if (texto.startsWith('Revisa estas tarjetas')) return { dudas: [] };
  return { nada: true };
}

// Todo listo: base con la IA encendida (tope general US$50), la clave probada, el proveedor falso y las fuentes.
// 0.14.2: proveedor: 'anthropic' (lo de siempre), 'openai' (el caso del dueño: la clave de Claude espera la verificación
// de identidad y ChatGPT, probada gratis con la lista de modelos, hace todo), 'ambos' (las dos funcionan) o 'propia'.
export async function ponerChatGpt(base, { proveedor = 'openai', claudeBloqueada = true, ahora = T0 } = {}) {
  const { db, config, admin, secretoId } = base;
  const uso = proveedor === 'propia' ? 'ia_propia' : 'ia_openai';
  if (proveedor === 'propia') guardarConfigIa(db, { basePropia: 'https://ia.ejemplo-propio.com/v1' }, { config, usuarioId: admin, ahora });
  const id = guardarSecreto(db, config, { uso, valor: claveOpenai(proveedor === 'propia' ? 'p' : 'z'), usuarioId: admin, ahora }).secreto.id;
  const r = await probarSecreto(db, config, { id, usuarioId: admin, ahora: () => ahora });
  if (r.motivo !== 'ok') throw new Error(`la prueba gratis no pasó: ${r.motivo}`);
  guardarConfigIa(db, { usar: { [proveedor]: true } }, { config, usuarioId: admin, ahora });
  if (claudeBloqueada && secretoId) anotarPrueba(db, { id: secretoId, motivo: 'verificacion_identidad', ahora });
  return id;
}
export async function conFabrica(fn, { fuentes = true, oral = false, encendida = true, guardar = true, dudas = [], dudasProfunda = [], tope = 50_000_000, proveedor = 'anthropic', chat = null, sinDibujo = false, revision = null, veredicto = null, dudasFinal = null } = {}) {
  let ahoraMs = T0;
  const reloj = () => ahoraMs;
  const opciones = { dudas, dudasProfunda, chat, sinDibujo, revision, veredicto, dudasFinal };
  const falso = await crearProveedorFalso({ respuestaJson: cuerpo => respuestaFalsa(cuerpo, opciones) });
  const base = preparar({ encendida, tope, guardar, iaBases: { anthropic: falso.base, openai: falso.base, propia: falso.base }, ahora: T0 });
  const { db, config } = base;
  if (proveedor !== 'anthropic') await ponerChatGpt(base, { proveedor: proveedor === 'ambos' ? 'openai' : proveedor, claudeBloqueada: proveedor !== 'ambos' });
  if (fuentes) escribirFuentes(config, { conOral: oral });
  let tareaId = 100;
  const escribir = async trabajo => enTransaccion(db, trabajo);
  // Una «tarea» nueva (otro id: como la del programa de cada hora) que corre pasos hasta terminar o hasta «max».
  const correr = async ({ max = 60, nuevaTarea = true, avanzarMs = 0 } = {}) => {
    if (nuevaTarea) tareaId += 1;
    const tarea = { id: tareaId, punto: null };
    const paso = crearFabrica({ reloj, sincronizar: sincronizarFalso });
    const salidas = [];
    for (let i = 0; i < max; i++) {
      const ia = crearClienteIA({ db, config, escritor: { escribir }, reloj, registro: { error() {} } });
      const r = await paso({ db, config, tarea, escribir, ia, senal: new AbortController().signal, quedaMs: () => 170_000 });
      salidas.push(r);
      ahoraMs += avanzarMs;
      if (r.listo) break;
      tarea.punto = r.punto;
    }
    return salidas;
  };
  const llamadas = () => falso.peticiones.filter(p => ['/v1/messages', '/v1/responses', '/chat/completions', '/v1/images/generations'].includes(p.ruta));
  try {
    await fn({ ...base, falso, correr, llamadas, reloj, avanzar: ms => { ahoraMs += ms; }, opciones, escribir });
  } finally {
    db.close();
    await falso.cerrar?.();
  }
}
