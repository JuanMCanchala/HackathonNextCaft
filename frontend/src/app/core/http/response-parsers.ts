import type { z } from 'zod';
import { apiErrorSchema } from '../validation/schemas';
import { parseOrThrow } from '../validation/parse';
import type { ApiError } from '../models/errors';
import type { Page } from '../models/page';
import { pageSchema } from '../validation/schemas';

export function parsePage<T>(schema: z.ZodType<T>, data: unknown): Page<T> {
  return parseOrThrow(pageSchema(schema), data);
}

export function parseApiError(data: unknown): ApiError | null {
  const result = apiErrorSchema.safeParse(data);
  return result.success ? result.data : null;
}
