import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmCardComponent, HlmCardContentComponent } from './primitives';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [HlmCardComponent, HlmCardContentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-card class="border-dashed bg-muted/10 shadow-none">
      <hlm-card-content class="flex items-center justify-center gap-3 py-16" role="status" aria-live="polite">
        <span
          class="h-4 w-4 animate-pulse rounded-full bg-primary shadow-[0_0_12px_var(--primary)]"
          aria-hidden="true"
        ></span>
        <span class="text-sm text-muted-foreground">{{ message() }}</span>
      </hlm-card-content>
    </hlm-card>
  `,
})
export class LoadingStateComponent {
  readonly message = input('Cargando…');
}
