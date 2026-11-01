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

# Si la app de Google Cloud no dio permiso a la terminal, se pide con un enlace CORTO (fácil de tocar en el celular).
# El pedido de permiso queda vivo aparte: si la pantalla se desconecta al ir a Safari, pegar el MISMO comando
# otra vez muestra el mismo enlace y pide el código, sin empezar de cero.
login_short() {
  local ST="$HOME/.jarvis-login"; mkdir -p "$ST"
  local pid=""; [ -f "$ST/pid" ] && pid=$(cat "$ST/pid")
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$ST"/*; mkfifo "$ST/in"
    # 'script' le da pantalla propia; el tubo 'in' se queda abierto para recibir el código cuando vuelvas
    setsid nohup bash -c 'exec 3<>"$1/in"; exec script -qfec "gcloud auth login --no-launch-browser" /dev/null <&3 >"$1/log" 2>&1' _ "$ST" >/dev/null 2>&1 &
    echo $! > "$ST/pid"; pid=$!
  fi
  echo
  echo "== Google necesita que confirmes que eres tú (solo esta vez)"
  local url="" t0=$SECONDS
  while [ -z "$url" ] && [ $((SECONDS - t0)) -lt 90 ] && kill -0 "$pid" 2>/dev/null; do
    if [ ! -f "$ST/y" ] && grep -q '(Y/n)' "$ST/log" 2>/dev/null; then echo Y > "$ST/in"; touch "$ST/y"; fi
    url=$(grep -ao 'https://accounts.google.com[^[:space:]]*' "$ST/log" 2>/dev/null | head -1 || true)
    [ -n "$url" ] || sleep 1
  done
  if [ -z "$url" ]; then echo "❌ No pude pedir el permiso. Mándale una captura a Claude:"; tail -5 "$ST/log" 2>/dev/null; rm -rf "$ST"; exit 1; fi
  local short=""
  if [ -f "$ST/short" ]; then short=$(cat "$ST/short"); else
    local enc; enc=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$url")
    short=$(curl -fsS -m 10 "https://tinyurl.com/api-create.php?url=$enc" 2>/dev/null || true)
    [[ "$short" == https://* ]] || short=$(curl -fsS -m 10 "https://is.gd/create.php?format=simple&url=$enc" 2>/dev/null || true)
    [[ "$short" == https://* ]] || short="$url"
    echo "$short" > "$ST/short"
  fi
  echo
  echo "👉 1) Toca este enlace (o escríbelo en Safari):"
  echo
  echo "      $short"
  echo
  echo "👉 2) Elige tu Gmail y toca Permitir. Copia el código que te da Google."
  echo "      Si al volver esta pantalla se desconectó, pega otra vez el MISMO comando: te vuelve a pedir el código."
  echo
  local code=""
  local line="" more=""
  while [ -z "$code" ]; do read -r -p "👉 3) Pega aquí el código y toca Intro: " line </dev/tty; code="${line//[[:space:]]/}"; done
  # Si al pegar el código llegó partido en varias líneas, junta los pedazos
  while IFS= read -r -t 2 more </dev/tty; do code+="${more//[[:space:]]/}"; done
  echo "   Código recibido (${#code} letras). Revisando con Google…"
  echo "$code" > "$ST/in"
  t0=$SECONDS; while kill -0 "$pid" 2>/dev/null && [ $((SECONDS - t0)) -lt 60 ]; do sleep 1; done
  ACC=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)
  if [ -z "$ACC" ]; then
    echo "❌ Google no aceptó el código. Pega otra vez el comando: te doy un enlace nuevo."
    grep -a -i error "$ST/log" | tail -2 || true
    kill "$pid" 2>/dev/null || true; rm -rf "$ST"; exit 1
  fi
  rm -rf "$ST"
  gcloud config set account "$ACC" >/dev/null
  gcloud config set project "$PROJECT" >/dev/null
  echo "✅ Listo, ya tengo permiso como $ACC"
}
ACC0=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1 || true)
if [ -z "$ACC0" ] || ! gcloud auth print-access-token >/dev/null 2>&1; then login_short; fi

echo "== 2/4 Activando Compute Engine (la primera vez tarda 1 o 2 minutos)"
if ! gcloud services enable compute.googleapis.com 2>"${TMPDIR:-/tmp}/jv-err"; then
  cat "${TMPDIR:-/tmp}/jv-err"
  if grep -qiE 'active account|credentials|auth login|reauth' "${TMPDIR:-/tmp}/jv-err"; then
    login_short
    gcloud services enable compute.googleapis.com
  else
    exit 1
  fi
fi

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
