import { Injectable } from '@angular/core';
import type { EvidenceAccessGrant, EvidenceDescriptor } from '../../core/models/evidence';
import type { Page } from '../../core/models/page';
import type { EvidenceAccessRequest, ListQuery } from '../../core/models/requests';
import { SentraHttpError } from '../../core/http/error.interceptor';
import type { EvidenceRepository } from './evidence.repository';

/** Convex MVP: evidenceRefs son strings en el detalle; no hay access grant. */
@Injectable()
export class ConvexEvidenceRepository implements EvidenceRepository {
  listByIncident(
    _incidentId: string,
    _query?: ListQuery,
  ): Promise<Page<EvidenceDescriptor>> {
    return Promise.resolve({ items: [], nextCursor: null, hasMore: false });
  }

  requestAccess(_id: string, _body: EvidenceAccessRequest): Promise<EvidenceAccessGrant> {
    return Promise.reject(
      new SentraHttpError({
        code: 'EVIDENCE_UNAVAILABLE',
        message: 'Evidence access grants no están en Convex MVP; usar evidenceIds/refs del detalle',
        requestId: 'convex-mvp',
        httpStatus: 409,
      }),
    );
  }
}
