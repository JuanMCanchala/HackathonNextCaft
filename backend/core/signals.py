"""Etapa 1: senales geometricas sobre las tracks de pose.

Todo se normaliza por el largo del torso, asi las senales no dependen de a que
distancia esta la persona de la camara. Cada senal devuelve un valor en [0, 1].
"""
from __future__ import annotations

from collections import deque

import numpy as np

from .schemas import (
    L_ANKLE, L_EAR, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST, NOSE,
    R_ANKLE, R_EAR, R_ELBOW, R_HIP, R_KNEE, R_SHOULDER, R_WRIST,
)

KP_CONF = 0.3
HISTORY_SECONDS = 6.0

# Salto temporal para medir velocidad. Por debajo de ~0.2 s domina el jitter de
# la deteccion de pose; por encima de ~0.4 s se pierde un golpe rapido.
STRIDE_SECONDS = 0.25

# Tronco frente a extremidades: gesticular mueve las manos, pelear mueve todo.
CORE_KP = (L_SHOULDER, R_SHOULDER, L_HIP, R_HIP)
LIMB_KP = (L_ELBOW, R_ELBOW, L_WRIST, R_WRIST, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE)


def _pt(kp: np.ndarray, idx: int):
    """Keypoint como (x, y) o None si la confianza es baja."""
    if kp is None or kp.shape[0] <= idx:
        return None
    x, y, c = kp[idx]
    if c < KP_CONF:
        return None
    return np.array([x, y], dtype=np.float32)


def _mid(a, b):
    if a is None or b is None:
        return a if b is None else b
    return (a + b) / 2.0


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """Todas las senales pasan por aqui, y todas salen como float de Python.

    numpy propaga float32 en cuanto tocas un array: FastAPI no lo sabe
    serializar (500 en /api/state) y json.dumps lo convertia a string sin
    avisar. Este es el unico sitio donde hace falta atajarlo.
    """
    return float(max(lo, min(hi, v)))


class Sample:
    """Un frame de una persona: caja, keypoints y magnitudes derivadas."""

    __slots__ = ("t", "bbox", "kp", "scale", "sh_mid", "hip_mid", "center")

    def __init__(self, t: float, bbox: np.ndarray, kp: np.ndarray):
        self.t = t
        self.bbox = bbox
        self.kp = kp
        self.sh_mid = _mid(_pt(kp, L_SHOULDER), _pt(kp, R_SHOULDER))
        self.hip_mid = _mid(_pt(kp, L_HIP), _pt(kp, R_HIP))
        self.center = np.array(
            [(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0], dtype=np.float32
        )
        self.scale = self._scale()

    def _scale(self) -> float:
        """Largo del torso; si no hay keypoints fiables, cae a la altura de la caja."""
        if self.sh_mid is not None and self.hip_mid is not None:
            d = float(np.linalg.norm(self.sh_mid - self.hip_mid))
            if d > 8.0:
                return d
        return max(float(self.bbox[3] - self.bbox[1]) * 0.3, 12.0)

    @property
    def horizontality(self) -> float:
        """1.0 = torso horizontal (tumbado), 0.0 = de pie."""
        if self.sh_mid is not None and self.hip_mid is not None:
            v = self.hip_mid - self.sh_mid
            n = float(np.linalg.norm(v))
            if n > 4.0:
                return _clamp(abs(float(v[0])) / n)
        w = float(self.bbox[2] - self.bbox[0])
        h = max(float(self.bbox[3] - self.bbox[1]), 1.0)
        return _clamp((w / h - 0.8) / 0.9)

    def wrist_in_torso_zone(self) -> bool:
        """Mano sobre el torso o cintura: proxy de ocultamiento."""
        lh, rh = _pt(self.kp, L_HIP), _pt(self.kp, R_HIP)
        if lh is None or rh is None or self.sh_mid is None or self.hip_mid is None:
            return False
        x_min, x_max = min(lh[0], rh[0]), max(lh[0], rh[0])
        hip_w = max(x_max - x_min, self.scale * 0.35)
        pad = hip_w * 0.18
        y_top = self.sh_mid[1]
        y_bot = self.hip_mid[1] + self.scale * 0.28
        for idx in (L_WRIST, R_WRIST):
            w = _pt(self.kp, idx)
            if w is None:
                continue
            if x_min - pad <= w[0] <= x_max + pad and y_top <= w[1] <= y_bot:
                return True
        return False

    def wrist_extended(self) -> bool:
        """Mano lejos del torso: alcanzando un estante o un objeto."""
        if self.sh_mid is None:
            return False
        for idx in (L_WRIST, R_WRIST):
            w = _pt(self.kp, idx)
            if w is None:
                continue
            if float(np.linalg.norm(w - self.sh_mid)) > self.scale * 1.05:
                return True
        return False

    @property
    def head_yaw(self) -> float | None:
        """Hacia donde mira la cabeza: -1 a un lado, 0 de frente, +1 al otro.

        Es geometria de pose, NO biometria: se compara la distancia de la nariz
        a cada oreja. No identifica a nadie ni genera ninguna huella facial, del
        mismo modo que medir hacia donde apunta el torso no identifica a nadie.
        Devuelve None si no se ven suficientes puntos de la cara.
        """
        nose = _pt(self.kp, NOSE)
        if nose is None:
            return None
        left, right = _pt(self.kp, L_EAR), _pt(self.kp, R_EAR)
        if left is not None and right is not None:
            dl = float(np.linalg.norm(nose - left))
            dr = float(np.linalg.norm(nose - right))
            total = dl + dr
            if total < 1e-3:
                return None
            return float(max(-1.0, min(1.0, (dl - dr) / total)))
        # Con una sola oreja visible la cabeza esta claramente girada.
        if left is not None:
            return 1.0
        if right is not None:
            return -1.0
        return None

    def foot_point(self) -> np.ndarray:
        m = _mid(_pt(self.kp, L_ANKLE), _pt(self.kp, R_ANKLE))
        if m is not None:
            return m
        return np.array(
            [(self.bbox[0] + self.bbox[2]) / 2.0, self.bbox[3]], dtype=np.float32
        )


class TrackHistory:
    def __init__(self, track_id: int):
        self.id = track_id
        self.samples: deque[Sample] = deque(maxlen=300)
        self.first_seen = 0.0
        self.last_seen = 0.0

    def push(self, t: float, bbox: np.ndarray, kp: np.ndarray) -> None:
        if not self.samples:
            self.first_seen = t
        self.samples.append(Sample(t, bbox, kp))
        self.last_seen = t
        while self.samples and t - self.samples[0].t > HISTORY_SECONDS:
            self.samples.popleft()

    @property
    def latest(self) -> Sample | None:
        return self.samples[-1] if self.samples else None

    def since(self, seconds: float) -> list[Sample]:
        if not self.samples:
            return []
        cut = self.last_seen - seconds
        return [s for s in self.samples if s.t >= cut]

    def between(self, older: float, newer: float) -> list[Sample]:
        if not self.samples:
            return []
        hi = self.last_seen - newer
        lo = self.last_seen - older
        return [s for s in self.samples if lo <= s.t <= hi]

    def speed(self, window: list[Sample], indices=None,
              stride: float = STRIDE_SECONDS) -> float:
        """Velocidad en largos-de-torso por segundo, sobre un salto temporal fijo.

        Comparar frames consecutivos es una trampa a FPS altos: con dt = 0.036 s,
        3 px de jitter en un keypoint se leen como 1.4 torsos/segundo. Medido con
        camara real, dos personas quietas conversando daban movimiento 1.0.
        Comparar contra el frame de hace `stride` segundos promedia ese ruido y
        deja pasar solo el desplazamiento que de verdad ocurrio.

        `indices` restringe el calculo a un subconjunto de keypoints, que es lo
        que permite separar "mueve el tronco" de "mueve las manos".
        """
        if len(window) < 2:
            return 0.0

        sel = None
        if indices is not None:
            sel = np.zeros(window[0].kp.shape[0], dtype=bool)
            sel[list(indices)] = True

        speeds: list[float] = []
        j = 0
        for i, a in enumerate(window):
            j = max(j, i + 1)
            while j < len(window) and window[j].t - a.t < stride:
                j += 1
            if j >= len(window):
                break
            b = window[j]
            dt = b.t - a.t
            if dt <= 1e-3:
                continue
            mask = (a.kp[:, 2] > KP_CONF) & (b.kp[:, 2] > KP_CONF)
            if sel is not None:
                mask = mask & sel
            if mask.sum() >= 2:
                d = float(np.linalg.norm(b.kp[mask, :2] - a.kp[mask, :2], axis=1).mean())
            else:
                d = float(np.linalg.norm(b.center - a.center))
            speeds.append(d / dt / max(b.scale, 1.0))

        if not speeds:
            # Ventana mas corta que el salto: medir de extremo a extremo.
            a, b = window[0], window[-1]
            dt = b.t - a.t
            if dt <= 1e-3:
                return 0.0
            return float(np.linalg.norm(b.center - a.center)) / dt / max(b.scale, 1.0)

        return float(np.percentile(speeds, 75))


# --------------------------------------------------------------------------
# Senales. Firma uniforme: f(hist, ctx) -> float en [0, 1]
# --------------------------------------------------------------------------

def sig_concealment(hist: TrackHistory, ctx: dict) -> float:
    """Mano que va del exterior hacia el torso y se queda ahi."""
    recent = hist.since(1.6)
    if len(recent) < 5:
        return 0.0
    frac = sum(1 for s in recent if s.wrist_in_torso_zone()) / len(recent)
    prior = hist.between(4.0, 1.6)
    reached = any(s.wrist_extended() for s in prior)
    # Sin el gesto previo de alcanzar, una mano en la cintura es solo postura.
    return _clamp(frac if reached else frac * 0.3)


def sig_motion(hist: TrackHistory, ctx: dict) -> float:
    """Energia de movimiento: forcejeos, golpes, carreras.

    Dos correcciones, ambas nacidas de medir:

    1. Exige que se muevan tronco Y extremidades, y se queda con la mas debil.
       Gesticular al hablar mueve mucho las manos y nada el tronco, y antes eso
       puntuaba igual que una pelea.
    2. Si hay corrillo, se compara contra el resto de la escena. Medido sobre
       358 clips de CCTV de calle, el movimiento absoluto apenas separaba (0.98
       con incidente contra 0.74 sin el): en una calle con gente TODO el mundo
       se mueve. Una pelea no es moverse mucho, es moverse mucho MAS que los
       demas.
    """
    window = hist.since(1.0)
    core_raw = hist.speed(window, CORE_KP)
    absoluto = min(_clamp(core_raw / 1.6), _clamp(hist.speed(window, LIMB_KP) / 3.2))

    vecinos = [h for h in ctx.get("tracks", {}).values()
               if h.id != hist.id and ctx["now"] - h.last_seen <= 0.5
               and len(h.samples) >= 4]
    # Con una sola persona al lado no hay "resto de la escena" contra el que
    # comparar, y una pelea entre dos en un sitio vacio debe medirse absoluta.
    if len(vecinos) < 2:
        return absoluto

    ritmos = sorted(h.speed(h.since(1.0), CORE_KP) for h in vecinos)
    tipico = ritmos[len(ritmos) // 2]
    if tipico < 0.15:
        return absoluto

    relativo = _clamp((core_raw / tipico - 1.0) / 1.5)
    return min(absoluto, relativo)


def sig_proximity(hist: TrackHistory, ctx: dict) -> float:
    """Cercania fisica con otra persona."""
    me = hist.latest
    if me is None:
        return 0.0
    best = 0.0
    for other in ctx.get("tracks", {}).values():
        if other.id == hist.id or other.latest is None:
            continue
        if ctx["now"] - other.last_seen > 0.5:
            continue
        d = float(np.linalg.norm(me.center - other.latest.center))
        norm = d / max((me.scale + other.latest.scale) / 2.0, 1.0)
        best = max(best, _clamp((3.2 - norm) / 2.0))
    return best


def sig_fall(hist: TrackHistory, ctx: dict) -> float:
    """Caida: estaba de pie, baja rapido y queda horizontal.

    La referencia previa usa el instante MAS erguido y MAS alto de los ultimos
    segundos, no el promedio. Asi la senal no se apaga mientras la persona sigue
    en el suelo, que es justo cuando hay que seguir alertando.
    """
    recent = hist.since(0.6)
    prior = hist.between(5.0, 1.0)
    if len(recent) < 3 or len(prior) < 3:
        return 0.0
    horiz_now = float(np.mean([s.horizontality for s in recent]))
    if horiz_now < 0.3:
        return 0.0
    horiz_before = min(s.horizontality for s in prior)
    y_now = float(np.mean([s.center[1] / s.scale for s in recent]))
    y_before = min(s.center[1] / s.scale for s in prior)
    drop = _clamp((y_now - y_before) / 1.1)
    was_upright = _clamp(1.0 - horiz_before / 0.45)
    return _clamp((0.55 * horiz_now + 0.45 * drop) * (0.4 + 0.6 * was_upright))


def sig_immobility(hist: TrackHistory, ctx: dict) -> float:
    """Quieto en el suelo: distingue una caida real de un tropiezo."""
    window = hist.since(2.5)
    if len(window) < 8:
        return 0.0
    still = _clamp(1.0 - hist.speed(window) / 0.7)
    span = _clamp((window[-1].t - window[0].t) / 2.5)
    return still * span


def sig_scanning(hist: TrackHistory, ctx: dict) -> float:
    """Barrido de la cabeza: mirar a un lado y a otro repetidamente.

    En robo, el indicio documentado no es ocultar por si solo, sino comprobar
    si alguien mira JUSTO ANTES de ocultar. Por si sola esta senal es debil, un
    cliente tambien mira alrededor buscando productos; su valor esta en sumarse
    a `concealment`, no en disparar sola.
    """
    window = hist.since(3.0)
    yaws = [s.head_yaw for s in window]
    yaws = [y for y in yaws if y is not None]
    if len(yaws) < 5:
        return 0.0

    barrido = _clamp((max(yaws) - min(yaws)) / 1.1)

    # Cambios de sentido: mirar a un lado y volver, no un giro unico.
    vueltas = 0
    ultimo = 0
    for a, b in zip(yaws, yaws[1:]):
        paso = b - a
        if abs(paso) < 0.08:
            continue
        signo = 1 if paso > 0 else -1
        if ultimo and signo != ultimo:
            vueltas += 1
        ultimo = signo

    return _clamp(0.6 * barrido + 0.4 * _clamp(vueltas / 3.0))


def sig_dwell(hist: TrackHistory, ctx: dict) -> float:
    """Permanencia prolongada en el mismo punto."""
    window = hist.since(HISTORY_SECONDS)
    if len(window) < 10:
        return 0.0
    centers = np.array([s.center / s.scale for s in window])
    spread = float(np.linalg.norm(centers.max(axis=0) - centers.min(axis=0)))
    stationary = _clamp(1.0 - spread / 2.2)
    span = _clamp((window[-1].t - window[0].t) / 5.0)
    return stationary * span


def _point_in_poly(x: float, y: float, poly: np.ndarray) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def sig_zone(hist: TrackHistory, ctx: dict) -> float:
    """Pisada dentro de una zona restringida definida por el operador."""
    zones = ctx.get("zones") or []
    me = hist.latest
    if not zones or me is None:
        return 0.0
    h, w = ctx["frame_shape"][:2]
    foot = me.foot_point()
    px, py = float(foot[0]) / max(w, 1), float(foot[1]) / max(h, 1)
    for poly in zones:
        if _point_in_poly(px, py, np.array(poly, dtype=np.float32)):
            return 1.0
    return 0.0


def sig_presence(hist: TrackHistory, ctx: dict) -> float:
    """Constante: habilita auditorias periodicas con el VLM, p.ej. control de EPP."""
    return 1.0 if hist.latest is not None else 0.0


SIGNALS = {
    "concealment": sig_concealment,
    "motion": sig_motion,
    "proximity": sig_proximity,
    "fall": sig_fall,
    "immobility": sig_immobility,
    "scanning": sig_scanning,
    "dwell": sig_dwell,
    "zone": sig_zone,
    "presence": sig_presence,
}
