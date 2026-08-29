import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

export const workspaceGuard: CanActivateFn = async () => {
  const workspace = inject(WorkspaceContextService);
  const router = inject(Router);

  await workspace.resolve();

  if (workspace.workspaceId()) {
    return true;
  }

  if (workspace.workspaces().length > 1) {
    return router.createUrlTree(['/select-workspace']);
  }

  return router.createUrlTree(['/select-workspace']);
};
