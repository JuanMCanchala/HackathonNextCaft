"""Puente hacia el backend de Convex (`convex-backend/`).

Los dos backends se reparten el trabajo y no se solapan:

  este (Python)   vision, cascada, veredicto del VLM
  Convex          multi-tenant, persistencia, ciclo de vida del incidente,
                  autorizacion y auditoria

El punto de union es `detections.intake`, que exige observaciones ya
normalizadas y es idempotente por `(workspace, sourceNamespace, sourceEventId)`.
Se usa el id del evento como `sourceEventId`, asi que reintentar un envio nunca
duplica un incidente al otro lado.

TAXONOMIA: su allowlist cubre ahora las cuatro verticales (`sev-v2`), asi que
los cuatro dominios tienen destino. El mapeo de abajo traduce los tipos en
espanol que devuelve el VLM a sus categorias normalizadas.

Se mapea por tipo concreto antes que por dominio, porque un mismo dominio
produce categorias distintas: en seguridad industrial, una caida es `fall` y la
falta de casco es `ppe_missing`. Lo que no encaja en nada NO se manda, en vez de
colarse en la categoria mas cercana y ensuciar sus metricas.
"""
from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone

from .. import config

TIMEOUT = 8.0

# Su allowlist, ampliada a sev-v2 para cubrir las cuatro verticales.
CATEGORIAS_CONVEX = ("intrusion", "smoke", "fall", "theft", "violence", "ppe_missing")

# Dominio de aqui -> categoria de alli. Es el respaldo cuando el tipo concreto
# no esta en POR_TIPO, por ejemplo si el VLM devuelve una variante inesperada.
POR_DOMINIO: dict[str, str | None] = {
    "retail_theft": "theft",
    "violence": "violence",
    "fall_detection": "fall",
    "industrial_safety": "ppe_missing",
}

# El tipo concreto manda sobre el dominio: seguridad industrial produce tres
# categorias distintas segun lo que haya visto el VLM.
POR_TIPO: dict[str, str | None] = {
    # robo en tienda
    "ocultamiento de producto": "theft",
    "sustraccion sin pago": "theft",
    "manipulacion de envase o etiqueta": "theft",
    # agresion
    "agresion fisica": "violence",
    "forcejeo o empujon": "violence",
    "amenaza con objeto": "violence",
    # caidas
    "caida con perdida de movilidad": "fall",
    "caida con recuperacion": "fall",
    "persona en el suelo sin caida previa": "fall",
    # seguridad industrial
    "falta de equipo de proteccion": "ppe_missing",
    "invasion de zona restringida": "intrusion",
    "caida o accidente": "fall",
}

# Tipos que el VLM usa para decir "esto es normal". No deberian llegar aqui,
# porque `notify`/`enviar` filtran por verdict.incident, pero si llegan es que
# el modelo se contradijo y mas vale no registrarlos como incidente.
NO_INCIDENTE = frozenset({
    "ninguno", "comportamiento normal de compra", "interaccion no violenta",
    "postura normal", "trabajo conforme a norma",
})


def categoria_convex(domain_id: str, incident_type: str) -> str | None:
    """Categoria del otro backend, o None si este incidente no tiene sitio."""
    clave = (incident_type or "").strip().lower()
    if clave in NO_INCIDENTE:
        return None
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
        # Mismo servidor y mismo token que el intake; solo cambia la ruta.
        self.evidencia_url = (
            self.url.rsplit("/", 1)[0] + "/evidence" if self.url else "")
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

    def _subir_evidencia(self, event) -> list[str]:
        """Sube el mejor fotograma a Convex y devuelve su URL publica.

        Antes se mandaba `PUBLIC_BASE_URL/clips/...`, que apunta al equipo que
        corre el analisis. Sirve para el panel local, pero un correo de aviso
        abierto en un movil no alcanza esa direccion y la imagen no se veia.

        Si la subida falla se cae a las rutas locales en vez de perder la
        referencia: el panel las sigue resolviendo y el incidente se guarda
        igual. Una foto que no llega no puede costar el registro del incidente.
        """
        base = (config.PUBLIC_BASE_URL or "").rstrip("/")
        locales = [f"{base}/clips/{n}" for n in (event.frames or [])[:4]] if base else []
        nombres = event.frames or []
        if not self.evidencia_url or not nombres:
            return locales

        # El fotograma del medio es el que suele contener la accion: los
        # primeros son el antes y los ultimos el despues.
        ruta = config.CLIPS_DIR / nombres[len(nombres) // 2]
        if not ruta.exists():
            return locales

        try:
            datos = ruta.read_bytes()
            req = urllib.request.Request(
                self.evidencia_url, data=datos, method="POST",
                headers={"Content-Type": "image/jpeg",
                         "Authorization": f"Bearer {self.token}"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                url = json.loads(res.read()).get("url")
            return [url, *locales] if url else locales
        except (OSError, ValueError) as exc:
            self.last_error = f"evidencia: {exc}"
            return locales

    def _payload(self, event, categoria: str) -> dict:
        refs = self._subir_evidencia(event)
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
