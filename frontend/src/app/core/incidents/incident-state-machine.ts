import type { IncidentState } from '../models/enums';

export type IncidentCommand = 'triage' | 'acknowledge' | 'resolve' | 'dismiss';

/**
 * Tabla From → Allowed commands.
 * Default = contrato completo; la UI usa BACKEND_CAPABILITIES.incidentCommands
 * (Convex MVP solo permite triage desde detected).
 */
export const TRANSITIONS: Record<IncidentState, IncidentCommand[]> = {
  detected: ['triage', 'dismiss'],
  triaged: ['acknowledge', 'dismiss'],
  acknowledged: ['resolve', 'dismiss'],
  resolved: [],
  dismissed: [],
};

export function allowedCommands(
  state: IncidentState,
  table: Readonly<Record<IncidentState, readonly IncidentCommand[]>> = TRANSITIONS,
): IncidentCommand[] {
  return [...(table[state] ?? [])];
}

export function canRun(
  state: IncidentState,
  cmd: IncidentCommand,
  table: Readonly<Record<IncidentState, readonly IncidentCommand[]>> = TRANSITIONS,
): boolean {
  return allowedCommands(state, table).includes(cmd);
}

export const COMMAND_RULES = {
  dismiss: { requiresReason: true },
} as const;
