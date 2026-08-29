import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import schema from "../../convex/schema";

/**
 * Manual module map for Jest (no Vite `import.meta.glob`).
 * Paths must include `_generated` so convex-test can resolve the convex root.
 */
export const modules: Record<string, () => Promise<unknown>> = {
  "../../convex/schema.ts": () => import("../../convex/schema"),
  "../../convex/validation.ts": () => import("../../convex/validation"),
  "../../convex/chat.ts": () => import("../../convex/chat"),
  "../../convex/agents.ts": () => import("../../convex/agents"),
  "../../convex/workspaces.ts": () => import("../../convex/workspaces"),
  "../../convex/cameras.ts": () => import("../../convex/cameras"),
  "../../convex/detections.ts": () => import("../../convex/detections"),
  "../../convex/incidents.ts": () => import("../../convex/incidents"),
  "../../convex/seed.ts": () => import("../../convex/seed"),
  "../../convex/demo.ts": () => import("../../convex/demo"),
  "../../convex/alerts.ts": () => import("../../convex/alerts"),
  "../../convex/http.ts": () => import("../../convex/http"),
  "../../convex/lib/errors.ts": () => import("../../convex/lib/errors"),
  "../../convex/lib/authz.ts": () => import("../../convex/lib/authz"),
  "../../convex/lib/time.ts": () => import("../../convex/lib/time"),
  "../../convex/lib/workspaceDefaults.ts": () => import("../../convex/lib/workspaceDefaults"),
  "../../convex/lib/dto/workspaces.ts": () => import("../../convex/lib/dto/workspaces"),
  "../../convex/lib/dto/cameras.ts": () => import("../../convex/lib/dto/cameras"),
  "../../convex/lib/dto/incidents.ts": () => import("../../convex/lib/dto/incidents"),
  "../../convex/lib/domain/normalize.ts": () => import("../../convex/lib/domain/normalize"),
  "../../convex/lib/domain/group.ts": () => import("../../convex/lib/domain/group"),
  "../../convex/lib/domain/severity.ts": () => import("../../convex/lib/domain/severity"),
  "../../convex/lib/domain/evidence.ts": () => import("../../convex/lib/domain/evidence"),
  "../../convex/lib/domain/alertPolicy.ts": () => import("../../convex/lib/domain/alertPolicy"),
  "../../convex/lib/domain/transition.ts": () => import("../../convex/lib/domain/transition"),
  "../../convex/_generated/api.js": () => import("../../convex/_generated/api.js"),
  "../../convex/_generated/server.js": () => import("../../convex/_generated/server.js"),
};

export type SentraTest = TestConvex<typeof schema>;

const instancias: SentraTest[] = [];

export function createTestBackend(): SentraTest {
  const backend = convexTest(schema, modules);
  instancias.push(backend);
  return backend;
}

/**
 * Vacia la cola del planificador al terminar cada caso.
 *
 * Desde que el intake encola el aviso (`alerts.dispatch`), cualquier test que
 * acepte una deteccion deja trabajo pendiente. `convex-test` intenta
 * ejecutarlo cuando Jest ya ha desmontado el entorno y el runner se llena de
 * errores de importacion: no son fallos reales, pero tapan los que si lo son.
 *
 * Vive aqui y no en cada archivo para que anadir un test nuevo no obligue a
 * acordarse de esto.
 */
afterEach(async () => {
  for (const backend of instancias.splice(0)) {
    await backend.run(async (ctx) => {
      for (const tarea of await ctx.db.system.query("_scheduled_functions").collect()) {
        await ctx.scheduler.cancel(tarea._id);
      }
    });
  }
});

export const ADMIN_IDENTITY = {
  subject: "user_admin_1",
  issuer: "https://clerk.example.com",
  tokenIdentifier: "https://clerk.example.com|user_admin_1",
  name: "Admin User",
} as const;

export const OPERATOR_IDENTITY = {
  subject: "user_operator_1",
  issuer: "https://clerk.example.com",
  tokenIdentifier: "https://clerk.example.com|user_operator_1",
  name: "Operator User",
} as const;

export const VIEWER_IDENTITY = {
  subject: "user_viewer_1",
  issuer: "https://clerk.example.com",
  tokenIdentifier: "https://clerk.example.com|user_viewer_1",
  name: "Viewer User",
} as const;

export const FOREIGN_IDENTITY = {
  subject: "user_foreign_1",
  issuer: "https://clerk.example.com",
  tokenIdentifier: "https://clerk.example.com|user_foreign_1",
  name: "Foreign User",
} as const;
