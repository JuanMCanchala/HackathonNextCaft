"""Comprueba que los dos backends siguen hablando el mismo idioma.

Las taxonomias viven en repos distintos y en lenguajes distintos, asi que es
facil ampliar una y olvidar la otra. Cuando eso pasa el pipeline no falla: se
limita a dejar de registrar incidentes en Convex, en silencio. Este test lo
convierte en un fallo ruidoso.

    .venv\Scripts\python.exe -m tools.test_taxonomia
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.core.gate import load_domains                      # noqa: E402
from backend.core.intake import (                               # noqa: E402
    CATEGORIAS_CONVEX, NO_INCIDENTE, POR_TIPO, categoria_convex,
)

NORMALIZE = Path("convex-backend/convex/lib/domain/normalize.ts")
SEVERITY = Path("convex-backend/convex/lib/domain/severity.ts")


def allowlist_de_convex() -> set[str]:
    """Lee la allowlist del TypeScript, que es la fuente de verdad."""
    texto = NORMALIZE.read_text(encoding="utf-8")
    bloque = re.search(r"CATEGORY_ALLOWLIST\s*=\s*\[(.*?)\]", texto, re.S)
    if not bloque:
        raise RuntimeError(f"no encuentro CATEGORY_ALLOWLIST en {NORMALIZE}")
    return set(re.findall(r'"([^"]+)"', bloque.group(1)))


def con_regla_de_severidad() -> set[str]:
    texto = SEVERITY.read_text(encoding="utf-8")
    bloque = re.search(r"SEV_V\d\s*:\s*Record<[^>]+>\s*=\s*\{(.*?)\n\};", texto, re.S)
    if not bloque:
        raise RuntimeError(f"no encuentro la tabla de severidad en {SEVERITY}")
    return set(re.findall(r"^\s*(\w+)\s*:", bloque.group(1), re.M))


def main() -> int:
    fallos: list[str] = []

    if not NORMALIZE.exists():
        print(f"  aviso: no esta {NORMALIZE}; me salto la comprobacion cruzada")
        return 0

    allowlist = allowlist_de_convex()
    severidades = con_regla_de_severidad()
    print(f"\n  allowlist de Convex   {sorted(allowlist)}")
    print(f"  con regla de severidad {sorted(severidades)}")

    if allowlist != severidades:
        fallos.append(f"la allowlist y las reglas de severidad no coinciden: "
                      f"sin regla {sorted(allowlist - severidades)}, "
                      f"regla huerfana {sorted(severidades - allowlist)}")

    if set(CATEGORIAS_CONVEX) != allowlist:
        fallos.append(f"CATEGORIAS_CONVEX no refleja la allowlist: "
                      f"aqui de mas {sorted(set(CATEGORIAS_CONVEX) - allowlist)}, "
                      f"aqui de menos {sorted(allowlist - set(CATEGORIAS_CONVEX))}")

    inventadas = {v for v in POR_TIPO.values() if v and v not in allowlist}
    if inventadas:
        fallos.append(f"tipos mapeados a categorias que Convex rechazaria: {sorted(inventadas)}")

    # Todo tipo de incidente de todo dominio tiene que tener destino.
    print()
    huerfanos = []
    for domain in load_domains(Path("backend/domains")).values():
        for tipo in domain.taxonomy:
            if tipo.strip().lower() in NO_INCIDENTE:
                continue
            destino = categoria_convex(domain.id, tipo)
            estado = destino or "SIN DESTINO"
            print(f"  {domain.id:<19}{tipo:<38} -> {estado}")
            if destino is None:
                huerfanos.append(f"{domain.id}/{tipo}")
    if huerfanos:
        fallos.append(f"tipos de incidente sin categoria en Convex: {huerfanos}")

    print()
    if fallos:
        for f in fallos:
            print(f"  FALLA  {f}")
        print()
        return 1
    print("  Las dos taxonomias estan sincronizadas.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
