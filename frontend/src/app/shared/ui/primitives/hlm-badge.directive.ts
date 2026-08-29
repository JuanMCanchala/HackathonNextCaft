import { Directive, computed, input } from '@angular/core';
import { cn } from '../../design/cn';
import { badgeVariants, type BadgeVariants } from './badge.variants';

/** Badge estilo Helm — `span hlmBadge`. */
@Directive({
  selector: '[hlmBadge]',
  standalone: true,
  host: {
    '[class]': 'hostClass()',
  },
})
export class HlmBadgeDirective {
  readonly variant = input<BadgeVariants['variant']>('default');
  readonly userClass = input<string>('', { alias: 'class' });

  readonly hostClass = computed(() =>
    cn(badgeVariants({ variant: this.variant() }), this.userClass()),
  );
}
