export const DEFAULT_GROUPING_WINDOW_MS = 45_000;

export type GroupableIncidentState = "detected" | "triaged";

export type GroupCandidate<TId extends string = string> = {
  id: TId;
  workspaceId: string;
  cameraId: string;
  category: string;
  state: string;
  lastObservedAt: number;
};

export type GroupObservation = {
  workspaceId: string;
  cameraId: string;
  category: string;
  occurredAtMs: number;
};

export function isOpenForGrouping(state: string): state is GroupableIncidentState {
  return state === "detected" || state === "triaged";
}

/**
 * Find an open incident to group into. Window is inclusive on both edges
 * relative to the candidate's lastObservedAt. Late events return null
 * (caller creates a new incident while still storing the detection).
 */
export function findGroupingTarget<TId extends string>(
  candidates: ReadonlyArray<GroupCandidate<TId>>,
  observation: GroupObservation,
  windowMs: number = DEFAULT_GROUPING_WINDOW_MS,
): GroupCandidate<TId> | null {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.workspaceId === observation.workspaceId &&
      candidate.cameraId === observation.cameraId &&
      candidate.category === observation.category &&
      isOpenForGrouping(candidate.state) &&
      Math.abs(observation.occurredAtMs - candidate.lastObservedAt) <= windowMs,
  );

  if (eligible.length === 0) {
    return null;
  }

  // Prefer the most recently observed open incident.
  return eligible.reduce((best, current) =>
    current.lastObservedAt > best.lastObservedAt ? current : best,
  );
}
