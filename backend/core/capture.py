"""Etapa 0a: captura de video en hilo propio, siempre el frame mas reciente."""
from __future__ import annotations

import threading
import time

import cv2


def _resolve(source: str):
    """'0' -> webcam 0; cualquier otra cosa -> ruta o URL."""
    if source.isdigit():
        return int(source)
    return source


class Camera:
    def __init__(self, source: str, width: int = 1280, height: int = 720):
        self.source = _resolve(source)
        self.is_file = isinstance(self.source, str) and "://" not in self.source
        self.width = width
        self.height = height
        self._cap: cv2.VideoCapture | None = None
        self._frame = None
        self._t = 0.0
        self._seq = 0
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.fps = 30.0
        self.error: str | None = None

    def open(self) -> None:
        backend = cv2.CAP_DSHOW if isinstance(self.source, int) else cv2.CAP_ANY
        cap = cv2.VideoCapture(self.source, backend)
        if isinstance(self.source, int):
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            self.error = f"No se pudo abrir la fuente de video: {self.source}"
            raise RuntimeError(self.error)
        reported = cap.get(cv2.CAP_PROP_FPS)
        if reported and 1.0 < reported < 121.0:
            self.fps = float(reported)
        self._cap = cap

    def start(self) -> "Camera":
        if self._cap is None:
            self.open()
        self._thread = threading.Thread(target=self._loop, name="camera", daemon=True)
        self._thread.start()
        return self

    def _loop(self) -> None:
        frame_period = 1.0 / self.fps
        while not self._stop.is_set():
            ok, frame = self._cap.read()
            if not ok:
                if self.is_file:
                    # Los archivos se reproducen en bucle para poder demostrar sin camara.
                    self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                self.error = "Se perdio la senal de video"
                time.sleep(0.2)
                continue
            with self._lock:
                self._frame = frame
                self._t = time.time()
                self._seq += 1
            if self.is_file:
                time.sleep(frame_period)

    def read(self):
        """Devuelve (seq, timestamp, frame) o (None, None, None) si aun no hay."""
        with self._lock:
            if self._frame is None:
                return None, None, None
            return self._seq, self._t, self._frame

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1.5)
        if self._cap:
            self._cap.release()
