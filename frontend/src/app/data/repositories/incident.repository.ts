import type { Detection } from '../../core/models/detection';
import type { EvidenceDescriptor } from '../../core/models/evidence';
import type { IncidentDetail, IncidentSummary } from '../../core/models/incident';
import type { Page } from '../../core/models/page';
import type {
  DismissRequest,
  ListIncidentsQuery,
  PatchIncidentRequest,
  TransitionRequest,
  TriageRequest,
} from '../../core/models/requests';

export interface IncidentRepository {
  list(query: ListIncidentsQuery): Promise<Page<IncidentSummary>>;
  get(id: string): Promise<IncidentDetail>;
  triage(id: string, body: TriageRequest): Promise<IncidentDetail>;
  acknowledge(id: string, body: TransitionRequest): Promise<IncidentDetail>;
  resolve(id: string, body: TransitionRequest): Promise<IncidentDetail>;
  dismiss(id: string, body: DismissRequest): Promise<IncidentDetail>;
  patch(id: string, body: PatchIncidentRequest): Promise<IncidentDetail>;
  listDetections(id: string, cursor?: string, limit?: number): Promise<Page<Detection>>;
  listEvidence(id: string, cursor?: string, limit?: number): Promise<Page<EvidenceDescriptor>>;
}
