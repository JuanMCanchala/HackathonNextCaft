"""Modelos de datos compartidos entre etapas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Indices de keypoints COCO-17 que usa YOLO-pose.
NOSE = 0
L_EYE, R_EYE = 1, 2
L_EAR, R_EAR = 3, 4
L_SHOULDER, R_SHOULDER = 5, 6
L_ELBOW, R_ELBOW = 7, 8
L_WRIST, R_WRIST = 9, 10
L_HIP, R_HIP = 11, 12
L_KNEE, R_KNEE = 13, 14
L_ANKLE, R_ANKLE = 15, 16


class Verdict(BaseModel):
    """Salida estructurada de la Etapa 2 (VLM)."""

    incident: bool = Field(description="True solo si se observa un incidente real")
    incident_type: str = Field(description="Tipo tomado de la taxonomia, o 'ninguno'")
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: str = Field(description="Que se observa exactamente en los frames")
    recommended_action: str = Field(description="Accion sugerida para el operador")


class SignalSnapshot(BaseModel):
    values: dict[str, float] = {}
    score: float = 0.0


class Event(BaseModel):
    id: str
    domain: str
    track_id: int
    created_at: float
    gate_score: float
    signals: dict[str, float]
    status: Literal["analyzing", "incident", "dismissed", "error"] = "analyzing"
    verdict: Verdict | None = None
    frames: list[str] = []
    timeline: list[dict] = []
    camera: str = "cam1"
    source: str = "live"      # 'live' o el nombre del archivo subido
    offset: float | None = None  # segundos dentro del video subido
    feedback: Literal["confirmed", "false_positive"] | None = None
    latency_ms: int | None = None
