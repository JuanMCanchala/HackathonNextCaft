import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { switchMap, take } from 'rxjs';
import { AUTH_SERVICE, SENTRA_API_BASE } from '../config/injection-tokens';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBase = inject(SENTRA_API_BASE);
  const auth = inject(AUTH_SERVICE);

  if (!req.url.startsWith(apiBase)) {
    return next(req);
  }

  return auth.getToken().pipe(
    take(1),
    switchMap((token) => {
      if (!token) return next(req);
      return next(
        req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        }),
      );
    }),
  );
};
