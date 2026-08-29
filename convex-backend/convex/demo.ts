import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { parseEvidence } from "./lib/domain/evidence";

/**
 * Vista publica de solo lectura para la demo.
 *
 * El dashboard de Convex exige sesion de equipo, asi que no sirve como link que
 * abrir delante de un jurado. Esto expone lo minimo para poder ensenar que los
 * incidentes llegan y quedan registrados.
 *
 * Tres cosas la mantienen acotada:
 *
 * 1. Solo responde para el workspace que el deployment declare en
 *    `DEMO_PUBLIC_WORKSPACE_ID`. Cualquier otro no existe para esta vista.
 * 2. Devuelve una proyeccion sin identificadores internos ni datos de persona:
 *    categoria, severidad, estado y tiempos. No hay PII en la tabla.
 * 3. Es de lectura y esta acotada en numero de filas.
 *
 * No sustituye a `incidents.list`, que sigue exigiendo membresia y rol. Esta es
 * una superficie aparte y deliberadamente pobre.
 */

const MAX_FILAS = 50;

/**
 * Un incidente concreto, para el enlace del correo de aviso.
 *
 * Mismas reglas que la lista: solo responde para el workspace declarado en
 * `DEMO_PUBLIC_WORKSPACE_ID`. Un id de otro workspace no existe aqui, asi que
 * el enlace no sirve como sonda para asomarse a datos ajenos.
 *
 * Aqui si se acepta el id por parametro, y no pasa nada: quien tiene el enlace
 * ya recibio el aviso con esta misma informacion. Lo que protege no es que el
 * id sea secreto, es que la consulta esta anclada al workspace del deployment.
 */
export const publicIncident = internalQuery({
  args: { incidentId: v.string() },
  handler: async (ctx, args) => {
    const permitido = process.env.DEMO_PUBLIC_WORKSPACE_ID;
    if (!permitido) {
      return null;
    }

    const id = ctx.db.normalizeId("incidents", args.incidentId);
    if (id === null) {
      return null;
    }
    const incidente = await ctx.db.get(id);
    if (incidente === null || incidente.workspaceId !== (permitido as never)) {
      return null;
    }

    const camara = await ctx.db.get(incidente.cameraId);
    const enlace = await ctx.db
      .query("incidentDetections")
      .withIndex("by_workspace_and_incident", (q) =>
        q.eq("workspaceId", incidente.workspaceId).eq("incidentId", id),
      )
      .first();
    const deteccion = enlace === null ? null : await ctx.db.get(enlace.detectionId);

    const linea = await ctx.db
      .query("incidentTimeline")
      .withIndex("by_workspace_and_incident", (q) =>
        q.eq("workspaceId", incidente.workspaceId).eq("incidentId", id),
      )
      .take(30);

    return {
      category: incidente.category,
      severity: incidente.severity,
      severityRuleVersion: incidente.severityRuleVersion,
      state: incidente.state,
      camera: camara?.label ?? "camara",
      openedAt: incidente.openedAt,
      lastObservedAt: incidente.lastObservedAt,
      confidence: deteccion?.confidence ?? null,
      suggestedCategory: deteccion?.suggestedCategory ?? null,
      // La ficha ensena el clip completo si existe; la imagen queda de
      // respaldo para incidentes guardados antes de que hubiera video.
      clipUrl: parseEvidence(deteccion?.evidenceRefs ?? []).video,
      stillUrl: parseEvidence(deteccion?.evidenceRefs ?? []).imagen,
      // Cuantas observaciones se agruparon: es lo que distingue un destello de
      // un incidente sostenido.
      observations: linea.filter((e) => e.type === "detection.grouped").length + 1,
      alerts: linea
        .filter((e) => String(e.type).startsWith("alert."))
        .map((e) => ({ type: e.type, createdAt: e.createdAt })),
    };
  },
});

export const publicIncidents = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // El workspace sale de la variable del deployment, no de la peticion:
    // asi no hay parametro que manipular para asomarse a otro.
    const permitido = process.env.DEMO_PUBLIC_WORKSPACE_ID;
    if (!permitido) {
      return null;
    }

    const limite = Math.min(Math.max(args.limit ?? 20, 1), MAX_FILAS);
    const filas = await ctx.db
      .query("incidents")
      .withIndex("by_workspace_state", (q) => q.eq("workspaceId", permitido as never))
      .order("desc")
      .take(limite);

    const camaras = new Map<string, string>();
    for (const fila of filas) {
      if (!camaras.has(fila.cameraId)) {
        const camara = await ctx.db.get(fila.cameraId);
        camaras.set(fila.cameraId, camara?.label ?? "camara");
      }
    }

    return filas.map((fila) => ({
      category: fila.category,
      severity: fila.severity,
      severityRuleVersion: fila.severityRuleVersion,
      state: fila.state,
      camera: camaras.get(fila.cameraId) ?? "camara",
      openedAt: fila.openedAt,
      lastObservedAt: fila.lastObservedAt,
    }));
  },
});
