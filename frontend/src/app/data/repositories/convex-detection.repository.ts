import { Injectable, inject } from '@angular/core';
import { ConvexClientService } from '../../core/convex/convex-client.service';
import type { Detection } from '../../core/models/detection';
import type { Page } from '../../core/models/page';
import type { ListQuery } from '../../core/models/requests';
import { clampLimit } from '../../core/validation/schemas';
import type { DetectionRepository } from './detection.repository';

/**
 * Detecciones de un incidente.
 *
 * Antes devolvia una pagina vacia porque no existia consulta en Convex: el
 * detalle del incidente solo recibia identificadores y ensenaba una lista de
 * cadenas, sin el clip ni el analisis del verificador. Ahora `detections
 * :listByIncident` los sirve completos.
 *
 * No se valida con Zod como el resto de repositorios: el esquema `Detection`
 * del panel no contempla `summary`, que es justo el campo que hace util esta
 * ficha, y ampliarlo tocaria el contrato compartido. Se hace una conversion
 * acotada y con valores por defecto.
 */
@Injectable()
export class ConvexDetectionRepository implements DetectionRepository {
  private readonly convex = inject(ConvexClientService);

  async listByIncident(incidentId: string, query?: ListQuery): Promise<Page<Detection>> {
    const raw = await this.convex.query<{
      items: Array<Record<string, unknown>>;
      nextCursor: string | null;
      hasMore: boolean;
    }>('detections:listByIncident', {
      incidentId,
      paginationOpts: { cursor: query?.cursor ?? null, numItems: clampLimit(query?.limit) },
    });

    return {
      items: (raw?.items ?? []).map((d) => ({
        id: String(d['id'] ?? ''),
        workspaceId: String(d['workspaceId'] ?? ''),
        cameraId: String(d['cameraId'] ?? ''),
        incidentId: d['incidentId'] === null ? null : String(d['incidentId']),
        occurredAt: String(d['occurredAt'] ?? ''),
        receivedAt: String(d['receivedAt'] ?? ''),
        category: String(d['category'] ?? '') as Detection['category'],
        suggestedCategory: String(d['suggestedCategory'] ?? '') as Detection['category'],
        confidence: Number(d['confidence'] ?? 0),
        modelVersion: String(d['modelVersion'] ?? ''),
        detectorVersion: String(d['detectorVersion'] ?? ''),
        evidenceIds: Array.isArray(d['evidenceIds']) ? (d['evidenceIds'] as string[]) : [],
        metadata: d['summary'] === null || d['summary'] === undefined ? {} : { summary: d['summary'] },
      })),
      nextCursor: raw?.nextCursor ?? null,
      hasMore: raw?.hasMore ?? false,
    };
  }
}
