"""Analisis retrospectivo de un video subido.

Recorre el archivo con la misma cascada que el directo, pero desacoplado del
bucle de camara. Sirve para tres cosas: que un jurado pueda darte cualquier
video, poder pasar datasets publicos delante del publico, y tener demo aunque
la camara falle.
"""
from __future__ import annotations

import threading
import time
import uuid
from pathlib import Path

import cv2

from .. import config
from .buffer import RingBuffer
from .events import EventStore, write_frames
from .gate import Domain, Gate
from .signals import TrackHistory
from .tracker import PoseTracker
from .vlm import VLMJudge

# Analizar cada frame de un video largo no aporta: el gate necesita continuidad
# temporal, no todos los fotogramas. Se procesa a este ritmo como maximo.
TARGET_FPS = 12.0
MAX_VLM_CALLS = 12          # tope de gasto por video


class Job:
    def __init__(self, job_id: str, name: str, domain: str):
        self.id = job_id
        self.name = name
        self.domain = domain
        self.status = "queued"      # queued | running | done | error
        self.progress = 0.0
        self.frames = 0
        self.triggers = 0
        self.incidents = 0
        self.duration = 0.0
        self.error: str | None = None
        self.started = time.time()

    def snapshot(self) -> dict:
        return {
            "id": self.id, "name": self.name, "domain": self.domain,
            "status": self.status, "progress": round(self.progress, 3),
            "frames": self.frames, "triggers": self.triggers,
            "incidents": self.incidents, "duration": round(self.duration, 1),
            "error": self.error,
            "elapsed": round(time.time() - self.started, 1),
        }


class Analyzer:
    """Un trabajo a la vez: en CPU, dos analisis en paralelo van peor que uno."""

    def __init__(self, tracker: PoseTracker, judge: VLMJudge, events: EventStore,
                 on_event=None, on_job=None):
        self.tracker = tracker
        self.judge = judge
        self.events = events
        self.on_event = on_event
        self.on_job = on_job
        self.jobs: dict[str, Job] = {}
        self.order: list[str] = []
        self._lock = threading.Lock()
        self._busy = threading.Lock()

    def list_jobs(self) -> list[dict]:
        with self._lock:
            return [self.jobs[i].snapshot() for i in reversed(self.order) if i in self.jobs]

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self.jobs.get(job_id)

    def submit(self, path: Path, domain: Domain, on_done=None) -> Job:
        job = Job(uuid.uuid4().hex[:10], path.name, domain.id)
        with self._lock:
            self.jobs[job.id] = job
            self.order.append(job.id)
        threading.Thread(
            target=self._run, args=(job, path, domain, on_done),
            name=f"analyze-{job.id}", daemon=True,
        ).start()
        return job

    def _emit_job(self, job: Job) -> None:
        if self.on_job:
            try:
                self.on_job(job)
            except Exception:                             # noqa: BLE001
                pass

    def _emit_event(self, event) -> None:
        if self.on_event:
            try:
                self.on_event(event)
            except Exception:                             # noqa: BLE001
                pass

    def _run(self, job: Job, path: Path, domain: Domain, on_done) -> None:
        with self._busy:
            try:
                self._process(job, path, domain)
                job.status = "done"
            except Exception as exc:                      # noqa: BLE001
                job.status = "error"
                job.error = f"{type(exc).__name__}: {exc}"
            finally:
                job.progress = 1.0
                self._emit_job(job)
                if on_done:
                    try:
                        on_done(job)
                    except Exception:                     # noqa: BLE001
                        pass

    def _process(self, job: Job, path: Path, domain: Domain) -> None:
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            raise RuntimeError("no se pudo abrir el video (codec no soportado?)")

        src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        job.duration = total / src_fps if total else 0.0
        job.status = "running"
        self._emit_job(job)

        step = max(1, int(round(src_fps / TARGET_FPS)))
        buffer = RingBuffer(config.BUFFER_SECONDS, fps=src_fps / step)
        gate = Gate(domain)
        histories: dict[int, TrackHistory] = {}
        pending: list[tuple] = []
        index = 0
        last_emit = 0.0

        while True:
            ok, frame = cap.read()
            if not ok:
                break
            index += 1
            if index % step:
                continue

            t = index / src_fps
            job.frames += 1
            buffer.push(t, frame)
            ratio = min(1.0, config.VLM_MAX_WIDTH / frame.shape[1])

            for track in self.tracker(frame):
                hist = histories.setdefault(track["id"], TrackHistory(track["id"]))
                hist.push(t, track["bbox"], track["kp"])

            ctx = {"now": t, "tracks": histories, "frame_shape": frame.shape,
                   "zones": domain.zones}

            for hist in list(histories.values()):
                if abs(hist.last_seen - t) > 1e-9:
                    continue
                values, score, fire = gate.evaluate(hist, ctx)
                if fire and len(pending) < MAX_VLM_CALLS:
                    job.triggers += 1
                    pending.append((hist.id, dict(values), score, t, ratio,
                                    [(s.t, list(s.bbox)) for s in hist.samples]))

            for tid in [k for k, h in histories.items() if t - h.last_seen > 2.0]:
                histories.pop(tid, None)
                gate.forget(tid)

            if total:
                job.progress = min(0.9, 0.9 * index / total)
            if time.time() - last_emit > 0.7:
                last_emit = time.time()
                self._emit_job(job)

        cap.release()

        # El VLM se llama al final: asi el recorrido del video va a maxima
        # velocidad y las llamadas de red no lo van frenando frame a frame.
        for i, (tid, values, score, t, ratio, samples) in enumerate(pending):
            job.progress = 0.9 + 0.1 * (i / max(len(pending), 1))
            self._emit_job(job)
            event = self.events.create(domain.id, tid, score, values)
            event.source = job.name
            event.offset = round(t, 2)
            self._emit_event(event)
            try:
                verdict, frames, latency = self.judge.judge(
                    buffer, domain, values,
                    t - config.CLIP_PRE_SECONDS, t + config.CLIP_POST_SECONDS,
                    lambda ts, s=samples, r=ratio: _bbox_at(s, ts, r),
                )
                event.verdict = verdict
                event.latency_ms = latency
                event.status = "incident" if verdict.incident else "dismissed"
                event.frames = write_frames(frames, event.id)
                job.incidents += int(verdict.incident)
            except Exception as exc:                      # noqa: BLE001
                event.status = "error"
                self.judge.last_error = str(exc)
            finally:
                self.events.update(event)
                self._emit_event(event)


def _bbox_at(samples: list[tuple], ts: float, ratio: float):
    """Caja del sujeto en el instante ts, sobre una copia de la historia.

    Se copia al disparar porque para cuando llaman al VLM la track ya pudo
    haberse reciclado.
    """
    if not samples:
        return None
    st, bbox = min(samples, key=lambda s: abs(s[0] - ts))
    if abs(st - ts) > 1.5:
        return None
    return [v * ratio for v in bbox]
