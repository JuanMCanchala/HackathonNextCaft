import { fromRfc3339 } from "../time";

export const CATEGORY_ALLOWLIST = ["intrusion", "smoke", "fall"] as const;

export type NormalizedCategory = (typeof CATEGORY_ALLOWLIST)[number];

export type NormalizeInput = {
  sourceEventId: string;
  sourceNamespace: string;
  timestamp: string;
  category: string;
  suggestedCategory?: string | null | undefined;
  confidence: unknown;
  modelVersion?: string | null | undefined;
  detectorVersion?: string | null | undefined;
  evidenceRefs?: unknown;
};

export type NormalizedObservation = {
  sourceEventId: string;
  sourceNamespace: string;
  category: NormalizedCategory;
  suggestedCategory: string | null;
  confidence: number;
  occurredAtMs: number;
  modelVersion: string;
  detectorVersion: string;
  evidenceRefs: string[];
};

export type NormalizeFailure = {
  path: string;
  message: string;
};

const PRIVILEGED_EVIDENCE =
  /password|secret|api[_-]?key|bearer\s|authorization\s*:/i;

function requireNonEmpty(value: string, path: string): string | NormalizeFailure {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return { path, message: `${path} is required` };
  }
  return trimmed;
}

export function normalizeObservation(
  input: NormalizeInput,
): { ok: true; value: NormalizedObservation } | { ok: false; errors: NormalizeFailure[] } {
  const errors: NormalizeFailure[] = [];

  const sourceEventId = requireNonEmpty(
    typeof input.sourceEventId === "string" ? input.sourceEventId : "",
    "sourceEventId",
  );
  if (typeof sourceEventId !== "string") {
    errors.push(sourceEventId);
  }

  const sourceNamespace = requireNonEmpty(
    typeof input.sourceNamespace === "string" ? input.sourceNamespace : "",
    "sourceNamespace",
  );
  if (typeof sourceNamespace !== "string") {
    errors.push(sourceNamespace);
  }

  let occurredAtMs = 0;
  if (typeof input.timestamp !== "string" || input.timestamp.trim().length < 1) {
    errors.push({ path: "timestamp", message: "timestamp must be RFC3339" });
  } else {
    try {
      occurredAtMs = fromRfc3339(input.timestamp);
    } catch {
      errors.push({ path: "timestamp", message: "timestamp must be RFC3339" });
    }
  }

  let category: NormalizedCategory | null = null;
  if (typeof input.category !== "string") {
    errors.push({ path: "category", message: "category is required" });
  } else {
    const normalized = input.category.trim().toLowerCase();
    if (!(CATEGORY_ALLOWLIST as readonly string[]).includes(normalized)) {
      errors.push({
        path: "category",
        message: `category must be one of: ${CATEGORY_ALLOWLIST.join(", ")}`,
      });
    } else {
      category = normalized as NormalizedCategory;
    }
  }

  let confidence = 0;
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence)) {
    errors.push({
      path: "confidence",
      message: "confidence must be a number in [0, 1]",
    });
  } else if (input.confidence < 0 || input.confidence > 1) {
    errors.push({
      path: "confidence",
      message: "confidence must be a number in [0, 1]",
    });
  } else {
    confidence = input.confidence;
  }

  const modelVersion = requireNonEmpty(
    typeof input.modelVersion === "string" ? input.modelVersion : "",
    "modelVersion",
  );
  if (typeof modelVersion !== "string") {
    errors.push(modelVersion);
  }

  const detectorVersion = requireNonEmpty(
    typeof input.detectorVersion === "string" ? input.detectorVersion : "",
    "detectorVersion",
  );
  if (typeof detectorVersion !== "string") {
    errors.push(detectorVersion);
  }

  const evidenceRefs: string[] = [];
  if (input.evidenceRefs !== undefined && input.evidenceRefs !== null) {
    if (!Array.isArray(input.evidenceRefs)) {
      errors.push({
        path: "evidenceRefs",
        message: "evidenceRefs must be an array of strings",
      });
    } else if (input.evidenceRefs.length > 16) {
      errors.push({
        path: "evidenceRefs",
        message: "evidenceRefs must have at most 16 items",
      });
    } else {
      for (let i = 0; i < input.evidenceRefs.length; i += 1) {
        const ref = input.evidenceRefs[i];
        if (typeof ref !== "string" || ref.trim().length < 1 || ref.length > 512) {
          errors.push({
            path: `evidenceRefs[${i}]`,
            message: "evidence ref must be a non-empty string <= 512 chars",
          });
          continue;
        }
        if (PRIVILEGED_EVIDENCE.test(ref)) {
          errors.push({
            path: `evidenceRefs[${i}]`,
            message: "evidence ref must not contain privileged credentials",
          });
          continue;
        }
        evidenceRefs.push(ref.trim());
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const suggested =
    typeof input.suggestedCategory === "string" &&
    input.suggestedCategory.trim().length > 0
      ? input.suggestedCategory.trim()
      : null;

  return {
    ok: true,
    value: {
      sourceEventId: sourceEventId as string,
      sourceNamespace: sourceNamespace as string,
      category: category as NormalizedCategory,
      suggestedCategory: suggested,
      confidence,
      occurredAtMs,
      modelVersion: modelVersion as string,
      detectorVersion: detectorVersion as string,
      evidenceRefs,
    },
  };
}

/** Canonical payload fingerprint for intake idempotency. */
export function intakePayloadFingerprint(parts: {
  workspaceId: string;
  cameraId: string;
  observation: NormalizedObservation;
}): string {
  return JSON.stringify({
    workspaceId: parts.workspaceId,
    cameraId: parts.cameraId,
    sourceEventId: parts.observation.sourceEventId,
    sourceNamespace: parts.observation.sourceNamespace,
    category: parts.observation.category,
    suggestedCategory: parts.observation.suggestedCategory,
    confidence: parts.observation.confidence,
    occurredAtMs: parts.observation.occurredAtMs,
    modelVersion: parts.observation.modelVersion,
    detectorVersion: parts.observation.detectorVersion,
    evidenceRefs: parts.observation.evidenceRefs,
  });
}
