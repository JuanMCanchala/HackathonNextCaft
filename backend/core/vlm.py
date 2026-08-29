"""Etapa 2: el VLM juzga el clip que el gate marco como sospechoso.

Se manda una secuencia de frames muestreados, con el sujeto resaltado, y se
exige salida JSON validada. Esta es la unica llamada de pago del pipeline y solo
ocurre cuando la Etapa 1 dispara.
"""
from __future__ import annotations

import base64
import time

import cv2
import numpy as np

from .. import config
from .buffer import RingBuffer
from .gate import Domain
from .schemas import Verdict

SYSTEM_RULES = """Eres un analista de seguridad revisando fotogramas de una camara de vigilancia.

Reglas obligatorias:
1. Juzga UNICAMENTE acciones y movimientos observables. Nunca menciones ni uses
   como indicio la raza, el color de piel, el genero, la edad, la vestimenta de
   estilo o el atractivo de una persona.
2. Ante la duda, responde que NO hay incidente. Una falsa alarma le cuesta la
   confianza al operador; prefiere ser conservador.
3. La evidencia debe describir lo que se ve, no lo que se supone. Si no puedes
   ver el momento clave, dilo y baja la confianza.
4. Responde siempre en espanol."""


def _annotate(frame: np.ndarray, bbox, index: int, total: int) -> np.ndarray:
    """Marca al sujeto para que el modelo sepa a quien mirar."""
    out = frame.copy()
    if bbox is not None:
        x1, y1, x2, y2 = [int(v) for v in bbox]
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 210, 255), 2)
        cv2.putText(
            out, "SUJETO", (x1, max(y1 - 8, 14)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 210, 255), 2, cv2.LINE_AA,
        )
    cv2.putText(
        out, f"{index}/{total}", (8, 22),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA,
    )
    return out


def _to_part(frame: np.ndarray) -> dict:
    h, w = frame.shape[:2]
    if w > config.VLM_MAX_WIDTH:
        scale = config.VLM_MAX_WIDTH / w
        frame = cv2.resize(frame, (config.VLM_MAX_WIDTH, int(h * scale)))
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
    if not ok:
        raise RuntimeError("no se pudo codificar el frame")
    return {
        "type": "image",
        "data": base64.b64encode(buf.tobytes()).decode("utf-8"),
        "mime_type": "image/jpeg",
    }


def build_prompt(domain: Domain, signals: dict[str, float], seconds: float, n: int) -> str:
    top = sorted(signals.items(), key=lambda kv: -kv[1])[:3]
    hints = ", ".join(f"{k}={v:.2f}" for k, v in top)
    taxonomy = "\n".join(f"- {t}" for t in domain.taxonomy)
    return f"""{SYSTEM_RULES}

CONTEXTO
Dominio de vigilancia: {domain.label}.
Recibes {n} fotogramas en orden cronologico que cubren {seconds:.1f} segundos.
La persona bajo analisis esta marcada con un recuadro y la etiqueta SUJETO.

El filtro previo, que solo mide geometria corporal y no entiende de contexto,
marco estas senales: {hints}. Trata esto como una sospecha a verificar, no como
una conclusion. Tu trabajo es confirmarla o descartarla.

QUE MIRAR
{domain.focus.strip()}

TAXONOMIA (elige exactamente uno para incident_type)
{taxonomy}

Devuelve incident=false y incident_type="ninguno" si lo que ves es
comportamiento normal."""


class VLMJudge:
    def __init__(self):
        self.model = config.GEMINI_MODEL
        self.offline = config.OFFLINE
        self._client = None
        self.last_error: str | None = None

    @property
    def client(self):
        if self._client is None:
            from google import genai

            self._client = genai.Client(api_key=config.GEMINI_API_KEY)
        return self._client

    def judge(
        self,
        buffer: RingBuffer,
        domain: Domain,
        signals: dict[str, float],
        t_start: float,
        t_end: float,
        bbox_at,
    ) -> tuple[Verdict, list[np.ndarray], int]:
        """Devuelve (veredicto, frames anotados para el clip, latencia ms)."""
        started = time.time()
        sampled = buffer.sample(t_start, t_end, config.VLM_FRAMES)
        if not sampled:
            raise RuntimeError("buffer vacio: no hay frames que analizar")

        frames = []
        for i, (t, payload) in enumerate(sampled, start=1):
            frame = RingBuffer.decode(payload)
            frames.append(_annotate(frame, bbox_at(t), i, len(sampled)))

        if self.offline:
            time.sleep(0.4)
            return self._mock(domain, signals), frames, int((time.time() - started) * 1000)

        prompt = build_prompt(domain, signals, t_end - t_start, len(frames))
        parts = [{"type": "text", "text": prompt}] + [_to_part(f) for f in frames]

        interaction = self.client.interactions.create(
            model=self.model,
            input=parts,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": Verdict.model_json_schema(),
            },
        )
        verdict = Verdict.model_validate_json(interaction.output_text)
        return verdict, frames, int((time.time() - started) * 1000)

    @staticmethod
    def _mock(domain: Domain, signals: dict[str, float]) -> Verdict:
        """Sin API key el pipeline sigue siendo demostrable de punta a punta."""
        strongest = max(signals.items(), key=lambda kv: kv[1], default=("", 0.0))
        return Verdict(
            incident=strongest[1] > 0.6,
            incident_type=domain.taxonomy[0] if domain.taxonomy else "ninguno",
            confidence=round(min(strongest[1], 0.95), 2),
            evidence=(
                f"MODO OFFLINE (sin GEMINI_API_KEY). Senal dominante "
                f"{strongest[0]}={strongest[1]:.2f}."
            ),
            recommended_action="Configura GEMINI_API_KEY para el analisis real.",
        )
