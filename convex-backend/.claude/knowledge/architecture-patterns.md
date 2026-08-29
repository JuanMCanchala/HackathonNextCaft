# Architecture patterns

Sentra uses Convex function modules with explicit public/internal seams. Keep authorization and workspace resolution at public entrypoints, domain policy in deep modules, persistence behind transactional mutations, and external/model I/O in actions. Canonical references: `docs/DOMAIN-DESIGN.md`, `docs/API-SITEMAP.md`, `convex/_generated/ai/guidelines.md`.
