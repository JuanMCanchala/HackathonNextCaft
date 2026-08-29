# Design: Sentra Backend Secure Vertical Slice

## Technical Approach

Convex-first vertical slice: Clerk-authenticated public queries/mutations return API-CONTRACT DTOs (`1.0.0-mvp`) identical to future `/v1`. Detection intake is `internalMutation` only (no browser path). Pure helpers (normalize, group, severity, transition) behind thin Convex adapters; one txn owns idempotency → detection → grouping → audit/events. Specs: workspace-authorization, camera-registration, detection-intake, incident-operations. Isolate `chat.ts` / Agent — never Sentra auth baseline.

## Architecture Decisions

| Option                    | Tradeoff                                            | Decision                                                                                                                                             |
| ------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convex vs HTTP-first      | HTTP unlocks OpenAPI early; delays Angular realtime | **Convex-first**; HTTP later reuses DTO mappers                                                                                                      |
| Public vs internal intake | Public simpler, leaks ingestion                     | **`internalMutation` only**; later httpAction+secret optional                                                                                        |
| Identity key              | subject weaker across issuers                       | **`tokenIdentifier`** for membership                                                                                                                 |
| Client workspaceId        | Convenient, insecure                                | **Membership-gated**; never trust alone                                                                                                              |
| Grouping locus            | Query races                                         | **Inside intake txn** + workspace-first indexes                                                                                                      |
| Severity vs confidence    | Mixing breaks trust                                 | **Independent**; rule version; confidence immutable                                                                                                  |
| Foreign ID response       | FORBIDDEN leaks existence                           | **`NOT_FOUND`** non-disclosing                                                                                                                       |
| Disabled camera           | Soft-accept vs reject                               | **Reject** (DOMAIN)                                                                                                                                  |
| Test runner               | Guidelines=vitest; repo=Jest                        | **Jest + convex-test**; no vitest migration                                                                                                          |
| Coding style              | Mutable accumulators / unbounded `.collect()`       | **`const`-only construction**; Result parsers + `flatMap`; index-first **bounded** `.take` / page windows — aligns with `.agents/rules` + `RULES.md` |

### MVP policy defaults

| Policy             | Default                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| Grouping window    | 45s inclusive (`occurredAt` vs open `lastObservedAt`)                       |
| Open eligibility   | Group only `detected`\|`triaged`                                            |
| Late event         | New incident; still store detection                                         |
| Categories         | Allowlist `intrusion`,`smoke`,`fall`; trim+lowercase; else validation error |
| Severity `sev-v1`  | fall→critical, smoke→high, intrusion→high; missing rule → fail closed       |
| Triage idempotency | `workspaceId+incidentId+idempotencyKey`; mismatch → `IDEMPOTENCY_CONFLICT`  |
| Clerk              | `auth.config.ts` issuer+applicationID from env                              |
| Seed               | Internal mutation: one workspace + admin membership                         |
| Seed settings      | `retentionDays: 30`, `timezone: "UTC"`                                      |

## Data Flow

```
Angular --JWT--> Clerk
Angular --JWT--> Convex public (workspaces|cameras|incidents)
                    |-> AuthZ: identity → membership → role
                    |-> DB workspace-first indexes
                    \-> API-CONTRACT DTOs

Model service --> detections.acceptNormalized (internalMutation)
                    |-> validate → camera ownership → disabled reject
                    |-> idempotency → detection → group/create
                    |-> severity (create) → timeline/audit/events
                    \-> {detectionId, incidentId, disposition}
```

Roles: viewer read; operator+admin triage; workspace_admin camera create.

## File Changes

| File                      | Action | Description                                                                                          |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`        | Modify | Sentra tables/indexes; keep `threadMetadata`                                                         |
| `convex/auth.config.ts`   | Create | Clerk JWT provider                                                                                   |
| `convex/lib/authz.ts`     | Create | requireIdentity/membership/role                                                                      |
| `convex/lib/errors.ts`    | Create | Stable codes + requestId                                                                             |
| `convex/lib/dto/*`        | Create | Doc→API-CONTRACT mappers                                                                             |
| `convex/lib/domain/*`     | Create | Pure normalize/group/severity/transition (immutable Result parsers; no `let` reassignment)           |
| `convex/workspaces.ts`    | Create | list/get Workspace DTOs (membership-bounded `flatMap`, no mutable push)                              |
| `convex/cameras.ts`       | Create | create/list/get Camera DTO (page-window `.take`, no unbounded `.collect`)                            |
| `convex/detections.ts`    | Create | acceptNormalized internalMutation; thin adapter over domain helpers; grouping candidates `.take(64)` |
| `convex/incidents.ts`     | Create | list/get/triage                                                                                      |
| `convex/seed.ts`          | Create | Internal bootstrap seed                                                                              |
| `convex/chat.ts`          | Modify | Isolate; not Sentra auth                                                                             |
| `convex/convex.config.ts` | Modify | Typed env (Clerk, secrets)                                                                           |
| `tests/**/*.test.ts`      | Create | Unit + convex-test                                                                                   |
| `docs/API-CONTRACT*`      | Modify | Only if DTO gaps; keep 1.0.0-mvp                                                                     |

**Tables:** workspaces; memberships (`by_token_and_workspace`); cameras (`by_workspace_and_externalId`); detections (`by_workspace_source_event`); incidents (`by_workspace_state`, `by_workspace_camera_category_lastObserved`); incidentDetections; incidentTimeline; auditEntries; idempotencyRecords (`by_workspace_and_key`). Indexes lead with `workspaceId`.

## Interfaces / Contracts

Public returns match `API-CONTRACT.md` §5 / `api-contract.schemas.json` 1:1 (Workspace, Camera, IncidentSummary/Detail, Page). IDs = opaque Convex `_id` strings. Store epoch ms; DTO timestamps RFC3339 UTC. Every function has `v.*` validators; lists use `paginationOptsValidator`. Errors: UNAUTHENTICATED|FORBIDDEN|NOT_FOUND|VALIDATION_ERROR|CONFLICT|IDEMPOTENCY_CONFLICT + requestId.

### Implementation hygiene (governance)

Per `AGENTS.md`, `RULES.md`, and `.agents/rules/{architecture,convex-functions}.md`:

- Prefer `const` and immutable construction; avoid reassigned `let` and in-place `.push` accumulators in Sentra modules.
- Keep domain policy in `convex/lib/domain/*`; Convex modules stay thin adapters (authz → validate → txn writes).
- Index-first reads only; never unbounded `.collect()` for list/grouping paths — use page windows / explicit `.take` caps.
- Detections remain immutable evidence after insert; intake idempotency records store typed response fingerprints.

## Testing Strategy

| Layer    | What                                      | Approach                               |
| -------- | ----------------------------------------- | -------------------------------------- |
| Unit     | domain + DTO mappers                      | Jest RED-first (BACKEND-TEST-CASES)    |
| Convex   | isolation, idempotency, triage versioning | convex-test; assert DTO vs JSON schema |
| E2E/HTTP | —                                         | Out of scope                           |

## Threat Matrix

N/A — no routing/shell/subprocess/VCS/executable-classification/process-integration boundary.

## Migration / Rollout

Additive schema + modules. Rollback: disable Sentra / revert schema+code; preserve chat. No data migration.

## Open Questions

- [ ] Exact Clerk issuer/applicationID (deploy secrets)
- [ ] Triage notes/assignment required? (contract optional → keep optional)
