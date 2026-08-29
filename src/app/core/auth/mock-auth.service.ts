import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import type { AuthService } from './auth.service';
import { AUTH_PROFILE, type AuthProfile } from './auth.service';

const MOCK_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyX29wZXJhdG9yX2RlbW8ifQ.mock';

@Injectable()
export class MockAuthService implements AuthService {
  private readonly _authenticated = signal(true);

  getToken(): Observable<string | null> {
    return of(MOCK_JWT);
  }

  isAuthenticated() {
    return this._authenticated.asReadonly();
  }

  logout(): void {
    this._authenticated.set(false);
  }
}

export const MOCK_AUTH_PROFILE: AuthProfile = {
  subjectId: 'user_operator_demo',
  role: 'operator',
};

export function provideMockAuth() {
  return [
    { provide: MockAuthService, useClass: MockAuthService },
    { provide: AUTH_PROFILE, useValue: MOCK_AUTH_PROFILE },
  ];
}
