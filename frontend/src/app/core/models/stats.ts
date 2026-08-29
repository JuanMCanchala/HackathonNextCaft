import type { IncidentState, OperationalSeverity } from './enums';

export interface StatsResponse {
  workspaceId: string;
  from: string;
  to: string;
  timezone: string;
  counts: {
    incidentsByState: Record<IncidentState, number>;
    incidentsBySeverity: Record<OperationalSeverity, number>;
    detectionsTotal: number;
    camerasOnline: number;
    camerasTotal: number;
  };
}
