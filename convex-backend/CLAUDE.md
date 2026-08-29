<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Project-owned Sentra governance

### Source of truth and scope

1. Human request and repository safety boundaries are authoritative.
2. Current checked-in implementation and tests describe shipped behavior.
3. OpenSpec artifacts govern accepted change intent and verification: `openspec/config.yaml`.
4. Product/domain contracts are canonical for intended behavior: `docs/SENTRA-PRD.md`, `docs/DOMAIN-DESIGN.md`, `docs/USE-CASES.md`, `docs/API-SITEMAP.md`, `docs/API-CONTRACT.md`, `docs/api-contract.schemas.json`, and `docs/BACKEND-TEST-CASES.md`.
5. Generated Convex guidance at `convex/_generated/ai/guidelines.md` governs Convex API usage; generated skills are advisory and managed.
6. General model knowledge is last and never overrides repository evidence.

This governance layer applies only to `convex-backend/`. The sibling root `backend/` is a separate Python model package and is out of scope; do not edit it for Convex work.

### Read first, every task

Read this file, `RULES.md`, `convex/_generated/ai/guidelines.md`, then the relevant canonical product/API docs, `openspec/config.yaml`, the target implementation, and its tests. Resolve contradictions in the hierarchy above; record uncertainty instead of guessing.

### Delivery gate

Use TDD: write or update a failing focused test first, implement the smallest change, then refactor. Before completion run the relevant Jest tests (including negative authz tests), `pnpm run typecheck`, `pnpm run lint:check`, `pnpm run format:check`, and `pnpm run build`. Run `pnpm exec convex dev --once` only when deployment/environment prerequisites are available; it is an additional validation, not a substitute for deterministic tests. Hooks format/lint only and never replace tests, typecheck, or build.

### Ownership and delegation

User-owned files in `RULES.md`, `.agents/`, `.claude/`, and these instruction files may be edited when the task explicitly concerns governance. Product code, docs, tests, and OpenSpec artifacts require task scope and evidence. Delegate only within `convex-backend/`, pass the read-first order and exact canonical paths, and constrain each delegate to its declared write surface. Never edit `convex/_generated/**`, `.agents/skills/**`, `.claude/skills/**`, or `skills-lock.json` by hand; regenerate them only through their owning Convex tooling. Do not broaden a task into the sibling Python `backend/`.
