"""Descarga un dataset de Kaggle y lo deja listo para tools/bench.py.

Hace las tres cosas de un tirón: baja, descomprime y renombra los clips a la
convencion `pos_*` / `neg_*` que espera el benchmark, sin tocar el original.

    .venv\\Scripts\\python.exe -m tools.get_dataset --list
    .venv\\Scripts\\python.exe -m tools.get_dataset rwf2000
    .venv\\Scripts\\python.exe -m tools.get_dataset --search "violence detection"

Requiere estar autenticado:  .venv\\Scripts\\kaggle.exe auth login
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

VIDEO_EXT = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

# Los nombres de carpeta que marcan cada clase. Se buscan sin distinguir
# mayusculas y a cualquier profundidad del arbol, porque cada dataset de Kaggle
# se empaqueta a su manera.
RECIPES: dict[str, dict] = {
    "scvd": {
        "slug": "toluwaniaremu/smartcity-cctv-violence-detection-dataset-scvd",
        "domain": "violence",
        "pos": ["violence", "violent", "fight"],
        "neg": ["normal", "nonviolence", "non_violence", "weaponized"],
        "size": "1.1 GB",
        "note": "CCTV de ciudad. El mas parecido a donde se desplegaria esto.",
    },
    "rlvs": {
        "slug": "mohamedmustafa/real-life-violence-situations-dataset",
        "domain": "violence",
        "pos": ["violence"],
        "neg": ["nonviolence", "non_violence"],
        "size": "3.8 GB",
        "note": "2000 clips, el mas citado de los pequenos. Usabilidad 0.94.",
    },
    "rwf2000": {
        "slug": "vulamnguyen/rwf2000",
        "domain": "violence",
        "pos": ["fight"],
        "neg": ["nonfight", "non_fight"],
        "size": "12.3 GB",
        "note": "2000 clips de 5 s, balanceado, split predefinido. Mirror pesado.",
    },
    "ucfcrime": {
        "slug": "mission-ai/crimeucfdataset",
        "domain": "violence",
        "pos": ["fighting", "assault", "robbery", "stealing", "shoplifting",
                "burglary", "abuse"],
        "neg": ["normal", "normal_videos", "normal_videos_event", "testing_normal"],
        "size": "35 GB",
        "note": "CCTV de 240p: la pose degrada y el recall cae. Enorme, ojo.",
    },
}


def run(cmd: list[str]) -> int:
    print("  $", " ".join(cmd))
    return subprocess.call(cmd)


def kaggle_cmd() -> list[str]:
    """Prefiere el kaggle del venv; si no, el modulo de Python."""
    exe = Path(sys.executable).parent / "kaggle.exe"
    if exe.exists():
        return [str(exe)]
    return [sys.executable, "-m", "kaggle"]


def check_auth() -> bool:
    proc = subprocess.run(kaggle_cmd() + ["datasets", "list", "-s", "test", "--csv"],
                          capture_output=True, text=True)
    if proc.returncode == 0:
        return True
    print("\nKaggle no esta autenticado todavia.\n")
    print("  Ejecuta esto y sigue el flujo web (no hay token que gestionar):")
    print(f"    {kaggle_cmd()[0]} auth login\n")
    print("  Alternativa: genera un token en https://www.kaggle.com/settings/api")
    print("  y expórtalo como KAGGLE_API_TOKEN.\n")
    detail = (proc.stderr or proc.stdout or "").strip()
    if detail:
        print("  Detalle:", detail.splitlines()[0][:160], "\n")
    return False


def find_class_dirs(root: Path, names: list[str]) -> list[Path]:
    """Carpetas cuyo nombre coincide con alguno de `names`, a cualquier nivel."""
    wanted = {n.lower().replace("-", "_") for n in names}
    found = []
    for path in root.rglob("*"):
        if path.is_dir() and path.name.lower().replace("-", "_") in wanted:
            found.append(path)
    return found


def videos_in(dirs: list[Path]) -> list[Path]:
    out: list[Path] = []
    for d in dirs:
        out += sorted(p for p in d.rglob("*") if p.suffix.lower() in VIDEO_EXT)
    return out


def link_or_copy(src: Path, dst: Path) -> str:
    if dst.exists():
        dst.unlink()
    try:
        os.symlink(src.resolve(), dst)
        return "link"
    except OSError:
        # En Windows los symlink piden Modo Desarrollador o permisos de admin.
        shutil.copy2(src, dst)
        return "copy"


def prepare(raw: Path, recipe: dict, dest: Path, limit: int) -> tuple[int, int]:
    pos_dirs = find_class_dirs(raw, recipe["pos"])
    neg_dirs = find_class_dirs(raw, recipe["neg"])
    if not pos_dirs and not neg_dirs:
        print(f"\n  No encontre las carpetas de clase dentro de {raw}.")
        print(f"  Buscaba: positivas {recipe['pos']}, negativas {recipe['neg']}")
        print("  Arbol de primer nivel:")
        for p in sorted(raw.iterdir())[:15]:
            print("   ", p.name + ("/" if p.is_dir() else ""))
        print("\n  Ajusta 'pos'/'neg' en RECIPES o usa tools/prepare_dataset.py.")
        return 0, 0

    pos = videos_in(pos_dirs)
    neg = videos_in(neg_dirs)
    if limit:
        pos, neg = pos[:limit], neg[:limit]

    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.iterdir():
        if old.suffix.lower() in VIDEO_EXT:
            old.unlink()

    for prefix, group in (("pos", pos), ("neg", neg)):
        for i, src in enumerate(group, start=1):
            link_or_copy(src, dest / f"{prefix}_{i:04d}{src.suffix.lower()}")
    return len(pos), len(neg)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", help=f"uno de: {', '.join(RECIPES)}")
    ap.add_argument("--list", action="store_true", help="lista las recetas conocidas")
    ap.add_argument("--search", help="busca datasets en Kaggle por texto")
    ap.add_argument("--limit", type=int, default=0,
                    help="maximo de clips por clase (0 = todos)")
    ap.add_argument("--raw", type=Path, default=Path("data/raw"),
                    help="donde se descomprime el dataset original")
    args = ap.parse_args()

    if args.list:
        print()
        for key, r in RECIPES.items():
            print(f"  {key:<10} {r.get('size', '?'):>8}  {r['slug']}")
            print(f"  {'':<10} {'':>8}  {r['note']}")
        print(f"\n  Uso: python -m tools.get_dataset rwf2000 --limit 100\n")
        return 0

    if args.search:
        if not check_auth():
            return 1
        return run(kaggle_cmd() + ["datasets", "list", "-s", args.search])

    if not args.name:
        ap.print_help()
        return 2
    if args.name not in RECIPES:
        print(f"receta desconocida: {args.name}. Hay: {list(RECIPES)}")
        return 2
    if not check_auth():
        return 1

    recipe = RECIPES[args.name]
    raw = args.raw / args.name
    raw.mkdir(parents=True, exist_ok=True)

    already = any(p.suffix.lower() in VIDEO_EXT for p in raw.rglob("*"))
    if already:
        print(f"\n  Ya hay videos en {raw}, me salto la descarga.")
    else:
        print(f"\n  Descargando {recipe['slug']} ...")
        code = run(kaggle_cmd() + ["datasets", "download", "-d", recipe["slug"],
                                   "-p", str(raw), "--unzip"])
        if code != 0:
            print("\n  Fallo la descarga. Comprueba que has aceptado las condiciones")
            print(f"  del dataset en https://www.kaggle.com/datasets/{recipe['slug']}")
            return code

    dest = Path("data") / args.name
    n_pos, n_neg = prepare(raw, recipe, dest, args.limit)
    if not n_pos and not n_neg:
        return 1

    print(f"\n  positivos  {n_pos}")
    print(f"  negativos  {n_neg}")
    print(f"  destino    {dest.resolve()}")
    print(f"\n  Siguiente paso (Etapa 1, gratis y rapido):")
    print(f"    .venv\\Scripts\\python.exe -m tools.bench {dest} "
          f"--domain {recipe['domain']} --no-vlm")
    print(f"\n  Y luego con VLM sobre una muestra, que cuesta cuota:")
    print(f"    .venv\\Scripts\\python.exe -m tools.bench {dest} "
          f"--domain {recipe['domain']} --limit 40 --out data/bench_{args.name}.json\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
