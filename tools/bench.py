"""Mide el pipeline sobre clips etiquetados y devuelve numeros para el pitch.

Convencion de nombres en la carpeta:
    pos_*.mp4  -> el clip contiene un incidente
    neg_*.mp4  -> el clip no lo contiene

Uso:
    .venv\\Scripts\\python.exe -m tools.bench data\\samples --domain retail_theft
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2

from backend import config
from backend.core.buffer import RingBuffer
from backend.core.gate import Gate, load_domains
from backend.core.signals import TrackHistory
from backend.core.tracker import PoseTracker
from backend.core.vlm import VLMJudge


def run_clip(path: Path, tracker: PoseTracker, gate: Gate, judge: VLMJudge, use_vlm: bool):
    """Devuelve (disparos_gate, incidentes_vlm, frames, segundos_procesados)."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"no se pudo abrir {path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    buffer = RingBuffer(config.BUFFER_SECONDS, fps=fps)
    histories: dict[int, TrackHistory] = {}
    triggers = 0
    incidents = 0
    frames = 0
    t = 0.0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames += 1
        t += 1.0 / fps
        buffer.push(t, frame)

        for track in tracker(frame):
            hist = histories.setdefault(track["id"], TrackHistory(track["id"]))
            hist.push(t, track["bbox"], track["kp"])

        ctx = {"now": t, "tracks": histories, "frame_shape": frame.shape,
               "zones": gate.domain.zones}

        for hist in list(histories.values()):
            if abs(hist.last_seen - t) > 1e-6:
                continue
            values, _score, fire = gate.evaluate(hist, ctx)
            if not fire:
                continue
            triggers += 1
            if not use_vlm:
                continue
            try:
                ratio = min(1.0, config.VLM_MAX_WIDTH / frame.shape[1])
                verdict, _f, _ms = judge.judge(
                    buffer, gate.domain, values,
                    t - config.CLIP_PRE_SECONDS, t,
                    lambda ts, h=hist, r=ratio: _bbox_at(h, ts, r),
                )
                incidents += int(verdict.incident)
            except Exception as exc:                      # noqa: BLE001
                print(f"    aviso: fallo el VLM ({exc})", file=sys.stderr)

    cap.release()
    return triggers, incidents, frames, t


def _bbox_at(hist: TrackHistory, ts: float, ratio: float):
    if not hist.samples:
        return None
    sample = min(hist.samples, key=lambda s: abs(s.t - ts))
    return [v * ratio for v in sample.bbox]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path)
    ap.add_argument("--domain", default=config.DOMAIN)
    ap.add_argument("--no-vlm", action="store_true",
                    help="mide solo el gate, sin gastar cuota de API")
    args = ap.parse_args()

    domains = load_domains(config.DOMAINS_DIR)
    if args.domain not in domains:
        print(f"dominio desconocido: {args.domain}. Hay: {list(domains)}")
        return 2

    exts = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    clips = sorted(p for p in args.folder.iterdir()
                   if p.suffix.lower() in exts and p.stem.startswith(("pos_", "neg_")))
    if not clips:
        print(f"No hay clips pos_* / neg_* en {args.folder}")
        return 2

    tracker = PoseTracker(config.POSE_MODEL, device=config.DEVICE,
                          imgsz=config.POSE_IMGSZ)
    judge = VLMJudge()
    use_vlm = not args.no_vlm and not judge.offline

    tp = fp = fn = tn = 0
    total_triggers = 0
    total_frames = 0
    total_seconds = 0.0
    wall = time.time()

    print(f"\nDominio: {domains[args.domain].label}   VLM: {'si' if use_vlm else 'no'}\n")
    for clip in clips:
        gate = Gate(domains[args.domain])
        triggers, incidents, frames, seconds = run_clip(clip, tracker, gate, judge, use_vlm)
        positive = incidents > 0 if use_vlm else triggers > 0
        expected = clip.stem.startswith("pos_")

        total_triggers += triggers
        total_frames += frames
        total_seconds += seconds

        if expected and positive:
            tp += 1; mark = "OK  "
        elif expected and not positive:
            fn += 1; mark = "FN  "
        elif not expected and positive:
            fp += 1; mark = "FP  "
        else:
            tn += 1; mark = "OK  "
        print(f"  {mark} {clip.name:<34} gate={triggers}  vlm+={incidents}")

    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (2 * precision * recall / (precision + recall)
          if precision and recall else None)

    # Cuantas llamadas se habrian hecho analizando cada frame contra las reales.
    saved = 1 - (total_triggers / total_frames) if total_frames else 0.0

    print(f"\n  clips           {len(clips)}   (TP {tp}  FP {fp}  FN {fn}  TN {tn})")
    print(f"  precision       {precision:.2%}" if precision is not None else "  precision       n/a")
    print(f"  recall          {recall:.2%}" if recall is not None else "  recall          n/a")
    print(f"  F1              {f1:.2%}" if f1 is not None else "  F1              n/a")
    print(f"\n  frames          {total_frames} ({total_seconds:.0f}s de video)")
    print(f"  llamadas VLM    {total_triggers}")
    print(f"  ahorro etapa 1  {saved:.2%} de las llamadas evitadas")
    print(f"  tiempo real     {time.time() - wall:.1f}s\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
