# Tasks: Sentra Backend Secure Vertical Slice

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 foundation → PR2 cameras → PR3 intake → PR4 incidents/DTO |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |
| Tracker / integration base | `backend` (from `main`) |
| Child PR bases | PR1→`backend`; PR2→`backend-01-foundation`; PR3→`backend-02-cameras`; PR4→`backend-03-intake` |
| Tracker PR | draft `backend` → `main` (no-merge until chain complete) |

Decision needed before apply: No (strategy locked)
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain (tracker=`backend`)
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Branch | PR base | Focused test | Rollback |
|------|------|--------|---------|--------------|----------|
| 0 | Scaffold/docs/openspec on tracker | `backend` | `main` (tracker draft) | N/A | whole tracker |
| 1 | Schema/authz/seed/workspaces | `backend-01-foundation` | `backend` | `pnpm test -- tests/workspaces` | schema,auth,seed,workspaces,authz |
| 2 | Cameras CRUD | `backend-02-cameras` | `backend-01-foundation` | `pnpm test -- tests/cameras` | cameras + tests |
| 3 | Domain + intake/group | `backend-03-intake` | `backend-02-cameras` | `pnpm test -- tests/detections tests/domain` | detections, domain |
| 4 | Incidents/DTO/chat | `backend-04-incidents` | `backend-03-intake` | `pnpm test -- tests/incidents tests/dto` | incidents,chat,dto |

```text
main
 └── backend                         ← tracker (draft PR → main)
      └── backend-01-foundation      ← PR1 base: backend
           └── backend-02-cameras    ← PR2 base: backend-01-foundation
                └── backend-03-intake
                     └── backend-04-incidents
```

## Phase 1: Foundation

- [x] 1.1 RED: Jest+convex-test helpers fail until schema/authz. (workspace-authorization)
- [x] 1.2 GREEN: `schema.ts` Sentra tables/indexes; keep `threadMetadata`. (all)
- [x] 1.3 RED→GREEN: `lib/errors.ts` ApiError+requestId. (validators)
- [x] 1.4 RED→GREEN: `auth.config.ts` + Clerk env in `convex.config.ts`. (Resolve context)
- [x] 1.5 RED→GREEN: `lib/authz.ts` identity/membership/role via `tokenIdentifier`. (Isolation)
- [x] 1.6 RED→GREEN: `seed.ts` internalMutation — workspace+admin (`retentionDays:30`,`timezone:UTC`).

## Phase 2: Workspaces

- [x] 2.1 RED: unauth/inactive UNAUTHENTICATED|FORBIDDEN; foreign NOT_FOUND. (Isolation)
- [x] 2.2 GREEN: `workspaces.ts` list/get + `paginationOptsValidator`. (DTO parity)
- [x] 2.3 RED→GREEN: Workspace DTO/Page vs `api-contract.schemas.json` 1.0.0-mvp.

## Phase 3: Cameras

- [ ] 3.1 RED: admin create; unique externalId; viewer forbidden; duplicate CONFLICT. (Register)
- [ ] 3.2 GREEN: `cameras.ts` create/list/get; connectivity `unknown`; audit. (DTO)
- [ ] 3.3 RED→GREEN: Camera/Page assert; cross-workspace isolation; bad pagination VALIDATION_ERROR.

## Phase 4: Domain helpers

- [ ] 4.1 RED→GREEN: `normalize.ts` allowlist/confidence/[0,1]/RFC3339→ms. (intake validate)
- [ ] 4.2 RED→GREEN: `group.ts` 45s; only detected|triaged; late→new. (Group)
- [ ] 4.3 RED→GREEN: `severity.ts` sev-v1; missing rule fail-closed. (Severity)
- [ ] 4.4 RED→GREEN: `transition.ts` only detected→triaged; reject ack/resolve/dismiss. (Freeze)

## Phase 5: Intake + grouping

- [ ] 5.1 RED: public/browser blocked; ownership mismatch no write. (Non-browser)
- [ ] 5.2 GREEN: `detections.ts` `acceptNormalized` internalMutation; one txn. (Auth+validate)
- [ ] 5.3 RED→GREEN: replay stable; mismatch IDEMPOTENCY_CONFLICT; concurrent one row. (Idempotent)
- [ ] 5.4 RED→GREEN: first create detected+severity; match groups; evidence never privileged. (Group; Evidence)

## Phase 6: Incidents

- [ ] 6.1 RED: isolated list/get; foreign NOT_FOUND; viewer no triage. (Reads)
- [ ] 6.2 GREEN: `incidents.ts` list/get + Summary/Detail mappers. (DTO)
- [ ] 6.3 RED→GREEN: triage operator/admin; version+idempotency; atomic audit/timeline; stale CONFLICT.
- [ ] 6.4 RED: ack/resolve/dismiss unavailable; state unchanged. (Freeze)

## Phase 7: DTO + chat

- [ ] 7.1 RED→GREEN: `lib/dto/*` epoch→RFC3339; golden public returns. (all DTO)
- [ ] 7.2 RED→GREEN: isolate `chat.ts` — not Sentra auth baseline.

## Phase 8: Verify

- [ ] 8.1 `pnpm test`, typecheck, lint:check, `convex dev --once`.
- [ ] 8.2 No public intake; no ack/resolve/dismiss.
