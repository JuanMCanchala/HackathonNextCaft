import { Injectable, inject } from '@angular/core';
import { ConvexHttpClient } from 'convex/browser';
import { ConvexError } from 'convex/values';
import { anyApi } from 'convex/server';
import { firstValueFrom } from 'rxjs';
import { AUTH_SERVICE, SENTRA_CONVEX_URL } from '../config/injection-tokens';
import { SentraHttpError } from '../http/error.interceptor';
import type { ErrorCode } from '../models/enums';
import type { NormalizedError } from '../models/errors';
import { apiErrorSchema } from '../validation/schemas';

/**
 * Cliente HTTP de Convex (sin React). Auth = Bearer Clerk vía AuthService.getToken().
 * Las funciones se resuelven por path (anyApi) — mismos nombres que convex-backend/convex/*.ts
 */
@Injectable({ providedIn: 'root' })
export class ConvexClientService {
  private readonly auth = inject(AUTH_SERVICE);
  private readonly url = inject(SENTRA_CONVEX_URL);
  private client: ConvexHttpClient | null = null;

  private getClient(): ConvexHttpClient {
    if (!this.url?.trim()) {
      throw this.toSentraError({
        code: 'INTERNAL_ERROR',
        message: 'convexUrl no configurado en environment',
        requestId: 'client',
      });
    }
    if (!this.client) {
      this.client = new ConvexHttpClient(this.url);
    }
    return this.client;
  }

  async query<T>(path: `${string}:${string}`, args: Record<string, unknown>): Promise<T> {
    return this.run(() => this.getClient().query(this.ref(path), args)) as Promise<T>;
  }

  async mutation<T>(path: `${string}:${string}`, args: Record<string, unknown>): Promise<T> {
    return this.run(() => this.getClient().mutation(this.ref(path), args)) as Promise<T>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ref(path: string): any {
    const [mod, fn] = path.split(':');
    // anyApi.<module>.<fn> — tipado laxo a propósito (sin _generated en el front)
    return (anyApi as Record<string, Record<string, unknown>>)[mod]?.[fn] ?? path;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    const token = await firstValueFrom(this.auth.getToken());
    const client = this.getClient();
    if (token) {
      client.setAuth(token);
    } else {
      client.clearAuth();
    }
    try {
      return await fn();
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private mapError(err: unknown): SentraHttpError {
    if (err instanceof ConvexError) {
      const data = err.data;
      const parsed = apiErrorSchema.safeParse(data);
      if (parsed.success) {
        return this.toSentraError(parsed.data);
      }
      if (data && typeof data === 'object' && 'code' in data) {
        const rec = data as Record<string, unknown>;
        return this.toSentraError({
          code: String(rec['code']) as ErrorCode,
          message: String(rec['message'] ?? 'Convex error'),
          requestId: String(rec['requestId'] ?? 'convex'),
        });
      }
    }
    const message = err instanceof Error ? err.message : 'Convex request failed';
    const code: ErrorCode = /unauth|auth/i.test(message) ? 'UNAUTHENTICATED' : 'INTERNAL_ERROR';
    return this.toSentraError({ code, message, requestId: 'convex' });
  }

  private toSentraError(
    partial: Pick<NormalizedError, 'code' | 'message' | 'requestId'>,
  ): SentraHttpError {
    const httpStatus =
      partial.code === 'UNAUTHENTICATED'
        ? 401
        : partial.code === 'FORBIDDEN'
          ? 403
          : partial.code === 'NOT_FOUND'
            ? 404
            : partial.code === 'VALIDATION_ERROR'
              ? 400
              : partial.code === 'CONFLICT' || partial.code === 'IDEMPOTENCY_CONFLICT'
                ? 409
                : partial.code === 'EVIDENCE_UNAVAILABLE'
                  ? 503
                  : 500;
    return new SentraHttpError({
      code: partial.code,
      message: partial.message,
      requestId: partial.requestId,
      httpStatus,
    });
  }
}
