import type { NormalizedCategory } from "./normalize";

// sev-v2 anade robo, agresion y falta de EPP. Se sube la version en vez de
// editar sev-v1 porque la spec exige versionar la politica antes de
// aplicarla: un incidente ya guardado debe seguir explicandose con la regla
// que lo clasifico.
export const SEVERITY_RULE_VERSION = "sev-v2";

export type OperationalSeverity = "low" | "medium" | "high" | "critical";

const SEV_V2: Record<NormalizedCategory, OperationalSeverity> = {
  // Riesgo inmediato para la integridad de una persona.
  fall: "critical",
  violence: "critical",
  smoke: "high",
  intrusion: "high",
  // Perdida economica, sin riesgo para nadie.
  theft: "medium",
  // Incumplimiento a corregir, no una emergencia.
  ppe_missing: "low",
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
  const severity = SEV_V2[category as NormalizedCategory];
  if (severity === undefined) {
    throw new Error(`No severity rule for category: ${category}`);
  }
  return { severity, ruleVersion: SEVERITY_RULE_VERSION };
}
