export type IncidentState = "detected" | "triaged" | "acknowledged" | "resolved" | "dismissed";

const FROZEN_TARGETS = new Set<IncidentState>(["acknowledged", "resolved", "dismissed"]);

/**
 * MVP freeze: only detected → triaged is allowed.
 * acknowledge / resolve / dismiss remain unavailable.
 */
export function canTransition(from: IncidentState, to: IncidentState): boolean {
  return from === "detected" && to === "triaged";
}

export function assertTransition(from: IncidentState, to: IncidentState): void {
  if (FROZEN_TARGETS.has(to)) {
    throw new Error(`Transition to ${to} is unavailable in MVP`);
  }
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition ${from} → ${to}`);
  }
}
