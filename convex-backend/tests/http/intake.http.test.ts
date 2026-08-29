import { convexTest } from "convex-test";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "../helpers/convexHarness";

/**
 * El adaptador HTTP es la unica puerta de entrada del servicio de vision, y la
 * spec de detection-intake exige dos cosas de el: que autentique al servicio
 * interno y que NO sea superficie llamable desde un navegador. Estos casos
 * cubren ambas, mas la propagacion de los errores de dominio.
 */

const TOKEN = "token-de-servicio-para-pruebas";

type RespuestaIntake = {
  detectionId: string;
  incidentId: string;
  disposition: "created" | "grouped" | "duplicate";
  requestId: string;
};

type RespuestaError = { error: { code: string; message?: string } };

async function leer<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function peticion(cuerpo: unknown, token: string | null = TOKEN): RequestInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }
  return { method: "POST", headers, body: JSON.stringify(cuerpo) };
}

async function sembrar(t: ReturnType<typeof convexTest>) {
  const { workspaceId } = await t.mutation(internal.seed.bootstrap, {
    adminTokenIdentifier: "issuer|admin-http",
    adminSubjectId: "admin-http",
    workspaceName: "Planta HTTP",
  });
  const camara = await t
    .withIdentity({ tokenIdentifier: "issuer|admin-http", subject: "admin-http" })
    .mutation(api.cameras.create, {
      workspaceId: workspaceId as Id<"workspaces">,
      externalId: "cam-http-1",
      label: "Entrada",
    });
  return { workspaceId, cameraId: camara.id };
}

function observacion(workspaceId: unknown, cameraId: unknown, extra: object = {}) {
  return {
    workspaceId,
    cameraId,
    sourceNamespace: "sentinel-vision",
    sourceEventId: "evt-http-1",
    timestamp: "2026-08-29T12:00:00Z",
    category: "theft",
    confidence: 0.83,
    modelVersion: "gemini-3.5-flash-lite",
    detectorVersion: "yolo11n-pose.pt@480",
    ...extra,
  };
}

describe("adaptador HTTP de intake", () => {
  beforeEach(() => {
    process.env.INTAKE_SERVICE_TOKEN = TOKEN;
  });

  it("rechaza sin token de servicio", async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch("/intake", peticion({}, null));
    expect(res.status).toBe(401);
  });

  it("rechaza con un token que no es el correcto", async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch("/intake", peticion({}, "token-equivocado"));
    expect(res.status).toBe(401);
  });

  it("queda cerrado si el deployment no tiene token configurado", async () => {
    // Fallar cerrado importa: un deployment mal configurado no puede acabar
    // con el intake abierto a cualquiera.
    delete process.env.INTAKE_SERVICE_TOKEN;
    const t = convexTest(schema, modules);
    const res = await t.fetch("/intake", peticion({}));
    expect(res.status).toBe(503);
  });

  it("rechaza cuando faltan campos obligatorios", async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch("/intake", peticion({ sourceEventId: "solo-esto" }));
    expect(res.status).toBe(400);
    const body = await leer<RespuestaError>(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("acepta una observacion valida y devuelve la disposicion", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, cameraId } = await sembrar(t);

    const res = await t.fetch("/intake", peticion(observacion(workspaceId, cameraId)));
    expect(res.status).toBe(200);
    const body = await leer<RespuestaIntake>(res);
    expect(body.disposition).toBe("created");
    expect(body.detectionId).toEqual(expect.any(String));
    expect(body.incidentId).toEqual(expect.any(String));
  });

  it("es idempotente ante un reenvio del mismo evento", async () => {
    // El pipeline reintenta usando el id del evento, asi que un reenvio no
    // puede crear un segundo incidente.
    const t = convexTest(schema, modules);
    const { workspaceId, cameraId } = await sembrar(t);

    const primero = await leer<RespuestaIntake>(
      await t.fetch("/intake", peticion(observacion(workspaceId, cameraId))),
    );
    const segundo = await leer<RespuestaIntake>(
      await t.fetch("/intake", peticion(observacion(workspaceId, cameraId))),
    );

    expect(segundo.detectionId).toBe(primero.detectionId);
    expect(segundo.incidentId).toBe(primero.incidentId);
    expect(segundo.disposition).toBe("duplicate");
  });

  it("propaga el codigo de dominio cuando la categoria no existe", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, cameraId } = await sembrar(t);

    const res = await t.fetch(
      "/intake",
      peticion(observacion(workspaceId, cameraId, { category: "inventada" })),
    );
    expect(res.status).toBe(400);
    const body = await leer<RespuestaError>(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
