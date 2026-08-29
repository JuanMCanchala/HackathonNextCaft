import {
  decideAlert,
  parseAlertConfig,
  type AlertConfig,
} from "../../convex/lib/domain/alertPolicy";

/**
 * La politica de aviso decide a quien se molesta y cuando. Es la parte del
 * sistema con consecuencias fuera del ordenador: una llamada a las 3 de la
 * manana no se puede deshacer. Por eso vive en una funcion pura y se prueba
 * sin red.
 *
 * Lo que de verdad protege el sistema es el primer caso: una pelea de treinta
 * segundos llega como muchas detecciones y UN incidente. Avisar por deteccion
 * seria llamar diez veces por la misma pelea.
 */

const TODO_CONFIGURADO: AlertConfig = {
  call: { minSeverity: "critical", configured: true },
  email: { minSeverity: "high", configured: true },
};

describe("politica de aviso", () => {
  it("solo avisa cuando el incidente es nuevo, nunca al agrupar", () => {
    for (const disposition of ["grouped", "duplicate"] as const) {
      const decision = decideAlert({
        disposition,
        severity: "critical",
        config: TODO_CONFIGURADO,
      });
      expect(decision).toEqual({ alert: false, reason: "not-a-new-incident" });
    }
  });

  it("llama y escribe cuando una agresion abre incidente", () => {
    const decision = decideAlert({
      disposition: "created",
      severity: "critical",
      config: TODO_CONFIGURADO,
    });
    expect(decision).toEqual({ alert: true, channels: ["call", "email"] });
  });

  it("un robo escribe pero no llama", () => {
    // theft es medium en sev-v2: no justifica despertar a nadie.
    const decision = decideAlert({
      disposition: "created",
      severity: "medium",
      config: TODO_CONFIGURADO,
    });
    expect(decision).toEqual({ alert: false, reason: "below-threshold" });
  });

  it("humo escribe correo pero no llama", () => {
    const decision = decideAlert({
      disposition: "created",
      severity: "high",
      config: TODO_CONFIGURADO,
    });
    expect(decision).toEqual({ alert: true, channels: ["email"] });
  });

  it("un canal sin credenciales no se intenta", () => {
    const decision = decideAlert({
      disposition: "created",
      severity: "critical",
      config: {
        call: { minSeverity: "critical", configured: false },
        email: { minSeverity: "high", configured: true },
      },
    });
    expect(decision).toEqual({ alert: true, channels: ["email"] });
  });

  it("sin ningun canal configurado no avisa y lo dice", () => {
    const decision = decideAlert({
      disposition: "created",
      severity: "critical",
      config: {
        call: { minSeverity: "critical", configured: false },
        email: { minSeverity: "high", configured: false },
      },
    });
    expect(decision).toEqual({ alert: false, reason: "no-channel-configured" });
  });
});

describe("lectura de la configuracion del deployment", () => {
  it("sin variables, ningun canal queda configurado", () => {
    const config = parseAlertConfig({});
    expect(config.call.configured).toBe(false);
    expect(config.email.configured).toBe(false);
  });

  it("el correo exige clave, remitente y destinatario", () => {
    // Faltando el destinatario no hay a quien escribir: queda sin configurar
    // en vez de fallar al vuelo dentro de la accion.
    const incompleto = parseAlertConfig({
      RESEND_API_KEY: "re_x",
      ALERT_EMAIL_FROM: "alerta@ejemplo.com",
    });
    expect(incompleto.email.configured).toBe(false);

    const completo = parseAlertConfig({
      RESEND_API_KEY: "re_x",
      ALERT_EMAIL_FROM: "alerta@ejemplo.com",
      ALERT_EMAIL_TO: "guardia@ejemplo.com",
    });
    expect(completo.email.configured).toBe(true);
  });

  it("la llamada exige las cuatro variables de Twilio", () => {
    const config = parseAlertConfig({
      TWILIO_ACCOUNT_SID: "AC1",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_FROM: "+15550000000",
      ALERT_PHONE_TO: "+34600000000",
    });
    expect(config.call.configured).toBe(true);
  });

  it("el umbral por canal se puede subir desde el entorno", () => {
    const config = parseAlertConfig({ ALERT_EMAIL_MIN_SEVERITY: "critical" });
    expect(config.email.minSeverity).toBe("critical");
  });

  it("un umbral invalido cae al valor por defecto en vez de abrir la puerta", () => {
    // Una errata en una variable de entorno no puede acabar llamando por un
    // incidente de severidad baja.
    const config = parseAlertConfig({ ALERT_CALL_MIN_SEVERITY: "urgente" });
    expect(config.call.minSeverity).toBe("critical");
  });
});
