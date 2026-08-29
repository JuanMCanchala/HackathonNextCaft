import type { EvidenceKind, EvidenceStatus } from './enums';

export interface EvidenceDescriptor {
  id: string;
  workspaceId: string;
  incidentId: string | null;
  detectionId: string | null;
  kind: EvidenceKind;
  contentType: string;
  capturedAt: string;
  retentionExpiresAt: string | null;
  status: EvidenceStatus;
}

export interface EvidenceAccessGrant {
  evidenceId: string;
  url: string;
  expiresAt: string;
  purpose: string;
}
