import { Injectable, inject } from '@angular/core';
import { INCIDENT_REPOSITORY } from '../../core/config/injection-tokens';
import type { IncidentState, OperationalSeverity } from '../../core/models/enums';
import { INCIDENT_STATES, OPERATIONAL_SEVERITIES } from '../../core/models/enums';
import type { StatsQuery } from '../../core/models/requests';
import type { StatsResponse } from '../../core/models/stats';
import type { StatsRepository } from './stats.repository';

/**
 * Stats derivados de incidents.list — Convex MVP no tiene GET /stats.
 */
@Injectable()
export class DerivedStatsRepository implements StatsRepository {
  private readonly incidents = inject(INCIDENT_REPOSITORY);

  async get(workspaceId: string, query: StatsQuery): Promise<StatsResponse> {
    const fromMs = Date.parse(query.from);
    const toMs = Date.parse(query.to);

    const incidentsByState = Object.fromEntries(INCIDENT_STATES.map((s) => [s, 0])) as Record<
      IncidentState,
      number
    >;
    const incidentsBySeverity = Object.fromEntries(
      OPERATIONAL_SEVERITIES.map((s) => [s, 0]),
    ) as Record<OperationalSeverity, number>;

    let cursor: string | undefined;
    const cameras = new Set<string>();
    let pages = 0;

    do {
      const page = await this.incidents.list({
        workspaceId,
        cursor,
        limit: 100,
        cameraId: query.cameraId,
        category: query.category,
      });
      for (const item of page.items) {
        const opened = Date.parse(item.openedAt);
        if (Number.isFinite(fromMs) && opened < fromMs) continue;
        if (Number.isFinite(toMs) && opened > toMs) continue;
        incidentsByState[item.state] += 1;
        incidentsBySeverity[item.severity] += 1;
        cameras.add(item.cameraId);
      }
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 20);

    const detectionsTotal = Object.values(incidentsByState).reduce((a, b) => a + b, 0);

    return {
      workspaceId,
      from: query.from,
      to: query.to,
      timezone: 'UTC',
      counts: {
        incidentsByState,
        incidentsBySeverity,
        detectionsTotal,
        camerasOnline: cameras.size,
        camerasTotal: cameras.size,
      },
    };
  }
}
