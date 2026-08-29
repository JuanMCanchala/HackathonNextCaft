# Proposal: Sentra Backend Secure Vertical Slice

## Intent
Prove a secure loop: observation → detection → deterministic incident → Clerk-authenticated triage via Convex realtime. Unlock Angular without HTTP via API-CONTRACT DTOs (`1.0.0-mvp`).

## Assumptions (frozen from explore #1005)
- Public Convex workspaces/cameras/incidents returns MUST match `docs/API-CONTRACT.md` + `api-contract.schemas.json` (same as future `/v1`).
- Frontend P0: Clerk → Convex `cameras.list/get`, `incidents.list/get`, triage; no browser HTTP. Internal intake stays non-browser.
- Later dismiss: API-CONTRACT allows dismiss from `acknowledged` (UI authority vs DOMAIN). Slice only `detected -> triaged`.

## Scope
### In Scope
- Seeded workspace + membership; server-derived identity; workspace-scoped access.
- Admin camera create; unique external ID per workspace; authorized list/get.
- Authenticated internal normalized intake (idempotent, immutable).
- Deterministic grouping + explicit severity/rule version.
- Bounded incident list/get + `detected -> triaged` (version/idempotency, timeline, audit, event IDs).
- Unit + Convex tests; contract-shaped public returns.

### Out of Scope
Public HTTP/OpenAPI, API keys, webhooks, evidence access, heartbeat, MCP, stats, acknowledge/resolve/dismiss, severity overrides, video, full membership admin.

## Capabilities
### New Capabilities
- `workspace-authorization`: membership, isolation, workspace DTO reads.
- `camera-registration`: create/list/get with Camera DTO parity.
- `detection-intake`: idempotent internal acceptance (not browser-callable).
- `incident-operations`: grouping, severity, list/get/triage, audit; Incident DTO parity.
### Modified Capabilities
- Change-folder specs `camera-registration`, `incident-operations`, `workspace-authorization`: add DTO parity; note dismiss-from-acknowledged freeze (no ack/resolve/dismiss).

## Approach
Convex-first with contract-shaped DTOs. Pure normalize/group/severity/transition helpers; mutations as adapters; validators + workspace-first indexes; intake → `internalMutation`. One txn for idempotency/detection/linkage/audit/events. Isolate `chat.ts`; never use as auth baseline.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `convex/schema.ts` | New | Sentra tables/indexes |
| `convex/{auth,authorization,cameras,detections,incidents}.ts` | New | Auth, CRUD, intake, triage |
| `docs/API-CONTRACT.md`, `api-contract.schemas.json` | Modified | DTO source of truth |
| `convex/chat.ts` | Modified | Isolate/secure |
| `tests/`, `**/*.test.ts` | New | TDD + convex-test |

## Risks
| Risk | Level | Mitigation |
|------|-------|------------|
| Auth/bootstrap blocks deploy | High | Clerk issuer, internal credential, seeded membership |
| DTO drift vs Angular/HTTP | High | Validate returns vs schemas `1.0.0-mvp` |
| Group/severity policy gaps | High | Version policies before apply |
| Concurrent intake duplicates | Medium | Atomic txn + concurrency tests |

## Rollback Plan
Disable Sentra functions; revert schema/code together; preserve chat/data. Isolate seeded records.

## Dependencies
Clerk issuer/app ID; internal intake credential; seeded workspace; category taxonomy; grouping/severity policies; Convex test harness.

## Success Criteria
- [ ] No cross-workspace leakage; camera IDs workspace-unique; reads bounded/validated.
- [ ] Intake: one detection/incident; replay stable IDs, no duplicates; grouping/severity deterministic.
- [ ] Triage only from `detected`, idempotent, with audit + timeline.
- [ ] Public Convex cameras/incidents/workspaces match API-CONTRACT DTOs (`1.0.0-mvp`).
