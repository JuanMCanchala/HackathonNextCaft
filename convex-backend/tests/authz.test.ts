import {
  ADMIN_IDENTITY,
  FOREIGN_IDENTITY,
  VIEWER_IDENTITY,
  createTestBackend,
} from "./helpers/convexHarness";
import { expectApiError } from "./helpers/apiErrorAssert";
import type { Id } from "../convex/_generated/dataModel";

describe("lib/authz", () => {
  it("requireIdentity throws UNAUTHENTICATED without auth", async () => {
    const t = createTestBackend();
    const { requireIdentity } = await import("../convex/lib/authz");
    await expectApiError(
      t.query(async (ctx) => requireIdentity(ctx)),
      { code: "UNAUTHENTICATED" },
    );
  });

  it("requireIdentity returns tokenIdentifier for authenticated caller", async () => {
    const t = createTestBackend();
    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    const { requireIdentity } = await import("../convex/lib/authz");
    const identity = await asAdmin.query(async (ctx) => requireIdentity(ctx));
    expect(identity.tokenIdentifier).toBe(ADMIN_IDENTITY.tokenIdentifier);
  });

  it("requireActiveMembership throws FORBIDDEN for inactive membership", async () => {
    const t = createTestBackend();
    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("workspaces", {
        name: "Acme",
        status: "active",
        settings: {
          groupingWindowSeconds: 45,
          retentionDays: 30,
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("memberships", {
        workspaceId: id,
        tokenIdentifier: VIEWER_IDENTITY.tokenIdentifier,
        subjectId: VIEWER_IDENTITY.subject,
        role: "viewer",
        status: "inactive",
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });

    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    const { requireActiveMembership } = await import("../convex/lib/authz");
    await expectApiError(
      asViewer.query(async (ctx) => requireActiveMembership(ctx, workspaceId as Id<"workspaces">)),
      { code: "FORBIDDEN" },
    );
  });

  it("requireActiveMembership throws NOT_FOUND for foreign workspace", async () => {
    const t = createTestBackend();
    const foreignWorkspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("workspaces", {
        name: "Other Co",
        status: "active",
        settings: {
          groupingWindowSeconds: 45,
          retentionDays: 30,
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });
    });

    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    const { requireActiveMembership } = await import("../convex/lib/authz");
    await expectApiError(
      asAdmin.query(async (ctx) =>
        requireActiveMembership(ctx, foreignWorkspaceId as Id<"workspaces">),
      ),
      { code: "NOT_FOUND" },
    );
  });

  it("requireRole rejects viewer when operator is required", async () => {
    const t = createTestBackend();
    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("workspaces", {
        name: "Acme",
        status: "active",
        settings: {
          groupingWindowSeconds: 45,
          retentionDays: 30,
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("memberships", {
        workspaceId: id,
        tokenIdentifier: VIEWER_IDENTITY.tokenIdentifier,
        subjectId: VIEWER_IDENTITY.subject,
        role: "viewer",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });

    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    const { requireRole } = await import("../convex/lib/authz");
    await expectApiError(
      asViewer.query(async (ctx) =>
        requireRole(ctx, workspaceId as Id<"workspaces">, ["operator", "workspace_admin"]),
      ),
      { code: "FORBIDDEN" },
    );
  });

  it("requireRole allows workspace_admin for camera-create roles", async () => {
    const t = createTestBackend();
    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("workspaces", {
        name: "Acme",
        status: "active",
        settings: {
          groupingWindowSeconds: 45,
          retentionDays: 30,
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("memberships", {
        workspaceId: id,
        tokenIdentifier: ADMIN_IDENTITY.tokenIdentifier,
        subjectId: ADMIN_IDENTITY.subject,
        role: "workspace_admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });

    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    const { requireRole } = await import("../convex/lib/authz");
    const membership = await asAdmin.query(async (ctx) =>
      requireRole(ctx, workspaceId as Id<"workspaces">, ["workspace_admin"]),
    );
    expect(membership.role).toBe("workspace_admin");
    expect(membership.tokenIdentifier).toBe(ADMIN_IDENTITY.tokenIdentifier);
  });

  it("never trusts client workspaceId alone — foreign identity stays NOT_FOUND", async () => {
    const t = createTestBackend();
    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("workspaces", {
        name: "Acme",
        status: "active",
        settings: {
          groupingWindowSeconds: 45,
          retentionDays: 30,
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("memberships", {
        workspaceId: id,
        tokenIdentifier: ADMIN_IDENTITY.tokenIdentifier,
        subjectId: ADMIN_IDENTITY.subject,
        role: "workspace_admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });

    const asForeign = t.withIdentity(FOREIGN_IDENTITY);
    const { requireActiveMembership } = await import("../convex/lib/authz");
    await expectApiError(
      asForeign.query(async (ctx) => requireActiveMembership(ctx, workspaceId as Id<"workspaces">)),
      { code: "NOT_FOUND" },
    );
  });
});
