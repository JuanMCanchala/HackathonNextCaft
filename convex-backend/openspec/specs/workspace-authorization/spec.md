# Workspace Authorization Specification

## Purpose

Clerk identity, membership isolation, and Workspace DTO reads (`API-CONTRACT` `1.0.0-mvp`).

## Requirements

### Requirement: Resolve authorized workspace context

The system MUST derive identity from Clerk `tokenIdentifier` and MUST resolve an active membership before workspace operations. Client-supplied user/workspace claims MUST NOT grant access. `tenant_admin` MUST NOT imply workspace membership.

#### Scenario: Active member authorized

- GIVEN authenticated identity with active membership in workspace A
- WHEN a permitted Sentra operation for A runs
- THEN it proceeds with A as server-derived context

#### Scenario: Unauthenticated or inactive

- GIVEN no auth, or inactive/missing membership
- WHEN a workspace-owned operation runs
- THEN return `UNAUTHENTICATED` or `FORBIDDEN`; no business write

### Requirement: Enforce role and tenant isolation

Reads/mutations MUST authorize and scope by workspace before lookup. Viewer MAY read; operator MAY triage; workspace_admin MAY register cameras. Foreign resources MUST be non-disclosing with no foreign side effects.

#### Scenario: Foreign resource guessed

- GIVEN member of A and resource owned by B
- WHEN list/get/mutate runs
- THEN non-disclosing not-found; B unchanged

#### Scenario: Workspace override rejected

- GIVEN authorized caller for A
- WHEN it asserts workspace B
- THEN reject unless authenticated service binding permits

### Requirement: Workspace DTO parity

Public Convex workspace returns MUST match `WorkspaceSummary`/`WorkspaceDetail` (`1.0.0-mvp`): required fields, `active`|`suspended`, RFC3339 times, Detail `settings` (`groupingWindowSeconds` 30–60, `retentionDays`, `timezone`). Lists MUST use `Page` (`items`, `nextCursor`, `hasMore`).

#### Scenario: List/get shape

- GIVEN authorized member
- WHEN `workspaces.list` or get runs
- THEN payloads validate as Summary/Detail; list meta is `Page`

### Requirement: Public validators and errors

Public Convex functions MUST have argument validators; table-specific IDs; RFC3339 timestamps; bounded cursor pagination. Failures MUST use `ApiError` codes (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`, `EVIDENCE_UNAVAILABLE`, `INTERNAL_ERROR`) with safe message + `requestId`.

#### Scenario: Invalid arguments

- GIVEN malformed IDs/pagination/fields
- WHEN a public function is called
- THEN `VALIDATION_ERROR` before domain mutation

## Assumptions

Seeded Clerk membership only; frontend P0 is Clerk→Convex (no browser HTTP).
