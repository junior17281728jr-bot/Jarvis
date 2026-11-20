// 0.14.78: una escena 3D descrita SOLO con datos (JSON), para lo que viene después: las «consecuencias animadas» (el
// avión hace bien el procedimiento, o muestra qué pasa con la respuesta equivocada: la pérdida, meterse en una nube,
// entrar sin autorización). escenaDesdeJson(def) devuelve una escena igual a las de e3d-*.js, que montarEscena3d acepta
// con opciones.escena. Los textos van en la definición (ya en el idioma del alumno).
// def = {
//   id, titulo, recuerda, unidades?: { ftH, ftV } (1,000 ft por defecto), exagerar?: 1,
//   entorno: { terreno?: { x0, z0, x1, z1, n?, alto? }, aeropuertos?: [{ x, z, rumbo, largo, ancho }],
//     nubes?: [{ x, z, base, ancho, alto, plana? }],
//     volumenes?: [{ tipo: 'cilindro'|'anillo'|'caja', clase?: 'A'..'G', color?: [r,g,b], alfa?, centro?: [x, z], radio?, radio2?,
//                    desde, hasta, caja?: [x0, z0, x1, z1] }],
//     etiquetas?: [{ p: [x, y, z], texto, clase? }] },
//   pasos: [{ id, titulo, texto, mas?, vista?: '1p'|'3p', camara: { mira, giro, alto, dist, fov?, seguir? },
//             vuelo?: { ruta: [[x, y, z]…], cerrada?, seg, kt },
//             estados?: [{ t, alabeo?, cabeceo?, kt? }] (cómo va el avión en el tiempo: pisa lo que sale de la ruta),
//             estado?: 'el texto de la etiqueta de arriba', clase?: 'ok'|'mal'|'A'…, resaltar?: [índices de volúmenes] }]
// }
import { cilindro, anillo, cajaVolumen } from './motor3d.js';
import { COLOR_CLASE, aeropuerto, campo, cumulo } from './e3d-base.js';

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
// Los estados del avión en el tiempo (interpolados): { alabeo, cabeceo, kt }.
export function estadoEnTiempo(claves, t) {
  if (!Array.isArray(claves) || !claves.length) return null;
  const l = [...claves].sort((a, b) => a.t - b.t);
  if (t <= l[0].t) return l[0];
  for (let i = 1; i < l.length; i++) if (t <= l[i].t) {
    const a = l[i - 1], b = l[i], k = (t - a.t) / (b.t - a.t || 1), s = k * k * (3 - 2 * k);
    const m = clave => (a[clave] == null || b[clave] == null ? b[clave] ?? a[clave] : a[clave] + (b[clave] - a[clave]) * s);
    return { alabeo: m('alabeo'), cabeceo: m('cabeceo'), kt: m('kt') };
  }
  return l[l.length - 1];
}

export function escenaDesdeJson(def) {
  const E = def.entorno ?? {}, pasos = def.pasos ?? [];
  const TEXTOS = { titulo: def.titulo ?? '', recuerda: def.recuerda ?? '' };
  for (const p of pasos) { TEXTOS[`${p.id}.titulo`] = p.titulo ?? ''; TEXTOS[`${p.id}.texto`] = p.texto ?? ''; TEXTOS[`${p.id}.mas`] = p.mas ?? ''; }
  const ter = E.terreno ?? { x0: -20, z0: -20, x1: 20, z1: 20 };
  const altura = () => num(ter.alto, 0);
  const PASOS = pasos.map(p => ({
    id: p.id, vista: p.vista === '1p' ? '1p' : '3p', resaltar: p.resaltar ?? null,
    camara: { mira: p.camara?.mira ?? [0, 1, 0], giro: num(p.camara?.giro, 30), alto: num(p.camara?.alto, 15), dist: num(p.camara?.dist, 12), fov: num(p.camara?.fov, 48), seguir: num(p.camara?.seguir, 0) },
    vuelo: p.vuelo ? { ruta: p.vuelo.ruta, cerrada: Boolean(p.vuelo.cerrada), seg: num(p.vuelo.seg, 20), kt: num(p.vuelo.kt, 100) } : null,
    estados: p.estados ?? null, estado: p.estado ?? '', clase: p.clase ?? '', tQuieto: num(p.tQuieto, undefined),
  }));
  const volumen = (v, resaltado) => {
    const c = v.color ?? COLOR_CLASE[v.clase] ?? [120, 180, 255], a = num(v.alfa, 0.18) * (resaltado ? 1.6 : 1), borde = [...c, resaltado ? 1 : 0.7];
    if (v.tipo === 'anillo') return anillo(v.centro, num(v.radio, 1), num(v.radio2, 2), v.desde, v.hasta, c, { a, borde });
    if (v.tipo === 'caja') { const [x0, z0, x1, z1] = v.caja; return cajaVolumen(x0, v.desde, z0, x1, v.hasta, z1, c, { a, borde }); }
    return cilindro(v.centro, num(v.radio, 1), v.desde, v.hasta, c, { a, borde, lados: 32 });
  };
  return {
    id: def.id, TEXTOS, PASOS,
    unidades: { ftH: num(def.unidades?.ftH, 1000), ftV: num(def.unidades?.ftV, 1000) }, exagerar: num(def.exagerar, 1),
    escalaAvion: num(def.escalaAvion, 0.008), texturaEscala: num(def.texturaEscala, 0.35), sombra: altura,
    construir(paleta) {
      const prims = campo({ x0: ter.x0, z0: ter.z0, x1: ter.x1, z1: ter.z1, n: num(ter.n, 14), altura, paleta, falda: num(ter.falda, 200) });
      for (const a of E.aeropuertos ?? []) prims.push(...aeropuerto({ x: a.x, z: a.z, y: altura(), rumbo: num(a.rumbo, 0), largo: num(a.largo, 5), ancho: num(a.ancho, 0.2), paleta }));
      (E.nubes ?? []).forEach((n, i) => prims.push(...cumulo({ ...n, semilla: n.semilla ?? 101 + i }).prims));
      return { prims };
    },
    armarPaso(paso) {
      const prims = [], resaltar = new Set(paso.resaltar ?? []);
      (E.volumenes ?? []).forEach((v, i) => prims.push(...volumen(v, resaltar.has(i))));
      const etiquetas = (E.etiquetas ?? []).map(e => ({ p: e.p, texto: e.texto, color: COLOR_CLASE[e.clase] ?? null, prioridad: 6 }));
      return { prims, etiquetas };
    },
    // Los estados del paso pisan el alabeo, el cabeceo y la velocidad que salen de la ruta (la pérdida: nariz arriba).
    ajustarAvion(paso, avion, t) {
      const e = estadoEnTiempo(paso.estados, t);
      return e ? { ...avion, alabeo: e.alabeo ?? avion.alabeo, cabeceo: e.cabeceo ?? avion.cabeceo, kt: e.kt ?? avion.kt } : avion;
    },
    cuadro({ paso }) { return { prims: [], estado: paso.estado, clase: paso.clase }; },
  };
}
