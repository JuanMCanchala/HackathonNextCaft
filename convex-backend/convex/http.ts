import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createRequestId, isApiErrorData } from "./lib/errors";
import { MAX_PREGUNTA, preguntar } from "./lib/ai/ask";

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
      ...(cuerpo.summary !== undefined && {
        summary: cuerpo.summary as string | null,
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

function escapar(texto: string): string {
  return texto.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/**
 * Las paginas publicas usan el mismo sistema de diseno que el panel de
 * Angular: los tokens `--sentra-*` de `frontend/src/styles.css`, sus tres
 * familias tipograficas y su escala de severidad.
 *
 * Se copian los valores en vez de importar la hoja porque estas paginas las
 * sirve Convex y el panel vive en otro dominio. La regla practica es que si
 * un token cambia en `styles.css`, cambia aqui: el objetivo es que quien
 * llega desde un correo no note que ha cruzado de un sistema a otro.
 */
const SENTRA_TOKENS = `
:root{
  color-scheme:dark;
  --void:#0a0e17;
  --panel:#111827;
  --panel-2:#161f33;
  --line:#232e47;
  --line-bright:#2f3d5e;
  --text-hi:#e9edf6;
  --text-mid:#a6b0c8;
  --text-low:#5c6884;
  --cyan:#22e0ff;
  --cyan-dim:rgba(34,224,255,.14);
  --ok:#2fe08a;
  --warn:#ffb020;
  --radius:6px;
  --radius-lg:10px;
  --shadow:0 1px 0 rgba(255,255,255,.04),0 8px 24px rgba(0,0,0,.35);
  --display:'Space Grotesk',system-ui,sans-serif;
  --body:'IBM Plex Sans',system-ui,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--void);color:var(--text-hi);
  font:400 15px/1.6 var(--body);padding:0 0 72px}
a{color:inherit}
.panel{background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius-lg);box-shadow:var(--shadow)}

/* Barra superior: la misma identidad que la cabecera del panel, para que
   quien llega desde un correo sepa que sigue dentro de Sentra. */
.topbar{border-bottom:1px solid var(--line);background:var(--panel);
  position:sticky;top:0;z-index:5}
.topbar .fila{max-width:1240px;margin:0 auto;padding:0 20px;height:56px;
  display:flex;align-items:center;gap:14px}
.logo{display:flex;align-items:center;gap:9px;font:600 15px/1 var(--display);
  letter-spacing:.02em;color:var(--text-hi);text-decoration:none}
.logo .glifo{width:22px;height:22px;border-radius:var(--radius);flex:none;
  background:linear-gradient(140deg,var(--cyan),#1789c7);
  box-shadow:0 0 0 1px rgba(34,224,255,.35)}
.logo b{font-weight:600}
.logo em{font:400 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;
  color:var(--text-low);font-style:normal;padding-left:10px;margin-left:2px;
  border-left:1px solid var(--line)}
.topbar .crece{flex:1}
.accion{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;
  border-radius:var(--radius);border:1px solid var(--line-bright);
  background:transparent;color:var(--text-mid);text-decoration:none;
  font:500 12.5px/1 var(--body);white-space:nowrap;
  transition:border-color .16s ease,color .16s ease,background .16s ease}
.accion:hover,.accion:focus-visible{border-color:var(--cyan);color:var(--cyan);
  background:var(--cyan-dim)}
.accion.principal{border-color:var(--cyan);color:#0a0e17;background:var(--cyan);
  font-weight:600}
.accion.principal:hover{opacity:.88;background:var(--cyan);color:#0a0e17}
@media (max-width:620px){.logo em{display:none}}

.envoltura{max-width:1240px;margin:0 auto;padding:0 20px}
a:focus-visible,button:focus-visible,input:focus-visible,video:focus-visible{
  outline:2px solid var(--cyan);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const FUENTES = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;

/** La escala de severidad del panel, no una inventada aparte. */
const SEVERIDAD_SENTRA: Record<string, { color: string; texto: string }> = {
  critical: { color: "#ff4d5e", texto: "Critico" },
  high: { color: "#ff8c42", texto: "Alto" },
  medium: { color: "#ffb020", texto: "Medio" },
  low: { color: "#6b7a99", texto: "Bajo" },
};

const ETIQUETA_TIPO: Record<string, string> = {
  violence: "Agresion",
  fall: "Caida",
  smoke: "Humo",
  intrusion: "Intrusion",
  theft: "Robo",
  ppe_missing: "Falta de equipo de proteccion",
};

function panelUrl(): string | null {
  return process.env.PANEL_URL ?? null;
}

/** Cabecera compartida por las dos paginas publicas. */
function barra(volverALista: boolean): string {
  const panel = panelUrl();
  return `<div class="topbar"><div class="fila">
  <a class="logo" href="/demo"><span class="glifo"></span><b>SENTRA</b>
    <em>Deteccion de incidentes</em></a>
  <span class="crece"></span>
  ${volverALista ? `<a class="accion" href="/demo">Todos los incidentes</a>` : ""}
  ${panel === null ? "" : `<a class="accion principal" href="${escapar(panel)}">Abrir el panel</a>`}
</div></div>`;
}

function pagina(filas: Array<Record<string, unknown>> | null): string {
  const cuerpo =
    filas === null
      ? `<tr><td colspan="5" class="vacio">Esta vista no esta habilitada en este deployment.</td></tr>`
      : filas.length === 0
        ? `<tr><td colspan="5" class="vacio">Todavia no hay incidentes registrados.</td></tr>`
        : filas
            .map((f) => {
              const sev = String(f.severity);
              const paleta = SEVERIDAD_SENTRA[sev] ?? { color: "#6b7a99", texto: sev };
              const tipo = ETIQUETA_TIPO[String(f.category)] ?? String(f.category);
              const cuando = new Date(Number(f.openedAt)).toLocaleString("es-ES", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
              const id = f.id === undefined ? null : String(f.id);
              // Toda la fila es el enlace: en una tabla de incidentes, tener
              // que apuntar a una palabra concreta para abrir uno es friccion
              // que nadie quiere a las tres de la manana.
              const abrir = (dentro: string) =>
                id === null ? dentro : `<a href="/incidente?id=${escapar(id)}">${dentro}</a>`;
              return `<tr${id === null ? "" : ' class="clicable"'}>
  <td>${abrir(`<span class="sev" style="--c:${paleta.color}">${escapar(paleta.texto)}</span>`)}</td>
  <td class="cat">${abrir(escapar(tipo))}</td>
  <td>${abrir(escapar(String(f.camera)))}</td>
  <td class="estado">${abrir(escapar(String(f.state)))}</td>
  <td class="t">${abrir(escapar(cuando))}</td>
</tr>`;
            })
            .join("\n");

  const total = filas === null ? 0 : filas.length;
  const criticos =
    filas === null ? 0 : filas.filter((f) => String(f.severity) === "critical").length;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sentra — incidentes registrados</title>
${FUENTES}
<style>
${SENTRA_TOKENS}
main{max-width:1240px;margin:0 auto;padding:34px 20px}
h1{font:600 26px/1.15 var(--display);letter-spacing:-.02em;margin:0 0 6px}
p.sub{margin:0 0 26px;color:var(--text-mid);font-size:14px}
.kpis{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
 margin:0 0 26px}
.kpi{padding:16px 18px}
.kpi dt{margin:0 0 6px;font:500 10.5px/1 var(--mono);letter-spacing:.14em;
 text-transform:uppercase;color:var(--text-low)}
.kpi dd{margin:0;font:600 27px/1 var(--display);letter-spacing:-.02em}
.tabla{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px;min-width:620px}
th{text-align:left;font:500 10.5px/1 var(--mono);letter-spacing:.14em;
 text-transform:uppercase;color:var(--text-low);padding:0 14px 12px;
 border-bottom:1px solid var(--line)}
td{padding:0;border-bottom:1px solid var(--line)}
td a{display:block;padding:14px;text-decoration:none;color:inherit}
tr.clicable:hover td{background:var(--panel-2)}
.sev{display:inline-block;padding:3px 9px;border-radius:var(--radius);
 font:600 10.5px/1.5 var(--mono);text-transform:uppercase;letter-spacing:.06em;
 color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);
 border:1px solid color-mix(in srgb,var(--c) 34%,transparent)}
.cat a{font-weight:600}
.estado a{color:var(--text-mid);font-family:var(--mono);font-size:12.5px}
.t a{color:var(--text-low);font-family:var(--mono);font-size:12.5px;white-space:nowrap}
.vacio{padding:44px 14px;text-align:center;color:var(--text-low)}
footer{margin-top:26px;color:var(--text-low);font-size:12px;line-height:1.6}
</style></head>
<body>
${barra(false)}
<main>
<h1>Incidentes registrados</h1>
<p class="sub">Confirmados por el analisis de video. Vista publica de solo lectura.</p>
<dl class="kpis">
  <div class="kpi panel"><dt>Incidentes</dt><dd>${total}</dd></div>
  <div class="kpi panel"><dt>Criticos</dt><dd style="color:#ff4d5e">${criticos}</dd></div>
  <div class="kpi panel"><dt>Regla de severidad</dt><dd style="font-size:19px">sev-v2</dd></div>
</dl>
<div class="tabla panel" style="padding:16px 4px 4px">
<table>
<thead><tr><th>Severidad</th><th>Tipo</th><th>Camara</th><th>Estado</th><th>Detectado</th></tr></thead>
<tbody>
${cuerpo}
</tbody></table>
</div>
<footer>Solo llegan aqui los incidentes que el verificador confirma; las
sospechas descartadas no se registran. Pulsa cualquier fila para ver el clip y
el analisis de la escena.</footer>
</main></body></html>`;
}

function paginaIncidente(d: Record<string, unknown> | null, id: string): string {
  if (d === null) {
    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sentra — incidente no disponible</title>
${FUENTES}
<style>${SENTRA_TOKENS}
main{max-width:520px;margin:0 auto;padding:90px 20px;text-align:center}
h1{font:600 21px/1.2 var(--display);margin:0 0 8px}
p{color:var(--text-mid);margin:0 0 24px}
</style></head><body>
${barra(true)}
<main><h1>Este incidente no esta disponible</h1>
<p>Puede que se haya retirado o que el enlace no sea correcto.</p>
<a class="accion" href="/demo">Ver los incidentes registrados</a></main>
</body></html>`;
  }

  const sev = String(d.severity);
  const paleta = SEVERIDAD_SENTRA[sev] ?? { color: "#6b7a99", texto: sev };
  const tipo = ETIQUETA_TIPO[String(d.category)] ?? String(d.category);
  const abre = new Date(Number(d.openedAt));
  const visto = new Date(Number(d.lastObservedAt));
  const clip = d.clipUrl === null || d.clipUrl === undefined ? null : String(d.clipUrl);
  const still = d.stillUrl === null || d.stillUrl === undefined ? null : String(d.stillUrl);
  const conf = d.confidence === null ? null : Math.round(Number(d.confidence) * 100);
  const resumen = d.summary === null || d.summary === undefined ? null : String(d.summary);
  const camara = String(d.camera);

  const reloj = (f: Date) => f.toLocaleTimeString("es-ES", { hour12: false });
  const dia = abre.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const avisos = (d.alerts as Array<{ type: string; createdAt: number }>) ?? [];
  const listaAvisos =
    avisos.length === 0
      ? `<li class="vacio">Sin avisos enviados</li>`
      : avisos
          .map((a) => {
            const ok = a.type === "alert.sent";
            const texto = ok
              ? "Aviso entregado"
              : a.type === "alert.failed"
                ? "Aviso fallido"
                : "Aviso omitido";
            return `<li><i class="pt" style="--c:${ok ? "#2fe08a" : "#ffb020"}"></i>
              <span>${escapar(texto)}</span>
              <time>${escapar(reloj(new Date(a.createdAt)))}</time></li>`;
          })
          .join("");

  const dato = (k: string, v: string) =>
    `<div class="dato"><dt>${escapar(k)}</dt><dd>${escapar(v)}</dd></div>`;

  const media =
    clip !== null
      ? `<video src="${escapar(clip)}" controls autoplay muted loop playsinline
                ${still === null ? "" : `poster="${escapar(still)}"`}></video>`
      : still !== null
        ? `<img src="${escapar(still)}" alt="Momento de la deteccion">`
        : `<div class="sinclip">Sin grabacion para este incidente</div>`;

  const bloqueResumen =
    resumen === null
      ? `<div class="lectura vacia">
           <p class="eyebrow">Analisis de la escena</p>
           <p class="cuerpo-texto">Este incidente se registro antes de que el sistema
           guardara la descripcion del verificador.</p>
         </div>`
      : `<div class="lectura">
           <p class="eyebrow">Analisis de la escena</p>
           <p class="cuerpo-texto">${escapar(resumen)}</p>
           <p class="firma">Verificado por Gemini${conf === null ? "" : ` &middot; confianza ${conf}%`}</p>
         </div>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sentra — ${escapar(tipo)} en ${escapar(camara)}</title>
${FUENTES}
<style>
${SENTRA_TOKENS}
:root{--sev:${paleta.color}}
main{max-width:1240px;margin:0 auto;padding:0 20px}
header{padding:30px 0 24px}
.tag{display:inline-flex;align-items:center;gap:8px;font:600 10.5px/1 var(--mono);
  letter-spacing:.15em;text-transform:uppercase;color:var(--sev)}
.tag i{width:7px;height:7px;border-radius:50%;background:currentColor;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--sev) 20%,transparent)}
h1{font:600 clamp(30px,5.6vw,46px)/1.02 var(--display);letter-spacing:-.03em;
  margin:14px 0 10px}
.donde{font:400 13.5px/1.5 var(--mono);color:var(--text-mid);margin:0;
  display:flex;flex-wrap:wrap;gap:6px 14px}
.donde b{color:var(--text-hi);font-weight:500}

.cuerpo{display:grid;gap:20px;grid-template-columns:1fr;align-items:start}
@media (min-width:940px){
  .cuerpo{grid-template-columns:minmax(0,1.75fr) minmax(310px,1fr);gap:26px}
  header{padding:40px 0 28px}
}
.columna{display:grid;gap:20px;min-width:0}

.visor{background:#000;border:1px solid var(--line);border-radius:var(--radius-lg);
  overflow:hidden;box-shadow:var(--shadow)}
.osd{display:flex;justify-content:space-between;align-items:center;
  padding:11px 14px;background:#000;border-bottom:1px solid var(--line);
  font:500 10.5px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase}
.osd .id{color:var(--text-low)}
.osd .hora{color:var(--text-mid)}
.visor video,.visor img{display:block;width:100%;height:auto;background:#000}
.sinclip{padding:80px 20px;text-align:center;color:var(--text-low);
  font:400 13.5px/1.5 var(--mono)}

.eyebrow{margin:0 0 10px;font:500 10.5px/1 var(--mono);letter-spacing:.15em;
  text-transform:uppercase;color:var(--text-low)}
.lectura{background:var(--panel);border:1px solid var(--line);
  border-left:3px solid var(--sev);border-radius:var(--radius-lg);padding:20px 22px;
  box-shadow:var(--shadow)}
.cuerpo-texto{margin:0;font:400 clamp(15.5px,1.5vw,17px)/1.65 var(--body);
  color:var(--text-hi);max-width:64ch}
.lectura.vacia .cuerpo-texto{color:var(--text-low);font-size:14.5px}
.firma{margin:14px 0 0;font:400 11.5px/1 var(--mono);color:var(--text-low);
  letter-spacing:.04em}

.consulta{background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius-lg);padding:20px 22px;box-shadow:var(--shadow)}
.fila{display:flex;gap:10px;flex-wrap:wrap}
.fila input{flex:1 1 220px;min-width:0;background:var(--panel-2);
  border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;
  color:var(--text-hi);font:400 14.5px/1.3 var(--body)}
.fila input::placeholder{color:var(--text-low)}
.fila input:focus{outline:none;border-color:var(--cyan)}
.fila button{background:var(--cyan);color:#0a0e17;border:0;border-radius:var(--radius);
  padding:12px 20px;font:600 14px/1.3 var(--body);cursor:pointer;
  transition:opacity .16s ease}
.fila button:hover{opacity:.86}
.fila button:disabled{opacity:.4;cursor:default}
.sugerencias{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.sugerencias button{background:transparent;border:1px solid var(--line);
  border-radius:999px;padding:7px 13px;color:var(--text-mid);
  font:400 12.5px/1 var(--body);cursor:pointer;transition:border-color .16s ease}
.sugerencias button:hover{border-color:var(--cyan);color:var(--cyan)}
#hilo{margin:18px 0 0;display:grid;gap:14px}
#hilo:empty{margin:0}
.turno{border-top:1px solid var(--line);padding-top:14px}
.turno .q{margin:0 0 7px;font:500 12.5px/1.4 var(--mono);color:var(--text-mid)}
.turno .a{margin:0;font:400 14.5px/1.6 var(--body);color:var(--text-hi);max-width:64ch}
.turno .a.err{color:var(--warn)}
.pensando{font:400 13px/1 var(--mono);color:var(--text-low)}

.ficha{background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius-lg);padding:4px 20px;margin:0;box-shadow:var(--shadow)}
.dato{display:flex;justify-content:space-between;align-items:baseline;gap:18px;
  padding:13px 0;border-bottom:1px solid var(--line)}
.dato:last-child{border-bottom:0}
dt{margin:0;color:var(--text-mid);font:400 12.5px/1.4 var(--body)}
dd{margin:0;text-align:right;font:500 13.5px/1.4 var(--mono);color:var(--text-hi);
  word-break:break-word}

h2{font:500 10.5px/1 var(--mono);letter-spacing:.15em;text-transform:uppercase;
  color:var(--text-low);margin:0 0 10px}
ul{list-style:none;padding:4px 20px;margin:0;background:var(--panel);
  border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow)}
li{display:flex;align-items:center;gap:11px;padding:12px 0;
  border-bottom:1px solid var(--line);font-size:13.5px}
li:last-child{border-bottom:0}
li.vacio{color:var(--text-low);justify-content:center;font:400 13px/1 var(--mono)}
.pt{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
li time{margin-left:auto;color:var(--text-low);font:400 12.5px/1 var(--mono)}

.pie{margin-top:30px;padding:22px 0 0;border-top:1px solid var(--line);
  display:flex;flex-wrap:wrap;gap:14px 26px;align-items:center;
  justify-content:space-between}
.pie p{margin:0;color:var(--text-low);font-size:12.5px;max-width:64ch;line-height:1.6}
</style></head>
<body>
${barra(true)}
<main>
  <header>
    <span class="tag"><i></i>${escapar(paleta.texto)}</span>
    <h1>${escapar(tipo)}</h1>
    <p class="donde">
      <span>Camara <b>${escapar(camara)}</b></span>
      <span>${escapar(dia)}</span>
      <span>${escapar(reloj(abre))}</span>
    </p>
  </header>

  <div class="cuerpo">
    <div class="columna">
      <div class="visor">
        <div class="osd">
          <span class="id">CAM ${escapar(camara)}</span>
          <span class="hora">${escapar(reloj(abre))}</span>
        </div>
        ${media}
      </div>

      ${bloqueResumen}

      <div class="consulta">
        <p class="eyebrow">Preguntar sobre el incidente</p>
        <form class="fila" id="form">
          <input id="q" name="q" type="text" autocomplete="off"
                 maxlength="400" placeholder="Que deberia hacer ahora?"
                 aria-label="Pregunta sobre el incidente">
          <button type="submit" id="enviar">Preguntar</button>
        </form>
        <div class="sugerencias">
          <button type="button" data-q="Hay alguien mas en la escena?">Hay alguien mas?</button>
          <button type="button" data-q="Debo llamar a emergencias?">Llamo a emergencias?</button>
          <button type="button" data-q="Que deberia revisar en el clip?">Que reviso en el clip?</button>
        </div>
        <div id="hilo" aria-live="polite"></div>
      </div>
    </div>

    <div class="columna">
      <dl class="ficha">
        ${dato("Tipo", tipo)}
        ${d.suggestedCategory === null ? "" : dato("Veredicto del modelo", String(d.suggestedCategory))}
        ${conf === null ? "" : dato("Confianza", `${conf}%`)}
        ${dato("Estado", String(d.state))}
        ${dato("Abierto", reloj(abre))}
        ${dato("Ultima observacion", reloj(visto))}
        ${dato("Observaciones", String(d.observations))}
      </dl>
      <div>
        <h2>Avisos</h2>
        <ul>${listaAvisos}</ul>
      </div>
    </div>
  </div>

  <div class="pie">
    <p>Severidad segun la regla ${escapar(String(d.severityRuleVersion))}. Solo se
    registran los incidentes que el verificador confirma.</p>
    <a class="accion" href="/demo">Todos los incidentes</a>
  </div>
</main>
<script>
(function(){
  var ID = ${JSON.stringify(id)};
  var form = document.getElementById('form');
  var campo = document.getElementById('q');
  var boton = document.getElementById('enviar');
  var hilo = document.getElementById('hilo');

  function preguntar(pregunta){
    if(!pregunta.trim()) return;
    var turno = document.createElement('div');
    turno.className = 'turno';
    var q = document.createElement('p'); q.className = 'q'; q.textContent = pregunta;
    var a = document.createElement('p'); a.className = 'a pensando';
    a.textContent = 'Consultando...';
    turno.appendChild(q); turno.appendChild(a);
    hilo.appendChild(turno);
    campo.value = '';
    boton.disabled = true;

    fetch('/preguntar', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id: ID, pregunta: pregunta })
    }).then(function(r){ return r.json(); }).then(function(d){
      a.className = d.texto ? 'a' : 'a err';
      a.textContent = d.texto || d.error || 'No se pudo consultar.';
    }).catch(function(){
      a.className = 'a err';
      a.textContent = 'No se pudo consultar. Revisa la conexion.';
    }).finally(function(){
      boton.disabled = false;
      campo.focus();
    });
  }

  form.addEventListener('submit', function(e){ e.preventDefault(); preguntar(campo.value); });
  Array.prototype.forEach.call(
    document.querySelectorAll('.sugerencias button'),
    function(b){ b.addEventListener('click', function(){ preguntar(b.dataset.q); }); }
  );
})();
</script>
</body></html>`;
}

const MAX_EVIDENCIA_BYTES = 20 * 1024 * 1024;
const TIPOS_EVIDENCIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
]);

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

/** Ficha publica de un incidente: es a donde lleva el correo de aviso. */
export const demoIncidente = httpAction(async (ctx, request) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const datos =
    id === ""
      ? null
      : await ctx.runQuery(internal.demo.publicIncident, {
          incidentId: id,
        });
  return new Response(paginaIncidente(datos, id), {
    status: datos === null ? 404 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

/**
 * Preguntas del operador sobre un incidente concreto.
 *
 * Publica igual que la ficha, y por el mismo motivo: quien recibe el aviso
 * puede estar de guardia sin acceso al panel interno. El modelo solo ve lo que
 * la ficha ya ensena, asi que preguntar no abre ninguna puerta nueva.
 */
export const demoPreguntar = httpAction(async (ctx, request) => {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) {
    return json({ error: "El asistente no esta configurado en este deployment." }, 503);
  }

  let cuerpo: { id?: unknown; pregunta?: unknown };
  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    return json({ error: "Peticion invalida." }, 400);
  }

  const pregunta = String(cuerpo.pregunta ?? "");
  if (pregunta.trim().length === 0 || pregunta.length > MAX_PREGUNTA) {
    return json({ error: `Escribe una pregunta de menos de ${MAX_PREGUNTA} caracteres.` }, 400);
  }

  const datos = await ctx.runQuery(internal.demo.publicIncident, {
    incidentId: String(cuerpo.id ?? ""),
  });
  if (datos === null) {
    return json({ error: "Este incidente no esta disponible." }, 404);
  }

  const respuesta = await preguntar(
    clave,
    {
      category: ETIQUETA_TIPO[String(datos.category)] ?? String(datos.category),
      severity: String(datos.severity),
      camera: String(datos.camera),
      openedAt: Number(datos.openedAt),
      confidence: datos.confidence === null ? null : Number(datos.confidence),
      summary: datos.summary === null ? null : String(datos.summary),
    },
    pregunta,
  );

  return respuesta.ok
    ? json({ texto: respuesta.texto }, 200)
    : json({ error: respuesta.motivo }, 502);
});

const http = httpRouter();

http.route({ path: "/intake", method: "POST", handler: intake });
http.route({ path: "/demo", method: "GET", handler: demo });
http.route({ path: "/evidence", method: "POST", handler: evidence });
http.route({ path: "/incidente", method: "GET", handler: demoIncidente });
http.route({ path: "/preguntar", method: "POST", handler: demoPreguntar });

export default http;
