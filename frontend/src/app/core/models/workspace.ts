import type { MembershipStatus, WorkspaceRole, WorkspaceStatus } from './enums';

export interface WorkspaceSummary {
  id: string;
  name: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  settings: {
    groupingWindowSeconds: number;
    retentionDays: number;
    timezone: string;
  };
}

export interface Membership {
  id: string;
  workspaceId: string;
  subjectId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}
