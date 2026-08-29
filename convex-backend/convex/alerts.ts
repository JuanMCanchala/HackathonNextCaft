import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { decideAlert, parseAlertConfig, type AlertChannel } from "./lib/domain/alertPolicy";
import { parseEvidence } from "./lib/domain/evidence";
import { asuntoAviso, cuerpoAviso, textoAviso } from "./lib/email/alertEmail";
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

    // Para el correo solo sirve la imagen: ningun cliente reproduce video, y
    // las referencias que apuntan al equipo del analisis no se ven desde
    // fuera de esa red.
    const { imagen } = parseEvidence(deteccion?.evidenceRefs ?? []);

    return {
      workspaceId: incidente.workspaceId,
      category: incidente.category,
      severity: incidente.severity,
      cameraLabel: camara?.label ?? "camara",
      openedAt: incidente.openedAt,
      confidence: deteccion?.confidence ?? null,
      evidenceUrl: imagen,
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

    const aviso = {
      category: resumen.category,
      severity: resumen.severity,
      cameraLabel: resumen.cameraLabel,
      openedAt: resumen.openedAt,
      confidence: resumen.confidence,
      evidenceUrl: resumen.evidenceUrl,
      // El enlace a la ficha sale de la misma base que la vista publica, asi
      // solo hay una variable que configurar.
      incidentUrl:
        process.env.DEMO_PUBLIC_URL === undefined
          ? null
          : `${process.env.DEMO_PUBLIC_URL.replace(/\/demo\/?$/, "")}/incidente?id=${args.incidentId}`,
      demoUrl: process.env.DEMO_PUBLIC_URL ?? null,
    };
    // La voz y el correo no dicen lo mismo. Por telefono hace falta una frase
    // que se entienda de oido a la primera; en el correo cabe la hora, la
    // confianza y el enlace.
    const dictado = frase(resumen.category, resumen.cameraLabel);
    const asunto = asuntoAviso(aviso);
    const html = cuerpoAviso(aviso);
    const texto = textoAviso(aviso);

    // En paralelo y con los fallos capturados: que no salga el correo no puede
    // impedir que suene el telefono.
    const intentos = await Promise.all(
      decision.channels.map((canal) =>
        canal === "call"
          ? llamar(process.env, dictado)
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
