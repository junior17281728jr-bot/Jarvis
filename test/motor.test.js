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
import { CASOS_REVISION, CASOS_VARIADOS, CASOS_EQUIPO_ROJO, CASOS_EQUIPO_ROJO_2 } from './motor-casos.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const CATALOGO = catalogo();
const TODOS = [...CASOS_REVISION, ...CASOS_VARIADOS, ...CASOS_EQUIPO_ROJO, ...CASOS_EQUIPO_ROJO_2];

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
