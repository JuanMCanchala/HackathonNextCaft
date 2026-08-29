import type { StatsResponse } from '../../core/models/stats';
import type { StatsQuery } from '../../core/models/requests';
import { INCIDENT_STATES, OPERATIONAL_SEVERITIES } from '../../core/models/enums';
import type { StatsRepository } from './stats.repository';

export class MockStatsRepository implements StatsRepository {
  get(workspaceId: string, query: StatsQuery): Promise<StatsResponse> {
    const incidentsByState = Object.fromEntries(INCIDENT_STATES.map((s) => [s, 0])) as StatsResponse['counts']['incidentsByState'];
    const incidentsBySeverity = Object.fromEntries(
      OPERATIONAL_SEVERITIES.map((s) => [s, 0]),
    ) as StatsResponse['counts']['incidentsBySeverity'];

    return Promise.resolve({
      workspaceId,
      from: query.from,
      to: query.to,
      timezone: 'America/Bogota',
      counts: {
        incidentsByState,
        incidentsBySeverity,
        detectionsTotal: 0,
        camerasOnline: 1,
        camerasTotal: 1,
      },
    });
  }
}
