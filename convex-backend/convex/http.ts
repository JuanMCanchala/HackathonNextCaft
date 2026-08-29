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

const MAX_EVIDENCIA_BYTES = 5 * 1024 * 1024;
const TIPOS_EVIDENCIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Guarda un fotograma del incidente y devuelve una URL publica.
 *
 * El pipeline ya adjuntaba `evidenceRefs`, pero apuntaban a su propio
 * `PUBLIC_BASE_URL`, es decir al portatil que corre el analisis. Un correo de
 * aviso abierto en un movil no puede alcanzar esa direccion, asi que la imagen
 * no se veia. Subirla aqui la deja en un dominio publico y estable.
 *
 * Misma autenticacion que el intake: es el mismo servicio quien escribe.
 */
export const evidence = httpAction(async (ctx, request) => {
  const requestId = createRequestId();

  const esperado = process.env.INTAKE_SERVICE_TOKEN;
  if (!esperado) {
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

  const tipo = request.headers.get("Content-Type") ?? "";
  if (!TIPOS_EVIDENCIA.has(tipo)) {
    return rechazar("VALIDATION_ERROR", `Tipo no admitido: ${tipo}`, 400, requestId);
  }

  const blob = await request.blob();
  if (blob.size === 0 || blob.size > MAX_EVIDENCIA_BYTES) {
    return rechazar(
      "VALIDATION_ERROR",
      `Tamano fuera de rango: ${blob.size} bytes`,
      400,
      requestId,
    );
  }

  const storageId = await ctx.storage.store(blob);
  const url = await ctx.storage.getUrl(storageId);
  return json({ storageId, url }, 200);
});

const ETIQUETA_TIPO: Record<string, string> = {
  violence: "Agresion",
  fall: "Caida",
  smoke: "Humo",
  intrusion: "Intrusion",
  theft: "Robo",
  ppe_missing: "Falta de equipo de proteccion",
};

/**
 * Ficha de un incidente. Es el destino del enlace del correo de aviso, asi que
 * tiene que abrir bien en un movil y sin sesion: quien recibe el aviso puede
 * estar de guardia y sin acceso al panel interno.
 */
function paginaIncidente(d: Record<string, unknown> | null): string {
  if (d === null) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Incidente no disponible</title></head>
<body style="margin:0;background:#0b0d10;color:#5d6673;font:14px system-ui;
 display:flex;align-items:center;justify-content:center;height:100vh">
<p>Este incidente no esta disponible.</p></body></html>`;
  }

  const sev = String(d.severity);
  const color = SEVERIDAD_COLOR[sev] ?? "#8b95a3";
  const tipo = ETIQUETA_TIPO[String(d.category)] ?? String(d.category);
  const abierto = new Date(Number(d.openedAt)).toLocaleString("es-ES");
  const visto = new Date(Number(d.lastObservedAt)).toLocaleString("es-ES");
  const clip = d.clipUrl === null ? null : String(d.clipUrl);
  const conf = d.confidence === null ? null : Math.round(Number(d.confidence) * 100);

  const avisos = (d.alerts as Array<{ type: string; createdAt: number }>) ?? [];
  const listaAvisos =
    avisos.length === 0
      ? `<li class="off">Sin avisos enviados</li>`
      : avisos
          .map((a) => {
            const cuando = new Date(a.createdAt).toLocaleTimeString("es-ES");
            const texto =
              a.type === "alert.sent"
                ? "Aviso enviado"
                : a.type === "alert.failed"
                  ? "Aviso fallido"
                  : "Aviso omitido";
            return `<li><span class="pt" style="--c:${a.type === "alert.sent" ? "#4dd4ac" : "#f0a04b"}"></span>${escapar(texto)} <em>${escapar(cuando)}</em></li>`;
          })
          .join("");

  const dato = (k: string, v: string) =>
    `<div class="d"><span>${escapar(k)}</span><strong>${escapar(v)}</strong></div>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(tipo)} en ${escapar(String(d.camera))}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#080a0c;color:#e8ebef;
 font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
 padding:28px 16px 60px}
main{max-width:600px;margin:0 auto}
.badge{display:inline-block;padding:4px 11px;border-radius:6px;font-size:10.5px;
 font-weight:700;letter-spacing:.08em;text-transform:uppercase;
 color:${color};background:color-mix(in srgb,${color} 14%,transparent);
 border:1px solid color-mix(in srgb,${color} 38%,transparent)}
h1{font-size:26px;margin:14px 0 4px;letter-spacing:-.02em;line-height:1.2}
.sub{color:#7d8794;font-size:13.5px;margin:0 0 22px}
.clip{width:100%;border-radius:12px;border:1px solid #1e242c;display:block;
 background:#0b0d10}
.nota{color:#5d6673;font-size:12px;margin:10px 0 0;text-align:center}
.panel{background:#0d1014;border:1px solid #1a1f26;border-radius:12px;
 padding:6px 18px;margin:22px 0}
.d{display:flex;justify-content:space-between;align-items:center;gap:16px;
 padding:12px 0;border-bottom:1px solid #161b21}
.d:last-child{border-bottom:0}
.d span{color:#6b7482;font-size:12.5px}
.d strong{font-weight:600;font-size:13.5px;text-align:right}
h2{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#5d6673;
 margin:26px 0 10px;font-weight:600}
ul{list-style:none;padding:0;margin:0}
li{padding:9px 0;border-bottom:1px solid #161b21;font-size:13px;
 display:flex;align-items:center;gap:9px}
li:last-child{border-bottom:0}
li em{color:#5d6673;font-style:normal;font-size:12px;margin-left:auto;
 font-family:ui-monospace,Consolas,monospace}
li.off{color:#5d6673}
.pt{width:7px;height:7px;border-radius:50%;background:var(--c);flex:none}
.volver{display:inline-block;margin-top:26px;color:#5aa9ff;text-decoration:none;
 font-size:13px}
footer{margin-top:30px;color:#39414c;font-size:11.5px;line-height:1.6}
</style></head>
<body><main>
<span class="badge">${escapar(sev)}</span>
<h1>${escapar(tipo)}</h1>
<p class="sub">Camara ${escapar(String(d.camera))} &middot; ${escapar(abierto)}</p>
${
  clip === null
    ? `<div class="panel" style="text-align:center;padding:44px 18px;color:#5d6673">Sin clip disponible</div>`
    : `<img class="clip" src="${escapar(clip)}" alt="Clip del incidente">
       <p class="nota">Clip del momento de la deteccion, en bucle</p>`
}
<div class="panel">
  ${dato("Tipo", tipo)}
  ${dato("Camara", String(d.camera))}
  ${d.suggestedCategory === null ? "" : dato("Veredicto del modelo", String(d.suggestedCategory))}
  ${conf === null ? "" : dato("Confianza", `${conf}%`)}
  ${dato("Estado", String(d.state))}
  ${dato("Abierto", abierto)}
  ${dato("Ultima observacion", visto)}
  ${dato("Observaciones agrupadas", String(d.observations))}
</div>
<h2>Avisos</h2>
<ul>${listaAvisos}</ul>
<a class="volver" href="/demo">Ver todos los incidentes</a>
<footer>Severidad segun la regla ${escapar(String(d.severityRuleVersion))}.
Solo se registran los incidentes que el verificador confirma; las sospechas
descartadas no llegan hasta aqui.</footer>
</main></body></html>`;
}

/** Ficha publica de un incidente: es a donde lleva el correo de aviso. */
export const demoIncidente = httpAction(async (ctx, request) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const datos =
    id === ""
      ? null
      : await ctx.runQuery(internal.demo.publicIncident, {
          incidentId: id,
        });
  return new Response(paginaIncidente(datos), {
    status: datos === null ? 404 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

const http = httpRouter();

http.route({ path: "/intake", method: "POST", handler: intake });
http.route({ path: "/demo", method: "GET", handler: demo });
http.route({ path: "/evidence", method: "POST", handler: evidence });
http.route({ path: "/incidente", method: "GET", handler: demoIncidente });

export default http;
