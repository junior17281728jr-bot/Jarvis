// Marca propia: nombre del programa, frase, dueño, color y logo. Se guarda en la base de datos (no en archivos).
import { getSetting, setSetting } from './db.js';

export const PALETTES = {
  cian: { name: 'Cian', dark: '#38d6f5', light: '#1a6dff' },
  azul: { name: 'Azul', dark: '#6fa0ff', light: '#1a4fd6' },
  violeta: { name: 'Violeta', dark: '#b39bff', light: '#6a46e8' },
  dorado: { name: 'Dorado', dark: '#ffc94d', light: '#9a6400' },
  rosa: { name: 'Rosa', dark: '#ff7cc8', light: '#c02a86' },
  turquesa: { name: 'Turquesa', dark: '#3ee6c4', light: '#00806a' },
};
export const DEFAULT_BRAND = { name: 'JARVIS', tagline: 'Ve lo que la mente humana no alcanza. Y lo prueba.', owner: '', color: 'cian', logo: null, v: 0 };
const MAX_LOGO = 300 * 1024;

const OLD_TAGLINE = 'Tu investigador de bolsa y loterías';
export function getBrand(db) {
  const b = { ...DEFAULT_BRAND, ...getSetting(db, 'global', 'brand', {}) };
  if (b.tagline === OLD_TAGLINE) b.tagline = DEFAULT_BRAND.tagline; // la frase vieja de fábrica pasa a la nueva
  return b;
}

/** Lo que ve cualquiera (también la pantalla de entrada): sin el logo en sí, solo si existe. */
export function publicBrand(db) {
  const b = getBrand(db);
  return { name: b.name, tagline: b.tagline, owner: b.owner, color: b.color, palette: PALETTES[b.color] || PALETTES.cian, hasLogo: !!b.logo, v: b.v, palettes: PALETTES };
}

/** Revisa el logo por su contenido real (no por lo que diga el nombre): solo PNG, JPG o WEBP. */
export function decodeLogo(dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('El logo debe ser una imagen PNG, JPG o WEBP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_LOGO) throw new Error('El logo es muy pesado (máximo 300 KB).');
  const png = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  const type = png ? 'image/png' : jpg ? 'image/jpeg' : webp ? 'image/webp' : null;
  if (!type) throw new Error('El archivo no parece una imagen válida.');
  return { type, buf };
}

export function saveBrand(db, input) {
  const b = getBrand(db);
  const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  if (input.name !== undefined) { const n = clean(input.name, 24); if (!n) throw new Error('El nombre no puede quedar vacío.'); b.name = n; }
  if (input.tagline !== undefined) b.tagline = clean(input.tagline, 60);
  if (input.owner !== undefined) b.owner = clean(input.owner, 40);
  if (input.color !== undefined) { if (!PALETTES[input.color]) throw new Error('Color no válido.'); b.color = input.color; }
  if (input.removeLogo) b.logo = null;
  else if (input.logo) { decodeLogo(input.logo); b.logo = input.logo; }
  b.v = (b.v || 0) + 1;
  setSetting(db, 'global', 'brand', b);
  return publicBrand(db);
}

export function logoFile(db) { const b = getBrand(db); return b.logo ? decodeLogo(b.logo) : null; }

export function manifest(db) {
  const b = getBrand(db);
  return {
    name: b.name, short_name: b.name.slice(0, 12), description: b.tagline || 'Investigador de bolsa y loterías con dinero virtual',
    start_url: '/#inicio', display: 'standalone', background_color: '#070b14', theme_color: '#070b14', lang: 'es',
    icons: b.logo ? [{ src: `/brand/logo?v=${b.v}`, sizes: '512x512', type: decodeLogo(b.logo).type, purpose: 'any' }] : [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  };
}
