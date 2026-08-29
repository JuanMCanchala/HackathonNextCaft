"""Configuracion global cargada desde .env."""
import json
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()

# Avisos externos. Los tres son opcionales; sin ellos no se notifica nada.
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
ALERT_WEBHOOK_URL = os.getenv("ALERT_WEBHOOK_URL", "").strip()

# Puente hacia el backend de Convex (convex-backend/). Sin URL ni workspace
# no se envia nada y el pipeline funciona igual que antes.
CONVEX_INTAKE_URL = os.getenv("CONVEX_INTAKE_URL", "").strip()
CONVEX_INTAKE_TOKEN = os.getenv("CONVEX_INTAKE_TOKEN", "").strip()
CONVEX_WORKSPACE_ID = os.getenv("CONVEX_WORKSPACE_ID", "").strip()
# Mapa "etiqueta de camara aqui" -> "id de camara alli", en JSON.
#   CONVEX_CAMERA_IDS={"Entrada":"j57abc...","Almacen":"j57def..."}
try:
    CONVEX_CAMERA_IDS = json.loads(os.getenv("CONVEX_CAMERA_IDS", "{}") or "{}")
except ValueError:
    CONVEX_CAMERA_IDS = {}
# Base publica para que quien reciba el webhook pueda bajar la evidencia.
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip()

SOURCE = os.getenv("SENTINEL_SOURCE", "0").strip()
DOMAIN = os.getenv("SENTINEL_DOMAIN", "retail_theft").strip()
DEVICE = os.getenv("SENTINEL_DEVICE", "cuda").strip()

POSE_MODEL = os.getenv("SENTINEL_POSE_MODEL", "yolo11n-pose.pt").strip()
# Resolucion de inferencia. 480 mantiene FPS utiles en CPU; 640 afina si hay GPU.
POSE_IMGSZ = int(os.getenv("SENTINEL_POSE_IMGSZ", "480"))

# Pixela la cabeza antes de guardar el frame o mandarlo al VLM. Apagado por
# defecto porque degrada la evidencia que se ensena en pantalla; se enciende
# con SENTINEL_BLUR_FACES=1 si hace falta defender la privacidad por diseno.
BLUR_FACES = os.getenv("SENTINEL_BLUR_FACES", "0").strip() in ("1", "true", "yes")

DOMAINS_DIR = ROOT / "backend" / "domains"
DATA_DIR = ROOT / "data"
CLIPS_DIR = DATA_DIR / "clips"
UPLOADS_DIR = DATA_DIR / "uploads"
EVENTS_LOG = DATA_DIR / "events.jsonl"

# Ventana de video que se le manda al VLM alrededor del disparo.
BUFFER_SECONDS = 12.0
CLIP_PRE_SECONDS = 4.0
CLIP_POST_SECONDS = 1.5
CLIP_FPS = 8.0           # ritmo del mp4 del panel; el buffer no guarda mas
VLM_FRAMES = 10          # frames muestreados del clip hacia el VLM
VLM_MAX_WIDTH = 640      # se reescala antes de enviar para bajar tokens
VLM_WORKERS = 2

CLIPS_DIR.mkdir(parents=True, exist_ok=True)

OFFLINE = not bool(GEMINI_API_KEY)
