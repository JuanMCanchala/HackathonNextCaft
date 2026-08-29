import { Directive, computed, input } from '@angular/core';
import { cn } from '../../design/cn';
import { buttonVariants, type ButtonVariants } from './button.variants';

/** Botón estilo Helm/shadcn — `button hlmBtn` o `a hlmBtn`. */
@Directive({
  selector: 'button[hlmBtn], a[hlmBtn]',
  standalone: true,
  host: {
    '[class]': 'hostClass()',
  },
})
export class HlmButtonDirective {
  readonly variant = input<ButtonVariants['variant']>('secondary');
  readonly size = input<ButtonVariants['size']>('default');
  readonly userClass = input<string>('', { alias: 'class' });

  readonly hostClass = computed(() =>
    cn(buttonVariants({ variant: this.variant(), size: this.size() }), this.userClass()),
  );
}
