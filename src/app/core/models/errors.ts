import type { ErrorCode } from './enums';

export interface FieldError {
  path: string;
  message: string;
  code?: string;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: FieldError[];
}

/** Error already mapped by errorInterceptor — components never parse HttpErrorResponse. */
export interface NormalizedError {
  code: ErrorCode;
  message: string;
  requestId: string;
  fieldErrors?: FieldError[];
  httpStatus: number;
}
