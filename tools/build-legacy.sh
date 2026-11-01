#!/bin/bash
# Genera public/app.legacy.js (para TVs y navegadores viejos) a partir de public/app.js.
# Se corre en la computadora de desarrollo cada vez que cambia app.js; la prueba test/legacy.test.js avisa si se olvidó.
set -euo pipefail
cd "$(dirname "$0")/.."
ESB="${ESBUILD:-$(command -v esbuild || echo /opt/npm-tools/node_modules/.bin/esbuild)}"
HASH=$(sha256sum public/app.js | cut -c1-16)
{ echo "/* JARVIS versión para navegadores viejos. Generado desde app.js ($HASH). No editar a mano: corre tools/build-legacy.sh */"
  cat tools/legacy-polyfills.js
  "$ESB" public/app.js --target=chrome56 --format=iife --log-level=warning --legal-comments=none
} > public/app.legacy.js
echo "Listo: public/app.legacy.js ($HASH)"
