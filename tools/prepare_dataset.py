"""Adapta datasets publicos a la convencion que espera tools/bench.py.

bench.py solo entiende `pos_*.mp4` (hay incidente) y `neg_*.mp4` (no lo hay).
Este script crea esos nombres como enlaces o copias, sin tocar el dataset
original.

    python -m tools.prepare_dataset rwf2000  D:\\RWF-2000\\val      data\\samples
    python -m tools.prepare_dataset ucfcrime D:\\UCF_Crimes\\Videos data\\samples --classes Shoplifting,Stealing
    python -m tools.prepare_dataset flat     D:\\mis_clips          data\\samples

Layouts reconocidos:

  rwf2000   <raiz>/Fight/*.avi  y  <raiz>/NonFight/*.avi
  ucfcrime  <raiz>/<Clase>/*.mp4 ; las clases pasadas en --classes son positivas
            y `Normal_Videos_event` (o cualquier carpeta con "normal") negativa
  flat      <raiz>/ con subcarpetas `pos` y `neg`
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

VIDEO_EXT = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def _videos(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in VIDEO_EXT)


def collect_rwf2000(root: Path, _classes) -> list[tuple[Path, bool]]:
    pairs = []
    for name, positive in (("Fight", True), ("NonFight", False)):
        found = _videos(root / name)
        if not found:
            print(f"  aviso: no encuentro {root / name}", file=sys.stderr)
        pairs += [(p, positive) for p in found]
    return pairs


def collect_ucfcrime(root: Path, classes: list[str]) -> list[tuple[Path, bool]]:
    wanted = {c.strip().lower() for c in classes if c.strip()}
    pairs = []
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        key = folder.name.lower()
        if "normal" in key:
            positive = False
        elif not wanted or key in wanted:
            positive = True
        else:
            continue
        pairs += [(p, positive) for p in _videos(folder)]
    return pairs


def collect_flat(root: Path, _classes) -> list[tuple[Path, bool]]:
    pairs = [(p, True) for p in _videos(root / "pos")]
    pairs += [(p, False) for p in _videos(root / "neg")]
    return pairs


LAYOUTS = {
    "rwf2000": collect_rwf2000,
    "ucfcrime": collect_ucfcrime,
    "flat": collect_flat,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("layout", choices=sorted(LAYOUTS))
    ap.add_argument("source", type=Path)
    ap.add_argument("dest", type=Path)
    ap.add_argument("--classes", default="",
                    help="ucfcrime: clases positivas separadas por coma")
    ap.add_argument("--limit", type=int, default=0,
                    help="maximo de clips por etiqueta (0 = todos)")
    ap.add_argument("--copy", action="store_true",
                    help="copiar en vez de enlazar (usalo si los symlink fallan)")
    args = ap.parse_args()

    if not args.source.is_dir():
        print(f"La ruta de origen no existe: {args.source}")
        return 2

    pairs = LAYOUTS[args.layout](args.source, args.classes.split(","))
    if not pairs:
        print("No encontre videos con ese layout. Revisa la estructura de carpetas.")
        return 2

    if args.limit:
        pos = [p for p in pairs if p[1]][: args.limit]
        neg = [p for p in pairs if not p[1]][: args.limit]
        pairs = pos + neg

    args.dest.mkdir(parents=True, exist_ok=True)
    counters = {True: 0, False: 0}
    linked = copied = failed = 0

    for src, positive in pairs:
        prefix = "pos" if positive else "neg"
        counters[positive] += 1
        target = args.dest / f"{prefix}_{counters[positive]:04d}{src.suffix.lower()}"
        if target.exists():
            target.unlink()
        if args.copy:
            shutil.copy2(src, target)
            copied += 1
        else:
            try:
                os.symlink(src.resolve(), target)
                linked += 1
            except OSError:
                # En Windows los symlink necesitan Modo Desarrollador o admin.
                shutil.copy2(src, target)
                copied += 1

    n_pos, n_neg = counters[True], counters[False]
    print(f"\n  positivos  {n_pos}")
    print(f"  negativos  {n_neg}")
    print(f"  enlazados  {linked}   copiados {copied}" + (f"   fallidos {failed}" if failed else ""))
    print(f"  destino    {args.dest.resolve()}")
    if n_pos == 0 or n_neg == 0:
        print("\n  Aviso: sin ambas clases el benchmark no puede dar precision ni recall.")
    print(f"\n  Siguiente paso:\n    .venv\\Scripts\\python.exe -m tools.bench {args.dest} --domain violence\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
