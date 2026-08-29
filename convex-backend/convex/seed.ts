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

/**
 * Da de alta una identidad concreta en un workspace existente.
 *
 * Existe para reparar el caso que se da al montar una demo: los incidentes
 * los siembra el pipeline con un identificador de servicio, y la persona que
 * luego inicia sesion con Clerk llega con otro. Sin esto hay que rehacer el
 * workspace entero solo para cambiar quien puede verlo.
 *
 * Es `internalMutation`: no se llama desde el navegador, solo desde la CLI de
 * quien administra el deployment.
 */
export const grantMembership = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    tokenIdentifier: v.string(),
    subjectId: v.string(),
    role: v.union(v.literal("workspace_admin"), v.literal("operator"), v.literal("viewer")),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const previa = await ctx.db
      .query("memberships")
      .withIndex("by_token_and_workspace", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier).eq("workspaceId", args.workspaceId),
      )
      .unique();

    const now = Date.now();
    if (previa !== null) {
      await ctx.db.patch(previa._id, { role: args.role, status: "active", updatedAt: now });
      return "actualizada";
    }
    await ctx.db.insert("memberships", {
      workspaceId: args.workspaceId,
      tokenIdentifier: args.tokenIdentifier,
      subjectId: args.subjectId,
      role: args.role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return "creada";
  },
});

/** Renombra un workspace. Util cuando la marca cambia despues de sembrarlo. */
export const renameWorkspace = internalMutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workspaceId, { name: args.name, updatedAt: Date.now() });
    return args.name;
  },
});
