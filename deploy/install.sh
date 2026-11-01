#!/usr/bin/env bash
# Instalador de JARVIS para un servidor Ubuntu (Oracle Cloud Always Free, ARM o Intel).
# Uso: sube la carpeta de JARVIS al servidor y ejecuta:  sudo bash deploy/install.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
echo "== 1/6 Paquetes del sistema"
apt-get update -y
apt-get install -y curl ca-certificates unzip

echo "== 2/6 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== 3/6 Usuario y carpetas (el programa y los datos van separados)"
id jarvis >/dev/null 2>&1 || useradd --system --home /var/lib/jarvis --shell /usr/sbin/nologin jarvis
mkdir -p /opt/jarvis /var/lib/jarvis/backups
# Copia el programa sin tocar datos existentes
cp -r "$SRC/src" "$SRC/public" "$SRC/deploy" "$SRC/package.json" "$SRC/GUIA.md" /opt/jarvis/
[ -f /opt/jarvis/.env ] || cp "$SRC/.env.example" /opt/jarvis/.env
chown -R jarvis:jarvis /var/lib/jarvis
chown root:jarvis /opt/jarvis/.env && chmod 640 /opt/jarvis/.env

echo "== 4/6 Pruebas automáticas antes de activar"
cp -r "$SRC/test" /tmp/jarvis-test && cd /opt/jarvis && cp -r /tmp/jarvis-test ./test
node --no-warnings --test test/*.test.js | tail -5
rm -rf /opt/jarvis/test /tmp/jarvis-test

echo "== 5/6 Servicio que arranca solo y se reinicia si falla"
cp /opt/jarvis/deploy/jarvis.service /etc/systemd/system/jarvis.service
systemctl daemon-reload
systemctl enable --now jarvis
sleep 2; systemctl --no-pager status jarvis | head -5

echo "== 6/6 Modelo gratis (opcional)"
# Sin preguntas si se pasa OLLAMA=si o OLLAMA=no (útil para instalar a distancia)
r="${OLLAMA:-}"
if [ -z "$r" ] && [ -t 0 ]; then read -r -p "¿Instalar el modelo gratis (Ollama, ~2 GB)? [s/N] " r; fi
if [[ "$r" =~ ^([sS]|si|sí)$ ]]; then
  curl -fsSL https://ollama.com/install.sh | sh
  ollama pull qwen2.5:3b
fi

echo
echo "Listo. Ahora:"
echo "  1) Edita las claves:  sudo nano /opt/jarvis/.env   y luego: sudo systemctl restart jarvis"
echo "  2) Acceso desde tu celular y tu Mac (privado y seguro):  ver GUIA.md, sección Tailscale"
echo "  3) Copia externa (opcional):  sudo apt install -y rclone && sudo -u jarvis rclone config"
