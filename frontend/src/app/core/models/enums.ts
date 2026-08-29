/**
 * Closed enums 1:1 with API-CONTRACT.md §3 and api-contract.schemas.json.
 * Union types are derived from these const arrays (single source for Zod).
 */

export const WORKSPACE_ROLES = ['workspace_admin', 'operator', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_STATUSES = ['active', 'suspended'] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'inactive'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const CAMERA_ADMIN_STATUSES = ['active', 'paused', 'disabled'] as const;
export type CameraAdminStatus = (typeof CAMERA_ADMIN_STATUSES)[number];

export const CAMERA_CONNECTIVITIES = ['online', 'offline', 'degraded', 'unknown'] as const;
export type CameraConnectivity = (typeof CAMERA_CONNECTIVITIES)[number];

export const INCIDENT_STATES = [
  'detected',
  'triaged',
  'acknowledged',
  'resolved',
  'dismissed',
] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

export const OPERATIONAL_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type OperationalSeverity = (typeof OPERATIONAL_SEVERITIES)[number];

export const EVIDENCE_KINDS = ['snapshot', 'external_reference'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_STATUSES = ['available', 'expired', 'unavailable', 'failed'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const API_KEY_STATUSES = ['active', 'revoked', 'expired'] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export const WEBHOOK_DELIVERY_STATES = [
  'pending',
  'delivered',
  'retrying',
  'failed',
  'disabled',
] as const;
export type WebhookDeliveryState = (typeof WEBHOOK_DELIVERY_STATES)[number];

export const WEBHOOK_STATUSES = ['active', 'disabled'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export const SCOPES = [
  'workspace:read',
  'cameras:read',
  'cameras:write',
  'cameras:heartbeat',
  'incidents:read',
  'incidents:write',
  'detections:read',
  'evidence:read',
  'stats:read',
  'webhooks:read',
  'webhooks:write',
] as const;
export type Scope = (typeof SCOPES)[number];

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'EVIDENCE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const TIMELINE_ENTRY_TYPES = [
  'state_changed',
  'severity_changed',
  'detection_linked',
  'assignment_changed',
  'note',
] as const;
export type TimelineEntryType = (typeof TIMELINE_ENTRY_TYPES)[number];

export const ACTOR_KINDS = ['user', 'system', 'key', 'ingestion'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const HEARTBEAT_SIGNALS = ['ok', 'degraded', 'error'] as const;
export type HeartbeatSignal = (typeof HEARTBEAT_SIGNALS)[number];

/** Taxonomía acotada: string 1..64, no enum. */
export type Category = string;
