/** In-memory fixtures mirroring mock-server/db.json (swap target for Mock*Repository). */
import type { Camera } from '../../core/models/camera';
import type { Detection } from '../../core/models/detection';
import type { EvidenceDescriptor } from '../../core/models/evidence';
import type { IncidentDetail } from '../../core/models/incident';
import type { WorkspaceDetail } from '../../core/models/workspace';

export const MOCK_WORKSPACES: WorkspaceDetail[] = [
  {
    id: 'ws_sentra_demo',
    name: 'Sentra Demo — Planta Norte',
    status: 'active',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-08-20T14:30:00Z',
    settings: {
      groupingWindowSeconds: 45,
      retentionDays: 90,
      timezone: 'America/Bogota',
    },
  },
  {
    id: 'ws_sentra_lab',
    name: 'Sentra Lab — QA',
    status: 'active',
    createdAt: '2026-03-01T08:00:00Z',
    updatedAt: '2026-08-25T09:00:00Z',
    settings: {
      groupingWindowSeconds: 30,
      retentionDays: 30,
      timezone: 'America/Bogota',
    },
  },
];

export function getWorkspaceDetail(id: string): WorkspaceDetail | undefined {
  return MOCK_WORKSPACES.find((w) => w.id === id);
}

export const MOCK_CAMERAS: Camera[] = [
  {
    id: 'cam_entrada_principal',
    workspaceId: 'ws_sentra_demo',
    externalId: 'ENT-01',
    label: 'Entrada principal',
    location: 'Acceso norte — lobby',
    adminStatus: 'active',
    connectivity: 'online',
    lastHeartbeatAt: '2026-08-29T17:20:00Z',
    version: 3,
    createdAt: '2026-02-01T12:00:00Z',
    updatedAt: '2026-08-29T17:20:00Z',
  },
];

export const MOCK_INCIDENTS: IncidentDetail[] = [];

export const MOCK_DETECTIONS: Detection[] = [];

export const MOCK_EVIDENCE: EvidenceDescriptor[] = [];
