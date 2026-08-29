import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  listActiveMembershipsForIdentity,
  requireActiveMembership,
} from "./lib/authz";
import {
  toWorkspaceDetail,
  toWorkspaceSummary,
  type WorkspaceSummaryDto,
} from "./lib/dto/workspaces";
import { throwApiError } from "./lib/errors";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const memberships = await listActiveMembershipsForIdentity(ctx);
    const summaries: WorkspaceSummaryDto[] = [];
    for (const membership of memberships) {
      const workspace = await ctx.db.get(membership.workspaceId);
      if (workspace !== null) {
        summaries.push(toWorkspaceSummary(workspace));
      }
    }

    // Membership-scoped list is bounded by the caller's memberships; map to
    // API-CONTRACT Page using cursor offsets over the authorized set.
    const start =
      args.paginationOpts.cursor === null
        ? 0
        : Number.parseInt(args.paginationOpts.cursor, 10);
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
