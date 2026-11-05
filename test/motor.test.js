// Pruebas del motor propio (fase 1, parte b): entiende las instrucciones sin IA, nunca dice algo
// que no se escribió y, cuando no está seguro, pregunta.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  interpretar, faltantes, dudas, configuracionDesdeCampos, limpiarConfiguracion, catalogo, nombreSugerido, objetivoSugerido, productosDe,
  capacidadesDesdeLista, LIMITES, TIPOS, CLAVES_SUPUESTOS, CLAVES_DUDAS, CLAVES_DUDAS_GUARDADAS,
} from '../src/motor/interpretar.js';
import { normalizar, comparable, buscarFrases, tokenizar, variantes } from '../src/motor/texto.js';
import { SECTORES, PRODUCTOS, PROVINCIAS, MUNICIPIOS, CIUDADES, REGIONES, ZONAS, CAPACIDADES, COMBINACIONES } from '../src/motor/diccionarios.js';
import { CASOS_REVISION, CASOS_VARIADOS, CASOS_EQUIPO_ROJO, CASOS_EQUIPO_ROJO_2, CASOS_EQUIPO_ROJO_3, CASOS_EQUIPO_ROJO_4, CASOS_REVISION_FINAL } from './motor-casos.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const CATALOGO = catalogo();
const TODOS = [...CASOS_REVISION, ...CASOS_VARIADOS, ...CASOS_EQUIPO_ROJO, ...CASOS_EQUIPO_ROJO_2, ...CASOS_EQUIPO_ROJO_3, ...CASOS_EQUIPO_ROJO_4, ...CASOS_REVISION_FINAL];

// ---------- Texto ----------
test('normalizar quita acentos y mayúsculas sin cambiar la longitud del texto', () => {
  const original = 'Clínicas en SAN CRISTÓBAL, Higüey y Monseñor Nouel: RD$25,000 😀';
  const norm = normalizar(original);
  assert.equal(norm.length, original.length);
  assert.match(norm, /clinicas en san cristobal  higuey y monsenor nouel. rd\$25,000/);
  assert.equal(comparable('  Ñame   y  Café. '), 'name y cafe');
});

test('tokenizar separa palabras, números, dinero y signos, y guarda dónde está cada uno', () => {
  const texto = "Busco trabajo d chofer en Sto. Dgo., q paguen RD$25,000 o 18k-22k; tel 809-555-1234 pa' ganar";
  const tokens = tokenizar(texto);
  const palabras = tokens.map(t => t.w);
  assert.ok(palabras.includes('de') && palabras.includes('que') && palabras.includes('para'), 'escritura rápida: d, q, pa');
  assert.ok(palabras.includes('rd$') && palabras.includes('25,000'));
  assert.ok(palabras.includes('-'), 'el guion entre números es un rango');
  assert.deepEqual(palabras.slice(palabras.indexOf('sto'), palabras.indexOf('sto') + 3), ['sto', 'dgo', ','], 'el punto de «Sto.» no corta la frase');
  for (const t of tokens) assert.equal(texto.slice(t.ini, t.fin).length, t.fin - t.ini);
  assert.deepEqual(tokenizar('R.D. y EE.UU.').map(t => t.w), ['rd', 'y', 'eeuu']);
  assert.deepEqual(tokenizar('Bávaro-Punta Cana').map(t => t.w), ['bavaro', 'punta', 'cana'], 'el guion entre palabras es un espacio');
});

test('los plurales salen solos, también los de varias palabras en inglés («coffee shops»)', () => {
  assert.ok(variantes('coffee shop').includes('coffee shops'));
  assert.ok(variantes('law firm').includes('law firms'));
  assert.ok(variantes('free zone').includes('free zones'));
  assert.ok(variantes('call center').includes('call centers'));
  assert.ok(variantes('clinica dental').includes('clinicas dentales'));
  assert.ok(variantes('factory').includes('factories'));
  const entradas = [{ frase: 'clinica', dato: 'clinica' }, { frase: 'clinica dental', dato: 'dental' }, { frase: 'bar', dato: 'bar' }];
  assert.deepEqual(buscarFrases(normalizar('Clínicas dentales, clínicas y barberías'), entradas).map(h => h.dato), ['dental', 'clinica'], '«barberías» no es «bar»');
});

// ---------- Casos de la revisión y casos variados ----------
const VACIO = {
  producto: '', productos: [], sectores: [], sectoresLibres: [], sectoresExcluidos: [], exclusiones: [], paisCompleto: false, zonas: [], zonasLibres: [],
  zonasExcluidas: [], tamanos: [], prioridades: [], salarioMinimo: null, salarioMaximo: null, moneda: 'DOP', experiencia: null, frecuencia: 'semanal',
  capacidades: ['investigar', 'analizar', 'recomendar', 'propuestas', 'correos'],
};
const ordenada = v => (Array.isArray(v) ? [...v].sort() : v);

function revisarCaso(caso) {
  const { configuracion: c, supuestos } = interpretar(caso.texto, { idioma: caso.idioma || 'es' });
  const esperado = { ...VACIO, ...caso.espera };
  const real = { ...c, capacidades: Object.keys(c.capacidades).filter(k => c.capacidades[k]) };
  for (const clave of Object.keys(esperado)) {
    assert.deepEqual(ordenada(real[clave]), ordenada(esperado[clave]), `«${caso.texto}»: ${clave}`);
  }
  assert.deepEqual(ordenada(supuestos), ordenada(caso.supuestos), `«${caso.texto}»: supuestos`);
  assert.deepEqual(ordenada(dudas(c).map(d => d.clave)), ordenada(caso.dudas), `«${caso.texto}»: dudas`);
  assert.deepEqual(ordenada(faltantes(c).filter(f => f !== 'dudas')), ordenada(caso.faltantes), `«${caso.texto}»: faltantes`);
  // Mientras haya dudas no se puede aprobar.
  assert.equal(faltantes(c).includes('dudas'), caso.dudas.length > 0, `«${caso.texto}»: las dudas bloquean la aprobación`);
  return c;
}

test(`cada frase que señaló la revisión se entiende bien o se pregunta (${CASOS_REVISION.length} casos)`, () => {
  assert.ok(CASOS_REVISION.length >= 120);
  for (const caso of CASOS_REVISION) revisarCaso(caso);
});

test(`instrucciones dominicanas variadas: ventas, empleos, jerga, MAYÚSCULAS, emojis e inglés (${CASOS_VARIADOS.length} casos)`, () => {
  assert.ok(CASOS_VARIADOS.length >= 150);
  for (const caso of CASOS_VARIADOS) revisarCaso(caso);
});

test(`cada frase del equipo rojo (ronda 1) se entiende bien o se pregunta (${CASOS_EQUIPO_ROJO.length} casos)`, () => {
  assert.ok(CASOS_EQUIPO_ROJO.length >= 300);
  for (const caso of CASOS_EQUIPO_ROJO) revisarCaso(caso);
});

test(`cada frase de la segunda tanda del equipo rojo (ronda 1) se entiende bien o se pregunta (${CASOS_EQUIPO_ROJO_2.length} casos)`, () => {
  assert.ok(CASOS_EQUIPO_ROJO_2.length >= 130);
  for (const caso of CASOS_EQUIPO_ROJO_2) revisarCaso(caso);
});

test(`cada frase de la segunda ronda del equipo rojo se entiende bien, se pregunta o se avisa (${CASOS_EQUIPO_ROJO_3.length} casos)`, () => {
  assert.ok(CASOS_EQUIPO_ROJO_3.length >= 100);
  for (const caso of CASOS_EQUIPO_ROJO_3) revisarCaso(caso);
});

test(`cada frase de la tercera ronda del equipo rojo se entiende bien, se pregunta o se avisa (${CASOS_EQUIPO_ROJO_4.length} casos)`, () => {
  assert.ok(CASOS_EQUIPO_ROJO_4.length >= 150);
  for (const caso of CASOS_EQUIPO_ROJO_4) revisarCaso(caso);
});

test(`cada frase de la revisión final de la parte 1b se entiende bien o se pregunta (${CASOS_REVISION_FINAL.length} casos)`, () => {
  assert.ok(CASOS_REVISION_FINAL.length >= 25);
  for (const caso of CASOS_REVISION_FINAL) revisarCaso(caso);
  // Lo que se pregunta nombra el pedazo exacto, y las claves nuevas tienen su texto en los dos idiomas.
  const dudasDe = texto => dudas(interpretar(texto).configuracion).map(d => `${d.clave}:${d.texto}`);
  assert.deepEqual(dudasDe('Tengo una empresa de limpieza para oficinas. Quiero clientes en Santiago: bancos y clínicas'), ['para_quien:para oficinas']);
  assert.deepEqual(dudasDe('Vendo seguros de vida a maestros y policías de Santiago'), ['personas:maestros, policías']);
  assert.deepEqual(dudasDe('Vendo software a hoteles y negocios grandes en Santiago'), ['tamano_del_general:negocios grandes']);
  for (const clave of ['duda.para_quien', 'duda.personas', 'duda.tamano_del_general']) assert.ok(es[clave] && en[clave], clave);
  assert.match(es['duda.lugar_difuso'], /Todo el país/);
  assert.match(es['duda.personas'], /no personas/);
});

test('tercera ronda: las preguntas nombran lo que no se aplicó, y nada se quita en silencio', () => {
  const dudasDe = (texto, idioma = 'es') => dudas(interpretar(texto, { idioma }).configuracion).map(d => `${d.clave}:${d.texto}`);
  // Más de 30 preferencias: la pregunta dice cuáles quedaron fuera.
  const beneficios = ['seguro médico', 'transporte', 'comida', 'bono', 'uniforme', 'vacaciones pagadas', 'horas extras pagadas', 'regalía', 'celular de la empresa',
    'combustible', 'dieta', 'capacitación', 'plan de pensiones', 'ascensos', 'buen ambiente', 'parqueo', 'guardería', 'gimnasio', 'descuentos', 'préstamos',
    'cooperativa', 'seguro de vida', 'seguro dental', 'bono navideño', 'bono de productividad', 'incentivos', 'comisiones', 'propinas', 'viáticos', 'laptop',
    'internet pagado', 'home office'];
  assert.deepEqual(dudasDe(`Busco trabajo de chofer en Santiago, 25 mil, ${beneficios.map(b => `con ${b}`).join(', ')}`), ['lista_larga:con internet pagado, con home office']);
  // El salario en letras, con una excepción o con otro periodo se pregunta con el pedazo exacto.
  assert.deepEqual(dudasDe('Busco empleo de cajera en Santiago, 20 mil, pago quincenal'), ['salario_periodo:20 mil … pago quincenal']);
  assert.deepEqual(dudasDe('Busco trabajo de chofer en Santiago, 25 mil, aunque acepto menos si es cerca'), ['salario:25 mil … aunque acepto menos si es cerca']);
  assert.deepEqual(dudasDe('Busco trabajo de cajera en Santiago, que pague más de treinta mil'), ['salario:que pague más de treinta mil']);
  // Lo que no es seguro, lo que es solo para una parte y lo que no se puede: se dice qué es.
  assert.deepEqual(dudasDe('vendo seguros a talleres en santiago, moca no se'), ['lugar_inseguro:moca no se']);
  assert.deepEqual(dudasDe('Vendo paneles a hoteles y restaurantes, pero los restaurantes solo en Santiago'), ['combinacion_parcial:pero los restaurantes solo en Santiago']);
  assert.deepEqual(dudasDe('Busca hoteles en Santiago todos los dias menos los fines de semana, vendo solar'), ['frecuencia_no_disponible:todos los dias menos los fines de semana']);
  // «Sabana Grande» puede ser dos municipios: se pregunta con los dos.
  const sabana = dudas(interpretar('Vendo hielo a colmados de Sabana Grande').configuracion);
  assert.deepEqual(sabana.map(d => [d.clave, d.texto, d.sugerencias]), [['lugar_difuso', 'Sabana Grande', ['sabana-grande-de-boya', 'sabana-grande-de-palenque']]]);
  // Las claves nuevas tienen su texto en los dos idiomas.
  for (const clave of ['duda.lugar_inseguro', 'supuesto.personas_sueltas', 'supuesto.enviar_whatsapp']) assert.ok(es[clave] && en[clave], clave);
  // Un cliente con nombre se excluye aunque se diga de otra manera, y la competencia nombrada también (sin pedir buscarla).
  assert.deepEqual(interpretar('vendo seguros a talleres en moca, menos al taller garcia que ya es cliente').configuracion.exclusiones, ['taller garcia']);
  assert.deepEqual(interpretar('I sell cameras to supermarkets in Santiago, Bravo and La Sirena are already my customers', { idioma: 'en' }).configuracion.exclusiones, ['Bravo', 'La Sirena']);
  assert.deepEqual(interpretar('Vendo seguros a empresas de Santiago. No busques a Seguros Universal, son mi competencia').configuracion.exclusiones, ['Seguros Universal']);
});

test('el motor nunca falla, ni con un «no» o una palabra suelta al final del texto (sin punto)', () => {
  const finales = [' no', ', no', ' experiencia no', ' noches no', ' tardes', ' sin', ' a', ' en', ' de', ' que', ' y', ' -', ' 💧', ' usa', ' a las 8'];
  for (const caso of TODOS) {
    const palabras = caso.texto.split(/\s+/);
    for (const final of finales) {
      for (const texto of [caso.texto + final, palabras.slice(0, Math.ceil(palabras.length / 2)).join(' ') + final]) {
        assert.doesNotThrow(() => interpretar(texto, { idioma: caso.idioma || 'es' }), texto);
      }
    }
  }
});

test('segunda tanda: las preguntas nombran el pedazo exacto, y lo que se guarda va completo', () => {
  const dudasDe = (texto, idioma = 'es') => dudas(interpretar(texto, { idioma }).configuracion).map(d => `${d.clave}:${d.texto}`);
  assert.deepEqual(dudasDe('Busco trabajo de chofer en EE.UU.'), ['fuera_del_pais:EE.UU.'], 'la zona no queda cortada («EE.U»)');
  assert.deepEqual(dudasDe('Vendo ropa a tiendas en E.E.U.U.'), ['fuera_del_pais:E.E.U.U.']);
  assert.deepEqual(dudasDe('Busco trabajo de chofer en Moca, Santiago'), ['lugar_provincia:Moca, Santiago']);
  assert.deepEqual(dudasDe('Vendo agua a colmados en Constanza, La Vega'), [], 'la provincia solo dice dónde queda');
  assert.deepEqual(dudasDe('Vendo agua a colmados en Moca, Santiago y La Vega'), [], 'una lista de tres lugares no se pregunta');
  assert.deepEqual(dudasDe('Vendo agua a colmados en Puerto Rico y en San Juan'), ['lugar_homonimo:San Juan', 'fuera_del_pais:Puerto Rico', 'fuera_del_pais:San Juan (Puerto Rico)']);
  assert.deepEqual(dudasDe('Vendo seguros a hoteles y empresas en Santo Domingo'), ['sector_general:empresas']);
  assert.deepEqual(dudasDe('Busco trabajo de técnico de refrigeración en Puerto Plata, quincenal 12 mil'), ['salario_periodo:quincenal 12 mil']);
  assert.deepEqual(dudasDe('vendo camaras a colmados en santiago quincenal'), ['frecuencia_no_disponible:quincenal']);
  assert.deepEqual(dudasDe('Busco trabajo de chofer en Santiago o donde sea'), ['lugar_difuso:donde sea']);
  // El enlace del dueño no es lo que vende; un enlace solo no dice qué vende.
  const web = interpretar('Vendo seguros a empresas en Santiago. Mi página web: https://segurosjr.do').configuracion;
  assert.deepEqual([web.producto, web.productos], ['seguros', ['seguros']]);
  const enlace = interpretar('Vendo https://www.tiendajunior.com a supermercados de La Romana').configuracion;
  assert.equal(enlace.producto, '');
  assert.ok(faltantes(enlace).includes('producto'));
  // «Hotel Matum» y la Bonanza ya son sus clientes: van en «Excluir», nunca en «A quién buscar».
  const clientes = interpretar('vendo seguros a empresas en santiago, ya tengo a la Bonanza y a Supermercado Nacional como clientes, sacalos').configuracion;
  assert.deepEqual(clientes.exclusiones, ['Bonanza', 'Supermercado Nacional']);
  assert.deepEqual(clientes.sectoresLibres, []);
  // Llamar o WhatsApp: se avisa que todavía no se hace, y las propuestas no se apagan.
  const llamar = interpretar('vendo camaras a colmados en santiago, llamalos');
  assert.ok(llamar.supuestos.includes('contactar_telefono') && !llamar.supuestos.includes('contactar_a_mano'));
  assert.equal(llamar.configuracion.capacidades.propuestas, true);
  assert.equal(llamar.configuracion.capacidades.contactar, false);
  // «sin preguntarme»: sigue en el nivel más seguro, y se avisa.
  const solo = interpretar('vendo camaras a colmados en santiago, hazlo todo tu solo sin preguntarme');
  assert.equal(solo.configuracion.autonomia, 'aprobar_salidas');
  assert.ok(solo.supuestos.includes('autonomia_pedida'));
  assert.ok(!interpretar('no contactes a nadie sin preguntarme, vendo software a hoteles en Santiago').supuestos.includes('autonomia_pedida'),
    '«no contactes a nadie sin preguntarme» pide lo contrario');
});

test('«Contactar» nunca se enciende desde el texto, ni siquiera cuando se pide: se avisa y se deja para encender a mano', () => {
  for (const caso of TODOS) {
    const { configuracion: c } = interpretar(caso.texto, { idioma: caso.idioma || 'es' });
    assert.equal(c.capacidades.contactar, false, caso.texto);
  }
  const pedido = interpretar('Vendo páginas web a restaurantes en Punta Cana. Prepara propuestas y correos y contáctalos por Gmail. Revisa cada día.');
  assert.equal(pedido.configuracion.capacidades.contactar, false);
  assert.equal(pedido.configuracion.capacidades.propuestas, true);
  assert.equal(pedido.configuracion.capacidades.correos, true);
  assert.ok(pedido.supuestos.includes('contactar_a_mano'));
  assert.ok(!pedido.supuestos.includes('capacidades'), 'pidió capacidades: no se dice que se supusieron');
});

test('los ejemplos de la pantalla se entienden completos en español y en inglés, y se pueden aprobar', () => {
  for (const [idioma, frases] of [['es', es], ['en', en]]) {
    for (const n of [1, 2, 3]) {
      const texto = frases[`proyectos.ejemplo.${n}`];
      const { configuracion: c, supuestos } = interpretar(texto, { idioma });
      assert.deepEqual(faltantes(c), [], `${idioma} ${n}: ${texto}`);
      assert.ok(!supuestos.includes('tipo') && !supuestos.includes('tipo_laboral'), `${idioma} ${n}: el tipo está claro`);
      if (n === 3) {
        assert.equal(c.tipo, 'laboral');
        assert.equal(comparable(c.producto), idioma === 'en' ? 'driver' : 'chofer');
        assert.deepEqual(c.zonas, ['santiago']);
        assert.equal(c.salarioMinimo, 25000);
        assert.equal(c.experiencia, 'no_requerida');
        assert.deepEqual(c.prioridades, [], '«sin experiencia» no se repite como prioridad');
      } else assert.equal(c.tipo, 'comercial');
    }
  }
  const ejemplo1 = interpretar(es['proyectos.ejemplo.1']).configuracion;
  assert.deepEqual(ejemplo1.sectores, ['hoteles', 'clinicas', 'fabricas']);
  assert.equal(ejemplo1.paisCompleto, true);
  // El nombre lleva el primer sector (o lugar): dos proyectos del mismo producto no se ven iguales en la lista.
  assert.equal(nombreSugerido(ejemplo1), 'Clientes para paneles solares · Hoteles');
  assert.equal(nombreSugerido(interpretar(en['proyectos.ejemplo.1'], { idioma: 'en' }).configuracion, 'en'), 'Customers for solar panels · Hotels');
  assert.match(objetivoSugerido(interpretar(en['proyectos.ejemplo.3']).configuracion, 'en'), /^Get a job as driver/);
});

test('una negación de después nunca queda como dato de la búsqueda, y los teléfonos no se guardan', () => {
  const negacionAlFinal = /(^|\s)(no|tampoco|not|nunca|never|jamás|jamas)$/i;
  for (const caso of TODOS) {
    const { configuracion: c } = interpretar(caso.texto, { idioma: caso.idioma || 'es' });
    for (const v of [...c.sectoresLibres, ...c.zonasLibres, ...c.prioridades, ...c.exclusiones, c.producto]) {
      assert.doesNotMatch(v, negacionAlFinal, `«${caso.texto}»: «${v}»`);
    }
  }
  for (const texto of ['busco trabajo de cocinero en bavaro, me pueden llamar al 809 555 1234', 'busco trabajo de cocinero en bavaro 📞 809.555.1234',
    'Vendo software a hoteles en Santiago, mi celular es 809-555-1234']) {
    const { configuracion: c, supuestos } = interpretar(texto);
    assert.doesNotMatch(JSON.stringify(c), /555/, texto);
    assert.ok(supuestos.includes('telefono'), texto);
    assert.ok(!supuestos.includes('contactar_a_mano'), `${texto}: dar su número no es pedir que contacte`);
    assert.equal(c.capacidades.propuestas, true, texto);
  }
});

test('los lugares con el mismo nombre en dos provincias se muestran con su provincia y se preguntan', () => {
  const nombre = clave => CATALOGO.zonas.find(z => z.clave === clave).nombre;
  assert.match(nombre('los-rios'), /Bahoruco/);
  assert.match(nombre('la-cienaga'), /Barahona/);
  assert.match(nombre('bella-vista'), /Distrito Nacional/);
  const { configuracion: c } = interpretar('Vendo agua a negocios en Arroyo Hondo y Los Ríos');
  assert.deepEqual(dudas(c).map(d => `${d.clave}:${d.texto}`), ['lugar_homonimo:Los Ríos']);
  const conProvincia = interpretar('Vendo agua a colmados en Los Ríos, Bahoruco').configuracion;
  assert.deepEqual(dudas(conProvincia), [], 'con su provincia no hay duda');
});

// ---------- Dudas: lo que no se entendió se pregunta y bloquea ----------
test('lo que no se entiende se pregunta, con sugerencias de lugares parecidos', () => {
  const { configuracion: c } = interpretar('Vendo software a hoteles en Santigo y en Higuei');
  const lugares = dudas(c).filter(d => d.clave === 'lugar');
  assert.deepEqual(lugares.map(d => d.texto), ['Santigo', 'Higuei']);
  assert.deepEqual(lugares.map(d => d.sugerencias), [['santiago'], ['higuey']]);
  assert.ok(faltantes(c).includes('dudas'));
  const raro = interpretar('Vendo software a hoteles en Santiago, quiero el plan platino con descuento').configuracion;
  assert.ok(dudas(raro).some(d => d.clave === 'texto' && /plan platino/.test(d.texto)), 'lo que nadie usó se pregunta');
});

test('lo que está para buscar y para excluir a la vez, o fuera del país, es una duda que se calcula de los datos', () => {
  const base = limpiarConfiguracion({ tipo: 'comercial', producto: 'software', sectores: ['hoteles'], sectoresExcluidos: ['hoteles'], zonas: ['santiago'], zonasExcluidas: ['santiago'], zonasLibres: ['Miami'], capacidades: { investigar: true } });
  assert.deepEqual(dudas(base).map(d => `${d.clave}:${d.texto}`), ['conflicto_sector:hoteles', 'conflicto_zona:santiago', 'fuera_del_pais:Miami']);
  assert.ok(faltantes(base).includes('dudas'));
  const arreglada = limpiarConfiguracion({ ...base, sectoresExcluidos: [], zonasExcluidas: [], zonasLibres: [] });
  assert.deepEqual(dudas(arreglada), [], 'al corregir el dato, la duda desaparece sola');
  assert.deepEqual(faltantes(arreglada), []);
});

test('en el formulario se marcan las dudas resueltas; un lugar nuevo que no se conoce se vuelve a preguntar', () => {
  const base = interpretar('Vendo software a hoteles en Santigo y Santiago, quiero el plan platino').configuracion;
  assert.equal(base.noEntendido.length, 2);
  const campos = camposDelFormulario(base, 'es');
  const igual = configuracionDesdeCampos(campos, base);
  assert.deepEqual(igual.noEntendido, base.noEntendido, 'sin marcar nada, las dudas siguen');
  const una = configuracionDesdeCampos({ ...campos, resueltas: [1] }, base);
  assert.deepEqual(una.noEntendido.map(d => d.texto), ['Santigo']);
  const todas = configuracionDesdeCampos({ ...campos, zonas: 'Santiago', resueltas: [0, 1] }, base);
  assert.deepEqual(todas.noEntendido, []);
  assert.deepEqual(faltantes(todas), []);
  const nueva = configuracionDesdeCampos({ ...campos, zonas: 'Santiago, Pueblo Raro, Miami', resueltas: [0, 1] }, base);
  assert.deepEqual(nueva.zonasLibres, ['Pueblo Raro', 'Miami']);
  assert.deepEqual(dudas(nueva).map(d => d.clave), ['lugar', 'fuera_del_pais'], 'un lugar escrito a mano que no conozco se pregunta, y fuera del país se bloquea');
  const fuera = configuracionDesdeCampos({ ...camposDelFormulario(nueva, 'es'), resueltas: [0] }, nueva);
  assert.deepEqual(dudas(fuera).map(d => d.clave), ['fuera_del_pais'], 'lo de fuera del país no se puede marcar: hay que quitarlo');
});

// ---------- Formulario: guardar sin cambiar nada deja todo igual ----------
function camposDelFormulario(c, idioma) {
  const nombreSector = clave => { const s = CATALOGO.sectores.find(x => x.clave === clave); return s ? s[idioma] || s.es : clave; };
  const nombreZona = clave => CATALOGO.zonas.find(x => x.clave === clave)?.nombre || clave;
  return {
    tipo: c.tipo,
    objetivo: c.objetivo,
    producto: c.producto,
    sectores: [...c.sectores.map(nombreSector), ...c.sectoresLibres].join(', '),
    zonas: [...c.zonas.map(nombreZona), ...c.zonasLibres].join(', '),
    paisCompleto: c.paisCompleto,
    tamanos: c.tamanos,
    exclusiones: [...c.sectoresExcluidos.map(nombreSector), ...c.zonasExcluidas.map(nombreZona), ...c.exclusiones].join(', '),
    prioridades: c.prioridades.join('\n'),
    salarioMinimo: c.salarioMinimo == null ? null : String(c.salarioMinimo),
    salarioMaximo: c.salarioMaximo == null ? null : String(c.salarioMaximo),
    experienciaNoRequerida: c.experiencia === 'no_requerida',
    frecuencia: c.frecuencia,
    capacidades: c.capacidades,
    resueltas: [],
  };
}

test('guardar el formulario sin cambiar nada da exactamente la misma configuración (todos los casos, en español y en inglés)', () => {
  for (const caso of TODOS) {
    const { configuracion: c } = interpretar(caso.texto, { idioma: caso.idioma || 'es' });
    for (const idioma of ['es', 'en']) {
      assert.deepEqual(configuracionDesdeCampos(camposDelFormulario(c, idioma), c), c, `«${caso.texto}» (${idioma})`);
    }
  }
});

test('todas las etiquetas del catálogo vuelven igual del formulario, también las que llevan comas o «y»', () => {
  const base = interpretar('Vendo software a hoteles en Santiago').configuracion;
  for (const idioma of ['es', 'en']) {
    const sectores = SECTORES.filter(s => !s.general);
    const c = limpiarConfiguracion({ ...base, sectores: sectores.map(s => s.clave).slice(0, 30) });
    assert.deepEqual(configuracionDesdeCampos(camposDelFormulario(c, idioma), c).sectores, c.sectores, idioma);
    for (let i = 0; i < ZONAS.length; i += 30) {
      const z = limpiarConfiguracion({ ...base, zonas: ZONAS.slice(i, i + 30).map(x => x.clave) });
      assert.deepEqual(configuracionDesdeCampos(camposDelFormulario(z, idioma), z).zonas, z.zonas, `zonas desde ${i}`);
    }
  }
  for (const p of PRODUCTOS) {
    assert.deepEqual(productosDe(p.es), [p.clave], p.es);
    assert.deepEqual(productosDe(p.en), [p.clave], p.en);
  }
  const camaras = interpretar('Vendo cámaras de seguridad a farmacias en Santiago').configuracion;
  assert.deepEqual(camaras.productos, ['seguridad']);
  assert.equal(camaras.producto, 'cámaras de seguridad', 'se guarda lo que escribió la persona, no la etiqueta');
});

test('los campos cambiados a mano se ordenan: lo conocido se reconoce y lo demás queda como texto', () => {
  const base = interpretar('Vendo software a hoteles en Santiago').configuracion;
  const larga = 'Prioriza hoteles que tengan generadores viejos, facturas de luz muy altas y que hayan tenido apagones frecuentes este año; y techos grandes';
  const c = configuracionDesdeCampos({
    tipo: 'comercial',
    producto: 'Sistemas de reservas',
    sectores: 'Hoteles, Restaurantes, bares y cafés, barberías, tiendas de surf, empresas de seguridad',
    zonas: 'La Romana; Bávaro\nPueblo Inventado',
    exclusiones: 'colmados, Santiago, los que ya son clientes, bares',
    prioridades: `que tengan web, redes y correo\ncon más de 20 habitaciones\n${larga}`,
    tamanos: ['medianas', 'gigantes', { toString: 0 }],
    frecuencia: 'diaria',
    capacidades: { investigar: true, contactar: true, inventada: true },
  }, base);
  assert.deepEqual(c.productos, ['reservas']);
  assert.deepEqual(c.sectores, ['hoteles', 'restaurantes', 'belleza']);
  assert.deepEqual(c.sectoresLibres, ['tiendas de surf', 'empresas de seguridad'], '«empresas de X» no es «todo tipo de empresas»');
  assert.deepEqual(c.zonas, ['la-romana', 'punta-cana']);
  assert.deepEqual(c.zonasLibres, ['Pueblo Inventado']);
  assert.deepEqual(dudas(c).map(d => `${d.clave}:${d.texto}`), ['lugar:Pueblo Inventado']);
  assert.deepEqual(c.sectoresExcluidos, ['colmados']);
  assert.deepEqual(c.zonasExcluidas, ['santiago']);
  assert.deepEqual(c.exclusiones, ['los que ya son clientes', 'bares'], 'excluir «bares» no excluye todos los restaurantes');
  assert.equal(c.prioridades.length, 3, 'una prioridad por línea, aunque lleve comas o punto y coma');
  assert.equal(c.prioridades[2], larga.slice(0, 160).trim(), 'hasta 160 letras, no 80');
  assert.deepEqual(c.tamanos, ['medianas'], 'un tamaño que no existe se ignora');
  assert.equal(c.capacidades.contactar, true, 'a mano sí se puede encender contactar');
  assert.equal(c.capacidades.correos, true, 'contactar necesita preparar correos');
  assert.ok(!('inventada' in c.capacidades));
});

// ---------- Forma y límites ----------
test('la configuración guardada siempre tiene la misma forma y respeta los límites', () => {
  const c = limpiarConfiguracion({
    tipo: 'raro', producto: 'x'.repeat(1000), sectores: ['hoteles', 'no-existe', 'hoteles'], prioridades: Array(100).fill('a').map((a, i) => `${a}${i}`),
    salarioMinimo: 25000, capacidades: { investigar: 'si' }, noEntendido: [{ clave: 'texto', texto: 'algo' }, { clave: 'inventada', texto: 'x' }, 'mal', null],
  });
  assert.equal(c.tipo, 'comercial');
  assert.equal(c.producto.length, LIMITES.producto);
  assert.deepEqual(c.sectores, ['hoteles']);
  assert.equal(c.prioridades.length, 30);
  assert.equal(c.salarioMinimo, null, 'el salario solo existe en proyectos de empleo');
  assert.equal(c.capacidades.investigar, false, 'solo true cuenta como encendido');
  assert.deepEqual(c.noEntendido, [{ clave: 'texto', texto: 'algo', sugerencias: [] }], 'solo dudas conocidas');
  assert.deepEqual(Object.keys(c).sort(), Object.keys(limpiarConfiguracion({})).sort());
  assert.deepEqual(TIPOS, ['comercial', 'laboral']);
  assert.deepEqual(capacidadesDesdeLista(['contactar']).correos, true);
});

test('valores raros (objetos, listas, números) no rompen nada: cuentan como vacíos', () => {
  const raro = { toString: 0 };
  assert.doesNotThrow(() => interpretar(raro));
  assert.doesNotThrow(() => interpretar(['lista']));
  assert.doesNotThrow(() => limpiarConfiguracion({ producto: raro, objetivo: raro, sectoresLibres: [raro], salarioMinimo: raro, tipo: 'laboral', moneda: raro, frecuencia: raro }));
  const base = interpretar('Busco trabajo de chofer en Santiago').configuracion;
  const c = configuracionDesdeCampos({ tipo: raro, producto: raro, sectores: [raro], zonas: raro, exclusiones: { a: 1 }, prioridades: [raro, 'una'], salarioMinimo: raro, resueltas: raro, capacidades: raro }, base);
  assert.equal(c.producto, '');
  assert.equal(c.tipo, 'laboral');
  assert.deepEqual(c.prioridades, ['una']);
  assert.equal(c.salarioMinimo, null);
});

test('textos muy largos o raros no rompen el motor', () => {
  for (const texto of ['', '   ', '$$$ ,,, ...', 'á'.repeat(10000), '😀'.repeat(3000), 'excepto sin menos salvo', '25,000,000,000 pesos de salario', 'null', 'R.D.R.D.R.D.', '- - - 1-2-3', "'''", 'a.b.c.d.e']) {
    const { configuracion } = interpretar(texto);
    assert.deepEqual(Object.keys(configuracion).sort(), Object.keys(limpiarConfiguracion({})).sort());
    assert.ok(configuracion.noEntendido.length <= LIMITES.dudas);
  }
});

// ---------- Rapidez: el servidor tiene 1 procesador lento ----------
test('cualquier texto de 4000 letras, aunque esté hecho para trabar el motor, se entiende rápido', () => {
  const relleno = f => { let s = ''; for (let i = 0; s.length < 4000; i++) s += `${f(i)} `; return s.slice(0, 4000); };
  const letras = 'abcdefghijklmnopqrstuvwxyz';
  const casos = {
    'sin aa sin ab …': relleno(i => `sin ${letras[Math.floor(i / 26) % 26]}${letras[i % 26]}`),
    'sin k0, sin k1, …': relleno(i => `sin k${i},`),
    'sin w0 sin w1 …': relleno(i => `sin w${i}`),
    'without q0 …': relleno(i => `without q${i}`),
    'excepto x0 excepto x1 …': relleno(i => `excepto x${i}`),
    'muchos números': relleno(i => `${(i * 37) % 1000},${i % 1000} mil a ${i}`),
    'muchos salarios': relleno(i => `salario entre ${i} y ${i + 1} mil o RD$${i},000`),
    'teléfonos y rangos': relleno(i => `${i}-${i + 1}-${i + 2} ${i}k-${i + 1}k`),
    'ni en … ni en …': relleno(i => `ni en Moca${i % 3 ? '' : ','}`),
    'muchos lugares': relleno(i => ['Santiago', 'La Vega', 'Moca', 'Pueblo Raro', 'SD', 'Stgo'][i % 6] + (i % 2 ? ',' : ' y')),
    'prioriza …': relleno(i => `prioriza hoteles que tengan x${i},`),
    'no a0 no a1 …': relleno(i => `no a${i}`),
    'mezcla': relleno(i => ['Vendo', 'a', 'hoteles', 'en', 'Santiago,', 'excepto', 'colmados', 'sin', 'web', 'que', 'tengan', 'cada', 'dia', 'salario', '25', 'mil', 'Busco', 'trabajo', 'de', 'chofer'][i % 20]),
    'mayúsculas sueltas': relleno(i => `En Pueblo${i} Raro${i}`),
    'una sola palabra': 'hoteles'.repeat(570),
    'guiones': '1-'.repeat(2000),
    'emojis': '😀'.repeat(2000),
    'en A y en B': 'en Pueblo Raro y en Otro Lugar, '.repeat(130),
    'y y y': 'y '.repeat(2000),
    'no no no': 'no '.repeat(1400),
    'la Duarte con': 'la Duarte con '.repeat(290),
    'rangos con mil': 'de 1 a 2 mil de 3 a 4 mil '.repeat(160),
    '1k-1k-': '1k-'.repeat(1400),
    // Ronda 1 del equipo rojo: muchos oficios con comas hacían buscar lugares parecidos una y otra vez.
    'oficios con comas': relleno(i => `${['chofer', 'mensajero', 'cajero', 'vendedor', 'conserje', 'ayudante', 'digitador', 'mesero', 'cocinero', 'pintor', 'plomero'][i % 11]},`),
    'oficios distintos': relleno(i => `oficio${i}x,`),
    'Villa y Los …': relleno(i => `colmados de Villa Nombre${i} y Los Mameyes${i},`),
    'X no, Y tampoco': relleno(i => ['hoteles no,', 'bares tampoco,', 'a moca no,'][i % 3]),
    'el norte de …': relleno(i => ['en el norte de Santiago,', 'Jardines del Este,'][i % 2]),
    'porque …': relleno(() => 'porque no compran y'),
    'vivo en …': relleno(i => ['Soy de Moca,', 'mi oficina está en Naco,'][i % 2]),
    'salarios negados': relleno(i => `no quiero ganar menos de ${i} mil,`),
    'SD Norte y Este': relleno(() => 'Santo Domingo Norte y Este y'),
    'los que estén en …': relleno(() => 'excepto los que esten en Moca y que sean grandes'),
    // Segunda tanda de la ronda 1: suplidores, clientes que ya tiene, horarios, lugares con provincia, prioridades.
    'me venden …': relleno(i => `los hoteles${i} me venden toallas,`),
    'ya tengo a …': relleno(i => `ya tengo a Empresa${i} y a Otra${i} como clientes, sacalos,`),
    'de 7 a 3 …': relleno(i => `de ${i % 12 + 1} a ${i % 7 + 1},`),
    'Moca, Santiago …': relleno(i => ['Moca, Santiago,', 'Constanza, La Vega,', 'Los Mina de Santiago,'][i % 3]),
    'sobre todo …': relleno(i => `talleres${i} sobre todo, colmados y farmacias principalmente,`),
    'quincenal …': relleno(i => `quincenal ${i} mil o ${i + 1} mil,`),
    // Tercera ronda: otras personas, clientes y competencia con nombre, lugares inseguros, productos con su negocio, días que se saltan.
    'mi hermano vende …': relleno(i => `mi hermano vende cosa${i} y`),
    'ya son clientes …': relleno(i => `ya son clientes mios el hotel h${i} y el hodelpa${i},`),
    'menos el … que ya es cliente': relleno(i => `menos el aloft${i} que ya es cliente`),
    'Bravo and … are my customers': relleno(i => `Bravo${i} and La Sirena${i} and`),
    'mi competencia es …': relleno(i => `mi competencia es Ferreteria Ochoa${i} y`),
    'no sé si en …': relleno(i => ['no se si en la vega tambien', 'moca no se,', 'tal vez en Moca'][i % 3]),
    'y mesas a hoteles …': relleno(i => `vendo sillas a restaurantes y mesas${i} a hoteles${i}`),
    'todos los días menos …': relleno(i => 'todos los dias menos los domingos y los lunes,'),
    'treinta mil …': relleno(i => 'que pague mas de treinta mil o veinte y cinco mil,'),
    'no hago delivery a …': relleno(i => `no hago delivery a Pueblo${i},`),
  };
  let peor = 0;
  for (const [nombre, texto] of Object.entries(casos)) {
    const inicio = process.hrtime.bigint();
    const { configuracion } = interpretar(texto);
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    peor = Math.max(peor, ms);
    assert.ok(ms < 1500, `«${nombre}» tardó ${ms.toFixed(0)} ms`);
    assert.ok(configuracion.prioridades.length <= 30 && configuracion.exclusiones.length <= 30);
  }
  assert.ok(peor < 1500);
});

// ---------- Diccionarios y frases ----------
test('los diccionarios están completos y bien escritos: 32 provincias, sus municipios, distritos y regiones', () => {
  assert.equal(PROVINCIAS.length, 32, 'las 31 provincias y el Distrito Nacional');
  assert.ok(MUNICIPIOS.length >= 157, `municipios: ${MUNICIPIOS.length}`);
  const provincias = new Set(PROVINCIAS.map(p => p.clave));
  for (const m of MUNICIPIOS) assert.ok(provincias.has(m.provincia), `${m.clave} apunta a una provincia que no existe`);
  for (const p of provincias) assert.ok(MUNICIPIOS.some(m => m.provincia === p), `la provincia ${p} no tiene municipios`);
  for (const c of CIUDADES) assert.ok(provincias.has(c.provincia), `${c.clave} no tiene provincia`);
  for (const r of REGIONES) for (const p of r.provincias) assert.ok(provincias.has(p), `${r.clave}: ${p}`);
  for (const grupo of [SECTORES, PRODUCTOS, ZONAS]) {
    const lista = grupo.map(x => x.clave);
    assert.equal(new Set(lista).size, lista.length, 'claves repetidas');
  }
  const nombres = ZONAS.map(z => comparable(z.nombre));
  assert.equal(new Set(nombres).size, nombres.length, 'dos lugares con el mismo nombre no se podrían distinguir en el formulario');
  for (const z of ZONAS) assert.ok(!z.nombre.includes(','), `el nombre de ${z.clave} no puede llevar coma`);
  for (const x of [...SECTORES, ...PRODUCTOS, ...ZONAS, ...CAPACIDADES]) {
    for (const p of x.palabras) assert.equal(comparable(p), p, `«${p}» debe ir en minúsculas y sin acentos`);
  }
  assert.equal(CAPACIDADES.length, 7, 'las 7 capacidades de cada proyecto');
  for (const lista of Object.values(COMBINACIONES)) for (const c of lista) assert.ok(CAPACIDADES.some(x => x.clave === c));
  assert.equal(CATALOGO.zonas.length, ZONAS.length);
});

test('cada supuesto y cada duda que puede dar el motor tiene su frase en español y en inglés, con las mismas variables', () => {
  for (const s of CLAVES_SUPUESTOS) assert.ok(`supuesto.${s}` in es && `supuesto.${s}` in en, `falta supuesto.${s}`);
  for (const d of CLAVES_DUDAS) {
    assert.ok(`duda.${d}` in es && `duda.${d}` in en, `falta duda.${d}`);
    const variables = t => [...t.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(variables(es[`duda.${d}`]), variables(en[`duda.${d}`]));
  }
  for (const caso of TODOS) {
    const { configuracion: c, supuestos } = interpretar(caso.texto, { idioma: caso.idioma || 'es' });
    for (const s of supuestos) assert.ok(CLAVES_SUPUESTOS.includes(s), s);
    for (const d of dudas(c)) assert.ok(CLAVES_DUDAS.includes(d.clave), d.clave);
    for (const d of c.noEntendido) assert.ok(CLAVES_DUDAS_GUARDADAS.includes(d.clave), d.clave);
  }
});

// ---------- De punta a punta: la pantalla recibe las dudas y no se puede aprobar hasta resolverlas ----------
test('por el servidor: las dudas llegan a la pantalla, bloquean «Aprobar» y se resuelven con el formulario', async () => {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    const pedir = async (metodo, ruta, datos, galleta) => {
      const r = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: { 'X-Oportia': '1', 'Content-Type': 'application/json', ...(galleta ? { Cookie: galleta } : { 'Tailscale-User-Login': 'junior@example.com' }) },
        body: datos === undefined ? undefined : JSON.stringify(datos),
      });
      return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: (r.headers.get('set-cookie') || '').split(';')[0] };
    };
    const admin = (await pedir('POST', '/api/primer-admin', { nombre: 'junior', clave: 'una clave bien larga' })).galleta;
    const creado = await pedir('POST', '/api/proyectos', { instrucciones: 'Vendo software a hoteles en Santigo, excepto los grandes' }, admin);
    assert.equal(creado.codigo, 201);
    const v1 = creado.datos.pendiente;
    assert.deepEqual(v1.dudas.map(d => `${d.clave}:${d.texto}:${d.sugerencias}`), ['lugar:Santigo:santiago']);
    assert.ok(v1.faltantes.includes('dudas'));
    const id = creado.datos.proyecto.id;
    const bloqueada = await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, {}, admin);
    assert.equal(bloqueada.codigo, 400);
    assert.equal(bloqueada.datos.error, 'faltan_datos');
    const campos = { ...camposDelFormulario(v1.configuracion, 'es'), zonas: 'Santiago', resueltas: [0] };
    const v2 = (await pedir('POST', `/api/proyectos/${id}/versiones`, { modo: 'campos', campos }, admin)).datos.pendiente;
    assert.deepEqual(v2.dudas, []);
    assert.deepEqual(v2.faltantes, []);
    assert.deepEqual(v2.configuracion.zonas, ['santiago']);
    assert.deepEqual(v2.configuracion.tamanos, ['pequenas', 'medianas'], 'lo demás no cambió');
    const aprobada = await pedir('POST', `/api/proyectos/${id}/versiones/2/aprobar`, {}, admin);
    assert.equal(aprobada.codigo, 200);
  });
  db.close();
});

// ---------- Decisiones del dueño: autonomía, IA y nombre sugerido ----------
test('autonomía: la más segura por defecto; «solo cuando yo lo pida» va con frecuencia manual; la IA queda apagada', () => {
  const normal = interpretar('Vendo paneles solares a hoteles en Santiago').configuracion;
  assert.equal(normal.autonomia, 'aprobar_salidas');
  assert.deepEqual(normal.ia, { permitida: false, topeMensualUsd: 0 });
  assert.equal(normal.costoEstimadoUsd, 0);
  for (const texto of ['Vendo paneles solares a hoteles en Santiago. Busca solo cuando yo lo pida', 'I sell software to hotels in Santiago. Only when I ask.']) {
    const c = interpretar(texto).configuracion;
    assert.deepEqual([c.autonomia, c.frecuencia], ['solo_cuando_pida', 'manual'], texto);
  }
  // Lo que llega de afuera no puede encender la IA ni poner otro costo: llega en la parte 1d, con su propia aprobación.
  const c = limpiarConfiguracion({ ...normal, ia: { permitida: true, topeMensualUsd: 50 }, costoEstimadoUsd: 9, autonomia: 'inventada' });
  assert.deepEqual(c.ia, { permitida: false, topeMensualUsd: 0 });
  assert.equal(c.costoEstimadoUsd, 0);
  assert.equal(c.autonomia, 'aprobar_salidas');
  assert.equal(limpiarConfiguracion({ ...normal, autonomia: 'solo_cuando_pida', frecuencia: 'diaria' }).frecuencia, 'manual');
  assert.equal(limpiarConfiguracion({ ...normal, autonomia: 'frecuencia_aprobada', frecuencia: 'manual' }).autonomia, 'frecuencia_aprobada');
  // Una configuración guardada antes de estos campos se lee con los valores seguros.
  const vieja = { ...normal };
  delete vieja.autonomia; delete vieja.ia; delete vieja.costoEstimadoUsd;
  assert.deepEqual(limpiarConfiguracion(vieja), limpiarConfiguracion(normal));
  assert.deepEqual(CATALOGO.autonomias, ['aprobar_salidas', 'frecuencia_aprobada', 'solo_cuando_pida']);
});

test('nombre sugerido: el producto y el primer sector o lugar', () => {
  const nombre = (texto, idioma = 'es') => nombreSugerido(interpretar(texto, { idioma }).configuracion, idioma);
  assert.equal(nombre('Vendo paneles solares a hoteles en Punta Cana'), 'Clientes para paneles solares · Hoteles');
  assert.equal(nombre('Busco trabajo de chofer en Santiago'), 'Empleo: chofer · Santiago');
  assert.match(nombre('Vendo software a negocios en Moca'), /^Clientes para software · Moca/);
  assert.equal(nombre('I sell solar panels to hotels in Santiago', 'en').startsWith('Customers for'), true);
  assert.equal(nombreSugerido({ tipo: 'comercial', producto: 'x'.repeat(200), sectores: ['hoteles'] }).length <= LIMITES.nombre, true);
  assert.equal(nombreSugerido({}), 'Proyecto nuevo');
  assert.equal(nombreSugerido(null), 'Proyecto nuevo');
});

test('nombre sugerido: va entero en un idioma y nunca termina en media palabra', () => {
  const config = (texto, idioma = 'es') => interpretar(texto, { idioma }).configuracion;
  const paneles = config('Vendo paneles solares a hoteles en Punta Cana');
  assert.equal(nombreSugerido(paneles, 'en', 'es'), 'Customers for solar panels · Hotels', 'del catálogo: se traduce');
  const piscinas = config('Vendo mantenimiento de piscinas a hoteles en Bávaro');
  assert.match(nombreSugerido(piscinas, 'en', 'es'), /^Clientes para mantenimiento de piscinas · Hoteles/, 'escrito por él: queda en su idioma');
  for (const [texto, idioma] of [['Vendo aire acondicionado a oficinas en Santiago', 'es'], ['I sell security cameras to banks and credit unions in Santiago', 'en'],
    ['I sell cleaning to offices in Santiago', 'en'], ['Vendo servicio de catering para bodas y eventos corporativos a salones de eventos en Santiago', 'es']]) {
    for (const lengua of ['es', 'en']) {
      const nombre = nombreSugerido(config(texto, idioma), lengua, idioma);
      assert.ok(nombre.length <= LIMITES.nombre, nombre);
      // Cada palabra del nombre está entera: es una palabra del texto o de las etiquetas del catálogo.
      const palabras = x => String(x).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const conocidas = new Set(palabras(`${texto} clientes para customers for ${JSON.stringify(catalogo())}`));
      for (const palabra of palabras(nombre)) assert.ok(conocidas.has(palabra), `«${palabra}» en «${nombre}»`);
    }
  }
  assert.equal(nombreSugerido(config('Vendo aire acondicionado a oficinas en Santiago')), 'Clientes para aire acondicionado · Oficinas');
});

// ---------- Pase visual (0.3.1): el creador con toques (public/creador.js) ----------
// Lo que la persona elige tocando se convierte en una frase que el motor tiene que entender EXACTAMENTE: los mismos
// negocios, lugares, tamaños, frecuencia, producto y salario, sin dudas, sin supuestos de más y sin adivinar nada.
const CREADOR = await import('../public/creador.js');
const nombreDelProducto = (clave, idioma) => CREADOR.PRODUCTOS_CON_OTRAS_PALABRAS[clave]?.[idioma] ?? PRODUCTOS.find(p => p.clave === clave)[idioma];
const mismos = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// Devuelve la lista de lo que el motor entendió distinto (vacía si entendió todo bien).
function comoLoEntiende(eleccion, idioma) {
  const texto = CREADOR.componer(eleccion, idioma);
  const x = CREADOR.normalizarEleccion(eleccion);
  const { configuracion: c, supuestos } = interpretar(texto, { idioma });
  const mal = [];
  if (texto.length > LIMITES.instrucciones) mal.push(`largo ${texto.length}`);
  if (c.tipo !== x.tipo) mal.push(`tipo ${c.tipo}`);
  if (x.tipo === 'comercial' && !mismos(c.sectores, x.sectores)) mal.push(`sectores ${c.sectores}`);
  if (c.sectoresLibres.length || c.zonasLibres.length) mal.push(`libres ${c.sectoresLibres} ${c.zonasLibres}`);
  if (!mismos(c.zonas, x.zonas) || c.paisCompleto !== x.pais) mal.push(`zonas ${c.zonas} ${c.paisCompleto}`);
  if (x.tipo === 'comercial' && !mismos(c.tamanos, x.tamanos.length === 3 ? [] : x.tamanos)) mal.push(`tamaños ${c.tamanos}`);
  if (c.frecuencia !== x.frecuencia) mal.push(`frecuencia ${c.frecuencia}`);
  if (comparable(c.producto) !== comparable(x.producto)) mal.push(`producto ${c.producto}`);
  if (x.tipo === 'laboral' && (c.salarioMinimo ?? null) !== x.salarioMinimo) mal.push(`salario ${c.salarioMinimo}`);
  if (c.salarioMaximo || c.exclusiones.length || c.sectoresExcluidos.length || c.zonasExcluidas.length || c.prioridades.length) mal.push('algo de más');
  if (dudas(c).length) mal.push(`dudas ${JSON.stringify(dudas(c))}`);
  if (faltantes(c).length) mal.push(`faltan ${faltantes(c)}`);
  // Solo se aceptan los avisos que no dependen de los toques (las capacidades de siempre y qué es el Gran Santo Domingo).
  const otros = supuestos.filter(s => !['capacidades', 'gran_santo_domingo'].includes(s));
  if (otros.length) mal.push(`supuestos ${otros}`);
  return mal.length ? `${idioma}: «${texto}» → ${mal.join(' | ')}` : null;
}

test('creador: ofrece todo lo que el motor conoce (negocios, provincias, regiones, tamaños, frecuencias y productos)', () => {
  const sectores = CATALOGO.sectores.map(s => s.clave).filter(s => s !== 'todas');
  assert.deepEqual([...CREADOR.SECTORES_CREADOR.map(s => s.clave)].sort(), [...sectores].sort());
  const provincias = CATALOGO.zonas.filter(z => z.tipo === 'provincia').map(z => z.clave);
  const regiones = CATALOGO.zonas.filter(z => z.tipo === 'region').map(z => z.clave);
  assert.deepEqual(CREADOR.ZONAS_CREADOR.map(z => z.clave).sort(), [...provincias, ...regiones].sort());
  assert.deepEqual(CREADOR.ORDEN_TAMANOS, CATALOGO.tamanos);
  assert.deepEqual(CREADOR.ORDEN_FRECUENCIAS, CATALOGO.frecuencias);
  for (const clave of CREADOR.PRODUCTOS_SUGERIDOS) assert.ok(PRODUCTOS.some(p => p.clave === clave), clave);
  assert.deepEqual([...CREADOR.PRODUCTOS_SUGERIDOS].sort(), PRODUCTOS.map(p => p.clave).sort(), 'cada producto del catálogo tiene su sugerencia');
});

test('creador: cada toque solo (cada negocio, lugar, producto, empleo, tamaño, frecuencia y salario) se entiende sin dudas, en español y en inglés', () => {
  const malos = [];
  const revisar = (e, idioma) => { const m = comoLoEntiende(e, idioma); if (m) malos.push(m); };
  for (const idioma of ['es', 'en']) {
    const base = { tipo: 'comercial', producto: nombreDelProducto('paneles-solares', idioma), sectores: ['hoteles'], zonas: ['santiago'], frecuencia: 'semanal' };
    for (const s of [...CREADOR.SECTORES_CREADOR.map(s => s.clave), 'todas']) revisar({ ...base, sectores: [s] }, idioma);
    for (const z of CREADOR.ZONAS_CREADOR) {
      revisar({ ...base, zonas: [z.clave] }, idioma);
      revisar({ tipo: 'laboral', producto: idioma === 'en' ? 'driver' : 'chofer', zonas: [z.clave], frecuencia: 'diaria', salarioMinimo: 25000 }, idioma);
    }
    revisar({ ...base, pais: true }, idioma);
    for (const clave of CREADOR.PRODUCTOS_SUGERIDOS) revisar({ ...base, producto: nombreDelProducto(clave, idioma) }, idioma);
    for (const puesto of CREADOR.PUESTOS_SUGERIDOS) revisar({ tipo: 'laboral', producto: puesto[idioma], pais: true, frecuencia: 'semanal' }, idioma);
    for (const n of CREADOR.SALARIOS_SUGERIDOS) revisar({ tipo: 'laboral', producto: idioma === 'en' ? 'cashier' : 'cajero', zonas: ['duarte'], salarioMinimo: n }, idioma);
    for (const f of CREADOR.ORDEN_FRECUENCIAS) {
      revisar({ ...base, frecuencia: f }, idioma);
      revisar({ tipo: 'laboral', producto: idioma === 'en' ? 'cook' : 'cocinero', zonas: ['la-romana'], frecuencia: f }, idioma);
    }
    const tamanos = [[], ['pequenas'], ['medianas'], ['grandes'], ['pequenas', 'medianas'], ['medianas', 'grandes'], ['pequenas', 'grandes'], ['pequenas', 'medianas', 'grandes']];
    for (const t of tamanos) for (const sectores of [['hoteles'], ['todas'], ['hoteles', 'clinicas', 'fabricas']]) revisar({ ...base, tamanos: t, sectores }, idioma);
  }
  assert.deepEqual(malos, []);
});

test('creador: miles de combinaciones de toques (hasta 12 negocios y 12 lugares) se entienden sin dudas y caben en 4000 letras', () => {
  const malos = [];
  let semilla = 20261105;
  const azar = n => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  const elegir = (lista, k) => { const s = new Set(); while (s.size < Math.min(k, lista.length)) s.add(lista[azar(lista.length)]); return [...s]; };
  const sectores = CREADOR.SECTORES_CREADOR.map(s => s.clave);
  const zonas = CREADOR.ZONAS_CREADOR.map(z => z.clave);
  for (const idioma of ['es', 'en']) {
    for (let i = 0; i < 1500; i++) {
      const laboral = azar(4) === 0;
      const e = {
        tipo: laboral ? 'laboral' : 'comercial',
        producto: laboral ? CREADOR.PUESTOS_SUGERIDOS[azar(CREADOR.PUESTOS_SUGERIDOS.length)][idioma] : nombreDelProducto(CREADOR.PRODUCTOS_SUGERIDOS[azar(CREADOR.PRODUCTOS_SUGERIDOS.length)], idioma),
        sectores: azar(10) === 0 ? ['todas'] : elegir(sectores, 1 + azar(CREADOR.MAXIMO_ELEGIDOS)),
        pais: azar(6) === 0,
        zonas: elegir(zonas, 1 + azar(CREADOR.MAXIMO_ELEGIDOS)),
        tamanos: elegir(CREADOR.ORDEN_TAMANOS, azar(4)),
        frecuencia: CREADOR.ORDEN_FRECUENCIAS[azar(4)],
        salarioMinimo: laboral && azar(2) ? CREADOR.SALARIOS_SUGERIDOS[azar(CREADOR.SALARIOS_SUGERIDOS.length)] : null,
      };
      const m = comoLoEntiende(e, idioma);
      if (m) malos.push(m);
    }
    // Lo más largo que se puede armar: 12 negocios, 12 lugares, el producto más largo permitido.
    const largo = CREADOR.componer({ tipo: 'comercial', producto: 'x'.repeat(500), sectores: sectores.slice(-12), zonas: zonas.slice(-12), tamanos: ['pequenas'] }, idioma);
    assert.ok(largo.length < LIMITES.instrucciones, `${largo.length} letras`);
  }
  assert.deepEqual(malos.slice(0, 10), []);
});

test('creador: lo que falta se dice antes de crear, y la vista previa nunca se manda con huecos', () => {
  assert.deepEqual(CREADOR.faltaEnEleccion({}), ['producto', 'sectores', 'zonas']);
  assert.deepEqual(CREADOR.faltaEnEleccion({ tipo: 'laboral', producto: 'chofer' }), ['zonas']);
  assert.deepEqual(CREADOR.faltaEnEleccion({ producto: '  .  ', sectores: ['hoteles'], pais: true }), ['producto'], 'un producto de solo signos no cuenta');
  assert.deepEqual(CREADOR.faltaEnEleccion({ producto: 'agua', sectores: ['todas'], zonas: ['santiago'] }), []);
  for (const f of CREADOR.faltaEnEleccion({})) assert.ok(CREADOR.CLAVES_FALTA.includes(f));
  assert.equal(CREADOR.componer({}, 'es', { huecos: true }), 'Quiero vender … a … en …. Revisa cada semana.');
  assert.doesNotMatch(CREADOR.componer({ producto: 'agua', sectores: ['hoteles'], zonas: ['azua'] }, 'es'), /…/);
  // «Todo el país» quita los lugares; «Todo tipo de empresas» quita los negocios; nada inventado pasa.
  const x = CREADOR.normalizarEleccion({ producto: '«Agua.»', sectores: ['hoteles', 'todas', 'inventado'], pais: true, zonas: ['santiago'], tamanos: ['enormes', 'grandes'], frecuencia: 'cada hora', salarioMinimo: 5 });
  assert.deepEqual(x, { tipo: 'comercial', producto: 'Agua', sectores: ['todas'], pais: true, zonas: [], tamanos: ['grandes'], frecuencia: 'semanal', salarioMinimo: null });
});

test('creador: «Cambiar tocando» marca lo que está en uso, y avisa de lo que no cabe en los toques', () => {
  const porDefecto = COMBINACIONES.investigar_y_preparar;
  for (const [e, idioma] of [
    [{ tipo: 'comercial', producto: 'paneles solares', sectores: ['hoteles', 'clinicas'], zonas: ['santiago', 'cibao'], tamanos: ['medianas'], frecuencia: 'mensual' }, 'es'],
    [{ tipo: 'comercial', producto: 'software', sectores: ['todas'], pais: true, tamanos: [], frecuencia: 'manual' }, 'en'],
    [{ tipo: 'laboral', producto: 'chofer', zonas: ['duarte'], frecuencia: 'diaria', salarioMinimo: 30000 }, 'es'],
  ]) {
    const { configuracion } = interpretar(CREADOR.componer(e, idioma), { idioma });
    const { eleccion, quedaFuera } = CREADOR.eleccionDesde(configuracion, configuracion.producto, porDefecto);
    assert.deepEqual(eleccion, CREADOR.normalizarEleccion(e), JSON.stringify(e));
    assert.deepEqual(quedaFuera, []);
  }
  const { configuracion: c } = interpretar('Vendo paneles solares a hoteles y a «Casa Pepe» en Santiago y en Naco, pero no en Moca. Prioriza los que tengan planta eléctrica.');
  const { quedaFuera } = CREADOR.eleccionDesde({ ...c, capacidades: capacidadesDesdeLista(['investigar']) }, c.producto, porDefecto);
  for (const x of ['zonas', 'exclusiones', 'prioridades', 'capacidades']) assert.ok(quedaFuera.includes(x), `${x}: ${quedaFuera}`);
  for (const x of quedaFuera) assert.ok(CREADOR.CLAVES_QUEDA_FUERA.includes(x), x);
  assert.equal(new Set(quedaFuera).size, quedaFuera.length, 'sin repetidos');
  // Un objetivo escrito a mano, o «aprobar lo que sale» con «solo cuando yo lo pida», tampoco caben: se avisa.
  const { configuracion: m } = interpretar(CREADOR.componer({ producto: 'agua', sectores: ['hoteles'], zonas: ['azua'], frecuencia: 'manual' }, 'es'));
  assert.deepEqual(CREADOR.eleccionDesde({ ...m, autonomia: 'aprobar_salidas' }, m.producto, porDefecto).quedaFuera, ['autonomia']);
  assert.deepEqual(CREADOR.eleccionDesde(m, m.producto, porDefecto, { objetivoPropio: true }).quedaFuera, ['objetivo']);
});

test('por el servidor: un proyecto hecho solo con toques se crea, no tiene dudas y se aprueba', async () => {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    const pedir = async (metodo, ruta, datos, galleta) => {
      const r = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: { 'X-Oportia': '1', 'Content-Type': 'application/json', ...(galleta ? { Cookie: galleta } : { 'Tailscale-User-Login': 'junior@example.com' }) },
        body: datos === undefined ? undefined : JSON.stringify(datos),
      });
      return { codigo: r.status, datos: await r.json().catch(() => ({})), galleta: (r.headers.get('set-cookie') || '').split(';')[0] };
    };
    const admin = (await pedir('POST', '/api/primer-admin', { nombre: 'junior', clave: 'una clave bien larga' })).galleta;
    const texto = CREADOR.componer({ producto: 'paneles solares', sectores: ['hoteles', 'clinicas'], zonas: ['santiago', 'la-vega'], tamanos: ['medianas', 'grandes'], frecuencia: 'mensual' }, 'es');
    const creado = await pedir('POST', '/api/proyectos', { instrucciones: texto }, admin);
    assert.equal(creado.codigo, 201);
    const v1 = creado.datos.pendiente;
    assert.deepEqual([v1.dudas, v1.faltantes], [[], []]);
    assert.equal(v1.instrucciones, texto, 'se guarda la frase tal cual: se ve en las versiones');
    assert.deepEqual([v1.configuracion.sectores, v1.configuracion.zonas, v1.configuracion.tamanos, v1.configuracion.frecuencia],
      [['hoteles', 'clinicas'], ['santiago', 'la-vega'], ['medianas', 'grandes'], 'mensual']);
    const id = creado.datos.proyecto.id;
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, {}, admin)).codigo, 200);
    // «Cambiar tocando» crea una versión nueva por el camino de siempre (modo «instrucciones»), que espera aprobación.
    const cambio = CREADOR.componer({ producto: 'paneles solares', sectores: ['hoteles', 'clinicas', 'farmacias'], zonas: ['santiago'], frecuencia: 'semanal' }, 'es');
    const v2 = (await pedir('POST', `/api/proyectos/${id}/versiones`, { modo: 'instrucciones', instrucciones: cambio }, admin)).datos.pendiente;
    assert.deepEqual([v2.numero, v2.dudas, v2.faltantes, v2.configuracion.sectores], [2, [], [], ['hoteles', 'clinicas', 'farmacias']]);
  });
  db.close();
});
