"""Aviso externo cuando el VLM confirma un incidente.

Solo se dispara con incidentes confirmados en la Etapa 2, nunca con los
descartados: el objetivo de toda la cascada es que al operador le llegue lo que
merece su atencion, no cada sospecha.

Dos canales, ambos opcionales; si no hay credenciales, no pasa nada:

  TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   manda la foto del incidente al movil
  ALERT_WEBHOOK_URL                       POST con JSON (vale para Slack/Discord)
"""
from __future__ import annotations

import json
import mimetypes
import threading
import urllib.error
import urllib.request
import uuid

from .. import config

TIMEOUT = 8.0


def _multipart(fields: dict[str, str], filename: str | None, payload: bytes | None):
    """Cuerpo multipart/form-data sin dependencias externas."""
    boundary = f"----sentinel{uuid.uuid4().hex}"
    out = bytearray()
    for key, value in fields.items():
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode()
        out += f"{value}\r\n".encode()
    if filename and payload:
        ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        out += f"--{boundary}\r\n".encode()
        out += (f'Content-Disposition: form-data; name="photo"; '
                f'filename="{filename}"\r\n').encode()
        out += f"Content-Type: {ctype}\r\n\r\n".encode()
        out += payload + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def _post(url: str, body: bytes, content_type: str) -> tuple[bool, str]:
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": content_type}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return 200 <= res.status < 300, f"http {res.status}"
    except urllib.error.HTTPError as exc:
        return False, f"http {exc.code}: {exc.read()[:200].decode(errors='replace')}"
    except OSError as exc:
        return False, str(exc)


def _caption(event, domain_label: str) -> str:
    v = event.verdict
    lines = [
        f"INCIDENTE — {domain_label}",
        f"{v.incident_type} (confianza {int(v.confidence * 100)}%)",
        "",
        v.evidence,
    ]
    if v.recommended_action:
        lines += ["", f"Accion: {v.recommended_action}"]
    if event.source and event.source != "live":
        pos = ""
        if event.offset is not None:
            pos = f" · min {int(event.offset // 60)}:{int(event.offset % 60):02d}"
        lines += ["", f"Origen: {event.source}{pos}"]
    return "\n".join(lines)


class Notifier:
    def __init__(self):
        self.telegram_token = config.TELEGRAM_BOT_TOKEN
        self.telegram_chat = config.TELEGRAM_CHAT_ID
        self.webhook = config.ALERT_WEBHOOK_URL
        self.sent = 0
        self.last_error: str | None = None

    @property
    def enabled(self) -> bool:
        return bool((self.telegram_token and self.telegram_chat) or self.webhook)

    @property
    def channels(self) -> list[str]:
        out = []
        if self.telegram_token and self.telegram_chat:
            out.append("telegram")
        if self.webhook:
            out.append("webhook")
        return out

    def payload(self, event, domain_label: str) -> dict:
        """Cuerpo del webhook, ya masticado para reenviar por WhatsApp.

        `message` viene con el formato de WhatsApp (*negrita*) para poder
        mandarlo tal cual, e `image_url` apunta al frame de evidencia. Ese enlace
        solo es alcanzable desde fuera si PUBLIC_BASE_URL apunta a una URL
        publica (un tunel o el despliegue); en local queda a null.
        """
        v = event.verdict
        image_url = None
        if event.frames and config.PUBLIC_BASE_URL:
            middle = event.frames[len(event.frames) // 2]
            image_url = f"{config.PUBLIC_BASE_URL.rstrip('/')}/clips/{middle}"

        message = (
            f"*Incidente detectado — {domain_label}*\n"
            f"{v.incident_type} · confianza {int(v.confidence * 100)}%\n\n"
            f"{v.evidence}"
        )
        if v.recommended_action:
            message += f"\n\n_Accion sugerida:_ {v.recommended_action}"

        return {
            "message": message,
            "text": _caption(event, domain_label),
            "image_url": image_url,
            "event_id": event.id,
            "domain": event.domain,
            "domain_label": domain_label,
            "incident_type": v.incident_type,
            "confidence": v.confidence,
            "evidence": v.evidence,
            "recommended_action": v.recommended_action,
            "gate_score": event.gate_score,
            "signals": event.signals,
            "source": event.source,
            "offset": event.offset,
            "occurred_at": event.created_at,
        }

    def notify(self, event, domain_label: str) -> None:
        """No bloquea: el aviso nunca debe frenar el analisis del siguiente clip."""
        if not self.enabled or event.verdict is None or not event.verdict.incident:
            return
        threading.Thread(
            target=self._send, args=(event, domain_label),
            name="notify", daemon=True,
        ).start()

    def _send(self, event, domain_label: str) -> None:
        caption = _caption(event, domain_label)
        ok_any = False

        if self.telegram_token and self.telegram_chat:
            ok_any |= self._telegram(event, caption)

        if self.webhook:
            ok, detail = _post(self.webhook,
                               json.dumps(self.payload(event, domain_label)).encode(),
                               "application/json")
            ok_any |= ok
            if not ok:
                self.last_error = f"webhook: {detail}"

        if ok_any:
            self.sent += 1

    def _telegram(self, event, caption: str) -> bool:
        # La foto del momento vale mas que el texto: se manda el frame central.
        photo = None
        if event.frames:
            path = config.CLIPS_DIR / event.frames[len(event.frames) // 2]
            try:
                photo = path.read_bytes()
            except OSError:
                photo = None

        if photo:
            url = f"https://api.telegram.org/bot{self.telegram_token}/sendPhoto"
            body, ctype = _multipart(
                {"chat_id": self.telegram_chat, "caption": caption[:1024]},
                "evidencia.jpg", photo,
            )
        else:
            url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
            body, ctype = _multipart(
                {"chat_id": self.telegram_chat, "text": caption[:4096]}, None, None)

        ok, detail = _post(url, body, ctype)
        if not ok:
            self.last_error = f"telegram: {detail}"
        return ok
