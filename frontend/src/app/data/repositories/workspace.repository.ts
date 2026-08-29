import type { ListQuery } from '../../core/models/requests';
import type { Page } from '../../core/models/page';
import type { WorkspaceDetail, WorkspaceSummary } from '../../core/models/workspace';

export interface WorkspaceRepository {
  list(query?: ListQuery): Promise<Page<WorkspaceSummary>>;
  get(id: string): Promise<WorkspaceDetail>;
}
