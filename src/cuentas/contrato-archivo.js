// 0.12.8 (pedido del dueño): un contrato firmado como UN archivo para mandarlo al Telegram del dueño. No hay generador de
// PDF en el servidor (cero dependencias), así que es una página HTML completa y sola: el texto de esa versión de los
// términos y del aviso de privacidad, lo que aceptó, la firma dibujada (y la del tutor) dentro del mismo archivo, la
// fecha, la IP, el navegador y las huellas. Se abre en el teléfono y se imprime como PDF desde ahí. El archivo de la app
// (Administrador → Contratos firmados) sigue siendo la fuente: este es una copia.
//  - Todo lo que viene de una persona o del texto va escapado (nunca se arma HTML con texto sin escapar).
//  - Nombre: «contrato-<usuario>-v<versión>-<fecha>.html» (solo letras simples).
import { contrato, pngDeFirma } from './terminos.js';
import { frase, fechaRd } from '../canales/textos.js';

const esc = texto => String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const diaRd = iso => new Date(Date.parse(iso) - 4 * 3_600_000).toISOString().slice(0, 10);
const ESTILO = `body{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;color:#1d2433;line-height:1.5}
h1{font-size:1.35rem;margin:.2rem 0}h2{font-size:1.1rem;margin:1.4rem 0 .4rem;border-bottom:1px solid #d6dbe4;padding-bottom:.2rem}
h3{font-size:1rem;margin:1rem 0 .2rem}table{border-collapse:collapse;width:100%;margin:.6rem 0}th,td{text-align:left;vertical-align:top;padding:.35rem .4rem;border-bottom:1px solid #e3e7ee}
th{width:38%;font-weight:600}.firma{border:1px solid #c8ced9;border-radius:8px;padding:.5rem;text-align:center;margin:.6rem 0}.firma img{max-width:100%;height:auto}
.suave{color:#5b6578;font-size:.9rem}.huella{word-break:break-all;font-family:ui-monospace,Menlo,monospace;font-size:.8rem}p{white-space:pre-wrap}`;

export function nombreArchivoContrato(c) {
  const usuario = String(c.usuario ?? `u${c.usuarioId}`).toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 40) || 'alumno';
  return `contrato-${usuario}-v${Number(c.version)}-${diaRd(c.en)}.html`;
}

// → { nombre, datos: Buffer, contrato } o lanza ErrorHttp(404) si no existe.
export function archivoContrato(db, config, usuarioId, n, idioma = 'es') {
  const c = contrato(db, config, usuarioId, n);
  const f = (clave, v) => esc(frase(idioma, clave, v));
  const png = pngDeFirma(db, config, usuarioId, n);
  const pngTutor = c.tutor ? pngDeFirma(db, config, usuarioId, n, { tutor: true }) : null;
  const img = (datos, alt) => (datos ? `<img src="data:image/png;base64,${datos.toString('base64')}" alt="${esc(alt)}">` : `<p class="suave">${f('contratos.sin_dibujo')}</p>`);
  const fila = (k, v, clase = '') => `<tr><th scope="row">${k}</th><td${clase ? ` class="${clase}"` : ''}>${esc(v)}</td></tr>`;
  const doc = d => (d?.secciones ?? []).map((s, i) => `<h3>${/^\d+[.)]/.test(s.titulo) ? '' : `${i + 1}. `}${esc(s.titulo)}</h3><p>${esc(s.texto)}</p>`).join('\n');
  const fecha = `${fechaRd(c.en, idioma)} (${c.en})`;
  const huella = (x, ok) => (x ? `${x} ${ok ? '✓' : '✗'}` : '—');
  const html = `<!doctype html>
<html lang="${idioma === 'en' ? 'en' : 'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${frase(idioma, 'contratos.documento')} · ${c.firmado}`)}</title><style>${ESTILO}</style></head>
<body><article>
<h1>${f('contratos.documento')}</h1>
<p class="suave">${f('contratos.estado_firmado', { fecha: fechaRd(c.en, idioma) })} · ${f('contratos.versiones', { t: c.version, p: c.versionPrivacidad ?? '—' })} · @${esc(c.usuario ?? '—')} · ${f('contratos.firma_n', { n: c.n })}</p>
<table><caption class="suave">${f('contratos.resumen')}</caption><tbody>
${fila(f('contratos.firmado_por'), c.firmado)}
${fila(f('contratos.fecha'), fecha)}
${fila(f('terminos.titulo'), frase(idioma, 'terminos.version', { n: c.version }))}
${c.versionPrivacidad ? fila(f('privacidad.titulo'), frase(idioma, 'terminos.version', { n: c.versionPrivacidad })) : ''}
${c.aceptoIa != null ? fila(f('contratos.ia'), frase(idioma, c.aceptoIa ? 'firma.listo.ia.si' : 'firma.listo.ia.no')) : ''}
${c.tutor ? fila(f('terminos.tutor.titulo'), `${c.tutor.nombre} (${c.tutor.relacion})`) : ''}
</tbody></table>
<h2>${f('terminos.titulo')}</h2>
${doc(c.terminos)}
${c.privacidad ? `<h2>${f('privacidad.titulo')}</h2>\n${doc(c.privacidad)}` : ''}
<h2>${f('contratos.lo_que_acepto')}</h2>
<p>${esc(c.declaracion)}</p>
<p>☑ ${f('terminos.yo_acepto', { nombre: c.firmado, n: c.version })}</p>
${c.versionPrivacidad ? `<p>☑ ${f('terminos.acepto_privacidad', { n: c.versionPrivacidad })}</p>` : ''}
${c.aceptoIa != null ? `<p>${c.aceptoIa ? '☑' : '☐'} ${f('terminos.acepto_ia')}</p>` : ''}
<div class="firma">${img(png, frase(idioma, 'contratos.firma_de', { nombre: c.firmado }))}<p>${esc(c.firmado)} · ${esc(fechaRd(c.en, idioma))}</p></div>
${c.tutor ? `<div class="firma">${img(pngTutor, frase(idioma, 'contratos.firma_de', { nombre: c.tutor.nombre }))}<p>${esc(c.tutor.nombre)}</p></div>
<p>☑ ${f('terminos.tutor.acepto')}</p><p>${f('contratos.tutor', { nombre: c.tutor.nombre, relacion: c.tutor.relacion, contacto: c.tutor.contacto })}</p>` : ''}
<h2>${f('contratos.datos_firma')}</h2>
<table><tbody>
${fila(f('contratos.fecha'), fecha)}
${fila(f('contratos.usuario'), `@${c.usuario ?? '—'} (id ${c.usuarioId})`)}
${fila(f('terminos.nacimiento'), c.nacimiento ? `${c.nacimiento}${c.menor ? ` · ${frase(idioma, 'contratos.menor')}` : ''}` : '—')}
${fila('IP', c.ip ?? '—')}
${fila(f('contratos.navegador'), c.navegador ?? '—')}
${fila(f('contratos.huella_texto'), huella(c.textoSha256, c.textoVerificado), 'huella')}
${fila(f('contratos.huella_privacidad'), huella(c.privacidadSha256, c.privacidadVerificada), 'huella')}
${fila(f('contratos.huella_firma'), huella(c.firmaSha256, c.firmaVerificada), 'huella')}
</tbody></table>
<p class="suave">${f('contratos.pie')}</p>
</article></body></html>
`;
  return { nombre: nombreArchivoContrato(c), datos: Buffer.from(html, 'utf8'), contrato: c };
}
