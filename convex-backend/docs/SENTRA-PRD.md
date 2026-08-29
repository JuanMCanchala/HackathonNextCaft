# Sentra Backend Product Requirements

**Status:** Hackathon MVP target-state specification  
**Audience:** Backend, model, frontend, integration, and QA teams

## Executive decision

Sentra is an industry-agnostic platform for AI camera incident detection and real-time operational reporting. The MVP uses one Convex deployment with a shared, tenant-isolated schema; Clerk authenticates human users; external systems use scoped, hashed, rotatable service API keys; and model output enters through a normalized, idempotent internal boundary.

The MVP proves a secure loop: register a camera, receive a detection, group it into an incident, calculate severity, notify operators, and allow an authorized human or MCP client to triage and resolve it. It stores metadata and snapshots/references, not continuous video.

## Problem statement

Organizations receive camera/model observations faster than people can interpret them. Raw detections are noisy technical facts, while operators need a trustworthy operational queue with ownership, severity, evidence, history, and timely updates. Integrations also need a stable contract without direct database access.

## Solution

Sentra normalizes model detections, preserves the raw observation, groups similar observations by camera/category/time window, and exposes incidents through authenticated public APIs, Convex realtime subscriptions for Angular, signed webhooks, and a constrained MCP adapter. Human workflow remains authoritative: AI confidence informs rules but never equals human confirmation.

## MVP goals and success criteria

| Goal        | Acceptance criterion                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Detect      | A valid model event creates exactly one durable detection and contributes to an incident.                                                |
| Group       | Similar camera/category observations inside a configurable 30–60 second window group into one incident; raw detections remain queryable. |
| Operate     | Authorized users can triage, acknowledge, resolve, or dismiss; every transition is audited.                                              |
| Explain     | Incident detail shows operational severity, model confidence, source/model versions, timestamps, and evidence references.                |
| Isolate     | No authenticated user, API key, webhook, or MCP call can read or mutate another workspace.                                               |
| Update      | Angular receives reactive updates through ConvexClient; public integrations can consume signed, retried, idempotent webhooks.            |
| Secure      | Privileged keys are never sent to the browser; evidence access is temporary and authorized.                                              |
| Demonstrate | The happy path works end-to-end in a seeded hackathon workspace with observable request/event IDs.                                       |

## Actors and roles

- **Platform tenant_admin:** Internal Sentra operator managing tenant/workspace provisioning and platform support. Not a workspace role.
- **workspace_admin:** Manages workspace members, cameras, rules, API keys, webhooks, and operational data.
- **operator:** Reviews incidents and may perform triage, acknowledge, resolve, or dismiss according to scope.
- **viewer:** Read-only operational access, including allowed evidence viewing.
- **Model pipeline:** Calls the separate internal ingestion boundary.
- **External integration:** Uses a scoped service API key and consumes API/webhook contracts.
- **MCP client:** Uses the Sentra API/use-case adapter for operational queries and limited actions.

## Core product decisions

1. Use “workspace” in product language and `tenant`/`workspaceId` internally as explicit ownership on every tenant-owned record.
2. Keep detection, incident, alert, and evidence distinct.
3. Separate model confidence from operational severity. Workspace rules calculate initial severity; an operator can adjust severity without changing model confidence.
4. Use lifecycle `detected -> triaged -> acknowledged -> resolved` or `dismissed`. AI does not imply confirmation.
5. Accept model details only through a normalized adapter: `sourceEventId`, `cameraId`, `workspaceId`, `timestamp`, suggested category, confidence, evidence reference, and model/detector version.
6. Store metadata and snapshots/references only. No continuous video, clips, facial recognition, or biometrics in MVP.
7. Public HTTP paths are versioned under `/v1`; internal ingestion is `/internal/v1/detections`.
8. MCP is an adapter, never direct database access, and does not promise live video.

## Functional requirements

### Workspace and access

- Provision workspaces and memberships; enforce role and workspace authorization at every public function/API boundary.
- Store API keys as one-time-visible plaintext on creation and only a hash thereafter. Keys have scopes, status, creation/last-used/revoked timestamps, and optional expiry.
- Audit authentication-sensitive and operational actions.

### Cameras and connectivity

- Register camera identity, external reference, location/label, administrative status (`active`, `paused`, `disabled`), and last heartbeat.
- Derive connectivity (`online`, `offline`, `degraded`, `unknown`) from heartbeat recency and policy; do not confuse it with administrative status.
- Receive idempotent heartbeats and expose status in API, realtime queries, and MCP.

### Detection and incident processing

- Validate timestamps, ownership, confidence range, category, camera existence, evidence reference, and version metadata.
- Idempotently accept a `sourceEventId` within its workspace/source namespace.
- Preserve normalized detection and raw/provider references.
- Group by camera, normalized category, and configured time window. Link all contributing detections/evidence to the incident.
- Apply workspace rules to calculate initial operational severity and retain the rule/version used.

### Operations and reporting

- List/filter/paginate incidents by state, severity, camera, category, time range, and cursor.
- Show incident timeline, grouped detections, evidence, assignments, and audit history.
- Publish incident lifecycle/severity/evidence changes to realtime subscribers and eligible webhooks.
- Provide aggregate stats with an explicitly documented time zone and window.

### Evidence

- Accept a snapshot or external evidence reference with content type, capture time, checksum/size where available, and retention metadata.
- Issue short-lived, authorized access to evidence; never make storage credentials or permanent privileged URLs public.
- Apply configurable retention and delete/expire references without deleting the audit fact that evidence existed.

## Non-functional requirements

- **Isolation:** Every query and mutation scopes by workspace/tenant before returning or changing data.
- **Idempotency:** Ingestion, state-changing public commands, and webhook deliveries support stable idempotency/event IDs.
- **Auditability:** Actor, role/key identity, workspace, action, target, before/after state, request ID, and time are retained for security-relevant changes.
- **Observability:** Correlate request, detection, incident, webhook, and audit IDs; track webhook delivery states and ingestion rejects.
- **Evolution:** Keep domain/use-case logic independent from provider/model specifics; add schema indexes and API versions deliberately.
- **Performance:** Hackathon targets are interactive list/detail reads and near-real-time updates, not high-volume video processing.

## API and integration summary

| Surface                            | Responsibility                                                               | Authentication                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Public `/v1`                       | Workspaces, cameras, incidents, evidence, stats, API keys, webhooks          | Clerk session/JWT or scoped service API key                       |
| Internal `/internal/v1/detections` | Normalized model ingestion                                                   | Internal service credential/network policy; never browser-exposed |
| Convex realtime                    | Angular reactive operational reads                                           | Clerk-authenticated Convex client and workspace authorization     |
| Webhooks                           | Outbound integration events                                                  | HMAC signature, event ID, retries                                 |
| MCP                                | Tool-shaped adapter for status, incidents, stats, snapshots, limited actions | Sentra API credentials; same use-case authorization               |

See [DOMAIN-DESIGN.md](DOMAIN-DESIGN.md), [USE-CASES.md](USE-CASES.md), [API-SITEMAP.md](API-SITEMAP.md), and the frontend validation contract [API-CONTRACT.md](API-CONTRACT.md) for contracts and boundaries.

## Acceptance checklist

- [ ] Tenant/workspace isolation is tested for every resource and role.
- [ ] Duplicate internal events do not duplicate detections, incidents, evidence links, or notifications.
- [ ] A detection never automatically marks an incident acknowledged.
- [ ] Severity changes preserve original model confidence and are audited.
- [ ] Lifecycle transitions reject invalid transitions and unauthorized actors.
- [ ] Webhooks are signed, idempotent, retried, and delivery state is visible.
- [ ] Evidence access expires and is workspace-authorized.
- [ ] OpenAPI documentation includes auth/scopes, examples, errors, and idempotency behavior.
- [ ] Angular realtime path and polling/cursor fallback are documented.

## Explicitly out of scope

- Continuous video ingestion, live video relay, clips, or video search.
- Face recognition, biometric inference, identity matching, or demographic profiling.
- Automatic human confirmation, automatic resolution, or autonomous safety-critical action.
- Cross-workspace analytics or unscoped global search for workspace users.
- Billing, enterprise SSO administration, complex escalation policies, and broad workflow automation.
- Direct database access by MCP or integrations.
- Training, hosting, or detailed implementation ownership of the model pipeline.

## Risks and mitigations

| Risk                             | Mitigation for MVP                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| False positives or model drift   | Preserve confidence/version/evidence; rules and human state remain separate; audit overrides.  |
| Duplicate/out-of-order events    | Source identity plus idempotency records; deterministic grouping and late-event policy.        |
| Cross-tenant leakage             | Central authorization helpers, tenant-first indexes, negative tests, no client-supplied trust. |
| Evidence URL leakage             | Short-lived authorized access, no privileged keys in browser, retention policy.                |
| Webhook replay/failure           | HMAC with timestamp tolerance, event IDs, retry/backoff, delivery ledger.                      |
| Convex hot paths or index growth | Cursor pagination, bounded queries, explicit indexes, retention, load test after demo.         |
| Ambiguous model contract         | Versioned normalized adapter owned by backend; model-specific payload stays behind it.         |

## Future-safe evolution

Keep public resource representations versioned; add fields compatibly before changing semantics. Introduce an outbox/event ledger if delivery volume or reliability exceeds the MVP path. Split deployments or storage only after measured isolation, throughput, or retention needs justify it.
