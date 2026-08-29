import { InjectionToken, type Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import type { WorkspaceRole } from '../models/enums';

/**
 * Auth adapter (D-3). Nobody imports Clerk directly.
 * getToken() must return a valid token (refresh if applicable) — RF-AUTH-5.
 */
export interface AuthService {
  getToken(): Observable<string | null>;
  isAuthenticated(): Signal<boolean>;
  logout(): void;
}

/** Demo extras used by WorkspaceContext / PermissionService without leaking Clerk. */
export interface AuthProfile {
  subjectId: string;
  role: WorkspaceRole;
}

export const AUTH_PROFILE = new InjectionToken<AuthProfile>('AuthProfile');
