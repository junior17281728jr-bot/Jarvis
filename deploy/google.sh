#!/bin/bash
# Crea el servidor gratis de JARVIS en Google Cloud. Se pega UNA vez en Cloud Shell:
#   curl -fsSL https://raw.githubusercontent.com/junior17281728jr-bot/Jarvis/main/deploy/google.sh | bash -s -- TU_CLAVE_DE_TAILSCALE
# Usa solo lo del nivel gratis: e2-micro en us-east1 (Carolina del Sur), disco estándar de 30 GB.
set -euo pipefail
KEY="${1:-}"
REPO_RAW="https://raw.githubusercontent.com/junior17281728jr-bot/Jarvis/main"
ZONE="us-east1-b"

if [[ "$KEY" != tskey-auth-* ]]; then echo "❌ Falta tu clave de Tailscale al final del comando (empieza con tskey-auth-)."; exit 1; fi

echo "== 1/4 Buscando tu proyecto"
PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  PROJECT="$(gcloud projects list --format='value(projectId)' --limit=1 2>/dev/null || true)"
fi
if [ -z "$PROJECT" ]; then
  PROJECT="jarvis-$(date +%s | tail -c 7)"
  echo "   No tenías proyecto: creo $PROJECT"
  gcloud projects create "$PROJECT" --name="JARVIS"
  BILLING="$(gcloud billing accounts list --filter=open=true --format='value(name)' --limit=1)"
  [ -n "$BILLING" ] || { echo "❌ Tu cuenta no tiene facturación activa. Termina el registro de la prueba gratis y vuelve a pegar el comando."; exit 1; }
  gcloud billing projects link "$PROJECT" --billing-account="$BILLING"
fi
gcloud config set project "$PROJECT" >/dev/null
echo "   Proyecto: $PROJECT"

echo "== 2/4 Activando Compute Engine (la primera vez tarda 1 o 2 minutos)"
gcloud services enable compute.googleapis.com

echo "== 3/4 Preparando la instalación automática"
TMP="$(mktemp)"
curl -fsSL "$REPO_RAW/deploy/cloud-init.sh" | sed "s|^TS_AUTHKEY=\"PEGA_AQUI\"|TS_AUTHKEY=\"$KEY\"|" > "$TMP"
grep -q "^TS_AUTHKEY=\"$KEY\"" "$TMP" || { echo "❌ No pude preparar el script de instalación."; exit 1; }

echo "== 4/4 Creando el servidor 'jarvis' (gratis: e2-micro, us-east1, disco estándar de 30 GB)"
if gcloud compute instances describe jarvis --zone "$ZONE" >/dev/null 2>&1; then
  echo "   Ya existe un servidor llamado jarvis: no creo otro."
else
  gcloud compute instances create jarvis \
    --zone="$ZONE" --machine-type=e2-micro \
    --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-standard \
    --metadata-from-file=startup-script="$TMP"
fi
rm -f "$TMP"

echo
echo "✅ LISTO. El servidor se está instalando solo (10 a 15 minutos)."
echo "   Luego abre la app Tailscale en tu celular: aparecerá 'jarvis'."
echo "   Y en Safari abre:  http://jarvis:8080"
