/**
 * Preguntas sobre un incidente, contestadas por Gemini.
 *
 * El operador que abre la ficha ve el clip y un parrafo. Lo que suele querer
 * despues no cabe en una ficha: si hay mas de una persona, si alguien se
 * queda, si conviene avisar a la policia. Esto le deja preguntarlo.
 *
 * DOS LIMITES QUE IMPORTAN.
 *
 * El modelo solo recibe lo que ya esta en la ficha: tipo, camara, hora,
 * confianza y el resumen del verificador. No se le pasa el video ni nada de
 * otro incidente, asi que una pregunta no puede convertirse en una via para
 * sacar datos que la pagina no ensena de todos modos.
 *
 * Se le pide explicitamente que diga cuando no lo sabe. Un operador que
 * decide si llama a una ambulancia necesita distinguir lo que se ve en la
 * escena de lo que el modelo esta suponiendo, y un modelo complaciente es
 * peor que ninguno.
 */

export const MAX_PREGUNTA = 400;

const MODELO = "gemini-flash-latest";

const INSTRUCCIONES = `Eres el asistente de un sistema de videovigilancia. Un operador
acaba de recibir un aviso y te pregunta sobre el incidente.

Reglas:
- Responde en espanol, en dos o tres frases. Sin listas ni encabezados.
- Basate SOLO en los datos del incidente que se te dan. No inventes detalles
  de la escena, ni personas, ni objetos que no aparezcan en el resumen.
- Si la respuesta no esta en los datos, dilo claramente y sugiere que mire el
  clip. Es preferible admitirlo a rellenar el hueco.
- No describas raza, color de piel, etnia, genero, edad, complexion, peinado
  ni vestimenta de nadie. Habla de acciones y de lo que conviene hacer.
- Si te preguntan si hay que llamar a emergencias, recuerda que la decision es
  del operador y explica que apoya cada opcion.`;

export type Incidente = {
  category: string;
  severity: string;
  camera: string;
  openedAt: number;
  confidence: number | null;
  summary: string | null;
};

function contexto(i: Incidente): string {
  const lineas = [
    `Tipo detectado: ${i.category}`,
    `Severidad: ${i.severity}`,
    `Camara: ${i.camera}`,
    `Hora: ${new Date(i.openedAt).toLocaleString("es-ES")}`,
  ];
  if (i.confidence !== null) {
    lineas.push(`Confianza del detector: ${Math.round(i.confidence * 100)}%`);
  }
  lineas.push(
    i.summary === null
      ? "Descripcion de la escena: no disponible."
      : `Descripcion de la escena segun el verificador de video: ${i.summary}`,
  );
  return lineas.join("\n");
}

export type Respuesta = { ok: true; texto: string } | { ok: false; motivo: string };

export async function preguntar(
  apiKey: string,
  incidente: Incidente,
  pregunta: string,
): Promise<Respuesta> {
  const limpia = pregunta.trim().slice(0, MAX_PREGUNTA);
  if (limpia.length === 0) {
    return { ok: false, motivo: "Escribe una pregunta." };
  }

  const cuerpo = {
    system_instruction: { parts: [{ text: INSTRUCCIONES }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `Datos del incidente:\n${contexto(incidente)}\n\nPregunta: ${limpia}` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
      // Sin esto el modelo gasta el presupuesto razonando y la respuesta sale
      // cortada a media frase. Aqui no hace falta: la pregunta es corta, el
      // contexto cabe entero y quien espera es un operador mirando el movil.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  try {
    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!respuesta.ok) {
      // El cuerpo del error puede repetir la clave: no sale de aqui.
      return { ok: false, motivo: `El asistente no respondio (${respuesta.status}).` };
    }
    const datos = (await respuesta.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const texto = (datos.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return texto.length === 0
      ? { ok: false, motivo: "El asistente no supo que responder." }
      : { ok: true, texto };
  } catch {
    return { ok: false, motivo: "El asistente tardo demasiado en responder." };
  }
}
