import type { Detection } from '../../core/models/detection';
import type { Page } from '../../core/models/page';
import type { ListQuery } from '../../core/models/requests';

export interface DetectionRepository {
  listByIncident(incidentId: string, query?: ListQuery): Promise<Page<Detection>>;
}
