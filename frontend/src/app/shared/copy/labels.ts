/** RNF-COPY: etiquetas no acusatorias para categorías sensibles. */
const NON_ACCUSATORY: Record<string, string> = {
  'posible robo': 'Posible robo — comportamiento sospechoso detectado',
  'posible altercado': 'Posible altercado — revisar contexto',
  fall: 'Posible caída',
  intrusion: 'Posible intrusión',
  smoke: 'Posible humo / incendio',
  theft: 'Posible robo — comportamiento sospechoso detectado',
  violence: 'Posible altercado — revisar contexto',
  ppe_missing: 'Posible falta de EPP',
  'sin casco': 'Posible falta de EPP (casco)',
};

const STATE_LABELS: Record<string, string> = {
  detected: 'Detectado',
  triaged: 'Clasificado',
  acknowledged: 'En atención',
  resolved: 'Resuelto',
  dismissed: 'Descartado',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

const CONNECTIVITY_LABELS: Record<string, string> = {
  online: 'En línea',
  offline: 'Desconectada',
  degraded: 'Degradada',
  unknown: 'Desconocida',
};

const ADMIN_STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  paused: 'Pausada',
  disabled: 'Deshabilitada',
};

export function categoryLabel(category: string): string {
  return NON_ACCUSATORY[category] ?? category;
}

export function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

export function severityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

export function connectivityLabel(value: string): string {
  return CONNECTIVITY_LABELS[value] ?? value;
}

export function adminStatusLabel(value: string): string {
  return ADMIN_STATUS_LABELS[value] ?? value;
}

export function confidencePercent(confidence: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  return `${pct}%`;
}
