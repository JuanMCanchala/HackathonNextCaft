import { Injectable, inject } from '@angular/core';
import type { Detection } from '../../core/models/detection';
import type { Page } from '../../core/models/page';
import type { ListQuery } from '../../core/models/requests';
import type { DetectionRepository } from './detection.repository';

/** Convex MVP: no hay query pública de detections (solo IDs en IncidentDetail). */
@Injectable()
export class ConvexDetectionRepository implements DetectionRepository {
  listByIncident(
    _incidentId: string,
    _query?: ListQuery,
  ): Promise<Page<Detection>> {
    return Promise.resolve({ items: [], nextCursor: null, hasMore: false });
  }
}
