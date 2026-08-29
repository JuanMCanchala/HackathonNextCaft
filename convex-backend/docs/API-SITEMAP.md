# Sentra API Documentation Sitemap

This is the information architecture for backend API documentation. It is not an Angular screen sitemap. OpenAPI is the source of truth for public HTTP contracts; examples, scopes, error envelopes, and idempotency behavior are required on each mutating operation.

**Frontend validation contract:** [API-CONTRACT.md](API-CONTRACT.md) + machine-readable [api-contract.schemas.json](api-contract.schemas.json).

## Documentation navigation

1. **Overview** — product boundary, MVP limits, request IDs, versioning, environments.
2. **Authentication** — Clerk human sessions/JWTs; service API keys; internal credentials; key lifecycle.
3. **Authorization** — roles, scopes, workspace isolation, resource/action matrix.
4. **Conventions** — JSON, timestamps, opaque IDs, cursors, errors, idempotency, optimistic versioning.
5. **Resources** — workspaces, cameras, detections (read-limited), incidents, evidence, stats, API keys, webhooks.
6. **Realtime** — Angular ConvexClient queries/subscriptions and polling/cursor fallback.
7. **Internal API** — model ingestion contract and trust boundary.
8. **Webhooks** — event catalog, payloads, HMAC, retries, delivery inspection.
9. **MCP** — tool catalog and mapping to use cases.
10. **Operations** — retention, rate limits, observability, security reporting.

## Authentication and authorization

| Caller                 | Credential                            | Typical permissions                  |
| ---------------------- | ------------------------------------- | ------------------------------------ |
| Human Angular user     | Clerk session/JWT                     | Role-based workspace access          |
| External integration   | `Authorization: Bearer <service-key>` | Explicit scopes, one workspace       |
| Internal model service | Internal credential/policy            | Detection ingestion only             |
| MCP adapter/client     | Sentra credential                     | Same scopes/roles as mapped use case |

Roles: `tenant_admin` is internal platform administration; `workspace_admin`, `operator`, and `viewer` are workspace roles. Internal platform administration is not implicitly exposed to workspace API resources.

## Public HTTP `/v1`

### Workspace and access

| Method/path                                                 | Purpose                        | Auth/scope                    | Inputs/outputs                                   | Errors/idempotency                      |
| ----------------------------------------------------------- | ------------------------------ | ----------------------------- | ------------------------------------------------ | --------------------------------------- |
| `GET /v1/workspaces`                                        | List accessible workspaces     | Clerk                         | filters/cursor -> summaries                      | auth, validation                        |
| `GET /v1/workspaces/{workspaceId}`                          | Get workspace settings summary | Clerk or key `workspace:read` | ID -> workspace                                  | not found/forbidden                     |
| `GET /v1/workspaces/{workspaceId}/members`                  | List memberships               | admin                         | cursor -> memberships                            | forbidden, validation                   |
| `POST /v1/workspaces/{workspaceId}/api-keys`                | Create scoped key              | admin                         | name/scopes/expiry -> metadata + one-time secret | conflict, validation; `Idempotency-Key` |
| `GET /v1/workspaces/{workspaceId}/api-keys`                 | List key metadata              | admin                         | cursor -> keys without secrets                   | forbidden                               |
| `POST /v1/workspaces/{workspaceId}/api-keys/{keyId}/revoke` | Revoke key                     | admin                         | reason -> key status                             | conflict; idempotent command            |

### Cameras and status

| Method/path                             | Purpose                    | Auth/scope               | Key inputs/outputs                             | Errors/idempotency               |
| --------------------------------------- | -------------------------- | ------------------------ | ---------------------------------------------- | -------------------------------- |
| `GET /v1/cameras`                       | List cameras/status        | role or `cameras:read`   | filters/cursor -> cameras                      | validation, isolation            |
| `POST /v1/cameras`                      | Register camera            | admin or `cameras:write` | externalId/label/location/status -> camera     | conflict; `Idempotency-Key`      |
| `GET /v1/cameras/{cameraId}`            | Camera detail              | read                     | ID -> camera                                   | not found/forbidden              |
| `PATCH /v1/cameras/{cameraId}`          | Edit metadata/admin status | admin or `cameras:write` | changes/expectedVersion -> camera              | conflict, validation; idempotent |
| `POST /v1/cameras/{cameraId}/heartbeat` | Record heartbeat           | `cameras:heartbeat`      | sourceEventId/timestamp/signal -> connectivity | auth, skew; idempotent           |

### Incidents and operations

| Method/path                                   | Purpose                          | Auth/scope                          | Key inputs/outputs                                 | Errors/idempotency             |
| --------------------------------------------- | -------------------------------- | ----------------------------------- | -------------------------------------------------- | ------------------------------ |
| `GET /v1/incidents`                           | Queue/search                     | role or `incidents:read`            | state/severity/camera/category/time/cursor -> page | validation, isolation          |
| `GET /v1/incidents/{incidentId}`              | Detail/timeline                  | read                                | ID -> incident + detections/evidence summary       | not found/forbidden            |
| `PATCH /v1/incidents/{incidentId}`            | Allowed metadata/severity update | operator/admin or `incidents:write` | severity/reason/expectedVersion                    | conflict; idempotency          |
| `POST /v1/incidents/{incidentId}/triage`      | Move to triaged                  | operator/admin or `incidents:write` | category/notes/assignment                          | invalid transition; idempotent |
| `POST /v1/incidents/{incidentId}/acknowledge` | Acknowledge                      | operator/admin                      | reason/expectedVersion                             | conflict; idempotent           |
| `POST /v1/incidents/{incidentId}/resolve`     | Resolve                          | operator/admin                      | reason/expectedVersion                             | conflict; idempotent           |
| `POST /v1/incidents/{incidentId}/dismiss`     | Dismiss                          | operator/admin                      | reason/expectedVersion                             | conflict; idempotent           |
| `GET /v1/incidents/{incidentId}/detections`   | Raw contributing observations    | `detections:read` or role           | cursor -> detections                               | isolation, validation          |

### Evidence and reporting

| Method/path                               | Purpose                     | Auth/scope      | Key inputs/outputs                               | Errors/idempotency     |
| ----------------------------------------- | --------------------------- | --------------- | ------------------------------------------------ | ---------------------- |
| `GET /v1/incidents/{incidentId}/evidence` | List evidence descriptors   | `evidence:read` | cursor -> descriptors                            | unavailable, isolation |
| `POST /v1/evidence/{evidenceId}/access`   | Issue temporary access      | `evidence:read` | purpose/ttl -> short-lived grant                 | forbidden, expired     |
| `GET /v1/stats`                           | Aggregate operational stats | `stats:read`    | time range/camera/category -> counts/definitions | validation, rate limit |

### Webhook management

| Method/path                        | Purpose                     | Auth/scope                | Key inputs/outputs                            | Errors/idempotency          |
| ---------------------------------- | --------------------------- | ------------------------- | --------------------------------------------- | --------------------------- |
| `GET /v1/webhooks`                 | List subscriptions          | admin or `webhooks:read`  | cursor -> metadata, no secret                 | isolation                   |
| `POST /v1/webhooks`                | Create subscription         | admin or `webhooks:write` | endpoint/events/secret config -> subscription | SSRF/validation; idempotent |
| `PATCH /v1/webhooks/{id}`          | Rotate/disable/update       | admin or write            | fields/expectedVersion -> subscription        | conflict                    |
| `DELETE /v1/webhooks/{id}`         | Disable/delete subscription | admin or write            | ID -> status                                  | idempotent                  |
| `GET /v1/webhooks/{id}/deliveries` | Inspect delivery states     | admin or `webhooks:read`  | cursor -> attempts                            | isolation                   |

## Internal API

`POST /internal/v1/detections` is not part of the public browser API. It requires internal service authentication and accepts:

```json
{
  "sourceEventId": "provider-event-123",
  "sourceNamespace": "camera-model-a",
  "cameraId": "cam_123",
  "workspaceId": "ws_123",
  "timestamp": "2026-08-29T12:00:00Z",
  "suggestedCategory": "intrusion",
  "confidence": 0.94,
  "evidenceReference": { "kind": "snapshot", "reference": "opaque-ref" },
  "modelVersion": "model-7",
  "detectorVersion": "adapter-1"
}
```

Required behavior: validate ownership and ranges, deduplicate by source namespace/workspace/sourceEventId, preserve raw detection, group using workspace policy, and return detection ID, incident ID, disposition (`created`, `grouped`, `duplicate`), and request/event IDs. Never accept a browser-supplied privileged credential.

## Webhook contract

Outbound endpoint paths are selected by the workspace, but payloads are versioned event envelopes:

```json
{
  "id": "evt_123",
  "type": "incident.state_changed.v1",
  "occurredAt": "2026-08-29T12:00:01Z",
  "workspaceId": "ws_123",
  "data": { "incidentId": "inc_123", "from": "triaged", "to": "acknowledged" }
}
```

Headers include event ID, schema version, timestamp, and `X-Sentra-Signature: v1=<hmac>`. Consumers must deduplicate by event ID, reject stale timestamps according to tolerance, and return an accepted response quickly. Sentra tracks pending/delivered/retrying/failed/disabled states, bounded exponential backoff, attempts, and response metadata.

## MCP tool map

| Tool                          | Maps to                            | Access                             |
| ----------------------------- | ---------------------------------- | ---------------------------------- |
| `sentra_list_cameras`         | `GET /v1/cameras` / `cameras.list` | cameras read                       |
| `sentra_get_camera_status`    | camera detail/status               | cameras read                       |
| `sentra_list_incidents`       | incident queue                     | incidents read                     |
| `sentra_get_incident`         | incident detail                    | incidents read                     |
| `sentra_get_stats`            | stats                              | stats read                         |
| `sentra_get_latest_snapshot`  | evidence list + temporary access   | evidence read, multimodal optional |
| `sentra_acknowledge_incident` | acknowledge command                | incidents write + role/transition  |
| `sentra_resolve_incident`     | resolve command                    | incidents write + role/transition  |
| `sentra_dismiss_incident`     | dismiss command                    | incidents write + role/transition  |

MCP returns structured errors and request IDs, honors idempotency, and never promises live video or direct database access.

## Resource relationships

`workspace -> memberships, cameras, incidents, API keys, webhooks, audit entries`; `camera -> heartbeats, detections, incidents`; `detection -> evidence and incident`; `incident -> detections, evidence, alerts, timeline`; `webhook -> deliveries -> event`. All relationships are workspace-constrained.

## Standard conventions

- RFC 3339 UTC timestamps; opaque IDs; cursor pagination.
- `Idempotency-Key` for client commands; stable source/event IDs for ingestion/webhooks.
- Error envelope: `{code, message, requestId, details?}`.
- OpenAPI examples include success, validation, forbidden, conflict, and retry scenarios.
- Public API additions are backward-compatible within `/v1`; breaking semantic changes require a new version.
