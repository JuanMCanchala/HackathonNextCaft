import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ClerkService } from 'ngx-clerk';
import { from, type Observable } from 'rxjs';
import type { AuthService } from './auth.service';
import { clerkConfig } from '../../../environments/clerk.config';

@Injectable()
export class ClerkAuthService implements AuthService {
  private readonly clerk = inject(ClerkService);
  private readonly router = inject(Router);

  getToken(): Observable<string | null> {
    return from(
      this.clerk.getToken({
        template: clerkConfig.jwtApplicationId,
      }),
    );
  }

  isAuthenticated() {
    return this.clerk.isSignedIn;
  }

  logout(): void {
    void this.clerk.signOut().then(() => {
      void this.router.navigateByUrl(clerkConfig.signInUrl);
    });
  }
}
