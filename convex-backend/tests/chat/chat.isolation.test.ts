import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../../convex/_generated/api";
import { VIEWER_IDENTITY, createTestBackend } from "../helpers/convexHarness";
import { expectApiError } from "../helpers/apiErrorAssert";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Chat/Agent is intentionally NOT the Sentra auth baseline.
 * Sentra product authz lives in workspaces/cameras/incidents via lib/authz.
 */
describe("chat isolation from Sentra auth baseline", () => {
  it("keeps chat free of Sentra authz imports while incidents use membership", () => {
    const chatSource = readFileSync(path.join(here, "../../convex/chat.ts"), "utf8");
    const incidentsSource = readFileSync(path.join(here, "../../convex/incidents.ts"), "utf8");

    expect(chatSource).toContain("NOT the Sentra product auth baseline");
    expect(chatSource).not.toMatch(/from ["']\.\/lib\/authz["']/);
    expect(incidentsSource).toMatch(/from ["']\.\/lib\/authz["']/);
    expect(api.chat.createThread).toBeDefined();
    expect(api.incidents.list).toBeDefined();
  });

  it("Sentra incident reads require membership (chat does not substitute Sentra authz)", async () => {
    const t = createTestBackend();
    const workspaceId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("workspaces", {
        name: "Chat Boundary",
        status: "active",
        settings: {
          groupingWindowSeconds: 45,
          retentionDays: 30,
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });
    });

    const asViewer = t.withIdentity(VIEWER_IDENTITY);
    await expectApiError(
      asViewer.query(api.incidents.list, {
        workspaceId,
        paginationOpts: { cursor: null, numItems: 5 },
      }),
      { code: "NOT_FOUND" },
    );
  });
});
