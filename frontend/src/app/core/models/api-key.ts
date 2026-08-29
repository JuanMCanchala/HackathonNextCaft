import type { ApiKeyStatus, Scope } from './enums';

export interface ApiKeyMetadata {
  id: string;
  workspaceId: string;
  name: string;
  scopes: Scope[];
  status: ApiKeyStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface ApiKeyCreated extends ApiKeyMetadata {
  secret: string;
}
