import type { EvidenceAccessGrant, EvidenceDescriptor } from '../../core/models/evidence';
import type { Page } from '../../core/models/page';
import type { EvidenceAccessRequest, ListQuery } from '../../core/models/requests';

export interface EvidenceRepository {
  listByIncident(incidentId: string, query?: ListQuery): Promise<Page<EvidenceDescriptor>>;
  requestAccess(evidenceId: string, body: EvidenceAccessRequest): Promise<EvidenceAccessGrant>;
}
