/**
 * Llamada de voz por Vapi.
 *
 * Se prefiere a Twilio para el aviso hablado por una razon concreta: Twilio
 * lee un texto y cuelga, y quien contesta a las tres de la manana casi siempre
 * quiere preguntar algo -cuantas personas, si sigue en el suelo, si hay que
 * avisar a nadie mas-. Vapi mantiene la conversacion con el contexto del
 * incidente ya cargado, asi que el responsable puede repreguntar sin abrir el
 * panel. El canal de Twilio se mantiene como alternativa.
 *
 * Los datos del incidente van en `assistantOverrides.variableValues`, no
 * concatenados en el guion: el asistente vive en Vapi y aqui solo se le pasan
 * los valores de esta llamada. Asi el guion se puede afinar desde su panel sin
 * volver a desplegar este backend.
 */

export type DatosLlamada = {
  tipo: string;
  camara: string;
  severidad: string;
  hora: string;
  confianza: number | null;
  resumen: string | null;
};

export type ResultadoLlamada = { ok: boolean; detalle: string };

const TIMEOUT_MS = 15_000;

function primeraFrase(d: DatosLlamada): string {
  return (
    `Alerta de seguridad de Sentinel. Se ha detectado ${d.tipo} en la camara ${d.camara}, ` +
    `a las ${d.hora}. Repito: ${d.tipo} en camara ${d.camara}.`
  );
}

function contexto(d: DatosLlamada): string {
  const lineas = [
    `Tipo de incidente: ${d.tipo}`,
    `Camara: ${d.camara}`,
    `Severidad: ${d.severidad}`,
    `Hora: ${d.hora}`,
  ];
  if (d.confianza !== null) {
    lineas.push(`Confianza del detector: ${Math.round(d.confianza * 100)} por ciento`);
  }
  lineas.push(
    d.resumen === null
      ? "Descripcion de la escena: no disponible."
      : `Descripcion de la escena: ${d.resumen}`,
  );
  return lineas.join("\n");
}

export async function llamarPorVapi(
  env: NodeJS.ProcessEnv,
  datos: DatosLlamada,
  recortar: (texto: string) => string,
): Promise<ResultadoLlamada> {
  const cuerpo = {
    phoneNumberId: env.VAPI_PHONE_NUMBER_ID,
    assistantId: env.VAPI_ASSISTANT_ID,
    customer: { number: env.ALERT_PHONE_TO },
    assistantOverrides: {
      firstMessage: primeraFrase(datos),
      variableValues: {
        tipo: datos.tipo,
        camara: datos.camara,
        severidad: datos.severidad,
        hora: datos.hora,
        resumen: datos.resumen ?? "no disponible",
      },
      // El contexto va como mensaje de sistema adicional para que el asistente
      // pueda contestar repreguntas sin inventarse nada.
      model: {
        messages: [
          {
            role: "system",
            content: `Datos del incidente que motiva esta llamada:\n${contexto(datos)}`,
          },
        ],
      },
    },
  };

  try {
    const respuesta = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) {
      return {
        ok: false,
        detalle: recortar(`http ${respuesta.status}: ${await respuesta.text()}`),
      };
    }
    const datosRespuesta = (await respuesta.json()) as { id?: string };
    return { ok: true, detalle: `vapi ${datosRespuesta.id ?? "ok"}` };
  } catch (error) {
    return {
      ok: false,
      detalle: recortar(error instanceof Error ? error.message : "fallo desconocido"),
    };
  }
}

/** Un canal solo cuenta como configurado si tiene todo lo que necesita. */
export function vapiConfigurado(env: NodeJS.ProcessEnv): boolean {
  return (
    Boolean(env.VAPI_API_KEY) &&
    Boolean(env.VAPI_ASSISTANT_ID) &&
    Boolean(env.VAPI_PHONE_NUMBER_ID) &&
    Boolean(env.ALERT_PHONE_TO)
  );
}
