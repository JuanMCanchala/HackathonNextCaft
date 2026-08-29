"""Etapa 3: persistencia de incidentes, clip de evidencia y feedback humano."""
from __future__ import annotations

import json
import threading
import time
import uuid

import cv2
import numpy as np

from .. import config
from .schemas import Event


def write_clip(frames: list[np.ndarray], path, fps: float = 6.0) -> bool:
    if not frames:
        return False
    h, w = frames[0].shape[:2]
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"avc1"), fps, (w, h))
    if not writer.isOpened():
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        return False
    for frame in frames:
        writer.write(frame if frame.shape[:2] == (h, w) else cv2.resize(frame, (w, h)))
    writer.release()
    return True


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
