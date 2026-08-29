import { Directive, computed, input } from '@angular/core';
import { cn } from '../../design/cn';

@Directive({
  selector: 'input[hlmInput], textarea[hlmInput], select[hlmInput]',
  standalone: true,
  host: {
    '[class]': 'hostClass()',
  },
})
export class HlmInputDirective {
  readonly userClass = input<string>('', { alias: 'class' });

  readonly hostClass = computed(() =>
    cn(
      'flex min-h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm',
      'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      this.userClass(),
    ),
  );
}
