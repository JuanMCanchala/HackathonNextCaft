import type { IncidentState } from '../models/enums';

export type IncidentCommand = 'triage' | 'acknowledge' | 'resolve' | 'dismiss';

/** Tabla From → Allowed commands (contrato §4 / schemas incidentTransitions). */
export const TRANSITIONS: Record<IncidentState, IncidentCommand[]> = {
  detected: ['triage', 'dismiss'],
  triaged: ['acknowledge', 'dismiss'],
  acknowledged: ['resolve', 'dismiss'],
  resolved: [],
  dismissed: [],
};

export function allowedCommands(state: IncidentState): IncidentCommand[] {
  return TRANSITIONS[state] ?? [];
}

export function canRun(state: IncidentState, cmd: IncidentCommand): boolean {
  return allowedCommands(state).includes(cmd);
}

export const COMMAND_RULES = {
  dismiss: { requiresReason: true },
} as const;
