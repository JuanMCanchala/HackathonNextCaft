import { InjectionToken } from '@angular/core';
import type { IncidentCommand } from '../incidents/incident-state-machine';
import type { IncidentState } from '../models/enums';

/**
 * Capacidad real del backend de producto (Convex MVP vs contrato HTTP completo).
 * Fuente: convex-backend/convex/{workspaces,cameras,incidents}.ts + API-CONTRACT.md
 */
export type BackendProfile = 'convex-mvp' | 'contract-full';

export type DataSource = 'http' | 'convex' | 'memory';

export interface BackendCapabilities {
  profile: BackendProfile;
  /** Auth humana: Clerk JWT → Convex. Mock solo para demos locales. */
  auth: 'clerk' | 'mock';
  /** Transport: Convex queries/mutations o HTTP /v1. */
  transport: 'convex' | 'http' | 'memory';
  /** Transiciones de incidente disponibles en el backend real. */
  incidentCommands: Readonly<Record<IncidentState, readonly IncidentCommand[]>>;
  /** PATCH severidad / override. */
  incidentSeverityPatch: boolean;
  /** Nested GET detections/evidence + POST evidence access. */
  incidentNestedResources: boolean;
  /** GET /v1/stats — no existe en Convex MVP. */
  statsApi: boolean;
  /** Filtros multi state/severity y adminStatus/connectivity en listados. */
  richListFilters: boolean;
  /** create camera expuesto al browser. */
  cameraCreate: boolean;
  /** workspaces.create — onboarding sin seed manual. */
  workspaceCreate: boolean;
}

/** Alineado 1:1 con convex/incidents.ts (solo triage; ack/resolve/dismiss = stubs CONFLICT). */
export const CONVEX_MVP_TRANSITIONS: Readonly<
  Record<IncidentState, readonly IncidentCommand[]>
> = {
  detected: ['triage'],
  triaged: [],
  acknowledged: [],
  resolved: [],
  dismissed: [],
};

/** Contrato HTTP completo (API-CONTRACT / mock histórico). */
export const CONTRACT_FULL_TRANSITIONS: Readonly<
  Record<IncidentState, readonly IncidentCommand[]>
> = {
  detected: ['triage', 'dismiss'],
  triaged: ['acknowledge', 'dismiss'],
  acknowledged: ['resolve', 'dismiss'],
  resolved: [],
  dismissed: [],
};

export function capabilitiesFor(profile: BackendProfile): BackendCapabilities {
  if (profile === 'convex-mvp') {
    return {
      profile,
      auth: 'clerk',
      transport: 'convex',
      incidentCommands: CONVEX_MVP_TRANSITIONS,
      incidentSeverityPatch: false,
      incidentNestedResources: false,
      statsApi: false,
      richListFilters: false,
      cameraCreate: true,
      workspaceCreate: true,
    };
  }
  return {
    profile,
    auth: 'mock',
    transport: 'http',
    incidentCommands: CONTRACT_FULL_TRANSITIONS,
    incidentSeverityPatch: true,
    incidentNestedResources: true,
    statsApi: true,
    richListFilters: true,
    cameraCreate: false,
    workspaceCreate: true,
  };
}

export const BACKEND_CAPABILITIES = new InjectionToken<BackendCapabilities>(
  'BACKEND_CAPABILITIES',
);
