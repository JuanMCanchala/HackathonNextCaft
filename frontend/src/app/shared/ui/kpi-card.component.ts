import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  HlmCardComponent,
  HlmCardContentComponent,
  HlmCardDescriptionComponent,
  HlmCardHeaderComponent,
} from './primitives';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  host: { class: 'block h-full' },
  imports: [
    HlmCardComponent,
    HlmCardHeaderComponent,
    HlmCardDescriptionComponent,
    HlmCardContentComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-card class="flex h-full flex-col gap-3 p-5" [attr.aria-label]="label() + ': ' + value()">
      <hlm-card-header class="gap-1 p-0">
        <hlm-card-description class="text-[10px] uppercase tracking-widest">
          {{ label() }}
        </hlm-card-description>
      </hlm-card-header>
      <hlm-card-content class="flex flex-1 flex-col p-0">
        <div
          class="font-display text-3xl font-semibold tracking-tight text-foreground"
          [style.color]="accent() || null"
        >
          {{ value() }}
        </div>
        <div class="mt-2 min-h-[14px] font-mono text-[10px] text-muted-foreground">
          @if (hint()) {
            {{ hint() }}
          }
        </div>
      </hlm-card-content>
    </hlm-card>
  `,
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string | null>(null);
  readonly accent = input<string | null>(null);
}
