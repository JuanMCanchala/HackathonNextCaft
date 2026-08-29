import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AUTH_SERVICE } from '../config/injection-tokens';
import { ToastService } from '../errors/toast.service';
import { fallbackError, normalizeApiError } from '../errors/normalized-error';
import type { NormalizedError } from '../models/errors';

export class SentraHttpError extends Error {
  readonly normalized: NormalizedError;

  constructor(normalized: NormalizedError) {
    super(normalized.message);
    this.name = 'SentraHttpError';
    this.normalized = normalized;
  }
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AUTH_SERVICE);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        const normalized = fallbackError(0);
        toast.showError(normalized);
        return throwError(() => new SentraHttpError(normalized));
      }

      const normalized = err.error
        ? normalizeApiError(err.status, err.error)
        : fallbackError(err.status);

      switch (normalized.code) {
        case 'UNAUTHENTICATED':
          auth.logout();
          toast.showError(normalized);
          break;
        case 'FORBIDDEN':
          toast.showError(normalized);
          break;
        case 'NOT_FOUND':
          break;
        case 'VALIDATION_ERROR':
          break;
        case 'CONFLICT':
        case 'IDEMPOTENCY_CONFLICT':
          toast.showInfo(normalized.message);
          break;
        case 'RATE_LIMITED':
          toast.showInfo(normalized.message);
          break;
        case 'EVIDENCE_UNAVAILABLE':
          break;
        case 'INTERNAL_ERROR':
          toast.showError(normalized);
          break;
      }

      return throwError(() => new SentraHttpError(normalized));
    }),
  );
};
