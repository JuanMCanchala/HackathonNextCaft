import type { NormalizedCategory } from "./normalize";

export const SEVERITY_RULE_VERSION = "sev-v1";

export type OperationalSeverity = "low" | "medium" | "high" | "critical";

const SEV_V1: Record<NormalizedCategory, OperationalSeverity> = {
  fall: "critical",
  smoke: "high",
  intrusion: "high",
};

export type SeverityResult = {
  severity: OperationalSeverity;
  ruleVersion: string;
};

/**
 * Resolve initial operational severity from category rules.
 * Missing rule versions fail closed (throw) — never invent a default.
 */
export function resolveSeverity(
  category: string,
  ruleVersion: string = SEVERITY_RULE_VERSION,
): SeverityResult {
  if (ruleVersion !== SEVERITY_RULE_VERSION) {
    throw new Error(`Unknown severity rule version: ${ruleVersion}`);
  }
  const severity = SEV_V1[category as NormalizedCategory];
  if (severity === undefined) {
    throw new Error(`No severity rule for category: ${category}`);
  }
  return { severity, ruleVersion: SEVERITY_RULE_VERSION };
}
