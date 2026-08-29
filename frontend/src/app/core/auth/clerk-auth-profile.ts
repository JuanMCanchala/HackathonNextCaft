import { inject } from '@angular/core';
import { ClerkService } from 'ngx-clerk';
import type { AuthProfile } from './auth.service';
import type { WorkspaceRole } from '../models/enums';

/** Perfil UI derivado de Clerk (rol amplio para demo; Convex aplica authz real). */
export function provideClerkAuthProfile(): AuthProfile {
  const clerk = inject(ClerkService);
  return {
    get subjectId() {
      return clerk.userId() ?? 'anonymous';
    },
    role: 'workspace_admin' as WorkspaceRole,
  };
}
