#!/usr/bin/env node
// Academia 0.9.0: lista las opciones del «Modo reto» de un paquete que parecen FÁCILES (se descartan sin saber), para
// volver a escribirlas. Es un programa aparte, sin red y sin la base: solo LEE el paquete que se le da (que vive fuera
// de este repositorio, nunca dentro). No cambia nada: el enunciado, las opciones y la respuesta del Test Guide nunca se
// tocan; solo se revisan las 2 opciones nuevas de cada pregunta (src/academia/reto-calidad.js).
//
//   node scripts/reto-faciles.mjs /ruta/paquete.json            (texto)
//   node scripts/reto-faciles.mjs /ruta/paquete.json --md       (Markdown, para guardar en una nota)
//   node scripts/reto-faciles.mjs /ruta/paquete.json --json     (para otro programa)
// Sale con 0 si no hay ninguna, 1 si hay alguna y 2 si el paquete no se pudo leer o no está bien armado.
import { readFileSync } from 'node:fs';
import { revisarPaquete } from '../src/academia/formato.js';
import { retosFaciles, LARGO } from '../src/academia/reto-calidad.js';

const QUE_ES = Object.freeze({
  muy_corta: `mucho más corta que la correcta (menos de ${Math.round(LARGO.minimo * 100)} % de su largo)`,
  muy_larga: `mucho más larga que la correcta (más de ${Math.round(LARGO.maximo * 100)} % de su largo): la correcta «no pega» con las otras`,
  absoluto: 'dice «siempre», «nunca», «todo»… y la correcta no',
  sin_cifras: 'la correcta trae una cifra y esta no',
  cifras_de_mas: 'trae una cifra y la correcta no',
  otra_unidad: 'su cifra está en otra unidad que la de la correcta',
  fuera_de_tema: 'no comparte ninguna palabra con el tema (se ve que no es de aquí)',
  casi_igual: 'es casi la misma frase que otra opción',
});

const [ruta, ...banderas] = process.argv.slice(2);
if (!ruta || ruta.startsWith('-')) {
  console.error('Uso: node scripts/reto-faciles.mjs /ruta/paquete.json [--md | --json]');
  process.exit(2);
}
let paquete;
try {
  const texto = readFileSync(ruta, 'utf8');
  paquete = JSON.parse(texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto);
} catch (error) {
  console.error(`No se pudo leer ${ruta}: ${error?.code ?? error?.name ?? 'error'}`);
  process.exit(2);
}
const revision = revisarPaquete(paquete);
if (!revision.ok) {
  console.error('El paquete no está bien armado (corrígelo antes):');
  for (const e of revision.errores) console.error(`  ${e.ruta}: ${e.motivo}`);
  process.exit(2);
}
const lista = retosFaciles(paquete);
const conReto = paquete.preguntas.filter(q => Array.isArray(q.reto?.opciones)).length;
const opciones = lista.reduce((n, x) => n + x.opciones.length, 0);

if (banderas.includes('--json')) {
  console.log(JSON.stringify({ paquete: paquete.nombre ?? null, conReto, preguntas: lista.length, opciones, lista }, null, 2));
} else if (banderas.includes('--md')) {
  const lineas = [`# Opciones del Modo reto que parecen fáciles`, '', `Paquete: ${paquete.nombre ?? '(sin nombre)'}`, '',
    `${opciones} opción(es) en ${lista.length} de ${conReto} pregunta(s) con Modo reto. Volver a escribirlas con el mismo largo, el mismo tipo de dato`,
    'y las mismas palabras del tema que la correcta (sin «siempre»/«nunca» si la correcta no los usa). El enunciado, las opciones',
    'originales y la respuesta del Test Guide NO se cambian.', ''];
  for (const x of lista) {
    lineas.push(`## ${x.numero ? `Pregunta ${x.numero}` : x.pregunta} (\`${x.pregunta}\`, ${x.materia ?? '?'} / ${x.tema ?? '?'})`, '', `- Correcta (tal cual): ${x.correcta}`);
    for (const o of x.opciones) lineas.push(`- Reto ${o.indice + 1}: ${o.texto}`, ...o.motivos.map(m => `  - ${QUE_ES[m] ?? m}`));
    lineas.push('');
  }
  console.log(lineas.join('\n'));
} else {
  console.log(`${opciones} opción(es) del reto parecen fáciles, en ${lista.length} de ${conReto} pregunta(s) con Modo reto.`);
  for (const x of lista) {
    console.log(`\n${x.numero ? `Pregunta ${x.numero}` : x.pregunta} (${x.pregunta})\n  correcta: ${x.correcta}`);
    for (const o of x.opciones) console.log(`  reto ${o.indice + 1}: ${o.texto}\n    → ${o.motivos.map(m => QUE_ES[m] ?? m).join('; ')}`);
  }
}
process.exit(lista.length ? 1 : 0);
