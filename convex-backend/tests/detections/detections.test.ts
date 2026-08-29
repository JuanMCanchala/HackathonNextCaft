import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createTestBackend } from "../helpers/convexHarness";
import { expectApiError } from "../helpers/apiErrorAssert";

describe("detections.acceptNormalized", () => {
  async function seedWorkspaceCamera(
    t: ReturnType<typeof createTestBackend>,
    options?: { adminStatus?: "active" | "paused" | "disabled" },
  ): Promise<{
    workspaceId: Id<"workspaces">;
    cameraId: Id<"cameras">;
  }> {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Intake WS",
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
        externalId: "cam-intake-1",
        label: "Intake Cam",
        location: null,
        adminStatus: options?.adminStatus ?? "active",
        connectivity: "unknown",
        lastHeartbeatAt: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      return { workspaceId, cameraId };
    });
  }

  function observationArgs(
    workspaceId: Id<"workspaces">,
    cameraId: Id<"cameras">,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      workspaceId,
      cameraId,
      sourceEventId: "evt-100",
      sourceNamespace: "model.v1",
      timestamp: "2026-08-29T12:00:00.000Z",
      category: "smoke",
      confidence: 0.81,
      modelVersion: "gemini-flash",
      detectorVersion: "cascade-1",
      ...overrides,
    };
  }

  it("is not exposed on the public api surface", () => {
    expect(Object.prototype.hasOwnProperty.call(api, "detections")).toBe(false);
  });

  it("rejects workspace/camera ownership mismatch before write", async () => {
    const t = createTestBackend();
    const a = await seedWorkspaceCamera(t);
    const b = await seedWorkspaceCamera(t);

    await expectApiError(
      t.mutation(internal.detections.acceptNormalized, {
        ...observationArgs(a.workspaceId, b.cameraId),
      }),
      { code: "NOT_FOUND" },
    );

    const detections = await t.run(async (ctx) => ctx.db.query("detections").collect());
    expect(detections).toHaveLength(0);
  });

  it("rejects disabled cameras", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await seedWorkspaceCamera(t, {
      adminStatus: "disabled",
    });
    await expectApiError(
      t.mutation(internal.detections.acceptNormalized, observationArgs(workspaceId, cameraId)),
      { code: "FORBIDDEN" },
    );
  });

  it("creates detection+incident on first accept with severity and audit", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await seedWorkspaceCamera(t);
    const result = await t.mutation(
      internal.detections.acceptNormalized,
      observationArgs(workspaceId, cameraId, {
        evidenceRefs: ["snapshot://frame-01"],
      }),
    );

    expect(result.disposition).toBe("created");
    expect(result.detectionId).toEqual(expect.any(String));
    expect(result.incidentId).toEqual(expect.any(String));
    expect(result.requestId.length).toBeGreaterThan(0);

    const incident = await t.run(async (ctx) => ctx.db.get(result.incidentId));
    expect(incident).toEqual(
      expect.objectContaining({
        state: "detected",
        severity: "high",
        severityRuleVersion: "sev-v2",
        category: "smoke",
        cameraId,
        workspaceId,
      }),
    );

    const detection = await t.run(async (ctx) => ctx.db.get(result.detectionId));
    expect(detection).toEqual(
      expect.objectContaining({
        confidence: 0.81,
        evidenceRefs: ["snapshot://frame-01"],
        modelVersion: "gemini-flash",
        detectorVersion: "cascade-1",
      }),
    );

    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("auditEntries")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
    );
    expect(audits.some((row) => row.action === "detection.accepted")).toBe(true);
  });

  it("groups within 45s window and creates new incident when late", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await seedWorkspaceCamera(t);

    const first = await t.mutation(
      internal.detections.acceptNormalized,
      observationArgs(workspaceId, cameraId, {
        sourceEventId: "evt-a",
        timestamp: "2026-08-29T12:00:00.000Z",
      }),
    );
    expect(first.disposition).toBe("created");

    const grouped = await t.mutation(
      internal.detections.acceptNormalized,
      observationArgs(workspaceId, cameraId, {
        sourceEventId: "evt-b",
        timestamp: "2026-08-29T12:00:45.000Z",
      }),
    );
    expect(grouped.disposition).toBe("grouped");
    expect(grouped.incidentId).toBe(first.incidentId);

    const late = await t.mutation(
      internal.detections.acceptNormalized,
      observationArgs(workspaceId, cameraId, {
        sourceEventId: "evt-c",
        // >45s after grouped lastObservedAt (12:00:45)
        timestamp: "2026-08-29T12:01:30.001Z",
      }),
    );
    expect(late.disposition).toBe("created");
    expect(late.incidentId).not.toBe(first.incidentId);

    const detections = await t.run(async (ctx) => ctx.db.query("detections").collect());
    expect(detections).toHaveLength(3);
  });

  it("replay returns duplicate disposition without new side effects", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await seedWorkspaceCamera(t);
    const args = observationArgs(workspaceId, cameraId);

    const first = await t.mutation(internal.detections.acceptNormalized, args);
    const replay = await t.mutation(internal.detections.acceptNormalized, args);

    expect(replay.disposition).toBe("duplicate");
    expect(replay.detectionId).toBe(first.detectionId);
    expect(replay.incidentId).toBe(first.incidentId);
    expect(replay.requestId).toBe(first.requestId);

    const detections = await t.run(async (ctx) => ctx.db.query("detections").collect());
    const incidents = await t.run(async (ctx) => ctx.db.query("incidents").collect());
    const audits = await t.run(async (ctx) => ctx.db.query("auditEntries").collect());
    expect(detections).toHaveLength(1);
    expect(incidents).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("same identity with different payload returns IDEMPOTENCY_CONFLICT", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await seedWorkspaceCamera(t);
    await t.mutation(
      internal.detections.acceptNormalized,
      observationArgs(workspaceId, cameraId, { confidence: 0.5 }),
    );
    await expectApiError(
      t.mutation(
        internal.detections.acceptNormalized,
        observationArgs(workspaceId, cameraId, { confidence: 0.9 }),
      ),
      { code: "IDEMPOTENCY_CONFLICT" },
    );
  });

  it("rejects privileged evidence refs and does not claim availability", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await seedWorkspaceCamera(t);
    await expectApiError(
      t.mutation(
        internal.detections.acceptNormalized,
        observationArgs(workspaceId, cameraId, {
          evidenceRefs: ["Authorization: Bearer leaked"],
        }),
      ),
      { code: "VALIDATION_ERROR" },
    );
  });
});

describe("detecciones de un incidente", () => {
  it("devuelve la evidencia y el analisis, no solo identificadores", async () => {
    // Es el motivo de que exista esta query: el panel recibia una lista de
    // cadenas y no podia ensenar ni el clip ni lo que vio el verificador.
    const t = createTestBackend();
    const { workspaceId, cameraId, adminIdentity } = await sembrarParaDetecciones(t);

    const aceptada = await t.mutation(internal.detections.acceptNormalized, {
      workspaceId,
      cameraId,
      sourceNamespace: "sentinel-vision",
      sourceEventId: "evt-detalle-1",
      timestamp: "2026-08-29T12:00:00Z",
      category: "violence",
      confidence: 0.91,
      modelVersion: "gemini",
      detectorVersion: "yolo",
      summary: "Dos personas forcejean junto a la estanteria.",
      evidenceRefs: ["https://cdn.ejemplo.com/clip.gif#image/gif"],
    });

    const pagina = await t
      .withIdentity(adminIdentity)
      .query(api.detections.listByIncident, { incidentId: aceptada.incidentId });

    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]?.summary).toContain("forcejean");
    expect(pagina.items[0]?.evidenceIds).toEqual(["https://cdn.ejemplo.com/clip.gif#image/gif"]);
    expect(pagina.items[0]?.confidence).toBeCloseTo(0.91);
  });

  it("sin sesion no devuelve nada", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await sembrarParaDetecciones(t);
    const aceptada = await t.mutation(internal.detections.acceptNormalized, {
      workspaceId,
      cameraId,
      sourceNamespace: "sentinel-vision",
      sourceEventId: "evt-detalle-2",
      timestamp: "2026-08-29T12:00:00Z",
      category: "violence",
      confidence: 0.9,
      modelVersion: "m",
      detectorVersion: "d",
    });

    await expect(
      t.query(api.detections.listByIncident, { incidentId: aceptada.incidentId }),
    ).rejects.toThrow();
  });

  it("un miembro de otro workspace no ve estas detecciones", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await sembrarParaDetecciones(t);
    await t.mutation(internal.seed.bootstrap, {
      adminTokenIdentifier: "issuer|admin-ajeno",
      adminSubjectId: "admin-ajeno",
      workspaceName: "Planta ajena",
    });
    const aceptada = await t.mutation(internal.detections.acceptNormalized, {
      workspaceId,
      cameraId,
      sourceNamespace: "sentinel-vision",
      sourceEventId: "evt-detalle-3",
      timestamp: "2026-08-29T12:00:00Z",
      category: "violence",
      confidence: 0.9,
      modelVersion: "m",
      detectorVersion: "d",
    });

    await expect(
      t
        .withIdentity({ tokenIdentifier: "issuer|admin-ajeno", subject: "admin-ajeno" })
        .query(api.detections.listByIncident, { incidentId: aceptada.incidentId }),
    ).rejects.toThrow();
  });

  it("un incidente borrado devuelve vacio en vez de reventar", async () => {
    // Un id con forma valida cuyo documento ya no esta. Convex rechaza los
    // ids malformados en el validador, asi que este es el caso que de verdad
    // llega al handler.
    const t = createTestBackend();
    const { workspaceId, cameraId, adminIdentity } = await sembrarParaDetecciones(t);
    const aceptada = await t.mutation(internal.detections.acceptNormalized, {
      workspaceId,
      cameraId,
      sourceNamespace: "sentinel-vision",
      sourceEventId: "evt-detalle-4",
      timestamp: "2026-08-29T12:00:00Z",
      category: "violence",
      confidence: 0.9,
      modelVersion: "m",
      detectorVersion: "d",
    });
    await t.run(async (ctx) => ctx.db.delete(aceptada.incidentId as Id<"incidents">));

    const pagina = await t
      .withIdentity(adminIdentity)
      .query(api.detections.listByIncident, { incidentId: aceptada.incidentId });
    expect(pagina.items).toHaveLength(0);
  });
});

async function sembrarParaDetecciones(t: ReturnType<typeof createTestBackend>) {
  const { workspaceId } = await t.mutation(internal.seed.bootstrap, {
    adminTokenIdentifier: "issuer|admin-det",
    adminSubjectId: "admin-det",
    workspaceName: "Planta detecciones",
  });
  const adminIdentity = { tokenIdentifier: "issuer|admin-det", subject: "admin-det" };
  const camara = await t.withIdentity(adminIdentity).mutation(api.cameras.create, {
    workspaceId: workspaceId as never,
    externalId: "cam-det",
    label: "Entrada",
  });
  return {
    workspaceId: workspaceId as never,
    cameraId: camara.id as never,
    adminIdentity,
  };
}
