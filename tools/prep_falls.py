r"""Corta el Multiple Cameras Fall Dataset en clips que el pipeline pueda medir.

El dataset viene como 24 escenarios grabados a la vez por 8 camaras, con un CSV
que marca ventanas de 30 frames (1 s a 30 fps) y una etiqueta por ventana. Un
segundo es demasiado corto para este pipeline: el gate exige `min_track_seconds`
y `sustain_seconds` antes de disparar, asi que un clip de 1 s no llega ni a
tener historial. Aqui se usa el CSV solo para LOCALIZAR la caida, y se corta una
ventana util alrededor.

Dos decisiones que cambian lo que se mide:

  El positivo lleva cola. Lo que separa una caida de un tropiezo es quedarse en
  el suelo, y la senal de inmovilidad necesita ver ese despues. Por eso se
  recortan 3 s posteriores al final de la caida, no solo la caida.

  El negativo sale del MISMO video, antes de la caida. Misma camara, misma
  persona, misma luz, mismo encuadre: si el gate distingue, distingue el
  movimiento y no el decorado. Un negativo sacado de otra grabacion habria
  dejado la puerta abierta a que el modelo acertase por el fondo.

    .venv\Scripts\python.exe -m tools.prep_falls
"""
from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path

import cv2

FPS = 30.0                 # el AVI declara 120 en la cabecera; el dataset es 30
PAD_PRE = 45               # 1.5 s de pie antes del impacto
PAD_POST = 90              # 3 s en el suelo despues: aqui vive la inmovilidad
NEG_FRAMES = 165           # 5.5 s de actividad normal
NEG_MARGEN = 60            # separacion entre el negativo y el inicio de la caida


def segmentos(csv_path: Path) -> dict[tuple[int, int], list[tuple[int, int, int]]]:
    fuera: dict[tuple[int, int], list[tuple[int, int, int]]] = defaultdict(list)
    for fila in csv.DictReader(csv_path.open(encoding="utf-8")):
        chute = int(float(fila["chute"]))
        cam = int(float(fila["cam"]))
        # El CSV trae una errata: chute 23 tiene una fila con cam 55, y es la
        # camara 3 la que se queda con una ventana de menos.
        if cam > 8:
            cam = 3
        fuera[(chute, cam)].append(
            (int(float(fila["start"])), int(float(fila["end"])), int(float(fila["label"])))
        )
    return fuera


def recortar(origen: Path, destino: Path, desde: int, hasta: int) -> bool:
    captura = cv2.VideoCapture(str(origen))
    if not captura.isOpened():
        return False
    ancho = int(captura.get(cv2.CAP_PROP_FRAME_WIDTH))
    alto = int(captura.get(cv2.CAP_PROP_FRAME_HEIGHT))
    captura.set(cv2.CAP_PROP_POS_FRAMES, desde)
    salida = cv2.VideoWriter(
        str(destino), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (ancho, alto)
    )
    escritos = 0
    while escritos < hasta - desde:
        ok, frame = captura.read()
        if not ok:
            break
        salida.write(frame)
        escritos += 1
    salida.release()
    captura.release()
    if escritos < int(FPS * 2):
        # Menos de 2 s no da ni para formar un track: no es una muestra, es ruido.
        destino.unlink(missing_ok=True)
        return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raiz", type=Path, default=Path("data/raw/falls"))
    ap.add_argument("--salida", type=Path, default=Path("data/falls"))
    args = ap.parse_args()

    videos = args.raiz / "dataset" / "dataset"
    args.salida.mkdir(parents=True, exist_ok=True)

    porcam = segmentos(args.raiz / "data_tuple3.csv")
    positivos = 0
    negativos = 0
    saltados = 0

    for (chute, cam), segs in sorted(porcam.items()):
        origen = videos / f"chute{chute:02d}" / f"cam{cam}.avi"
        if not origen.exists():
            saltados += 1
            continue

        captura = cv2.VideoCapture(str(origen))
        total = int(captura.get(cv2.CAP_PROP_FRAME_COUNT))
        captura.release()

        caidas = [(s, e) for s, e, etiqueta in segs if etiqueta == 1]
        nombre = f"{chute:02d}_{cam}"

        if caidas:
            inicio = max(0, min(s for s, _ in caidas) - PAD_PRE)
            fin = min(total, max(e for _, e in caidas) + PAD_POST)
            if recortar(origen, args.salida / f"pos_{nombre}.mp4", inicio, fin):
                positivos += 1
            else:
                saltados += 1

            # El negativo se toma antes de la caida, con margen para que no se
            # cuele ni el principio del desequilibrio.
            tope = inicio - NEG_MARGEN
            if tope >= NEG_FRAMES:
                if recortar(
                    origen, args.salida / f"neg_{nombre}.mp4", tope - NEG_FRAMES, tope
                ):
                    negativos += 1
        else:
            # Escenario de actividad cotidiana: todo el video es negativo, pero
            # basta una ventana para no inundar el set con el mismo plano.
            centro = total // 2
            if recortar(
                origen,
                args.salida / f"neg_{nombre}.mp4",
                max(0, centro - NEG_FRAMES // 2),
                min(total, centro + NEG_FRAMES // 2),
            ):
                negativos += 1

    print(f"positivos {positivos}  negativos {negativos}  saltados {saltados}")
    print(f"en {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
