# Design: Sentra Backend

## Technical Approach

Use the Convex product backend in `convex-backend/` as a single workspace-isolated deployment, while preserving the Python model package in `backend/` as an upstream producer. Public Convex queries/mutations serve Angular and return API-CONTRACT `1.0.0-mvp` DTOs; normalized model intake is private and funnels into one transactional use case. Keep pure domain modules behind a deep feature interface; Convex functions are adapters, not duplicated business logic. Existing Agent Component/chat remains isolated and is not an authorization baseline.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|---|---|---|
| Self-hosted Compose has backend (3210), site proxy (3211), optional dashboard (6791) | `convex dev` as runtime; managed-only | Compose is the documented persistent local service boundary; `convex dev` is a subprocess/developer tool, not a production-like service. Dashboard is opt-in and never required for app use. |
| Named persistent Convex volume | Ephemeral container or host bind by default | Restarts/recreates preserve data and local configuration; reset requires explicit volume deletion. |
| Local origin and stable tunnel origin are separate explicit profiles | Implicit wildcard trust | Direct localhost is the default; a named Cloudflare Tunnel hostname is opt-in, limited to declared frontend/origin paths, and never becomes product auth. |
| Clerk for product users; infrastructure admin key for Convex operations | Treat admin key as a user credential | Clerk JWT derives `tokenIdentifier` and active membership. The Convex admin key is server/operator-only, never browser-visible, and does not grant workspace membership. |
| Pure domain seams plus one mutation transaction | Rules in queries/actions; multi-call intake | Normalize, grouping, severity, and transition logic are deterministic and unit-testable. A mutation atomically performs idempotency, detection/linkage, incident state, timeline, audit, and event records. |

Compose health/readiness must distinguish process health from dependency readiness: backend/site checks are direct HTTP probes; readiness is non-success while required services initialize or fail. Dashboard health is optional. Missing/invalid admin key, tunnel token, hostname, or required origin configuration fails closed with redacted actionable errors; the no-dashboard local path must not require an admin key beyond documented setup.

## Data Flow

```text
Angular + Clerk JWT ──> Convex 3210/3211 ──> authz(tokenIdentifier,membership)
                                      └──> bounded queries ──> contract DTOs
Model service ──private credential──> internal intake ──> one transaction ──> DB/events
Optional cloudflared: stable host ──> declared local origin only
```

Frontend receives `NEXT_PUBLIC_CONVEX_URL` (or equivalent frontend runtime config) for the selected local/stable origin and uses `ConvexProviderWithAuth` with Clerk token fetching; it must not receive `CONVEX_ADMIN_KEY` or internal credentials. Product Clerk authentication remains independent of tunnel and dashboard access.

Future HTTP `/v1` and MCP adapters should call the same use-case interface. Future Convex functions belong in feature modules with validators; internal intake remains `internalMutation` behind an authenticated adapter. Internal credential binding must prove service-to-workspace/camera authorization before trusting asserted IDs. Preserve opaque IDs, RFC3339 DTO timestamps, closed enums, `Page<T>`, safe errors/request IDs, and API-CONTRACT field names even when storage uses epoch milliseconds and separate link/timeline tables.

## File Changes

| File | Action | Purpose |
|---|---|---|
| `convex-backend/convex/schema.ts` | Modify | Workspace-first tables/indexes; immutable/link/audit records. |
| `convex-backend/convex/{auth.config.ts,convex.config.ts}` | Modify | Clerk issuer and typed secret configuration; retain Agent mount. |
| `convex-backend/convex/lib/{authz,domain,dto}/*` | Create/modify | Deep auth/use-case seams, pure rules, contract mappers. |
| `convex-backend/convex/{cameras,detections,incidents,workspaces}.ts` | Create/modify | Validated public adapters and private intake. |
| `convex-backend/compose*.yml`, `.env.example`, docs | Create | Compose profiles, volume, probes, origins/tunnel, reset/recovery. |
| `convex-backend/tests/**` | Create/modify | Jest units plus deliberate Convex harness. |

## Testing Strategy

Strict TDD: Jest/ts-jest RED tests cover normalization, category, grouping boundaries, severity policy, transitions, DTOs, origin/secret validation. A separate deliberate `convex-test` + edge-runtime harness (despite the Jest default) covers auth isolation, indexes, concurrent idempotency, atomic rollback, and realtime-visible committed state. Run `pnpm test`, typecheck, lint, format, build, and `convex dev --once`; do not claim integration coverage from Jest alone.

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is being designed; `cloudflared` is an infrastructure configuration, not an application subprocess contract.

## Migration / Rollout

Add Compose and schema additively. Start backend/site, verify health then readiness, seed only through an internal operation, and enable dashboard/tunnel only by explicit profile. Rollback disables Sentra adapters and reverts code/schema together; preserve the Agent data. Reset is `down` plus explicit volume deletion (document data loss); recovery reuses the same volume. Do not expose stable origins until health, auth, and DTO contract checks pass.

## Open Questions (blocking policy)

- What exact internal credential mechanism and service-to-workspace/camera binding are approved?
- What category taxonomy, grouping window/boundary/late-event policy, and severity rule values/version are authoritative?
- Is self-hosted Compose strictly development/support-only, or an accepted deployment mode?
- Which Clerk issuer/application ID and bootstrap/provisioning procedure are approved?
- Which lifecycle dismissal rule and triage idempotency scope are authoritative?
