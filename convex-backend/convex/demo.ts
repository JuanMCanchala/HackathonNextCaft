import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

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
