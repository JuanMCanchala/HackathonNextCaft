"""Etapa 1b: convierte senales en disparos.

Un dominio es un archivo YAML: que senales pesan, cuanto hay que sostener el
score y cada cuanto se puede volver a molestar al VLM por la misma persona.
Anadir una vertical no toca ni una linea de Python.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .signals import SIGNALS, TrackHistory


@dataclass
class Domain:
    id: str
    label: str
    description: str = ""
    threshold: float = 0.5
    sustain_seconds: float = 0.7
    cooldown_seconds: float = 25.0
    min_track_seconds: float = 1.5
    weights: dict[str, float] = field(default_factory=dict)
    require: dict[str, float] = field(default_factory=dict)
    taxonomy: list[str] = field(default_factory=list)
    focus: str = ""
    zones: list[list[list[float]]] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path) -> "Domain":
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        vlm = raw.pop("vlm", {}) or {}
        raw["taxonomy"] = vlm.get("taxonomy", [])
        raw["focus"] = vlm.get("focus", "")
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in raw.items() if k in known})

    def score(self, values: dict[str, float]) -> float:
        total = sum(self.weights.values()) or 1.0
        return sum(values.get(k, 0.0) * w for k, w in self.weights.items()) / total

    def meets_requirements(self, values: dict[str, float]) -> bool:
        return all(values.get(k, 0.0) >= v for k, v in self.require.items())


def load_domains(directory: Path) -> dict[str, Domain]:
    out: dict[str, Domain] = {}
    for path in sorted(directory.glob("*.yaml")):
        domain = Domain.load(path)
        out[domain.id] = domain
    return out


@dataclass
class _GateState:
    """Ventana deslizante de elegibilidad, no una racha continua.

    La deteccion de pose es ruidosa: un keypoint que se pierde un frame hunde el
    score un instante. Exigir una racha perfecta hacia que cualquier parpadeo
    reiniciase el contador y el disparo no llegase nunca.
    """

    window: deque = field(default_factory=lambda: deque(maxlen=240))
    last_trigger: float = -1e9

    def observe(self, now: float, eligible: bool, span: float) -> bool:
        self.window.append((now, eligible))
        while self.window and now - self.window[0][0] > span:
            self.window.popleft()
        if len(self.window) < 3:
            return False
        covered = self.window[-1][0] - self.window[0][0]
        if covered < span * 0.9:
            return False
        hits = sum(1 for _t, ok in self.window if ok)
        return hits / len(self.window) >= 0.7

    def reset(self) -> None:
        self.window.clear()


class Gate:
    """Evalua cada track contra el dominio activo y decide si disparar."""

    def __init__(self, domain: Domain):
        self.domain = domain
        self._state: dict[int, _GateState] = {}

    def set_domain(self, domain: Domain) -> None:
        self.domain = domain
        self._state.clear()

    def evaluate(self, hist: TrackHistory, ctx: dict) -> tuple[dict[str, float], float, bool]:
        """Devuelve (senales, score, disparar)."""
        needed = set(self.domain.weights) | set(self.domain.require)
        values = {name: SIGNALS[name](hist, ctx) for name in needed if name in SIGNALS}
        score = self.domain.score(values)

        now = ctx["now"]
        state = self._state.setdefault(hist.id, _GateState())

        if (hist.last_seen - hist.first_seen) < self.domain.min_track_seconds:
            return values, score, False

        eligible = (
            score >= self.domain.threshold
            and self.domain.meets_requirements(values)
        )
        sustained = state.observe(now, eligible, self.domain.sustain_seconds)
        cooled = (now - state.last_trigger) >= self.domain.cooldown_seconds

        if sustained and cooled:
            state.last_trigger = now
            state.reset()
            return values, score, True

        return values, score, False

    def forget(self, track_id: int) -> None:
        self._state.pop(track_id, None)
