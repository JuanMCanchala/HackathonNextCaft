import type { Detection } from '../../core/models/detection';
import type { Page } from '../../core/models/page';
import type { ListQuery } from '../../core/models/requests';
import { MOCK_DETECTIONS } from '../mock/fixtures';
import type { DetectionRepository } from './detection.repository';

export class MockDetectionRepository implements DetectionRepository {
  listByIncident(incidentId: string, _query?: ListQuery): Promise<Page<Detection>> {
    const items = MOCK_DETECTIONS.filter((d) => d.incidentId === incidentId);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }
}
