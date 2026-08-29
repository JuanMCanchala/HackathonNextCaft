import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActiveMembership, requireRole } from "./lib/authz";
import { toCamera, type CameraDto } from "./lib/dto/cameras";
import { createRequestId, throwApiError } from "./lib/errors";

const cameraAdminStatus = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("disabled"),
);

function validateBoundedString(
  value: string,
  field: string,
  max: number,
): void {
  if (value.length < 1 || value.length > max) {
    throwApiError("VALIDATION_ERROR", `Invalid ${field}`, {
      details: [
        {
          path: field,
          message: `${field} must be 1..${max} characters`,
        },
      ],
    });
  }
}

function validateOptionalLocation(location: string | null | undefined): string | null {
  if (location === undefined || location === null) {
    return null;
  }
  if (location.length > 256) {
    throwApiError("VALIDATION_ERROR", "Invalid location", {
      details: [
        {
          path: "location",
          message: "location must be at most 256 characters",
        },
      ],
    });
  }
  return location;
}

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

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    externalId: v.string(),
    label: v.string(),
    location: v.optional(v.union(v.string(), v.null())),
    adminStatus: v.optional(cameraAdminStatus),
  },
  handler: async (ctx, args) => {
    const membership = await requireRole(ctx, args.workspaceId, [
      "workspace_admin",
    ]);
    validateBoundedString(args.externalId, "externalId", 128);
    validateBoundedString(args.label, "label", 128);
    const location = validateOptionalLocation(args.location);
    const adminStatus = args.adminStatus ?? "active";

    const existing = await ctx.db
      .query("cameras")
      .withIndex("by_workspace_and_externalId", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("externalId", args.externalId),
      )
      .unique();
    if (existing !== null) {
      throwApiError("CONFLICT", "Camera externalId already exists in workspace");
    }

    const now = Date.now();
    const requestId = createRequestId();
    const cameraId = await ctx.db.insert("cameras", {
      workspaceId: args.workspaceId,
      externalId: args.externalId,
      label: args.label,
      location,
      adminStatus,
      connectivity: "unknown",
      lastHeartbeatAt: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditEntries", {
      workspaceId: args.workspaceId,
      actorTokenIdentifier: membership.tokenIdentifier,
      actorRole: membership.role,
      action: "camera.created",
      targetType: "camera",
      targetId: cameraId,
      requestId,
      after: {
        externalId: args.externalId,
        label: args.label,
        location,
        adminStatus,
      },
      createdAt: now,
    });

    const created = await ctx.db.get(cameraId);
    if (created === null) {
      throwApiError("INTERNAL_ERROR", "Camera create failed");
    }
    return toCamera(created);
  },
});

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireActiveMembership(ctx, args.workspaceId);
    validateNumItems(args.paginationOpts.numItems);
    const start = parseListOffset(args.paginationOpts.cursor);

    const cameras = await ctx.db
      .query("cameras")
      .withIndex("by_workspace_and_externalId", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();

    const items: CameraDto[] = cameras
      .slice(start, start + args.paginationOpts.numItems)
      .map(toCamera);
    const end = start + args.paginationOpts.numItems;
    const hasMore = end < cameras.length;
    return {
      items,
      nextCursor: hasMore ? String(end) : null,
      hasMore,
    };
  },
});

export const get = query({
  args: {
    cameraId: v.id("cameras"),
  },
  handler: async (ctx, args) => {
    const camera = await ctx.db.get(args.cameraId);
    if (camera === null) {
      throwApiError("NOT_FOUND", "Camera not found");
    }
    await requireActiveMembership(ctx, camera.workspaceId);
    return toCamera(camera);
  },
});
