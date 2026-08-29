import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div class="text-sm text-[var(--sentra-text-mid)]">{{ title() }}</div>
      @if (description()) {
        <p class="max-w-sm text-xs text-[var(--sentra-text-low)]">{{ description() }}</p>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input('Sin resultados');
  readonly description = input<string | null>(null);
}
