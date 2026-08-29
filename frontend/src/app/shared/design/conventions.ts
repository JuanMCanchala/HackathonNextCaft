/**
 * Reglas de diseño Sentra — aplicar en todo componente nuevo o refactorizado.
 */

export const designRules = {
  /** 1. Tokens: nunca hex/rgb inline; usar var(--sentra-*) o clases semánticas Tailwind. */
  tokensOnly: true,

  /** 2. Dark-first; light vía html[data-theme="light"]. */
  darkFirst: true,

  /** 3. Rojo solo en severity critical y offline (RNF-UX-2). */
  redOnlyForCritical: true,

  /** 4. Copy no acusatorio — usar categoryLabel() de shared/copy/labels.ts. */
  nonAccusatoryCopy: true,

  /** 5. Standalone + OnPush en componentes UI. */
  standaloneOnPush: true,

  /** 6. Inputs con input() / output(); estado local con signal(). */
  signalsApi: true,

  /** 7. Clases: componer con cn() desde shared/design/cn.ts. */
  useCnHelper: true,

  /** 8. Primitivos Spartan → prefijo hlm- y carpeta primitives/; dominio mantiene app-*. */
  helmPrefix: 'hlm',
  domainPrefix: 'app',
} as const;

/** Jerarquía tipográfica (clases de tokens.ts). */
export const typeScale = {
  h1: 'typography.pageTitle',
  h2: 'typography.sectionTitle',
  body: 'typography.bodySm',
  muted: 'typography.bodyMuted',
  caption: 'typography.caption',
  mono: 'typography.monoXs',
} as const;

/** Espaciado de página estándar. */
export const spacing = {
  pagePadding: 'p-6',
  sectionGap: 'space-y-8',
  cardPadding: 'p-4',
  inlineGap: 'gap-2',
  stackGap: 'gap-4',
} as const;

/** Radios y elevación (CSS vars). */
export const shape = {
  radius: 'var(--sentra-radius)',
  radiusLg: 'var(--sentra-radius-lg)',
  shadowPanel: 'var(--sentra-shadow-panel)',
} as const;
