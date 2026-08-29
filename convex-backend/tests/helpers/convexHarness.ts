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
  "../../convex/seed.ts": () => import("../../convex/seed"),
  "../../convex/lib/errors.ts": () => import("../../convex/lib/errors"),
  "../../convex/lib/authz.ts": () => import("../../convex/lib/authz"),
  "../../convex/lib/time.ts": () => import("../../convex/lib/time"),
  "../../convex/lib/dto/workspaces.ts": () =>
    import("../../convex/lib/dto/workspaces"),
  "../../convex/lib/dto/cameras.ts": () => import("../../convex/lib/dto/cameras"),
  "../../convex/lib/domain/normalize.ts": () =>
    import("../../convex/lib/domain/normalize"),
  "../../convex/lib/domain/group.ts": () =>
    import("../../convex/lib/domain/group"),
  "../../convex/lib/domain/severity.ts": () =>
    import("../../convex/lib/domain/severity"),
  "../../convex/lib/domain/transition.ts": () =>
    import("../../convex/lib/domain/transition"),
  "../../convex/_generated/api.js": () => import("../../convex/_generated/api.js"),
  "../../convex/_generated/server.js": () =>
    import("../../convex/_generated/server.js"),
};

export type SentraTest = TestConvex<typeof schema>;

export function createTestBackend(): SentraTest {
  return convexTest(schema, modules);
}

export const ADMIN_IDENTITY = {
  subject: "user_admin_1",
  issuer: "https://clerk.example.com",
  tokenIdentifier: "https://clerk.example.com|user_admin_1",
  name: "Admin User",
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
