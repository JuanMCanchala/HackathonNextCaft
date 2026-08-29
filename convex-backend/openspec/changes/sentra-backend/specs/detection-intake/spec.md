# Detection Intake Specification

## Purpose
Idempotent internal normalized observation intake. MUST NOT be browser-callable.

## Requirements

### Requirement: Authenticate and validate normalized intake
Intake MUST authenticate the internal/model service and bind workspace/camera. Required: `sourceEventId`, `sourceNamespace`, `cameraId`, asserted `workspaceId`, RFC3339 time, normalized/suggested category, confidence, model/detector versions, bounded evidence refs. Confidence MUST accept 0 and 1; reject outside `[0,1]` or non-numbers. Malformed time, unsupported category/version, oversized fields, ownership mismatch MUST reject before writes.

#### Scenario: Valid observation
- GIVEN authenticated internal caller bound to A + camera C in A
- WHEN valid observation submitted
- THEN one immutable detection; return detection/incident IDs, disposition, requestId, event IDs

#### Scenario: Ownership mismatch
- GIVEN camera from another workspace
- WHEN intake runs
- THEN reject before any business write; confidence 0/1 still accepted when ownership ok

### Requirement: Idempotent atomic intake
Identity `(workspace, sourceNamespace, sourceEventId)` MUST be unique. Replay MUST return original disposition without duplicate detection/incident/evidence/audit/events. Same identity + different payload MUST return `IDEMPOTENCY_CONFLICT`. Source/model fields and timestamps MUST be preserved; confidence MUST NOT be rewritten. Commit MUST be one transaction.

#### Scenario: Replay
- GIVEN accepted source identity
- WHEN same identity resubmitted
- THEN original IDs/disposition; no duplicate side effects

#### Scenario: Concurrent acceptance
- GIVEN concurrent same source identity
- WHEN both process
- THEN exactly one durable detection and disposition

### Requirement: Safe evidence references
MAY record bounded snapshot/external refs; MUST NOT store privileged credentials or claim available evidence when unknown. Video/clips/biometrics out of contract.

#### Scenario: Unavailable evidence
- GIVEN unverifiable reference
- WHEN detection accepted
- THEN failed/unavailable or omitted; never as accessible success

### Requirement: Non-browser internal surface
Intake MUST use authenticated internal adapter → private/internal mutation. Clerk browser clients MUST NOT invoke intake as a public Convex mutation.

#### Scenario: Browser caller blocked
- GIVEN Clerk browser identity
- WHEN intake public surface attempted
- THEN unavailable/rejected; no detection written

## Assumptions
Category/grouping/severity policies versioned before apply. Disposition: `created`|`grouped`|`duplicate`.
