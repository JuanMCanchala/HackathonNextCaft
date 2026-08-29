#!/usr/bin/env bash
# Instalador de Sentra para Linux y macOS.
#
# Equivalente de instalar.ps1: deja el motor de vision listo en una maquina
# nueva -entorno de Python, dependencias, modelo de pose y configuracion- y lo
# arranca.
#
#     ./instalar.sh              instala y arranca
#     ./instalar.sh --solo-modelo
#     ./instalar.sh --no-arrancar
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELO="yolo11n-pose.pt"
URL_MODELO="https://github.com/ultralytics/assets/releases/download/v8.3.0/$MODELO"
PANEL="https://sentra-ehtdxel9x-juanmcanchalas-projects.vercel.app/app/live"

SOLO_MODELO=0
NO_ARRANCAR=0
for arg in "$@"; do
  case "$arg" in
    --solo-modelo) SOLO_MODELO=1 ;;
    --no-arrancar) NO_ARRANCAR=1 ;;
  esac
done

paso()  { printf '\n\033[36m>> %s\033[0m\n' "$1"; }
bien()  { printf '   \033[32m%s\033[0m\n' "$1"; }
aviso() { printf '   \033[33m%s\033[0m\n' "$1"; }

# --- Modelo de pose ------------------------------------------------------
paso "Modelo de deteccion de pose"
if [ -f "$RAIZ/$MODELO" ]; then
  bien "$MODELO ya esta aqui"
else
  echo "   Descargando $MODELO (~6 MB)..."
  curl -fsSL "$URL_MODELO" -o "$RAIZ/$MODELO"
  bien "descargado"
fi
[ "$SOLO_MODELO" = "1" ] && { printf '\nListo. El modelo esta en %s\n' "$RAIZ/$MODELO"; exit 0; }

# --- Python --------------------------------------------------------------
paso "Entorno de Python"
PY="$RAIZ/.venv/bin/python"
if [ -x "$PY" ]; then
  bien "el entorno .venv ya existe"
else
  command -v python3 >/dev/null || { echo "Falta python3. Instalalo y vuelve a ejecutar esto."; exit 1; }
  python3 -m venv "$RAIZ/.venv"
  bien "entorno creado en .venv"
fi

paso "Dependencias"
echo "   Esto tarda unos minutos la primera vez (torch pesa)."
"$PY" -m pip install --upgrade pip --quiet
"$PY" -m pip install -r "$RAIZ/requirements.txt" --quiet
bien "instaladas"

# --- Configuracion -------------------------------------------------------
paso "Configuracion"
if [ -f "$RAIZ/.env" ]; then
  bien ".env ya existe, no se toca"
else
  cat > "$RAIZ/.env" <<'ENVEOF'
# Clave de Gemini para el verificador. Sin ella el filtro geometrico funciona
# igual, pero nadie confirma las detecciones.
# Se saca en https://aistudio.google.com/apikey
GEMINI_API_KEY=

# Camara: 0 es la webcam del equipo. Tambien admite una URL rtsp:// o varias
# separadas por coma, con nombre:  Entrada=0,Almacen=rtsp://...
SOURCE=0

# Vertical activa al arrancar: violence, retail_theft, fall_detection o
# industrial_safety.
DOMAIN=violence

# Enviar los incidentes confirmados a Sentra en la nube. Opcional: sin esto
# el motor funciona solo, con su panel local.
# CONVEX_INTAKE_URL=https://adventurous-wolf-401.convex.site/intake
# CONVEX_INTAKE_TOKEN=
# CONVEX_WORKSPACE_ID=
# CONVEX_CAMERA_IDS={"Entrada":"<id de la camara en Sentra>"}
ENVEOF
  bien ".env creado"
  aviso "Pon tu GEMINI_API_KEY en .env para que el verificador funcione."
fi

# --- Comprobacion --------------------------------------------------------
paso "Comprobacion"
"$PY" -m tools.selftest 2>&1 | tail -3

[ "$NO_ARRANCAR" = "1" ] && { printf '\n\033[32mInstalado. Para arrancar:  %s -m uvicorn backend.main:app --port 8000\033[0m\n' "$PY"; exit 0; }

# --- Arranque ------------------------------------------------------------
paso "Arrancando el motor"
"$PY" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 >/tmp/sentra.log 2>&1 &
MOTOR=$!

for _ in $(seq 1 30); do
  sleep 2
  if curl -fsS http://127.0.0.1:8000/api/state >/dev/null 2>&1; then
    printf '\n\033[32mSentra esta funcionando.\033[0m\n\n'
    printf '  Motor local     http://localhost:8000\n'
    printf '  Panel Sentra    %s\n\n' "$PANEL"
    printf '  \033[90mEl panel se conecta solo al motor de esta maquina. Abre "En vivo"\033[0m\n'
    printf '  \033[90mpara ver la camara y probar con un clip de la carpeta prueba/.\033[0m\n\n'
    printf '  \033[90mPara parar:  kill %s\033[0m\n' "$MOTOR"
    exit 0
  fi
done

printf '\n\033[33mEl motor no respondio a tiempo. El log esta en /tmp/sentra.log\033[0m\n'
exit 1
