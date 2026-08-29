"""Valida el motor de senales con poses sinteticas.

No necesita camara, ni GPU, ni API. Sirve para dos cosas: comprobar que la
Etapa 1 discrimina antes de tener video real, y para reajustar umbrales sin
tener que actuar delante de la webcam.

    python -m tools.selftest
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.core.gate import Domain, Gate                      # noqa: E402
from backend.core.signals import SIGNALS, TrackHistory          # noqa: E402

FPS = 25.0
S = 60.0  # largo de torso en pixeles


def pose(cx: float, cy: float, wrists=None, angle: float = 0.0,
         yaw: float = 0.0, s: float = S):
    """Persona de pie en (cx, cy). cy es la altura de la cadera.

    `angle` en radianes rota el cuerpo alrededor de la cadera: 0 = de pie,
    pi/2 = tumbado. `wrists` sobrescribe la posicion de las munecas.
    `yaw` en [-1, 1] gira la cabeza: desplaza nariz y orejas como lo haria
    un giro real, para poder probar la senal de barrido visual.
    """
    base = {
        0: (0.0, -1.62), 1: (-0.09, -1.70), 2: (0.09, -1.70),
        3: (-0.20, -1.66), 4: (0.20, -1.66),
        5: (-0.45, -1.00), 6: (0.45, -1.00),
        7: (-0.58, -0.45), 8: (0.58, -0.45),
        9: (-0.62, 0.10), 10: (0.62, 0.10),
        11: (-0.28, 0.0), 12: (0.28, 0.0),
        13: (-0.30, 0.95), 14: (0.30, 0.95),
        15: (-0.30, 1.90), 16: (0.30, 1.90),
    }
    if yaw:
        # La nariz se desplaza mas que las orejas al girar la cabeza.
        base[0] = (base[0][0] + yaw * 0.13, base[0][1])
        base[1] = (base[1][0] + yaw * 0.11, base[1][1])
        base[2] = (base[2][0] + yaw * 0.11, base[2][1])
        base[3] = (base[3][0] + yaw * 0.05, base[3][1])
        base[4] = (base[4][0] + yaw * 0.05, base[4][1])
    if wrists:
        base[9], base[10] = wrists
    kp = np.zeros((17, 3), dtype=np.float32)
    ca, sa = np.cos(angle), np.sin(angle)
    for i, (dx, dy) in base.items():
        x, y = dx * s, dy * s
        kp[i] = (cx + x * ca - y * sa, cy + x * sa + y * ca, 0.95)
    xs, ys = kp[:, 0], kp[:, 1]
    bbox = np.array([xs.min() - 6, ys.min() - 6, xs.max() + 6, ys.max() + 6],
                    dtype=np.float32)
    return bbox, kp


def build(frames, track_id: int = 1):
    """Identidad: las escenas ya devuelven la lista de frames."""
    return frames


def simulate(domain: Domain, primary: list, secondary: list | None = None):
    """Reproduce la escena frame a frame contra el Gate, como el pipeline real.

    Devuelve (disparo, score_maximo, senales_en_el_pico).
    """
    gate = Gate(domain)
    hist = TrackHistory(1)
    other = TrackHistory(2) if secondary else None
    tracks = {1: hist} | ({2: other} if other else {})

    fired = False
    best_score = 0.0
    best_values: dict[str, float] = {}

    for i, (bbox, kp) in enumerate(primary):
        t = i / FPS
        hist.push(t, bbox, kp)
        if other is not None and i < len(secondary):
            other.push(t, *secondary[i])

        ctx = {"now": t, "tracks": tracks,
               "frame_shape": (720, 1280, 3), "zones": domain.zones}
        values, score, trigger = gate.evaluate(hist, ctx)
        # Solo cuenta lo que el gate mira de verdad: durante los primeros
        # min_track_seconds la historia es demasiado corta y las senales aun no
        # significan nada. Incluirlas inflaba el pico y ocultaba el motivo real
        # de que un escenario no disparase.
        mature = (hist.last_seen - hist.first_seen) >= domain.min_track_seconds
        if mature and score > best_score:
            best_score, best_values = score, values
        fired = fired or trigger

    return fired, best_score, best_values


# ---------------------------------------------------------------- escenarios

def scene_idle():
    """De pie, quieto, brazos colgando. No debe disparar nada."""
    return build([pose(640, 400) for _ in range(int(5 * FPS))])


def scene_browsing():
    """Coge un producto del estante y lo devuelve. Comportamiento normal."""
    frames = []
    for i in range(int(5 * FPS)):
        p = i / (5 * FPS)
        # el brazo sale hacia el estante y vuelve a colgar, nunca al torso
        reach = np.sin(p * np.pi) * 0.75
        wr = ((-0.62, 0.10), (0.62 + reach, 0.10 - reach * 0.9))
        frames.append(pose(640, 400, wrists=wr))
    return build(frames)


def scene_concealment():
    """Alcanza el estante y lleva la mano al torso, donde se queda."""
    frames = []
    total = int(5 * FPS)
    for i in range(total):
        p = i / total
        if p < 0.45:                       # alcanzando el estante
            reach = min(p / 0.45, 1.0) * 0.85
            wr = ((-0.62, 0.10), (0.62 + reach, 0.10 - reach))
        else:                              # mano dentro de la ropa, sobre la cadera
            wr = ((-0.62, 0.10), (0.12, 0.02))
        frames.append(pose(640, 400, wrists=wr))
    return build(frames)


def scene_scan_and_conceal():
    """Mira a un lado y a otro, y despues oculta el producto.

    Es el patron documentado del robo: comprobar si alguien mira ANTES de
    ocultar. Debe puntuar mas alto que ocultar sin mas.
    """
    frames = []
    total = int(5 * FPS)
    for i in range(total):
        p = i / total
        yaw = np.sin(i * 0.55) * 0.95 if p < 0.5 else 0.15
        if p < 0.45:
            reach = min(p / 0.45, 1.0) * 0.85
            wr = ((-0.62, 0.10), (0.62 + reach, 0.10 - reach))
        else:
            wr = ((-0.62, 0.10), (0.12, 0.02))
        frames.append(pose(640, 400, wrists=wr, yaw=yaw))
    return build(frames)


def scene_fall():
    """De pie 2.5 s, cae en 0.5 s y queda inmovil en el suelo."""
    frames = []
    for _ in range(int(2.5 * FPS)):
        frames.append(pose(640, 400))
    fall_n = int(0.5 * FPS)
    for i in range(fall_n):
        p = (i + 1) / fall_n
        frames.append(pose(640, 400 + p * 1.5 * S, angle=p * np.pi / 2))
    for _ in range(int(3.0 * FPS)):
        frames.append(pose(640, 400 + 1.5 * S, angle=np.pi / 2))
    return build(frames)


def scene_sitting_down():
    """Se agacha despacio y se queda en cuclillas. NO es una caida."""
    frames = []
    for _ in range(int(2.5 * FPS)):
        frames.append(pose(640, 400))
    n = int(2.0 * FPS)
    for i in range(n):
        p = (i + 1) / n
        frames.append(pose(640, 400 + p * 0.5 * S, angle=p * 0.25))
    for _ in range(int(2.0 * FPS)):
        frames.append(pose(640, 400 + 0.5 * S, angle=0.25))
    return build(frames)


def scene_fight():
    """Forcejeo: se mueven los cuerpos enteros, no solo los brazos."""
    a, b = [], []
    for i in range(int(4 * FPS)):
        j = np.sin(i * 0.45) * 0.42 * S
        wr_a = ((-0.62 + j / S, 0.10), (0.9 + j / S, -0.8))
        wr_b = ((-0.9 - j / S, -0.8), (0.62 - j / S, 0.10))
        a.append(pose(610 + j, 400 + j * 0.25, wrists=wr_a))
        b.append(pose(670 - j, 400 - j * 0.25, wrists=wr_b))
    return build(a, track_id=1), build(b, track_id=2)


def scene_talking():
    """Dos personas conversando y gesticulando mucho con las manos.

    Este es el falso positivo que aparecio con camara real: las manos van rapido
    pero el tronco no se mueve. No debe disparar.
    """
    a, b = [], []
    for i in range(int(4 * FPS)):
        g = np.sin(i * 0.9) * 0.7          # gesticulacion amplia y rapida
        h = np.cos(i * 1.1) * 0.6
        wr_a = ((-0.62, 0.10 - g * 0.9), (0.62 + g * 0.5, 0.10 - g))
        drift = np.sin(i * 0.05) * 0.04 * S   # el cuerpo apenas se mueve
        a.append(pose(612 + drift, 400, wrists=wr_a))
        b.append(pose(668 - drift, 400,
                      wrists=((-0.62 - h * 0.5, 0.10 - h), (0.62, 0.10 - h * 0.9))))
    return build(a, track_id=1), build(b, track_id=2)


def scene_greeting():
    """Dos personas cerca, saludandose despacio. No es agresion."""
    a, b = [], []
    for i in range(int(4 * FPS)):
        j = np.sin(i * 0.18) * 0.06 * S
        a.append(pose(605 + j, 400))
        b.append(pose(675 - j, 400))
    return build(a, track_id=1), build(b, track_id=2)


# ---------------------------------------------------------------- ejecucion

def main() -> int:
    domains = {p.stem: Domain.load(p)
               for p in sorted((Path(__file__).parent.parent
                                / "backend" / "domains").glob("*.yaml"))}

    fight_a, fight_b = scene_fight()
    greet_a, greet_b = scene_greeting()
    talk_a, talk_b = scene_talking()

    cases = [
        # (nombre, track principal, track secundaria, dominio, se espera disparo)
        ("quieto de pie",       scene_idle(),         None,     "retail_theft",      False),
        ("mirando un producto", scene_browsing(),     None,     "retail_theft",      False),
        ("oculta el producto",  scene_concealment(),  None,     "retail_theft",      True),
        ("mira y luego oculta", scene_scan_and_conceal(), None, "retail_theft",      True),
        ("caida e inmovil",     scene_fall(),         None,     "fall_detection",    True),
        ("se agacha despacio",  scene_sitting_down(), None,     "fall_detection",    False),
        ("pelea",               fight_a,              fight_b,  "violence",          True),
        ("saludo tranquilo",    greet_a,              greet_b,  "violence",          False),
        ("conversando/gestos",  talk_a,               talk_b,   "violence",          False),
    ]

    print(f"\n{'escenario':<22}{'dominio':<20}{'pico':>6}{'umbral':>8}  "
          f"{'esperado':<10}resultado")
    print("-" * 84)

    failures = 0
    for name, primary, secondary, domain_id, expect in cases:
        domain = domains[domain_id]
        fired, score, values = simulate(domain, primary, secondary)
        ok = fired == expect
        failures += not ok
        top = sorted(((k, v) for k, v in values.items() if k in domain.weights),
                     key=lambda kv: -kv[1])
        detail = "  ".join(f"{k}={v:.2f}" for k, v in top)
        print(f"{name:<22}{domain.label:<20}{score:>6.2f}{domain.threshold:>8.2f}  "
              f"{'dispara' if expect else 'silencio':<10}"
              f"{'OK' if ok else 'FALLA'}")
        print(f"{'':<22}{detail}")

    # Regresion: una senal en float32 rompe /api/state con un 500 y se cuela
    # como string por el WebSocket sin dar error.
    tipos_malos = []
    for name, primary, secondary, domain_id, _expect in cases:
        _f, _s, values = simulate(domains[domain_id], primary, secondary)
        for sig, val in values.items():
            if type(val) is not float:
                tipos_malos.append(f"{name}/{sig} -> {type(val).__name__}")
    if tipos_malos:
        failures += 1
        print("\nSenales que no devuelven float nativo:")
        for t in tipos_malos[:8]:
            print("  ", t)
    else:
        print("Todas las senales devuelven float nativo.")

    print("-" * 84)
    if failures:
        print(f"{failures} de {len(cases)} escenarios no se comportan como deberian.\n")
    else:
        print(f"Los {len(cases)} escenarios discriminan correctamente.\n")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
