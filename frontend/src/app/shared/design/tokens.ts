/**
 * Tokens de diseño Sentra — fuente de verdad en TypeScript.
 * Los valores visuales viven en `src/styles.css` como `--sentra-*`.
 * Spartan/Helm se mapea vía `--background`, `--primary`, etc. en el mismo archivo.
 */

/** Prefijo CSS de tokens propios (no usar hex sueltos en componentes). */
export const TOKEN_PREFIX = 'sentra' as const;

export const typography = {
  display: 'font-display',
  body: 'font-body',
  mono: 'font-mono',
  pageTitle: 'font-display text-2xl font-semibold tracking-tight text-foreground',
  sectionTitle: 'text-sm font-medium uppercase tracking-wider text-muted-foreground',
  bodySm: 'text-sm text-foreground',
  bodyMuted: 'text-sm text-muted-foreground',
  caption: 'text-xs text-muted-foreground',
  monoXs: 'font-mono text-[10px] text-muted-foreground',
} as const;

export const layout = {
  page: 'mx-auto w-full max-w-7xl space-y-8',
  section: 'space-y-4',
  stackSm: 'flex flex-col gap-2',
  stackMd: 'flex flex-col gap-4',
  row: 'flex flex-wrap items-center gap-2',
  rowBetween: 'flex flex-wrap items-center justify-between gap-4',
} as const;

/** Clases utilitarias alineadas a `styles.css` (@layer components). */
export const surfaces = {
  panel: 'sentra-panel',
  panelElevated: 'sentra-panel-elevated',
  inset: 'sentra-inset',
  divider: 'border-border',
} as const;

export const interactive = {
  focusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  btnPrimary: 'sentra-btn sentra-btn-primary',
  btnSecondary: 'sentra-btn sentra-btn-secondary',
  btnGhost: 'sentra-btn sentra-btn-ghost',
  btnDanger: 'sentra-btn sentra-btn-danger',
  input: 'sentra-input',
} as const;

/** Mapeo dominio → variable CSS (badges, estados). */
export const incidentStateColor: Record<string, string> = {
  detected: 'var(--sentra-severity-high)',
  triaged: 'var(--sentra-warn)',
  acknowledged: 'var(--sentra-signal-cyan)',
  resolved: 'var(--sentra-ok)',
  dismissed: 'var(--sentra-text-low)',
};

export const incidentStateBg: Record<string, string> = {
  detected: 'var(--sentra-warn-dim)',
  triaged: 'var(--sentra-warn-dim)',
  acknowledged: 'var(--sentra-signal-cyan-dim)',
  resolved: 'var(--sentra-ok-dim)',
  dismissed: 'rgba(92, 104, 132, 0.2)',
};

export const severityColor: Record<string, string> = {
  low: 'var(--sentra-severity-low)',
  medium: 'var(--sentra-severity-medium)',
  high: 'var(--sentra-severity-high)',
  critical: 'var(--sentra-severity-critical)',
};

export const connectivityColor: Record<string, string> = {
  online: 'var(--sentra-ok)',
  offline: 'var(--sentra-severity-critical)',
  degraded: 'var(--sentra-warn)',
  unknown: 'var(--sentra-text-low)',
};
