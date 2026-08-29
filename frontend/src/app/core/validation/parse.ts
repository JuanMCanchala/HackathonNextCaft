import { z } from 'zod';
import type { NormalizedError } from '../models/errors';

export class SchemaParseError extends Error {
  readonly normalized: NormalizedError;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SchemaParseError';
    this.normalized = {
      code: 'INTERNAL_ERROR',
      message: 'Respuesta inválida del servidor',
      requestId: 'client-parse',
      httpStatus: 500,
    };
    if (cause) {
      this.cause = cause;
    }
  }
}

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SchemaParseError(result.error.message, result.error);
  }
  return result.data;
}
