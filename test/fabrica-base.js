// Ayuda común para las pruebas de la fábrica de materias (no es un archivo *.test.js). Fuentes SINTÉTICAS (inventadas
// aquí: nunca material real), un proveedor falso que responde según el paso, un reloj de mentira y sin Drive.
import './ayuda.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enTransaccion } from '../src/nucleo/db.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { carpetaFuentes, revisarCarpetaFuentes, AJUSTE_FUENTES } from '../src/academia/fuentes.js';
import { crearFabrica } from '../src/academia/fabrica.js';
import { crearClienteIA } from '../src/ia/cliente.js';
import { TAREAS } from '../src/academia/fabrica-prompts.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { preparar, T0 } from './ia-base.js';

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
  if (conOral) { mkdirSync(join(dir, 'oral'), { recursive: true }); writeFileSync(join(dir, 'oral', 'oral.json'), '{}'); }
  return dir;
}
export const sincronizarFalso = async (db, config, { escribir }) => {
  const estado = revisarCarpetaFuentes(carpetaFuentes(config));
  await escribir(() => guardarAjuste(db, AJUSTE_FUENTES, JSON.stringify({ ...estado, en: new Date(T0).toISOString() })));
  return { ok: true, bajados: 0 };
};

// Lo que «responde el modelo» en cada paso (por la tarea que va en el mensaje). dudas: lo que dice el verificador.
const datosDe = texto => { const m = [...texto.matchAll(/<datos>\n([\s\S]*?)\n<\/datos>/g)].at(-1); return m ? JSON.parse(m[1]) : {}; };
export function respuestaFalsa(cuerpo, { dudas = [] } = {}) {
  const texto = typeof cuerpo.messages?.[0]?.content === 'string' ? cuerpo.messages[0].content : '';
  const d = datosDe(texto);
  const tarjeta = (titulo, i) => ({
    titulo, puntos: ['El motor tiene cuatro cilindros (cylinders).', 'Gira a 2400 rpm en crucero.'], recuerda: 'Cuatro cilindros.', ejemplo: 'En el circuito el motor va a 2400 rpm.',
    ingles: [{ palabra: 'Cylinder', pronunciacion: 'SÍ-lin-der', significado: 'Cilindro' }], paginas: [10],
    imagen: i === 0 ? { archivo: 'img-pp-es-p10-1.webp', alt: 'Un motor', pie: 'El motor de muestra' } : null,
    visual: i === 0 ? null : { tipo: 'diagrama-pasos', parametros: { titulo: null, unidad: null, problema: null, formula: null, resultado: null, columnas: null, filas: null, elementos: [{ nombre: 'Admisión', detalle: null, valor: null, hasta: null }, { nombre: 'Compresión', detalle: null, valor: null, hasta: null }] } },
    solo_texto: null,
  });
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
export async function conFabrica(fn, { fuentes = true, encendida = true, guardar = true, dudas = [], tope = 50_000_000 } = {}) {
  let ahoraMs = T0;
  const reloj = () => ahoraMs;
  const opciones = { dudas };
  const falso = await crearProveedorFalso({ respuestaJson: cuerpo => respuestaFalsa(cuerpo, opciones) });
  const base = preparar({ encendida, tope, guardar, iaBases: { anthropic: falso.base, openai: falso.base }, ahora: T0 });
  const { db, config } = base;
  if (fuentes) escribirFuentes(config);
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
  const llamadas = () => falso.peticiones.filter(p => p.ruta === '/v1/messages');
  try {
    await fn({ ...base, falso, correr, llamadas, reloj, avanzar: ms => { ahoraMs += ms; }, opciones, escribir });
  } finally {
    db.close();
    await falso.cerrar?.();
  }
}
