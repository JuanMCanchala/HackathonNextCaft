import type { CameraAdminStatus, CameraConnectivity } from './enums';

export interface Camera {
  id: string;
  workspaceId: string;
  externalId: string;
  label: string;
  location: string | null;
  adminStatus: CameraAdminStatus;
  connectivity: CameraConnectivity;
  lastHeartbeatAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}
