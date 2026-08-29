"""Etapa 0b: deteccion de personas + pose + tracking persistente (ByteTrack)."""
from __future__ import annotations

import numpy as np


class PoseTracker:
    """Envuelve YOLO-pose. Devuelve una lista de tracks por frame."""

    def __init__(self, model_path: str, device: str = "cuda", conf: float = 0.4,
                 imgsz: int = 480):
        from ultralytics import YOLO  # import perezoso: tarda en cargar torch

        self.model = YOLO(model_path)
        self.device = device
        self.conf = conf
        self.imgsz = imgsz
        self.ready = False

    def warmup(self, frame: np.ndarray) -> None:
        self.model.track(
            frame, persist=True, verbose=False, device=self.device,
            classes=[0], conf=self.conf, imgsz=self.imgsz,
            tracker="bytetrack.yaml",
        )
        self.ready = True

    def __call__(self, frame: np.ndarray) -> list[dict]:
        results = self.model.track(
            frame,
            persist=True,
            verbose=False,
            device=self.device,
            classes=[0],          # solo personas
            conf=self.conf,
            imgsz=self.imgsz,
            tracker="bytetrack.yaml",
        )
        if not results:
            return []
        res = results[0]
        if res.boxes is None or res.boxes.id is None:
            return []

        ids = res.boxes.id.cpu().numpy().astype(int)
        boxes = res.boxes.xyxy.cpu().numpy()
        confs = res.boxes.conf.cpu().numpy()
        if res.keypoints is not None and res.keypoints.data is not None:
            kps = res.keypoints.data.cpu().numpy()   # (n, 17, 3)
        else:
            kps = np.zeros((len(ids), 17, 3), dtype=np.float32)

        return [
            {"id": int(ids[i]), "bbox": boxes[i], "kp": kps[i], "conf": float(confs[i])}
            for i in range(len(ids))
        ]
