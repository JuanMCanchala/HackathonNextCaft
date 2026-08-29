import { Injectable, inject } from '@angular/core';
import { AUTH_PROFILE } from '../auth/auth.service';
import type { WorkspaceRole } from '../models/enums';

/**
 * UI hiding is not authorization — server 403 is still handled by errorInterceptor.
 */
export type PermissionAction =
  | 'camera:write'
  | 'incident:transition'
  | 'incident:severity'
  | 'members:manage'
  | 'apikeys:manage'
  | 'webhooks:manage'
  | 'evidence:access';

const ROLE_ACTIONS: Record<WorkspaceRole, readonly PermissionAction[]> = {
  viewer: ['evidence:access'],
  operator: ['evidence:access', 'incident:transition', 'incident:severity'],
  workspace_admin: [
    'evidence:access',
    'incident:transition',
    'incident:severity',
    'camera:write',
    'members:manage',
    'apikeys:manage',
    'webhooks:manage',
  ],
};

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly profile = inject(AUTH_PROFILE);

  can(action: PermissionAction): boolean {
    return ROLE_ACTIONS[this.profile.role]?.includes(action) ?? false;
  }

  role(): WorkspaceRole {
    return this.profile.role;
  }
}
