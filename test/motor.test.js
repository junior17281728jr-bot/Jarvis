// Pruebas del motor propio (fase 1, parte b): entiende las instrucciones sin IA y no adivina lo que falta.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretar, faltantes, configuracionDesdeCampos, limpiarConfiguracion, catalogo, nombreSugerido } from '../src/motor/interpretar.js';
import { normalizar, comparable, buscarFrases } from '../src/motor/texto.js';
import { SECTORES, PRODUCTOS, PROVINCIAS, CIUDADES, REGIONES, CAPACIDADES, COMBINACIONES } from '../src/motor/diccionarios.js';

test('normalizar quita acentos y mayúsculas sin cambiar la longitud del texto', () => {
  const original = 'Clínicas en SAN CRISTÓBAL, Higüey y Monseñor Nouel: RD$25,000 😀';
  const norm = normalizar(original);
  assert.equal(norm.length, original.length);
  assert.match(norm, /clinicas en san cristobal  higuey y monsenor nouel. rd\$25,000/);
  assert.equal(comparable('  Ñame   y  Café. '), 'name y cafe');
});

test('buscarFrases encuentra palabras enteras, en plural, y la frase más larga gana', () => {
  const entradas = [{ frase: 'clinica', dato: 'clinica' }, { frase: 'clinica dental', dato: 'dental' }, { frase: 'bar', dato: 'bar' }];
  const hallados = buscarFrases(normalizar('Clínicas dentales, clínicas y barberías'), entradas).map(h => h.dato);
  assert.deepEqual(hallados, ['dental', 'clinica'], '«barberías» no es «bar»');
});

test('ejemplo comercial del documento: paneles solares', () => {
  const { configuracion: c, supuestos } = interpretar('Tengo una empresa que vende paneles solares. Quiero encontrar hoteles, clínicas, fábricas y negocios grandes en República Dominicana que puedan necesitar mis servicios. Prioriza empresas que tengan un consumo eléctrico importante.');
  assert.equal(c.tipo, 'comercial');
  assert.equal(c.producto, 'paneles solares');
  assert.deepEqual(c.productos, ['paneles-solares']);
  assert.deepEqual(c.sectores, ['hoteles', 'clinicas', 'fabricas']);
  assert.equal(c.paisCompleto, true);
  assert.deepEqual(c.tamanos, ['grandes']);
  assert.deepEqual(c.prioridades, ['empresas que tengan un consumo eléctrico importante']);
  assert.equal(c.frecuencia, 'semanal');
  assert.ok(supuestos.includes('frecuencia'), 'la frecuencia no la dijo: se avisa que se supuso');
  assert.deepEqual(faltantes(c), []);
});

test('ejemplo laboral del documento: chofer en Santiago', () => {
  const { configuracion: c } = interpretar('Busco trabajo de chofer en Santiago. Quiero un salario superior a RD$25,000, preferiblemente sin experiencia obligatoria.');
  assert.equal(c.tipo, 'laboral');
  assert.equal(c.producto, 'chofer');
  assert.deepEqual(c.zonas, ['santiago']);
  assert.equal(c.salarioMinimo, 25000);
  assert.equal(c.salarioMaximo, null);
  assert.equal(c.moneda, 'DOP');
  assert.equal(c.experiencia, 'no_requerida');
  assert.deepEqual(c.prioridades, [], '«sin experiencia» no se repite como prioridad');
  assert.deepEqual(c.tamanos, []);
  assert.deepEqual(faltantes(c), []);
});

test('restaurantes en Santo Domingo con inventario; «Santo Domingo» se entiende como el Gran Santo Domingo y se avisa', () => {
  const { configuracion: c, supuestos } = interpretar('Quiero crear un proyecto para encontrar restaurantes en Santo Domingo que necesiten sistemas de inventario');
  assert.deepEqual(c.sectores, ['restaurantes']);
  assert.deepEqual(c.zonas, ['gran-santo-domingo']);
  assert.deepEqual(c.productos, ['inventario']);
  assert.ok(supuestos.includes('gran_santo_domingo'));
});

test('exclusiones, ciudades, «sin página web» como rasgo y capacidades pedidas', () => {
  const { configuracion: c, supuestos } = interpretar('Vendo páginas web a restaurantes sin página web en Punta Cana, excepto colmados y farmacias. Prepara propuestas y correos y contáctalos por Gmail. Revisa cada día.');
  assert.deepEqual(c.sectores, ['restaurantes']);
  assert.deepEqual(c.sectoresExcluidos, ['colmados', 'farmacias']);
  assert.deepEqual(c.zonas, ['punta-cana']);
  assert.deepEqual(c.prioridades, ['sin página web']);
  assert.equal(c.frecuencia, 'diaria');
  assert.equal(c.capacidades.propuestas, true);
  assert.equal(c.capacidades.correos, true);
  assert.equal(c.capacidades.contactar, true);
  assert.ok(!supuestos.includes('capacidades'));
});

test('salario entre dos cifras, con «mil»', () => {
  const { configuracion: c } = interpretar('Empleos administrativos en Santo Domingo con salario entre 30 mil y 45 mil pesos');
  assert.equal(c.tipo, 'laboral');
  assert.equal(c.producto, 'administrativos');
  assert.equal(c.salarioMinimo, 30000);
  assert.equal(c.salarioMaximo, 45000);
});

test('números que no son dinero no se toman como salario', () => {
  const { configuracion: c } = interpretar('Busco empleo de cocinero en Bávaro con al menos 2 años de experiencia');
  assert.equal(c.salarioMinimo, null);
  assert.deepEqual(c.zonas, ['punta-cana']);
  assert.equal(c.producto, 'cocinero');
});

test('lo que no entiende lo pregunta en vez de adivinarlo', () => {
  const { configuracion: c, supuestos } = interpretar('Busco clientes para mi negocio de uniformes');
  assert.deepEqual(c.sectores, ['todas']);
  assert.ok(supuestos.includes('sectores_todos'));
  assert.deepEqual(faltantes(c), ['zonas'], 'no dijo dónde: lo pregunta');
  const vacio = interpretar('hola, quiero algo bueno').configuracion;
  assert.deepEqual(faltantes(vacio), ['producto', 'sectores', 'zonas']);
});

test('instrucciones en inglés también se entienden', () => {
  const { configuracion: c } = interpretar('I sell solar panels to hotels and factories in Santo Domingo and Santiago, every month', { idioma: 'en' });
  assert.equal(c.producto, 'solar panels');
  assert.deepEqual(c.sectores, ['hoteles', 'fabricas']);
  assert.deepEqual(c.zonas, ['gran-santo-domingo', 'santiago']);
  assert.equal(c.frecuencia, 'mensual');
  assert.match(c.objetivo, /^Find customers/);
  assert.equal(nombreSugerido(c, 'en'), 'Customers for solar panels');
});

test('R.D. y «todo el país» significan el país completo; RD$ no', () => {
  assert.equal(interpretar('Vendo software a hoteles en R.D.').configuracion.paisCompleto, true);
  assert.equal(interpretar('Vendo software a hoteles en todo el país').configuracion.paisCompleto, true);
  assert.equal(interpretar('Vendo software a hoteles que paguen RD$5,000').configuracion.paisCompleto, false);
});

test('los campos cambiados a mano se ordenan: lo conocido se reconoce y lo demás queda como texto', () => {
  const base = interpretar('Vendo software a hoteles en Santiago').configuracion;
  const c = configuracionDesdeCampos({
    tipo: 'comercial',
    producto: 'Sistemas de reservas',
    sectores: 'Hoteles, Restaurantes, bares y cafés, barberías, tiendas de surf',
    zonas: 'La Romana; Bávaro\nPueblo Inventado',
    exclusiones: 'colmados, Santiago, los que ya son clientes',
    prioridades: 'que tengan web, redes y correo\ncon más de 20 habitaciones',
    tamanos: ['medianas', 'gigantes'],
    frecuencia: 'diaria',
    capacidades: { investigar: true, contactar: true, inventada: true },
  }, base);
  assert.deepEqual(c.productos, ['reservas']);
  assert.deepEqual(c.sectores, ['hoteles', 'restaurantes', 'belleza', 'tiendas']);
  assert.deepEqual(c.zonas, ['la-romana', 'punta-cana']);
  assert.deepEqual(c.zonasLibres, ['Pueblo Inventado']);
  assert.deepEqual(c.sectoresExcluidos, ['colmados']);
  assert.deepEqual(c.zonasExcluidas, ['santiago']);
  assert.deepEqual(c.exclusiones, ['los que ya son clientes']);
  assert.deepEqual(c.prioridades, ['que tengan web, redes y correo', 'con más de 20 habitaciones'], 'una prioridad por línea');
  assert.deepEqual(c.tamanos, ['medianas'], 'un tamaño que no existe se ignora');
  assert.equal(c.capacidades.correos, true, 'contactar necesita preparar correos');
  assert.ok(!('inventada' in c.capacidades));
});

test('la configuración guardada siempre tiene la misma forma y respeta los límites', () => {
  const c = limpiarConfiguracion({ tipo: 'raro', producto: 'x'.repeat(1000), sectores: ['hoteles', 'no-existe', 'hoteles'], prioridades: Array(100).fill('a').map((a, i) => `${a}${i}`), salarioMinimo: 25000, capacidades: { investigar: 'si' } });
  assert.equal(c.tipo, 'comercial');
  assert.equal(c.producto.length, 120);
  assert.deepEqual(c.sectores, ['hoteles']);
  assert.equal(c.prioridades.length, 30);
  assert.equal(c.salarioMinimo, null, 'el salario solo existe en proyectos de empleo');
  assert.equal(c.capacidades.investigar, false, 'solo true cuenta como encendido');
  assert.deepEqual(Object.keys(c).sort(), Object.keys(limpiarConfiguracion({})).sort());
});

test('los diccionarios están completos y bien escritos', () => {
  assert.equal(PROVINCIAS.length, 32, 'las 31 provincias y el Distrito Nacional');
  const claves = [...SECTORES, ...PRODUCTOS, ...PROVINCIAS, ...CIUDADES, ...REGIONES].map(x => `${x.provincia ? 'z' : ''}${x.clave}`);
  for (const grupo of [SECTORES, PRODUCTOS, [...PROVINCIAS, ...CIUDADES, ...REGIONES]]) {
    const lista = grupo.map(x => x.clave);
    assert.equal(new Set(lista).size, lista.length, 'claves repetidas');
  }
  assert.ok(claves.length > 100);
  for (const x of [...SECTORES, ...PRODUCTOS, ...PROVINCIAS, ...CIUDADES, ...REGIONES, ...CAPACIDADES]) {
    for (const p of x.palabras) assert.equal(comparable(p), p, `«${p}» debe ir en minúsculas y sin acentos`);
  }
  const provincias = new Set(PROVINCIAS.map(p => p.clave));
  for (const c of CIUDADES) assert.ok(provincias.has(c.provincia), `${c.clave} apunta a una provincia que no existe`);
  for (const r of REGIONES) for (const p of r.provincias) assert.ok(provincias.has(p));
  assert.equal(CAPACIDADES.length, 7, 'las 7 capacidades de cada proyecto');
  for (const lista of Object.values(COMBINACIONES)) for (const c of lista) assert.ok(CAPACIDADES.some(x => x.clave === c));
  const cat = catalogo();
  assert.equal(cat.zonas.length, PROVINCIAS.length + CIUDADES.length + REGIONES.length);
});

test('textos muy largos o raros no rompen el motor', () => {
  for (const texto of ['', '   ', '$$$ ,,, ...', 'á'.repeat(10000), '😀'.repeat(3000), 'excepto sin menos salvo', '25,000,000,000 pesos de salario', 'null', 'R.D.R.D.R.D.']) {
    const { configuracion } = interpretar(texto);
    assert.deepEqual(Object.keys(configuracion).sort(), Object.keys(limpiarConfiguracion({})).sort());
  }
});
