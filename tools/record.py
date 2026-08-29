"""Graba clips etiquetados para el benchmark, sin pelearse con el backend.

No existe dataset publico decente de robo en tienda, asi que para ese dominio
los unicos numeros honestos salen de clips propios. Y aunque existiera, la
distribucion que importa es la de la sala donde se va a hacer la demo.

El backend tiene la camara abierta, asi que el script le pide una pausa por la
API, graba, y lo reanuda al terminar.

    .venv\\Scripts\\python.exe -m tools.record pos --seconds 8
    .venv\\Scripts\\python.exe -m tools.record neg --seconds 8 --count 5

Convencion: `pos` = el clip contiene el incidente, `neg` = no lo contiene.
"""
from __future__ import annotations

import argparse
import time
import urllib.error
import urllib.request
from pathlib import Path

import cv2

API = "http://127.0.0.1:8000"


def api(path: str, method: str = "POST") -> bool:
    try:
        req = urllib.request.Request(API + path, method=method)
        with urllib.request.urlopen(req, timeout=8) as res:
            return 200 <= res.status < 300
    except (urllib.error.URLError, OSError):
        return False


def backend_running() -> bool:
    """Si ya estaba en pausa, no hay que reanudarlo al terminar.

    Reanudar un backend que el operador habia parado a proposito le cambia el
    estado a su espalda y le vuelve a encender la camara.
    """
    try:
        with urllib.request.urlopen(API + "/api/state", timeout=8) as res:
            import json
            return json.loads(res.read()).get("status") == "running"
    except (urllib.error.URLError, OSError, ValueError):
        return False


def next_index(folder: Path, label: str) -> int:
    used = [p.stem for p in folder.glob(f"{label}_*.mp4")]
    numbers = []
    for stem in used:
        tail = stem.split("_", 1)[-1]
        if tail.isdigit():
            numbers.append(int(tail))
    return max(numbers, default=0) + 1


def countdown(seconds: int) -> None:
    for n in range(seconds, 0, -1):
        print(f"\r  empieza en {n}... ", end="", flush=True)
        time.sleep(1)
    print("\r  GRABANDO           ")


def record(cap: cv2.VideoCapture, path: Path, seconds: float, fps: float) -> int:
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        raise RuntimeError("OpenCV no pudo abrir el escritor de video")

    frames = 0
    deadline = time.time() + seconds
    period = 1.0 / fps
    while time.time() < deadline:
        ok, frame = cap.read()
        if not ok:
            break
        writer.write(frame)
        frames += 1
        time.sleep(period * 0.5)
    writer.release()
    return frames


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("label", choices=["pos", "neg"])
    ap.add_argument("--dir", type=Path, default=Path("data/propios"))
    ap.add_argument("--seconds", type=float, default=8.0)
    ap.add_argument("--count", type=int, default=1, help="cuantos clips seguidos")
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--fps", type=float, default=15.0)
    ap.add_argument("--prep", type=int, default=5, help="cuenta atras antes de grabar")
    args = ap.parse_args()

    args.dir.mkdir(parents=True, exist_ok=True)

    estaba_activo = backend_running()
    if estaba_activo:
        api("/api/pause")
        print("  backend en pausa, camara liberada")
        time.sleep(1.5)
    else:
        print("  (el backend no estaba activo; la camara deberia estar libre)")

    cap = cv2.VideoCapture(args.camera, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print(f"\n  No pude abrir la camara {args.camera}.")
        print("  Si el backend sigue con ella, pausalo desde el dashboard.")
        if estaba_activo:
            api("/api/resume")
        return 1

    written = []
    try:
        for n in range(1, args.count + 1):
            idx = next_index(args.dir, args.label)
            path = args.dir / f"{args.label}_{idx:03d}.mp4"
            que = ("HAZ el incidente" if args.label == "pos"
                   else "comportate con NORMALIDAD")
            print(f"\n  Clip {n}/{args.count} -> {path.name}   ({que})")
            countdown(args.prep)
            frames = record(cap, path, args.seconds, args.fps)
            print(f"  {frames} frames en {args.seconds:.0f}s")
            written.append(path)
    finally:
        cap.release()
        if estaba_activo:
            api("/api/resume")
            print("\n  backend reanudado")

    pos = len(list(args.dir.glob("pos_*.mp4")))
    neg = len(list(args.dir.glob("neg_*.mp4")))
    print(f"\n  En {args.dir}:  {pos} positivos, {neg} negativos")
    if pos and neg:
        print(f"\n  Ya se puede medir:")
        print(f"    .venv\\Scripts\\python.exe -m tools.bench {args.dir} "
              f"--domain retail_theft --out data\\bench_propios.json")
    else:
        falta = "negativos (neg)" if not neg else "positivos (pos)"
        print(f"\n  Faltan clips {falta} para poder medir precision y recall.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
