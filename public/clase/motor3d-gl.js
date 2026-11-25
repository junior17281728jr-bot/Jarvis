// 0.14.78: el dibujo 3D con WebGL2 (cuando el equipo lo tiene): las mismas primitivas que motor3d.js, pero con luz de
// verdad. Mallas con normales (el avión suavizado y con brillo), sol direccional más luz de cielo y suelo (hemisferio),
// niebla y bruma en el horizonte, cielo con el sol, antialiasing (MSAA del navegador), terreno con textura hecha en el
// shader (campos y surcos), nubes de bolas suaves con textura de ruido, luces que brillan, líneas gruesas con guiones
// y profundidad (lo de atrás queda tapado de verdad). Sin WebGL2, escena3d.js usa motor3d.js en un lienzo 2D.
// Nada toca document al importar; todo lo de la GPU vive en el objeto que devuelve crearRenderGL.
import { aCamara, focal, rad, limitar, normalDe, punto, resta } from './motor3d.js';

const VS_MALLA = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec4 aCol; in vec4 aMat;
uniform mat4 uVP;
out vec3 vPos; out vec3 vNor; out vec4 vCol; out vec4 vMat;
void main() { vPos = aPos; vNor = aNor; vCol = aCol; vMat = aMat; gl_Position = uVP * vec4(aPos, 1.0); }`;
const FS_MALLA = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNor; in vec4 vCol; in vec4 vMat;
uniform vec3 uOjo, uSol, uCielo, uSuelo, uSolColor, uNiebla, uCenit, uHorizonte; uniform vec2 uNieblaD; uniform float uAmb, uTex;
out vec4 color;
// Un hash sin seno (el seno de números grandes da basura en algunas GPU: puntitos negros a lo lejos).
float h(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0)), f.x), f.y); }
void main() {
  vec3 N = normalize(vNor); vec3 V = normalize(uOjo - vPos);
  if (dot(N, V) < 0.0) N = -N;
  vec3 base = vCol.rgb;
  // Las derivadas (fwidth) van fuera de cualquier «if»: dentro de una rama no están definidas (puntos negros).
  vec2 q0 = vPos.xz * uTex;
  float px = length(fwidth(q0));
  if (vMat.z > 0.5) {
    // El terreno: manchas de campo, cultivos en surcos y un poco de grano (todo hecho aquí, sin imágenes).
    // Cada detalle se apaga cuando es más chico que un píxel (si no, a lo lejos brilla como arena).
    vec2 q = q0;
    float a1 = clamp(1.5 - px * 1.4, 0.0, 1.0), a2 = clamp(1.5 - px * 4.6, 0.0, 1.0), a3 = clamp(1.5 - px * 16.0, 0.0, 1.0), a4 = clamp(1.5 - px * 60.0, 0.0, 1.0);
    float k = (ruido(q * 0.7) - 0.5) * 0.5 * a1 + (ruido(q * 2.3) - 0.5) * 0.3 * a2 + (ruido(q * 7.9) - 0.5) * 0.2 * a3;
    float parcela = ruido(floor(q * 0.9) + 0.5);
    float surcos = sin(mod(dot(q, parcela > 0.5 ? vec2(9.0, 2.0) : vec2(2.0, 9.0)) * 6.0, 6.2831853));
    base *= 0.96 + 0.42 * k + 0.05 * surcos * step(0.35, parcela) * a4;
  }
  float luz = vMat.x;
  vec3 hemi = mix(uSuelo, uCielo, N.y * 0.5 + 0.5);
  float dif = max(dot(N, uSol), 0.0);
  vec3 c = base * mix(vec3(1.0), hemi * uAmb + uSolColor * dif * (1.05 - uAmb * 0.5), luz);
  if (vMat.y > 0.0) { vec3 H = normalize(uSol + V); c += uSolColor * pow(max(dot(N, H), 0.0), 48.0) * vMat.y; }
  // 0.14.114: el reflejo del cielo (vidrios y pintura del avión): de frente casi nada, de costado mucho (Fresnel).
  // Arriba el cielo de la paleta; abajo, el suelo lejano (la niebla). De noche la paleta es oscura: no brilla.
  if (vMat.w > 0.0) {
    vec3 Rf = reflect(-V, N);
    vec3 cielo = Rf.y > 0.0 ? mix(uHorizonte, uCenit, pow(Rf.y, 0.5)) : mix(uHorizonte, uNiebla * 0.7, clamp(-Rf.y * 4.0, 0.0, 1.0));
    float fr = 0.12 + 0.88 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
    c = mix(c, cielo, clamp(fr * vMat.w, 0.0, 0.92));
    if (vMat.y > 0.6) { vec3 H = normalize(uSol + V); c += uSolColor * pow(max(dot(N, H), 0.0), 220.0) * 0.9 * vMat.w; }
  }
  float d = length(vPos - uOjo);
  float f = smoothstep(uNieblaD.x, uNieblaD.y, d);
  c = mix(c, uNiebla, f);
  // (lo opaco llega con 1.0, pero interpolado puede bajar un pelo: por eso < 0.995 y no < 1.0)
  float a = vCol.a < 0.995 ? vCol.a * (1.0 - f * 0.7) : 1.0;
  color = vec4(c * a, a);
}`;
const VS_CIELO = `#version 300 es
in vec2 aPos; out vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
const FS_CIELO = `#version 300 es
precision highp float;
in vec2 vNdc; uniform mat4 uInv; uniform vec3 uOjo, uSol, uCenit, uHorizonte, uBruma, uSueloLejos, uSolColor;
out vec4 color;
void main() {
  vec4 p = uInv * vec4(vNdc, 1.0, 1.0); vec3 dir = normalize(p.xyz / p.w - uOjo);
  float t = dir.y;
  vec3 c = t > 0.0 ? mix(uHorizonte, uCenit, pow(t, 0.42)) : mix(uHorizonte, uSueloLejos, clamp(-t * 5.0, 0.0, 1.0));
  c = mix(c, uBruma, exp(-abs(t) * 16.0) * 0.8);
  float s = max(dot(dir, uSol), 0.0);
  c += uSolColor * (pow(s, 400.0) * 1.2 + pow(s, 12.0) * 0.12);
  color = vec4(c, 1.0);
}`;
// Líneas: ya vienen en pantalla (NDC con su profundidad) y llevan su distancia en píxeles para los guiones.
const VS_LINEA = `#version 300 es
in vec3 aPos; in vec4 aCol; in vec3 aGuion;
out vec4 vCol; out vec3 vGuion;
void main() { vCol = aCol; vGuion = aGuion; gl_Position = vec4(aPos, 1.0); }`;
const FS_LINEA = `#version 300 es
precision highp float;
in vec4 vCol; in vec3 vGuion; out vec4 color;
void main() {
  if (vGuion.y > 0.0 && mod(vGuion.x, vGuion.y + vGuion.z) > vGuion.y) discard;
  color = vec4(vCol.rgb * vCol.a, vCol.a);
}`;
// Bolas: nubes (textura de ruido, más oscuras abajo) y luces (un halo que suma luz).
const VS_BOLA = `#version 300 es
in vec3 aCentro; in vec2 aEsq; in float aRadio; in vec4 aCol; in vec2 aTipo;
uniform mat4 uVP; uniform vec3 uDer, uArr;
out vec2 vUv; out vec4 vCol; out vec2 vTipo; out vec3 vPos;
void main() {
  vec3 p = aCentro + (uDer * aEsq.x + uArr * aEsq.y) * aRadio;
  vUv = aEsq * 0.5 + 0.5; vCol = aCol; vTipo = aTipo; vPos = aCentro;
  gl_Position = uVP * vec4(p, 1.0);
}`;
const FS_BOLA = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; in vec2 vTipo; in vec3 vPos;
uniform sampler2D uNube; uniform vec3 uOjo, uNiebla; uniform vec2 uNieblaD;
out vec4 color;
void main() {
  if (vTipo.x > 1.5) {
    // Un disco macizo (las ruedas).
    if (length(vUv - 0.5) > 0.5) discard;
    color = vec4(vCol.rgb, 1.0);
    return;
  }
  if (vTipo.x > 0.5) {
    // Luz: un halo de su color y el centro casi blanco.
    float r = length(vUv - 0.5) * 2.0;
    float a = exp(-r * r * 5.0) * vCol.a;
    vec3 c = mix(vCol.rgb, vec3(1.0), exp(-r * r * 40.0));
    color = vec4(c * a, 0.0);
    return;
  }
  vec4 t = texture(uNube, vUv);
  // Abajo más gris, arriba más blanco: la nube parece tener volumen.
  float sombra = mix(vTipo.y, 1.0, smoothstep(0.1, 0.9, vUv.y));
  vec3 c = vCol.rgb * mix(0.78, 1.06, sombra) * (0.9 + 0.1 * t.r);
  float f = smoothstep(uNieblaD.x, uNieblaD.y, length(vPos - uOjo));
  c = mix(c, uNiebla, f * 0.85);
  float a = t.a * vCol.a * (1.0 - f);
  color = vec4(c * a, a);
}`;

function compilar(gl, vs, fs) {
  const s = (tipo, fuente) => { const x = gl.createShader(tipo); gl.shaderSource(x, fuente); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const p = gl.createProgram();
  gl.attachShader(p, s(gl.VERTEX_SHADER, vs)); gl.attachShader(p, s(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nombre = gl.getActiveUniform(p, i).name; u[nombre] = gl.getUniformLocation(p, nombre); }
  const a = {}, m = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < m; i++) { const nombre = gl.getActiveAttrib(p, i).name; a[nombre] = gl.getAttribLocation(p, nombre); }
  return { p, u, a };
}

// Las matrices: la de la cámara (mano derecha, mirando a −z) y la perspectiva.
export function matrizVista(cam) {
  const { derecha: r, sube: u, adelante: f, ojo: e } = cam;
  return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -punto(r, e), -punto(u, e), punto(f, e), 1];
}
export function matrizPerspectiva(fovGrados, aspecto, cerca, lejos) {
  const f = 1 / Math.tan(rad(fovGrados) / 2), nf = 1 / (cerca - lejos);
  return [f / aspecto, 0, 0, 0, 0, f, 0, 0, 0, 0, (lejos + cerca) * nf, -1, 0, 0, 2 * lejos * cerca * nf, 0];
}
export function multiplicar(a, b) { // columnas (como OpenGL): a·b
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
export function invertir(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d];
}

// La textura de una nube: bola con borde suave y ruido (hecha aquí, 64×64).
export function texturaNube(n = 64) {
  const datos = new Uint8Array(n * n * 4);
  const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ruido = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n * 2 - 1, v = (y + 0.5) / n * 2 - 1, r = Math.hypot(u, v);
    const fbm = ruido(x / 8, y / 8) * 0.5 + ruido(x / 4, y / 4) * 0.3 + ruido(x / 2, y / 2) * 0.2;
    const borde = limitar((1 - r) / 0.55 + (fbm - 0.5) * 0.9, 0, 1);
    const i = (y * n + x) * 4;
    datos[i] = datos[i + 1] = datos[i + 2] = Math.round(200 + 55 * fbm);
    datos[i + 3] = Math.round(255 * borde * borde * (3 - 2 * borde));
  }
  return { n, datos };
}

const color01 = c => [c[0] / 255, c[1] / 255, c[2] / 255];

export function crearRenderGL(lienzo) {
  let gl = null;
  try { gl = lienzo.getContext?.('webgl2', { antialias: true, premultipliedAlpha: true, alpha: false, preserveDrawingBuffer: false }) ?? null; } catch { gl = null; }
  if (!gl) return null;
  let P;
  try {
    P = { malla: compilar(gl, VS_MALLA, FS_MALLA), cielo: compilar(gl, VS_CIELO, FS_CIELO), linea: compilar(gl, VS_LINEA, FS_LINEA), bola: compilar(gl, VS_BOLA, FS_BOLA) };
  } catch { return null; }
  const vaoCielo = gl.createVertexArray(), bufCielo = gl.createBuffer();
  gl.bindVertexArray(vaoCielo); gl.bindBuffer(gl.ARRAY_BUFFER, bufCielo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(P.cielo.a.aPos); gl.vertexAttribPointer(P.cielo.a.aPos, 2, gl.FLOAT, false, 0, 0);
  const tex = texturaNube(), texNube = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texNube);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tex.n, tex.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex.datos);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.bindVertexArray(null);

  // ---------- mallas (polígonos → triángulos) ----------
  // Cada vértice: posición (3), normal (3), color + opacidad (4), material (luz, brillo, terreno, 0) = 14 floats.
  const ANCHO = 14;
  // 0.14.114: directo a un arreglo de números (sin copias ni «...» por vértice): el avión (unas 600 caras) se arma en
  // cada cuadro y en el juego hay varios.
  function triangular(lista) {
    const opacos = [], calco = [], trans = [];
    for (const q of lista) {
      if (q.t !== 'p' || q.p.length < 3) continue;
      const n = q.n ?? (q.n = normalDe(q.p));
      const m0 = q.luz ?? 1, m1 = q.brillo ?? 0, m2 = q.terreno ? 1 : 0, m3 = q.refleja ?? 0;
      const r = q.c[0] / 255, g = q.c[1] / 255, b = q.c[2] / 255, a = q.a ?? 1;
      const p = q.p, ns = q.ns, verts = new Array((p.length - 2) * 3 * ANCHO);
      let o = 0;
      for (let i = 1; i < p.length - 1; i++) for (let t = 0; t < 3; t++) {
        const k = t === 0 ? 0 : t === 1 ? i : i + 1, v = p[k], nn = ns ? ns[k] : n;
        verts[o++] = v[0]; verts[o++] = v[1]; verts[o++] = v[2]; verts[o++] = nn[0]; verts[o++] = nn[1]; verts[o++] = nn[2];
        verts[o++] = r; verts[o++] = g; verts[o++] = b; verts[o++] = a; verts[o++] = m0; verts[o++] = m1; verts[o++] = m2; verts[o++] = m3;
      }
      const destino = q.capa === 'calco' ? calco : a < 1 ? trans : opacos;
      destino.push({ verts, centro: destino === trans ? centroDe(p) : null });
    }
    return { opacos, calco, trans };
  }
  const centroDe = p => { let x = 0, y = 0, z = 0; for (const v of p) { x += v[0]; y += v[1]; z += v[2]; } return [x / p.length, y / p.length, z / p.length]; };
  function subir(grupos, uso) {
    const vao = gl.createVertexArray(), buf = gl.createBuffer();
    const total = grupos.reduce((s, g) => s + g.verts.length, 0);
    const datos = new Float32Array(total);
    let o = 0;
    const rangos = grupos.map(g => { datos.set(g.verts, o); const r = { desde: o / ANCHO, cuenta: g.verts.length / ANCHO, centro: g.centro }; o += g.verts.length; return r; });
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, datos, uso);
    const A = P.malla.a, F = 4 * ANCHO;
    for (const [nombre, tam, des] of [['aPos', 3, 0], ['aNor', 3, 12], ['aCol', 4, 24], ['aMat', 4, 40]]) { gl.enableVertexAttribArray(A[nombre]); gl.vertexAttribPointer(A[nombre], tam, gl.FLOAT, false, F, des); }
    let ibo = null;
    if (rangos.length && uso !== gl.STREAM_DRAW) { ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); }
    gl.bindVertexArray(null);
    return { vao, buf, ibo, vertices: o / ANCHO, rangos, liberar() { gl.deleteVertexArray(vao); gl.deleteBuffer(buf); if (ibo) gl.deleteBuffer(ibo); } };
  }
  const cache = new WeakMap(); // lista de primitivas → sus buffers (lo fijo y lo de cada paso se suben una vez)
  const vivos = new Set();
  function mallasDe(lista, fija) {
    if (fija && cache.has(lista)) return cache.get(lista);
    const t = triangular(lista);
    const uso = fija ? gl.STATIC_DRAW : gl.STREAM_DRAW;
    const m = { opacos: subir(t.opacos, uso), calco: subir(t.calco, uso), trans: subir(t.trans, fija ? gl.STATIC_DRAW : gl.STREAM_DRAW), otras: lista.filter(q => q.t !== 'p') };
    if (fija) { cache.set(lista, m); vivos.add(m); }
    return m;
  }
  // Lo semitransparente se ordena en cada cuadro (de lejos a cerca) con un índice nuevo.
  function dibujarTrans(m, cam) {
    if (!m.rangos.length) return;
    const orden = m.rangos.map(r => ({ r, z: punto(resta(r.centro, cam.ojo), cam.adelante) })).sort((a, b) => b.z - a.z);
    const ind = new Uint32Array(m.vertices);
    let o = 0;
    for (const { r } of orden) for (let k = 0; k < r.cuenta; k++) ind[o++] = r.desde + k;
    gl.bindVertexArray(m.vao);
    if (!m.ibo) { m.ibo = gl.createBuffer(); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ind, gl.STREAM_DRAW);
    gl.drawElements(gl.TRIANGLES, o, gl.UNSIGNED_INT, 0);
  }

  // ---------- líneas y bolas (se arman en cada cuadro) ----------
  const vaoL = gl.createVertexArray(), bufL = gl.createBuffer();
  gl.bindVertexArray(vaoL); gl.bindBuffer(gl.ARRAY_BUFFER, bufL);
  for (const [nombre, tam, des] of [['aPos', 3, 0], ['aCol', 4, 12], ['aGuion', 3, 28]]) { gl.enableVertexAttribArray(P.linea.a[nombre]); gl.vertexAttribPointer(P.linea.a[nombre], tam, gl.FLOAT, false, 40, des); }
  const vaoB = gl.createVertexArray(), bufB = gl.createBuffer();
  gl.bindVertexArray(vaoB); gl.bindBuffer(gl.ARRAY_BUFFER, bufB);
  for (const [nombre, tam, des] of [['aCentro', 3, 0], ['aEsq', 2, 12], ['aRadio', 1, 20], ['aCol', 4, 24], ['aTipo', 2, 40]]) { gl.enableVertexAttribArray(P.bola.a[nombre]); gl.vertexAttribPointer(P.bola.a[nombre], tam, gl.FLOAT, false, 48, des); }
  gl.bindVertexArray(null);

  function lineas(listas, cam, ancho, alto, escala, cerca, lejos) {
    const f = focal(cam, alto), out = [];
    const ndcZ = z => { const zc = -z; return ((lejos + cerca) / (cerca - lejos) * zc + 2 * lejos * cerca / (cerca - lejos)) / -zc; };
    for (const lista of listas) for (const q of lista) {
      if (q.t !== 'l') continue;
      const w = (q.w ?? 1.5) * escala * 0.5, c = color01(q.c), a = q.a ?? 1, g = q.guion ? q.guion.map(x => x * escala) : [0, 0];
      const acerca = q.capa === 'calco' ? 0.996 : 0.999; // lo del suelo un poco hacia la cámara (no se mezcla con el suelo)
      const cam3 = q.p.map(v => aCamara(cam, v));
      let dist = q.avance ? -q.avance * escala : 0;
      for (let i = 0; i < cam3.length - 1; i++) {
        let A = cam3[i], B = cam3[i + 1];
        if (A[2] < cerca && B[2] < cerca) continue;
        if (A[2] < cerca) { const t = (cerca - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, cerca]; }
        if (B[2] < cerca) { const t = (cerca - A[2]) / (B[2] - A[2]); B = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, cerca]; }
        const pa = [ancho / 2 + (f * A[0]) / A[2], alto / 2 - (f * A[1]) / A[2]], pb = [ancho / 2 + (f * B[0]) / B[2], alto / 2 - (f * B[1]) / B[2]];
        const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy) || 1e-6, nx = (-dy / L) * w, ny = (dx / L) * w;
        const za = ndcZ(A[2] * acerca), zb = ndcZ(B[2] * acerca);
        const V = (x, y, z, d) => out.push((x / ancho) * 2 - 1, 1 - (y / alto) * 2, z, ...c, a, d, g[0], g[1]);
        const d0 = dist, d1 = dist + L;
        V(pa[0] + nx, pa[1] + ny, za, d0); V(pa[0] - nx, pa[1] - ny, za, d0); V(pb[0] + nx, pb[1] + ny, zb, d1);
        V(pb[0] + nx, pb[1] + ny, zb, d1); V(pa[0] - nx, pa[1] - ny, za, d0); V(pb[0] - nx, pb[1] - ny, zb, d1);
        dist = d1;
      }
    }
    return new Float32Array(out);
  }
  function bolas(listas, cam, t) {
    const nubes = [], luces = [], discos = [];
    for (const lista of listas) for (const q of lista) {
      if (q.t !== 's') continue;
      const z = punto(resta(q.p, cam.ojo), cam.adelante);
      if (z < cam.cerca * 2) continue;
      // Si la bola se vería muy chica, se agranda hasta su mínimo en píxeles (las luces de lejos).
      (q.tex === 'brillo' ? luces : q.tex === 'disco' ? discos : nubes).push({ q, z });
    }
    nubes.sort((a, b) => b.z - a.z);
    const arma = (lista, minPx) => {
      const out = [];
      for (const { q, z } of lista) {
        const luz = q.tex === 'brillo' ? 1 : q.tex === 'disco' ? 2 : 0, c = color01(q.c), r = Math.max(q.r * (luz === 1 ? 3 : luz === 2 ? 1 : 1.15), (q.min ?? 0) * minPx * z * (luz === 1 ? 3 : 1));
        const sombra = q.sombra == null ? 0.85 : limitar(q.sombra, 0, 1);
        for (const [ex, ey] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) out.push(q.p[0], q.p[1], q.p[2], ex, ey, r, c[0], c[1], c[2], q.a ?? 1, luz, sombra);
      }
      return new Float32Array(out);
    };
    return { arma, nubes, luces, discos };
  }

  let usadas = new Set();
  return {
    gl,
    // escena: { paleta, fijas: [listas que no cambian], prims (las de este cuadro), niebla, sol, texturaEscala }.
    render(escena, cam, ancho, alto, opciones = {}) {
      const escala = opciones.escala ?? 1;
      gl.viewport(0, 0, ancho, alto);
      const lejos = escena.lejos ?? 3000, cerca = Math.max(cam.cerca, lejos / 2e5);
      const V = matrizVista(cam), Pm = matrizPerspectiva(cam.fov, ancho / alto, cerca, lejos), VP = multiplicar(Pm, V);
      const pal = escena.paleta, sol = escena.sol ?? [-0.4, 0.8, -0.45];
      const sl = Math.hypot(...sol), S = sol.map(v => v / sl);
      const niebla = escena.niebla ?? { inicio: 1e8, fin: 2e8 };
      const nColor = color01(niebla.color ?? pal.niebla);
      // El cielo.
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      gl.useProgram(P.cielo.p);
      const U = P.cielo.u;
      gl.uniformMatrix4fv(U.uInv, false, invertir(VP)); gl.uniform3fv(U.uOjo, cam.ojo); gl.uniform3fv(U.uSol, S);
      gl.uniform3fv(U.uCenit, color01(pal.cieloAlto)); gl.uniform3fv(U.uHorizonte, color01(pal.cieloBajo)); gl.uniform3fv(U.uBruma, color01(pal.bruma));
      gl.uniform3fv(U.uSueloLejos, nColor); gl.uniform3fv(U.uSolColor, pal.oscuro ? [0.9, 0.7, 0.55] : [1, 0.96, 0.88]);
      gl.bindVertexArray(vaoCielo); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); // (clear respeta depthMask: con false no borra)
      // Las mallas.
      gl.useProgram(P.malla.p);
      const M = P.malla.u;
      gl.uniformMatrix4fv(M.uVP, false, VP); gl.uniform3fv(M.uOjo, cam.ojo); gl.uniform3fv(M.uSol, S);
      gl.uniform3fv(M.uCielo, pal.oscuro ? [0.72, 0.8, 1.0] : [0.95, 1.0, 1.08]); gl.uniform3fv(M.uSuelo, pal.oscuro ? [0.42, 0.44, 0.42] : [0.62, 0.6, 0.52]);
      gl.uniform3fv(M.uSolColor, pal.oscuro ? [0.95, 0.84, 0.74] : [1.0, 0.97, 0.9]); gl.uniform3fv(M.uNiebla, nColor);
      gl.uniform2f(M.uNieblaD, niebla.inicio, Math.max(niebla.inicio + 1e-3, niebla.fin)); gl.uniform1f(M.uAmb, pal.ambiente ?? 0.55); gl.uniform1f(M.uTex, escena.texturaEscala ?? 1);
      gl.uniform3fv(M.uCenit, color01(pal.cieloAlto)); gl.uniform3fv(M.uHorizonte, color01(pal.cieloBajo));
      const fijas = (escena.fijas ?? []).map(l => mallasDe(l, true));
      const dinamica = mallasDe(escena.prims ?? [], false);
      const todas = [...fijas, dinamica];
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
      for (const m of todas) if (m.opacos.vertices) { gl.bindVertexArray(m.opacos.vao); gl.drawArrays(gl.TRIANGLES, 0, m.opacos.vertices); }
      // Lo pegado al suelo (pista, marcas, sombra): encima del suelo, en su orden.
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -6);
      for (const m of todas) if (m.calco.vertices) { gl.bindVertexArray(m.calco.vao); gl.drawArrays(gl.TRIANGLES, 0, m.calco.vertices); }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      // Lo semitransparente (los volúmenes del espacio aéreo), de lejos a cerca.
      for (const m of todas) dibujarTrans(m.trans, cam);
      // Las nubes y las luces.
      const otras = [...fijas.map(m => m.otras), dinamica.otras];
      const pxMundo = 1 / focal(cam, alto) * escala;
      const B = bolas(otras, cam);
      gl.useProgram(P.bola.p);
      const Bu = P.bola.u;
      gl.uniformMatrix4fv(Bu.uVP, false, VP); gl.uniform3fv(Bu.uDer, cam.derecha); gl.uniform3fv(Bu.uArr, cam.sube); gl.uniform3fv(Bu.uOjo, cam.ojo);
      gl.uniform3fv(Bu.uNiebla, nColor); gl.uniform2f(Bu.uNieblaD, niebla.inicio, Math.max(niebla.inicio + 1e-3, niebla.fin));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texNube); gl.uniform1i(Bu.uNube, 0);
      gl.bindVertexArray(vaoB);
      const datosD = B.arma(B.discos, pxMundo);
      if (datosD.length) { gl.depthMask(true); gl.disable(gl.BLEND); gl.bindBuffer(gl.ARRAY_BUFFER, bufB); gl.bufferData(gl.ARRAY_BUFFER, datosD, gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, datosD.length / 12); gl.enable(gl.BLEND); gl.depthMask(false); }
      const datosN = B.arma(B.nubes, pxMundo);
      if (datosN.length) { gl.bindBuffer(gl.ARRAY_BUFFER, bufB); gl.bufferData(gl.ARRAY_BUFFER, datosN, gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, datosN.length / 12); }
      const datosL = B.arma(B.luces, pxMundo);
      if (datosL.length) { gl.blendFunc(gl.ONE, gl.ONE); gl.bindBuffer(gl.ARRAY_BUFFER, bufB); gl.bufferData(gl.ARRAY_BUFFER, datosL, gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, datosL.length / 12); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
      // Las líneas (con profundidad: lo de atrás queda tapado).
      const datos = lineas(otras, cam, ancho, alto, escala, cerca, lejos);
      if (datos.length) {
        gl.useProgram(P.linea.p); gl.bindVertexArray(vaoL); gl.bindBuffer(gl.ARRAY_BUFFER, bufL);
        gl.bufferData(gl.ARRAY_BUFFER, datos, gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, datos.length / 10);
      }
      gl.bindVertexArray(null); gl.depthMask(true);
      dinamica.opacos.liberar(); dinamica.calco.liberar(); dinamica.trans.liberar();
      // Lo fijo que ya no se usa (otro tema, otro paso viejo) se suelta.
      const ahora = new Set(fijas);
      for (const m of usadas) if (!ahora.has(m) && !opciones.conservar) { /* se queda en la caché del WeakMap */ }
      usadas = ahora;
      return { triangulos: todas.reduce((s, m) => s + m.opacos.vertices + m.calco.vertices + m.trans.vertices, 0) / 3 };
    },
    liberar() {
      for (const m of vivos) { m.opacos.liberar(); m.calco.liberar(); m.trans.liberar(); }
      vivos.clear();
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ya no está */ }
    },
  };
}
