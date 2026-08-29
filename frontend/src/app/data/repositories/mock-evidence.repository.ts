import type { EvidenceAccessGrant, EvidenceDescriptor } from '../../core/models/evidence';
import type { Page } from '../../core/models/page';
import type { EvidenceAccessRequest, ListQuery } from '../../core/models/requests';
import { MOCK_EVIDENCE } from '../mock/fixtures';
import type { EvidenceRepository } from './evidence.repository';

export class MockEvidenceRepository implements EvidenceRepository {
  listByIncident(incidentId: string, _query?: ListQuery): Promise<Page<EvidenceDescriptor>> {
    const items = MOCK_EVIDENCE.filter((e) => e.incidentId === incidentId);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  requestAccess(evidenceId: string, body: EvidenceAccessRequest): Promise<EvidenceAccessGrant> {
    const ttl = body.ttlSeconds ?? 120;
    return Promise.resolve({
      evidenceId,
      url: `https://mock.sentra.local/evidence/${evidenceId}`,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      purpose: body.purpose,
    });
  }
}
