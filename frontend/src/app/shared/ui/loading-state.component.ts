import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <span
        class="h-4 w-4 animate-pulse rounded-full bg-[var(--sentra-signal-cyan)]"
        aria-hidden="true"
      ></span>
      <span class="text-sm text-[var(--sentra-text-mid)]">{{ message() }}</span>
    </div>
  `,
})
export class LoadingStateComponent {
  readonly message = input('Cargando…');
}
