import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  DEFAULT_GROUPING_WINDOW_SECONDS,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_TIMEZONE,
} from "./lib/workspaceDefaults";

/** Bootstrap one workspace and an active workspace_admin membership. */
export const bootstrap = internalMutation({
  args: {
    adminTokenIdentifier: v.string(),
    adminSubjectId: v.string(),
    workspaceName: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.workspaceName,
      status: "active",
      settings: {
        groupingWindowSeconds: DEFAULT_GROUPING_WINDOW_SECONDS,
        retentionDays: DEFAULT_RETENTION_DAYS,
        timezone: DEFAULT_TIMEZONE,
      },
      createdAt: now,
      updatedAt: now,
    });
    const membershipId = await ctx.db.insert("memberships", {
      workspaceId,
      tokenIdentifier: args.adminTokenIdentifier,
      subjectId: args.adminSubjectId,
      role: "workspace_admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { workspaceId, membershipId };
  },
});
