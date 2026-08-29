import { HttpContextToken } from '@angular/common/http';

/** Attach at command construction so retries reuse the same key (contrato §2.4). */
export const IDEMPOTENCY_KEY = new HttpContextToken<string | null>(() => null);

export const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutation(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}
