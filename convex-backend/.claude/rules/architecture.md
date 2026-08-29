# Architecture rules

- Keep domain policy in deep modules with small interfaces; adapters handle Convex, providers, and transport.
- Preserve workspace isolation across every seam. Read `RULES.md`, `docs/DOMAIN-DESIGN.md`, and `docs/API-SITEMAP.md` first.
- Do not mix external I/O, authorization policy, and persistence without an explicit interface and test surface.
