import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        success: 'border-transparent bg-[var(--sentra-ok-dim)] text-[var(--sentra-ok)]',
        warning: 'border-transparent bg-[var(--sentra-warn-dim)] text-[var(--sentra-warn)]',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
