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
import { MOCK_DETECTIONS, MOCK_EVIDENCE, MOCK_INCIDENTS } from '../mock/fixtures';
import type { IncidentRepository } from './incident.repository';

function toSummary(inc: IncidentDetail): IncidentSummary {
  const {
    id,
    workspaceId,
    cameraId,
    category,
    state,
    severity,
    openedAt,
    lastObservedAt,
    assignedToSubjectId,
    version,
  } = inc;
  return {
    id,
    workspaceId,
    cameraId,
    category,
    state,
    severity,
    openedAt,
    lastObservedAt,
    assignedToSubjectId,
    version,
  };
}

export class MockIncidentRepository implements IncidentRepository {
  list(query: ListIncidentsQuery): Promise<Page<IncidentSummary>> {
    let items = MOCK_INCIDENTS.filter((i) => i.workspaceId === query.workspaceId).map(toSummary);
    if (query.cameraId) items = items.filter((i) => i.cameraId === query.cameraId);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  get(id: string): Promise<IncidentDetail> {
    const inc = MOCK_INCIDENTS.find((i) => i.id === id);
    if (!inc) return Promise.reject(new Error('NOT_FOUND'));
    return Promise.resolve(inc);
  }

  triage(id: string, body: TriageRequest): Promise<IncidentDetail> {
    return this.transition(id, 'triaged', body.expectedVersion);
  }

  acknowledge(id: string, body: TransitionRequest): Promise<IncidentDetail> {
    return this.transition(id, 'acknowledged', body.expectedVersion);
  }

  resolve(id: string, body: TransitionRequest): Promise<IncidentDetail> {
    return this.transition(id, 'resolved', body.expectedVersion);
  }

  dismiss(id: string, body: DismissRequest): Promise<IncidentDetail> {
    return this.transition(id, 'dismissed', body.expectedVersion);
  }

  patch(id: string, body: PatchIncidentRequest): Promise<IncidentDetail> {
    const inc = MOCK_INCIDENTS.find((i) => i.id === id);
    if (!inc || body.severity == null) return Promise.reject(new Error('NOT_FOUND'));
    inc.severity = body.severity;
    inc.version = body.expectedVersion + 1;
    return Promise.resolve({ ...inc });
  }

  listDetections(id: string): Promise<Page<Detection>> {
    const inc = MOCK_INCIDENTS.find((i) => i.id === id);
    const items = MOCK_DETECTIONS.filter((d) => inc?.detectionIds.includes(d.id));
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  listEvidence(id: string): Promise<Page<EvidenceDescriptor>> {
    const inc = MOCK_INCIDENTS.find((i) => i.id === id);
    const items = MOCK_EVIDENCE.filter((e) => inc?.evidenceIds.includes(e.id));
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  private transition(id: string, state: IncidentDetail['state'], version: number): Promise<IncidentDetail> {
    const inc = MOCK_INCIDENTS.find((i) => i.id === id);
    if (!inc || inc.version !== version) return Promise.reject(new Error('CONFLICT'));
    inc.state = state;
    inc.version += 1;
    return Promise.resolve({ ...inc });
  }
}
