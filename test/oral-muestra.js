// Paquete de MUESTRA de la pista «Preparándote para el examen oral» (0.13.1), solo para las pruebas y las capturas. Todo
// está inventado aquí, con palabras propias (también las «preguntas del libro» en inglés): NO viene de ninguna guía
// real (el contenido real vive solo en el servidor y nunca entra al repositorio, que es público).
const LIBRO = { id: 'oral-en', titulo: 'Guía del examen oral (muestra)', idioma: 'en' };

const fuente = pagina => [{ libro: LIBRO.id, pagina: String(pagina) }];

// Los temas de la muestra: materia → [{ id, titulo, titulo_en, pagina, qa: [[pregunta_en, respuesta_en, explicacion_es, puntos]], mc: [...] }]
const TEMAS = {
  oral_calificaciones: [
    {
      id: 't01-a', titulo: 'Lo que puede hacer un piloto privado (muestra)', titulo_en: 'Sample Privileges', pagina: 3,
      qa: [
        ['What may a sample private pilot carry?', 'A sample private pilot may carry friends, but never for hire.', 'En la muestra, el piloto privado puede llevar amigos, pero nunca cobrar por el vuelo.', ['Puede llevar amigos.', 'No puede cobrar (for hire).']],
        ['How often must a sample pilot fly with an instructor?', 'Every 24 sample months the pilot flies with an instructor.', 'Cada 24 meses de la muestra vuela con un instructor para su revisión.', ['Cada 24 meses.']],
      ],
      adicionales: ['Describe your own sample minimums for a night flight.'],
    },
    {
      id: 't02-b', titulo: 'La experiencia reciente (muestra)', titulo_en: 'Sample Recent Experience', pagina: 5,
      qa: [
        ['How many sample landings are needed to carry passengers?', 'Three sample landings in the last 90 days are needed.', 'En la muestra hacen falta 3 aterrizajes en los últimos 90 días para llevar pasajeros.', ['3 aterrizajes.', 'En 90 días.']],
      ],
      adicionales: [],
    },
  ],
  oral_rendimiento: [
    {
      id: 't01-a', titulo: 'Peso y balance (muestra)', titulo_en: 'Sample Weight and Balance', pagina: 12,
      qa: [
        ['How is the sample center of gravity found?', 'Divide the total sample moment by the total sample weight.', 'El centro de gravedad (center of gravity) de la muestra sale de dividir el momento total entre el peso total.', ['CG = momento ÷ peso.']],
        ['What is the sample datum?', 'An imaginary sample line from which every arm is measured.', 'El datum de la muestra es una línea imaginaria desde donde se mide cada brazo (arm).', ['Línea imaginaria.', 'Desde ahí se mide el brazo.']],
      ],
      adicionales: ['Compute the sample CG for your own airplane.'],
      calculo: true,
    },
  ],
  oral_escenarios: [
    {
      id: 't01-escenarios', titulo: 'Escenarios de la muestra', titulo_en: 'Sample Scenarios', pagina: 40,
      qa: [
        ['A sample friend asks you to fly him to a meeting and offers to pay for the whole flight. What do you answer?', 'I may not accept: a sample private pilot may only share the costs.', 'En la muestra, el piloto privado solo puede compartir los gastos; no puede aceptar que le paguen el vuelo.', ['Solo compartir gastos.']],
      ],
      adicionales: [],
    },
  ],
};

function tarjetasDe(materia, t) {
  const tarjeta = (titulo, puntos, extra = {}) => ({ tipo: 'tarjeta', titulo, puntos, fuentes: fuente(t.pagina), ...extra });
  const out = [
    tarjeta('Qué vas a aprender', ['Lo que pregunta el examinador en este tema (muestra).', 'Cómo responder con tus palabras.'], { visual: { tipo: 'titulo', parametros: {} } }),
    tarjeta(t.titulo, t.qa.map(x => x[2]).slice(0, 4), {
      recuerda: t.qa[0][3][0], ejemplo: 'En el examen oral de la muestra, el examinador te lo pregunta así, en la rampa.',
      ingles: [{ palabra: 'Pilot', pronunciacion: 'PÁI-lot', significado: 'Piloto' }],
      visual: t.calculo
        ? { tipo: 'calculo', parametros: { problema: 'Muestra: peso total 2000 lb y momento total 80000 lb-in.', formula: 'CG = momento ÷ peso', elementos: [{ nombre: 'Dividir el momento entre el peso', detalle: '80000 ÷ 2000 = 40' }], resultado: 'CG = 40 in' } }
        : { tipo: 'diagrama-pasos', parametros: { elementos: [{ nombre: 'Pregunta' }, { nombre: 'Respuesta' }] } },
    }),
    tarjeta('Resumen', t.qa.map(x => x[3][0]), { visual: { tipo: 'titulo', parametros: {} } }),
  ];
  return out;
}

const idPregunta = (materia, t, k) => `or-${materia.slice(5, 9)}-${t.id}-${String(k + 1).padStart(2, '0')}`;
function preguntasDe(materia, t) {
  return t.qa.map(([pq, pa, es], k) => ({
    id: idPregunta(materia, t, k), origen: 'oral',
    original: {
      enunciado: `En la muestra: ${es.split(',')[0]}… ¿qué es lo correcto?`,
      opciones: [{ letra: 'A', texto: `Lo que dice la guía de muestra (${k + 1}).` }, { letra: 'B', texto: 'Lo contrario de lo que dice la guía.' }, { letra: 'C', texto: 'Algo que la guía no dice.' }],
      correcta: 'A', explicacion: es, pagina: String(t.pagina),
    },
    sencilla: `✔ La correcta es la A: ${es}`,
    errores: { B: 'Leer la respuesta al revés.', C: 'Inventar algo que la guía no dice.' },
    fuente_pregunta: { libro: LIBRO.id, pagina: String(t.pagina), n: k + 1, pregunta_en: pq, respuesta_en: pa, como: 'La respuesta del libro es la opción correcta; las otras dos son errores típicos.' },
  }));
}

// El paquete oral de muestra. materias / temas: para armar «a mano» solo una parte (por ejemplo, el capítulo 1).
export function paqueteOralMuestra({ materias = Object.keys(TEMAS), temas = null, edicion = 'muestra-oral' } = {}) {
  const ms = [];
  const preguntas = [];
  for (const id of materias) {
    const lista = TEMAS[id].filter(t => !temas || temas.includes(`${id}/${t.id}`));
    if (!lista.length) continue;
    ms.push({
      id, temas: lista.map(t => ({
        id: t.id, titulo: t.titulo, titulo_en: t.titulo_en, secciones: tarjetasDe(id, t),
        libro_qa: t.qa.map(([pq, pa, es, puntos], k) => ({ n: k + 1, pregunta_en: pq, respuesta_en: pa, pagina: String(t.pagina), explicacion_es: es, puntos_clave: puntos })),
        adicionales: t.adicionales.map((q, k) => ({ n: k + 1, pregunta_en: q, pagina: String(t.pagina + 1) })),
        preguntas: t.qa.map((_, k) => idPregunta(id, t, k)),
      })),
    });
    for (const t of lista) preguntas.push(...preguntasDe(id, t));
  }
  return { formato: 'academia-enalas', version: 1, nombre: 'Preparándote para el examen oral (muestra)', edicion, pista: 'oral', libros: [LIBRO], materias: ms, preguntas, figuras: [] };
}
export const TEMAS_ORAL_MUESTRA = TEMAS;
