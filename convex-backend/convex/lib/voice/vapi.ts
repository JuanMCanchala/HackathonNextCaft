/**
 * Llamada de voz por Vapi.
 *
 * Se prefiere a Twilio para el aviso hablado por una razon concreta: Twilio
 * lee un texto y cuelga, y quien contesta a las tres de la manana casi siempre
 * quiere preguntar algo -cuantas personas, si sigue en el suelo, si hay que
 * avisar a alguien mas-. Vapi mantiene la conversacion con el contexto del
 * incidente ya cargado, asi que el responsable puede repreguntar sin abrir el
 * panel. El canal de Twilio se mantiene como alternativa.
 *
 * El guion vive en Vapi, no aqui. Desde este backend solo viajan los valores
 * de esta llamada, que el asistente interpola con {{tipo}}, {{camara}} y
 * demas. Asi se puede afinar el tono desde su panel sin volver a desplegar.
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

/**
 * Lo primero que se oye al descolgar.
 *
 * Repite tipo y camara antes de acabar la frase a proposito: por telefono un
 * dato que solo suena una vez se pierde, y esta llamada puede terminar en
 * cuanto la persona entienda que tiene que moverse.
 */
function primeraFrase(d: DatosLlamada): string {
  return (
    `Alerta de seguridad de Sentra. Se ha detectado ${d.tipo} en la camara ${d.camara}, ` +
    `a las ${d.hora}. Repito: ${d.tipo} en camara ${d.camara}.`
  );
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
      // Todo el contexto viaja como variables.
      //
      // Se intento antes pasarlo sobrescribiendo `model.messages`, y Vapi lo
      // rechaza con un 400: un override de modelo tiene que traer el objeto
      // completo, proveedor incluido. Duplicar aqui esa configuracion habria
      // significado que cambiar el modelo en Vapi dejara de surtir efecto.
      variableValues: {
        tipo: datos.tipo,
        camara: datos.camara,
        severidad: datos.severidad,
        hora: datos.hora,
        confianza:
          datos.confianza === null
            ? "no disponible"
            : `${Math.round(datos.confianza * 100)} por ciento`,
        resumen: datos.resumen ?? "no disponible",
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
