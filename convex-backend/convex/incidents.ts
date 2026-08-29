import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireActiveMembership, requireRole } from "./lib/authz";
import { assertTransition } from "./lib/domain/transition";
import { toIncidentDetail, toIncidentSummary, type IncidentDetailDto } from "./lib/dto/incidents";
import { createRequestId, throwApiError } from "./lib/errors";

type DbCtx = QueryCtx | MutationCtx;

function parseListOffset(cursor: string | null): number {
  if (cursor === null) {
    return 0;
  }
  if (!/^\d+$/.test(cursor)) {
    throwApiError("VALIDATION_ERROR", "Invalid pagination cursor", {
      details: [
        {
          path: "paginationOpts.cursor",
          message: "cursor must be a non-negative integer string or null",
        },
      ],
    });
  }
  return Number.parseInt(cursor, 10);
}

function validateNumItems(numItems: number): void {
  if (!Number.isInteger(numItems) || numItems < 1) {
    throwApiError("VALIDATION_ERROR", "Invalid pagination limit", {
      details: [
        {
          path: "paginationOpts.numItems",
          message: "numItems must be an integer >= 1",
        },
      ],
    });
  }
}

async function loadIncidentDetail(
  ctx: DbCtx,
  incident: Doc<"incidents">,
): Promise<IncidentDetailDto> {
  const links = await ctx.db
    .query("incidentDetections")
    .withIndex("by_workspace_and_incident", (q) =>
      q.eq("workspaceId", incident.workspaceId).eq("incidentId", incident._id),
    )
    .take(100);
  const timeline = await ctx.db
    .query("incidentTimeline")
    .withIndex("by_workspace_and_incident", (q) =>
      q.eq("workspaceId", incident.workspaceId).eq("incidentId", incident._id),
    )
    .take(100);

  const detections = await Promise.all(links.map((link) => ctx.db.get(link.detectionId)));
  const evidenceIds = detections.flatMap((detection) =>
    detection?.evidenceRefs !== undefined ? detection.evidenceRefs : [],
  );

  return toIncidentDetail(incident, {
    detectionIds: links.map((link) => link.detectionId),
    evidenceIds,
    timeline,
  });
}

function triageIdempotencyKey(incidentId: Id<"incidents">, key: string): string {
  return `triage:${incidentId}:${key}`;
}

function isIncidentDetail(value: unknown): value is IncidentDetailDto {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.workspaceId === "string" &&
    typeof record.state === "string" &&
    typeof record.version === "number"
  );
}

function triageFingerprint(args: {
  expectedVersion: number;
  notes: string | null;
  assignedToSubjectId: string | null;
  category: string | null;
}): string {
  return JSON.stringify(args);
}

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    state: v.optional(
      v.union(
        v.literal("detected"),
        v.literal("triaged"),
        v.literal("acknowledged"),
        v.literal("resolved"),
        v.literal("dismissed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireActiveMembership(ctx, args.workspaceId);
    validateNumItems(args.paginationOpts.numItems);
    const start = parseListOffset(args.paginationOpts.cursor);
    const endExclusive = start + args.paginationOpts.numItems;

    const stateFilter = args.state;
    const incidents =
      stateFilter === undefined
        ? await ctx.db
            .query("incidents")
            .withIndex("by_workspace_state", (q) => q.eq("workspaceId", args.workspaceId))
            .take(endExclusive + 1)
        : await ctx.db
            .query("incidents")
            .withIndex("by_workspace_state", (q) =>
              q.eq("workspaceId", args.workspaceId).eq("state", stateFilter),
            )
            .take(endExclusive + 1);

    const items = incidents
      .slice(start, endExclusive)
      .map((incident) => toIncidentSummary(incident));
    const hasMore = incidents.length > endExclusive;
    return {
      items,
      nextCursor: hasMore ? String(endExclusive) : null,
      hasMore,
    };
  },
});

export const get = query({
  args: {
    incidentId: v.id("incidents"),
  },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (incident === null) {
      throwApiError("NOT_FOUND", "Incident not found");
    }
    await requireActiveMembership(ctx, incident.workspaceId);
    return await loadIncidentDetail(ctx, incident);
  },
});

export const triage = mutation({
  args: {
    incidentId: v.id("incidents"),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
    notes: v.optional(v.union(v.string(), v.null())),
    assignedToSubjectId: v.optional(v.union(v.string(), v.null())),
    category: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<IncidentDetailDto> => {
    const requestId = createRequestId();
    const incident = await ctx.db.get(args.incidentId);
    if (incident === null) {
      throwApiError("NOT_FOUND", "Incident not found", { requestId });
    }

    const membership = await requireRole(ctx, incident.workspaceId, [
      "workspace_admin",
      "operator",
    ]);

    if (args.idempotencyKey.trim().length < 1) {
      throwApiError("VALIDATION_ERROR", "idempotencyKey is required", {
        requestId,
        details: [{ path: "idempotencyKey", message: "idempotencyKey is required" }],
      });
    }

    const notes = args.notes === undefined || args.notes === null ? null : args.notes;
    if (notes !== null && notes.length > 2000) {
      throwApiError("VALIDATION_ERROR", "notes too long", {
        requestId,
        details: [{ path: "notes", message: "notes must be <= 2000 chars" }],
      });
    }

    const assignedToSubjectId =
      args.assignedToSubjectId === undefined ? null : args.assignedToSubjectId;
    const category =
      args.category === undefined || args.category === null ? null : args.category.trim();
    if (category !== null && (category.length < 1 || category.length > 64)) {
      throwApiError("VALIDATION_ERROR", "Invalid category", {
        requestId,
        details: [{ path: "category", message: "category must be 1..64 characters" }],
      });
    }

    const fingerprint = triageFingerprint({
      expectedVersion: args.expectedVersion,
      notes,
      assignedToSubjectId,
      category,
    });
    const key = triageIdempotencyKey(args.incidentId, args.idempotencyKey);
    const prior = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_workspace_and_key", (q) =>
        q.eq("workspaceId", incident.workspaceId).eq("key", key),
      )
      .unique();

    if (prior !== null) {
      if (prior.requestHash !== fingerprint) {
        throwApiError(
          "IDEMPOTENCY_CONFLICT",
          "Triage idempotency key reused with different payload",
          { requestId },
        );
      }
      if (!isIncidentDetail(prior.response)) {
        throwApiError("INTERNAL_ERROR", "Corrupt triage idempotency record", {
          requestId,
        });
      }
      return prior.response;
    }

    if (incident.version !== args.expectedVersion) {
      throwApiError("CONFLICT", "Stale incident version", { requestId });
    }

    try {
      assertTransition(incident.state, "triaged");
    } catch {
      throwApiError("CONFLICT", "Incident cannot be triaged from current state", {
        requestId,
      });
    }

    const now = Date.now();
    const nextVersion = incident.version + 1;
    await ctx.db.patch(args.incidentId, {
      state: "triaged",
      version: nextVersion,
      updatedAt: now,
      ...(assignedToSubjectId !== null ? { assignedTo: assignedToSubjectId } : {}),
      ...(category !== null ? { category } : {}),
    });

    await ctx.db.insert("incidentTimeline", {
      workspaceId: incident.workspaceId,
      incidentId: args.incidentId,
      type: "incident.triaged",
      actorTokenIdentifier: membership.tokenIdentifier,
      payload: {
        from: "detected",
        to: "triaged",
        message: notes,
        assignedToSubjectId,
      },
      createdAt: now,
    });

    await ctx.db.insert("auditEntries", {
      workspaceId: incident.workspaceId,
      actorTokenIdentifier: membership.tokenIdentifier,
      actorRole: membership.role,
      action: "incident.triaged",
      targetType: "incident",
      targetId: args.incidentId,
      requestId,
      before: { state: incident.state, version: incident.version },
      after: { state: "triaged", version: nextVersion },
      createdAt: now,
    });

    const updated = await ctx.db.get(args.incidentId);
    if (updated === null) {
      throwApiError("INTERNAL_ERROR", "Incident missing after triage", {
        requestId,
      });
    }
    const detail = await loadIncidentDetail(ctx, updated);
    await ctx.db.insert("idempotencyRecords", {
      workspaceId: incident.workspaceId,
      key,
      requestHash: fingerprint,
      response: detail,
      createdAt: now,
    });
    return detail;
  },
});

/** Frozen lifecycle — unavailable in this slice. */
export const acknowledge = mutation({
  args: {
    incidentId: v.id("incidents"),
    expectedVersion: v.number(),
  },
  handler: async () => {
    throwApiError("CONFLICT", "acknowledge is unavailable in MVP");
  },
});

/** Frozen lifecycle — unavailable in this slice. */
export const resolve = mutation({
  args: {
    incidentId: v.id("incidents"),
    expectedVersion: v.number(),
  },
  handler: async () => {
    throwApiError("CONFLICT", "resolve is unavailable in MVP");
  },
});

/** Frozen lifecycle — unavailable in this slice. */
export const dismiss = mutation({
  args: {
    incidentId: v.id("incidents"),
    expectedVersion: v.number(),
    reason: v.string(),
  },
  handler: async () => {
    throwApiError("CONFLICT", "dismiss is unavailable in MVP");
  },
});
