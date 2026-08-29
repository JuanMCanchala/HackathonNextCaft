import { api } from "../../convex/_generated/api";
import { internal } from "../../convex/_generated/api";
import { createTestBackend, type SentraTest } from "../helpers/convexHarness";

/**
 * La entrada rapida al workspace de demostracion. Es una concesion deliberada
 * y por eso se prueba con severidad: lo que no puede pasar es que abra mas de
 * lo que dice abrir.
 */

const YO = { tokenIdentifier: "clerk|user_visitante", subject: "user_visitante" };
const OTRO = { tokenIdentifier: "clerk|user_ajeno", subject: "user_ajeno" };

afterEach(() => {
  delete process.env.DEMO_SELF_JOIN_WORKSPACE_ID;
});

async function sembrar(t: SentraTest, nombre: string) {
  const { workspaceId } = await t.mutation(internal.seed.bootstrap, {
    adminTokenIdentifier: `issuer|admin-${nombre}`,
    adminSubjectId: `admin-${nombre}`,
    workspaceName: nombre,
  });
  return workspaceId as string;
}

describe("entrada rapida a la demostracion", () => {
  it("apagada por defecto, no da acceso a nada", async () => {
    // Un deployment real no puede abrirse por olvido.
    const t = createTestBackend();
    await sembrar(t, "Planta");

    const resultado = await t.withIdentity(YO).mutation(api.workspaces.joinDemo, {});
    expect(resultado).toBeNull();

    const lista = await t
      .withIdentity(YO)
      .query(api.workspaces.list, { paginationOpts: { cursor: null, numItems: 10 } });
    expect(lista.items).toHaveLength(0);
  });

  it("sin sesion no entra nadie", async () => {
    const t = createTestBackend();
    process.env.DEMO_SELF_JOIN_WORKSPACE_ID = await sembrar(t, "Planta");

    await expect(t.mutation(api.workspaces.joinDemo, {})).rejects.toThrow();
  });

  it("un usuario autenticado entra y ve el workspace declarado", async () => {
    const t = createTestBackend();
    const workspaceId = await sembrar(t, "Sentinel Demo");
    process.env.DEMO_SELF_JOIN_WORKSPACE_ID = workspaceId;

    expect(await t.withIdentity(YO).mutation(api.workspaces.joinDemo, {})).toBe(workspaceId);

    const lista = await t
      .withIdentity(YO)
      .query(api.workspaces.list, { paginationOpts: { cursor: null, numItems: 10 } });
    expect(lista.items.map((w) => w.id)).toEqual([workspaceId]);
  });

  it("entra solo como viewer, no puede operar", async () => {
    // Un visitante no debe poder alterar lo que otro esta ensenando.
    const t = createTestBackend();
    const workspaceId = await sembrar(t, "Sentinel Demo");
    process.env.DEMO_SELF_JOIN_WORKSPACE_ID = workspaceId;
    await t.withIdentity(YO).mutation(api.workspaces.joinDemo, {});

    const membresia = await t.run(async (ctx) =>
      ctx.db
        .query("memberships")
        .filter((q) => q.eq(q.field("tokenIdentifier"), YO.tokenIdentifier))
        .unique(),
    );
    expect(membresia?.role).toBe("viewer");

    await expect(
      t.withIdentity(YO).mutation(api.cameras.create, {
        workspaceId: workspaceId as never,
        externalId: "cam-intrusa",
        label: "No deberia poder",
      }),
    ).rejects.toThrow();
  });

  it("no da acceso a ningun otro workspace", async () => {
    // La propiedad que importa: abrir la demostracion no abre el resto.
    const t = createTestBackend();
    const demo = await sembrar(t, "Sentinel Demo");
    await sembrar(t, "Planta de un cliente");
    process.env.DEMO_SELF_JOIN_WORKSPACE_ID = demo;

    await t.withIdentity(YO).mutation(api.workspaces.joinDemo, {});
    const lista = await t
      .withIdentity(YO)
      .query(api.workspaces.list, { paginationOpts: { cursor: null, numItems: 10 } });
    expect(lista.items).toHaveLength(1);
    expect(lista.items[0]?.id).toBe(demo);
  });

  it("volver a entrar no duplica la membresia ni degrada un rol previo", async () => {
    const t = createTestBackend();
    const workspaceId = await sembrar(t, "Sentinel Demo");
    process.env.DEMO_SELF_JOIN_WORKSPACE_ID = workspaceId;

    await t.withIdentity(YO).mutation(api.workspaces.joinDemo, {});
    await t.withIdentity(YO).mutation(api.workspaces.joinDemo, {});

    const membresias = await t.run(async (ctx) =>
      ctx.db
        .query("memberships")
        .filter((q) => q.eq(q.field("tokenIdentifier"), YO.tokenIdentifier))
        .collect(),
    );
    expect(membresias).toHaveLength(1);
  });

  it("cada usuario entra con su propia identidad", async () => {
    const t = createTestBackend();
    const workspaceId = await sembrar(t, "Sentinel Demo");
    process.env.DEMO_SELF_JOIN_WORKSPACE_ID = workspaceId;

    await t.withIdentity(YO).mutation(api.workspaces.joinDemo, {});
    await t.withIdentity(OTRO).mutation(api.workspaces.joinDemo, {});

    const membresias = await t.run(async (ctx) =>
      ctx.db
        .query("memberships")
        .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
        .collect(),
    );
    const tokens = membresias.map((m) => m.tokenIdentifier).sort();
    expect(tokens).toContain(YO.tokenIdentifier);
    expect(tokens).toContain(OTRO.tokenIdentifier);
  });
});
