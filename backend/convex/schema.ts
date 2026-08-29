import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const workspaceRole = v.union(
  v.literal("workspace_admin"),
  v.literal("operator"),
  v.literal("viewer"),
);

const membershipStatus = v.union(v.literal("active"), v.literal("inactive"));

const workspaceStatus = v.union(v.literal("active"), v.literal("suspended"));

const cameraAdminStatus = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("disabled"),
);

const cameraConnectivity = v.union(
  v.literal("online"),
  v.literal("offline"),
  v.literal("degraded"),
  v.literal("unknown"),
);

const incidentState = v.union(
  v.literal("detected"),
  v.literal("triaged"),
  v.literal("acknowledged"),
  v.literal("resolved"),
  v.literal("dismissed"),
);

const operationalSeverity = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

export default defineSchema({
  threadMetadata: defineTable({
    threadId: v.string(),
    ownerSubject: v.optional(v.string()),
    title: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_thread", ["threadId"]),

  workspaces: defineTable({
    name: v.string(),
    status: workspaceStatus,
    settings: v.object({
      groupingWindowSeconds: v.number(),
      retentionDays: v.number(),
      timezone: v.string(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  memberships: defineTable({
    workspaceId: v.id("workspaces"),
    tokenIdentifier: v.string(),
    subjectId: v.string(),
    role: workspaceRole,
    status: membershipStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_token_and_workspace", ["tokenIdentifier", "workspaceId"]),

  cameras: defineTable({
    workspaceId: v.id("workspaces"),
    externalId: v.string(),
    label: v.string(),
    location: v.union(v.string(), v.null()),
    adminStatus: cameraAdminStatus,
    connectivity: cameraConnectivity,
    lastHeartbeatAt: v.union(v.number(), v.null()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  }).index("by_workspace_and_externalId", ["workspaceId", "externalId"]),

  detections: defineTable({
    workspaceId: v.id("workspaces"),
    cameraId: v.id("cameras"),
    sourceNamespace: v.string(),
    sourceEventId: v.string(),
    category: v.string(),
    confidence: v.number(),
    occurredAt: v.number(),
    receivedAt: v.number(),
    createdAt: v.number(),
    modelVersion: v.optional(v.string()),
    detectorVersion: v.optional(v.string()),
    suggestedCategory: v.optional(v.string()),
    evidenceRefs: v.optional(v.array(v.string())),
  }).index("by_workspace_source_event", [
    "workspaceId",
    "sourceNamespace",
    "sourceEventId",
  ]),

  incidents: defineTable({
    workspaceId: v.id("workspaces"),
    cameraId: v.id("cameras"),
    category: v.string(),
    state: incidentState,
    severity: operationalSeverity,
    severityRuleVersion: v.string(),
    openedAt: v.number(),
    lastObservedAt: v.number(),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    assignedTo: v.optional(v.string()),
  })
    .index("by_workspace_state", ["workspaceId", "state"])
    .index("by_workspace_camera_category_lastObserved", [
      "workspaceId",
      "cameraId",
      "category",
      "lastObservedAt",
    ]),

  incidentDetections: defineTable({
    workspaceId: v.id("workspaces"),
    incidentId: v.id("incidents"),
    detectionId: v.id("detections"),
    createdAt: v.number(),
  })
    .index("by_workspace_and_incident", ["workspaceId", "incidentId"])
    .index("by_workspace_and_detection", ["workspaceId", "detectionId"]),

  incidentTimeline: defineTable({
    workspaceId: v.id("workspaces"),
    incidentId: v.id("incidents"),
    type: v.string(),
    actorTokenIdentifier: v.optional(v.string()),
    payload: v.any(),
    createdAt: v.number(),
  }).index("by_workspace_and_incident", ["workspaceId", "incidentId"]),

  auditEntries: defineTable({
    workspaceId: v.id("workspaces"),
    actorTokenIdentifier: v.optional(v.string()),
    actorRole: v.optional(workspaceRole),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    requestId: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  idempotencyRecords: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    requestHash: v.string(),
    response: v.any(),
    createdAt: v.number(),
  }).index("by_workspace_and_key", ["workspaceId", "key"]),
});
