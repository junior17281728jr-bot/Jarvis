// Qué dibujo corresponde a cada «visual.tipo» de una escena. El reproductor busca aquí.
import { montarAla } from './ala.js';
import { montarMotor } from './motor.js';
import { montarInstrumentos } from './instrumentos.js';
import { montarEscenario } from './escenario.js';
import { montarMeteo } from './meteo.js';
import { montarTitulo } from './titulo.js';
import { montarCartel } from './cartel.js';
// Las escenas del video de la materia 1 (Factores humanos): tipos «fh-…».
import { VISUALES_FH } from './visuales-fh.js';
// 0.13.0: los dibujos con datos de la fábrica de materias.
import { VISUALES_DIAGRAMA } from './diagramas.js';
// 0.14.62: los dibujos de aviación (circuito, marcas de pista, letreros, VOR, triángulo de viento y carta).
import { VISUALES_AVIACION } from './aviacion.js';
import { el } from './comun.js';

// 0.14.78: las escenas 3D (escena3d.js, el motor 3D y las seis escenas) se piden recién cuando una tarjeta las usa: al
// montar queda un hueco con «Cargando…» y, al llegar el módulo, la escena ocupa su lugar. destruir() sirve antes y después.
export function montarEscena3dDiferida(c, p, o) {
  const t = typeof o?.t === 'function' ? o.t : null;
  let texto = 'Cargando la escena 3D…';
  try { const r = t?.('clase.e3d.ctl.cargando'); if (typeof r === 'string' && r && r !== 'clase.e3d.ctl.cargando') texto = r; } catch { /* el texto de siempre */ }
  const hueco = el('div', { class: 'clase-e3d-hueco', role: 'status' }, c, texto);
  let montada = null, fuera = false;
  import('./escena3d.js').then(m => {
    if (fuera) return;
    montada = m.montarEscena3d(c, p, o);
    if (hueco.parentNode) hueco.parentNode.insertBefore(montada.raiz, hueco);
    hueco.remove();
  }).catch(() => { if (!fuera) hueco.textContent = '—'; });
  return {
    get raiz() { return montada?.raiz ?? hueco; },
    tiempo() {}, modo() {}, poner() {},
    pausar() { montada?.pausar(); },
    destruir() { fuera = true; montada?.destruir(); hueco.remove(); },
  };
}

export const VISUALES = {
  titulo: (c, p, o) => montarTitulo(c, { ...p, ...o }),
  // 0.7.2: la escena sin dibujo propio (y la que usa el reproductor para un tipo que no conoce).
  cartel: (c, p, o) => montarCartel(c, { variante: o?.indice, ...p, ...o }),
  ala: (c, p, o) => montarAla(c, { ...p, ...o }),
  motor: (c, p, o) => montarMotor(c, { ...p, ...o }),
  instrumentos: (c, p, o) => montarInstrumentos(c, { ...p, ...o }),
  meteo: (c, p, o) => montarMeteo(c, { ...p, ...o }),
  // El escenario recibe los datos del escenario en parametros y espera la respuesta del alumno.
  escenario: (c, p, o) => montarEscenario(c, p, o),
  ...VISUALES_FH,
  ...VISUALES_DIAGRAMA,
  ...VISUALES_AVIACION,
  'escena-3d': (c, p, o) => montarEscena3dDiferida(c, p, o),
};
