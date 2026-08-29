import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { toCamera } from "./lib/dto/cameras";
import { toIncidentSummary } from "./lib/dto/incidents";

/**
 * Lectura publica del panel de demostracion.
 *
 * Existe para que el dashboard de Angular pueda ensenar incidentes reales sin
 * que haya que montar Clerk antes. `incidents.list` y `cameras.list` siguen
 * exigiendo membresia y rol, y no se tocan: esto es una superficie aparte.
 *
 * TRES LIMITES, y conviene entender por que estan donde estan.
 *
 * Variable propia, `DEMO_DASHBOARD_WORKSPACE_ID`. La vista `/demo` ya tenia
 * `DEMO_PUBLIC_WORKSPACE_ID` y devuelve una proyeccion pobre y sin
 * identificadores. Esta devuelve el DTO entero, con los ids que el panel
 * necesita para navegar. Son dos niveles de exposicion distintos, asi que son
 * dos decisiones distintas: activar la lista publica no debe activar de
 * regalo el volcado completo.
 *
 * El workspace nunca llega por parametro. Sale del entorno, igual que en la
 * vista publica: asi no hay nada que manipular para asomarse a otro.
 *
 * Solo lectura. Cambiar el estado de un incidente exige identidad, y aqui no
 * hay ninguna. El panel en modo demostracion ensena, no opera.
 */

const MAX_FILAS = 100;

function workspacePermitido(): Id<"workspaces"> | null {
  const declarado = process.env.DEMO_DASHBOARD_WORKSPACE_ID;
  return declarado === undefined || declarado === "" ? null : (declarado as Id<"workspaces">);
}

function acotar(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 25, 1), MAX_FILAS);
}

const paginaVacia = { items: [], nextCursor: null, hasMore: false };

export const incidents = query({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const workspaceId = workspacePermitido();
    if (workspaceId === null) {
      return paginaVacia;
    }
    const desde = Number(args.cursor ?? "0") || 0;
    const hasta = desde + acotar(args.limit);

    const filas = await ctx.db
      .query("incidents")
      .withIndex("by_workspace_state", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(hasta + 1);

    const hasMore = filas.length > hasta;
    return {
      items: filas.slice(desde, hasta).map(toIncidentSummary),
      nextCursor: hasMore ? String(hasta) : null,
      hasMore,
    };
  },
});

export const incident = query({
  args: { incidentId: v.string() },
  handler: async (ctx, args) => {
    const workspaceId = workspacePermitido();
    if (workspaceId === null) {
      return null;
    }
    const id = ctx.db.normalizeId("incidents", args.incidentId);
    if (id === null) {
      return null;
    }
    const doc = await ctx.db.get(id);
    if (doc === null || doc.workspaceId !== workspaceId) {
      return null;
    }

    const enlaces = await ctx.db
      .query("incidentDetections")
      .withIndex("by_workspace_and_incident", (q) =>
        q.eq("workspaceId", workspaceId).eq("incidentId", id),
      )
      .take(MAX_FILAS);
    const linea = await ctx.db
      .query("incidentTimeline")
      .withIndex("by_workspace_and_incident", (q) =>
        q.eq("workspaceId", workspaceId).eq("incidentId", id),
      )
      .take(MAX_FILAS);

    const detecciones = await Promise.all(enlaces.map((e) => ctx.db.get(e.detectionId)));
    // Las referencias de evidencia son las URL publicas que subio el pipeline;
    // el panel las pinta directamente.
    const evidencias = detecciones.flatMap((d) => d?.evidenceRefs ?? []);

    return {
      ...toIncidentSummary(doc),
      initialSeverity: doc.initialSeverity,
      severityOverride: null,
      detectionIds: enlaces.map((e) => e.detectionId as string),
      evidenceIds: evidencias,
      timeline: linea.map((entrada) => ({
        id: entrada._id as string,
        at: new Date(entrada.createdAt).toISOString(),
        // La linea de tiempo interna usa nombres propios (`alert.sent`,
        // `detection.grouped`). El panel solo entiende su enumerado, asi que
        // se traduce aqui en vez de ensanchar el contrato del frontend.
        type: entrada.type.startsWith("alert.")
          ? ("note" as const)
          : entrada.type === "detection.grouped"
            ? ("detection_linked" as const)
            : ("state_changed" as const),
        actorKind: "system" as const,
        actorId: null,
        from: null,
        to: null,
        message: entrada.type,
      })),
    };
  },
});

export const cameras = query({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const workspaceId = workspacePermitido();
    if (workspaceId === null) {
      return paginaVacia;
    }
    const desde = Number(args.cursor ?? "0") || 0;
    const hasta = desde + acotar(args.limit);

    const filas = await ctx.db
      .query("cameras")
      .withIndex("by_workspace_and_externalId", (q) => q.eq("workspaceId", workspaceId))
      .take(hasta + 1);

    const hasMore = filas.length > hasta;
    return {
      items: filas.slice(desde, hasta).map(toCamera),
      nextCursor: hasMore ? String(hasta) : null,
      hasMore,
    };
  },
});

async function contar(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const incidentes = await ctx.db
    .query("incidents")
    .withIndex("by_workspace_state", (q) => q.eq("workspaceId", workspaceId))
    .take(500);
  const camaras = await ctx.db
    .query("cameras")
    .withIndex("by_workspace_and_externalId", (q) => q.eq("workspaceId", workspaceId))
    .take(200);
  // El unico indice de detections empieza por workspace, asi que sirve para
  // contar sin recorrer la tabla entera.
  const detecciones = await ctx.db
    .query("detections")
    .withIndex("by_workspace_source_event", (q) => q.eq("workspaceId", workspaceId))
    .take(1000);
  return { incidentes, camaras, detecciones };
}

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const workspaceId = workspacePermitido();
    const vacio = {
      workspaceId: "",
      from: new Date(0).toISOString(),
      to: new Date().toISOString(),
      timezone: "UTC",
      counts: {
        incidentsByState: {
          detected: 0,
          triaged: 0,
          acknowledged: 0,
          resolved: 0,
          dismissed: 0,
        },
        incidentsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
        detectionsTotal: 0,
        camerasOnline: 0,
        camerasTotal: 0,
      },
    };
    if (workspaceId === null) {
      return vacio;
    }

    const { incidentes, camaras, detecciones } = await contar(ctx, workspaceId);
    const porEstado = { ...vacio.counts.incidentsByState };
    const porSeveridad = { ...vacio.counts.incidentsBySeverity };
    for (const incidente of incidentes) {
      porEstado[incidente.state] += 1;
      porSeveridad[incidente.severity] += 1;
    }

    const abiertos = incidentes.map((i) => i.openedAt);
    return {
      workspaceId: workspaceId as string,
      from: new Date(abiertos.length === 0 ? Date.now() : Math.min(...abiertos)).toISOString(),
      to: new Date().toISOString(),
      timezone: "UTC",
      counts: {
        incidentsByState: porEstado,
        incidentsBySeverity: porSeveridad,
        detectionsTotal: detecciones.length,
        camerasOnline: camaras.filter((c) => c.connectivity === "online").length,
        camerasTotal: camaras.length,
      },
    };
  },
});
