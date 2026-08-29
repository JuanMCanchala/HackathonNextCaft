import { createTestBackend } from "./helpers/convexHarness";

describe("Sentra schema foundation", () => {
  it("keeps threadMetadata and supports workspace + membership inserts", async () => {
    const t = createTestBackend();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const threadId = await ctx.db.insert("threadMetadata", {
        threadId: "thread_1",
        createdAt: now,
      });
      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Schema Check",
        status: "active",
        settings: {
          groupingWindowSeconds: 45,
          retentionDays: 30,
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });
      const membershipId = await ctx.db.insert("memberships", {
        workspaceId,
        tokenIdentifier: "issuer|subject",
        subjectId: "subject",
        role: "workspace_admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_token_and_workspace", (q) =>
          q.eq("tokenIdentifier", "issuer|subject").eq("workspaceId", workspaceId),
        )
        .unique();
      return { threadId, workspaceId, membershipId, membership };
    });

    expect(ids.threadId).toEqual(expect.any(String));
    expect(ids.membership?.workspaceId).toBe(ids.workspaceId);
    expect(ids.membership?.role).toBe("workspace_admin");
  });

  it("exposes workspace-first indexes used by later slices", async () => {
    const t = createTestBackend();
    await t.run(async (ctx) => {
      const now = Date.now();
      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Index Check",
        status: "active",
        settings: {
          groupingWindowSeconds: 45,
          retentionDays: 30,
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });
      const cameraId = await ctx.db.insert("cameras", {
        workspaceId,
        externalId: "cam-ext-1",
        label: "Lobby",
        location: null,
        adminStatus: "active",
        connectivity: "unknown",
        lastHeartbeatAt: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("detections", {
        workspaceId,
        cameraId,
        sourceNamespace: "model",
        sourceEventId: "evt-1",
        category: "intrusion",
        confidence: 0.9,
        occurredAt: now,
        receivedAt: now,
        createdAt: now,
      });
      await ctx.db.insert("incidents", {
        workspaceId,
        cameraId,
        category: "intrusion",
        state: "detected",
        severity: "high",
        initialSeverity: "high",
        severityRuleVersion: "sev-v1",
        openedAt: now,
        lastObservedAt: now,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("idempotencyRecords", {
        workspaceId,
        key: "idem-1",
        requestHash: "hash",
        response: { ok: true },
        createdAt: now,
      });

      const camera = await ctx.db
        .query("cameras")
        .withIndex("by_workspace_and_externalId", (q) =>
          q.eq("workspaceId", workspaceId).eq("externalId", "cam-ext-1"),
        )
        .unique();
      expect(camera?.label).toBe("Lobby");
    });
  });
});
