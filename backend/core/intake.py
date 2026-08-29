"""Puente hacia el backend de Convex (`convex-backend/`).

Los dos backends se reparten el trabajo y no se solapan:

  este (Python)   vision, cascada, veredicto del VLM
  Convex          multi-tenant, persistencia, ciclo de vida del incidente,
                  autorizacion y auditoria

El punto de union es `detections.intake`, que exige observaciones ya
normalizadas y es idempotente por `(workspace, sourceNamespace, sourceEventId)`.
Se usa el id del evento como `sourceEventId`, asi que reintentar un envio nunca
duplica un incidente al otro lado.

OJO CON LA TAXONOMIA: su allowlist son tres categorias (`intrusion`, `smoke`,
`fall`) y aqui se producen unos veinte tipos en cuatro dominios. El mapeo de
abajo es una decision de producto, no un detalle tecnico, y es deliberadamente
conservador: lo que no encaja NO se manda, en vez de colarlo como `intrusion` y
ensuciar sus metricas.
"""
from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone

from .. import config

TIMEOUT = 8.0

# Su allowlist actual. Si la amplian, esto es lo unico que hay que tocar.
CATEGORIAS_CONVEX = ("intrusion", "smoke", "fall")

# Dominio de aqui -> categoria de alli. `None` significa que ese dominio no
# tiene equivalente todavia y no se envia.
POR_DOMINIO: dict[str, str | None] = {
    "fall_detection": "fall",
    "industrial_safety": "intrusion",   # solo la invasion de zona; ver abajo
    "retail_theft": None,               # no hay categoria de robo en su lista
    "violence": None,                   # ni de agresion
}

# Algunos tipos concretos mandan sobre el dominio: en seguridad industrial, una
# caida es `fall` y la falta de EPP no tiene categoria en la que quepa.
POR_TIPO: dict[str, str | None] = {
    "caida o accidente": "fall",
    "caida con perdida de movilidad": "fall",
    "caida con recuperacion": "fall",
    "persona en el suelo sin caida previa": "fall",
    "invasion de zona restringida": "intrusion",
    "falta de equipo de proteccion": None,
}


def categoria_convex(domain_id: str, incident_type: str) -> str | None:
    """Categoria del otro backend, o None si este incidente no tiene sitio."""
    clave = (incident_type or "").strip().lower()
    if clave in POR_TIPO:
        return POR_TIPO[clave]
    return POR_DOMINIO.get(domain_id)


class ConvexIntake:
    """Envia incidentes confirmados al backend de Convex.

    Igual que los avisos externos, solo viajan los incidentes que la Etapa 2
    confirma: su base de datos es el registro de lo que merece atencion, no el
    de cada sospecha que el filtro geometrico levanta.
    """

    def __init__(self):
        self.url = config.CONVEX_INTAKE_URL
        self.token = config.CONVEX_INTAKE_TOKEN
        self.workspace = config.CONVEX_WORKSPACE_ID
        self.camaras = dict(config.CONVEX_CAMERA_IDS)
        self.enviados = 0
        self.omitidos = 0
        self.last_error: str | None = None

    @property
    def enabled(self) -> bool:
        return bool(self.url and self.workspace)

    def estado(self) -> dict:
        return {
            "activo": self.enabled,
            "enviados": self.enviados,
            "omitidos_sin_categoria": self.omitidos,
            "error": self.last_error,
        }

    def enviar(self, event, domain_id: str) -> None:
        """No bloquea: el envio nunca debe frenar el analisis del siguiente clip."""
        if not self.enabled or event.verdict is None or not event.verdict.incident:
            return
        categoria = categoria_convex(domain_id, event.verdict.incident_type)
        if categoria is None:
            # Preferible perder el registro a inventarse una categoria: sus
            # metricas de incidentes quedarian sucias y nadie sabria por que.
            self.omitidos += 1
            return
        threading.Thread(target=self._post, args=(event, categoria),
                         name="convex-intake", daemon=True).start()

    def _payload(self, event, categoria: str) -> dict:
        base = (config.PUBLIC_BASE_URL or "").rstrip("/")
        refs = [f"{base}/clips/{n}" for n in (event.frames or [])[:4]] if base else []
        return {
            "workspaceId": self.workspace,
            "cameraId": self.camaras.get(event.camera, event.camera),
            "sourceNamespace": "sentinel-vision",
            # El id del evento es estable, asi que un reintento cae en su
            # idempotencia en vez de duplicar el incidente.
            "sourceEventId": event.id,
            "timestamp": datetime.fromtimestamp(
                event.created_at, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
            "category": categoria,
            "suggestedCategory": event.verdict.incident_type,
            "confidence": max(0.0, min(1.0, float(event.verdict.confidence))),
            "modelVersion": config.GEMINI_MODEL,
            "detectorVersion": f"{config.POSE_MODEL}@{config.POSE_IMGSZ}",
            "evidenceRefs": refs,
        }

    def _post(self, event, categoria: str) -> None:
        cuerpo = json.dumps(self._payload(event, categoria)).encode()
        cabeceras = {"Content-Type": "application/json"}
        if self.token:
            cabeceras["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(self.url, data=cuerpo,
                                     headers=cabeceras, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                if 200 <= res.status < 300:
                    self.enviados += 1
                    self.last_error = None
                else:
                    self.last_error = f"http {res.status}"
        except urllib.error.HTTPError as exc:
            self.last_error = f"http {exc.code}: {exc.read()[:200].decode(errors='replace')}"
        except OSError as exc:
            self.last_error = str(exc)
