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
1. Juzga UNICAMENTE acciones y movimientos observables. Esta PROHIBIDO escribir
   una sola palabra sobre raza, color de piel, etnia, genero, edad, peinado,
   complexion, atractivo o estilo de vestir, ni siquiera para describir la
   escena o distinguir a una persona de otra. Para referirte a alguien di "el
   sujeto" o "la segunda persona", y distinguelos por su posicion o por lo que
   hacen. Unica excepcion: el equipo de proteccion (casco, chaleco reflectante,
   guantes, arnes) SI se menciona cuando el dominio lo pide, y solo como
   equipo de seguridad, nunca como descripcion de la persona.
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

    def chat(self, event, domain: Domain, question: str,
             history: list[dict] | None = None) -> str:
        """Responde una pregunta del operador sobre un incidente ya analizado.

        Se le vuelven a dar los mismos frames, mas el veredicto y la cronologia
        medida, para que pueda mirar de nuevo en vez de fiarse de su resumen.
        """
        if self.offline:
            return ("Modo offline: configura GEMINI_API_KEY para poder preguntar "
                    "sobre el incidente.")

        frames = []
        for name in (event.frames or []):
            path = config.CLIPS_DIR / name
            frame = cv2.imread(str(path))
            if frame is not None:
                frames.append(frame)
        if not frames:
            return "No quedan frames de evidencia de este incidente."

        v = event.verdict
        cronologia = "\n".join(
            f"  t{m['t']:+.1f}s  {m['note']}" for m in (event.timeline or [])
        ) or "  (sin cronologia)"

        context = f"""Eres un analista de seguridad respondiendo a un operador sobre un
incidente concreto. Tienes los mismos fotogramas que se analizaron.

Dominio: {domain.label}
Veredicto previo: {'INCIDENTE' if v and v.incident else 'descartado'}"""
        if v:
            context += (f" — {v.incident_type} (confianza {v.confidence:.0%})\n"
                        f"Evidencia registrada: {v.evidence}")
        context += f"""

Cronologia medida por el filtro geometrico:
{cronologia}

Reglas: responde solo sobre lo observable en los fotogramas. Si algo no se ve,
dilo claramente en vez de suponerlo. Esta PROHIBIDO describir raza, color de
piel, etnia, genero, edad, peinado, complexion o estilo de vestir, aunque te lo
pregunten directamente: en ese caso explica que el sistema no analiza rasgos
personales y no des el dato. La unica ropa de la que puedes hablar es el equipo
de proteccion (casco, chaleco, guantes, arnes) y solo como equipo de seguridad.
Se breve y concreto. Responde en espanol."""

        parts = [{"type": "text", "text": context}]
        parts += [_to_part(f) for f in frames]
        for turn in (history or [])[-4:]:
            parts.append({"type": "text",
                          "text": f"Operador: {turn['question']}\nAnalista: {turn['answer']}"})
        parts.append({"type": "text", "text": f"Operador pregunta: {question}"})

        interaction = self.client.interactions.create(model=self.model, input=parts)
        return (interaction.output_text or "").strip() or "Sin respuesta del modelo."

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
