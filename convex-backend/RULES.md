# Sentra Convex Rules

These rules are the project-owned quick reference. Generated Convex guidance remains authoritative for framework mechanics.

## Security and isolation

- Derive identity from `ctx.auth.getUserIdentity()` on the server. Use the stable `identity.tokenIdentifier` for membership and ownership; never use client-supplied user IDs or `subject` as the canonical ownership key.
- Resolve the active workspace before reading or mutating a resource. Every query, mutation, action handoff, and storage lookup must carry an authorized workspace scope.
- Foreign, missing, and unauthorized resources should have non-disclosing behavior. Check membership/role/scope before revealing resource existence.
- Public functions are the untrusted boundary: validate every argument and return value, authenticate, authorize, and rate/bound work. Internal functions are server-only seams, not a replacement for authorization at public entrypoints.

## Convex functions and data

- Use Convex validators for all function args and returns; use `v.id("table")` for document references and reject unknown/unbounded input.
- Prefer declared indexes and index-first reads. Paginate large collections, set explicit limits, and never scan an unbounded table or load an unbounded document set.
- Queries and mutations are transactional. Actions are for external I/O and model calls; keep database writes in mutations and pass explicit, validated data across the runtime seam. Use internal references for scheduled/background work.
- Evolve schema compatibly: add optional fields, backfill, switch readers/writers, then tighten/remove only after evidence. Do not silently reinterpret existing records.

## Domain invariants

- Detections are immutable evidence: append new observations/corrections rather than mutating historical detection facts. Incident/status transitions must be explicit and auditable.
- Mutations that can be retried require an idempotency key and a uniqueness/index strategy. Store actor, workspace, request/correlation ID, timestamp, and outcome for security-relevant changes.
- Keep DTO/API contracts stable and aligned with `docs/API-CONTRACT.md` and `docs/api-contract.schemas.json`; do not leak persistence-only fields or secrets.
- Secrets belong in environment/deployment configuration, never source, arguments, logs, or persisted DTOs. Redact provider responses and error details at public boundaries.

## Negative tests are mandatory

For every protected operation test unauthenticated access, a foreign workspace/member, insufficient role/scope, invalid IDs/arguments, replayed idempotency keys, and empty/boundary pagination where applicable. Include at least two identities and assert non-disclosure, not merely thrown errors.
