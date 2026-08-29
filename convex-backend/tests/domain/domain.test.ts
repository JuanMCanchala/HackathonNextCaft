import { findGroupingTarget } from "../../convex/lib/domain/group";
import { normalizeObservation, intakePayloadFingerprint } from "../../convex/lib/domain/normalize";
import { resolveSeverity, SEVERITY_RULE_VERSION } from "../../convex/lib/domain/severity";
import { assertTransition, canTransition } from "../../convex/lib/domain/transition";

describe("normalizeObservation", () => {
  const base = {
    sourceEventId: "evt-1",
    sourceNamespace: "model.v1",
    timestamp: "2026-08-29T12:00:00.000Z",
    category: " Fall ",
    confidence: 0.5,
    modelVersion: "gemini-flash",
    detectorVersion: "cascade-1",
  };

  it("accepts confidence 0 and 1, normalizes category, parses RFC3339", () => {
    for (const confidence of [0, 1]) {
      const result = normalizeObservation({ ...base, confidence });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.confidence).toBe(confidence);
      expect(result.value.category).toBe("fall");
      expect(result.value.occurredAtMs).toBe(
        Date.parse("2026-08-29T12:00:00.000Z"),
      );
    }
  });

  it("rejects confidence outside [0,1], bad timestamp, unknown category", () => {
    expect(normalizeObservation({ ...base, confidence: 1.1 }).ok).toBe(false);
    expect(normalizeObservation({ ...base, confidence: -0.01 }).ok).toBe(false);
    expect(normalizeObservation({ ...base, confidence: "0.5" as never }).ok).toBe(
      false,
    );
    expect(normalizeObservation({ ...base, timestamp: "not-a-date" }).ok).toBe(
      false,
    );
    expect(normalizeObservation({ ...base, category: "shoplifting" }).ok).toBe(
      false,
    );
  });

  it("rejects privileged evidence refs", () => {
    const result = normalizeObservation({
      ...base,
      evidenceRefs: ["snapshot://ok", "Bearer super-secret-token"],
    });
    expect(result.ok).toBe(false);
  });

  it("fingerprints are stable for identical payloads", () => {
    const a = normalizeObservation(base);
    const b = normalizeObservation(base);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) {
      return;
    }
    expect(
      intakePayloadFingerprint({
        workspaceId: "ws1",
        cameraId: "cam1",
        observation: a.value,
      }),
    ).toBe(
      intakePayloadFingerprint({
        workspaceId: "ws1",
        cameraId: "cam1",
        observation: b.value,
      }),
    );
  });
});

describe("findGroupingTarget", () => {
  const observation = {
    workspaceId: "ws",
    cameraId: "cam",
    category: "smoke",
    occurredAtMs: 1_000_000,
  };

  it("groups within inclusive 45s window for detected|triaged", () => {
    const target = findGroupingTarget(
      [
        {
          id: "i1",
          workspaceId: "ws",
          cameraId: "cam",
          category: "smoke",
          state: "detected",
          lastObservedAt: 1_000_000 - 45_000,
        },
      ],
      observation,
    );
    expect(target?.id).toBe("i1");

    const triaged = findGroupingTarget(
      [
        {
          id: "i2",
          workspaceId: "ws",
          cameraId: "cam",
          category: "smoke",
          state: "triaged",
          lastObservedAt: 1_000_000,
        },
      ],
      observation,
    );
    expect(triaged?.id).toBe("i2");
  });

  it("late events and terminal states do not group", () => {
    expect(
      findGroupingTarget(
        [
          {
            id: "late",
            workspaceId: "ws",
            cameraId: "cam",
            category: "smoke",
            state: "detected",
            lastObservedAt: 1_000_000 - 45_001,
          },
        ],
        observation,
      ),
    ).toBeNull();

    expect(
      findGroupingTarget(
        [
          {
            id: "resolved",
            workspaceId: "ws",
            cameraId: "cam",
            category: "smoke",
            state: "resolved",
            lastObservedAt: 1_000_000,
          },
        ],
        observation,
      ),
    ).toBeNull();
  });
});

describe("resolveSeverity", () => {
  it("maps sev-v1 categories", () => {
    expect(resolveSeverity("fall")).toEqual({
      severity: "critical",
      ruleVersion: SEVERITY_RULE_VERSION,
    });
    expect(resolveSeverity("smoke")).toEqual({
      severity: "high",
      ruleVersion: SEVERITY_RULE_VERSION,
    });
    expect(resolveSeverity("intrusion")).toEqual({
      severity: "high",
      ruleVersion: SEVERITY_RULE_VERSION,
    });
  });

  it("fails closed for missing rule", () => {
    expect(() => resolveSeverity("unknown")).toThrow(/No severity rule/);
    expect(() => resolveSeverity("fall", "sev-v0")).toThrow(
      /Unknown severity rule/,
    );
  });
});

describe("assertTransition", () => {
  it("allows only detected → triaged", () => {
    expect(canTransition("detected", "triaged")).toBe(true);
    expect(() => assertTransition("detected", "triaged")).not.toThrow();
  });

  it("rejects ack/resolve/dismiss and other paths", () => {
    expect(() => assertTransition("detected", "acknowledged")).toThrow(
      /unavailable/,
    );
    expect(() => assertTransition("detected", "resolved")).toThrow(/unavailable/);
    expect(() => assertTransition("detected", "dismissed")).toThrow(
      /unavailable/,
    );
    expect(() => assertTransition("triaged", "acknowledged")).toThrow(
      /unavailable/,
    );
    expect(() => assertTransition("triaged", "detected")).toThrow(/Invalid/);
  });
});
