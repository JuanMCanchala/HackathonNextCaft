# Sentra Backend Behavior-First Test Cases

**Purpose:** Acceptance-oriented test inventory for future implementation. Do not treat this document as evidence that these tests or domain tables exist. The repository uses strict TypeScript, Jest, Zod, and Convex; future tests should use Jest/ts-jest and follow RED-GREEN-REFACTOR. Write each behavioral test first, run it to observe the expected failure, implement minimally, then run the focused and full suites.

## Test levels and seams

| Level                | Seam                                                               | Focus                                           |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| Unit                 | Pure validators, grouping, severity, transition, signature helpers | deterministic domain behavior                   |
| Convex integration   | Queries/mutations with isolated test data                          | persistence, indexes, tenant auth, transactions |
| HTTP contract        | Handler boundary with real schemas                                 | status/error/auth/idempotency/OpenAPI shape     |
| Delivery integration | webhook worker + controllable HTTP receiver                        | signatures, retries, delivery ledger            |
| MCP contract         | adapter through use cases                                          | tool schemas, scopes, structured errors         |
| Security regression  | negative cross-tenant and secret/evidence cases                    | no leakage or privilege escalation              |

Tests assert externally visible behavior, not table names or helper calls. Use real domain logic; mock only unavoidable external systems (Clerk token verification, storage, outbound receiver, clock/randomness with explicit control).

## Validation and normalized intake

- Reject missing sourceEventId, cameraId, workspaceId, timestamp, category, confidence, or version fields.
- Accept confidence `0` and `1`; reject values below/above range and non-numbers.
- Reject malformed timestamps and configured excessive future/past skew.
- Normalize category deterministically while retaining suggested/raw category.
- Reject camera/workspace mismatch.
- Preserve modelVersion, detectorVersion, evidence reference, source namespace, received time, and correlation IDs.
- Internal ingestion is inaccessible with a Clerk browser credential or public service key lacking internal permission.
- Validation errors expose field-safe details and request ID, never secrets/raw credentials.

## Authentication, authorization, and tenant isolation

- Unauthenticated public request returns `UNAUTHENTICATED`.
- Viewer can read only authorized workspace resources.
- Viewer cannot register cameras, manage keys/webhooks, change incident state, or change severity.
- Operator can perform allowed incident actions but cannot manage workspace access/API keys unless separately granted.
- Workspace_admin can manage workspace resources only within its workspace.
- Platform tenant_admin can perform explicitly internal platform operations but is not silently treated as a workspace member.
- A workspace A user/key cannot read workspace B camera, incident, detection, evidence, stats, webhook, delivery, or audit data.
- Guessing a foreign resource ID returns the documented non-disclosing response and creates no cross-tenant side effect.
- Client-supplied workspaceId cannot override the authenticated membership/key workspace.
- Every mutation uses the target workspace authorization before mutation and records the actor.

## Idempotency and concurrency

- Replaying the same internal source namespace + sourceEventId returns the original detection/incident disposition without duplicate records or notifications.
- Reusing an idempotency key with a different payload returns `IDEMPOTENCY_CONFLICT`.
- Repeating an acknowledge/resolve/dismiss command returns the original result or documented conflict without duplicate timeline/audit side effects.
- Replaying the same heartbeat event does not advance timestamps incorrectly or duplicate status events.
- Replaying a webhook delivery does not reapply domain state.
- Concurrent state changes honor expected version/transaction semantics; one stale command returns conflict.
- Duplicate/out-of-order detections produce deterministic links and do not bypass human confirmation.

## Grouping and severity

- First valid detection creates one incident in `detected` state.
- Same workspace/camera/category inside the configured 30–60 second window groups into the existing open incident.
- Different camera, category, workspace, or outside window does not group.
- Grouping preserves every raw detection and linked evidence.
- Duplicate detection does not create another incident or alert.
- Grouping records the policy/window used and handles boundary timestamps consistently.
- A detection never creates `acknowledged`, `resolved`, or `dismissed` state automatically.
- Workspace rules calculate initial operational severity from category/context independently of model confidence.
- Model confidence is preserved exactly within accepted precision; changing severity does not change it.
- Operator severity override records original value, new value, actor, reason, and timestamp.
- Later grouped detections do not silently erase an operator override.
- Invalid severity or rule configuration fails safely with no partial incident mutation.

## Incident lifecycle and audit

- Valid transitions follow `detected -> triaged -> acknowledged -> resolved`.
- Dismissal is allowed only from documented states and terminal states cannot be mutated in MVP.
- Invalid transitions return conflict and leave state/timeline unchanged.
- Missing required reason/notes is rejected where contract requires it.
- Each successful state/severity change writes actor identity, role/key, request ID, before/after, and timestamp.
- Unauthorized actions write an appropriate security audit event only if policy requires, without exposing foreign target data.
- Realtime subscribers observe the committed new state, not an intermediate state.

## Camera and heartbeat behavior

- Registration requires unique external identity within a workspace.
- New camera starts administrative `active` (or explicit requested status) and connectivity `unknown` until heartbeat.
- `paused` and `disabled` administrative status are distinct from `offline` connectivity.
- Fresh heartbeat derives `online` according to policy; stale heartbeat derives `offline` or `degraded` as configured; absent data remains `unknown`.
- A heartbeat from a foreign camera/key is rejected.
- Disabled camera heartbeat policy is explicit and tested; it cannot generate ordinary incident processing accidentally.
- Status-change event emits only when derived connectivity changes.
- Heartbeat source timestamp and received timestamp are both retained or represented according to contract.

## Evidence and retention

- Valid snapshot metadata attaches to detection/incident with workspace ownership.
- Evidence reference cannot contain a privileged storage credential or unrestricted permanent URL.
- Viewer with `evidence:read` receives only a short-lived authorized access grant.
- Foreign, expired, deleted, or unavailable evidence cannot be accessed and does not leak storage identifiers.
- Storage/upload failure yields a failed/unavailable outcome, not a falsely successful evidence record.
- Retention expiry removes/invalidates evidence access while preserving an audit-safe historical reference.
- Continuous video, clips, face recognition, and biometric fields are rejected or not represented by MVP contracts.

## API keys and webhooks

- Key creation returns plaintext exactly once; subsequent list/get never returns it.
- Persisted credential material is a hash/non-reversible representation; logs and errors redact secrets.
- Scope checks work per endpoint; key cannot expand its workspace or access internal ingestion.
- Revoked and expired keys fail immediately; last-used metadata does not grant access.
- Webhook endpoint/event subscription validation rejects unsupported types and unsafe endpoints per policy.
- Secret rotation does not expose the previous secret and preserves delivery audit history.
- Outbound payload signature verifies over exact bytes plus timestamp/event ID; altered body/signature fails.
- Missing, stale, malformed, or replayed inbound consumer signature is rejected by the receiver contract example.
- Delivery success marks delivered once; timeout/5xx schedules exponential retry with bounded attempts.
- Terminal failure is visible with attempt count and response metadata; disabling subscription prevents new attempts.
- Same event ID is delivered consistently and consumer guidance requires deduplication.
- SSRF-sensitive webhook configuration is blocked according to allow/deny policy.

## HTTP, OpenAPI, and MCP contracts

- Every documented method/path has matching request/response schema and stable error envelope.
- `/v1` public routes and `/internal/v1/detections` remain visibly separated in generated docs.
- Examples show Clerk auth, scoped key auth, idempotency key, pagination, conflict, and forbidden responses.
- Invalid cursor/filter/field produces validation error; empty page is valid.
- Rate-limit and internal-error responses contain request ID without stack traces/secrets.
- MCP tool schemas reject unknown/malformed inputs and return structured errors.
- MCP read tools map to tenant-authorized use cases; action tools enforce role, scope, transition, reason, and idempotency.
- MCP latest snapshot returns metadata/temporary access only when authorized and never claims live video.
- MCP cannot invoke arbitrary database queries or undocumented mutations.
- Angular Convex query authorization returns only the subscribed workspace; cursor fallback produces equivalent resource semantics.

## Security and privacy regressions

- Clerk subject, API key, internal credential, webhook secret, and storage signing material never appear in response logs, audit payloads, or errors.
- Request body size/category/version limits prevent unbounded raw payload persistence.
- Evidence access tokens are scoped, short-lived, non-reusable beyond policy, and invalid after revocation/expiry.
- Timing/error behavior does not disclose foreign resource existence beyond documented policy.
- Audit entries themselves are workspace-scoped and protected from ordinary mutation/deletion.
- Retention jobs cannot delete another workspace’s evidence or audit records.
- Injection-like strings in labels/categories/notes are stored and returned safely without execution.
- Authorization is rechecked server-side even when frontend hides controls.

## TDD and Jest execution checklist

For each behavior: create a descriptive failing Jest test first; run the focused test and confirm it fails for the missing behavior; implement the smallest change; run the focused test; then run `pnpm test -- --runInBand`, `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` as appropriate. Keep test data explicitly workspace-scoped and add a regression test for every discovered isolation, idempotency, or state-machine defect.

## Exit criteria for MVP backend

- [ ] All sections above have executable coverage or an explicitly accepted documented exception.
- [ ] Positive and negative tenant-isolation cases pass for every resource.
- [ ] Ingestion/grouping/idempotency tests pass with out-of-order and retry cases.
- [ ] Lifecycle/severity/audit tests pass.
- [ ] Evidence/key/webhook security tests pass.
- [ ] HTTP and MCP contract tests match OpenAPI and tool documentation.
- [ ] Full Jest/typecheck/lint/format gates pass without warnings attributable to the feature.
