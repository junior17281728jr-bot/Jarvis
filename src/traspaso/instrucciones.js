// Academia 0.14.83: «Copiar instrucciones para Claude» (Administrador → Avanzado → «Traspaso»). Un solo bloque de
// Markdown que otra sesión de Claude puede seguir para tomar el proyecto.
//  - Lo de este archivo NO es secreto (va en el repositorio, que es público): qué es el proyecto, cómo está hecho, cómo
//    se prueba y se publica, y las reglas de la casa.
//  - Lo secreto (los enlaces de Drive, cómo entrar al servidor, las notas, lo que falta y los campos propios) llega solo
//    de la bóveda ya abierta con la contraseña del dueño (src/traspaso/boveda.js): markdownTraspaso lo recibe como
//    `contenido` y nunca lo busca por su cuenta.

export const FORMATO_TRASPASO = 'traspaso/1';

export const QUE_ES = 'Academia de Aviación (sobre OPORTIA): una app para estudiar para la licencia de piloto privado (PPL), tipo Duolingo. Tiene clases por materia, práctica y examen con las preguntas del Test Guide, el oral, un instructor (con IA opcional), la Competencia, certificados y un panel de administrador. El dueño es Junior: no es programador.';

export const STACK = Object.freeze([
  'Node.js 22 (>= 22.13), JavaScript con módulos ES. Cero dependencias de npm: solo módulos de Node (node:http, node:sqlite, node:crypto…).',
  'Base de datos: SQLite (node:sqlite) en la carpeta de datos del servidor. Los cambios de base son migraciones en src/nucleo/migraciones.js.',
  'Servidor web: src/server.js y src/app.js; las rutas de la API en src/api/. Un proceso aparte, el trabajador (src/tareas/), hace los trabajos largos (IA, copias).',
  'Pantallas: public/ (HTML, CSS y JavaScript sin librerías ni compilación). Textos en public/i18n/es.json y public/i18n/en.json.',
  'Pruebas: node --test, en test/*.test.js (sin internet, sin datos reales).',
]);

export const PRUEBAS = [
  'Corre TODAS las pruebas igual que el servidor (una copia limpia del commit, sin variables de entorno, con tope de tiempo):',
  '',
  '```sh',
  'T=$(mktemp -d); mkdir -p $T/src $T/t',
  'git archive HEAD | tar -x -C $T/src',
  'cd $T/src',
  'env -i PATH=/usr/bin:/bin:$(dirname "$(command -v node)") HOME=$T TMPDIR=$T/t timeout 1500 node --no-warnings --test test/*.test.js',
  'cd - && rm -rf $T',
  '```',
  '',
  'Todas tienen que pasar. Haz commit antes (git archive usa el commit, no los archivos sin guardar).',
].join('\n');

export const PUBLICAR = Object.freeze([
  'En el servidor, un actualizador (cron, cada 30 minutos) mira la rama main del repositorio de GitHub.',
  'Si hay un commit nuevo, lo baja a una carpeta temporal y corre todas las pruebas con un tope de 900 segundos (nice -n 10 timeout 900 node --no-warnings --test test/*.test.js).',
  'Solo si TODAS pasan, copia src/, public/ y deploy/ al servidor y lo reinicia. Si una prueba falla, esa versión queda marcada como mala y no se instala; si no arranca, vuelve sola a la anterior.',
  'Publicar = subir a main. Cada cambio sube la versión de package.json.',
]);

// Las reglas de la casa (no son secretas: son cómo se trabaja en este proyecto).
export const REGLAS_DE_LA_CASA = Object.freeze([
  'Nunca innerHTML (ni eval, ni scripts incrustados): todo texto con textContent. Nunca estilos en línea (style=): todo en los .css.',
  'Nunca pases «cond ? x : null» directo a append/replaceChildren: arma la lista y usa .filter(Boolean).',
  'Cada texto de pantalla en los dos idiomas: public/i18n/es.json y public/i18n/en.json, con las mismas claves y sin repetidas.',
  'Las migraciones solo agregan (nunca DROP ni RENAME; un NOT NULL nuevo siempre con DEFAULT) y una migración ya publicada nunca se edita.',
  'Nunca borres datos ni archivos de datos: se marca, se archiva o se aparta con otro nombre.',
  'El repositorio es PÚBLICO: nunca subas contenido de los libros, paquetes de contenido, enlaces de Drive, claves, tokens, contraseñas ni correos.',
  'Las preguntas del Test Guide van tal cual (verbatim), sin cambiarles ni una palabra.',
  'Háblale al dueño en español sencillo, sin palabras técnicas, y con pasos cortos.',
  'Pregunta antes de usar o encender cualquier servicio que cueste dinero (IA, servidores, APIs de pago).',
  'Cero dependencias de npm. Las pruebas son deterministas (sin internet, sin fechas de hoy ni azar sin semilla).',
]);

const NOMBRES = Object.freeze({
  driveContenido: 'Carpeta de Drive del contenido',
  driveFuentes: 'Carpeta de Drive de fuentes',
  repo: 'Repositorio de GitHub',
  servidor: 'Cómo entrar al servidor',
  notas: 'Notas para Claude',
  pendientes: 'Lo que falta (pendientes)',
});

const lista = xs => xs.map(x => `- ${x}`).join('\n');
const nada = '_(vacío)_';
// Un texto libre dentro de un bloque: si trae ``` se usa una cerca más larga.
function bloque(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return nada;
  let cerca = '```';
  while (t.includes(cerca)) cerca += '`';
  return `${cerca}text\n${t}\n${cerca}`;
}
const linea = texto => (String(texto ?? '').trim() ? String(texto).trim() : nada);

// info: lo que no es secreto ({ version, repo, origen, migracion, alumnos, cursos, disco, memoria }).
// contenido: la bóveda ABIERTA ({ driveContenido, …, propios }) o null (entonces no sale nada de ella).
export function markdownTraspaso(info = {}, contenido = null) {
  const c = contenido ?? null;
  const repo = (c?.repo || '').trim() || info.repo || '';
  const partes = [
    `# Traspaso del proyecto: Academia de Aviación`,
    '',
    `<!-- ${FORMATO_TRASPASO} -->`,
    '',
    'Hola, Claude. Vas a tomar este proyecto. Lee todo antes de tocar nada.',
    '',
    '## Qué es',
    '',
    QUE_ES,
    '',
    '## Cómo está ahora',
    '',
    lista([
      `Versión de la app: ${info.version ?? '—'}`,
      `Repositorio: ${repo || '—'}`,
      `Dirección de la app (producción): ${info.origen || '—'}`,
      `Última migración de la base: ${info.migracion ?? '—'}`,
      `Alumnos: ${info.alumnos ?? '—'} · Cursos: ${info.cursos ?? '—'}`,
      `Disco libre: ${info.disco?.libreMb != null ? `${info.disco.libreMb} MB` : '—'} · Memoria libre: ${info.memoria?.libreMb != null ? `${info.memoria.libreMb} MB` : '—'}${info.memoria?.totalMb != null ? ` de ${info.memoria.totalMb} MB` : ''}`,
    ]),
    '',
    '## Cómo está hecho',
    '',
    lista(STACK),
    '',
    '## Cómo probar (igual que en producción)',
    '',
    PRUEBAS,
    '',
    '## Cómo se publica',
    '',
    lista(PUBLICAR),
    '',
    '## Reglas de la casa',
    '',
    lista(REGLAS_DE_LA_CASA),
    '',
  ];
  if (!c) {
    partes.push('## Dónde está el contenido', '', '_(Cerrado: abre «Traspaso» con la contraseña para ver los enlaces.)_', '');
    return partes.join('\n');
  }
  partes.push(
    '## Dónde está el contenido',
    '',
    'El contenido (libros, paquetes, Test Guide) vive en Google Drive y en el servidor, nunca en el repositorio. No copies estos enlaces a ningún archivo del repositorio.',
    '',
    lista([`${NOMBRES.driveContenido}: ${linea(c.driveContenido)}`, `${NOMBRES.driveFuentes}: ${linea(c.driveFuentes)}`, `${NOMBRES.repo}: ${linea(repo)}`]),
    '',
    `## ${NOMBRES.servidor}`,
    '',
    bloque(c.servidor),
    '',
    `## ${NOMBRES.notas}`,
    '',
    bloque(c.notas),
    '',
    `## ${NOMBRES.pendientes}`,
    '',
    bloque(c.pendientes),
    '',
  );
  if (c.propios?.length) {
    partes.push('## Otros datos', '');
    for (const p of c.propios) partes.push(`### ${String(p.nombre).replace(/[\r\n#]+/g, ' ').trim()}`, '', bloque(p.valor), '');
  }
  partes.push('---', '', 'Esto es privado: no lo pegues en el repositorio, en un issue ni en un commit.', '');
  return partes.join('\n');
}
