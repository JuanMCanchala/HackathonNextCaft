import { api, internal } from "../../convex/_generated/api";
import {
  ADMIN_IDENTITY,
  FOREIGN_IDENTITY,
  VIEWER_IDENTITY,
  createTestBackend,
} from "../helpers/convexHarness";
import { expectApiError } from "../helpers/apiErrorAssert";
import type { Id } from "../../convex/_generated/dataModel";
import schemas from "../../docs/api-contract.schemas.json" with { type: "json" };

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function assertWorkspaceSummary(value: unknown): void {
  expect(value).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      status: expect.stringMatching(/^(active|suspended)$/),
      createdAt: expect.stringMatching(RFC3339),
      updatedAt: expect.stringMatching(RFC3339),
    }),
  );
  const summary = value as Record<string, unknown>;
  expect((summary.id as string).length).toBeGreaterThan(0);
  expect((summary.name as string).length).toBeGreaterThan(0);
  // Summary responses must not include settings; Detail may add it.
  if (!("settings" in summary)) {
    expect(Object.keys(summary).sort()).toEqual(
      ["createdAt", "id", "name", "status", "updatedAt"].sort(),
    );
  }
}

function assertWorkspaceDetail(value: unknown): void {
  assertWorkspaceSummary(value);
  const detail = value as {
    settings: {
      groupingWindowSeconds: number;
      retentionDays: number;
      timezone: string;
    };
  };
  expect(detail.settings).toEqual(
    expect.objectContaining({
      groupingWindowSeconds: expect.any(Number),
      retentionDays: expect.any(Number),
      timezone: expect.any(String),
    }),
  );
  expect(detail.settings.groupingWindowSeconds).toBeGreaterThanOrEqual(30);
  expect(detail.settings.groupingWindowSeconds).toBeLessThanOrEqual(60);
  expect(detail.settings.retentionDays).toBeGreaterThanOrEqual(1);
  expect(detail.settings.timezone.length).toBeGreaterThan(0);
  expect(Object.keys(detail).sort()).toEqual(
    ["createdAt", "id", "name", "settings", "status", "updatedAt"].sort(),
  );
}

function assertPageShape(value: unknown): void {
  const page = value as {
    items: unknown[];
    nextCursor: string | null;
    hasMore: boolean;
  };
  expect(Array.isArray(page.items)).toBe(true);
  expect(typeof page.hasMore).toBe("boolean");
  expect(page.nextCursor === null || typeof page.nextCursor === "string").toBe(true);
  expect(Object.keys(page).sort()).toEqual(["hasMore", "items", "nextCursor"].sort());
  // Schema contract presence check for pageMeta required keys
  expect(schemas.$defs.pageMeta.required).toEqual(
    expect.arrayContaining(["items", "nextCursor", "hasMore"]),
  );
  expect(schemas.$defs.workspaceSummary.required).toEqual(
    expect.arrayContaining(["id", "name", "status", "createdAt", "updatedAt"]),
  );
}

describe("workspaces public API", () => {
  async function seedMemberWorkspace(
    t: ReturnType<typeof createTestBackend>,
    identity: {
      tokenIdentifier: string;
      subject: string;
    },
    role: "workspace_admin" | "operator" | "viewer" = "viewer",
  ): Promise<Id<"workspaces">> {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Sentra Ops",
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
        workspaceId,
        tokenIdentifier: identity.tokenIdentifier,
        subjectId: identity.subject,
        role,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return workspaceId;
    });
  }

  it("list throws UNAUTHENTICATED without identity", async () => {
    const t = createTestBackend();
    await expectApiError(
      t.query(api.workspaces.list, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      { code: "UNAUTHENTICATED" },
    );
  });

  it("get throws UNAUTHENTICATED without identity", async () => {
    const t = createTestBackend();
    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("workspaces", {
        name: "Ghost",
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
    await expectApiError(t.query(api.workspaces.get, { workspaceId }), { code: "UNAUTHENTICATED" });
  });

  it("get throws FORBIDDEN for inactive membership", async () => {
    const t = createTestBackend();
    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("workspaces", {
        name: "Paused",
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
    await expectApiError(asViewer.query(api.workspaces.get, { workspaceId }), {
      code: "FORBIDDEN",
    });
  });

  it("get returns NOT_FOUND for foreign workspace (non-disclosing)", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(t, ADMIN_IDENTITY, "workspace_admin");
    const asForeign = t.withIdentity(FOREIGN_IDENTITY);
    await expectApiError(asForeign.query(api.workspaces.get, { workspaceId }), {
      code: "NOT_FOUND",
    });
  });

  it("list returns only memberships for the authenticated identity", async () => {
    const t = createTestBackend();
    const mine = await seedMemberWorkspace(t, VIEWER_IDENTITY, "viewer");
    await seedMemberWorkspace(t, ADMIN_IDENTITY, "workspace_admin");

    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    const page = await asViewer.query(api.workspaces.list, {
      paginationOpts: { cursor: null, numItems: 25 },
    });
    assertPageShape(page);
    expect(page.items).toHaveLength(1);
    const only = page.items[0];
    expect(only).toBeDefined();
    assertWorkspaceSummary(only);
    expect(only!.id).toBe(mine);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("get returns WorkspaceDetail for active member", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(t, VIEWER_IDENTITY, "viewer");
    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    const detail = await asViewer.query(api.workspaces.get, { workspaceId });
    assertWorkspaceDetail(detail);
    expect(detail.id).toBe(workspaceId);
    expect(detail.name).toBe("Sentra Ops");
    expect(detail.settings.retentionDays).toBe(30);
    expect(detail.settings.timezone).toBe("UTC");
    expect(detail.settings.groupingWindowSeconds).toBe(45);
  });

  it("seed creates one workspace with admin membership defaults", async () => {
    const t = createTestBackend();
    const result = await t.mutation(internal.seed.bootstrap, {
      adminTokenIdentifier: ADMIN_IDENTITY.tokenIdentifier,
      adminSubjectId: ADMIN_IDENTITY.subject,
      workspaceName: "Seeded Workspace",
    });

    expect(result.workspaceId).toEqual(expect.any(String));
    expect(result.membershipId).toEqual(expect.any(String));

    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    const detail = await asAdmin.query(api.workspaces.get, {
      workspaceId: result.workspaceId,
    });
    assertWorkspaceDetail(detail);
    expect(detail.name).toBe("Seeded Workspace");
    expect(detail.settings).toEqual({
      groupingWindowSeconds: 45,
      retentionDays: 30,
      timezone: "UTC",
    });
  });

  it("create throws UNAUTHENTICATED without identity", async () => {
    const t = createTestBackend();
    await expectApiError(t.mutation(api.workspaces.create, { name: "Ops" }), {
      code: "UNAUTHENTICATED",
    });
  });

  it("create rejects empty name", async () => {
    const t = createTestBackend();
    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    await expectApiError(asAdmin.mutation(api.workspaces.create, { name: "  " }), {
      code: "VALIDATION_ERROR",
    });
  });

  it("authenticated user can create a workspace and becomes admin", async () => {
    const t = createTestBackend();
    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    const detail = await asAdmin.mutation(api.workspaces.create, {
      name: "  My Workspace  ",
    });
    assertWorkspaceDetail(detail);
    expect(detail.name).toBe("My Workspace");
    expect(detail.status).toBe("active");
    expect(detail.settings).toEqual({
      groupingWindowSeconds: 45,
      retentionDays: 30,
      timezone: "UTC",
    });

    const page = await asAdmin.query(api.workspaces.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(page.items.some((item) => item.id === detail.id)).toBe(true);

    const got = await asAdmin.query(api.workspaces.get, {
      workspaceId: detail.id as Id<"workspaces">,
    });
    assertWorkspaceDetail(got);

    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("auditEntries")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", detail.id as Id<"workspaces">))
        .collect(),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toEqual(
      expect.objectContaining({
        action: "workspace.created",
        actorTokenIdentifier: ADMIN_IDENTITY.tokenIdentifier,
        actorRole: "workspace_admin",
      }),
    );
  });

  it("create honors optional settings overrides", async () => {
    const t = createTestBackend();
    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    const detail = await asViewer.mutation(api.workspaces.create, {
      name: "Custom",
      groupingWindowSeconds: 60,
      retentionDays: 14,
      timezone: "America/Bogota",
    });
    expect(detail.settings).toEqual({
      groupingWindowSeconds: 60,
      retentionDays: 14,
      timezone: "America/Bogota",
    });
  });
});
