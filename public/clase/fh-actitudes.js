// Escena «Cinco actitudes peligrosas»: una avioneta pasa rasante sobre unos cables; aparecen cinco tarjetas rojas con
// la actitud y lo que se piensa, y cada una se da vuelta a verde con su antídoto.
// opciones.pasos = [aparecen…(5), antidotos…(5)] o se usan los de PASOS_ACTITUDES; opciones.actitudes = [{ nombre, piensa, antidoto }].

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, fondoCielo, avioneta, mover, opacidad, T, tramo, salida } from './fh-base.js';

export const TEXTOS_ACTITUDES = {
  actitudes: [
    { nombre: 'Antiautoridad', piensa: ['«Las reglas no', 'son para mí»'], antidoto: ['Sigo las reglas:', 'suelen tener razón'] },
    { nombre: 'Impulsividad', piensa: ['«¡Hazlo ya!»'], antidoto: ['No tan rápido:', 'pienso primero'] },
    { nombre: 'Invulnerabilidad', piensa: ['«A mí no', 'me pasa»'], antidoto: ['Me puede', 'pasar a mí'] },
    { nombre: 'Macho', piensa: ['«Yo puedo', 'con todo»'], antidoto: ['Arriesgarse', 'es una tontería'] },
    { nombre: 'Resignación', piensa: ['«¿Para qué?»'], antidoto: ['Puedo hacer', 'la diferencia'] },
  ],
  peligrosas: 'Cinco actitudes peligrosas', antidotos: 'Cada una tiene su antídoto', antidotoCorto: 'Antídoto',
};
export const PASOS_ACTITUDES = { aparecen: [0.1, 0.18, 0.28, 0.37, 0.44], antidotos: [0.53, 0.62, 0.71, 0.8, 0.89] };

// Estado de una tarjeta en t: cuánto apareció (0..1), cuánto giró (0..1) y qué cara se ve.
export function estadoActitud(t, aparece, gira, dura = 0.04) {
  const a = salida(tramo(t, aparece, aparece + dura)), g = tramo(t, gira, gira + dura);
  return { aparece: a, giro: g, escala: Math.abs(Math.cos(Math.PI * g)), antidoto: g >= 0.5 };
}

export function montarFhActitudes(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_ACTITUDES, opciones);
  const P = opciones.pasos && opciones.pasos.aparecen ? opciones.pasos : PASOS_ACTITUDES;
  const rotulos = opciones.rotulos || [
    { texto: X.peligrosas, desde: 0.03, hasta: P.antidotos[0] - 0.03, x: 64, y: 190, tono: 'mal' },
    { texto: X.antidotos, desde: P.antidotos[0] - 0.02, x: 64, y: 190, tono: 'bien' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    // Viñeta: cables y una avioneta que pasa demasiado baja.
    const vin = svg('g', {}, c);
    svg('path', { d: 'M700 236 L1280 236 L1280 180 Q1100 168 980 190 Q860 206 700 200 Z', fill: 'var(--clfh-tierra-1)', opacity: 0.8 }, vin);
    for (const x of [780, 1000, 1220]) { svg('rect', { x: x - 4, y: 110, width: 8, height: 110, fill: 'var(--clfh-tinta-suave)' }, vin); svg('rect', { x: x - 22, y: 112, width: 44, height: 6, fill: 'var(--clfh-tinta-suave)' }, vin); }
    for (const dy of [0, 10]) svg('path', { d: `M780 ${118 + dy} Q890 ${150 + dy} 1000 ${118 + dy} Q1110 ${150 + dy} 1220 ${118 + dy}`, fill: 'none', stroke: 'var(--clfh-tinta-suave)', 'stroke-width': 2.5 }, vin);
    const av = svg('g', {}, vin);
    avioneta(av);
    const alerta = T(vin, 1000, 92, '!', { tam: 40, peso: 900, ancla: 'middle', color: 'var(--clfh-mal)' });

    const W = 224, H = 300;
    const cartas = X.actitudes.map((d, k) => {
      const g = svg('g', {}, c);
      const giro = svg('g', {}, g);
      const frente = svg('g', {}, giro);
      svg('rect', { x: -W / 2, y: -H / 2, width: W, height: H, rx: 24, fill: '#b91c1c', class: 'clase-fh-sombra' }, frente);
      svg('path', { d: `M${-W / 2} ${-H / 2 + 24} a24 24 0 0 1 24 -24 H${W / 2 - 24} a24 24 0 0 1 24 24 V-60 H${-W / 2} Z`, fill: '#991b1b' }, frente);
      T(frente, 0, -96, String(k + 1), { tam: 30, peso: 900, ancla: 'middle', color: '#fecaca' });
      T(frente, 0, -70, d.nombre, { tam: d.nombre.length > 13 ? 21 : 24, peso: 850, ancla: 'middle', color: '#ffffff' });
      d.piensa.forEach((l, i) => T(frente, 0, 10 + i * 34 - (d.piensa.length - 1) * 17, l, { tam: 26, peso: 700, ancla: 'middle', color: '#ffffff' }));
      const espalda = svg('g', {}, giro);
      svg('rect', { x: -W / 2, y: -H / 2, width: W, height: H, rx: 24, fill: '#15803d', class: 'clase-fh-sombra' }, espalda);
      svg('path', { d: `M${-W / 2} ${-H / 2 + 24} a24 24 0 0 1 24 -24 H${W / 2 - 24} a24 24 0 0 1 24 24 V-60 H${-W / 2} Z`, fill: '#166534' }, espalda);
      T(espalda, 0, -96, X.antidotoCorto.toUpperCase(), { tam: 17, peso: 850, ancla: 'middle', color: '#bbf7d0', espacio: 2 });
      T(espalda, 0, -70, d.nombre, { tam: 18, peso: 700, ancla: 'middle', color: '#dcfce7' });
      d.antidoto.forEach((l, i) => T(espalda, 0, 10 + i * 34 - (d.antidoto.length - 1) * 17, l, { tam: 25, peso: 800, ancla: 'middle', color: '#ffffff' }));
      svg('path', { d: 'M-18 96 L-4 110 L20 84', fill: 'none', stroke: '#ffffff', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, espalda);
      return { g, giro, frente, espalda, x: 640 + (k - 2) * 240 };
    });

    return m => {
      const t = m.t;
      const xa = 640 + ((m.s * 90) % 900);
      mover(av, xa, 150 + Math.sin(m.s * 0.8) * 6, 0.5, 2);
      opacidad(av, xa > 700 && xa < 1260 ? 1 : 0);
      opacidad(alerta, Math.abs(xa - 1000) < 120 ? 1 : 0.2);
      opacidad(vin, m.e(0, 0.04));
      cartas.forEach((ca, k) => {
        const e = ctx.quieto ? { aparece: t >= P.aparecen[k] ? 1 : 0, escala: 1, antidoto: t >= P.antidotos[k] + 0.02 } : estadoActitud(t, P.aparecen[k], P.antidotos[k]);
        mover(ca.g, ca.x, 450 + (1 - e.aparece) * 60, 0.9 + 0.1 * e.aparece);
        opacidad(ca.g, e.aparece);
        ca.giro.setAttribute('transform', `scale(${Math.max(0.01, e.escala).toFixed(3)} 1)`);
        ca.frente.setAttribute('visibility', e.antidoto ? 'hidden' : 'visible');
        ca.espalda.setAttribute('visibility', e.antidoto ? 'visible' : 'hidden');
      });
      void f1;
    };
  });
}
