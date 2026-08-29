import { ConvexError } from "convex/values";

export type ExpectedApiError = {
  code: string;
  messageIncludes?: string;
};

export function getApiErrorData(error: unknown): {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
} {
  if (!(error instanceof ConvexError)) {
    throw error;
  }
  const data = error.data as Record<string, unknown>;
  if (
    typeof data.code !== "string" ||
    typeof data.message !== "string" ||
    typeof data.requestId !== "string" ||
    data.requestId.length < 1
  ) {
    throw new Error(`ConvexError data is not ApiError-shaped: ${JSON.stringify(data)}`);
  }
  return {
    code: data.code,
    message: data.message,
    requestId: data.requestId,
    details: data.details,
  };
}

export async function expectApiError(
  promise: Promise<unknown>,
  expected: ExpectedApiError,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ApiError ${expected.code} but promise resolved`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected ApiError")) {
      throw error;
    }
    const data = getApiErrorData(error);
    expect(data.code).toBe(expected.code);
    expect(data.requestId.length).toBeGreaterThan(0);
    if (expected.messageIncludes !== undefined) {
      expect(data.message).toContain(expected.messageIncludes);
    }
  }
}
