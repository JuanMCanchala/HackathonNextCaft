import type { Doc } from "../../_generated/dataModel";
import { toRfc3339 } from "../time";

/**
 * Lo que el panel necesita de una deteccion.
 *
 * Hasta ahora el frontend solo recibia los identificadores dentro del detalle
 * del incidente, asi que la ficha ensenaba una lista de cadenas y nada mas: ni
 * el clip, ni lo que el verificador dijo que veia. Toda esa informacion estaba
 * guardada; simplemente no habia por donde pedirla.
 */
export type DetectionDto = {
  id: string;
  workspaceId: string;
  cameraId: string;
  incidentId: string | null;
  occurredAt: string;
  receivedAt: string;
  category: string;
  suggestedCategory: string;
  confidence: number;
  modelVersion: string;
  detectorVersion: string;
  /** Lo que el verificador describe de la escena, en lenguaje humano. */
  summary: string | null;
  evidenceIds: string[];
};

export function toDetection(doc: Doc<"detections">, incidentId: string | null): DetectionDto {
  return {
    id: doc._id,
    workspaceId: doc.workspaceId,
    cameraId: doc.cameraId,
    incidentId,
    occurredAt: toRfc3339(doc.occurredAt),
    receivedAt: toRfc3339(doc.receivedAt),
    category: doc.category,
    // El contrato del panel espera una cadena; cuando el modelo no propuso
    // nada concreto vale la categoria normalizada.
    suggestedCategory: doc.suggestedCategory ?? doc.category,
    confidence: doc.confidence,
    modelVersion: doc.modelVersion ?? "",
    detectorVersion: doc.detectorVersion ?? "",
    summary: doc.summary ?? null,
    evidenceIds: doc.evidenceRefs ?? [],
  };
}
