# Sentra Domain Design

**Status:** Target-state domain model; it describes proposed behavior, not implemented schema. The current scaffold has only `threadMetadata`, and auth/ownership checks are not wired yet.

## Design rules

- Workspace is the customer-facing term; tenant is the internal authorization boundary.
- Every tenant-owned entity carries `workspaceId` (or an equivalent tenant identity) and is queried through a tenant-aware index.
- Technical observations, operational work, notification delivery, and evidence are different concepts.
- Domain state changes occur through authorized use cases, not arbitrary field updates.
- Model confidence is immutable source information; operational severity is a rule/operator decision.

## Bounded contexts

| Context               | Owns                                                                   | Does not own                |
| --------------------- | ---------------------------------------------------------------------- | --------------------------- |
| Workspace & Access    | workspaces, memberships, roles, API keys, audit identity               | model interpretation        |
| Camera Registry       | camera metadata, administrative status, heartbeat-derived connectivity | video capture/control       |
| Detection Intake      | normalized detections, source idempotency, adapter validation          | incident workflow decisions |
| Incident Operations   | grouping, incident lifecycle, severity, assignments, timeline          | raw model internals         |
| Evidence              | snapshot/reference metadata, access grants, retention                  | continuous media            |
| Notification Delivery | alerts, webhook subscriptions, attempts, delivery state                | incident truth              |
| Integration           | public HTTP and MCP adapters                                           | direct persistence          |

## Ubiquitous language

| Term                  | Precise meaning                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Workspace             | A customer-owned operational boundary. All workspace data is isolated from other workspaces.                     |
| Tenant                | Internal synonym/identifier for workspace ownership and authorization. Not a user role.                          |
| Detection             | A technical observation received from a detector for a camera at a point in time.                                |
| Incident              | An operational entity grouping similar detections that requires review or records a condition.                   |
| Alert                 | A notification attempt or notification fact emitted because of an incident/event. It is not the incident itself. |
| Evidence              | A snapshot or external reference supporting a detection/incident.                                                |
| Category              | Normalized classification such as intrusion, smoke, or fall; taxonomy is workspace-configurable but bounded.     |
| Model confidence      | Detector-provided numeric confidence, preserved as source data.                                                  |
| Operational severity  | Workspace-rule/operator value describing business urgency; independent of confidence.                            |
| Administrative status | Camera intent: `active`, `paused`, or `disabled`.                                                                |
| Connectivity          | Observed camera reachability: `online`, `offline`, `degraded`, or `unknown`.                                     |
| Source event ID       | Provider/model identity used to deduplicate an observation within a source/workspace namespace.                  |
| Evidence reference    | Storage key or external reference, never a browser-held privileged credential.                                   |
| Triage                | Human/system classification and enrichment before acknowledgement; it is not confirmation.                       |
| Acknowledge           | An authorized actor accepts responsibility for reviewing an incident.                                            |
| Resolve               | An authorized actor declares the operational issue addressed.                                                    |
| Dismiss               | An authorized actor declares the incident not actionable/invalid.                                                |
| Alert delivery        | One outbound attempt lifecycle for an alert event, with signature and retry state.                               |

## Entities and value objects

### Workspace & access

- **Workspace:** `id`, name, status, settings, retention policy, grouping policy, created/updated timestamps.
- **Membership:** workspace, Clerk subject, role, status, timestamps. A subject has at most one active role per workspace.
- **API key:** key ID, workspace, name, hash, scopes, status, expiry, last-used, revoked-at. Plaintext is returned only once at creation.
- **Audit entry:** workspace, actor kind/ID, role or key ID, action, target, before/after summary, request ID, timestamp.

### Camera

- **Camera:** workspace, external ID, label, location, administrative status, connectivity, `lastHeartbeatAt`, metadata, timestamps.
- **Heartbeat:** camera, received time, source time, status signal, request/source ID. It is append-only or retained according to observability policy.

### Detection

A Detection includes `workspaceId`, `sourceEventId`, source namespace, `cameraId`, occurred/received timestamps, normalized category, suggested category, model confidence, model/detector version, evidence references, and raw-provider metadata. It is immutable after intake except for system linkage fields.

### Incident

An Incident includes workspace, camera, normalized category, state, operational severity, initial severity/rule version, optional operator override, opened/last-observed timestamps, grouping key/window, assignment, and linked detection/evidence IDs. It owns the operational lifecycle and timeline.

### Evidence

Evidence includes workspace, detection/incident links, kind (`snapshot` or `external_reference`), content type, capture time, storage/reference key, checksum/size if supplied, retention/expiry, and access metadata. Binary content is external to the domain record.

### Alert and delivery

An Alert is the notification fact associated with an incident/domain event. A Delivery records subscription, event ID/version, signed payload digest, state (`pending`, `delivered`, `retrying`, `failed`, `disabled`), attempts, next attempt, response metadata, and timestamps.

### Value objects

- IDs: opaque stable strings; never infer workspace from a client-visible ID.
- Confidence: bounded number, e.g. `0 <= confidence <= 1`.
- Severity: bounded enum agreed by the workspace contract, e.g. `low`, `medium`, `high`, `critical`.
- Time window: positive duration, MVP default between 30 and 60 seconds.
- Cursor: opaque pagination token, not a client-composed offset.
- Scope: finite permission such as `cameras:read`, `incidents:write`, `evidence:read`.
- HMAC signature: versioned signature over timestamp, event ID, and exact payload bytes.

## Aggregates and invariants

| Aggregate        | Root responsibility       | Key invariants                                                                                      |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace        | Own settings and policies | Settings cannot grant access across workspace; retention/grouping values are bounded.               |
| Membership       | Role assignment           | Active membership belongs to one workspace; only permitted admins change roles.                     |
| Camera           | Registration/status       | Camera belongs to one workspace; disabled camera cannot accept ordinary operational processing.     |
| Detection intake | Accept observation        | Valid source identity and camera/workspace match; same idempotency key returns same result.         |
| Incident         | Operational workflow      | State transition is valid and authorized; closed state is not silently reopened by duplicate input. |
| Evidence         | Access/retention          | Evidence link is workspace-scoped and access is time-limited/authorized.                            |
| API key          | Credential lifecycle      | Store hash only; revoked/expired keys cannot authorize requests.                                    |
| Delivery         | Delivery lifecycle        | Event ID is unique per subscription/version; retries are bounded and auditable.                     |

### Incident transition table

| From         | Allowed to              | Actor                                             |
| ------------ | ----------------------- | ------------------------------------------------- |
| detected     | triaged, dismissed      | operator, workspace_admin, authorized integration |
| triaged      | acknowledged, dismissed | operator, workspace_admin, authorized integration |
| acknowledged | resolved, dismissed     | operator, workspace_admin, authorized integration |
| resolved     | —                       | immutable terminal state in MVP                   |
| dismissed    | —                       | immutable terminal state in MVP                   |

A duplicate detection may update `lastObservedAt` or link to an open incident, but must not bypass human state semantics. Reopening is a future explicit use case, not an incidental side effect.

## Domain events

Events are versioned, workspace-scoped, and carry event ID, occurred time, actor/source, target IDs, and schema version.

- `detection.received.v1`
- `incident.created.v1`
- `incident.updated.v1`
- `incident.state_changed.v1`
- `incident.severity_changed.v1`
- `camera.status_changed.v1`
- `evidence.attached.v1`
- `api_key.revoked.v1`
- `webhook.delivery_succeeded.v1`
- `webhook.delivery_failed.v1`

Events are notification facts, not permission bypasses. The delivery layer may retry an event without reapplying the domain mutation.

## Authorization boundaries

1. Authenticate with Clerk for humans; resolve active membership and role for the target workspace.
2. For service keys, verify hash/status/expiry and required scope, then bind the request to the key’s workspace.
3. For internal ingestion, authenticate the model service separately and validate that the asserted workspace/camera relationship is allowed; never trust browser claims.
4. Filter by workspace before fetching by resource ID. A missing or foreign resource returns a non-disclosing not-found/forbidden policy consistently.
5. Enforce action permissions in the use case, not just UI visibility.
6. Audit role, key, ingestion, evidence access, and all lifecycle/severity mutations.

## Convex-oriented persistence guidance

This is guidance for future implementation, not a claim about existing tables.

- Use separate tables for major aggregates and immutable/append-oriented records: workspaces, memberships, cameras, heartbeats, detections, incidents, evidence, incident links/timeline, API keys, webhook subscriptions, deliveries, audit entries, and idempotency records.
- Add indexes beginning with `workspaceId`, then the access pattern (for example workspace+state, workspace+camera+category+time, workspace+sourceEventId).
- Keep bounded list queries cursor-paginated; do not scan all workspaces or all detections to group an event.
- Treat Convex mutations as transaction boundaries for intake and state transitions. Keep external storage and webhook calls out of the critical mutation; record an event/delivery to process asynchronously.
- Use server-only functions for privileged evidence signing and internal ingestion. Angular subscribes through authorized Convex queries.
- Preserve raw provider fields in a bounded, redacted object or external reference; never persist secrets.
- Add retention jobs for evidence and observability records, with audit-safe deletion semantics.

## Consistency and failure policy

- Ingestion is idempotent by source namespace + workspace + sourceEventId.
- Grouping is deterministic for the same ordered inputs and records the policy/window used.
- Out-of-order detections may attach to an open incident when within policy; late events outside policy remain linked to a new incident or explicitly rejected according to documented policy.
- Webhook delivery is at-least-once; consumers must deduplicate by event ID.
- External evidence storage failure must not create an inaccessible evidence record as if upload succeeded; record a rejected/failed outcome with correlation ID.
