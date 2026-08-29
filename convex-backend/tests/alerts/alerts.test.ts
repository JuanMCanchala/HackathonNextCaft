import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createTestBackend, type SentraTest } from "../helpers/convexHarness";

/**
 * El aviso es la unica parte del sistema que actua fuera del ordenador. Estos
 * casos cubren lo que puede salir mal de forma cara:
 *
 *   - llamar diez veces por la misma pelea,
 *   - llamar por algo que no lo merece,
 *   - y que un proveedor caido se lleve por delante el incidente.
 *
 * La cadena se prueba en dos tramos en vez de end-to-end a proposito. El
 * planificador de `convex-test` deja la funcion en `pending` hasta que alguien
 * avanza los temporizadores, y hacerlo con temporizadores falsos cuelga el
 * runner: la accion espera un `fetch` que ya no avanza. Asi que se comprueba
 * (a) que el intake PROGRAMA el aviso con los datos correctos, y (b) que la
 * accion hace lo que debe con cada entrada. Junto cubre lo mismo sin depender
 * de la emulacion de tiempo.
 *
 * `fetch` esta interceptado: ningun test sale a la red ni marca un telefono.
 */

type Llamada = { url: string; init: RequestInit };

let llamadas: Llamada[] = [];
let respuesta: () => Response;

const fetchOriginal = global.fetch;

const ENTORNO_COMPLETO: Record<string, string> = {
  RESEND_API_KEY: "re_test",
  ALERT_EMAIL_FROM: "alerta@ejemplo.com",
  ALERT_EMAIL_TO: "guardia@ejemplo.com",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "token_test",
  TWILIO_FROM: "+15550000000",
  ALERT_PHONE_TO: "+34600000000",
};

const CLAVES_OPCIONALES = ["ALERT_CALL_MIN_SEVERITY", "ALERT_EMAIL_MIN_SEVERITY"];

beforeEach(() => {
  llamadas = [];
  respuesta = () => new Response(JSON.stringify({ id: "ok" }), { status: 200 });
  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return respuesta();
  }) as typeof fetch;
  Object.assign(process.env, ENTORNO_COMPLETO);
});

afterEach(() => {
  global.fetch = fetchOriginal;
  for (const clave of [...Object.keys(ENTORNO_COMPLETO), ...CLAVES_OPCIONALES]) {
    delete process.env[clave];
  }
});

async function sembrar(t: SentraTest) {
  const { workspaceId } = await t.mutation(internal.seed.bootstrap, {
    adminTokenIdentifier: "issuer|admin-alerts",
    adminSubjectId: "admin-alerts",
    workspaceName: "Planta con avisos",
  });
  const camara = await t
    .withIdentity({ tokenIdentifier: "issuer|admin-alerts", subject: "admin-alerts" })
    .mutation(api.cameras.create, {
      workspaceId: workspaceId as Id<"workspaces">,
      externalId: "cam-alerts-1",
      label: "Anden 3",
    });
  return {
    workspaceId: workspaceId as Id<"workspaces">,
    cameraId: camara.id as Id<"cameras">,
  };
}

function observacion(
  workspaceId: Id<"workspaces">,
  cameraId: Id<"cameras">,
  extra: Record<string, unknown> = {},
) {
  return {
    workspaceId,
    cameraId,
    sourceNamespace: "sentinel-vision",
    sourceEventId: "evt-alert-1",
    timestamp: "2026-08-29T12:00:00Z",
    category: "violence",
    confidence: 0.91,
    modelVersion: "gemini-3.5-flash-lite",
    detectorVersion: "yolo11n-pose.pt@480",
    ...extra,
  };
}

/** Lo que el intake dejo encolado, sin ejecutarlo. */
async function programado(t: SentraTest) {
  return t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
}

async function tiempoDe(t: SentraTest, incidentId: string) {
  return t.run(async (ctx) =>
    ctx.db
      .query("incidentTimeline")
      .filter((q) => q.eq(q.field("incidentId"), incidentId))
      .collect(),
  );
}

describe("el intake encola el aviso", () => {
  it("un incidente nuevo encola el envio con disposition created", async () => {
    const t = createTestBackend();
    const { workspaceId, cameraId } = await sembrar(t);

    const resultado = await t.mutation(
      internal.detections.acceptNormalized,
      observacion(workspaceId, cameraId),
    );

    const cola = await programado(t);
    expect(cola).toHaveLength(1);
    expect(cola[0]?.name).toBe("alerts:dispatch");
    expect(cola[0]?.args[0]).toEqual({
      incidentId: resultado.incidentId,
      disposition: "created",
    });
  });

  it("la segunda deteccion de la misma pelea se encola como grouped", async () => {
    // Es la proteccion que de verdad importa: treinta segundos de pelea entran
    // como muchas detecciones y un solo incidente. La politica descarta
    // `grouped`, asi que el telefono suena una vez.
    const t = createTestBackend();
    const { workspaceId, cameraId } = await sembrar(t);

    const primera = await t.mutation(
      internal.detections.acceptNormalized,
      observacion(workspaceId, cameraId),
    );
    const segunda = await t.mutation(
      internal.detections.acceptNormalized,
      observacion(workspaceId, cameraId, {
        sourceEventId: "evt-alert-2",
        timestamp: "2026-08-29T12:00:04Z",
      }),
    );

    expect(segunda.incidentId).toBe(primera.incidentId);
    expect(segunda.disposition).toBe("grouped");

    const cola = await programado(t);
    const disposiciones = cola.map(
      (tarea) => (tarea.args[0] as { disposition: string }).disposition,
    );
    expect(disposiciones).toEqual(["created", "grouped"]);
  });
});

describe("la accion de aviso", () => {
  async function incidenteDe(t: SentraTest, categoria: string) {
    const { workspaceId, cameraId } = await sembrar(t);
    const resultado = await t.mutation(
      internal.detections.acceptNormalized,
      observacion(workspaceId, cameraId, { category: categoria }),
    );
    return resultado.incidentId;
  }

  it("una agresion nueva llama por telefono y manda correo", async () => {
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "violence");

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const destinos = llamadas.map((c) => c.url);
    expect(destinos.some((u) => u.includes("api.twilio.com"))).toBe(true);
    expect(destinos.some((u) => u.includes("api.resend.com"))).toBe(true);

    const eventos = await tiempoDe(t, incidentId);
    expect(eventos.filter((e) => e.type === "alert.sent")).toHaveLength(2);
  });

  it("la llamada dice el tipo de incidente y la camara", async () => {
    // Quien contesta el telefono de madrugada necesita saber a donde ir antes
    // de abrir el panel.
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "violence");

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const twilio = llamadas.find((c) => c.url.includes("api.twilio.com"));
    expect(twilio).toBeDefined();
    const twiml = new URLSearchParams(String(twilio?.init.body ?? "")).get("Twiml") ?? "";
    expect(twiml).toContain("agresion");
    expect(twiml).toContain("Anden 3");
  });

  it("un incidente agrupado no avisa a nadie", async () => {
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "violence");

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "grouped" });

    expect(llamadas).toHaveLength(0);
    const eventos = await tiempoDe(t, incidentId);
    expect(eventos.some((e) => String(e.type).startsWith("alert."))).toBe(false);
  });

  it("un robo manda correo pero no levanta el telefono", async () => {
    // theft es medium en sev-v2: perdida economica, nadie en peligro.
    const t = createTestBackend();
    process.env.ALERT_EMAIL_MIN_SEVERITY = "medium";
    const incidentId = await incidenteDe(t, "theft");

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    expect(llamadas.some((c) => c.url.includes("api.twilio.com"))).toBe(false);
    expect(llamadas.some((c) => c.url.includes("api.resend.com"))).toBe(true);
  });

  it("con los umbrales por defecto un robo no avisa por ningun canal", async () => {
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "theft");

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    expect(llamadas).toHaveLength(0);
    const eventos = await tiempoDe(t, incidentId);
    const saltado = eventos.find((e) => e.type === "alert.skipped");
    expect(saltado?.payload?.reason).toBe("below-threshold");
  });

  it("sin credenciales no se intenta nada y queda el motivo", async () => {
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "violence");
    for (const clave of Object.keys(ENTORNO_COMPLETO)) {
      delete process.env[clave];
    }

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    expect(llamadas).toHaveLength(0);
    const eventos = await tiempoDe(t, incidentId);
    const saltado = eventos.find((e) => e.type === "alert.skipped");
    expect(saltado?.payload?.reason).toBe("no-channel-configured");
  });

  it("si el proveedor falla la accion no revienta y queda el motivo", async () => {
    // Un 429 de Twilio no puede propagarse: el incidente ya esta guardado y
    // reventar aqui solo llenaria los logs del deployment.
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "violence");
    respuesta = () => new Response("rate limited", { status: 429 });

    await expect(
      t.action(internal.alerts.dispatch, { incidentId, disposition: "created" }),
    ).resolves.toBeNull();

    const eventos = await tiempoDe(t, incidentId);
    const fallidos = eventos.filter((e) => e.type === "alert.failed");
    expect(fallidos).toHaveLength(2);
    expect(String(fallidos[0]?.payload?.detail)).toContain("429");
  });

  it("un canal caido no impide que salga el otro", async () => {
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "violence");
    respuesta = () => {
      throw new Error("socket cerrado");
    };
    let primera = true;
    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      llamadas.push({ url: String(url), init: init ?? {} });
      if (primera) {
        primera = false;
        throw new Error("socket cerrado");
      }
      return new Response(JSON.stringify({ id: "ok" }), { status: 200 });
    }) as typeof fetch;

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const eventos = await tiempoDe(t, incidentId);
    expect(eventos.filter((e) => e.type === "alert.sent")).toHaveLength(1);
    expect(eventos.filter((e) => e.type === "alert.failed")).toHaveLength(1);
  });

  it("el rastro del aviso no guarda credenciales", async () => {
    // La linea de tiempo la lee cualquier miembro del workspace.
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "violence");
    respuesta = () => new Response("invalid token ACtest/token_test", { status: 401 });

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const serializado = JSON.stringify(await tiempoDe(t, incidentId));
    expect(serializado).not.toContain("token_test");
    expect(serializado).not.toContain("re_test");
  });

  it("un incidente que ya no existe no revienta la accion", async () => {
    const t = createTestBackend();
    const incidentId = await incidenteDe(t, "violence");
    await t.run(async (ctx) => ctx.db.delete(incidentId as Id<"incidents">));

    await expect(
      t.action(internal.alerts.dispatch, { incidentId, disposition: "created" }),
    ).resolves.toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});

describe("el correo lleva la escena", () => {
  async function conEvidencia(t: SentraTest, refs: string[]) {
    const { workspaceId, cameraId } = await sembrar(t);
    const resultado = await t.mutation(
      internal.detections.acceptNormalized,
      observacion(workspaceId, cameraId, { evidenceRefs: refs }),
    );
    return resultado.incidentId;
  }

  function htmlEnviado(): string {
    const resend = llamadas.find((c) => c.url.includes("api.resend.com"));
    return String(JSON.parse(String(resend?.init.body ?? "{}")).html ?? "");
  }

  it("incrusta el fotograma del incidente", async () => {
    const t = createTestBackend();
    const incidentId = await conEvidencia(t, [
      "https://adventurous-wolf-401.convex.cloud/api/storage/abc.jpg",
    ]);

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const html = htmlEnviado();
    expect(html).toContain("<img");
    expect(html).toContain("adventurous-wolf-401.convex.cloud/api/storage/abc.jpg");
    expect(html).toContain("Anden 3");
    expect(html).toContain("agresion");
  });

  it("descarta las referencias que apuntan al equipo del analisis", async () => {
    // El pipeline manda tambien rutas de su propio servidor local. Incrustarlas
    // daria una imagen rota en el correo, que es peor que no poner ninguna.
    const t = createTestBackend();
    const incidentId = await conEvidencia(t, ["http://192.168.1.40:8000/clips/abc_03.jpg"]);

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const html = htmlEnviado();
    expect(html).not.toContain("<img");
    expect(html).not.toContain("192.168.1.40");
    expect(html).toContain("Sin clip disponible");
  });

  it("sin evidencia el correo sigue diciendo que ha pasado y donde", async () => {
    const t = createTestBackend();
    const incidentId = await conEvidencia(t, []);

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const html = htmlEnviado();
    expect(html).toContain("agresion");
    expect(html).toContain("Anden 3");
    expect(html).toContain("CRITICAL".toLowerCase());
  });

  it("manda tambien version en texto plano", async () => {
    // Es lo que se lee cuando el cliente bloquea HTML, y ayuda a no caer en spam.
    const t = createTestBackend();
    const incidentId = await conEvidencia(t, []);

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const resend = llamadas.find((c) => c.url.includes("api.resend.com"));
    const cuerpo = JSON.parse(String(resend?.init.body ?? "{}"));
    expect(String(cuerpo.text)).toContain("agresion");
    expect(String(cuerpo.html).length).toBeGreaterThan(String(cuerpo.text).length);
  });

  it("una etiqueta de camara con html no se cuela en el correo", async () => {
    const t = createTestBackend();
    const { workspaceId } = await t.mutation(internal.seed.bootstrap, {
      adminTokenIdentifier: "issuer|admin-xss",
      adminSubjectId: "admin-xss",
      workspaceName: "Planta",
    });
    const camara = await t
      .withIdentity({ tokenIdentifier: "issuer|admin-xss", subject: "admin-xss" })
      .mutation(api.cameras.create, {
        workspaceId: workspaceId as Id<"workspaces">,
        externalId: "cam-xss",
        label: "<script>alert(1)</script>",
      });
    const resultado = await t.mutation(
      internal.detections.acceptNormalized,
      observacion(workspaceId as Id<"workspaces">, camara.id as Id<"cameras">),
    );

    await t.action(internal.alerts.dispatch, {
      incidentId: resultado.incidentId,
      disposition: "created",
    });

    const html = htmlEnviado();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("varios destinatarios se mandan como lista", async () => {
    const t = createTestBackend();
    process.env.ALERT_EMAIL_TO = " uno@ejemplo.com , dos@ejemplo.com ";
    const incidentId = await conEvidencia(t, []);

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const resend = llamadas.find((c) => c.url.includes("api.resend.com"));
    const cuerpo = JSON.parse(String(resend?.init.body ?? "{}"));
    expect(cuerpo.to).toEqual(["uno@ejemplo.com", "dos@ejemplo.com"]);
  });
});

describe("el correo lleva al panel", () => {
  async function incidenteCon(t: SentraTest, refs: string[]) {
    const { workspaceId, cameraId } = await sembrar(t);
    const resultado = await t.mutation(
      internal.detections.acceptNormalized,
      observacion(workspaceId, cameraId, { evidenceRefs: refs }),
    );
    return resultado.incidentId;
  }

  function htmlEnviado(): string {
    const resend = llamadas.find((c) => c.url.includes("api.resend.com"));
    return String(JSON.parse(String(resend?.init.body ?? "{}")).html ?? "");
  }

  afterEach(() => {
    delete process.env.DEMO_PUBLIC_URL;
  });

  it("el boton apunta a la ficha de ESTE incidente", async () => {
    const t = createTestBackend();
    process.env.DEMO_PUBLIC_URL = "https://ejemplo.convex.site/demo";
    const incidentId = await incidenteCon(t, []);

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const html = htmlEnviado();
    expect(html).toContain(`https://ejemplo.convex.site/incidente?id=${incidentId}`);
    expect(html).toContain("Abrir el incidente en el panel");
  });

  it("sin panel configurado el correo sigue siendo util", async () => {
    // El aviso no puede depender de que exista un panel publico.
    const t = createTestBackend();
    const incidentId = await incidenteCon(t, []);

    await t.action(internal.alerts.dispatch, { incidentId, disposition: "created" });

    const html = htmlEnviado();
    expect(html).not.toContain("Abrir el incidente");
    expect(html).toContain("agresion");
    expect(html).toContain("Anden 3");
  });
});

describe("ficha publica de un incidente", () => {
  afterEach(() => {
    delete process.env.DEMO_PUBLIC_WORKSPACE_ID;
  });

  async function incidenteEn(t: SentraTest, nombre: string) {
    const { workspaceId } = await t.mutation(internal.seed.bootstrap, {
      adminTokenIdentifier: `issuer|admin-${nombre}`,
      adminSubjectId: `admin-${nombre}`,
      workspaceName: nombre,
    });
    const camara = await t
      .withIdentity({ tokenIdentifier: `issuer|admin-${nombre}`, subject: `admin-${nombre}` })
      .mutation(api.cameras.create, {
        workspaceId: workspaceId as Id<"workspaces">,
        externalId: `cam-${nombre}`,
        label: "Nave 2",
      });
    const resultado = await t.mutation(
      internal.detections.acceptNormalized,
      observacion(workspaceId as Id<"workspaces">, camara.id as Id<"cameras">, {
        sourceEventId: `evt-${nombre}`,
        evidenceRefs: ["https://cdn.ejemplo.com/clip.gif"],
      }),
    );
    return { workspaceId: workspaceId as string, incidentId: resultado.incidentId };
  }

  it("muestra el clip y los datos del incidente", async () => {
    const t = createTestBackend();
    const { workspaceId, incidentId } = await incidenteEn(t, "propia");
    process.env.DEMO_PUBLIC_WORKSPACE_ID = workspaceId;

    const res = await t.fetch(`/incidente?id=${incidentId}`, { method: "GET" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("https://cdn.ejemplo.com/clip.gif");
    expect(html).toContain("Nave 2");
    expect(html).toContain("Agresion");
  });

  it("un incidente de otro workspace no existe para esta vista", async () => {
    // Es la propiedad que importa: tener el id no basta, la consulta esta
    // anclada al workspace que el deployment declara.
    const t = createTestBackend();
    const propia = await incidenteEn(t, "propia");
    const ajena = await incidenteEn(t, "ajena");
    process.env.DEMO_PUBLIC_WORKSPACE_ID = propia.workspaceId;

    const res = await t.fetch(`/incidente?id=${ajena.incidentId}`, { method: "GET" });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Nave 2");
  });

  it("un id inventado responde 404 sin reventar", async () => {
    const t = createTestBackend();
    const { workspaceId } = await incidenteEn(t, "propia");
    process.env.DEMO_PUBLIC_WORKSPACE_ID = workspaceId;

    const res = await t.fetch("/incidente?id=esto-no-es-un-id", { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("sin la vista habilitada responde 404", async () => {
    const t = createTestBackend();
    const { incidentId } = await incidenteEn(t, "propia");

    const res = await t.fetch(`/incidente?id=${incidentId}`, { method: "GET" });
    expect(res.status).toBe(404);
  });
});
