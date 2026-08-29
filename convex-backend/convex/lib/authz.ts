import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { throwApiError } from "./errors";

type AuthCtx = QueryCtx | MutationCtx;

export type WorkspaceRole = Doc<"memberships">["role"];

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throwApiError("UNAUTHENTICATED", "Authentication required");
  }
  return identity;
}

export async function requireActiveMembership(
  ctx: AuthCtx,
  workspaceId: Id<"workspaces">,
): Promise<Doc<"memberships">> {
  const identity = await requireIdentity(ctx);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_token_and_workspace", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier).eq("workspaceId", workspaceId),
    )
    .unique();

  if (membership === null) {
    throwApiError("NOT_FOUND", "Workspace not found");
  }
  if (membership.status !== "active") {
    throwApiError("FORBIDDEN", "Membership is inactive");
  }
  return membership;
}

export async function requireRole(
  ctx: AuthCtx,
  workspaceId: Id<"workspaces">,
  allowedRoles: ReadonlyArray<WorkspaceRole>,
): Promise<Doc<"memberships">> {
  const membership = await requireActiveMembership(ctx, workspaceId);
  if (!allowedRoles.includes(membership.role)) {
    throwApiError("FORBIDDEN", "Insufficient role for this operation");
  }
  return membership;
}

export async function listActiveMembershipsForIdentity(
  ctx: AuthCtx,
): Promise<Array<Doc<"memberships">>> {
  const identity = await requireIdentity(ctx);
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_token_and_workspace", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .take(100);
  return memberships.filter((membership) => membership.status === "active");
}
