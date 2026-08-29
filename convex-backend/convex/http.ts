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

const SEVERIDAD_COLOR: Record<string, string> = {
  critical: "#ff5a4a",
  high: "#f0a04b",
  medium: "#5aa9ff",
  low: "#4dd4ac",
};

function escapar(texto: string): string {
  return texto.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function pagina(filas: Array<Record<string, unknown>> | null): string {
  const cuerpo =
    filas === null
      ? `<p class="vacio">Esta vista no esta habilitada en este deployment.</p>`
      : filas.length === 0
        ? `<p class="vacio">Todavia no hay incidentes registrados.</p>`
        : filas
            .map((f) => {
              const sev = String(f.severity);
              const color = SEVERIDAD_COLOR[sev] ?? "#8b95a3";
              const cuando = new Date(Number(f.openedAt)).toLocaleString("es-ES");
              return `<tr>
  <td><span class="sev" style="--c:${color}">${escapar(sev)}</span></td>
  <td class="cat">${escapar(String(f.category))}</td>
  <td>${escapar(String(f.camera))}</td>
  <td>${escapar(String(f.state))}</td>
  <td class="t">${escapar(cuando)}</td>
</tr>`;
            })
            .join("\n");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sentinel — incidentes registrados</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0b0d10;color:#e8ebef;
 font:14px/1.5 Inter,-apple-system,Segoe UI,Roboto,sans-serif;padding:32px 20px}
main{max-width:820px;margin:0 auto}
h1{font-size:19px;margin:0 0 4px;letter-spacing:-.01em}
p.sub{margin:0 0 22px;color:#5d6673;font-size:12.5px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:10px;letter-spacing:.07em;text-transform:uppercase;
 color:#5d6673;font-weight:600;padding:0 10px 8px;border-bottom:1px solid #232830}
td{padding:11px 10px;border-bottom:1px solid #1b2027;vertical-align:middle}
.sev{display:inline-block;padding:2px 9px;border-radius:5px;font-size:10.5px;
 font-weight:650;text-transform:uppercase;letter-spacing:.04em;
 color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);
 border:1px solid color-mix(in srgb,var(--c) 35%,transparent)}
.cat{font-weight:550}
.t{color:#8b95a3;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;
 white-space:nowrap}
.vacio{color:#5d6673;padding:36px 0;text-align:center}
footer{margin-top:26px;color:#3d4550;font-size:11px}
</style></head>
<body><main>
<h1>Incidentes registrados</h1>
<p class="sub">Confirmados por el analisis de video y guardados en Convex. Vista publica de solo lectura.</p>
<table>
<thead><tr><th>severidad</th><th>tipo</th><th>camara</th><th>estado</th><th>detectado</th></tr></thead>
<tbody>
${cuerpo}
</tbody></table>
<footer>Severidad segun la regla sev-v2. Solo llegan aqui los incidentes que el
verificador confirma; las sospechas descartadas no se registran.</footer>
</main></body></html>`;
}

/**
 * Vista publica de la demo. El dashboard de Convex exige sesion de equipo y
 * responde 404 a quien no la tiene, asi que no sirve como link para ensenar.
 * Esta pagina no expone identificadores internos ni datos de persona, y solo
 * responde para el workspace declarado en `DEMO_PUBLIC_WORKSPACE_ID`.
 */
export const demo = httpAction(async (ctx, request) => {
  const filas = await ctx.runQuery(internal.demo.publicIncidents, { limit: 30 });

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") {
    return json({ incidents: filas ?? [] }, filas === null ? 404 : 200);
  }
  return new Response(pagina(filas), {
    status: filas === null ? 404 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

const http = httpRouter();

http.route({ path: "/intake", method: "POST", handler: intake });
http.route({ path: "/demo", method: "GET", handler: demo });

export default http;
