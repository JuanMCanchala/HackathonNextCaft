import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createRequestId, isApiErrorData } from "./lib/errors";

/**
 * Adaptador HTTP para el servicio de vision.
 *
 * La spec de detection-intake pide un "authenticated internal adapter" delante
 * de la mutation interna, y no existia: `acceptNormalized` es `internalMutation`
 * y no habia router HTTP, asi que el pipeline de vision no tenia por donde
 * entrar.
 *
 * Autentica con un token de servicio (`INTAKE_SERVICE_TOKEN` en el entorno del
 * deployment), no con Clerk. Un navegador con sesion de Clerk no puede llamar
 * aqui, que es justo lo que exige la spec: el intake no es superficie publica.
 */

const CAMPOS_OBLIGATORIOS = [
  "workspaceId",
  "cameraId",
  "sourceEventId",
  "sourceNamespace",
  "timestamp",
  "category",
  "confidence",
  "modelVersion",
  "detectorVersion",
] as const;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rechazar(code: string, message: string, status: number, requestId: string) {
  return json({ error: { code, message, requestId } }, status);
}

/** Compara sin filtrar por tiempo si el token es correcto o no. */
function tokenValido(recibido: string, esperado: string): boolean {
  if (recibido.length !== esperado.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < recibido.length; i += 1) {
    diff |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diff === 0;
}

export const intake = httpAction(async (ctx, request) => {
  const requestId = createRequestId();

  const esperado = process.env.INTAKE_SERVICE_TOKEN;
  if (!esperado) {
    // Sin token configurado el endpoint queda cerrado, nunca abierto: es
    // preferible que el pipeline falle ruidosamente a dejar el intake sin
    // autenticar en un deployment real.
    return rechazar(
      "INTERNAL_ERROR",
      "INTAKE_SERVICE_TOKEN no esta configurado en el deployment",
      503,
      requestId,
    );
  }

  const cabecera = request.headers.get("Authorization") ?? "";
  const recibido = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  if (!recibido || !tokenValido(recibido, esperado)) {
    return rechazar("UNAUTHORIZED", "Token de servicio invalido", 401, requestId);
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return rechazar("VALIDATION_ERROR", "El cuerpo no es JSON valido", 400, requestId);
  }

  const faltan = CAMPOS_OBLIGATORIOS.filter(
    (campo) => cuerpo[campo] === undefined || cuerpo[campo] === null,
  );
  if (faltan.length > 0) {
    return rechazar(
      "VALIDATION_ERROR",
      `Faltan campos obligatorios: ${faltan.join(", ")}`,
      400,
      requestId,
    );
  }

  try {
    // `exactOptionalPropertyTypes` obliga a omitir las claves opcionales en vez
    // de pasarlas como undefined.
    const args = {
      workspaceId: cuerpo.workspaceId as Id<"workspaces">,
      cameraId: cuerpo.cameraId as Id<"cameras">,
      sourceEventId: String(cuerpo.sourceEventId),
      sourceNamespace: String(cuerpo.sourceNamespace),
      timestamp: String(cuerpo.timestamp),
      category: String(cuerpo.category),
      confidence: Number(cuerpo.confidence),
      modelVersion: String(cuerpo.modelVersion),
      detectorVersion: String(cuerpo.detectorVersion),
      ...(cuerpo.suggestedCategory !== undefined && {
        suggestedCategory: cuerpo.suggestedCategory as string | null,
      }),
      ...(Array.isArray(cuerpo.evidenceRefs) && {
        evidenceRefs: cuerpo.evidenceRefs as string[],
      }),
    };
    const resultado = await ctx.runMutation(internal.detections.acceptNormalized, args);
    return json(resultado, 200);
  } catch (error) {
    // Los errores de dominio ya vienen con su codigo; se respeta en vez de
    // aplanarlo todo a 500, para que el pipeline distinga un payload malo de
    // una caida del backend y sepa si merece la pena reintentar.
    const data = (error as { data?: unknown })?.data;
    if (isApiErrorData(data)) {
      const estado =
        data.code === "VALIDATION_ERROR"
          ? 400
          : data.code === "IDEMPOTENCY_CONFLICT"
            ? 409
            : data.code === "NOT_FOUND"
              ? 404
              : data.code === "FORBIDDEN"
                ? 403
                : 500;
      return json({ error: data }, estado);
    }
    return rechazar(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Fallo inesperado",
      500,
      requestId,
    );
  }
});

const http = httpRouter();

http.route({ path: "/intake", method: "POST", handler: intake });

export default http;
