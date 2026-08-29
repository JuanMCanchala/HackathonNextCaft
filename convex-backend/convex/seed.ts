import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const DEFAULT_GROUPING_WINDOW_SECONDS = 45;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_TIMEZONE = "UTC";

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
