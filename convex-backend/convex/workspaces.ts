import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  listActiveMembershipsForIdentity,
  requireActiveMembership,
  requireIdentity,
} from "./lib/authz";
import { toWorkspaceDetail, toWorkspaceSummary } from "./lib/dto/workspaces";
import { createRequestId, throwApiError } from "./lib/errors";
import {
  DEFAULT_GROUPING_WINDOW_SECONDS,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_TIMEZONE,
  WORKSPACE_NAME_MAX,
} from "./lib/workspaceDefaults";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const memberships = await listActiveMembershipsForIdentity(ctx);
    const workspaces = await Promise.all(
      memberships.map((membership) => ctx.db.get(membership.workspaceId)),
    );
    const summaries = workspaces.flatMap((workspace) =>
      workspace === null ? [] : [toWorkspaceSummary(workspace)],
    );

    // Membership-scoped list is bounded by the caller's memberships; map to
    // API-CONTRACT Page using cursor offsets over the authorized set.
    const start =
      args.paginationOpts.cursor === null ? 0 : Number.parseInt(args.paginationOpts.cursor, 10);
    const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
    const end = safeStart + args.paginationOpts.numItems;
    const items = summaries.slice(safeStart, end);
    const hasMore = end < summaries.length;
    return {
      items,
      nextCursor: hasMore ? String(end) : null,
      hasMore,
    };
  },
});

export const get = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireActiveMembership(ctx, args.workspaceId);
    const workspace = await ctx.db.get(args.workspaceId);
    if (workspace === null) {
      throwApiError("NOT_FOUND", "Workspace not found");
    }
    return toWorkspaceDetail(workspace);
  },
});

/**
 * Authenticated user provisions a new workspace and becomes its workspace_admin.
 * This is the product entry path for first-time / multi-workspace onboarding
 * (replaces relying solely on internal seed.bootstrap for the UI flow).
 */
export const create = mutation({
  args: {
    name: v.string(),
    groupingWindowSeconds: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const requestId = createRequestId();
    const name = args.name.trim();
    if (name.length < 1 || name.length > WORKSPACE_NAME_MAX) {
      throwApiError("VALIDATION_ERROR", "Invalid workspace name", {
        requestId,
        details: [
          {
            path: "name",
            message: `name must be 1..${WORKSPACE_NAME_MAX} characters`,
          },
        ],
      });
    }

    const groupingWindowSeconds = args.groupingWindowSeconds ?? DEFAULT_GROUPING_WINDOW_SECONDS;
    if (groupingWindowSeconds < 30 || groupingWindowSeconds > 60) {
      throwApiError("VALIDATION_ERROR", "Invalid groupingWindowSeconds", {
        requestId,
        details: [
          {
            path: "groupingWindowSeconds",
            message: "groupingWindowSeconds must be 30..60",
          },
        ],
      });
    }

    const retentionDays = args.retentionDays ?? DEFAULT_RETENTION_DAYS;
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      throwApiError("VALIDATION_ERROR", "Invalid retentionDays", {
        requestId,
        details: [
          {
            path: "retentionDays",
            message: "retentionDays must be an integer >= 1",
          },
        ],
      });
    }

    const timezone = args.timezone === undefined ? DEFAULT_TIMEZONE : args.timezone.trim();
    if (timezone.length < 1) {
      throwApiError("VALIDATION_ERROR", "Invalid timezone", {
        requestId,
        details: [{ path: "timezone", message: "timezone is required" }],
      });
    }

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      status: "active",
      settings: {
        groupingWindowSeconds,
        retentionDays,
        timezone,
      },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("memberships", {
      workspaceId,
      tokenIdentifier: identity.tokenIdentifier,
      subjectId: identity.subject,
      role: "workspace_admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditEntries", {
      workspaceId,
      actorTokenIdentifier: identity.tokenIdentifier,
      actorRole: "workspace_admin",
      action: "workspace.created",
      targetType: "workspace",
      targetId: workspaceId,
      requestId,
      after: { name, status: "active" },
      createdAt: now,
    });

    const workspace = await ctx.db.get(workspaceId);
    if (workspace === null) {
      throwApiError("INTERNAL_ERROR", "Workspace create failed", { requestId });
    }
    return toWorkspaceDetail(workspace);
  },
});
