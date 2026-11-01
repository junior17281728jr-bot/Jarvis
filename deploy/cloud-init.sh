#!/bin/bash
# JARVIS: instalación automática al crear la máquina en Oracle Cloud. No hace falta computadora:
# se pega en "Cloud-init script" al crear la instancia y todo se instala solo (unos 10 minutos).
# Antes de pegarlo, cambia PEGA_AQUI por tu clave de Tailscale (empieza con tskey-auth-).
TS_AUTHKEY="PEGA_AQUI"
REPO="junior17281728jr-bot/jarvis"

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
  tailscale serve --bg 8080 || true
fi
set -x

# Actualizaciones automáticas de seguridad del sistema
apt-get install -y unattended-upgrades || true

curl -fsS http://127.0.0.1:8080/api/setup && echo "JARVIS LISTO"
