import { fromRfc3339 } from "../time";

// Cubre las cuatro verticales del pipeline de vision. Antes solo entraban
// caidas e invasion de zona, asi que un robo o una agresion confirmados por
// el VLM no llegaban a registrarse en ningun sitio.
export const CATEGORY_ALLOWLIST = [
  "intrusion",
  "smoke",
  "fall",
  "theft",
  "violence",
  "ppe_missing",
] as const;

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

type ParseResult<T> =
  { ok: true; value: T } | { ok: false; errors: ReadonlyArray<NormalizeFailure> };

const PRIVILEGED_EVIDENCE = /password|secret|api[_-]?key|bearer\s|authorization\s*:/i;

function failure(path: string, message: string): ParseResult<never> {
  return { ok: false, errors: [{ path, message }] };
}

function parseRequiredString(value: unknown, path: string): ParseResult<string> {
  if (typeof value !== "string") {
    return failure(path, `${path} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    return failure(path, `${path} is required`);
  }
  return { ok: true, value: trimmed };
}

function parseTimestamp(value: unknown): ParseResult<number> {
  if (typeof value !== "string" || value.trim().length < 1) {
    return failure("timestamp", "timestamp must be RFC3339");
  }
  try {
    return { ok: true, value: fromRfc3339(value) };
  } catch {
    return failure("timestamp", "timestamp must be RFC3339");
  }
}

function parseCategory(value: unknown): ParseResult<NormalizedCategory> {
  if (typeof value !== "string") {
    return failure("category", "category is required");
  }
  const normalized = value.trim().toLowerCase();
  if (!(CATEGORY_ALLOWLIST as readonly string[]).includes(normalized)) {
    return failure("category", `category must be one of: ${CATEGORY_ALLOWLIST.join(", ")}`);
  }
  return { ok: true, value: normalized as NormalizedCategory };
}

function parseConfidence(value: unknown): ParseResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return failure("confidence", "confidence must be a number in [0, 1]");
  }
  if (value < 0 || value > 1) {
    return failure("confidence", "confidence must be a number in [0, 1]");
  }
  return { ok: true, value };
}

function parseEvidenceRef(ref: unknown, index: number): ParseResult<string> {
  const path = `evidenceRefs[${index}]`;
  if (typeof ref !== "string" || ref.trim().length < 1 || ref.length > 512) {
    return failure(path, "evidence ref must be a non-empty string <= 512 chars");
  }
  if (PRIVILEGED_EVIDENCE.test(ref)) {
    return failure(path, "evidence ref must not contain privileged credentials");
  }
  return { ok: true, value: ref.trim() };
}

function parseEvidenceRefs(value: unknown): ParseResult<string[]> {
  if (value === undefined || value === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value)) {
    return failure("evidenceRefs", "evidenceRefs must be an array of strings");
  }
  if (value.length > 16) {
    return failure("evidenceRefs", "evidenceRefs must have at most 16 items");
  }

  const parsed = value.map((ref, index) => parseEvidenceRef(ref, index));
  const errors = parsed.flatMap((result) => (result.ok ? [] : [...result.errors]));
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: parsed.flatMap((result) => (result.ok ? [result.value] : [])),
  };
}

function collectErrors(...results: ReadonlyArray<ParseResult<unknown>>): NormalizeFailure[] {
  return results.flatMap((result) => (result.ok ? [] : [...result.errors]));
}

export function normalizeObservation(
  input: NormalizeInput,
): { ok: true; value: NormalizedObservation } | { ok: false; errors: NormalizeFailure[] } {
  const sourceEventId = parseRequiredString(input.sourceEventId, "sourceEventId");
  const sourceNamespace = parseRequiredString(input.sourceNamespace, "sourceNamespace");
  const occurredAtMs = parseTimestamp(input.timestamp);
  const category = parseCategory(input.category);
  const confidence = parseConfidence(input.confidence);
  const modelVersion = parseRequiredString(input.modelVersion, "modelVersion");
  const detectorVersion = parseRequiredString(input.detectorVersion, "detectorVersion");
  const evidenceRefs = parseEvidenceRefs(input.evidenceRefs);

  const errors = collectErrors(
    sourceEventId,
    sourceNamespace,
    occurredAtMs,
    category,
    confidence,
    modelVersion,
    detectorVersion,
    evidenceRefs,
  );
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (
    !sourceEventId.ok ||
    !sourceNamespace.ok ||
    !occurredAtMs.ok ||
    !category.ok ||
    !confidence.ok ||
    !modelVersion.ok ||
    !detectorVersion.ok ||
    !evidenceRefs.ok
  ) {
    return { ok: false, errors };
  }

  const suggested =
    typeof input.suggestedCategory === "string" && input.suggestedCategory.trim().length > 0
      ? input.suggestedCategory.trim()
      : null;

  return {
    ok: true,
    value: {
      sourceEventId: sourceEventId.value,
      sourceNamespace: sourceNamespace.value,
      category: category.value,
      suggestedCategory: suggested,
      confidence: confidence.value,
      occurredAtMs: occurredAtMs.value,
      modelVersion: modelVersion.value,
      detectorVersion: detectorVersion.value,
      evidenceRefs: evidenceRefs.value,
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
