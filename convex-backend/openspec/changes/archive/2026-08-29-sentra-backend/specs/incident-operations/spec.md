# Incident Operations Specification

## Purpose
Deterministic group/severity; Clerk `incidents.list`/`get`/triage; Incident DTO parity (`1.0.0-mvp`). **Only transition:** `detected -> triaged`.

## Freeze note
API-CONTRACT allows dismiss from `acknowledged` (and ack/resolve/dismiss). Frozen for a later slice — OUT OF SCOPE here. This slice SHALL NOT implement acknowledge, resolve, or dismiss.

## Requirements

### Requirement: Create and group deterministically
First accepted detection MUST create one incident in `detected`. Later detections MAY group only on matching workspace, camera, category, and open-incident/time policy. Grouping MUST record policy version; MUST NOT reopen terminal incidents.

#### Scenario: Grouping match
- GIVEN two detections same workspace/camera/category within policy window
- WHEN second processed
- THEN links to existing eligible incident; no second incident

#### Scenario: Non-match or late
- GIVEN different keys or outside window
- WHEN processed
- THEN no group; late-event policy create/attach/reject recorded

### Requirement: Calculate and preserve severity
MUST set initial severity from explicit rule (`low`|`medium`|`high`|`critical`) with rule version. Severity ≠ model confidence. Severity override OUT OF SCOPE.

#### Scenario: Rule-derived severity
- GIVEN valid detection + accepted policy
- WHEN incident created
- THEN initial severity + rule version persisted; confidence unchanged

#### Scenario: Missing policy
- GIVEN no severity rule/default
- WHEN create would need severity
- THEN fail safely; no partial incident

### Requirement: Incident DTO parity
`incidents.list` MUST return `Page<IncidentSummary>`; `get`/triage MUST return `IncidentDetail` (`1.0.0-mvp` required fields + Detail `initialSeverity`, `severityOverride`, `detectionIds`, `evidenceIds`, `timeline`). State enum shape includes full lifecycle; this slice only produces `detected`/`triaged` via transitions.

#### Scenario: List/get schema
- GIVEN authorized incidents in A
- WHEN `incidents.list` or `get` runs
- THEN Summary/Detail validate; foreign IDs non-disclosing

### Requirement: Bounded isolated reads
Viewer/operator/workspace_admin MUST see only own-workspace data. List: validated pagination + documented filters. Detail MUST NOT expose secrets.

#### Scenario: Isolated queue/detail
- GIVEN reader for A
- WHEN list/get
- THEN only A; foreign ID non-disclosing

### Requirement: Triage only (`detected -> triaged`)
Only operator/workspace_admin (or `incidents:write`) MAY triage. MUST validate optional notes/assignment, idempotency key, expected version. State/timeline/audit/events MUST commit atomically. Replay returns original; stale/invalid → `CONFLICT`. Acknowledge/resolve/dismiss MUST NOT be available in this slice.

#### Scenario: Successful triage
- GIVEN authorized actor, `detected` incident, current version
- WHEN triage submitted
- THEN state `triaged`; `IncidentDetail` + audit/timeline/event IDs

#### Scenario: Unauthorized, wrong state, or stale
- GIVEN viewer, foreign, non-`detected`, or stale version
- WHEN triage submitted
- THEN safe error; no partial write

#### Scenario: Out-of-scope lifecycle
- GIVEN authorized operator
- WHEN ack/resolve/dismiss invoked on this slice
- THEN unavailable/rejected; state unchanged

## Assumptions
Frontend P0: Clerk → list/get/triage. Grouping window 30–60s via workspace settings when accepted.
