"""Orquestador de la cascada: captura -> pose -> gate -> VLM -> evento.

Dos reglas sostienen el diseno:

1. El bucle de captura nunca se bloquea. El VLM corre en un pool aparte, asi que
   una llamada lenta no tira los FPS ni pierde frames.
2. Varias camaras comparten UN presupuesto de inferencia, repartido round-robin.
   Levantar un pipeline por camara es lo que satura la maquina; aqui N camaras
   cuestan lo mismo que una y se reparten los FPS.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

from .. import config
from . import timeline as timeline_mod
from .analyzer import Analyzer
from .buffer import RingBuffer
from .capture import Camera
from .events import EventStore, write_frames
from .gate import Domain, Gate, load_domains
from .notify import Notifier
from .privacy import anonymize
from .signals import TrackHistory
from .tracker import PoseTracker
from .vlm import VLMJudge

SKELETON = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10), (5, 11), (6, 12),
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
]
TRACK_TTL = 2.0


def _bbox_at(samples: list, ts: float, ratio: float):
    """Caja del sujeto en el instante ts, sobre la copia de la historia."""
    if not samples:
        return None
    st, bbox, _kp = min(samples, key=lambda s: abs(s[0] - ts))
    if abs(st - ts) > 1.0:
        return None
    return [v * ratio for v in bbox]


class Feed:
    """Una camara con su propio estado de seguimiento y de disparo.

    El tracker es una instancia por feed a proposito: ByteTrack guarda estado
    interno entre llamadas, asi que alternar camaras contra un mismo tracker
    mezclaria las identidades de una sala con las de otra.
    """

    def __init__(self, feed_id: str, source: str, domain: Domain, label: str = ""):
        self.id = feed_id
        self.source = source
        self.label = label or feed_id
        self.camera: Camera | None = Camera(source)
        self.tracker = PoseTracker(config.POSE_MODEL, device=config.DEVICE,
                                   imgsz=config.POSE_IMGSZ)
        self.gate = Gate(domain)
        self.buffer = RingBuffer(config.BUFFER_SECONDS)
        self.histories: dict[int, TrackHistory] = {}
        self.live: dict[int, dict] = {}

        self.fps = 0.0
        self.error: str | None = None
        self.warmed = False
        self.buffer_ratio = 1.0

        self._last_seq = -1
        self._ticks: list[float] = []
        self._preview: bytes | None = None
        self._preview_lock = threading.Lock()
        self._viewer_seen = 0.0
        self._preview_at = 0.0

    # -------------------------------------------------------------- ciclo
    def open(self) -> None:
        if self.camera is None:
            self.camera = Camera(self.source)
        self.camera.start()

    def release(self) -> None:
        camera, self.camera = self.camera, None
        if camera:
            camera.stop()
        self.histories.clear()
        self.live = {}
        self.fps = 0.0
        self._last_seq = -1
        self._ticks.clear()
        with self._preview_lock:
            self._preview = None

    def next_frame(self):
        """Frame nuevo o (None, None) si aun no hay uno distinto al ultimo."""
        if self.camera is None:
            return None, None
        seq, t, frame = self.camera.read()
        if seq is None or seq == self._last_seq:
            return None, None
        self._last_seq = seq
        return t, frame

    def tick(self) -> None:
        self._ticks.append(time.time())
        self._ticks = self._ticks[-30:]
        if len(self._ticks) > 5:
            span = self._ticks[-1] - self._ticks[0]
            self.fps = round((len(self._ticks) - 1) / span, 1) if span > 0 else 0.0

    def prune(self, t: float) -> None:
        for tid in [k for k, h in self.histories.items() if t - h.last_seen > TRACK_TTL]:
            self.histories.pop(tid, None)
            self.gate.forget(tid)

    # -------------------------------------------------------------- preview
    def viewer_ping(self) -> None:
        self._viewer_seen = time.time()

    def wants_preview(self, now: float) -> bool:
        """Dibujar y comprimir cuesta mas que la propia inferencia de pose.

        Hacerlo siempre, mirase alguien o no, hundia los FPS. Solo se dibuja si
        hay alguien viendo ESTE feed, y como mucho a 15 fps.
        """
        if now - self._viewer_seen > 2.0:
            return False
        if now - self._preview_at < 1 / 15:
            return False
        self._preview_at = now
        return True

    def set_preview(self, payload: bytes) -> None:
        with self._preview_lock:
            self._preview = payload

    def preview(self) -> bytes | None:
        with self._preview_lock:
            return self._preview

    def snapshot(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "source": self.source,
            "fps": self.fps,
            "people": len(self.live),
            "error": self.error or (self.camera.error if self.camera else None),
            "tracks": [
                {"id": tid, "score": round(info["score"], 3),
                 "signals": {k: round(v, 3) for k, v in info["signals"].items()}}
                for tid, info in self.live.items()
            ],
        }


def _parse_sources(raw: str) -> list[tuple[str, str]]:
    """'0' -> [(cam1, 0)];  '0,rtsp://x' -> [(cam1, 0), (cam2, rtsp://x)].

    Acepta tambien 'Entrada=0,Almacen=rtsp://x' para ponerles nombre.
    """
    out: list[tuple[str, str]] = []
    for i, chunk in enumerate([c.strip() for c in raw.split(",") if c.strip()], start=1):
        if "=" in chunk and not chunk.split("=", 1)[0].strip().lower().startswith(
                ("http", "rtsp", "rtmp")):
            label, source = chunk.split("=", 1)
            out.append((label.strip(), source.strip()))
        else:
            out.append((f"cam{i}", chunk))
    return out or [("cam1", "0")]


class Pipeline:
    def __init__(self, on_event=None, on_job=None):
        self.domains = load_domains(config.DOMAINS_DIR)
        if not self.domains:
            raise RuntimeError(f"No hay dominios en {config.DOMAINS_DIR}")
        active = config.DOMAIN if config.DOMAIN in self.domains else next(iter(self.domains))
        self._domain = self.domains[active]

        self.judge = VLMJudge()
        self.notifier = Notifier()
        self.events = EventStore()

        self.feeds: dict[str, Feed] = {}
        for label, source in _parse_sources(config.SOURCE):
            feed_id = label.lower().replace(" ", "_")
            self.feeds[feed_id] = Feed(feed_id, source, self._domain, label)

        self.on_event = on_event
        self.on_job = on_job
        # El analizador de archivos lleva su propio tracker: compartirlo con un
        # feed le pisaria el estado de seguimiento a esa camara.
        self.analyzer = Analyzer(
            PoseTracker(config.POSE_MODEL, device=config.DEVICE, imgsz=config.POSE_IMGSZ),
            self.judge, self.events,
            on_event=self._emit, on_job=self._emit_job,
        )

        self.status = "stopped"
        self.error: str | None = None
        self.analyzing = 0

        self._pool = ThreadPoolExecutor(max_workers=config.VLM_WORKERS,
                                        thread_name_prefix="vlm")
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------------ ciclo
    @property
    def domain(self) -> Domain:
        return self._domain

    @property
    def primary(self) -> Feed:
        return next(iter(self.feeds.values()))

    def feed(self, feed_id: str | None) -> Feed:
        if feed_id and feed_id in self.feeds:
            return self.feeds[feed_id]
        return self.primary

    @property
    def fps(self) -> float:
        """Suma de los FPS de todas las camaras: el presupuesto real repartido."""
        return round(sum(f.fps for f in self.feeds.values()), 1)

    def start(self) -> None:
        for feed in self.feeds.values():
            try:
                feed.open()
            except Exception as exc:                      # noqa: BLE001
                feed.error = str(exc)
        self.status = "starting"
        self._thread = threading.Thread(target=self._loop, name="pipeline", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3.0)
        self._pool.shutdown(wait=False, cancel_futures=True)
        for feed in self.feeds.values():
            feed.release()
        self.status = "stopped"

    def pause(self) -> None:
        """Suelta todas las camaras y para la inferencia, sin tumbar la API."""
        if self.status == "paused":
            return
        self.status = "paused"
        for feed in self.feeds.values():
            feed.release()

    def resume(self) -> None:
        if self.status != "paused":
            return
        self.error = None
        opened = 0
        for feed in self.feeds.values():
            try:
                feed.open()
                feed.error = None
                opened += 1
            except Exception as exc:                      # noqa: BLE001
                feed.error = str(exc)
        if not opened:
            self.error = "no se pudo reabrir ninguna camara"
            return
        self.status = "running"

    def set_domain(self, domain_id: str) -> bool:
        if domain_id not in self.domains:
            return False
        self._domain = self.domains[domain_id]
        for feed in self.feeds.values():
            feed.gate.set_domain(self._domain)
        return True

    def _loop(self) -> None:
        """Round-robin: en cada vuelta se atiende como mucho un frame por feed."""
        while not self._stop.is_set():
            if self.status == "paused":
                time.sleep(0.15)
                continue

            worked = False
            for feed in list(self.feeds.values()):
                if self._stop.is_set():
                    break
                t, frame = feed.next_frame()
                if frame is None:
                    continue
                worked = True
                try:
                    self._process(feed, t, frame)
                except Exception as exc:                  # noqa: BLE001
                    feed.error = f"proceso: {exc}"
                    time.sleep(0.05)

            if not worked:
                time.sleep(0.004)

    def _process(self, feed: Feed, t: float, frame: np.ndarray) -> None:
        if not feed.warmed:
            feed.tracker.warmup(frame)
            feed.warmed = True
            self.status = "running"

        # El tracker va primero: sus keypoints son los que sitúan la cabeza,
        # y al buffer solo debe entrar el frame ya anonimizado.
        tracks = feed.tracker(frame)
        feed.buffer.push(t, anonymize(frame, tracks) if config.BLUR_FACES else frame)
        feed.buffer_ratio = min(1.0, config.VLM_MAX_WIDTH / frame.shape[1])

        for track in tracks:
            hist = feed.histories.get(track["id"])
            if hist is None:
                hist = TrackHistory(track["id"])
                feed.histories[track["id"]] = hist
            hist.push(t, track["bbox"], track["kp"])
        feed.prune(t)

        ctx = {"now": t, "tracks": feed.histories, "frame_shape": frame.shape,
               "zones": self._domain.zones}

        live: dict[int, dict] = {}
        for track in tracks:
            hist = feed.histories[track["id"]]
            values, score, fire = feed.gate.evaluate(hist, ctx)
            live[track["id"]] = {"signals": values, "score": score, "bbox": track["bbox"]}
            if fire:
                self._dispatch(feed, track["id"], values, score, t)
        feed.live = live

        self._render(feed, frame, tracks, live)
        feed.tick()

    # ------------------------------------------------------------------ etapa 2
    def _dispatch(self, feed: Feed, track_id: int, values: dict,
                  score: float, t: float) -> None:
        event = self.events.create(self._domain.id, track_id, score, values)
        event.camera = feed.label
        self.analyzing += 1
        self._emit(event)
        # Copiar la historia ahora: para cuando responda el VLM, la track pudo
        # haberse reciclado y las cajas ya no serian de esta persona.
        hist = feed.histories.get(track_id)
        samples = ([(s.t, np.array(s.bbox, copy=True), np.array(s.kp, copy=True))
                    for s in hist.samples] if hist else [])
        self._pool.submit(self._analyze, event, feed, samples, values, t, self._domain)

    def _analyze(self, event, feed: Feed, samples: list, values: dict,
                 t: float, domain: Domain) -> None:
        try:
            # Esperar un poco captura el desenlace, que suele ser la evidencia clave.
            time.sleep(config.CLIP_POST_SECONDS)
            verdict, frames, latency = self.judge.judge(
                feed.buffer, domain, values,
                t - config.CLIP_PRE_SECONDS, t + config.CLIP_POST_SECONDS,
                lambda ts: _bbox_at(samples, ts, feed.buffer_ratio),
            )
            event.verdict = verdict
            event.latency_ms = latency
            event.status = "incident" if verdict.incident else "dismissed"
            event.frames = write_frames(frames, event.id)
            event.timeline = timeline_mod.build(
                samples, domain, t,
                t - config.CLIP_PRE_SECONDS, t + config.CLIP_POST_SECONDS)
        except Exception as exc:                          # noqa: BLE001
            event.status = "error"
            event.verdict = None
            self.error = f"vlm: {exc}"
            self.judge.last_error = str(exc)
        finally:
            self.analyzing = max(0, self.analyzing - 1)
            self.events.update(event)
            self._emit(event)

    def _emit(self, event) -> None:
        # Un unico punto de salida: el aviso externo sale de aqui, asi cubre
        # tanto el directo como el analisis de un video subido.
        self.notifier.notify(event, self._domain.label)
        if self.on_event:
            try:
                self.on_event(event)
            except Exception:                             # noqa: BLE001
                pass

    def _emit_job(self, job) -> None:
        if self.on_job:
            try:
                self.on_job(job)
            except Exception:                             # noqa: BLE001
                pass

    def analyze_file(self, path):
        """Analiza un video subido. Pausa las camaras para no pelear por la CPU."""
        was_running = self.status == "running"
        if was_running:
            self.pause()

        def done(_job):
            if was_running:
                self.resume()

        return self.analyzer.submit(path, self._domain, on_done=done)

    # ------------------------------------------------------------------ preview
    def viewer_ping(self, feed_id: str | None = None) -> None:
        self.feed(feed_id).viewer_ping()

    def preview(self, feed_id: str | None = None) -> bytes | None:
        return self.feed(feed_id).preview()

    def _render(self, feed: Feed, frame: np.ndarray,
                tracks: list[dict], live: dict) -> None:
        if not feed.wants_preview(time.time()):
            return
        out = frame.copy()
        threshold = self._domain.threshold
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

        header = (f"{feed.label}   {self._domain.label}   "
                  f"{feed.fps:.0f} FPS   personas: {len(tracks)}")
        cv2.rectangle(out, (0, 0), (out.shape[1], 26), (16, 18, 22), -1)
        cv2.putText(out, header, (10, 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 240, 240), 1, cv2.LINE_AA)

        ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 72])
        if ok:
            feed.set_preview(buf.tobytes())

    def snapshot(self) -> dict:
        cameras = [f.snapshot() for f in self.feeds.values()]
        errors = [c["error"] for c in cameras if c["error"]]
        return {
            "status": self.status,
            "fps": self.fps,
            "domain": self._domain.id,
            "domain_label": self._domain.label,
            "threshold": self._domain.threshold,
            "people": sum(c["people"] for c in cameras),
            "analyzing": self.analyzing,
            "offline": self.judge.offline,
            "alerts": {"channels": self.notifier.channels,
                       "sent": self.notifier.sent,
                       "error": self.notifier.last_error},
            "error": self.error or (errors[0] if errors else None),
            "cameras": cameras,
            # Compatibilidad: las tracks de la camara principal, planas.
            "tracks": cameras[0]["tracks"] if cameras else [],
            "stats": self.events.stats(),
        }
