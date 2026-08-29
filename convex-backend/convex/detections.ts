import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  DEFAULT_GROUPING_WINDOW_MS,
  findGroupingTarget,
} from "./lib/domain/group";
import {
  intakePayloadFingerprint,
  normalizeObservation,
} from "./lib/domain/normalize";
import { resolveSeverity } from "./lib/domain/severity";
import { createRequestId, throwApiError } from "./lib/errors";

export type IntakeDisposition = "created" | "grouped" | "duplicate";

export type IntakeResult = {
  detectionId: Id<"detections">;
  incidentId: Id<"incidents">;
  disposition: IntakeDisposition;
  requestId: string;
};

function idempotencyKey(
  sourceNamespace: string,
  sourceEventId: string,
): string {
  return `intake:${sourceNamespace}:${sourceEventId}`;
}

export const acceptNormalized = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    cameraId: v.id("cameras"),
    sourceEventId: v.string(),
    sourceNamespace: v.string(),
    timestamp: v.string(),
    category: v.string(),
    suggestedCategory: v.optional(v.union(v.string(), v.null())),
    confidence: v.number(),
    modelVersion: v.string(),
    detectorVersion: v.string(),
    evidenceRefs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<IntakeResult> => {
    const requestId = createRequestId();
    const normalized = normalizeObservation({
      sourceEventId: args.sourceEventId,
      sourceNamespace: args.sourceNamespace,
      timestamp: args.timestamp,
      category: args.category,
      suggestedCategory: args.suggestedCategory,
      confidence: args.confidence,
      modelVersion: args.modelVersion,
      detectorVersion: args.detectorVersion,
      evidenceRefs: args.evidenceRefs,
    });
    if (!normalized.ok) {
      throwApiError("VALIDATION_ERROR", "Invalid normalized observation", {
        requestId,
        details: normalized.errors,
      });
    }
    const observation = normalized.value;

    const camera = await ctx.db.get(args.cameraId);
    if (camera === null || camera.workspaceId !== args.workspaceId) {
      throwApiError("NOT_FOUND", "Camera not found", { requestId });
    }
    if (camera.adminStatus === "disabled") {
      throwApiError("FORBIDDEN", "Camera is disabled", { requestId });
    }

    const fingerprint = intakePayloadFingerprint({
      workspaceId: args.workspaceId,
      cameraId: args.cameraId,
      observation,
    });
    const key = idempotencyKey(
      observation.sourceNamespace,
      observation.sourceEventId,
    );

    const prior = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_workspace_and_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", key),
      )
      .unique();

    if (prior !== null) {
      if (prior.requestHash !== fingerprint) {
        throwApiError(
          "IDEMPOTENCY_CONFLICT",
          "Intake idempotency key reused with different payload",
          { requestId },
        );
      }
      const cached = prior.response as IntakeResult;
      return {
        detectionId: cached.detectionId,
        incidentId: cached.incidentId,
        disposition: "duplicate",
        requestId: cached.requestId,
      };
    }

    const existingDetection = await ctx.db
      .query("detections")
      .withIndex("by_workspace_source_event", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("sourceNamespace", observation.sourceNamespace)
          .eq("sourceEventId", observation.sourceEventId),
      )
      .unique();
    if (existingDetection !== null) {
      throwApiError(
        "IDEMPOTENCY_CONFLICT",
        "Detection source identity already exists without matching record",
        { requestId },
      );
    }

    const now = Date.now();
    const detectionId = await ctx.db.insert("detections", {
      workspaceId: args.workspaceId,
      cameraId: args.cameraId,
      sourceNamespace: observation.sourceNamespace,
      sourceEventId: observation.sourceEventId,
      category: observation.category,
      confidence: observation.confidence,
      occurredAt: observation.occurredAtMs,
      receivedAt: now,
      createdAt: now,
      modelVersion: observation.modelVersion,
      detectorVersion: observation.detectorVersion,
      ...(observation.suggestedCategory !== null
        ? { suggestedCategory: observation.suggestedCategory }
        : {}),
      ...(observation.evidenceRefs.length > 0
        ? { evidenceRefs: observation.evidenceRefs }
        : {}),
    });

    const openIncidents = await ctx.db
      .query("incidents")
      .withIndex("by_workspace_camera_category_lastObserved", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("cameraId", args.cameraId)
          .eq("category", observation.category),
      )
      .collect();

    const windowMs = DEFAULT_GROUPING_WINDOW_MS;
    const target = findGroupingTarget(
      openIncidents.map((incident) => ({
        id: incident._id,
        workspaceId: incident.workspaceId,
        cameraId: incident.cameraId,
        category: incident.category,
        state: incident.state,
        lastObservedAt: incident.lastObservedAt,
      })),
      {
        workspaceId: args.workspaceId,
        cameraId: args.cameraId,
        category: observation.category,
        occurredAtMs: observation.occurredAtMs,
      },
      windowMs,
    );

    let incidentId: Id<"incidents">;
    let disposition: IntakeDisposition;

    if (target === null) {
    let severity: ReturnType<typeof resolveSeverity>;
    try {
      severity = resolveSeverity(observation.category);
    } catch {
      throwApiError("VALIDATION_ERROR", "No severity rule for category", {
        requestId,
      });
    }
    incidentId = await ctx.db.insert("incidents", {
      workspaceId: args.workspaceId,
      cameraId: args.cameraId,
      category: observation.category,
      state: "detected",
      severity: severity.severity,
      severityRuleVersion: severity.ruleVersion,
        openedAt: observation.occurredAtMs,
        lastObservedAt: observation.occurredAtMs,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      disposition = "created";
      await ctx.db.insert("incidentTimeline", {
        workspaceId: args.workspaceId,
        incidentId,
        type: "incident.created",
        payload: {
          detectionId,
          category: observation.category,
          severity: severity.severity,
          ruleVersion: severity.ruleVersion,
        },
        createdAt: now,
      });
    } else {
      incidentId = target.id as Id<"incidents">;
      const incident = await ctx.db.get(incidentId);
      if (incident === null) {
        throwApiError("INTERNAL_ERROR", "Grouped incident missing", {
          requestId,
        });
      }
      const lastObservedAt = Math.max(
        incident.lastObservedAt,
        observation.occurredAtMs,
      );
      await ctx.db.patch(incidentId, {
        lastObservedAt,
        updatedAt: now,
      });
      disposition = "grouped";
      await ctx.db.insert("incidentTimeline", {
        workspaceId: args.workspaceId,
        incidentId,
        type: "detection.grouped",
        payload: { detectionId },
        createdAt: now,
      });
    }

    await ctx.db.insert("incidentDetections", {
      workspaceId: args.workspaceId,
      incidentId,
      detectionId,
      createdAt: now,
    });

    await ctx.db.insert("auditEntries", {
      workspaceId: args.workspaceId,
      action: "detection.accepted",
      targetType: "detection",
      targetId: detectionId,
      requestId,
      after: {
        incidentId,
        disposition,
        category: observation.category,
        confidence: observation.confidence,
      },
      createdAt: now,
    });

    const result: IntakeResult = {
      detectionId,
      incidentId,
      disposition,
      requestId,
    };

    await ctx.db.insert("idempotencyRecords", {
      workspaceId: args.workspaceId,
      key,
      requestHash: fingerprint,
      response: result,
      createdAt: now,
    });

    return result;
  },
});
