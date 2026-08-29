import type { Doc, Id } from "../../_generated/dataModel";
import { toRfc3339 } from "../time";

export type OperationalSeverity = "low" | "medium" | "high" | "critical";

export type IncidentState = "detected" | "triaged" | "acknowledged" | "resolved" | "dismissed";

export type IncidentSummaryDto = {
  id: string;
  workspaceId: string;
  cameraId: string;
  category: string;
  state: IncidentState;
  severity: OperationalSeverity;
  openedAt: string;
  lastObservedAt: string;
  assignedToSubjectId: string | null;
  version: number;
};

export type IncidentTimelineEntryDto = {
  id: string;
  at: string;
  type: "state_changed" | "severity_changed" | "detection_linked" | "assignment_changed" | "note";
  actorKind: "user" | "system" | "key" | "ingestion";
  actorId: string | null;
  from: string | null;
  to: string | null;
  message: string | null;
};

export type IncidentDetailDto = IncidentSummaryDto & {
  initialSeverity: OperationalSeverity;
  severityOverride: null | {
    from: OperationalSeverity;
    to: OperationalSeverity;
    reason: string;
    actorSubjectId: string;
    at: string;
  };
  detectionIds: string[];
  evidenceIds: string[];
  timeline: IncidentTimelineEntryDto[];
};

export function toIncidentSummary(doc: Doc<"incidents">): IncidentSummaryDto {
  return {
    id: doc._id,
    workspaceId: doc.workspaceId,
    cameraId: doc.cameraId,
    category: doc.category,
    state: doc.state,
    severity: doc.severity,
    openedAt: toRfc3339(doc.openedAt),
    lastObservedAt: toRfc3339(doc.lastObservedAt),
    assignedToSubjectId: doc.assignedTo ?? null,
    version: doc.version,
  };
}

function mapTimelineType(storedType: string): IncidentTimelineEntryDto["type"] {
  if (storedType === "detection.grouped" || storedType === "detection_linked") {
    return "detection_linked";
  }
  if (storedType === "severity_changed") {
    return "severity_changed";
  }
  if (storedType === "assignment_changed") {
    return "assignment_changed";
  }
  if (storedType === "note") {
    return "note";
  }
  // incident.created, incident.triaged, state_changed, etc.
  return "state_changed";
}

export function toTimelineEntry(doc: Doc<"incidentTimeline">): IncidentTimelineEntryDto {
  const payload =
    doc.payload !== null && typeof doc.payload === "object"
      ? (doc.payload as Record<string, unknown>)
      : {};
  const from =
    typeof payload.from === "string" ? payload.from : doc.type === "incident.created" ? null : null;
  const to =
    typeof payload.to === "string"
      ? payload.to
      : typeof payload.severity === "string"
        ? payload.severity
        : null;
  const message = typeof payload.message === "string" ? payload.message : null;
  const actorKind: IncidentTimelineEntryDto["actorKind"] =
    doc.actorTokenIdentifier !== undefined ? "user" : "system";

  return {
    id: doc._id,
    at: toRfc3339(doc.createdAt),
    type: mapTimelineType(doc.type),
    actorKind,
    actorId: doc.actorTokenIdentifier ?? null,
    from,
    to,
    message,
  };
}

export function toIncidentDetail(
  doc: Doc<"incidents">,
  extras: {
    detectionIds: ReadonlyArray<Id<"detections">>;
    evidenceIds: ReadonlyArray<string>;
    timeline: ReadonlyArray<Doc<"incidentTimeline">>;
  },
): IncidentDetailDto {
  return {
    ...toIncidentSummary(doc),
    initialSeverity: doc.initialSeverity,
    severityOverride: null,
    detectionIds: extras.detectionIds.map((id) => id),
    evidenceIds: [...extras.evidenceIds],
    timeline: extras.timeline.map(toTimelineEntry),
  };
}
