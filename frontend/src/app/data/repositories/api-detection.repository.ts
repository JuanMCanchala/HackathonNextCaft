import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client.service';
import { appendParam } from '../../core/http/query-params';
import type { Detection } from '../../core/models/detection';
import type { Page } from '../../core/models/page';
import type { ListQuery } from '../../core/models/requests';
import { detectionSchema, clampLimit } from '../../core/validation/schemas';
import type { DetectionRepository } from './detection.repository';

@Injectable()
export class ApiDetectionRepository implements DetectionRepository {
  private readonly api = inject(ApiClient);

  listByIncident(incidentId: string, query?: ListQuery): Promise<Page<Detection>> {
    let params = new HttpParams().set('limit', String(clampLimit(query?.limit)));
    params = appendParam(params, 'cursor', query?.cursor);
    return this.api.getPage(`/incidents/${incidentId}/detections`, detectionSchema, params);
  }
}
