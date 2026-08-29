import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createTestBackend, type SentraTest } from "../helpers/convexHarness";

/**
 * La vista publica existe para poder ensenar incidentes sin sesion de equipo.
 * Precisamente por eso hay que acotarla: solo el workspace declarado, solo
 * lectura y sin identificadores internos.
 */

async function sembrar(t: SentraTest) {
  const { workspaceId } = await t.mutation(internal.seed.bootstrap, {
    adminTokenIdentifier: "issuer|admin-demo",
    adminSubjectId: "admin-demo",
    workspaceName: "Demo",
  });
  const camara = await t
    .withIdentity({ tokenIdentifier: "issuer|admin-demo", subject: "admin-demo" })
    .mutation(api.cameras.create, {
      workspaceId: workspaceId as Id<"workspaces">,
      externalId: "cam-demo",
      label: "Entrada",
    });
  await t.mutation(internal.detections.acceptNormalized, {
    workspaceId: workspaceId as Id<"workspaces">,
    cameraId: camara.id as Id<"cameras">,
    sourceNamespace: "sentinel-vision",
    sourceEventId: "evt-demo-1",
    timestamp: "2026-08-29T12:00:00Z",
    category: "violence",
    confidence: 0.9,
    modelVersion: "m",
    detectorVersion: "d",
  });
  return workspaceId as string;
}

describe("vista publica de demo", () => {
  afterEach(() => {
    delete process.env.DEMO_PUBLIC_WORKSPACE_ID;
  });

  it("responde 404 si el deployment no la habilita", async () => {
    const t = createTestBackend();
    await sembrar(t);
    const res = await t.fetch("/demo", { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("solo devuelve incidentes del workspace declarado", async () => {
    // Habilitar la vista para un workspace no puede asomar los de otro: la
    // consulta solo mira el que declara el deployment.
    const t = createTestBackend();
    const conDatos = await sembrar(t);
    const { workspaceId: otro } = await t.mutation(internal.seed.bootstrap, {
      adminTokenIdentifier: "issuer|admin-otro",
      adminSubjectId: "admin-otro",
      workspaceName: "Otro",
    });
    expect(otro).not.toBe(conDatos);

    process.env.DEMO_PUBLIC_WORKSPACE_ID = otro as string;
    const res = await t.fetch("/demo?format=json", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { incidents: unknown[] };
    expect(body.incidents).toHaveLength(0);
  });

  it("devuelve los incidentes del workspace declarado", async () => {
    const t = createTestBackend();
    const workspaceId = await sembrar(t);
    process.env.DEMO_PUBLIC_WORKSPACE_ID = workspaceId;

    const res = await t.fetch("/demo?format=json", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { incidents: Array<Record<string, unknown>> };
    expect(body.incidents).toHaveLength(1);
    const [incidente] = body.incidents;
    expect(incidente?.category).toBe("violence");
    expect(incidente?.severity).toBe("critical");
    expect(incidente?.camera).toBe("Entrada");
  });

  it("no expone identificadores internos", async () => {
    const t = createTestBackend();
    const workspaceId = await sembrar(t);
    process.env.DEMO_PUBLIC_WORKSPACE_ID = workspaceId;

    const res = await t.fetch("/demo?format=json", { method: "GET" });
    const body = (await res.json()) as { incidents: Array<Record<string, unknown>> };
    const claves = Object.keys(body.incidents[0] ?? {});
    for (const prohibida of ["_id", "workspaceId", "cameraId", "assignedTo"]) {
      expect(claves).not.toContain(prohibida);
    }
  });

  it("sirve HTML cuando no se pide JSON", async () => {
    const t = createTestBackend();
    const workspaceId = await sembrar(t);
    process.env.DEMO_PUBLIC_WORKSPACE_ID = workspaceId;

    const res = await t.fetch("/demo", { method: "GET" });
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain("Incidentes registrados");
  });
});
