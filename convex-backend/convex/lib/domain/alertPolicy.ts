import type { OperationalSeverity } from "./severity";

/**
 * Que incidente merece sacar a alguien de lo que este haciendo.
 *
 * Esto es logica pura a proposito: es la unica parte del sistema cuyo efecto
 * sale del ordenador y no se puede deshacer. Una llamada de madrugada por un
 * falso positivo cuesta credibilidad, y la segunda vez ya nadie contesta.
 *
 * La decision de diseno que importa: se avisa por INCIDENTE ABIERTO, no por
 * deteccion. Una pelea de treinta segundos entra como decenas de detecciones
 * que `acceptNormalized` agrupa en un solo incidente; solo la que lo abre
 * lleva `disposition: "created"`. Enganchar el aviso ahi da una llamada por
 * pelea sin escribir una sola linea de antirrebote.
 */

export type AlertChannel = "call" | "email";

export type ChannelConfig = {
  minSeverity: OperationalSeverity;
  configured: boolean;
};

export type AlertConfig = Record<AlertChannel, ChannelConfig>;

export type AlertDecision =
  | { alert: true; channels: AlertChannel[] }
  | {
      alert: false;
      reason: "not-a-new-incident" | "below-threshold" | "no-channel-configured";
    };

const RANK: Record<OperationalSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// Por defecto solo lo critico (agresion, caida) levanta el telefono; humo e
// intrusion se quedan en correo. Ambos se pueden subir desde el entorno, nunca
// bajar por accidente: un valor que no se reconoce vuelve a este.
const DEFAULT_MIN_SEVERITY: Record<AlertChannel, OperationalSeverity> = {
  call: "critical",
  email: "high",
};

function parseSeverity(
  raw: string | undefined,
  fallback: OperationalSeverity,
): OperationalSeverity {
  if (raw !== undefined && raw in RANK) {
    return raw as OperationalSeverity;
  }
  return fallback;
}

/**
 * Lee la configuracion del deployment sin tocar `process.env`, para poder
 * probar cada combinacion sin ensuciar el entorno del test.
 *
 * Un canal cuenta como configurado solo si tiene TODO lo que necesita. Faltando
 * una variable se queda fuera desde el principio, en vez de fallar a mitad de
 * la llamada al proveedor cuando el incidente ya esta abierto.
 */
export function parseAlertConfig(env: Record<string, string | undefined>): AlertConfig {
  const emailListo =
    Boolean(env.RESEND_API_KEY) && Boolean(env.ALERT_EMAIL_FROM) && Boolean(env.ALERT_EMAIL_TO);
  // Dos proveedores de voz. Vapi manda si esta completo: mantiene la
  // conversacion, asi que quien contesta puede repreguntar. Twilio lee un
  // texto y cuelga, y se queda como alternativa.
  const vapiListo =
    Boolean(env.VAPI_API_KEY) &&
    Boolean(env.VAPI_ASSISTANT_ID) &&
    Boolean(env.VAPI_PHONE_NUMBER_ID) &&
    Boolean(env.ALERT_PHONE_TO);
  const twilioListo =
    Boolean(env.TWILIO_ACCOUNT_SID) &&
    Boolean(env.TWILIO_AUTH_TOKEN) &&
    Boolean(env.TWILIO_FROM) &&
    Boolean(env.ALERT_PHONE_TO);
  const llamadaLista = vapiListo || twilioListo;

  return {
    call: {
      minSeverity: parseSeverity(env.ALERT_CALL_MIN_SEVERITY, DEFAULT_MIN_SEVERITY.call),
      configured: llamadaLista,
    },
    email: {
      minSeverity: parseSeverity(env.ALERT_EMAIL_MIN_SEVERITY, DEFAULT_MIN_SEVERITY.email),
      configured: emailListo,
    },
  };
}

export function decideAlert(input: {
  disposition: "created" | "grouped" | "duplicate";
  severity: OperationalSeverity;
  config: AlertConfig;
}): AlertDecision {
  if (input.disposition !== "created") {
    return { alert: false, reason: "not-a-new-incident" };
  }

  const disponibles = (Object.keys(input.config) as AlertChannel[]).filter(
    (canal) => input.config[canal].configured,
  );
  if (disponibles.length === 0) {
    return { alert: false, reason: "no-channel-configured" };
  }

  const channels = disponibles.filter(
    (canal) => RANK[input.severity] >= RANK[input.config[canal].minSeverity],
  );
  if (channels.length === 0) {
    return { alert: false, reason: "below-threshold" };
  }
  return { alert: true, channels };
}
