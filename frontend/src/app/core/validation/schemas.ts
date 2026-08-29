import { z } from 'zod';
import {
  ACTOR_KINDS,
  API_KEY_STATUSES,
  CAMERA_ADMIN_STATUSES,
  CAMERA_CONNECTIVITIES,
  ERROR_CODES,
  EVIDENCE_KINDS,
  EVIDENCE_STATUSES,
  HEARTBEAT_SIGNALS,
  INCIDENT_STATES,
  MEMBERSHIP_STATUSES,
  OPERATIONAL_SEVERITIES,
  SCOPES,
  TIMELINE_ENTRY_TYPES,
  WEBHOOK_DELIVERY_STATES,
  WEBHOOK_STATUSES,
  WORKSPACE_ROLES,
  WORKSPACE_STATUSES,
} from '../models/enums';

const rfc3339 = z.string().datetime({ offset: true });
const opaqueId = z.string().min(1);
const category = z.string().min(1).max(64);

export const errorCodeSchema = z.enum(ERROR_CODES);
export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export const workspaceStatusSchema = z.enum(WORKSPACE_STATUSES);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export const cameraAdminStatusSchema = z.enum(CAMERA_ADMIN_STATUSES);
export const cameraConnectivitySchema = z.enum(CAMERA_CONNECTIVITIES);
export const incidentStateSchema = z.enum(INCIDENT_STATES);
export const severitySchema = z.enum(OPERATIONAL_SEVERITIES);
export const evidenceKindSchema = z.enum(EVIDENCE_KINDS);
export const evidenceStatusSchema = z.enum(EVIDENCE_STATUSES);
export const apiKeyStatusSchema = z.enum(API_KEY_STATUSES);
export const webhookDeliveryStateSchema = z.enum(WEBHOOK_DELIVERY_STATES);
export const webhookStatusSchema = z.enum(WEBHOOK_STATUSES);
export const scopeSchema = z.enum(SCOPES);
export const timelineEntryTypeSchema = z.enum(TIMELINE_ENTRY_TYPES);
export const actorKindSchema = z.enum(ACTOR_KINDS);
export const heartbeatSignalSchema = z.enum(HEARTBEAT_SIGNALS);

export const fieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  requestId: z.string().min(1),
  details: z.array(fieldErrorSchema).optional(),
});

export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

export const workspaceSummarySchema = z.object({
  id: opaqueId,
  name: z.string().min(1),
  status: workspaceStatusSchema,
  createdAt: rfc3339,
  updatedAt: rfc3339,
});

export const workspaceDetailSchema = workspaceSummarySchema.extend({
  settings: z.object({
    groupingWindowSeconds: z.number().int().min(30).max(60),
    retentionDays: z.number().int().min(1),
    timezone: z.string().min(1),
  }),
});

export const membershipSchema = z.object({
  id: opaqueId,
  workspaceId: opaqueId,
  subjectId: z.string().min(1),
  role: workspaceRoleSchema,
  status: membershipStatusSchema,
  createdAt: rfc3339,
  updatedAt: rfc3339,
});

export const cameraSchema = z
  .object({
    id: opaqueId,
    workspaceId: opaqueId,
    externalId: z.string().min(1).max(128),
    label: z.string().min(1).max(128),
    location: z.string().max(256).nullable(),
    adminStatus: cameraAdminStatusSchema,
    connectivity: cameraConnectivitySchema,
    lastHeartbeatAt: rfc3339.nullable(),
    version: z.number().int().nonnegative(),
    createdAt: rfc3339,
    updatedAt: rfc3339,
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const incidentSummarySchema = z.object({
  id: opaqueId,
  workspaceId: opaqueId,
  cameraId: opaqueId,
  category,
  state: incidentStateSchema,
  severity: severitySchema,
  openedAt: rfc3339,
  lastObservedAt: rfc3339,
  assignedToSubjectId: z.string().nullable(),
  version: z.number().int().nonnegative(),
});

export const incidentTimelineEntrySchema = z.object({
  id: opaqueId,
  at: rfc3339,
  type: timelineEntryTypeSchema,
  actorKind: actorKindSchema,
  actorId: z.string().nullable(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
});

export const severityOverrideSchema = z.object({
  from: severitySchema,
  to: severitySchema,
  reason: z.string().min(1).max(500),
  actorSubjectId: z.string(),
  at: rfc3339,
});

export const incidentDetailSchema = incidentSummarySchema.extend({
  initialSeverity: severitySchema,
  severityOverride: severityOverrideSchema.nullable(),
  detectionIds: z.array(opaqueId),
  evidenceIds: z.array(opaqueId),
  timeline: z.array(incidentTimelineEntrySchema),
});

export const detectionSchema = z
  .object({
    id: opaqueId,
    workspaceId: opaqueId,
    cameraId: opaqueId,
    incidentId: z.string().nullable(),
    occurredAt: rfc3339,
    receivedAt: rfc3339,
    category,
    suggestedCategory: category,
    confidence: z.number().min(0).max(1),
    modelVersion: z.string().min(1),
    detectorVersion: z.string().min(1),
    evidenceIds: z.array(opaqueId),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const evidenceDescriptorSchema = z.object({
  id: opaqueId,
  workspaceId: opaqueId,
  incidentId: z.string().nullable(),
  detectionId: z.string().nullable(),
  kind: evidenceKindSchema,
  contentType: z.string().min(1),
  capturedAt: rfc3339,
  retentionExpiresAt: rfc3339.nullable(),
  status: evidenceStatusSchema,
});

export const evidenceAccessGrantSchema = z.object({
  evidenceId: opaqueId,
  url: z.string().url(),
  expiresAt: rfc3339,
  purpose: z.string().min(1).max(128),
});

export const statsResponseSchema = z.object({
  workspaceId: opaqueId,
  from: rfc3339,
  to: rfc3339,
  timezone: z.string(),
  counts: z.object({
    incidentsByState: z.object({
      detected: z.number().int().nonnegative(),
      triaged: z.number().int().nonnegative(),
      acknowledged: z.number().int().nonnegative(),
      resolved: z.number().int().nonnegative(),
      dismissed: z.number().int().nonnegative(),
    }),
    incidentsBySeverity: z.object({
      low: z.number().int().nonnegative(),
      medium: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
      critical: z.number().int().nonnegative(),
    }),
    detectionsTotal: z.number().int().nonnegative(),
    camerasOnline: z.number().int().nonnegative(),
    camerasTotal: z.number().int().nonnegative(),
  }),
});

export const createCameraRequestSchema = z.object({
  workspaceId: opaqueId,
  externalId: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  location: z.string().max(256).nullable().optional(),
  adminStatus: cameraAdminStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const patchCameraRequestSchema = z.object({
  label: z.string().min(1).max(128).optional(),
  location: z.string().max(256).nullable().optional(),
  adminStatus: cameraAdminStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  expectedVersion: z.number().int().nonnegative(),
});

export const heartbeatRequestSchema = z.object({
  sourceEventId: z.string().min(1),
  timestamp: rfc3339,
  signal: heartbeatSignalSchema.optional(),
});

export const triageRequestSchema = z.object({
  category: category.optional(),
  notes: z.string().max(2000).optional(),
  assignedToSubjectId: z.string().nullable().optional(),
  expectedVersion: z.number().int().nonnegative(),
});

export const transitionRequestSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  expectedVersion: z.number().int().nonnegative(),
});

export const dismissRequestSchema = z.object({
  reason: z.string().min(1).max(500),
  expectedVersion: z.number().int().nonnegative(),
});

export const patchIncidentRequestSchema = z.object({
  severity: severitySchema.optional(),
  reason: z.string().min(1).max(500).optional(),
  expectedVersion: z.number().int().nonnegative(),
});

export const evidenceAccessRequestSchema = z.object({
  purpose: z.string().min(1).max(128),
  ttlSeconds: z.number().int().min(60).max(300).optional(),
});

export const createApiKeyRequestSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(scopeSchema).min(1),
  expiresAt: rfc3339.nullable().optional(),
});

export const createWebhookRequestSchema = z.object({
  workspaceId: opaqueId,
  endpointUrl: z.string().url().regex(/^https:\/\//),
  eventTypes: z.array(z.string().min(1)).min(1),
});

export function clampLimit(limit: number | undefined, fallback = 25): number {
  const n = limit ?? fallback;
  return Math.min(100, Math.max(1, Math.trunc(n)));
}
