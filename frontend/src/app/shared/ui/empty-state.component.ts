import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmCardComponent, HlmCardContentComponent } from './primitives';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [HlmCardComponent, HlmCardContentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-card class="border-dashed bg-muted/20 p-0 shadow-none">
      <hlm-card-content class="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <div class="text-sm font-medium text-foreground">{{ title() }}</div>
        @if (description()) {
          <p class="max-w-sm text-xs text-muted-foreground">{{ description() }}</p>
        }
      </hlm-card-content>
    </hlm-card>
  `,
})
export class EmptyStateComponent {
  readonly title = input('Sin resultados');
  readonly description = input<string | null>(null);
}
