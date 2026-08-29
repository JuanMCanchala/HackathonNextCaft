"""Anonimizado de caras antes de que el frame salga de la maquina.

El sistema afirma que no hace biometria. Guardar JPEG con caras visibles y
ademas mandarlos a un modelo en la nube contradice esa afirmacion, por mucho
que al modelo se le prohiba comentarlas.

Aqui se difumina la cabeza en el momento de entrar al buffer circular. Todo lo
que viene despues -- la evidencia guardada, los frames que viajan al VLM, la
foto del aviso -- ya sale sin cara. La vigilancia deja de depender de una
promesa y pasa a ser una propiedad del sistema.

La region sale de los keypoints de la cabeza (nariz, ojos, orejas). Si no se
ven, se recurre a la parte superior de la caja de la persona, que es donde esta
la cabeza en cualquier postura de pie; una caida deja la cabeza en un lateral,
asi que ahi el respaldo cubre de mas a proposito.
"""
from __future__ import annotations

import cv2
import numpy as np

HEAD_KP = (0, 1, 2, 3, 4)     # nariz, ojos, orejas
KP_CONF = 0.3
PAD = 0.55                     # margen sobre los keypoints, en anchos de cabeza
FALLBACK_TOP = 0.26            # fraccion superior de la caja si no hay cara
MIN_SIZE = 10


def head_box(kp: np.ndarray | None, bbox) -> tuple[int, int, int, int] | None:
    """Region de la cabeza en pixeles, o None si no se puede situar."""
    pts = []
    if kp is not None and len(kp) > max(HEAD_KP):
        pts = [(float(kp[i][0]), float(kp[i][1]))
               for i in HEAD_KP if float(kp[i][2]) >= KP_CONF]

    if len(pts) >= 2:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        w = max(max(xs) - min(xs), MIN_SIZE)
        h = max(max(ys) - min(ys), MIN_SIZE)
        # Los keypoints solo cubren la parte frontal: hay que crecer para tapar
        # frente, barbilla y el lateral que queda fuera al girar la cabeza.
        pad_x, pad_y = w * PAD + w * 0.35, h * PAD + h * 0.9
        return (int(min(xs) - pad_x), int(min(ys) - pad_y),
                int(max(xs) + pad_x), int(max(ys) + pad_y))

    if bbox is None:
        return None
    x1, y1, x2, y2 = (float(v) for v in bbox)
    height = y2 - y1
    if height < MIN_SIZE:
        return None
    return (int(x1), int(y1), int(x2), int(y1 + height * FALLBACK_TOP))


def blur_regions(frame: np.ndarray, boxes) -> np.ndarray:
    """Difumina las regiones dadas. Modifica y devuelve el frame recibido."""
    h, w = frame.shape[:2]
    for box in boxes:
        if box is None:
            continue
        x1, y1, x2, y2 = box
        x1 = max(0, min(int(x1), w - 1))
        y1 = max(0, min(int(y1), h - 1))
        x2 = max(0, min(int(x2), w))
        y2 = max(0, min(int(y2), h))
        if x2 - x1 < 3 or y2 - y1 < 3:
            continue
        region = frame[y1:y2, x1:x2]
        # Pixelado y no desenfoque: un gaussiano fuerte se puede revertir en
        # parte, reducir a bloques destruye la informacion de verdad.
        small = cv2.resize(region, (max(1, (x2 - x1) // 12), max(1, (y2 - y1) // 12)),
                           interpolation=cv2.INTER_LINEAR)
        frame[y1:y2, x1:x2] = cv2.resize(small, (x2 - x1, y2 - y1),
                                         interpolation=cv2.INTER_NEAREST)
    return frame


def anonymize(frame: np.ndarray, tracks) -> np.ndarray:
    """Copia del frame con la cabeza de cada persona pixelada.

    `tracks` es la lista que devuelve el PoseTracker: dicts con 'kp' y 'bbox'.
    """
    if not tracks:
        return frame
    boxes = [head_box(t.get("kp"), t.get("bbox")) for t in tracks]
    if not any(b is not None for b in boxes):
        return frame
    return blur_regions(frame.copy(), boxes)
