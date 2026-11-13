// 0.13.9: «En admin pon mejor la parte de la API así la busco más fácil». La tarjeta «Claude (IA)» del Resumen de
// Administrador (el estado en palabras simples, «Conectar o cambiar la clave» y «Probar (gratis)») y los 3 pasos de la
// pestaña «Claude (API)» (Dinero e IA). Lo que se decide está en public/ia-vista.js (estadoClaude, probado sin navegador).
// Sin librerías; todo texto con textContent y sin estilos en línea. Las piezas llegan de app.js en «h».
import { estadoClaude } from './ia-vista.js';

// Los 3 pasos para conectar la clave (y el de la verificación de identidad, resaltado si la prueba lo pidió).
export function pasosClaude(h, { verificacion = false } = {}) {
  const { el, t } = h;
  return el('div', { class: 'claude-pasos' },
    el('h3', { class: 'con-icono' }, h.icono('llave'), el('span', { texto: t('claude.ayuda.titulo') })),
    el('ol', { class: 'pasos-numerados' }, [1, 2, 3].map(n => el('li', {},
      el('span', { class: 'paso-numero', 'aria-hidden': 'true', texto: String(n) }),
      el('span', { texto: t(`claude.paso${n}`) })))),
    el('p', { class: verificacion ? 'aviso con-icono-arriba' : 'suave chica', texto: t('claude.ayuda.verificacion') }));
}

// La línea grande del estado.
function textoEstado(v, h) {
  const { t } = h;
  if (v.estado === 'conectado') return t('claude.estado.conectado', { usado: h.usd(v.usadoMicro), tope: h.usd(v.topeMicro) });
  if (v.estado === 'no_pasa') return t('claude.estado.no_pasa', { motivo: h.textoMotivoIa(v.motivo) });
  if (v.estado === 'pausada') return t('claude.estado.pausada', { motivo: h.textoMotivoIa(v.motivo) });
  return h.tSi(`claude.estado.${v.estado}`, v.estado);
}

// La tarjeta del Resumen. claves: la respuesta de GET /api/admin/claves (o null); ia: la de GET /api/admin/ia.
export function tarjetaClaude({ claves = null, ia = null } = {}, h) {
  const { el, t } = h;
  const v = estadoClaude({ claves: claves?.ok ? claves.datos : null, ia: ia?.ok ? ia.datos : null });
  const mensaje = el('p', { class: 'mensaje', role: 'status', hidden: true });
  const decir = (texto, clase) => { mensaje.className = `mensaje ${clase}`; mensaje.textContent = texto; mensaje.hidden = false; };
  const botones = [
    el('button', { type: 'button', class: 'boton-3d grande con-icono claude-conectar', onclick: () => h.irAlFormulario() },
      h.icono('llave'), el('span', { texto: t('claude.conectar') })),
  ];
  if (v.id != null && v.estado !== 'ilegible') {
    const texto = el('span', { texto: t('claude.probar') });
    const probar = el('button', {
      type: 'button', class: 'boton-3d blanco con-icono',
      onclick: async () => {
        probar.disabled = true;
        texto.textContent = t('claude.probando');
        // Si estaba en pausa, la misma prueba gratis la reanuda cuando pasa (como «Probar y reanudar» en Claves).
        const x = await h.api('POST', `/api/admin/claves/${v.id}/probar`, { reanudar: v.pausada === true });
        probar.disabled = false;
        texto.textContent = t('claude.probar');
        if (!x.ok) return decir(h.textoError(x.datos.error), 'error');
        const m = x.datos.prueba?.motivo;
        if (m === 'ok') { decir(t('claude.prueba.ok'), 'bien'); setTimeout(() => h.recargar(), 1200); return; }
        decir(m === 'verificacion_identidad' ? t('claude.prueba.verificacion') : t('claude.prueba.mal', { motivo: h.textoMotivoIa(m) }), 'aviso');
      },
    }, h.icono('actualizar'), texto);
    botones.push(probar);
  }
  const detalle = v.estado === 'conectado'
    ? (v.iaEncendida ? null : el('p', { class: 'aviso con-icono-arriba' }, h.icono('info', 'icono chico'), el('span', { texto: t('claude.detalle.ia_apagada') }), el('a', { href: '#ia', class: 'enlace-claude', texto: t('ia.abrir') })))
    : el('p', { class: 'suave', texto: h.tSi(`claude.detalle.${v.estado}`, '') });
  return el('section', { class: `tarjeta tarjeta-claude ancha tono-${v.tono}`, 'aria-labelledby': 'titulo-claude' },
    el('h2', { class: 'con-icono', id: 'titulo-claude' }, h.icono('chispa', 'icono grande'), el('span', { texto: t('claude.titulo') })),
    el('p', { class: 'claude-estado' }, h.icono(v.estado === 'conectado' ? 'bien' : v.tono === 'atencion' ? 'atencion' : v.tono === 'mal' ? 'mal' : 'info'), el('strong', { texto: textoEstado(v, h) })),
    v.final ? el('p', { class: 'suave chica', texto: t('claves.termina', { final: v.final }) }) : null,
    detalle,
    el('div', { class: 'botones claude-botones' }, botones),
    mensaje);
}
