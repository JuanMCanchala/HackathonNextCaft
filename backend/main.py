"""API HTTP + WebSocket sobre el pipeline."""
from __future__ import annotations

import asyncio
import contextlib
import json
import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config
from .core.pipeline import Pipeline

MAX_UPLOAD_BYTES = 200 * 1024 * 1024

state: dict = {"pipeline": None, "loop": None, "clients": set()}


def _broadcast(payload: dict) -> None:
    """Se llama desde hilos del pipeline; empuja al loop de asyncio."""
    loop = state.get("loop")
    if loop is None:
        return
    asyncio.run_coroutine_threadsafe(_fanout(payload), loop)


async def _fanout(payload: dict) -> None:
    dead = []
    message = json.dumps(payload, default=str)
    for ws in list(state["clients"]):
        try:
            await ws.send_text(message)
        except Exception:                                  # noqa: BLE001
            dead.append(ws)
    for ws in dead:
        state["clients"].discard(ws)


def _on_event(event) -> None:
    _broadcast({"type": "event", "event": event.model_dump()})


def _on_job(job) -> None:
    _broadcast({"type": "job", "job": job.snapshot()})


async def _heartbeat() -> None:
    while True:
        await asyncio.sleep(0.5)
        pipeline = state.get("pipeline")
        if pipeline:
            await _fanout({"type": "state", "state": pipeline.snapshot()})


@asynccontextmanager
async def lifespan(app: FastAPI):
    state["loop"] = asyncio.get_running_loop()
    pipeline = Pipeline(on_event=_on_event, on_job=_on_job)
    pipeline.start()
    state["pipeline"] = pipeline
    task = asyncio.create_task(_heartbeat())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        pipeline.stop()


app = FastAPI(title="Sentinel", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
app.mount("/clips", StaticFiles(directory=str(config.CLIPS_DIR)), name="clips")


def pipe() -> Pipeline:
    pipeline = state.get("pipeline")
    if pipeline is None:
        raise HTTPException(503, "pipeline no iniciado")
    return pipeline


@app.get("/api/state")
def get_state():
    return pipe().snapshot()


@app.get("/api/cameras")
def get_cameras():
    p = pipe()
    return {"cameras": [f.snapshot() for f in p.feeds.values()]}


@app.get("/api/domains")
def get_domains():
    p = pipe()
    return {
        "active": p.domain.id,
        "domains": [
            {
                "id": d.id, "label": d.label,
                "description": " ".join(d.description.split()),
                "threshold": d.threshold,
                "weights": d.weights,
                "taxonomy": d.taxonomy,
                "checklist": d.checklist,
            }
            for d in p.domains.values()
        ],
    }


@app.post("/api/domain/{domain_id}")
def set_domain(domain_id: str):
    p = pipe()
    if not p.set_domain(domain_id):
        raise HTTPException(404, f"dominio desconocido: {domain_id}")
    _broadcast({"type": "state", "state": p.snapshot()})
    return {"active": p.domain.id}


class Checklist(BaseModel):
    items: list[str]


@app.post("/api/domain/{domain_id}/checklist")
def set_checklist(domain_id: str, body: Checklist):
    """Equipo exigido en esta instalacion. Cada obra pide el suyo."""
    p = pipe()
    domain = p.domains.get(domain_id)
    if domain is None:
        raise HTTPException(404, f"dominio desconocido: {domain_id}")

    limpio, vistos = [], set()
    for raw in body.items:
        item = " ".join(str(raw).split())[:40]
        if item and item.lower() not in vistos:
            vistos.add(item.lower())
            limpio.append(item)
    if len(limpio) > 12:
        raise HTTPException(400, "maximo 12 elementos en el checklist")

    domain.checklist = limpio
    _broadcast({"type": "state", "state": p.snapshot()})
    return {"domain": domain_id, "checklist": domain.checklist}


@app.post("/api/pause")
def pause():
    p = pipe()
    p.pause()
    snap = p.snapshot()
    _broadcast({"type": "state", "state": snap})
    return snap


@app.post("/api/resume")
def resume():
    p = pipe()
    p.resume()
    snap = p.snapshot()
    _broadcast({"type": "state", "state": snap})
    return snap


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """Sube un video y lo pasa por la misma cascada que el directo."""
    suffix = Path(file.filename or "video.mp4").suffix.lower()
    if suffix not in {".mp4", ".avi", ".mov", ".mkv", ".webm"}:
        raise HTTPException(400, f"formato no soportado: {suffix}")

    config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "video").stem)[:60]
    target = config.UPLOADS_DIR / f"{safe}_{uuid.uuid4().hex[:6]}{suffix}"

    size = 0
    with open(target, "wb") as fh:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                fh.close()
                target.unlink(missing_ok=True)
                raise HTTPException(413, "el video supera los 200 MB")
            fh.write(chunk)

    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(400, "archivo vacio")

    job = pipe().analyze_file(target)
    return job.snapshot()


@app.get("/api/jobs")
def get_jobs():
    return {"jobs": pipe().analyzer.list_jobs()}


@app.get("/api/events")
def get_events():
    return {"events": [e.model_dump() for e in pipe().events.list()]}


class Feedback(BaseModel):
    feedback: str


@app.post("/api/events/{event_id}/feedback")
def post_feedback(event_id: str, body: Feedback):
    if body.feedback not in ("confirmed", "false_positive"):
        raise HTTPException(400, "feedback debe ser confirmed o false_positive")
    p = pipe()
    event = p.events.get(event_id)
    if event is None:
        raise HTTPException(404, "evento no encontrado")
    event.feedback = body.feedback
    p.events.update(event)
    _broadcast({"type": "event", "event": event.model_dump()})
    return event.model_dump()


class Question(BaseModel):
    question: str


CHATS: dict[str, list[dict]] = {}


@app.post("/api/events/{event_id}/chat")
def chat(event_id: str, body: Question):
    """Pregunta libre del operador sobre un incidente ya analizado."""
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "la pregunta esta vacia")
    if len(question) > 500:
        raise HTTPException(400, "pregunta demasiado larga")

    p = pipe()
    event = p.events.get(event_id)
    if event is None:
        raise HTTPException(404, "evento no encontrado")

    domain = p.domains.get(event.domain, p.domain)
    history = CHATS.setdefault(event_id, [])
    try:
        answer = p.judge.chat(event, domain, question, history)
    except Exception as exc:                               # noqa: BLE001
        raise HTTPException(502, f"fallo el modelo: {exc}") from exc

    history.append({"question": question, "answer": answer})
    del history[:-8]
    return {"answer": answer, "history": history}


@app.get("/api/events/{event_id}/chat")
def get_chat(event_id: str):
    return {"history": CHATS.get(event_id, [])}


@app.get("/video.mjpg")
def video(camera: str | None = None):
    p = pipe()

    def frames():
        import time
        while True:
            p.viewer_ping(camera)
            payload = p.preview(camera)
            if payload is None:
                time.sleep(0.05)
                continue
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n"
                   b"Content-Length: " + str(len(payload)).encode() + b"\r\n\r\n"
                   + payload + b"\r\n")
            time.sleep(1 / 25)

    return StreamingResponse(
        frames(), media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    state["clients"].add(ws)
    pipeline = state.get("pipeline")
    if pipeline:
        await ws.send_text(json.dumps({"type": "state", "state": pipeline.snapshot()}, default=str))
        await ws.send_text(json.dumps(
            {"type": "bootstrap",
             "events": [e.model_dump() for e in pipeline.events.list()],
             "jobs": pipeline.analyzer.list_jobs()}, default=str))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        state["clients"].discard(ws)


DIST = config.ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="ui")
else:
    @app.get("/")
    def root():
        return JSONResponse({
            "service": "sentinel",
            "ui": "compila el frontend con: cd frontend && npm run build",
            "endpoints": ["/api/state", "/api/domains", "/api/events", "/video.mjpg", "/ws"],
        })
