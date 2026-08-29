"""Orquestador de la cascada: captura -> pose -> gate -> VLM -> evento.

La regla que sostiene todo: el bucle de captura nunca se bloquea. El VLM corre
en un pool aparte, asi que una llamada lenta no tira los FPS ni pierde frames.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

from .. import config
from .buffer import RingBuffer
from .capture import Camera
from .events import EventStore, write_frames
from .gate import Domain, Gate, load_domains
from .signals import TrackHistory
from .tracker import PoseTracker
from .vlm import VLMJudge

SKELETON = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10), (5, 11), (6, 12),
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
]
TRACK_TTL = 2.0


class Pipeline:
    def __init__(self, on_event=None):
        self.domains = load_domains(config.DOMAINS_DIR)
        if not self.domains:
            raise RuntimeError(f"No hay dominios en {config.DOMAINS_DIR}")
        active = config.DOMAIN if config.DOMAIN in self.domains else next(iter(self.domains))

        self.gate = Gate(self.domains[active])
        self.tracker = PoseTracker(config.POSE_MODEL, device=config.DEVICE,
                                   imgsz=config.POSE_IMGSZ)
        self.judge = VLMJudge()
        self.events = EventStore()
        self.buffer = RingBuffer(config.BUFFER_SECONDS)
        self.camera = Camera(config.SOURCE)

        self.histories: dict[int, TrackHistory] = {}
        self.live: dict[int, dict] = {}
        self.on_event = on_event
        self.fps = 0.0
        self.status = "stopped"
        self.error: str | None = None
        self.analyzing = 0

        self._preview: bytes | None = None
        self._preview_lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=config.VLM_WORKERS, thread_name_prefix="vlm")
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._buffer_ratio = 1.0

    # ------------------------------------------------------------------ ciclo
    def start(self) -> None:
        self.camera.start()
        self.status = "starting"
        self._thread = threading.Thread(target=self._loop, name="pipeline", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3.0)
        self._pool.shutdown(wait=False, cancel_futures=True)
        self.camera.stop()
        self.status = "stopped"

    @property
    def domain(self) -> Domain:
        return self.gate.domain

    def set_domain(self, domain_id: str) -> bool:
        if domain_id not in self.domains:
            return False
        self.gate.set_domain(self.domains[domain_id])
        return True

    def _loop(self) -> None:
        last_seq = -1
        ticks: list[float] = []
        warmed = False

        while not self._stop.is_set():
            seq, t, frame = self.camera.read()
            if seq is None or seq == last_seq:
                time.sleep(0.004)
                continue
            last_seq = seq

            if not warmed:
                self.tracker.warmup(frame)
                warmed = True
                self.status = "running"

            self.buffer.push(t, frame)
            self._buffer_ratio = min(1.0, config.VLM_MAX_WIDTH / frame.shape[1])

            try:
                tracks = self.tracker(frame)
            except Exception as exc:                      # noqa: BLE001
                self.error = f"tracker: {exc}"
                time.sleep(0.1)
                continue

            self._update_histories(t, tracks)
            ctx = {"now": t, "tracks": self.histories, "frame_shape": frame.shape,
                   "zones": self.domain.zones}

            live: dict[int, dict] = {}
            for track in tracks:
                hist = self.histories[track["id"]]
                values, score, fire = self.gate.evaluate(hist, ctx)
                live[track["id"]] = {"signals": values, "score": score, "bbox": track["bbox"]}
                if fire:
                    self._dispatch(track["id"], values, score, t)
            self.live = live

            self._render(frame, tracks, live)

            ticks.append(time.time())
            ticks = ticks[-30:]
            if len(ticks) > 5:
                span = ticks[-1] - ticks[0]
                self.fps = round((len(ticks) - 1) / span, 1) if span > 0 else 0.0

    def _update_histories(self, t: float, tracks: list[dict]) -> None:
        for track in tracks:
            hist = self.histories.get(track["id"])
            if hist is None:
                hist = TrackHistory(track["id"])
                self.histories[track["id"]] = hist
            hist.push(t, track["bbox"], track["kp"])
        for tid in [k for k, h in self.histories.items() if t - h.last_seen > TRACK_TTL]:
            self.histories.pop(tid, None)
            self.gate.forget(tid)

    # ------------------------------------------------------------------ etapa 2
    def _dispatch(self, track_id: int, values: dict, score: float, t: float) -> None:
        event = self.events.create(self.domain.id, track_id, score, values)
        self.analyzing += 1
        self._emit(event)
        self._pool.submit(self._analyze, event, track_id, values, t, self.domain)

    def _analyze(self, event, track_id: int, values: dict, t: float, domain: Domain) -> None:
        try:
            # Esperar un poco captura el desenlace, que suele ser la evidencia clave.
            time.sleep(config.CLIP_POST_SECONDS)
            verdict, frames, latency = self.judge.judge(
                self.buffer, domain, values,
                t - config.CLIP_PRE_SECONDS, t + config.CLIP_POST_SECONDS,
                lambda ts: self._bbox_at(track_id, ts),
            )
            event.verdict = verdict
            event.latency_ms = latency
            event.status = "incident" if verdict.incident else "dismissed"

            event.frames = write_frames(frames, event.id)
        except Exception as exc:                          # noqa: BLE001
            event.status = "error"
            event.verdict = None
            self.error = f"vlm: {exc}"
            self.judge.last_error = str(exc)
        finally:
            self.analyzing = max(0, self.analyzing - 1)
            self.events.update(event)
            self._emit(event)

    def _bbox_at(self, track_id: int, ts: float):
        """Caja del sujeto en el instante ts, en coordenadas del buffer."""
        hist = self.histories.get(track_id)
        if hist is None or not hist.samples:
            return None
        sample = min(hist.samples, key=lambda s: abs(s.t - ts))
        if abs(sample.t - ts) > 1.0:
            return None
        return [v * self._buffer_ratio for v in sample.bbox]

    def _emit(self, event) -> None:
        if self.on_event:
            try:
                self.on_event(event)
            except Exception:                             # noqa: BLE001
                pass

    # ------------------------------------------------------------------ preview
    def _render(self, frame: np.ndarray, tracks: list[dict], live: dict) -> None:
        out = frame.copy()
        threshold = self.domain.threshold
        for track in tracks:
            tid = track["id"]
            info = live.get(tid, {})
            score = info.get("score", 0.0)
            hot = score >= threshold
            color = (0, 80, 255) if hot else (90, 220, 120)
            x1, y1, x2, y2 = [int(v) for v in track["bbox"]]
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2 if hot else 1)

            kp = track["kp"]
            for a, b in SKELETON:
                if kp[a, 2] > 0.3 and kp[b, 2] > 0.3:
                    cv2.line(out, (int(kp[a, 0]), int(kp[a, 1])),
                             (int(kp[b, 0]), int(kp[b, 1])), color, 1, cv2.LINE_AA)

            label = f"#{tid}  {score:.2f}"
            cv2.rectangle(out, (x1, y1 - 20), (x1 + 9 * len(label), y1), color, -1)
            cv2.putText(out, label, (x1 + 3, y1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, (18, 18, 18), 1, cv2.LINE_AA)

            bar_x = x2 + 6
            for i, (name, value) in enumerate(sorted(info.get("signals", {}).items())):
                y = y1 + 14 * i
                cv2.rectangle(out, (bar_x, y), (bar_x + int(46 * value), y + 9),
                              (90, 220, 120) if value < 0.5 else (0, 80, 255), -1)
                cv2.putText(out, name[:9], (bar_x + 50, y + 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.32, (235, 235, 235), 1, cv2.LINE_AA)

        header = f"{self.domain.label}   {self.fps:.0f} FPS   personas: {len(tracks)}"
        cv2.rectangle(out, (0, 0), (out.shape[1], 26), (16, 18, 22), -1)
        cv2.putText(out, header, (10, 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 240, 240), 1, cv2.LINE_AA)

        ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 72])
        if ok:
            with self._preview_lock:
                self._preview = buf.tobytes()

    def preview(self) -> bytes | None:
        with self._preview_lock:
            return self._preview

    def snapshot(self) -> dict:
        return {
            "status": self.status,
            "fps": self.fps,
            "domain": self.domain.id,
            "domain_label": self.domain.label,
            "threshold": self.domain.threshold,
            "people": len(self.live),
            "analyzing": self.analyzing,
            "offline": self.judge.offline,
            "error": self.error or self.camera.error,
            "tracks": [
                {"id": tid, "score": round(info["score"], 3),
                 "signals": {k: round(v, 3) for k, v in info["signals"].items()}}
                for tid, info in self.live.items()
            ],
            "stats": self.events.stats(),
        }
