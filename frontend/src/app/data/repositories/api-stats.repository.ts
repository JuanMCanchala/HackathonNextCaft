import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client.service';
import { appendParam } from '../../core/http/query-params';
import type { StatsResponse } from '../../core/models/stats';
import type { StatsQuery } from '../../core/models/requests';
import { statsResponseSchema } from '../../core/validation/schemas';
import type { StatsRepository } from './stats.repository';

@Injectable()
export class ApiStatsRepository implements StatsRepository {
  private readonly api = inject(ApiClient);

  get(workspaceId: string, query: StatsQuery): Promise<StatsResponse> {
    let params = new HttpParams()
      .set('workspaceId', workspaceId)
      .set('from', query.from)
      .set('to', query.to);
    params = appendParam(params, 'cameraId', query.cameraId);
    params = appendParam(params, 'category', query.category);
    return this.api.get('/stats', statsResponseSchema, params);
  }
}
