import type { StatsResponse } from '../../core/models/stats';
import type { StatsQuery } from '../../core/models/requests';

export interface StatsRepository {
  get(workspaceId: string, query: StatsQuery): Promise<StatsResponse>;
}
