import type { ErrorCode } from '../models/enums';
import type { ApiError, NormalizedError } from '../models/errors';
import { parseApiError } from '../http/response-parsers';

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Sesión expirada. Inicia sesión de nuevo.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'Recurso no encontrado.',
  VALIDATION_ERROR: 'Revisa los campos marcados.',
  CONFLICT: 'El recurso cambió. Se actualizará la vista.',
  IDEMPOTENCY_CONFLICT: 'Operación duplicada con datos distintos.',
  RATE_LIMITED: 'Demasiadas solicitudes. Reintentando…',
  EVIDENCE_UNAVAILABLE: 'Evidencia no disponible en este momento.',
  INTERNAL_ERROR: 'Error interno del servidor.',
};

export function normalizeApiError(httpStatus: number, body: unknown): NormalizedError {
  const parsed = parseApiError(body);
  if (parsed) {
    return {
      code: parsed.code,
      message: parsed.message || DEFAULT_MESSAGES[parsed.code],
      requestId: parsed.requestId,
      fieldErrors: parsed.details,
      httpStatus,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: DEFAULT_MESSAGES.INTERNAL_ERROR,
    requestId: 'unknown',
    httpStatus,
  };
}

export function fallbackError(httpStatus: number): NormalizedError {
  return {
    code: 'INTERNAL_ERROR',
    message: DEFAULT_MESSAGES.INTERNAL_ERROR,
    requestId: 'network',
    httpStatus,
  };
}

export type { ApiError };
