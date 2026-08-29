"""Elige clips que el sistema detecta de verdad y los deja listos para la demo.

Ensenar en vivo un clip que el gate dispara pero el VLM descarta es peor que no
ensenar nada: la tarjeta sale en gris delante del jurado. Por eso el criterio no
es "el gate disparo" sino "la cascada entera lo confirmo como incidente".

Dos fases:

  --candidatos   saca los mejores aciertos de un JSON de benchmark y los copia
                 a data/demo/<dominio>/. Gratis, no llama al VLM.
  --confirmar    pasa esa carpeta por la cascada completa y borra los que el
                 VLM no confirme. Gasta cuota, pero deja solo lo que funciona.

    python -m tools.pick_demos --candidatos data/bench_scvd_v2.json --dominio violence
    python -m tools.pick_demos --confirmar violence
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from backend import config
from backend.core.buffer import RingBuffer
from backend.core.gate import Gate, load_domains
from backend.core.tracker import PoseTracker
from backend.core.vlm import VLMJudge

DEMO_DIR = Path("data/demo")


def candidatos(bench_json: Path, dominio: str, origen: Path, cuantos: int) -> int:
    """Copia los aciertos con mejor score. Mejor score = gesto mas claro."""
    data = json.loads(bench_json.read_text(encoding="utf-8"))
    detalle = data.get("clips_detalle") or []
    if not detalle:
        print(f"  {bench_json} no tiene detalle por clip.")
        return 0

    aciertos = [c for c in detalle if c["positivo"] and c["disparo"]]
    if not aciertos:
        print("  Ese benchmark no tiene ningun acierto; no hay nada que ensenar.")
        return 0
    aciertos.sort(key=lambda c: -c["score"])

    destino = DEMO_DIR / dominio
    destino.mkdir(parents=True, exist_ok=True)
    copiados = 0
    for c in aciertos[: cuantos * 3]:          # de sobra, luego se podan
        src = origen / c["clip"]
        if not src.exists():
            continue
        shutil.copy2(src, destino / f"pos_{copiados + 1:02d}.mp4")
        print(f"    {c['clip']:<28} score {c['score']:.2f}")
        copiados += 1
        if copiados >= cuantos * 3:
            break

    print(f"\n  {copiados} candidatos en {destino}")
    print(f"  Ahora: python -m tools.pick_demos --confirmar {dominio}")
    return copiados


def confirmar(dominio: str, quedarse: int) -> int:
    """Pasa los candidatos por la cascada y deja solo los que el VLM confirma."""
    carpeta = DEMO_DIR / dominio
    clips = sorted(carpeta.glob("*.mp4"))
    if not clips:
        print(f"  No hay candidatos en {carpeta}.")
        return 0

    domains = load_domains(config.DOMAINS_DIR)
    if dominio not in domains:
        print(f"  dominio desconocido: {dominio}")
        return 2
    domain = domains[dominio]

    judge = VLMJudge()
    if judge.offline:
        print("  Sin GEMINI_API_KEY no se puede confirmar nada.")
        return 1
    tracker = PoseTracker(config.POSE_MODEL, device=config.DEVICE, imgsz=config.POSE_IMGSZ)

    import cv2
    import numpy as np
    from backend.core.signals import TrackHistory

    confirmados: list[Path] = []
    for path in clips:
        cap = cv2.VideoCapture(str(path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        paso = max(1, int(round(fps / 12.0)))
        buffer = RingBuffer(config.BUFFER_SECONDS, fps=fps / paso)
        gate = Gate(domain)
        hist_por_id: dict[int, TrackHistory] = {}
        disparos: list[tuple] = []
        i = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            i += 1
            if i % paso:
                continue
            t = i / fps
            buffer.push(t, frame)
            ratio = min(1.0, config.VLM_MAX_WIDTH / frame.shape[1])
            for tr in tracker(frame):
                h = hist_por_id.setdefault(tr["id"], TrackHistory(tr["id"]))
                h.push(t, tr["bbox"], tr["kp"])
            ctx = {"now": t, "tracks": hist_por_id,
                   "frame_shape": frame.shape, "zones": domain.zones}
            for h in list(hist_por_id.values()):
                if abs(h.last_seen - t) > 1e-9:
                    continue
                vals, _s, fire = gate.evaluate(h, ctx)
                if fire and len(disparos) < 2:
                    disparos.append((dict(vals), t, ratio,
                                     [(s.t, np.array(s.bbox, copy=True),
                                       np.array(s.kp, copy=True)) for s in h.samples]))
        cap.release()

        veredicto = None
        for vals, t, ratio, muestras in disparos:
            try:
                v, _f, _ms = judge.judge(
                    buffer, domain, vals,
                    t - config.CLIP_PRE_SECONDS, t + config.CLIP_POST_SECONDS,
                    lambda ts, m=muestras, r=ratio: _caja(m, ts, r))
                if v.incident:
                    veredicto = v
                    break
            except Exception as exc:                      # noqa: BLE001
                print(f"    aviso: {exc}")

        if veredicto:
            confirmados.append(path)
            print(f"  OK    {path.name:<14} {veredicto.incident_type} "
                  f"({veredicto.confidence:.0%})")
        else:
            print(f"  fuera {path.name:<14} el VLM no lo confirma")

    # Se quedan los mejores; el resto se borra para que la web solo ofrezca
    # clips que de verdad funcionan.
    for p in clips:
        if p not in confirmados[:quedarse]:
            p.unlink(missing_ok=True)
    for n, p in enumerate(sorted(DEMO_DIR.joinpath(dominio).glob("*.mp4")), start=1):
        p.rename(p.with_name(f"demo_{n:02d}.mp4"))

    quedan = len(list((DEMO_DIR / dominio).glob("*.mp4")))
    print(f"\n  {quedan} clips confirmados en {DEMO_DIR / dominio}")
    return quedan


def _caja(muestras, ts, ratio):
    if not muestras:
        return None
    st, bbox, _kp = min(muestras, key=lambda s: abs(s[0] - ts))
    return [v * ratio for v in bbox]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidatos", type=Path, help="JSON de bench del que sacarlos")
    ap.add_argument("--origen", type=Path, help="carpeta con los clips originales")
    ap.add_argument("--dominio", help="dominio al que pertenecen")
    ap.add_argument("--confirmar", help="confirma los candidatos de ese dominio")
    ap.add_argument("--cuantos", type=int, default=2, help="cuantos dejar al final")
    args = ap.parse_args()

    if args.confirmar:
        return 0 if confirmar(args.confirmar, args.cuantos) else 1
    if args.candidatos:
        if not args.dominio:
            print("  Falta --dominio")
            return 2
        origen = args.origen or Path("data") / args.candidatos.stem.replace(
            "bench_", "").replace("_v2", "").replace("_etapa1", "").replace("_detalle", "")
        if not origen.is_dir():
            print(f"  No encuentro los clips originales en {origen}; usa --origen")
            return 2
        return 0 if candidatos(args.candidatos, args.dominio, origen, args.cuantos) else 1
    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
