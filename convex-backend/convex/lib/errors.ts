import { ConvexError, type Value } from "convex/values";

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "EVIDENCE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof ERROR_CODES)[number];

export type FieldError = {
  path: string;
  message: string;
  code?: string;
};

export type ApiErrorData = {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  details?: FieldError[];
};

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function isApiErrorData(value: unknown): value is ApiErrorData {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    (ERROR_CODES as readonly string[]).includes(record.code) &&
    typeof record.message === "string" &&
    typeof record.requestId === "string" &&
    record.requestId.length > 0
  );
}

export function throwApiError(
  code: ApiErrorCode,
  message: string,
  options?: {
    requestId?: string;
    details?: FieldError[];
  },
): never {
  const data: ApiErrorData = {
    code,
    message,
    requestId: options?.requestId ?? createRequestId(),
  };
  if (options?.details !== undefined) {
    data.details = options.details;
  }
  throw new ConvexError(data as unknown as Value);
}
