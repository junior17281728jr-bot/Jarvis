// 0.14.114: el avión de cerca (demo-avion.html): ?giro=35&alto=12&dist=16 (la cámara), ?alabeo=20&cabeceo=5&alerones=10
// &profundidad=8, ?motor=2d (sin WebGL), ?tema=claro|oscuro. Arrastrar gira la cámara. Para las capturas: body[data-listo].
import { crearCamara, ojoOrbita, primitivasAvion, render, crearTexturas } from './motor3d.js';
import { crearRenderGL } from './motor3d-gl.js';
import { PALETAS, campo, aeropuerto } from './e3d-base.js';

function iniciar() {
  const q = new URLSearchParams(location.search), num = (k, d) => (q.get(k) != null && q.get(k) !== '' && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const oscuro = q.get('tema') === 'oscuro' || (q.get('tema') !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (q.get('tema')) document.documentElement.dataset.tema = q.get('tema');
  const paleta = oscuro ? PALETAS.oscuro : PALETAS.claro;
  const lienzo = document.getElementById('lienzo');
  const vista = { giro: num('giro', 35), alto: num('alto', 12), dist: num('dist', 15) };
  const suelo = [...campo({ x0: -60, z0: -60, x1: 60, z1: 60, n: 12, altura: () => 0, paleta, falda: 600 }), ...aeropuerto({ x: 6, z: 0, rumbo: 0, largo: Number(q.get("largo") || 90), ancho: 4, paleta })];
  const avion = { pos: [0, 0.86, 0], rumbo: 0, cabeceo: num('cabeceo', 0), alabeo: num('alabeo', 0), alerones: num('alerones', 0), profundidad: num('profundidad', 0) };
  const gl = q.get('motor') === '2d' ? null : crearRenderGL(lienzo);
  const ctx = gl ? null : lienzo.getContext('2d');
  const texturas = gl ? {} : crearTexturas((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  let t = num('t', 0.4);
  function dibujar() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = lienzo.clientWidth || 640, h = lienzo.clientHeight || 400;
    lienzo.width = Math.round(w * dpr); lienzo.height = Math.round(h * dpr);
    const mira = [0.3, num('miray', 1.0), 0];
    const cam = crearCamara({ ojo: ojoOrbita({ mira, giro: vista.giro, alto: vista.alto, dist: vista.dist }), mira, fov: num('fov', 40), cerca: 0.05 });
    const prims = primitivasAvion({ ...avion, escala: 1, helice: t * 7, t, sombra: 0 });
    const niebla = { color: paleta.niebla, inicio: 60, fin: 500 };
    if (gl) gl.render({ paleta, fijas: [suelo], prims, niebla, lejos: 2000, texturaEscala: 0.6 }, cam, lienzo.width, lienzo.height, { escala: dpr });
    else render(ctx, { paleta, prims: [...suelo, ...prims], etiquetas: [], niebla, ambiente: paleta.ambiente }, cam, lienzo.width, lienzo.height, { escala: dpr, texturas });
  }
  let x0 = null;
  lienzo.addEventListener('pointerdown', e => { x0 = [e.clientX, e.clientY]; lienzo.setPointerCapture?.(e.pointerId); });
  lienzo.addEventListener('pointermove', e => { if (!x0) return; vista.giro -= (e.clientX - x0[0]) * 0.4; vista.alto = Math.max(-30, Math.min(80, vista.alto + (e.clientY - x0[1]) * 0.3)); x0 = [e.clientX, e.clientY]; dibujar(); });
  lienzo.addEventListener('pointerup', () => { x0 = null; });
  lienzo.addEventListener('wheel', e => { e.preventDefault(); vista.dist = Math.max(6, Math.min(60, vista.dist * Math.exp(e.deltaY * 0.001))); dibujar(); }, { passive: false });
  dibujar();
  document.body.dataset.listo = '1';
}
if (typeof document !== 'undefined') iniciar();
