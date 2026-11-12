#!/usr/bin/env node
// Academia 0.12.4: el banco de regresión de la IA del instructor. Al cambiar de modelo o de prompt, corre los casos
// SINTÉTICOS de test/ia-regresion-banco.json (nunca preguntas de un libro ni del Test Guide) con el MISMO pedido de
// «Explícamelo de otra forma» que usa la app (src/academia/instructor-ia.js) y revisa cada respuesta con reglas:
//   - dice la respuesta correcta de la clave (el candado del Test Guide de la app);
//   - cumple el esquema y no está vacía; cada parte dentro de su largo;
//   - no nombra las opciones por letra ni por número («la A», «opción 2»);
//   - trae términos con inglés y español.
// No es parte de las pruebas normales: con --falso corre contra un proveedor falso en 127.0.0.1 (sin red, sin costo; así
// lo usa test/arreglos-0124.test.js). Con una clave de verdad cuesta dinero (unos US$0.01 por caso con Haiku 5.5):
//   node scripts/regresion-ia.mjs --falso
//   node scripts/regresion-ia.mjs --clave-archivo /ruta/clave.txt [--modelo claude-haiku-5-5] [--json]
// La clave se lee de un archivo (nunca de una variable ni de la línea de órdenes) y nunca se escribe en ningún lado.
// Sale con 0 si todos pasan, 1 si alguno no y 2 si no se pudo correr.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarExplicacion } from '../src/academia/instructor-ia.js';
import { anthropic } from '../src/ia/proveedores/anthropic.js';
import { llamarProveedor } from '../src/ia/llamar.js';
import { cumpleEsquema } from '../src/ia/esquema.js';
import { PROPOSITOS } from '../src/ia/propositos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valor = nombre => { const i = args.indexOf(nombre); return i >= 0 ? args[i + 1] : null; };
const falso = args.includes('--falso');
const comoJson = args.includes('--json');
const modelo = valor('--modelo') ?? 'claude-haiku-5-5';
const banco = JSON.parse(readFileSync(valor('--banco') ?? join(RAIZ, 'test', 'ia-regresion-banco.json'), 'utf8'));

// El caso como una pregunta del paquete (lo que armarExplicacion espera).
const comoPregunta = c => ({ id: `regresion-${c.id}`, original: { numero: c.id, enunciado: c.enunciado, opciones: c.opciones, correcta: c.correcta, explicacion: c.explicacion }, sencilla: c.sencilla });

// Reglas que se revisan en cada respuesta (puras: las usa también la prueba).
export function revisarCaso(pedido, json) {
  const fallas = [];
  if (!cumpleEsquema(json, pedido.esquema)) fallas.push('no_cumple_esquema');
  if (json?.opcion_correcta !== pedido.correcta) fallas.push('contradice_test_guide');
  const textos = [json?.explicacion, json?.por_que_no, json?.recuerda].map(x => String(x ?? ''));
  if (!textos[0].trim()) fallas.push('explicacion_vacia');
  if (textos[0].length > 1200 || textos[1].length > 800 || textos[2].length > 260) fallas.push('demasiado_largo');
  if (textos.some(t => /\b(?:opci[oó]n|option|respuesta|answer|la|el)\s+(?:[ABC]|[123])\b(?![\w.])/i.test(t))) fallas.push('nombra_letra_o_numero');
  if (!Array.isArray(json?.terminos) || !json.terminos.some(x => x?.ingles && x?.espanol)) fallas.push('sin_terminos');
  return fallas;
}

// El proveedor falso: responde bien (con la correcta que viene en <datos>) para probar el programa sin red.
function proveedorFalso() {
  const servidor = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', d => { cuerpo += d; });
    req.on('end', () => {
      const pedido = JSON.parse(cuerpo || '{}');
      const datos = JSON.parse(/<datos>\n([\s\S]*)\n<\/datos>/.exec(pedido.messages?.[0]?.content ?? '')?.[1] ?? '{}');
      const json = { opcion_correcta: datos.correcta, explicacion: 'Arriba la presión baja (low pressure) y por eso entra menos aire en cada respiración.', por_que_no: 'La que elegiste confunde la idea.', recuerda: 'Más alto, menos presión.', terminos: [{ ingles: 'pressure', espanol: 'presión', abreviatura: '' }] };
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_falso' });
      res.end(JSON.stringify({ id: 'msg_falso', type: 'message', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(json) }], usage: { input_tokens: 1500, output_tokens: 300 } }));
    });
  });
  return new Promise(listo => servidor.listen(0, '127.0.0.1', () => listo({ base: `http://127.0.0.1:${servidor.address().port}`, cerrar: () => servidor.close() })));
}

async function correr() {
  // Con el falso, src/ia/llamar.js solo deja llamar a 127.0.0.1 en su modo de prueba (nunca a otra dirección).
  if (falso) process.env.OPORTIA_TEST = '1';
  const f = falso ? await proveedorFalso() : null;
  let clave;
  if (f) clave = 'sk-ant-api00-falso';
  else {
    const archivo = valor('--clave-archivo');
    if (!archivo) { console.error('Uso: node scripts/regresion-ia.mjs --falso | --clave-archivo /ruta/clave.txt [--modelo …] [--json]'); return 2; }
    clave = readFileSync(archivo, 'utf8').trim();
  }
  const base = f ? f.base : anthropic.base;
  const def = PROPOSITOS.instructor_explicar;
  const resultados = [];
  try {
    for (const c of banco.casos) {
      const q = comoPregunta(c);
      const pedido = armarExplicacion({ q, elegida: c.elegida, acierto: c.elegida === c.correcta, idea: c.idea, alumno: { estilo: 'claro' }, idioma: 'es', modelo });
      const p = anthropic.pedido({ modelo, sistema: pedido.sistema, texto: pedido.texto, esquema: pedido.esquema, salidaMax: def.salidaMax, esfuerzo: def.esfuerzo });
      const resp = await llamarProveedor({ url: `${base}${p.ruta}`, metodo: p.metodo, cabeceras: anthropic.cabeceras(clave), cuerpo: p.cuerpo, timeoutMs: def.timeoutMs, permitido: f ? '127.0.0.1' : anthropic.host });
      const leido = anthropic.leer(resp);
      const fallas = leido.motivo === 'ok' ? revisarCaso(pedido, leido.json) : [`proveedor:${leido.motivo}`];
      resultados.push({ caso: c.id, ok: fallas.length === 0, fallas, tokens: leido.uso ? { entrada: leido.uso.entrada, salida: leido.uso.salida } : null });
    }
  } finally {
    clave = null;
    f?.cerrar();
  }
  const malos = resultados.filter(r => !r.ok);
  if (comoJson) console.log(JSON.stringify({ modelo, casos: resultados.length, pasan: resultados.length - malos.length, resultados }));
  else {
    for (const r of resultados) console.log(`${r.ok ? '✔' : '✘'} ${r.caso}${r.fallas.length ? ` — ${r.fallas.join(', ')}` : ''}`);
    console.log(`${resultados.length - malos.length} de ${resultados.length} pasan (${modelo}${falso ? ', proveedor falso' : ''}).`);
  }
  return malos.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  correr().then(codigo => process.exit(codigo), error => { console.error(String(error?.message ?? error).slice(0, 200)); process.exit(2); });
}
