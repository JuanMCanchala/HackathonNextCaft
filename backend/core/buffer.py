"""Buffer circular de frames comprimidos: memoria acotada y clips instantaneos."""
from __future__ import annotations

import threading
from collections import deque

import cv2
import numpy as np


class RingBuffer:
    """Guarda los ultimos `seconds` de video como JPEG (~30 KB/frame)."""

    def __init__(self, seconds: float, fps: float = 30.0, max_width: int = 640):
        self.seconds = seconds
        self.max_width = max_width
        self._items: deque = deque(maxlen=int(seconds * fps) + 30)
        self._lock = threading.Lock()

    def push(self, t: float, frame: np.ndarray) -> None:
        h, w = frame.shape[:2]
        if w > self.max_width:
            scale = self.max_width / w
            frame = cv2.resize(frame, (self.max_width, int(h * scale)))
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            return
        with self._lock:
            self._items.append((t, buf.tobytes()))
            while self._items and t - self._items[0][0] > self.seconds:
                self._items.popleft()

    def window(self, t_start: float, t_end: float) -> list[tuple[float, bytes]]:
        with self._lock:
            return [item for item in self._items if t_start <= item[0] <= t_end]

    def sample(self, t_start: float, t_end: float, n: int) -> list[tuple[float, bytes]]:
        """n frames repartidos uniformemente en la ventana."""
        win = self.window(t_start, t_end)
        if not win:
            return []
        if len(win) <= n:
            return win
        idx = np.linspace(0, len(win) - 1, n).round().astype(int)
        return [win[i] for i in idx]

    @staticmethod
    def decode(payload: bytes) -> np.ndarray:
        return cv2.imdecode(np.frombuffer(payload, np.uint8), cv2.IMREAD_COLOR)
