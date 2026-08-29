"""Linea temporal del incidente, reconstruida desde las senales medidas.

HawkWatch le pedia la cronologia al modelo de lenguaje. Aqui no hace falta
inventarla: la Etapa 1 ya midio la geometria del cuerpo en cada frame, asi que
la cronologia se deriva de datos reales. La diferencia importa porque un
operador puede auditar cada linea contra el numero que la produjo.
"""
from __future__ import annotations

import numpy as np

from .gate import Domain
from .signals import SIGNALS, TrackHistory

# Frase que describe cada senal cuando cruza al alza y cuando se mantiene alta.
PHRASES = {
    "concealment": ("la mano se dirige al torso", "la mano permanece sobre el cuerpo"),
    "motion": ("arranca un movimiento brusco", "el movimiento brusco continua"),
    "proximity": ("otra persona se acerca", "las dos personas siguen muy juntas"),
    "fall": ("el cuerpo pierde la vertical", "sigue en el suelo"),
    "immobility": ("deja de moverse", "continua inmovil"),
    "dwell": ("se detiene en el sitio", "sigue parado en el mismo punto"),
    "zone": ("entra en zona restringida", "permanece en zona restringida"),
}

RISE = 0.45          # cruce al alza que merece una linea
HIGH = 0.6           # a partir de aqui se considera sostenida
STEPS = 10


def build(samples: list[tuple], domain: Domain, t_trigger: float,
          t_start: float, t_end: float) -> list[dict]:
    """Devuelve momentos `{t, signals, note, trigger}` ordenados en el tiempo.

    `samples` es la copia de la historia de la track: [(t, bbox, kp), ...].
    Los tiempos salen relativos al disparo, que es como los lee un operador.
    """
    usable = [s for s in samples if t_start <= s[0] <= t_end]
    if len(usable) < 4:
        return []

    grid = np.linspace(usable[0][0], usable[-1][0], STEPS)
    # `presence` vale 1.0 siempre que haya alguien: no marca ningun momento.
    names = [n for n in domain.weights if n in SIGNALS and n != "presence"]
    if not names:
        return []

    series: list[tuple[float, dict[str, float]]] = []
    for ts in grid:
        hist = TrackHistory(0)
        for t, bbox, kp in usable:
            if t <= ts:
                hist.push(t, bbox, kp)
        if len(hist.samples) < 3:
            continue
        ctx = {"now": float(ts), "tracks": {}, "frame_shape": (0, 0, 0),
               "zones": domain.zones}
        series.append((float(ts), {n: float(SIGNALS[n](hist, ctx)) for n in names}))

    moments: list[dict] = []
    previous: dict[str, float] = {}
    said_high: set[str] = set()

    for ts, values in series:
        notes = []
        for name, value in sorted(values.items(), key=lambda kv: -kv[1]):
            before = previous.get(name, 0.0)
            rise, hold = PHRASES.get(name, (name, name))
            if before < RISE <= value:
                notes.append(rise)
                said_high.discard(name)
            elif value >= HIGH and name not in said_high:
                notes.append(hold)
                said_high.add(name)
            elif value < RISE:
                said_high.discard(name)
        previous = values

        if notes:
            moments.append({
                "t": round(ts - t_trigger, 2),
                "note": "; ".join(notes[:2]),
                "signals": {k: round(v, 2) for k, v in values.items()},
                "trigger": False,
            })

    moments.append({
        "t": 0.0,
        "note": "el filtro geometrico dispara y pide veredicto al VLM",
        "signals": {k: round(v, 2) for k, v in (series[-1][1] if series else {}).items()},
        "trigger": True,
    })
    moments.sort(key=lambda m: (m["t"], m["trigger"]))
    return moments
