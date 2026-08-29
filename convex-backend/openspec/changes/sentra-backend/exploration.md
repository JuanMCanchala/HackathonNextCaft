## Exploration: Sentra backend MVP

### Apply progress (living)

| Unit                      | Branch / PR                     | Status                                                                                    |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| 1 Foundation              | `backend-01-foundation` / PR #2 | Merged into `backend`                                                                     |
| 2 Cameras + agent harness | `backend-02-cameras` / PR #3    | Merged into `backend`                                                                     |
| 3 Domain + intake         | `backend-03-intake` / PR #4     | Open — includes Phase 5b hygiene (`const`/Result parsers, bounded `.take`, thin adapters) |
| 4 Incidents/DTO           | `backend-04-incidents`          | Pending                                                                                   |

Package path: product Convex code lives in `convex-backend/` (not the Python `backend/` model package).

### Current State

Sentra's five product documents describe a target-state, tenant-isolated incident platform: Clerk-authenticated human access, scoped service keys, an internal normalized detection boundary, deterministic detection-to-incident grouping, human-controlled lifecycle/severity, evidence references, auditability, realtime Convex reads, and signed asynchronous webhooks. The documents explicitly distinguish workspace (product term) from tenant (authorization identifier), and detection, incident, alert, and evidence.

**Shipped on tracker `backend` through Unit 2:** schema (workspaces/memberships/cameras/detections/incidents/audit/idempotency), Clerk `auth.config.ts`, `lib/authz` + `lib/errors`, seed, public `workspaces`/`cameras`, agent governance under `.agents/`/`.claude/`, Jest+convex-test harness.

**In Unit 3 (PR #4):** pure `lib/domain/{normalize,group,severity,transition}`, `detections.acceptNormalized` internalMutation only, Phase 5b immutable/bounded-read hygiene per `AGENTS.md` / `RULES.md` / `.agents/rules`.

Remaining: public `incidents` list/get/triage, DTO golden paths, chat isolation verification, Phase 8 gates.

The OpenSpec config establishes hybrid persistence, strict TDD, Jest/ts-jest as the current runner, and Convex validation through `pnpm exec convex dev --once`.

### Affected Areas

- `convex-backend/convex/schema.ts` — must grow from `threadMetadata` to explicit workspace-scoped Sentra records; avoid unbounded embedded arrays and add tenant-first indexes.
- `convex-backend/convex/convex.config.ts` — Agent Component remains mounted; Sentra components (if any) must be justified and mounted here.
- `convex-backend/convex/chat.ts` — currently public and unauthenticated; must either be secured/isolated or explicitly excluded from the product slice so it cannot be mistaken for production access control.
- `convex-backend/convex/validation.ts` — existing pure-helper seam; analogous normalized intake, category, confidence, timestamp, and command validators should remain pure where possible.
- `convex-backend/convex/http.ts` (not present) — required later for `/v1` and `/internal/v1/detections`; HTTP JSON must be narrowed from `unknown` and malformed bodies return 400.
- `convex-backend/convex/auth.config.ts` (not present) — required before Clerk-backed authorization can work; identity lookups must use `tokenIdentifier`, never a client-supplied user ID.
- `convex-backend/tests/validation.test.ts` and future `convex-backend/convex/**/*.test.ts` — current Jest seam is unit-only; Convex behavior requires deliberate `convex-test` + Vitest setup per Convex guidance rather than claiming integration coverage.
- `convex-backend/docs/SENTRA-PRD.md`, `DOMAIN-DESIGN.md`, `USE-CASES.md`, `API-SITEMAP.md`, `BACKEND-TEST-CASES.md` — mutually reinforcing target contract, but several policy values are still unresolved (see Missing Decisions).

### Product Intent and Bounded Scope

**Intent:** prove a secure operational loop in which a normalized model observation becomes one durable detection and one grouped incident, then an authorized human can inspect and triage it without AI being treated as confirmation. Isolation, idempotency, auditability, and stable request/event identifiers are first-class acceptance criteria.

**Recommended first-change in scope:**

- workspace and active membership context sufficient to authorize one seeded workspace;
- camera registration with workspace ownership and unique external identity;
- normalized internal detection intake with source namespace + source event idempotency;
- immutable detection persistence and deterministic first-detection incident creation/grouping;
- initial severity calculation via a minimal explicit workspace policy;
- authorized incident queue/detail reads;
- `detected -> triaged` as the first human state transition, with audit/timeline record;
- pure tests for validation, grouping, severity, transitions, and isolation plus Convex integration coverage once the test seam is installed.

**Explicitly out of scope for this change:** full membership administration, API-key generation/rotation, public HTTP/OpenAPI implementation, heartbeat/connectivity policy, evidence upload/signing/retention, webhook worker/retry delivery, stats, MCP, realtime fallback, automatic resolution/confirmation, continuous video, clips, biometrics, billing, and model-pipeline implementation. The model payload is accepted only at the normalized adapter contract.

### Domain Model, Invariants, and Seams

**Entities:** Workspace; Membership; Camera; Detection; Incident; EvidenceReference; AuditEntry; later Alert/Delivery, APIKey, WebhookSubscription, Heartbeat. Detection is immutable after intake except system linkage. Incident owns operational state and severity; evidence is metadata/reference, not privileged binary access.

**Core invariants:**

- Every tenant-owned record and every query path is workspace-scoped before resource lookup or return.
- An active membership has one workspace role; `tenant_admin` is platform-only and not implicitly a workspace member.
- Camera external identity is unique within a workspace; administrative status is separate from derived connectivity.
- Confidence is numeric and bounded `[0, 1]`; model confidence is preserved and never rewritten by severity overrides.
- Intake identity is `(workspaceId, sourceNamespace, sourceEventId)`; replay returns the original detection/incident disposition without duplicate records or notifications.
- A valid detection cannot acknowledge, resolve, or dismiss an incident. Grouping may update observation metadata but cannot erase human state or a severity override.
- Incident transitions follow the documented table: `detected -> triaged -> acknowledged -> resolved`, with dismissal from documented nonterminal states; resolved/dismissed are terminal in MVP.
- All state/severity/access-sensitive mutations write actor, workspace, request ID, before/after, and time to audit history.
- Public functions have validators; sensitive internal work uses internal functions or authenticated HTTP, not an unguarded public mutation.

**Deep module/seam recommendation:** expose a small feature-oriented intake interface (one normalized command in, one stable disposition out), hiding ownership validation, idempotency lookup, grouping, severity, incident linkage, and event recording inside the implementation. Keep pure domain modules for `normalizeDetection`, `groupingDecision`, `calculateInitialSeverity`, and `transitionIncident`; Convex mutations are the transactional adapter. Public HTTP and MCP should later adapt to the same use-case interface rather than duplicate business rules. Do not introduce provider/model adapters beyond the single normalized intake seam until a second provider actually varies.

### Use-Case Flows

1. **Register camera:** authenticated workspace admin resolves membership, validates external identity uniqueness, creates `active`/`unknown` camera, audits, returns resource.
2. **Ingest detection:** internal caller authentication precedes payload trust; validate fields and camera/workspace relationship; check idempotency; insert immutable detection; find only matching open incident candidates by tenant/camera/category/time policy; create or update incident atomically; calculate/persist initial severity and policy version; return IDs, disposition, request/event IDs.
3. **List/detail:** authenticated role or scoped credential resolves workspace, uses workspace-first indexes and bounded cursor pagination, and returns only summaries/detail owned by that workspace.
4. **Triage:** authorized operator/admin validates optional category/notes/assignment, checks expected state/version, atomically writes incident state plus timeline and audit, and emits a versioned event. Retry with same idempotency key is stable.
5. **Later command flows:** acknowledge/resolve/dismiss and severity override reuse one transition/command seam with expected-version conflict handling; they are not required to prove the first slice.

### Public Convex Function and API Contracts

For the first vertical slice, the preferred public Convex interface is:

- `api.cameras.create(args)` — human workspace-admin only; args: `externalId`, `label`, optional `location`, optional administrative `status`; returns a camera resource. Reject duplicate external identity and foreign/client-forced workspace claims.
- `api.cameras.list(args)` — authorized viewer/operator/admin; args: validated `paginationOpts` plus bounded filters; returns Convex pagination result. Every query uses workspace-first authorization/indexing.
- `api.incidents.list(args)` — authorized read role; args: `paginationOpts` plus optional state/severity/camera/category/time filters; returns bounded incident summaries and cursor metadata.
- `api.incidents.get(args)` — authorized read role; args: `incidentId`; returns detail with grouped detection/evidence descriptors and timeline, or consistent non-disclosing not-found/forbidden behavior.
- `api.incidents.triage(args)` — operator/admin or explicitly scoped integration; args: `incidentId`, optional category/notes/assignment, idempotency key, expected version; returns updated incident and audit/event IDs. Must enforce `detected -> triaged`.
- `api.detections.ingest(args)` should not be public to browsers. Prefer an authenticated `httpAction` at exact path `/internal/v1/detections` that validates/narrows JSON and calls an `internalMutation` with a normalized typed payload. If a Convex function is used as the internal seam, register it `internalMutation`, not `mutation`.

Normalized intake payload: `sourceEventId`, `sourceNamespace`, `cameraId`, asserted `workspaceId` (cross-checked against service identity), RFC3339 timestamp, suggested/normalized category, confidence, bounded evidence reference, model version, detector version, and request correlation data. Return `detectionId`, `incidentId`, disposition (`created|grouped|duplicate`), request ID, and event IDs. Public HTTP later maps this to `/v1` resource/error envelopes; it must not create a second business-rule implementation.

Convex constraints: use `v.id(table)` for IDs, `paginationOptsValidator` unchanged for pagination, explicit indexes containing all fields in name, no `.collect()` for unbounded reads, no wall-clock reads in queries, and no `ctx.db` in actions. Keep external evidence/webhook calls out of the intake transaction; record an event/delivery for later work.

### Test Cases for the First Slice

- Required intake fields, malformed timestamp, category/version limits, and confidence boundaries: accept `0` and `1`, reject outside/non-number.
- Camera/workspace mismatch and unauthenticated/internal-credential misuse are rejected without leakage.
- First valid detection creates exactly one immutable detection and one `detected` incident with rule-derived severity.
- Same workspace/camera/category within policy groups; different workspace/camera/category or outside window does not.
- Same source namespace + source event replay returns stable IDs and `duplicate`, with no second detection, incident, audit, or notification.
- Boundary timestamp and out-of-order policy are deterministic and recorded with the grouping window/policy version.
- Triage succeeds only for authorized actors in `detected`; invalid state, terminal state, stale expected version, and missing required fields fail without partial writes.
- Triage writes before/after state, actor role/key identity, workspace, request ID, and timestamp; it never changes confidence.
- Cross-workspace list/get/triage attempts return documented non-disclosing errors and produce no foreign side effect.
- Camera external identity is unique per workspace but may repeat in another workspace; new camera connectivity is `unknown`.
- All public Convex args have validators and list queries are bounded/paginated.

Current repository tests can verify pure helpers only. Add the documented Convex integration harness intentionally (`convex-test`, Vitest, edge-runtime, `import.meta.glob`) before treating persistence/auth tests as executable; do not retrofit those claims into the current Jest result.

### Missing Decisions and Contradictions

- **Authentication trust boundary:** PRD says Clerk plus internal credentials and service keys, but no `auth.config.ts` or identity helper exists. Decide provider issuer/application ID, internal credential mechanism, and how an HTTP action binds a service to workspace/camera.
- **Workspace provisioning:** documents require provisioning but do not define the first workspace/membership bootstrap or whether seeded hackathon data bypasses normal provisioning.
- **Grouping policy:** 30–60 seconds is a range, not a value. Define default, configurable bounds, open-incident eligibility, exact inclusive/exclusive boundary, and late-event behavior. Domain design says late events may attach or create/reject; use cases do not choose one.
- **Category taxonomy:** described as bounded and workspace-configurable, but no allowed values, normalization/case rules, or unknown-category behavior are defined.
- **Severity rules:** initial rule inputs, rule version format, default/failure behavior, and allowed enum are unspecified. Domain design says operator severity override exists, while first slice should defer it.
- **Lifecycle inconsistency:** domain transition table permits dismiss from `detected`, `triaged`, and `acknowledged` only by wording in UC-07 (“per contract, acknowledged if policy permits”), whereas table lists `detected/triaged` only. Resolve requires acknowledged. Choose one authoritative table.
- **Idempotency semantics:** API docs use `Idempotency-Key`, intake uses source identity, but retention/shape/storage and payload mismatch behavior are unspecified. Define whether triage keys are workspace+actor+command or workspace+target+key.
- **Evidence semantics:** intake says unavailable evidence may be a failed reference, while evidence invariants say no inaccessible successful record. Define failed-reference schema and whether evidence is created in the first transaction.
- **Authorization surface:** role/scope matrix is described but exact scope names for each Convex function, service-key workspace binding, and foreign-resource error policy are not fully enumerated.
- **Existing chat exposure:** `chat.ts` exports unauthenticated public functions despite README warning. Decide whether to secure/remove them before Sentra exposure; otherwise the scaffold violates the product's stated isolation/security posture.
- **Public Convex versus HTTP:** use cases name Convex functions while API sitemap names HTTP routes; decide which is the canonical browser/integration contract and ensure adapters share one use-case implementation.
- **Test stack mismatch:** product test document asks Convex integration behavior, but repo is Jest-only and Convex guidance requires Vitest/edge-runtime for `convex-test`. This is an explicit setup decision, not existing coverage.

### Approaches

1. **Foundational secure vertical slice (recommended)** — implement workspace context, camera create, normalized internal intake, deterministic incident creation/grouping, incident list/detail, and triage in one transaction-oriented slice; defer integrations.
   - Pros: proves the product's core secure loop; validates tenant indexes, idempotency, domain state, and realtime-compatible reads early; small external interface with deep implementation.
   - Cons: requires early auth/test-harness decisions; webhook/evidence/API-key promises remain unimplemented.
   - Effort: Medium/High.

2. **Infrastructure-first foundation** — implement auth, membership, API keys, HTTP error envelopes, and generic authorization before product entities.
   - Pros: reduces later security rework and establishes reusable access seams.
   - Cons: no demonstrable incident loop; API-key and Clerk choices are still unresolved; higher risk of shallow abstractions.
   - Effort: Medium.

3. **Demo-first incident flow** — seed workspace/camera and implement intake/grouping/triage with a narrow trusted caller, postponing production auth.
   - Pros: fastest visible happy path.
   - Cons: conflicts with isolation/security acceptance criteria and can fossilize unsafe public functions; poor fit for a backend change intended to be reusable.
   - Effort: Medium.

### Recommendation

Proceed to proposal/design with Approach 1, but make authentication bootstrap, grouping policy, category/severity policy, lifecycle dismissal rule, and Convex integration test setup explicit prerequisites. Keep the first implementation slice limited to camera registration, normalized idempotent intake, incident grouping/severity, authorized queue/detail reads, and triage. Use internal authenticated intake plus an internal mutation, tenant-first indexes, stable error/result contracts, and pure domain helpers behind a small feature-oriented Convex interface. Treat all HTTP, API-key, webhook, evidence-access, MCP, heartbeat, and stats surfaces as follow-on changes.

### Risks

- Shipping or testing Sentra functions while `chat.ts` remains unauthenticated could create a false security baseline and cross-tenant exposure.
- Ambiguous grouping, lifecycle, category, and severity policies can make deterministic replay and acceptance tests impossible.
- Convex public functions are Internet-exposed; a client-supplied workspace ID or resource ID must never establish authorization.
- Lack of `auth.config.ts` and a defined internal credential adapter blocks production-grade authorization until resolved.
- The existing Jest-only setup cannot substantiate Convex transaction/index/auth behavior without a deliberate integration-test addition.
- Idempotency and grouping implemented as separate non-transactional calls could race and duplicate incidents under concurrent intake.
- Evidence references and raw provider metadata risk secret or unbounded persistence unless bounded/redacted validators are specified.
- Large target scope (webhooks, evidence, MCP, API keys, stats) can exceed the 400-line review budget and should be split into later vertical slices.

### Ready for Proposal

Yes, conditionally. The product intent, first vertical slice, domain invariants, seams, contracts, tests, and risks are sufficiently clear for `sdd-propose`; the proposal must turn the listed missing decisions into explicit assumptions or decisions before implementation. No code was implemented.
