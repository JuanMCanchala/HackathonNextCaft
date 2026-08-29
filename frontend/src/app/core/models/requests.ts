import type {
  CameraAdminStatus,
  CameraConnectivity,
  Category,
  HeartbeatSignal,
  IncidentState,
  OperationalSeverity,
  Scope,
} from './enums';

export interface ListCamerasQuery {
  workspaceId: string;
  adminStatus?: CameraAdminStatus;
  connectivity?: CameraConnectivity;
  cursor?: string;
  limit?: number;
}

export interface CreateCameraRequest {
  workspaceId: string;
  externalId: string;
  label: string;
  location?: string | null;
  adminStatus?: CameraAdminStatus;
  metadata?: Record<string, unknown>;
}

export interface PatchCameraRequest {
  label?: string;
  location?: string | null;
  adminStatus?: CameraAdminStatus;
  metadata?: Record<string, unknown>;
  expectedVersion: number;
}

export interface HeartbeatRequest {
  sourceEventId: string;
  timestamp: string;
  signal?: HeartbeatSignal;
}

export interface ListIncidentsQuery {
  workspaceId: string;
  state?: IncidentState | IncidentState[];
  severity?: OperationalSeverity | OperationalSeverity[];
  cameraId?: string;
  category?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface PatchIncidentRequest {
  severity?: OperationalSeverity;
  reason?: string;
  expectedVersion: number;
}

export interface TriageRequest {
  category?: Category;
  notes?: string;
  assignedToSubjectId?: string | null;
  expectedVersion: number;
}

export interface TransitionRequest {
  reason?: string;
  expectedVersion: number;
}

export interface DismissRequest {
  reason: string;
  expectedVersion: number;
}

export interface EvidenceAccessRequest {
  purpose: string;
  ttlSeconds?: number;
}

export interface StatsQuery {
  from: string;
  to: string;
  cameraId?: string;
  category?: string;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: Scope[];
  expiresAt?: string | null;
}

export interface RevokeApiKeyRequest {
  reason?: string;
}

export interface CreateWebhookRequest {
  workspaceId: string;
  endpointUrl: string;
  eventTypes: string[];
}

export interface ListQuery {
  cursor?: string;
  limit?: number;
}
