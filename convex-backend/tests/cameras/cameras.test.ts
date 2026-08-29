import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ADMIN_IDENTITY,
  FOREIGN_IDENTITY,
  VIEWER_IDENTITY,
  createTestBackend,
} from "../helpers/convexHarness";
import { expectApiError } from "../helpers/apiErrorAssert";
import schemas from "../../docs/api-contract.schemas.json" with { type: "json" };

const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const CAMERA_ADMIN = /^(active|paused|disabled)$/;
const CAMERA_CONNECTIVITY = /^(online|offline|degraded|unknown)$/;

function assertCamera(value: unknown): void {
  expect(value).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      workspaceId: expect.any(String),
      externalId: expect.any(String),
      label: expect.any(String),
      adminStatus: expect.stringMatching(CAMERA_ADMIN),
      connectivity: expect.stringMatching(CAMERA_CONNECTIVITY),
      version: expect.any(Number),
      createdAt: expect.stringMatching(RFC3339),
      updatedAt: expect.stringMatching(RFC3339),
    }),
  );
  const camera = value as Record<string, unknown>;
  expect((camera.id as string).length).toBeGreaterThan(0);
  expect((camera.workspaceId as string).length).toBeGreaterThan(0);
  expect((camera.externalId as string).length).toBeGreaterThan(0);
  expect((camera.externalId as string).length).toBeLessThanOrEqual(128);
  expect((camera.label as string).length).toBeGreaterThan(0);
  expect((camera.label as string).length).toBeLessThanOrEqual(128);
  expect(
    camera.location === null || typeof camera.location === "string",
  ).toBe(true);
  if (typeof camera.location === "string") {
    expect(camera.location.length).toBeLessThanOrEqual(256);
  }
  expect(
    camera.lastHeartbeatAt === null ||
      (typeof camera.lastHeartbeatAt === "string" &&
        RFC3339.test(camera.lastHeartbeatAt)),
  ).toBe(true);
  expect(camera.version as number).toBeGreaterThanOrEqual(0);
  expect(Object.keys(camera).sort()).toEqual(
    [
      "adminStatus",
      "connectivity",
      "createdAt",
      "externalId",
      "id",
      "label",
      "lastHeartbeatAt",
      "location",
      "updatedAt",
      "version",
      "workspaceId",
    ].sort(),
  );
  expect(schemas.$defs.camera.required).toEqual(
    expect.arrayContaining([
      "id",
      "workspaceId",
      "externalId",
      "label",
      "location",
      "adminStatus",
      "connectivity",
      "lastHeartbeatAt",
      "version",
      "createdAt",
      "updatedAt",
    ]),
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
  expect(page.nextCursor === null || typeof page.nextCursor === "string").toBe(
    true,
  );
  expect(Object.keys(page).sort()).toEqual(
    ["hasMore", "items", "nextCursor"].sort(),
  );
  expect(schemas.$defs.pageMeta.required).toEqual(
    expect.arrayContaining(["items", "nextCursor", "hasMore"]),
  );
}

describe("cameras public API", () => {
  async function seedMemberWorkspace(
    t: ReturnType<typeof createTestBackend>,
    identity: { tokenIdentifier: string; subject: string },
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

  async function seedCamera(
    t: ReturnType<typeof createTestBackend>,
    workspaceId: Id<"workspaces">,
    externalId: string,
  ): Promise<Id<"cameras">> {
    return await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("cameras", {
        workspaceId,
        externalId,
        label: externalId,
        location: null,
        adminStatus: "active",
        connectivity: "unknown",
        lastHeartbeatAt: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  it("create throws UNAUTHENTICATED without identity", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(t, ADMIN_IDENTITY, "workspace_admin");
    await expectApiError(
      t.mutation(api.cameras.create, {
        workspaceId,
        externalId: "cam-1",
        label: "Front door",
      }),
      { code: "UNAUTHENTICATED" },
    );
  });

  it("create throws FORBIDDEN for viewer", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(t, VIEWER_IDENTITY, "viewer");
    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    await expectApiError(
      asViewer.mutation(api.cameras.create, {
        workspaceId,
        externalId: "cam-1",
        label: "Front door",
      }),
      { code: "FORBIDDEN" },
    );
  });

  it("admin create returns Camera with connectivity unknown and audits", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(
      t,
      ADMIN_IDENTITY,
      "workspace_admin",
    );
    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    const camera = await asAdmin.mutation(api.cameras.create, {
      workspaceId,
      externalId: "gate-a",
      label: "Gate A",
      location: "Lobby",
    });

    assertCamera(camera);
    expect(camera.workspaceId).toBe(workspaceId);
    expect(camera.externalId).toBe("gate-a");
    expect(camera.label).toBe("Gate A");
    expect(camera.location).toBe("Lobby");
    expect(camera.adminStatus).toBe("active");
    expect(camera.connectivity).toBe("unknown");
    expect(camera.lastHeartbeatAt).toBeNull();
    expect(camera.version).toBe(0);

    const audits = await t.run(async (ctx) => {
      return await ctx.db
        .query("auditEntries")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toEqual(
      expect.objectContaining({
        action: "camera.created",
        targetType: "camera",
        targetId: camera.id,
        actorTokenIdentifier: ADMIN_IDENTITY.tokenIdentifier,
        actorRole: "workspace_admin",
      }),
    );
    expect(audits[0]!.requestId.length).toBeGreaterThan(0);
  });

  it("create throws CONFLICT for duplicate externalId in workspace", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(
      t,
      ADMIN_IDENTITY,
      "workspace_admin",
    );
    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    await asAdmin.mutation(api.cameras.create, {
      workspaceId,
      externalId: "dup-1",
      label: "First",
    });
    await expectApiError(
      asAdmin.mutation(api.cameras.create, {
        workspaceId,
        externalId: "dup-1",
        label: "Second",
      }),
      { code: "CONFLICT" },
    );
  });

  it("create throws VALIDATION_ERROR for empty externalId/label", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(
      t,
      ADMIN_IDENTITY,
      "workspace_admin",
    );
    const asAdmin = t.withIdentity(ADMIN_IDENTITY);
    await expectApiError(
      asAdmin.mutation(api.cameras.create, {
        workspaceId,
        externalId: "",
        label: "Ok",
      }),
      { code: "VALIDATION_ERROR" },
    );
    await expectApiError(
      asAdmin.mutation(api.cameras.create, {
        workspaceId,
        externalId: "ok",
        label: "",
      }),
      { code: "VALIDATION_ERROR" },
    );
  });

  it("list/get throw UNAUTHENTICATED without identity", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(
      t,
      ADMIN_IDENTITY,
      "workspace_admin",
    );
    const cameraId = await seedCamera(t, workspaceId, "seeded");
    await expectApiError(
      t.query(api.cameras.list, {
        workspaceId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      { code: "UNAUTHENTICATED" },
    );
    await expectApiError(t.query(api.cameras.get, { cameraId }), {
      code: "UNAUTHENTICATED",
    });
  });

  it("viewer can list and get cameras in own workspace", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(t, VIEWER_IDENTITY, "viewer");
    const cameraId = await seedCamera(t, workspaceId, "lobby-1");

    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    const page = await asViewer.query(api.cameras.list, {
      workspaceId,
      paginationOpts: { cursor: null, numItems: 25 },
    });
    assertPageShape(page);
    expect(page.items).toHaveLength(1);
    assertCamera(page.items[0]);
    expect(page.items[0]!.id).toBe(cameraId);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();

    const got = await asViewer.query(api.cameras.get, { cameraId });
    assertCamera(got);
    expect(got.id).toBe(cameraId);
  });

  it("list is isolated to caller workspace; foreign get is NOT_FOUND", async () => {
    const t = createTestBackend();
    const workspaceA = await seedMemberWorkspace(t, VIEWER_IDENTITY, "viewer");
    const workspaceB = await seedMemberWorkspace(
      t,
      ADMIN_IDENTITY,
      "workspace_admin",
    );
    await seedCamera(t, workspaceA, "a-1");
    const cameraB = await seedCamera(t, workspaceB, "b-1");

    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    const page = await asViewer.query(api.cameras.list, {
      workspaceId: workspaceA,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    assertPageShape(page);
    expect(page.items).toHaveLength(1);
    assertCamera(page.items[0]);
    expect(page.items[0]!.externalId).toBe("a-1");

    await expectApiError(
      asViewer.query(api.cameras.list, {
        workspaceId: workspaceB,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      { code: "NOT_FOUND" },
    );
    await expectApiError(asViewer.query(api.cameras.get, { cameraId: cameraB }), {
      code: "NOT_FOUND",
    });
  });

  it("list throws VALIDATION_ERROR for bad pagination", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(t, VIEWER_IDENTITY, "viewer");
    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    await expectApiError(
      asViewer.query(api.cameras.list, {
        workspaceId,
        paginationOpts: { cursor: "not-a-number", numItems: 10 },
      }),
      { code: "VALIDATION_ERROR" },
    );
    await expectApiError(
      asViewer.query(api.cameras.list, {
        workspaceId,
        paginationOpts: { cursor: null, numItems: 0 },
      }),
      { code: "VALIDATION_ERROR" },
    );
  });

  it("foreign identity cannot create in another's workspace", async () => {
    const t = createTestBackend();
    const workspaceId = await seedMemberWorkspace(
      t,
      ADMIN_IDENTITY,
      "workspace_admin",
    );
    const asForeign = t.withIdentity(FOREIGN_IDENTITY);
    await expectApiError(
      asForeign.mutation(api.cameras.create, {
        workspaceId,
        externalId: "stolen",
        label: "Nope",
      }),
      { code: "NOT_FOUND" },
    );
  });
});
