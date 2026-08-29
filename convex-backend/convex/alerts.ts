import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { decideAlert, parseAlertConfig, type AlertChannel } from "./lib/domain/alertPolicy";
import type { OperationalSeverity } from "./lib/domain/severity";

/**
 * Aviso humano cuando se abre un incidente grave: llamada de telefono y correo.
 *
 * Tres decisiones que explican la forma de este archivo:
 *
 * 1. Se dispara desde `acceptNormalized` con el planificador, no en linea. Si
 *    Twilio tarda cinco segundos o esta caido, el intake no puede quedarse
 *    esperando ni perder el incidente: lo grave es guardar el hecho, avisar es
 *    consecuencia. Y como `runAfter` dentro de una mutation es transaccional,
 *    un incidente que no llega a guardarse tampoco llama a nadie.
 *
 * 2. Solo avisa el incidente que se ABRE. La logica esta en `alertPolicy` y su
 *    razon esta explicada alli: agrupar es lo que evita diez llamadas por una
 *    sola pelea.
 *
 * 3. Un canal que falla no tumba al otro, y ningun fallo de proveedor propaga
 *    hacia arriba. El resultado de cada intento se escribe en la linea de
 *    tiempo del incidente, que es donde un operador va a buscar por que sono
 *    o por que no sono el telefono.
 */

const TIMEOUT_MS = 10_000;
const MAX_DETALLE = 200;
const MIN_SECRETO = 8;

/**
 * El cuerpo de error de un proveedor sirve para depurar (Twilio dice si el
 * numero no esta verificado, que es el fallo tipico en cuenta de prueba), pero
 * NO se guarda tal cual: esos mensajes suelen repetir la credencial que has
 * mandado, y la linea de tiempo la lee cualquier miembro del workspace.
 *
 * Se tacha por valor, no por nombre de variable, porque el proveedor la
 * devuelve incrustada en su propia prosa y no como un campo identificable.
 */
function recortar(texto: string, env: NodeJS.ProcessEnv): string {
  let limpio = texto.replace(/\s+/g, " ").trim();
  const secretos = [
    env.RESEND_API_KEY,
    env.TWILIO_AUTH_TOKEN,
    env.TWILIO_ACCOUNT_SID,
    env.INTAKE_SERVICE_TOKEN,
  ].filter((valor): valor is string => typeof valor === "string" && valor.length >= MIN_SECRETO);
  for (const secreto of secretos) {
    limpio = limpio.split(secreto).join("[redactado]");
  }
  return limpio.length > MAX_DETALLE ? `${limpio.slice(0, MAX_DETALLE)}...` : limpio;
}

const ETIQUETA: Record<string, string> = {
  violence: "agresion",
  fall: "caida",
  smoke: "humo",
  intrusion: "intrusion",
  theft: "robo",
  ppe_missing: "falta de equipo de proteccion",
};

function frase(category: string, cameraLabel: string): string {
  return `Alerta de seguridad. Se ha detectado ${ETIQUETA[category] ?? category} en la camara ${cameraLabel}.`;
}

const COLOR_SEVERIDAD: Record<string, string> = {
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

/**
 * Cuerpo HTML del aviso.
 *
 * Escrito con tablas y estilos en linea, no con flex y una hoja de estilos:
 * los clientes de correo no son navegadores. Gmail descarta `<style>` en
 * algunas vistas y Outlook no entiende flexbox, asi que lo que aqui parece
 * anticuado es lo unico que se ve igual en todas partes.
 *
 * La imagen puede no cargar nunca: muchos clientes bloquean imagenes remotas
 * hasta que el lector lo autoriza. Por eso el texto de arriba ya dice que ha
 * pasado y donde, y la foto es un extra, no el mensaje.
 */
function cuerpoHtml(datos: {
  category: string;
  severity: string;
  cameraLabel: string;
  openedAt: number;
  confidence: number | null;
  evidenceUrl: string | null;
  demoUrl: string | null;
}): string {
  const color = COLOR_SEVERIDAD[datos.severity] ?? "#8b95a3";
  const tipo = escapar(ETIQUETA[datos.category] ?? datos.category);
  const cuando = new Date(datos.openedAt).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  const imagen =
    datos.evidenceUrl === null
      ? `<tr><td style="padding:0 24px 20px;color:#5d6673;font-size:13px;
             font-family:Arial,Helvetica,sans-serif">
           Sin fotograma disponible para este incidente.
         </td></tr>`
      : `<tr><td style="padding:0 24px 20px">
           <img src="${escapar(datos.evidenceUrl)}" width="512" alt="Fotograma del incidente"
                style="display:block;width:100%;max-width:512px;height:auto;
                       border-radius:8px;border:1px solid #2a3038">
         </td></tr>`;

  const fila = (etiqueta: string, valor: string) => `
    <tr>
      <td style="padding:7px 0;color:#5d6673;font-size:12px;width:110px;
                 font-family:Arial,Helvetica,sans-serif">${etiqueta}</td>
      <td style="padding:7px 0;color:#e8ebef;font-size:13px;font-weight:bold;
                 font-family:Arial,Helvetica,sans-serif">${valor}</td>
    </tr>`;

  const pie =
    datos.demoUrl === null
      ? ""
      : `<tr><td style="padding:0 24px 24px">
           <a href="${escapar(datos.demoUrl)}"
              style="color:#5aa9ff;font-size:12px;text-decoration:none;
                     font-family:Arial,Helvetica,sans-serif">
             Ver todos los incidentes registrados
           </a>
         </td></tr>`;

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px 12px;background:#f4f5f7">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
         style="width:560px;max-width:100%;background:#0b0d10;border-radius:12px;
                overflow:hidden">
    <tr>
      <td style="padding:22px 24px 6px">
        <span style="display:inline-block;padding:4px 11px;border-radius:5px;
                     font-size:11px;font-weight:bold;letter-spacing:.06em;
                     text-transform:uppercase;color:#0b0d10;background:${color};
                     font-family:Arial,Helvetica,sans-serif">${escapar(datos.severity)}</span>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 24px 4px;color:#e8ebef;font-size:21px;font-weight:bold;
                 font-family:Arial,Helvetica,sans-serif">
        Se ha detectado ${tipo}
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 18px;color:#8b95a3;font-size:13px;
                 font-family:Arial,Helvetica,sans-serif">
        Camara ${escapar(datos.cameraLabel)} &middot; ${escapar(cuando)}
      </td>
    </tr>
    ${imagen}
    <tr>
      <td style="padding:0 24px 8px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${fila("Tipo", tipo)}
          ${fila("Camara", escapar(datos.cameraLabel))}
          ${fila("Detectado", escapar(cuando))}
          ${datos.confidence === null ? "" : fila("Confianza", `${Math.round(datos.confidence * 100)}%`)}
        </table>
      </td>
    </tr>
    ${pie}
    <tr>
      <td style="padding:14px 24px 20px;border-top:1px solid #1b2027;color:#3d4550;
                 font-size:11px;font-family:Arial,Helvetica,sans-serif">
        Confirmado por el analisis de video. Las sospechas que el verificador
        descarta no generan aviso.
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

async function conTimeout(url: string, init: RequestInit): Promise<Response> {
  const corte = AbortSignal.timeout(TIMEOUT_MS);
  return fetch(url, { ...init, signal: corte });
}

type Intento = { channel: AlertChannel; ok: boolean; detail: string };

async function enviarCorreo(
  env: NodeJS.ProcessEnv,
  texto: string,
  asunto: string,
  html: string,
): Promise<Intento> {
  try {
    const respuesta = await conTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM,
        // Resend acepta varios destinatarios separados por coma.
        to: (env.ALERT_EMAIL_TO ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        subject: asunto,
        // `text` no es decorativo: es lo que se lee cuando el cliente
        // bloquea HTML, y lo que mejora la entregabilidad.
        text: texto,
        html,
      }),
    });
    if (!respuesta.ok) {
      return {
        channel: "email",
        ok: false,
        detail: recortar(`http ${respuesta.status}: ${await respuesta.text()}`, env),
      };
    }
    return { channel: "email", ok: true, detail: `http ${respuesta.status}` };
  } catch (error) {
    return {
      channel: "email",
      ok: false,
      detail: recortar(error instanceof Error ? error.message : "fallo desconocido", env),
    };
  }
}

async function llamar(env: NodeJS.ProcessEnv, texto: string): Promise<Intento> {
  const sid = env.TWILIO_ACCOUNT_SID ?? "";
  const twiml =
    `<Response><Say voice="alice" language="es-ES">${texto}</Say>` +
    `<Pause length="1"/><Say voice="alice" language="es-ES">${texto}</Say></Response>`;
  try {
    const respuesta = await conTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${env.TWILIO_AUTH_TOKEN ?? ""}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: env.ALERT_PHONE_TO ?? "",
          From: env.TWILIO_FROM ?? "",
          Twiml: twiml,
        }).toString(),
      },
    );
    if (!respuesta.ok) {
      return {
        channel: "call",
        ok: false,
        detail: recortar(`http ${respuesta.status}: ${await respuesta.text()}`, env),
      };
    }
    return { channel: "call", ok: true, detail: `http ${respuesta.status}` };
  } catch (error) {
    return {
      channel: "call",
      ok: false,
      detail: recortar(error instanceof Error ? error.message : "fallo desconocido", env),
    };
  }
}

export const incidentSummary = internalQuery({
  args: { incidentId: v.id("incidents") },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      category: v.string(),
      severity: v.string(),
      cameraLabel: v.string(),
      openedAt: v.number(),
      confidence: v.union(v.number(), v.null()),
      evidenceUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const incidente = await ctx.db.get(args.incidentId);
    if (incidente === null) {
      return null;
    }
    const camara = await ctx.db.get(incidente.cameraId);

    // La deteccion que abrio el incidente es la que lleva el fotograma. Se
    // busca por indice y acotada: un incidente largo puede acumular decenas.
    const enlace = await ctx.db
      .query("incidentDetections")
      .withIndex("by_workspace_and_incident", (q) =>
        q.eq("workspaceId", incidente.workspaceId).eq("incidentId", args.incidentId),
      )
      .first();
    const deteccion = enlace === null ? null : await ctx.db.get(enlace.detectionId);

    // Solo vale una URL absoluta: las referencias que apuntan al equipo que
    // corre el analisis no se ven desde un correo.
    const evidenceUrl =
      (deteccion?.evidenceRefs ?? []).find((ref) => ref.startsWith("https://")) ?? null;

    return {
      workspaceId: incidente.workspaceId,
      category: incidente.category,
      severity: incidente.severity,
      cameraLabel: camara?.label ?? "camara",
      openedAt: incidente.openedAt,
      confidence: deteccion?.confidence ?? null,
      evidenceUrl,
    };
  },
});

export const recordOutcome = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    incidentId: v.id("incidents"),
    type: v.string(),
    payload: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("incidentTimeline", {
      workspaceId: args.workspaceId,
      incidentId: args.incidentId,
      type: args.type,
      payload: args.payload,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const dispatch = internalAction({
  args: {
    incidentId: v.id("incidents"),
    disposition: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const resumen = await ctx.runQuery(internal.alerts.incidentSummary, {
      incidentId: args.incidentId,
    });
    if (resumen === null) {
      return null;
    }

    const decision = decideAlert({
      disposition: args.disposition as "created" | "grouped" | "duplicate",
      severity: resumen.severity as OperationalSeverity,
      config: parseAlertConfig(process.env),
    });

    if (!decision.alert) {
      // Solo se deja rastro de lo que un operador podria confundir con un
      // fallo. Que un incidente agrupado no llame es lo normal, no una noticia.
      if (decision.reason !== "not-a-new-incident") {
        await ctx.runMutation(internal.alerts.recordOutcome, {
          workspaceId: resumen.workspaceId,
          incidentId: args.incidentId,
          type: "alert.skipped",
          payload: { reason: decision.reason, severity: resumen.severity },
        });
      }
      return null;
    }

    const texto = frase(resumen.category, resumen.cameraLabel);
    const asunto = `[${resumen.severity.toUpperCase()}] ${ETIQUETA[resumen.category] ?? resumen.category} en ${resumen.cameraLabel}`;
    const html = cuerpoHtml({
      category: resumen.category,
      severity: resumen.severity,
      cameraLabel: resumen.cameraLabel,
      openedAt: resumen.openedAt,
      confidence: resumen.confidence,
      evidenceUrl: resumen.evidenceUrl,
      demoUrl: process.env.DEMO_PUBLIC_URL ?? null,
    });

    // En paralelo y con los fallos capturados: que no salga el correo no puede
    // impedir que suene el telefono.
    const intentos = await Promise.all(
      decision.channels.map((canal) =>
        canal === "call"
          ? llamar(process.env, texto)
          : enviarCorreo(process.env, texto, asunto, html),
      ),
    );

    for (const intento of intentos) {
      await ctx.runMutation(internal.alerts.recordOutcome, {
        workspaceId: resumen.workspaceId,
        incidentId: args.incidentId,
        type: intento.ok ? "alert.sent" : "alert.failed",
        payload: { channel: intento.channel, detail: intento.detail },
      });
    }
    return null;
  },
});
