import type {
  ActorKind,
  Category,
  IncidentState,
  OperationalSeverity,
  TimelineEntryType,
} from './enums';

export interface IncidentSummary {
  id: string;
  workspaceId: string;
  cameraId: string;
  category: Category;
  state: IncidentState;
  severity: OperationalSeverity;
  openedAt: string;
  lastObservedAt: string;
  assignedToSubjectId: string | null;
  version: number;
}

export interface SeverityOverride {
  from: OperationalSeverity;
  to: OperationalSeverity;
  reason: string;
  actorSubjectId: string;
  at: string;
}

export interface IncidentTimelineEntry {
  id: string;
  at: string;
  type: TimelineEntryType;
  actorKind: ActorKind;
  actorId: string | null;
  from?: string | null;
  to?: string | null;
  message?: string | null;
}

export interface IncidentDetail extends IncidentSummary {
  initialSeverity: OperationalSeverity;
  severityOverride: SeverityOverride | null;
  detectionIds: string[];
  evidenceIds: string[];
  timeline: IncidentTimelineEntry[];
}
