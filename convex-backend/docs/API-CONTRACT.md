# Sentra API Contract — Frontend Validation Spec

**Audience:** Angular / frontend  
**Status:** Target-state contract (MVP). Source of truth for request/response shapes the UI must validate.  
**Related:** [API-SITEMAP.md](API-SITEMAP.md) · [DOMAIN-DESIGN.md](DOMAIN-DESIGN.md) · [USE-CASES.md](USE-CASES.md) · [BACKEND-TEST-CASES.md](BACKEND-TEST-CASES.md)

This document is the **contract layer above HTTP/Convex**. Frontend should validate every response envelope and form payload against these schemas before rendering or submitting. Server remains authoritative; client validation is for UX and early failure, not security.

---

## 1. Surfaces the frontend uses

| Surface | Base | Auth | Frontend use |
|---|---|---|---|
| Public HTTP | `/v1` | Clerk JWT **or** service key (integrations only) | CRUD, mutations, fallback polling |
| Convex realtime | Convex queries | Clerk → Convex identity | Incident queue, camera status, detail subscriptions |
| Evidence access | `POST /v1/evidence/{id}/access` | Clerk + `evidence:read` | Short-lived snapshot URLs only |
| Internal ingestion | `/internal/v1/detections` | Internal credential | **Never call from browser** |
| MCP / webhooks outbound | — | — | **Out of frontend scope** |

Base URL (env): `SENTRA_API_BASE` e.g. `https://api.example.com`  
API version prefix: `/v1`  
Content-Type: `application/json; charset=utf-8`

---

## 2. Cross-cutting conventions

### 2.1 Headers

| Header | When | Notes |
|---|---|---|
| `Authorization: Bearer <clerk-jwt>` | All human browser calls | Preferred for Angular |
| `Authorization: Bearer <service-key>` | Integrations only | Never store privileged keys in localStorage long-term for admin keys beyond product policy |
| `Idempotency-Key: <opaque-string>` | Every mutating command (`POST`/`PATCH`/`DELETE` that changes state) | UUID v4 recommended; reuse only for exact same payload |
| `Content-Type: application/json` | Bodies | Required |
| `X-Request-Id` (optional client) | Any | If sent, echo may appear in error `requestId`; otherwise server generates |

### 2.2 IDs, time, pagination

| Field | Type | Validation |
|---|---|---|
| Resource IDs | `string` opaque (`ws_…`, `cam_…`, `inc_…`, …) | Non-empty; **do not parse** meaning from prefix |
| Timestamps | RFC 3339 UTC string | e.g. `2026-08-29T12:00:00Z` |
| Cursor | `string \| null` opaque | Never compose client-side offsets |
| `limit` / `numItems` | integer | `1..100` (default 25 unless noted) |
| `expectedVersion` | integer ≥ 0 | Optimistic concurrency on updates |

**Page response shape (all list endpoints):**

```ts
type Page<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};
```

### 2.3 Error envelope (validate on every non-2xx)

```ts
type ApiError = {
  code: ErrorCode;
  message: string;          // human-safe; never secrets
  requestId: string;
  details?: FieldError[];   // present mainly for VALIDATION_ERROR
};

type FieldError = {
  path: string;             // JSON path e.g. "severity" | "filters.state"
  message: string;
  code?: string;            // optional field-level code
};

type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "EVIDENCE_UNAVAILABLE"
  | "INTERNAL_ERROR";
```

| HTTP | Typical `code` | UI handling |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Re-auth / redirect Clerk |
| 403 | `FORBIDDEN` | Hide action; toast “no permission” |
| 404 | `NOT_FOUND` | Treat foreign IDs same as missing (no leak) |
| 400 / 422 | `VALIDATION_ERROR` | Map `details[]` to form fields |
| 409 | `CONFLICT` / `IDEMPOTENCY_CONFLICT` | Refresh resource; show conflict |
| 429 | `RATE_LIMITED` | Backoff + retry |
| 503 / — | `EVIDENCE_UNAVAILABLE` | Show unavailable evidence state |
| 500 | `INTERNAL_ERROR` | Generic error + show `requestId` |

Success responses **must not** include the error envelope. Validate success schemas separately.

### 2.4 Idempotency

- Send `Idempotency-Key` on: camera create/patch/heartbeat, incident triage/ack/resolve/dismiss/severity patch, API key create/revoke, webhook create/update/delete, evidence access.
- Same key + same payload → same result (safe retry).
- Same key + different payload → `IDEMPOTENCY_CONFLICT` (409).

---

## 3. Enums (closed sets — reject unknown values)

```ts
type WorkspaceRole = "workspace_admin" | "operator" | "viewer";
// Note: "tenant_admin" is platform-only; never treat as workspace role in UI.

type CameraAdminStatus = "active" | "paused" | "disabled";
type CameraConnectivity = "online" | "offline" | "degraded" | "unknown";

type IncidentState =
  | "detected"
  | "triaged"
  | "acknowledged"
  | "resolved"
  | "dismissed";

type OperationalSeverity = "low" | "medium" | "high" | "critical";

type EvidenceKind = "snapshot" | "external_reference";

type DetectionDisposition = "created" | "grouped" | "duplicate"; // internal only

type ApiKeyStatus = "active" | "revoked" | "expired";

type WebhookDeliveryState =
  | "pending"
  | "delivered"
  | "retrying"
  | "failed"
  | "disabled";

type Scope =
  | "workspace:read"
  | "cameras:read"
  | "cameras:write"
  | "cameras:heartbeat"
  | "incidents:read"
  | "incidents:write"
  | "detections:read"
  | "evidence:read"
  | "stats:read"
  | "webhooks:read"
  | "webhooks:write";
```

**Category:** workspace-configurable string, bounded taxonomy. Frontend should treat as `string` with length `1..64`, prefer allowlist from workspace settings when available. Examples: `intrusion`, `smoke`, `fall`.

---

## 4. Role → action matrix (UI guards)

| Action | viewer | operator | workspace_admin |
|---|---|---|---|
| List/get workspaces, cameras, incidents, stats | ✅ | ✅ | ✅ |
| Evidence temporary access | ✅* | ✅* | ✅* |
| Register / patch camera | ❌ | ❌ | ✅ |
| Triage / ack / resolve / dismiss | ❌ | ✅ | ✅ |
| Change operational severity | ❌ | ✅ | ✅ |
| Manage members / API keys / webhooks | ❌ | ❌ | ✅ |

\* Requires `evidence:read` when using a service key; role-based for humans.

**Always re-check server errors** — UI hiding is not authorization.

### Incident transitions (enable buttons only for these)

| From | Allowed commands |
|---|---|
| `detected` | `triage`, `dismiss` |
| `triaged` | `acknowledge`, `dismiss` |
| `acknowledged` | `resolve`, `dismiss` |
| `resolved` | — (terminal) |
| `dismissed` | — (terminal) |

---

## 5. Resource DTOs (response schemas)

### 5.1 Workspace

```ts
type WorkspaceSummary = {
  id: string;
  name: string;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
};

type WorkspaceDetail = WorkspaceSummary & {
  settings: {
    groupingWindowSeconds: number; // 30..60 MVP
    retentionDays: number;
    timezone: string;              // IANA e.g. "America/Bogota"
  };
};
```

### 5.2 Membership

```ts
type Membership = {
  id: string;
  workspaceId: string;
  subjectId: string;       // Clerk subject
  role: WorkspaceRole;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};
```

### 5.3 Camera

```ts
type Camera = {
  id: string;
  workspaceId: string;
  externalId: string;
  label: string;
  location: string | null;
  adminStatus: CameraAdminStatus;
  connectivity: CameraConnectivity;
  lastHeartbeatAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};
```

### 5.4 Incident

```ts
type IncidentSummary = {
  id: string;
  workspaceId: string;
  cameraId: string;
  category: string;
  state: IncidentState;
  severity: OperationalSeverity;
  openedAt: string;
  lastObservedAt: string;
  assignedToSubjectId: string | null;
  version: number;
};

type IncidentDetail = IncidentSummary & {
  initialSeverity: OperationalSeverity;
  severityOverride: null | {
    from: OperationalSeverity;
    to: OperationalSeverity;
    reason: string;
    actorSubjectId: string;
    at: string;
  };
  detectionIds: string[];
  evidenceIds: string[];
  timeline: IncidentTimelineEntry[];
};

type IncidentTimelineEntry = {
  id: string;
  at: string;
  type:
    | "state_changed"
    | "severity_changed"
    | "detection_linked"
    | "assignment_changed"
    | "note";
  actorKind: "user" | "system" | "key" | "ingestion";
  actorId: string | null;
  from?: string | null;
  to?: string | null;
  message?: string | null;
};
```

### 5.5 Detection (read)

```ts
type Detection = {
  id: string;
  workspaceId: string;
  cameraId: string;
  incidentId: string | null;
  occurredAt: string;
  receivedAt: string;
  category: string;
  suggestedCategory: string;
  confidence: number;          // 0..1 inclusive
  modelVersion: string;
  detectorVersion: string;
  evidenceIds: string[];
};
```

### 5.6 Evidence

```ts
type EvidenceDescriptor = {
  id: string;
  workspaceId: string;
  incidentId: string | null;
  detectionId: string | null;
  kind: EvidenceKind;
  contentType: string;         // e.g. "image/jpeg"
  capturedAt: string;
  retentionExpiresAt: string | null;
  status: "available" | "expired" | "unavailable" | "failed";
  // NEVER: storage credentials, permanent privileged URLs
};

type EvidenceAccessGrant = {
  evidenceId: string;
  url: string;                 // short-lived HTTPS URL
  expiresAt: string;
  purpose: string;
};
```

### 5.7 Stats

```ts
type StatsQuery = {
  from: string;                // RFC 3339
  to: string;
  cameraId?: string;
  category?: string;
};

type StatsResponse = {
  workspaceId: string;
  from: string;
  to: string;
  timezone: string;
  counts: {
    incidentsByState: Record<IncidentState, number>;
    incidentsBySeverity: Record<OperationalSeverity, number>;
    detectionsTotal: number;
    camerasOnline: number;
    camerasTotal: number;
  };
};
```

### 5.8 API key (metadata only after create)

```ts
type ApiKeyMetadata = {
  id: string;
  workspaceId: string;
  name: string;
  scopes: Scope[];
  status: ApiKeyStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type ApiKeyCreated = ApiKeyMetadata & {
  secret: string;              // ONE-TIME — show once, never persist in app state long-term
};
```

### 5.9 Webhook subscription

```ts
type WebhookSubscription = {
  id: string;
  workspaceId: string;
  endpointUrl: string;
  eventTypes: string[];        // e.g. "incident.state_changed.v1"
  status: "active" | "disabled";
  version: number;
  createdAt: string;
  updatedAt: string;
  // secret never returned after create/rotate one-shot
};

type WebhookDelivery = {
  id: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  state: WebhookDeliveryState;
  attempts: number;
  lastResponseStatus: number | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

---

## 6. Endpoint contract (request → response)

### Auth legend

- **Clerk** = human JWT  
- **Key(scope)** = service key with listed scope  
- **Admin** = `workspace_admin`  
- **Op** = `operator` or `workspace_admin`

---

### 6.1 Workspaces

#### `GET /v1/workspaces`

| | |
|---|---|
| Auth | Clerk |
| Query | `cursor?`, `limit?` |
| Response `200` | `Page<WorkspaceSummary>` |

#### `GET /v1/workspaces/{workspaceId}`

| | |
|---|---|
| Auth | Clerk **or** Key(`workspace:read`) |
| Response `200` | `WorkspaceDetail` |
| Errors | `404`/`403` as documented non-disclosing policy |

#### `GET /v1/workspaces/{workspaceId}/members`

| | |
|---|---|
| Auth | Admin |
| Response `200` | `Page<Membership>` |

---

### 6.2 Cameras

#### `GET /v1/cameras`

```ts
type ListCamerasQuery = {
  workspaceId: string;         // required context
  adminStatus?: CameraAdminStatus;
  connectivity?: CameraConnectivity;
  cursor?: string;
  limit?: number;
};
// 200 → Page<Camera>
```

#### `POST /v1/cameras` — Idempotency-Key required

```ts
type CreateCameraRequest = {
  workspaceId: string;
  externalId: string;          // unique per workspace; 1..128
  label: string;               // 1..128
  location?: string | null;    // max 256
  adminStatus?: CameraAdminStatus; // default "active"
  metadata?: Record<string, unknown>;
};
// 201 → Camera  (connectivity always "unknown" until heartbeat)
// 409 → CONFLICT (duplicate externalId)
```

#### `GET /v1/cameras/{cameraId}` → `Camera`

#### `PATCH /v1/cameras/{cameraId}` — Idempotency-Key recommended

```ts
type PatchCameraRequest = {
  label?: string;
  location?: string | null;
  adminStatus?: CameraAdminStatus;
  metadata?: Record<string, unknown>;
  expectedVersion: number;
};
// 200 → Camera
// 409 → CONFLICT (stale version)
```

#### `POST /v1/cameras/{cameraId}/heartbeat` — Idempotency-Key / sourceEventId

```ts
type HeartbeatRequest = {
  sourceEventId: string;
  timestamp: string;           // source time RFC 3339
  signal?: "ok" | "degraded" | "error";
};
// 200 → { cameraId, connectivity, lastHeartbeatAt, duplicate: boolean }
```

---

### 6.3 Incidents

#### `GET /v1/incidents`

```ts
type ListIncidentsQuery = {
  workspaceId: string;
  state?: IncidentState | IncidentState[];
  severity?: OperationalSeverity | OperationalSeverity[];
  cameraId?: string;
  category?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};
// 200 → Page<IncidentSummary>
```

#### `GET /v1/incidents/{incidentId}` → `IncidentDetail`

#### `PATCH /v1/incidents/{incidentId}` — severity / metadata

```ts
type PatchIncidentRequest = {
  severity?: OperationalSeverity;
  reason?: string;             // required when severity changes; 1..500
  expectedVersion: number;
};
// 200 → IncidentDetail
// 409 → invalid state / stale version
```

#### `POST /v1/incidents/{incidentId}/triage`

```ts
type TriageRequest = {
  category?: string;
  notes?: string;              // max 2000
  assignedToSubjectId?: string | null;
  expectedVersion: number;
};
// 200 → IncidentDetail  (state → triaged)
```

#### `POST /v1/incidents/{incidentId}/acknowledge`

```ts
type TransitionRequest = {
  reason?: string;             // 1..500 when product requires
  expectedVersion: number;
};
// 200 → IncidentDetail
```

#### `POST /v1/incidents/{incidentId}/resolve` — body: `TransitionRequest`  
Requires current state `acknowledged`.

#### `POST /v1/incidents/{incidentId}/dismiss` — body: `TransitionRequest`  
Allowed from `detected` | `triaged` | `acknowledged`. `reason` **required**.

#### `GET /v1/incidents/{incidentId}/detections` → `Page<Detection>`

#### `GET /v1/incidents/{incidentId}/evidence` → `Page<EvidenceDescriptor>`

---

### 6.4 Evidence access

#### `POST /v1/evidence/{evidenceId}/access`

```ts
type EvidenceAccessRequest = {
  purpose: string;             // 1..128, e.g. "incident-detail"
  ttlSeconds?: number;         // server-capped; typical 60..300
};
// 200 → EvidenceAccessGrant
// EVIDENCE_UNAVAILABLE if expired/failed/foreign
```

Frontend rules:

- Do not cache grant URLs beyond `expiresAt`.
- Never display or log storage keys.
- On grant expiry, call access again.

---

### 6.5 Stats

#### `GET /v1/stats` — query: `StatsQuery` + `workspaceId` → `StatsResponse`

---

### 6.6 API keys (admin)

#### `POST /v1/workspaces/{workspaceId}/api-keys`

```ts
type CreateApiKeyRequest = {
  name: string;                // 1..64
  scopes: Scope[];             // non-empty, finite set only
  expiresAt?: string | null;
};
// 201 → ApiKeyCreated  (secret once)
```

#### `GET /v1/workspaces/{workspaceId}/api-keys` → `Page<ApiKeyMetadata>` (no secrets)

#### `POST /v1/workspaces/{workspaceId}/api-keys/{keyId}/revoke`

```ts
type RevokeApiKeyRequest = { reason?: string };
// 200 → ApiKeyMetadata (status revoked)
```

---

### 6.7 Webhooks (admin)

#### `POST /v1/webhooks`

```ts
type CreateWebhookRequest = {
  workspaceId: string;
  endpointUrl: string;         // https only; SSRF policy server-side
  eventTypes: string[];        // non-empty; must be known event types
};
// 201 → WebhookSubscription & { secret?: string } one-time if generated
```

#### `GET /v1/webhooks` → `Page<WebhookSubscription>`

#### `PATCH /v1/webhooks/{id}` — rotate/disable/update + `expectedVersion`

#### `DELETE /v1/webhooks/{id}` → `{ id, status: "disabled" }`

#### `GET /v1/webhooks/{id}/deliveries` → `Page<WebhookDelivery>`

**Known event types (subscribe allowlist):**

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

---

## 7. Convex realtime surface (Angular)

Subscribe with Clerk-authenticated `ConvexClient`. All queries are **workspace-scoped**; never pass a foreign `workspaceId` and expect data.

| Convex function (target names) | Args | Returns | Maps to |
|---|---|---|---|
| `workspaces.list` | — | `WorkspaceSummary[]` | `GET /v1/workspaces` |
| `cameras.list` | `{ workspaceId, filters? }` | `Camera[]` or page | `GET /v1/cameras` |
| `cameras.get` | `{ cameraId }` | `Camera \| null` | `GET /v1/cameras/{id}` |
| `incidents.list` | `{ workspaceId, filters?, paginationOpts? }` | page of `IncidentSummary` | `GET /v1/incidents` |
| `incidents.get` | `{ incidentId }` | `IncidentDetail \| null` | `GET /v1/incidents/{id}` |
| `evidence.list` | `{ incidentId }` | `EvidenceDescriptor[]` | evidence list |
| `stats.get` | `StatsQuery & { workspaceId }` | `StatsResponse` | `GET /v1/stats` |

**Mutations (same DTOs as HTTP):**  
`cameras.create`, `cameras.update`, `incidents.triage`, `incidents.acknowledge`, `incidents.resolve`, `incidents.dismiss`, `incidents.setSeverity`, …

**Realtime fallback (UC-15):**

1. Prefer Convex subscription on `incidents.list`.
2. On disconnect, poll `GET /v1/incidents?cursor=…` (or last `updatedAt` window).
3. Deduplicate by `incident.id` / timeline entry id before merging into UI state.

Validate Convex payloads with the **same DTOs** as HTTP.

---

## 8. Client-side validation rules (mirror server)

| Field | Rule |
|---|---|
| `confidence` | number, `0 ≤ x ≤ 1` (display only; not editable) |
| `severity` | enum `OperationalSeverity` |
| `state` | enum `IncidentState` |
| Timestamps | parseable RFC 3339; reject NaN dates |
| `externalId` / labels | trim; reject empty; max lengths above |
| `reason` on dismiss | required, trim, 1..500 |
| `reason` on severity change | required |
| `expectedVersion` | required on patch/transition; integer ≥ 0 |
| `scopes` | subset of `Scope`; no unknown strings |
| `endpointUrl` | `https:` only in UI; reject `http:` / localhost if product policy says so |
| Pagination `limit` | clamp to 1..100 |
| Evidence grant | if `Date.now() >= expiresAt` → refresh via access endpoint |

**Do not send from browser:**

- Internal ingestion payloads
- Storage credentials
- Raw webhook HMAC secrets after create (show once UI)
- `workspaceId` that overrides auth membership (server ignores/rejects)

---

## 9. Suggested frontend Zod skeleton

Use these as the root validators; expand fields as OpenAPI lands.

```ts
import { z } from "zod";

export const errorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "EVIDENCE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  requestId: z.string(),
  details: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
        code: z.string().optional(),
      }),
    )
    .optional(),
});

export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

export const incidentStateSchema = z.enum([
  "detected",
  "triaged",
  "acknowledged",
  "resolved",
  "dismissed",
]);

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);

export const incidentSummarySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  cameraId: z.string().min(1),
  category: z.string().min(1).max(64),
  state: incidentStateSchema,
  severity: severitySchema,
  openedAt: z.string().datetime(),
  lastObservedAt: z.string().datetime(),
  assignedToSubjectId: z.string().nullable(),
  version: z.number().int().nonnegative(),
});
```

Parse every HTTP/Convex success body with the matching schema; on parse failure, treat as `INTERNAL_ERROR` and surface `requestId` if present.

---

## 10. Explicit non-goals for frontend

- Live video, clips, face/biometrics UI
- Calling `/internal/v1/*`
- Direct Convex table reads bypassing authorized queries
- Assuming resource existence from ID shape alone
- Treating model `confidence` as operational severity

---

## 11. Contract versioning

| Field | Value |
|---|---|
| Contract version | `1.0.0-mvp` |
| HTTP API | `/v1` additive-compatible |
| Breaking change policy | New path version (`/v2`) or negotiated Convex function rename |

When OpenAPI is generated, it must match this document; if they diverge, **this contract + OpenAPI examples win for frontend validation** until reconciled.
