// Un GitHub FALSO para las pruebas de «Claude mejora la app» (no es un archivo *.test.js). En 127.0.0.1 (puerto al azar):
// un repositorio en memoria (commits, árboles, la rama main y las demás), la API de datos de Git que usa
// src/canales/github.js y la descarga .tar.gz (codeload). Nunca usa internet ni un token de verdad.
//   const gh = await crearGithubFalso({ archivos: { 'package.json': '{}', … } });
//   config.canalesBases = { github: gh.base, github_descarga: gh.base }
//   gh.main() · gh.archivosDe(sha) · gh.moverMain({ 'public/x.js': '…' }) · gh.peticiones · gh.cerrar()
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const sha = texto => createHash('sha1').update(String(texto)).digest('hex');
const leer = req => new Promise(listo => { const p = []; req.on('data', x => p.push(x)); req.on('end', () => listo(Buffer.concat(p).toString('utf8'))); });

// Un .tar.gz como el de GitHub: una carpeta repo-<sha>/ con los archivos (ustar; nombres largos con «prefix»).
export function armarTgz(archivos, raiz = 'repo', { extra = [] } = {}) {
  const bloques = [];
  const cabecera = (nombre, tam, tipo = '0', enlace = '') => {
    const h = Buffer.alloc(512);
    let n = nombre;
    let prefijo = '';
    if (Buffer.byteLength(n) > 100) { const i = n.lastIndexOf('/', 154); prefijo = n.slice(0, i); n = n.slice(i + 1); }
    h.write(n, 0, 100, 'utf8');
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(`${tam.toString(8).padStart(11, '0')}\0`, 124);
    h.write(`${Math.floor(Date.parse('2026-11-10T00:00:00Z') / 1000).toString(8).padStart(11, '0')}\0`, 136);
    h.write('        ', 148);
    h.write(tipo, 156);
    if (enlace) h.write(enlace, 157, 100);
    h.write('ustar\0', 257); h.write('00', 263);
    if (prefijo) h.write(prefijo, 345, 155);
    let suma = 0;
    for (const b of h) suma += b;
    h.write(`${suma.toString(8).padStart(6, '0')}\0 `, 148);
    return h;
  };
  bloques.push(cabecera(`${raiz}/`, 0, '5'));
  for (const [nombre, contenido] of [...Object.entries(archivos), ...extra.map(x => [x.nombre, x.contenido ?? ''])]) {
    const tipo = extra.find(x => x.nombre === nombre)?.tipo ?? '0';
    const datos = Buffer.from(contenido);
    const nombreCompleto = nombre.startsWith('/') || nombre.startsWith('../') ? nombre : `${raiz}/${nombre}`;
    bloques.push(cabecera(nombreCompleto, tipo === '0' ? datos.length : 0, tipo, tipo === '2' ? '/etc/passwd' : ''));
    if (tipo === '0') { bloques.push(datos); bloques.push(Buffer.alloc((512 - (datos.length % 512)) % 512)); }
  }
  bloques.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(bloques));
}

export async function crearGithubFalso({ archivos, repo = 'dueno/app', token = null } = {}) {
  const arboles = new Map();
  const commits = new Map();
  const ramas = new Map();
  const peticiones = [];
  const guardarArbol = mapa => { const id = sha(`arbol|${JSON.stringify(Object.entries(mapa).sort())}`); arboles.set(id, { ...mapa }); return id; };
  const guardarCommit = (arbol, padres, mensaje) => { const id = sha(`commit|${arbol}|${padres.join(',')}|${mensaje}|${commits.size}`); commits.set(id, { arbol, padres, mensaje }); return id; };
  ramas.set('main', guardarCommit(guardarArbol(archivos), [], 'primero'));
  const pref = `/repos/${repo}`;
  let escena = null;

  const servidor = createServer(async (req, res) => {
    const cuerpoTexto = await leer(req);
    const cuerpo = cuerpoTexto ? JSON.parse(cuerpoTexto) : null;
    peticiones.push({ metodo: req.method, ruta: req.url, cabeceras: { ...req.headers }, cuerpo: cuerpoTexto });
    const json = (status, v) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
    const conToken = req.headers.authorization === `Bearer ${token}`;
    const u = req.url;
    if (req.method === 'GET' && u.startsWith(`/${repo}/tar.gz/`)) {
      const c = commits.get(u.split('/').at(-1));
      if (!c) return json(404, {});
      res.writeHead(200, { 'content-type': 'application/x-gzip' });
      return res.end(armarTgz(arboles.get(c.arbol), `app-${u.split('/').at(-1)}`));
    }
    if (!u.startsWith(pref)) return json(404, { message: 'Not Found' });
    const r = u.slice(pref.length);
    if (req.headers.authorization && !conToken) return json(401, { message: 'Bad credentials' });
    if (req.method === 'GET' && r === '') return conToken ? json(200, { full_name: repo }) : json(404, {});
    if (req.method === 'GET' && r === '/git/ref/heads/main') return json(200, { ref: 'refs/heads/main', object: { sha: ramas.get('main'), type: 'commit' } });
    if (req.method === 'GET' && r.startsWith('/git/commits/')) {
      const id = r.split('/').at(-1);
      const c = commits.get(id);
      return c ? json(200, { sha: id, tree: { sha: c.arbol }, parents: c.padres.map(p => ({ sha: p })), message: c.mensaje }) : json(404, {});
    }
    if (!conToken) return json(401, { message: 'Requires authentication' });
    if (escena === 'sin_permiso') return json(403, { message: 'Resource not accessible by personal access token' });
    if (req.method === 'POST' && r === '/git/trees') {
      const base = arboles.get(cuerpo.base_tree);
      if (!base) return json(422, {});
      const nuevo = { ...base };
      for (const x of cuerpo.tree) nuevo[x.path] = x.content;
      return json(201, { sha: guardarArbol(nuevo) });
    }
    if (req.method === 'POST' && r === '/git/commits') {
      if (!arboles.has(cuerpo.tree) || !cuerpo.parents.every(p => commits.has(p))) return json(422, {});
      return json(201, { sha: guardarCommit(cuerpo.tree, cuerpo.parents, cuerpo.message) });
    }
    if (req.method === 'POST' && r === '/git/refs') {
      const nombre = cuerpo.ref.replace('refs/heads/', '');
      if (ramas.has(nombre)) return json(422, { message: 'Reference already exists' });
      ramas.set(nombre, cuerpo.sha);
      return json(201, { ref: cuerpo.ref, object: { sha: cuerpo.sha } });
    }
    if (req.method === 'PATCH' && r === '/git/refs/heads/main') {
      const c = commits.get(cuerpo.sha);
      if (!c) return json(422, {});
      // Solo hacia adelante: el commit nuevo tiene que venir de main tal como está (force: false).
      if (cuerpo.force !== false || !c.padres.includes(ramas.get('main'))) return json(422, { message: 'Update is not a fast forward' });
      ramas.set('main', cuerpo.sha);
      return json(200, { object: { sha: cuerpo.sha } });
    }
    return json(404, {});
  });
  await new Promise(listo => servidor.listen(0, '127.0.0.1', listo));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return {
    base, repo, peticiones, ramas,
    main: () => ramas.get('main'),
    commit: id => commits.get(id),
    archivosDe: id => arboles.get(commits.get(id)?.arbol) ?? null,
    // Otro cambio llega a main (de otra persona).
    moverMain(cambios) { const actual = arboles.get(commits.get(ramas.get('main')).arbol); ramas.set('main', guardarCommit(guardarArbol({ ...actual, ...cambios }), [ramas.get('main')], 'otro cambio')); return ramas.get('main'); },
    escena(x) { escena = x; },
    cerrar: () => new Promise(listo => servidor.close(() => listo())),
  };
}
