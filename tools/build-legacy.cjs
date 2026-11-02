// Genera la versión de JARVIS para TVs y navegadores viejos (ej. TV Samsung 2017, motor Chromium 47):
//  - public/app.legacy.js: app.js convertido a JavaScript antiguo (ES5) + ayudas (polyfills)
//  - public/styles.legacy.css: los colores con variables ya resueltos (los navegadores viejos no entienden var(--x))
// Se corre en la computadora de desarrollo cada vez que cambia app.js o styles.css:  node tools/build-legacy.cjs
// La prueba test/legacy.test.js avisa si se olvidó (y sin pruebas en verde el servidor no se actualiza).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const tsPath = process.env.TYPESCRIPT || ['/opt/npm-tools/node_modules/typescript', 'typescript'].find(p => { try { require.resolve(p); return true; } catch { return false; } });
const ts = require(tsPath);
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 16);

// 0) Variables de color (tema oscuro)
const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');
const vars = {};
const grab = re => { const m = css.match(re); if (m) for (const d of m[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim(); };
// Variables de cualquier regla (por ejemplo las del Modo TV); las de :root y tema oscuro mandan
for (const m of css.matchAll(/\{([^{}]*)\}/g)) for (const d of m[1].matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) if (!(d[1] in vars)) vars[d[1]] = d[2].trim();
grab(/:root\s*\{([^}]*)\}/); grab(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
const resolve = (v, depth = 0) => depth > 8 ? v : v.replace(/var\(\s*--([\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, n, fb) => resolve(vars[n] ?? (fb ? fb.trim() : 'initial'), depth + 1));

// 1) JavaScript
const src = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.None, downlevelIteration: true, removeComments: true, ignoreDeprecations: '6.0' } });
const js = `/* JARVIS versión para navegadores viejos. Generado desde app.js (${hash('public/app.js')}). No editar a mano: node tools/build-legacy.cjs */\n`
  + fs.readFileSync(path.join(__dirname, 'legacy-polyfills.js'), 'utf8') + '\n(function () {\n' + resolve(out.outputText) + '\n})();\n';
fs.writeFileSync(path.join(root, 'public/app.legacy.js'), js);

// 2) CSS sin variables (tema oscuro, que es el de la TV)
const { convertCss } = require('./legacy-css.cjs');
const legacyCss = `/* Para navegadores viejos (colores resueltos, grid → flexbox). Generado desde styles.css (${hash('public/styles.css')}). */\n`
  + convertCss(resolve(css.replace(/:root(\[data-theme="\w+"\])?\s*\{[^}]*\}/g, '')).replace(/color-mix\([^;]*\)/g, 'transparent'));
fs.writeFileSync(path.join(root, 'public/styles.legacy.css'), legacyCss);
console.log(`Listo: app.legacy.js (${hash('public/app.js')}) y styles.legacy.css (${hash('public/styles.css')})`);
