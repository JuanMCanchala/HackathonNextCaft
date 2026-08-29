"""Busca el mejor diseno de gate sobre un JSON de benchmark ya medido.

Cada pasada de bench.py cuesta 15 minutos de inferencia. Este script reutiliza
sus datos por clip para evaluar decenas de configuraciones en un segundo, sin
volver a tocar un solo frame. Solo se vuelve a pasar video cuando cambia algo
que afecta a la DETECCION (imgsz, conf); todo lo que viene despues -- pesos,
umbral, requisitos, forma de combinar -- se decide aqui.

    .venv\\Scripts\\python.exe -m tools.tune data\\bench_shoplifting_etapa1.json

Criterio: en una cascada manda el recall. Un falso negativo se pierde para
siempre; un falso positivo solo cuesta una llamada al VLM. Por eso se ordena
por recall a un techo de falsos positivos, y no por F1.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def evaluar(clips: list[dict], puntuar, umbral: float) -> dict:
    tp = fp = fn = tn = 0
    for c in clips:
        pred = puntuar(c) >= umbral
        if c["positivo"] and pred:
            tp += 1
        elif c["positivo"]:
            fn += 1
        elif pred:
            fp += 1
        else:
            tn += 1
    n_pos, n_neg = tp + fn, fp + tn
    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "recall": tp / n_pos if n_pos else 0.0,
        "fpr": fp / n_neg if n_neg else 0.0,
        "precision": tp / (tp + fp) if (tp + fp) else 0.0,
        "llamadas": tp + fp,
    }


def media_ponderada(pesos: dict[str, float]):
    """El diseno actual: media de las senales ponderada."""
    total = sum(pesos.values()) or 1.0

    def f(c):
        picos = c["picos"]
        return sum(picos.get(k, 0.0) * w for k, w in pesos.items()) / total
    return f


def mejor_evidencia(pesos: dict[str, float]):
    """La senal mas fuerte manda, sin que las demas la diluyan.

    Una media castiga la evidencia de una sola senal: con concealment a 0.90 y
    el resto a 0.10, la media baja a 0.60 aunque haya una senal gritando. En
    generacion de candidatos eso es justo lo que no se quiere.
    """
    def f(c):
        picos = c["picos"]
        return max((picos.get(k, 0.0) for k in pesos), default=0.0)
    return f


def mixto(pesos: dict[str, float], alpha: float = 0.6):
    """Mezcla: la mejor senal pesa `alpha`, la media el resto."""
    media = media_ponderada(pesos)
    mejor = mejor_evidencia(pesos)

    def f(c):
        return alpha * mejor(c) + (1 - alpha) * media(c)
    return f


def barrer(clips: list[dict], puntuar, techo_fpr: float):
    """Mejor recall alcanzable sin pasar del techo de falsos positivos."""
    mejor = None
    for i in range(0, 101):
        th = i / 100
        r = evaluar(clips, puntuar, th)
        if r["fpr"] <= techo_fpr and (mejor is None or r["recall"] > mejor[1]["recall"]):
            mejor = (th, r)
    return mejor


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("json", type=Path)
    ap.add_argument("--fpr", type=float, default=0.40,
                    help="techo de falsos positivos aceptable (0-1)")
    args = ap.parse_args()

    data = json.loads(args.json.read_text(encoding="utf-8"))
    clips = data.get("clips_detalle")
    if not clips:
        print("Ese JSON no tiene `clips_detalle`. Vuelve a correr bench.py "
              "con la version que guarda el detalle por clip.")
        return 2

    pesos = data.get("weights") or {}
    n_pos = sum(1 for c in clips if c["positivo"])
    print(f"\n  {args.json.name}  ·  {len(clips)} clips "
          f"({n_pos} con incidente, {len(clips) - n_pos} sin)")
    print(f"  Config medida: umbral {data.get('threshold')}  "
          f"imgsz {data.get('imgsz')}  conf {data.get('conf')}")
    print(f"  Criterio: maximo recall sin pasar de {args.fpr:.0%} de falsos positivos\n")

    disenos = [
        ("media ponderada (actual)", media_ponderada(pesos)),
        ("mejor evidencia", mejor_evidencia(pesos)),
        ("mixto 60/40", mixto(pesos, 0.6)),
        ("mixto 80/20", mixto(pesos, 0.8)),
    ]

    print("=" * 74)
    print(f"  {'diseno':<28}{'umbral':>8}{'recall':>9}{'FPR':>8}"
          f"{'precision':>11}{'llamadas':>10}")
    print("=" * 74)
    for nombre, fn in disenos:
        hit = barrer(clips, fn, args.fpr)
        if hit is None:
            print(f"  {nombre:<28}{'—':>8}  no alcanza ese techo de FPR")
            continue
        th, r = hit
        print(f"  {nombre:<28}{th:>8.2f}{r['recall']:>9.1%}{r['fpr']:>8.1%}"
              f"{r['precision']:>11.1%}{r['llamadas']:>10}")

    # Cuanto cuestan los `require`
    con = sum(1 for c in clips if c["positivo"] and c["score"] > 0)
    sin = sum(1 for c in clips if c["positivo"] and c["score_sin_require"] > 0)
    if data.get("require"):
        print()
        print("=" * 74)
        print("  COSTE DE LOS `require`")
        print("=" * 74)
        print(f"  requisitos: {data['require']}")
        print(f"  positivos que puntuan con ellos      {con}/{n_pos}")
        print(f"  positivos que puntuarian sin ellos   {sin}/{n_pos}")
        if sin > con:
            print(f"  -> los requisitos silencian {sin - con} incidentes por completo")
        else:
            print("  -> los requisitos no estan silenciando nada; el problema es otro")

    # Que senal aporta de verdad
    print()
    print("=" * 74)
    print("  APORTE DE CADA SENAL  ·  recall al usarla SOLA")
    print("=" * 74)
    nombres = sorted({k for c in clips for k in c["picos"]})
    for name in nombres:
        hit = barrer(clips, lambda c, k=name: c["picos"].get(k, 0.0), args.fpr)
        if hit is None:
            print(f"  {name:<18}  no separa a ese techo de FPR")
            continue
        th, r = hit
        print(f"  {name:<18}  umbral {th:.2f}   recall {r['recall']:>6.1%}"
              f"   FPR {r['fpr']:>6.1%}")

    print("\n  Solo hay que volver a pasar video si cambia imgsz o conf.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
