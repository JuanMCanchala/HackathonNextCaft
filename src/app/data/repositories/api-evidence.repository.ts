import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client.service';
import { appendParam } from '../../core/http/query-params';
import type { EvidenceAccessGrant, EvidenceDescriptor } from '../../core/models/evidence';
import type { Page } from '../../core/models/page';
import type { EvidenceAccessRequest, ListQuery } from '../../core/models/requests';
import {
  evidenceAccessGrantSchema,
  evidenceDescriptorSchema,
  clampLimit,
} from '../../core/validation/schemas';
import type { EvidenceRepository } from './evidence.repository';

@Injectable()
export class ApiEvidenceRepository implements EvidenceRepository {
  private readonly api = inject(ApiClient);

  listByIncident(incidentId: string, query?: ListQuery): Promise<Page<EvidenceDescriptor>> {
    let params = new HttpParams().set('limit', String(clampLimit(query?.limit)));
    params = appendParam(params, 'cursor', query?.cursor);
    return this.api.getPage(`/incidents/${incidentId}/evidence`, evidenceDescriptorSchema, params);
  }

  requestAccess(evidenceId: string, body: EvidenceAccessRequest): Promise<EvidenceAccessGrant> {
    return this.api.post(`/evidence/${evidenceId}/access`, evidenceAccessGrantSchema, body);
  }
}
