# Sentra Backend Use Cases

This document maps user/system workflows to the proposed API and function boundaries. Names are behavioral boundaries for future implementation, not existing functions.

## Boundary conventions

- **Public API:** versioned HTTP `/v1`; Clerk or scoped service key.
- **Internal intake:** authenticated model-service `POST /internal/v1/detections`.
- **Convex functions:** authorized reactive queries/mutations for Angular and server-side use cases.
- **Webhook worker:** consumes recorded events and owns delivery attempts; never changes incident truth directly.
- **MCP adapter:** translates tools to public use cases; no direct DB access.

## UC-01 Register a camera

**Actor:** workspace_admin  
**Boundary:** `POST /v1/cameras`; Convex `cameras.create`

1. Authenticate user and resolve workspace_admin membership.
2. Validate unique external camera ID within workspace and administrative status.
3. Create camera with connectivity `unknown` and no heartbeat.
4. Audit creation and return camera resource.

**Alternate/error paths:** foreign workspace claim is rejected; duplicate external ID returns conflict; disabled/paused are valid administrative states but do not mean offline.

## UC-02 Receive a heartbeat

**Actor:** camera gateway/integration  
**Boundary:** `POST /v1/cameras/{cameraId}/heartbeat`; `cameras.heartbeat`

1. Authenticate scoped key and bind request to its workspace.
2. Validate camera ownership, timestamp skew policy, and heartbeat payload.
3. Idempotently record the heartbeat and recompute connectivity from policy.
4. Emit status change only when derived connectivity changes.

**Errors:** revoked key, foreign camera, malformed timestamp, or disabled camera according to policy. Repeating the same event ID returns the original outcome.

## UC-03 Ingest a model detection

**Actor:** model pipeline  
**Boundary:** `POST /internal/v1/detections`; `detections.ingest`

1. Authenticate internal caller and validate normalized payload.
2. Confirm camera belongs to asserted workspace.
3. Check source namespace + `sourceEventId` idempotency.
4. Persist the immutable detection and evidence reference.
5. Find/group similar open detections by camera/category/time window.
6. Create or update an incident, calculate initial severity from workspace rules, and emit domain events.

**Alternate/error paths:** duplicate returns original detection/incident IDs; unknown camera/workspace mismatch is rejected; invalid confidence/category/version is rejected; unavailable evidence is recorded only as a failed reference, not a successful attachment.

## UC-04 View the incident queue

**Actor:** viewer, operator, workspace_admin, authorized integration  
**Boundary:** `GET /v1/incidents`; Convex `incidents.list`

1. Authenticate and authorize `incidents:read` (service) or role.
2. Apply workspace-first filters and cursor pagination.
3. Return summary fields: state, severity, camera, category, timestamps, and IDs.

**Alternate/error paths:** invalid cursor/filter returns validation error; foreign IDs do not reveal existence. Empty queues return an empty page with cursor metadata.

## UC-05 Inspect an incident and evidence

**Actor:** viewer+  
**Boundary:** `GET /v1/incidents/{id}`; `GET /v1/incidents/{id}/evidence`; Convex `incidents.get`, `evidence.list`

Return timeline, grouped detections, model confidence/version, severity rationale/override, audit-visible operational changes, and authorized evidence descriptors. Evidence bytes/access URLs are delivered only through a short-lived grant endpoint.

**Errors:** workspace mismatch is denied; expired/deleted evidence returns explicit unavailable status without storage secrets.

## UC-06 Triage an incident

**Actor:** operator/workspace_admin  
**Boundary:** `POST /v1/incidents/{id}/triage`; Convex `incidents.triage`

Validate category/notes/assignment, transition `detected -> triaged`, preserve model fields, audit actor and before/after state, and emit `incident.updated`/state event.

**Errors:** terminal or wrong-state transition returns conflict; insufficient role/scope returns forbidden; repeated idempotency key returns the original result.

## UC-07 Acknowledge, resolve, or dismiss

**Actor:** operator/workspace_admin  
**Boundary:** `POST /v1/incidents/{id}/acknowledge`, `/resolve`, `/dismiss`; Convex `incidents.transition`

Validate the command and optional reason, enforce the transition table, atomically write state/timeline/audit, and publish an event. Resolve requires acknowledged state; dismiss is allowed from detected or triaged (and per contract, acknowledged if policy permits).

**Errors:** invalid transition, missing reason where required, stale expected version, foreign incident, or duplicate request. No command changes model confidence.

## UC-08 Adjust operational severity

**Actor:** operator/workspace_admin  
**Boundary:** `PATCH /v1/incidents/{id}` with severity command; Convex `incidents.setSeverity`

Record original rule-derived severity and new operational value, actor, reason, and time. Model confidence and source evidence remain unchanged.

**Errors:** invalid severity, unauthorized actor, terminal incident policy, or stale version. An override is never silently replaced by later duplicate detection.

## UC-09 Create/revoke a service API key

**Actor:** workspace_admin  
**Boundary:** `POST /v1/api-keys`, `POST /v1/api-keys/{id}/revoke`; Convex `apiKeys.create/revoke`

Validate finite scopes and optional expiry, generate plaintext once, store hash, audit creation, and return metadata plus one-time secret. Revoke immediately invalidates subsequent calls.

**Errors:** duplicate name policy, unsupported scope, expired/revoked key, and attempts to access another workspace. Browser clients must not receive privileged internal keys.

## UC-10 Configure a webhook

**Actor:** workspace_admin  
**Boundary:** `POST /v1/webhooks`, `PATCH`, `DELETE`; Convex `webhooks.create/update/delete`

Store endpoint, subscribed event types, active state, secret reference/hash policy, and delivery settings. Emit eligible domain events to a delivery ledger.

Secret material is shown once or rotated safely; endpoint validation and SSRF protections apply. Delete/disable stops new delivery attempts but preserves delivery audit history.

## UC-11 Deliver and retry a webhook

**Actor:** Sentra delivery worker  
**Boundary:** internal worker; outbound signed webhook

1. Claim a pending delivery.
2. Sign exact versioned payload with timestamp/event ID.
3. POST with timeout and idempotent event ID.
4. Mark delivered on accepted response; otherwise schedule exponential backoff until bounded retry policy.
5. Mark failed/disabled after terminal policy and expose delivery state.

Consumer duplicates are expected; event IDs are stable. Never retry by reapplying the incident mutation.

## UC-12 Query camera status via MCP

**Actor:** MCP client  
**Boundary:** `sentra_list_cameras`, `sentra_get_camera_status`

Adapter authenticates, invokes the same authorized camera query use case, and returns administrative status, connectivity, and heartbeat age. It does not return live video.

## UC-13 Query/act on incidents via MCP

**Actor:** MCP client  
**Boundary:** `sentra_list_incidents`, `sentra_get_incident`, `sentra_get_stats`, `sentra_acknowledge_incident`, `sentra_resolve_incident`, `sentra_dismiss_incident`

Tools map to public read/state-change use cases and require scopes. Actions use idempotency keys and return audit/event IDs. MCP clients cannot bypass role, tenant, transition, or reason requirements.

## UC-14 Request latest snapshot via MCP

**Actor:** MCP client with multimodal support  
**Boundary:** `sentra_get_latest_snapshot`

Resolve authorized incident/camera evidence, issue a short-lived access grant, and return a snapshot descriptor or client-compatible content. If unsupported, return metadata and URL policy rather than promising live video.

## UC-15 Realtime queue update with fallback

**Actor:** Angular dashboard/system  
**Boundary:** Angular `ConvexClient` service subscribing to authorized `incidents.list`; fallback `GET /v1/incidents?cursor=...`

The client receives reactive changes for its workspace. On disconnect, it resumes with an incremental cursor and deduplicates by resource/event ID. The backend must not rely on browser polling for correctness.

## Cross-cutting error contract

Public errors have a stable code, human-safe message, request ID, and optional field details. Recommended codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`, `EVIDENCE_UNAVAILABLE`, `INTERNAL_ERROR`. Avoid leaking whether a foreign resource exists.

## Cross-use-case invariants

- Every tenant-owned read/write is workspace-scoped.
- Every mutation is audited where it affects access, state, severity, evidence, or delivery.
- Idempotent retries return a stable result and do not duplicate side effects.
- Detection ingestion cannot acknowledge, resolve, or dismiss an incident.
- Public adapters and MCP share use-case authorization; neither owns business rules independently.
