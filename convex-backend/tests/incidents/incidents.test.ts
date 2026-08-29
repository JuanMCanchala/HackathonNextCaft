import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ADMIN_IDENTITY,
  FOREIGN_IDENTITY,
  OPERATOR_IDENTITY,
  VIEWER_IDENTITY,
  createTestBackend,
} from "../helpers/convexHarness";
import { expectApiError } from "../helpers/apiErrorAssert";
import schemas from "../../docs/api-contract.schemas.json" with { type: "json" };

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const STATE = /^(detected|triaged|acknowledged|resolved|dismissed)$/;
const SEVERITY = /^(low|medium|high|critical)$/;

function assertIncidentSummary(value: unknown): void {
  expect(value).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      workspaceId: expect.any(String),
      cameraId: expect.any(String),
      category: expect.any(String),
      state: expect.stringMatching(STATE),
      severity: expect.stringMatching(SEVERITY),
      openedAt: expect.stringMatching(RFC3339),
      lastObservedAt: expect.stringMatching(RFC3339),
      version: expect.any(Number),
    }),
  );
  const summary = value as Record<string, unknown>;
  expect(
    summary.assignedToSubjectId === null || typeof summary.assignedToSubjectId === "string",
  ).toBe(true);
  expect(schemas.$defs.incidentSummary.required).toEqual(
    expect.arrayContaining([
      "id",
      "workspaceId",
      "cameraId",
      "category",
      "state",
      "severity",
      "openedAt",
      "lastObservedAt",
      "assignedToSubjectId",
      "version",
    ]),
  );
}

function assertIncidentDetail(value: unknown): void {
  assertIncidentSummary(value);
  const detail = value as {
    initialSeverity: string;
    severityOverride: null;
    detectionIds: string[];
    evidenceIds: string[];
    timeline: unknown[];
  };
  expect(detail.initialSeverity).toMatch(SEVERITY);
  expect(detail.severityOverride).toBeNull();
  expect(Array.isArray(detail.detectionIds)).toBe(true);
  expect(Array.isArray(detail.evidenceIds)).toBe(true);
  expect(Array.isArray(detail.timeline)).toBe(true);
  for (const key of [
    "initialSeverity",
    "severityOverride",
    "detectionIds",
    "evidenceIds",
    "timeline",
  ]) {
    expect(detail).toHaveProperty(key);
  }
}

describe("incidents public API", () => {
  async function seedWorkspace(
    t: ReturnType<typeof createTestBackend>,
    identity: { tokenIdentifier: string; subject: string },
    role: "workspace_admin" | "operator" | "viewer",
  ): Promise<Id<"workspaces">> {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Ops",
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

  async function seedIncident(
    t: ReturnType<typeof createTestBackend>,
    workspaceId: Id<"workspaces">,
    overrides: { state?: "detected" | "triaged"; version?: number } = {},
  ): Promise<Id<"incidents">> {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const cameraId = await ctx.db.insert("cameras", {
        workspaceId,
        externalId: `cam-${now}`,
        label: "Cam",
        location: null,
        adminStatus: "active",
        connectivity: "unknown",
        lastHeartbeatAt: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      const incidentId = await ctx.db.insert("incidents", {
        workspaceId,
        cameraId,
        category: "smoke",
        state: overrides.state ?? "detected",
        severity: "high",
        initialSeverity: "high",
        severityRuleVersion: "sev-v1",
        openedAt: now,
        lastObservedAt: now,
        version: overrides.version ?? 0,
        createdAt: now,
        updatedAt: now,
      });
      const detectionId = await ctx.db.insert("detections", {
        workspaceId,
        cameraId,
        sourceNamespace: "model.v1",
        sourceEventId: `evt-${incidentId}`,
        category: "smoke",
        confidence: 0.8,
        occurredAt: now,
        receivedAt: now,
        createdAt: now,
        evidenceRefs: ["snapshot://a"],
      });
      await ctx.db.insert("incidentDetections", {
        workspaceId,
        incidentId,
        detectionId,
        createdAt: now,
      });
      await ctx.db.insert("incidentTimeline", {
        workspaceId,
        incidentId,
        type: "incident.created",
        payload: { from: null, to: "detected" },
        createdAt: now,
      });
      return incidentId;
    });
  }

  it("list/get require auth and isolate workspaces", async () => {
    const t = createTestBackend();
    const workspaceA = await seedWorkspace(t, VIEWER_IDENTITY, "viewer");
    const workspaceB = await seedWorkspace(t, ADMIN_IDENTITY, "workspace_admin");
    const incidentA = await seedIncident(t, workspaceA);
    const incidentB = await seedIncident(t, workspaceB);

    await expectApiError(
      t.query(api.incidents.list, {
        workspaceId: workspaceA,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      { code: "UNAUTHENTICATED" },
    );

    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    const page = await asViewer.query(api.incidents.list, {
      workspaceId: workspaceA,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(page.items).toHaveLength(1);
    assertIncidentSummary(page.items[0]);
    expect(page.items[0]!.id).toBe(incidentA);

    await expectApiError(
      asViewer.query(api.incidents.list, {
        workspaceId: workspaceB,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
      { code: "NOT_FOUND" },
    );
    await expectApiError(asViewer.query(api.incidents.get, { incidentId: incidentB }), {
      code: "NOT_FOUND",
    });

    const detail = await asViewer.query(api.incidents.get, {
      incidentId: incidentA,
    });
    assertIncidentDetail(detail);
    expect(detail.detectionIds).toHaveLength(1);
    expect(detail.evidenceIds).toEqual(["snapshot://a"]);
  });

  it("viewer cannot triage; operator can", async () => {
    const t = createTestBackend();
    const workspaceId = await seedWorkspace(t, VIEWER_IDENTITY, "viewer");
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("memberships", {
        workspaceId,
        tokenIdentifier: OPERATOR_IDENTITY.tokenIdentifier,
        subjectId: OPERATOR_IDENTITY.subject,
        role: "operator",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });
    const incidentId = await seedIncident(t, workspaceId);

    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    await expectApiError(
      asViewer.mutation(api.incidents.triage, {
        incidentId,
        expectedVersion: 0,
        idempotencyKey: "triage-1",
      }),
      { code: "FORBIDDEN" },
    );

    const asOperator = t.withIdentity(OPERATOR_IDENTITY);
    const detail = await asOperator.mutation(api.incidents.triage, {
      incidentId,
      expectedVersion: 0,
      idempotencyKey: "triage-1",
      notes: "looking into it",
    });
    assertIncidentDetail(detail);
    expect(detail.state).toBe("triaged");
    expect(detail.version).toBe(1);

    const replay = await asOperator.mutation(api.incidents.triage, {
      incidentId,
      expectedVersion: 0,
      idempotencyKey: "triage-1",
      notes: "looking into it",
    });
    expect(replay.state).toBe("triaged");
    expect(replay.version).toBe(1);
  });

  it("stale version and wrong state return CONFLICT", async () => {
    const t = createTestBackend();
    const workspaceId = await seedWorkspace(t, OPERATOR_IDENTITY, "operator");
    const incidentId = await seedIncident(t, workspaceId);
    const asOperator = t.withIdentity(OPERATOR_IDENTITY);

    await expectApiError(
      asOperator.mutation(api.incidents.triage, {
        incidentId,
        expectedVersion: 9,
        idempotencyKey: "stale",
      }),
      { code: "CONFLICT" },
    );

    await asOperator.mutation(api.incidents.triage, {
      incidentId,
      expectedVersion: 0,
      idempotencyKey: "ok",
    });
    await expectApiError(
      asOperator.mutation(api.incidents.triage, {
        incidentId,
        expectedVersion: 1,
        idempotencyKey: "again",
      }),
      { code: "CONFLICT" },
    );
  });

  it("ack/resolve/dismiss are unavailable and leave state unchanged", async () => {
    const t = createTestBackend();
    const workspaceId = await seedWorkspace(t, OPERATOR_IDENTITY, "operator");
    const incidentId = await seedIncident(t, workspaceId, { state: "triaged" });
    const asOperator = t.withIdentity(OPERATOR_IDENTITY);

    await expectApiError(
      asOperator.mutation(api.incidents.acknowledge, {
        incidentId,
        expectedVersion: 0,
      }),
      { code: "CONFLICT" },
    );
    await expectApiError(
      asOperator.mutation(api.incidents.resolve, {
        incidentId,
        expectedVersion: 0,
      }),
      { code: "CONFLICT" },
    );
    await expectApiError(
      asOperator.mutation(api.incidents.dismiss, {
        incidentId,
        expectedVersion: 0,
        reason: "noise",
      }),
      { code: "CONFLICT" },
    );

    const detail = await asOperator.query(api.incidents.get, { incidentId });
    expect(detail.state).toBe("triaged");
    expect(detail.version).toBe(0);
  });

  it("foreign identity cannot triage", async () => {
    const t = createTestBackend();
    const workspaceId = await seedWorkspace(t, OPERATOR_IDENTITY, "operator");
    const incidentId = await seedIncident(t, workspaceId);
    const asForeign = t.withIdentity(FOREIGN_IDENTITY);
    await expectApiError(
      asForeign.mutation(api.incidents.triage, {
        incidentId,
        expectedVersion: 0,
        idempotencyKey: "x",
      }),
      { code: "NOT_FOUND" },
    );
  });
});
