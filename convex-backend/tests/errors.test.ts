import { ERROR_CODES, createRequestId, throwApiError, isApiErrorData } from "../convex/lib/errors";
import { ConvexError } from "convex/values";
import { getApiErrorData } from "./helpers/apiErrorAssert";

describe("lib/errors ApiError", () => {
  it("exposes the stable public error code set", () => {
    expect(ERROR_CODES).toEqual(
      expect.arrayContaining([
        "UNAUTHENTICATED",
        "FORBIDDEN",
        "NOT_FOUND",
        "VALIDATION_ERROR",
        "CONFLICT",
        "IDEMPOTENCY_CONFLICT",
        "RATE_LIMITED",
        "EVIDENCE_UNAVAILABLE",
        "INTERNAL_ERROR",
      ]),
    );
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it("throwApiError raises ConvexError with code, message, and requestId", () => {
    const requestId = "req_test_123";
    try {
      throwApiError("UNAUTHENTICATED", "Authentication required", { requestId });
      throw new Error("unreachable");
    } catch (error) {
      expect(error).toBeInstanceOf(ConvexError);
      const data = getApiErrorData(error);
      expect(data).toEqual({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
        requestId,
      });
      expect(isApiErrorData(data)).toBe(true);
    }
  });

  it("generates a non-empty requestId when none is provided", () => {
    try {
      throwApiError("FORBIDDEN", "Not allowed");
      throw new Error("unreachable");
    } catch (error) {
      const data = getApiErrorData(error);
      expect(data.code).toBe("FORBIDDEN");
      expect(data.requestId.length).toBeGreaterThan(0);
      expect(data.requestId).not.toBe(createRequestId());
    }
  });

  it("includes optional field details for VALIDATION_ERROR", () => {
    try {
      throwApiError("VALIDATION_ERROR", "Invalid input", {
        requestId: "req_validation",
        details: [{ path: "workspaceId", message: "Invalid id" }],
      });
      throw new Error("unreachable");
    } catch (error) {
      const data = getApiErrorData(error);
      expect(data.code).toBe("VALIDATION_ERROR");
      expect(data.details).toEqual([{ path: "workspaceId", message: "Invalid id" }]);
    }
  });
});
