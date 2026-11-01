#!/bin/bash
# JARVIS: instalación automática al crear la máquina en Oracle Cloud. No hace falta computadora:
# se pega en "Cloud-init script" al crear la instancia y todo se instala solo (unos 10 minutos).
# Antes de pegarlo, cambia PEGA_AQUI por tu clave de Tailscale (empieza con tskey-auth-).
TS_AUTHKEY="PEGA_AQUI"
REPO="junior17281728jr-bot/jarvis"

# En Google Cloud este script corre en cada arranque: si ya se instaló, no hace nada
[ -f /var/lib/jarvis/.instalado ] && exit 0
exec > /var/log/jarvis-install.log 2>&1
set -eux
export DEBIAN_FRONTEND=noninteractive

# Memoria de apoyo para las máquinas pequeñas (1 GB)
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 2000 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update -y
apt-get install -y curl ca-certificates tar

# Descarga el programa (reintenta por si la red tarda en arrancar)
mkdir -p /root/jarvis-src && cd /root/jarvis-src
for i in 1 2 3 4 5 6; do curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/main" -o jarvis.tgz && break; sleep 20; done
tar xzf jarvis.tgz --strip-components=1

# Instala Node, crea el usuario, corre las pruebas y deja el servicio encendido
OLLAMA=no bash deploy/install.sh

# Escucha solo dentro de tu red privada (Tailscale). Oracle sigue bloqueando el internet público.
sed -i 's/^HOST=.*/HOST=0.0.0.0/' /opt/jarvis/.env
systemctl restart jarvis

# Tailscale: tu red privada para entrar desde el celular, la Mac o tu amigo
curl -fsSL https://tailscale.com/install.sh | sh
iptables -I INPUT -i tailscale0 -j ACCEPT || true
(command -v netfilter-persistent && netfilter-persistent save) || true
set +x  # la clave de Tailscale no se escribe en el registro
if [ "$TS_AUTHKEY" != "PEGA_AQUI" ]; then
  tailscale up --authkey="$TS_AUTHKEY" --hostname=jarvis --ssh
fi
set -x

# Enlace público https (Tailscale Funnel) para abrirlo en la TV o cualquier navegador.
# El primer usuario solo se puede crear desde tu red privada (Tailscale); después todo pide contraseña.
grep -q '^SETUP_TAILNET_ONLY=' /opt/jarvis/.env || echo 'SETUP_TAILNET_ONLY=1' >> /opt/jarvis/.env
systemctl restart jarvis
cat > /usr/local/bin/jarvis-enlace <<'SH'
#!/bin/bash
# Activa el enlace público si Tailscale lo permite y lo guarda para que JARVIS lo muestre en Ajustes
OUT=/var/lib/jarvis/public-url.txt
if ! tailscale funnel status 2>/dev/null | grep -q 'Funnel on'; then
  timeout 25 tailscale funnel --bg 8080 >/var/lib/jarvis/funnel.log 2>&1 || timeout 25 tailscale serve --bg 8080 >/dev/null 2>&1 || true
fi
if tailscale funnel status 2>/dev/null | grep -q 'Funnel on'; then
  NAME=$(tailscale status --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
  [ -n "$NAME" ] && echo "https://$NAME" > "$OUT" && chmod 644 "$OUT"
else
  rm -f "$OUT"
fi
SH
chmod 755 /usr/local/bin/jarvis-enlace
echo '*/10 * * * * root /usr/local/bin/jarvis-enlace' > /etc/cron.d/jarvis-enlace
/usr/local/bin/jarvis-enlace || true

# Actualizaciones automáticas de seguridad del sistema
apt-get install -y unattended-upgrades || true

curl -fsS http://127.0.0.1:8080/api/setup && touch /var/lib/jarvis/.instalado && echo "JARVIS LISTO"
