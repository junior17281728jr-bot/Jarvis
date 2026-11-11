// Paquete de MUESTRA de la Academia, solo para las pruebas y las capturas. Todo está escrito para esta muestra, con
// palabras propias: NO viene de ningún libro ni del Test Guide (el contenido real vive solo en el servidor y nunca entra
// al repositorio, que es público). La figura se dibuja al correr (un PNG hecho aquí), no es la de ningún libro.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fuente = (pagina, seccion = 'Muestra') => [{ libro: 'muestra', capitulo: 'Capítulo de muestra', seccion, pagina }];

function pregunta(id, numero, enunciado, opciones, correcta, explicacion, sencilla, errores, extra = {}) {
  return {
    id, origen: 'test_guide',
    original: { numero, seccion: 'Sección de muestra', enunciado, opciones: opciones.map((texto, i) => ({ letra: 'ABC'[i], texto })), correcta, explicacion, figura: null, pagina: '1', ...extra.original },
    sencilla, errores,
    ingles: extra.ingles ?? [],
    // 0.8.0: el Modo reto (2 opciones nuevas, escritas para esta muestra).
    ...(extra.reto ? { reto: { opciones: extra.reto.map(([texto, porque, trampa]) => ({ texto, porque_es_incorrecta: porque, ...(trampa ? { trampa } : {}) })) } } : {}),
  };
}

export function paqueteMuestra() {
  const preguntas = [
    pregunta('muestra-h1', 'M-01', 'En esta muestra, ¿qué le falta al cuerpo cuando hay hipoxia?', ['Agua suficiente.', 'Oxígeno suficiente.', 'Azúcar suficiente.'], 'B',
      'Explicación de la muestra: la hipoxia es la falta de oxígeno suficiente en el cuerpo.',
      'La palabra «hipoxia» quiere decir «poco oxígeno». Por eso la B es la correcta.',
      { A: 'Confundir la hipoxia con la deshidratación.', C: 'Confundir la hipoxia con la falta de comida.' },
      {
        ingles: [{ palabra: 'hypoxia', pronunciacion: 'jai-POK-sia', significado: 'falta de oxígeno', ejemplo: 'Hypoxia can make you feel happy and careless.' }],
        reto: [['Nitrógeno suficiente.', 'Muestra: el nitrógeno no es lo que falta en la hipoxia; falta oxígeno.', 'Otro gas del aire que suena parecido.'],
          ['Presión suficiente en los oídos.', 'Muestra: la presión en los oídos es otro problema de la altura, no la hipoxia.', 'Mezclar dos efectos de la altura.']],
      }),
    pregunta('muestra-h2', 'M-02', 'Según la muestra, al subir más alto, ¿qué pasa con el aire?', ['Tiene menos presión.', 'Tiene más presión.', 'No cambia.'], 'A',
      'Explicación de la muestra: con más altura, el aire tiene menos presión y entra menos oxígeno en cada respiración.',
      'Arriba hay menos aire empujando hacia abajo, así que la presión baja.',
      { B: 'Pensar que arriba el aire «aprieta» más.', C: 'Creer que el aire es igual a cualquier altura.' },
      { reto: [['Tiene más oxígeno en cada respiración.', 'Muestra: arriba cada respiración trae MENOS oxígeno.', 'Invertir el efecto.'],
        ['Tiene la misma presión pero está más frío.', 'Muestra: el frío no quita que la presión baje con la altura.']] }),
    pregunta('muestra-h3', 'M-03', 'En la muestra, ¿cuál es una señal temprana de hipoxia?', ['Hambre.', 'Sentirse demasiado confiado.', 'Frío en las manos.'], 'B',
      'Explicación de la muestra: una señal temprana es sentirse muy confiado y tomar malas decisiones sin notarlo.',
      'La hipoxia engaña: te sientes bien, y por eso es peligrosa.',
      { A: 'Buscar señales del estómago en vez de la mente.', C: 'Confundirla con el frío de la altura.' },
      { reto: [['Dolor fuerte de cabeza enseguida.', 'Muestra: al principio la hipoxia casi no duele; engaña.', 'Esperar una señal fuerte que no llega.'],
        ['Ver todo con más claridad.', 'Muestra: la vista empeora, no mejora.', 'Confundir la confianza con ver mejor.']] }),
    pregunta('muestra-h4', 'M-04', 'En la muestra, ¿qué es lo primero que hace el piloto si sospecha hipoxia?', ['Seguir igual para no asustar.', 'Usar oxígeno o bajar a menos altura.', 'Dormir un poco.'], 'B',
      'Explicación de la muestra: se usa oxígeno o se desciende a una altura más baja.',
      'Si falta oxígeno, lo arreglas dándole oxígeno al cuerpo: con la máscara o bajando.',
      { A: 'Creer que pasa sola.', C: 'Confundir el cansancio con la falta de oxígeno.' }),
    pregunta('muestra-h5', 'M-05', 'Mire la figura M1 (muestra). ¿Qué representa la línea que separa el azul del verde?', ['El horizonte.', 'La pista.', 'Una nube.'], 'A',
      'Explicación de la muestra: la línea entre el cielo (azul) y el suelo (verde) es el horizonte.',
      'Arriba el cielo, abajo el suelo: donde se juntan está el horizonte.',
      { B: 'Confundir el horizonte con la pista (el trapecio gris).', C: 'Ver una nube donde solo hay una línea.' },
      { original: { figura: 'M1' }, ingles: [{ palabra: 'horizon', pronunciacion: 'jo-RAI-zon', significado: 'horizonte', ejemplo: 'Keep the horizon level.' }] }),
    pregunta('muestra-v1', 'M-06', 'En la muestra, una pista más estrecha de lo normal puede hacer creer al piloto que está…', ['Más bajo de lo que está.', 'Más alto de lo que está.', 'Exactamente a la altura correcta.'], 'B',
      'Explicación de la muestra: una pista estrecha parece más lejana, y el piloto cree que va más alto.',
      'Lo estrecho parece lejos; si crees que estás alto, bajas de más. Cuidado.',
      { A: 'Invertir el efecto: es al revés.', C: 'Creer que los ojos nunca se engañan.' },
      { reto: [['Más cerca de la pista de lo que está.', 'Muestra: la pista estrecha parece más LEJOS, no más cerca.', 'Mezclar distancia y altura.'],
        ['Más lento de lo que va.', 'Muestra: el ancho de la pista engaña sobre la altura, no sobre la velocidad.']] }),
    pregunta('muestra-v2', 'M-07', 'Según la muestra, al volar de noche sobre el agua sin luces, ¿qué falta?', ['Referencias visuales.', 'Combustible.', 'Radio.'], 'A',
      'Explicación de la muestra: sin luces abajo no hay referencias visuales para saber la altura ni la posición.',
      'Si todo está negro, los ojos no tienen dónde agarrarse.',
      { B: 'Mezclar la vista con el combustible.', C: 'Pensar en la radio cuando el problema es ver.' },
      { reto: [['Oxígeno en la cabina.', 'Muestra: el problema de la noche sobre el agua es ver, no respirar.', 'Llevar la hipoxia a otra situación.'],
        ['Luces de navegación propias.', 'Muestra: las luces del avión no iluminan el agua para dar referencias.']] }),
    pregunta('muestra-v3', 'M-08', 'En la muestra, ¿qué ayuda más contra las ilusiones visuales?', ['Mirar solo por la ventana.', 'Revisar los instrumentos.', 'Volar más rápido.'], 'B',
      'Explicación de la muestra: los instrumentos no se engañan como los ojos; hay que revisarlos.',
      'Los ojos pueden mentir; los instrumentos dicen la verdad.',
      { A: 'Confiar solo en lo que se ve.', C: 'Creer que la velocidad arregla la vista.' }),
    pregunta('muestra-v4', 'M-09', 'En la muestra, una pista con subida (cuesta arriba) puede hacer creer que el avión está…', ['Más alto de lo que está.', 'Más bajo de lo que está.', 'En el suelo.'], 'A',
      'Explicación de la muestra: la pista en subida se ve «más larga hacia arriba», y el piloto cree que va alto.',
      'Si la pista sube, parece que vas alto, y puedes bajar demasiado.',
      { B: 'Invertir el efecto.', C: 'Exagerar el error.' }),
    pregunta('muestra-v5', 'M-10', 'Según la muestra, la niebla ligera en la aproximación puede hacer creer que el avión está…', ['Más lejos y más alto.', 'Más cerca.', 'Detenido.'], 'A',
      'Explicación de la muestra: con niebla todo se ve más lejos, y parece que se va más alto.',
      'Con neblina las cosas parecen más lejos de lo que están.',
      { B: 'Invertir el efecto de la niebla.', C: 'Confundir lo que se ve con la velocidad.' }),
  ];
  return {
    formato: 'academia-enalas',
    version: 1,
    nombre: 'Paquete de muestra (no es material real)',
    edicion: 'muestra-1',
    muestra: true,
    libros: [{ id: 'muestra', titulo: 'Libro de muestra (inventado para las pruebas)', idioma: 'es' }],
    materias: [{
      id: 'factores_humanos',
      temas: [
        {
          id: 'muestra-hipoxia', titulo: 'La hipoxia (muestra)',
          secciones: [
            { titulo: '¿Qué es?', texto: 'Muestra: la hipoxia es cuando al cuerpo le falta oxígeno.\nArriba hay menos presión de aire, y cada respiración trae menos oxígeno.', fuentes: fuente('1') },
            { titulo: 'Cómo se nota', texto: 'Muestra: al principio no se siente mal. Puedes sentirte muy confiado y decidir peor sin darte cuenta.', fuentes: fuente('2', 'Señales') },
            { titulo: 'Qué hacer', texto: 'Muestra: usa oxígeno o baja a una altura menor. No esperes a sentirte mal.', fuentes: fuente('3', 'Qué hacer'), nota: 'Muestra: aquí se señalaría si dos libros dicen algo distinto.' },
          ],
          reexplicacion: [
            { titulo: 'Más fácil', texto: 'Muestra: piensa en una montaña muy alta: cuesta respirar. En el avión pasa lo mismo, pero sin que lo notes.', fuentes: fuente('1') },
          ],
          preguntas: ['muestra-h1', 'muestra-h2', 'muestra-h3', 'muestra-h4', 'muestra-h5'],
        },
        {
          id: 'muestra-ilusiones', titulo: 'Ilusiones visuales (muestra)',
          secciones: [
            { titulo: 'Los ojos se engañan', texto: 'Muestra: la forma de la pista, la luz y la niebla pueden hacer creer que vas más alto o más bajo.', fuentes: fuente('4', 'Ilusiones') },
            { titulo: 'La defensa', texto: 'Muestra: revisa los instrumentos y usa las luces de aproximación cuando las haya.', fuentes: fuente('5', 'Ilusiones') },
          ],
          reexplicacion: [
            { titulo: 'Más fácil', texto: 'Muestra: lo estrecho y lo borroso parece lejos. Si parece lejos, crees que vas alto.', fuentes: fuente('4', 'Ilusiones') },
          ],
          preguntas: ['muestra-v1', 'muestra-v2', 'muestra-v3', 'muestra-v4', 'muestra-v5'],
        },
      ],
    }],
    preguntas,
    figuras: [{ numero: 'M1', archivo: 'figura-m1.png', titulo: 'Figura M1 (muestra): cielo, horizonte y pista' }],
  };
}

// ---------- Un PNG pequeño dibujado aquí (la figura M1 de la muestra) ----------
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function trozo(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
export function figuraMuestraPng(ancho = 320, alto = 180) {
  const filas = [];
  const horizonte = Math.round(alto * 0.45);
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 3);
    for (let x = 0; x < ancho; x++) {
      let color = y < horizonte ? [120, 180, 235] : [90, 160, 90];
      if (y === horizonte || y === horizonte + 1) color = [40, 40, 40];
      // La pista: un trapecio que se estrecha hacia el horizonte.
      if (y > horizonte + 4) {
        const t = (y - horizonte) / (alto - horizonte);
        const medio = ancho / 2;
        const mitad = 6 + t * 70;
        if (Math.abs(x - medio) < mitad) color = Math.abs(x - medio) < 2 && y % 12 < 6 ? [250, 250, 250] : [110, 110, 115];
      }
      fila.set(color, 1 + x * 3);
    }
    filas.push(fila);
  }
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0); cabecera.writeUInt32BE(alto, 4); cabecera[8] = 8; cabecera[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', cabecera), trozo('IDAT', deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}

// Escribe la muestra en una carpeta (para subirla a mano en la pantalla): muestra-academia.json y figura-m1.png.
export function escribirMuestra(carpeta) {
  writeFileSync(join(carpeta, 'muestra-academia.json'), JSON.stringify(paqueteMuestra(), null, 2));
  writeFileSync(join(carpeta, 'figura-m1.png'), figuraMuestraPng());
  return [join(carpeta, 'muestra-academia.json'), join(carpeta, 'figura-m1.png')];
}
