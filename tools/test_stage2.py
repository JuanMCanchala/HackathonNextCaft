"""Prueba de humo de la Etapa 2 contra el backend que ya esta corriendo.

Toma frames reales del stream en vivo, los mete en un RingBuffer y llama al
juez igual que lo haria el pipeline: mismo muestreo, mismo prompt, misma salida
estructurada, misma escritura de evidencia. Sirve para saber si la API de Gemini
responde bien sin tener que actuar delante de la camara.

    .venv\\Scripts\\python.exe -m tools.test_stage2 --domain industrial_safety
"""
from __future__ import annotations

import argparse
import time
import urllib.request

import numpy as np

from backend import config
from backend.core.buffer import RingBuffer
from backend.core.events import write_frames
from backend.core.gate import load_domains
from backend.core.vlm import VLMJudge

BOUNDARY = b"\xff\xd8"          # inicio de JPEG
END = b"\xff\xd9"               # fin de JPEG


def grab_frames(url: str, count: int, timeout: float = 20.0) -> list[bytes]:
    """Extrae `count` JPEG del stream MJPEG."""
    frames: list[bytes] = []
    deadline = time.time() + timeout
    with urllib.request.urlopen(url, timeout=timeout) as stream:
        buf = b""
        while len(frames) < count and time.time() < deadline:
            chunk = stream.read(8192)
            if not chunk:
                break
            buf += chunk
            while True:
                start = buf.find(BOUNDARY)
                end = buf.find(END, start + 2)
                if start < 0 or end < 0:
                    break
                frames.append(buf[start:end + 2])
                buf = buf[end + 2:]
                if len(frames) >= count:
                    break
    return frames


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", default="industrial_safety")
    ap.add_argument("--url", default="http://127.0.0.1:8000/video.mjpg")
    ap.add_argument("--frames", type=int, default=config.VLM_FRAMES)
    args = ap.parse_args()

    domains = load_domains(config.DOMAINS_DIR)
    if args.domain not in domains:
        print(f"dominio desconocido: {args.domain}. Hay: {list(domains)}")
        return 2
    domain = domains[args.domain]

    print(f"\nTomando {args.frames} frames de {args.url} ...")
    try:
        payloads = grab_frames(args.url, args.frames)
    except OSError as exc:
        print(f"No pude leer el stream: {exc}")
        print("Esta corriendo el backend en el 8000?")
        return 1

    if len(payloads) < 3:
        print(f"Solo consegui {len(payloads)} frames. El pipeline ya esta en 'running'?")
        return 1

    buffer = RingBuffer(config.BUFFER_SECONDS)
    t0 = time.time()
    for i, payload in enumerate(payloads):
        frame = RingBuffer.decode(payload)
        if frame is None:
            continue
        buffer.push(t0 + i * 0.3, frame)

    sample = RingBuffer.decode(payloads[0])
    h, w = sample.shape[:2]
    print(f"Frames de {w}x{h}. Dominio: {domain.label}")
    print(f"Modelo: {config.GEMINI_MODEL}   offline: {config.OFFLINE}\n")

    judge = VLMJudge()
    # Caja ficticia en el centro: aqui interesa validar la llamada, no el sujeto.
    box = [w * 0.3, h * 0.2, w * 0.7, h * 0.95]
    signals = {name: 0.5 for name in domain.weights}

    started = time.time()
    try:
        verdict, frames, latency = judge.judge(
            buffer, domain, signals,
            t0 - 1.0, t0 + len(payloads) * 0.3 + 1.0,
            lambda _ts: box,
        )
    except Exception as exc:                              # noqa: BLE001
        print(f"FALLO la Etapa 2: {type(exc).__name__}: {exc}")
        return 1

    names = write_frames(frames, "smoketest")
    print(f"  incidente        {verdict.incident}")
    print(f"  tipo             {verdict.incident_type}")
    print(f"  confianza        {verdict.confidence:.2f}")
    print(f"  evidencia        {verdict.evidence}")
    print(f"  accion           {verdict.recommended_action}")
    print(f"\n  latencia         {latency} ms (total {time.time() - started:.1f}s)")
    print(f"  evidencia en     {len(names)} archivos -> /clips/{names[0] if names else '-'}")
    print("\nEtapa 2 operativa.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
