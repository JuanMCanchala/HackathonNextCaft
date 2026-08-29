import { HttpInterceptorFn } from '@angular/common/http';
import { IDEMPOTENCY_KEY, isMutation } from './http-context';

export const idempotencyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isMutation(req.method)) {
    return next(req);
  }

  const existing = req.headers.get('Idempotency-Key') ?? req.context.get(IDEMPOTENCY_KEY);
  const key = existing ?? crypto.randomUUID();

  return next(
    req.clone({
      setHeaders: { 'Idempotency-Key': key },
    }),
  );
};
