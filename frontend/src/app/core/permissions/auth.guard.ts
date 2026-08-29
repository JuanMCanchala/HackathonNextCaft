import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AUTH_SERVICE } from '../config/injection-tokens';
import { clerkConfig } from '../../../environments/clerk.config';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AUTH_SERVICE);
  const router = inject(Router);

  if (auth.isAuthenticated()()) {
    return true;
  }

  return router.createUrlTree([clerkConfig.signInUrl]);
};
