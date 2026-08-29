"""Etapa 3: persistencia de incidentes, clip de evidencia y feedback humano."""
from __future__ import annotations

import json
import shutil
import subprocess
import threading
import time
import uuid

import cv2
import numpy as np

from .. import config
from .schemas import Event


def write_frames(frames: list[np.ndarray], event_id: str) -> list[str]:
    """Guarda la evidencia como JPEG sueltos, no como video.

    OpenCV en Windows solo consigue escribir mp4v, que Chrome no reproduce: el
    clip se veria en negro. Una tira de frames que el navegador anima siempre
    funciona, y ademas deja al operador ir fotograma a fotograma.
    """
    names: list[str] = []
    for i, frame in enumerate(frames):
        name = f"{event_id}_{i:02d}.jpg"
        if cv2.imwrite(str(config.CLIPS_DIR / name), frame,
                       [cv2.IMWRITE_JPEG_QUALITY, 82]):
            names.append(name)
    return names


def write_clip(frames: list[np.ndarray], event_id: str, fps: float = 8.0) -> str | None:
    """Escribe el clip completo como mp4 reproducible en un navegador.

    Esto es lo que ve el operador cuando abre el incidente; la tira de JPEG de
    `write_frames` sigue siendo la evidencia para el VLM y el GIF del correo.

    El codec es el motivo de que aqui haya un subproceso y no un
    `cv2.VideoWriter`: OpenCV en Windows solo consigue escribir mp4v, que
    Chrome no reproduce, y el clip se veria en negro. H.264 via ffmpeg si se
    reproduce en todas partes. Se usa el binario que trae `imageio-ffmpeg`
    para no depender de que ffmpeg este instalado en la maquina; si no esta,
    se cae al del PATH y, si tampoco, se devuelve None y el incidente se
    guarda igual sin video.

    `faststart` mueve el indice al principio del fichero: sin eso el navegador
    tiene que descargarlo entero antes de empezar a reproducir.
    """
    if len(frames) < 2:
        return None

    exe = _ffmpeg_exe()
    if exe is None:
        return None

    alto, ancho = frames[0].shape[:2]
    # ffmpeg rechaza dimensiones impares con yuv420p, que es el unico formato
    # que reproducen todos los navegadores.
    ancho -= ancho % 2
    alto -= alto % 2
    name = f"{event_id}.mp4"
    destino = config.CLIPS_DIR / name

    cmd = [
        exe, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{ancho}x{alto}", "-r", f"{fps}",
        "-i", "pipe:0",
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(destino),
    ]
    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for frame in frames:
            proc.stdin.write(np.ascontiguousarray(frame[:alto, :ancho]).tobytes())
        proc.stdin.close()
        proc.wait(timeout=60)
    except (OSError, subprocess.SubprocessError):
        destino.unlink(missing_ok=True)
        return None

    return name if destino.exists() and destino.stat().st_size > 0 else None


def _ffmpeg_exe() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:                                   # noqa: BLE001
        return shutil.which("ffmpeg")


class EventStore:
    """Guarda en memoria para la UI y en JSONL para poder medir despues."""

    def __init__(self, limit: int = 200):
        self._events: dict[str, Event] = {}
        self._order: list[str] = []
        self._limit = limit
        self._lock = threading.Lock()

    def create(self, domain: str, track_id: int, score: float, signals: dict) -> Event:
        event = Event(
            id=uuid.uuid4().hex[:10],
            domain=domain,
            track_id=track_id,
            created_at=time.time(),
            gate_score=round(score, 3),
            signals={k: round(v, 3) for k, v in signals.items()},
        )
        with self._lock:
            self._events[event.id] = event
            self._order.append(event.id)
            while len(self._order) > self._limit:
                self._events.pop(self._order.pop(0), None)
        return event

    def update(self, event: Event) -> Event:
        with self._lock:
            self._events[event.id] = event
        self._persist(event)
        return event

    def get(self, event_id: str) -> Event | None:
        with self._lock:
            return self._events.get(event_id)

    def list(self) -> list[Event]:
        with self._lock:
            return [self._events[i] for i in reversed(self._order) if i in self._events]

    def stats(self) -> dict:
        items = self.list()
        confirmed = sum(1 for e in items if e.feedback == "confirmed")
        false_pos = sum(1 for e in items if e.feedback == "false_positive")
        incidents = [e for e in items if e.status == "incident"]
        latencies = [e.latency_ms for e in items if e.latency_ms]
        reviewed = confirmed + false_pos
        return {
            "triggers": len(items),
            "incidents": len(incidents),
            "dismissed_by_vlm": sum(1 for e in items if e.status == "dismissed"),
            "confirmed": confirmed,
            "false_positives": false_pos,
            "precision": round(confirmed / reviewed, 3) if reviewed else None,
            "avg_latency_ms": int(sum(latencies) / len(latencies)) if latencies else None,
        }

    @staticmethod
    def _persist(event: Event) -> None:
        try:
            with open(config.EVENTS_LOG, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(event.model_dump(), ensure_ascii=False) + "\n")
        except OSError:
            pass
