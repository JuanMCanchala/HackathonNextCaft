# Camera Registration Specification

## Purpose
Admin camera create; Clerk-authorized `cameras.list`/`cameras.get`; Camera DTO parity (`1.0.0-mvp`). Heartbeat out of scope.

## Requirements

### Requirement: Register a workspace camera
Only workspace_admin (or `cameras:write`) MAY create in server-derived workspace. MUST validate `externalId`/`label` (1..128), optional `location` (null|≤256), optional `adminStatus` (default `active`). `externalId` MUST be unique per workspace. New cameras MUST have `connectivity` `unknown` and `lastHeartbeatAt` null. Admin status ≠ connectivity. Create SHOULD honor idempotency (same key+payload → same result; mismatch → `IDEMPOTENCY_CONFLICT`).

#### Scenario: Valid registration
- GIVEN workspace_admin and unused external ID in A
- WHEN register runs
- THEN one A-owned Camera returned; connectivity `unknown`; audited

#### Scenario: Duplicate or foreign
- GIVEN duplicate external ID in A, or asserted workspace B
- WHEN register runs
- THEN `CONFLICT` or reject; no second camera

### Requirement: Camera DTO parity
Public `cameras.list`/`get`/create MUST return `Camera` (`id`, `workspaceId`, `externalId`, `label`, `location`, `adminStatus`, `connectivity`, `lastHeartbeatAt`, `version`, `createdAt`, `updatedAt`). Enums closed: admin `active`|`paused`|`disabled`; connectivity `online`|`offline`|`degraded`|`unknown`. Lists MUST use `Page<Camera>`.

#### Scenario: List/get schema
- GIVEN authorized cameras in A
- WHEN `cameras.list` or `cameras.get` runs
- THEN each item validates as `Camera`; foreign IDs non-disclosing

### Requirement: Isolated bounded reads
Viewer/operator/workspace_admin MAY list/get with validated pagination and workspace filters. Results MUST be caller-workspace only; no privileged credentials.

#### Scenario: Cross-workspace list
- GIVEN cameras in A and B; reader only for A
- WHEN list runs
- THEN only A items; valid `Page` meta

#### Scenario: Invalid pagination
- GIVEN bad pagination/filters
- WHEN list runs
- THEN `VALIDATION_ERROR` + `requestId`; no write

## Assumptions
Frontend P0: Clerk → `cameras.list`/`get`. Heartbeat/connectivity derivation out of scope.
