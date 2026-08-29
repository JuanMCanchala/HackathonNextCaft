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

// El clip del panel abarca todo el buffer, asi que pesa mas que un GIF.
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

const SEVERIDAD_PAGINA: Record<string, { color: string; texto: string }> = {
  critical: { color: "#E23D4B", texto: "Critico" },
  high: { color: "#E0912F", texto: "Alto" },
  medium: { color: "#4F8FF0", texto: "Medio" },
  low: { color: "#3FB27F", texto: "Bajo" },
};

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
function paginaIncidente(d: Record<string, unknown> | null, id: string): string {
  if (d === null) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Incidente no disponible</title></head>
<body style="margin:0;background:#0E1013;color:#7C8494;
 font:15px/1.5 ui-monospace,Consolas,monospace;display:flex;align-items:center;
 justify-content:center;min-height:100vh;padding:24px;text-align:center">
<p>Este incidente no esta disponible.</p></body></html>`;
  }

  const sev = String(d.severity);
  const paleta = SEVERIDAD_PAGINA[sev] ?? { color: "#6B7280", texto: sev };
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
            return `<li><i class="pt" style="--c:${ok ? "#3FB27F" : "#D08B2C"}"></i>
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

  // El resumen es lo unico del sistema escrito en lenguaje humano. Va pegado
  // al video y no en la columna de datos: describe lo que acabas de ver, y esa
  // adyacencia es la mitad de su valor.
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
<title>${escapar(tipo)} en ${escapar(camara)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  color-scheme:dark;
  --sev:${paleta.color};
  --fondo:#0E1013;
  --panel:#15181D;
  --panel-alto:#191D23;
  --linea:#232830;
  --texto:#EEF1F5;
  --apagado:#8B93A1;
  --tenue:#5A6270;
  --display:Archivo,'Segoe UI',-apple-system,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,Consolas,monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fondo);color:var(--texto);
  font:15px/1.6 var(--display);font-weight:500;padding:0 0 72px}
.cinta{height:5px;background:var(--sev)}
.envoltura{max-width:1240px;margin:0 auto;padding:0 20px}

header{padding:30px 0 24px}
.tag{display:inline-flex;align-items:center;gap:8px;font:600 11px/1 var(--mono);
  letter-spacing:.16em;text-transform:uppercase;color:var(--sev)}
.tag i{width:7px;height:7px;border-radius:50%;background:currentColor;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--sev) 22%,transparent)}
h1{font:800 clamp(32px,6.4vw,56px)/0.98 var(--display);letter-spacing:-.035em;
  margin:14px 0 10px}
.donde{font:400 14px/1.5 var(--mono);color:var(--apagado);margin:0;
  display:flex;flex-wrap:wrap;gap:6px 14px}
.donde b{color:var(--texto);font-weight:500}

.cuerpo{display:grid;gap:22px;grid-template-columns:1fr;align-items:start}
@media (min-width:940px){
  .cuerpo{grid-template-columns:minmax(0,1.75fr) minmax(310px,1fr);gap:30px}
  header{padding:44px 0 30px}
}
.columna{display:grid;gap:22px;min-width:0}

.visor{background:#000;border:1px solid var(--linea);border-radius:12px;overflow:hidden}
.osd{display:flex;justify-content:space-between;align-items:center;
  padding:11px 14px;background:#000;border-bottom:1px solid #1B1F26;
  font:500 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase}
.osd .id{color:var(--tenue)}
.osd .hora{color:#D7DCE3;letter-spacing:.08em}
.visor video,.visor img{display:block;width:100%;height:auto;background:#000}
.sinclip{padding:80px 20px;text-align:center;color:var(--tenue);
  font:400 14px/1.5 var(--mono)}

.eyebrow{margin:0 0 10px;font:600 10.5px/1 var(--mono);letter-spacing:.17em;
  text-transform:uppercase;color:var(--tenue)}

/* El analisis se lee, no se consulta: tipografia mas grande, medida corta y
   un filete de severidad que lo ata al incidente. */
.lectura{background:var(--panel);border:1px solid var(--linea);
  border-left:3px solid var(--sev);border-radius:10px;padding:20px 22px}
.cuerpo-texto{margin:0;font:500 clamp(16px,1.6vw,18px)/1.62 var(--display);
  color:var(--texto);max-width:62ch;letter-spacing:-.005em}
.lectura.vacia .cuerpo-texto{color:var(--tenue);font-size:15px}
.firma{margin:14px 0 0;font:400 11.5px/1 var(--mono);color:var(--tenue);
  letter-spacing:.04em}

.consulta{background:var(--panel);border:1px solid var(--linea);
  border-radius:10px;padding:20px 22px}
.fila{display:flex;gap:10px;flex-wrap:wrap}
.fila input{flex:1 1 220px;min-width:0;background:var(--panel-alto);
  border:1px solid var(--linea);border-radius:8px;padding:13px 14px;
  color:var(--texto);font:500 14.5px/1.3 var(--display)}
.fila input::placeholder{color:var(--tenue)}
.fila input:focus{outline:none;border-color:var(--sev)}
.fila button{background:var(--texto);color:#0E1013;border:0;border-radius:8px;
  padding:13px 20px;font:700 14px/1.3 var(--display);cursor:pointer;
  transition:opacity .18s ease}
.fila button:hover{opacity:.85}
.fila button:disabled{opacity:.45;cursor:default}
.sugerencias{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.sugerencias button{background:transparent;border:1px solid var(--linea);
  border-radius:20px;padding:7px 13px;color:var(--apagado);
  font:500 12.5px/1 var(--display);cursor:pointer;transition:border-color .18s ease}
.sugerencias button:hover{border-color:var(--apagado);color:var(--texto)}
#hilo{margin:18px 0 0;display:grid;gap:14px}
#hilo:empty{margin:0}
.turno{border-top:1px solid var(--linea);padding-top:14px}
.turno .q{margin:0 0 7px;font:600 12.5px/1.4 var(--mono);color:var(--apagado)}
.turno .a{margin:0;font:500 15px/1.6 var(--display);color:var(--texto);max-width:64ch}
.turno .a.err{color:#E0912F}
.pensando{font:400 13px/1 var(--mono);color:var(--tenue)}

.ficha{background:var(--panel);border:1px solid var(--linea);border-radius:12px;
  padding:4px 20px;margin:0}
.dato{display:flex;justify-content:space-between;align-items:baseline;gap:18px;
  padding:14px 0;border-bottom:1px solid var(--linea)}
.dato:last-child{border-bottom:0}
dt{margin:0;color:var(--apagado);font:400 12.5px/1.4 var(--display)}
dd{margin:0;text-align:right;font:500 14px/1.4 var(--mono);color:var(--texto);
  word-break:break-word}

h2{font:600 10.5px/1 var(--mono);letter-spacing:.17em;text-transform:uppercase;
  color:var(--tenue);margin:0 0 10px}
ul{list-style:none;padding:4px 20px;margin:0;background:var(--panel);
  border:1px solid var(--linea);border-radius:12px}
li{display:flex;align-items:center;gap:11px;padding:13px 0;
  border-bottom:1px solid var(--linea);font-size:14px}
li:last-child{border-bottom:0}
li.vacio{color:var(--tenue);justify-content:center;font:400 13px/1 var(--mono)}
.pt{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
li time{margin-left:auto;color:var(--tenue);font:400 12.5px/1 var(--mono)}

.pie{margin-top:34px;padding-top:22px;border-top:1px solid var(--linea);
  display:flex;flex-wrap:wrap;gap:14px 26px;align-items:center;
  justify-content:space-between}
.pie p{margin:0;color:var(--tenue);font-size:12.5px;max-width:62ch;line-height:1.6}
.volver{color:var(--texto);text-decoration:none;font:500 13px/1 var(--mono);
  border:1px solid var(--linea);border-radius:8px;padding:12px 18px;
  white-space:nowrap;transition:border-color .18s ease,background .18s ease}
.volver:hover,.volver:focus-visible{border-color:var(--sev);background:var(--panel)}
a:focus-visible,video:focus-visible,button:focus-visible,input:focus-visible{
  outline:2px solid var(--sev);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head>
<body>
<div class="cinta"></div>
<div class="envoltura">
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
    registran los incidentes que el verificador confirma; las sospechas
    descartadas no llegan hasta aqui.</p>
    <a class="volver" href="/demo">Todos los incidentes</a>
  </div>
</div>
<script>
(function(){
  var ID = ${JSON.stringify(id)};
  var form = document.getElementById('form');
  var campo = document.getElementById('q');
  var boton = document.getElementById('enviar');
  var hilo = document.getElementById('hilo');

  function texto(nodo, valor){ nodo.textContent = valor; }

  function preguntar(pregunta){
    if(!pregunta.trim()) return;
    var turno = document.createElement('div');
    turno.className = 'turno';
    var q = document.createElement('p'); q.className = 'q';
    texto(q, pregunta);
    var a = document.createElement('p'); a.className = 'a pensando';
    texto(a, 'Consultando...');
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
      texto(a, d.texto || d.error || 'No se pudo consultar.');
    }).catch(function(){
      a.className = 'a err';
      texto(a, 'No se pudo consultar. Revisa la conexion.');
    }).finally(function(){
      boton.disabled = false;
      campo.focus();
    });
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    preguntar(campo.value);
  });
  Array.prototype.forEach.call(
    document.querySelectorAll('.sugerencias button'),
    function(b){ b.addEventListener('click', function(){ preguntar(b.dataset.q); }); }
  );
})();
</script>
</body></html>`;
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
