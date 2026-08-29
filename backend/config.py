"""Configuracion global cargada desde .env."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()

SOURCE = os.getenv("SENTINEL_SOURCE", "0").strip()
DOMAIN = os.getenv("SENTINEL_DOMAIN", "retail_theft").strip()
DEVICE = os.getenv("SENTINEL_DEVICE", "cuda").strip()

POSE_MODEL = os.getenv("SENTINEL_POSE_MODEL", "yolo11n-pose.pt").strip()
# Resolucion de inferencia. 480 mantiene FPS utiles en CPU; 640 afina si hay GPU.
POSE_IMGSZ = int(os.getenv("SENTINEL_POSE_IMGSZ", "480"))
# Resolucion de inferencia. 480 mantiene FPS utiles en CPU; 640 afina en GPU.
POSE_IMGSZ = int(os.getenv("SENTINEL_POSE_IMGSZ", "480"))

DOMAINS_DIR = ROOT / "backend" / "domains"
DATA_DIR = ROOT / "data"
CLIPS_DIR = DATA_DIR / "clips"
EVENTS_LOG = DATA_DIR / "events.jsonl"

# Ventana de video que se le manda al VLM alrededor del disparo.
BUFFER_SECONDS = 12.0
CLIP_PRE_SECONDS = 4.0
CLIP_POST_SECONDS = 1.5
VLM_FRAMES = 10          # frames muestreados del clip hacia el VLM
VLM_MAX_WIDTH = 640      # se reescala antes de enviar para bajar tokens
VLM_WORKERS = 2

CLIPS_DIR.mkdir(parents=True, exist_ok=True)

OFFLINE = not bool(GEMINI_API_KEY)
