"""Mide el pipeline sobre clips etiquetados y da los numeros para el pitch.

Reporta las DOS etapas por separado, que es lo unico que demuestra si la
cascada aporta algo:

  Etapa 1   filtro geometrico, gratis. Se busca recall alto aunque la precision
            sea mala: lo que se pierde aqui no lo recupera nadie.
  Etapa 1+2 con el veredicto del VLM. Aqui es donde debe caer la tasa de falsos
            positivos sin llevarse por delante el recall.

Convencion de nombres en la carpeta: `pos_*` contiene incidente, `neg_*` no.

    .venv\\Scripts\\python.exe -m tools.bench data\\rwf2000 --domain violence
    .venv\\Scripts\\python.exe -m tools.bench data\\rwf2000 --limit 100 --no-vlm
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from backend import config
from backend.core.buffer import RingBuffer
from backend.core.gate import Gate, load_domains
from backend.core.signals import TrackHistory
from backend.core.tracker import PoseTracker
from backend.core.vlm import VLMJudge

VIDEO_EXT = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
TARGET_FPS = 12.0          # igual que el analizador de videos subidos
MAX_VLM_PER_CLIP = 2       # un clip de 5 s no necesita mas veredictos


@dataclass
class Counts:
    """Matriz de confusion de una etapa."""

    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0

    def add(self, expected: bool, predicted: bool) -> None:
        if expected and predicted:
            self.tp += 1
        elif expected:
            self.fn += 1
        elif predicted:
            self.fp += 1
        else:
            self.tn += 1

    @property
    def recall(self) -> float | None:
        d = self.tp + self.fn
        return self.tp / d if d else None

    @property
    def precision(self) -> float | None:
        d = self.tp + self.fp
        return self.tp / d if d else None

    @property
    def fpr(self) -> float | None:
        """Falsos positivos sobre el total de negativos reales."""
        d = self.fp + self.tn
        return self.fp / d if d else None

    @property
    def fnr(self) -> float | None:
        """Falsos negativos sobre los positivos reales: lo que se escapa."""
        d = self.fn + self.tp
        return self.fn / d if d else None

    @property
    def f1(self) -> float | None:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p and r else None

    def as_dict(self) -> dict:
        return {
            "tp": self.tp, "fp": self.fp, "fn": self.fn, "tn": self.tn,
            "recall": self.recall, "precision": self.precision,
            "fpr": self.fpr, "fnr": self.fnr, "f1": self.f1,
        }


@dataclass
class Totals:
    frames: int = 0
    seconds: float = 0.0
    triggers: int = 0
    vlm_calls: int = 0
    vlm_errors: int = 0
    latencies: list[int] = field(default_factory=list)


def _pct(v: float | None) -> str:
    return f"{v:.1%}" if v is not None else "n/a"


def _bbox_at(samples: list, ts: float, ratio: float):
    if not samples:
        return None
    st, bbox, _kp = min(samples, key=lambda s: abs(s[0] - ts))
    return [v * ratio for v in bbox]


def run_clip(path: Path, tracker: PoseTracker, gate: Gate, judge: VLMJudge,
             use_vlm: bool, totals: Totals) -> tuple[bool, bool, int, dict, int]:
    """Devuelve (disparo, confirmado, n disparos, pico de senales, max personas).

    El pico por senal es lo que permite diagnosticar un recall bajo sin
    adivinar: si `proximity` sale 0.00 de media en los clips positivos, el
    problema es que el detector no ve a la segunda persona, no el umbral.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError("no se pudo abrir")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(src_fps / TARGET_FPS)))
    buffer = RingBuffer(config.BUFFER_SECONDS, fps=src_fps / step)
    histories: dict[int, TrackHistory] = {}
    pending: list[tuple] = []
    peaks: dict[str, float] = {}
    max_people = 0
    index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        index += 1
        if index % step:
            continue

        t = index / src_fps
        totals.frames += 1
        buffer.push(t, frame)
        ratio = min(1.0, config.VLM_MAX_WIDTH / frame.shape[1])

        detected = tracker(frame)
        max_people = max(max_people, len(detected))
        for track in detected:
            hist = histories.setdefault(track["id"], TrackHistory(track["id"]))
            hist.push(t, track["bbox"], track["kp"])

        ctx = {"now": t, "tracks": histories, "frame_shape": frame.shape,
               "zones": gate.domain.zones}

        for hist in list(histories.values()):
            if abs(hist.last_seen - t) > 1e-9:
                continue
            values, _score, fire = gate.evaluate(hist, ctx)
            for name, val in values.items():
                peaks[name] = max(peaks.get(name, 0.0), val)
            if fire and len(pending) < MAX_VLM_PER_CLIP:
                pending.append((dict(values), t, ratio,
                                [(s.t, np.array(s.bbox, copy=True),
                                  np.array(s.kp, copy=True)) for s in hist.samples]))

        for tid in [k for k, h in histories.items() if t - h.last_seen > 2.0]:
            histories.pop(tid, None)
            gate.forget(tid)

    cap.release()
    totals.seconds += index / src_fps
    totals.triggers += len(pending)

    if not use_vlm or not pending:
        return bool(pending), False, len(pending), peaks, max_people

    confirmed = False
    for values, t, ratio, samples in pending:
        totals.vlm_calls += 1
        try:
            verdict, _frames, latency = judge.judge(
                buffer, gate.domain, values,
                t - config.CLIP_PRE_SECONDS, t + config.CLIP_POST_SECONDS,
                lambda ts, s=samples, r=ratio: _bbox_at(s, ts, r),
            )
            totals.latencies.append(latency)
            confirmed = confirmed or verdict.incident
        except Exception as exc:                          # noqa: BLE001
            totals.vlm_errors += 1
            print(f"      aviso: fallo el VLM ({exc})", file=sys.stderr)

    return True, confirmed, len(pending), peaks, max_people


def collect(folder: Path, limit: int) -> list[tuple[Path, bool]]:
    pos = sorted(p for p in folder.iterdir()
                 if p.suffix.lower() in VIDEO_EXT and p.stem.startswith("pos_"))
    neg = sorted(p for p in folder.iterdir()
                 if p.suffix.lower() in VIDEO_EXT and p.stem.startswith("neg_"))
    if limit:
        pos, neg = pos[:limit], neg[:limit]
    return [(p, True) for p in pos] + [(p, False) for p in neg]


def _block(c: Counts) -> None:
    print(f"  TP {c.tp:<5} FP {c.fp:<5} FN {c.fn:<5} TN {c.tn}")
    print(f"  recall (detecta)          {_pct(c.recall)}")
    print(f"  precision (acierta)       {_pct(c.precision)}")
    print(f"  falsos positivos (FPR)    {_pct(c.fpr)}   de los clips sin incidente")
    print(f"  falsos negativos (FNR)    {_pct(c.fnr)}   de los clips con incidente")
    print(f"  F1                        {_pct(c.f1)}")


def diagnose(peaks_pos: list[dict], peaks_neg: list[dict],
             people_pos: list[int], people_neg: list[int]) -> None:
    """Por que dispara o no dispara, en numeros.

    Un recall bajo puede venir de un umbral mal puesto o de que el detector no
    ve lo que hace falta. Comparar el pico medio de cada senal entre clips con
    y sin incidente distingue las dos cosas de un vistazo.
    """
    names = sorted({k for d in peaks_pos + peaks_neg for k in d})
    if not names:
        return
    print()
    print("=" * 66)
    print("  DIAGNOSTICO  ·  pico medio de cada senal")
    print("=" * 66)
    print(f"  {'senal':<14}{'con incidente':>15}{'sin incidente':>15}{'separacion':>13}")
    for name in names:
        a = [d.get(name, 0.0) for d in peaks_pos]
        b = [d.get(name, 0.0) for d in peaks_neg]
        ma = sum(a) / len(a) if a else 0.0
        mb = sum(b) / len(b) if b else 0.0
        print(f"  {name:<14}{ma:>15.2f}{mb:>15.2f}{ma - mb:>+13.2f}")
    print()
    print(f"  personas detectadas   con incidente {_avg(people_pos):.1f}"
          f"   sin incidente {_avg(people_neg):.1f}")
    print("  Si una senal separa poco, el umbral no es el problema: o la senal")
    print("  no mide lo que creemos, o el detector no ve lo que necesita.")


def _avg(xs: list[int]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def report(stage1: Counts, stage2: Counts, totals: Totals,
           use_vlm: bool, clips: int, wall: float) -> None:
    print()
    print("=" * 66)
    print("  ETAPA 1  ·  filtro geometrico (local, coste cero)")
    print("=" * 66)
    _block(stage1)
    print("  Lo que se pierde aqui no lo recupera nadie: la Etapa 2 solo puede")
    print("  descartar, nunca resucitar un incidente que el gate no vio.")

    if use_vlm:
        print()
        print("=" * 66)
        print("  ETAPA 1+2  ·  con el veredicto del VLM")
        print("=" * 66)
        _block(stage2)

        quitados = stage1.fp - stage2.fp
        base = stage1.fp or 1
        print()
        print("=" * 66)
        print("  QUE APORTA LA ETAPA 2")
        print("=" * 66)
        print(f"  falsos positivos     {stage1.fp} -> {stage2.fp}   "
              f"({-quitados / base:+.1%})")
        print(f"  recall               {_pct(stage1.recall)} -> {_pct(stage2.recall)}")
        print(f"  precision            {_pct(stage1.precision)} -> {_pct(stage2.precision)}")

    ahorro = 1 - (totals.triggers / totals.frames) if totals.frames else 0.0
    print()
    print("=" * 66)
    print("  COSTE")
    print("=" * 66)
    print(f"  clips                {clips}")
    print(f"  frames analizados    {totals.frames}  ({totals.seconds:.0f}s de video)")
    print(f"  llamadas al VLM      {totals.vlm_calls}"
          + (f"   ({totals.vlm_errors} fallidas)" if totals.vlm_errors else ""))
    print(f"  ahorro de la etapa 1 {ahorro:.2%} de los frames nunca llegan al VLM")
    if totals.latencies:
        print(f"  latencia media VLM   {sum(totals.latencies) // len(totals.latencies)} ms")
    if wall > 0:
        print(f"  tiempo total         {wall:.0f}s "
              f"({totals.seconds / wall:.1f}x tiempo real)")
    print()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path)
    ap.add_argument("--domain", default=config.DOMAIN)
    ap.add_argument("--limit", type=int, default=0,
                    help="maximo de clips por clase (0 = todos)")
    ap.add_argument("--no-vlm", action="store_true",
                    help="mide solo la Etapa 1, sin gastar cuota de API")
    ap.add_argument("--out", type=Path, default=None,
                    help="guarda el resultado en JSON")
    ap.add_argument("--imgsz", type=int, default=config.POSE_IMGSZ,
                    help="resolucion de inferencia. Subirla ayuda con CCTV lejano")
    ap.add_argument("--conf", type=float, default=0.4,
                    help="confianza minima para dar por detectada a una persona")
    args = ap.parse_args()

    domains = load_domains(config.DOMAINS_DIR)
    if args.domain not in domains:
        print(f"dominio desconocido: {args.domain}. Hay: {list(domains)}")
        return 2
    if not args.folder.is_dir():
        print(f"no existe la carpeta {args.folder}")
        return 2

    clips = collect(args.folder, args.limit)
    if not clips:
        print(f"No hay clips pos_* / neg_* en {args.folder}.")
        print("Usa tools/prepare_dataset.py para renombrarlos.")
        return 2

    judge = VLMJudge()
    use_vlm = not args.no_vlm and not judge.offline
    tracker = PoseTracker(config.POSE_MODEL, device=config.DEVICE,
                          conf=args.conf, imgsz=args.imgsz)

    stage1, stage2, totals = Counts(), Counts(), Totals()
    peaks_pos: list[dict] = []
    peaks_neg: list[dict] = []
    people_pos: list[int] = []
    people_neg: list[int] = []
    wall = time.time()
    n_pos = sum(1 for _p, e in clips if e)

    print(f"\nDominio: {domains[args.domain].label}")
    print(f"Clips:   {len(clips)}  ({n_pos} con incidente, {len(clips) - n_pos} sin)")
    print(f"VLM:     {'si' if use_vlm else 'no (solo Etapa 1)'}\n")

    for i, (path, expected) in enumerate(clips, start=1):
        gate = Gate(domains[args.domain])
        try:
            fired, confirmed, n, peaks, people = run_clip(
                path, tracker, gate, judge, use_vlm, totals)
        except Exception as exc:                          # noqa: BLE001
            print(f"  [{i}/{len(clips)}] {path.name}: ERROR {exc}", file=sys.stderr)
            continue

        (peaks_pos if expected else peaks_neg).append(peaks)
        (people_pos if expected else people_neg).append(people)

        stage1.add(expected, fired)
        if use_vlm:
            stage2.add(expected, confirmed)

        predicted = confirmed if use_vlm else fired
        mark = "ok " if predicted == expected else ("FN " if expected else "FP ")
        print(f"  [{i}/{len(clips)}] {mark} {path.name[:38]:<38} "
              f"gate={n} vlm={'si' if confirmed else 'no'}")

    report(stage1, stage2, totals, use_vlm, len(clips), time.time() - wall)
    diagnose(peaks_pos, peaks_neg, people_pos, people_neg)

    if args.out:
        args.out.write_text(json.dumps({
            "domain": args.domain,
            "clips": len(clips),
            "positives": n_pos,
            "used_vlm": use_vlm,
            "stage1": stage1.as_dict(),
            "stage2": stage2.as_dict() if use_vlm else None,
            "frames": totals.frames,
            "seconds_of_video": round(totals.seconds, 1),
            "vlm_calls": totals.vlm_calls,
            "vlm_errors": totals.vlm_errors,
            "avg_latency_ms": (sum(totals.latencies) // len(totals.latencies)
                               if totals.latencies else None),
        }, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  resultado guardado en {args.out}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
